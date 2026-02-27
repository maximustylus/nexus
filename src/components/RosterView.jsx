import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Calendar, Download, Settings, ChevronLeft, ChevronRight, Play, FileSpreadsheet, ShieldAlert, ArrowRightLeft, X } from 'lucide-react';
import { generateRoster, downloadICS, downloadCSV } from '../utils/auraEngine';

// --- SANDBOX IMPORTS ---
import { useNexus } from '../context/NexusContext';
import { MOCK_ROSTER, MOCK_STAFF_NAMES } from '../data/mockData';

// 🛡️ FIX: Accept 'user' prop so we know who is logged in
const RosterView = ({ user }) => {
    // --- CONTEXT ---
    const { isDemo } = useNexus();

    // --- STATE ---
    const [currentDate, setCurrentDate] = useState(new Date(2026, 1, 1)); // Default to Feb 2026
    const [rosterData, setRosterData] = useState({});
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    
    // --- SWAP MODAL STATE ---
    const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
    const [selectedShift, setSelectedShift] = useState(null);
    const [swapTargetStaff, setSwapTargetStaff] = useState('');
    const [swapReason, setSwapReason] = useState('');
    
    // Default Config (Editable via Wizard)
    const [config, setConfig] = useState({
        staff: ["Brandon", "Ying Xian", "Derlinder", "Fadzlynn"], // Default Live Staff
        tasks: ["EFT", "IPT+SKG", "NC", "FSG+WI"],
        startDate: "2026-02-01",
        weeks: 4
    });

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
                    task: event.title,
                    category: event.type === 'OnCall' ? 'VC' : 'Clinical' 
                });
            });

            setRosterData(transformedData);
            setConfig(prev => ({
                ...prev,
                staff: MOCK_STAFF_NAMES,
                tasks: ["Avenger Protocol", "Web Slinger Audit", "Cerebro Scan", "Shield Patrol"]
            }));

        } else {
            const unsub = onSnapshot(doc(db, 'system_data', 'roster_2026'), (doc) => {
                if (doc.exists()) setRosterData(doc.data());
            });
            return () => unsub();
        }
    }, [isDemo]);

    // --- ACTIONS ---
    const handleGenerate = async () => {
        if (isDemo) {
            alert("🧪 [SANDBOX] AURA is simulating roster conflict resolution for the Marvel Team...");
            setTimeout(() => {
                alert("✅ Simulation Complete. Zero conflicts found in multiverse timeline.");
                setIsConfigOpen(false);
            }, 1500);
            return;
        }

        if(!window.confirm("Overwrite existing roster with new AURA configuration?")) return;
        const newData = generateRoster(config);
        await setDoc(doc(db, 'system_data', 'roster_2026'), newData);
        setIsConfigOpen(false);
        alert("✅ AURA has generated a conflict-free roster.");
    };

    const handleMonthChange = (offset) => {
        const newDate = new Date(currentDate.setMonth(currentDate.getMonth() + offset));
        setCurrentDate(new Date(newDate));
    };

    // --- SWAP LOGIC ---
    const handleShiftClick = (shift, dateKey) => {
        // Only allow clicking if they are an admin OR if it is their own shift
        const isMyShift = isDemo ? true : shift.staff === user?.name;
        
        if (isMyShift || user?.role === 'admin') {
            setSelectedShift({ ...shift, date: dateKey });
            setIsSwapModalOpen(true);
        }
    };

    const submitSwapRequest = (e) => {
        e.preventDefault();
        if (!swapTargetStaff) return;
        
        // Phase 3 Preview: This is where we will push to Firebase
        console.log("SWAP REQUESTED:", {
            fromUser: isDemo ? 'Tony Stark' : user?.name,
            originalShift: selectedShift,
            targetColleague: swapTargetStaff,
            reason: swapReason,
            status: 'PENDING'
        });

        alert(`Swap request sent to ${swapTargetStaff}! They will be notified by AURA.`);
        setIsSwapModalOpen(false);
        setSwapTargetStaff('');
        setSwapReason('');
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
                        
                        {/* DATE NAVIGATOR */}
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

            {/* CALENDAR GRID */}
            <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-700 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} className="bg-slate-50 dark:bg-slate-800 p-2 text-center text-xs font-bold text-slate-400 uppercase">
                        {d}
                    </div>
                ))}
                
                {/* Empty Cells */}
                {Array.from({ length: firstDayIndex }).map((_, i) => (
                    <div key={`empty-${i}`} className="bg-white dark:bg-slate-900 h-32" />
                ))}

                {/* Days */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const { shifts, dateKey } = getShifts(day);
                    
                    return (
                        <div key={day} className="bg-white dark:bg-slate-900 h-32 p-1 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors relative group border-t border-l border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                            <span className="text-xs font-bold text-slate-400 absolute top-1 right-2">{day}</span>
                            
                            <div className="mt-5 flex flex-col gap-1 overflow-y-auto max-h-[90px] custom-scrollbar">
                                {shifts.map((s, idx) => {
                                    // Identify if the logged-in user owns this shift
                                    const isMyShift = isDemo ? true : s.staff === user?.name;

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
                            {/* Shift Details */}
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 mb-6">
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Your Shift to Swap</p>
                                <p className="text-sm font-black text-slate-800 dark:text-white mb-1">{selectedShift.date}</p>
                                <div className="flex gap-2 items-center">
                                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400">{selectedShift.task}</span>
                                    <span className="text-xs text-slate-500 font-medium">currently assigned to {selectedShift.staff}</span>
                                </div>
                            </div>

                            {/* Target Selection */}
                            <div className="space-y-4 mb-6">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1 block">Request Coverage From:</label>
                                    <select 
                                        required
                                        value={swapTargetStaff}
                                        onChange={(e) => setSwapTargetStaff(e.target.value)}
                                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                    >
                                        <option value="" disabled>Select a Colleague...</option>
                                        {config.staff.filter(name => name !== selectedShift.staff).map(colleague => (
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

                            <button 
                                type="submit"
                                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-colors shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2"
                            >
                                <ArrowRightLeft size={16} /> Submit Request
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* OLD CONFIGURATION WIZARD MODAL CODE STAYS HERE EXACTLY AS IT WAS... */}
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
                                        className="input-field w-full mt-1 font-bold bg-white dark:bg-slate-900 border dark:border-slate-700 rounded p-2 text-slate-800 dark:text-white" 
                                        value={config.weeks} 
                                        onChange={(e) => setConfig({...config, weeks: parseInt(e.target.value)})}
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

                        <div className="flex gap-2">
                            <button onClick={() => setIsConfigOpen(false)} className="flex-1 py-3 text-slate-500 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
                            <button 
                                onClick={handleGenerate} 
                                className={`flex-1 py-3 text-white font-bold rounded-lg shadow-lg transition-colors flex justify-center items-center gap-2 ${isDemo ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                            >
                                <Play size={16} /> {isDemo ? 'Simulate Check' : 'Generate Roster'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RosterView;
