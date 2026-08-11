/**
 * ==============================================================================
 * AURA ROSTER ENGINE V2 — THE HOURS MODEL, SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest
 * Run:    npm test
 *
 * WHY THIS IS A SIBLING FILE AND NOT A NEW `describe` IN AN EXISTING ONE.
 *
 * `rosterEngineV2.test.js`, `rosterEngineV2.grades.test.js` and
 * `rosterEngineV2.psych.test.js` are the COMPATIBILITY GATE for this change: the
 * claim being made is that a configuration mentioning no `hours`, no
 * `weeklyHours` and no `maxHoursPerDay` behaves EXACTLY as it did before. A gate
 * is only worth anything if it is untouched, and `git diff --stat` showing zero
 * lines changed in all three is a stronger statement than a diff a reviewer has
 * to read to confirm nothing was softened. All four files run in one command.
 *
 * Everything below is a SPECIFICATION test: a failure is a bug in the engine.
 * Every number and every quoted reason string was obtained by RUNNING the engine
 * and recording the result, never derived by hand.
 *
 * THE RULES BEING PINNED, in one place:
 *
 *   1. A task with no `hours` takes `DEFAULT_TASK_HOURS` (4) — a session, not a
 *      day. Stating `hours: 4` explicitly changes nothing.
 *   2. SAME-DAY DURATIONS SUM against an FTE-scaled daily cap, and the cap is
 *      HARD: the slot goes to `unfilled` with a reason that names the hours, the
 *      date and what the person already holds. Never a silent double-book.
 *   3. One MONDAY–SUNDAY week's durations sum against an FTE-scaled weekly cap,
 *      also HARD, and the total RESETS at the week boundary.
 *   4. The FOUR-WEEK rolling total is measured and WARNED about, never enforced,
 *      and the warning names the person and the total.
 *   5. Both caps scale by FTE: a 0.6-FTE ceiling is 60% of a full-timer's.
 *   6. A task longer than everybody's day is a CONFIGURATION REFUSAL, the twin of
 *      the unknown-skill and empty-band refusals.
 *   7. The hours gate COMPOSES with skills, bands and leave, and the `unfilled`
 *      reason carries all of them.
 *   8. THE MODEL IS OPT-IN. A configuration that mentions none of the four hours
 *      fields is byte-identical to what it was before hours existed — same
 *      roster, same `unfilled`, same `load` shape, same `score.breakdown`.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
    generateRosterV2,
    validateRosterV2Config,
    auditHardConstraints,
    scoreRoster,
    weekStartOf,
    defaultMaxHoursPerDay,
    ROSTER_V2_DEFAULTS,
    DEFAULT_TASK_HOURS,
    DEFAULT_WEEKLY_HOURS,
    SOFT_PENALTY_WEIGHTS,
    HOURS_SOFT_PENALTY_WEIGHTS,
    toLocalDateKey,
    parseLocalDateKey,
} from './rosterEngineV2';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Every shift, flattened, each tagged with the key it sits under. */
const flatten = (roster) =>
    Object.entries(roster).flatMap(([dateKey, shifts]) =>
        shifts.map((shift) => ({ dateKey, shift })),
    );

/** Everyone named on a shift, whichever fields carry them. */
const peopleOn = (shift) =>
    Array.isArray(shift.assignees)
        ? shift.assignees
        : [shift.lead, shift.coLead].filter(Boolean);

/**
 * The roster's total assigned hours, computed from the CONFIG's own durations
 * rather than from anything the engine reported — so `load.hours` is checked
 * against an independent count and not against itself.
 */
const totalAssignedHours = (roster, config) => {
    const hoursOf = new Map(config.tasks.map((task) => [
        task.name,
        typeof task.hours === 'number' ? task.hours : DEFAULT_TASK_HOURS,
    ]));
    let total = 0;
    for (const { shift } of flatten(roster)) total += hoursOf.get(shift.task) * peopleOn(shift).length;
    return total;
};

/** name -> hours held on `dateKey`, computed from the roster the same way. */
const hoursOnDate = (roster, config, dateKey) => {
    const hoursOf = new Map(config.tasks.map((task) => [
        task.name,
        typeof task.hours === 'number' ? task.hours : DEFAULT_TASK_HOURS,
    ]));
    const out = {};
    for (const shift of roster[dateKey] || []) {
        for (const name of peopleOn(shift)) {
            out[name] = (out[name] || 0) + hoursOf.get(shift.task);
        }
    }
    return out;
};

/**
 * 2026-09-07 is a MONDAY, so no start-date snap warning muddies the assertions.
 * 2026-09-12 is the Saturday and 2026-09-13 the Sunday that CLOSE that same
 * Monday–Sunday week — the pair the week convention turns on.
 */
const MONDAY_START = '2026-09-07';
const SATURDAY = '2026-09-12';
const SUNDAY = '2026-09-13';
const NEXT_MONDAY = '2026-09-14';

/** The shipped daily cap, derived rather than typed: 42 / 5. */
const SHIPPED_DAILY_CAP = defaultMaxHoursPerDay(DEFAULT_WEEKLY_HOURS);

// ═════════════════════════════════════════════════════════════════════════════
// 1. THE CONSTANTS — the vocabulary the wizard will read
// ═════════════════════════════════════════════════════════════════════════════

describe('the hours constants', () => {
    it('defaults an unspecified task to a FOUR-hour session, not an eight-hour day', () => {
        expect(DEFAULT_TASK_HOURS).toBe(4);
        expect(ROSTER_V2_DEFAULTS.taskHours).toBe(DEFAULT_TASK_HOURS);
    });

    it('defaults the contracted week to the 42 hours both teams work', () => {
        expect(DEFAULT_WEEKLY_HOURS).toBe(42);
        expect(ROSTER_V2_DEFAULTS.weeklyHours).toBe(DEFAULT_WEEKLY_HOURS);
    });

    it('derives the daily cap from the weekly figure over a five-day week', () => {
        expect(defaultMaxHoursPerDay(42)).toBe(8.4);
        expect(defaultMaxHoursPerDay(35)).toBe(7);
        expect(defaultMaxHoursPerDay(40)).toBe(8);
    });

    it('keeps the two default sessions of a day INSIDE the derived cap', () => {
        // Load-bearing arithmetic, not a coincidence: the shipped
        // `maxConcurrentPerDay` is 2, so 2 × 4h = 8h must fit 8.4h or switching
        // the model on would break every existing roster it touched.
        expect(ROSTER_V2_DEFAULTS.maxConcurrentPerDay * DEFAULT_TASK_HOURS)
            .toBeLessThanOrEqual(SHIPPED_DAILY_CAP);
    });

    it('exposes the hours weight, frozen, and leaves the pinned table alone', () => {
        expect(HOURS_SOFT_PENALTY_WEIGHTS).toEqual({ hoursImbalance: 0.25 });
        expect(Object.isFrozen(HOURS_SOFT_PENALTY_WEIGHTS)).toBe(true);
        // The overlay exists precisely BECAUSE this table is pinned elsewhere.
        // If these two ever merge, that pin moved deliberately — see the engine's
        // comment on `HOURS_SOFT_PENALTY_WEIGHTS`.
        expect(SOFT_PENALTY_WEIGHTS).not.toHaveProperty('hoursImbalance');
        expect(Object.isFrozen(SOFT_PENALTY_WEIGHTS)).toBe(true);
    });
});

