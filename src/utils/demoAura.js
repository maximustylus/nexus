/**
 * ==============================================================================
 * DEMO AURA — the sandbox that is actually a sandbox
 * ==============================================================================
 *
 * The Demo Mode tab tells a visitor:
 *
 *   "Experience the NEXUS architecture in a sandboxed environment. Access
 *    analytics and triage tools without processing live clinical data."
 *
 * That was true of Firestore — `App.jsx` swaps in `MOCK_STAFF_NAMES`,
 * `MOCK_TEAM_DATA` and `MOCK_STAFF_LOADS` — and false of the assistant.
 * `AuraPulseBot.handleSend` called the `chatWithAura` Cloud Function
 * unconditionally; `isDemo` only chose which context string to send. So a demo
 * visitor's typing left the browser, reached Google's Gemini API on the project's
 * billed key, and did so from a session with no account at all: Demo Mode is
 * reachable from the SIGNED-OUT landing page (`WelcomeScreen.jsx:706`), and
 * `toggleDemo` is two lines of React state with no Firebase call anywhere.
 *
 * ── WHY THIS MODULE UNBLOCKS A SECURITY FIX ──────────────────────────────────
 *
 * `chatWithAura` has no `request.auth` check. It should — its system prompt names
 * KKH/SingHealth and prints the internal Firestore schema. The reason it could not
 * simply be added is that demo visitors are unauthenticated by construction, so
 * the check would turn every demo message into a "Neural link unstable" bubble.
 *
 * Once the demo answers locally, nothing unauthenticated calls that function, and
 * the check can go in. The sandbox claim becomes true at the same time.
 *
 * ── WHY CANNED RATHER THAN A CHEAPER MODEL ───────────────────────────────────
 *
 * A demo is shown, not explored. It needs to be reliable in a room with other
 * people watching, on hospital wifi, in front of somebody deciding whether their
 * department adopts this. Deterministic beats plausible: this module always
 * answers, answers instantly, costs nothing, cannot be rate-limited, and cannot
 * say something embarrassing to a stranger.
 *
 * ⚠️ NO `Math.random()` AND NO `Date.now()`. The same demo, driven the same way,
 *    must produce the same words every time — otherwise a rehearsed walkthrough
 *    stops being rehearsed. Variation comes from the turn index and the persona.
 *
 * ── THE CONTRACT ─────────────────────────────────────────────────────────────
 *
 * `AuraPulseBot` parses the Cloud Function's reply as JSON and reads
 * `reply`, `mode`, `action`, `db_workload`, and — for COACH — `diagnosis_ready`,
 * `phase` and `energy`. This returns exactly that object, already parsed, so the
 * component's rendering, its document-export cards and its wellbeing-log prompt
 * all behave in the demo exactly as they do live.
 */

/** The four modes `AURA_SYSTEM_PROMPT` defines. `AuraPulseBot` renders each differently. */
export const DEMO_MODES = ['COACH', 'ASSISTANT', 'DATA_ENTRY', 'RESEARCH'];

/**
 * Phase from energy, matching `PHASE_CONFIG` in `AuraPulseBot.jsx` exactly.
 * Duplicated deliberately rather than imported: importing from a component into a
 * util inverts the dependency, and this is four numbers that have not moved since
 * the RPE scale was written into `AURA_SYSTEM_PROMPT`.
 */
export const phaseForEnergy = (energy) => {
    if (energy >= 80) return 'HEALTHY';
    if (energy >= 50) return 'REACTING';
    if (energy >= 20) return 'INJURED';
    return 'ILL';
};

const has = (text, words) => {
    const lower = String(text || '').toLowerCase();
    return words.some((w) => lower.includes(w));
};

/**
 * Which mode the message is asking for.
 *
 * Mirrors the routing `AURA_SYSTEM_PROMPT` describes — including its CRITICAL
 * OVERRIDE, which puts logging a number ahead of everything else, so a demo of
 * "log 35 patients for January" behaves the way the live prompt promises.
 */
