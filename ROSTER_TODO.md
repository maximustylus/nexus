# AURA Roster — Remediation Ledger (rev 2)

Companion to [ROSTER_POSTMORTEM.md](ROSTER_POSTMORTEM.md) and the independent
[ROSTER_QC_AUDIT.md](ROSTER_QC_AUDIT.md).

**Rev 2 re-plans rev 1 substantially.** The audit found that rev 1's central ordering argument
was built on a claim that was too generous to C2, that rev 1's date fix (old P1.1) **would have
introduced** the bug it claimed to fix, and that four rows were marked `DONE` while the source
files were byte-identical to `HEAD`. Those `DONE` markers were false and are removed.

**Ledger rule:** an item is `DONE` only when the Evidence column holds real, pasted output.
"The code was edited" is not evidence. `qc-steward` audits this file.

---

> ## ⚠️ STATUS PASS 2026-08-15, against v1.14.0 — the P0–P8 plan is FINISHED
>
> **Everything from `P0` to `P8` has shipped**, across v1.6.0 → v1.14.0. The plan sections below
> are kept as the record of what was decided and why — including the rev-1 mistakes, which is the
> point of the "Corrected in rev 2" note at the foot of this file. But they are written in the
> imperative, as work still to do, and they are no longer that.
>
> **Where to look instead, for what is true today:**
>
> | Question | Answer lives in |
> |---|---|
> | What is still broken | the `### Known issues` table under `[1.14.0]`/`[1.13.0]` in [CHANGELOG.md](CHANGELOG.md) — **authoritative** |
> | What is live, and what to click | [ROSTER_HANDOFF.md](ROSTER_HANDOFF.md) §1 |
> | What the owner still has to decide | [ROSTER_HANDOFF.md](ROSTER_HANDOFF.md) §5, ids `Q3`–`Q12` |
> | What to build next | **§Current queue** at the foot of this file |
>
> ### ⚠️ `D` MEANS THREE DIFFERENT THINGS IN THIS FILE. Read this before following any id.
>
> This is the worst id collision in the document set, and it is worse here than anywhere else:
>
> | As written | Means | Now |
> |---|---|---|
> | "Awaiting decisions **D1–D3**" (P6), "**D4–D6**" (P7), "**D7**" (8.4), "deferred to **D3**" (2.4) | a **decision for the owner** | **renamed `Q`n** in `ROSTER_HANDOFF.md`, same numbers — so these read `Q1`–`Q7`. Every one of these cross-references pointed at a document where the id had already changed. |
> | "added to post-mortem **D3**" (P0.7 evidence row) | a **defect** in the post-mortem's series | unchanged — defect ids keep `D`, because they are cited in already-released CHANGELOG entries |
> | "Block **D1**" (P0 heading) | a post-mortem **work-block** label, not an id at all | unchanged |
>
> So `D3` appears in this one file meaning *a decision* (line ~100, ~146) and *a defect* (the
> P0.7 evidence row) — two unrelated things. Decision references below are corrected to `Q`n and
> marked; the other two senses are left alone and now say which they are.
>
> **Grade bands changed after most of this file was written.** The scale had THREE bands (`junior`
> = AH7–AH12) and now has FOUR — `nonExempt AH7–AH10 · junior AH11–AH12 · senior AH13–AH14 ·
> principal AH15–AH17` — because AH7–AH10 are non-exempt staff and AH11–AH12 are junior AHPs. Any
> three-band assumption below predates that.
>
> **Test counts below are historical measurements, correct on their dates.** The suite is **1639
> tests across 28 files** today.

---

## Delegation tiers

| Tier | Meaning | Who runs it |
|---|---|---|
| **Opus-alone** | Closed scope, fully verifiable on return — a passing assertion, a grep that must return zero, a specific line that must exist. Delegated to an Opus subagent; orchestrator reviews diff **and** evidence before accepting. | Opus subagent |
| **Fable-supervised** | Needs continuous judgment: a cross-component data contract, a live-data migration, a clinical-domain semantic, or a security boundary unverifiable from source. Held by the orchestrator, and **paused for the user** when the call is theirs. | Orchestrator (+ user) |

