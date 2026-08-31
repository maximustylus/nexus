'use strict';

/**
 * ==============================================================================
 * MODEL QUOTA — `AU30`: a model the key can SEE is not a model the key can USE
 * ==============================================================================
 *
 * Found in production on 2026-08-28, on the owner's own screen. `resolveModel()`
 * asks the ListModels endpoint what exists and picks the best match from
 * `MODEL_PRIORITY` — but ListModels answers by VISIBILITY, and Google's free
 * tier lists `gemini-2.5-pro` while granting it ZERO generate quota
 * (`limit: 0` in the refusal — not "exhausted today", none at all). So a
 * free-tier key resolved to a model every call would 429 on, the resolution was
 * cached for the container's life, and the assistant returned 500 on every
 * turn. Worse, the raw upstream refusal — quota metric names, billing URLs —
 * was concatenated into the `HttpsError` and shipped to the browser console,
 * which is the "stop forwarding upstream error text" half of ledger row 6.6,
 * demonstrated live.
 *
 * This module is the pure half of the fix, dependency-free so `npm test`
 * exercises it (the `rateLimit.js` / `retention.cjs` arrangement):
 *
 *   - recognise a quota refusal (`isQuotaExhausted`),
 *   - remember, per container, which models refused (`createDemotions` — with a
 *     TTL, because a PAID key's exhaustion recovers even though a free key's
 *     `limit: 0` never does; a warm container should eventually re-try),
 *   - pick the best model that has not refused (`nextUsable`),
 *   - and phrase the client-facing failure WITHOUT the upstream text
 *     (`clientMessage`) — the detail belongs in the server logs, which keep it.
 *
 * `index.js` owns the impure half: one `geminiGenerate` helper that all four
 * callables route through, which demotes on a quota refusal and retries the
 * SAME request body once on the next usable model. One retry, not a loop: a
 * second refusal means the tier itself is the problem, and looping through
 * four models would quadruple the latency of every failure.
 */

/** Priority order. Full resource names everywhere below ('models/…'). */
const MODEL_PRIORITY = [
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
];
const SAFE_FALLBACK_MODEL = 'models/gemini-1.5-flash';

/**
 * A paid key's quota refills; a free key's `limit: 0` does not. Thirty minutes
 * is long enough that a genuinely dead model costs one wasted probe per
 * half-hour per warm container, short enough that a refilled paid quota is
 * picked back up without a redeploy.
 */
const DEMOTION_TTL_MS = 30 * 60 * 1000;

/**
 * Whether a generateContent refusal is a quota refusal. HTTP 429, or the
 * error body's canonical status — Google sends `RESOURCE_EXHAUSTED` for both
 * the per-minute and the tier (`limit: 0`) cases.
 */
const isQuotaExhausted = (status, body) => {
    if (status === 429) return true;
    const errStatus = body && body.error && body.error.status;
    return errStatus === 'RESOURCE_EXHAUSTED';
};

/**
 * Per-container registry of models that refused for quota. A factory rather
 * than module state, so tests get a fresh one and `now` is always an argument
 * — the `retention.cjs` rule: a boundary a test cannot reach is not exercised.
 */
const createDemotions = (ttlMs = DEMOTION_TTL_MS) => {
    const demotedAt = new Map();
    return {
        demote(model, now) {
            demotedAt.set(model, now.getTime ? now.getTime() : now);
        },
        isDemoted(model, now) {
            const at = demotedAt.get(model);
            if (at === undefined) return false;
            const nowMs = now.getTime ? now.getTime() : now;
            if (nowMs - at >= ttlMs) {
                demotedAt.delete(model);
                return false;
            }
            return true;
        },
        /** For logs and tests. */
        active(now) {
            const nowMs = now.getTime ? now.getTime() : now;
            return [...demotedAt.entries()]
                .filter(([, at]) => nowMs - at < ttlMs)
                .map(([model]) => model);
        },
    };
};

/**
 * The best model not currently demoted, in priority order; the fallback if
 * every priority model is demoted but the fallback is not; null when
 * everything has refused — the caller then reports the failure rather than
 * burning a fourth request on a fourth refusal.
 */
const nextUsable = (demotions, now) => {
    for (const candidate of MODEL_PRIORITY) {
        const full = 'models/' + candidate;
        if (!demotions.isDemoted(full, now)) return full;
    }
    if (!demotions.isDemoted(SAFE_FALLBACK_MODEL, now)) return SAFE_FALLBACK_MODEL;
    return null;
};

/**
 * What the browser is told. Upstream text stays OUT: quota refusals carry
 * billing URLs and project metric names, and 500 bodies can carry anything.
 * The server logs keep the full detail (status, upstream message, model) —
 * this is the public sentence, one definition for all four callables.
 */
const clientMessage = (status) => {
    if (status === 429) {
        return 'AURA\'s AI service is over its usage allowance right now. Please try again in a '
            + 'few minutes; if this keeps happening, the administrator needs to review the AI '
            + 'service plan.';
    }
    return 'AURA could not complete this request because the AI service returned an error. '
        + 'Nothing you typed caused this, and the details are recorded in the server logs. '
        + 'Please try again.';
};

module.exports = {
    MODEL_PRIORITY, SAFE_FALLBACK_MODEL, DEMOTION_TTL_MS,
    isQuotaExhausted, createDemotions, nextUsable, clientMessage,
};
