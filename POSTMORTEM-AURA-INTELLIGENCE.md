# AURA Intelligence — post-mortem

**Subject:** the **derived-insight layer** — everything in NEXUS that turns stored
data into an assertion somebody acts on. The README's *"Pillar A: AURA Intelligence
Engine (v2.3)"*.

**Date:** 2026-08-23 · **Against:** branch `claude/nexus-aura-rostering-session-duo1q5` @ `6e6d5ee` · **Version:** v2.1.0

**Companions:** [`POSTMORTEM-AURA.md`](POSTMORTEM-AURA.md) (`AU`n — the AI surfaces) ·
[`POSTMORTEM-AURA-CHAT.md`](POSTMORTEM-AURA-CHAT.md) (`AC`n — the public screening) ·
[`POSTMORTEM-COMMUNITY.md`](POSTMORTEM-COMMUNITY.md) · legend in [`IDS.md`](IDS.md)

**New id series: `AN`n** (**AN**alytics), registered in `IDS.md` in this commit.

---

## Scope, stated plainly

Both earlier post-mortems close with a list of what they do **not** cover. This is
that list:

> *"`generateSmartAnalysis` and `processFeedPost` were read for model configuration
> only. Their prompts, outputs and consumers have not been audited to the standard
> above, and should not be assumed clean because they are absent here."* — `AU`, §7

So: the year-end department analysis, the population rollup, the coverage watcher,
the weekday nudge, and the feed's PDPA guard. Five surfaces that make claims.

**Evidence rule as before** — file, line, grep or probe. Nothing here is fixed.

---

## ⚠️ `AN1` is the most serious finding across all three of these documents

It is not an AI defect. It is six lines of JavaScript, and it undoes a privacy model
that was rebuilt from scratch three days ago.

---

# §1 · The year-end analysis

`SmartAnalysis.jsx` → `generateSmartAnalysis` → a *"detailed clinical report for
department heads"* and a *"positive, encouraging summary safe for all staff"*,
archived to `teams/{teamId}/reports/{year}` and readable by every member of that team.

## `AN1` — six named colleagues and their job grades are in the public bundle · severity: **critical**

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

A module-level constant in a React component. It is therefore in the build:

```
$ grep -oh "Derlinder.\{0,80\}" dist/assets/index-p-7kKpFN.js
Derlinder:{role:"Clinical Exercise Physiologist, CEP II",grade:"JG12",focus:"Education Le…

$ grep -o 'grade:"JG1[0-9]"' dist/assets/index-p-7kKpFN.js | sort | uniq -c
      2 grade:"JG11"    2 grade:"JG12"    2 grade:"JG13"
      2 grade:"JG14"    1 grade:"JG15"    1 grade:"JG16"

$ grep -o 'src="/assets/index-p[^"]*"' dist/index.html
src="/assets/index-p-7kKpFN.js"
```

**One bundle serves every route**, including `/individuals` — the public community
health screening. A member of the public who opens the portal to answer questions
about their own exercise habits downloads, as part of the page, the names, roles and
job grades of six KKH clinicians. No sign-in. No Firestore rule is involved, because
no Firestore read is involved.

### Why this is worse than it looks

This session rebuilt grade privacy from the ground up, and `memberProfile.js` states
the reasoning at length:

> Pay grade is the most sensitive thing somebody volunteers about themselves short of
> the wellbeing log. "The roster needs it" justifies the roster reading it; it does
> not extend to the team browsing it.

What was built on that basis:

| Control | Where |
|---|---|
| Grade moved to its own collection | `teams/{id}/grades/{uid}` |
| `allow get: if isSelf(memberUid) \|\| isLead(teamId)` | `firestore.rules` |
| `allow list: if false` — *even to a lead* | `firestore.rules` |
| `useTeamGrades` — lead-only, one read per member, never in `TeamContext` | `src/hooks/` |
| `useMemberGrade` — one member, only while an editor is open | `src/hooks/` |
| Grade never enters the member-list render | `TeamMembersPanel.jsx` |

