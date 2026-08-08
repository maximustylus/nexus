/**
 * ==============================================================================
 * AURA ROSTER ENGINE V2 — PSYCHOLOGY PACK, SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest
 * Run:    npm test
 *
 * WHY THIS IS A THIRD SIBLING FILE.
 *
 * Same reason `rosterEngineV2.grades.test.js` is a second one. The 174 tests in
 * `rosterEngineV2.test.js` and the 149 in `rosterEngineV2.grades.test.js` are the
 * COMPATIBILITY GATE for this change: the claim is that a configuration naming
 * neither `recurrence` nor `continuity` behaves exactly as it did before, and a
 * gate is only worth something if it is untouched. `git diff --stat` showing zero
 * changed lines in both is a stronger statement than a diff a reviewer has to read
 * to confirm nothing was softened. All three files run in one command.
 *
 * Everything below is a SPECIFICATION test: a failure is a bug in the engine.
 * Every date, count and quoted string was obtained by running the engine and
 * recording the result — none of it was derived by hand.
 *
 * THE RULES BEING PINNED, in one place:
 *
 *   1. A task's calendar is WEEKLY (`days`) or MONTHLY (`recurrence`), never both.
 *      Monthly means the nth — or last — named weekday of each calendar month.
 *   2. Occurrences are the matching dates INSIDE the generated run. A month whose
 *      occurrence falls outside it contributes nothing, and a run containing no
 *      occurrence generates nothing. Neither is an `unfilled` slot: nothing was
 *      demanded, so nothing failed to be staffed.
 *   3. `'last'` is not `4`. They differ in exactly the months holding five of that
 *      weekday, which is the only reason `'last'` exists.
 *   4. Every existing gate applies to an occurrence's slots unchanged — bands,
 *      skills, leave, capacity, forbidden pairs, consecutive days.
 *   5. `continuity: true` prefers the incumbent for that task's LEAD, ahead of
 *      FTE fairness, and NEVER ahead of a hard constraint. When it yields, the
 *      change is counted (`score.breakdown.continuityBreaks`) and named (a
 *      `warnings` entry saying which dates and, where knowable, why).
 *   6. A continuity task is exempt from the `taskRepetition` penalty, which would
 *      otherwise charge the roster for doing exactly as it was told.
 * ==============================================================================
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildShiftStaffLabel } from './auraEngine';
import {
    generateRosterV2,
    validateRosterV2Config,
    scoreRoster,
    auditHardConstraints,
    recurrenceDatesBetween,
    SOFT_PENALTY_WEIGHTS,
} from './rosterEngineV2';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Every shift, flattened, each tagged with the key it sits under. */
const flatten = (roster) =>
    Object.entries(roster).flatMap(([dateKey, shifts]) =>
        shifts.map((shift) => ({ dateKey, shift })),
    );

const leadsOf = (roster, taskName) =>
    flatten(roster)
        .filter(({ shift }) => shift.task === taskName)
        .map(({ shift }) => shift.lead);

/** `{ dateKey: [lead, …] }` for one task — the shape continuity is read in. */
const leadsByDate = (roster, taskName) => {
    const out = {};
    for (const { dateKey, shift } of flatten(roster)) {
        if (shift.task !== taskName) continue;
        if (!out[dateKey]) out[dateKey] = [];
        out[dateKey].push(shift.lead);
    }
    return out;
};

/**
 * 2026-09-07 is a MONDAY, so no start-date snap warning muddies the assertions.
 * A 20-week run from it ends on 2027-01-24 and spans five calendar months, which
 * is enough to tell a monthly pattern from a weekly one and enough for an
 * incumbency to be broken and resumed inside one roster.
 */
const MONDAY_START = '2026-09-07';
const HORIZON_END = '2027-01-24';
const WEEKS = 20;

/** The five 3rd Wednesdays in that run. Obtained from the engine, not counted. */
const THIRD_WEDNESDAYS = [
    '2026-09-16', '2026-10-21', '2026-11-18', '2026-12-16', '2027-01-20',
];

/** The 3rd Wednesday the leave in these fixtures lands on: the middle one. */
const BROKEN = '2026-11-18';

const THIRD_WEDNESDAY = Object.freeze({ ordinal: 3, weekday: 3 });

/**
 * The department as interviewed: two principals, one senior, one junior. Listed
 * NOT in alphabetical order, so a test that passes because of the fixture's
 * ordering rather than the engine's tie-breakers would show up.
 */
const psychStaff = () => [
    { name: 'Ada', grade: 'AH15' },
    { name: 'Cleo', grade: 'AH16' },
    { name: 'Ben', grade: 'AH13' },
    { name: 'Dara', grade: 'AH9' },
];

/** The interviewed request, verbatim: 3rd Wednesday, principals only, same one. */
const perinatal = (overrides = {}) => ({
    startDate: MONDAY_START,
    weeks: WEEKS,
    staff: psychStaff(),
    tasks: [{
        name: 'Perinatal Clinic',
        recurrence: THIRD_WEDNESDAY,
        leadBands: ['principal'],
        continuity: true,
        leads: 1,
        coLeads: 1,
    }],
    ...overrides,
});

