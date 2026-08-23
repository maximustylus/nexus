# AURA — post-mortem

**Subject:** AURA, the AI in NEXUS. Not the roster engine that shares its name — or
rather, *both*, because the fact that they share a name is the first finding.

**Date:** 2026-08-23 · **Against:** `main` at `954d8c0` + branch `claude/nexus-aura-rostering-session-duo1q5`
· **Version:** v2.1.0, functions header `v1.53`

**Companion documents:** [`ROSTER_POSTMORTEM.md`](ROSTER_POSTMORTEM.md) ·
[`POSTMORTEM-COMMUNITY.md`](POSTMORTEM-COMMUNITY.md) · id legend in [`IDS.md`](IDS.md)

---

## The evidence rule, inherited and not softened

Every finding below carries **real output** — a file and line, a grep, or a probe that
was run. Where I ran something, the output is pasted. Where I am reasoning from code I
read, I say so. *"It looks like"* is not evidence, and this document set has been
burned by it before: `COMMUNITY_TODO.md`'s own ledger rule exists because a row was
once marked `DONE` on the strength of an edit.

**New id series: `AU`n.** `A` already means three things in this repository and `AI`
would read as a fourth. `AU` is registered in `IDS.md` in the same commit, per that
file's rule 2.

---

## ⚠️ Read this first

**Nothing in this document has been fixed.** It is a finding list, not a change log.
Two of the findings — `AU2` and `AU6` — are live defects a staff member can hit today
by using the feature exactly as the README instructs.

**AURA is not one system.** It is *five* surfaces plus a deterministic algorithm that
borrowed the name:

| Surface | What it is | Model |
|---|---|---|
| `chatWithAura` | the staff assistant — four modes, database writes, wellbeing assessment | Gemini, resolved at runtime |
| `generateSmartAnalysis` | department analysis, private/public split | Gemini, temp 0.2 |
| `processFeedPost` | feed post handling | Gemini, temp 0.2 |
| `communityAck` | the public screening acknowledgement | Gemini, temp 0.7, 200 tokens |
| `demoAura.js` | the sandbox — deterministic, local, no network | **none** |
| `auraEngine.js` / `rosterEngineV2.js` | **the roster generator** | **none — this is not AI at all** |

---

# §1 · The name

## `AU1` — "AURA" names an LLM agent and a deterministic solver, and the README sells both as AI · severity: **high (external)**

`README.md:3` carries two badges side by side:

```
![Tech](…badge/AI-Gemini%20Powered-purple) ![AURA](…badge/AURA-v2.3%20Engine-blue)
```

`README.md:7`:

> At its core lies **AURA** (Adaptive Understanding and Real-time Analytics), a
> proprietary, autonomous AI agent … AURA does not just read data; it actively
> interprets cognitive load, negotiates scheduling conflicts, executes database
> mutations, and mitigates burnout risk.

Three things are wrong at once, and they matter more now than they did last month:

1. **"Proprietary" is false.** The model is Google's Gemini, reached over REST with a
   system prompt (`functions/index.js:377`). What is proprietary is the prompt and the
   scaffolding, which is a real thing to own — but it is not the model.
2. **The roster engine is not AI.** `generateRosterV2` is a deterministic constraint
   solver: grade bands, FTE, skills, unavailability, hours policy. Same inputs, same
   roster, every time. That is a *strength* — it is auditable, explainable and
   reproducible, which is exactly what a rostering system handed to a governance body
   needs to be. Calling it AI throws that away and invites the wrong review.
3. **"Autonomous … executes database mutations" contradicts `README.md:171`** in the
   same file:

   > **Workload Commit Verification:** AURA can format database writes, but requires a
   > human-in-the-loop physical click to execute the final `setDoc` function.

   The second sentence is the accurate one. The first is the one a reader quotes.

**Why this is the lead finding rather than a documentation nit.** Melissa Chua's ICT
survey asks what rostering solution is in use. If NEXUS is described as an *AI* roster
generator, the questions that follow are about model governance, explainability and
clinical AI assurance — a review the roster engine does not need and would struggle to
pass on the strength of a badge. If it is described accurately — *a deterministic
scheduling engine, with a separate Gemini-backed assistant beside it* — the roster is
assessed as software and the assistant is assessed as AI, which is what each one is.

