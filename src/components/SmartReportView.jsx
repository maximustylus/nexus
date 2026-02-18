import React, { useState, useEffect } from 'react';
import { Bot, Sparkles, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useNexus } from '../context/NexusContext'; // <--- HOOK INTO SANDBOX
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

const SmartReportView = ({ year }) => {
  const { isDemo } = useNexus(); // <--- CHECK MODE
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);

  useEffect(() => {
    const generateReport = async () => {
      setLoading(true);

      if (isDemo) {
        // ==================================================
        // 🧪 SANDBOX MODE: SCRIPTED MARVEL NARRATIVE
        // ==================================================
        setTimeout(() => {
          setReport({
            score: 88,
            status: 'Optimised',
            summary: "Departmental efficiency is high (88%), driven by the successful rollout of the 'Avenger Protocol'. However, junior staff (Peter) are showing signs of administrative burnout. Resource reallocation recommended.",
            highlights: [
              "Clinical Lead (Steve) has cleared 100% of 'Shield Integration' milestones.",
              "Research output is peaking with Charles's 'Mutant Genome' manuscript in review.",
              "Tech implementation by Tony is reducing manual admin time by 20%."
            ],
            risks: [
              "Staff 'Peter' is stuck on 'Web Shooter Analysis' due to conflicting inpatient loads.",
              "Potential bottleneck in Education domain if Jean's curriculum isn't finalized by Q3."
            ],
            recommendation: "Immediate Action: Pause 'Web Shooter' project. Reassign Tony to automate Peter's data entry tasks to prevent burnout."
          });
          setLoading(false);
        }, 1500); // Fake AI thinking time

      } else {
        // ==================================================
        // 🔌 LIVE MODE: REAL FIRESTORE CALCULATION
        // ==================================================
        try {
          // Fetch Real Projects
          const q = query(collection(db, 'projects_kkh'), where('year', '==', year));
          const snap = await getDocs(q);
          const docs = snap.docs.map(d => d.data());

          // Simple Logic to calculate score (You can make this complex later)
          const total = docs.length;
          const completed = docs.filter(d => d.progress === 100).length;
          const score = total === 0 ? 0 : Math.round((completed / total) * 100);

          setReport({
            score: score || 72, // Fallback if no data
            status: score > 80 ? 'Excellent' : 'Stable',
            summary: `Analysis of ${total} active projects for ${year}. The department is maintaining steady progress.`,
            highlights: docs.slice(0, 2).map(d => `Project '${d.title}' is moving forward.`),
            risks: ["Ensure data entry is consistent for accurate AI predictions."],
            recommendation: "Continue monitoring clinical load vs project progress."
          });
        } catch (e) {
          console.error(e);
          setReport(null);
        } finally {
          setLoading(false);
        }
      }
    };

    generateReport();
  }, [isDemo, year]); // Re-run when toggled

  // --- RENDER ---
  if (loading) return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 h-64 flex flex-col items-center justify-center animate-pulse">
      <Sparkles className="text-indigo-400 mb-3 animate-spin" size={24} />
      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Generating AI Brief...</span>
    </div>
  );

  if (!report) return null;

  return (
    <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
      {/* Background Decoration */}
      <div className="absolute top-0 right-0 p-4 opacity-30">
        <img 
          src="/nexus-n-icon.png" 
          alt="Nexus AI" 
          className="w-32 h-32 object-contain" 
        />
      </div>

      <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* LEFT: SCORE CARD */}
        <div className="md:col-span-1 border-r border-white/20 pr-6">
          <div className="flex items-center gap-2 mb-2 opacity-80">
            <Sparkles size={16} className="text-yellow-300" />
            <span className="text-xs font-bold uppercase tracking-wider">AI Executive Brief</span>
          </div>
          <div className="text-5xl font-black mb-1">{report.score}<span className="text-2xl">%</span></div>
          <div className="inline-block px-2 py-1 rounded bg-white/20 backdrop-blur-md text-[10px] font-bold uppercase mb-4">
            System Status: {report.status}
          </div>
          <p className="text-sm leading-relaxed font-medium opacity-90">
            {report.summary}
          </p>
        </div>

        {/* MIDDLE: HIGHLIGHTS & RISKS */}
        <div className="md:col-span-2 flex flex-col justify-between">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            
            {/* Wins */}
            <div>
              <h3 className="text-xs font-bold uppercase text-emerald-300 mb-3 flex items-center gap-2">
                <TrendingUp size={14} /> Key Wins
              </h3>
              <ul className="space-y-2">
                {report.highlights.map((h, i) => (
                  <li key={i} className="flex gap-2 text-xs opacity-90">
                    <CheckCircle2 size={12} className="shrink-0 mt-0.5 text-emerald-300" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>

            {/* Risks */}
            <div>
              <h3 className="text-xs font-bold uppercase text-orange-300 mb-3 flex items-center gap-2">
                <AlertTriangle size={14} /> Attention Needed
              </h3>
              <ul className="space-y-2">
                {report.risks.map((r, i) => (
                  <li key={i} className="flex gap-2 text-xs opacity-90">
                    <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* AI RECOMMENDATION BOX */}
          <div className="mt-6 bg-white/10 rounded-lg p-3 border border-white/10 backdrop-blur-sm">
            <p className="text-[10px] font-bold text-indigo-200 uppercase mb-1">Strategic Recommendation</p>
            <p className="text-xs font-bold italic">"{report.recommendation}"</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SmartReportView;
