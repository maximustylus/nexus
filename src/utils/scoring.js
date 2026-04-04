// A safe placeholder for the AURA Risk Logic
export const calculateRiskScore = (data) => {
    // Basic fallback logic based on the traffic light matrix
    if (data.pavsMinutes === 0 || data.strengthDays === 0) return 'Red';
    if (data.pavsMinutes >= 150 && data.strengthDays >= 2) return 'Green';
    return 'Amber';
};
