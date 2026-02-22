import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { db } from '../firebase'; 
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, setDoc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { 
    X, Send, BrainCircuit, Shield, Ghost, Users, Zap, RefreshCw, AlertTriangle, WifiOff
} from 'lucide-react';
import { useNexus } from '../context/NexusContext';

// ─── CLOUD FUNCTION LINK ──────────────────────────────────────────────────────
const functions = getFunctions(undefined, 'us-central1');
const secureChatWithAura = httpsCallable(functions, 'chatWithAura');

// ─── PHASE CONFIG ─────────────────────────────────────────────────────────────
// Energy ranges mirror the backend system prompt exactly.
// If the AI returns a value outside the range for its phase, we clamp it.
const PHASE_CONFIG = {
    HEALTHY:  { min: 80, max: 100, badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: '💚', label: 'Healthy' },
    REACTING: { min: 50, max: 79,  badge: 'bg-yellow-50  text-yellow-700  border-yellow-200',  icon: '⚡', label: 'Reacting' },
    INJURED:  { min: 20, max: 49,  badge: 'bg-orange-50  text-orange-700  border-orange-200',  icon: '🔶', label: 'Injured' },
    ILL:      { min: 0,  max: 19,  badge: 'bg-red-50     text-red-700     border-red-200',     icon: '🔴', label: 'Ill' },
};

const getPhaseConfig = (phase) => PHASE_CONFIG[phase?.toUpperCase()] ?? {
    badge: 'bg-slate-100 text-slate-600 border-slate-200', icon: '⬜', label: phase ?? 'Unknown',
};

/**
 * Clamps energy to the valid range for the given phase.
 * Guards against hallucinated values (e.g. phase=HEALTHY but energy=30).
 */
const clampEnergy = (phase, energy) => {
    const cfg = PHASE_CONFIG[phase?.toUpperCase()];
    if (!cfg) return Math.max(0, Math.min(100, energy));
    return Math.max(cfg.min, Math.min(cfg.max, energy));
};

// ─── PERSONAS ────────────────────────────────────────────────────────────────
// `prompt` is persona context only — the full AURA system prompt lives server-side.
const PERSONAS = [
    {
        id: 'peter', name: 'Peter', title: 'Junior Staff',
        color: 'bg-blue-500', baseEnergy: 65,
        prompt: 'Peter is a junior staff member: eager but overwhelmed by his clinical rotation workload. Struggling with pacing and documentation speed.',
    },
    {
        id: 'steve', name: 'Steve', title: 'Senior Clinician',
        color: 'bg-indigo-500', baseEnergy: 55,
        prompt: 'Steve is a veteran senior clinician facing compassion fatigue from sustained high patient volume. He needs peer-level validation, not top-down advice.',
    },
    {
        id: 'tony', name: 'Tony', title: 'Team Lead',
        color: 'bg-slate-700', baseEnergy: 42,
        prompt: 'Tony is a team lead under heavy strategic planning pressure. He is experiencing decision fatigue and struggling to delegate effectively.',
    },
    {
        id: 'charles', name: 'Charles', title: 'Deptartment Head',
        color: 'bg-amber-600', baseEnergy: 38,
        prompt: 'Charles is a department head balancing compliance demands with dropping staff morale. He feels isolated at the top of decision-making.',
    },
    {
        id: 'jean', name: 'Jean', title: 'Research Lead',
        color: 'bg-pink-600', baseEnergy: 48,
        prompt: 'Jean is a research lead under intense grant deadline pressure. Cognitive fatigue is building and her sleep hygiene has been disrupted by late writing sessions.',
    },
    {
        id: 'anon', name: 'Anonymous', title: 'Ghost Protocol',
        color: 'bg-purple-600', baseEnergy: 50,
        prompt: 'This is an anonymous Ghost Protocol session. The user has requested strict confidentiality. Do not ask for identifying details. Prioritise psychological safety above all else.',
    },
];

const MAX_INPUT       = 500;
const SEND_COOLDOWN_MS = 2000;

