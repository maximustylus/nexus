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
} from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useNexus } from '../context/NexusContext';
import { checkAccess } from '../utils';
import { useDomainAllowlist } from '../hooks/useDomainAllowlist';
import {
    isAllowedEmail,
    domainRefusalMessage,
    validateLeadDeclaration,
    buildLeadRequest,
    isLeadRole,
    ROLE_OPTIONS,
    ROLE_STAFF,
    ROLE_LEAD,
} from '../utils/accessPolicy';
import { leadRequestPath } from '../utils/teamPaths';
import { MOH_PROFESSION_OPTIONS } from '../data/mockData';
import { APP_VERSION_LABEL } from '../version';

// Hoisted out of the component: a fixed, render-independent list. Inside the
// body it was reallocated every render, which is what made
// react-hooks/exhaustive-deps ask for `welcomeTexts.length` in the rotator
// effect below. At module scope the dependency is a constant and the effect's
// `[activeTab]` list is complete.
const WELCOME_TEXTS = [
    "Explore community resources tailored to your health, lifestyle and wellness journey. AURA provides recommendations and can direct you to leading health and community programmes and services.",
    "Terokai sumber komuniti yang disesuaikan untuk perjalanan kesihatan, gaya hidup dan kesejahteraan anda. AURA memberikan cadangan dan boleh menghalakan anda ke program dan perkhidmatan kesihatan dan komuniti yang terkemuka.",
    "探索专为您的健康、生活方式和保健之旅量身定制的社区资源。AURA 提供建议，并能引导您参与领先的健康与社区计划和服务。",
    "உங்கள் உடல்நலம், வாழ்க்கை முறை மற்றும் ஆரோக்கியப் பயணத்திற்கு ஏற்ப சமூக வளங்களை ஆராயுங்கள். AURA பரிந்துரைகளை வழங்கி, முன்னணி சுகாதார மற்றும் சமூக சேவைகளுக்கு உங்களை வழிநடத்தும்."
];

