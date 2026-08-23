import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  updateDoc, doc, arrayUnion, arrayRemove, getDoc, setDoc, writeBatch, getDocs, collection 
} from 'firebase/firestore';
import { 
  LayoutList, X, Save, Briefcase, Activity, Calendar, Users 
} from 'lucide-react';

// Components
import SmartReportView from './SmartReportView';
import AdminWellbeingPanel from './AdminWellbeingPanel';

// Utils & Data
import { STATUS_OPTIONS, DOMAIN_LIST } from '../utils';
import { useTeam } from '../context/TeamContext';
import { projectsStaffPath, projectStaffPath, loadPath, loadsPath, attendancePath } from '../utils/teamPaths';
import TeamMembersPanel from './TeamMembersPanel';
import { MOCK_STAFF_NAMES } from '../data/mockData'; 
import { useNexus } from '../context/NexusContext';
import { APP_VERSION_LABEL } from '../version';   

// STATIC VARIABLES
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The year whose loads live in `loads/{uid}` rather than inside a project row.
// Named because it was the string '2026' compared inline, and because it is the one
// thing still making a year special here.
const CURRENT_LOAD_YEAR = '2026';

/**
 * The subtitle each tab puts in the header. A map rather than the nested ternary
 * this replaced, which said "Wellbeing Ops" for every tab that was not OPERATIONS —
 * so the TEAM tab would have been mislabelled from the moment it was added.
 */
const TAB_LABELS = {
    OPERATIONS: 'Workload Ops',
    WELLBEING: 'Wellbeing Ops',
    TEAM: 'Team Members',
};

