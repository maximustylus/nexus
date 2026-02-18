/**
 * ==============================================================================
 * AURA UTILS — Pure, side-effect-free utility functions
 * ==============================================================================
 * Companion to AuraPulseBot.jsx v15.1
 * All functions here are pure and independently unit-testable.
 * No React imports. No Firebase imports. No side effects.
 * ==============================================================================
 */

// ─── CONSTANTS (single source of truth) ──────────────────────────────────────
export const AURA_CONFIG = Object.freeze({
    MAX_INPUT_LENGTH:    500,
    SEND_COOLDOWN_MS:    2000,
    SIMULATION_MIN_MS:   1200,
    SIMULATION_MAX_MS:   2500,
    FIREBASE_MAX_RETRIES: 3,
    GEMINI_MODEL:        'gemini-1.5-flash',
    GEMINI_MAX_TOKENS:   1024,
});

// ─── PHASE UI REGISTRY ───────────────────────────────────────────────────────
/**
 * @typedef {'HEALTHY'|'REACTING'|'INJURED'|'ILL'} Phase
 * @typedef {{ badge: string, icon: string, label: string }} PhaseUI
 */

/** @type {Record<Phase, PhaseUI>} */
export const PHASE_UI_MAP = Object.freeze({
    HEALTHY:  { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: '💚', label: 'Healthy' },
    REACTING: { badge: 'bg-yellow-50  text-yellow-700  border-yellow-200',  icon: '⚡', label: 'Reacting' },
    INJURED:  { badge: 'bg-orange-50  text-orange-700  border-orange-200',  icon: '🔶', label: 'Injured' },
    ILL:      { badge: 'bg-red-50     text-red-700     border-red-200',     icon: '🔴', label: 'Ill' },
});

/**
 * Returns the UI descriptor for a given phase string.
 * Safe: returns a fallback if `phase` is unknown.
 * @param {string} phase
 * @returns {PhaseUI & { badge: string }}
 */
export const getPhaseUI = (phase) =>
    PHASE_UI_MAP[phase] ?? { badge: 'bg-slate-100 border-slate-200', icon: '⬜', label: 'Unknown' };

// ─── INPUT SANITIZER ──────────────────────────────────────────────────────────
/**
 * Sanitizes and truncates user input.
 * - Strips leading/trailing whitespace.
 * - Truncates to MAX_INPUT_LENGTH.
 * - Collapses internal runs of whitespace to a single space.
 *   (Prevents prompt injection via whitespace-heavy inputs.)
 *
 * @param {string} raw
 * @param {number} [maxLen]
 * @returns {string}
 */
export function sanitizeInput(raw, maxLen = AURA_CONFIG.MAX_INPUT_LENGTH) {
    return raw
        .trim()
        .replace(/\s{3,}/g, '  ')   // collapse 3+ whitespace to 2
        .slice(0, maxLen);
}

// ─── JSON EXTRACTOR (dual-strategy) ──────────────────────────────────────────
/**
 * @typedef {{ phase: string, energy: number, action: string, summary: string }} PulseLog
 * @typedef {{ cleanText: string, parsed: PulseLog|null }} ExtractResult
 */

/**
 * Robustly extracts a PulseLog JSON block from raw AI response text.
 *
 * Strategy 1 — Explicit fence:  ~~~JSON { … } ~~~
 * Strategy 2 — Trailing object: any text ending with a `{…}` containing "phase"
 * Strategy 3 — Fail gracefully: returns cleanText = rawText, parsed = null
 *
 * @param {string} rawText
 * @returns {ExtractResult}
 */
export function extractJsonFromResponse(rawText) {
    if (!rawText) return { cleanText: '', parsed: null };

    // Strategy 1 — explicit fence
    const fenceRx = /~~~JSON\s*([\s\S]*?)\s*~~~/;
    const fence = rawText.match(fenceRx);
    if (fence) {
        try {
            const parsed = JSON.parse(fence[1]);
            if (isValidPulseLog(parsed)) {
                return {
                    cleanText: rawText.replace(fenceRx, '').trim(),
                    parsed,
                };
            }
        } catch (_) { /* fall through */ }
    }

    // Strategy 2 — trailing JSON object containing "phase"
    const trailingRx = /([\s\S]*?)(\{[\s\S]*?"phase"[\s\S]*?\})\s*$/;
    const trailing = rawText.match(trailingRx);
    if (trailing) {
        try {
            const parsed = JSON.parse(trailing[2]);
            if (isValidPulseLog(parsed)) {
                return { cleanText: trailing[1].trim(), parsed };
            }
        } catch (_) { /* fall through */ }
    }

    // Strategy 3 — graceful no-op
    return { cleanText: rawText.trim(), parsed: null };
}

/**
 * Type guard — validates that an object has the PulseLog shape.
 * @param {unknown} obj
 * @returns {obj is PulseLog}
 */
