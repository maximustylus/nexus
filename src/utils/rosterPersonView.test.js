/**
 * ==============================================================================
 * ROSTER — ONE PERSON'S DUTIES ("My week") · pure unit tests
 * ==============================================================================
 * Runner: Vitest
 * Run:    npx vitest run src/utils/rosterPersonView.test.js
 *
 * `personDutiesInMonth` is the whole of the person view's arithmetic, and every
 * way it can be wrong is a way somebody misses a duty or turns up to one that is
 * not theirs:
 *
 *   1. IDENTITY, NEVER SUBSTRING (post-mortem A4). "Lynn" must not match inside
 *      "Fadzlynn" — that bug removed a colleague from a dropdown for months.
 *   2. THE THIRD PERSON ON A TEAM SHIFT IS ON IT (audit D2). `shift.staff` is a
 *      two-name display string, so a trio's third member is invisible in it; if
 *      this module read `staff` they would never see their own weekend.
 *   3. ONE MONTH, BY STRING PREFIX. No `Date` is built to decide which month a
 *      key belongs to, so there is no zone in which the filter can slide a day.
 *   4. NO TOTAL UNLESS EVERY DUTY'S LENGTH IS KNOWN. A partial total reads as the
 *      month and understates it, which is the direction that makes an overloaded
 *      month look survivable.
 *
 * Pure: no DOM, no mocks, no Firestore. The last section runs the real engine and
 * checks this module against its output rather than against a fixture, so a
 * change in either one has to come past it.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
    monthPrefix,
    personDutiesInMonth,
    personRoleOnShift,
    shiftAssigneeNames,
    taskHoursFromConfig,
} from './rosterPersonView';
import { generateRosterV2 } from './rosterEngineV2';
import { buildShiftStaffLabel } from './auraEngine';

/** A modern two-person shift, exactly the shape both engines write. */
const pairShift = (task, lead, coLead) => ({
    task,
    lead,
    coLead,
    staff: buildShiftStaffLabel(lead, coLead),
    category: 'Clinical',
    week: 1,
    assignees: [lead, coLead],
});

/** A multi-slot trio: three assignees, a two-name display string. */
const trioShift = (task, [lead, coLead, third]) => ({
    task,
    lead,
    coLead,
    staff: buildShiftStaffLabel(lead, coLead),
    category: 'Lab',
    week: 1,
    assignees: [lead, coLead, third],
});

describe('monthPrefix', () => {
    it('pads a 0-based month the way a date key spells it', () => {
        expect(monthPrefix(2026, 0)).toBe('2026-01');
        expect(monthPrefix(2026, 8)).toBe('2026-09');
        expect(monthPrefix(2026, 11)).toBe('2026-12');
    });
});

describe('shiftAssigneeNames', () => {
    it('prefers assignees, so the third person on a trio is not lost', () => {
        expect(shiftAssigneeNames(trioShift('Bench', ['Prin', 'Sen', 'Jun'])))
            .toEqual(['Prin', 'Sen', 'Jun']);
    });

    it('falls back to lead and co-lead for a shift written before assignees existed', () => {
        expect(shiftAssigneeNames({ task: 'Clinic', lead: 'Ada', coLead: 'Bo' })).toEqual(['Ada', 'Bo']);
        expect(shiftAssigneeNames({ task: 'Clinic', lead: 'Ada' })).toEqual(['Ada']);
    });

    it('ignores blanks and duplicates rather than rendering them', () => {
        expect(shiftAssigneeNames({ task: 'X', lead: 'Ada', assignees: ['Ada', '  ', 'Ada', 'Bo'] }))
            .toEqual(['Ada', 'Bo']);
        expect(shiftAssigneeNames(null)).toEqual([]);
    });
});