Every one of those is correct and every one of them is bypassed by a `const`.
`useTeamGrades`'s header says *"`grep -rn useTeamGrades src/` is the complete list of
places grades can reach, and keeping that list at one entry is the design."* That
sentence is true and the conclusion it invites is false — there is a second door, and
it does not go through Firestore at all.

⚠️ **It is also `TEAM_DIRECTORY` again.** The entire v2.0 multi-team rebuild existed
to delete a hardcoded ten-person team from `src/utils/index.js`, and the plan's own
framing was that *"onboarding one clinician edits **zero** rule files"*. The directory
was removed from `utils/index.js` and from `firestore.rules`. **This copy was never
found**, because nothing greps for a team that is spelled differently.

Note the scale is `JG11`–`JG16`, not the `AH7`–`AH17` the engine uses — a second,
older grade vocabulary, which is part of why it never matched a search.

## `AN2` — every department's analysis is generated over those six people · severity: **critical**

`SmartAnalysis.jsx:97`:

```js
const currentProfiles = STAFF_PROFILES;
const profileArray = Object.values(currentProfiles);
```

Not `members` from `useTeam()`. The component imports `useTeam` and uses it only for
`teamId` (`:41`).

So when a Respiratory Therapy lead at KKH presses **GENERATE ANALYSIS**, the model is
handed Alif, Fadzlynn, Derlinder, Ying Xian, Brandon and Nisa — with grades — plus
*that* team's `yearData` and `staffLoads`, and asked for a wellbeing audit. The report
that comes back names six people from another department.

`handlePublish` (`:145`) then writes it to `teams/{teamId}/reports/{year}`, and:

```
      match /reports/{year} {
        // The AI-generated year-end report. Every member may read it; a lead
        // publishes it.
        allow get: if isMember(teamId);
```

**Every member of the publishing department can then read it.** This is a cross-tenant
disclosure by construction — not a rule that is too loose, but a payload that was never
team-scoped in the first place.

## `AN3` — the team name is hardcoded too · severity: **high**

`SmartAnalysis.jsx:104`:

```js
teamName: "SSMC@KKH CEP Team",
```

`useTeam()` supplies `team.name`. It is not used. The server prompt opens with
`'TEAM IDENTITY: ' + teamName` and `SMART_ANALYSIS_SYSTEM_PROMPT` instructs:

> 1. TARGET IDENTITY: You must identify the specific team or department.
> 2. DOMAIN ADAPTATION: Adapt your analysis to their specific function.

So the model is explicitly told to tailor its clinical framing to a department, and is
given the wrong one — every time, for every team but one. The report is then filed as
that team's year-end report.

## `AN4` — `generateSmartAnalysis` has no authentication check · severity: **critical**

```
$ awk 'NR>=430 && NR<=500 && (/request\.auth/ || /isLead/ || /teamId/)' functions/index.js
(no output)
```

For comparison, in the same file:

| Callable | Auth | Authorization |
|---|---|---|
| `chatWithAura` | ✅ `:330` | — |
| `processFeedPost` | ✅ `:571` | ✅ re-reads team membership |
| `inviteMember` / `removeMember` / `approveLeadRequest` | ✅ | ✅ |
| **`generateSmartAnalysis`** | ❌ **none** | ❌ none |

`cors: true`, no `request.auth` check, `secrets: ['GEMINI_API_KEY']`. It accepts up to
`MAX_JSON_CHARS = 8000` of caller-supplied JSON and returns up to 2,048 tokens of
generated text on the project's billed key.

An anonymous caller cannot extract NEXUS data — they supply their own payload. What
they get is **a free, unmetered Gemini endpoint**. This is precisely the class `CP6`
closed for `publicTriageChat` and the auth check at `:330` closed for `chatWithAura`.
Two of the three were fixed. And unlike `chatWithAura`, this one is not covered by
`rateLimit.js` either (`AU14`), so there is no ceiling of any kind.

