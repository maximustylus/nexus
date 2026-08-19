/**
 * ==============================================================================
 * AURA ROSTER ENGINE V2 — THE PRIMITIVE LAYER, SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest
 * Run:    npm test
 *
 * WHY THIS IS A SIBLING FILE AND NOT A NEW `describe` IN AN EXISTING ONE.
 *
 * `rosterEngineV2.test.js` (174), `.grades.test.js` (149), `.psych.test.js` (128),
 * `.hours.test.js` (89) and `.slots.test.js` (89) are the COMPATIBILITY GATE for
 * this change. The claim being made is that the six named features — `days`,
 * `recurrence`, `continuity`, `leadBands`, `requiresSkill`, `slots`, `hours`,
 * `forbidPairs`, `maxConsecutiveDays`, `maxPerDay` — have been re-expressed as
 * instances of SIX PRIMITIVES with ZERO behaviour change. A gate is only worth
 * something if it is untouched, and `git diff --stat` showing zero lines changed
 * in all five is a stronger statement than a diff a reviewer has to read to
 * confirm nothing was softened. All six files run in one command.
 *
 * Everything below is a SPECIFICATION test: a failure is a bug in the engine.
 * Every date list, every label and every quoted reason string was obtained by
 * RUNNING the engine and recording the result — never derived by hand, and never
 * copied from the implementation.
 *
 * WHAT IS BEING PINNED, in one place:
 *
 *   1. TEMPORAL — one grammar for "when does this occur". `days` and `recurrence`
 *      are two SUGARS over one pattern type, and the general form expresses four
 *      things neither sugar can say: 1st AND 3rd of a weekday, alternate weeks,
 *      an explicit date list, and a bounded date range. All four are driven
 *      END TO END through `generateRosterV2`, not only through the resolver.
 *   2. ELIGIBILITY — a composable AND of predicates over a person. `requiresSkill`
 *      and `leadBands` are two KINDS; the kinds are a table, so a third is a row.
 *   3. CAPACITY — one representation for every ceiling: a METER over a PERIOD.
 *      `maxPerDay`, `maxConcurrentPerDay`, "already on this task today",
 *      `maxConsecutiveDays` and the two hours caps are five rows of one table.
 *   4. AFFINITY — pairwise and cross-occurrence preferences WITH POLARITY.
 *      `forbidPairs` is pair/forbid; `continuity` is occurrence/prefer.
 *      `require` (must-pair-with) and `avoid` (rotate-away) are DECLARED and
 *      provably unproduced.
 *   5. STRUCTURE — one internal shift shape. `leads`/`coLeads` and `slots` both
 *      compile to POSITIONS, and the composition step is chosen from a table.
 *   6. QUOTA — declared, NOT enforced, and provably inert.
 *
 *   7. THE SCALE — `GRADE_SCALE`, `DEFAULT_GRADE_BANDS`, `bandOfGrade` and
 *      `validateGradeBands` are the ALLIED-HEALTH INSTANCE of a general ordered
 *      scale with any number of named regions. A doctors' three-rank ladder, a
 *      ten-level nursing ladder and a flat two-tier team are all declarable, and
 *      each is refused in its OWN nouns.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
    // the engine
    generateRosterV2,
    validateRosterV2Config,
    auditHardConstraints,
    // TEMPORAL
    temporalPattern,
    weeklyClause,
    monthlyClause,
    datesClause,
    temporalOccurrences,
    temporalIsVacuous,
    temporalLabel,
    validateTemporalPattern,
    recurrenceDatesBetween,
    TEMPORAL_KINDS,
    // ELIGIBILITY
    ELIGIBILITY_KINDS,
    ELIGIBILITY_KIND_NAMES,
    skillRequirement,
    regionRequirement,
    eligibilityOf,
    firstUnmetRequirement,
    meetsEligibility,
    skillsRequiredBy,
    regionsRequiredBy,
    // CAPACITY
    CAPACITY_LIMITS,
    capacityBreached,
    // AFFINITY
    AFFINITY_POLARITIES,
    AFFINITY_SHAPES,
    resolveAffinities,
    // STRUCTURE
    SHIFT_COMPOSITIONS,
    POSITION_PHASES,
    compileTaskPrimitives,
    // QUOTA
    resolveQuotas,
    quotaOf,
    QUOTA_SUBJECTS,
    QUOTA_PERIODS,
    // SCALE
    defineGradeScale,
    validateScaleRegions,
    regionOfRank,
    ALLIED_HEALTH_SCALE,
    GRADE_SCALE,
    DEFAULT_GRADE_BANDS,
    bandOfGrade,
    validateGradeBands,
    ROSTER_V2_DEFAULTS,
} from './rosterEngineV2';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** 2026-09-07 is a MONDAY, so no start-date snap warning muddies the assertions. */
const MONDAY = '2026-09-07';

/** A two-person pool that can staff anything: one principal, one junior. */
const PAIR = [{ name: 'Ada', grade: 'AH15' }, { name: 'Ben', grade: 'AH9' }];

/** A run that must have succeeded — with the reason in the failure message. */
const generated = (config) => {
    const result = generateRosterV2(config);
    expect(result.reason ?? null).toBe(null);
    expect(result.ok).toBe(true);
    return result;
};

/** The refusal reason for a config that must be refused, checked both ways. */
const refusal = (config) => {
    const check = validateRosterV2Config(config);
    expect(check.valid).toBe(false);
    const run = generateRosterV2(config);
    expect(run.ok).toBe(false);
    expect(run.reason).toBe(check.reason);
    return check.reason;
};

/** The dates a task actually appears on, in order. */
const datesOf = (roster) => Object.keys(roster).sort();

/** One task, driven through the whole engine on a two-person pool. */
const runTask = (task, weeks = 8, startDate = MONDAY) =>
    generated({ startDate, weeks, staff: PAIR, tasks: [task] });

// ═════════════════════════════════════════════════════════════════════════════
// 1. TEMPORAL — one grammar for "when does this occur"
// ═════════════════════════════════════════════════════════════════════════════

describe('TEMPORAL: the representation', () => {
    it('is a union of clauses with an optional bounded window', () => {
        const pattern = temporalPattern([weeklyClause([1, 3])], { from: '2026-09-14', to: '2026-09-30' });
        expect(pattern).toEqual({
            clauses: [{ kind: 'weekly', weekdays: [1, 3], every: 1, offset: 0 }],
            window: { from: '2026-09-14', to: '2026-09-30' },
        });
    });

    it('names its three clause kinds, and each carries only what that kind needs', () => {
        expect(TEMPORAL_KINDS).toEqual({ weekly: 'weekly', monthly: 'monthly', dates: 'dates' });
        expect(weeklyClause([2], 2, 1)).toEqual({ kind: 'weekly', weekdays: [2], every: 2, offset: 1 });
        expect(monthlyClause(3, [1, 3])).toEqual({ kind: 'monthly', weekday: 3, ordinals: [1, 3] });
        expect(datesClause(['2026-09-08'])).toEqual({ kind: 'dates', dates: ['2026-09-08'] });
    });

    it('freezes what it builds, so a task cannot edit another task`s calendar', () => {
        const pattern = temporalPattern([weeklyClause([1])]);
        expect(Object.isFrozen(pattern)).toBe(true);
        expect(Object.isFrozen(pattern.clauses)).toBe(true);
        expect(Object.isFrozen(pattern.clauses[0])).toBe(true);
        expect(Object.isFrozen(pattern.clauses[0].weekdays)).toBe(true);
    });

    it('knows a VACUOUS pattern from one that simply misses a horizon', () => {
        expect(temporalIsVacuous(temporalPattern([weeklyClause([])]))).toBe(true);
        expect(temporalIsVacuous(temporalPattern([monthlyClause(3, [])]))).toBe(true);
        expect(temporalIsVacuous(temporalPattern([datesClause([])]))).toBe(true);
        expect(temporalIsVacuous(temporalPattern([weeklyClause([])], null))).toBe(true);
        // Non-vacuous: it CAN occur, just perhaps not in this run.
        expect(temporalIsVacuous(temporalPattern([monthlyClause(3, [3])]))).toBe(false);
        expect(temporalIsVacuous(temporalPattern([weeklyClause([]), datesClause(['2026-09-08'])]))).toBe(false);
    });
});

