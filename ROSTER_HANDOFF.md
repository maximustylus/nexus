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
cannot be dragged into an illegal state. **1639 tests green, lint clean, CI green, deployed.**

---

## 1. What is LIVE right now

`smartdashboard.web.app` is running **v1.17.0** with the **four-band engine**, the **numbered 1–7
configuration wizard**, the **owner's category palette** and the **six-shape picker** in the
Sandbox — and, as of **2026-08-19 00:26:54 SGT**, with **`firestore.rules` actually deployed**.

⚠️ **That last one is the change that matters most and it is not visible on screen.** Until this
release, any verified `@kkh.com.sg` address — not just the ten of you — could read every
clinician's wellbeing record and overwrite the duty roster. It is now the directory allowlist.
**Roster generation is admin-only from this release**; accepting a swap is unchanged. If anybody
reports the roster failing to load or a swap refusing, roll back in ~60 seconds: Firebase console
→ Firestore → Rules → history icon → restore the version before 2026-08-19 → Publish.

*(Corrected 2026-08-18: this line read **v1.14.0** and had been stale since v1.15.0 shipped. It is
the first thing anybody reads before presenting, so it is now updated as part of the release
rather than after it — the deploy runs on merge to `main`, so the version here and the version the
app renders are set in the same commit.)*

*Deliberately no commit SHA or bundle hash here: both change on every deploy, so pinning them
guarantees this line is stale again tomorrow. The version is the durable answer, and it is now
readable from the app itself — the sandbox banner and the landing footer both render it from
`package.json`, so what you see on screen IS what is deployed. To confirm the running build:*

```bash
curl -s https://smartdashboard.web.app/ | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js'
```

CI green end to end including the Deploy stages, and verified *in the
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

1. Toggle **Demo** in the header. The staff and task boxes are now empty and editable.
2. **Configure**, then under **"Shape to start from"** pick **"The Marvel Team — full worked
   example"**, then **Draft roster**. *(Corrected 2026-08-14: this used to be a row of buttons
   labelled "Load example department"; it is a dropdown now, and there is a second dropdown
   above it for your profession.)* You should get 40 shifts over 12 days
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
/private/tmp/nexus-jsdom/verify.sh          # both CI gates: 1639 tests + eslint, ~35s
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

## 4. What the audits found, and where each one stands

> **Retitled 2026-08-15.** This was headed *"Still known-broken, documented, NOT fixed"*, which
> is wrong for five of the eight rows below — they are fixed, and the status column says so. It
> also claimed to be the same list `CHANGELOG.md` carries under "Known issues", and it was not:
> that table has five items this one omitted. Both are corrected. **The `### Known issues` table
> under `[1.13.0]` in [CHANGELOG.md](CHANGELOG.md) is the authoritative list of what is open**;
> this table is the audit history with today's status beside it.

The five open items this section used to omit, now included at the foot of the table.

| Id | Impact | Status *(2026-08-14)* |
|---|---|---|
| **B1** | A roster generated from the shipped default starts on a **Sunday**; the "Tuesday" and "Saturday" video-clinic duties land on Monday and Friday. | ✅ **FIXED in v1.7.1** — snaps to Monday, DST-proof across six timezones. Safe to generate live on stage from any start date. |
| **M6** | The ICS export has an unescaped comma and no `UID`/`DTSTAMP`. | ✅ **FIXED in v1.7.1** — escaping correct, stable UIDs, so re-import *updates* Outlook instead of duplicating. Outlook import is safe to demo. |
| **P0.7** | `npm run lint` has never worked — no ESLint config exists in the repo at all. | ✅ **FIXED in v1.11.0.** A config exists, lint passes clean over 79 files, and `deploy.yml` runs it between the test and build steps. It could not run *locally* until 2026-08-14 either — the iCloud cause in §3 — and now does, via `verify.sh lint`. *(Corrected 2026-08-15: this read HALF FIXED while its own text described both halves as done, and three other documents called it fixed.)* The separate **still-open** item is defect **D6** — `.eslintrc.cjs` disables `no-unused-vars` for `rosterEngineV2.js`. |
| **M10** | CSV formula injection. | ✅ **FIXED in v1.7.1** — quoting, formula-injection guard, CRLF + UTF-8 BOM. |
| **M12** | No duplicate-request guard. | ✅ **FIXED in v1.7.1** — duplicate swap requests blocked per session. |
| **C1 / C3 / C4** | Single hardcoded `roster_2026` document; staff pool hardcoded in the component; **no `firestore.rules` in the repo**. | ⚠️ **STILL OPEN.** A `firestore.rules` proposal now exists in the repo but is **inert — not wired, not deployed**. See **Q6** below; this is the one to settle before another department's data is involved. |
| **D2 / D3 / D9** | A mistyped availability window silently deletes a person from the roster; `measureRosterLoad`'s `neverRostered` has no UI caller. | ⚠️ **STILL OPEN**, from the audit. D2 is the one that could embarrass you: a typo makes someone vanish rather than raising an error. |
| **D5** | The slot "needs skill" input is reachable but **unusable for a typed-in team** — the staff table has no skills column, so any skill on a task refuses the whole run. | ⚠️ **STILL OPEN.** This is what makes Q12's skill workaround demo-only. |
| **D6** | `.eslintrc.cjs` disables `no-unused-vars` for the whole 6,800-line engine — the "passes by disabling things" failure. Two real findings sit behind it. | ⚠️ **STILL OPEN.** Distinct from P0.7, which is fixed. |
| **D7** | `compileQuota`'s comment contradicts the validator on `max: 0`. | ⚠️ **STILL OPEN**, low. |
| **D8** | The impossible-floor refusal ignores the hours model. | ⚠️ **STILL OPEN**, low. |
| **Live iOS zoom** | The live-mode wizard's two textareas are still `text-xs`, so live mode zooms on iOS. Pinned byte-for-byte by a test. | ⚠️ **STILL OPEN.** Four clinicians, desktop — low priority by audience. |

