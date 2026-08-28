# AURA — handoff

**Last updated:** 2026-08-23. **Read this first.** [`AURA-TODO.md`](AURA-TODO.md) is the
plan, [`AURA-POSTMORTEM.md`](AURA-POSTMORTEM.md) is the evidence,
[`AURA-CHANGELOG.md`](AURA-CHANGELOG.md) is the version history.

---

## 0. Today, in one paragraph

AURA was audited end to end on 23 August 2026 across three surfaces — the staff assistant,
the public health screening, and the intelligence layer. **56 findings**, of which **14 are
closed with evidence** as of the same evening. The most serious was not an AI defect at all: **six named
colleagues' job grades were in the public JavaScript bundle** (`AN1`), served on every route
including the community screening a member of the public opens — and `STAFF_PROFILES` turned
out to be one of **two** copies, the other being `TEAM_DIRECTORY.title`, which only a check
against `dist/` rather than against source could have found. That is closed. So are the
unauthenticated Gemini endpoint (`AN4`), both PAVS parser defects (`AC1`, `AC2`), and the
description of NEXUS as *"a proprietary, autonomous AI agent"* (`AU1`) — which mattered this
month because a cluster-level rostering ICT is asking what NEXUS is.

**Updated 2026-08-24, end of the closing sweep:** `AC16` and the guardrail work's `P8`
items joined the ledger since the paragraph above was written, and **46 findings are now
closed with evidence — the engineering queue is empty** (`AURA-TODO.md`'s status table is
the authoritative count; `AU29` and the IMDA info card joined and closed 2026-08-28). What remains is the owner's column: nine
decisions, the model-routing and real-turns items (`AURA-TODO.md` P8.7/P8.8), the
20-turn read (`AURA-VERIFICATION-TURNS.md`) that gates the merge, the three
native-speaker reviews (`docs/CD13-translation-review.xlsx` is the instrument), and
the production `teamIds` check that unlocks deleting the legacy email bridge. Branch
`aura` carries it all; **nothing is deployed** — deploy order is rules → functions →
hosting.

⚠️ **Five of the 56 findings were opened by reviewing the FIXES, not by the original audit,
and one of those fixes was a regression worse than the bug it closed** — a keyword added to
the sandbox router would have answered *"I saw 3 arrests back to back and I am wrung out"*
with *"Logged 3 against your workload record"*. Read §6 before assuming a small fix is
small.

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

*Updated 2026-08-23, after the first two fix batches. The four findings this section
originally listed — `AN1` grades, `AN4`, `AC1`, `AC2` — are **closed**; see
[`AURA-TODO.md`](AURA-TODO.md) for the evidence.*

*Updated again 2026-08-24: **both remaining rows are closed.** `AN14` — the names and
emails are out of the bundle, verified by `an14.bundle.test.js` against `dist/` on every
run (the legacy auth bridge survives on hashed digests; deleting it outright waits on the
production `teamIds` check). `AU27` — both `smart_database` writes are demo-fenced; the
sandbox downloads the `.docx` and says plainly that nothing was saved.*

**Nothing in this section is open.** The nearest thing to a live risk is now a
BEHAVIOURAL unknown, not a defect: the guardrail preamble has never been run against a
real model (`AURA-GUARDRAILS.md`, assumptions item 7). That is what the 20-turn read
exists to answer, and it gates the merge.

### Verify the grade fix yourself

⚠️ **The obvious grep gives a FALSE POSITIVE and this document used to recommend it.** It
was `grep -o 'grade:"JG1[0-9]"' dist/assets/*.js`, which still prints five lines — from
`src/data/mockData.js`, the Marvel sandbox fixture. Steve, Peter, Charles, Jean and Tony are
fictional. A vocabulary grep cannot tell a fixture from a colleague.

The question is **co-occurrence**: is any real colleague's name near a grade token?

```bash
npm run build && python3 - <<'EOF'
import glob, re
names = ['Alif','Fadzlynn','Derlinder','Ying Xian','Brandon','Nisa','Benny']
grade = re.compile(r'\b(JG1[0-9]|AH[0-9]{1,2}|CEP I{1,3})\b')
hits = 0
for f in glob.glob('dist/assets/index-*.js'):
    src = open(f, encoding='utf-8').read()
    for n in names:
        for m in re.finditer(re.escape(n), src):
            w = src[max(0, m.start()-400):m.start()+400]
            g = grade.search(w)
            if g:
                hits += 1
                print(f'{n} near {g.group(0)}')
print('CLEAN — no real colleague co-located with a grade' if not hits else f'{hits} HITS')
EOF
```

Anything other than `CLEAN` means a grade is live again.

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

⚠️ **A fourth, added 2026-08-24 with the guardrails.** Ten of the owner's sixteen rules are
carried by a **prompt**, and a prompt is a request to a language model. `functions/guardrails.test.js`
asserts that each instruction **reached** the model; nothing in this repository can assert
that the model **followed** it. Closing that needs a person running real turns and reading
them. §B of [`AURA-GUARDRAILS.md`](AURA-GUARDRAILS.md) marks every row `CODE`, `PROMPT`,
`HUMAN` or `NOT ENFORCED`, and **P6 is a declared gap** — AURA is not a data-classification
control and must not be described as one.

---

## 4. The twelve decisions waiting on the owner

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
| P8.7 | Should the **model tier** be routed by the stakes of the task (Rule 16)? Today `resolveModel()` picks one model for every call, from a research review to a category label. | — |
| P8.8 | Who runs the real turns that would tell us whether AURA **follows** the ten prompt-carried guardrails, and when? | ⚠️ before any claim of compliance |

⚠️ **Ten of these carry a finding id and two do not.** `AURA-TODO.md`'s *"The owner's ten"*
and `AURA-GOLIVE-GATE.md` both mean the ten with ids, and are still correct as written. The
last two rows came in with the guardrails on 2026-08-24 and are cited as `AURA-TODO.md` P8.7
and P8.8, because no post-mortem finding covers either.

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

> **2026-08-24:** this order was executed to completion — every engineering row in it
> is closed with evidence. What survives of "the order" is the owner's sequence:
> demo → hand `docs/CD13-translation-review.xlsx` to three readers → run
> `AURA-VERIFICATION-TURNS.md` → merge `aura` → `main` (rules → functions → hosting)
> → the nine decisions in §4. The original text below is kept as the record of the plan.

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
