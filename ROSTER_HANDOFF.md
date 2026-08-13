# AURA Roster — Handoff

**Last updated:** 2026-08-14. **Read this first**; `ROSTER_TODO.md` is the plan,
`ROSTER_QC_AUDIT.md` is the audit.

> ### ⚠️ Sections 2, 3 and 4 were written on 2026-08-06 and have been CORRECTED IN PLACE.
> Several things they described as broken or unbuilt have since shipped. Where a claim is now
> false it is struck through and dated rather than deleted, because "this used to be true"
> is what stops the same worry being raised twice. **Anything not marked as corrected still
> stands.**

---

## 0. Today, in one paragraph *(2026-08-14)*

The grade scale now has **four bands, not three** — `nonExempt AH7–AH10 · junior AH11–AH12 ·
senior AH13–AH14 · principal AH15–AH17` — because you told me AH7–AH10 are non-exempt staff
(associates, assistants, technologists) and AH11–AH12 are junior AHPs. That was a
**correctness fix, not a relabelling**: `junior` shipped as `[7,12]`, so a task gated *"a
junior may lead this"* would accept an AH8 assistant as the lead. It is live and verified on
the deployed site: the junior-gated task is now led **only** by the two AH11/AH12 staff,
where five AH7–AH10 staff were previously eligible.

It cost 121 test failures, of which **120 were assertions with the old boundary written into
them** and **one was a real fixture defect** the split exposed (the embryology trio had its
two junior embryologists at AH8/AH9 — non-exempt now — so a junior-only slot had nobody
eligible; re-graded to AH11/AH12). One demo assertion turned out to be **measuring nothing**
and would have passed forever. All repaired, plus a new exhaustive proof that the band ruler
cannot be dragged into an illegal state. **1627 tests green, lint clean, CI green, deployed.**

---

## 1. What is LIVE right now

`smartdashboard.web.app` is running the **four-band engine**, HEAD `bed9abd`, bundle
`index-BdgcDfHp.js`. CI green end to end including the Deploy stages, and verified *in the
shipped bundle* rather than assumed: it carries
`regions:{nonExempt:[7,10],junior:[11,12],senior:[13,14],principal:[15,17]}`.

Verified in a real browser on the live site, at 375px because that is what your testers will
use: three ruler dividers reading *Non-exempt AH7–AH10 / Junior AH11–AH12 / Senior AH13–AH14
/ Principal AH15–AH17*, all three drag handles exactly **44×44**, no overlap, no sideways
scroll. The profession dropdown offers MOH's **28 professions expanding to 37 leaves**,
alphabetical, with Medical Technologist and Psychologist correctly nested as sub-lists. The
Marvel worked example loads 12 staff that fall **5 non-exempt / 2 junior / 4 senior / 1
principal**, and generating still yields **exactly one** unstaffable slot with its full
reason.

*(Earlier today the same commit went out CI-red once: a single unused import failed the lint
gate, so nothing deployed. That is the gate working. See §3 for why lint had never been
runnable locally, and what now makes it runnable.)*

<details><summary>Earlier releases, as recorded on 2026-08-06 — v1.7.1 was live at that time</summary>

