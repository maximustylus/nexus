// JG11-JG16 Sandbox Data: Marvel Universe Edition

// The sandbox worked example's grades are tuned against the engine's shipped
// band boundaries (see DEMO_EXAMPLE_DEPARTMENT below). Imported rather than
// retyped so the two cannot drift apart. READ-ONLY: nothing in this file edits
// the engine.
import { DEFAULT_GRADE_BANDS } from '../utils/rosterEngineV2.js';
// The MOH NAHS taxonomy — 28 professions, 37 selectable leaves, two of them nesting.
// READ-ONLY and never edited from here: it is the published list, and the picker's
// first control is a view of it (see section 12). Imported rather than re-typed so a
// profession cannot exist in the dropdown without existing in the taxonomy.
import {
  MOH_ALLIED_HEALTH_PROFESSIONS,
  MOH_PROFESSION_LEAVES,
} from './mohAlliedHealth.js';

// 1. The Names List (CRITICAL for Universe Switching)
export const MOCK_STAFF_NAMES = ['Steve', 'Peter', 'Charles', 'Jean', 'Tony'];

// 2. The Staff Profiles
export const MOCK_STAFF = [
  { id: 'demo_01', name: 'Steve', grade: 'JG14', role: 'Senior Principal', workload: 92, battery: 75, domain: 'Clinical' },
  { id: 'demo_02', name: 'Peter', grade: 'JG11', role: 'Junior', workload: 105, battery: 45, domain: 'Inpatient' }, 
  { id: 'demo_03', name: 'Charles', grade: 'JG16', role: 'Master Expert', workload: 60, battery: 90, domain: 'Research' },
  { id: 'demo_04', name: 'Jean', grade: 'JG13', role: 'Principal', workload: 85, battery: 60, domain: 'Education' },
  { id: 'demo_05', name: 'Tony', grade: 'JG15', role: 'Tech Lead', workload: 40, battery: 95, domain: 'Management' }
];

// 3. The Projects (Combined 2026 + Archive History)
export const MOCK_PROJECTS = [
  // === 2026 (CURRENT DASHBOARD) ===
  { id: 'p1', title: 'Avenger Protocol v2', status: 'In Progress', lead: 'Steve', progress: 65, domain: 'Clinical', year: '2026' },
  { id: 'p2', title: 'Web Shooter Analysis', status: 'Stuck', lead: 'Peter', progress: 10, domain: 'Clinical', year: '2026' },
  { id: 'p3', title: 'Mutant Genome Study', status: 'Review', lead: 'Charles', progress: 90, domain: 'Research', year: '2026' },
  { id: 'p4', title: 'X-Mansion Curriculum', status: 'Planning', lead: 'Jean', progress: 15, domain: 'Education', year: '2026' },
  { id: 'p5', title: 'Ultron Defense Grid', status: 'Working', lead: 'Tony', progress: 40, domain: 'Management', year: '2026' },
  { id: 'p6', title: 'Shield Integration', status: 'Completed', lead: 'Steve', progress: 100, domain: 'Service', year: '2026' },

  // === 2025 (ARCHIVE) ===
  { id: 'a25_1', title: 'Operation: Rebirth', status: 'Completed', lead: 'Steve', progress: 100, domain: 'Clinical', year: '2025' },
  { id: 'a25_2', title: 'Nano-Tech Upgrade', status: 'Completed', lead: 'Tony', progress: 100, domain: 'Research', year: '2025' },
  { id: 'a25_3', title: 'Young Avengers Mentorship', status: 'Completed', lead: 'Peter', progress: 100, domain: 'Education', year: '2025' },
  { id: 'a25_4', title: 'Cerebro Maintenance', status: 'Completed', lead: 'Charles', progress: 100, domain: 'Management', year: '2025' },

  // === 2024 (ARCHIVE) ===
  { id: 'a24_1', title: 'Sentinels Defense Pact', status: 'Completed', lead: 'Charles', progress: 100, domain: 'Management', year: '2024' },
  { id: 'a24_2', title: 'Phoenix Force Analysis', status: 'Completed', lead: 'Jean', progress: 100, domain: 'Research', year: '2024' },
  { id: 'a24_3', title: 'Vibranium Supply Chain', status: 'Completed', lead: 'Tony', progress: 100, domain: 'Service', year: '2024' },
  { id: 'a24_4', title: 'Daily Bugle PR Campaign', status: 'Completed', lead: 'Peter', progress: 100, domain: 'Management', year: '2024' },

  // === 2023 (ARCHIVE) ===
  { id: 'a23_1', title: 'Hydra Base Cleanup', status: 'Completed', lead: 'Steve', progress: 100, domain: 'Clinical', year: '2023' },
  { id: 'a23_2', title: 'Mutation Ethics Board', status: 'Completed', lead: 'Charles', progress: 100, domain: 'Education', year: '2023' },
  { id: 'a23_3', title: 'Web Fluid Formula V3', status: 'Completed', lead: 'Peter', progress: 100, domain: 'Research', year: '2023' },
  { id: 'a23_4', title: 'Stark Expo 2023', status: 'Completed', lead: 'Tony', progress: 100, domain: 'Management', year: '2023' },
];

// 4. Roster Data (Scheduling)
export const MOCK_ROSTER = [
  // STEVE (Leader - Consistent)
  { id: 'r1', title: 'AM Clinic (Ortho)', start: '2026-02-17T08:00:00', end: '2026-02-17T12:00:00', resource: 'Steve', type: 'Clinical' },
  { id: 'r2', title: 'Admin / HOD Meeting', start: '2026-02-17T14:00:00', end: '2026-02-17T17:00:00', resource: 'Steve', type: 'Admin' },
  { id: 'r3', title: 'CPET Lab', start: '2026-02-18T08:30:00', end: '2026-02-18T12:30:00', resource: 'Steve', type: 'Clinical' },

  // PETER (Overworked Junior)
  { id: 'r4', title: 'Inpatient Rounds (Ward 45)', start: '2026-02-17T07:30:00', end: '2026-02-17T13:00:00', resource: 'Peter', type: 'Clinical' },
  { id: 'r5', title: 'Urgent Referrals', start: '2026-02-17T14:00:00', end: '2026-02-17T19:00:00', resource: 'Peter', type: 'Clinical' },
  { id: 'r6', title: 'ON CALL', start: '2026-02-17T20:00:00', end: '2026-02-18T08:00:00', resource: 'Peter', type: 'OnCall' },
  { id: 'r7', title: 'Post-Call Off', start: '2026-02-18T08:00:00', end: '2026-02-18T17:00:00', resource: 'Peter', type: 'Leave' },

  // CHARLES (Research Focus)
  { id: 'r8', title: 'Research Block (Genomics)', start: '2026-02-17T09:00:00', end: '2026-02-17T17:00:00', resource: 'Charles', type: 'Research' },
  { id: 'r9', title: 'Grant Writing', start: '2026-02-18T09:00:00', end: '2026-02-18T12:00:00', resource: 'Charles', type: 'Research' },

  // JEAN (Education)
  { id: 'r10', title: 'Student Supervision', start: '2026-02-17T08:00:00', end: '2026-02-17T12:00:00', resource: 'Jean', type: 'Education' },
  { id: 'r11', title: 'Curriculum Dev', start: '2026-02-17T13:00:00', end: '2026-02-17T16:00:00', resource: 'Jean', type: 'Admin' },

  // TONY (Tech/Off-site)
  { id: 'r12', title: 'System Upgrade', start: '2026-02-17T10:00:00', end: '2026-02-17T15:00:00', resource: 'Tony', type: 'Project' },
  { id: 'r13', title: 'WFH - Dev Sprint', start: '2026-02-18T09:00:00', end: '2026-02-18T18:00:00', resource: 'Tony', type: 'Offsite' }
];

// 5. Pulse History (Sentiment Analysis)
export const MOCK_PULSE_HISTORY = [
  { date: '2026-02-10', score: 3, sentiment: 'Tired but okay' },
  { date: '2026-02-12', score: 2, sentiment: 'Overwhelmed with admin' },
  { date: '2026-02-14', score: 4, sentiment: 'Good recovery over weekend' },
];

// 6. Pulse Trends (Weekly View)
export const MOCK_PULSE_TRENDS = [
  { day: 'Mon', Steve: 80, Peter: 60, Charles: 90, Jean: 75, Tony: 95 },
  { day: 'Tue', Steve: 75, Peter: 45, Charles: 88, Jean: 70, Tony: 92 }, // Peter crashes here
  { day: 'Wed', Steve: 78, Peter: 30, Charles: 85, Jean: 65, Tony: 90 }, // Mid-week slump
  { day: 'Thu', Steve: 82, Peter: 50, Charles: 89, Jean: 72, Tony: 93 }, // Recovery
  { day: 'Fri', Steve: 85, Peter: 55, Charles: 92, Jean: 80, Tony: 88 },
];

// 7. FIREWALL ADAPTERS (For App.jsx Simulation)

export const MOCK_STAFF_LOADS = {
  'Steve': [40, 42, 38, 45, 50, 48, 42, 40, 44, 46, 42, 40],
  'Peter': [35, 38, 40, 42, 38, 40, 45, 42, 38, 40, 42, 45],
  'Charles': [45, 48, 50, 42, 40, 38, 40, 45, 48, 50, 45, 42],
  'Jean': [20, 25, 30, 28, 35, 40, 38, 35, 30, 25, 20, 25],
  'Tony': [50, 45, 40, 38, 35, 30, 25, 30, 35, 40, 45, 50]
};

export const MOCK_TEAM_DATA = MOCK_STAFF_NAMES.map((name) => {
  const staffProjects = MOCK_PROJECTS.filter(p => p.lead === name).map(p => ({
    title: p.title,
    domain_type: p.domain.toUpperCase(),
    item_type: 'Project',
    status_dots: p.progress === 100 ? 5 : (p.progress > 50 ? 4 : 2),
    year: p.year,
    ...(p.domain === 'Clinical' && p.year === '2026' ? { monthly_hours: MOCK_STAFF_LOADS[name] } : {})
  }));

  // Guarantee a clinical load exists for the 2026 tables
  if (!staffProjects.find(p => p.title.includes('Clinical Load'))) {
      staffProjects.push({
          title: 'Clinical Load 2026',
          domain_type: 'CLINICAL',
          item_type: 'Task',
          status_dots: 4,
          year: '2026',
          monthly_hours: MOCK_STAFF_LOADS[name]
      });
  }

  return { id: name.toLowerCase(), staff_name: name, projects: staffProjects };
});

