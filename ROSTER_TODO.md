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
> | What is still broken | the `### Known issues` table under `[1.13.0]` in [CHANGELOG.md](CHANGELOG.md) — **authoritative**, and the only one |
> | What is live, and what to click | [ROSTER_HANDOFF.md](ROSTER_HANDOFF.md) §1 |
> | What the owner still has to decide | [ROSTER_HANDOFF.md](ROSTER_HANDOFF.md) §5, ids `Q1`–`Q8` and `Q10`–`Q12` — **there is no `Q9`** |
> | What to build next | **§Current queue** at the foot of this file |
>
> **[IDS.md](IDS.md) is the legend for every prefix in the document set** — `P`, `Q`,
> `A`–`E`, `A-RC`, `M`, `CP`, `CD`, `T`. The banner below is the detail for the one
> letter that means three things.
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
> So `D3` appears in this one file meaning *a decision* (in the P6 section and in step 2.4) and
> *a defect* (the P0.7 evidence row) — two unrelated things. *(Line numbers deliberately not
> given: this banner added 99 lines above them and any figure here would be stale within a
> commit.)* Decision references below are corrected to `Q`n and
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

## P9 — Found by the pre-merge multi-team stress test · `T1`–`T8` · 2026-08-23 · **FIXED**

Reproduce with `npm run stress:teams`; the migration's own claims are pinned by
`scripts/migrate-to-teams.test.mjs` and run in `npm test`.

> **⚠️ `T` IS A NEW SERIES AND MEANS EXACTLY ONE THING** — a defect in the multi-team
> rebuild, found by this sweep. It is deliberately not `D`n, which this file's own
> banner records as meaning three different things.

> **All eight are fixed, or mitigated where the fix would rename the live team
> (`T3`).** `npm run stress:teams` now reports **0 open · 2 documented limits**, and
> the two limits print their own reasoning. Each row below keeps the evidence that
> found it.

**None of these was a reason to hold the merge.** Everything load-bearing came back
clean, and that is worth stating as plainly as the findings: 1908 tests, lint clean,
build green, a **clean fast-forward** onto `main` with zero conflicts, and
`firestore.rules` at **95 emulator checks, 0 failed** including cross-team isolation.
The approval function — the only thing between a registered account and its own team —
answered **19 of 19** authorization and approvability attacks correctly, including an
unverified address, `emailVerified` as the string `"true"`, `config.uids` as a string
that merely *contains* the caller, a subdomain lookalike, and prototype pollution.
Nothing from a request body reached a written document.

