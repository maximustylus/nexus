# ROSTER QC AUDIT — FOUR FOUNDATION PACKAGES

**Auditor:** `qc-steward` · **Date:** 2026-08-11 · **Tree:** uncommitted working tree on `main` at `83cc883`
**Scope:** HOURS MODEL + MULTI-SLOT SHIFTS (`rosterEngineV2.js`), MULTI-ASSIGNEE EXPORTS (`auraEngine.js`), DRAGGABLE BAND RULER (`RosterDemoWizardTables.jsx` / `rosterWizard.js`), `firestore.rules` PROPOSAL.

I re-ran everything myself. I did not edit `src/`, `functions/`, or any other `ROSTER_*.md`. I did not commit, tag, or push.

---

## THE HEADLINE, BEFORE ANYTHING ELSE

**The repository is RED and the CI deploy workflow will fail.**

```
$ TZ=Asia/Singapore npm test > /dev/null 2>&1; echo $?
1
$ TZ=America/New_York npm test > /dev/null 2>&1; echo $?
1

 Test Files  1 failed | 14 passed (15)
      Tests  4 failed | 1050 passed (1054)
```

`.github/workflows/deploy.yml:17` runs `npm test` **before** `npm run build` at `:20`, in the same job. A push of this tree stops at the test step; nothing builds and nothing deploys. This is not a warning — it is the state of the tree right now.

**And the second headline:** the hours model and multi-slot shifts — 1,722 added engine lines and 178 new tests — **cannot be reached from any surface of this application.** Not live, not sandbox. Evidence in defect **D1** below. Every behavioural defect I found in those two packages is therefore *latent*, and I say so in each entry rather than dressing a library-only defect as a live clinical break.

---

## 1. VERDICT TABLE

Legend: **CONFIRMED** = I reproduced it · **OVERSTATED** = true in substance, the framing claims more than the evidence · **WRONG** = falsified · **UNVERIFIABLE** = cannot be checked from this repo with these tools.

### 1a. Suite, gates, and provenance

| # | Claim | Verdict | Evidence that settles it |
|---|---|---|---|
| 1 | *(all four)* "No commit, no tag, no build." | **CONFIRMED** | `git rev-parse HEAD` = `83cc8830…`, unchanged. `git reflog -5` newest entry is `83cc883`, the pre-existing commit. `git tag --sort=-creatordate \| head -1` = `v1.8.1`, pointing at HEAD. `git rev-list --left-right --count origin/main...HEAD` = `0 0`. `git stash list` empty. No `dist/` rebuild (`dist/assets/index-BNucNCa6.js` is the pre-existing bundle). |
| 2 | *(RULES)* "`firebase.json`, `deploy.yml`, `vitest.config.js`, `package.json` … byte-unchanged", "no `firestore` section anywhere" | **CONFIRMED** | `git diff --stat -- firebase.json .github/workflows/deploy.yml vitest.config.js package.json` → **empty output**. `grep -n firestore firebase.json` → exit 1, no hits. |
| 3 | Compatibility gates untouched | **CONFIRMED** | `git diff --stat -- src/utils/rosterEngineV2.test.js src/utils/rosterEngineV2.grades.test.js src/utils/rosterEngineV2.psych.test.js` → **empty output**. All three still pass in full: 174 / 149 / 128, 0 failures. The pins were honoured, including the `SOFT_PENALTY_WEIGHTS` key-list pin that forced the `HOURS_SOFT_PENALTY_WEIGHTS` overlay (`rosterEngineV2.js:2223`). |
| 4 | *(RULER)* "Four pinned tests in `RosterView.demo.test.jsx` cannot survive this task, and I did not edit them" | **CONFIRMED, and it is the reason the tree is red** | `git status --porcelain` does not list `RosterView.demo.test.jsx`. The four failures are exactly the four named, identically in both timezones: `fills the tables from the fixture…` (383–386), `disables Generate and shows validateGradeBands' reason on a gap` (655), `refuses an overlap, and an emptied box…` (674), `moves the grade range shown beside a task's chips…` (696). All four die inside the `setBandBound` helper at `RosterView.demo.test.jsx:145` — `Unable to find a label with the text of: Junior band highest grade`. The RULER agent's reasoning that tests 655/674 are unsatisfiable is **independently confirmed** by my exhaustive reachability sweep (row 15). |
| 5 | Timezone independence | **CONFIRMED** | Identical result under `TZ=Asia/Singapore` and `TZ=America/New_York`: 1054 total, 1050 pass, the *same* 4 failures, same file. No date-key drift anywhere in 178 new engine tests. This is the post-mortem "timezone luck" lesson actually discharged. |
| 6 | Test counts: hours 89, slots 89, exports 29→56 | **CONFIRMED** | `vitest run --reporter=json`: `rosterEngineV2.hours.test.js` 89/89, `rosterEngineV2.slots.test.js` 89/89, `auraEngine.exports.test.js` 56/56 (`git show HEAD:…exports.test.js \| grep -c 'it('` = 29), `RosterView.wizard.test.jsx` 22/22 (HEAD: 8). File sizes as claimed: 1300 and 1324 lines. |
| 7 | *(all four)* "Concurrent agent in this working tree" | **CONFIRMED** | Four sessions wrote six tracked files plus two untracked. `rosterEngineV2.js` went 2327 → 4008 lines under **two** authors. Consequence stated in row 8. |
| 8 | Self-reported diff sizes | **OVERSTATED (all three that gave numbers)** | `git diff --numstat`: `rosterEngineV2.js` **+1722/−41** vs HOURS `+914/−15` plus SLOTS `+801/−30` = `+1715/−45`. `auraEngine.js` **+179/−13** vs EXPORTERS' claimed `+192/−22`. `auraEngine.exports.test.js` **+399/−9** vs claimed `+408`. Nobody's number matches the tree as delivered. Minor in itself; it matters because it shows each report measured against a baseline that no longer exists, which is also why row 9 matters. |
| 9 | *(HOURS)* Rule 4 proven — "32 identical, 0 different" | **CONFIRMED as a fact about a tree that no longer exists** | The HOURS run predates MULTI-SLOT landing in the same file, so it proves nothing about the tree as delivered. Only the SLOTS agent's second baseline, and my own run (row 10), speak to the file on disk. Not a defect — a provenance limit that must not be recorded as "additivity proven". |

