# ROSTER QC AUDIT — PRIMITIVE LAYER, QUOTAS, COHORT WINDOWS, WIZARD, ARRANGEMENTS, ESLINT

**Auditor:** qc-steward (independent verification; no application source edited)
**Date:** 2026-08-12
**Scope:** the five uncommitted packages landed on top of `c42577d` (tag `v1.10.0`)
**Working tree at audit time:** 36 changed paths, all uncommitted

---

## 0. THE TREE IS GREEN — first line, as required

```
TZ=Asia/Singapore   npm test > /dev/null 2>&1; echo $?   ->  EXIT_SG=0
TZ=America/New_York npm test > /dev/null 2>&1; echo $?   ->  EXIT_NY=0
                    npm run lint > /dev/null 2>&1; echo $? ->  LINT_EXIT=0

Test Files  23 passed (23)      Tests  1522 passed (1522)     [identical in both TZs]
Start at 06:50:00 (SG) / 18:50:40 (NY)  — the run really did straddle the date line
```

`npm run lint` = `eslint . --ext js,jsx --report-unused-disable-directives --max-warnings 0`.
Real exit code captured separately from any pipe. It lints **76 files** (71 in `src/`, 1 in
`functions/`, 1 in `public/`) with **0 messages** — this is a real gate, not theatre.

---

