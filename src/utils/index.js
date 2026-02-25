import { 
  LayoutDashboard, 
  Archive, 
  Calendar, 
  Activity,
  Users,
  Settings,
  ShieldAlert
} from 'lucide-react';

// ==========================================
// 1. CONSTANTS
// ==========================================
export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

// ==========================================
// 2. THE VIP LIST (TEAM_DIRECTORY)
// ==========================================
export const TEAM_DIRECTORY = [
  // --- LEADERSHIP & ADMINS ---
  { 
    id: 'alif', // Matches Firestore ID 'alif'
    name: 'Alif', 
    email: 'muhammad.alif@kkh.com.sg', 
    role: 'admin',
    title: 'Lead and Sr. CEP (JG14)'
  },
  { 
    id: 'nisa', // Matches Firestore ID 'nisa'
    name: 'Nisa', 
    email: 'siti.nur.anisah.nh@kkh.com.sg', 
    role: 'admin',
    title: 'Administrator'
  },
  { 
    id: 'evelyn', 
    name: 'Evelyn', 
    email: 'Evelyn.Ong.MH@kkh.com.sg', 
    role: 'viewer', 
    title: 'Asst. Director (Medicine)'
  },

  // --- MEDICAL & NURSING LEADS (VIEWERS) ---
  { 
    id: 'benny', 
    name: 'Benny', 
    email: 'benny.loo.k.g.@singhealth.com.sg', 
    role: 'viewer', 
    title: 'Sr. Consultant (Sports Med)'
  },
  { 
    id: 'ashik', 
    name: 'Ashik', 
    email: 'mohammad.ashik.zainuddin@singhealth.com.sg', 
    role: 'viewer',
    title: 'Sr. Consultant (Ortho)'
  },
  { 
    id: 'mini', 
    name: 'Mini', 
    email: 'Mini.Abraham@kkh.com.sg', 
    role: 'viewer', 
    title: 'Nurse Clinician'
  },

  // --- CLINICAL EXERCISE PHYSIOLOGISTS (STAFF) ---
  { 
    id: 'brandon', // Matches Firestore ID 'brandon'
    name: 'Brandon', 
    email: 'brandon.feng.gg@kkh.com.sg', 
    role: 'staff',
    title: 'CEP (JG11)'
  },
  { 
    id: 'ying_xian', // 🛡️ FIXED: Replaced space with underscore to perfectly match Firestore
    name: 'Ying Xian', 
    email: 'lim.ying.xian@kkh.com.sg', 
    role: 'staff',
    title: 'CEP (JG12)'
  },
  { 
    id: 'derlinder', // Matches Firestore ID 'derlinder'
    name: 'Derlinder', 
    email: 'derlinder.kaur@kkh.com.sg', 
    role: 'staff',
    title: 'CEP (JG12)'
  },
  { 
    id: 'fadzlynn', // Matches Firestore ID 'fadzlynn'
    name: 'Fadzlynn', 
    email: 'fadzlynn.mohamad.fadzully@kkh.com.sg', 
    role: 'staff',
    title: 'CEP (JG13)'
  }
];

// ==========================================
// 3. HELPER EXPORTS (Backward Compatibility)
// ==========================================

export const STAFF_IDS = TEAM_DIRECTORY.map(person => person.id);
export const STAFF_LIST = TEAM_DIRECTORY.map(person => person.name);
export const checkAccess = (email) => {
  if (!email) return null;
  return TEAM_DIRECTORY.find(p => p.email.toLowerCase() === email.toLowerCase());
};

// ==========================================
// 4. APP CONFIG (Upgraded)
// ==========================================

export const DOMAIN_LIST = [
  'MANAGEMENT', 
  'CLINICAL', 
  'EDUCATION', 
  'RESEARCH',
  'INNOVATION',
  'SERVICE',
  'ADMIN'
];

// Upgraded Status Options with Colors (UI Polish)
export const STATUS_OPTIONS = [
  { val: 0, label: 'Not Started', color: 'bg-slate-200 text-slate-600' },
  { val: 1, label: 'Stuck', color: 'bg-red-100 text-red-600' },
  { val: 2, label: 'Planning', color: 'bg-indigo-100 text-indigo-600' },
  { val: 3, label: 'Working', color: 'bg-amber-100 text-amber-700' },
  { val: 4, label: 'Review', color: 'bg-blue-100 text-blue-600' },
  { val: 5, label: 'Done', color: 'bg-emerald-100 text-emerald-600' }
];

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'archive', label: 'Archive', icon: Archive },
  { id: 'roster', label: 'Roster', icon: Calendar },
  { id: 'pulse', label: 'Pulse', icon: Activity },
];
