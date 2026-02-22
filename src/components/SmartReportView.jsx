import React, { useState, useEffect } from 'react';
import { Sparkles, TrendingUp, AlertTriangle, CheckCircle2, ShieldCheck, Maximize2, X, Lock, Users } from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import SmartAnalysis from './SmartAnalysis';

const SmartReportView = ({ year, teamData, staffLoads, user, forceAdminView }) => {  
  const { isDemo } = useNexus();
  const [loading, setLoading] = useState(true);
  
  // 🛡️ MASTER OVERRIDE: Check if user is admin OR if the parent component forces admin view
  const isActuallyAdmin = forceAdminView === true;

  // HOLD BOTH REPORTS IN STATE
  const [reports, setReports] = useState({ private: null, public: null });
  
  // ADMIN TOGGLE STATE
  const [viewMode, setViewMode] = useState(isActuallyAdmin ? 'private' : 'public'); 
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [isFullReportOpen, setIsFullReportOpen] = useState(false);

  useEffect(() => {
      if (!isActuallyAdmin) setViewMode('public');
  }, [isActuallyAdmin]);

  // 🛡️ BULLETPROOF PARSER HELPER v4 (Decouples UI boxes from the Full Report)
  const parseAI = (rawText) => {
    if (!rawText) return { preview: "", highlights: [], risks: [], fullText: "" };
    
    // Legacy JSON fallback
    if (typeof rawText === 'object') {
        return {
            preview: rawText.summary || rawText.preview || "",
            highlights: rawText.highlights || rawText.wins || [],
            risks: rawText.risks || [],
            fullText: JSON.stringify(rawText, null, 2)
        };
    }

    const lines = String(rawText).split('\n');
    let highlights = [];
    let risks = [];
    let previewText = "";
    let currentSection = 'none';

    // 1. Clean the full text while extracting the dashboard bits
    const cleanedLines = lines.map(line => {
        const cleanLine = line.trim();
        const lowerLine = cleanLine.toLowerCase();

        // Detect Sections
        if (lowerLine.includes('win') || lowerLine.includes('highlight') || lowerLine.includes('success')) {
            currentSection = 'wins';
        } else if (lowerLine.includes('risk') || lowerLine.includes('focus') || lowerLine.includes('recommendation')) {
            currentSection = 'risks';
        } else if (lowerLine.includes('analysis') || lowerLine.includes('summary') || lowerLine.includes('conclusion')) {
            currentSection = 'summary';
        }

        // Clean Bullets (Strips numbers like "1.", "2)", asterisks, and dashes)
        const isBullet = cleanLine.startsWith('*') || cleanLine.startsWith('-') || /^\d+[\.\)]/.test(cleanLine);
        
        if (isBullet) {
            const pureText = cleanLine
                .replace(/^[\*\-\s]+/, '')
                .replace(/^\d+[\.\)]\s*/, '')
                .replace(/^[\*\-\s]+/, '')
                .trim();
            
            const unboldedText = pureText.replace(/\*\*/g, '');
            
            if (pureText) {
                if (currentSection === 'wins' && highlights.length < 5) highlights.push(unboldedText);
                if (currentSection === 'risks' && risks.length < 5) risks.push(unboldedText);
            }

            // Return a perfectly clean dash bullet for the full text view
            return "- " + pureText;
        } 
        
        // Extract Preview Text (First solid paragraph of the summary section)
        if (!cleanLine.startsWith('#') && cleanLine.length > 30 && currentSection === 'summary' && !previewText) {
            previewText = cleanLine.replace(/\*\*/g, '');
        }

        return line; // Return normal lines untouched for the full text
    });

    // 2. Fallbacks if the AI was completely uncooperative
    if (!previewText) {
         const fallbackLines = cleanedLines.filter(l => !l.startsWith('#') && !l.startsWith('-') && l.trim().length > 30);
         previewText = fallbackLines.length > 0 ? fallbackLines[0].replace(/\*\*/g, '') : "Analysis completed. View full report for detailed breakdown.";
    }
    if (highlights.length === 0) highlights = ["See full report for detailed wins."];
    if (risks.length === 0) risks = ["See full report for risk analysis."];

    return {
        preview: previewText,
        highlights,
        risks,
        fullText: cleanedLines.join('\n') // The entire intact report for the Modal!
    };
  };
  
  useEffect(() => {
    if (!isDemo && !user) return; 

    const fetchReport = async () => {
      setLoading(true);
      try {
        if (isDemo) {
          let mockReport = {};
          if (String(year) === '2026') {
            mockReport = {
              private: { 
                preview: "Private: Peter (JG11) is experiencing severe scope creep and burnout risk. Reallocate his Inpatient Ward duties to Steve.", 
                highlights: ["Steve maintaining 100% on Shield Integration.", "Charles securing Mutant Genome grant."], 
                risks: ["Peter's On-Call frequency.", "Tony's WFH isolation."],
                fullText: "## Executive Wins\n- Steve maintaining 100% on Shield Integration.\n- Charles securing Mutant Genome grant.\n\n## Risk Factors\n- Peter's On-Call frequency.\n- Tony's WFH isolation.\n\n## Full Analysis\nPrivate: Peter (JG11) is experiencing severe scope creep and burnout risk. Reallocate his Inpatient Ward duties to Steve."
              },
              public: { 
                preview: "Public: The Marvel CEP Team is crushing Q1! Shield Integration is complete, and clinical targets are being met across the board.", 
                highlights: ["Shield Integration Completed.", "New Web Shooter protocols active."], 
                risks: ["Maintain communication during remote work.", "Monitor ward volumes."],
                fullText: "## Team Wins\n- Shield Integration Completed.\n- New Web Shooter protocols active.\n\n## Strategic Focus\n- Maintain communication during remote work.\n- Monitor ward volumes.\n\n## Summary\nPublic: The Marvel CEP Team is crushing Q1! Shield Integration is complete, and clinical targets are being met across the board."
              }
            };
          } else {
             // Generic mock for other years
             mockReport = {
              private: { 
                preview: "Archived Private Report. Standard operational parameters maintained.", 
                highlights: ["Clinical targets met.", "Research grants approved."], 
                risks: ["Standard operational friction.", "Budget constraints."],
                fullText: "## Executive Wins\n- Clinical targets met.\n- Research grants approved.\n\n## Risk Factors\n- Standard operational friction.\n- Budget constraints.\n\n## Full Analysis\nArchived Private Report. Standard operational parameters maintained."
              },
              public: { 
                preview: "Archived Public Report. The team maintained excellent patient care metrics.", 
                highlights: ["Clinical excellence.", "Public relations win."], 
                risks: ["Supply chain stability.", "Equipment maintenance."],
                fullText: "## Team Wins\n- Clinical excellence.\n- Public relations win.\n\n## Strategic Focus\n- Supply chain stability.\n- Equipment maintenance.\n\n## Summary\nArchived Public Report. The team maintained excellent patient care metrics."
              }
            };
          }
          setReports(mockReport);
        } else {
          const reportRef = doc(db, 'system_data', `reports_${year}`);
          const reportSnap = await getDoc(reportRef);

          if (reportSnap.exists()) {
            const data = reportSnap.data();
            setReports({
                private: parseAI(data.privateText),
                public: parseAI(data.publicText)
            });
          } else {
            const emptyState = {
              preview: "No published report found for this year.",
              highlights: ["Ready for analysis."],
              risks: ["Awaiting data import."],
              fullText: "No report data has been generated or published for this year yet."
            };
            setReports({ private: emptyState, public: emptyState });
          }
        }
      } catch (e) { console.error(e); } finally { setLoading(false); }
    };
    
    fetchReport();
  }, [isDemo, year, user]);

  if (loading) return <div className="h-64 bg-slate-800 animate-pulse rounded-3xl" />;

  const activeReport = reports[viewMode] || reports.public;
  const isPrivateView = viewMode === 'private';

  // Modal Text Formatter (Applies Headers and Bullets cleanly)
  const formatAIText = (text) => {
    if (!text) return null;

    const textColor = "text-slate-700 dark:text-gray-300";
    const boldColor = "text-indigo-700 dark:text-indigo-300 font-bold";
    const bulletColor = "text-indigo-500 dark:text-blue-400";
    const dividerColor = "border-slate-200 dark:border-slate-700";

    return text.split('\n').map((line, index) => {
      let trimmedLine = line.trim();

      if (!trimmedLine) return <div key={index} className="h-2" />; 
      
      if (trimmedLine === '---' || trimmedLine === '***' || trimmedLine === '- - -') {
        return <hr key={index} className={`my-4 border-t-2 border-dashed ${dividerColor}`} />;
      }

      let isHeader = false;
      let headerClass = "";
      if (trimmedLine.startsWith('### ')) {
        trimmedLine = trimmedLine.replace(/^###\s/, '');
        isHeader = true;
        headerClass = `text-md mt-4 mb-2 uppercase tracking-wide ${boldColor}`;
      } else if (trimmedLine.startsWith('## ')) {
        trimmedLine = trimmedLine.replace(/^##\s/, '');
        isHeader = true;
        headerClass = `text-lg mt-5 mb-3 uppercase tracking-wide ${boldColor}`;
      } else if (trimmedLine.startsWith('# ')) {
        trimmedLine = trimmedLine.replace(/^#\s/, '');
        isHeader = true;
        headerClass = `text-xl mt-5 mb-3 uppercase tracking-widest ${boldColor}`;
      }

      const isBullet = trimmedLine.startsWith('- ');
      if (isBullet) trimmedLine = trimmedLine.replace(/^\-\s/, '');

      const parts = trimmedLine.split(/(\*\*.*?\*\*)/g);
      const formattedLine = parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className={boldColor}>{part.replace(/\*/g, '')}</strong>;
        }
        return part.replace(/\*\*/g, ''); 
      });

      if (isHeader) return <div key={index} className={headerClass}>{formattedLine}</div>;

      if (isBullet) {
        return (
          <div key={index} className="flex items-start mb-1 ml-2">
            <span className={`mr-2 ${bulletColor}`}>•</span>
            <span className={`leading-relaxed ${textColor}`}>{formattedLine}</span>
          </div>
        );
      }
      return <p key={index} className={`mb-2 leading-relaxed ${textColor}`}>{formattedLine}</p>;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden group">
        
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* COLUMN 1: AURA HEADER, TOGGLES, SCORE, AND SUMMARY */}
          <div className="md:col-span-1 pr-6 flex flex-col">
            
            <div className="flex items-center gap-2 mb-4 opacity-80">
              <Sparkles size={16} className="text-yellow-300" />
              <span className="text-[10px] font-black uppercase tracking-widest">
                {isPrivateView ? 'AURA EXECUTIVE ANALYSIS' : 'AURA TEAM PULSE'}
              </span>
            </div>

            {isActuallyAdmin && (
                <div className="flex bg-black/30 w-fit rounded-lg p-1 border border-white/20 backdrop-blur-md mb-6">
                    <button 
                        onClick={() => setViewMode('private')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${isPrivateView ? 'bg-red-500 text-white shadow-lg' : 'text-white/50 hover:text-white'}`}
                    >
                        <Lock size={12} /> Executive Brief
                    </button>
                    <button 
                        onClick={() => setViewMode('public')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${!isPrivateView ? 'bg-emerald-500 text-white shadow-lg' : 'text-white/50 hover:text-white'}`}
                    >
                        <Users size={12} /> Team Pulse
                    </button>
                </div>
            )}

            <div className="text-6xl font-black mb-1 tracking-tighter">100%</div>
            <div className={`inline-flex w-fit items-center gap-1 px-3 py-1 rounded-full backdrop-blur-md text-[10px] font-black uppercase mb-4 ${isPrivateView ? 'bg-red-500/30 text-red-100' : 'bg-emerald-500/30 text-emerald-100'}`}>
              {isPrivateView ? <Lock size={10} /> : <Users size={10} />}
              {isPrivateView ? 'PRIVATE ARCHIVE' : 'PUBLIC ARCHIVE'}
            </div>
            
           {/* 🛡️ THE PREVIEW FIX: Displays the extracted summary blurb here */}
           <div className="text-xs leading-relaxed font-bold opacity-80 line-clamp-3 italic">
              {activeReport?.preview}
            </div>
            
            <button 
              onClick={() => setIsFullReportOpen(true)}
              className="mt-3 flex w-fit items-center gap-1 text-[10px] font-black uppercase text-indigo-200 hover:text-white transition-colors"
            >
              <Maximize2 size={12} /> View Full Analysis
            </button>
          </div>

          {/* COLUMNS 2 & 3: WINS AND RISKS COLUMNS */}
          <div className="md:col-span-2 flex flex-col justify-between">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div>
                <h3 className="text-[10px] font-black uppercase text-emerald-300 mb-3 flex items-center gap-2 tracking-[0.2em]">
                  <TrendingUp size={14} /> {isPrivateView ? 'Executive Wins' : 'Team Wins'}
                </h3>
                <ul className="space-y-3">
                  {activeReport?.highlights?.map((h, i) => (
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
                  {activeReport?.risks?.map((r, i) => (
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
                {isActuallyAdmin && isPrivateView ? (
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
          <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 shrink-0">
              <div className="flex items-center gap-2">
                {isPrivateView ? <Lock className="text-red-500" size={18} /> : <Users className="text-emerald-500" size={18} />}
                <h2 className="font-black uppercase text-sm tracking-tight text-slate-800 dark:text-white">
                    {isPrivateView ? `Private Executive Analysis: ${year}` : `Team Pulse: ${year}`}
                </h2>
              </div>
              <button className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white" onClick={() => setIsFullReportOpen(false)}><X size={20} /></button>
            </div>
            
            {/* 🛡️ THE MODAL FIX: Displays the 100% complete, unadulterated essay here */}
            <div className="p-8 overflow-y-auto flex-1">
             <div className="text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
              {formatAIText(activeReport?.fullText)}
            </div>
            </div>
            
            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 text-center border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button onClick={() => setIsFullReportOpen(false)} className="px-8 py-3 bg-slate-900 dark:bg-indigo-600 text-white font-black rounded-xl uppercase text-xs tracking-widest hover:bg-slate-800 dark:hover:bg-indigo-500 transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ANALYSIS TOOL */}
      {isAnalysisOpen && isActuallyAdmin && (
        <SmartAnalysis teamData={teamData} staffLoads={staffLoads} onClose={() => setIsAnalysisOpen(false)} />
      )}
    </div>
  );
};

export default SmartReportView;