## `AN5` — the output budget is smaller than the smallest output requested · severity: **high**

`functions/index.js:456-457` asks for:

```
- "private": A detailed clinical report for department heads (1000-2000 words).
- "public":  A positive, encouraging summary safe for all staff (200-500 words).
```

`:474`:

```js
maxOutputTokens:  2048,
```

At roughly 1.3 tokens per English word, the request is **1,560 tokens at its floor and
about 3,250 at its ceiling**, before JSON syntax and escaping. The budget is 2,048.

The bottom of the range is marginal; the top is 60% over. The model must either
self-truncate — silently returning a shorter report than the prompt specifies, with
nothing on screen saying so — or run out mid-string, at which point
`parseJsonResponse` throws *"AI returned malformed JSON. Please retry."* and a retry
hits exactly the same ceiling.

## `AN6` — the screen promises five minutes; the call is abandoned at thirty seconds · severity: **medium**

| | |
|---|---|
| `SmartAnalysis.jsx:14` | `httpsCallable(functions, 'generateSmartAnalysis', { timeout: 300000 })` |
| `SmartAnalysis.jsx:100` | `setStatus('Connecting to Neural Link (This may take up to 5 minutes)...')` |
| `functions/index.js:430` | `onCall({ cors: true, secrets: [...] })` — no `timeoutSeconds`, so **60s** |
| `functions/index.js:463` | `signal: AbortSignal.timeout(30000)` |

The model call is aborted at **30 seconds**. The user is told five minutes. Combined
with `AN5` — a prompt asking for up to 2,000 words — a long generation is exactly the
case most likely to hit that abort, and the user will have been told to expect ten
times the wait that is actually available.

## `AN7` — a model decides what is "safe for all staff" · severity: **high** · owner

The prompt asks for a `public` field *"safe for all staff"* and a `private` field for
department heads. Nothing between the model and the screen checks that the split held —
no name detection, no diff against the private text, no review step. `handlePublish`
writes both to Firestore in one `setDoc` (`:154`).

The `private` sample in the demo data (`:82`) shows what the private register looks
like: *"Peter (JG11) is experiencing severe scope creep and burnout risk"* — named
individual, grade, burnout assessment. If a real run puts a sentence of that shape in
`public`, it is published to the whole department and nothing catches it.

This is a **decision**, not a bug: an LLM performing a confidentiality split on staff
wellbeing content is a design the owner may accept with a human review step in front of
it. It is filed here because there is currently no such step and nothing records that
the choice was made.

## `AN8` — a missing field renders as the report · severity: **low**

`functions/index.js:488-489`:

```js
private: result.parsed.private || result.parsed.PRIVATE || 'No private report generated.',
public:  result.parsed.public  || result.parsed.PUBLIC  || 'No public report generated.',
```

`parseJsonResponse`'s `requiredFields` only warns (`AU19`), so a response missing
`public` reaches the client as the literal string *"No public report generated."* —
which `SmartAnalysis.jsx:237` renders in the report pane, and `handlePublish` will
happily archive as that year's public summary.

---

# §2 · The population rollup

`buildCommunityInsights` → `community_insights/latest` → `CommunityInsightsPanel`.

`CP23`, `CP25` and `P7.2`–`P7.4` did substantial work here and it holds: only documents
with a `flags`/`payload` object are counted, and no breakdown cell is published below
`MIN_CELL`. That work is not re-litigated.

## `AN9` — the suppression floor is the only control, and it is not in the rules · severity: **medium**

```
    match /community_insights/{period} {
      allow read: if isSignedIn();
      allow write: if false;
    }
```

Any signed-in account — in any team, in any department, across the whole cluster as it
onboards — reads the national rollup. That is defensible for suppressed counts, and
`write: if false` is right.

