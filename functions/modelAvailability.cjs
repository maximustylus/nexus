'use strict';

/**
 * ==============================================================================
 * `AU30` — WHICH GEMINI MODEL MAY WE ACTUALLY CALL
 * ==============================================================================
 *
 * A model appearing in `GET /v1beta/models` is NOT permission to call it. A key
 * issued today lists `gemini-2.5-pro` and is then refused at `:generateContent`
 * with "no longer available to new users". `resolveModel()` believed the list,
 * so discovery reported success and the call failed — and the clinician saw a
 * broken assistant rather than a model problem.
 *
 * This module holds the two things that must not drift between the deployed
 * function and `scripts/verify-guardrail-turns.mjs`: the candidate order, and
 * the rule for reading a probe's response. Both import it; neither retypes it.
 */

/**
 * Ordered best-first. AURA does clinical reasoning under a strict JSON contract,
 * so a `pro` tier leads; the `-latest` aliases sit below the pinned names so a
 * silent upstream move is a fallback, never the default.
 *
 * `gemini-2.5-pro` is kept deliberately: keys issued before its retirement may
 * still call it, and this file must not assume every deployment holds a new key.
 * It is simply no longer trusted on the strength of being listed.
 */
const MODEL_PRIORITY = [
    'gemini-3.1-pro-preview',
    'gemini-pro-latest',
    'gemini-2.5-pro',
    'gemini-3.5-flash',
    'gemini-2.5-flash',
    'gemini-flash-latest',
];

/**
 * An ALIAS, deliberately. The fallback this replaces was `models/gemini-1.5-flash`,
 * a pinned version that Google retired — it had vanished from the model list
 * entirely, so the "safe" path led to a 404. A pinned fallback is a fallback with
 * an expiry date. The cost of an alias is that it may move under us, which is why
 * `aiProvenance` records what actually answered.
 *
 * INVARIANT (asserted in the tests): it must be the LAST member of
 * `MODEL_PRIORITY` — a member, so the fallback can never be a name nothing else
 * checks; and last, because `modelQuota.nextUsable()` returns null only once the
 * whole list including the fallback has refused, and that reasoning needs the
 * fallback to be in the list it walks.
 */
const SAFE_FALLBACK_MODEL = 'models/gemini-flash-latest';

/** The smallest generation that still proves the model will generate. */
const PROBE_BODY = {
    contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
    generationConfig: { maxOutputTokens: 16, temperature: 0 },
};

/**
 * Read a probe response.
 *
 *   `'yes'`      it answered — proven, may be cached.
 *   `'no'`       it refused in a way retrying will not change — demote it.
 *   `'unknown'`  a rate limit, an outage, a timeout — say nothing about the model.
 *
 * ⚠️ AMBIGUITY RESOLVES TO `'unknown'`, NEVER `'no'`. A malformed probe, a quota
 *    error and a genuinely dead model all arrive as 4xx. A wrong `'no'` demotes
 *    the best model for the whole life of a warm container — hours — while a
 *    wrong `'unknown'` costs one re-check on the next call. The asymmetry is the
 *    entire reason this function exists rather than `if (!res.ok) skip`.
 *
 * @param {number} status   HTTP status.
 * @param {string} [body]   Raw response body, if read.
 * @returns {'yes'|'no'|'unknown'}
 */
function classifyProbe(status, body) {
    if (typeof status !== 'number' || !Number.isFinite(status)) return 'unknown';
    if (status >= 200 && status < 300) return 'yes';
    if (status === 404) return 'no';

    // 429 and 5xx are transient by definition and are never allowed to demote
    // HERE, whatever prose they carry — an overload page can say anything. The
    // caller may layer a quota rule on top (`index.js` does, because its
    // demotions expire); this function stays pure and conservative.
    if (status === 429 || status >= 500) return 'unknown';

    const text = typeof body === 'string' ? body : '';
    if (/no longer available|is not available|not available to|not found|not supported/i.test(text)) {
        return 'no';
    }
    return 'unknown';
}

module.exports = {
    MODEL_PRIORITY,
    SAFE_FALLBACK_MODEL,
    PROBE_BODY,
    classifyProbe,
};
