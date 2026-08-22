# NEXUS Community Portal — Remediation Ledger

Companion to [POSTMORTEM-COMMUNITY.md](POSTMORTEM-COMMUNITY.md), which carries the
evidence for every row below. This file is the plan; the post-mortem is the finding.

**Scope: the `/individuals/*` surface and nothing else.** Five routes, the two
pathways that feed them, and the Cloud Function behind the chat. The roster side has
its own ledger in [ROSTER_TODO.md](ROSTER_TODO.md) and the two do not share ids.

**Ledger rule, inherited from the roster ledger and not softened:** an item is `DONE`
only when the Evidence column holds **real, pasted output** — a test name and count, a
grep that returns zero, a commit sha whose diff can be read. *"The code was edited"* is
not evidence. A row marked `DONE` on the strength of an edit is the failure that
ledger rule exists to prevent, and it has happened in this repository before.

---

## Ids

Two series, deliberately distinct from the roster's `D`n / `Q`n so a reference is never
ambiguous across files:

| Prefix | Means | Who closes it |
|---|---|---|
| **`CP`**n | a **defect** in the community portal | me |
| **`CD`**n | a **decision** that is the owner's, not mine | Alif |

`CP` numbers track the post-mortem's `§3.x` sections one-for-one, so `CP9` is `§3.9`.
That mapping is fixed and will not be renumbered — the roster ledger's worst problem is
an id that came to mean three different things, and the way to not have that problem is
to never reuse a number.

---

## ⚠️ The two things to read first

**1. Three of these are clinical, not technical.** `CD4`, `CD10` and `CD11` change what
a member of the public is told about their own health. I have deliberately not
implemented them. They are marked `OWNER` and they are not blocked on engineering time.

**2. Nothing here is deployed.** Every `DONE` row below is on a branch. The community
portal that members of the public can reach today still has `CP1` — the risk score that
never measured activity — live in it.

---

## Status

| | Count | Ids |
|---|---|---|
| `DONE`, evidenced | 5 | `CP1` `CP2` `CP3` `CP5` `CP9` + theme half of `CP12` |
| `OPEN`, mine | 5 | `CP6` `CP7` `CP8` `CP10` `CP12` |
| `OPEN`, **owner's decision** | 3 | `CD4` `CD10` `CD11` |

---

## P0 — The shared AI endpoint · `CP6` + `CP7` · risk: **high** · **DO FIRST**

Everything else in this file is about what one member of the public is told. This is
about what *anyone on the internet* can reach, and it leads for that reason.

The public chat calls `chatWithAura` — **the same callable the internal staff assistant
uses** (`AuraChat.jsx:11`, `AuraPulseBot.jsx:57`). It has no `request.auth` check and no
App Check, and its `systemInstruction` is the staff-facing `AURA_SYSTEM_PROMPT` naming
KKH/SingHealth and printing the internal Firestore schema under a `MODE 3: DATA ENTRY
AGENT` heading.

| # | Item | Detail | Tier | Status | Evidence |
|---|---|---|---|---|---|
| 0.1 | Public callable, separate prompt | A new callable for `/individuals/chat` whose system prompt contains no KKH framing, no Firestore schema, no DATA_ENTRY mode. `publicTriageChat` (`functions/index.js:663`) is most of it already written and **has no caller** — finish it or delete it. Today it is neither. | Fable-supervised | `OPEN` | — |
| 0.2 | `request.auth` on `chatWithAura` | Every other privileged callable has one (`processFeedPost`, `functions/index.js:539`). Once the public is off it, nothing legitimate calls it unauthenticated. **Do 0.1 first** — this order matters, the reverse breaks the live portal. | Opus-alone | `OPEN` | — |
| 0.3 | App Check + rate limit on the public callable | `CP7`. Unauthenticated, `maxOutputTokens: 8192`, 90s fetch in a 120s function. A loop bills `GEMINI_API_KEY`. | Opus-alone | `OPEN` | — |
| 0.4 | Validate content, not only length | `validateChatInput` bounds `role` and `prompt` by length and type only. Allowlist `language` to the four the portal sends; stop passing caller-supplied `role`/`prompt` into model context. | Opus-alone | `OPEN` | — |
| 0.5 | Abort on the discard window | `AuraChat.jsx:726` gives the model 1,500 ms then discards the answer — but never aborts, so it runs to completion server-side and bills in full. Every late answer is paid for and thrown away. | Opus-alone | `OPEN` | — |