// 8. THE SANDBOX WORKED EXAMPLE (RosterView demo mode → the shape picker's
//    "The Marvel Team — full worked example")
//
// A NEW export, deliberately separate from MOCK_STAFF, MOCK_STAFF_NAMES,
// MOCK_ROSTER, MOCK_PULSE_TRENDS and MOCK_TEAM_DATA. Those five are read by the
// dashboard, the wellbeing view and the admin panels, so widening them to a
// 12-person department would ripple into every chart. Nothing above this line is
// touched.
//
// SHAPE: this is `rosterEngineV2`'s input contract verbatim — `{ startDate,
// weeks, staff: [{ name, fte, skills, unavailable, grade }], tasks: [{ name,
// requiresSkill, days, leads, coLeads, category, leadBands }], rules: { …,
// bands } }` — so the sandbox loader hands it straight to `generateRosterV2` and
// a test can reproduce the expected roster by calling the engine with this
// object.
//
// FIVE DESIGN CONSTRAINTS, each derived from a documented engine limit:
//
//   1. `coLeads` is never above 1. With `coLeads > 1` the engine puts the extra
//      people in `assignees`, which `downloadCSV`/`downloadICS` do not read, so
//      the exports this demo shows off would be silently incomplete.
//   2. `startDate` is a MONDAY (2026-09-07). The engine snaps a mid-week date
//      BACKWARDS to the preceding Monday, so a Wednesday here would quietly
//      start the demo roster in the past.
//   3. `requiresSkill` gates the co-lead as well as the lead, so the skills are
//      deliberately NOT over-applied: SLEEP has three holders, so that task
//      always fills both duties and the only unfilled slot in the run is the
//      intended one.
//   4. Exactly ONE unfillable slot, and it is legible: CPET is held by only
//      Bruce Banner and Shuri. Shuri is on leave on Wednesday 2026-09-16, and
//      Paediatric CPET runs on Wednesdays only — so on that one date the engine
//      fills the lead (Bruce) and reports the co-lead as unfilled, saying why:
//      "2 qualified, 1 on leave, 1 already on this task". Verified against the
//      engine: 1 unfilled slot, 0 hard-constraint violations, 32 shifts.
//   5. THE BAND GATES DO NOT COST A SINGLE EXTRA SLOT. Every one of the twelve
//      has a grade, spread across the shipped boundaries — one principal (Carol
//      Danvers, AH16), four seniors (Bruce Banner and T'Challa AH14, Shuri and
//      Stephen Strange AH13) and seven juniors (AH7–AH12) — and two tasks are
//      band-gated: Outpatient Clinic may only be LED by Senior/Principal
//      (AH13–AH17) and Inpatient Rounds only by Junior (AH7–AH12), which is the
//      supervision shape a real department has. Five senior-or-above people
//      against one gated weekday lead, and seven juniors against the other, so
//      neither gate can starve even with the skill-gated tasks competing for the
//      same people. Re-verified against the engine with the grades in place:
//      still 1 unfilled slot (the same CPET one), still 0 hard-constraint
//      violations, 32 shifts over 12 days, and 0 warnings.
//
// ⚠️ THIS FIXTURE NO LONGER CLAIMS A PROFESSION, AND THAT IS THE POINT OF ITS LAST
// TWO EDITS. It was "Respiratory & Rehab", then "Respiratory (example)" carrying an
// `inferred` provenance and a `correction` checklist — a service nobody from
// respiratory had described, offered under their name with an apology attached. The
// apology was the tell. It is now what it always actually was: THE MARVEL TEAM'S
// FULL WORKED EXAMPLE — openly fictional, attributed to nobody, and kept because it
// is the only fixture in this file that exercises a skill gate, a part-time
// contract, a day of leave and ONE HONESTLY UNSTAFFED SLOT at the same time. Its
// cast is the same Marvel cast as the quick demo below, so a reader cannot mistake
// it for a real department's roster. See the shapes section for the whole argument.
//
// NOTHING INSIDE IT CHANGED WITH THAT RENAME except `label`: the twelve staff, the
// six duties, the two band gates, the CPET skill gate, the part-timer, the one day
// of leave and the one deliberately unfillable slot are byte-identical, which is why
// every assertion already written against this fixture still means what it meant.
// (The two rehab duties and the `REHAB` skill left earlier, when the roster owner
// split them out; the arrangements that received them were themselves inferred and
// have since been deleted, so `REHAB` exists nowhere in this file.)
//
// THE DUTY NAMES ARE ILLUSTRATIVE, not a claim. `Paediatric CPET` and
// `Sleep Study Review` are real kinds of clinical work — that is what makes them
// legible as an example — but no team has told us they run them on these days with
// these people, and this fixture no longer says otherwise about anybody.
//
// Scott Lang is the part-timer (0.6 FTE) — the load table shows him accruing
// duties at roughly 60% of a full-timer's rate, which is the FTE weighting
// doing visible work rather than being claimed in a caption.
//
// WHY `rules.bands` IS STATED RATHER THAN LEFT TO DEFAULT: the grades above were
// tuned against these exact boundaries, and constraint 5 is only true while they
// hold. Imported from the engine rather than retyped, so moving the department's
// shipped cut moves this fixture with it instead of silently invalidating it.
export const DEMO_EXAMPLE_DEPARTMENT = Object.freeze({
  // Names the fiction, not a service. Was 'Allied Health — Respiratory (example)'.
  label: 'The Marvel Team — full worked example',
  startDate: '2026-09-07', // Monday
  weeks: 2,
  staff: Object.freeze([
    { name: 'Carol Danvers', fte: 1.0, grade: 'AH16', skills: ['SLEEP'], unavailable: [] },
    { name: 'Bruce Banner', fte: 1.0, grade: 'AH14', skills: ['CPET', 'SLEEP'], unavailable: [] },
    { name: 'Shuri', fte: 1.0, grade: 'AH13', skills: ['CPET'], unavailable: ['2026-09-16'] },
    { name: 'Sam Wilson', fte: 1.0, grade: 'AH12', skills: [], unavailable: [] },
    { name: 'Wanda Maximoff', fte: 1.0, grade: 'AH11', skills: [], unavailable: [] },
    { name: 'Stephen Strange', fte: 1.0, grade: 'AH13', skills: ['SLEEP'], unavailable: [] },
    { name: 'Natasha Romanoff', fte: 1.0, grade: 'AH10', skills: [], unavailable: [] },
    { name: "T'Challa", fte: 1.0, grade: 'AH14', skills: [], unavailable: [] },
    { name: 'Kamala Khan', fte: 1.0, grade: 'AH8', skills: [], unavailable: [] },
    { name: 'Scott Lang', fte: 0.6, grade: 'AH9', skills: [], unavailable: [] },
    { name: 'Riri Williams', fte: 1.0, grade: 'AH7', skills: [], unavailable: [] },
    { name: 'Monica Rambeau', fte: 1.0, grade: 'AH10', skills: [], unavailable: [] },
  ]),
  tasks: Object.freeze([
    { name: 'Inpatient Rounds', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1, category: 'Clinical', leadBands: ['junior'] },
    { name: 'Outpatient Clinic', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1, category: 'Clinical', leadBands: ['senior', 'principal'] },
    { name: 'Paediatric CPET', days: [3], leads: 1, coLeads: 1, category: 'Clinical', requiresSkill: 'CPET' },
    { name: 'Sleep Study Review', days: [1, 4], leads: 1, coLeads: 1, category: 'Diagnostics', requiresSkill: 'SLEEP' },
    { name: 'Student Supervision', days: [2, 4], leads: 1, coLeads: 1, category: 'Education' },
    { name: 'Weekend Acute Cover', days: [6], leads: 1, coLeads: 1, category: 'On Call' },
  ]),
  rules: Object.freeze({
    maxConcurrentPerDay: 2,
    maxConsecutiveDays: 6,
    bands: DEFAULT_GRADE_BANDS,
  }),
});