| # | What | Evidence | Owner | Status |
|---|---|---|---|---|
| 9.1 | **`--force-overwrite` does not overwrite. It merges, and the result is a roster that never existed.** | `T1`. `write()` always calls `set(data, { merge: true })`; the flag only decides whether the "does this already exist" read is honoured. A roster document is a **map keyed by date**, so a merge unions the two: days in both are replaced by the source, days only in the destination **survive**. What lands is a hybrid of the pre-migration roster and whatever somebody had already built — neither of the two an operator believed they were choosing between. The flag is a recovery path, so it gets used under pressure, on live clinical data, by somebody who has already had one thing go wrong. Pinned by a test rather than fixed silently: delete-then-write, or refuse outright, is a decision. | me | `DONE` — it REPLACES. `set(data)` with no merge, so an operator reaching for the flag gets one of the two documents they were choosing between rather than a union of both. The plan line says `REPLACING the existing document`. 2 tests, one of which fails on the old behaviour. |
| 9.2 | **A migration re-run reverts a display name the person has since changed.** | `T2`. `users/{uid}` is written by `union()`, not `write()`, because `teamIds: arrayUnion` must always run — but it carries `displayName` and `email` unconditionally alongside it. Measured against a fake Firestore: rename a user after migrating, re-run, and the name reverts to the manifest value. The script's own error path tells an operator *"Re-running is safe: a destination that already exists is left alone"*. For `users/*`, it is not. | me | `DONE` — `union()` writes `teamIds: arrayUnion` on every run (it must: somebody may belong to another team) and `displayName`/`email` only where the document does not already carry them. The error message no longer over-promises. 3 tests. |
| 9.3 | **Two different institution/department pairs can produce one team id.** | `T3`. The hyphen joining the two halves is the same character used inside each, so the boundary is not recoverable: `KKH` + `Respiratory Therapy` and `KKH Respiratory` + `Therapy` both slug to `kkh-respiratory-therapy`. 529 realistic pairs produced 526 ids; the 3 collisions are all this shape. **`teamExists` catches it**, so no data is shared — the cost is that a genuinely new department is refused. Case and punctuation collapse correctly and by design (`KKH` and `kkh` are one institution), and the client and server copies of the slug agreed on all 64 pairs checked. | me | `MITIGATED` — the collision itself is a property of the id FORMAT, and changing that would rename the live team, so it stands. What is fixed is the consequence: see 9.4. A real fix is a separator that cannot appear inside either half, and it belongs to a version that has not migrated yet. |
| 9.4 | **The `team-exists` message describes the request, not the team that already exists.** | `T4`. The sentence is built from `request.institution` / `request.department`, so a lead who typed the words on the other side of the boundary is told *"Therapy at KKH Respiratory is already on NEXUS"* — which is not what the existing team is called. The owner cannot tell a genuine duplicate from a slug collision, which is precisely the judgement 9.3 hands them. Naming the existing team and its id would settle it. | me | `DONE` — `assertApprovable` takes `existingTeam` and returns `collision: true` when its institution/department differ from the request's, with a sentence that names both and says the id has to be resolved rather than the request refused. `LeadRequestsPanel` marks that case *"Needs your decision"* instead of showing it as another failure. 6 tests. |
| 9.5 | **`assertUid` accepts a value that is a path, not an id.** | `T5`. `"a/b"`, `".."` and `"."` all pass the guard, which refuses only whitespace and the empty string. Firestore forbids all three as document ids, so the failure is loud rather than silent — but the guard exists to fail **at the call site with a sentence**, and letting these through defeats that. `configPath` has no guard at all and composes `["config", ""]`. | me | `DONE` — `assertUid` refuses `/`, `.`, `..` and `__…__`; `configPath` takes an **allowlist**, which is right for the one collection whose complete set of legal documents is known and permanent. 11 tests. |
| 9.6 | **`assertUid` cannot tell a single-word display name from a uid.** | `T6`. The guard catches `"Ying Xian"` and not `"Sarah"`. Its own comment says it is "deliberately shaped to catch the OLD habit rather than to validate Firebase's format precisely", so this is a known limit rather than an oversight — recorded because the limit was not written down, and because display-name keying is the defect the whole rebuild exists to end. A length floor is the obvious tightening and was **measured and rejected**: a uid draws from 62 alphanumerics, so about **0.7% — one user in 140** — contain no digit at all, and a guard that locks one clinician in every 140 out of their own wellbeing record is a worse defect than the one it prevents. | me | `DONE, DIFFERENTLY` — the property that cannot be checked at runtime is checked in the source instead. `teamPaths.source.test.js` asserts that no call site hands a name-shaped expression to a uid-keyed builder, **and** that nothing composes a team path from a string literal. That second assertion found four files doing exactly what `teamPaths.js`'s header forbids — `App.jsx`, `ProfileView.jsx`, `WellbeingView.jsx`, `NexusContext.jsx` all built `users/…` by hand, bypassing `assertUid` entirely. All four now go through `userPath`. |
| 9.7 | **The anonymous wellbeing sentinel shares an id space with real uids.** | `T7`. `wellbeingDocPath(team, "_anonymous_logs")` resolves to the shared anonymous aggregate rather than being refused. Unreachable in practice — Firebase uids are 28 alphanumeric characters — so this is converting an assumption into an enforcement, not fixing a live bug. | me | `DONE` — `wellbeingDocPath` refuses it and points at `anonymousWellbeingPath`. 2 tests. |

| 9.8 | **Free text from a request is written verbatim, while the owner's own field is capped.** | `T8`, found by the same sweep and missing from the first draft of this table — logged rather than quietly added. `buildDeclineWrite` has always sliced its reason to 500 characters, and that field is written by the **owner**. The institution, department and display name come from whoever registered, go into the team document unbounded, and are rendered in the team switcher, the roster header and every screen that names a department. Measured: a **5,000-character department name was stored at 5,000 characters**. | me | `DONE` — `MAX_FIELD_CHARS = 120`, longer than any department in the cluster. The decline reason keeps `MAX_REASON_CHARS = 500`: an earlier draft of this fix routed it through the same 120-character cap, which would have truncated an owner's explanation to a colleague — a worse defect than the one being fixed, and the reason both constants are named. 3 tests. |

