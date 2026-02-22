import React, { useState, useRef } from 'react';
import { db } from '../firebase'; 
import { doc, getDoc, getDocs, setDoc, collection } from 'firebase/firestore';
import { X, ShieldCheck, Sparkles, Upload, FileJson } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';

// 🛡️ IMPORT CONTEXT
import { useNexus } from '../context/NexusContext';

const functions = getFunctions(undefined, 'us-central1');
const generateSmartAnalysis = httpsCallable(functions, 'generateSmartAnalysis');

const STAFF_PROFILES = {
    "Alif":      { role: "Lead and Senior Clinical Exercise Physiologist", grade: "JG14", focus: "Leadership, Management, Clinical, Education, Research" },
    "Fadzlynn":  { role: "Clinical Exercise Physiologist, CEP I",      grade: "JG13", focus: "Clinical Lead, Co-Lead Management, Education" },
    "Derlinder": { role: "Clinical Exercise Physiologist, CEP II",     grade: "JG12", focus: "Education Lead, Clinical" },
    "Ying Xian": { role: "Clinical Exercise Physiologist, CEP II",     grade: "JG12", focus: "Research Co-Lead, Clinical" },
    "Brandon":   { role: "Clinical Exercise Physiologist, CEP III",    grade: "JG11", focus: "Education Co-Lead, Clinical, Community" },
    "Nisa":      { role: "Administrator", grade: "Admin", focus: "Operations, Budget, Rostering" }
};

// 🦸‍♂️ MARVEL PROFILES
const MARVEL_PROFILES = {
    "Steve": { role: "Senior Staff and Clinical Lead", grade: "JG14", focus: "Leadership, Clinical" },
    "Peter": { role: "Junior Staff", grade: "JG11", focus: "Inpatient, Clinical" },
    "Charles": { role: "Head of Department", grade: "JG16", focus: "Research" },
    "Jean": { role: "Education Lead", grade: "JG13", focus: "Education" },
    "Tony": { role: "Senior Staff and Research Lead", grade: "JG15", focus: "Management" }
};

const SmartAnalysis = ({ teamData, staffLoads, onClose }) => {
    const { isDemo } = useNexus();
    const [targetYear, setTargetYear] = useState('2026'); 
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('GENERATE ANALYSIS');
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [importedData, setImportedData] = useState(null);
    const fileInputRef = useRef(null);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target.result);
                setImportedData(json);
                alert(`SUCCESS: Loaded bulk data from ${file.name}`);
            } catch (err) {
                alert("❌ ERROR: The file is not a valid JSON format.");
            }
        };
        reader.readAsText(file);
    };

    const handleAnalyze = async () => {
        setLoading(true); 
        setError('');
        
        try {
            setStatus(`Filtering Data for ${targetYear}...`);
            
            // 1. Establish the source: imported JSON or the live teamData
            const sourceData = importedData || teamData || [];
            
            // 2. Filter data for the specific year (The AI needs this vial)
            const filteredYearData = sourceData.map(staff => ({
                name: staff.staff_name || staff.name,
                projects: (staff.projects || []).filter(p => (p.year || '2026') === String(targetYear))
            }));

            setStatus('Connecting to Secure Neural Link...');

            // 3. Select the correct profiles (The AI needs this vial too)
            const currentProfiles = isDemo ? MARVEL_PROFILES : STAFF_PROFILES;

            // 🛡️ THE INJECTION: We use the exact names defined in this file
            const response = await generateSmartAnalysis({
                targetYear: Number(targetYear),      // Fixed: ensures it's a number
                teamName: "SSMC@KKH CEP Team",      // Fixed: your new universal name tag
                staffProfiles: Object.values(currentProfiles), // Fixed: ensures it is an ARRAY
                yearData: filteredYearData          // Fixed: maps to our filtered variable
            });

            setResult({ 
                private: response.data.private, 
                public: response.data.public 
            });

        } catch (err) {
            console.error("Neural Link Error:", err);
            setError('Analysis Failed: ' + err.message);
        } finally {
            setLoading(false);
            setStatus('GENERATE ANALYSIS');
        }
    };

    const handlePublish = async () => {
        if (!result || !importedData) return;
        setLoading(true);
        try {
            await setDoc(doc(db, 'system_data', `reports_${targetYear}`), {
                privateText: result.private,
                publicText: result.public,
                timestamp: new Date()
            });

            const batchPromises = importedData.map(staff => {
                const staffId = staff.staff_name.toLowerCase();
                return setDoc(doc(db, `archive_${targetYear}`, staffId), {
                    staff_name: staff.staff_name,
                    projects: staff.projects,
                    year: targetYear
                });
            });

            await Promise.all(batchPromises);

            alert(`SUCCESS: Fully archived ${targetYear} data and report!`);
            onClose(); 
        } catch (e) {
            alert("❌ Archive Error: " + e.message);
        } finally {
            setLoading(false);
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
                            <p className="text-xs opacity-70 font-bold uppercase tracking-widest">Year {targetYear}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-full transition-colors"><X size={28} /></button>
                </div>

                <div className="p-8 overflow-y-auto flex-1 bg-slate-50/50 dark:bg-slate-900/50">
                    {!result ? (
                        <div className="flex flex-col items-center justify-center py-6">
                            <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 max-w-md w-full text-center">
                                <div className="mb-6">
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Select Analysis Year</label>
                                    <select value={targetYear} onChange={(e) => setTargetYear(e.target.value)} className="w-full text-center text-xl font-black text-indigo-600 bg-indigo-50 dark:bg-slate-900 border-2 border-indigo-100 dark:border-slate-700 rounded-xl py-3 focus:outline-none">
                                        <option value="2026">2026</option>
                                        <option value="2025">2025</option>
                                        <option value="2024">2024</option>
                                    </select>
                                </div>
                                <div className="mb-8 p-4 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900/50">
                                    <input type="file" accept=".json" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                                    <button onClick={() => fileInputRef.current.click()} className={`w-full py-3 flex items-center justify-center gap-2 text-xs font-bold rounded-lg transition-all ${importedData ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-white dark:bg-slate-800 text-slate-600 border border-slate-200 hover:border-indigo-400'}`}>
                                        {importedData ? <FileJson size={16} /> : <Upload size={16} />}
                                        {importedData ? 'DATA LOADED' : 'IMPORT BULK .JSON'}
                                    </button>
                                </div>
                                <button onClick={handleAnalyze} disabled={loading} className="w-full py-4 bg-slate-900 dark:bg-indigo-600 text-white font-black rounded-xl uppercase hover:bg-slate-800 transition-all">
                                    {loading ? <span>{status}</span> : `Generate ${targetYear} Report`}
                                </button>
                                {error && <div className="mt-4 p-3 bg-red-50 text-red-600 text-xs font-bold rounded">{error}</div>}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border-2 border-indigo-500 shadow-sm">
                                <h3 className="text-xs font-black text-indigo-500 mb-2 uppercase">Private Brief ({targetYear})</h3>
                                <div className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 h-32 overflow-y-auto border border-slate-100 dark:border-slate-700 p-3 rounded-lg bg-slate-50 dark:bg-slate-900">{result.private}</div>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                                <h3 className="text-xs font-black text-slate-500 mb-2 uppercase">Team Pulse ({targetYear})</h3>
                                <div className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400 h-24 overflow-y-auto border border-slate-200 p-3 rounded-lg bg-white dark:bg-slate-900">{result.public}</div>
                            </div>
                            <button onClick={handlePublish} className="w-full py-4 bg-indigo-600 text-white font-black rounded-xl shadow-lg uppercase hover:bg-indigo-700 transition-all">
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