### 1b. Additivity — my own measurements, not theirs

| # | Claim | Verdict | Evidence that settles it |
|---|---|---|---|
| 10 | `rosterEngineV2`: a config using none of the new fields produces output identical to HEAD's engine | **CONFIRMED — 36/36, measured by me** | I extracted `git show HEAD:src/utils/rosterEngineV2.js`, rewrote only its one import to point at `git show HEAD:src/utils/auraEngine.js`, imported both engines side by side, and compared `JSON.stringify` of `validateRosterV2Config` + `generateRosterV2` + `auditHardConstraints` + `scoreRoster` + `measureRosterLoad` per config. **36 identical, 0 different, over 36 comparisons** — including `scaling 3x1 / 4x4 / 9x6 / 12x8 / 6x10 (task-index wrap) / 20x4 (idle staff)`, `52 weeks (135 705 chars)`, the full department (skills + 0.6 FTE + leave + Saturday duty), `forbidPairs`, `maxConcurrentPerDay` at 1/3/5 and per-person, GRADES + `leadBands`, custom bands, monthly `recurrence`, `continuity`, 0.4 and 0.1 FTE pools, Sunday-start snap, leap-year February, year boundary, and 12 distinct invalid configs (reason strings compared byte-for-byte). |
| 11 | The new hours fields actually *do* something (control) | **CONFIRMED, after I fixed my own first control** | My first `staff.maxHoursPerDay` control came back IDENTICAL — because I had written a config the validator rejected for an unrelated reason ("`Task EFT requires skill CPET, which nobody in the staff pool holds`"), so both engines returned the same error. A non-binding control is a decoy; I replaced it. With 3 staff × 3 tasks × (1 lead + 1 co-lead) = 6 seats/day over 3 people, `A.maxHoursPerDay: 4`: HEAD fills all 9 shifts on day 1, LIVE reports **10 unfilled** and leaves T3 solo. `rules.weeklyHours`, `task.hours` and `slots` all diverge too. All four gates are load-bearing. |
| 12 | `generateRoster` in `auraEngine.js` is still byte-identical to HEAD's | **CONFIRMED** | `awk '/^export const generateRoster = /,/^};/'` on both files → 75 lines each, `diff` **empty**. Every `git diff -U0` hunk in `auraEngine.js` sits at line ≥ 858, i.e. inside the export section only. I additionally compared `Function.prototype.toString` of 13 other exports against HEAD: `validateRosterConfig`, `describeGenerationRange`, `prepareRosterWrite`, `buildShiftStaffLabel`, `toDateKey`, `snapToMonday`, `parseLocalStartDate`, `shiftRoleOf`, `readShiftIdentities`, `applyShiftSubstitution`, `planSwapApplication`, `resolveSwapSubject`, `findAppliedSwapShift` — **13/13 SOURCE IDENTICAL**. |
| 13 | *(EXPORTERS)* "ICS `SUMMARY` keeps its exact one- and two-person form" | **CONFIRMED** | `buildICS` byte-identical HEAD vs LIVE across 8 rosters (V1 4×4, V1 live defaults, V1 comma/quote names, V1 52 weeks, V2 solo lead, V2 lead+coLead, legacy bare-`staff`, empty). Control: a 3-assignee shift differs. RFC 5545 folding is applied to every line (`auraEngine.js:991` `foldICSLine`, used at `:1081`), so the longer `Also:` form cannot emit an over-75-octet content line. |
| 14 | *(EXPORTERS)* "**Rule 4 — additive**, proven over 70 comparisons" | **OVERSTATED — `buildCSV` is not additive** | `buildCSV` differs from HEAD for **every one of my 8 cases, including the empty roster**: the header goes `Date,Week,Task,Category,Lead,Co-Lead` → `…,Co-Lead,Assignees`, and every data row gains a 7th field. The prose says "appends a 7th column", which is accurate, but the *section title* is "additive, proven" and the report never flags this as a compatibility break. Every CSV the department has downloaded to date has six columns; any Excel template, macro or import that pins column count or header row breaks on the next download. That is a change to a user-facing artefact and belongs in the CHANGELOG, not inside a proof of additivity. |

