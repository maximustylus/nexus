import React, { useState, useEffect } from 'react';
import { Bot, Sparkles, X } from 'lucide-react';

const AuraGreeting = ({ openAuraChat, dailyPatientLoad = 120 }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [phase, setPhase] = useState('quote'); // 'quote' | 'greeting'
  const [currentQuote, setCurrentQuote] = useState('');

  // 🧠 The Context-Aware Motivation Engine
  const getDailySmartQuote = () => {
    const now = new Date();
    const currentHour = now.getHours();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // 1. The Monday Kickoff (Setting the pace)
    if (dayOfWeek === 1 && currentHour < 12) {
      return "To understand the present and anticipate the future, one must know enough of the past. Let's set the pace for the week. — Lee Kuan Yew";
    }

    // 2. The "Heavy Day" Morning Check (e.g., > 100 patients booked)
    if (currentHour < 12 && dailyPatientLoad > 100) {
      return "We have a heavy list today. Synergy is better than my way or your way. It's our way. — Stephen Covey";
    }

    // 3. The Mid-Day Slump (12pm - 2pm)
    if (currentHour >= 12 && currentHour <= 14) {
      return "Endurance is not just the ability to bear a hard thing, but to turn it into glory. — William Barclay";
    }

    // 4. The Friday Wind-Down (Protecting the weekend)
    if (dayOfWeek === 5 && currentHour >= 14) {
      return "Protect the pulse. Leave the clinic in the clinic. Have a great weekend. — AURA";
    }

    // 5. Default High-Performance Baseline (Sports Psych & Teamwork)
    const defaults = [
      "Talent wins games, but teamwork and intelligence win championships. — Michael Jordan",
      "The strength of the team is each individual member. Let's cover each other today. — Phil Jackson",
      "Trust is the highest form of human motivation. — Stephen Covey",
      "A nation is great not by its size alone. It is the will, the cohesion, the stamina of its people. — Lee Kuan Yew"
    ];
    return defaults[Math.floor(Math.random() * defaults.length)];
  };

  useEffect(() => {
    // 1. The "Once-a-Day" Check
    const today = new Date().toDateString();
    const lastSeen = localStorage.getItem('aura_greeting_date');

    // ⚠️ DEVELOPER NOTE: Comment out the next 3 lines while testing 
    // so the animation plays every time you refresh your screen!
    if (lastSeen === today) {
      // return; 
    }

    // 2. Initialize the Smart Greeting
    setCurrentQuote(getDailySmartQuote());
    setIsVisible(true);
    localStorage.setItem('aura_greeting_date', today);

    // 3. The Morph Timer (Quote -> Greeting after 4.5 seconds)
    const timer = setTimeout(() => {
      setPhase('greeting');
    }, 10000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyPatientLoad]);

  // If dismissed or already seen today, render nothing.
  if (!isVisible) return null;

  return (
    // Positioned safely above your mobile navigation bar (adjusted to bottom-20)
    <div className="fixed bottom-20 right-4 z-[90] flex flex-col items-end space-y-3 animate-in fade-in slide-in-from-bottom-8 duration-700 pointer-events-none">
      
      {/* 💬 The Frosted Glass Speech Bubble */}
      <div 
        onClick={() => {
            setIsVisible(false);
            openAuraChat(); // Triggers the main panel to open
        }}
        className="pointer-events-auto group relative cursor-pointer max-w-[280px] bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-indigo-100 dark:border-slate-800 shadow-xl rounded-2xl rounded-br-none p-4 transition-all duration-500 hover:scale-105 hover:shadow-indigo-500/20"
      >
        {/* Subtle Close Button (Appears on Hover) */}
        <button 
          onClick={(e) => {
            e.stopPropagation(); // Prevents opening the chat when dismissing
            setIsVisible(false);
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
    </div>
  );
};

export default AuraGreeting;
