# AURA Roster — Independent QC Audit of the Post-Mortem

**Auditor:** `qc-steward` · **Date:** 2026-08-05
**Targets:** `ROSTER_POSTMORTEM.md`, and claims repeated in `ROSTER_TODO.md`
**Source audited:** `main` @ `79e3b99` (the commit the post-mortem names).

> **Tree-state disclosure.** A concurrent agent is adding a test harness, so the working
> tree is not HEAD. Every claim about the *pre-existing* state — test files, `package.json`,
> `.github/workflows/deploy.yml` — was audited with `git show HEAD:<path>` / `git rev-parse
> HEAD:<path>` and is reported **as the committed state at `79e3b99`**. Where the working
> tree now differs, that is stated explicitly. `src/utils/auraEngine.js` and
> `src/components/RosterView.jsx` were verified **byte-identical to HEAD** (blob hash
> `9b854d3d…` and `5c96aba5…` respectively), so all Block A/B/C findings are unaffected by
> the concurrent work.

---

## Headline: the central claim (A1) is OVERSTATED, and the post-mortem's own remediation plan contradicts it

Block A1 states, in bold: **"The comparison can never be true."**

That is false as an absolute. `AuraPulseBot.jsx:355` compares `shift.staff` against a bare
identity. Whether that can succeed depends on **which version of the generator wrote the shift
in the live document** — and the pre-refactor generator wrote `staff` as a bare identity:

```
$ git show 48ac13c:src/utils/auraEngine.js     # 2026-05-06 16:25:41 +0800, i.e. 23 min BEFORE the refactor
                roster[dateKey].push({
                    staff: assignedStaff,      # <-- a BARE NAME, e.g. "Brandon"
                    task: taskName,
                    category: 'CORE',
                    week: w + 1
                });
```

So for any shift in `system_data/roster_2026` generated **before `2de3dde` (2026-05-06
16:48:20 +0800)**, `shift.staff === swapData.requestedBy` **matches**, the `.map()` rewrites
the entry, and `{ ...shift, staff: user.name }` writes a bare name back — which is exactly the
legacy shape, and which `RosterView.jsx:111`'s third clause (`shift.staff === user?.name`)
then reads correctly. **On a legacy document the swap flow actually works.**

The post-mortem does not merely omit this — **`ROSTER_TODO.md:113` (step P3.6) asserts it**:

> "Handle legacy documents: shifts written before 6 May 2026 have `staff` as a bare identity
> and no `lead`/`coLead`. Decide migrate-vs-tolerate."

The ledger and the post-mortem cannot both be right. The correct, defensible claim is scoped:

> *For any shift generated on or after `2de3dde`, `shift.staff` is a composite display string
> and the comparison at `AuraPulseBot.jsx:355` cannot match. Whether the live document
> contains post-refactor shifts is **not determinable from source** — it depends on whether
> "Generate Roster" has been clicked since 6 May 2026.*

**This must be marked LIVE-VERIFY PENDING, not asserted.** The single decisive check is one
Firestore read: open `system_data/roster_2026` in the Firebase console and inspect one shift
object. If `staff` reads `"Brandon"`, A1 is inert and the real bug is elsewhere. If it reads
`"Lead: Brandon, Co: Ying Xian"`, A1 is live as described. Until that read happens, the
post-mortem's closing sentence — *"a two-person distributed mutation has been failing silently
and confidently since 6 May 2026"* — is an unproven assertion about production state.

**Falsification paths I tested and rejected** (A1 is *not* wrong for these reasons):

| Candidate path | Verdict | Evidence |
|---|---|---|
| Demo mode data (`staff` = bare name) reaching the mutator | **Rejected** | `AuraPulseBot.jsx:100` — `if (isDemo || !user?.name) return;`. The listener never subscribes in demo mode, so no `ROSTER_ALERT` message is ever created, so the Accept button (`:1013`) never renders and `handleSwapResponse` is unreachable. Independently, the mutator reads Firestore (`:346-347`), never the demo state built in `RosterView.jsx:45-59`. |
| A user whose `name` is itself a composite string | **Rejected** | `TEAM_DIRECTORY` (`src/utils/index.js:22-103`) holds ten single-token names. |
| The demo→live toggle carrying demo data into the mutator | **Rejected for A1** | The demo path never writes Firestore. (It *does* create a separate critical defect — see **M1** below.) |

---

## 1. Verdict table

### Block A — schema split-brain

