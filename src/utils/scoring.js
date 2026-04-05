/**
 * Calculates a weighted clinical risk score based on ACSM guidelines and PAR-Q flags.
 * * Score Mapping:
 * 0-1: Low Risk (Green)
 * 2-4: Moderate Risk (Amber)
 * 5+: High Risk (Red)
 */
export const calculateRiskScore = (data) => {
    let score = 0;

    // 1. Absolute Clinical Contraindications (Highest Priority)
    // Active symptoms like chest pain or loss of balance demand immediate medical clearance.
    if (data.symptomFlag === true) {
        score += 5; 
    }

    // 2. Relative Clinical Contraindications
    // Existing chronic conditions or psychological distress require modified programming.
    if (data.medFlag === true) {
        score += 2;
    }
    if (data.psychoFlag === true) {
        score += 1;
    }

    // 3. Physical Activity Deficits (ACSM Guidelines)
    // Incremental risk added for failing to meet baseline activity levels.
    if (Number(data.pavsMinutes) < 150) {
        score += 1;
    }
    if (Number(data.strengthDays) < 2) {
        score += 1;
    }

    return score;
};
