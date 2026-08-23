/**
 * ==============================================================================
 * CHIP PARITY — every language must parse to the same answer as English
 * ==============================================================================
 *
 * `CD10` / `P7.7`. The falls and Healthier SG questions shipped in English only,
 * and `chatSteps.js` skipped them for ms/zh/ta — so a Malay, Chinese or Tamil
 * speaker got a shorter assessment and those two flags stayed unknown. Translating
 * the chips makes both questions appear for everybody.
 *
 * ⚠️ AND THAT IS THE DANGEROUS HALF, NOT THE SAFE ONE. `parseFallsAnswer` and
 *    `parseHealthierSg` match TOKEN LISTS, and those lists were English-only:
 *
 *      matchesNoFalls    = ['no falls', 'none', 'no']
 *      matchesEnrolledNo = ['no', 'not enrolled']
 *
 *    "Tiada jatuh" matches nothing in the first, so `parseFallsAnswer` falls
 *    through to `falls = 1, fallsRisk = true`. Translate the chips alone and every
 *    Malay, Chinese and Tamil speaker who had NEVER fallen is recorded as having
 *    fallen — scored for it, shown it on their result, and handed a printed slip
 *    stating it to a community centre. The step-skip rule exists to refuse exactly
 *    this trade: missing data is recoverable, wrong data is not, and wrong data
 *    produced from a question the person could read looks complete.
 *
 * So this file asserts the property that makes translating safe: **chip `n` in any
 * language parses to exactly what chip `n` in English parses to.** It is written
 * against the chips themselves rather than against remembered expectations, so
 * adding a language or rewording a chip fails here rather than in public.
 *
 * ⚠️ IT ALREADY EARNED ITS KEEP. The natural Tamil for "two or more" is
 *    "இரண்டு அல்லது அதற்கு மேற்பட்ட". அல்லது ("or") begins with அல்ல, a Tamil
 *    negator; Tamil negation is postfix, so `isNegated` read it as denying the
 *    "இரண்டு" immediately before it and the chip parsed as ONE fall. Nothing about
 *    the sentence looks wrong — it is correct Tamil. Only this test saw it.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import { parseFallsAnswer, parseHealthierSg } from './clinicalFlags';
import { FALLS_CHIPS, HSG_CHIPS, CHIP_LANGUAGES } from '../data/screeningChips';

const OTHERS = CHIP_LANGUAGES.filter((lang) => lang !== 'en');

describe('falls chips parse identically in every language', () => {
    /**
     * The English chips are the reference, and their meanings are asserted
     * explicitly first — a parity test against a broken reference proves nothing.
     */
    it('reads the English chips as 0, 1, 2 and 1-with-avoidance', () => {
        const [none, one, two, avoid] = FALLS_CHIPS.en.map(parseFallsAnswer);

        expect(none).toEqual({ falls: 0, avoidsActivity: false, fallsRisk: false, asked: true });
        expect(one).toEqual({ falls: 1, avoidsActivity: false, fallsRisk: true, asked: true });
        expect(two).toEqual({ falls: 2, avoidsActivity: false, fallsRisk: true, asked: true });
        expect(avoid).toEqual({ falls: 1, avoidsActivity: true, fallsRisk: true, asked: true });
    });

    it.each(OTHERS)('%s matches English chip for chip', (lang) => {
        expect(FALLS_CHIPS[lang]).toHaveLength(FALLS_CHIPS.en.length);

        FALLS_CHIPS.en.forEach((english, index) => {
            const translated = FALLS_CHIPS[lang][index];
            expect(
                parseFallsAnswer(translated),
                `${lang} chip ${index} — "${translated}" must parse as "${english}" does`,
            ).toEqual(parseFallsAnswer(english));
        });
    });

    /**
     * ⚠️ THE SAFEST ANSWER MUST NOT READ AS THE RISKIEST. "No falls" CONTAINS the
     *    word "fall", and every language has the same trap: the negative shares a
     *    stem with the thing it denies. This is the single assertion that would
     *    have caught an untranslated matcher list, so it is stated on its own
     *    rather than left implied by the parity loop above.
     */
    it.each(CHIP_LANGUAGES)('%s: the "no falls" chip flags no risk at all', (lang) => {
        const result = parseFallsAnswer(FALLS_CHIPS[lang][0]);
        expect(result.falls).toBe(0);
        expect(result.fallsRisk).toBe(false);
        expect(result.avoidsActivity).toBe(false);
        // `asked: true` — the question WAS put and the answer was no. Distinct from
        // an unasked question, which must never be read as "no falls".
        expect(result.asked).toBe(true);
    });

    it.each(CHIP_LANGUAGES)('%s: the avoidance chip carries the fear-of-falling signal', (lang) => {
        // Kept separate from the count deliberately: somebody who fell once and now
        // avoids the stairs is at higher risk than somebody who fell once and
        // carried on, and the intervention is a different one.
        expect(parseFallsAnswer(FALLS_CHIPS[lang][3]).avoidsActivity).toBe(true);
    });

    it.each(CHIP_LANGUAGES)('%s: two-or-more counts as two, not one', (lang) => {
        expect(parseFallsAnswer(FALLS_CHIPS[lang][2]).falls).toBe(2);
    });
});