The finding is the **absence of a second line**. `CP5` closed
`community_assessments` to `if false` precisely because *"every signed-in staff member
could read the public's health records"*, and the ledger warns that reopening it *"just
for the dashboard"* would be that defect returning with a chart attached. The dashboard
was built instead on a rollup whose entire privacy guarantee lives in
`functions/insights.cjs` — application code, on a schedule, with no rule that could
refuse a document if the suppression ever regressed.

The rule cannot express small-cell suppression, so this is not a fix so much as a risk
to state: **if `insights.cjs` ever publishes an unsuppressed cell, every signed-in user
in the cluster reads it, and nothing else in the system says no.** The test that walks
the document and fails on any readable count under the band is doing the whole job.

---

# §3 · The weekday nudge

## `AN10` — the nudge silently stops working past 500 users · severity: **high**

`functions/index.js:524-533`:

```js
var message = { notification: {…}, data: {…}, tokens: tokens };
await messaging.sendEachForMulticast(message);
```

`sendEachForMulticast` accepts **at most 500 tokens per call**. There is no chunking.
`tokens` is built from every user document in the system with an FCM token (`:513`).

Past 500 registered users the call fails — and the failure lands in:

```js
} catch (error) {
    console.error('[NEXUS] Critical error sending pulse nudge:', error);
    return null;
}
```

A log line in Cloud Logging, and nothing else. Nobody receives a nudge, no alert fires,
and the symptom — *"the check-in reminder stopped"* — is indistinguishable from people
having turned notifications off.

**500 is not a distant number for this system.** The stated target is 28 allied health
professions across the cluster. The wellbeing nudge is the feature most directly aimed
at the thing NEXUS says it exists for, and it is the one that breaks first at scale,
quietly.

## `AN11` — one global nudge, no team scoping · severity: **medium**

The query is `db.collection('users').where('fcmToken', '!=', null)` — the whole
collection, no `teamIds` filter. Every user of every department receives identical copy
at 09:00 Singapore time on the same weekdays.

Under one team that is correct. Under twenty-eight it means a department cannot choose
its own time, cannot opt out as a department, and cannot word its own prompt — and a
service running nights or weekends gets a Monday-morning office nudge. The only control
is a per-user `notificationsEnabled` flag.

---

# §4 · The PDPA guard

## `AN12` — a compliance gate implemented only as a model classification · severity: **medium** · owner

`processFeedPost`'s prompt (`functions/index.js:~589`):

> You are the NEXUS Feed Curator and PDPA Compliance Officer for a Singapore hospital.
> STEP 1: COMPLIANCE CHECK (PDPA/PHI/Toxicity)
> If the post contains patient names, NRIC/FIN, specific ward/bed identifiers linked to
> diagnoses, or toxic/unprofessional rants, REJECT IT.

There is no deterministic backstop. An NRIC/FIN is one of the most regular identifiers
in Singapore — a letter, seven digits, a checksum letter — and a regex would catch every
one, every time, for free, before the model is called. Ward/bed identifiers and free
prose genuinely need judgement; the structured identifier does not.

Presenting a probabilistic classifier as a *guard* (the section header in
`functions/index.js` reads `FEEDS, SMART WATERCOOLER & PDPA GUARD`) is the part worth
recording. It works most of the time, and "most of the time" is a different assurance
claim from the one the name makes.

## `AN13` — comments bypass the guard entirely · severity: **high**

Posts are properly fenced. `firestore.rules`:

```
      match /feed/{postId} {
        // Cloud Function only — `processFeedPost` runs the PDPA guard, and a post
        // that bypassed it would defeat the point of having one.
        allow create: if false;
```

That is exactly right, and it is why `AN12` is only a medium. **Comments are not:**

```
        match /comments/{commentId} {
          allow create: if isMember(teamId)
                        && request.resource.data.keys().hasOnly(['author', 'text', 'timestamp'])
                        && request.resource.data.text is string
                        && request.resource.data.text.size() > 0
                        && request.resource.data.text.size() <= 5000
```

