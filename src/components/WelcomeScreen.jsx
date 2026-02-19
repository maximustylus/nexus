import React, { useState, useEffect } from 'react';
import { auth } from '../firebase'; 
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    updateProfile, 
    signOut 
} from 'firebase/auth';
import { 
    Sun, Moon, ArrowRight, Activity, ShieldCheck, 
    Building2, Globe, ChevronLeft, AlertCircle, ShieldAlert, 
    BrainCircuit, Shield, User, Lock, Mail, Sparkles, Zap
} from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import { checkAccess } from '../utils'; 

const WelcomeScreen = (props) => {
    const onAuthSuccess = props.onStart || props.onLogin || props.onEnter;
    
    // --- HOOKS & CONTEXT ---
    const { toggleDemo } = useNexus(); 

    // VIEW STATES
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

    // --- 2. HANDLERS ---
    const handleSandboxEnter = () => {
        setLoading(true);
        setTimeout(() => { toggleDemo(); }, 1200);
    };

    const handleAuth = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        
        try {
            const authorizedUser = checkAccess(email);
            if (!authorizedUser) {
                throw new Error("ACCESS DENIED: Your email is not on the authorized team list.");
            }

            if (isLoginMode) {
                await signInWithEmailAndPassword(auth, email, password);
                if (onAuthSuccess) onAuthSuccess(authorizedUser);
            } else {
                if (!name) throw new Error("Please enter your full name.");
                if (password.length < 6) throw new Error("Password must be 6+ characters.");
                
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

    // --- 3. PILLARS DATA ---
    const pillars = [
        {
            title: 'AURA Intelligence',
            subtitle: 'PILLAR A • THE HEART',
            layer: 'EMOTIONAL LAYER',
            icon: <BrainCircuit className="text-pink-500" size={20} />,
            color: 'group-hover:border-pink-500/50',
            bg: 'bg-pink-500/10',
            desc: 'Real-time Social Battery indexing using Motivational Interviewing Techniques to prevent burnout.',
        },
        {
            title: 'Smart Workload',
            subtitle: 'PILLAR B • THE BRAIN',
            layer: 'PREDICTIVE LAYER',
            icon: <Activity className="text-indigo-500" size={20} />,
            color: 'group-hover:border-indigo-500/50',
            bg: 'bg-indigo-500/10',
            desc: 'Machine Learning driven case volume forecasting and skill-mix routing for cognitive load balancing.',
        },
        {
            title: 'Auto Rostering',
            subtitle: 'PILLAR C • THE SKELETON',
            layer: 'STRUCTURAL LAYER',
            icon: <Shield className="text-purple-500" size={20} />,
            color: 'group-hover:border-purple-500/50',
            bg: 'bg-purple-500/10',
            desc: 'Zero-conflict architecture with Instant Re-Healer™ logic for structural compliance.',
        }
    ];

    const isSplitView = view === 'AUTH' || view === 'ORG_REGISTER';

    return (
        <div className="min-h-screen w-full bg-slate-100 dark:bg-slate-950 transition-colors duration-700 flex flex-col items-center justify-center relative overflow-hidden p-4 md:p-6 font-sans">
            
            {/* --- VISUAL LAYER: TECH GRID --- */}
            <div className="absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" 
                 style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '40px 40px' }}>
            </div>

            {/* --- VISUAL LAYER: BREATHING ORBS --- */}
            <div className={`fixed top-0 left-0 w-[800px] h-[800px] bg-indigo-500/20 rounded-full blur-[120px] pointer-events-none animate-float-slow ${animate ? 'opacity-100' : 'opacity-0'}`}></div>
            <div className={`fixed bottom-0 right-0 w-[600px] h-[600px] bg-emerald-500/15 rounded-full blur-[100px] pointer-events-none animate-float-delayed ${animate ? 'opacity-100' : 'opacity-0'}`}></div>

            {/* MAIN CARD CONTAINER */}
            <div className={`relative z-10 w-full max-w-7xl mx-auto bg-white/80 dark:bg-slate-900/80 backdrop-blur-3xl border border-white/50 dark:border-slate-700/50 rounded-[3rem] shadow-2xl transition-all duration-1000 transform overflow-hidden ${animate ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-20 opacity-0 scale-95'}`}>
                
                {/* --- TOGGLE SWITCH (DOCKED INSIDE) --- */}
                <div className="absolute top-6 right-6 md:top-8 md:right-8 z-50">
                    <button 
                        onClick={toggleTheme} 
                        className="p-3 rounded-full bg-slate-100 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:scale-110 active:scale-95 transition-all"
                    >
                        {isDark ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-indigo-600" />}
                    </button>
                </div>

                <div className="flex flex-col md:flex-row min-h-[800px]">
                    
                    {/* LEFT SECTION: BRANDING & FOOTER */}
                    <div className={`
                        relative z-20 flex flex-col justify-between p-8 md:p-16
                        transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]
                        ${isSplitView 
                            ? 'w-full md:w-5/12 bg-transparent' 
                            : 'w-full text-center items-center'
                        }
                    `}>
                        {/* 1. Header Area */}
                        <div className={`flex flex-col ${isSplitView ? 'items-start' : 'items-center'}`}>
                            <div className="relative mb-6 group cursor-default">
                                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500 to-purple-500 blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-500 rounded-full"></div>
                                <img src="/nexus.png" alt="NEXUS" className="relative w-20 h-20 md:w-24 md:h-24 object-contain drop-shadow-xl transition-transform duration-500 group-hover:rotate-6 group-hover:scale-110" />
                            </div>
                            
                            <h1 className="text-5xl md:text-8xl font-black tracking-tighter mb-2 leading-none bg-gradient-to-br from-slate-900 via-slate-700 to-slate-900 dark:from-white dark:via-slate-200 dark:to-slate-500 bg-clip-text text-transparent pr-2">
                                    NEXUS
                                </h1>
                            
                            <div className="flex items-center gap-3 mb-8 opacity-80">
                                <div className="h-[1px] w-8 bg-indigo-500"></div>
                                <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.4em]">
                                    Smart Dashboard v1.4
                                </p>
                                <div className="h-[1px] w-8 bg-indigo-500"></div>
                            </div>
                        </div>

                        {/* 2. Scrollable Content Area */}
                        <div className={`w-full max-w-4xl transition-all duration-700 flex flex-col ${isSplitView ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100 h-auto items-center'}`}>
                            <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 font-medium mb-10 leading-relaxed max-w-2xl text-center">
                                Master the Grind • Protect the Pulse • Build the Future<br/>
                                <span className="text-xs md:text-sm opacity-60 font-normal">Unified intelligence for the modern healthcare teams.</span>
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12 text-left w-full">
                                {pillars.map((p, i) => (
                                    <div key={i} className={`group p-5 rounded-3xl bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 hover:bg-white dark:hover:bg-slate-800 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${p.color}`}>
                                        <div className={`${p.bg} p-2 rounded-lg w-fit mb-3 transition-transform group-hover:scale-110`}>{p.icon}</div>
                                        <h3 className="font-bold text-[10px] text-slate-900 dark:text-white mb-1 uppercase tracking-wider">{p.title}</h3>
                                        <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">{p.desc}</p>
                                        <span className="text-[7px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest px-2 py-1 bg-slate-100 dark:bg-slate-900 rounded-md">{p.layer}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-col items-center gap-4 w-full max-w-sm">
                                <button 
                                    onClick={() => setView('AUTH')}
                                    className="group relative px-12 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-xs rounded-xl shadow-xl shadow-slate-900/10 hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 w-full overflow-hidden"
                                >
                                    <span className="relative z-10 flex items-center justify-center gap-3 tracking-[0.2em]">
                                        INITIALISE SYSTEM <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                                    </span>
                                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 opacity-0 group-hover:opacity-10 transition-opacity duration-500 bg-[length:200%_auto] animate-gradient"></div>
                                </button>
                                
                                <div className="flex gap-3 w-full">
                                    <button 
                                        onClick={handleSandboxEnter} 
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400 font-bold text-[9px] rounded-lg border border-emerald-200/60 dark:border-emerald-800/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-all uppercase tracking-widest backdrop-blur-sm"
                                    >
                                        {loading ? <ShieldAlert size={12} className="animate-spin" /> : <ShieldAlert size={12} />} 
                                        {loading ? 'Decrypting...' : 'Demo Mode'}
                                    </button>
                                    <button 
                                        onClick={() => setView('ORG_REGISTER')} 
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-50/50 dark:bg-indigo-900/10 text-indigo-700 dark:text-indigo-400 font-bold text-[9px] rounded-lg border border-indigo-200/60 dark:border-indigo-800/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-all uppercase tracking-widest backdrop-blur-sm"
                                    >
                                        <Globe size={12} />
                                        Scale Unit
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* 3. Footer (DOCKED INSIDE) */}
                        <div className={`pt-10 opacity-50 transition-all duration-500 ${isSplitView ? 'text-left' : 'text-center'}`}>
                            <p className="text-[9px] font-black text-slate-400 dark:text-slate-600 tracking-[0.5em] uppercase pointer-events-none">
                                © 2026 Muhammad Alif
                            </p>
                        </div>
                    </div>

                    {/* RIGHT SECTION: DYNAMIC CONTENT AREA */}
                    <div className={`
                        relative z-10 flex flex-col justify-center
                        bg-slate-50/50 dark:bg-black/20 border-l border-slate-200/50 dark:border-slate-700/50
                        transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] overflow-hidden
                        ${isSplitView 
                            ? 'w-full md:w-7/12 opacity-100 p-8 md:p-16' 
                            : 'w-0 opacity-0 p-0 border-none'
                        }
                    `}>
                        
                        {/* --- VIEW: AUTH FORM --- */}
                        {view === 'AUTH' && (
                            <div className="w-full max-w-sm mx-auto animate-in slide-in-from-right duration-500 fade-in">
                                <button onClick={() => setView('SPLASH')} className="mb-8 text-slate-400 hover:text-indigo-500 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors group">
                                    <ChevronLeft size={14} className="group-hover:-translate-x-1 transition-transform"/> Back
                                </button>
                                
                                <div className="mb-8">
                                    <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase mb-2 tracking-tighter">
                                        {isLoginMode ? 'Verify Identity' : 'Initialise Profile'}
                                    </h2>
                                    <p className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                        {isLoginMode ? 'Secure Gateway Active' : 'New User Registration Protocol'}
                                    </p>
                                </div>

                                {error && (
                                    <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 text-red-600 dark:text-red-400 text-[10px] font-bold rounded-xl flex gap-3 items-start animate-shake">
                                        <AlertCircle size={16} className="shrink-0 mt-0.5"/> 
                                        <span>{error}</span>
                                    </div>
                                )}

                                <form onSubmit={handleAuth} className="space-y-4">
                                    {!isLoginMode && (
                                        <div className="relative group">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors"><User size={18} /></div>
                                            <input 
                                                type="text" 
                                                placeholder="Full Display Name" 
                                                className="w-full bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl py-4 pl-12 pr-4 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600" 
                                                value={name} 
                                                onChange={e => setName(e.target.value)} 
                                            />
                                        </div>
                                    )}
                                    <div className="relative group">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors"><Mail size={18} /></div>
                                        <input 
                                            type="email" 
                                            placeholder="Official Email" 
                                            className="w-full bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl py-4 pl-12 pr-4 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600" 
                                            value={email} 
                                            onChange={e => setEmail(e.target.value)} 
                                        />
                                    </div>
                                    <div className="relative group">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors"><Lock size={18} /></div>
                                        <input 
                                            type="password" 
                                            placeholder="Secure Key" 
                                            className="w-full bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl py-4 pl-12 pr-4 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600" 
                                            value={password} 
                                            onChange={e => setPassword(e.target.value)} 
                                        />
                                    </div>

                                    <button 
                                        type="submit" 
                                        disabled={loading} 
                                        className="w-full py-4 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 flex justify-center items-center gap-2 active:scale-95 disabled:opacity-50 mt-4"
                                    >
                                        {loading ? <Zap size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                                        {loading ? 'Authenticating...' : (isLoginMode ? 'Access Workspace' : 'Create Account')}
                                    </button>
                                </form>

                                <div className="mt-8 text-center pt-6 border-t border-slate-200 dark:border-slate-800">
                                    <button 
                                        onClick={() => { setIsLoginMode(!isLoginMode); setError(''); }} 
                                        className="text-[10px] font-black text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 uppercase tracking-widest transition-colors"
                                    >
                                        {isLoginMode ? "New to NEXUS? Request Access" : "Have credentials? Sign in"}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* --- VIEW: ORG REGISTER --- */}
                        {view === 'ORG_REGISTER' && (
                            <div className="w-full max-w-sm mx-auto animate-in slide-in-from-right duration-500 fade-in text-center">
                                <button onClick={() => setView('SPLASH')} className="mb-10 text-slate-400 hover:text-indigo-500 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors group">
                                    <ChevronLeft size={14} className="group-hover:-translate-x-1 transition-transform"/> Back
                                </button>
                                
                                <div className="relative w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-emerald-500/20 ring-4 ring-emerald-500/5">
                                    <Globe className="text-emerald-500 animate-spin-slow" size={32}/>
                                    <Sparkles className="absolute -top-2 -right-2 text-amber-400 fill-amber-400" size={16} />
                                </div>

                                <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase mb-3 tracking-tight">Enterprise Scaling</h2>
                                <p className="text-slate-500 text-xs font-medium mb-10 leading-relaxed px-2">
                                    NEXUS Multi-Tenant architecture enables isolated instances for specific departments.
                                </p>

                                <div className="grid grid-cols-1 gap-3 mb-8 text-left">
                                    <div className="p-4 bg-white/50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 flex gap-4 group hover:border-indigo-500/30 transition-colors">
                                        <div className="bg-indigo-500/10 p-2 rounded-lg h-fit"><Building2 className="text-indigo-500" size={18} /></div>
                                        <div>
                                            <h4 className="text-[10px] font-black text-slate-900 dark:text-white uppercase mb-1">Unit Branding</h4>
                                            <p className="text-[9px] text-slate-500">Service-specific AURA logic & logos.</p>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-white/50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 flex gap-4 group hover:border-purple-500/30 transition-colors">
                                        <div className="bg-purple-500/10 p-2 rounded-lg h-fit"><ShieldCheck className="text-purple-500" size={18} /></div>
                                        <div>
                                            <h4 className="text-[10px] font-black text-slate-900 dark:text-white uppercase mb-1">Data Sharding</h4>
                                            <p className="text-[9px] text-slate-500">Isolated Firestore clusters.</p>
                                        </div>
                                    </div>
                                </div>

                                <button disabled className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-400 font-bold rounded-xl cursor-not-allowed uppercase text-[10px] tracking-[0.2em] border border-slate-200 dark:border-slate-700">
                                    Registration Restricted
                                </button>
                                <p className="mt-4 text-[9px] text-slate-400 font-bold uppercase">Contact Admin for whitelisting.</p>
                            </div>
                        )}

                    </div>
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
                
                @keyframes spin-slow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .animate-spin-slow { animation: spin-slow 8s linear infinite; }
                
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                .animate-shake { animation: shake 0.3s ease-in-out; }
            `}</style>
        </div>
    );
};

export default WelcomeScreen;