const AdminPanel = ({ teamData, staffLoads, user }) => {
    // --- CONTEXT ---
    const { isDemo } = useNexus(); 
    const { teamId, members, isLead } = useTeam();

    // --- DYNAMIC STAFF LIST SWITCHER ---
    const activeStaffList = isDemo
        ? MOCK_STAFF_NAMES.map((name) => ({ uid: null, name, role: 'staff', rostered: true }))
        : members.map((m) => ({ uid: m.uid, name: m.displayName, role: m.role, rostered: m.rostered !== false }));

    /**
     * WHO CARRIES A CLINICAL LOAD — a FIFTH hardcoded copy of the team, now gone.
     * This was `!['Ashik', 'Benny', 'Evelyn', 'Mini', 'Nisa'].includes(name)`: five
     * named colleagues excluded by string so the remainder would be the clinical
     * exercise physiologists. Onboarding anybody meant editing that array, and a
     * department that is not Sport & Exercise Medicine would have had five arbitrary
     * exclusions applied to its own people.
     *
     * ⚠️ THE FIRST REPLACEMENT WAS `role !== 'viewer'`, AND IT WAS WRONG. The team's
     *    ROSTER MASTER is an administrator who builds the roster every week and
     *    carries no clinical load: she has to be a `lead` to configure it, which put
     *    her straight back into this table with a row of zeros. `role` answers "what
     *    may you do"; this table asks "do you hold duties". They are different
     *    questions and one field cannot answer both — the service lead, who both
     *    configures AND practises, is the proof in the other direction.
     */
    const CEP_STAFF = activeStaffList.filter((person) => person.rostered);

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
            if (!teamId) { setLocalLoads({}); return; }

            /**
             * KEYED BY uid, AND NO MORE NAME MATCHING. Both branches used to slugify
             * a display name and then hunt for a document whose id, `staff_name` or
             * `id` normalised to the same string — three chances to match the wrong
             * person and one to match nobody, on the numbers that drive the load
             * chart. A uid is the document id, so the lookup is the lookup.
             *
             * ⚠️ TWO STORAGE SHAPES SURVIVE, deliberately. The current year keeps
             *    `loads/{uid}` = `{ data: [12] }`; earlier years keep the clinical
             *    load inside `projects/{year}/staff/{uid}` as a project row with
             *    `monthly_hours`. Unifying them is a DATA change with its own
             *    migration, not something to smuggle into a path rewire. The branch
             *    below is that wart, named rather than hidden.
             */
            const isArchive = loadYear !== CURRENT_LOAD_YEAR;
            const newLoads = {};

            if (isArchive) {
                const archiveSnap = await getDocs(collection(db, ...projectsStaffPath(teamId, loadYear)));
                archiveSnap.forEach(docSnap => {
                    const clinicalProject = (docSnap.data().projects || []).find(p =>
                        p.title?.toLowerCase().includes("clinical load")
                    );
                    newLoads[docSnap.id] = clinicalProject?.monthly_hours || Array(12).fill(0);
                });
            } else {
                const loadSnap = await getDocs(collection(db, ...loadsPath(teamId)));
                loadSnap.forEach(docSnap => {
                    newLoads[docSnap.id] = docSnap.data().data || Array(12).fill(0);
                });
            }

            // Everyone who carries a load gets a row, present in the data or not —
            // a missing person is a person nobody can enter hours for.
            CEP_STAFF.forEach(person => {
                if (person.uid && !newLoads[person.uid]) newLoads[person.uid] = Array(12).fill(0);
            });
            setLocalLoads(newLoads);

            // Fetch Attendance
            const attRef = doc(db, ...attendancePath(teamId, attYear));
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
    // `CEP_STAFF` is a fresh array on every render (it is `activeStaffList.filter(...)`
    // in the component body), so adding it here — as exhaustive-deps asks — would
    // refetch from Firestore on every render. `isDemo` already covers the only
    // input that can change its contents. Left for follow-up: useMemo CEP_STAFF,
    // then list it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, [loadYear, attYear, isDemo, teamId]);

// --- HANDLER: SAVE LOADS (Smart Routing) ---
const saveLoads = async () => {
    if (isDemo) {
        setMessage('✅ (Sandbox) Loads simulated save.');
        return;
    }
    setLoadLoading(true);
    try {
        if (!teamId) { setMessage('❌ No team selected.'); setLoadLoading(false); return; }
        const isArchive = loadYear !== CURRENT_LOAD_YEAR;

        if (isArchive) {
            // 🛡️ ARCHIVE ROUTE: Updates the correct archive vault dynamically
            const promises = Object.keys(localLoads).map(async (uid) => {
                const staffName = members.find(m => m.uid === uid)?.displayName || uid;
                const staffRef = doc(db, ...projectStaffPath(teamId, loadYear, uid));
                
                const snap = await getDoc(staffRef);
                if (snap.exists()) {
                    let projects = snap.data().projects || [];
                    let updated = false;
                    
                    projects = projects.map(p => {
                        if (p.title?.toLowerCase().includes("clinical load")) {
                            updated = true;
                            return { ...p, monthly_hours: localLoads[uid] };
                        }
                        return p;
                    });

                    // If they don't have a clinical load entry for this year, create one safely
                    if (!updated) {
                        projects.push({
                            title: "Clinical Load",
                            item_type: "Task",
                            domain_type: "CLINICAL",
                            monthly_hours: localLoads[uid],
                            year: loadYear
                        });
                    }
                    
                    // 🛡️ CRITICAL FIX: setDoc with merge prevents "No document to update" crashes
                    await setDoc(staffRef, { projects }, { merge: true });
                } else {
                    // Create the archive document if it doesn't exist at all
                    await setDoc(staffRef, {
                        staff_name: staffName,
                        year: loadYear,
                        projects: [{
                            title: "Clinical Load",
                            item_type: "Task",
                            domain_type: "CLINICAL",
                            monthly_hours: localLoads[uid],
                            year: loadYear
                        }]
                    }, { merge: true });
                }
            });
            await Promise.all(promises);
            setMessage(`✅ ${loadYear} Archive Loads Updated!`);

        } else {
            // 🟢 LIVE ROUTE: the team's own loads collection, keyed by uid. The
            // slugified display name that used to be the document id is gone —
            // renaming somebody no longer orphans their hours under the old spelling.
            const promises = Object.keys(localLoads).map(uid =>
                // 🛡️ CRITICAL FIX: setDoc safely creates the document if it is missing
                setDoc(doc(db, ...loadPath(teamId, uid)), { data: localLoads[uid] }, { merge: true })
            );
            await Promise.all(promises);
            setMessage(`✅ ${loadYear} Live Loads Updated!`);
        }
    } catch (e) {
        console.error(e);
        setMessage('❌ Error saving loads');
    }
    setLoadLoading(false);
};

    const handleLoadChange = (uid, index, value) => {
        const newVal = parseInt(value) || 0;
        setLocalLoads(prev => {
          const updated = [...(prev[uid] || Array(12).fill(0))];
          updated[index] = newVal;
          return { ...prev, [uid]: updated };
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
            if (!teamId) { setMessage('❌ No team selected.'); return; }
            const docRef = doc(db, ...attendancePath(teamId, attYear));
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
            if (!teamId) throw new Error("No team selected");
            // ⚠️ `newOwner` IS NOW A uid, not a display name. The picker below sends
            // the uid and renders the name — the `.replace(' ', '_')` slug that used
            // to build the document id only ever replaced the FIRST space, so
            // "Mary Anne Tan" became `mary Anne Tan` and silently missed.
            const staffRef = doc(db, ...projectStaffPath(teamId, newYear, newOwner));
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
            if (!teamId) throw new Error("No team selected");
            const staffRef = doc(db, ...projectStaffPath(teamId, item.year || CURRENT_LOAD_YEAR, staffId));
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
            if (!teamId) throw new Error("No team selected");
            const staffRef = doc(db, ...projectStaffPath(teamId, CURRENT_LOAD_YEAR, staffId));
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
    const handleChangeOwner = async (oldStaffId, item, newOwnerUid) => {
        // Both sides are uids now, so this is an identity check rather than a
        // comparison between a document id and a slug of a name — the old form
        // compared `oldStaffId` against `name.replace(' ', '_')`, which disagreed
        // with itself for any name containing two spaces.
        if (oldStaffId === newOwnerUid) return;
        const newOwnerName = members.find(m => m.uid === newOwnerUid)?.displayName || newOwnerUid;
        if (isDemo) {
            setMessage(`✅ (Sandbox) Moved to ${newOwnerName}`);
            return;
        }
        if (!window.confirm(`Move "${item.title}" to ${newOwnerName}?`)) return;
        setLoading(true);
        try {
            if (!teamId) throw new Error("No team selected");
            const year = item.year || CURRENT_LOAD_YEAR;
            const batch = writeBatch(db);
            const oldRef = doc(db, ...projectStaffPath(teamId, year, oldStaffId));
            batch.update(oldRef, { projects: arrayRemove(item) });
            const newRef = doc(db, ...projectStaffPath(teamId, year, newOwnerUid));
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
                        System Database {APP_VERSION_LABEL} • {TAB_LABELS[activeTab] || 'Ops'}
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
                    {/*
                      * THE TAB THAT REPLACED `TEAM_DIRECTORY`. Shown only to a lead,
                      * because only a lead can act on it — but the hiding is
                      * PRESENTATION. `readTeamContext` re-reads the caller's
                      * membership on every call and refuses anybody who is not a lead
                      * of that team; that refusal is the control.
                      *
                      * Hidden in the sandbox too: the demo team is not a real team, so
                      * a member list for it would be a form that can only ever fail.
                      */}
                    {isLead && !isDemo && (
                        <button
                            onClick={() => setActiveTab('TEAM')}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-bold uppercase transition-all ${activeTab === 'TEAM' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                            <Users size={14} /> Team
                        </button>
                    )}
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
                    <div className="mb-8">  
                        <SmartReportView forceAdminView={true} year={loadYear} teamData={teamData} staffLoads={localLoads} user={user} /> 
                    </div>

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
                                      value={loadYear} 
                                      onChange={(e) => setLoadYear(e.target.value)} // <-- THIS IS CRITICAL
                                      className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 outline-none"
                                  >
                                      <option value="2026">2026 (Live)</option>
                                      <option value="2025">2025 (Archive)</option>
                                      <option value="2024">2024 (Archive)</option>
                                      <option value="2023">2023 (Archive)</option>
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
                                    {/*
                                      A SIXTH COPY OF THE SAME FIVE NAMES lived here,
                                      inline in the render and separate from the one at
                                      the top of the file — so the table and the save
                                      could disagree about who carries a load. Both are
                                      `CEP_STAFF` now, which is derived from the
                                      membership role.
                                    */}
                                    {CEP_STAFF
                                        .map(person => (
                                            <tr key={person.uid || person.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                <td className="py-3 font-bold text-slate-700 dark:text-slate-300">{person.name}</td>
                                                {(localLoads[person.uid] || Array(12).fill(0)).map((val, idx) => (
                                                    <td key={idx} className="p-1">
                                                        <input 
                                                            type="number" 
                                                            value={val}
                                                            onChange={(e) => handleLoadChange(person.uid, idx, e.target.value)}
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
                                      value={attYear} 
                                      onChange={(e) => setAttYear(e.target.value)} // <-- THIS IS CRITICAL
                                      className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 outline-none"
                                  >
                                      <option value="2026">2026 (Live)</option>
                                      <option value="2025">2025 (Archive)</option>
                                      <option value="2024">2024 (Archive)</option>
                                      <option value="2023">2023 (Archive)</option>
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
                                    {activeStaffList.map(person => (
                                        <option key={person.uid || person.name} value={person.uid || person.name}>
                                            {person.name}
                                        </option>
                                    ))}
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
                                                        {activeStaffList.map(person => (
                                        <option key={person.uid || person.name} value={person.uid || person.name}>
                                            {person.name}
                                        </option>
                                    ))}
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

            {/* ========================================= */}
            {/* TAB 3: TEAM — add and remove your own people */}
            {/* ========================================= */}
            {activeTab === 'TEAM' && isLead && !isDemo && (
                <div className="animate-in fade-in rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    <TeamMembersPanel />
                </div>
            )}
        </div>
    );
};

export default AdminPanel;