describe('personRoleOnShift', () => {
    const trio = trioShift('Weekend Witnessing', ['Prin', 'Sen', 'Jun']);

    it('names the lead and the co-lead', () => {
        expect(personRoleOnShift(trio, 'Prin')).toMatchObject({ role: 'lead', label: 'Lead' });
        expect(personRoleOnShift(trio, 'Sen')).toMatchObject({ role: 'coLead', label: 'Co-lead' });
    });

    it('puts the third assignee on their own shift, by position', () => {
        // Audit D2: this is the person whose name is nowhere in `shift.staff`.
        expect(trio.staff).not.toContain('Jun');
        expect(personRoleOnShift(trio, 'Jun')).toMatchObject({
            role: 'assignee',
            label: 'On the team (3 of 3)',
            position: 3,
            teamSize: 3,
        });
    });

    it('is null for somebody who is not on the shift', () => {
        expect(personRoleOnShift(trio, 'Somebody Else')).toBeNull();
        expect(personRoleOnShift(trio, '')).toBeNull();
        expect(personRoleOnShift(trio, undefined)).toBeNull();
        expect(personRoleOnShift(null, 'Prin')).toBeNull();
    });

    it('compares identities, never substrings (post-mortem A4)', () => {
        const shift = pairShift('Clinic', 'Fadzlynn', 'Brandon');
        expect(personRoleOnShift(shift, 'Lynn')).toBeNull();
        expect(personRoleOnShift(shift, 'Fadzlynn')).toMatchObject({ role: 'lead' });
        // …and surrounding whitespace is not a different person.
        expect(personRoleOnShift(shift, '  Fadzlynn ')).toMatchObject({ role: 'lead' });
    });

    it('calls a genuine pre-refactor single-person shift "on duty", not "lead"', () => {
        // `readShiftIdentities` reports a legacy bare-`staff` holder as the lead so
        // the swap flow can act on it. Calling them "Lead" in their own list would
        // invent a co-lead that never existed on that shift.
        expect(personRoleOnShift({ task: 'Old Clinic', staff: 'Brandon' }, 'Brandon'))
            .toMatchObject({ role: 'staff', label: 'On duty' });
    });

    it('does not read an identity back out of a display string', () => {
        // "Lead: Ada, Co: Bo" is a LABEL. A shift carrying only that is a shift with
        // no readable identity, which is what `readShiftIdentities` says about it.
        const label = { task: 'Clinic', staff: 'Lead: Ada, Co: Bo' };
        expect(personRoleOnShift(label, 'Ada')).toBeNull();
    });
});

