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
 * ── P4 HAS LANDED (dates) ────────────────────────────────────────────────────
 * This file used to carry two tests named `CURRENT BUG:` that asserted the WRONG
 * weekdays on purpose, plus date pins recorded from the un-snapped engine. P4
 * (post-mortem B1 + audit M2) inverted them, exactly as their comments instructed:
 *
 *   - `generateRoster` now snaps `startDate` to the MONDAY of that week, so the
 *     shipped Sunday default `2026-02-01` generates from Mon 2 Feb 2026;
 *   - it parses that date LOCALLY and derives keys with LOCAL getters, so the
 *     keys no longer slide a day across a spring-forward transition (M2).
 *
 * The counts below are unchanged by P4 — 24 keys, 88 shifts, the same rotation.
 * Only the keys moved, by exactly one day. `generateRoster is byte-compatible for
 * a Monday start` at the foot of this file is the guarantee that nothing already
 * stored in `system_data/roster_2026` went stale.
 *
 * P6 (schema) is still outstanding; its pins are untouched.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import { generateRoster, snapToMonday, parseLocalStartDate, toDateKey } from './auraEngine';
import {
    snapToMonday as snapToMondayV2,
    parseLocalDateKey as parseLocalDateKeyV2,
    toLocalDateKey as toLocalDateKeyV2,
} from './rosterEngineV2';

// ─── Fixture ─────────────────────────────────────────────────────────────────
// `startDate` is the value RosterView.jsx actually ships as its default.
// 1 February 2026 is a SUNDAY — that fact is the whole of Block B1. P4 snaps it
// forward to Monday 2 February 2026, which is `EFFECTIVE_START` below.
const STAFF = ['Brandon', 'Ying Xian', 'Derlinder', 'Fadzlynn'];
const TASKS = ['EFT', 'GXT', 'ECHO', 'HOLTER'];
const SHIPPED_DEFAULT_START = '2026-02-01';
const EFFECTIVE_START = '2026-02-02';

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
const TUESDAY = 2;
const FRIDAY = 5;
const SATURDAY = 6;

/** The weekdays a "Mon-Fri" core block is allowed to occupy. */
const WEEKDAYS_MON_TO_FRI = [1, 2, 3, 4, 5];

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

