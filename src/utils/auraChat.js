import { getFunctions, httpsCallable } from 'firebase/functions';
// 👇 Ensure this points to your actual firebase config file!
import { app } from '../firebase'; 

export const analyzeWellbeing = async (chatHistory, isDemo = false, personaName = 'User') => {
    try {
        const functions = getFunctions(app);
        // Call the secure backend function
        const chatWithAura = httpsCallable(functions, 'chatWithAura');

        // Extract the latest message and the history
        const latestMsg = chatHistory[chatHistory.length - 1];
        const previousHistory = chatHistory.slice(0, -1).map(msg => ({
            role: msg.role === 'bot' ? 'model' : 'user',
            parts: [{ text: msg.text }]
        }));

        // Fire payload to the secure vault
        const response = await chatWithAura({
            userText: latestMsg.text,
            history: previousHistory,
            role: 'Staff',
            prompt: personaName,
            isDemo: isDemo
        });

        // Parse the secure AI response
        return JSON.parse(response.data.text);

    } catch (e) {
        console.error("[NEXUS] Secure Cloud Failure:", e);
        return { 
            reply: `⚠️ Nexus Connection Error: ${e.message}. Please check your network.`, 
            diagnosis_ready: false 
        };
    }
};