### 1c. Ruler

| # | Claim | Verdict | Evidence that settles it |
|---|---|---|---|
| 15 | The ruler leaves no way to reach an invalid band configuration | **CONFIRMED — exhaustively** | I breadth-first explored the whole reachable state space from the shipped default, requesting every integer `−20…40` on each of the two dividers plus `NaN, ±Infinity, 12.5, '13', null, undefined, {}`, and re-validating with the engine's own `validateGradeBands` at every node. **45 reachable states, 45 unique, 0 invalid** — both for the ruler's model *and* for the underlying `bandInputs` state that Generate actually reads. Out-of-range divider indices (`−1, 2, 99, 1.5, NaN, null`) are all refused (`ok: false`, no patches). |
| 16 | A non-partition injected from elsewhere is recoverable, and the first deliberate move adopts what the ruler shows | **CONFIRMED** | I injected four hostile states and confirmed each: gap (`junior.max=10`) → `representsInputs=false`, state invalid, model valid, one no-op move emits `[["senior","min","11"]]` → state valid. Overlap (`junior.max=14`) → 3 patches → valid. Blank (`senior.max=''`) → 1 patch → valid. Off-scale (`junior.max=99, senior.max=120`) → 4 patches → `junior 7–15 / senior 16–16 / principal 17–17`, valid. The patch set is minimal and complete in every case, exactly as documented at `rosterWizard.js`. |
| 17 | *(RULER)* "no functional regression" from the four dead tests | **CONFIRMED** | The four tests pin *the six deleted number boxes*, not behaviour. 655/674 assert an invalid partition is **expressible** — which row 15 proves it now is not, so no implementation can satisfy both. `RosterView.wizard.test.jsx` §3 (`describe('demo mode: the band boundary ruler')` at `:353`) and §4 (`the band ruler as a component: callbacks and impossible input` at `:614`) do cover the same ground, 22 tests, all passing. **The four tests must be rewritten, not deleted quietly** — see D8. |

### 1d. Rules proposal