// ─── B1, FIXED — see ROSTER_POSTMORTEM.md Block B1 / ROSTER_TODO.md P4 ───────
describe('generateRoster — weekday correctness after the Monday snap (post-mortem B1)', () => {
    /*
     * WHAT THESE FOUR TESTS USED TO SAY, AND WHY THEY NOW SAY THE OPPOSITE.
     *
     * Three of them were named `CURRENT BUG:` and asserted the WRONG weekdays on
     * purpose, so the defect was recorded in executable form rather than only in
     * prose. Their own comments instructed P4 to invert them, which is what has
     * happened here — deliberately, and not by "fixing" a red test.
     *
     * RosterView.jsx ships `startDate: "2026-02-01"`, which is a SUNDAY, and the
     * engine's fixed offsets were therefore all one day early:
     *
     *   Engine intent            Offset   Before P4          After P4
     *   ----------------------   ------   ----------------   ---------------
     *   Core block "Mon-Fri"     +0..+4   Sun 1 -> Thu 5     Mon 2 -> Fri 6
     *   "VC (PM)" "Tuesday"      +1       MONDAY 2 Feb       Tuesday 3 Feb
     *   "VC (AM)" "Saturday"     +5       Friday 6 Feb       Saturday 7 Feb
     *
     * `generateRoster` now snaps its start to the Monday of the requested week.
     * A failure here means the snap has been removed or the week convention has
     * been flipped to ISO-8601 (which would send the shipped default BACKWARDS
     * to Mon 26 January instead) — both are behaviour changes, not test noise.
     */

    it('core block starts on the Monday of the week containing a Sunday startDate', () => {
        const roster = generateRoster(baseConfig());

        const coreKeys = Object.keys(roster)
            .filter((key) => roster[key].some((shift) => shift.category === 'CORE'))
            .sort();

        // The raw startDate is a Sunday; the first core day is the Monday after.
        expect(weekdayOfKey(SHIPPED_DEFAULT_START)).toBe(SUNDAY);
        expect(coreKeys[0]).toBe(EFFECTIVE_START);
        expect(weekdayOfKey(coreKeys[0])).toBe(MONDAY);

        // ...and every week of the "Mon-Fri" block genuinely runs Mon-Fri.
        const coreWeekdays = [...new Set(coreKeys.map(weekdayOfKey))].sort();
        expect(coreWeekdays).toEqual(WEEKDAYS_MON_TO_FRI);
    });

    it('shift labelled "VC (PM)" lands on the intended Tuesday', () => {
        const roster = generateRoster(baseConfig());

        const vcPm = shiftsWhere(roster, (shift) => shift.task === 'VC (PM)');
        expect(vcPm).toHaveLength(4);

        // The task label says PM Tuesday clinic, and it is now a Tuesday.
        vcPm.forEach(({ key }) => {
            expect(weekdayOfKey(key)).toBe(TUESDAY);
        });

        // Each key is exactly one day later than the pre-P4 pin it replaces
        // (which was 02-02 / 09 / 16 / 23 — Mondays).
        expect(vcPm.map(({ key }) => key).sort()).toEqual([
            '2026-02-03',
            '2026-02-10',
            '2026-02-17',
            '2026-02-24',
        ]);
    });

    it('shift labelled "VC (AM)" lands on the intended Saturday', () => {
        const roster = generateRoster(baseConfig());

        const vcAm = shiftsWhere(roster, (shift) => shift.task === 'VC (AM)');
        expect(vcAm).toHaveLength(4);

        vcAm.forEach(({ key }) => {
            expect(weekdayOfKey(key)).toBe(SATURDAY);
        });

        expect(vcAm.map(({ key }) => key).sort()).toEqual([
            '2026-02-07',
            '2026-02-14',
            '2026-02-21',
            '2026-02-28',
        ]);
    });

    it('generates a Saturday from the shipped default start date, and never a Sunday', () => {
        // The inverse of the old pin. The weekend VC duty the roster exists to
        // schedule now actually appears on a weekend, and the core block does
        // not spill onto the Sunday that used to open it.
        const roster = generateRoster(baseConfig());
        const weekdays = new Set(Object.keys(roster).map(weekdayOfKey));

        expect(weekdays.has(SATURDAY)).toBe(true);
        expect(weekdays.has(SUNDAY)).toBe(false);
    });
});

