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
| `DONE`, evidenced | **13** | `AU1` `AU2` `AU3` `AU22` `AU23` `AU25` `AU26` `AC1` `AC2` `AC15` `AN1`* `AN2` `AN3` `AN4` |
| `OPEN`, mine | 30 | everything not listed below |
| `OPEN`, **owner's decision** | 9 | `AU5` `AU8` `AU11` `AU17` `AC11` `AN7` `AN9` `AN11` `AN12` |
| **`LIVE` right now** | **0 grades** · names/emails as `AN14` | \* `AN1`'s grade half is closed and verified against `dist/`; `AN14` is the residue |

**53 findings**, not the 51 this file was created with: `AU25` (the go-live gate) and
`AC15` (fixing `AC1`) were opened on the same day. Neither renumbers anything.

## ⚠️ Two new ids, opened by review of the first fix batch

| Id | Finding | Severity |
|---|---|---|
| `AU27` | `exportToDoc` (`AuraPulseBot.jsx:561`) and `confirmAdminAction` (`:690`) write to `smart_database` with **no `isDemo` guard** — the guard was added to `executeDataEntry` and not to its two siblings, which is this project's defining defect shape. `firestore.rules` is `allow create: if isSignedIn()`, and Demo Mode is reachable **signed out** from the landing page, so a signed-out presenter following `README.md` step 3 gets the `.docx` **and** a red *"check your connection"* banner that is false twice over. Zero-code mitigation: sign in first. | high · **OPEN** |
| `AU26` | `target_doc` — the field that CHOOSES the Firestore document — was the one model-supplied value left to `String()` coercion. `{}` → `"[object Object]"`, `true` → `"true"`, `0` → `"0"`, all ACCEPTED. Contained on `staff_loads` by the `memberUidByName` lookup; **not** contained on `monthly_workload`, where `workloadPath` asserts nothing. Data quality, not disclosure. **Closed** in `c2b45d9`. | medium |
| `AN14` | `TEAM_DIRECTORY` still ships in the bundle: seven real **names** and seven real **work email addresses**. Still live via `checkAccess` (`App.jsx:599`, `WelcomeScreen.jsx:170`) and `STAFF_LIST`/`STAFF_IDS`. The **grades** are out; the names and addresses need the legacy auth bridge reworked, which is not a night-before-a-demo change. | medium · **OPEN** |

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
| 1.1 | `AU14` | `rateLimit.js` on `chatWithAura` and `generateSmartAnalysis` | me | `OPEN` | — |
| 1.2 | `AU15` | Byte cap + mimeType allowlist on attachments | me | `OPEN` | — |
| 1.3 | `AN10` | Chunk `sendEachForMulticast` at 500; surface the failure | me | `OPEN` | — |
| 1.4 | `AU16` | Reset `modelResolutionPromise` on every non-success; record the model on the response | me | `OPEN` | — |

## P2 — What the model may write · `AU3`–`AU7`

| # | Id | Item | Owner | Status | Evidence |
|---|---|---|---|---|---|
| 2.1 | `AU3` | Allowlist `target_field` | me | `DONE` (client) · `OPEN` (rule) | `e3b6bb9`. ⚠️ The `changedKeys().hasOnly` backstop on the workload rule is **not** done — deliberately, because tonight's list touches no rules. |
| 2.2 | `AU4` | `assertPeriod` on `workloadPath`, matching `assertYear` | me | `OPEN` | — |
| 2.3 | `AU6` | Make the System Note, MODE 3 and `memberUidByName` agree on ONE key | me | `OPEN` | — |
| 2.4 | `AU7` | Update the prompt's schema to the post-migration paths | me | `OPEN` | — |
| 2.5 | `AU19` | Make `requiredFields` enforce; add `db_workload` to the list | me | `OPEN` | — |
| 2.6 | `AU5` | **Decide** whether the workload collection should have a reader at all | **OWNER** | `OPEN` | — |

## P3 — What the model says about a person · `AU8`–`AU12`

| # | Id | Item | Owner | Status | Evidence |
|---|---|---|---|---|---|
| 3.1 | `AU9` | Reject `NaN`; record phase/energy disagreement instead of hiding it | me | `OPEN` | — |
| 3.2 | `AU10` | Refuse a phase outside the four | me | `OPEN` | — |
| 3.3 | `AU12` | Key the pulse board by uid | me | `OPEN` | — |
| 3.4 | `AU8` | **Decide** whether "diagnosis_ready" should be content-gated, and whether that field should be called *diagnosis* at all | **OWNER** | `OPEN` | — |
| 3.5 | `AU11` | **Decide** whether model output should persist as memory and re-enter the prompt | **OWNER** | `OPEN` | — |

## P4 — The public screening · `AC6`–`AC14`

