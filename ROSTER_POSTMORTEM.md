# AURA Roster — Post-Mortem

**Scope:** the AURA Roster subsystem of NEXUS — `src/utils/auraEngine.js` (generator +
exports), `src/components/RosterView.jsx` (calendar, config wizard, swap request), and the
swap mutator inside `src/components/AuraPulseBot.jsx`.

**Date:** 2026-08-05 · **Author:** post-mortem pass over `main` @ `79e3b99`
**Status:** analysis complete (rev 2); remediation plans in [ROSTER_TODO.md](ROSTER_TODO.md).

> **Rev 2 — corrected after independent audit.** This document was audited by `qc-steward`
> ([ROSTER_QC_AUDIT.md](ROSTER_QC_AUDIT.md)), which found **one central claim overstated (A1),
> four claims outright wrong (B2 and three near-misses), several unevidenced assertions, and
> 12 defects this post-mortem missed — two of them CRITICAL and armed today.** Those
> corrections are folded in below and marked `[rev2]`. Most consequentially: **the B2 diagnosis
> was wrong, and the fix originally planned for it would have introduced the very bug it
> claimed to fix.** The original errors are left visible rather than quietly rewritten — a
> post-mortem whose thesis is *claims decoupled from evidence* has no business hiding its own.

---

## 0. Why this subsystem, and what "challenging" means here

AURA Roster is the only part of NEXUS that performs an **autonomous write to shared
operational state on behalf of a second user**. Everything else in the app is either a read,
or a write scoped to the person doing it (a pulse log, a feed post, a profile edit). The
roster swap flow is different in kind:

- User A clicks their own shift and creates a request.
- User **B's** browser receives it over `onSnapshot`, and — on B's click — **B's client
  rewrites the master roster document that governs A's working week.**

That is a distributed mutation with two humans, three components, one shared document, no
server-side arbitration, and no test coverage. It is the hardest code in the repo, and it is
where the defects clustered. The four commits that produced the current bug landed in a
**26-minute window** on 6 May 2026:

| Time (+0800) | Commit | File | What it did |
|---|---|---|---|
| 16:25:41 | `48ac13c` | `auraEngine.js` | precursor to lead/co-lead |
| 16:38:07 | `a643ab1` | `RosterView.jsx` | added swap engine → Firestore |
| 16:48:20 | `2de3dde` | `auraEngine.js` | **repurposed `staff` into a display string** |
| 16:51:53 | `79e3b99` | `RosterView.jsx` | updated ownership checks for lead/co-lead |

Three of the four consumers of the shift object were reconciled. The fourth was never
opened.

---

## BLOCK A — The schema split-brain (CRITICAL)

### A1. Accepting a shift swap does not change the roster

`src/utils/auraEngine.js:40` emits, for every shift:

```js
staff: `Lead: ${leadStaff}, Co: ${coLeadStaff}`,   // e.g. "Lead: Brandon, Co: Ying Xian"
```

`src/components/AuraPulseBot.jsx:355`, the mutator that runs when a colleague accepts
coverage, still asks:

```js
if (shift.staff === swapData.requestedBy && /* …&& shift.task === swapData.originalTask */) {
//     "Lead: Brandon, Co: Ying Xian"  ===  "Brandon"
```

`requestedBy` is written as `user?.name || user?.email` at `RosterView.jsx:133` — always a
bare identity.

**[rev2] Corrected claim.** The original text read *"The comparison can never be true."* That
is **overstated**. It is true only for shifts written by the **post-refactor** generator. The
pre-refactor generator (`git show 48ac13c:src/utils/auraEngine.js`) wrote
`staff: assignedStaff` — a bare name — so for any shift persisted **before 6 May 2026 16:48**
the comparison *does* match, the `.map()` rewrites the shift, and the legacy shape written
back is still readable by `RosterView.jsx:111`'s third clause. **On a legacy document the swap
works.** Whether A1 is live in production therefore depends on a fact source cannot settle:
whether "Generate Roster" has been clicked since 6 May. → **LIVE-VERIFY PENDING**: read
`system_data/roster_2026` and check whether `staff` holds `"Lead: …, Co: …"` or a bare name.
(ROSTER_TODO.md P3.6 already assumed legacy documents exist — the two documents contradicted
each other, which the audit caught.)