describe('weekStartOf — the week convention the caps are applied over', () => {
    const startOf = (key) => toLocalDateKey(weekStartOf(parseLocalDateKey(key)));

    it('maps every day of a Monday–Sunday week to that week`s Monday', () => {
        expect(startOf(MONDAY_START)).toBe(MONDAY_START);
        expect(startOf('2026-09-09')).toBe(MONDAY_START);
        expect(startOf(SATURDAY)).toBe(MONDAY_START);
    });

    it('puts a SUNDAY in the week that opened before it, not the one after', () => {
        // The whole point of this function existing beside `snapToMonday`, which
        // moves a Sunday the OTHER way. A lab weekend is Saturday AND Sunday, and
        // charging them to two different weeks would make the 42-hour cap
        // meaningless on the one shape of week it exists to govern.
        expect(startOf(SUNDAY)).toBe(MONDAY_START);
        expect(startOf(NEXT_MONDAY)).toBe(NEXT_MONDAY);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. THE OPT-IN PREDICATE — the additive claim, tested in-suite
// ═════════════════════════════════════════════════════════════════════════════

describe('the hours model is OPT-IN', () => {
    const plain = () => ({
        startDate: MONDAY_START,
        weeks: 3,
        staff: [{ name: 'Ada' }, { name: 'Ben' }, { name: 'Cleo', fte: 0.6 }],
        tasks: [
            { name: 'Clinic', days: [1, 2, 3, 4, 5] },
            { name: 'Sat', days: [6], coLeads: 0 },
        ],
    });

    it('produces the pre-hours `load` entry when nothing mentions hours', () => {
        const { load } = generateRosterV2(plain());
        expect(Object.keys(load.Ada)).toEqual(['duties', 'fte', 'weighted', 'share']);
    });

    it('produces the pre-hours `score.breakdown` when nothing mentions hours', () => {
        const { score } = generateRosterV2(plain());
        expect(Object.keys(score.breakdown)).toEqual([
            'loadImbalance', 'taskRepetition', 'weekendImbalance', 'isolatedDays',
        ]);
    });

    it('changes NEITHER the roster nor the unfilled list when hours are switched on', () => {
        // `rules: { weeklyHours: 42 }` is the same 42 the model defaults to, so
        // the only thing it can change is whether hours are IN FORCE.
        const off = generateRosterV2(plain());
        const on = generateRosterV2({ ...plain(), rules: { weeklyHours: 42 } });

        expect(on.roster).toEqual(off.roster);
        expect(on.unfilled).toEqual(off.unfilled);
        expect(on.warnings).toEqual(off.warnings);
        expect(on.score.hardViolations).toBe(0);
    });

    it('adds the three hours fields to `load`, and only then', () => {
        const { load } = generateRosterV2({ ...plain(), rules: { weeklyHours: 42 } });
        expect(Object.keys(load.Ada)).toEqual([
            'duties', 'fte', 'weighted', 'share', 'hours', 'hoursPerWeek', 'weeklyCap',
        ]);
        expect(load.Ada.hoursPerWeek).toHaveLength(3);
        expect(load.Ada.weeklyCap).toBe(42);
        expect(load.Cleo.weeklyCap).toBe(25.2);
    });

    it('adds `hoursImbalance` to the breakdown, and only then', () => {
        const { score } = generateRosterV2({ ...plain(), rules: { weeklyHours: 42 } });
        expect(score.breakdown).toHaveProperty('hoursImbalance');
    });

    it('is switched on by ANY of the four fields, including one task`s hours', () => {
        const viaTask = generateRosterV2({
            ...plain(),
            tasks: [{ name: 'Clinic', days: [1, 2, 3, 4, 5], hours: 4 }, { name: 'Sat', days: [6], coLeads: 0 }],
        });
        const viaStaffWeek = generateRosterV2({
            ...plain(),
            staff: [{ name: 'Ada', weeklyHours: 42 }, { name: 'Ben' }, { name: 'Cleo', fte: 0.6 }],
        });
        const viaStaffDay = generateRosterV2({
            ...plain(),
            staff: [{ name: 'Ada', maxHoursPerDay: 8.4 }, { name: 'Ben' }, { name: 'Cleo', fte: 0.6 }],
        });
        const viaRulesDay = generateRosterV2({ ...plain(), rules: { maxHoursPerDay: 8.4 } });

        for (const run of [viaTask, viaStaffWeek, viaStaffDay, viaRulesDay]) {
            expect(run.load.Ada).toHaveProperty('hours');
            expect(run.score.breakdown).toHaveProperty('hoursImbalance');
        }
    });

    it('leaves an over-2-duty day alone when hours were never asked for', () => {
        // THE case the opt-in exists for. Three 4-hour sessions is 12 hours,
        // which no 8.4-hour cap would allow — and this configuration never
        // mentioned an hour, so the engine must not start deciding for it.
        const config = {
            startDate: MONDAY_START, weeks: 1,
            staff: [{ name: 'Solo', maxPerDay: 3 }],
            tasks: ['A', 'B', 'C'].map((name) => ({ name, days: [1], coLeads: 0 })),
        };
        const { roster, unfilled, score } = generateRosterV2(config);

        expect(roster[MONDAY_START]).toHaveLength(3);
        expect(unfilled).toEqual([]);
        expect(score.hardViolations).toBe(0);
        expect(auditHardConstraints(roster, config).count).toBe(0);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. THE DEFAULT DURATION
// ═════════════════════════════════════════════════════════════════════════════

describe('a task with no `hours`', () => {
    const oneTask = (task) => ({
        startDate: MONDAY_START, weeks: 1,
        staff: [{ name: 'Ada' }],
        tasks: [{ name: 'One', days: [1], coLeads: 0, ...task }],
        rules: { weeklyHours: 42 },
    });

    it('counts as four hours', () => {
        expect(generateRosterV2(oneTask({})).load.Ada.hours).toBe(4);
    });

    it('is indistinguishable from `hours: 4` stated explicitly', () => {
        expect(generateRosterV2(oneTask({ hours: 4 })).load)
            .toEqual(generateRosterV2(oneTask({})).load);
    });

    it('treats `hours: null` as absent rather than as zero', () => {
        expect(generateRosterV2(oneTask({ hours: null })).load.Ada.hours).toBe(4);
    });

    it('says so in the refusal when the default is what does not fit', () => {
        // The roster master never typed a duration, so the refusal has to say
        // where the number it is refusing came from.
        const { valid, reason } = validateRosterV2Config({
            startDate: MONDAY_START, weeks: 1,
            staff: [{ name: 'Ada' }],
            tasks: [{ name: 'T' }],
            rules: { maxHoursPerDay: 3 },
        });
        expect(valid).toBe(false);
        expect(reason).toContain('no hours given, so 4h is assumed');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. SAME-DAY DURATIONS SUM — the hard daily cap
// ═════════════════════════════════════════════════════════════════════════════

describe('same-day durations sum against the daily cap', () => {
    /** One person, three 4-hour sessions on one Wednesday, three duties allowed. */
    const threeSessions = () => ({
        startDate: '2026-09-14', weeks: 1,
        staff: [{ name: 'Ada' }],
        tasks: [
            { name: 'Ward Round', days: [3], coLeads: 0 },
            { name: 'Clinic', days: [3], coLeads: 0 },
            { name: 'Review', days: [3], coLeads: 0 },
        ],
        rules: { maxConcurrentPerDay: 3, weeklyHours: 42 },
    });

    it('fills what fits and refuses what does not', () => {
        const { roster, unfilled } = generateRosterV2(threeSessions());
        // 4 + 4 = 8h fits an 8.4h day; the third would be 12h.
        expect(roster['2026-09-16'].map((shift) => shift.task)).toEqual(['Ward Round', 'Clinic']);
        expect(unfilled).toHaveLength(1);
        expect(unfilled[0]).toMatchObject({ date: '2026-09-16', task: 'Review', role: 'lead' });
    });

    it('reports the breach with an HOURS reason naming the total, the cap and the day`s work', () => {
        const { unfilled } = generateRosterV2(threeSessions());
        expect(unfilled[0].reason).toBe(
            'no available staff for Review lead on 2026-09-16 (1 in pool, 1 over their daily hours limit)'
            + ' — Ada would reach 12h on 2026-09-16, over their 8.4h daily limit'
            + ' (already on Ward Round 4h, Clinic 4h)',
        );
    });

    it('distinguishes the hours limit from the duty-count limit in the same sentence', () => {
        // `maxPerDay: 1` and a 12-hour day are different refusals and must not
        // read the same. `at daily limit` is the duty count; the hours clause says
        // `over their daily hours limit`.
        const duties = generateRosterV2({
            ...threeSessions(),
            staff: [{ name: 'Ada', maxPerDay: 1 }],
        });
        expect(duties.unfilled[0].reason).toContain('1 at daily limit');
        expect(duties.unfilled[0].reason).not.toContain('hours limit');

        const hours = generateRosterV2(threeSessions());
        expect(hours.unfilled[0].reason).toContain('1 over their daily hours limit');
        expect(hours.unfilled[0].reason).not.toContain('at daily limit');
    });

    it('never assigns past the cap — measured off the finished roster', () => {
        const config = threeSessions();
        const { roster } = generateRosterV2(config);
        for (const hours of Object.values(hoursOnDate(roster, config, '2026-09-16'))) {
            expect(hours).toBeLessThanOrEqual(SHIPPED_DAILY_CAP);
        }
    });

    it('allows a single duty that exactly fills the day rather than refusing it', () => {
        // 8 ≤ 8.4. The epsilon lives on the cap side for exactly this reason.
        const { roster, unfilled } = generateRosterV2({
            startDate: MONDAY_START, weeks: 1,
            staff: [{ name: 'Ada' }],
            tasks: [
                { name: 'Full Day A', days: [1], hours: 8, coLeads: 0 },
                { name: 'Full Day B', days: [1], hours: 8, coLeads: 0 },
            ],
            rules: { weeklyHours: 42 },
        });
        expect(roster[MONDAY_START]).toHaveLength(1);
        expect(unfilled[0].reason).toContain('Ada would reach 16h');
        expect(unfilled[0].reason).toContain('over their 8.4h daily limit');
    });

    it('accepts a fractional cap without a floating-point tail in the sentence', () => {
        const { unfilled } = generateRosterV2({
            startDate: MONDAY_START, weeks: 1,
            staff: [{ name: 'Ada', maxHoursPerDay: 6.5 }],
            tasks: [
                { name: 'A', days: [1], hours: 4.5, coLeads: 0 },
                { name: 'B', days: [1], hours: 2.5, coLeads: 0 },
            ],
            rules: { maxConcurrentPerDay: 2 },
        });
        expect(unfilled[0].reason).toContain('would reach 7h on 2026-09-07, over their 6.5h daily limit');
    });

    it('names at most three blocked people and counts the rest', () => {
        const { unfilled } = generateRosterV2({
            startDate: MONDAY_START, weeks: 1,
            staff: ['A', 'B', 'C', 'D', 'E'].map((name) => ({ name, maxHoursPerDay: 4 })),
            tasks: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']
                .map((name) => ({ name, days: [1], hours: 4, coLeads: 0 })),
            rules: { weeklyHours: 42 },
        });
        const { reason } = unfilled[0];
        expect(reason).toContain('5 over their daily hours limit');
        expect(reason).toContain('A would reach 8h');
        expect(reason).toContain('C would reach 8h');
        expect(reason).toContain('and 2 others over an hours limit');
        // The names it drops are dropped, not misreported.
        expect(reason).not.toContain('D would reach');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. THE WEEKLY CAP, AND THE WEEK BOUNDARY
// ═════════════════════════════════════════════════════════════════════════════

describe('the weekly cap', () => {
    /** Two 4-hour benches every day of the week: 56 hours demanded, 42 allowed. */
    const sevenDayWeek = (over = {}) => ({
        startDate: MONDAY_START, weeks: 2,
        staff: [{ name: 'Ada' }],
        tasks: [
            { name: 'Bench A', days: [0, 1, 2, 3, 4, 5, 6], coLeads: 0 },
            { name: 'Bench B', days: [0, 1, 2, 3, 4, 5, 6], coLeads: 0 },
        ],
        rules: { maxConsecutiveDays: 20, weeklyHours: 42 },
        ...over,
    });

    it('stops at the last whole session that fits under the cap', () => {
        // 10 sessions is 40h; an 11th would be 44h against 42h. Sessions are
        // indivisible, so 40 is the answer and the 2h of headroom is unusable.
        const { load } = generateRosterV2(sevenDayWeek());
        expect(load.Ada.hoursPerWeek).toEqual([40, 40]);
        expect(load.Ada.hours).toBe(80);
    });

    it('RESETS at the Monday boundary', () => {
        const { load, roster } = generateRosterV2(sevenDayWeek());
        // Week 1's Saturday and Sunday are unstaffable; week 2 opens with a full
        // allowance and its Monday is staffed again.
        expect(roster[SATURDAY]).toBeUndefined();
        expect(roster[SUNDAY]).toBeUndefined();
        expect(roster[NEXT_MONDAY]).toHaveLength(2);
        expect(load.Ada.hoursPerWeek[1]).toBe(40);
    });

    it('reports the breach with a WEEKLY hours reason naming the week', () => {
        const { unfilled } = generateRosterV2(sevenDayWeek());
        const weekly = unfilled.find((entry) => entry.reason.includes('weekly'));
        expect(weekly.date).toBe(SATURDAY);
        expect(weekly.reason).toBe(
            'no available staff for Bench A lead on 2026-09-12 (1 in pool, 1 over their weekly hours limit)'
            + ' — Ada would reach 44h in the week of 2026-09-07, over their 42h weekly limit'
            + ' (40h already assigned)',
        );
    });

    it('never assigns past the weekly cap — measured off the finished roster', () => {
        const { load } = generateRosterV2(sevenDayWeek());
        for (const entry of Object.values(load)) {
            for (const week of entry.hoursPerWeek) {
                expect(week).toBeLessThanOrEqual(entry.weeklyCap);
            }
        }
    });

    it('charges a SUNDAY to the week its Monday opened', () => {
        // A five-weekday roster leaves 2h of headroom under 42, which one more
        // 4-hour session cannot use — so a Sunday-only task in the SAME week is
        // refused, while the identical task in a fresh week is filled. If Sunday
        // were charged forward, the first Sunday would have been staffed.
        const config = {
            startDate: MONDAY_START, weeks: 2,
            staff: [{ name: 'Ada' }],
            tasks: [
                { name: 'Weekday Bench', days: [1, 2, 3, 4, 5], hours: 8, coLeads: 0 },
                { name: 'Sunday Cover', days: [0], hours: 4, coLeads: 0 },
            ],
            rules: { maxConsecutiveDays: 20, weeklyHours: 42 },
        };
        const { roster, load } = generateRosterV2(config);

        expect(load.Ada.hoursPerWeek).toEqual([40, 40]);
        expect(roster[SUNDAY]).toBeUndefined();
        // The second Sunday closes week 2, which is equally full — so the
        // convention is symmetric and not an artefact of the first week.
        expect(roster['2026-09-20']).toBeUndefined();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. FTE SCALES BOTH CAPS
// ═════════════════════════════════════════════════════════════════════════════

describe('FTE scales both hours ceilings', () => {
    const mixedFte = () => ({
        startDate: MONDAY_START, weeks: 1,
        staff: [{ name: 'Pia', fte: 0.6 }, { name: 'Quan', fte: 1.0 }],
        tasks: [
            { name: 'Clinic', days: [1, 2, 3, 4, 5], coLeads: 1 },
            { name: 'Ward', days: [1, 2, 3, 4, 5], coLeads: 1 },
        ],
        rules: { weeklyHours: 42 },
    });

    it('gives a 0.6-FTE colleague 60% of the weekly ceiling', () => {
        const { load } = generateRosterV2(mixedFte());
        expect(load.Pia.weeklyCap).toBe(25.2);
        expect(load.Quan.weeklyCap).toBe(42);
        expect(load.Pia.weeklyCap / load.Quan.weeklyCap).toBeCloseTo(0.6, 10);
    });

    it('scales the DAILY ceiling too, and says the scaled figure in the reason', () => {
        const { unfilled } = generateRosterV2(mixedFte());
        // 8.4 × 0.6 = 5.04, which holds one 4-hour session and not two.
        expect(unfilled[0].reason).toContain('Pia would reach 8h on 2026-09-07, over their 5.04h daily limit');
        expect(unfilled[0].reason).toContain('already on Clinic 4h');
    });

    it('holds a part-timer to one session a day where a full-timer takes two', () => {
        const config = mixedFte();
        const { roster } = generateRosterV2(config);
        const monday = hoursOnDate(roster, config, MONDAY_START);
        expect(monday.Pia).toBe(4);
        expect(monday.Quan).toBe(8);
    });

    it('scales the refusal threshold: 5h is too long for a 0.5-FTE day', () => {
        const { valid, reason } = validateRosterV2Config({
            startDate: MONDAY_START, weeks: 1,
            staff: [{ name: 'Ada', fte: 0.5 }],
            tasks: [{ name: 'Long', hours: 5 }],
        });
        expect(valid).toBe(false);
        expect(reason).toContain("the roomiest is Ada's 4.2h (8.4h scaled by their 0.5 FTE)");
    });

    it('MULTIPLIES a personal weeklyHours by FTE rather than replacing it', () => {
        // Documented limit 4 in the engine's ledger, pinned so that nobody
        // "fixes" it by accident: two ways of saying half-time compound.
        const { load } = generateRosterV2({
            startDate: MONDAY_START, weeks: 1,
            staff: [{ name: 'Ada', weeklyHours: 21, fte: 0.5 }],
            tasks: [{ name: 'Clinic', days: [1, 2, 3, 4, 5], coLeads: 0 }],
        });
        expect(load.Ada.weeklyCap).toBe(10.5);
    });

    it('does NOT derive a personal daily cap from a personal weekly one', () => {
        // Documented limit 5: a 21-hour week worked over three full days is a real
        // arrangement, so the 8.4-hour day stands until somebody says otherwise.
        const config = {
            startDate: MONDAY_START, weeks: 1,
            staff: [{ name: 'Ada', weeklyHours: 21 }],
            tasks: [
                { name: 'AM', days: [1, 2, 3, 4, 5], coLeads: 0 },
                { name: 'PM', days: [1, 2, 3, 4, 5], coLeads: 0 },
            ],
        };
        const { roster, load } = generateRosterV2(config);
        expect(load.Ada.weeklyCap).toBe(21);
        // Two 4-hour sessions on the Monday: 8h ≤ 8.4h, not ≤ 21/5.
        expect(hoursOnDate(roster, config, MONDAY_START).Ada).toBe(8);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. THE ROLLING FOUR-WEEK TOTAL — reported, warned, never enforced
// ═════════════════════════════════════════════════════════════════════════════

describe('the rolling four-week total', () => {
    /**
     * Leave at the FRONT of week 1 and the BACK of week 5, so that every single
     * week stays inside its 42-hour cap while the 28 days from the Friday of
     * week 1 hold 176. A perfectly periodic roster could not do this — every
     * 28-day window of a repeating week sums to exactly four weeks — which is why
     * the window is genuinely rolling and not four buckets.
     */
    const straddling = (over = {}) => ({
        startDate: MONDAY_START, weeks: 5,
        staff: [{
            name: 'Ada',
            unavailable: [
                '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
                '2026-10-09', '2026-10-10', '2026-10-11',
            ],
        }],
        tasks: [
            { name: 'Bench A', days: [0, 1, 2, 3, 4, 5, 6], coLeads: 0 },
            { name: 'Bench B', days: [0, 1, 2, 3, 4, 5, 6], coLeads: 0 },
        ],
        rules: { maxConsecutiveDays: 30, weeklyHours: 42 },
        ...over,
    });

    it('warns, naming the person and the total', () => {
        const { warnings } = generateRosterV2(straddling());
        const rolling = warnings.find((line) => line.includes('28 days'));
        expect(rolling).toBe(
            'Ada is rostered 176h in the 28 days from 2026-09-11 to 2026-10-08,'
            + ' above the 168h a 42h week at 1 FTE implies over 4 weeks.'
            + ' Every individual week is inside its limit — this is the rolling total,'
            + ' which this engine reports and does not enforce.',
        );
    });

    it('does NOT enforce it — every hour it warned about is still rostered', () => {
        const { load, score } = generateRosterV2(straddling());
        expect(load.Ada.hours).toBe(176);
        expect(load.Ada.hoursPerWeek).toEqual([24, 40, 40, 40, 32]);
        // And no hard violation, because the rolling total is not a hard rule.
        expect(score.hardViolations).toBe(0);
    });

    it('is only reachable because each individual week is legal', () => {
        // If a bucketed four-week check could fire, this suite would be pinning a
        // decoy: four capped weeks can never exceed four times the cap.
        const { load } = generateRosterV2(straddling());
        for (const week of load.Ada.hoursPerWeek) expect(week).toBeLessThanOrEqual(42);
        expect(load.Ada.hoursPerWeek.reduce((a, b) => a + b, 0)).toBe(176);
        expect(176).toBeGreaterThan(42 * 4);
    });

    it('stays silent when no 28-day window exceeds the ceiling', () => {
        const { warnings } = generateRosterV2({
            startDate: MONDAY_START, weeks: 6,
            staff: [{ name: 'Ada' }],
            tasks: [{ name: 'Clinic', days: [1, 3, 5], coLeads: 0 }],
            rules: { weeklyHours: 42 },
        });
        expect(warnings.filter((line) => line.includes('28 days'))).toEqual([]);
    });

    it('CANNOT fire on a run shorter than 28 days — a documented blind spot', () => {
        // Ledger item 6. Pinned rather than hidden: three weeks of the same
        // configuration reports nothing, and that silence means "no window", not
        // "no problem".
        const { warnings } = generateRosterV2(straddling({ weeks: 3 }));
        expect(warnings.filter((line) => line.includes('28 days'))).toEqual([]);
    });

    it('scales the ceiling by FTE and says which contract produced it', () => {
        const { warnings } = generateRosterV2(straddling({
            staff: [{
                name: 'Pia',
                fte: 0.5,
                maxHoursPerDay: 8.4,
                unavailable: straddling().staff[0].unavailable,
            }],
        }));
        const rolling = warnings.find((line) => line.includes('28 days'));
        expect(rolling).toContain('above the 84h a 42h week at 0.5 FTE implies over 4 weeks');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

describe('validation of the hours fields', () => {
    const base = (over) => ({
        startDate: MONDAY_START, weeks: 1,
        staff: [{ name: 'Ada' }],
        tasks: [{ name: 'T' }],
        ...over,
    });
    const reasonFor = (config) => {
        const result = validateRosterV2Config(config);
        expect(result.valid).toBe(false);
        return result.reason;
    };

    it('refuses a task whose hours are not a number', () => {
        expect(reasonFor(base({ tasks: [{ name: 'T', hours: '4' }] })))
            .toBe("Task T's hours must be a number of hours, e.g. 4 for a half-day session — leave it out and 4 is assumed.");
    });

    it('refuses a task of zero or negative hours', () => {
        expect(reasonFor(base({ tasks: [{ name: 'T', hours: 0 }] })))
            .toBe("Task T's hours is 0 — it must be greater than 0 and at most 24 (a task cannot be longer than a day).");
        expect(reasonFor(base({ tasks: [{ name: 'T', hours: -4 }] }))).toContain('must be greater than 0');
    });

    it('refuses a task longer than a calendar day', () => {
        expect(reasonFor(base({ tasks: [{ name: 'T', hours: 25 }] })))
            .toContain('hours is 25 — it must be greater than 0 and at most 24');
    });

    it('accepts a fractional duration', () => {
        expect(validateRosterV2Config(base({ tasks: [{ name: 'T', hours: 4.5 }] })))
            .toEqual({ valid: true, reason: null });
    });

    it('refuses a weeklyHours outside the hours in a week', () => {
        expect(reasonFor(base({ staff: [{ name: 'Ada', weeklyHours: 0 }] })))
            .toBe("Ada's weeklyHours is 0 — it must be greater than 0 and at most 168 (the number of hours in a week).");
        expect(reasonFor(base({ staff: [{ name: 'Ada', weeklyHours: 200 }] }))).toContain('at most 168');
        expect(reasonFor(base({ rules: { weeklyHours: 169 } }))).toContain('rules.weeklyHours is 169');
    });

    it('refuses a maxHoursPerDay outside the hours in a day', () => {
        expect(reasonFor(base({ staff: [{ name: 'Ada', maxHoursPerDay: 25 }] }))).toContain('at most 24');
        expect(reasonFor(base({ rules: { maxHoursPerDay: 0 } }))).toContain('rules.maxHoursPerDay is 0');
    });

    it('refuses a non-numeric limit rather than coercing it', () => {
        expect(reasonFor(base({ staff: [{ name: 'Ada', maxHoursPerDay: '8' }] })))
            .toBe("Ada's maxHoursPerDay must be a number of hours, e.g. 8.4 — leave it out to use the department's figure.");
        expect(reasonFor(base({ rules: { weeklyHours: '42' } })))
            .toBe('rules.weeklyHours must be a number of hours, e.g. 42 — the contracted working week.');
    });

    it('accepts a 37.5-hour contract with a 7.5-hour day', () => {
        expect(validateRosterV2Config(base({
            staff: [{ name: 'Ada', weeklyHours: 37.5, maxHoursPerDay: 7.5 }],
            tasks: [{ name: 'T', hours: 3.75 }],
        }))).toEqual({ valid: true, reason: null });
    });

    it('leaves a non-object `rules` to the rule that owns that reason', () => {
        expect(reasonFor(base({ rules: 'nope' })))
            .toBe('Rules must be an object — expected { maxConcurrentPerDay, maxConsecutiveDays, forbidPairs, bands }.');
    });
});

describe('a task too long for anybody is a CONFIGURATION REFUSAL', () => {
    it('refuses it at validate time, naming the roomiest day in the department', () => {
        const { valid, reason } = validateRosterV2Config({
            startDate: MONDAY_START, weeks: 1,
            staff: [{ name: 'Ada' }, { name: 'Ben', maxHoursPerDay: 6 }],
            tasks: [{ name: 'Marathon', hours: 12 }],
        });
        expect(valid).toBe(false);
        expect(reason).toBe(
            "Task Marathon takes 12h, which is longer than every staff member's daily hours limit"
            + " — the roomiest is Ada's 8.4h, so every slot of this task would be unfilled on every date."
            + ' Shorten the task, raise maxHoursPerDay, or give it to somebody whose day can hold it.',
        );
    });

    it('makes `generateRosterV2` refuse rather than return an empty roster', () => {
        const result = generateRosterV2({
            startDate: MONDAY_START, weeks: 1,
            staff: [{ name: 'Ada' }],
            tasks: [{ name: 'Marathon', hours: 12 }],
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('longer than every staff member');
        expect(result).not.toHaveProperty('roster');
    });

    it('does NOT refuse when ONE person can hold it — that is a warning, not an error', () => {
        // Bands and skills behave the same way: the pool only has to be non-empty.
        const config = {
            startDate: MONDAY_START, weeks: 1,
            staff: [{ name: 'Ada' }, { name: 'Ben', maxHoursPerDay: 4 }],
            tasks: [{ name: 'Long Clinic', days: [1], hours: 6, coLeads: 0 }],
            rules: { weeklyHours: 42 },
        };
        expect(validateRosterV2Config(config).valid).toBe(true);

        const { roster, warnings } = generateRosterV2(config);
        expect(roster[MONDAY_START][0].lead).toBe('Ada');
        expect(warnings).toContain(
            'Task Long Clinic takes 6h, which is longer than the daily hours limit of 1 staff member'
            + ' (Ben (4h)), so they can never be rostered on it.',
        );
    });

    it('refuses when the department`s own cap is what the default cannot fit', () => {
        const { valid, reason } = validateRosterV2Config({
            startDate: MONDAY_START, weeks: 1,
            staff: [{ name: 'Ada' }],
            tasks: [{ name: 'T' }],
            rules: { maxHoursPerDay: 3 },
        });
        expect(valid).toBe(false);
        expect(reason).toContain("the roomiest is Ada's 3h");
    });

    it('does not fire for a configuration that never mentioned hours', () => {
        // A 0.4-FTE solo pool has a 3.36h day against the assumed 4h session. It
        // must NOT be refused: nothing here asked to be judged in hours.
        expect(validateRosterV2Config({
            startDate: MONDAY_START, weeks: 1,
            staff: [{ name: 'Tiny', fte: 0.4 }],
            tasks: [{ name: 'Clinic', days: [1] }],
        })).toEqual({ valid: true, reason: null });
    });

    it('DOES fire for that same pool once hours are asked for', () => {
        expect(validateRosterV2Config({
            startDate: MONDAY_START, weeks: 1,
            staff: [{ name: 'Tiny', fte: 0.4 }],
            tasks: [{ name: 'Clinic', days: [1] }],
            rules: { weeklyHours: 42 },
        }).valid).toBe(false);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. COMPOSITION WITH THE OTHER GATES
// ═════════════════════════════════════════════════════════════════════════════

describe('the hours gate composes with skills, bands and leave', () => {
    /**
     * Three 5-hour CPET sessions on one Monday, all skill-gated and band-gated.
     * Ada (AH15, CPET) is the only eligible lead once Ben (AH13, CPET) is on
     * leave — Cleo holds CPET but is out of band, Dara is in band but has no
     * CPET — and Ada's 8.4-hour day holds exactly one 5-hour session.
     */
    const composed = () => ({
        startDate: MONDAY_START, weeks: 1,
        staff: [
            { name: 'Ada', grade: 'AH15', skills: ['CPET'] },
            { name: 'Ben', grade: 'AH13', skills: ['CPET'], unavailable: [MONDAY_START] },
            { name: 'Cleo', grade: 'AH9', skills: ['CPET'] },
            { name: 'Dara', grade: 'AH16' },
        ],
        tasks: ['Morning CPET', 'Afternoon CPET', 'Evening CPET'].map((name) => ({
            name, days: [1], requiresSkill: 'CPET', leadBands: ['senior', 'principal'], hours: 5, coLeads: 0,
        })),
        rules: { weeklyHours: 42, maxConcurrentPerDay: 3 },
    });

    it('fills the one session that fits and reports the other two', () => {
        const { roster, unfilled } = generateRosterV2(composed());
        expect(roster[MONDAY_START]).toHaveLength(1);
        expect(roster[MONDAY_START][0].lead).toBe('Ada');
        expect(unfilled.map((entry) => entry.task)).toEqual(['Afternoon CPET', 'Evening CPET']);
    });

    it('carries the skill, the band, the leave AND the hours in one reason', () => {
        const { unfilled } = generateRosterV2(composed());
        expect(unfilled[0].reason).toBe(
            'no available staff hold skill CPET and sit in the Senior/Principal band for'
            + ' Afternoon CPET lead on 2026-09-07'
            + ' (3 qualified, 2 in band, 1 on leave, 1 over their daily hours limit)'
            + ' — Ada would reach 10h on 2026-09-07, over their 8.4h daily limit'
            + ' (already on Morning CPET 5h)',
        );
    });

    it('still refuses rather than reaching outside the band to fill the hours', () => {
        // Dara has a free 8.4-hour day and a principal grade; she lacks CPET.
        // Cleo holds CPET and has a free day; she is out of band. Neither is drafted.
        const { roster } = generateRosterV2(composed());
        const everyone = flatten(roster).flatMap(({ shift }) => peopleOn(shift));
        expect(everyone).toEqual(['Ada']);
    });

    it('generates zero hard violations even when three gates bind at once', () => {
        const config = composed();
        const { roster, score } = generateRosterV2(config);
        expect(score.hardViolations).toBe(0);
        expect(auditHardConstraints(roster, config)).toMatchObject({ ok: true, count: 0 });
    });
});

describe('slot ordering counts the hours gate (most constrained first)', () => {
    /**
     * A 6-hour clinic and a 4-hour review on the same Monday. Ada's day holds
     * either; Ben's 4-hour day holds only the review. The clinic is therefore the
     * SCARCER slot, and filling the review first would strand it.
     */
    const tasks = [
        { name: 'Short Review', days: [1], hours: 4, coLeads: 0 },
        { name: 'Long Clinic', days: [1], hours: 6, coLeads: 0 },
    ];
    const mrv = (order) => ({
        startDate: MONDAY_START, weeks: 1,
        staff: [{ name: 'Ada' }, { name: 'Ben', maxHoursPerDay: 4 }],
        tasks: order,
        rules: { weeklyHours: 42 },
    });

    it('fills both slots whichever order the tasks are configured in', () => {
        for (const order of [tasks, [...tasks].reverse()]) {
            const { roster, unfilled } = generateRosterV2(mrv(order));
            expect(unfilled).toEqual([]);
            const byTask = Object.fromEntries(
                roster[MONDAY_START].map((shift) => [shift.task, shift.lead]),
            );
            expect(byTask).toEqual({ 'Long Clinic': 'Ada', 'Short Review': 'Ben' });
        }
    });

    it('spends the roomy day on the long slot, not on the one anybody could take', () => {
        const { roster } = generateRosterV2(mrv(tasks));
        const clinic = roster[MONDAY_START].find((shift) => shift.task === 'Long Clinic');
        expect(clinic.lead).toBe('Ada');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. THE AUDIT — hours breaches caught on read-back
// ═════════════════════════════════════════════════════════════════════════════

describe('auditHardConstraints reads hours back off the roster', () => {
    const dailyConfig = {
        startDate: '2026-09-14', weeks: 1,
        staff: [{ name: 'Ada' }],
        tasks: [
            { name: 'Ward Round', days: [3], coLeads: 0 },
            { name: 'Clinic', days: [3], coLeads: 0 },
            { name: 'Review', days: [3], coLeads: 0 },
        ],
        rules: { maxConcurrentPerDay: 3, weeklyHours: 42 },
    };
    const shift = (task) => ({
        task, lead: 'Ada', staff: 'Lead: Ada', category: 'CORE', week: 1, assignees: ['Ada'],
    });

    it('catches a hand-edited day that sums past the daily cap', () => {
        // Exactly what a swap tool would do: move a third session onto a full day.
        const audit = auditHardConstraints({
            '2026-09-16': [shift('Ward Round'), shift('Clinic'), shift('Review')],
        }, dailyConfig);

        expect(audit.ok).toBe(true);
        expect(audit.violations).toContainEqual({
            rule: 'dailyHours', date: '2026-09-16', task: null,
            detail: 'Ada holds 12h, limit 8.4h',
        });
    });

    it('passes the same day when it is inside the cap', () => {
        expect(auditHardConstraints({
            '2026-09-16': [shift('Ward Round'), shift('Clinic')],
        }, dailyConfig)).toMatchObject({ ok: true, count: 0 });
    });

    const weeklyConfig = {
        startDate: MONDAY_START, weeks: 1,
        staff: [{ name: 'Ada' }],
        tasks: [{ name: 'Bench', days: [1, 2, 3, 4, 5, 6, 0], hours: 8, coLeads: 0 }],
        rules: { weeklyHours: 42 },
    };
    const wholeWeek = () => {
        const out = {};
        for (const day of ['07', '08', '09', '10', '11', '12', '13']) {
            out[`2026-09-${day}`] = [{
                task: 'Bench', lead: 'Ada', staff: 'Lead: Ada', category: 'CORE', week: 1, assignees: ['Ada'],
            }];
        }
        return out;
    };

    it('catches a week that sums past the weekly cap, ONCE, against its Monday', () => {
        const audit = auditHardConstraints(wholeWeek(), weeklyConfig);
        const weekly = audit.violations.filter((entry) => entry.rule === 'weeklyHours');

        // Seven 8-hour days is 56h. Reported once — Saturday and Sunday belong to
        // the same Monday–Sunday week, so this is one breach and not two.
        expect(weekly).toEqual([{
            rule: 'weeklyHours', date: MONDAY_START, task: null,
            detail: 'Ada holds 56h in the week of 2026-09-07, limit 42h',
        }]);
    });

    it('surfaces the breach through `scoreRoster`, so hardViolations is not zero', () => {
        expect(scoreRoster(wholeWeek(), weeklyConfig).hardViolations).toBeGreaterThan(0);
    });

    it('audits NOTHING in hours for a configuration that never mentioned them', () => {
        const noHours = { ...dailyConfig, rules: { maxConcurrentPerDay: 3 } };
        const audit = auditHardConstraints({
            '2026-09-16': [shift('Ward Round'), shift('Clinic'), shift('Review')],
        }, noHours);
        expect(audit).toMatchObject({ ok: true, count: 0 });
    });

    it('gives every roster this engine builds a clean hours audit', () => {
        const config = {
            startDate: MONDAY_START, weeks: 4,
            staff: [
                { name: 'Ada' }, { name: 'Ben', fte: 0.6 },
                { name: 'Cleo', maxHoursPerDay: 6 }, { name: 'Dara', weeklyHours: 30 },
            ],
            tasks: [
                { name: 'Clinic', days: [1, 2, 3, 4, 5], hours: 4, coLeads: 1 },
                { name: 'Ward', days: [1, 2, 3, 4, 5], hours: 2, coLeads: 0 },
                { name: 'Saturday', days: [6], hours: 6, coLeads: 0 },
            ],
        };
        const { roster, score } = generateRosterV2(config);
        expect(score.hardViolations).toBe(0);
        const audit = auditHardConstraints(roster, config);
        expect(audit.violations.filter((entry) => entry.rule.endsWith('Hours'))).toEqual([]);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. LOAD AND SCORE
// ═════════════════════════════════════════════════════════════════════════════

describe('load.hours', () => {
    const config = () => ({
        startDate: MONDAY_START, weeks: 4,
        staff: [
            { name: 'Anitha' }, { name: 'Boon Keat' },
            { name: 'Chandra' }, { name: 'Devi' },
        ],
        tasks: [
            { name: 'Chemistry Bench', days: [1, 2, 3, 4, 5], hours: 4, coLeads: 1 },
            { name: 'Result Review', days: [1, 3, 5], hours: 2, coLeads: 0 },
            { name: 'Saturday Bench', days: [6], hours: 6, coLeads: 0 },
        ],
        rules: { weeklyHours: 42 },
    });

    it('sums across the team to the roster`s total assigned hours', () => {
        const cfg = config();
        const { roster, load } = generateRosterV2(cfg);
        const reported = Object.values(load).reduce((sum, entry) => sum + entry.hours, 0);
        expect(reported).toBe(totalAssignedHours(roster, cfg));
    });

    it('sums each person`s weeks to that person`s total', () => {
        // True for every duration that rounds cleanly to two places, which is
        // every duration a roster master will type. The next test is the case
        // where it is NOT true, and says which of the two figures is authoritative.
        const { load } = generateRosterV2(config());
        for (const entry of Object.values(load)) {
            expect(entry.hoursPerWeek.reduce((a, b) => a + b, 0)).toBe(entry.hours);
        }
    });

    it('rounds the TOTAL once, not the weeks and then the sum', () => {
        // A deliberately awkward duration — 1.125h is an hour and seven and a
        // half minutes — chosen because it separates two definitions of the total
        // that agree on every ordinary number. `hours` must be the roster's real
        // total (4 × 1.125 = 4.5); adding up four separately-rounded weeks gives
        // 4.52 and invents two minutes out of nowhere.
        //
        // This test exists because a mutation that swapped the two definitions
        // survived the rest of this suite. The consequence — `hours` and the sum
        // of `hoursPerWeek` disagreeing in the last hundredth for a duration with
        // more than two decimal places — is item 12 in the engine's limits ledger.
        const cfg = {
            startDate: MONDAY_START, weeks: 4,
            staff: [{ name: 'Ada' }],
            tasks: [{ name: 'Handover', days: [1], hours: 1.125, coLeads: 0 }],
            rules: { weeklyHours: 42 },
        };
        const { roster, load } = generateRosterV2(cfg);

        expect(load.Ada.hours).toBe(4.5);
        expect(load.Ada.hours).toBe(totalAssignedHours(roster, cfg));
        expect(load.Ada.hoursPerWeek).toEqual([1.13, 1.13, 1.13, 1.13]);
        expect(load.Ada.hoursPerWeek.reduce((a, b) => a + b, 0)).toBe(4.52);
    });

    it('carries one figure per generated week, indexed to `shift.week`', () => {
        const cfg = config();
        const { roster, load } = generateRosterV2(cfg);
        expect(load.Anitha.hoursPerWeek).toHaveLength(cfg.weeks);

        // Rebuilt from the shifts' own `week` field, which is the number the
        // calendar shows — so the array index and the displayed week agree.
        const fromShifts = Array.from({ length: cfg.weeks }, () => 0);
        const hoursOf = new Map(cfg.tasks.map((task) => [task.name, task.hours]));
        for (const { shift } of flatten(roster)) {
            if (!peopleOn(shift).includes('Anitha')) continue;
            fromShifts[shift.week - 1] += hoursOf.get(shift.task);
        }
        expect(load.Anitha.hoursPerWeek).toEqual(fromShifts);
    });

    it('reports a zero week rather than omitting it', () => {
        const { load } = generateRosterV2({
            startDate: MONDAY_START, weeks: 3,
            staff: [{ name: 'Ada' }, { name: 'Ben' }],
            tasks: [{ name: 'Monthly', recurrence: { ordinal: 1, weekday: 1 }, coLeads: 0 }],
            rules: { weeklyHours: 42 },
        });
        expect(load.Ben.hours).toBe(0);
        expect(load.Ben.hoursPerWeek).toEqual([0, 0, 0]);
    });
});

describe('score.breakdown.hoursImbalance', () => {
    /** Long and short sessions, evenly split by DUTY and unevenly by HOUR. */
    const mixed = {
        startDate: MONDAY_START, weeks: 1,
        staff: [{ name: 'Ada' }, { name: 'Ben' }],
        tasks: [
            { name: 'Long Clinic', days: [1, 2, 3, 4, 5], hours: 6, coLeads: 0 },
            { name: 'Short Review', days: [1, 2, 3, 4, 5], hours: 2, coLeads: 0 },
        ],
        rules: { weeklyHours: 42 },
    };

    it('is non-zero exactly where loadImbalance cannot see the problem', () => {
        // THE documented asymmetry (ledger item 2): fairness is counted in duties,
        // so five duties each looks perfect while the hours differ by four.
        const { load, score } = generateRosterV2(mixed);
        expect(load.Ada.duties).toBe(load.Ben.duties);
        expect(score.breakdown.loadImbalance).toBe(0);
        expect(load.Ada.hours).toBe(22);
        expect(load.Ben.hours).toBe(18);
        expect(score.breakdown.hoursImbalance).toBe(4);
    });

    it('is zero when the hours are shared evenly', () => {
        const { score } = generateRosterV2({
            ...mixed,
            tasks: [{ name: 'Clinic', days: [1, 2, 3, 4, 5], hours: 4, coLeads: 1 }],
        });
        expect(score.breakdown.hoursImbalance).toBe(0);
    });

    it('keeps softPenalty the weighted sum of its own breakdown, hours included', () => {
        const { score } = generateRosterV2(mixed);
        const weights = { ...SOFT_PENALTY_WEIGHTS, ...HOURS_SOFT_PENALTY_WEIGHTS };
        const expected = Object.entries(score.breakdown)
            .reduce((sum, [key, value]) => sum + weights[key] * value, 0);
        expect(score.softPenalty).toBeCloseTo(Math.round(expected * 100) / 100, 5);
        expect(Number.isNaN(score.softPenalty)).toBe(false);
    });

    it('measures hours off the finished roster, like every other component', () => {
        const { roster } = generateRosterV2(mixed);
        expect(scoreRoster(roster, mixed).breakdown.hoursImbalance).toBe(4);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 12. THE LAB FIXTURE — 42-hour weeks, weekday sessions and Saturdays
// ═════════════════════════════════════════════════════════════════════════════

describe('a 42-hour-week medical laboratory', () => {
    /**
     * The shape the field research described: four scientists on 42-hour
     * contracts, two benches running Monday to Friday as 4-hour sessions, a
     * 2-hour reporting block three days a week, and two 4-hour Saturday sessions.
     */
    const lab = (over = {}) => ({
        startDate: MONDAY_START,
        weeks: 4,
        staff: [
            { name: 'Anitha', grade: 'AH14', skills: ['MICRO'] },
            { name: 'Boon Keat', grade: 'AH12', skills: ['MICRO'] },
            { name: 'Chandra', grade: 'AH9' },
            { name: 'Devi', grade: 'AH7' },
        ],
        tasks: [
            { name: 'Chemistry Bench', days: [1, 2, 3, 4, 5], hours: 4, coLeads: 1 },
            { name: 'Haematology Bench', days: [1, 2, 3, 4, 5], hours: 4, coLeads: 1 },
            { name: 'Result Review', days: [1, 3, 5], hours: 2, coLeads: 0 },
            { name: 'Saturday Bench AM', days: [6], hours: 4, coLeads: 0 },
            { name: 'Saturday Bench PM', days: [6], hours: 4, coLeads: 0 },
        ],
        rules: { weeklyHours: 42, maxConsecutiveDays: 7 },
        ...over,
    });

    it('generates with zero hard violations and nothing unstaffed', () => {
        const config = lab();
        const run = generateRosterV2(config);

        expect(run.ok).toBe(true);
        expect(run.score.hardViolations).toBe(0);
        expect(run.unfilled).toEqual([]);
        expect(run.warnings).toEqual([]);
        expect(auditHardConstraints(run.roster, config)).toMatchObject({ ok: true, count: 0 });
    });

    it('staffs 60 shifts over 24 working days', () => {
        const { roster } = generateRosterV2(lab());
        expect(Object.keys(roster)).toHaveLength(24);
        expect(flatten(roster)).toHaveLength(60);
    });

    it('keeps every week of every person inside the 42-hour contract', () => {
        const { load } = generateRosterV2(lab());
        for (const entry of Object.values(load)) {
            expect(entry.weeklyCap).toBe(42);
            for (const week of entry.hoursPerWeek) expect(week).toBeLessThanOrEqual(42);
        }
    });

    it('shares 376 hours across the four of them', () => {
        const config = lab();
        const { roster, load } = generateRosterV2(config);
        expect(totalAssignedHours(roster, config)).toBe(376);
        expect(load.Anitha.hours).toBe(94);
        expect(load['Boon Keat'].hours).toBe(94);
        expect(load.Chandra.hours).toBe(92);
        expect(load.Devi.hours).toBe(96);
    });

    it('gives each of them two Saturdays a month — EMERGENT, not enforced', () => {
        // The field research says lab scientists work at least two Saturdays a
        // month. This fixture DEMANDS eight Saturday duties across four people, so
        // fairness delivers two each. There is no Saturday FLOOR in this engine:
        // change the fixture and the number changes with no warning. The floor is
        // a separate, queued piece of work.
        const { roster } = generateRosterV2(lab());
        const saturdays = {};
        for (const { dateKey, shift } of flatten(roster)) {
            if (parseLocalDateKey(dateKey).getDay() !== 6) continue;
            for (const name of peopleOn(shift)) saturdays[name] = (saturdays[name] || 0) + 1;
        }
        expect(saturdays).toEqual({ Anitha: 2, 'Boon Keat': 2, Chandra: 2, Devi: 2 });
    });

    it('refuses the Saturday rather than working a two-person lab over its contract', () => {
        // Same shape, half the staff and a 6-hour Saturday: the weekday benches
        // consume 40 of the 42 hours, so the Saturday cannot be staffed. It is
        // REPORTED, with the week and the arithmetic, not quietly dropped.
        const config = lab({
            weeks: 2,
            staff: [{ name: 'Anitha', grade: 'AH14' }, { name: 'Boon Keat', grade: 'AH12' }],
            tasks: [
                { name: 'Chemistry Bench', days: [1, 2, 3, 4, 5], hours: 4, coLeads: 1 },
                { name: 'Haematology Bench', days: [1, 2, 3, 4, 5], hours: 4, coLeads: 1 },
                { name: 'Saturday Bench', days: [6], hours: 6, coLeads: 1 },
            ],
            rules: { weeklyHours: 42, maxConsecutiveDays: 12 },
        });
        const { load, unfilled, warnings, score } = generateRosterV2(config);

        expect(score.hardViolations).toBe(0);
        expect(load.Anitha.hoursPerWeek).toEqual([40, 40]);
        expect(unfilled.filter((entry) => entry.role === 'lead').map((entry) => entry.date))
            .toEqual([SATURDAY, '2026-09-19']);
        expect(unfilled[0].reason).toContain('2 over their weekly hours limit');
        expect(unfilled[0].reason).toContain('Anitha would reach 46h in the week of 2026-09-07, over their 42h weekly limit');
        expect(unfilled[0].reason).toContain('Boon Keat would reach 46h');
        expect(warnings).toContain(
            "This configuration asks for 184h of work but the team's contracted hours"
            + ' across 2 weeks total 168h, so some slots cannot be filled.',
        );
    });

    it('is deterministic — byte-identical output across repeated runs', () => {
        const first = generateRosterV2(lab());
        for (let i = 0; i < 3; i += 1) {
            expect(JSON.stringify(generateRosterV2(lab()))).toBe(JSON.stringify(first));
        }
    });

    it('is deterministic across a fresh config object with the same values', () => {
        expect(generateRosterV2(lab())).toEqual(generateRosterV2(lab()));
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 13. THE PSYCHOLOGY SHAPE — hours beside recurrence and continuity
// ═════════════════════════════════════════════════════════════════════════════

describe('hours alongside monthly recurrence and continuity', () => {
    const psych = () => ({
        startDate: MONDAY_START, weeks: 12,
        staff: [
            { name: 'Ada', grade: 'AH15' },
            { name: 'Ben', grade: 'AH13' },
            { name: 'Cleo', grade: 'AH9', fte: 0.6 },
        ],
        tasks: [
            { name: 'Perinatal Clinic', recurrence: { ordinal: 3, weekday: 3 }, continuity: true, hours: 6 },
            { name: 'Therapy Group', days: [2], hours: 2, coLeads: 0 },
            { name: 'Report Writing', days: [4], hours: 3, coLeads: 0 },
        ],
        rules: { weeklyHours: 42 },
    });

    it('generates cleanly, with both features and hours in force', () => {
        const config = psych();
        const run = generateRosterV2(config);
        expect(run.score.hardViolations).toBe(0);
        expect(auditHardConstraints(run.roster, config)).toMatchObject({ ok: true, count: 0 });
    });

    it('keeps both breakdown extensions side by side', () => {
        const { score } = generateRosterV2(psych());
        expect(score.breakdown).toHaveProperty('continuityBreaks');
        expect(score.breakdown).toHaveProperty('hoursImbalance');
    });

    it('counts a monthly clinic`s hours in the week it actually runs', () => {
        const { roster, load } = generateRosterV2(psych());
        const clinicDates = flatten(roster)
            .filter(({ shift }) => shift.task === 'Perinatal Clinic')
            .map(({ dateKey }) => dateKey);
        // The 3rd Wednesday of September, October and November 2026.
        expect(clinicDates).toEqual(['2026-09-16', '2026-10-21', '2026-11-18']);

        const weeksWithClinic = new Set(flatten(roster)
            .filter(({ shift }) => shift.task === 'Perinatal Clinic')
            .map(({ shift }) => shift.week - 1));
        for (const week of weeksWithClinic) {
            const anybody = Object.values(load).some((entry) => entry.hoursPerWeek[week] > 0);
            expect(anybody).toBe(true);
        }
    });
});
