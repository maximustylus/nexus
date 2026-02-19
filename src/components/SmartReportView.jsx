import React, { useState, useEffect } from 'react';
import { Sparkles, TrendingUp, AlertTriangle, CheckCircle2, ShieldCheck, Activity } from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import { db } from '../firebase';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import SmartAnalysis from './SmartAnalysis';

const SmartReportView = ({ year, teamData, staffLoads }) => {
  const { isDemo } = useNexus();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);

  useEffect(() => {
    const fetchReportData = async () => {
      setLoading(true);
      if (isDemo) {
        setTimeout(() => {
          setReport({
            score: 88,
            status: 'Optimised',
            summary: "Departmental efficiency is high. Junior staff focus on Community projects is impacting clinical targets.",
            highlights: ["Clinical Lead (Steve) cleared 100% milestones.", "Tech by Tony reduced admin by 20%."],
            risks: ["Peter showing signs of admin burnout.", "Education curriculum bottleneck in Q3."],
            recommendation: "Rebalance project loads vs clinical requirements."
          });
          setLoading(false);
        }, 800);
      } else {
        try {
          const reportRef = doc(db, 'system_data', `reports_${year}`);
          const reportSnap = await getDoc(reportRef);

          if (reportSnap.exists()) {
            const data = reportSnap.data();
            // --- PARSE THE SAVED DATA BACK INTO SCANNABLE BLOCKS ---
            setReport({
              score: 100,
              status: 'ARCHIVED',
              summary: data.privateText?.slice(0, 150) + "...", 
              fullSummary: data.privateText,
              highlights: ["Historical data retrieved from archive.", "JG-Grade audit confirmed."],
              risks: ["Read-only historical record.", "Calculation based on bulk import."],
              recommendation: "Refer to Archive for full context."
            });
          } else {
            // Live calculation fallback
            const q = query(collection(db, 'projects_kkh'), where('year', '==', year));
            const snap = await getDocs(q);
            const docs = snap.docs.map(d => d.data());
            const score = docs.length === 0 ? 0 : Math.round((docs.filter(d => d.progress === 100).length / docs.length) * 100);

            setReport({
              score,
              status: score > 80 ? 'Excellent' : 'Stable',
              summary: `Analysis of ${docs.length} active projects for ${year}.`,
              highlights: docs.slice(0, 2).map(d => `Project '${d.title}' is on track.`),
              risks: ["Inconsistent data entry may affect prediction accuracy."],
              recommendation: "Open Smart Analysis to generate a new deep audit."
            });
          }
        } catch (e) { console.error(e); } finally { setLoading(false); }
      }
    };
    fetchReportData();
  }, [isDemo, year]);

  if (loading) return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 h-64 flex flex-col items-center justify-center animate-pulse">
      <Sparkles className="text-indigo-400 mb-3 animate-spin" size={24} />
      <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Generating AI Brief...</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden group">
        {/* Background Icon */}
        <div className="absolute top-0 right-0 p-4 opacity-20">
            <img src="/nexus-n-icon.png" alt="Nexus AI" className="w-32 h-32 object-contain" />
        </div>
        
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* LEFT: SCORE & SUMMARY */}
          <div className="md:col-span-1 border-r border-white/20 pr-6">
            <div className="flex items-center gap-2 mb-2 opacity-80">
              <Sparkles size={16} className="text-yellow-300" />
              <span className="text-[10px] font-black uppercase tracking-widest">AI Executive Brief</span>
            </div>
            <div className="text-6xl font-black mb-1 tracking-tighter">{report?.score}%</div>
            <div className="inline-block px-2 py-1 rounded bg-white/20 backdrop-blur-md text-[10px] font-bold uppercase mb-4 tracking-tighter">
              System Status: {report?.status}
            </div>
            <p className="text-xs leading-relaxed font-medium opacity-90 italic">
              {report?.summary}
            </p>
          </div>

          {/* MIDDLE: FORMATTED WINS & RISKS */}
          <div className="md:col-span-2 flex flex-col justify-between">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Wins List */}
              <div>
                <h3 className="text-[10px] font-black uppercase text-emerald-300 mb-3 flex items-center gap-2 tracking-widest">
                  <TrendingUp size={14} /> Key Wins
                </h3>
                <ul className="space-y-2">
                  {report?.highlights.map((h, i) => (
                    <li key={i} className="flex gap-2 text-[11px] font-bold opacity-90">
                      <CheckCircle2 size={14} className="shrink-0 text-emerald-300" />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Risks List */}
              <div>
                <h3 className="text-[10px] font-black uppercase text-orange-300 mb-3 flex items-center gap-2 tracking-widest">
                  <AlertTriangle size={14} /> Attention Needed
                </h3>
                <ul className="space-y-2">
                  {report?.risks.map((r, i) => (
                    <li key={i} className="flex gap-2 text-[11px] font-bold opacity-90">
                      <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* BUTTON ROW */}
            <div className="mt-8 flex items-center gap-3">
                <button 
                onClick={() => setIsAnalysisOpen(true)}
                className="px-5 py-3 bg-white text-indigo-700 font-black rounded-xl uppercase text-[10px] tracking-tight shadow-xl hover:bg-indigo-50 transition-all active:scale-95 flex items-center gap-2"
                >
                <ShieldCheck size={14} />
                Run Deep Audit ({year})
                </button>
                
                <div className="bg-white/10 rounded-xl px-4 py-2 border border-white/10 flex-1">
                   <p className="text-[9px] font-black text-indigo-200 uppercase tracking-tighter mb-0.5">Strategy</p>
                   <p className="text-[11px] font-bold italic truncate">"{report?.recommendation}"</p>
                </div>
            </div>
          </div>
        </div>
      </div>

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