| Tag | What it fixed |
|---|---|
| `v1.5.0-pre-remediation` | *(rollback point — the original code, before any of today's work)* |
| `v1.6.0` | Two one-click paths that destroyed the live roster (**M1** demo config leaking into live mode, **M3** cleared Weeks field wiping the document). Plus the first runnable test harness. |
| `v1.6.1` | The shift-swap flow now actually works (**A1**), can no longer claim success it did not achieve (**A-RC4**), the coverage alert surfaces (**M5**), the ledger no longer approves before writing (**M9**), admin-initiated swaps work (**M11**). |
| `v1.7.0` | **The constraint-aware engine, live in Sandbox.** Generate really generates; the staff field is editable so visitors can enter their own team; the result panel shows load, warnings and every unstaffable slot with its reason. |
| `v1.7.1` | **B1 fixed** — live-mode generation snaps to Monday, so core duties land Mon–Fri and the VC duties on their real Tuesday/Saturday (DST-proof, six timezones verified; Monday-start output byte-identical, stored rosters unaffected). Calendar opens on the current month. **M6 fixed** — ICS now escapes correctly, carries stable UIDs (re-import *updates* Outlook instead of duplicating) and DTSTAMP. **M10 fixed** — CSV quoting, formula-injection guard, CRLF + UTF-8 BOM. **Zero native `alert()` dialogs** remain in the roster view, and duplicate swap requests are blocked per session. **You may now generate in live mode on stage — from any start date.** |
| **`v1.8.0`** | **The roster-master release, from the four AHP team interviews.** Engine: AH7–AH17 job grades with editable bands (eligibility-not-exclusion, lead-gated/co-open), monthly recurrence (the psychologists' 3rd-Wednesday clinic), continuity-of-care with counted-and-named breaks, and a composed skill∩band validation refusal. Sandbox wizard: staff and task **tables** (grades, FTE, leave; band chips with live grade ranges; band-boundary editor) replace the free-text boxes. 832 tests. Live mode untouched. |

**Deploy verified, not assumed.** CI green end to end in 2m43s (including the test gate). The
live bundle is `index-Ck4olkEf.js`, and I confirmed the new code is *in* it — `effectiveStart`,
`unfilled`, `Load example department`, `Scott Lang`, `Nothing is saved` all present — and that the
old theatre is *gone*: `multiverse timeline` and `Simulation Locked` both return **zero** hits.

</details>

### What to click, in Sandbox

*(Corrected 2026-08-14: step 2's control is now a **dropdown**, not a row of buttons — pick
**"The Marvel Team — full worked example"** under "Shape to start from". The example is no
longer called "Load example department".)*

1. Toggle **Demo** in the header. The staff and task boxes are now empty and editable.
2. **Configure → Load example department** → Generate. You should get 40 shifts over 12 days
   starting Monday 7 September 2026, and **exactly one unstaffable slot**:
   *"no available staff hold skill CPET for Paediatric CPET coLead on 2026-09-16 (2 qualified,
   1 on leave, 1 already on this task)"*. **Point at that.** It is the argument for trusting the
   tool: it tells you what it could not do instead of quietly double-booking someone.
3. Or type any team's names and routines and Generate — that is the try-it-yourself path for the
   respiratory and psychology teams.
4. CSV and ICS both export complete data from a generated Sandbox roster.

One cosmetic rough edge: the CSV shows `undefined` in the Co-Lead column for that single
unstaffable slot, because the shift genuinely has no co-lead. Harmless, and arguably makes the
point — but if it bothers you on stage, mention it before someone spots it.

**Rollback, fastest first:**
1. Firebase Console → Hosting → `smartdashboard` → **Rollback** on the previous release. Instant, no git.
2. `git revert --no-commit v1.6.1..HEAD && git commit -m "rollback" && git push`
3. Full reset to before today: target `v1.5.0-pre-remediation`.

**Rollback does not restore data.** There is still no Firestore backup. Your June `.ics` in Outlook plus a CSV export are the only copies.

---

## 2. ~~What was built today but is NOT yet live~~ → **now live in Sandbox**

> **Corrected 2026-08-14.** The heading was true on 2026-08-06 and is false now:
> `rosterEngineV2.js` **is** wired into Sandbox and has been for several releases. The
> engine's *limits* listed at the end of this section are still accurate and still worth
> reading before you promise anything — that is why the section stays.

**`src/utils/rosterEngineV2.js`** — the constraint-aware engine you asked for. Built, tested (174 tests of its own, 428 total), **not yet wired into the app** at the time of writing. Wiring into Sandbox is in progress.

It accepts, per staff member: FTE, skills, unavailable dates, max duties per day. Per task: required skill, which weekdays it runs, how many leads and co-leads. Plus rules: daily capacity, max consecutive days, forbidden pairs.

### Measured: old engine vs new

| staff / tasks | Old: max duties one person holds in a day | Old: never rostered | New: max/day | New: never rostered | New: unfilled, reported with reasons |
|---|---|---|---|---|---|
| 4 / 4 (your team) | 3 | 0 of 4 | 2 | 0 of 4 | 0 |
| 12 / 8 | 3 | 0 of 12 | 2 | 0 of 12 | 0 |
| 9 / 6 | 3 | 0 of 9 | 2 | 0 of 9 | 0 |
| **6 / 10** | **5** | 0 of 6 | **2** | 0 of 6 | **160** |
| **20 / 4** | 3 | **12 of 20** | 1 | **0 of 20** | 0 |

Reproduce any time: `node scripts/roster-scaling.mjs`

`generateRoster` (the old engine, which live mode still uses) is **byte-identical** — verified across 720 configurations. So none of this can affect your real roster.

### The new engine's honest limits — know these before promising anything

The 15 are documented in full in the agent's report; these are the ones that would bite in a demo or a pilot:

1. **Greedy, not optimal.** It fills the hardest-to-staff slots first, which prevents same-day stranding, but it has no lookahead and no repair pass. It can occasionally report a slot as unfillable that a proper solver would have filled.
2. **`maxConsecutiveDays` cannot see across generation runs.** Generate month by month and someone can end one month on Saturday and start the next on Sunday, exceeding the limit invisibly.
3. **A skill requirement gates the co-lead too**, so "qualified senior supervising an unqualified trainee" cannot be expressed.
4. **FTE controls relative share, not an absolute cap.** Entering `fte: 0.2` expecting "one day a week" will not give that.
5. **Forbidden pairs are same-task-only.** Two people who must not be in the same room can still be rostered on different tasks the same day.
6. **`softPenalty` is not comparable between differently-shaped teams** — do not read it as a quality score.
7. **A Monday snap goes backwards** for a mid-week start date, so a roster can silently begin in the past.
8. **Leave is whole-day only** — no half-days.

---

## 3. Your machine needs attention — *root cause found 2026-08-14, and worked around*

**It was never really the 98% disk. It is iCloud Drive.** The repo lives under `~/Documents`,
which syncs to iCloud with *Optimise Mac Storage* on, and iCloud has **evicted
`node_modules`** — so every single read is an on-demand download of thousands of tiny files.

Measured in the repo, not guessed:

| What | Result |
|---|---|
| `require('@babel/core')` | **299s** |
| `require('jsdom')` | **never completes** |
| One 29-test **non-jsdom** file | **hung past 7 min** (14 min elapsed for 1.5s of CPU — pure I/O block) |
| `cp -Rc node_modules` (APFS clone) | **stalled** |

That is why `npm run lint` and the jsdom half of the suite appeared permanently broken. They
were not broken; they were starved.

**The workaround, and it works.** A copy outside iCloud with its own `node_modules`:

```bash
/private/tmp/nexus-jsdom/verify.sh          # both CI gates: 1627 tests + eslint, ~35s
/private/tmp/nexus-jsdom/verify.sh lint     # lint only
/private/tmp/nexus-jsdom/verify.sh test src/components   # one directory
```

It rsyncs `src/` from the real repo (3 MB, instant) and runs there. **Edit in the real repo
as normal; verify through that script.** If it vanishes after a reboot, recreate it: copy
`src/`, `package.json`, `package-lock.json`, `vitest.config.js` and `.eslintrc.cjs` somewhere
outside `~/Documents` and `npm install` (508 packages, under a minute).

**A trap worth knowing:** `npx vitest run src/utils` *does* still work in the repo (~4s,
because it needs no jsdom). So it is easy to see "1372 passed" and believe the suite is
green while the entire component half silently never ran.

**The real fix, when you have an hour:** in System Settings → Apple ID → iCloud Drive, turn
*Optimise Mac Storage* off, or move the repo out of `~/Documents` entirely. Clearing disk
space is still worth doing (11 GiB free of 460 GiB), but it is the smaller half of the story.

---

## 4. Still known-broken, documented, NOT fixed

Listed in `CHANGELOG.md` under "Known issues" so nobody mistakes the post-mortem for repairs:

> **Corrected 2026-08-14 — four of these are FIXED.** The table below is the 2026-08-06 list;
> read the status column, which is new.

| Id | Impact | Status *(2026-08-14)* |
|---|---|---|
| **B1** | A roster generated from the shipped default starts on a **Sunday**; the "Tuesday" and "Saturday" video-clinic duties land on Monday and Friday. | ✅ **FIXED in v1.7.1** — snaps to Monday, DST-proof across six timezones. Safe to generate live on stage from any start date. |
| **M6** | The ICS export has an unescaped comma and no `UID`/`DTSTAMP`. | ✅ **FIXED in v1.7.1** — escaping correct, stable UIDs, so re-import *updates* Outlook instead of duplicating. Outlook import is safe to demo. |
| **P0.7** | `npm run lint` has never worked — no ESLint config exists in the repo at all. | ⚠️ **HALF FIXED.** A config exists and lint **passes clean** — it runs in CI on every push and gates the deploy. But it could never run *locally*, for the iCloud reason in §3, which is how a lint error reached CI today. It now runs locally too via `verify.sh lint`. |
| **M10** | CSV formula injection. | ✅ **FIXED in v1.7.1** — quoting, formula-injection guard, CRLF + UTF-8 BOM. |
| **M12** | No duplicate-request guard. | ✅ **FIXED in v1.7.1** — duplicate swap requests blocked per session. |
| **C1 / C3 / C4** | Single hardcoded `roster_2026` document; staff pool hardcoded in the component; **no `firestore.rules` in the repo**. | ⚠️ **STILL OPEN.** A `firestore.rules` proposal now exists in the repo but is **inert — not wired, not deployed**. See **D6** below; this is the one to settle before another department's data is involved. |
| **D2 / D3 / D9** | A mistyped availability window silently deletes a person from the roster; `measureRosterLoad`'s `neverRostered` has no UI caller. | ⚠️ **STILL OPEN**, from the audit. D2 is the one that could embarrass you: a typo makes someone vanish rather than raising an error. |

---

## 5. Decisions still yours

Answered today: swap semantics = **mechanical substitution**; **notify the roster owner** (not yet built); deploy live with rollback (**done**).

Still open — **the two new ones are quick, and both are yours because they are domain facts,
not code decisions:**

- **D10 — is "Non-exempt" the right word on screen for AH7–AH10?** It is what your correction
  called them, so it is what the UI now says. But it is HR vocabulary, and the label is what a
  respiratory therapist or psychologist reads in the wizard on stage. If your departments
  actually say *"support staff"*, *"assistants and technologists"*, or something else, say so —
  it is a one-line label change, no data or logic moves. The label is generated by hyphenating
  the key (`nonExempt` → `Non-exempt`), so it is genuinely one line.
- **D11 — in the embryology fixture, is the third person a technologist or a junior
  embryologist?** The four-band split exposed that the trio's grades were AH8/AH9/AH10, which
  are all non-exempt now, leaving a junior-only slot with nobody eligible. I re-graded them to
  AH11/AH12 to match what the interview described. If one of the three is genuinely a
  *technologist*, their slot should be `nonExempt` and the fixture should say so — that would
  be a better demonstration of the distinction than three juniors, because it shows the tool
  refusing to let a technologist lead.

- **D3** — should the requester be told when a swap is accepted or declined? Currently nobody tells them. Needs a second listener or a Cloud Function.
- **D4** — partition the roster per year/team instead of one `roster_2026` document. Needs a migration decision.
- **D5** — which `TEAM_DIRECTORY` roles are rosterable? (Recommend `role === 'staff'`, matching today.)
- **D6** — **`firestore.rules`.** There is none in the repo. Roster writes happen client-side and authorization exists only in your Firebase console, unversioned. Fine for one trusted team; **this is the first thing to settle before another department's data is involved.** I need your console's current rules to do this safely.
- **D7** — the case-volume / skill-mix claim at `README.md:35` and `AppGuide.jsx:28` is still untrue. The research you supplied gives a legitimate route to making it true (NHPPD × Average Daily Census → required hours → FTE → slot counts).
- **D8** — was the 6 May schema change a major version? `version-steward` chose 1.6.0 (minor) and flagged the argument for 2.0.0.

---

## 6. Before you present

1. ~~**Rehearse once in Sandbox on the live site.** I cannot log in, so nothing I did verifies
   how it *looks*.~~ **Partly closed, 2026-08-14.** Sandbox needs no login, so I drove the
   deployed site in a real browser at 375×812 and confirmed how it looks and behaves: the
   four-band ruler renders with all four labels legible and untruncated, the three handles are
   each exactly 44×44 with no overlap, the page does not scroll sideways, the tick strip
   AH7–AH17 fits, the profession dropdown nests correctly, and the Marvel worked example
   generates with its one honest unstaffable slot. **Still yours to check:** LIVE mode (needs
   your login), and whether it looks right on *your actual phone* rather than an emulated
   viewport — real Safari has a different toolbar and safe-area inset.
2. **Rehearse the sentence about the bands.** It is your strongest single moment now, because
   it is a correctness story rather than a features story: *"the old version would let an AH8
   assistant lead a shift gated to junior clinicians — this one won't, and here is the pool it
   narrows to."* You can show it: Inpatient Rounds is led only by the two AH11/AH12 staff.
2. The solo demo path (LIVE mode, whose wizard still has the Staff Pool textarea):
   Configure → add your own name to the Staff Pool → close **without** Generate →
   click a colleague's shift → request cover from yourself → your AURA alert opens →
   Accept. *(In Sandbox the wizard is now the v1.8.0 staff/task tables — add a row
   with your name instead; note the sandbox swap path only simulates.)*
3. For the other departments: the platform transfers; **multi-team support does not exist yet** (one shared document, hardcoded login list, hardcoded team directory). Offer a pilot, not a handover.
4. Your strongest material is `ROSTER_POSTMORTEM.md` + `ROSTER_QC_AUDIT.md` — an audit that found its own author's diagnosis wrong in five places. For colleagues deciding whether to trust their duty roster to your software, that is more persuasive than a clean demo.
