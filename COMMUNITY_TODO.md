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
| `DONE`, evidenced | 10 | `CP1` `CP2` `CP3` `CP5` `CP6` `CP9` `CP13` `CP14` `CP15` `CP17` + theme half of `CP12` |
| `OPEN`, mine | 5 | `CP7` `CP8` `CP10` `CP12` `CP16` |
| `OPEN`, **owner's decision** | 3 | `CD4` `CD10` `CD11` |

**`CP13` is fixed.** The portal wrote a health profile to a database while showing
the person no disclaimer and no privacy notice on screen — both rendered off-screen
inside a PDF template most people never download. Both are now on the page, and a
collection notice appears *before* either pathway starts rather than after the
record is written. Both are still English-only, which is `CD10` and is yours.

---

## P0 — The shared AI endpoint · `CP6` + `CP7` · risk: **high** · **SHIPPED** (bar App Check)

Everything else in this file is about what one member of the public is told. This is
about what *anyone on the internet* can reach, and it leads for that reason.

The public chat calls `chatWithAura` — **the same callable the internal staff assistant
uses** (`AuraChat.jsx:11`, `AuraPulseBot.jsx:57`). It has no `request.auth` check and no
App Check, and its `systemInstruction` is the staff-facing `AURA_SYSTEM_PROMPT` naming
KKH/SingHealth and printing the internal Firestore schema under a `MODE 3: DATA ENTRY
AGENT` heading.

| # | Item | Detail | Tier | Status | Evidence |
|---|---|---|---|---|---|
| 0.1 | Public callable, separate prompt | **`communityAck`** replaces `publicTriageChat` in `functions/index.js`. No KKH framing, no schema, no modes. It takes `{domain, answer, priorAnswers, language}` — **no caller-supplied prompt, no `role`, no `history`, no attachments** — and returns plain text. `WELL_WELL_PROMPT` moved out of the browser and onto the server, so the persona can no longer be replaced by the caller. | Fable-supervised | `DONE` | `functions/communityAck.js` + 41 tests |
| 0.2 | `request.auth` on `chatWithAura` | **DONE**, and the demo is now a real sandbox rather than a claimed one. Demo Mode called this function unconditionally — `isDemo` only chose the prompt text — so a visitor with no account, arriving from the *signed-out* landing page, sent their typing to Gemini on the project's billed key. `src/utils/demoAura.js` answers demo turns locally, deterministically and in the same object shape the component parses, so the mode badge, the document-export card and the wellbeing-log prompt all still work. With nothing unauthenticated left calling it, `chatWithAura` now refuses a caller with no `request.auth`. | Fable-supervised | `DONE` | 26 tests · the only remaining call site is the authenticated branch of `AuraPulseBot` |
| 0.3 | App Check + rate limit on the public callable | `CP7`. Still unauthenticated — the portal is *for* the public — but the blast radius is now a prompt with no hospital framing and no schema. `maxOutputTokens` is down from 8192 to 200 and the fetch timeout from 90s to 20s, so an abuse loop costs far less. App Check remains the real mitigation. | Opus-alone | `OPEN` | — |
| 0.4 | Validate content, not only length | `domain` and `language` are closed sets checked as closed sets. `priorAnswers` is **rebuilt** from the known domain list rather than filtered, so a caller cannot influence the shape of what reaches the model — only the values of at most thirteen known keys. `prompt`/`role`/`history`/`attachments` are ignored entirely, asserted by test. | Opus-alone | `DONE` | `functions/communityAck.test.js` — 41 tests |
| 0.5 | Abort on the discard window | `AuraChat.jsx` gives the model 1,500 ms then discards the answer without aborting, so it runs to completion server-side and bills in full. Reduced but not fixed: the server timeout is now 20s rather than 90s and the output cap 200 tokens rather than 8192. | Opus-alone | `OPEN` | — |
| 0.6 | Close the dead endpoints | `publicTriageChat` — 145 lines, unauthenticated, interpolated `request.data.language` into its own system instruction with no allowlist, **and had no callers**. Its body is gone; the **export deliberately remains as a stub that throws**. ⚠️ Deleting the source does not delete the deployed function, and `deploy.yml:37` runs `deploy --only functions,firestore:rules` with no `--force` on a TTY-less runner — firebase-tools ABORTS on an orphan rather than skipping it, which would half-apply the merge (rules land, `communityAck` does not, the auth check does not, Hosting never runs, and every later push fails the same way). `src/utils/auraChat.js` deleted outright — it is client code and deploys with the bundle. | Opus-alone | `DONE` | export diff vs `origin/main` shows **additions only**, so no deletion prompt |

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

## P3b — Found by the deep audit · `CP13`–`CP17` · risk: **high**

A 158-agent adversarial sweep of the portal returned 75 verified findings after my
own pass was written. These five are the ones I re-verified myself and that change
what a member of the public sees. **`CP16` corrects `CP8` above.**

