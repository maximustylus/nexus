/**
 * ==============================================================================
 * AURA ROSTER ENGINE V2 — QUOTAS AND COHORT WINDOWS, SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest
 * Run:    npm test
 *
 * WHY THIS IS A SIBLING FILE. `rosterEngineV2.test.js` (174), `.grades.test.js`
 * (149), `.psych.test.js` (128), `.hours.test.js` (89) and `.slots.test.js` (89)
 * are the COMPATIBILITY GATE for this change and are byte-identical to `main`.
 * `.primitives.test.js` (109) is byte-identical apart from TWO LINES, both in the
 * one test that ENUMERATES the eligibility-kind table: cohort windows are that
 * table's third kind, which is what its own design says a new kind should be, and
 * an enumeration cannot grow without being edited. Nothing was softened; the
 * addition is asserted here, in full.
 *
 * Everything below is a SPECIFICATION test: a failure is a bug in the engine.
 * Every date, every count and every quoted sentence was obtained by RUNNING the
 * engine and then CHECKED against the arithmetic it claims — never derived by
 * hand, never copied out of the implementation.
 *
 * WHAT IS BEING PINNED:
 *
 *   A. QUOTA — the first FLOOR in this engine. Everything else is a cap.
 *      · the representation, and the two sugars (`task.quota`, `rules.quotas`)
 *      · a `max` is HARD: a slot that would breach one is `unfilled` with a
 *        reason naming the quota, the period and the count
 *      · a `min` is SOFT: PREFERRED in candidate selection ahead of ordinary
 *        FTE-weighted fairness, then MEASURED off the finished roster and NAMED
 *        in `warnings` with the person, the class, the period and the shortfall
 *      · an ARITHMETICALLY IMPOSSIBLE floor is a validation REFUSAL showing the
 *        arithmetic — the medical lab scientists' rule, and the five-people-four-
 *        Saturdays case from the field interview
 *      · THE LABS' FIXTURE: weekday sessions plus Saturday duty, and every
 *        person reaching at least two Saturdays a month, asserted per person per
 *        calendar month
 *
 *   B. COHORT WINDOWS — eligibility bounded in time, composed through the
 *      ELIGIBILITY primitive rather than special-cased in the day loop.
 *      · THE EMBRYOLOGY FIXTURE: teams A/B/C, one four-month block each, over a
 *        twelve-month run, with each team appearing only inside its own block
 *      · a window restricted to NAMED TASKS
 *      · `unfilled` reasons that NAME the window, and a read-back audit rule
 *      · validation: well-formed dates, `from <= to`, tasks that exist, and a
 *        task no window reaches for the whole run
 *
 *   C. BOTH, composing with hours, bands and continuity — and DETERMINISM.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
    generateRosterV2,
    validateRosterV2Config,
    auditHardConstraints,
    scoreRoster,
    // QUOTA
    resolveQuotas,
    quotaOf,
    quotaCountsTask,
    quotaClassLabel,
    quotaPeriodKey,
    QUOTA_SUBJECTS,
    QUOTA_PERIODS,
    QUOTA_CLASS_KINDS,
    // COHORT WINDOW, through ELIGIBILITY
    ELIGIBILITY_KINDS,
    ELIGIBILITY_KIND_NAMES,
    windowRequirement,
    eligibilityOf,
    skillRequirement,
    firstUnmetRequirement,
    meetsEligibility,
    compileTaskPrimitives,
} from './rosterEngineV2';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * 2027-02-01 is a MONDAY and February 2027 is 28 days long, so a four-week run
 * from it covers EXACTLY one calendar month — which is the only way to test a
 * `per: 'month'` floor without a partial period, and is also exactly the field
 * interview's arithmetic: four Saturdays in the month.
 */
const FEB = '2027-02-01';

/** The four Saturdays of February 2027, in order. */
const FEB_SATURDAYS = ['2027-02-06', '2027-02-13', '2027-02-20', '2027-02-27'];

/** A run that must have succeeded — with the refusal reason in the message. */
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

/** Every shift of one task, keyed by date. */
const shiftsOf = (roster, taskName) => Object.entries(roster)
    .flatMap(([dateKey, shifts]) => shifts
        .filter((shift) => shift.task === taskName)
        .map((shift) => ({ dateKey, ...shift })));

/** `{ '2027-02': { Ada: 2, … } }` — duties of one task per person per month. */
const perPersonPerMonth = (roster, taskName) => {
    const out = {};
    for (const shift of shiftsOf(roster, taskName)) {
        const month = shift.dateKey.slice(0, 7);
        out[month] = out[month] || {};
        for (const name of shift.assignees) {
            out[month][name] = (out[month][name] || 0) + 1;
        }
    }
    return out;
};

/** The warnings mentioning a word, so one assertion is not hostage to the rest. */
const warningsAbout = (result, word) => result.warnings.filter((line) => line.includes(word));

// ═════════════════════════════════════════════════════════════════════════════
// A1. QUOTA — the representation and the two sugars
// ═════════════════════════════════════════════════════════════════════════════

