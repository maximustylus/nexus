import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Globe } from 'lucide-react';

const LANGUAGES = [
  { code: 'en', label: 'English', greeting: 'Welcome', hoverColor: 'group-hover:border-emerald-500/50', bgGlow: 'from-emerald-400 to-teal-500' },
  { code: 'ms', label: 'Melayu', greeting: 'Selamat Datang', hoverColor: 'group-hover:border-indigo-500/50', bgGlow: 'from-indigo-400 to-purple-500' },
  { code: 'zh', label: '中文', greeting: '欢迎', hoverColor: 'group-hover:border-rose-500/50', bgGlow: 'from-rose-400 to-pink-500' },
  { code: 'ta', label: 'தமிழ்', greeting: 'வரவேற்பு', hoverColor: 'group-hover:border-amber-500/50', bgGlow: 'from-amber-400 to-orange-500' },
];

export default function LanguageGate() {
  const navigate = useNavigate();
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    // Trigger entrance animation slightly after mount for a smooth transition
    setTimeout(() => setAnimate(true), 100);
  }, []);

  const handleLanguageSelect = (code) => {
    localStorage.setItem('nexus_language', code);
    navigate('/individuals/pathway');
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 transition-colors duration-700 flex flex-col items-center justify-center relative overflow-hidden p-4 md:p-6 font-sans">
      
      {/* VISUAL BACKGROUND ELEMENTS (Matches Welcome Screen) */}
      <div className="absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '40px 40px' }}>
      </div>
      <div className={`fixed top-0 left-0 w-[800px] h-[800px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none animate-float-slow ${animate ? 'opacity-100' : 'opacity-0'}`}></div>
      <div className={`fixed bottom-0 right-0 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none animate-float-delayed ${animate ? 'opacity-100' : 'opacity-0'}`}></div>

      <div className={`relative z-10 w-full max-w-4xl transition-all duration-1000 transform ${animate ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 scale-95'}`}>
        
        {/* TOP BAR: Back Button & Context */}
        <div className="flex justify-between items-center mb-12 px-2">
          <button 
            onClick={() => navigate('/')} 
            className="flex items-center gap-2 px-4 py-2 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 font-black text-xs uppercase tracking-widest rounded-full border border-slate-200 dark:border-slate-700 shadow-sm transition-all group"
          >
              <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform"/> Gateway
          </button>
          
          <div className="flex items-center gap-2 opacity-60">
              <Globe size={16} className="text-slate-500 dark:text-slate-400" />
              <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Protocol Active</span>
          </div>
        </div>

        {/* HEADER */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tighter mb-4">
            Select Language
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-sm md:text-base max-w-lg mx-auto">
            Please choose your preferred language to start your journey.
          </p>
        </div>
        
        {/* LANGUAGE GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageSelect(lang.code)}
              className={`group relative overflow-hidden bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl rounded-[2rem] p-8 md:p-12 flex flex-col items-center justify-center transition-all duration-300 hover:-translate-y-1 ${lang.hoverColor}`}
            >
              {/* Subtle hover gradient background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${lang.bgGlow} opacity-0 group-hover:opacity-[0.03] dark:group-hover:opacity-[0.05] transition-opacity duration-300`}></div>
              
              <span className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white mb-4 group-hover:scale-110 transition-transform duration-300 relative z-10">
                {lang.label}
              </span>
              <span className="text-slate-500 dark:text-slate-400 text-sm md:text-base font-bold tracking-widest uppercase relative z-10">
                {lang.greeting}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ANIMATIONS */}
      <style>{`
          @keyframes float-slow {
              0%, 100% { transform: translate(0, 0); }
              50% { transform: translate(20px, 40px); }
          }
          @keyframes float-delayed {
              0%, 100% { transform: translate(0, 0); }
              50% { transform: translate(-30px, -20px); }
          }
          .animate-float-slow { animation: float-slow 15s ease-in-out infinite; }
          .animate-float-delayed { animation: float-delayed 18s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
