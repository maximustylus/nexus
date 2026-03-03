import React, { useState, useEffect } from 'react';
import { BrainCircuit, Sparkles, X } from 'lucide-react'; // ✅ Changed Bot to BrainCircuit

const AuraGreeting = ({ openAuraChat, dailyPatientLoad = 120 }) => {
  const [showBubble, setShowBubble] = useState(false);
  const [phase, setPhase] = useState('quote'); 
  const [currentQuote, setCurrentQuote] = useState('');

  const getDailySmartQuote = () => {
    const now = new Date();
    const currentHour = now.getHours();
    const dayOfWeek = now.getDay(); 

    if (dayOfWeek === 1 && currentHour < 12) {
      return "To understand the present and anticipate the future, one must know enough of the past. Let's set the pace for the week. — Lee Kuan Yew";
    }
    if (currentHour < 12 && dailyPatientLoad > 100) {
      return "We have a heavy list today. Synergy is better than my way or your way. It's our way. — Stephen Covey";
    }
    if (currentHour >= 12 && currentHour <= 14) {
      return "Endurance is not just the ability to bear a hard thing, but to turn it into glory. — William Barclay";
    }
    if (dayOfWeek === 5 && currentHour >= 14) {
      return "Protect the pulse. Leave the clinic in the clinic. Have a great weekend. — AURA";
    }
    const defaults = [
      "Talent wins games, but teamwork and intelligence win championships. — Michael Jordan",
      "The strength of the team is each individual member. Let's cover each other today. — Phil Jackson",
      "Trust is the highest form of human motivation. — Stephen Covey",
      "A nation is great not by its size alone. It is the will, the cohesion, the stamina of its people. — Lee Kuan Yew"
    ];
    return defaults[Math.floor(Math.random() * defaults.length)];
  };

  useEffect(() => {
    const today = new Date().toDateString();
    const lastSeen = localStorage.getItem('aura_greeting_date');

    setCurrentQuote(getDailySmartQuote());

    // ⚠️ ONCE-A-DAY RULE DISABLED FOR TESTING. 
    // (To turn it back on later, wrap these lines in: if (lastSeen !== today) { ... })
    setShowBubble(true);
    localStorage.setItem('aura_greeting_date', today);
    
    const timer = setTimeout(() => {
      setPhase('greeting');
    }, 10000);
    
    return () => clearTimeout(timer);
    
  }, [dailyPatientLoad]);

  return (
    <div className="fixed bottom-20 right-4 z-[90] flex flex-col items-end space-y-3 animate-in fade-in slide-in-from-bottom-8 duration-700 pointer-events-none">
      
      {showBubble && (
        <div 
          onClick={() => {
              setShowBubble(false);
              openAuraChat(); 
          }}
          className="pointer-events-auto group relative cursor-pointer max-w-[280px] bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-indigo-100 dark:border-slate-800 shadow-xl rounded-2xl rounded-br-none p-4 transition-all duration-500 hover:scale-105 hover:shadow-indigo-500/20"
        >
          <button 
            onClick={(e) => {
              e.stopPropagation(); 
              setShowBubble(false);
            }}
            className="absolute -top-2 -right-2 bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
          >
            <X size={14} />
          </button>

          {phase === 'quote' ? (
            <div className="flex items-start space-x-2 animate-in fade-in zoom-in duration-500">
              <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 italic leading-snug">
                "{currentQuote}"
              </p>
            </div>
          ) : (
            <div className="flex items-start space-x-2 animate-in fade-in zoom-in duration-500">
              <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                How can I help you today?
              </p>
            </div>
          )}
        </div>
      )}

      {/* ✅ COHERENT ICON: Using BrainCircuit to match AURA's identity */}
      <button 
        onClick={() => {
            setShowBubble(false); 
            openAuraChat(); 
        }}
        className="pointer-events-auto relative flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-full shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-110 transition-all duration-300"
      >
        <span className="absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-30 animate-ping"></span>
        <BrainCircuit className="text-white w-7 h-7" /> 
      </button>

    </div>
  );
};

export default AuraGreeting;