**The honest one-line description:** *NEXUS contains a deterministic rostering engine
(no AI) and a Gemini-backed staff assistant (AURA) which does not touch the roster.*

---

# §2 · What the model is trusted to write to the database

`AURA_SYSTEM_PROMPT` MODE 3 (`functions/index.js:238-256`) instructs the model to act
as *"a safe database gateway"* and emit a `db_workload` object naming a collection, a
document, a field and a value. `AuraPulseBot.executeDataEntry` (`:729`) executes it on
a button press.

The client **has** been hardened, and the comment at `:734` documents it honestly: the
collection is an allowlist of two, the person is resolved through the member list, and
the paths are team-scoped. That work is real and it closed the worst of it.

What follows is what the hardening did not reach.

## `AU2` — `target_value: null` writes a zero, and reports success · severity: **critical**

The prompt's own schema (`functions/index.js:275`) declares the field nullable:

```
'     "target_value": <number | null>',
```

`AuraPulseBot.jsx:800` and `:812` consume it with a bare `Number()`. The month beside
it *is* guarded (`:794`). The value is not.

Probe output, replicating both expressions verbatim:

```
--- B. executeDataEntry: Number(target_value) at :800 / :812 ---
  target_value=35            -> Number() = 35       guarded? finite
  target_value=null          -> Number() = 0        guarded? finite
  target_value=undefined     -> Number() = NaN      guarded? NOT FINITE
  target_value=              -> Number() = 0        guarded? finite
  target_value=thirty five   -> Number() = NaN      guarded? NOT FINITE
  target_value={}            -> Number() = NaN      guarded? NOT FINITE
  target_value=[]            -> Number() = 0        guarded? finite
  target_value=1e999         -> Number() = Infinity guarded? NOT FINITE
  target_value=true          -> Number() = 1        guarded? finite

--- C. the month guard at :793, for comparison ---
  target_month=12         -> REFUSED
  target_month=null       -> REFUSED
  target_month=January    -> REFUSED
```

So a model that emits the `null` its own schema permits overwrites that month's
patient load with **0**, and the user is told:

> ✅ Database updated successfully.
> Logged 0 patients for January.

`""` and `[]` do the same. `undefined`, a word, or an object write **NaN** into an
array of monthly patient counts.

**The asymmetry is the tell.** Somebody thought carefully about the month and did not
think about the value, in adjacent lines. This is not a hard fix — `Number.isFinite`
and a range — but it is unguarded today on a path whose whole purpose is writing
numbers.

## `AU3` — `target_field` is model-chosen, and nothing constrains it · severity: **high**

`AuraPulseBot.jsx:812`:

```js
await setDoc(docRef, {
    [workload.target_field]: Number(workload.target_value),
    …
}, { merge: true });
```

The prompt says the field is `patient_attendance` OR `patient_load`. Nothing enforces
that. The collection got an allowlist; the field did not. And the rule offers no
backstop:

```
      match /workload/{period} {
        allow read: if false;
        allow create, update: if isLead(teamId);
        allow delete: if false;
      }
```

No `changedKeys().hasOnly(...)`, unlike the membership rules elsewhere in the same
file. A lead may write **any key** to that document, and the key comes from the model.

## `AU4` — the document id is model free-text with no validation · severity: **medium**

`teamPaths.js:345`:

```js
export const workloadPath = (teamId, period) => under(teamId, TEAM_COLLECTIONS.workload, period);
```

Compare the line immediately below it, `reportPath`, which calls `assertYear(year)`;
and `rosterPath` (`:284`), same. `workloadPath` alone takes its segment raw, and
`AuraPulseBot.jsx:783` feeds it `rawTarget` — a string the model produced. `under()`
(`:272`) filters only `undefined`.

## `AU5` — MODE 3's team branch writes to a collection nothing reads · severity: **high**

The rule above says `allow read: if false`, and its own comment says *"Nothing reads it
today"*. Verified across the whole client:

```
$ grep -rn "workloadPath\|loadPath" src --include=*.jsx --include=*.js | grep -v test | grep -v teamPaths.js
src/components/StaffLoadEditor.jsx:6,27,56      loadPath
src/components/AuraPulseBot.jsx:22,23,781,783   loadPath, workloadPath
src/components/AdminPanel.jsx:17,245            loadPath
src/App.jsx:55,391                              loadPath
```

**`workloadPath` has exactly one call site, and it is a write.** Zero readers.

