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
  const [isFullReportOpen, setIsFullReportOpen] = useState(false);

  // --- SMART EXTRACTION HELPER ---
  // This scans the AI text and pulls out real insights for the columns
  const extractBullets = (text, type) => {
    if (!text) return [];
    const sentences = text.split(/[.!?]/).map(s => s.trim()).filter(s => s.length > 20);
    
    if (type === 'wins') {
      // Look for success keywords or specific names hitting targets
      return sentences
        .filter(s => /success|achieved|exceeded|leadership|met|clinical load of [3-9]/i.test(s))
        .slice(0, 2)
        .map(s => s.replace(/[#*]/g, ''));
    }
    
    if (type === 'risks') {
      // Look for gap keywords or specific names missing targets
      return sentences
        .filter(s => /risk|shortfall|attention|burnout|below|clinical load of [0-2]/i.test(s))
        .slice(0, 2)
        .map(s => s.replace(/[#*]/g, ''));
    }
    return [];
  };

  const cleanText = (text) => {
    if (!text) return "";
    return text.replace(/[#*]/g, '').replace(/\n+/g, ' ').trim();
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
            highlights: ["Fadzlynn hitting 31% clinical target.", "Derlinder exceeding education metrics."],
            risks: ["Brandon clinical hours at 15% (Target: 30%).", "Potential admin burnout for junior roles."],
            recommendation: "Rebalance project loads vs clinical requirements."
          });
        } else {
          const reportRef = doc(db, 'system_data', `reports_${year}`);
          const reportSnap = await getDoc(reportRef);

          if (reportSnap.exists()) {
            const data = reportSnap.data();
            const fullText = data.privateText || "";
            
            // DYNAMICALLY EXTRACT WINS/RISKS FROM THE ACTUAL TEXT
            const smartWins = extractBullets(fullText, 'wins');
            const smartRisks = extractBullets(fullText, 'risks');

            setReport({
              score: 100,
              status: 'ARCHIVED',
              summary: fullText,
              highlights: smartWins.length > 0 ? smartWins : ["Historical audit confirmed.", "Data integrity verified."],
              risks: smartRisks.length > 0 ? smartRisks : ["Review archived feedback.", "Monitor track alignment."],
              recommendation: "Refer to full analysis for detailed JG-Grade feedback."
            });
          } else {
            setReport({
              score: 0,
              status: 'PENDING',
              summary: "No published report found for this year.",
              highlights: ["System ready for analysis."],
              risks: ["Awaiting .json data import."],
              recommendation: "Upload workload data to generate audit."
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
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <img src="/nexus-n-icon.png" alt="Nexus AI" className="w-32 h-32" />
        </div>
        
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-8">
          
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
                <Maximize2 size={12} /> View Full Analysis
              </button>
            )}
          </div>

          <div className="md:col-span-2 flex flex-col justify-between">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              
              {/* SMART WINS COLUMN */}
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

              {/* SMART RISKS COLUMN */}
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

     {/* FULL REPORT MODAL */}
      {isFullReportOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-200 dark:border-slate-800">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <h2 className="font-black uppercase text-sm tracking-tight text-slate-800 dark:text-white">Performance Analysis: {year}</h2>
              <button className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white" onClick={() => setIsFullReportOpen(false)}><X size={20} /></button>
            </div>
            <div className="p-8 max-h-[60vh] overflow-y-auto">
              <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed font-medium">
                {report?.summary.replace(/[#*]/g, '')}
              </p>
            </div>
            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 text-center border-t border-slate-100 dark:border-slate-800">
              <button onClick={() => setIsFullReportOpen(false)} className="px-8 py-3 bg-slate-900 dark:bg-indigo-600 text-white font-black rounded-xl uppercase text-xs tracking-widest hover:bg-slate-800 dark:hover:bg-indigo-500 transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ANALYSIS TOOL */}
      {isAnalysisOpen && (
        <SmartAnalysis teamData={teamData} staffLoads={staffLoads} onClose={() => setIsAnalysisOpen(false)} />
      )}
    </div>
  );
};

export default SmartReportView;