export const selectDemoMode = (userText) => {
    /*
     * ⚠️ `'patients in'` IS HERE BECAUSE THE README'S DEMO SCRIPT SAYS IT.
     *
     *    `README.md:186` — "The Data Entry Test" — instructs the presenter to tell
     *    AURA *"I saw 145 patients in June."* This list matched `'patients for'`
     *    and not `'patients in'`, so the exact sentence a stakeholder demo is
     *    scripted to use fell through to COACH, and AURA answered a database
     *    request with motivational interviewing: *"Being junior staff carries a
     *    load that is easy to normalise."*
     *
     *    Found by the go-live gate walking the README step by step, not by any
     *    test — every test here used a sentence that already worked.
     */
    /*
     * ⚠️ `'i saw '` WAS HERE FOR ELEVEN MINUTES AND IT WAS WORSE THAN THE BUG IT
     *    FIXED. DATA_ENTRY is tested FIRST, so a two-word prefix that common beat
     *    COACH, ASSISTANT and RESEARCH. Measured over a corpus of plausible
     *    sentences, twelve routings changed, including:
     *
     *      "I saw 3 arrests back to back and I am wrung out"   COACH -> DATA_ENTRY
     *      "I saw so many patients today that I did not eat"   COACH -> DATA_ENTRY
     *      "I saw a guideline on falls prevention"          RESEARCH -> DATA_ENTRY
     *
     *    A clinician describing distress would have been answered by the wellbeing
     *    tool with *"Logged 3 against your workload record for January"* and a green
     *    commit card. `'patients this'` and `'patients last'` went with it: they
     *    bought nothing the README needed and widened the same net.
     *
     *    The original commit claimed "all four other routings are unchanged" — true
     *    of the four exact README sentences and of nothing else. That is the `AU13`
     *    corollary again: evidence scoped narrower than the claim it sits under.
     *
     * ⚠️ AND THE FIRST REPLACEMENT, A BARE `'patients in'`, WAS STILL TOO BROAD. It
     *    caught *"I am exhausted, 12 patients in a morning is too many"* — distress,
     *    routed to a database write, which is the same failure one notch quieter.
     *    A keyword cannot tell "patients in June" from "patients in a morning";
     *    only the MONTH can, so `MONTH_QUALIFIED` requires one.
     */
    if (has(userText, [
        'log ', 'record ', 'update my', 'add to database',
        'patients for', 'workload for', 'workload in',
    ]) || MONTH_QUALIFIED.test(String(userText || ''))) {
        return 'DATA_ENTRY';
    }
    if (has(userText, ['memo', 'draft', 'letter', 'email', 'agenda', 'minutes', 'roster note', 'write me'])) {
        return 'ASSISTANT';
    }
    if (has(userText, ['evidence', 'literature', 'study', 'guideline', 'research', 'citation', 'trial'])) {
        return 'RESEARCH';
    }
    return 'COACH';
};

/**
 * Motivational-Interviewing style reflections, indexed by turn.
 *
 * ⚠️ THESE ARE REFLECTIONS, NOT ADVICE, and that is a product decision rather than
 *    a stylistic one. The live COACH mode is bound to OARS — Open questions,
 *    Affirmations, Reflective listening, Summaries — so a demo that dispensed tips
 *    would misrepresent the tool to the person deciding whether to adopt it.
 */
/**
 * `"…patients in June"` — a figure explicitly attached to a month.
 *
 * ⚠️ THE MONTH IS WHAT MAKES IT A LOGGING REQUEST. `'patients in'` as a bare
 *    keyword also matches "12 patients in a morning is too many", which is somebody
 *    telling a wellbeing tool they are overloaded. The distinction is not the verb
 *    or the noun — it is whether a PERIOD is named, and a period is what a workload
 *    record is keyed by.
 */
const MONTH_QUALIFIED = /\b(?:patients?|cases?|sessions?)\s+(?:in|for|during)\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i;

/** Month names, for the demo's own echo and for `target_month`. */
const MONTH_NAMES = Object.freeze([
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]);

/**
 * The month a demo sentence names, or January when it names none.
 *
 * Deliberately simple: this is the sandbox, and the live path parses nothing —
 * `executeDataEntry` reads `target_month` from the model. A demo that guessed
 * cleverly would be demonstrating a capability the live system does not have.
 */