describe('TEMPORAL: resolution', () => {
    it('resolves a weekly clause over the horizon', () => {
        expect(temporalOccurrences(temporalPattern([weeklyClause([1, 5])]), MONDAY, '2026-09-20'))
            .toEqual(['2026-09-07', '2026-09-11', '2026-09-14', '2026-09-18']);
    });

    it('resolves every monthly ordinal, and `last` differs from 4 in a five-weekday month', () => {
        const of = (ordinal) => temporalOccurrences(
            temporalPattern([monthlyClause(3, [ordinal])]), '2026-09-01', '2026-09-30',
        );
        expect(of(1)).toEqual(['2026-09-02']);
        expect(of(2)).toEqual(['2026-09-09']);
        expect(of(3)).toEqual(['2026-09-16']);
        expect(of(4)).toEqual(['2026-09-23']);
        // September 2026 holds FIVE Wednesdays, which is exactly where `last` bites.
        expect(of('last')).toEqual(['2026-09-30']);
    });

    it('resolves an explicit date list, clipped to the horizon', () => {
        expect(temporalOccurrences(
            temporalPattern([datesClause(['2026-09-08', '2026-09-22', '2026-12-25'])]),
            MONDAY, '2026-10-04',
        )).toEqual(['2026-09-08', '2026-09-22']);
    });

    it('resolves a bounded window by intersecting it with the horizon', () => {
        expect(temporalOccurrences(
            temporalPattern([weeklyClause([1, 2, 3, 4, 5])], { from: '2026-09-14', to: '2026-09-16' }),
            MONDAY, '2026-09-27',
        )).toEqual(['2026-09-14', '2026-09-15', '2026-09-16']);
    });

    it('UNIONS its clauses, deduplicating and sorting', () => {
        expect(temporalOccurrences(
            temporalPattern([weeklyClause([2]), datesClause(['2026-09-10', '2026-09-08'])]),
            MONDAY, '2026-09-20',
        )).toEqual(['2026-09-08', '2026-09-10', '2026-09-15']);
    });

    it('is total: a backwards range, a bad key or an empty pattern gives []', () => {
        const weekly = temporalPattern([weeklyClause([1])]);
        expect(temporalOccurrences(weekly, '2026-09-20', MONDAY)).toEqual([]);
        expect(temporalOccurrences(weekly, 'nope', MONDAY)).toEqual([]);
        expect(temporalOccurrences(weekly, MONDAY, '2026-02-30')).toEqual([]);
        expect(temporalOccurrences(temporalPattern([]), MONDAY, '2026-09-20')).toEqual([]);
        expect(temporalOccurrences(
            temporalPattern([weeklyClause([1])], { from: '2026-09-20', to: MONDAY }), MONDAY, '2026-09-27',
        )).toEqual([]);
    });

    it('renders a pattern as prose, for the warning that says a task never appears', () => {
        // Each clause carries its OWN article, because the sentence it drops into
        // cannot know whether it needs "the" or "every".
        expect(temporalLabel(temporalPattern([monthlyClause(3, [3])]))).toBe('the 3rd Wednesday of each month');
        expect(temporalLabel(temporalPattern([monthlyClause(3, [1, 3])]))).toBe('the 1st and 3rd Wednesday of each month');
        expect(temporalLabel(temporalPattern([monthlyClause(5, ['last'])]))).toBe('the last Friday of each month');
        expect(temporalLabel(temporalPattern([weeklyClause([1, 3])]))).toBe('every Monday and Wednesday');
        expect(temporalLabel(temporalPattern([weeklyClause([3], 2, 0)]))).toBe('Wednesday of every two weeks');
        expect(temporalLabel(temporalPattern([datesClause(['2026-09-08'])]))).toBe('the dates 2026-09-08');
        expect(temporalLabel(temporalPattern([weeklyClause([2]), datesClause(['2026-09-10'])])))
            .toBe('every Tuesday, and the dates 2026-09-10');
    });
});

describe('TEMPORAL: the named features compile to it', () => {
    it('`days: [1, 3]` is a weekly clause on those weekdays, every week', () => {
        expect(compileTaskPrimitives({ name: 'T', days: [1, 3] }).temporal)
            .toEqual({ clauses: [{ kind: 'weekly', weekdays: [1, 3], every: 1, offset: 0 }], window: null });
    });

    it('an absent `days` is a weekly clause on the shipped Mon–Fri default', () => {
        expect(compileTaskPrimitives({ name: 'T' }).temporal.clauses[0].weekdays)
            .toEqual([...ROSTER_V2_DEFAULTS.days]);
    });

    it('`recurrence` is a monthly clause holding exactly ONE ordinal', () => {
        expect(compileTaskPrimitives({ name: 'T', recurrence: { ordinal: 3, weekday: 3 } }).temporal)
            .toEqual({ clauses: [{ kind: 'monthly', weekday: 3, ordinals: [3] }], window: null });
    });

    it('`recurrenceDatesBetween` is that sugar`s face on the general resolver', () => {
        for (const ordinal of [1, 2, 3, 4, 'last']) {
            for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
                expect(recurrenceDatesBetween({ ordinal, weekday }, '2026-01-01', '2026-12-31')).toEqual(
                    temporalOccurrences(
                        temporalPattern([monthlyClause(weekday, [ordinal])]), '2026-01-01', '2026-12-31',
                    ),
                );
            }
        }
    });

    it('the DAY LOOP reads the pattern and nothing else — sugar and primitive agree', () => {
        // The same calendar written both ways must produce the same roster, which is
        // what "the sugar compiles down" means operationally.
        const viaSugar = runTask({ name: 'Clinic', coLeads: 0, days: [1, 3] }, 3);
        const viaPrimitive = runTask({
            name: 'Clinic', coLeads: 0,
            temporal: { clauses: [{ kind: 'weekly', weekdays: [1, 3] }] },
        }, 3);
        expect(viaPrimitive.roster).toEqual(viaSugar.roster);
        expect(viaPrimitive.load).toEqual(viaSugar.load);
        expect(viaPrimitive.score).toEqual(viaSugar.score);

        const monthlySugar = runTask({ name: 'MDT', coLeads: 0, recurrence: { ordinal: 3, weekday: 3 } }, 12);
        const monthlyPrimitive = runTask({
            name: 'MDT', coLeads: 0,
            temporal: { clauses: [{ kind: 'monthly', weekday: 3, ordinals: [3] }] },
        }, 12);
        expect(monthlyPrimitive.roster).toEqual(monthlySugar.roster);
    });
});

describe('TEMPORAL: the four combinations with no sugar already work end to end', () => {
    it('1st AND 3rd Wednesday of each month', () => {
        const result = runTask({
            name: 'Cohort Clinic', coLeads: 0,
            temporal: { clauses: [{ kind: 'monthly', weekday: 3, ordinals: [1, 3] }] },
        }, 8);
        expect(datesOf(result.roster)).toEqual(['2026-09-16', '2026-10-07', '2026-10-21']);
        expect(result.unfilled).toEqual([]);
        expect(result.warnings).toEqual([]);
        // A real roster, not an empty one: every occurrence has a lead.
        expect(Object.values(result.roster).map((shifts) => shifts[0].lead))
            .toEqual(['Ada', 'Ben', 'Ada']);
        expect(auditHardConstraints(result.roster, {
            startDate: MONDAY, weeks: 8, staff: PAIR,
            tasks: [{ name: 'Cohort Clinic', coLeads: 0, temporal: { clauses: [{ kind: 'monthly', weekday: 3, ordinals: [1, 3] }] } }],
        })).toEqual({ ok: true, count: 0, violations: [] });
    });

    it('alternate weeks, and the other alternate weeks', () => {
        const even = runTask({
            name: 'Fortnightly', coLeads: 0,
            temporal: { clauses: [{ kind: 'weekly', weekdays: [3], every: 2 }] },
        }, 6);
        expect(datesOf(even.roster)).toEqual(['2026-09-09', '2026-09-23', '2026-10-07']);

        const odd = runTask({
            name: 'Fortnightly', coLeads: 0,
            temporal: { clauses: [{ kind: 'weekly', weekdays: [3], every: 2, offset: 1 }] },
        }, 6);
        expect(datesOf(odd.roster)).toEqual(['2026-09-16', '2026-09-30', '2026-10-14']);
    });

    it('an explicit list of dates', () => {
        const result = runTask({
            name: 'Ad Hoc', coLeads: 0,
            temporal: { clauses: [{ kind: 'dates', dates: ['2026-09-09', '2026-09-19'] }] },
        }, 4);
        expect(datesOf(result.roster)).toEqual(['2026-09-09', '2026-09-19']);
    });

    it('a bounded date range over an ordinary weekday pattern', () => {
        const result = runTask({
            name: 'Cover Block', coLeads: 0,
            temporal: {
                clauses: [{ kind: 'weekly', weekdays: [1, 2, 3, 4, 5] }],
                window: { from: '2026-09-14', to: '2026-09-16' },
            },
        }, 4);
        expect(datesOf(result.roster)).toEqual(['2026-09-14', '2026-09-15', '2026-09-16']);
    });

    it('names the WINDOW`s exclusion in the pattern`s words, with one article only', () => {
        // Reachable only through the primitive form: a weekly pattern always occurs
        // inside a run of whole weeks unless a `window` excludes it. The first run of
        // this case printed "runs on the every Monday", which is what fixed the
        // article. The window itself is still not named — ledger item 4.
        const result = generated({
            startDate: MONDAY, weeks: 1, staff: [{ name: 'Ada' }],
            tasks: [
                {
                    name: 'Out Of Window', coLeads: 0,
                    temporal: {
                        clauses: [{ kind: 'weekly', weekdays: [1, 3] }],
                        window: { from: '2026-12-01', to: '2026-12-31' },
                    },
                },
                { name: 'Real', coLeads: 0 },
            ],
        });
        expect(result.warnings).toEqual([
            'Task Out Of Window runs on every Monday and Wednesday, and no such date falls between 2026-09-07 and 2026-09-13, so it will never appear in this roster. Generate a longer run, or one that covers an occurrence.',
        ]);
    });

    it('warns in the pattern`s own words when it misses the horizon', () => {
        const result = generated({
            startDate: MONDAY, weeks: 1, staff: PAIR,
            tasks: [
                { name: 'Missed', coLeads: 0, temporal: { clauses: [{ kind: 'monthly', weekday: 3, ordinals: [1, 3] }] } },
                { name: 'Real', coLeads: 0 },
            ],
        });
        expect(result.warnings).toEqual([
            'Task Missed runs on the 1st and 3rd Wednesday of each month, and no such date falls between 2026-09-07 and 2026-09-13, so it will never appear in this roster. Generate a longer run, or one that covers an occurrence.',
        ]);
        // And no `unfilled` entry: no slot was ever demanded.
        expect(result.unfilled).toEqual([]);
    });

    it('warns "no days selected" for a VACUOUS pattern, not the horizon sentence', () => {
        const result = generated({
            startDate: MONDAY, weeks: 1, staff: PAIR,
            tasks: [
                { name: 'Never', coLeads: 0, temporal: { clauses: [{ kind: 'weekly', weekdays: [] }] } },
                { name: 'Real', coLeads: 0 },
            ],
        });
        expect(result.warnings).toEqual([
            'Task Never has no days selected, so it will never appear in the roster.',
        ]);
    });
});

