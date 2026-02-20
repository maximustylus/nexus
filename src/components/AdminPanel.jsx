import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  updateDoc, doc, arrayUnion, arrayRemove, getDoc, setDoc, writeBatch 
} from 'firebase/firestore';
import { 
  LayoutList, X, Save, Briefcase, Activity, Calendar 
} from 'lucide-react';

// Components
import SmartReportView from './SmartReportView';
import AdminWellbeingPanel from './AdminWellbeingPanel';

// Utils & Data
import { STAFF_LIST, STATUS_OPTIONS, DOMAIN_LIST } from '../utils';
import { MOCK_STAFF_NAMES } from '../data/mockData'; 
import { useNexus } from '../context/NexusContext';   

// STATIC VARIABLES
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const AdminPanel = ({ teamData, staffLoads, user }) => {
    // --- CONTEXT ---
    const { isDemo } = useNexus(); 

    // --- DYNAMIC STAFF LIST SWITCHER ---
    const activeStaffList = isDemo ? MOCK_STAFF_NAMES : STAFF_LIST;

    // --- 🛡️ MOVED INSIDE: Safely filters the list after it is defined ---
    const CEP_STAFF = activeStaffList.filter(name => 
        !['Ashik', 'Benny', 'Evelyn', 'Mini', 'Nisa'].includes(name)
    );

    // --- TABS STATE ---
    const [activeTab, setActiveTab] = useState('OPERATIONS'); 

    // --- TASKS STATE ---
    const [newOwner, setNewOwner] = useState('');
    const [newDomain, setNewDomain] = useState('MANAGEMENT');
    const [newType, setNewType] = useState('Task');
    const [newTitle, setNewTitle] = useState('');
    const [newYear, setNewYear] = useState('2026'); 
    
    // --- ATTENDANCE STATE ---
    const [attYear, setAttYear] = useState('2026');
    const [attValues, setAttValues] = useState(Array(12).fill(0));
    const [attLoading, setAttLoading] = useState(false);

    // --- CLINICAL LOADS STATE (Local) ---
    const [localLoads, setLocalLoads] = useState({});
    const [loadYear, setLoadYear] = useState('2026');
    const [loadLoading, setLoadLoading] = useState(false);
    
    // --- SYSTEM STATE ---
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    // --- SHARED STYLES ---
    const cardStyle = "bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 mb-6";
    const headerStyle = "text-lg font-black text-slate-700 dark:text-slate-200 uppercase tracking-wide flex items-center gap-2 mb-0";
    const inputStyle = "w-full bg-white text-slate-900 border border-slate-200 rounded px-2 py-1 text-center font-bold text-sm focus:ring-2 focus:ring-blue-500 outline-none";
    const headerRowStyle = "flex justify-between items-center mb-6";

    // --- SYNC LOCAL LOADS ---
    useEffect(() => {
        if (staffLoads) setLocalLoads(staffLoads);
    }, [staffLoads]);

  // --- EFFECT: FETCH CLINICAL LOADS & ATTENDANCE ---
    useEffect(() => {
        if (isDemo) {
            setAttValues([120, 145, 160, 155, 180, 190, 195, 185, 200, 210, 190, 180]);
            return;
        }

        const fetchData = async () => {
            setLoadLoading(true);
            try {
                // 1. Determine Collection
                const is2025 = loadYear === '2025';
                const collectionName = is2025 ? 'archive_2025' : 'staff_loads';
                
                const loadSnap = await getDocs(collection(db, collectionName));
                const newLoads = {};
                
                // 🧹 NORMALIZER: Strips spaces and underscores
                const normalize = (str) => String(str || "").toLowerCase().replace(/[\s_]/g, '');

                loadSnap.forEach(doc => {
                    const data = doc.data();
                    
                    // 🔀 TRANSLATOR: Match database ID (ying_xian) to UI Name (Ying Xian)
                    const matchingStaffName = CEP_STAFF.find(name => 
                        normalize(name) === normalize(doc.id)
                    ) || doc.id; // Fallback to doc.id if not found

                    // 3. Extract the Data
                    if (is2025) {
                        const clinicalProject = (data.projects || []).find(p => 
                            p.title?.toLowerCase().includes("clinical load")
                        );
                        if (clinicalProject && Array.isArray(clinicalProject.monthly_hours)) {
                            // Save under the translated name!
                            newLoads[matchingStaffName] = clinicalProject.monthly_hours;
                        }
                    } else {
                        // Live mode
                        newLoads[matchingStaffName] = data.data;
                    }
                });
                
                setLocalLoads(newLoads);

                // 4. Fetch Attendance
                const attRef = doc(db, 'system_data', 'monthly_attendance');
                const attSnap = await getDoc(attRef);
                if (attSnap.exists()) {
                    setAttValues(attSnap.data()[attYear] || Array(12).fill(0));
                }
            } catch (error) {
                console.error("Fetch Error:", error);
            } finally {
                setLoadLoading(false);
            }
        };

        fetchData();
    }, [loadYear, attYear, isDemo, CEP_STAFF]);
  
    // --- HANDLER: SAVE LOADS ---
    const saveLoads = async () => {
        if (isDemo) {
            setMessage('✅ (Sandbox) Loads simulated save.');
            return;
        }
        setLoadLoading(true);
        try {
          const promises = Object.keys(localLoads).map(staff => 
            updateDoc(doc(db, 'staff_loads', staff), { data: localLoads[staff] })
          );
          await Promise.all(promises);
          setMessage('✅ Clinical Loads Updated!');
        } catch (e) {
          console.error(e);
          setMessage('❌ Error saving loads');
        }
        setLoadLoading(false);
    };

    const handleLoadChange = (staff, index, value) => {
        const newVal = parseInt(value) || 0;
        setLocalLoads(prev => {
          const updated = [...(prev[staff] || Array(12).fill(0))];
          updated[index] = newVal;
          return { ...prev, [staff]: updated };
        });
    };

    // --- HANDLER: SAVE ATTENDANCE ---
    const handleSaveAttendance = async () => {
        if (isDemo) {
            setMessage('✅ (Sandbox) Attendance simulated save.');
            return;
        }
        setAttLoading(true);
        try {
            const docRef = doc(db, 'system_data', 'monthly_attendance');
            await setDoc(docRef, { [attYear]: attValues }, { merge: true });
            setMessage(`✅ Saved Attendance for ${attYear}`);
        } catch (error) {
            setMessage('❌ Error saving attendance: ' + error.message);
        } finally {
            setAttLoading(false);
        }
    };

    const handleAttChange = (index, value) => {
        const newVals = [...attValues];
        newVals[index] = parseInt(value) || 0;
        setAttValues(newVals);
    };

    // --- HANDLER: ADD ITEM ---
    const handleAddItem = async (e) => {
        e.preventDefault();
        if (isDemo) {
            setMessage(`✅ (Sandbox) Added "${newTitle}" to ${newOwner}`);
            setNewTitle('');
            return;
        }
        setLoading(true);
        try {
            if (!newOwner || !newTitle) throw new Error("Owner and Title required");
            const staffRef = doc(db, 'cep_team', newOwner.toLowerCase().replace(' ', '_'));
            await updateDoc(staffRef, {
                projects: arrayUnion({
                    title: newTitle,
                    domain_type: newDomain,
                    item_type: newType,
                    status_dots: 2, 
                    year: newYear 
                })
            });
            setMessage(`✅ Added to ${newYear}: "${newTitle}"`);
            setNewTitle('');
        } catch (error) { setMessage('❌ Error: ' + error.message); } 
        finally { setLoading(false); }
    };

    // --- HANDLER: DELETE ---
    const handleDelete = async (staffId, item) => {
        if(!window.confirm(`Delete "${item.title}"?`)) return;
        if (isDemo) {
            setMessage('🗑️ (Sandbox) Item deleted');
            return;
        }
        setLoading(true);
        try {
            const staffRef = doc(db, 'cep_team', staffId);
            await updateDoc(staffRef, { projects: arrayRemove(item) });
            setMessage('🗑️ Item deleted');
        } catch (error) { setMessage('❌ Error: ' + error.message); } 
        finally { setLoading(false); }
    };

    // --- HANDLER: EDIT FIELD ---
    const handleEditField = async (staffId, itemIndex, field, newValue) => {
        if (isDemo) {
            setMessage(`✅ (Sandbox) Updated ${field}`);
            return;
        }
        setLoading(true);
        try {
            const staffRef = doc(db, 'cep_team', staffId);
            const snapshot = await getDoc(staffRef);
            if (!snapshot.exists()) throw new Error("Staff not found");
            const projects = snapshot.data().projects || [];
            projects[itemIndex] = { ...projects[itemIndex], [field]: newValue };
            await updateDoc(staffRef, { projects });
            setMessage(`✅ Updated ${field}`);
        } catch (error) { setMessage('❌ Error: ' + error.message); } 
        finally { setLoading(false); }
    };

    // --- HANDLER: CHANGE OWNER ---
    const handleChangeOwner = async (oldStaffId, item, newOwnerName) => {
        if (oldStaffId === newOwnerName.toLowerCase().replace(' ', '_')) return;
        if (isDemo) {
            setMessage(`✅ (Sandbox) Moved to ${newOwnerName}`);
            return;
        }
        if (!window.confirm(`Move "${item.title}" to ${newOwnerName}?`)) return;
        setLoading(true);
        try {
            const batch = writeBatch(db);
            const oldRef = doc(db, 'cep_team', oldStaffId);
            batch.update(oldRef, { projects: arrayRemove(item) });
            const newRef = doc(db, 'cep_team', newOwnerName.toLowerCase().replace(' ', '_'));
            const newItem = { ...item }; 
            batch.update(newRef, { projects: arrayUnion(newItem) });
            await batch.commit();
            setMessage(`✅ Moved to ${newOwnerName}`);
        } catch (error) { setMessage('❌ Move failed: ' + error.message); } 
        finally { setLoading(false); }
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* --- HEADER BANNER --- */}
            <div className="bg-slate-800 text-white p-6 rounded-2xl mb-8 flex flex-col md:flex-row justify-between items-center shadow-lg border border-slate-700">
                <div className="mb-4 md:mb-0">
                    <h2 className="text-2xl font-black tracking-tight uppercase">Admin Control Center</h2>
                    <p className="text-xs text-slate-400 font-mono uppercase mt-1">
                        System Database v1.4 • {activeTab === 'OPERATIONS' ? 'Workload Ops' : 'Wellbeing Ops'}
                    </p>
                </div>
                
                <div className="flex bg-slate-900 p-1 rounded-xl">
                    <button 
                        onClick={() => setActiveTab('OPERATIONS')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-bold uppercase transition-all ${activeTab === 'OPERATIONS' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                    >
                        <Briefcase size={14} /> Operations
                    </button>
                    <button 
                        onClick={() => setActiveTab('WELLBEING')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-bold uppercase transition-all ${activeTab === 'WELLBEING' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                    >
                        <Activity size={14} /> Wellbeing
                    </button>
                </div>
            </div>

            {/* ========================================= */}
            {/* TAB 1: OPERATIONS                         */}
            {/* ========================================= */}
            {activeTab === 'OPERATIONS' && (
                <div className="animate-in fade-in">
                    
                    {/* MESSAGE BANNER (Moved from old Sub-Header) */}
                    {message && (
                        <div className="flex justify-end mb-4">
                            <span className="text-xs font-bold px-4 py-2 bg-blue-100 text-blue-700 rounded-lg animate-pulse shadow-sm">
                                {message}
                            </span>
                        </div>
                    )}

                    {/* SECTION 1: AI REPORT VIEW (With Deep Audit built-in) */}
                    <SmartReportView year={loadYear} teamData={teamData} staffLoads={localLoads} user={user} 
                      />

                    {/* ================================================= */}
                    {/* SECTION 2A: CLINICAL LOADS                        */}
                    {/* ================================================= */}
                    <div className={cardStyle}>
                        <div className={headerRowStyle}>
                            <h3 className={headerStyle}>
                                <Activity className="text-blue-500" size={24} />
                                UPDATE CLINICAL LOADS
                            </h3>
                            <div className="flex items-center gap-3">
                                <select 
                                    className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-3 py-1 text-sm font-bold text-slate-700 dark:text-white"
                                    value={loadYear}
                                    onChange={(e) => setLoadYear(e.target.value)}
                                >
                                    <option value="2026">2026</option>
                                    <option value="2025">2025</option>
                                </select>
                                <button 
                                    onClick={saveLoads}
                                    disabled={loadLoading}
                                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold text-xs transition-colors shadow-lg shadow-emerald-500/30"
                                >
                                    <Save size={14} />
                                    {loadLoading ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                <tr className="text-slate-400 border-b border-slate-100 dark:border-slate-700">
                                    <th className="text-left py-2 font-bold uppercase text-xs w-24">Staff Name</th>
                                    {MONTH_LABELS.map(m => <th key={m} className="py-2 font-bold text-center text-[10px]">{m}</th>)}
                                </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                    {activeStaffList
                                        // 🛡️ FILTER: Only include the 5 core CEP staff
                                        .filter(staff => !['Ashik', 'Benny', 'Evelyn', 'Mini', 'Nisa'].includes(staff))
                                        .map(staff => (
                                            <tr key={staff} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                <td className="py-3 font-bold text-slate-700 dark:text-slate-300">{staff}</td>
                                                {(localLoads[staff] || Array(12).fill(0)).map((val, idx) => (
                                                    <td key={idx} className="p-1">
                                                        <input 
                                                            type="number" 
                                                            value={val}
                                                            onChange={(e) => handleLoadChange(staff, idx, e.target.value)}
                                                            className={inputStyle} 
                                                        />
                                                    </td>
                                                ))}
                                            </tr>
                                        ))
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* ================================================= */}
                    {/* SECTION 2B: PATIENT ATTENDANCE                    */}
                    {/* ================================================= */}
                    <div className={cardStyle}>
                        <div className={headerRowStyle}>
                            <h3 className={headerStyle}>
                                <Calendar className="text-emerald-500" size={24} />
                                UPDATE PATIENT ATTENDANCE
                            </h3>
                            <div className="flex items-center gap-3">
                                <select 
                                    className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-3 py-1 text-sm font-bold text-slate-700 dark:text-white"
                                    value={attYear}
                                    onChange={(e) => setAttYear(e.target.value)}
                                >
                                    <option value="2026">2026</option>
                                    <option value="2025">2025</option>
                                </select>
                                <button 
                                    onClick={handleSaveAttendance} 
                                    disabled={attLoading}
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-500/30"
                                >
                                    <Save size={14} /> {attLoading ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
                            {MONTH_LABELS.map((month, idx) => (
                                <div key={month} className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase text-center">{month}</label>
                                    <input 
                                        type="number" 
                                        className={inputStyle}
                                        value={attValues[idx]}
                                        onChange={(e) => handleAttChange(idx, e.target.value)}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ================================================= */}
                    {/* SECTION 3: TASKS & PROJECTS                       */}
                    {/* ================================================= */}
                    <div className={cardStyle}>
                        <div className="mb-6">
                            <h3 className={headerStyle}>
                                <LayoutList className="text-purple-500" size={24} />
                                TASKS & PROJECTS
                            </h3>
                        </div>

                        {/* ADD NEW ENTRY FORM */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 mb-8">
                            
                            <div className="md:col-span-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Year</label>
                                <select className={inputStyle} value={newYear} onChange={(e)=>setNewYear(e.target.value)}>
                                    <option value="2026">2026</option>
                                    <option value="2025">2025</option>
                                </select>
                            </div>

                            <div className="md:col-span-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Owner</label>
                                <select className={inputStyle} value={newOwner} onChange={(e)=>setNewOwner(e.target.value)}>
                                    <option value="">+ Assign...</option>
                                    {activeStaffList.map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                            </div>

                            <div className="md:col-span-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Domain</label>
                                <select className={inputStyle} value={newDomain} onChange={(e)=>setNewDomain(e.target.value)}>
                                    {DOMAIN_LIST.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                            </div>

                            <div className="md:col-span-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Type</label>
                                <select className={inputStyle} value={newType} onChange={(e)=>setNewType(e.target.value)}>
                                    <option value="Task">Task</option>
                                    <option value="Project">Project</option>
                                </select>
                            </div>

                            <div className="md:col-span-5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Title</label>
                                <div className="flex gap-2">
                                    <input 
                                        className={`${inputStyle} text-left`} 
                                        placeholder="Item Title..." 
                                        value={newTitle} 
                                        onChange={(e)=>setNewTitle(e.target.value)} 
                                    />
                                    <button 
                                        onClick={handleAddItem} 
                                        disabled={loading} 
                                        className="px-4 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 text-xs shadow-md transition-all whitespace-nowrap uppercase"
                                    >
                                        Add Entry
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* MASTER LIST TABLE */}
                        <div className="overflow-x-auto border rounded-xl border-slate-200 dark:border-slate-700 shadow-sm">
                            <table className="w-full text-left bg-white dark:bg-slate-900">
                                <thead className="bg-slate-50 dark:bg-slate-800">
                                    <tr>
                                        <th className="py-3 pl-4 text-xs font-black uppercase text-slate-500">Year</th>
                                        <th className="py-3 text-xs font-black uppercase text-slate-500">Owner</th>
                                        <th className="py-3 text-xs font-black uppercase text-slate-500">Domain</th>
                                        <th className="py-3 w-1/3 text-xs font-black uppercase text-slate-500">Title</th>
                                        <th className="py-3 text-xs font-black uppercase text-slate-500">Type</th>
                                        <th className="py-3 text-xs font-black uppercase text-slate-500">Status</th>
                                        <th className="py-3 text-right pr-4 text-xs font-black uppercase text-slate-500">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {teamData.map(staff => (
                                        (staff.projects || []).map((p, idx) => (
                                            <tr key={`${staff.id}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                                <td className="p-2 pl-4">
                                                    <select 
                                                        className="bg-transparent text-xs font-bold text-slate-400 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 rounded px-1"
                                                        value={p.year || '2026'} 
                                                        onChange={(e) => handleEditField(staff.id, idx, 'year', e.target.value)}
                                                    >
                                                        <option value="2025">2025</option>
                                                        <option value="2026">2026</option>
                                                    </select>
                                                </td>
                                                <td className="p-2">
                                                    <select 
                                                        className="bg-transparent text-sm font-bold text-blue-600 dark:text-blue-400 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 rounded px-2 py-1"
                                                        value={staff.staff_name}
                                                        onChange={(e) => handleChangeOwner(staff.id, p, e.target.value)}
                                                    >
                                                        {activeStaffList.map(n => <option key={n} value={n}>{n}</option>)}
                                                    </select>
                                                </td>
                                                <td className="p-2">
                                                    <select 
                                                        className="bg-transparent text-xs font-bold text-slate-500 uppercase outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 rounded px-2 py-1"
                                                        value={p.domain_type || 'MANAGEMENT'}
                                                        onChange={(e) => handleEditField(staff.id, idx, 'domain_type', e.target.value)}
                                                    >
                                                        {DOMAIN_LIST.map(d => <option key={d} value={d}>{d}</option>)}
                                                    </select>
                                                </td>
                                                <td className="p-2 text-sm text-slate-700 dark:text-slate-300 font-medium">{p.title}</td>
                                                <td className="p-2">
                                                    <select 
                                                        className="bg-transparent text-xs font-bold uppercase outline-none cursor-pointer rounded px-2 py-1"
                                                        style={{ color: p.item_type === 'Project' ? '#7e22ce' : '#1d4ed8' }}
                                                        value={p.item_type || 'Task'}
                                                        onChange={(e) => handleEditField(staff.id, idx, 'item_type', e.target.value)}
                                                    >
                                                        <option value="Task">TASK</option>
                                                        <option value="Project">PROJECT</option>
                                                    </select>
                                                </td>
                                                <td className="p-2">
                                                    <select 
                                                        className="text-xs font-bold text-white rounded-full px-3 py-1 outline-none cursor-pointer w-32 text-center appearance-none"
                                                        style={{ backgroundColor: STATUS_OPTIONS.find(s=>s.val===p.status_dots)?.val ? (STATUS_OPTIONS.find(s=>s.val===p.status_dots).val === 1 ? '#E2445C' : STATUS_OPTIONS.find(s=>s.val===p.status_dots).val === 2 ? '#A25DDC' : STATUS_OPTIONS.find(s=>s.val===p.status_dots).val === 3 ? '#FDAB3D' : STATUS_OPTIONS.find(s=>s.val===p.status_dots).val === 4 ? '#0073EA' : '#00C875') : '#ccc' }}
                                                        value={p.status_dots}
                                                        onChange={(e) => handleEditField(staff.id, idx, 'status_dots', parseInt(e.target.value))}
                                                    >
                                                        {STATUS_OPTIONS.map(s => <option key={s.val} value={s.val} style={{color:'black'}}>{s.label}</option>)}
                                                    </select>
                                                </td>
                                                <td className="p-2 text-right pr-4">
                                                    <button onClick={() => handleDelete(staff.id, p)} className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                                                        <X size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================= */}
            {/* TAB 2: WELLBEING                          */}
            {/* ========================================= */}
            {activeTab === 'WELLBEING' && <AdminWellbeingPanel />}
        </div>
    );
};

export default AdminPanel;
