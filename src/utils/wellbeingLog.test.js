/** `AU24` — the suite `AU9` and `AU10` were fixed alongside, not after. */
import { describe, it, expect } from 'vitest';
import { sanitizeWellbeingLog, PHASE_BANDS, VALID_PHASES } from './wellbeingLog.js';

describe('AU10 — only the four phases are loggable', () => {
    it.each(VALID_PHASES.map((p) => [p]))('accepts %s', (phase) => {
        expect(sanitizeWellbeingLog({ phase, energy: PHASE_BANDS[phase].min }).phase).toBe(phase);
    });

    it.each([['ill'], [' Injured '], ['healthy']])('normalises case and whitespace: %j', (phase) => {
        expect(sanitizeWellbeingLog({ phase, energy: 10 })).not.toBeNull();
    });

    it.each([
        ['an invented phase', 'EXHAUSTED'],
        ['a sentence', 'they seem quite ill'],
        ['null literal', 'null'],
        ['empty', ''],
        ['a number', 3],
        ['undefined', undefined],
        ['an object', {}],
    ])('refuses %s outright rather than logging it', (_label, phase) => {
        expect(sanitizeWellbeingLog({ phase, energy: 50 })).toBeNull();
    });
});

describe('AU9 — energy is always a finite integer inside the band', () => {
    it('passes a consistent proposal through unchanged and uncorrected', () => {
        expect(sanitizeWellbeingLog({ phase: 'REACTING', energy: 65 })).toEqual({
            phase: 'REACTING', energy: 65, corrected: false, rawEnergy: 65,
        });
    });

    it.each([
        ['NaN', NaN],
        ['Infinity', Infinity],
        ['a numeric string', '70'],
        ['a word', 'quite low'],
        ['null', null],
        ['undefined', undefined],
        ['an array', [70]],
    ])('%s becomes the band midpoint, flagged corrected — never NaN in the record', (_label, energy) => {
        const out = sanitizeWellbeingLog({ phase: 'ILL', energy });
        expect(out.energy).toBe(10); // midpoint of 0-19, not 19 (the old 50-then-clamp)
        expect(Number.isFinite(out.energy)).toBe(true);
        expect(out.corrected).toBe(true);
        expect(out.rawEnergy).toBe(energy);
    });

    it('clamps a contradiction into the band AND says it did', () => {
        // Energy 85 with phase ILL is the model disagreeing with itself. The old
        // clamp stored 19 silently; the disagreement is now in the return value.
        const out = sanitizeWellbeingLog({ phase: 'ILL', energy: 85 });
        expect(out.energy).toBe(19);
        expect(out.corrected).toBe(true);
        expect(out.rawEnergy).toBe(85);
    });

    it('rounds a decimal and reports the rounding as a correction', () => {
        const out = sanitizeWellbeingLog({ phase: 'HEALTHY', energy: 90.6 });
        expect(out.energy).toBe(91);
        expect(out.corrected).toBe(true);
    });

    it.each(VALID_PHASES.map((p) => [p]))('%s band edges are accepted exactly', (phase) => {
        const { min, max } = PHASE_BANDS[phase];
        expect(sanitizeWellbeingLog({ phase, energy: min }).corrected).toBe(false);
        expect(sanitizeWellbeingLog({ phase, energy: max }).corrected).toBe(false);
    });

    it('the bands tile 0-100 with no gap and no overlap', () => {
        const sorted = Object.values(PHASE_BANDS).sort((a, b) => a.min - b.min);
        expect(sorted[0].min).toBe(0);
        expect(sorted[sorted.length - 1].max).toBe(100);
        for (let i = 1; i < sorted.length; i += 1) {
            expect(sorted[i].min).toBe(sorted[i - 1].max + 1);
        }
    });
});
