import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// ADDED SUN AND MOON ICONS
import { MessageSquare, FileText, ChevronLeft, BrainCircuit, Sun, Moon } from 'lucide-react';

const DICTIONARY = {
  en: {
    back: 'Back',
    context: 'Assessment Pathway',
    title: 'Choose Your Pathway',
    chatTitle: 'AuraChat',
    chatDesc: 'Conversational AI guided assessment.',
    formTitle: 'Self-Guided',
    formDesc: 'Standard questionnaire format.',
  },
  ms: {
    back: 'Kembali',
    context: 'Laluan Penilaian',
    title: 'Pilih Laluan Anda',
    chatTitle: 'AuraChat',
    chatDesc: 'Penilaian berpandukan AI perbualan.',
    formTitle: 'Bimbingan Sendiri',
    formDesc: 'Format soal selidik standard.',
  },
  zh: {
    back: '返回',
    context: '评估路径',
    title: '选择您的路径',
    chatTitle: 'AuraChat',
    chatDesc: '对话式AI引导评估。',
    formTitle: '自主指导',
    formDesc: '标准问卷格式。',
  },
  ta: {
    back: 'பின்செல்',
    context: 'மதிப்பீட்டு பாதை',
    title: 'உங்கள் பாதையைத் தேர்ந்தெடுக்கவும்',
    chatTitle: 'AuraChat',
    chatDesc: 'உரையாடல் AI வழிகாட்டப்பட்ட மதிப்பீடு.',
    formTitle: 'சுய வழிகாட்டுதல்',
    formDesc: 'நிலையான கேள்வித்தாள் வடிவம்.',
  },
};

export default function PathwaySelection() {
  const navigate = useNavigate();
  const [lang, setLang] = useState('en');
  const [animate, setAnimate] = useState(false);
  const [sessionId] = useState(() => 'nx-' + Math.random().toString(36).substr(2, 9));

  // ADDED MISSING THEME STATE
  const [isDark, setIsDark] = useState(false);

  // ADDED THEME INITIALIZER
  useEffect(() => {
    const storedTheme = localStorage.getItem('nexus_theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (storedTheme === 'dark' || (!storedTheme && systemPrefersDark)) {
        setIsDark(true);
        document.documentElement.classList.add('dark');
    } else {
        setIsDark(false);
        document.documentElement.classList.remove('dark');
    }
  }, []);

  // ADDED TOGGLE FUNCTION
  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    if (newTheme) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('nexus_theme', 'dark');
    } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('nexus_theme', 'light');
    }
  };

  useEffect(() => {
    const storedLang = localStorage.getItem('nexus_language');
    if (storedLang && DICTIONARY[storedLang]) {
      setLang(storedLang);
    }
    
    setTimeout(() => setAnimate(true), 100);
  }, []);

  const t = DICTIONARY[lang] || DICTIONARY.en;

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 transition-colors duration-700 flex flex-col items-center justify-center relative overflow-hidden p-4 md:p-6 font-sans">
      
      {/* VISUAL BACKGROUND ELEMENTS */}
      <div className="absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '40px 40px' }}>
      </div>
      <div className={`fixed top-0 left-0 w-[800px] h-[800px] bg-pink-500/10 rounded-full blur-[120px] pointer-events-none animate-float-slow ${animate ? 'opacity-100' : 'opacity-0'}`}></div>
      <div className={`fixed bottom-0 right-0 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none animate-float-delayed ${animate ? 'opacity-100' : 'opacity-0'}`}></div>

      <div className={`relative z-10 w-full max-w-4xl transition-all duration-1000 transform ${animate ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 scale-95'}`}>
        
        {/* TOP BAR MOVED OUTSIDE FOR CONSISTENCY */}
        <div className="flex justify-between items-center mb-12 px-2 w-full">
            <button 
                onClick={() => navigate('/individuals/language')} 
                className="flex items-center gap-2 px-4 py-2 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white font-black text-xs uppercase tracking-widest rounded-full border border-slate-200 dark:border-slate-700 shadow-sm transition-all group"
            >
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
        <div className="text-center mb-12 flex flex-col items-center">
          <div className="flex items-center gap-2 opacity-60 mb-4 bg-white dark:bg-slate-800 px-4 py-2 rounded-full shadow-sm border border-slate-200 dark:border-slate-700">
              <BrainCircuit size={16} className="text-slate-500 dark:text-slate-400" />
              <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{t.context}</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tighter">
            {t.title}
          </h1>
        </div>

        {/* PATHWAY CARDS GRID */}
        <div className="grid md:grid-cols-2 gap-6 w-full max-w-4xl">
          
          {/* AURACHAT CARD */}
          <button
            onClick={() => navigate('/individuals/chat')}
            className="group relative bg-white dark:bg-[#111827] p-10 rounded-[2rem] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-slate-200 dark:border-slate-800 hover:border-pink-500/50 text-center overflow-hidden flex flex-col items-center"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-pink-400 to-rose-500 opacity-0 group-hover:opacity-[0.03] dark:group-hover:opacity-[0.05] transition-opacity duration-300"></div>
            
            <div className="w-20 h-20 bg-pink-50 dark:bg-pink-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 relative z-10">
              <MessageSquare className="w-10 h-10 text-pink-500" />
            </div>
            
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-4 relative z-10">
              {t.chatTitle}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 font-medium text-sm leading-relaxed relative z-10">
              {t.chatDesc}
            </p>
          </button>

          {/* SELF-GUIDED FORM CARD */}
          <button
            onClick={() => navigate('/individuals/form')}
            className="group relative bg-white dark:bg-[#111827] p-10 rounded-[2rem] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 text-center overflow-hidden flex flex-col items-center"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 to-teal-500 opacity-0 group-hover:opacity-[0.03] dark:group-hover:opacity-[0.05] transition-opacity duration-300"></div>
            
            <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 relative z-10">
              <FileText className="w-10 h-10 text-emerald-500" />
            </div>
            
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-4 relative z-10">
              {t.formTitle}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 font-medium text-sm leading-relaxed relative z-10">
              {t.formDesc}
            </p>
          </button>

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
