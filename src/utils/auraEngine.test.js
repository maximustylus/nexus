/**
 * ==============================================================================
 * AURA ROSTER ENGINE — Characterization Test Suite
 * ==============================================================================
 * Runner: Vitest
 * Run:    npm test
 *
 * PURPOSE — read this before changing any assertion below.
 *
 * These are CHARACTERIZATION tests, not specification tests. They pin down what
 * `generateRoster` does *today*, including its known defects, so that the fixes
 * planned in ROSTER_TODO.md P4 (dates) and P6 (schema) show up as small,
 * reviewable diffs in THIS file rather than as unexplained behaviour changes in
 * production.
 *
 * Every number here was obtained by executing the current implementation and
 * recording the result — none of it is derived by hand from the source.
 *
 * Two tests are named `CURRENT BUG:` and assert behaviour that is WRONG. That is
 * deliberate. See ROSTER_POSTMORTEM.md Block B1. P4 will invert them; a failure
 * in one of those two after P4 lands is the expected, desired signal.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import { generateRoster } from './auraEngine';

// ─── Fixture ─────────────────────────────────────────────────────────────────
// `startDate` is the value RosterView.jsx actually ships as its default.
// 1 February 2026 is a SUNDAY — that fact is the whole of Block B1.
const STAFF = ['Brandon', 'Ying Xian', 'Derlinder', 'Fadzlynn'];
const TASKS = ['EFT', 'GXT', 'ECHO', 'HOLTER'];
const SHIPPED_DEFAULT_START = '2026-02-01';

const baseConfig = () => ({
    staff: [...STAFF],
    tasks: [...TASKS],
    startDate: SHIPPED_DEFAULT_START,
    weeks: 4,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Day-of-week of a `YYYY-MM-DD` roster key, 0 = Sunday.
 *
 * Deliberately parsed as UTC midnight. The question "what weekday is the string
 * 2026-02-01?" is a pure calendar fact, so this helper must not depend on the
 * runner's TZ — otherwise the suite would reproduce Block B2 inside its own
 * assertions and pass or fail by geography.
 */
const weekdayOfKey = (key) => new Date(`${key}T00:00:00Z`).getUTCDay();

const SUNDAY = 0;
const MONDAY = 1;
const FRIDAY = 5;

/** Every shift in the roster, flattened, each tagged with the key it sits under. */
const flatten = (roster) =>
    Object.entries(roster).flatMap(([key, shifts]) =>
        shifts.map((shift) => ({ key, shift })),
    );

const shiftsWhere = (roster, predicate) =>
    flatten(roster).filter(({ shift }) => predicate(shift));

// ─── Shape of the returned object ────────────────────────────────────────────
describe('generateRoster — returned container shape', () => {
    it('returns a plain object keyed by YYYY-MM-DD date strings', () => {
        const roster = generateRoster(baseConfig());

        expect(Array.isArray(roster)).toBe(false);
        expect(typeof roster).toBe('object');

        const keys = Object.keys(roster);
        expect(keys.length).toBeGreaterThan(0);
        keys.forEach((key) => {
            expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });
    });

    it('maps every date key to a non-empty array of shift objects', () => {
        const roster = generateRoster(baseConfig());

        Object.values(roster).forEach((shifts) => {
            expect(Array.isArray(shifts)).toBe(true);
            expect(shifts.length).toBeGreaterThan(0);
        });
    });
});

// ─── Shape of an individual shift ────────────────────────────────────────────
describe('generateRoster — shift object schema', () => {
    // The exact field set matters to P6: `AuraPulseBot.jsx` mutates these objects
    // and `RosterView.jsx` reads them. Any field added or renamed is a contract
    // change between three files, so it must break a test.
    const EXPECTED_FIELDS = ['task', 'lead', 'coLead', 'staff', 'category', 'week'];

    it('gives every shift exactly the fields task, lead, coLead, staff, category, week', () => {
        const roster = generateRoster(baseConfig());
        const all = flatten(roster);

        expect(all.length).toBeGreaterThan(0);
        all.forEach(({ shift }) => {
            // Sorted comparison: asserts no field is missing AND none is extra.
            expect(Object.keys(shift).sort()).toEqual([...EXPECTED_FIELDS].sort());
        });
    });

    it('derives `staff` as exactly `Lead: ${lead}, Co: ${coLead}`', () => {
        const roster = generateRoster(baseConfig());

        flatten(roster).forEach(({ shift }) => {
            expect(shift.staff).toBe(`Lead: ${shift.lead}, Co: ${shift.coLead}`);
        });
    });

    it('populates lead and coLead from the configured staff pool', () => {
        const roster = generateRoster(baseConfig());

        flatten(roster).forEach(({ shift }) => {
            expect(STAFF).toContain(shift.lead);
            expect(STAFF).toContain(shift.coLead);
        });
    });

    it('numbers `week` from 1, not 0, for a 4-week roster', () => {
        // Note the off-by-one trap for future readers: the generator's internal
        // loop index is 0-based but the persisted field is `w + 1`.
        const roster = generateRoster(baseConfig());
        const weeks = [...new Set(flatten(roster).map(({ shift }) => shift.week))].sort();

        expect(weeks).toEqual([1, 2, 3, 4]);
    });

    it('emits only the two categories CORE and VC', () => {
        const roster = generateRoster(baseConfig());
        const categories = [
            ...new Set(flatten(roster).map(({ shift }) => shift.category)),
        ].sort();

        expect(categories).toEqual(['CORE', 'VC']);
    });
});

