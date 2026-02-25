'use strict';

/**
 * ==============================================================================
 * NEXUS CLOUD FUNCTIONS
 * ==============================================================================
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

// 🛡️ CRITICAL IGNITION SWITCH
const admin = require('firebase-admin');
admin.initializeApp();

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.warn('[NEXUS] GEMINI_API_KEY not in environment. Normal during local deploy analysis.');
}

const MODEL_PRIORITY = [
    'gemini-2.5-pro', // 🛡️ NEW: Future-proofing for multimodal heavy lifting
    'gemini-2.0-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
];
const SAFE_FALLBACK_MODEL = 'models/gemini-1.5-flash';

let modelResolutionPromise = null;

async function resolveModel() {
    if (modelResolutionPromise) return modelResolutionPromise;

    modelResolutionPromise = (async () => {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
            const response = await fetch(url, {
                signal: AbortSignal.timeout(8000), 
            });

            if (!response.ok) {
                logger.warn(`[NEXUS] Model list returned ${response.status}. Using fallback.`);
                return SAFE_FALLBACK_MODEL;
            }

            const data = await response.json();
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
            logger.warn(`[NEXUS] Model discovery failed: ${e.message}. Using fallback.`);
            modelResolutionPromise = null;
        }
        return SAFE_FALLBACK_MODEL;
    })();

    return modelResolutionPromise;
}

const MAX_USER_TEXT    = 500;
const MAX_HISTORY_LEN  = 20;
const MAX_PROMPT_LEN   = 8000;  
const MAX_ROLE_LEN     = 100;

// 🛡️ NEW: Validate incoming attachments (PDFs, Docs, Images)
function validateChatInput({ userText, history, role, prompt, attachments }) {
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
    if (attachments !== undefined) {
        if (!Array.isArray(attachments)) {
            throw new HttpsError('invalid-argument', 'attachments must be an array.');
        }
        if (attachments.length > 5) {
            throw new HttpsError('invalid-argument', 'Maximum 5 attachments allowed per request.');
        }
        for (const att of attachments) {
            if (!att.mimeType || !att.data) {
                throw new HttpsError('invalid-argument', 'Attachments must include mimeType and base64 data.');
            }
        }
    }
}

const MAX_STAFF_PROFILES = 100;  
const MAX_JSON_CHARS     = 8000; 

function validateAnalysisInput({ targetYear, staffProfiles, yearData }) {
    if (!targetYear || typeof targetYear !== 'number') throw new HttpsError('invalid-argument', 'targetYear must be a number.');
    if (!staffProfiles || !Array.isArray(staffProfiles)) throw new HttpsError('invalid-argument', 'staffProfiles must be an array.');
    if (staffProfiles.length > MAX_STAFF_PROFILES) throw new HttpsError('invalid-argument', `staffProfiles exceeds limit.`);
    if (!yearData) throw new HttpsError('invalid-argument', 'yearData is required.');
    
    const serialised = JSON.stringify({ staffProfiles, yearData });
    if (serialised.length > MAX_JSON_CHARS) {
        throw new HttpsError('invalid-argument', `Payload too large. Maximum is ${MAX_JSON_CHARS}.`);
    }
}

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

// 🛡️ UPGRADED TRI-MODE AI PROMPT (v3.0 - Multimodal Edition)
const AURA_SYSTEM_PROMPT = `
ROLE:
You are AURA (Adaptive Understanding and Real-time Analytics). You are a Quad-Mode AI deployed at KKH/SingHealth. You must dynamically analyze the user's conversational intent and instantly switch your active persona to MODE 1 (Coach), MODE 2 (Assistant), MODE 3 (Data Entry), or MODE 4 (Research).

CRITICAL OVERRIDE: 
If the user's prompt contains a request to update, log, or change a numerical metric (e.g., "Log 35 patients for January"), you MUST INSTANTLY switch to MODE 3 (DATA_ENTRY). Do NOT use Motivational Interviewing. Do NOT ask about their feelings. Execute the database transaction immediately.

=========================================
MODE 1: WELLBEING COACH (Intent: Emotions, stress, psychological check-ins)
=========================================
CORE: You are a natural, grounding peer. Use British English spelling. Never use em dashes.
FRAMEWORKS: You strictly utilize Motivational Interviewing via Open ended questions, Affirmations, Reflection and Summarising.
SCORING LOGIC (0-100% Social Battery):
- RPE 0-2 (Easy): Energy = 80-100 (HEALTHY)
- RPE 3-5 (Moderate): Energy = 50-79 (REACTING)
- RPE 6-8 (Heavy): Energy = 20-49 (INJURED)
- RPE 9-10 (Exhaustion): Energy = 0-19 (ILL)

=========================================
MODE 2: ADMINISTRATOR'S ASSISTANT (Intent: Operational documents, Scheduling, Memos)
=========================================
CORE: Administrative and operational support only. No HR/finance advice.
CRITICAL GENERATION RULES:
1. INSTANT GENERATION: Generate the requested document IMMEDIATELY in the same turn.
2. THE ACTION FIELD: The "action" JSON field MUST strictly contain ONLY the final, complete document text.
3. THE NULL RULE: If you do not have enough information, you MUST set "action": null.

=========================================
MODE 3: DATA ENTRY AGENT (Intent: Updating metrics, logging workload)
=========================================
CORE: You act as a safe database gateway. You MUST map requests EXACTLY to the known Firestore schema below.

KNOWN FIRESTORE SCHEMA:
Option A: TEAM / DEPARTMENT DATA
Trigger: User says "team", "department", or "attendance".
- target_collection: "monthly_workload"
- target_doc: The timeframe formatted as "mmm_yyyy" (e.g., "jan_2026")
- target_field: "patient_attendance" OR "patient_load"

Option B: PERSONAL STAFF DATA
Trigger: User says "my workload", "my cases", "my patients".
- target_collection: "staff_loads"
- target_doc: The exact database ID provided in the System Note (e.g., "alif").
- target_field: "data"
- target_month: <integer 0-11> (0=Jan, 1=Feb, 2=Mar, etc.)

=========================================
MODE 4: RESEARCH / GRANT WRITER (Intent: Academic review, Methodology, File Parsing)
=========================================
CORE: If the user provides an academic system override OR attaches files for analysis, you are in MODE 4.
OUTPUT: Place your highly academic, rigorous literature review, DAGs, or grant proposals inside the "action" field so the user can easily export it to Word.

=========================================
STRICT JSON OUTPUT FORMAT (Return ONLY this exact structure, no markdown code blocks, no preamble):
{
  "reply": "<Conversational response.>",
  "mode": "<COACH | ASSISTANT | DATA_ENTRY | RESEARCH>",
  "diagnosis_ready": <true | false>,
  "phase": "<HEALTHY | REACTING | INJURED | ILL | null>",
  "energy": <integer 0-100 | null>,
  "action": "<If COACH: Assessment summary. If ASSISTANT/RESEARCH: The final document text. MUST BE null IF STILL GATHERING DETAILS.>",
  "db_workload": {
     "target_collection": "<string | null>",
     "target_doc": "<string | null>",
     "target_field": "<string | null>",
     "target_value": <number | null>,
     "target_month": <number 0-11 | null>
  }
}
`.trim();

// 🛡️ SMART ANALYSIS PROMPT: Automated Deep Audits
const SMART_ANALYSIS_SYSTEM_PROMPT = `
ROLE:
You are an Expert Organizational Analyst and Wellbeing Advisor for KKH/SingHealth.
CRITICAL RULES:
1. TARGET IDENTITY: You must identify the specific team or department.
2. DOMAIN ADAPTATION: Adapt your analysis to their specific function.
3. TONE & FORMATTING: Evidence-based, highly professional, empathetic, British English. No em dashes.

STRICT JSON OUTPUT FORMAT:
{ 
  "private": "<Detailed operational/clinical report for department heads.>", 
  "public": "<Summary safe for broader staff distribution.>" 
}
`.trim();

// =============================================================================
// FUNCTION 1: chatWithAura
// =============================================================================
exports.chatWithAura = onCall({
    cors: true,
    secrets: ['GEMINI_API_KEY'],
}, async (request) => {

    // 🛡️ NEW: Extract attachments from the incoming request
    const { userText, history = [], role = 'Staff', prompt = '', isDemo, attachments = [] } = request.data;

    if (!API_KEY) throw new HttpsError('failed-precondition', 'AI service is not configured.');

    validateChatInput({ userText, history, role, prompt, attachments });

    try {
        const modelName = await resolveModel();
        const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${API_KEY}`;
        const turnIndex      = history.length;
        const diagnosisReady = turnIndex >= 4;

        const contextualMessage = [
            `USER ROLE: ${role}`,
            prompt ? `CONTEXT/OVERRIDE: ${prompt}` : '',
            `CONVERSATION TURN: ${Math.floor(turnIndex/2) + 1}`,
            diagnosisReady
                ? 'INSTRUCTION: If in COACH mode, and sufficient context is gathered, provide full Phase/Energy/Action assessment now.'
                : 'INSTRUCTION: If this is a Wellbeing check-in (COACH mode), Phase 1 is active: Listen, validate, and ask one open question to gauge their RPE (0-10). If this is an Admin (ASSISTANT), Database (DATA_ENTRY), or Academic (RESEARCH) request, IGNORE the RPE rule and execute the task immediately.',
            `USER SAYS: "${userText.trim()}"`,
        ].filter(Boolean).join('\n');

        // 🛡️ NEW: Build the multimodal parts array
        const userParts = [{ text: contextualMessage }];
        
        // If the user attached files (PDFs, Images), append them to the current turn!
        if (attachments.length > 0) {
            for (const att of attachments) {
                userParts.push({
                    inlineData: {
                        mimeType: att.mimeType,
                        data: att.data
                    }
                });
            }
            logger.info(`[AURA] Processing ${attachments.length} multimodal attachments.`);
        }

        const response = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            signal:  AbortSignal.timeout(30000), // Extended timeout for large files
            body: JSON.stringify({
                systemInstruction: {                
                    parts: [{ text: AURA_SYSTEM_PROMPT }],
                },
                contents: [
                    ...history
                        .slice(-MAX_HISTORY_LEN)
                        .map(({ role, parts }) => ({ role, parts })),
                    {
                        role:  'user',
                        parts: userParts, // 👈 Multimodal injection happens here!
                    },
                ],
                generationConfig: {
                    temperature:      0.7,
                    maxOutputTokens:  8192, // 🛡️ MASSIVE INCREASE: 8k tokens for giant research reviews 
                    responseMimeType: 'application/json',
                },
            }),
        });

        const data = await response.json();

        if (response.status === 404) {
            logger.warn('[NEXUS] Model 404 — clearing cache for re-discovery.');
            modelResolutionPromise = null;
        }

        if (!response.ok) {
            logger.error('[AURA] API Failure', {
                status:  response.status,
                message: data.error?.message,
                model:   modelName,
            });
            throw new Error(data.error?.message ?? 'API Error');
        }

        const rawText = extractText(data); 

        const { text: cleanText, parsed } = parseJsonResponse(rawText, [
            'reply', 'mode', 'diagnosis_ready', 'phase', 'energy', 'action',
        ]);

        return { text: cleanText, success: true };

    } catch (error) {
        if (error instanceof HttpsError) throw error;
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
    if (!API_KEY) throw new HttpsError('failed-precondition', 'AI service is not configured.');

    const { targetYear, staffProfiles, yearData, staffLoads, teamName = "the department" } = request.data;
        
    validateAnalysisInput({ targetYear, staffProfiles, yearData });
        
    try {
        const modelName = await resolveModel();
        const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${API_KEY}`;
        
        const promptText = `
        TEAM IDENTITY: ${teamName}
        Generate a comprehensive staff wellbeing audit report for the year ${targetYear} for the team identified above.
        
        STAFF PROFILES (${staffProfiles.length} records):
        ${JSON.stringify(staffProfiles, null, 2)}
        
        WORKLOAD DATA:
        ${JSON.stringify(yearData, null, 2)}
        
        ${staffLoads ? `STAFF LOAD INDICATORS:\n${JSON.stringify(staffLoads, null, 2)}` : ''}
        
        OUTPUT REQUIREMENTS:
        - "private": A detailed clinical report for department heads (1000-2000 words). Include trend analysis, risk flags, and specific recommendations.
        - "public": A positive, encouraging summary safe for all staff (200-500 words). Focus on collective strengths and general wellbeing initiatives.
        
        Return ONLY the JSON object. No markdown.
        `.trim();

        const response = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            signal:  AbortSignal.timeout(30000), 
            body: JSON.stringify({
                systemInstruction: {   
                    parts: [{ text: SMART_ANALYSIS_SYSTEM_PROMPT }],
                },
                contents: [{
                    role:  'user',
                    parts: [{ text: promptText }],
                }],
                generationConfig: {
                    temperature:      0.2,  
                    maxOutputTokens:  2048, 
                    responseMimeType: 'application/json',
                },
            }),
        });

        const genData = await response.json();

        if (!response.ok) throw new Error(genData.error?.message ?? 'Audit API Error');

        const rawText = extractText(genData);
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

// =============================================================================
// FUNCTION 3: scheduledPulseNudge (Runs 9:00 AM, Mon-Fri)
// =============================================================================
exports.scheduledPulseNudge = onSchedule({
    schedule: "0 9 * * 1-5", 
    timeZone: "Asia/Singapore", 
    timeoutSeconds: 60,
    memory: "256MiB"
}, async (event) => {
    const db = getFirestore();
    const messaging = getMessaging();

    try {
        const usersSnap = await db.collection('users').where('fcmToken', '!=', null).get();
        if (usersSnap.empty) return null;

        const tokens = [];
        usersSnap.forEach(doc => {
            const data = doc.data();
            if (data.fcmToken && data.notificationsEnabled !== false) tokens.push(data.fcmToken);
        });

        if (tokens.length === 0) return null;

        const message = {
            notification: {
                title: 'Social Battery ⚡ Check',
                body: 'Take 30 seconds to log your Energy and Focus levels with AURA Pulse!',
            },
            data: { click_action: 'FLUTTER_NOTIFICATION_CLICK', target_tab: 'pulse' },
            tokens: tokens, 
        };

        await messaging.sendEachForMulticast(message);
        return null;
    } catch (error) {
        console.error('[NEXUS] Critical error sending pulse nudge:', error);
        return null;
    }
});