---

## Execution order — rev 2

```
P0  Test harness                      ── nothing below is verifiable without it
P1  Safety guards  (C2 + M1 + M3)     ── CRITICAL, armed TODAY, needs no decision
P2  Honest reporting (A-RC4 + M8/M9)  ── stops "success" being printed unconditionally
P3  Alert surface   (M5)              ── the coverage alert currently never appears
P4  Date correctness (B1 + M2)        ── re-specified; rev 1's fix was wrong
P5  Exports        (M6 + M7 + M10)    ── malformed ICS / demo undefined / CSV injection
P6  Schema split-brain (Block A)      ── was BLOCKED on decisions Q1–Q3 · SHIPPED v1.6.1
P7  Persistence, config, rules (C)    ── still BLOCKED on Q4–Q6 (Q6 now critical path)
P8  Docs, version, changelog (E)      ── last: describes what is finally true
```

**Why this order changed.** Rev 1 put the date work second and derived its whole sequence from
the claim that C2's destructive write was *latent* — dangerous only once the swap fix landed.
The audit refuted that: **M1** (demo config survives into live mode) and **M3** (`parseInt("")`
→ `NaN` → empty roster → unmerged `setDoc`) both destroy the live roster today, with a success
message, and neither involves a swap. So the destructive-write class is promoted to first
position after the harness.

P2 is second because it is the highest value-per-line change in the whole ledger: root cause
A-RC4 (success asserted, never observed) is what makes every other defect *invisible*, and it
is fixable now without waiting on any clinical decision. The audit was right that rev 1 buried
it at fourth of five root causes behind three architectural items that are all blocked.

P4 sits behind P1–P3 because B1 produces a *wrong* roster while C2/M1/M3 produce *no* roster,
and because B2/M2 cannot fire on the `Asia/Singapore` deployment at all.

---

## P0 — Test harness · post-mortem work-block D1 *(a block label, not a defect or decision id)* · **Opus-alone** · risk: low

| Step | Detail | Verdict |
|---|---|---|
| 0.1 | `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` in devDependencies; `test` + `test:watch` scripts. | **DONE** |
| 0.2 | `vitest.config.js` — jsdom, `globals: false`, React plugin. | **DONE** |
| 0.3 | Delete `src/components/Aura.utils.test.js` (byte-identical duplicate of the hooks test, confirmed by `diff`). | **DONE** |
| 0.4 | `Aura.hooks.test.js` import `'./aura.hooks'` → `'./Aura.hooks'`. | **DONE** |
| 0.5 | `src/utils/auraEngine.test.js` — 23 characterization tests pinning current `generateRoster` output, including two `CURRENT BUG:` tests that deliberately encode the B1 bug. | **DONE** |
| 0.6 | Test step in `.github/workflows/deploy.yml` before build. | **DONE** |
| 0.7 | **NEW — ESLint config.** `npm run lint` has never worked: no config file exists anywhere in the repo, so it exits 2 on any invocation. Add a flat/legacy config matching the React+hooks plugins already in `devDependencies`, then add lint to `deploy.yml`. | **DONE — v1.11.0** *(was `TODO`)* |

**Acceptance:** `npm test` exit 0 with pasted counts; `Aura.utils.test.js` absent. *(The original
acceptance criterion "`npm run lint` exit 0" was unachievable and has been split out as 0.7 —
lint was already broken at `HEAD`, independently of this plan.)*

---

## P1 — Safety guards · C2 + M1 + M3 · **Opus-alone** · risk: medium · **DO FIRST**

Every step is a guard. None changes the rostering algorithm, so all are verifiable in isolation.

