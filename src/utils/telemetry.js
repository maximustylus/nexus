/**
 * ==============================================================================
 * COMMUNITY TELEMETRY — the public portal's only write
 * ==============================================================================
 *
 * Records one completed public health screening. The person writing it has no
 * account, has not signed in, and — until they reach the result page — has not been
 * shown anything about what is kept.
 *
 * ── WHY `clientReference` IS GONE ────────────────────────────────────────────
 *
 * This function used to attach `clientReference: navigator.userAgent` to every
 * record. `ResultPage.jsx` tells the public, in the "Data Governance and Privacy"
 * panel, that:
 *
 *     "All data collected through the NEXUS AURA system is de-identified at the
 *      point of capture … not linked to any identifiable personal information."
 *
 * A full user-agent string is a well-known browser-fingerprinting vector. Beside
 * the postal sector, age band, gender, RACE and housing type these records already
 * carry, it made that sentence untrue — and the panel is rendered on the RESULT
 * page, which is reached AFTER `recordTelemetry` has already run, so it was never
 * consent in the first place; it was a claim made after the fact.
 *
 * Nothing read the field. Grepping `clientReference` across the repository found
 * the write and nothing else. So it bought no debugging and cost the accuracy of a
 * privacy statement shown to members of the public about their own health data.
 *
 * ⚠️ WHAT IS STILL STORED IS NOT NOTHING, and removing one field did not make this
 *    anonymous. Sector + age band + gender + race + housing type remains a
 *    quasi-identifier set in a population this size. Making the notice true, rather
 *    than making the data match the notice, is the larger piece of work — it is
 *    written up in the community post-mortem and is not done here.
 *
 * ── FAILING SILENTLY IS DELIBERATE, AND IS ALSO A PROBLEM ────────────────────
 *
 * The catch swallows. A member of the public who has just spent four minutes on a
 * health assessment must still reach their result if the write fails, so throwing
 * here would be worse. But it means a rules change, an outage or a quota breach
 * produces NO signal anywhere — the pathway looks healthy and records nothing.
 * `firestore.rules` has a matching note; a denied write here is invisible by design.
 *
 * ── ⚠️ AND A CATCH DOES NOT PROTECT AGAINST A HANG. THIS IS THE `CP24` FIX. ──
 *
 * The promise above was AWAITED by both pathways before they navigated the person
 * to their result. A `catch` protects against `addDoc` REJECTING. `addDoc` does not
 * reject when the backend is unreachable — the Firestore SDK queues the write
 * locally and retries, and the promise simply never settles.
 *
 * So the protection this header described did not exist. Measured in headless
 * Chromium with `firestore.googleapis.com` blocked: the chat asked every question,
 * reached "Generating your personalised plan now…", and was STILL THERE 45 SECONDS
 * LATER. The form is the same construct, and its `finally { setBusy(false) }` never
 * ran either, so Submit stayed on "Processing…" — the state that file's own `FIX 4`
 * claims to have fixed. An ad blocker, a corporate network or patchy mobile data is
 * enough to produce it.
 *
 * `WRITE_DEADLINE_MS` is the fix, and it is here rather than at the two call sites
 * deliberately: a caller that forgets to bound this re-creates the defect, and
 * there will be more callers. The write is NOT cancelled when the deadline passes —
 * it stays queued in the SDK and flushes if connectivity returns, which within a
 * single-page app usually means it still lands. What is bounded is how long a
 * person waits to be told about their own health.
 */

import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { toSector, UNKNOWN_SECTOR } from './singapore/postalSectors';

/**
 * How long a visitor may be kept waiting on a write that is not for their benefit.
 *
 * ⚠️ Short on purpose. This budget buys nothing for the person — the record is for
 *    population planning — so the only question is how long is tolerable before
 *    showing them their result anyway. A healthy write completes in well under
 *    this; anything longer is already a degraded network.
 */
export const WRITE_DEADLINE_MS = 1500;

/** A private sentinel, so a resolved value can never be mistaken for a timeout. */
const TIMED_OUT = Symbol('telemetry-write-deadline');

/**
 * Resolves with the promise's value, or with `onDeadline` once `ms` have passed —
 * whichever happens first. The underlying promise is left running.
 *
 * Its rejection is swallowed rather than left unhandled: after the deadline nobody
 * is awaiting it, and an unhandled rejection would surface in the console of a
 * member of the public as if something had broken on their device.
 */
const withDeadline = (promise, ms, onDeadline) => {
    let timer;
    const deadline = new Promise((resolve) => { timer = setTimeout(() => resolve(onDeadline), ms); });
    promise.catch(() => {});
    return Promise.race([promise.finally(() => clearTimeout(timer)), deadline]);
};

export const recordTelemetry = async (postalSector, payload) => {
    try {
        const assessmentData = {
            ...payload,
            // ⚠️ `'--'`, NOT `'00'`. A person who did not give a usable postal
            //    sector must not be recorded as living in one. `'00'` is two digits
            //    and reads as a place — it was the old sentinel, and it flowed
            //    straight into the health-cluster lookup, which resolved it to one
            //    particular cluster. See `UNKNOWN_SECTOR`.
            postalSector: toSector(postalSector) ?? UNKNOWN_SECTOR,
            createdAt: serverTimestamp(),
        };

        // ⚠️ BOUNDED. See `WRITE_DEADLINE_MS` — an unreachable Firestore does not
        //    reject, it hangs, and this call is on the path to the person's result.
        const docRef = await withDeadline(
            addDoc(collection(db, 'community_assessments'), assessmentData),
            WRITE_DEADLINE_MS,
            TIMED_OUT,
        );

        if (docRef === TIMED_OUT) {
            console.warn(`[NEXUS Telemetry] Not acknowledged within ${WRITE_DEADLINE_MS}ms; `
                + 'still queued in the SDK. Continuing so the visitor reaches their result.');
            return false;
        }

        console.log('[NEXUS Telemetry] Recorded. Document ID:', docRef.id);
        return true;
    } catch (error) {
        // Swallowed on purpose — see the header. The visitor must reach their result.
        console.error('[NEXUS Telemetry] Transmission failed:', error);
        return false;
    }
};
