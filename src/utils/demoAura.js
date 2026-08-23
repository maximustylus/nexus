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
    if (has(userText, ['log ', 'record ', 'update my', 'patients for', 'workload for', 'add to database'])) {
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
const COACH_TURNS = [
    (p) => `Thank you for saying that plainly. Being ${p.title.toLowerCase()} carries a load that is easy to normalise. What has this week asked of you that last week did not?`,
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
        // The live MODE 3 writes through the client; the demo shows the same card
        // and writes nothing, which is what `isDemo` already does for every other
        // Firestore path in `App.jsx`.
        const matched = String(userText || '').match(/(\d+)/);
        return {
            mode: 'DATA_ENTRY',
            reply: matched
                ? `Logged ${matched[1]} against your workload record for this period. In the live system this writes straight to the department dataset; in the sandbox it is displayed only.`
                : 'I can log a figure against your workload record — tell me the number and the period, for example "log 35 patients for January".',
            db_workload: matched ? { value: Number(matched[1]), period: 'demo', written: false } : undefined,
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