// ─── B1/M2 — the general weekday invariant, not just the shipped fixture ─────
describe('generateRoster — every generated key falls on the weekday its task claims', () => {
    /*
     * ROSTER_TODO.md P4.5. The block above pins one fixture; this one asserts
     * the invariant over every start weekday and over the runs that used to
     * break it. `weekdayOfKey` parses as UTC midnight on purpose, so the
     * assertions are a calendar fact and cannot pass or fail by geography.
     */
    const EVERY_START_WEEKDAY = [
        '2026-02-01', // Sun
        '2026-02-02', // Mon
        '2026-02-03', // Tue
        '2026-02-04', // Wed
        '2026-02-05', // Thu
        '2026-02-06', // Fri
        '2026-02-07', // Sat
    ];

    const partition = (roster) => {
        const keysWith = (predicate) =>
            Object.keys(roster).filter((key) => roster[key].some(predicate));
        return {
            core: keysWith((s) => s.category === 'CORE'),
            vcPm: keysWith((s) => s.task === 'VC (PM)'),
            vcAm: keysWith((s) => s.task === 'VC (AM)'),
        };
    };

    EVERY_START_WEEKDAY.forEach((startDate) => {
        it(`start ${startDate} (${weekdayOfKey(startDate)}): CORE is Mon-Fri, VC (PM) Tuesday, VC (AM) Saturday`, () => {
            const { core, vcPm, vcAm } = partition(
                generateRoster({ ...baseConfig(), startDate, weeks: 4 }),
            );

            expect(core.length).toBeGreaterThan(0);
            core.forEach((key) => {
                expect(WEEKDAYS_MON_TO_FRI).toContain(weekdayOfKey(key));
            });
            vcPm.forEach((key) => expect(weekdayOfKey(key)).toBe(TUESDAY));
            vcAm.forEach((key) => expect(weekdayOfKey(key)).toBe(SATURDAY));
        });
    });

    it('holds across a year boundary and a leap day', () => {
        for (const startDate of ['2026-12-28', '2027-12-31', '2028-02-29']) {
            const { core, vcPm, vcAm } = partition(
                generateRoster({ ...baseConfig(), startDate, weeks: 3 }),
            );
            core.forEach((key) => expect(WEEKDAYS_MON_TO_FRI).toContain(weekdayOfKey(key)));
            vcPm.forEach((key) => expect(weekdayOfKey(key)).toBe(TUESDAY));
            vcAm.forEach((key) => expect(weekdayOfKey(key)).toBe(SATURDAY));
        }
    });

    it('M2: a run spanning the 2026 US spring-forward does not slide (audit M2)', () => {
        /*
         * ROSTER_QC_AUDIT.md M2. Monday 2 March 2026 + 4 weeks straddles the US
         * DST transition on Sunday 8 March. The old engine advanced a live
         * instant with `setDate`, which preserves the wall-clock TIME, so the
         * instant crossed a UTC date boundary and weeks 2-4 came out Sun-Thu:
         *
         *   TZ=America/New_York, old code:  wk1 03-02..06 (Mon-Fri)  ✓
         *                                   wk2 03-08..12 (Sun-Thu)  ✗
         *
         * The expected key list below is a pure calendar fact, so this test is
         * decisive in EVERY timezone: it fails under `TZ=America/New_York` on
         * the old implementation and passes on the new one. Under a DST-free
         * zone such as the `Asia/Singapore` deployment it is a cheap tautology —
         * which is exactly why the suite must also be run under New York.
         */
        const roster = generateRoster({ ...baseConfig(), startDate: '2026-03-02', weeks: 4 });
        const keys = Object.keys(roster).sort();

        expect(keys).toEqual([
            '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07',
            '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13', '2026-03-14',
            '2026-03-16', '2026-03-17', '2026-03-18', '2026-03-19', '2026-03-20', '2026-03-21',
            '2026-03-23', '2026-03-24', '2026-03-25', '2026-03-26', '2026-03-27', '2026-03-28',
        ]);

        const { core, vcPm, vcAm } = partition(roster);
        core.forEach((key) => expect(WEEKDAYS_MON_TO_FRI).toContain(weekdayOfKey(key)));
        vcPm.forEach((key) => expect(weekdayOfKey(key)).toBe(TUESDAY));
        vcAm.forEach((key) => expect(weekdayOfKey(key)).toBe(SATURDAY));
    });

    it('M2: the same holds across the US fall-back, which never broke', () => {
        const roster = generateRoster({ ...baseConfig(), startDate: '2026-10-26', weeks: 4 });
        const { core, vcAm } = partition(roster);

        core.forEach((key) => expect(WEEKDAYS_MON_TO_FRI).toContain(weekdayOfKey(key)));
        vcAm.forEach((key) => expect(weekdayOfKey(key)).toBe(SATURDAY));
        expect(Object.keys(roster).sort()[0]).toBe('2026-10-26');
        expect(Object.keys(roster).sort().at(-1)).toBe('2026-11-21');
    });
});

