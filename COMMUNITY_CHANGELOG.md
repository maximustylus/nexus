# Changelog — NEXUS Community Portal

Changes to the **`/individuals/*` surface**: the public health screening, its two
pathways, and the Cloud Function behind the chat.

> ### How this relates to the other two files
>
> | | |
> |---|---|
> | **[CHANGELOG.md](CHANGELOG.md)** | the whole application, and **authoritative for the version**. `package.json` `version` is the single source of truth; nothing here overrides it. |
> | **this file** | the community portal only, in more detail than a whole-app changelog can carry, and cross-referenced to the ledger |
> | **[COMMUNITY_TODO.md](COMMUNITY_TODO.md)** | what is still open, with ids `CP`n and `CD`n |
>
> The portal ships inside the same bundle as the roster, so it has **no version of its
> own**. Entries below are filed under the app version they will ship in. Creating a
> separate version series for one surface is how a project ends up with two numbers that
> disagree, and this repository already documents that failure once.
>
> ### ⚠️ Nothing in this file is deployed
>
> Every entry below is on a branch. The portal members of the public can reach **today**
> still contains the defects listed under *Fixed* — including `CP1`, the risk score that
> never measured activity. This file records what is ready, not what is live. It will
> say otherwise on the day it is true and not before.

---

## [Unreleased] — on `claude/nexus-community-portal`

Ids in **bold** are from [COMMUNITY_TODO.md](COMMUNITY_TODO.md); `§` references are
sections of [POSTMORTEM-COMMUNITY.md](POSTMORTEM-COMMUNITY.md), which carries the
evidence.

### Fixed

- **`CP1`** *(§3.1)* — **The risk score never measured physical activity.** `scoring.js`
  compared `pavsMinutes` — minutes **per session** — against the ACSM benchmark of 150
  minutes **per week**. `MINS_MIDPOINT` tops out at `'60+ mins': 65`, so the threshold
  was unreachable and **every respondent who ever completed the screening** was charged
  the inactivity point. The weekly figure was sitting in the next field along,
  `pavsScore`, computed one line later. A person exercising 390 minutes a week was shown
  *"Moderate Risk"* on the same page whose banner — correctly using `pavsScore` —
  congratulated them at the ADVANCED tier. Now reads `pavsScore`. `35f46ad`

- **`CP2`** *(§3.2)* — **Missing data scored as perfect health.** Absent or unparseable
  fields coerced to a value that passed the check, so a gap in the record read as
  fitness. `asNumber()` now returns `null` for anything non-finite, and `null` counts as
  a deficit. `35f46ad`

- **`CP9`** *(§3.9)* — **The isolation tier routed to nothing.** `AuraChat.selectCTA`
  ranks `SOCIAL_CARE` **second**, behind only chest pain, for a resident aged 60+ who
  reports being isolated. `ResultPage` had no such key in `CTA_BANNER` or
  `tierPrimaries`, and both read sites fall back to `START` — so that person was told
  *"Download the Healthy 365 app and search Start2Move"*, and the SingHealth CareLine
  referral written for exactly them disappeared with no error and no log. The
  demographic least able to act on an app-store instruction was the one receiving it.

  Also corrected: `ConventionalForm.jsx:159` claims *"Identical to AuraChatbot
  selectCTA()"*. The two differ by exactly one rule — the isolation branch — and that
  one divergent rule was the broken one, so the same isolated senior got the right
  answer through the form and a silent fallback through the chat. The chat is the
  pathway built for elderly and non-English-first users. `189a61b`

- **`CP3`** *(§3.3)* — **The portal fingerprinted the public while telling them it had
  not.** `telemetry.js` wrote `clientReference: navigator.userAgent` into every
  `community_assessments` document, on a flow whose result page states the record is
  de-identified (`ResultPage.jsx:758`). Removed. `301bb5a`

- **`CP5`** *(§3.5)* — **Every signed-in staff member could read the public's health
  records.** `community_assessments` allowed `read: if isSignedIn()`. Grep confirmed no
  reader exists anywhere in the app — the permission was granted for an analysis screen
  that was never built. Now `read: if false`. `301bb5a`, verification `45323f2`

- **`CP12`** *(§3.12, theme)* — **The theme setting was split in half.** A prior repair
  recorded at `ConventionalForm.jsx:6` as *"FIX 1 — Theme key: nexus_theme →
  nexus-theme"* was applied to three files and not to the other four, including
  `App.jsx`, which owns the `dark` class on `<html>`. The result split the product along
  the pathway gate: choose dark on `/individuals/language`, tap through, and the form
  opens light. Centralised in `src/utils/theme.js`, which still reads the old key as a
  fallback so nobody loses a setting they already made. `189a61b`