| Step | Detail |
|---|---|
| 1.1 | `RosterView.jsx:94` — `setDoc(ref, newData, { merge: true })`, so generating one period cannot erase others. |
| 1.2 | **M3:** guard `weeks`. `parseInt` → validated integer with a floor of 1 and a sane ceiling; reject `NaN`. Disable the Generate button while invalid. |
| 1.3 | **M3 (defence in depth):** refuse to write when `generateRoster` returns an empty object — assert `Object.keys(newData).length > 0` before `setDoc`, and surface a real error if not. |
| 1.4 | **M1:** reset `config` when leaving demo mode. The effect at `RosterView.jsx:43-72` must restore the live staff pool and task list in its `else` arm, not only `rosterData`. |
| 1.5 | Make the confirmation modal truthful: name the exact date range about to be written, and the staff pool it will use (so an M1-style demo pool is visible before the click, not after). |
| 1.6 | Tests: a key outside the generated range survives generation; `weeks: NaN` never reaches `setDoc`; leaving demo mode restores the live staff pool. |

**Acceptance:** three new passing tests; `grep -n "setDoc" RosterView.jsx` shows the merge option; the modal string contains a computed range.

---

## P2 — Honest reporting · A-RC4 + M8 + M9 · **Opus-alone** · risk: low

The two-line class of fix that makes everything else detectable.

| Step | Detail |
|---|---|
| 2.1 | `AuraPulseBot.jsx:354-370` — make the success message **conditional on an observed change**. Compare the mapped array against the original; if nothing changed, report failure and do not claim the roster was updated. |
| 2.2 | **M9:** stop writing `status: 'APPROVED'` (`:341`) *before* the roster mutation. Order it after a verified roster write, or compensate on failure. Today a failed roster write leaves an `APPROVED` ledger entry. |
| 2.3 | **M8:** add error callbacks to both `onSnapshot` calls (`RosterView.jsx:67`, `AuraPulseBot.jsx:108`). A Firestore rules denial currently fails completely silently. |
| 2.4 | **M4 (partial):** delete the false promise at `AuraPulseBot.jsx:378` — *"{requester} will be notified"* — there is no mechanism. Actually notifying the requester is a feature, deferred to **Q3** *(decision; was written `D3`)*. |
| 2.5 | Test: a mutation that matches nothing produces a failure path, not a success message. |

**Acceptance:** a test proving the no-match path cannot report success.

---

## P3 — Alert surface · M5 · **Opus-alone (with review)** · risk: low

| Step | Detail |
|---|---|
| 3.1 | `App.jsx:626` — pass `onOpen={() => setIsAuraOpen(true)}` to `AuraPulseBot`. Today `onOpen` is never passed, so `if (onOpen) onOpen()` at `AuraPulseBot.jsx:112` is a no-op and **the coverage request never surfaces** — falsifying `README.md:18`'s "forces open its UI". |
| 3.2 | Prevent `startSession`/`handleClearChat` from discarding a queued `ROSTER_ALERT` via `setMessages([greeting])`. |
| 3.3 | Verify the listener's remount behaviour: on mount, every still-`PENDING` doc arrives as `added`, so alerts re-fire each session until the status changes. Confirm that is intended (it is arguably the only reason the feature is not entirely invisible today). |

---

## P4 — Date correctness · B1 + M2 · **Opus-alone** · risk: medium · **re-specified**

⚠️ **Rev 1's fix was wrong and must not be used.** It replaced `toISOString` with local getters
while leaving `new Date("YYYY-MM-DD")`'s UTC parse in place, which produces keys one day early
outside UTC+8 — measured: `TZ=America/New_York` → `2026-01-31, 2026-02-01, …`.

| Step | Detail |
|---|---|
| 4.1 | Make both halves consistent: parse `startDate` into a **local** date from its parts (`new Date(y, m-1, d)`) **and** derive keys with local getters. Changing either half alone is worse than changing neither. |
| 4.2 | **B1:** `snapToMonday(startDate)` — normalize to the Monday of the week and return the effective start so the UI can display it. The shipped default `2026-02-01` (Sunday) becomes Mon 2 Feb 2026. |
| 4.3 | `RosterView.jsx:20` — default the calendar to the current month, not the hardcoded `new Date(2026, 1, 1)`. |
| 4.4 | `RosterView.jsx:104` — non-mutating `handleMonthChange`. |
| 4.5 | Tests, TZ-parameterised: all core keys Mon–Fri, `VC (PM)` Tuesdays, `VC (AM)` Saturdays, passing under `Asia/Singapore`, `America/New_York` **and** across the 2026 US spring-forward (`start 2026-03-02`, which currently slides weeks 2–4 to Sun–Thu). Invert P0.5's two `CURRENT BUG:` tests here. |