| # | Id | Item | Owner | Status | Evidence |
|---|---|---|---|---|---|
| 4.1 | `AC6` | Move the guard to the calls that can throw; `clearProgress()` after, not before | me | `OPEN` | — |
| 4.2 | `AC12` | `aria-live="polite"` on the message list | me | `OPEN` | — |
| 4.3 | `AC5` | Export the parser so it can be tested; add the unit suite `P4.3` has been asking for | me | `OPEN` | — |
| 4.4 | `AC8` | `AbortController` on the 1500 ms discard window | me | `OPEN` | — |
| 4.5 | `AC9` | Anchor or drop the error-word screen on the model's reply | me | `OPEN` | — |
| 4.6 | `AC7` `AC10` `AC13` `AC14` | The four small ones: dead catch, third parser copy, `key={idx}`, `TOTAL_STEPS` | me | `OPEN` | — |
| 4.7 | `AC11` | **Decide** whether the acknowledgement should rewrite text in place at all | **OWNER** | `OPEN` | — |

## P5 — The intelligence layer · `AN5`–`AN13`

| # | Id | Item | Owner | Status | Evidence |
|---|---|---|---|---|---|
| 5.1 | `AN5` | Raise `maxOutputTokens`, or lower the word counts the prompt asks for | me | `OPEN` | — |
| 5.2 | `AN6` | Make the client timeout, the function timeout and the fetch abort agree — and tell the user the true number | me | `OPEN` | — |
| 5.3 | `AN8` | Refuse to render or archive the fallback string as a report | me | `OPEN` | — |
| 5.4 | `AN13` | Route comments through the PDPA guard, or fence them the way posts are | me | `OPEN` | — |
| 5.5 | `AN12` | Add a deterministic NRIC/FIN regex **before** the model call | me | `OPEN` | — |
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

## P6 — Tests and honesty · `AU18` `AU20`–`AU24` `AC4` `AN`

| # | Id | Item | Owner | Status | Evidence |
|---|---|---|---|---|---|
| 6.1 | `AU24` | Tests for `executeDataEntry` and `clampEnergy` — **do this with `AU2` and `AU9`, not after** | me | `OPEN` | — |
| 6.2 | `AU23` | Correct the README: `auraChat.js`, `personas.js`, the autonomy contradiction, the uncorrected changelog line | me | `OPEN` | — |
| 6.3 | `AU22` | Make the sandbox emit the live `db_workload` shape, or correct the README test and the comment | me | `OPEN` | — |
| 6.4 | `AU18` `AC10` | One shared response parser instead of three copies | me | `OPEN` | — |
| 6.5 | `AU13` | Rewrite `CP12`'s evidence string to what the grep actually shows; key anon logs deterministically | me | `OPEN` | — |
| 6.6 | `AU20` `AU21` `AC4` | Project names out of the function; stop forwarding upstream error text; scope the `scoring.js` cap docstring | me | `OPEN` | — |
| 6.7 | `AU1` | How AURA is described | **OWNER** → done | `DONE` | `README.md` — a *What NEXUS actually is* section separating the deterministic roster engine from the Gemini assistant, with the old claim quoted and struck through rather than deleted. Badges split: `Roster engine — deterministic` and `AURA assistant — Gemini`. |
| 6.9 | `AU23` | README describes a codebase that has moved | me | `DONE` | Every path in the tree verified against the repo — `auraChat.js` and `useWindowSize.js` were listed and **deleted**; `auraEngine.js` was captioned *"Core LLM prompt structures"* and is roster code; the community portal, `TeamContext`, `firestore.rules` and `functions/` were all missing. The uncorrected autonomy claim in Release History now carries the same correction its Pillar A twin got on 2026-08-15. |
| 6.8 | `AU17` | **Decide** what the PDPA control actually is, given `AU15` | **OWNER** | `OPEN` | The README no longer *claims* a control it does not have — it now says plainly that the attachment path accepts five files of any size and type with no scan and no log, and that "we tell staff not to" is the current control. The **decision** is still yours. |

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

In order. `P0` first because those five are reachable today.

```
W1   AN1 + AN2 + AN3        ─ NEXT. delete STAFF_PROFILES; verify against dist/
W2   AN4                    ─ DONE  e3b6bb9
W3   AU2                    ─ DONE  e3b6bb9  (+ AU3, AU22, AU25)
W4   AC1 + AC2              ─ DONE  a99ffa6  (+ AC15, found while fixing AC1)
     AC3 + AC5              ─ still open: unifying the two pathways on one parser
     AU24                   ─ partly done: the decision is tested, clampEnergy is not
     AU1                    ─ DONE  README rewritten; the ICT survey answer can quote it
     AU14 + AU15            ─ ceilings on the expensive endpoint
     AN10                   ─ chunk the nudge before it passes 500 users
```

## Three things only the logs can answer

Each changes how urgent something is, and none can be answered from source:

1. **How often does anybody type instead of tapping in the chat?** Decides whether `AC1`
   and `AC2` are theoretical or routine. `community_assessments` holds it.
2. **Has `generateSmartAnalysis` ever been called by anything but the app?** `AN4` is the
   one finding somebody outside SingHealth could already have used.
3. **Has MODE 3 ever written a zero?** `AU2` could be daily or never.
