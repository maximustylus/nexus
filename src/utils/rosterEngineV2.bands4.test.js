/**
 * ==============================================================================
 * AURA ROSTER ENGINE V2 — THE FOUR-BAND SPLIT, SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest
 * Run:    npx vitest run src/utils
 *
 * WHY THIS FILE EXISTS.
 *
 * `ALLIED_HEALTH_SCALE.regions` shipped with three regions:
 *
 *     junior [7, 12] · senior [13, 14] · principal [15, 17]
 *
 * and now has four:
 *
 *     nonExempt [7, 10] · junior [11, 12] · senior [13, 14] · principal [15, 17]
 *
 * That was a CORRECTNESS FIX, not a relabelling, and it came from the department's
 * own roster owner: "AH7 to AH10 are non-exempt staff like associates, assistants,
 * technologists. AH11, AH12 are junior AHP." Under the old cut `junior` spanned two
 * different categories of staff, so a task gated to "junior may lead" let an AH8
 * assistant take clinical responsibility for it. No test could have caught that —
 * every test agreed with the boundary, because every test was written against it.
 *
 * The suite this file joins was therefore the WRONG shape of evidence: it pinned
 * the boundary as fact, and fixing the boundary broke a hundred of its assertions.
 * Repairing those assertions restores the suite; it does not stop the same class of
 * error coming back. THIS file is the part that does. It asserts the defect
 * directly — an AH8 may not lead a junior-gated duty — so that anybody widening
 * `junior` back down the scale has to delete a test that says why they must not,
 * rather than merely watching a fixture's grade number drift.
 *
 * THE RULES BEING PINNED, in one place:
 *
 *   1. FOUR REGIONS, exhaustively: every grade AH7–AH17 in exactly one of them,
 *      asserted grade by grade rather than by property.
 *   2. THE DEFECT: a task gated to `['junior']` with only AH7–AH10 staff is
 *      REFUSED at configure time, and the refusal names the Junior band and the
 *      span AH11–AH12. One AH11 makes the same configuration generate.
 *   3. THE GATE IS ON THE LEAD ONLY, which is why this change does not remove
 *      assistants from the roster: a non-exempt colleague still co-leads, and still
 *      fills a `{ band: 'nonExempt' }` slot, on a duty they may not lead.
 *   4. `nonExempt` is a FIRST-CLASS band, not a leftover: it appears in
 *      `leadBands`, in `slots`, in the warnings, in the unfilled reasons and in the
 *      audit, in the same words as the other three.
 *   5. A CUSTOM four-band `rules.bands` validates and generates; a gap between
 *      `nonExempt` and `junior` is refused with arithmetic a roster master can
 *      read.
 *   6. THE EDITOR HAS THREE DIVIDERS. Their travel limits, their patches and the
 *      partition they imply all follow from the band list rather than from a
 *      hard-coded two.
 *
 * Every number and every quoted string below was obtained by RUNNING the engine and
 * recording the result — never derived by hand, and never copied from the
 * implementation.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
    generateRosterV2,
    validateRosterV2Config,
    auditHardConstraints,
    GRADE_SCALE,
    DEFAULT_GRADE_BANDS,
    bandOfGrade,
    validateGradeBands,
} from './rosterEngineV2';
import {
    BAND_NAMES,
    BAND_DIVIDERS,
    bandDividerLimits,
    bandRulerModel,
    moveBandDivider,
    bandsToInputs,
    describeBandRange,
} from './rosterWizard';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** 2026-09-07 is a MONDAY, so no start-date snap warning muddies the assertions. */
const MONDAY = '2026-09-07';
const WEDNESDAY = '2026-09-09';

const shifts = (roster) => Object.values(roster).flat();
const leadsOf = (roster) => shifts(roster).map((shift) => shift.lead);
const dutiesOf = (load) =>
    Object.fromEntries(Object.entries(load).map(([name, entry]) => [name, entry.duties]));

/**
 * THE FIXTURE THIS WHOLE FILE TURNS ON: a department whose only sub-senior staff
 * are non-exempt. Asha is an assistant, Bo a technologist at the bottom of the
 * scale, Caro an associate at the top of the non-exempt band, and Dev the
 * principal. NOBODY here is a junior AHP, which under the old cut was invisible.
 */