---

## P5 — Exports · M6 + M7 + M10 · **Opus-alone** · risk: low

| Step | Detail |
|---|---|
| 5.1 | **M6:** escape RFC 5545 TEXT properly — `,` `;` `\` and newlines — in `SUMMARY`/`DESCRIPTION` (`auraEngine.js:103-104`). The current output emits an unescaped comma, introduced by the 6 May refactor. |
| 5.2 | **M6:** add `UID` and `DTSTAMP` per VEVENT so re-importing updates rather than duplicating. |
| 5.3 | **M7:** both exporters emit `undefined` for `week`/`lead`/`coLead` in demo mode, because the demo transform never sets them. Either populate them or block export in demo mode. |
| 5.4 | **M10:** CSV field quoting/escaping, and neutralise leading `=`/`+`/`-`/`@` (formula injection into a file explicitly designed to be opened in Excel). |

---

## P6 — Schema split-brain · Block A · **Fable-supervised** · ~~**BLOCKED**~~ **SHIPPED v1.6.1**

~~Awaiting decisions **Q1–Q3**~~ *(written `D1–D3`)* in [ROSTER_HANDOFF.md](ROSTER_HANDOFF.md).
**SHIPPED in v1.6.1** — this section's own evidence row records it, so the `BLOCKED` in the
heading contradicted the ledger below. Plan shape unchanged
from rev 1 (shared `shiftSchema` module; add `swapRole` to the swap contract; rewrite the
mutator against `lead`/`coLead`; read back before reporting; replace the substring filter at
`RosterView.jsx:296`; decide legacy-document handling; M11's admin-swap no-op). Rev 2 adds:
**resolve A1's live status first** — one read of `system_data/roster_2026` settles whether the
defect is currently active, and the answer changes 3.6's migrate-vs-tolerate call.

## P7 — Persistence, config source, security rules · Block C · **Fable-supervised** · **STILL BLOCKED — `Q6` is now the critical path**

Awaiting **Q4–Q6** *(written `D4–D6`)*. Per-year document partitioning; staff pool from
`TEAM_DIRECTORY`; a **deployed** `firestore.rules`; the consecutive-day validation
`README.md:159` already documents.

**Partly moved, 2026-08-15.** `firestore.rules` now EXISTS and is tracked — derived call-site by
call-site rather than from a template, with a runbook at `firestore.rules.README.md`. It is still
**inert**: `firebase.json` declares only `hosting` and `functions`, so nothing deploys it.

**Q6 is now on the critical path, not adjacent to it.** Cardiology's roster master asked for a
*time-gated roster release* to stop premeditated sick leave — and that is an authorization
feature, not a UI one. The roster document is read client-side by every client, so hiding it in
the UI while no rules are deployed would be false assurance about the exact fairness property she
wants. Needs the owner's current console rules.

## P8 — Docs, version, changelog · Block E · **split**

| Step | Tier | Detail |
|---|---|---|
| 8.1 | Opus-alone | Pin `@google/generative-ai`; strip the trailing whitespace in `package.json`. |
| 8.2 | Opus-alone | `version-steward`: reconcile `package.json` `1.0.0` ↔ README `v1.5` ↔ badge `AURA v2.3`; create `CHANGELOG.md`; establish the first tag. |
| 8.3 | Opus-alone | Replace the 7 `alert()` calls (`RosterView.jsx` 78, 80, 96, 99, 129, 141, 150) with the existing `ConfirmationModal`/a status banner, making `README.md:181` true. **Deferred until after P2** — four of the seven sit in paths P2 rewrites. |
| 8.4 | **Fable-supervised** | Correct the case-volume / skill-mix claims (`README.md:35`, `AppGuide.jsx:28`). **BLOCKED on Q7** *(written `D7`)*. |
| 8.5 | Opus-alone | Update `README.md:18` ("forces open its UI") and `:159` to match reality after P3/P6. |

---

## Evidence ledger

| Item | Verdict | Evidence |
|---|---|---|
| P0.1–0.4 | **DONE** | `git diff package.json`: vitest ^2.1.9, @testing-library/react ^16.3.2, jest-dom ^7.0.0, jsdom ^29.1.1, `"test": "vitest run"`. `vitest.config.js` present (jsdom, `globals:false`). `git status`: `D src/components/Aura.utils.test.js`. Import diff `'./aura.hooks'` → `'./Aura.hooks'`. |
| P0.5–0.6 | **DONE** | `src/utils/auraEngine.test.js` (23 tests) created; `deploy.yml:17` `run: npm test` added before the build step. |
| **P0 acceptance** | **DONE — verified by orchestrator, not by the subagent** | `npm test` → `Test Files 2 passed (2) / Tests 50 passed (50)`; separately `npm test >/dev/null 2>&1; echo $?` → `TEST_EXIT=0`. The subagent died on an upstream API 529 *before* running verification both times, so this was run and read directly. Test file reviewed line-by-line before acceptance; stale rev-1 plan references in its comments (P1→P4, P3→P6) corrected, suite re-run green afterwards. |
| P0.7 (lint) | **DONE — shipped v1.11.0** | *Was `TODO`: `npm run lint` → `EXIT=2`, "ESLint couldn't find a configuration file"; `git ls-files \| grep -i eslint` → empty — pre-existing at `HEAD`, not caused by P0, and recorded as post-mortem **defect** `D3` (the defect series, not the decision series).* Now: `.eslintrc.cjs` and `.eslintignore` are tracked, lint passes clean, and it is a CI gate after the test step. It could not run **locally** until 2026-08-14 — cause was iCloud evicting `node_modules`, not the code; `/private/tmp/nexus-jsdom/verify.sh` runs both gates in ~35s. |
| P1 (safety guards) | **DONE — shipped v1.6.0** | Merge write, weeks validation, empty-roster refusal, demo→live config reset, truthful modal. 113 guard tests. |
| P2/P3/P6 (swap flow) | **DONE — shipped v1.6.1** | Mechanical substitution per **Q1** *(decision; was written `D1`)*; read-back verification before `APPROVED`; `onOpen` wired at `App.jsx`; admin on-behalf requests. 91+26 swap tests. The mutator tolerates the legacy shift shape, so the A1 LIVE-VERIFY read became unnecessary. |
| V2 engine + sandbox | **DONE — shipped v1.7.0** | `rosterEngineV2.js` (174 tests, mutation-tested), wired into demo mode with `DEMO_EXAMPLE_DEPARTMENT`; deploy verified in live bundle `index-Ck4olkEf.js`; fake-alert strings confirmed absent. |
| P4 (dates) | **DONE — in v1.7.1** | Local parse + local keys + `snapToMonday`, per the re-specified plan (rev-1's fix was NOT used). `CURRENT BUG:` pins inverted as their comments instructed. Monday-start output byte-identical to the pre-change engine (compat pin). M2 DST case pinned as an exact key list. Suite green under both `Asia/Singapore` and `America/New_York`. |
| P8.3 (alerts) + M12 | **DONE — in v1.7.1** | `grep -c "alert(" RosterView.jsx` → 0; three-slot status banner (mounts inside whichever modal is open); session-level duplicate-request guard; all four Firestore latch patterns verified byte-identical to HEAD. 15 new tests. |
| P5 (exports) + M7/M10 | **DONE — in v1.7.1** | RFC 5545 TEXT escaping, deterministic UIDs, DTSTAMP (injectable), 75-octet folding; RFC 4180 quoting, formula-injection neutralisation, CRLF rows + UTF-8 BOM; no `undefined` in either format. 29 exporter tests on pure `buildICS`/`buildCSV`. |
| NEW — swap modal a11y | **TODO — Opus-alone** | The swap modal's two `<select>`s lack `id`/`htmlFor` pairing (found during P8.3; its tests locate them by their options as a workaround). Small, self-contained. |
| Grade bands (engine) | **DONE — v1.8.0, re-cut in v1.13.0** | AH7–AH17, `leadBands`, editable boundaries. **The scale was re-cut into FOUR bands in v1.13.0** (`nonExempt` AH7–AH10 split out of `junior`), a correctness fix: `junior` as AH7–AH12 let an AH8 assistant LEAD a junior-gated task. Originally: eligibility-not-exclusion, lead-gated/co-open, per user's decisions. 149 tests, mutation-checked; byte-identity proven over 23 comparisons. |
| Psych pack (engine) | **DONE — shipped v1.8.0** | Monthly recurrence + continuity with counted-and-named breaks. 133 tests, 16 mutations checked; byte-identity over 77 comparisons. Top documented trap: **no cross-run continuity memory**. |
| Grade-aware wizard (sandbox) | **DONE — shipped v1.8.0** | Staff/task tables + band editor; engine validation gates Generate pre-click (also fixed the refusal banner rendering behind the wizard overlay). Example department regraded; still exactly one deliberate unfilled slot. ~~Layout **unverified in a browser** — needs the user's eyes.~~ **Layout VERIFIED 2026-08-15** on the deployed site at 375×812: four band labels legible, three ruler handles at 44×44 with no overlap, all eleven tick labels unclipped, no sideways scroll. Live mode still needs the owner's login. |
| Skill∩band refusal + weights merge | **DONE — orchestrator, in v1.8.0** | Both were blocked for agents by compatibility-gate pins; pins moved deliberately, refusal + merged `SOFT_PENALTY_WEIGHTS` landed, five superseded pin-tests removed with the behaviours they pinned. Verified behaviourally (refusal fires with measured reason; control generates with the qualified lead). |
| NEXT (user's order) | **DONE — v1.9.0 / v1.10.0** | Hours model, multi-slot shifts (embryology trios), pinned self-scheduling and lab Saturday floors all shipped. See §Current queue at the foot of this file for what is actually next. |
| OPEN QUESTIONS for the user | **ANSWERED by what shipped in v1.9.0** | ~~Blocking the hours/multi-slot builds.~~ (1) Same-day durations sum against a per-person daily cap. (2) A task with no stated duration counts as a duty, not a fixed number of hours. (3) In a slotted shift the lead is whichever assignee holds the highest grade — there is no separate lead slot, which is why setting both `slots` and `leadBands` is refused. |
| P8.1 (pin dep) | **DONE** | `@google/generative-ai` `"latest"` → `"^0.24.1"` (matches installed `0.24.1`, so behaviour unchanged); `package.json` trailing whitespace removed — `grep -c " $" package.json` → 0. |
| P8.2 (version + changelog) | **DONE — verified by orchestrator** | `version-steward` ran: `1.0.0` → **`1.6.0`** (minor), `CHANGELOG.md` created (248 lines), README metadata aligned, `package-lock.json` desync fixed (it would have broken `npm ci`). Verified: version/lockfile consistent, `git tag -l` → 0, HEAD still `79e3b99`, `npm test` exit 0. Changelog's known-issues table carries A1/M1/M3/M5/M6/B1/P0.7 by id. **No commit, no tag** — deliberate. |
| P7, P8.4 | **BLOCKED** | Decisions **Q3–Q7** still open *(written `D3–D7`)*. `Q1`/`Q2`/`Q8` answered: mechanical substitution; notify-owner chosen but not yet built; 1.6.0 minor accepted. Since answered too: **Q10** "Non-exempt" is the right word, **Q11** a technologist may hold a junior grade. New: **Q12** — a task can require only ONE thing, so registration gating is not expressible. |
| Tags | **DONE — 13 tags** | `v1.5.0-pre-remediation` and `v1.6.0` → `v1.14.0`, all cut and pushed. *(The `git tag -l` → `0` in the P8.2 row below was true on its date and is now the opposite; tagging is routine.)* |
| A1 live status | **RESOLVED BY DESIGN** | The v1.6.1 mutator handles both shift shapes and upgrades legacy on write, so the answer no longer changes any decision. |
| Post-mortem rev 2 | **DONE** | Audited by `qc-steward`; 1 overstated + 4 wrong claims corrected in place, corrections marked `[rev2]`. |
| ~~A1 live status~~ | ~~**LIVE-VERIFY PENDING**~~ | **STRUCK 2026-08-15 — this row contradicted the identical row two above it**, which records `RESOLVED BY DESIGN`. Both were in the same table. The v1.6.1 mutator handles both shift shapes, so no read is needed and no decision depends on it. Kept struck rather than deleted: a ledger that silently loses a row it once carried is not a ledger. |

**Corrected in rev 2:** rev 1 marked P1, P2, P5.1 and P5.2 as `DONE` before execution. All four
were false. This is logged rather than deleted because it is the same failure mode the
post-mortem documents.

---

## Current queue — *2026-08-15, and this is the live part of the file*

Everything above is the closed P0–P8 remediation. This is what is actually next, ordered. The
ordering is not arbitrary: **items 1 and 2 come from what two more roster masters asked for**,
which is better evidence than an internal judgment about what to build.

| # | Item | Why it is here, and why in this position |
|---|---|---|
| **1** | **`Q6` — deploy `firestore.rules`.** *Needs the owner: the current console rules.* | Was "settle before another department's data is involved". It is now **blocking a named requirement from a named person**: cardiology's roster master releases weekly and **time-gates** the release to stop premeditated sick leave. Time-gating is an **authorization** feature, not a visibility one — the roster document is read client-side by every client, so a UI-only gate would be *false assurance* about the exact fairness property she wants. It also still gates C1/C3/C4 and M12's durable duplicate guard. Nothing else here should jump it. |
| **2** | **Surface `measureRosterLoad`** — per-person load and `neverRostered`. | Defect **D2/D3/D9** *(defect series)*: the engine already computes this and **discards it — there is no UI caller at all.** It is also, unmodified, the answer to cardiology's fairness complaint: "who keeps avoiding the treadmill room" is a report over data already being produced. Cheapest real win on this list. |
| **3** | **Single-cell shift editing** — change one assignment without regenerating. | Cardiology updates *daily* for sick leave; today the only tool is a full regenerate. Independently the highest-value item from the competitor analysis. Should log the change, so it doubles as the audit trail item 2 wants. |
| **4** | **A third eligibility axis** — `registration` / `staffCategory`. *See `Q12`.* | `requiresSkill` is a **single string**, so a task can require exactly ONE thing and registration competes with real competency: *"a registered clinician who is also CPET-competent"* cannot be expressed at all. **Two professions have now asked independently**, and cardiology's sign-off levels settle the shape — an **ordered list** (registered / provisionally registered / assistant / student), not a boolean. **Must not be named `role`:** a slot's `role` is both the display label and the identity key scoping affinity and pairing. Do not build before the owner confirms the levels. |
| **5** | **Supervision pairing** — "a trainee only alongside a signed-off senior". | Engine limit: a task's skill requirement gates the **co-lead** too, so "qualified senior supervising an unqualified trainee" has no representation. Cardiology named it unprompted. Depends on item 4. |
| **6** | **On-call / standby**, with post-call rest. | **Last, because it is the largest.** There is *no* concept of standby in the engine — zero occurrences. It is not a duty: it is a period with call-in, and it drags a post-call rest rule behind it. `maxConsecutiveDays` cannot see across generation runs, so a naive version would leak at every month boundary. |

**Still open and small:** the swap modal's two `<select>`s lack `id`/`htmlFor` pairing (its tests
locate them by their options as a workaround). Defects `D5`, `D6`, `D7`, `D8` and the live-mode
iOS zoom are in the CHANGELOG's known-issues table.

**One question for cardiology, worth asking before item 4:** their roster master's title is
*senior principal* cardiac physiologist. If that is a rank **above** principal, the four-band
scale is one short — and `defineGradeScale({ regions })` is the seam that must absorb it, not a
rename. Better to find that out now than mid-demo.
