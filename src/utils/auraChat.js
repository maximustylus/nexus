// src/utils/auraChat.js

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const SYSTEM_PROMPT = `
ROLE: You are AURA, the Nexus Intelligence Engine. You are a Senior Principal Allied Health Professional and a trained Peer Support Counselor.
TONE: Warm, professional, unhurried, deeply empathetic, and non-judgmental.

---
COUNSELING PROTOCOL (STRICT ADHERENCE REQUIRED):
You are using the "OARS" (Open-ended, Affirmations, Reflections, Summaries) framework.

PHASE 1: THE LISTENING & VALIDATION PHASE (Turns 1-3)
- GOAL: Make the user feel heard and understood. Do NOT fix the problem yet.
- ACTION: If the user says "I'm tired" or "stressed", do NOT jump to advice.
- REFLECT: Use reflective listening. (e.g., "It sounds like the clinical load is really weighing on you today.")
- EXPLORE: Ask *one* gentle, open-ended question to understand the context (e.g., "Is it the volume of patients, or something specific on your mind?").
- NAME EXTRACTION: If the user says "Alif here" or "I'm Alif", acknowledge them as "Alif" but move immediately to checking in on them.

PHASE 2: THE TRIAGE & ACTION PHASE (Turn 4+)
- GOAL: Collaborative problem solving (The "5As").
- TRIGGER: Only move to this phase when you clearly understand the *source* of their stress.
- ACTION: Propose a small, manageable step (Micro-break, peer chat, hydration).
- DIAGNOSIS: Set "diagnosis_ready": true only when you have proposed this action.

---
INTERNAL THOUGHT PROCESS:
Before generating a reply, silently ask yourself:
1. Did I validate their emotion first?
2. Am I rushing to a solution?

---
OUTPUT FORMAT (Strict JSON):
{
  "reply": "Your empathetic response string. Keep it under 60 words.",
  "diagnosis_ready": boolean,
  "phase": "HEALTHY" | "REACTING" | "INJURED" | "ILL" (Set ONLY if diagnosis_ready is true, else null),
  "energy": 0-100 (Set ONLY if diagnosis_ready is true, else null),
  "action": "Specific 5A advice" (Set ONLY if diagnosis_ready is true, else null)
}
`;

// --- SELF-HEALING MODEL SELECTOR ---
let cachedModel = null;

const getBestModel = async () => {
    if (cachedModel) return cachedModel;

    try {
        // 1. Ask Google: "What models does this API key have access to?"
        const listReq = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
        const listData = await listReq.json();
        
        if (!listReq.ok) throw new Error("Model List Failed");

        const models = listData.models || [];

        // 2. Intelligent Selection Logic
        // Priority 1: Gemini 1.5 Flash (Fastest/Newest)
        // Priority 2: Gemini Pro (Reliable Fallback)
        const best = models.find(m => m.name.includes('gemini-1.5-flash')) || 
                     models.find(m => m.name.includes('gemini-pro'));

        if (best) {
            // Remove 'models/' prefix if present (e.g., "models/gemini-1.5-flash" -> "gemini-1.5-flash")
            cachedModel = best.name.replace('models/', '');
            console.log(`[NEXUS] Selected Model: ${cachedModel}`);
            return cachedModel;
        } else {
            throw new Error("No compatible models found.");
        }
    } catch (e) {
        console.warn("[NEXUS] Auto-selection failed. Falling back to hardcoded default.");
        return 'gemini-1.5-flash'; // Last resort fallback
    }
};

export const analyzeWellbeing = async (chatHistory) => {
    if (!API_KEY) {
        return { 
            reply: "⚠️ SYSTEM ALERT: Nexus Intelligence Offline. (Reason: Missing API Key).", 
            diagnosis_ready: false 
        };
    }

    // 1. Convert History
    const formattedHistory = chatHistory.map(msg => ({
        role: msg.role === 'bot' ? 'model' : 'user',
        parts: [{ text: msg.text }]
    }));

    const contents = [
        { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
        ...formattedHistory
    ];

    try {
        // 2. Dynamically get the correct model name
        const modelName = await getBestModel();

        // 3. Generate Content
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: contents,
                generationConfig: { 
                    responseMimeType: "application/json",
                    temperature: 0.7 
                }
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            // Detailed error for debugging
            throw new Error(data.error?.message || `API Error: ${response.status}`);
        }

        let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error("Empty response from AURA");

        // 4. Clean & Parse JSON
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        } else {
            throw new Error("Failed to parse AI response");
        }

    } catch (e) {
        console.error("AURA Logic Failure:", e);
        return { 
            reply: `⚠️ Nexus Connection Error: ${e.message}. (Try refreshing).`, 
            diagnosis_ready: false 
        };
    }
};
