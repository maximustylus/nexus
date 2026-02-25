import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../firebase'; 
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, setDoc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { X, Send, BrainCircuit, Shield, Ghost, Users, Zap, RefreshCw, AlertTriangle, WifiOff, FileText, CheckCircle, Database } from 'lucide-react';
import { useNexus } from '../context/NexusContext';

// ─── CLOUD FUNCTION LINK ──────────────────────────────────────────────────────
const functions = getFunctions(undefined, 'us-central1');
const secureChatWithAura = httpsCallable(functions, 'chatWithAura');

// ─── PHASE CONFIG ─────────────────────────────────────────────────────────────
const PHASE_CONFIG = {
    HEALTHY:  { min: 80, max: 100, badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: '💚', label: 'Healthy' },
    REACTING: { min: 50, max: 79,  badge: 'bg-yellow-50  text-yellow-700  border-yellow-200',  icon: '⚡', label: 'Reacting' },
    INJURED:  { min: 20, max: 49,  badge: 'bg-orange-50  text-orange-700  border-orange-200',  icon: '🔶', label: 'Injured' },
    ILL:      { min: 0,  max: 19,  badge: 'bg-red-50     text-red-700     border-red-200',     icon: '🔴', label: 'Ill' },
};

const getPhaseConfig = (phase) => PHASE_CONFIG[phase?.toUpperCase()] ?? {
    badge: 'bg-slate-100 text-slate-600 border-slate-200', icon: '⬜', label: phase ?? 'Unknown',
};

const clampEnergy = (phase, energy) => {
    const cfg = PHASE_CONFIG[phase?.toUpperCase()];
    if (!cfg) return Math.max(0, Math.min(100, energy));
    return Math.max(cfg.min, Math.min(cfg.max, energy));
};

// ─── PERSONAS ────────────────────────────────────────────────────────────────
const PERSONAS = [
    { id: 'peter', name: 'Peter', title: 'Junior Staff', color: 'bg-blue-500', baseEnergy: 65, prompt: 'Peter is a junior staff member: eager but overwhelmed by his clinical rotation workload. Struggling with pacing and documentation speed.' },
    { id: 'steve', name: 'Steve', title: 'Senior Clinician', color: 'bg-indigo-500', baseEnergy: 55, prompt: 'Steve is a veteran senior clinician facing compassion fatigue from sustained high patient volume. He needs peer-level validation, not top-down advice.' },
    { id: 'tony', name: 'Tony', title: 'Team Lead', color: 'bg-slate-700', baseEnergy: 42, prompt: 'Tony is a team lead under heavy strategic planning pressure. He is experiencing decision fatigue and struggling to delegate effectively.' },
    { id: 'charles', name: 'Charles', title: 'Deptartment Head', color: 'bg-amber-600', baseEnergy: 38, prompt: 'Charles is a department head balancing compliance demands with dropping staff morale. He feels isolated at the top of decision-making.' },
    { id: 'jean', name: 'Jean', title: 'Research Lead', color: 'bg-pink-600', baseEnergy: 48, prompt: 'Jean is a research lead under intense grant deadline pressure. Cognitive fatigue is building and her sleep hygiene has been disrupted by late writing sessions.' },
    { id: 'anon', name: 'Anonymous', title: 'Ghost Protocol', color: 'bg-purple-600', baseEnergy: 50, prompt: 'This is an anonymous Ghost Protocol session. The user has requested strict confidentiality. Do not ask for identifying details. Prioritise psychological safety above all else.' },
];

const MAX_INPUT       = 500;
const SEND_COOLDOWN_MS = 2000;