**Test coverage, stated rather than implied.** `TeamSwitcher.jsx` and
`LeadRequestsPanel.jsx` have no test file. The switcher's own header calls it *"the
most consequential control on the screen: every roster, swap and wellbeing record
below it changes meaning when it changes"* — so its most consequential property is
now pinned by `RosterView.teamswitch.test.jsx`: **switching to a team with no roster
yet must not leave the previous team's shifts on the calendar.** That is the exact
shape of a bug `RosterView` already fixed once for the demo↔live toggle (*"if the
live document does not exist, no snapshot ever replaces them"*), and the reason the
new test passes on the first run is that the same lesson was applied to the team
effect. It was untested, which is a different thing from being unfixed.
`LeadRequestsPanel` remains presentation over a callable whose decision logic has 39
tests.

**Scale is unchanged, because the engine is untouched.** `npm run stress` reports what
it reported before: no invariant broken across 1265 generated rosters, the `AM/PM`
clash still reproduced (queue item 4 / `Q13`), `D10` still closed. `D11` also stands —
200 staff over 52 weeks takes **35 seconds** of synchronous generation. Per-team
partitioning keeps most departments at 20–40 people where it is comfortable; it does
not make that number smaller, and the release notes should not imply it does.

---

## P10 — The two doors out of the holding screen · `T9`–`T12` · 2026-08-23 · **FIXED**

An authenticated user with no team and no pending request lands on `AccessGate`, and
until now that screen was a dead end with one sentence on it. Two doors were added —
**explore the sandbox**, and **declare yourself a lead** for somebody who registered
as staff and only afterwards realised they run a department. The rules already permit
the second; it was a missing form, not a missing permission.

> **`T9`–`T12` ARE NOT STRESS-TEST FINDINGS.** `T1`–`T8` came from `npm run stress:teams`.
> These came from auditing what the new sandbox door makes REACHABLE: demo mode had
> only ever been entered signed-out, or by a member of the legacy ten-person directory,
> and both of those carry a `teamId`. `isDemo === true` with `teamId === null` was a
> combination no view had ever been rendered with, and `assertTeamId(null)` throws by
> design.

| id | what was wrong | evidence | fix |
|---|---|---|---|
| `T9` | **`SmartAnalysis` published the sandbox's fabricated report into the real year-end archive.** `handleAnalyze` returns a hardcoded Marvel brief in demo mode — Peter's burnout, Steve's Shield Integration — and `handlePublish` had no matching `isDemo` guard, so PUBLISH wrote it to `teams/{id}/reports/{year}` and overwrote every `projects/{year}/staff/{uid}` document with the demo team's data. It then alerted `SUCCESS`. **This predates the sandbox door and was reachable by any lead who flipped the Live/Demo toggle to show a colleague the tool.** | `src/components/SmartAnalysis.publish.test.jsx` — 4 tests. The live-mode test proves the harness reaches the write, so `not.toHaveBeenCalled()` in the demo test means something. | `if (isDemo)` before the `teamId` check, refusing with the sandbox as the stated reason. Live mode still archives, pinned by its own test. |
| `T10` | `AuraPulseBot`'s workload write checked `!teamId` **before** `isDemo`, so a sandbox user with no team was told *"No team is selected, so there is nowhere to write this"* — which reads as a fault in their account rather than as the sandbox behaving correctly. | Read; the two guards are four lines apart. | Order swapped. `isDemo` is the reason whenever it is true, so it is the reason that gets named. |
| `T11` | `FeedsView`'s composer called `processFeedPost({ teamId: null, … })`. The Cloud Function refuses that correctly, but the refusal arrived as the generic *"AURA processing failed"* — blaming the AI for a missing team. | Read + `functions/index.js:542`, the server-side id check. | Client-side guard naming the real cause, and saying the rest of the sandbox still works. |
| `T12` | No test rendered any view in the `isDemo && !teamId` state. | — | `src/components/sandboxNoTeam.test.jsx` — 9 tests mounting every demo-reachable view with the **real** `teamPaths`, so reaching a builder with a null id is a thrown error rather than a mocked string. |

**What `T12` does and does not catch, measured rather than claimed.** Deleting
`FeedsView`'s `if (!teamId)` guard fails two of its tests. Deleting
`StaffLoadEditor`'s does **not** — that fetch loops over `rosteredMembers`, and no
team means no members, so the loop body never reaches `loadPath` either way. Guards
written `if (isDemo || !teamId)` are half-exercised for the same reason: `isDemo`
short-circuits first. Those are pinned by reading, and the suite's header says so
rather than letting a green tick imply otherwise.

**`RosterView` is not in that suite on purpose.** `RosterView.demo.test.jsx` already
renders it in exactly this state — it mocks `isDemo: true` and never provides a team,
so `useTeam()` returns the frozen inert context — and additionally asserts that no
Firestore call is made at all.

**One thing this sweep found in its own scaffolding, not in the app.** The first
`useTeam` mock returned a fresh object literal per call and `StaffLoadEditor` spun
forever: a new `rosteredMembers` array each render is a new effect dependency. The
real `TeamContext` returns a module-level frozen `INERT` outside a provider and a
`useMemo`'d value inside one, so neither loops. The mock was wrong, not the component.

---

## Current queue — *updated 2026-08-17, and this is the live part of the file*

Everything above is the closed P0–P8 remediation. This is what is actually next, ordered. The
ordering is not arbitrary: **items 1–4 come from two roster masters in other departments** —
cardiology (items 1, 2 and 3) and audiology (item 4) — which is better evidence than an internal
judgment about what to build. Attribution deliberately by department rather than by headcount:
every one of those four rows names the department it came from, so the claim can be checked
against the table instead of taken on trust.

> ⚠️ **RENUMBERED 2026-08-17.** Half-day sessions entered as a new **item 4** (audiology), so the
> three items below it each moved up one: the third eligibility axis is now **5** (was 4),
> supervision pairing **6** (was 5), on-call **7** (was 6). Anything written before this date that
> cites "item 4" meaning the eligibility axis means **item 5**. Said out loud because this file
> already carries one banner about an id that quietly came to mean three different things.
>
> **Corrected the same day:** the line above briefly read *"items 1, 2 and 4 come from what three
> more roster masters asked for"*. It was **two** — items 1, 2 and 3 all trace to cardiology's
> roster master, one person. The count was inflated while the renumber was being made, which is
> exactly the failure this file's banners exist to catch, so it is logged rather than quietly
> fixed.

| # | Item | Why it is here, and why in this position |
|---|---|---|
| **1** | **`Q6` — deploy `firestore.rules`.** ⚠️ **RECONCILED AND WIRED 2026-08-18 — NOT YET MERGED.** The owner supplied the console rules, so the blocker is gone. `firebase.json` declares the file and the CI args are now `--only functions,firestore:rules` (the `firebase.json` section **alone deploys nothing** — `--only functions` excludes rules). Re-verified against the emulator: **31 checks, 31 as specified** (`scripts/firestore-rules-verify.mjs`). **What remains is the owner's, and merging to `main` IS the deploy:** the §3 pre-flight (every clinician's profile display name must still match `TEAM_DIRECTORY`, or they are silently locked out of their swap listener), the §6 Playground cases, and capturing the current console rules so §7's rollback has a source. | Was "settle before another department's data is involved". It is now **blocking a named requirement from a named person**: cardiology's roster master releases weekly and **time-gates** the release to stop premeditated sick leave. Time-gating is an **authorization** feature, not a visibility one — the roster document is read client-side by every client, so a UI-only gate would be *false assurance* about the exact fairness property she wants. It also still gates C1/C3/C4 and M12's durable duplicate guard. Nothing else here should jump it. |
| **2** | ~~**Surface `measureRosterLoad`**~~ — **DONE 2026-08-19.** | Defect **D2/D3/D9**. ⚠️ **The framing above was wrong and the correction is the interesting part.** "The engine computes this and **discards it** — there is no UI caller at all" is true of the FUNCTION but misleading about what a roster master could see: `result.load` is built `for (const person of staff)`, so a never-rostered colleague **always had a row in the load table, reading `0`**. Nothing was hidden. The real gap was that a `0` among nine rows does not announce itself — and D2/D3/D9's own scenario, a mistyped availability window quietly removing somebody, is exactly when nobody thinks to look. **Fixed with a callout, not a data pipe:** an amber panel between "could not be staffed" and the load table naming the people and the four causes (grade outside every band gate, missing skill, unavailable dates, a window outside the run), plus the two other figures `measureRosterLoad` returns and nothing read — `busiestDay` and `maxDutiesPerPersonPerDay`. **Amber, not red, on purpose:** never-rostered is a *question*, not a failure — it is correct for the respiratory shape's three below-floor staff and a silent disaster for a typo, and the panel cannot tell which, so it says so. 3 tests, each verified to fail when the panel is removed. Cardiology's fairness question ("who keeps avoiding the treadmill room") is answered by the load table that was already there. |
| **3** | **Single-cell shift editing** — change one assignment without regenerating. | Cardiology updates *daily* for sick leave; today the only tool is a full regenerate. Independently the highest-value item from the competitor analysis. Should log the change, so it doubles as the audit trail item 2 wants. |
| **4** | **Half-day sessions** — a task, and an availability, that can say **AM or PM**. *See `Q13`.* | **Audiology's roster master asked for both halves of this**, on 2026-08-17: *which half of the day does this task run in*, and *is this person in for that half* — for last-minute changes **and** for contracted half work days. The engine already has the **duration** of a half day (`DEFAULT_TASK_HOURS` is 4 — *"a session, not a day"*, and two make a working day) but not its **position**, so two tasks that both really run in the morning are 8h against an 8.4h cap: the engine takes them, and has silently double-booked a morning — the one thing it promises never to do. It is not a refusal it failed to make, it is a fact it was never given. Opt-in by decision `Q13a`, so an unlabelled task behaves exactly as today. Placed **after item 3** and not before it: his second-in-charge corrects the week *within* the week, and a half-day marker you can only change by regenerating the whole roster solves nothing. |
| **5** | **A third eligibility axis** — `registration` / `staffCategory`. *See `Q12`.* **(5(b), the grade threshold, SHIPPED 2026-08-19 in v1.18.0.)** | **(a) Registration — still open, still blocked.** `requiresSkill` is a **single string**, so a task can require exactly ONE thing and registration competes with real competency: *"a registered clinician who is also CPET-competent"* cannot be expressed at all. **Two professions have asked independently.** Blocked on one decision only: boolean, or an ordered list (registered / provisionally registered / assistant / student)? That is the `Q12` question the respiratory room was meant to answer and nobody recorded. **(b) The grade threshold — DONE.** `minGrade` is the fourth eligibility requirement kind, gating **every** assignee rather than the lead alone; the respiratory shape now states `AH12` instead of approximating it with a band gate plus `coLeads: 0`; defect `D10` is closed and the stress probe reports `GAP CLOSED`. Merging the two into one item was right for the machinery — both are requirement kinds composed by `eligibilityOf` — and (b) shipping alone proves it was also right that only (a) needed a decision. |
| **6** | **Supervision pairing** — "a trainee only alongside a signed-off senior". | Engine limit: a task's skill requirement gates the **co-lead** too, so "qualified senior supervising an unqualified trainee" has no representation. Cardiology named it unprompted. Depends on item 5. |
| **7** | **On-call / standby**, with post-call rest. | **Last, because it is the largest.** There is *no* concept of standby in the engine — zero occurrences. It is not a duty: it is a period with call-in, and it drags a post-call rest rule behind it. `maxConsecutiveDays` cannot see across generation runs, so a naive version would leak at every month boundary. |

