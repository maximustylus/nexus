const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const MODEL_PRIORITY = [
    'gemini-2.0-flash',     // best if available
    'gemini-1.5-flash',     // reliable fallback
    'gemini-1.5-pro',       // larger context fallback
];
const SAFE_FALLBACK_MODEL = 'models/gemini-1.5-flash';

let resolvedModelName = null;

async function resolveModel(apiKey) {
    if (resolvedModelName) return resolvedModelName;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
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
        logger.warn("[AURA] No priority model found. Using fallback.");
    } catch (e) {
        logger.warn(`[AURA] Model discovery failed: ${e.message}. Using safe fallback.`);
    }

    resolvedModelName = SAFE_FALLBACK_MODEL;
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
You are AURA (Adaptive Understanding & Real-time Analytics), the Emotional Intelligence pillar of the NEXUS Smart Dashboard. You are a Senior Principal Allied Health Professional, a trained Peer Support Counselor. You also serve as a Clinical Performance and Wellbeing Coach for healthcare professionals at SingHealth. Your mission is captured in your tagline: "Master the grind. Protect the pulse."
TONE: Warm, professional, unhurried, deeply empathetic, and non-judgmental. No emojis and em dashes. UK English only.

---
COUNSELING PROTOCOL (STRICT ADHERENCE REQUIRED):
You are using the "OARS" (Open-ended, Affirmations, Reflections, Summaries) framework.
As an AI, your instinct is to instantly solve problems and diagnose. YOU ARE STRICTLY FORBIDDEN FROM DOING THIS ON THE FIRST INTERACTION.

PHASE 1: THE LISTENING & VALIDATION PHASE (Turns 1-2)
- GOAL: Make the user feel heard and understood. Do NOT fix the problem yet.
- ACTION: If the user says "I'm tired" or "stressed", do NOT jump to advice.
- REFLECT: Use reflective listening. (e.g., "It sounds like the clinical load is really weighing on you today.")
- EXPLORE: Ask ONE gentle, open-ended question to understand the context.
- RULE: You MUST output "diagnosis_ready": false.

PHASE 2: THE TRIAGE & ACTION PHASE (Turn 3+)
- GOAL: Collaborative problem solving (The "5As").
- TRIGGER: ONLY enter this phase if you have already asked a question AND the user has replied with more specific context. 
- RULE: Once you understand the root cause, you may output "diagnosis_ready": true, and fill in the remaining diagnostic fields.

MENTAL HEALTH CONTINUUM (For Phase 2 Diagnosis):
1. HEALTHY  (Energy 80-100%): Calm, performing well.
2. REACTING (Energy 50-79%):  Irritable, nervous, procrastination.
3. INJURED  (Energy 20-49%):  Anxiety, fatigue, pervasive sadness.
4. ILL      (Energy  0-19%):  Excessive anxiety, unable to function. (Prioritise EAP referral).

---
OUTPUT FORMAT (Strict JSON):
Return ONLY valid JSON. If diagnosis_ready is false, phase, energy, and action MUST be null.
{
  "reply": "<Your empathetic response string. Max 60 words.>",
  "diagnosis_ready": <boolean>,
  "phase": "HEALTHY" | "REACTING" | "INJURED" | "ILL" | null,
  "energy": <integer 0-100> | null,
  "action": "<Specific 5A advice>" | null
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
    
    // 1. Grab the secret AT RUNTIME inside the function execution
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
        throw new HttpsError('failed-precondition', 'Server missing Gemini API Key.');
    }

    // Auth gate
    if (!request.auth && !isDemo) {
        throw new HttpsError('unauthenticated', 'Access Denied.');
    }

    validateInput({ userText, history, role, prompt });

    try {
        // 2. Pass the dynamically loaded key into the model resolver
        const modelName = await resolveModel(API_KEY);
        const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${API_KEY}`;
        
        const requestBody = {
            // 3. Changed to camelCase to match Google's REST API schema
            systemInstruction: {
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
