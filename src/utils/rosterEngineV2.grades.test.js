/**
 * ==============================================================================
 * AURA ROSTER ENGINE V2 — JOB-GRADE BANDS, SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest
 * Run:    npm test
 *
 * WHY THIS IS A SIBLING FILE AND NOT A NEW `describe` IN `rosterEngineV2.test.js`.
 *
 * That file's 174 tests are the COMPATIBILITY GATE for this change: the claim
 * being made is that a configuration mentioning no `grade`, no `leadBands` and
 * no `rules.bands` behaves exactly as it did before. A gate is only worth
 * anything if it is untouched, and `git diff --stat` showing zero lines changed
 * in `rosterEngineV2.test.js` is a stronger statement than a diff a reviewer has
 * to read to confirm nothing was softened. The two files run in the same
 * command, so nothing is lost by splitting them.
 *
 * Everything below is a SPECIFICATION test: a failure is a bug in the engine.
 * Every number and every quoted reason string was obtained by running the
 * engine and recording the result, never derived by hand.
 *
 * THE RULES BEING PINNED, in one place:
 *
 *   1. Bands are ELIGIBILITY, not preference with a fallback. A task restricted
 *      to `['junior']` never gets a senior lead, even when the slot would
 *      otherwise go unfilled.
 *   2. The gate applies to the LEAD ONLY. Any grade may co-lead anything, which
 *      is what makes a senior-lead / junior-shadow pairing expressible.
 *   3. `requiresSkill` keeps its existing meaning (it gates both roles) and
 *      COMPOSES: a lead of a task carrying both must pass both.
 *   4. No grade recorded means the band cannot be verified, so that person
 *      fails every band gate and is fully eligible everywhere else.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import { buildShiftStaffLabel } from './auraEngine';
import {
    generateRosterV2,
    validateRosterV2Config,
    auditHardConstraints,
    GRADE_SCALE,
    DEFAULT_GRADE_BANDS,
    bandOfGrade,
    validateGradeBands,
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

const leadsOf = (roster, taskName) =>
    flatten(roster)
        .filter(({ shift }) => shift.task === taskName)
        .map(({ shift }) => shift.lead);

const coLeadsOf = (roster, taskName) =>
    flatten(roster)
        .filter(({ shift }) => shift.task === taskName)
        .flatMap(({ shift }) => shift.assignees.slice(1));

/**
 * 2026-09-07 is a MONDAY, so no start-date snap warning muddies the assertions,
 * and 2026-09-09 is the Wednesday of that first week — the day the leave in
 * these fixtures lands on.
 */
const MONDAY_START = '2026-09-07';
const WEDNESDAY = '2026-09-09';

/**
 * A graded department: one principal, two seniors, three juniors, and the
 * boundary grades of each band represented (AH11 and AH12 for junior, AH13 and
 * AH14 for senior, AH15 for principal).
 *
 * RE-GRADED WITH THE FOUR-BAND SPLIT. The juniors were AH9, AH7 and AH12, chosen
 * when `junior` meant AH7–AH12. AH7–AH10 is now `nonExempt` — assistants,
 * associates and technologists — so an AH7 or an AH9 is not a junior AHP and this
 * fixture's three "juniors" would no longer have been in the band the tests below
 * gate on. The INTENT is unchanged: three junior AHPs, both ends of their band
 * represented. `JUNIORS` is the same three names it always was.
 */
const gradedStaff = () => [
    { name: 'Ada', fte: 1.0, grade: 'AH15' }, // principal
    { name: 'Ben', fte: 1.0, grade: 'AH13' }, // senior, bottom of band
    { name: 'Cleo', fte: 1.0, grade: 'AH14' }, // senior, top of band
    { name: 'Dara', fte: 1.0, grade: 'AH11' }, // junior, bottom of band
    { name: 'Emil', fte: 1.0, grade: 'AH11' }, // junior
    { name: 'Fen', fte: 1.0, grade: 'AH12' }, // junior, top of band
];

const SENIORS = new Set(['Ada', 'Ben', 'Cleo']);
const JUNIORS = new Set(['Dara', 'Emil', 'Fen']);

/**
 * A moved boundary: senior starts at AH12 instead of AH13, so the same AH12 reads
 * junior under the shipped cut and senior under this one — which is what the tests
 * using it are about.
 *
 * REWRITTEN WITH THE FOUR-BAND SPLIT. It named three regions because the scale had
 * three; a custom cut must now name all four or `validateGradeBands` refuses it as
 * a non-partition. `junior` narrows to [11, 11] so AH12 can move up into senior;
 * `nonExempt` and `principal` keep the shipped spans.
 */
const CUSTOM_BANDS = { nonExempt: [7, 10], junior: [11, 11], senior: [12, 14], principal: [15, 17] };

// ═════════════════════════════════════════════════════════════════════════════
// 1. THE PURE EXPORTS — the vocabulary the coming UI will read
// ═════════════════════════════════════════════════════════════════════════════

describe('GRADE_SCALE and DEFAULT_GRADE_BANDS', () => {
    it('is the allied-health scale AH7–AH17, in order', () => {
        expect(GRADE_SCALE).toEqual([
            'AH7', 'AH8', 'AH9', 'AH10', 'AH11', 'AH12', 'AH13', 'AH14', 'AH15', 'AH16', 'AH17',
        ]);
        expect(GRADE_SCALE).toHaveLength(11);
    });

    it('is frozen, so a UI cannot reorder the department`s scale by accident', () => {
        expect(Object.isFrozen(GRADE_SCALE)).toBe(true);
        expect(Object.isFrozen(DEFAULT_GRADE_BANDS)).toBe(true);
        expect(Object.isFrozen(DEFAULT_GRADE_BANDS.junior)).toBe(true);
    });

    it('ships the documented default cut', () => {
        // CHANGED BY THE FOUR-BAND SPLIT. This pinned junior: [7, 12], which
        // conflated non-exempt support staff with junior AHPs and let an AH8
        // assistant lead a task gated to "junior may lead". The department's cut is
        // now nonExempt AH7–AH10 / junior AH11–AH12; senior and principal are
        // untouched.
        expect(DEFAULT_GRADE_BANDS).toEqual({
            nonExempt: [7, 10],
            junior: [11, 12],
            senior: [13, 14],
            principal: [15, 17],
        });
    });

    it('names its bands lowest first, so Object.keys is the band order', () => {
        // CHANGED BY THE FOUR-BAND SPLIT: four names, and `nonExempt` is now the
        // lowest — which is what makes it, and not `junior`, the band that has to
        // start at the bottom of the scale.
        expect(Object.keys(DEFAULT_GRADE_BANDS)).toEqual(['nonExempt', 'junior', 'senior', 'principal']);
    });

    it('puts every grade on the scale in exactly one band — no gap, no overlap', () => {
        // The property the validator exists to protect, asserted directly on the
        // shipped default rather than trusted.
        const counted = GRADE_SCALE.map((grade) => bandOfGrade(grade));
        expect(counted.filter((band) => band === null)).toEqual([]);
        // CHANGED BY THE FOUR-BAND SPLIT: every grade still lands in exactly one
        // band, but there are four of them to land in.
        expect(new Set(counted)).toEqual(new Set(['nonExempt', 'junior', 'senior', 'principal']));
    });
});

