import FeedbackWidget from './components/FeedbackWidget';
import AuraGreeting from './components/AuraGreeting';
import ScrollToTop from './components/ScrollToTop';
import React, { useState, useEffect, useRef } from 'react';
import AppGuide from './components/AppGuide';
import { getMessaging, onMessage } from "firebase/messaging";
import { createPortal } from 'react-dom';
import { db, auth } from './firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, ReferenceLine } from 'recharts';
import { Sun, Moon, LogOut, LayoutDashboard, Calendar, Activity, 
  Filter, ShieldAlert, BookOpen, MessageCircle, Gift, History } from 'lucide-react';

// --- CONTEXT & DATA STRATEGY ---
import { NexusProvider, useNexus } from './context/NexusContext';
import { MOCK_STAFF, MOCK_PROJECTS, MOCK_STAFF_NAMES } from './data/mockData'; 
import { MOCK_TEAM_DATA, MOCK_STAFF_LOADS } from './data/mockData';

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
// CONFIGURATION & CONSTANTS
// ==========================================

const DOMAIN_COLORS = {
  MANAGEMENT: '#FFFF00', 
  CLINICAL: '#FFCC99',   
  EDUCATION: '#FFC000',   
  RESEARCH: '#CCFFCC'    
};

const CLINICAL_GRADIENT = [
  '#FFF5EC', '#FFEBDA', '#FFE1C8', '#FFD7B6', 
  '#FFCDA4', '#FFC392', '#FFB980', '#FFAF6E', 
  '#FFA55C', '#FF9B4A', '#FF9138', '#FFCC99'
];

const STATUS_COLORS = { 
  1: '#EF4444', 2: '#A855F7', 3: '#F59E0B', 4: '#3B82F6', 5: '#10B981' 
};

const CUSTOM_DOMAIN_ORDER = ['MANAGEMENT', 'CLINICAL', 'RESEARCH', 'EDUCATION'];

const CustomBarTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthLabel = monthNames[label] || label; 

      return (
        <div className="bg-slate-800 text-white p-3 rounded-xl shadow-2xl border border-slate-700">
          <p className="text-xs font-bold uppercase text-slate-400 mb-1">{monthLabel}</p>
          <p className="text-lg font-black text-emerald-400">
            {payload[0].value}<span className="text-xs font-normal text-white ml-1">% Load</span>
          </p>
        </div>
      );
    }
    return null;
};

