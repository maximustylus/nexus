import React, { useState } from 'react';
import { db } from '../firebase'; 
import { doc, setDoc } from 'firebase/firestore'; 
import { X, ShieldCheck, Sparkles } from 'lucide-react';
// 1. IMPORT SECURE CLOUD FUNCTIONS
import { getFunctions, httpsCallable } from 'firebase/functions';

// 2. CONNECT TO BACKEND (No API Keys here!)
const functions = getFunctions(undefined, 'us-central1');
const generateSmartAnalysis = httpsCallable(functions, 'generateSmartAnalysis');

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
// --- 1. IMPROVED FILE UPLOAD ---
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const rawData = JSON.parse(event.target.result);
                // Ensure we are grabbing the array regardless of format
                const dataToLoad = Array.isArray(rawData) ? rawData : (rawData.staff || []);
                
                if (dataToLoad.length > 0) {
                    setImportedData(dataToLoad);
                    console.log("📂 [NEXUS] Data Loaded:", dataToLoad);
                    alert(`✅ SUCCESS: Loaded ${dataToLoad.length} staff profiles.`);
                } else {
                    alert("⚠️ No staff data found in file.");
                }
            } catch (err) {
                alert("❌ JSON Error: Ensure you used 'Straight Quotes' and not 'Slanted Quotes'.");
            }
        };
        reader.readAsText(file);
    };

    // --- 2. IMPROVED ANALYSIS LOGIC ---
    const handleAnalyze = async () => {
        setLoading(true); setError('');
        try {
            // Determine which data to use
            const source = importedData || teamData || [];
            console.log("🧠 [NEXUS] Analyzing Source:", source);

            const yearData = source.map(staff => {
                const projects = (staff.projects || []).filter(p => 
                    String(p.year) === String(targetYear)
                );
                return {
                    name: staff.staff_name || staff.name,
                    projects: projects
                };
            });

            // Count total projects found
            const count = yearData.reduce((acc, s) => acc + s.projects.length, 0);
            console.log(`📊 [NEXUS] Found ${count} projects for ${targetYear}`);

            if (count === 0) {
                throw new Error(`No ${targetYear} projects found. Check if the 'year' in your JSON is exactly '${targetYear}'.`);
            }

            setStatus('Connecting to Secure Neural Link...');
            const response = await generateSmartAnalysis({
                targetYear,
                staffProfiles: STAFF_PROFILES,
                yearData,
                staffLoads
            });

            setResult({ private: response.data.private, public: response.data.public });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
            setStatus('GENERATE ANALYSIS');
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
                                        <><span>{status}</span> <Sparkles className="animate-spin" size={16}/></>
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
