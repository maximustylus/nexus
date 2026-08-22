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
 */

import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { toSector, UNKNOWN_SECTOR } from './singapore/postalSectors';

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

        const docRef = await addDoc(collection(db, 'community_assessments'), assessmentData);

        console.log('[NEXUS Telemetry] Recorded. Document ID:', docRef.id);
        return true;
    } catch (error) {
        // Swallowed on purpose — see the header. The visitor must reach their result.
        console.error('[NEXUS Telemetry] Transmission failed:', error);
        return false;
    }
};
