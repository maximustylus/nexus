# Post-mortem: the NEXUS community portal

**Subject:** the "Individuals" side — the five `/individuals/*` routes, the public
health screening they implement, and the Cloud Function behind them.
**Date:** 2026-08-21 · **Version examined:** v2.0.0 branch (not deployed)
**Method:** every claim below was checked against the code and carries `file:line`.
Where I fixed something, the commit is named. Where I did not, it says so.

---

## 0. The short version

This is a working four-language public health screening tool, built by a clinician,
that routes members of the public to real Singapore community programmes. That is a
genuinely hard thing to build and most of it is sound.

It also has **one broken clinical computation that affected every respondent who ever
completed it**, and **it told the public it was de-identified while fingerprinting
them**. Both are now fixed. Two further issues — an unauthenticated endpoint that
takes attacker-controlled text into its system prompt, and a red-flag tier that
recommends an exercise programme — are not, and one of them is a clinical judgement
that is yours rather than mine.

---

## 1. The architecture, as it actually is

### The five routes

```
/individuals/language   LanguageGate.jsx        125 lines   pick en / ms / zh / ta
/individuals/pathway    PathwaySelection.jsx    193 lines   pick form or chat
/individuals/form       ConventionalForm.jsx  1,063 lines   the non-AI pathway
/individuals/chat       AuraChat.jsx            992 lines   the AI pathway
/individuals/result     ResultPage.jsx          900 lines   the output
```

All five are declared in `App.jsx:760-764`, **outside** the authenticated shell — they
render for anyone, signed in or not, and are unaffected by the multi-team work.

### The two pathways converge

Both end at the same three functions, which is the single best structural decision in
the portal:

| | Form | Chat |
|---|---|---|
| gathers | `deriveFlags()` `ConventionalForm.jsx:172` | `parseClinicalData()` `AuraChat.jsx:487` |
| scores | `calculateRiskScore()` `src/utils/scoring.js` | same |
| routes | `selectCTA()` `ConventionalForm.jsx:161` | same logic, own copy |
| records | `recordTelemetry()` `src/utils/telemetry.js` | same |
| renders | `ResultPage.jsx` | `ResultPage.jsx` |

`ConventionalForm.jsx:41` records the intent explicitly — *"Option values and midpoint
maps match AuraChatbot exactly"* — and `:160` says *"Identical to AuraChatbot
selectCTA()"*. Somebody deliberately kept the two in step so a person gets the same
answer whichever door they walk through. That is the right instinct.

**But `selectCTA` is duplicated rather than shared** — two copies of the same ordered
rule list, kept in agreement by comment. `calculateRiskScore` *is* shared, and that is
why fixing it fixed both pathways at once. The asymmetry is not deliberate.

### The server

One Cloud Function, `publicTriageChat` (`functions/index.js:663`):

- `onCall({ cors: true })` — **unauthenticated**. No `request.auth` check anywhere in
  it, no App Check, no rate limit.
- Maps a 2-digit postal prefix to one of six regions via a hand-written table
  (`:676-708`).
- Queries `resources` for that region plus `national`, formats them into the prompt as
  a *"VERIFIED RESOURCE INVENTORY"* (`:737`).
- Carries a ~200-line screening protocol as its system instruction (`:757+`).

### The data

```
resources/{resourceId}         22 documents, seeded by scripts/firestore_seed.cjs
                               read ONLY by publicTriageChat (Admin SDK)
community_assessments/{id}     one document per completed screening
                               written by telemetry.js — and read by NOTHING
```

### Where state lives

Nowhere durable. Each screen holds its own React state and hands the next one a
`navigate(..., { state })` payload (`ConventionalForm.jsx:684`). A refresh on
`/individuals/result` loses everything; a direct link to any route past the first
starts from empty state.

---

## 2. Purpose and objectives, and whether the code serves them

Inferred from the code and its own copy, not from any brief:

| Objective | Evidence it is intended | Does the code deliver it? |
|---|---|---|
| Screen the public for physical inactivity using ACSM PAVS | `ConventionalForm.jsx:211` names *"ACSM PAVS · SPAG Strength · Clinical Safety"* | **Partly.** PAVS itself is computed correctly. The *risk score* built on it was not — §3.1. |
| Catch red flags before recommending exercise | `SYMPTOM_FLAG_VALUE` `:154`, `selectCTA` returns `URGENT` first `:162` | **Partly.** It catches them and routes them first, then recommends an exercise programme anyway — §3.4. |
| Route to real, local, affordable programmes | 22 seeded resources with prices and booking URLs | **Yes,** and this is the strongest part of the build. |
| Serve Singapore's four official languages | full `en/ms/zh/ta` strings throughout | **Yes.** Unusually thorough — every string, both pathways. |
| Capture population data for programme planning | `recordTelemetry` payloads at `ConventionalForm.jsx:676`, `AuraChat.jsx:817` | **It captures.** Nothing reads it back — §3.5. |
| Collect nothing identifying | claimed to the public, `ResultPage.jsx:758` | **No.** §3.2. |

