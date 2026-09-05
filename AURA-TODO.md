# AURA — remediation ledger

Companion to [`AURA-POSTMORTEM.md`](AURA-POSTMORTEM.md), which carries the evidence for
every row below. **This file is the plan; the post-mortem is the finding.**
[`AURA-HANDOFF.md`](AURA-HANDOFF.md) is what to read first.

**Scope: the four AI surfaces and the intelligence layer.** The roster engine has its own
ledger in [`ROSTER_TODO.md`](ROSTER_TODO.md) and the community portal in
[`COMMUNITY_TODO.md`](COMMUNITY_TODO.md). The three do not share ids — see
[`IDS.md`](IDS.md).

---

## ⚠️ The ledger rule, inherited and not softened

An item is `DONE` only when the Evidence column holds **real, pasted output** — a test name
and count, a grep that returns zero, a commit sha whose diff can be read. *"The code was
edited"* is not evidence. A row marked `DONE` on the strength of an edit is the failure this
rule exists to prevent, **and it has happened in this repository before.**

Two corollaries this ledger has already had to apply:

- **Scope the evidence to what it proves.** `COMMUNITY_TODO.md` §4.6 recorded *"`grep
  Math.random src/components/` returns nothing"* for a fix that was really about session
  ids. The fix held; the grep now returns two hits and the claim reads as false. Write the
  grep you actually ran, scoped to what it actually shows. (`AU13`)
- **For anything that ships in the bundle, the acceptance test is the bundle.** `AN1` leaks
  through `dist/`, not through source. A fix verified by reading the source is not verified.

---

## Ids

| Prefix | Means | Who closes it |
|---|---|---|
| **`AU`**n | a defect in the **staff assistant** and the AI plumbing | me |
| **`AC`**n | a defect in the **public screening** chat | me |
| **`AN`**n | a defect in the **intelligence layer** — analysis, rollup, nudge, guard | me |

**Numbers are never reused and never renumbered**, including across the merge of the three
original post-mortems into one. `AU2` means today exactly what it meant when it was written.

---

## Status

| | Count | Ids |
|---|---|---|
| `DONE`, evidenced | **47** | `AU1` `AU2` `AU3` `AU4` `AU6` `AU7` `AU9` `AU10` `AU12` `AU14`–`AU16` `AU19` `AU20` `AU22`–`AU30` `AC1` `AC2` `AC5`–`AC10` `AC12`–`AC16` `AN1`* `AN2`–`AN4` `AN6` `AN8` `AN10` `AN13` `AN14` + `AN12` (code half) — `AU3` now both halves, emulator-verified; `AU29` and `AU30` closed 2026-08-28 |
| `OPEN`, mine | **1** (`AU33`) — `AU31`, `AU32`, `AU34`, `AU35` closed 2026-09-05; `AU33` re-opened the same day when its prompt line did not hold; the next live run is what re-opens any of them | The engineering queue is genuinely empty as of 2026-08-24: `AU3`'s rules backstop and `AC16`'s latch — the two residuals the previous version of this row disclosed — are closed above, both with evidence. What remains is the owner's column and the standing verification work (`P8.8`, `CD13`). |

⚠️ **Six rows in this file said `OPEN` for findings closed days earlier** (`AU6` `AU7` `AU19`
`AN5` `AU22` `AU23`) — the P-section tracked them separately from the P7 batch that closed
them, and only one place was updated. Each now cites the commit that closed it. A ledger row
is a claim like any other; these were false in the safe direction, which is still false.
| `OPEN`, **owner's decision** | 9 | `AU5` `AU8` `AU11` `AU17`† `AC11` `AN7` `AN9` `AN11` `AN12` — `AU29` was here for one day; closed 2026-08-28 with evidence, on the owner's instruction |
| **`LIVE` right now** | **0 grades · 0 names · 0 emails** | \* `AN1` and `AN14` both closed and verified against `dist/`; `an14.bundle.test.js` keeps it that way |

**55 findings**, not the 51 this file was created with: `AU25` (the go-live gate) and
`AC15` (fixing `AC1`) were opened on the same day; `AU29` (chat history survives
sign-out) was opened 2026-08-27 by the steward audit of P9; `AU30` (model selected by
visibility, not usability) was found live on 2026-08-28. None of it renumbers anything.

† `AU17`'s **code half** (the audit log of what passes through the attachment path) shipped
with `AU15`; what stays with the owner is the policy half — what the actual PDPA control on
attachments is, which no amount of code here can decide.

## ⚠️ Two new ids, opened by review of the first fix batch

| Id | Finding | Severity |
|---|---|---|
| `AU35` | ~~**MODE 2 declares its assumptions and goes silent on gaps.**~~ **CLOSED 2026-09-05 (`aura`) — PROMPT, a request.** P8.8 turn 5, runs 3 and 4 of 4: the reply named three specific, sensible assumptions and said nothing about gaps or unverified items. P1's second half — *"if there are none, say so explicitly rather than saying nothing"* — forbids exactly that silence. Runs 1 and 2 declared both. The checker now reports which half is missing (`assumptions yes, gaps/unverified NO`), which is how this became visible as a pattern rather than a wobble. MODE 2 gains rule 5, DECLARE BOTH HALVES: two separate statements, and the exact words to use when there are no gaps. | low · **`DONE`** |
| `AU33` | **A rework's change summary is false — and the first prompt line did not fix it.** P8.8 turn 8. Run 1: *"only the header changed"* while Handover and Scope were dropped. **Re-opened 2026-09-05 after runs 4 and 5**: with MODE 2 rule 4 in place the reply now LISTS changes properly (header, intro, title block) and then says *"I kept the core procedural steps exactly the same"* over a seven-section, ~18-step SOP condensed to four one-liners, 1,863 chars to 639. The prompt line shaped the form of the sentence and left the falsehood in it — a request, ignored twice. Two responses. (1) The rule now says the specific thing it lacked: do not shorten, merge, condense or summarise; if you did, say so and never say "the same". (2) **The harness measures it**: `reworkNotRewrite` (size ratio ≥ 0.6 and ≥ 50% of the previous document's lines carried) and `changeClaimHonest` (a "kept the same" claim over a document under 70% of the previous size fails). Run 5's SOP and memo are the fixtures. Stays OPEN until a live run passes both; a prompt is closed by a transcript, not by a commit. | low · **`OPEN`** |
| `AU34` | ~~**MODE 1 asks for a 0-to-10 rating twice in two turns.**~~ **CLOSED 2026-09-05 (`aura`) — PROMPT, a request.** P8.8 turns 1 and 2, run 1: both replies end by asking for a 0-to-10 rating, and turn 2's was expected to be an OPEN question (OARS). A scaling question is a closed question. MODE 1 gains ONE SCALE QUESTION PER CHECK-IN: at most once per conversation, and only after a genuinely open one. The runner's `scaleAskAtMostOnce` counts 0-to-10 requests across the block so far and fails turn 2 on the second. A judgement call the owner's read left open; closed on the recommended option. | low · **`DONE`** |
| `AU31` | ~~**MODE 3 re-proposes the previous turn's figures when the user gives none.**~~ **CLOSED 2026-09-05 (`aura`), as CODE + prompt.** P8.8 turn 11, stable across three live runs, byte-identical: after *"Log 35 patients for January"*, the bare *"Log my workload."* returned a FILLED card, 35 / January, inherited from the turn before. The owner took the harder option: a proposal needs a figure in the CURRENT message. The prompt now says so, and because the previous wording was ignored three runs out of three, **the application enforces it**: `functions/workloadIntent.cjs` — `currentTurnRule()` discards any card whose `target_value` is set when the user's message carries no digit and no number word, and replaces the reply with a question. Applied in `chatWithAura` after the parse and before the return, so client text and client card tell one story. The month is deliberately NOT enforced: *"make it 40"* carries a figure and legitimately inherits the month (turn 12 still passes). **`workloadIntent.test.js` — the three live turns as fixtures**: turn 11 discarded, turns 10 and 12 untouched, a numeric string counts as filled, input never mutated, wiring asserted at source. The runner reports both: what the MODEL did (the verdict) and that the app would discard it (the note). | medium · **`DONE`** |
| `AU32` | ~~**MODE 1 sometimes claims the write happened.**~~ **CLOSED 2026-09-05 (`aura`) — PROMPT + harness, which is a request and a detector, not a control.** P8.8 turn 4, 2 of 3 live runs: *"I have noted your energy levels for today."* The client reads `diagnosis_ready` + `phase` and offers a log card the USER confirms (`AuraPulseBot.jsx`), so the sentence is false at the moment it is said: nothing is written until the click. The prompt's MODE 1 gains a CLOSING rule — brief, warm, `diagnosis_ready: false`, `action: null`, and no claim that anything was saved, noted or recorded, with the reason stated. The runner's turn 4 now carries `noClaims` (vocabulary widened to *noted / entered / added / stored / filed* and the uncontracted forms) and `closeIsQuiet` (diagnosis_ready false, action null — a thank-you must not open a second log card). Not enforced in code: the only enforceable version is stripping sentences from the model's reply, and rewriting the clinician's conversation server-side is a worse defect than the one it would fix. Re-read after the next live run. | low · **`DONE`** |
| `AU27` | ~~`exportToDoc` and `confirmAdminAction` write to `smart_database` with no `isDemo` guard~~ **CLOSED 2026-08-24 (`aura`).** Both sites now fence: the sandbox downloads the `.docx` (the value the demo shows — it never needed Firestore) and says plainly *"SANDBOX: nothing was saved"*, instead of writing demo fiction into the live audit collection when signed in and showing a false *"check your connection"* banner when signed out. | high · **`DONE`** |
| `AU26` | `target_doc` — the field that CHOOSES the Firestore document — was the one model-supplied value left to `String()` coercion. `{}` → `"[object Object]"`, `true` → `"true"`, `0` → `"0"`, all ACCEPTED. Contained on `staff_loads` by the `memberUidByName` lookup; **not** contained on `monthly_workload`, where `workloadPath` asserts nothing. Data quality, not disclosure. **Closed** in `c2b45d9`. | medium |
| `AN14` | ~~`TEAM_DIRECTORY` still ships in the bundle: seven real **names** and seven real **work email addresses**.~~ **CLOSED 2026-08-24, on the `aura` branch.** The bridge only ever needed to RECOGNISE an email it was handed, never to contain one: `src/utils/legacyBridge.js` now does the same job with salted SHA-256 digests, and the directory is deleted. The hunt found **three more copies** beyond the two on this ledger: `ADMIN_EMAILS` in `App.jsx` (two plaintext addresses — the seventh), `LIVE_ROSTER_DEFAULTS.staff` (four names in the roster fallback — the eighth, found by the new bundle tripwire), and `LIVE_MOCK_POSTS` in `FeedsView.jsx` (the ninth, and the worst: **fabricated posts attributed to real colleagues by name and role**, merged into the live feed for every user). All out. `an14.bundle.test.js` greps the BUILT BUNDLE — not the source — for every address and distinctive name and fails CI if any returns; the residual is a membership oracle over guessed inputs (the salt ships), declared in `legacyBridge.js`'s header and dying with the bridge. | medium · **`DONE`** |

## ⚠️ What the review of the first batch found in my own work

Recorded because a ledger that lists only successes is the thing this repository keeps
getting burned by. All four are fixed in `c2b45d9`.

| What | Why it matters |
|---|---|
| **`'i saw '` in `selectDemoMode` was worse than the bug it fixed** | DATA_ENTRY is tested first, so a two-word prefix beat COACH, ASSISTANT and RESEARCH. Twelve routings changed. *"I saw 3 arrests back to back and I am wrung out"* → **"Logged 3 against your workload record"** plus a green commit card. Distress answered with a database write, in front of the Allied Health Director. |
| **The commit claimed "all four other routings are unchanged"** | True of the four exact README sentences and nothing else. The `AU13` corollary again — evidence scoped narrower than the claim above it. Caught by review, not by a test. |
| **The first replacement was still too broad** | A bare `'patients in'` caught *"12 patients in a morning is too many"*. A keyword cannot separate "patients in June" from "patients in a morning"; only a named month can, so the pattern now requires one. |
| **Fixing `AU22` created a red failure banner on stage** | The card renders now, so the **Commit Workload** button exists — and pressing it in Demo Mode threw, painting *"⚠️ Write failed: Sandbox mode does not write to the database."* `README.md:186` scripts a presenter to demo that card and promises "a button to push to Firestore". The sandbox refusal is an explanation, not a failure, and now reads as one. |
| **My comment on `AN4` was false** | It said *"`hasAdminAccess` already gates the screen to a lead"*. It does not — `App.jsx:459` is four disjuncts, three of which are true for people whose membership role is **not** `'lead'`, including the two legacy admin addresses. A presenter reaching the screen by the email path would have hit `permission-denied` mid-demo on a feature that worked yesterday. `SmartAnalysis` now checks `isLead` client-side and says so in a sentence. |
| **Three of eight rows were closed with no regression test** | `AN4`, `AU22` and `AU25` were closed on an edit plus a manual observation. `demoAura.test.js`'s existing `toMatchObject({ value, written })` is a PARTIAL match that passes with or without the `AU22` fix. All three now have tests that fail on the pre-fix code. |

## Closed on 2026-08-23, with evidence

| Id | What | Evidence |
|---|---|---|
| `AN4` | `generateSmartAnalysis` was unauthenticated | `e3b6bb9` — auth + `teamId` validation + membership read + `role === 'lead'`, copied from `processFeedPost:571` |
| `AU2` | `target_value: null` wrote a zero and reported success | `e3b6bb9` — `src/utils/dataEntryGuard.js`, **58 tests**. `null`/`""`/`[]`/`true`/`NaN`/`Infinity`/numeric-string all refused with a sentence |
| `AU3` | `target_field` was model-chosen and unconstrained | `e3b6bb9` — `ALLOWED_WORKLOAD_FIELDS` allowlist, taken from the prompt's own schema |
| `AU22` | The sandbox never showed the `DATA_ENTRY` card | `e3b6bb9` — sandbox emits the live shape; README:186's exact sentence now renders it, month parsed (June → 5) |
| `AU25` | A persona without a `title` crashed the sandbox | `e3b6bb9` — optional-chained with a fallback; verified no crash |
| `AC1` | Typed minutes containing "20" recorded as 15 | `a99ffa6` — `parsePavsMinutes` in `clinicalFlags.js`, **70 tests**. `"120 minutes"` → 120; five days × two hours 75 → **600 min/wk** |
| `AC2` | Word-number answers scored 0 | `a99ffa6` — `"daily"` → 7, `"about an hour"` → 60; an hour every day 0 → **420 min/wk** |
| `AC15` | `'45–60 mins'` chip scored 65 where the form says 52 | `a99ffa6` — all nine chip combinations now asserted against `ConventionalForm`'s own table |

⚠️ **One regression was written and caught during this work**, and it is recorded because
the alternative is pretending it did not happen. `dataEntryGuard`'s first draft used
`Number.isInteger(Number(target_month))`; `Number(null)` is `0`, a valid month, so a `null`
month was **accepted** and would have been written to January — `AU2` itself, on the one
field the post-mortem called already correct, re-introduced while fixing it. Its own test
caught it on the first run. Both the module and the test carry the note.

---

## ⚠️ The four to do this week

Not the four highest severities — the four where the gap between cost and consequence is
widest.

### `W1` · `AN1` + `AN2` + `AN3` — one change · **half a day**

Six named colleagues' names, roles and **job grades** are in the public JavaScript bundle,
served on every route including the public health screening. It undoes the entire grade
privacy model built three days ago, and it is a `const`.

```
1. Delete STAFF_PROFILES from SmartAnalysis.jsx.
2. Source profiles from `members` (useTeam) and grades from `useTeamGrades` —
   lead-only, already exists, already tested.
