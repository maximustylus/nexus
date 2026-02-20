import React, { useState, useEffect } from 'react';
import { useNexus } from '../context/NexusContext';
import { Sparkles, ChevronRight, ChevronLeft, X, Lightbulb } from 'lucide-react';

const GUIDE_STEPS = [
    {
        title: "Welcome to NEXUS",
        content: "Your unified intelligence dashboard. In Demo Mode, you are viewing the simulated Marvel Team. In Live Mode, this is your secure workspace."
    },
    {
        title: "Home: Deep Audit",
        content: "Click 'Generate Analysis' to watch AURA instantly analyze the team's workload, flag scope creep, and highlight burnout risks based on specific Job Grades."
    },
    {
        title: "Archive: Time Travel",
        content: "Access past performance reviews and workload metrics. The AI instantly contextualizes historical data so you never lose track of team progress."
    },
    {
        title: "Roster: Auto-Healer",
        content: "AURA's Zero-Conflict rostering architecture. It predicts case volumes and automatically routes the right skill-mix to the right wards."
    },
    {
        title: "Pulse: Social Battery",
        content: "Interactive energy and focus tracking. Staff can update their daily capacity, and the dashboard instantly recalculates the department's operational health."
    },
    {
        title: "Admin Panel",
        content: "Secure data management. Accessible only to Admins (or in Demo Mode), this is where you import bulk JSON data and manage team permissions."
    },
    {
        title: "Provide Feedback",
        content: "Found a bug or have an idea? Tap the purple floating button on the right to send feedback straight to the developer dashboard!"
    }
];

const AppGuide = ({ isOpen, onClose }) => {
    const { isDemo } = useNexus();
    const [currentStep, setCurrentStep] = useState(0);

    // Reset to step 1 whenever it opens
    useEffect(() => {
        if (isOpen) setCurrentStep(0);
    }, [isOpen]);

    if (!isOpen) return null;

    const nextStep = () => {
        if (currentStep < GUIDE_STEPS.length - 1) {
            setCurrentStep(currentStep + 1);
        } else {
            onClose(); // Close at the end
        }
    };

    const prevStep = () => {
        if (currentStep > 0) setCurrentStep(currentStep - 1);
    };

    return (
        <div className="fixed top-[15%] md:top-auto md:bottom-6 left-4 md:left-6 z-[90] w-[calc(100%-2rem)] md:w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in zoom-in-95 md:slide-in-from-bottom-8 duration-500">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-4 flex justify-between items-center text-white">
                <div className="flex items-center gap-2">
                    <Sparkles size={18} />
                    <h3 className="text-sm font-black uppercase tracking-wider">{isDemo ? 'Demo Guide' : 'NEXUS Guide'}</h3>
                </div>
                <button onClick={onClose} className="hover:bg-white/20 p-1 rounded-full transition-colors">
                    <X size={18} />
                </button>
            </div>

            <div className="p-5">
                <div className="flex items-start gap-3 mb-2">
                    <div className="bg-slate-800 p-2 rounded-lg text-emerald-400 mt-1 shrink-0">
                        <Lightbulb size={16} />
                    </div>
                    <div>
                        <h4 className="font-bold text-slate-100 text-sm mb-1">{GUIDE_STEPS[currentStep].title}</h4>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            {GUIDE_STEPS[currentStep].content}
                        </p>
                    </div>
                </div>
            </div>

            <div className="px-5 pb-5 pt-2 flex justify-between items-center">
                <div className="flex gap-1">
                    {GUIDE_STEPS.map((_, idx) => (
                        <div key={idx} className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentStep ? 'w-4 bg-emerald-500' : 'w-1.5 bg-slate-700'}`} />
                    ))}
                </div>
                
                <div className="flex gap-2">
                    <button 
                        onClick={prevStep}
                        disabled={currentStep === 0}
                        className="p-2 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <button 
                        onClick={nextStep}
                        className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors border border-emerald-500/20"
                    >
                        {currentStep === GUIDE_STEPS.length - 1 ? 'Finish' : 'Next'} <ChevronRight size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AppGuide;