For post-refactor shifts, the consequences are, in order:

1. `.map()` returns the day's array unchanged.
2. `updateDoc` writes byte-identical data — a successful no-op. No throw, no log.
3. The swap document is nonetheless flipped to `APPROVED` (`AuraPulseBot.jsx:341`).
4. AURA reports: *"✅ Swap accepted! I have updated the master roster…"*
   (`AuraPulseBot.jsx:370`) — a hardcoded string, emitted regardless of outcome.

**Impact [rev2, corrected].** For a post-refactor roster the "Auto-Healer" capability does not
function. The original text claimed *"both see confirmation"* — **wrong**: `shift_swaps` has
exactly one reader and it matches only `targetStaff` (`AuraPulseBot.jsx:104-105`), so the
**requester is never notified of any outcome at all** (audit finding M4 — a separate defect,
worse than the one claimed). The original also asserted the two records disagree
*"permanently"*; nothing establishes permanence, and a regeneration (C2) would erase the
roster side entirely. What is supportable: the accepting clinician is told the roster was
updated when it was not, and the `shift_swaps` ledger records `APPROVED` against a roster that
does not reflect it.

### A2. Even with the comparison fixed, the write is still wrong

The mutator writes `{ ...shift, staff: user.name }` (`AuraPulseBot.jsx:356`). Post-refactor
the authoritative identity fields are `lead` and `coLead`; `staff` is a *derived display
string*. So a corrected match would still:

- leave `lead`/`coLead` holding the **old** person, and
- destroy the display string's format (it becomes a bare name, breaking the
  `Lead: X, Co: Y` convention that ICS export at `auraEngine.js:103` depends on).

`RosterView.jsx:111` and `:233` check ownership via `lead`/`coLead` **first**, so the UI
would continue to show the shift as belonging to the original person. The fix is not a
one-character change — the mutator needs to know *which role* is being transferred.

### A3. The swap request never records which role is being swapped

`RosterView.jsx:132-140` persists `originalTask`, `originalShiftDate`, `requestedBy`,
`targetStaff`, `reason`. It does **not** record whether the requester was the shift's `lead`
or its `coLead`. `selectedShift` has the information in hand at that moment and discards it.
The mutator therefore cannot know which field to rewrite even in principle. **This is the
true root cause of A2** — a missing field in the message contract, not a bad comparison.

### A4. The swap-target filter works by coincidence

`RosterView.jsx:296-301`:

```js
config.staff.filter(name => !selectedShift.staff?.includes(name))
```

A substring test against the composite display string, replacing an equality test that broke
when `staff` changed meaning. It is correct for today's roster only because no CEP's name is
a substring of another's. Add a "Lynn" alongside "Fadzlynn" and requesting cover for
Fadzlynn's shift silently removes Lynn from the dropdown. A latent correctness bug fixed by
luck, not by design.

### Root causes for Block A

| # | Root cause |
|---|---|
| A-RC1 | **A field's meaning changed while its name stayed the same.** `staff` went from identity to display string. Nothing in the type system, the tests, or the review process could notice. |
| A-RC2 | **No consumer sweep.** A `grep -rn "\.staff"` across `src/` takes seconds and would have surfaced `AuraPulseBot.jsx:355` immediately. |
| A-RC3 | **No shared schema.** The shift object is constructed inline in `auraEngine.js` and destructured ad hoc in two other files. There is no single definition to change. |
| A-RC4 | **Success was asserted, not observed.** The confirmation message at `AuraPulseBot.jsx:370` is a literal, decoupled from the mutation result; nothing reads the document back. **[rev2] Promoted to the most actionable root cause.** The comparison bug makes the roster wrong; *this* is what makes it undetectable — and unlike A-RC1–3 it is a two-line fix needing no clinical decision. It should have been ranked first, not fourth. |
| ~~A-RC5~~ | **[rev2 — withdrawn, not a root cause.]** "Silent-failure-shaped API" described `.map()` returning an unchanged array and `updateDoc` accepting identical data. Both are correct, specified behaviour. This is a *detection* gap, which is already A-RC4 — listing it separately inflated the root-cause count. |

