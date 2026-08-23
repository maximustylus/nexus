# AURA Chat — post-mortem

**Subject:** `src/components/AuraChat.jsx` — the **public** conversational health
screening at `/individuals/chat`. 1,226 lines. Not the staff assistant: that is
`AuraPulseBot.jsx` and it has its own post-mortem.

**Date:** 2026-08-23 · **Against:** branch `claude/nexus-aura-rostering-session-duo1q5` @ `d5174e1` · **Version:** v2.1.0

**Companions:** [`POSTMORTEM-AURA.md`](POSTMORTEM-AURA.md) (`AU`n — the AI surfaces) ·
[`POSTMORTEM-COMMUNITY.md`](POSTMORTEM-COMMUNITY.md) / [`COMMUNITY_TODO.md`](COMMUNITY_TODO.md) (`CP`n / `CD`n — the portal) · legend in [`IDS.md`](IDS.md)

**New id series: `AC`n**, registered in `IDS.md` in this commit per its rule 2.

---

## What this adds, and what it does not re-tread

The community portal already has a post-mortem and a 26-item ledger. `CP1`, `CP2`,
`CP9`, `CP13`–`CP19` and `CP22`–`CP26` all touch this file and most are closed. This
document is **not** a second pass over those.

It is a pass over the one thing that ledger never opened: **the parser that turns what
a member of the public typed into the number the whole instrument is built on.**
`COMMUNITY_TODO.md` P4.3 has said so for weeks, and is still `OPEN`:

> `deriveFlags` and `parseClinicalData` have no tests. `calculateRiskScore` had none
> either, and it was wrong for its entire life.

That sentence turned out to be the most load-bearing line on the ledger.

⚠️ **Nothing here is fixed.** `AC1` and `AC2` are live and reachable today by typing
rather than tapping — which the interface explicitly invites.

---

# §1 · The PAVS parser

PAVS is the Physical Activity Vital Sign: **days per week × minutes per session**. It
is the single measure the portal exists to take. It sets the risk point, the tier
banner, the result copy and — through `selectCTA` — which programme a person is sent
to.

The chat renders a free-text box beside its chips and prompts, in the interface's own
words, **"SELECT AN OPTION OR TYPE FREELY"**. `parseClinicalData` (`AuraChat.jsx:643`)
reads whatever comes back.

## `AC1` — a typed session length containing "20" is recorded as 15 minutes · severity: **critical**

`AuraChat.jsx:654-659`:

```js
const minsN = minsStr.includes('60+') || minsStr.includes('60 min') ? 65
            : minsStr.match(/45.?60|45–60/i)                         ? 52
            : minsStr.match(/30.?45|30–45/i)                         ? 37
            : minsStr.match(/20.?30|20–30/i)                         ? 25
            : minsStr.includes('less') || minsStr.includes('20')     ? 15
            : parseInt((minsStr.match(/\d+/) || ['0'])[0], 10);
```

The fifth branch is an **unanchored substring test**. Probe output, replicating the
ladder verbatim:

```
--- Typed session length: what "SELECT AN OPTION OR TYPE FREELY" accepts ---
  "45 minutes"         -> minsN = 45
  "90 minutes"         -> minsN = 90
  "60 minutes"         -> minsN = 65
  "120 minutes"        -> minsN = 15     <-- contains "20"
  "200 minutes"        -> minsN = 15     <-- contains "20"
  "220 minutes"        -> minsN = 15     <-- contains "20"
  "1200 minutes"       -> minsN = 15     <-- contains "20"
  "20 to 40 minutes"   -> minsN = 15     <-- contains "20"
```

The consequence, same probe:

```
--- Consequence: a 5-day-a-week, 2-hour-a-session exerciser ---
  recorded: 5 days x 15 min = 75 min/wk   (PAVS tier: BELOW the 150 guideline)
  actual  : 5 days x 120 min = 600 min/wk (PAVS tier: meets)
```