// ─── The two engines must agree about which Monday a date belongs to ─────────
describe('snapToMonday agrees with rosterEngineV2 (ROSTER_TODO.md P4.2)', () => {
    /*
     * `auraEngine` keeps its own copy of these primitives because V2 already
     * imports `buildShiftStaffLabel` from `auraEngine`, so importing back would
     * make the modules circular. Duplication is the accepted cost; this test is
     * what stops the copies drifting. Both engines write into the same
     * `system_data/roster_2026` document, so a disagreement about the week
     * convention would interleave two differently-aligned rosters.
     */
    const EVERY_DAY_OF_A_WEEK = [
        '2026-02-01', '2026-02-02', '2026-02-03', '2026-02-04',
        '2026-02-05', '2026-02-06', '2026-02-07',
    ];

    it('maps every weekday to the same Monday as the V2 engine', () => {
        for (const key of EVERY_DAY_OF_A_WEEK) {
            const mine = toDateKey(snapToMonday(parseLocalStartDate(key)));
            const theirs = toLocalDateKeyV2(snapToMondayV2(parseLocalDateKeyV2(key)));

            expect(mine).toBe(theirs);
            expect(weekdayOfKey(mine)).toBe(MONDAY);
        }
    });

    it('snaps Sunday FORWARD and Monday-to-Saturday back, like V2', () => {
        const snap = (key) => toDateKey(snapToMonday(parseLocalStartDate(key)));

        expect(snap('2026-02-01')).toBe('2026-02-02'); // Sun -> next day
        expect(snap('2026-02-02')).toBe('2026-02-02'); // Mon -> identity
        expect(snap('2026-02-07')).toBe('2026-02-02'); // Sat -> back to Monday
    });

    it('round-trips a key through the local parse and the local formatter', () => {
        for (const key of [...EVERY_DAY_OF_A_WEEK, '2028-02-29', '2026-12-31']) {
            expect(toDateKey(parseLocalStartDate(key))).toBe(key);
        }
    });
});