| Claim | Verdict | Evidence that settles it |
|---|---|---|
| A1: `auraEngine.js:40` emits `staff: \`Lead: …, Co: …\`` | **CONFIRMED** | `auraEngine.js:40` verbatim. |
| A1: `requestedBy` is a bare identity, `RosterView.jsx:133` | **CONFIRMED** | `:133` — `requestedBy: user?.name \|\| user?.email \|\| 'Unknown User'`. |
| **A1: "The comparison can never be true"** | **OVERSTATED** | `git show 48ac13c:src/utils/auraEngine.js` writes `staff: assignedStaff` (bare name). Legacy shifts match. Contradicted by `ROSTER_TODO.md:113`. See headline. |
| A1: the quoted code at `AuraPulseBot.jsx:355` | **CITATION RIGHT, QUOTE ABRIDGED** | Actual line: `if (shift.staff === swapData.requestedBy && shift.task === swapData.originalTask) {`. The post-mortem's code block silently drops the second conjunct with no ellipsis. In a document about claims decoupled from evidence, presenting a trimmed line as a verbatim block is the wrong shape. |
| A1: `.map()` no-match is a silent no-op; `updateDoc` writes identical data | **CONFIRMED** | `:354-363`. `map` returns a new array; `updateDoc` with equal data resolves. |
| A1: swap doc flipped to `APPROVED` regardless (`:341`) | **CONFIRMED** | `:341-344`; `status: 'APPROVED'` on `:342`. |
| A1: hardcoded success string (`:370`) | **CONFIRMED** | `:370` verbatim, unconditional. |
| A1: "Two clinicians … **both see confirmation**" | **WRONG** | The requester is *never* notified of any outcome. `shift_swaps` is read in exactly one place (`AuraPulseBot.jsx:102-106`), keyed `where('targetStaff','==',user.name)`. `git grep requestedBy -- src functions` returns four hits, none of them a query. Only the accepter sees a confirmation. See **M4**. |
| A2: mutator writes `{...shift, staff: user.name}` (`:356`), leaving `lead`/`coLead` stale and destroying the display format | **CONFIRMED** | `:356`; `RosterView.jsx:111` / `:233` check `lead`/`coLead` first. |
| A3: swap doc records no role; `RosterView.jsx:132-140` | **CONFIRMED** | `:132-140` persists exactly `requestedBy`, `targetStaff`, `originalShiftDate`, `originalTask`, `reason`, `status`, `timestamp`. No role field. |
| A4: substring filter correct only by luck | **CONFIRMED** | `RosterView.jsx:298` — `.filter(name => !selectedShift.staff?.includes(name))`. The "Lynn"/"Fadzlynn" scenario is real. |
| A-RC2: `grep -rn "\.staff"` would have surfaced `:355` | **CONFIRMED** | `git grep -n "\.staff" HEAD -- src/` returns 21 hits including `AuraPulseBot.jsx:355`. |
| "Three of the four consumers were reconciled" | **CONFIRMED** | Four consumers: `RosterView` reader, `downloadICS` (`auraEngine.js:103`), `downloadCSV` (`:128`), `AuraPulseBot` mutator. `git diff 48ac13c 2de3dde` shows `downloadCSV` moved to `s.lead`/`s.coLead`; the mutator was untouched. |
| **Near-miss: "the defensive fallback hid the defect… had that clause been dropped, demo mode would have visibly broken"** | **WRONG** | Two independent reasons. (1) `RosterView.jsx:111` is `isDemo ? true : (…)` — in demo mode `isMyShift` is unconditionally `true` and the third clause is **never evaluated**; it is dead code on the demo path. (2) The demo transform sets `lead: event.resource` (`RosterView.jsx:53`) to the same bare name, so the **first** clause would match anyway. Dropping `\|\| shift.staff === user?.name` would not have broken demo mode and would not have surfaced the bug. What the clause actually protects is the **legacy live-document** path — which is the same fact that makes A1 overstated. |
| **Near-miss: "the ICS export … happens to want the display string, so the refactor improved it"** | **WRONG** | The refactor **broke** the ICS export. `SUMMARY` is an RFC 5545 TEXT property; `,` `;` `\` must be escaped. Actual emitted line: `SUMMARY:[EFT] Lead: Brandon, Co: Ying Xian` — the unescaped comma makes this a multi-valued property. Pre-refactor the value was `[EFT] Brandon`, comma-free and valid. See **M6**. |

### Block B — time and dates

| Claim | Verdict | Evidence |
|---|---|---|
| B1: `RosterView.jsx:38` ships `startDate: "2026-02-01"` | **CONFIRMED** | `:38` verbatim. |
| B1: 1 Feb 2026 is a Sunday | **CONFIRMED** | ```$ node -e 'const d=new Date("2026-02-01T00:00:00"); console.log(d.toString().slice(0,3), d.getDay())'``` → `Sun 0`. Cross-check: `$ date -j -f "%Y-%m-%d" 2026-02-01 "+%A"` → `Sunday`. |
| B1: `auraEngine.js:28` `for (d=0; d<5)` therefore fills Sun–Thu | **CONFIRMED** | Faithful replay of `:18-31`: `core d=0 → 2026-02-01 Sun`, `d=1 Mon`, `d=2 Tue`, `d=3 Wed`, `d=4 → 2026-02-05 Thu`. |
| B1: `VC (PM)` "+1" lands Monday, `VC (AM)` "+5" lands Friday | **CONFIRMED** | `VC (PM) off=+1 → 2026-02-02 Mon`; `VC (AM) off=+5 → 2026-02-06 Fri`. |
| **B2: "In any UTC-negative timezone every shift shifts one day earlier"** | **WRONG** | The producer is timezone-**invariant** for a `YYYY-MM-DD` input. `TZ=America/New_York` produces byte-identical keys to `TZ=Asia/Singapore`: both `2026-02-01 02 03 04 05 08 09 …`. Mechanism: `new Date("2026-02-01")` is parsed as **UTC** midnight; `setDate` uses local getters, so the local-offset error and the `toISOString` UTC-rendering error cancel *inside the producer*. Also verified identical under `TZ=UTC` and `TZ=Pacific/Kiritimati` (UTC+14). |
| B2: "correct only because the author is in `Asia/Singapore`" | **WRONG** | Same evidence. It is correct in every **fixed-offset** zone. The residual defect is narrower and different — see **M2** (DST). |
| **B near-miss: "producer and consumer disagree on method but agree on result in UTC+8 … two bugs annihilate each other in exactly one timezone"** | **WRONG** | They agree in *every* fixed-offset timezone. `RosterView.jsx:163` builds `${year}-${month+1}-${day}` from `currentDate.getFullYear()/getMonth()` plus a `1..daysInMonth` loop counter — **pure calendar arithmetic over no instant at all**, so it yields `2026-02-01…2026-02-28` in every timezone. There is no cancelling pair of errors; there is one robust consumer and one accidentally-robust producer. |
| B3: `RosterView.jsx:20` = `new Date(2026, 1, 1)`, six months stale | **CONFIRMED** | `:20` verbatim; today is 2026-08-05. |
| B4: `RosterView.jsx:104` mutates state in place | **CONFIRMED** | `:104` — `new Date(currentDate.setMonth(currentDate.getMonth() + offset))`. `setMonth` mutates before the copy. Day-31 overflow reasoning is sound. |
| Near-miss: `MOCK_ROSTER` uses 17–18 Feb 2026 (`mockData.js:47`) | **CONFIRMED** | `mockData.js:47` — `start: '2026-02-17T08:00:00'`. |

**Consequence for the remediation plan — flagged as a defect in `ROSTER_TODO.md`, not in the code.**
`ROSTER_TODO.md:67` (P1.1) proposes replacing all three `toISOString()` sites with **local**
`getFullYear`/`getMonth`/`getDate`, justified as *"closing the B-near-miss where two bugs
cancelled out."* Because the near-miss diagnosis is wrong, **the prescribed fix introduces the
very bug B2 falsely claims already exists**:

```
$ TZ=Asia/Singapore  node p11.mjs
  CURRENT  (toISOString):   2026-02-01 2026-02-02 2026-02-03 2026-02-04 2026-02-05 …
  AFTER P1.1 (local getters): 2026-02-01 2026-02-02 2026-02-03 2026-02-04 2026-02-05 …   P1.1 == CURRENT ? true