describe('TEMPORAL: the primitive form is VALIDATED, never tolerated', () => {
    const withTemporal = (temporal) => ({
        startDate: MONDAY, weeks: 1, staff: PAIR, tasks: [{ name: 'T', coLeads: 0, temporal }],
    });

    it.each([
        [
            'no clauses',
            { clauses: [] },
            "Task T's temporal has no clauses, so the task would never occur. Give at least one clause, or leave temporal out and use days or recurrence.",
        ],
        [
            'not an object',
            'weekly',
            "Task T's temporal must be an object of the form { clauses: [ … ] } — one clause per rule about when the task occurs.",
        ],
        [
            'a clause that is not an object',
            { clauses: ['x'] },
            "Task T's temporal clause 1 is not a clause object — expected { kind: 'weekly' | 'monthly' | 'dates', … }.",
        ],
        [
            'an unknown kind',
            { clauses: [{ kind: 'fortnightly' }] },
            'Task T\'s temporal clause 1 has the kind "fortnightly", which is not a temporal kind — use \'weekly\', \'monthly\' or \'dates\'.',
        ],
        [
            'a weekly clause with no weekdays array',
            { clauses: [{ kind: 'weekly' }] },
            "Task T's temporal clause 1 is weekly, so it needs weekdays: an array of whole numbers 0 (Sunday) to 6 (Saturday).",
        ],
        [
            'a weekday off the week',
            { clauses: [{ kind: 'weekly', weekdays: [9] }] },
            "Task T's temporal clause 1 has an invalid weekday 9 — use whole numbers 0 (Sunday) to 6 (Saturday).",
        ],
        [
            'every: 0',
            { clauses: [{ kind: 'weekly', weekdays: [1], every: 0 }] },
            "Task T's temporal clause 1 has every: 0 — it must be a whole number of at least 1 (1 is every week, 2 is alternate weeks).",
        ],
        [
            'an offset that can never match',
            { clauses: [{ kind: 'weekly', weekdays: [1], every: 2, offset: 2 }] },
            "Task T's temporal clause 1 has offset 2 with every 2, so it can never match — the offset must be below every (with every: 2, use offset 0 or 1).",
        ],
        [
            'a negative offset',
            { clauses: [{ kind: 'weekly', weekdays: [1], offset: -1 }] },
            "Task T's temporal clause 1 has offset: -1 — it must be a whole number of 0 or more.",
        ],
        [
            'a monthly clause with no ordinals',
            { clauses: [{ kind: 'monthly', weekday: 3 }] },
            "Task T's temporal clause 1 is monthly, so it needs ordinals: a non-empty array of 1, 2, 3, 4, or 'last'.",
        ],
        [
            'the 5th weekday of a month',
            { clauses: [{ kind: 'monthly', weekday: 3, ordinals: [5] }] },
            "Task T's temporal clause 1 has the ordinal 5 — use 1, 2, 3, 4, or 'last' for the final one of the month (most months have no 5th weekday).",
        ],
        [
            'a monthly weekday off the week',
            { clauses: [{ kind: 'monthly', weekday: 7, ordinals: [1] }] },
            "Task T's temporal clause 1 has the weekday 7 — use whole numbers 0 (Sunday) to 6 (Saturday).",
        ],
        [
            'a dates clause that is not an array',
            { clauses: [{ kind: 'dates', dates: 'x' }] },
            "Task T's temporal clause 1 lists explicit dates, so it needs dates: an array of YYYY-MM-DD dates.",
        ],
        [
            'a date that is not a real date',
            { clauses: [{ kind: 'dates', dates: ['2026-02-30'] }] },
            'Task T\'s temporal clause 1 has a date that is not a real YYYY-MM-DD date: "2026-02-30".',
        ],
        [
            'a half-written window',
            { clauses: [{ kind: 'weekly', weekdays: [1] }], window: { from: '2026-09-14' } },
            "Task T's temporal.window must be an object of the form { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }, or left out so the pattern runs for the whole roster.",
        ],
        [
            'a backwards window',
            { clauses: [{ kind: 'weekly', weekdays: [1] }], window: { from: '2026-09-14', to: '2026-09-01' } },
            "Task T's temporal.window runs from 2026-09-14 back to 2026-09-01, so it contains no dates at all.",
        ],
    ])('refuses %s', (_label, temporal, reason) => {
        expect(refusal(withTemporal(temporal))).toBe(reason);
    });

    it.each(['days', 'recurrence'])('refuses temporal alongside %s', (field) => {
        const value = field === 'days' ? [1] : { ordinal: 1, weekday: 1 };
        expect(refusal({
            startDate: MONDAY, weeks: 1, staff: PAIR,
            tasks: [{ name: 'T', coLeads: 0, temporal: { clauses: [{ kind: 'weekly', weekdays: [1] }] }, [field]: value }],
        })).toBe(`Task T sets both temporal and ${field} — temporal IS the general form that ${field} compiles to, so giving both says the same thing twice and disagrees with itself. Remove whichever one is not meant.`);
    });

    it('accepts every well-formed shape it will be handed', () => {
        for (const pattern of [
            { clauses: [{ kind: 'weekly', weekdays: [] }] },
            { clauses: [{ kind: 'weekly', weekdays: [0, 6], every: 3, offset: 2 }] },
            { clauses: [{ kind: 'monthly', weekday: 0, ordinals: [1, 2, 3, 4, 'last'] }] },
            { clauses: [{ kind: 'dates', dates: [] }] },
            { clauses: [{ kind: 'weekly', weekdays: [1] }, { kind: 'dates', dates: ['2026-09-08'] }] },
            { clauses: [{ kind: 'weekly', weekdays: [1] }], window: { from: MONDAY, to: MONDAY } },
        ]) {
            expect(validateTemporalPattern(pattern)).toEqual({ valid: true, reason: null });
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. ELIGIBILITY — a composable predicate over a person for a position
// ═════════════════════════════════════════════════════════════════════════════

/** A normalised-staff-shaped person, which is what the predicates read. */
const personLike = ({ skills = [], band = null }) => ({ skills: new Set(skills), band });

describe('ELIGIBILITY: the representation', () => {
    it('is a list of KINDS, each a row in a table carrying its own rejection code', () => {
        // `window` is the THIRD kind, landed by the cohort-window feature — the row
        // this table's whole design says a new kind should be. Its behaviour is
        // specified in `rosterEngineV2.quotas.test.js`; what is pinned here is that it
        // is a ROW like the other two and not a mechanism beside them.
        // FOUR SINCE 2026-08-19. `minGrade` joined when respiratory therapy stated
        // a floor of AH12 and no band gate could express it — `junior` is AH11–AH12,
        // so every sayable gate admitted AH11 too. The assertion below is the whole
        // claim of the table design: a fourth kind was one row here plus one entry
        // in `ELIGIBILITY_KINDS`, and nothing outside those two places had to learn
        // that kinds exist.
        expect(ELIGIBILITY_KIND_NAMES).toEqual({
            skill: 'skill', region: 'region', window: 'window', minGrade: 'minGrade',
        });
        // The table IS the extension point: every kind the engine can name has a
        // predicate and a rejection code, and nothing else knows the kinds exist.
        expect(Object.keys(ELIGIBILITY_KINDS).sort()).toEqual(Object.values(ELIGIBILITY_KIND_NAMES).sort());
        for (const kind of Object.values(ELIGIBILITY_KIND_NAMES)) {
            expect(typeof ELIGIBILITY_KINDS[kind].met).toBe('function');
            expect(typeof ELIGIBILITY_KINDS[kind].rejection).toBe('string');
        }
        expect(ELIGIBILITY_KINDS.skill.rejection).toBe('skill');
        expect(ELIGIBILITY_KINDS.region.rejection).toBe('band');
        expect(ELIGIBILITY_KINDS.window.rejection).toBe('window');
    });

    it('builds a skill requirement from a name, and nothing from an absent one', () => {
        expect(skillRequirement('CPET')).toEqual({ kind: 'skill', skill: 'CPET' });
        for (const empty of [null, undefined, '', '   ', 5]) {
            expect(skillRequirement(empty)).toBeNull();
        }
    });

    it('builds a region requirement from a SET, and nothing from an empty one', () => {
        const regions = new Set(['senior', 'principal']);
        expect(regionRequirement(regions)).toEqual({ kind: 'region', regions });
        expect(regionRequirement(new Set())).toBeNull();
        expect(regionRequirement(null)).toBeNull();
        expect(regionRequirement(['senior'])).toBeNull();
    });

    it('ANDs its parts, drops the absent ones, and DEDUPLICATES', () => {
        expect(eligibilityOf(null, skillRequirement('CPET'), undefined)).toEqual([{ kind: 'skill', skill: 'CPET' }]);
        // The load-bearing dedupe: a slot entry repeating the task's skill says
        // nothing new, and the reason sentence must not read "skills CPET and CPET".
        expect(eligibilityOf(skillRequirement('CPET'), skillRequirement('CPET'))).toHaveLength(1);
        expect(skillsRequiredBy(eligibilityOf(skillRequirement('CPET'), skillRequirement('ICSI'))))
            .toEqual(['CPET', 'ICSI']);
        expect(eligibilityOf()).toEqual([]);
        expect(Object.isFrozen(eligibilityOf(skillRequirement('CPET')))).toBe(true);
    });

    it('reports the FIRST unmet requirement, in list order', () => {
        const eligibility = eligibilityOf(skillRequirement('CPET'), regionRequirement(new Set(['principal'])));
        // Fails both: the SKILL is reported, because it comes first.
        expect(firstUnmetRequirement(personLike({}), eligibility).kind).toBe('skill');
        // Holds the skill, wrong region: now the region is reported.
        expect(firstUnmetRequirement(personLike({ skills: ['CPET'], band: 'junior' }), eligibility).kind).toBe('region');
        expect(firstUnmetRequirement(personLike({ skills: ['CPET'], band: 'principal' }), eligibility)).toBeNull();
        expect(meetsEligibility(personLike({ skills: ['CPET'], band: 'principal' }), eligibility)).toBe(true);
    });

    it('never lets an UNRECORDED rank satisfy a region requirement — absent is not zero', () => {
        const gated = eligibilityOf(regionRequirement(new Set(['junior'])));
        expect(meetsEligibility(personLike({ band: null }), gated)).toBe(false);
        expect(meetsEligibility(personLike({ band: 'junior' }), gated)).toBe(true);
        // But an UNGATED position accepts an unrecorded rank.
        expect(meetsEligibility(personLike({ band: null }), eligibilityOf())).toBe(true);
    });

    it('reads back the skills and the region set a sentence has to name', () => {
        const eligibility = eligibilityOf(skillRequirement('CPET'), regionRequirement(new Set(['senior'])));
        expect(skillsRequiredBy(eligibility)).toEqual(['CPET']);
        expect(regionsRequiredBy(eligibility)).toEqual(new Set(['senior']));
        expect(regionsRequiredBy(eligibilityOf(skillRequirement('CPET')))).toBeNull();
    });
});

describe('ELIGIBILITY: the named features compile to it', () => {
    it('`requiresSkill` reaches EVERY position of the task', () => {
        const task = compileTaskPrimitives({ name: 'T', requiresSkill: 'CPET' });
        expect(task.positions.map((p) => p.eligibility)).toEqual([
            [{ kind: 'skill', skill: 'CPET' }],
            [{ kind: 'skill', skill: 'CPET' }],
        ]);
    });

    it('`leadBands` reaches the LEAD positions only — bands gate leads, not co-leads', () => {
        const task = compileTaskPrimitives({ name: 'T', leadBands: ['senior', 'principal'] });
        const [lead, coLead] = task.positions;
        expect(lead.role).toBe('lead');
        expect(regionsRequiredBy(lead.eligibility)).toEqual(new Set(['senior', 'principal']));
        expect(coLead.role).toBe('coLead');
        expect(regionsRequiredBy(coLead.eligibility)).toBeNull();
    });

    it('composes them, SKILL FIRST — which is the order the refusal reads in', () => {
        const [lead] = compileTaskPrimitives({
            name: 'T', requiresSkill: 'CPET', leadBands: ['principal'],
        }).positions;
        expect(lead.eligibility.map((r) => r.kind)).toEqual(['skill', 'region']);
    });

    it('a slot entry`s own band and skill land on THAT position, on top of the task`s', () => {
        const task = compileTaskPrimitives({
            name: 'T', requiresSkill: 'Witnessing',
            slots: [{ band: 'principal' }, { band: 'senior', requiresSkill: 'ICSI' }, {}],
        });
        expect(task.positions.map((p) => p.eligibility.map((r) => (r.kind === 'skill' ? r.skill : [...r.regions])))).toEqual([
            ['Witnessing', ['principal']],
            ['Witnessing', 'ICSI', ['senior']],
            ['Witnessing'],
        ]);
    });

    it('deduplicates an entry that repeats the task`s own skill', () => {
        const task = compileTaskPrimitives({
            name: 'T', requiresSkill: 'CPET', slots: [{ requiresSkill: 'CPET' }],
        });
        expect(skillsRequiredBy(task.positions[0].eligibility)).toEqual(['CPET']);
    });

    it('the GATE and the SENTENCE read the same list — a two-skill slot names both', () => {
        const result = generated({
            startDate: MONDAY, weeks: 1,
            staff: [
                { name: 'Ada', grade: 'AH15', skills: ['Witnessing', 'ICSI'], unavailable: ['2026-09-07'] },
                { name: 'Ben', grade: 'AH9', skills: ['Witnessing'] },
            ],
            tasks: [{
                name: 'Trio', days: [1], requiresSkill: 'Witnessing',
                slots: [{ requiresSkill: 'ICSI', role: 'Second pair of hands' }, {}],
            }],
        });
        // The task's skill and the entry's own, both named, in the order the
        // requirement list holds them — and the tally narrows left to right.
        expect(result.unfilled.map((entry) => entry.reason)).toEqual([
            'no available staff hold skills Witnessing and ICSI for Trio Second pair of hands on 2026-09-07 (1 qualified, 1 on leave)',
        ]);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. CAPACITY — a ceiling on a METER over a PERIOD
// ═════════════════════════════════════════════════════════════════════════════

/** The day-state shape the capacity limits read, with everything empty. */
const capacityContext = (overrides = {}) => ({
    task: { name: 'T', hours: 4 },
    dateKey: '2026-09-07',
    date: new Date(2026, 8, 7),
    dutiesOnDate: new Map(),
    onTaskToday: new Set(),
    dutiesByDate: new Map(),
    maxConsecutiveDays: 6,
    hoursActive: false,
    hoursOnDate: new Map(),
    hoursThisWeek: new Map(),
    ...overrides,
});

const limitById = (id) => CAPACITY_LIMITS.find((limit) => limit.id === id);

describe('CAPACITY: the representation', () => {
    it('is ONE table: five ceilings, each a meter over a period', () => {
        expect(CAPACITY_LIMITS.map((limit) => [limit.id, limit.meter, limit.period, limit.mode, limit.rejection])).toEqual([
            ['taskPerDay', 'duties', 'taskDay', 'discrete', 'onTask'],
            ['dutiesPerDay', 'duties', 'day', 'discrete', 'capacity'],
            ['hoursPerDay', 'hours', 'day', 'continuous', 'dailyHours'],
            ['hoursPerWeek', 'hours', 'week', 'continuous', 'weeklyHours'],
            ['consecutiveDays', 'days', 'run', 'discrete', 'consecutive'],
        ]);
        expect(Object.isFrozen(CAPACITY_LIMITS)).toBe(true);
        expect(CAPACITY_LIMITS.every((limit) => Object.isFrozen(limit))).toBe(true);
    });

    it('gates ONLY the two hours ceilings on the opt-in predicate', () => {
        expect(CAPACITY_LIMITS.filter((limit) => limit.active !== undefined).map((limit) => limit.id))
            .toEqual(['hoursPerDay', 'hoursPerWeek']);
        expect(CAPACITY_LIMITS.filter((limit) => limit.exempt !== undefined).map((limit) => limit.id))
            .toEqual(['consecutiveDays']);
    });

    it('counts DISCRETE meters as "holding the limit means one more would exceed it"', () => {
        const limit = limitById('dutiesPerDay');
        const person = { name: 'Ada', maxPerDay: 2 };
        expect(capacityBreached(limit, person, capacityContext())).toBe(false);
        expect(capacityBreached(limit, person, capacityContext({ dutiesOnDate: new Map([['Ada', 1]]) }))).toBe(false);
        expect(capacityBreached(limit, person, capacityContext({ dutiesOnDate: new Map([['Ada', 2]]) }))).toBe(true);
    });

    it('allows a CONTINUOUS meter to be filled EXACTLY to the ceiling', () => {
        const limit = limitById('hoursPerDay');
        // 8.4 * 0.6 is 5.040000000000001 as a double, and a 5.04h session must fit.
        const person = { name: 'Ada', dailyHoursCap: 8.4 * 0.6 };
        const ctx = capacityContext({ hoursActive: true, task: { name: 'T', hours: 5.04 } });
        expect(capacityBreached(limit, person, ctx)).toBe(false);
        expect(capacityBreached(limit, person, capacityContext({
            hoursActive: true, task: { name: 'T', hours: 5.05 },
        }))).toBe(true);
    });

    it('the epsilon is on the CAP side, and it is REACHABLE from real durations', () => {
        // `0.1 + 0.2` is `0.30000000000000004`, which is strictly greater than `0.3`.
        // Without the tolerance the engine would refuse a duty that exactly fills a
        // 0.3h ceiling and report an hours breach a roster master could only read as
        // a bug. Two duties, both staffed, 0.3h assigned.
        expect(0.1 + 0.2 > 0.3).toBe(true);
        const result = generated({
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ada', maxHoursPerDay: 0.3 }],
            tasks: [
                { name: 'A', days: [1], coLeads: 0, hours: 0.1 },
                { name: 'B', days: [1], coLeads: 0, hours: 0.2 },
            ],
        });
        expect(result.unfilled).toEqual([]);
        expect(result.load.Ada.hours).toBe(0.3);
        // And directly on the primitive, where the float is visible.
        expect(capacityBreached(
            limitById('hoursPerDay'),
            { name: 'Ada', dailyHoursCap: 0.3 },
            capacityContext({ hoursActive: true, task: { name: 'B', hours: 0.2 }, hoursOnDate: new Map([['Ada', 0.1]]) }),
        )).toBe(false);
    });

    it('asks the DUTY ceiling before the forbidden pairing — the order is data', () => {
        // Ada fails BOTH: she is at her one-duty limit AND forbidden with Ben, who is
        // leading the task. Which of the two the reason names is the gate ORDER, and
        // it is capacity first. (Neither the original 1213-test suite nor the
        // byte-identity harness pinned this; the mutation sweep found the gap.)
        const result = generated({
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ada' }, { name: 'Ben' }],
            tasks: [
                { name: 'Filler', days: [1], coLeads: 0 },
                { name: 'Pairing', days: [1], leads: 1, coLeads: 1 },
            ],
            rules: { forbidPairs: [['Ada', 'Ben']], maxConcurrentPerDay: 1 },
        });
        expect(result.unfilled).toEqual([{
            date: '2026-09-07',
            task: 'Pairing',
            role: 'coLead',
            reason: 'no available staff for Pairing coLead on 2026-09-07 (2 in pool, 1 at daily limit, 1 already on this task)',
        }]);
    });

    it('reads NOTHING when its `active` gate is off', () => {
        const person = { name: 'Ada', dailyHoursCap: 1, weeklyHoursCap: 1 };
        for (const id of ['hoursPerDay', 'hoursPerWeek']) {
            expect(capacityBreached(limitById(id), person, capacityContext({ hoursActive: false }))).toBe(false);
            expect(capacityBreached(limitById(id), person, capacityContext({ hoursActive: true }))).toBe(true);
        }
    });

    it('makes "already on this task today" a ceiling of ONE over a task-day', () => {
        const limit = limitById('taskPerDay');
        const person = { name: 'Ada' };
        expect(limit.limitOf(person, capacityContext())).toBe(1);
        expect(capacityBreached(limit, person, capacityContext())).toBe(false);
        expect(capacityBreached(limit, person, capacityContext({ onTaskToday: new Set(['Ada']) }))).toBe(true);
    });

    it('EXEMPTS a day already worked from the consecutive-day run', () => {
        const limit = limitById('consecutiveDays');
        const person = { name: 'Ada' };
        // Six worked days behind them, against a limit of 6.
        const dutiesByDate = new Map();
        for (const key of ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']) {
            dutiesByDate.set(key, new Map([['Ada', 1]]));
        }
        expect(capacityBreached(limit, person, capacityContext({ dutiesByDate }))).toBe(true);
        // …unless they are already working TODAY, which does not lengthen the run.
        expect(capacityBreached(limit, person, capacityContext({
            dutiesByDate, dutiesOnDate: new Map([['Ada', 1]]),
        }))).toBe(false);
    });
});

describe('CAPACITY: the named features compile to it', () => {
    it('`maxPerDay` is the person`s dutiesPerDay ceiling; `maxConcurrentPerDay` is its default', () => {
        // Measured through the engine: a 3-duty department fills three, a 1-duty one
        // fills one and reports the rest.
        const config = (rules, maxPerDay) => ({
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ada', ...(maxPerDay === undefined ? {} : { maxPerDay }) }],
            tasks: [
                { name: 'A', days: [1], coLeads: 0 },
                { name: 'B', days: [1], coLeads: 0 },
                { name: 'C', days: [1], coLeads: 0 },
            ],
            ...(rules === null ? {} : { rules }),
        });
        // The shipped default is 2 per day.
        expect(ROSTER_V2_DEFAULTS.maxConcurrentPerDay).toBe(2);
        expect(generated(config(null)).unfilled).toHaveLength(1);
        expect(generated(config({ maxConcurrentPerDay: 3 })).unfilled).toHaveLength(0);
        // A personal ceiling overrides the departmental one.
        expect(generated(config({ maxConcurrentPerDay: 3 }, 1)).unfilled).toHaveLength(2);
    });

    it('names the ceiling that bound, and never merges duties with hours', () => {
        const duties = generated({
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ada', maxPerDay: 1 }],
            tasks: [{ name: 'A', days: [1], coLeads: 0 }, { name: 'B', days: [1], coLeads: 0 }],
        });
        expect(duties.unfilled[0].reason).toBe(
            'no available staff for B lead on 2026-09-07 (1 in pool, 1 at daily limit)',
        );

        const hours = generated({
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ada', maxPerDay: 4, maxHoursPerDay: 5 }],
            tasks: [{ name: 'A', days: [1], coLeads: 0, hours: 4 }, { name: 'B', days: [1], coLeads: 0, hours: 4 }],
        });
        expect(hours.unfilled[0].reason).toBe(
            'no available staff for B lead on 2026-09-07 (1 in pool, 1 over their daily hours limit) — Ada would reach 8h on 2026-09-07, over their 5h daily limit (already on A 4h)',
        );
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. AFFINITY — pairwise and cross-occurrence preferences WITH POLARITY
// ═════════════════════════════════════════════════════════════════════════════

describe('AFFINITY: the representation', () => {
    it('names TWO shapes and FOUR polarities', () => {
        expect(AFFINITY_SHAPES).toEqual({ pair: 'pair', occurrence: 'occurrence' });
        expect(AFFINITY_POLARITIES).toEqual({
            forbid: 'forbid', require: 'require', prefer: 'prefer', avoid: 'avoid',
        });
        expect(Object.isFrozen(AFFINITY_POLARITIES)).toBe(true);
    });

    it('compiles `forbidPairs` to pair/FORBID, symmetric in the adjacency map', () => {
        const affinities = resolveAffinities([['Ann', 'Bob']], [], ['Ann', 'Bob', 'Cy']);
        expect(affinities.list).toEqual([
            { shape: 'pair', polarity: 'forbid', people: ['Ann', 'Bob'] },
        ]);
        expect([...affinities.pairsByPerson.get('Ann')]).toEqual(['Bob']);
        expect([...affinities.pairsByPerson.get('Bob')]).toEqual(['Ann']);
        expect([...affinities.pairsByPerson.get('Cy')]).toEqual([]);
    });

    it('compiles `continuity` to occurrence/PREFER, aimed at the ANCHOR role', () => {
        const clinic = compileTaskPrimitives({ name: 'Clinic', continuity: true });
        const affinities = resolveAffinities([], [clinic], ['Ann']);
        expect(affinities.list).toEqual([
            { shape: 'occurrence', polarity: 'prefer', task: 'Clinic', target: 'lead' },
        ]);
        expect(affinities.preferSameByTask.get('Clinic').polarity).toBe('prefer');
    });

    it('produces NOTHING for a task that did not ask for continuity', () => {
        const plain = compileTaskPrimitives({ name: 'Plain' });
        expect(resolveAffinities([], [plain], ['Ann']).list).toEqual([]);
        expect(resolveAffinities([], [plain], ['Ann']).preferSameByTask.size).toBe(0);
    });

    it('leaves `require` and `avoid` DECLARED AND UNPRODUCED — no config can make one', () => {
        // Every field the input contract accepts, exercised at once: nothing in it
        // can produce a polarity this engine does not implement.
        const tasks = [
            compileTaskPrimitives({ name: 'A', continuity: true }),
            compileTaskPrimitives({ name: 'B', slots: [{ band: 'principal' }] }),
            compileTaskPrimitives({ name: 'C', leadBands: ['junior'], requiresSkill: 'CPET' }),
        ];
        const affinities = resolveAffinities([['Ann', 'Bob']], tasks, ['Ann', 'Bob']);
        const polarities = new Set(affinities.list.map((affinity) => affinity.polarity));
        expect([...polarities].sort()).toEqual(['forbid', 'prefer']);
        expect(polarities.has(AFFINITY_POLARITIES.require)).toBe(false);
        expect(polarities.has(AFFINITY_POLARITIES.avoid)).toBe(false);
    });

    it('the FORBID polarity is a hard gate, measured off a real roster', () => {
        const result = generated({
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ann' }, { name: 'Bob' }],
            tasks: [{ name: 'Pairing', days: [1], leads: 1, coLeads: 1 }],
            rules: { forbidPairs: [['Ann', 'Bob']] },
        });
        expect(result.unfilled).toEqual([{
            date: '2026-09-07',
            task: 'Pairing',
            role: 'coLead',
            reason: 'no available staff for Pairing coLead on 2026-09-07 (2 in pool, 1 already on this task, 1 blocked by a forbidden pairing)',
        }]);
        expect(result.score.hardViolations).toBe(0);
    });

    it('the PREFER polarity loses to every gate, and the loss is COUNTED and NAMED', () => {
        const result = generated({
            startDate: MONDAY, weeks: 20,
            staff: [
                // Ada holds the first occurrence and is away for the second, so the
                // incumbency really does change hands under a gate.
                { name: 'Ada', grade: 'AH15', unavailable: ['2026-11-04'] },
                { name: 'Ben', grade: 'AH9' },
            ],
            tasks: [{ name: 'Cohort', recurrence: { ordinal: 1, weekday: 3 }, continuity: true, coLeads: 0 }],
        });
        expect(Object.entries(result.roster).map(([date, shifts]) => [date, shifts[0].lead])).toEqual([
            ['2026-10-07', 'Ada'], ['2026-11-04', 'Ben'], ['2026-12-02', 'Ada'], ['2027-01-06', 'Ada'],
        ]);
        expect(result.score.breakdown.continuityBreaks).toBe(2);
        expect(result.warnings).toEqual([
            'Continuity break: Cohort was led by Ada on 2026-10-07 but by Ben on 2026-11-04 — Ada was on leave that day.',
            'Continuity break: Cohort was led by Ben on 2026-11-04 but by Ada on 2026-12-02 — no constraint stopped Ben that day; the slot went to somebody who had already led this task at least as often.',
        ]);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. STRUCTURE — one internal shift shape: a list of POSITIONS
// ═════════════════════════════════════════════════════════════════════════════

describe('STRUCTURE: the representation', () => {
    it('names two compositions and two phases', () => {
        expect(SHIFT_COMPOSITIONS).toEqual({ pairing: 'pairing', team: 'team' });
        expect(POSITION_PHASES).toEqual({ primary: 1, attached: 2 });
    });

    it('compiles `leads` + `coLeads` to positions: leads PRIMARY, co-leads ATTACHED', () => {
        const task = compileTaskPrimitives({ name: 'T', leads: 2, coLeads: 1 });
        expect(task.composition).toBe(SHIFT_COMPOSITIONS.pairing);
        expect(task.positions.map((p) => [p.index, p.role, p.phase, p.label])).toEqual([
            [0, 'lead', POSITION_PHASES.primary, 'lead'],
            [1, 'lead', POSITION_PHASES.primary, 'lead'],
            [2, 'coLead', POSITION_PHASES.attached, 'coLead'],
        ]);
        expect(task.positions.every((p) => p.entry === null)).toBe(true);
        expect(task.positions.every((p) => Object.isFrozen(p))).toBe(true);
    });

    it('compiles the shipped default to exactly one lead and one co-lead', () => {
        expect(compileTaskPrimitives({ name: 'T' }).positions.map((p) => p.role)).toEqual(['lead', 'coLead']);
    });

    it('compiles `slots` to positions that are ALL PRIMARY, with unique labels', () => {
        const task = compileTaskPrimitives({
            name: 'T',
            slots: [
                { band: 'principal', role: 'Principal embryologist' },
                { band: 'senior' },
                { band: 'junior' },
                { band: 'junior' },
                {},
            ],
        });
        expect(task.composition).toBe(SHIFT_COMPOSITIONS.team);
        expect(task.positions.map((p) => p.phase)).toEqual([1, 1, 1, 1, 1]);
        expect(task.positions.map((p) => p.role)).toEqual(['slot', 'slot', 'slot', 'slot', 'slot']);
        expect(task.positions.map((p) => p.label)).toEqual([
            'Principal embryologist', 'senior slot', 'junior slot 1', 'junior slot 2', 'slot',
        ]);
    });

    it('has NO OTHER description of how a task is staffed — `positions` is it', () => {
        // The raw `slots` array is deliberately not copied onto the normalised task:
        // a field nobody reads is a second source of truth waiting to disagree with
        // the first (post-mortem A-RC1).
        const task = compileTaskPrimitives({ name: 'T', slots: [{ band: 'principal' }] });
        expect(task.slots).toBeUndefined();
        // `leads`/`coLeads` survive as a DESCRIPTION, zeroed for a team shift, and
        // nothing gates on them.
        expect([task.leads, task.coLeads]).toEqual([0, 0]);
    });

    it('counts demand as the position count, whichever sugar was used', () => {
        // Measured through the engine's own demand-versus-capacity warning.
        const overloaded = (task) => generated({
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ada', maxPerDay: 1 }],
            tasks: [task],
        }).warnings.filter((line) => line.startsWith('This configuration asks for'));

        expect(overloaded({ name: 'Paired', days: [1], leads: 1, coLeads: 2 })).toEqual([
            'This configuration asks for 3 duty slots but the team can hold at most 1 across the run, so some slots cannot be filled.',
        ]);
        expect(overloaded({ name: 'Team', days: [1], slots: [{}, {}, {}] })).toEqual([
            'This configuration asks for 3 duty slots but the team can hold at most 1 across the run, so some slots cannot be filled.',
        ]);
    });
});

describe('STRUCTURE: the composition step', () => {
    it('PAIRING deals attached positions round-robin across the filled anchors', () => {
        const result = generated({
            startDate: MONDAY, weeks: 1,
            staff: [
                { name: 'Ada' }, { name: 'Ben' }, { name: 'Cara' },
                { name: 'Dev' }, { name: 'Eve' },
            ],
            tasks: [{ name: 'Big', days: [1], leads: 2, coLeads: 3 }],
            rules: { maxConcurrentPerDay: 1 },
        });
        const shifts = result.roster['2026-09-07'];
        expect(shifts).toHaveLength(2);
        // Three attached positions over two anchors: the first group takes two, and
        // `coLead` is the first of them while `assignees` carries everybody.
        expect(shifts.map((shift) => shift.assignees)).toEqual([
            ['Ada', 'Cara', 'Eve'],
            ['Ben', 'Dev'],
        ]);
        expect(shifts.map((shift) => shift.coLead)).toEqual(['Cara', 'Dev']);
        expect(result.unfilled).toEqual([]);
    });

    it('TEAM emits ONE shift, ranked by grade, and publishes everybody in `assignees`', () => {
        const result = generated({
            startDate: MONDAY, weeks: 1,
            staff: [
                { name: 'Priya', grade: 'AH16' },
                { name: 'Sanjay', grade: 'AH14' },
                // Jun was AH9, chosen when `junior` meant AH7–AH12. AH7–AH10 is
                // `nonExempt` since the four-band split, so a junior SLOT needs a
                // junior AHP — which is what Jun has always been meant to be here.
                { name: 'Jun', grade: 'AH12' },
            ],
            tasks: [{
                name: 'Trio', days: [1],
                slots: [{ band: 'junior' }, { band: 'principal' }, { band: 'senior' }],
            }],
        });
        const [shift] = result.roster['2026-09-07'];
        // Slot ORDER does not decide the lead: the highest grade does.
        expect(shift.assignees).toEqual(['Priya', 'Sanjay', 'Jun']);
        expect(shift.lead).toBe('Priya');
        expect(shift.coLead).toBe('Sanjay');
        expect(shift.staff).toBe('Lead: Priya, Co: Sanjay');
    });

    it('emits NO shift when no position filled, under either composition', () => {
        const result = generated({
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ada', grade: 'AH9', unavailable: ['2026-09-07'] }],
            tasks: [
                { name: 'Paired', days: [1], coLeads: 1 },
                { name: 'Team', days: [1], slots: [{}] },
            ],
        });
        expect(result.roster['2026-09-07']).toBeUndefined();
        expect(result.unfilled.map((entry) => [entry.task, entry.role])).toEqual([
            ['Paired', 'lead'], ['Team', 'slot'], ['Paired', 'coLead'],
        ]);
    });

    it('refuses to orphan an ATTACHED position when its anchor went unfilled', () => {
        const result = generated({
            startDate: MONDAY, weeks: 1,
            staff: [
                // The department's one principal is away, so the anchor cannot be
                // filled on this date — a configure-time refusal would be a different
                // test, and this is the DAY-level case.
                { name: 'Ada', grade: 'AH15', unavailable: ['2026-09-07'] },
                { name: 'Ben', grade: 'AH9' },
                { name: 'Cara', grade: 'AH9' },
            ],
            tasks: [{ name: 'Needs A Principal', days: [1], leadBands: ['principal'], coLeads: 2 }],
        });
        expect(result.roster['2026-09-07']).toBeUndefined();
        expect(result.unfilled.map((entry) => entry.role)).toEqual(['lead', 'coLead', 'coLead']);
        expect(result.unfilled[1].reason).toBe(
            'no lead could be assigned to Needs A Principal on 2026-09-07, so its co-lead slots were left unfilled rather than staffed without a lead',
        );
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. QUOTA — declared, NOT enforced
// ═════════════════════════════════════════════════════════════════════════════

describe('QUOTA: declared and provably inert', () => {
    it('names its vocabulary, and the vocabulary is the CAPACITY vocabulary', () => {
        expect(QUOTA_SUBJECTS).toEqual({ person: 'person', region: 'region' });
        expect(QUOTA_PERIODS).toEqual({ run: 'run', week: 'week', month: 'month' });
        // A quota is a capacity limit read from the other end, so the periods agree.
        expect(Object.values(QUOTA_PERIODS)).toContain('week');
        expect(CAPACITY_LIMITS.map((limit) => limit.period)).toContain('week');
    });

    it('declares the SHAPE: a floor and/or a ceiling on a task class over a period', () => {
        expect(quotaOf({ taskClass: 'Saturday Lab', min: 2, max: 4, period: QUOTA_PERIODS.month })).toEqual({
            subject: 'person', taskClass: 'Saturday Lab', period: 'month', min: 2, max: 4,
        });
        // Both bounds optional, and `person` / `run` are the defaults.
        expect(quotaOf({ taskClass: 'Clinic' })).toEqual({
            subject: 'person', taskClass: 'Clinic', period: 'run', min: null, max: null,
        });
        expect(Object.isFrozen(quotaOf({ taskClass: 'Clinic' }))).toBe(true);
    });

    it('resolves to NOTHING, for every configuration — the seam is open and unused', () => {
        for (const config of [
            {},
            { quotas: [{ subject: 'person', taskClass: 'Clinic', min: 2 }] },
            { startDate: MONDAY, weeks: 1, staff: PAIR, tasks: [{ name: 'T' }] },
        ]) {
            expect(resolveQuotas(config)).toEqual([]);
            expect(Object.isFrozen(resolveQuotas(config))).toBe(true);
        }
    });

    it('a configuration that TYPES a quota is not refused and not obeyed — and says nothing', () => {
        // `quotas` is an unknown key today, treated exactly as every other unknown
        // key is. The warning that would announce an ignored quota is unreachable
        // because `resolveQuotas` is empty by construction; when the next agent makes
        // it non-empty, the roster starts SAYING so rather than looking obedient.
        const withQuota = {
            startDate: MONDAY, weeks: 1, staff: PAIR,
            tasks: [{ name: 'T', coLeads: 0 }],
            quotas: [{ subject: 'person', taskClass: 'T', period: 'run', min: 5 }],
        };
        const plain = { ...withQuota };
        delete plain.quotas;
        expect(validateRosterV2Config(withQuota).valid).toBe(true);
        expect(generated(withQuota).roster).toEqual(generated(plain).roster);
        expect(generated(withQuota).warnings.filter((line) => line.includes('quota'))).toEqual([]);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. THE SCALE — an ordered scale with any number of named regions
// ═════════════════════════════════════════════════════════════════════════════

/** A doctors' ladder: three ranks, two regions, its own words. */
const DOCTORS = defineGradeScale({
    id: 'medical',
    firstRank: 1,
    rankCount: 3,
    labelOfRank: (rank) => ['MO', 'Registrar', 'Consultant'][rank - 1],
    parseRank: (value) => {
        if (typeof value !== 'string') return null;
        const index = ['mo', 'registrar', 'consultant'].indexOf(value.trim().toLowerCase());
        return index === -1 ? null : index + 1;
    },
    regions: { training: [1, 2], specialist: [3, 3] },
    prose: {
        subject: 'Career stage', subjectPlural: 'Career stages',
        regionNoun: 'stage', regionNounPlural: 'stages',
        rankNoun: 'post', rankNounPlural: 'posts',
        unassigned: 'unstaged', scaleTitle: 'the medical career ladder',
    },
});

/** A flat team: two ranks, ONE region. The degenerate case that must still read. */
const FLAT = defineGradeScale({
    id: 'flat',
    firstRank: 1,
    rankCount: 2,
    labelOfRank: (rank) => `T${rank}`,
    parseRank: (value) => (value === 'T1' ? 1 : value === 'T2' ? 2 : null),
    regions: { staff: [1, 2] },
    prose: {
        subject: 'Tier', subjectPlural: 'Tiers',
        regionNoun: 'tier', regionNounPlural: 'tiers',
        rankNoun: 'level', rankNounPlural: 'levels',
        unassigned: 'untiered', scaleTitle: 'the flat ladder',
    },
});

/** A nursing ladder: ten levels, FIVE regions. */
const NURSING = defineGradeScale({
    id: 'nursing',
    firstRank: 1,
    rankCount: 10,
    labelOfRank: (rank) => `N${rank}`,
    parseRank: (value) => {
        const match = typeof value === 'string' ? /^n(\d{1,2})$/i.exec(value.trim()) : null;
        return match === null ? null : Number(match[1]);
    },
    regions: {
        enrolled: [1, 2], registered: [3, 5], senior: [6, 7], advanced: [8, 9], nurseManager: [10, 10],
    },
    prose: {
        subject: 'Nursing band', subjectPlural: 'Nursing bands',
        regionNoun: 'band', regionNounPlural: 'bands',
        rankNoun: 'level', rankNounPlural: 'levels',
        unassigned: 'unbanded', scaleTitle: 'the nursing ladder',
    },
});

describe('SCALE: the representation', () => {
    it('is a list of rank labels plus named regions, frozen and derived', () => {
        expect(DOCTORS.labels).toEqual(['MO', 'Registrar', 'Consultant']);
        expect(DOCTORS.span).toBe('MO–Consultant');
        expect(DOCTORS.regionOrder).toEqual(['training', 'specialist']);
        expect(DOCTORS.defaultRegions).toEqual({ training: [1, 2], specialist: [3, 3] });
        expect(Object.isFrozen(DOCTORS)).toBe(true);
        expect(Object.isFrozen(DOCTORS.labels)).toBe(true);
        expect(Object.isFrozen(DOCTORS.defaultRegions)).toBe(true);
        expect(Object.isFrozen(DOCTORS.defaultRegions.training)).toBe(true);
    });

    it('puts an UNRECORDED rank strictly below the bottom of the scale', () => {
        expect(DOCTORS.unknownRank).toBe(DOCTORS.firstRank - 1);
        expect(NURSING.unknownRank).toBe(0);
        expect(ALLIED_HEALTH_SCALE.unknownRank).toBe(6);
        // Never `-Infinity`: two unknown ranks must compare to a number, not NaN.
        expect(Number.isFinite(ALLIED_HEALTH_SCALE.unknownRank)).toBe(true);
        expect(ALLIED_HEALTH_SCALE.unknownRank - ALLIED_HEALTH_SCALE.unknownRank).toBe(0);
    });

    it('owns its own LEXICON, which is why it is a function and not a label lookup', () => {
        expect(DOCTORS.parseRank('consultant')).toBe(3);
        expect(DOCTORS.parseRank(' Registrar ')).toBe(2);
        expect(DOCTORS.parseRank('SHO')).toBeNull();
        // The allied-health lexicon accepts a PADDED number, which no label match
        // over `['AH7', …]` would ever produce.
        expect(ALLIED_HEALTH_SCALE.parseRank('AH07')).toBe(7);
        expect(ALLIED_HEALTH_SCALE.parseRank('AH007')).toBeNull();
    });

    it('looks a rank up in any region set', () => {
        expect(regionOfRank(1, DOCTORS.defaultRegions, DOCTORS)).toBe('training');
        expect(regionOfRank(3, DOCTORS.defaultRegions, DOCTORS)).toBe('specialist');
        expect(regionOfRank(7, NURSING.defaultRegions, NURSING)).toBe('senior');
        expect(regionOfRank(99, NURSING.defaultRegions, NURSING)).toBeNull();
    });

    it('walks the regions in SCALE ORDER, which only shows on a set that overlaps', () => {
        // `regionOfRank` is exported and does NOT validate — `bandOfGrade` is the
        // half that refuses a non-partition. On a valid partition the walk order is
        // unobservable (the regions are disjoint), so this is the only case that
        // pins it: the LOWEST matching region wins.
        const overlapping = { junior: [7, 17], senior: [13, 14], principal: [15, 17] };
        expect(regionOfRank(13, overlapping, ALLIED_HEALTH_SCALE)).toBe('junior');
        expect(regionOfRank(16, overlapping, ALLIED_HEALTH_SCALE)).toBe('junior');
        // …and the loud half still refuses it outright rather than answering.
        expect(bandOfGrade('AH13', overlapping)).toBeNull();
    });
});

describe('SCALE: region validation, in each scale`s own words', () => {
    it('accepts every shipped partition, at one, two, three and five regions', () => {
        for (const scale of [FLAT, DOCTORS, ALLIED_HEALTH_SCALE, NURSING]) {
            expect(validateScaleRegions(scale.defaultRegions, scale)).toEqual({ valid: true, reason: null });
        }
    });

    it.each([
        [
            'not an object',
            'x',
            'Career stages must be an object of the form { training: [1, 2], specialist: [3, 3] }.',
        ],
        [
            'an unknown region',
            { training: [1, 2], specialist: [3, 3], senior: [1, 1] },
            'Career stages include an unknown stage "senior" — the two stages are training and specialist.',
        ],
        [
            'a missing region',
            { training: [1, 2] },
            'Career stages are missing the specialist stage — both of training and specialist must be given, so that every post lands in exactly one.',
        ],
        [
            'a bound that is not a range',
            { training: [1], specialist: [3, 3] },
            'Career stage training must be a two-number range [min, max], e.g. [1, 2].',
        ],
        [
            'a fractional bound',
            { training: [1, 1.5], specialist: [3, 3] },
            'Career stage training has the bound 1.5 — stage bounds are whole post numbers between 1 and 3.',
        ],
        [
            'a bound off the scale',
            { training: [1, 9], specialist: [3, 3] },
            'Career stage training has the bound 9, which is outside the MO–Consultant scale.',
        ],
        [
            'a reversed range',
            { training: [1, 2], specialist: [3, 2] },
            'Career stage specialist runs from 3 down to 2 — its minimum must not be above its maximum.',
        ],
        [
            'a gap',
            { training: [1, 1], specialist: [3, 3] },
            'Career stages leave Registrar in no stage at all — training ends at MO and specialist starts at Consultant. Anybody on an unstaged post would be silently unable to lead every stage-restricted task, so the stages must be contiguous.',
        ],
        [
            'an overlap',
            { training: [1, 3], specialist: [3, 3] },
            'Career stages training (MO–Consultant) and specialist (Consultant–Consultant) overlap — no post may belong to two stages.',
        ],
        [
            'a bottom that is not the bottom',
            { training: [2, 2], specialist: [3, 3] },
            'Career stage training must start at 1 (MO), the bottom of the scale — otherwise the posts below it would be in no stage at all.',
        ],
    ])('refuses %s in the doctors` nouns', (_label, regions, reason) => {
        expect(validateScaleRegions(regions, DOCTORS).reason).toBe(reason);
    });

    it('reads correctly at ONE region and at FIVE', () => {
        expect(validateScaleRegions({ staff: [1, 1] }, FLAT).reason).toBe(
            'Tier staff must end at 2 (T2), the top of the scale — otherwise the levels above it would be in no tier at all.',
        );
        expect(validateScaleRegions({ staff: [1, 2], extra: [1, 1] }, FLAT).reason).toBe(
            'Tiers include an unknown tier "extra" — the one tier is staff.',
        );
        expect(validateScaleRegions({
            enrolled: [1, 2], registered: [3, 5], senior: [7, 7], advanced: [8, 9], nurseManager: [10, 10],
        }, NURSING).reason).toBe(
            'Nursing bands leave N6 in no band at all — registered ends at N5 and senior starts at N7. Anybody on an unbanded level would be silently unable to lead every band-restricted task, so the bands must be contiguous.',
        );
        expect(validateScaleRegions({
            enrolled: [1, 2], registered: [3, 5], senior: [6, 7], advanced: [8, 9],
        }, NURSING).reason).toBe(
            'Nursing bands are missing the nurseManager band — all five of enrolled, registered, senior, advanced and nurseManager must be given, so that every level lands in exactly one.',
        );
    });
});

describe('SCALE: the four public exports ARE the allied-health instance', () => {
    it('`GRADE_SCALE` is the instance`s labels', () => {
        expect(GRADE_SCALE).toBe(ALLIED_HEALTH_SCALE.labels);
        expect(GRADE_SCALE).toEqual([
            'AH7', 'AH8', 'AH9', 'AH10', 'AH11', 'AH12', 'AH13', 'AH14', 'AH15', 'AH16', 'AH17',
        ]);
    });

    it('`DEFAULT_GRADE_BANDS` is the instance`s default regions', () => {
        expect(DEFAULT_GRADE_BANDS).toBe(ALLIED_HEALTH_SCALE.defaultRegions);
        expect(Object.keys(DEFAULT_GRADE_BANDS)).toEqual(ALLIED_HEALTH_SCALE.regionOrder);
    });

    it('`validateGradeBands` is `validateScaleRegions` on that instance, exactly', () => {
        for (const bands of [
            DEFAULT_GRADE_BANDS,
            { junior: [7, 11], senior: [12, 14], principal: [15, 17] },
            { junior: [7, 11], senior: [13, 14], principal: [15, 17] },
            { junior: [7, 13], senior: [13, 14], principal: [15, 17] },
            { junior: [8, 12], senior: [13, 14], principal: [15, 17] },
            { junior: [7, 12], senior: [13, 14], principal: [15, 16] },
            { junior: [7, 12], senior: [13, 14] },
            { junior: [7, 12], senior: [13, 14], principal: [15, 17], lead: [1, 2] },
            {}, 'wide', null, 5,
        ]) {
            expect(validateGradeBands(bands)).toEqual(validateScaleRegions(bands, ALLIED_HEALTH_SCALE));
        }
    });

    it('`bandOfGrade` is a rank lookup over that instance`s regions', () => {
        for (const grade of [...GRADE_SCALE, 'ah7', 'AH07', ' AH13 ', 'AH6', 'AH18', '', null, undefined, 13]) {
            const rank = ALLIED_HEALTH_SCALE.parseRank(grade);
            const expected = rank === null ? null : regionOfRank(rank, DEFAULT_GRADE_BANDS, ALLIED_HEALTH_SCALE);
            expect(bandOfGrade(grade)).toBe(expected);
        }
    });

    it('a department`s scale is not yet a configuration field, and that is the seam', () => {
        // `rules.bands` moves the BOUNDARIES; there is no `rules.scale`, so a
        // configuration naming one is ignored exactly as any unknown key is, and the
        // roster is judged against the allied-health scale. Documented so that the
        // absence is a decision rather than an oversight.
        const config = (rules) => ({
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ada', grade: 'AH15' }, { name: 'Ben', grade: 'AH9' }],
            tasks: [{ name: 'T', days: [1], leadBands: ['principal'], coLeads: 0 }],
            ...(rules === null ? {} : { rules }),
        });
        expect(generated(config({ scale: 'nursing' })).roster).toEqual(generated(config(null)).roster);
        // And a nursing grade is still refused, in the allied-health scale's words.
        expect(refusal({
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ada', grade: 'N7' }],
            tasks: [{ name: 'T', coLeads: 0 }],
            rules: { scale: 'nursing' },
        })).toBe('Ada\'s grade is "N7", which is not on the allied-health scale — use one of AH7–AH17 (case does not matter), or leave it out if it is not recorded.');
    });
});