Somebody training ten hours a week is recorded at **75 minutes**, charged the physical
activity deficit point, shown "below the 150 min/week guideline" on their result, and
routed by `selectCTA` to **Start2Move — a free six-session beginner programme**.

This is the same shape as `CP15`, `CP18`, `CP19` and `CP22`, all of which were
unanchored substring tests and all of which are closed. The hunt reached the clinical
flag matchers, the previous-ID field, the postal chips and the typed symptom answers.
**It never reached the PAVS ladder** — the primary measure.

## `AC2` — an answer with no digits scores zero · severity: **critical**

The final fallback is `parseInt((str.match(/\d+/) || ['0'])[0], 10)` — no digits, no
score.

```
--- Word numbers: CP26 solved this for AGE (parseAgeBand). PAVS never got it ---
  mins "about an hour"           -> 0
  mins "an hour"                 -> 0
  mins "half an hour"            -> 0
  mins "one hour"                -> 0
  mins "thirty minutes"          -> 0
  mins "forty five minutes"      -> 0
  days "daily"                   -> 0
  days "every day"               -> 6
  days "most days"               -> 0
  days "weekends only"           -> 0
  days "five times a week"       -> 0
```

**"daily" scores 0 days. "about an hour" scores 0 minutes.** Somebody who walks an hour
every day and writes it the way people write it gets `pavsScore = 0` — the maximum
inactivity reading the instrument can produce.

`"every day"` survives only because it is one of three literal alternatives hand-listed
in the days regex. `"daily"` is not on that list.

⚠️ **This is `CP1` returning through a different door.** `CP1` was *"the threshold could
never be met and every respondent was charged the inactivity point — including one doing
390 min/week, who was shown 'Moderate Risk' beside a banner congratulating them."* That
was fixed in `scoring.js`. The same outcome — an active person scored as sedentary — is
still reachable here, one layer upstream, for anybody who types.

⚠️ **And the fix pattern already exists in this repository.** `CP26` hit exactly this
for age and produced `parseAgeBand` / `isSixtyPlus` in `clinicalFlags.js`, which reads
`"sixty five"` and `"I am 72"` correctly. PAVS was never given the same treatment.

## `AC3` — the two pathways compute PAVS by two unrelated algorithms · severity: **high**

`src/utils/pathwayParity.test.js` exists to keep the chat and the form in agreement,
because `CP9` happened when two surfaces derived one value two ways. The most important
value in the instrument is derived two ways.

| | Chat (`AuraChat.jsx:648`) | Form (`ConventionalForm.jsx:184`) |
|---|---|---|
| Mechanism | regex ladder over free text | exact-match lookup table |
| Input | `<input>` — "type freely" | `<select>` — closed set |
| `"120 minutes"` | **15** | not expressible |
| `"daily"` | **0** | not expressible |
| Unknown input | `0`, silently | `?? 0`, but unreachable |

```js
// ConventionalForm.jsx:185
const MINS_MIDPOINT = { 'Less than 20 mins': 15, '20–30 mins': 25, '30–45 mins': 37, '45–60 mins': 52, '60+ mins': 65 };
const _minsRaw      = MINS_MIDPOINT[f.pavsMins] ?? 0;
```

⚠️ **The parity test cannot see this, and that is not the test's fault.** The two
implementations agree **exactly** on the chip labels — verified, all nine combinations
— and diverge **only** on free text, which the form cannot accept at all. There is no
input a parity test could construct that both pathways would take and disagree on. The
divergence lives precisely in the gap the test is structurally unable to reach.

`pathwayParity.test.js:159` even forbids re-introducing a substring test — scoped
correctly and narrowly to the falls age gate:

```js
expect(src('AuraChat.jsx'), 'the chat must not re-introduce a substring test for the chip text')
    .not.toMatch(/when:\s*\(data\)\s*=>\s*\/60/);
```

That guard is right about the hazard and points at one field. `minsStr.includes('20')`
sits 300 lines away in the same file.

## `AC4` — a docstring that is true of one pathway is written as true of both · severity: **low**

`src/utils/scoring.js:21`:

```
 *     pavsMinutes   MINUTES PER SESSION.  Capped at 65 by `MINS_MIDPOINT`.
```

`MINS_MIDPOINT` is `ConventionalForm`'s table. The chat has no cap — `parseInt` returns
whatever was typed, so `"500 minutes"` yields `pavsMinutes: 500`. `calculateRiskScore`
reads only `pavsScore` (`:80`), so nothing miscalculates today; but the value is written
to `community_assessments`, and the header of the file that fixed `CP1` describes a
constraint that half the callers do not honour.

## `AC5` — the parser is unexported, untested, and tested only as a string · severity: **high**

`parseClinicalData` is a module-level `const` (`:643`) — not exported, so it cannot be
unit-tested without changing the module. `COMMUNITY_TODO.md` P4.3 has this `OPEN`.

What exists instead is source-scanning. Four test files name `AuraChat`; **none renders
it**:

```
$ grep -rn "from './AuraChat'\|from '../components/AuraChat'" src
(no output)

$ grep -n "AuraChat" src/utils/pathwayParity.test.js
79:  const chatFlags = () => returnedKeys(src('AuraChat.jsx'), 'const parseClinicalData');
133: expect(src('AuraChat.jsx')).toMatch(/have you had a fall/i);
156: ['AuraChat.jsx', 'ConventionalForm.jsx'].forEach((file) => …
```

They read the file **as text** and assert on regexes. `ctaTierParity.test.js:10`
documents why — the component pulls in jsPDF and html2canvas.

The reason is legitimate; the consequence is not acknowledged anywhere. **Source
scanning proves a string is present. It cannot prove a number is right.** `AC1` and
`AC2` are both invisible to every test in this suite, and would remain invisible to any
number of additional ones written the same way.

---

# §2 · The end of the conversation

## `AC6` — the completion handler guards the one call that cannot throw · severity: **high**

`AuraChat.jsx:1033`:

```js
const concludeTriage = async (finalData) => {
    clearProgress();                                   // ← the answers are dropped FIRST
    const parsed    = parseClinicalData(finalData);    // ← outside the try
    const riskScore = calculateRiskScore(parsed);      // ← outside the try
    const ctaData   = selectCTA(parsed);               // ← outside the try

    try {
      await recordTelemetry(…);                        // ← the ONLY thing inside it
      setTimeout(() => { setIsComplete(true); … navigate('/individuals/result', …) }, 1200);
    } catch {
      setTimeout(() => { setMessages(prev => [...prev, { text: langData.error, … }]); }, 1000);
    }
};
```

`recordTelemetry` **cannot reject.** `telemetry.js:127`:

```js
} catch (error) {
    // Swallowed on purpose — see the header. The visitor must reach their result.
    console.error('[NEXUS Telemetry] Transmission failed:', error);
    return false;
}
```

So the `catch` is unreachable, and the three calls that *can* throw sit outside it.
`concludeTriage` is invoked without `await` and without `.catch` (`:1024`), so a throw
becomes an unhandled rejection. The visitor is left on:

> I have mapped your full profile. Generating your personalised plan now…

for ever — and `clearProgress()` ran on line one, so the saved answers are already gone
and there is nothing to resume.

**The error handling is inverted.** This is a near-relative of `CP24`, which fixed the
*hang* by bounding the write. It did not move the guard to the calls that can fail.

## `AC7` — the unreachable catch reads as a safety net · severity: **medium**

Because `catch { … langData.error … }` is there, the completion path *looks* defended.
A reader — including whoever next changes `telemetry.js` — has no signal that the branch
is dead. If the deliberate swallow at `telemetry.js:127` were ever removed for good
reasons, this catch would come alive and silently become the *only* outcome for a
failed write: an error message, no result page, no saved progress.

---

# §3 · The AI acknowledgement

Since `CP6`/`CP7` the chat calls `communityAck` — its own callable, server-held prompt,
no caller-supplied prompt, closed-set validation, rate limited. That work is sound and
`§4` of the AURA post-mortem says so. What follows is the client half.

