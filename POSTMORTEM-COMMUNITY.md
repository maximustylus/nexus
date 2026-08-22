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

It also had **one broken clinical computation that affected every respondent who ever
completed it**, **a routing tier that silently sent isolated seniors the wrong advice**,
and **an on-screen promise of de-identification while it fingerprinted them**. Those
are now fixed, with tests.

Four remain open, and they are the ones worth your attention:

1. **The public chat calls the staff AI endpoint** — unauthenticated, with a system
   prompt that names KKH/SingHealth and prints the internal Firestore schema (§3.6).
   This corrects my own first pass, which reviewed a function nothing calls.
2. **Urgent advice — including "call 995" — is English-only**, on a four-language
   tool, on the one screen where comprehension is life-critical (§3.10).
3. **The cardiac screen cannot record chest pain alongside a condition** in the chat
   pathway, so the one absolute contraindication can be lost (§3.11).
4. **The red-flag tier recommends an exercise programme** (§3.4).

The last two are clinical judgements about the instrument. They are yours, not mine,
and I have left them alone deliberately.

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

### 3.6 — I reviewed the wrong function. The public chat calls the staff one · **NOT FIXED**

**Correction to my own first pass.** I wrote up `publicTriageChat`
(`functions/index.js:663`) as the portal's AI endpoint. It is not. Nothing calls it:

```
$ grep -rn "publicTriageChat" --include=*.js --include=*.jsx . | grep -v node_modules
./functions/index.js:663:exports.publicTriageChat = onCall({
```

One definition, no caller. The `language`-into-system-prompt issue I described is
real and the function is deployed and callable, but it is dead code, and reporting
it as *the* public AI surface pointed away from the actual one.

**The public chat calls `chatWithAura`** — `AuraChat.jsx:11`:

```js
const secureChatWithAura = httpsCallable(functions, 'chatWithAura');
```

That is the **same callable the internal staff assistant uses** (`AuraPulseBot.jsx:57`,
`src/utils/auraChat.js:8`). There is one AI endpoint, and the public and the staff
share it.

`chatWithAura` (`functions/index.js:288`) has **no `request.auth` check and no App
Check** — compare `processFeedPost` at `:539`, which does check. Its
`systemInstruction` (`:349`) is `AURA_SYSTEM_PROMPT` (`:199-286`), a staff-facing
prompt that:

- states it is *"a Quad-Mode AI deployed at KKH/SingHealth"*;
- carries a **`MODE 3: DATA ENTRY AGENT`** section describing itself as *"a safe
  database gateway"* that must *"map requests EXACTLY to the known Firestore schema
  below"* — and then **prints that schema**;
- opens with a `CRITICAL OVERRIDE` instructing it to *"Execute the database
  transaction immediately"*.

Two caller-supplied fields go straight into the model context (`:310-313`):

```js
var role   = request.data.role || 'Staff';
var prompt = request.data.prompt || '';
…
'USER ROLE: ' + role,
if (prompt) contextParts.push('CONTEXT/OVERRIDE: ' + prompt);
```

`validateChatInput` bounds their **length and type only** — `MAX_ROLE_LEN`,
`MAX_PROMPT_LEN = 8000` — never their content. An unauthenticated caller sets
`role` to anything and supplies 8,000 characters of `CONTEXT/OVERRIDE`.

**What this is and is not.** It is **not** a write path: the function returns
`{ text: result.text }` (`:385`) and performs no Firestore write. MODE 3 is a fiction
the prompt tells the model; the client does any writing. So the exposure is
**disclosure of the internal schema and staff tooling to anyone on the internet**,
and an unbounded prompt-injection surface on a shared endpoint — not direct data
modification.

It also leaks the other way. The public portal layers its `WELL_WELL_PROMPT`
(`AuraChat.jsx:17`) on top as `CONTEXT/OVERRIDE`, so a member of the public doing a
health screen is talking to a model whose system instruction is the staff agent, at
`temperature: 0.7`, with a turn instruction (`:318`) telling it to *"ask one open
question to gauge their RPE (0-10)"* — an internal staff wellbeing metric.

**The fix is two endpoints, not one flag.** The public pathway needs its own callable
whose system prompt contains nothing about KKH internals, no Firestore schema and no
DATA_ENTRY mode; `chatWithAura` then gets the `request.auth` check it should always
have had. `publicTriageChat` is most of that function already written — it should
either become the real one or be deleted, and right now it is neither.

### 3.7 — An unauthenticated, uncapped call against a paid API key · **NOT FIXED**

Applies to `chatWithAura`, per §3.6: no auth, no App Check, no rate limiting,
`maxOutputTokens: 8192`, a 90-second fetch inside a 120-second function
(`functions/index.js:296, 347, 361`). A script can call it in a loop, and each call
bills the `GEMINI_API_KEY`.

The public pathway makes this partly unavoidable — the portal is *for* the public and
requiring sign-in would defeat it — but App Check is the mitigation for exactly this
case, and it is absent rather than declined. And the trade only justifies exposing a
*public* endpoint; it does not justify exposing the staff one, which is what is
happening today.