---

## 5. Decisions still yours

Answered earlier: swap semantics = **mechanical substitution**; **notify the roster owner** (not yet built); deploy live with rollback (**done**).

**ANSWERED 2026-08-14** — Q10 and Q11, both by the roster owner:

- **Q10 — "Non-exempt" is the right word.** Confirmed; the label stays as it is. No change.
- **Q11 — "there might be a technologist with a junior grade."** So role and grade are
  **orthogonal**, and the embryology re-grade to AH11/AH12 stands: a technologist can hold a
  junior grade. **But this has a consequence for what the tool can promise — see Q12.**

- **Q12 — NEW, and it limits the claim you can make on stage.** *Bands are grade ranges, so
  they cannot express a role.* A technologist at AH11 is in the `junior` band, exactly like a
  junior clinician at AH11, so a task gated `leadBands: ['junior']` **will let that
  technologist lead it.** Measured against the live engine, not reasoned:

  | Gate on the task | Junior-graded technologist leads? |
  |---|---|
  | `leadBands: ['junior']` alone | **YES** — the band cannot tell them apart |
  | `requiresSkill: 'registered'` **+** `leadBands: ['junior']` | no |
  | `requiresSkill: 'registered'` alone | no |

  **What this means, stated precisely.** The four-band split genuinely fixed the case it was
  for: AH7–AH10 staff can no longer lead a junior-gated task, and five of the twelve demo
  staff lost that eligibility. It did **not** — and could not — fix "a technologist who holds
  a junior grade". Those are two different problems and only one of them is a grade problem.

  **The workaround, and why you cannot actually run it on stage today.** In principle you gate
  on a *skill* instead of a band: put `registered` in the task's requires-skill field and give
  the person that skill. The engine treats a skill as an opaque string and ANDs it with the band
  gate, so the mechanism is sound.

  ⚠️ **But the staff table has no skills column.** Only the example department's seeded people
  carry skills; the wizard says so on screen (`RosterDemoWizardTables.jsx:1640`, `:1648`). For a
  team typed in by hand, putting a skill on a task refuses the whole run. That is open defect
  **D5** — *"the slot 'needs skill' input is reachable but unusable for a typed-in team"* — and it
  makes this workaround **demo-only**. *(Corrected 2026-08-15: this paragraph previously told you
  to type into a Skills column that does not exist. You would have found that out in front of an
  audience.)*

  **But `requiresSkill` is a single string, not a list, so a task can demand exactly ONE thing.**
  That means registration and real competency compete for the same slot. Measured:

  | Task gate | Who can lead |
  |---|---|
  | `requiresSkill: 'CPET'` | registered+CPET **and technologist-with-CPET** ← technologist gets in |
  | `requiresSkill: 'registered'` | registered+CPET **and registered-without-CPET** ← wrong competency gets in |
  | `requiresSkill: ['CPET','registered']` | **refused** — *"must be a skill name"* |
  | `requiresSkill: 'CPET+registered'` | **refused** — *"nobody holds that skill"* |

  So Paediatric CPET — which needs a registered clinician *who is also CPET-competent* —
  **cannot be expressed at all today.** You pick one requirement and let the other through. The
  only escape is a fake compound skill like `CPET+registered` — for which, for a typed-in team,
  there is no column to enter it in either
  column, which is exactly the "museum of special cases" the v1.11.0 primitives work existed to
  end. This is the real argument for a proper field: not that "skill" is the wrong word, but
  that **you only get one, and registration would eat it.**

  **What a first-class field means:** one more column on the person, checked *in addition to*
  skill and band rather than instead of them —

      Name            Grade   Registration   Skills
      Bruce Banner    AH14    Registered     CPET, Sleep
      Kamala Khan     AH11    Technologist   CPET

  — so a task can say band `junior`+, registration `Registered`, skill `CPET`: three independent
  requirements ANDed, which is how `leadBands` and `requiresSkill` already compose. It is a third
  eligibility axis, not a new concept, and the engine's primitive design already has the shape
  for it.

  **Do not call it `role`. That name is taken, and it is load-bearing.** A slot already has a
  `role`, and it does two jobs — neither of them "constrain who is eligible":

  1. It is the human-readable slot label (`unfilled[].role` carries `'Junior embryologist'`).
  2. **It is the identity key for affinity and pairing.** Continuity is *scoped to the role*, so
     "the same practitioner at each clinic" pins the lead without also concentrating the
     co-lead slots on one person; and `COMPOSE_PAIRING` groups a shift by matching
     `fill.position.role === anchorRoleOf(task)`.

  So reusing the word would not merely read oddly — it would collide with the field that makes
  continuity and pairing work, in a way that would be very hard to unpick later.
  `registration` or `staffCategory` avoids it.

  **DECIDED for now: do not build it before the two presentations.** It changes the staff table,
  which is the exact screen the respiratory and psychology teams are being shown, and the demo
  fixture does not need it — it gates on `CPET` and on bands, both of which work. Two things
  follow: **(a) do not claim registration gating on stage** — with one skill per task it is not
  really there; and **(b) raise it *with* those two teams rather than before them.** They will
  tell you whether their real constraint is a boolean (registered / not) or an ordered list
  (registered / provisionally registered / assistant / student), and that decides the design.
  Building it before you know is how it becomes the fifth special case.

  **UPDATE 2026-08-17: the respiratory presentation has now happened** — a Teams sharing session
  in Sandbox with respiratory therapists and Vincent Chua, AHD Director. Point **(b)** above was
  to raise the boolean-vs-ordered-list question *with* that room. **Whether it was raised, and
  what they said, is not recorded here** — so `Q12` is still open on exactly the point that was
  meant to close it. Worth capturing while the conversation is fresh.

  **What that room DID produce was better than a demo: respiratory's first real interview.** The
  therapist lead watched, then walked through the configuration with you and described her
  service — minimum grade AH12, three areas (NICU, CICU, Ward 65 HiD), rotation across them,
  Monday to Friday. That is now the **sixth shape**, `shape-graded-floor-rotation`, and
  respiratory has stopped being one of the professions the picker deliberately offers nothing to.
  It also produced the finding below.

