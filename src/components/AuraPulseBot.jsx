import { 
  Document, Packer, Paragraph, TextRun, HeadingLevel, 
  Table, TableRow, TableCell, WidthType 
} from 'docx';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Bot, Bug, X, Send, BrainCircuit, Shield, Ghost, Users, Zap, RefreshCw, 
  AlertTriangle, WifiOff, FileText, CheckCircle, Database, Trash2, Download, 
  Mic, ChevronLeft, CalendarCheck, Maximize2, Minimize2, Minus 
} from 'lucide-react';
import { DEMO_PERSONAS, LIVE_PERSONAS } from '../config/personas';
import { db } from '../firebase'; 
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, setDoc, getDoc, updateDoc, arrayUnion, collection, query, where, onSnapshot } from 'firebase/firestore';
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

const MAX_INPUT       = 500;
const SEND_COOLDOWN_MS = 2000;

// =============================================================================
// COMPONENT: Now fully controlled by props (isOpen, onClose, onOpen)
// =============================================================================
export default function AuraPulseBot({ isOpen, onClose, onOpen, user }) {
    const { isDemo, auraHistory, setAuraHistory } = useNexus();

    // ── State ─────────────────────────────────────────────────────────────────
    const [view,              setView]              = useState('SELECT');
    const [chatSize,          setChatSize]          = useState('normal');
    const [selectedPersona, setSelectedPersona] = useState(null); 
    const [input,             setInput]             = useState('');
    const [loading,          setLoading]          = useState(false);
    const [isSending,        setIsSending]        = useState(false);
    const [pendingLog,       setPendingLog]       = useState(null);
    const [isOnline,         setIsOnline]         = useState(navigator.onLine);
    const [liveMemory,       setLiveMemory]       = useState(null);
    const [isListening,      setIsListening]      = useState(false);
    
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
        if (chatSize !== 'minimized') {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, loading, pendingLog, chatSize]);
    
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('aura-toggled', { detail: isOpen }));
    }, [isOpen]);

    // ── SHIFT SWAP LISTENER ──────────────────────────────────────────
    useEffect(() => {
        if (isDemo || !user?.name) return;

        const q = query(
            collection(db, 'shift_swaps'), 
            where('targetStaff', '==', user.name),
            where('status', '==', 'PENDING')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    if (onOpen) onOpen();
                    setMessages(prev => [...prev, {
                        role: 'bot',
                        text: `🔔 **URGENT COVERAGE REQUEST**\n\n**${data.requestedBy}** has requested to swap their **${data.originalTask}** shift on **${data.originalShiftDate}** with you.\n\n_Reason provided:_ "${data.reason || 'None provided'}"\n\nWould you like to accept this coverage?`,
                        mode: 'ROSTER_ALERT',
                        swapData: {
                            docId: change.doc.id,
                            ...data
                        }
                    }]);
                }
            });
        });

        return () => unsubscribe();
    }, [isDemo, user, setMessages, onOpen]);

    // ── Session start ─────────────────────────────────────────────────────────
    const startSession = useCallback((persona) => {
        setSelectedPersona(persona);
        setPendingLog(null);

        const firstName = (user?.displayName || user?.name || 'there').split(' ')[0];
        const isAnon = persona.id === 'anon';
        let greeting;
        
        if (isDemo) {
            greeting = isAnon
                ? '🔒 Ghost Protocol engaged. Your identity is masked. How can I support you today?'
                : `[SIMULATION] Hi ${persona.name}. AURA here. What do you need?`;
        } else if (persona.memory) {
            greeting = `Welcome back, ${firstName}. Last time we spoke, I noted: "${persona.memory}". How can I support your workflow or wellbeing today?`;
        } else {
            greeting = `Hi ${firstName}. AURA here. What kind of support do you need today?`;
        }

        setMessages([{ role: 'bot', text: greeting, isGreeting: true, mode: 'NEUTRAL' }]);
        setView('CHAT');
        safeTimeout(() => inputRef.current?.focus(), 300);
    }, [isDemo, user, safeTimeout, setMessages]);

    const handleBackToGrid = useCallback(() => {
        setView('SELECT');
        setSelectedPersona(null);
        setMessages([]); 
        setPendingLog(null);
    }, [setMessages]);

    const handleClearChat = useCallback(() => {
        if (!window.confirm("Clear this conversation and start fresh?")) return;
        
        setPendingLog(null);
        
        const firstName = (user?.displayName || user?.name || 'there').split(' ')[0];
        const isAnon = selectedPersona?.id === 'anon';
        let greeting;
        if (isDemo) {
            greeting = isAnon
                ? '🔒 Ghost Protocol engaged. Your identity is masked. How can I support you today?'
                : `[SIMULATION] Hi ${selectedPersona?.name}. AURA here. How can I help?`;
        } else if (liveMemory) {
            greeting = `Welcome back, ${firstName}. Last time we spoke, I noted: "${liveMemory}". How can I support your workflow or wellbeing today?`;
        } else {
            greeting = `Hi ${firstName}. AURA here. What kind of support do you need today?`;
        }

        setMessages([{ role: 'bot', text: greeting, isGreeting: true, mode: 'NEUTRAL' }]);
        setTimeout(() => inputRef.current?.focus(), 300);
    }, [isDemo, user, selectedPersona, liveMemory, setMessages]);

    const toggleListening = useCallback(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Voice input is not supported in this browser. Please use Chrome, Edge, or Safari.");
            return;
        }

        if (isListening) {
            setIsListening(false);
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-SG';

        recognition.onstart = () => setIsListening(true);
        
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setInput(prev => (prev + ' ' + transcript).trim().slice(0, MAX_INPUT));
        };

        recognition.onerror = (event) => {
            console.error('[AURA] Voice error:', event.error);
            setIsListening(false);
        };

        recognition.onend = () => setIsListening(false);

        recognition.start();
    }, [isListening]);
    
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
        
        if (chatSize === 'minimized') {
            setChatSize('normal');
        }

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
                ? `System Note: The user's exact database ID is '${selectedPersona?.id}'.\n\n${selectedPersona?.prompt ?? ''}`
                : [
                    `System Note: The user's exact database ID is '${user?.id}'.`,
                    user?.title ? `This staff member is a ${user.title} at KKH/SingHealth.` : '',
                    user?.department ? `Department: ${user.department}.` : '',
                    liveMemory ? `Prior session note: "${liveMemory}".` : 'This is their first session with AURA.',
                    selectedPersona?.prompt ? `\n\n${selectedPersona.prompt}` : '' 
                  ].filter(Boolean).join('\n');

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
    }, [input, loading, isSending, isOnline, messages, selectedPersona, isDemo, liveMemory, user, setMessages, chatSize]);

    const handleKeyDown = useCallback((e) => {
            if (e.key === 'Enter' && !e.repeat) {
                e.preventDefault();
                handleSend();
            }
        }, [handleSend]);

    // ── Handle Swap Response ──────────────────────────────────────────────────
    const handleSwapResponse = async (swapData, isAccepted, msgIndex) => {
        if (!swapData || !swapData.docId) return;
        setLoading(true);

        try {
            const swapRef = doc(db, 'shift_swaps', swapData.docId);
            
            if (isAccepted) {
                await updateDoc(swapRef, { 
                    status: 'APPROVED', 
                    approvedAt: new Date().toISOString() 
                });

                const rosterRef = doc(db, 'system_data', 'roster_2026');
                const rosterSnap = await getDoc(rosterRef);
                
                if (rosterSnap.exists()) {
                    const currentRoster = rosterSnap.data();
                    const targetDateKey = swapData.originalShiftDate;
                    
                    if (currentRoster[targetDateKey]) {
                        const updatedDayShifts = currentRoster[targetDateKey].map(shift => {
                            if (shift.staff === swapData.requestedBy && shift.task === swapData.originalTask) {
                                return { ...shift, staff: user.name }; 
                            }
                            return shift;
                        });

                        await updateDoc(rosterRef, {
                            [targetDateKey]: updatedDayShifts
                        });
                    }
                }

                setMessages(prev => {
                    const newHistory = [...prev];
                    if (newHistory[msgIndex]) newHistory[msgIndex].swapData = null; 
                    newHistory.push({ role: 'bot', text: `✅ Swap accepted! I have updated the master roster to reflect that you are now covering the ${swapData.originalTask} shift on ${swapData.originalShiftDate}.`, mode: 'ASSISTANT' });
                    return newHistory;
                });
            } else {
                await updateDoc(swapRef, { status: 'DENIED' });
                setMessages(prev => {
                    const newHistory = [...prev];
                    if (newHistory[msgIndex]) newHistory[msgIndex].swapData = null; 
                    newHistory.push({ role: 'bot', text: `Got it. I have marked the request as declined. ${swapData.requestedBy} will be notified to find alternative coverage.`, mode: 'ASSISTANT' });
                    return newHistory;
                });
            }
        } catch (err) {
            console.error('[AURA] Swap Response Error:', err);
            setMessages(prev => [...prev, { role: 'bot', text: '⚠️ Database error while processing swap.', isError: true, mode: 'ASSISTANT' }]);
        } finally {
            setLoading(false);
        }
    };

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
            
            safeTimeout(() => { if (onClose) onClose(); }, 2500);

        } catch (err) {
            console.error('[AURA] Sync failed:', err);
            setMessages(prev => [...prev, {
                role: 'bot', text: '⚠️ Could not sync your pulse log. Please check your connection and try again.', isError: true, mode: 'COACH'
            }]);
        } finally {
            setLoading(false);
        }
    }, [pendingLog, isDemo, selectedPersona, user, safeTimeout, setMessages, onClose]);

    const exportToICS = useCallback((text) => {
        if (!text) return;

        const lines = text.split('\n');
        const events = [];
        
        const dateRegex = /\b(\d{1,2})\s([A-Za-z]{3,9})\s(\d{4})\b/;

        lines.forEach(line => {
            const match = line.match(dateRegex);
            if (match) {
                const dateStr = match[0];
                const parsedDate = new Date(dateStr);
                
                if (!isNaN(parsedDate.getTime())) {
                    let description = line
                        .replace(/\|/g, '')        
                        .replace(dateStr, '')      
                        .replace(/^[,\s\-]+/, '')  
                        .trim();
                        
                    let title = description.split(',')[0]; 
                    
                    events.push({
                        title: title.length > 50 ? title.substring(0, 47) + "..." : title,
                        fullDescription: line.replace(/\|/g, ' ').trim(),
                        date: parsedDate
                    });
                }
            }
        });

        if (events.length === 0) {
            alert("No valid dates found in the document to export to Outlook.");
            return;
        }

        let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//NEXUS//AURA Roster//EN\n";
        
        events.forEach(event => {
            const d = event.date;
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const dateString = `${year}${month}${day}`;

            icsContent += "BEGIN:VEVENT\n";
            icsContent += `SUMMARY:Grant Deadline: ${event.title}\n`;
            icsContent += `DTSTART;VALUE=DATE:${dateString}\n`;
            icsContent += `DESCRIPTION:Generated by AURA Project HUGE.\\n\\nDetails: ${event.fullDescription}\n`;
            icsContent += "BEGIN:VALARM\nTRIGGER:-PT48H\nACTION:DISPLAY\nDESCRIPTION:Reminder: Grant Deadline\nEND:VALARM\n";
            icsContent += "END:VEVENT\n";
        });

        icsContent += "END:VCALENDAR";

        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `AURA_Grant_Deadlines_${new Date().toISOString().split('T')[0]}.ics`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        setMessages(prev => [...prev, {
            role: 'bot', text: `✅ Generated ${events.length} timeline milestones for Outlook. Your download should start automatically.`, mode: 'ASSISTANT'
        }]);
    }, [setMessages]);

    const exportToDoc = useCallback(async (text, msgIndex) => {
        if (!text) return;

        try {
            const lines = text.split('\n');
            const docChildren = [];
            
            let inTable = false;
            let tableRows = [];

            const processTextWithBold = (textStr) => {
                const parts = textStr.split('**');
                return parts.map((part, index) => {
                    return new TextRun({ text: part, bold: index % 2 === 1 }); 
                });
            };

            for (let i = 0; i < lines.length; i++) {
                const trimmed = lines[i].trim();
                
                if (!trimmed) {
                    if (inTable) {
                        docChildren.push(new Table({ 
                            rows: tableRows, 
                            width: { size: 100, type: WidthType.PERCENTAGE } 
                        }));
                        inTable = false;
                        tableRows = [];
                    }
                    docChildren.push(new Paragraph({ text: "" }));
                    continue;
                }

                if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
                    inTable = true;
                    if (/^\|[\s\-:]+\|/.test(trimmed)) continue;

                    const cellContents = trimmed.split('|').slice(1, -1).map(c => c.trim());
                    const tableRow = new TableRow({
                        children: cellContents.map(cellText => {
                            return new TableCell({
                                children: [new Paragraph({ children: processTextWithBold(cellText) })],
                                margins: { top: 100, bottom: 100, left: 100, right: 100 },
                            });
                        })
                    });
                    
                    tableRows.push(tableRow);
                    continue;
                }

                if (inTable) {
                    docChildren.push(new Table({ 
                        rows: tableRows, 
                        width: { size: 100, type: WidthType.PERCENTAGE } 
                    }));
                    inTable = false;
                    tableRows = [];
                }

                if (trimmed.startsWith('### ')) {
                    docChildren.push(new Paragraph({ text: trimmed.replace('### ', ''), heading: HeadingLevel.HEADING_3 }));
                } else if (trimmed.startsWith('## ')) {
                    docChildren.push(new Paragraph({ text: trimmed.replace('## ', ''), heading: HeadingLevel.HEADING_2 }));
                } else if (trimmed.startsWith('# ')) {
                    docChildren.push(new Paragraph({ text: trimmed.replace('# ', ''), heading: HeadingLevel.HEADING_1 }));
                } else {
                    docChildren.push(new Paragraph({ children: processTextWithBold(trimmed) }));
                }
            }

            if (inTable && tableRows.length > 0) {
                docChildren.push(new Table({ 
                    rows: tableRows, 
                    width: { size: 100, type: WidthType.PERCENTAGE } 
                }));
            }

            const wordDoc = new Document({
                sections: [{
                    properties: {},
                    children: docChildren,
                }]
            });

            const blob = await Packer.toBlob(wordDoc);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `AURA_Document_${new Date().toISOString().split('T')[0]}.docx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            const timestamp   = new Date().toISOString();
            const displayDate = new Date().toLocaleDateString();
            const activeUser  = isDemo ? selectedPersona : user;
            const docId       = `audit_${Date.now()}`; 

            await setDoc(doc(db, 'smart_database', docId), {
                timestamp, displayDate,
                author: activeUser?.name || 'Anonymous',
                role: activeUser?.title || 'Staff',
                content: text,
                type: 'AUTO_EXPORTED_DOCX', 
                isDemo,
                silentlyLogged: true 
            });

            setMessages(prev => {
                const newHistory = [...prev];
                if (newHistory[msgIndex]) {
                    newHistory[msgIndex].action = null; 
                }
                newHistory.push({
                    role: 'bot', text: '✅ Document exported successfully with formatted tables.', mode: 'ASSISTANT'
                });
                return newHistory;
            });

        } catch (err) {
            console.error('[AURA] DOCX Export failed:', err);
            setMessages(prev => [...prev, {
                role: 'bot', text: '⚠️ Document export failed. Please check your connection.', isError: true, mode: 'ASSISTANT'
            }]);
        }
    }, [isDemo, selectedPersona, user, setMessages]);
         
    const confirmAdminAction = useCallback(async (actionText, msgIndex) => {
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

            setMessages(prev => {
                const newHistory = [...prev];
                if (newHistory[msgIndex]) {
                    newHistory[msgIndex].action = null; 
                }
                newHistory.push({
                    role: 'bot', text: '✅ Document securely routed to the Smart Database.', mode: 'ASSISTANT'
                });
                return newHistory;
            });
            
        } catch (err) {
            console.error('[AURA] DB Save failed:', err);
            setMessages(prev => [...prev, {
                role: 'bot', text: '⚠️ Could not save to the Smart Database. Please check your connection.', isError: true, mode: 'ASSISTANT'
            }]);
        } finally {
            setLoading(false);
        }
    }, [isDemo, selectedPersona, user, setMessages]);
    
    const executeDataEntry = useCallback(async (workload) => {
        if (!workload || !workload.target_collection) return;
        setLoading(true);

        try {
            const rawDocId = workload.target_doc || 'null';
            const safeDocId = rawDocId.toLowerCase().trim().replace(/[\s-]+/g, '_');
            const collectionName = isDemo ? `demo_${workload.target_collection}` : workload.target_collection;
            
            if (safeDocId === 'null' || safeDocId === '') {
                 throw new Error("Missing target document. Please ask AURA to clarify who this is for.");
            }
            
            const docRef = doc(db, collectionName, safeDocId);
            let updatedMessage = '';

            if (workload.target_collection === 'staff_loads') {
                const monthIndex = parseInt(workload.target_month);
                if (isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
                    throw new Error("A valid month (e.g., January) is required to update personal workload.");
                }

                const docSnap = await getDoc(docRef);
                let currentData = Array(12).fill(0);
                if (docSnap.exists() && Array.isArray(docSnap.data().data)) {
                    currentData = [...docSnap.data().data];
                }

                currentData[monthIndex] = Number(workload.target_value);

                await setDoc(docRef, {
                    data: currentData,
                    last_updated_by: user?.name || 'AURA System',
                    last_updated_at: new Date().toISOString()
                }, { merge: true });
                
                const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                updatedMessage = `Logged ${workload.target_value} patients for ${monthNames[monthIndex]}.`;
            } else {
                await setDoc(docRef, {
                    [workload.target_field]: Number(workload.target_value),
                    last_updated_by: user?.name || 'AURA System',
                    last_updated_at: new Date().toISOString()
                }, { merge: true });
                
                const cleanField = workload.target_field.replace(/_/g, ' ');
                updatedMessage = `Updated team ${cleanField} to ${workload.target_value}.`;
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
    }, [isDemo, user, setMessages]);

    const formatChatText = (text) => {
        if (!text) return null;
        return text.split('\n').map((line, i) => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return <div key={i} className="h-2" />; 

            const parts = trimmedLine.split(/(\*\*.*?\*\*)/g);
            const formattedLine = parts.map((part, j) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={j} className="font-bold">{part.replace(/\*\*/g, '')}</strong>;
                }
                return part;
            });

            if (trimmedLine.startsWith('* ') || trimmedLine.startsWith('- ')) {
                const bulletContent = formattedLine.map((part, j) => 
                    typeof part === 'string' && j === 0 ? part.replace(/^[\*\-]\s/, '') : part
                );
                return (
                    <div key={i} className="flex items-start mt-1.5 ml-1">
                        <span className="mr-2 text-current opacity-70">•</span>
                        <span>{bulletContent}</span>
                    </div>
                );
            }

            return <div key={i} className="mt-1.5">{formattedLine}</div>;
        });
    };

    const isAnonymous = selectedPersona?.id === 'anon';
    const inputLength = input.length;
    const isNearLimit = inputLength > MAX_INPUT * 0.8;

    return (
        <>
            {isOpen && chatSize !== 'minimized' && (
                <div 
                    className="fixed inset-0 z-[90] bg-slate-900/40 backdrop-blur-sm transition-all animate-in fade-in duration-300"
                    onClick={onClose} 
                />
            )}

            <div className={`fixed bottom-24 xl:bottom-6 right-4 xl:right-6 flex flex-col items-end drop-shadow-2xl ${isOpen ? 'z-[100]' : 'z-50'} ${chatSize === 'maximized' ? 'xl:right-[7.5vw]' : ''}`}>
                {isOpen && (
                    <div
                        role="dialog" aria-modal="true" aria-label="AURA Pulse wellbeing assistant"
                        className={`mb-2 sm:mb-4 bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden transition-all duration-300 ease-in-out
                            ${chatSize === 'minimized' ? 'w-[calc(100vw-2rem)] sm:w-[380px] h-[64px] rounded-[1.5rem]' : ''}
                            ${chatSize === 'normal' ? 'w-[calc(100vw-2rem)] sm:w-[380px] h-[100dvh] md:h-[660px] max-h-[calc(100dvh-100px)] rounded-[2rem]' : ''}
                            ${chatSize === 'maximized' ? 'w-[calc(100vw-2rem)] sm:w-[85vw] max-w-[1200px] h-[100dvh] md:h-[85vh] max-h-[900px] rounded-[2rem]' : ''}
                        `}
                    >
                        <div className={`shrink-0 p-4 text-white flex justify-between items-center bg-gradient-to-r ${isAnonymous ? 'from-purple-800 to-indigo-900' : 'from-slate-900 to-indigo-950'}`}>
                            <div className="flex items-center gap-3">
                                {view === 'CHAT' ? (
                                    <button 
                                        onClick={handleBackToGrid} 
                                        aria-label="Back to Identity Matrix"
                                        className="p-1 hover:bg-white/20 rounded-lg transition-all active:scale-90"
                                    >
                                        <ChevronLeft size={20} className="text-white" />
                                    </button>
                                ) : (
                                    isAnonymous ? <Ghost size={20} className="text-purple-300 animate-pulse" /> : <BrainCircuit size={20} className="text-indigo-400 animate-pulse" />
                                )}
                                
                                <div>
                                    <h3 className="font-bold text-xs uppercase tracking-widest">
                                        {selectedPersona ? selectedPersona.name : (isAnonymous ? 'Ghost Protocol' : 'AURA Intelligence')}
                                    </h3>
                                    <p className="text-[9px] opacity-60 uppercase tracking-tight">{isDemo ? 'Full AI Simulation' : (isOnline ? 'Secure Live Link' : 'Offline')}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                {/* APP ACTIONS (Trash, Bug) */}
                                <div className="flex items-center gap-2 border-r border-white/20 pr-3">
                                    {!isOnline && <WifiOff size={13} className="text-yellow-300" />}
                                    
                                    {view === 'CHAT' && chatSize !== 'minimized' && (
                                        <button 
                                            onClick={handleClearChat} 
                                            title="Clear Conversation"
                                            className="p-1.5 hover:bg-white/20 rounded-lg transition-all text-white/80 hover:text-white"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}

                                    {chatSize !== 'minimized' && (
                                        <button 
                                            onClick={() => {
                                                window.dispatchEvent(new CustomEvent('open-bug-report'));
                                                if (onClose) onClose(); 
                                            }}
                                            title="Report a Bug"
                                            className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 rounded-lg transition-all text-white text-[10px] font-bold uppercase tracking-wider shadow-sm"
                                        >
                                            <Bug size={12} className="text-amber-400" />
                                            <span className="hidden sm:inline">Report</span>
                                        </button>
                                    )}
                                </div>

                                {/* 🌟 REFINED MAC-STYLE WINDOW CONTROLS 🌟 */}
                                <div className="flex items-center gap-2 group/window pl-1">
                                    {/* Minimize (Yellow/Amber) */}
                                    <button 
                                        onClick={() => setChatSize(chatSize === 'minimized' ? 'normal' : 'minimized')}
                                        className="w-3.5 h-3.5 rounded-full bg-amber-400 hover:bg-amber-300 flex items-center justify-center transition-colors shadow-sm border border-amber-500/50"
                                        title={chatSize === 'minimized' ? 'Restore' : 'Minimize'}
                                    >
                                        <Minus size={9} strokeWidth={3} className="opacity-0 group-hover/window:opacity-100 text-amber-800/80 transition-opacity" />
                                    </button>
                                    
                                    {/* Maximize (Green/Emerald) */}
                                    <button 
                                        onClick={() => setChatSize(chatSize === 'maximized' ? 'normal' : 'maximized')}
                                        className="w-3.5 h-3.5 rounded-full bg-emerald-400 hover:bg-emerald-300 flex items-center justify-center transition-colors shadow-sm border border-emerald-500/50"
                                        title={chatSize === 'maximized' ? 'Restore' : 'Maximize'}
                                    >
                                        {chatSize === 'maximized' ? (
                                             <Minimize2 size={8} strokeWidth={3} className="opacity-0 group-hover/window:opacity-100 text-emerald-800/80 transition-opacity" />
                                        ) : (
                                             <Maximize2 size={8} strokeWidth={3} className="opacity-0 group-hover/window:opacity-100 text-emerald-800/80 transition-opacity" />
                                        )}
                                    </button>

                                    {/* Close (Red/Rose) */}
                                    <button 
                                        onClick={onClose} 
                                        className="w-3.5 h-3.5 rounded-full bg-rose-500 hover:bg-rose-400 flex items-center justify-center transition-colors shadow-sm border border-rose-600/50"
                                        title="Close"
                                    >
                                        <X size={9} strokeWidth={3} className="opacity-0 group-hover/window:opacity-100 text-rose-900/80 transition-opacity" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {!isOnline && chatSize !== 'minimized' && (
                            <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-yellow-50 border-b border-yellow-200">
                                <WifiOff size={12} className="text-yellow-600 flex-shrink-0" />
                                <p className="text-[10px] font-semibold text-yellow-700">You are offline. AURA cannot process new requests.</p>
                            </div>
                        )}

                        {chatSize !== 'minimized' && (
                            <div className="flex-1 overflow-y-auto p-5 bg-slate-50 dark:bg-slate-950/50 scroll-smooth">
                                {view === 'SELECT' ? (
                                    <div className="space-y-5 animate-in fade-in duration-300">
                                        <div className="text-center">
                                            <div className="w-10 h-10 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto mb-2 border border-indigo-500/20">
                                                <Users size={20} className="text-indigo-500" />
                                            </div>
                                            <h2 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-tighter">Identity Matrix</h2>
                                            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mt-0.5">Select a persona</p>
                                        </div>
                                        <div role="listbox" className="grid grid-cols-2 gap-3">
                                            {(isDemo ? DEMO_PERSONAS : LIVE_PERSONAS).map(p => (
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
                                            const isAssistant = m.mode === 'ASSISTANT' || m.mode === 'RESEARCH';
                                            const isDataEntry = m.mode === 'DATA_ENTRY';
                                            const isAlert = m.mode === 'ROSTER_ALERT';
                                            const bubbleStyle = m.role === 'user' 
                                                ? (isAnonymous ? 'bg-purple-600 text-white rounded-tr-none' : 'bg-indigo-600 text-white rounded-tr-none')
                                                : m.isError 
                                                    ? 'bg-red-50 text-red-600 rounded-tl-none border border-red-200'
                                                    : isAlert
                                                        ? 'bg-amber-50 text-amber-900 rounded-tl-none border border-amber-200 shadow-xl ring-2 ring-amber-400/50'
                                                        : isDataEntry
                                                            ? 'bg-slate-900 text-emerald-50 rounded-tl-none border border-emerald-900 shadow-lg'
                                                            : isAssistant 
                                                                ? 'bg-slate-800 text-blue-50 rounded-tl-none border border-slate-700 shadow-lg'
                                                                : 'bg-white text-slate-700 rounded-tl-none border border-slate-100 shadow-sm';

                                            const hasTimelineDates = m.action && /\b\d{1,2}\s[A-Za-z]{3,9}\s\d{4}\b/.test(m.action);

                                            return (
                                                <div key={i} className={`flex ${m.role === 'bot' ? 'justify-start' : 'justify-end'} animate-in fade-in slide-in-from-bottom-1`}>
                                                    <div className={`max-w-[87%] px-4 py-3.5 rounded-[1.5rem] text-sm leading-relaxed ${bubbleStyle}`}>
                                                        
                                                        {isAssistant && m.role === 'bot' && !m.isGreeting && (
                                                            <div className="flex items-center gap-1.5 mb-2 text-[10px] font-black uppercase tracking-widest text-blue-400">
                                                                <FileText size={12} /> {m.mode === 'RESEARCH' ? 'Academic Review' : 'Operations Assist'}
                                                            </div>
                                                        )}
                                                        {isDataEntry && m.role === 'bot' && !m.isGreeting && (
                                                            <div className="flex items-center gap-1.5 mb-2 text-[10px] font-black uppercase tracking-widest text-emerald-400">
                                                                <Database size={12} /> Database Agent
                                                            </div>
                                                        )}

                                                        {m.isError && <AlertTriangle size={13} className="inline mr-1.5 mb-0.5 text-red-500" />}
                                                        
                                                        <div className="leading-relaxed">
                                                            {formatChatText(m.text)}
                                                        </div>
                                                        
                                                        {isAssistant && m.action && !m.isGreeting && (
                                                            <div className="mt-4 pt-3 border-t border-slate-600/50">
                                                                <p className="text-[10px] font-medium text-slate-400 mb-2 uppercase tracking-wide">Extracted Data/Action:</p>
                                                                <p className="text-xs text-blue-200 bg-slate-900/50 p-2 rounded-lg mb-3 border border-slate-700 font-mono line-clamp-3 overflow-hidden">
                                                                    {m.action}
                                                                </p>
                                                                
                                                                <div className="flex flex-col gap-2">
                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        <button 
                                                                            onClick={() => confirmAdminAction(m.action, i)}
                                                                            disabled={loading}
                                                                            className="py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[10px] font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-1.5"
                                                                        >
                                                                            {loading ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle size={13} />} 
                                                                            Save to DB
                                                                        </button>

                                                                        <button 
                                                                            onClick={() => exportToDoc(m.action, i)}
                                                                            disabled={loading}
                                                                            className="py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-[10px] font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-1.5 border border-slate-600"
                                                                        >
                                                                            <Download size={13} /> 
                                                                            Export Doc
                                                                        </button>
                                                                    </div>

                                                                    {hasTimelineDates && (
                                                                        <button 
                                                                            onClick={() => exportToICS(m.action)}
                                                                            disabled={loading}
                                                                            className="py-2 w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[10px] font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-md"
                                                                        >
                                                                            <CalendarCheck size={13} /> 
                                                                            Sync Timeline to Outlook (.ics)
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {isAlert && m.swapData && (
                                                            <div className="mt-4 pt-3 border-t border-amber-200 grid grid-cols-2 gap-2">
                                                                <button 
                                                                    onClick={() => handleSwapResponse(m.swapData, false, i)}
                                                                    disabled={loading}
                                                                    className="py-2.5 bg-white text-slate-500 hover:bg-slate-50 border border-slate-200 disabled:opacity-50 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all"
                                                                >
                                                                    Decline
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleSwapResponse(m.swapData, true, i)}
                                                                    disabled={loading}
                                                                    className="py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50 text-[11px] font-black uppercase tracking-wider rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5"
                                                                >
                                                                    <CalendarCheck size={14} /> Accept Swap
                                                                </button>
                                                            </div>
                                                        )}

                                                        {isDataEntry && m.db_workload && m.db_workload.target_collection && m.db_workload.target_collection !== 'null' && m.role === 'bot' && !m.isGreeting && (
                                                            <div className="mt-4 pt-3 border-t border-emerald-900/50">
                                                                <p className="text-[10px] font-bold text-emerald-400 mb-2 uppercase tracking-widest flex items-center gap-1">
                                                                    <Zap size={12} /> Pending Workload Transaction
                                                                </p>
                                                                
                                                                <div className="bg-slate-950 p-3 rounded-lg border border-emerald-900/50 text-xs text-slate-300 mb-3 leading-relaxed">
                                                                    {m.db_workload.target_collection === 'staff_loads' ? (
                                                                        <div>
                                                                            Preparing to log <span className="text-emerald-400 font-bold text-sm">{m.db_workload.target_value}</span> patients for <span className="text-amber-400 font-bold">{m.db_workload.target_month !== null && m.db_workload.target_month !== undefined ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m.db_workload.target_month] : 'Unknown Month'}</span>.
                                                                        </div>
                                                                    ) : (
                                                                        <div>
                                                                            Preparing to update team <span className="text-amber-400 font-bold">{m.db_workload.target_field?.replace(/_/g, ' ')}</span> to <span className="text-emerald-400 font-bold text-sm">{m.db_workload.target_value}</span>.
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                <button 
                                                                    onClick={() => executeDataEntry(m.db_workload)}
                                                                    disabled={loading}
                                                                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2"
                                                                >
                                                                    {loading ? <RefreshCw size={14} className="animate-spin" /> : <Shield size={14} />} 
                                                                    Commit Workload
                                                                </button>
                                                            </div>
                                                        )}

                                                    </div>
                                                </div>
                                            );
                                        })}

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
                        )}

                        {view === 'CHAT' && chatSize !== 'minimized' && (
                            <div className="shrink-0 p-4 bg-white border-t border-slate-100">
                                {isNearLimit && <p className={`text-[9px] font-bold text-right mb-1 ${inputLength >= MAX_INPUT ? 'text-red-500' : 'text-amber-500'}`}>{inputLength} / {MAX_INPUT}</p>}
                                <div className={`flex items-center gap-2 bg-slate-50 rounded-full pl-5 pr-3 py-3 border transition-all ${
                                    loading || isSending 
                                        ? 'opacity-60 border-slate-200' 
                                        : `border-slate-200 ${isAnonymous ? 'focus-within:border-purple-500' : 'focus-within:border-indigo-500'}`
                                }`}>
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
                                    
                                    <div className="flex items-center gap-1">
                                        <button 
                                            onClick={toggleListening} 
                                            disabled={loading || isSending || !isOnline} 
                                            title="Click to dictate"
                                            className={`p-2 rounded-full transition-all active:scale-90 disabled:opacity-30 ${isListening ? 'bg-red-100 text-red-600 animate-pulse' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100'}`}
                                        >
                                            <Mic size={17} />
                                        </button>

                                        <button 
                                            onClick={handleSend} 
                                            disabled={!input.trim() || loading || isSending || !isOnline} 
                                            className={`p-2 rounded-full transition-all active:scale-90 disabled:opacity-30 ${isAnonymous ? 'text-purple-600 hover:bg-purple-50' : 'text-indigo-600 hover:bg-indigo-50'}`}
                                        >
                                            <Send size={17} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
