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
> No git tag existed for any version at the time of writing (616 commits, 0 tags), so the
> entries below were not written against tags. *(Corrected 2026-08-15: the repository is tagged
> now — every release from `v1.6.0` to `v1.14.0` sits on the commit whose `package.json` already
> reads that version, so `git checkout v1.13.0` works. The one exception is
> `v1.5.0-pre-remediation`, which marks the state before this work began and reads `1.0.0`.)*
> `git checkout vX.Y.Z` still does not work for the reconstructed versions below `v1.6.0`, and
> never will.
>
> ### Ids — `D`n and `Q`n are two different series
>
> `D`n in this file is a **defect**, from `ROSTER_QC_AUDIT*.md` or the post-mortem — and the same
> number can mean *different* defects in different audits, so a cell names its source where it
> can. `Q`n is an **open decision for the owner**, listed in `ROSTER_HANDOFF.md` §5. Those were
> `D`n until 2026-08-14 and kept their numbers when renamed, so anything said in conversation
> still maps; there is no `Q9`. Released entries below were written before the rename and are
> corrected in place rather than rewritten.

---

## [Unreleased]

Nothing yet.

---

## [1.17.1] - 2026-08-19

### Fixed

- **`D2/D3/D9` — a colleague who is never rostered is now named on screen.** An amber panel sits
  between *"could not be staffed"* and the load table: it names them, and names the four things
  that cause it (a grade outside every task's band gate, a missing required skill, unavailable
  dates covering the run, an availability window falling outside it). It also reports the two
  other figures `measureRosterLoad` returns and nothing read — the heaviest single day and its
  duty count. **This is the first UI caller that function has ever had.**

  ⚠️ **The defect's own description was wrong, and correcting it is most of the value.** The
  ledger said the engine *"computes this and discards it — there is no UI caller at all"*, which
  reads as *the information is unavailable*. It was not: `result.load` is built
  `for (const person of staff)`, so a never-rostered colleague has **always** had a row in the
  load table reading `0`. Nothing was hidden. The real gap is that a `0` among nine rows does not
  announce itself — and `D2/D3/D9`'s own scenario, a mistyped availability window quietly removing
  somebody, is precisely when nobody thinks to look. **So the fix is a callout, not a data pipe**,
  and a test pins the pre-existing `0` row so a later change cannot "fix" the callout by deleting
  the thing it points at.

  **Amber rather than red, deliberately.** An unstaffed slot is a failure — work nobody can do.
  Nobody rostered is a *question*: correct when somebody genuinely is not on this rota (the
  respiratory shape's three below-floor staff are exactly that), and a silent disaster when it is
  a typo. The panel cannot tell which, so it does not pretend to.

  3 tests, each verified to fail when the panel is removed.

---

## [1.17.0] - 2026-08-19

The authorization boundary stops living in a console, and the engine gets stress-tested.

### 🔒 Security — decision `Q6`, open since before v1.6.0, is closed

- **`firestore.rules` is deployed.** `firebase.json` declares it and
  `.github/workflows/deploy.yml` deploys `--only functions,firestore:rules` on every merge to
  `main`. Authorization is now versioned, reviewable and diffable like everything else.
  **Deployed 2026-08-19 00:26:54 SGT**, CI run `32201046521`.

  ⚠️ **BOTH WIRING HALVES WERE REQUIRED AND ONLY ONE IS DOCUMENTED ANYWHERE.** Declaring
  `firestore` in `firebase.json` deploys nothing on its own — the workflow ran `--only
  functions`, which **excludes rules**. With the section added and the args untouched, CI goes
  green, the runbook says "wired", and the boundary is unchanged. If rules ever appear not to
  take effect, check that flag first.

- **What was live until this release, and why it mattered.** The owner supplied the console's
  rules on 2026-08-18 — the first time anybody in this repository could see them. The operative
  clause was `match /{document=**} { allow read, write: if isVerifiedStaff(); }`, and
  `isVerifiedStaff()` was **any verified `@kkh.com.sg` address, not the ten-person directory**.
  The Firebase API key ships in the public bundle, so any KKH employee who registered an account
  could read `wellbeing_history` — the longitudinal burnout record per named clinician —
  overwrite `system_data/roster_2026`, and approve any `shift_swaps` entry. Whole-hospital
  exposure, not internet-wide, and it was live the entire time. Four emulator checks now prove
  that same identity gets nothing.

- **Roster generation is admin-only.** Generation overwrites the whole roster (post-mortem
  **C2**); a one-day in-place edit — accepting a swap — stays open to every directory member.
  ⚠️ **Behaviour change:** any of the ten could press Generate yesterday. A non-admin now gets
  `permission-denied`, which `RosterView.jsx:592` already renders as "The roster was NOT saved"
  while keeping their configuration.

- **Two live pathways were saved by asking for the console rules rather than deploying on
  trust.** The proposal as written required `isMember()` on `community_assessments` (public
  screening telemetry) and `beta_feedback` (the sandbox widget) — both unauthenticated by
  nature. Deploying it unchanged would have stopped public telemetry **silently**, because
  `recordTelemetry` swallows its own error and the member of the public still reaches their
  result page. Both now ship **anonymous but shape-pinned** — key allowlists, size caps and a
  server clock — which is strictly tighter than the console's unpinned `if true`. The residual
  risk (an unmetered write endpoint that rules cannot rate-limit) is written into each block
  rather than left to be discovered.

- **Two of the console's five hand-written blocks governed nothing**, measured by grepping every
  collection name across `src/` and `functions/`: `community_resources` has **zero** references
  anywhere, and `feeds` is a **UI view name**, not a collection — the real one is `feed_posts`,
  which was therefore covered only by the catch-all. Both recorded as deliberate omissions so
  nobody transcribes them back in.

- **Verified, not asserted:** `scripts/firestore-rules-verify.mjs` — **31 checks, 31 as
  specified** against the Firestore emulator, committed as a runnable script rather than recorded
  as prose. It lives in `scripts/` because `vitest.config.js` collects `src/**/*.{test,spec}.*`
  and CI has no emulator. The pre-existing "139 checks" record in
  `firestore.rules.README.md` §5 is now explicitly scoped to the blocks it actually exercised,
  rather than being allowed to vouch for blocks written after it ran.

### Added

- **A stress-tester agent** (`.claude/agents/stress-tester.md`) and its harness
  (`npm run stress`). Every one of the ~1655 tests is a hand-authored fixture — a good property,
  but it meant the engine had **never been run on a configuration nobody wrote by hand**, and
  never above 20 staff. First run, seed `20260818`: **2,525 random rosters, zero broken
  invariants, zero audit disagreements, zero non-determinism.** The harness self-tests first —
  it corrupts a known-good roster five ways and requires every one to be caught — because a fuzz
  harness that cannot fail is worse than none.

### Known issues

- **`D11` — generation blocks the browser** — is recorded in the table under `[1.16.0]`, where it
  was filed on the day it was found. *Ordering artefact, stated rather than tidied: it was found
  by the harness that ships in THIS release, so it reads as pre-existing there. It is still open,
  and `[1.16.0]`'s shipped entry is not rewritten to move it.*
- Nothing in the standing list under `[1.13.0]` was fixed, and `D10` (the grade floor) is
  unchanged.

### Notes

- **No application source changed in this release.** `git diff` covers rules, wiring, scripts,
  agent definitions and documentation only. The behaviour change for users comes entirely from
  the rules now being enforced.

---

## [1.16.0] - 2026-08-18

A sixth roster structure, and the correction that a shape is one team — not a profession.

### Added

- **A sixth shape: "A grade floor, and a rotation across fixed areas"**, from respiratory
  therapy. Their therapist lead watched the Sandbox demo on 2026-08-17, walked through the
  configuration, and described four things: a **minimum job grade of AH12**, three areas
  (`NICU`, `CICU`, `Ward 65 HiD`), **rotation** across them, and Monday–Friday office hours.
  Respiratory *lost* an invented fixture in v1.13.0 for claiming a service nobody had described;
  `mockData.js` has carried the rule for getting one back ever since — *"add a SHAPE (a structure,
  sourced from a team who told us) or add nothing"* — and this is its first use in the direction
  it was written for.
  - **Measured, not asserted** (`generateRosterV2`, 2026-09-07, 4 weeks): `ok = true`,
    `hardViolations = 0`, an independent `auditHardConstraints` read-back of 0, `unfilled = 0`,
    `warnings = 0`, 20 days, 60 shifts, exactly **6 distinct leads** — every AH12-and-above person
    and nobody else — 10 duties each, split 3–4 per area.
  - **Falsified, the way the physiotherapy gates are:** removing `leadBands` puts three
    below-floor staff into the lead list (9 leads instead of 6), so the gate does the work rather
    than agreeing with what fairness would have done anyway.
  - `coLeads: 0` on all three areas is **forced, not a staffing choice**: a band gates the lead
    only — *"any grade may co-lead"* — so a second body is a body the floor does not reach.
  - **Rotation is measured in the output, not enforced by a rule.** She said they rotate; she did
    not say everybody must cover every area. Encoding a quota floor would be inventing a policy
    from a description.