---

## P1 — Clinical correctness · `CP1` `CP2` `CP9` · risk: high · **SHIPPED**

The three that changed what a person was told about their own health.

| # | Item | Detail | Tier | Status | Evidence |
|---|---|---|---|---|---|
| 1.1 | PAVS weekly minutes | `CP1`. `scoring.js` compared **per-session** minutes against the 150 **min/week** benchmark. `MINS_MIDPOINT` maxes at 65, so the threshold could never be met and every respondent was charged the inactivity point — including one doing 390 min/week, who was shown "Moderate Risk" beside a banner congratulating them. | Opus-alone | `DONE` | `35f46ad` · `src/utils/scoring.test.js` 9 tests, was 0 |
| 1.2 | Missing data scored as health | `CP2`. Absent fields coerced to a passing value. Now `asNumber()` returns `null` and `null` counts as a deficit, not as fitness. | Opus-alone | `DONE` | `35f46ad`, same suite |
| 1.3 | The isolation tier routed to nothing | `CP9`. `AuraChat.selectCTA` ranks `SOCIAL_CARE` **second**, behind only chest pain. `ResultPage` had no banner for it and both read sites fall back to `START`, so an isolated resident 60+ was told *"Download the Healthy 365 app"* and the CareLine referral vanished silently. Banner composed only from copy already reviewed in the same file. | Opus-alone | `DONE` | `189a61b` · `src/utils/ctaTierParity.test.js` 5 tests, fails on the bug before the fix |

---

## P2 — Privacy · `CP3` `CP5` · risk: high · **SHIPPED**

| # | Item | Detail | Tier | Status | Evidence |
|---|---|---|---|---|---|
| 2.1 | Stop fingerprinting | `CP3`. `telemetry.js` wrote `clientReference: navigator.userAgent` on a screen that told the public the record was de-identified (`ResultPage.jsx:758`). Removed. | Opus-alone | `DONE` | `301bb5a` |
| 2.2 | Close the read rule | `CP5`. `community_assessments` allowed `read: if isSignedIn()` — every signed-in staff member could read the public's health records. Grep proved no reader exists. Now `if false`. | Opus-alone | `DONE` | `301bb5a` · `45323f2` · 95 emulator checks, 0 failed |

---

## P3 — What the portal says · `CP10` + `CD4` `CD10` `CD11` · risk: high

**Three of these four are the owner's call and are not blocked on me.**

| # | Item | Detail | Tier | Status | Evidence |
|---|---|---|---|---|---|
| 3.1 | Translate the urgent CTA copy | `CP10`/`CD10`. The in-chat card renders `primaryStep`, `healthierSG` and `resources` raw from a flat English object; only labels are translated. A Tamil speaker reporting chest pain reads *"call 995"* in English. `ResultPage`'s `CTA_BANNER` already has reviewed `ms`/`zh`/`ta` for the same tiers and is the source to adapt from. **I have not machine-translated urgent clinical advice and will not.** | **OWNER** | `OPEN` | — |
| 3.2 | Split the cardiac question | `CD11`. `AuraChat.jsx:241` asks two things at once with single-tap chips, so high blood pressure **and** exertional chest pain cannot both be recorded. Tap the condition and `symptomFlag` is false — the person loses URGENT and is routed to a paid exercise programme. The form pathway records both correctly. Splitting it changes the instrument. | **OWNER** | `OPEN` | — |
| 3.3 | Decide the URGENT tier | `CD4`. The red-flag tier's resource list includes an exercise programme. My recommendation: its own resource set with no exercise in it, and its own visual treatment. Yours to decide. | **OWNER** | `OPEN` | — |
| 3.4 | Resource freshness contract | `CP8`. The prompt labels the inventory *"VERIFIED RESOURCE INVENTORY"* and the model quotes prices and hours to the public as fact. `lastVerified` is written by `firestore_seed.cjs` on every run and **read by nothing**. Either check it and suppress stale entries, or take the word "VERIFIED" out. | Opus-alone | `OPEN` | — |

