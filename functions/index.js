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

// 🛡️ CRITICAL IGNITION SWITCH ADDED HERE:
const admin = require('firebase-admin');
admin.initializeApp();

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.warn('[NEXUS] GEMINI_API_KEY not in environment. Normal during local deploy analysis.');
}

const MODEL_PRIORITY = [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
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
const MAX_PROMPT_LEN   = 800;  
const MAX_ROLE_LEN     = 100;

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

const MAX_STAFF_PROFILES = 100;  
const MAX_JSON_CHARS     = 8000; 

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
    const serialised = JSON.stringify({ staffProfiles, yearData });
    if (serialised.length > MAX_JSON_CHARS) {
        throw new HttpsError(
            'invalid-argument',
            `Payload too large (${serialised.length} chars). Maximum is ${MAX_JSON_CHARS}.`
        );
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

const AURA_SYSTEM_PROMPT = `
ROLE:
You are AURA (Adaptive Understanding and Real-time Analytics), the Emotional Intelligence pillar of the NEXUS Smart Dashboard. You serve as a Clinical Performance and Wellbeing Coach for healthcare professionals at KKH and SingHealth. Your mission: "Master the grind. Protect the pulse."

CORE PERSONALITY:
- Tone: Natural, conversational, grounding. You are a peer, not a clinical textbook.
- Voice: Empathetic but professional. Use UK English spelling (categorise, programme, behaviour).
- Constraint: Never use em dashes. Use commas, colons, or full stops instead.
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
- Never use em dashes.
- UK English only.
- Never exceed 60 words in the reply field.

STRICT JSON OUTPUT (return ONLY this, no markdown, no preamble):
{
  "reply":            "<empathetic response, max 60 words, UK English, no em dashes>",
  "diagnosis_ready":  <true | false>,
  "phase":            "<HEALTHY | REACTING | INJURED | ILL | null>",
  "energy":           <integer 0-100 | null>,
  "action":           "<specific action from the continuum, max 10 words | null>"
}
`.trim();

const SMART_ANALYSIS_SYSTEM_PROMPT = `
You are an Expert Organizational Analyst and Wellbeing Advisor for a major healthcare institution. Your role is to generate confidential, highly accurate performance and wellbeing audits for ANY department within the hospital network (e.g., Clinical, Administrative, Facilities Management, Allied Health, Corporate, or Operations).

CRITICAL RULES:
1. TARGET IDENTITY: You must identify the specific team or department from the provided data. You MUST use their exact, formal team name in your report. Do not invent names or default to clinical terminology if they are not a clinical team.
2. DOMAIN ADAPTATION: Adapt your analysis to their specific function. If they are clinical, focus on patient care and clinical load. If they are non-clinical (e.g., facilities, marketing, admin), focus on operational efficiency, project delivery, and systemic workflows.
3. Your tone must be evidence-based, highly professional, empathetic, and written in UK English.

Return ONLY a valid JSON object. No markdown code blocks. No preamble.
Output schema: { "private": "<detailed operational/clinical report for department heads>", "public": "<summary safe for broader staff>" }
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
    
    // TEMPORARY BYPASS: Auth check disabled for testing
    // if (!request.auth && !isDemo) throw new HttpsError('unauthenticated', 'Access Denied.');

    validateChatInput({ userText, history, role, prompt });

    try {
        const modelName = await resolveModel();
        const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${API_KEY}`;

        const turnIndex      = history.length;
        const diagnosisReady = turnIndex >= 2;

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
            signal:  AbortSignal.timeout(15000), 
            body: JSON.stringify({
                systemInstruction: {               // CRITICAL FIX: camelCase
                    parts: [{ text: AURA_SYSTEM_PROMPT }],
                },
                contents: [
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
                    maxOutputTokens:  512,   
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
            'reply', 'diagnosis_ready', 'phase', 'energy', 'action',
        ]);

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

    // TEMPORARY BYPASS: Auth check disabled for testing
    // if (!request.auth) {
    //     throw new HttpsError('unauthenticated', 'Access Denied. Authentication required.');
    // }

    if (!API_KEY) throw new HttpsError('failed-precondition', 'AI service is not configured.');

        // TEAM NAME
            const { targetYear, staffProfiles, yearData, staffLoads, teamName = "the department" } = request.data;
        
            validateAnalysisInput({ targetYear, staffProfiles, yearData });
        
            try {
                const modelName = await resolveModel();
                const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${API_KEY}`;
        
                // TEAM IDENTITY
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
                systemInstruction: {   // CRITICAL FIX: camelCase
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
    schedule: "0 9 * * 1-5", // 9:00 AM, Monday through Friday
    timeZone: "Asia/Singapore", 
    timeoutSeconds: 60,
    memory: "256MiB"
}, async (event) => {
    const db = getFirestore();
    const messaging = getMessaging();

    try {
        console.log('[NEXUS] Waking up for daily Pulse Nudge...');

        // 1. Find all users who have a registered device token
        const usersSnap = await db.collection('users')
            .where('fcmToken', '!=', null)
            .get();

        if (usersSnap.empty) {
            console.log('[NEXUS] No users subscribed to notifications.');
            return null;
        }

        // 2. Extract the tokens into an array
        const tokens = [];
        usersSnap.forEach(doc => {
            const data = doc.data();
            if (data.fcmToken && data.notificationsEnabled !== false) {
                tokens.push(data.fcmToken);
            }
        });

        if (tokens.length === 0) return null;

        // 3. Construct the Push Notification
        const message = {
            notification: {
                title: 'Social Battery ⚡ Check',
                body: 'Take 30 seconds to log your Energy and Focus levels with AURA Pulse!',
            },
            tokens: tokens, 
        };

        // 4. Fire the payload!
        const response = await messaging.sendEachForMulticast(message);
        console.log(`[NEXUS] Nudge Report: ${response.successCount} sent successfully.`);

        return null;
    } catch (error) {
        console.error('[NEXUS] Critical error sending pulse nudge:', error);
        return null;
    }
});