| # | Claim | Verdict | Evidence that settles it |
|---|---|---|---|
| 18 | "`system_data/roster_2026` generation is not admin-gated in the UI at all" — the biggest behaviour change | **CONFIRMED** | `grep -n "hasAdminAccess\|isAdmin\|role === 'admin'" src/components/RosterView.jsx` returns **no hit anywhere near** `handleGenerateClick` (`:447`), `executeRosterGeneration` (`:546`), the `setDoc` (`:575`) or the Generate button (`:1370`). The Configure button at `:813` is likewise ungated. Any of the ten directory members can rewrite the master roster today. |
| 19 | "`community_assessments` is written by unauthenticated members of the public" | **CONFIRMED** | `App.jsx:617-621` mounts `/individuals/{language,pathway,form,chat,result}` **above** the `(!user && !isDemo) ? <WelcomeScreen/>` gate at `:623`. `ConventionalForm.jsx:676`, `ResultPage.jsx:529/568/577` and `AuraChat.jsx` call `recordTelemetry`, which `addDoc`s to `community_assessments` (`telemetry.js:13`) and swallows its own error (`:17-19`, `return false`). Rules' `allow create: if isMember()` ends that telemetry silently. Correctly flagged as by-design in the file. |
| 20 | "`user?.role === 'admin'` is self-assignable" | **CONFIRMED** | `ProfileView.jsx:75` `updateDoc(users/{uid}, { role: cleanRole, … })`; `App.jsx:178` `setUser({ ...initialProfile, ...docSnap.data() })` merges the doc over the directory profile; `App.jsx:314` `hasAdminAccess = … \|\| user?.role === 'admin'`. Typing "admin" into your own Profile Role box unlocks the Admin Panel today. |
| 21 | "Benny and Ashik cannot log in at all" | **CONFIRMED in substance, citation WRONG** | `WelcomeScreen.jsx:102` is the domain gate (`if (!email.toLowerCase().endsWith('@kkh.com.sg')) throw`), and `:103` its message. **`:107` is the *directory* check (`if (!authorisedUser)`), not the domain check.** The wrong line is cited three times: `firestore.rules:129`, `firestore.rules.README.md:148`, `firestore.rules.README.md:688`. The trailing dot in `benny.loo.k.g.@` is real and correctly left un-guessed. |
| 22 | `rosterEngineV2.js:2193 toLocalDateKey` (`firestore.rules:224`) | **WRONG** | `toLocalDateKey` is at **`rosterEngineV2.js:857`** in the delivered tree and at **`:417`** at HEAD. Line 2193 is `SOFT_PENALTY_WEIGHTS`. The citation matches neither state — it was written against an intermediate mid-flight version of a file another agent was growing by 1,700 lines underneath it. `auraEngine.js:69 toDateKey` in the same sentence is correct. |
| 23 | Other cited lines | **CONFIRMED** | Verified by reading each: `RosterView.jsx:371` (roster `onSnapshot`) ✓, `:575` (`setDoc … {merge:true}`) ✓, `:644` (`canArrangeForOthers`) ✓, `App.jsx:313` (`ADMIN_EMAILS`, same two addresses as `adminEmails()`) ✓, `:314` ✓, `:617-621` ✓, `:623` ✓, `AuraPulseBot.jsx:484` (`updateDoc(rosterRef, {[dateKey]: shifts})`) ✓, `:557` (`setDoc(users/{user.id}, …)` — the directory-id keying) ✓, `WelcomeScreen.jsx:114-118` (`emailVerified`) ✓, `auraEngine.js:69` ✓, `FeedsView.jsx:60` (`comments: increment(1)`) ✓, `functions/index.js:621-622` (`likes`/`comments` initialised to 0) ✓. Two are off by a few lines: `App.jsx:174` for the merge (the merge is `:178`; `:174` is the `onSnapshot` call), `ProfileView.jsx:75` for the `role` write (`:75` is the `updateDoc(`; `role:` is `:77`). Immaterial. |
| 24 | "Field-level enforcement of a verified swap is not achievable in rules alone" — three reasons | **CONFIRMED** | All three hold. (1) `AuraPulseBot.jsx:484` writes the roster before `:506` flips the ledger to APPROVED — reversing it reintroduces post-mortem M9. (2) the swap id is an `addDoc` auto-id and is never sent with the roster write, so there is no path to `get()`. (3) `diff().affectedKeys()` returns a `Set` with no element accessor. The honesty here is correct and well argued. |
| 25 | "139/139 on the exact file on disk" | **UNVERIFIABLE — and it must be recorded that way** | No emulator suite is committed (the README says so at `:219`, deliberately). `firebase-tools` is not installed, `node_modules/.bin` contains no firebase binary, `@firebase/rules-unit-testing` is not a dependency, and the run was done "in a scratch directory". I cannot reproduce a single one of the 139 checks. This is precisely the post-mortem "decoy test suite" shape — 139 assertions that no future reader can re-run — and it is the reason defect **D3** got through: **the matrix has no case for a member deleting one date key.** Do not record "139/139" as verification; record "139 self-reported, unreproducible, and demonstrably incomplete". |
| 26 | *(rules file `:298`)* a member "cannot add a day, **cannot remove a day**, cannot touch two days in one write, and cannot blank the roster" | **WRONG on "cannot remove a day"** | See defect **D3**. The other three clauses hold. |
| 27 | *(rules file `:302` / README `:662`)* a member can vandalise one day "**attributably**" | **WRONG** | See defect **D4**. |
| 28 | *(README `:250-283`)* "T3/T4/T5 requester / **admin** / bystander approves → DENY" | **OVERSTATED** | See defect **D6**. An admin who is the `targetStaff` of a swap they themselves minted *can* approve it. |
| 29 | Demo/sandbox consequences of the rules | **CONFIRMED, and credited — the proposal found these, I did not** | B3 (unauthenticated live-feed read with no error callback — cited as `FeedsView.jsx:114`, the `onSnapshot` is one line later at `:115`; immaterial), B4 (`AuraPulseBot.jsx:550-553` sandbox writes the live pulse heat-map; denied, and the user sees the *misleading* `"⚠️ Could not sync your pulse log. Please check your connection and try again."` from the catch at `:571-575` — a permission denial reported as a network problem), B7 (`AuraPulseBot.jsx:829` writes `demo_${workload.target_collection}`, an **LLM-supplied collection name**; the `match /{unmatched=**} { allow read, write: if false; }` catch-all at `:975` is the right defence and case Z4 tests it). All three verified at source. This is good work and the proposal deserves the credit. |

---

## 2. DEFECTS THESE PACKAGES MISSED

Ranked by severity. Each carries a `file:line` and a concrete failure scenario.

---

### D1 — SEVERITY: HIGH (product). 1,722 engine lines and 178 tests that no user can reach.
**`src/components/RosterView.jsx:481`, `:575` · `src/utils/rosterWizard.js:530` · `src/components/RosterDemoWizardTables.jsx`**

`generateRosterV2` has exactly one non-test caller: `RosterView.jsx:481`, on the **sandbox** branch (`:454` — *"NO FIRESTORE, EVER"*). Live-mode generation goes through `prepareRosterWrite(config)` → `generateRoster` (**V1**) → `setDoc` at `:575`. So V2 never touches the team's real roster at all.