- **`sourceScope` on every interviewed shape** — `{ teams, institutions, describedOn }`, required
  and asserted. See *Changed* for why it exists.

### Changed

- **A shape is ONE TEAM AT ONE INSTITUTION, and the app now says so.** Until this release the
  picker told a visitor *"this is the shape your own profession described to us"*. Every shape here
  came from one team at one site, so a respiratory therapist at any other SingHealth institution
  was told their **profession** had described a structure **one team at one hospital** described —
  and there are 27 other allied health professions with the same exposure. The copy now reads
  *"came from ONE team in your profession, at one institution … one team is not a profession,
  colleagues elsewhere roster differently"*, with a test asserting the old sentence is absent from
  the DOM. This was a pre-existing defect affecting all five prior shapes, not something the sixth
  introduced.
- **Scope is DATA, not prose**, and that is the future-proofing: when a second team from the same
  profession describes something different, `teams: 2` is a field that changes, where a
  hand-written sentence is something somebody must remember to rewrite and will not.
  `describedOn` is `null` for five of the six — four were interviewed before any date was
  recorded and the owner's own service was never described on a day — which is the measurement,
  not an oversight.
- **Attribution and suggestion were one field doing two jobs, and are now two.**
  `sourceProfession` + `sourceScope` **attribute** (mandatory for every interviewed shape);
  `sourceProfessionId` is the **auto-suggestion key alone** and is now nullable. **Respiratory
  declines it**: the shape is fully attributed and offered to nobody, because RTs work across every
  institution in the cluster and rotate differently. Profession coverage returns to **32 of 37
  leaves** (measured), and `suggestedShapeFor('respiratory-therapist')` is `null`.
- **The shape-signature test gained a `bandFloor` dimension.** Respiratory is the first shape to
  reach an engine field another shape already reaches — it and physiotherapy both use `leadBands` —
  and on the seven fields previously compared their signatures were identical, so the assertion
  failed correctly. They are still different structures: physiotherapy gates the **lead** and lets
  any grade co-lead (a supervision shape), respiratory uses the same field as a **floor on
  everybody**. The tuple is now stricter, not looser.

### Notes

- **The five shapes that keep an auto-suggestion keep it on borrowed time.** Each is also one team
  at one institution. The written trigger to remove suggestion-by-profession entirely: the first
  time two teams in one profession describe two different structures.
- **Audiology deliberately has no shape.** Their roster master asked for a feature (half-day AM/PM
  sessions, decision `Q13`); he did not describe his week. A conversation is not a structure.
- **An expressiveness ledger** now lives at the foot of `ROSTER_TODO.md` — every rule a real team
  has stated and whether the engine can say it. Four `No`s so far. Every `No` is a team that cannot
  use the tool, and that list rather than the fixture count is the measure of whether this serves
  the cluster.
- **Nothing in `functions/` changed, and `firestore.rules` is still undeployed** (`Q6`), so the
  authorization posture is exactly as it was.
- 1655 tests across 29 files, lint clean.

### Known issues — new in this release

| Id | Severity | Defect |
|---|---|---|
| **D11** | Medium | **Generation blocks the browser, and the cost grows with both headcount and run length.** Found 2026-08-18 by the new stress harness — the first time anything measured this; no performance figure existed anywhere in the repo before. `generateRosterV2` is called **synchronously inside the Draft click handler** (`RosterView.jsx`), with no worker and nothing yielding, so the tab is frozen for the whole run. Measured on this machine, isolated one variable at a time: with the roster fixed at 2,600 shifts, **25 staff → 0.98s and 200 staff → 5.9s** (roughly linear in headcount); with staff fixed at 100, **650 shifts → 0.38s and 10,400 shifts → 22.6s** — 16× the shifts for **60×** the time, so the per-shift cost itself grows 3.7×. Worst case measured: **200 staff × 40 tasks × 52 weeks = 51s**. Sandbox path only — live mode still uses the V1 `generateRoster` — but the sandbox is the surface every visiting department is shown, and V2 is the engine intended to replace V1. No threshold is asserted because none has been agreed; these are the numbers. Reproduce: `npm run stress`. |
| **D10** | Medium | **A grade floor cannot be stated, so the respiratory shape gates one grade too wide.** `leadBands` gates by BAND and `junior` is AH11–AH12, so *"minimum AH12"* has no expressible form — the nearest gate admits AH11. The shipped fixture is safe **only because its cast contains no AH11**; a real respiratory team typed into the wizard inherits the slack and **nothing on screen says so**. The bands were deliberately not moved to fix it: they stay aligned to the AHP job grades (`Q11`). Queued as `ROSTER_TODO.md` item 5(b). Do not claim grade-floor enforcement to that department until it ships. |

