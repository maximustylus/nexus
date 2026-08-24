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
// 2. WHERE THE VIP LIST USED TO BE
// ==========================================
//
// Three people — Evelyn, Ashik and Mini — were removed from the directory before
// it was deleted, as a REVOCATION the owner decided and `scripts/team-one-manifest.cjs`
// records with the full reasoning. That history matters and stays; the bridge in
// `legacyBridge.js` recognises only the seven who remained.
/**
 * ==============================================================================
 * `TEAM_DIRECTORY` IS GONE, AND THIS COMMENT IS ITS HEADSTONE — `AN14`
 * ==============================================================================
 *
 * Seven real people lived here as a module-level constant: full name, work email
 * address, role, title — and until `AN1`, job grade. One SPA bundle serves every
 * route, including `/individuals`, the community screening a member of the public
 * opens with no sign-in, so all of it was downloadable as part of the page by
 * anybody, with no Firestore read for any rule to stop.
 *
 * It was kept, post-`AN1`, for exactly one job: `checkAccess(email)` recognising
 * a legacy member so the access-gate bridge in `App.jsx` waves them through until
 * the owner verifies their migrated `teamIds` in production. Recognition never
 * needed the plaintext. `src/utils/legacyBridge.js` now does the same job with
 * salted digests — the bundle can prove an email it is HANDED belongs to a legacy
 * member, and can no longer tell anybody who those members are.
 *
 * `STAFF_IDS` and `STAFF_LIST`, derived here, went with it. Their only live
 * consumer was a pair of `activeStaff*` variables in `App.jsx` whose non-demo arm
 * was dead code — the render that used them sits inside its own `isDemo` ternary.
 * Seven names shipped to feed a branch that could not execute.
 *
 * Where each field went:
 *   recognition       → `legacyBridge.checkAccess` (digest lookup, same contract)
 *   admin gate        → `legacyBridge.isLegacyAdminEmail` (replaces `ADMIN_EMAILS`
 *                        in `App.jsx` and the `'Nisa'` name check in `WellbeingView`)
 *   name              → the person's own auth `displayName` / `users/{uid}` doc
 *   title, role       → the bridge profile (badge-level, names nobody)
 *   the team itself   → `teams/{id}/members/*`, where it has lived since v2.0
 *
 * ⚠️ DO NOT REINTRODUCE A NAMED DIRECTORY HERE, in any shape, for any deadline.
 *    `an14.bundle.test.js` greps the BUILT BUNDLE for the identities this file
 *    used to ship and fails the suite if any returns.
 */

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