And the sandbox cannot reach the new features either. `buildDemoRosterV2ConfigFromTables` (`rosterWizard.js:530`) maps the wizard's tables to a V2 config; `grep -n "slots\|weeklyHours\|maxHoursPerDay\|\bhours\b"` across `RosterView.jsx`, `RosterDemoWizardTables.jsx` and `rosterWizard.js` returns **no field emission** — only two unrelated comments about "unfilled slots". There is no hours column, no `slots` column, no `weeklyHours` control.

**Failure scenario:** Alif reads "hours model" and "multi-slot shifts" in the CHANGELOG, opens the app to roster the Tuesday trio the department actually runs, and finds no control anywhere in either mode. The features are library-only. Both packages' reports describe an API and prove additivity; neither says "and nothing in this application can invoke it".

**Why this is the top finding:** it does not make either package wrong, but it changes what may be written in the ledger. These are *engine capabilities pending a UI*, not shipped features, and every behavioural defect below (D2, D5, D7) is latent for exactly this reason. Recording them as delivered would be the `README.md:35` "predicts case volumes and automatically routes the right skill-mix" mistake repeated verbatim.

---

### D2 — SEVERITY: HIGH (latent, fires on first UI wiring). The third assignee of a multi-slot shift is invisible to the app and cannot swap their own duty.
**`src/components/RosterView.jsx:611`, `:859`, `:875` · `src/utils/rosterEngineV2.js:3600` · `src/utils/auraEngine.js:454`**

This is the 6-May split-brain, third time, same species: **a producer taught a new shape, and one consumer left behind.** The EXPORTERS package taught `buildCSV`/`buildICS` about `assignees`. Nobody grepped `RosterView.jsx`.

- `rosterEngineV2.js:3600` emits a multi-slot shift with `staff: buildShiftStaffLabel(lead, coLead)` — **a two-name display string for a three-person shift.** Measured: `{"assignees":["A","B","C"], "lead":"A", "staff":"Lead: A, Co: B"}`. C is nowhere in `staff`.
- `RosterView.jsx:875` renders `{s.staff}` in the calendar cell. `grep -n assignees src/components/RosterView.jsx` → **zero hits.**
- `RosterView.jsx:611` and `:859` both compute `isMyShift = shift.lead === user?.name || shift.coLead === user?.name || shift.staff === user?.name`. `assignees` is not consulted.
- `auraEngine.js:454` `shiftRoleOf` reads only `lead`/`coLead`; `SHIFT_ROLES` (`:405`) is `['lead','coLead']`. There is no third role.

**Failure scenario.** Fadzlynn is the third assignee of Tuesday's `slots: [{},{},{}]` clinic. The calendar cell reads `Lead: Brandon, Co: Derlinder` — her name is not on her own shift. The button is `disabled` (`:865`) and rendered at `opacity-80`, so she cannot click it to request cover. If she asks Brandon to file it for her, `planSwapApplication` refuses with a **factually false** reason, which I reproduced verbatim:

```
plan for the THIRD assignee requesting cover:
{"ok":false,"reason":"Jun is no longer on the TRIO shift on 2026-02-02,
 so there is nothing to hand over.", …}
```

She *is* on that shift. The app tells her she is not.

---

### D3 — SEVERITY: HIGH (security). Any signed-in member can DELETE an arbitrary day from the master roster, and the rules file states the opposite.
**`firestore.rules:332-334`, and the claim at `firestore.rules:298`**

```
allow update: if isMember()
              && changedKeys().size() == 1
              && addsNoNewKeys();
```

`addsNoNewKeys()` is `request.resource.data.keys().hasOnly(resource.data.keys())` (`:233`). Remove one date key with `deleteField()` and: `diff().affectedKeys()` contains that one removed key → `size() == 1` ✓; the resulting key set is a strict **subset** of the prior one → `hasOnly` ✓. **Allowed.**

`firestore.rules:298` states a member "cannot add a day, **cannot remove a day**". The emulator matrix (`README:255-259`) has R4/R5 for *two days* and *inventing a new day*, and R7 for blanking the whole document — **no case for removing one existing key.** The mutation table's M01/M02 rows would not surface it either, because the deletion satisfies both surviving predicates.

**Failure scenario.** Brandon runs `updateDoc(doc(db,'system_data','roster_2026'), { '2026-02-03': deleteField() })` from the browser console on the deployed app. Tuesday the 3rd disappears from the master roster for all ten people. `RosterView`'s `onSnapshot` (`:371`) simply renders an empty day; there is no diff, no history, no notification, and — per **D4** — no record of who did it. The only recovery is an admin re-running Generate.

---

### D4 — SEVERITY: HIGH (security). The rules file claims one-day vandalism is "attributable". Its own `addsNoNewKeys()` makes attribution impossible.
**`firestore.rules:302` · `firestore.rules.README.md:662` · `firestore.rules:332-334`**

Both documents describe the residual risk as *"any member can rewrite one day, **attributably**"*, and the README calls it "the single biggest residual risk in the proposal".

Attributable to whom, by what? Firestore does not stamp a writer onto a document. The roster document has no author field: `AuraPulseBot.jsx:484` writes `{ [plan.dateKey]: plan.shifts }` and nothing else. And a member **cannot** add one, because `addsNoNewKeys()` forbids introducing any top-level key. The rule that limits the blast radius is the same rule that forecloses the audit trail.

