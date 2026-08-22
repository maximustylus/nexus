/**
 * ==============================================================================
 * ASSESSMENT SESSION — one id, and answers that survive a reload
 * ==============================================================================
 *
 * Two defects, one cause: nothing about a person's assessment was ever written
 * down anywhere the browser would keep it.
 *
 * ── 1. FOUR IDS, ALL SHOWN AS "ID:" ──────────────────────────────────────────
 *
 * Every screen minted its own and displayed it:
 *
 *     LanguageGate.jsx:21      'nx-' + Math.random()…            lower case
 *     PathwaySelection.jsx:50  'nx-' + Math.random()…            lower case
 *     AuraChat.jsx:690         'NX-' + Math.random()….toUpperCase()
 *     ConventionalForm.jsx:588 'NX-' + Math.random()….toUpperCase()
 *     ResultPage.jsx:565       another one, as a fallback
 *
 * A person walking the flow saw four different values, each labelled "ID:", and
 * the one written to Firestore was the third. So an id quoted off the screen — on
 * the language screen, or the pathway screen — matched nothing in the record. The
 * portal also invites returning respondents to type a previous id in for
 * longitudinal linkage, which makes "which of these four is the real one?" a
 * question with a wrong answer.
 *
 * ── 2. A FINISHED ASSESSMENT DID NOT SURVIVE A RELOAD ────────────────────────
 *
 * Answers lived in component `useState` and the result travelled to
 * `/individuals/result` in react-router navigation state. Neither outlives a page
 * load. `ResultPage` redirects to `/individuals/pathway` when
 * `location.state?.score` is absent, so thirteen questions and a completed risk
 * assessment were erased by a refresh, a rotation that triggered one, iOS
 * reclaiming a backgrounded tab, or following a resource link and pressing back.
 *
 * ── WHY sessionStorage AND NOT localStorage ──────────────────────────────────
 *
 * ⚠️ THIS IS HEALTH DATA ON WHAT MAY BE A SHARED OR PUBLIC DEVICE — a community
 *    centre terminal, a clinic tablet, a borrowed phone. `sessionStorage` is
 *    scoped to the tab and is discarded when it closes, so the next person does
 *    not inherit the last one's answers. `localStorage` would persist them
 *    indefinitely, which is the wrong trade for a portal whose own notice says it
 *    collects no identifying information: answers about food insecurity and
 *    psychological distress left on a shared machine are identifying in practice.
 *
 *    That is also why `clearAssessment()` exists and is called once the result has
 *    been read — see `ResultPage`.
 */

const SESSION_ID_KEY = 'nexus_assessment_id';
const IN_PROGRESS_KEY = 'nexus_assessment_progress';
const RESULT_KEY = 'nexus_assessment_result';

/**
 * Every access is wrapped. Safari in private mode THROWS on `sessionStorage`
 * rather than returning null, and these are read during render — an uncaught
 * throw takes the page to blank, for the visitor least equipped to work out why.
 * Losing persistence is a bad day; losing the page is a lost assessment.
 */
const readRaw = (key) => {
    try {
        return sessionStorage.getItem(key);
    } catch {
        return null;
    }
};

const writeRaw = (key, value) => {
    try {
        sessionStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
};

const removeRaw = (key) => {
    try {
        sessionStorage.removeItem(key);
    } catch {
        /* Nothing to do — the value was never stored. */
    }
};

const readJson = (key) => {
    const raw = readRaw(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        // Corrupt or half-written. Drop it rather than letting a parse error
        // propagate into a render.
        removeRaw(key);
        return null;
    }
};

const writeJson = (key, value) => writeRaw(key, JSON.stringify(value));

// ── 1. The id ────────────────────────────────────────────────────────────────

/** `NX-` plus nine base-36 characters, upper-cased — the form already in Firestore. */
const mintSessionId = () => `NX-${Math.random().toString(36).slice(2, 11).toUpperCase()}`;

/**
 * The id for this assessment. Minted once per tab and reused by every screen, so
 * the value a person reads off any screen is the value in the record.
 *
 * Returns a fresh id when storage is unavailable rather than throwing. That
 * degrades to the old behaviour — a different id per screen — which is worse than
 * this but better than a blank page.
 */
export const getSessionId = () => {
    const existing = readRaw(SESSION_ID_KEY);
    if (existing) return existing;
    const minted = mintSessionId();
    writeRaw(SESSION_ID_KEY, minted);
    return minted;
};

// ── 2. Answers in progress ───────────────────────────────────────────────────

/**
 * @param {'form'|'chat'} pathway  kept separate so switching pathway does not
 *   resume half of the other one's shape into the wrong component
 * @param {object} state
 */
export const saveProgress = (pathway, state) => writeJson(IN_PROGRESS_KEY, { pathway, state });

/** The saved answers for this pathway, or `null`. */
export const loadProgress = (pathway) => {
    const stored = readJson(IN_PROGRESS_KEY);
    if (!stored || stored.pathway !== pathway) return null;
    return stored.state ?? null;
};

export const clearProgress = () => removeRaw(IN_PROGRESS_KEY);

// ── 3. The finished result ───────────────────────────────────────────────────

/**
 * The object `ResultPage` receives as router state. Saved on the way in so a
 * reload can restore it instead of bouncing a person who has finished back to the
 * pathway picker with nothing.
 */
export const saveResult = (result) => writeJson(RESULT_KEY, result);

/** The saved result, or `null`. Shape is validated by the caller, not here. */
export const loadResult = () => readJson(RESULT_KEY);

/**
 * Everything about this assessment. Called when a person finishes with the result
 * — see the shared-device note in the header.
 */
export const clearAssessment = () => {
    removeRaw(IN_PROGRESS_KEY);
    removeRaw(RESULT_KEY);
    removeRaw(SESSION_ID_KEY);
};
