/**
 * ==============================================================================
 * CHAT STEPS — which questions this person actually gets asked
 * ==============================================================================
 *
 * The assessment used to be a fixed run of thirteen questions: `currentStep + 1`
 * until the end. Two requirements broke that, and they break it the same way.
 *
 * ── 1. SOME QUESTIONS ONLY APPLY TO SOME PEOPLE ─────────────────────────────
 *
 * A Regional Health System reviewer noted that for the 60+ cohort the portal
 * screens the wrong thing: for somebody being considered for an Active Ageing
 * Centre, falls history and functional mobility matter more than a weekly minutes
 * figure. But asking a 24-year-old whether they have fallen in the past year is
 * noise, and every unnecessary question costs completions in the population least
 * likely to finish.
 *
 * ── 2. A QUESTION SOMEBODY CANNOT READ IS WORSE THAN ONE NOT ASKED ──────────
 *
 * ⚠️ THIS IS THE RULE THAT MATTERS. The portal serves English, Bahasa Melayu,
 *    中文 and தமிழ். A new question added in English only would appear
 *    mid-conversation, in the wrong language, to somebody who then answers it
 *    anyway — and the answer feeds `calculateRiskScore` and `selectCTA`. That is
 *    not a missing data point; it is a WRONG one, produced by the tool asking
 *    something the person could not read.
 *
 *    So a step with no prompt in the active language is SKIPPED. The person gets a
 *    shorter, correct assessment rather than a longer, corrupted one, and the flag
 *    is simply unknown — which the scoring already treats as a deficit rather than
 *    as health (`CP2`).
 *
 *    Adding a translation is then a one-line change: put the prompt at that index
 *    in that language's dictionary and the question appears. Nothing here needs
 *    editing. Tracked as `CD10` with the other translation debt.
 */

/**
 * Whether step `index` should be asked.
 *
 * @param {Array<{key: string, when?: (data: object) => boolean}>} config
 * @param {number} index
 * @param {Array} prompts   the ACTIVE language's prompts, indexed to match config
 * @param {object} data     answers so far, for `when` predicates
 */
export const isStepAvailable = (config, index, prompts, data) => {
    const step = config?.[index];
    if (!step) return false;

    // Untranslated in this language — see the header. Checked BEFORE `when`, so a
    // conditional question cannot slip through in the wrong language.
    const prompt = prompts?.[index];
    if (prompt === undefined || prompt === null || prompt === '') return false;

    if (typeof step.when === 'function') {
        try {
            return step.when(data || {}) === true;
        } catch {
            // A predicate that throws must not take the assessment down with it.
            // Skipping is the safe direction: the question is optional by
            // construction, and the flag defaults to unknown.
            return false;
        }
    }
    return true;
};

/**
 * The next step to ask after `from`, or `-1` when there are none left.
 *
 * Absolute indices are preserved deliberately: `prompts`, `quickReplies`,
 * `reflections` and `DOMAIN_CONFIG` are four parallel arrays across four
 * languages, and renumbering them to close a gap is precisely how a question goes
 * missing in one language and nobody notices.
 */
export const nextActiveStep = (config, from, prompts, data) => {
    for (let i = from + 1; i < (config?.length ?? 0); i += 1) {
        if (isStepAvailable(config, i, prompts, data)) return i;
    }
    return -1;
};

/** The first step to ask. Same rules, from before the beginning. */
export const firstActiveStep = (config, prompts, data) => nextActiveStep(config, -1, prompts, data);

/**
 * How many questions this person will be asked, for the progress bar.
 *
 * Recomputed from current answers, so it can change once — when age is given and
 * the 60+ branch opens. A total that pretended to be fixed would either overcount
 * for everybody who skips a branch, or undercount for everybody who takes one.
 */
export const activeStepCount = (config, prompts, data) =>
    (config ?? []).reduce((n, _, i) => n + (isStepAvailable(config, i, prompts, data) ? 1 : 0), 0);

/**
 * How far through those questions `index` is, 1-based, for the progress bar.
 * Counts only steps this person is actually being asked.
 */
export const activeStepPosition = (config, index, prompts, data) => {
    let position = 0;
    for (let i = 0; i <= index && i < (config?.length ?? 0); i += 1) {
        if (isStepAvailable(config, i, prompts, data)) position += 1;
    }
    return position;
};
