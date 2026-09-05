import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));

const {
    MODEL_PRIORITY,
    SAFE_FALLBACK_MODEL,
    PROBE_BODY,
    classifyProbe,
} = require_('./modelAvailability.cjs');

// ── The list itself ───────────────────────────────────────────────────────────

describe('MODEL_PRIORITY (AU30)', () => {
    /**
     * The models that were in the list when this defect was found. All three had
     * already been withdrawn — they did not appear in `GET /v1beta/models` at all —
     * so `resolveModel()` matched nothing and returned a fallback that was ALSO
     * one of them. Naming them here means a future edit cannot quietly restore a
     * dead model.
     */
    const WITHDRAWN = ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];

    it.each(WITHDRAWN)('does not offer the withdrawn %s', (dead) => {
        expect(MODEL_PRIORITY).not.toContain(dead);
    });

    it('does not name the withdrawn models as the fallback either', () => {
        for (const dead of WITHDRAWN) {
            expect(SAFE_FALLBACK_MODEL).not.toBe(`models/${dead}`);
        }
    });

    /**
     * The fallback is reached when discovery fails, which is exactly when nobody
     * is watching. If it named a model absent from the candidate list, no probe
     * and no test would ever touch it — which is how `gemini-1.5-flash` stayed in
     * this file for months after Google withdrew it.
     */
    it('the fallback is itself one of the candidates', () => {
        expect(SAFE_FALLBACK_MODEL.startsWith('models/')).toBe(true);
        expect(MODEL_PRIORITY).toContain(SAFE_FALLBACK_MODEL.replace('models/', ''));
    });

    it('has no duplicates and no empty entries', () => {
        expect(new Set(MODEL_PRIORITY).size).toBe(MODEL_PRIORITY.length);
        for (const m of MODEL_PRIORITY) {
            expect(typeof m).toBe('string');
            expect(m.trim()).toBe(m);
            expect(m.length).toBeGreaterThan(0);
            expect(m.startsWith('models/')).toBe(false); // bare ids; the caller prefixes
        }
    });

    it('leads with a pro tier — AURA reasons under a strict JSON contract', () => {
        expect(MODEL_PRIORITY[0]).toContain('pro');
    });
});

// ── Reading a probe ───────────────────────────────────────────────────────────

describe('classifyProbe (AU30)', () => {
    it.each([[200], [201], [299]])('%i means the model answered', (status) => {
        expect(classifyProbe(status, '')).toBe('yes');
    });

    it('404 is a refusal that retrying will not change', () => {
        expect(classifyProbe(404, '')).toBe('no');
    });

    it('the real refusal Google sends for a retired model demotes it', () => {
        const body = JSON.stringify({
            error: {
                message: 'This model models/gemini-2.5-pro is no longer available to new users.',
            },
        });
        expect(classifyProbe(400, body)).toBe('no');
    });

    /**
     * ⚠️ THE ASYMMETRY THIS FUNCTION EXISTS FOR. A wrong `'no'` demotes the best
     *    model for the life of a warm container — hours. A wrong `'unknown'`
     *    costs one re-check. So every ambiguous 4xx resolves to `'unknown'`.
     */
    it.each([
        ['400 with no explanation', 400, ''],
        ['400 about something else', 400, 'Invalid JSON payload received.'],
        ['403 with no explanation', 403, ''],
        ['401 unauthorised', 401, 'API key not valid'],
        ['400 with a null body', 400, null],
        ['400 with an undefined body', 400, undefined],
    ])('%s is unknown, not a demotion', (_label, status, body) => {
        expect(classifyProbe(status, body)).toBe('unknown');
    });

    /**
     * A 429 or a 502 can carry any prose at all — an overload page, a proxy's
     * HTML. It must never be read as a statement about the model.
     */
    it.each([
        ['429 rate limit', 429],
        ['500 server error', 500],
        ['503 overloaded', 503],
    ])('%s is unknown even when the body says "not found"', (_label, status) => {
        expect(classifyProbe(status, 'not found — is not available')).toBe('unknown');
    });

    it.each([
        ['undefined', undefined],
        ['null', null],
        ['a string', '200'],
        ['NaN', NaN],
        ['an object', {}],
    ])('a %s status is unknown rather than throwing', (_label, status) => {
        expect(classifyProbe(status, '')).toBe('unknown');
    });
});

describe('PROBE_BODY', () => {
    it('is the smallest generation that still proves generation', () => {
        expect(PROBE_BODY.contents[0].parts[0].text.length).toBeLessThan(20);
        expect(PROBE_BODY.generationConfig.maxOutputTokens).toBeLessThanOrEqual(16);
        expect(JSON.stringify(PROBE_BODY)).toContain('"role":"user"');
    });
});

// ── The deployed function must actually use the probe ─────────────────────────

describe('resolveModel wires the probe in (AU30 + AU16)', () => {
    const src = readFileSync(resolve(HERE, 'index.js'), 'utf8');
    const fn = src.slice(
        src.indexOf('async function resolveModel'),
        src.indexOf('const MAX_USER_TEXT'),
    );

    it('found the function', () => {
        expect(fn.length).toBeGreaterThan(200);
    });

    /**
     * The defect was returning a discovered model on the strength of the list.
     * A `return match` that is not gated by a verdict is that defect restored.
     */
    it('no discovered model is returned without a verdict', () => {
        expect(fn).toContain('await modelAnswers(match)');
        const firstProbe = fn.indexOf('await modelAnswers(match)');
        const firstReturn = fn.indexOf('return match');
        expect(firstProbe).toBeGreaterThan(-1);
        expect(firstReturn).toBeGreaterThan(firstProbe);
    });

    it("a 'no' verdict continues to the next candidate rather than returning", () => {
        const branch = fn.slice(fn.indexOf("verdict === 'no'"), fn.indexOf("Probe inconclusive"));
        expect(branch).toContain('continue');
        expect(branch).not.toContain('return match');
    });

    /**
     * `AU16` again: an inconclusive probe is transient, so the model it serves
     * must not be pinned for the container's life.
     */
    it('the inconclusive path clears the cache before returning', () => {
        const branch = fn.slice(fn.indexOf('Probe inconclusive'));
        const reset = branch.indexOf('modelResolutionPromise = null');
        const ret = branch.indexOf('return match');
        expect(reset).toBeGreaterThan(-1);
        expect(ret).toBeGreaterThan(-1);
        expect(reset).toBeLessThan(ret);
    });

    it('the list and the fallback come from the shared module, not a second copy', () => {
        expect(src).toContain("require('./modelAvailability.cjs')");
        expect(src.match(/const MODEL_PRIORITY = \[/)).toBeNull();
        expect(src.match(/const SAFE_FALLBACK_MODEL = '/)).toBeNull();
    });
});
