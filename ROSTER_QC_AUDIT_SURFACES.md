# ROSTER QC AUDIT — SURFACES BATCH (hours/slots wiring · calendar gaps + my-week + language · one-tap swap)

Audited by `qc-steward`, 12 Aug 2026. Three uncommitted packages against `HEAD = 9c355ff` / tag `v1.9.0`.
Nothing in `src/` or `functions/` was modified by this audit. Nothing was committed, tagged or pushed.

> ## ⚠️ DATED SNAPSHOT — read the status note before acting on anything here
>
> **Status pass 2026-08-14, against v1.13.0.** This audit is a snapshot of the tree named above,
> written in the present tense. Its findings are **not** edited when they are fixed — an audit
> whose conclusions get quietly revised is worth nothing as a record, and part of this set's
> value is that it caught its own author's diagnoses wrong more than once. So read it as
> history, and take today's truth from these three places instead:
>
> - **What is still broken:** the `### Known issues` table under `[1.13.0]` in
>   [CHANGELOG.md](CHANGELOG.md). That list is authoritative.
> - **What is live and what to click:** [ROSTER_HANDOFF.md](ROSTER_HANDOFF.md) §1.
> - **What changed since:** the release entries in [CHANGELOG.md](CHANGELOG.md).
>
> **Two things in here have certainly moved on.** *Test counts* — every figure quoted below was
> correct on its date; the suite is **1639 tests across 28 files** today, so treat any other
> number as a historical measurement, not a target. *The grade scale* — it had **three** bands
> (`junior` AH7–AH12) when this was written and has **four** since 2026-08-13
> (`nonExempt AH7–AH10 · junior AH11–AH12 · senior AH13–AH14 · principal AH15–AH17`), a
> correctness fix, because AH7–AH10 are non-exempt staff and AH11–AH12 are junior AHPs. Any
> three-band statement below is stale by that change alone. The ruler consequently has **three**
> dividers, not two.
>
> **Note on ids.** `D`n here means a **defect**. `Q`n in `ROSTER_HANDOFF.md` means an **open
> decision for the owner**. Both were once `D`n and collided at 5, 6, 7 and 8; the decisions were
> renamed on 2026-08-14 and these defect numbers kept, because they are cited in already-released
> CHANGELOG entries.


**The tree is GREEN.** `1204 passed / 1204`, 19 files, real exit code `0` under both
`TZ=Asia/Singapore` and `TZ=America/New_York` (measured with `> /dev/null 2>&1; echo $?`, not a pipe).

**But `npm run lint` cannot run at all — real exit code 2 — and has never been able to.** No
agent in this batch reported lint. See Defect 5. That is a Phase-2 deploy gate that is not merely
failing but absent, and the ledger must not record this batch as deploy-ready.

Two real defects are in the *new* code (Defects 1 and 2). Both are of the exact class this
project's post-mortem exists for: a printed claim that is false, and a surface that stopped
reaching the person it was built to reach.

---

