import React, { useState, useEffect } from 'react';
import { db, auth } from './firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend 
} from 'recharts';
import { 
  Sun, Moon, LogOut, LayoutDashboard, Archive, 
  Calendar, Activity, Filter, ShieldAlert 
} from 'lucide-react';

// --- CONTEXT & DATA STRATEGY ---
import { NexusProvider, useNexus } from './context/NexusContext';
import { MOCK_STAFF, MOCK_PROJECTS, MOCK_STAFF_NAMES } from './data/mockData'; 

// --- COMPONENT IMPORTS ---
import AdminPanel from './components/AdminPanel';
import ResponsiveLayout from './components/ResponsiveLayout'; 
import SmartReportView from './components/SmartReportView';
import RosterView from './components/RosterView';
import WellbeingView from './components/WellbeingView';
import AuraPulseBot from './components/AuraPulseBot';
import WelcomeScreen from './components/WelcomeScreen';

// --- UTILITIES ---
import { STAFF_LIST, STAFF_IDS, MONTHS, checkAccess, TEAM_DIRECTORY } from './utils';

// ==========================================
// CONFIGURATION & CONSTANTS (v1.4 OFFICIAL)
// ==========================================

// 1. Official SingHealth CDP Colors
const DOMAIN_COLORS = {
  MANAGEMENT: '#FFFF00', // Bright Yellow
  CLINICAL: '#FFCC99',   // Light Peach/Orange
  EDUCATION: '#FFC000',   // Golden Amber
  RESEARCH: '#CCFFCC'    // Pale Mint Green
};

// 2. Clinical Load Gradient (Jan to Dec)
const CLINICAL_GRADIENT = [
  '#FFF5EC', '#FFEBDA', '#FFE1C8', '#FFD7B6', 
  '#FFCDA4', '#FFC392', '#FFB980', '#FFAF6E', 
  '#FFA55C', '#FF9B4A', '#FF9138', '#FFCC99'
];

// 3. Status Colors
const STATUS_COLORS = { 
  1: '#EF4444', 2: '#A855F7', 3: '#F59E0B', 4: '#3B82F6', 5: '#10B981' 
};

// 4. Domain Swimlane Order
const CUSTOM_DOMAIN_ORDER = ['MANAGEMENT', 'CLINICAL', 'RESEARCH', 'EDUCATION'];

