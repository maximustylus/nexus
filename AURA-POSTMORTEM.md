# AURA — post-mortem

**Subject:** AURA, whole. The staff assistant, the public screening, the intelligence
layer — and the deterministic roster engine that shares the name.

**Date:** 2026-08-23 · **Against:** `claude/nexus-aura-rostering-session-duo1q5` @ `f65f556`
· **App** v2.1.0 · **functions** header `v1.53` · **AURA engine** v2.3

**The plan is [`AURA-TODO.md`](AURA-TODO.md). Read [`AURA-HANDOFF.md`](AURA-HANDOFF.md)
first if you are new. Version history is [`AURA-CHANGELOG.md`](AURA-CHANGELOG.md).**

---

## How this document came to be

Three separate post-mortems were written on 2026-08-23 — `POSTMORTEM-AURA.md` (`AU`),
`POSTMORTEM-AURA-CHAT.md` (`AC`) and `POSTMORTEM-AURA-INTELLIGENCE.md` (`AN`) — and are
merged here. **Every id is preserved verbatim.** `AU2` means what it meant when it was
written and will not be renumbered, because `IDS.md` rule 1 exists and the `D`-means-three-
things problem in this repository is what it exists to prevent.

⚠️ **The roster engine's post-mortem is NOT absorbed into this one, deliberately.**
[`ROSTER_POSTMORTEM.md`](ROSTER_POSTMORTEM.md) carries `A`–`E`, `A-RC` and `M` ids that
**released CHANGELOG entries cite by number** — *"post-mortem D3"*, *"audit M6"*,
*"A-RC1"*. Folding that corpus in here would mean renumbering it, which breaks those
citations and violates the same rule. §7 below is the bridge instead: what the engine is,
where its findings live, and the one finding that joins the two. Say the word if you want
them genuinely merged and I will do it as a deliberate renumber with a mapping table.

---

## What AURA actually is

Not one system. Six things, and only four of them involve a model:

| Surface | What it does | Model | Findings |
|---|---|---|---|
| `chatWithAura` + `AuraPulseBot.jsx` | staff assistant — 4 modes, database writes, wellbeing assessment | Gemini, resolved at runtime | `AU2`–`AU24` |
| `AuraChat.jsx` + `communityAck` | the public health screening at `/individuals` | Gemini, 200 tokens | `AC1`–`AC14` |
| `generateSmartAnalysis` + `SmartAnalysis.jsx` | year-end department wellbeing report | Gemini, temp 0.2 | `AN1`–`AN8` |
| `buildCommunityInsights` · `scheduledPulseNudge` · `processFeedPost` | rollup, nudge, PDPA guard | Gemini / none | `AN9`–`AN13` |
| `demoAura.js` | the sandbox | **none** — deterministic, local | — |
| `auraEngine.js` + `rosterEngineV2.js` | **the roster generator** | **none — not AI at all** | [`ROSTER_POSTMORTEM.md`](ROSTER_POSTMORTEM.md) |

**57 findings.** 28 `AU` · 15 `AC` · 14 `AN`. (51 at first writing. `AU25` and `AC15` were
opened the same day by the go-live gate and by fixing `AC1`; `AU26`, `AU27` and `AN14` by
reviews of the fixes themselves — see §6. The plan is [`AURA-TODO.md`](AURA-TODO.md).)

---

## ⚠️ Read this first

**Nothing here is fixed.** This is a finding list. [`AURA-TODO.md`](AURA-TODO.md) is
where fixes get tracked, under the same ledger rule the community portal uses: a row is
`DONE` only when the Evidence column holds real, pasted output.

**Four findings are live and reachable today.** `AN1` and `AN4` by anybody on the
internet; `AC1` and `AC2` by any member of the public who types instead of tapping;
`AU2` by any staff member using the feature as the README instructs.

### The evidence rule, inherited and not softened

Every finding carries a file and line, a grep, or a probe that was run. Where a probe ran,
its output is pasted. *"It looks like"* is not evidence. This document set has been burned
by that before — `COMMUNITY_TODO.md`'s ledger rule exists because a row was once marked
`DONE` on the strength of an edit.

---

# §1 · The name · `AU1`

## `AU1` — AURA names an LLM agent and a deterministic solver, and the README sells both as AI · **high (external)**

`README.md:3` carries two badges side by side:

```
![Tech](…badge/AI-Gemini%20Powered-purple) ![AURA](…badge/AURA-v2.3%20Engine-blue)
```

`README.md:7`:

> At its core lies **AURA** (Adaptive Understanding and Real-time Analytics), a
> proprietary, autonomous AI agent … AURA does not just read data; it actively interprets
> cognitive load, negotiates scheduling conflicts, executes database mutations, and
> mitigates burnout risk.

Three things wrong at once:

1. **"Proprietary" is false.** The model is Google's Gemini over REST with a system
   prompt (`functions/index.js:377`). The prompt and scaffolding are yours; the model is not.
2. **The roster engine is not AI.** `generateRosterV2` is a deterministic constraint
   solver — grade bands, FTE, skills, unavailability, hours policy. Same inputs, same
   roster, every time. That is a *strength*: auditable, explainable, reproducible.
3. **"Autonomous … executes database mutations" contradicts `README.md:171`** in the same
   file: *"AURA can format database writes, but requires a human-in-the-loop physical
   click."* The second is accurate. The first is what gets quoted.

**Why this leads.** Melissa Chua's ICT survey asks what rostering solution is in use. If
NEXUS is described as an **AI roster generator**, the questions that follow are about model
governance, explainability and clinical-AI assurance — a review the engine does not need
and cannot pass on the strength of a badge. Described accurately, the roster is assessed
as software and the assistant as AI.

**The honest one-liner:** *NEXUS contains a deterministic rostering engine (no AI) and a
Gemini-backed staff assistant (AURA) which does not touch the roster.*

---

# §2 · The staff assistant · `AU2`–`AU24`

## 2.1 What the model is trusted to write to the database

MODE 3 (`functions/index.js:238-256`) tells the model it is *"a safe database gateway"* and
asks for a `db_workload` object naming a collection, document, field and value.
`AuraPulseBot.executeDataEntry` (`:729`) executes it on a button press.

The client **has** been hardened, and `:734` documents it honestly: collection allowlisted
to two, person resolved through the member list, paths team-scoped. That closed the worst
of it. What follows is what the hardening did not reach.

### `AU2` — `target_value: null` writes a zero and reports success · **critical**

The prompt's own schema declares the field nullable (`functions/index.js:275`):

```
'     "target_value": <number | null>',
```

`AuraPulseBot.jsx:800` and `:812` consume it with a bare `Number()`. The month beside it
**is** guarded (`:794`); the value is not.

```
--- executeDataEntry: Number(target_value) at :800 / :812 ---
  target_value=35            -> Number() = 35       guarded? finite
  target_value=null          -> Number() = 0        guarded? finite
  target_value=undefined     -> Number() = NaN      guarded? NOT FINITE
  target_value=              -> Number() = 0        guarded? finite
  target_value=thirty five   -> Number() = NaN      guarded? NOT FINITE
  target_value={}            -> Number() = NaN      guarded? NOT FINITE
  target_value=[]            -> Number() = 0        guarded? finite
  target_value=1e999         -> Number() = Infinity guarded? NOT FINITE
  target_value=true          -> Number() = 1        guarded? finite

--- the month guard at :793, for comparison ---
  target_month=12         -> REFUSED
  target_month=null       -> REFUSED
  target_month=January    -> REFUSED
```

A model emitting the `null` its own schema permits overwrites that month's patient load
with **0**, and the user is told:

> ✅ Database updated successfully.
> Logged 0 patients for January.