const WelcomeScreen = (props) => {
    const onAuthSuccess = props.onStart || props.onLogin || props.onEnter;
    const navigate = useNavigate();
    
    // Safely consume context to prevent hydration crashes
    const nexus = useNexus(); 
    
    const [activeTab, setActiveTab] = useState('INDIVIDUALS');
    const [authView, setAuthView] = useState('LOGIN');
    const [isDark, setIsDark] = useState(false);
    const [animate, setAnimate] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState(''); 
    const [loading, setLoading] = useState(false);
    const [langIndex, setLangIndex] = useState(0);

    // THE REGISTRATION DECLARATION. `role` defaults to staff because most people
    // registering are staff, and because defaulting to a lead role would invite
    // everyone to claim one. The other three are only read when `isLeadRole(role)`.
    const [role, setRole] = useState(ROLE_STAFF);
    const [institution, setInstitution] = useState('');
    const [department, setDepartment] = useState('');
    const [profession, setProfession] = useState('');
    const [fieldErrors, setFieldErrors] = useState({});

    // Read before sign-in, and falls back closed — see the hook's header.
    const { domains } = useDomainAllowlist();

    useEffect(() => {
        if (activeTab === 'INDIVIDUALS') {
            const interval = setInterval(() => {
                setLangIndex((prev) => (prev + 1) % WELCOME_TEXTS.length);
            }, 4500);
            return () => clearInterval(interval);
        }
    }, [activeTab]);
    
    useEffect(() => {
        const storedTheme = localStorage.getItem('nexus_theme');
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
            localStorage.setItem('nexus_theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('nexus_theme', 'light');
        }
    };

    const handleDemoEnter = () => {
        setLoading(true);
        setTimeout(() => { 
            if (nexus && nexus.toggleDemo) {
                nexus.toggleDemo(); 
            } else {
                console.warn("NexusContext not fully hydrated, routing skipped.");
                setLoading(false);
            }
        }, 1200);
    };

    const handleAuth = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setFieldErrors({});
        setLoading(true);

        try {
            // ── GATE 1: THE INSTITUTION ──────────────────────────────────────────
            // Was `endsWith('@kkh.com.sg')`, which permanently locked out the two
            // colleagues in the directory holding `@singhealth.com.sg` addresses.
            // Now an exact match against an allowlist held as DATA, so onboarding an
            // institution is a Firestore edit rather than a code deploy.
            //
            // ⚠️ This is a registration gate, not a security boundary — it runs in the
            // browser. `firestore.rules` and the approval function are what actually
            // protect clinical data. See `accessPolicy.js`.
            if (!isAllowedEmail(email, domains)) {
                const refusal = new Error(domainRefusalMessage(email, domains));
                // Shown verbatim rather than SHOUTED — it is two sentences of guidance,
                // and uppercasing a list of domains makes it harder to read, not louder.
                refusal.friendly = true;
                throw refusal;
            }

            // GATE 2 IS GONE ON PURPOSE. It used to be `checkAccess(email)` — a
            // ten-person hardcoded list, which is what made NEXUS a one-team product.
            // Who you are is now decided AFTER sign-in, by whether a membership
            // document exists for you; `checkAccess` survives below only as a lookup
            // for the migrated team, and step 5 of the rebuild deletes it.

            if (authView === 'LOGIN') {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);

                if (!userCredential.user.emailVerified) {
                    await sendEmailVerification(userCredential.user);
                    await signOut(auth);
                    throw new Error("VERIFICATION REQUIRED: We just sent a fresh verification link to your email. Please click it before logging in.");
                }

                // A known face keeps their directory profile; anyone else is handed the
                // authenticated user and routed by their access state, not by this list.
                const knownProfile = checkAccess(email);
                if (onAuthSuccess) onAuthSuccess(knownProfile || {
                    id: userCredential.user.uid,
                    uid: userCredential.user.uid,
                    name: userCredential.user.displayName || email.split('@')[0],
                    email: email.toLowerCase(),
                    role: 'staff',
                });

            } else {
                if (!name) throw new Error("Please enter your full name.");
                if (password.length < 6) throw new Error("Password must be 6+ characters.");

                // A LEAD DECLARES HERE, AND THE DECLARATION IS A CLAIM, NOT A GRANT.
                // Validated before the account is created so a typo does not leave an
                // orphaned auth user behind.
                const declaring = isLeadRole(role);
                const declaration = { role, institution, department, profession };
                if (declaring) {
                    const { ok, errors } = validateLeadDeclaration(declaration);
                    if (!ok) {
                        setFieldErrors(errors);
                        throw new Error("Complete your team details so we know what to approve.");
                    }
                }

                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await updateProfile(userCredential.user, { displayName: name });

                // THE ACCOUNT NOW EXISTS AND CANNOT BE UNDONE FROM HERE. Everything
                // below is best-effort, and the failure handling reflects that: a
                // request that does not lodge must NOT be reported as an error that
                // implies "try again", because trying again hits
                // `auth/email-already-in-use` and the person concludes NEXUS is broken
                // when in fact they have a working account.
                let lodged = false;
                if (declaring) {
                    try {
                        // Written while the new account is still signed in — the only
                        // moment it holds a uid and a session at once. `status` is pinned
                        // to 'pending' inside `buildLeadRequest`; nothing here can approve
                        // itself, and the Cloud Function refuses to approve an account
                        // whose email is still unverified.
                        await setDoc(
                            doc(db, ...leadRequestPath(userCredential.user.uid)),
                            {
                                ...buildLeadRequest({
                                    uid: userCredential.user.uid,
                                    email,
                                    displayName: name,
                                    ...declaration,
                                }),
                                requestedAt: new Date().toISOString(),
                            },
                        );
                        lodged = true;
                    } catch (writeError) {
                        console.error('[NEXUS] lead request write failed:', writeError);
                    }
                }

                await sendEmailVerification(userCredential.user);
                await signOut(auth);

                if (declaring && !lodged) {
                    const partial = new Error(
                        'Your account was created, but we could not lodge your team request. '
                        + 'Sign in once you have verified your email and you will be able to ask again — '
                        + 'do not register a second time.',
                    );
                    partial.friendly = true;
                    throw partial;
                }

                setMessage(declaring
                    ? "REQUEST LODGED. VERIFY YOUR EMAIL, THEN WAIT FOR YOUR TEAM TO BE APPROVED — YOU WILL BE ABLE TO INVITE YOUR STAFF ONCE IT IS."
                    : "PROFILE CREATED. VERIFY YOUR EMAIL, THEN ASK YOUR TEAM LEAD TO INVITE YOU.");
                setAuthView('LOGIN');
                setPassword('');
            }
        } catch (err) {
            console.error("Auth Exception:", err);
            if (auth.currentUser) await signOut(auth);

            if (err.friendly) {
                setError(err.message);
                return;
            }

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
            <div className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120vw] h-[120vw] md:w-[800px] md:h-[800px] bg-indigo-500/20 rounded-full blur-[100px] md:blur-[150px] pointer-events-none animate-float-slow ${animate ? 'opacity-100' : 'opacity-0'}`}></div>
            <div className={`fixed bottom-0 right-0 translate-x-1/3 translate-y-1/3 w-[80vw] h-[80vw] md:w-[600px] md:h-[600px] bg-emerald-500/15 rounded-full blur-[100px] md:blur-[120px] pointer-events-none animate-float-delayed ${animate ? 'opacity-100' : 'opacity-0'}`}></div>

            {/* MASTER CONTENT WRAPPER */}
            <div className={`relative z-20 w-full max-w-xl flex flex-col items-center justify-center transition-all duration-1000 transform ${animate ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
                
                {/* TETHERED THEME TOGGLE */}
                <div className="absolute top-0 right-0 md:top-8 md:-right-16 z-50">
                    <button 
                        onClick={toggleTheme} 
                        className="p-3 rounded-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-slate-700 shadow-sm hover:scale-110 active:scale-95 transition-all"
                        aria-label="Toggle Theme"
                    >
                        {isDark ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-slate-500 dark:text-slate-400" />}
                    </button>
                </div>

                {/* LOGO & TEXT */}
                <div className="w-full flex flex-col items-center justify-center gap-4 group cursor-default text-center mb-8 mt-8 md:mt-0">
                    <img 
                        src="/nexus.png" 
                        alt="NEXUS" 
                        className="w-32 h-32 md:w-48 md:h-48 drop-shadow-xl transition-transform duration-500 group-hover:rotate-6 group-hover:scale-105" 
                    />
                    <h1 className="text-5xl md:text-7xl font-black text-slate-900 dark:text-white tracking-tighter">
                        NEXUS
                    </h1>
                </div>

                {/* THE COMMAND CARD */}
                <div className="w-full bg-white dark:bg-[#111827] rounded-[2rem] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    
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
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 text-center md:text-left relative">
                                <div className="mb-6 inline-flex p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                    <User size={32} />
                                </div>
                                <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-4">Individuals</h2>
                                
                                {/* THE BREATHING CAROUSEL */}
                                <div className="grid mb-10 relative z-0 pointer-events-none min-h-[80px]"> 
                                    {WELCOME_TEXTS.map((text, index) => (
                                        <p 
                                            key={index}
                                            className={`col-start-1 row-start-1 w-full text-slate-600 dark:text-slate-400 leading-relaxed text-sm font-medium transition-all duration-1000 ease-in-out ${
                                                langIndex === index ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 invisible'
                                            }`}
                                        >
                                            {text}
                                        </p>
                                    ))}
                                </div>

                                {/* THE BULLETPROOF START BUTTON */}
                                <div className="relative z-[9999]">
                                    <button 
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            navigate('/individuals/language');
                                        }}
                                        className="w-full py-4 px-2 rounded-xl font-black text-[10px] md:text-xs text-white bg-gradient-to-r from-indigo-500 to-emerald-400 hover:opacity-90 hover:scale-[1.02] active:scale-95 cursor-pointer transition-all flex items-center justify-center gap-2 shadow-[0_10px_20px_rgba(16,185,129,0.2)] whitespace-nowrap overflow-hidden text-ellipsis"
                                    >
                                        <span>START • MULA • 开始 • தொடங்கு</span> <ArrowRight size={16} className="shrink-0" />
                                    </button>
                                </div>
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

                                            {/*
                                              THE DECLARATION. The owner's rule is that only leads,
                                              supervisors and administrators may create a team, and
                                              that they say so HERE — at registration — rather than
                                              being promoted later. Everyone else registers and waits
                                              to be invited, which is the honest description of what
                                              happens and so is what the option says.
                                            */}
                                            {authView === 'REGISTER' && (
                                                <div className="space-y-4">
                                                    <div>
                                                        <label htmlFor="nexus-role" className="block mb-2 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                                            Your role
                                                        </label>
                                                        <select
                                                            id="nexus-role"
                                                            value={role}
                                                            onChange={e => { setRole(e.target.value); setFieldErrors({}); }}
                                                            className="w-full bg-slate-50 dark:bg-[#1f2937] border border-slate-200 dark:border-slate-700 shadow-sm rounded-xl py-4 px-4 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                                        >
                                                            {ROLE_OPTIONS.map(option => (
                                                                <option key={option.id} value={option.id}>{option.label}</option>
                                                            ))}
                                                        </select>
                                                        {fieldErrors.role && (
                                                            <p className="mt-1 text-[10px] font-bold text-red-600 dark:text-red-400">{fieldErrors.role}</p>
                                                        )}
                                                    </div>

                                                    {isLeadRole(role) && (
                                                        <div className="space-y-4 p-4 rounded-xl border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50/50 dark:bg-indigo-900/10">
                                                            <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 leading-relaxed">
                                                                Tell us which team you run. It is created once an administrator
                                                                approves your request — after that you invite and remove your own
                                                                people without waiting for anybody.
                                                            </p>

                                                            <div>
                                                                <input
                                                                    type="text"
                                                                    placeholder="Institution — e.g. KKH"
                                                                    aria-label="Institution"
                                                                    className="w-full bg-white dark:bg-[#1f2937] border border-slate-200 dark:border-slate-700 shadow-sm rounded-xl py-4 px-4 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
                                                                    value={institution}
                                                                    onChange={e => setInstitution(e.target.value)}
                                                                />
                                                                {fieldErrors.institution && (
                                                                    <p className="mt-1 text-[10px] font-bold text-red-600 dark:text-red-400">{fieldErrors.institution}</p>
                                                                )}
                                                            </div>

                                                            <div>
                                                                <input
                                                                    type="text"
                                                                    placeholder="Department or service — e.g. Respiratory Therapy"
                                                                    aria-label="Department or service"
                                                                    className="w-full bg-white dark:bg-[#1f2937] border border-slate-200 dark:border-slate-700 shadow-sm rounded-xl py-4 px-4 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
                                                                    value={department}
                                                                    onChange={e => setDepartment(e.target.value)}
                                                                />
                                                                {fieldErrors.department && (
                                                                    <p className="mt-1 text-[10px] font-bold text-red-600 dark:text-red-400">{fieldErrors.department}</p>
                                                                )}
                                                            </div>

                                                            <div>
                                                                {/*
                                                                  MOH's own vocabulary, already in the tree for the demo
                                                                  picker. Two of the 28 professions nest, so this walks
                                                                  groups and options rather than a flat list — a browser
                                                                  will not let anyone select a group heading, which is
                                                                  the behaviour we want and would otherwise have to
                                                                  enforce ourselves.
                                                                */}
                                                                <select
                                                                    aria-label="Profession"
                                                                    value={profession}
                                                                    onChange={e => setProfession(e.target.value)}
                                                                    className="w-full bg-white dark:bg-[#1f2937] border border-slate-200 dark:border-slate-700 shadow-sm rounded-xl py-4 px-4 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                                                >
                                                                    <option value="">Profession…</option>
                                                                    {MOH_PROFESSION_OPTIONS.map(entry => (entry.kind === 'group' ? (
                                                                        <optgroup key={entry.groupId} label={entry.label}>
                                                                            {entry.options.map(leaf => (
                                                                                <option key={leaf.id} value={leaf.id}>{leaf.name}</option>
                                                                            ))}
                                                                        </optgroup>
                                                                    ) : (
                                                                        <option key={entry.id} value={entry.id}>{entry.name}</option>
                                                                    )))}
                                                                </select>
                                                                {fieldErrors.profession && (
                                                                    <p className="mt-1 text-[10px] font-bold text-red-600 dark:text-red-400">{fieldErrors.profession}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
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
                                            
                                            {/*
                                              * ⚠️ THIS BUTTON USED TO LEAD TO A WALL, AND IT WAS
                                              *    AIMED AT THE ONE PERSON WHO MUST NOT HIT ONE.
                                              *
                                              *    It said "Enterprise / Scale Unit" and opened a
                                              *    panel whose only button was DISABLED and read
                                              *    "Registration Restricted — Contact Admin for
                                              *    whitelisting". That was true when written:
                                              *    multi-tenancy did not exist, so a department
                                              *    could not register itself.
                                              *
                                              *    It has been false since v2.0.0. A department head
                                              *    registers, chooses "Team / department / service
                                              *    lead", declares their department, and an owner
                                              *    approves it — after which they run it themselves.
                                              *
                                              *    The damage was the ROUTING. The two choices on this
                                              *    screen read as "for individual staff" and "for
                                              *    setting up a department". An allied health manager
                                              *    is the second, clicks the second, and meets a
                                              *    permanently disabled button — while the path they
                                              *    want sits behind the first, one dropdown down.
                                              *
                                              *    Kept rather than deleted, because the signpost is
                                              *    well aimed. It now points at the working path and
                                              *    says so in the words a department head uses:
                                              *    nobody thinks of themselves as a scale unit.
                                              */}
                                            <button
                                                onClick={() => {
                                                    setAuthView('REGISTER');
                                                    setRole(ROLE_LEAD);
                                                    setError('');
                                                    setMessage('');
                                                }}
                                                className="text-[10px] font-black text-emerald-600 dark:text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-400 uppercase tracking-widest transition-colors flex items-center justify-center gap-2 w-full"
                                            >
                                                <Globe size={12} /> I run a department — set it up
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
                                    Experience the NEXUS architecture in a sandboxed environment. Access analytics and triage tools without processing live health data.
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
            </div>

            {/* FOOTER */}
            <div className="relative z-10 mt-12 text-center opacity-50 pointer-events-none flex flex-col items-center gap-1">
                <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 tracking-[0.4em] uppercase">
                    © 2026 Muhammad Alif • System {APP_VERSION_LABEL}
                </p>
            </div>

            {/* ANIMATIONS */}
            <style>{`
                @keyframes float-slow {
                    0%, 100% { transform: translate(-50%, -50%); }
                    50% { transform: translate(calc(-50% + 20px), calc(-50% + 40px)); }
                }
                @keyframes float-delayed {
                    0%, 100% { transform: translate(33%, 33%); }
                    50% { transform: translate(calc(33% - 30px), calc(33% - 20px)); }
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