// ─── Observed volumes ────────────────────────────────────────────────────────
describe('generateRoster — observed output volume (4 staff / 4 tasks / 4 weeks)', () => {
    // Recorded by running the current implementation, not hand-derived.
    // Verified stable under TZ=Asia/Singapore, UTC, Europe/London,
    // America/Sao_Paulo, America/New_York, Pacific/Pago_Pago (UTC-11) and
    // Pacific/Kiritimati (UTC+14) — identical output in all seven.
    const EXPECTED_CORE_SHIFTS = 80;
    const EXPECTED_VC_SHIFTS = 8;
    const EXPECTED_DATE_KEYS = 24;

    it(`produces ${EXPECTED_CORE_SHIFTS} CORE shifts`, () => {
        const roster = generateRoster(baseConfig());
        expect(shiftsWhere(roster, (s) => s.category === 'CORE')).toHaveLength(
            EXPECTED_CORE_SHIFTS,
        );
    });

    it(`produces ${EXPECTED_VC_SHIFTS} VC shifts`, () => {
        const roster = generateRoster(baseConfig());
        expect(shiftsWhere(roster, (s) => s.category === 'VC')).toHaveLength(
            EXPECTED_VC_SHIFTS,
        );
    });

    it(`produces ${EXPECTED_DATE_KEYS} distinct date keys`, () => {
        const roster = generateRoster(baseConfig());
        expect(Object.keys(roster)).toHaveLength(EXPECTED_DATE_KEYS);
    });

    it('produces 88 shifts in total across all date keys', () => {
        const roster = generateRoster(baseConfig());
        expect(flatten(roster)).toHaveLength(
            EXPECTED_CORE_SHIFTS + EXPECTED_VC_SHIFTS,
        );
    });

    it('splits VC evenly into 4 "VC (PM)" and 4 "VC (AM)" shifts', () => {
        const roster = generateRoster(baseConfig());

        expect(shiftsWhere(roster, (s) => s.task === 'VC (PM)')).toHaveLength(4);
        expect(shiftsWhere(roster, (s) => s.task === 'VC (AM)')).toHaveLength(4);
    });
});

// ─── Staff rotation ─────────────────────────────────────────────────────────
describe('generateRoster — staff rotation', () => {
    // `rotate(staff, w)` is the entire scheduling algorithm. There is no
    // constraint checking of any kind (ROSTER_POSTMORTEM.md Block E1).
    const leadOf = (roster, task, week) => {
        const match = shiftsWhere(roster, (s) => s.task === task && s.week === week);
        expect(match.length).toBeGreaterThan(0);
        return match[0].shift.lead;
    };

    it('rotates the lead of tasks[0] by one staff member from week 0 to week 1', () => {
        // "week 0" / "week 1" are loop indices; the persisted field is 1-based,
        // so they surface as week === 1 and week === 2.
        const roster = generateRoster(baseConfig());

        const firstWeekLead = leadOf(roster, TASKS[0], 1);
        const secondWeekLead = leadOf(roster, TASKS[0], 2);

        expect(firstWeekLead).not.toBe(secondWeekLead);
        expect(firstWeekLead).toBe(STAFF[0]);
        expect(secondWeekLead).toBe(STAFF[1]);
    });

    it('advances the lead of tasks[0] by one pool position each week', () => {
        const roster = generateRoster(baseConfig());

        expect([1, 2, 3, 4].map((week) => leadOf(roster, TASKS[0], week))).toEqual([
            STAFF[0],
            STAFF[1],
            STAFF[2],
            STAFF[3],
        ]);
    });

    it('pairs each lead with the next staff member as coLead, wrapping at the end', () => {
        const roster = generateRoster(baseConfig());

        flatten(roster).forEach(({ shift }) => {
            const leadIdx = STAFF.indexOf(shift.lead);
            expect(shift.coLead).toBe(STAFF[(leadIdx + 1) % STAFF.length]);
        });
    });

    it('keeps a shift lead distinct from its coLead', () => {
        const roster = generateRoster(baseConfig());

        flatten(roster).forEach(({ shift }) => {
            expect(shift.lead).not.toBe(shift.coLead);
        });
    });
});