const demoMonthIndex = (userText) => {
    const text = String(userText || '').toLowerCase();
    /**
     * ⚠️ A PREPOSITION IS REQUIRED, AND A WORD BOUNDARY WAS NOT ENOUGH.
     *
     *    The first draft used `text.includes(month)`, so *"log 20 patients, I may
     *    have miscounted"* resolved to **May** and *"march the patients through"*
     *    to **March** — the unanchored-substring trap, written into the fix for
     *    `AC1`, which is the same trap.
     *
     *    The obvious repair, `\bmay\b`, DOES NOT WORK: "may" in "I may have
     *    miscounted" is a genuine word with genuine boundaries, and so is "march"
     *    as a verb. Three of the twelve month names are ordinary English words
     *    (may, march, august). What actually disambiguates them is the preposition
     *    a person uses when they mean the month — "for June", "in March" — so that
     *    is what is matched. A bare month name is left unresolved rather than
     *    guessed at.
     */
    const found = MONTH_NAMES.findIndex(
        (m) => new RegExp(`\\b(?:for|in|during|of)\\s+${m}\\b`, 'i').test(text),
    );
    return found === -1 ? null : found;
};

const COACH_TURNS = [
    /*
     * ⚠️ `p.title` IS OPTIONAL-CHAINED — `AU25`. `respondAsDemoAura`'s fallback
     *    substitutes a whole persona only when one is entirely absent, so a persona
     *    object present but missing `title` reached `.toLowerCase()` on `undefined`
     *    and threw, taking the sandbox chat down. All six `DEMO_PERSONAS` carry a
     *    title, so it is unreachable through the UI today — which is exactly why it
     *    would have surfaced first in front of an audience, on a persona somebody
     *    added in a hurry. Found by the go-live gate.
     */
    (p) => `Thank you for saying that plainly. Being ${(p?.title || 'a clinician').toLowerCase()} carries a load that is easy to normalise. What has this week asked of you that last week did not?`,
    () => 'That lands. You are describing effort that does not show up anywhere on a rota. On a scale of nothing-left to plenty-in-reserve, where would you put yourself right now?',
    () => 'I hear the pace more than the volume — it is the not-stopping rather than the amount. What would a genuinely restorative hour look like, if it were available?',
];

/** The summary turn: the one that produces a phase and offers to log it. */
const coachSummary = (persona, energy, phase) => ({
    HEALTHY: `You are carrying this well, and it is worth naming that rather than assuming it will hold on its own. I would put you around ${energy}% — Healthy. Shall I log that so you can see the trend?`,
    REACTING: `Reacting is the honest word for where you are — still functioning, and paying for it afterwards. I would put you around ${energy}%. Shall I log that so you can see the trend?`,
    INJURED: `I want to be straight with you: this reads as Injured, around ${energy}%. That is not a failure of yours, it is a load problem, and it is the kind of thing a lead can act on. Shall I log it?`,
    ILL: `This reads as Ill, around ${energy}%. I would not leave that sitting with you alone — please raise it with your lead or occupational health. Shall I log it so there is a record?`,
}[phase]);

const DEMO_DOCUMENT = [
    'MEMORANDUM',
    '',
    'To:      All Department Staff',
    'Subject: Coverage arrangements — week commencing Monday',
    '',
    'Following this week\'s workload review, the following arrangements apply:',
    '',
    '1. Morning clinic cover is unchanged.',
    '2. Two afternoon sessions are reallocated to balance junior workload.',
    '3. Anyone unable to meet a listed session should raise it before Friday so',
    '   cover can be arranged rather than absorbed.',
    '',
    'Please direct questions to the department lead.',
].join('\n');

/**
 * One demo reply, in the shape `AuraPulseBot` already parses.
 *
 * @param {object} input
 * @param {string} input.userText     what the visitor typed
 * @param {object} input.persona      the selected `DEMO_PERSONAS` entry
 * @param {number} input.turnIndex    how many messages they have already sent (0-based)
 * @returns {{reply: string, mode: string, action?: string, db_workload?: object,
 *           diagnosis_ready?: boolean, phase?: string, energy?: number}}
 */