**Still open and small:** the swap modal's two `<select>`s lack `id`/`htmlFor` pairing (its tests
locate them by their options as a workaround). Defects `D5`, `D6`, `D7`, `D8` and the live-mode
iOS zoom are in the CHANGELOG's known-issues table.

---

## The expressiveness ledger — *the measure that matters for 27 other professions*

**Fixture count is the wrong metric and always was.** AURA does not serve SingHealth by shipping
one worked example per department — there are 28 allied health professions across several
institutions, and a respiratory team at one hospital rotates differently from a respiratory team
at another. What decides whether any of them can use the tool is whether **the engine can say the
rule they state out loud**. Every `No` below is a team that cannot.

| A real team said | Sayable today? | Where it goes |
|---|---|---|
| ~~*"minimum job grade AH12"*~~ | ✅ **YES — since v1.18.0.** `minGrade` is a fourth requirement kind, and it gates every assignee rather than the lead alone | **shipped** — the first `No` to leave this table |
| *"is this task AM or PM, and is this person in for that half"* | **No** — a duty has a duration but no position in the day | item 4 |
| *"a registered clinician who is **also** CPET-competent"* | **No** — `requiresSkill` is a single string, so one requirement evicts the other | item 5(a) |
| *"time-gate the roster release"* | **No** — it is authorization, and no rules are deployed | item 1 / `Q6` |
| *"everyone on this duty must meet the grade floor"* | **Partly** — only by `coLeads: 0`, because a band gates the lead alone | 5(b) makes it direct |
| juniors on wards, seniors in clinics — band gates in both directions | **Yes** | shipped v1.8.0 |
| a monthly clinic, same practitioner each time | **Yes** | shipped v1.8.0 |
| at least two Saturdays a month, under an hours ceiling | **Yes** | shipped v1.9.0/v1.10.0 |
| a shift needing a principal, a senior and a junior at once | **Yes** | shipped v1.10.0 |

