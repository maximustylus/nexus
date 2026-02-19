import React, { useState, useEffect } from 'react';
import { Sparkles, TrendingUp, AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import SmartAnalysis from './SmartAnalysis'; // <--- IMPORT THE MODAL

const SmartReportView = ({ year, teamData, staffLoads }) => {
  const { isDemo } = useNexus();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false); // <--- MODAL STATE

  useEffect(() => {
    const generateReport = async () => {
      setLoading(true);
      if (isDemo) {
        setTimeout(() => {
          setReport({
            score: 88,
            status: 'Optimised',
            summary: "Departmental efficiency is high (88%), driven by the successful rollout of the 'Avenger Protocol'.",
            highlights: ["Clinical Lead (Steve) cleared 100% of milestones.", "Tech by Tony reduced admin time by 20%."],
            risks: ["Staff 'Peter' showing signs of burnout."],
            recommendation: "Reassign Tony to automate Peter's data entry tasks."
          });
          setLoading(false);
        }, 1000);
      } else {
        try {
          const q = query(collection(db, 'projects_kkh'), where('year', '==', year));
          const snap = await getDocs(q);
          const docs = snap.docs.map(d => d.data());
          const total = docs.length;
          const completed = docs.filter(d => d.progress === 100).length;
          const score = total === 0 ? 0 : Math.round((completed / total) * 100);

          setReport({
            score: score || 72,
            status: score > 80 ? 'Excellent' : 'Stable',
            summary: `Analysis of ${total} active projects for ${year}.`,
            highlights: docs.slice(0, 2).map(d => `Project '${d.title}' is moving forward.`),
            risks: ["Ensure consistent data entry for predictions."],
            recommendation: "Continue monitoring clinical load vs project progress."
          });
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      }
    };
    generateReport();
  }, [isDemo, year]);

  if (loading) return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 h-64 flex flex-col items-center justify-center animate-pulse">
      <Sparkles className="text-indigo-400 mb-3 animate-spin" size={24} />
      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Generating AI Brief...</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 1. THE SUMMARY CARD (Visual Only) */}
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-20">
            <ShieldCheck size={120} />
        </div>
        
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 border-r border-white/20 pr-6">
            <div className="flex items-center gap-2 mb-2 opacity-80">
              <Sparkles size={16} className="text-yellow-300" />
              <span className="text-xs font-bold uppercase tracking-wider">AI Executive Brief</span>
            </div>
            <div className="text-5xl font-black mb-1">{report?.score}%</div>
            <div className="inline-block px-2 py-1 rounded bg-white/20 backdrop-blur-md text-[10px] font-bold uppercase mb-4">
              Status: {report?.status}
            </div>
          </div>

          <div className="md:col-span-2 flex flex-col justify-between">
            <p className="text-sm font-medium opacity-90 mb-4">{report?.summary}</p>
            
            {/* 2. THE ACTION BUTTON (This triggers the Bulk Import Modal) */}
            <button 
              onClick={() => setIsAnalysisOpen(true)}
              className="w-full md:w-max px-6 py-3 bg-white text-indigo-700 font-black rounded-xl uppercase text-xs tracking-tighter shadow-xl hover:bg-indigo-50 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <ShieldCheck size={16} />
              Perform Deep Smart Audit ({year})
            </button>
          </div>
        </div>
      </div>

      {/* 3. THE ACTUAL ANALYZER MODAL */}
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
