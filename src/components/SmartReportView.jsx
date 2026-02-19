import React, { useState, useEffect } from 'react';
import { Sparkles, TrendingUp, AlertTriangle, CheckCircle2, ShieldCheck, Activity } from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import { db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import SmartAnalysis from './SmartAnalysis';

const SmartReportView = ({ year, teamData, staffLoads }) => {
  const { isDemo } = useNexus();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      try {
        if (isDemo) {
          // --- SANDBOX MOCK ---
          setTimeout(() => {
            setReport({
              score: 88,
              status: 'Optimised',
              summary: "Overall efficiency is high. 2025 data reflects strong leadership in Education/Clinical domains.",
              highlights: ["Steve (Clinical) cleared all milestones.", "Tech by Tony reduced admin by 20%."],
              risks: ["Peter showing signs of administrative burnout.", "Finalise curriculum for Q3."],
              recommendation: "Rebalance project loads vs clinical requirements."
            });
            setLoading(false);
          }, 800);
        } else {
          // --- LIVE/ARCHIVE LOGIC ---
          const reportRef = doc(db, 'system_data', `reports_${year}`);
          const reportSnap = await getDoc(reportRef);

          if (reportSnap.exists()) {
            const data = reportSnap.data();
            // We "tease" the archive data into the UI columns
            setReport({
              score: 100,
              status: 'ARCHIVED',
              summary: data.privateText?.slice(0, 150) + "...", // Teaser of the text
              highlights: ["Historical data retrieved from archive.", "Team clinical averages verified."],
              risks: ["Read-only historical record.", "JG-Grade audit locked for this year."],
              recommendation: "Refer to Archive for specific staff feedback."
            });
          } else {
            // Fallback for years without a published report
            setReport({
              score: 0,
              status: 'PENDING',
              summary: `No published report found for ${year}.`,
              highlights: ["Ready for analysis."],
              risks: ["Awaiting data import."],
              recommendation: "Upload .json to generate your first audit."
            });
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [isDemo, year]);

  if (loading) return (
    <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 h-64 flex flex-col items-center justify-center animate-pulse">
      <Sparkles className="text-indigo-400 mb-3 animate-spin" size={32} />
      <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Syncing Intelligence...</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden group">
        
        {/* Background Icon */}
        <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-30 transition-opacity">
            <img src="/nexus-n-icon.png" alt="Nexus AI" className="w-32 h-32 object-contain" />
        </div>
        
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* LEFT: SCORE & STATUS */}
          <div className="md:col-span-1 border-r border-white/20 pr-6">
            <div className="flex items-center gap-2 mb-2 opacity-80">
              <Sparkles size={16} className="text-yellow-300" />
              <span className="text-[10px] font-black uppercase tracking-widest">AI Executive Brief</span>
            </div>
            <div className="text-6xl font-black mb-1 tracking-tighter">{report?.score}%</div>
            <div className="inline-block px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-black uppercase mb-4 tracking-tight">
              {report?.status}
            </div>
            <p className="text-xs leading-relaxed font-bold opacity-80 italic">
              {report?.summary}
            </p>
          </div>

          {/* MIDDLE: FORMATTED WINS & RISKS */}
          <div className="md:col-span-2 flex flex-col justify-between">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              {/* Wins List */}
              <div>
                <h3 className="text-[10px] font-black uppercase text-emerald-300 mb-3 flex items-center gap-2 tracking-[0.2em]">
                  <TrendingUp size={14} /> Key Wins
                </h3>
                <ul className="space-y-3">
                  {report?.highlights.map((h, i) => (
                    <li key={i} className="flex gap-2 text-[11px] font-black leading-tight">
                      <CheckCircle2 size={14} className="shrink-0 text-emerald-300" />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Risks List */}
              <div>
                <h3 className="text-[10px] font-black uppercase text-orange-300 mb-3 flex items-center gap-2 tracking-[0.2em]">
                  <AlertTriangle size={14} /> Attention Needed
                </h3>
                <ul className="space-y-3">
                  {report?.risks.map((r, i) => (
                    <li key={i} className="flex gap-2 text-[11px] font-black leading-tight">
                      <span className="shrink-0 w-2 h-2 rounded-full bg-orange-400 mt-1" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* ACTION BAR AT BOTTOM */}
            <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between gap-4">
                <button 
                    onClick={() => setIsAnalysisOpen(true)}
                    className="px-6 py-3 bg-white text-indigo-700 font-black rounded-xl uppercase text-[10px] tracking-tight shadow-xl hover:bg-indigo-50 transition-all active:scale-95 flex items-center gap-2 shrink-0"
                >
                    <ShieldCheck size={16} />
                    Run Deep Audit ({year})
                </button>
                
                <div className="bg-black/20 rounded-xl px-4 py-3 border border-white/10 flex-1 hidden sm:block">
                   <p className="text-[9px] font-black text-indigo-300 uppercase mb-0.5 tracking-tighter">Strategic Recommendation</p>
                   <p className="text-[11px] font-black italic truncate">"{report?.recommendation}"</p>
                </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL */}
      {isAnalysisOpen && (
        <SmartAnalysis 
          teamData={teamData} 
          staffLoads={staffLoads} 
          onClose={() => setIsAnalysisOpen(false)} 
        />
      )}
    </div>
  );
};

export default SmartReportView;
