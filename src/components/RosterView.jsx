import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
// 🛡️ NEW: Imported collection, addDoc, and serverTimestamp for the Swap Engine
import { doc, onSnapshot, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Calendar, Download, Settings, ChevronLeft, ChevronRight, Play, FileSpreadsheet, ShieldAlert, ArrowRightLeft, X } from 'lucide-react';
import {
    downloadICS,
    downloadCSV,
    // 🛡️ P1 SAFETY GUARDS — pure, unit-tested in auraEngine.guards.test.js
    restoreLiveRosterConfig,
    validateRosterConfig,
    describeGenerationRange,
    formatRosterDateKey,
    prepareRosterWrite,
    MAX_ROSTER_WEEKS,
    // 🛡️ P6 SHIFT SHAPE — pure, unit-tested in auraEngine.swap.test.js
    filterSwapCandidates,
    describeShiftRole,
    resolveSwapSubject,
} from '../utils/auraEngine';

// --- SANDBOX IMPORTS ---
import { useNexus } from '../context/NexusContext';
import { MOCK_ROSTER, MOCK_STAFF_NAMES } from '../data/mockData';

// 🌟 IMPORT THE CUSTOM MODAL
import ConfirmationModal from './ConfirmationModal';

const RosterView = ({ user }) => {
    // --- CONTEXT ---
    const { isDemo } = useNexus();

    // --- STATE ---
    const [currentDate, setCurrentDate] = useState(new Date(2026, 1, 1)); 
    const [rosterData, setRosterData] = useState({});
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    // 🛡️ M8: an empty calendar caused by a rules denial was indistinguishable
    // from "no roster has been generated yet". This is the difference.
    const [rosterError, setRosterError] = useState(null);
    
    // 🌟 CUSTOM MODAL STATE
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    
    // --- SWAP MODAL STATE ---
    const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
    const [selectedShift, setSelectedShift] = useState(null);
    const [swapTargetStaff, setSwapTargetStaff] = useState('');
    const [swapReason, setSwapReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    // 🛡️ M11: which duty an ADMIN is reassigning on a shift they do not hold.
    // '' until they pick; ignored entirely when the acting user is on the shift,
    // or when the shift has only one assignable duty to begin with.
    const [swapRoleChoice, setSwapRoleChoice] = useState('');
    
    // Default Config — the live staff pool and task list now live in
    // LIVE_ROSTER_DEFAULTS (auraEngine.js) so that leaving demo mode can restore
    // exactly these values. Same values as before, one source of truth.
    const [config, setConfig] = useState(() => restoreLiveRosterConfig());

    // 🛡️ Every write decision is made by pure functions, re-run on config change.
    const configValidation = useMemo(() => validateRosterConfig(config), [config]);
    const generationPlan = useMemo(() => describeGenerationRange(config), [config]);

    // --- EFFECT: SWITCH DATA SOURCE ---
    useEffect(() => {
        if (isDemo) {
            const transformedData = {};
            MOCK_ROSTER.forEach(event => {
                const dateKey = event.start.split('T')[0];
                if (!transformedData[dateKey]) {
                    transformedData[dateKey] = [];
                }
                transformedData[dateKey].push({
                    staff: event.resource,
                    lead: event.resource, // Fallback for old demo data
                    task: event.title,
                    category: event.type === 'OnCall' ? 'VC' : 'Clinical' 
                });
            });

            setRosterData(transformedData);
            setRosterError(null);
            setConfig(prev => ({
                ...prev,
                staff: MOCK_STAFF_NAMES,
                tasks: ["Avenger Protocol", "Web Slinger Audit", "Cerebro Scan", "Shield Patrol"]
            }));

        } else {
            // 🛡️ M1 FIX: the demo branch above overwrites config.staff/config.tasks
            // with the Marvel dataset. Without this reset the demo pool survived
            // the toggle back to LIVE, and one Generate click replaced four real
            // clinicians with Steve/Peter/Charles/Jean/Tony. An in-progress
            // startDate/weeks edit is preserved — demo mode never touches those.
            setConfig(prev => restoreLiveRosterConfig(prev));

            const unsub = onSnapshot(
                doc(db, 'system_data', 'roster_2026'),
                (snap) => {
                    setRosterError(null);
                    if (snap.exists()) setRosterData(snap.data());
                },
                // 🛡️ M8 FIX: this listener had no error callback, so a Firestore
                // rules denial produced an empty calendar and no message
                // anywhere — the one signal that would have explained it.
                (error) => {
                    console.error('🔥 Roster listener failed:', error.code, error.message);
                    setRosterError(
                        error.code === 'permission-denied'
                            ? 'You do not have permission to read the master roster. The calendar below is empty because it could not be loaded — not because no roster exists.'
                            : `The roster could not be loaded (${error.code || 'unknown error'}). The calendar below may be empty or out of date.`
                    );
                }
            );
            return () => unsub();
        }
    }, [isDemo]);

    // --- ACTIONS ---
    
    const handleGenerateClick = () => {
        if (isDemo) {
            alert("🧪 [SANDBOX] AURA is simulating roster conflict resolution for the Marvel Team...");
            setTimeout(() => {
                alert("✅ Simulation Complete. Zero conflicts found in multiverse timeline.");
                setIsConfigOpen(false);
            }, 1500);
            return;
        }

        // 🛡️ M3 FIX: never even open the confirmation for a config that cannot
        // be generated. The button is disabled too; this is the second latch.
        if (!configValidation.valid) {
            alert(`⚠️ Cannot generate: ${configValidation.reason}`);
            return;
        }

        setIsConfirmModalOpen(true);
    };

    const executeRosterGeneration = async () => {
        setIsConfirmModalOpen(false); // Close the confirm modal

        // 🛡️ M3 FIX (defence in depth): validate, generate, and refuse to write
        // an empty roster — all decided by prepareRosterWrite, which is unit
        // tested. An empty write used to blank the whole document and report
        // success.
        const prepared = prepareRosterWrite(config);
        if (!prepared.ok) {
            console.error("Roster generation blocked before write:", prepared.reason, config);
            alert(`❌ Roster NOT generated. ${prepared.reason}`);
            return;
        }

        try {
            // 🛡️ C2 FIX: { merge: true } — generating one period must not erase
            // the periods already stored in this document.
            await setDoc(doc(db, 'system_data', 'roster_2026'), prepared.data, { merge: true });
            setIsConfigOpen(false); // Close the config wizard
            alert("✅ AURA has generated a conflict-free roster.");
        } catch (error) {
            console.error("Error generating roster:", error);
            alert("❌ Failed to generate roster. Check your connection.");
        }
    };

    const handleMonthChange = (offset) => {
        const newDate = new Date(currentDate.setMonth(currentDate.getMonth() + offset));
        setCurrentDate(new Date(newDate));
    };

    // --- SWAP LOGIC ---
    const handleShiftClick = (shift, dateKey) => {
        // 🌟 UPDATED: Checks if user is Lead OR Co-Lead. Also maintains backwards compatibility.
        const isMyShift = isDemo ? true : (shift.lead === user?.name || shift.coLead === user?.name || shift.staff === user?.name);
        
        if (isMyShift || user?.role === 'admin') {
            setSelectedShift({ ...shift, date: dateKey });
            // A fresh shift means a fresh duty choice — never carry the previous
            // shift's selection into this one.
            setSwapRoleChoice('');
            setIsSwapModalOpen(true);
        }
    };

    // 🛡️ A3 + M11 — THE TRUE ROOT CAUSE OF THE BROKEN SWAP, AND ITS ADMIN HOLE.
    //
    // A3: the swap message contract never recorded WHICH duty was being handed
    // over, so the mutator could not know which field to rewrite even in
    // principle. `selectedShift` has the answer in hand at exactly this moment;
    // the old code discarded it.
    //
    // M11: the old code then derived that duty from the CLICKING user, and wrote
    // `requestedBy: <clicking user>`. An admin is allowed to open this modal on
    // any shift, and the app's admins are not in the roster staff pool at all —
    // so every admin-brokered request was written as `(<admin>, null)` and was
    // guaranteed to be refused on acceptance.
    //
    // Both decisions now live in `resolveSwapSubject`, which is pure and unit
    // tested against the real `planSwapApplication` so the request side and the
    // acceptance side cannot drift apart. Identity comparison, never
    // `includes()` (A4).
    const actingUserName = user?.name || user?.email || 'Unknown User';

    // Demo mode's standing fiction is that every shift is actionable
    // (`isMyShift` is forced true above). Granting it the admin path keeps the
    // sandbox behaving exactly as it did, without a live-mode special case.
    const canArrangeForOthers = user?.role === 'admin' || isDemo;

    const swapSubject = useMemo(
        () => (selectedShift
            ? resolveSwapSubject({
                shift: selectedShift,
                actingUser: actingUserName,
                isAdmin: canArrangeForOthers,
                chosenRole: swapRoleChoice,
            })
            : null),
        [selectedShift, actingUserName, canArrangeForOthers, swapRoleChoice],
    );

    const submitSwapRequest = async (e) => {
        e.preventDefault();
        if (!swapTargetStaff) return;

        // 🛡️ M11: refuse to CREATE a request that cannot be applied. The button
        // is disabled too; this is the second latch. Previously this path
        // happily wrote `swapRole: null`, alerted "securely transmitted", and
        // the failure surfaced only when a colleague tried to accept it.
        if (!swapSubject || !swapSubject.ok) {
            alert(`⚠️ Request not sent. ${swapSubject?.reason || 'AURA could not work out which duty this swap refers to.'}`);
            return;
        }

        setIsSubmitting(true);

        try {
            if (isDemo) {
                // Fake delay for demo mode
                await new Promise(resolve => setTimeout(resolve, 800));
                alert(`🧪 [SANDBOX] Swap request intercepted! AURA notified ${swapTargetStaff}.`);
            } else {
                // 📡 LIVE MODE: Pushing the request to Firebase Firestore
                await addDoc(collection(db, 'shift_swaps'), {
                    // 🛡️ M11: the person being SWAPPED OUT, which is what
                    // `planSwapApplication` matches on — not necessarily the
                    // person who clicked. For an admin arranging cover this is
                    // the clinician who actually holds the duty.
                    requestedBy: swapSubject.requestedBy,
                    targetStaff: swapTargetStaff,
                    originalShiftDate: selectedShift.date,
                    originalTask: selectedShift.task,
                    // 🛡️ A3: 'lead' | 'coLead' — the duty the covering colleague
                    // will take over, mechanically, when they accept. Never null
                    // now: a request that could not name its duty is refused
                    // above rather than written.
                    swapRole: swapSubject.swapRole,
                    // 🛡️ M11: present only when somebody arranged this on
                    // another clinician's behalf, so the ledger records who did.
                    // Absent on a self-request, which keeps that document's shape
                    // byte-for-byte what it was before this fix.
                    ...(swapSubject.initiatedBy ? { initiatedBy: swapSubject.initiatedBy } : {}),
                    reason: swapReason,
                    status: 'PENDING',
                    timestamp: serverTimestamp()
                });
                alert(
                    swapSubject.onBehalf
                        ? `✅ Coverage request sent to ${swapTargetStaff}, on behalf of ${swapSubject.requestedBy}.`
                        : `✅ Swap request securely transmitted to ${swapTargetStaff}!`
                );
            }
            
            // Clean up and close modal
            setIsSwapModalOpen(false);
            setSwapTargetStaff('');
            setSwapReason('');
            setSwapRoleChoice('');
        } catch (error) {
            console.error("🔥 Swap Request Failed:", error);
            alert("Could not send request. Please check your connection.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- RENDER HELPERS ---
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth(); 
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay();

    const getShifts = (day) => {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return { shifts: rosterData[dateKey] || [], dateKey };
    };

    return (
        <div className="md:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 animate-in fade-in relative z-10">
            
            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${isDemo ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400'}`}>
                        {isDemo ? <ShieldAlert size={24} /> : <Calendar size={24} />}
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">
                            {isDemo ? 'Simulation Roster' : 'AURA Roster'}
                        </h2>
                        
                        <div className="flex items-center gap-3 mt-1">
                            <button onClick={() => handleMonthChange(-1)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors text-slate-500">
                                <ChevronLeft size={18} />
                            </button>
                            
                            <span className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase min-w-[140px] text-center whitespace-nowrap">
                                {currentDate.toLocaleString('default', { month: 'long' })} {year}
                            </span>
                            
                            <button onClick={() => handleMonthChange(1)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors text-slate-500">
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button onClick={() => setIsConfigOpen(true)} className="flex gap-2 items-center px-4 py-2 rounded bg-slate-100 font-bold text-xs hover:bg-slate-200 text-slate-600 transition-colors">
                        <Settings size={14} /> Configure
                    </button>
                    <button onClick={() => downloadCSV(rosterData)} className="flex gap-2 items-center px-4 py-2 rounded bg-green-100 text-green-700 font-bold text-xs hover:bg-green-200 transition-colors">
                        <FileSpreadsheet size={14} /> CSV
                    </button>
                    <button onClick={() => downloadICS(rosterData)} className="flex gap-2 items-center px-4 py-2 rounded bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 shadow-lg transition-colors">
                        <Download size={14} /> ICS
                    </button>
                </div>
            </div>

            {/* 🛡️ M8 FIX: surface a listener failure. Without this an empty
                calendar looked exactly like "no roster generated yet". */}
            {rosterError && (
                <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <ShieldAlert size={16} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs font-bold text-red-700 dark:text-red-300 leading-relaxed">{rosterError}</p>
                </div>
            )}

            {/* CALENDAR GRID */}
            <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-700 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} className="bg-slate-50 dark:bg-slate-800 p-2 text-center text-xs font-bold text-slate-400 uppercase">
                        {d}
                    </div>
                ))}
                
                {Array.from({ length: firstDayIndex }).map((_, i) => (
                    <div key={`empty-${i}`} className="bg-white dark:bg-slate-900 h-32" />
                ))}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const { shifts, dateKey } = getShifts(day);
                    
                    return (
                        <div key={day} className="bg-white dark:bg-slate-900 h-32 p-1 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors relative group border-t border-l border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                            <span className="text-xs font-bold text-slate-400 absolute top-1 right-2">{day}</span>
                            
                            <div className="mt-5 flex flex-col gap-1 overflow-y-auto max-h-[90px] custom-scrollbar">
                                {shifts.map((s, idx) => {
                                    // 🌟 UPDATED: Checks both Lead and Co-Lead safely
                                    const isMyShift = isDemo ? true : (s.lead === user?.name || s.coLead === user?.name || s.staff === user?.name);

                                    return (
                                        <button 
                                            key={idx} 
                                            onClick={() => handleShiftClick(s, dateKey)}
                                            disabled={!isMyShift && user?.role !== 'admin'}
                                            className={`text-left text-[9px] font-bold px-1.5 py-1 rounded flex flex-col leading-tight shadow-sm transition-transform ${
                                                isMyShift || user?.role === 'admin' ? 'cursor-pointer hover:scale-[1.02] ring-1 ring-inset ring-transparent hover:ring-indigo-400' : 'cursor-default opacity-80'
                                            } ${
                                                s.category === 'VC' ? 'bg-orange-50 text-orange-800 border border-orange-100 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800/50' :
                                                'bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50'
                                            }`}
                                        >
                                            <span className="uppercase tracking-tighter opacity-80">{s.task}</span>
                                            <span className={`text-slate-800 dark:text-slate-200 ${isMyShift ? 'text-indigo-600 dark:text-indigo-400 font-black' : ''}`}>
                                                {s.staff}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* --- MODAL: SWAP REQUEST --- */}
            {isSwapModalOpen && selectedShift && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsSwapModalOpen(false)}></div>
                    <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-700">
                        
                        <div className="bg-gradient-to-r from-indigo-500 to-purple-500 p-4 flex justify-between items-center text-white">
                            <div className="flex items-center gap-2">
                                <ArrowRightLeft size={18} />
                                <h3 className="text-sm font-black uppercase tracking-wider">Shift Swap Request</h3>
                            </div>
                            <button onClick={() => setIsSwapModalOpen(false)} className="hover:bg-white/20 p-1 rounded-full transition-colors">
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={submitSwapRequest} className="p-6">
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 mb-6">
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">
                                    {/* 🛡️ M11: an admin is almost never looking at their
                                        own shift here, and calling it "Your Shift" is
                                        exactly the misreading that has to be impossible. */}
                                    {swapSubject?.holdsShift ? 'Your Shift to Swap' : 'Shift to Reassign'}
                                </p>
                                <p className="text-sm font-black text-slate-800 dark:text-white mb-1">{selectedShift.date}</p>
                                <div className="flex gap-2 items-center">
                                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400">{selectedShift.task}</span>
                                    <span className="text-xs text-slate-500 font-medium">currently assigned to {selectedShift.staff}</span>
                                </div>

                                {/* 🛡️ A3 + M11: name the duty being handed over AND the
                                    person it is being taken from. The colleague who
                                    accepts takes over exactly this role — no promotion,
                                    and nobody else's duty changes. */}
                                {swapSubject?.holdsShift && (
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                                        You hold this shift as{' '}
                                        <span className="font-black text-indigo-600 dark:text-indigo-400 uppercase">{describeShiftRole(swapSubject.swapRole)}</span>
                                        {' '}— that is the duty your colleague would take over.
                                    </p>
                                )}

                                {swapSubject?.onBehalf && (
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                                        Arranging cover on behalf of{' '}
                                        <span className="font-black text-indigo-600 dark:text-indigo-400">{swapSubject.requestedBy}</span>
                                        {' '}(<span className="font-black text-indigo-600 dark:text-indigo-400 uppercase">{describeShiftRole(swapSubject.swapRole)}</span>).
                                        {' '}This is not your shift — {swapSubject.requestedBy} is the person being swapped out, and the request will be
                                        recorded as arranged by you.
                                    </p>
                                )}

                                {swapSubject && !swapSubject.ok && (
                                    <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-2 flex items-start gap-1.5">
                                        <ShieldAlert size={13} className="shrink-0 mt-px" />
                                        <span>{swapSubject.reason}</span>
                                    </p>
                                )}
                            </div>

                            <div className="space-y-4 mb-6">
                                {/* 🛡️ M11: the duty picker. Rendered only when the acting
                                    user is NOT on the shift and it has more than one
                                    person on it — a single-holder (or legacy) shift has
                                    nothing to choose, so `resolveSwapSubject` selects it
                                    and the banner above simply states it. */}
                                {swapSubject && !swapSubject.holdsShift && swapSubject.assignableRoles.length > 1 && (
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1 block">Whose Duty Are You Reassigning?</label>
                                        <select
                                            required
                                            value={swapRoleChoice}
                                            onChange={(e) => setSwapRoleChoice(e.target.value)}
                                            className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                        >
                                            <option value="" disabled>Select a duty...</option>
                                            {swapSubject.assignableRoles.map(({ role, holder }) => (
                                                <option key={role} value={role}>
                                                    {describeShiftRole(role)} — {holder}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div>
                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1 block">Request Coverage From:</label>
                                    <select 
                                        required
                                        value={swapTargetStaff}
                                        onChange={(e) => setSwapTargetStaff(e.target.value)}
                                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                    >
                                        <option value="" disabled>Select a Colleague...</option>
                                        {/* 🛡️ A4 FIX: this was
                                            `.filter(name => !selectedShift.staff?.includes(name))`
                                            — a SUBSTRING test against the composite
                                            display string "Lead: X, Co: Y". It happened
                                            to work only because no current name is a
                                            substring of another: a "Lynn" silently
                                            disappeared from this dropdown whenever
                                            "Fadzlynn" was on the shift, and could never
                                            be asked to cover. Now an identity comparison
                                            against the shift's lead/coLead. */}
                                        {filterSwapCandidates(config.staff, selectedShift).map(colleague => (
                                            <option key={colleague} value={colleague}>{colleague}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1 block">Reason (Optional):</label>
                                    <textarea 
                                        value={swapReason}
                                        onChange={(e) => setSwapReason(e.target.value)}
                                        placeholder="e.g. Attending a medical conference..."
                                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none h-20 resize-none"
                                    />
                                </div>
                            </div>

                            {/* 🛡️ M11: a request AURA already knows it cannot apply is
                                not submittable. `title` carries the reason for the
                                disabled state, as the Generate button does. */}
                            <button
                                type="submit"
                                disabled={isSubmitting || !swapSubject?.ok}
                                title={swapSubject?.ok ? undefined : swapSubject?.reason}
                                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-widest rounded-xl transition-colors shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2"
                            >
                                <ArrowRightLeft size={16} />
                                {isSubmitting
                                    ? 'Transmitting...'
                                    : (swapSubject?.onBehalf ? 'Arrange Cover' : 'Submit Request')}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {isConfigOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
                    <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-700 animate-in zoom-in-95">
                        
                        <div className="flex items-center gap-2 mb-4">
                            {isDemo && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded">SANDBOX MODE</span>}
                            <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase flex items-center gap-2">
                                <Settings size={20} /> AURA Configuration Wizard
                            </h3>
                        </div>
                        
                        <div className="space-y-4 mb-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase">Start Date</label>
                                    <input 
                                        type="date" 
                                        className="input-field w-full mt-1 font-bold bg-white dark:bg-slate-900 border dark:border-slate-700 rounded p-2 text-slate-800 dark:text-white" 
                                        value={config.startDate} 
                                        onChange={(e) => setConfig({...config, startDate: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase">Weeks</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max={MAX_ROSTER_WEEKS}
                                        step="1"
                                        className="input-field w-full mt-1 font-bold bg-white dark:bg-slate-900 border dark:border-slate-700 rounded p-2 text-slate-800 dark:text-white"
                                        value={config.weeks}
                                        // 🛡️ M3 FIX: an empty field is kept as '' rather than becoming
                                        // parseInt('') === NaN. '' is rejected by validateRosterConfig,
                                        // so the field can still be cleared and retyped, but an
                                        // unparseable value can no longer reach generateRoster.
                                        onChange={(e) => {
                                            const raw = e.target.value;
                                            setConfig({ ...config, weeks: raw === '' ? '' : Number(raw) });
                                        }}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase">Staff Pool (Order Matters)</label>
                                <textarea 
                                    className="input-field w-full mt-1 h-20 font-mono text-xs bg-white dark:bg-slate-900 border dark:border-slate-700 rounded p-2 text-slate-800 dark:text-white" 
                                    value={config.staff.join(', ')} 
                                    readOnly={isDemo} 
                                    onChange={(e) => setConfig({...config, staff: e.target.value.split(',').map(s => s.trim())})}
                                />
                                {isDemo && <p className="text-[10px] text-emerald-600 mt-1 italic">Simulation Locked: Using Marvel Dataset</p>}
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase">Core Tasks</label>
                                <textarea 
                                    className="input-field w-full mt-1 h-20 font-mono text-xs bg-white dark:bg-slate-900 border dark:border-slate-700 rounded p-2 text-slate-800 dark:text-white" 
                                    value={config.tasks.join(', ')} 
                                    onChange={(e) => setConfig({...config, tasks: e.target.value.split(',').map(t => t.trim())})}
                                />
                            </div>
                        </div>

                        {/* 🛡️ M3 FIX: tell the user why generation is unavailable. */}
                        {!configValidation.valid && (
                            <p className="-mt-4 mb-4 text-xs font-bold text-red-600 dark:text-red-400 flex items-start gap-1.5">
                                <ShieldAlert size={14} className="shrink-0 mt-px" />
                                <span>{configValidation.reason}</span>
                            </p>
                        )}

                        <div className="flex gap-2">
                            <button onClick={() => setIsConfigOpen(false)} className="flex-1 py-3 text-slate-500 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
                            <button
                                onClick={handleGenerateClick}
                                disabled={!configValidation.valid}
                                title={configValidation.valid ? undefined : configValidation.reason}
                                className={`flex-1 py-3 text-white font-bold rounded-lg shadow-lg transition-colors flex justify-center items-center gap-2 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 disabled:shadow-none disabled:cursor-not-allowed ${isDemo ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                            >
                                <Play size={16} /> {isDemo ? 'Simulate Check' : 'Generate Roster'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 🌟 CUSTOM GENERATE CONFIRMATION MODAL
                🛡️ The old copy ("will overwrite the currently displayed schedule") was
                false in both directions: the write was not scoped to the displayed
                month, and it erased every other period in the document. It now names
                the exact range about to be written and the staff pool that will be
                used, so an M1-style demo pool is visible BEFORE the click.
                Range comes from describeGenerationRange, which reads the keys
                generateRoster really produces — start dates are not Monday-snapped
                today, so a Sunday start honestly shows a Sunday. */}
            <ConfirmationModal
                isOpen={isConfirmModalOpen}
                title="NEXUS says"
                message={generationPlan ? (
                    <>
                        <span className="block">
                            Generate a {config.weeks}-week roster?
                        </span>
                        <span className="block mt-3 text-sm text-slate-400">
                            Writes <span className="font-bold text-slate-200">{generationPlan.dayCount}</span> days:
                            <span className="block font-bold text-slate-200">
                                {formatRosterDateKey(generationPlan.firstDate)} → {formatRosterDateKey(generationPlan.lastDate)}
                            </span>
                        </span>
                        <span className="block mt-2 text-sm text-slate-400">
                            Every shift already stored on those dates is replaced. Dates outside this range are left untouched.
                        </span>
                        <span className="block mt-3 text-sm text-slate-400">
                            Staff pool:
                            <span className="block font-bold text-slate-200">{config.staff.join(', ')}</span>
                        </span>
                    </>
                ) : `Cannot generate: ${configValidation.reason || 'this configuration produces no dates.'}`}
                onCancel={() => setIsConfirmModalOpen(false)}
                onConfirm={executeRosterGeneration}
            />

        </div>
    );
};

export default RosterView;
