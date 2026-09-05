/**
 * ==============================================================================
 * `AU33` — WHEN A "CHANGE ONLY X" EDIT COMES BACK SHORTER, SAY SO
 * ==============================================================================
 *
 * P8.8 turn 8, four live runs out of four: asked to turn an SOP into a memo and
 * "change only what that requires", AURA condensed the body and reported
 * *"I kept the procedural steps exactly the same"*. Two prompt rules were
 * written for it — the second naming the failure explicitly ("do not shorten,
 * merge, condense or summarise; if you did, say so and never say the same") —
 * and the model ignored both, every run. A rule in a prompt is a request to a
 * model, not a control (`AURA-GUARDRAILS.md` §B), and this request is not being
 * honoured.
 *
 * So the application states the fact the model left out. It does NOT rewrite the
 * model's words, judge intent, or accuse: it appends one sentence that is true
 * whether or not the shortening was wanted. The worst false positive is a
 * harmless measurement.
 *
 * ⚠️ CLIENT-SIDE, AND HERE IS WHY. The obvious home for this is `chatWithAura`,
 *    beside the `AU31` backstop. It cannot go there: the request carries
 *    `history` as `{role, parts:[{text}]}` built from each message's REPLY only
 *    (`AuraPulseBot.jsx`), so the previous DOCUMENT never reaches the server.
 *    Putting it server-side would mean a callable payload change and a client
 *    change to populate it — for a note the client can compute from data it
 *    already holds. This is a truthfulness note to the person reading the chat,
 *    not an authorization decision, so the client is the honest place for it.
 *    `scripts/verify-guardrail-turns.mjs` imports this same module, so the rule
 *    is verified on every live run rather than asserted.
 */

/** Below this ratio of the previous document's length, the note fires. */
export const SHRINK_THRESHOLD = 0.7;

/**
 * The user asked for a targeted edit — "change only what that requires", "keep
 * everything else", "just make it a memo". These are the phrasings under which a
 * silent condensation is a broken promise rather than a granted request.
 */
export const CHANGE_ONLY_PATTERNS = Object.freeze([
    /\bchange only\b/i,
    /\bonly change\b/i,
    /\bchange nothing else\b/i,
    /\bkeep (?:everything|the rest|all) (?:else\s+)?(?:the same|as is|unchanged)\b/i,
    /\bleave (?:everything|the rest) (?:else\s+)?(?:alone|as is|unchanged)\b/i,
    /\bwithout changing anything else\b/i,
    /\bnothing else\b/i,
    /\bjust (?:make it|turn it into|convert it)\b/i,
    /\bsame content\b/i,
]);

/**
 * The user asked for it SHORTER. When they did, a shorter document is the
 * request being met and there is nothing to report. Checked first, and it wins.
 */
export const ASKS_SHORTER_PATTERNS = Object.freeze([
    /\bshorten\b/i, /\bshorter\b/i, /\bcondense\b/i, /\bsummaris[ez]\b/i, /\bsummary\b/i,
    /\bcut (?:it )?down\b/i, /\btrim\b/i, /\bbrief(?:er)?\b/i, /\bconcise\b/i,
    /\btl;?dr\b/i, /\bone[- ]page\b/i, /\bbullet points?\b/i, /\bfewer\b/i, /\bless detail\b/i,
    /\bhigh[- ]level\b/i, /\boverview\b/i,
]);

export const asksChangeOnly = (text) =>
    CHANGE_ONLY_PATTERNS.some((re) => re.test(String(text ?? '')));

export const asksShorter = (text) =>
    ASKS_SHORTER_PATTERNS.some((re) => re.test(String(text ?? '')));

/** The sentence itself. Marked as the app's, not AURA's, and purely factual. */
export const noteFor = (percent) =>
    `Note from NEXUS: this version is ${percent}% the length of the previous one. `
    + 'You asked for a targeted change, so check that nothing you needed was dropped.';

/**
 * Decide whether to append the note, and what it says.
 *
 * Fires only when ALL of these hold:
 *   1. there is a previous document to compare against,
 *   2. the user asked for a change-only edit and did NOT ask for it shorter,
 *   3. the new document is under `SHRINK_THRESHOLD` of the previous length.
 *
 * @returns {string|null} the sentence to append, or null to leave the reply alone.
 */
export const reworkNote = ({ userText, previousDocument, newDocument } = {}) => {
    const prev = String(previousDocument ?? '');
    const next = String(newDocument ?? '');
    if (prev.trim().length === 0 || next.trim().length === 0) return null;

    const text = String(userText ?? '');
    if (asksShorter(text)) return null;
    if (!asksChangeOnly(text)) return null;

    const ratio = next.length / prev.length;
    if (ratio >= SHRINK_THRESHOLD) return null;

    return noteFor(Math.round(ratio * 100));
};

/** Append the note to a reply, or return the reply untouched. */
export const withReworkNote = (reply, note) =>
    (note ? `${String(reply ?? '').trimEnd()}\n\n${note}` : reply);