**Failure scenario.** A day of the roster is wrong. Alif looks at `system_data/roster_2026` and finds a well-formed `2026-02-03` array with Brandon on all four duties and Derlinder removed. There is nothing in the document, nothing in the app, and nothing in Firestore's client-facing surface that says who wrote it or when. The word "attributably" is doing the work of a design that does not exist. **Delete the claim, or add a Cloud-Function write path that stamps an author** — which the proposal already recommends (`firestore.rules:307-312`) and which would fix D3 at the same time.

Related, and correct as stated: `changedKeys().size() == 1 && addsNoNewKeys()` also permits a member to replace any existing day with an arbitrary well-formed array — putting themselves on every duty, or blanking the day to `[]`. The README does name that one (`:657-666`).

---

### D5 — SEVERITY: MEDIUM (latent). An accepted swap leaves the departing clinician in the export, and the exporters' documented mitigation does not mitigate.
**`src/utils/auraEngine.js:482-490` (`applyShiftSubstitution`) · the claim at `src/utils/auraEngine.js:877-893`**

`applyShiftSubstitution` spreads `...shift` and rewrites `lead`, `coLead`, `staff`. It does not touch `assignees` — correctly, since changing the swap contract was out of scope. The EXPORTERS report presents this as handled: `shiftAssigneeNames` reads `lead`, then `coLead`, then `assignees`, *"deliberately (see limit 1)"*, so that trusting `assignees` first "would put the DEPARTED person in the Assignees column".

Reading lead-first **reorders**; it does not **remove**. Measured, on a trio whose lead was swapped from `Prin` to `Cover`:

```
after lead swap: {lead:"Cover", coLead:"Sen", staff:"Lead: Cover, Co: Sen",
                  assignees:["Prin","Sen","Jun"]}
CSV  → 2026-02-02,1,TRIO,CORE,Cover,Sen,Cover; Sen; Prin; Jun
ICS  → SUMMARY:[TRIO] Lead: Cover\, Co: Sen\, Also: Prin\, Jun
```

`Prin` handed the shift over and is still published on it, in both formats, demoted from Lead to "Also".

**Failure scenario.** Derlinder covers Brandon's Tuesday lead. Brandon downloads the ICS into Outlook and gets a calendar event for a shift he no longer holds, listing him under `Also:`. The department's CSV shows four people on a three-person clinic. The comment at `:877-893` reads as a deliberate design decision that solved the problem; it changed the position of the bug, not its presence. **Either maintain `assignees` in `applyShiftSubstitution`, or state the limit as unmitigated.** It is the second, not the first.

---

### D6 — SEVERITY: MEDIUM (security). An admin can mint and then approve a swap that moves a colleague's duty onto themselves — and the README's test matrix reads as though they cannot.
**`firestore.rules:393-436` (create) and `:450-455` (update) · `firestore.rules.README.md:272`**

The create rule's ON-BEHALF branch requires `isAdmin() && initiatedBy == myName()`, and constrains only `targetStaff != requestedBy`. Nothing forbids `targetStaff == myName()`. So an admin may create:

`{ requestedBy: 'Brandon', targetStaff: 'Alif', initiatedBy: 'Alif', swapRole: 'lead', status: 'PENDING', … }`

The update rule then permits `status → APPROVED` for whoever satisfies `resource.data.targetStaff == myName()` — Alif. One actor, both sides.

The README's matrix row reads `T3/T4/T5 | requester / **admin** / bystander approves | DENY | DENY`, which a reader will take as "admins cannot self-approve". T4 evidently tests an admin approving *someone else's* swap. The self-minted case is untested and unmentioned.

**Failure scenario.** Alif takes Brandon's Thursday CPET lead without asking. `shift_swaps` — described in the file as "the audit trail for a change to somebody's working week", `delete: if false` — now holds an APPROVED document recording that Brandon's duty was handed over with Brandon's apparent participation. Nothing in the ledger distinguishes it from a consensual swap. This is not a privilege escalation (admins can write the roster anyway); it is a **forgeable audit trail**, which is worse in the one collection built to be unforgeable. Fix: `&& request.resource.data.targetStaff != myName()` on the ON-BEHALF branch, plus a matrix case.

---

### D7 — SEVERITY: LOW-MEDIUM (latent). A multi-slot shift's lead can be an ungraded clinician whenever no one on that shift has a grade.
**`src/utils/rosterEngineV2.js:2129` (`orderMultiSlotFills`), `:1656` (`gradeRank`), `:2498-2510` (the audit)**

The design is sound where grades exist. `gradeRankOf(null)` = `GRADE_UNKNOWN_RANK`, below AH7, so an ungraded person never outranks a graded one — verified: with `[NoGrade, Jun(AH7), NoGrade2]` on one trio, the AH7 leads (`{lead:"Jun", coLead:"NoGrade"}`). The audit rule `HARD_RULE_LEAD_GRADE` catches a hand-edited inversion — I forged `lead:'Jun'(AH7)` beside `Mid(AH10)` and got exactly one violation, correctly worded. `slots` is refused alongside `leadBands` and `continuity` with good reasons. Multi-slot lead selection **cannot be gamed by an ungraded person while any graded person is on the shift.**