**The asymmetry is the tell.** Somebody thought carefully about the month and not at all
about the value, in adjacent lines.

### `AU3` — `target_field` is model-chosen, unconstrained · **high**

`AuraPulseBot.jsx:812` writes `{ [workload.target_field]: Number(...) }`. The prompt says
the field is `patient_attendance` or `patient_load`; nothing enforces it. The collection
got an allowlist, the field did not. And the rule offers no backstop:

```
      match /workload/{period} {
        allow read: if false;
        allow create, update: if isLead(teamId);
        allow delete: if false;
      }
```

No `changedKeys().hasOnly(...)`, unlike the membership rules in the same file.

### `AU4` — the document id is model free-text with no validation · **medium**

```js
export const workloadPath = (teamId, period) => under(teamId, TEAM_COLLECTIONS.workload, period);
```

`teamPaths.js:345`. The line below it (`reportPath`) calls `assertYear`; so does
`rosterPath` (`:284`). `workloadPath` alone takes its segment raw, and
`AuraPulseBot.jsx:783` feeds it a string the model produced.

### `AU5` — MODE 3's team branch writes where nothing reads · **high**

The rule above is `allow read: if false`, and its comment says *"Nothing reads it today"*.
Verified across the client:

```
$ grep -rn "workloadPath\|loadPath" src --include=*.jsx --include=*.js | grep -v test | grep -v teamPaths.js
src/components/StaffLoadEditor.jsx:6,27,56      loadPath
src/components/AuraPulseBot.jsx:22,23,781,783   loadPath, workloadPath
src/components/AdminPanel.jsx:17,245            loadPath
src/App.jsx:55,391                              loadPath
```

**`workloadPath` has exactly one call site and it is a write. Zero readers.** A roster
master who logs 4,200 departmental attendances is told *"✅ Database updated successfully"*
and the figure enters a store no screen can display and the rules forbid reading.

### `AU6` — MODE 3's personal branch cannot work as instructed · **high**

| Step | What it says | Where |
|---|---|---|
| Prompt tells the model the user's id | `` `System Note: The user's exact database ID is '${user?.id}'.` `` | `AuraPulseBot.jsx:326` |
| `user.id` is now a **uid** | `id: authUser.uid` | `NexusContext.jsx:35,47` |
| MODE 3 says use it as `target_doc` | `'- target_doc: The exact database ID … (e.g., "alif")'` | `functions/index.js:252` |
| Client resolves by **display name** | `memberUidByName[rawTarget]` | `AuraPulseBot.jsx:777` |
| …keyed by `displayName` | `map((person) => [person.displayName, person.uid])` | `TeamContext.jsx:253` |

A model that obeys returns the uid. `memberUidByName["<uid>"]` is `undefined`:

> There is nobody called "`<uid>`" in this team. Nothing was saved.

**The feature works only when the model ignores the System Note.** That it appears to work
is the model being helpful, not the code being right — and `AU16` can change that with no
code change.

### `AU7` — the prompt's schema is a pre-migration fossil · **medium**

`functions/index.js:245-253` still names `monthly_workload` and `staff_loads` — top-level
collections from before the v2.0 migration, now `teams/{id}/workload/{period}` and
`teams/{id}/loads/{uid}`, with no top-level rule so they fall to `{unmatched=**}` and are
denied. The client translates, so nothing breaks; but the model is briefed on a schema
that no longer exists, and the example `"alif"` is a directory id that is now neither a uid
nor a display name. `AU6` is the bill for that.

## 2.2 What the model is trusted to say about a person

### `AU8` — "diagnosis_ready" is decided by turn count · **high**

`functions/index.js:340`:

```js
var diagnosisReady = turnIndex >= 4;
```

Four turns in, the server instructs the model to *"provide full Phase/Energy/Action
assessment now"* (`:348`) regardless of content. Somebody who typed "hi" four times reaches
the same instruction as somebody who described a fortnight of insomnia. The field is called
**`diagnosis_ready`** and the phases are the Mental Health Continuum — a word that will be
read literally by somebody eventually.

### `AU9` — `clampEnergy` overrules the model silently, and lets `NaN` through · **high**

```
--- clampEnergy: what reaches the wellbeing record ---
  phase=ILL       energy=90        -> written: 19     (model says exhausted but scores 90)
  phase=HEALTHY   energy=5         -> written: 80     (model says healthy but scores 5)
  phase=ILL       energy=undefined -> written: 19     (energy omitted -> `?? 50` at :365)
  phase=REACTING  energy=null      -> written: 50
  phase=ILL       energy=NaN       -> written: NaN
  phase=Bananas   energy=200       -> written: 100    (phase the model invented)
  phase=Bananas   energy=NaN       -> written: NaN
