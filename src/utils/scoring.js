/**
 * ==============================================================================
 * CLINICAL RISK SCORE — the community portal's only clinical computation
 * ==============================================================================
 *
 * Turns a completed public health screening into a banded risk figure:
 *
 *     0–1  Low       (Green)
 *     2–4  Moderate  (Amber)
 *     5+   High      (Red)
 *
 * Both public pathways feed it — `ConventionalForm.deriveFlags()` and
 * `AuraChat.parseClinicalData()` — and its output is written to
 * `community_assessments` and shown to a member of the public who has no clinician
 * in the room and no way to tell a wrong number from a right one.
 *
 * ------------------------------------------------------------------------------
 * ⚠️ TWO FIELDS THAT LOOK INTERCHANGEABLE AND ARE NOT
 * ------------------------------------------------------------------------------
 *
 *     pavsMinutes   MINUTES PER SESSION.  Capped at 65 by `MINS_MIDPOINT`.
 *     pavsScore     MINUTES PER WEEK.     days × minutes — the PAVS figure itself.
 *
 * 150 min/week is a WEEKLY threshold, so only `pavsScore` can be compared against
 * it. This function compared `pavsMinutes`.
 *
 * Because 65 < 150 always, the "physical activity deficit" point was added to
 * EVERY respondent who ever completed the assessment, through either pathway. The
 * score could not distinguish somebody doing nothing from somebody doing 390
 * minutes a week — on the single dimension the entire portal is about — while
 * presenting itself as an ACSM-derived risk band. Fixed 2026-08-21; the test suite
 * beside this file exists because of it.
 *
 * ------------------------------------------------------------------------------
 * ⚠️ MISSING DATA IS A DEFICIT, NOT COMPLIANCE
 * ------------------------------------------------------------------------------
 *
 * `Number(undefined)` is `NaN`, and `NaN < 150` is `false` — so an absent field
 * used to add NOTHING, and `calculateRiskScore({})` returned 0: a clean "Low Risk
 * (Green)" for a respondent about whom nothing at all is known.
 *
 * That is the wrong direction for a screening instrument, and it is reachable: the
 * chat pathway builds its input by parsing text a language model produced, so a
 * field can genuinely be missing or unparseable. An unknown is now scored as a
 * deficit. A screening tool that is wrong should be wrong towards caution.
 *
 * ------------------------------------------------------------------------------
 * WHAT THIS IS NOT
 * ------------------------------------------------------------------------------
 *
 * It is a triage aid for routing somebody to the right community programme. It is
 * not a diagnosis, not a clinical decision, and not validated against outcomes. The
 * weights below are a reasonable ordering — a contraindication dominates, a chronic
 * condition outranks distress, both outrank an activity gap — rather than a figure
 * derived from any published scoring system. Nothing in the code claims otherwise
 * and nothing built on it should.
 */

/** A finite number, or `null` for anything that is not one. `null` means UNKNOWN. */
const asNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

export const calculateRiskScore = (data = {}) => {
    let score = 0;

    // ── 1. Absolute contraindication ────────────────────────────────────────
    // Chest pain or dizziness on exertion. Five points puts the result in the High
    // band on its own, whatever else is true — which is the intent: nothing about
    // being otherwise fit and well should mask this.
    if (data.symptomFlag === true) score += 5;

    // ── 2. Relative contraindications ───────────────────────────────────────
    if (data.medFlag === true) score += 2;      // chronic condition — modified programming
    if (data.psychoFlag === true) score += 1;   // psychological distress

    // ── 3. Activity deficits ────────────────────────────────────────────────
    // `pavsScore`, NOT `pavsMinutes` — see the header. Unknown counts as a deficit.
    const weeklyMinutes = asNumber(data.pavsScore);
    if (weeklyMinutes === null || weeklyMinutes < 150) score += 1;

    // Two sessions a week is the strength guidance the portal cites.
    const strengthDays = asNumber(data.strengthDays);
    if (strengthDays === null || strengthDays < 2) score += 1;

    return score;
};
