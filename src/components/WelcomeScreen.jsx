import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase'; 
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    updateProfile, 
    signOut,
    sendPasswordResetEmail,
    sendEmailVerification
} from 'firebase/auth';
import { 
    Sun, Moon, ArrowRight, Activity, ShieldCheck, 
    Building2, Globe, ChevronLeft, AlertCircle, ShieldAlert, 
    BrainCircuit, Shield, User, Users, Stethoscope, Lock, Mail, Sparkles, Zap, KeyRound, CheckCircle2
} from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import { checkAccess } from '../utils'; 

const WelcomeScreen = (props) => {
    const onAuthSuccess = props.onStart || props.onLogin || props.onEnter;
    const navigate = useNavigate();
    
    // --- HOOKS & CONTEXT ---
    const { toggleDemo } = useNexus(); 

    // VIEW STATES
    const [view, setView] = useState('SPLASH'); // 'SPLASH' | 'AUTH' | 'ORG_REGISTER' | 'RESET'
    const [isDark, setIsDark] = useState(false);
    const [animate, setAnimate] = useState(false);

    // AUTH STATES
    const [isLoginMode, setIsLoginMode] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState(''); 
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
    const handleDemoEnter = () => {
        setLoading(true);
        setTimeout(() => { toggleDemo(); }, 1200);
    };

    const handleAuth = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);
        
        try {
            // 🛡️ SECURITY LAYER 1: STRICT DOMAIN CHECK
            if (!email.toLowerCase().endsWith('@kkh.com.sg')) {
                throw new Error("ACCESS DENIED: Only @kkh.com.sg emails are authorized for NEXUS.");
            }

            // 🛡️ SECURITY LAYER 2: WHITELIST CHECK
            const authorizedUser = checkAccess(email);
            if (!authorizedUser) {
                throw new Error("ACCESS DENIED: Email is not registered on the official team roster.");
            }

            if (isLoginMode) {
                // --- SIGN IN FLOW ---
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                
                // 🛡️ SECURITY LAYER 3: EMAIL VERIFICATION GUARD
                if (!userCredential.user.emailVerified) {
                    await sendEmailVerification(userCredential.user);
                    await signOut(auth);
                    throw new Error("VERIFICATION REQUIRED: We just sent a fresh verification link to your email. Please click it before logging in.");
                }

                // If verified, let them in!
                if (onAuthSuccess) onAuthSuccess(authorizedUser);

            } else {
                // --- SIGN UP FLOW ---
                if (!name) throw new Error("Please enter your full name.");
                if (password.length < 6) throw new Error("Password must be 6+ characters.");
                
                // 1. Create the account in Firebase
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                
                // 2. Add their Display Name
                await updateProfile(userCredential.user, { displayName: name });
                
                // 3. 🛡️ TRANSMIT THE VERIFICATION LINK
                await sendEmailVerification(userCredential.user);
                
                // 4. Kick them out so they MUST verify
                await signOut(auth);
                
                // 5. Update UI
                setMessage("PROFILE CREATED. PLEASE CHECK YOUR KKH INBOX TO VERIFY YOUR EMAIL.");
                setIsLoginMode(true); 
                setPassword(''); 
            }
        } catch (err) {
            console.error("Auth Exception:", err);
            if (auth.currentUser) await signOut(auth); 
            
            let cleanError = err.message;
            if (err.code === 'auth/email-already-in-use') cleanError = "ACCOUNT ALREADY EXISTS. PLEASE SIGN IN.";
            else if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') cleanError = "INVALID CREDENTIALS PROVIDED.";
            else cleanError = cleanError.replace('Firebase:', '').replace('Error (auth/', '').replace(').', '').trim();
            
            setError(cleanError.toUpperCase());
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        if (!email) {
            setError("PLEASE ENTER YOUR OFFICIAL EMAIL FIRST.");
            return;
        }
        setLoading(true); setError(''); setMessage('');
        try {
            await sendPasswordResetEmail(auth, email);
            setMessage("RESET LINK TRANSMITTED. CHECK YOUR INBOX.");
            setTimeout(() => {
                setView('AUTH');
                setMessage('');
            }, 3000);
        } catch (err) {
            setError("TRANSMISSION FAILED. ENSURE EMAIL IS REGISTERED.");
        } finally {
            setLoading(false);
        }
    };

    const isSplitView = view === 'AUTH' || view === 'ORG_REGISTER' || view === 'RESET';

    return (
        <div className="min-h-screen w-full bg-slate-100 dark:bg-slate-950 transition-colors duration-700 flex flex-col items-center justify-center relative overflow-hidden p-4 md:p-6 font-sans">
            
            {/* --- VISUAL LAYER: TECH GRID --- */}
            <div className="absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" 
                 style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '40px 40px' }}>
            </div>

            {/* --- VISUAL LAYER: BREATHING ORBS --- */}
            <div className={`fixed top-0 left-0 w-[800px] h-[800px] bg-indigo-500/20 rounded-full blur-[120px] pointer-events-none animate-float-slow ${animate ? 'opacity-100' : 'opacity-0'}`}></div>
            <div className={`fixed bottom-0 right-0 w-[600px] h-[600px] bg-emerald-500/15 rounded-full blur-[100px] pointer-events-none animate-float-delayed ${animate ? 'opacity-100' : 'opacity-0'}`}></div>

            <div className={`relative z-10 w-full max-w-7xl mx-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-3xl border border-white/80 dark:border-slate-700/80 rounded-[3rem] shadow-[0_20px_60px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.6)] transition-all duration-1000 transform overflow-hidden ${animate ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-20 opacity-0 scale-95'}`}>
                
                {/* --- TOGGLE SWITCH (DOCKED INSIDE) --- */}
                <div className="absolute top-6 right-6 md:top-8 md:right-8 z-50">
                    <button 
                        onClick={toggleTheme} 
                        className="p-3 rounded-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:scale-110 active:scale-95 transition-all"
                    >
                        {isDark ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-indigo-600" />}
                    </button>
                </div>

                <div className="flex flex-col md:flex-row min-h-[800px]">
                    
                    {/* LEFT SECTION: BRANDING & GATEWAYS */}
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
                                    System v152
                                </p>
                                <div className="h-[1px] w-8 bg-indigo-500"></div>
                            </div>
                        </div>

                        {/* 2. Gateway Cards (Visible only on SPLASH) */}
                        <div className={`w-full max-w-5xl transition-all duration-700 flex flex-col ${isSplitView ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100 h-auto items-center'}`}>
                            
                            <p className="text-xl md:text-2xl text-slate-800 dark:text-slate-200 font-bold mb-10 leading-relaxed max-w-2xl text-center">
                                Clinical Precision. <span className="text-indigo-500 dark:text-indigo-400">Human Empathy.</span><br/>
                                <span className="text-sm md:text-base text-slate-500 dark:text-slate-400 font-medium mt-3 block">
                                    Welcome to the digital sanctuary for modern healthcare. Please select your gateway to begin your journey.
                                </span>
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12 w-full">
                                
                                {/* INDIVIDUALS CARD */}
                                <div className="group relative flex flex-col items-start p-8 md:p-10 rounded-[2rem] bg-white dark:bg-slate-800 shadow-md dark:shadow-lg border border-slate-200 dark:border-slate-700 hover:shadow-2xl dark:hover:shadow-[0_10px_40px_rgba(16,185,129,0.15)] hover:border-emerald-500/30 transition-all duration-500 overflow-hidden text-left hover:-translate-y-1">
                                    <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
                                    <div className="mb-6 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 z-10">
                                        <Users size={32} strokeWidth={2} />
                                    </div>
                                    <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter mb-4 z-10">
                                        Individuals
                                    </h2>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-10 leading-relaxed font-medium z-10 flex-grow">
                                        Access your personal health records, schedule virtual consultations with AuraChat, and explore clinical resources tailored to your wellness journey.
                                    </p>
                                    <button 
                                        onClick={() => navigate('/individuals/language')}
                                        className="mt-auto relative w-full px-6 py-4 bg-emerald-500 text-white font-black text-[10px] md:text-xs rounded-xl shadow-[0_10px_20px_rgba(16,185,129,0.2)] hover:shadow-xl hover:scale-[1.02] transition-all duration-300 overflow-hidden group/btn z-10"
                                    >
                                        <span className="relative z-10 flex items-center justify-center gap-3 tracking-[0.2em] uppercase">
                                            Start Your Journey <ArrowRight size={16} className="group-hover/btn:translate-x-1 transition-transform" />
                                        </span>
                                        <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-400 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500 bg-[length:200%_auto] animate-gradient"></div>
                                    </button>
                                </div>

                                {/* PROFESSIONALS CARD */}
                                <div className="group relative flex flex-col items-start p-8 md:p-10 rounded-[2rem] bg-white dark:bg-slate-800 shadow-md dark:shadow-lg border border-slate-200 dark:border-slate-700 hover:shadow-2xl dark:hover:shadow-[0_10px_40px_rgba(99,102,241,0.15)] hover:border-indigo-500/30 transition-all duration-500 overflow-hidden text-left hover:-translate-y-1">
                                    <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/10 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
                                    <div className="mb-6 p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 z-10">
                                        <Stethoscope size={32} strokeWidth={2} />
                                    </div>
                                    <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter mb-4 z-10">
                                        Professionals
                                    </h2>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-10 leading-relaxed font-medium z-10 flex-grow">
                                        Advanced diagnostics, secure data management, and research-grade tools designed for practitioners who demand excellence and precision.
                                    </p>
                                    <button 
                                        onClick={() => setView('AUTH')}
                                        className="mt-auto relative w-full px-6 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-[10px] md:text-xs rounded-xl shadow-[0_10px_20px_rgba(0,0,0,0.2)] dark:shadow-[0_10px_20px_rgba(255,255,255,0.1)] hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 overflow-hidden group/btn z-10"
                                    >
                                        <span className="relative z-10 flex items-center justify-center gap-3 tracking-[0.2em] uppercase">
                                            Initialise NEXUS <Lock size={16} className="group-hover/btn:translate-x-1 transition-transform" />
                                        </span>
                                        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 opacity-0 group-hover/btn:opacity-10 transition-opacity duration-500 bg-[length:200%_auto] animate-gradient"></div>
                                    </button>
                                </div>

                            </div>

                            {/* Utility Buttons */}
                            <div className="flex gap-4 w-full max-w-sm mx-auto opacity-80 hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={handleDemoEnter} 
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold text-[9px] rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all uppercase tracking-widest"
                                >
                                    {loading ? <ShieldAlert size={12} className="animate-spin" /> : <ShieldAlert size={12} />} 
                                    Demo
                                </button>
                                <button 
                                    onClick={() => setView('ORG_REGISTER')} 
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold text-[9px] rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all uppercase tracking-widest"
                                >
                                    <Globe size={12} />
                                    Scale
                                </button>
                            </div>
                        </div>

                        {/* 3. Footer */}
                        <div className={`pt-10 opacity-50 transition-all duration-500 ${isSplitView ? 'text-left' : 'text-center'}`}>
                            <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 tracking-[0.5em] uppercase pointer-events-none">
                                © 2026 Muhammad Alif
                            </p>
                        </div>
                    </div>

                    {/* RIGHT SECTION: DYNAMIC CONTENT AREA (Auth, Reset, Scale) */}
                    <div className={`
                        relative z-10 flex flex-col justify-center
                        bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-inner
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
                                    <div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
                                        {isLoginMode ? 'Secure Gateway Active' : 'New Practitioner Registration'}
                                    </div>
                                </div>

                                {error && (
                                    <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 text-red-600 dark:text-red-400 text-[10px] font-bold rounded-xl flex gap-3 items-start animate-shake">
                                        <AlertCircle size={16} className="shrink-0 mt-0.5"/> 
                                        <span>{error}</span>
                                    </div>
                                )}

                                {message && (
                                    <div className="mb-6 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded-xl flex gap-3 items-start">
                                        <CheckCircle2 size={16} className="shrink-0 mt-0.5"/> 
                                        <span>{message}</span>
                                    </div>
                                )}

                                <form onSubmit={handleAuth} className="space-y-4">
                                    {!isLoginMode && (
                                        <div className="relative group">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors"><User size={18} /></div>
                                            <input 
                                                type="text" 
                                                placeholder="Full Display Name" 
                                                className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 shadow-sm rounded-xl py-4 pl-12 pr-4 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600" 
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
                                            className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 shadow-sm rounded-xl py-4 pl-12 pr-4 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600" 
                                            value={email} 
                                            onChange={e => setEmail(e.target.value)} 
                                        />
                                    </div>
                                    
                                    <div className="relative group">
                                        {isLoginMode && (
                                            <div className="flex justify-end mb-1">
                                                <button 
                                                    type="button" 
                                                    onClick={() => { setView('RESET'); setError(''); setMessage(''); }}
                                                    className="text-[10px] font-bold text-indigo-500 hover:text-indigo-400 transition-colors uppercase tracking-widest"
                                                >
                                                    Forgot Password?
                                                </button>
                                            </div>
                                        )}
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors"><Lock size={18} /></div>
                                        <input 
                                            type="password" 
                                            placeholder="Secure Key" 
                                            className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 shadow-sm rounded-xl py-4 pl-12 pr-4 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600" 
                                            value={password} 
                                            onChange={e => setPassword(e.target.value)} 
                                        />
                                    </div>

                                    <button 
                                        type="submit" 
                                        disabled={loading} 
                                        className="w-full py-4 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/30 flex justify-center items-center gap-2 active:scale-95 disabled:opacity-50 mt-4"
                                    >
                                        {loading ? <Zap size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                                        {loading ? 'Authenticating...' : (isLoginMode ? 'Access Workspace' : 'Create Account')}
                                    </button>
                                </form>

                                <div className="mt-8 text-center pt-6 border-t border-slate-200 dark:border-slate-800">
                                    <button 
                                        onClick={() => { setIsLoginMode(!isLoginMode); setError(''); setMessage(''); }} 
                                        className="text-[10px] font-black text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 uppercase tracking-widest transition-colors"
                                    >
                                        {isLoginMode ? "New Practitioner? Request Access" : "Have credentials? Sign in"}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* --- VIEW: RESET PASSWORD --- */}
                        {view === 'RESET' && (
                            <div className="w-full max-w-sm mx-auto animate-in slide-in-from-right duration-500 fade-in text-center">
                                <button onClick={() => setView('AUTH')} className="mb-8 text-slate-400 hover:text-indigo-500 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors group">
                                    <ChevronLeft size={14} className="group-hover:-translate-x-1 transition-transform"/> Back to Sign In
                                </button>
                                
                                <div className="relative w-16 h-16 bg-white dark:bg-slate-800 shadow-lg rounded-2xl flex items-center justify-center mx-auto mb-6 border border-indigo-500/20 ring-4 ring-indigo-500/5">
                                    <KeyRound className="text-indigo-500" size={32}/>
                                </div>

                                <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase mb-3 tracking-tight">System Override</h2>
                                <p className="text-slate-500 text-xs font-medium mb-8 leading-relaxed px-2">
                                    Enter your official email to receive a secure password reset transmission.
                                </p>

                                {error && (
                                    <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 text-red-600 dark:text-red-400 text-[10px] font-bold rounded-xl flex gap-3 items-start animate-shake text-left">
                                        <AlertCircle size={16} className="shrink-0 mt-0.5"/> 
                                        <span>{error}</span>
                                    </div>
                                )}

                                {message && (
                                    <div className="mb-6 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded-xl flex gap-3 items-start text-left">
                                        <CheckCircle2 size={16} className="shrink-0 mt-0.5"/> 
                                        <span>{message}</span>
                                    </div>
                                )}

                                <form onSubmit={handleResetPassword} className="space-y-4">
                                    <div className="relative group">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors"><Mail size={18} /></div>
                                        <input 
                                            type="email" 
                                            placeholder="Official Email" 
                                            required
                                            className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 shadow-sm rounded-xl py-4 pl-12 pr-4 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600" 
                                            value={email} 
                                            onChange={e => setEmail(e.target.value)} 
                                        />
                                    </div>

                                    <button 
                                        type="submit" 
                                        disabled={loading} 
                                        className="w-full py-4 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/30 flex justify-center items-center gap-2 active:scale-95 disabled:opacity-50 mt-4"
                                    >
                                        {loading ? <Zap size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                                        {loading ? 'Transmitting...' : 'Send Reset Link'}
                                    </button>
                                </form>
                            </div>
                        )}

                        {/* --- VIEW: ORG REGISTER --- */}
                        {view === 'ORG_REGISTER' && (
                            <div className="w-full max-w-sm mx-auto animate-in slide-in-from-right duration-500 fade-in text-center">
                                <button onClick={() => setView('SPLASH')} className="mb-10 text-slate-400 hover:text-indigo-500 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors group">
                                    <ChevronLeft size={14} className="group-hover:-translate-x-1 transition-transform"/> Back
                                </button>
                                
                                <div className="relative w-16 h-16 bg-white dark:bg-slate-800 shadow-lg rounded-2xl flex items-center justify-center mx-auto mb-6 border border-emerald-500/20 ring-4 ring-emerald-500/5">
                                    <Globe className="text-emerald-500 animate-spin-slow" size={32}/>
                                    <Sparkles className="absolute -top-2 -right-2 text-amber-400 fill-amber-400" size={16} />
                                </div>

                                <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase mb-3 tracking-tight">Enterprise Scaling</h2>
                                <p className="text-slate-500 text-xs font-medium mb-10 leading-relaxed px-2">
                                    NEXUS Multi-Tenant architecture enables isolated instances for specific departments.
                                </p>

                                <div className="grid grid-cols-1 gap-3 mb-8 text-left">
                                    <div className="p-4 bg-white dark:bg-slate-800 shadow-md rounded-xl border border-slate-200 dark:border-slate-700 flex gap-4 group hover:border-indigo-500/50 hover:shadow-lg transition-all">
                                        <div className="bg-indigo-500/10 p-2 rounded-lg h-fit"><Building2 className="text-indigo-500" size={18} /></div>
                                        <div>
                                            <h4 className="text-[10px] font-black text-slate-900 dark:text-white uppercase mb-1">Unit Branding</h4>
                                            <p className="text-[9px] text-slate-500">Service-specific AURA logic & logos.</p>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-white dark:bg-slate-800 shadow-md rounded-xl border border-slate-200 dark:border-slate-700 flex gap-4 group hover:border-purple-500/50 hover:shadow-lg transition-all">
                                        <div className="bg-purple-500/10 p-2 rounded-lg h-fit"><ShieldCheck className="text-purple-500" size={18} /></div>
                                        <div>
                                            <h4 className="text-[10px] font-black text-slate-900 dark:text-white uppercase mb-1">Data Sharding</h4>
                                            <p className="text-[9px] text-slate-500">Isolated Firestore clusters.</p>
                                        </div>
                                    </div>
                                </div>

                                <button disabled className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-400 font-bold rounded-xl cursor-not-allowed uppercase text-[10px] tracking-[0.2em] border border-slate-200 dark:border-slate-700 shadow-inner">
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