## 1. Verdict table

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Suite green, real exit 0, both timezones | **CONFIRMED** | `TZ=Asia/Singapore npx vitest run` → `Test Files 19 passed (19) / Tests 1204 passed (1204)`; `TZ=America/New_York` → identical; both `EXIT=0` captured separately from any pipe. Start times differed (`01:09:03` vs `13:09:28`), so the zone really was applied. |
| 2 | REACHABILITY: "1090 passed / 1090" | **OVERSTATED (stale, not false)** | 1090 was true when that agent measured. Final tree is 1204. Its own reported diff no longer matches the tree — `RosterView.jsx` is now +1125, not +171. Read as a mid-batch snapshot, not a state of the tree. |
| 3 | SURFACES: "`HEAD` is `9c355ff`/`v1.9.0`, not `83cc883`; the handoff snapshot was wrong" | **CONFIRMED, and credit where due** | `git log --oneline -1` → `9c355ff`; `git tag --points-at HEAD` → `v1.9.0`; `git rev-list --left-right --count origin/main...HEAD` → `0 0`. The brief I was handed repeated the same wrong baseline. This agent caught it; I confirm it. |
| 4 | SURFACES: "1142 passed / 1142" | **CONFIRMED as a snapshot** | 1142 + SWAP's 62 new tests (29 + 27 + 6) = 1204. Arithmetic closes exactly. |
| 5 | Wizard-built config carries `hours` to `generateRosterV2` **and changes the roster** | **CONFIRMED — independently, not from tests** | `buildDemoRosterV2ConfigFromTables` → `generateRosterV2`, no hand-written config. Same tables twice: boxes blank → `rules` keys `["bands"]`, 0 unfilled. Boxes `weeklyHours:'16'/maxHoursPerDay:'8'` → `rules.weeklyHours=16`, **24 unfilled**, and `JSON.stringify(rosterA) !== JSON.stringify(rosterB)` → `true`. Engine's own reason came back naming the cap: *"Ann would reach 24h in the week of 2026-09-07, over their 16h weekly limit"*. |
| 6 | Wizard-built config carries `slots` through and produces >2 assignees | **CONFIRMED** | Mapper emitted `{"name":"TeamShift","days":[1],"slots":[{},{},{}]}` — and no `leads`/`coLeads`/`leadBands`, as the engine requires. Engine returned `assignees:["Ann","Bob","Cara"]` with `staff:"Lead: Ann, Co: Bob"` preserved byte-compatible. Control row without `slotMode` emitted `leads:1, coLeads:1`. |
| 7 | Hours cap interacts correctly with a multi-slot shift (all three accrue) | **CONFIRMED — this one is right** | 3 slots × 8h, `weeklyHours:8`: day 1 fills `[Ann,Bob,Cara]`, day 2 fills only `[Dan]`, 2 unfilled — i.e. **slot 3's occupant accrued hours too**, or Cara would have been reusable. Daily ceiling likewise: two 3-slot 8h tasks on one day with `maxHoursPerDay:8` → 2 unfilled, reason *"Ann would reach 16h on 2026-09-07, over their 8h daily limit"*. `auditHardConstraints` → `violations: []` on every run. Lead/co-lead control with the same caps → 0 unfilled, confirming the difference is the slots. |
| 8 | Read-back verification still precedes `APPROVED` | **CONFIRMED** | `RosterView.jsx:1419` `updateDoc(rosterRef, …)` → `:1422` `getDoc` → `:1424` `findAppliedSwapShift` → `:1432` bail if `!observedShift` → **only then** `:1449` `updateDoc(swapRef, {status:'APPROVED'})`. Success sentence quotes `observedShift.staff`, the document's own text. No success literal on any path. |
| 9 | A no-match leaves `PENDING` and reports failure | **CONFIRMED** | `:1410` `if (!plan.ok)` → `noteFailure(...)` → `return`, with no roster write and no ledger flip. `:1432` same for a failed read-back. `pendingCoverageRequests` (`rosterCoverage.js:115`) filters only on `answeredSwapIds`, and `markAnswered()` is called on no failure path — so a failed request stays visible **and** answerable. |
| 10 | Mechanical substitution unchanged | **CONFIRMED** | `git diff --stat -- src/utils/auraEngine.js` → **empty**. `planSwapApplication` / `findAppliedSwapShift` byte-unchanged; the view imports them read-only. |
| 11 | `swapRole` still recorded at request time | **CONFIRMED** | `submitSwapRequest` diffed function-by-function against `HEAD` → **IDENTICAL, 101 lines**. `swapRole: swapSubject.swapRole` at `:1262`, still refused rather than written null at `:1206`. |
| 12 | Legacy shapes still tolerated | **CONFIRMED** | `canAnswerCoverageRequest` (`rosterCoverage.js:155`) deliberately does *not* require `swapRole`. `readCoverageRequests` normalises `swapRole` with `SHIFT_ROLES.includes(...) ? … : null` — **the identical expression `planSwapApplication` applies at `auraEngine.js` line 30 of that function**, so handing it the normalised object instead of the raw doc is behaviourally identical. Legacy single-person shifts are still upgraded inside the locked helper (`isLegacy → SHIFT_ROLE_LEAD`). |
| 13 | Admin on-behalf still works | **CONFIRMED** | Request side: `submitSwapRequest` IDENTICAL, `initiatedBy` still conditional at `:1267`. Answer side: `describeCoverageArranger` (`rosterCoverage.js:202`) renders *"Arranged by X on Y's behalf"* and returns `null` for a self-request, so the pre-M11 shape stays byte-identical. |
| 14 | "A move, not a rewrite" | **CONFIRMED, and improved** | Diffed against `HEAD:AuraPulseBot.jsx handleSwapResponse`: same order, same helpers, same `DENIED`/`APPROVED`+`approvedAt` writes. The error handling is *better* — the old `catch` printed one message; the new one splits three truths on `rosterChangeVerified` (`:1470/:1476/:1482`), so a ledger-write failure after a verified roster write no longer says "nothing changed". |
| 15 | Both surfaces cannot fire for one request (no duplicate) | **CONFIRMED** | `grep -rn shift_swaps src/ --include=*.js*` (non-test): the only `onSnapshot`/`collection`/`query`/`where` on that collection is `RosterView.jsx:868`. `AuraPulseBot.jsx` imports no `onSnapshot`, `collection`, `query` or `where` at all. Plus `readCoverageRequests` collapses duplicate `docId`s, and `respondingRef` (`:1349`) latches synchronously ahead of state. |
| 16 | "…or can a request now reach NOBODY?" | **WRONG — the guarantee is broken.** | **See Defect 1.** `RosterView` is mounted only at `App.jsx:771` behind `currentView === 'roster'`; the old listener lived in `AuraPulseBot`, mounted unconditionally at `App.jsx:635`, and force-opened the panel from any view. There is no global badge (the bell reads `notifications`, not `shift_swaps`) and no Cloud Function trigger (`grep -rn shift_swaps functions/` → nothing). |
| 17 | Demo isolation: three latches intact and byte-identical | **CONFIRMED on substance, WRONG on wording** | `executeRosterGeneration` → **IDENTICAL, 51 lines**. Live `<textarea>` elements → **IDENTICAL**. `handleGenerateClick` → 19 added lines, **zero removed or modified**, all inside the `if (isDemo)` branch after the `return`-guarded latch. But `expectNoFirestoreTraffic` is **not** byte-identical — it gained four assertions (`query`, `where`, `getDoc`, `updateDoc`). That is a strengthening, not a regression; SURFACES' `IDENTICAL` was true when measured and SWAP then improved it. Call-sites 14 → **32**. |
| 18 | No new code path can write to Firestore in demo mode | **CONFIRMED** | Three independent latches on the new surface: no channel opened (`:866 if (isDemo …) return`), no panel rendered (`:1674 {!isDemo && …}`), and the responder itself refuses (`:1331`). Nine Firestore entry points now asserted uncalled in demo tests, `updateDoc` and `getDoc` — the two the swap path needs — among them. |
| 19 | Live mode untouched | **CONFIRMED** | `git diff --stat -- src/utils/auraEngine.js` → **empty**, so `generateRoster`, `prepareRosterWrite`, `validateRosterConfig` are byte-unchanged. `prepareRosterWrite` occurrences in `RosterView.jsx`: 6 at `HEAD`, 6 now. `executeRosterGeneration` IDENTICAL. Live wizard's two `<textarea>` blocks IDENTICAL. |
| 20 | Compatibility gates: `git diff --stat` empty on all five engine test files | **CONFIRMED** | Empty. Gates green at 174 + 149 + 128 + 89 + 89 = 629. `rosterEngineV2.js` also byte-unchanged. |
| 21 | Language pass broke no pinned string or aria-label | **CONFIRMED** | Every `aria-label` in the diff is an **addition**; none removed or reworded. `{s.staff}` still rendered verbatim (`:1781`); the third-assignee line is a *second* `<span>` (`:1790`), so `buildShiftStaffLabel`'s 23 characterization tests are untouched. Test relabels (`/^draft roster$/i`, `/ask .+ to cover/i`) are honest renames with the old wording documented in-place — no assertion was weakened. One stale *comment* remains (Defect 7). |
| 22 | Progressive disclosure hides nothing a validation error points at | **CONFIRMED for the errors the wizard raises** | `RosterDemoWizardTables.jsx:980` `forcedOpen = Boolean(rowErrors?.hours \|\| rowErrors?.slots)` — a row whose hidden cells are wrong refuses to fold. The row also prints `"9h per session · team of 3"` in the always-visible name cell (`:1009`). **But** it cannot force open for an error the wizard never raises — see Defect 2. |
| 23 | Unfilled slot in a cell survives a month change | **CONFIRMED — no bug** | `unfilledByDate` (`:1517`) is keyed on the engine's full `YYYY-MM-DD`; the cell looks it up with `getShifts(day).dateKey`, built from the current `year`/`month` (`:1500`). Paging months changes the key, so a September gap cannot render in October. `handleGenerateClick:1070` also jumps the calendar to `effectiveStart` via the engine's own `parseLocalDateKey`, so a snapped run does not open on an empty month. |
| 24 | My-week view leaks nobody else's duties | **CONFIRMED — no leak found** | `personRoleOnShift` compares with `===` on trimmed names via `readShiftIdentities` (imported, not reimplemented) — post-mortem A4's substring bug cannot recur. Live mode: `people={isDemo ? config.staff : null}` → `PersonRosterPanel:264` renders **no `<select>`** at all; the person is `user?.name`. Demo: entering demo clears `config.staff` to `[]` (`:777`), so the picker cannot list the four real clinicians from `LIVE_ROSTER_DEFAULTS`. `rosterScope` and `demoPersonChoice` both reset on every mode toggle (`:744-745`). `alongside` naming colleagues is intentional. |
| 25 | SWAP: "`AuraPulseBot.coverage.test.jsx` asserts that component calls `onSnapshot`/`collection`/`query`/`where`/`getDoc`/`updateDoc` **never**" | **OVERSTATED** | The assertions (`:114-119`) hold **on mount**, which is the property that matters and which I confirm. But `AuraPulseBot.jsx` still calls `updateDoc` at `:391` and `getDoc` at `:683` for unrelated features. The blanket phrasing "never, in both universes" is broader than the test. |
| 26 | Nothing committed, tagged, pushed; `firebase.json`/`deploy.yml`/`firestore.rules` untouched | **CONFIRMED** | `git log -1` → `9c355ff` (pre-batch). `git rev-list --left-right --count origin/main...HEAD` → `0 0`. `git diff --cached --stat` → empty. `git status --porcelain firebase.json firestore.rules .github/` → empty. No `dist/` rebuild (stale, 6 Aug). |
| 27 | Every exported engine capability now has a UI path | **NOT CLAIMED by any agent — and it is not true.** | See §3. Six capabilities remain unreachable. This batch closed `hours` and `slots`; it did not close the rest, and no agent claimed it did. Recorded so the ledger cannot later imply it. |

