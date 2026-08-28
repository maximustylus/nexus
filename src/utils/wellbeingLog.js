/**
 * ==============================================================================
 * WELLBEING LOG SANITISER — `AU9` / `AU10`, pure so `AU24` can test it
 * ==============================================================================
 *
 * The COACH turn ends with the model proposing `{ phase, energy }` for a
 * clinician's wellbeing record. Three things were wrong with how that proposal
 * was handled, and each one wrote fiction into a clinical-adjacent record:
 *
 *   `AU10` — the phase was never validated. `"EXHAUSTED"`, `"ill "` with a
 *   trailing space, or any invented string flowed into `pendingLog` and from
 *   there into the record, where every reader assumes one of four values.
 *
 *   `AU9`, half one — `clampEnergy` passed `NaN` through: `Math.min(79, NaN)`
 *   is `NaN`, so a model that answered `"energy": "quite low"` (coerced upstream)
 *   or omitted the field in a shape the `?? 50` default missed produced a record
 *   whose energy is `NaN` — which then renders as an empty gauge and poisons any
 *   average it enters.
 *
 *   `AU9`, half two — when the model's energy CONTRADICTED its phase (energy 85
 *   with phase ILL), the clamp silently rewrote the number and nothing recorded
 *   that model output disagreed with itself. A correction that leaves no trace
 *   looks identical to the model having been right.
 *
 * This module refuses the invalid, corrects the inconsistent, and REPORTS what
 * it did, so the caller can log the disagreement rather than bury it.
 */

/** The four phases and their energy bands — the same table the UI renders. */
export const PHASE_BANDS = Object.freeze({
    HEALTHY:  Object.freeze({ min: 80, max: 100 }),
    REACTING: Object.freeze({ min: 50, max: 79 }),
    INJURED:  Object.freeze({ min: 20, max: 49 }),
    ILL:      Object.freeze({ min: 0,  max: 19 }),
});

export const VALID_PHASES = Object.freeze(Object.keys(PHASE_BANDS));

/**
 * `null` when the proposal is not loggable (an unknown phase — `AU10`), else:
 *
 *   {
 *     phase:      one of the four, uppercased,
 *     energy:     an integer inside the phase's band, always,
 *     corrected:  true when the stored energy is NOT what the model said,
 *     rawEnergy:  what the model actually said, for the caller's log line
 *   }
 *
 * ⚠️ AN UNUSABLE ENERGY BECOMES THE BAND MIDPOINT, NOT 50. The old default of 50
 *    then clamped meant a missing energy on an ILL turn stored 19 — the very top
 *    of the ILL band, the least-ill reading the phase allows, invented from a
 *    default that belonged to another band. The midpoint is equally invented but
 *    band-consistent, and `corrected: true` says so either way.
 */
export const sanitizeWellbeingLog = ({ phase, energy }) => {
    if (typeof phase !== 'string') return null;
    const key = phase.trim().toUpperCase();
    if (!VALID_PHASES.includes(key)) return null;

    const band = PHASE_BANDS[key];
    const usable = typeof energy === 'number' && Number.isFinite(energy);
    const midpoint = Math.round((band.min + band.max) / 2);

    const clamped = usable
        ? Math.max(band.min, Math.min(band.max, Math.round(energy)))
        : midpoint;

    return {
        phase: key,
        energy: clamped,
        corrected: !usable || clamped !== energy,
        rawEnergy: energy,
    };
};