// =============================================================================
// COMPONENT
// =============================================================================
export default function AuraPulseBot({ user }) {
    const { isDemo } = useNexus();

    // ── State ─────────────────────────────────────────────────────────────────
    const [isOpen, setIsOpen] = useState(false);
    const [view,            setView]            = useState('SELECT');
    const [selectedPersona, setSelectedPersona] = useState(null);
    const [messages,        setMessages]        = useState([]);
    const [input,           setInput]           = useState('');
    const [loading,         setLoading]         = useState(false);
    const [isSending,       setIsSending]       = useState(false);
    const [pendingLog,      setPendingLog]      = useState(null);
    const [isOnline,        setIsOnline]        = useState(navigator.onLine);

    // ── Refs ──────────────────────────────────────────────────────────────────
    const messagesEndRef = useRef(null);
    const inputRef       = useRef(null);
    const lastSendRef    = useRef(0);
    const timeoutsRef    = useRef([]);

    const safeTimeout = useCallback((fn, ms) => {
        const id = setTimeout(fn, ms);
        timeoutsRef.current.push(id);
        return id;
    }, []);

    // ── Cleanup on unmount ────────────────────────────────────────────────────
    useEffect(() => () => timeoutsRef.current.forEach(clearTimeout), []);

    // ── Online status ─────────────────────────────────────────────────────────
    useEffect(() => {
        const on  = () => setIsOnline(true);
        const off = () => setIsOnline(false);
        window.addEventListener('online',  on);
        window.addEventListener('offline', off);
        return () => {
            window.removeEventListener('online',  on);
            window.removeEventListener('offline', off);
        };
    }, []);

    // ── Auto-scroll ───────────────────────────────────────────────────────────
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading, pendingLog]);

    // ── Live user memory ──────────────────────────────────────────────────────
    // Loaded once on session start. Passed as context to the Cloud Function
    // so AURA can reference prior sessions ("Last time you mentioned...").
    const [liveMemory, setLiveMemory] = useState(null);

    // ── Session start ─────────────────────────────────────────────────────────
    const startSession = useCallback((persona) => {
        setSelectedPersona(persona);
        setPendingLog(null);

        const isAnon = persona.id === 'anon';

        // For live users, persona.memory is set by initLiveSession if it exists
        let greeting;
        if (isDemo) {
            greeting = isAnon
                ? '🔒 Ghost Protocol engaged. Your identity is masked. AURA is listening. How are you feeling right now?'
                : `[SIMULATION] Hello ${persona.name}. AURA Pulse active. As a ${persona.title}, how is your wellbeing today?`;
        } else if (persona.memory) {
            // Returning user — acknowledge past session
            greeting = `Welcome back, ${(user?.name ?? 'there').split(' ')[0]}. Last time we spoke, I noted: "${persona.memory}". How are you feeling today?`;
        } else {
            // First session
            greeting = `Hello ${(user?.name ?? 'there').split(' ')[0]}. AURA Pulse is active. "Master the grind. Protect the pulse." How are you feeling right now?`;
        }

        setMessages([{ role: 'bot', text: greeting, isGreeting: true }]);
        setView('CHAT');
        safeTimeout(() => inputRef.current?.focus(), 300);
    }, [isDemo, user, safeTimeout]);

    // Auto-start live session on panel open for real (non-demo) users.
    // [GAP-02 FIX] Loads aura_memory from Firestore before starting so AURA
    // has prior session context to reference.
    useEffect(() => {
        if (isOpen && !isDemo && user && view === 'SELECT') {
            const initLiveSession = async () => {
                let memory = null;
                if (user?.id) {
                    try {
                        const snap = await getDoc(doc(db, 'users', user.id));
                        if (snap.exists()) {
                            memory = snap.data()?.aura_memory ?? null;
                            if (memory) setLiveMemory(memory);
                        }
                    } catch (e) {
                        // Non-fatal: proceed without memory rather than blocking the session
                        console.warn('[AURA] Memory fetch failed — starting stateless.', e);
                    }
                }
                startSession({ name: user.name, title: user.title ?? 'Staff', id: user.id, prompt: '', memory });
            };
            initLiveSession();
        }
        if (!isOpen && isDemo) {
            setView('SELECT');
            setSelectedPersona(null);
            setMessages([]);
            setPendingLog(null);
            setLiveMemory(null);
            setIsSending(false);
        }
    }, [isOpen, isDemo, user, view, startSession]);

    // ── Send handler ──────────────────────────────────────────────────────────
    const handleSend = useCallback(async () => {
        const text = input.trim().slice(0, MAX_INPUT);
        if (!text || loading || isSending || !isOnline) return;

        // Rate limit: prevent spam
        const now = Date.now();
        if (now - lastSendRef.current < SEND_COOLDOWN_MS) return;
        lastSendRef.current = now;

        setIsSending(true);
        setMessages(prev => [...prev, { role: 'user', text }]);
        setInput('');
        setLoading(true);
        setPendingLog(null);

        try {
            // Clean history: exclude greetings, errors, confirmation messages.
            // Ensure history always starts with a user turn (Gemini API requirement).
            const rawHistory = messages.filter(
                m => !m.isGreeting && !m.isError && !m.text.startsWith('✅')
            );
            const firstUserIdx = rawHistory.findIndex(m => m.role === 'user');
            const history = (firstUserIdx === -1 ? [] : rawHistory.slice(firstUserIdx))
                .map(m => ({
                    role:  m.role === 'bot' ? 'model' : 'user',
                    parts: [{ text: m.text }],
                }));

            // [GAP-03 FIX] Build context prompt for both modes:
            // - Sandbox: use the persona's rich situational prompt
            // - Live: build from the user's actual role + any past memory from Firestore
            const contextPrompt = isDemo
                ? (selectedPersona?.prompt ?? '')
                : [
                    user?.title ? `This staff member is a ${user.title} at KKH/SingHealth.` : '',
                    user?.department ? `Department: ${user.department}.` : '',
                    liveMemory ? `Prior session note: "${liveMemory}".` : 'This is their first session with AURA.',
                  ].filter(Boolean).join(' ');

            const result = await secureChatWithAura({
                userText: text,
                history,
                role:   selectedPersona?.title ?? user?.title ?? 'Staff',
                prompt: contextPrompt,
                isDemo,
            });

            // ── Parse response ─────────────────────────────────────────────
            let analysis;
            try {
                const raw      = result.data?.text ?? '';
                const stripped = raw.replace(/```json|```/g, '').trim();
                const start    = stripped.indexOf('{');
                const end      = stripped.lastIndexOf('}') + 1;
                if (start === -1 || end === 0) throw new Error('No JSON object found');
                analysis = JSON.parse(stripped.substring(start, end));
            } catch {
                throw new Error('AURA returned an unreadable format. Please try again.');
            }

            if (!analysis || !analysis.reply) {
                throw new Error('Incomplete response from AURA.');
            }

            // Always show AURA's message
            setMessages(prev => [...prev, { role: 'bot', text: analysis.reply }]);

            // FIX: Only trigger the Pulse Card if AURA is ready to diagnose
            if (analysis.diagnosis_ready && analysis.phase && analysis.phase !== 'null' && analysis.phase !== 'NULL') {
                const safeEnergy = clampEnergy(analysis.phase, analysis.energy ?? 50);
                setPendingLog({
                    phase:  analysis.phase.toUpperCase(),
                    energy: safeEnergy,
                    action: analysis.action ?? '',
                });
            }

        } catch (error) {
            console.error('[AURA] Link Error:', error.message);
            setMessages(prev => [...prev, {
                role:    'bot',
                text:    '⚠️ Neural link unstable. I am having trouble processing that right now. Please try again in a moment.',
                isError: true,
            }]);
        } finally {
            setLoading(false);
            setIsSending(false);
        }
    }, [input, loading, isSending, isOnline, messages, selectedPersona, isDemo]);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter' && !e.repeat) handleSend();
    }, [handleSend]);

    // ── Confirm and sync log ──────────────────────────────────────────────────
    const confirmLog = useCallback(async () => {
        if (!pendingLog) return;
        setLoading(true);

        const timestamp   = new Date().toISOString();
        const displayDate = new Date().toLocaleDateString();
        const activeUser  = isDemo ? selectedPersona : user;

        try {
            const logData = {
                timestamp, displayDate, isDemo,
                energy:  pendingLog.energy,
                phase:   pendingLog.phase,
                action:  pendingLog.action,
            };

            const heatmapPayload = {
                energy:     pendingLog.energy,
                phase:      pendingLog.phase,
                role:       activeUser?.title,
                lastUpdate: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status:     isDemo ? 'demo-active' : 'checked-in',
            };

            if (isDemo || selectedPersona?.id === 'anon') {
                const heatKey = isDemo
                    ? (activeUser?.name ?? 'Demo')
                    : `Anon_${Math.floor(Math.random() * 9999)}`;
                const anonRef = doc(db, 'wellbeing_history', '_anonymous_logs');
                await setDoc(anonRef, { last_updated: timestamp }, { merge: true });
                await updateDoc(anonRef, { logs: arrayUnion(logData) });
                await setDoc(doc(db, 'system_data', 'daily_pulse'), { [heatKey]: heatmapPayload }, { merge: true });
            } else if (user?.id) {
                await setDoc(doc(db, 'wellbeing_history', user.id), { logs: arrayUnion(logData) }, { merge: true });
                await setDoc(doc(db, 'system_data', 'daily_pulse'), { [user.name]: heatmapPayload }, { merge: true });
                await setDoc(doc(db, 'users', user.id), {
                    aura_last_phase:    pendingLog.phase,
                    // [GAP-02 FIX] Save action as memory so next session has context
                    aura_memory:        pendingLog.action,
                    last_interaction:   new Date(),
                }, { merge: true });
                // Update local memory state so it's available if user sends more messages
                setLiveMemory(pendingLog.action);
            }

            setMessages(prev => [...prev, {
                role: 'bot',
                text: '✅ Insights synced to your dashboard. Take care of yourself today.',
            }]);
            setPendingLog(null);
            safeTimeout(() => setIsOpen(false), 2500);

        } catch (err) {
            console.error('[AURA] Sync failed:', err);
            setMessages(prev => [...prev, {
                role:    'bot',
                text:    '⚠️ Could not sync your pulse log. Please check your connection and try again.',
                isError: true,
            }]);
        } finally {
            setLoading(false);
        }
    }, [pendingLog, isDemo, selectedPersona, user, safeTimeout]);

    // ── Derived values ────────────────────────────────────────────────────────
    const isAnonymous = selectedPersona?.id === 'anon';
    const inputLength = input.length;
    const isNearLimit = inputLength > MAX_INPUT * 0.8;

    // ==========================================================================
    // RENDER
    // ==========================================================================
    return (

            <div className="fixed bottom-24 right-4 lg:bottom-6 lg:right-6 z-50 flex flex-col items-end drop-shadow-2xl">    
            
    {/* ── CHAT PANEL ─────────────────────────────────────────────────── */}
            {isOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="AURA Pulse wellbeing assistant"
                    className="mb-4 w-[380px] h-[660px] bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 zoom-in-95 duration-300"
                >
                    {/* ── Header ─────────────────────────────────────────────── */}
                    <div className={`p-5 text-white flex justify-between items-center bg-gradient-to-r ${isAnonymous ? 'from-purple-800 to-indigo-900' : 'from-slate-900 to-indigo-950'}`}>
                        <div className="flex items-center gap-3">
                            {isAnonymous
                                ? <Ghost size={20} className="text-purple-300 animate-pulse" aria-hidden />
                                : <BrainCircuit size={20} className="text-indigo-400 animate-pulse" aria-hidden />
                            }
                            <div>
                                <h3 className="font-bold text-xs uppercase tracking-widest">
                                    {isAnonymous ? 'Ghost Protocol' : 'AURA Pulse'}
                                </h3>
                                <p className="text-[9px] opacity-60 uppercase tracking-tight">
                                    {isDemo ? 'Full AI Simulation' : (isOnline ? 'Secure Live Link' : 'Offline')}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            {!isOnline && <WifiOff size={13} className="text-yellow-300" aria-label="You are offline" />}
                            <button
                                onClick={() => setIsOpen(false)}
                                aria-label="Close AURA"
                                className="p-1.5 hover:bg-white/20 rounded-lg transition-all"
                            >
                                <X size={18} aria-hidden />
                            </button>
                        </div>
                    </div>

                    {/* ── Offline banner ─────────────────────────────────────── */}
                    {!isOnline && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-700">
                            <WifiOff size={12} className="text-yellow-600 flex-shrink-0" aria-hidden />
                            <p className="text-[10px] font-semibold text-yellow-700 dark:text-yellow-300">
                                You are offline. AURA cannot process new requests until reconnected.
                            </p>
                        </div>
                    )}

                    {/* ── Scroll area ────────────────────────────────────────── */}
                    <div className="flex-1 overflow-y-auto p-5 bg-slate-50 dark:bg-slate-950/50 scroll-smooth">

                        {/* PERSONA GRID (Demo only) */}
                        {view === 'SELECT' && isDemo ? (
                            <div className="space-y-5 animate-in fade-in duration-300">
                                <div className="text-center">
                                    <div className="w-10 h-10 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto mb-2 border border-indigo-500/20">
                                        <Users size={20} className="text-indigo-500" aria-hidden />
                                    </div>
                                    <h2 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-tighter">
                                        Identity Matrix
                                    </h2>
                                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mt-0.5">
                                        Select a persona
                                    </p>
                                </div>

                                <div role="listbox" aria-label="Select persona" className="grid grid-cols-2 gap-3">
                                    {PERSONAS.map(p => (
                                        <button
                                            key={p.id}
                                            role="option"
                                            onClick={() => startSession(p)}
                                            className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 hover:shadow-md hover:-translate-y-0.5 transition-all text-left focus-visible:outline-2 focus-visible:outline-indigo-500"
                                        >
                                            <div className={`w-7 h-7 ${p.color} rounded-full mb-2.5 ring-2 ring-white dark:ring-slate-700`} aria-hidden />
                                            <h4 className="text-[11px] font-black text-slate-900 dark:text-white uppercase truncate">{p.name}</h4>
                                            <p className="text-[9px] text-slate-400 font-semibold uppercase truncate mb-2">{p.title}</p>
                                            <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-0.5" aria-hidden>
                                                <div className={`${p.color} h-0.5 rounded-full`} style={{ width: `${p.baseEnergy}%` }} />
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                <p className="text-center text-[9px] text-indigo-500 font-semibold">
                                    Simulation mode: actions generate live signals on the Admin Heatmap.
                                </p>
                            </div>

                        ) : (
                            /* CHAT VIEW */
                            <div className="space-y-4">

                                {messages.map((m, i) => (
                                    <div key={i} className={`flex ${m.role === 'bot' ? 'justify-start' : 'justify-end'} animate-in fade-in slide-in-from-bottom-1`}>
                                        <div
                                            aria-live={m.role === 'bot' ? 'polite' : undefined}
                                            className={`max-w-[87%] px-4 py-3.5 rounded-[1.5rem] text-sm leading-relaxed shadow-sm ${
                                                m.role === 'bot'
                                                    ? m.isError
                                                        ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 rounded-tl-none border border-red-200'
                                                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-tl-none border border-slate-100 dark:border-slate-700'
                                                    : isAnonymous
                                                        ? 'bg-purple-600 text-white rounded-tr-none'
                                                        : 'bg-indigo-600 text-white rounded-tr-none'
                                            }`}
                                        >
                                            {m.isError && <AlertTriangle size={13} className="inline mr-1.5 mb-0.5 text-red-500" aria-hidden />}
                                            {m.text}
                                        </div>
                                    </div>
                                ))}

                                {/* PULSE LOG CARD */}
                                {pendingLog && (() => {
                                    const cfg = getPhaseConfig(pendingLog.phase);
                                    return (
                                        <div
                                            role="dialog"
                                            aria-label="Wellbeing analysis result"
                                            className="mx-0.5 bg-white dark:bg-slate-800 rounded-2xl border-2 border-indigo-100 dark:border-slate-700 p-5 shadow-xl animate-in zoom-in-95"
                                        >
                                            <div className="flex justify-between items-center mb-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                                                <span className="flex items-center gap-1.5">
                                                    <Zap size={12} className="text-amber-500 animate-bounce" aria-hidden />
                                                    Pulse Reading
                                                </span>
                                                <span className="text-[9px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-100 dark:border-indigo-800 font-bold">
                                                    5A Protocol
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3 mb-4">
                                                <div className={`p-3 rounded-xl border text-center ${cfg.badge}`}>
                                                    <div className="text-[8px] font-black uppercase opacity-60 mb-1">Zone</div>
                                                    <div className="text-xs font-black">{cfg.icon} {cfg.label}</div>
                                                </div>
                                                <div className="p-3 rounded-xl border bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800 text-center">
                                                    <div className="text-[8px] font-black uppercase opacity-60 mb-1">Energy</div>
                                                    <div className="text-xs font-black mb-1.5">{pendingLog.energy}%</div>
                                                    <div className="w-full bg-blue-100 dark:bg-blue-900 rounded-full h-1">
                                                        <div
                                                            className="bg-blue-500 h-1 rounded-full transition-all duration-700"
                                                            style={{ width: `${pendingLog.energy}%` }}
                                                            role="progressbar"
                                                            aria-valuenow={pendingLog.energy}
                                                            aria-valuemin={0}
                                                            aria-valuemax={100}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {pendingLog.action && (
                                                <div className="bg-slate-50 dark:bg-slate-900/80 p-3.5 rounded-xl mb-4 border border-slate-100 dark:border-slate-800 text-center">
                                                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Recommended Action</p>
                                                    <p className="text-xs italic font-medium text-slate-600 dark:text-slate-300">"{pendingLog.action}"</p>
                                                </div>
                                            )}

                                            {/* ILL phase: surface a gentle referral nudge */}
                                            {pendingLog.phase === 'ILL' && (
                                                <div className="mb-4 px-3.5 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                                                    <p className="text-[10px] text-red-600 dark:text-red-300 font-semibold text-center leading-relaxed">
                                                        You do not have to carry this alone. Please reach out to your Employee Assistance Programme or a trusted colleague today.
                                                    </p>
                                                </div>
                                            )}

                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setPendingLog(null)}
                                                    aria-label="Dismiss pulse reading"
                                                    className="flex-1 py-2.5 text-xs font-black text-slate-500 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-1.5"
                                                >
                                                    <X size={12} aria-hidden /> Dismiss
                                                </button>
                                                <button
                                                    onClick={confirmLog}
                                                    disabled={loading}
                                                    aria-label="Sync pulse to dashboard"
                                                    className={`flex-[2] py-2.5 text-white text-xs font-black rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 ${
                                                        isAnonymous
                                                            ? 'bg-purple-600 hover:bg-purple-700'
                                                            : 'bg-indigo-600 hover:bg-indigo-700'
                                                    }`}
                                                >
                                                    {loading
                                                        ? <RefreshCw size={13} className="animate-spin" aria-hidden />
                                                        : <Shield size={13} aria-hidden />
                                                    }
                                                    {isAnonymous ? 'Confirm Ghost Log' : 'Sync to Dashboard'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Typing indicator */}
                                {loading && (
                                    <div
                                        role="status"
                                        aria-live="polite"
                                        aria-label="AURA is thinking"
                                        className="flex items-center gap-2 text-[10px] font-bold text-slate-400 animate-pulse pl-1"
                                    >
                                        <span className="flex gap-1" aria-hidden>
                                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
                                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
                                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
                                        </span>
                                        AURA is thinking...
                                    </div>
                                )}

                                <div ref={messagesEndRef} className="h-1" aria-hidden />
                            </div>
                        )}
                    </div>

                    {/* ── Input bar ──────────────────────────────────────────── */}
                    {view === 'CHAT' && (
                        <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0">
                            {isNearLimit && (
                                <p
                                    className={`text-[9px] font-bold text-right mb-1 ${inputLength >= MAX_INPUT ? 'text-red-500' : 'text-amber-500'}`}
                                    aria-live="polite"
                                >
                                    {inputLength} / {MAX_INPUT}
                                </p>
                            )}
                            <div className={`flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-full pl-5 pr-3 py-3 border transition-all ${
                                loading || isSending
                                    ? 'opacity-60 border-slate-200 dark:border-slate-700'
                                    : `border-slate-200 dark:border-slate-700 focus-within:border-${isAnonymous ? 'purple' : 'indigo'}-500`
                            }`}>
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={input}
                                    onChange={e => setInput(e.target.value.slice(0, MAX_INPUT))}
                                    onKeyDown={handleKeyDown}
                                    placeholder={
                                        loading || isSending ? 'AURA is thinking...'
                                        : isAnonymous        ? 'Ghost Mode active. Share how you feel...'
                                        : 'Describe how you are feeling...'
                                    }
                                    className="flex-1 bg-transparent text-sm text-slate-700 dark:text-white outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
                                    disabled={loading || isSending || !isOnline}
                                    aria-label="Message input"
                                    autoComplete="off"
                                    spellCheck
                                    maxLength={MAX_INPUT}
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!input.trim() || loading || isSending || !isOnline}
                                    aria-label="Send message"
                                    className={`p-2 rounded-full transition-all active:scale-90 disabled:opacity-30 ${
                                        isAnonymous
                                            ? 'text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20'
                                            : 'text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                                    }`}
                                >
                                    <Send size={17} aria-hidden />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── FAB ──────────────────────────────────────────────────────── */}
            <button
                onClick={() => setIsOpen(o => !o)}
                aria-label={isOpen ? 'Close AURA Pulse' : 'Open AURA Pulse wellbeing assistant'}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
                className={`w-16 h-16 rounded-full shadow-2xl text-white flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 ${
                    isOpen
                        ? 'bg-slate-800 rotate-90'
                        : isAnonymous
                            ? 'bg-purple-700 shadow-purple-600/30'
                            : 'bg-indigo-600 shadow-indigo-600/30'
                }`}
            >
                {isOpen ? <X size={26} aria-hidden /> : <BrainCircuit size={28} aria-hidden />}
            </button>
        </div>
    );
}