*(The `### Known issues` table under `[1.13.0]` remains the standing list — **none** of `D2/D3/D9`,
`D5`, `D6`, `D7`, `D8` or the live-mode iOS zoom was fixed in this release.)*

---

## [1.15.0] - 2026-08-15

The roster owner's category palette, carried everywhere a shift goes.

### Added

- **Four standard categories with the owner's exact colours** — Clinical **brown**, Education
  **orange**, Research **lime green**, Management **yellow** — in `src/utils/rosterCategories.js`,
  the ONE map three surfaces read: the calendar chips, the wizard's per-task category label
  (now a coloured chip instead of summary text), and the ICS export. One map because three
  copies is how the app ends up disagreeing with the file a colleague imported into Outlook.
- **The `.ics` carries `CATEGORIES:` on every event** (RFC 5545 §3.8.1.2) — Outlook colours by
  category after a one-time assignment, and every later import follows. Escaping is
  load-bearing here more than anywhere else in the exporter: in CATEGORIES a bare comma means
  TWO categories, so `Clinic, Ward` travels escaped. Emitted only when a category exists.
- **…and RFC 7986 `COLOR:` for the standard four.** COLOR's value must be a CSS3 colour *name*,
  and the owner's palette is four literal CSS names — `brown`, `orange`, `limegreen`, `yellow` —
  so the palette ships in the file verbatim. A team's own category (`WEEKEND`, `VC`, a word of
  their choosing) gets `CATEGORIES` alone: no colour nobody chose.
- **The category box offers the standard four** via a datalist — free text deliberately
  preserved, because some categories are *quota handles*, not work types: the lab's `WEEKEND`
  floor pools over whatever word its tasks carry, and a closed dropdown would break a shape
  that already ships.
- **A deterministic, explainable suggestion.** A keyword table reads the task name and offers a
  chip — *looks like Research — "Journal" · tap to apply* — that names the word that earned it,
  applies only on a tap, and withdraws once anything is typed. Explicitly **not** AI: category
  changes quota pooling, so an unexplainable inference here is a claim the roster master cannot
  check — the exact failure class this project's post-mortem exists to prevent. The rule
  follows `suggestedShapeFor`: *a suggestion that loads without being chosen is a claim.*

### Changed

- The calendar's category colouring stops being one hardcoded special case. It was literally
  `s.category === 'VC' ? orange : blue` — the live team's video clinic and nothing else. The
  palette map now runs first; `VC` keeps its exact orange; everything unrecognised keeps the
  default blue.

### Notes

- Category is still an **opaque string to the engine**, deliberately. The engine gaining an
  opinion about what "Clinical" means is the day `WEEKEND` quotas stop being expressible.
  Styling and suggestion live entirely at the edge.
- Verified in the browser against the worked example: Clinical chips brown, Education orange,
  `Diagnostics` and `On Call` neutral; the calendar shows Inpatient Rounds brown, Student
  Supervision orange, Sleep Study Review default. 15 new tests (palette contract, CATEGORIES
  escaping, COLOR for the four and only the four, suggestion offered-not-applied), 1654 total.

---

## [1.14.1] - 2026-08-15

A wizard-row tidy asked for from a screenshot, and the documentation audit finished.

### Changed

- **The day chips are one letter each — `M T W T F S S` — on a single row.** Seven three-letter
  chips wrapped onto two lines on a phone and read as a wall of words. `short` is **ambiguous by
  construction** (Tue/Thu are both `T`, Sat/Sun both `S`), which sighted readers resolve by
  position; so the chips render the letter and *announce* the full day name, in both the tooltip
  and the accessible name. The `aria-label` keeps its three-letter form, so nothing addressing
  these chips by label had to change.
- **Co-lead is a checkbox** rather than a `Yes`/`No` lozenge. `role="checkbox"` on a button, not
  `<input type="checkbox">`: the wizard's phone rule is that every control declares a 44px height
  floor and `RosterView.mobile.test.jsx` enforces it over every `input` on the page, so a native
  checkbox would have to *be* 44px — an enormous system box. This draws a checkbox-sized mark
  inside a thumb-sized target and announces itself correctly regardless.

### Fixed

Nineteen documentation defects, from an audit of all twelve markdown files plus three
cross-document sweeps. **Six were introduced by the previous two commits** — the audit's main
value was catching those rather than the older drift.

- **`ROSTER_QC_AUDIT_PRIMITIVES.md` contained a committed NUL byte**, so `file` reported it as
  `data` and plain `grep` skipped the whole file **silently** — no warning, no match, exit 1. It
  had been invisible to every search in the repository for a week, including two audits looking
  for the defect ids it defines. The byte sat *inside the finding that documents the NUL-byte
  defect*, so the document reproduced the defect it was reporting.
- **The v1.14.0 CHANGELOG entry both answered and reopened Q12**, fifteen lines apart — a
  duplicated block, the second copy tracking it as `D12`, which resolves to nothing.
- **`README.md` published v1.13.0's release notes under a `v1.14.0` heading**, with the real
  v1.14.0 absent and v1.13.0 having no heading at all.
- **`README.md`'s Supported Versions table refuted itself** — `1.12.x` listed as supported on one
  row and deprecated on the next — and disagreed with `SECURITY.md`, which both files promise to
  match.
- **The post-mortem's status banner claimed M4 fixed.** Only half shipped: the false notification
  claim is gone, but nobody notifies the requester and there is no mechanism — the code says so
  at `RosterView.jsx:1614`. This was the only place in the document set where a still-open HIGH
  defect was called closed.
- **`ROSTER_HANDOFF.md` told the owner to type into a Skills column that does not exist.** The
  staff table has none (`RosterDemoWizardTables.jsx:1640`), so Q12's documented workaround is
  demo-only — defect `D5`. That instruction would have failed in front of an audience.
- **README overstated three capabilities:** a "Backend Firewall" that is a browser-side check (no
  Cloud Function checks the caller — `grep -c 'request.auth' functions/index.js` → 0); "strictly
  isolated Firebase collections" that do not exist, with one demo write that does reach
  production `feed_posts`; and an Auto-Healer `ROSTER_ALERT` chat surface deleted in v1.10.0,
  including a beta-tester smoke test that could not pass.
- **`firestore.rules.README.md`'s deploy smoke test would have triggered a false rollback** — it
  tested a surface that moved in v1.10.0, and §8.3 ends "if step 4 fails, roll back".