```

Two problems. **Disagreement is resolved invisibly** — when phase and number contradict
each other, which is a genuine signal that the turn was ambiguous, the number is bent to
fit and nothing is logged; the one artefact saying *"this assessment is unreliable"* is
destroyed in the act of storing it. And **`NaN` passes through** — `?? 50` catches `null`
and `undefined`, not `NaN` — into `teams/{id}/wellbeing/{uid}` (`:462`), the most sensitive
collection in the project.

### `AU10` — an invented phase is persisted as fact · **medium**

`clampEnergy`'s `if (!cfg)` branch (`:74`) accepts any string; `:367` writes
`analysis.phase.toUpperCase()` to `users/{uid}.aura_last_phase` and the pulse board, where
`getPhaseConfig` renders it with a `⬜` looking like a category.

### `AU11` — model output is persisted as memory and re-injected unvalidated · **medium**

`confirmLog` writes `aura_memory: pendingLog.action` (`:465`). It returns as `liveMemory`,
re-enters the next prompt (`:329`) and is read back verbatim in the greeting (`:206`):

> Welcome back, {firstName}. Last time we spoke, I noted: "{liveMemory}". …

Nothing validates it between generation and re-injection. A summary that misremembers what
somebody said becomes durable context and is quoted back to them as their own words.

### `AU12` — the pulse board is still keyed by display name · **high**

```js
await setDoc(doc(db, ...pulsePath(teamId, PULSE_PERIOD_DAILY)), { [user.name]: heatmapPayload }, { merge: true });
```

`AuraPulseBot.jsx:463`. `firestore.rules`'s own header calls display-name keying the root
problem: *"The only durable fix is to stop keying documents by display name."* The v2.0
migration moved everything to uid — the comment six lines below this one, at `:459`, is
itself about that fix. **This line was not converted.** Two clinicians sharing a display
name overwrite each other's wellbeing status, and `merge: true` means the second silently
wins.

### `AU13` — random anon keys, and a ledger claim that no longer holds · **low**

`AuraPulseBot.jsx:451` mints `Anon_${Math.floor(Math.random() * 9999)}`. Checking it turned
up more. `COMMUNITY_TODO.md` §4.6 marks `CP12` `DONE` with the evidence *"`grep Math.random
src/components/` returns nothing"*:

```
$ grep -rn "Math.random" src/components/ | grep -v "\.test\."
src/components/AuraGreeting.jsx:33:    return defaults[Math.floor(Math.random() * defaults.length)];
src/components/AuraPulseBot.jsx:451:                const heatKey = `Anon_${Math.floor(Math.random() * 9999)}`;
```

**The fix held** — neither hit is a session id, and `getSessionId()` is real. **The evidence
string does not.** It was scoped to session ids and recorded as an unscoped grep. Both
surviving hits are AURA's.

## 2.3 Cost, abuse and the model itself

### `AU14` — the ceilings are on the cheap endpoint, not the expensive one · **high**

```
$ grep -n "rateLimit\|enforceAppCheck" functions/index.js
825:const rateLimit = require('./rateLimit');
866,872,882,887,893:  (all inside communityAck)
931:    enforceAppCheck: ENFORCE_APP_CHECK,      (communityAck)
962:            rateLimit.refusalMessage(…)      (communityAck)
```

| | `communityAck` | `chatWithAura` |
|---|---|---|
| Rate limit | ✅ 300/600 per caller/hr, 6000 global | ❌ none |
| App Check | ✅ shipped (inert pending console) | ❌ none |
| Max output tokens | 200 | **8192** |
| Timeout | 20s | 90s fetch / 120s function |
| Model | resolved | prefers **`gemini-2.5-pro`** |
| Attachments | ❌ refused | ✅ up to 5, multimodal |
| Caller prompt | ❌ refused | ✅ up to 8000 chars |

`CP7` was excellent work aimed at the public endpoint, because that is where the audit was
looking. **The cost lives on the other one.** Any authenticated account can loop
`chatWithAura` with five attachments at 8192 output tokens on the most expensive model in
the priority list, unbounded, on the billed key. The auth check at `:328` bounds *who*, not
*how much*.

### `AU15` — attachments have no size cap and no type allowlist · **high**

`validateChatInput` (`:126-137`) checks the array is at most 5 and each entry has
`mimeType` and `data` present. Not the **size** of `data`; not `mimeType` against anything
— it goes straight to Gemini (`:366`). The author knew the pattern:
`validateAnalysisInput` thirty lines below has `MAX_JSON_CHARS = 8000` and enforces it.

### `AU16` — a transient failure pins the cheapest model for the container's life · **medium**

`resolveModel()` (`:44`) memoises in a module-level promise:

```js
if (!response.ok) { logger.warn(…); return SAFE_FALLBACK_MODEL; }   // ← promise NOT reset
…
logger.warn('[NEXUS] No priority model matched. Using fallback.');   // ← promise NOT reset
} catch (e) { …; modelResolutionPromise = null; }                    // ← reset
```

Only a thrown error clears the cache (and a 404 at `:397`). A **429 or 503** on a cold
container's first call pins `gemini-1.5-flash` for that container's lifetime — hours — with
one `logger.warn`. The same question can be answered by `gemini-2.5-pro` on one container
and `gemini-1.5-flash` on another, and **which model answered is not recorded on the
response**. For a surface emitting database writes and wellbeing classifications, that is
not a detail.

### `AU17` — the PDPA control is a sentence in the README · **high**

`README.md:167`:

> **PDPA Compliance:** Do not upload sensitive patient data or PHI. NEXUS tracks
> operational load, not patient records. AURA does not have EMR access. Use placeholders
> exclusively.

*"AURA does not have EMR access"* is true. The rest is an instruction to the user, not a
control on the system. The same endpoint accepts five arbitrary files of arbitrary size and
declared type (`AU15`) and forwards them to Gemini. No scan, no restriction, no bound, no
warning at the point of attachment, no log of what was sent.

**This is the finding most likely to matter if NEXUS is named to the cluster ICT** — not
because something has gone wrong, but because *"we tell staff not to"* is the answer a
governance reviewer is least able to accept.

## 2.4 Structure, tests and claims

### `AU18` — the response parser exists twice, verbatim · **medium**

Server `functions/index.js:184-192` and client `AuraPulseBot.jsx:342-346` run the same
fence-strip and brace-scan. `chatWithAura` returns `result.text` — the extracted JSON
**string** — so the server parses, validates, discards the object and hands back a string
for the client to parse again with its own copy. (`AC10` is the third copy.)

### `AU19` — "requiredFields" requires nothing · **medium**

```js
for (const field of requiredFields) {
    if (!(field in parsed)) {
        logger.warn('[NEXUS] Response missing required field: ' + field);
    }
}
```

`functions/index.js:201-205`. It warns and returns anyway. And the list `chatWithAura`
passes (`:412`) is `['reply','mode','diagnosis_ready','phase','energy','action']` —
**`db_workload` is not in it.** The one field that leads to a database write is not among
the fields the non-enforcing check does not enforce.

### `AU20` — two internal project names hardcoded into a deployed shared function · **low**

```js
var isStrictFormatting = prompt.indexOf('Project HUGE') !== -1 || prompt.indexOf('Magnify Mama') !== -1;
var dynamicTemperature = isStrictFormatting ? 0.1 : 0.7;
```

`functions/index.js:357`. Every other caller gets **0.7** — a creative-writing temperature —
including the turns that emit database writes and wellbeing classifications.
`generateSmartAnalysis` and `processFeedPost` both use 0.2.

> ### ⚠️ Corrected 2026-08-23 — half of this branch is dead code, and I described it wrongly
>
> This said *"two named **projects**"*. They are two **personas**: `magnify_mama` and
> `huge_grant` in `src/config/personas.js`. And the switch is matched against the persona's
> prompt text by substring, so:
>
> ```
> $ grep -c "Project HUGE" src/config/personas.js
> 0
> ```
>
> **`prompt.indexOf('Project HUGE')` can never match.** Only `'Magnify Mama'` can lower the
> temperature; the Grant Strategist persona has silently run at 0.7 — the creative-writing
> setting — for as long as the branch has existed, on a persona whose entire job is not
> fabricating citations. Nobody would see it: the output is prose either way.

### `AU28` — the persona mechanism teaches the model to obey overrides in the user turn · **high**

Found 2026-08-23, by being asked whether the prompts had been revised. **They had not, and
`src/config/personas.js` had never been audited at all** — it is absent from §8's list of
what this document does not cover, which is its own small failure.

Every `LIVE_PERSONAS` entry's prompt begins with the literal words **`System Override:`**:

```js
{ id: 'well_well',  …, prompt: 'System Override: You are Well Well…' },
{ id: 'aim_assist', …, prompt: 'System Override: You are Aim Assist…' },
{ id: 'data_dude',  …, prompt: 'System Override: You are Data Dude…' },
```

That text is not a system instruction. `AuraPulseBot.jsx:330` appends it to `contextPrompt`,
which is sent as the `prompt` field, and `functions/index.js:345` prefixes it:

```js
if (prompt) contextParts.push('CONTEXT/OVERRIDE: ' + prompt);
```

— into the **user turn**. So the application's own design demonstrates, on every persona
switch, that text arriving in a user turn can relabel the assistant. And `validateChatInput`
accepts a **caller-supplied `prompt` of up to 8,000 characters** (`MAX_PROMPT_LEN`), which the
server will obligingly label `CONTEXT/OVERRIDE:` on the caller's behalf.

⚠️ **This is a channel, not an accident.** `CP6` closed the equivalent on the public endpoint
— `communityAck` takes no caller-supplied prompt, deliberately, and its comment says why. The
staff endpoint kept it, and with no rate limit (`AU14`) and no App Check, an authenticated
account can send 8,000 characters of override text as often as it likes.

The fix is not obvious and should not be rushed: the persona feature is real and the owner
uses it. The options are a server-side persona allowlist (the client sends `personaId`, the
server holds the text), or dropping the `CONTEXT/OVERRIDE` label so user content is never
framed as an instruction. Both change model behaviour and neither is a night-before-a-demo
change.

### `AU21` — upstream error text forwarded to the client, in jargon · **low**

`functions/index.js:422` throws `'Neural Link Unstable: ' + error.message`, where
`error.message` can be the Gemini API's own string (`:407`). Upstream detail reaches the
browser, and a clinician is shown *"Neural Link Unstable"* when a request failed.

### `AU22` — the sandbox never shows the data-entry card the README tells you to test · **medium**

`demoAura.js:131` claims *"in the shape `AuraPulseBot` already parses"* and `:145` *"the
demo shows the same card"*. Probe against the real render gate (`AuraPulseBot.jsx:1093`):

```
demo db_workload  = {"value":35,"period":"demo","written":false}
mode              = DATA_ENTRY
DATA_ENTRY card renders in sandbox? -> false
```

The gate needs `target_collection`. `README.md:186` says *"The Data Entry Test … she should
display a green `DATA_ENTRY` block"*. In Demo Mode — the mode a stakeholder is walked
through — no block appears. `COMMUNITY_TODO.md` P0.2's evidence lists which cards work and
correctly does **not** include this one, so the gap was known at the ledger while the
module's own comment contradicted it.

### `AU25` — a persona without a title crashes the sandbox · **low**

Found on 2026-08-23 by the go-live gate, not by the post-mortem. `demoAura.js:101`:

```js
(p) => `Thank you for saying that plainly. Being ${p.title.toLowerCase()} carries a load…`
```

`respondAsDemoAura`'s fallback substitutes a whole persona only when one is **entirely
absent**, so a persona object that is present but missing `title` reaches `.toLowerCase()`
on `undefined` and throws, taking the sandbox chat down. All six `DEMO_PERSONAS` carry a
title, so it is unreachable through the UI today — which is exactly why it would have
surfaced first in front of an audience, on a persona somebody added in a hurry.

### `AU23` — the README describes a codebase that has moved · **medium**

| Claim | Reality |
|---|---|
| `:89` lists `auraChat.js` | **Deleted** (P0.6). `ls` confirms MISSING. |
| `:81` lists `personas.js` under `utils`/`data` | It is at `src/config/personas.js` |
| `:7` "autonomous … executes database mutations" | `:171` "requires a human-in-the-loop physical click" |
| `:265` "independently execute peer-to-peer shift swap matrix rewrites" | `:18` carries a 2026-08-15 correction saying that surface went in v1.10.0. **Applied to one line, not the other.** |
| `:186` "**She** should parse the numbers" | AURA gendered in user-facing docs, inconsistently |

### `AU24` — the two functions deciding what the model may do are untested · **high**

```
$ grep -rn "executeDataEntry\|clampEnergy" src --include=*.test.jsx --include=*.test.js
(no output)
```

Against **2744 tests across 73 files**. `executeDataEntry` decides what a language model may
write to a clinical-adjacent database; `clampEnergy` decides what number enters a staff
wellbeing record. Neither has a test. That is how `AU2` and `AU9` survived.

---

# §3 · The public screening · `AC1`–`AC14`

`src/components/AuraChat.jsx`, 1,226 lines, at `/individuals/chat`. The community portal
already has a 26-item ledger; this is **not** a second pass over it. It is a pass over the
one thing that ledger never opened, and has itself had `OPEN` under `P4.3` for weeks:
*"`deriveFlags` and `parseClinicalData` have no tests."*

## 3.1 The PAVS parser

PAVS is **days per week × minutes per session** — the single measure the portal exists to
take. The chat renders a free-text box beside its chips and prompts, in its own words,
**"SELECT AN OPTION OR TYPE FREELY"**.

### `AC1` — a typed session length containing "20" is recorded as 15 minutes · **critical**

`AuraChat.jsx:654-659`:

```js
const minsN = minsStr.includes('60+') || minsStr.includes('60 min') ? 65
            : minsStr.match(/45.?60|45–60/i)                         ? 52
            : minsStr.match(/30.?45|30–45/i)                         ? 37
            : minsStr.match(/20.?30|20–30/i)                         ? 25
            : minsStr.includes('less') || minsStr.includes('20')     ? 15
            : parseInt((minsStr.match(/\d+/) || ['0'])[0], 10);
