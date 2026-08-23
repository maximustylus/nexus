import {
  LayoutDashboard,
  Archive,
  Calendar,
  Activity
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
//
// ⚠️ THIS LIST IS ON ITS WAY OUT. Under the multi-team model a team's people live in
//    `teams/{teamId}/members/{uid}`, which a lead maintains themselves. What survives
//    here is a BRIDGE, used by `App.jsx` to let the people already using NEXUS
//    straight through until `scripts/migrate-to-teams.cjs` has run and given them
//    real memberships. Delete it — and the bridge — at that point; leaving it would
//    mean a handful of named email addresses permanently bypass membership checks.
//
// ── EVELYN, ASHIK AND MINI WERE REMOVED, AND IT IS A REVOCATION ──────────────
//
// The owner's decision for team #1, recorded in `scripts/team-one-manifest.cjs`
// with the full reasoning. They are dropped from this list as well as from the
// manifest for a specific reason: the bridge in `App.jsx` waves anyone it still
// recognises into the app shell, and somebody in the bridge but NOT in a team would
// land on a roster with nobody in it, an empty wellbeing panel and a blank feed —
// which is exactly the "looks broken" failure `AccessGate` exists to prevent.
//
// Removed from both, they instead see "nobody has added you to a team yet", which
// is true and tells them who to ask. Their existing records are untouched; a lead
// can invite them back without a deploy.
/**
 * ==============================================================================
 * ⚠️ THE `title` FIELDS NO LONGER CARRY A JOB GRADE — `AN1`
 * ==============================================================================
 *
 * They read `'Lead and Sr. CEP (JG14)'`, `'CEP (JG13)'`, `'CEP (JG12)'`,
 * `'CEP (JG11)'`. This array is a module-level constant, so those strings were in
 * the built bundle, which one route serves to every visitor — including
 * `/individuals`, the community health screening a member of the public opens with
 * no sign-in. Six colleagues' pay grades, downloadable as part of the page. No
 * Firestore read is involved, so no rule in `firestore.rules` could ever have
 * stopped it.
 *
 * That is the whole grade-privacy model — grade in its own collection,
 * `allow list: if false` even to a lead, `useTeamGrades` lead-only, grade never in
 * a member-list render — bypassed by a string.
 *
 * ⚠️ AND THE OBVIOUS FIX WAS NOT ENOUGH. Replacing `(JG12)` with `CEP II` hides
 *    nothing: `src/knowledgeBase.js` ships too, and it maps the tiers to the grades
 *    one-for-one — *"CLINICAL EXERCISE PHYSIOLOGIST II (JG12)"*, with a duty split
 *    and promotion criteria for each. The tier IS the grade to anybody holding both
 *    files, and both files are in the same bundle. So the tier came out as well.
 *
 * What remains is a profession and a function, which are on somebody's badge.
 * A person's real title now lives on `teams/{id}/members/{uid}.title`, which a lead
 * maintains and which no unauthenticated visitor can read.
 *
 * ⚠️ STILL SHIPPING, AND NOT FIXABLE TONIGHT — `AN14`. This array also carries
 *    eight real NAMES and eight real WORK EMAIL ADDRESSES, and it is still live:
 *    `checkAccess` matches on email to seed a legacy member's profile
 *    (`App.jsx:599`, `WelcomeScreen.jsx:170`), and `STAFF_LIST`/`STAFF_IDS` are
 *    derived from it. Removing it means reworking an auth-adjacent bridge, which is
 *    not a thing to do the night before a demo. The grade is the attribute the
 *    privacy model protects and it is gone; the names and addresses are `AN14` and
 *    are a smaller, separate problem.
 */
export const TEAM_DIRECTORY = [
  // --- LEADERSHIP & ADMINS ---
  { 
    id: 'alif', // Matches Firestore ID 'alif'
    name: 'Alif', 
    email: 'muhammad.alif@kkh.com.sg', 
    role: 'admin',
    title: 'Lead, Clinical Exercise Physiology'
  },
  { 
    id: 'nisa', // Matches Firestore ID 'nisa'
    name: 'Nisa', 
    email: 'siti.nur.anisah.nh@kkh.com.sg', 
    role: 'admin',
    // ROSTER MASTER — she builds the roster every week. In the new model that is
    // `role: 'lead'` with `rostered: false`; see `scripts/team-one-manifest.cjs`.
    title: 'Administrator & Roster Master'
  },
  // --- MEDICAL & NURSING LEADS (VIEWERS) ---
  { 
    id: 'benny', 
    name: 'Benny', 
    email: 'benny.loo.k.g.@singhealth.com.sg', 
    role: 'viewer', 
    title: 'Head of Service'
  },

  // --- CLINICAL EXERCISE PHYSIOLOGISTS (STAFF) ---
  { 
    id: 'brandon', // Matches Firestore ID 'brandon'
    name: 'Brandon', 
    email: 'brandon.feng.gg@kkh.com.sg', 
    role: 'staff',
    title: 'Clinical Exercise Physiologist'
  },
  { 
    id: 'ying_xian', // 🛡️ FIXED: Replaced space with underscore to perfectly match Firestore
    name: 'Ying Xian', 
    email: 'lim.ying.xian@kkh.com.sg', 
    role: 'staff',
    title: 'Clinical Exercise Physiologist'
  },
  { 
    id: 'derlinder', // Matches Firestore ID 'derlinder'
    name: 'Derlinder', 
    email: 'derlinder.kaur@kkh.com.sg', 
    role: 'staff',
    title: 'Clinical Exercise Physiologist'
  },
  { 
    id: 'fadzlynn', // Matches Firestore ID 'fadzlynn'
    name: 'Fadzlynn', 
    email: 'fadzlynn.mohamad.fadzully@kkh.com.sg', 
    role: 'staff',
    title: 'Clinical Exercise Physiologist'
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