## 1. VERDICT TABLE

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | PRIMITIVES: the refactor is faithful — a primitive layer replaces per-feature `if`s with no behaviour change | **CONFIRMED, with one undisclosed delta** | My own harness (not theirs): `git show HEAD:src/utils/rosterEngineV2.js` vs the working tree, **22,000 generated configs** across three generators spanning every pre-existing named feature. `generateRosterV2`, `validateRosterV2Config`, `auditHardConstraints`, `scoreRoster`, `measureRosterLoad` deep-compared. **0 substantive differences** (roster, unfilled, score, load, validation refusals all byte-identical). 233 distinct `unfilled` reason templates and 22 distinct validation-refusal templates reproduced exactly. Identical result under `TZ=Asia/Singapore` and `TZ=America/New_York`. **The delta:** in 21 of 22,000 configs the new engine emits **one extra warning** the old engine did not — see §2 |
| 2 | PRIMITIVES: five compatibility gates unchanged (174/149/128/89/89) | **CONFIRMED exactly** | `git diff --stat` is **empty** for all five: `rosterEngineV2.test.js` (174), `.grades.` (149), `.psych.` (128), `.slots.` (89), `.hours.` (89). Counts read from the vitest reporter, and they match the claim digit for digit |
| 3 | PRIMITIVES/WIZARD/ARRANGEMENTS: `auraEngine.js` byte-identical | **CONFIRMED** | `git diff --stat -- src/utils/auraEngine.js` empty |
| 4 | PRIMITIVES: 109 new tests | **CONFIRMED** | vitest: `rosterEngineV2.primitives.test.js (109 tests)`. (81 literal `it(` + parameterised cases — the 109 is the honest runtime count, not an inflated one) |
| 5 | QUOTAS: a `max` is HARD | **CONFIRMED** | `max:1`/run over 8 Saturdays with 4 staff → 4 filled, 4 unfilled, no person exceeds 1. `max:0` is *refused* (see defect D7 for the doc contradiction) |
| 6 | QUOTAS: a `min` is soft — preferred, then warned, **never** hard | **CONFIRMED** | Satisfiable-but-unreachable floor (Dee on leave for 7 of 8 Saturdays, `min:2`/run): **8 of 8 slots still filled, 0 unfilled, `auditHardConstraints` → `{ok:true,count:0}`**. The floor never cost a slot and never became a violation |
| 7 | QUOTAS: a satisfiable floor is actually satisfied | **CONFIRMED — counted myself** | 4 staff × `min:2`/run, 8 Saturdays: I tallied the finished roster independently → `Ann=2 Ben=2 Cai=2 Dee=2`. Labs arrangement, `min:2` per calendar month: I tallied per person per month → every one of 8 staff has exactly 2 in 2027-02 and 2 in 2027-03 (the two full months); nobody below floor |
| 8 | QUOTAS: an impossible floor is refused with correct arithmetic | **CONFIRMED — arithmetic checked by hand** | 4 staff × `min:3` over 8 Saturdays → refused: *"4 × 3 = 12 duties — but only 8 exist there (Sat runs on 8 dates needing 1 person each)"*. 12 and 8 are both correct. Also correct per-period: a weekly floor named `the week of 2026-09-07` and computed `2 × 3 = 6` vs `5` |
| 9 | QUOTAS: an unmet floor is warned with person, task, period, shortfall | **CONFIRMED, all four present** | *"Quota floor not met: **Dee** is short of **Task Sat's quota** — at least 2 Sat duties over the run — **in the run** (**0 of 2, 2 short**)."* Multi-period form names each period separately |
| 10 | QUOTAS: bad quota input is refused rather than silently counted | **CONFIRMED, better than claimed** | `scope:'region'` → refused *because it is declared and not implemented*; `scope:'banana'` → refused; `per:'fortnight'` → refused naming the valid set; `min>max` → refused; a **misspelled category** → refused naming the categories actually in use. No silent-ignore path found |
| 11 | COHORT WINDOWS: a person outside their window is never rostered | **CONFIRMED** | Two-block config: `Early` appears only 2026-09-07→09-18 (window 09-07→09-20), `Late` only 09-21→10-16 (window 09-21→10-18). Zero appearances outside either window |
| 12 | COHORT WINDOWS: a task-limited window does not leak | **CONFIRMED** | Window `{tasks:['Allowed']}` → 2 appearances on `Allowed`, **0** on `Other` |
| 13 | ARRANGEMENTS: embryology shows no cross-block appearance | **CONFIRMED — recomputed** | 72 weekend shifts, size histogram `{"3":72}` (every one exactly 3), **0** shifts that are not one-per-band, **0** mixed-team shifts, **0** appearances outside an admitting window. Block spans reproduce the claim exactly: `2026-09-12→2026-12-27` (32 distinct dates), `2027-01-02→2027-04-25` (34), `2027-05-01→2027-05-16` (6) |
| 14 | ARRANGEMENTS: the four-row results table | **CONFIRMED, every cell** | respiratory `ok=true, hard=0, unfilled=1, warnings=0` and the unfilled reason is verbatim the claimed *"2 qualified, 1 on leave, 1 already on this task"*; psychology `true/0/0/0`; embryology `true/0/0/0`; labs `true/0/0/1` and the one warning is the partial-April *"not judged there"* |
| 15 | ARRANGEMENTS: psychology signature (3rd Wednesdays, one principal, continuity) | **CONFIRMED** | Occurrences 2026-09-16, 10-21, 11-18 — all weekday 3, all ordinal 3. Distinct leads = `['Jean-Luc Picard']` for all three |
| 16 | ARRANGEMENTS: `DEMO_ARRANGEMENTS[0].config === DEMO_EXAMPLE_DEPARTMENT` by reference | **CONFIRMED** | `toBe`-style identity check passes in my own process |
| 17 | ARRANGEMENTS: the respiratory arrangement is labelled inferred-not-interviewed | **CONFIRMED, and done well** | `provenance:'inferred'` and a structured `correction` object — headline *"Not your service — an example to correct."*, body *"Nobody from Respiratory & Rehab has been interviewed yet…"*, plus a 5-item correction checklist. The other three carry `correction: null`. `RosterView.jsx` renders it in **two** places (picker `:2662`, loaded panel `:2067`) and deliberately keys off `correction` rather than `provenance` |
| 18 | WIZARD: nine engine fields now have surfaces | **CONFIRMED** | Driven through `buildDemoRosterV2ConfigFromTables` myself. Emitted config carries task `days, recurrence, leads, coLeads, slots, category, continuity, quota`; staff `fte, grade, maxPerDay, skills, unavailable, windows`; rules `bands, forbidPairs, maxConcurrentPerDay, maxConsecutiveDays, weeklyHours, maxHoursPerDay`. The resulting config generates |
| 19 | WIZARD: **"The stranded capability is closed"** | **OVERSTATED** | The file's own limits ledger (`rosterWizard.js:1768-1801`) names **six** still-unreachable capabilities, and the header names two more. See D4 |
| 20 | LINT: `npm run lint` works, exit 0, `--max-warnings 0` intact | **CONFIRMED** | Exit 0 verified separately from any pipe; the flag is present in the script that ran |
| 21 | LINT: "**Config**" — the report presents this as a configuration change | **OVERSTATED / INCOMPLETE DISCLOSURE** | The package also **edited 20+ application source files**, `functions/index.js`, `public/firebase-messaging-sw.js`, added `.eslintignore` (a second new file), and **added a lint gate to `.github/workflows/deploy.yml`**. All source edits verified behaviour-neutral (see §3) — but a package described as "a config" changed CI and a Cloud Function |
| 22 | Nothing committed, tagged or pushed | **CONFIRMED for this batch** | All 36 changed paths are uncommitted; 0 stash entries; `git log origin/main..HEAD` empty. **Caveat:** `HEAD=c42577d` and tag `v1.10.0` exist and *are* already on the remote — both dated 2026-08-12 01:35, i.e. the **previous** batch, four hours before these files' mtimes. Nothing from these five packages is in history |
| 23 | `firebase.json` and `firestore.rules` untouched | **CONFIRMED** | `git diff` empty for both. (Note: `firestore.rules` now **exists**, 56 KB — my own charter's claim that this repo has none is stale) |
| 24 | PDPA: no real patient or colleague data | **CONFIRMED** | All four fixtures use published-fiction casts, one per arrangement (Marvel / Star Trek / Austen / Holmes). No real name, grade or leave date observed |

---

## 2. THE 1% IN THE REFACTOR — found, characterised, and it is not a regression

I was told a 99%-faithful refactor of a constraint core is a disaster, so I hunted for the 1%.
There is a difference, in **21 of 22,000** configs. It is **strictly additive and strictly true**:

```
CONFIG (minimal repro, my seed 4033):
  task T0: slots [{requiresSkill:'SLEEP'}, {}]  +  task-level requiresSkill:'SLEEP'
  only ONE staff member holds SLEEP

OLD engine warnings: (none)
NEW engine warnings: "Task T0 needs 2 people holding skill SLEEP per day (slot 1, slot 2),
                      but only 1 person qualifies, so some of those slots cannot be
                      filled on any day."

roster    : IDENTICAL
unfilled  : IDENTICAL
score      : IDENTICAL
```

The trigger is **compound eligibility** — a slot list where the task-level `requiresSkill` and a
slot's own `band`/`requiresSkill` combine. Representing eligibility as an ordered AND-list is
precisely what lets the new engine *count* a compound requirement, so it now reports a structural
impossibility the old engine walked past. A second form appears for band × skill:
*"needs 2 people from the Senior band (AH13–AH14) holding skill SLEEP per day (senior slot 1,
senior slot 3), but only 1 person qualifies"*. Both are correct; I verified the arithmetic by hand.

