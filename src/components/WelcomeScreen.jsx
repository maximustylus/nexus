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
    Sun, Moon, ArrowRight, ShieldCheck, 
    ChevronLeft, AlertCircle, ShieldAlert, 
    User, Lock, Mail, Zap, KeyRound, CheckCircle2,
    UserCircle, Stethoscope, PlaySquare, Globe,
    Sparkles, Building2 // Restored these imports for the Scaling UI
} from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import { checkAccess } from '../utils'; 

const WelcomeScreen = (props) => {
    const onAuthSuccess = props.onStart || props.onLogin || props.onEnter;
    const navigate = useNavigate();
    
    const { toggleDemo } = useNexus(); 

    // THE CORE NAVIGATION STATE
    const [activeTab, setActiveTab] = useState('INDIVIDUALS');
    const [authView, setAuthView] = useState('LOGIN'); // 'LOGIN' | 'REGISTER' | 'RESET' | 'ORG_REGISTER'
    
    // VISUAL STATES
    const [isDark, setIsDark] = useState(false);
    const [animate, setAnimate] = useState(false);

    // AUTH DATA STATES
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState(''); 
    const [loading, setLoading] = useState(false);

    // THEME INITIALISATION
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

    const handleDemoEnter = () => {
        setLoading(true);
        setTimeout(() => { toggleDemo(); }, 1200);
    };

    // AUTHENTICATION LOGIC
    const handleAuth = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);
        
        try {
            // STRICT DOMAIN CHECK
            if (!email.toLowerCase().endsWith('@kkh.com.sg')) {
                throw new Error("ACCESS DENIED: Only @kkh.com.sg emails are authorised for NEXUS.");
            }

            // WHITELIST CHECK
            const authorisedUser = checkAccess(email);
            if (!authorisedUser) {
                throw new Error("ACCESS DENIED: Email is not registered on the official team roster.");
            }

            if (authView === 'LOGIN') {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                
                // VERIFICATION GUARD
                if (!userCredential.user.emailVerified) {
                    await sendEmailVerification(userCredential.user);
                    await signOut(auth);
                    throw new Error("VERIFICATION REQUIRED: We just sent a fresh verification link to your email. Please click it before logging in.");
                }

                if (onAuthSuccess) onAuthSuccess(authorisedUser);

            } else {
                // REGISTRATION
                if (!name) throw new Error("Please enter your full name.");
                if (password.length < 6) throw new Error("Password must be 6+ characters.");
                
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await updateProfile(userCredential.user, { displayName: name });
                await sendEmailVerification(userCredential.user);
                await signOut(auth);
                
                setMessage("PROFILE CREATED. PLEASE CHECK YOUR KKH INBOX TO VERIFY YOUR EMAIL.");
                setAuthView('LOGIN'); 
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
                setAuthView('LOGIN');
                setMessage('');
            }, 3000);
        } catch (err) {
            setError("TRANSMISSION FAILED. ENSURE EMAIL IS REGISTERED.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full bg-slate-100 dark:bg-slate-950 transition-colors duration-700 flex flex-col items-center justify-center relative overflow-hidden p-4 md:p-6 font-sans">
            
            {/* VISUAL BACKGROUND ELEMENTS */}
            <div className="absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" 
                 style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '40px 40px' }}>
            </div>
            <div className={`fixed top-0 left-0 w-[800px] h-[800px] bg-indigo-500/20 rounded-full blur-[120px] pointer-events-none animate-float-slow ${animate ? 'opacity-100' : 'opacity-0'}`}></div>
            <div className={`fixed bottom-0 right-0 w-[600px] h-[600px] bg-emerald-500/15 rounded-full blur-[100px] pointer-events-none animate-float-delayed ${animate ? 'opacity-100' : 'opacity-0'}`}></div>

            {/* MINIMALIST THEME TOGGLE */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-2 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm">
                <button onClick={toggleTheme} className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 hover:scale-110 transition-transform">
                    {isDark ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-slate-500 dark:text-slate-400" />}
                </button>
            </div>

            {/* LOGO & HEADER */}
            <div className="relative z-20 mb-8 flex items-center gap-3 mt-12 md:mt-0">
                <img src="/nexus.png" alt="NEXUS" className="w-10 h-10 drop-shadow-md" />
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">NEXUS</h1>
            </div>

            {/* THE COMMAND CARD */}
            <div className={`relative z-20 w-full max-w-xl bg-white dark:bg-[#111827] rounded-[2rem] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-all duration-1000 transform ${animate ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 scale-95'}`}>
                
                {/* NAVIGATION TABS */}
                <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#1f2937]">
                    <button 
                        onClick={() => setActiveTab('INDIVIDUALS')}
                        className={`flex-1 flex flex-col md:flex-row items-center justify-center gap-2 py-5 text-sm font-bold transition-all relative ${activeTab === 'INDIVIDUALS' ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                    >
                        <UserCircle size={18} /> Individuals
                        {activeTab === 'INDIVIDUALS' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-emerald-500 dark:bg-emerald-400" />}
                    </button>
                    <button 
                        onClick={() => { setActiveTab('PROFESSIONALS'); setAuthView('LOGIN'); }}
                        className={`flex-1 flex flex-col md:flex-row items-center justify-center gap-2 py-5 text-sm font-bold transition-all relative ${activeTab === 'PROFESSIONALS' ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                    >
                        <Stethoscope size={18} /> Professionals
                        {activeTab === 'PROFESSIONALS' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 dark:bg-indigo-400" />}
                    </button>
                    <button 
                        onClick={() => setActiveTab('DEMO')}
                        className={`flex-1 flex flex-col md:flex-row items-center justify-center gap-2 py-5 text-sm font-bold transition-all relative ${activeTab === 'DEMO' ? 'text-purple-500 dark:text-purple-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                    >
                        <PlaySquare size={18} /> Demo
                        {activeTab === 'DEMO' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-purple-500 dark:bg-purple-400" />}
                    </button>
                </div>

                {/* DYNAMIC CONTENT AREA */}
                <div className="p-8 md:p-12 min-h-[400px] flex flex-col justify-center">
                    
                    {/* TAB 1: INDIVIDUALS (PUBLIC PORTAL) */}
                    {activeTab === 'INDIVIDUALS' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 text-center md:text-left">
                            <div className="mb-6 inline-flex p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                <User size={32} />
                            </div>
                            <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-4">Individuals</h2>
                            <p className="text-slate-600 dark:text-slate-400 mb-10 leading-relaxed text-sm font-medium">
                                Explore community resources tailored to your health, lifestyle and wellness journey. AURA provides recommendations and can direct you to leading health and community programmes and services.
                            </p>
                            <button 
                                onClick={() => navigate('/individuals/language')}
                                className="w-full py-4 rounded-xl font-black text-xs md:text-sm text-white bg-gradient-to-r from-indigo-500 to-emerald-400 hover:opacity-90 transition-opacity flex items-center justify-center gap-3 shadow-[0_10px_20px_rgba(16,185,129,0.2)]"
                            >
                                START YOUR JOURNEY <ArrowRight size={18} />
                            </button>
                        </div>
                    )}

                    {/* TAB 2: PROFESSIONALS (CLINICIAN AUTH & SCALE) */}
                    {activeTab === 'PROFESSIONALS' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            
                            {/* LOGIN & REGISTER FORMS */}
                            {(authView === 'LOGIN' || authView === 'REGISTER') && (
                                <>
                                    <div className="mb-8 text-center md:text-left">
                                        <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase mb-2">
                                            {authView === 'LOGIN' ? 'Verify Identity' : 'Initialise Profile'}
                                        </h2>
                                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                            {authView === 'LOGIN' ? 'Secure Gateway Active' : 'New Practitioner Registration'}
                                        </p>
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
                                        {authView === 'REGISTER' && (
                                            <div className="relative group">
                                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors"><User size={18} /></div>
                                                <input 
                                                    type="text" 
                                                    placeholder="Full Display Name" 
                                                    className="w-full bg-slate-50 dark:bg-[#1f2937] border border-slate-200 dark:border-slate-700 shadow-sm rounded-xl py-4 pl-12 pr-4 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600" 
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
                                                className="w-full bg-slate-50 dark:bg-[#1f2937] border border-slate-200 dark:border-slate-700 shadow-sm rounded-xl py-4 pl-12 pr-4 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600" 
                                                value={email} 
                                                onChange={e => setEmail(e.target.value)} 
                                            />
                                        </div>
                                        
                                        <div className="relative group">
                                            {authView === 'LOGIN' && (
                                                <div className="flex justify-end mb-1">
                                                    <button 
                                                        type="button" 
                                                        onClick={() => { setAuthView('RESET'); setError(''); setMessage(''); }}
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
                                                className="w-full bg-slate-50 dark:bg-[#1f2937] border border-slate-200 dark:border-slate-700 shadow-sm rounded-xl py-4 pl-12 pr-4 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600" 
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
                                            {loading ? 'Authenticating...' : (authView === 'LOGIN' ? 'Access Workspace' : 'Create Account')}
                                        </button>
                                    </form>

                                    <div className="mt-8 text-center pt-6 border-t border-slate-200 dark:border-slate-800 space-y-4">
                                        <button 
                                            onClick={() => { setAuthView(authView === 'LOGIN' ? 'REGISTER' : 'LOGIN'); setError(''); setMessage(''); }} 
                                            className="text-[10px] font-black text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 uppercase tracking-widest transition-colors block w-full"
                                        >
                                            {authView === 'LOGIN' ? "New Practitioner? Request Access" : "Have credentials? Sign in"}
                                        </button>
                                        
                                        <button 
                                            onClick={() => { setAuthView('ORG_REGISTER'); setError(''); setMessage(''); }} 
                                            className="text-[10px] font-black text-emerald-600 dark:text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-400 uppercase tracking-widest transition-colors flex items-center justify-center gap-2 w-full"
                                        >
                                            <Globe size={12} /> Enterprise / Scale Unit
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* RESET PASSWORD FORM */}
                            {authView === 'RESET' && (
                                <>
                                    <button onClick={() => setAuthView('LOGIN')} className="mb-6 text-slate-400 hover:text-indigo-500 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors group">
                                        <ChevronLeft size={14} className="group-hover:-translate-x-1 transition-transform"/> Back to Sign In
                                    </button>
                                    <div className="mb-8 text-center md:text-left">
                                        <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase mb-2">System Override</h2>
                                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                            Password Reset Protocol
                                        </p>
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

                                    <form onSubmit={handleResetPassword} className="space-y-4">
                                        <div className="relative group">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors"><Mail size={18} /></div>
                                            <input 
                                                type="email" 
                                                placeholder="Official Email" 
                                                required
                                                className="w-full bg-slate-50 dark:bg-[#1f2937] border border-slate-200 dark:border-slate-700 shadow-sm rounded-xl py-4 pl-12 pr-4 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600" 
                                                value={email} 
                                                onChange={e => setEmail(e.target.value)} 
                                            />
                                        </div>
                                        <button 
                                            type="submit" 
                                            disabled={loading} 
                                            className="w-full py-4 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/30 flex justify-center items-center gap-2 active:scale-95 disabled:opacity-50 mt-4"
                                        >
                                            {loading ? <Zap size={16} className="animate-spin" /> : <KeyRound size={16} />}
                                            {loading ? 'Transmitting...' : 'Send Reset Link'}
                                        </button>
                                    </form>
                                </>
                            )}

                            {/* SCALE UNIT / ORG REGISTER FORM */}
                            {authView === 'ORG_REGISTER' && (
                                <div className="w-full max-w-sm mx-auto animate-in slide-in-from-right duration-500 fade-in text-center md:text-left">
                                    <button onClick={() => setAuthView('LOGIN')} className="mb-10 text-slate-400 hover:text-indigo-500 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors group">
                                        <ChevronLeft size={14} className="group-hover:-translate-x-1 transition-transform"/> Back
                                    </button>
                                    
                                    <div className="relative w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto md:mx-0 mb-6 border border-emerald-500/20 ring-4 ring-emerald-500/5">
                                        <Globe className="text-emerald-500 animate-spin-slow" size={32}/>
                                        <Sparkles className="absolute -top-2 -right-2 text-amber-400 fill-amber-400" size={16} />
                                    </div>

                                    <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase mb-3 tracking-tight">Enterprise Scaling</h2>
                                    <p className="text-slate-500 text-xs font-medium mb-10 leading-relaxed pr-2">
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
                                    <p className="mt-4 text-[9px] text-slate-400 font-bold uppercase text-center md:text-left">Contact Admin for whitelisting.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 3: DEMO (SANDBOX) */}
                    {activeTab === 'DEMO' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 text-center md:text-left">
                            <div className="mb-6 inline-flex p-4 rounded-2xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400">
                                <PlaySquare size={32} />
                            </div>
                            <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-4">Demo Mode</h2>
                            <p className="text-slate-600 dark:text-slate-400 mb-10 leading-relaxed text-sm font-medium">
                                Experience the NEXUS architecture in a sandboxed environment. Access analytics and triage tools without processing live clinical data.
                            </p>
                            <button 
                                onClick={handleDemoEnter} 
                                disabled={loading}
                                className="w-full py-4 rounded-xl font-black text-xs md:text-sm text-white bg-purple-600 hover:bg-purple-700 transition-colors flex items-center justify-center gap-3 shadow-[0_10px_20px_rgba(167,139,250,0.2)]"
                            >
                                {loading ? <ShieldAlert size={18} className="animate-spin" /> : <ShieldAlert size={18} />} 
                                {loading ? 'DECRYPTING...' : 'INITIALISE DEMO'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* FOOTER */}
            <div className="absolute bottom-8 text-center opacity-50 pointer-events-none flex flex-col items-center gap-1">
                <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 tracking-[0.4em] uppercase">
                    © 2026 Muhammad Alif • System v1.52
                </p>
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
                
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                .animate-shake { animation: shake 0.3s ease-in-out; }
                
                @keyframes spin-slow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .animate-spin-slow { animation: spin-slow 8s linear infinite; }
            `}</style>
        </div>
    );
};

export default WelcomeScreen;
