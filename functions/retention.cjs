'use strict';

/**
 * ==============================================================================
 * RETENTION — the 24-month promise, as code rather than as a sentence
 * ==============================================================================
 *
 * The community portal tells every visitor, before they answer anything:
 *
 *     "Records are deleted automatically after 24 months."
 *
 * ⚠️ A RETENTION NOTICE THAT NOTHING ENFORCES IS THE SAME CLASS OF DEFECT AS THE
 *    DE-IDENTIFICATION CLAIM THIS PROJECT ALREADY SHIPPED AND HAD TO FIX. That one
 *    (`CP3`) promised the record carried nothing identifying while
 *    `clientReference: navigator.userAgent` was being written beside it. Saying
 *    "24 months" while records accumulate forever is the same promise-without-a-
 *    mechanism, and it is worse for being harder to notice.
 *
 * So the period lives here, once, next to the thing that acts on it — and the
 * decision logic is a pure function with no `firebase-admin` import so `npm test`
 * exercises it. Same arrangement as `teamApproval.js` and `communityAck.js`.
 *
 * ── WHY THIS COLLECTION CAN SIMPLY BE DELETED ────────────────────────────────
 *
 * `community_assessments` holds no identity by design — no name, no NRIC, no
 * contact, and since `CP3` no user-agent either. There is nobody to notify and no
 * account to close, so expiry needs no consent flow: it is a scheduled truncation
 * of a de-identified table.
 *
 * ⚠️ AND THAT IS ALSO WHY IT IS IRREVERSIBLE. A deleted assessment cannot be
 *    restored from anything the person holds, because the person holds nothing
 *    that links to it. If population analysis needs longer than 24 months, the
 *    answer is to aggregate BEFORE expiry — never to quietly extend the period
 *    past what the notice says.
 */

/** The period stated in the privacy notice. Changing it means changing that text too. */
const RETENTION_MONTHS = 24;

/**
 * Firestore's per-batch write limit. Deleting in batches keeps a large sweep from
 * failing wholesale — a partial sweep is fine, because the next run finishes it.
 */
const DELETE_BATCH_SIZE = 400;

/**
 * The instant before which a record has expired.
 *
 * Takes `now` as an argument rather than calling `Date.now()`, so the boundary can
 * be tested at all — and so a test cannot pass merely because it ran on a
 * convenient day.
 *
 * @param {Date} now
 * @param {number} months
 * @returns {Date}
 */
const expiryCutoff = (now, months = RETENTION_MONTHS) => {
    const cutoff = new Date(now.getTime());
    cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
    return cutoff;
};

/**
 * Whether one record has expired.
 *
 * ⚠️ A RECORD WITH NO USABLE `createdAt` IS **NOT** DELETED. Treating a missing
 *    timestamp as "old" would delete exactly the records whose age is unknown,
 *    which is the set most likely to be a write bug rather than genuinely old
 *    data. It is reported instead, so somebody can look. Erring toward keeping is
 *    recoverable; erring toward deleting is not.
 *
 * @param {{createdAt?: {toDate?: () => Date}|Date}} record
 * @param {Date} cutoff
 * @returns {{expired: boolean, reason: 'older-than-cutoff'|'within-retention'|'no-timestamp'}}
 */
const classifyRecord = (record, cutoff) => {
    const raw = record && record.createdAt;
    let created = null;
    if (raw && typeof raw.toDate === 'function') created = raw.toDate();
    else if (raw instanceof Date) created = raw;
    else if (typeof raw === 'number') created = new Date(raw);

    if (!created || Number.isNaN(created.getTime())) {
        return { expired: false, reason: 'no-timestamp' };
    }
    return created < cutoff
        ? { expired: true, reason: 'older-than-cutoff' }
        : { expired: false, reason: 'within-retention' };
};

/** Splits ids into batches Firestore will accept in one commit. */
const intoBatches = (ids, size = DELETE_BATCH_SIZE) => {
    const batches = [];
    for (let i = 0; i < ids.length; i += size) batches.push(ids.slice(i, i + size));
    return batches;
};

/**
 * Decides what a sweep should do, given the records it read. Pure: it returns a
 * plan, and the caller performs it — so the plan can be asserted without a
 * database, and a dry run is the same code path as a real one.
 *
 * @param {Array<{id: string, data: object}>} records
 * @param {Date} now
 * @returns {{toDelete: string[], kept: number, undated: string[], cutoff: Date}}
 */
const planSweep = (records, now, months = RETENTION_MONTHS) => {
    const cutoff = expiryCutoff(now, months);
    const toDelete = [];
    const undated = [];
    let kept = 0;

    (records || []).forEach(({ id, data }) => {
        const { expired, reason } = classifyRecord(data, cutoff);
        if (expired) toDelete.push(id);
        else if (reason === 'no-timestamp') undated.push(id);
        else kept += 1;
    });

    return { toDelete, kept, undated, cutoff };
};

module.exports = {
    RETENTION_MONTHS, DELETE_BATCH_SIZE,
    expiryCutoff, classifyRecord, intoBatches, planSweep,
};
