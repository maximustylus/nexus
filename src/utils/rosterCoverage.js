/**
 * ==============================================================================
 * COVERAGE REQUESTS — THE ROSTER'S OWN INBOX, AS PURE FUNCTIONS
 * ==============================================================================
 *
 * A coverage request used to arrive as a chat message. `AuraPulseBot` subscribed
 * to `shift_swaps`, force-opened the AI panel with a `ROSTER_ALERT` bubble, and
 * the colleague being asked to cover a clinical shift had to find and answer it
 * inside a conversation with a wellbeing assistant. This module is the data half
 * of moving that surface into the roster, where the shift is.
 *
 * WHAT IS HERE AND WHAT IS NOT. Everything in this file is pure: it reads a
 * Firestore query snapshot into plain objects, decides which requests are still
 * outstanding, matches a request to a calendar square, and writes the sentence
 * that describes it. It contains NO mutation logic whatsoever — the decision of
 * how a roster changes when a request is accepted stays in `auraEngine`'s
 * `planSwapApplication` / `findAppliedSwapShift`, which are verified, locked, and
 * imported by the view read-only. There is deliberately no second opinion about
 * substitution semantics anywhere in this file.
 *
 * NOTHING IS DROPPED. `readCoverageRequests` keeps every document the query
 * returned, including one whose fields are missing or malformed, and
 * `canAnswerCoverageRequest` explains — in a sentence a clinician can act on —
 * why a particular one cannot be answered. A request that silently disappeared
 * from this list would be a shift nobody covers and nobody is told about, which
 * is the exact failure (M5) this whole surface exists to close. The only thing
 * this module ever removes is a request THIS SESSION has already answered.
 *
 * DETERMINISTIC. No `Date.now()`, no `Math.random()`, no `toISOString()`; date
 * keys are formatted by `formatRosterDateKey`, which parses `YYYY-MM-DD` from its
 * parts. Dates were a real bug class in this subsystem (post-mortem B2).
 * ==============================================================================
 */

import {
    formatRosterDateKey,
    describeShiftRole,
    SHIFT_ROLES,
} from './auraEngine.js';

/**
 * A non-empty string exactly as stored, or `null` — the rule `auraEngine`'s own
 * `asName` follows.
 *
 * VERBATIM ON PURPOSE for every identity field. `planSwapApplication` compares
 * `originalTask` against `shift.task` and `requestedBy` against the shift's
 * `lead`/`coLead` with `===`, so a helpful trim here would be a normalisation the
 * mutator does not perform, and a task legitimately stored with a trailing space
 * would stop matching the roster it came from.
 */
const asName = (value) => (typeof value === 'string' && value.trim() !== '' ? value : null);

/** A trimmed non-empty string, or `null`. For values that are only ever shown. */
const asText = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

/**
 * The `shift_swaps` fields this surface reads, normalised off a query snapshot.
 *
 * Each entry is `{ docId, requestedBy, targetStaff, originalShiftDate,
 * originalTask, swapRole, initiatedBy, reason }`. `docId` is `null` when the
 * snapshot document had no id — impossible in Firestore, and kept rather than
 * filtered because an unanswerable request must still be VISIBLE with a reason
 * (see `canAnswerCoverageRequest`) rather than vanishing.
 *
 * The raw document is preserved on `raw` so nothing downstream has to re-read the
 * snapshot, and so a field this surface does not know about cannot be lost on the
 * way to `planSwapApplication`, which is handed the normalised object.
 *
 * Duplicate ids are collapsed, keeping the first: a re-subscribe that delivered
 * the same document twice must not produce two Accept buttons for one shift —
 * the same hazard `appendRosterAlert` was written for in the chat surface.
 */
export const readCoverageRequests = (snapshot) => {
    const docs = snapshot && Array.isArray(snapshot.docs) ? snapshot.docs : [];
    const seen = new Set();
    const out = [];

    for (const entry of docs) {
        if (!entry || typeof entry !== 'object') continue;

        const docId = asText(entry.id);
        if (docId !== null) {
            if (seen.has(docId)) continue;
            seen.add(docId);
        }

        const data = typeof entry.data === 'function' ? entry.data() : null;
        const fields = data && typeof data === 'object' ? data : {};

        out.push({
            docId,
            requestedBy: asName(fields.requestedBy),
            targetStaff: asName(fields.targetStaff),
            originalShiftDate: asName(fields.originalShiftDate),
            originalTask: asName(fields.originalTask),
            swapRole: SHIFT_ROLES.includes(fields.swapRole) ? fields.swapRole : null,
            initiatedBy: asName(fields.initiatedBy),
            reason: asText(fields.reason),
            raw: fields,
        });
    }

    return out;
};

