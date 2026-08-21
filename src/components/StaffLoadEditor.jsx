import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { MONTHS } from '../utils';
import { useTeam } from '../context/TeamContext';
import { loadPath } from '../utils/teamPaths';

const StaffLoadEditor = () => {
    // `STAFF_LIST` — ten hardcoded names — is the team's own member list now, and
    // the load document is keyed by uid rather than by the name it renders.
    const { teamId, members } = useTeam();
    // State to hold the grid of numbers
    const [loads, setLoads] = useState({});
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');

    // 1. Fetch existing data when page loads
    useEffect(() => {
        if (!teamId) { setLoads({}); return; }

        const fetchData = async () => {
            const newLoads = {};
            for (const member of members) {
                const docSnap = await getDoc(doc(db, ...loadPath(teamId, member.uid)));
                newLoads[member.uid] = docSnap.exists()
                    ? docSnap.data().data      // an array of 12 numbers
                    : Array(12).fill(0);
            }
            setLoads(newLoads);
        };
        fetchData();
    }, [teamId, members]);

    // 2. Handle typing in the boxes
    const handleChange = (uid, monthIndex, value) => {
        const val = parseInt(value) || 0;
        setLoads(prev => ({
            ...prev,
            [uid]: prev[uid].map((item, idx) => idx === monthIndex ? val : item)
        }));
    };

    // 3. Save to Firebase
    const handleSave = async () => {
        if (!teamId) { setStatus('No team selected.'); return; }
        setLoading(true);
        setStatus('Saving...');
        try {
            // Save each staff member as a separate document
            // Keyed by uid, so renaming somebody does not orphan their loads under
            // the old spelling and start a fresh row under the new one.
            const promises = members.map(member =>
                setDoc(doc(db, ...loadPath(teamId, member.uid)), {
                    data: loads[member.uid],
                    lastUpdated: new Date()
                })
            );
            await Promise.all(promises);
            setStatus('✅ Saved Successfully!');
            setTimeout(() => setStatus(''), 3000);
        } catch (error) {
            console.error("Error saving:", error);
            setStatus('❌ Error Saving');
        }
        setLoading(false);
    };

    return (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 mb-8">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                    Update Clinical Loads
                </h3>
                <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-green-600">{status}</span>
                    <button 
                        onClick={handleSave}
                        disabled={loading}
                        className={`px-6 py-2 rounded-lg font-bold text-white transition-all ${
                            loading ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-blue-500/30'
                        }`}
                    >
                        {loading ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-300">
                        <tr>
                            <th className="px-4 py-3 rounded-tl-lg">Staff Name</th>
                            {MONTHS.map(month => (
                                <th key={month} className="px-2 py-3 text-center">{month}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {members.map((member) => (
                            <tr key={member.uid} className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                                    {member.displayName}
                                </td>
                                {loads[member.uid]?.map((val, idx) => (
                                    <td key={idx} className="px-1 py-2">
                                        <input
                                            type="number"
                                            value={val}
                                            onChange={(e) => handleChange(member.uid, idx, e.target.value)}
                                            className="w-16 p-1 text-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white"
                                        />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default StaffLoadEditor;