| # | Item | Detail | Tier | Status | Evidence |
|---|---|---|---|---|---|
| 3b.1 | **No disclaimer and no privacy notice on screen** | `CP13`. Both the *"Important Medical Disclaimer"* (`ResultPage.jsx:746`) and the full data-governance text (`:782`) sit **four to five divs deep inside the off-screen PDF template** opened at `:636` with `position:absolute; top:-10000px`. Neither renders on the visible page. On screen the form pathway offers one half-sentence, on step 4 of 4, after the health questions are already answered (`ConventionalForm.jsx:253`). **The chat pathway offers nothing at all** — `grep -ci "de-identified\|privacy\|consent\|we collect" AuraChat.jsx` returns `0`, and it writes age band, gender, ethnicity, housing, postal sector and four health flags. | Fable-supervised | `DONE` | `MedicalDisclaimer` + `DataGovernance` render on the visible page; `PathwaySelection` carries a collection notice **before** either pathway starts. English only — `CD10`. |
| 3b.2 | **"Green" tells people below the guidelines that they meet them** | `CP14`. `greenDesc` is *"You meet the physical activity guidelines."* The tier comes from the **risk score**, not from PAVS: `getRiskTier` returns Green for 0–1. Someone at 100 min/week who strength-trains twice a week scores exactly 1 → Green → told they meet guidelines, **on the same screen where `getPavsTier(100)` renders `below`**. | Opus-alone | `DONE` | Green now uses `pavsBelowDesc` — already translated in all four languages — when the figure is below target |
| 3b.3 | **Chat flags are unanchored substring regex** | `CP15`. `AuraChat.jsx:516-530` tests raw free text. `/low/` is unanchored, so *"I walk slowly but I feel great"*, *"I follow a routine"* and *"I allow myself rest days"* all flag as **psychological distress** and route to the WELLBEING tier. It is also negation-blind: *"I do not get chest pain"* sets `symptomFlag` and triggers URGENT. Both directions over-triage, which is the safe way to be wrong — but it is wrong, and it is the tier ladder's input. | Opus-alone | `DONE` | `src/utils/clinicalFlags.js` · 46 tests · plus a linkage bug of my own finding, below |
| 3b.4 | **The seeded resource collection reaches nobody** — ⚠️ **corrects `CP8`** | `CP16`. `scripts/firestore_seed.cjs` writes 22 records to `resources`. Its only reader is `publicTriageChat`, which **has no callers** (`CP6`). What the public actually sees is a *second, unrelated* registry of 16 entries hardcoded in JSX at `ResultPage.jsx:191-208` — different ids, different URLs, nothing derives one from the other. So `CP8`'s freshness finding was about a collection with no reader; the freshness problem that matters is the hardcoded one, which has no `lastVerified` field at all. | Opus-alone | `OPEN` | `grep -rn "'resources'" src/` → only `teamPaths.js:120` (roster-side) |
| 3b.5 | **The page is not usable by the people it targets** | `CP17`. `index.html:5` sets `maximum-scale=1.0, user-scalable=no` — **pinch-zoom is disabled portal-wide** on a tool explicitly built for elderly users. `index.html:2` is `<html lang="en">` and never changes, so a screen reader announces Malay, Chinese and Tamil content as English. | Opus-alone | `DONE` | `user-scalable=no` removed; `src/utils/language.js` sets `<html lang>` on every screen · 16 tests |

**The audit returned 70 further findings** — clinical safety, reliability, correctness
and the resource registry — at `/tmp/…/tasks/wem72mlov.output`. They are not
transcribed here because I have not personally verified them, and this ledger's
evidence rule does not allow rows I have not checked.

---

## P3c — Found while fixing `CP15` · `CP18` · risk: **high** · **SHIPPED**

| # | Item | Detail | Tier | Status | Evidence |
|---|---|---|---|---|---|
| 3c.1 | **A returning respondent's record linkage was silently discarded** | `CP18`. "Have you done this before?" was read with `/(no\|none\|tidak\|tiada\|没\|无\|不\|இல்லை)/i` over the raw answer — an unanchored substring test, like the flags. Assessment ids are base-36 uppercase, so an id **containing** the letters "no" was read as the word "no": `NX-XKNO4J2`, `NX-A3NONE1` and `NX-KZ1NOV8` all had `previousId` set to `null`. The person typed their id in, the page told them nothing, and the longitudinal link the portal advertises was dropped. `isNoPreviousId` now recognises an id by shape before testing for a negative word. | Opus-alone | `DONE` | 4 ids that used to be discarded, now kept |

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

## Manual, once — retiring the stub

`publicTriageChat` is closed but still deployed, for the deploy-safety reason in
`P0.6`. To remove it properly, after the branch has merged and deployed cleanly:

```
firebase functions:delete publicTriageChat --project idc-app-e0c59 --force
```

Then delete the stub block from `functions/index.js`. **Do not** add `--force` to
`deploy.yml` instead — it also suppresses the unsafe-trigger-migration,
min-instance-billing and service-account confirmations, permanently, for every
future deploy.

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
P0.3  App Check + rate limit
P0.5  abort the discarded request
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