- **`CP21`** — **The handover slip printed, but it printed badly: three A4 sheets, the
  first two-thirds empty.** The blank-page bug (`display: none` on an ancestor) was
  fixed earlier by switching to `visibility: hidden`, and that got the slip onto paper
  — but nobody had looked at the paper. Screenshotting the print media in headless
  Chromium showed three things at once:

  1. The slip is `position: absolute; top: 0; left: 0`, which resolves against its
     nearest **positioned** ancestor — the result page's `relative` glass card. Measured:
     the slip started **237px down and 62px in**, wasting roughly 63mm of the first
     sheet and printing off-centre.
  2. That card also carries a `transform` **and** a `backdrop-filter`. Either one
     establishes a containing block for an absolutely positioned descendant —
     `backdrop-filter` even for `position: fixed` — so no positioning value on the slip
     could escape it. Resetting `position` on the ancestors was tried and measured: it
     did not help, because the containing block came from the filter, not the position.
  3. `visibility: hidden` boxes **still occupy layout**. The document stayed 7591px
     tall, so "Save as PDF" produced **eight** pages: the slip, then seven blank.

  `HandoverSlip.jsx` now portals the slip to `document.body`, so it has no ancestor but
  `<body>`, and the print block hides its siblings with `display: none` — which collapses
  the layout rather than merely hiding it. Measured after: **one page**, slip at 0,0, no
  stray controls on the sheet. `printCss.test.js` now reads **both** files, because
  `display: none` on a body-level selector is the exact shape of the original bug and is
  safe only while the portal is there; either one alone prints a blank page.

  Found by producing the sample screenshot report, not by a test — no unit test can tell
  you what came out of a printer, which is why the slip's 19 tests all passed throughout.

### Added

- `src/utils/scoring.test.js` — **9 cases against a module that had none.**
  `calculateRiskScore` shipped to the public with zero tests and was wrong for its
  entire life. Covers the weekly/per-session distinction directly, so `CP1` cannot
  return silently. `35f46ad`

- `src/utils/ctaTierParity.test.js` — **5 cases.** Reads the tier names out of all three
  components and asserts every tier either pathway can emit has both a `CTA_BANNER`
  entry and a `tierPrimaries` entry. **It fails on `CP9` before the fix.** Parses by
  brace matching rather than indentation: an earlier draft sliced to end-of-file and
  reported `flexDirection` as a CTA tier, and a test whose parse is looser than the
  thing it checks is worse than none. `189a61b`

- `src/utils/theme.js` — one key, with a documented fallback and `try`/`catch` around
  every storage access, because Safari private mode throws on `localStorage`. `189a61b`

- 4 cases added to `scripts/firestore-rules-verify.mjs` for the
  `community_assessments` rule. Suite: **101 emulator checks, 0 failed** (re-run 2026-08-23 before the v2.0 merge). `45323f2`

### Audit

- A 158-agent adversarial sweep of the portal returned **75 verified findings** across
  seven surfaces. Five that change what a member of the public sees were re-verified
  by hand and are listed under Known Issues as `CP13`–`CP17`; one of them (`CP16`)
  corrects an earlier finding of my own. The remaining 70 are **not** transcribed into
  the ledger, because that file's evidence rule does not admit rows nobody has checked.

### Documentation

- [POSTMORTEM-COMMUNITY.md](POSTMORTEM-COMMUNITY.md) — architecture, stated purpose
  against delivered behaviour, twelve findings with `file:line`, and the plan for the
  next version. `31fafde`, corrected and extended `53f9bd7`.
- [COMMUNITY_TODO.md](COMMUNITY_TODO.md) — this work as a ledger, with the same
  evidence rule the roster ledger uses.

### Audit — pre-merge stress test, 2026-08-23

- `scripts/community-stress.mjs` + `npm run stress:community` — the counterpart to
  the roster harness, for the public screening. It reports; it applies no pass/fail
  threshold, because none has been agreed.

- **Green, and measured rather than assumed:** all 81 postal sectors parse in five
  written forms; 20,000 random digit strings produced no sector outside the table;
  the seven `CP19`-shaped labels all return `null`; 3,440 `servicesForSector` calls
  threw nothing, returned nothing empty and produced no duplicates; every quick-reply
  chip maps to the flag its author intended; the result page has no horizontal
  overflow between 280px and 1920px; ten hostile `sessionStorage` payloads produced
  no crash, no blank page and no script execution; the merged tree runs 2,277 tests
  green with a clean fast-forward and zero conflicts; `firestore.rules` passes 101
  emulator checks including cross-team isolation; all eleven Cloud Functions load,
  and the export set is a strict superset of `main`'s, so the deploy has nothing to
  orphan.

