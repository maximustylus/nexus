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
        // Sandbox Mock Data
        setTimeout(() => {
          setReport({
            score: 88,
            status: 'Optimised',
            summary: "Sandbox Analysis: Departmental efficiency is high (88%).",
            highlights: ["Clinical Lead (Steve) cleared 100% of milestones."],
            risks: ["Staff burnout risk identified in junior roles."],
            recommendation: "Review workload distribution in the next sprint."
          });
          setLoading(false);
        }, 800);
      } else {
        try {
          // 1. FIRST: Check if a published report exists in system_data
          const reportRef = doc(db, 'system_data', `reports_${year}`);
          const reportSnap = await getDoc(reportRef);

          if (reportSnap.exists()) {
            const data = reportSnap.data();
            // If found, use the published AI text
            setReport({
              score: 100, // Or calculate from projects if needed
              status: 'ARCHIVED',
              summary: data.privateText || "Archived report loaded.",
              highlights: ["Historical data retrieved from archive.", "JG-Grade audit confirmed."],
              risks: ["This is a read-only historical record."],
              recommendation: "Refer to the public team pulse for shared wins."
            });
          } else {
            // 2. FALLBACK: Calculate dynamically from projects_kkh
            const q = query(collection(db, 'projects_kkh'), where('year', '==', year));
            const snap = await getDocs(q);
            const docs = snap.docs.map(d => d.data());
            
            const total = docs.length;
            const completed = docs.filter(d => d.progress === 100).length;
            const score = total === 0 ? 0 : Math.round((completed / total) * 100);

            setReport({
              score: score,
              status: score > 80 ? 'Excellent' : 'Stable',
              summary: total > 0 ? `Live analysis of ${total} projects for ${year}.` : `No live projects found for ${year}. Use Smart Analysis to import data.`,
              highlights: docs.slice(0, 2).map(d => `Project '${d.title}' in progress.`),
              risks: ["Ensure consistent data entry for accurate tracking."],
              recommendation: "Open Smart Analysis to generate a new deep audit."
            });
          }
        } catch (e) {
          console.error("Fetch Error:", e);
        } finally {
          setLoading(false);
        }
      }
    };

    fetchReportData();
  }, [isDemo, year]);

  if (loading) return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 h-64 flex flex-col items-center justify-center animate-pulse text-indigo-400">
      <Sparkles className="mb-3 animate-spin" size={24} />
      <span className="text-xs font-black uppercase tracking-widest text-slate-400">Retrieving Intelligence...</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden group">
        <div className="absolute -right-10 -bottom-10 opacity-10 group-hover:opacity-20 transition-opacity">
            <Activity size={200} />
        </div>
        
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 border-r border-white/20 pr-6">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={16} className="text-yellow-300" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">AI Executive Brief</span>
            </div>
            <div className="text-5xl font-black mb-1">{report?.score}%</div>
            <div className="inline-block px-2 py-1 rounded bg-white/20 backdrop-blur-md text-[10px] font-bold uppercase mb-4">
              {report?.status}
            </div>
          </div>

          <div className="md:col-span-2 flex flex-col justify-between">
            <div className="max-h-32 overflow-y-auto mb-4 scrollbar-hide">
                <p className="text-sm font-medium opacity-90 leading-relaxed">
                    {report?.summary}
                </p>
            </div>
            
            <button 
              onClick={() => setIsAnalysisOpen(true)}
              className="w-full md:w-max px-6 py-4 bg-white text-indigo-700 font-black rounded-xl uppercase text-xs tracking-tighter shadow-2xl hover:bg-indigo-50 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <ShieldCheck size={18} />
              Perform Deep Smart Audit ({year})
            </button>
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