export const respondAsDemoAura = ({ userText, persona, turnIndex = 0 }) => {
    const who = persona || { name: 'there', title: 'Staff', baseEnergy: 50, id: 'anon' };
    const mode = selectDemoMode(userText);

    if (mode === 'DATA_ENTRY') {
        /*
         * ⚠️ THE SHAPE IS THE LIVE SHAPE, AND IT USED NOT TO BE — `AU22`.
         *
         *    This returned `{ value, period, written }` while the card's render gate
         *    at `AuraPulseBot.jsx:1093` requires `target_collection`. So the green
         *    DATA_ENTRY block **never appeared in Demo Mode** — the one mode a
         *    stakeholder is walked through — even though this module's own comment
         *    claimed "the demo shows the same card", and `README.md:186` scripts a
         *    presenter to demonstrate exactly that block.
         *
         *    `COMMUNITY_TODO.md` P0.2's evidence listed which cards still worked
         *    after the sandbox went local and correctly did NOT include this one, so
         *    the gap was known at the ledger while the comment here contradicted it.
         *
         * ⚠️ NOTHING IS WRITTEN, AND THAT IS UNCHANGED. The card's button calls
         *    `executeDataEntry`, whose FIRST check is `isDemo` — it refuses before it
         *    looks at a team or a path. Matching the live shape makes the card
         *    render; it does not make the sandbox write. `written: false` is kept
         *    alongside so a reader of the object can see that at a glance.
         */
        const matched = String(userText || '').match(/(\d+)/);
        const monthIndex = demoMonthIndex(userText);
        if (!matched) {
            return {
                mode: 'DATA_ENTRY',
                reply: 'I can log a figure against your workload record — tell me the number and the period, for example "log 35 patients for January".',
            };
        }
        return {
            mode: 'DATA_ENTRY',
            reply: monthIndex === null
                ? `Logged ${matched[1]} against your workload record. Tell me which month and I will place it. `
                  + 'In the live system this writes straight to the department dataset; in the sandbox it is displayed only.'
                : `Logged ${matched[1]} against your workload record for ${MONTH_NAMES[monthIndex]}. `
                  + 'In the live system this writes straight to the department dataset; in the sandbox it is displayed only.',
            db_workload: {
                target_collection: 'staff_loads',
                target_doc: who.name,
                target_field: 'data',
                target_value: Number(matched[1]),
                /**
                 * ⚠️ `null`, NOT `0`, WHEN NO MONTH WAS NAMED. Defaulting to January
                 *    invents a fact — it is `AU2`'s `Number(null) === 0` wearing a
                 *    different hat, and the live guard now refuses a null month
                 *    rather than guessing, so the sandbox must not model something
                 *    the live path would reject.
                 */
                target_month: monthIndex,
                value: Number(matched[1]),
                period: 'demo',
                written: false,
            },
        };
    }

    if (mode === 'ASSISTANT') {
        return {
            mode: 'ASSISTANT',
            reply: 'Drafted. You can export this to Word from the card below, or tell me what to change.',
            action: DEMO_DOCUMENT,
        };
    }

    if (mode === 'RESEARCH') {
        return {
            mode: 'RESEARCH',
            reply: 'In the live system I search the department\'s indexed evidence and return sourced summaries. '
                 + 'The sandbox carries no literature index, so this is where those results would appear — '
                 + 'with the citation and the retrieval date attached to each claim.',
        };
    }

    // COACH. The first turns reflect; the summary turn produces a phase and offers
    // to log it, which is what exercises the wellbeing panel in a walkthrough.
    if (turnIndex < COACH_TURNS.length) {
        return { mode: 'COACH', reply: COACH_TURNS[turnIndex](who), diagnosis_ready: false };
    }

    // Anchored on the persona's own baseEnergy so Tony reads as a stretched lead
    // and Peter as a coping junior — the personas exist to show exactly that
    // difference, and a single generic number would erase it.
    const energy = Math.max(0, Math.min(100, who.baseEnergy ?? 50));
    const phase = phaseForEnergy(energy);
    return {
        mode: 'COACH',
        reply: coachSummary(who, energy, phase),
        diagnosis_ready: true,
        phase,
        energy,
        action: 'Sandbox session — nothing was written to any record.',
    };
};