## `AC8` — the discard window still bills in full · severity: **medium** · *known, `P0.5` `OPEN`*

`AuraChat.jsx:932, 983`:

```js
const AI_UPGRADE_WINDOW_MS = 1500;
var upgradeTimer = setTimeout(function() { upgradeExpired = true; }, AI_UPGRADE_WINDOW_MS);
```

There is no `AbortController`. After 1,500 ms the answer is ignored, but the request
runs to completion on the server and is billed. The ledger records this accurately as
*"Reduced but not fixed"* — the server timeout is 20s and the cap 200 tokens. Restated
here only because it is a client-side fix (one `AbortSignal`) filed under a server-side
item, which is why it keeps getting deferred.

## `AC9` — the model's own reply is screened with an unanchored substring test · severity: **medium**

`AuraChat.jsx:999`:

```js
var isErr = !stripped || /fallback|missing.api|api.key|error|unauthorized|unavailable/i.test(stripped);
if (isErr) return;
```

This scans the **acknowledgement sentence** for words that suggest a failure. A
legitimate reply is discarded if it happens to contain any of them —
*"if your usual class is unavailable, the centre can suggest another"*, *"it is not an
error to start small"*. Harm is bounded (the static acknowledgement stays) but the
pattern is the one this file has had removed from it four times. `/missing.api/` also
has an unescaped `.`.

## `AC10` — a third copy of the fence-strip and brace-scan · severity: **medium**

`AU18` found this logic duplicated between `functions/index.js:184` and
`AuraPulseBot.jsx:342`. `AuraChat.jsx:1000-1007` is the third:

```js
var stripped = raw.replace(/```json|```/g, '').trim();
…
var s = stripped.indexOf('{'); var e = stripped.lastIndexOf('}') + 1;
if (s !== -1 && e > s) { var p = JSON.parse(stripped.substring(s, e)); aiAck = (p.reply || '').trim(); }
```

Its own comment says this is now dead tolerance — `communityAck` returns plain text, not
JSON. Three copies of a parser for a format that one of the three callers no longer
produces.

## `AC11` — the acknowledgement rewrites text the person may already be reading · severity: **medium**

On success the handler replaces the message body in place (`:1014`), up to 1,500 ms
after it appeared. Sentences change under the reader with no transition, no indication,
and — see `AC12` — no announcement. For the cohort this portal targets, text that
rewrites itself mid-sentence is a comprehension problem before it is a polish one.

---

# §4 · Who can actually use this screen

## `AC12` — the community portal has no live region; the staff roster has two · severity: **high**

```
$ grep -rn "aria-live" src/components/*.jsx
src/components/RosterView.jsx:335:            aria-live="polite"
src/components/RosterView.jsx:535:            aria-live="polite"
```

**Zero in the community portal.** The chat area is a plain scrolling `div` (`:1129`).
Every bot question, the typing indicator, the acknowledgement rewrite and the final
plan arrive with no announcement. A screen-reader user must discover that new content
appeared and go looking for it, on a conversational interface where content arriving is
the entire interaction model.

The inversion is the finding. `CP17` fixed `<html lang>` and re-enabled pinch-zoom
**specifically** because this portal targets elderly users, and the ledger says so. The
staff-facing roster announces its state changes politely; the public health screening
built for people with the most assistive-technology need does not.

## `AC13` — messages are keyed by array index while a stable id exists · severity: **low**

`:1131` renders `messages.map((msg, idx) => <div key={idx} …>)`. The upgrade handler at
`:1012` matches on `m._id` — so a stable id was added for exactly this purpose and the
list key was never moved to it.

---

# §5 · Drift

## `AC14` — `TOTAL_STEPS` says 13, is 15, and badges the result with the wrong domain · severity: **low**

`:99`:

```js
const TOTAL_STEPS = DOMAIN_CONFIG.length; // 13
```

`DOMAIN_CONFIG` has **15** entries — `CP26` appended `falls` (13) and `healthier_sg`
(14). The constant is correct; the comment is a fossil.