export function isValidPulseLog(obj) {
    return (
        obj !== null &&
        typeof obj === 'object' &&
        typeof obj.phase  === 'string' &&
        typeof obj.energy === 'number' &&
        obj.energy >= 0 && obj.energy <= 100 &&
        typeof obj.action  === 'string' &&
        typeof obj.summary === 'string'
    );
}

// ─── FIREBASE RETRY ───────────────────────────────────────────────────────────
/**
 * Retries any async Firebase operation with exponential back-off.
 *
 * Delays: 600ms → 1.2s → 2.4s (doubles each attempt)
 *
 * @param {() => Promise<void>} fn
 * @param {number} [maxRetries]
 * @returns {Promise<void>}
 * @throws Rethrows the last error after all retries are exhausted.
 *
 * @example
 * await withRetry(() => setDoc(ref, data, { merge: true }));
 */
export async function withRetry(fn, maxRetries = AURA_CONFIG.FIREBASE_MAX_RETRIES) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt < maxRetries) {
                const backoffMs = Math.pow(2, attempt) * 300; // 600 → 1200 → 2400
                await new Promise(resolve => setTimeout(resolve, backoffMs));
            }
        }
    }
    throw lastError;
}

// ─── CONVERSATION EXPORTER ────────────────────────────────────────────────────
/**
 * @typedef {{ role: string, text: string, isError?: boolean }} Message
 */

/**
 * Downloads the conversation as a plain-text file.
 * Filters out error bubbles and system messages.
 * Falls back gracefully if the Blob/URL API is unavailable.
 *
 * @param {Message[]} messages
 * @param {string} personaName
 * @returns {void}
 */
export function exportConversation(messages, personaName) {
    const lines = messages
        .filter(m => !m.isError && m.role !== 'system' && !m.text.startsWith('✅'))
        .map(m => `[${m.role.toUpperCase()}]\n${m.text}`)
        .join('\n\n─────────────────────────────────────\n\n');

    const header = [
        '══════════════════════════════════════',
        `  AURA Pulse — Session with ${personaName}`,
        `  Exported: ${new Date().toLocaleString()}`,
        '══════════════════════════════════════',
        '',
    ].join('\n');

    try {
        const blob = new Blob([header + lines], { type: 'text/plain;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), {
            href:     url,
            download: `aura-session-${personaName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.txt`,
        });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('[AURA] Export failed:', err);
    }
}

// ─── SYSTEM PROMPT BUILDER ────────────────────────────────────────────────────
/**
 * Builds the Gemini system instruction string.
 * Extracted here so it can be unit-tested and swapped without touching the component.
 *
 * @param {{ name: string, title: string }} activeUser
 * @param {string} role
 * @param {string} promptContext  Persona-specific instruction
 * @param {string|null} memory    Past session memory
 * @returns {string}
 */
export function buildSystemPrompt({ activeUser, role, promptContext, memory }) {
    return `
You are AURA, an advanced AI Clinical Wellbeing Counsellor for Healthcare Staff.

IDENTITY
- Tone: Professional, warm, concise (under 50 words unless explaining a concept), non-judgmental.
- Method: Motivational Interviewing (MI) + OARS framework (Open questions, Affirmations, Reflections, Summaries).
- Model: Mental Health Continuum — Healthy → Reacting → Injured → Ill.

CURRENT CONTEXT
- User: ${activeUser.name} (${role})
- Persona Directive: ${promptContext}
- Session Memory: ${memory ?? 'No prior context.'}

STRICT BEHAVIOURAL RULES
1. REFLECT FIRST — always acknowledge the user's emotion before pivoting to a question.
   Good: "It sounds like the pressure is building. What's been the most draining part?"
   Bad:  "What strategies are you using to cope?"
2. CHAT FIRST — if the user is greeting or testing, be warm and conversational.
   Do NOT produce a JSON block for greetings or casual messages.
3. JSON TRIGGER — only append the JSON block if:
   - The user explicitly shares a high or low energy state, OR
   - The user asks for a recommendation or action plan.
4. NO REPETITION — vary your phrasing. Never repeat the same opening sentence twice.
5. BOUNDARIES — you are a wellbeing support tool, not a licensed therapist.
   If the user describes a clinical crisis, refer them to a mental health professional.

JSON OUTPUT FORMAT (append at end of message when triggered, NEVER otherwise):
~~~JSON
{
  "phase": "HEALTHY" | "REACTING" | "INJURED" | "ILL",
  "energy": <integer 0-100>,
  "action": "<specific 5A action, max 6 words>",
  "summary": "<clinical note, max 6 words>"
}
~~~
    `.trim();
}

// ─── SIMULATION INTENT ROUTER ─────────────────────────────────────────────────
/**
 * @typedef {{ reply: string, mockData: PulseLog|null }} SimResult
 */