**ANSWERED-IN-PART 2026-08-17** — `Q12`'s sibling arrived before `Q12` did:

- **A band cannot express a grade threshold, and respiratory's first requirement is one.** She
  said **minimum AH12**. `leadBands` gates by band; `junior` is **AH11–AH12**; so the closest
  sayable gate admits AH11 as well. There is no grade-threshold requirement in the engine —
  eligibility has exactly three kinds (skill, region, cohort window).

  **Decided: the bands do not move.** Setting respiratory's ruler to `[7,11] [12,12] [13,14]
  [15,17]` would land the gate exactly on AH12 — the validator permits a one-rank region — but it
  would call an AH11 respiratory therapist **non-exempt**, and `Q11` settled that AH11–AH12 are
  junior AHPs. The scale stays aligned to the AHP job grades; one department's gate does not get
  to redefine what a grade means. Queued as item 5(b) instead.

  ⚠️ **What that costs, today, on the deployed site.** The shipped respiratory shape is correct
  *only because its cast has no AH11*. A real respiratory team typed into the wizard would carry
  the same one-grade slack, and **nothing on screen says so** — the roster would simply let an
  AH11 lead NICU. Do not claim grade-floor enforcement to that department until 5(b) ships.

**ANSWERED 2026-08-17** — `Q13`, by the roster owner, after audiology asked for it:

- **Q13 — a task, and an availability, that can say AM or PM.** Audiology's roster master asked
  for both halves: *which half of the day does this task run in*, and *is this person in for that
  half* — because things happen last minute **and** because some people work planned half days.
  The engine today has the **duration** of a half day and not its **position** — see the new
  entry in `rosterEngineV2.js` §9 — so this is a real gap, not a preference. Four sub-decisions:

  | | Question | Decided |
  |---|---|---|
  | **a** | What does a task with no AM/PM mean? | **Either half — opt-in.** The clash rule fires only when *both* tasks are labelled. Nothing existing changes its roster. Same precedent as the hours model, which is *"off until you mention it"*. |
  | **b** | How is "in for the morning only" said? | **Both.** Dated half-days for the last-minute case, *and* a standing weekly pattern for a contracted half work day. One does not cover the other. |
  | **c** | Does the `.ics` gain real times? | **No.** Events stay all-day; the half is named in the `SUMMARY`. Real times would mean committing to `Asia/Singapore` and to session hours no department has agreed, and would reverse a documented export decision. |
  | **d** | When is it built? | **After single-cell shift editing** (queue item 3). A half-day marker you can only change by regenerating the whole week does not help somebody correcting Wednesday at lunchtime. |

  ⚠️ **What `Q13a` costs, stated where the decision is made rather than buried.** Opt-in means a
  department that labels **some** tasks and not others is protected only among the labelled ones.
  Label the morning clinic and leave the afternoon review unlabelled, and the engine will still
  put both on one person — correctly, by the rule chosen here, and *surprisingly*, to the roster
  master who thinks they have turned AM/PM on. The wizard has to say so at the point of entry;
  that is a build requirement of item 4, not a documentation footnote.

  **The field will be called `session`, and unlike `Q12` this name is safe** — checked, not
  assumed. Inside the roster modules every occurrence of "session" is already prose meaning this
  exact concept, a half-day block of work; `sessionId` / `sessionLabel` exist only in
  `AuraChat.jsx`, `ConventionalForm.jsx` and `LanguageGate.jsx`, which have no import path to the
  engine. The engine's own comment on `DEFAULT_TASK_HOURS` already says teams *"configure
  SESSIONS … and two of them make a working day"*. The concept is named; only its position is
  missing.

> ### ⚠️ RENUMBERED 2026-08-14 — these are now **Q**n, not **D**n, and the reason matters
>
> `D5`–`D8` meant **two completely different things** depending on which document you opened:
>
> | id | here, as a decision | in `CHANGELOG.md` and the audits, as a *defect* |
> |---|---|---|
> | 5 | which `TEAM_DIRECTORY` roles are rosterable | the slot "needs skill" input is unusable |
> | 6 | **`firestore.rules`** | the ESLint config disables `no-unused-vars` for the engine |
> | 7 | the untrue case-volume claim in the README | `compileQuota`'s comment contradicts the validator |
> | 8 | was the 6 May change a major version | the impossible-floor refusal ignores the hours model |
>
> So *"settle D6 before another department's data is involved"* pointed a reader at a linter
> setting. **The audit's `D` = Defect series keeps its numbers** — it is cited across several
> released CHANGELOG entries, and rewriting a shipped release's record to tidy a name would be
> the worse trade. So the *decisions* are renamed here, keeping their numbers so that anything
> said in conversation still maps: `D3 → Q3`, and so on up to `Q12` — **there is no `Q9`**: the decision that would have held that
> number was answered before the renumbering, so the series runs `Q1`–`Q8` and `Q10`–`Q13`.
> *(`Q13` was added 2026-08-17, after this banner was written; the series simply continues.)*

Still open — **Q** for a question only you can answer:

- **Q3** — should the requester be told when a swap is accepted or declined? Currently nobody tells them. Needs a second listener or a Cloud Function.
- **Q4** — partition the roster per year/team instead of one `roster_2026` document. Needs a migration decision. **Widened 2026-08-17: this is the multi-institution question.** 28 allied health professions across several SingHealth institutions cannot share one document, and `WelcomeScreen.jsx:109` admits only `@kkh.com.sg`. The engine is *not* the obstacle — it holds no site concept and already takes per-team bands, rules and tasks — so this is persistence plus authorization, and it is **blocked on `Q6`**: partitioning before rules deploy is false assurance. See the multi-institution note at the foot of `ROSTER_TODO.md`.
- **Q5** — which `TEAM_DIRECTORY` roles are rosterable? (Recommend `role === 'staff'`, matching today.)
- **Q6** — ⚠️ **ANSWERED 2026-08-18, AND THE FINDING IS WORSE THAN THE QUESTION.** You supplied the console rules. Their operative clause is `match /{document=**} { allow read, write: if isVerifiedStaff(); }`, and `isVerifiedStaff()` is **any verified `@kkh.com.sg` address — not your ten-person directory.** The Firebase API key is public (it ships in the bundle), so any KKH employee who registers an account can today read `wellbeing_history` — the per-clinician burnout record — and overwrite the duty roster and approve any swap. Whole-hospital, not internet-wide, and live right now. The reconciled rules close it, are wired to deploy on merge, and are emulator-verified (31/31, including four checks proving exactly that outsider now gets nothing). **Two of your five hand-written blocks governed nothing** — `community_resources` (0 references in the codebase) and `feeds` (a UI view name, not a collection). **Two live pathways would have been killed silently** by the pre-reconciliation proposal — public screening telemetry and sandbox feedback — and both now ship open-but-shape-pinned. **Still yours before merge:** the §3 pre-flight, the §6 Playground cases, and a capture of the current console rules for rollback. *(Original text follows.)*
- ~~**Q6**~~ — **`firestore.rules`.** *(Corrected 2026-08-14: an earlier version of this line said "there is none in the repo", which contradicted §4 of this same document.)* The file **now exists and is tracked** — derived call-site by call-site rather than from a template — but it is an **inert proposal**: `firebase.json` declares only `hosting` and `functions`, so nothing deploys it. Roster writes remain client-side and authorization still lives only in your Firebase console, unversioned. Fine for one trusted team; **this is the first thing to settle before another department's data is involved.** I need your console's current rules to wire it safely.
- **Q7** — the case-volume / skill-mix claim at `README.md:35` and `AppGuide.jsx:28` is still untrue. The research you supplied gives a legitimate route to making it true (NHPPD × Average Daily Census → required hours → FTE → slot counts).
- **Q8** — was the 6 May schema change a major version? `version-steward` chose 1.6.0 (minor) and flagged the argument for 2.0.0. *(Note: v1.13.0 was classified minor on separate evidence — `rules.bands` is never persisted — which says nothing either way about 6 May.)*

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

   **Respiratory and audiology are both named instances of this *(2026-08-17)*.**

   **Respiratory** has a shape in the picker — but it is deliberately **not** offered to
   respiratory therapists as *theirs*. One KKH team described it; RTs work across every
   institution in the cluster and rotate differently, so pointing all of them at one team's
   structure would repeat the exact over-claim the twelve invented arrangements made. The shape is
   attributed to the team that described it, reachable by what it *does*, and suggested to nobody.
   **Also read the grade-floor warning in §5 before promising anything about job grades there.**

   ⚠️ **The same correction landed on all six shapes, and it is worth saying on stage.** Every
   shape here came from ONE team at ONE institution, and until 2026-08-17 the picker told a
   visitor *"this is the shape your own profession described to us"*. It now says one team, at one
   institution, and that colleagues elsewhere roster differently. If you are asked *"does this
   assume everyone works like KKH?"* — the honest answer is that it did, in the copy, and no
   longer does. `sourceScope` on every shape is the field that keeps it honest as more teams are
   asked.

   **Audiology.** Their roster master — an audiologist — said he **might be interested to try
   it**, which makes audiology the third profession after respiratory and cardiology.
   Deliberately, audiology has **no** shape: he asked for a feature (AM/PM), he did not describe
   his week. A conversation is not a structure, and the picker still offers his profession
   nothing — which is correct until somebody says what an audiology roster looks like. Two things about that department before anything
   is promised:

   - **His second-in-charge does the rostering, weekly, a week ahead, in Excel.** The pilot is
     therefore not a greenfield: there is a working spreadsheet, a weekly cadence and in-week
     corrections. The spreadsheet is the incumbent, and *"can it take what we already have"* will
     be asked before any feature is. Nothing in the queue answers that yet — logged at the foot of
     `ROSTER_TODO.md`.
   - **Ask for the numbers first:** how many staff, how many sessions a week. A pilot sized in
     conversation rather than in numbers is how "it does not scale" gets discovered in front of
     the person you were trying to convince.

   And per point 3's own rule, this is still a pilot conversation: one shared document and a
   hardcoded team directory do not become multi-team because a third department said yes.
4. Your strongest material is `ROSTER_POSTMORTEM.md` + `ROSTER_QC_AUDIT.md` — an audit that found its own author's diagnosis wrong in five places. For colleagues deciding whether to trust their duty roster to your software, that is more persuasive than a clean demo.
