# AURA — handoff

**Last updated:** 2026-08-23. **Read this first.** [`AURA-TODO.md`](AURA-TODO.md) is the
plan, [`AURA-POSTMORTEM.md`](AURA-POSTMORTEM.md) is the evidence,
[`AURA-CHANGELOG.md`](AURA-CHANGELOG.md) is the version history.

---

## 0. Today, in one paragraph

AURA was audited end to end on 23 August 2026 across three surfaces — the staff assistant,
the public health screening, and the intelligence layer — producing **51 findings**, of
which **none is fixed**. Four are live and reachable right now. The most serious is not an
AI defect at all: **six named colleagues' job grades are in the public JavaScript bundle**
(`AN1`), served on every route including the community screening a member of the public
opens, undoing a grade-privacy model that was rebuilt from scratch three days earlier. The
second most serious, `AN4`, is an unauthenticated Gemini endpoint on the billed key. The
audit also found the roster engine is not AI, is described as AI throughout the README, and
that this matters this month because a cluster-level rostering ICT is asking what NEXUS is
(`AU1`).

---

## 1. What AURA actually is

**Six things, and the name is the first problem.** Only four involve a model.

| Surface | File | Model | Reachable by |
|---|---|---|---|
| Staff assistant | `AuraPulseBot.jsx` → `chatWithAura` | Gemini, runtime-resolved | signed-in staff |
| Public screening | `AuraChat.jsx` → `communityAck` | Gemini, 200 tokens | **anyone** |
| Year-end analysis | `SmartAnalysis.jsx` → `generateSmartAnalysis` | Gemini, temp 0.2 | **anyone** ⚠️ `AN4` |
| Rollup · nudge · PDPA guard | `insights.cjs` · `scheduledPulseNudge` · `processFeedPost` | mixed | scheduled / members |
| The sandbox | `demoAura.js` | **none** — local, deterministic | anyone |
| **The roster generator** | `auraEngine.js` · `rosterEngineV2.js` | **none — not AI** | team members |

⚠️ **The last row is the one people get wrong**, including the README. It is a deterministic
constraint solver — grade bands, FTE, skills, unavailability, hours policy. Same inputs,
same roster, every time. Its post-mortem is [`ROSTER_POSTMORTEM.md`](ROSTER_POSTMORTEM.md)
and it is deliberately **not** merged into the AURA set: released CHANGELOG entries cite its
ids by number and renumbering would break them. `AURA-POSTMORTEM.md` §7 is the bridge.

---

## 2. What is dangerous right now

Four findings need no special access and no unusual behaviour.

| Id | What | Who can reach it |
|---|---|---|
| **`AN1`** | Six clinicians' names, roles and **job grades** in `dist/assets/index-*.js` | Anyone who loads any page, including `/individuals` |
| **`AN4`** | `generateSmartAnalysis` has no `request.auth` check — a free Gemini endpoint on the billed key | Anyone on the internet |
| **`AC1`** | A typed session length containing "20" is recorded as 15 minutes | Any member of the public who types instead of tapping |
| **`AC2`** | *"daily"* scores 0 days; *"about an hour"* scores 0 minutes | Same |

Verify `AN1` yourself in ten seconds:

```bash
npm run build && grep -o 'grade:"JG1[0-9]"' dist/assets/*.js | sort | uniq -c
```

If that prints anything, it is live.

---

## 3. Where the audit is honest about its own limits

Three questions **cannot be answered from source**, and each changes how urgent something is:

1. **How often does anybody type instead of tapping in the chat?** It decides whether `AC1`
   and `AC2` are theoretical or routine. `community_assessments` holds it.
2. **Has `generateSmartAnalysis` ever been called by anything but the app?** `AN4` is the
   one finding somebody outside SingHealth could already have used. Cloud Logging.
3. **Has MODE 3 ever written a zero?** `AU2` could be a daily occurrence or have never
   fired.

Not covered at all: `SmartReportView.jsx`, most of `ConventionalForm.jsx`, the dashboard's
derived metrics, and accessibility beyond live regions. **Absence from the post-mortem is
not clearance.**

---

## 4. The ten decisions waiting on the owner

Not blocked on engineering time. Several are not code.

| Id | The question | Clock |
|---|---|---|
| **`AU1`** | Is NEXUS an *AI roster generator*, or a *deterministic engine with an AI assistant beside it*? | ⚠️ **The cluster ICT survey.** See §5. |
| `AU5` | Should `teams/{id}/workload` have a reader, or should MODE 3 stop writing to it? | — |
| `AU8` | Should the wellbeing assessment be content-gated rather than turn-count-gated — and should a field on a staff record be called `diagnosis_ready`? | — |
| `AU11` | Should the model's own summary persist as memory and re-enter the next prompt? | — |
| `AU17` | What is the actual PDPA control on attachments? Today it is a README sentence. | ICT-adjacent |
| `AC11` | Should the acknowledgement rewrite text the person may be reading? | — |
| `AN7` | May a model split confidential and public staff wellbeing content unreviewed? | — |
| `AN9` | Is cluster-wide `isSignedIn()` read of the rollup acceptable with suppression as the only control? | grows with onboarding |
| `AN11` | Should the 09:00 nudge be per-team? | grows with onboarding |
| `AN12` | Is a model classification an acceptable PDPA *guard*? | ICT-adjacent |