```

```
  "45 minutes"         -> minsN = 45
  "90 minutes"         -> minsN = 90
  "60 minutes"         -> minsN = 65
  "120 minutes"        -> minsN = 15     <-- contains "20"
  "200 minutes"        -> minsN = 15     <-- contains "20"
  "1200 minutes"       -> minsN = 15     <-- contains "20"
  "20 to 40 minutes"   -> minsN = 15     <-- contains "20"

--- Consequence: a 5-day-a-week, 2-hour-a-session exerciser ---
  recorded: 5 days x 15 min = 75 min/wk   (PAVS tier: BELOW the 150 guideline)
  actual  : 5 days x 120 min = 600 min/wk (PAVS tier: meets)
```

Somebody training ten hours a week is recorded at **75 minutes**, charged the deficit
point, shown *"below the 150 min/week guideline"*, and routed by `selectCTA` to
**Start2Move — a free six-session beginner programme**.

`CP15`, `CP18`, `CP19` and `CP22` were all unanchored substring tests and are all closed.
The hunt reached the clinical flag matchers, the previous-ID field, the postal chips and
typed symptom answers. **It never reached the PAVS ladder.**

### `AC2` — an answer with no digits scores zero · **critical**

```
  mins "about an hour"           -> 0
  mins "half an hour"            -> 0
  mins "thirty minutes"          -> 0
  days "daily"                   -> 0
  days "every day"               -> 6
  days "most days"               -> 0
  days "five times a week"       -> 0
```

**"daily" scores 0 days. "about an hour" scores 0 minutes.** Somebody who walks an hour
every day and writes it the way people write it gets `pavsScore = 0` — the maximum
inactivity the instrument can produce. `"every day"` survives only because it is one of
three literal alternatives hand-listed in the regex.

⚠️ **This is `CP1` returning through a different door** — an active person scored as
sedentary, one layer upstream of where `CP1` was fixed. ⚠️ **And the fix pattern already
exists here:** `CP26` produced `parseAgeBand`/`isSixtyPlus` in `clinicalFlags.js`, which
reads `"sixty five"` and `"I am 72"` correctly. PAVS never got it.

### `AC3` — the two pathways compute PAVS by two unrelated algorithms · **high**

| | Chat (`AuraChat.jsx:648`) | Form (`ConventionalForm.jsx:184`) |
|---|---|---|
| Mechanism | regex ladder over free text | exact-match lookup table |
| Input | `<input>` — "type freely" | `<select>` — closed set |
| `"120 minutes"` | **15** | not expressible |
| `"daily"` | **0** | not expressible |

⚠️ **`pathwayParity.test.js` cannot see this, and that is not the test's fault.** The two
agree ~~**exactly** on all nine chip combinations~~ on eight of the nine chip combinations
and diverge **only** on free text, which the form cannot accept. ~~There is no input both
pathways would take and disagree on.~~ The divergence lives largely in the gap a parity test
is structurally unable to reach.

> ### ⚠️ Corrected 2026-08-23 — this paragraph was wrong, and the way it was wrong is the point
>
> **`AC15`.** The chip `'45–60 mins'` scored **65 in the chat and 52 in the form**, because
> that string CONTAINS the substring `"60 min"` and the ladder tested
> `includes('60 min')` first. So there *was* an input both pathways accept and disagree on,
> and it was a tapped chip in the pathway most people use — a 25% overstatement of session
> length, recorded to `community_assessments` and shown to the person.
>
> The probe behind the word *"verified"* tested **four** day/minute pairs. The sentence
> claimed **nine**. That is precisely the failure this document set's evidence rule exists to
> prevent, committed in the document that states the rule — and it is the second instance
> found this week, after `AU13`.
>
> It surfaced only when the fix for `AC1` was asserted against `ConventionalForm`'s midpoint
> table **written out from the form**, rather than against what the chat was expected to
> return. An assertion against remembered expectations would have agreed with the bug.
>
> The finding above is left as written, per the frozen-snapshot rule. `AC15` below carries
> the detail.

`pathwayParity.test.js:159` even forbids re-introducing a substring test — scoped correctly
and narrowly to the falls age gate. `minsStr.includes('20')` sits 300 lines away in the same
file.

### `AC4` — a docstring true of one pathway written as true of both · **low**

`scoring.js:21` — *"`pavsMinutes` MINUTES PER SESSION. Capped at 65 by `MINS_MIDPOINT`."*
`MINS_MIDPOINT` is the **form's** table. The chat has no cap; `"500 minutes"` yields 500.
`calculateRiskScore` reads only `pavsScore` (`:80`) so nothing miscalculates today, but the
value is written to `community_assessments`.

### `AC15` — a tapped chip scored 25% high, and the parity claim above missed it · **high**

Found on 2026-08-23 while fixing `AC1`. `AuraChat.jsx`'s ladder opened:

```js
const minsN = minsStr.includes('60+') || minsStr.includes('60 min') ? 65
            : minsStr.match(/45.?60|45–60/i)                         ? 52
