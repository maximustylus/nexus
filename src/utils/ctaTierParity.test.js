/**
 * ==============================================================================
 * CTA TIER PARITY — the two pathways must not route to a tier nothing renders
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * WHY THIS IS A SOURCE-TEXT TEST RATHER THAN AN IMPORT TEST
 *
 * The tier names live as object-literal keys inside three large JSX components
 * (`AuraChat`, `ConventionalForm`, `ResultPage`) that pull in jsPDF, html2canvas
 * and the Firebase SDK at module scope. Importing them to read three key sets
 * would mean standing up all of that. The defect this guards is purely that two
 * literal key sets drifted apart, so reading the literals is the honest test.
 *
 * The extraction therefore ASSERTS ITS OWN PARSE before asserting anything about
 * the app: if somebody renames `CTA_BANNER` or restructures the objects, this
 * fails on the parse rather than quietly finding zero tiers and passing.
 *
 * ── THE BUG THIS EXISTS FOR ──────────────────────────────────────────────────
 *
 * `AuraChat.selectCTA` returned `SOCIAL_CARE` for a socially isolated resident
 * aged 60+ — the SECOND rule in its ladder, behind only chest pain, and the
 * highest-priority social routing the tool can make. `ResultPage.CTA_BANNER` had
 * no such key, so `CTA_BANNER[ctaTier] || CTA_BANNER.START` silently substituted
 * the generic banner: "Download the Healthy 365 app". The isolation referral —
 * an Active Ageing Centre and a Silver Generation Office home visit — vanished
 * with no error, for the demographic least able to act on an app-store
 * instruction. `tierPrimaries` missed on the same key and fell through to the
 * risk-tier default.
 *
 * Nothing failed. Nothing logged. The only symptom was the wrong advice.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = (name) => readFileSync(resolve(HERE, '..', 'components', name), 'utf8');

/**
 * Body of the `const NAME = { … }` object literal, found by BRACE MATCHING rather
 * than by indentation. An earlier draft of this file sliced to end-of-file and
 * matched two-space-indented keys, which happily swallowed the inline style
 * objects further down `ResultPage.jsx` and reported `flexDirection` as a CTA
 * tier. A test whose parse is looser than the thing it checks is worse than none.
 */
const objectBody = (text, name) => {
    const marker = `const ${name} = {`;
    const start = text.indexOf(marker);
    if (start === -1) throw new Error(`Could not find \`${marker}\` — did it get renamed?`);
    let depth = 0;
    for (let i = start + marker.length - 1; i < text.length; i += 1) {
        if (text[i] === '{') depth += 1;
        else if (text[i] === '}') {
            depth -= 1;
            if (depth === 0) return text.slice(start + marker.length, i);
        }
    }
    throw new Error(`Unbalanced braces while reading \`${name}\`.`);
};

/** Top-level keys of that literal — the nested ones are per-language copy, not tiers. */
const objectKeys = (text, name) => {
    const body = objectBody(text, name);
    const keys = [];
    let depth = 0;
    body.split('\n').forEach((line) => {
        if (depth === 0) {
            const m = line.match(/^\s*([A-Za-z_]\w*):/);
            if (m) keys.push(m[1]);
        }
        depth += (line.match(/[{[]/g) || []).length - (line.match(/[}\]]/g) || []).length;
    });
    if (keys.length === 0) throw new Error(`Found \`${name}\` but parsed no keys from it.`);
    return keys;
};

/** Every `tier: 'X'` inside AuraChat's CTA library — the tiers the chat can emit. */
const auraChatTiers = () => {
    const tiers = [...src('AuraChat.jsx').matchAll(/^\s*tier: '([A-Z_]+)'/gm)].map((m) => m[1]);
    if (tiers.length === 0) throw new Error('Parsed no `tier:` entries from AuraChat.jsx.');
    return [...new Set(tiers)];
};

/** Every `return 'X'` in ConventionalForm's selectCTA — the tiers the form can emit. */
const conventionalFormTiers = () => {
    const text = src('ConventionalForm.jsx');
    const start = text.indexOf('const selectCTA =');
    if (start === -1) throw new Error('Could not find `const selectCTA =` in ConventionalForm.jsx.');
    const body = text.slice(start, text.indexOf('\n};', start));
    const tiers = [...body.matchAll(/return '([A-Z_]+)'/g)].map((m) => m[1]);
    if (tiers.length === 0) throw new Error('Parsed no tiers from ConventionalForm selectCTA.');
    return [...new Set(tiers)];
};

const bannerTiers     = () => objectKeys(src('ResultPage.jsx'), 'CTA_BANNER');
const actionPlanTiers = () => objectKeys(src('ResultPage.jsx'), 'tierPrimaries');

describe('every tier a pathway can emit is renderable', () => {
    /**
     * ⚠️ THE LOAD-BEARING ASSERTION. `ResultPage` reads `ctaTier` straight off
     *    router state and falls back to START — "download the app and start
     *    exercising" — for anything it does not recognise. That fallback is the
     *    OPPOSITE of the advice for the two tiers that matter most (URGENT and
     *    SOCIAL_CARE), so an unrenderable tier is not a cosmetic gap.
     */
    it('CTA_BANNER covers every tier from BOTH pathways', () => {
        const emitted = new Set([...auraChatTiers(), ...conventionalFormTiers()]);
        const missing = [...emitted].filter((t) => !bannerTiers().includes(t));
        expect(missing, `emitted but unrenderable: ${missing.join(', ')}`).toEqual([]);
    });

    it('tierPrimaries covers every tier from BOTH pathways', () => {
        const emitted = new Set([...auraChatTiers(), ...conventionalFormTiers()]);
        const missing = [...emitted].filter((t) => !actionPlanTiers().includes(t));
        expect(missing, `no resource list for: ${missing.join(', ')}`).toEqual([]);
    });

    /**
     * The reverse direction is a warning, not a defect: a banner nobody routes to
     * is dead content, but nobody is misadvised by it. Asserted anyway, because
     * dead tiers are how a reader is fooled into thinking a route exists.
     */
    it('has no banner for a tier no pathway can produce', () => {
        const emitted = new Set([...auraChatTiers(), ...conventionalFormTiers()]);
        const orphans = bannerTiers().filter((t) => !emitted.has(t));
        expect(orphans, `banner defined but unreachable: ${orphans.join(', ')}`).toEqual([]);
    });
});

describe('the two selectCTA implementations', () => {
    /**
     * `ConventionalForm.jsx:159` claims "Identical to AuraChatbot selectCTA()".
     * They are not, and the difference is exactly the tier that had no banner.
     * This test does not demand they match — the chat deliberately makes one
     * extra distinction — it demands that the difference stays RENDERABLE, and
     * it names the divergence so the comment cannot drift further unnoticed.
     */
    it('differ only by tiers that both ResultPage tables can render', () => {
        const chatOnly = auraChatTiers().filter((t) => !conventionalFormTiers().includes(t));
        expect(chatOnly).toEqual(['SOCIAL_CARE']);
        chatOnly.forEach((tier) => {
            expect(bannerTiers()).toContain(tier);
            expect(actionPlanTiers()).toContain(tier);
        });
    });

    it('agree on the one tier that is an absolute contraindication', () => {
        expect(auraChatTiers()).toContain('URGENT');
        expect(conventionalFormTiers()).toContain('URGENT');
    });
});
