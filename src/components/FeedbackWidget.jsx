import React, { useState, useEffect } from 'react'; // 🛡️ FIX: Added useEffect here
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { MessageSquare, X, Send, Bug, Lightbulb } from 'lucide-react';
import { useNexus } from '../context/NexusContext';

const FeedbackWidget = ({ user }) => {
    const { isDemo } = useNexus();
    const [isOpen, setIsOpen] = useState(false);
    const [type, setType] = useState('bug'); // 'bug' or 'idea'
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!message.trim()) return;
        
        setIsSubmitting(true);
        try {
            // Push directly to a new Firebase collection
            await addDoc(collection(db, 'beta_feedback'), {
                type,
                message,
                reportedBy: user?.name || user?.email || 'Anonymous Tester',
                environment: isDemo ? 'Sandbox' : 'Live',
                timestamp: serverTimestamp(),
                userAgent: navigator.userAgent // Helpful for catching mobile-specific bugs
            });
            
            setSuccess(true);
            setTimeout(() => {
                setIsOpen(false);
                setSuccess(false);
                setMessage('');
                setType('bug');
            }, 2000);
        } catch (error) {
            console.error("Feedback failed to send:", error);
            alert("Could not send feedback. Check console.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // 1. Add state to track AURA
    const [isAuraOpen, setIsAuraOpen] = useState(false);

    // 2. Listen for the broadcast
    useEffect(() => {
        const handleAuraToggle = (e) => setIsAuraOpen(e.detail);
        window.addEventListener('aura-toggled', handleAuraToggle);
        return () => window.removeEventListener('aura-toggled', handleAuraToggle);
    }, []);

    return (
        <>
            {/* 🛡️ FIX: Dynamic classes added to hide the widget when AURA opens */}
            <button 
                onClick={() => setIsOpen(true)}
                className={`fixed bottom-[180px] md:bottom-24 xl:bottom-6 right-4 md:right-24 xl:right-28 w-16 h-16 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-[0_0_20px_rgba(79,70,229,0.4)] transition-all duration-300 ease-in-out hover:scale-110 z-[85] flex items-center justify-center p-0 m-0 ${
                    isAuraOpen ? 'opacity-0 scale-75 pointer-events-none' : 'opacity-100 scale-100'
                }`}
            >
                <MessageSquare size={26} />
            </button>

            {/* FEEDBACK MODAL */}
            {isOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-300">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800">
                            <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-2">
                                <MessageSquare size={20} className="text-indigo-500"/> 
                                Beta Feedback
                            </h3>
                            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        {success ? (
                            <div className="p-12 text-center">
                                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Send size={32} />
                                </div>
                                <h4 className="text-xl font-black text-slate-800 dark:text-white mb-2">Transmitted!</h4>
                                <p className="text-sm font-medium text-slate-500">Thanks for helping us improve NEXUS.</p>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="p-6">
                                <div className="flex gap-2 mb-6">
                                    <button type="button" onClick={() => setType('bug')} className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase transition-colors ${type === 'bug' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 border-2 border-red-500' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-2 border-transparent'}`}>
                                        <Bug size={16} /> Bug
                                    </button>
                                    <button type="button" onClick={() => setType('idea')} className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase transition-colors ${type === 'idea' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border-2 border-amber-500' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-2 border-transparent'}`}>
                                        <Lightbulb size={16} /> Idea
                                    </button>
                                </div>

                                <textarea 
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder={type === 'bug' ? "What's broken? How do we recreate it?" : "What feature would make this app better?"}
                                    className="w-full h-32 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none mb-6"
                                    required
                                />

                                <button 
                                    type="submit" 
                                    disabled={isSubmitting}
                                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-black rounded-xl uppercase transition-colors shadow-lg flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? 'Transmitting...' : 'Send Feedback'}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default FeedbackWidget;