---

## P4 — Structure · `CP12` + the duplication · risk: low

Cheap, and each one removes a way the portal can drift back into a P1.

| # | Item | Detail | Tier | Status | Evidence |
|---|---|---|---|---|---|
| 4.1 | One theme key | `CP12`. A prior *"FIX 1"* changed three files to `nexus-theme` and left four on `nexus_theme`, including `App.jsx`, which owns the class on `<html>` — splitting the setting along the pathway gate rather than unifying it. | Opus-alone | `DONE` | `189a61b` · `src/utils/theme.js` |
| 4.2 | Share `selectCTA` and the tier table | Two copies kept in agreement by a comment that was **already false** (`CP9`). Move beside `calculateRiskScore` in `src/utils/`. `ctaTierParity.test.js` detects the drift; a shared module makes it unrepresentable, and that test can then be deleted rather than maintained. | Opus-alone | `OPEN` | — |
| 4.3 | Test the remaining pure logic | `deriveFlags` and `parseClinicalData` have no tests. `calculateRiskScore` had none either, and it was wrong for its entire life. | Opus-alone | `OPEN` | — |
| 4.4 | Persist in-progress state | `CP12`. Thirteen questions, then a reload, and everything is gone — including a completed result, because `ResultPage.jsx:470` redirects when router state is absent. `sessionStorage`. | Opus-alone | `OPEN` | — |
| 4.5 | `path="*"` route | `CP12`. `App.jsx:759-780` has none, and `firebase.json` rewrites everything to `index.html`, so a mistyped URL renders a blank page. | Opus-alone | `OPEN` | — |
| 4.6 | One session id | `CP12`. Four are minted (`LanguageGate.jsx:20`, `PathwaySelection.jsx:49`, `AuraChat.jsx:686`, `ResultPage.jsx:479`) and all four are shown to the user as *"ID:"*. The one written to Firestore is the third. A person quoting the id on their screen may not be quoting the one in the record. | Opus-alone | `OPEN` | — |

---

## P5 — Decide whether the data is for anything · `CD5`

Every screening is written and read by nothing (`CP5`). Two honest options, and the
current state is the worse of both — the cost and risk of holding health data about the
public, with none of the benefit.

| # | Item | Detail | Tier | Status |
|---|---|---|---|---|
| 5.1 | Use it, or stop collecting it | **(a)** Build the analysis that justifies collection, and the privacy notice can then say what it is for. **(b)** Keep only what the result needs — `race` and `housing` are collected and read by nothing. (b) is cheaper and I would do it first. | **OWNER** | `OPEN` |
| 5.2 | Move the notice to the front | Whichever of the above: a short screen *before* the first question, with a way to decline and still get the result. Today the claim appears on the result page, after the data is written. | Fable-supervised | `OPEN` |

---

## Current queue

In order. `P0` first because it is the only item on this page whose blast radius is
larger than one respondent.

```
P0.1  public callable + own prompt          ─ then P0.2, which depends on it
P0.3  App Check + rate limit
P0.4  content validation
CD4 / CD10 / CD11                            ─ owner's, in parallel, not blocked on me
P3.4  resource freshness
P4.2  share selectCTA                        ─ retires ctaTierParity.test.js
P4.3  tests for deriveFlags / parseClinicalData
P4.4  P4.5  P4.6                             ─ cheap, do together
P5    the data question                      ─ owner's
```

---

## What not to rebuild

Recorded so a future pass does not "fix" something that is already right:

- **The two pathways converging on one scoring function.** `ConventionalForm` and
  `AuraChat` gather differently and then share `calculateRiskScore`, `selectCTA` and
  `ResultPage`. That is the best structural decision in the portal. `P4.2` extends it;
  it does not replace it.
- **The CTA precedence ladder.** `symptomFlag` → `medFlag` → age → SDOH → activity is
  clinically right, even where `CD4` questions the destination.
- **The four-language support.** It is real, it covers the resource registry, and
  `CP10` is a gap in it — not a reason to reconsider it.
- **The resource registry itself.** Real addresses, real programme names, real prices.
  Somebody did the legwork. `P3.4` is about keeping it true, not about replacing it.