// ─── Date-key arithmetic ────────────────────────────────────────────────────
describe('generateRoster — date key arithmetic', () => {
    it('advances each week by exactly 7 days from the effective (snapped) start', () => {
        // P4: every key below is one day later than the pre-snap pin it replaces
        // (02-01 / 08 / 15 / 22). The 7-day stride itself is unchanged.
        const roster = generateRoster(baseConfig());
        const firstKeyOfWeek = (week) =>
            shiftsWhere(roster, (shift) => shift.week === week)
                .map(({ key }) => key)
                .sort()[0];

        expect([1, 2, 3, 4].map(firstKeyOfWeek)).toEqual([
            '2026-02-02',
            '2026-02-09',
            '2026-02-16',
            '2026-02-23',
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

    it('spans Mon 2 Feb to Sat 28 Feb 2026 for the shipped default', () => {
        // Was 2026-02-01 .. 2026-02-27 before the snap. Same 24 keys, same
        // 27-day span, moved forward one day.
        const keys = Object.keys(generateRoster(baseConfig())).sort();

        expect(keys[0]).toBe('2026-02-02');
        expect(keys.at(-1)).toBe('2026-02-28');
        expect(keys).toHaveLength(24);
    });
});

// ─── COMPATIBILITY PIN — nothing already written to Firestore went stale ─────
describe('generateRoster is byte-compatible for a Monday start (ROSTER_TODO.md P4)', () => {
    /*
     * THE POINT OF THIS BLOCK. P4 changed two things at once — the start date is
     * snapped to a Monday, and the whole date pipeline moved from
     * "UTC parse + toISOString output" to "local parse + local getters". For a
     * start date that is ALREADY a Monday the snap is the identity, and the new
     * local pipeline reproduces the old (Singapore-correct) keys exactly. So a
     * Monday-start run must be DEEP-EQUAL to what the engine produced before the
     * change.
     *
     * That matters because the live document `system_data/roster_2026` holds
     * keys from Monday-adjacent generations. If this block ever fails, stored
     * shifts and newly generated shifts have stopped lining up, and a swap
     * against a stored shift would silently miss.
     *
     * The expected values below were captured by RUNNING THE PRE-P4 ENGINE — the
     * live staff and task lists, `startDate: '2026-02-02'`, 4 weeks — under both
     * `TZ=Asia/Singapore` and `TZ=America/New_York`, which produced byte-
     * identical output. They are not re-derived from the new source.
     */
    const LIVE_STAFF = ['Brandon', 'Ying Xian', 'Derlinder', 'Fadzlynn'];
    const LIVE_TASKS = ['EFT', 'IPT+SKG', 'NC', 'FSG+WI'];
    const mondayConfig = () => ({
        staff: [...LIVE_STAFF],
        tasks: [...LIVE_TASKS],
        startDate: '2026-02-02',
        weeks: 4,
    });

    /** Recorded from the pre-P4 engine, verbatim. */
    const PRE_P4_KEYS = [
        '2026-02-02', '2026-02-03', '2026-02-04', '2026-02-05', '2026-02-06', '2026-02-07',
        '2026-02-09', '2026-02-10', '2026-02-11', '2026-02-12', '2026-02-13', '2026-02-14',
        '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21',
        '2026-02-23', '2026-02-24', '2026-02-25', '2026-02-26', '2026-02-27', '2026-02-28',
    ];

    it('produces exactly the 24 keys the pre-P4 engine produced', () => {
        expect(Object.keys(generateRoster(mondayConfig())).sort()).toEqual(PRE_P4_KEYS);
    });

    it('produces the pre-P4 shift list for the first day, field for field', () => {
        // Recorded output of the OLD engine for 2026-02-02.
        expect(generateRoster(mondayConfig())['2026-02-02']).toEqual([
            { task: 'EFT', lead: 'Brandon', coLead: 'Ying Xian', staff: 'Lead: Brandon, Co: Ying Xian', category: 'CORE', week: 1 },
            { task: 'IPT+SKG', lead: 'Ying Xian', coLead: 'Derlinder', staff: 'Lead: Ying Xian, Co: Derlinder', category: 'CORE', week: 1 },
            { task: 'NC', lead: 'Derlinder', coLead: 'Fadzlynn', staff: 'Lead: Derlinder, Co: Fadzlynn', category: 'CORE', week: 1 },
            { task: 'FSG+WI', lead: 'Fadzlynn', coLead: 'Brandon', staff: 'Lead: Fadzlynn, Co: Brandon', category: 'CORE', week: 1 },
        ]);
    });

    it('keeps the week-1 Tuesday VC (PM) exactly where it was', () => {
        // 2026-02-03 carried 4 CORE shifts plus VC (PM) before P4, and still does.
        const tuesday = generateRoster(mondayConfig())['2026-02-03'];

        expect(tuesday).toHaveLength(5);
        expect(tuesday[4]).toEqual({
            task: 'VC (PM)', lead: 'Brandon', coLead: 'Ying Xian',
            staff: 'Lead: Brandon, Co: Ying Xian', category: 'VC', week: 1,
        });
    });

    it('keeps the week-1 and week-4 Saturday VC (AM) exactly where they were', () => {
        const roster = generateRoster(mondayConfig());

        expect(roster['2026-02-07']).toEqual([{
            task: 'VC (AM)', lead: 'Brandon', coLead: 'Ying Xian',
            staff: 'Lead: Brandon, Co: Ying Xian', category: 'VC', week: 1,
        }]);
        expect(roster['2026-02-28']).toEqual([{
            task: 'VC (AM)', lead: 'Fadzlynn', coLead: 'Brandon',
            staff: 'Lead: Fadzlynn, Co: Brandon', category: 'VC', week: 4,
        }]);
    });

    it('keeps the week-4 rotation on its pre-P4 day', () => {
        expect(generateRoster(mondayConfig())['2026-02-23']).toEqual([
            { task: 'EFT', lead: 'Fadzlynn', coLead: 'Brandon', staff: 'Lead: Fadzlynn, Co: Brandon', category: 'CORE', week: 4 },
            { task: 'IPT+SKG', lead: 'Brandon', coLead: 'Ying Xian', staff: 'Lead: Brandon, Co: Ying Xian', category: 'CORE', week: 4 },
            { task: 'NC', lead: 'Ying Xian', coLead: 'Derlinder', staff: 'Lead: Ying Xian, Co: Derlinder', category: 'CORE', week: 4 },
            { task: 'FSG+WI', lead: 'Derlinder', coLead: 'Fadzlynn', staff: 'Lead: Derlinder, Co: Fadzlynn', category: 'CORE', week: 4 },
        ]);
    });

    it('makes the shipped Sunday default generate that same Monday roster', () => {
        // The snap is not a separate schedule: it lands the Sunday default on
        // precisely the roster a Monday start has always produced.
        expect(generateRoster({ ...mondayConfig(), startDate: '2026-02-01' })).toEqual(
            generateRoster(mondayConfig()),
        );
    });
});