- **`.claude/agents/qc-steward.md` would have misdirected a verifier**: it said there is no
  `firestore.rules` (so live writes would be reported as guarded), no test script (so the whole
  verification phase would be skipped), granted permission to edit the now-frozen audit
  snapshots, told the agent to run gates that cannot finish in-repo, and cited a fixed precedent
  that would manufacture a false accusation.
- **The `D` → `Q` renumbering had 13 leftovers** across five files including six source comments,
  each colliding with a live defect of the same number. Both `CHANGELOG.md` and `qc-steward.md`
  now carry an explicit note on the two series, and the `Q` series' missing `Q9` is documented.
- Test counts aligned to 1639/28 across five files; the zero-tags claim corrected; §4 of the
  handoff retitled and its five omitted open items added; one table row whose unescaped `||`
  rendered an extra cell.

### Notes

Four things the audit could **not** settle, recorded rather than dropped: `firestore.rules` itself
has audited holes that appear in no ledger — and it is the file `Q6` proposes deploying; the
`_FOUNDATIONS` `D1`–`D10` series has no status anywhere; `C2` is fixed and shipped but named in no
release entry; and nothing here was verified against the deployed bundle.

> ### Bumping the version is part of shipping, not a separate decision
>
> Standing instruction from the roster owner, **2026-08-14**: *"update NEXUS PWA's version
> numbers correctly everytime we move forward with fixes, features."*
>
> - **Edit `package.json` `version` and nothing else.** `src/version.js` carries it to every
>   screen; `src/version.test.js` fails the build if any file types a version by hand.
> - **Which digit:** a stored-shape change an already-cached PWA client cannot read → **major**;
>   a new capability that old clients ignore safely → **minor**; fixes and copy only → **patch**.
> - **Then re-align the downstream copies in the same commit:** this file's top entry,
>   `README.md`'s title line, its `Version-` badge, its *Supported Versions* table and its
>   *Release History*, and `SECURITY.md`'s *Supported Versions* table. Nothing but
>   `package.json` is authoritative. Five copies is four too many, but they are prose for
>   humans, so the fix is to list them here — not to leave them to be found later.
> - **Then tag it:** `git tag -a vX.Y.Z` on the commit that carries the bump, never before it.
>   Every **release** tag in this repo points at a commit whose `package.json` already reads that
>   version, which is what makes `git checkout vX.Y.Z` mean anything.
> - **The AURA engine version is not the app version.** It tracks the agent's capability tier,
>   moves on its own, and is not touched by an app bump.

---

## [1.14.0] - 2026-08-15

The configuration wizard becomes a **numbered sequence** rather than a stack of similar cards,
and a set of documents that had drifted into contradicting each other is reconciled.

### Added

- **The wizard's panels are numbered 1–7 on a connecting spine.** They were seven
  similarly-styled cards in a column: nothing said they were ordered, nothing said Staff comes
  before Tasks for a reason, and nothing told a first-time reader how much was still below the
  fold. The roster owner asked for *"a number and a line … so that it's logical and sequential"*,
  from a reference showing exactly that.

  **The numbers are derived, not written at the call sites.** `WIZARD_STEPS` in
  `rosterWizard.js` is the one ordered list, and a step's number is its index. This matters more
  than it looks: steps 1–2 are rendered by `RosterView.jsx` and steps 3–7 by
  `RosterDemoWizardTables.jsx`, so hand-numbering would be two files that must be kept in
  agreement, and inserting a panel in one would silently make the other's numbers wrong. Same
  reason `BAND_DIVIDERS` derives from `BAND_NAMES` instead of being written down as two.

  `WizardStep` is purely presentational — it takes a number and children, holds no state and
  reads no roster data, so numbering the wizard cannot change what the wizard produces. All
  1630 pre-existing tests passed unchanged, which is the evidence for that claim rather than an
  argument for it.

  Live mode is **not** numbered: its wizard is a different and shorter thing (two textareas), so
  numbering it would count a sequence that does not exist there. It opts out by being handed no
  number, not by a second branch of markup.

- **`RosterView.steps.test.jsx`** — 9 tests. The load-bearing one asserts the badges read
  `1..N` **in DOM order, with no gaps and no repeats, across both files**, compared against a
  range derived from `WIZARD_STEPS` — so adding an eighth step makes the test demand an eighth
  badge instead of quietly accepting seven. Mutation-checked five ways, all caught: a panel
  losing its number (fails with `[1,2,3,5,6,7]` vs `[1,2,3,4,5,6,7]`), a number hard-coded at a
  call site, the registry reordered, `min-w-0` dropped from the content column, and the spine
  trailing past the final panel.

### Fixed

- **Two layout regressions the spine introduced, both found by looking at 375px rather than by
  testing.** The badge gutter costs 32px of a phone's width, and below `sm:` the wizard's rows
  stack rather than scroll, so that width comes out of the content.
  - The grade ruler's tick strip had 25px per cell against the 26px `AH10` needs, so every
    label from AH10 up rendered as `AH…`. The strip is now `text-[8px]` below `sm:`. It is
    `aria-hidden` and the bands are spelled out in full in the legend directly beneath it, so
    shrinking it by a pixel of font loses nothing — where narrowing the badges would have
    compromised the thing being asked for.
  - Giving step 2 a card to match the others then squeezed `<input type="date">` to 151px, and
    at the 16px Sandbox uses to stop iOS zooming it needs ~150px **plus** its picker icon — so
    the year rendered as `202`. Start Date now takes two thirds of the row and Weeks one; Weeks
    holds a one- or two-digit number and never needed half.

  *(A first attempt to measure the tick clipping used a `+1` pixel tolerance and reported no
  problem — the shortfall was exactly one pixel. Noted because the tolerance, not the layout,
  was what hid it.)*

- **The `D`-prefix meant two different things in different documents, and one of them was
  load-bearing.** `ROSTER_HANDOFF.md` used `D`n for *decisions the owner must make*; this file
  and the audits use `D`n for *defects*. They collided at 5, 6, 7 and 8 with unrelated meanings
  — so *"settle D6 before another department's data is involved"* pointed a reader at a linter
  setting rather than at Firestore rules. The **decisions** are now `Q`n, keeping their numbers;
  the **defect** numbers are unchanged because they are cited in already-released entries above,
  and rewriting a shipped release's record to tidy a name is the worse trade.

- **`ROSTER_HANDOFF.md` contradicted itself about `firestore.rules`** — §4 said the file exists
  but is inert, while the decision entry said there is none in the repo. The file exists, is
  tracked, and is **not deployed**: `firebase.json` declares only `hosting` and `functions`.

### Notes — a task can require exactly ONE thing of a person

`requiresSkill` is a single string, not a list. Combined with the fact that **bands are grade
ranges and cannot express a role**, that produces a gap the four-band split did not close and
could not have closed.

