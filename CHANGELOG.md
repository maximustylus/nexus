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
| **M6** | High | **The ICS export is malformed.** `SUMMARY` is an RFC 5545 TEXT property, but the emitted value contains an unescaped `,` (`SUMMARY:[EFT] Lead: Brandon, Co: Ying Xian`), making it a multi-valued property; the events also carry no `UID` and no `DTSTAMP`. Introduced by the lead/co-lead refactor in this release — see *Breaking* below. Audit M6. |
| **B1** | High | **Sunday-start weekday misalignment.** The default start date is a Sunday, so the generator's "Mon–Fri" day loop (`d = 0..4` from the week start) and its Tuesday/Saturday VC indices are all offset by one day. Post-mortem Block B. |
| **P0.7** | Medium | **`npm run lint` has never worked.** No ESLint configuration file exists anywhere in the repository (`git ls-files \| grep -i eslint` returns nothing), so the `lint` script exits `2` on any invocation — "ESLint couldn't find a configuration file". Pre-existing; the deploy workflow never called it, so this was never surfaced by CI. Plan P0.7 in `ROSTER_TODO.md`. |

Additional lower-severity findings (M10 CSV formula injection, M12 no
duplicate-request guard, C1/C3/C4 persistence and
configuration drift, D-series verification gaps, E1/E2/E4 documentation overstatement)
are recorded in `ROSTER_QC_AUDIT.md` and `ROSTER_POSTMORTEM.md` and are likewise
**not** fixed.

---

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