$ TZ=America/New_York node p11.mjs
  CURRENT  (toISOString):   2026-02-01 2026-02-02 2026-02-03 2026-02-04 2026-02-05 …
  AFTER P1.1 (local getters): 2026-01-31 2026-02-01 2026-02-02 2026-02-03 2026-02-04 …   P1.1 == CURRENT ? false
```

Every key moves one day earlier outside UTC+8, because `new Date("2026-02-01")` is UTC
midnight = 31 Jan 19:00 local. **P1.1 is only safe if it also changes how `startDate` is
parsed** — e.g. `new Date(y, m-1, d)` from the split string, so the instant is local midnight.
P1.1 as written does not mention that, and P1.5's acceptance test ("passes under
`TZ=America/New_York` and `TZ=Asia/Singapore`") would be written against the new behaviour and
would pass while shipping the regression. **P1 must not be accepted as written.**

### Block C — persistence and configuration

| Claim | Verdict | Evidence |
|---|---|---|
| C1: hardcoded `system_data/roster_2026` at `RosterView.jsx:67`, `:94`, `AuraPulseBot.jsx:346`; no path creates a second document | **CONFIRMED** | `grep -rn "roster_2026" src/ functions/` returns exactly those three hits, all string literals. |
| C2: `RosterView.jsx:94` `setDoc` without `merge`; modal at `:397` understates it | **CONFIRMED** | `:94` — `await setDoc(doc(db,'system_data','roster_2026'), newData)`. `:397` — "will overwrite the currently displayed schedule". |
| C3: `RosterView.jsx:36` hardcodes the pool; `utils/index.js:22` owns `TEAM_DIRECTORY`; `STAFF_LIST` derived; `RosterView` imports neither | **CONFIRMED** | `:36` verbatim; `utils/index.js:22` and `:105`; `RosterView.jsx:1-13` imports contain neither. |
| C3: "**Two** competing sources of truth" | **UNDERSTATED** | There are **four** hardcoded copies of the same four CEPs: `RosterView.jsx:36`, `utils/index.js:72-93` (`TEAM_DIRECTORY`), `SmartAnalysis.jsx:16-19` (with role **and job grade**), `StaffLoadChart.jsx:7-10` (colour map). A staffing change requires four edits, not two. |
| C4: no `firestore.rules` anywhere; `firebase.json` declares only hosting + functions | **CONFIRMED** | `find . -name "*.rules" -not -path "./node_modules/*"` → no output. `firebase.json` has exactly `hosting` and `functions`. |
| C4: client-side rewrite at `AuraPulseBot.jsx:361`; unguarded `addDoc` at `RosterView.jsx:132` | **CONFIRMED** | Both verbatim. |
| C4: `user?.role === 'admin'` at `RosterView.jsx:113` and `:239` are UI-only | **CONFIRMED in substance, one citation wrong** | `:113` is `user?.role === 'admin'`. `:239` is `user?.role !== 'admin'` (the `===` form is at `:241`). The conclusion holds. |
| **C2 near-miss: "has not yet destroyed a real swap only because A1 means no swap has ever written"; "the single most important ordering constraint"** | **OVERSTATED — the framing is wrong** | C2 is not latent. It is armed **today** by two paths that need no swap at all: **M1** (demo→live config poisoning, one click) and **M3** (`weeks` = `NaN`, one keystroke) both call `setDoc` with no merge and destroy the live document. The ordering constraint P2-before-P3 is still correct, but the stated reason — "C2 cannot fire yet" — is false, which makes C2 read as lower-urgency than it is. C2 should be **Critical**, independent of A1. |

### Block D — verification infrastructure (audited at HEAD)

| Claim | Verdict | Evidence (committed state at `79e3b99`) |
|---|---|---|
| D1: the two test files are byte-for-byte identical, 12,323 bytes each | **CONFIRMED** | `git rev-parse HEAD:src/components/Aura.utils.test.js HEAD:src/components/Aura.hooks.test.js` → **same blob** `07121b34308b04ad310de339f34af3cc168111a5` twice. `git cat-file -s` → `12323` both. `diff <(git show …) <(git show …)` → no output, exit 0. |
| D1: both import `./aura.hooks`; real file is `Aura.hooks.js` | **CONFIRMED** | `git show HEAD:…utils.test.js` line 25 → `} from './aura.hooks';`. `ls src/components/` → `Aura.hooks.js`. |
| D1: neither `vitest` nor `@testing-library/react` in `package.json` | **CONFIRMED at HEAD** | `git show HEAD:package.json` — `devDependencies` has neither. (Both are present in the working tree now, added by the concurrent agent.) |
| D1: no `test` script | **CONFIRMED at HEAD** | `git show HEAD:package.json \| grep '"test"'` → no match, exit 1. |
| D1: 608 lines of test code; `Aura.utils.js` is 368 lines with zero coverage | **CONFIRMED** | 304 lines × 2 = 608. `wc -l src/components/Aura.utils.js` → `368`. |
| D1: "not one assertion has ever executed" | **CONFIRMED in effect, overstated in form** | The evidence proves the suite **cannot** execute as committed (no runner, no script). "Has ever" is a claim about history that source cannot establish. Say "cannot execute as committed". |
| D2: 616 commits; `Update App.jsx` ×92, `AuraPulseBot.jsx` ×62, `index.js` ×43, `ResultPage.jsx` ×39 | **CONFIRMED exactly** | `git rev-list --count HEAD` → `616`. `git log --format=%s \| sort \| uniq -c \| sort -rn` → `92 / 62 / 43 / 39`. |
| D2: zero tags, no branches but `main` | **CONFIRMED** | `git tag -l` → empty. `git branch -a` → `main`, `remotes/origin/main`, `origin/HEAD`. |
| D2: "no change was ever reviewed before landing on `main`" | **CONFIRMED (as strongly as source allows)** | `git log --merges` → 0; `git log --grep='Merge pull request'` → 0. Consistent with no PR ever merged. Strictly this shows no *merge-based* review; a squash-merge or a review-then-direct-push would leave no trace. Minor overreach. |
| D3: `deploy.yml` exists, lint is `--max-warnings 0`, no test step, no bundle check | **CONFIRMED at HEAD** | `git show HEAD:.github/workflows/deploy.yml \| grep "npm test"` → no match. Lint script verbatim in `HEAD:package.json`. (The working tree now *has* a `Test Frontend` step — added concurrently.) |
| D3: PWA service worker exists | **CONFIRMED** | `public/firebase-messaging-sw.js`, 2,930 bytes. |

### Block E — documentation

| Claim | Verdict | Evidence |
|---|---|---|
| E1: `README.md:35` claims "predicted case volumes and specific skill-mix requirements" | **CONFIRMED** | `:35` verbatim, under "Pillar D: Auto Rostering". |
| E1: `AppGuide.jsx:28` claims "predicts case volumes and automatically routes the right skill-mix to the right wards" | **CONFIRMED** | `:28` verbatim, under `title: "Roster: Auto-Healer"`. |
| E1: `generateRoster` takes only `staff, tasks, startDate, weeks`; no volume/skill/grade/leave/ward input; pure `rotate` | **CONFIRMED** | `auraEngine.js:12-13`, `:22`; no other input anywhere in the function. |
| **E2: `RosterView.jsx` contains seven `alert()` calls at lines 78, 80, 96, 99, 129, 141, 150** | **CONFIRMED — seven is right, the earlier "five" was wrong** | ```$ grep -n "alert(" src/components/RosterView.jsx``` → `78 80 96 99 129 141 150`; `grep -c` → `7`. Identical at HEAD. Every line number is exact. |
| E2: `README.md:181` claims all native alerts were replaced with branded modals | **CONFIRMED** | `:181` — "…replaced all native browser alerts with secure, custom-branded confirmation modals." |
| E3: version-drift table — every row | **ALL FOUR CONFIRMED** | `HEAD:package.json` → `"version": "1.0.0"`. `README.md:1` → `# NEXUS: Smart Operations Dashboard v1.5 [BETA]`. `README.md:3` badge → `AURA-v2.3%20Engine`. `git tag -l` → empty (0 tags). `ls CHANGELOG.md` → No such file. |
| E3: `"@google/generative-ai": "latest"` unpinned, with trailing whitespace | **CONFIRMED** | `HEAD:package.json` — `"@google/generative-ai": "latest",` followed by four trailing spaces. **Still true in the working tree** despite `ROSTER_TODO.md:139` marking P5.1 `DONE`. |
| E4: `README.md:159` known-limitation entry | **CONFIRMED** | `:159` — "…does not currently validate if the new staff member exceeds consecutive working day limits." |