function NexusApp() {
  // --- HOOKS ---
  const { isDemo, toggleDemo } = useNexus(); 

// --- UI STATE (SMART THEME) ---
  const [currentView, setCurrentView] = useState('dashboard');
  const [archiveYear, setArchiveYear] = useState('2025');
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  // 1. Initialize based on System Preference
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

 // 2a. EFFECT: Update the DOM (CSS Class) whenever state changes
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // 2b. EFFECT: Listen for System Changes (Runs once on mount)
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e) => setIsDark(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []); // Empty dependency array = persistent listener
  
  // 3. Manual Toggle (Optional Override)
  const toggleTheme = () => { 
      setIsDark(!isDark);
      // Logic inside useEffect will handle the class toggling
  };
  
  // --- AUTH STATE ---
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // --- DATA STATE ---
  const [teamData, setTeamData] = useState([]); 
  const [staffLoads, setStaffLoads] = useState({});
  const [attendanceData, setAttendanceData] = useState({}); 

  // --- UNIVERSE SWITCHER ---
  // In Demo Mode, use mock names. In Live Mode, use real names/IDs.
  const activeStaffList = isDemo ? MOCK_STAFF_NAMES : STAFF_LIST;
  const activeStaffIds = isDemo ? MOCK_STAFF_NAMES : STAFF_IDS; // For mock, IDs are names.

  // --- EFFECT: BROWSER TAB TITLE ---
  useEffect(() => {
    document.title = isDemo ? "NEXUS - Sandbox" : "NEXUS - Smart Dashboard";
  }, [isDemo]);

  // --- EFFECT: AUTH LISTENER ---
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      if (u) {
        // 🕵️‍♂️ Look up the user in our TEAM_DIRECTORY
        const profile = checkAccess(u.email);
        
        if (profile) {
          // ✅ They are on the list! Store the full profile (Role + Name)
          setUser(profile);
        } else {
          // ❌ Not on the list? Boot them out just in case.
          setUser(null);
          signOut(auth);
        }
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- EFFECT: DATA FETCHING ---
  useEffect(() => {
    let unsubStaff, unsubAttendance;
    const unsubLoads = [];

    if (isDemo) {
      console.log("🧪 [NEXUS] Loading Marvel Universe...");
      
      // 1. Generate Team Data (WITH IDs)
      const mockTeam = activeStaffList.map(name => {
         const staffProjects = MOCK_PROJECTS.filter(p => p.lead === name);
         return { 
           id: name, // In Mock Mode, ID is the Name (e.g. 'Tony Stark')
           staff_name: name, 
           projects: staffProjects.map(p => ({
             ...p,
             item_type: 'Project',
             domain_type: p.domain.toUpperCase(),
             status_dots: p.progress > 90 ? 5 : p.progress > 50 ? 3 : 2
           }))
         };
      });
      setTeamData(mockTeam);

      // 2. Generate Random Staff Loads
      const mockLoads = {};
      activeStaffList.forEach(staff => {
        // In Mock Mode, ID is Name, so key by Name
        mockLoads[staff] = Array.from({length: 12}, () => Math.floor(Math.random() * (120 - 60) + 60)); 
      });
      setStaffLoads(mockLoads);

      // 3. Mock Attendance
      setAttendanceData({ 
        '2026': [150, 165, 180, 175, 190, 195, 200, 185, 190, 210, 205, 190] 
      });

    } else {
      console.log("🔌 [NEXUS] Connecting to Live Firestore...");
      
      // 1. Fetch Team & Project Data
      unsubStaff = onSnapshot(collection(db, 'cep_team'), (snapshot) => {        
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // 🕵️‍♂️ FIXED: We loop through TEAM_DIRECTORY and search by member.id (lowercase)
        const sortedData = TEAM_DIRECTORY.map(member => {
          return data.find(d => d.id === member.id) || { id: member.id, staff_name: member.name, projects: [] };
        });
        setTeamData(sortedData);
      });

      // 2. Fetch Individual Staff Loads
      // 🕵️‍♂️ FIXED: We use activeStaffIds (lowercase IDs) for the database lookup
      activeStaffIds.forEach(staffId => {
        const u = onSnapshot(doc(db, 'staff_loads', staffId), (docSnap) => {
          if (docSnap.exists()) {
            setStaffLoads(prev => ({ ...prev, [staffId]: docSnap.data().data }));
          } else {
            setStaffLoads(prev => ({ ...prev, [staffId]: Array(12).fill(0) }));
          }
        });
        unsubLoads.push(u);
      });

      // 3. Fetch Monthly Attendance
      unsubAttendance = onSnapshot(doc(db, 'system_data', 'monthly_attendance'), (docSnap) => {
          if (docSnap.exists()) { setAttendanceData(docSnap.data()); }
      });
    }

    return () => {
      if (unsubStaff) unsubStaff();
      if (unsubAttendance) unsubAttendance();
      unsubLoads.forEach(u => u());
    };
  }, [isDemo, activeStaffList]);

  // --- HELPERS & TRANSFORMERS ---

  const getFilteredData = () => {
    const targetYear = currentView === 'archive' ? archiveYear : '2026';
    return teamData.map(staff => ({
      ...staff,
      projects: (staff.projects || []).filter(p => (p.year || '2026') === targetYear)
    }));
  };

  const filteredTeamData = getFilteredData(); 

  const getPieData = () => {
    const counts = { MANAGEMENT: 0, CLINICAL: 0, EDUCATION: 0, RESEARCH: 0 };
    filteredTeamData.forEach(staff => {
      (staff.projects || []).forEach(p => {
        const domain = p.domain_type || 'CLINICAL';
        if (counts[domain] !== undefined) counts[domain]++;
      });
    });
    return Object.keys(counts)
      .map(key => ({ 
        name: key, 
        value: counts[key], 
        fill: DOMAIN_COLORS[key]
      }))
      .filter(d => d.value > 0);
  };

  const getStatusData = () => {
    const tasks = { name: 'Tasks', 1:0, 2:0, 3:0, 4:0, 5:0 };
    const projects = { name: 'Projects', 1:0, 2:0, 3:0, 4:0, 5:0 };
    filteredTeamData.forEach(staff => {
      (staff.projects || []).forEach(p => {
        const status = p.status_dots || 2;
        if (p.item_type === 'Project') projects[status]++; else tasks[status]++;
      });
    });
    return [tasks, projects];
  };

  const getClinicalData = (staffId) => {
    const data = staffLoads[staffId] || Array(12).fill(0);
    return MONTHS.map((m, i) => ({ name: m, value: data[i] || 0 }));
  };

  const getAttendanceForView = () => {
      const targetYear = currentView === 'archive' ? archiveYear : '2026';
      const rawValues = attendanceData[targetYear] || Array(12).fill(0);
      return MONTHS.map((m, i) => ({ name: m, value: rawValues[i] }));
  };
  
  const handleLogout = async () => { 
    if (isDemo) {
      toggleDemo();
    } else {
      await signOut(auth); 
    }
    setIsAdminOpen(false); 
    setCurrentView('dashboard');
  };
  
  // Custom Pie Label
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
    const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);
    if (percent === 0) return null;

    return (
      <text x={x} y={y} fill="#1e293b" textAnchor="middle" dominantBaseline="central" className="text-lg font-black">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  // --- NEW: CUSTOM BAR TOOLTIP (Solves the "0-11" issue) ---
  const CustomBarTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      // Month names hardcoded for speed, or import MONTHS
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthLabel = monthNames[label] || label; 

      return (
        <div className="bg-slate-800 text-white p-3 rounded-xl shadow-2xl border border-slate-700">
          <p className="text-xs font-bold uppercase text-slate-400 mb-1">{monthLabel}</p>
          <p className="text-lg font-black text-emerald-400">
            {payload[0].value} <span className="text-xs font-normal text-white">hours</span>
          </p>
        </div>
      );
    }
    return null;
  };

  // --- RENDER GUARDS ---
  
  if (authLoading) return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
          <div className="animate-spin w-10 h-10 border-4 border-indigo-600 rounded-full border-t-transparent"></div>
      </div>
  );

  if (!user && !isDemo) {
      return <WelcomeScreen />;
  }

  // --- SUB-COMPONENT: DASHBOARD VIEW ---
  const DashboardView = ({ isArchive = false }) => (
    <>
      {/* Archive Header Banner */}
      {isArchive && (
        <div className="md:col-span-2 bg-amber-100 dark:bg-amber-900/30 border border-amber-200 p-4 rounded-lg mb-4 flex justify-between items-center animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-3">
             <Archive className="text-amber-600" />
             <span className="font-bold text-amber-800 dark:text-amber-200">Viewing Archived Data:</span>
             <select 
               value={archiveYear} 
               onChange={(e) => setArchiveYear(e.target.value)} 
               className="bg-white dark:bg-slate-800 border border-amber-300 rounded px-3 py-1 font-bold text-slate-700 dark:text-white"
             >
               <option value="2023">2023</option>
               <option value="2024">2024</option>
               <option value="2025">2025</option>
             </select>
          </div>
          <span className="text-xs font-mono text-amber-700 uppercase">Read Only Mode</span>
        </div>
      )}

      {/* AI Smart Report */}
      <div className="md:col-span-2 mb-6">
        <SmartReportView year={isArchive ? archiveYear : '2026'} />
      </div>

      {/* PIE CHART SECTION */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 mb-6">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Domain Distribution (2026)</h2>
          <div className="h-[500px] w-full flex items-center justify-center overflow-visible"> 
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 20, left: 0, right: 0, bottom: 40 }}>
              <Pie 
                data={getPieData()} 
                cx="50%" cy="50%" 
                labelLine={false} 
                label={renderCustomizedLabel} 
                outerRadius={150} 
                dataKey="value"
                isAnimationActive={true}
              >
                {getPieData().map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
              </Pie> 
              
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px' }}
                itemStyle={{ color: '#ffffff', fontSize: '12px', fontWeight: 'bold' }}
                labelStyle={{ color: '#ffffff', marginBottom: '4px' }}
              />
              
              <Legend 
                verticalAlign="bottom" 
                height={36} 
                iconType="circle" 
                wrapperStyle={{ paddingTop: '50px' }}
                formatter={(value) => (
                  <span className="text-slate-700 dark:text-slate-300 font-bold ml-1 text-xs uppercase tracking-wide">
                    {value}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* TASK & PROJECT COMPLETION SECTION */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Task & Project Completion {isArchive ? `(${archiveYear})` : '(2026)'}</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={getStatusData()} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 12, fontWeight: 'bold'}} axisLine={false} tickLine={false} />
              <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px' }} itemStyle={{ color: '#ffffff', fontSize: '12px', fontWeight: 'bold' }} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Bar dataKey="1" stackId="a" fill={STATUS_COLORS[1]} name="Stuck" radius={[4, 0, 0, 4]} barSize={30} />
              <Bar dataKey="2" stackId="a" fill={STATUS_COLORS[2]} name="Planning" barSize={30} />
              <Bar dataKey="3" stackId="a" fill={STATUS_COLORS[3]} name="Working" barSize={30} />
              <Bar dataKey="4" stackId="a" fill={STATUS_COLORS[4]} name="Review" barSize={30} />
              <Bar dataKey="5" stackId="a" fill={STATUS_COLORS[5]} name="Done" radius={[0, 4, 4, 0]} barSize={30} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 2: Attendance Line Chart */}
      <div className="md:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 mt-6">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-6">
            Monthly Patient Attendance {isArchive ? `(${archiveYear})` : '(2026)'}
        </h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={getAttendanceForView()}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} />
              <Line type="monotone" dataKey={() => 180} stroke="#ef4444" strokeDasharray="5 5" strokeWidth={1} dot={false} name="Target" />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} dot={{r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff'}} activeDot={{r: 6}} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 3: Individual Clinical Load (FIXED for both Live and Demo) */}
      <div className="md:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 mt-6">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-6">Individual Clinical Load</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* LOGIC SPLIT:
              - LIVE: Iterate through TEAM_DIRECTORY (which has IDs)
              - DEMO: Iterate through MOCK_STAFF (where Name = ID)
          */}
          {isDemo 
            ? activeStaffList.map((mockName) => (
                <div key={mockName} className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-700 dark:text-slate-200">{mockName}</h3>
                    <span className="text-xs font-bold px-2 py-1 bg-orange-100 text-orange-700 rounded">
                      Total: {(staffLoads[mockName] || []).reduce((a, b) => a + b, 0)}
                    </span>
                  </div>
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={getClinicalData(mockName)}>
                        <Tooltip content={<CustomBarTooltip />} cursor={{fill: 'rgba(0,0,0,0.05)', radius: 4}} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {getClinicalData(mockName).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={CLINICAL_GRADIENT[index]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-between mt-2 px-1">
                    {['Jan', 'Apr', 'Jul', 'Oct'].map(m => <span key={m} className="text-[10px] text-slate-400 font-bold">{m}</span>)}
                  </div>
                </div>
              ))
            : TEAM_DIRECTORY.filter(m => m.role === 'staff' || m.id === 'alif').map((member) => (
                <div key={member.id} className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-700 dark:text-slate-200">{member.name}</h3>
                    <span className="text-xs font-bold px-2 py-1 bg-orange-100 text-orange-700 rounded">
                      {/* Lookup using ID (lowercase) */}
                      Total: {(staffLoads[member.id] || []).reduce((a, b) => a + b, 0)}
                    </span>
                  </div>
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      {/* Pass the ID to getClinicalData */}
                      <BarChart data={getClinicalData(member.id)}>
                        <Tooltip content={<CustomBarTooltip />} cursor={{fill: 'rgba(0,0,0,0.05)', radius: 4}} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {getClinicalData(member.id).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={CLINICAL_GRADIENT[index]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-between mt-2 px-1">
                    {['Jan', 'Apr', 'Jul', 'Oct'].map(m => <span key={m} className="text-[10px] text-slate-400 font-bold">{m}</span>)}
                  </div>
                </div>
              ))
          }
        </div>
      </div>

      {/* Row 4: Department Overview */}
      <div className="md:col-span-2 mt-8">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-6">
            Department Overview {isArchive ? `(${archiveYear})` : '(2026)'}
        </h2>
        
        {filteredTeamData.every(staff => (staff.projects || []).length === 0) ? (
            <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                <Filter className="mx-auto text-slate-300 mb-2" size={32} />
                <h3 className="text-slate-400 font-bold uppercase">No data found</h3>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {CUSTOM_DOMAIN_ORDER.map((domain) => (
                <div key={domain} className="flex flex-col gap-3">
                  
                  {/* SOLID COLOR COLUMN HEADERS */}
                  <div 
                    className="p-3 rounded-lg text-center shadow-sm border border-slate-200/50" 
                    style={{ backgroundColor: DOMAIN_COLORS[domain] }} 
                  >
                    <h3 className="font-black text-slate-900 text-sm tracking-wide uppercase">
                      {domain}
                    </h3>
                  </div>

                  {/* Project Cards */}
                  <div className="flex flex-col gap-2">
                    {filteredTeamData.map(staff => (
                      (staff.projects || []).filter(p => p.domain_type === domain).map((p, idx) => (
                        <div key={`${staff.staff_name}-${idx}`} className="bg-white dark:bg-slate-800 p-3 rounded border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow group relative">
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">{staff.staff_name}</span>
                              {p.item_type === 'Project' && <span className="text-[10px] font-bold text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded">PROJ</span>}
                            </div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-tight mb-2">{p.title}</p>
                            <div className="flex gap-1 justify-end">
                              {[1,2,3,4,5].map(val => (
                                <div key={val} className={`w-1.5 h-1.5 rounded-full transition-colors ${p.status_dots >= val ? (p.status_dots === 5 ? 'bg-emerald-500' : p.status_dots === 1 ? 'bg-red-500' : 'bg-blue-500') : 'bg-slate-100 dark:bg-slate-700'}`} />
                              ))}
                            </div>
                        </div>
                      ))
                    ))}
                  </div>
                </div>
              ))}
            </div>
        )}
      </div>
    </>
  );
      
// --- MAIN RENDER RETURN ---
  return (
    <ResponsiveLayout activeTab={currentView} onNavigate={setCurrentView}>
      
      {/* SANDBOX BANNER */}
      {isDemo && (
        <div className="md:col-span-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4 flex items-center justify-between animate-in slide-in-from-top">
          <div className="flex items-center gap-2">
             <ShieldAlert className="text-emerald-600" size={20} />
             <div>
               <h3 className="text-xs font-black text-emerald-800 uppercase tracking-wider">Sandbox Mode Active</h3>
               <p className="text-[10px] text-emerald-600 font-medium">Data is ephemeral simulation data.</p>
             </div>
          </div>
          <div className="text-[10px] font-mono bg-emerald-100 text-emerald-700 px-2 py-1 rounded">v1.4-OFFICIAL</div>
        </div>
      )}

      {/* HEADER BAR (FIXED FOR LANDSCAPE) */}
        <div className="md:col-span-2 flex items-center justify-between mb-6 bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 mx-2 md:mx-0">
        
        {/* BRANDING */}
        <div className="flex items-center gap-3 md:gap-4 shrink-0">           
          <div className="relative">
            {isDemo ? (
              <img src="/nexus.png" alt="NEXUS Logo" className="h-8 md:h-12 w-auto object-contain animate-in zoom-in duration-500" />
            ) : (
              <img src="/logo.png" alt="SSMC Logo" className="h-8 md:h-12 w-auto object-contain animate-in fade-in duration-500" />
            )}
          </div>
          
          <div className="hidden sm:block">
            <h1 className="text-lg md:text-2xl font-black text-slate-800 dark:text-white tracking-tight leading-none">
              {isDemo ? 'NEXUS SANDBOX' : 'NEXUS'}
            </h1>
            <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                {isDemo ? 'Simulation Environment' : 'Smart Dashboard v1.4'}
            </p>
          </div>
        </div>

        {/* CENTER NAVIGATION (THE FIX: Hidden on MD, Visible only on LG+) */}
        {/* Changed 'hidden md:flex' to 'hidden lg:flex' to prevent landscape cutoff */}
        <div className="hidden lg:flex bg-slate-100 dark:bg-slate-900/50 p-1 rounded-lg shrink-0">
           {['dashboard', 'archive', 'roster', 'pulse'].map(view => (
             <button 
               key={view} 
               onClick={() => setCurrentView(view)} 
               className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all capitalize ${currentView === view ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
             >
               {view === 'dashboard' && <LayoutDashboard size={14} />}
               {view === 'archive' && <Archive size={14} />}
               {view === 'roster' && <Calendar size={14} />}
               {view === 'pulse' && <Activity size={14} />}
               {view}
             </button>
           ))}
        </div>

        {/* ACTION BUTTONS (Always Visible) */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          
          {/* Sandbox Toggle - FIXED STRUCTURE */}
          <div className="flex items-center gap-2 border-r border-slate-200 dark:border-slate-700 pr-2 mr-1">
            <span className={`text-[10px] font-bold uppercase ${isDemo ? 'text-emerald-600' : 'text-slate-400'}`}>
               {isDemo ? 'Sandbox' : 'Live'}
            </span>
            <button 
              onClick={toggleDemo} 
              className={`w-8 h-4 rounded-full flex items-center p-0.5 transition-colors duration-300 ${isDemo ? 'bg-emerald-500' : 'bg-slate-300'}`}
            >
              <div className={`bg-white w-3 h-3 rounded-full shadow-md transform transition-transform duration-300 ${isDemo ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Theme Toggle */}
          <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 border border-transparent hover:border-slate-200">
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          
          {/* Admin Button - ONLY VISIBLE TO ADMINS OR DEMO MODE */}
          {(user?.role === 'admin' || isDemo) && (
            <button 
              onClick={() => setIsAdminOpen(!isAdminOpen)} 
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all shadow-sm ${isAdminOpen ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}
            >
              {isAdminOpen ? 'Close' : 'Admin'}
            </button>
          )}

          {/* Logout Button */}
          <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500 transition-colors bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <LogOut size={18} />
          </button>
        </div>
      </div>
      
      {/* MAIN CONTENT AREA */}
      {(isAdminOpen && (user?.role === 'admin' || isDemo)) ? (
        <div className="md:col-span-2">
          <AdminPanel teamData={teamData} staffLoads={staffLoads} />
        </div>
      ) : (
        <div className="md:col-span-2 w-full animate-in fade-in duration-500">
          {currentView === 'dashboard' && <DashboardView />}
          {currentView === 'archive' && <DashboardView isArchive={true} />}
          {currentView === 'roster' && <RosterView />}
          {currentView === 'pulse' && <WellbeingView />}
        </div>
      )}

      {/* Global Bot */}
      <AuraPulseBot user={user} />
      
    </ResponsiveLayout>
  );
}

// --- APP WRAPPER ---
export default function App() {
  return (
    <NexusProvider>
      <NexusApp />
    </NexusProvider>
  );
}
