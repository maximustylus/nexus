const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

const MODEL_PRIORITY = [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
];
const SAFE_FALLBACK_MODEL = 'models/gemini-1.5-flash';

let resolvedModelName = null;

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
}

// RESPONSE PARSER
function extractText(data) {
    const candidate = data.candidates?.[0];
    if (!candidate) throw new HttpsError('internal', 'No response from AI.');
    const text = candidate.content?.parts?.[0]?.text;
    if (!text) throw new HttpsError('internal', 'Empty response from AI.');
    return text;
}

async function resolveModel(apiKey) {
    if (resolvedModelName) return resolvedModelName;
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!response.ok) return SAFE_FALLBACK_MODEL;
        const data = await response.json();
        const available = (data.models || []).map(m => m.name);
        for (const candidate of MODEL_PRIORITY) {
            const match = available.find(name => name === `models/${candidate}`);
            if (match) return (resolvedModelName = match);
        }
    } catch (e) {
        logger.warn(`Model resolution failed: ${e.message}`);
    }
    return SAFE_FALLBACK_MODEL;
}

// SYSTEM PROMPT
const SYSTEM_PROMPT = `
ROLE: You are AURA, the Nexus Intelligence Engine. You are a Senior Principal Allied Health Professional and a trained Peer Support Counselor.
TONE: Warm, professional, unhurried, empathetic, non-judgmental. No emojis. UK English only.

COUNSELING PROTOCOL:
Use OARS (Open-ended, Affirmations, Reflections, Summaries).
PHASE 1 (Turns 1-2): Validation and Listening. Ask ONE open question. Set "diagnosis_ready": false.
PHASE 2 (Turn 3+): 5As Action Phase. Once source is known, set "diagnosis_ready": true and provide Phase/Energy.

STRICT JSON OUTPUT:
{
  "reply": "Empathetic string under 60 words.",
  "diagnosis_ready": boolean,
  "phase": "HEALTHY" | "REACTING" | "INJURED" | "ILL" | null,
  "energy": 0-100 | null,
  "action": "Advice string" | null
}
`.trim();

// MAIN CHAT FUNCTION
exports.chatWithAura = onCall({
    cors: true,
    secrets: ["GEMINI_API_KEY"],
}, async (request) => {
    const { userText, history = [], role = 'Staff', prompt = '', isDemo } = request.data;
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) throw new HttpsError('failed-precondition', 'Missing API Key.');
    if (!request.auth && !isDemo) throw new HttpsError('unauthenticated', 'Access Denied.');

    validateInput({ userText, history, role, prompt });

    try {
        const modelName = await resolveModel(API_KEY);
        const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${API_KEY}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents: [
                    ...history.slice(-MAX_HISTORY_LEN).map(({ role, parts }) => ({ role, parts })),
                    { role: "user", parts: [{ text: `USER ROLE: ${role}\nCONTEXT: ${prompt}\nUSER SAYS: "${userText}"` }] }
                ],
                generationConfig: { temperature: 0.7, responseMimeType: "application/json" }
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "API Error");

        const rawText = extractText(data);
        const cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        return { text: cleanText, success: true };

    } catch (error) {
        logger.error("[AURA] Neural Failure", error.message);
        throw new HttpsError('internal', `Neural Link Unstable: ${error.message}`);
    }
});

// SMART ANALYSIS
exports.generateSmartAnalysis = onCall({ 
    cors: true, 
    secrets: ["GEMINI_API_KEY"] 
}, async (request) => {
    try {
        const { targetYear, staffProfiles, yearData, staffLoads } = request.data;
        const API_KEY = process.env.GEMINI_API_KEY;
        if (!API_KEY) throw new HttpsError("failed-precondition", "Missing API Key.");

        const modelName = await resolveModel(API_KEY);
        const promptText = `Generate Audit Report for ${targetYear}. Staff: ${JSON.stringify(staffProfiles)}. Workload: ${JSON.stringify(yearData)}. Return JSON {private: string, public: string}.`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: promptText }] }], 
                generationConfig: { 
                    temperature: 0.2,
                    responseMimeType: "application/json" 
                } 
            })
        });

        const genData = await response.json();
        if (!response.ok) throw new Error(genData.error?.message || "Audit API Error");

        const rawText = extractText(genData);
        const cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedObj = JSON.parse(cleanText);

        return { 
            private: parsedObj.private || parsedObj.PRIVATE || "No report generated.", 
            public: parsedObj.public || parsedObj.PUBLIC || "No report generated." 
        };
    } catch (error) {
        logger.error("[SMART_ANALYSIS] Failure", error.message);
        throw new HttpsError("internal", error.message);
    }
});