There is a second cost the code does not account for. `AuraChat` gives the model a
1,500 ms window (`AI_UPGRADE_WINDOW_MS`, `:726`) and discards the answer after it —
but nothing is aborted, so the request runs to completion server-side and bills in
full. Every late answer is paid for and thrown away.

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

### 3.9 — The isolation tier routed to nothing · **FIXED** (`189a61b`)

`AuraChat.selectCTA` (`:201`) ranks `SOCIAL_CARE` **second**, behind only chest pain:

```js
if (symptomFlag)                  return CTA.symptoms_present;   // URGENT
if (age === '60+' && sdohSocial)  return CTA.senior_isolated;    // SOCIAL_CARE
if (medFlag)                      return CTA.chronic_metabolic;  // CLINICAL
```

`ResultPage` had no such key. Both read sites fall back to the same place:

```js
const config    = CTA_BANNER[ctaTier] || CTA_BANNER.START;   // :358
const ctaBanner = CTA_BANNER[ctaTier] || CTA_BANNER.START;   // :515
```

So a socially isolated resident aged 60+ — the second-highest priority the tool
recognises — reached the result page and was told **"Download the Healthy 365 app and
search Start2Move"**. The SingHealth CareLine referral the content author wrote for
exactly this person (`AuraChat.jsx`, `senior_isolated`: *"24/7 tele-befriending…
completely free for eligible seniors"*, with a phone number) was never shown.
`tierPrimaries` missed on the same key and fell through to the risk-tier default.

Nothing errored. Nothing logged. The only symptom was the wrong advice, given to the
demographic least able to act on an app-store instruction.

**Also: the two `selectCTA` are not identical, and the comment says they are.**
`ConventionalForm.jsx:159` reads *"Identical to AuraChatbot selectCTA()"*. They differ
by exactly one rule — the chat has the isolation branch, the form has no equivalent —
and that one divergent rule is the one that was broken. The same isolated senior got
`COMMUNITY` (correct: Active Ageing Centres) through the form and a silent fallback
through the chat. The chat is the pathway built for elderly and non-English-first
users, so the pathway designed for that person is the one that failed them.

Fixed by adding the banner and resource list, composed only from copy already reviewed
in the same file. `src/utils/ctaTierParity.test.js` is the guard: it reads the tier
names out of all three components and asserts every tier either pathway can emit is
renderable by both tables. It fails on this bug before the fix.

### 3.10 — Urgent advice is English-only, whichever language was chosen · **NOT FIXED**

The in-chat CTA card renders three fields raw (`AuraChat.jsx:604-650`):

```jsx
<p …>{ctaData.primaryStep}</p>
<p …>{ctaData.healthierSG}</p>
{ctaData.resources.map((r, i) => <li key={i} …>{r}</li>)}
```

The `CTA` library those come from (`:67-197`) is a flat English object with no `ms`,
`zh` or `ta` variants. Only the surrounding **labels** are translated — `ctaTitle`,
`ctaPrimary`, `ctaHealthierSG`, `ctaResources`.

So a Tamil or Malay speaker who has just reported chest pain on exertion sees a Tamil
heading over English body text reading *"Chest pain or dizziness during activity
requires medical clearance first"* and *"If symptoms are severe or sudden: call 995"*.
The one screen where comprehension is life-critical ignores the language they picked
two screens earlier.

`ResultPage`'s `CTA_BANNER` **is** fully translated for the same tiers, so the same
advice is translated on one screen and not the other. I have not fixed this: the
correct copy is a translation of urgent clinical advice, and that needs your review,
not my paraphrase. The `CTA_BANNER` entries are the obvious source to adapt.

### 3.11 — The cardiac screen cannot record chest pain alongside a condition · **NOT FIXED — clinical**

`AuraChat.jsx:241` asks two questions in one:

> *"Do you have any ongoing health conditions — such as high blood pressure,
> prediabetes, or heart disease? **And** do you ever feel chest pain or dizziness when
> you are physically active?"*

The chips offered (`:290`) are a single flat list, and a tap submits immediately and
advances (`:952`, `onClick={() => handleUserSubmission(reply)}`):

```
['No conditions or symptoms', 'High blood pressure', 'Prediabetes or diabetes',
 'Heart condition', 'Dizziness or chest pain when active']
```

One tap, one answer, next question. A person with high blood pressure **and**
exertional chest pain can record only one of them. If they tap the condition — the
one they have a diagnosis for, and the one listed first — `symptomFlag` is false,
because it is a regex over what they actually said (`:516`). They lose the +5 points
and the URGENT tier, and are routed to `CLINICAL`: *enrol in a paid exercise
programme*.

**The form pathway does not have this problem.** `medical` there is a multi-select
array with an exclusive "No conditions" option (`ConventionalForm.jsx:594-605`), and
the two flags are derived independently (`:180-181`). Same person, same answers,
different pathway, different clinical conclusion.

This is the same shape as §3.1: the instrument cannot express the finding that matters
most. Splitting it into two questions is the fix, but that changes the assessment
instrument, so it is your call rather than mine.

### 3.12 — Smaller things, verified · **theme FIXED** (`189a61b`)

- **The theme setting was split in half.** `ConventionalForm.jsx:6` records
  *"FIX 1 — Theme key: nexus_theme → nexus-theme (hyphen)"*. That swap was applied to
  three files and not to the other four, including `App.jsx`, which owns the class on
  `<html>`. Pick dark on `/individuals/language`, tap through, and the form comes up
  light. Now centralised in `src/utils/theme.js`, which still reads the old key so
  nobody loses a setting they already made.
- **No catch-all route.** `App.jsx:759-780` declares no `path="*"`. `firebase.json`
  rewrites everything to `index.html`, so a mistyped `/individuals/from` loads the
  SPA and renders a blank page — no 404, no redirect, no message.
- **Four session IDs per person.** `LanguageGate.jsx:20`, `PathwaySelection.jsx:49`,
  `AuraChat.jsx:686` and `ResultPage.jsx:479` each mint their own
  `Math.random().toString(36)` id, and all four are shown to the user as *"ID:"*. The
  one written to Firestore is the third. If a member of the public quotes the ID on
  their screen, it may not be the one in the record.
- **A finished assessment does not survive a reload.** `ResultPage.jsx:470-474`
  redirects to `/individuals/pathway` when `location.state?.score` is absent, and
  nothing is persisted. Thirteen questions, then a rotation-triggered reload or iOS
  reclaiming the tab, and it is gone with no warning and no resume.

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

### First — separate the public endpoint from the staff one

This is the top of the list because everything else in §3.6 follows from one callable
serving two audiences.

1. **Give the public pathway its own callable**, with a system prompt containing no
   KKH/SingHealth framing, no Firestore schema and no DATA_ENTRY mode.
   `publicTriageChat` is most of it already written — finish it and point `AuraChat`
   at it, or delete it. Today it is neither.
2. **Add the `request.auth` check to `chatWithAura`**, which every other privileged
   callable already has (`processFeedPost`, `functions/index.js:539`). Once the public
   is off it, nothing legitimate calls it unauthenticated.
3. **App Check on the new public callable**, plus a per-IP rate limit. §3.7.
4. **Validate content, not just length.** Allowlist `language` to the four values the
   portal sends; cap free text; stop passing caller-supplied `role` and `prompt`
   straight into the model context.
5. **Abort the request when the 1,500 ms window closes** (`AI_UPGRADE_WINDOW_MS`).
   Today every late answer is billed and discarded.

### Then — the two clinical decisions

6. **Translate the urgent CTA copy**, §3.10. `CTA_BANNER` in `ResultPage` already has
   reviewed `ms`/`zh`/`ta` for the same tiers and is the place to adapt from. Do not
   let this one be machine-translated.
7. **Split the cardiac question**, §3.11, so a condition and exertional symptoms can
   both be recorded in the chat as they already can in the form.
8. **Decide the URGENT tier**, §3.4. My recommendation: give it its own resource set
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

- **Share `selectCTA` and the tier table** instead of maintaining copies in agreement
  by comment — a comment that was already false (§3.9). Put them beside
  `calculateRiskScore` in `src/utils/`, with the test suite that file now has.
  `ctaTierParity.test.js` detects the drift; a shared module would make it
  unrepresentable, and that test can then be deleted rather than maintained.
- **Test the other pure logic.** `deriveFlags` and `parseClinicalData` have no tests.
  `calculateRiskScore` had none either, and it was broken for its entire life.
- **Give the resource registry a freshness contract.** Either `lastVerified` is
  checked and stale entries are suppressed, or the word "VERIFIED" comes out of the
  prompt. Presenting stale prices to the public as verified is the failure mode.
- **Persist in-progress state** to `sessionStorage`, §3.12. Right now a refresh on a
  four-minute assessment loses everything, including a completed result.
- **Add a `path="*"` route**, §3.12, so a mistyped URL says something instead of
  rendering a blank page.
- **Mint the session id once** and carry it, §3.12, so the ID a person reads off their
  screen is the one in the record.

### What not to rebuild

The four-language strings, the resource registry, the CTA ordering, and the two-pathway
convergence. They work, and they represent the domain knowledge that is hardest to
recover.

---

## 6. Status

| | |
|---|---|
| Fixed this session | §3.1, §3.2 (`35f46ad`) · §3.3, §3.5 (`301bb5a`) · §3.9, theme in §3.12 (`189a61b`) |
| Open, code | §3.6, §3.7, §3.8, §3.10, rest of §3.12 |
| Open, **your clinical decision** | §3.4, §3.11 |
| Tests added | `src/utils/scoring.test.js` — 9 cases, was 0 · `src/utils/ctaTierParity.test.js` — 5 cases, new |
| Full suite | 1851 passing across 39 files · lint clean · build green |
| Rules verified | 95 emulator checks, 0 failed |
| Deployed | **Nothing.** All of this is on the branch. |

### One correction to record

§3.6 replaces what I first wrote. I reviewed `publicTriageChat` as the portal's AI
endpoint; nothing calls it. The public chat calls `chatWithAura`, the staff endpoint.
The original finding was accurate about the code it described and pointed at the wrong
file — the corrected section covers both.