// 9. THE PICKER: A PROFESSION, AND A SHAPE (RosterView demo mode → two dropdowns)
//
// APPEND-ONLY SECTION for everything above it. `MOCK_STAFF`, `MOCK_STAFF_NAMES`,
// `MOCK_ROSTER`, `MOCK_PULSE_TRENDS` and `MOCK_TEAM_DATA` are byte-identical to what
// they were before this section existed, so every assertion already written against
// them still means what it meant.
//
// ── THE DESIGN ERROR THIS SECTION EXISTS TO CORRECT ──────────────────────────
//
// This was TWELVE ARRANGEMENTS, one per department, and 23 more were about to be
// written so that every MOH allied health profession had one. Five of the twelve came
// from teams who had described their week; the other seven were pattern-matched
// guesses offered under a real profession's name with a `correction` checklist
// attached. The checklist was the tell: a fixture that has to apologise for itself is
// a fixture making a claim it cannot support.
//
// The roster owner stopped it with the observation that made the whole thing
// unnecessary: "other professions can also ride on the configurations of the 5. That's
// the purpose of this roster's new version — so roster masters can configure for their
// team regardless of their profession."
//
// That is what the primitive constraint layer in `rosterEngineV2` was built for. One
// fixture per department is the museum of special cases the primitive refactor
// removed, growing back in the data layer.
//
// ── SO: SIX SHAPES, AND TWENTY-EIGHT PROFESSIONS AS VOCABULARY ───────────────
//
// A SHAPE is a STRUCTURE, named by what it does and attributed to the profession that
// described it. "Graded duty split — juniors take wards and weekends, seniors take
// specialist weekday clinics. This is how the physiotherapists do it; adapt it" is
// TRUE. "This is how art therapists do it" would have been invented. The difference
// between those two sentences is the entire content of this change, and the copy in
// `RosterView.jsx` must never blur it.
//
// The PROFESSION list (`MOH_PROFESSION_OPTIONS`, derived from `mohAlliedHealth.js`) is
// vocabulary and nothing more. Choosing "Art Therapist" does not select a roster: it
// LABELS the configuration the visitor is about to build, so an art therapist sees
// their own designation on their own roster instead of somebody else's profession.
// Every one of the 28 is reachable and NONE of them is described, which is precisely
// the property the twelve arrangements did not have.
//
//   Shape                          Source config          Feature signature
//   ─────────────────────────────  ─────────────────────  ─────────────────────────────
//   Graded duty split              physiotherapy          `leadBands` both directions
//   Periodic specialist clinic     psychology             `recurrence` + `leadBands`
//                                                        + `continuity` + `weeklyHours`
//   Team-based rotation            embryology             `slots` + cohort `windows`
//   Weekend quota within an        labs                   `quota` floor + `slots`
//     hours ceiling                                       + `weeklyHours`
//   Fixed weekday sessions plus    exercise-physiology    plain days-based sessions
//     out-of-hours slots                                  (the owner's own duty names)
//   A grade floor, and a rotation  respiratory            `leadBands` as a FLOOR:
//     across fixed areas                                  one direction + `coLeads: 0`
//                                                        + `maxConcurrentPerDay: 1`
//
// Each shape is the only one in the list that reaches its engine field, so a roster
// master choosing between them is choosing between six structures rather than six casts
// of fictional names.
//
// ⚠️ THE SIXTH IS THE FIRST TO SHARE AN ENGINE FIELD, and saying so is cheaper than
// discovering it later. Respiratory and physiotherapy both reach `leadBands`. They are
// still different structures and the difference is load-bearing rather than cosmetic:
// physiotherapy gates the LEAD and lets any grade co-lead, which is what makes it a
// supervision shape; respiratory uses the same field as a FLOOR ON EVERYBODY, and can
// only do so by having no co-lead at all (`coLeads: 0`), because the band gate does not
// reach a co-lead. So the pair demonstrates the two opposite things one field can mean
// — but "no two shapes touch the same field" stopped being true at six, and the honest
// version of the claim is the one above: no two are the same STRUCTURE.
//
// TWO FICTIONAL DEMOS SIT BESIDE THE SIX, and both say so:
//
//   marvel                 the one-tap quick demo. Five people, four ordinary weekday
//                          duties, nothing gated at all.
//   marvel-worked-example  `DEMO_EXAMPLE_DEPARTMENT` — twelve people, two band gates,
//                          a skill gate, a 0.6 FTE contract, a day of leave and ONE
//                          slot the engine refuses to invent cover for. The only
//                          fixture here that exercises all of that at once, which is
//                          why it was kept when the profession it used to be named
//                          after (Respiratory) was retired.
//
// ⚠️ `inferred` AND `correction` ARE GONE, both the constants and every block. They
// existed to disclaim a claim; nothing in this file now makes that claim, so a
// disclaimer would be theatre. Two provenance kinds remain — `interviewed` for the
// six shapes and `fictional` for the two Marvel demos — and there is no third. IF A
// FUTURE ENTRY SEEMS TO NEED `inferred` AGAIN, that is the signal that somebody is
// about to describe a service nobody has described: add a SHAPE (a structure, sourced
// from a team who told us) or add nothing.
//
// THAT RULE HAS NOW BEEN USED ONCE, IN THE DIRECTION IT WAS WRITTEN FOR. Respiratory
// was among the six deletions below — a guess at a service nobody had described. On
// 2026-08-17 their therapist lead described it, and the sixth shape is what she said.
// The department that lost a fixture for being invented got one back for being asked,
// which is the whole argument for the rule holding.
//
// DELETED WITH IT: the `respiratory`, `audiology`, `cardiology`,
// `clinical-counselling`, `medical-social-work` and `pulmonary` fixtures. Their
// capabilities are not lost — every engine field they reached (`requiresSkill`,
// `recurrence`, `continuity`, `forbidPairs`, task-level `windows`, `hours`) still has a
// control in `RosterDemoWizardTables.jsx` and its own unit tests in
// `src/utils/rosterEngineV2.*.test.js`. What is lost is six inventions, which is the
// point.
//
// SIX carry `provenance: 'interviewed'` because their SHAPE came from a field
// interview: psychology, embryology, medical laboratory, physiotherapy, clinical
// exercise physiology and respiratory therapy. The DATA in them did not — every name is fictional, and every
// grade, date and figure was invented to make the shape reproducible. THE ONE
// EXCEPTION IS DELIBERATE AND IS STATED IN ITS OWN HEADER: clinical exercise
// physiology is the roster owner's own service, so its DUTY NAMES and the shape of its
// week are the real ones, read out of `LIVE_ROSTER_DEFAULTS` and `generateRoster` in
// `auraEngine.js`. Its four colleagues' names are NOT, and must never be — see PDPA.
//
// 🔒 PDPA — FICTIONAL NAMES, ONE RECOGNISABLE CAST PER FIXTURE. No colleague's name
// appears anywhere in this file. The names are drawn from published fiction, one source
// per fixture (psychology: Star Trek; embryology: Jane Austen; laboratory: Sherlock
// Holmes; physiotherapy: Tolkien; exercise physiology: Greek myth; respiratory: Alice
// in Wonderland; both Marvel demos: Marvel), because a name a reader RECOGNISES as
// fictional cannot be mistaken for a
// real person's roster, whereas a plausible invented name can — and eventually will be,
// by somebody who happens to share it. The four real colleagues on the live roster
// (`LIVE_ROSTER_DEFAULTS.staff`) appear in NO fixture, including the one modelled on
// their own department.
//
// EVERY FIGURE BELOW IS MEASURED, NOT CLAIMED. Each fixture's comment states what
// `generateRosterV2` actually returned for it, and `RosterView.demo.test.jsx` re-runs
// the engine rather than trusting these numbers, so a fixture that drifts fails a test
// instead of shipping a caption that is no longer true.
//
// ALL EIGHT ROUND-TRIP THROUGH THE WIZARD UNCHANGED. Every field used here has a
// control in `RosterDemoWizardTables.jsx`, so the roster a visitor gets after choosing
// a shape is byte-identical to the one the engine gives that fixture directly. That is
// asserted, not assumed — see `RosterView.demo.test.jsx`. It is also the constraint
// that shaped these fixtures: no `temporal` patterns (no wizard field), no window
// `label`s (no wizard field), no `coLeads` above 1, no `leads` above 1, no `slots` list
// outside 2–4 entries, and no `rules.quotas` (the wizard writes `task.quota`).

/**
 * Provenance: the SHAPE came from a field interview with that profession.
 *
 * It says nothing about the DATA, which is fictional throughout — see the PDPA note
 * above. `sourceProfession` on the entry names whose week the structure came from, and
 * the UI must show it: a shape with an interview behind it and no attribution on screen
 * is indistinguishable from one somebody made up.
 */
export const DEMO_PROVENANCE_INTERVIEWED = 'interviewed';

/**
 * Openly fictional — not a real service, and not inferred from one either.
 *
 * `interviewed` answers "whose week is this structure?". This one answers "nobody's:
 * it is a demonstration, and it exists so a visitor on a phone can press one thing and
 * watch the engine work." There is deliberately no third kind. The `inferred` value
 * that used to sit between them meant "our best guess at YOUR service, please correct
 * it" — a sentence no fixture in this file is entitled to say any more.
 */
export const DEMO_PROVENANCE_FICTIONAL = 'fictional';

// --- PSYCHOLOGY ---------------------------------------------------------------
//
// THE ASK: "our specialised clinic runs on the third Wednesday of the month, only a
// principal can hold it, and it must be the same principal every time — the cohort is
// seen monthly and being handed to a different psychologist each time is the thing
// they complain about. Everything else is weekday sessions. We work a 42-hour week."
//
// FOUR ENGINE FIELDS, ONE PER CLAUSE, and none of them was reachable from the UI
// before the picker existed:
//
//   `recurrence: { ordinal: 3, weekday: 3 }`  the 3rd Wednesday of every calendar
//        month. NOT `days: [3]`, which is every Wednesday, and the engine refuses a
//        task carrying both.
//   `leadBands: ['principal']`                only a principal may LEAD it. Bands gate
//        the lead only, so the co-lead slot stays open to every grade — which is how a
//        junior sits in on a clinic they cannot yet hold.
//   `continuity: true`                        the same principal on every occurrence.
//        This is the engine's ONLY preference and it still loses to every hard gate, so
//        a principal on leave or at capacity loses the slot and the break is COUNTED
//        in `score.breakdown.continuityBreaks` and NAMED in `warnings`.
//   `rules.weeklyHours: 42`                   turns the hours model on. The daily cap
//        is then derived as 42/5 = 8.4 hours, which at the engine's 4-hour default
//        session is two sessions a day — the same shape `maxConcurrentPerDay: 2` gives,
//        stated in the currency the department actually negotiates in.
//
// WHY 12 WEEKS: the whole point is a clinic that recurs, so the run has to hold more
// than one occurrence of it. Twelve weeks from Monday 2026-09-07 holds THREE — the 3rd
// Wednesdays of September, October and November 2026 (2026-09-16, 2026-10-21,
// 2026-11-18). A 4-week run would hold one, and one occurrence cannot show continuity.
//
// WHY NOBODY IS PART-TIME HERE: `weeklyHours` and `fte` MULTIPLY in this engine, so a
// 0.5-FTE psychologist on a stated 42-hour week gets 21 hours — correct, and very
// probably not what a roster master typing "42" expects. The part-timer stays in the
// respiratory arrangement, where no hours policy is stated and FTE is unambiguous.
//
// MEASURED (generateRosterV2, 2026-09-07, 12 weeks): ok = true, hardViolations = 0,
// unfilled = 0, warnings = 0, 60 days, 159 shifts, continuityBreaks = 0, and
// Jean-Luc Picard leads all three occurrences of the clinic.
export const DEMO_ARRANGEMENT_PSYCHOLOGY = Object.freeze({
  label: 'Allied Health — Psychology',
  startDate: '2026-09-07', // Monday
  weeks: 12,
  staff: Object.freeze([
    { name: 'Jean-Luc Picard', fte: 1.0, grade: 'AH17', skills: [], unavailable: [] },
    { name: 'Beverly Crusher', fte: 1.0, grade: 'AH16', skills: [], unavailable: [] },
    { name: 'Kathryn Janeway', fte: 1.0, grade: 'AH15', skills: [], unavailable: [] },
    { name: 'Deanna Troi', fte: 1.0, grade: 'AH14', skills: [], unavailable: [] },
    { name: 'Benjamin Sisko', fte: 1.0, grade: 'AH13', skills: [], unavailable: [] },
    { name: 'Geordi La Forge', fte: 1.0, grade: 'AH11', skills: [], unavailable: [] },
    { name: 'Nyota Uhura', fte: 1.0, grade: 'AH10', skills: [], unavailable: [] },
    { name: 'Christine Chapel', fte: 1.0, grade: 'AH8', skills: [], unavailable: [] },
  ]),
  tasks: Object.freeze([
    {
      name: 'Complex Trauma Clinic',
      recurrence: { ordinal: 3, weekday: 3 },
      leads: 1,
      coLeads: 1,
      category: 'Clinical',
      leadBands: ['principal'],
      continuity: true,
    },
    { name: 'Adult Outpatient Assessment', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1, category: 'Clinical' },
    { name: 'Inpatient Liaison', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1, category: 'Clinical' },
    { name: 'Group Therapy Programme', days: [2, 4], leads: 1, coLeads: 1, category: 'Therapy' },
    { name: 'Case Formulation Review', days: [5], leads: 1, coLeads: 1, category: 'Education' },
  ]),
  rules: Object.freeze({
    weeklyHours: 42,
    maxConcurrentPerDay: 2,
    maxConsecutiveDays: 6,
    bands: DEFAULT_GRADE_BANDS,
  }),
});

