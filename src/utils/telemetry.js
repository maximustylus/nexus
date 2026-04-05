import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export const recordTelemetry = async (postalSector, payload) => {
    try {
        const assessmentData = {
            ...payload,
            postalSector: postalSector || '00',
            createdAt: serverTimestamp(),
            clientReference: navigator.userAgent
        };

        const docRef = await addDoc(collection(db, 'community_assessments'), assessmentData);
        
        console.log('[NEXUS Telemetry] Data securely anchored. Document ID:', docRef.id);
        return true;
    } catch (error) {
        console.error('[NEXUS Telemetry] Transmission failed:', error);
        return false;
    }
};