---

## 3. Findings

### 3.1 — The risk score never measured activity · **FIXED** (`35f46ad`)

`src/utils/scoring.js` compared `data.pavsMinutes` against `150`.

`pavsMinutes` is **minutes per session**, capped at 65 by `MINS_MIDPOINT`
(`ConventionalForm.jsx:150`). `150` is a **weekly** threshold. `65 < 150` is always
true, so the "physical activity deficit" point was added to **every respondent who
ever completed the assessment**, through either pathway.

The score therefore could not distinguish somebody doing nothing from somebody doing
6 × 65 = 390 minutes a week — on the one dimension the entire portal exists to
measure — while presenting itself as an ACSM-derived band (`0-1 Low / 2-4 Moderate /
5+ High`).

The correct field, `pavsScore`, was in the same object, three lines above
(`ConventionalForm.jsx:176`).

### 3.2 — Missing data scored as perfect health · **FIXED** (`35f46ad`)

`Number(undefined)` is `NaN`; `NaN < 150` is `false`. So an absent field added
nothing and `calculateRiskScore({})` returned **0** — a clean *"Low Risk (Green)"* for
somebody about whom nothing was known.

This is reachable: the chat pathway builds its input by parsing text a language model
produced (`AuraChat.jsx:487-509`), so a field can genuinely be unparseable.

Unknown now counts as a deficit. A screening tool that is wrong should be wrong
towards caution.

> I did not find this by reading. It surfaced as a routine degraded-input test case
> and failed. Reading the same eight lines twice had not shown it.

### 3.3 — The portal told the public it was de-identified while fingerprinting them · **FIXED** (`301bb5a`)

`ResultPage.jsx:758` shows a panel headed *"Data Governance and Privacy"*:

> *"All data collected through the NEXUS AURA system is de-identified at the point of
> capture … not linked to any identifiable personal information."*

`telemetry.js` attached `clientReference: navigator.userAgent` to every record — a
browser-fingerprinting vector — alongside postal sector, age band, gender, **race**,
housing type, income adequacy, food insecurity, a psychological-distress flag and a
chest-pain flag (`ConventionalForm.jsx:676-682`).

**And the panel renders on the result page**, reached *after* `recordTelemetry` has
already awaited and returned (`:676` then `:684`). So it was never consent. It was a
claim made after the data was written, and an inaccurate one.

The user-agent field is removed. **This does not make the data anonymous** — sector +
age band + gender + race + housing type remains a quasi-identifier set in a population
this size. Making the notice *true* is §5.

### 3.4 — The red-flag tier recommends an exercise programme · **NOT FIXED — your call**

Somebody selecting *"Dizziness or chest pain when active"* (`ConventionalForm.jsx:154`)
gets `URGENT` (`:162`), which renders:

- **Action** (`ResultPage.jsx:211`): *"Consult your GP before starting any exercise.
  Mention your PAVS result at your visit."*
- **Primary resources** (`:238`): Healthier SG, and **Active Health Labs** —
  *"Supervised exercise and metabolic health programmes"* (`:195`)
- **Link**: `healthiersg.gov.sg`, an enrolment site

"Consult your GP before starting exercise" is a defensible PAR-Q outcome. What I am
flagging is narrower and factual: the same screen hands them a supervised exercise
programme as their second recommendation, before any clearance, and the tier named
`URGENT` in code presents with the same visual weight and booking-link pattern as
`LEVEL_UP`.

**This is a clinical judgement and it is yours, not mine.** I have not changed it. I am
telling you what the code does.

### 3.5 — Nothing reads the data the portal collects · **rule FIXED** (`301bb5a`)

Grepping `community_assessments` across `src/` and `functions/` returns exactly one
hit: the `addDoc` that writes it. There is no analysis screen, no export, no query.

Every completed screening is written and never read.

> **My error, corrected.** In the multi-team rules rewrite I set this collection to
> `allow read: if isSignedIn()` and justified it as *"the analysis screen predates
> teams"* and *"the data is postal-sector-level and carries no identifiers"*. Both
> halves were wrong — I asserted a consumer without looking for one, then widened a
> rule to serve it. Under the old rules that grant reached ten named people; under the
> new model it would have reached anyone at any allowlisted institution.
> It is now `allow read: if false`, verified by four new emulator cases (`45323f2`).

### 3.6 — Attacker-controlled text enters the system prompt · **NOT FIXED**

`functions/index.js:670`:

```js
var language = request.data.language || 'English';
```

No validation. `:760` interpolates it into the system instruction **twice**:

```js
'LANGUAGE RULE: You must converse strictly in ' + language + '. All questions, responses, and the final CTA must be in ' + language + '.',
```

The endpoint is unauthenticated, so anyone on the internet can set `language` to
arbitrary text that becomes part of AURA's system prompt. The fix is an allowlist of
four values — the portal only ever sends four.

