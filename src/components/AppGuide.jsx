import React, { useState, useEffect } from 'react';
import { useNexus } from '../context/NexusContext';
import { Sparkles, ChevronRight, ChevronLeft, X, Lightbulb } from 'lucide-react';

const GUIDE_STEPS = [
    {
        title: "Welcome to NEXUS",
        content: "Your unified intelligence dashboard. NEXUS is designed to bridge the gap between clinical operations, team communication, and staff wellbeing."
    },
    {
        title: "AURA: The Intelligence Matrix",
        content: "AURA is a suite of specialized personas. Switch between 'Well Well' for coaching, 'Aim Assist' for admin paperwork, and 'Data Dude' for precise operational logging. As a specialized research arm, ask Project HUGE to generate 'Backward Schedules' for grants or refine your scientific merit sections based on successful templates."
    },
    {
        title: "Dashboard: Command Center",
        content: "The heart of NEXUS. Beyond live charts, use 'Generate Analysis' to let AURA audit team workload and identify burnout risks before they impact care. Context is everything: use the Year Dropdown in the Dashboard to instantly transform your view into a read-only archive of past performance and trends."
    },
    {
        title: "Feeds: Digital Watercooler - Coming Soon",
        content: "The new social hub. Share clinical wins, departmental updates, and CoP insights in a secure environment designed for healthcare professionals."
    },
    {
        title: "Pulse: Operational Health",
        content: "Track the department's 'Social Battery.' Log your energy levels—anonymously via Ghost Protocol—to help the team balance clinical loads effectively."
    },
    {
        title: "Roster: Auto-Healer",
        content: "AURA's Zero-Conflict rostering architecture. It predicts case volumes and automatically routes the right skill-mix to the right wards."
    },
    {
        title: "Admin Panel",
        content: "Secure data management. Accessible only to Admins (or in Demo Mode), this is where you import bulk JSON data and manage team permissions."
    },
    {
        title: "Ghost Feedback & Support",
        content: "NEXUS is built for you. Use the invisible feedback system within AURA to report bugs or suggest new features directly to the developer."
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
        <>
            {/* 🛡️ UX FIX: The Frosted Glass Blur Background on z-[100] */}
            <div 
                className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm transition-all animate-in fade-in duration-300"
                onClick={onClose} 
            />
            
            {/* 🛡️ UX FIX: Dead-center on all devices + z-[110] */}
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[110] w-[calc(100%-2rem)] md:w-[400px] bg-slate-900 border border-slate-700 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in zoom-in-95 duration-500">
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
        </>
    );
};

export default AppGuide;