// --- EMBRYOLOGY ---------------------------------------------------------------
//
// THE ASK: "the weekend service needs three of us at once — a principal, a senior and
// a junior, together, on the same shift. And we run three teams: each team takes the
// weekends for four months, then hands over. Team A should not turn up on a team B
// weekend."
//
// TWO ENGINE FIELDS, and this arrangement exists because neither was reachable:
//
//   `slots: [{ band: 'principal' }, { band: 'senior' }, { band: 'junior' }]`
//        ONE ENTRY PER PERSON THE SHIFT NEEDS, each filled independently with its own
//        band gate. This is not a lead plus two co-leads — the engine DERIVES the lead
//        as the highest grade present, so the trio still renders as
//        "Lead: <principal>, Co: <senior>" and the third assignee is in `assignees`.
//        The engine refuses `slots` beside `leads`/`coLeads`/`leadBands`, so none of
//        those three appears on this task.
//   `staff.windows`
//        eligibility BOUNDED IN TIME. Each person carries TWO windows, and the second
//        one is the load-bearing part: window semantics are a UNION over (task, date),
//        so a person with any window at all is eligible ONLY where some window of
//        theirs admits both. A single `{ from, to, tasks: [weekend] }` window would
//        therefore make that person eligible for the weekend shift in their block and
//        FOR NOTHING ELSE, EVER — not even the weekday bench. The second window,
//        which names the two bench tasks and carries no dates, is what says "and the
//        weekday work, always".
//
// THE THREE BLOCKS ARE 2026-09-01→2026-12-31 (A), 2027-01-01→2027-04-30 (B) and
// 2027-05-01→2027-08-31 (C). They are stated as whole calendar months rather than
// snapped to the run, so the fixture reads like the handover the department actually
// does; the run starts inside block A and that is fine, because a window is a bound on
// eligibility and not a schedule.
//
// WHY 36 WEEKS — the longest run of the four, and it is a requirement rather than
// decoration. A block is four months, so a run that shows the handover must be longer
// than one block. Thirty-six weeks from Monday 2026-09-07 ends 2027-05-16: block A
// entire, block B entire, and the first two weekends of block C. One block would show
// a rota; two show a HANDOVER, which is the thing being demonstrated.
//
// NO HOURS POLICY, deliberately: a weekend trio plus weekday bench work is a duty-count
// question, and stating `weeklyHours` here would add an hours cap to the one arrangement
// whose interesting constraint is eligibility. The labs and psychology arrangements
// carry the 42-hour week.
//
// MEASURED (generateRosterV2, 2026-09-07, 36 weeks): ok = true, hardViolations = 0,
// unfilled = 0, warnings = 0, 252 days, 360 shifts. 72 weekend shifts, EVERY ONE with
// exactly 3 assignees. Team A's weekend dates run 2026-09-12 → 2026-12-27 (32 of
// them), team B's 2027-01-02 → 2027-04-25 (34), team C's 2027-05-01 → 2027-05-16 (6),
// and ZERO weekend shifts mix people from two teams.
export const DEMO_ARRANGEMENT_EMBRYOLOGY = Object.freeze({
  label: 'Allied Health — Embryology',
  startDate: '2026-09-07', // Monday
  weeks: 36,
  staff: Object.freeze([
    // TEAM A — weekends September to December 2026.
    { name: 'Elizabeth Bennet', fte: 1.0, grade: 'AH16', skills: [], unavailable: [], windows: [{ from: '2026-09-01', to: '2026-12-31', tasks: ['Weekend Laboratory Cover'] }, { tasks: ['Embryo Culture Bench', 'Cryostorage & Witnessing'] }] },
    { name: 'Fitzwilliam Darcy', fte: 1.0, grade: 'AH14', skills: [], unavailable: [], windows: [{ from: '2026-09-01', to: '2026-12-31', tasks: ['Weekend Laboratory Cover'] }, { tasks: ['Embryo Culture Bench', 'Cryostorage & Witnessing'] }] },
    { name: 'Catherine Morland', fte: 1.0, grade: 'AH11', skills: [], unavailable: [], windows: [{ from: '2026-09-01', to: '2026-12-31', tasks: ['Weekend Laboratory Cover'] }, { tasks: ['Embryo Culture Bench', 'Cryostorage & Witnessing'] }] },
    // TEAM B — weekends January to April 2027.
    { name: 'Emma Woodhouse', fte: 1.0, grade: 'AH15', skills: [], unavailable: [], windows: [{ from: '2027-01-01', to: '2027-04-30', tasks: ['Weekend Laboratory Cover'] }, { tasks: ['Embryo Culture Bench', 'Cryostorage & Witnessing'] }] },
    { name: 'George Knightley', fte: 1.0, grade: 'AH13', skills: [], unavailable: [], windows: [{ from: '2027-01-01', to: '2027-04-30', tasks: ['Weekend Laboratory Cover'] }, { tasks: ['Embryo Culture Bench', 'Cryostorage & Witnessing'] }] },
    { name: 'Marianne Dashwood', fte: 1.0, grade: 'AH12', skills: [], unavailable: [], windows: [{ from: '2027-01-01', to: '2027-04-30', tasks: ['Weekend Laboratory Cover'] }, { tasks: ['Embryo Culture Bench', 'Cryostorage & Witnessing'] }] },
    // TEAM C — weekends May to August 2027.
    { name: 'Anne Elliot', fte: 1.0, grade: 'AH17', skills: [], unavailable: [], windows: [{ from: '2027-05-01', to: '2027-08-31', tasks: ['Weekend Laboratory Cover'] }, { tasks: ['Embryo Culture Bench', 'Cryostorage & Witnessing'] }] },
    { name: 'Frederick Wentworth', fte: 1.0, grade: 'AH14', skills: [], unavailable: [], windows: [{ from: '2027-05-01', to: '2027-08-31', tasks: ['Weekend Laboratory Cover'] }, { tasks: ['Embryo Culture Bench', 'Cryostorage & Witnessing'] }] },
    { name: 'Elinor Dashwood', fte: 1.0, grade: 'AH11', skills: [], unavailable: [], windows: [{ from: '2027-05-01', to: '2027-08-31', tasks: ['Weekend Laboratory Cover'] }, { tasks: ['Embryo Culture Bench', 'Cryostorage & Witnessing'] }] },
  ]),
  tasks: Object.freeze([
    // 0 = Sunday, 6 = Saturday, matching `Date.prototype.getDay`.
    { name: 'Weekend Laboratory Cover', days: [0, 6], slots: [{ band: 'principal' }, { band: 'senior' }, { band: 'junior' }], category: 'Weekend' },
    { name: 'Embryo Culture Bench', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1, category: 'Laboratory' },
    { name: 'Cryostorage & Witnessing', days: [1, 3, 5], leads: 1, coLeads: 1, category: 'Laboratory' },
  ]),
  rules: Object.freeze({
    maxConcurrentPerDay: 2,
    maxConsecutiveDays: 6,
    bands: DEFAULT_GRADE_BANDS,
  }),
});

// --- MEDICAL LABORATORY -------------------------------------------------------
//
// THE ASK: "42-hour weeks, and each of us has to do at least two Saturdays a month.
// The rest is weekday bench sessions."
//
// "AT LEAST" IS THE WHOLE POINT — every other constraint in this engine is a CEILING
// or a standing fact, and this is the one FLOOR. `quota: { per: 'month', min: 2 }` on
// the Saturday task. A floor cannot be enforced the way a ceiling can: a ceiling is
// answerable the moment a slot is offered, a floor is only knowable once the month is
// FULL, and refusing somebody a Saturday to protect a colleague's minimum would leave
// the Saturday EMPTY. So the engine PREFERS whoever is furthest behind, ahead of
// FTE-weighted fairness, and then MEASURES the finished roster and names every
// shortfall by person and month. That is why the number to check here is not "did it
// promise" but "what did every person's Saturday count come to".
//
// WHY ONE SATURDAY TASK, and not two:
// A QUOTA COUNTS DUTIES, NOT DATES — the engine says so in its own header. With two
// Saturday tasks a person could take both on ONE Saturday and satisfy `min: 2` without
// working a second Saturday at all, and "at least two Saturdays" would quietly become
// "at least two Saturday duties". With ONE task the engine's own rules make that
// impossible twice over ("already on this task today", and a `slots` list never puts
// the same person in two of its entries), so on this fixture a duty count IS a Saturday
// count — and the test counts DISTINCT DATES anyway rather than trusting that.
//
// WHY EIGHT PEOPLE AND FOUR SLOTS, and this is the paragraph that was WRONG for one
// revision. The first version of this fixture had six people and four slots: 6 × 2 = 12
// demanded against a 4-Saturday month × 4 slots = 16 available, comfortable slack. Then
// the mutation check asked the only question that matters about a floor — REMOVE THE
// QUOTA AND SEE WHAT CHANGES — and the answer was NOTHING. With that much slack,
// ordinary FTE-weighted fairness already gave all six of them two or three Saturdays a
// month, so the arrangement was demonstrating a feature that was not doing any work, and
// its test would have passed against a fixture with no floor in it at all. That is a
// decoy test, and it was found by breaking the thing rather than by reading it.
//
// EIGHT people and FOUR slots is 8 × 2 = 16 demanded against 16 available: the floor is
// EXACTLY satisfiable and nothing else satisfies it. Measured both ways —
//   floor ON:  every one of the eight gets exactly 2 distinct Saturdays in both whole
//              months. 16 of 16.
//   floor OFF: Irene Adler gets ZERO Saturdays in February and John Watson one in
//              March, while Tobias Gregson takes three of each.
// So the two numbers on screen differ by the presence of the policy, which is what a
// demonstration of a policy has to be able to show.
//
// THE HONEST COST OF THAT TIGHTNESS, stated rather than discovered later: with demand
// equal to supply this fixture has NO ABSENCE HEADROOM. Give anybody a single day of
// leave on a Saturday and the month can no longer be met, and the run will report a
// shortfall by name — correctly, and that is a demonstration worth giving, but it is not
// the one this arrangement should OPEN on. Three slots instead of four is not the
// alternative: 12 available against 16 demanded is arithmetically impossible, and the
// engine refuses it at configure time with the arithmetic shown.
//
// WHY THE RUN STARTS ON 2027-02-01: it is a Monday AND the first day of a calendar
// month, so the quota's first period is a WHOLE month. The engine judges a floor only
// where the run holds the whole period — a month the run covers four days of is a
// horizon artefact, not a broken policy — so a run that started mid-month would open
// on a "not judged there" warning about its own first month.
//
// WHY 9 WEEKS: two whole calendar months (February and March 2027) is the shortest run
// that shows "per month" happening TWICE. The four-day tail into April is deliberately
// left in rather than trimmed: it produces exactly one warning, saying the run covers
// only 2027-04-01 to 2027-04-04 of April so the floor is not judged there, and that
// sentence is the engine being honest about its own horizon in front of the people
// whose policy it is. Trimming to exactly 8 weeks would hide it; trimming to 4 would
// cost a month.
//
// MEASURED (generateRosterV2, 2027-02-01, 9 weeks): ok = true, hardViolations = 0, an
// independent `auditHardConstraints` read-back of 0, unfilled = 0, 54 days, 171 shifts,
// 9 Saturday shifts each with exactly 4 assignees, loadImbalance = 0, and ONE warning —
// the partial-April one above. Distinct Saturdays per person: 2 in February and 2 in
// March, for all eight.
export const DEMO_ARRANGEMENT_LABS = Object.freeze({
  label: 'Allied Health — Medical Laboratory',
  startDate: '2027-02-01', // Monday, and the 1st of a calendar month
  weeks: 9,
  staff: Object.freeze([
    { name: 'Sherlock Holmes', fte: 1.0, grade: 'AH15', skills: [], unavailable: [] },
    { name: 'John Watson', fte: 1.0, grade: 'AH14', skills: [], unavailable: [] },
    { name: 'Mycroft Holmes', fte: 1.0, grade: 'AH13', skills: [], unavailable: [] },
    { name: 'Irene Adler', fte: 1.0, grade: 'AH12', skills: [], unavailable: [] },
    { name: 'Tobias Gregson', fte: 1.0, grade: 'AH11', skills: [], unavailable: [] },
    { name: 'Mary Morstan', fte: 1.0, grade: 'AH10', skills: [], unavailable: [] },
    { name: 'Martha Hudson', fte: 1.0, grade: 'AH9', skills: [], unavailable: [] },
    { name: 'Stanley Hopkins', fte: 1.0, grade: 'AH8', skills: [], unavailable: [] },
  ]),
  tasks: Object.freeze([
    // Four slots, none of them band-gated: a Saturday bench is a staffing count, not a
    // hierarchy, and the engine still derives the lead from the highest grade present.
    { name: 'Saturday Bench', days: [6], slots: [{}, {}, {}, {}], category: 'Weekend', quota: { per: 'month', min: 2 } },
    { name: 'Chemistry Bench', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1, category: 'Laboratory' },
    { name: 'Haematology Bench', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1, category: 'Laboratory' },
    { name: 'Blood Bank & Transfusion', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1, category: 'Laboratory' },
    { name: 'Microbiology Bench', days: [1, 3, 5], leads: 1, coLeads: 1, category: 'Laboratory' },
  ]),
  rules: Object.freeze({
    weeklyHours: 42,
    maxConcurrentPerDay: 2,
    maxConsecutiveDays: 6,
    bands: DEFAULT_GRADE_BANDS,
  }),
});

