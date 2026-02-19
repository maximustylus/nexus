const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API_KEY = process.env.GEMINI_API_KEY;

// [FIX-02] Cache the model name at cold-start — not per request.
// This is resolved once and reused for the lifetime of the function instance.
// If discovery fails, we default to a known-good model (not the deprecated one).
const MODEL_PRIORITY = [
    'gemini-2.0-flash',     // best if available
    'gemini-1.5-flash',     // reliable fallback
    'gemini-1.5-pro',       // larger context fallback
];
const SAFE_FALLBACK_MODEL = 'models/gemini-1.5-flash'; // [FIX-01] NOT gemini-pro

let resolvedModelName = null; // module-level cache

/**
 * Discovers the best available Gemini model once per cold start.
 * Cached for the lifetime of the function instance.
 * [FIX-01] Fallback is gemini-1.5-flash, never the deprecated gemini-pro.
 * [FIX-03] Priority list uses exact prefix matches, not broad includes().
 * [FIX-07] API key is never interpolated into logged strings.
 */
async function resolveModel() {
    if (resolvedModelName) return resolvedModelName; // cache hit

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`
        );

        if (!response.ok) {
            logger.warn(`[AURA] Model list fetch returned ${response.status}. Using safe fallback.`);
            resolvedModelName = SAFE_FALLBACK_MODEL;
            return resolvedModelName;
        }

        const data = await response.json();
        const available = (data.models || []).map(m => m.name); // e.g. ["models/gemini-1.5-flash", ...]

        // [FIX-03] Exact prefix match — won't accidentally pick deprecated gemini-pro
        for (const candidate of MODEL_PRIORITY) {
            const match = available.find(name => name === `models/${candidate}`);
            if (match) {
                logger.info(`[AURA] Model resolved: ${match}`);
                resolvedModelName = match;
                return resolvedModelName;
            }
        }

        logger.warn("[AURA] No priority model found in API response. Using safe fallback.");
    } catch (e) {
        // [FIX-07] Log message only — never log the error object directly as it
        // may contain the full URL with the API key embedded in it.
        logger.warn(`[AURA] Model discovery failed: ${e.message}. Using safe fallback.`);
    }

    resolvedModelName = SAFE_FALLBACK_MODEL;
    return resolvedModelName;
}

// ─── SYSTEM PROMPT ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `
ROLE:
You are AURA (Adaptive Understanding & Real-time Analytics), the Emotional Intelligence pillar of the NEXUS Smart Dashboard. You serve as a Clinical Performance and Wellbeing Coach for healthcare professionals at KKH and SingHealth. Your mission is captured in your tagline: "Master the grind. Protect the pulse."

CORE PERSONALITY:
- Tone: Natural, conversational, and grounding. You are a peer, not a clinical textbook.
- Voice: Empathetic but professional. Use UK English spelling (e.g., categorise, programme, behaviour).
- Constraint: Never use em-dashes. Use commas, colons, or full stops instead.
- Frameworks: You are an expert in Motivational Interviewing (OARS: Open questions, Affirmations, Reflections, Summaries) and the 5As Model (Ask, Advise, Assess, Assist, Arrange).

MENTAL HEALTH CONTINUUM:
Categorise every user input into exactly one of these four phases based on their sentiment:
1. HEALTHY  (Energy 80-100%): Calm, good humour, performing well.
2. REACTING (Energy 50-79%):  Irritable, nervous, procrastination, trouble sleeping.
3. INJURED  (Energy 20-49%):  Anxiety, fatigue, pervasive sadness, negative attitude.
4. ILL      (Energy  0-19%):  Excessive anxiety, depression, unable to function.

RESPONSE REQUIREMENTS:
For every staff check-in, your reply field must contain three components in this order:

1. EMPATHY & VALIDATION (OARS technique): A short, warm response that validates their current state. Strict limit: under 50 words. Never be clinical or textbook. Sound like a trusted colleague.

2. PULSE CHECK: State their Phase and a specific Energy % based on their sentiment. Example: "Your pulse reads: REACTING at 62%."

3. ACTION TO TAKE: One specific, actionable suggestion from the Mental Health Continuum. Examples: "Break tasks into small steps," "Recognise your limits today," "Seek a confidential chat with your EAP."

CRITICAL RULES:
- If the user is in the ILL phase: be extremely gentle. Prioritise "Arrange" actions (professional referral). Do not minimise their state.
- Prioritise Ghost Protocol tone (anonymity, no judgement) so staff feel completely safe sharing.
- Never use em-dashes in your reply. Use commas, colons, or full stops instead.
- UK English only.

STRICT OUTPUT RULE:
Return ONLY a valid JSON object. No markdown. No preamble. No explanation outside the JSON.
JSON FORMAT:
{
  "reply":  "<all three components above, combined into one warm paragraph, max 80 words>",
  "phase":  "HEALTHY" | "REACTING" | "INJURED" | "ILL",
  "energy": <integer 0-100, must match the phase range above>,
  "action": "<the specific action from component 3, max 10 words>"
}
`.trim();

// ─── INPUT VALIDATION ─────────────────────────────────────────────────────────
const MAX_USER_TEXT   = 500;
const MAX_HISTORY_LEN = 20;   // max turns passed in history array

/**
 * [FIX-05] Validates and sanitizes all incoming request fields.
 * Throws HttpsError for any invalid input.
 */
function validateInput({ userText, history, role, prompt }) {
    if (!userText || typeof userText !== 'string') {
        throw new HttpsError('invalid-argument', 'userText is required.');
    }
    if (userText.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'userText cannot be empty.');
    }
    if (userText.length > MAX_USER_TEXT) {
        throw new HttpsError('invalid-argument', `userText exceeds ${MAX_USER_TEXT} character limit.`);
    }
    if (history !== undefined && !Array.isArray(history)) {
        throw new HttpsError('invalid-argument', 'history must be an array.');
    }
    if (Array.isArray(history) && history.length > MAX_HISTORY_LEN) {
        throw new HttpsError('invalid-argument', `history exceeds ${MAX_HISTORY_LEN} turn limit.`);
    }
    if (role !== undefined && typeof role !== 'string') {
        throw new HttpsError('invalid-argument', 'role must be a string.');
    }
    if (prompt !== undefined && typeof prompt !== 'string') {
        throw new HttpsError('invalid-argument', 'prompt must be a string.');
    }
}

// ─── RESPONSE PARSER ─────────────────────────────────────────────────────────
/**
 * [FIX-06] Safely extracts the reply text from the Gemini response.
 * Handles safety-filtered responses (empty candidates array) without crashing.
 * @param {object} data - Raw API response body
 * @returns {string}
 */
function extractText(data) {
    const candidate = data.candidates?.[0];

    if (!candidate) {
        const reason = data.promptFeedback?.blockReason ?? 'unknown';
        logger.warn(`[AURA] Response blocked or empty. Reason: ${reason}`);
        throw new HttpsError(
            'internal',
            'Response was blocked by the safety filter. Please rephrase.'
        );
    }

    if (candidate.finishReason === 'SAFETY') {
        throw new HttpsError('internal', 'Response flagged by safety filter.');
    }

    const text = candidate.content?.parts?.[0]?.text;
    if (!text) {
        throw new HttpsError('internal', 'Empty response from AI model.');
    }

    return text;
}

// ─── MAIN FUNCTION ────────────────────────────────────────────────────────────
exports.chatWithAura = onCall({
    cors: true,
    secrets: ["GEMINI_API_KEY"],
}, async (request) => {

    const { userText, history = [], role = 'Staff', prompt = '', isDemo } = request.data;

    // Auth gate
    if (!request.auth && !isDemo) {
        throw new HttpsError('unauthenticated', 'Access Denied.');
    }

    // [FIX-05] Validate before doing anything expensive
    validateInput({ userText, history, role, prompt });

    try {
        // [FIX-02] Model resolved once and cached — not on every request
        const modelName = await resolveModel();

        // [FIX-04] system_instruction used correctly — not injected as a user turn
        const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${API_KEY}`;

        const requestBody = {
            system_instruction: {
                parts: [{ text: SYSTEM_PROMPT }]
            },
            contents: [
                // Sanitize history: only pass role + parts, strip any extra fields
                ...history
                    .slice(-MAX_HISTORY_LEN)  // cap length as a second safety net
                    .map(({ role, parts }) => ({ role, parts })),
                {
                    role: "user",
                    parts: [{
                        text: `USER ROLE: ${role}\nPERSONA CONTEXT: ${prompt}\n\nUSER SAYS: "${userText.trim()}"`,
                    }]
                }
            ],
            generationConfig: {
                temperature:     0.7,
                maxOutputTokens: 512,   // enough for a JSON reply, prevents runaway output
                responseMimeType: "application/json", // tell Gemini to return JSON directly
            }
        };

        const response = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(requestBody),
        });

        const data = await response.json();

        if (!response.ok) {
            // [FIX-07] Log the error message only — not the full data object
            // which could echo back the URL containing the API key
            logger.error("[AURA] API Failure", {
                status:  response.status,
                message: data.error?.message,
                model:   modelName,
            });
            // If the model was not found, reset the cache so next request re-discovers
            if (response.status === 404) {
                resolvedModelName = null;
                logger.warn("[AURA] Model cache cleared due to 404 — will re-discover on next request.");
            }
            throw new Error(data.error?.message ?? "API Handshake Failed");
        }

        // [FIX-06] Safe extraction — handles empty/blocked candidates
        const rawText = extractText(data);

        // Strip markdown fences if the model includes them despite responseMimeType
        const cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

        // Validate the response is parseable JSON before returning
        try {
            JSON.parse(cleanText);
        } catch (_) {
            logger.warn("[AURA] Model returned non-JSON. Raw:", cleanText.slice(0, 200));
            throw new HttpsError('internal', 'Model returned malformed response. Please retry.');
        }

        return { text: cleanText, success: true };

    } catch (error) {
        // Re-throw HttpsErrors as-is (they already have correct codes)
        if (error instanceof HttpsError) throw error;

        logger.error("[AURA] Neural Failure", error.message);
        throw new HttpsError('internal', `Neural Link Unstable: ${error.message}`);
    }
});