The roster owner's observation that opened it, 2026-08-14: *"there might be a technologist with a
junior grade."* So role and grade are orthogonal. A technologist at AH11 sits in the `junior` band
exactly like a junior clinician at AH11, and `leadBands: ['junior']` therefore **admits them as
lead**. Gating on a skill instead does work — a skill is an opaque string, and skill ANDs with the
band gate — but only while the task needs nothing else. Measured against the engine:

| Task gate | Who may lead |
|---|---|
| `requiresSkill: 'CPET'` | registered+CPET **and technologist-with-CPET** — registration ignored |
| `requiresSkill: 'registered'` | registered+CPET **and registered-without-CPET** — competency ignored |
| `requiresSkill: ['CPET', 'registered']` | refused — *"must be a skill name"* |
| `requiresSkill: 'CPET+registered'` | refused — *"nobody holds that skill"* |

So *"a registered clinician who is also CPET-competent"* — which is what Paediatric CPET actually
requires — **cannot be expressed today.** One requirement wins and the other is waived. The only
workaround is a fabricated compound skill (`CPET+registered`) typed into a person's skills column,
which is the class of special case the v1.11.0 primitives work existed to remove.

**Not fixed, deliberately.** The fix is a third eligibility axis — one more column on the person,
checked alongside band and skill rather than instead of them — and it changes the staff table,
which is the screen the respiratory and psychology teams are about to be shown. **Two professions
have now asked for it independently:** cardiology's roster master described competency sign-off per
modality *with levels* (supervised vs independent), which also answers the open question of shape
— it is an **ordered list**, not a boolean. Tracked as **Q12** in `ROSTER_HANDOFF.md`.

Two consequences that are not optional:

- **Registration gating must not be claimed** for this version. Band gating is real and
  demonstrable; registration gating is not, yet.
- **Do not name the new field `role` — that name is taken and it is load-bearing.** A slot's
  `role` is both the human-readable slot label (`unfilled[].role` carries
  `'Junior embryologist'`) *and* the identity key for two primitives: affinity is **scoped to the
  role**, so "the same practitioner at each clinic" pins the lead without also concentrating the
  co-lead slots on one person, and `COMPOSE_PAIRING` groups a shift by matching
  `fill.position.role === anchorRoleOf(task)`. It constrains nothing about *who* is eligible, but
  reusing the word would collide with the field that makes continuity and pairing work.
  `registration` or `staffCategory` avoids it.

---

## [1.13.0] - 2026-08-14

Two changes, and the second is what makes the first repeatable. The arrangement picker
becomes **profession + shape**: MOH's own 28 allied health professions as vocabulary, and
**five structures** — not one fabricated department per profession. And the app stops
hand-typing its own version, because by v1.12.0 it was rendering three different wrong
answers to "which version is this?" on the deployed site.

⚠️ **THIS SECTION REPLACES AN EARLIER UNRELEASED ENTRY, AND THE REPLACEMENT IS THE POINT.**
That entry announced *twelve* arrangements, one per department, with 23 more to come so
that every MOH profession had one. Seven of the twelve were guesses: plausible services
nobody had described, offered under a real profession's name with a `correction` checklist
attached. The checklist was the tell — a fixture that has to apologise for itself is
making a claim it cannot support. Nothing of that entry shipped, and the retraction is
recorded here rather than deleted, because "we nearly wrote 28 fictional services" is the
useful half of the story.

The roster owner stopped it with the observation that made the whole thing unnecessary:
*"other professions can also ride on the configurations of the 5. That's the purpose of
this roster's new version — so roster masters can configure for their team regardless of
their profession."*

### Added

- **Five shapes, each named by its STRUCTURE and attributed on screen to the profession
  that described it.** A shape says *"this is how the physiotherapists do it — adapt it"*,
  which is true. A per-department fixture said *"this is how art therapists do it"*, which
  was invented. Every shape is one of the five configurations that already existed and had
  an interview behind it, re-presented by what it demonstrates rather than by the
  department it came from. Every one re-verified by **running the engine**, with an
  independent `auditHardConstraints` read-back of each finished roster:

  | Shape | From | `ok` | Hard violations | Audit read-back | Days | Shifts | Unfilled | Warnings |
  |---|---|---|---|---|---|---|---|---|
  | Graded duty split | Physiotherapist | true | **0** | **0** | 28 | 56 | **0** | 0 |
  | Periodic specialist clinic, same practitioner each time | Psychologist | true | **0** | **0** | 60 | 159 | **0** | 0 |
  | Team-based rotation | Embryologist | true | **0** | **0** | 252 | 360 | **0** | 0 |
  | Weekend quota inside an hours ceiling | Medical Laboratory Technologist / Scientist | true | **0** | **0** | 54 | 171 | **0** | 1 † |
  | Fixed weekday sessions plus out-of-hours slots | Clinical Exercise Physiologist | true | **0** | **0** | 24 | 88 | **0** | 0 |
  | The Marvel Team *(fictional)* | — | true | **0** | **0** | 10 | 24 | **0** | 0 |
  | The Marvel Team — full worked example *(fictional)* | — | true | **0** | **0** | 12 | 32 | **1** ‡ | 0 |

  † The one warning is the engine being honest about its own horizon: the run covers only
  2027-04-01 to 2027-04-04 of April, so the Saturday floor is *not judged* there. It is
  deliberately not trimmed away.
  ‡ The one unfilled slot is the deliberate one, and its reason is the argument for
  trusting the tool: *"no available staff hold skill CPET for Paediatric CPET coLead on
  2026-09-16 (2 qualified, 1 on leave, 1 already on this task)"*.

- **The five feature signatures are asserted DISTINCT**, which is why five is the right
  number: `leadBands` both directions; `recurrence` + `leadBands` + `continuity` +
  `weeklyHours`; `slots` + cohort `windows`; a `quota` floor + `slots` + `weeklyHours`;
  plain days-based sessions. No two shapes reach the same set of engine fields, so choosing
  between them is choosing between structures rather than between casts of fictional names.
- **All 28 MOH professions as the picker's first control** — 37 selectable leaves, with
  `<optgroup>` for the two professions MOH nests (12, Medical Technologist / Physiologist,
  five sub-disciplines; 24, Psychologist, six). Sorted **in code** by the name a visitor
  reads, `localeCompare(…, 'en')`, never hand-ordered — asserted as a *property* (the list
  equals its own sort) so it cannot be satisfied by re-ordering the array. A group heading
  is not selectable, which is correct: a roster belongs to a cardiac lab or a sleep lab,
  never to "medical technology" in general.
- **The chosen profession labels the configuration and nothing else.** An Art Therapist who
  loads the physiotherapy shape sees *"Art Therapist — Graded duty split"* on their roster,
  with the shape's attribution beside it. Verified by generating the same shape under three
  different professions and comparing the **rendered calendar cell by cell**: identical,
  and identical to `generateRosterV2`'s own answer for the fixture. The profession reaches
  no engine field by construction — it is not an argument to the loader.