Shape and length only. A 5,000-character comment containing a patient's name, NRIC and
ward goes straight into Firestore with no model review, no regex, and no Cloud Function
in the path — on the same screen, under the post the guard just cleared.

The comment above the post rule says a bypassed post *"would defeat the point of having
one"*. The reply box beside it is the bypass.

---

# §5 · What held

| | |
|---|---|
| **`processFeedPost` does authorization, not just authentication** | `:571` auth, then re-reads `teams/{teamId}/members/{uid}` from the database and refuses a non-member. **It is the only AI callable that checks the caller belongs to the team they are acting on**, and it is the template `generateSmartAnalysis` should be rewritten against. |
| **`allow create: if false` on feed posts** | The PDPA guard is genuinely enforced for the surface it covers. The rule and the function agree, and the comment explains why. |
| **`rosterCoverage.js`** | Pure, deterministic, no `Date.now()`, no `Math.random()`, nothing dropped — a malformed request is kept and explained rather than filtered away, because a request that vanished would be a shift nobody covers. This is the best-engineered module in the intelligence layer and it contains no AI at all. |
| **The sandbox publish guard** | `SmartAnalysis.jsx:145` — demo mode used to archive a fabricated Marvel report over a department's real year-end report, reporting success. Now refused, checked before `teamId` so the refusal names the right reason. |
| **Archiving by uid** | `:167` — the archive key was a slug of the display name, so a renamed clinician got two partial histories. Fixed, with the reasoning kept. |
| **The insights suppression work** | `CP23`/`CP25` — measured, re-measured, and a test that walks the published document and fails on any readable count under the band. |

---

# §6 · The ledger

| Id | Finding | Severity | Owner |
|---|---|---|---|
| `AN1` | Six named colleagues + job grades in the public bundle | **critical** | me |
| `AN2` | Every department's analysis is generated over those six people | **critical** | me |
| `AN4` | `generateSmartAnalysis` has no auth check — open Gemini endpoint | **critical** | me |
| `AN3` | Team name hardcoded; every report framed as another department | high | me |
| `AN5` | Output budget smaller than the smallest requested output | high | me |
| `AN7` | A model decides what is "safe for all staff", unchecked | high | **owner** |
| `AN10` | Nudge silently stops past 500 users — no chunking, log-only failure | high | me |
| `AN13` | Comments bypass the PDPA guard entirely | high | me |
| `AN6` | UI promises 5 minutes; the call is abandoned at 30 seconds | medium | me |
| `AN9` | Suppression is the only control and it is not in the rules | medium | **owner** — risk to accept or fund |
| `AN11` | One global nudge, no team scoping | medium | **owner** |
| `AN12` | PDPA guard is a model classification with no deterministic backstop | medium | **owner** |
| `AN8` | A missing field renders — and archives — as the report | low | me |

## If only two things get done

1. **`AN1` + `AN2` + `AN3` in one change.** Delete `STAFF_PROFILES`, source the
   profiles from `members` and the grades from `useTeamGrades` — which is lead-only and
   already exists — and pass `team.name`. That closes a live disclosure of six real
   people's pay grades to the open internet, and it makes the feature do what it claims
   for every department other than the first. **Rebuild and confirm the names are gone
   from `dist/` as the acceptance test**, because the bundle is the artefact that leaks,
   not the source.
2. **`AN4`.** Copy the six lines from `processFeedPost:571` — auth, then re-read
   membership, then refuse a non-lead of the team being analysed. Every other callable
   in the file already does the first half.

## What this does not cover

- **`SmartReportView.jsx` (391 lines)** — how an archived report is rendered and who
  reaches it — was not read.
- **The dashboard's derived metrics in `App.jsx`** were not audited beyond the
  Individual Clinical Load listener fixed earlier this week.
- **No live traffic, no deployed-function testing.** `AN4` in particular is asserted
  from source: the function has no auth check in code. Whether it has ever been called
  by anybody but the app is a Cloud Logging question, and it is worth asking, because it
  is the one finding here that somebody outside SingHealth could already have used.