const nonExemptDept = () => [
    { name: 'Asha', grade: 'AH8' },
    { name: 'Bo', grade: 'AH7' },
    { name: 'Caro', grade: 'AH10' },
    { name: 'Dev', grade: 'AH15' },
];

const juniorGated = (staff) => ({
    startDate: MONDAY,
    weeks: 1,
    staff,
    tasks: [{ name: 'Ward Round', leadBands: ['junior'], leads: 1, coLeads: 1 }],
});

/**
 * The OLD boundary, expressed as a custom cut on the four-region scale: junior
 * reaches down to AH8, exactly as it did before the split. Used as the
 * counterfactual — the one thing that differs between a refusal and an AH8 leading.
 */
const OLD_CUT = { nonExempt: [7, 7], junior: [8, 12], senior: [13, 14], principal: [15, 17] };

// ═════════════════════════════════════════════════════════════════════════════
// 1. FOUR REGIONS, EVERY GRADE NAMED
// ═════════════════════════════════════════════════════════════════════════════

describe('bandOfGrade over the whole scale', () => {
    /**
     * The four regions written out, and then every one of the eleven grades checked
     * against them INDIVIDUALLY. A property test ("no grade is unbanded") passes
     * under any partition, including the wrong one — which is precisely how the old
     * cut survived. This table is the thing that would have failed.
     */
    it.each([
        ['AH7', 'nonExempt'],
        ['AH8', 'nonExempt'],
        ['AH9', 'nonExempt'],
        ['AH10', 'nonExempt'],
        ['AH11', 'junior'],
        ['AH12', 'junior'],
        ['AH13', 'senior'],
        ['AH14', 'senior'],
        ['AH15', 'principal'],
        ['AH16', 'principal'],
        ['AH17', 'principal'],
    ])('puts %s in the %s band', (grade, band) => {
        expect(bandOfGrade(grade)).toBe(band);
    });

    it('names the four boundaries as spans, lowest first', () => {
        expect(DEFAULT_GRADE_BANDS).toEqual({
            nonExempt: [7, 10],
            junior: [11, 12],
            senior: [13, 14],
            principal: [15, 17],
        });
        expect(Object.keys(DEFAULT_GRADE_BANDS)).toEqual(['nonExempt', 'junior', 'senior', 'principal']);
        expect(validateGradeBands(DEFAULT_GRADE_BANDS)).toEqual({ valid: true, reason: null });
    });

    it('cuts non-exempt from junior between AH10 and AH11, and nowhere else', () => {
        // The single fact the change is about, stated as a pair rather than as a
        // range: the last support grade and the first junior AHP.
        expect(bandOfGrade('AH10')).toBe('nonExempt');
        expect(bandOfGrade('AH11')).toBe('junior');
        // …and the other two boundaries did NOT move, which is the other half of the
        // claim. AH12/AH13 and AH14/AH15 are where they always were.
        expect([bandOfGrade('AH12'), bandOfGrade('AH13')]).toEqual(['junior', 'senior']);
        expect([bandOfGrade('AH14'), bandOfGrade('AH15')]).toEqual(['senior', 'principal']);
    });

    it('accounts for all eleven grades, four bands, no gap and no overlap', () => {
        const bands = GRADE_SCALE.map((grade) => bandOfGrade(grade));
        expect(bands).toHaveLength(11);
        expect(bands.filter((band) => band === null)).toEqual([]);
        expect(new Set(bands).size).toBe(4);
        // Every band is one contiguous run, so no grade is stranded between two
        // stretches of the same name.
        expect(bands).toEqual([
            'nonExempt', 'nonExempt', 'nonExempt', 'nonExempt',
            'junior', 'junior',
            'senior', 'senior',
            'principal', 'principal', 'principal',
        ]);
    });

    it('sizes the bands 4/2/2/3, which sums to the scale', () => {
        const size = ([min, max]) => max - min + 1;
        const sizes = Object.values(DEFAULT_GRADE_BANDS).map(size);
        expect(sizes).toEqual([4, 2, 2, 3]);
        expect(sizes.reduce((a, b) => a + b, 0)).toBe(GRADE_SCALE.length);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. THE DEFECT, ASSERTED DIRECTLY
// ═════════════════════════════════════════════════════════════════════════════

describe('an AH7–AH10 pool cannot lead a junior-gated task', () => {
    it('is REFUSED at configure time, naming the Junior band and its span', () => {
        const result = validateRosterV2Config(juniorGated(nonExemptDept()));
        expect(result).toEqual({
            valid: false,
            reason:
                'Task Ward Round may only be led by Junior-band staff (AH11–AH12), but nobody in the'
                + " staff pool holds a grade in that band. Check the grades, widen the task's leadBands,"
                + ' or move the band boundaries.',
        });
        // The span is the load-bearing part: AH11–AH12 is the sentence that tells a
        // roster master an AH8 is not a junior AHP. If `junior` ever widens back down
        // the scale, this is the assertion that says so.
        expect(result.reason).toContain('(AH11–AH12)');
        expect(result.reason).not.toContain('AH7');
    });

    it('is refused by generateRosterV2 on the same terms, and returns nothing else', () => {
        const run = generateRosterV2(juniorGated(nonExemptDept()));
        expect(run.ok).toBe(false);
        expect(run.reason).toBe(validateRosterV2Config(juniorGated(nonExemptDept())).reason);
        // A refusal is a refusal: no half-built roster, no empty `load` to mistake
        // for a clean run.
        expect(Object.keys(run).sort()).toEqual(['ok', 'reason']);
    });

    it('refuses each non-exempt grade in turn, so it is the BAND and not one typo', () => {
        for (const grade of ['AH7', 'AH8', 'AH9', 'AH10']) {
            const check = validateRosterV2Config(juniorGated([
                { name: 'Solo', grade },
                { name: 'Dev', grade: 'AH15' },
            ]));
            expect(check.valid, `${grade} was allowed to lead a junior-gated task`).toBe(false);
            expect(check.reason).toContain('Junior-band staff (AH11–AH12)');
        }
    });

    it('GENERATES once one AH11 is in the room — the same config, one person changed', () => {
        const fixed = juniorGated([...nonExemptDept(), { name: 'Esi', grade: 'AH11' }]);

        expect(validateRosterV2Config(fixed)).toEqual({ valid: true, reason: null });

        const run = generateRosterV2(fixed);
        expect(run.ok).toBe(true);
        expect(run.unfilled).toEqual([]);
        expect(run.warnings).toEqual([]);
        expect(run.score.hardViolations).toBe(0);
        expect(Object.keys(run.roster)).toHaveLength(5); // Mon–Fri
        // Esi is the only person who may lead it, and she leads all five days.
        expect(new Set(leadsOf(run.roster))).toEqual(new Set(['Esi']));
        expect(dutiesOf(run.load).Esi).toBe(5);
        expect(auditHardConstraints(run.roster, fixed)).toEqual({ ok: true, count: 0, violations: [] });
    });

    it('lets the very same AH8 lead it under the OLD boundary — the counterfactual', () => {
        // The identical configuration, identical staff, one thing different: junior
        // reaches down to AH8, as it did before the split. Asha and Caro lead ward
        // rounds. THIS is the behaviour the change removed, kept here so that the
        // refusal above is visibly about the boundary and not about the fixture.
        const old = { ...juniorGated(nonExemptDept()), rules: { bands: OLD_CUT } };
        expect(validateRosterV2Config(old)).toEqual({ valid: true, reason: null });

        const run = generateRosterV2(old);
        expect(run.ok).toBe(true);
        expect(run.unfilled).toEqual([]);
        expect(new Set(leadsOf(run.roster))).toEqual(new Set(['Asha', 'Caro']));
        expect(bandOfGrade('AH8', OLD_CUT)).toBe('junior');
        expect(bandOfGrade('AH8')).toBe('nonExempt');
    });

    it('catches a non-exempt lead that a swap or a hand edit introduced', () => {
        // The gate is enforced on the way in AND read back off the finished roster,
        // so a shift nobody generated is still judged.
        const config = juniorGated([...nonExemptDept(), { name: 'Esi', grade: 'AH11' }]);
        const audit = auditHardConstraints({
            [MONDAY]: [{
                task: 'Ward Round', lead: 'Asha', coLead: 'Esi',
                staff: 'Lead: Asha, Co: Esi', category: 'CORE', week: 1,
                assignees: ['Asha', 'Esi'],
            }],
        }, config);

        expect(audit.violations).toEqual([{
            rule: 'leadBand',
            date: MONDAY,
            task: 'Ward Round',
            detail: 'Asha (AH8) leads Ward Round, which only Junior-band staff may lead',
        }]);
        expect(audit.count).toBe(1);
    });

    it('reports a junior shortage in the Junior band`s own span, not the old one', () => {
        const run = generateRosterV2({
            startDate: MONDAY,
            weeks: 1,
            staff: [
                { name: 'Esi', grade: 'AH11', unavailable: [WEDNESDAY] },
                { name: 'Asha', grade: 'AH8' },
            ],
            tasks: [{ name: 'Ward Round', leadBands: ['junior'], leads: 1, coLeads: 0 }],
        });
        expect(run.unfilled).toEqual([{
            date: WEDNESDAY,
            task: 'Ward Round',
            role: 'lead',
            reason: 'no available Junior-band staff for Ward Round lead on 2026-09-09 (1 in band, 1 on leave)',
        }]);
        // Asha is free that Wednesday and is NOT quietly promoted into the gap.
        expect(dutiesOf(run.load).Asha).toBe(0);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. THE GATE IS ON THE LEAD ONLY — assistants stay on the roster
// ═════════════════════════════════════════════════════════════════════════════

describe('a non-exempt colleague still co-leads a junior-gated task', () => {
    /** One junior AHP to lead, three non-exempt colleagues to shadow her. */
    const shadowing = () => ({
        startDate: MONDAY,
        weeks: 2,
        staff: [
            { name: 'Esi', grade: 'AH11' },
            { name: 'Asha', grade: 'AH8' },
            { name: 'Bo', grade: 'AH7' },
            { name: 'Caro', grade: 'AH10' },
        ],
        tasks: [{ name: 'Ward Round', leadBands: ['junior'], leads: 1, coLeads: 1 }],
    });

    it('fills every co-lead seat with non-exempt staff, and leaves nothing unfilled', () => {
        // THE REASON THE FOUR-BAND SPLIT IS NOT "REMOVE ASSISTANTS FROM THE ROSTER".
        // The band gate is on the LEAD; the second seat is open to any grade. So an
        // assistant assists on a duty they may not lead, which is exactly the
        // distinction the old boundary erased by making them eligible for both.
        const run = generateRosterV2(shadowing());
        expect(run.ok).toBe(true);
        expect(run.unfilled).toEqual([]);
        expect(run.warnings).toEqual([]);
        expect(run.score.hardViolations).toBe(0);
        expect(shifts(run.roster)).toHaveLength(10); // Mon–Fri x 2 weeks

        expect(new Set(leadsOf(run.roster))).toEqual(new Set(['Esi']));
        expect(new Set(shifts(run.roster).map((shift) => shift.coLead)))
            .toEqual(new Set(['Asha', 'Bo', 'Caro']));
    });

    it('gives all three of them real duties, rotated by fairness', () => {
        const run = generateRosterV2(shadowing());
        expect(dutiesOf(run.load)).toEqual({ Esi: 10, Asha: 4, Bo: 3, Caro: 3 });
    });

    it('passes the read-back audit — a non-exempt CO-lead is not a violation', () => {
        const config = shadowing();
        const run = generateRosterV2(config);
        expect(auditHardConstraints(run.roster, config)).toEqual({ ok: true, count: 0, violations: [] });
    });

    it('seats a non-exempt slot beside a junior one on a multi-slot shift', () => {
        // The same distinction in the `slots` form: three named seats, one per band,
        // and the assistant holds the one written for them.
        const config = {
            startDate: MONDAY,
            weeks: 1,
            staff: [
                { name: 'Dev', grade: 'AH15' },
                { name: 'Esi', grade: 'AH11' },
                { name: 'Asha', grade: 'AH8' },
            ],
            tasks: [{
                name: 'Bench', days: [1],
                slots: [
                    { band: 'principal', role: 'Principal' },
                    { band: 'junior', role: 'Junior AHP' },
                    { band: 'nonExempt', role: 'Assistant' },
                ],
            }],
        };
        expect(validateRosterV2Config(config)).toEqual({ valid: true, reason: null });

        const run = generateRosterV2(config);
        expect(run.ok).toBe(true);
        expect(run.unfilled).toEqual([]);
        expect(run.roster[MONDAY]).toEqual([{
            task: 'Bench',
            lead: 'Dev',
            coLead: 'Esi',
            staff: 'Lead: Dev, Co: Esi',
            category: 'CORE',
            week: 1,
            assignees: ['Dev', 'Esi', 'Asha'],
        }]);
        // The lead is still the highest grade present, and the assistant is on the
        // shift without leading it.
        expect(auditHardConstraints(run.roster, config)).toEqual({ ok: true, count: 0, violations: [] });
    });
});

describe('nonExempt is a first-class band, not a leftover', () => {
    const stores = (staff) => ({
        startDate: MONDAY,
        weeks: 1,
        staff,
        tasks: [{ name: 'Stores', leadBands: ['nonExempt'], leads: 1, coLeads: 0 }],
    });

    it('may be named in leadBands, and gates the lead the same way', () => {
        const config = stores([{ name: 'Asha', grade: 'AH8' }, { name: 'Dev', grade: 'AH15' }]);
        expect(validateRosterV2Config(config)).toEqual({ valid: true, reason: null });

        const run = generateRosterV2(config);
        expect(new Set(leadsOf(run.roster))).toEqual(new Set(['Asha']));
        // The principal is not eligible for a duty reserved to support grades, which
        // is a rule a department can now express in the direction it could not before.
        expect(dutiesOf(run.load).Dev).toBe(0);
        expect(run.unfilled).toEqual([]);
    });

    it('refuses an empty nonExempt pool in the band`s own words', () => {
        // Measured, capitalisation included: the prose upper-cases the band key it is
        // TIDIED, and this pin is why it was visible: the sentence used to read
        // "NonExempt-band staff" — a camelCase variable name in prose a roster
        // master reads. `regionWordLabel` now turns a camel hump into a hyphenated
        // word, so the band reads "Non-exempt" the way the department writes it.
        // Derived, not a lookup, so a fifth band needs no edit. Still pinned so that
        // that into "Non-exempt" is a deliberate, visible prose change rather than an
        // accident nobody notices.
        expect(validateRosterV2Config(stores([{ name: 'Dev', grade: 'AH15' }])).reason).toBe(
            'Task Stores may only be led by Non-exempt-band staff (AH7–AH10), but nobody in the staff'
            + " pool holds a grade in that band. Check the grades, widen the task's leadBands, or move"
            + ' the band boundaries.',
        );
    });

    it('merges with junior into one span, and reports a real gap as two', () => {
        const gated = (leadBands) => validateRosterV2Config({
            startDate: MONDAY,
            weeks: 1,
            staff: [{ name: 'Dev', grade: 'AH15' }],
            tasks: [{ name: 'Stores', leadBands, leads: 1, coLeads: 0 }],
        }).reason;

        // nonExempt + junior IS the old `junior` span — it now takes two chips to say.
        expect(gated(['nonExempt', 'junior'])).toContain('Non-exempt/Junior-band staff (AH7–AH12)');
        // A deliberately non-contiguous selection is two spans, not a fake range.
        expect(gated(['nonExempt', 'senior'])).toContain('Non-exempt/Senior-band staff (AH7–AH10, AH13–AH14)');
    });

    it('accepts all fifteen non-empty subsets of the four bands', () => {
        // Four bands means fifteen subsets, not seven. Enumerated rather than sampled
        // so a band accidentally missing from the accepted set cannot hide.
        const staff = [
            { name: 'A', grade: 'AH8' }, { name: 'B', grade: 'AH11' },
            { name: 'C', grade: 'AH13' }, { name: 'D', grade: 'AH15' },
        ];
        const subsets = [];
        for (let mask = 1; mask < 2 ** BAND_NAMES.length; mask += 1) {
            subsets.push(BAND_NAMES.filter((_, index) => mask & (1 << index)));
        }
        expect(subsets).toHaveLength(15);
        for (const leadBands of subsets) {
            const check = validateRosterV2Config({
                startDate: MONDAY, weeks: 1, staff, tasks: [{ name: 'T', leadBands }],
            });
            expect(check, `leadBands ${JSON.stringify(leadBands)}`).toEqual({ valid: true, reason: null });
        }
    });

    it('names itself in a slot shortfall warning and in an unfilled slot reason', () => {
        const run = generateRosterV2({
            startDate: MONDAY,
            weeks: 1,
            staff: [{ name: 'Asha', grade: 'AH8' }, { name: 'Dev', grade: 'AH15' }],
            tasks: [{
                name: 'WW', days: [1],
                slots: [{ band: 'nonExempt' }, { band: 'nonExempt' }, { band: 'principal' }],
            }],
        });
        expect(run.warnings).toEqual([
            'Task WW needs 2 people from the Non-exempt band (AH7–AH10) per day (nonExempt slot 1,'
            + ' nonExempt slot 2), but only 1 person qualifies, so some of those slots cannot be filled'
            + ' on any day.',
        ]);
        expect(run.unfilled).toEqual([{
            date: MONDAY,
            task: 'WW',
            role: 'nonExempt slot 2',
            reason: 'no available Non-exempt-band staff for WW nonExempt slot 2 on 2026-09-07'
                + ' (1 in band, 1 already on this task)',
        }]);
    });

    it('counts four bands in the refusal that enumerates them', () => {
        const reason = validateRosterV2Config({
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Dev', grade: 'AH15' }],
            tasks: [{ name: 'T', leadBands: ['boss'] }],
        }).reason;
        expect(reason).toContain('use nonExempt, junior, senior, principal (lower case)');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. A CUSTOM FOUR-BAND CUT, AND THE GAPS IT CAN LEAVE
// ═════════════════════════════════════════════════════════════════════════════

describe('a custom four-band rules.bands', () => {
    /** Every boundary moved one grade down from the shipped cut. */
    const MOVED = { nonExempt: [7, 9], junior: [10, 12], senior: [13, 15], principal: [16, 17] };

    it('validates, and re-bands the whole scale accordingly', () => {
        expect(validateGradeBands(MOVED)).toEqual({ valid: true, reason: null });
        expect(GRADE_SCALE.map((grade) => bandOfGrade(grade, MOVED))).toEqual([
            'nonExempt', 'nonExempt', 'nonExempt',
            'junior', 'junior', 'junior',
            'senior', 'senior', 'senior',
            'principal', 'principal',
        ]);
        // AH10 is the grade that moved: non-exempt by default, junior under this cut.
        expect(bandOfGrade('AH10')).toBe('nonExempt');
        expect(bandOfGrade('AH10', MOVED)).toBe('junior');
    });

    it('generates against it, and the moved boundary decides who leads', () => {
        const config = {
            startDate: MONDAY,
            weeks: 1,
            staff: [
                { name: 'Asha', grade: 'AH9' },
                { name: 'Esi', grade: 'AH10' },
                { name: 'Sen', grade: 'AH15' },
                { name: 'Prin', grade: 'AH16' },
            ],
            tasks: [{ name: 'Junior Clinic', leadBands: ['junior'], leads: 1, coLeads: 1 }],
            rules: { bands: MOVED },
        };
        expect(validateRosterV2Config(config)).toEqual({ valid: true, reason: null });

        const run = generateRosterV2(config);
        expect(run.ok).toBe(true);
        expect(run.unfilled).toEqual([]);
        expect(run.score.hardViolations).toBe(0);
        // Esi at AH10 is a junior here and leads; the same AH10 under the shipped cut
        // could not, which is the point of `rules.bands` existing at all.
        expect(new Set(leadsOf(run.roster))).toEqual(new Set(['Esi']));
        expect(auditHardConstraints(run.roster, config)).toEqual({ ok: true, count: 0, violations: [] });
    });

    it('accepts a cut that squeezes three bands to one grade each', () => {
        expect(validateGradeBands({
            nonExempt: [7, 7], junior: [8, 8], senior: [9, 9], principal: [10, 17],
        })).toEqual({ valid: true, reason: null });
    });

    it.each([
        [
            'one grade',
            { nonExempt: [7, 9], junior: [11, 12], senior: [13, 14], principal: [15, 17] },
            'Grade bands leave AH10 in no band at all — nonExempt ends at AH9 and junior starts at AH11.',
        ],
        [
            'two grades',
            { nonExempt: [7, 8], junior: [11, 12], senior: [13, 14], principal: [15, 17] },
            'Grade bands leave AH9 and AH10 in no band at all — nonExempt ends at AH8 and junior starts at AH11.',
        ],
        [
            'a span of three',
            { nonExempt: [7, 7], junior: [11, 12], senior: [13, 14], principal: [15, 17] },
            'Grade bands leave AH8–AH10 in no band at all — nonExempt ends at AH7 and junior starts at AH11.',
        ],
    ])('refuses a %s gap between nonExempt and junior, with the arithmetic spelled out', (_label, bands, opening) => {
        const result = validateGradeBands(bands);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe(
            `${opening} Anybody on an unbanded grade would be silently unable to lead every`
            + ' band-restricted task, so the bands must be contiguous.',
        );
        // The gap is exactly the grades the sentence names, and `bandOfGrade` refuses
        // to guess for ANY grade while the cut is broken.
        expect(bandOfGrade('AH10', bands)).toBeNull();
        expect(bandOfGrade('AH16', bands)).toBeNull();
    });

    it('refuses an overlap between nonExempt and junior', () => {
        expect(validateGradeBands({
            nonExempt: [7, 11], junior: [11, 12], senior: [13, 14], principal: [15, 17],
        })).toEqual({
            valid: false,
            reason: 'Grade bands nonExempt (AH7–AH11) and junior (AH11–AH12) overlap'
                + ' — no grade may belong to two bands.',
        });
    });

    it('refuses a three-band cut, counting all four by name', () => {
        // The pre-split shape, handed to the post-split engine. It must not be
        // silently accepted with `nonExempt` defaulted in behind the caller's back.
        expect(validateGradeBands({ junior: [11, 12], senior: [13, 14], principal: [15, 17] })).toEqual({
            valid: false,
            reason: 'Grade bands are missing the nonExempt band — all four of nonExempt, junior, senior'
                + ' and principal must be given, so that every grade lands in exactly one.',
        });
        expect(validateGradeBands({ junior: [7, 12], senior: [13, 14], principal: [15, 17] }).valid).toBe(false);
    });

    it('carries the gap refusal verbatim out through generateRosterV2', () => {
        const bands = { nonExempt: [7, 9], junior: [11, 12], senior: [13, 14], principal: [15, 17] };
        const run = generateRosterV2({
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Dev', grade: 'AH15' }],
            tasks: [{ name: 'T', coLeads: 0 }],
            rules: { bands },
        });
        expect(run.ok).toBe(false);
        expect(run.reason).toBe(validateGradeBands(bands).reason);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. THREE DIVIDERS — the boundary editor follows the band list
// ═════════════════════════════════════════════════════════════════════════════

describe('the band ruler has three dividers', () => {
    const DEFAULT_INPUTS = bandsToInputs(DEFAULT_GRADE_BANDS);

    it('derives one divider per adjacent pair of bands, named on both sides', () => {
        expect(BAND_DIVIDERS).toHaveLength(BAND_NAMES.length - 1);
        expect(BAND_DIVIDERS).toHaveLength(3);
        expect([...BAND_DIVIDERS]).toEqual([
            { below: 'nonExempt', above: 'junior' },
            { below: 'junior', above: 'senior' },
            { below: 'senior', above: 'principal' },
        ]);
    });

    it('sits the three dividers at 10, 12 and 14 for the shipped cut', () => {
        const model = bandRulerModel(DEFAULT_INPUTS);
        expect(model.dividers).toEqual([10, 12, 14]);
        expect(model.segments).toEqual([
            { band: 'nonExempt', min: 7, max: 10 },
            { band: 'junior', min: 11, max: 12 },
            { band: 'senior', min: 13, max: 14 },
            { band: 'principal', min: 15, max: 17 },
        ]);
        expect(model.bands).toEqual(DEFAULT_GRADE_BANDS);
        expect(model.representsInputs).toBe(true);
        expect(validateGradeBands(model.bands)).toEqual({ valid: true, reason: null });
    });

    it('bounds each divider by its neighbours, so no band can be emptied', () => {
        const { dividers, limits } = bandRulerModel(DEFAULT_INPUTS);
        expect(limits).toEqual([
            { min: 7, max: 11 }, // floor of the scale … one below the junior/senior divider
            { min: 11, max: 13 }, // one above the divider below … one below the one above
            { min: 13, max: 16 }, // … and AH17 is always left to principal
        ]);
        expect(limits).toEqual(dividers.map((_, index) => bandDividerLimits(dividers, index)));
        // Squeezed to the bottom, the three lowest bands hold one grade each and are
        // still a partition — the only illegal state is an EMPTY band.
        const squeezed = bandRulerModel({
            nonExempt: { min: '7', max: '7' }, junior: { min: '8', max: '8' },
            senior: { min: '9', max: '9' }, principal: { min: '10', max: '17' },
        });
        expect(squeezed.dividers).toEqual([7, 8, 9]);
        expect(squeezed.limits).toEqual([{ min: 7, max: 7 }, { min: 8, max: 8 }, { min: 9, max: 16 }]);
        expect(validateGradeBands(squeezed.bands)).toEqual({ valid: true, reason: null });
    });

    it.each([
        ['the lowest divider down', 0, 8, [8, 12, 14], [['nonExempt', 'max', '8'], ['junior', 'min', '9']]],
        ['the lowest divider into its ceiling', 0, 12, [11, 12, 14], [['nonExempt', 'max', '11'], ['junior', 'min', '12']]],
        ['the lowest divider off the bottom', 0, 6, [7, 12, 14], [['nonExempt', 'max', '7'], ['junior', 'min', '8']]],
        ['the middle divider up', 1, 14, [10, 13, 14], [['junior', 'max', '13'], ['senior', 'min', '14']]],
        ['the middle divider down', 1, 10, [10, 11, 14], [['junior', 'max', '11'], ['senior', 'min', '12']]],
        ['the top divider up', 2, 16, [10, 12, 16], [['senior', 'max', '16'], ['principal', 'min', '17']]],
        ['the top divider past AH17', 2, 17, [10, 12, 16], [['senior', 'max', '16'], ['principal', 'min', '17']]],
    ])('moves %s, clamped, emitting both sides of the boundary', (_label, index, requested, dividers, patches) => {
        const moved = moveBandDivider(DEFAULT_INPUTS, index, requested);
        expect(moved.ok).toBe(true);
        expect(moved.dividers).toEqual(dividers);
        expect(moved.value).toBe(dividers[index]);
        // Both sides always travel together — emitting one is how a gap gets in.
        expect(moved.patches).toEqual(patches);
        const after = { ...DEFAULT_INPUTS };
        for (const [band, bound, value] of moved.patches) after[band] = { ...after[band], [bound]: value };
        expect(validateGradeBands(bandRulerModel(after).bands)).toEqual({ valid: true, reason: null });
    });

    it('refuses a fourth divider — there are exactly three to move', () => {
        const moved = moveBandDivider(DEFAULT_INPUTS, 3, 12);
        expect(moved.ok).toBe(false);
        expect(moved.value).toBeNull();
        expect(moved.patches).toEqual([]);
        expect(moved.dividers).toEqual([10, 12, 14]);
    });

    it('draws the nearest partition and says so when handed a pre-split three-band state', () => {
        // A saved wizard state from before the four-band split. The ruler cannot draw
        // a three-band scale, so it shows the shipped four-band cut and reports
        // `representsInputs: false` rather than silently adopting it — which is what
        // lets the component say the boundaries on screen are not the ones stored.
        const legacy = bandRulerModel({
            junior: { min: '7', max: '12' },
            senior: { min: '13', max: '14' },
            principal: { min: '15', max: '17' },
        });
        expect(legacy.representsInputs).toBe(false);
        expect(legacy.bands).toEqual(DEFAULT_GRADE_BANDS);
        expect(legacy.dividers).toEqual([10, 12, 14]);
    });

    it('shows the four bands as ranges beside a task`s chips', () => {
        expect(describeBandRange(['nonExempt'], DEFAULT_GRADE_BANDS)).toBe('AH7–AH10');
        expect(describeBandRange(['junior'], DEFAULT_GRADE_BANDS)).toBe('AH11–AH12');
        expect(describeBandRange(['senior'], DEFAULT_GRADE_BANDS)).toBe('AH13–AH14');
        expect(describeBandRange(['principal'], DEFAULT_GRADE_BANDS)).toBe('AH15–AH17');
        // Adjacent chips merge; a gap in the selection stays two spans.
        expect(describeBandRange(['nonExempt', 'junior'], DEFAULT_GRADE_BANDS)).toBe('AH7–AH12');
        expect(describeBandRange(['nonExempt', 'senior'], DEFAULT_GRADE_BANDS)).toBe('AH7–AH10, AH13–AH14');
        expect(describeBandRange([...BAND_NAMES], DEFAULT_GRADE_BANDS)).toBe('AH7–AH17');
    });
});
