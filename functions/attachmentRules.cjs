'use strict';

/**
 * ==============================================================================
 * ATTACHMENT BOUNDS — `AU15` / `AU17`, the code half, in a module tests can reach
 * ==============================================================================
 *
 * `chatWithAura` accepted five files of ANY size and ANY declared type; the count
 * was the only bound, and nothing logged that a file passed through at all. No
 * client currently sends attachments — the field is capability-in-waiting for
 * MODE 4 — so these bounds break nobody and define the contract BEFORE a UI
 * exists rather than after one ships against the unbounded behaviour.
 *
 * Pure and dependency-free for the same reason as `communityAck.js`,
 * `rateLimit.js` and `teamApproval.js`: this is a security boundary, and a
 * boundary `npm test` cannot exercise without credentials is a boundary nobody
 * exercises. `index.js` maps the returned message onto an `HttpsError`.
 *
 * ⚠️ WHAT THIS IS NOT: a PDPA control, and it must not be described as one. Size
 *    and type say nothing about what is IN a file — that is the P6 gap
 *    `AURA-GUARDRAILS.md` §B declares, and it stays declared. This is a cost
 *    bound and (with the log in `index.js`) an audit trail.
 *
 * ⚠️ THE DECLARED TYPE IS CALLER-CONTROLLED and is not verified against the
 *    bytes — Gemini does its own sniffing on the other side. The allowlist still
 *    shrinks the surface from "anything" to the five formats MODE 4 plausibly
 *    needs: papers and page images. Widening it is one line and one test, when a
 *    real need shows up.
 */

/** Sizes are BASE64 characters — what crosses the wire and what the model bills. */
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_CHARS = 5600000;        // ~4 MB of file, per attachment
const MAX_ATTACHMENT_TOTAL_CHARS = 11200000; // ~8 MB of file, per request

const ALLOWED_ATTACHMENT_TYPES = Object.freeze([
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain',
]);

/**
 * Standard base64, optionally padded. Deliberately NOT base64url (`-`/`_`):
 * Gemini's `inlineData` takes standard encoding, so accepting the url alphabet
 * here would pass validation and fail at the billed API instead.
 */
const BASE64_SHAPE = /^[A-Za-z0-9+/]+={0,2}$/;

const mb = (chars) => Math.floor((chars * 3) / 4 / 1048576);

/**
 * `{ ok: true }`, or `{ ok: false, message }` with a sentence fit for the caller.
 * `undefined` attachments are fine — the field is optional and absent for every
 * current client.
 */
const checkAttachments = (attachments) => {
    if (attachments === undefined) return { ok: true };
    if (!Array.isArray(attachments)) {
        return { ok: false, message: 'attachments must be an array.' };
    }
    if (attachments.length > MAX_ATTACHMENTS) {
        return { ok: false, message: 'Maximum ' + MAX_ATTACHMENTS + ' attachments allowed per request.' };
    }

    let totalChars = 0;
    for (const att of attachments) {
        if (!att || typeof att.mimeType !== 'string' || typeof att.data !== 'string' || att.data === '') {
            return { ok: false, message: 'Attachments must include mimeType and base64 data.' };
        }
        if (!ALLOWED_ATTACHMENT_TYPES.includes(att.mimeType)) {
            return {
                ok: false,
                message: 'Attachment type ' + att.mimeType.slice(0, 60) + ' is not accepted. Allowed: '
                    + ALLOWED_ATTACHMENT_TYPES.join(', ') + '.',
            };
        }
        if (!BASE64_SHAPE.test(att.data)) {
            return { ok: false, message: 'Attachment data must be base64.' };
        }
        if (att.data.length > MAX_ATTACHMENT_CHARS) {
            return { ok: false, message: 'An attachment exceeds the ' + mb(MAX_ATTACHMENT_CHARS) + ' MB limit.' };
        }
        totalChars += att.data.length;
    }
    if (totalChars > MAX_ATTACHMENT_TOTAL_CHARS) {
        return { ok: false, message: 'Attachments together exceed the ' + mb(MAX_ATTACHMENT_TOTAL_CHARS) + ' MB limit.' };
    }
    return { ok: true };
};

/** What the audit log records: shape, never content (`AU17`). */
const attachmentAuditFields = (attachments) => ({
    count: attachments.length,
    types: attachments.map((a) => a.mimeType),
    base64Chars: attachments.map((a) => a.data.length),
});

module.exports = {
    MAX_ATTACHMENTS,
    MAX_ATTACHMENT_CHARS,
    MAX_ATTACHMENT_TOTAL_CHARS,
    ALLOWED_ATTACHMENT_TYPES,
    checkAttachments,
    attachmentAuditFields,
};