**How to use it:** every new conversation with a team adds a row *before* anything is built. A
`No` is worth more than a fixture — it names a capability gap in the words the person used. A
`Yes` needs no code at all, only a configuration they type themselves.

**A `Yes` can still be unusable at size, which is a different axis and now has evidence.** The
stress harness (`npm run stress`, added 2026-08-18) measured generation for the first time: cost is
roughly linear in headcount and **superlinear in run length**, and it runs synchronously on the
browser's main thread — 100 staff over a year freezes the tab for ~23 seconds. Recorded as **D11**.
It changes nothing about *what* can be said, but it bounds *who* can say it: a 20-person department
is comfortable, a 100-person one rostering a year ahead is not. Worth knowing before the next pilot
conversation promises a whole-cluster rollout.

**What this list is not:** a promise to build every `No`. Item 1 still outranks all of them.

---

**Respiratory's shape now states its grade floor, and the tool can enforce it *(closed
2026-08-19, v1.18.0)*.** The sixth shape (`shape-graded-floor-rotation`, `mockData.js`) is what
their therapist lead described: three areas, weekdays, a grade floor, rotation. ~~It is safe only
because its cast contains no AH11 — with `leadBands: ['junior','senior','principal']` an AH11
would be allowed to lead a duty she says needs AH12.~~ It now says `minGrade: 'AH12'`, which
gates every assignee, so a **real** respiratory roster typed into the tool no longer inherits the
one-grade slack either. The struck sentence is kept because it was true for one day and it is
the reason the field exists.