// =============================================================================
// COMPONENT
// =============================================================================
export default function AuraPulseBot({ user }) {
    const { isDemo, auraHistory, setAuraHistory } = useNexus();

    // ── State ─────────────────────────────────────────────────────────────────
    const [isOpen, setIsOpen] = useState(false);
    const [view,             setView]             = useState('SELECT');
    const [selectedPersona, setSelectedPersona] = useState(null); 
    const [input,            setInput]            = useState('');
    const [loading,          setLoading]          = useState(false);
    const [isSending,        setIsSending]        = useState(false);
    const [pendingLog,       setPendingLog]       = useState(null);
    const [isOnline,         setIsOnline]         = useState(navigator.onLine);
    const [liveMemory,       setLiveMemory]       = useState(null);
    const messages = auraHistory;
    const setMessages = setAuraHistory;   

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

    useEffect(() => () => timeoutsRef.current.forEach(clearTimeout), []);

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

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading, pendingLog]);

    // ── Session start ─────────────────────────────────────────────────────────
    const startSession = useCallback((persona) => {
        setSelectedPersona(persona);
        setPendingLog(null);

        const isAnon = persona.id === 'anon';
        let greeting;
        if (isDemo) {
            greeting = isAnon
                ? '🔒 Ghost Protocol engaged. Your identity is masked. How can I support you today?'
                : `[SIMULATION] Hi ${persona.name}. AURA here. What kind of support do you need today?`;
        } else if (persona.memory) {
            greeting = `Welcome back, ${(user?.name ?? 'there').split(' ')[0]}. Last time we spoke, I noted: "${persona.memory}". How can I support your workflow or wellbeing today?`;
        } else {
            greeting = `Hi ${(user?.name ?? 'there').split(' ')[0]}. AURA here. What kind of support do you need today?`;
        }

        setMessages([{ role: 'bot', text: greeting, isGreeting: true, mode: 'NEUTRAL' }]);
        setView('CHAT');
        safeTimeout(() => inputRef.current?.focus(), 300);
    }, [isDemo, user, safeTimeout]);

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
    const handleSend = useCallback(async (overrideText = null) => {
        const rawText = typeof overrideText === 'string' ? overrideText : input;
        const text = rawText.trim().slice(0, MAX_INPUT);
        
        if (!text || loading || isSending || !isOnline) return;

        const now = Date.now();
        if (now - lastSendRef.current < SEND_COOLDOWN_MS) return;
        lastSendRef.current = now;

        setIsSending(true);
        setMessages(prev => [...prev, { role: 'user', text }]);
        if (typeof overrideText !== 'string') setInput('');
        setLoading(true);
        setPendingLog(null);

        try {
            const rawHistory = messages.filter(
                m => !m.isGreeting && !m.isError && !m.text.startsWith('✅')
            );
            const firstUserIdx = rawHistory.findIndex(m => m.role === 'user');
            const history = (firstUserIdx === -1 ? [] : rawHistory.slice(firstUserIdx))
                .map(m => ({
                    role:  m.role === 'bot' ? 'model' : 'user',
                    parts: [{ text: m.text }],
                }));

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

            setMessages(prev => [...prev, { 
                role: 'bot', 
                text: analysis.reply,
                mode: analysis.mode || 'COACH',
                action: analysis.action,
                db_workload: analysis.db_workload 
            }]);

            if (analysis.mode === 'COACH' && analysis.diagnosis_ready && analysis.phase && analysis.phase !== 'null' && analysis.phase !== 'NULL') {
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
    }, [input, loading, isSending, isOnline, messages, selectedPersona, isDemo, liveMemory, user]);

    const handleKeyDown = useCallback((e) => {
            if (e.key === 'Enter' && !e.repeat) {
                e.preventDefault();
                handleSend();
            }
        }, [handleSend]);

    // ── Confirm & Sync Pulse Log (Mode 1) ────────────────────────────────────
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
                const heatKey = isDemo ? (activeUser?.name ?? 'Demo') : `Anon_${Math.floor(Math.random() * 9999)}`;
                const anonRef = doc(db, 'wellbeing_history', '_anonymous_logs');
                await setDoc(anonRef, { last_updated: timestamp }, { merge: true });
                await updateDoc(anonRef, { logs: arrayUnion(logData) });
                await setDoc(doc(db, 'system_data', 'daily_pulse'), { [heatKey]: heatmapPayload }, { merge: true });
            } else if (user?.id) {
                await setDoc(doc(db, 'wellbeing_history', user.id), { logs: arrayUnion(logData) }, { merge: true });
                await setDoc(doc(db, 'system_data', 'daily_pulse'), { [user.name]: heatmapPayload }, { merge: true });
                await setDoc(doc(db, 'users', user.id), {
                    aura_last_phase:    pendingLog.phase,
                    aura_memory:        pendingLog.action,
                    last_interaction:   new Date(),
                }, { merge: true });
                setLiveMemory(pendingLog.action);
            }

            setMessages(prev => [...prev, {
                role: 'bot', text: '✅ Insights synced to your dashboard. Take care of yourself today.', mode: 'COACH'
            }]);
            setPendingLog(null);
            safeTimeout(() => setIsOpen(false), 2500);

        } catch (err) {
            console.error('[AURA] Sync failed:', err);
            setMessages(prev => [...prev, {
                role: 'bot', text: '⚠️ Could not sync your pulse log. Please check your connection and try again.', isError: true, mode: 'COACH'
            }]);
        } finally {
            setLoading(false);
        }
    }, [pendingLog, isDemo, selectedPersona, user, safeTimeout]);

    // ── Confirm Admin Document (Mode 2) ──────────────────────────────────────
    const confirmAdminAction = useCallback(async (actionText) => {
        if (!actionText) return;
        setLoading(true);

        const timestamp   = new Date().toISOString();
        const displayDate = new Date().toLocaleDateString();
        const activeUser  = isDemo ? selectedPersona : user;
        const docId       = `doc_${Date.now()}`; 

        try {
            await setDoc(doc(db, 'smart_database', docId), {
                timestamp, displayDate,
                author: activeUser?.name || 'Anonymous',
                role: activeUser?.title || 'Staff',
                content: actionText,
                type: 'AURA_GENERATED_DOC',
                isDemo
            });

            setMessages(prev => [...prev, {
                role: 'bot', text: '✅ Document securely routed to the Smart Database. You can access it from the admin panel.', mode: 'ASSISTANT'
            }]);
        } catch (err) {
            console.error('[AURA] DB Save failed:', err);
            setMessages(prev => [...prev, {
                role: 'bot', text: '⚠️ Could not save to the Smart Database. Please check your connection.', isError: true, mode: 'ASSISTANT'
            }]);
        } finally {
            setLoading(false);
        }
    }, [isDemo, selectedPersona, user]);

    // ── Execute Precise Data Entry (Mode 3) ──────────────────────────────────
    const executeDataEntry = useCallback(async (workload) => {
        if (!workload || !workload.target_collection) return;
        setLoading(true);

        try {
            const collectionName = isDemo ? `demo_${workload.target_collection}` : workload.target_collection;
            
            // 🛡️ SAFETY CHECK 1: Prevent null documents
            if (!workload.target_doc || workload.target_doc === 'null') {
                 throw new Error("Missing target document. Please ask AURA to clarify who this is for.");
            }
            const docRef = doc(db, collectionName, workload.target_doc);

            let updatedMessage = '';

            // 🛡️ SMART ARRAY HANDLING FOR STAFF LOADS
            if (workload.target_collection === 'staff_loads') {
                
                // 🛡️ SAFETY CHECK 2: Force a valid month index
                const monthIndex = parseInt(workload.target_month);
                if (isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
                    throw new Error("A valid month (e.g., January) is required to update personal workload.");
                }

                // 1. Fetch the existing 12-month array
                const docSnap = await getDoc(docRef);
                let currentData = Array(12).fill(0);
                
                if (docSnap.exists() && Array.isArray(docSnap.data().data)) {
                    currentData = [...docSnap.data().data];
                }

                // 2. Update ONLY the targeted month (safely cast to a Number)
                currentData[monthIndex] = Number(workload.target_value);

                // 3. Save the array back to the database safely
                await setDoc(docRef, {
                    data: currentData,
                    last_updated_by: user?.name || 'AURA System',
                    last_updated_at: new Date().toISOString()
                }, { merge: true });
                
                const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                updatedMessage = `[staff_loads -> ${monthNames[monthIndex]}: ${workload.target_value}]`;

            } else {
                // STANDARD LOGIC: Flat field update (for monthly_workload)
                await setDoc(docRef, {
                    [workload.target_field]: Number(workload.target_value),
                    last_updated_by: user?.name || 'AURA System',
                    last_updated_at: new Date().toISOString()
                }, { merge: true });
                
                updatedMessage = `[${workload.target_collection} -> ${workload.target_field}: ${workload.target_value}]`;
            }

            setMessages(prev => [...prev, {
                role: 'bot',
                text: `✅ Database updated successfully. \n${updatedMessage}`,
                mode: 'DATA_ENTRY'
            }]);

        } catch (err) {
            console.error('[AURA] Data Entry failed:', err);
            setMessages(prev => [...prev, {
                role: 'bot',
                text: `⚠️ Write failed: ${err.message}`,
                isError: true,
                mode: 'DATA_ENTRY'
            }]);
        } finally {
            setLoading(false);
        }
    }, [isDemo, user]);

    const isAnonymous = selectedPersona?.id === 'anon';
    const inputLength = input.length;
    const isNearLimit = inputLength > MAX_INPUT * 0.8;

    return (
        <div className="fixed bottom-24 xl:bottom-6 right-4 xl:right-6 z-50 flex flex-col items-end drop-shadow-2xl">
            {isOpen && (
                <div
                    role="dialog" aria-modal="true" aria-label="AURA Pulse wellbeing assistant"
                    className="mb-4 w-[380px] h-[660px] bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 zoom-in-95 duration-300"
                >
                    {/* Header */}
                    <div className={`p-5 text-white flex justify-between items-center bg-gradient-to-r ${isAnonymous ? 'from-purple-800 to-indigo-900' : 'from-slate-900 to-indigo-950'}`}>
                        <div className="flex items-center gap-3">
                            {isAnonymous ? <Ghost size={20} className="text-purple-300 animate-pulse" /> : <BrainCircuit size={20} className="text-indigo-400 animate-pulse" />}
                            <div>
                                <h3 className="font-bold text-xs uppercase tracking-widest">{isAnonymous ? 'Ghost Protocol' : 'AURA Intelligence'}</h3>
                                <p className="text-[9px] opacity-60 uppercase tracking-tight">{isDemo ? 'Full AI Simulation' : (isOnline ? 'Secure Live Link' : 'Offline')}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            {!isOnline && <WifiOff size={13} className="text-yellow-300" />}
                            <button onClick={() => setIsOpen(false)} aria-label="Close AURA" className="p-1.5 hover:bg-white/20 rounded-lg transition-all">
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {!isOnline && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 border-b border-yellow-200">
                            <WifiOff size={12} className="text-yellow-600 flex-shrink-0" />
                            <p className="text-[10px] font-semibold text-yellow-700">You are offline. AURA cannot process new requests.</p>
                        </div>
                    )}

                    {/* Scroll Area */}
                    <div className="flex-1 overflow-y-auto p-5 bg-slate-50 dark:bg-slate-950/50 scroll-smooth">
                        {view === 'SELECT' && isDemo ? (
                            <div className="space-y-5 animate-in fade-in duration-300">
                                <div className="text-center">
                                    <div className="w-10 h-10 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto mb-2 border border-indigo-500/20">
                                        <Users size={20} className="text-indigo-500" />
                                    </div>
                                    <h2 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-tighter">Identity Matrix</h2>
                                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mt-0.5">Select a persona</p>
                                </div>
                                <div role="listbox" className="grid grid-cols-2 gap-3">
                                    {PERSONAS.map(p => (
                                        <button key={p.id} onClick={() => startSession(p)} className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-indigo-500 hover:-translate-y-0.5 transition-all text-left">
                                            <div className={`w-7 h-7 ${p.color} rounded-full mb-2.5 ring-2 ring-white`} />
                                            <h4 className="text-[11px] font-black text-slate-900 uppercase truncate">{p.name}</h4>
                                            <p className="text-[9px] text-slate-400 font-semibold uppercase truncate mb-2">{p.title}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {messages.map((m, i) => {
                                    // 🛡️ TRI-MODE UI STYLING
                                    const isAssistant = m.mode === 'ASSISTANT';
                                    const isDataEntry = m.mode === 'DATA_ENTRY';
                                    const bubbleStyle = m.role === 'user' 
                                        ? (isAnonymous ? 'bg-purple-600 text-white rounded-tr-none' : 'bg-indigo-600 text-white rounded-tr-none')
                                        : m.isError 
                                            ? 'bg-red-50 text-red-600 rounded-tl-none border border-red-200'
                                            : isDataEntry
                                                ? 'bg-slate-900 text-emerald-50 rounded-tl-none border border-emerald-900 shadow-lg'
                                                : isAssistant 
                                                    ? 'bg-slate-800 text-blue-50 rounded-tl-none border border-slate-700 shadow-lg'
                                                    : 'bg-white text-slate-700 rounded-tl-none border border-slate-100 shadow-sm';

                                    return (
                                        <div key={i} className={`flex ${m.role === 'bot' ? 'justify-start' : 'justify-end'} animate-in fade-in slide-in-from-bottom-1`}>
                                            <div className={`max-w-[87%] px-4 py-3.5 rounded-[1.5rem] text-sm leading-relaxed ${bubbleStyle}`}>
                                                
                                                {/* Assistant Badge */}
                                                {isAssistant && m.role === 'bot' && !m.isGreeting && (
                                                    <div className="flex items-center gap-1.5 mb-2 text-[10px] font-black uppercase tracking-widest text-blue-400">
                                                        <FileText size={12} /> Operations Assist
                                                    </div>
                                                )}
                                                {/* Data Entry Badge */}
                                                {isDataEntry && m.role === 'bot' && !m.isGreeting && (
                                                    <div className="flex items-center gap-1.5 mb-2 text-[10px] font-black uppercase tracking-widest text-emerald-400">
                                                        <Database size={12} /> Database Agent
                                                    </div>
                                                )}

                                                {m.isError && <AlertTriangle size={13} className="inline mr-1.5 mb-0.5 text-red-500" />}
                                                
                                                <div className="whitespace-pre-wrap">{m.text}</div>

                                                {/* 🛡️ QUICK REPLY BUTTONS FOR GREETING */}
                                                {m.isGreeting && m.role === 'bot' && (
                                                    <div className="mt-4 flex flex-col gap-2">
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <button 
                                                                onClick={() => handleSend('I need a wellbeing check-in.')}
                                                                disabled={loading}
                                                                className="py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold rounded-xl transition-colors flex flex-col items-center justify-center gap-1 border border-indigo-200"
                                                            >
                                                                <span className="text-sm">💚</span> Wellbeing
                                                            </button>
                                                            <button 
                                                                onClick={() => handleSend('I need help with administrative tasks.')}
                                                                disabled={loading}
                                                                className="py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold rounded-xl transition-colors flex flex-col items-center justify-center gap-1 border border-blue-200"
                                                            >
                                                                <span className="text-sm">📁</span> Administrative
                                                            </button>
                                                        </div>
                                                        
                                                        {/* Only show the Anonymous button if they aren't already Anonymous */}
                                                        {!isAnonymous && (
                                                            <button 
                                                                onClick={() => startSession(PERSONAS.find(p => p.id === 'anon'))}
                                                                disabled={loading}
                                                                className="w-full mt-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-colors flex items-center justify-center gap-2 border border-slate-200"
                                                            >
                                                                <Ghost size={12} /> Go Anonymous
                                                            </button>
                                                        )}
                                                    </div>
                                                )}

                                                {/* 🛡️ ASSISTANT: Save Document Button */}
                                                {isAssistant && m.action && !m.isGreeting && (
                                                    <div className="mt-4 pt-3 border-t border-slate-600/50">
                                                        <p className="text-[10px] font-medium text-slate-400 mb-2 uppercase tracking-wide">Extracted Data/Action:</p>
                                                        <p className="text-xs text-blue-200 bg-slate-900/50 p-2 rounded-lg mb-3 border border-slate-700 font-mono">{m.action}</p>
                                                        <button 
                                                            onClick={() => confirmAdminAction(m.action)}
                                                            disabled={loading}
                                                            className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[11px] font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2"
                                                        >
                                                            {loading ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />} 
                                                            Save Document
                                                        </button>
                                                    </div>
                                                )}

                                                {/* 🛡️ DATA ENTRY: Commit Workload Button */}
                                                {/* THE FIX: We added strict checks here so it hides if AURA outputs null collections! */}
                                                {isDataEntry && m.db_workload && m.db_workload.target_collection && m.db_workload.target_collection !== 'null' && m.role === 'bot' && !m.isGreeting && (
                                                    <div className="mt-4 pt-3 border-t border-emerald-900/50">
                                                        <p className="text-[10px] font-bold text-emerald-400 mb-2 uppercase tracking-widest flex items-center gap-1">
                                                            <Zap size={12} /> Pending Workload Transaction
                                                        </p>
                                                        <div className="bg-slate-950 p-3 rounded-lg border border-emerald-900/50 font-mono text-[10px] text-slate-300 mb-3 whitespace-pre">
                                                            {`Collection: ${m.db_workload.target_collection}\nDocument:   ${m.db_workload.target_doc}\nField:      ${m.db_workload.target_field}\nValue:      `}
                                                            <span className="text-emerald-400 font-bold">{m.db_workload.target_value}</span>
                                                            
                                                            {/* 🛡️ SHOW THE TARGET MONTH IF IT EXISTS */}
                                                            {m.db_workload.target_month !== undefined && m.db_workload.target_month !== null && (
                                                                <>{`\nMonth Idx:  `}<span className="text-amber-400 font-bold">{m.db_workload.target_month}</span></>
                                                            )}
                                                        </div>
                                                        <button 
                                                            onClick={() => executeDataEntry(m.db_workload)}
                                                            disabled={loading}
                                                            className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2"
                                                        >
                                                            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Shield size={14} />} 
                                                            Commit Workload to Database
                                                        </button>
                                                    </div>
                                                )}

                                            </div>
                                        </div>
                                    );
                                })}

                                {/* PULSE LOG CARD (Coach Mode Only) */}
                                {pendingLog && (() => {
                                    const cfg = getPhaseConfig(pendingLog.phase);
                                    return (
                                        <div className="mx-0.5 bg-white rounded-2xl border-2 border-indigo-100 p-5 shadow-xl animate-in zoom-in-95">
                                            <div className="flex justify-between items-center mb-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                                                <span className="flex items-center gap-1.5"><Zap size={12} className="text-amber-500 animate-bounce" /> Pulse Reading</span>
                                                <span className="text-[9px] bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full border border-indigo-100 font-bold">5A Protocol</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3 mb-4">
                                                <div className={`p-3 rounded-xl border text-center ${cfg.badge}`}>
                                                    <div className="text-[8px] font-black uppercase opacity-60 mb-1">Zone</div>
                                                    <div className="text-xs font-black">{cfg.icon} {cfg.label}</div>
                                                </div>
                                                <div className="p-3 rounded-xl border bg-blue-50 text-blue-700 border-blue-100 text-center">
                                                    <div className="text-[8px] font-black uppercase opacity-60 mb-1">Energy</div>
                                                    <div className="text-xs font-black mb-1.5">{pendingLog.energy}%</div>
                                                    <div className="w-full bg-blue-100 rounded-full h-1">
                                                        <div className="bg-blue-500 h-1 rounded-full transition-all duration-700" style={{ width: `${pendingLog.energy}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                            {pendingLog.action && (
                                                <div className="bg-slate-50 p-3.5 rounded-xl mb-4 border border-slate-100 text-center">
                                                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Recommended Action</p>
                                                    <p className="text-xs italic font-medium text-slate-600">"{pendingLog.action}"</p>
                                                </div>
                                            )}
                                            {pendingLog.phase === 'ILL' && (
                                                <div className="mb-4 px-3.5 py-3 rounded-xl bg-red-50 border border-red-200">
                                                    <p className="text-[10px] text-red-600 font-semibold text-center leading-relaxed">
                                                        You do not have to carry this alone. Please reach out to your Employee Assistance Programme or a trusted colleague today.
                                                    </p>
                                                </div>
                                            )}
                                            <div className="flex gap-2">
                                                <button onClick={() => setPendingLog(null)} className="flex-1 py-2.5 text-xs font-black text-slate-500 rounded-xl border border-slate-200 hover:bg-slate-50 transition-all flex items-center justify-center gap-1.5">
                                                    <X size={12} /> Dismiss
                                                </button>
                                                <button onClick={confirmLog} disabled={loading} className={`flex-[2] py-2.5 text-white text-xs font-black rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 ${isAnonymous ? 'bg-purple-600' : 'bg-indigo-600'}`}>
                                                    {loading ? <RefreshCw size={13} className="animate-spin" /> : <Shield size={13} />}
                                                    {isAnonymous ? 'Confirm Ghost Log' : 'Sync to Dashboard'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {loading && (
                                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 animate-pulse pl-1">
                                        <span className="flex gap-1">
                                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
                                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
                                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
                                        </span>
                                        AURA is processing...
                                    </div>
                                )}
                                <div ref={messagesEndRef} className="h-1" />
                            </div>
                        )}
                    </div>

                    {/* Input Bar */}
                    {view === 'CHAT' && (
                        <div className="p-4 bg-white border-t border-slate-100 shrink-0">
                            {isNearLimit && <p className={`text-[9px] font-bold text-right mb-1 ${inputLength >= MAX_INPUT ? 'text-red-500' : 'text-amber-500'}`}>{inputLength} / {MAX_INPUT}</p>}
                            <div className={`flex items-center gap-2 bg-slate-50 rounded-full pl-5 pr-3 py-3 border transition-all ${loading || isSending ? 'opacity-60 border-slate-200' : `border-slate-200 focus-within:border-${isAnonymous ? 'purple' : 'indigo'}-500`}`}>
                                <input
                                    ref={inputRef} 
                                    type="text" 
                                    value={input}
                                    onChange={e => setInput(e.target.value.slice(0, MAX_INPUT))}
                                    onKeyDown={handleKeyDown}
                                    placeholder={loading || isSending ? 'AURA is processing...' : 'Type a message or request...'}
                                    className="flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
                                    disabled={loading || isSending || !isOnline}
                                    autoComplete="off" 
                                    spellCheck 
                                    maxLength={MAX_INPUT}
                                />
                                <button onClick={handleSend} disabled={!input.trim() || loading || isSending || !isOnline} className={`p-2 rounded-full transition-all active:scale-90 disabled:opacity-30 ${isAnonymous ? 'text-purple-600 hover:bg-purple-50' : 'text-indigo-600 hover:bg-indigo-50'}`}>
                                    <Send size={17} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
            <button onClick={() => setIsOpen(o => !o)} className={`w-16 h-16 rounded-full shadow-2xl text-white flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 ${isOpen ? 'bg-slate-800 rotate-90' : isAnonymous ? 'bg-purple-700 shadow-purple-600/30' : 'bg-indigo-600 shadow-indigo-600/30'}`}>
                {isOpen ? <X size={26} /> : <BrainCircuit size={28} />}
            </button>
        </div>
    );
}
