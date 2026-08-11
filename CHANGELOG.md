# Changelog

All notable changes to **NEXUS** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Single source of truth for the app version is `package.json` `version`.** The
`README.md` title line, the shields.io badges and the *Supported Versions* table are
downstream of it and must be kept aligned.

The **AURA engine version** (currently `v2.3`) is a *separate* internal version
tracking the agent's capability tier. It moves independently of the app version and is
not changed by this release.

> ### How to read this file
>
> This changelog was created at **v1.6.0**; the repository had none before. Two things
> follow from that, and both are stated explicitly rather than papered over:
>
> 1. Everything under **[1.6.0]** was classified by reading commit **diffs**, because
>    this repository's commit subjects (`Update RosterView.jsx`, `Update index.js`, …)
>    carry no intent. The classification covers the **last ~30 commits** — the
>    roster-relevant recent history — not all 616 commits in the repository. It is
>    therefore accurate for the recent window and **incomplete before it**.
> 2. Everything under **[Reconstructed history]** was transcribed from the existing
>    *Release History* section of `README.md`. It was **not** derived from git history
>    and has **not** been verified against the code. Treat it as the historical record
>    the README asserts, not as an audited one.
>
> No git tag existed for any version at the time of writing (616 commits, 0 tags), so
> no entry below is anchored to a tag. `git checkout vX.Y.Z` does not work for the
> reconstructed versions and never will.

---

## [Unreleased]

Nothing is scheduled here yet. The section below is deliberately **not** a list of
completed work.

### Known issues — documented, NOT fixed

These defects are diagnosed in writing and are **still present in the shipped code**.
They are listed here so that the existence of `ROSTER_POSTMORTEM.md` and
`ROSTER_QC_AUDIT.md` cannot be mistaken for the defects having been repaired. Ids are
traceable to those documents.

| Id | Severity | Defect |
|---|---|---|
| **P0.7** | Medium | **`npm run lint` has never worked.** No ESLint configuration file exists anywhere in the repository (`git ls-files \| grep -i eslint` returns nothing), so the `lint` script exits `2` on any invocation — "ESLint couldn't find a configuration file". Pre-existing; the deploy workflow never called it, so this was never surfaced by CI. Plan P0.7 in `ROSTER_TODO.md`. |

Additional lower-severity findings (C1/C3/C4 persistence and configuration drift,
D-series verification gaps, E1/E4 documentation overstatement, the swap modal's
unlabelled `<select>`s — an accessibility gap noted during P8.3) are recorded in
`ROSTER_QC_AUDIT.md`, `ROSTER_POSTMORTEM.md` and `ROSTER_TODO.md` and are likewise
**not** fixed. M12's session-level guard is client-side only; the durable guard is a
Firestore rule, blocked on decision D6.

---

## [1.11.0] - 2026-08-12

The engine stops being a museum of special cases. Six professions in, each new team was
costing a new flag; this release refactors those flags into **orthogonal primitives** they
are all instances of, adds the two that were genuinely missing, and gives every one of them
a surface. Four real department arrangements ship with it, and `npm run lint` runs for the
first time in this repository's history.

### Added

- **A primitive constraint layer.** `days`, `recurrence`, `continuity`, `leadBands`,
  `requiresSkill`, `slots`, `hours`, `forbidPairs` and the caps are now **sugar** compiled
  down to six orthogonal primitives — **temporal, eligibility, capacity, affinity,
  structure, quota** — and nothing past the compiler reads a feature name. Combinations no
  sugar exposes yet (1st *and* 3rd Wednesday, alternate weeks, explicit date lists) already
  work through the general path. **Faithfulness is the whole claim, and it was verified
  adversarially:** an independent audit built its own harness and compared **22,000
  generated configs** against the previous engine — 0 substantive divergences, with 233
  distinct `unfilled` reason templates and 22 validation-refusal templates reproduced
  character for character, in two timezones.
- **A profession-agnostic scale.** AH7–AH17 with three fixed bands was KKH allied health.
  A scale is now an ordered list of ranks plus any number of named regions, so nursing
  bands, MO/Registrar/Consultant, or a two-tier team all work. The AH/three-band exports
  are retained as one instance of the general thing.