/**
 * The requests still awaiting an answer, given the ones this session answered.
 *
 * The listener query is `status == 'PENDING'`, so Firestore drops an answered
 * request on its own — but not instantly, and the gap between "the write
 * resolved" and "the snapshot arrived" is long enough to press Accept twice.
 * `answered` closes that window locally. A request whose acceptance FAILED is
 * never in `answered`: it is still pending, and it must stay actionable.
 */
export const pendingCoverageRequests = (requests, answered) => {
    const list = Array.isArray(requests) ? requests : [];
    if (!answered || typeof answered.has !== 'function') return list;
    return list.filter((request) => !(request?.docId && answered.has(request.docId)));
};

/**
 * The requests that refer to one calendar square's shift.
 *
 * Matched on date + task, which is what `planSwapApplication` looks the shift up
 * by. It deliberately does NOT also check that the requester still holds the
 * duty: the badge's claim is "somebody has asked you to cover this shift", and a
 * roster that has since changed underneath the request is a fact the ACCEPT path
 * reports with the binding constraint named — hiding the badge would hide the
 * request instead of explaining it.
 */
export const coverageRequestsForShift = (requests, dateKey, shift) => {
    const date = asName(dateKey);
    const task = asName(shift?.task);
    if (!date || !task) return [];

    return (Array.isArray(requests) ? requests : []).filter(
        (request) => request?.originalShiftDate === date && request?.originalTask === task,
    );
};

/**
 * Can this request be answered at all, and if not, why not?
 *
 * This is a check on the LEDGER DOCUMENT, not on the roster: whether the roster
 * still supports the substitution is `planSwapApplication`'s judgment, made
 * against the document it reads at accept time, and it is not second-guessed
 * here. Two things make a request unanswerable no matter what the roster says:
 * no id to write the outcome to, and no shift identified to hand over.
 *
 * A MISSING `swapRole` IS NOT ONE OF THEM. Requests created before that field
 * existed (post-mortem A3) simply lack it, and `planSwapApplication` matches
 * those on identity alone — so refusing them here would strand exactly the
 * documents the mutator was made tolerant for.
 */
export const canAnswerCoverageRequest = (request) => {
    if (!request || typeof request !== 'object') {
        return { ok: false, reason: 'There is no coverage request here to answer.' };
    }
    if (!asText(request.docId)) {
        return {
            ok: false,
            reason: 'This coverage request has no ledger id, so AURA cannot record an answer against it. Ask an administrator to look at the shift_swaps collection.',
        };
    }
    if (!request.requestedBy || !request.originalShiftDate || !request.originalTask) {
        return {
            ok: false,
            reason: 'This coverage request does not say which shift it refers to (it is missing the requester, the date or the duty), so there is nothing AURA can hand over. Ask an administrator to look at it.',
        };
    }
    return { ok: true, reason: null };
};

/**
 * One request, in a sentence — the same facts the ledger holds, in the order a
 * clinician reads them: who is asking, which duty, which day.
 *
 * `swapRole` becomes "lead" / "co-lead" through `describeShiftRole`, the same
 * wording the request modal uses, so the person who sent it and the person
 * answering it are reading one vocabulary. A request with no recorded duty says
 * so rather than printing "unknown duty" as though it were a duty.
 */
export const describeCoverageRequest = (request) => {
    const check = canAnswerCoverageRequest(request);
    if (!check.ok) return check.reason;

    const duty = SHIFT_ROLES.includes(request.swapRole)
        ? `as ${describeShiftRole(request.swapRole)}`
        : 'in the duty they hold (this request does not record which one, so AURA will read it off the roster)';

    return `${request.requestedBy} asks you to cover ${request.originalTask} on ${formatRosterDateKey(request.originalShiftDate)}, ${duty}.`;
};

/**
 * Who arranged this request, when it was not the person being swapped out.
 *
 * `initiatedBy` is written only for an admin-brokered request (M11), and its
 * absence is load-bearing — it is how a self-request stays byte-identical to the
 * pre-M11 document shape. Returns `null` when nobody else arranged it, so the
 * caller renders nothing rather than an empty line.
 */
export const describeCoverageArranger = (request) => {
    const arranger = asName(request?.initiatedBy);
    const subject = asName(request?.requestedBy);
    if (!arranger || !subject || arranger === subject) return null;
    return `Arranged by ${arranger} on ${subject}'s behalf.`;
};