---

## 5. Why `AU1` has a deadline

A **Workforce Scheduling (Rostering) ICT** has been established under the Operations domain,
led by NHG GCN, and has invited the Allied Health Group Chiefs from all three clusters to
contribute. Melissa Chua's 21 Aug survey asks what rostering solution is in use and lists
*"Claude"* among the examples. Vincent Chua's 30 Jul note names the pain points NEXUS was
built around.

**If NEXUS is described as an AI roster generator**, the questions that follow are about
model governance, explainability and clinical-AI assurance — a review the engine does not
need and cannot pass on the strength of a badge.

**Described accurately**, the roster is assessed as software and the assistant as AI:

> NEXUS contains a **deterministic rostering engine** (no AI — same inputs, same roster,
> fully auditable) and a **Gemini-backed staff assistant** (AURA) which does not touch the
> roster.

Determinism is the engine's strongest asset in front of a governance body. The README
currently throws it away in a badge. `AU1` is mostly a paragraph, and it is the highest
external-value item in the set.

Draft survey answers, already written and not sent, are in the session scratchpad as
`ict-survey-response.md`. The `AU17` and `AN12` decisions belong in that reply too.

---

## 6. How to work this ledger

**The rule, inherited and not softened:** an item is `DONE` only when the Evidence column
holds **real, pasted output** — a test name and count, a grep that returns zero, a sha whose
diff can be read. *"The code was edited"* is not evidence, and a row marked `DONE` on the
strength of an edit is the failure this rule exists to prevent. **It has happened here
before.**

Two corollaries this set has already had to apply:

- **Scope the evidence to what it proves.** `COMMUNITY_TODO.md` §4.6 recorded *"`grep
  Math.random src/components/` returns nothing"* for a fix that was really about session
  ids. The fix held; the grep now returns two hits and the claim reads as false (`AU13`).
- **For anything that ships in the bundle, the acceptance test is the bundle.** `AN1` leaks
  through `dist/`, not through source. A fix verified by reading source is not verified.

**Ids are never reused or renumbered**, including across the merge of the three original
post-mortems into `AURA-POSTMORTEM.md`. See [`IDS.md`](IDS.md).

---

## 7. The order I would take it in

Not by severity — by the gap between cost and consequence.

```
W1  AN1 + AN2 + AN3        half a day   delete STAFF_PROFILES; verify against dist/
W2  AN4                    an hour      auth + membership, copied from processFeedPost:571
W3  AU2                    20 minutes   Number.isFinite on target_value
W4  AC1 + AC2 + AC3 + AC5  a day        one shared PAVS parser in clinicalFlags.js
    AU24                   with W3      tests for executeDataEntry and clampEnergy
    AU14 + AU15            half a day   ceilings on the expensive endpoint
    AN10                   an hour      chunk the nudge before it passes 500 users
    AU1                    a paragraph  owner's, and the ICT survey is the clock
```

`W1` closes a live disclosure **and** makes the year-end analysis work for every department
other than the first. `W4` closes four findings with one module, and it is the number the
whole community instrument reports.

---

## 8. What held, and is worth not breaking

The audit found real quality, and it is concentrated in the parts with no model in them.

- **`rosterCoverage.js`** — pure, deterministic, no `Date.now()`, no `Math.random()`,
  nothing dropped. A malformed request is kept and explained rather than filtered away,
  because a request that vanished would be a shift nobody covers. The best-engineered module
  in the layer, and it contains no AI.
- **`processFeedPost`** — the only AI callable that does *authorization*, not just
  authentication: it re-reads `teams/{teamId}/members/{uid}` from the database and refuses a
  non-member. It is the template `AN4` should be fixed against.
- **`communityAck`** — separate prompt, no caller-supplied prompt, closed-set validation,
  rate limited, App Check ready. The model for what `chatWithAura` should look like.
- **`allow create: if false` on feed posts** — the PDPA guard is genuinely enforced for the
  surface it covers; rule and function agree.
- **The sandbox writes nothing**, in three places that used to write. Demo mode once
  appended to real wellbeing data and archived a fabricated report over a real year-end
  report, reporting success.
- **Chat history is in-memory only** — correct for a shared clinic terminal.

`AURA-POSTMORTEM.md` §5 is the full list, and it is there because a post-mortem that lists
only failures is a misleading document.