- **A non-binding suggestion of which shape tends to suit which profession** — the roster
  owner's own pairings, covering 32 of the 37 leaves. It is rendered as a suggestion, says
  out loud that nobody in that profession has described their week, and **never applies
  itself**: a suggestion that loads without being chosen is a claim. The five professions
  who *did* describe a shape are told that instead. Five leaves have no suggestion and are
  told why — three of those five had a hand-built fixture before this change, which is the
  clearest measure of what was wrong with it.
- **"Start blank" is a real first option**, not the dead placeholder it replaces: it empties
  the tables so a team can type their own, and **keeps the chosen profession**, because
  emptying a form is no reason to make somebody say who they are again.
- **`rosterWizard.ruler.test.js` — the band ruler's safety property, proved by exhaustion.**
  The ruler is the one control in the wizard that silently corrects its input: it *clamps* a
  drag rather than refusing it, because a pointer position is not a number somebody typed
  and can re-read. That clamp is the only thing between a drag and a `rules.bands` object
  that is not a partition of the grade scale.

  The four-band repair leaned on *reasoning* about that clamp — "a divider cannot cross its
  neighbour, because its floor is one grade above the divider below it". The reasoning was
  correct, but it was reasoning. This walks every legal partition of AH7–AH17 into the
  scale's bands (**120** today) × every divider × every requested grade from well below the
  scale to well above it — **10,800 moves** — and asserts after each that the result is
  still contiguous, gapless, non-empty and reaching AH17.

  It also covers the path the sweep alone cannot see. From a *legal* partition every divider
  already sits inside its travel, so the clamp never binds and a loosened ceiling is
  invisible — verified, by mutation: removing the ceiling's reservation for the bands stacked
  above it **survived** the sweep. So the test also feeds `bandRulerModel` input that is not
  a partition at all (blank cells, `AH nine`, inverted ranges, every band demanding AH17 at
  once) and asserts it still draws a legal partition *and* reports `representsInputs: false`
  rather than quietly rewriting what the user chose.

  Mutation table — seven mutations of `rosterWizard.js`, each caught: divider may touch its
  neighbour **3 failed** · top band loses its reserved grade **3** · clamp removed **2** ·
  ceiling forgets the bands above it **1** · ceiling off by one the other way **1** · floor
  ignores the divider below **1** · honesty flag hard-wired true **1**. Every bound is
  derived from `BAND_NAMES`, so it re-measures itself for free when a fifth band arrives.

- **`src/version.js` — the one place the app learns its own version**, exporting
  `APP_VERSION` (`1.13.0`) and `APP_VERSION_LABEL` (`v1.13.0`) from `package.json`'s
  `version`. This file has asserted since v1.6.0 that `package.json` is the single source of
  truth for the app version. Nothing enforced it, and the drift was not hypothetical: the
  deployed site was rendering **three** hand-typed literals **simultaneously**, all stale,
  none agreeing with each other or with `package.json`'s `1.12.0` — see *Changed* below.
  Nothing would ever have updated them, because nothing referenced them.

  **An import, not a Vite `define`.** This repo has **no `vite.config.js` at all**; the build
  runs on Vite's defaults and esbuild transforms `.jsx` natively. Adding a build config purely
  to inject a string would newly place the app's build under a file that did not exist before,
  and a `define` is invisible to `vitest.config.js`, so every test rendering these components
  would have to learn about it too. A plain import needs no config and behaves identically in
  the build and under test.

- **`src/version.test.js` (3 tests) — the standing instruction, enforced by the suite rather
  than by memory.** It strips comments from every non-test `.js`/`.jsx` under `src/` and then
  FAILS if a version-shaped literal appears in code that renders. Comments are exempt on
  purpose: this codebase annotates changes with the release that made them (`shipped v1.9.0`,
  `RFC 5545 §3.3.11`), which is legitimate history and must stay writable — and that exemption
  is the test's honest limit, stated in the file rather than discovered later. Two non-app
  versions are named in an `ALLOWED` list so that adding a third is a deliberate act: the
  **AURA engine's** `v2.3` capability tier, and RFC references.

  Mutation-verified, **three mutations, all three caught**: re-adding the `v1.4` literal to
  `AdminPanel.jsx`; hard-coding the current version *inside `version.js`* (which passed until
  `version.js` was itself brought into the scan — the literal and the truth coincided at
  `1.12.0`, so nothing noticed); and pointing the scan at a directory that does not exist —
  the vacuous pass, which is the dangerous one, now caught by asserting the scan read files at
  all.

### Changed

- **AH7–AH10 is its own band, `nonExempt`. The grade scale has FOUR bands, not three.**
  A correctness fix from the department's roster owner, in their words: *"AH7 to AH10 are
  non-exempt staff like associates, assistants, technologists. AH11, AH12 are junior AHP."*

  `junior` shipped as `[7, 12]`, which put an AH8 assistant and an AH12 junior clinician in
  the same band. Any task gated `leadBands: ['junior']` therefore let a non-exempt
  assistant **lead** it — the exact substitution the gate exists to prevent. The bands are
  now `nonExempt [7,10] · junior [11,12] · senior [13,14] · principal [15,17]`.

  Nothing was hard-coded to three, so the surfaces followed on their own: the ruler grew a
  third divider (`bands - 1`), task rows grew a fourth chip, and every prose label came
  from the same list. Cost of the split, measured rather than estimated: **121 tests
  failed**, of which **120 were assertions that had the old cut written into them** — the
  boundary as fact, a two-slider count, `Junior AH7–AH12` as text. **One was a real
  fixture defect**: the embryology trio graded its two junior embryologists AH8 and AH9,
  which is now non-exempt, so a `{band: 'junior'}` slot had nobody eligible. Re-graded to
  AH11/AH12 — the grades the interview actually described.

  One demo assertion was found to be **measuring nothing**: it moved divider `0` to AH10 to
  watch a task's grade caption follow, and divider 0 now *starts* at AH10, so the move was
  a silent no-op that would have passed forever. It now drives the junior|senior divider
  and watches two gated captions move in opposite directions on one keystroke.

  Every divider query in the component tests is now addressed **by `aria-label`**
  (`Boundary between the Junior and Senior bands`) rather than by index. Index-based
  queries were the single largest cause of breakage here — 13 of the 21 component failures
  were a `const [lower, upper] = dividers()` silently grabbing a different pair — and a
  label cannot go stale that way when a fifth band arrives.

- **`inferred` and `correction` are gone — the constant and every block.** They existed to
  disclaim a claim; nothing in the picker now makes that claim, so a disclaimer would be
  theatre. Two provenance kinds remain: `interviewed` for the five shapes and `fictional`
  for the two Marvel demos. If a future entry seems to need `inferred` again, that is the
  signal somebody is about to describe a service nobody has described.
