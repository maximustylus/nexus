/**
 * ==============================================================================
 * PATHWAY PARITY — the two doors must reach the same conclusions
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * NEXUS offers a chat and a form, and its own comment at
 * `ConventionalForm.jsx:159` once claimed the two were identical while they were
 * not — `CP9`, where a socially isolated senior got the right answer through one
 * door and a silent fallback through the other.
 *
 * ⚠️ IT HAPPENED AGAIN, AND THIS FILE EXISTS BECAUSE OF IT. The falls and
 *    Healthier SG questions were added to the chat and not to the form, so for two
 *    commits a 60+ respondent who had fallen was routed to falls prevention
 *    through the chat and not through the form. `ctaTierParity.test.js` did not
 *    catch it: that file compares the TIERS the two can emit, and both could still
 *    emit the same tiers. What diverged was the FLAGS behind them.
 *
 * So this checks the flag surface — the object each pathway hands to
 * `calculateRiskScore`, `selectCTA` and `servicesForSector`. Reading it out of the
 * source, like `ctaTierParity`, because both derivations live inside large JSX
 * components that pull in Firebase at module scope.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = (name) => readFileSync(resolve(HERE, '..', 'components', name), 'utf8');

/**
 * The keys of the object a pathway returns to the scorer. Brace-matched from the
 * `return {` that closes its derivation, not indentation-matched — the lesson from
 * `ctaTierParity`, whose first draft reported `flexDirection` as a CTA tier.
 */