---

## 2. Defects these packages missed — ranked by severity

### Defect 1 — HIGH. A coverage request now reaches nobody unless the recipient happens to open the Roster tab. M5 is reopened.

`src/App.jsx:771` · `src/App.jsx:635` · `src/components/RosterView.jsx:856` · `src/App.jsx:106`

The listener moved from a component that is **always mounted** into one that is **conditionally
mounted**, and nothing replaced the interrupt.

```
src/App.jsx:635    <AuraPulseBot … />          ← inside floatingWidgets: mounted on every view
src/App.jsx:771    {currentView === 'roster' && <RosterView user={user} />}
```

The old listener not only ran everywhere, it called `onOpenRef.current()` to **force the chat panel
open** — that force-open *was* the M5 fix. The new listener is inside `RosterView`, so
`useEffect` at `RosterView.jsx:856` never subscribes while the user is on Dashboard, Feeds, Pulse
or Profile. There is no fallback:

- the header bell reads the `notifications` collection (`App.jsx:226`), never `shift_swaps`;
- `grep -rn shift_swaps functions/` → **no hits**, so no Cloud Function writes a notification or a push;
- `submitSwapRequest` writes only the `shift_swaps` document (`RosterView.jsx:1249`) — it does not also write a `notifications` doc.

`App.jsx:106-108` still says *"🛡️ M5: AuraPulseBot's coverage-request listener calls `onOpen()` to
force the panel open for an urgent shift swap"*. That listener no longer exists. The comment is now
a false record of a guarantee the code has dropped.

