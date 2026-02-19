import React, { useState, useEffect } from 'react';
import { Sparkles, TrendingUp, AlertTriangle, CheckCircle2, ShieldCheck, Maximize2, X } from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import SmartAnalysis from './SmartAnalysis';

const SmartReportView = ({ year, teamData, staffLoads }) => {
  const { isDemo } = useNexus();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [isFullReportOpen, setIsFullReportOpen] = useState(false); // <--- FOR THE "READ FURTHER" POPUP

  // Helper to clean up Markdown artifacts (#, *, etc.)
  const cleanText = (text) => {
    if (!text) return "";
    return text
      .replace(/[#*]/g, '') // Removes # and *
      .replace(/\n+/g, ' ') // Flattens newlines for the teaser
      .trim();
  };

  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      try {
        if (isDemo) {
          setReport({
            score: 88,
            status: 'Optimised',
            summary: "Departmental efficiency is high. 2025 data reflects strong leadership in Education and Clinical domains.",
            highlights: ["Steve (Clinical) cleared all milestones.", "Tech by Tony reduced admin by 20%."],
            risks: ["Peter showing signs of administrative burnout.", "Finalise curriculum for Q3."],
            recommendation: "Rebalance project loads vs clinical requirements."
          });
          setLoading(false);
        } else {
          const reportRef = doc(db, 'system_data', `reports_${year}`);
          const reportSnap = await getDoc(reportRef);

          if (reportSnap.exists()) {
            const data = reportSnap.data();
            setReport({
              score: 100,
              status: 'ARCHIVED',
              summary: data.privateText, // Raw full text
              highlights: ["Historical data retrieved.", "JG-Grade audit confirmed."],
              risks: ["Read-only record.", "Verified via bulk import."],
              recommendation: "Click 'View Full Report' for deep insights."
            });
          } else {
            setReport({
              score: 0,
              status: 'PENDING',
              summary: "No published report found for this year.",
              highlights: ["Ready for analysis."],
              risks: ["Awaiting data import."],
              recommendation: "Upload .json to generate your first audit."
            });
          }
        }
      } catch (e) { console.error(e); } finally { setLoading(false); }
    };
    fetchReport();
  }, [isDemo, year]);

  if (loading) return <div className="h-64 bg-slate-800 animate-pulse rounded-3xl" />;

  return (
    <div className="flex flex-col gap-4">
      {/* --- EXECUTIVE DASHBOARD CONTAINER --- */}
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-10">
            <img src="/nexus-n-icon.png" alt="Nexus AI" className="w-32 h-32" />
        </div>
        
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* LEFT COLUMN: SCORE & TEASER */}
          <div className="md:col-span-1 border-r border-white/20 pr-6">
            <div className="flex items-center gap-2 mb-2 opacity-80">
              <Sparkles size={16} className="text-yellow-300" />
              <span className="text-[10px] font-black uppercase tracking-widest">AI Executive Brief</span>
            </div>
            <div className="text-6xl font-black mb-1 tracking-tighter">{report?.score}%</div>
            <div className="inline-block px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-black uppercase mb-4">
              {report?.status}
            </div>
            <p className="text-xs leading-relaxed font-bold opacity-80 line-clamp-3 italic">
              "{cleanText(report?.summary)}"
            </p>
            {report?.status === 'ARCHIVED' && (
              <button 
                onClick={() => setIsFullReportOpen(true)}
                className="mt-3 flex items-center gap-1 text-[10px] font-black uppercase text-indigo-200 hover:text-white transition-colors"
              >
                <Maximize2 size={12} /> Read Full Analysis
              </button>
            )}
          </div>

          {/* MIDDLE COLUMN: WINS & RISKS */}
          <div className="md:col-span-2 flex flex-col justify-between">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
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

            {/* ACTION FOOTER */}
            <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between gap-4">
                <button 
                    onClick={() => setIsAnalysisOpen(true)}
                    className="px-6 py-3 bg-white text-indigo-700 font-black rounded-xl uppercase text-[10px] shadow-xl hover:bg-indigo-50 transition-all flex items-center gap-2 shrink-0"
                >
                    <ShieldCheck size={16} />
                    Deep Audit ({year})
                </button>
                <div className="bg-black/20 rounded-xl px-4 py-3 border border-white/10 flex-1 hidden sm:block">
                   <p className="text-[11px] font-black italic truncate">"{report?.recommendation}"</p>
                </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- FULL REPORT MODAL (THE "READ FURTHER" VIEW) --- */}
      {isFullReportOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <Sparkles className="text-indigo-600" size={20} />
                <h2 className="font-black uppercase text-sm tracking-tight text-slate-800 dark:text-white">Full Performance Analysis: {year}</h2>
              </div>
              <button onClick={() => setIsFullReportOpen(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="p-8 max-h-[60vh] overflow-y-auto">
              <div className="prose dark:prose-invert max-w-none">
                {/* Formatting the text block to respect newlines and remove Markdown symbols */}
                <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed font-medium">
                  {report?.summary.replace(/[#*]/g, '')}
                </p>
              </div>
            </div>
            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 text-center">
              <button onClick={() => setIsFullReportOpen(false)} className="px-8 py-3 bg-slate-900 dark:bg-indigo-600 text-white font-black rounded-xl uppercase text-xs tracking-widest shadow-lg">Close Report</button>
            </div>
          </div>
        </div>
      )}

      {/* --- SMART ANALYSIS MODAL --- */}
      {isAnalysisOpen && (
        <SmartAnalysis teamData={teamData} staffLoads={staffLoads} onClose={() => setIsAnalysisOpen(false)} />
      )}
    </div>
  );
};

export default SmartReportView;