### Near-misses

- **The author knew consumers existed.** `79e3b99`, 3 minutes after the schema change,
  correctly updated *two* ownership checks in `RosterView.jsx` for `lead`/`coLead`, with the
  comment *"Also maintains backwards compatibility."* The reasoning was right; the search
  radius was one file too small.
- **~~Backwards compatibility saved the calendar.~~ [rev2 — WRONG, withdrawn.]** The original
  claimed that dropping the `|| shift.staff === user?.name` clause at `RosterView.jsx:111`
  would have visibly broken demo mode and exposed the bug. It would not have. That line is
  `isDemo ? true : (…)`, so **the whole expression is short-circuited in demo mode and the
  third clause is dead code there**; and the demo transform sets `lead` to the same bare name
  (`RosterView.jsx:53`), so the first clause would match regardless. The clause protects the
  **legacy** path, not the demo path — the same fact that forced A1's correction above.
- **~~The ICS export was one line from breaking.~~ [rev2 — WRONG, inverted.]** The refactor did
  not improve the export; it **broke** it. `auraEngine.js:103` emits
  `SUMMARY:[EFT] Lead: Brandon, Co: Ying Xian` — an **unescaped comma inside an RFC 5545 TEXT
  property**, which must be written `\,`. Pre-refactor output was comma-free, so this is a new
  defect introduced by the same commit (audit finding M6, which also notes the missing `UID`
  and `DTSTAMP`). The genuine near-miss stands, inverted: had anyone re-imported the `.ics`
  after 6 May, the schema change would have announced itself right here.

---

## BLOCK B — Time, dates and calendar correctness (HIGH)

### B1. The default start date is a Sunday, so "Mon–Fri" is wrong

`RosterView.jsx:38` ships `startDate: "2026-02-01"`. **1 February 2026 is a Sunday** —
`node -e "console.log(new Date('2026-02-01').toUTCString())"` → `Sun, 01 Feb 2026 00:00:00 GMT`. The engine's core loop (`auraEngine.js:28`) is `for (let d = 0; d < 5; d++)` from
the start date, commented "MAIN CORE TASKS (Mon-Fri)". With a Sunday start it fills
**Sun–Thu**. Worse, the fixed weekday offsets are silently wrong too:

| Engine intent | Offset | Actual day generated |
|---|---|---|
| Core block "Mon–Fri" | +0..+4 | **Sun 1 → Thu 5 Feb** |
| `VC (PM)` "Tuesday" | +1 | **Monday 2 Feb** |
| `VC (AM)` "Saturday" | +5 | **Friday 6 Feb** |

Nothing validates that `startDate` is a Monday. A roster generated from the shipped default
places every weekend-adjacent VC duty on the wrong day.

### B2. Date keys mix local arithmetic with UTC output — [rev2, DIAGNOSIS REPLACED]

Every key comes from `toISOString().split('T')[0]` (`auraEngine.js:31`, `:54`, `:69`).

**The original diagnosis was wrong.** It claimed keys are "correct only because the author's
timezone is `Asia/Singapore`" and that "in any UTC-negative timezone every shift shifts one day
earlier." Measured, that is false — the current implementation is **timezone-stable across
fixed offsets**:

```
$ TZ=Asia/Singapore   node tzcheck.cjs current 2026-02-01 2
  ["2026-02-01","2026-02-02","2026-02-03","2026-02-04","2026-02-05","2026-02-08", …]
$ TZ=America/New_York node tzcheck.cjs current 2026-02-01 2   # byte-identical
$ TZ=Pacific/Auckland node tzcheck.cjs current 2026-02-01 2   # byte-identical
```

The reason: `new Date("2026-02-01")` is parsed as **UTC** midnight, and `setDate` then performs
**local** arithmetic that preserves the wall-clock time, so the constant offset cancels on
output. The two halves are inconsistent in *style* but agree in *result*.

**Why this matters more than the original claim.** The remediation originally planned for B2 —
"replace `toISOString` with local `getFullYear`/`getMonth`/`getDate`" — **introduces** the bug
it was meant to fix, because it changes only the output half and leaves the UTC parse in place:

```
$ TZ=America/New_York node tzcheck.cjs proposed 2026-02-01 2
  ["2026-01-31","2026-02-01","2026-02-02", …]     # every key one day early
```

**The genuine residual defect is DST, not offset sign** (audit finding M2). Because `setDate`
preserves local wall-clock time across a spring-forward transition, the underlying instant
crosses the UTC date boundary mid-generation:

```
$ TZ=America/New_York node tzcheck.cjs current 2026-03-02 4    # spans US DST, 8 Mar 2026
  wk1: 03-02 03 04 05 06  → Mon–Fri  ✓
  wk2: 03-08 09 10 11 12  → Sun–Thu  ✗   every week after the transition slides one day early
$ TZ=Asia/Singapore  node tzcheck.cjs current 2026-03-02 4     # no DST → Mon–Fri throughout ✓
```

Asymmetric and verified: US fall-back (start `2026-10-26`) produces correct keys; only
spring-forward breaks it. **For the actual `Asia/Singapore` deployment this can never fire.**
So B2 is correctness-by-accident and a real portability hazard, but **not a live defect for
this deployment** — downgraded from High to Low. The instinct behind "author-environment bias"
was right; the mechanism named was not.

**Correct fix:** make both halves consistent — parse `startDate` into a *local* date
(`new Date(y, m-1, d)` from its parts) **and** derive keys with local getters. Changing either
half alone is worse than changing neither.

### B3. The calendar opens on a hardcoded, now-stale month

`RosterView.jsx:20`: `useState(new Date(2026, 1, 1))` — February 2026. Today is August 2026,
so every user lands on an empty grid six months in the past and must click forward six times
to reach the present.

### B4. `handleMonthChange` mutates state in place

`RosterView.jsx:104`: `new Date(currentDate.setMonth(currentDate.getMonth() + offset))`.
`setMonth` mutates the `Date` object held in state before the new one is constructed. It
happens to re-render because a fresh `Date` is passed to the setter. Safe today only because
`currentDate` is always day-1 (a day-31 value would overflow, e.g. 31 Mar → "31 Feb" → 3 Mar).

### Root causes for Block B

| # | Root cause |
|---|---|
| B-RC1 | **Raw `Date` arithmetic with no date helper and no tests.** Every offset is hand-rolled `setDate` + `toISOString`. |
| B-RC2 | **Weekday semantics encoded in a comment, not a check.** "Mon-Fri" and "Tuesday" exist only as comments; the code trusts the caller. |
| B-RC3 | **Author-environment bias — [rev2, mechanism corrected].** Not "UTC+8 masks a UTC-vs-local offset error" (that error does not exist). The real bias is that `Asia/Singapore` **has no DST**, so the genuine defect (M2) is unreachable from the author's machine and from the deployment. Right instinct, wrong mechanism. |
| B-RC4 | **Constants that were once "now" were never parameterised.** Feb 2026 was the demo month when the view was written. |

### Near-misses

- **~~B1 and B2 cancel out in the UI.~~ [rev2 — WRONG, withdrawn.]** The original claimed the
  producer's `toISOString` and the consumer's local key construction at `RosterView.jsx:163`
  were "two independent bugs whose symptoms silently annihilate each other in exactly one
  timezone." They are not a cancelling pair: `RosterView.jsx:163` builds a key from the
  rendered calendar cell's year/month/day — **pure calendar arithmetic over no instant at
  all** — so there is no offset for it to get wrong, in any timezone. The real cancellation is
  entirely *inside* the producer (UTC parse vs. local `setDate`), as shown in B2 above, and it
  holds in every fixed-offset zone rather than only in UTC+8.
- **`MOCK_ROSTER` uses 17–18 Feb 2026** (`mockData.js:47`), inside the hardcoded default
  month. Demo mode therefore always looks correct, which is precisely why B3 was never
  noticed — the sandbox, which is what gets demonstrated to stakeholders, is the one
  configuration where the stale default is right.

---

## BLOCK C — Persistence and configuration drift (HIGH)

### C1. One hardcoded document for all time