// ==============================================================================
// 10. THE LAST TWO INTERVIEWED CONFIGS
// ==============================================================================
//
// These two arrived with a batch of seven at the roster owner's request. The other
// five of that batch were inferred — plausible services nobody had described — and
// have been DELETED; see the honesty note in section 9. Both of these came from an
// interview, so both survived the correction and both are shapes.
//
// Physiotherapy is the source of the GRADED DUTY SPLIT shape and clinical exercise
// physiology of FIXED WEEKDAY SESSIONS PLUS OUT-OF-HOURS SLOTS. Neither is offered to
// a visitor as "your service": the picker names the structure, attributes it to the
// team who described it, and labels the result with whatever profession the visitor
// chose.

// --- PHYSIOTHERAPY ------------------------------------------------------------
//
// INTERVIEWED. The roster owner spoke to this team and reported their rule in one
// sentence: "juniors cover inpatients and weekends; the senior ones then do less
// intense work — outpatient weekdays."
//
// That is TWO BAND GATES POINTING IN OPPOSITE DIRECTIONS, and it is the whole
// arrangement. The respiratory fixture has the same pair, but it is one thing among
// five there and it is INFERRED; here it is the point, and it is reported.
//
//   `leadBands: ['junior']`               on Inpatient Ward Round (Mon–Fri) and on
//        Weekend Inpatient Cover (Sat and Sun). Bands gate the LEAD ONLY, so a senior
//        may still co-lead a junior-led round — which is the supervision shape, and
//        is why the gate does not read as "seniors never go near a ward".
//   `leadBands: ['senior', 'principal']`  on both outpatient clinics. Four people are
//        senior or above against at most two gated leads on any weekday, and six
//        juniors against the ward round plus one weekend day, so neither gate can
//        starve the other.
//
// THE WEEKEND DUTY IS A SINGLE PERSON (`coLeads: 0`), because that is what "juniors
// cover weekends" describes and inventing a second body would be inventing staffing.
// It runs BOTH Saturday and Sunday, and both days are covered on all four weekends.
//
// `maxConsecutiveDays: 6` IS STATED AND DOES NOT BIND, said out loud rather than
// implied: the longest run of consecutive days anybody works in this roster is THREE
// (measured), because six juniors sharing one ward lead and one weekend day a piece
// leaves plenty of room. It is here because six days is this department's policy and a
// policy is worth stating where a visitor can see and change it — not because the
// fixture needs it. The arrangement whose weekend constraint genuinely bites is the
// medical laboratory's Saturday floor.
//
// WHY 4 WEEKS: long enough to hold four weekends, which is what makes "the weekend is
// a junior's" a pattern on screen rather than a single Saturday.
//
// MEASURED (generateRosterV2, 2026-09-07, 4 weeks): ok = true, hardViolations = 0, an
// independent `auditHardConstraints` read-back of 0, unfilled = 0, warnings = 0, 28
// days, 56 shifts. All 28 junior-gated shifts are led by a junior and all 28
// outpatient shifts by a senior or a principal — and removing the two `leadBands` keys
// changes both lists, which is the check that says the gates are doing the work rather
// than agreeing with what fairness would have done anyway.
export const DEMO_ARRANGEMENT_PHYSIOTHERAPY = Object.freeze({
  label: 'Allied Health — Physiotherapy',
  startDate: '2026-09-07', // Monday
  weeks: 4,
  staff: Object.freeze([
    { name: 'Aragorn', fte: 1.0, grade: 'AH15', skills: [], unavailable: [] },
    { name: 'Eowyn', fte: 1.0, grade: 'AH14', skills: [], unavailable: [] },
    { name: 'Faramir', fte: 1.0, grade: 'AH13', skills: [], unavailable: [] },
    { name: 'Boromir', fte: 1.0, grade: 'AH13', skills: [], unavailable: [] },
    { name: 'Samwise Gamgee', fte: 1.0, grade: 'AH12', skills: [], unavailable: [] },
    { name: 'Frodo Baggins', fte: 1.0, grade: 'AH11', skills: [], unavailable: [] },
    { name: 'Merry Brandybuck', fte: 1.0, grade: 'AH10', skills: [], unavailable: [] },
    { name: 'Pippin Took', fte: 1.0, grade: 'AH9', skills: [], unavailable: [] },
    { name: 'Bilbo Baggins', fte: 1.0, grade: 'AH8', skills: [], unavailable: [] },
    { name: 'Gimli', fte: 1.0, grade: 'AH7', skills: [], unavailable: [] },
  ]),
  tasks: Object.freeze([
    { name: 'Inpatient Ward Round', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1, category: 'Inpatient', leadBands: ['junior'] },
    // 0 = Sunday, 6 = Saturday, matching `Date.prototype.getDay`.
    { name: 'Weekend Inpatient Cover', days: [0, 6], leads: 1, coLeads: 0, category: 'Weekend', leadBands: ['junior'] },
    { name: 'Outpatient Musculoskeletal Clinic', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1, category: 'Outpatient', leadBands: ['senior', 'principal'] },
    { name: 'Outpatient Neuro Rehab Clinic', days: [2, 4], leads: 1, coLeads: 1, category: 'Outpatient', leadBands: ['senior', 'principal'] },
  ]),
  rules: Object.freeze({
    maxConcurrentPerDay: 2,
    maxConsecutiveDays: 6,
    bands: DEFAULT_GRADE_BANDS,
  }),
});

// --- RESPIRATORY THERAPY ------------------------------------------------------
//
// INTERVIEWED, 2026-08-17, AND THE NEWEST OF THE SIX. The respiratory therapist lead
// watched the Sandbox demo over Teams and then walked through the configuration with
// the roster owner. She described four things and only four:
//
//   1. the minimum job grade is AH12;
//   2. three areas — NICU, CICU and Ward 65 HiD;
//   3. they ROTATE across those areas;
//   4. Monday to Friday, office hours.
//
// This fixture exists because that is the first time anybody from respiratory has
// described their own service. Until it did, the honest thing was to ship nothing:
// the `respiratory` fixture deleted in v1.11.0 was a guess at this department, and
// section 9's rule — add a SHAPE sourced from a team who told us, or add nothing —
// is what was waiting for this conversation.
//
// ✅ THE GRADE FLOOR NOW SAYS AH12, BECAUSE THE ENGINE CAN FINALLY SAY IT.
// *(Was `leadBands: ['junior','senior','principal']` from 2026-08-18 to 2026-08-19.)*
//
// This block used to open with the opposite warning, and the history is the point.
// `leadBands` gates by BAND, and `junior` is AH11–AH12, so the nearest expressible
// gate admitted AH11 as well — one grade below what she stated. The fixture was safe
// ONLY because its cast contains no AH11, and any real respiratory team with one would
// have had them leading a duty she says needs AH12. That was defect `D10`, and the
// stress harness carried a probe that reproduced it on demand.
//
// `minGrade` is the fourth eligibility requirement kind (`ELIGIBILITY_MIN_GRADE`),
// added for exactly this: a floor asks "is your grade AT OR ABOVE this rank", where a
// band gate asks "is your band in this SET". They differ precisely when the floor falls
// INSIDE a band, which is this case.
//
// THE BANDS WERE NEVER MOVED TO FIX IT, and that was the owner's call: setting this
// department's ruler to [7,11] [12,12] [13,14] [15,17] would have landed a band gate on
// AH12 — `validateScaleRegions` permits a one-rank region — but it would relabel an
// AH11 therapist NON-EXEMPT, and `Q11` established that AH11–AH12 are junior AHPs. The
// scale stays aligned to the AHP job grades; the engine grew the missing gate instead.
//
// `coLeads: 0` STAYS, BUT NOT FOR THE REASON IT WAS ADDED. It was originally forced:
// bands gate the LEAD ONLY, so a second body was a body the floor could not reach, and
// one gated person per area was the only honest way to say "minimum AH12 covers this
// area". `minGrade` gates EVERY assignee, so that constraint is gone — this task could
// now carry a co-lead and keep its floor. It does not, for the remaining and quite
// different reason: **she never said how many people an area takes**, and inventing a
// second body would be inventing staffing. The same reasoning as the physiotherapy
// weekend duty above, and now the only reasoning.
//
// `maxConcurrentPerDay: 1` IS AN ASSUMPTION AND IS FLAGGED AS ONE. It means one area
// per person per day, which is what "they rotate across areas" reads like for
// ward-based work — but she said they rotate, not that a rotation is a day long. Listed
// with the other open questions rather than presented as reported.
//
// ROTATION IS MEASURED, NOT ENFORCED, and the difference is deliberate. She said they
// rotate; she did NOT say there is a rule that everybody must cover every area. The
// engine's fairness comparator produces the rotation on its own here, so no constraint
// was added to manufacture it. If she says it is a hard rule, that is a per-person
// quota floor per area, and it is a different fixture. Encoding it now would be
// inventing a policy from a description, which is exactly what the six deleted
// fixtures did.
//
// 🔒 THE CAST IS ALICE IN WONDERLAND, one recognisable published-fiction source as the
// PDPA note above requires, and a source no other fixture uses. Nobody from respiratory
// appears. THE GRADES ARE INVENTED and so is the headcount.
//
// THE THREE STAFF BELOW AH12 ARE THERE ON PURPOSE: without somebody the gate can
// refuse, the gate would be decorative and the falsification check below could not
// pass. They are NOT a claim that her department has three assistants.
//
// MEASURED (generateRosterV2, 2026-09-07, 4 weeks): ok = true, score.hardViolations =
// 0, an independent `auditHardConstraints` read-back of 0, unfilled = 0, warnings = 0,
// 20 days, 60 shifts. Exactly SIX distinct leads, which is every AH12-and-above person
// and nobody else. Rotation, counted rather than described: all six hold 10 duties
// each, split 3–4 per area, and no area is anybody's speciality.
//
// FALSIFIED, the way the physiotherapy gates are: removing `leadBands` from all three
// tasks puts March Hare (AH10), Dormouse (AH9) and Bill the Lizard (AH8) into the lead
// list — nine distinct leads instead of six. The gate is doing the work rather than
// agreeing with what fairness would have done anyway.
//
// AND IT IS A LIVE SIGHTING OF DEFECT D2/D3/D9. `measureRosterLoad` reports
// `neverRostered: ['March Hare', 'Dormouse', 'Bill the Lizard']` for this roster and
// the generator returns warnings = 0 — three people are unrosterable for four straight
// weeks and NOTHING ON SCREEN SAYS SO, because that measurement has no UI caller. Here
// it is correct and intended. In a department that mistyped a grade it would be silent
// data loss, which is why surfacing it is queue item 2.
export const DEMO_ARRANGEMENT_RESPIRATORY = Object.freeze({
  label: 'Allied Health — Respiratory Therapy',
  startDate: '2026-09-07', // Monday
  weeks: 4,
  staff: Object.freeze([
    { name: 'Queen of Hearts', fte: 1.0, grade: 'AH16', skills: [], unavailable: [] },
    { name: 'Cheshire Cat', fte: 1.0, grade: 'AH14', skills: [], unavailable: [] },
    { name: 'White Rabbit', fte: 1.0, grade: 'AH13', skills: [], unavailable: [] },
    { name: 'Caterpillar', fte: 1.0, grade: 'AH13', skills: [], unavailable: [] },
    { name: 'Alice', fte: 1.0, grade: 'AH12', skills: [], unavailable: [] },
    { name: 'Mad Hatter', fte: 1.0, grade: 'AH12', skills: [], unavailable: [] },
    // Below the floor, and the reason the gate above is testable rather than decorative.
    { name: 'March Hare', fte: 1.0, grade: 'AH10', skills: [], unavailable: [] },
    { name: 'Dormouse', fte: 1.0, grade: 'AH9', skills: [], unavailable: [] },
    { name: 'Bill the Lizard', fte: 1.0, grade: 'AH8', skills: [], unavailable: [] },
  ]),
  tasks: Object.freeze([
    // Her three areas, by her names for them. Mon–Fri; the engine has no clock, so
    // "office hours" is the weekday pattern and nothing further is claimed — see the
    // hours model's limits ledger, item 12.
    { name: 'NICU', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 0, category: 'Clinical', minGrade: 'AH12' },
    { name: 'CICU', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 0, category: 'Clinical', minGrade: 'AH12' },
    { name: 'Ward 65 HiD', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 0, category: 'Clinical', minGrade: 'AH12' },
  ]),
  rules: Object.freeze({
    maxConcurrentPerDay: 1,
    maxConsecutiveDays: 6,
    bands: DEFAULT_GRADE_BANDS,
  }),
});