```

`"45–60 mins"` contains `"60 min"`, so the first branch won:

```
ORIGINAL chat ladder vs ConventionalForm MINS_MIDPOINT:
  Less than 20 mins    form=15   chat=15
  20–30 mins           form=25   chat=25
  30–45 mins           form=37   chat=37
  45–60 mins           form=52   chat=65    <-- DISAGREE
  60+ mins             form=65   chat=65
```

Not a free-text edge case — **a tapped chip**, in the pathway most people use, overstating
session length by 25% in the figure written to `community_assessments` and shown on the
result page.

The tier does not flip for any chip-days × chip-minutes pair (1.5 days is below 150 either
way; 3.5 and 6 are above either way), which is why nothing downstream looked wrong. The
recorded number was simply high.

⚠️ **It also falsifies `AC3`'s central claim**, and the correction is recorded there. The
lesson is narrower than "test more": the assertion has to be written against **the other
implementation**, not against what you expect this one to do.

### `AC5` — the parser is unexported, untested, and tested only as a string · **high**

`parseClinicalData` is a module-level `const` (`:643`) — not exported, so it cannot be
unit-tested without changing the module.

```
$ grep -rn "from './AuraChat'\|from '../components/AuraChat'" src
(no output)
```

Four test files name `AuraChat`; **none renders it.** They read the file **as text** and
assert on regexes. `ctaTierParity.test.js:10` documents why — jsPDF and html2canvas. The
reason is legitimate; the consequence is recorded nowhere. **Source scanning proves a
string is present. It cannot prove a number is right.**

## 3.2 The end of the conversation

### `AC6` — the completion handler guards the one call that cannot throw · **high**

```js
const concludeTriage = async (finalData) => {
    clearProgress();                                   // ← the answers are dropped FIRST
    const parsed    = parseClinicalData(finalData);    // ← outside the try
    const riskScore = calculateRiskScore(parsed);      // ← outside the try
    const ctaData   = selectCTA(parsed);               // ← outside the try
    try {
      await recordTelemetry(…);                        // ← the ONLY thing inside it
      setTimeout(() => { … navigate('/individuals/result', …) }, 1200);
    } catch { … langData.error … }
};
```

`recordTelemetry` **cannot reject** — `telemetry.js:127` catches everything and returns
`false`. So the `catch` is unreachable and the three calls that *can* throw sit outside it.
`concludeTriage` is invoked without `await` and without `.catch` (`:1024`), so a throw is an
unhandled rejection. The visitor is left on *"Generating your personalised plan now…"* for
ever — and `clearProgress()` ran on line one, so there is nothing to resume.

### `AC7` — the unreachable catch reads as a safety net · **medium**

The completion path *looks* defended. If the deliberate swallow at `telemetry.js:127` were
ever removed for good reasons, this catch would come alive and become the only outcome for
a failed write: an error message, no result, no saved progress.

## 3.3 The AI acknowledgement

### `AC8` — the discard window still bills in full · **medium** *(known — `P0.5` `OPEN`)*

`AI_UPGRADE_WINDOW_MS = 1500` (`:932`) with no `AbortController`. After 1.5s the answer is
ignored; the request runs to completion server-side and bills. A client-side fix (one
`AbortSignal`) filed under a server-side item, which is why it keeps getting deferred.

### `AC9` — the model's own reply is screened by an unanchored substring test · **medium**

```js
var isErr = !stripped || /fallback|missing.api|api.key|error|unauthorized|unavailable/i.test(stripped);
```

`:999`. A legitimate acknowledgement is discarded if it contains any of those words —
*"if your usual class is unavailable, the centre can suggest another"*. Harm is bounded;
the pattern is the one this file has had removed from it four times. `/missing.api/` also
has an unescaped `.`.

### `AC10` — a third copy of the fence-strip and brace-scan · **medium**

`AuraChat.jsx:1000-1007`, after `AU18`'s two. Its own comment says this is dead tolerance —
`communityAck` returns plain text, not JSON. Three copies of a parser for a format one of
the three callers no longer produces.

### `AC11` — the acknowledgement rewrites text the person may be reading · **medium** · owner

The handler replaces the message body in place (`:1014`) up to 1,500 ms after it appeared.
Sentences change under the reader with no transition, no indication and — see `AC12` — no
announcement.

## 3.4 Who can use this screen

### `AC12` — the community portal has no live region; the staff roster has two · **high**

```
$ grep -rn "aria-live" src/components/*.jsx
src/components/RosterView.jsx:335:            aria-live="polite"
src/components/RosterView.jsx:535:            aria-live="polite"
```

**Zero in the community portal.** The chat area is a plain scrolling `div` (`:1129`). Every
bot question, the typing indicator, the acknowledgement rewrite and the final plan arrive
unannounced.

**The inversion is the finding.** `CP17` fixed `<html lang>` and re-enabled pinch-zoom
*specifically* because this portal targets elderly users. The staff roster announces its
state changes politely; the public screening built for the people with the most assistive-
technology need does not.

### `AC13` — messages keyed by array index while a stable id exists · **low**

`:1131` renders `key={idx}`; the upgrade handler at `:1012` matches on `m._id`. A stable id
was added for exactly this and the key was never moved to it.

### `AC14` — `TOTAL_STEPS` says 13, is 15, and badges the result with the wrong domain · **low**

`:99` — `const TOTAL_STEPS = DOMAIN_CONFIG.length; // 13`. There are **15** entries; `CP26`
appended `falls` and `healthier_sg`. Its two uses are `step: TOTAL_STEPS - 1` on the
completion and error messages:

| | Badge worn by the result message |
|---|---|
| Before `CP26` | `step 12` → 🔗 NEXUS Record Linkage |
| Now | `step 14` → 🩺 Healthier SG |

Neither is right — the completion message belongs to no domain. The honest fix is
`step: undefined`, which `DomainBadge` already handles (`:843`).

---

# §4 · The intelligence layer · `AN1`–`AN13`

## 4.1 The year-end analysis

### `AN1` — six named colleagues and their job grades are in the public bundle · **critical**

⚠️ **The most serious finding in this document. It is not an AI defect — it is six lines of
JavaScript that undo a privacy model rebuilt from scratch three days ago.**

`src/components/SmartAnalysis.jsx:16`:

```js
const STAFF_PROFILES = {
    "Alif":      { role: "Lead and Senior Clinical Exercise Physiologist", grade: "JG14", … },
    "Fadzlynn":  { role: "Clinical Exercise Physiologist, CEP I",          grade: "JG13", … },
    "Derlinder": { role: "Clinical Exercise Physiologist, CEP II",         grade: "JG12", … },
    "Ying Xian": { role: "Clinical Exercise Physiologist, CEP II",         grade: "JG12", … },
    "Brandon":   { role: "Clinical Exercise Physiologist, CEP III",        grade: "JG11", … },
    "Nisa":      { role: "Administrator",                                  grade: "Admin", … }
};
```

A module-level constant in a React component, therefore in the build:

```
$ grep -oh "Derlinder.\{0,80\}" dist/assets/index-p-7kKpFN.js
Derlinder:{role:"Clinical Exercise Physiologist, CEP II",grade:"JG12",focus:"Education Le…

$ grep -o 'grade:"JG1[0-9]"' dist/assets/index-p-7kKpFN.js | sort | uniq -c
      2 grade:"JG11"    2 grade:"JG12"    2 grade:"JG13"
      2 grade:"JG14"    1 grade:"JG15"    1 grade:"JG16"

$ grep -o 'src="/assets/index-p[^"]*"' dist/index.html
src="/assets/index-p-7kKpFN.js"
```

**One bundle serves every route**, including `/individuals`. A member of the public opening
the community health screening downloads six KKH clinicians' names, roles and job grades as
part of the page. No sign-in. No Firestore read, so no rule is involved.

**Why it is worse than it looks.** This session rebuilt grade privacy on the reasoning in
`memberProfile.js`: *"Pay grade is the most sensitive thing somebody volunteers about
themselves short of the wellbeing log."* What was built:

| Control | Where |
|---|---|
| Grade in its own collection | `teams/{id}/grades/{uid}` |
| `allow get: if isSelf(memberUid) \|\| isLead(teamId)` | `firestore.rules` |
| `allow list: if false` — *even to a lead* | `firestore.rules` |
| `useTeamGrades` — lead-only, one read per member, never in `TeamContext` | `src/hooks/` |
| `useMemberGrade` — one member, only while an editor is open | `src/hooks/` |
| Grade never enters the member-list render | `TeamMembersPanel.jsx` |

Every one is correct. Every one is bypassed by a `const`. `useTeamGrades`' header says
*"`grep -rn useTeamGrades src/` is the complete list of places grades can reach"* — true,
and the conclusion it invites is false.

⚠️ **It is also `TEAM_DIRECTORY` again.** The whole v2.0 rebuild existed to delete a
hardcoded team from `src/utils/index.js` and `firestore.rules`. **This copy was never
found**, because it spells grades `JG11`–`JG16` rather than `AH7`–`AH17` — a second, older
vocabulary that matches no search for the first.

### `AN2` — every department's analysis is generated over those six people · **critical**

`SmartAnalysis.jsx:97`:

```js
const currentProfiles = STAFF_PROFILES;
const profileArray = Object.values(currentProfiles);
```

Not `members` from `useTeam()` — the component imports `useTeam` and uses it only for
`teamId`. A Respiratory Therapy lead pressing **GENERATE ANALYSIS** hands the model six
people from another department, with grades, plus *their* `yearData`, and gets back a
report naming those six. `handlePublish` (`:145`) writes it to `teams/{teamId}/reports/{year}`:

```
      match /reports/{year} {
        // The AI-generated year-end report. Every member may read it; a lead publishes it.
        allow get: if isMember(teamId);
```

**Every member of the publishing department can then read it.** Cross-tenant disclosure by
construction — not a rule that is too loose, but a payload that was never team-scoped.

### `AN3` — the team name is hardcoded too · **high**

`SmartAnalysis.jsx:104` — `teamName: "SSMC@KKH CEP Team"`. `useTeam()` supplies
`team.name`; it is not used. The server prompt opens `'TEAM IDENTITY: ' + teamName` and
`SMART_ANALYSIS_SYSTEM_PROMPT` instructs *"TARGET IDENTITY: You must identify the specific
team"* and *"DOMAIN ADAPTATION: Adapt your analysis to their specific function."* The model
is explicitly told to tailor to a department and given the wrong one, every time, for every
team but one.

### `AN4` — `generateSmartAnalysis` has no authentication check · **critical**

```
$ awk 'NR>=430 && NR<=500 && (/request\.auth/ || /isLead/ || /teamId/)' functions/index.js
(no output)
```

| Callable | Auth | Authorization |
|---|---|---|
| `chatWithAura` | ✅ `:330` | — |
| `processFeedPost` | ✅ `:571` | ✅ re-reads team membership |
| `inviteMember` / `removeMember` / `approveLeadRequest` | ✅ | ✅ |
| **`generateSmartAnalysis`** | ❌ **none** | ❌ none |

`cors: true`, no `request.auth`, `secrets: ['GEMINI_API_KEY']`, accepts 8,000 chars of
caller JSON, returns 2,048 tokens on the billed key. An anonymous caller cannot extract
NEXUS data — they supply their own payload — but they get **a free, unmetered Gemini
endpoint**. Exactly the class `CP6` closed for `publicTriageChat` and `:330` closed for
`chatWithAura`. Two of three were fixed. `rateLimit.js` does not cover it either (`AU14`).

### `AN5` — the output budget is smaller than the smallest output requested · **high**

`functions/index.js:456-457` asks for *"private": 1000-2000 words* and *"public": 200-500
words*. `:474` sets `maxOutputTokens: 2048`. At ~1.3 tokens per English word that is
**~1,560 tokens at the floor and ~3,250 at the ceiling**, before JSON syntax. The bottom is
marginal; the top is 60% over. The model must self-truncate — silently returning less than
specified — or run out mid-string, at which point `parseJsonResponse` throws *"AI returned
malformed JSON. Please retry."* and the retry hits the same ceiling.

### `AN6` — the screen promises five minutes; the call is abandoned at thirty seconds · **medium**

| | |
|---|---|
| `SmartAnalysis.jsx:14` | `httpsCallable(…, { timeout: 300000 })` |
| `SmartAnalysis.jsx:100` | `'Connecting to Neural Link (This may take up to 5 minutes)...'` |
| `functions/index.js:430` | `onCall({…})` — no `timeoutSeconds`, so **60s** |
| `functions/index.js:463` | `signal: AbortSignal.timeout(30000)` |

Combined with `AN5`, a long generation is exactly the case most likely to hit that abort.

### `AN7` — a model decides what is "safe for all staff" · **high** · owner

Nothing between the model and the screen checks the split held — no name detection, no diff
against the private text, no review step; `handlePublish` writes both in one `setDoc`
(`:154`). The demo private sample (`:82`) shows the register: *"Peter (JG11) is experiencing
severe scope creep and burnout risk"* — named individual, grade, burnout assessment. A
sentence of that shape landing in `public` is published to the whole department.

Filed as a **decision**: an LLM performing a confidentiality split on staff wellbeing
content may be acceptable with a human review step in front of it. There is currently no
such step and nothing records that the choice was made.

### `AN8` — a missing field renders — and archives — as the report · **low**

`functions/index.js:488-489` falls back to `'No private report generated.'`. With `AU19`
only warning, that literal string reaches the client, renders in the report pane
(`SmartAnalysis.jsx:237`), and `handlePublish` will archive it as that year's summary.

## 4.2 The population rollup

`CP23`, `CP25` and `P7.2`–`P7.4` did substantial work here and it holds. Not re-litigated.

### `AN9` — the suppression floor is the only control, and it is not in the rules · **medium** · owner

```
    match /community_insights/{period} {
      allow read: if isSignedIn();
      allow write: if false;
    }
```

Any signed-in account, in any team, across the cluster as it onboards, reads the national
rollup. Defensible for suppressed counts; `write: if false` is right. The finding is the
**absence of a second line**. `CP5` closed `community_assessments` to `if false` precisely
because *"every signed-in staff member could read the public's health records"*, and the
ledger warns that reopening it *"just for the dashboard"* would be that defect with a chart
attached. The dashboard was built on a rollup whose entire privacy guarantee lives in
`functions/insights.cjs` — application code, on a schedule, with no rule that could refuse a
bad document. **If `insights.cjs` ever publishes an unsuppressed cell, every signed-in user
in the cluster reads it and nothing else says no.**

## 4.3 The weekday nudge

### `AN10` — the nudge silently stops working past 500 users · **high**

`functions/index.js:524-533` builds `tokens` from every user with an FCM token (`:513`) and
calls `sendEachForMulticast` once. **FCM accepts at most 500 tokens per call.** There is no
chunking. Past 500 users the call fails into:

```js
} catch (error) {
    console.error('[NEXUS] Critical error sending pulse nudge:', error);
    return null;
}
```

A log line, nothing else. Nobody gets a nudge, no alert fires, and the symptom is
indistinguishable from people turning notifications off. **500 is not a distant number** —
the stated target is 28 professions across the cluster. The feature aimed most directly at
what NEXUS says it exists for is the one that breaks first at scale, quietly.

### `AN11` — one global nudge, no team scoping · **medium** · owner

`db.collection('users').where('fcmToken', '!=', null)` — no `teamIds` filter. Every user of
every department gets identical copy at 09:00 SGT on the same weekdays. A department cannot
choose its time, opt out as a department, or word its own prompt; a service running nights
or weekends gets a Monday-morning office nudge. The only control is a per-user flag.

## 4.4 The PDPA guard

### `AN12` — a compliance gate implemented only as a model classification · **medium** · owner

`processFeedPost`'s prompt asks the model to reject posts containing *"patient names,
NRIC/FIN, specific ward/bed identifiers linked to diagnoses, or toxic/unprofessional rants."*
There is no deterministic backstop. **An NRIC/FIN is one of the most regular identifiers in
Singapore** — a letter, seven digits, a checksum letter — and a regex would catch every one,
every time, before the model is called. Ward identifiers and free prose need judgement; the
structured identifier does not. The section header reads `FEEDS, SMART WATERCOOLER & PDPA
GUARD`; a probabilistic classifier presented as a *guard* is a different assurance claim
from the one that name makes.

### `AN13` — comments bypass the guard entirely · **high**

Posts are properly fenced:

```
      match /feed/{postId} {
        // Cloud Function only — `processFeedPost` runs the PDPA guard, and a post
        // that bypassed it would defeat the point of having one.
        allow create: if false;
```

Comments are not:

```
        match /comments/{commentId} {
          allow create: if isMember(teamId)
                        && request.resource.data.keys().hasOnly(['author', 'text', 'timestamp'])
                        && … && request.resource.data.text.size() <= 5000
```

Shape and length only. A 5,000-character comment containing a patient's name, NRIC and ward
goes straight into Firestore with no model review, no regex and no Cloud Function in the
path — on the same screen, under the post the guard just cleared. **The comment above the
post rule says a bypassed post "would defeat the point of having one". The reply box beside
it is the bypass.**

---

# §5 · What held

A post-mortem listing only failures is a misleading document.

| | |
|---|---|
| **`chatWithAura` is staff-only** | `:328` refuses a caller with no `request.auth`; `:311` explains what had to be true first, and both things genuinely were. This closed a real hole. |
| **The MODE 3 collection allowlist** | `:766` — two values, hardcoded, refused otherwise. The comment at `:734` describes the previous state honestly rather than flatteringly. |
| **People resolved through the member list** | `:777` — a name the model invents resolves to nothing and is refused, instead of creating a document for a colleague who does not exist. |
| **`processFeedPost` does authorization** | `:571` auth, then re-reads `teams/{teamId}/members/{uid}` and refuses a non-member. **The only AI callable that checks the caller belongs to the team they are acting on** — the template `AN4` should be fixed against. |
| **`allow create: if false` on feed posts** | The PDPA guard is genuinely enforced for the surface it covers; rule and function agree. |
| **The sandbox writes nothing** | `AuraPulseBot:445`, `:756`, `SmartAnalysis:145`. Demo mode used to append to real wellbeing data and archive a fabricated Marvel report over a real year-end report, reporting success. Both refused now, and the `isDemo`/`teamId` ordering was fixed so the refusal names the right reason. |
| **Chat history is in-memory only** | `NexusContext.jsx:12` — `useState`, not `localStorage`. Correct for a shared clinic terminal, and consistent with the portal's deliberate `sessionStorage` choice. |
| **The MODE 3 month guard** | `:794` — correct and complete; refuses every bad input tested. Notable only because the value beside it has none. |
| **`selectCTA` is total** | Every path returns a CTA object; `ctaData.tier` is safe. |
| **The chips are exact across both pathways** | All nine day/minute combinations produce identical scores in the chat ladder and the form's table. The tap path — which most people use — is correct. |
| **The shared clinical parsers** | `parseFallsAnswer`, `parseHealthierSg`, `isSixtyPlus` all live in `clinicalFlags.js` and `pathwayParity.test.js` holds that line. `CP9` is genuinely closed. |
| **`rosterCoverage.js`** | Pure, deterministic, no `Date.now()`, no `Math.random()`, nothing dropped — a malformed request is kept and explained rather than filtered away. **The best-engineered module in the layer, and it contains no AI at all.** |
| **Archiving by uid** | `SmartAnalysis:167` — the key was a display-name slug, so a renamed clinician got two partial histories. Fixed, reasoning kept. |
| **`communityAck` as a whole** | Separate prompt, no caller-supplied prompt, closed-set validation, rebuilt `priorAnswers`, rate limited, App Check ready. The model for what `chatWithAura` should look like. |
| **The insights suppression work** | `CP23`/`CP25` — measured, re-measured, and a test that walks the published document and fails on any readable count under the band. |
| **The nudge schedule matches its documentation** | `'0 9 * * 1-5'`, `Asia/Singapore` (`:504`) against `README:22`. Checked because the surrounding claims were wrong; this one is right. |

---

# §6 · The complete ledger

51 findings. Severity is about consequence, not effort. The plan is
[`AURA-TODO.md`](AURA-TODO.md).

| Id | Finding | Severity | Owner |
|---|---|---|---|
| `AN1` | Six named colleagues + job grades in the public bundle | **critical** | me |
| `AN2` | Every department's analysis generated over those six people | **critical** | me |
| `AN4` | `generateSmartAnalysis` has no auth check — open Gemini endpoint | **critical** | me |
| `AU2` | `target_value: null` writes 0 and reports success | **critical** | me |
| `AC1` | Typed minutes containing "20" recorded as 15 | **critical** | me |
| `AC2` | Word-number answers score 0 — "daily", "about an hour" | **critical** | me |
| `AU1` | AURA names an LLM and a solver; README sells both as AI | **high (ext)** | **owner** |
| `AN3` | Team name hardcoded; every report framed as another department | high | me |
| `AN5` | Output budget smaller than the smallest requested output | high | me |
| `AN7` | A model decides what is "safe for all staff", unchecked | high | **owner** |
| `AN10` | Nudge silently stops past 500 users | high | me |
| `AN13` | Comments bypass the PDPA guard entirely | high | me |
| `AU3` | `target_field` model-chosen, no allowlist, no rule backstop | high | me |
| `AU5` | MODE 3 team branch writes to a collection with no readers | high | **owner** |
| `AU6` | MODE 3 personal branch cannot work as instructed | high | me |
| `AU8` | `diagnosis_ready` gated on turn count, not content | high | **owner** |
| `AU9` | `clampEnergy` overrules the model; `NaN` reaches Firestore | high | me |
| `AU12` | Pulse board still keyed by display name | high | me |
| `AU14` | Rate limit and App Check on the cheap endpoint only | high | me |
| `AU15` | Attachments unbounded in size, unrestricted in type | high | me |
| `AU17` | PDPA control is a README sentence | high | **owner** |
| `AU24` | `executeDataEntry` and `clampEnergy` have no tests | high | me |
| `AC3` | Two pathways, two PAVS algorithms; parity test blind to it | high | me |
| `AC15` | A tapped chip scored 25% high — and falsifies `AC3`'s parity claim | high | me |
| `AU27` | `exportToDoc` and `confirmAdminAction` write to Firestore with no `isDemo` guard | high | me |
| `AU28` | Persona prompts are `System Override:` text in the user turn; caller-supplied `prompt` up to 8,000 chars | high | **owner** |
| `AC5` | Parser unexported, untested; suite tests source text | high | me |
| `AC6` | `concludeTriage` guards the only call that cannot throw | high | me |
| `AC12` | No live region in the portal; the staff roster has two | high | me |
| `AN6` | UI promises 5 minutes; the call is abandoned at 30 seconds | medium | me |
| `AN9` | Suppression is the only control and it is not in the rules | medium | **owner** |
| `AN11` | One global nudge, no team scoping | medium | **owner** |
| `AN12` | PDPA guard is a model classification, no deterministic backstop | medium | **owner** |
| `AU4` | `workloadPath` takes an unvalidated segment | medium | me |
| `AU7` | Prompt schema is a pre-migration fossil | medium | me |
| `AU10` | Invented phase persisted as fact | medium | me |
| `AU11` | Model output persisted as memory and re-injected unvalidated | medium | **owner** |
| `AU16` | Transient failure pins the fallback model for the container | medium | me |
| `AU18` | Response parser duplicated server and client | medium | me |
| `AU19` | `requiredFields` only warns; `db_workload` not listed | medium | me |
| `AU22` | Sandbox never shows the data-entry card the README tests | medium | me |
| `AU23` | README stale and self-contradictory | medium | me |
| `AC7` | The unreachable catch reads as a safety net | medium | me |
| `AC8` | Discard window still bills in full *(known — `P0.5`)* | medium | me |
| `AC9` | Model reply screened by unanchored substring test | medium | me |
| `AC10` | Third copy of the fence-strip/brace-scan | medium | me |
| `AC11` | Acknowledgement rewrites text under the reader | medium | **owner** |
| `AN8` | A missing field renders — and archives — as the report | low | me |
| `AU13` | Random anon keys; `CP12` evidence string now false | low | me |
| `AU20` | Project names hardcoded; temperature 0.7 on write paths | low | me |
| `AU21` | Upstream error text forwarded to the client, in jargon | low | me |
| `AC4` | `scoring.js` cap docstring true of one pathway only | low | me |
| `AC13` | `key={idx}` while `_id` exists | low | me |
| `AC14` | `TOTAL_STEPS` stale; result wears the Healthier SG badge | low | me |
| `AU25` | A persona without a title crashes the sandbox | low | me |
| `AU26` | `target_doc` — the field that chooses the document — was `String()`-coerced | medium | me |
| `AN14` | `TEAM_DIRECTORY` still ships seven real names and seven work email addresses | medium | me |

**By severity:** 6 critical · 1 high-external · 21 high · 18 medium · 7 low
**By owner:** 43 mine · 10 the owner's

⚠️ **56, not 51.** Five were opened on 2026-08-23 **after** this document was written, and
none renumbers anything:

| Id | Opened by |
|---|---|
| `AU25` | the go-live gate, walking the README's demo script |
| `AC15` | fixing `AC1` and asserting the result against the **other pathway's** table |
| `AU26` | review of the first fix batch — `target_doc` left to `String()` coercion |
| `AU27` | review of the second — the `isDemo` guard on one of three write sites |
| `AU28` | being asked whether the prompts had been revised — `personas.js` had never been read |
| `AN14` | fixing `AN1` — `STAFF_PROFILES` was one of **two** copies |

⚠️ **Three of the five were found in the fixes, not in the original audit.** That is the
honest shape of this work and it is worth stating rather than smoothing: reviewing a fix
found more than auditing the code did.

---

# §7 · The roster engine — the bridge, not the absorption

`auraEngine.js` and `rosterEngineV2.js` carry the AURA name and contain **no AI**. They are
a deterministic constraint solver: grade bands, FTE, skills, unavailability, hours policy,
rules. Same inputs, same roster, every time.

**Their post-mortem already exists and is not merged here.**

| Document | Ids | Why it stays separate |
|---|---|---|
| [`ROSTER_POSTMORTEM.md`](ROSTER_POSTMORTEM.md) | `A`–`E`, `A-RC` | **Released CHANGELOG entries cite these by number** — *"post-mortem D3"*, *"A-RC1"*. Renumbering breaks the citations. |
| [`ROSTER_QC_AUDIT.md`](ROSTER_QC_AUDIT.md) + 3 companions | `M` | Cited the same way — *"audit M6"*. |
| [`ROSTER_TODO.md`](ROSTER_TODO.md) | `P`, `T` | The live plan for that surface. |
| [`ROSTER_HANDOFF.md`](ROSTER_HANDOFF.md) | `Q` | Already titled *"AURA Roster — Handoff"*. |

`IDS.md` rule 1: *"A number is never reused. Not across a renumber, not after an item
closes. The alternative is the `D` problem, and one instance of it in a document set is
enough."*

**The one finding that joins the two halves is `AU1`** — that a deterministic solver and an
LLM agent share a name, and the README describes both as AI. Fixing `AU1` is largely a
documentation change, and it is the thing that lets the roster be assessed as software.

If you want them genuinely merged, say so and I will do it as an explicit renumber with a
full old→new mapping table, and update every citation in `CHANGELOG.md`.

---

# §8 · What this does not cover

- **`SmartReportView.jsx`** (391 lines) — how an archived report is rendered and who reaches
  it — was not read.
- **The dashboard's derived metrics in `App.jsx`** beyond the Individual Clinical Load
  listener fixed earlier this week.
- **Accessibility beyond live regions.** Focus management, keyboard order and contrast on
  the chat surface and quick-reply chips were not examined. `AC12` is not the whole of it.
- **`ConventionalForm.jsx`** except where it parses PAVS and selects a CTA.
- **No live traffic, no deployed-function testing, no real device.** Everything is from
  source plus probes replicating source expressions verbatim. Three things only logs can
  answer, and all three change how urgent something is:
  1. **How often anybody types instead of tapping** in the chat — it decides whether `AC1`
     and `AC2` are theoretical or routine. `community_assessments` holds it.
  2. **Whether `generateSmartAnalysis` has ever been called by anything but the app** —
     `AN4` is the one finding here somebody outside SingHealth could already have used.
  3. **Whether MODE 3 has ever written a zero** — `AU2` could be a daily occurrence or have
     never fired.
- **Model output quality is not assessed.** Whether AURA's coaching is *good* is a clinical
  question, not a code question.
- ⚠️ **THE PROMPTS THEMSELVES HAVE NOT BEEN REVISED, AND `personas.js` WAS NOT READ UNTIL
  `AU28`.** `AURA_SYSTEM_PROMPT` and `SMART_ANALYSIS_SYSTEM_PROMPT` are **unchanged since
  2026-04-17** — four months, predating the entire multi-team migration, which is why `AU7`
  briefs the model on collections that no longer exist. The findings above are about the
  plumbing AROUND the prompts: what the model is allowed to write, who may call it, what
  happens to what it returns. **AURA largely IS its prompts**, and revising them is a separate
  piece of work with no test suite behind it — a changed system prompt shifts behaviour in
  ways nothing in this repository can catch. Open prompt items: `AU7` `AU8` `AU19` `AU20`
  `AU28` `AN5` `AN7` `AN12`, plus `SMART_ANALYSIS_SYSTEM_PROMPT`'s hardcoded *"for
  KKH/SingHealth"*, which is wrong for every team but the first.