- **The amber warning panel is now a neutral attribution panel**, in the wizard *and* beside
  the finished roster. Same reason it existed in the first place — the wizard is a modal and
  it closes the moment the roster is drafted — but it now states two facts instead of
  apologising: whose profession this roster is, and whose structure it borrowed.
- **Six invented arrangements deleted**: `respiratory`, `audiology`, `cardiology`,
  `clinical-counselling`, `medical-social-work` and `pulmonary`, with their fixtures and
  their `correction` blocks.
- **`DEMO_EXAMPLE_DEPARTMENT` was KEPT, and stripped of its profession claim.** It was the
  `respiratory` arrangement's config. It is now the openly fictional *"The Marvel Team —
  full worked example"*: same twelve people, six duties, two band gates, CPET skill gate,
  0.6 FTE contract, one day of leave and one honestly unstaffed slot, **byte-identical
  except its `label`**, and attributed to nobody. It was kept because it is the only fixture
  here that exercises all of that at once — and because ~40 assertions in
  `RosterView.demo.test.jsx` describe it, held by reference (`toBe`) and not by copy, so
  they still describe the fixture the app actually loads. Its cast was already Marvel, so it
  reads as the quick demo's bigger sibling rather than as a stray profession.
- **`DEMO_ARRANGEMENTS` is `DEMO_SHAPES`.** The word "arrangement" is what carried the error
  — one arrangement per department — so the correction is encoded in the name.
- **The shape list is in a deliberate order, and that is a decision.** The owner's "make the
  dropdown alphabetical" applied to a list of *professions*, where a reader arrives knowing
  the word they are looking for; that list still exists and is still sorted in code. Nobody
  arrives looking for the letter G in a list of five structures, so the shapes are ordered
  by kind — the five with an interview behind them first, the two fictional demos last —
  with an `<optgroup>` on each group so the ordering reads as structure rather than as
  somebody having forgotten to sort.
- **Both controls get the mobile treatment already established in that file**: native
  `<select>`, `text-base sm:text-sm` (iOS Safari zooms the page on any input under 16px) and
  `min-h-11` touch targets, from **one shared pair of class constants** so two controls
  cannot drift into two different touch targets.

- **Three hand-typed version literals replaced by `APP_VERSION_LABEL`.** All three were live
  on the deployed site at once, and all three were wrong:

  | File | Was on screen | Where a clinician saw it |
  |---|---|---|
  | `src/App.jsx` | `v1.41-OFFICIAL` | sandbox banner |
  | `src/components/WelcomeScreen.jsx` | `System v1.52` | landing footer |
  | `src/components/AdminPanel.jsx` | `System Database v1.4` | admin header |

  `package.json` said `1.12.0`. None of the three had any relationship to it, or to each
  other. All three now render `v1.13.0` and will follow every future bump without anybody
  remembering to look.

  **A judgment call the owner can reverse.** `AdminPanel.jsx` said "System **Database** v1.4",
  which could have meant a *schema* version rather than the app version. It is wired to the
  app version, because there is **no schema-version constant anywhere in this codebase** —
  so nothing would ever have moved a schema version either, and a second stale number is not
  an improvement on one. If the intent was a schema version, the fix is a real schema
  constant with something that maintains it, not a literal; say so and it changes.

### Notes

- **Why this is `minor` and not `major`, established by reading the write path rather than by
  reasoning about it.** The four-band split changed a *default* — `junior [7,12]` became
  `nonExempt [7,10]` + `junior [11,12]` — and a stored three-band `rules.bands` object would
  no longer validate as a partition. That is the fact that would have forced `2.0.0`, so it
  was checked directly: **`rules.bands` is never persisted.**

  - The only roster write in the app is `setDoc(doc(db, 'system_data', 'roster_2026'),
    prepared.data, { merge: true })` in `RosterView.jsx`, and `prepared.data` is
    `prepareRosterWrite`'s `generate(config)` **output** — dates mapped to shifts. The
    `config` itself, `rules.bands` included, never leaves the browser. `prepareRosterWrite`
    defaults to `generateRoster`, the V1 engine, which has no concept of bands.
  - The matching read, the `onSnapshot` on the same document, sets `rosterData` from
    `snap.data()` and reconstitutes no configuration.
  - Every band-carrying identifier in `RosterView.jsx` is `demo`-prefixed
    (`demoBandInputs`, `demoWizard.config`, `demoResult`), and `generateRosterV2` is called
    in exactly one place — inside the demo path, which is latched three times against ever
    reaching `setDoc`.
  - Nothing persists the wizard's config client-side either: the only `localStorage` keys in
    the app are theme, language and the AURA greeting date. No `sessionStorage`, no
    `indexedDB`.
  - Belt and braces regardless: `bandsOf(rules)` falls back to `DEFAULT_GRADE_BANDS` whenever
    `rules.bands` is absent or not a plain object.

  So no client already sitting in somebody's service-worker cache can be handed a document it
  cannot read. **This says nothing about Q8** (whether the 6 May shift-shape change should
  itself have been `2.0.0`), which remains open in `ROSTER_HANDOFF.md` and is not reopened here.

- **`mockData.js` stayed append-only where it had to.** `MOCK_STAFF`, `MOCK_STAFF_NAMES`,
  `MOCK_ROSTER`, `MOCK_PULSE_TRENDS` and `MOCK_TEAM_DATA` are byte-identical.
- **`mohAlliedHealth.js` was not edited.** The picker imports it read-only, and the tests
  check the dropdown against MOH's published list rather than against a count typed into a
  test file.
- **The engines were not touched.** `rosterEngineV2.js` and `auraEngine.js` are
  byte-identical, as is the pure mapper `rosterWizard.js`; live mode's wizard is unchanged
  and still pinned byte-for-byte by `RosterView.wizard.test.jsx`.
- **What the five deleted arrangements took with them, stated rather than discovered later:**
  they were the only *fixtures* reaching `requiresSkill` on a monthly recurrence,
  `forbidPairs`, task-scoped `windows` and a stated `maxHoursPerDay`. Every one of those
  engine fields still has its own unit tests in `src/utils/rosterEngineV2.*.test.js` and its
  own control in the wizard tables; the skill gate is still exercised through the worked
  example's CPET duty. What is gone is five inventions, not five capabilities.
- **What no test here can tell you:** whether five structures are enough for 28 professions.
  They are honestly attributed and adaptable, which is a different and much weaker claim
  than "they fit" — and it is the strongest claim available until somebody from a sixth
  profession describes their week.

### Known issues — documented, NOT fixed

These defects are diagnosed in writing and are **still present in the shipped code**.
They are listed here so that the existence of `ROSTER_POSTMORTEM.md` and
`ROSTER_QC_AUDIT.md` cannot be mistaken for the defects having been repaired. Ids are
traceable to those documents.