const returnedKeys = (text, afterMarker) => {
    const from = text.indexOf(afterMarker);
    if (from === -1) throw new Error(`Could not find \`${afterMarker}\` — did it get renamed?`);
    const start = text.indexOf('return {', from);
    if (start === -1) throw new Error(`No \`return {\` after \`${afterMarker}\`.`);
    let depth = 0;
    let end = start;
    for (let i = text.indexOf('{', start); i < text.length; i += 1) {
        if (text[i] === '{') depth += 1;
        else if (text[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
    }
    // ⚠️ COMMENTS OUT FIRST. Prose contains commas, and this splits on commas —
    //    a comment reading "derived here but returned under different names, or
    //    computed in handleSubmit" split into fragments and swallowed the key on
    //    the line after it, so the test reported a divergence that did not exist.
    const body = text.slice(start + 'return {'.length, end)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');

    // Split on TOP-LEVEL commas and take the identifier before any colon. An
    // earlier draft used a single regex anchored on `^|,` and silently dropped the
    // first key, because the body opens with a newline rather than a comma — every
    // "both pathways derive X" case then failed for the wrong reason.
    const keys = [];
    let nesting = 0;
    let current = '';
    for (const ch of body) {
        if ('([{'.includes(ch)) nesting += 1;
        else if (')]}'.includes(ch)) nesting -= 1;
        if (ch === ',' && nesting === 0) { keys.push(current); current = ''; }
        else current += ch;
    }
    keys.push(current);

    const names = keys
        .map((entry) => entry.split(':')[0].trim())
        .filter((name) => /^\w+$/.test(name));
    if (names.length === 0) throw new Error(`Parsed no keys from the return after \`${afterMarker}\`.`);
    return [...new Set(names)];
};

const chatFlags = () => returnedKeys(src('AuraChat.jsx'), 'const parseClinicalData');
const formFlags = () => returnedKeys(src('ConventionalForm.jsx'), 'const deriveFlags');

/**
 * Keys each pathway legitimately has to itself. Anything NOT listed here must
 * appear in both — that is the whole point, and the list is deliberately short so
 * adding to it is a visible decision rather than a quiet one.
 */
const CHAT_ONLY = [
    'pavsMinutes',   // the chat parses a midpoint; the form holds the raw answer
];
const FORM_ONLY = [
    'pavsMinutes',
];

describe('⚠️ both pathways derive the same clinical flags', () => {
    /**
     * THE LOAD-BEARING TEST. A flag present in one pathway and not the other means
     * the same person gets a different assessment depending on which door they
     * walked through — and neither screen tells them so.
     */
    it('the chat derives nothing the form does not', () => {
        const missing = chatFlags()
            .filter((k) => !formFlags().includes(k))
            .filter((k) => !CHAT_ONLY.includes(k));
        expect(missing, `chat derives these and the form does not: ${missing.join(', ')}`).toEqual([]);
    });

    it('the form derives nothing the chat does not', () => {
        const missing = formFlags()
            .filter((k) => !chatFlags().includes(k))
            .filter((k) => !FORM_ONLY.includes(k));
        expect(missing, `form derives these and the chat does not: ${missing.join(', ')}`).toEqual([]);
    });

    /**
     * Named explicitly as well as compared, so that deleting BOTH sides of a flag
     * still fails rather than passing as a matched pair of absences.
     */
    it.each([
        'symptomFlag', 'medFlag',
        'sdohFinancial', 'sdohSocial', 'sdohPsychological', 'sdohFoodInsecure',
        'caregiverStrain',
        'fallsRisk', 'fearOfFalling', 'fallsAsked',
        'healthierSgEnrolled',
        'pavsScore', 'strengthDays', 'age', 'gender', 'postalSector', 'previousId',
    ])('both pathways derive %s', (flag) => {
        expect(chatFlags(), `chat is missing ${flag}`).toContain(flag);
        expect(formFlags(), `form is missing ${flag}`).toContain(flag);
    });
});

describe('both pathways ask the questions those flags come from', () => {
    it('both ask about falls', () => {
        expect(src('AuraChat.jsx')).toMatch(/have you had a fall/i);
        expect(src('ConventionalForm.jsx')).toMatch(/have you had a fall/i);
    });

    it('both ask about Healthier SG enrolment', () => {
        expect(src('AuraChat.jsx')).toMatch(/enrolled with a Healthier SG GP/i);
        expect(src('ConventionalForm.jsx')).toMatch(/enrolled with a Healthier SG GP/i);
    });

    /**
     * Both gate falls on 60+. The form knows the age already; the chat has to decide
     * mid-conversation and goes through `chatSteps.js`. Different plumbing, and now
     * the same rule underneath it — if one drifts, the cohorts stop matching.
     *
     * ⚠️ THE GATE IS `isSixtyPlus`, AND ASSERTING THAT IS THE POINT — this test used
     *    to require the two ORIGINAL implementations, a `/60\s*\+/` regex in the chat
     *    and an `f.ageGroup === '60+'` comparison in the form. Both were substring
     *    tests that only ever recognised the chip text, so the test was pinning the
     *    `CP26` defect in place: a person who TYPED "72" was not asked about falls in
     *    either pathway, and a test that says "both do it this way" is satisfied by
     *    both doing it wrong.
     */
    it('both gate the falls question with the shared age parser', () => {
        ['AuraChat.jsx', 'ConventionalForm.jsx'].forEach((file) => {
            expect(src(file), file).toMatch(/isSixtyPlus\(/);
        });
        expect(src('AuraChat.jsx'), 'the chat must not re-introduce a substring test for the chip text')
            .not.toMatch(/when:\s*\(data\)\s*=>\s*\/60/);
        expect(src('ConventionalForm.jsx'), 'the form must not compare against the chip text')
            .not.toMatch(/ageGroup === '60\+'/);
    });

    /**
     * Both use the SAME parser. Two pathways deriving one flag two ways is exactly
     * how CP9 happened, which is why `parseFallsAnswer` lives in `clinicalFlags.js`
     * rather than in either component.
     */
    it('both use the shared parsers rather than their own', () => {
        ['AuraChat.jsx', 'ConventionalForm.jsx'].forEach((file) => {
            expect(src(file), file).toMatch(/parseFallsAnswer/);
            expect(src(file), file).toMatch(/parseHealthierSg/);
        });
    });
});