**Verdict: the refactor is faithful, and this is an improvement.** But it is a behaviour change
that the PRIMITIVES report did not mention. Anyone holding a snapshot of `warnings` — or a UI that
renders warning counts — sees a new line. It should have been disclosed, not discovered.

**Reason strings did not degrade.** This was an explicit worry. Across 2,589 unfilled rows and
**233 distinct reason templates**, old and new are character-identical. Nothing became generic;
the specific tails (*"Ann would reach 8h on 2026-09-14, over their 8h daily limit (already on T2
4h)"*) all survive.

---

## 3. WHAT THE LINT PACKAGE ACTUALLY TOUCHED (undisclosed, then verified)

Five files outside `src/components` were changed by a package reported as "a config". I checked
every removed binding by hand because **`functions/` and `public/` are not covered by the test
suite** — a green tree proves nothing about them.

| File | Edit | Verdict |
|---|---|---|
| `functions/index.js:298` | removed `var isDemo = request.data.isDemo;` from `chatWithAura` | **SAFE.** `isDemo` survives at `:519`/`:622` in a *different* exported function; no reference remains inside `chatWithAura` |
| `public/firebase-messaging-sw.js:55` | removed `const urlToOpen = …` | **SAFE.** Zero remaining references; it was genuinely dead |
| `src/utils/index.js` | removed `Users`, `Settings`, `ShieldAlert` from the lucide import | **SAFE.** Zero remaining references. Had any been used in a nav array this would have been a white-screen `ReferenceError` at module load |
| `src/components/AuraPulseBot.jsx` | removed `Bot` import; `onOpen` → `onOpen: _onOpen`; `/^[,\s\-]+/`→`/^[,\s-]+/`; `/^[\*\-]\s/`→`/^[*-]\s/`; `"`→`&quot;` | **SAFE.** `Bot` unreferenced; both regex classes are semantically identical (`-` last in a class is literal, `*` is literal inside a class); `&quot;` renders as `"`. **Note this is the swap-mutator file** — the diff does not touch the comparison at `:355` |
| `.github/workflows/deploy.yml` | **added a `npm run lint` step to CI**, between test and build | Correct and desirable — but this is a **CI policy change** shipped inside "a config", and it will now fail the deploy pipeline on any future lint error |

