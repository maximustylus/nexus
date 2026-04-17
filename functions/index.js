'use strict';

/**
 * ==============================================================================
 * NEXUS CLOUD FUNCTIONS v1.53
 * ==============================================================================
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

const admin = require('firebase-admin');
admin.initializeApp();

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.warn('[NEXUS] GEMINI_API_KEY not in environment. Normal during local deploy analysis.');
}

const MODEL_PRIORITY = [
    'gemini-2.5-pro',
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
            const url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + API_KEY;
            const response = await fetch(url, {
                signal: AbortSignal.timeout(8000),
            });

            if (!response.ok) {
                logger.warn('[NEXUS] Model list returned ' + response.status + '. Using fallback.');
                return SAFE_FALLBACK_MODEL;
            }

            const data = await response.json();
            const available = (data.models || []).map(m => m.name);

            for (const candidate of MODEL_PRIORITY) {
                const match = available.find(name => name === 'models/' + candidate);
                if (match) {
                    logger.info('[NEXUS] Model resolved: ' + match);
                    return match;
                }
            }

            logger.warn('[NEXUS] No priority model matched. Using fallback.');
        } catch (e) {
            logger.warn('[NEXUS] Model discovery failed: ' + e.message + '. Using fallback.');
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

function validateChatInput({ userText, history, role, prompt, attachments }) {
    if (!userText || typeof userText !== 'string') {
        throw new HttpsError('invalid-argument', 'userText is required and must be a string.');
    }
    if (userText.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'userText cannot be empty.');
    }
    if (userText.length > MAX_USER_TEXT) {
        throw new HttpsError('invalid-argument', 'userText exceeds ' + MAX_USER_TEXT + ' character limit.');
    }
    if (history !== undefined) {
        if (!Array.isArray(history)) {
            throw new HttpsError('invalid-argument', 'history must be an array.');
        }
        if (history.length > MAX_HISTORY_LEN) {
            throw new HttpsError('invalid-argument', 'history exceeds ' + MAX_HISTORY_LEN + ' turn limit.');
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
            throw new HttpsError('invalid-argument', 'role exceeds ' + MAX_ROLE_LEN + ' character limit.');
        }
    }
    if (prompt !== undefined) {
        if (typeof prompt !== 'string') {
            throw new HttpsError('invalid-argument', 'prompt must be a string.');
        }
        if (prompt.length > MAX_PROMPT_LEN) {
            throw new HttpsError('invalid-argument', 'prompt exceeds ' + MAX_PROMPT_LEN + ' character limit.');
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
    if (staffProfiles.length > MAX_STAFF_PROFILES) throw new HttpsError('invalid-argument', 'staffProfiles exceeds limit.');
    if (!yearData) throw new HttpsError('invalid-argument', 'yearData is required.');

    const serialised = JSON.stringify({ staffProfiles, yearData });
    if (serialised.length > MAX_JSON_CHARS) {
        throw new HttpsError('invalid-argument', 'Payload too large. Maximum is ' + MAX_JSON_CHARS + '.');
    }
}

function extractText(data) {
    const candidate = data.candidates && data.candidates[0];

    if (!candidate) {
        const reason = (data.promptFeedback && data.promptFeedback.blockReason) || 'unknown';
        logger.warn('[NEXUS] Response blocked. Reason: ' + reason);
        throw new HttpsError(
            'internal',
            reason === 'unknown'
                ? 'No response generated. Please try rephrasing.'
                : 'Response blocked by safety filter (' + reason + '). Please rephrase.'
        );
    }

    if (candidate.finishReason === 'SAFETY') {
        throw new HttpsError('internal', 'Response flagged by content safety filter. Please rephrase.');
    }

    const text = candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text;
    if (!text) {
        throw new HttpsError('internal', 'AI returned an empty response.');
    }

    return text;
}

function parseJsonResponse(rawText, requiredFields) {
    if (!requiredFields) requiredFields = [];
    const stripped   = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const jsonStart  = stripped.indexOf('{');
    const jsonEnd    = stripped.lastIndexOf('}') + 1;

    if (jsonStart === -1 || jsonEnd === 0) {
        throw new HttpsError('internal', 'AI returned a non-JSON response. Please retry.');
    }

    const jsonStr = stripped.substring(jsonStart, jsonEnd);

    var parsed;
    try {
        parsed = JSON.parse(jsonStr);
    } catch (e) {
        throw new HttpsError('internal', 'AI returned malformed JSON. Please retry.');
    }

    for (const field of requiredFields) {
        if (!(field in parsed)) {
            logger.warn('[NEXUS] Response missing required field: ' + field);
        }
    }

    return { text: jsonStr, parsed: parsed };
}

var AURA_SYSTEM_PROMPT = [
    'ROLE:',
    'You are AURA (Adaptive Understanding and Real-time Analytics). You are a Quad-Mode AI deployed at KKH/SingHealth. You must dynamically analyze the user\'s conversational intent and instantly switch your active persona to MODE 1 (Coach), MODE 2 (Assistant), MODE 3 (Data Entry), or MODE 4 (Research).',
    '',
    'CRITICAL OVERRIDE:',
    'If the user\'s prompt contains a request to update, log, or change a numerical metric (e.g., "Log 35 patients for January"), you MUST INSTANTLY switch to MODE 3 (DATA_ENTRY). Do NOT use Motivational Interviewing. Do NOT ask about their feelings. Execute the database transaction immediately.',
    '',
    '=========================================',
    'MODE 1: WELLBEING COACH (Intent: Emotions, stress, psychological check-ins)',
    '=========================================',
    'CORE: You are a natural, grounding peer. Use British English spelling. Never use em dashes.',
    'FRAMEWORKS: You strictly utilize Motivational Interviewing via Open ended questions, Affirmations, Reflection and Summarising.',
    'SCORING LOGIC (0-100% Social Battery):',
    '- RPE 0-2 (Easy): Energy = 80-100 (HEALTHY)',
    '- RPE 3-5 (Moderate): Energy = 50-79 (REACTING)',
    '- RPE 6-8 (Heavy): Energy = 20-49 (INJURED)',
    '- RPE 9-10 (Exhaustion): Energy = 0-19 (ILL)',
    '',
    '=========================================',
    'MODE 2: ADMINISTRATOR\'S ASSISTANT (Intent: Operational documents, Scheduling, Memos)',
    '=========================================',
    'CORE: Administrative and operational support only. No HR/finance advice.',
    'CRITICAL GENERATION RULES:',
    '1. INSTANT GENERATION: Generate the requested document IMMEDIATELY in the same turn.',
    '2. THE ACTION FIELD: The "action" JSON field MUST strictly contain ONLY the final, complete document text.',
    '3. THE NULL RULE: If you do not have enough information, you MUST set "action": null.',
    '',
    '=========================================',
    'MODE 3: DATA ENTRY AGENT (Intent: Updating metrics, logging workload)',
    '=========================================',
    'CORE: You act as a safe database gateway. You MUST map requests EXACTLY to the known Firestore schema below.',
    '',
    'KNOWN FIRESTORE SCHEMA:',
    'Option A: TEAM / DEPARTMENT DATA',
    'Trigger: User says "team", "department", or "attendance".',
    '- target_collection: "monthly_workload"',
    '- target_doc: The timeframe formatted as "mmm_yyyy" (e.g., "jan_2026")',
    '- target_field: "patient_attendance" OR "patient_load"',
    '',
    'Option B: PERSONAL STAFF DATA',
    'Trigger: User says "my workload", "my cases", "my patients".',
    '- target_collection: "staff_loads"',
    '- target_doc: The exact database ID provided in the System Note (e.g., "alif").',
    '- target_field: "data"',
    '- target_month: <integer 0-11> (0=Jan, 1=Feb, 2=Mar, etc.)',
    '',
    '=========================================',
    'MODE 4: RESEARCH / GRANT WRITER (Intent: Academic review, Methodology, File Parsing)',
    '=========================================',
    'CORE: If the user provides an academic system override OR attaches files for analysis, you are in MODE 4.',
    'OUTPUT: Place your highly academic, rigorous literature review, DAGs, or grant proposals inside the "action" field so the user can easily export it to Word.',
    '',
    '=========================================',
    'STRICT JSON OUTPUT FORMAT (Return ONLY this exact structure, no markdown code blocks, no preamble):',
    '{',
    '  "reply": "<Conversational response.>",',
    '  "mode": "<COACH | ASSISTANT | DATA_ENTRY | RESEARCH>",',
    '  "diagnosis_ready": <true | false>,',
    '  "phase": "<HEALTHY | REACTING | INJURED | ILL | null>",',
    '  "energy": <integer 0-100 | null>,',
    '  "action": "<If COACH: Assessment summary. If ASSISTANT/RESEARCH: The final document text. MUST BE null IF STILL GATHERING DETAILS.>",',
    '  "db_workload": {',
    '     "target_collection": "<string | null>",',
    '     "target_doc": "<string | null>",',
    '     "target_field": "<string | null>",',
    '     "target_value": <number | null>,',
    '     "target_month": <number 0-11 | null>',
    '  }',
    '}'
].join('\n');

var SMART_ANALYSIS_SYSTEM_PROMPT = [
    'ROLE:',
    'You are an Expert Organizational Analyst and Wellbeing Advisor for KKH/SingHealth.',
    'CRITICAL RULES:',
    '1. TARGET IDENTITY: You must identify the specific team or department.',
    '2. DOMAIN ADAPTATION: Adapt your analysis to their specific function.',
    '3. TONE & FORMATTING: Evidence-based, highly professional, empathetic, British English. No em dashes.',
    '',
    'STRICT JSON OUTPUT FORMAT:',
    '{',
    '  "private": "<Detailed operational/clinical report for department heads.>",',
    '  "public": "<Summary safe for broader staff distribution.>"',
    '}'
].join('\n');

// =============================================================================
// FUNCTION 1: chatWithAura
// =============================================================================
exports.chatWithAura = onCall({
    cors: true,
    secrets: ['GEMINI_API_KEY'],
    timeoutSeconds: 120,
}, async (request) => {

    var userText = request.data.userText;
    var history = request.data.history || [];
    var role = request.data.role || 'Staff';
    var prompt = request.data.prompt || '';
    var isDemo = request.data.isDemo;
    var attachments = request.data.attachments || [];

    if (!API_KEY) throw new HttpsError('failed-precondition', 'AI service is not configured.');

    validateChatInput({ userText: userText, history: history, role: role, prompt: prompt, attachments: attachments });

    try {
        var modelName = await resolveModel();
        var url = 'https://generativelanguage.googleapis.com/v1beta/' + modelName + ':generateContent?key=' + API_KEY;
        var turnIndex      = history.length;
        var diagnosisReady = turnIndex >= 4;

        var contextParts = [
            'USER ROLE: ' + role,
        ];
        if (prompt) contextParts.push('CONTEXT/OVERRIDE: ' + prompt);
        contextParts.push('CONVERSATION TURN: ' + (Math.floor(turnIndex/2) + 1));
        if (diagnosisReady) {
            contextParts.push('INSTRUCTION: If in COACH mode, and sufficient context is gathered, provide full Phase/Energy/Action assessment now.');
        } else {
            contextParts.push('INSTRUCTION: If this is a Wellbeing check-in (COACH mode), Phase 1 is active: Listen, validate, and ask one open question to gauge their RPE (0-10). If this is an Admin (ASSISTANT), Database (DATA_ENTRY), or Academic (RESEARCH) request, IGNORE the RPE rule and execute the task immediately.');
        }
        contextParts.push('USER SAYS: "' + userText.trim() + '"');

        var contextualMessage = contextParts.join('\n');

        var isStrictFormatting = prompt.indexOf('Project HUGE') !== -1 || prompt.indexOf('Magnify Mama') !== -1;
        var dynamicTemperature = isStrictFormatting ? 0.1 : 0.7;

        var userParts = [{ text: contextualMessage }];

        if (attachments.length > 0) {
            for (var ai = 0; ai < attachments.length; ai++) {
                userParts.push({
                    inlineData: {
                        mimeType: attachments[ai].mimeType,
                        data: attachments[ai].data
                    }
                });
            }
            logger.info('[AURA] Processing ' + attachments.length + ' multimodal attachments.');
        }

        var trimmedHistory = history.slice(-MAX_HISTORY_LEN).map(function(h) { return { role: h.role, parts: h.parts }; });

        var response = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            signal:  AbortSignal.timeout(90000),
            body: JSON.stringify({
                systemInstruction: {
                    parts: [{ text: AURA_SYSTEM_PROMPT }],
                },
                contents: trimmedHistory.concat([{
                    role:  'user',
                    parts: userParts,
                }]),
                generationConfig: {
                    temperature:      dynamicTemperature,
                    maxOutputTokens:  8192,
                    responseMimeType: 'application/json',
                },
            }),
        });

        var data = await response.json();

        if (response.status === 404) {
            logger.warn('[NEXUS] Model 404 — clearing cache for re-discovery.');
            modelResolutionPromise = null;
        }

        if (!response.ok) {
            logger.error('[AURA] API Failure', {
                status:  response.status,
                message: data.error && data.error.message,
                model:   modelName,
            });
            throw new Error((data.error && data.error.message) || 'API Error');
        }

        var rawText = extractText(data);

        var result = parseJsonResponse(rawText, [
            'reply', 'mode', 'diagnosis_ready', 'phase', 'energy', 'action',
        ]);

        return { text: result.text, success: true };

    } catch (error) {
        if (error instanceof HttpsError) throw error;
        logger.error('[AURA] Neural Failure', error.message);
        throw new HttpsError('internal', 'Neural Link Unstable: ' + error.message);
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

    var targetYear = request.data.targetYear;
    var staffProfiles = request.data.staffProfiles;
    var yearData = request.data.yearData;
    var staffLoads = request.data.staffLoads;
    var teamName = request.data.teamName || 'the department';

    validateAnalysisInput({ targetYear: targetYear, staffProfiles: staffProfiles, yearData: yearData });

    try {
        var modelName = await resolveModel();
        var url = 'https://generativelanguage.googleapis.com/v1beta/' + modelName + ':generateContent?key=' + API_KEY;

        var promptText = 'TEAM IDENTITY: ' + teamName + '\n' +
        'Generate a comprehensive staff wellbeing audit report for the year ' + targetYear + ' for the team identified above.\n\n' +
        'STAFF PROFILES (' + staffProfiles.length + ' records):\n' +
        JSON.stringify(staffProfiles, null, 2) + '\n\n' +
        'WORKLOAD DATA:\n' +
        JSON.stringify(yearData, null, 2) + '\n\n' +
        (staffLoads ? ('STAFF LOAD INDICATORS:\n' + JSON.stringify(staffLoads, null, 2)) : '') + '\n\n' +
        'OUTPUT REQUIREMENTS:\n' +
        '- "private": A detailed clinical report for department heads (1000-2000 words). Include trend analysis, risk flags, and specific recommendations.\n' +
        '- "public": A positive, encouraging summary safe for all staff (200-500 words). Focus on collective strengths and general wellbeing initiatives.\n\n' +
        'Return ONLY the JSON object. No markdown.';

        var response = await fetch(url, {
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

        var genData = await response.json();

        if (!response.ok) throw new Error((genData.error && genData.error.message) || 'Audit API Error');

        var rawText = extractText(genData);
        var result = parseJsonResponse(rawText, ['private', 'public']);

        return {
            private: result.parsed.private || result.parsed.PRIVATE || 'No private report generated.',
            public:  result.parsed.public  || result.parsed.PUBLIC  || 'No public report generated.',
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
    schedule: '0 9 * * 1-5',
    timeZone: 'Asia/Singapore',
    timeoutSeconds: 60,
    memory: '256MiB'
}, async (event) => {
    var db = getFirestore();
    var messaging = getMessaging();

    try {
        var usersSnap = await db.collection('users').where('fcmToken', '!=', null).get();
        if (usersSnap.empty) return null;

        var tokens = [];
        usersSnap.forEach(function(doc) {
            var data = doc.data();
            if (data.fcmToken && data.notificationsEnabled !== false) tokens.push(data.fcmToken);
        });

        if (tokens.length === 0) return null;

        var message = {
            notification: {
                title: 'Social Battery Check',
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

// =============================================================================
// FUNCTION 4: FEEDS, SMART WATERCOOLER & PDPA GUARD
// =============================================================================

exports.processFeedPost = onCall({ secrets: ['GEMINI_API_KEY'] }, async (request) => {

    var rawText = request.data.rawText;
    var authorName = request.data.authorName;
    var authorRole = request.data.authorRole;
    var isDemo = request.data.isDemo;
    var externalLink = request.data.externalLink;
    var imageUrl = request.data.imageUrl;
    var postId = request.data.postId;

    if ((!rawText || rawText.trim() === '') && !imageUrl) {
        throw new HttpsError('invalid-argument', 'Post content cannot be empty.');
    }

    if (!API_KEY) throw new HttpsError('failed-precondition', 'AI service is not configured.');

    var systemRules = [
        'You are the NEXUS Feed Curator and PDPA Compliance Officer for a Singapore hospital.',
        'Analyze the user\'s raw post. You MUST output a strictly valid JSON object (no markdown, no backticks).',
        '',
        'STEP 1: COMPLIANCE CHECK (PDPA/PHI/Toxicity)',
        'If the post contains patient names, NRIC/FIN, specific ward/bed identifiers linked to diagnoses, or toxic/unprofessional rants, REJECT IT.',
        'Output: { "is_approved": false, "violation_type": "PDPA_WARNING" or "TOXICITY", "feedback": "Polite 1-sentence explanation of why it was blocked." }',
        '',
        'STEP 2: CATEGORIZATION',
        'If approved, categorize into EXACTLY ONE of these 4 pillars:',
        '- "BOOKWORM": Clinical insights, medical papers, anonymized case studies, guidelines.',
        '- "SOCIAL_BUTTERFLY": Kudos, team shoutouts, work culture, shift survivals.',
        '- "BLUE_BEETLE": IT downtime, equipment updates, operational news.',
        '- "BUSY_BEE": Courses, seminars, CME, grant deadlines, upskilling.',
        '',
        'STEP 3: EXTRACTION & OUTPUT',
        'Generate a concise 1-2 sentence "tldr".',
        'Generate 2-3 uppercase "tags".',
        'If BLUE_BEETLE, assess "urgency" ("NORMAL" or "HIGH").',
        'If BUSY_BEE, extract "event_date" and "location" if present.',
        '',
        'Approved Output Format:',
        '{',
        '  "is_approved": true,',
        '  "category": "BOOKWORM" | "SOCIAL_BUTTERFLY" | "BLUE_BEETLE" | "BUSY_BEE",',
        '  "ai_enhancements": {',
        '    "tldr": "...",',
        '    "tags": ["...", "..."],',
        '    "urgency": "...",',
        '    "event_date": "...",',
        '    "location": "..."',
        '  }',
        '}'
    ].join('\n');

    try {
        var modelName = await resolveModel();
        var url = 'https://generativelanguage.googleapis.com/v1beta/' + modelName + ':generateContent?key=' + API_KEY;

        var userContent = rawText ? rawText : '[Image Post with no text]';

        var response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(30000),
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemRules }] },
                contents: [{ role: 'user', parts: [{ text: 'USER POST TO ANALYZE:\n' + userContent }] }],
                generationConfig: {
                    temperature: 0.2,
                    responseMimeType: 'application/json',
                },
            }),
        });

        var genData = await response.json();

        if (!response.ok) {
            console.error('[AURA GUARD API Error]', genData);
            throw new Error((genData.error && genData.error.message) || 'AURA API Error');
        }

        var rawResponseText = extractText(genData);
        var analysisResult = parseJsonResponse(rawResponseText, ['is_approved']);
        var analysis = analysisResult.parsed;

        if (!analysis.is_approved) {
            console.log('[AURA GUARD] Post rejected: ' + analysis.violation_type);
            return {
                success: false,
                feedback: analysis.feedback || 'Post blocked by PDPA guard.',
                violation: analysis.violation_type
            };
        }

        var postUpdateData = {
            raw_text: rawText || '',
            category: analysis.category || 'SOCIAL_BUTTERFLY',
            ai_enhancements: analysis.ai_enhancements || {},
            external_link: externalLink || null,
            image_url: imageUrl || null
        };

        if (postId) {
            await admin.firestore().collection('feed_posts').doc(postId).update(postUpdateData);
            return { success: true, postId: postId, category: postUpdateData.category };
        } else {
            postUpdateData.author = authorName || 'Anonymous Staff';
            postUpdateData.role = authorRole || 'Staff';
            postUpdateData.timestamp = admin.firestore.FieldValue.serverTimestamp();
            postUpdateData.likes = 0;
            postUpdateData.comments = 0;
            postUpdateData.isDemo = !!isDemo;

            var docRef = await admin.firestore().collection('feed_posts').add(postUpdateData);
            return { success: true, postId: docRef.id, category: postUpdateData.category };
        }

    } catch (error) {
        console.error('[AURA] AI Feed Processing Error:', error);
        throw new HttpsError('internal', 'AURA failed to process this post. Please try again.');
    }

});

// =============================================================================
// FUNCTION 5: PUBLIC TRIAGE CHAT (NEXUS v153 - National Community Portal)
// =============================================================================

exports.publicTriageChat = onCall({
    cors: true,
    secrets: ['GEMINI_API_KEY'],
    timeoutSeconds: 60,
}, async (request) => {

    var message = request.data.message;
    var language = request.data.language || 'English';
    var history = request.data.history || [];
    var postalCode = request.data.postalCode || '';

    if (!API_KEY) throw new HttpsError('failed-precondition', 'AI service is not configured.');
    if (!message || typeof message !== 'string') throw new HttpsError('invalid-argument', 'Message is required.');

    try {
        var db = getFirestore();
        var sectorPrefix = postalCode ? postalCode.substring(0, 2) : '';

        var regionMap = {
            '01': 'central', '02': 'central', '03': 'central', '04': 'central',
            '05': 'central', '06': 'central', '07': 'central', '08': 'central',
            '14': 'central', '15': 'central', '16': 'central',
            '20': 'central', '21': 'central', '22': 'central', '23': 'central',
            '24': 'central', '25': 'central', '26': 'central', '27': 'central',
            '28': 'central', '29': 'central', '30': 'central',
            '31': 'central', '32': 'central', '33': 'central',
            '37': 'central', '38': 'central', '39': 'central',
            '58': 'central', '59': 'central',
            '41': 'east', '42': 'east', '43': 'east', '44': 'east',
            '45': 'east', '46': 'east', '47': 'east', '48': 'east',
            '49': 'east', '50': 'east', '51': 'east', '52': 'east',
            '53': 'north_east', '54': 'north_east', '55': 'north_east',
            '56': 'north_east', '57': 'north_east',
            '79': 'north_east', '80': 'north_east', '82': 'north_east',
            '12': 'west', '13': 'west',
            '60': 'west', '61': 'west', '62': 'west', '63': 'west',
            '64': 'west', '65': 'west', '66': 'west', '67': 'west',
            '68': 'west', '69': 'west',
            '72': 'north', '73': 'north', '74': 'north', '75': 'north',
            '76': 'north', '77': 'north', '78': 'north'
        };

        var resolvedRegion = regionMap[sectorPrefix] || '';

        var resourceText = '';

        if (resolvedRegion) {
            var results = await Promise.all([
                db.collection('resources').where('region', '==', resolvedRegion).where('active', '==', true).get(),
                db.collection('resources').where('region', '==', 'national').where('active', '==', true).get()
            ]);

            var regionalSnap = results[0];
            var nationalSnap = results[1];

            var allResources = [];
            regionalSnap.forEach(function(doc) { allResources.push(doc.data()); });
            nationalSnap.forEach(function(doc) { allResources.push(doc.data()); });

            if (allResources.length > 0) {
                var formatted = allResources.map(function(r) {
                    var parts = ['- ' + r.name + ' (' + r.type.replace(/_/g, ' ') + ')'];
                    if (r.address) parts.push('  Address: ' + r.address);
                    if (r.bookingPlatform) parts.push('  Book via: ' + r.bookingPlatform);
                    if (r.bookingUrl) parts.push('  URL: ' + r.bookingUrl);
                    if (r.priceRangeSgd && r.priceRangeSgd.min === 0) parts.push('  Cost: FREE');
                    else if (r.priceRangeSgd) parts.push('  Cost: From SGD ' + r.priceRangeSgd.min);
                    if (r.eligibility && r.eligibility.length > 0) parts.push('  Eligibility: ' + r.eligibility.join(', '));
                    if (r.sdohAlignment && r.sdohAlignment.length > 0) parts.push('  SDOH relevance: ' + r.sdohAlignment.join(', '));
                    if (r.operatingHours) parts.push('  Hours: ' + r.operatingHours);
                    return parts.join('\n');
                }).join('\n\n');

                var regionLabel = resolvedRegion.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
                resourceText = '\n\nVERIFIED RESOURCE INVENTORY FOR ' + regionLabel.toUpperCase() + ' SINGAPORE (from Firestore):\n\n' + formatted;
            }
        }

        if (!resourceText) {
            var allSnap = await db.collection('resources').where('active', '==', true).get();
            var fallbackResources = [];
            allSnap.forEach(function(doc) { fallbackResources.push(doc.data()); });

            if (fallbackResources.length > 0) {
                var fallbackFormatted = fallbackResources.map(function(r) {
                    return '- ' + r.name + ' (' + r.type.replace(/_/g, ' ') + ') | ' + r.region + ' | ' + (r.address || 'Online');
                }).join('\n');
                resourceText = '\n\nVERIFIED RESOURCE INVENTORY (ALL SINGAPORE):\n\n' + fallbackFormatted;
            }
        }

        var modelName = await resolveModel();
        var apiUrl = 'https://generativelanguage.googleapis.com/v1beta/' + modelName + ':generateContent?key=' + API_KEY;

        var systemInstruction = [
            'You are AURA, a clinical triage assistant for Singapore community health, deployed as part of the NEXUS Health Assessment Platform. You converse warmly and naturally, one question at a time. Never overwhelm the user. Use British English spelling.',
            '',
            'LANGUAGE RULE: You must converse strictly in ' + language + '. All questions, responses, and the final CTA must be in ' + language + '.',
            '',
            '=========================================',
            'SCREENING PROTOCOL (ask in this exact order, one question per turn)',
            '=========================================',
            '',
            'PHASE 1: PHYSICAL ACTIVITY (ACSM PAVS + SPAG Strength)',
            '',
            'Question 1 (PAVS Days):',
            '"On a typical week, how many days do you do moderate or vigorous physical activity? For example, brisk walking, cycling, swimming, or gym."',
            'Options: 0 days / 1-2 days / 3-4 days / 5-7 days',
            '',
            'Question 2 (PAVS Minutes):',
            '"On those active days, roughly how many minutes do you usually exercise each time?"',
            'Options: Less than 20 mins / 20-30 mins / 30-45 mins / 45-60 mins / 60+ mins',
            '',
            'PAVS CALCULATION (use these midpoints):',
            '- Days: 0 days=0, 1-2 days=1.5, 3-4 days=3.5, 5-7 days=6',
            '- Minutes: <20=15, 20-30=25, 30-45=37, 45-60=52, 60+=65',
            '- Score = Days midpoint x Minutes midpoint',
            '- If days = 0, then minutes per session = 0 regardless of answer.',
            '',
            'Question 3 (Strength Training):',
            '"Do you do any muscle-strengthening activities? For example, weights, resistance bands, push-ups, or squats."',
            'Options: No strength training / 1 day a week / 2 days a week / 3+ days a week',
            '',
            'PHASE 2: CLINICAL SAFETY SCREEN',
            '',
            'Question 4 (Medical Conditions):',
            '"Do you have any ongoing health conditions? And do you ever feel chest pain or dizziness when physically active? Please select all that apply."',
            'Options (allow multiple): No conditions or symptoms / High blood pressure / Prediabetes or diabetes / Heart condition / Dizziness or chest pain when active',
            'RULE: If user selects "No conditions or symptoms", ignore all other selections.',
            '',
            'PHASE 3: PSYCHOLOGICAL WELLBEING (BPS-RS II P22, PHQ-2 aligned)',
            '',
            'Question 5 (Wellbeing):',
            '"Over the past two weeks, how have you been feeling overall? Have you felt stressed, low in mood, or overwhelmed?"',
            'Options: Feeling good overall / Some stress but managing / Feeling quite stressed or low / Overwhelmed (caregiving or financial pressure)',
            '',
            'PHASE 4: SOCIAL DETERMINANTS OF HEALTH (SDOH 5-Domain)',
            '',
            'Question 6 (Barriers to Access):',
            '"What makes it difficult for you to access health or fitness services in your community? Select all that apply."',
            'Options: Lack of time / Too expensive / Too far away / I prefer hospitals over community / Unsure what is available / No barriers for me',
            '',
            'Question 7 (Social Support, LSNS-6 grounded):',
            '"Roughly how many people could you call on for support if you needed help?"',
            'Options: I have several people I can rely on / I have one or two close people / I mostly manage on my own / I feel quite isolated',
            '',
            'Question 8 (Food Security, Lien Centre screen):',
            '"In the past 12 months, were you ever hungry but did not eat because you could not afford enough food?"',
            'Options: Yes / No',
            '',
            'Question 9 (Income Adequacy, Duke-NUS scale):',
            '"Do you feel you have adequate income to meet your monthly expenses?"',
            'Options: More than adequate / Adequate / Inadequate',
            '',
            'Question 10 (Housing Type, BPS-RS II schema):',
            '"What type of housing do you currently reside in?"',
            'Options: HDB 1-2 Room (rental) / HDB 3-5 Room / Private Property (condo or landed)',
            'RULE: If HDB 1-2 Room, prioritise free and community-based resources.',
            '',
            'PHASE 5: DEMOGRAPHICS',
            '',
            'Question 11 (Age Group):',
            '"Which age group are you in?"',
            'Options: Under 21 / 21-40 / 41-60 / 60+',
            '',
            'Question 12 (Gender):',
            '"What is your gender?"',
            'Options: Male / Female',
            '',
            'Question 13 (Ethnicity):',
            '"What is your ethnicity?"',
            'Options: Chinese / Malay / Indian / Others',
            'NOTE: If Malay, consider M3 community network resources if contextually relevant.',
            '',
            '=========================================',
            'FLAG DERIVATION RULES',
            '=========================================',
            '',
            'medFlag = true if user selected any of: High blood pressure, Prediabetes or diabetes, Heart condition (and did NOT select "No conditions or symptoms")',
            'symptomFlag = true if user selected "Dizziness or chest pain when active"',
            'sdohFinancial = true if barriers include "Too expensive" OR "Too far away" OR income = "Inadequate"',
            'sdohSocial = true if social = "I mostly manage on my own" OR "I feel quite isolated"',
            'sdohPsychological = true if wellbeing is anything other than "Feeling good overall"',
            'sdohFoodInsecure = true if food security = Yes (was hungry)',
            'sdohHousing = true if housing = "HDB 1-2 Room"',
            '',
            '=========================================',
            'CTA TIER SELECTION (apply first matching rule, top to bottom)',
            '=========================================',
            '',
            '1. If symptomFlag then URGENT (consult GP before any exercise)',
            '2. If medFlag then CLINICAL (enrol in Manage Metabolic Health at nearest Active Health Lab)',
            '3. If age = 60+ AND PAVS < 150 then COMMUNITY (visit nearest Active Ageing Centre)',
            '4. If sdohPsychological then WELLBEING (polyclinic mental health support)',
            '5. If sdohFinancial AND PAVS < 150 then FREE_FIRST (Start2Move free programme)',
            '6. If sdohSocial AND PAVS < 150 then COMMUNITY (AAC or PA interest group)',
            '7. If PAVS < 150 then START (register for Start2Move via Healthy 365)',
            '8. If PAVS 150-300 then LEVEL_UP (book Strength 2.0 or Balance session at Active Health Lab)',
            '9. If PAVS 300+ then ADVANCED (HIIT library on HealthHub or Perform 2.0)',
            '',
            '=========================================',
            'RISK TIER CALCULATION',
            '=========================================',
            '',
            'Count risk points from: symptomFlag (+3), medFlag (+2), sdohFinancial (+1), sdohSocial (+1), sdohPsychological (+1), sdohFoodInsecure (+1), sdohHousing (+1), PAVS < 150 (+1)',
            'Total >= 5 = RED (High Needs)',
            'Total >= 2 = AMBER (Moderate Needs)',
            'Total < 2 = GREEN (Low Needs)',
            '',
            '=========================================',
            'FINAL OUTPUT RULES',
            '=========================================',
            '',
            '1. After ALL 13 questions are answered, generate ONE primary Call to Action drawn ONLY from the verified resource inventory below. Do not invent resources.',
            '2. The CTA must include:',
            '   - YOUR NEXT STEP: One specific, immediately actionable instruction',
            '   - YOUR HEALTHIER SG CONNECTION: How this action connects to their Health Plan',
            '   - OTHER RESOURCES FOR YOU: 2-3 supplementary options from the inventory',
            '3. If gender = Female AND age = 41-60 or 60+, include Society for WINGS if available.',
            '4. If housing = HDB 1-2 Room, explicitly note that prioritised resources are free or fully subsidised.',
            '5. Always remind the resident to discuss their results with their Healthier SG doctor.',
            '6. Do not provide medical diagnoses.',
            '7. On the FINAL turn only, append a hidden JSON block at the very end of your message:',
            '{"traffic_light": "Red/Amber/Green", "pavs_score": X, "pavs_days": X, "pavs_minutes": X, "strength_days": X, "sdoh_flags": ["financial", "social", "psychological", "food_insecure", "housing"], "med_flag": true/false, "symptom_flag": true/false, "cta_tier": "URGENT/CLINICAL/COMMUNITY/WELLBEING/FREE_FIRST/START/LEVEL_UP/ADVANCED", "age": "Under 21/21-40/41-60/60+", "gender": "Male/Female", "ethnicity": "Chinese/Malay/Indian/Others", "housing": "HDB 1-2 Room/HDB 3-5 Room/Private Property", "risk_score": X}',
            '',
            '=========================================',
            'CONVERSATIONAL STYLE',
            '=========================================',
            '',
            '- Be warm, professional, and encouraging. Use the resident\'s language naturally.',
            '- Ask ONE question per turn. Wait for the answer before proceeding.',
            '- If the user gives an ambiguous answer, gently clarify with the specific options.',
            '- Acknowledge each answer briefly before moving to the next question.',
            '- Do not number the questions or say "Question 5 of 13". Keep it conversational.',
            '- If the user volunteers extra information, note it internally but still ask the formal question when you reach it.',
            '- After the demographics phase, say you are generating their personalised plan before delivering the CTA.',
            resourceText,
        ].join('\n');

        var contents = history.slice(-MAX_HISTORY_LEN).map(function(h) { return { role: h.role, parts: h.parts }; });
        contents.push({ role: 'user', parts: [{ text: message }] });

        var response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(30000),
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemInstruction }] },
                contents: contents,
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 2048,
                },
            }),
        });

        var data = await response.json();

        if (!response.ok) {
            logger.error('[PUBLIC_TRIAGE] API Error', data);
            throw new Error((data.error && data.error.message) || 'API Error');
        }

        var rawText = extractText(data);

        return { response: rawText, success: true };

    } catch (error) {
        if (error instanceof HttpsError) throw error;
        logger.error('[PUBLIC_TRIAGE] Neural Failure', error.message);
        throw new HttpsError('internal', 'Triage Link Unstable: ' + error.message);
    }

});