// --- CLINICAL EXERCISE PHYSIOLOGY ---------------------------------------------
//
// INTERVIEWED. This is the department NEXUS was built for, and its real duty list is
// in this repository: `LIVE_ROSTER_DEFAULTS` in `src/utils/auraEngine.js`. The duty
// NAMES below are read off that code, not invented.
//
// ⚠️ BUT THE STRUCTURE BELOW IS NOT THIS SERVICE'S STRUCTURE, and saying so is the
// point of this note. The roster owner, 2026-08-15: *"for my team of CEP each task
// lasts for a week and then we rotate, not daily."* The live V1 engine does exactly
// that — `rotate(staff, w)` picks a lead per task per WEEK and writes that one person
// across all five days (`auraEngine.js:129-135`). **V2, which generates this shape,
// assigns per DAY**, so a duty here changes hands mid-week: measured before this note
// was written, `EFT` ran Atalanta / Penelope / Penelope / Penelope / Hector inside one
// week. Nobody in the real service works like that.
//
// V2 CANNOT EXPRESS A WEEKLY ROTATION TODAY. `continuity: true` is the nearest
// primitive and it is the wrong shape — it asks for the SAME lead on every occurrence
// forever, which is the opposite of rotating. Cohort windows could simulate it by
// enumerating every person × task × week, which is the "data-entry accident waiting to
// happen" their own comment warns against. So this shape demonstrates the department's
// DUTIES and its six-day week honestly, and its assignment pattern is the engine's,
// not the department's. Recorded as a gap rather than papered over.
//
// The acronyms were retired on 2026-08-15: `EFT`, `IPT+SKG`, `NC` and `FSG+WI` meant
// nothing outside this one service, and two of them were compounds holding two duties
// in a single string. The video consultation also moved from Tuesday afternoon to
// Thursday morning, which this file had not caught up with either.
//
// 🔒 THE FOUR STAFF NAMES ARE NOT. `LIVE_ROSTER_DEFAULTS.staff` names four real
// colleagues, and a demo any visitor can screenshot is exactly where their names must
// not be, so the cast here is Greek myth and none of the four appears. The GRADES are
// invented too — a job grade is personal data of the same kind — and are spread across
// the three bands so the band ruler has something to show. NO TASK IS BAND-GATED,
// which is also true of the real service: four people covering four duties gate on
// availability, not on hierarchy.
//
// THE ONE ENGINE FIELD THIS ARRANGEMENT NEEDS THAT NOTHING ELSE HERE USES is
// `maxConcurrentPerDay: 3`. Four people against four duties, each with a lead and a
// co-lead, is eight duties a day — exactly two each. Tuesday adds the video consult's
// two, so two people hold THREE duties that day, and with the 2-a-day cap every other
// arrangement uses the Tuesday consult would be reported unfillable. Three is
// therefore the real department's own policy rather than a number chosen to make a
// demo work, and it is stated where a visitor can see and change it.
//
// WHY 2026-02-02 AND 4 WEEKS: `LIVE_ROSTER_DEFAULTS` says `2026-02-01`, 4 weeks — and
// 2026-02-01 is a SUNDAY, which the live engine snaps forward to the Monday
// (`snapToMonday`). The Monday it snaps to is 2026-02-02, so this fixture states the
// date the live roster actually starts from rather than the one it is configured with.
// V2 snaps a mid-week date BACKWARDS, so stating the Sunday here would have started
// the demo a week early — the two engines disagree about which way to snap, and this
// is the one fixture where that matters.
//
// MEASURED AGAIN after the 2026-08-15 rename and split (generateRosterV2, 2026-02-02,
// 4 weeks): ok = true, unfilled = 0, warnings = 0, 24 days, **140 shifts** — up from 88,
// because two compound duties became four and three duties the list never carried were
// added. It fills at the department's own `maxConcurrentPerDay: 3` with no change: the
// two duties that gained rows are single-lead, and the group sessions run one afternoon
// each rather than daily, so the extra rows cost less than their count suggests.
export const DEMO_ARRANGEMENT_EXERCISE_PHYSIOLOGY = Object.freeze({
  label: 'Allied Health — Clinical Exercise Physiology',
  startDate: '2026-02-02', // Monday — the day the live roster's 2026-02-01 snaps to
  weeks: 4,
  staff: Object.freeze([
    { name: 'Atalanta', fte: 1.0, grade: 'AH15', skills: [], unavailable: [] },
    { name: 'Hector', fte: 1.0, grade: 'AH13', skills: [], unavailable: [] },
    { name: 'Penelope', fte: 1.0, grade: 'AH11', skills: [], unavailable: [] },
    { name: 'Theseus', fte: 1.0, grade: 'AH8', skills: [], unavailable: [] },
  ]),
  tasks: Object.freeze([
    // The weekday duties, by their real names — the acronyms (`EFT`, `IPT+SKG`,
    // `NC`, `FSG+WI`) were retired on 2026-08-15 because this shape is offered to
    // departments who cannot read them. Two were COMPOUNDS holding two duties in
    // one string, and splitting them is why four rows became eight.
    { name: 'Physical Activity Counseling', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 0, category: 'Clinical' },
    { name: 'Exercise Test', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1, category: 'Clinical' },
    { name: 'New Case', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1, category: 'Clinical' },
    { name: 'Walk-in', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 0, category: 'Clinical' },
    { name: 'Individual Session', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 0, category: 'Clinical' },
    { name: 'Inpatient Exercise', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1, category: 'Clinical' },
    // The group sessions, named by AGE BAND rather than by the local programme name.
    // The department calls them Super Kids (12 and under) and Fitness Superstars (13
    // and above); nobody outside this service knows those words, and this shape is
    // read by people who are not in it.
    { name: 'Paediatrics Group Session', days: [3], leads: 1, coLeads: 1, category: 'Clinical' },
    { name: 'Adolescent Group Session', days: [5], leads: 1, coLeads: 1, category: 'Clinical' },
    // Video consultations. The individual one runs Thursday and Saturday MORNINGS;
    // the group one is an afternoon, like every other group session.
    { name: 'Video Consultation Individual', days: [4, 6], leads: 1, coLeads: 1, category: 'Clinical' },
    { name: 'Video Consultation Group', days: [2], leads: 1, coLeads: 1, category: 'Clinical' },
  ]),
  rules: Object.freeze({
    // Three, not two — see the note above. This is the department's own policy.
    maxConcurrentPerDay: 3,
    maxConsecutiveDays: 6,
    bands: DEFAULT_GRADE_BANDS,
  }),
});

// ==============================================================================
// 11. THE FICTIONAL QUICK DEMO, AND THE PICKER'S SHAPE LIST
// ==============================================================================

/**
 * THE MARVEL TEAM — the quick demo, and deliberately the smallest thing here.
 *
 * Every shape demonstrates a specific structure a real profession described: a monthly
 * principal-only clinic, a weekend trio on block rotation, a Saturday floor. This one
 * demonstrates nothing except that the thing runs, and its bigger sibling
 * (`DEMO_EXAMPLE_DEPARTMENT`, the full worked example) demonstrates the honest refusal
 * to staff a slot nobody can hold. Neither claims a profession. This one is
 * five people, four ordinary weekday duties, no skills, no quotas, no windows, no
 * hours overrides — so a visitor who opened the app on a phone in a corridor can
 * pick it, press Draft, and see a filled calendar in one screen.
 *
 * The names are the ones this app has used for its sandbox since the beginning
 * (`MOCK_STAFF` — Steve, Peter, Charles, Jean, Tony), spelled out in full so the
 * staff table's placeholder can be one of them. Fictional, so no PDPA question
 * arises even if a visitor screenshots it.
 *
 * Grades span all three bands so the band ruler has something to show, but NO task
 * is band-gated: a first look should not open with a refusal.
 */
