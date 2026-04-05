import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe2, ChevronRight } from 'lucide-react';

const LANGUAGES = [
  { code: 'en', label: 'English', greeting: 'Welcome', color: 'indigo' },
  { code: 'ms', label: 'Bahasa Melayu', greeting: 'Selamat Datang', color: 'emerald' },
  { code: 'zh', label: '中文', greeting: '欢迎', color: 'amber' },
  { code: 'ta', label: 'தமிழ்', greeting: 'வரவேற்கிறோம்', color: 'purple' }
];

export default function LanguageGate() {
  const navigate = useNavigate();
  const [animate, setAnimate] = useState(false);
  const [hoveredLang, setHoveredLang] = useState(null);

  useEffect(() => {
    setTimeout(() => setAnimate(true), 100);
  }, []);

  const handleSelect = (code) => {
    localStorage.setItem('nexus_language', code);
    navigate('/individuals/pathway');
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 transition-colors duration-700 flex flex-col items-center justify-center p-4 md:p-6 relative overflow-hidden font-sans">
      
      {/* UNIFIED BACKGROUND ELEMENTS */}
      <div className="absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
      <div className={`fixed top-0 left-0 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none animate-float-slow transition-opacity duration-1000 ${animate ? 'opacity-100' : 'opacity-0'}`}></div>
      <div className={`fixed bottom-0 right-0 w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-[100px] pointer-events-none animate-float-delayed transition-opacity duration-1000 ${animate ? 'opacity-100' : 'opacity-0'}`}></div>
      <div className={`relative z-10 w-full max-w-md transition-all duration-1000 transform ${animate ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 scale-95'}`}>
      <div className="bg-white dark:bg-[#111827] rounded-[2rem] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-center">

        {/* TOP BAR */}
                <div className="flex justify-between items-center mb-6 px-2">
                  <button onClick={() => navigate('/individuals/pathway')} className="flex items-center gap-2 px-4 py-2 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white font-black text-xs uppercase tracking-widest rounded-full border border-slate-200 dark:border-slate-700 shadow-sm transition-all group">
                      <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform"/> {t.back}
                  </button>
                  
                  <div className="flex items-center gap-3">
                      <button 
                          onClick={toggleTheme} 
                          className="p-2 rounded-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-md border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 shadow-sm hover:scale-105 transition-all"
                      >
                          {isDark ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} />}
                      </button>
                      <div className="text-[10px] font-mono text-slate-400 bg-slate-200/50 dark:bg-slate-800/50 px-2 py-1 rounded">ID: {sessionId}</div>
                  </div>
                </div>
          
          {/* HEADER */}
          <div className="px-8 pt-12 pb-8 flex flex-col items-center">
            <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800/50 rounded-2xl flex items-center justify-center shadow-inner mb-6 border border-slate-100 dark:border-slate-700">
              <Globe2 className="w-8 h-8 text-slate-700 dark:text-slate-300" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-2">
              {hoveredLang ? LANGUAGES.find(l => l.code === hoveredLang)?.greeting : 'Welcome'}
            </h1>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
              Select your language
            </p>
          </div>

          {/* LANGUAGE OPTIONS */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800">
            <div className="grid gap-3">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleSelect(lang.code)}
                  onMouseEnter={() => setHoveredLang(lang.code)}
                  onMouseLeave={() => setHoveredLang(null)}
                  className={`flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-${lang.color}-500 hover:shadow-md transition-all group active:scale-95`}
                >
                  <span className="text-lg font-bold text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                    {lang.label}
                  </span>
                  <div className={`w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center group-hover:bg-${lang.color}-50 dark:group-hover:bg-${lang.color}-500/20 transition-colors`}>
                    <ChevronRight className={`w-4 h-4 text-slate-400 group-hover:text-${lang.color}-500 transition-colors`} />
                  </div>
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
