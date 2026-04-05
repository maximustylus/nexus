import AuraChat from './components/AuraChat';
import FeedsView from './components/FeedsView';
import FeedbackWidget from './components/FeedbackWidget';
import AuraGreeting from './components/AuraGreeting';
import ScrollToTop from './components/ScrollToTop';
import React, { useState, useEffect, useRef } from 'react';
import AppGuide from './components/AppGuide';
import { getMessaging, onMessage } from "firebase/messaging";
import { createPortal } from 'react-dom';
import { db, auth } from './firebase';
import { collection, onSnapshot, doc, query, where, orderBy, updateDoc } from 'firebase/firestore'; 
import { signOut } from 'firebase/auth';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, ReferenceLine } from 'recharts';
import { Sun, Moon, LogOut, LayoutDashboard, Calendar, Activity, 
  Filter, ShieldAlert, BookOpen, MessageCircle, Gift, History, Bell, User, Hexagon } from 'lucide-react'; 

// --- ROUTING ---
import { Routes, Route, useLocation } from 'react-router-dom';

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
import ProfileView from './components/ProfileView'; 

// --- PUBLIC PORTAL IMPORTS ---
import WelcomeScreen from './components/WelcomeScreen';
import LanguageGate from './components/LanguageGate';
import PathwaySelection from './components/PathwaySelection';
import ConventionalForm from './components/ConventionalForm';
import ResultPage from './components/ResultPage';

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
  const location = useLocation();
  const isPublicPathway = location.pathname.startsWith('/individuals');
  const [currentView, setCurrentView] = useState(() => {
      if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const requestedView = params.get('view');
          if (requestedView === 'feeds' || requestedView === 'dashboard' || requestedView === 'roster' || requestedView === 'profile' || requestedView === 'pulse') {
              return requestedView;
          }
      }
      return 'pulse'; 
  });

  const [dataYear, setDataYear] = useState('2026');
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isAuraOpen, setIsAuraOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [isBellOpen, setIsBellOpen] = useState(false);
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
  const [authLoading, setAuthLoading] = useState(true)
  const [teamData, setTeamData] = useState([]); 
  const [staffLoads, setStaffLoads] = useState({});
  const [attendanceData, setAttendanceData] = useState({}); 
  const activeStaffList = isDemo ? MOCK_STAFF_NAMES : STAFF_LIST;
  const activeStaffIds = isDemo ? MOCK_STAFF_NAMES : STAFF_IDS;

  // 🌟 BULLETPROOF, ANTI-ZOMBIE AUTH LISTENER
  useEffect(() => {
    let unsubUserDoc = null;

    const unsubscribe = auth.onAuthStateChanged((u) => {
      if (u) {
        try {
          const initialProfile = checkAccess(u.email);
          const userDocRef = doc(db, 'users', u.uid);
          
          unsubUserDoc = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
              setUser({ ...initialProfile, ...docSnap.data(), uid: u.uid });
            } else {
              setUser({ ...initialProfile, uid: u.uid });
            }
            setAuthLoading(false); 
          }, (error) => {
            console.error("Error fetching user data:", error);
            // 🌟 SECURITY: Only fallback if still genuinely logged in
            if (auth.currentUser) {
                setUser({ ...initialProfile, uid: u.uid });
            } else {
                setUser(null);
            }
            setAuthLoading(false); 
          });

        } catch (error) {
          console.error("Auth Listener Error:", error);
          setAuthLoading(false);
        }
      } else {
        // 🌟 HARD FLUSH ON LOGOUT
        if (unsubUserDoc) {
            unsubUserDoc(); 
            unsubUserDoc = null;
        }
        setUser(null);
        setNotifications([]);
        setIsAdminOpen(false);
        setAuthLoading(false);
      }
    });

    return () => {
        if (unsubUserDoc) unsubUserDoc();
        unsubscribe();
    };
  }, []);
  
  // 🌟 FETCH REAL-TIME PROFILE & NOTIFICATIONS
  useEffect(() => {
      let unsubUser, unsubNotifications;

      if (user?.uid && !isDemo) {
          unsubUser = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
              if (docSnap.exists() && docSnap.data().photoURL) {
                  setUser(prev => ({ ...prev, photoURL: docSnap.data().photoURL }));
              }
          });

          const q = query(
              collection(db, 'notifications'), 
              where('recipient', '==', user.name),
              orderBy('timestamp', 'desc')
          );
          unsubNotifications = onSnapshot(q, (snapshot) => {
              const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              setNotifications(fetched);
          });
      }

      return () => {
          if (unsubUser) unsubUser();
          if (unsubNotifications) unsubNotifications();
      };
  }, [user?.uid, user?.name, isDemo]);

  // --- DATA FETCHING ---
  useEffect(() => {
    let unsubStaff, unsubAttendance;
    const unsubLoads = [];

    if (!currentView || !dataYear) return;
    if (!isDemo && !user) return;

    if (isDemo) {
      console.log("🧪 [NEXUS] Loading Marvel Universe...");
    } else {
      const targetCollection = dataYear === '2026' ? 'cep_team' : `archive_${dataYear}`;

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
  
  // 🌟 DEFINE SCALABLE ADMIN ACCESS
  const ADMIN_EMAILS = ['muhammad.alif@kkh.com.sg', 'siti.nur.anisah.nh@kkh.com.sg'];
  const hasAdminAccess = isDemo || (user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) || user?.role === 'admin';

  const unreadCount = notifications.filter(n => !n.read).length;

  const markNotificationsAsRead = async () => {
      if (isDemo || unreadCount === 0) return;
      const unreadAlerts = notifications.filter(n => !n.read);
      for (const alert of unreadAlerts) {
          try { await updateDoc(doc(db, 'notifications', alert.id), { read: true }); }
          catch (error) { console.error("Failed to mark read:", error); }
      }
  };

  const toggleBell = () => {
      const newState = !isBellOpen;
      setIsBellOpen(newState);
      if (newState) markNotificationsAsRead();
  };

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
  
  // 🌟 MASTER LOGOUT KILL-SWITCH
  const handleLogout = async () => { 
    if (isDemo) toggleDemo();
    try {
        await signOut(auth); 
    } catch (e) {
        console.error("Logout error", e);
    }
    setUser(null); 
    setNotifications([]);
    setIsAdminOpen(false); 
    setCurrentView('pulse'); // Reset to pulse for next login
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

  // --- SUB-COMPONENT: DASHBOARD VIEW ---
  const renderDashboardView = () => (
    <>
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
              <Bar dataKey="1" stackId="a" fill={STATUS_COLORS[1]} name="Obsolete" radius={[4, 0, 0, 4]} barSize={30} />
              <Bar dataKey="2" stackId="a" fill={STATUS_COLORS[2]} name="Not Started" barSize={30} />
              <Bar dataKey="3" stackId="a" fill={STATUS_COLORS[3]} name="Behind" barSize={30} />
              <Bar dataKey="4" stackId="a" fill={STATUS_COLORS[4]} name="On Track" barSize={30} />
              <Bar dataKey="5" stackId="a" fill={STATUS_COLORS[5]} name="Completed" radius={[0, 4, 4, 0]} barSize={30} />
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

  // 🌟 THE UNIFIED APP ROUTER
return (
    <>
      {/* GLOBAL FLOATING THEME TOGGLE FOR PUBLIC PATHWAYS */}
      {isPublicPathway && (
        <button 
          onClick={toggleTheme} 
          className="fixed top-4 right-4 md:top-6 md:right-6 z-[9999] p-3 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-full shadow-lg text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-all hover:scale-110 active:scale-95"
          title="Toggle Dark Mode"
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      )}

      <Routes>
        {/* 1. PUBLIC INDIVIDUAL PATHWAYS */}
        <Route path="/individuals/language" element={<LanguageGate />} />
        <Route path="/individuals/pathway" element={<PathwaySelection />} />
        <Route path="/individuals/form" element={<ConventionalForm />} />
        <Route path="/individuals/chat" element={<AuraChat />} />
        <Route path="/individuals/result" element={<ResultPage />} />

        {/* 2. THE MAIN GATEWAY & PROFESSIONAL WORKSPACE */}
        <Route path="/" element={
          (!user && !isDemo) ? (
            <WelcomeScreen />
        ) : (
          // IF LOGGED IN / DEMO -> SHOW DASHBOARD
          <ResponsiveLayout 
            activeTab={currentView} 
            onNavigate={setCurrentView}
            floatingWidgets={
              <>
                <AppGuide isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
                <FeedbackWidget user={user} />
                <AuraGreeting openAuraChat={() => setIsAuraOpen(true)} dailyPatientLoad={145} />
                <AuraPulseBot isOpen={isAuraOpen} onClose={() => setIsAuraOpen(false)} user={user} />
              </>
            }
          >
            
          {isDemo && (
            <div className="md:col-span-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4 flex items-center justify-between animate-in slide-in-from-top">
              <div className="flex items-center gap-2">
                 <ShieldAlert className="text-emerald-600" size={20} />
                 <div>
                   <h3 className="text-xs font-black text-emerald-800 uppercase tracking-wider">Sandbox Mode Active</h3>
                   <p className="text-[10px] text-emerald-600 font-medium">Simulation Data.</p>
                 </div>
              </div>
              <div className="text-[10px] font-mono bg-emerald-100 text-emerald-700 px-2 py-1 rounded">v1.41-OFFICIAL</div>
            </div>
          )}

          {/* HEADER BAR */}
          <div className="md:col-span-2 flex items-center justify-between mb-4 md:mb-6 bg-white dark:bg-slate-800 p-3 md:p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 w-full shrink-0 relative z-50">
            
            {/* 1. BRANDING & MODE TOGGLE (Left) */}
            <div className="flex items-center gap-3 md:gap-5 shrink-0">
                {/* Logos */}
                <div className="cursor-pointer" onClick={() => setCurrentView('dashboard')}>
                    {isDemo ? (
                        <img src="/nexus.png" alt="NEXUS" className="h-8 md:h-10 w-auto object-contain drop-shadow-sm" onError={(e) => { e.target.style.display = 'none'; }} />
                    ) : (
                        <img src="/logo.png" alt="Department" className="h-8 md:h-10 w-auto object-contain drop-shadow-sm" onError={(e) => { e.target.style.display = 'none'; }} />
                    )}
                </div>

                {/* Live/Demo Toggle Switch */}
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 p-1.5 md:p-2 rounded-full border border-slate-100 dark:border-slate-700">
                    <button 
                        onClick={toggleDemo} 
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isDemo ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-600'}`}
                    >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${isDemo ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                    <span className={`text-[10px] md:text-xs font-black uppercase tracking-widest pr-2 ${isDemo ? 'text-emerald-600' : 'text-slate-500 dark:text-slate-400'}`}>
                        {isDemo ? 'Demo' : 'Live'}
                    </span>
                </div>
            </div>

            {/* 2. CENTER NAVIGATION (Desktop only - Perfectly centered now) */}
            <div className="hidden lg:flex flex-1 justify-center px-4">
                <div className="flex bg-slate-100 dark:bg-slate-900/50 p-1 rounded-lg">
                    {['dashboard', 'feeds', 'pulse', 'roster', 'guide'].map(view => (
                        <button 
                            key={view}
                            onClick={() => { setIsAdminOpen(false); setCurrentView(view); }}
                            className={`px-3 xl:px-4 py-1.5 rounded-md text-xs xl:text-sm font-bold capitalize transition-all ${
                                currentView === view && !isAdminOpen 
                                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                        >
                            {view}
                        </button>
                    ))}
                </div>
            </div>

            {/* 3. ACTION CLUSTER (Right Side - Exact Order) */}
            <div className="flex items-center justify-end gap-2 md:gap-3 shrink-0">
              
              {/* A. ADMIN BUTTON */}
              <button 
                onClick={() => { 
                    if (hasAdminAccess) {
                        setIsAdminOpen(!isAdminOpen); 
                        setCurrentView('dashboard'); 
                    } else {
                        alert("Admins Only Access");
                    }
                }} 
                className={`p-1.5 md:p-2 rounded-full transition-all active:scale-95 sm:hover:bg-slate-100 dark:sm:hover:bg-slate-700 ${isAdminOpen ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400' : 'text-slate-400 hover:text-indigo-600'}`}
                title="Admin Logs"
              >
                <ShieldAlert size={18} />
              </button>

              {/* B. THEME TOGGLE (Sun/Moon) */}
              <button onClick={toggleTheme} className="p-1.5 md:p-2 rounded-full transition-all text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200 active:scale-95 sm:hover:bg-slate-100 dark:sm:hover:bg-slate-700">
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
              </button>

              {/* C. NOTIFICATION BELL */}
              <div className="relative">
                  <button 
                      onClick={toggleBell}
                      className={`p-1.5 md:p-2 rounded-full transition-all active:scale-95 ${isBellOpen ? 'bg-slate-100 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                      <Bell size={18} />
                      {unreadCount > 0 && !isDemo && (
                          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-slate-800 animate-pulse"></span>
                      )}
                  </button>

                  {/* BELL DROPDOWN */}
                  {isBellOpen && !isDemo && (
                      <div className="absolute right-0 mt-3 w-72 md:w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-50 animate-in zoom-in-95 duration-200">
                          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50 rounded-t-2xl">
                              <h3 className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">Notifications</h3>
                          </div>
                          <div className="max-h-80 overflow-y-auto scrollbar-hide rounded-b-2xl">
                              {notifications.length === 0 ? (
                                  <div className="p-8 text-center text-xs text-slate-400 font-medium">No new activity</div>
                              ) : (
                                  notifications.map((n) => (
                                      <div key={n.id} onClick={() => { setIsBellOpen(false); setCurrentView('feeds'); }} className={`p-4 border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors ${!n.read ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : ''}`}>
                                          <p className="text-sm text-slate-700 dark:text-slate-200">
                                              <span className="font-bold">{n.sender}</span> {n.type === 'LIKE' ? 'liked your post' : 'commented on your post'}
                                          </p>
                                      </div>
                                  ))
                              )}
                          </div>
                      </div>
                  )}
              </div>

              {/* D. PROFILE AVATAR */}
              <button 
                onClick={() => { setIsAdminOpen(false); setCurrentView('profile'); }}
                className={`relative w-8 h-8 md:w-10 md:h-10 ml-1 rounded-full overflow-hidden border-2 transition-all active:scale-95 flex items-center justify-center bg-indigo-100 text-indigo-600 font-black shrink-0 ${currentView === 'profile' && !isAdminOpen ? 'border-indigo-500 ring-4 ring-indigo-500/10 shadow-md' : 'border-white dark:border-slate-700 hover:border-slate-300 shadow-sm'}`}
              >
                {user?.photoURL ? (
                    <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                    <span className="text-sm md:text-base uppercase">{user?.name ? user.name.charAt(0) : 'U'}</span>
                )}
              </button>

            </div>
          </div>
          
            {/* MAIN CONTENT AREA */}
            {(isAdminOpen && hasAdminAccess) ? (
                <div className="md:col-span-2">
                <AdminPanel teamData={activeTeamData} staffLoads={activeStaffLoads} user={user} />
                </div>
            ) : (
                <div className="md:col-span-2 w-full animate-in fade-in duration-500">
                {currentView === 'dashboard' && renderDashboardView()}
                {currentView === 'feeds' && <FeedsView user={user} />}
                {currentView === 'roster' && <RosterView user={user} />}
                {currentView === 'pulse' && <WellbeingView user={user} />}
                {/* 🌟 PASSING ONLOGOUT TO PROFILEVIEW */}
                {currentView === 'profile' && <ProfileView user={user} onLogout={handleLogout} />} 
                <div className="h-32 md:h-24 w-full shrink-0" />
                </div>
            )}
          
          </ResponsiveLayout>
        )
      } />
    </Routes>
    </>
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