Its two uses are `step: TOTAL_STEPS - 1` on the completion message (`:1056`) and the
error message (`:1076`), which drive `DomainBadge`:

| | Badge worn by the result message |
|---|---|
| Before `CP26` | `step 12` → 🔗 NEXUS Record Linkage |
| Now | `step 14` → 🩺 Healthier SG |

Neither is right — the completion message belongs to no domain — but appending two
steps silently moved it, and nothing failed. The honest fix is `step: undefined`, which
`DomainBadge` already handles (`:843` returns `null`).

---

# §6 · What held

| | |
|---|---|
| **`selectCTA` is total** | `:243-260` — every path returns a CTA object. No undefined, so `ctaData.tier` at `:1046` is safe. Checked because `AC6` made the failure modes matter. |
| **The chips are exact across both pathways** | All nine day/minute combinations produce identical scores in the chat ladder and the form's lookup table. The tap path — which most people use — is correct. |
| **`clearProgress()` on conclude is right** | `:1036` — a completed assessment must not resume. It is the *ordering* relative to the throwing calls that is wrong, not the call. |
| **`communityAck` replaced `chatWithAura`** | `:960-978` — the comment is unusually honest about what the old call sent, including that the persona shipped to the browser and could be replaced by any caller. |
| **The parsers are shared, not copied** | `parseFallsAnswer`, `parseHealthierSg`, `isSixtyPlus` all come from `clinicalFlags.js` and `pathwayParity.test.js` holds that line. `CP9` is genuinely closed. |
| **`sessionStorage`, not `localStorage`** | `assessmentSession.js`, 15 tests. Correct for community-centre terminals and deliberately chosen. |

---

# §7 · The ledger

| Id | Finding | Severity | Owner |
|---|---|---|---|
| `AC1` | Typed minutes containing "20" recorded as 15 | **critical** | me |
| `AC2` | Word-number answers score 0 — "daily", "about an hour" | **critical** | me |
| `AC3` | Two pathways, two PAVS algorithms; parity test structurally blind to it | high | me |
| `AC5` | Parser unexported, untested; the suite tests source text, not behaviour | high | me |
| `AC6` | `concludeTriage` guards the only call that cannot throw | high | me |
| `AC12` | No live region in the community portal; the staff roster has two | high | me |
| `AC7` | The unreachable catch reads as a safety net | medium | me |
| `AC8` | Discard window still bills in full *(known — `P0.5`)* | medium | me |
| `AC9` | Model reply screened by unanchored substring test | medium | me |
| `AC10` | Third copy of the fence-strip/brace-scan | medium | me |
| `AC11` | Acknowledgement rewrites text under the reader | medium | **owner** — UX call |
| `AC4` | `scoring.js` cap docstring true of one pathway only | low | me |
| `AC13` | `key={idx}` while `_id` exists | low | me |
| `AC14` | `TOTAL_STEPS` comment stale; result wears the Healthier SG badge | low | me |

## If only two things get done

1. **`AC1` + `AC2` together** — one shared PAVS parser in `clinicalFlags.js`, modelled
   on `parseAgeBand`, used by both pathways, with the closed-set table as its fast path.
   That closes `AC3` in the same change and makes `AC5` possible, because the parser
   would finally be an exported function somebody can test. It is one module and a test
   file, and it is the number the whole instrument reports.
2. **`AC12`** — an `aria-live="polite"` on the message list. One attribute, on the
   screen with the strongest claim to needing it.

## What this does not cover

- **`ConventionalForm.jsx`** was read only where it parses PAVS and selects a CTA. Its
  own 1,000+ lines are not audited here.
- **No live traffic, no real device.** Every finding is from source plus probes that
  replicate source expressions verbatim. How often anybody types instead of tapping is
  unmeasured — and it is the number that decides whether `AC1` and `AC2` are theoretical
  or routine. `community_assessments` holds the answer.
- **Accessibility was checked for live regions only.** Focus management, keyboard order,
  contrast on the chat surface and the quick-reply chips were not examined; `AC12` should
  not be read as the whole of it.