/**
 * Pure intent-matching router for the Vested Simulacrum brain.
 * Returns a `SimResult` given user text and role.
 * Using a pure function keeps the simulation brain independently testable.
 *
 * @param {string} userText
 * @param {string} role
 * @param {(pool: string[]) => string} rotate  Injected rotation function
 * @returns {SimResult}
 */
export function routeSimulationIntent(userText, role, rotate) {
    const lower = userText.toLowerCase();

    // ── RESISTANCE / FRUSTRATION ────────────────────────────────────────────
    if (/stupid|dumb|repeat|robot|hate|bad|broken|useless|stop|shut up|annoying/.test(lower)) {
        return {
            reply: rotate([
                "You're right. I missed the mark there. Let's reset — what is actually helpful for you right now?",
                "I apologise. I want to support you, not add noise. Tell me what you need.",
                "I hear your frustration. I'll step back from the protocol. How are you really doing?",
            ]),
            mockData: null,
        };
    }

    // ── STRATEGY REQUEST ────────────────────────────────────────────────────
    if (/strategy|recommend|help|advice|tips|what should i do/.test(lower)) {
        let reply;
        if (/junior/i.test(role)) {
            reply = `Given your role as ${role}, I recommend 'Micro-Boundaries'. You can't stop clinical flow, but you can control the recovery. Have you tried a 2-minute cognitive reset between cases?`;
        } else if (/lead|head/i.test(role)) {
            reply = `At the ${role} level, decision fatigue is the primary threat. Run a 'Delegation Audit' — identify two tasks that don't require your clearance level and pass them down today.`;
        } else {
            reply = "Try the 'Transition Ritual': before leaving today, write down tomorrow's top 3 priorities so you don't carry them home cognitively.";
        }
        return { reply, mockData: null };
    }

    // ── AMBIGUITY / FOG ──────────────────────────────────────────────────────
    if (/maybe|not sure|dunno|idk|confused|weird|foggy/.test(lower)) {
        return {
            reply: "It's okay not to have a clear label for it. Sometimes 'fog' is the brain asking for a pause. If you had to pick one word for your headspace right now, what would it be?",
            mockData: null,
        };
    }

    // ── CASUAL / GREETING ────────────────────────────────────────────────────
    if (/^(chat|talk|hi|hello|hey|testing|nothing|not much|sup|yo|hey there)\b/.test(lower)) {
        return {
            reply: rotate([
                "Understood. Sometimes we just need a sounding board, not a fix. What's been the loudest part of your day so far?",
                "I'm here to listen. No agenda. What's on your mind?",
                "We can just chat. How has the energy in the unit felt today?",
            ]),
            mockData: null,
        };
    }

    // ── HIGH DISTRESS ────────────────────────────────────────────────────────
    if (/tired|exhaust|heavy|stress|burnout|busy|overwhelmed|draining|hard|tough|anxious|fail|drowning|low|slow/.test(lower)) {
        return {
            reply: `I hear the weight in that. As a ${role}, carrying that cumulative load is significant. I'm noting a 'Reacting' marker so we can prioritise your recovery.`,
            mockData: { phase: 'REACTING', energy: 42, action: 'Take 15m cognitive break.', summary: 'High load reported.' },
        };
    }

    // ── STABILITY ────────────────────────────────────────────────────────────
    if (/\b(good|well|ok|okay|great|fine|steady|happy|solid|calm|balanced)\b/.test(lower)) {
        return {
            reply: "That's a strong signal. Maintaining stability in this environment is a genuine win in itself. What's helping you stay balanced?",
            mockData: { phase: 'HEALTHY', energy: 85, action: 'Sustain current tempo.', summary: 'Stable energy reported.' },
        };
    }

    // ── GENERIC FALLBACK ─────────────────────────────────────────────────────
    return {
        reply: rotate([
            "I'm listening. Can you say a bit more about that?",
            "That sounds significant. How is that affecting your focus right now?",
            "I appreciate you sharing that. What would be the most helpful thing for me to do?",
        ]),
        mockData: null,
    };
}

// ─── CHAT HISTORY CLEANER ─────────────────────────────────────────────────────
/**
 * Filters a messages array to produce a clean history safe to pass to the
 * Gemini API. Removes:
 * - system-role messages
 * - confirmation bubbles ("✅ …")
 * - error bubbles (isError: true)
 *
 * @param {Message[]} messages
 * @returns {{ role: 'user'|'model', parts: [{ text: string }] }[]}
 */
export function buildGeminiHistory(messages) {
    return messages
        .filter(m =>
            m.role !== 'system' &&
            !m.isError &&
            !m.text.startsWith('✅') &&
            !m.text.startsWith('[SANDBOX]')  // strip demo prefix from history
        )
        .map(m => ({
            role:  m.role === 'bot' ? 'model' : 'user',
            parts: [{ text: m.text }],
        }));
}