The gap is the all-ungraded shift. With `[X, Y, Z]`, all ungraded, the engine emits `{lead:"X", assignees:["X","Y","Z"]}` and the audit reports **0 violations** — equal ranks are a tie, and a tie is legitimately not a violation. But the *warning* machinery has a hole: `rosterEngineV2.js:3037` only warns about ungraded staff for tasks with **at least one band-restricted slot** (`task.slots.some(entry => entry.band !== null)`). An all-ungated trio produces **no warning at all** (measured: `warnings: []`), so a department that has not filled in grades gets an arbitrary lead with no notice that the "highest grade leads" rule was vacuous.

**Failure scenario.** A department onboards through the (future) wizard without entering grades, generates, and the ward sees a named lead on every trio. The lead was chosen by the fairness tie-breaker, not by seniority, and nothing in `warnings` says so. The single-slot path warns by name in the equivalent situation; this path does not.

---

### D8 — SEVERITY: MEDIUM (process). Four dead tests, three ledgers, and nothing recorded.
**`src/components/RosterView.demo.test.jsx:145`, `:383-386`, `:655`, `:674`, `:696`**

The RULER agent followed repo rule 5 correctly — it stopped and reported rather than editing a file it was not authorised to touch. That was the right call and I want it on record. But the consequence is that **the tree as handed to me is red, and no ledger says so.** `git status --porcelain -- '*.md'` lists only the new untracked `firestore.rules.README.md`. `ROSTER_TODO.md`, `ROSTER_POSTMORTEM.md`, `ROSTER_HANDOFF.md` and `CHANGELOG.md` are all unmodified after four packages, 3,357 changed lines and 178 new tests.

**Failure scenario.** Someone picks this tree up tomorrow, runs `npm test`, sees 4 failures in a file none of the four reports is *about*, and spends an afternoon bisecting a working tree with no commits to bisect. Or worse: pushes, watches `deploy.yml:17` fail, and concludes the ruler is broken — when the ruler is the one package here I could prove exhaustively correct (row 15).

**What must be written down before anything is committed:** (a) the four tests are dead by design and need rewriting against the ruler — option (a) from the RULER report, not option (b), because keeping the six boxes forfeits the invariant row 15 establishes; (b) the hours model and multi-slot shifts are engine-only, per D1; (c) the CSV export gained a column, per row 14.

---

### D9 — SEVERITY: LOW (security). `feed_posts` accepts any *value* in `likes`/`comments`, while the comment subcollection beside it is tightly typed.
**`firestore.rules:784-785`**

```
allow update: if isMember() && changedKeys().hasOnly(['likes', 'comments']);
```

No `is int`, no lower bound. The `comments/{commentId}` block immediately below (`:800-806`) pins keys, types, a 5000-char cap and `timestamp == request.time` — so the asymmetry is not an oversight of style, it is one rule that forgot to do what its neighbour does. `functions/index.js:621-622` initialises both to `0`; `FeedsView.jsx:338/341` render `{post.likes || 0}` and `{post.comments || 0}`.

**Failure scenario.** A member writes `{ likes: -999999 }` or `{ comments: {…} }` to any post. React escapes the output so there is no injection, but the team feed renders garbage on a post the author cannot fix (`update` is restricted to these two keys, and `delete` to the author). The README's residual list says only "inflate a like or comment count *without limit*" — the type being unconstrained is a wider grant than that sentence describes. Fix: `&& request.resource.data.likes is int && request.resource.data.likes >= 0` and the same for `comments`.

---

### D10 — SEVERITY: LOW (security, post-deploy trap). A member who already typed "admin" into their Profile Role can never save their profile again.
**`firestore.rules:741-743`**

```
allow create, update: if isMember()
                      && (userId == request.auth.uid || userId == myId())
                      && (isAdmin() || request.resource.data.get('role', '') != 'admin');
```

On an `update`, `request.resource.data` is the **merged result**, so a `role` the caller is not touching still carries its stored value. Escalation to `'admin'` is correctly denied today (matrix case U6). But `ProfileView.jsx:75` is ungated **right now** (row 20), so a CEP may already have `role: 'admin'` sitting in `users/{uid}`. After the rules deploy, *every* subsequent profile save by that person is denied — name, bio, department, and the `fcmToken` write at `WellbeingView.jsx:52/:100` — and no rule can clear the field, because clearing it is itself an update whose merged `role`… is being replaced, so that one path does work. The user will not discover that.

**Failure scenario.** Brandon experimented with the Role box in June. In September he tries to fix a typo in his name and the save fails with a permission error he cannot act on. Nothing in the runbook's pre-flight (README §3) checks for a pre-existing `role: 'admin'` on a non-admin's document. **Add that to the pre-flight sweep**: read all ten `users/*` docs and clear any non-admin `role: 'admin'` *before* deploying.

