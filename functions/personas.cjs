'use strict';

/**
 * ==============================================================================
 * PERSONAS — held on the SERVER, because a persona is an instruction
 * ==============================================================================
 *
 * `AU28`. Every live persona used to live in `src/config/personas.js` as a block
 * of prompt text beginning with the literal words **`System Override:`**, and the
 * client sent it to the callable in the `prompt` field, where
 * `functions/index.js` prefixed it:
 *
 *     if (prompt) contextParts.push('CONTEXT/OVERRIDE: ' + prompt);
 *
 * — into the **user turn**. Two consequences, and the second is the one that
 * matters:
 *
 *   1. The persona was caller-supplied, so anybody who could call the function
 *      could be any persona, or invent one.
 *   2. **The application demonstrated, on every persona switch, that text in a user
 *      turn can relabel the assistant.** `MAX_PROMPT_LEN` is 8,000 characters, and
 *      the server helpfully marked all of it `CONTEXT/OVERRIDE:` on the caller's
 *      behalf. That is not a leak to patch; it is a channel that was built.
 *
 * `CP6` closed the equivalent on the public endpoint — `communityAck` takes no
 * caller-supplied prompt, deliberately, and says why in its own header. The staff
 * endpoint kept it, with no rate limit (`AU14`) and no App Check.
 *
 * ------------------------------------------------------------------------------
 * WHAT CHANGED, AND WHAT DELIBERATELY DID NOT
 * ------------------------------------------------------------------------------
 *
 * The client now sends a `personaId`. The text lives here, the server looks it up,
 * and it goes into the **`systemInstruction`** — where an instruction belongs —
 * rather than into the conversation as though the user had said it.
 *
 * ⚠️ `prompt` IS STILL ACCEPTED, AND IS NO LONGER FRAMED AS AN INSTRUCTION. Removing
 *    the field outright would break any client deployed a few minutes out of step
 *    with the functions, and hosting and functions do not deploy atomically. It is
 *    now labelled as what it is — untrusted text from the caller — so the model is
 *    not told to obey it. That is the half of the finding that was actually
 *    dangerous; the other half closes when the field is dropped in a later release.
 *
 * ⚠️ THE PERSONA TEXT IS UNCHANGED, WORD FOR WORD. Moving where a prompt lives is a
 *    change with a testable outcome. Rewriting what it says is a change whose only
 *    honest verification is running real turns and reading them, and it is not
 *    bundled in here so that a behaviour change cannot hide inside a plumbing one.
 */

/** The Grant Strategist's brief — long enough to warrant its own binding. */
const HUGE_GRANT_PROMPT = `System Override: You are Huge Grant, a Senior Grant Strategist for clinical and health-services research. Force MODE 2 (Assistant). Write in British English. Never use em dashes.

TASK
Draft or critique grant material — specific aims, significance, innovation, approach, impact, budget justification, lay summary — for a clinical research audience.

CRITICAL SAFETY / ACCURACY RULES (STRICT)
1) No fabrication. Do NOT invent citations, collaborator names, prior awards, sample sizes, effect estimates or institutional facts. Where a specific is unknown, write a bracketed placeholder the applicant must fill.
2) Do not assert feasibility, recruitment rates or costings that were not supplied.
3) Separate what the applicant has told you from what you are proposing.

OUTPUT
Place the full drafted text inside the "action" field so it can be exported. Keep "reply" to a short conversational note about what you drafted and what is still needed.`;

/**
 * ⚠️ KEYED BY THE ID THE CLIENT SENDS, AND NOTHING ELSE REACHES `systemInstruction`.
 *    An unknown id yields `null` and the turn runs with the base prompt — a persona
 *    that silently does not apply is recoverable; a persona a caller invented is
 *    not.
 */
const LIVE_PERSONA_PROMPTS = Object.freeze({
    well_well: 'System Override: You are Well Well, a dedicated psychological safety coach. Force MODE 1 (Coach) for this entire conversation regardless of what is asked. Use Motivational Interviewing only. Do not generate documents.',
    aim_assist: 'System Override: You are Aim Assist, an elite administrative assistant. Force MODE 2 (Assistant). Draft the requested document immediately and completely, and place it in the "action" field. Do not ask about feelings.',
    data_dude: 'System Override: You are Data Dude, a strict database gateway. Force MODE 3 (Data Entry). Map the request to the known schema exactly. If a required value is missing, ask for that value and set every db_workload field to null.',
    magnify_mama: 'System Override: You are Magnify Mama. Disregard standard persona rules. You are a Senior Clinical Research Fellow and Lead Methodologist. Force MODE 4 (Research). Produce a rigorous, referenced literature review with certainty tagging, and never invent a citation.',
    huge_grant: HUGE_GRANT_PROMPT,
    anon: 'This is an anonymous Ghost Protocol session. The user has requested strict confidentiality. Do not refer to them by name, do not speculate about their identity, and do not reference any prior session note.',
});

/** The ids the callable will accept. Anything else is treated as no persona. */
const LIVE_PERSONA_IDS = Object.freeze(Object.keys(LIVE_PERSONA_PROMPTS));

/**
 * The server-held instruction for a persona id, or `null`.
 *
 * ⚠️ `null` FOR ANYTHING UNRECOGNISED, INCLUDING A NON-STRING. `Object.prototype`
 *    keys — `constructor`, `__proto__`, `toString` — are the obvious probe against a
 *    plain-object lookup, so membership is tested against the frozen id list rather
 *    than by reading the object.
 */
const personaPrompt = (personaId) => {
    if (typeof personaId !== 'string') return null;
    if (!LIVE_PERSONA_IDS.includes(personaId)) return null;
    return LIVE_PERSONA_PROMPTS[personaId];
};

module.exports = { LIVE_PERSONA_IDS, personaPrompt, HUGE_GRANT_PROMPT };
