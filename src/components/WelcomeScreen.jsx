import React, { useState, useEffect } from 'react';
import { auth } from '../firebase'; 
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    updateProfile, 
    signOut 
} from 'firebase/auth';
import { 
    Sun, Moon, ArrowRight, Activity, ShieldCheck, Calendar, 
    Building2, Globe, ChevronLeft, AlertCircle, ShieldAlert, 
    BrainCircuit, Shield, User, Lock, Mail, Sparkles, Zap
} from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import { checkAccess } from '../utils'; // <--- THE SECURITY BOUNCER

const WelcomeScreen = (props) => {
    const onAuthSuccess = props.onStart || props.onLogin || props.onEnter;
    
    // --- HOOKS & CONTEXT ---
    const { toggleDemo } = useNexus(); 

    // VIEW STATES: 'SPLASH' | 'AUTH' | 'ORG_REGISTER'
    const [view, setView] = useState('SPLASH'); 
    const [isDark, setIsDark] = useState(false);
    const [animate, setAnimate] = useState(false);

    // AUTH STATES
    const [isLoginMode, setIsLoginMode] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // --- 1. THEME & INITIALIZATION ---
    useEffect(() => {
        const storedTheme = localStorage.getItem('nexus-theme');
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        if (storedTheme === 'dark' || (!storedTheme && systemPrefersDark)) {
            setIsDark(true);
            document.documentElement.classList.add('dark');
        } else {
            setIsDark(false);
            document.documentElement.classList.remove('dark');
        }
        
        // Trigger entrance animations
        setTimeout(() => setAnimate(true), 100);
    }, []);

    const toggleTheme = () => {
        const newTheme = !isDark;
        setIsDark(newTheme);
        if (newTheme) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('nexus-theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('nexus-theme', 'light');
        }
    };

    // --- 2. HANDLERS: SANDBOX & AUTH ---
    const handleSandboxEnter = () => {
        setLoading(true);
        // Simulate a "booting" sequence for the elite feel
        setTimeout(() => {
            toggleDemo(); 
        }, 1200);
    };

    const handleAuth = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        
        try {
            // 🛑 STEP 1: THE BOUNCER (Security Check)
            const authorizedUser = checkAccess(email);

            if (!authorizedUser) {
                throw new Error("ACCESS DENIED: Your email is not on the authorized team list. Contact Alif.");
            }

            if (isLoginMode) {
                // 🔑 STEP 2: FIREBASE AUTHENTICATION
                await signInWithEmailAndPassword(auth, email, password);
                
                // ✅ STEP 3: SUCCESS
                if (onAuthSuccess) onAuthSuccess(authorizedUser);
            } else {
                // REGISTRATION FLOW
                if (!name) throw new Error("Please enter your full name.");
                if (password.length < 6) throw new Error("Security Requirement: Password must be 6+ characters.");
                
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await updateProfile(userCredential.user, { displayName: name });
                
                if (onAuthSuccess) onAuthSuccess(authorizedUser);
            }
        } catch (err) {
            console.error("Auth Exception:", err);
            if (auth.currentUser) await signOut(auth);
            
            const cleanError = err.message.replace('Firebase:', '').replace('Error (auth/', '').replace(').', '').trim();
            setError(cleanError.toUpperCase());
        } finally {
            setLoading(false);
        }
    };

    // --- 3. THE TRINITY PILLARS DATA ---
    const pillars = [
        {
            title: 'AURA Intelligence',
            subtitle: 'PILLAR A • THE HEART',
            layer: 'EMOTIONAL LAYER',
            icon: <BrainCircuit className="text-pink-500" size={20} />,
            color: 'group-hover:border-pink-500/50',
            bg: 'bg-pink-500/10',
            desc: 'Real-time Social Battery indexing using OARS and 5A motivational interviewing protocols to prevent clinical burnout.',
        },
        {
            title: 'Smart Workload',
            subtitle: 'PILLAR B • THE BRAIN',
            layer: 'PREDICTIVE LAYER',
            icon: <Activity className="text-indigo-500" size={20} />,
            color: 'group-hover:border-indigo-500/50',
            bg: 'bg-indigo-500/10',
            desc: 'ML-driven case volume forecasting and skill-mix routing to ensure strategic cognitive load balancing across the unit.',
        },
        {
            title: 'Auto Rostering',
            subtitle: 'PILLAR C • THE SKELETON',
            layer: 'STRUCTURAL LAYER',
            icon: <Shield className="text-purple-500" size={20} />,
            color: 'group-hover:border-purple-500/50',
            bg: 'bg-purple-500/10',
            desc: 'Zero-conflict architecture featuring Instant Re-Healer™ logic for compliant, fair, and structural shift scheduling.',
        }
    ];

    const isSplitView = view === 'AUTH' || view === 'ORG_REGISTER';

    return (
        <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 transition-colors duration-700 flex flex-col items-center justify-between relative overflow-x-hidden overflow-y-auto pt-6 pb-10 px-4 md:px-6">
            
            {/* RESTORED: HIGH-INTENSITY "BEFORE" GRADIENTS */}
            <div className={`fixed top-0 left-0 w-[900px] h-[900px] bg-indigo-600/20 rounded-full blur-[150px] transition-all duration-1000 pointer-events-none ${animate ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'}`}></div>
            <div className={`fixed bottom-0 right-0 w-[800px] h-[800px] bg-emerald-600/15 rounded-full blur-[120px] transition-all duration-1000 pointer-events-none ${animate ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}></div>

            {/* THEME TOGGLE BUTTON */}
            <div className="w-full max-w-7xl flex justify-end z-50 pt-4">
                <button 
                    onClick={toggleTheme} 
                    className="p-3 md:p-4 rounded-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-md shadow-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:scale-110 active:scale-95 transition-all"
                >
                    {isDark ? <Sun size={20} className="text-amber-400" /> : <Moon size={20} className="text-indigo-600" />}
                </button>
            </div>

            {/* MAIN INTERFACE CONTAINER */}
            <div className={`relative z-10 w-full max-w-7xl mx-auto shadow-2xl transition-all duration-1000 transform my-auto ${animate ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-20 opacity-0 scale-95'}`}>
                
                <div className="flex flex-col md:flex-row min-h-[750px] bg-transparent">
                    
                    {/* LEFT SECTION: BRANDING & SYSTEM OVERVIEW */}
                    <div className={`
                        relative z-20 flex flex-col justify-center items-center text-center p-8 md:p-16
                        bg-white/90 dark:bg-slate-900/90 backdrop-blur-3xl border border-white/40 dark:border-slate-700/50
                        transition-all duration-700 ease-in-out
                        ${isSplitView 
                            ? 'w-full md:w-1/2 rounded-t-[3rem] md:rounded-l-[3rem] md:rounded-tr-none' 
                            : 'w-full rounded-[3rem]'
                        }
                    `}>
                        {/* Dynamic Logo */}
                        <div className="relative mb-8 group">
                            <div className="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full scale-150 group-hover:scale-110 transition-transform"></div>
                            <img src="/nexus.png" alt="NEXUS" className="relative w-24 h-24 object-contain drop-shadow-2xl transition-transform duration-500 group-hover:rotate-3" />
                        </div>
                        
                        <h1 className="text-5xl md:text-8xl font-black text-slate-900 dark:text-white tracking-tighter mb-4 leading-none">
                            NEXUS
                        </h1>
                        
                        <p className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.5em] mb-8">
                           Smart Dashboard v1.4
                        </p>

                        {/* Storytelling & Pillars Grid */}
                        <div className={`max-w-4xl transition-all duration-500 ${isSplitView ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100 h-auto'}`}>
                            <p className="text-xl text-slate-600 dark:text-slate-300 font-medium mb-12 leading-relaxed max-w-2xl mx-auto">
                                Mastering the grind without the burnout. <br/>
                                <span className="text-sm opacity-60 font-normal">Harmonising workload, roster, and wellbeing through a unified intelligence layer.</span>
                            </p>

                            {/* PILLAR CARDS GRID */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 text-left">
                                {pillars.map((p, i) => (
                                    <div key={i} className={`group p-6 rounded-[2.5rem] bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${p.color}`}>
                                        <div className={`${p.bg} p-2.5 rounded-xl w-fit mb-5 transition-transform group-hover:scale-110`}>{p.icon}</div>
                                        <h3 className="font-black text-[11px] text-slate-900 dark:text-white mb-2 uppercase tracking-widest">{p.title}</h3>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed mb-4">{p.desc}</p>
                                        <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                                            <span className="text-[8px] font-black text-indigo-500 dark:text-indigo-400 tracking-tighter uppercase">{p.layer}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* ALIGNED PRIMARY ACTIONS */}
                            <div className="flex flex-col items-center gap-6 w-full max-w-sm mx-auto">
                                <button 
                                    onClick={() => setView('AUTH')}
                                    className="group relative px-16 py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-sm rounded-2xl shadow-2xl hover:scale-105 transition-all duration-300 w-full overflow-hidden"
                                >
                                    <span className="relative z-10 flex items-center justify-center gap-3 tracking-[0.2em]">
                                        INITIALISE APPLICATION <ArrowRight size={18} className="group-hover:translate-x-2 transition-transform" />
                                    </span>
                                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-violet-600 opacity-0 group-hover:opacity-10 transition-opacity"></div>
                                </button>
                                
                                <div className="flex flex-col sm:flex-row gap-4 w-full">
                                    <button 
                                        onClick={handleSandboxEnter} 
                                        className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-emerald-100/50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-black text-[10px] rounded-xl border border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all uppercase tracking-widest"
                                    >
                                        <ShieldAlert size={14} className={loading ? 'animate-spin' : 'animate-pulse'} /> 
                                        {loading ? 'Decrypting...' : 'Enter Sandbox'}
                                    </button>
                                    <button 
                                        onClick={() => setView('ORG_REGISTER')} 
                                        className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-indigo-100/50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 font-black text-[10px] rounded-xl border border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-all uppercase tracking-widest"
                                    >
                                        <Globe size={14} />
                                        Scale for Unit
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT SECTION: AUTHENTICATION & ENTERPRISE HUB */}
                    <div className={`
                        relative z-10 flex flex-col justify-center
                        bg-white/70 dark:bg-slate-950/70 backdrop-blur-3xl border-y border-r border-white/40 dark:border-slate-700/50
                        transition-all duration-700 ease-in-out overflow-hidden
                        ${isSplitView 
                            ? 'w-full md:w-1/2 opacity-100 rounded-b-[3rem] md:rounded-r-[3rem] md:rounded-bl-none p-8 md:p-16' 
                            : 'w-0 opacity-0 p-0 border-none'
                        }
                    `}>
                        
                        {/* VIEW A: AUTHENTICATION FORM */}
                        {view === 'AUTH' && (
                            <div className="w-full max-w-md mx-auto animate-in slide-in-from-right duration-700 fade-in">
                                <button onClick={() => setView('SPLASH')} className="mb-10 text-slate-400 hover:text-indigo-500 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors">
                                    <ChevronLeft size={16}/> Return to Overview
                                </button>
                                
                                <div className="mb-12 text-center md:text-left">
                                    <h2 className="text-4xl font-black text-slate-900 dark:text-white uppercase mb-3 tracking-tighter">
                                        {isLoginMode ? 'Verify Identity' : 'Initialise Profile'}
                                    </h2>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.2em]">
                                        {isLoginMode ? 'Accessing Secure Clinical Hub' : 'Registering for Nexus Workspace'}
                                    </p>
                                </div>

                                {error && (
                                    <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 text-red-600 dark:text-red-400 text-[11px] font-bold rounded-2xl flex gap-3 items-start animate-shake">
                                        <AlertCircle size={18} className="shrink-0 mt-0.5"/> 
                                        <span>{error}</span>
                                    </div>
                                )}

                                <form onSubmit={handleAuth} className="space-y-6">
                                    {!isLoginMode && (
                                        <div className="relative group">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                                                <User size={20} />
                                            </div>
                                            <input 
                                                type="text" 
                                                placeholder="Full Display Name" 
                                                className="w-full bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl py-4.5 pl-14 pr-6 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
                                                value={name} 
                                                onChange={e => setName(e.target.value)} 
                                            />
                                        </div>
                                    )}
                                    <div className="relative group">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                                            <Mail size={20} />
                                        </div>
                                        <input 
                                            type="email" 
                                            placeholder="Official kkh.com.sg email" 
                                            className="w-full bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl py-4.5 pl-14 pr-6 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
                                            value={email} 
                                            onChange={e => setEmail(e.target.value)} 
                                        />
                                    </div>
                                    <div className="relative group">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                                            <Lock size={20} />
                                        </div>
                                        <input 
                                            type="password" 
                                            placeholder="Secure Password" 
                                            className="w-full bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl py-4.5 pl-14 pr-6 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
                                            value={password} 
                                            onChange={e => setPassword(e.target.value)} 
                                        />
                                    </div>

                                    <button 
                                        type="submit" 
                                        disabled={loading} 
                                        className="w-full py-5 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20 flex justify-center items-center gap-3 active:scale-95 disabled:opacity-50"
                                    >
                                        <Zap size={18} className={loading ? 'animate-spin' : ''} />
                                        {loading ? 'AUTHENTICATING...' : (isLoginMode ? 'INITIALISE ACCESS' : 'CREATE WORKSPACE')}
                                        {!loading && <ArrowRight size={18} />}
                                    </button>
                                </form>

                                <div className="mt-10 text-center pt-8 border-t border-slate-200 dark:border-slate-700">
                                    <button 
                                        onClick={() => { setIsLoginMode(!isLoginMode); setError(''); }} 
                                        className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest hover:underline transition-all"
                                    >
                                        {isLoginMode ? "New to NEXUS? Request Access" : "Have an authorized account? Sign in"}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* VIEW B: ENTERPRISE HUB / ORG REGISTRATION */}
                        {view === 'ORG_REGISTER' && (
                            <div className="w-full max-w-md mx-auto animate-in slide-in-from-right duration-700 text-center">
                                <button onClick={() => setView('SPLASH')} className="mb-12 text-slate-400 hover:text-indigo-500 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors">
                                    <ChevronLeft size={16}/> Return to Overview
                                </button>
                                
                                <div className="relative w-20 h-20 bg-emerald-500/10 rounded-[2rem] flex items-center justify-center mx-auto mb-8 border border-emerald-500/20">
                                    <Globe className="text-emerald-500 animate-spin-slow" size={40}/>
                                    <Sparkles className="absolute -top-2 -right-2 text-amber-400" size={20} />
                                </div>

                                <h2 className="text-4xl font-black text-slate-900 dark:text-white uppercase mb-4 tracking-tighter">Enterprise Scaling</h2>
                                <p className="text-slate-500 text-sm font-medium mb-12 leading-relaxed px-4">
                                    NEXUS Multi-Tenant architecture is in final auditing. Soon, you can deploy isolated clinical instances for specific services or departments.
                                </p>

                                <div className="grid grid-cols-1 gap-4 mb-10 text-left">
                                    <div className="p-5 bg-slate-100 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 flex gap-5 group hover:border-indigo-500/30 transition-colors">
                                        <Building2 className="text-indigo-500 group-hover:scale-110 transition-transform" size={24} />
                                        <div>
                                            <h4 className="text-[11px] font-black text-slate-900 dark:text-white uppercase mb-1">Unit Branding</h4>
                                            <p className="text-[10px] text-slate-500">Service-specific AURA logic and department logos.</p>
                                        </div>
                                    </div>
                                    <div className="p-5 bg-slate-100 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 flex gap-5 group hover:border-purple-500/30 transition-colors">
                                        <ShieldCheck className="text-purple-500 group-hover:scale-110 transition-transform" size={24} />
                                        <div>
                                            <h4 className="text-[11px] font-black text-slate-900 dark:text-white uppercase mb-1">Data Sharding</h4>
                                            <p className="text-[10px] text-slate-500">Dedicated Firestore clusters for compliance.</p>
                                        </div>
                                    </div>
                                </div>

                                <button disabled className="w-full py-5 bg-slate-200 dark:bg-slate-800 text-slate-400 font-black rounded-2xl cursor-not-allowed uppercase text-[11px] tracking-[0.3em]">
                                    Registration Restricted
                                </button>
                                <p className="mt-4 text-[9px] text-slate-400 font-bold uppercase">Contact the lead developer for priority whitelisting.</p>
                            </div>
                        )}

                    </div>
                </div>
            </div>
            
            {/* STICKY FOOTER: RESTORED & VISIBILITY FIXED */}
            <div className="w-full flex flex-col items-center justify-center pt-10 pb-4 opacity-70 z-10 shrink-0">
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-600 tracking-[0.7em] uppercase text-center leading-loose pointer-events-none">
                    Master the Grind • Protect the Pulse • Build the Future • © 2026 Muhammad Alif
                </p>
            </div>

            {/* SHARED STYLES */}
            <style>{`
                @keyframes spin-slow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .animate-spin-slow {
                    animation: spin-slow 8s linear infinite;
                }
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                .animate-shake {
                    animation: shake 0.3s ease-in-out;
                }
            `}</style>
        </div>
    );
};

export default WelcomeScreen;