afterEach(() => {
    vi.useRealTimers();
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. recurrenceDatesBetween — THE ONE DEFINITION OF "WHEN DOES IT RUN"
// ═════════════════════════════════════════════════════════════════════════════

describe('recurrenceDatesBetween', () => {
    it('finds the 3rd Wednesday of every month across a five-month span', () => {
        expect(recurrenceDatesBetween(THIRD_WEDNESDAY, MONDAY_START, HORIZON_END))
            .toEqual(THIRD_WEDNESDAYS);
    });

    it('gets the 3rd Wednesday right in a month that opens on a Wednesday', () => {
        // 2026-07-01 is a Wednesday, so the 3rd is the 15th — the off-by-one that
        // a `1 + ((weekday - firstWeekday + 7) % 7)` slip would put on the 22nd.
        expect(recurrenceDatesBetween(THIRD_WEDNESDAY, '2026-07-01', '2026-07-31'))
            .toEqual(['2026-07-15']);
    });

    it('is inclusive of both bounds', () => {
        expect(recurrenceDatesBetween(THIRD_WEDNESDAY, '2026-09-16', '2026-09-16'))
            .toEqual(['2026-09-16']);
        expect(recurrenceDatesBetween(THIRD_WEDNESDAY, '2026-09-17', '2026-10-20')).toEqual([]);
    });

    it('walks a full year without skipping or repeating a month', () => {
        const year = recurrenceDatesBetween(THIRD_WEDNESDAY, '2026-01-05', '2027-01-03');
        expect(year).toEqual([
            '2026-01-21', '2026-02-18', '2026-03-18', '2026-04-15',
            '2026-05-20', '2026-06-17', '2026-07-15', '2026-08-19',
            '2026-09-16', '2026-10-21', '2026-11-18', '2026-12-16',
        ]);
        expect(new Set(year.map((key) => key.slice(0, 7))).size).toBe(12);
    });

    it('crosses a year boundary', () => {
        expect(recurrenceDatesBetween(THIRD_WEDNESDAY, '2026-12-01', '2027-01-31'))
            .toEqual(['2026-12-16', '2027-01-20']);
    });

    it.each([
        [1, '2026-02-01'], [2, '2026-02-08'], [3, '2026-02-15'], [4, '2026-02-22'],
    ])('places ordinal %i of a weekday a clean seven days after the one before', (ordinal, expected) => {
        // February 2026 opens ON a Sunday, so the four Sundays are the 1st, 8th,
        // 15th and 22nd, and `'last'` is the 22nd too — see the next test.
        expect(recurrenceDatesBetween({ ordinal, weekday: 0 }, '2026-02-01', '2026-02-28'))
            .toEqual([expected]);
    });

    it('finds the 1st and the last of every weekday in one month', () => {
        // February 2026 runs Sunday 1 to Saturday 28: exactly four of each
        // weekday, so the firsts are the 1st–7th and the lasts the 22nd–28th.
        expect([0, 1, 2, 3, 4, 5, 6].map(
            (weekday) => recurrenceDatesBetween({ ordinal: 1, weekday }, '2026-02-01', '2026-02-28')[0],
        )).toEqual([
            '2026-02-01', '2026-02-02', '2026-02-03', '2026-02-04',
            '2026-02-05', '2026-02-06', '2026-02-07',
        ]);
        expect([0, 1, 2, 3, 4, 5, 6].map(
            (weekday) => recurrenceDatesBetween({ ordinal: 'last', weekday }, '2026-02-01', '2026-02-28')[0],
        )).toEqual([
            '2026-02-22', '2026-02-23', '2026-02-24', '2026-02-25',
            '2026-02-26', '2026-02-27', '2026-02-28',
        ]);
    });

    it('handles a leap February', () => {
        // 2028-02-29 is a Tuesday, so the last Tuesday IS the 29th, and the last
        // Friday is the 25th.
        expect(recurrenceDatesBetween({ ordinal: 'last', weekday: 2 }, '2028-02-01', '2028-02-29'))
            .toEqual(['2028-02-29']);
        expect(recurrenceDatesBetween({ ordinal: 'last', weekday: 5 }, '2028-02-01', '2028-02-29'))
            .toEqual(['2028-02-25']);
    });

    it('is deterministic and pure — it mutates neither argument', () => {
        const recurrence = { ordinal: 3, weekday: 3 };
        const snapshot = JSON.stringify(recurrence);
        const first = recurrenceDatesBetween(recurrence, MONDAY_START, HORIZON_END);
        const second = recurrenceDatesBetween(recurrence, MONDAY_START, HORIZON_END);
        expect(JSON.stringify(recurrence)).toBe(snapshot);
        expect(first).toEqual(second);
    });

    it.each([
        ['a null recurrence', null, MONDAY_START, HORIZON_END],
        ['an undefined recurrence', undefined, MONDAY_START, HORIZON_END],
        ['a string recurrence', 'monthly', MONDAY_START, HORIZON_END],
        ['an ordinal of 5', { ordinal: 5, weekday: 3 }, MONDAY_START, HORIZON_END],
        ['an ordinal of 0', { ordinal: 0, weekday: 3 }, MONDAY_START, HORIZON_END],
        ['a stringly ordinal', { ordinal: '3', weekday: 3 }, MONDAY_START, HORIZON_END],
        ['a weekday of 7', { ordinal: 3, weekday: 7 }, MONDAY_START, HORIZON_END],
        ['a fractional weekday', { ordinal: 3, weekday: 3.5 }, MONDAY_START, HORIZON_END],
        ['a missing weekday', { ordinal: 3 }, MONDAY_START, HORIZON_END],
        ['an unreal start', THIRD_WEDNESDAY, '2026-02-30', HORIZON_END],
        ['a malformed end', THIRD_WEDNESDAY, MONDAY_START, 'soon'],
        ['a backwards range', THIRD_WEDNESDAY, HORIZON_END, MONDAY_START],
    ])('returns [] for %s rather than throwing or guessing', (_label, recurrence, from, to) => {
        expect(recurrenceDatesBetween(recurrence, from, to)).toEqual([]);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. 'last' IS NOT 4 — the whole reason the ordinal exists
// ═════════════════════════════════════════════════════════════════════════════

describe("recurrenceDatesBetween — 'last' versus 4", () => {
    it('agrees with 4 in a month holding four of the weekday', () => {
        // October 2026 has four Wednesdays: 7, 14, 21, 28.
        expect(recurrenceDatesBetween({ ordinal: 4, weekday: 3 }, '2026-10-01', '2026-10-31'))
            .toEqual(['2026-10-28']);
        expect(recurrenceDatesBetween({ ordinal: 'last', weekday: 3 }, '2026-10-01', '2026-10-31'))
            .toEqual(['2026-10-28']);
    });

    it('diverges by a week in a month holding five', () => {
        // September 2026 has five Wednesdays: 2, 9, 16, 23, 30.
        expect(recurrenceDatesBetween({ ordinal: 4, weekday: 3 }, '2026-09-01', '2026-09-30'))
            .toEqual(['2026-09-23']);
        expect(recurrenceDatesBetween({ ordinal: 'last', weekday: 3 }, '2026-09-01', '2026-09-30'))
            .toEqual(['2026-09-30']);
    });

    it('diverges in some months of a five-month run and not others', () => {
        const fourth = recurrenceDatesBetween({ ordinal: 4, weekday: 3 }, '2026-09-01', '2027-01-31');
        const last = recurrenceDatesBetween({ ordinal: 'last', weekday: 3 }, '2026-09-01', '2027-01-31');

        expect(fourth).toEqual(['2026-09-23', '2026-10-28', '2026-11-25', '2026-12-23', '2027-01-27']);
        expect(last).toEqual(['2026-09-30', '2026-10-28', '2026-11-25', '2026-12-30', '2027-01-27']);

        // Two of the five months hold a fifth Wednesday; three do not.
        const differing = fourth.filter((key, i) => key !== last[i]);
        expect(differing).toEqual(['2026-09-23', '2026-12-23']);
    });

    it('shows the divergence in a generated roster, not only in the helper', () => {
        const config = (ordinal) => ({
            startDate: MONDAY_START,
            weeks: 5, // 2026-09-07 to 2026-10-11: September only
            staff: [{ name: 'Ada' }, { name: 'Ben' }],
            tasks: [{ name: 'Clinic', recurrence: { ordinal, weekday: 3 }, leads: 1, coLeads: 0 }],
        });

        expect(Object.keys(generateRosterV2(config(4)).roster)).toEqual(['2026-09-23']);
        expect(Object.keys(generateRosterV2(config('last')).roster)).toEqual(['2026-09-30']);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. VALIDATION — recurrence
// ═════════════════════════════════════════════════════════════════════════════

describe('validateRosterV2Config — recurrence', () => {
    const withTask = (task) => ({
        startDate: MONDAY_START,
        weeks: 1,
        staff: [{ name: 'Ada' }],
        tasks: [{ name: 'Clinic', ...task }],
    });

    it.each([1, 2, 3, 4, 'last'])('accepts the ordinal %s', (ordinal) => {
        expect(validateRosterV2Config(withTask({ recurrence: { ordinal, weekday: 3 } })))
            .toEqual({ valid: true, reason: null });
    });

    it.each([0, 1, 2, 3, 4, 5, 6])('accepts the weekday %i', (weekday) => {
        expect(validateRosterV2Config(withTask({ recurrence: { ordinal: 1, weekday } })).valid).toBe(true);
    });

    it.each([
        ['undefined', undefined],
        ['null', null],
    ])('treats %s as "this task repeats weekly"', (_label, recurrence) => {
        expect(validateRosterV2Config(withTask({ recurrence })).valid).toBe(true);
    });

    it('refuses a task carrying BOTH days and recurrence', () => {
        const result = validateRosterV2Config(withTask({ days: [3], recurrence: THIRD_WEDNESDAY }));
        expect(result.valid).toBe(false);
        expect(result.reason).toBe(
            'Task Clinic sets both days and recurrence — a task repeats either weekly (days) or monthly (recurrence), never both. Remove whichever one is not meant.',
        );
    });

    it('counts an EMPTY days list as set, because that is a half-finished edit', () => {
        // `days: []` next to a monthly pattern is the shape a UI leaves behind
        // when somebody switches a weekly task to monthly and the old field is
        // not cleared. Silently preferring one of the two would make the ignored
        // field a trap.
        expect(validateRosterV2Config(withTask({ days: [], recurrence: THIRD_WEDNESDAY })).reason)
            .toMatch(/sets both days and recurrence/);
    });

    it.each([
        ['5, which most months do not have', 5],
        ['0', 0],
        ['-1', -1],
        ['a stringly 3', '3'],
        ['a capitalised LAST', 'LAST'],
        ['a fractional 2.5', 2.5],
        ['absent', undefined],
        ['null', null],
        ['true', true],
    ])('refuses the ordinal %s', (_label, ordinal) => {
        const result = validateRosterV2Config(withTask({ recurrence: { ordinal, weekday: 3 } }));
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/recurrence ordinal is/);
        expect(result.reason).toMatch(/use 1, 2, 3, 4, or 'last' for the final one of the month/);
    });

    it('says why 5 is not accepted, rather than silently meaning "last"', () => {
        expect(validateRosterV2Config(withTask({ recurrence: { ordinal: 5, weekday: 3 } })).reason)
            .toBe("Task Clinic's recurrence ordinal is 5 — use 1, 2, 3, 4, or 'last' for the final one of the month (most months have no 5th weekday).");
    });

    it.each([
        ['7', 7],
        ['-1', -1],
        ['3.5', 3.5],
        ['a stringly 3', '3'],
        ['absent', undefined],
        ['null', null],
    ])('refuses the weekday %s', (_label, weekday) => {
        const result = validateRosterV2Config(withTask({ recurrence: { ordinal: 3, weekday } }));
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/recurrence weekday is/);
        expect(result.reason).toMatch(/whole numbers 0 \(Sunday\) to 6 \(Saturday\)/);
    });

    it.each([
        ['a string', 'monthly'],
        ['an array', [3, 3]],
        ['a number', 3],
        ['true', true],
    ])('refuses a recurrence given as %s', (_label, recurrence) => {
        const result = validateRosterV2Config(withTask({ recurrence }));
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/recurrence must be an object of the form \{ ordinal: 3, weekday: 3 \}/);
    });

    it('refuses through generateRosterV2, returning nothing but ok and reason', () => {
        const result = generateRosterV2(withTask({ days: [3], recurrence: THIRD_WEDNESDAY }));
        expect(result.ok).toBe(false);
        expect(Object.keys(result).sort()).toEqual(['ok', 'reason']);
    });

    it('leaves every existing task check in force alongside recurrence', () => {
        expect(validateRosterV2Config(withTask({ recurrence: THIRD_WEDNESDAY, leads: 0 })).reason)
            .toMatch(/has leads: 0/);
        expect(validateRosterV2Config(withTask({ recurrence: THIRD_WEDNESDAY, requiresSkill: 'Nope' })).reason)
            .toMatch(/which nobody in the staff pool holds/);
        expect(validateRosterV2Config(withTask({ recurrence: THIRD_WEDNESDAY, leadBands: [] })).reason)
            .toMatch(/leadBands: \[\]/);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. VALIDATION — continuity
// ═════════════════════════════════════════════════════════════════════════════

describe('validateRosterV2Config — continuity', () => {
    const withContinuity = (continuity) => ({
        startDate: MONDAY_START,
        weeks: 1,
        staff: [{ name: 'Ada' }],
        tasks: [{ name: 'Clinic', continuity }],
    });

    it.each([
        ['true', true],
        ['false', false],
        ['undefined', undefined],
        ['null', null],
    ])('accepts %s', (_label, continuity) => {
        expect(validateRosterV2Config(withContinuity(continuity)).valid).toBe(true);
    });

    it.each([
        ['a truthy string', 'yes'],
        ['a 1', 1],
        ['a 0', 0],
        ['an object', {}],
        ['an array', [true]],
    ])('refuses %s rather than coercing it', (_label, continuity) => {
        // `continuity: 'yes'` is truthy. A typo must not be able to decide who
        // leads a clinic for a year.
        const result = validateRosterV2Config(withContinuity(continuity));
        expect(result.valid).toBe(false);
        expect(result.reason).toBe(
            "Task Clinic's continuity must be true or false — true asks for the same lead on every occurrence of the task.",
        );
    });

    it('does not require recurrence — a weekly task may ask for continuity too', () => {
        expect(validateRosterV2Config({
            startDate: MONDAY_START,
            weeks: 1,
            staff: [{ name: 'Ada' }],
            tasks: [{ name: 'Handover', days: [1, 2, 3, 4, 5], continuity: true }],
        }).valid).toBe(true);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. MONTHLY OCCURRENCES, END TO END
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — a monthly task runs monthly', () => {
    it('appears on exactly the 3rd Wednesdays inside the run', () => {
        const { roster } = generateRosterV2(perinatal());
        expect(Object.keys(roster)).toEqual(THIRD_WEDNESDAYS);
    });

    it('does NOT fall back to the default Mon–Fri, and not to every Wednesday', () => {
        // The failure this replaces: `days` defaulting behind `recurrence` would
        // run the clinic 100 times in 20 weeks instead of 5.
        const { roster } = generateRosterV2(perinatal());
        expect(Object.keys(roster)).toHaveLength(5);
        expect(roster['2026-09-09']).toBeUndefined(); // the 2nd Wednesday
        expect(roster['2026-09-23']).toBeUndefined(); // the 4th
        expect(roster['2026-09-07']).toBeUndefined(); // the Monday it starts on
    });

    it('carries the ordinary shift shape, so the exports read it unchanged', () => {
        const { roster } = generateRosterV2(perinatal());
        const shift = roster['2026-09-16'][0];

        expect(shift).toEqual({
            task: 'Perinatal Clinic',
            lead: 'Ada',
            coLead: 'Ben',
            staff: buildShiftStaffLabel('Ada', 'Ben'),
            category: 'CORE',
            week: 2,
            assignees: ['Ada', 'Ben'],
        });
    });

    it('numbers the week from the run, not from the month', () => {
        const { roster } = generateRosterV2(perinatal());
        expect(THIRD_WEDNESDAYS.map((key) => roster[key][0].week)).toEqual([2, 7, 11, 15, 20]);
    });

    it('picks up both months when the horizon straddles a boundary', () => {
        const result = generateRosterV2({
            startDate: '2026-09-14',
            weeks: 6, // 2026-09-14 to 2026-10-25
            staff: [{ name: 'Ada' }, { name: 'Ben' }],
            tasks: [{ name: 'Clinic', recurrence: THIRD_WEDNESDAY, leads: 1, coLeads: 0 }],
        });
        expect(Object.keys(result.roster)).toEqual(['2026-09-16', '2026-10-21']);
        expect(result.warnings).toEqual([]);
    });

    it('drops a month whose occurrence falls outside the horizon, silently and correctly', () => {
        // 2026-09-17 is the day after the September occurrence: the run opens too
        // late for it and closes before October's.
        const result = generateRosterV2({
            startDate: '2026-09-21',
            weeks: 4, // 2026-09-21 to 2026-10-18, no 3rd Wednesday in it
            staff: [{ name: 'Ada' }],
            tasks: [{ name: 'Clinic', recurrence: THIRD_WEDNESDAY, leads: 1, coLeads: 0 }],
        });
        expect(result.roster).toEqual({});
        expect(result.unfilled).toEqual([]);
    });

    it('runs alongside a weekly task without either borrowing the other`s calendar', () => {
        const { roster } = generateRosterV2({
            startDate: MONDAY_START,
            weeks: 3,
            staff: [{ name: 'Ada' }, { name: 'Ben' }],
            tasks: [
                { name: 'Weekly', days: [3], leads: 1, coLeads: 0 },
                { name: 'Monthly', recurrence: THIRD_WEDNESDAY, leads: 1, coLeads: 0 },
            ],
        });

        expect(Object.keys(roster)).toEqual(['2026-09-09', '2026-09-16', '2026-09-23']);
        expect(leadsOf(roster, 'Weekly')).toHaveLength(3);
        expect(leadsOf(roster, 'Monthly')).toHaveLength(1);
        expect(Object.keys(leadsByDate(roster, 'Monthly'))).toEqual(['2026-09-16']);
    });
});

describe('generateRosterV2 — a horizon with no occurrence in it', () => {
    const tooShort = () => ({
        startDate: MONDAY_START,
        weeks: 1, // 2026-09-07 to 2026-09-13; the occurrence is the 16th
        staff: [{ name: 'Ada' }],
        tasks: [{ name: 'Perinatal Clinic', recurrence: THIRD_WEDNESDAY, leads: 1, coLeads: 0 }],
    });

    it('generates nothing at all', () => {
        expect(generateRosterV2(tooShort()).roster).toEqual({});
    });

    it('reports NO unfilled slot — nothing was ever demanded', () => {
        // The distinction the engine exists to make: an unfilled slot is a duty
        // nobody could cover. A month that is not in the run asked for nothing.
        expect(generateRosterV2(tooShort()).unfilled).toEqual([]);
    });

    it('warns instead, naming the pattern and the window it looked in', () => {
        expect(generateRosterV2(tooShort()).warnings).toEqual([
            'Task Perinatal Clinic runs on the 3rd Wednesday of each month, and no such date falls between 2026-09-07 and 2026-09-13, so it will never appear in this roster. Generate a longer run, or one that covers an occurrence.',
        ]);
    });

    it('stops warning as soon as the run reaches an occurrence', () => {
        const result = generateRosterV2({ ...tooShort(), weeks: 2 });
        expect(result.warnings).toEqual([]);
        expect(Object.keys(result.roster)).toEqual(['2026-09-16']);
    });

    it('does not confuse it with the weekly "no days selected" warning', () => {
        const monthly = generateRosterV2(tooShort()).warnings;
        expect(monthly.filter((w) => /has no days selected/.test(w))).toEqual([]);

        const weekly = generateRosterV2({
            startDate: MONDAY_START,
            weeks: 1,
            staff: [{ name: 'Ada' }],
            tasks: [{ name: 'Never', days: [] }],
        }).warnings;
        expect(weekly).toEqual(['Task Never has no days selected, so it will never appear in the roster.']);
    });

    it('leaves the score clean and the audit empty', () => {
        const result = generateRosterV2(tooShort());
        expect(result.score.hardViolations).toBe(0);
        expect(result.score.softPenalty).toBe(0);
        expect(auditHardConstraints(result.roster, tooShort()).violations).toEqual([]);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. EVERY GATE STILL APPLIES TO AN OCCURRENCE
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — bands, skills and rules compose with recurrence', () => {
    it('only ever gives the principals-only clinic a principal lead', () => {
        const { roster } = generateRosterV2(perinatal());
        const leads = leadsOf(roster, 'Perinatal Clinic');
        expect(leads).toHaveLength(5);
        for (const lead of leads) expect(['Ada', 'Cleo']).toContain(lead);
    });

    it('still lets a junior co-lead it', () => {
        const { roster } = generateRosterV2(perinatal());
        const coLeads = flatten(roster).map(({ shift }) => shift.coLead);
        expect(coLeads).toContain('Dara');
    });

    it('composes skill AND band on the occurrence`s lead slot', () => {
        const result = generateRosterV2({
            startDate: MONDAY_START,
            weeks: WEEKS,
            staff: [
                { name: 'Ada', grade: 'AH15', skills: ['Perinatal'] }, // both gates
                { name: 'Bo', grade: 'AH9', skills: ['Perinatal'] }, // skill, no band
                { name: 'Cy', grade: 'AH16', skills: [] }, // band, no skill
            ],
            tasks: [{
                name: 'Clinic',
                recurrence: THIRD_WEDNESDAY,
                requiresSkill: 'Perinatal',
                leadBands: ['principal'],
                leads: 1,
                coLeads: 1,
            }],
        });

        expect(new Set(leadsOf(result.roster, 'Clinic'))).toEqual(new Set(['Ada']));
        expect(new Set(flatten(result.roster).map(({ shift }) => shift.coLead))).toEqual(new Set(['Bo']));
        expect(result.unfilled).toEqual([]);
        expect(result.warnings).toEqual([]);
    });

    it('reports an occurrence`s unfillable lead in the usual vocabulary', () => {
        const result = generateRosterV2({
            startDate: MONDAY_START,
            weeks: WEEKS,
            staff: [
                { name: 'Ada', grade: 'AH15', unavailable: [BROKEN] },
                { name: 'Bo', grade: 'AH9' },
            ],
            tasks: [{
                name: 'Clinic',
                recurrence: THIRD_WEDNESDAY,
                leadBands: ['principal'],
                continuity: true,
                leads: 1,
                coLeads: 0,
            }],
        });

        expect(Object.keys(result.roster)).toEqual(
            THIRD_WEDNESDAYS.filter((key) => key !== BROKEN),
        );
        expect(result.unfilled).toEqual([{
            date: BROKEN,
            task: 'Clinic',
            role: 'lead',
            reason: 'no available Principal-band staff for Clinic lead on 2026-11-18 (1 in band, 1 on leave)',
        }]);
        expect(result.score.hardViolations).toBe(0);
    });

    it('honours forbidPairs on an occurrence', () => {
        const { roster, score } = generateRosterV2({
            startDate: MONDAY_START,
            weeks: WEEKS,
            staff: [{ name: 'Ada' }, { name: 'Ben' }, { name: 'Cleo' }],
            tasks: [{ name: 'Clinic', recurrence: THIRD_WEDNESDAY, leads: 1, coLeads: 1 }],
            rules: { forbidPairs: [['Ada', 'Ben']] },
        });

        for (const { shift } of flatten(roster)) {
            expect(new Set(shift.assignees)).not.toEqual(new Set(['Ada', 'Ben']));
        }
        expect(score.hardViolations).toBe(0);
    });

    it('honours the daily capacity limit across two tasks on the same occurrence', () => {
        const result = generateRosterV2({
            startDate: MONDAY_START,
            weeks: WEEKS,
            staff: [{ name: 'Ada', grade: 'AH15' }, { name: 'Cleo', grade: 'AH16' }, { name: 'Ben', grade: 'AH13' }],
            tasks: [
                { name: 'Monthly Clinic', recurrence: THIRD_WEDNESDAY, leadBands: ['principal'], continuity: true, leads: 1, coLeads: 0 },
                { name: 'Monthly Governance', recurrence: THIRD_WEDNESDAY, leadBands: ['principal'], leads: 1, coLeads: 0 },
            ],
            rules: { maxConcurrentPerDay: 1 },
        });

        expect(result.unfilled).toEqual([]);
        expect(result.score.hardViolations).toBe(0);
        for (const dateKey of THIRD_WEDNESDAYS) {
            const leads = result.roster[dateKey].map((shift) => shift.lead);
            expect(new Set(leads).size).toBe(2); // nobody holds both
        }
    });

    it('is audited by auditHardConstraints like any other roster', () => {
        const config = perinatal();
        const audit = auditHardConstraints(generateRosterV2(config).roster, config);
        expect(audit.ok).toBe(true);
        expect(audit.violations).toEqual([]);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. CONTINUITY HOLDS
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — continuity keeps one lead across occurrences', () => {
    it('gives every occurrence to the same principal', () => {
        const { roster } = generateRosterV2(perinatal());
        expect(leadsByDate(roster, 'Perinatal Clinic')).toEqual({
            '2026-09-16': ['Ada'],
            '2026-10-21': ['Ada'],
            '2026-11-18': ['Ada'],
            '2026-12-16': ['Ada'],
            '2027-01-20': ['Ada'],
        });
    });

    it('does NOT do that without the flag — the same config alternates', () => {
        // The claim in one comparison: continuity is the only thing changing.
        const spread = generateRosterV2(perinatal({
            tasks: [{ ...perinatal().tasks[0], continuity: false }],
        }));
        expect(leadsOf(spread.roster, 'Perinatal Clinic')).toEqual(['Ada', 'Cleo', 'Ada', 'Cleo', 'Ada']);
        expect(leadsOf(generateRosterV2(perinatal()).roster, 'Perinatal Clinic'))
            .toEqual(['Ada', 'Ada', 'Ada', 'Ada', 'Ada']);
    });

    it('overrides FTE fairness for that task, and reports the resulting load honestly', () => {
        const { load } = generateRosterV2(perinatal());
        expect(load.Ada.duties).toBe(5);
        expect(load.Cleo.duties).toBe(2);
        expect(load.Ben.duties).toBe(2);
        expect(load.Dara.duties).toBe(1);
    });

    it('still shares the CO-LEAD seat by ordinary fairness', () => {
        // The scope of the override, pinned: one role of one task, nothing else.
        const { roster } = generateRosterV2(perinatal());
        expect(flatten(roster).map(({ shift }) => shift.coLead))
            .toEqual(['Ben', 'Cleo', 'Dara', 'Ben', 'Cleo']);
    });

    it('holds on a WEEKLY task too, without disturbing the task beside it', () => {
        const { roster, score } = generateRosterV2({
            startDate: MONDAY_START,
            weeks: 2,
            staff: [{ name: 'Ada' }, { name: 'Ben' }, { name: 'Cleo' }],
            tasks: [
                { name: 'Daily Handover', continuity: true, leads: 1, coLeads: 0 },
                { name: 'Open', leads: 1, coLeads: 0 },
            ],
        });

        expect(new Set(leadsOf(roster, 'Daily Handover'))).toEqual(new Set(['Ada']));
        expect(new Set(leadsOf(roster, 'Open'))).toEqual(new Set(['Ben', 'Cleo']));
        expect(score.breakdown.continuityBreaks).toBe(0);
    });

    it('starts from ordinary fairness on the first occurrence', () => {
        // The engine has no opinion about who SHOULD hold a clinic — only that
        // whoever gets it should keep it. With everybody level, the first
        // occurrence goes to the ordinary winner.
        const { roster } = generateRosterV2({
            startDate: MONDAY_START,
            weeks: WEEKS,
            staff: [{ name: 'Zoe' }, { name: 'Amy' }],
            tasks: [{ name: 'Clinic', recurrence: THIRD_WEDNESDAY, continuity: true, leads: 1, coLeads: 0 }],
        });
        expect(new Set(leadsOf(roster, 'Clinic'))).toEqual(new Set(['Amy']));
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. CONTINUITY YIELDS TO EVERY HARD CONSTRAINT, AND SAYS SO
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — continuity yields when the incumbent cannot take it', () => {
    const withLeave = () => perinatal({
        staff: [
            { name: 'Ada', grade: 'AH15', unavailable: [BROKEN] },
            { name: 'Cleo', grade: 'AH16' },
            { name: 'Ben', grade: 'AH13' },
            { name: 'Dara', grade: 'AH9' },
        ],
    });

    it('hands the occurrence to the next candidate rather than leaving it empty', () => {
        const result = generateRosterV2(withLeave());
        expect(leadsByDate(result.roster, 'Perinatal Clinic')).toEqual({
            '2026-09-16': ['Ada'],
            '2026-10-21': ['Ada'],
            '2026-11-18': ['Cleo'],
            '2026-12-16': ['Ada'],
            '2027-01-20': ['Ada'],
        });
        expect(result.unfilled).toEqual([]);
    });

    it('resumes with the incumbent afterwards', () => {
        const leads = leadsOf(generateRosterV2(withLeave()).roster, 'Perinatal Clinic');
        expect(leads[2]).toBe('Cleo'); // the stand-in
        expect(leads[3]).toBe('Ada'); // and back
        expect(leads[4]).toBe('Ada');
    });

    it('names both dates and the reason, in warnings', () => {
        expect(generateRosterV2(withLeave()).warnings).toEqual([
            'Continuity break: Perinatal Clinic was led by Ada on 2026-10-21 but by Cleo on 2026-11-18 — Ada was on leave that day.',
            'Continuity break: Perinatal Clinic was led by Cleo on 2026-11-18 but by Ada on 2026-12-16 — no constraint stopped Cleo that day; the slot went to somebody who had already led this task at least as often.',
        ]);
    });

    it('counts both changes — the yield AND the resumption', () => {
        // Honest rather than flattering: handing the clinic back is a second
        // change of lead, and a department counting "how often did the patients
        // meet somebody new" should see 2 here, not 1.
        expect(generateRosterV2(withLeave()).score.breakdown.continuityBreaks).toBe(2);
    });

    it('yields to a daily capacity limit as readily as to leave, and says which', () => {
        // Ben opens as the incumbent and is then pulled onto the skill-gated
        // duty, which is scarcer and therefore filled first, so his one duty a
        // day is spent before the clinic is reached.
        const result = generateRosterV2({
            startDate: MONDAY_START,
            weeks: WEEKS,
            staff: [{ name: 'Ada', skills: ['Gov'] }, { name: 'Ben', skills: ['Gov'] }, { name: 'Cleo', skills: [] }],
            tasks: [
                { name: 'Monthly Clinic', recurrence: THIRD_WEDNESDAY, continuity: true, leads: 1, coLeads: 0 },
                { name: 'Monthly Governance', recurrence: THIRD_WEDNESDAY, requiresSkill: 'Gov', leads: 1, coLeads: 0 },
            ],
            rules: { maxConcurrentPerDay: 1 },
        });

        expect(leadsOf(result.roster, 'Monthly Clinic')).toEqual(['Ben', 'Cleo', 'Cleo', 'Cleo', 'Cleo']);
        expect(result.warnings).toEqual([
            'Continuity break: Monthly Clinic was led by Ben on 2026-09-16 but by Cleo on 2026-10-21 — Ben was already at their daily duty limit.',
        ]);
        expect(result.score.breakdown.continuityBreaks).toBe(1);
        expect(result.score.hardViolations).toBe(0);
    });

    it('never promotes an out-of-band colleague to keep a clinic staffed', () => {
        // Continuity is a preference. The band gate is not, and the slot goes
        // unfilled exactly as it would without continuity in play.
        const result = generateRosterV2({
            startDate: MONDAY_START,
            weeks: WEEKS,
            staff: [
                { name: 'Ada', grade: 'AH15', unavailable: [BROKEN] },
                { name: 'Bo', grade: 'AH9' },
            ],
            tasks: [{ name: 'Clinic', recurrence: THIRD_WEDNESDAY, leadBands: ['principal'], continuity: true, leads: 1, coLeads: 0 }],
        });

        expect(result.roster[BROKEN]).toBeUndefined();
        expect(result.unfilled).toHaveLength(1);
        expect(result.load.Bo.duties).toBe(0);
    });

    it('treats an unfilled occurrence as no change of lead at all', () => {
        // The incumbent stays the incumbent across a gap: the gap is already in
        // `unfilled`, and counting it as two breaks would double-report it.
        const result = generateRosterV2({
            startDate: MONDAY_START,
            weeks: WEEKS,
            staff: [
                { name: 'Ada', grade: 'AH15', unavailable: [BROKEN] },
                { name: 'Bo', grade: 'AH9' },
            ],
            tasks: [{ name: 'Clinic', recurrence: THIRD_WEDNESDAY, leadBands: ['principal'], continuity: true, leads: 1, coLeads: 0 }],
        });

        expect(result.score.breakdown.continuityBreaks).toBe(0);
        expect(result.warnings).toEqual([]);
    });

    it('handles an incumbent PAIR on a task with two leads', () => {
        const result = generateRosterV2({
            startDate: MONDAY_START,
            weeks: WEEKS,
            staff: [{ name: 'Ada', unavailable: [BROKEN] }, { name: 'Ben' }, { name: 'Cleo' }],
            tasks: [{ name: 'Pair Clinic', recurrence: THIRD_WEDNESDAY, continuity: true, leads: 2, coLeads: 0 }],
        });

        expect(leadsByDate(result.roster, 'Pair Clinic')).toEqual({
            '2026-09-16': ['Ada', 'Ben'],
            '2026-10-21': ['Ada', 'Ben'],
            '2026-11-18': ['Ben', 'Cleo'],
            '2026-12-16': ['Ben', 'Ada'],
            '2027-01-20': ['Ben', 'Ada'],
        });
        expect(result.warnings[0]).toBe(
            'Continuity break: Pair Clinic was led by Ada and Ben on 2026-10-21 but by Ben and Cleo on 2026-11-18 — Ada was on leave that day.',
        );
        expect(result.score.breakdown.continuityBreaks).toBe(2);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. SCORING — the exemption, the count and the weights
// ═════════════════════════════════════════════════════════════════════════════

describe('scoreRoster — continuity and taskRepetition', () => {
    const scored = (continuity) => generateRosterV2(perinatal({
        tasks: [{
            name: 'Perinatal Clinic',
            recurrence: THIRD_WEDNESDAY,
            leadBands: ['principal'],
            continuity,
            leads: 1,
            coLeads: 1,
        }],
    })).score;

    it('charges task repetition when continuity is NOT asked for', () => {
        expect(scored(false).breakdown.taskRepetition).toBe(1);
    });

    it('charges nothing once continuity IS asked for', () => {
        // The scorer must not punish the roster for obeying the configuration.
        expect(scored(true).breakdown.taskRepetition).toBe(0);
    });

    it('pins the whole breakdown either way, so no other component moved by accident', () => {
        expect(scored(false).breakdown).toEqual({
            loadImbalance: 2,
            taskRepetition: 1,
            weekendImbalance: 0,
            isolatedDays: 10,
        });
        expect(scored(true).breakdown).toEqual({
            loadImbalance: 5,
            taskRepetition: 0,
            weekendImbalance: 0,
            isolatedDays: 10,
            continuityBreaks: 0,
        });
    });

    it('omits continuityBreaks entirely when no task asks for continuity', () => {
        // The compatibility claim, asserted on the shape rather than argued: a
        // department that does not use the feature sees the breakdown it always
        // saw, key for key.
        expect(Object.keys(scored(false).breakdown)).toEqual([
            'loadImbalance', 'taskRepetition', 'weekendImbalance', 'isolatedDays',
        ]);
        expect(Object.keys(scored(true).breakdown)).toEqual([
            'loadImbalance', 'taskRepetition', 'weekendImbalance', 'isolatedDays', 'continuityBreaks',
        ]);
    });

    it('exempts only the continuity task, not its neighbours', () => {
        const { score } = generateRosterV2({
            startDate: MONDAY_START,
            weeks: 4,
            staff: [{ name: 'Ada', skills: ['S'] }, { name: 'Ben' }, { name: 'Cleo' }],
            tasks: [
                { name: 'Held', continuity: true, leads: 1, coLeads: 0 },
                { name: 'Locked', requiresSkill: 'S', leads: 1, coLeads: 0 },
            ],
        });
        // `Locked` can only ever go to Ada, so its repetition is forgiven by the
        // eligible-pool rule — but `Held` being parked on one person is forgiven
        // by the exemption, and the two reasons are different.
        expect(score.breakdown.taskRepetition).toBe(0);
        expect(score.breakdown.continuityBreaks).toBe(0);
    });

    it('reaches the same answer standalone as it did inside the engine', () => {
        const config = perinatal();
        const result = generateRosterV2(config);
        expect(scoreRoster(result.roster, config).breakdown).toEqual(result.score.breakdown);
        expect(scoreRoster(result.roster, config).softPenalty).toBe(result.score.softPenalty);
    });

    it('counts breaks in a roster it did not build — the optimiser seam', () => {
        const config = perinatal();
        const { roster } = generateRosterV2(config);

        // Swap one occurrence's lead for the other principal: two more breaks.
        const candidate = JSON.parse(JSON.stringify(roster));
        candidate['2026-11-18'][0].lead = 'Cleo';
        candidate['2026-11-18'][0].assignees = ['Cleo', 'Dara'];
        candidate['2026-11-18'][0].coLead = 'Dara';

        expect(scoreRoster(roster, config).breakdown.continuityBreaks).toBe(0);
        expect(scoreRoster(candidate, config).breakdown.continuityBreaks).toBe(2);
    });

    it('treats an incumbent PAIR as a set, not as an ordered list', () => {
        // With two lead slots on one task there is no "first" lead: which shift
        // object names whom is an artefact of the order the slots were filled in.
        // The same two people in the other order must not read as a break, or a
        // department would be told continuity failed on a month nothing changed.
        const config = {
            startDate: MONDAY_START,
            weeks: WEEKS,
            staff: [{ name: 'Ada' }, { name: 'Ben' }, { name: 'Cleo' }],
            tasks: [{ name: 'Pair Clinic', recurrence: THIRD_WEDNESDAY, continuity: true, leads: 2, coLeads: 0 }],
        };
        const shift = (lead) => ({
            task: 'Pair Clinic',
            lead,
            staff: buildShiftStaffLabel(lead, undefined),
            category: 'CORE',
            week: 1,
            assignees: [lead],
        });

        const sameSet = {
            '2026-09-16': [shift('Ada'), shift('Ben')],
            '2026-10-21': [shift('Ben'), shift('Ada')],
        };
        const differentSet = {
            '2026-09-16': [shift('Ada'), shift('Ben')],
            '2026-10-21': [shift('Ben'), shift('Cleo')],
        };

        expect(scoreRoster(sameSet, config).breakdown.continuityBreaks).toBe(0);
        expect(scoreRoster(differentSet, config).breakdown.continuityBreaks).toBe(1);
    });

    it('is not fooled by a roster whose keys are out of order', () => {
        // `scoreRoster` sorts before walking, so "consecutive occurrences" means
        // consecutive in TIME rather than in insertion order.
        const config = perinatal();
        const { roster } = generateRosterV2(config);
        const reversed = {};
        for (const key of Object.keys(roster).reverse()) reversed[key] = roster[key];

        expect(scoreRoster(reversed, config).breakdown.continuityBreaks).toBe(0);
    });
});

describe('the soft penalty weights', () => {
    // The continuity weight briefly lived in a separate ALL_SOFT_PENALTY_WEIGHTS
    // overlay because rosterEngineV2.test.js pinned the original four keys and
    // that gate was not editable by the psych-pack change. The orchestrator
    // moved the pin and merged the tables; these tests assert the merged shape.
    it('carries the four original weights unchanged, plus continuityBreaks, frozen', () => {
        expect(SOFT_PENALTY_WEIGHTS).toEqual({
            loadImbalance: 1, taskRepetition: 1, weekendImbalance: 2, isolatedDays: 1,
            continuityBreaks: 2,
        });
        expect(Object.isFrozen(SOFT_PENALTY_WEIGHTS)).toBe(true);
    });

    it('makes softPenalty the weighted sum of its own breakdown, continuity included', () => {
        const config = perinatal({
            staff: [
                { name: 'Ada', grade: 'AH15', unavailable: [BROKEN] },
                { name: 'Cleo', grade: 'AH16' },
                { name: 'Ben', grade: 'AH13' },
                { name: 'Dara', grade: 'AH9' },
            ],
        });
        const { score } = generateRosterV2(config);

        const expected = Object.entries(score.breakdown).reduce(
            (sum, [key, value]) => sum + SOFT_PENALTY_WEIGHTS[key] * value,
            0,
        );
        expect(score.softPenalty).toBeCloseTo(Math.round(expected * 100) / 100, 5);
        expect(score.breakdown.continuityBreaks).toBe(2);
        expect(score.softPenalty).toBe(17);
    });

    it('scores a broken incumbency worse than a held one, everything else equal', () => {
        const held = generateRosterV2(perinatal()).score;
        const broken = generateRosterV2(perinatal({
            staff: [
                { name: 'Ada', grade: 'AH15', unavailable: [BROKEN] },
                { name: 'Cleo', grade: 'AH16' },
                { name: 'Ben', grade: 'AH13' },
                { name: 'Dara', grade: 'AH9' },
            ],
        })).score;

        expect(broken.breakdown.continuityBreaks).toBeGreaterThan(held.breakdown.continuityBreaks);
        expect(broken.softPenalty).toBeGreaterThan(held.softPenalty);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. DETERMINISM
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — determinism with recurrence and continuity in play', () => {
    const everything = () => ({
        startDate: '2026-09-06', // a Sunday, so the snap warning is in play too
        weeks: 40,
        staff: [
            { name: 'Ada', grade: 'AH15', fte: 1.0 },
            { name: 'Ben', grade: 'AH13', fte: 0.6, unavailable: ['2026-10-21'] },
            { name: 'Cleo', grade: 'AH16', fte: 1.0 },
            { name: 'Dara', grade: 'AH9', fte: 0.8 },
            { name: 'Nia' },
        ],
        tasks: [
            { name: 'Perinatal Clinic', recurrence: THIRD_WEDNESDAY, leadBands: ['principal'], continuity: true, leads: 1, coLeads: 1 },
            { name: 'Last Friday Audit', recurrence: { ordinal: 'last', weekday: 5 }, continuity: true, leads: 1, coLeads: 0 },
            { name: 'Open Clinic', leads: 1, coLeads: 1 },
        ],
        rules: { maxConcurrentPerDay: 2, forbidPairs: [['Ada', 'Nia']] },
    });

    it('produces a deep-equal result when called twice', () => {
        expect(generateRosterV2(everything())).toEqual(generateRosterV2(everything()));
    });

    it('produces a byte-identical serialisation, key order included', () => {
        expect(JSON.stringify(generateRosterV2(everything())))
            .toBe(JSON.stringify(generateRosterV2(everything())));
    });

    it('does not depend on the wall clock', () => {
        // No `Date.now()`, no `new Date()` without arguments: two runs a decade
        // apart must agree byte for byte.
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2020, 0, 1, 3, 30));
        const early = JSON.stringify(generateRosterV2(everything()));
        vi.setSystemTime(new Date(2031, 6, 4, 23, 59));
        const late = JSON.stringify(generateRosterV2(everything()));
        expect(early).toBe(late);
    });

    it('does not mutate the config it was given', () => {
        const config = everything();
        const snapshot = JSON.stringify(config);
        generateRosterV2(config);
        expect(JSON.stringify(config)).toBe(snapshot);
    });

    it('is deterministic over a full 52-week year of monthly tasks', () => {
        const config = { ...everything(), weeks: 52 };
        expect(JSON.stringify(generateRosterV2(config))).toBe(JSON.stringify(generateRosterV2(config)));
    });

    it('holds both incumbencies across nine months and reports the run cleanly', () => {
        const result = generateRosterV2(everything());
        expect(new Set(leadsOf(result.roster, 'Perinatal Clinic'))).toEqual(new Set(['Ada']));
        expect(new Set(leadsOf(result.roster, 'Last Friday Audit'))).toEqual(new Set(['Nia']));
        expect(result.unfilled).toEqual([]);
        expect(result.score.hardViolations).toBe(0);
        expect(result.score.breakdown.continuityBreaks).toBe(0);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. THE REFUSAL THAT COULD NOT LAND — documented, not hidden
