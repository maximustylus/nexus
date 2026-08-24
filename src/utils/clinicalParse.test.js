/**
 * `AC5` — the assembly, finally imported instead of grepped.
 *
 * The word-level parsers have their own suites (`pavs.test.js`,
 * `clinicalFlags.i18n.test.js`); what was never testable was the ASSEMBLY —
 * which raw answer feeds which parser, and what the result object calls each
 * flag. `AC1` lived in the assembly's old inline ladder for weeks precisely
 * because this file could not exist.
 */
import { describe, it, expect } from 'vitest';
import { parseClinicalData } from './clinicalParse.js';

const answers = (overrides = {}) => ({
    pavs_days: '5 days', pavs_mins: '60+ mins', strength: '2 days',
    medical: 'None of these', barriers: 'No barriers', social: 'I meet people often',
    wellbeing: 'Feeling good', falls: 'No falls', healthier_sg: 'Yes, enrolled',
    demographics: 'Female, 60+', ethnicity: 'Malay', housing_type: '3 Room HDB',
    postal_code: '229899', food_insecurity: 'Never', previous_id: 'No ID',
    ...overrides,
});

describe('the healthy baseline profile', () => {
    const out = parseClinicalData(answers());

    it('computes the PAVS product from the tested parsers', () => {
        expect(out.pavsDays).toBe(5);
        // 65, from ConventionalForm's own midpoint table — the value `AC15`
        // pinned. (First draft of this test guessed 75 from the chip label;
        // the form's table, not the label, is the authority.)
        expect(out.pavsMinutes).toBe(65);
        expect(out.pavsScore).toBe(325);
    });

    it('raises no flags on unremarkable answers', () => {
        expect(out.symptomFlag).toBe(false);
        expect(out.medFlag).toBe(false);
        expect(out.sdohFinancial).toBe(false);
        expect(out.sdohSocial).toBe(false);
        expect(out.sdohPsychological).toBe(false);
        expect(out.sdohFoodInsecure).toBe(false);
        expect(out.caregiverStrain).toBe(false);
        expect(out.sdohHousing).toBe(false);
    });

    it('resolves demographics through the shared parsers', () => {
        expect(out.gender).toBe('Female');
        expect(out.age).toBe('60+');
        expect(out.postalSector).toBe('22'); // a real Singapore sector
        expect(out.previousId).toBeNull();   // "No ID" is not an id
    });
});

describe('the routings that used to be wrong in the inline ladder', () => {
    it('AC1: a typed "120 minutes" is 120, not 15', () => {
        const out = parseClinicalData(answers({ pavs_days: 'daily', pavs_mins: '120 minutes' }));
        expect(out.pavsDays).toBe(7);
        expect(out.pavsMinutes).toBe(120);
        expect(out.pavsScore).toBe(840);
    });

    it('zero days zeroes the minutes — no exercise on no days', () => {
        const out = parseClinicalData(answers({ pavs_days: '0 days', pavs_mins: '60+ mins' }));
        expect(out.pavsDays).toBe(0);
        expect(out.pavsMinutes).toBe(0);
        expect(out.pavsScore).toBe(0);
    });

    it('falls: "not asked" is asked:false, never "no falls"', () => {
        const out = parseClinicalData(answers({ falls: undefined }));
        expect(out.fallsAsked).toBe(false);
        expect(out.fallsCount).not.toBeGreaterThan(0);
    });

    it('healthier_sg: "not sure" stays null, never false', () => {
        expect(parseClinicalData(answers({ healthier_sg: 'Not sure' })).healthierSgEnrolled).toBeNull();
    });

    it('a chip label in the postal field is null, never sector "00"', () => {
        expect(parseClinicalData(answers({ postal_code: 'Prefer not to say' })).postalSector).toBeNull();
    });

    it('1-2 room housing raises the housing proxy the evidence page claims', () => {
        expect(parseClinicalData(answers({ housing_type: '1-2 Room HDB' })).sdohHousing).toBe(true);
        expect(parseClinicalData(answers({ housing_type: '1–2 Room HDB' })).sdohHousing).toBe(true);
    });

    it('a previous id is uppercased and trimmed for continuity matching', () => {
        expect(parseClinicalData(answers({ previous_id: ' nx-ab12cd ' })).previousId).toBe('NX-AB12CD');
    });
});

describe('missing answers do not throw — the completion path depends on this', () => {
    // `AC6`: parseClinicalData now runs INSIDE concludeTriage's try, but the
    // yesterday-shaped failure (a skipped step leaving a key undefined) should
    // not need the catch at all.
    it('parses an entirely empty answer set', () => {
        expect(() => parseClinicalData({})).not.toThrow();
        const out = parseClinicalData({});
        expect(out.pavsScore).toBe(0);
        expect(out.gender).toBe('Unknown');
        expect(out.postalSector).toBeNull();
    });
});
