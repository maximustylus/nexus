import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Calendar, AlertTriangle, Activity, Download, TrendingUp } from 'lucide-react';
import { STAFF_LIST } from '../utils';
import { MOCK_STAFF_NAMES } from '../data/mockData'; // Import Marvel Names
import { useNexus } from '../context/NexusContext'; // Import Context

const AdminWellbeingPanel = () => {
    const { isDemo } = useNexus(); // <--- GET DEMO STATE
    const [historyData, setHistoryData] = useState({});
    const [loading, setLoading] = useState(false);

    // Fetch Full History on Mount (Only if NOT in Demo)
    useEffect(() => {
        if (!isDemo) {
            fetchHistory();
        }
    }, [isDemo]);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const querySnapshot = await getDocs(collection(db, 'wellbeing_history'));
            const historyMap = {};
            querySnapshot.forEach((doc) => {
                historyMap[doc.id] = doc.data().logs || [];
            });
            setHistoryData(historyMap);
        } catch (error) {
            console.error("Error fetching admin history:", error);
        } finally {
            setLoading(false);
        }
    };

    const getLast7Days = () => {
        const dates = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dates.push(d.toLocaleDateString()); 
        }
        return dates;
    };

    const getCellColor = (energy) => {
        if (energy === null || energy === undefined) return 'bg-slate-50 dark:bg-slate-900'; // Empty
        if (energy > 79) return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
        if (energy > 49) return 'bg-yellow-100 text-yellow-700 border border-yellow-200';
        return 'bg-red-100 text-red-700 border border-red-200 font-bold';
    };

    // --- MOCK DATA GENERATOR FOR SANDBOX ---
    const getMockEnergy = (staffName, dayIndex) => {
        // Make Tony Stark (Iron Man) have low energy (High Risk)
        if (staffName.includes('Tony')) return 30 + (dayIndex * 2);
        // Make Bruce Banner unstable
        if (staffName.includes('Bruce')) return dayIndex % 2 === 0 ? 40 : 85;
        // Everyone else relatively stable
        return 80 + (dayIndex % 10);
    };

    // Select the correct list based on mode
    const activeStaffList = isDemo ? MOCK_STAFF_NAMES : STAFF_LIST;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2 uppercase">
                        <Activity className="text-indigo-600" size={20}/> 
                        Clinical Burnout Monitor (7-Day)
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                        CONFIDENTIAL: For HOD/Lead use only. Displays trends to identify burnout risks.
                    </p>
                </div>
                {!isDemo && (
                    <button 
                        onClick={fetchHistory}
                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Refresh Data"
                    >
                        {loading ? <Activity className="animate-spin"/> : <Download size={18}/>}
                    </button>
                )}
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
                            <tr>
                                <th className="px-6 py-4 font-bold">Staff Member</th>
                                {getLast7Days().map(date => (
                                    <th key={date} className="px-2 py-4 text-center min-w-[80px]">
                                        {date.split('/')[0]}/{date.split('/')[1]}
                                    </th>
                                ))}
                                <th className="px-6 py-4 text-center font-bold text-slate-700 dark:text-slate-300">
                                    Risk Assessment
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {activeStaffList.map((name, idx) => {
                                let weekAvg = null;
                                let dailyEnergies = [];

                                if (isDemo) {
                                    // --- SANDBOX LOGIC ---
                                    const dates = getLast7Days();
                                    dailyEnergies = dates.map((_, i) => getMockEnergy(name, i));
                                    weekAvg = Math.round(dailyEnergies.reduce((a,b)=>a+b,0) / 7);
                                } else {
                                    // --- REAL LOGIC ---
                                    const staffId = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                                    const dataKey = Object.keys(historyData).find(k => k.includes(staffId)) || staffId;
                                    const logs = historyData[dataKey] || [];
                                    const dates = getLast7Days();
                                    
                                    dailyEnergies = dates.map(dateStr => {
                                        const log = logs.find(l => l.displayDate === dateStr) || 
                                                    logs.find(l => new Date(l.timestamp).toLocaleDateString() === dateStr);
                                        return log ? log.energy : null;
                                    });

                                    const validEnergies = dailyEnergies.filter(e => e !== null);
                                    weekAvg = validEnergies.length > 0 
                                        ? Math.round(validEnergies.reduce((a, b) => a + b, 0) / validEnergies.length) 
                                        : null;
                                }

                                return (
                                    <tr key={name} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200">
                                            {name}
                                        </td>
                                        
                                        {/* RENDER DAILY CELLS */}
                                        {dailyEnergies.map((energy, i) => (
                                            <td key={i} className="p-2">
                                                <div className={`w-full h-10 rounded-lg flex items-center justify-center text-xs ${getCellColor(energy)}`}>
                                                    {energy !== null ? `${energy}%` : '-'}
                                                </div>
                                            </td>
                                        ))}

                                        {/* RENDER RISK ASSESSMENT */}
                                        <td className="px-6 py-4 text-center">
                                            {weekAvg !== null ? (
                                                weekAvg < 50 ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 font-bold text-xs border border-red-200">
                                                        <AlertTriangle size={12}/> HIGH RISK
                                                    </span>
                                                ) : weekAvg < 70 ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 font-bold text-xs border border-yellow-200">
                                                        MONITOR
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold text-xs border border-emerald-200">
                                                        STABLE
                                                    </span>
                                                )
                                            ) : <span className="text-slate-300 italic text-xs">Insufficient Data</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* AI INSIGHT FOOTER (Dynamic based on Mode) */}
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 flex items-start gap-3 animate-in slide-in-from-bottom-2">
                <TrendingUp className="text-blue-500 mt-1" size={20} />
                <div>
                    <h4 className="font-bold text-blue-800 dark:text-blue-300 text-sm">AI Recommendation Engine</h4>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 leading-relaxed">
                        {isDemo 
                          ? "SANDBOX ALERT: Anomalies detected in Tony Stark's energy levels. High probability of burnout due to 'Ultron Initiative'. Recommended Action: Mandatory leave."
                          : "System indicates stable workload distribution across the department. Continue monitoring weekly trends for early signs of clinical fatigue."}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AdminWellbeingPanel;
