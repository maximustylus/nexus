/**
 * ==============================================================================
 * CLINICAL RISK SCORE — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * `calculateRiskScore` is the only clinical computation in the COMMUNITY portal —
 * the public-facing side, used by members of the public with no account, no
 * clinician in the room, and no way to tell a wrong number from a right one. It had
 * no tests at all.
 *
 * Its docblock claims "ACSM guidelines" and bands the output
 * `0-1 Low / 2-4 Moderate / 5+ High`, so every one of those five points has to mean
 * something. The cases below check that each input dimension can actually move the
 * score — which is a lower bar than "is it clinically correct", and one the function
 * did not clear.
 */

import { describe, it, expect } from 'vitest';
import { calculateRiskScore } from './scoring';

/**
 * The shape `deriveFlags` (ConventionalForm) and `parseClinicalData` (AuraChat) both
 * produce. Named here because the two field names that matter look interchangeable
 * and are not:
 *
 *   pavsMinutes  MINUTES PER SESSION   — max 65, from MINS_MIDPOINT
 *   pavsScore    MINUTES PER WEEK      — days x minutes, the PAVS figure itself
 *
 * 150 is a WEEKLY threshold. Only one of these can be compared against it.
 */
const profile = (over = {}) => ({
    symptomFlag: false,
    medFlag: false,
    psychoFlag: false,
    pavsDays: 0,
    pavsMinutes: 0,
    pavsScore: 0,
    strengthDays: 0,
    ...over,
});

/** Somebody comfortably exceeding every guideline: 6 days x 65 min = 390 min/week. */
const VERY_ACTIVE = profile({ pavsDays: 6, pavsMinutes: 65, pavsScore: 390, strengthDays: 3 });

/** Somebody who does nothing at all. */
const SEDENTARY = profile({ pavsDays: 0, pavsMinutes: 0, pavsScore: 0, strengthDays: 0 });

describe('calculateRiskScore — the activity dimension must actually measure activity', () => {
    /**
     * ⚠️ THE BUG THIS SUITE WAS WRITTEN FOR. The function compared
     * `data.pavsMinutes` — minutes PER SESSION, which `MINS_MIDPOINT` caps at 65 —
     * against 150, a WEEKLY threshold. 65 < 150 always, so the "physical activity
     * deficit" point was added to EVERY respondent who ever completed the
     * assessment, through either pathway.
     *
     * The consequence is not a rounding error. It is that the score cannot tell a
     * sedentary person from an athlete on the one dimension the whole portal is
     * about, while presenting itself as an ACSM-based risk band.
     */
    it('separates a very active person from a sedentary one', () => {
        expect(calculateRiskScore(VERY_ACTIVE)).toBeLessThan(calculateRiskScore(SEDENTARY));
    });

    it('adds nothing for activity when the weekly total meets the 150-minute guideline', () => {
        // 5 days x 30 min = 150/week exactly, plus 2 days strength: no deficits at all.
        const meets = profile({ pavsDays: 5, pavsMinutes: 30, pavsScore: 150, strengthDays: 2 });
        expect(calculateRiskScore(meets)).toBe(0);
    });

    it('adds exactly one point for a weekly total below the guideline', () => {
        const below = profile({ pavsDays: 3, pavsMinutes: 25, pavsScore: 75, strengthDays: 2 });
        expect(calculateRiskScore(below)).toBe(1);
    });

    /**
     * The boundary is worth pinning because "meets the guideline" is the sentence the
     * result page shows, and an off-by-one here means somebody told they meet it is
     * simultaneously scored as not meeting it.
     */
    it('treats exactly 150 minutes a week as meeting the guideline, not missing it', () => {
        expect(calculateRiskScore(profile({ pavsScore: 150, strengthDays: 2 }))).toBe(0);
        expect(calculateRiskScore(profile({ pavsScore: 149, strengthDays: 2 }))).toBe(1);
    });
});

describe('calculateRiskScore — the clinical flags', () => {
    /**
     * Chest pain or dizziness on exertion is an absolute contraindication in the
     * screen this portal names. It must dominate: 5 points puts the result in the
     * High band on its own, whatever else is true.
     */
    it('puts a symptom flag into the High band by itself', () => {
        const score = calculateRiskScore(profile({ symptomFlag: true, pavsScore: 390, strengthDays: 3 }));
        expect(score).toBeGreaterThanOrEqual(5);
    });

    it('scores a chronic condition above psychological distress, and both above nothing', () => {
        const base = { pavsScore: 390, strengthDays: 3 };
        const none = calculateRiskScore(profile(base));
        const psych = calculateRiskScore(profile({ ...base, psychoFlag: true }));
        const med = calculateRiskScore(profile({ ...base, medFlag: true }));
        expect(none).toBeLessThan(psych);
        expect(psych).toBeLessThan(med);
    });

    it('adds one point for fewer than two strength days', () => {
        const base = { pavsScore: 390 };
        expect(calculateRiskScore(profile({ ...base, strengthDays: 2 }))).toBe(0);
        expect(calculateRiskScore(profile({ ...base, strengthDays: 1 }))).toBe(1);
        expect(calculateRiskScore(profile({ ...base, strengthDays: 0 }))).toBe(1);
    });
});

describe('calculateRiskScore — degraded input', () => {
    /**
     * The chat pathway builds its input by parsing free text a language model
     * produced, so a missing or non-numeric field is a real possibility rather than a
     * theoretical one. Missing activity data must read as a DEFICIT rather than as
     * "meets the guideline" — the safe direction for a screening tool.
     */
    it('treats missing activity data as a deficit, not as compliance', () => {
        expect(calculateRiskScore({})).toBeGreaterThan(0);
        expect(calculateRiskScore({ pavsScore: undefined, strengthDays: undefined })).toBeGreaterThan(0);
        expect(calculateRiskScore({ pavsScore: null })).toBeGreaterThan(0);
    });

    it('never returns a negative score or NaN', () => {
        [{}, { pavsScore: 'abc' }, { strengthDays: 'two' }, { pavsScore: -5 }].forEach((input) => {
            const score = calculateRiskScore(input);
            expect(Number.isFinite(score)).toBe(true);
            expect(score).toBeGreaterThanOrEqual(0);
        });
    });
});