So a roster master who tells AURA *"log 4,200 attendances for the department in
January"* is told **"✅ Database updated successfully"** and the figure enters a store
no screen can display and the rules forbid reading. It is not lost, but it is not
retrievable by the application either.

## `AU6` — MODE 3's personal branch cannot work as instructed · severity: **high**

A three-way key mismatch, each link verifiable:

| Step | What it says | Where |
|---|---|---|
| The prompt tells the model the user's id | `` `System Note: The user's exact database ID is '${user?.id}'.` `` | `AuraPulseBot.jsx:326` |
| `user.id` is now a **uid** | `id: authUser.uid` | `NexusContext.jsx:35,47` |
| MODE 3 tells the model to use it as `target_doc` | `'- target_doc: The exact database ID provided in the System Note (e.g., "alif")'` | `functions/index.js:252` |
| The client resolves `target_doc` by **display name** | `memberUidByName[rawTarget]` | `AuraPulseBot.jsx:777` |
| …which is keyed by `displayName` | `map((person) => [person.displayName, person.uid])` | `TeamContext.jsx:253` |

A model that obeys its instructions returns the uid. `memberUidByName["<uid>"]` is
`undefined`. The user is told:

> There is nobody called "`<uid>`" in this team. Nothing was saved.

**The feature works only when the model ignores the System Note** and emits a display
name instead. That it appears to work at all is the model being helpful, not the code
being right — and it is the least reliable possible foundation, because the next model
resolution (`AU16`) can change that behaviour with no code change.

## `AU7` — the prompt's schema is a pre-migration fossil · severity: **medium**

`functions/index.js:245-253` still tells the model:

```
- target_collection: "monthly_workload"
- target_doc: The timeframe formatted as "mmm_yyyy"
- target_collection: "staff_loads"
- target_doc: The exact database ID provided in the System Note (e.g., "alif")
```

`monthly_workload` and `staff_loads` were top-level collections **before** the v2.0
multi-team migration. They are now `teams/{teamId}/workload/{period}` and
`teams/{teamId}/loads/{uid}`. `firestore.rules` has no top-level match for either, so
they fall to `{unmatched=**}` and are denied.

The client translates the old names to the new paths, so this does not break — but the
model is being briefed on a schema that no longer exists, and the example `"alif"` is a
directory id that is now neither a uid nor a display name. `AU6` is the bill for that.

---

# §3 · What the model is trusted to say about a person

## `AU8` — "diagnosis_ready" is decided by turn count · severity: **high**

`functions/index.js:340`:

```js
var diagnosisReady = turnIndex >= 4;
```

Four turns in, the server instructs the model to *"provide full Phase/Energy/Action
assessment now"* (`:348`) — regardless of what was said. The gate is conversation
length, not content. Somebody who typed "hi" four times reaches the same instruction as
somebody who described a fortnight of insomnia.

The field is called **`diagnosis_ready`**, and the phases are `HEALTHY / REACTING /
INJURED / ILL` — the Mental Health Continuum. Whatever the intent, a field named
*diagnosis* on a staff wellbeing record in a hospital is a word that will be read
literally by somebody eventually.

## `AU9` — `clampEnergy` silently overrules the model, and lets `NaN` through · severity: **high**

`AuraPulseBot.jsx:72` forces the number into the phase's band. Probe output:

```
--- A. clampEnergy: what reaches the wellbeing record ---
  phase=ILL       energy=90        -> written: 19     (model says exhausted but scores 90)
  phase=HEALTHY   energy=5         -> written: 80     (model says healthy but scores 5)
  phase=ILL       energy=undefined -> written: 19     (energy omitted -> `?? 50` at :365)
  phase=REACTING  energy=null      -> written: 50
  phase=ILL       energy=NaN       -> written: NaN
  phase=Bananas   energy=200       -> written: 100    (phase the model invented)
  phase=Bananas   energy=NaN       -> written: NaN