---

## 2. Assertions stated as fact with no `file:line` and no command output

| Where | Assertion | Status |
|---|---|---|
| B1 | "**1 February 2026 is a Sunday** (verified)" | True, but "(verified)" names no command. I supplied one. A post-mortem whose thesis is *claims decoupled from evidence* should not use the bare word "verified". |
| A1 impact | "Two clinicians can agree a swap, both see confirmation, and arrive on the wrong days." | Partly **false** (the requester is never notified — **M4**) and otherwise unevidenced: it is a claim about production behaviour with no Firestore read behind it. |
| A1 impact | "The `shift_swaps` ledger and the roster now disagree **permanently**." | Unevidenced. Nothing establishes permanence; a regeneration (C2) would in fact erase the roster side entirely. |
| Closing | "…has been failing silently and confidently **since 6 May 2026**." | Unevidenced and, per the headline, unknowable from source. Should be LIVE-VERIFY PENDING. |
| A1 | "the headline 'Auto-Healer' capability is **cosmetic**" | Depends on the same unresolved live-document question. |
| D1 | "608 lines of test code … not one assertion has **ever** executed." | Provable form: "cannot execute as committed". |
| D2 | "This is the GitHub web-editor default message." | Plausible, unevidenced. Harmless. |
| D2 | "no change was ever reviewed before landing on `main`" | Supported only by the absence of merges. Slight overreach. |
| D3 | "returning users can hold a cached client that reads a shape the new code no longer writes" | Plausible, but no evidence about the service worker's caching strategy was gathered. The SW file was not analysed. |
| C4 | "Whatever authorization exists lives only in the Firebase console" | Correctly self-limiting. **This is the one place the post-mortem models the right epistemic behaviour** — it should be the template for A1. |

