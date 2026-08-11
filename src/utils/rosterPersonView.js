/**
 * ==============================================================================
 * ROSTER — ONE PERSON'S DUTIES ("My week"), AS PURE FUNCTIONS
 * ==============================================================================
 *
 * The roster grid answers "who is on today?". It cannot answer "when am I on?",
 * which is the question every clinician actually opens it with — a 31-square
 * matrix of everybody's duties is nobody's mental model of their own job.
 *
 * This module turns a roster document (either universe's — the live
 * `system_data/roster_2026` shape or a `generateRosterV2` result) into ONE
 * PERSON'S list of duties for one calendar month. It is a pure RE-READING of
 * data that is already on screen: no engine call, no Firestore, no dates from
 * `Date.now()`, and nothing here can change a roster.
 *
 * THREE RULES, all load-bearing:
 *
 *   1. IDENTITY, NEVER SUBSTRING. Post-mortem A4: a `staff?.includes(name)` test
 *      matched "Lynn" inside "Fadzlynn" and silently removed a colleague from a
 *      dropdown. Every comparison here is `===` on a trimmed name, and the
 *      lead/co-lead pair is read through `auraEngine`'s own
 *      `readShiftIdentities` — imported, never reimplemented — so this view and
 *      the swap flow cannot disagree about who holds a shift.
 *
 *   2. THE THIRD PERSON ON A SHIFT IS A REAL ASSIGNEE. `shift.staff` is
 *      `buildShiftStaffLabel(lead, coLead)`, a TWO-NAME display string by
 *      contract, so a multi-slot trio's third member appears nowhere in it
 *      (ROSTER_QC_AUDIT_FOUNDATIONS.md D2 — "her name is not on her own shift").
 *      `assignees` is consulted here, which is what makes a team shift show up in
 *      the third person's own list.
 *
 *   3. DATE KEYS ARE STRINGS, AND STAY STRINGS. Selecting one month is a prefix
 *      test on `YYYY-MM-DD`; sorting is a string sort, which is chronological for
 *      that format. No `Date` is constructed to decide which month a key is in,
 *      so there is no zone in which this filter can slide a day (post-mortem
 *      B1/B2). `formatRosterDateKey` in `auraEngine` owns turning a key into
 *      words, and it is UTC-arithmetic on a parsed key for the same reason.
 *
 * WHAT THIS MODULE DELIBERATELY CANNOT DO: say WHICH SLOT of a multi-slot shift
 * a person filled. The engine emits `assignees` ordered by grade — the shape it
 * chose so that `lead`/`coLead` keep working — and does not record which slot
 * entry each person satisfied. So a third assignee is reported as their position
 * on the team, which is a fact, rather than as "junior slot", which would be this
 * module guessing. The component says so on screen.
 * ==============================================================================
 */

import { readShiftIdentities } from './auraEngine';

/** Trimmed name, or `''`. One definition, used by every comparison below. */
const asName = (value) => (typeof value === 'string' ? value.trim() : '');

const pad2 = (value) => String(value).padStart(2, '0');

/**
 * The `YYYY-MM` prefix of a calendar month, from a 0-based month number — the
 * same convention `Date.prototype.getMonth` and this app's `currentDate` use.
 */
export const monthPrefix = (year, month) => `${year}-${pad2(Number(month) + 1)}`;

/**
 * Everybody named on a shift, in the order the shift names them, de-duplicated.
 *
 * `assignees` first because it is the only field that holds a third person;
 * lead/coLead as the fallback for every shift written before it existed.
 */
export const shiftAssigneeNames = (shift) => {
    const listed = Array.isArray(shift?.assignees)
        ? shift.assignees.map(asName).filter((name) => name !== '')
        : [];
    if (listed.length > 0) return [...new Set(listed)];

    const { lead, coLead } = readShiftIdentities(shift);
    return [...new Set([asName(lead), asName(coLead)].filter((name) => name !== ''))];
};

/**
 * What is `person`'s duty on this shift? `null` when they are not on it at all.
 *
 * Returns `{ role, label, position, teamSize }` where `role` is one of
 * `'lead' | 'coLead' | 'assignee' | 'staff'` and `label` is the words to show.
 *
 * `'assignee'` is the multi-slot third-or-later person, labelled by POSITION on
 * the team rather than by slot: see the header note on what this module refuses
 * to guess. `'staff'` is a genuine pre-6-May single-person shift, whose holder is
 * on duty without there having been a co-lead to be the lead of.
 */