The live path reads and writes `system_data/roster_2026` (`RosterView.jsx:67`, `:94`;
`AuraPulseBot.jsx:346`). The config wizard accepts **any** `startDate` and week count, so a
roster generated for 2027 is written into the document named `roster_2026`. There is no
per-year or per-period partitioning and no code path that would ever create a second
document.

### C2. Generation is a destructive whole-document overwrite

`RosterView.jsx:94` uses `setDoc` without `{ merge: true }`. Regenerating replaces the entire
document — **destroying every accepted swap and every previously generated period**. The
confirmation modal warns "will overwrite the currently displayed schedule"
(`RosterView.jsx:397`), which understates it: it overwrites *all* schedules, not the
displayed month.

### C3. Two competing sources of truth for the team

`RosterView.jsx:36` hardcodes `["Brandon", "Ying Xian", "Derlinder", "Fadzlynn"]` as
component state. `src/utils/index.js:22` defines `TEAM_DIRECTORY` — the actual authenticated
roster with ids, emails, roles and job grades — and exports `STAFF_LIST` derived from it.
`RosterView` imports neither. So:

- The swap dropdown is populated from the hardcoded array, not from the roster that was
  actually generated, nor from the directory that governs login.
- Config is never persisted; every reload silently reverts to those four names, even if the
  live document was generated from a different pool.
- A staffing change requires editing a component to keep two lists in sync.

### C4. No `firestore.rules` in the repository

There is no rules file anywhere in the tree (`firebase.json` declares only `hosting` and
`functions`). The master-roster rewrite executes **client-side in the accepting user's
browser** (`AuraPulseBot.jsx:361`), and swap creation is an unguarded `addDoc` from any
signed-in client (`RosterView.jsx:132`). Whatever authorization exists lives only in the
Firebase console — unversioned, unreviewable, and absent from code review. The
`user?.role === 'admin'` checks at `RosterView.jsx:113` and `:239` are UI affordances, not
security boundaries.

### Root causes for Block C

| # | Root cause |
|---|---|
| C-RC1 | **Configuration modelled as ephemeral component state** rather than as a persisted document, so it cannot survive a reload or be shared between users. |
| C-RC2 | **A constant embedded in a component instead of imported** from the module that already owns it (`TEAM_DIRECTORY`). |
| C-RC3 | **`setDoc` chosen over `merge`/targeted writes** for a document with multiple independent writers (the generator, and every accepting colleague). |
| C-RC4 | **Security posture never expressed as code**, so it is invisible to every process that reviews code. |

### Near-miss

- **[rev2 — this near-miss was too generous to C2.]** The original argued that C2 is latent,
  dangerous only *after* Block A is fixed, and derived the whole Phase 2 ordering from that.
  The audit refuted it with two paths that arm the destructive overwrite **today**, needing no
  swap at all:
  - **M1 (CRITICAL):** leaving demo mode restores `rosterData` but never `config`
    (`RosterView.jsx:43-72`), so the Marvel staff pool survives into live mode. One
    "Generate Roster" click replaces the four CEPs' real duty roster with Steve/Peter/Charles/
    Jean/Tony — and reports *"✅ AURA has generated a conflict-free roster."*
  - **M3 (CRITICAL):** clearing the Weeks field yields `parseInt("")` → `NaN`, the generation
    loop never runs, `generateRoster` returns `{}`, and `setDoc` without `merge` **wipes the
    document** — again with a success alert.

  C2 is therefore **Critical and armed**, not High and latent. The ordering conclusion
  survives (the non-destructive write still precedes the swap fix) but for a stronger reason:
  it is the live hazard, not a future one.

---

## BLOCK D — Verification and trust infrastructure (CRITICAL, process)

### D1. The test suite is a decoy

- `src/components/Aura.utils.test.js` and `src/components/Aura.hooks.test.js` are
  **byte-for-byte identical**, 12,323 bytes each (`diff` reports no differences).
- Both import `./aura.hooks` — the real file is `Aura.hooks.js` (capital A). Resolves on
  macOS's case-insensitive filesystem; would fail on Linux CI.
- Neither `vitest` nor `@testing-library/react` appears in `package.json`.
- There is **no `test` script**. `npm test` does not exist.
- Consequently `Aura.utils.js` — 368 lines holding `sanitizeInput`,
  `extractJsonFromResponse`, `isValidPulseLog`, `withRetry`, `buildSystemPrompt` and
  `routeSimulationIntent` — has **zero test coverage**, despite a 304-line file named for it
  sitting next to it.

