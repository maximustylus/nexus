import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase'; 

// Note: Pass the full active persona object into this function, not just the string name.
export const analyzeWellbeing = async (chatHistory, isDemo = false, activePersona = null) => {
    try {
        const functions = getFunctions(app);
        const chatWithAura = httpsCallable(functions, 'chatWithAura');

        // 1. Guard: Ensure we have history to send
        if (!chatHistory || chatHistory.length === 0) {
            throw new Error("No chat history provided.");
        }

        const latestMsg = chatHistory[chatHistory.length - 1];
        
        // 2. Format history to match Gemini's { role, parts: [{ text }] } schema
        const previousHistory = chatHistory.slice(0, -1).map(msg => ({
            role: msg.role === 'bot' ? 'model' : 'user',
            parts: [{ text: msg.text }]
        }));

        // 3. Fire payload with explicit isDemo flag
        const response = await chatWithAura({
            userText: latestMsg.text,
            history: previousHistory,
            role: 'Staff',
            // FIXED: Ensure the frontend passes the massive text block, not just the name
            prompt: activePersona ? activePersona.prompt : '', 
            isDemo: isDemo // Critical for bypassing auth checks in demo mode
        });

        // 4. Robust Response Handling
        const result = response.data;

        if (result.success && result.text) {
            return JSON.parse(result.text);
        } else {
            throw new Error(result.error || "AURA returned an invalid response format.");
        }

    } catch (e) {
        // Detailed logging for your Mac console to see exactly what failed
        console.error("[NEXUS] AURA Logic Failure:", {
            code: e.code,
            message: e.message,
            details: e.details
        });

        // FIXED: Fortified catch block to prevent undefined errors in your UI components
        return { 
            reply: `⚠️ Neural link unstable: ${e.message}. I am having trouble processing that right now.`, 
            mode: 'ERROR',
            diagnosis_ready: false,
            phase: null,
            energy: null,
            action: null,
            db_workload: { 
                target_collection: null,
                target_doc: null,
                target_field: null,
                target_value: null,
                target_month: null
            }
        };
    }
};