**Failure scenario.** Derlinder is unwell on a Thursday evening and asks Fadzlynn to cover Friday's
EFT clinic. `addDoc` succeeds and Derlinder is told *"Swap request sent to Fadzlynn."* Fadzlynn opens
NEXUS on Friday morning, lands on the Dashboard, checks her wellbeing check-in, and closes the app.
No listener ever ran. No badge, no bubble, no push. Nobody covers the clinic, and the person who
asked was told the request was sent. The old surface would have opened the chat panel in her face.

**What the packages did verify, and it is not this.** `RosterView.coverage.test.jsx` renders
`RosterView` directly, so the request is always on screen by construction. The mount condition that
decides whether it ever renders lives in `App.jsx`, which no test in this batch touches.

Note the trade was made deliberately and the reasoning at `RosterView.jsx:841-844` is sound — two
live listeners really would mean two Accept buttons. The defect is that removing the second surface
removed the only *notification*, and nothing was put back.

---

### Defect 2 — HIGH. The wizard prints "Hours are not being counted" while the engine is counting hours and refusing slots against an 8.4h day nobody typed.

`src/components/RosterDemoWizardTables.jsx:465` (the flag) · `:526` (the sentence)

```js
465:  const tracking = weekly.trim() !== '' || daily.trim() !== '';
526:  : `Hours are not being counted. Blank means blank — AURA will not apply the ${DEFAULT_WEEKLY_HOURS}h week shown above unless you type it.`
```

