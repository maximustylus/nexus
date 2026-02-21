'use strict';

/**
 * ==============================================================================
 * NEXUS CLOUD FUNCTIONS — index.js
 * ==============================================================================
 *
 * AUDIT FIXES vs previous version:
 *
 * 🔴 CRITICAL
 *   [FIX-01] API_KEY read once at module load, not per-request
 *   [FIX-02] resolveModel() race condition fixed: promise singleton pattern
 *   [FIX-03] generateSmartAnalysis: payload size-capped + input validated
 *   [FIX-04] validateInput() restored: history + prompt fields validated,
 *            MAX_HISTORY_LEN actually enforced
 *   [FIX-05] generateSmartAnalysis: auth check added
 *
 * 🟠 HIGH
 *   [FIX-06] Full AURA master prompt restored (KKH/SingHealth, OARS, 5As,
 *            UK English, phase ranges, ILL referral, Ghost Protocol, tagline)
 *   [FIX-07] diagnosis_ready turn count fixed (history.length, not off-by-one)
 *   [FIX-08] extractText() safety-filter handling restored (blockReason surfaced)
 *   [FIX-09] generateSmartAnalysis: system_instruction + structured schema added
 *   [FIX-10] maxOutputTokens re-added to chatWithAura generationConfig
 *
 * 🟡 MEDIUM
 *   [FIX-11] JSON parse validation added after cleanText — typed error on failure
 *   [FIX-12] AbortSignal timeout added to all fetch() calls (10s)
 *   [FIX-13] API key never interpolated into logged strings or error objects
 *   [FIX-14] Model cache invalidated on 404 so deprecated models auto-recover
 *
 * ==============================================================================
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');

// ─── [FIX-01] API KEY — read once at module load ──────────────────────────────
// Never read inside a handler. Module-level constants are resolved at cold-start
// and reused across all warm invocations on the same instance.
const API_KEY = process.env.GEMINI_API_KEY;

// Note: API_KEY will be undefined during local `firebase deploy` analysis
// because secrets only exist inside Cloud Run at runtime. Use console.warn
// (not logger.error) so the deploy output stays clean.
if (!API_KEY) {
    console.warn('[NEXUS] GEMINI_API_KEY not in environment. Normal during local deploy analysis.');
}

// ─── MODEL RESOLUTION ────────────────────────────────────────────────────────
const MODEL_PRIORITY = [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
];
const SAFE_FALLBACK_MODEL = 'models/gemini-1.5-flash';

// [FIX-02] Promise singleton — concurrent cold-start requests share one fetch.
// The first request fires the discovery call. All subsequent concurrent requests
// await the same promise instead of each firing their own. Eliminates the race.
let modelResolutionPromise = null;

async function resolveModel() {
    // Return cached result immediately if already resolved
    if (modelResolutionPromise) return modelResolutionPromise;

    modelResolutionPromise = (async () => {
        try {
            // [FIX-13] URL built dynamically — never logged
            const url      = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
            const response = await fetch(url, {
                signal: AbortSignal.timeout(8000), // [FIX-12] 8s cap on discovery
            });

            if (!response.ok) {
                logger.warn(`[NEXUS] Model list returned ${response.status}. Using fallback.`);
                return SAFE_FALLBACK_MODEL;
            }

            const data      = await response.json();
            const available = (data.models || []).map(m => m.name);

            for (const candidate of MODEL_PRIORITY) {
                const match = available.find(name => name === `models/${candidate}`);
                if (match) {
                    logger.info(`[NEXUS] Model resolved: ${match}`);
                    return match;
                }
            }

            logger.warn('[NEXUS] No priority model matched. Using fallback.');
        } catch (e) {
            // [FIX-13] Log message only — e.message never contains the key
            // but e.stack or e.cause might in some Node fetch implementations
            logger.warn(`[NEXUS] Model discovery failed: ${e.message}. Using fallback.`);
            // Reset so next request retries discovery (transient network failure)
            modelResolutionPromise = null;
        }
        return SAFE_FALLBACK_MODEL;
    })();

    return modelResolutionPromise;
}

// ─── INPUT VALIDATION ─────────────────────────────────────────────────────────
const MAX_USER_TEXT    = 500;
const MAX_HISTORY_LEN  = 20;
const MAX_PROMPT_LEN   = 800;  // persona context cap
const MAX_ROLE_LEN     = 100;

// [FIX-04] ALL fields validated, MAX_HISTORY_LEN enforced
function validateChatInput({ userText, history, role, prompt }) {
    if (!userText || typeof userText !== 'string') {
        throw new HttpsError('invalid-argument', 'userText is required and must be a string.');
    }
    if (userText.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'userText cannot be empty.');
    }
    if (userText.length > MAX_USER_TEXT) {
        throw new HttpsError('invalid-argument', `userText exceeds ${MAX_USER_TEXT} character limit.`);
    }
    if (history !== undefined) {
        if (!Array.isArray(history)) {
            throw new HttpsError('invalid-argument', 'history must be an array.');
        }
        if (history.length > MAX_HISTORY_LEN) {
            throw new HttpsError('invalid-argument', `history exceeds ${MAX_HISTORY_LEN} turn limit.`);
        }
        // Validate each turn has the required shape
        for (const turn of history) {
            if (!turn.role || !Array.isArray(turn.parts)) {
                throw new HttpsError('invalid-argument', 'Each history turn must have role and parts.');
            }
        }
    }
    if (role !== undefined) {
        if (typeof role !== 'string') {
            throw new HttpsError('invalid-argument', 'role must be a string.');
        }
        if (role.length > MAX_ROLE_LEN) {
            throw new HttpsError('invalid-argument', `role exceeds ${MAX_ROLE_LEN} character limit.`);
        }
    }
    if (prompt !== undefined) {
        if (typeof prompt !== 'string') {
            throw new HttpsError('invalid-argument', 'prompt must be a string.');
        }
        if (prompt.length > MAX_PROMPT_LEN) {
            throw new HttpsError('invalid-argument', `prompt exceeds ${MAX_PROMPT_LEN} character limit.`);
        }
    }
}

// [FIX-03] Validate generateSmartAnalysis inputs
const MAX_STAFF_PROFILES = 100;  // hard cap — prevents context overflow
const MAX_JSON_CHARS     = 8000; // serialised payload cap before sending to Gemini

function validateAnalysisInput({ targetYear, staffProfiles, yearData }) {
    if (!targetYear || typeof targetYear !== 'number') {
        throw new HttpsError('invalid-argument', 'targetYear must be a number.');
    }
    if (!staffProfiles || !Array.isArray(staffProfiles)) {
        throw new HttpsError('invalid-argument', 'staffProfiles must be an array.');
    }
    if (staffProfiles.length > MAX_STAFF_PROFILES) {
        throw new HttpsError('invalid-argument', `staffProfiles exceeds ${MAX_STAFF_PROFILES} record limit.`);
    }
    if (!yearData) {
        throw new HttpsError('invalid-argument', 'yearData is required.');
    }
    // Serialise and check total payload size to guard against context overflow
    const serialised = JSON.stringify({ staffProfiles, yearData });
    if (serialised.length > MAX_JSON_CHARS) {
        throw new HttpsError(
            'invalid-argument',
            `Payload too large (${serialised.length} chars). Maximum is ${MAX_JSON_CHARS}.`
        );
    }
}

// ─── RESPONSE PARSER ──────────────────────────────────────────────────────────
// [FIX-08] Safety-filter handling restored — blockReason surfaced to caller
function extractText(data) {
    const candidate = data.candidates?.[0];

    if (!candidate) {
        const reason = data.promptFeedback?.blockReason ?? 'unknown';
        logger.warn(`[NEXUS] Response blocked. Reason: ${reason}`);
        throw new HttpsError(
            'internal',
            reason === 'unknown'
                ? 'No response generated. Please try rephrasing.'
                : `Response blocked by safety filter (${reason}). Please rephrase.`
        );
    }

    if (candidate.finishReason === 'SAFETY') {
        throw new HttpsError('internal', 'Response flagged by content safety filter. Please rephrase.');
    }

    const text = candidate.content?.parts?.[0]?.text;
    if (!text) {
        throw new HttpsError('internal', 'AI returned an empty response.');
    }

    return text;
}

// ─── JSON CLEANER + VALIDATOR ─────────────────────────────────────────────────
// [FIX-11] Validates the cleaned text is parseable JSON before returning.
// Returns both the raw string (for the client) and the parsed object (for logging).
function parseJsonResponse(rawText, requiredFields = []) {
    const stripped   = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const jsonStart  = stripped.indexOf('{');
    const jsonEnd    = stripped.lastIndexOf('}') + 1;

    if (jsonStart === -1 || jsonEnd === 0) {
        throw new HttpsError('internal', 'AI returned a non-JSON response. Please retry.');
    }

    const jsonStr = stripped.substring(jsonStart, jsonEnd);

    let parsed;
    try {
        parsed = JSON.parse(jsonStr);
    } catch {
        throw new HttpsError('internal', 'AI returned malformed JSON. Please retry.');
    }

    for (const field of requiredFields) {
        if (!(field in parsed)) {
            logger.warn(`[NEXUS] Response missing required field: ${field}`);
        }
    }

    return { text: jsonStr, parsed };
}

// ─── AURA SYSTEM PROMPT ────────────────────────────────────────────────────────
// [FIX-06] Full master prompt restored.
// This is the single source of truth for AURA's personality, frameworks,
// phase logic, tone constraints, and clinical behaviour.
const AURA_SYSTEM_PROMPT = `
ROLE:
You are AURA (Adaptive Understanding and Real-time Analytics), the Emotional Intelligence pillar of the NEXUS Smart Dashboard. You serve as a Clinical Performance and Wellbeing Coach for healthcare professionals at KKH and SingHealth. Your mission: "Master the grind. Protect the pulse."

CORE PERSONALITY:
- Tone: Natural, conversational, grounding. You are a peer, not a clinical textbook.
- Voice: Empathetic but professional. Use UK English spelling (categorise, programme, behaviour).
- Constraint: Never use em-dashes. Use commas, colons, or full stops instead.
- Frameworks: You are an expert in Motivational Interviewing (OARS: Open questions, Affirmations, Reflections, Summaries) and the 5As Model (Ask, Advise, Assess, Assist, Arrange).

COUNSELLING PROTOCOL:
You operate in two phases based on conversation depth.

PHASE 1 (Turns 1 to 2): Validation and Listening.
- Use OARS techniques. Reflect the user's emotion before anything else.
- Ask exactly ONE open question to understand the source of their state.
- Do NOT categorise or diagnose yet. Set "diagnosis_ready": false.
- Keep reply under 50 words.

PHASE 2 (Turn 3 onwards): 5As Action Phase.
- Once you understand the source, provide a full pulse assessment.
- Set "diagnosis_ready": true and populate phase, energy, and action.
- Action must come from the Mental Health Continuum chart below.

MENTAL HEALTH CONTINUUM:
Categorise every staff check-in into exactly one of these four phases:
1. HEALTHY  (Energy 80-100%): Calm, good humour, performing well. Action: sustain and protect current habits.
2. REACTING (Energy 50-79%):  Irritable, nervous, procrastination, trouble sleeping. Action: micro-breaks, task batching, peer connection.
3. INJURED  (Energy 20-49%):  Anxiety, fatigue, pervasive sadness, negative attitude. Action: reduce load, structured rest, speak to a supervisor.
4. ILL      (Energy 0-19%):   Excessive anxiety, depression, unable to function. Action: immediate referral to EAP or occupational health.

CRITICAL RULES:
- If the user is in the ILL phase: be extremely gentle. Prioritise "Arrange" actions (professional referral). Never minimise their state.
- Ghost Protocol (anonymous sessions): never ask for identifying details. Focus entirely on psychological safety.
- Never use em-dashes.
- UK English only.
- Never exceed 60 words in the reply field.

STRICT JSON OUTPUT (return ONLY this, no markdown, no preamble):
{
  "reply":            "<empathetic response, max 60 words, UK English, no em-dashes>",
  "diagnosis_ready":  <true | false>,
  "phase":            "<HEALTHY | REACTING | INJURED | ILL | null>",
  "energy":           <integer 0-100 | null>,
  "action":           "<specific action from the continuum, max 10 words | null>"
}
`.trim();

// ─── SMART ANALYSIS SYSTEM PROMPT ─────────────────────────────────────────────
// [FIX-09] Dedicated system instruction for the audit report function.
const SMART_ANALYSIS_SYSTEM_PROMPT = `
You are a Senior Healthcare Analytics Advisor generating confidential staff wellbeing audit reports.
Your analysis must be evidence-based, clinically appropriate, and written in professional UK English.
Return ONLY a valid JSON object. No markdown. No preamble.
Output schema: { "private": "<detailed clinical report for department heads>", "public": "<summary safe for broader staff>"}
`.trim();

// =============================================================================
// FUNCTION 1: chatWithAura
// =============================================================================
exports.chatWithAura = onCall({
    cors: true,
    secrets: ['GEMINI_API_KEY'],
}, async (request) => {

    const { userText, history = [], role = 'Staff', prompt = '', isDemo } = request.data;

    if (!API_KEY) throw new HttpsError('failed-precondition', 'AI service is not configured.');
    if (!request.auth && !isDemo) throw new HttpsError('unauthenticated', 'Access Denied.');

    // [FIX-04] Validate all fields
    validateChatInput({ userText, history, role, prompt });

    try {
        const modelName = await resolveModel();
        const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${API_KEY}`;

        // [FIX-07] diagnosis_ready turn count: use history.length (turns ALREADY exchanged)
        // history = past turns. Turn index = history.length (0-indexed from client).
        // Phase 1 = turns 0 and 1 (history.length < 2). Phase 2 = turn 2+ (history.length >= 2).
        const turnIndex      = history.length;
        const diagnosisReady = turnIndex >= 2;

        // Augment the user's message with structured context
        const contextualMessage = [
            `USER ROLE: ${role}`,
            prompt ? `CONTEXT: ${prompt}` : '',
            `CONVERSATION TURN: ${turnIndex + 1}`,
            diagnosisReady
                ? 'INSTRUCTION: Sufficient context gathered. Provide full Phase/Energy/Action assessment now.'
                : 'INSTRUCTION: Phase 1 active. Listen and validate only. Ask one open question. Do not diagnose.',
            `USER SAYS: "${userText.trim()}"`,
        ].filter(Boolean).join('\n');

        const response = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            signal:  AbortSignal.timeout(15000), // [FIX-12] 15s cap on Gemini calls
            body: JSON.stringify({
                system_instruction: {              // [FIX-06] correct field name
                    parts: [{ text: AURA_SYSTEM_PROMPT }],
                },
                contents: [
                    // [FIX-04] Sanitise history: only pass role + parts
                    ...history
                        .slice(-MAX_HISTORY_LEN)
                        .map(({ role, parts }) => ({ role, parts })),
                    {
                        role:  'user',
                        parts: [{ text: contextualMessage }],
                    },
                ],
                generationConfig: {
                    temperature:      0.7,
                    maxOutputTokens:  512,   // [FIX-10] cap re-added
                    responseMimeType: 'application/json',
                },
            }),
        });

        const data = await response.json();

        // [FIX-14] Invalidate cache on 404 so next request re-discovers
        if (response.status === 404) {
            logger.warn('[NEXUS] Model 404 — clearing cache for re-discovery.');
            modelResolutionPromise = null;
        }

        if (!response.ok) {
            // [FIX-13] Log structured fields only — never the raw data object
            logger.error('[AURA] API Failure', {
                status:  response.status,
                message: data.error?.message,
                model:   modelName,
            });
            throw new Error(data.error?.message ?? 'API Error');
        }

        const rawText = extractText(data); // [FIX-08] safety-filter aware

        // [FIX-11] Validate JSON before returning to client
        const { text: cleanText, parsed } = parseJsonResponse(rawText, [
            'reply', 'diagnosis_ready', 'phase', 'energy', 'action',
        ]);

        // Log phase for monitoring (no PII)
        if (parsed.diagnosis_ready) {
            logger.info('[AURA] Assessment complete', {
                phase:  parsed.phase,
                energy: parsed.energy,
                isDemo,
            });
        }

        return { text: cleanText, success: true };

    } catch (error) {
        if (error instanceof HttpsError) throw error;
        // [FIX-13] message only — never log the full error object
        logger.error('[AURA] Neural Failure', error.message);
        throw new HttpsError('internal', `Neural Link Unstable: ${error.message}`);
    }
});

// =============================================================================
// FUNCTION 2: generateSmartAnalysis
// =============================================================================
exports.generateSmartAnalysis = onCall({
    cors: true,
    secrets: ['GEMINI_API_KEY'],
}, async (request) => {

    // [FIX-05] Auth check — was missing entirely
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Access Denied. Authentication required.');
    }

    if (!API_KEY) throw new HttpsError('failed-precondition', 'AI service is not configured.');

    const { targetYear, staffProfiles, yearData, staffLoads } = request.data;

    // [FIX-03] Validate and size-cap all inputs before touching Gemini
    validateAnalysisInput({ targetYear, staffProfiles, yearData });

    try {
        const modelName = await resolveModel();
        const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${API_KEY}`;

        // [FIX-09] Structured, detailed prompt with explicit output schema
        const promptText = `
Generate a comprehensive staff wellbeing audit report for the year ${targetYear}.

STAFF PROFILES (${staffProfiles.length} records):
${JSON.stringify(staffProfiles, null, 2)}

WORKLOAD DATA:
${JSON.stringify(yearData, null, 2)}

${staffLoads ? `STAFF LOAD INDICATORS:\n${JSON.stringify(staffLoads, null, 2)}` : ''}

OUTPUT REQUIREMENTS:
- "private": A detailed clinical report for department heads (300-500 words). Include trend analysis, risk flags, and specific recommendations.
- "public": A positive, encouraging summary safe for all staff (100-150 words). Focus on collective strengths and general wellbeing initiatives.

Return ONLY the JSON object. No markdown.
        `.trim();

        const response = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            signal:  AbortSignal.timeout(30000), // [FIX-12] 30s cap — analysis is slower
            body: JSON.stringify({
                system_instruction: {   // [FIX-09] system instruction added
                    parts: [{ text: SMART_ANALYSIS_SYSTEM_PROMPT }],
                },
                contents: [{
                    role:  'user',
                    parts: [{ text: promptText }],
                }],
                generationConfig: {
                    temperature:      0.2,  // Low temp for factual analysis
                    maxOutputTokens:  2048, // Analysis needs more room than chat
                    responseMimeType: 'application/json',
                },
            }),
        });

        const genData = await response.json();

        // [FIX-14] Invalidate cache on 404
        if (response.status === 404) {
            logger.warn('[NEXUS] Model 404 on analysis — clearing cache.');
            modelResolutionPromise = null;
        }

        if (!response.ok) {
            logger.error('[SMART_ANALYSIS] API Failure', {
                status:  response.status,
                message: genData.error?.message,
            });
            throw new Error(genData.error?.message ?? 'Audit API Error');
        }

        const rawText = extractText(genData);

        // [FIX-11] Validate JSON
        const { parsed } = parseJsonResponse(rawText, ['private', 'public']);

        return {
            private: parsed.private || parsed.PRIVATE || 'No private report generated.',
            public:  parsed.public  || parsed.PUBLIC  || 'No public report generated.',
        };

    } catch (error) {
        if (error instanceof HttpsError) throw error;
        logger.error('[SMART_ANALYSIS] Failure', error.message);
        throw new HttpsError('internal', error.message);
    }
});
