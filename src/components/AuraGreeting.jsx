import React, { useState, useEffect } from 'react';
import { Bot, Sparkles, X } from 'lucide-react';

const AuraGreeting = ({ openAuraChat, dailyPatientLoad = 120 }) => {
  // We need two states now: one for the bubble, one for the button
  const [showBubble, setShowBubble] = useState(false);
  const [phase, setPhase] = useState('quote'); // 'quote' | 'greeting'
  const [currentQuote, setCurrentQuote] = useState('');

  // 🧠 The Context-Aware Motivation Engine (Unchanged)
  const getDailySmartQuote = () => {
    // ... your existing logic ...
  };

  useEffect(() => {
    // 1. The "Once-a-Day" Check
    const today = new Date().toDateString();
    const lastSeen = localStorage.getItem('aura_greeting_date');

    // 2. Initialize the Smart Greeting
    setCurrentQuote(getDailySmartQuote());

    // 3. Logic to show the bubble
    if (lastSeen !== today) {
      setShowBubble(true);
      localStorage.setItem('aura_greeting_date', today);
      
      // The Morph Timer (Quote -> Greeting after 10 seconds)
      const timer = setTimeout(() => {
        setPhase('greeting');
      }, 10000);
      
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyPatientLoad]);

  // Notice: We NO LONGER return null. We always return the container.
  return (
    // Positioned safely above your mobile navigation bar
    <div className="fixed bottom-20 right-4 z-[90] flex flex-col items-end space-y-3 animate-in fade-in slide-in-from-bottom-8 duration-700 pointer-events-none">
      
      {/* 💬 The Frosted Glass Speech Bubble - ONLY RENDER IF showBubble IS TRUE */}
      {showBubble && (
        <div 
          onClick={() => {
              setShowBubble(false);
              openAuraChat(); // ✅ Opens AURA
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

      {/* 🤖 THE RESTORED AURA BUTTON - ALWAYS VISIBLE */}
      <button 
        onClick={() => {
            setShowBubble(false); // Hide the bubble if they click the button directly
            openAuraChat(); // ✅ Opens AURA
        }}
        className="pointer-events-auto relative flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-full shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-110 transition-all duration-300"
      >
        <span className="absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-30 animate-ping"></span>
        <Bot className="text-white w-7 h-7" />
      </button>

    </div>
  );
};

export default AuraGreeting;