## 3. Severity inflation, and root causes that are symptoms

- **Block B rated HIGH as a unit.** B1 is genuinely high (every generated roster is on the
  wrong weekdays). B2 as *diagnosed* is not a defect at all in any fixed-offset zone, and in
  the actual `Asia/Singapore` deployment its real residual (DST, **M2**) can never fire.
  Bundling them hides that half the block is misdiagnosed. Split: **B1 = High, B2 = Low
  (correctness-by-accident, not a live defect for this deployment)**.
- **Block C's C2 rated High and framed as latent** — should be **Critical and armed**. See the
  C2 near-miss row and **M1**/**M3**.
- **A-RC5 "Silent-failure-shaped API" is not a root cause.** `Array.prototype.map` returning
  an unchanged array is correct, specified behaviour. This is a **detection gap** — the code
  never asserts on the result — which is already A-RC4. Listing it as a fifth root cause
  inflates the count.
- **A-RC4 "Success was asserted, not observed" is the deepest root cause of A1's *impact*, and
  it is ranked fourth of five.** The comparison bug makes the roster wrong; the unconditional
  success message at `:370` is what makes it *undetectable*, and it is a two-line fix
  available today with no clinical decision required. It is buried under three architectural
  root causes that are all blocked on user decisions.
- **A3 "This is the true root cause of A2"** — accurate and well argued. No objection.
- **D-RC2 "A browser-based editing workflow … explains D1, D2 and the absence of a rules file
  in one stroke"** is an inference about how the author works, stated as a root cause. It is
  probably right, but it is not evidence-backed and it is not actionable.

---

## Defects the post-mortem missed — ranked

### M1 · CRITICAL · One click destroys the live clinical roster and replaces it with demo data
`src/components/RosterView.jsx:43-72` + `:94` · `src/App.jsx:657` · `src/context/NexusContext.jsx:61`

The demo effect overwrites `config` with Marvel data:

```js
// RosterView.jsx:60-64
setConfig(prev => ({ ...prev,
    staff: MOCK_STAFF_NAMES,                                     // ['Steve','Peter','Charles','Jean','Tony']
    tasks: ["Avenger Protocol","Web Slinger Audit","Cerebro Scan","Shield Patrol"] }));
```

Leaving demo mode restores `rosterData` (the effect re-subscribes to Firestore) but **never
restores `config`**. There is no cleanup and no reset branch in the `else` arm.

**Failure scenario.** A clinician demos NEXUS to a stakeholder on the Roster page. They flip
the always-visible header toggle (`App.jsx:656-660`, `onClick={toggleDemo}`) back to LIVE.
`isDemo` is React state (`NexusContext.jsx:9`), so this happens **in-session with no reload**
and `RosterView` stays mounted. They open Configure — the staff textarea now shows
`Steve, Peter, Charles, Jean, Tony` and is editable again (`readOnly={isDemo}`, `:365`, now
false). They click **Generate Roster** → live branch → `setDoc(doc(db,'system_data',
'roster_2026'), generateRoster(config))` **with no `merge`** (`:94`) → the four CEPs' real duty
roster for the whole year is replaced by five Marvel characters running "Avenger Protocol",
and the user is told **"✅ AURA has generated a conflict-free roster."** (`:96`).

Precondition, stated honestly: `RosterView` must remain mounted across the toggle (a remount
re-initialises `config` from `:36`). The toggle is in the persistent header, so this holds
whenever the user is on the Roster page — the exact place they would be.

This is also the counter-example to the post-mortem's central ordering argument: C2 is not
waiting on A1 to become dangerous.

### M2 · HIGH (outside UTC+8 only) · The real `toISOString` defect is DST, not offset sign
`src/utils/auraEngine.js:31`, `:54`, `:69`

B2's mechanism is wrong (see verdict table) but there **is** a genuine timezone defect, with a
different trigger and a different blast radius. `new Date("YYYY-MM-DD")` is UTC midnight; in a
negative-offset zone the local wall-clock time is the previous evening, and `setDate` preserves
that wall-clock time across a DST transition — so the underlying instant crosses the UTC date
boundary mid-generation:

```
$ TZ=America/New_York node tzprobe.mjs 2026-03-02 4      # spans US spring-forward, 8 Mar 2026
producer keys:  2026-03-02 03 04 05 06 | 2026-03-08 09 10 11 12 | 2026-03-15 … | 2026-03-22 …
weekday of key:  Mon Tue Wed Thu Fri  |  Sun Mon Tue Wed Thu   |  Sun …        |  Sun …

$ TZ=Asia/Singapore node tzprobe.mjs 2026-03-02 4
weekday of key:  Mon Tue Wed Thu Fri  |  Mon Tue Wed Thu Fri   |  Mon Tue Wed Thu Fri | Mon Tue Wed Thu Fri
```

Week 1 is correct; **every week after the transition slides one day earlier**, so Friday 13
March has no core shift and Sunday 8 March has five. Verified asymmetric: the US fall-back
(`TZ=America/New_York`, start `2026-10-26`) produces correct keys — only spring-forward breaks
it. For `Asia/Singapore` (no DST) this can never fire, which is why the post-mortem's
"author-environment bias" instinct was right even though its mechanism was wrong.

### M3 · CRITICAL · Clearing the "Weeks" field wipes the entire roster and reports success
`src/components/RosterView.jsx:356` → `:93-96`

```js
onChange={(e) => setConfig({...config, weeks: parseInt(e.target.value)})}   // :356 — no guard
```

`parseInt("")` is `NaN`; `for (let w = 0; w < NaN; w++)` never executes:

```
$ node -e '… generateRoster({…, weeks: parseInt("")}) …'
weeks=parseInt("") => NaN
generateRoster result = {}
keys: 0   => setDoc(ref, {}) with NO merge wipes the master roster
```

**Failure scenario.** The user selects the Weeks field to retype it, clearing it first. `config.weeks`
becomes `NaN`. They then adjust the start date and click **Generate Roster**. `generateRoster`
returns `{}`; `setDoc` with no merge replaces the document with an empty object; the alert says
**"✅ AURA has generated a conflict-free roster."** The calendar goes blank with a success
message. There is no minimum, no maximum, no `Number.isInteger` check, and no non-empty
assertion on the generated object before the write.

### M4 · HIGH · The requester is never told the outcome, and AURA claims a notification that does not exist
`src/components/AuraPulseBot.jsx:102-106`, `:378`

`shift_swaps` has exactly one reader, and it only ever matches the *target*:

```js
where('targetStaff', '==', user.name), where('status', '==', 'PENDING')   // :104-105
```

`git grep -n requestedBy -- src functions` returns four hits — a message template, the
comparison at `:355`, another message template, and the `addDoc` field. **No query is ever
keyed on `requestedBy`.** So the person who asked for cover receives no notification when the
swap is approved or denied; their only signal is manually re-checking the calendar. On the
denial path AURA nonetheless states:

```js
`Got it. I have marked the request as declined. ${swapData.requestedBy} will be notified to find alternative coverage.`  // :378
```

There is no mechanism that notifies them. This is the same defect class as A-RC4 — a printed
claim with no implementation behind it — sitting in the branch the post-mortem treated as the
*working* one. It also falsifies A1's "both see confirmation".

### M5 · HIGH · The coverage request never surfaces: `onOpen` is not passed, and any new chat session silently discards it
`src/components/AuraPulseBot.jsx:112`, `:148`, `:156`, `:178` · `src/App.jsx:626`

```jsx
<AuraPulseBot isOpen={isAuraOpen} onClose={() => setIsAuraOpen(false)} user={user} />   // App.jsx:626 — no onOpen
```

The listener's only attempt to draw attention is `if (onOpen) onOpen();` (`:112`). `onOpen` is
`undefined`, so the guard turns it into a no-op: **the AURA panel never opens for an urgent
coverage request.** The message is appended to `auraHistory` and waits, with no badge and no
unread indicator anywhere.

Worse, three code paths *replace* the whole history array — `startSession` (`:148`),
`handleBackToGrid` (`:156`), `handleClearChat` (`:178`). Because the listener only reacts to
`change.type === 'added'`, a request consumed by the initial snapshot **will not be re-emitted
for the life of the subscription**.

**Failure scenario.** A coverage request arrives while the user has AURA closed. They later
open AURA, land on the persona grid, and pick a persona → `startSession` calls
`setMessages([greeting])` → the `ROSTER_ALERT` message and its `swapData` are destroyed. The
request stays `PENDING` in Firestore forever; the requester (per **M4**) is never told; nobody
covers the shift. Recovery requires a full page reload, which re-subscribes and re-delivers
the doc as `added`.

*(On the specific question of re-alerting on remount: `messages`/`setMessages` are
`auraHistory`/`setAuraHistory` from context (`:60-61`), which is `useState([])` in
`NexusContext.jsx:11` and not persisted, so reloads produce one alert per load rather than
accumulating duplicates. The dep array `[isDemo, user, setMessages, onOpen]` is effectively
stable — `setAuraHistory` is a stable setter and `onOpen` is `undefined` — so there is no
re-subscribe loop. The remount hazard is **loss**, not duplication.)*

### M6 · HIGH · The ICS export is malformed: unescaped comma, and no `UID`/`DTSTAMP`
`src/utils/auraEngine.js:100-106`

Actual emitted event:

```
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260201
SUMMARY:[EFT] Lead: Brandon, Co: Ying Xian
DESCRIPTION:Week 1 - CORE
END:VEVENT
```

Three RFC 5545 violations:

1. **Unescaped `,` in a TEXT property.** §3.3.11 requires `,` `;` `\` escaped in TEXT. An
   unescaped comma makes `SUMMARY` a multi-valued property; parsers variously truncate at the
   comma, reject the event, or import garbage. **The 6 May refactor caused this** — the
   pre-refactor value `[EFT] Brandon` was comma-free. This directly falsifies the
   post-mortem's near-miss claim that the refactor "improved" the ICS export; had the author
   actually re-imported the file, the schema change *would* have been caught here.
2. **No `UID`** (§3.8.4.7, REQUIRED). Without a stable UID, re-importing after a roster change
   creates a second copy of every shift instead of updating; there is no way to remove a
   cancelled shift from a subscribed calendar.
3. **No `DTSTAMP`** (§3.8.7.2, REQUIRED). Several clients reject events without it.

**Failure scenario.** A clinician exports the roster, imports to Apple/Google Calendar, sees
every shift titled `[EFT] Lead: Brandon` with the co-lead silently dropped. The roster is
regenerated; they re-import; they now have two overlapping sets of 88 events with no way to
tell which is current.

### M7 · MEDIUM · Both exporters emit `undefined` for every row in demo mode
`src/utils/auraEngine.js:104`, `:128` · `src/components/RosterView.jsx:51-56`

The demo transform builds `{ staff, lead, task, category }` — **no `week`, no `coLead`** — but
the CSV and ICS buttons (`RosterView.jsx:201`, `:204`) are enabled in demo mode and call the
same exporters:

```
CSV: 2026-02-17,undefined,AM Clinic (Ortho),Clinical,Steve,undefined
ICS: DESCRIPTION:Week undefined - Clinical
```

A stakeholder demo that ends in "let me export that for you" produces a file with the literal
string `undefined` in two of six columns on every row. The same shape-tolerance gap applies to
legacy live documents, which also lack `coLead`.

### M8 · MEDIUM · Neither `onSnapshot` has an error callback, so a rules denial fails silently
`src/components/RosterView.jsx:67` · `src/components/AuraPulseBot.jsx:108`

Both listeners pass only a next-handler. Given C4 (no `firestore.rules` in the repo, actual
rules unknown and unreviewable), a `permission-denied` is a realistic outcome — and it would
be **completely invisible**: `RosterView` shows an empty calendar indistinguishable from "no
roster generated yet", and the swap listener silently stops delivering coverage requests with
no error anywhere. Add the error callback and surface it. This compounds every other finding
by removing the one signal that would explain them.

### M9 · MEDIUM · The swap ledger is flipped to `APPROVED` before the roster write, with no rollback
`src/components/AuraPulseBot.jsx:341-364`, `:382-384`

`updateDoc(swapRef, {status:'APPROVED'})` (`:341`) completes **before** the roster is read
(`:347`) or written (`:361`). The `catch` (`:382`) logs and shows "⚠️ Database error while
processing swap" but does not revert the status.

**Failure scenario.** The accepter's connection drops between the two writes. `shift_swaps`
records `APPROVED` with an `approvedAt`; the roster is untouched; the request no longer matches
the `PENDING` query so it never re-appears for anyone. This reproduces the post-mortem's
"ledger lies" outcome by a **second, independent mechanism** that A1's fix would not address —
A1 is presented as the sole cause of that divergence.

Two further silent no-op guards in the same block that the post-mortem's list of consequences
omits: `if (rosterSnap.exists())` (`:349`) and `if (currentRoster[targetDateKey])` (`:353`).
Either being false skips the entire mutation and still emits the unconditional success message
at `:370`. A date-key mismatch (see **M2**) or a prior regeneration lands squarely here.

### M10 · LOW–MEDIUM · CSV formula injection into a file designed to be opened in Excel
`src/utils/auraEngine.js:121-130`

The comment at `:122` states the intent — *"Dedicated Lead and Co-Lead columns for cleaner
Excel filtering"* — and no field is quoted or prefix-guarded. `config.tasks` is free text from
the wizard (`RosterView.jsx:375`). A task named `=HYPERLINK("http://…","OK")` or
`+cmd|'/c calc'!A1` is written raw and evaluated on open in Excel/LibreOffice. Comma injection
is blocked incidentally (the wizard splits on `,`), which is luck rather than escaping — the
same class of accident as A4. Also `:132` joins with `\n` where RFC 4180 wants `\r\n`, and
there is no UTF-8 BOM, so non-ASCII names would garble in Excel on Windows.

### M11 · LOW · Admin-initiated swaps are structurally guaranteed to no-op
`src/components/RosterView.jsx:113`, `:133` · `src/components/AuraPulseBot.jsx:355`

`user?.role === 'admin'` lets an admin open the swap modal on *anyone's* shift, but
`requestedBy` is hardcoded to the *clicking* user (`:133`). The mutator then searches for the
admin's own name in that day's shifts and finds nothing — so admin-brokered swaps can never
mutate the roster, even on a legacy document where staff-initiated swaps do work. This is a
distinct failure from A1 and survives A1's fix unless `requestedBy` becomes the shift's actual
owner.

### M12 · LOW · No duplicate-request guard
`src/components/RosterView.jsx:132`

`addDoc` is unconditional. Re-submitting the same swap creates N `PENDING` documents, each
producing its own `URGENT COVERAGE REQUEST` message on the target's next load, and each
independently acceptable. Accepting two for the same shift runs the mutator twice.

---

## Ledger audit — `ROSTER_TODO.md` contains four false `DONE` markers

The ledger opens with: *"an item is only `DONE` when the evidence column names an observed
behaviour or a pasted command output."* The **section-header `Status:` fields bypass that
rule** and contradict the ledger's own Evidence table.

| Ledger claim | Verdict | Evidence |
|---|---|---|
| `:74` — **P1 `Status: DONE`** (date correctness) | **FALSE** | `git rev-parse HEAD:src/utils/auraEngine.js` = `git hash-object src/utils/auraEngine.js` = `9b854d3d…` — **byte-identical to HEAD**. `grep -c toISOString src/utils/auraEngine.js` → **3** (P1's own acceptance criterion is "no `toISOString` remains"). No `toDateKey`, no `snapToMonday`. The Evidence table at `:163` correctly says `NOT STARTED`. |
| `:89` — **P2 `Status: DONE`** (non-destructive write) | **FALSE** | `RosterView.jsx` byte-identical to HEAD (`5c96aba5…`). `:94` still `setDoc(ref, newData)` with no merge; `:397` still says "the currently displayed schedule". The Evidence table at `:164` correctly says `NOT STARTED`. |
| `:59` — **P0 `Status: DONE`** (test harness) | **MISLEADING** | Its own Evidence rows say P0.5 `NOT DONE`, P0.6 `NOT DONE`, P0 acceptance `NOT VERIFIED`. Four of six steps done is not `DONE`. |
| `:139` — **P5.1 `DONE`** ("pin `@google/generative-ai`; strip trailing whitespace") | **FALSE** | `git diff package.json` shows no change to that line. Working tree still reads `"@google/generative-ai": "latest",` + four trailing spaces. |
| `:140` — **P5.2 `DONE`** ("reconcile 1.0.0 ↔ v1.5 ↔ v2.3; create `CHANGELOG.md`; first git tag") | **FALSE on all three** | `package.json` version still `1.0.0` (no diff). `README.md:1` still `v1.5 [BETA]`, `:3` badge still `AURA-v2.3`. `ls CHANGELOG.md` → No such file. `git tag -l` → empty. The parenthetical "(tag deferred)" covers only the tag. |
| `:95`, `:116`, `:131`, `:142`, `:171` — P3/P4/P5.4 `BLOCKED — awaiting decision D1–D7 in ROSTER_HANDOFF.md` | **UNVERIFIABLE — the document does not exist** | `ls ROSTER_HANDOFF.md` → No such file. Four blocking dependencies point at a file that has never been written, so no decision D1–D7 can be read, actioned, or audited. `ROSTER_HANDOFF.md` is also named as a source of truth in the `qc-steward` role definition. |
| `:161` — P0.6 evidence: "`.github/workflows/deploy.yml` unmodified" | **STALE** | `git status --porcelain` → ` M .github/workflows/deploy.yml`. A `Test Frontend: npm test` step is present in the working tree. Attributed to concurrent work, not to a false claim. **Caution for whoever commits it:** at HEAD there is no `test` script, and `npm test` against a missing script exits 1 (`npm error Missing script: "test"`, `EXIT=1`) — so `deploy.yml` and `package.json` must land in the **same commit** or every deploy breaks. |
| `:67` — P1.1 rationale ("closing the B-near-miss where two bugs cancelled out") | **BUILT ON A FALSE PREMISE, AND THE FIX REGRESSES** | See the Block B evidence. P1.1 as written moves every key one day earlier outside UTC+8. Must not be accepted without also changing how `startDate` is parsed. |

The Evidence table itself is sound and honest — including its `NOT VERIFIED` rows and its note
about the API 529 interruption. The defect is that the per-section `Status:` headers were
updated ahead of the evidence and now contradict it, in the one document whose purpose is to
prevent exactly that.

---

## What I could not verify from source — LIVE-VERIFY PENDING

1. **Whether A1 is live.** Requires reading one shift object in `system_data/roster_2026`.
   *Steps:* Firebase console → project `idc-app-e0c59` → Firestore → `system_data` →
   `roster_2026` → expand any date key → read the `staff` field of the first array element.
   `"Brandon"` ⇒ legacy shape, A1 inert, swaps currently work. `"Lead: Brandon, Co: Ying Xian"`
   ⇒ A1 live as described. **Nothing about A1's impact should be recorded as fact before this.**
2. **Whether `user.name` values actually match `config.staff`.** The swap notification is exact
   string equality between `RosterView.jsx:36`'s first-name array and the `name` field of
   `users/{uid}` (`NexusContext.jsx:36`). A profile reading "Brandon Foo" makes
   `where('targetStaff','==',user.name)` match nothing and the request is never delivered —
   a failure *upstream* of A1 that no source reading can rule out. *Steps:* Firestore →
   `users` → each of the four CEP documents → confirm `name` is exactly `Brandon`,
   `Ying Xian`, `Derlinder`, `Fadzlynn`.
3. **The actual Firestore security rules** (C4) — console-only, as the post-mortem correctly says.
4. **Service-worker cache behaviour** (D3) — `public/firebase-messaging-sw.js` was not analysed
   by either the post-mortem or this audit.
5. **`npm test` / `npm run lint` exit codes** — not run, to avoid racing the concurrent agent
   mid-write. The ledger's `NOT VERIFIED` for P0 acceptance is the correct current state.

## Method note

Every `file:line` in `ROSTER_POSTMORTEM.md` was opened at HEAD. Date and timezone claims were
executed, not reasoned about, under `TZ=Asia/Singapore`, `TZ=America/New_York`, `TZ=UTC` and
`TZ=Pacific/Kiritimati`, with `generateRoster`'s key derivation replayed verbatim. Test-file
identity was established by comparing git blob hashes rather than by re-running `diff` on a
mutating tree. Nothing under `src/` or `functions/` was modified; `ROSTER_POSTMORTEM.md`,
`ROSTER_TODO.md`, `package.json`, `vitest.config.js` and the test files were not touched.
This file is the only thing written. Nothing was committed or pushed.
