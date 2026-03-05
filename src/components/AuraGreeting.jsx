import React, { useState, useEffect } from 'react';
import { BrainCircuit, Sparkles, X } from 'lucide-react';

const AuraGreeting = ({ openAuraChat, dailyPatientLoad = 120 }) => {
  const [showBubble, setShowBubble] = useState(false);
  const [isExiting, setIsExiting] = useState(false); // 🌟 NEW: Controls the macOS minimize animation
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

    // ⚠️ ONCE-A-DAY RULE: Disabled for testing!
    // if (lastSeen !== today) {
        setShowBubble(true);
        localStorage.setItem('aura_greeting_date', today);
        
        const timer = setTimeout(() => {
          setPhase('greeting');
        }, 10000);
        
        return () => clearTimeout(timer);
    // }
  }, [dailyPatientLoad]);

  // 🌟 THE GENIE EFFECT HANDLERS
  const handleDismiss = (e) => {
    e.stopPropagation();
    setIsExiting(true); // Trigger the "suck in" animation
    setTimeout(() => {
        setShowBubble(false); // Actually remove it from DOM after animation finishes
    }, 500); 
  };

  const handleOpenAura = () => {
    setIsExiting(true); // Trigger the "suck in" animation
    setTimeout(() => {
        setShowBubble(false);
        openAuraChat(); // Open the main AURA panel
    }, 400); 
  };

  return (
    <div className="fixed bottom-20 right-4 z-[90] flex flex-col items-end space-y-3 pointer-events-none">
      
      {showBubble && (
        <div 
          onClick={handleOpenAura}
          // 🌟 THE MAGIC CSS: origin-bottom-right makes it scale down perfectly into the AURA button
          // isExiting applies the scale-0 and extreme translate to mimic the macOS minimize
          className={`pointer-events-auto group relative cursor-pointer max-w-[320px] bg-slate-900/95 backdrop-blur-xl border border-indigo-500/40 shadow-[0_0_40px_-10px_rgba(99,102,241,0.5)] rounded-[2rem] rounded-br-none p-5 transform transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] origin-bottom-right
            ${isExiting ? 'scale-0 opacity-0 translate-y-12 translate-x-8' : 'scale-100 opacity-100 translate-y-0 translate-x-0'}
            ${!isExiting && 'animate-in fade-in zoom-in-50 slide-in-from-bottom-12'}
          `}
        >
          {/* Subtle Close Button */}
          <button 
            onClick={handleDismiss}
            className="absolute -top-2 -right-2 bg-slate-800 text-slate-400 hover:text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg border border-slate-700"
          >
            <X size={14} />
          </button>

          {phase === 'quote' ? (
            <div className={`flex items-start space-x-3 transition-opacity duration-500 ${isExiting ? 'opacity-0' : 'opacity-100'}`}>
              <Sparkles className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex flex-col">
                 <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1.5 drop-shadow-md">Aura Daily Briefing</span>
                 <p className="text-sm font-medium text-slate-200 italic leading-relaxed">
                   "{currentQuote}"
                 </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-3 animate-in fade-in zoom-in duration-500">
              <BrainCircuit className="w-5 h-5 text-indigo-400" />
              <p className="text-sm font-bold text-white tracking-wide">
                AURA here, how can I help?
              </p>
            </div>
          )}
        </div>
      )}

      {/* THE GLOWING AURA BUTTON */}
      <button 
        onClick={showBubble ? handleOpenAura : openAuraChat} // If bubble is open, suck it in first. Otherwise just open.
        className="pointer-events-auto relative flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-full shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-110 transition-all duration-300"
      >
        <span className="absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-30 animate-ping"></span>
        <BrainCircuit className="text-white w-7 h-7" /> 
      </button>

    </div>
  );
};

export default AuraGreeting;