// ─── KNOWN DEFECTS — see ROSTER_POSTMORTEM.md Block B1 ───────────────────────
describe('generateRoster — CURRENT BUGGY WEEKDAY BEHAVIOUR (ROSTER_POSTMORTEM.md Block B1)', () => {
    /*
     * ROSTER_POSTMORTEM.md Block B1: RosterView.jsx ships
     * `startDate: "2026-02-01"`, which is a SUNDAY. Nothing in `generateRoster`
     * validates or snaps the start date to a Monday, so the fixed weekday
     * offsets in the engine are all one day early:
     *
     *   Engine intent            Offset   Day actually generated
     *   ----------------------   ------   ----------------------
     *   Core block "Mon-Fri"     +0..+4   Sun 1 -> Thu 5 Feb
     *   "VC (PM)" "Tuesday"      +1       MONDAY 2 Feb
     *   "VC (AM)" "Saturday"     +5       Friday 6 Feb
     *
     * The two `CURRENT BUG:` tests below assert the WRONG days on purpose, so
     * that the state of the defect is recorded in executable form rather than
     * only in prose. ROSTER_TODO.md P4.2 introduces `snapToMonday`; when it
     * lands, these two tests MUST be inverted to expect Monday and Tuesday
     * respectively. Do not "fix" them here — that would silently erase the
     * evidence that P4 changed anything.
     */

    it('CURRENT BUG: core block starts on Sunday when startDate is a Sunday', () => {
        const roster = generateRoster(baseConfig());

        const coreKeys = Object.keys(roster)
            .filter((key) => roster[key].some((shift) => shift.category === 'CORE'))
            .sort();

        // The first core day is the raw startDate, unsnapped.
        expect(coreKeys[0]).toBe('2026-02-01');
        expect(weekdayOfKey(coreKeys[0])).toBe(SUNDAY);

        // ...and every week of the "Mon-Fri" block therefore runs Sun-Thu.
        // WRONG: after P4 this set must become Mon..Fri, i.e. [1, 2, 3, 4, 5].
        const coreWeekdays = [...new Set(coreKeys.map(weekdayOfKey))].sort();
        expect(coreWeekdays).toEqual([0, 1, 2, 3, 4]);
    });

    it('CURRENT BUG: shift labelled "VC (PM)" lands on a Monday, not the intended Tuesday', () => {
        const roster = generateRoster(baseConfig());

        const vcPm = shiftsWhere(roster, (shift) => shift.task === 'VC (PM)');
        expect(vcPm).toHaveLength(4);

        // WRONG: the task label says PM Tuesday clinic. After P4 every one of
        // these must be a Tuesday (weekday 2).
        vcPm.forEach(({ key }) => {
            expect(weekdayOfKey(key)).toBe(MONDAY);
        });

        expect(vcPm.map(({ key }) => key).sort()).toEqual([
            '2026-02-02',
            '2026-02-09',
            '2026-02-16',
            '2026-02-23',
        ]);
    });

    it('CURRENT BUG: shift labelled "VC (AM)" lands on a Friday, not the intended Saturday', () => {
        const roster = generateRoster(baseConfig());

        const vcAm = shiftsWhere(roster, (shift) => shift.task === 'VC (AM)');
        expect(vcAm).toHaveLength(4);

        // WRONG: after P4 every one of these must be a Saturday (weekday 6).
        vcAm.forEach(({ key }) => {
            expect(weekdayOfKey(key)).toBe(FRIDAY);
        });
    });

    it('CURRENT BUG: no Saturday is ever generated from the shipped default start date', () => {
        // Consequence of the above: the weekend VC duty the roster exists to
        // schedule never appears on a weekend at all.
        const roster = generateRoster(baseConfig());
        const weekdays = new Set(Object.keys(roster).map(weekdayOfKey));

        expect(weekdays.has(6)).toBe(false);
    });
});

// ─── Date-key arithmetic ────────────────────────────────────────────────────
describe('generateRoster — date key arithmetic', () => {
    it('advances each week by exactly 7 days from the start date', () => {
        const roster = generateRoster(baseConfig());
        const firstKeyOfWeek = (week) =>
            shiftsWhere(roster, (shift) => shift.week === week)
                .map(({ key }) => key)
                .sort()[0];

        expect([1, 2, 3, 4].map(firstKeyOfWeek)).toEqual([
            '2026-02-01',
            '2026-02-08',
            '2026-02-15',
            '2026-02-22',
        ]);
    });

    it('returns an empty roster when weeks is 0', () => {
        const roster = generateRoster({ ...baseConfig(), weeks: 0 });
        expect(Object.keys(roster)).toHaveLength(0);
    });

    it('generates 6 distinct date keys per week (5 core days + the trailing VC day)', () => {
        const oneWeek = generateRoster({ ...baseConfig(), weeks: 1 });
        expect(Object.keys(oneWeek)).toHaveLength(6);
    });
});