const DEMO_ARRANGEMENT_MARVEL = Object.freeze({
  label: 'The Marvel Team (quick demo)',
  startDate: '2026-09-07',
  weeks: 2,
  staff: Object.freeze([
    Object.freeze({ name: 'Steve Rogers',   fte: 1,   grade: 'AH15', skills: Object.freeze([]), unavailable: Object.freeze([]) }),
    Object.freeze({ name: 'Peter Parker',   fte: 1,   grade: 'AH8',  skills: Object.freeze([]), unavailable: Object.freeze([]) }),
    Object.freeze({ name: 'Charles Xavier', fte: 1,   grade: 'AH16', skills: Object.freeze([]), unavailable: Object.freeze([]) }),
    Object.freeze({ name: 'Jean Grey',      fte: 0.6, grade: 'AH13', skills: Object.freeze([]), unavailable: Object.freeze([]) }),
    Object.freeze({ name: 'Tony Stark',     fte: 1,   grade: 'AH14', skills: Object.freeze([]), unavailable: Object.freeze([]) }),
  ]),
  tasks: Object.freeze([
    Object.freeze({ name: 'Morning Clinic',    days: Object.freeze([1, 2, 3, 4, 5]), leads: 1, coLeads: 1, category: 'Clinical' }),
    Object.freeze({ name: 'Ward Round',        days: Object.freeze([1, 2, 3, 4, 5]), leads: 1, coLeads: 0, category: 'Clinical' }),
    Object.freeze({ name: 'Teaching Session',  days: Object.freeze([3]),             leads: 1, coLeads: 1, category: 'Education' }),
    Object.freeze({ name: 'Equipment Check',   days: Object.freeze([5]),             leads: 1, coLeads: 0, category: 'Admin' }),
  ]),
  rules: Object.freeze({
    bands: DEFAULT_GRADE_BANDS,
  }),
});

/**
 * THE SIX SHAPES AND THE TWO DEMOS, IN THE ORDER THE PICKER SHOWS THEM.
 *
 * ORDER IS DELIBERATE AND IS NOT ALPHABETICAL, and that is a change from the twelve
 * arrangements this replaced. The owner's "make the dropdown read alphabetically"
 * applied to a list of PROFESSIONS, where alphabetical is the only findable order and a
 * reader arrives knowing the word they are looking for. That list still exists and is
 * still sorted in code — it is `MOH_PROFESSION_OPTIONS` below, and the sort is there
 * rather than here. Nobody arrives looking for the letter G in a list of six
 * structures, so these are ordered by what they are: the six shapes with an interview
 * behind them first, the two openly fictional demos after, each group labelled on
 * screen with an `<optgroup>` so the ordering reads as structure rather than as
 * somebody having forgotten to sort.
 *
 * One entry per shape:
 *
 *   id                  stable key for React, for a test, and for a saved selection.
 *                       NEVER derived from `name` and never renumbered.
 *   name                what the option says. Names the STRUCTURE, not a department.
 *   demonstrates        ONE SENTENCE describing that structure, so choosing between
 *                       these options is choosing between structures.
 *   group               `'shape'` or `'demo'` — which `<optgroup>` it renders under.
 *   provenance          `DEMO_PROVENANCE_INTERVIEWED` or `DEMO_PROVENANCE_FICTIONAL`.
 *                       There is no third kind; see section 9.
 *   sourceProfession    THE PROFESSION WHOSE WEEK THIS STRUCTURE CAME FROM, as a
 *                       reader sees it, or `null` for the fictional demos. A FIELD
 *                       rather than a sentence in the copy, so the UI cannot render a
 *                       shape without attributing it.
 *   sourceProfessionId  THE AUTO-SUGGESTION KEY, AND NOTHING ELSE. A `mohAlliedHealth.js`
 *                       id, so a pairing is computable rather than hand-listed. Usually a
 *                       LEAF id; for the periodic clinic it is a GROUP id, because the
 *                       interview named the profession and not one of its six
 *                       sub-disciplines. `null` for the demos AND for any shape that
 *                       should not be offered to a whole profession — see below.
 *   sourceScope         HOW BROADLY THIS WAS DESCRIBED: `{ teams, institutions,
 *                       describedOn }`. Required on every interviewed shape. `null` for
 *                       the demos.
 *
 * ⚠️ `sourceProfession` AND `sourceProfessionId` USED TO BE ONE IDEA AND ARE NOW TWO,
 * because they were doing two unrelated jobs and one of them was making a false claim.
 * ATTRIBUTION is "whose structure is this" and is carried by `sourceProfession` +
 * `sourceScope`; SUGGESTION is "should everyone with this job title be pointed here" and
 * is carried by `sourceProfessionId` alone. An interviewed shape MUST have the first. It
 * MAY decline the second — respiratory does, and is still fully attributed.
 *
 * ⚠️ WHY `sourceScope` EXISTS, AND IT IS THE CORRECTION OF A REAL OVER-CLAIM. Every shape
 * here came from ONE TEAM AT ONE INSTITUTION. The picker was telling a reader "this is the
 * shape your own profession described to us" — so a respiratory therapist at any other
 * SingHealth institution was told their profession had described a structure that one KKH
 * team described, and there are 27 other allied health professions with the same exposure.
 * A profession is not a team. Scope is DATA rather than a sentence for one reason: when a
 * second team from the same profession describes something different, `teams: 2,
 * institutions: 2` is a field that changes, where a hand-written sentence is a thing
 * somebody has to remember to rewrite and will not.
 *
 * `describedOn` IS `null` FOR FIVE OF THE SIX AND THAT IS NOT AN OVERSIGHT — it is the
 * measurement. Four of them were interviewed before v1.8.0 and no date was recorded at the
 * time, and the owner's own service was never "described" on a day at all. Only respiratory
 * has one, because the field existed by the time they were asked. A null here reads
 * "nobody wrote it down", which is worth knowing and is not the same as "recently".
 *   attribution         the sentence shown beside the shape and again beside the
 *                       finished roster. It says whose structure this is AND that it is
 *                       a starting point — never what the visitor's own service does.
 *   config              `rosterEngineV2`'s input contract verbatim — handed straight to
 *                       the wizard's tables, and from there to `generateRosterV2`.
 *
 * THERE IS NO `correction` FIELD ANY MORE. Nothing here claims to be a service it is
 * not, so there is nothing to disclaim. `attribution` is the field that replaced it,
 * and the difference is the direction it points: a correction block apologised for a
 * guess about the reader's service, an attribution states whose structure this is.
 */
export const DEMO_SHAPES = Object.freeze([
  Object.freeze({
    id: 'shape-graded-duty',
    name: 'Graded duty split',
    demonstrates: 'Juniors take the wards and the weekends; seniors and principals take the specialist weekday clinics. Two band gates pointing opposite ways inside one team.',
    group: 'shape',
    provenance: DEMO_PROVENANCE_INTERVIEWED,
    sourceProfession: 'Physiotherapist',
    sourceProfessionId: 'physiotherapist',
    sourceScope: Object.freeze({ teams: 1, institutions: 1, describedOn: null }),
    attribution: 'One physiotherapy team, at one institution, described this week. It is a starting point to adapt — every row of it is editable, physiotherapists elsewhere work differently, and it says nothing about your own service.',
    config: DEMO_ARRANGEMENT_PHYSIOTHERAPY,
  }),
  Object.freeze({
    id: 'shape-periodic-clinic',
    name: 'Periodic specialist clinic, same practitioner each time',
    demonstrates: 'A clinic on the third Wednesday of every month, principals only, held by the same principal every time — inside a stated 42-hour week.',
    group: 'shape',
    provenance: DEMO_PROVENANCE_INTERVIEWED,
    // MOH's own name for profession 24, verbatim. The interview did not distinguish a
    // sub-discipline, so this names the PROFESSION (a group label in the taxonomy) and
    // not one of its six leaves — inventing "clinical" here would be inventing the one
    // fact the interview did not supply. `DEMO_SHAPE_SUGGESTIONS` expands a group id to
    // all of its leaves for exactly this case.
    sourceProfession: 'Psychologist (excluding associate psychologist)',
    sourceProfessionId: 'psychologist',
    sourceScope: Object.freeze({ teams: 1, institutions: 1, describedOn: null }),
    attribution: 'One psychology team, at one institution, described this week. It is a starting point to adapt — every row of it is editable, psychologists elsewhere work differently, and it says nothing about your own service.',
    config: DEMO_ARRANGEMENT_PSYCHOLOGY,
  }),
  Object.freeze({
    id: 'shape-team-rotation',
    name: 'Team-based rotation',
    demonstrates: 'A shift that needs a principal, a senior and a junior at once, and three teams taking four-month blocks so each team appears only in its own block.',
    group: 'shape',
    provenance: DEMO_PROVENANCE_INTERVIEWED,
    sourceProfession: 'Embryologist',
    sourceProfessionId: 'embryologist',
    sourceScope: Object.freeze({ teams: 1, institutions: 1, describedOn: null }),
    attribution: 'One embryology team, at one institution, described this week. It is a starting point to adapt — every row of it is editable, embryologists elsewhere work differently, and it says nothing about your own service.',
    config: DEMO_ARRANGEMENT_EMBRYOLOGY,
  }),
  Object.freeze({
    id: 'shape-weekend-quota',
    name: 'Weekend quota inside an hours ceiling',
    demonstrates: 'At least two Saturdays per person per calendar month — a floor rather than a limit, measured and reported wherever it is not met — under a stated 42-hour week.',
    group: 'shape',
    provenance: DEMO_PROVENANCE_INTERVIEWED,
    sourceProfession: 'Medical Laboratory Technologist / Scientist',
    sourceProfessionId: 'medical-laboratory-technologist',
    sourceScope: Object.freeze({ teams: 1, institutions: 1, describedOn: null }),
    attribution: 'One medical laboratory team, at one institution, described this week. It is a starting point to adapt — every row of it is editable, laboratories elsewhere work differently, and it says nothing about your own service.',
    config: DEMO_ARRANGEMENT_LABS,
  }),
  Object.freeze({
    id: 'shape-weekday-sessions',
    name: 'Fixed weekday sessions plus out-of-hours slots',
    demonstrates: 'Four fixed weekday sessions and two consult slots outside them — one mid-week afternoon, one Saturday morning — and the three-duty day the mid-week one needs.',
    group: 'shape',
    provenance: DEMO_PROVENANCE_INTERVIEWED,
    sourceProfession: 'Clinical Exercise Physiologist',
    sourceProfessionId: 'clinical-exercise-physiologist',
    sourceScope: Object.freeze({ teams: 1, institutions: 1, describedOn: null }),
    attribution: 'This is the roster owner’s own service — one team, at one institution — by its real duty names. Its DUTIES are reported; its assignment pattern is not. The real service gives one person a duty for a whole week and then rotates, and this engine assigns each day independently, so a duty here changes hands mid-week. It is a starting point to adapt, exercise physiologists elsewhere work differently, and it says nothing about your own service.',
    config: DEMO_ARRANGEMENT_EXERCISE_PHYSIOLOGY,
  }),
  Object.freeze({
    id: 'shape-graded-floor-rotation',
    name: 'A grade floor, and a rotation across fixed areas',
    demonstrates: 'Three named areas covered every weekday, each by one person at or above a minimum job grade, with the department rotating through all three rather than settling into one.',
    group: 'shape',
    provenance: DEMO_PROVENANCE_INTERVIEWED,
    sourceProfession: 'Respiratory Therapist',
    // DELIBERATELY NULL, AND THE ONLY ONE. See `sourceProfessionId` in the field table
    // above: this is the AUTO-SUGGESTION key, not the attribution. Respiratory therapists
    // work across every institution in the cluster and the owner knows their rotations
    // differ, so no RT is pointed at one team's structure as though it were their
    // profession's. The shape is still fully attributed — by `sourceProfession` and
    // `sourceScope`, which is the split that made this possible.
    sourceProfessionId: null,
    sourceScope: Object.freeze({ teams: 1, institutions: 1, describedOn: '2026-08-17' }),
    attribution: 'One respiratory therapy team, at one institution, described this week on 17 August 2026. It is a starting point to adapt — every row of it is editable, respiratory therapists at other institutions rotate differently, and it says nothing about your own service.',
    config: DEMO_ARRANGEMENT_RESPIRATORY,
  }),
  Object.freeze({
    id: 'marvel',
    name: 'The Marvel Team',
    demonstrates: 'The quickest look: five people, four ordinary duties, nothing gated. Press Draft and a filled calendar appears — start here, then try one of the six shapes.',
    group: 'demo',
    provenance: DEMO_PROVENANCE_FICTIONAL,
    sourceProfession: null,
    sourceProfessionId: null,
    sourceScope: null,
    attribution: 'Openly fictional — nobody’s service, and not modelled on one. It exists so the engine can be watched working in one screen.',
    config: DEMO_ARRANGEMENT_MARVEL,
  }),
  Object.freeze({
    id: 'marvel-worked-example',
    name: 'The Marvel Team — full worked example',
    demonstrates: 'The same fictional team, twelve people deep: duties only certain grades may lead, a skill-gated session, a part-timer, one person on leave — and the one duty it will not pretend to have staffed.',
    group: 'demo',
    provenance: DEMO_PROVENANCE_FICTIONAL,
    sourceProfession: null,
    sourceProfessionId: null,
    sourceScope: null,
    attribution: 'Openly fictional — nobody’s service, and not modelled on one. It was the "Respiratory example" until that name was retired for claiming a service nobody had described; the structure is unchanged and now belongs to no profession at all.',
    config: DEMO_EXAMPLE_DEPARTMENT,
  }),
]);