608 lines of test code, a header documenting how to run it, and not one assertion has ever
executed. This is worse than no tests: it presents as a safety net in code review.

### D2. Commit history carries no intent

616 commits. Subject-line frequency: `Update App.jsx` ×92, `Update AuraPulseBot.jsx` ×62,
`Update index.js` ×43, `Update ResultPage.jsx` ×39. This is the GitHub web-editor default
message. There are **zero tags** and no branches other than `main`.

The practical cost is not aesthetic. It means: no commit can be understood without reading
its diff; `git bisect` has nothing to select on; no change was ever reviewed before landing
on `main`; and the 26-minute window that produced Block A is reconstructible only by diffing
four commits by hand — which is how this post-mortem had to do it.

### D3. Nothing verifies the deploy — and the one gate that appeared to exist does not

`.github/workflows/deploy.yml` runs `npm install` → `npm run build` → deploy, on **every push to
`main`**. With 616 direct-to-main commits and no branches, **every commit auto-deploys to
production.** There was no test step (one has now been added by plan P0) and there is still no
check that a change is actually present in the built bundle.

**[rev2] Newly discovered while verifying P0: `npm run lint` has never worked.** `package.json`
defines `"lint": "eslint . --ext js,jsx --report-unused-disable-directives --max-warnings 0"`, and
`README.md:131` cites lint compliance as a technical standard. But **no ESLint configuration file
exists anywhere in the repository** — tracked or untracked:

```
$ npm run lint; echo "EXIT=$?"
ESLint couldn't find a configuration file.
EXIT=2
$ git ls-files | grep -i eslint     # → no output
```

So the repository's only apparent quality gate exits 2 on any invocation, and `deploy.yml` never
called it anyway. Four ESLint packages sit in `devDependencies` serving no function. This is the
purest instance of the pattern in this post-mortem: a gate that exists as a *claim* in
`package.json` and the README, and as nothing at all in reality. Combined with the PWA service worker (`public/firebase-messaging-sw.js`),
returning users can hold a cached client that reads a shape the new code no longer writes.

### Root causes for Block D

| # | Root cause |
|---|---|
| D-RC1 | **Tests were authored as an artifact, not wired as a gate.** Someone wrote real, competent tests; nobody ran them, so a copy-paste duplication and a case-wrong import survived indefinitely. |
| D-RC2 | **A browser-based editing workflow** (GitHub web UI) makes running anything locally impossible by construction, which explains D1, D2 and the absence of a rules file in one stroke. |
| D-RC3 | **No gate between "edited" and "in production."** Every commit is a deploy candidate; nothing between the two can say no. |

### Near-miss

- The tests that *do* exist target exactly the right things — cleanup after unmount, guard
  semantics, rate-limit windows. Had they run, they would not have caught Block A (they cover
  hooks, not the roster). The near-miss is that their presence plausibly **discouraged**
  writing the tests that would have: a reviewer glancing at the directory sees two test files
  and concludes the area is covered.

---

## BLOCK E — Documentation overstating the build (MEDIUM)

### E1. Capabilities claimed that do not exist

- `README.md:35` — *"generating mathematically safe rosters based on predicted case volumes
  and specific skill-mix requirements."*
- `src/components/AppGuide.jsx:28` — *"It predicts case volumes and automatically routes the
  right skill-mix to the right wards."*

`generateRoster` accepts exactly four inputs: `staff`, `tasks`, `startDate`, `weeks`. It
consumes no case volumes, no skill or grade data (though `TEAM_DIRECTORY` and
`knowledgeBase.js` hold job grades), no leave calendar, and no ward data. It is a cyclic
rotation — `rotate(staff, w)` — with no constraint checking of any kind. "Zero-conflict"
truthfully means "cannot double-book by construction", which is a property of the rotation,
not a safety guarantee. `AppGuide.jsx` is user-facing onboarding, so this is a promise made
directly to clinicians about how their duty roster is decided.

### E2. A resolved-debt claim that is not resolved