---

## 3. WHAT I COULD NOT VERIFY — LIVE-VERIFY PENDING

These cannot be settled from source and must not be recorded as verified:

1. **Every one of the 139 rules checks** (row 25). No emulator, no committed suite, scratch-directory run. If the rules are to be deployed, the suite must be committed and re-run in this repo first — otherwise `firestore.rules` becomes the second `Aura.utils.test.js`: assertions nobody can execute.
2. **Whether production documents are shaped as the rules assume.** The README says this plainly at `:708-714` and it is the right flag. A legacy pre-6-May roster day (bare-`staff` shape), a `feed_posts` doc without `author`, or a `notifications` doc without `recipient` makes the referencing rule *error*, which Firestore treats as **deny**. Manual steps before deploy: as Alif, in the Firestore console, open `system_data/roster_2026` and confirm every date key holds objects with `lead`; open every `users/*` doc and check for `role: 'admin'` (D10) and for any renamed `name` that no longer matches `directoryNames()`.
3. **The swap round-trip across two signed-in users**, with and without D6's self-minted variant.
4. **`npm run lint` cannot be run at all** — pre-existing, not caused by these packages, but it means Phase 2's "lint clean" gate does not exist. `npx eslint . --ext js,jsx --max-warnings 0` exits **2**: *"ESLint couldn't find a configuration file… looked in /Users/…/nexus/dist/assets and its ancestors"*. There is no `.eslintrc*` in the repo, and the glob walks into the gitignored `dist/`. `package.json` advertises the script; nothing has ever run it.

---

## 4. WHAT I WANT TO SAY IN THE PACKAGES' FAVOUR

Because "report the uncomfortable finding" cuts both ways, and three of these are better than the tree they landed in:

- **Additivity is real and I proved it independently.** 36/36 on the engine, `generateRoster` byte-identical, 13/13 other `auraEngine` exports source-identical, `buildICS` byte-identical on 8 rosters, three untouched compatibility gates still green at 451 assertions. The one control that came back identical was **my** decoy, not theirs.
- **The hours model handles multi-slot correctly**, which is what I was sent to break. Three people on one 8-hour trio each accrue 8h (measured: a following 4h task is refused with *"A would reach 12h on 2026-02-02, over their 8h daily limit (already on TRIO 8h)"*, naming all three); a partially-filled trio emits a real `unfilled` entry per date with the binding person and number in the reason; `perDayDemand` counts `slots.length`; the audit re-derives daily and weekly hours off the finished roster with a shared `HOURS_EPSILON` (`:297`) so a roster the engine built cannot fail its own audit. I could not find a hole here.
- **`unmatchableAssignees` (`rosterEngineV2.js:2292`) is the right check.** A per-person loop would pass three seniors against `{principal, senior, junior}`; the bipartite matching does not. Somebody thought about the failure mode rather than the happy path.
- **The ruler is the strongest package in the set.** Row 15 is an exhaustive proof, not a sample, and the pure/component split is what made it possible to write. Its author also flagged the collateral test damage instead of quietly deleting it.
- **The rules proposal's honesty is its best feature.** It states three independent reasons a thing is impossible instead of shipping a rule that looks like it works; it removed a `resource != null` guard *because mutation testing proved it could not fail*; it split `get`/`list` on `wellbeing_history` because a single `allow read` silently re-opened the anonymous bucket to admins. It found four real pre-existing security holes I confirmed at source (rows 18–21) and self-reported every behaviour change including the misleading sandbox error string. D3, D4, D6, D9 and D10 are gaps in a genuinely careful document.

---

## 5. BOTTOM LINE

| | |
|---|---|
| Committed / tagged / pushed | **No.** HEAD `83cc883`, tag `v1.8.1` at HEAD, 0 ahead / 0 behind, no stash. |
| `firebase.json`, `deploy.yml`, `vitest.config.js`, `package.json` | **Untouched.** No `firestore` section anywhere. |
| Compatibility gates | **Untouched and green** (174 + 149 + 128). |
| Suite | **RED — exit 1 in both timezones.** 4 failed / 1050 passed / 1054. |
| CI | **Would fail at `deploy.yml:17`, before build.** |
| Additivity | **Independently confirmed** for the engine and for `generateRoster`/`buildICS`. **`buildCSV` is a format change, not an additive one.** |
| Deployable | **No.** Red suite; and the `firestore.rules` proposal has D3/D4/D6 open and zero reproducible test coverage. |
| Safe to record as "done" | **Not as written.** D1 (unreachable from any UI) and D8 (nothing in the ledger) must be recorded first, or `CHANGELOG` gains a capability the application cannot perform — the exact failure `README.md:35` already carries. |

*Nothing in this audit was verified by reading a diff and agreeing with it. Every row cites a command I ran or a line I opened. Where I could not verify — the 139 rules checks, production document shapes, the two-user swap round-trip — I said so rather than inferring it from a clean-looking file.*