describe('QUOTA: the representation', () => {
    it('names its vocabulary, and the periods are still the CAPACITY periods', () => {
        expect(QUOTA_SUBJECTS).toEqual({ person: 'person', region: 'region' });
        expect(QUOTA_PERIODS).toEqual({ run: 'run', week: 'week', month: 'month' });
        expect(QUOTA_CLASS_KINDS).toEqual({ task: 'task', category: 'category' });
    });

    it('still declares the SHAPE it declared before it was implemented', () => {
        // `quotaOf` is unchanged: the primitive is a subject, a class, a period and
        // two optional bounds, and the sugars below compile to exactly that.
        expect(quotaOf({ taskClass: 'Saturday Lab', min: 2, max: 4, period: 'month' })).toEqual({
            subject: 'person', taskClass: 'Saturday Lab', period: 'month', min: 2, max: 4,
        });
        expect(quotaOf({ taskClass: 'Clinic' })).toEqual({
            subject: 'person', taskClass: 'Clinic', period: 'run', min: null, max: null,
        });
    });

    it('resolves NOTHING for a configuration that declares none — the feature is inert', () => {
        for (const config of [
            {},
            { startDate: FEB, weeks: 1, staff: [{ name: 'Ada' }], tasks: [{ name: 'T' }] },
            // A top-level `quotas` key is not a surface: it is an unknown key, and is
            // ignored exactly as any other unknown key is (see the ledger — this is
            // FLAGGED, not celebrated).
            { quotas: [{ subject: 'person', taskClass: 'Clinic', min: 2 }] },
        ]) {
            expect(resolveQuotas(config)).toEqual([]);
            expect(Object.isFrozen(resolveQuotas(config))).toBe(true);
        }
    });

    it('compiles `task.quota` to a quota over that ONE task', () => {
        expect(resolveQuotas({
            tasks: [{ name: 'Saturday Duty', quota: { per: 'month', min: 2, scope: 'person' } }],
        })).toEqual([
            {
                subject: 'person',
                taskClass: { kind: 'task', name: 'Saturday Duty' },
                period: 'month',
                min: 2,
                max: null,
            },
        ]);
    });

    it('compiles `rules.quotas` to a quota over a CATEGORY, and pools the tasks in it', () => {
        const quotas = resolveQuotas({
            tasks: [
                { name: 'Sat Bench', category: 'WEEKEND' },
                { name: 'Sun Bench', category: 'WEEKEND' },
                { name: 'Clinic' },
            ],
            rules: { quotas: [{ category: 'WEEKEND', per: 'week', max: 1 }] },
        });
        expect(quotas).toEqual([
            {
                subject: 'person',
                taskClass: { kind: 'category', category: 'WEEKEND' },
                period: 'week',
                min: null,
                max: 1,
            },
        ]);
        // ONE quota counting TWO tasks — which is what "two weekend duties" means,
        // as against "two of each".
        expect(quotaCountsTask(quotas[0], compileTaskPrimitives({ name: 'Sat Bench', category: 'WEEKEND' }))).toBe(true);
        expect(quotaCountsTask(quotas[0], compileTaskPrimitives({ name: 'Sun Bench', category: 'WEEKEND' }))).toBe(true);
        expect(quotaCountsTask(quotas[0], compileTaskPrimitives({ name: 'Clinic' }))).toBe(false);
    });

    it('defaults `per` to the run and `scope` to the person, and freezes what it builds', () => {
        const [quota] = resolveQuotas({ tasks: [{ name: 'T', quota: { min: 1 } }] });
        expect(quota.period).toBe('run');
        expect(quota.subject).toBe('person');
        expect(Object.isFrozen(quota)).toBe(true);
        expect(Object.isFrozen(quota.taskClass)).toBe(true);
    });

    it('resolves task quotas before rules quotas, in declaration order', () => {
        const quotas = resolveQuotas({
            tasks: [
                { name: 'A', category: 'W', quota: { min: 1 } },
                { name: 'B', category: 'W', quota: { max: 3 } },
            ],
            rules: { quotas: [{ category: 'W', min: 2 }] },
        });
        expect(quotas.map((quota) => quotaClassLabel(quota))).toEqual(['A', 'B', 'category W']);
    });

    it('buckets a date into its period the same way the hours model does', () => {
        const month = resolveQuotas({ tasks: [{ name: 'T', quota: { per: 'month', min: 1 } }] })[0];
        const week = resolveQuotas({ tasks: [{ name: 'T', quota: { per: 'week', min: 1 } }] })[0];
        const run = resolveQuotas({ tasks: [{ name: 'T', quota: { min: 1 } }] })[0];

        expect(quotaPeriodKey(month, '2027-02-13')).toBe('2027-02');
        // 2027-02-06 is a SATURDAY; its week is the one the Monday 2027-02-01 opened,
        // which is the same week the weekly HOURS cap uses. A lab weekend does not
        // straddle two periods.
        expect(quotaPeriodKey(week, '2027-02-06')).toBe('2027-02-01');
        expect(quotaPeriodKey(week, '2027-02-07')).toBe('2027-02-01');
        expect(quotaPeriodKey(week, '2027-02-08')).toBe('2027-02-08');
        expect(quotaPeriodKey(run, '2027-02-13')).toBe('run');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// A2. QUOTA — the CEILING is hard
// ═════════════════════════════════════════════════════════════════════════════

const cappedSaturdays = {
    startDate: FEB,
    weeks: 4,
    staff: [{ name: 'Ada' }, { name: 'Ben' }],
    tasks: [{ name: 'Saturday Duty', days: [6], coLeads: 0, quota: { per: 'month', max: 1 } }],
};

describe('QUOTA: a max is HARD, and an unfillable slot says which quota bound', () => {
    it('leaves the slot UNFILLED rather than working somebody past their ceiling', () => {
        const result = generated(cappedSaturdays);
        // Two people, one ceiling each, four Saturdays: two are staffed and two are
        // reported. Never a third duty for anybody.
        expect(shiftsOf(result.roster, 'Saturday Duty').map((shift) => shift.dateKey))
            .toEqual(['2027-02-06', '2027-02-13']);
        expect(result.unfilled.map((entry) => entry.date)).toEqual(['2027-02-20', '2027-02-27']);
        expect(perPersonPerMonth(result.roster, 'Saturday Duty')).toEqual({
            '2027-02': { Ada: 1, Ben: 1 },
        });
    });

    it('NAMES the quota, the count and the period in the unfilled reason', () => {
        const result = generated(cappedSaturdays);
        expect(result.unfilled[0].reason).toBe(
            'no available staff for Saturday Duty lead on 2027-02-20 (2 in pool, 2 at a quota ceiling)'
            + ' — Ada already holds their quota ceiling of 1 Saturday Duty duty in 2027-02;'
            + ' Ben already holds their quota ceiling of 1 Saturday Duty duty in 2027-02',
        );
    });

    it('measures ZERO hard violations for the roster it built, and re-audits the ceiling', () => {
        const result = generated(cappedSaturdays);
        expect(result.score.hardViolations).toBe(0);
        expect(auditHardConstraints(result.roster, cappedSaturdays).count).toBe(0);
    });

    it('CATCHES a ceiling breach in a roster it did not build — the read-back half', () => {
        const overworked = {
            '2027-02-06': [{ task: 'Saturday Duty', lead: 'Ada', staff: 'Lead: Ada', category: 'CORE', week: 1, assignees: ['Ada'] }],
            '2027-02-13': [{ task: 'Saturday Duty', lead: 'Ada', staff: 'Lead: Ada', category: 'CORE', week: 2, assignees: ['Ada'] }],
        };
        const audit = auditHardConstraints(overworked, cappedSaturdays);
        expect(audit.count).toBe(1);
        expect(audit.violations[0]).toEqual({
            rule: 'quotaCeiling',
            date: null,
            task: null,
            detail: 'Ada holds 2 Saturday Duty duties in 2027-02, quota ceiling 1',
        });
        // And it reaches `score`, so a swap tool that breaches a quota is visible in
        // the one number this engine treats as a defect.
        expect(scoreRoster(overworked, cappedSaturdays).hardViolations).toBe(1);
    });

    it('reads EVERY floor that counts a task, not only the first of them', () => {
        // Two floors over one task: its own (`min: 1` of Bench) and a pooled category
        // floor (`min: 4` of either weekend task). Both are honoured, and the pooled
        // one is exactly met — supply is 8 duties against a demand of 8.
        const result = generated({
            startDate: FEB,
            weeks: 4,
            staff: [{ name: 'Ada' }, { name: 'Ben' }],
            tasks: [
                { name: 'Bench', days: [1], coLeads: 0, category: 'WEEKEND', quota: { per: 'run', min: 1 } },
                { name: 'On Call', days: [2], coLeads: 0, category: 'WEEKEND' },
            ],
            rules: { quotas: [{ category: 'WEEKEND', per: 'run', min: 4 }] },
        });
        const bench = perPersonPerMonth(result.roster, 'Bench')['2027-02'];
        const onCall = perPersonPerMonth(result.roster, 'On Call')['2027-02'];
        expect(bench).toEqual({ Ada: 2, Ben: 2 });
        expect(onCall).toEqual({ Ada: 2, Ben: 2 });
        for (const name of ['Ada', 'Ben']) {
            expect(bench[name], `${name} must clear the Bench floor of 1`).toBeGreaterThanOrEqual(1);
            expect(bench[name] + onCall[name], `${name} must clear the pooled floor of 4`).toBeGreaterThanOrEqual(4);
        }
        expect(warningsAbout(result, 'Quota floor not met')).toEqual([]);
        expect(result.unfilled).toEqual([]);
    });

    it('counts a CATEGORY ceiling across every task in the class, not per task', () => {
        const config = {
            startDate: FEB,
            weeks: 4,
            staff: [{ name: 'Ada' }, { name: 'Ben' }],
            tasks: [
                { name: 'Sat Bench', days: [6], coLeads: 0, category: 'WEEKEND' },
                { name: 'Sun Bench', days: [0], coLeads: 0, category: 'WEEKEND' },
            ],
            rules: { quotas: [{ category: 'WEEKEND', per: 'week', max: 1 }] },
        };
        const result = generated(config);
        // Each week holds one Saturday and one Sunday. With a POOLED weekly ceiling of
        // one, the two must go to different people — never both to one.
        for (const [dateKey, shifts] of Object.entries(result.roster)) {
            expect(shifts).toHaveLength(1);
            expect(dateKey).toBeTruthy();
        }
        const weekly = {};
        for (const shift of [...shiftsOf(result.roster, 'Sat Bench'), ...shiftsOf(result.roster, 'Sun Bench')]) {
            const key = `${shift.week}:${shift.assignees[0]}`;
            weekly[key] = (weekly[key] || 0) + 1;
        }
        expect(Object.values(weekly).every((count) => count === 1)).toBe(true);
        expect(result.unfilled).toEqual([]);
        expect(result.score.hardViolations).toBe(0);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// A3. QUOTA — the FLOOR is preferred, then warned about
// ═════════════════════════════════════════════════════════════════════════════

describe('QUOTA: a min is PREFERRED ahead of ordinary fairness', () => {
    /**
     * Ada is cheap for the fairness comparator to keep choosing: she is first in
     * name order and carries no extra load. Without a floor she takes the first
     * Saturday and then keeps taking them whenever the duty counts tie.
     */
    const floorConfig = (quota) => ({
        startDate: FEB,
        weeks: 4,
        staff: [{ name: 'Ada' }, { name: 'Ben' }, { name: 'Cara' }, { name: 'Dan' }],
        tasks: [{ name: 'Saturday Duty', days: [6], coLeads: 0, ...(quota ? { quota } : {}) }],
    });

    it('gives everybody their minimum where the arithmetic allows it', () => {
        const result = generated(floorConfig({ per: 'month', min: 1 }));
        expect(perPersonPerMonth(result.roster, 'Saturday Duty')).toEqual({
            '2027-02': { Ada: 1, Ben: 1, Cara: 1, Dan: 1 },
        });
        expect(warningsAbout(result, 'Quota floor not met')).toEqual([]);
    });

    it('prefers whoever is FURTHEST behind, so a bigger floor concentrates first', () => {
        // Two people, four Saturdays, a floor of two: the deficit alternates and each
        // reaches exactly two. The comparator is doing the work — plain fairness
        // would also alternate here, so the sharper test is the one below.
        const result = generated({
            startDate: FEB,
            weeks: 4,
            staff: [{ name: 'Ada' }, { name: 'Ben' }],
            tasks: [{ name: 'Saturday Duty', days: [6], coLeads: 0, quota: { per: 'month', min: 2 } }],
        });
        expect(perPersonPerMonth(result.roster, 'Saturday Duty')).toEqual({
            '2027-02': { Ada: 2, Ben: 2 },
        });
    });

    it('OUTRANKS the load a person is carrying elsewhere — a floor is not fairness', () => {
        // Ben already holds a heavy weekday task, so FTE-weighted fairness would send
        // every Saturday to Ada. The floor overrides that: Ben is short, so Ben goes.
        const config = {
            startDate: FEB,
            weeks: 4,
            staff: [{ name: 'Ada' }, { name: 'Ben', skills: ['Cyto'] }],
            tasks: [
                { name: 'Cyto Reporting', days: [1, 2, 3, 4, 5], coLeads: 0, requiresSkill: 'Cyto' },
                { name: 'Saturday Duty', days: [6], coLeads: 0, quota: { per: 'month', min: 2 } },
            ],
        };
        const withFloor = generated(config);
        expect(perPersonPerMonth(withFloor.roster, 'Saturday Duty')).toEqual({
            '2027-02': { Ada: 2, Ben: 2 },
        });

        // The same configuration WITHOUT the floor: Ada takes every Saturday, because
        // Ben's 20 weekday duties make him the worse candidate every time. This is the
        // control that proves the floor changed the roster.
        const plainTasks = config.tasks.map(({ quota, ...task }) => task);
        const plain = generated({ ...config, tasks: plainTasks });
        expect(perPersonPerMonth(plain.roster, 'Saturday Duty')).toEqual({
            '2027-02': { Ada: 4 },
        });
    });

    it('never buys somebody a slot a HARD constraint refuses them', () => {
        // Ada is short of her floor on every Saturday, and unavailable on three of
        // them. The floor prefers her; leave still wins, every time.
        const result = generated({
            startDate: FEB,
            weeks: 4,
            staff: [
                { name: 'Ada', unavailable: ['2027-02-06', '2027-02-13', '2027-02-20'] },
                { name: 'Ben' },
            ],
            tasks: [{ name: 'Saturday Duty', days: [6], coLeads: 0, quota: { per: 'month', min: 2 } }],
        });
        expect(perPersonPerMonth(result.roster, 'Saturday Duty')).toEqual({
            '2027-02': { Ada: 1, Ben: 3 },
        });
        expect(result.score.hardViolations).toBe(0);
    });
});

describe('QUOTA: an unmet floor is MEASURED and NAMED', () => {
    const blockedByLeave = {
        startDate: FEB,
        weeks: 4,
        staff: [
            { name: 'Ada', unavailable: ['2027-02-06', '2027-02-13', '2027-02-20'] },
            { name: 'Ben' },
        ],
        tasks: [{ name: 'Saturday Duty', days: [6], coLeads: 0, quota: { per: 'month', min: 2 } }],
    };

    it('names the person, the task, the period and the shortfall', () => {
        const result = generated(blockedByLeave);
        expect(warningsAbout(result, 'Quota floor not met')).toEqual([
            'Quota floor not met: Ada is short of Task Saturday Duty\'s quota'
            + ' — at least 2 Saturday Duty duties per month — in 2027-02 (1 of 2, 1 short).'
            + ' A floor cannot be met by inventing capacity: the engine preferred them'
            + ' for every occurrence it could and this is what was left.',
        ]);
    });

    it('does NOT count an unmet floor as a hard violation — a floor cannot be enforced', () => {
        const result = generated(blockedByLeave);
        expect(result.score.hardViolations).toBe(0);
        expect(auditHardConstraints(result.roster, blockedByLeave).count).toBe(0);
    });

    it('lists EVERY short period in one sentence per person, rather than one per period', () => {
        // A `per: 'week'` floor of one on a Monday task needing two people, and Ada on
        // leave for three of the four Mondays: three short weeks, one warning.
        const result = generated({
            startDate: FEB,
            weeks: 4,
            staff: [
                { name: 'Ada', unavailable: ['2027-02-08', '2027-02-15', '2027-02-22'] },
                { name: 'Ben' },
            ],
            tasks: [{ name: 'Weekly Bench', days: [1], quota: { per: 'week', min: 1 } }],
        });
        const shortfalls = warningsAbout(result, 'Quota floor not met');
        expect(shortfalls).toHaveLength(1);
        expect(shortfalls[0]).toContain('Ada is short');
        expect(shortfalls[0]).toContain('the week of 2027-02-08 (0 of 1, 1 short)');
        expect(shortfalls[0]).toContain('the week of 2027-02-15 (0 of 1, 1 short)');
        expect(shortfalls[0]).toContain('the week of 2027-02-22 (0 of 1, 1 short)');
        // And not the week she DID work, so the list is a measurement rather than a
        // restatement of the configuration.
        expect(shortfalls[0]).not.toContain('the week of 2027-02-01');
    });

    it('does not judge a PARTIAL period, and says so instead of staying quiet', () => {
        const result = generated({
            // A Monday in the middle of February: the run covers part of February and
            // part of March, and neither is a whole month.
            startDate: '2027-02-08',
            weeks: 4,
            staff: [{ name: 'Ada' }, { name: 'Ben' }],
            tasks: [{ name: 'Saturday Duty', days: [6], coLeads: 0, quota: { per: 'month', min: 1 } }],
        });
        expect(warningsAbout(result, 'not judged')).toEqual([
            'Task Saturday Duty\'s quota asks for at least 1 per month, and this run covers'
            + ' only 2027-02-08 to 2027-02-28 of 2027-02, so the floor is not judged there.',
            'Task Saturday Duty\'s quota asks for at least 1 per month, and this run covers'
            + ' only 2027-03-01 to 2027-03-07 of 2027-03, so the floor is not judged there.',
        ]);
        expect(warningsAbout(result, 'Quota floor not met')).toEqual([]);
    });

    it('says who the floor does NOT apply to, rather than reporting them short forever', () => {
        const result = generated({
            startDate: FEB,
            weeks: 4,
            staff: [{ name: 'Ada', skills: ['Blood'] }, { name: 'Ben' }],
            tasks: [{
                name: 'Saturday Duty', days: [6], coLeads: 0,
                requiresSkill: 'Blood', quota: { per: 'month', min: 2 },
            }],
        });
        expect(warningsAbout(result, 'does not apply')).toEqual([
            'Task Saturday Duty\'s quota counts Saturday Duty, which 1 staff member can'
            + ' never be rostered on (Ben) — the skill, the band, the length of a session'
            + ' against their day, or their cohort windows rule them out — so the quota'
            + ' does not apply to them.',
        ]);
        expect(warningsAbout(result, 'Quota floor not met')).toEqual([]);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// A4. QUOTA — an impossible floor is REFUSED, with the arithmetic
// ═════════════════════════════════════════════════════════════════════════════

describe('QUOTA: an arithmetically impossible floor is a refusal', () => {
    it('refuses the field interview`s case and SHOWS the arithmetic', () => {
        // Five people needing two Saturdays each, in a month with four Saturdays and
        // one slot per Saturday: 10 demanded, 4 in existence.
        expect(refusal({
            startDate: FEB,
            weeks: 4,
            staff: ['Ada', 'Ben', 'Cara', 'Dan', 'Eve'].map((name) => ({ name })),
            tasks: [{ name: 'Saturday Duty', days: [6], coLeads: 0, quota: { per: 'month', min: 2 } }],
        })).toBe(
            'Task Saturday Duty\'s quota asks for at least 2 Saturday Duty duties per month,'
            + ' and 5 staff members are subject to it, so 2027-02 needs 5 × 2 = 10 duties'
            + ' — but only 4 exist there (Saturday Duty runs on 4 dates needing 1 person each).'
            + ' A floor cannot be met by inventing capacity: lower the minimum, add dates,'
            + ' add people to each date, or narrow who the quota applies to.',
        );
    });

    it('counts POSITIONS, not shifts — a second slot per date doubles the supply', () => {
        // The same five people, still two Saturdays each, but each Saturday now needs
        // two people: 10 demanded, 8 in existence. Still refused, and the arithmetic
        // moves with the configuration.
        expect(refusal({
            startDate: FEB,
            weeks: 4,
            staff: ['Ada', 'Ben', 'Cara', 'Dan', 'Eve'].map((name) => ({ name })),
            tasks: [{ name: 'Saturday Duty', days: [6], quota: { per: 'month', min: 2 } }],
        })).toContain('needs 5 × 2 = 10 duties — but only 8 exist there'
            + ' (Saturday Duty runs on 4 dates needing 2 people each)');

        // Four people is exactly 8, and is accepted — the boundary is `demand > supply`
        // and not `demand >= supply`, because a floor met exactly is a floor met.
        expect(validateRosterV2Config({
            startDate: FEB,
            weeks: 4,
            staff: ['Ada', 'Ben', 'Cara', 'Dan'].map((name) => ({ name })),
            tasks: [{ name: 'Saturday Duty', days: [6], quota: { per: 'month', min: 2 } }],
        }).valid).toBe(true);
    });

    it('sums the supply across every task a CATEGORY quota counts', () => {
        expect(refusal({
            startDate: FEB,
            weeks: 4,
            staff: ['Ada', 'Ben', 'Cara', 'Dan', 'Eve'].map((name) => ({ name })),
            tasks: [
                { name: 'Sat Bench', days: [6], coLeads: 0, category: 'WEEKEND' },
                { name: 'Sun Bench', days: [0], coLeads: 0, category: 'WEEKEND' },
            ],
            rules: { quotas: [{ category: 'WEEKEND', per: 'month', min: 2 }] },
        })).toContain('needs 5 × 2 = 10 duties — but only 8 exist there'
            + ' (Sat Bench runs on 4 dates needing 1 person each,'
            + ' Sun Bench runs on 4 dates needing 1 person each)');
    });

    it('does not refuse a PARTIAL period, however short — that is a horizon, not a policy', () => {
        // A one-week run holds one Saturday and no whole month, so a monthly floor of
        // two is un-judgeable rather than impossible. Accepted, and warned about.
        const config = {
            startDate: FEB,
            weeks: 1,
            staff: ['Ada', 'Ben', 'Cara'].map((name) => ({ name })),
            tasks: [{ name: 'Saturday Duty', days: [6], coLeads: 0, quota: { per: 'month', min: 2 } }],
        };
        expect(validateRosterV2Config(config).valid).toBe(true);
        expect(warningsAbout(generated(config), 'not judged')).toHaveLength(1);
    });

    it('excludes people who could never do the work from the arithmetic', () => {
        // Three people, four Saturdays, one slot each, a floor of two: 6 > 4 would
        // refuse — but only two of the three hold the skill, so the real demand is 4
        // and the configuration is staffable.
        expect(validateRosterV2Config({
            startDate: FEB,
            weeks: 4,
            staff: [
                { name: 'Ada', skills: ['Blood'] },
                { name: 'Ben', skills: ['Blood'] },
                { name: 'Cara' },
            ],
            tasks: [{
                name: 'Saturday Duty', days: [6], coLeads: 0,
                requiresSkill: 'Blood', quota: { per: 'month', min: 2 },
            }],
        }).valid).toBe(true);
    });

    it('refuses a WEEKLY floor on the same arithmetic', () => {
        expect(refusal({
            startDate: FEB,
            weeks: 4,
            staff: [{ name: 'Ada' }, { name: 'Ben' }],
            tasks: [{ name: 'Saturday Duty', days: [6], coLeads: 0, quota: { per: 'week', min: 1 } }],
        })).toBe(
            'Task Saturday Duty\'s quota asks for at least 1 Saturday Duty duty per week,'
            + ' and 2 staff members are subject to it, so the week of 2027-02-01 needs'
            + ' 2 × 1 = 2 duties — but only 1 exist there (Saturday Duty runs on 1 date'
            + ' needing 1 person each). A floor cannot be met by inventing capacity:'
            + ' lower the minimum, add dates, add people to each date, or narrow who the'
            + ' quota applies to.',
        );
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// A5. QUOTA — validation of the fields themselves
// ═════════════════════════════════════════════════════════════════════════════

describe('QUOTA: validation', () => {
    const withQuota = (quota) => ({
        startDate: FEB, weeks: 1, staff: [{ name: 'Ada' }], tasks: [{ name: 'T', quota }],
    });

    it('refuses a quota that is not an object', () => {
        expect(refusal(withQuota(2))).toBe(
            'Task T\'s quota must be an object of the form { per: \'month\', min: 2 } — a floor, a ceiling, or both.',
        );
    });

    it('refuses a period that is not a period', () => {
        expect(refusal(withQuota({ per: 'fortnight', min: 1 }))).toBe(
            'Task T\'s quota has per: "fortnight", which is not a period — use run, week, month.',
        );
    });

    it('refuses `scope: \'region\'` rather than counting it per person', () => {
        // The lesson of the primitive layer's ledger item 11: a declared-and-
        // unimplemented value that VALIDATES is worse than one that does not exist.
        expect(refusal(withQuota({ per: 'week', min: 1, scope: 'region' }))).toBe(
            'Task T\'s quota has scope: \'region\'. A quota over a whole band — "every junior'
            + ' does two Saturdays a month" — is declared in this engine and NOT implemented,'
            + ' so it is refused rather than silently counted per person. Use scope: \'person\','
            + ' or say it per person and check the band yourself.',
        );
        expect(refusal(withQuota({ min: 1, scope: 'team' }))).toBe(
            'Task T\'s quota has scope: "team", which is not a quota subject — use \'person\','
            + ' or leave scope out.',
        );
    });

    it('refuses a quota with no bounds at all', () => {
        expect(refusal(withQuota({ per: 'week' }))).toBe(
            'Task T\'s quota has neither min nor max, so it asks for nothing.'
            + ' Give a floor (min), a ceiling (max), or both.',
        );
    });

    it('refuses a bound of zero, in either direction, and says what it would have meant', () => {
        expect(refusal(withQuota({ min: 0 }))).toBe(
            'Task T\'s quota has min: 0 — it must be a whole number of at least 1.'
            + ' A min of 0 is met by doing nothing, so leave it out instead.',
        );
        expect(refusal(withQuota({ max: 0 }))).toBe(
            'Task T\'s quota has max: 0 — it must be a whole number of at least 1.'
            + ' A max of 0 would mean the work may never be staffed at all, so leave it out instead.',
        );
    });

    it('refuses a floor above its own ceiling', () => {
        expect(refusal(withQuota({ min: 3, max: 2 }))).toBe(
            'Task T\'s quota has min 3 and max 2 — a floor above a ceiling cannot be'
            + ' satisfied by any roster.',
        );
    });

    it('refuses a fractional or non-numeric bound', () => {
        expect(refusal(withQuota({ min: 1.5 }))).toContain('it must be a whole number of at least 1');
        expect(refusal(withQuota({ max: '2' }))).toContain('it must be a whole number of at least 1');
    });

    it('refuses a rules.quotas entry that names no category, or an unknown one', () => {
        const base = { startDate: FEB, weeks: 1, staff: [{ name: 'Ada' }], tasks: [{ name: 'T' }] };
        expect(refusal({ ...base, rules: { quotas: {} } })).toBe(
            'rules.quotas must be an array of category quotas, e.g.'
            + ' [{ category: \'WEEKEND\', per: \'month\', min: 2 }].',
        );
        expect(refusal({ ...base, rules: { quotas: [{ min: 1 }] } })).toBe(
            'rules.quotas entry 1 has no category. A rules-level quota counts every task'
            + ' carrying one category — name it, or put the quota on the task itself.',
        );
        expect(refusal({ ...base, rules: { quotas: [{ category: 'WEEKEND', min: 1 }] } })).toBe(
            'rules.quotas entry 1 counts category WEEKEND, which no task carries (the'
            + ' categories in use are CORE). Check the spelling, or set that category on'
            + ' the tasks it should count.',
        );
    });

    it('checks a rules.quotas entry`s shape in the SAME words as a task quota', () => {
        const base = { startDate: FEB, weeks: 1, staff: [{ name: 'Ada' }], tasks: [{ name: 'T' }] };
        expect(refusal({ ...base, rules: { quotas: [{ category: 'CORE', per: 'fortnight', min: 1 }] } })).toBe(
            'rules.quotas entry 1 has per: "fortnight", which is not a period — use run, week, month.',
        );
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// A6. THE MEDICAL LAB SCIENTISTS' FIXTURE
// ═════════════════════════════════════════════════════════════════════════════

describe('THE LABS: weekday sessions plus at least two Saturdays a month', () => {
    /**
     * The rule as the interview stated it: "each staff member works at least two
     * Saturdays per month". Four scientists, a weekday bench session needing two
     * people, and a Saturday duty needing two — so February 2027's four Saturdays
     * hold exactly eight duties against a demand of exactly eight.
     */
    const LABS = {
        startDate: FEB,
        weeks: 4,
        staff: [{ name: 'Ada' }, { name: 'Ben' }, { name: 'Cara' }, { name: 'Dan' }],
        tasks: [
            { name: 'Bench Session', days: [1, 2, 3, 4, 5] },
            { name: 'Saturday Duty', days: [6], quota: { per: 'month', min: 2, scope: 'person' } },
        ],
    };

    it('gives EVERY person at least two Saturdays, asserted per person per month', () => {
        const result = generated(LABS);
        const byMonth = perPersonPerMonth(result.roster, 'Saturday Duty');
        expect(Object.keys(byMonth)).toEqual(['2027-02']);
        expect(byMonth['2027-02']).toEqual({ Ada: 2, Ben: 2, Cara: 2, Dan: 2 });
        for (const [name, count] of Object.entries(byMonth['2027-02'])) {
            expect(count, `${name} should reach the floor of 2`).toBeGreaterThanOrEqual(2);
        }
    });

    it('staffs every Saturday and every weekday session, with nothing unfilled', () => {
        const result = generated(LABS);
        expect(shiftsOf(result.roster, 'Saturday Duty').map((shift) => shift.dateKey)).toEqual(FEB_SATURDAYS);
        expect(shiftsOf(result.roster, 'Bench Session')).toHaveLength(20);
        expect(result.unfilled).toEqual([]);
    });

    it('breaks no hard constraint, and says nothing it does not have to', () => {
        const result = generated(LABS);
        expect(result.score.hardViolations).toBe(0);
        expect(auditHardConstraints(result.roster, LABS).count).toBe(0);
        // A run that covers exactly one whole month, with the floor met, has nothing
        // to report: no partial period, no shortfall, no exclusion.
        expect(result.warnings).toEqual([]);
    });

    it('keeps the weekday work evenly shared while it honours the floor', () => {
        const result = generated(LABS);
        expect(Object.fromEntries(
            Object.entries(result.load).map(([name, entry]) => [name, entry.duties]),
        )).toEqual({ Ada: 12, Ben: 12, Cara: 12, Dan: 12 });
    });

    it('is DETERMINISTIC — the same configuration, twice, byte for byte', () => {
        expect(JSON.stringify(generateRosterV2(LABS))).toBe(JSON.stringify(generateRosterV2(LABS)));
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// B1. COHORT WINDOWS — the third ELIGIBILITY kind
// ═════════════════════════════════════════════════════════════════════════════

/** A normalised-staff-shaped person, which is what the predicates read. */
const personLike = ({ skills = [], band = null, windows = null }) => ({
    name: 'Ada', skills: new Set(skills), band, windows,
});

describe('COHORT WINDOW: it is a requirement kind, not a special case', () => {
    it('is the THIRD row of the eligibility table, carrying its own rejection code', () => {
        expect(ELIGIBILITY_KIND_NAMES.window).toBe('window');
        expect(ELIGIBILITY_KINDS.window.rejection).toBe('window');
        expect(typeof ELIGIBILITY_KINDS.window.met).toBe('function');
    });

    it('builds a requirement from a task name, and nothing from an absent one', () => {
        expect(windowRequirement('Weekend Witnessing')).toEqual({ kind: 'window', task: 'Weekend Witnessing' });
        for (const empty of [null, undefined, '', '   ', 5]) {
            expect(windowRequirement(empty)).toBeNull();
        }
    });

    it('admits everybody who declares NO windows — the feature is additive', () => {
        const requirement = eligibilityOf(windowRequirement('T'));
        expect(meetsEligibility(personLike({}), requirement, { dateKey: '2027-02-01' })).toBe(true);
        expect(meetsEligibility(personLike({ windows: [] }), requirement, { dateKey: '2027-02-01' })).toBe(true);
    });

    it('answers the DATED question for the day loop and the DATE-LESS one for a warning', () => {
        const requirement = eligibilityOf(windowRequirement('Witnessing'));
        const person = personLike({
            windows: [{ from: '2027-03-01', to: '2027-03-31', tasks: null, label: 'block' }],
        });
        // Inside the block, yes; outside it, no.
        expect(meetsEligibility(person, requirement, { dateKey: '2027-03-15' })).toBe(true);
        expect(meetsEligibility(person, requirement, { dateKey: '2027-02-15' })).toBe(false);
        // The DATE-LESS question is "could they ever?", and this window names every
        // task, so the answer is yes even though today is not in it.
        expect(meetsEligibility(person, requirement, { dateKey: null })).toBe(true);
        // A window that names OTHER tasks fails even the date-less question.
        const narrowed = personLike({
            windows: [{ from: null, to: null, tasks: new Set(['Something Else']), label: 'block' }],
        });
        expect(meetsEligibility(narrowed, requirement, { dateKey: null })).toBe(false);
        // NO CONTEXT AT ALL: windows are not the question the caller is asking, and the
        // requirement says so rather than guessing (the audit's slot matching).
        expect(meetsEligibility(narrowed, requirement)).toBe(true);
    });

    it('reports the FIRST unmet requirement, and a window is the LAST of them', () => {
        const eligibility = eligibilityOf(skillRequirement('Witnessing'), windowRequirement('T'));
        const outsideAndUnskilled = personLike({
            windows: [{ from: '2027-03-01', to: '2027-03-31', tasks: null, label: 'block' }],
        });
        const ctx = { dateKey: '2027-02-01' };
        // Fails both: the SKILL is reported, because a lacked competency is the more
        // fundamental fact and it is what the sentence should say.
        expect(firstUnmetRequirement(outsideAndUnskilled, eligibility, ctx).kind).toBe('skill');
        const skilled = personLike({
            skills: ['Witnessing'],
            windows: [{ from: '2027-03-01', to: '2027-03-31', tasks: null, label: 'block' }],
        });
        expect(firstUnmetRequirement(skilled, eligibility, ctx).kind).toBe('window');
    });

    it('reaches EVERY position of a task, both sugars, and only when windows exist', () => {
        // No windows anywhere: the compiled positions are what they were before this
        // feature existed. This is the additivity claim, made structurally.
        expect(compileTaskPrimitives({ name: 'T' }).positions.map((p) => p.eligibility))
            .toEqual([[], []]);
        expect(compileTaskPrimitives({ name: 'T', slots: [{ band: 'senior' }] }).positions[0].eligibility)
            .toEqual([{ kind: 'region', regions: new Set(['senior']) }]);

        // With windows in force, every position of either sugar carries the window.
        const paired = compileTaskPrimitives({ name: 'T', coLeads: 1 }, null, true);
        expect(paired.positions.map((p) => p.eligibility)).toEqual([
            [{ kind: 'window', task: 'T' }],
            [{ kind: 'window', task: 'T' }],
        ]);
        const team = compileTaskPrimitives({
            name: 'T', requiresSkill: 'Witnessing', slots: [{ band: 'senior' }, {}],
        }, null, true);
        expect(team.positions.map((p) => p.eligibility.map((r) => r.kind))).toEqual([
            ['skill', 'region', 'window'],
            ['skill', 'window'],
        ]);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// B2. THE EMBRYOLOGISTS' FIXTURE — teams A/B/C, a four-month block each
// ═════════════════════════════════════════════════════════════════════════════

/** The three teams, and the block each one takes. */
const TEAMS = {
    A: { people: ['Alice', 'Amir'], from: '2027-01-01', to: '2027-04-30', label: "team A's block" },
    B: { people: ['Bea', 'Bo'], from: '2027-05-01', to: '2027-08-31', label: "team B's block" },
    C: { people: ['Cleo', 'Caz'], from: '2027-09-01', to: '2027-12-31', label: "team C's block" },
};

/**
 * A 52-week run from Monday 2026-12-28, so that the whole of 2027 is inside it and
 * team A's block opens on the first Saturday.
 */
const EMBRYOLOGY = {
    startDate: '2026-12-28',
    weeks: 52,
    staff: Object.values(TEAMS).flatMap((team) => team.people.map((name) => ({
        name,
        windows: [{ from: team.from, to: team.to, label: team.label }],
    }))),
    tasks: [{ name: 'Weekend Witnessing', days: [6] }],
};

/** Which team is this person on? */
const teamOf = (name) => Object.keys(TEAMS).find((key) => TEAMS[key].people.includes(name));

describe('THE EMBRYOLOGISTS: each team appears only inside its own block', () => {
    it('staffs every Saturday of the year from the team whose block covers it', () => {
        const result = generated(EMBRYOLOGY);
        const shifts = shiftsOf(result.roster, 'Weekend Witnessing');
        expect(shifts).toHaveLength(52);

        for (const shift of shifts) {
            const expectedTeam = Object.keys(TEAMS).find((key) => (
                shift.dateKey >= TEAMS[key].from && shift.dateKey <= TEAMS[key].to
            ));
            for (const name of shift.assignees) {
                expect(teamOf(name), `${name} on ${shift.dateKey}`).toBe(expectedTeam);
            }
        }
        expect(result.unfilled).toEqual([]);
        expect(result.score.hardViolations).toBe(0);
    });

    it('never lets a team member appear in another team`s months', () => {
        const result = generated(EMBRYOLOGY);
        const monthsOf = {};
        for (const shift of shiftsOf(result.roster, 'Weekend Witnessing')) {
            for (const name of shift.assignees) {
                const team = teamOf(name);
                monthsOf[team] = monthsOf[team] || new Set();
                monthsOf[team].add(shift.dateKey.slice(0, 7));
            }
        }
        expect([...monthsOf.A].sort()).toEqual(['2027-01', '2027-02', '2027-03', '2027-04']);
        expect([...monthsOf.B].sort()).toEqual(['2027-05', '2027-06', '2027-07', '2027-08']);
        expect([...monthsOf.C].sort()).toEqual(['2027-09', '2027-10', '2027-11', '2027-12']);
    });

    it('shares the work evenly INSIDE each block — a window is a gate, not a schedule', () => {
        const result = generated(EMBRYOLOGY);
        const duties = Object.fromEntries(
            Object.entries(result.load).map(([name, entry]) => [name, entry.duties]),
        );
        // 52 Saturdays, two people per shift, three blocks: each pair splits its own
        // block's Saturdays, and the two members of a pair are within one of each
        // other because both are on every shift of their block.
        for (const team of Object.values(TEAMS)) {
            const [first, second] = team.people;
            expect(Math.abs(duties[first] - duties[second])).toBeLessThanOrEqual(1);
        }
        expect(Object.values(duties).reduce((sum, n) => sum + n, 0)).toBe(104);
    });

    it('is DETERMINISTIC over a twelve-month run', () => {
        expect(JSON.stringify(generateRosterV2(EMBRYOLOGY)))
            .toBe(JSON.stringify(generateRosterV2(EMBRYOLOGY)));
    });

    it('audits clean, and CATCHES a hand-edited shift that crosses a block', () => {
        const result = generated(EMBRYOLOGY);
        expect(auditHardConstraints(result.roster, EMBRYOLOGY).count).toBe(0);

        const crossed = {
            '2027-06-05': [{
                task: 'Weekend Witnessing',
                lead: 'Alice',
                staff: 'Lead: Alice',
                category: 'CORE',
                week: 23,
                assignees: ['Alice'],
            }],
        };
        const audit = auditHardConstraints(crossed, EMBRYOLOGY);
        expect(audit.count).toBe(1);
        expect(audit.violations[0].rule).toBe('cohortWindow');
        expect(audit.violations[0].detail).toBe(
            'Alice is outside their team A\'s block, which runs 2027-01-01 to 2027-04-30,'
            + ' but is on it on 2027-06-05',
        );
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// B3. COHORT WINDOWS — restricted to named tasks, and the reasons they produce
// ═════════════════════════════════════════════════════════════════════════════

describe('COHORT WINDOW: a window may name the tasks it admits', () => {
    const PLACEMENT = {
        startDate: FEB,
        weeks: 1,
        staff: [
            { name: 'Ada' },
            {
                name: 'Stu',
                windows: [{
                    from: FEB, to: '2027-02-28', tasks: ['Supervised Clinic'], label: 'placement',
                }],
            },
        ],
        tasks: [
            { name: 'Supervised Clinic', days: [1], coLeads: 1 },
            { name: 'Solo Reporting', days: [2], coLeads: 1 },
        ],
    };

    it('lets the student onto the named task and onto NOTHING else', () => {
        const result = generated(PLACEMENT);
        expect(shiftsOf(result.roster, 'Supervised Clinic')[0].assignees.sort()).toEqual(['Ada', 'Stu']);
        // The other task's co-lead cannot be Stu: their only window does not name it.
        // One person, two positions, so the co-lead slot is reported rather than
        // double-booking Ada.
        expect(shiftsOf(result.roster, 'Solo Reporting')[0].assignees).toEqual(['Ada']);
        expect(result.unfilled).toEqual([{
            date: '2027-02-02',
            task: 'Solo Reporting',
            role: 'coLead',
            reason: 'no available staff for Solo Reporting coLead on 2027-02-02'
                + ' (2 in pool, 1 outside their cohort window, 1 already on this task)'
                + ' — Stu has no cohort window covering Solo Reporting',
        }]);
    });

    it('is a UNION over the windows: two windows admit two different tasks', () => {
        const result = generated({
            ...PLACEMENT,
            staff: [
                { name: 'Ada' },
                {
                    name: 'Stu',
                    windows: [
                        { from: FEB, to: '2027-02-28', tasks: ['Supervised Clinic'], label: 'placement' },
                        { from: FEB, to: '2027-02-28', tasks: ['Solo Reporting'], label: 'sign-off week' },
                    ],
                },
            ],
        });
        expect(result.unfilled).toEqual([]);
        expect(shiftsOf(result.roster, 'Solo Reporting')[0].assignees.sort()).toEqual(['Ada', 'Stu']);
    });

    it('audits a task a window does not name, off the finished roster', () => {
        const audit = auditHardConstraints({
            '2027-02-02': [{
                task: 'Solo Reporting', lead: 'Stu', staff: 'Lead: Stu',
                category: 'CORE', week: 1, assignees: ['Stu'],
            }],
        }, PLACEMENT);
        expect(audit.count).toBe(1);
        expect(audit.violations[0].detail).toBe(
            'Stu has no cohort window covering Solo Reporting, but is on it on 2027-02-02',
        );
    });
});

describe('COHORT WINDOW: the unfilled reason NAMES the window', () => {
    it('names each blocked person`s block and the dates it runs', () => {
        // Two teams whose blocks leave a gap in the middle of the run: the Monday in
        // the gap cannot be staffed by anybody, and the reason says whose block is
        // shut and when it is open.
        const result = generated({
            startDate: FEB,
            weeks: 4,
            staff: [
                { name: 'Alice', windows: [{ from: FEB, to: '2027-02-14', label: "team A's block" }] },
                { name: 'Bea', windows: [{ from: '2027-02-22', to: '2027-03-31', label: "team B's block" }] },
            ],
            tasks: [{ name: 'Weekend Witnessing', days: [1], coLeads: 0 }],
        });
        expect(Object.keys(result.roster).sort()).toEqual(['2027-02-01', '2027-02-08', '2027-02-22']);
        expect(result.unfilled).toEqual([{
            date: '2027-02-15',
            task: 'Weekend Witnessing',
            role: 'lead',
            reason: 'no available staff for Weekend Witnessing lead on 2027-02-15'
                + ' (2 in pool, 2 outside their cohort window)'
                + ' — Alice is outside their team A\'s block, which runs 2027-02-01 to 2027-02-14;'
                + ' Bea is outside their team B\'s block, which runs 2027-02-22 to 2027-03-31',
        }]);
    });

    it('falls back to the plain noun when a window carries no label', () => {
        const result = generated({
            startDate: FEB,
            weeks: 1,
            staff: [
                { name: 'Ada' },
                { name: 'Bea', windows: [{ from: '2027-03-01' }] },
            ],
            tasks: [{ name: 'Clinic', days: [1], coLeads: 1 }],
        });
        expect(result.unfilled[0].reason).toContain(
            'Bea is outside their cohort window, which runs from 2027-03-01 onwards',
        );
    });

    it('counts the people it does not name, rather than printing a paragraph', () => {
        const result = generated({
            startDate: FEB,
            weeks: 1,
            staff: [
                { name: 'Ada', maxHoursPerDay: 4 },
                ...['Bea', 'Cara', 'Dan', 'Eve'].map((name) => ({
                    name,
                    windows: [{ from: '2027-03-01', to: '2027-03-31', label: "team B's block" }],
                })),
            ],
            tasks: [
                { name: 'Morning', days: [1], hours: 4, coLeads: 0 },
                { name: 'Afternoon', days: [1], hours: 4, coLeads: 0 },
            ],
        });
        // THREE segments in one sentence, in gate order: the tally, then the hours
        // detail, then the window detail — and the window detail names three people
        // and counts the fourth.
        expect(result.unfilled[0].reason).toBe(
            'no available staff for Afternoon lead on 2027-02-01'
            + ' (5 in pool, 4 outside their cohort window, 1 over their daily hours limit)'
            + ' — Ada would reach 8h on 2027-02-01, over their 4h daily limit (already on Morning 4h)'
            + ' — Bea is outside their team B\'s block, which runs 2027-03-01 to 2027-03-31;'
            + ' Cara is outside their team B\'s block, which runs 2027-03-01 to 2027-03-31;'
            + ' Dan is outside their team B\'s block, which runs 2027-03-01 to 2027-03-31;'
            + ' and 1 other outside their cohort window',
        );
    });

    it('names ALL of a person`s windows for the task when they have several', () => {
        const result = generated({
            startDate: FEB,
            weeks: 1,
            staff: [
                { name: 'Ada' },
                {
                    name: 'Bea',
                    windows: [
                        { from: '2027-03-01', to: '2027-03-31' },
                        { from: '2027-06-01', to: '2027-06-30' },
                    ],
                },
            ],
            tasks: [{ name: 'Clinic', days: [1], coLeads: 1 }],
        });
        expect(result.unfilled[0].reason).toContain(
            'Bea is outside all 2 of their cohort windows for Clinic'
            + ' (2027-03-01 to 2027-03-31, 2027-06-01 to 2027-06-30)',
        );
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// B4. COHORT WINDOWS — validation
// ═════════════════════════════════════════════════════════════════════════════

describe('COHORT WINDOW: validation', () => {
    const withWindows = (windows, tasks = [{ name: 'T' }]) => ({
        startDate: FEB, weeks: 1, staff: [{ name: 'Ada', windows }, { name: 'Ben' }], tasks,
    });

    it('refuses a windows field that is not an array', () => {
        expect(refusal(withWindows({ from: FEB }))).toBe(
            'Ada\'s windows must be an array of cohort windows, e.g.'
            + ' [{ from: \'2026-09-01\', to: \'2026-12-31\' }] — or left out so that they are'
            + ' eligible on every date.',
        );
    });

    it('refuses an EMPTY windows list rather than reading it as "always"', () => {
        expect(refusal(withWindows([]))).toBe(
            'Ada has windows: [], which would make them eligible for nothing at all.'
            + ' Leave windows out so that they are eligible on every date, or give at least one window.',
        );
    });

    it('refuses a window that is not an object', () => {
        expect(refusal(withWindows(['2027-02-01']))).toBe(
            'Ada\'s window 1 is not a window object — expected { from, to, tasks, label },'
            + ' e.g. { from: \'2026-09-01\', to: \'2026-12-31\', label: \'team B block\' }.',
        );
    });

    it('refuses a date that is not a real YYYY-MM-DD date, at either end', () => {
        expect(refusal(withWindows([{ from: 'soon' }]))).toBe(
            'Ada\'s window 1 has a from that is not a real YYYY-MM-DD date: "soon".',
        );
        expect(refusal(withWindows([{ to: '2027-02-30' }]))).toBe(
            'Ada\'s window 1 has a to that is not a real YYYY-MM-DD date: "2027-02-30".',
        );
    });

    it('refuses a window that ends before it starts', () => {
        expect(refusal(withWindows([{ from: '2027-03-01', to: '2027-02-01' }]))).toBe(
            'Ada\'s window 1 runs from 2027-03-01 to 2027-02-01, which ends before it starts.'
            + ' Swap the two dates.',
        );
        // A single-day window is legal: `from === to` is an inclusive range of one day.
        expect(validateRosterV2Config(withWindows([{ from: FEB, to: FEB }])).valid).toBe(true);
    });

    it('refuses a tasks list that is empty, or that names something that is not a name', () => {
        expect(refusal(withWindows([{ from: FEB, tasks: [] }]))).toBe(
            'Ada\'s window 1\'s tasks must be a non-empty array of task names'
            + ' — or left out so the window admits every task.',
        );
        expect(refusal(withWindows([{ from: FEB, tasks: [7] }]))).toBe(
            'Ada\'s window 1 names a task that is not a name: 7.',
        );
    });

    it('refuses a window naming a task that is not in the task list', () => {
        expect(refusal(withWindows([{ from: FEB, tasks: ['Nope'] }]))).toBe(
            'Ada\'s window 1 names the task Nope, which is not in the task list (the tasks are T).'
            + ' Check the spelling, or remove it from the window.',
        );
    });

    it('refuses a window with no bound of any kind, because it cancels the others', () => {
        expect(refusal(withWindows([{}]))).toBe(
            'Ada\'s window 1 has no from, no to and no tasks, so it admits every task on'
            + ' every date and cancels every other window Ada has. Give it a date range,'
            + ' a task list, or remove it.',
        );
    });

    it('refuses a label that is not a label', () => {
        expect(refusal(withWindows([{ from: FEB, label: 42 }]))).toBe(
            'Ada\'s window 1 has a label that is not a label — give it a name such as'
            + ' \'team B block\', or leave it out.',
        );
    });

    it('refuses a task no window reaches for the WHOLE run, and names the windows', () => {
        expect(refusal({
            startDate: FEB,
            weeks: 1,
            staff: [{ name: 'Ada', windows: [{ from: '2027-06-01', to: '2027-06-30', label: 'summer block' }] }],
            tasks: [{ name: 'Weekend Witnessing', days: [1] }],
        })).toBe(
            'Task Weekend Witnessing runs on 1 date between 2027-02-01 and 2027-02-07'
            + ' (2027-02-01 to 2027-02-01), and the one staff member whose cohort windows'
            + ' cover it is outside their window on every one of those dates'
            + ' (Ada: 2027-06-01 to 2027-06-30), so every one of its slots would be unfilled.'
            + ' Widen a window, move the run, or change the task\'s dates.',
        );
    });

    it('refuses a task NO window names at all, in its own words', () => {
        expect(refusal({
            startDate: FEB,
            weeks: 1,
            staff: [{ name: 'Ada', windows: [{ tasks: ['Other'] }] }],
            tasks: [{ name: 'Weekend Witnessing', days: [1] }, { name: 'Other', days: [2] }],
        })).toBe(
            'Task Weekend Witnessing runs on 1 date between 2027-02-01 and 2027-02-07,'
            + ' and no staff member has a cohort window that covers it at all, so every one'
            + ' of its slots would be unfilled on every date. Add Weekend Witnessing to'
            + ' somebody\'s window, or remove the task.',
        );
    });

    it('does NOT refuse when one person with no windows can still cover the task', () => {
        // Somebody who declares no windows is eligible always, so a task the cohorts
        // cannot reach is still staffable and is not refused.
        expect(validateRosterV2Config({
            startDate: FEB,
            weeks: 1,
            staff: [
                { name: 'Ada', windows: [{ from: '2027-06-01', to: '2027-06-30' }] },
                { name: 'Ben' },
            ],
            tasks: [{ name: 'Weekend Witnessing', days: [1] }],
        }).valid).toBe(true);
    });

    it('does not refuse a task that never runs in this horizon at all', () => {
        // A task with no occurrence has no slot to leave unfilled — that is the
        // horizon warning's business, not this refusal's.
        const config = {
            startDate: FEB,
            weeks: 1,
            staff: [{ name: 'Ada', windows: [{ from: '2027-06-01', to: '2027-06-30' }] }],
            tasks: [{ name: 'Monthly Audit', recurrence: { ordinal: 3, weekday: 3 } }],
        };
        expect(validateRosterV2Config(config).valid).toBe(true);
        expect(warningsAbout(generated(config), 'will never appear')).toHaveLength(1);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// C. BOTH, COMPOSING WITH THE REST OF THE ENGINE
// ═════════════════════════════════════════════════════════════════════════════

describe('COMPOSITION: quotas and windows against hours, bands and continuity', () => {
    /**
     * One configuration exercising every feature at once: a band-gated clinic with
     * continuity of care, an 8-hour Saturday witnessing session gated on a skill and
     * carrying a monthly floor, a part-timer on a secondment window, and the hours
     * model switched on by a contracted week.
     */
    const EVERYTHING = {
        startDate: FEB,
        weeks: 4,
        staff: [
            { name: 'Ada', grade: 'AH15', skills: ['Witnessing'], weeklyHours: 42 },
            { name: 'Ben', grade: 'AH9', skills: ['Witnessing'] },
            {
                name: 'Cara', grade: 'AH12', skills: ['Witnessing'], fte: 0.6,
                windows: [{ from: '2027-02-15', to: '2027-03-31', label: 'secondment' }],
            },
        ],
        tasks: [
            {
                name: 'Clinic', days: [3], coLeads: 0, hours: 4,
                leadBands: ['senior', 'principal'], continuity: true,
            },
            {
                name: 'Sat Witnessing', days: [6], coLeads: 0, hours: 8,
                requiresSkill: 'Witnessing', quota: { per: 'month', min: 1 },
            },
        ],
    };

    it('generates, breaks no hard constraint, and re-audits clean', () => {
        const result = generated(EVERYTHING);
        expect(result.score.hardViolations).toBe(0);
        expect(auditHardConstraints(result.roster, EVERYTHING).count).toBe(0);
        expect(result.unfilled).toEqual([]);
    });

    it('keeps the band gate, the skill gate and the hours caps in force', () => {
        const result = generated(EVERYTHING);
        // Cara's 0.6 FTE day holds 5.04h, so the 8h Saturday can never be hers — and
        // the engine says so once, by name, rather than leaving it to be noticed.
        expect(warningsAbout(result, 'longer than the daily hours limit')).toEqual([
            'Task Sat Witnessing takes 8h, which is longer than the daily hours limit of'
            + ' 1 staff member (Cara (5.04h)), so they can never be rostered on it.',
        ]);
        for (const shift of shiftsOf(result.roster, 'Sat Witnessing')) {
            expect(shift.assignees).not.toContain('Cara');
        }
        // Ben is a junior, so he can never lead the band-gated clinic.
        for (const shift of shiftsOf(result.roster, 'Clinic')) {
            expect(shift.lead).not.toBe('Ben');
        }
    });

    it('excludes the hours-blocked part-timer from the FLOOR rather than reporting her short', () => {
        const result = generated(EVERYTHING);
        expect(warningsAbout(result, 'does not apply')).toEqual([
            'Task Sat Witnessing\'s quota counts Sat Witnessing, which 1 staff member can'
            + ' never be rostered on (Cara) — the skill, the band, the length of a session'
            + ' against their day, or their cohort windows rule them out — so the quota'
            + ' does not apply to them.',
        ]);
        expect(warningsAbout(result, 'Quota floor not met')).toEqual([]);
        // And the two people it does apply to each clear the floor of one. Ben takes
        // three of the four because Ada is also carrying the weekly clinic: once a
        // floor is MET, ordinary FTE-weighted fairness has the rest of the say.
        expect(perPersonPerMonth(result.roster, 'Sat Witnessing')['2027-02']).toEqual({ Ada: 1, Ben: 3 });
    });

    it('still publishes the hours model`s load and score shapes', () => {
        const result = generated(EVERYTHING);
        expect(result.load.Cara.weeklyCap).toBe(25.2);
        expect(Object.keys(result.load.Ada).sort())
            .toEqual(['duties', 'fte', 'hours', 'hoursPerWeek', 'share', 'weeklyCap', 'weighted']);
        expect(Object.keys(result.score.breakdown).sort()).toEqual([
            'continuityBreaks', 'hoursImbalance', 'isolatedDays',
            'loadImbalance', 'taskRepetition', 'weekendImbalance',
        ]);
    });

    it('is DETERMINISTIC with every feature at once', () => {
        expect(JSON.stringify(generateRosterV2(EVERYTHING)))
            .toBe(JSON.stringify(generateRosterV2(EVERYTHING)));
    });
});

describe('COMPOSITION: a FLOOR outranks CONTINUITY, and the roster says so', () => {
    const CLASH = {
        startDate: FEB,
        weeks: 4,
        staff: [{ name: 'Ada' }, { name: 'Ben' }],
        tasks: [{
            name: 'Clinic', days: [1], coLeads: 0,
            continuity: true, quota: { per: 'run', min: 2 },
        }],
    };

    it('warns that the two preferences pull opposite ways, before the roster is built', () => {
        const result = generated(CLASH);
        expect(warningsAbout(result, 'pull opposite ways')).toEqual([
            'Task Clinic asks for continuity of care AND is counted by a quota floor'
            + ' (Task Clinic\'s quota, at least 2 over the run). The two pull opposite ways'
            + ' — continuity keeps one lead, a floor spreads the work — and the FLOOR WINS:'
            + ' somebody short of their minimum takes the lead ahead of the incumbent, and'
            + ' every such change is counted as a continuity break.',
        ]);
    });

    it('gives each of them their two, and COUNTS every incumbency it broke to do it', () => {
        const result = generated(CLASH);
        expect(perPersonPerMonth(result.roster, 'Clinic')['2027-02']).toEqual({ Ada: 2, Ben: 2 });
        expect(result.score.breakdown.continuityBreaks).toBe(3);
        expect(warningsAbout(result, 'Quota floor not met')).toEqual([]);
    });

    it('says the FLOOR took the slot, and never claims a tie-break that did not happen', () => {
        const result = generated(CLASH);
        const breaks = warningsAbout(result, 'Continuity break');
        // The first hand-over: Ada holds one, Ben holds none, so Ben is further behind
        // and the floor is the honest reason. Saying "somebody who had already led this
        // task at least as often" here would be measurably false — Ben had led none.
        expect(breaks[0]).toBe(
            'Continuity break: Clinic was led by Ada on 2027-02-01 but by Ben on 2027-02-08'
            + ' — no constraint stopped Ada that day; the slot went to somebody further'
            + ' behind their quota floor, which outranks continuity.',
        );
        // The second: both hold one, so the floors tie and the ordinary continuity
        // tie-break decides. The sentence changes with the fact.
        expect(breaks[1]).toBe(
            'Continuity break: Clinic was led by Ben on 2027-02-08 but by Ada on 2027-02-15'
            + ' — no constraint stopped Ben that day; the slot went to somebody who had'
            + ' already led this task at least as often.',
        );
    });

    it('leaves continuity alone when the quota is a CEILING rather than a floor', () => {
        // A ceiling does not compete with continuity: it only ever stops somebody.
        const result = generated({
            ...CLASH,
            tasks: [{
                name: 'Clinic', days: [1], coLeads: 0,
                continuity: true, quota: { per: 'run', max: 3 },
            }],
        });
        expect(warningsAbout(result, 'pull opposite ways')).toEqual([]);
        // Ada leads three and then hits her ceiling, so the fourth goes to Ben: one
        // break, caused by the ceiling and reported as such.
        expect(perPersonPerMonth(result.roster, 'Clinic')['2027-02']).toEqual({ Ada: 3, Ben: 1 });
        expect(warningsAbout(result, 'Continuity break')).toEqual([
            'Continuity break: Clinic was led by Ada on 2027-02-15 but by Ben on 2027-02-22'
            + ' — Ada was already at their quota ceiling for that period.',
        ]);
    });
});

describe('COMPOSITION: a cohort window against a multi-slot team shift', () => {
    const TRIO = {
        startDate: FEB,
        weeks: 2,
        staff: [
            { name: 'Pat', grade: 'AH16' },
            { name: 'Sam', grade: 'AH13' },
            // Jun was AH8, chosen when `junior` meant AH7–AH12. AH7–AH10 is
            // `nonExempt` since the four-band split, so the trio's `{ band: 'junior' }`
            // slot needs a junior AHP — which is what this locum is. Every assertion
            // below, the "(1 in band, 1 outside their cohort window)" reason included,
            // is unchanged.
            { name: 'Jun', grade: 'AH12', windows: [{ from: '2027-02-08', label: 'locum block' }] },
        ],
        tasks: [{
            name: 'Weekend Witnessing',
            days: [6],
            slots: [{ band: 'principal' }, { band: 'senior' }, { band: 'junior' }],
        }],
    };

    it('leaves the junior slot unfilled before the locum starts, and fills it after', () => {
        const result = generated(TRIO);
        expect(result.unfilled).toEqual([{
            date: '2027-02-06',
            task: 'Weekend Witnessing',
            role: 'junior slot',
            reason: 'no available Junior-band staff for Weekend Witnessing junior slot on'
                + ' 2027-02-06 (1 in band, 1 outside their cohort window)'
                + ' — Jun is outside their locum block, which runs from 2027-02-08 onwards',
        }]);
        expect(shiftsOf(result.roster, 'Weekend Witnessing').map((shift) => shift.assignees)).toEqual([
            ['Pat', 'Sam'],
            ['Pat', 'Sam', 'Jun'],
        ]);
        expect(result.score.hardViolations).toBe(0);
    });

    it('keeps the lead the highest grade present on both shifts', () => {
        const result = generated(TRIO);
        for (const shift of shiftsOf(result.roster, 'Weekend Witnessing')) {
            expect(shift.lead).toBe('Pat');
        }
    });
});

describe('ADDITIVITY: a configuration that mentions neither is untouched', () => {
    const PLAIN = {
        startDate: FEB,
        weeks: 3,
        staff: [{ name: 'Ada', grade: 'AH15' }, { name: 'Ben', grade: 'AH9' }],
        tasks: [
            { name: 'Clinic', days: [1, 3], leadBands: ['principal'] },
            { name: 'Review', days: [5], coLeads: 0 },
        ],
    };

    it('resolves no quotas, compiles no window requirement, and warns about neither', () => {
        expect(resolveQuotas(PLAIN)).toEqual([]);
        const result = generated(PLAIN);
        for (const word of ['quota', 'cohort window']) {
            expect(warningsAbout(result, word)).toEqual([]);
        }
        for (const entry of result.unfilled) {
            expect(entry.reason).not.toContain('quota');
            expect(entry.reason).not.toContain('cohort window');
        }
    });

    it('produces the SAME roster whether or not another task carries a quota', () => {
        // The quota is on a task that does not run in this horizon, so it changes
        // nothing at all — which is the sharpest form of "inert unless it bites".
        const withIdleQuota = {
            ...PLAIN,
            tasks: [
                ...PLAIN.tasks,
                { name: 'Annual Audit', temporal: { clauses: [{ kind: 'dates', dates: ['2027-12-01'] }] }, quota: { min: 1 } },
            ],
        };
        expect(generated(withIdleQuota).roster).toEqual(generated(PLAIN).roster);
    });
});
