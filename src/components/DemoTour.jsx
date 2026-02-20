import React, { useState, useEffect } from 'react';
import { useNexus } from '../context/NexusContext';
import { Sparkles, ChevronRight, ChevronLeft, X, Lightbulb } from 'lucide-react';

const TOUR_STEPS = [
    {
        title: "Welcome to the Demo",
        content: "You are currently viewing simulated data. The dashboard is populated by the Marvel CEP Team! Your real KKH data is completely firewalled and safe."
    },
    {
        title: "Test the AI Audit",
        content: "Click the 'Deep Audit' or 'Generate Analysis' button. Watch AURA instantly analyze the Marvel team's workload and highlight burnout risks based on their Job Grades."
    },
    {
        title: "Interactive Pulse",
        content: "Navigate to the 'Pulse' tab. Click on any staff member's card to adjust their Energy and Focus sliders. Watch the department capacity adapt in real-time."
    },
    {
        title: "Provide Feedback",
        content: "Find a bug or have an idea? Use the purple floating button on the right to send feedback straight to the developer dashboard!"
    }
];

const DemoTour = () => {
    const { isDemo } = useNexus();
    const [currentStep, setCurrentStep] = useState(0);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isDemo) {
            setIsVisible(true);
            setCurrentStep(0);
        } else {
            setIsVisible(false);
        }
    }, [isDemo]);

    if (!isDemo || !isVisible) return null;

    const nextStep = () => {
        if (currentStep < TOUR_STEPS.length - 1) {
            setCurrentStep(currentStep + 1);
        } else {
            setIsVisible(false);
        }
    };

    const prevStep = () => {
        if (currentStep > 0) setCurrentStep(currentStep - 1);
    };

    return (
        <div className="fixed bottom-6 left-6 z-[90] w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.3)] overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
            
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-4 flex justify-between items-center text-white">
                <div className="flex items-center gap-2">
                    <Sparkles size={18} />
                    <h3 className="text-sm font-black uppercase tracking-wider">Demo Guide</h3>
                </div>
                <button onClick={() => setIsVisible(false)} className="hover:bg-white/20 p-1 rounded-full transition-colors">
                    <X size={18} />
                </button>
            </div>

            {/* Content */}
            <div className="p-5">
                <div className="flex items-start gap-3 mb-2">
                    <div className="bg-slate-800 p-2 rounded-lg text-emerald-400 mt-1 shrink-0">
                        <Lightbulb size={16} />
                    </div>
                    <div>
                        <h4 className="font-bold text-slate-100 text-sm mb-1">{TOUR_STEPS[currentStep].title}</h4>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            {TOUR_STEPS[currentStep].content}
                        </p>
                    </div>
                </div>
            </div>

            {/* Footer / Controls */}
            <div className="px-5 pb-5 pt-2 flex justify-between items-center">
                <div className="flex gap-1">
                    {TOUR_STEPS.map((_, idx) => (
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
                        {currentStep === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'} <ChevronRight size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DemoTour;
