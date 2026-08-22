/**
 * ==============================================================================
 * CHAT STEPS — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * The assessment used to be `currentStep + 1` until the end. Two things broke
 * that: a question that applies only to the 60+ cohort, and questions that do not
 * yet exist in three of the four languages.
 */

import { describe, it, expect } from 'vitest';
import {
    isStepAvailable, nextActiveStep, firstActiveStep, activeStepCount, activeStepPosition,
} from './chatSteps';

const CONFIG = [
    { key: 'a' },
    { key: 'b' },
    { key: 'c', when: (d) => d.age === '60+' },
    { key: 'd' },
];
const FULL = ['prompt a', 'prompt b', 'prompt c', 'prompt d'];
/** A language that has not translated the last two. */
const PARTIAL = ['prompt a', 'prompt b'];

describe('conditional steps', () => {
    it('asks a conditional step when the condition holds', () => {
        expect(isStepAvailable(CONFIG, 2, FULL, { age: '60+' })).toBe(true);
    });

    it('skips it when the condition does not hold', () => {
        expect(isStepAvailable(CONFIG, 2, FULL, { age: '21-40' })).toBe(false);
        expect(nextActiveStep(CONFIG, 1, FULL, { age: '21-40' })).toBe(3);
    });

    it('skips it when there is no data to decide on yet', () => {
        expect(isStepAvailable(CONFIG, 2, FULL, {})).toBe(false);
        expect(isStepAvailable(CONFIG, 2, FULL, undefined)).toBe(false);
    });

    /**
     * A predicate that throws must not take the assessment down. Skipping is the
     * safe direction — the question is optional by construction and the flag
     * defaults to unknown, which the scoring already treats as a deficit.
     */
    it('skips rather than throws when a predicate blows up', () => {
        const bad = [{ key: 'x', when: () => { throw new Error('boom'); } }];
        expect(() => isStepAvailable(bad, 0, ['p'], {})).not.toThrow();
        expect(isStepAvailable(bad, 0, ['p'], {})).toBe(false);
    });
});

describe('⚠️ untranslated steps are skipped, not asked in the wrong language', () => {
    /**
     * THE RULE THAT MATTERS. A question shown in English to a Tamil speaker does
     * not produce a MISSING answer — they answer it anyway, and the answer feeds
     * calculateRiskScore and selectCTA. It produces a WRONG one.
     */
    it('skips a step the active language has no prompt for', () => {
        expect(isStepAvailable(CONFIG, 3, PARTIAL, {})).toBe(false);
        expect(nextActiveStep(CONFIG, 1, PARTIAL, { age: '60+' })).toBe(-1);
    });

    it('checks the translation BEFORE the condition, so a conditional cannot slip through', () => {
        // The condition holds, but the language has no prompt.
        expect(isStepAvailable(CONFIG, 2, PARTIAL, { age: '60+' })).toBe(false);
    });

    it.each([undefined, null, ''])('treats %j as untranslated', (prompt) => {
        expect(isStepAvailable(CONFIG, 0, [prompt], {})).toBe(false);
    });

    it('a translated language gets the full run', () => {
        expect(activeStepCount(CONFIG, FULL, { age: '60+' })).toBe(4);
        expect(activeStepCount(CONFIG, PARTIAL, { age: '60+' })).toBe(2);
    });
});

describe('walking the sequence', () => {
    it('returns -1 at the end rather than running off the array', () => {
        expect(nextActiveStep(CONFIG, 3, FULL, { age: '60+' })).toBe(-1);
        expect(nextActiveStep(CONFIG, 99, FULL, {})).toBe(-1);
    });

    it('finds the first step from before the beginning', () => {
        expect(firstActiveStep(CONFIG, FULL, {})).toBe(0);
        expect(firstActiveStep([{ key: 'z', when: () => false }, { key: 'y' }], ['p', 'q'], {})).toBe(1);
    });

    it('walks the whole sequence in order, skipping what does not apply', () => {
        const walk = (data) => {
            const seen = [];
            let i = firstActiveStep(CONFIG, FULL, data);
            while (i !== -1) { seen.push(CONFIG[i].key); i = nextActiveStep(CONFIG, i, FULL, data); }
            return seen;
        };
        expect(walk({ age: '60+' })).toEqual(['a', 'b', 'c', 'd']);
        expect(walk({ age: '21-40' })).toEqual(['a', 'b', 'd']);
    });

    it('does not throw on an empty or missing config', () => {
        expect(nextActiveStep([], 0, [], {})).toBe(-1);
        expect(nextActiveStep(undefined, 0, [], {})).toBe(-1);
        expect(activeStepCount(undefined, [], {})).toBe(0);
    });
});

describe('the progress bar counts only what is asked', () => {
    /**
     * A total that pretended to be fixed would either overcount for everybody who
     * skips a branch, or undercount for everybody who takes one — and the bar
     * would sit at "12 of 15" and then finish.
     */
    it('totals the steps this person will actually see', () => {
        expect(activeStepCount(CONFIG, FULL, { age: '60+' })).toBe(4);
        expect(activeStepCount(CONFIG, FULL, { age: '21-40' })).toBe(3);
    });

    it('reports position among asked steps, not absolute index', () => {
        // Step 3 is the 3rd question for somebody who skipped step 2.
        expect(activeStepPosition(CONFIG, 3, FULL, { age: '21-40' })).toBe(3);
        expect(activeStepPosition(CONFIG, 3, FULL, { age: '60+' })).toBe(4);
    });

    it('never exceeds the total', () => {
        [{ age: '60+' }, { age: '21-40' }, {}].forEach((data) => {
            const total = activeStepCount(CONFIG, FULL, data);
            CONFIG.forEach((_, i) => {
                expect(activeStepPosition(CONFIG, i, FULL, data)).toBeLessThanOrEqual(total);
            });
        });
    });
});