describe('Healthier SG chips parse identically in every language', () => {
    it('reads the English chips as true, false and null', () => {
        expect(HSG_CHIPS.en.map(parseHealthierSg)).toEqual([true, false, null]);
    });

    it.each(OTHERS)('%s matches English chip for chip', (lang) => {
        expect(HSG_CHIPS[lang]).toHaveLength(HSG_CHIPS.en.length);
        HSG_CHIPS.en.forEach((english, index) => {
            const translated = HSG_CHIPS[lang][index];
            expect(
                parseHealthierSg(translated),
                `${lang} chip ${index} — "${translated}" must parse as "${english}" does`,
            ).toBe(parseHealthierSg(english));
        });
    });

    /**
     * ⚠️ "NOT SURE" IS `null` AND MUST NEVER BE `false`, IN ANY LANGUAGE.
     *
     *    This is the assertion the Malay chips were one token away from failing.
     *    The obvious "no" token is `tidak` — and "Saya tidak pasti" ("I am not
     *    sure") contains it. `matchesEnrolledNo` runs FIRST and returns, so a bare
     *    `tidak` would have turned "the portal does not know" into "this person is
     *    not enrolled with a Healthier SG GP", silently, for every Malay speaker
     *    who was unsure — and that value decides which programmes the result page
     *    tells them they can be referred to.
     */
    it.each(CHIP_LANGUAGES)('%s: "not sure" is null, never false', (lang) => {
        expect(parseHealthierSg(HSG_CHIPS[lang][2])).toBeNull();
    });

    it.each(CHIP_LANGUAGES)('%s: "not enrolled" is false, and is not confused with yes', (lang) => {
        // Both chips contain the enrolment verb; only the order of the tests
        // separates them, so this asserts the order as much as the tokens.
        expect(parseHealthierSg(HSG_CHIPS[lang][1])).toBe(false);
        expect(parseHealthierSg(HSG_CHIPS[lang][0])).toBe(true);
    });
});

describe('the chip sets are complete', () => {
    /**
     * A language present in one set and missing from the other would render a
     * falls question with no Healthier SG follow-up, or vice versa — a silent gap
     * of exactly the kind `CD10` is a ledger entry about.
     */
    it.each(CHIP_LANGUAGES)('%s has both sets, fully populated', (lang) => {
        expect(FALLS_CHIPS[lang]).toBeDefined();
        expect(HSG_CHIPS[lang]).toBeDefined();
        [...FALLS_CHIPS[lang], ...HSG_CHIPS[lang]].forEach((chip) => {
            expect(typeof chip).toBe('string');
            expect(chip.trim()).not.toBe('');
        });
    });

    /** An unasked question is not an answer of "no". */
    it('still reports an empty answer as never asked', () => {
        expect(parseFallsAnswer('')).toEqual({
            falls: 0, avoidsActivity: false, fallsRisk: false, asked: false,
        });
        expect(parseHealthierSg('')).toBeNull();
    });
});