/** One shape by id, or `null`. A stale id in a saved selection is not a crash. */
export const demoShapeById = (id) => DEMO_SHAPES.find((shape) => shape.id === id) || null;

// ==============================================================================
// 12. THE PROFESSION LIST — MOH'S OWN VOCABULARY, AS THE PICKER'S FIRST CONTROL
// ==============================================================================
//
// All 28 professions, nested exactly as MOH nests them, and NOTHING IS SAID ABOUT ANY
// OF THEM. That is the whole design: choosing a profession picks a LABEL for the
// configuration the visitor is about to build, so an art therapist's roster is headed
// "Art Therapist" instead of "Physiotherapy". It selects no duties, no grades and no
// rules; those come from the shape, which is attributed to whoever described it.
//
// TWO PROFESSIONS NEST — 12 (Medical Technologist / Physiologist, five sub-disciplines)
// and 24 (Psychologist, six) — so the 28 are 37 selectable leaves. Their parents are
// GROUP LABELS and not choices: a roster belongs to a cardiac lab or a sleep lab, never
// to "medical technology" in general. `<optgroup>` is the native control for exactly
// that distinction, and a browser will not let a visitor select a group heading, which
// is the behaviour we want rather than one we would have to enforce.
//
// SORTED IN CODE, alphabetically by the name a visitor READS, with an explicit 'en'
// locale — a list whose order depends on the reader's machine is not an order. A
// nesting profession sorts by its GROUP name and its children sort within it, so the
// walk down the list is the walk down MOH's list. Hand-ordering is what this avoids:
// the 29th profession will be added by somebody who has not read this file.
const byReaderVisibleName = (a, b) => a.sortName.localeCompare(b.sortName, 'en');

export const MOH_PROFESSION_OPTIONS = Object.freeze(
  MOH_ALLIED_HEALTH_PROFESSIONS
    .map((profession) => (profession.children
      ? Object.freeze({
        kind: 'group',
        label: profession.name,
        groupId: profession.id,
        sortName: profession.name,
        options: Object.freeze(
          MOH_PROFESSION_LEAVES
            .filter((leaf) => leaf.groupId === profession.id)
            .map((leaf) => Object.freeze({ ...leaf, sortName: leaf.name }))
            .sort(byReaderVisibleName),
        ),
      })
      : Object.freeze({
        kind: 'option',
        ...MOH_PROFESSION_LEAVES.find((leaf) => leaf.id === profession.id),
        sortName: profession.name,
      })))
    .sort(byReaderVisibleName),
);

/**
 * THE OWNER'S OWN SUGGESTED STARTING POINTS — shape id → profession leaf ids.
 *
 * ⚠️ A SUGGESTION IS NOT A DESCRIPTION, and this map is the one place in this file
 * where that could most easily be misread. It does NOT say that sonographers run a
 * graded duty split; it says that if a sonographer has to start somewhere, the graded
 * duty split is the likelier fit. The UI must render it as a suggestion, non-binding,
 * with every other shape one tap away — and it must never turn into a default that
 * loads itself, because a suggestion that loads without being chosen is a claim.
 *
 * These pairings are the roster owner's, given as part of this change. They are not
 * derived from anything and are not evidence about any of these professions.
 */
const OWNER_SUGGESTED_SHAPES = Object.freeze({
  'shape-graded-duty': Object.freeze([
    'sonographer',
    'diagnostic-radiographer',
    'occupational-therapist',
    'podiatrist',
  ]),
  'shape-periodic-clinic': Object.freeze([
    'genetic-counsellor',
    'orthoptist',
    'clinical-counsellor',
  ]),
  'shape-team-rotation': Object.freeze([
    'perfusionist',
    'nuclear-medicine-technologist',
    'radiation-therapist',
  ]),
  // All five sub-disciplines of MOH profession 12, named individually: the parent is a
  // group label, so "Medical Technologist / Physiologist" is not a selectable answer.
  'shape-weekend-quota': Object.freeze([
    'medtech-cardiac',
    'medtech-neuro',
    'medtech-pulmonary',
    'medtech-sleep',
    'medtech-vascular',
  ]),
  'shape-weekday-sessions': Object.freeze([
    'art-therapist',
    'music-therapist',
    'play-therapist',
    'child-life-therapist',
    'speech-therapist',
    'dietitian',
    'optometrist',
  ]),
});

/**
 * Profession leaf id → suggested shape id, inverted from the map above.
 *
 * TWO SOURCES, AND THE SECOND ONE IS DERIVED RATHER THAN TYPED: the owner's pairings,
 * plus each shape's OWN source profession pointing at itself. A physiotherapist opening
 * the picker should be told that the graded duty split came from their profession, and
 * that fact is already in `sourceProfessionId` — hand-adding it to the owner's list
 * would be two places to keep in step. Where the two disagree the owner's pairing wins,
 * because it is a judgement and the derived one is only an identity.
 *
 * A profession with no entry gets NO suggestion, and that is correct rather than a gap.
 * Thirty-two of the 37 leaves are covered; the five that are not —
 * `auditory-verbal-therapist`, `audiologist`, `medical-social-worker`,
 * `prosthetist-orthotist`, `respiratory-therapist` — are not paired with a shape, and
 * inventing a suggestion for them would be inventing exactly what this change removed.
 * Three of those five HAD a hand-built fixture before this change, which is the clearest
 * measure of what was wrong with it: a guess reads as more helpful than a blank, and it
 * is not.
 *
 * ⚠️ `respiratory-therapist` IS ON THIS LIST FOR A DIFFERENT REASON FROM THE OTHER FOUR,
 * AND THE DIFFERENCE IS THE POINT. The other four have no shape. Respiratory HAS one —
 * they described their week on 2026-08-17 and it is the sixth shape — and it is
 * deliberately not paired, because one KKH team is not the profession. RTs work across
 * every institution in the cluster and their rotations differ, so pointing all of them at
 * one team's structure would be the same over-claim the twelve arrangements made, wearing
 * an interview as cover. The shape stays reachable by what it DOES, one tap away in the
 * list, attributed to the team that described it.
 *
 * ⚠️ AND THE FIVE THAT ARE STILL PAIRED ARE PAIRED ON BORROWED TIME. Every one of them is
 * also one team at one institution — `sourceScope` now says so on all six. They keep their
 * suggestion only because no second team from those professions has yet described anything
 * different. THE TRIGGER TO DELETE SUGGESTION-BY-PROFESSION ENTIRELY: the first time two
 * teams in one profession describe two different structures, this map is making a claim it
 * cannot support, and picking a shape by what it does is the only honest control left.
 *
 * ⚠️ AUDIOLOGY IS NOT THE SAME CASE EITHER. Their roster master has been spoken to, but he
 * asked for a FEATURE (half-day AM/PM sessions); he did not describe his week. A
 * conversation is not a structure.
 */
export const DEMO_SHAPE_SUGGESTIONS = Object.freeze(
  Object.fromEntries([
    // A shape's own source profession, expanded to LEAVES: 'psychologist' is a group
    // label in the taxonomy, so it becomes all six of its sub-disciplines and the
    // remaining four expand to themselves.
    ...DEMO_SHAPES
      .filter((shape) => shape.sourceProfessionId)
      .flatMap((shape) => MOH_PROFESSION_LEAVES
        .filter((leaf) => leaf.id === shape.sourceProfessionId
          || leaf.groupId === shape.sourceProfessionId)
        .map((leaf) => [leaf.id, shape.id])),
    ...Object.entries(OWNER_SUGGESTED_SHAPES)
      .flatMap(([shapeId, professionIds]) => professionIds.map((id) => [id, shapeId])),
  ]),
);

/** The suggested shape for a profession, as a whole shape, or `null`. Never throws. */
export const suggestedShapeFor = (professionId) =>
  demoShapeById(DEMO_SHAPE_SUGGESTIONS[professionId] || '') || null;