`message` is checked for truthiness and type (`:677`) but **has no length cap**.
History *is* bounded at 20 turns (`MAX_HISTORY_LEN`, `:72`) — that one is handled.

### 3.7 — An unauthenticated, uncapped call against a paid API key · **NOT FIXED**

`publicTriageChat` has no `request.auth` check, no App Check, and no rate limiting.
It calls Gemini on every invocation with a ~200-line system prompt plus the whole
resource inventory. A script can call it in a loop.

This is a deliberate trade — the portal is *for* the public and requiring auth would
defeat it — but the mitigation (App Check) is absent rather than considered.

### 3.8 — "VERIFIED" is not verified · **NOT FIXED**

The prompt labels the inventory *"VERIFIED RESOURCE INVENTORY"* (`:737`, `:750`), and
the model then presents prices, opening hours and booking URLs to the public as fact.

`scripts/firestore_seed.cjs` writes `lastVerified: now` on every resource (`:65` and
throughout). **Nothing reads that field** — grepping `lastVerified` outside the seed
returns nothing. And the seed uses `batch.set()` (`:826`), so re-running it refreshes
every `lastVerified` to the run time regardless of whether anyone checked anything.

The timestamp records when the script last ran, not when a human confirmed a price.

**Coverage is also thin:** 22 resources — central 4, east 4, west 4, national 4,
north 3, north-east 3.

---

## 4. What is good, and should survive

Not a courtesy section — these are the parts the next version should keep.

- **The two pathways deliberately converge.** Shared scoring and a commented parity
  contract (`ConventionalForm.jsx:41`, `:160`). This is why one fix repaired both.
- **Four languages, completely.** Every string, both pathways, all four scripts —
  including Tamil, which is usually the one that gets dropped.
- **`deriveFlags` handles the degenerate case correctly.** `pavsDays === 0 → minutes
  = 0` (`:175`), so somebody who exercises zero days cannot report 60-minute sessions
  and score 0. That is a real edge case, caught and commented.
- **The CTA ordering is clinically sensible.** `symptomFlag` before `medFlag` before
  age before SDOH before activity (`:161-170`). The precedence is right even where
  §3.4 questions the destination.
- **The resource registry is real.** Actual Bishan addresses, actual MyActiveSG
  programme names, actual prices. Somebody did the legwork.
- **The form carries its own repair history.** `ConventionalForm.jsx:7-41` documents
  fixes with reasons. That is the same instinct as the roster side's post-mortems.
- **History is bounded** at 20 turns — the cost control that *does* exist.

---

## 5. The next version

In order, each justified by a finding above.

### First — close what is open

1. **Allowlist `language`** to the four values the portal sends. Four lines. §3.6.
2. **Cap `message`** at ~2,000 characters. §3.6.
3. **App Check** on `publicTriageChat`. §3.7.
4. **Decide the URGENT tier**, §3.4. My recommendation: give it its own resource set
   with no exercise programme in it, and its own visual treatment. But it is your call.

### Second — make the privacy notice true

The notice is currently a claim; make it a description. Either:

- **(a) Collect less.** Drop `race` and `housing` unless a named analysis needs them —
  nothing reads them today (§3.5), so they are cost without benefit. Or
- **(b) Consent properly.** A short screen *before* the first question saying what is
  kept and why, with a way to decline and still get the result.

(a) is cheaper and I would do it first. Either way the notice moves to the front.

### Third — decide whether the data is for anything

Every screening is written and never read (§3.5). Two honest options:

- **Use it** — build the analysis that justifies collecting it, and the notice can say
  what it is for.
- **Stop collecting it** — keep only what the result needs.

The current state is the worst of both: the cost and risk of holding health data about
the public, with none of the benefit.

### Fourth — the structural work

- **Share `selectCTA`** instead of maintaining two copies in agreement by comment.
  Put it beside `calculateRiskScore` in `src/utils/`, with the test suite that file
  now has.
- **Test the other pure logic.** `deriveFlags` and `parseClinicalData` have no tests.
  `calculateRiskScore` had none either, and it was broken for its entire life.
- **Give the resource registry a freshness contract.** Either `lastVerified` is
  checked and stale entries are suppressed, or the word "VERIFIED" comes out of the
  prompt. Presenting stale prices to the public as verified is the failure mode.
- **Persist in-progress state** to `sessionStorage`. Right now a refresh on a
  four-minute assessment loses everything.

### What not to rebuild

The four-language strings, the resource registry, the CTA ordering, and the two-pathway
convergence. They work, and they represent the domain knowledge that is hardest to
recover.

---

## 6. Status

| | |
|---|---|
| Fixed this session | §3.1, §3.2, §3.3, §3.5 |
| Open, code | §3.6, §3.7, §3.8 |
| Open, **your clinical decision** | §3.4 |
| Tests added | `src/utils/scoring.test.js` — 9 cases, was 0 |
| Rules verified | 95 emulator checks, 0 failed |
| Deployed | **Nothing.** All of this is on the branch. |
