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
| `DONE`, evidenced | **0** | — |
| `OPEN`, mine | 41 | everything not listed below |
| `OPEN`, **owner's decision** | 10 | `AU1` `AU5` `AU8` `AU11` `AU17` `AC11` `AN7` `AN9` `AN11` `AN12` |
| **`LIVE` right now** | **4** | `AN1` `AN4` (anyone on the internet) · `AC1` `AC2` (any member of the public who types) |

**Nothing has been fixed.** Every row is `OPEN`. This file was created the same day as the
findings.

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
| 0.1 | `AN1` | Delete `STAFF_PROFILES`; verify against `dist/` | me | `OPEN` | — |
| 0.2 | `AN2` | Source profiles from `members`, grades from `useTeamGrades` | me | `OPEN` | — |
| 0.3 | `AN4` | Auth + team-membership check on `generateSmartAnalysis` | me | `OPEN` | — |
| 0.4 | `AU2` | `Number.isFinite` + range on `target_value` | me | `OPEN` | — |
| 0.5 | `AC1` | Remove the `includes('20')` branch | me | `OPEN` | — |
| 0.6 | `AC2` | Word-numbers in the PAVS ladder | me | `OPEN` | — |

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
| 2.1 | `AU3` | Allowlist `target_field`; add `changedKeys().hasOnly` to the workload rule | me | `OPEN` | — |
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

## P6 — Tests and honesty · `AU18` `AU20`–`AU24` `AC4` `AN`

| # | Id | Item | Owner | Status | Evidence |
|---|---|---|---|---|---|
| 6.1 | `AU24` | Tests for `executeDataEntry` and `clampEnergy` — **do this with `AU2` and `AU9`, not after** | me | `OPEN` | — |
| 6.2 | `AU23` | Correct the README: `auraChat.js`, `personas.js`, the autonomy contradiction, the uncorrected changelog line | me | `OPEN` | — |
| 6.3 | `AU22` | Make the sandbox emit the live `db_workload` shape, or correct the README test and the comment | me | `OPEN` | — |
| 6.4 | `AU18` `AC10` | One shared response parser instead of three copies | me | `OPEN` | — |
| 6.5 | `AU13` | Rewrite `CP12`'s evidence string to what the grep actually shows; key anon logs deterministically | me | `OPEN` | — |
| 6.6 | `AU20` `AU21` `AC4` | Project names out of the function; stop forwarding upstream error text; scope the `scoring.js` cap docstring | me | `OPEN` | — |
| 6.7 | `AU1` | **Decide** how AURA is described — see below | **OWNER** | `OPEN` | — |
| 6.8 | `AU17` | **Decide** what the PDPA control actually is, given `AU15` | **OWNER** | `OPEN` | — |

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
W1   AN1 + AN2 + AN3        ─ delete STAFF_PROFILES; verify against dist/
W2   AN4                    ─ auth + membership, copied from processFeedPost
W3   AU2                    ─ Number.isFinite on target_value
W4   AC1 + AC2 + AC3 + AC5  ─ one shared PAVS parser
     AU24                   ─ tests, alongside AU2 and AU9
     AU14 + AU15            ─ ceilings on the expensive endpoint
     AN10                   ─ chunk the nudge before it passes 500 users
     AU1                    ─ owner's, and the ICT survey is the clock
```

## Three things only the logs can answer

Each changes how urgent something is, and none can be answered from source:

1. **How often does anybody type instead of tapping in the chat?** Decides whether `AC1`
   and `AC2` are theoretical or routine. `community_assessments` holds it.
2. **Has `generateSmartAnalysis` ever been called by anything but the app?** `AN4` is the
   one finding somebody outside SingHealth could already have used.
3. **Has MODE 3 ever written a zero?** `AU2` could be daily or never.