// ============================================================================
// 2. SMART ANALYSIS FUNCTION
// ============================================================================
exports.generateSmartAnalysis = onCall({ 
    cors: true, 
    secrets: ["GEMINI_API_KEY"] 
}, async (request) => {
    try {
        const { targetYear, staffProfiles, yearData, staffLoads } = request.data;
        const API_KEY = process.env.GEMINI_API_KEY;

        if (!API_KEY) {
            throw new HttpsError("failed-precondition", "Server missing Gemini API Key.");
        }

        // Use our bulletproof Auto-Discovery helper!
        const modelName = await resolveModel(API_KEY);

        const promptText = `
            ACT AS: Senior Clinical Lead at KKH.
            CONTEXT: Annual Performance Review for Year ${targetYear}.
            DATA: ${JSON.stringify(staffProfiles)}
            WORKLOAD: ${JSON.stringify(yearData)}
            CLINICAL_LOADS: ${JSON.stringify(staffLoads)}

            TASK: Generate TWO reports for ${targetYear}.
            1. PRIVATE_EXECUTIVE_BRIEF (For Leads): Audit staff against their JG11-JG14 grades based on this year's data.
            2. PUBLIC_TEAM_PULSE (For Staff): Celebrate ${targetYear} wins and "Joy at Work".

            CRITICAL OUTPUT FORMAT:
            Return ONLY valid JSON.
            {
                "private": "Report text...",
                "public": "Report text..."
            }
        `;

        const generateUrl = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${API_KEY}`;
        const genResponse = await fetch(generateUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: { temperature: 0.2 } // Keep it highly analytical
            })
        });

        const genData = await genResponse.json();
        if (!genResponse.ok) {
            logger.error("[SmartAnalysis] Gemini API Error");
            throw new HttpsError("internal", "Gemini API error.");
        }

        let rawText = genData.candidates[0].content.parts[0].text;
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new HttpsError("internal", "AI did not return valid JSON.");

        const parsedObj = JSON.parse(jsonMatch[0]);

        return {
            private: parsedObj.private || parsedObj.Private || "Error generating private report.",
            public: parsedObj.public || parsedObj.Public || "Error generating public report."
        };

    } catch (error) {
        logger.error("[SmartAnalysis] Fatal Error:", error);
        throw new HttpsError("internal", error.message);
    }
});