describe('bandOfGrade', () => {
    // CHANGED BY THE FOUR-BAND SPLIT: `AH7` was pinned as junior and is now
    // nonExempt, and the AH10/AH11 pair either side of the new boundary is added so
    // this table names every band edge the department actually has. (Every grade
    // AH7–AH17 is asserted exhaustively in `rosterEngineV2.bands4.test.js`.)
    it.each([
        ['AH7', 'nonExempt'],
        ['AH10', 'nonExempt'],
        ['AH11', 'junior'],
        ['AH12', 'junior'],
        ['AH13', 'senior'],
        ['AH14', 'senior'],
        ['AH15', 'principal'],
        ['AH17', 'principal'],
    ])('puts %s in the %s band under the default boundaries', (grade, band) => {
        expect(bandOfGrade(grade)).toBe(band);
    });

    it.each([
        ['lower case', 'ah16', 'principal'],
        ['mixed case', 'Ah13', 'senior'],
        // CHANGED BY THE FOUR-BAND SPLIT: AH9 and AH07 are nonExempt now, not
        // junior. The claim under test is the input SPELLING, which is unchanged.
        ['surrounding whitespace', '  AH9  ', 'nonExempt'],
        ['a padded number', 'AH07', 'nonExempt'],
    ])('accepts %s on input', (_label, grade, band) => {
        expect(bandOfGrade(grade)).toBe(band);
    });

    it.each([
        ['an absent grade', undefined],
        ['a null grade', null],
        ['an empty string', ''],
        ['a grade below the scale', 'AH6'],
        ['a grade above the scale', 'AH18'],
        ['a bare number', 13],
        ['a numeric string', '13'],
        ['the prefix alone', 'AH'],
        ['a job grade from the old JG framework', 'JG13'],
    ])('returns null for %s', (_label, grade) => {
        expect(bandOfGrade(grade)).toBeNull();
    });

    it('honours moved boundaries — an AH12 becomes senior', () => {
        expect(bandOfGrade('AH12')).toBe('junior');
        expect(bandOfGrade('AH12', CUSTOM_BANDS)).toBe('senior');
        expect(bandOfGrade('AH11', CUSTOM_BANDS)).toBe('junior');
    });

    it('returns null rather than guessing when the bands do not partition the scale', () => {
        // The loud half of the pair is `validateGradeBands`. This half must not
        // invent an answer that would look like a real band membership.
        // Fixture rewritten for four regions so the non-partition under test is
        // still a GAP (AH12 in no band) rather than a missing band name.
        expect(bandOfGrade('AH13', { nonExempt: [7, 10], junior: [11, 11], senior: [13, 14], principal: [15, 17] })).toBeNull();
        expect(bandOfGrade('AH13', {})).toBeNull();
        expect(bandOfGrade('AH13', 'wide')).toBeNull();
    });

    it('is pure — it mutates neither the grade nor the bands it was given', () => {
        // Fixture rewritten for four regions, so the call being measured for purity
        // is one that actually reaches the lookup rather than bouncing off an
        // invalid-bands guard.
        const bands = { nonExempt: [7, 10], junior: [11, 11], senior: [12, 14], principal: [15, 17] };
        const snapshot = JSON.stringify(bands);
        bandOfGrade('AH12', bands);
        expect(JSON.stringify(bands)).toBe(snapshot);
    });
});