`README.md:181` states v1.5 *"replaced all native browser alerts with secure, custom-branded
confirmation modals."* `RosterView.jsx` contains **seven** `alert()` calls — lines 78, 80,
96, 99, 129, 141, 150 (verified by grep) — including both the success and the failure paths
of live roster generation and of swap submission.

### E3. Version drift, and no changelog

| Source | Value |
|---|---|
| `package.json` `version` | `1.0.0` |
| `README.md` title | `v1.5 [BETA]` |
| `README.md` badge | `AURA-v2.3 Engine` |
| git tags | none |
| `CHANGELOG.md` | did not exist |

`package.json` also carries `"@google/generative-ai": "latest"` — an unpinned dependency, so
a deploy can change behaviour with no commit to attribute it to. (`package.json` additionally
has trailing whitespace after that line.)

### E4. The known-limitations section is honest, and points at the gap

`README.md:159` already records *"When AURA rewrites the master calendar, it does not
currently validate if the new staff member exceeds consecutive working day limits."* That
entry is correct and was written deliberately. It describes a validation gap in a rewrite
that, per Block A, **never actually happens** — the documentation is more advanced than the
code it documents.

### Root causes for Block E

| # | Root cause |
|---|---|
| E-RC1 | **Documentation written aspirationally, in the same pass as the code**, then never reconciled against what shipped. |
| E-RC2 | **No release ritual.** Nothing forces a version, a changelog entry, or a claim audit at any point. |

---

## Cross-cutting summary

Severities re-rated after the audit `[rev2]`:

| Block | Severity | Nature | Blast radius |
|---|---|---|---|
| **C2** (+ M1, M3) — destructive write | **Critical, armed today** | Data loss | One click replaces or empties the whole live duty roster, reporting success |
| **A** — schema split-brain | **Critical** (live status LIVE-VERIFY PENDING) | Silent data-integrity failure | Accepting clinician told the roster changed when it did not |
| **D** — no verification | **Critical** | Process | Every other block is undetectable |
| **B1** — weekday misalignment | High | Logic | Every roster generated from the shipped default sits on the wrong weekdays |
| **C1/C3/C4** — persistence, config source, rules | High | Architecture | Two sources of truth; write authorization unversioned |
| **B2/M2** — DST key slide | ~~High~~ → **Low** | Portability | Cannot fire in `Asia/Singapore` (no DST); breaks on any DST host |
| **E** — doc overstatement | Medium | Trust | Clinicians misinformed about how duty is decided |

Plus **12 defects this post-mortem missed**, catalogued in
[ROSTER_QC_AUDIT.md](ROSTER_QC_AUDIT.md): M1 and M3 (both Critical, folded into C2 above), M2
(the real B2), M4 (requester never notified), M5 (`onOpen` never passed, so the coverage alert
never surfaces — `App.jsx:626`), M6 (malformed ICS), M7 (exports emit `undefined` in demo mode),
M8 (no `onSnapshot` error callbacks), M9 (`APPROVED` written before the roster write, no
rollback), M10 (CSV formula injection), M11 (admin swaps structurally no-op), M12 (no
duplicate-request guard).

**The single sentence version [rev2]:** a field changed meaning without changing its name, in a
repository with no runnable tests, no reviewed commits, and success messages that are printed
rather than verified — so a two-person distributed mutation reports success it never achieved,
while a separate one-click path can empty the roster outright.

The one claim withdrawn from the original closing: *"failing silently and confidently since
6 May 2026."* The date is unknowable from source — it depends on whether the live document
still holds pre-refactor shifts. **LIVE-VERIFY PENDING.**

### The one pattern worth carrying forward

Every critical defect here is a **claim decoupled from its evidence**:

- AURA claims the roster was updated → never reads it back (A1).
- A comment claims Mon–Fri → nothing checks the weekday (B1).
- A modal claims it overwrites the displayed schedule → it overwrites all of them (C2).
- Two files claim to test the codebase → neither can run (D1).
- The README claims case-volume prediction → there is no volume input (E1).

The remediation in Phase 2 is ordered to close that gap **evidence-first**: build the ability
to verify (D) before changing behaviour (B, A, C), and correct the documentation (E) only
once there is something true to describe.