export const personRoleOnShift = (shift, person) => {
    const who = asName(person);
    if (who === '' || !shift || typeof shift !== 'object') return null;

    const { lead, coLead, legacy } = readShiftIdentities(shift);
    const team = shiftAssigneeNames(shift);
    const teamSize = team.length;

    if (asName(lead) === who) {
        return legacy
            ? { role: 'staff', label: 'On duty', position: 1, teamSize }
            : { role: 'lead', label: 'Lead', position: 1, teamSize };
    }
    if (asName(coLead) === who) {
        return { role: 'coLead', label: 'Co-lead', position: 2, teamSize };
    }

    const index = team.indexOf(who);
    if (index >= 0) {
        return {
            role: 'assignee',
            label: `On the team (${index + 1} of ${teamSize})`,
            position: index + 1,
            teamSize,
        };
    }

    return null;
};

/**
 * One person's duties in one calendar month, in date order.
 *
 * ```
 * {
 *   duties: [ { date, key, task, category, role, roleLabel, hours, alongside } ],
 *   totalHours,   // null unless EVERY duty's length is known — see below
 * }
 * ```
 *
 * `hours` comes from `taskHours` (a `{ taskName: hours }` map captured from the
 * run that produced this roster) and is `null` when nothing in the configuration
 * said how long that task takes. Live-mode rosters carry no durations at all, so
 * every `hours` is `null` there and the column is simply absent.
 *
 * `totalHours` is `null` unless the length of EVERY listed duty is known. A total
 * summed over the subset with durations would read as this person's month and be
 * short by however many sessions nobody typed a length for — a number that is
 * wrong in the direction that matters (it makes a heavy month look light).
 *
 * `alongside` is everyone else on the same shift, which is the other half of what
 * a roster is for: it says who you are working with, not just when.
 */
export const personDutiesInMonth = ({ roster, person, year, month, taskHours } = {}) => {
    const who = asName(person);
    const source = roster && typeof roster === 'object' ? roster : {};
    const table = taskHours && typeof taskHours === 'object' ? taskHours : {};
    const prefix = `${monthPrefix(year, month)}-`;

    const duties = [];
    if (who === '') return { duties, totalHours: null };

    for (const dateKey of Object.keys(source).sort()) {
        if (typeof dateKey !== 'string' || !dateKey.startsWith(prefix)) continue;
        const shifts = Array.isArray(source[dateKey]) ? source[dateKey] : [];

        shifts.forEach((shift, index) => {
            const held = personRoleOnShift(shift, who);
            if (!held) return;

            const task = asName(shift?.task);
            const hours = typeof table[task] === 'number' && Number.isFinite(table[task])
                ? table[task]
                : null;

            duties.push({
                date: dateKey,
                // Stable within a render: the date plus the shift's index in that
                // day, so two identical duties on one day still get two keys.
                key: `${dateKey}-${index}`,
                task,
                category: asName(shift?.category),
                role: held.role,
                roleLabel: held.label,
                hours,
                alongside: shiftAssigneeNames(shift).filter((name) => name !== who),
            });
        });
    }

    const allKnown = duties.length > 0 && duties.every((duty) => duty.hours !== null);
    const total = duties.reduce((sum, duty) => sum + (duty.hours || 0), 0);

    return {
        duties,
        // Rounded to 2dp so a sum of decimals cannot render as float noise
        // (4.2 + 4.2 + 4.2 = 12.600000000000001).
        totalHours: allKnown ? Math.round(total * 100) / 100 : null,
    };
};

/**
 * A `{ taskName: hours }` map from a generated configuration's task list.
 *
 * Only tasks that STATED a length are in it. A task with no `hours` key is
 * absent rather than present as the engine's 4h default: the default is the
 * engine's business, and printing it beside somebody's duty would be this view
 * asserting a session length the roster master never set.
 */
export const taskHoursFromConfig = (tasks) => {
    const map = {};
    for (const task of Array.isArray(tasks) ? tasks : []) {
        const name = asName(task?.name);
        if (name === '') continue;
        if (typeof task?.hours === 'number' && Number.isFinite(task.hours)) map[name] = task.hours;
    }
    return map;
};