- **Eight findings, filed as `P7.1`–`P7.8` / `CP22`–`CP26` in
  [COMMUNITY_TODO.md](COMMUNITY_TODO.md).** The three that decide whether this merges:
  a completed assessment **dead-ends when Firestore is unreachable** (measured: 45s
  and still waiting); interaction telemetry is **counted as respondents** in the
  population rollup (12 people became 96, every domain rate 100% → 13%); and
  `MIN_CELL` — the suppression threshold the dashboard's privacy claim rests on —
  **can be cleared by one person's own clicks**.

  None of these was visible to the unit suites. All 2,253 tests passed throughout.

### Known issues — **authoritative list for this surface**

Open, and each one is live on the deployed portal today. Full detail in
[COMMUNITY_TODO.md](COMMUNITY_TODO.md).

| Id | | Why it is still open |
|---|---|---|
| **`CP6`** | The public chat calls the **staff** AI endpoint. `chatWithAura` has no `request.auth` check and no App Check, and its system prompt names KKH/SingHealth and prints the internal Firestore schema under a `DATA ENTRY AGENT` heading. It returns text and performs no write, so this is disclosure and an injection surface, not data modification. | Needs a second callable with its own prompt, then auth on the first. Ordered as `P0` in the ledger. |
| **`CP7`** | Unauthenticated and uncapped against a paid API key. Also: the chat discards the model's answer after 1,500 ms without aborting the request, so every late answer is billed and thrown away. | Depends on `CP6.1`. |
| **`CD10`** | Urgent advice — including *"call 995"* — is **English-only** on a four-language tool. Only the labels around it are translated. | **Owner's.** Translating urgent clinical advice is not a paraphrase job. `CTA_BANNER` already holds reviewed `ms`/`zh`/`ta` for the same tiers and is the source to adapt from. |
| **`CD11`** | The chat's cardiac screen asks two questions at once with single-tap chips, so a condition and exertional chest pain cannot both be recorded. Tapping the condition loses `symptomFlag` — and with it the URGENT tier — and routes the person to a paid exercise programme. The form pathway records both correctly. | **Owner's.** Splitting it changes the assessment instrument. |
| **`CD4`** | The URGENT tier's resource list includes an exercise programme. | **Owner's clinical call.** My recommendation is in the post-mortem, §3.4. |
| **`CP8`** | The prompt labels the inventory *"VERIFIED RESOURCE INVENTORY"* and the model quotes prices and hours to the public as fact. `lastVerified` is written on every seed run and **read by nothing**, so it records when a script ran, not when a human checked a price. | Needs a freshness contract, or the word "VERIFIED" removed. |
| **`CP13`** | **The portal shows no medical disclaimer and no privacy notice on screen.** Both exist only inside the off-screen PDF template (`ResultPage.jsx:746` and `:782`, nested inside the `top:-10000px` block opened at `:636`). The form pathway offers one half-sentence on step 4 of 4; **the chat pathway offers nothing at all** and still writes age band, gender, ethnicity, housing, postal sector and four health flags. | The smallest change with the largest exposure — move both onto the page, and put the notice before the first question. |
| **`CP14`** | **"Low Needs (Green)" tells people below the activity guidelines that they meet them.** The tier is banded off the *risk score*, not off PAVS: 100 min/week plus twice-weekly strength training scores 1 → Green → *"You meet the physical activity guidelines"*, on the same screen where the PAVS panel renders `below`. | Same conflation as `CP1`, in the copy rather than the arithmetic. |
| **`CP15`** | **The chat's clinical flags are unanchored substring regex over free text.** `/low/` matches inside "slowly", "follow" and "allow", so *"I walk slowly but I feel great"* is flagged as psychological distress. Negation-blind too: *"I do not get chest pain"* triggers URGENT. | Both directions over-triage — the safe way to be wrong, but still wrong, and it feeds the tier ladder. |
| **`CP16`** | **The seeded `resources` collection reaches nobody**, and **this corrects `CP8`.** Its 22 records are read only by `publicTriageChat`, which has no callers. The public actually sees a second, unrelated 16-entry registry hardcoded at `ResultPage.jsx:191-208` — which has no `lastVerified` field at all. | The freshness problem is real but lives in the other registry. |
| **`CP17`** | `index.html:5` sets `user-scalable=no`, **disabling pinch-zoom** on a tool built for elderly users. `index.html:2` is `<html lang="en">` and never changes, so a screen reader announces Malay, Chinese and Tamil content as English. | Two lines. |
| **`CP12`** | No `path="*"` route, so a mistyped URL renders a blank page. Four session ids minted per person, all four shown as *"ID:"*, and the one written to Firestore is the third. A finished assessment does not survive a reload. | Cheap; queued together in `P4`. |

---

## Before this file existed

The community portal shipped inside app releases up to **v2.0.0** with no changelog of
its own, and — as `CP1` shows — with no tests on its scoring. Nothing before
`[Unreleased]` above has been reconstructed, and this file does not pretend to a history
it did not record. [CHANGELOG.md](CHANGELOG.md) is the record for those releases.
