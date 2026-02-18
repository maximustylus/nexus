import React, { useState } from 'react';
import { db } from '../firebase'; 
import { doc, setDoc } from 'firebase/firestore'; 
import { X, ShieldCheck, Sparkles } from 'lucide-react';

// --- CONFIGURATION ---
// FIX: Use the secure environment variable
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const STAFF_PROFILES = {
    "Alif":      { role: "Senior CEP", grade: "JG14", focus: "Leadership, Management, Clinical, Education, Research, " },
    "Fadzlynn":  { role: "CEP I",      grade: "JG13", focus: "Clinical Lead, Co-Lead Management, Education" },
    "Derlinder": { role: "CEP II",     grade: "JG12", focus: "Education Lead, Clinical" },
    "Ying Xian": { role: "CEP II",     grade: "JG12", focus: "Research Co-Lead, Clinical" },
    "Brandon":   { role: "CEP III",    grade: "JG11", focus: "Education Co-Lead, Clinical, Community" },
    "Nisa":      { role: "Administrator", grade: "Admin", focus: "Operations, Budget, Rostering" }
};

const SmartAnalysis = ({ teamData, staffLoads, onClose }) => {
    const [targetYear, setTargetYear] = useState('2026'); 
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('GENERATE ANALYSIS');
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const handleAnalyze = async () => {
        setLoading(true); setError('');
        
        try {
            // 1. FILTER DATA FOR SELECTED YEAR
            setStatus(`Filtering Data for ${targetYear}...`);
            const yearData = teamData.map(staff => ({
                name: staff.staff_name,
                projects: (staff.projects || []).filter(p => (p.year || '2026') === targetYear)
            }));

            // 2. CONNECT TO GEMINI
            setStatus('Connecting to Gemini...');
            const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
            const listResponse = await fetch(listUrl);
            const listData = await listResponse.json();
            if (!listResponse.ok) throw new Error(`Connection Error: ${listData.error?.message}`);

            const chatModels = listData.models.filter(m => m.supportedGenerationMethods.includes("generateContent"));
            let bestModel = chatModels.find(m => m.name.includes('flash')) || chatModels.find(m => m.name.includes('pro')) || chatModels[0];

            // 3. SEND PROMPT
            setStatus(`Analyzing ${targetYear} Performance...`);
            const promptText = `
                ACT AS: Senior Clinical Lead at KKH.
                CONTEXT: Annual Performance Review for Year ${targetYear}.
                DATA: ${JSON.stringify(STAFF_PROFILES)}
                WORKLOAD: ${JSON.stringify(yearData)}
                CLINICAL_LOADS: ${JSON.stringify(staffLoads)}

                TASK: Generate TWO reports for ${targetYear}.
                1. PRIVATE_EXECUTIVE_BRIEF (For Leads): Audit staff against their JG11-JG14 grades based on this year's data.
                2. PUBLIC_TEAM_PULSE (For Staff): Celebrate ${targetYear} wins and "Joy at Work".

                CRITICAL OUTPUT FORMAT:
                Return ONLY valid JSON.
                {
                    "private": "Report text...",
                    "public": "Report text..."
                }
            `;

            const generateUrl = `https://generativelanguage.googleapis.com/v1beta/${bestModel.name}:generateContent?key=${API_KEY}`;
            const genResponse = await fetch(generateUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
            });

            const genData = await genResponse.json();
            if (!genResponse.ok) throw new Error(genData.error?.message);

            // 4. PARSE JSON
            let rawText = genData.candidates[0].content.parts[0].text;
            // Clean up any markdown code blocks
            rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("AI did not return valid JSON.");
            
            const parsedObj = JSON.parse(jsonMatch[0]);
            
            // Handle case sensitivity just in case
            const privateText = parsedObj.private || parsedObj.Private || "Error generating private report.";
            const publicText = parsedObj.public || parsedObj.Public || "Error generating public report.";

            setResult({ private: privateText, public: publicText });

        } catch (err) {
            console.error(err);
            setError('Analysis Failed: ' + err.message);
        } finally {
            setLoading(false);
            setStatus('GENERATE ANALYSIS');
        }
    };

    const handlePublish = async () => {
        if (!result) return;
        try {
            await setDoc(doc(db, 'system_data', `reports_${targetYear}`), {
                privateText: result.private,
                publicText: result.public,
                timestamp: new Date()
            });
            alert(`✅ SUCCESS: Reports published to ${targetYear} Archive!`);
            onClose(); 
        } catch (e) {
            alert("❌ Error saving to database: " + e.message);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700">
                <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 p-8 flex justify-between items-center text-white">
                    <div className="flex items-center gap-3">
                        <ShieldCheck size={28} />
                        <div>
                            <h2 className="text-2xl font-black tracking-tight uppercase">AI Performance Audit</h2>
                            <p className="text-xs opacity-70 font-bold uppercase tracking-widest">Generating Intelligence for {targetYear}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-full transition-colors"><X size={28} /></button>
                </div>

                <div className="p-8 overflow-y-auto flex-1 bg-slate-50/50 dark:bg-slate-900/50">
                    {!result ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 max-w-md w-full text-center">
                                <div className="mb-6">
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Select Analysis Year</label>
                                    <select 
                                        value={targetYear} 
                                        onChange={(e) => setTargetYear(e.target.value)}
                                        className="w-full text-center text-xl font-black text-indigo-600 bg-indigo-50 border-2 border-indigo-100 rounded-xl py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="2026">2026 (Current)</option>
                                        <option value="2025">2025</option>
                                        <option value="2024">2024</option>
                                        <option value="2023">2023</option>
                                    </select>
                                </div>
                                
                                <button onClick={handleAnalyze} disabled={loading} className="w-full py-4 bg-slate-900 text-white font-black rounded-xl uppercase tracking-tighter hover:bg-slate-800 transition-all flex justify-center items-center gap-2">
                                    {loading ? (
                                        <><span>Running Analysis...</span> <Sparkles className="animate-spin" size={16}/></>
                                    ) : (
                                        `Generate ${targetYear} Report`
                                    )}
                                </button>
                                {error && <div className="mt-4 p-3 bg-red-50 text-red-600 text-xs font-bold rounded">{error}</div>}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="bg-white p-6 rounded-2xl border-2 border-indigo-500">
                                <h3 className="text-xs font-black text-indigo-500 mb-2 uppercase">Preview: Private Brief ({targetYear})</h3>
                                <div className="whitespace-pre-wrap text-sm text-slate-700 h-32 overflow-y-auto border p-2 rounded">{result.private}</div>
                            </div>
                            <div className="bg-slate-100 p-6 rounded-2xl border border-slate-300">
                                <h3 className="text-xs font-black text-slate-500 mb-2 uppercase">Preview: Team Pulse ({targetYear})</h3>
                                <div className="whitespace-pre-wrap text-sm text-slate-600 h-24 overflow-y-auto border p-2 rounded">{result.public}</div>
                            </div>
                            <button onClick={handlePublish} className="w-full py-4 bg-indigo-600 text-white font-black rounded-xl shadow-lg uppercase tracking-tighter hover:bg-indigo-700">
                                PUBLISH TO {targetYear} ARCHIVE
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SmartAnalysis;