No behavioural defect found in the lint package's source edits. The disclosure was the problem, not the code.

---

## 4. DEFECTS THESE PACKAGES MISSED — ranked

### D1 — A raw NUL byte makes `rosterWizard.js` invisible to `grep`. **Introduced by this batch.**

`src/utils/rosterWizard.js:1280:41` — `const key = [a, b].sort().join('<NUL>');`

The separator is written as a **literal 0x00 byte in the source**, not as `'\0'` or `' '`.

```
$ file src/utils/rosterWizard.js
src/utils/rosterWizard.js: data                 <-- not "text"

$ grep -c "export" src/utils/rosterWizard.js
                                                <-- prints NOTHING. rc=0. Silent.
$ grep -ac "export" src/utils/rosterWizard.js
64

$ git show HEAD:src/utils/rosterWizard.js | (count NULs)  ->  0    # this batch introduced it
```

**Concrete failure scenario.** The single rule that would have caught the swap-mutator split-brain —
this project's founding defect, and the rule written into my own charter as *"`grep -rn` the field
name across `src/` and list every hit"* — now returns a **false negative** for the wizard mapper:

```
$ grep -rln "forbidPairs" src/
src/utils/rosterEngineV2.js
src/components/RosterView.jsx
src/components/RosterDemoWizardTables.jsx
... 10 files ...
                    ^^^ src/utils/rosterWizard.js IS ABSENT — the file that parses,
                        validates and dedupes forbidPairs
```