describe('personDutiesInMonth', () => {
    const roster = {
        '2026-08-31': [pairShift('Ward Round', 'Ada', 'Bo')],          // previous month
        '2026-09-01': [pairShift('Ward Round', 'Ada', 'Bo'), pairShift('Clinic', 'Cy', 'Di')],
        '2026-09-02': [trioShift('Weekend Witnessing', ['Prin', 'Bo', 'Ada'])],
        '2026-09-30': [pairShift('Clinic', 'Bo', 'Ada')],
        '2026-10-01': [pairShift('Ward Round', 'Ada', 'Bo')],          // next month
    };

    it('lists only the chosen person, only the chosen month, in date order', () => {
        const { duties } = personDutiesInMonth({ roster, person: 'Ada', year: 2026, month: 8 });

        expect(duties.map((duty) => duty.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-30']);
        // The 31 Aug and 1 Oct duties are Ada's too, and both are excluded — the
        // filter is the month, not "everything I can find".
        expect(duties.every((duty) => duty.date.startsWith('2026-09-'))).toBe(true);
        // Nobody else's duty is in the list, including the Clinic on the 1st.
        expect(duties.map((duty) => duty.task)).toEqual([
            'Ward Round', 'Weekend Witnessing', 'Clinic',
        ]);
    });

    it('says what each duty is held AS, including a place on a team', () => {
        const { duties } = personDutiesInMonth({ roster, person: 'Ada', year: 2026, month: 8 });
        expect(duties.map((duty) => duty.roleLabel)).toEqual([
            'Lead', 'On the team (3 of 3)', 'Co-lead',
        ]);
    });

    it('names who else is on the shift, and never the person themselves', () => {
        const { duties } = personDutiesInMonth({ roster, person: 'Ada', year: 2026, month: 8 });
        expect(duties[0].alongside).toEqual(['Bo']);
        expect(duties[1].alongside).toEqual(['Prin', 'Bo']);
        for (const duty of duties) expect(duty.alongside).not.toContain('Ada');
    });

    it('is empty — not an error — for a person with nothing on, or no name at all', () => {
        expect(personDutiesInMonth({ roster, person: 'Nobody', year: 2026, month: 8 }).duties).toEqual([]);
        expect(personDutiesInMonth({ roster, person: '', year: 2026, month: 8 }).duties).toEqual([]);
        expect(personDutiesInMonth({ person: 'Ada', year: 2026, month: 8 }).duties).toEqual([]);
        expect(personDutiesInMonth().duties).toEqual([]);
    });

    it('tolerates a malformed day without dropping the rest of the month', () => {
        const messy = { ...roster, '2026-09-15': null, '2026-09-16': [null, pairShift('Clinic', 'Ada', 'Bo')] };
        const { duties } = personDutiesInMonth({ roster: messy, person: 'Ada', year: 2026, month: 8 });
        expect(duties.map((duty) => duty.date)).toEqual([
            '2026-09-01', '2026-09-02', '2026-09-16', '2026-09-30',
        ]);
    });

    it('gives every duty a distinct key, even two of the same task on one day', () => {
        const twice = { '2026-09-01': [pairShift('Clinic', 'Ada', 'Bo'), pairShift('Clinic', 'Ada', 'Cy')] };
        const { duties } = personDutiesInMonth({ roster: twice, person: 'Ada', year: 2026, month: 8 });
        expect(duties).toHaveLength(2);
        expect(new Set(duties.map((duty) => duty.key)).size).toBe(2);
    });

    describe('hours', () => {
        const taskHours = { 'Ward Round': 8, 'Weekend Witnessing': 4, Clinic: 4 };

        it('reads a length only from what the configuration stated', () => {
            const { duties } = personDutiesInMonth({ roster, person: 'Ada', year: 2026, month: 8, taskHours });
            expect(duties.map((duty) => duty.hours)).toEqual([8, 4, 4]);
        });

        it('is null per duty when nothing said how long that task takes', () => {
            const { duties } = personDutiesInMonth({ roster, person: 'Ada', year: 2026, month: 8 });
            expect(duties.map((duty) => duty.hours)).toEqual([null, null, null]);
        });

        it('totals the month only when EVERY duty has a length', () => {
            const all = personDutiesInMonth({ roster, person: 'Ada', year: 2026, month: 8, taskHours });
            expect(all.totalHours).toBe(16);

            // Drop one task's length and the total disappears rather than shrinking:
            // 8 + 4 = 12 would read as Ada's September and be a session short.
            const partial = personDutiesInMonth({
                roster, person: 'Ada', year: 2026, month: 8,
                taskHours: { 'Ward Round': 8, 'Weekend Witnessing': 4 },
            });
            expect(partial.duties.some((duty) => duty.hours === null)).toBe(true);
            expect(partial.totalHours).toBeNull();
        });

        it('rounds a sum of decimals rather than printing float noise', () => {
            const decimals = {
                '2026-09-01': [pairShift('Session', 'Ada', 'Bo')],
                '2026-09-02': [pairShift('Session', 'Ada', 'Bo')],
                '2026-09-03': [pairShift('Session', 'Ada', 'Bo')],
            };
            const { totalHours } = personDutiesInMonth({
                roster: decimals, person: 'Ada', year: 2026, month: 8, taskHours: { Session: 4.2 },
            });
            expect(totalHours).toBe(12.6);
        });

        it('has no total at all when there is nothing on', () => {
            expect(personDutiesInMonth({ roster, person: 'Nobody', year: 2026, month: 8 }).totalHours)
                .toBeNull();
        });
    });
});

describe('taskHoursFromConfig', () => {
    it('carries only the lengths that were actually stated', () => {
        expect(taskHoursFromConfig([
            { name: 'Long Bench', hours: 8 },
            { name: 'Ward Round' },
            { name: 'Half Day', hours: 4.2 },
        ])).toEqual({ 'Long Bench': 8, 'Half Day': 4.2 });
    });

    it('never invents the engine\'s default for a task that did not state one', () => {
        expect(taskHoursFromConfig([{ name: 'Ward Round' }])).toEqual({});
        expect(taskHoursFromConfig([{ name: 'Odd', hours: 'four' }])).toEqual({});
        expect(taskHoursFromConfig([{ hours: 8 }])).toEqual({});
        expect(taskHoursFromConfig(null)).toEqual({});
    });
});

// ─── AGAINST THE REAL ENGINE ──────────────────────────────────────────────────
//
// Everything above works on hand-written shifts, which is what makes the rules
// readable. This section runs `generateRosterV2` and checks the person view
// against its actual output, so neither side can drift without failing here.

describe('over a real generateRosterV2 result', () => {
    const CONFIG = {
        startDate: '2026-09-07',
        weeks: 2,
        staff: [
            { name: 'Prin', fte: 1.0, skills: [], unavailable: [], grade: 'AH16' },
            { name: 'Sen', fte: 1.0, skills: [], unavailable: [], grade: 'AH13' },
            // Jun was AH8, chosen when `junior` meant AH7–AH12. AH7–AH10 is
            // `nonExempt` since the four-band split, so the trio's `{ band: 'junior' }`
            // slot needs a junior AHP.
            { name: 'Jun', fte: 1.0, skills: [], unavailable: [], grade: 'AH12' },
        ],
        tasks: [
            { name: 'Ward Round', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1, hours: 4 },
            {
                name: 'Weekend Witnessing',
                days: [6],
                slots: [{ band: 'principal' }, { band: 'senior' }, { band: 'junior' }],
                hours: 8,
            },
        ],
        // The shipped cut, spelled out. Rewritten for the four-band split — it was an
        // explicit copy of the old three-region default, which is no longer a
        // partition of AH7–AH17 and would be refused.
        rules: {
            bands: { nonExempt: [7, 10], junior: [11, 12], senior: [13, 14], principal: [15, 17] },
            weeklyHours: 42,
        },
    };

    const run = generateRosterV2(CONFIG);

    it('the run itself is what the assertions below assume', () => {
        expect(run.ok).toBe(true);
        expect(run.unfilled).toEqual([]);
    });

    it('finds exactly the duties the engine gave each person, and no others', () => {
        for (const person of ['Prin', 'Sen', 'Jun']) {
            const { duties } = personDutiesInMonth({
                roster: run.roster,
                person,
                year: 2026,
                month: 8,
                taskHours: taskHoursFromConfig(CONFIG.tasks),
            });

            // The engine's own count of what this person holds, derived from the
            // roster rather than from `load` — so this compares two readings of the
            // same document, not a reading against a summary.
            const fromEngine = Object.entries(run.roster)
                .filter(([dateKey]) => dateKey.startsWith('2026-09-'))
                .flatMap(([, shifts]) => shifts)
                .filter((shift) => (shift.assignees || []).includes(person));

            expect(duties).toHaveLength(fromEngine.length);
            expect(duties.every((duty) => duty.hours !== null)).toBe(true);
        }
    });

    it('shows the third assignee of the trio their own Saturday', () => {
        const saturday = Object.entries(run.roster)
            .find(([, shifts]) => shifts.some((shift) => shift.task === 'Weekend Witnessing'));
        expect(saturday).toBeTruthy();
        const [dateKey, shifts] = saturday;
        const witnessing = shifts.find((shift) => shift.task === 'Weekend Witnessing');

        // The engine ranks the trio by grade, so the third assignee is the junior —
        // and `staff` does not mention them.
        const third = witnessing.assignees[2];
        expect(witnessing.staff).not.toContain(third);

        const { duties } = personDutiesInMonth({
            roster: run.roster, person: third, year: 2026, month: 8,
        });
        const theirs = duties.find((duty) => duty.date === dateKey && duty.task === 'Weekend Witnessing');
        expect(theirs).toBeTruthy();
        expect(theirs.role).toBe('assignee');
        expect(theirs.alongside).toEqual(witnessing.assignees.slice(0, 2));
    });

    it('splits the run across two calendar months without a Date in sight', () => {
        // The run starts 7 Sep and is two weeks long, so everything is September;
        // asking for October must therefore be empty rather than "all of it".
        const september = personDutiesInMonth({ roster: run.roster, person: 'Prin', year: 2026, month: 8 });
        const october = personDutiesInMonth({ roster: run.roster, person: 'Prin', year: 2026, month: 9 });
        expect(september.duties.length).toBeGreaterThan(0);
        expect(october.duties).toEqual([]);
    });
});