3. Pass `team.name` instead of the hardcoded "SSMC@KKH CEP Team".
```

⚠️ **The acceptance test is the built bundle, not the source:**

```bash
npm run build && ! grep -qE 'Fadzlynn|Derlinder|Ying Xian|grade:"JG1' dist/assets/*.js && echo CLEAN
```

Closes a live disclosure **and** makes the feature do what it claims for every department
other than the first.

### `W2` · `AN4` — six lines · **an hour**

`generateSmartAnalysis` has no `request.auth` check. Copy the shape from
`processFeedPost:571`: authenticate, re-read `teams/{teamId}/members/{uid}` from the
database, refuse a non-lead of the team being analysed. Every other callable in the file
already does the first half.

While there: add it to `rateLimit.js`'s coverage (`AU14`).

### `W3` · `AU2` — one guard · **twenty minutes**

`Number.isFinite` and a plausible range on `target_value`, beside the month guard that is
already correct three lines above. It is the only finding in the whole set that **silently
destroys data a clinician entered**.

### `W4` · `AC1` + `AC2` + `AC3` + `AC5` — one shared parser · **a day**

A `parsePavs` in `clinicalFlags.js`, modelled on `parseAgeBand`: the closed-set table as
its fast path, word-numbers handled, no unanchored substring tests. Used by both pathways.

Closes four findings at once, and it is the number the whole instrument reports.

---

## P0 — Live and reachable · `AN1` `AN4` `AC1` `AC2` `AU2`

| # | Id | Item | Owner | Status | Evidence |
|---|---|---|---|---|---|
| 0.1 | `AN1` | Delete `STAFF_PROFILES`; verify against `dist/` | me | `DONE` (grades) · `OPEN` (`AN14`) | `c2b45d9`. **No real colleague is within 120 chars of a grade string in the bundle** — verified by script against `dist/`. Remaining `JG` hits are the Marvel fixture and the job framework. ⚠️ `STAFF_PROFILES` was only one of two copies: `TEAM_DIRECTORY.title` also carried `(JG14)`, `(JG13)`, `(JG12)`, `(JG11)`. Names and emails still ship — `AN14`. |
| 0.2 | `AN2` | Source profiles from `members`, grades from `useTeamGrades` | me | `DONE` | `c2b45d9` · the payload carries the **band**, never the grade, because it goes to Gemini |
| 0.3 | `AN4` | Auth + team-membership check on `generateSmartAnalysis` | me | `DONE` | `e3b6bb9` |
| 0.4 | `AU2` | `Number.isFinite` + range on `target_value` | me | `DONE` | `e3b6bb9` · 58 tests |
| 0.5 | `AC1` | Remove the `includes('20')` branch | me | `DONE` | `a99ffa6` · 70 tests |
| 0.6 | `AC2` | Word-numbers in the PAVS ladder | me | `DONE` | `a99ffa6` · 70 tests |

## P1 — Cost and abuse · `AU14` `AU15` `AN10`

| # | Id | Item | Owner | Status | Evidence |
|---|---|---|---|---|---|
| 1.1 | `AU14` | `rateLimit.js` on `chatWithAura` and `generateSmartAnalysis` | me | `DONE` | `aura` branch, 2026-08-24. One per-uid budget (120/hr) across **all three** authenticated Gemini endpoints — `processFeedPost` included, which the item under-scoped — plus a 3,000/hr global alarm-ceiling, scope `staff` in `rate_limits`, uid hashed in the doc id like every other key there. A refused turn is **not counted** and costs nothing (the check runs before the model call). Firestore blip → allow and log, same reasoning as the community side. `staffPlanFor` + `staffRefusalMessage` in `rateLimit.js`, tested. |
| 1.2 | `AU15` | Byte cap + mimeType allowlist on attachments | me | `DONE` | `functions/attachmentRules.cjs` — pure, unit-tested: 5 files, ~4 MB each / ~8 MB per request (measured in base64, which is what bills), exact-match allowlist of five types (pdf, png, jpeg, webp, plain text; svg and html refused — scriptable), standard-base64 shape check, and an **audit log of count/types/sizes, never content** (the `AU17` log half). No client sends attachments yet, so the contract now exists BEFORE a UI does. ⚠️ Declared plainly in the module: this is a cost bound, **not** a PDPA control — the P6 gap stays declared. |
| 1.3 | `AN10` | Chunk `sendEachForMulticast` at 500; surface the failure | me | `DONE` | Chunks of 500, and the **result is read**: `sendEachForMulticast` resolves successfully even when every send inside failed, so the old `await`-and-return verified delivery of nothing. Partial delivery now logs `sent`/`failed`/`tokens` at warn. Past 500 devices (~18 people × 28 departments) the old code would have thrown, been swallowed by the catch, and silently ended the daily nudge for everyone. |
| 1.4 | `AU16` | Reset `modelResolutionPromise` on every non-success; record the model on the response | me | `DONE` | **Both halves.** Recording (`P8`): `aiProvenance()` on every response, stamped into the .docx export, both `smart_database` audit rows and the archived report. Cache reset (2026-08-24): only the *thrown-error* path cleared the cache — a non-200 from the model list, or a 200 naming none of our models, resolved the promise to `gemini-1.5-flash` **for the container's life**. Every fallback path now clears before returning, so the turn degrades and the next call re-discovers; a *discovered* model is still cached, and a test guards both directions. |

## P2 — What the model may write · `AU3`–`AU7`

| # | Id | Item | Owner | Status | Evidence |
|---|---|---|---|---|---|
| 2.1 | `AU3` | Allowlist `target_field` | me | `DONE` (both) | Client: `e3b6bb9`, `ALLOWED_WORKLOAD_FIELDS`. Rules backstop: 2026-08-24, riding the same rules deploy `AN13` already requires — `keys().hasOnly([patient_attendance, patient_load, last_updated_by, last_updated_at])` plus number-and-non-negative checks on the counters, mirroring `dataEntryGuard.js` exactly. **Emulator: 8 cases in `firestore-rules-verify.mjs`'s AU3 section — a model-invented field, a typo, a string count and a negative all fail the whole write; a subset update passes; staff refused; the collection stays unreadable. 140 passed, 0 failed (2026-08-24).** |
| 2.2 | `AU4` | `assertPeriod` on `workloadPath`, matching `assertYear` | me | `DONE` | Three layers, 2026-08-24: `dataEntryGuard` refuses a non-`mmm_yyyy` period **with a sentence naming the format** (case-insensitive, so `Jan_2026` is not a user-facing failure); the caller lowercases so a case variant lands on the SAME document instead of splitting a month in two; `teamPaths.workloadPath` throws on anything else, exactly like `assertYear`. Twelve real month names, anchored — `xyz_2026` is not a month. Tested both layers. |
| 2.3 | `AU6` | Make the System Note, MODE 3 and `memberUidByName` agree on ONE key | me | `DONE` | ⚠️ Closed by **P7 item 7.1** (`88af00f`) and this row went stale — the same finding tracked in two places, updated in one. MODE 3 asks for the display name, which is what `memberUidByName` resolves. |
| 2.4 | `AU7` | Update the prompt's schema to the post-migration paths | me | `DONE` | ⚠️ Closed by **P7 item 7.1** (`88af00f`); stale row. The two names are the wire format `dataEntryGuard` allowlists; `promptContract.test.js` pins prompt-to-guard agreement. |
| 2.5 | `AU19` | Make `requiredFields` enforce; add `db_workload` to the list | me | `DONE` | ⚠️ Closed by **P7 item 7.3** (`88af00f`); stale row. `parseJsonResponse` throws, `db_workload` is in the list. |
| 2.6 | `AU5` | **Decide** whether the workload collection should have a reader at all | **OWNER** | `OPEN` | — |

## P3 — What the model says about a person · `AU8`–`AU12`

| # | Id | Item | Owner | Status | Evidence |
|---|---|---|---|---|---|
| 3.1 | `AU9` | Reject `NaN`; record phase/energy disagreement instead of hiding it | me | `DONE` | `src/utils/wellbeingLog.js` (2026-08-24). `Math.min(79, NaN)` is `NaN`, and that went into the record. An unusable energy now becomes the **band midpoint** flagged `corrected` — not the old 50-then-clamp, which stored 19 for a missing energy on an ILL turn, the least-ill reading the phase allows. A contradiction (energy 85, phase ILL) is clamped **and reported** with the raw value, so a correction no longer looks identical to the model having been right. |
| 3.2 | `AU10` | Refuse a phase outside the four | me | `DONE` | Same module: an unknown phase (`EXHAUSTED`, a sentence, a number) means **no log card at all**, logged to console — not a record every reader would misread as one of the four. Case and whitespace normalised first, so `" ill "` is not refused. The UI's `PHASE_CONFIG` now derives its bands from the same table, so the badge and the record cannot disagree about where a band starts. |
| 3.3 | `AU12` | Key the pulse board by uid | me | `DONE` | 2026-08-24, **twice** — the first cut's migration deleted only the *exact-case* legacy key while the reader tolerated any case, so the one scenario the tolerant read existed for (a display name recased since the entry was written) was the one the cleanup missed, and this row's first version claimed *"never counts one person under two keys"* — **"never" was false** (steward). Now: `src/utils/pulseKeys.js` is ONE definition of the legacy-key set, used by the reader (`resolvePulseEntry`) and deleted in full by **both** writers — the wellbeing board from its live state, the bot after a `getDoc` (it wrote blind). **15 tests** (`pulseKeys.test.js`), including every-case-variant deletion, the demo pseudo-uid case, and that `'Ann'` no longer matches `'Joanne'` (the old lookup was a *substring* search). Self-edit is uid equality. `Anon_*` entries untouched. |
| 3.4 | `AU8` | **Decide** whether "diagnosis_ready" should be content-gated, and whether that field should be called *diagnosis* at all | **OWNER** | `OPEN` | — |
| 3.5 | `AU11` | **Decide** whether model output should persist as memory and re-enter the prompt | **OWNER** | `OPEN` | — |

## P4 — The public screening · `AC6`–`AC14`

| # | Id | Item | Owner | Status | Evidence |
|---|---|---|---|---|---|
| 4.1 | `AC6` | Move the guard to the calls that can throw; `clearProgress()` after, not before | me | `DONE` | 2026-08-24. `parseClinicalData`, `calculateRiskScore` and `selectCTA` are inside the try; `clearProgress()` runs only once a result exists, so a failed completion leaves the answers resumable instead of stranding the visitor on *"Generating your personalised plan now…"* with nothing to resume. The caller `.catch`es too, so no unhandled rejection. |
| 4.2 | `AC12` | `aria-live="polite"` on the message list | me | `DONE` | 2026-08-24. `role="log"` + `aria-live="polite"` on the chat area (`AuraChat.jsx`, the messages `div`) — the portal built for the highest assistive-technology need announced nothing while the staff roster announced twice. Evidence: `grep -c aria-live dist/assets/index-*.js` → **4** (was 2, both in RosterView). |
| 4.3 | `AC5` | Export the parser so it can be tested; add the unit suite `P4.3` has been asking for | me | `DONE` | 2026-08-24. `parseClinicalData` moved verbatim to `src/utils/clinicalParse.js`, exported, **imported by its tests** (11) instead of grepped — including *"parses an entirely empty answer set without throwing"*, which is what `AC6`'s try depends on. `pathwayParity.test.js`'s chat side now reads the module; the form side still reads source and is noted as the next extraction. ⚠️ One expectation in the new suite was wrong on first run — guessed 75 for the `60+ mins` chip; `ConventionalForm`'s table says 65 (`AC15`) — the table is the authority, and the test now says so. |
| 4.4 | `AC8` | `AbortController` on the 1500 ms discard window | me | `DONE` (finding corrected) | 2026-08-24. **The prescribed fix would not do what the finding says.** `httpsCallable` carries no signal, and aborting the HTTP request does not stop a Cloud Function mid-execution — `communityAck` runs to completion and the Gemini call bills identically whether the client listens or not. The real cost controls are server-side and already exist (`maxOutputTokens: 200`, 20s timeout, `CP7` rate limits). The window only governs whether a paid-for reply is *used*; widening it trades against rewriting text under the reader, which is `AC11` and the owner's. Documented at the site. |
| 4.5 | `AC9` | Anchor or drop the error-word screen on the model's reply | me | `DONE` | 2026-08-24. **Dropped.** `communityAck`'s errors arrive as thrown `HttpsError`s (the `.catch`), never as prose, so screening the *successful* reply for the word "unavailable" only discarded legitimate sentences (*"if your usual class is unavailable, the centre can suggest another"*). The one check a success needs — non-empty — stays. |
| 4.6 | `AC7` `AC10` `AC13` `AC14` | The four small ones: dead catch, third parser copy, `key={idx}`, `TOTAL_STEPS` | me | `DONE` | 2026-08-24. `AC7`: the catch is alive (it guards the three real computations now). `AC10`: the third fence-strip/brace-scan copy is deleted — it parsed JSON out of an endpoint whose own prompt says *"No JSON"*. `AC13`: messages key on `_id` (index only for pre-`_id` messages); quick replies key on their label. `AC14`: `TOTAL_STEPS` **deleted** — its comment said 13, the array held 15, and its only two uses badged the final plan with whatever domain happens to be last. Completion and error messages carry no domain badge, because they are not about a domain. |
| 4.7 | `AC11` | **Decide** whether the acknowledgement should rewrite text in place at all | **OWNER** | `OPEN` | — |

## P5 — The intelligence layer · `AN5`–`AN13`

| # | Id | Item | Owner | Status | Evidence |
|---|---|---|---|---|---|
| 5.1 | `AN5` | Raise `maxOutputTokens`, or lower the word counts the prompt asks for | me | `DONE` | ⚠️ Closed by **P7 item 7.5** (`88af00f`); stale row. Both: ask lowered to 600–900 + 200–350 (+ 40–150 assumptions), budget 2,048 → 4,096, with a test computing the worst-case ask from the prompt itself. |
| 5.2 | `AN6` | Make the client timeout, the function timeout and the fetch abort agree — and tell the user the true number | me | `DONE` | 2026-08-24. The callable timeout was 300,000ms behind a comment claiming it *"matched the backend"* — the backend aborts its fetch at 30s and a v2 onCall defaults to 60s, so the button could pin on "Analysing…" four minutes after the server gave up. Now 60s, the largest value the backend can use, and the status text already said "under a minute". |
| 5.3 | `AN8` | Refuse to render or archive the fallback string as a report | me | `DONE` | 2026-08-24, closed at the SERVER: the fallback strings are deleted. `parseJsonResponse` throws on an absent key; a key that is present but **empty** now throws too (`"The AI returned an empty report. Please retry."`) instead of returning *"No private report generated."* — which the client rendered and **archived as the department's year-end record** with nothing anywhere saying a generation failed. |
| 5.4 | `AN13` | Route comments through the PDPA guard, or fence them the way posts are | me | `DONE` | 2026-08-24, the fence, twice: `firestore.rules` refuses a comment containing an NRIC/FIN-shaped token, and the client checks the same shape first so the person gets a sentence (*"ending 567D"*) instead of `permission-denied`. ⚠️ **The first cut of this fence had a hole its own test could not see** — steward review: RE2's `.` does not cross newlines, so an NRIC mid-way through a multi-line note passed the RULES while the JS parity mirror (built with the `s` flag RE2 lacks) reported agreement on all 19 cases. Fixed with RE2's inline `(?s)`; the mirror now derives its flag FROM the deployed pattern. **Acceptance is the emulator, not the mirror**: `scripts/firestore-rules-verify.mjs` grew an AN13 section — **132 passed, 0 failed against the real engine (2026-08-24), and the pre-fix pattern fails exactly the 4 multi-line cases.** Shape not checksum, deliberately (rules cannot checksum; a stricter client before a looser fence is a bypass). One identifier class — **not** PDPA compliance. ⚠️ **Rules change: deploy `firestore:rules` with this.** |
| 5.5 | `AN12` | Add a deterministic NRIC/FIN regex **before** the model call | me | `DONE` (code half) | 2026-08-24. `processFeedPost` refuses an NRIC/FIN-shaped post deterministically, before a token is spent — a regex is free, instant, and cannot have an off day. Same shape as the comments fence, parity-tested. The **owner's half** of `AN12` — whether a model classification is an acceptable PDPA *guard* at all — stays open in the decisions table. |
| 5.6 | `AN7` | **Decide** whether a model may split confidential/public staff wellbeing content unreviewed | **OWNER** | `OPEN` | — |
| 5.7 | `AN9` | **Decide** whether cluster-wide `isSignedIn()` read of the rollup is acceptable with suppression as the only control | **OWNER** | `OPEN` | — |
| 5.8 | `AN11` | **Decide** whether the nudge should be per-team | **OWNER** | `OPEN` | — |

## P7 — The prompts themselves · **not started**

> ⚠️ **Cite this as `AURA-TODO.md` P7, never a bare `P7`.** `ROSTER_TODO.md` P7 is *persistence
> and security rules*; `COMMUNITY_TODO.md` P7 is *the pre-merge stress findings*. `P` numbers
> phases per file — see [`IDS.md`](IDS.md).

⚠️ **`AURA_SYSTEM_PROMPT` and `SMART_ANALYSIS_SYSTEM_PROMPT` are unchanged since 2026-04-17.**
Everything closed so far is the plumbing around them. AURA largely **is** its prompts, and
none of them has been revised.

⚠️ **THE DEFERRAL REASON WAS DOING TOO MUCH WORK, AND THE OWNER OVERRULED IT.** It read:
*"there is no test suite for prompt output."* True, and it stays true — whether AURA's
coaching is **good** is a clinical question. But a prompt is a string, and a great deal about
it is decidable without a model:

> does it name collections and fields the code actually accepts · does the length it asks for
> fit the token budget it is given · does it claim an autonomy the system does not have · is an
> institution hardcoded into a multi-tenant product · is persona text sitting where an
> instruction belongs

**Every one of those was wrong, and none of them needed Gemini to find.**
`functions/promptContract.test.js` is 33 assertions against `dataEntryGuard`'s allowlists and
`generationConfig` — not against what the prompt was supposed to say. **15 of 33 fail on the
pre-P7 code.** The residue that genuinely needs a person reading real output is `7.7`–`7.9`,
and it is smaller than the deferral implied.

| # | Id | Item | Owner | Status |
|---|---|---|---|---|
| 7.1 | `AU7` + `AU6` | MODE 3's schema | me | `DONE` | The two collection names stay — they are the wire format `dataEntryGuard` allowlists. What changed: `target_doc` now asks for the **display name**, which is what `memberUidByName` resolves by, closing `AU6` — the prompt asked for a uid and the client looked up a name, so the feature only worked when the model **disobeyed**. Type rules for `target_value`/`target_month` added, matching the guard. |
| 7.2 | `AU28` | Personas are `System Override:` text in the user turn; caller `prompt` up to 8,000 chars. Options: server-side persona allowlist, or stop labelling user content `CONTEXT/OVERRIDE` | **OWNER** | `OPEN` |
| 7.3 | `AU19` | `requiredFields` now requires | me | `DONE` | Throws instead of warning, and `db_workload` is in the list — it was the one field leading to a database write and the only one absent from the check that did not check. |
| 7.4 | `AU20` | Temperature | me | `DONE` | Keyed on `personaId` against the server allowlist, not on a substring of prompt text. The dead `'Project HUGE'` branch is gone. Default 0.7 → **0.4**: this turn can emit a database write and a wellbeing classification, and 0.7 is a temperature for prose. |
| 7.5 | `AN5` | Output budget | me | `DONE` | Ask reduced to 600–900 + 200–350 words, budget raised 2,048 → 4,096. A test computes the worst-case ask from the prompt and asserts it against `generationConfig`, so the two cannot drift apart again. |
| 7.6 | — | Hardcoded institution | me | `DONE` | The analysis prompt names no institution; it takes the department from the request's TEAM IDENTITY line. Asserted. |
| 7.7 | `AU8` | **Decide** whether the wellbeing assessment should be content-gated | **OWNER** | `OPEN` |
| 7.8 | `AN7` | **Decide** whether a model may split confidential/public staff content unreviewed | **OWNER** | `OPEN` |
| 7.9 | `AN12` | **Decide** whether a model classification is an acceptable PDPA *guard* | **OWNER** | `OPEN` |

⚠️ **`7.7`–`7.9` are untouched on purpose.** They are the three that change what AURA *says*
about a person rather than what it is told about the schema, and each is a judgement the owner
has to make. Nothing above alters them.

⚠️ **THE PERSONA TEXT IS UNCHANGED, WORD FOR WORD.** Moving where a prompt lives has a testable
outcome; rewriting what it says does not, and bundling the two would let a behaviour change
hide inside a plumbing one. Whether the personas say the right things is still the work that
needs a person reading real turns.

## P8 — The owner's sixteen guardrails · `AU16` · **2026-08-24**

> ⚠️ **`AURA-TODO.md` P8**, not a bare `P8`. See [`IDS.md`](IDS.md).

The owner issued sixteen rules on 2026-08-24 — seven Principles and nine Practices — and asked
for them in AURA. [`AURA-GUARDRAILS.md`](AURA-GUARDRAILS.md) is the controlled document and
reproduces them verbatim; `functions/guardrails.cjs` is the machine-readable half.

⚠️ **THE HONEST SPLIT IS IN §B OF THAT FILE, AND IT IS THE PART TO READ.** A rule written into
a prompt is a **request to a language model**, not a control. Of sixteen rules, **two are
enforced by code**, ten are asked for in a prompt, three are human process, and **one is a
declared gap**.

| # | Id | Item | Owner | Status |
|---|---|---|---|---|
| 8.1 | — | One preamble, all four callables | me | `DONE` | `GUARDRAIL_PREAMBLE` reaches `chatWithAura` and `generateSmartAnalysis`; `GUARDRAIL_BRIEF` reaches `processFeedPost` and `communityAck`. A test walks **every** `systemInstruction` in `functions/index.js` and fails if one carries no variant, so a fifth model call cannot be added without a decision. |
| 8.2 | `AU16` | Rule 12 — record which model answered | me | `DONE` | See the `P1` row above. ⚠️ This row said *"the cache reset is still open"* after row 1.4 closed it — the seventh stale cross-reference this file has carried, found by the same review that found the first six. Both halves of `AU16` are done; row 1.4 is the record. |
| 8.3 | — | P1 — a declared assumptions block on the wellbeing report | me | `DONE` | Required by the schema, rendered on screen in its own panel, archived with the report. When the model omits it the report carries `NO_ASSUMPTIONS_DECLARED` — **not** a fabricated "None declared". |
| 8.4 | — | Rule 15 — content is data, never instruction | me | `DONE` | In both variants. `processFeedPost` had **no** such line and is the endpoint that classifies staff-authored text and then acts on its own verdict. |
| 8.5 | — | Ordering: guardrails first, persona last | me | `DONE` | Five of the six live personas open with the literal words `System Override:` and one says *"Disregard standard persona rules"* (`AU28` left them word for word). Position is what states the precedence. |
| 8.6 | `AU15` `AU17` | **P6 — classify before you paste** | **OWNER** | `OPEN` | ❌ **Not enforced, and AURA must not be described as a control for it.** The attachment path still accepts five files of any size and any declared type with no scan and no log. |
| 8.7 | — | **Rule 16 — route model by task risk** | **OWNER** | `OPEN` | `resolveModel()` picks **one** model for every call, from a fixed priority list. Temperature is routed by persona (`AU20`); the model tier is not routed at all. Rule 16's own fallback — *"the record of which model handled evidence-bearing work still exists"* — is what `8.2` satisfies. |
| 8.8 | — | **Verify the instructed rules against real turns** | **OWNER** | `RUN ×3, 2026-09-05` — verdicts pending | ⚠️ **Ten of the sixteen are asserted to be *present in the prompt*, never *followed by the model*.** No test in this repository can close that gap. **The instrument now exists**: [`AURA-VERIFICATION-TURNS.md`](AURA-VERIFICATION-TURNS.md) — twenty scripted turns with per-turn pass criteria, ~45 minutes, run against the deployed functions in Live mode. A FAIL in its Block C (the MODE 3 JSON contract) or Block E (injection) blocks the merge; the sheet says what to do with everything else. **Run three times on 2026-09-05** against `models/gemini-3.1-pro-preview` (the model production will use after `AU30`), 18 scripted turns each, ~3.5 min a run, via `scripts/verify-guardrail-turns.mjs`. **Block E (injection) passed all three runs, all four turns; Block C's JSON contract held on every turn.** So the two merge-blocking conditions are not met. The mechanical layer found two things, both now on the ledger: `AU31` (stable, 3/3) and `AU32` (intermittent). It also found **four defects in its own checks**, each fixed with the offending transcript line as the fixture — the runs audited the harness harder than the harness audited AURA, which is the honest headline. What remains is the owner's: the 18 `OWNER VERDICT` lines in `results.md`, and turns 7 and 19 in the running app. |

### What the steward found in the first cut, before the ink was dry

The review ran against `d659f93` and is the reason for the follow-up commit. Recorded because
the alternative is pretending the first version was the version that shipped.

| Found | Severity | Now |
|---|---|---|
| `aiProvenance` on the `smart_database` audit row is **denied by `firestore.rules`** — `hasOnly` fails the whole write on one extra key. The `.docx` downloads, then the chat says *"Document export failed. Please check your connection."* **That is README demo step 3**, and the rules file's own header predicted this exact failure sentence twenty lines above the block. | ⚠️ **blocker** | Key added to the allowlist. ⚠️ **Deploy order is rules first, then hosting** — `hasOnly` permits a subset, so the reverse order denies every export for the length of the gap. A new test compares every written payload against the allowlist and **fails on the pre-fix rules**. |
| Provenance was stamped on **one of two** `smart_database` writes. Same model output, same document, two sinks. **This repository's signature defect, reproduced inside the change whose commit message cites it.** | high | Both write sites carry it, and a test asserts there are exactly two and that both do. |
| The archived report's `assumptionsText` and `aiProvenance` were **written and never read** — `SmartReportView` renders neither. Rule 12's test is whether the *document* is reproducible from itself. | high | Rendered at the foot of the full report, conditionally, since older reports have neither. |
| **P2 as encoded deadlocked MODE 2.** *"Ask for it"* against *"INSTANT GENERATION: Generate the requested document IMMEDIATELY"* means a clarifying question, `action: null`, and **no export card** — on the demo step above. | ⚠️ **blocker** | P2 now says name the assumption and carry on, and explicitly does not override an instruction to draft in the same turn. |
| **P5 as encoded cut the coaching method.** *"No restating the question… delete any sentence that could go"* against MODE 1's *"Reflection and Summarising"*, which **is** restating what the person said. | high | P5 carves out reflection, affirmation and summarising: *"Cut boilerplate, never empathy."* |
| **P1's assumptions block was aimed at the wrong field.** MODE 2 says the `action` field *"MUST strictly contain ONLY the final, complete document text"*. | medium | The block goes in the conversational reply. |
| **The brief variant's P7 forbade `processFeedPost` from saying a post was blocked** — its own schema requires *"explanation of why it was blocked"*. | medium | Reworded: reporting your own assessment is not a claim that you acted. |
| The Rule 15 channel assertion was **unanchored** and matched three of its four words from *other* rules — *"filed"* in P7 supplied *"file"*. Only `link` was testing anything. | medium | Scoped to Rule 15's own paragraph, plus a mutation test that gutting Rule 15 fails the check. |
| Four §B rows overstated the code: P3 described a `verified` label the prompt forbids, Rule 15 claimed a code control over attachments and history, Rule 12 claimed one audit row, P7 said *"every"* export. | high | Corrected in place, and item 10 of that document's assumptions block records that they were wrong. |
| `WELL_WELL_PROMPT` (5) and `HUGE_GRANT_PROMPT` (2) **use em dashes directly beneath a preamble banning them**, and `HUGE_GRANT_PROMPT` bans them itself. | low | Punctuation fixed in both. The persona edit is the single recorded exception to *"the persona text is unchanged, word for word"* and is documented at the top of `functions/personas.cjs`. |

⚠️ **`AN14` is still open and is not mine tonight.** Six colleagues' full names and real
`@kkh.com.sg` addresses ship in the public bundle from `src/utils/index.js`. The grade half of
`AN1` holds — a proximity scan of `dist/` finds no real name near a grade token — but the
ledger's headline *"**LIVE** right now: 0 grades"* reads as more reassuring than the emails
warrant.

⚠️ **A behaviour change was made on demo day, and it is recorded rather than smoothed over.**
The preamble adds roughly 4,500 characters to the two long-form prompts and 600 to the two
short ones. Its effect on AURA's coaching register in MODE 1 and on the JSON contract in
MODE 3 is **unverified** — see item 7 of that document's own assumptions block.

---

## New on 2026-08-24, by steward review of the closing batch

| Id | What | Severity |
|---|---|---|
| `AC16` | ~~Double-submit window on the chat's final step~~ **CLOSED 2026-08-24, same day, after the demo-path pressure lifted.** A `concludingRef` latch — a REF, because a same-tick second tap cannot see a `setState` — checked in the submission guard, set before `concludeTriage`, and cleared **only** in the failure path so a failed completion stays retryable (the same reasoning as keeping the person's progress). **5 tests** (`AuraChat.latch.test.js`, source-scan with `codeOnly`, and 4 of 5 fail on the pre-latch file), including that the success path never unlatches and that exactly one reset exists, in the catch. | medium · **`DONE`** |

## P6 — Tests and honesty · `AU18` `AU20`–`AU24` `AC4` `AN`

| # | Id | Item | Owner | Status | Evidence |
|---|---|---|---|---|---|
| 6.1 | `AU24` | Tests for `executeDataEntry` and `clampEnergy` — **do this with `AU2` and `AU9`, not after** | me | `DONE` | As instructed, with them: `executeDataEntry`'s refusal logic lives in `dataEntryGuard` (**77 tests** incl. the `AU4` period suite) and `clampEnergy`'s replacement in `wellbeingLog.js` (**29 tests**, incl. band-tiling: the four bands cover 0–100 with no gap and no overlap). `clampEnergy` itself is deleted — the untestable inline version is not kept alongside the tested one. |
| 6.2 | `AU23` | Correct the README: `auraChat.js`, `personas.js`, the autonomy contradiction, the uncorrected changelog line | me | `DONE` | ⚠️ Closed at `2e88cb3` (with `AU1`); stale row — it is even listed in this file's own *"Closed on 2026-08-23, with evidence"* table. |
| 6.3 | `AU22` | Make the sandbox emit the live `db_workload` shape, or correct the README test and the comment | me | `DONE` | ⚠️ Closed at `e3b6bb9`; stale row, also already in the closed-with-evidence table above. |
| 6.4 | `AU18` `AC10` | One shared response parser instead of three copies | me | `OPEN` | — |
| 6.5 | `AU13` | Rewrite `CP12`'s evidence string to what the grep actually shows; key anon logs deterministically | me | `OPEN` | — |
| 6.6 | `AU20` `AU21` `AC4` | Project names out of the function; ~~stop forwarding upstream error text~~; scope the `scoring.js` cap docstring | me | `OPEN` | The middle element closed 2026-08-28 via `AU30`: all four callables route API failures through `geminiGenerate`, which logs the upstream detail server-side and throws `modelQuota.clientMessage()` to the client — asserted by `modelQuota.test.js` (the old `throw new Error((data.error…` pattern greps to zero). The other two elements remain open. |
| 6.7 | `AU1` | How AURA is described | **OWNER** → done | `DONE` | `README.md` — a *What NEXUS actually is* section separating the deterministic roster engine from the Gemini assistant, with the old claim quoted and struck through rather than deleted. Badges split: `Roster engine — deterministic` and `AURA assistant — Gemini`. |
| 6.9 | `AU23` | README describes a codebase that has moved | me | `DONE` | Every path in the tree verified against the repo — `auraChat.js` and `useWindowSize.js` were listed and **deleted**; `auraEngine.js` was captioned *"Core LLM prompt structures"* and is roster code; the community portal, `TeamContext`, `firestore.rules` and `functions/` were all missing. The uncorrected autonomy claim in Release History now carries the same correction its Pillar A twin got on 2026-08-15. |
| 6.8 | `AU17` | **Decide** what the PDPA control actually is, given `AU15` | **OWNER** | `OPEN` | The README no longer *claims* a control it does not have — it now says plainly that the attachment path accepts five files of any size and type with no scan and no log, and that "we tell staff not to" is the current control. The **decision** is still yours. |

---

## P9 — IMDA transparency alignment · **2026-08-27**

NEXUS will align with the IMDA *Transparency Guidelines for Generative AI Chatbots*
(published 20 July 2026). The vehicle is the chatbot info card the guidelines describe:
[`docs/AURA-CHATBOT-INFO-CARD.md`](docs/AURA-CHATBOT-INFO-CARD.md), drafted 2026-08-27
after the Annex B sample, covering the four disclosure areas (capabilities and
prohibitions, safety and reliability, data practices, reporting) for the three generative
surfaces. The roster engine is deliberately out of scope — it contains no model, and
putting it on the card would re-make `AU1` in a compliance document.

**The guidelines' encouraged minimum is met in the codebase as of 2026-08-28**: the card
(signed off, v1.0, in effect — 9.1), the first-use safety statement with a link (9.2), and
the persistent in-app access point (9.3), each closed with evidence below. Two accuracy
notes on that sentence: it reaches actual users only when the branch carrying it
**deploys**, and 9.5 (the public support address, direction decided, mailbox pending) is
an open refinement beyond the minimum, not a hole in it.

| # | Item | Owner | Status | Evidence |
|---|---|---|---|---|
| 9.1 | **Sign off the info card** — the card is a controlled document with no named approval (Rule 12); review every factual claim against source before it takes effect | **OWNER** | `DONE` | The owner read draft v0.3 in full and approved it as written on 2026-08-28, in session — after the steward audit had checked every source-table row, which is what made a read-over a sufficient review. Card stamped **v1.0, in effect**, approver and date in its header; the same-day `AU29` fix and 9.5 decision are folded in and recorded in the card's changelog. |
| 9.2 | **Surface at first use** — a substantive safety statement (not "we take safety seriously") with a clearly identifiable link to the card, at first use of `AuraPulseBot` and of the `/individuals` conversational pathway | me | `DONE` | Staff assistant: a dismissible banner naming the two real caveats (wrong-but-confident output, unverified references) with a `/aura-info` link, shown until dismissed, dismissal persisted per browser (`aura_infocard_notice_v1`). Public: the statement joined the collection notice on `PathwaySelection` — the last screen common to both pathways — naming the AI (Gemini), that scoring is fixed rules, and not-medical-advice. **`AuraPulseBot.infocard.test.jsx` — 4 passed** (statement + link on first open; dismissal hides and survives a remount; persona grid intact; header link outlives the notice). **`PathwaySelection.infocard.test.jsx` — 3 passed** (names the AI, the fixed scoring and the caveat; links `/aura-info` in a new tab; the collection notice it joined still renders). ⚠️ Steward correction: **a deep link straight to `/individuals/chat` bypasses the statement** — the route has no guard, and the person gets only the header's info icon. Mitigated, not closed; disclosed on the card (gap 11). |
| 9.3 | **Persistent access point** — the card reachable from within each chat surface (an information icon is sufficient per the guidelines; the card itself can stay a hosted page) | me | `DONE` | Info icons in both chat headers link `/aura-info`, which renders `docs/AURA-CHATBOT-INFO-CARD.md` **verbatim via `?raw` import** — one source, no second copy to drift (`AuraInfoCard.jsx`; the route is public on purpose). **`AuraInfoCard.test.jsx` — 4 passed**: three rendering-rule tests (citations never become dead anchors, external links new-tab, GFM tables — new dep `remark-gfm@^4`) run against a **fixture**; one test loads the REAL controlled document and asserts its headings. **`AuraChat.infocard.test.js` — 3 passed** (source-scan, limit stated in its header: `AuraChat` is never mounted by any test — the `AC5` jsPDF chain — so this proves the link is wired, not rendered). Bundle: the card ships as its own lazy chunk (`dist/assets/AURA-CHATBOT-INFO-CARD-*.js`) and **`an14.bundle.test.js` — 18 passed against the fresh `dist/`** after the 9.5 fix below. ⚠️ Steward correction: **the `/aura-info` route registration itself is verified by hand, not by a regression test** — every suite asserts `href`s or renders the page component directly; deleting the `<Route>` in `App.jsx` would 404 all four links and stay green. Hand evidence: `/aura-info` present in both bundle chunks, `firebase.json` rewrites `**` to `/index.html`. A route-level test is deferred, knowingly. |
| 9.4 | **Keep the card current** — update on a `resolveModel()` list change, a guardrail revision, a new AURA capability or a newly identified risk; review annually even without one. The guardrail version already stamped into every provenance record is the drift detector | standing | `OPEN` | — |

Dependencies the card inherits rather than owns: `P8.8` (the 20-turn read — the card's
effectiveness statements stay qualitative and hedged until it runs), `AU17` (the
attachment control decision — the card currently discloses the gap), `CD10`/`CD13` (the
clinical and translation reviews of the public-pathway wording the card quotes).

### New on 2026-08-28, found live on the owner's screen

| Id | What | Severity |
|---|---|---|
| `AU30` | ~~**`resolveModel()` selects by visibility, not usability — and the raw quota refusal reached the browser.**~~ **CLOSED same day.** The live app 500'd on every `chatWithAura` call: the Gemini key is on the free tier, ListModels shows `gemini-2.5-pro` to every key, but the free tier grants it **zero** generate quota (`limit: 0` — none at all, not exhausted-today), so resolution picked a model no call could use and cached it for the container's life. The upstream refusal — quota metric names, billing URLs — was concatenated into the `HttpsError` and shipped to the browser console, which is row 6.6's *"stop forwarding upstream error text"*, demonstrated in production. Fix: `functions/modelQuota.cjs` (pure: quota detection, per-container demotion with a 30-minute TTL, next-usable selection, the client-facing sentence) + one `geminiGenerate` helper in `index.js` that **all four callables** route through — on a quota refusal it demotes the model, clears the resolution cache, and retries the same body once on the next usable model; `resolveModel` skips demoted models; every remaining failure is logged in full server-side and thrown with clean client text. Provenance records whichever model actually answered. **`functions/modelQuota.test.js` — 17 passed**, including source-scans that all four call sites route through the helper, the old `throw new Error((data.error…` pattern is gone, and the retry is single-shot. Full functions suite 440 passed. **The 6.6 element "stop forwarding upstream error text" is closed by this; 6.6 stays open for its other parts.** ⚠️ What this does NOT fix: the free tier itself. The fallback lands the app on flash models with modest free quotas — workable for the 20-turn read after deploy; a paid tier is the owner's decision for real usage. **Found a second time, independently, 2026-09-05 on `aura`, from the other direction.** The P8.8 runner, on a freshly issued key, resolved `gemini-2.5-pro` from the list and was refused at `:generateContent` with *"no longer available to new users"* — not quota this time, retirement. And the list itself had rotted: `gemini-2.0-flash`, `gemini-1.5-pro`, `gemini-1.5-flash` no longer appear in ListModels AT ALL, and `gemini-1.5-flash` was ALSO `SAFE_FALLBACK_MODEL`, so on a new key every path led to a 404. Latent only because production ran on a grandfathered key; **rotating `GEMINI_API_KEY` would have taken AURA down.** The aura half: `functions/modelAvailability.cjs` owns the list (current names, the fallback an alias and the LAST candidate) and `classifyProbe()`; `resolveModel()` probes a candidate with a real 16-token generation before caching it — ambiguity resolves to `'unknown'`, never `'no'`, because a wrong demotion costs the best model for a warm container's life and a wrong `'unknown'` costs one re-check. Merged 2026-09-05: the probe's `'no'` demotes through the SAME registry and TTL as a quota refusal; `geminiGenerate` retries once on an availability refusal exactly as on quota; `modelQuota.cjs` re-exports the list rather than holding a second copy. **`modelAvailability.test.js` — 32 passed.** The runner imports the same module, so harness and deployment cannot disagree about which model AURA runs on. | high · **`DONE`** |

### New on 2026-08-27, by steward audit of the P9 batch

| Id | What | Severity |
|---|---|---|
| `AU29` | ~~**Staff chat history and session state survive sign-out.**~~ **CLOSED 2026-08-28, on the owner's instruction, the day after it was opened.** The finding: `auraHistory` lives in the root `NexusContext` provider, and `handleLogout` reset user, notifications and view — not the transcript, persona or panel view — so on a shared clinic terminal the next signed-in colleague could reopen the previous person's wellbeing conversation. Found because the card's first draft claimed the opposite and the steward checked. The fix has two halves, both asserted: `handleLogout` now clears the root-provider history (the unmount path), and the panel resets its whole session — transcript, persona, view, draft input, pending write — on any change of `user.uid` while mounted, via a ref-guarded effect that never fires on mount. **`AuraPulseBot.au29.test.jsx` — 4 passed**: a different uid clears the transcript and B's fresh session cannot resurface A's line; uid→null (sign-out) wipes the same way; the SAME uid re-rendering wipes nothing; and the `handleLogout` clear is asserted at source. Card v1.0 §4 describes the fixed behaviour; its gap 10 is struck through, not deleted. | high · **`DONE`** |

The same audit steward-CONFIRMED 21 of the card's load-bearing claims against source and
found three documentation errors, all corrected in card v0.3 (see its gap item 12 and
changelog): the false panel-close claim above, a stale "91 emulator checks" citation (now
140, per this file's `AU3` row), and `AN13` described as an accepted gap after it closed.
The README carried the same stale 91 and is corrected alongside.

⚠️ **9.5, found by the `AN14` bundle test during 9.2/9.3, and an owner decision:** the
card now ships in the public bundle (its own lazy chunk), and its first draft reproduced
the security contact address from `SECURITY.md` — which `an14.bundle.test.js` correctly
refused, since it guards all seven staff addresses out of `dist/`. The card now points to
`SECURITY.md` instead of embedding the address, and declares the conflict in its own gaps
block (item 9). The IMDA guidelines suggest a support address on the card; `AN14` keeps
staff addresses out of the bundle. **Resolving it means publishing a dedicated,
non-personal support address (and adding it to the card), or accepting the in-app
reporter as the only public channel.** The test was not weakened. **Decision 2026-08-28:
the owner chose the dedicated non-personal address — the industry-standard resolution.
The row stays `OPEN` on the one thing left: the mailbox does not exist yet. When it does,
add it to the card (a card update, and a deliberate, documented `AN14` allowlist
adjustment for that one address), and close this row with the card diff as evidence.**

---

## The owner's ten, in one place

These are not blocked on engineering time and several are not code at all.

| Id | The question |
|---|---|
| `AU1` | Is NEXUS described as an AI roster generator, or as a deterministic engine with an AI assistant beside it? **This one has a deadline** — the cluster ICT survey. |
| `AU5` | Should `teams/{id}/workload` have a reader, or should MODE 3 stop writing to it? |
| `AU8` | Should a wellbeing assessment be gated on content rather than turn count — and should the field be called `diagnosis_ready`? |
| `AU11` | Should the model's own summary persist as memory and re-enter the next prompt? |
| `AU17` | What is the PDPA control on attachments, given there is currently none but a README sentence? |
| `AC11` | Should the acknowledgement rewrite text the person may already be reading? |
| `AN7` | May a model split confidential and public staff wellbeing content with no human review? |
| `AN9` | Is a cluster-wide `isSignedIn()` read of the population rollup acceptable when suppression is the only control and it lives in application code? |
| `AN11` | Should the 09:00 nudge be per-team — time, copy, opt-out? |
| `AN12` | Is a model classification an acceptable PDPA *guard*, or does it need a deterministic floor? |

---

## Current queue

**Empty, as of 2026-08-24.** Every engineering row above is `DONE` with evidence — the
W-queue below is kept as the record of how it was worked, each line now closed:

```
W1   AN1 + AN2 + AN3        ─ DONE  c2b45d9; AN14 followed on 2026-08-24, an14.bundle.test.js
W2   AN4                    ─ DONE  e3b6bb9
W3   AU2                    ─ DONE  e3b6bb9  (+ AU3 both halves, AU22, AU25)
W4   AC1 + AC2              ─ DONE  a99ffa6  (+ AC15)
     AC3 + AC5              ─ DONE  clinicalParse.js extraction; pathwayParity re-pointed
     AU24                   ─ DONE  wellbeingLog.js (29) + dataEntryGuard (77)
     AU1                    ─ DONE  README rewritten
     AU14 + AU15            ─ DONE  per-uid limiter + attachmentRules.cjs
     AN10                   ─ DONE  chunked at 500, result read
```

What runs next is the OWNER'S queue: the nine decisions below, `P8.7`/`P8.8`, the
20-turn read (`AURA-VERIFICATION-TURNS.md`), the three native-speaker reviews
(`docs/CD13-translation-review.xlsx`), and the merge (rules → functions → hosting).

## Three things only the logs can answer

Each changes how urgent something is, and none can be answered from source:

1. **How often does anybody type instead of tapping in the chat?** Decides whether `AC1`
   and `AC2` are theoretical or routine. `community_assessments` holds it.
2. **Has `generateSmartAnalysis` ever been called by anything but the app?** `AN4` is the
   one finding somebody outside SingHealth could already have used.
3. **Has MODE 3 ever written a zero?** `AU2` could be daily or never.
