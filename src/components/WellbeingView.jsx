import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Battery, BatteryCharging, BatteryWarning, BatteryFull, Users, Activity, Zap, X, Save } from 'lucide-react';
import { STAFF_LIST } from '../utils';

// --- CONTEXT & DATA ---
import { useNexus } from '../context/NexusContext';
import { MOCK_STAFF } from '../data/mockData';

const WellbeingView = () => {
    const { isDemo } = useNexus(); 
    const [pulseData, setPulseData] = useState({});
    const [stats, setStats] = useState({ avg: 0, active: 0, zone: 'HEALTHY' });

    // --- MODAL STATE ---
    const [selectedStaff, setSelectedStaff] = useState(null);
    const [newEnergy, setNewEnergy] = useState(50);

    const activeStaffList = isDemo ? MOCK_STAFF.map(s => s.name) : STAFF_LIST;

    useEffect(() => {
        if (isDemo) {
            const mockPulse = {};
            MOCK_STAFF.forEach(char => {
                mockPulse[char.name] = {
                    energy: char.battery,
                    lastUpdate: 'Just now',
                    status: 'online'
                };
            });
            setPulseData(mockPulse);
            calculateStats(mockPulse);
        } else {
            const unsub = onSnapshot(doc(db, 'system_data', 'daily_pulse'), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setPulseData(data);
                    calculateStats(data);
                }
            });
            return () => unsub();
        }
    }, [isDemo]);

    const calculateStats = (data) => {
        const values = Object.values(data);
        if (values.length === 0) return;
        const total = values.reduce((acc, curr) => acc + curr.energy, 0);
        const avg = Math.round(total / values.length);
        setStats({
            avg,
            active: values.length,
            zone: avg > 79 ? 'HEALTHY' : avg > 49 ? 'REACTING' : 'INJURED'
        });
    };

    // --- CLICK HANDLERS ---
    const handleCardClick = (name, currentEnergy) => {
        setSelectedStaff(name);
        setNewEnergy(currentEnergy || 50);
    };

    const handleSavePulse = async () => {
        const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        if (isDemo) {
            // 🛡️ FIREWALL: Update Sandbox State Only
            const updatedData = {
                ...pulseData,
                [selectedStaff]: {
                    energy: parseInt(newEnergy),
                    lastUpdate: timeString,
                    status: 'online'
                }
            };
            setPulseData(updatedData);
            calculateStats(updatedData);
        } else {
            // 📡 LIVE: Update Firebase
            await setDoc(doc(db, 'system_data', 'daily_pulse'), {
                [selectedStaff]: { energy: parseInt(newEnergy), lastUpdate: timeString, status: 'online' }
            }, { merge: true });
        }
        
        setSelectedStaff(null); // Close modal
    };

    const getBatteryIcon = (level) => {
        if (level > 75) return <BatteryFull className="text-emerald-500" size={24} />;
        if (level > 40) return <BatteryCharging className="text-yellow-500" size={24} />;
        return <BatteryWarning className="text-red-500" size={24} />;
    };

    const getBarColor = (level) => {
        if (level > 75) return 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]';
        if (level > 40) return 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.4)]';
        return 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]';
    };

    return (
        <div className="w-full max-w-[1600px] mx-auto p-6 md:p-10 space-y-10 animate-in fade-in duration-700">
            
            {/* 1. HERO SECTION */}
            <div className="w-full bg-slate-900 rounded-3xl p-8 lg:p-12 text-white shadow-2xl relative overflow-hidden border border-slate-800 flex flex-col xl:flex-row items-center justify-between gap-12">
                <div className="absolute -top-40 -left-20 w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>
                <div className="absolute -bottom-40 -right-20 w-[500px] h-[500px] bg-emerald-600/10 rounded-full blur-[100px] pointer-events-none"></div>

                {/* LEFT: Capacity Stats */}
                <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left min-w-fit">
                    <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700 backdrop-blur-sm shadow-inner">
                        <Activity size={36} className="text-indigo-400" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-indigo-300 uppercase tracking-widest mb-1">
                            {isDemo ? 'Simulated Capacity' : 'Department Capacity'}
                        </h2>
                        <div className="flex items-baseline justify-center sm:justify-start gap-2">
                            <span className="text-7xl font-black tracking-tighter text-white drop-shadow-lg">{stats.avg}</span>
                            <span className="text-4xl font-bold text-slate-500">%</span>
                        </div>
                        
                        <div className={`mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold border backdrop-blur-md ${
                             stats.zone === 'HEALTHY' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                             stats.zone === 'REACTING' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' :
                             'bg-red-500/10 text-red-400 border-red-500/30'
                        }`}>
                            <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] ${
                                stats.zone === 'HEALTHY' ? 'bg-emerald-400 animate-pulse' : 
                                stats.zone === 'REACTING' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400 animate-pulse'
                            }`}></div>
                            ZONE: {stats.zone}
                        </div>
                    </div>
                </div>

                {/* MIDDLE: Wide Progress Bar */}
                <div className="w-full flex-1 max-w-4xl flex flex-col justify-center space-y-4 px-2 lg:px-8">
                    <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                        <span>Critical</span>
                        <span className="hidden sm:inline">Sustainable Load</span>
                        <span>Optimal</span>
                    </div>
                    
                    <div className="h-10 w-full bg-slate-800/60 rounded-full overflow-hidden backdrop-blur-sm border border-slate-700/50 relative shadow-inner">
                        <div className="absolute top-0 bottom-0 left-[33%] w-0.5 bg-slate-700/50 z-10"></div>
                        <div className="absolute top-0 bottom-0 left-[66%] w-0.5 bg-slate-700/50 z-10"></div>
                        
                        <div 
                            className={`h-full transition-all duration-1000 ease-out shadow-[0_0_30px_rgba(0,0,0,0.5)] ${
                                stats.zone === 'HEALTHY' ? 'bg-gradient-to-r from-emerald-600 to-teal-400' :
                                stats.zone === 'REACTING' ? 'bg-gradient-to-r from-yellow-500 to-orange-400' :
                                'bg-gradient-to-r from-red-600 to-rose-500'
                            }`} 
                            style={{ width: `${stats.avg}%` }}
                        />
                    </div>
                    <div className="flex justify-end items-center gap-2 text-xs text-slate-400 font-medium pt-1">
                        <Users size={16} />
                        <span>{stats.active} of {activeStaffList.length} Checked In</span>
                    </div>
                </div>
            </div>

            {/* 2. LIVE STATUS GRID */}
            <div className="w-full">
                <div className="flex items-center gap-3 mb-8 pl-2">
                    <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
                        <Zap className="text-indigo-500" size={20} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-700 dark:text-slate-200 uppercase tracking-tight">
                        {isDemo ? 'Live Team Status (Demo)' : 'Live Team Status'}
                    </h3>
                </div>
                
                <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 lg:gap-8">
                    {activeStaffList.map((name) => {
                        const dataKey = Object.keys(pulseData).find(k => k.toLowerCase().includes(name.toLowerCase()));
                        const staffData = pulseData[name] || pulseData[dataKey];
                        const currentEnergy = staffData ? staffData.energy : 0;
                        
                        return (
                            <div 
                                key={name} 
                                onClick={() => handleCardClick(name, currentEnergy)}
                                className="group cursor-pointer bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between h-[200px]"
                            >
                                <div className="flex justify-between items-start">
                                    <div className="overflow-hidden">
                                        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 transition-colors truncate pr-2">
                                            {name}
                                        </h3>
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className={`w-2.5 h-2.5 rounded-full ${staffData ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300'}`}></span>
                                            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                                                {staffData ? staffData.lastUpdate : 'OFFLINE'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl shrink-0">
                                        {staffData ? getBatteryIcon(staffData.energy) : <Battery className="text-slate-300" size={28} />}
                                    </div>
                                </div>

                                <div className="space-y-2 mt-auto">
                                    <div className="flex justify-between items-end">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">Energy</span>
                                        <span className={`text-2xl font-black ${staffData ? 'text-slate-800 dark:text-white' : 'text-slate-300'}`}>
                                            {currentEnergy}%
                                        </span>
                                    </div>
                                    <div className="h-3.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full rounded-full transition-all duration-700 ${staffData ? getBarColor(staffData.energy) : 'bg-slate-300'}`}
                                            style={{ width: `${currentEnergy}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 3. INTERACTIVE UPDATE MODAL */}
            {selectedStaff && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-white dark:bg-slate-800 w-full max-w-sm rounded-3xl shadow-2xl p-6 border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 duration-300">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Update Pulse</h3>
                            <button onClick={() => setSelectedStaff(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        
                        <div className="text-center mb-6">
                            <div className="text-sm font-bold text-slate-500 uppercase mb-2">Staff Member</div>
                            <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400">{selectedStaff}</div>
                        </div>

                        <div className="mb-8">
                            <div className="flex justify-between text-xs font-bold text-slate-400 uppercase mb-4">
                                <span>Depleted</span>
                                <span className="text-slate-800 dark:text-white text-2xl">{newEnergy}%</span>
                                <span>Optimal</span>
                            </div>
                            <input 
                                type="range" 
                                min="0" max="100" 
                                value={newEnergy} 
                                onChange={(e) => setNewEnergy(e.target.value)}
                                className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                        </div>

                        <button 
                            onClick={handleSavePulse}
                            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl uppercase transition-colors shadow-lg flex items-center justify-center gap-2"
                        >
                            <Save size={20} />
                            {isDemo ? 'Save Simulation' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WellbeingView;
