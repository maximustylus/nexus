/**
 * `AU30` — quota-aware model fallback, and no upstream text to the browser.
 *
 * The pure half (`modelQuota.cjs`) is tested directly. The impure half — that
 * all four callables actually route through `geminiGenerate` and that no call
 * site forwards `data.error.message` to the client any more — is asserted at
 * source, the `guardrails.test.js` pattern: reaching the deployed function
 * needs credentials no test has, but the wiring is a property of the file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    MODEL_PRIORITY, SAFE_FALLBACK_MODEL, DEMOTION_TTL_MS,
    isQuotaExhausted, createDemotions, nextUsable, clientMessage,
} from './modelQuota.cjs';

describe('isQuotaExhausted — recognising the refusal that started this', () => {
    it('recognises HTTP 429', () => {
        expect(isQuotaExhausted(429, {})).toBe(true);
    });

    it('recognises RESOURCE_EXHAUSTED in the body regardless of status', () => {
        expect(isQuotaExhausted(500, { error: { status: 'RESOURCE_EXHAUSTED' } })).toBe(true);
    });

    it('does not fire on an ordinary failure', () => {
        expect(isQuotaExhausted(500, { error: { status: 'INTERNAL' } })).toBe(false);
        expect(isQuotaExhausted(404, undefined)).toBe(false);
        expect(isQuotaExhausted(200, {})).toBe(false);
    });
});

describe('demotions — per-container memory with a TTL', () => {
    const T0 = new Date('2026-08-28T09:00:00Z');
    const later = (ms) => new Date(T0.getTime() + ms);

    it('a demoted model stays demoted inside the TTL', () => {
        const d = createDemotions();
        d.demote('models/gemini-2.5-pro', T0);
        expect(d.isDemoted('models/gemini-2.5-pro', later(DEMOTION_TTL_MS - 1))).toBe(true);
    });

    it('and recovers after it — a paid quota refills; a redeploy is not the only cure', () => {
        const d = createDemotions();
        d.demote('models/gemini-2.5-pro', T0);
        expect(d.isDemoted('models/gemini-2.5-pro', later(DEMOTION_TTL_MS))).toBe(false);
        expect(d.active(later(DEMOTION_TTL_MS))).toEqual([]);
    });

    it('never demotes by side effect — an unknown model is not demoted', () => {
        const d = createDemotions();
        expect(d.isDemoted('models/gemini-1.5-flash', T0)).toBe(false);
    });
});

describe('nextUsable — the best model that has not refused', () => {
    const NOW = new Date('2026-08-28T09:00:00Z');

    it('with nothing demoted, returns the top of the priority list', () => {
        expect(nextUsable(createDemotions(), NOW)).toBe('models/' + MODEL_PRIORITY[0]);
    });

    it('skips the demoted head — the exact free-tier 2.5-pro case', () => {
        const d = createDemotions();
        d.demote('models/gemini-2.5-pro', NOW);
        expect(nextUsable(d, NOW)).toBe('models/gemini-2.0-flash');
    });

    it('returns null only when every model including the fallback has refused', () => {
        const d = createDemotions();
        for (const m of MODEL_PRIORITY) d.demote('models/' + m, NOW);
        // The fallback is the last priority model; everything is demoted.
        expect(nextUsable(d, NOW)).toBe(null);
    });
});

describe('clientMessage — what the browser is allowed to see', () => {
    it.each([[429], [500], [503]])('status %s carries no upstream artefacts', (status) => {
        const msg = clientMessage(status);
        // The live console error carried all three of these. None may recur.
        expect(msg).not.toMatch(/googleapis|generativelanguage|ai\.google\.dev|ai\.dev|quota exceeded for metric/i);
        expect(msg.length).toBeGreaterThan(40);
    });

    it('the quota flavour tells the user the truth: retrying may not help without the admin', () => {
        expect(clientMessage(429)).toMatch(/administrator/i);
    });
});

describe('the wiring in index.js, asserted at source', () => {
    const src = readFileSync(resolve(process.cwd(), 'functions/index.js'), 'utf8');

    it('all four callables route through geminiGenerate', () => {
        expect((src.match(/await geminiGenerate\(/g) || []).length).toBe(4);
    });

    it('no call site forwards the upstream error message any more', () => {
        // The pattern every one of the four sites used to carry.
        expect(src).not.toMatch(/throw new Error\(\((data|genData)\.error && \1\.error\.message\)/);
    });

    it('the quota retry is single-shot — one retry call inside the helper, no loop', () => {
        const helper = src.slice(src.indexOf('async function geminiGenerate('), src.indexOf('const MAX_USER_TEXT'));
        expect((helper.match(/geminiGenerateOnce\(/g) || []).length).toBe(2);
        expect(helper).not.toMatch(/while|for\s*\(/);
    });

    it('resolveModel skips demoted models', () => {
        const fn = src.slice(src.indexOf('async function resolveModel'), src.indexOf('async function geminiGenerateOnce'));
        expect(fn).toContain('modelDemotions.isDemoted');
    });
});