`tracking` reads **only the two department boxes**. The engine's hours model is opt-in *on mention*
of `rules.weeklyHours`, `rules.maxHoursPerDay` **or any `task.hours`** — and the paragraph three
lines above, at `:475-479`, says so correctly: *"Fill either one in (or give any task its own length
under **More…**) and it starts counting hours as well."* The status line directly beneath it
contradicts the paragraph above it, and the status line is the one that reads as the current state.

Measured, both department boxes blank, two people, three tasks on one day:

| task `hours` cell | `config.rules.weeklyHours` | shifts | unfilled | engine's reason |
|---|---|---|---|---|
| blank | absent | 3 | 2 | `1 at daily limit` (duty count) |
| `5` | absent | **2** | **4** | `Ann would reach 10h on 2026-09-07, over their 8.4h daily limit` |

The roster is different, the reasons name an hours ceiling, and the caption on screen says hours are
not being counted and that AURA "will not apply the 42h week … unless you type it". It applied
42 ÷ 5 = 8.4 without anyone typing it.

**Failure scenario.** A roster master fills the tables, opens **More…** on one task, types `5` because
a session really is five hours, and closes the drawer. The Working-hours caption reassures her that
hours are not being counted. She generates, gets four unfilled slots she did not expect, reads
*"over their 8.4h daily limit"* against two boxes that are visibly empty, and cannot tell whether the
app is broken or she is. The fix is one line: `tracking` must also consider whether any task row has
a non-blank `hours` cell.

---

### Defect 3 — MEDIUM. The wizard passes a task-hours value the engine then refuses outright, and there is no cross-field check.

`src/utils/rosterWizard.js:674` · `:920` · `:990` — surfaces at `src/components/RosterView.jsx:1011`

`parseTaskHoursCell` accepts anything in `(0, HOURS_IN_A_DAY]` — i.e. up to 24. Nothing compares it
against the daily ceiling the run will actually use, and `buildDemoRosterV2ConfigFromTables` assembles
`rules` at `:990` without a joint check. Measured with the department boxes **blank**:

| task `hours` | `parseTaskHoursCell.ok` | `build.ok` | `validateRosterV2Config` | `generateRosterV2.ok` |
|---|---|---|---|---|
| `8.4` | true | true | valid | **true** |
| `8.5` | true | true | **invalid** | **false** |
| `9` | true | true | **invalid** | **false** |
| `24` | true | true | **invalid** | **false** |

Same trap with the boxes filled: `weeklyHours:'40'`, `maxHoursPerDay:'2'`, task `hours:'4'` →
`hoursErrors: {}`, `taskErrors: {}`, `build.ok: true`, engine refuses. Slot mode is identical
(`hours:'9'` + three slots → refused).

The engine's message is *"Task Clinic takes 9h, which is longer than every staff member's daily
hours limit — the roomiest is Ann's 8.4h … Shorten the task, **raise maxHoursPerDay**"*. It names a
field the user left blank, whose effective value (8.4) appears on screen only as a grey `placeholder`
in the second box.

This is exactly what `rosterWizard.js:769-771` promises will not happen: *"It both refuses and maps,
because the two cannot be allowed to disagree: a cell the UI shows as fine but the mapper drops is
exactly how a leave date disappears."* Here the wizard shows the cell as fine and the engine drops
the whole run.

**Failure scenario.** Type `9` in a task's Hours box, leave both department boxes blank. Every cell
is clean, no row is flagged, **Draft roster** is enabled. Press it: the calendar goes blank and a red
banner says *"AURA did not generate a roster: Task Clinic takes 9h … raise maxHoursPerDay"*
(`RosterView.jsx:1011`). Because no `taskErrors.hours` was raised, `forcedOpen`
(`RosterDemoWizardTables.jsx:980`) stays false and the row remains **collapsed** — the refusal is not
attached to any row, and the input it is about is behind a chevron. This is the one case where the
brief's progressive-disclosure worry is real: the expander is correct for every error the wizard
raises, and this error the wizard does not raise.