```

Two separate problems:

- **Disagreement is resolved invisibly.** When the model's phase and its number
  contradict each other — a genuine signal that the turn was ambiguous — the number is
  bent to fit and nothing is logged. `HEALTHY, 5` becomes `HEALTHY, 80`. The one
  artefact that would have said *"this assessment is unreliable"* is destroyed in the
  act of storing it.
- **`NaN` passes straight through.** `?? 50` catches `null` and `undefined`, not `NaN`.
  It reaches `logData` and then `arrayUnion(logData)` into
  `teams/{id}/wellbeing/{uid}` (`:462`) — the most sensitive collection in the project.

## `AU10` — a phase the model invented is persisted as fact · severity: **medium**

`clampEnergy`'s `if (!cfg)` branch (`:74`) accepts any string. `AuraPulseBot.jsx:367`
then writes `analysis.phase.toUpperCase()` to `users/{uid}.aura_last_phase` and onto the
team pulse board. `getPhaseConfig` (`:67`) renders an unknown phase with a `⬜` and the
raw label, so it appears on the board looking like a category.

## `AU11` — the model's own output is persisted and fed back as memory · severity: **medium**

`confirmLog` writes `aura_memory: pendingLog.action` — the model's free-text assessment
summary — to `users/{uid}` (`:465`). It returns as `liveMemory` and re-enters the next
prompt (`:329`):

```js
liveMemory ? `Prior session note: "${liveMemory}".` : 'This is their first session with AURA.',
```

and is read back to the person verbatim in the greeting (`:206`):

> Welcome back, {firstName}. Last time we spoke, I noted: "{liveMemory}". …

Nothing between generation and re-injection validates it. A summary that misremembers
what somebody said becomes durable context, is quoted back to them as their own words,
and shapes every later turn.

## `AU12` — the pulse board is still keyed by display name · severity: **high**

`AuraPulseBot.jsx:463`:

```js
await setDoc(doc(db, ...pulsePath(teamId, PULSE_PERIOD_DAILY)), { [user.name]: heatmapPayload }, { merge: true });
```

`firestore.rules`'s own header calls display-name keying the root problem and says
*"The only durable fix is to stop keying documents by display name."* The v2.0
migration moved everything to uid — the comment six lines below this one, at `:459`,
is itself about that fix. **This line was not converted.** Two clinicians with the same
display name in one department overwrite each other's wellbeing status on the board,
and `merge: true` means the second one silently wins.

## `AU13` — random anonymous keys, and a ledger claim that no longer holds · severity: **low**

`AuraPulseBot.jsx:451`:

```js
const heatKey = `Anon_${Math.floor(Math.random() * 9999)}`;
```

Collision-prone within a day's document. More interesting is what checking it turned
up. `COMMUNITY_TODO.md` §4.6 marks `CP12` `DONE` with this evidence:

> `getSessionId()` · `grep Math.random src/components/` returns nothing

```
$ grep -rn "Math.random" src/components/ | grep -v "\.test\."
src/components/AuraGreeting.jsx:33:    return defaults[Math.floor(Math.random() * defaults.length)];
src/components/AuraPulseBot.jsx:451:                const heatKey = `Anon_${Math.floor(Math.random() * 9999)}`;
```

**The fix held** — neither hit is a session id, and `getSessionId()` is real. **The
evidence string does not.** It was written scoped to session ids and recorded as an
unscoped grep, and it is now false as written. Both surviving hits are AURA's, which is
why it surfaced here and not in the community audit.

---

# §4 · Cost, abuse and the model itself

## `AU14` — the ceilings are on the cheap endpoint, not the expensive one · severity: **high**

```
$ grep -n "rateLimit\|enforceAppCheck" functions/index.js
825:const rateLimit = require('./rateLimit');
866,872,882,887,893:  (all inside communityAck)
931:    enforceAppCheck: ENFORCE_APP_CHECK,      (communityAck)
962:            rateLimit.refusalMessage(…)      (communityAck)
```

Every guard is on `communityAck`. Compare the two:

| | `communityAck` | `chatWithAura` |
|---|---|---|
| Rate limit | ✅ 300/600 per caller/hr, 6000 global | ❌ none |
| App Check | ✅ shipped (inert pending console) | ❌ none |
| Max output tokens | 200 | **8192** |
| Timeout | 20s | 90s fetch / 120s function |
| Model | resolved | prefers **`gemini-2.5-pro`** |
| Attachments | ❌ refused | ✅ up to 5, multimodal |
| Caller-supplied prompt | ❌ refused | ✅ up to 8000 chars |

`CP7` was excellent work aimed at the public endpoint, because that is where the audit
was looking. **The cost lives on the other one.** Any authenticated account — anyone on
an allowlisted hospital domain who registers — can call `chatWithAura` in a loop with
five attachments at 8192 output tokens on the most expensive model in the priority
list, unbounded, on the project's billed key.

The auth check (`:328`) is a real and recent improvement. It bounds *who*, not *how
much*.

## `AU15` — attachments have no size cap and no type allowlist · severity: **high**

`validateChatInput` (`:126-137`) checks that `attachments` is an array of at most 5 and
that each has `mimeType` and `data` present. It does not check the **size** of `data`,
and it does not check `mimeType` against anything — the declared type is passed
straight to Gemini (`:366`).

The author knew the pattern: `validateAnalysisInput` thirty lines below has
`MAX_JSON_CHARS = 8000` and enforces it on a serialised payload. The chat path has no
equivalent.

## `AU16` — a transient failure silently pins the cheapest model for the container's life · severity: **medium**

`resolveModel()` (`functions/index.js:44`) memoises in a module-level promise. Trace
the three ways it can end:

```js
if (!response.ok) { logger.warn(…); return SAFE_FALLBACK_MODEL; }   // ← promise NOT reset
…
logger.warn('[NEXUS] No priority model matched. Using fallback.');   // ← promise NOT reset
} catch (e) { …; modelResolutionPromise = null; }                    // ← reset
return SAFE_FALLBACK_MODEL;
```

Only a thrown error clears the cache (and, separately, a 404 at `:397`). A **429 or a
503** on the very first call of a cold container resolves to `gemini-1.5-flash` and
**pins it for the lifetime of that container** — potentially hours — with a single
`logger.warn` and nothing visible anywhere.

The consequence is not only quality. The same question asked twice can be answered by
`gemini-2.5-pro` on one container and `gemini-1.5-flash` on another, with no record on
the response of which one answered. For a surface that emits database writes and
wellbeing classifications, *which model produced this* is not a detail — and it is not
recorded on the artefact.

## `AU17` — the PDPA control is a sentence in the README · severity: **high**

`README.md:167`:

> **PDPA Compliance:** Do not upload sensitive patient data or PHI. NEXUS tracks
> operational load, not patient records. AURA does not have EMR access. Use
> placeholders exclusively (e.g. `[Patient]`, `[Clinician]`).

*"AURA does not have EMR access"* is true. Everything else here is an instruction to
the user, not a control on the system. The same endpoint accepts five arbitrary files
of arbitrary size and arbitrary declared type (`AU15`) and forwards them to Gemini.
There is no scan, no type restriction, no size bound, no warning at the point of
attachment, and no log of what was sent.

This is the finding most likely to matter if NEXUS is named to the cluster ICT. Not
because something has gone wrong, but because *"we tell staff not to"* is the answer a
governance reviewer is least able to accept, and it is the honest description of the
current control.

---

# §5 · Structure, tests and claims

## `AU18` — the response parser exists twice, verbatim · severity: **medium**

Server, `functions/index.js:184-192`:

```js
const stripped   = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
const jsonStart  = stripped.indexOf('{');
const jsonEnd    = stripped.lastIndexOf('}') + 1;
```

Client, `AuraPulseBot.jsx:342-346`:

```js
const stripped = raw.replace(/```json|```/g, '').trim();
const start    = stripped.indexOf('{');
const end      = stripped.lastIndexOf('}') + 1;
```

`chatWithAura` returns `result.text` — the extracted JSON **string** (`:207`, `:413`) —
so the server parses, validates, discards the parsed object and hands back a string for
the client to parse again with its own copy of the same fragile logic. This is the same
shape as `CP16` (two resource registries) and `P4.2` (two copies of `selectCTA`), both
already on the community ledger.

## `AU19` — "requiredFields" requires nothing · severity: **medium**

`functions/index.js:201-205`:

```js
for (const field of requiredFields) {
    if (!(field in parsed)) {
        logger.warn('[NEXUS] Response missing required field: ' + field);
    }
}
```

It warns and returns the response anyway. And the list passed by `chatWithAura`
(`:412`) is:

```js
['reply', 'mode', 'diagnosis_ready', 'phase', 'energy', 'action']
```

**`db_workload` is not in it** — the one field that leads to a database write is not
among the fields the non-enforcing check does not enforce.

## `AU20` — two internal project names are hardcoded into a deployed shared function · severity: **low**

`functions/index.js:357`:

```js
var isStrictFormatting = prompt.indexOf('Project HUGE') !== -1 || prompt.indexOf('Magnify Mama') !== -1;
var dynamicTemperature = isStrictFormatting ? 0.1 : 0.7;
```

Two named projects decide the sampling temperature for everybody. Every other caller
gets **0.7** — a creative-writing temperature — including the turns that emit database
write instructions and wellbeing phase classifications. `generateSmartAnalysis` and
`processFeedPost` both use 0.2.

## `AU21` — upstream error text is forwarded to the client, in jargon · severity: **low**

`functions/index.js:422`:

```js
throw new HttpsError('internal', 'Neural Link Unstable: ' + error.message);
```

`error.message` here can be the Gemini API's own error string (`:407`). Two problems, one
security-adjacent and one human: upstream detail reaches the browser, and a clinician is
shown *"Neural Link Unstable"* when what happened is that a request failed. The client's
own fallback (`:377`) says the same thing.

## `AU22` — the sandbox never shows the data-entry card the README tells you to test · severity: **medium**

`demoAura.js:131` claims:

> One demo reply, **in the shape `AuraPulseBot` already parses.**

and `:145`:

> The live MODE 3 writes through the client; **the demo shows the same card** …

Probe, running the real module against the real render gate from `AuraPulseBot.jsx:1093`:

```
demo db_workload  = {"value":35,"period":"demo","written":false}
mode              = DATA_ENTRY
DATA_ENTRY card renders in sandbox? -> false
```

The gate requires `m.db_workload.target_collection`. The demo emits `value` / `period` /
`written`. The card cannot render. `README.md:186` says:

> **The Data Entry Test:** Tell AURA, "I saw 145 patients in June." She should parse the
> numbers and display a green `DATA_ENTRY` block with a button to push to Firestore.

In Demo Mode — the mode a stakeholder is walked through — no block appears. Note that
`COMMUNITY_TODO.md` P0.2's evidence lists which cards still work (*"the mode badge, the
document-export card and the wellbeing-log prompt"*) and correctly does **not** include
this one. So the gap was known at the ledger and the module's own comment contradicts it.

## `AU23` — the README describes a codebase that has moved · severity: **medium**

| Claim | Reality |
|---|---|
| `README.md:89` lists `auraChat.js` | **Deleted** — `COMMUNITY_TODO.md` P0.6: *"`src/utils/auraChat.js` deleted outright"*. `ls` confirms MISSING. |
| `README.md:81` lists `personas.js` under `utils`/`data` | It is at `src/config/personas.js` |
| `:7` "autonomous … executes database mutations" | `:171` in the same file: "requires a human-in-the-loop physical click" |
| `:265` "Enabled AURA to … independently execute peer-to-peer shift swap matrix rewrites" | `:18` already carries a 2026-08-15 correction saying that surface was removed in v1.10.0. **The correction was applied to one line and not the other.** |
| `:186` "**She** should parse the numbers" | AURA is gendered in user-facing documentation, inconsistently with every other reference |

The 2026-08-15 corrections in this file are good practice and worth keeping. The point
is that a correction applied to the feature section and not to the changelog leaves the
false claim in the half people quote from.

## `AU24` — the two functions deciding what the model may do are untested · severity: **high**

```
$ grep -rn "executeDataEntry\|clampEnergy" src --include=*.test.jsx --include=*.test.js
(no output)
```

Against a suite of **2744 tests across 73 files**. `executeDataEntry` decides what a
language model is permitted to write to a clinical-adjacent database; `clampEnergy`
decides what number enters a staff wellbeing record. Neither has a single test.

`demoAura.test.js` (20 tests) covers the deterministic sandbox thoroughly. `Aura.hooks.test.js`
has 32. The coverage is real — it is simply not on the two functions that matter most,
which is how `AU2` and `AU9` survived.

---

# §6 · What held

A post-mortem that lists only failures is a misleading document. These were checked and
are right:

| | |
|---|---|
| **`chatWithAura` is staff-only** | `:328` refuses a caller with no `request.auth`. The comment at `:311` explains what had to be true first, and both things genuinely were. This closed a real hole. |
| **The collection allowlist** | `:766` — two values, hardcoded, refused otherwise. The comment at `:734` describes the previous state accurately rather than flatteringly. |
| **People are resolved through the member list** | `:777` — a name the model invents resolves to nothing and is refused, instead of creating a document for a colleague who does not exist. |
| **The sandbox writes nothing** | `:445` and `:756`. Demo mode used to append to real wellbeing data; it cannot now, and the ordering of the `isDemo` / `teamId` checks was deliberately fixed so the refusal names the right reason. |
| **Chat history is in-memory only** | `NexusContext.jsx:12` — `useState`, not `localStorage`. On a shared clinic terminal that is the correct choice, and it matches the community portal's deliberate `sessionStorage` decision (`CP12` §4.4). |
| **The month guard** | `:794` — correct, complete, refuses every bad input tested. It is only notable because the value beside it has none. |
| **`communityAck` as a whole** | Separate prompt, no caller-supplied prompt, closed-set validation, rebuilt `priorAnswers`, rate limited, App Check ready. It is the model for what `chatWithAura` should look like. |
| **The nudge schedule matches its documentation** | `'0 9 * * 1-5'`, `Asia/Singapore` (`:504`) against README `:22`. Checked because the surrounding claims were wrong; this one is right. |

---

# §7 · The ledger

Severity is about consequence, not effort.

| Id | Finding | Severity | Owner |
|---|---|---|---|
| `AU2` | `target_value: null` writes 0 and reports success | **critical** | me |
| `AU1` | AURA names an LLM and a solver; README sells both as AI | **high (external)** | **owner** |
| `AU3` | `target_field` model-chosen, no allowlist, no rule backstop | high | me |
| `AU5` | MODE 3 team branch writes to a collection with no readers | high | **owner** — decide whether it should have one |
| `AU6` | MODE 3 personal branch cannot work as instructed | high | me |
| `AU8` | `diagnosis_ready` gated on turn count, not content | high | **owner** — clinical |
| `AU9` | `clampEnergy` overrules the model silently; `NaN` reaches Firestore | high | me |
| `AU12` | Pulse board still keyed by display name | high | me |
| `AU14` | Rate limit and App Check on the cheap endpoint only | high | me |
| `AU15` | Attachments unbounded in size, unrestricted in type | high | me |
| `AU17` | PDPA control is a README sentence | high | **owner** |
| `AU24` | `executeDataEntry` and `clampEnergy` have no tests | high | me |
| `AU4` | `workloadPath` takes an unvalidated segment | medium | me |
| `AU7` | Prompt schema is a pre-migration fossil | medium | me |
| `AU10` | Invented phase persisted as fact | medium | me |
| `AU11` | Model output persisted as memory and re-injected unvalidated | medium | **owner** |
| `AU16` | Transient failure pins the fallback model for the container | medium | me |
| `AU18` | Response parser duplicated server and client | medium | me |
| `AU19` | `requiredFields` only warns; `db_workload` not listed | medium | me |
| `AU22` | Sandbox never shows the data-entry card the README tests | medium | me |
| `AU23` | README stale and self-contradictory | medium | me |
| `AU13` | Random anon keys; `CP12` evidence string now false | low | me |
| `AU20` | Project names hardcoded; temperature 0.7 on write paths | low | me |
| `AU21` | Upstream error text forwarded to the client, in jargon | low | me |

## If only three things get done

1. **`AU2`** — one `Number.isFinite` and a range check. It is the only finding here that
   silently destroys data a clinician entered, and it takes minutes.
2. **`AU14` + `AU15`** — reuse `rateLimit.js`, which already exists and is already
   tested, on `chatWithAura`; add a byte cap and a mimeType allowlist. The expensive
   endpoint is the unguarded one.
3. **`AU1`** — a paragraph, not code. Describing the roster engine as deterministic and
   the assistant as AI is both more accurate and strategically better, and the ICT
   survey is the reason to do it this week rather than eventually.

## What this post-mortem does not cover

- **`generateSmartAnalysis` and `processFeedPost`** were read for model configuration
  only. Their prompts, outputs and consumers have not been audited to the standard
  above, and should not be assumed clean because they are absent here.
- **No live traffic was examined.** Every finding is from source, plus probes that
  replicate source expressions exactly. Nothing here says how often any of it has
  actually happened — `AU2` in particular could be a daily occurrence or have never
  fired, and the logs would tell you which.
- **Model output quality is not assessed.** Whether AURA's coaching is *good* is a
  clinical question, not a code question, and it is not one this document can answer.
