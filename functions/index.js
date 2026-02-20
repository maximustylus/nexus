const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_PRIORITY = [
    'gemini-2.0-flash',     // best if available
    'gemini-1.5-flash',     // reliable fallback
    'gemini-1.5-pro',       // larger context fallback
];
const SAFE_FALLBACK_MODEL = 'models/gemini-1.5-flash';

let resolvedModelName = null;

async function resolveModel() {
    if (resolvedModelName) return resolvedModelName;

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
        const available = (data.models || []).map(m => m.name);

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
        logger.warn(`[AURA] Model discovery failed: ${e.message}. Using safe fallback.`);
    }

    resolvedModelName = SAFE_FALLBACK_MODEL;
    return resolvedModelName;
}

// SYSTEM PROMPT
const SYSTEM_PROMPT = `
ROLE:
You are AURA (Adaptive Understanding & Real-time Analytics), the Emotional Intelligence pillar of the NEXUS Smart Dashboard. You serve as a Clinical Performance and Wellbeing Coach for healthcare professionals at SingHealth. Your mission is captured in your tagline: "Master the grind. Protect the pulse."

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

1. EMPATHY & VALIDATION (OARS technique): A short, warm response that validates their current state. Strict limit: under 100 words. Never be clinical or textbook. Sound like a trusted colleague.

2. PULSE CHECK: State their Phase and a specific Energy % based on their sentiment. Example: "Your pulse reads: REACTING at 62%."

3. ACTION TO TAKE: One specific, actionable suggestion from the Mental Health Continuum. Examples: "Break tasks into small steps," "Recognise your limits today," "Seek a confidential chat with your EAP."

CRITICAL RULES:
- If the user is in the ILL phase: be extremely gentle. Prioritise "Arrange" actions (professional referral). Do not minimise their state.
- Prioritise Ghost Protocol tone (anonymity, no judgement) so staff feel completely safe sharing.
- Never use em-dashes in your reply. Use commas, colons, or full stops instead.
- No emoji and emoticons.
- No bullet or point form.
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

// INPUT VALIDATION
const MAX_USER_TEXT   = 500;
const MAX_HISTORY_LEN = 20; 

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

// RESPONSE PARSER
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

// MAIN FUNCTION
exports.chatWithAura = onCall({
    cors: true,
    secrets: ["GEMINI_API_KEY"],
}, async (request) => {

    const { userText, history = [], role = 'Staff', prompt = '', isDemo } = request.data;

    // Auth gate
    if (!request.auth && !isDemo) {
        throw new HttpsError('unauthenticated', 'Access Denied.');
    }

    validateInput({ userText, history, role, prompt });

    try {
        const modelName = await resolveModel();
        const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${API_KEY}`;
        const requestBody = {
            system_instruction: {
                parts: [{ text: SYSTEM_PROMPT }]
            },
            contents: [
                ...history
                    .slice(-MAX_HISTORY_LEN)
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
                maxOutputTokens: 512, 
                responseMimeType: "application/json",
            }
        };

        const response = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(requestBody),
        });

        const data = await response.json();

        if (!response.ok) {
            logger.error("[AURA] API Failure", {
                status:  response.status,
                message: data.error?.message,
                model:   modelName,
            });
            if (response.status === 404) {
                resolvedModelName = null;
                logger.warn("[AURA] Model cache cleared due to 404 — will re-discover on next request.");
            }
            throw new Error(data.error?.message ?? "API Handshake Failed");
        }

        const rawText = extractText(data);
        const cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
            JSON.parse(cleanText);
        } catch (_) {
            logger.warn("[AURA] Model returned non-JSON. Raw:", cleanText.slice(0, 200));
            throw new HttpsError('internal', 'Model returned malformed response. Please retry.');
        }

        return { text: cleanText, success: true };

    } catch (error) {
        if (error instanceof HttpsError) throw error;

        logger.error("[AURA] Neural Failure", error.message);
        throw new HttpsError('internal', `Neural Link Unstable: ${error.message}`);
    }
});

// SMART ANALYSIS FUNCTION
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

        const modelName = await resolveModel(API_KEY);
        const promptText = `
            ACT AS: Senior Clinical Lead at a Senior Management Level with Senior Supervisory Skills at a Healthcare institution.
            CONTEXT: Annual Performance Review for Year ${targetYear}.
            DATA: ${JSON.stringify(staffProfiles)}
            WORKLOAD: ${JSON.stringify(yearData)}
            CLINICAL_LOADS: ${JSON.stringify(staffLoads)}

            TASK: Generate TWO reports for ${targetYear}.
            1. PRIVATE_EXECUTIVE_BRIEF (For Leads): Audit staff against their JG11-JG16 grades based on this year's data.
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
                generationConfig: { temperature: 0.2 }
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