function NexusApp() {
  const { isDemo, toggleDemo } = useNexus(); 
  
  const [currentView, setCurrentView] = useState('pulse');
  const [dataYear, setDataYear] = useState('2026'); // 🌟 NEW UNIFIED YEAR
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isAuraOpen, setIsAuraOpen] = useState(false);

  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('nexus_theme');
      if (savedTheme) return savedTheme === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('nexus_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('nexus_theme', 'light');
    }
  }, [isDark]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      if (!localStorage.getItem('nexus_theme')) setIsDark(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);
  
  const toggleTheme = () => setIsDark(!isDark); 

  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const previousView = useRef('dashboard');

  useEffect(() => {
    if (isDemo) setIsGuideOpen(true);
  }, [isDemo]);

  useEffect(() => {
    if (currentView === 'guide') {
      setIsGuideOpen(true);
      setCurrentView(previousView.current);
    } else {
      previousView.current = currentView;
    }
  }, [currentView]);
  
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  const [teamData, setTeamData] = useState([]); 
  const [staffLoads, setStaffLoads] = useState({});
  const [attendanceData, setAttendanceData] = useState({}); 

  const activeStaffList = isDemo ? MOCK_STAFF_NAMES : STAFF_LIST;
  const activeStaffIds = isDemo ? MOCK_STAFF_NAMES : STAFF_IDS;

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      if (u) {
        const profile = checkAccess(u.email);
        if (profile) setUser(profile);
        else { setUser(null); signOut(auth); }
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);
  
  // --- DATA FETCHING ---
  useEffect(() => {
    let unsubStaff, unsubAttendance;
    const unsubLoads = [];

    if (!currentView || !dataYear) return;
    if (!isDemo && !user) return;

    if (isDemo) {
      console.log("🧪 [NEXUS] Loading Marvel Universe...");
    } else {
      // 🌟 MAGIC: Target Collection shifts automatically based on the Year Dropdown
      const targetCollection = dataYear === '2026' ? 'cep_team' : `archive_${dataYear}`;
      console.log(`📡 [NEXUS] Fetching from: ${targetCollection}`);

      try {
        unsubStaff = onSnapshot(collection(db, targetCollection), (snapshot) => {        
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          const sortedData = TEAM_DIRECTORY.map(member => {
            return data.find(d => d.id === member.id) || { id: member.id, staff_name: member.name, projects: [] };
          });
          setTeamData(sortedData);
        }, (err) => console.error("Snapshot Error:", err));

        if (dataYear === '2026') {          
          activeStaffIds.forEach(staffId => {
            const u = onSnapshot(doc(db, 'staff_loads', staffId), (docSnap) => {
              if (docSnap.exists()) {
                setStaffLoads(prev => ({ ...prev, [staffId]: docSnap.data().data }));
              }
            });
            unsubLoads.push(u);
          });
        }

        unsubAttendance = onSnapshot(doc(db, 'system_data', 'monthly_attendance'), (docSnap) => {
            if (docSnap.exists()) { setAttendanceData(docSnap.data()); }
        });
      } catch (error) {
        console.error("🔥 NEXUS Connection Failed:", error);
      }
    }

    return () => {
      if (unsubStaff) unsubStaff();
      if (unsubAttendance) unsubAttendance();
      unsubLoads.forEach(u => u());
    };
  }, [isDemo, currentView, dataYear, activeStaffList, activeStaffIds, user]);

  useEffect(() => {
    const messaging = getMessaging();
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('[NEXUS] Foreground Nudge Received:', payload);
    });

    if ('serviceWorker' in navigator) {
      const handleServiceWorkerMessage = (event) => {
        if (event.data?.type === 'NAVIGATE_TO_PULSE') {
            if (typeof setCurrentView === 'function') setCurrentView('pulse'); 
        }
      };
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
      return () => {
        unsubscribe();
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      };
    }
    return () => unsubscribe();
  }, [setCurrentView]);
  
  // --- HELPERS & TRANSFORMERS ---
  const activeTeamData = isDemo ? MOCK_TEAM_DATA : teamData;
  const activeStaffLoads = isDemo ? MOCK_STAFF_LOADS : staffLoads;

  const getFilteredData = () => {
    return activeTeamData.map(staff => ({
      ...staff,
      projects: (staff.projects || []).filter(p => String(p.year || '2026') === String(dataYear))
    }));
  };

  const filteredTeamData = getFilteredData(); 

  const getPieData = () => {
    const counts = { MANAGEMENT: 0, CLINICAL: 0, EDUCATION: 0, RESEARCH: 0 };
    filteredTeamData.forEach(staff => {
      (staff.projects || []).forEach(p => {
        let rawDomain = (p.domain_type || p.category || 'CLINICAL').toUpperCase();
        if (rawDomain === 'ADMIN' || rawDomain === 'COMMUNITY') rawDomain = 'MANAGEMENT';
        if (counts[rawDomain] !== undefined) counts[rawDomain]++;
        else counts['CLINICAL']++;
      });
    });
    return Object.keys(counts).map(key => ({ name: key, value: counts[key], fill: DOMAIN_COLORS[key] })).filter(d => d.value > 0);
  };

  const getStatusData = () => {
    const tasks = { name: 'Tasks', 1:0, 2:0, 3:0, 4:0, 5:0 };
    const projects = { name: 'Projects', 1:0, 2:0, 3:0, 4:0, 5:0 };
    const isArchive = dataYear !== '2026';

    filteredTeamData.forEach(staff => {
      (staff.projects || []).forEach(p => {
        const status = p.status_dots || (isArchive ? 5 : 2);
        const type = p.item_type || 'Project'; 
        if (type === 'Project') projects[status]++; 
        else tasks[status]++;
      });
    });
    return [tasks, projects];
  };

  const getClinicalData = (staffId) => {
    const isArchive = dataYear !== '2026';

    if (isArchive) {
      const normalize = (str) => String(str || "").toLowerCase().replace(/[\s_]/g, '');
      const cleanStaffId = normalize(staffId);
      const staffMember = filteredTeamData.find(s => normalize(s.id) === cleanStaffId || normalize(s.staff_name) === cleanStaffId);
      const clinicalItem = staffMember?.projects?.find(p => p.title && String(p.title).toLowerCase().includes("clinical load"));

      if (clinicalItem && Array.isArray(clinicalItem.monthly_hours)) {
        return MONTHS.map((m, i) => {
            const hours = clinicalItem.monthly_hours[i] || 0;
            return { name: m, value: Math.round((hours / 168) * 100) };
        });
      }
    }

    const staffKey = Object.keys(activeStaffLoads).find(k => k.toLowerCase() === staffId.toLowerCase()) || staffId;
    const data = activeStaffLoads[staffKey] || Array(12).fill(0);
    return MONTHS.map((m, i) => ({ name: m, value: data[i] || 0 }));
  };

  const getAttendanceForView = () => {
      const rawValues = isDemo 
        ? [120, 145, 160, 155, 180, 190, 195, 185, 200, 210, 190, 180] 
        : (attendanceData[dataYear] || Array(12).fill(0));
      return MONTHS.map((m, i) => ({ name: m, value: rawValues[i] }));
  };
  
  const handleLogout = async () => { 
    if (isDemo) toggleDemo();
    else await signOut(auth); 
    setIsAdminOpen(false); 
    setCurrentView('dashboard');
  };
  
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

  if (authLoading) return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
          <div className="animate-spin w-10 h-10 border-4 border-indigo-600 rounded-full border-t-transparent"></div>
      </div>
  );

  if (!user && !isDemo) {
      return <WelcomeScreen />;
  }

  // --- SUB-COMPONENT: DASHBOARD VIEW ---
  const renderDashboardView = () => (
    <>
      {/* 🌟 NEW: The Unified Dashboard/Archive Header */}
      <div className="md:col-span-2 flex flex-col md:flex-row md:justify-between md:items-center bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 mb-6 gap-4">
         <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${dataYear === '2026' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'}`}>
              {dataYear === '2026' ? <LayoutDashboard size={20} /> : <History size={20} />}
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 dark:text-white tracking-tight">
                {dataYear === '2026' ? 'Live Command Center' : 'Historical Archive'}
              </h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {dataYear === '2026' ? 'Real-time Metrics' : 'Read-Only Mode'}
              </p>
            </div>
         </div>
         
         <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] font-bold text-slate-400 uppercase px-2">Data Year:</span>
            <select 
              value={dataYear} 
              onChange={(e) => setDataYear(e.target.value)} 
              className="bg-white dark:bg-slate-800 border-none rounded-lg px-3 py-1.5 text-sm font-black text-slate-700 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer outline-none"
            >
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
              <option value="2023">2023</option>
            </select>
         </div>
      </div>

      <div className="md:col-span-2 mb-6">
        <SmartReportView 
          year={dataYear} 
          teamData={activeTeamData} 
          staffLoads={activeStaffLoads} 
          user={user}
        />
      </div>

      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 mb-6">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Domain Distribution ({dataYear})</h2>
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
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px' }} itemStyle={{ color: '#ffffff', fontSize: '12px', fontWeight: 'bold' }} labelStyle={{ color: '#ffffff', marginBottom: '4px' }} />
              <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ paddingTop: '50px' }} formatter={(value) => (<span className="text-slate-700 dark:text-slate-300 font-bold ml-1 text-xs uppercase tracking-wide">{value}</span>)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Task & Project Completion ({dataYear})</h2>
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

      <div className="md:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 mt-6">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-6">
            Monthly Patient Attendance ({dataYear})
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

      <div className="md:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 mt-6">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-6">Individual Clinical Load</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(isDemo ? activeStaffList.map(name => ({ id: name.toLowerCase(), name })) : TEAM_DIRECTORY.filter(m => m.role === 'staff' || m.id === 'alif')).map((member) => {
            const chartData = getClinicalData(member.id);
            const yearlyTotal = chartData.reduce((sum, month) => sum + (month.value || 0), 0);

            return (
              <div key={member.id} className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-slate-700 dark:text-slate-200">{member.name}</h3>
                  <span className="text-[10px] font-black uppercase text-orange-500 bg-orange-50 dark:bg-orange-900/30 px-2 py-0.5 rounded-full">
                    Total: {Math.round(yearlyTotal)} hours
                  </span>
                </div>
                <div className="h-32 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <YAxis domain={[0, 60]} hide={true} />
                        <ReferenceLine y={30} stroke="#f59e0b" strokeDasharray="3 3" label={{ position: 'right', value: '30%', fill: '#f59e0b', fontSize: 10, fontWeight: 'bold' }} />
                      <Tooltip cursor={{fill: 'rgba(0,0,0,0.05)', radius: 4}} content={<CustomBarTooltip />} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={CLINICAL_GRADIENT[index] || '#FFCC99'} />
                          ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-between mt-2 px-1">
                  {['Jan', 'Apr', 'Jul', 'Oct'].map(m => <span key={m} className="text-[10px] text-slate-400 font-bold">{m}</span>)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="md:col-span-2 mt-8">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-6">
            Department Overview ({dataYear})
        </h2>
        
        {filteredTeamData.every(staff => (staff.projects || []).length === 0) ? (
            <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                <Filter className="mx-auto text-slate-300 dark:text-slate-600 mb-2" size={32} />
                <h3 className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">No data found</h3>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {CUSTOM_DOMAIN_ORDER.map((domain) => (
                <div key={domain} className="flex flex-col gap-3">
                  <div className="p-3 rounded-lg text-center shadow-sm border border-slate-200/50" style={{ backgroundColor: DOMAIN_COLORS[domain] }}>
                    <h3 className="font-black text-slate-900 text-sm tracking-wide uppercase">{domain}</h3>
                  </div>
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

  // --- SUB-COMPONENT: FEEDS PLACEHOLDER ---
  const renderFeedsPlaceholder = () => (
    <>
      <style>
      {`
        @keyframes shake {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-8deg); }
          50% { transform: rotate(8deg); }
          75% { transform: rotate(-8deg); }
        }
        .animate-shake {
          animation: shake 0.6s ease-in-out infinite;
        }
      `}
      </style>
      <div className="md:col-span-2 flex flex-col items-center justify-center py-24 md:py-32 px-4 text-center animate-in fade-in zoom-in duration-500">
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-20 rounded-full w-32 h-32 animate-pulse" />
          <Gift size={80} className="text-indigo-500 relative z-10 animate-shake origin-bottom drop-shadow-2xl" />
        </div>
        <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight mb-4">
          The Digital Watercooler is <span className="text-indigo-600 dark:text-indigo-400">Coming Soon</span>
        </h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto font-medium leading-relaxed">
          We are building a new secure space for the team to share wins, updates, and insights. Get ready for the Feeds tab in v1.5!
        </p>
        <div className="mt-8 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-bold uppercase tracking-widest border border-indigo-100 dark:border-indigo-800/50 shadow-sm">
          ETA: Next Major Update
        </div>
      </div>
    </>
  );

  return (
      <ResponsiveLayout 
        activeTab={currentView} 
        onNavigate={setCurrentView}
        floatingWidgets={
          <>
            <AppGuide isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
            <FeedbackWidget user={user} />
            <AuraGreeting openAuraChat={() => setIsAuraOpen(true)} dailyPatientLoad={145} />
            <AuraPulseBot isOpen={isAuraOpen} onClose={() => setIsAuraOpen(false)} />
          </>
        }
      >
      
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

      {/* HEADER BAR */}
      <div className="md:col-span-2 flex items-center justify-between mb-6 bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 w-full overflow-hidden">
        
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
              {isDemo ? 'NEXUS DEMO' : 'NEXUS'}
            </h1>
            <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                {isDemo ? 'Simulation Environment' : 'Smart Dashboard v1.4'}
            </p>
          </div>
        </div>

        {/* 🌟 CENTER NAVIGATION (Archive Replaced by Feeds) */}
        <div className="hidden xl:flex bg-slate-100 dark:bg-slate-900/50 p-1 rounded-lg shrink-0">
           {['dashboard', 'feeds', 'roster', 'pulse', 'guide'].map(view => (
             <button 
               key={view} 
               onClick={() => setCurrentView(view)} 
               className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all capitalize ${currentView === view ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
             >
               {view === 'dashboard' && <LayoutDashboard size={14} />}
               {view === 'feeds' && <MessageCircle size={14} />}
               {view === 'roster' && <Calendar size={14} />}
               {view === 'pulse' && <Activity size={14} />}
               {view === 'guide' && <BookOpen size={14} />} 
               {view}
             </button>
           ))}
        </div>
          
        {/* ACTION BUTTONS */}
        <div className="flex items-center justify-end gap-2 md:gap-3 shrink-0">
          <div className="flex items-center gap-2 border-r border-slate-200 dark:border-slate-700 pr-2 mr-1">
            <span className={`text-[10px] font-bold uppercase ${isDemo ? 'text-emerald-600' : 'text-slate-400'}`}>
               {isDemo ? 'Demo' : 'Live'}
            </span>
            <button 
              onClick={toggleDemo} 
              className={`w-8 h-4 rounded-full flex items-center p-0.5 transition-colors duration-300 ${isDemo ? 'bg-emerald-500' : 'bg-slate-300'}`}
            >
              <div className={`bg-white w-3 h-3 rounded-full shadow-md transform transition-transform duration-300 ${isDemo ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
          </div>

          <button onClick={toggleTheme} className="p-2 rounded-full transition-all text-slate-600 dark:text-slate-300 active:scale-95 active:bg-slate-200 dark:active:bg-slate-700 sm:hover:bg-slate-100 dark:sm:hover:bg-slate-700 border border-transparent sm:hover:border-slate-200">
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          
          {(user?.role === 'admin' || isDemo) && (
            <button 
              onClick={() => setIsAdminOpen(!isAdminOpen)} 
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all shadow-sm ${isAdminOpen ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}
            >
              {isAdminOpen ? 'Close' : 'Admin'}
            </button>
          )}

          <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500 transition-colors bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <LogOut size={18} />
          </button>
        </div>
      </div>
      
     {/* MAIN CONTENT AREA */}
     {(isAdminOpen && (user?.role === 'admin' || isDemo)) ? (
       <div className="md:col-span-2">
         <AdminPanel teamData={activeTeamData} staffLoads={activeStaffLoads} user={user} />
       </div>
     ) : (
       <div className="md:col-span-2 w-full animate-in fade-in duration-500">
         {/* 🌟 NEW ROUTING LOGIC */}
         {currentView === 'dashboard' && renderDashboardView()}
         {currentView === 'feeds' && renderFeedsPlaceholder()}
         {currentView === 'roster' && <RosterView user={user} />}
         {currentView === 'pulse' && <WellbeingView user={user} />}

         <div className="h-32 md:h-24 w-full shrink-0" />
       </div>
     )}
      
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