| Id | Severity | Defect |
|---|---|---|
| **D2/D3/D9** | High | **A mistyped availability window silently deletes a person from the roster.** A window whose dates fall outside the run makes that person eligible on zero dates — no error, no warning, no unfilled slot, because colleagues absorb the work. The engine already computes `neverRostered` and discards it: `measureRosterLoad` has no UI caller at all. One warning closes all three. `ROSTER_QC_AUDIT_PRIMITIVES.md`. |
| **D5** | Medium | The slot "needs skill" input is reachable but unusable for a typed-in team. |
| **D6** | Medium | The ESLint config disables `no-unused-vars` for the whole 6,824-line engine — the "passes by disabling things" failure. Two real findings sit behind it. |
| **D7** | Low | `compileQuota`'s comment contradicts the validator on `max: 0`. |
| **D8** | Low | The impossible-floor refusal ignores the hours model. |
| **Live iOS zoom** | Low | The live-mode wizard's two textareas are still `text-xs`, so live mode still zooms on iOS. Their class strings are pinned byte-for-byte by a test; four clinicians, desktop. |

*(**P0.7 is fixed** as of v1.11.0 — `npm run lint` runs, 76 files, 0 messages, and is a CI
gate after the test step. It had never worked before: no ESLint config had ever existed.)*

Additional lower-severity findings (C1/C3/C4 persistence and configuration drift,
D-series verification gaps, E1/E4 documentation overstatement, the swap modal's
unlabelled `<select>`s — an accessibility gap noted during P8.3) are recorded in
`ROSTER_QC_AUDIT.md`, `ROSTER_POSTMORTEM.md` and `ROSTER_TODO.md` and are likewise
**not** fixed. M12's session-level guard is client-side only; the durable guard is a
Firestore rule, blocked on decision **Q6** *(a decision; renamed from `D6` on 2026-08-14 — `D6` is now only the ESLint defect)*.

---

## [1.12.0] - 2026-08-12

Built for the phone, because that is where visiting colleagues will actually open it.

### Changed

- **The arrangement picker is one dropdown.** It was five stacked cards, each with its own
  Load button, description and warning block — a menu on a desktop and a wall of text on a
  phone, which pushed the form itself off the first screen. A native `<select>` is the right
  control precisely *because* it is native: iOS and Android render it as a full-height
  wheel, so five options cost one tap and no vertical space, and it is keyboard- and
  screen-reader-operable without any work. Only the chosen arrangement's description and
  caveat render, so the panel is a fixed three lines regardless of how many professions we
  support.
- **One behavioural consequence, stated rather than buried:** the respiratory arrangement's
  "this is not your service" caveat used to be readable *before* pressing anything, because
  all five options were expanded. It now arrives *with* the choice. The property that
  matters is unchanged and pinned by test — it is on screen from the moment the fixture
  loads, before anyone can read, draft or act on the roster it produced.
- **The staff-name placeholder is `e.g. Peter Parker`**, tying it to the Marvel names.

### Added

- **The Marvel Team, as the first option and deliberately the smallest thing here.** Every
  other arrangement demonstrates a constraint a real profession described. This one
  demonstrates only that the thing runs: five people, four ordinary weekday duties, no
  skills, quotas, windows or hours overrides. Verified by running the engine — **10 days, 24
  shifts, 0 unfilled, 0 warnings, nobody unrostered**, confirmed twice through an
  independent audit. Someone who opens the app on a phone in a corridor picks it, taps
  Draft, and sees a filled calendar on one screen.
- **A third provenance kind, `fictional`.** "Inferred" means *our best guess at your
  service, please correct it*; a Marvel team means no such thing. Folding it into `inferred`
  would have attached a correction checklist to a department that does not exist.

### Fixed — the mobile layout, against measured defects rather than guesswork

Measured by rendering the wizard and walking every element, before and after:

| | Before | After |
|---|---|---|
| Unconditional `overflow-x-auto` (wizard + result panel) | 3 | **0** |
| Focusable fields under 16px | 42–48 | **0** |
| Interactive elements with no minimum height | 111–114 | **0** |
| Band-ruler divider hit area | 24×40px | **44×44px** |

- **The tables no longer scroll sideways.** Below `sm:` each row becomes a stacked card —
  column name above the field, full width — and reverts to a table from `sm:` up. **CSS
  only, one DOM tree**: the `<table>` becomes `display:block`, `<thead>` hides, and column
  headings come from one frozen object read by both the `<th>`s and the in-card labels. A
  test asserts no `aria-label` in the wizard appears twice, which is what turns red if
  someone later "fixes" mobile by forking the row into a second card list that drifts.
- **iOS Safari no longer zooms the page on focus.** It does that to any input under 16px,
  stranding the user at 1.4× with the modal off-screen. Every focusable field is now
  `text-base sm:text-xs` via shared constants.
- **44px touch targets** on buttons, chips, toggles and fields, relaxed at `sm:` where
  density is wanted.
- **The wizard is full-screen below `sm:`** with safe-area padding for notches and a
  **sticky footer**, so Draft and Cancel are reachable without scrolling.
- **The month becomes a one-column list on a phone**, each row naming its own weekday.
  Seven columns at 375px is 48px per day — "EFT / Lead: Fadzlynn, Co: Derlinder" does not
  fit at any legible size, and shrinking further is the same unreadable grid in smaller
  type. Same shifts, same "not staffed" markers, same days.

### Notes

- **A dead-class discovery, flagged because it changes the desktop.** The drawers' `w-40`,
  `w-36` and `w-48` never applied: `CELL_INPUT` carries `w-full`, which Tailwind emits
  after the numeric widths. They are now `sm:w-40` etc., so mobile is unambiguously
  full-width **and those desktop widths work for the first time** — a change nobody asked
  for, which restores evident intent.
- **Recommendation, not shipped:** "my week" is the right *default* on a phone; the
  seven-column grid is a roster-builder's desktop affordance. Changing which view opens is a
  behaviour change, not a layout one, so the grid stays the default.
- **The live-mode wizard still has two `text-xs` textareas** and so still zooms on iOS.
  Their class strings are pinned byte-for-byte by a test; four clinicians on desktop, out of
  scope for this pass, stated rather than hidden.
- **What no test here can tell you:** jsdom paints nothing. Spacing at 375px, tap feel,
  whether the sticky footer seats flush, contrast of the new in-card labels, and dark mode at
  every breakpoint all need a human with a phone.

1554 tests (was 1525), **zero existing assertions changed** — the aria-label query idiom
held through a full layout rewrite, which is the point of it. Lint exit 0. Both engines, the
mapper and all five compatibility gates byte-identical.

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
  decision **Q6** *(renamed from `D6` on 2026-08-14; `D6` now means only the ESLint defect)*.

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