A future engineer changing the shape of `forbidPairs` greps for consumers, gets 10 files, updates
all 10, and ships — having never been shown the mapper that builds it. That is the exact mechanism
of the 6 May 2026 split-brain, re-armed. `git diff` still renders text hunks (the NUL sits past
byte 8000, so git's binary heuristic misses it), which is *why* code review did not notice.

Behaviourally harmless — the key never reaches the UI — and a one-character fix (`'\0'`). Severity
is entirely about reviewability, which is why it ranks first.

### D2 — A mistyped availability window silently deletes a person from the roster.

`src/utils/rosterEngineV2.js` (window resolution, §0e/`windowsAdmit` `:1323`) + `src/utils/rosterWizard.js:335` (`createStaffWindow` — no coverage check)

A window whose dates fall entirely outside the run makes that person eligible on **zero** dates.
Nothing anywhere says so:

```
Ann's window: 2030-09-07 → 2030-09-30   (typo: 2030 for 2026)
run: 2026-09-07, 8 weeks

mapper.ok      = true      staffErrors = {}
engine ok      = true      unfilled = 0      warnings = []
APPEARANCES    = { Ben: 40, Cai: 40 }        Ann: 0
```

**Concrete failure scenario.** A roster master sets up a three-block rotation, fat-fingers one
year, generates, and publishes a roster in which a named member of staff — visibly present in the
staff table, not on leave, not band-excluded — does no work at all for eight weeks. There is no
error, no warning, and no unfilled slot to investigate, because the other two absorbed the work.

This is *not* a case the engine failed to think about: when **every** staff member is windowed out
of a task it refuses beautifully, naming each person's window and offering three fixes. It detects
the total case and misses the per-person one.

**The signal already exists and is thrown away.** `measureRosterLoad` returns
`neverRostered: ["Ann"]`, computed and correct — and `grep -rn measureRosterLoad src/ --include=*.jsx`
returns **no UI caller at all**. The data that would have caught this is computed on every
generation and rendered nowhere.

### D3 — Cohort windows are opt-in per person, and the asymmetry is never warned.

`src/utils/rosterEngineV2.js:1272` (documented) / `:1279` (`isStated(person.windows)` switches the model on globally) / `:3063` (`windows: []` *is* refused)

A person with **no** `windows` key is admitted by every window in the configuration. So:

```
TeamA: window 09-07→09-20      TeamB: window 09-21→10-31      Forgotten: (no windows)
-> Forgotten appears on 13 dates spanning 2026-09-07 → 2026-10-16, i.e. in BOTH blocks
-> warnings: 0
```

**Concrete failure scenario.** The embryology arrangement is *entirely* the claim "team A appears in
its four-month block and nowhere else". A new starter is added to that department in the wizard,
their window rows are left empty, and they are silently rostered across all three blocks — breaking
the one property the arrangement exists to demonstrate, with a clean bill of health on screen.

The engine already refuses the neighbouring degenerate case (`windows: []` → *"would make them
eligible for nothing at all"*), which shows the asymmetric case was simply not considered. A
one-line warning — "3 of 4 staff have availability windows; Forgotten has none and is therefore
eligible on every date" — would close both D2 and D3.

### D4 — "The stranded capability is closed" is not true, and the file itself says so.

`src/utils/rosterWizard.js:1768-1801` (the package's own limits ledger) and `:20-32` (header)

Nine fields *were* reached, verified in §1 row 18. But six capabilities remain unreachable, per the
package's own ledger, and two more per its header:

| Still stranded | Why it matters |
|---|---|
| `rules.quotas` — the **pooled category quota** | The ledger admits *"that is the sentence the medical-lab interview actually said"*. The labs arrangement therefore demonstrates a **simplification** of what that team asked for: one `task.quota` on a single "Saturday Bench", not a floor pooled across three weekend tasks |
| `task.temporal` | No "1st **and** 3rd Wednesday", no alternate weeks, no explicit date list, no task bounded to part of the run |
| `slot.role` | Trio `unfilled` lines read "principal slot" instead of "Witness" |
| window `label` | Three identical *"outside their cohort window"* sentences for three named blocks |
| quota `scope`, `per:'run'` | Refused rather than offered |
| **`staff.skills`** and **`task.requiresSkill`** | Header, `:20-32`: *"still NOT editable — there is no column and no drawer control for either"*. **Absent from the foot ledger.** This is the biggest one: the respiratory arrangement's headline demonstration (the one CPET slot the engine refuses to invent cover for) rests entirely on skills, and a user cannot create, edit or reproduce that on a team they typed in |

The ledger is unusually honest work. The **report to the orchestrator** is what overstated it.

### D5 — The slot "needs skill" input is reachable but unusable for any typed-in team.

`src/components/RosterDemoWizardTables.jsx:1506` (the input) vs `:1457` (the warning)

`slot.requiresSkill` has a real control. `staff.skills` has no column. So any skill typed there is
unsatisfiable, and the failure is a **whole-run engine refusal**, not a per-row error:

```
mapper.ok = true                      <- the wizard passes it through
ENGINE REFUSED: Task Trio's slot 1 requires skill CPET, which nobody in the staff
                pool holds. Check the spelling, or add the skill to whoever is
                competent.            <- "add the skill to whoever is competent" is
                                         advice the UI provides no way to follow
```

**Ranked low deliberately**: the UI prints an explicit warning in prose immediately above the
control (*"somebody in the staff pool has to hold it already, or AURA refuses the whole run… a team
typed in by hand has none, so leave the skill blank for them"*). This is a **documented sharp edge,
not a hidden trap** — genuinely good practice. It is still a control whose only reachable use is to
break the run, and the refusal's suggested remedy is impossible in the UI.

### D6 — ESLint disables `no-unused-vars` for the entire 6,824-line engine.

`.eslintrc.cjs:157-165`

```js
{ files: ['src/utils/rosterEngineV2.js'], rules: { 'no-unused-vars': 'off' } }
```

I re-ran ESLint with that override stripped:

```
src/utils/rosterEngineV2.js
   780:7   error  'BAND_ORDER' is assigned a value but never used
  5594:19  error  'weekday' is assigned a value but never used
✖ 2 problems (2 errors, 0 warnings)
```

The count and line numbers match the config's comment exactly — the disclosure is **honest**, and
both bindings are benign refactor residue (`BAND_ORDER` superseded by `Object.keys`; `weekday`
superseded by the temporal layer resolving occurrences before the day loop).

**The defect is the blast radius, not the two variables.** The single file this batch grew by
+3,684/−868 lines — the constraint core — is now the one file in the repo with no dead-code
guard. A primitive table declared, wired and never read would not be reported. The config marks
itself `TEMPORARY` and asks to be deleted; it should be, and the two lines fixed, before this
lands.

### D7 — `compileQuota`'s comment contradicts the validator on `max: 0`.

`src/utils/rosterEngineV2.js:2708` vs the validator

The comment justifies `isNonNegativeInt` thus: *"absent bounds become `null` rather than 0, **since
0 is a real ceiling ("nobody may take this")** and absence is not."* The validator disagrees:

```
max:0 -> REFUSED: "Task X's quota has max: 0 — it must be a whole number of at least 1.
                   A max of 0 would mean the work may never be staffed at all, so leave
                   it out instead."
```

Both behaviours are defensible; they cannot both be the rule. A future reader trusting the comment
will believe `0` is accepted. Documentation defect, no runtime impact.

### D8 — The impossible-floor refusal ignores the hours model.

`src/utils/rosterEngineV2.js:3745`

The arithmetic counts **date supply** (`dates × people-per-date`) and never consults `weeklyHours` /
`maxHoursPerDay`. A floor that is arithmetically fine on dates but impossible on hours is not
refused — it generates and warns:

```
task 8h, weeklyHours 8 (=> 1 duty/person/week max), floor min 2/week, 5 dates/week
-> ok=true, 12 unfilled, audit clean, and THREE warnings, including
   "asks for 160h of work but the team's contracted hours across 4 weeks total 64h"
   + a per-person unmet-floor line for every week
```

The outcome is honest and no hard constraint is violated, so this is a **characterisation gap, not
a bug**: the claim "an impossible floor is refused with the arithmetic" is true only for
date-impossible floors. Worth stating because a user reasonably reads the refusal as complete.

### D9 — `measureRosterLoad` is computed on every generation and rendered nowhere.

`src/utils/rosterEngineV2.js:6315`; no non-test caller in `src/`. Pre-existing, not introduced
here, but it is the exact signal that would have surfaced D2 (`neverRostered`), so it is now
load-bearing by omission.

---

## 5. WHAT A USER CAN STILL DO AND BE SURPRISED BY

1. **Mistype a year in an availability window and lose a colleague from the roster entirely** —
   no error, no warning, no unfilled slot. The roster looks perfect and one person does nothing
   for eight weeks. (D2)
2. **Add a person to a windowed department, leave their window rows blank, and have them rostered
   into every block at once** — silently breaking the block rotation the department exists to run.
   Meanwhile setting an *empty* window list is loudly refused. (D3)
3. **Type a skill into a slot's "needs skill" box and have the entire run refused**, with the
   engine advising them to "add the skill to whoever is competent" — which the wizard offers no way
   to do. The screen warns about this first, so they are surprised only if they read past it. (D5)
4. **Ask for the thing the medical-lab team actually asked for** — "at least two weekend duties a
   month, and the three weekend benches all count" — and find no control for it. The arrangement
   they are shown demonstrates a single-task approximation of their own sentence. (D4)
5. **Ask for "the 1st and 3rd Wednesday", alternate weeks, or a duty that only runs for part of the
   run**, and find the monthly control offers exactly one ordinal and one weekday. (D4)
6. **Read three identical *"outside their cohort window"* sentences** for three differently-named
   blocks and have to match them to people by name. (D4)
7. **Set a quota `max: 0`** expecting "nobody may take this" — the in-code documentation says it is
   a real ceiling; the engine refuses it. (D7)
8. **Set an hours-impossible quota floor** and get a generated roster with 12 unfilled slots rather
   than the refusal the equivalent date-impossible floor produces. (D8)
9. **Present the respiratory arrangement to the respiratory therapists.** This one is *handled* —
   `correction` renders in both the picker and the loaded panel, with a five-item "please correct
   this" checklist — but the owner should know the fixture's one weekend duty
   (`Weekend Acute Cover`) is an invented assumption that predates the honesty pass, and is on the
   correction list rather than removed.
10. **`grep` the codebase for a wizard field and be told it does not exist.** Not a user of the app
    — a user of the repo. (D1)
11. **Write `rules.scale` or a top-level `config.quotas` by hand and have it silently dropped.**
    Both are disclosed in the engine's own end-of-file ledger (`:6636`, `:6754`); neither is
    reachable from the wizard, so the exposure is hand-written/live configs only.

---

## 6. WHAT I COULD NOT VERIFY

- **"No other file touched" / "checksum-verified against session start"** (PRIMITIVES, WIZARD,
  ARRANGEMENTS). I cannot reconstruct three agents' session starts from one working tree. What I
  *can* say: the five compatibility gates and `auraEngine.js` are byte-identical to `HEAD`, and the
  per-package attributions are mutually consistent with `git diff --numstat`
  (`rosterEngineV2.js` 3684/868; `rosterWizard.js` 834/43 → 1801 lines, matching "1010 → 1801").
- **Anything requiring live Firestore.** No package here touches the client/Firestore boundary, and
  `firestore.rules` is unmodified — but the master-roster rewrite still executes in the accepting
  user's browser. Unchanged by this batch, still **LIVE-VERIFY PENDING** as a standing item.
- **On-screen rendering.** I verified the engine, the mapper and the fixtures directly, and read the
  JSX for the provenance panel and the slot-skill warning. I did not drive a browser; the 32
  `RosterView.reach.test.jsx` and 64 `RosterView.demo.test.jsx` cases that do are green in both
  timezones, and unlike previous batches I found no assertion among them that passes vacuously.

---

## 7. CREDIT WHERE IT IS DUE — because the previous two audits found the opposite

My last two audits found a red tree, 178 tests of unreachable capability, a coverage request that
reached nobody, and a UI printing a false claim about the feature it configured. This batch is a
different standard of work, and it is worth recording:

- **The refactor is genuinely faithful.** 22,000 independent configs, my harness not theirs, zero
  substantive differences — including 233 reason-string templates reproduced character for
  character. I expected to find the 1% and instead found an improvement.
- **Two pre-existing tests were edited, and both edits made the assertion stronger.**
  `RosterView.wizard.test.jsx:180` replaced a `queryByRole(/load example department/i)).toBeNull()`
  that had become **vacuous** — the string matched nothing in either universe — with three
  assertions whose presence in demo mode is separately pinned. The diff comment names the failure
  mode explicitly: *"the exact failure mode a 'this control is absent' test has"*. That is the class
  of defect I have been finding for two audits, caught and fixed by the authors before I arrived.
- **The engine refuses what it has not implemented.** `scope:'region'` is rejected *because* it is
  declared and unimplemented, rather than silently counted per person. A misspelled quota category
  is refused naming the categories in use. This is the direct opposite of the
  README/`AppGuide` pattern of claiming capability that does not exist.
- **Both new packages carry their own limits ledgers**, and every gap I found by probing was already
  named in one of them. The overstatement is in the **reports to the orchestrator**, not in the
  code or its documentation — which is a far better failure than the reverse.

---

## 8. RECOMMENDATION

**Do not commit as-is.** Four things first, none of them large:

1. **D1 — replace the literal NUL at `rosterWizard.js:1280` with `'\0'`.** One character. Until it
   is done, every grep-based review of that file silently lies.
2. **D2/D3 — one warning covering both window blind spots:** a person whose windows cover no date in
   the run, and a configuration where some staff have windows and others do not. The engine already
   refuses the all-staff case, so the machinery is there.
3. **D6 — fix `BAND_ORDER:780` and `weekday:5594` and delete the engine's `no-unused-vars`
   override**, as the config itself asks. The concurrency that justified it is over.
4. **Correct the WIZARD claim** from "the stranded capability is closed" to the file's own ledger,
   and disclose the additive-warning delta (§2) and the lint package's source/CI edits (§3) before
   any of this reaches `CHANGELOG.md`. Three of the five reports were accurate; the ledger must not
   inherit the two that were not.

D5, D7, D8 and D9 are follow-ups, not blockers. `ROSTER_TODO.md` is the right home for them —
I have not edited it, per instruction.

*No application source, `functions/`, or other `ROSTER_*.md` file was modified by this audit.
Nothing was committed, tagged or pushed.*