---

### Defect 4 — LOW. The cover badge's explanation is unreachable: it is a `title` on a child of a `disabled` button.

`src/components/RosterView.jsx:1771` (the `disabled`) · `:1795-1803` (the badge)

The badge sits inside `<button disabled={!isMyShift && user?.role !== 'admin'}>`, and a shift you are
being asked to cover is by definition not yours, so for a non-admin the button is always disabled.
Browsers suppress pointer events on a disabled button's subtree, so the `title` — the only text that
says *"Answer it in 'Cover asked of you', above the calendar"* — never renders as a tooltip, and the
badge `<span>` carries no `aria-label` of its own while the disabled button is skipped in the tab
order. The comment at `:1757-1764` reasons carefully about *why* the Accept control is not here and
then hangs the explanation on the one attribute that cannot fire. The visible words
"Cover asked of you" still appear, so nothing is silent — only the instruction is lost.

---

### Defect 5 — MEDIUM (pre-existing, tree-level, unreported by all three agents). `npm run lint` cannot run.

`package.json:9`

```
$ npm run lint > lint.log 2>&1; echo $?
LINT_EXIT=2
ESLint couldn't find a configuration file.
ESLint looked for configuration files in /Users/…/nexus/dist/assets and its ancestors.
```

There is no `.eslintrc*`, no `eslint.config.*` and no `.eslintignore` anywhere in the repo, and
`dist/` is not excluded so ESLint walks into the build output first. The `--max-warnings 0` flag has
never been exercised. This is the decoy-test-suite pattern in a second place: a script that exists,
is named in the deploy gate, and has never executed. None of the three agents ran it — all three
correctly said "no build", but a Phase-2 record of "lint clean" for this batch would be a fabrication.
Not caused by this batch; recorded so it cannot be inherited silently.

---

### Defect 6 — LOW. A partially-staffed multi-slot shift renders as a normal shift plus a separate gap note, with nothing tying them together.

`src/components/RosterView.jsx:1727` (shift list) · `:1829` (gap list)

Measured: 3 slots × 8h with a tight cap emits a **real shift** carrying `assignees:["Dan"]` *and* two
`unfilled` entries for the same task on the same date (`no available staff for Big slot 2 … 1 already
on this task`). In the cell these render as two unrelated blocks: a blue `Big / Lead: Dan` button and,
below it, a dashed `Big · not staffed` note. Nothing says "this is the same shift, 1 of 3 filled".
The engine's own text is preserved on `title`/`aria-label`, so the information exists — but a reader
scanning the grid sees a staffed clinic and a separate mystery gap with the same task name.

---

### Defect 7 — LOW. Three stale comments now misstate facts, two of them about `firestore.rules`.

- `src/components/RosterView.jsx:2457` — still instructs *"then 'Generate Sandbox Roster'"*. The button says **Draft roster** after this batch's language pass.
- `src/components/RosterView.jsx:657` and `:1221` — both assert *"there is no `firestore.rules` in the repo"*. `git ls-files firestore.rules` succeeds: it is tracked, 979 lines, and mentions `shift_swaps` three times. It is an **inert proposal** (`firebase.json` has no `firestore` section, `deploy.yml` deploys `functions` and `hosting` only), so the *conclusion* — that no uniqueness constraint is enforced — still holds. The stated fact does not. This batch's own new comment at `:1443` gets it right ("the `firestore.rules` proposal that pins it to `['status','approvedAt']`"), which is what makes the two older ones read as contradictions.

---

## 3. Still unreachable: engine capability with no UI path

Enumerated from `grep -oE "rules\.[a-zA-Z]+|task\.[a-zA-Z]+" src/utils/rosterEngineV2.js`, then grepped
across `rosterWizard.js`, `RosterDemoWizardTables.jsx` and `RosterView.jsx`. `hours` and `slots` are
now genuinely reachable (verdict rows 5–7). These are not:

| Capability | UI path | Evidence |
|---|---|---|
| `task.continuity` | **none** | Only hit outside the engine is a prose comment, `rosterWizard.js:809`. No control, no mapper key. The engine implements a lead comparator, a `warnings` entry and `score.breakdown.continuityBreaks` for it. |
| `task.recurrence` | **none** | Only hit outside the engine is a comment, `rosterWizard.js:560`, which admits *"a monthly `recurrence`, which this wizard…"*. `recurrenceDatesBetween` is exported and unreachable. |
| `rules.forbidPairs` | **none** | `grep -rn forbidPairs src/` outside `rosterEngineV2*` → **zero hits**. Validated, audited (`auditHardConstraints:2417`) and enforced by the engine; nothing can set it. |
| `rules.maxConsecutiveDays` | **example fixture only** | `rosterWizard.js:825`, `RosterView.jsx:594` — both comments saying "the tables have no column for" it. Arrives only via `demoExtraRules` from **Load example department**. A typed-in team cannot set it. |
| `rules.maxConcurrentPerDay` | **example fixture only** | Same two comments, same path. |
| `staff.maxPerDay` | **none** | `rosterWizard.js:897` passes it through if a row already carries it; `RosterDemoWizardTables.jsx` has **0** hits, so no row can acquire one. |
| `task.category` | **fixture only** | Mapper emits it (`:968`); `RosterDemoWizardTables.jsx` has **0** hits. The calendar colours `VC` differently (`:1775`), so the capability is visible but not settable. |
| Live mode, all of the above | **none** | Live generation still runs V1 `generateRoster`; none of the V2 model reaches the real roster. `unfilledByDate` is demo-only by construction (`:1514`). |

Two of the brief's named items do not exist as engine features at all: there is no cohort-window and
no quota field in `rosterEngineV2.js`'s config surface. Do not let a ledger entry imply either was checked and found present.

---

## 4. What a user can still do and be surprised by

1. **Ask a colleague to cover, be told it was sent, and have nobody ever see it.** The recipient must independently choose to open the Roster tab. Nothing in the app tells them to. (Defect 1)
2. **Give one task a session length, be told on screen that hours are not being counted, and then get unfilled slots blamed on an 8.4-hour day they never typed.** (Defect 2)
3. **Type `9` hours for a genuinely long clinic, see every cell clean and Generate enabled, press it, and get a blank calendar and an instruction to "raise maxHoursPerDay" — a box they left empty, whose effective value is only a grey placeholder — while the row holding the offending number stays collapsed.** (Defect 3)
4. **See a shift staffed and a gap for the same task on the same day, and not learn they are one shift with one of three slots filled.** (Defect 6)
5. **See "Cover asked of you" on a shift in the grid, try to click it, and get nothing** — the button is correctly disabled, and the tooltip telling them where the Accept button actually is cannot render inside it. (Defect 4)
6. **Set a 4-hour longest-working-day and a 40-hour week** — mutually incoherent — **and have the wizard accept both**, because the two boxes are validated independently and never against each other. (Defect 3, same root)
7. **Look for continuity of care, a monthly clinic, "never roster these two together", or a per-person daily cap, and find no control** — even though `061ae93`'s subject line reads "grade bands, monthly clinics, continuity of care". The engine has continuity and recurrence; the UI has neither. (§3)

---

## 5. LIVE-VERIFY PENDING

Not verifiable from source; a human must do these against real Firestore with two signed-in accounts.

1. **The M5 reach regression (Defect 1).** Account A (Derlinder) sends a coverage request to account B (Fadzlynn). B signs in and stays on **Dashboard**. Observe: does anything at all indicate a pending request — bell count, badge, push? Expected from source: no. Then have B open **Roster** and confirm the "Cover asked of you" card appears. Record both.
2. **The accept round-trip.** B accepts from the roster card. Read `system_data/roster_2026` in the console and confirm the one day changed and only the one role swapped; read `shift_swaps/<id>` and confirm `status: 'APPROVED'` with `approvedAt`. Then confirm A's calendar reflects it.
3. **The M8 denial path.** Revoke read on `shift_swaps` in the console and confirm the card renders *"This card is empty because it could not be loaded — not because nobody has asked."* rather than an empty card.
4. **`firestore.rules` is still unenforced.** The rules live in the Firebase console and nobody in this repository knows what they are (`firestore.rules:13-14`). The master-roster rewrite still executes in the accepting user's browser. Nothing in this batch changed that, and nothing in this batch may be recorded as having secured it.
