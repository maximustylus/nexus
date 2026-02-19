import React, { useState, useEffect } from 'react';
import { Sparkles, TrendingUp, AlertTriangle, CheckCircle2, ShieldCheck, Maximize2, X, Lock, Users } from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import SmartAnalysis from './SmartAnalysis';

const SmartReportView = ({ year, teamData, staffLoads, user }) => {
  const { isDemo } = useNexus();
  const [loading, setLoading] = useState(true);
  
  // HOLD BOTH REPORTS IN STATE
  const [reports, setReports] = useState({ private: null, public: null });
  // ADMIN TOGGLE STATE (Defaults to private for admins, public for staff)
  const [viewMode, setViewMode] = useState('private'); 
  
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [isFullReportOpen, setIsFullReportOpen] = useState(false);

  const isAdmin = user?.role === 'admin' || isDemo;

  // Force non-admins to strictly view the public pulse
  useEffect(() => {
      if (!isAdmin) setViewMode('public');
  }, [isAdmin]);

  // BULLETPROOF PARSER HELPER
  const parseAI = (rawText) => {
    let parsed = { summary: "", wins: [], risks: [] };
    if (!rawText) return parsed;

    try {
        const cleanJsonString = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        parsed = JSON.parse(cleanJsonString);
    } catch (e) {
        console.error("AI JSON Parse Error. Falling back.", e);
        const cleanRawText = rawText.replace(/[#*]/g, '');
        parsed.summary = cleanRawText;
        const sentences = cleanRawText.split(/(?<=[.!?])\s+/).filter(s => s.length > 20);
        parsed.wins = sentences.length > 1 ? sentences.slice(0, 2) : ["Review full report for details."];
        parsed.risks = sentences.length > 3 ? sentences.slice(2, 4) : ["Review full report for priorities."];
    }
    
    const cleanUIString = (str) => (str || "").replace(/[#*]/g, '');
    return {
        summary: cleanUIString(parsed.summary) || "No summary available.",
        highlights: parsed.wins?.length > 0 ? parsed.wins.map(cleanUIString) : ["Historical data retrieved."],
        risks: parsed.risks?.length > 0 ? parsed.risks.map(cleanUIString) : ["Read-only record loaded."]
    };
  };

  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      try {
        if (isDemo) {
          setReports({
            private: {
              summary: "Private: Junior staff (JG11) showing scope creep in Admin tasks. Evaluate JG14 clinical ratio.",
              highlights: ["Clinical targets met by JG13."],
              risks: ["Monitor workload balance for JG11."]
            },
            public: {
              summary: "Public: The team is making great progress on Q3 deliverables. Keep up the momentum!",
              highlights: ["Education modules updated."],
              risks: ["Finalize EPIC integration."]
            }
          });
        } else {
          const reportRef = doc(db, 'system_data', `reports_${year}`);
          const reportSnap = await getDoc(reportRef);

          if (reportSnap.exists()) {
            const data = reportSnap.data();
            // PARSE BOTH JSON OBJECTS AT THE SAME TIME
            setReports({
                private: parseAI(data.privateText),
                public: parseAI(data.publicText)
            });
          } else {
            const emptyState = {
              summary: "No published report found for this year.",
              highlights: ["Ready for analysis."],
              risks: ["Awaiting data import."]
            };
            setReports({ private: emptyState, public: emptyState });
          }
        }
      } catch (e) { console.error(e); } finally { setLoading(false); }
    };
    fetchReport();
  }, [isDemo, year]);

  if (loading) return <div className="h-64 bg-slate-800 animate-pulse rounded-3xl" />;

  // DETERMINE WHICH REPORT TO SHOW BASED ON TOGGLE
  const activeReport = reports[viewMode] || reports.public;
  const isPrivateView = viewMode === 'private';

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden group">
        
        {/* BACKGROUND LOGO */}
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <img src="/nexus-n-icon.png" alt="Nexus AI" className="w-32 h-32" />
        </div>

        {/* 🕵️‍♂️ THE ADMIN TOGGLE SWITCH */}
        {isAdmin && (
            <div className="absolute top-6 right-8 z-20 flex bg-black/30 rounded-lg p-1 border border-white/20 backdrop-blur-md">
                <button 
                    onClick={() => setViewMode('private')}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${isPrivateView ? 'bg-red-500 text-white shadow-lg' : 'text-white/50 hover:text-white'}`}
                >
                    <Lock size={12} /> Executive Brief
                </button>
                <button 
                    onClick={() => setViewMode('public')}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${!isPrivateView ? 'bg-emerald-500 text-white shadow-lg' : 'text-white/50 hover:text-white'}`}
                >
                    <Users size={12} /> Team Pulse
                </button>
            </div>
        )}
        
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-8 mt-4 md:mt-0">
          
          {/* SCORE AND SUMMARY COLUMN */}
          <div className="md:col-span-1 border-r border-white/20 pr-6">
            <div className="flex items-center gap-2 mb-2 opacity-80">
              <Sparkles size={16} className="text-yellow-300" />
              <span className="text-[10px] font-black uppercase tracking-widest">
                {isPrivateView ? 'AI Executive Analysis' : 'AI Team Pulse'}
              </span>
            </div>
            <div className="text-6xl font-black mb-1 tracking-tighter">100%</div>
            
            <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full backdrop-blur-md text-[10px] font-black uppercase mb-4 ${isPrivateView ? 'bg-red-500/30 text-red-100' : 'bg-emerald-500/30 text-emerald-100'}`}>
              {isPrivateView ? <Lock size={10} /> : <Users size={10} />}
              {isPrivateView ? 'PRIVATE ARCHIVE' : 'PUBLIC ARCHIVE'}
            </div>
            
            <p className="text-xs leading-relaxed font-bold opacity-80 line-clamp-3 italic">
              "{activeReport?.summary}"
            </p>
            <button 
              onClick={() => setIsFullReportOpen(true)}
              className="mt-3 flex items-center gap-1 text-[10px] font-black uppercase text-indigo-200 hover:text-white transition-colors"
            >
              <Maximize2 size={12} /> View Full Analysis
            </button>
          </div>

          {/* WINS AND RISKS COLUMNS */}
          <div className="md:col-span-2 flex flex-col justify-between">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div>
                <h3 className="text-[10px] font-black uppercase text-emerald-300 mb-3 flex items-center gap-2 tracking-[0.2em]">
                  <TrendingUp size={14} /> {isPrivateView ? 'Executive Wins' : 'Team Wins'}
                </h3>
                <ul className="space-y-3">
                  {activeReport?.highlights.map((h, i) => (
                    <li key={i} className="flex gap-2 text-[11px] font-black leading-tight">
                      <CheckCircle2 size={14} className="shrink-0 text-emerald-300" />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-[10px] font-black uppercase text-orange-300 mb-3 flex items-center gap-2 tracking-[0.2em]">
                  <AlertTriangle size={14} /> {isPrivateView ? 'Risk Factors' : 'Strategic Focus'}
                </h3>
                <ul className="space-y-3">
                  {activeReport?.risks.map((r, i) => (
                    <li key={i} className="flex gap-2 text-[11px] font-black leading-tight">
                      <span className="shrink-0 w-2 h-2 rounded-full bg-orange-400 mt-1" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* ACTION BAR */}
            <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between gap-4">
                {isAdmin ? (
                    <button 
                        onClick={() => setIsAnalysisOpen(true)}
                        className="px-6 py-3 bg-white text-indigo-700 font-black rounded-xl uppercase text-[10px] shadow-xl hover:bg-indigo-50 transition-all flex items-center gap-2 shrink-0"
                    >
                        <ShieldCheck size={16} />
                        Deep Audit ({year})
                    </button>
                ) : (
                    <div className="px-6 py-3 bg-white/10 text-white font-black rounded-xl uppercase text-[10px] flex items-center gap-2 shrink-0">
                        <Sparkles size={16} />
                        AI Verified ({year})
                    </div>
                )}
                <div className="bg-black/20 rounded-xl px-4 py-3 border border-white/10 flex-1 hidden sm:block">
                   <p className="text-[11px] font-black italic truncate">
                      "{isPrivateView ? 'Private: Monitor JG rubrics and scope creep.' : 'Public: Maintain momentum on core deliverables.'}"
                   </p>
                </div>
            </div>
          </div>
        </div>
      </div>

      {/* FULL REPORT MODAL */}
      {isFullReportOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-200 dark:border-slate-800">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                {isPrivateView ? <Lock className="text-red-500" size={18} /> : <Users className="text-emerald-500" size={18} />}
                <h2 className="font-black uppercase text-sm tracking-tight text-slate-800 dark:text-white">
                    {isPrivateView ? `Private Executive Analysis: ${year}` : `Team Pulse: ${year}`}
                </h2>
              </div>
              <button className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white" onClick={() => setIsFullReportOpen(false)}><X size={20} /></button>
            </div>
            <div className="p-8 max-h-[60vh] overflow-y-auto">
              <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed font-medium">
                {activeReport?.summary}
              </p>
            </div>
            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 text-center border-t border-slate-100 dark:border-slate-800">
              <button onClick={() => setIsFullReportOpen(false)} className="px-8 py-3 bg-slate-900 dark:bg-indigo-600 text-white font-black rounded-xl uppercase text-xs tracking-widest hover:bg-slate-800 dark:hover:bg-indigo-500 transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ANALYSIS TOOL */}
      {isAnalysisOpen && isAdmin && (
        <SmartAnalysis teamData={teamData} staffLoads={staffLoads} onClose={() => setIsAnalysisOpen(false)} />
      )}
    </div>
  );
};

export default SmartReportView;