⚠️ **What this does NOT close.** A department still has to *set* the floor — the wizard offers
the control, it does not infer one. A team that leaves it blank gets what every task got before
grades existed: any grade may cover it.

**The audiology 2IC rosters weekly, in Excel — and that is a separate question from AM/PM.**
Item 4 is what he *asked* for; the spreadsheet is what he is actually *using*. A weekly grid that
already works is both the migration path and the incumbent this tool has to beat, and nothing in
the queue addresses getting one in or out. Recorded here so it is not lost behind the feature
that was easier to name. **Not scheduled** — it needs the sheet in front of us first.

**Multi-institution: specified, blocked on `Q6`, and NOT an engine problem.** One shared
`roster_2026` document and a login gate hardcoded to `@kkh.com.sg` (`WelcomeScreen.jsx:109`) are
what stop a second institution using this — not the engine, which contains no site concept at all
and already supports per-team band scales (`rules.bands`), per-team rules and per-team task sets.
So an RT team at another hospital can already express their own rotation *provided their rule is
sayable*, which is why the ledger above is the real constraint. What multi-institution needs when
it comes: a roster document per institution/team, per-institution grade scales and rules, and a
login gate that is not one hardcoded domain. **Deliberately not designed yet** — partitioning data
per institution before `firestore.rules` is deployed is false assurance, the same argument already
accepted for item 1. Revisit as part of `Q4`.

**One question for cardiology, worth asking before item 5:** their roster master's title is
*senior principal* cardiac physiologist. If that is a rank **above** principal, the four-band
scale is one short — and `defineGradeScale({ regions })` is the seam that must absorb it, not a
rename. Better to find that out now than mid-demo.
