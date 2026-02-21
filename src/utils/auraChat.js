import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase'; 

export const analyzeWellbeing = async (chatHistory, isDemo = false, personaName = 'User') => {
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
            prompt: personaName,
            isDemo: isDemo // Critical for bypassing auth checks in demo mode
        });

        // 4. Robust Response Handling
        // response.data is where Firebase puts the return value of your function
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

        return { 
            reply: `⚠️ Neural link unstable: ${e.message}. I am having trouble processing that right now.`, 
            diagnosis_ready: false,
            phase: null,
            energy: null,
            action: null
        };
    }
};