- **Quotas — the first *floor* in an engine that had only ever had ceilings.** The medical
  lab scientists' "at least 2 Saturdays a month" is now expressible. Floors invert the
  logic: a cap is checked when filling a slot, but a floor can only be judged once a period
  is filled, so a `min` is **preferred during selection, then warned about** — never hard,
  because capacity cannot be invented. A `max` is hard. An arithmetically impossible floor
  is refused at configure time **with the arithmetic shown** ("4 × 3 = 12 duties — but only
  8 exist there").
- **Cohort windows.** A person can be eligible only within date ranges, optionally only for
  named tasks — the embryologists' A/B/C four-month block rotation, and equally rotations,
  secondments, placements and locums.
- **Every stranded capability now has a UI.** `continuity`, monthly recurrence,
  `forbidPairs`, the daily/consecutive caps, `maxPerDay`, `category`, quotas and windows
  were all engine-only. Reachability was proven the way the previous audit demanded — by
  feeding **mapper-built** configs to the engine and observing the roster change, not by
  asserting a field is emitted.
- **Four department arrangements**, selectable from a picker, each demonstrating what that
  team cares about and each verified by running the engine: **Respiratory & Rehab**,
  **Psychology** (3rd-Wednesday principal-only clinic with continuity), **Embryology**
  (weekend principal+senior+junior trios on four-month blocks), **Medical Laboratory**
  (42-hour weeks with a 2-Saturdays-a-month floor). The respiratory one is **labelled in
  the UI as inferred, not interviewed** — that team has not been consulted, and an example
  offered for correction is worth more than a mock-up presented as their service.
- **`npm run lint` works, for the first time ever.** No ESLint config had existed, so the
  `--max-warnings 0` gate had never run. Now 76 files, 0 messages, wired into CI after the
  test step. Genuine findings were fixed in source, including two dead declarations in
  `functions/index.js` and the service worker — both verified unused at `HEAD` and
  re-parsed, since neither file has any test coverage.

### Fixed

- **A raw NUL byte made `rosterWizard.js` invisible to `grep`.** Introduced by this batch
  and caught by audit. `file` reported "data", and `grep -c export` printed *nothing* while
  exiting 0 — so `grep -rln "forbidPairs" src/` omitted the very module that parses and
  validates it. That is the exact mechanism of this project's founding defect, re-armed.
  **The obvious fix was wrong and is worth recording:** deleting the byte turned
  `join('\u0000')` into `join('')`, so `['An','nBob']` and `['Ann','Bob']` would collide
  into one key — and all 1522 tests still passed, because nothing exercised it. The NUL is
  deliberate; only the *literal byte* was the bug. It is now written as an escape, and a
  mutation-checked collision test guards the separator.

### Notes — known issues from the audit, listed rather than implied fixed

`ROSTER_QC_AUDIT_PRIMITIVES.md` records nine defects. D1 is fixed above; the rest are open:

- **D2/D3 — a mistyped availability window silently deletes a person from the roster.** A
  window whose dates fall outside the run makes that person eligible on zero dates, with no
  error, no warning and no unfilled slot, because colleagues absorb the work. The engine
  *already computes* `neverRostered` and throws it away — **D9**: `measureRosterLoad` has no
  UI caller at all. One warning closes all three; it is the next fix.
- **D4** — "all stranded capability closed" is not quite true; the wizard file itself lists
  the remainder. **D5** — the slot "needs skill" input is unusable for a typed-in team.
  **D6** — the ESLint config disables `no-unused-vars` for the whole engine, which is the
  "passes by disabling things" failure. **D7** — a comment contradicts the validator on
  `max: 0`. **D8** — the impossible-floor refusal ignores the hours model.

1524 tests (was 1213), green under both timezones, lint exit 0. Live-mode generation is
still the original V1 engine, byte-identical.

## [1.10.0] - 2026-08-12

The engine capability from v1.9.0 becomes reachable, the roster starts telling the truth
in the calendar rather than in a list underneath it, and coverage requests move out of the
AI chat panel into the roster itself.

### Added

- **Hours and multi-slot shifts are now reachable.** v1.9.0 shipped 1,722 engine lines and
  178 tests that no user could invoke — the audit caught it and the changelog said so. The
  sandbox wizard now has an **Hours** column per task, a **department working week**
  control, and a **slot editor** for tasks that need several people together (the
  embryologists' principal+senior+junior weekend trios), all behind a per-row expander so
  the common case stays legible. Verified by feeding mapper-built configs — not
  hand-written ones — straight into the engine and observing the roster change.
- **Unfilled slots render inside the day cell.** The engine's honesty used to live in a
  list below the grid. A day where *every* slot failed produces no roster key at all, so
  it was indistinguishable from a day with nothing scheduled; those cells are now drawn
  from `unfilled`, with the reason reachable as text and as an accessible attribute.
- **"My week" — a person view.** A toggle between the department grid and one person's
  duties: date, task, their role, hours. Read-only rendering of the same data; the grid
  stays the default.
- **Language pass.** "Draft roster" rather than "Generate Sandbox Roster"; an FTE of 0.6
  reads as the days it means; "not staffed" rather than "unfilled". Internal vocabulary
  no longer reaches the screen.
- **One-tap cover.** Coverage requests are answered on the shift itself, in the roster,
  with the badge and the request card where the week is visible. `AuraPulseBot` no longer
  reads `shift_swaps` at all — the chat detour is gone. Every guarantee from v1.6.1 is
  preserved and independently re-verified: read-back before `APPROVED`, mechanical
  substitution, `swapRole` recorded at request time, legacy shift shapes tolerated, admin
  on-behalf requests, and the duplicate-request guard.
- **`CoverageWatcher` — an always-mounted notifier.** See the fix below; this is the
  component that keeps the one-tap move from costing the notification.

### Fixed

- **A coverage request could reach nobody.** Moving the listener into `RosterView` was
  right for *answering* but wrong for *noticing*: `RosterView` is mounted only when the
  Roster tab is open (`App.jsx`), whereas the chat panel it replaced was mounted always
  and force-opened itself. A colleague on Dashboard, Pulse or Feeds would never learn a
  request existed — ROSTER_QC_AUDIT.md **M5 returning by a different route**, found by
  audit and not by the change that caused it. There is now exactly one surface that
  **notices** (`CoverageWatcher`, always mounted, live mode only, no mutation logic, and
  silent while the roster is on screen so there is never a second banner over the real
  thing) and exactly one that **answers** (the roster, which owns the verified sequence).
  Nine regression tests, including that a listener error still surfaces when the roster
  is visible — because a broken listener means the roster is showing nothing either.
- **The wizard printed a false claim about the feature it configures.** With the hours
  boxes blank it read *"Hours are not being counted … AURA will not apply the 42h week
  unless you type it."* That is false: the engine applies its defaults regardless.
  Measured — one person, ten 8h tasks in a day, no rules at all: nine unfilled slots
  reasoning *"over their 8.4h daily limit"*. Both branches now say hours **are** counted
  and differ only in whose limits apply. There is no way to switch hours off, and the
  screen that configures them no longer implies there is.

### Notes

- **Additivity re-checked directly**, because the hours defaults raised a fair doubt: a
  config naming no hours at all produces byte-identical output against the v1.8.1 engine.
  The reason is worth recording — the pre-existing **duty** cap (2/day) binds before the
  hours cap, since two default 4h sessions is 8h against an 8.4h ceiling. Hours become
  the binding constraint only if a task is longer than ~4.2h or the duty cap is raised.
- **Still unreachable from any surface** (audit-enumerated, honestly listed rather than
  implied fixed): `continuity`, `recurrence`, `forbidPairs`, `maxConsecutiveDays`,
  `maxConcurrentPerDay`, `staff.maxPerDay`, `task.category`. Cohort windows and quotas do
  not exist in the engine yet — they are the two genuinely missing primitives.
- **`npm run lint` still exits 2.** No ESLint config has ever existed in this repo, so the
  `--max-warnings 0` gate has never run. A trial run reports 362 problems, almost all
  `process is not defined` in test files (an environment misconfiguration, not defects).
  Open as P0.7.
- Live-mode generation remains the original V1 engine, byte-identical.

1213 tests (was 1053). Independent audits: `ROSTER_QC_AUDIT_FOUNDATIONS.md`,
`ROSTER_QC_AUDIT_SURFACES.md`.

## [1.9.0] - 2026-08-09

Engine capability for the remaining two interviewed teams, plus the band ruler. **Read
the reachability note below before assuming any of this is usable from the app yet.**

### Added

- **Hours model.** Per-task `hours` (default **4** — the teams' duties are sessions, not
  days), per-staff/rules `weeklyHours` (default 42) and `maxHoursPerDay` (default 8.4).
  Same-day durations **sum** against a per-person daily cap scaled by FTE, and a weekly
  cap per ISO week — both **hard**, so a breach is an `unfilled` slot naming the hours,
  never a quiet overload. A rolling four-week total is reported and warned on (the
  Singapore Medical Council 320h pattern from the field research; enforcing the rolling
  window is deferred). `load` gains `hours`, `hoursPerWeek`, `weeklyCap`;
  `auditHardConstraints` catches an hours breach on read-back. 89 tests.
- **Multi-slot shifts.** A task can declare `slots: [{ band, requiresSkill, role }, …]` —
  one entry per person, each with its own gate — which is how the embryologists actually
  staff weekend service (principal + senior + junior *together*). The **highest-graded
  assignee becomes the accountable `lead`**, `coLead` is the second, and `assignees`
  carries everybody lead-first, so the calendar, the swap flow and the exports keep
  working unchanged. 89 tests.
- **Multi-assignee exports.** CSV gains a seventh `Assignees` column (the first six are
  byte-identical to before); ICS `SUMMARY` keeps its exact one- and two-person form and
  gains `Lead: A, Co: B, Also: C` at three or more. Closes the documented limit that a
  third assignee vanished silently from both files.
- **The band boundary editor is now a ruler.** Two draggable dividers over AH7–AH17,
  fully keyboard-operable (`role="slider"`, arrows, Home/End) with the numeric ranges
  rendered as text alongside. A gap, an overlap, an inverted band and an empty box are no
  longer *expressible* — the dividers constrain each other — so the class of error the old
  six number boxes validated after the fact cannot occur. The validation call is kept as a
  backstop.
- **`firestore.rules` — a complete proposal, deliberately INERT.** The repo has never had
  a rules file. This one is derived from an actual sweep of every Firestore path the code
  touches, with a runbook (`firestore.rules.README.md`) covering Rules Playground cases,
  deploy, and immediate rollback. It is **not** referenced from `firebase.json` and the
  deploy workflow is untouched, so nothing changes until a human wires it up. It also
  documents which current behaviours it would break — chiefly that any of the ten
  directory members can rewrite the master roster today (`RosterView.jsx:813`), which the
  proposal restricts to admins.

### Notes — reachability, stated plainly

**The hours model and multi-slot shifts are not reachable from any surface of the app.**
`generateRosterV2` has one non-test caller — the *sandbox* branch — and the sandbox mapper
emits no `hours`, `weeklyHours`, `maxHoursPerDay` or `slots` field. That is 1,722 engine
lines and 178 tests of capability that no user can currently invoke. It was found by an
independent audit, not by the agents that built it, and the wiring is the next task.
Logged here rather than quietly deferred, because a changelog that implies otherwise is
the failure mode this project keeps a post-mortem about.

Live-mode generation is still the original V1 engine, whose output remains byte-identical
(verified 36/36 comparisons by the auditor, independently of the build agents' claims).

1053 tests (was 835). Independent audit: `ROSTER_QC_AUDIT_FOUNDATIONS.md`.

## [1.8.1] - 2026-08-08

### Fixed

- **The app header rendered on top of the open Configuration Wizard** (user
  screenshot). Mechanism, not symptom: `RosterView`'s root carries `relative z-10`,
  which caps every descendant — so the wizard's `z-[100]`, the swap modal's
  `z-[120]` and the confirmation dialog could never out-stack the header's sibling
  `z-50` context, no matter the number. Latent since the modals were written; it
  became visible only when the v1.8.0 wizard grew tall enough to extend under the
  header. All three overlays now render through a **React portal** to
  `document.body`, escaping the trapped stacking context. Three structural
  regression tests pin the portal (direct child of `body`, absent from the card's
  own tree, no orphans on unmount) — jsdom cannot see painting, so the structure is
  what gets tested.

835 tests.

## [1.8.0] - 2026-08-08

The roster master release: job grades, band-gated tasks, monthly clinics and
continuity of care — built from field interviews with four allied-health teams
(medical lab scientists, embryologists, psychologists, physiotherapists). All of it
is Sandbox-first; the live-mode wizard is untouched.

### Added

- **Job-grade bands in the engine (AH7–AH17).** Per-staff `grade`, per-task
  `leadBands` (junior / senior / principal), and editable band boundaries defaulting
  to Junior AH7–12 / Senior AH13–14 / Principal AH15–17. Decided semantics: bands are
  **eligibility, not exclusion-with-fallback** (a juniors-only task reports an
  unfilled slot rather than drafting a senior); the gate applies to the **lead only**,
  so senior-leads/junior-shadows is expressible; a person with no recorded grade
  fails every band gate and is named in a warning — the engine does not invent data.
  Slot scarcity ordering counts the band gate, and a new hard-audit rule catches an
  out-of-band lead on read-back. 149 tests, mutation-checked.
- **Monthly recurrence.** A task can run on the nth (or last) named weekday of each
  month — `recurrence: { ordinal: 3, weekday: 3 }` is the psychologists' 3rd-Wednesday
  specialised clinic. `'last'` and `4` differ exactly in five-week months, and that
  difference is pinned by test.
- **Continuity of care.** `continuity: true` prefers the incumbent lead across a
  task's occurrences — ahead of fairness, never ahead of a hard constraint. Every
  break is counted (`score.breakdown.continuityBreaks`) and **named in a warning**
  with the dates and, where knowable, why the incumbent was unavailable — because
  knowing continuity broke is the clinical point of the rule. Continuity tasks are
  exempt from the task-repetition penalty, which otherwise charges the roster for
  doing as it was told. 133 tests, mutation-checked (16 mutations; one survivor
  proven equivalent, one exposed and fixed a duplicate definition of "did continuity
  hold").
- **The grade-aware sandbox wizard.** The demo Configure dialog's two free-text boxes
  are now structured tables: staff (Name / Grade / FTE / Away, five rows default,
  add/remove) and tasks (name, who-may-lead band chips with the **implied grade range
  rendered live**, a 7-day strip, co-lead toggle), plus a band-boundary editor that
  revalidates on every change. Generate is disabled with the engine's verbatim reason
  while the configuration is invalid — the engine's own validation runs *before* the
  click. The example department is regraded across all three bands and band-gates two
  tasks, still yielding exactly one deliberately unstaffable slot. One line of copy
  carries the top surprise from the limits ledger: *"Ticking two bands makes both
  equally eligible — it is not a preference order."*
- **A composed validation refusal.** A task whose `requiresSkill` and `leadBands`
  pools do not intersect (enough principals, enough skill-holders, nobody who is
  both) is now refused at configure time with both constraints named — previously it
  generated an all-unfilled roster with only a warning.

### Changed

- `SOFT_PENALTY_WEIGHTS` gains `continuityBreaks: 2` (uncalibrated, like the other
  four — the number to read is the plain count in `score.breakdown`). A transitional
  `ALL_SOFT_PENALTY_WEIGHTS` overlay existed for one commit and is gone.
- `softPenalty` is now additionally **not comparable across the `continuity` flag**
  on otherwise-identical configs (the exemption changes what is counted). It was
  already documented as non-comparable across differently-shaped teams.

### Notes — the honest limits that matter most

- **Continuity cannot see across generation runs.** A department generating
  month-by-month can get a different incumbent most months, with zero warnings —
  measured, not guessed. Border data between runs is the standing deferred item.
- **`continuity: true` on a weekly task means one person, every day, all year** —
  measured: 260 of 260 duties to one name, reported as flawless. Use it for monthly
  clinics, not daily duties, until a ceiling exists.
- A part-timer can become the permanent incumbent (first occurrence goes by
  FTE-weighted fairness, which favours low-FTE staff early).
- The wizard's tables scroll horizontally on narrow screens and **nobody has seen
  them rendered** — layout verification needs a human with a browser.
- Engine capabilities still pending from the field interviews, in the user's chosen
  order: true per-task hour durations (42-hour weeks), multi-slot shifts
  (embryology's principal+senior+junior trios), pinned self-scheduling, minimum
  Saturday floors (lab scientists).

832 tests (was 499 at v1.7.1). Live mode still writes with the original engine,
whose output is unchanged — verified byte-identical across 77 comparisons.

## [1.7.1] - 2026-08-06

Every item is a fix. Live-mode generation now lands on the weekdays it claims, the
exports are standards-compliant, and no native browser dialog remains in the roster view.

### Fixed

- **B1 (High) — Sunday-start weekday misalignment.** `generateRoster` commented its core
  loop "Mon–Fri" but filled whatever five days followed the start date; the shipped
  default `2026-02-01` is a Sunday, so every default generation produced Sun–Thu with the
  "Tuesday" VC on Monday and the "Saturday" VC on Friday. The engine now **snaps the start
  date to the Monday of its week** (matching `rosterEngineV2`) and parses/derives all dates
  **locally**, which also fixes audit **M2**: the old UTC-parse/local-arithmetic mix slid
  every key one day early across a DST spring-forward (measured, `TZ=America/New_York`,
  start `2026-03-02`). Verified identical output across six timezones, and **byte-identical
  output for a Monday start** against the pre-change engine — nothing stored in
  `system_data/roster_2026` goes stale. The two `CURRENT BUG:` characterization tests
  planted in v1.6.0 were inverted, exactly as their comments instructed.
- **B3/B4 — the calendar opened on a hardcoded February 2026** and month navigation
  mutated state in place. It now opens on the current month, with non-mutating navigation.
- **M6 (High) — the ICS export was malformed.** `SUMMARY` contained an unescaped comma
  (RFC 5545 reads that as a multi-valued property — the likely cause if Outlook truncated
  titles at "Lead: X"), and events carried no `UID` or `DTSTAMP` (both required; without
  `UID` every re-import duplicates all events). Now: full TEXT escaping, deterministic
  content-derived `UID`s (a re-export of the same roster updates rather than duplicates),
  `DTSTAMP`, and 75-octet line folding.
- **M10 — CSV injection and quoting.** Fields containing commas, quotes or newlines are
  quoted per RFC 4180; fields starting with `=`, `+`, `-` or `@` are neutralised (the file
  is explicitly designed to be opened in Excel); rows are CRLF-joined and the file opens
  with a UTF-8 BOM so Excel on Windows decodes non-ASCII staff names.
- **M7 (residue) — no more `undefined` in exports.** A shift lacking `coLead` or `week`
  (legacy shapes, the deliberately-unstaffed demo slot) renders as empty in both formats.
- **E2 — all 8 native `alert()` dialogs in the roster view replaced** with branded,
  dismissible status banners that mount inside whichever modal is open (an error raised in
  the swap modal appears in the swap modal, not hidden behind it). Three messages were also
  corrected, not just restyled: the success message no longer claims "conflict-free" (the
  generator cannot know that — post-mortem E1), and the sandbox no longer claims AURA
  "notified" a colleague when nothing was sent. The v1.5 release note's claim is now true
  for the roster view; `window.confirm` remains in AuraPulseBot and AdminPanel.
- **M12 (partial) — duplicate swap requests.** Submitting the same request twice
  (same shift, same task, same target) is now blocked for the session, so a double-click no
  longer creates two independently-acceptable PENDING documents. Client-side only — it does
  not survive a reload or a second device; the real guard is a Firestore rule, blocked on
  decision D6.

### Notes

- 499 tests, up from 434. The exporters were refactored into pure `buildICS`/`buildCSV`
  (new exports) with the download wrappers unchanged.
- **UID caveat:** UIDs are content-derived (date + task). Renaming a task changes its UID,
  so a re-import after a rename leaves an orphan of the old event. A stable per-shift id
  would need to be persisted at generation time — future work.

## [1.7.0] - 2026-08-06

A constraint-aware rostering engine, available in Sandbox mode. **Live mode is unchanged** and
still uses the original `generateRoster`, whose output was verified byte-identical across 720
configurations — no existing roster can be affected by this release.

### Added

- **`src/utils/rosterEngineV2.js` — a constraint-aware roster engine.** The original engine is a
  cyclic rotation for a team where staff count happens to equal task count. Measured at other
  sizes it fails two ways, and both are now fixed:

  | staff / tasks | Old: max duties one person holds in a day | Old: never rostered | New: max/day | New: never rostered | New: unfilled, each with a reason |
  |---|---|---|---|---|---|
  | 4 / 4 | 3 | 0 of 4 | 2 | 0 of 4 | 0 |
  | 12 / 8 | 3 | 0 of 12 | 2 | 0 of 12 | 0 |
  | 6 / 10 | **5** | 0 of 6 | **2** | 0 of 6 | **160** |
  | 20 / 4 | 3 | **12 of 20** | 1 | **0 of 20** | 0 |

  Reproduce with `node scripts/roster-scaling.mjs`. The old engine reached five concurrent duties
  by wrapping the task index back around the staff list, and said nothing; and left 12 of 20
  people entirely unrostered because the rotation never passed the end of the task list.

  Inputs it accepts — per staff member: `fte`, `skills`, `unavailable` dates, `maxPerDay`. Per
  task: `requiresSkill`, `days` of the week, `leads`, `coLeads`, `category`. Plus rules:
  `maxConcurrentPerDay`, `maxConsecutiveDays`, `forbidPairs`.

  Design properties: hard constraints are **never** violated — an unstaffable slot is reported in
  `unfilled` with the binding constraint named, never filled by an unqualified or over-committed
  person. Slots are filled most-constrained-first (minimum-remaining-values) so a scarce
  qualification is not spent on a slot anyone could have covered. Fairness is FTE-weighted, so a
  0.6 FTE colleague receives roughly 60% of a full-timer's load. Output is deterministic — no
  `Math.random`, no `Date.now` — so the same inputs always give the same roster. `hardViolations`
  is **measured** by re-auditing the finished roster, not asserted.
- **Sandbox mode now really generates a roster.** Previously, clicking Generate in Sandbox showed
  two `alert()` boxes on a timer — *"AURA is simulating roster conflict resolution…"* then
  *"Zero conflicts found in multiverse timeline"* — and computed nothing; the calendar kept showing
  13 hardcoded events from February 2026. It now runs the real engine, in component state only,
  and renders the result.
- **The Sandbox staff field is editable.** It was `readOnly` with a "Simulation Locked" caption, so
  a visitor could not enter their own team. Names and task names alone now produce a working
  roster; skills, FTE and leave are optional extras.
- **Sandbox result panel** showing the effective start date, per-person load with a `duties ÷ FTE`
  column, any warnings, and the `unfilled` list with each slot's reason.
- **`DEMO_EXAMPLE_DEPARTMENT`** in `src/data/mockData.js` — a 12-person, 8-task fictional
  department with three skills, one 0.6 FTE colleague and one person on leave, loadable from the
  wizard. It generates 40 shifts over 12 days with zero hard violations and **exactly one
  deliberately unstaffable slot**, so the honest-reporting behaviour is visible rather than
  described. Appended only; `MOCK_STAFF`, `MOCK_STAFF_NAMES`, `MOCK_ROSTER`, `MOCK_PULSE_TRENDS`
  and `MOCK_TEAM_DATA` are untouched.

### Fixed

- **Sandbox CSV and ICS exports were incomplete.** The demo data set only four fields, so `Week`
  and `Co-Lead` came out as `undefined` on every row. A generated Sandbox roster now exports
  complete data (partial fix for audit **M7**; the demo path is fixed, the `MOCK_ROSTER` fallback
  path is not).

### Notes

- **Demo mode still writes nothing to Firestore, and this is now enforced three ways** — the early
  return in `handleGenerateClick`, a guard at the top of `executeRosterGeneration` (a no-op in live
  mode), and a component test asserting `setDoc`, `addDoc`, `onSnapshot`, `doc` and `collection`
  are never called on the demo path.
- 434 tests, up from 254. Includes `RosterView.demo.test.jsx`, the project's first component test.
- **`softPenalty` is deliberately not displayed.** It is unnormalised and not comparable between
  differently-shaped configurations, so showing it would mislead.
- **Known rough edge:** one CSV cell reads `undefined` for the deliberately unstaffed co-lead in
  the example department, because the shift genuinely has no `coLead` key and the exporter
  interpolates it directly. Cosmetic, and confined to that one unstaffable slot.
- The engine's 15 documented limits are in its file header. The ones that matter most: it is greedy
  rather than optimal and has no repair pass; `maxConsecutiveDays` cannot see across separate
  generation runs; a skill requirement gates the co-lead too, so "senior supervising a trainee" is
  not expressible; `forbidPairs` is same-task-only; and FTE sets relative share, not an absolute cap.
- Not wired into **live** mode. The Configure wizard has no fields for skills, FTE or leave in live
  mode yet, and multi-team support (per-team documents, a per-team login list) does not exist.

## [1.6.1] - 2026-08-06

The shift-swap flow — the "Auto-Healer" — now actually works. Every item here is a fix to
behaviour that already shipped, hence a patch rather than a feature release.

### Fixed

- **A1 (Critical) — accepting a shift swap did not change the roster.** The mutator compared
  `shift.staff` against `swapData.requestedBy`. Since the 6 May 2026 lead/co-lead refactor
  `staff` holds a *display string* (`"Lead: Brandon, Co: Ying Xian"`) while `requestedBy` is a
  bare name, so `.map()` matched nothing, `updateDoc` wrote byte-identical data, nothing threw,
  and AURA still reported *"I have updated the master roster."* The swap flow now:
  - records `swapRole` (`'lead' | 'coLead'`) at request time — the missing field that made the
    mutation impossible even in principle;
  - applies **mechanical substitution**: the covering colleague takes exactly the role the
    requester held. No promotion, and no third person's duty changes;
  - tolerates **both** shift shapes — modern (`lead`/`coLead`) and pre-refactor (`staff` as a
    bare identity), upgrading legacy shifts to the modern shape on write — so it is correct
    regardless of when the live document was last generated;
  - refuses rather than guesses when the requester no longer holds the recorded role.
- **A-RC4 (Critical) — success was printed, never observed.** The confirmation was a hardcoded
  literal emitted down every path, including silent no-ops. AURA now writes, **reads the
  document back, locates the substitution in it**, and only then reports — quoting the shift as
  it actually reads. A no-match is a visible failure that leaves the request `PENDING`.
- **M9 (High) — the ledger recorded approvals that never happened.** `status: 'APPROVED'` was
  written *before* the roster was even read, with no rollback. It is now written only after a
  verified roster write.
- **M5 (High) — the coverage alert never surfaced.** `App.jsx` never passed `onOpen`, so the
  force-open was a no-op; and `startSession`/`handleClearChat` discarded queued alerts by
  resetting `messages`. `onOpen` is now passed, pending alerts survive session resets, and they
  are de-duplicated by document id so a re-subscribe cannot stack duplicate Accept buttons.
- **M11 — admin-initiated swaps were structurally guaranteed to fail.** An admin who is not on
  the roster resolved to `swapRole: null`, so the request could never be applied. An admin
  acting on a shift they do not hold now arranges cover **on behalf of** the clinician who does:
  `requestedBy` is that clinician, `swapRole` their duty, and `initiatedBy` records who arranged
  it. The modal states plainly whose shift is being reassigned.
- **M8 (Medium) — Firestore listener failures were silent.** Both `onSnapshot` calls now have
  error callbacks; a `permission-denied` surfaces a readable message instead of the feature
  quietly ceasing to exist.
- **A4 — the swap-candidate filter used a substring test** (`staff.includes(name)`), which would
  silently drop any colleague whose name is a substring of another's. Now an identity comparison.
- **M4 (partial)** — removed the false claim that a declining colleague's requester "will be
  notified". No such mechanism exists; the copy now says to tell them directly.

### Notes

- `generateRoster` is untouched: verified byte-identical output against the previous release
  across three configurations, including a year-boundary run.
- Requester and roster-owner notification remain unbuilt (see Known issues).
- 254 tests (was 163). The 23 `generateRoster` characterization tests are unmodified.

## [1.6.0] - 2026-08-05

This release does two things: it establishes verification and version infrastructure
that did not previously exist, and it reconciles the app version with reality.
`package.json` had read `1.0.0` since the beginning while the README documented v1.5 as
the current beta; feature work through v1.5 plus the un-released work catalogued below
is now accounted for at `1.6.0`.

### Added

- **Test harness — the project's first working one.** `vitest` (`^2.1.9`) with
  `@testing-library/react` (`^16.3.2`), `@testing-library/jest-dom` (`^7.0.0`) and
  `jsdom` (`^29.1.1`); `vitest.config.js` configured to mirror the app's build pipeline
  (same `@vitejs/plugin-react`, `environment: 'jsdom'`, `globals: false` on purpose so
  new tests cannot silently depend on implicit globals); `npm test` → `vitest run` and
  `npm run test:watch` → `vitest`.
- **23 characterization tests for `generateRoster`** (`src/utils/auraEngine.test.js`).
  These pin down what the roster generator *currently does*, including the known-wrong
  behaviour, so that the Block A/B repairs can be made without silent regressions. They
  are a baseline, not a correctness proof.
- **`npm test` wired into CI.** `.github/workflows/deploy.yml` now runs the suite
  between dependency install and build, so a red suite blocks the Firebase Hosting
  deploy. Previously nothing verified a deploy.
- **Remediation documentation set:**
  - `ROSTER_POSTMORTEM.md` — the roster subsystem post-mortem, Blocks A–E, revision 2
    after independent audit.
  - `ROSTER_QC_AUDIT.md` — independent audit of that post-mortem; corrected one
    overstated and four wrong claims, and raised new critical findings (M1, M3) that
    the post-mortem had missed.
  - `ROSTER_TODO.md` — the sequenced remediation plan (P0–P8) with an evidence ledger.
  - `ROSTER_HANDOFF.md` — handoff state.
- **Two agent role definitions** under `.claude/agents/`: `version-steward.md` (release
  versioning, this file's owner) and `qc-steward.md` (independent verification of
  claims made in remediation documents).
- **`CHANGELOG.md`** — this file. The repository has never had one; Block E, root cause
  E-RC2, identified the absence of any release ritual as the reason version drift went
  unnoticed.
- **Roster lead/co-lead pairing.** `generateRoster` now emits one unified shift object
  per task carrying explicit `lead` and `coLead` fields, replacing the previous
  one-object-per-person model. VC (PM)/VC (AM) shifts are likewise a single paired
  object instead of two separate "VC Lead"/"VC Co-Lead" entries.
- **Custom generate-confirmation modal in the roster view.** The destructive
  4-week-roster generation now routes through the existing `ConfirmationModal`
  component instead of `window.confirm`, and the generation call is wrapped in
  `try/catch`. *(Note: this replaced the `window.confirm` only. Seven `alert()` calls
  remain in `RosterView.jsx` — see E2 in the post-mortem and plan P8.3.)*
- **National resource registry seed** — `scripts/firestore_seed.cjs`, 22 resources
  across 5 regions.
- **New AURA care-tier CTA `senior_isolated`** — routes 60+ users with a social-SDOH
  flag to tele-befriending and Active Ageing Centre resources ahead of the
  chronic-metabolic tier.
- **Dedicated Lead / Co-Lead columns in the CSV export**, replacing the single `Staff`
  column, for cleaner spreadsheet filtering.

### Changed

- **`@google/generative-ai` is now pinned** to `^0.24.1` (the version actually
  installed) instead of `"latest"`. An unpinned dependency lets a deploy change
  behaviour with no commit to attribute it to — flagged in Block E and now closed
  (plan P8.1). This pin is deliberately the installed version, so it changes no
  behaviour.
- **`package.json` `version`: `1.0.0` → `1.6.0`** (see *Notes on this bump* below).
- **README version metadata realigned** to `v1.6`: title line, *Supported Versions*
  table, and a Release History heading for this version. The AURA badge stays at
  **v2.3** — the engine tier did not move.
- Roster shift-ownership checks now recognise `lead`, `coLead` *and* the legacy `staff`
  field, so the new client can still read roster documents written by the old one.
- Swap-target dropdown now excludes everyone currently on the selected shift rather
  than only the single previous `staff` value.
- Export filenames changed to `AURA_Roster_Merged.ics` / `AURA_Roster_Merged.csv`.
- Substantial rewrites of `functions/index.js` and `src/components/ResultPage.jsx`
  during this window. **Not confidently classified** — the diffs are large, mixed
  feature/refactor changes with no commit-message intent, and they were outside the
  roster scope of this review. Assume nothing about them from this entry.

### Fixed

- **M1 (Critical) — demo configuration leaked into live mode and one click could replace
  the real duty roster with demo data.** The `RosterView` effect overwrote
  `config.staff`/`config.tasks` with the Marvel demo dataset in its `isDemo` branch, while
  its `else` branch restored only `rosterData`. Leaving demo mode with the component still
  mounted therefore kept the demo staff pool, and a single **Generate Roster** click
  replaced four clinicians' real duty roster with demo names — reporting *"AURA has
  generated a conflict-free roster."* `LIVE_ROSTER_DEFAULTS` / `restoreLiveRosterConfig`
  now restore the live pool on leaving demo mode, and seed the initial state from the same
  constant so the two cannot drift.
- **M3 (Critical) — clearing the "Weeks" field wiped the entire roster and reported
  success.** `parseInt("")` is `NaN`, so the generation loop never ran, `generateRoster`
  returned `{}`, and `setDoc` **without merge** committed that empty object over the whole
  document. Now guarded three ways: `validateRosterConfig` rejects the value and disables
  the button with a visible reason, `handleGenerateClick` refuses to open the confirmation
  as a second latch, and `prepareRosterWrite` refuses to write an empty roster from *any*
  cause.
- **Destructive whole-document write.** `setDoc` now passes `{ merge: true }`, so
  generating one period can no longer erase periods already stored in the document.
- **The confirmation modal was untruthful.** It claimed to overwrite "the currently
  displayed schedule" — false in both directions. It now names the actual date range and
  the staff pool that will be used, so a demo pool is visible *before* the click. The range
  is derived from the keys `generateRoster` really returns, so it reports a Sunday start as
  Sunday rather than implying the not-yet-landed weekday fix.
- **Import-case bug in `src/components/Aura.hooks.test.js`.** The file imported from
  `'./aura.hooks'` (lowercase) where the module is `Aura.hooks`. This resolves on
  case-insensitive macOS but fails on a case-sensitive CI filesystem — a latent CI
  break, fixed to `'./Aura.hooks'`.

### Removed

- **`src/components/Aura.utils.test.js`** — a byte-identical duplicate of
  `Aura.hooks.test.js` (both 12,323 bytes). It doubled every reported test count while
  covering nothing additional.

### Breaking

- **Firestore document shape changed at `system_data/roster_2026`.** The shift objects
  stored in that document changed from one-object-per-person to one-object-per-task:

  ```
  before:  { staff: "Brandon", task: "EFT", category: "CORE", week: 1 }
  after:   { task: "EFT", lead: "Brandon", coLead: "Ying Xian",
             staff: "Lead: Brandon, Co: Ying Xian", category: "CORE", week: 1 }
  ```

  `lead` and `coLead` are additive, but **the meaning of `staff` changed** — it was an
  identity, and is now a display string. A client that is already in a user's browser
  reads `shift.staff` and compares it to the signed-in user's name; against a
  newly-generated roster that comparison can no longer match, so shift-ownership
  detection — and therefore the swap flow — silently stops working for that client.
  NEXUS is a PWA, so **old clients persist in the service-worker cache** and this is a
  real user-visible regression, not a theoretical one.

  This change shipped un-versioned, before this changelog existed; it is recorded here
  rather than announced. It is also the direct cause of **M6** (the display string's
  comma is emitted unescaped into the ICS `SUMMARY`).

  Affected Firestore path: **`system_data/roster_2026`**.

### Notes on this bump

- **Bump kind: `minor` (1.0.0 → 1.6.0).** Reasoning: `package.json` `1.0.0` was stale
  bookkeeping, not a claim — it never tracked anything. The README's Release History is
  the de facto version record, and it documents v1.0 through v1.5 as shipped, so the
  effective pre-release baseline is **1.5.x**. The un-released work since that v1.5
  description is predominantly feature work (lead/co-lead pairing, resource registry,
  new CTA tier, confirmation modal) plus this release's test and documentation
  infrastructure — a `minor`. The README's own roadmap already named the next release
  v1.6.
- **A strict reading of the versioning rules argues for `2.0.0`**, because the
  `system_data/roster_2026` shape change above degrades an already-deployed client.
  That was **not** taken unilaterally: the change already shipped to production
  un-versioned, so a major bump today would be retroactive labelling rather than a
  release signal to anyone, and the call belongs to the project owner. If a major is
  preferred, this entry becomes `[2.0.0]` unchanged apart from the number.

---

## Reconstructed history

> **Provenance warning.** Everything below this line was transcribed from the
> *Release History* section of `README.md`. It was **not** derived from git history,
> **not** verified against the code, and there are **no tags** for any of these
> versions. Dates are unknown and are deliberately omitted rather than invented.
> `ROSTER_POSTMORTEM.md` Block E documents that at least one claim in this history is
> false (see the v1.5 note below), so read it as an assertion, not a record.

### [1.5.0] — reconstructed from README

- **NEXUS Feeds Integration:** the Digital Watercooler for PDPA-compliant clinical
  knowledge sharing and Community of Practice updates.
- **Immersive Lightbox UI:** distraction-free reading with nested real-time discussion
  threads.
- **Smart Routing Architecture:** URL-parameter detection for secure deep-linking and
  cross-platform post sharing.
- **Security Enhancements:** logout flush to kill lingering Firebase database
  connections; native browser alerts replaced with custom-branded confirmation modals.
  > **This last claim is false as written.** Post-mortem E2: `RosterView.jsx` still
  > contains seven `alert()` calls, including both the success and failure paths of
  > live roster generation and of swap submission. Plan P8.3 tracks the repair.

### [1.4.0] — reconstructed from README *(AURA engine v2.3)*

- **AURA Engine upgrade to v2.3:** from reactive conversational bot to proactive
  database-middleware agent.
- **Autonomous Roster Mediation:** AURA listens to Firebase collections via live
  snapshots and executes peer-to-peer shift-swap matrix rewrites.
  > Post-mortem Block A finds that this rewrite **never actually happens** — see **A1**
  > under *Known issues*.
- **Native File Export:** direct Microsoft Word document downloads from parsed text,
  working around mobile browser limitations.
- **Data Entry Payload Expansion:** LLM schema extended to extract operational
  parameters from natural language and generate database commit interfaces.
- **Technical Debt Resolution:** iOS Safari phantom-click UI bug resolved via dynamic
  z-index management; Sandbox Cloud Function schema-mismatch crashes patched.

### [1.0.0] – [1.3.0] — reconstructed from README *(Legacy IDC App; AURA v1.0–v2.2)*

- **Foundational Architecture:** core React + Firebase dual-environment infrastructure
  separating Live production data from the local Sandbox.
- **Wellbeing Analytics:** Pulse tracking system and the daily Social Battery heatmap.
- **Auto-Rostering Framework:** initial "zero-conflict" scheduling logic and unified
  calendar interfaces.
  > Post-mortem E1: "zero-conflict" truthfully means "cannot double-book by
  > construction" — a property of the cyclic rotation, not a safety guarantee. The
  > generator consumes no case volumes, skill-mix, leave or ward data.
- **Early AURA Integration:** baseline conversational agent focused on Motivational
  Interviewing (OARS) and basic administrative query routing.