describe('validateGradeBands', () => {
    it('accepts the shipped default', () => {
        expect(validateGradeBands(DEFAULT_GRADE_BANDS)).toEqual({ valid: true, reason: null });
    });

    it('accepts a moved boundary that still partitions the scale', () => {
        expect(validateGradeBands(CUSTOM_BANDS).valid).toBe(true);
        // Fixture rewritten for four regions. The claim is unchanged: bands squeezed
        // down to a single grade each still partition the scale and are accepted.
        expect(validateGradeBands({ nonExempt: [7, 7], junior: [8, 8], senior: [9, 9], principal: [10, 17] }).valid).toBe(true);
    });

    it('names the unbanded grades when a gap is left — the silent-ineligibility trap', () => {
        // Every fixture here rewritten for four regions, so that the FIRST fault the
        // validator meets is still the gap under test and not a missing `nonExempt`.
        // Each gap still falls between the same two grades it always did, so the four
        // expectations below are unchanged.
        const oneGrade = validateGradeBands({ nonExempt: [7, 10], junior: [11, 11], senior: [13, 14], principal: [15, 17] });
        expect(oneGrade.valid).toBe(false);
        expect(oneGrade.reason).toMatch(/leave AH12 in no band at all/);
        expect(oneGrade.reason).toMatch(/junior ends at AH11 and senior starts at AH13/);
        expect(oneGrade.reason).toMatch(/silently unable to lead/);

        expect(
            validateGradeBands({ nonExempt: [7, 10], junior: [13, 13], senior: [14, 14], principal: [15, 17] }).reason,
        ).toMatch(/leave AH11 and AH12 in no band at all/);

        expect(
            validateGradeBands({ nonExempt: [7, 9], junior: [13, 13], senior: [14, 14], principal: [15, 17] }).reason,
        ).toMatch(/leave AH10–AH12 in no band at all/);

        expect(
            validateGradeBands({ nonExempt: [7, 10], junior: [11, 12], senior: [13, 13], principal: [15, 17] }).reason,
        ).toMatch(/leave AH14 in no band at all/);
    });

    // Every fixture in this table gained `nonExempt` and had `junior` narrowed to
    // [11, 12], so that the fault each row is about is still the first one the
    // validator reaches. Only two EXPECTATIONS moved with the split, and both are
    // marked below.
    it.each([
        [
            'an overlap',
            { nonExempt: [7, 10], junior: [11, 12], senior: [12, 14], principal: [15, 17] },
            // CHANGED BY THE FOUR-BAND SPLIT: junior's span in the reason is AH11–AH12.
            /junior \(AH11–AH12\) and senior \(AH12–AH14\) overlap/,
        ],
        [
            'a top that is not AH17',
            { nonExempt: [7, 10], junior: [11, 12], senior: [13, 14], principal: [15, 16] },
            /principal must end at 17/,
        ],
        [
            'a bottom that is not AH7',
            // CHANGED BY THE FOUR-BAND SPLIT: the band that must start at the bottom
            // of the scale is `nonExempt` now, so the hole is opened there and the
            // refusal names it instead of `junior`.
            { nonExempt: [8, 10], junior: [11, 12], senior: [13, 14], principal: [15, 17] },
            /nonExempt must start at 7/,
        ],
        [
            'a band running backwards',
            { nonExempt: [7, 10], junior: [11, 12], senior: [14, 13], principal: [15, 17] },
            /senior runs from 14 down to 13/,
        ],
        [
            'a missing band',
            { nonExempt: [7, 10], junior: [11, 12], senior: [13, 17] },
            /missing the principal band/,
        ],
        [
            'an invented band',
            { nonExempt: [7, 10], junior: [11, 12], senior: [13, 14], principal: [15, 17], middle: [1, 2] },
            /unknown band "middle"/,
        ],
        [
            'a fractional bound',
            { nonExempt: [7, 10], junior: [11, 12], senior: [13, 14.5], principal: [15, 17] },
            /bound 14.5 — band bounds are whole grade numbers/,
        ],
        [
            'a bound off the scale',
            { nonExempt: [7, 10], junior: [11, 12], senior: [13, 20], principal: [15, 17] },
            /bound 20, which is outside the AH7–AH17 scale/,
        ],
        [
            'a bound that is not a range',
            { nonExempt: [7, 10], junior: [11, 12], senior: 13, principal: [15, 17] },
            /senior must be a two-number range/,
        ],
        [
            'a three-element range',
            { nonExempt: [7, 10], junior: [11, 12], senior: [13, 14, 15], principal: [15, 17] },
            /senior must be a two-number range/,
        ],
        ['a string', 'wide', /must be an object of the form/],
        ['null', null, /must be an object of the form/],
        ['an array', [[7, 10], [11, 12], [13, 14], [15, 17]], /must be an object of the form/],
    ])('rejects %s with a readable reason', (_label, bands, pattern) => {
        const result = validateGradeBands(bands);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(pattern);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. VALIDATION — grades, lead bands and band boundaries refuse loudly
// ═════════════════════════════════════════════════════════════════════════════

describe('validateRosterV2Config — grades', () => {
    const withGrade = (grade) => ({
        startDate: MONDAY_START,
        weeks: 1,
        staff: [{ name: 'Ann', grade }],
        tasks: [{ name: 'EFT' }],
    });

    it.each(GRADE_SCALE)('accepts the grade %s', (grade) => {
        expect(validateRosterV2Config(withGrade(grade))).toEqual({ valid: true, reason: null });
    });

    it.each([
        ['lower case', 'ah13'],
        ['mixed case', 'Ah13'],
        ['surrounding whitespace', ' AH13 '],
        ['a padded number', 'AH07'],
    ])('accepts %s', (_label, grade) => {
        expect(validateRosterV2Config(withGrade(grade)).valid).toBe(true);
    });

    it.each([
        ['below the scale', 'AH6'],
        ['above the scale', 'AH18'],
        ['the prefix alone', 'AH'],
        ['a bare number', 13],
        ['a numeric string', '13'],
        ['an old JG grade', 'JG13'],
        ['an array', ['AH13']],
    ])('refuses a grade %s rather than treating it as absent', (_label, grade) => {
        const result = validateRosterV2Config(withGrade(grade));
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/Ann's grade is/);
        expect(result.reason).toMatch(/AH7–AH17/);
    });

    it.each([
        ['undefined', undefined],
        ['null', null],
        ['an empty string', ''],
        ['a whitespace-only string', '   '],
    ])('treats %s as "not recorded", not as an error', (_label, grade) => {
        // The last case is what an untouched text field sends. A refusal there
        // would be aimed at nobody's mistake.
        expect(validateRosterV2Config(withGrade(grade)).valid).toBe(true);
    });

    it('treats a blank grade as UNGRADED all the way through, not as AH7', () => {
        const result = generateRosterV2({
            startDate: MONDAY_START,
            weeks: 1,
            staff: [{ name: 'Ada', grade: 'AH15' }, { name: 'Blank', grade: '  ' }],
            tasks: [{ name: 'Junior Clinic', leadBands: ['junior'], leads: 1, coLeads: 1 }],
        });
        // Nobody is in the junior band, so this is the loud configuration error.
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/nobody in the staff pool holds a grade in that band/);
    });

    it('refuses the malformed grade through generateRosterV2 too', () => {
        const result = generateRosterV2(withGrade('AH42'));
        expect(result.ok).toBe(false);
        expect(Object.keys(result).sort()).toEqual(['ok', 'reason']);
    });
});

describe('validateRosterV2Config — leadBands', () => {
    const withLeadBands = (leadBands) => ({
        startDate: MONDAY_START,
        weeks: 1,
        staff: gradedStaff(),
        tasks: [{ name: 'EFT', leadBands }],
    });

    it.each([
        [['junior']],
        [['senior']],
        [['principal']],
        [['junior', 'senior']],
        [['senior', 'principal']],
        [['junior', 'principal']],
        [['junior', 'senior', 'principal']],
    ])('accepts the subset %j', (leadBands) => {
        expect(validateRosterV2Config(withLeadBands(leadBands)).valid).toBe(true);
    });

    it.each([
        ['undefined', undefined],
        ['null', null],
    ])('treats %s as "any grade may lead"', (_label, leadBands) => {
        expect(validateRosterV2Config(withLeadBands(leadBands)).valid).toBe(true);
    });

    it('refuses an empty leadBands — no grade could satisfy it', () => {
        const result = validateRosterV2Config(withLeadBands([]));
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/leadBands: \[\], which no grade can satisfy/);
        expect(result.reason).toMatch(/Leave leadBands out/);
    });

    it.each([
        ['a bare string', 'senior'],
        ['a number', 3],
    ])('refuses leadBands given as %s', (_label, leadBands) => {
        const result = validateRosterV2Config(withLeadBands(leadBands));
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/leadBands must be an array of band names/);
    });

    it.each([
        ['an invented band', 'boss'],
        ['a capitalised band', 'Senior'],
        ['a grade instead of a band', 'AH13'],
        ['a number', 1],
    ])('refuses %s inside leadBands', (_label, band) => {
        const result = validateRosterV2Config(withLeadBands([band]));
        expect(result.valid).toBe(false);
        // CHANGED BY THE FOUR-BAND SPLIT: the refusal lists the bands that exist, and
        // there are four of them now. The list is built from the scale's own
        // `regionOrder`, so this is the new truth rather than a loosened match.
        expect(result.reason).toMatch(/which is not a band — use nonExempt, junior, senior, principal \(lower case\)/);
    });

    it('tolerates a repeated band name — a set, not a multiset', () => {
        expect(validateRosterV2Config(withLeadBands(['senior', 'senior'])).valid).toBe(true);
    });

    it('refuses a band-gated task nobody in the pool could ever lead — the config error, caught loudly', () => {
        // The band twin of "requires a skill nobody holds". Left as a warning it
        // would generate a roster whose every lead slot of this task is
        // unfilled, which is a typo discovered at 3am on a Tuesday.
        const result = validateRosterV2Config({
            startDate: MONDAY_START,
            weeks: 1,
            staff: [{ name: 'Dara', grade: 'AH9' }, { name: 'Emil', grade: 'AH7' }],
            tasks: [{ name: 'Governance', leadBands: ['principal'] }],
        });
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(
            /Task Governance may only be led by Principal-band staff \(AH15–AH17\), but nobody in the staff pool holds a grade in that band/,
        );
        expect(result.reason).toMatch(/Check the grades, widen the task's leadBands, or move the band boundaries/);
    });

    it('reports a two-band restriction as one span when the bands are adjacent', () => {
        const result = validateRosterV2Config({
            startDate: MONDAY_START,
            weeks: 1,
            staff: [{ name: 'Dara', grade: 'AH9' }],
            tasks: [{ name: 'Complex', leadBands: ['senior', 'principal'] }],
        });
        expect(result.reason).toMatch(/led by Senior\/Principal-band staff \(AH13–AH17\)/);
    });

    it('reports a deliberately non-contiguous restriction as two spans, not a fake range', () => {
        const result = validateRosterV2Config({
            startDate: MONDAY_START,
            weeks: 1,
            staff: [{ name: 'Ben', grade: 'AH13' }],
            tasks: [{ name: 'Odd', leadBands: ['junior', 'principal'] }],
        });
        // CHANGED BY THE FOUR-BAND SPLIT: the junior band is AH11–AH12, so the two
        // spans it reports are AH11–AH12 and AH15–AH17. The point of the test — that a
        // deliberately non-contiguous selection is reported as TWO spans rather than
        // flattened into one fake range — is untouched, and the gap is now three
        // grades wide instead of two.
        expect(result.reason).toMatch(/led by Junior\/Principal-band staff \(AH11–AH12, AH15–AH17\)/);
    });

    it('accepts the same task once somebody in the band exists', () => {
        expect(
            validateRosterV2Config({
                startDate: MONDAY_START,
                weeks: 1,
                staff: [{ name: 'Dara', grade: 'AH9' }, { name: 'Ada', grade: 'AH15' }],
                tasks: [{ name: 'Governance', leadBands: ['principal'] }],
            }).valid,
        ).toBe(true);
    });

    it('does not count an UNGRADED colleague towards the band pool', () => {
        // Absent is not zero, and it is not "probably in band" either.
        const result = validateRosterV2Config({
            startDate: MONDAY_START,
            weeks: 1,
            staff: [{ name: 'Nia' }, { name: 'Rob' }],
            tasks: [{ name: 'Governance', leadBands: ['principal'] }],
        });
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/nobody in the staff pool holds a grade in that band/);
    });
});

describe('validateRosterV2Config — rules.bands', () => {
    const withBands = (bands, staff = gradedStaff()) => ({
        startDate: MONDAY_START,
        weeks: 1,
        staff,
        tasks: [{ name: 'EFT' }],
        rules: { bands },
    });

    it('accepts omitted bands and applies the shipped default', () => {
        const config = withBands(undefined);
        delete config.rules.bands;
        expect(validateRosterV2Config(config).valid).toBe(true);
    });

    it('accepts an explicit copy of the default, and a moved boundary', () => {
        expect(validateRosterV2Config(withBands({ ...DEFAULT_GRADE_BANDS })).valid).toBe(true);
        expect(validateRosterV2Config(withBands(CUSTOM_BANDS)).valid).toBe(true);
    });

    it('surfaces the band reason verbatim through the config validator', () => {
        // Fixture rewritten for four regions so the reason being passed through is
        // still the GAP one (AH12 in no band) rather than a missing-band one.
        const bands = { nonExempt: [7, 10], junior: [11, 11], senior: [13, 14], principal: [15, 17] };
        const result = validateRosterV2Config(withBands(bands));
        expect(result.valid).toBe(false);
        expect(result.reason).toBe(validateGradeBands(bands).reason);
    });

    it('refuses through generateRosterV2 as well', () => {
        // Fixture rewritten for four regions so the fault reaching the engine is
        // still the overlap this test is named for.
        const result = generateRosterV2(withBands({ nonExempt: [7, 10], junior: [11, 12], senior: [12, 14], principal: [15, 17] }));
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/overlap/);
    });

    it('judges leadBands against the boundaries actually configured', () => {
        // Fen is AH12: junior by default, senior once the boundary moves. The
        // SAME task and the SAME staff list flip from a config error to a valid
        // roster on nothing but the band cut.
        const config = (bands) => ({
            startDate: MONDAY_START,
            weeks: 1,
            staff: [{ name: 'Fen', grade: 'AH12' }, { name: 'Gil', grade: 'AH8' }],
            tasks: [{ name: 'Senior Duty', leadBands: ['senior'], leads: 1, coLeads: 1 }],
            ...(bands ? { rules: { bands } } : {}),
        });

        expect(validateRosterV2Config(config(null)).valid).toBe(false);
        expect(validateRosterV2Config(config(null)).reason).toMatch(/Senior-band staff \(AH13–AH14\)/);
        expect(validateRosterV2Config(config(CUSTOM_BANDS)).valid).toBe(true);
    });

    it('leaves the existing rules checks intact alongside bands', () => {
        expect(
            generateRosterV2({
                startDate: MONDAY_START,
                weeks: 1,
                staff: gradedStaff(),
                tasks: [{ name: 'EFT' }],
                rules: { bands: CUSTOM_BANDS, maxConcurrentPerDay: 0 },
            }).ok,
        ).toBe(false);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. THE BAND GATE ON THE LEAD
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — the band gate applies to the lead', () => {
    const config = (overrides = {}) => ({
        startDate: MONDAY_START,
        weeks: 2,
        staff: gradedStaff(),
        tasks: [{ name: 'Complex Clinic', leadBands: ['senior', 'principal'], leads: 1, coLeads: 1 }],
        ...overrides,
    });

    it('only ever gives a Senior/Principal task an AH13+ lead', () => {
        const { roster } = generateRosterV2(config());
        const leads = leadsOf(roster, 'Complex Clinic');

        expect(leads).toHaveLength(10); // Mon–Fri x 2 weeks
        for (const lead of leads) {
            expect(SENIORS.has(lead), `${lead} led a Senior/Principal task`).toBe(true);
        }
        expect(new Set(leads)).toEqual(new Set(['Ada', 'Ben', 'Cleo']));
    });

    it('still lets juniors co-lead it — the senior-lead / junior-shadow pairing', () => {
        const { roster } = generateRosterV2(config());
        const coLeads = coLeadsOf(roster, 'Complex Clinic');

        expect(coLeads.length).toBeGreaterThan(0);
        // Every junior appears as a shadow, which is the point of gating one
        // role rather than the whole task.
        for (const junior of JUNIORS) expect(coLeads).toContain(junior);
    });

    it('fills every slot and breaks no hard constraint doing it', () => {
        const result = generateRosterV2(config());
        expect(result.unfilled).toEqual([]);
        expect(result.score.hardViolations).toBe(0);
        expect(result.warnings).toEqual([]);
    });

    it('rotates the lead within the band rather than parking it on one person', () => {
        const { load } = generateRosterV2(config());
        const seniorDuties = [load.Ada.duties, load.Ben.duties, load.Cleo.duties];
        expect(Math.max(...seniorDuties) - Math.min(...seniorDuties)).toBeLessThanOrEqual(2);
    });

    it('leaves an ungated task open to every grade', () => {
        const { roster } = generateRosterV2(
            config({ tasks: [{ name: 'Open Clinic', leads: 1, coLeads: 1 }] }),
        );
        const leads = new Set(leadsOf(roster, 'Open Clinic'));
        expect([...leads].some((name) => JUNIORS.has(name))).toBe(true);
    });

    it('changes nothing at all when grades are recorded but no task is gated', () => {
        // The additive claim, in one assertion: recording grades is not a
        // rostering decision. Same config, once with grades and once without.
        const tasks = [{ name: 'A', leads: 1, coLeads: 1 }, { name: 'B', leads: 1, coLeads: 0 }];
        const graded = generateRosterV2({ startDate: MONDAY_START, weeks: 4, staff: gradedStaff(), tasks });
        const ungraded = generateRosterV2({
            startDate: MONDAY_START,
            weeks: 4,
            staff: gradedStaff().map(({ grade, ...rest }) => rest),
            tasks,
        });
        expect(JSON.stringify(graded)).toBe(JSON.stringify(ungraded));
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. ELIGIBILITY, NOT EXCLUSION-WITH-FALLBACK
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — a band gate is never overridden to fill a slot', () => {
    // Dara and Emil were AH9 and AH7 — non-exempt grades since the four-band split,
    // so neither would be in the junior band this task gates on. RE-GRADED to the
    // two junior-AHP grades; every assertion below, the "(2 in band, 2 on leave)"
    // reason included, is unchanged.
    const juniorOnly = () => ({
        startDate: MONDAY_START,
        weeks: 1,
        staff: [
            { name: 'Ada', grade: 'AH15' },
            { name: 'Dara', grade: 'AH11', unavailable: [WEDNESDAY] },
            { name: 'Emil', grade: 'AH12', unavailable: [WEDNESDAY] },
        ],
        tasks: [{ name: 'Junior Clinic', leadBands: ['junior'], leads: 1, coLeads: 0 }],
    });

    it('reports the slot unfilled rather than drafting the free senior', () => {
        const result = generateRosterV2(juniorOnly());

        expect(result.roster[WEDNESDAY]).toBeUndefined();
        expect(result.unfilled).toHaveLength(1);
        expect(result.unfilled[0]).toEqual({
            date: WEDNESDAY,
            task: 'Junior Clinic',
            role: 'lead',
            reason: 'no available Junior-band staff for Junior Clinic lead on 2026-09-09 (2 in band, 2 on leave)',
        });
    });

    it('leaves the out-of-band senior with nothing — the roster master`s policy stands', () => {
        const { load } = generateRosterV2(juniorOnly());
        expect(load.Ada.duties).toBe(0);
        expect(load.Dara.duties).toBe(2);
        expect(load.Emil.duties).toBe(2);
    });

    it('still rosters the rest of the week around the gap', () => {
        const { roster } = generateRosterV2(juniorOnly());
        expect(Object.keys(roster).sort()).toEqual([
            '2026-09-07', '2026-09-08', '2026-09-10', '2026-09-11',
        ]);
    });

    it('records the refusal as an unfilled slot, not as a hard violation', () => {
        const result = generateRosterV2(juniorOnly());
        expect(result.score.hardViolations).toBe(0);
    });
});

describe('generateRosterV2 — spillover is a choice, spelled out in leadBands', () => {
    // Dara was AH9 — non-exempt since the four-band split, which made her ineligible
    // to lead anything gated to `['junior']` and left every test in this block
    // passing for the wrong reason (Ben covered the whole week). RE-GRADED to AH11,
    // a junior AHP, which is what "the junior" in these tests always meant.
    const shared = (leadBands) => ({
        startDate: MONDAY_START,
        weeks: 1,
        staff: [
            { name: 'Dara', grade: 'AH11', unavailable: [WEDNESDAY] },
            { name: 'Ben', grade: 'AH13' },
        ],
        tasks: [{ name: 'Shared', leadBands, leads: 1, coLeads: 0 }],
    });

    it('lets the senior lead once the junior is exhausted, when both bands are listed', () => {
        const result = generateRosterV2(shared(['junior', 'senior']));
        expect(result.unfilled).toEqual([]);
        expect(result.roster[WEDNESDAY][0].lead).toBe('Ben');
    });

    it('leaves the same day unfilled when only junior is listed', () => {
        const result = generateRosterV2(shared(['junior']));
        expect(result.roster[WEDNESDAY]).toBeUndefined();
        expect(result.unfilled).toHaveLength(1);
        expect(result.unfilled[0].reason).toMatch(
            /no available Junior-band staff for Shared lead on 2026-09-09 \(1 in band, 1 on leave\)/,
        );
        // Ben, the free senior, is not quietly promoted into the gap.
        expect(generateRosterV2(shared(['junior'])).load.Ben.duties).toBe(0);
    });

    it('treats leadBands as a SET, not a preference order', () => {
        // Worth pinning because it is the likeliest surprise: `['junior',
        // 'senior']` does not mean "prefer a junior and fall back to a senior".
        // Both bands are equally eligible and normal FTE fairness decides, so
        // the senior leads on days the junior is perfectly free.
        const { roster } = generateRosterV2(shared(['junior', 'senior']));
        expect(roster['2026-09-07'][0].lead).toBe('Ben');
        expect(roster['2026-09-08'][0].lead).toBe('Dara');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. SKILL AND BAND COMPOSE
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — requiresSkill and leadBands compose', () => {
    const paedCpet = (overrides = {}) => ({
        startDate: MONDAY_START,
        weeks: 1,
        staff: [
            { name: 'Ada', grade: 'AH15', skills: ['CPET'] }, // skill AND band
            { name: 'Ben', grade: 'AH13', skills: [] }, // band, no skill
            { name: 'Dara', grade: 'AH9', skills: ['CPET'] }, // skill, no band
        ],
        tasks: [{
            name: 'Paed CPET',
            requiresSkill: 'CPET',
            leadBands: ['principal'],
            leads: 1,
            coLeads: 1,
        }],
        ...overrides,
    });

    it('gives the lead only to somebody who passes BOTH gates', () => {
        const { roster } = generateRosterV2(paedCpet());
        expect(new Set(leadsOf(roster, 'Paed CPET'))).toEqual(new Set(['Ada']));
    });

    it('lets a co-lead who holds the skill but not the band take the second seat', () => {
        const { roster } = generateRosterV2(paedCpet());
        expect(new Set(coLeadsOf(roster, 'Paed CPET'))).toEqual(new Set(['Dara']));
    });

    it('keeps requiresSkill gating BOTH roles — the in-band colleague without the skill never appears', () => {
        const result = generateRosterV2(paedCpet());
        const everyone = flatten(result.roster).flatMap(({ shift }) => peopleOn(shift));
        expect(everyone).not.toContain('Ben');
        expect(result.load.Ben.duties).toBe(0);
        expect(result.unfilled).toEqual([]);
    });

    it('names both constraints in the unfilled reason when both bind', () => {
        const result = generateRosterV2(paedCpet({
            staff: [
                { name: 'Ada', grade: 'AH15', skills: ['CPET'], unavailable: [WEDNESDAY] },
                { name: 'Ben', grade: 'AH13', skills: [] },
                { name: 'Dara', grade: 'AH9', skills: ['CPET'] },
            ],
        }));

        const lead = result.unfilled.find((entry) => entry.date === WEDNESDAY && entry.role === 'lead');
        expect(lead.reason).toBe(
            'no available staff hold skill CPET and sit in the Principal band for Paed CPET lead on 2026-09-09 (2 qualified, 1 in band, 1 on leave)',
        );
    });

    it('never mentions a band in a CO-LEAD reason — that slot is not band-gated', () => {
        const result = generateRosterV2({
            startDate: MONDAY_START,
            weeks: 1,
            staff: [
                { name: 'Ada', grade: 'AH15' },
                { name: 'Bo', grade: 'AH9', unavailable: [WEDNESDAY] },
            ],
            tasks: [{ name: 'Governance', leadBands: ['principal'], leads: 1, coLeads: 1 }],
        });

        const coLead = result.unfilled.find((entry) => entry.date === WEDNESDAY && entry.role === 'coLead');
        expect(coLead.reason).toBe(
            'no available staff for Governance coLead on 2026-09-09 (2 in pool, 1 on leave, 1 already on this task)',
        );
        expect(coLead.reason).not.toMatch(/band/);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. UNGRADED STAFF — absent is not "probably fine"
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — staff with no grade recorded', () => {
    const mixed = (overrides = {}) => ({
        startDate: MONDAY_START,
        weeks: 2,
        staff: [{ name: 'Ada', grade: 'AH15' }, { name: 'Nia' }, { name: 'Rob' }],
        tasks: [
            { name: 'Governance', leadBands: ['principal'], leads: 1, coLeads: 1 },
            { name: 'Open Clinic', leads: 1, coLeads: 0 },
        ],
        rules: { maxConcurrentPerDay: 1 },
        ...overrides,
    });

    it('never lets them lead a band-restricted task', () => {
        const { roster } = generateRosterV2(mixed());
        expect(new Set(leadsOf(roster, 'Governance'))).toEqual(new Set(['Ada']));
    });

    it('lets them co-lead that very task', () => {
        const { roster } = generateRosterV2(mixed());
        expect(new Set(coLeadsOf(roster, 'Governance'))).toEqual(new Set(['Nia', 'Rob']));
    });

    it('leaves them fully eligible for everything that is not gated', () => {
        const result = generateRosterV2(mixed());
        expect(new Set(leadsOf(result.roster, 'Open Clinic'))).toEqual(new Set(['Nia', 'Rob']));
        expect(result.unfilled).toEqual([]);
    });

    it('warns, by name, so the empty field is findable', () => {
        const { warnings } = generateRosterV2(mixed());
        expect(warnings).toEqual([
            '2 staff members have no job grade recorded (Nia, Rob), so they cannot lead the band-restricted task. They remain eligible for every other duty, and may still co-lead those tasks.',
        ]);
    });

    it('says it in the singular for one person, and counts the gated tasks', () => {
        const { warnings } = generateRosterV2(mixed({
            staff: [{ name: 'Ada', grade: 'AH15' }, { name: 'Ben', grade: 'AH13' }, { name: 'Nia' }],
            tasks: [
                { name: 'Governance', leadBands: ['principal'], leads: 1, coLeads: 1 },
                { name: 'Complex', leadBands: ['senior', 'principal'], leads: 1, coLeads: 0 },
            ],
        }));
        expect(warnings[0]).toMatch(/^1 staff member has no job grade recorded \(Nia\)/);
        expect(warnings[0]).toMatch(/any of the 2 band-restricted tasks/);
    });

    it('says nothing about grades when no task is band-restricted', () => {
        // The warning is about a live consequence, not about tidy data entry.
        const { warnings } = generateRosterV2(mixed({
            tasks: [{ name: 'Open Clinic', leads: 1, coLeads: 1 }],
        }));
        expect(warnings.filter((w) => /grade/.test(w))).toEqual([]);
    });

    it('says nothing when every band-gated task has a fully graded pool', () => {
        const { warnings } = generateRosterV2({
            startDate: MONDAY_START,
            weeks: 1,
            staff: gradedStaff(),
            tasks: [{ name: 'Complex', leadBands: ['senior', 'principal'], leads: 1, coLeads: 1 }],
        });
        expect(warnings).toEqual([]);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. CUSTOM BAND BOUNDARIES CHANGE WHO MAY LEAD
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — moved band boundaries', () => {
    const config = (bands) => ({
        startDate: MONDAY_START,
        weeks: 1,
        staff: [
            { name: 'Fen', grade: 'AH12' },
            { name: 'Gil', grade: 'AH8' },
            { name: 'Hana', grade: 'AH14' },
        ],
        tasks: [{ name: 'Senior Duty', leadBands: ['senior'], leads: 1, coLeads: 1 }],
        ...(bands ? { rules: { bands } } : {}),
    });

    it('keeps an AH12 out of the senior band by default', () => {
        const { roster } = generateRosterV2(config(null));
        expect(new Set(leadsOf(roster, 'Senior Duty'))).toEqual(new Set(['Hana']));
        expect(bandOfGrade('AH12')).toBe('junior');
    });

    it('lets the same AH12 lead once senior starts at 12', () => {
        const { roster } = generateRosterV2(config(CUSTOM_BANDS));
        expect(new Set(leadsOf(roster, 'Senior Duty'))).toEqual(new Set(['Fen', 'Hana']));
        expect(bandOfGrade('AH12', CUSTOM_BANDS)).toBe('senior');
    });

    it('agrees with bandOfGrade about every grade in the pool', () => {
        // The engine and the exported helper must not be two opinions.
        for (const bands of [DEFAULT_GRADE_BANDS, CUSTOM_BANDS]) {
            const seniorGrades = GRADE_SCALE.filter((grade) => bandOfGrade(grade, bands) === 'senior');
            const [min, max] = bands.senior;
            expect(seniorGrades).toEqual(
                GRADE_SCALE.filter((grade) => {
                    const n = Number(grade.slice(2));
                    return n >= min && n <= max;
                }),
            );
        }
    });

    it('reports the configured span, not the default one, in the unfilled reason', () => {
        const result = generateRosterV2({
            startDate: MONDAY_START,
            weeks: 1,
            staff: [{ name: 'Fen', grade: 'AH12', unavailable: [WEDNESDAY] }, { name: 'Gil', grade: 'AH8' }],
            tasks: [{ name: 'Senior Duty', leadBands: ['senior'], leads: 1, coLeads: 0 }],
            rules: { bands: CUSTOM_BANDS },
        });
        expect(result.unfilled).toHaveLength(1);
        expect(result.unfilled[0].reason).toMatch(/no available Senior-band staff for Senior Duty lead on 2026-09-09 \(1 in band, 1 on leave\)/);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. MOST-CONSTRAINED-FIRST MUST COUNT THE BAND GATE
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — MRV ordering counts band eligibility', () => {
    /**
     * The stranding scenario, in bands rather than skills.
     *
     * Ada is the only principal, everybody is capped at one duty a day, `ANY`
     * can be led by anybody and `BANDED` only by a principal.
     *
     * A naive `task → role` pass fills `ANY` first (it is listed first) and picks
     * Ada for it — she ties on load with Bo and Cy and wins alphabetically — and
     * then finds `BANDED` unfillable, reporting an `unfilled` entry it created
     * itself. If the eligibility count MRV sorts by ignored the band gate,
     * `BANDED` would look exactly as open as `ANY` and the same stranding would
     * happen through a new door.
     */
    const ANY = { name: 'ANY', leads: 1, coLeads: 0 };
    const BANDED = { name: 'BANDED', leadBands: ['principal'], leads: 1, coLeads: 0 };

    const strandingConfig = (tasks) => ({
        startDate: MONDAY_START,
        weeks: 2,
        staff: [
            { name: 'Ada', grade: 'AH15' },
            { name: 'Bo', grade: 'AH9' },
            { name: 'Cy', grade: 'AH10' },
        ],
        tasks,
        rules: { maxConcurrentPerDay: 1 },
    });

    it('fills the band-gated slot even when its task is configured last', () => {
        const result = generateRosterV2(strandingConfig([ANY, BANDED]));

        expect(result.unfilled).toEqual([]);
        expect(leadsOf(result.roster, 'BANDED')).toHaveLength(10);
        expect(leadsOf(result.roster, 'ANY')).toHaveLength(10);

        // Ada is spent on the duty only she may lead, never on the one anybody
        // could have led.
        expect(new Set(leadsOf(result.roster, 'BANDED'))).toEqual(new Set(['Ada']));
        expect(leadsOf(result.roster, 'ANY')).not.toContain('Ada');
    });

    it('produces the same assignments whichever order the tasks are configured in', () => {
        const anyFirst = generateRosterV2(strandingConfig([ANY, BANDED]));
        const bandedFirst = generateRosterV2(strandingConfig([BANDED, ANY]));

        expect(anyFirst.unfilled).toEqual([]);
        expect(bandedFirst.unfilled).toEqual([]);
        for (const taskName of ['ANY', 'BANDED']) {
            expect(leadsOf(anyFirst.roster, taskName)).toEqual(leadsOf(bandedFirst.roster, taskName));
        }
    });

    it('does not strand the band-gated slot behind a whole day of open slots', () => {
        // Five tasks anybody may lead, one only the single principal may, and
        // exactly enough people at one duty each. Under naive ordering the five
        // open tasks consume the pool alphabetically — starting with Ada — and
        // the band-gated task is unfilled every single day.
        const result = generateRosterV2({
            startDate: MONDAY_START,
            weeks: 2,
            staff: [
                { name: 'Ada', grade: 'AH15' },
                { name: 'Bo', grade: 'AH9' }, { name: 'Cy', grade: 'AH9' },
                { name: 'Di', grade: 'AH10' }, { name: 'Ed', grade: 'AH11' }, { name: 'Fi', grade: 'AH12' },
            ],
            tasks: [
                { name: 'OPEN1', coLeads: 0 }, { name: 'OPEN2', coLeads: 0 },
                { name: 'OPEN3', coLeads: 0 }, { name: 'OPEN4', coLeads: 0 },
                { name: 'OPEN5', coLeads: 0 },
                { name: 'BANDED', leadBands: ['principal'], coLeads: 0 },
            ],
            rules: { maxConcurrentPerDay: 1 },
        });

        expect(result.unfilled).toEqual([]);
        expect(new Set(leadsOf(result.roster, 'BANDED'))).toEqual(new Set(['Ada']));
        expect(leadsOf(result.roster, 'OPEN1')).not.toContain('Ada');
    });

    it('still reports a genuine band shortage as unfilled', () => {
        // Scarcity ordering must not paper over a real shortage: two lead slots
        // need a principal and only one person is one.
        const result = generateRosterV2({
            startDate: MONDAY_START,
            weeks: 1,
            staff: [{ name: 'Ada', grade: 'AH15' }, { name: 'Bo', grade: 'AH9' }],
            tasks: [{ name: 'Twin', leadBands: ['principal'], leads: 2, coLeads: 0 }],
        });

        expect(result.unfilled).toHaveLength(5); // one per weekday
        expect(result.unfilled.every((entry) => entry.role === 'lead')).toBe(true);
        expect(result.unfilled[0].reason).toMatch(/no available Principal-band staff for Twin lead/);
        expect(result.unfilled[0].reason).toMatch(/1 in band, 1 already on this task/);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. FAIRNESS IS UNCHANGED — one global FTE-weighted pool, whatever the gates
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — FTE fairness inside a gated pool', () => {
    const config = () => ({
        startDate: MONDAY_START,
        weeks: 12,
        staff: [
            { name: 'Full', fte: 1.0, grade: 'AH13' },
            { name: 'Part', fte: 0.6, grade: 'AH14' },
            { name: 'Junior', fte: 1.0, grade: 'AH8' },
        ],
        tasks: [{ name: 'Senior Clinic', leadBands: ['senior'], leads: 1, coLeads: 0 }],
    });

    it('still gives the 0.6 FTE senior meaningfully less than the full-timer', () => {
        const { load } = generateRosterV2(config());

        expect(load.Part.duties).toBeLessThan(load.Full.duties);

        // A band, not an exact figure — the target is 0.6 and integer duties
        // cannot land on it. Same test shape as the ungated fairness suite.
        const ratio = load.Part.duties / load.Full.duties;
        expect(ratio).toBeGreaterThan(0.5);
        expect(ratio).toBeLessThan(0.75);
    });

    it('hands out every duty the gated pool can take — fairness costs no coverage', () => {
        const result = generateRosterV2(config());
        expect(result.unfilled).toEqual([]);
        expect(result.load.Full.duties + result.load.Part.duties).toBe(60); // 12 weeks x Mon–Fri
    });

    it('gives the out-of-band colleague nothing, and does not rebalance to hide it', () => {
        const { load } = generateRosterV2(config());
        expect(load.Junior.duties).toBe(0);
        expect(load.Junior.share).toBe(0);
    });

    it('weights the whole pool globally, not band by band', () => {
        // The deferred item, pinned as behaviour so a later phase changing it is
        // a visible decision: the junior draws duties from the ungated task at
        // the same rate as the seniors, because there is no band-local target.
        const { load } = generateRosterV2({
            startDate: MONDAY_START,
            weeks: 4,
            staff: [
                { name: 'Ada', grade: 'AH15' },
                { name: 'Ben', grade: 'AH13' },
                { name: 'Dara', grade: 'AH9' },
            ],
            tasks: [
                { name: 'Gated', leadBands: ['senior', 'principal'], leads: 1, coLeads: 0 },
                { name: 'Open', leads: 1, coLeads: 0 },
            ],
        });
        const counts = Object.values(load).map((entry) => entry.duties);
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. DETERMINISM
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — determinism with grades in play', () => {
    const graded = () => ({
        startDate: MONDAY_START,
        weeks: 4,
        staff: [
            ...gradedStaff(),
            { name: 'Nia', fte: 0.6 }, // ungraded, part time
        ],
        tasks: [
            { name: 'Complex Clinic', leadBands: ['senior', 'principal'], leads: 1, coLeads: 1 },
            { name: 'Junior Clinic', leadBands: ['junior'], leads: 1, coLeads: 1 },
            { name: 'Governance', leadBands: ['principal'], days: [3], leads: 1, coLeads: 0 },
            { name: 'Open Clinic', leads: 1, coLeads: 1 },
        ],
        rules: { bands: CUSTOM_BANDS, maxConcurrentPerDay: 2, maxConsecutiveDays: 6 },
    });

    it('produces a deep-equal result when called twice with the same config', () => {
        expect(generateRosterV2(graded())).toEqual(generateRosterV2(graded()));
    });

    it('produces a byte-identical serialisation, key order included', () => {
        expect(JSON.stringify(generateRosterV2(graded()))).toBe(JSON.stringify(generateRosterV2(graded())));
    });

    it('does not mutate the config it was given, grades and bands included', () => {
        const config = graded();
        const snapshot = JSON.stringify(config);
        generateRosterV2(config);
        expect(JSON.stringify(config)).toBe(snapshot);
    });

    it('is deterministic over a full 52-week year', () => {
        const config = { ...graded(), weeks: 52 };
        expect(JSON.stringify(generateRosterV2(config))).toBe(JSON.stringify(generateRosterV2(config)));
    });

    it('normalises the grade spelling away — case cannot change a roster', () => {
        const shout = graded();
        shout.staff = shout.staff.map((person) => (
            person.grade ? { ...person, grade: person.grade.toLowerCase() } : person
        ));
        expect(JSON.stringify(generateRosterV2(shout))).toBe(JSON.stringify(generateRosterV2(graded())));
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. THE ROSTER IS READ BACK — the band gate is audited, not trusted
// ═════════════════════════════════════════════════════════════════════════════

describe('auditHardConstraints — lead bands', () => {
    const auditConfig = () => ({
        startDate: MONDAY_START,
        weeks: 1,
        staff: [
            { name: 'Ada', grade: 'AH15' },
            { name: 'Bo', grade: 'AH9' },
            { name: 'Nia' },
        ],
        tasks: [{ name: 'Governance', leadBands: ['principal'] }, { name: 'OPEN' }],
    });

    const shift = (task, lead, coLead) => ({
        task,
        lead,
        ...(coLead ? { coLead } : {}),
        staff: buildShiftStaffLabel(lead, coLead),
        category: 'CORE',
        week: 1,
        assignees: [lead, coLead].filter(Boolean),
    });

    it('finds nothing wrong with a roster this engine generated', () => {
        const config = auditConfig();
        const audit = auditHardConstraints(generateRosterV2(config).roster, config);
        expect(audit.ok).toBe(true);
        expect(audit.violations).toEqual([]);
    });

    it('catches an out-of-band lead a swap tool could have introduced', () => {
        const audit = auditHardConstraints(
            { [MONDAY_START]: [shift('Governance', 'Bo', 'Ada')] },
            auditConfig(),
        );
        expect(audit.violations).toEqual([{
            rule: 'leadBand',
            date: MONDAY_START,
            task: 'Governance',
            detail: 'Bo (AH9) leads Governance, which only Principal-band staff may lead',
        }]);
    });

    it('catches an UNGRADED lead, and says the grade is missing rather than wrong', () => {
        const audit = auditHardConstraints(
            { [MONDAY_START]: [shift('Governance', 'Nia', 'Ada')] },
            auditConfig(),
        );
        expect(audit.violations.some((v) => v.rule === 'leadBand')).toBe(true);
        expect(audit.violations[0].detail).toMatch(/Nia \(no grade recorded\) leads Governance/);
    });

    it('does not flag an out-of-band CO-lead — that slot was never gated', () => {
        const audit = auditHardConstraints(
            { [MONDAY_START]: [shift('Governance', 'Ada', 'Bo')] },
            auditConfig(),
        );
        expect(audit.violations).toEqual([]);
        expect(audit.count).toBe(0);
    });

    it('does not flag anything on a task with no leadBands', () => {
        const audit = auditHardConstraints(
            { [MONDAY_START]: [shift('OPEN', 'Nia', 'Bo')] },
            auditConfig(),
        );
        expect(audit.violations).toEqual([]);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 12. WARNINGS FOR BAND-STRAINED CONFIGURATIONS
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — band warnings', () => {
    it('warns when a task wants more leads per day than the band contains', () => {
        const { warnings } = generateRosterV2({
            startDate: MONDAY_START,
            weeks: 1,
            staff: [{ name: 'Ada', grade: 'AH15' }, { name: 'Bo', grade: 'AH9' }],
            tasks: [{ name: 'Twin', leadBands: ['principal'], leads: 2, coLeads: 0 }],
        });
        expect(warnings).toContain(
            'Task Twin needs 2 leads per day from the Principal band (AH15–AH17), but only 1 person qualifies, so some lead slots cannot be filled on any day.',
        );
    });

    it('refuses a task whose band and skill pools do not intersect — the composed twin of the unknown-skill rule', () => {
        // Enough principals, enough CPET holders, and no single person who is
        // both: every lead slot of the task would be unfilled, so this is a
        // configuration error caught loudly at validation, not a roster with a
        // warning. (It WAS a warning for one commit — the psych-pack change was
        // barred from editing this pin, so the orchestrator moved it
        // deliberately and landed the refusal in the same commit.)
        const config = {
            startDate: MONDAY_START,
            weeks: 1,
            staff: [
                { name: 'Ada', grade: 'AH15', skills: [] },
                { name: 'Bo', grade: 'AH9', skills: ['CPET'] },
                { name: 'Cy', grade: 'AH13', skills: ['CPET'] },
            ],
            tasks: [{ name: 'Paed', requiresSkill: 'CPET', leadBands: ['principal'], leads: 1, coLeads: 1 }],
        };
        const reason =
            "Task Paed may only be led by Principal-band staff (AH15–AH17) who also hold skill CPET, and nobody in the staff pool is both. Check the grades and the skills, widen the task's leadBands, or move the band boundaries.";

        expect(validateRosterV2Config(config)).toEqual({ valid: false, reason });

        const result = generateRosterV2(config);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe(reason);

        // Control: give the principal the skill and the identical config
        // generates cleanly, with her leading — so the refusal really is about
        // the intersection and nothing else.
        const fixed = {
            ...config,
            staff: [
                { name: 'Ada', grade: 'AH15', skills: ['CPET'] },
                ...config.staff.slice(1),
            ],
        };
        const ok = generateRosterV2(fixed);
        expect(ok.ok).toBe(true);
        expect(ok.unfilled).toEqual([]);
        expect(new Set(Object.values(ok.roster).flat().map((s) => s.lead))).toEqual(new Set(['Ada']));
    });

    it('says nothing when the band comfortably covers the demand', () => {
        const { warnings } = generateRosterV2({
            startDate: MONDAY_START,
            weeks: 1,
            staff: gradedStaff(),
            tasks: [{ name: 'Complex', leadBands: ['senior', 'principal'], leads: 1, coLeads: 1 }],
        });
        expect(warnings).toEqual([]);
    });
});
