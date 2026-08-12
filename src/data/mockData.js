// JG11-JG16 Sandbox Data: Marvel Universe Edition

// The sandbox example department's grades are tuned against the engine's shipped
// band boundaries (see DEMO_EXAMPLE_DEPARTMENT below). Imported rather than
// retyped so the two cannot drift apart. READ-ONLY: nothing in this file edits
// the engine.
import { DEFAULT_GRADE_BANDS } from '../utils/rosterEngineV2.js';

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

// 8. THE SANDBOX EXAMPLE DEPARTMENT (RosterView demo mode → "Load example department")
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
//      deliberately NOT over-applied: REHAB has four holders and SLEEP three, so
//      those tasks always fill both duties and the only unfilled slot in the run
//      is the intended one.
//   4. Exactly ONE unfillable slot, and it is legible: CPET is held by only
//      Bruce Banner and Shuri. Shuri is on leave on Wednesday 2026-09-16, and
//      Paediatric CPET runs on Wednesdays only — so on that one date the engine
//      fills the lead (Bruce) and reports the co-lead as unfilled, saying why:
//      "2 qualified, 1 on leave, 1 already on this task". Verified against the
//      engine: 1 unfilled slot, 0 hard-constraint violations, 40 shifts.
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
//      violations, still 40 shifts over 12 days, and 0 warnings.
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
  label: 'Allied Health — Respiratory & Rehab (example)',
  startDate: '2026-09-07', // Monday
  weeks: 2,
  staff: Object.freeze([
    { name: 'Carol Danvers', fte: 1.0, grade: 'AH16', skills: ['SLEEP', 'REHAB'], unavailable: [] },
    { name: 'Bruce Banner', fte: 1.0, grade: 'AH14', skills: ['CPET', 'SLEEP'], unavailable: [] },
    { name: 'Shuri', fte: 1.0, grade: 'AH13', skills: ['CPET'], unavailable: ['2026-09-16'] },
    { name: 'Sam Wilson', fte: 1.0, grade: 'AH12', skills: ['REHAB'], unavailable: [] },
    { name: 'Wanda Maximoff', fte: 1.0, grade: 'AH11', skills: ['REHAB'], unavailable: [] },
    { name: 'Stephen Strange', fte: 1.0, grade: 'AH13', skills: ['SLEEP'], unavailable: [] },
    { name: 'Natasha Romanoff', fte: 1.0, grade: 'AH10', skills: [], unavailable: [] },
    { name: "T'Challa", fte: 1.0, grade: 'AH14', skills: ['REHAB'], unavailable: [] },
    { name: 'Kamala Khan', fte: 1.0, grade: 'AH8', skills: [], unavailable: [] },
    { name: 'Scott Lang', fte: 0.6, grade: 'AH9', skills: [], unavailable: [] },
    { name: 'Riri Williams', fte: 1.0, grade: 'AH7', skills: [], unavailable: [] },
    { name: 'Monica Rambeau', fte: 1.0, grade: 'AH10', skills: [], unavailable: [] },
  ]),
  tasks: Object.freeze([
    { name: 'Inpatient Rounds', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1, category: 'Clinical', leadBands: ['junior'] },
    { name: 'Outpatient Clinic', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1, category: 'Clinical', leadBands: ['senior', 'principal'] },
    { name: 'Paediatric CPET', days: [3], leads: 1, coLeads: 1, category: 'Clinical', requiresSkill: 'CPET' },
    { name: 'Pulmonary Rehab Group', days: [2, 4], leads: 1, coLeads: 1, category: 'Rehab', requiresSkill: 'REHAB' },
    { name: 'Cardiac Rehab Clinic', days: [1, 5], leads: 1, coLeads: 1, category: 'Rehab', requiresSkill: 'REHAB' },
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

// 9. THE FOUR SELECTABLE ARRANGEMENTS (RosterView demo mode → the example picker)
//
// APPEND-ONLY SECTION. Everything above this line — including
// `DEMO_EXAMPLE_DEPARTMENT` — is byte-identical to what it was before this section
// existed, so every assertion already written against it still means what it meant.
// `DEMO_EXAMPLE_DEPARTMENT` IS the respiratory arrangement (entry 1 below holds it by
// reference, not by copy), and `DEMO_ARRANGEMENT_RESPIRATORY` is an alias for it.
//
// WHY FOUR. The roster owner presents to the respiratory therapists first, follows up
// with the psychologists, and wants the embryologists and the medical laboratory
// scientists trying it. A single fixture demonstrated one team's problem and left the
// other three reading somebody else's roster. Each arrangement below is chosen so
// that the ONE capability that team asked about is the thing on screen:
//
//   respiratory  grade bands + a skill gate + a part-timer + leave, and the ONE slot
//                the engine refuses to invent cover for.
//   psychology   a monthly clinic on the 3rd Wednesday of every month, principals
//                only, with the SAME principal every time (continuity of care).
//   embryology   a weekend shift that needs THREE people at once (principal, senior,
//                junior), and three teams whose eligibility is bounded in time so
//                team A appears in its four-month block and nowhere else.
//   labs         a floor rather than a ceiling: at least two Saturdays per person per
//                calendar month, measured and reported where it is not met.
//
// ⚠️ THE RESPIRATORY ARRANGEMENT IS INFERRED, NOT REPORTED. This is the honesty
// constraint on the whole section and it is the reason `provenance` is a FIELD the UI
// reads rather than a sentence in a caption somebody can forget to render. The
// respiratory therapists HAVE NOT BEEN INTERVIEWED. Their arrangement was written by
// pattern-matching the three teams that were — weekday sessions, a grade-gated duty,
// a skill-gated one, one part-timer, one absence — and it is therefore an EXAMPLE TO
// BE CORRECTED and must never be presented as their service. Specifically, and
// deliberately, it does NOT invent: a night or on-call rota; any named competency,
// accreditation or certification; a session length; a caseload; or a staff count. The
// one weekend duty it carries ('Weekend Acute Cover') predates this section and is
// part of the older fixture; it is an assumption too, and it is on the correction
// list below rather than being quietly removed from a frozen export other tests read.
//
// The other three carry `provenance: 'interviewed'` because their SHAPE came from a
// field interview. The DATA in them did not: every name is fictional and every task
// name, grade, date and figure was invented to make the shape reproducible. Nothing
// here is anybody's real roster, real grade or real leave — see the PDPA note below.
//
// 🔒 PDPA — FICTIONAL NAMES, ONE RECOGNISABLE CAST PER ARRANGEMENT. No colleague's
// name appears anywhere in this file. The names are drawn from published fiction, one
// source per arrangement (respiratory: Marvel, as the older fixture already was;
// psychology: Star Trek; embryology: Jane Austen; laboratory: Sherlock Holmes),
// because a name a reader RECOGNISES as fictional cannot be mistaken for a real
// person's roster, whereas a plausible invented name can — and eventually will be, by
// somebody who happens to share it.
//
// EVERY FIGURE BELOW IS MEASURED, NOT CLAIMED. Each arrangement's comment states what
// `generateRosterV2` actually returned for it, and `RosterView.demo.test.jsx` re-runs
// the engine rather than trusting these numbers, so a fixture that drifts fails a test
// instead of shipping a caption that is no longer true.
//
// ALL FOUR ROUND-TRIP THROUGH THE WIZARD UNCHANGED. Every field used here has a
// control in `RosterDemoWizardTables.jsx`, so the roster a visitor gets after pressing
// a picker button is byte-identical to the one the engine gives this fixture directly.
// That is asserted, not assumed — see `RosterView.demo.test.jsx`. It is also the
// constraint that shaped these fixtures: no `temporal` patterns (no wizard field), no
// window `label`s (no wizard field), no `coLeads` above 1, and no `rules.quotas`
// (the wizard writes `task.quota`).

/** Provenance: written by inference from other teams' patterns. Correct before use. */
export const DEMO_PROVENANCE_INFERRED = 'inferred';
/** Provenance: the SHAPE came from a field interview with that profession. */
export const DEMO_PROVENANCE_INTERVIEWED = 'interviewed';

/**
 * Openly fictional — not a real service, and not inferred from one either.
 *
 * The other two provenance kinds answer "how much should you trust that this
 * matches a real department?". This one answers "you should not: it is a toy, and
 * it exists so a visitor on a phone can press one thing and watch the engine
 * work." Kept distinct rather than folded into `INFERRED`, because inferred means
 * "our best guess at YOUR service, please correct it" and this means no such
 * thing.
 */
export const DEMO_PROVENANCE_FICTIONAL = 'fictional';

/**
 * The respiratory arrangement, by ALIAS. Not a copy: `DEMO_EXAMPLE_DEPARTMENT` is the
 * frozen object every existing test already reads, and two objects that were meant to
 * be equal is how a fixture and its assertions drift apart.
 */
export const DEMO_ARRANGEMENT_RESPIRATORY = DEMO_EXAMPLE_DEPARTMENT;

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
    { name: 'Catherine Morland', fte: 1.0, grade: 'AH10', skills: [], unavailable: [], windows: [{ from: '2026-09-01', to: '2026-12-31', tasks: ['Weekend Laboratory Cover'] }, { tasks: ['Embryo Culture Bench', 'Cryostorage & Witnessing'] }] },
    // TEAM B — weekends January to April 2027.
    { name: 'Emma Woodhouse', fte: 1.0, grade: 'AH15', skills: [], unavailable: [], windows: [{ from: '2027-01-01', to: '2027-04-30', tasks: ['Weekend Laboratory Cover'] }, { tasks: ['Embryo Culture Bench', 'Cryostorage & Witnessing'] }] },
    { name: 'George Knightley', fte: 1.0, grade: 'AH13', skills: [], unavailable: [], windows: [{ from: '2027-01-01', to: '2027-04-30', tasks: ['Weekend Laboratory Cover'] }, { tasks: ['Embryo Culture Bench', 'Cryostorage & Witnessing'] }] },
    { name: 'Marianne Dashwood', fte: 1.0, grade: 'AH9', skills: [], unavailable: [], windows: [{ from: '2027-01-01', to: '2027-04-30', tasks: ['Weekend Laboratory Cover'] }, { tasks: ['Embryo Culture Bench', 'Cryostorage & Witnessing'] }] },
    // TEAM C — weekends May to August 2027.
    { name: 'Anne Elliot', fte: 1.0, grade: 'AH17', skills: [], unavailable: [], windows: [{ from: '2027-05-01', to: '2027-08-31', tasks: ['Weekend Laboratory Cover'] }, { tasks: ['Embryo Culture Bench', 'Cryostorage & Witnessing'] }] },
    { name: 'Frederick Wentworth', fte: 1.0, grade: 'AH14', skills: [], unavailable: [], windows: [{ from: '2027-05-01', to: '2027-08-31', tasks: ['Weekend Laboratory Cover'] }, { tasks: ['Embryo Culture Bench', 'Cryostorage & Witnessing'] }] },
    { name: 'Elinor Dashwood', fte: 1.0, grade: 'AH8', skills: [], unavailable: [], windows: [{ from: '2027-05-01', to: '2027-08-31', tasks: ['Weekend Laboratory Cover'] }, { tasks: ['Embryo Culture Bench', 'Cryostorage & Witnessing'] }] },
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

/**
 * THE PICKER'S LIST, in presentation order — respiratory first because that is the
 * meeting that happens first.
 *
 * One entry per arrangement:
 *
 *   id            stable key for React and for a test to name one arrangement.
 *   name          what the button says.
 *   demonstrates  ONE LINE, and it names the CAPABILITY rather than the fiction:
 *                 somebody choosing between four buttons is choosing between four
 *                 things the tool can do.
 *   provenance    `DEMO_PROVENANCE_INFERRED` or `DEMO_PROVENANCE_INTERVIEWED`. A FIELD
 *                 so the UI cannot render the arrangement without deciding what to say
 *                 about where it came from.
 *   correction    only on an inferred arrangement: the sentence the UI shows, and the
 *                 list of what specifically needs correcting. `null` otherwise, so
 *                 "does this need a health warning" is one truthy check.
 *   config        `rosterEngineV2`'s input contract verbatim — handed straight to the
 *                 wizard's tables, and from there to `generateRosterV2`.
 */
/**
 * THE MARVEL TEAM — the quick demo, and deliberately the smallest thing here.
 *
 * Every other arrangement demonstrates a specific constraint a real profession
 * described: a monthly principal-only clinic, a weekend trio on block rotation, a
 * Saturday floor. This one demonstrates nothing except that the thing runs. It is
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

export const DEMO_ARRANGEMENTS = Object.freeze([
  Object.freeze({
    id: 'marvel',
    name: 'The Marvel Team',
    demonstrates: 'The quickest look: five people, four ordinary duties, nothing gated. Press Draft and a filled calendar appears — start here, then try a real profession below.',
    provenance: DEMO_PROVENANCE_FICTIONAL,
    correction: null,
    config: DEMO_ARRANGEMENT_MARVEL,
  }),
  Object.freeze({
    id: 'respiratory',
    name: 'Respiratory & Rehab',
    demonstrates: 'Duties only certain grades may lead, a skill-gated paediatric CPET, a part-timer, one person on leave — and the one duty it will not pretend to have staffed.',
    provenance: DEMO_PROVENANCE_INFERRED,
    correction: Object.freeze({
      headline: 'Not your service — an example to correct.',
      body: 'Nobody from Respiratory & Rehab has been interviewed yet. This arrangement was inferred from the patterns the other three teams described, so treat every line of it as a question. Please correct it.',
      // Named individually so a correction session has a checklist rather than a
      // feeling. Each of these is an ASSUMPTION this fixture makes.
      items: Object.freeze([
        'the eight duties, their names and which days they run',
        'the weekend cover duty — an assumption, and the only out-of-hours work assumed anywhere here',
        'which duties a junior may lead and which need a senior or principal',
        'the three skills (CPET, REHAB, SLEEP) and who holds them',
        'twelve staff, their grades, the one 0.6 FTE contract and the one day of leave',
      ]),
    }),
    config: DEMO_ARRANGEMENT_RESPIRATORY,
  }),
  Object.freeze({
    id: 'psychology',
    name: 'Psychology',
    demonstrates: 'A clinic on the 3rd Wednesday of every month, principals only, held by the same principal every time — and a 42-hour week.',
    provenance: DEMO_PROVENANCE_INTERVIEWED,
    correction: null,
    config: DEMO_ARRANGEMENT_PSYCHOLOGY,
  }),
  Object.freeze({
    id: 'embryology',
    name: 'Embryology',
    demonstrates: 'A weekend shift needing a principal, a senior and a junior at once, with three teams taking four-month blocks so each appears only in its own.',
    provenance: DEMO_PROVENANCE_INTERVIEWED,
    correction: null,
    config: DEMO_ARRANGEMENT_EMBRYOLOGY,
  }),
  Object.freeze({
    id: 'labs',
    name: 'Medical Laboratory',
    demonstrates: 'At least two Saturdays per person per calendar month — a floor rather than a limit, measured and reported wherever it is not met.',
    provenance: DEMO_PROVENANCE_INTERVIEWED,
    correction: null,
    config: DEMO_ARRANGEMENT_LABS,
  }),
]);
