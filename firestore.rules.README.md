# `firestore.rules` — Owner's Runbook

> # ⚠️ SUPERSEDED BY THE MULTI-TEAM REWRITE — 2026-08-21
>
> **Everything below describes the SINGLE-TEAM rules file and is now history.** It is
> kept because the reconciliation record in §4 — the comparison against the live
> console rules that closed decision `Q6` — is evidence, and deleting evidence to
> tidy a document is how a repo stops being able to answer "why is it like this".
>
> **What changed, and why this document cannot simply be edited in place:**
>
> * `directory()`, `directoryNames()` and `adminEmails()` — the ten email addresses,
>   the ten display names, and the two admin addresses — **are deleted.** This
>   runbook's central tables enumerate them. They no longer exist.
> * Authorization is now a question asked of the database:
>   `exists(/databases/$(database)/documents/teams/$(teamId)/members/$(uid))`.
>   Onboarding a clinician is a lead adding a member document — **zero rule edits,
>   zero rules deploys**, which is the defect this runbook's own header called
>   "KNOWN, ACCEPTED".
> * Every collection moved beneath `teams/{teamId}/…`. The paths named throughout
>   this document — `system_data/roster_2026`, `shift_swaps`, `wellbeing_history`,
>   `staff_loads`, `cep_team`, `feed_posts`, `notifications` — are now **explicitly
>   unreachable**, and `scripts/firestore-rules-verify.mjs` asserts that.
> * A property that did not exist before is now the point of the file: **a member of
>   team A gets nothing from team B.**
>
> **The current record is the rules file's own header plus
> `scripts/firestore-rules-verify.mjs` — 91 checks, last run 2026-08-21 against the
> emulator, 0 failed.** Read those, not this. The one part below still worth reading
> is §4, which is how the live console was reconciled and how it should be
> reconciled again before the next deploy.


**Status: PROPOSAL. INERT. Nothing deploys it.**
**Subject: project `idc-app-e0c59`, Cloud Firestore, `(default)` database.**
**Companion to:** `firestore.rules` · closes the analysis half of `ROSTER_POSTMORTEM.md` C4 and decision **Q6** (`ROSTER_HANDOFF.md` §5).

> Q6 said: *"I need your console's current rules to do this safely."* That is still
> true. This document is what can be written **without** them: the access
> requirements derived from the code, a rules file implementing them, a
> verification record, and the exact procedure for you to compare it against
> whatever the console actually holds. **The comparison in §4 is yours to do and
> it is not optional.**

---

## 0. What is and is not wired

> ### ⚠️ REWRITTEN 2026-08-18 — THIS SECTION USED TO SAY THE OPPOSITE
>
> Everything below was `❌ deliberately not added` until the owner supplied the live
> console rules (see §4, which could finally be filled in) and the file was
> reconciled against them. **The rules are now wired.** The old table is not kept
> struck-through here because a table of ticks is exactly the thing a reader skims
> and mis-reads; the change is recorded in `CHANGELOG.md` instead.

| | |
|---|---|
| `firestore.rules` exists in the repo | ✅ tracked and committed |
| `firebase.json` has a `firestore` section | ✅ **added** — `"firestore": { "rules": "firestore.rules" }` |
| `.github/workflows/deploy.yml` touched | ✅ **args changed** to `deploy --only functions,firestore:rules` |
| `firebase deploy` would deploy it | ✅ yes |
| CI on merge to `main` would deploy it | ✅ **yes — merging to `main` changes the live authorization boundary** |
| Application code changed | ❌ none. Zero files under `src/` or `functions/` |

**⚠️ BOTH WIRING HALVES ARE REQUIRED AND ONLY ONE IS OBVIOUS.** The `firebase.json`
section is the documented step, but the workflow ran `--only functions`, which
**excludes rules**. With the section added and the args untouched, CI goes green,
this page says "wired", and nothing is enforced. If rules ever seem not to apply,
check that flag before anything else.

So merging this file no longer changes nothing. **It is the deploy.** Do §3
(pre-flight), §6 (Playground) and §7 (rollback) *before* the merge, not after.

---

## 1. Read this before anything else: what these rules would BREAK

Least privilege is not free. Nine current behaviours stop working. Seven are
things that arguably should never have worked; two are real losses. **Every one
of them is a decision for you, not for me.**

| # | Behaviour today | Under these rules | Verdict |
|---|---|---|---|
| **B1** | **Any of the 10 directory members can press Configure → Generate Roster** and rewrite the master roster. The button at `RosterView.jsx:813` has no admin gate. | Only **Alif** and **Nisa**. A CEP gets the honest banner already written at `RosterView.jsx:592` — *"The roster was NOT saved (permission-denied). Your configuration is still here."* | **Decide.** If a CEP is expected to generate rosters, add them to `adminEmails()` — or better, settle **Q5** in `ROSTER_HANDOFF.md` §5 first. |
| **B2** | **The public community screening pathway records telemetry.** `/individuals/*` is mounted outside the auth gate (`App.jsx:617-621`) and writes `community_assessments` from strangers' browsers with no account. | Denied. **The public user notices nothing** — `recordTelemetry` swallows its own error (`telemetry.js:16-19`) and never throws, so they still reach their result page. **You simply stop receiving the data, silently.** | **Real loss. Decide.** Do *not* just open the rule (see §9, `community_assessments`). |
| **B3** | The **unauthenticated Sandbox** reads the live feed. `FeedsView.jsx:114` has no `isDemo` guard, no auth guard, and **no error callback**. | Denied, and **silently** — the visitor sees only mock posts with no indication anything failed. | Correct, but the silence is bad. Add an error callback to that listener (the sibling of QC **M8** (M8 itself closed in v1.6.1; the recommendation below still stands)). |
| **B4** | The **Sandbox writes to the live pulse heat-map** and the live anonymous log bucket. `AuraPulseBot.jsx:550-553` runs on the `isDemo` branch, and demo mode needs no login. | Denied. A sandbox visitor sees *"Could not sync your pulse log."* | **Bug fix.** `RosterView.jsx:457` already declares "NO FIRESTORE, EVER" for the sandbox roster path; this extends that contract. |
| **B5** | Anonymous-persona pulse rows land in the live heat-map under keys like `Anon_4718`. | Denied — a member may only write their own name's key. | **Bug fix.** |
| **B6** | Any signed-in user can log clinical load or team attendance into **any** document via AURA's DATA_ENTRY mode (`AuraPulseBot.jsx:852`). | Own `staff_loads` document only; `monthly_workload` is admin-only. Non-admins get the DATA_ENTRY error bubble. | **Bug fix**, but it changes what AURA can do for a CEP. Decide. |
| **B7** | Sandbox AURA writes real `demo_*` collections. | Denied. | **Bug fix.** |
| **B8** | The **unauthenticated Sandbox can file beta feedback.** | Denied. | Decide. Recovering it properly means a Cloud Function with App Check. |
| **B9** | For legacy posts authored as the placeholder `"Staff Member"`, `FeedsView.jsx:271` shows **every** user a Delete button. | The button appears and the delete is refused. | Pre-existing UI bug, now visible. Fix the author test in the app. |

### And one thing these rules would NOT break, but you must check first

**A clinician who edited the "Role"/"Name" fields on their Profile page can be
locked out of swaps, comments and their pulse row.** `App.jsx:174` merges
`users/{uid}` **over** the directory profile, so `user.name` is whatever they last
typed. Every name-keyed document in this app — `shift_swaps.targetStaff`,
`daily_pulse` keys, `notifications.recipient`, `feed_posts.author` — is compared
against that value.

**This is already broken today**, silently: a renamed user's swap listener
(`AuraPulseBot.jsx:132`, `where('targetStaff','==',user.name)`) already matches
nothing. These rules turn that silence into a visible `permission-denied`.
**§3 pre-flight check 2 is how you find out before you deploy, and it is the single
most important step in this document.**

---

## 2. The access requirements, derived from the code

Found by grepping `doc(`, `collection(`, `setDoc`, `addDoc`, `updateDoc`,
`onSnapshot`, `getDoc`, `getDocs`, `deleteDoc`, `query(` across `src/` **and**
`functions/`, then reading every call site. Not guessed, not assumed from the
brief — three paths in the brief's expected list turned out to be wrong or
incomplete, and eight paths the brief did not mention exist.

**Cloud Functions do not appear in this table's "who writes" column** because
`functions/index.js` uses the Admin SDK, which **bypasses security rules
entirely**. That is why `resources` and feed-post *creation* need no client
permission at all.

| Path | Legitimate readers | Legitimate writers | Key call sites |
|---|---|---|---|
| `system_data/roster_2026` | every member | admins (generate, many keys); any member (**one existing day**, swap) | `RosterView.jsx:372`, `:575`; `AuraPulseBot.jsx:466`, `:484`, `:488` |
| `shift_swaps/{id}` | the two named parties, + admins | creator = self, or admin on-behalf; `targetStaff` decides | `RosterView.jsx:709`; `AuraPulseBot.jsx:131`, `:455`, `:506` |
| `system_data/daily_pulse` | every member | own name key; admins any | `WellbeingView.jsx:42`, `:146`; `AuraPulseBot.jsx:553`, `:556` |
| `system_data/monthly_attendance` | every member | admins | `App.jsx:274`; `AdminPanel.jsx:126`, `:235` |
| `system_data/reports_{year}` | every member ⚠️ *see §9* | admins | `SmartReportView.jsx:148`; `SmartAnalysis.jsx:121` |
| `wellbeing_history/{directoryId}` | owner + admins | owner | `AuraPulseBot.jsx:555`; `AdminWellbeingPanel.jsx:24` |
| `wellbeing_history/_anonymous_logs` | **nobody** | any member | `AuraPulseBot.jsx:550-552` |
| `users/{authUid}` | self | self | `App.jsx:174`, `:219`; `ProfileView.jsx:17`, `:60`, `:75`, `:113`; `NexusContext.jsx:24`; `WellbeingView.jsx:52`, `:100` |
| `users/{directoryId}` ⚠️ | nothing reads it | self | `AuraPulseBot.jsx:557` — **different keying, same collection** |
| `cep_team/{staffId}` | every member | admins | `App.jsx:255`; `AdminPanel.jsx:262`, `:287`, `:306`, `:327` |
| `archive_{year}/{staffId}` | every member | admins | `App.jsx:255`; `AdminPanel.jsx:86`, `:181`, `:184`; `SmartAnalysis.jsx:133` |
| `staff_loads/{staffId}` | every member | own doc + admins | `App.jsx:265`; `AdminPanel.jsx:110`, `:205`; `AuraPulseBot.jsx:852` |
| `monthly_workload/{mmm_yyyy}` | **nobody** | admins | `AuraPulseBot.jsx:861` |
| `feed_posts/{id}` | every member | counters only; author/admin may delete. **Created by Cloud Function** | `FeedsView.jsx:114`, `:60`, `:204`, `:174`; `functions/index.js:615`, `:625` |
| `feed_posts/{id}/comments/{id}` | every member | own-name create | `FeedsView.jsx:41`, `:59` |
| `notifications/{id}` | named recipient | recipient's `read` flag. **No writer exists in the codebase** | `App.jsx:225`, `:322` |
| `beta_feedback/{id}` | **nobody** | any member (create) | `FeedbackWidget.jsx:29` |
| `smart_database/{docId}` | **nobody** | any member (create) | `AuraPulseBot.jsx:753`, `:792` |
| `community_assessments/{id}` | **nobody** | ⚠️ **the public today** | `telemetry.js:13` ← `ConventionalForm.jsx:676`, `AuraChat.jsx:814`, `ResultPage.jsx:529/568/577` |
| `resources/{id}` | **no client** — Cloud Function only | offline seed script only | `functions/index.js:688-719`; `scripts/firestore_seed.cjs:825` |
| `demo_*/{id}` | **no client** | ⚠️ sandbox today | `AuraPulseBot.jsx:829` |
| *anything the LLM invents* | — | — | `AuraPulseBot.jsx:829-835` builds the collection name from Gemini output (`functions/index.js:261`). Default-deny is the only thing standing between a model hallucination and a new collection. |

### Two facts that shaped the whole design

1. **The identity in the documents is a display name, not a uid.** So the rules
   embed a copy of `TEAM_DIRECTORY` keyed by lower-cased email. Cost and
   maintenance hazard: §10.
2. **`user?.role === 'admin'` is self-assignable.** `ProfileView.jsx:75` writes a
   `role` field into `users/{uid}`; `App.jsx:174` merges it over the directory
   profile; `App.jsx:314` and `RosterView.jsx:613/:644` then believe it. **Typing
   "admin" into your own Profile Role box currently unlocks the Admin Panel.**
   Nothing in the rules trusts that field — `isAdmin()` is an email allowlist —
   and the `users` rule additionally refuses to *store* `role: 'admin'` from a
   non-admin. **This is a live privilege-escalation path in the app and it
   deserves its own fix regardless of what you do with this file.**

---

## 3. Pre-flight: three checks to run BEFORE you touch anything

Each is read-only. Do them in the Firebase console → Firestore → Data.

**Check 1 — the roster's shape (also answers post-mortem A1's LIVE-VERIFY PENDING).**
Open `system_data/roster_2026`. Note the top-level field names: they must all look
like `2026-02-02`. If any top-level field is *not* a `YYYY-MM-DD` string, the
one-changed-key swap rule still works, but tell me — it means something else is
writing this document.

**Check 2 — THE LOCKOUT CHECK. Do not skip this.**
Open the `users` collection. For **every** document, compare its `name` field
against `TEAM_DIRECTORY` in `src/utils/index.js`:

| directory name | must match `users/*.name` exactly |
|---|---|
| `Alif`, `Nisa`, `Evelyn`, `Benny`, `Ashik`, `Mini`, `Brandon`, `Ying Xian`, `Derlinder`, `Fadzlynn` | any mismatch = that person will hit `permission-denied` on swaps, comments and their pulse row |

If you find a mismatch, **fix the data** (set `name` back to the directory value)
or **fix `directoryNames()`/`directory()`** in the rules to match reality —
before deploying, not after.

**Check 3 — the emails.**
Firebase console → Authentication → Users. Confirm each account's email is
**exactly** one of the ten in `directory()`. Two known problems, both pre-existing:

- `benny.loo.k.g.@singhealth.com.sg` and `mohammad.ashik.zainuddin@singhealth.com.sg`
  are `@singhealth.com.sg`, but `WelcomeScreen.jsx:107` rejects anything not ending
  `@kkh.com.sg` **before** it checks the directory. **These two people cannot log
  in today at all**, whatever the rules say.
- `benny.loo.k.g.@` has a **trailing dot** in the local part, which is not a valid
  RFC 5321 address. Firebase Auth may have refused to create it.

I have not "fixed" either, because inventing a colleague's real email address is
exactly the kind of unverified claim this repo does not make. **Tell me the real
addresses and I will correct `directory()`.**

---

## 4. Diff the proposal against the console's current rules

> ### ✅ DONE 2026-08-18 — the console rules were supplied by the owner
>
> This section existed to be filled in and never could be. It now can. What was live:
>
> ```
> function isVerifiedStaff() {
>   return request.auth != null && request.auth.token.email_verified == true
>          && request.auth.token.email.lower().matches('.*@kkh\\.com\\.sg');
> }
> match /beta_feedback/{document}         { allow create: if true; allow read, update, delete: if false; }
> match /feeds/{document=**}              { read/create if isVerifiedStaff(); update/delete if author }
> match /community_assessments/{doc=**}   { allow create: if true; read/update/delete if isVerifiedStaff(); }
> match /community_resources/{doc=**}     { allow read: if true; allow write: if isVerifiedStaff(); }
> match /{document=**}                    { allow read, write: if isVerifiedStaff(); }   // ← everything else
> ```
>
> **The finding.** `isVerifiedStaff()` is *any* verified `@kkh.com.sg` address, not the
> ten-person directory, and the catch-all grants it read+write on **everything** —
> `wellbeing_history` (the per-clinician burnout record), `system_data/roster_2026`,
> `shift_swaps`, `users`. The app's Firebase API key is public, so any KKH employee who
> registers an account has that access today. Whole-hospital exposure, not internet-wide.
>
> **Five collections, checked against the codebase rather than assumed:**
>
> | Collection | Console | Referenced by | Verdict |
> |---|---|---|---|
> | `community_resources` | public read | **0 hits** in `src/` or `functions/` | dead block — no rule written here |
> | `feeds/{document=**}` | staff read/write | **0 hits as a collection** — `feeds` is a UI view name (`ResponsiveLayout.jsx`) | dead block — the real one is `feed_posts` |
> | `community_assessments` | `create: if true` | `telemetry.js:13`, public, no account | **live pathway** — kept open, shape-pinned |
> | `beta_feedback` | `create: if true` | `FeedbackWidget.jsx`, login-free sandbox | **live pathway** — kept open, shape-pinned |
> | `resources` | catch-all | `functions/index.js` only (Admin SDK) | rules never apply — correctly granted nothing |
>
> **Why this mattered.** The pre-reconciliation proposal required `isMember()` on both live
> pathways. Deploying it unchanged would have stopped public screening telemetry and sandbox
> feedback **silently** — `recordTelemetry` swallows its own error, so nothing visible breaks
> and the data simply stops arriving. Both now ship open-but-shape-pinned, which is strictly
> tighter than the console's unpinned `if true`, with the accepted risk written into each block.

### The original routes, kept for the next time


**There is no `firebase firestore:rules:get` command** — I checked the installed
CLI (v15.15.0); `firestore:*` covers databases, indexes, backups and delete, and
nothing reads rules. So there are two routes.

### Route A — console (no tooling, works for everyone)

1. Firebase console → **Firestore Database** → **Rules** tab.
2. The editor shows the **live** ruleset. Select all, copy.
3. Save it — this is your rollback source **and** the first record anyone has of
   what production actually enforces:
   ```bash
   pbpaste > ~/nexus-rules-LIVE-$(date +%Y%m%d).rules     # macOS
   ```
4. Diff:
   ```bash
   diff -u ~/nexus-rules-LIVE-$(date +%Y%m%d).rules \
           /Users/muhammadalif/Documents/GitHub/nexus/firestore.rules | less
   ```
5. Also click **Rules → history** (the clock icon). Note the date of the current
   version. **Write that version down** — §7 rolls back to it.

### Route B — Rules REST API (scriptable)

Requires an access token from `gcloud auth login` (an interactive Google sign-in
you perform; nothing in this repo does it for you).

```bash
PROJECT=idc-app-e0c59
TOKEN=$(gcloud auth print-access-token)

# 1. which ruleset is live for Firestore?
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://firebaserules.googleapis.com/v1/projects/$PROJECT/releases/cloud.firestore"

# 2. fetch that ruleset's source (paste the "rulesetName" from step 1)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://firebaserules.googleapis.com/v1/<rulesetName>" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['source']['files'][0]['content'])" \
  > ~/nexus-rules-LIVE.rules

diff -u ~/nexus-rules-LIVE.rules firestore.rules
```

### What you are looking for in that diff

| If the live rules say… | then… |
|---|---|
| `allow read, write: if true;` | you are wide open to the internet. Deploy something — this file, or anything. |
| `allow read, write: if request.auth != null;` | the likely current state. Any signed-in Firebase account in the project can read and rewrite the roster and every wellbeing record. |
| `allow read, write: if false;` | everything is denied and the app cannot be working — so this is not what is live. |
| anything referencing collections **not** in §2 | **stop and tell me.** Something outside this repo writes to that project, and my "no client touches this" claims for `resources`/`demo_*` may be wrong. |
| a timestamp-based lockdown (`request.time < timestamp.date(...)`) | a default from `firebase init` that has expired or is about to. Explains a lot if the app has been failing. |

---

## 5. Verification record — measured, not asserted

> ### ⚠️ THIS RECORD DOES NOT COVER TWO BLOCKS. READ BEFORE TRUSTING IT.
>
> The 139 checks below were run against the file **as it stood before the 2026-08-18
> reconciliation**. Two blocks changed after that run and are therefore **NOT covered by any
> assertion on this page**:
>
> | Block | Was | Is now | Status |
> |---|---|---|---|
> | `community_assessments` | `create: if isMember()` · `read: if false` | anonymous create, shape-pinned · `read: if isMember()` | ✅ **re-verified — see §5.4** |
> | `beta_feedback` | `create: if isMember()` + shape pins | anonymous create, same shape pins | ✅ **re-verified — see §5.4** |
>
> Everything else in the file is byte-identical to what the 139 checks exercised, and those
> results stand.
>
> **This banner exists because letting an old green record vouch for new rules is the exact
> failure this project's post-mortem is about** — four ledger rows marked `DONE` while the
> source files were byte-identical to `HEAD`. A verification record that silently widens its
> own scope is the same defect wearing a tie. The scope is therefore stated explicitly above
> rather than left to be inferred from a single green tick at the top of the section.

### 5.4 Re-verification of the reconciled blocks — 31 checks, 31 as specified

**2026-08-18, run against the emulator, and committed as a script rather than recorded as
prose:** `scripts/firestore-rules-verify.mjs`. It lives in `scripts/` because
`vitest.config.js` collects `src/**/*.{test,spec}.{js,jsx}` — a rules test there would fail
every build, which is why §5 originally committed nothing. `scripts/` is outside that glob, so
this one is runnable by anybody with the four-command setup in its header. Project id
`demo-nexus-rules`; it never contacts `idc-app-e0c59`.

| Group | Checks | What it proves |
|---|---|---|
| `beta_feedback` | 8 | an anonymous sandbox visitor **can** file feedback; extra keys, >10,000 chars, an empty message and a client clock are all refused; nobody — **including an admin** — can read it back |
| `community_assessments` | 8 | a member of the public **can** submit; missing/oversized `postalSector`, a back-dated `createdAt` and >20 keys are refused; the public cannot read back; a directory member can; **a verified KKH outsider cannot** |
| **`Q6` itself** | 4 | a verified `@kkh.com.sg` address outside `directory()` can no longer read the burnout record, read the roster, overwrite the roster, or read swaps — **all four of which it could do before** |
| roster verb split | 6 | admin can Generate; a CEP cannot; a CEP can replace exactly one existing day; cannot change two; cannot add a day; nobody can delete |
| `wellbeing_history` | 5 | own record readable, a colleague's is not, admin can list, a non-admin member cannot, the anonymous bucket is unreadable even by an admin |

⚠️ **One case passed spuriously on the first run and the fix is recorded because the failure
mode generalises.** `changedKeys()` is `diff().affectedKeys()` — keys whose **value changed**,
not keys **written**. The "cannot change two days in one write" case originally wrote `[]` over
a day that was already `[]`; that is not an affected key, so only one key changed and the case
passed while proving nothing. It now writes two genuinely different values, and a warning sits
at the top of the script. **A rules test that writes a value back unchanged is testing
nothing** — the same class of defect as this repo's demo assertion that "would have passed
forever" (`ROSTER_HANDOFF.md` §0).


**No emulator-based test suite is committed, on purpose.** CI has no Firestore
emulator (`.github/workflows/deploy.yml` runs test, lint and build — no emulator), and vitest collects
`src/**/*.{test,spec}.{js,jsx}` — a rules test file placed there would fail every
build and block deploys. So the verification below was run **locally, in a
scratch directory, against the cached emulator jar**, and is recorded here as
evidence rather than automated.

It never authenticated to Google and never contacted `idc-app-e0c59`: the project
id used was `demo-nexus-rules`, which the CLI treats as a demo project
(*"attempts to access non-emulated services for this project will fail"*).

### 5.1 Syntax

`firebase emulators:exec --only firestore,auth --project demo-nexus-rules` loaded
the file with **no compilation errors and no warnings** (`firestore-debug.log`
clean).

### 5.2 Behaviour — 139 checks, 139 as specified

Driven through the repo's own `firebase@10.14.1` client SDK against the Firestore
and Auth emulators, with real accounts for Brandon, Ying Xian, Fadzlynn, Alif,
Mini (deliberately mixed-case email), a signed-in non-directory outsider, and an
unauthenticated client. Seeding used the emulator's owner bypass so the seed
itself was not subject to the rules under test.

```
TOTAL 139   PASS 139   MISMATCH 0
```

Selected results — the ones that matter:

| id | scenario | expected | observed |
|---|---|---|---|
| A1 | unauthenticated read of the master roster | DENY | DENY |
| A2 | signed-in **non-directory** account reads roster | DENY | DENY |
| A3/A4 | CEP, and a viewer with a mixed-case email, read roster | ALLOW | ALLOW |
| R1 | **CEP presses Generate (2 date keys)** | DENY | DENY |
| R2/R12 | admin generates (existing / fresh document) | ALLOW | ALLOW |
| R3 | **CEP applies a swap: one existing date key** | ALLOW | ALLOW |
| R4/R5 | CEP writes two days / invents a new day | DENY | DENY |
| R7 | CEP blanks the roster (`setDoc`, no merge) | DENY | DENY |
| R8/R9 | anyone, including an admin, deletes the roster | DENY | DENY |
| S1 | Brandon requests cover for his own duty | ALLOW | ALLOW |
| S2 | **Brandon forges a request in Ying Xian's name** | DENY | DENY |
| S3 | non-admin uses the on-behalf path | DENY | DENY |
| S4/S5 | admin arranges cover, correctly / misattributed | ALLOW / DENY | as expected |
| S7 | `swapRole: null` — the **A3 regression latch** | DENY | DENY |
| S12 | client clock instead of `serverTimestamp()` | DENY | DENY |
| T1/T2 | named `targetStaff` approves / declines | ALLOW | ALLOW |
| T3/T4/T5 | requester / **admin** / bystander approves | DENY | DENY |
| T11 | target re-decides a settled swap | DENY | DENY |
| Q1 | **AURA's actual listener query** (target + PENDING) | ALLOW | ALLOW |
| Q2 | unfiltered scan of the swap ledger | DENY | DENY |
| W3/W5 | colleague / admin reads a wellbeing history | DENY / ALLOW | as expected |
| W6 | **admin burnout panel's unfiltered list still works** | ALLOW | ALLOW |
| W9/W10 | member / admin targeted-reads the anonymous bucket | DENY | DENY |
| P3/P4 | overwrite a colleague's pulse row / `Anon_4718` key | DENY | DENY |
| U6 | **self-promotion to `role: "admin"`** | DENY | DENY |
| N1/N2 | `App.jsx`'s real notification query / unfiltered scan | ALLOW / DENY | as expected |
| Z4 | **LLM invents a collection name** (`patient_records`) | DENY | DENY |

Every listener query the app actually issues was run as a query, not faked as a
document read — that is the only way to know a `list` rule is satisfiable.

### 5.3 Mutation check — is the matrix real?

Each predicate in the rules was broken **one at a time** and the matrix re-run, to
find checks that cannot fail. 30 mutants:

| mutant | checks that noticed |
|---|---|
| M01 roster: drop "exactly one key changed" | 4 — R1, R4, R6, R7 |
| M02 roster: drop "adds no new keys" | 1 — R5 |
| M03 roster: generation open to any member | 6 — R1, R4, R5, R6, R7, R11 |
| **M04 roster: colleague path may also CREATE** | **0 — equivalent mutant, see below** |
| M05 swap create: drop the self/on-behalf test | 3 — S2, S3, S5 |
| M06 allow any status on create | 1 — S6 |
| M07 drop `swapRole` domain check | 2 — S7, S8 |
| M08 drop the date-format check | 1 — S11 |
| M09 accept a client clock | 1 — S12 |
| M10 drop the create field allowlist | 1 — S13 |
| M11 drop "both are colleagues" | 1 — S9 |
| M12 anyone may approve | 1 — T3 |
| M13 drop the PENDING precondition | 1 — T11 |
| M14 drop the changed-field allowlist | 1 — T7 |
| M15 allow any status value | 1 — T8 |
| M16 `isMember()` → `isSignedIn()` | 3 — A2, R10, U11 |
| M17 `isAdmin()` → `isMember()` | **23** |
| M18 pulse: drop own-key restriction | 2 — P3, P4 |
| M19 users: drop the `role:'admin'` block | 1 — U6 |
| M20 users: drop the own-document test | 1 — U5 |
| M21 wellbeing: drop the anonymous-bucket exclusion | 1 — W10 |
| M22 wellbeing: drop the owner test on write | 1 — W2 |
| M23 archive regex loosened to a prefix | 2 — C4, C6 |
| M24 reports regex loosened to a prefix | 2 — Y4, Y6 |
| M25 feed update not limited to counters | 1 — F5 |
| M26 feed delete not limited to the author | 2 — F7, F14 |
| M27 comment author not pinned | 1 — F11 |
| M28 notifications: drop the recipient test | 2 — N2, N3 |
| M29 `staff_loads`: drop the own-document test | 2 — L3, L5 |
| M30 `smart_database`: author unpinned, update allowed | 1 — K6 |

**29 of 30 mutants were caught. The rules file was restored byte-exact
(sha256 `be26d89e…` before and after).**

**Two things this exercise found that review had not:**

1. **A check of mine that could not fail.** The first draft's
   `allow read` on `wellbeing_history/{staffId}` silently re-opened
   `_anonymous_logs` to admins, because rules are OR'd across matching blocks and
   a `false` cannot subtract from an `allow`. Case **W10** caught it; the fix was
   to split `get` from `list`. **A comment in the file had asserted the opposite.**
2. **A predicate of mine that could not fail.** `resource != null` on the
   colleague roster path was dead: Firestore only evaluates an `update` rule when
   the document exists. It was **removed**, not kept as decoration. M04 is now an
   *equivalent* mutant — granting `create` there still denies, and I measured
   why: `diff()` on a null `resource` raises `Null value error`, which Firestore
   treats as deny (`evaluation error at L332:32 for 'create'`).

---

## 6. Rules Playground cases

Console → Firestore → **Rules** → **Rules Playground** (bottom panel). Paste the
proposal into the editor **without clicking Publish** — the Playground simulates
against the editor's contents, not the live rules.

For every case, open the **Authentication** toggle, set provider to
`Email/Password`, set the **uid** to anything, and — this is the part people miss —
**add `email` to the auth token payload**. `isMember()` reads
`request.auth.token.email`; with no email the caller is a non-member and
*everything* denies.

> **Known Playground limitation, stated because I have not observed the UI myself:**
> two predicates compare a field to `request.time`
> (`shift_swaps.timestamp` on create, `comments.timestamp` on create). A
> hand-typed timestamp will not equal `request.time`, so cases 5 and 12 may deny
> for that reason alone. If a create denies unexpectedly, comment those two lines
> out *in the Playground editor only* and re-run. Both are covered by emulator
> cases **S1/S12** and **F10/F12** in §5.

| # | Simulation | Location | Auth `email` | Payload / notes | Expect |
|---|---|---|---|---|---|
| 1 | `get` | `/system_data/roster_2026` | *(unauthenticated)* | — | ❌ **Denied** |
| 2 | `get` | `/system_data/roster_2026` | `brandon.feng.gg@kkh.com.sg` | — | ✅ Allowed |
| 3 | `get` | `/system_data/roster_2026` | `someone@gmail.com` | — | ❌ Denied |
| 4 | `update` | `/system_data/roster_2026` | `brandon.feng.gg@kkh.com.sg` | one field only: `2026-02-02` (array). **The document must already have that field** | ✅ Allowed |
| 5 | `update` | `/system_data/roster_2026` | `brandon.feng.gg@kkh.com.sg` | two fields: `2026-02-02` **and** `2026-02-03` | ❌ Denied |
| 6 | `update` | `/system_data/roster_2026` | `brandon.feng.gg@kkh.com.sg` | one field the document does **not** have: `2026-03-09` | ❌ Denied |
| 7 | `create`/`update` | `/system_data/roster_2026` | `muhammad.alif@kkh.com.sg` | any shape | ✅ Allowed |
| 8 | `delete` | `/system_data/roster_2026` | `muhammad.alif@kkh.com.sg` | — | ❌ Denied |

**Swap creation** — payload for case 9 (paste into the Playground's document
builder; `timestamp` see the limitation note):

```json
{
  "requestedBy": "Brandon",
  "targetStaff": "Ying Xian",
  "originalShiftDate": "2026-02-02",
  "originalTask": "AM Clinic (Ortho)",
  "swapRole": "coLead",
  "reason": "Clinic clash",
  "status": "PENDING",
  "timestamp": "<request.time>"
}
```

| # | Simulation | Location | Auth `email` | Change to the payload above | Expect |
|---|---|---|---|---|---|
| 9 | `create` | `/shift_swaps/newdoc` | `brandon.feng.gg@kkh.com.sg` | as-is | ✅ Allowed |
| 10 | `create` | `/shift_swaps/newdoc` | `brandon.feng.gg@kkh.com.sg` | `"requestedBy": "Ying Xian"`, `"targetStaff": "Fadzlynn"` — **forgery** | ❌ Denied |
| 11 | `create` | `/shift_swaps/newdoc` | `brandon.feng.gg@kkh.com.sg` | add `"initiatedBy": "Brandon"` — non-admin on-behalf | ❌ Denied |
| 12 | `create` | `/shift_swaps/newdoc` | `muhammad.alif@kkh.com.sg` | add `"initiatedBy": "Alif"` | ✅ Allowed |
| 13 | `create` | `/shift_swaps/newdoc` | `brandon.feng.gg@kkh.com.sg` | `"status": "APPROVED"` | ❌ Denied |
| 14 | `create` | `/shift_swaps/newdoc` | `brandon.feng.gg@kkh.com.sg` | `"swapRole": null` | ❌ Denied |
| 15 | `create` | `/shift_swaps/newdoc` | `brandon.feng.gg@kkh.com.sg` | `"originalShiftDate": "02/02/2026"` | ❌ Denied |
| 16 | `create` | `/shift_swaps/newdoc` | `brandon.feng.gg@kkh.com.sg` | `"targetStaff": "Brandon"` — swap with self | ❌ Denied |

**Swap transition** — these need an existing document. Seed one by hand in the
Data tab at `/shift_swaps/playground_test` with the case-9 payload, then:

| # | Simulation | Location | Auth `email` | Payload | Expect |
|---|---|---|---|---|---|
| 17 | `update` | `/shift_swaps/playground_test` | `lim.ying.xian@kkh.com.sg` | `{"status":"APPROVED","approvedAt":"2026-02-01T10:00:00Z"}` + all other fields unchanged | ✅ Allowed |
| 18 | `update` | `/shift_swaps/playground_test` | `brandon.feng.gg@kkh.com.sg` | `{"status":"APPROVED"}` — the **requester** approving | ❌ Denied |
| 19 | `update` | `/shift_swaps/playground_test` | `muhammad.alif@kkh.com.sg` | `{"status":"APPROVED"}` — an **admin** approving | ❌ Denied |
| 20 | `update` | `/shift_swaps/playground_test` | `lim.ying.xian@kkh.com.sg` | `{"status":"APPROVED","originalTask":"PM Clinic"}` | ❌ Denied |
| 21 | `delete` | `/shift_swaps/playground_test` | `lim.ying.xian@kkh.com.sg` | — | ❌ Denied |

**The rest of the surface:**

| # | Simulation | Location | Auth `email` | Payload | Expect |
|---|---|---|---|---|---|
| 22 | `get` | `/wellbeing_history/brandon` | `brandon.feng.gg@kkh.com.sg` | — | ✅ Allowed |
| 23 | `get` | `/wellbeing_history/fadzlynn` | `brandon.feng.gg@kkh.com.sg` | — | ❌ Denied |
| 24 | `get` | `/wellbeing_history/fadzlynn` | `muhammad.alif@kkh.com.sg` | — | ✅ Allowed |
| 25 | `get` | `/wellbeing_history/_anonymous_logs` | `muhammad.alif@kkh.com.sg` | — | ❌ Denied |
| 26 | `update` | `/wellbeing_history/_anonymous_logs` | `brandon.feng.gg@kkh.com.sg` | `{"logs":[...]}` | ✅ Allowed |
| 27 | `update` | `/system_data/daily_pulse` | `brandon.feng.gg@kkh.com.sg` | `{"Brandon":{"energy":90}}` | ✅ Allowed |
| 28 | `update` | `/system_data/daily_pulse` | `brandon.feng.gg@kkh.com.sg` | `{"Fadzlynn":{"energy":10}}` | ❌ Denied |
| 29 | `update` | `/system_data/daily_pulse` | `brandon.feng.gg@kkh.com.sg` | `{"Anon_4718":{"energy":50}}` | ❌ Denied |
| 30 | `update` | `/system_data/monthly_attendance` | `brandon.feng.gg@kkh.com.sg` | `{"2026":[1]}` | ❌ Denied |
| 31 | `get` | `/system_data/reports_2026` | `brandon.feng.gg@kkh.com.sg` | — | ✅ Allowed ⚠️ *§9* |
| 32 | `get` | `/system_data/anything_else` | `muhammad.alif@kkh.com.sg` | — | ❌ Denied |
| 33 | `update` | `/users/<Brandon's real uid>` | `brandon.feng.gg@kkh.com.sg` | `{"role":"admin"}` | ❌ Denied |
| 34 | `update` | `/users/<Brandon's real uid>` | `brandon.feng.gg@kkh.com.sg` | `{"role":"CEP","bio":"x"}` | ✅ Allowed |
| 35 | `update` | `/users/brandon` | `brandon.feng.gg@kkh.com.sg` | `{"aura_memory":"walk"}` — directory-id keying | ✅ Allowed |
| 36 | `get` | `/users/<Ying Xian's uid>` | `brandon.feng.gg@kkh.com.sg` | — | ❌ Denied |
| 37 | `update` | `/staff_loads/brandon` | `brandon.feng.gg@kkh.com.sg` | `{"data":[5]}` | ✅ Allowed |
| 38 | `update` | `/staff_loads/fadzlynn` | `brandon.feng.gg@kkh.com.sg` | `{"data":[5]}` | ❌ Denied |
| 39 | `update` | `/feed_posts/<id>` | `brandon.feng.gg@kkh.com.sg` | `{"likes":2}` | ✅ Allowed |
| 40 | `update` | `/feed_posts/<id>` | `brandon.feng.gg@kkh.com.sg` | `{"raw_text":"edited"}` | ❌ Denied |
| 41 | `delete` | `/feed_posts/<id authored by Fadzlynn>` | `brandon.feng.gg@kkh.com.sg` | — | ❌ Denied |
| 42 | `create` | `/community_assessments/x` | *(unauthenticated)* | any | ❌ Denied ⚠️ **B2** |
| 43 | `get` | `/resources/AHL-001` | `muhammad.alif@kkh.com.sg` | — | ❌ Denied |
| 44 | `create` | `/patient_records/x` | `muhammad.alif@kkh.com.sg` | any | ❌ Denied |

**Every ❌ above must actually be denied and every ✅ allowed before you go near
§8.** If any case disagrees, the rules and this document are out of step — stop
and say so.

---

## 7. Rollback — read this before §8, not after

Rules deploys are near-instant and so are rollbacks. **There is no data migration
and nothing is destroyed**, which is the one genuinely reassuring fact here: a
bad rules deploy is fully reversible in about 60 seconds.

### Fastest: the console's rules history (no CLI, works from a phone)

1. Firebase console → **Firestore Database** → **Rules**.
2. Click the **history / clock** icon beside the editor.
3. Select the version dated **before** your deploy (the one you noted in §4).
4. Click **Restore**, then **Publish**.

### CLI

```bash
cd /Users/muhammadalif/Documents/GitHub/nexus
cp ~/nexus-rules-LIVE-YYYYMMDD.rules /tmp/rollback.rules   # the §4 capture
# point firebase.json at the rollback file, then:
firebase deploy --only firestore:rules --project idc-app-e0c59
```

### Emergency valve

If the team is locked out and you cannot find the old rules, publish this in the
console editor to restore the pre-existing (insecure but working) posture — then
diagnose calmly:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if request.auth != null; }
  }
}
```

**Symptoms that mean "roll back now":**

| Symptom | Where it shows |
|---|---|
| *"You do not have permission to read the master roster"* | `RosterView.jsx:385` banner — good, it tells you |
| *"I am not permitted to read coverage requests"* | AURA panel, `AuraPulseBot.jsx:176` |
| Calendar empty for everyone | roster read denied |
| Feed shows only mock posts | `feed_posts` read denied — **silent, no banner** |
| Pulse heat-map empty | `daily_pulse` read denied — **silent, no banner** |
| Burnout monitor blank | `wellbeing_history` list denied — **silent, no banner** |

Four of those six are silent. **Do not deploy this on a Friday, and do not deploy
it without one clinician on a phone to you.**

---

## 8. Deploy — only after §3, §4, §6 and §7

### 8.1 Wire it up (the deliberate manual step)

Add to `firebase.json` — and *only* this:

```json
  "firestore": {
    "rules": "firestore.rules"
  },
```

⚠️ **The moment you add that, `firebase deploy` with no `--only` flag will deploy
rules too.** Get in the habit of the flag.

⚠️ **Do not add rules to `.github/workflows/deploy.yml`.** That workflow runs on
every merge to `main`. An accidental rules change reaching production through a
merge is the exact failure mode this whole file is written to avoid. Rules should
be a deliberate, attended, human deploy until a rules test suite runs in CI.

### 8.2 Deploy

```bash
cd /Users/muhammadalif/Documents/GitHub/nexus
firebase deploy --only firestore:rules --project idc-app-e0c59
```

Nothing else deploys. Hosting and Functions are untouched. **No `npm run build`
is needed** — rules are not part of the bundle.

### 8.3 Smoke test, in this order, within five minutes

1. **You** (admin) — log in, open Roster. Calendar renders? Configure → Generate a
   short range → *"Roster saved: N days…"*?
2. **One CEP** on their own device — log in, open Roster. Calendar renders?
3. Same CEP — click one of **their own** shifts → request cover from a colleague →
   *"Swap request sent to …"*?
4. That colleague — **the roster** shows a badge on the shift and an inline coverage
   card → **Accept** → *"Covered, and verified against the master roster: …"*. That
   message is emitted only after a read-back (`RosterView.jsx:1712`), so it is genuine
   evidence the one-day write worked.
   *(Corrected 2026-08-15: this said the AURA panel carries the request and cited
   `AuraPulseBot.jsx:488`. The surface moved out of the chat panel in v1.10.0 and that
   line is now a download filename — so this step could never pass, and §8.3 ends with
   "if step 4 fails, roll back". It would have triggered a rollback of a correct
   deploy.)*
5. Pulse view — heat-map populated, own row editable, a colleague's row locked.
6. Feeds — posts load, a like registers, a comment posts.
7. Admin panel — burnout monitor shows rows.

**If step 2 or 4 fails, roll back (§7) and report.** Those are the two the whole
proposal turns on.

---

## 9. Plain-language table: what each rule permits and forbids

"Member" = one of the ten addresses in `TEAM_DIRECTORY`. "Admin" = Alif or Nisa,
**by email** — never by the `role` field.

| Path | Anyone (not signed in) | A signed-in stranger | A member (e.g. Brandon) | An admin |
|---|---|---|---|---|
| **`system_data/roster_2026`** | nothing | nothing | read; replace **one day that already exists**; may not add, remove, blank or delete | read; generate/overwrite freely; **may not delete** |
| **`shift_swaps`** | nothing | nothing | create a request **naming themselves**; read requests they are party to; approve/deny **only when they are the named target**, **only from PENDING**, **only the status** | additionally: create on another's behalf (recorded in `initiatedBy`); read all. **Cannot approve for someone else** |
| `system_data/daily_pulse` | nothing | nothing | read the team map; write **only their own name's row** | write any row |
| `system_data/monthly_attendance` | nothing | nothing | read | read + write |
| `system_data/reports_{year}` | nothing | nothing | **read (⚠️ includes `privateText`)** | read + publish |
| other `system_data/*` | nothing | nothing | nothing | nothing |
| `wellbeing_history/{id}` | nothing | nothing | read + write **their own only**; cannot list; cannot delete | read any; list all (burnout monitor) |
| `wellbeing_history/_anonymous_logs` | nothing | nothing | **append only — cannot read it back** | same; **appears in an unfiltered collection list** (§9 note) |
| `users/{id}` | nothing | nothing | read + write **their own** (by uid **or** directory id); **cannot set `role:"admin"`**; cannot list or read others | may set `role:"admin"` on their own |
| `cep_team`, `archive_{year}` | nothing | nothing | read | read + write |
| `staff_loads/{id}` | nothing | nothing | read all; write **their own** | read + write all |
| `monthly_workload` | nothing | nothing | nothing | write only (nobody reads) |
| `feed_posts` | nothing | nothing | read; **likes/comments counters only**; delete **their own** posts | delete any |
| `feed_posts/*/comments` | nothing | nothing | read; create **under their own name** | same |
| `notifications` | nothing | nothing | read **their own**; mark **their own** read. Nobody can create | same |
| `beta_feedback` | nothing | nothing | create only (nobody reads) | same |
| `smart_database` | nothing | nothing | create only, **attributed to themselves**, no overwrite | same |
| `community_assessments` | **nothing ⚠️ B2** | nothing | create only | same |
| `resources`, `demo_*`, anything else | nothing | nothing | nothing | nothing |

### Three ⚠️ notes that belong in this table, not a footnote

- **`reports_{year}` read is open to all members and that includes `privateText`,
  the HOD-only analysis.** Restricting it would blank the public report card for
  the six non-admins, because one `getDoc` fetches both fields. The fix is to
  split the document in the app. Until then this is a **known, accepted
  confidentiality gap** — named here rather than quietly encoded.
- **`_anonymous_logs` is write-only against a targeted read, not against a
  collection scan.** `AdminWellbeingPanel.jsx:24` lists the whole collection
  unfiltered; a `list` request is matched by the wildcard rule, not the literal
  path. Making it unreadable to the scan breaks the burnout monitor **silently**.
  The one-line app fix is to move the bucket to its own collection —
  `anonymous_pulse/logs` — after which this block becomes genuinely write-only:
  ```
  match /anonymous_pulse/{logId} {
    allow read: if false;
    allow create, update: if isMember();
    allow delete: if false;
  }
  ```
  I did not write that block into the rules, because rules for a collection that
  does not exist is how a rules file starts lying.
- **No rule constrains the Firebase console, the Admin SDK, or any Cloud
  Function.** "Nobody can read this" means *no client*. You can always read
  everything.

---

## 10. Maintenance hazards and optional hardening

### 10.1 The directory is now duplicated a third time

`ROSTER_POSTMORTEM.md` C3 already indicts the second copy; C-RC2 names the cause.
Rules have no import mechanism, so this cannot be fixed in rules alone.

**Onboarding or offboarding anyone now requires:**

1. edit `TEAM_DIRECTORY` in `src/utils/index.js`;
2. edit **`directory()` and `directoryNames()`** in `firestore.rules` (both — they
   cannot be derived from each other; `Map.values()` does not exist in the rules
   language);
3. if they are an admin, edit **`adminEmails()`** here **and** `ADMIN_EMAILS` at
   `App.jsx:313`;
4. `firebase deploy --only firestore:rules`.

**Miss step 2 and the new joiner authenticates successfully and then cannot read
the roster.** That is a bad failure to debug at 8 a.m. Put it in the onboarding
checklist.

### 10.2 Optional hardening, deliberately left off

| Hardening | Why it is off | To turn on |
|---|---|---|
| Require `email_verified` | An ID token is cached up to an hour. Someone who verifies mid-session would be denied everything until it refreshes. `WelcomeScreen.jsx:114` already blocks unverified logins. | add `&& request.auth.token.email_verified == true` to `isMember()` and `isAdmin()` |
| App Check | Not configured in the project. It is the right answer for `community_assessments` (§1 B2). | Firebase console → App Check, then `request.app != null` |
| Deny the whole `role` field on `users` | `ProfileView.jsx:75` writes it legitimately as a job title; denying it breaks profile saving. Only the literal `'admin'` is refused. | narrow the app's profile form instead |

### 10.3 Follow-up work this proposal exposes but does not do

Ordered by what I would do first. All are **application** changes.

1. **Move the roster write off the client.** An `applySwap({ swapId })` callable
   Cloud Function makes the roster `allow write: if isAdmin()` and closes C4/Q6
   properly. It is the only way to get field-level swap enforcement — see the
   long comment in the rules' Section 2 for why rules alone cannot.
2. **Stop `users.name`/`users.role` overriding the directory.** Fixes the lockout
   risk in §1 **and** the privilege escalation in §2.
3. **Split `reports_{year}`** into public and private documents.
4. **Move `_anonymous_logs`** out of `wellbeing_history`.
5. **Error callbacks** on the `feed_posts`, `daily_pulse` and `wellbeing_history`
   listeners. Four of the six rollback symptoms in §7 are silent today.
6. **Pick one keying for `users`** — auth uid or directory id, not both.
7. `approvedAt` should be `serverTimestamp()`, not `new Date().toISOString()`
   (`AuraPulseBot.jsx:508`).

---

## 11. Honest limits ledger

In the style of `rosterEngineV2.js`'s header and `ROSTER_QC_AUDIT.md`: things a
roster master or an owner could do and get a surprising or wrong result. **Every
one of these is a live limitation of the proposal, not a hypothetical.**

### What a member can still do that you might not expect

- **Vandalise one day of the roster.** A member may replace the entire shift array
  of any existing date key, with no swap in existence. Rules cannot check for a
  swap (Section 2 of the rules explains the three independent reasons). They
  reduce "any member can destroy the roster" to "any member can rewrite one day,
  attributably". **This is the single biggest residual risk in the proposal.**
- **Write a well-formed but wrong day.** Nothing validates the *contents* of the
  changed key — not the shape of the shift objects, not that the caller appears in
  it, not that anybody was removed. `changedKeys()` is a Set with no element
  accessor, so the rule can prove *one* key changed but cannot name or inspect it.
- **Inflate a like or comment count** without limit, on any post. Inherent to a
  client-side `increment()`.
- **Fill a write-only sink.** `beta_feedback`, `smart_database` and (for members)
  `community_assessments` accept unbounded numbers of documents. Rules cannot
  rate-limit. Size caps are in place; document *counts* are not.
- **Spam swap requests.** The duplicate guard is still client-side and in-memory
  (`RosterView.jsx:227` says so). I did **not** implement a uniqueness constraint,
  because rules cannot query for an existing PENDING request — the guard M12 asks
  for is not achievable in rules, and claiming otherwise would repeat exactly the
  mistake the post-mortem is about. **M12 stays open.**
- **See the confidential annual analysis.** `privateText` in `reports_{year}` is
  readable by all ten members (§9).
- **Read the anonymous pulse bucket if they are an admin**, via an unfiltered
  collection list (§9).

### What could surprise the owner

- **A rename locks somebody out.** Anyone who edited their Profile "Name" is
  compared against a name the rules do not know. **§3 check 2 exists for this and
  it is the most likely cause of a post-deploy lockout.**
- **Two directory members cannot log in at all** — Benny and Ashik, at
  `@singhealth.com.sg`, are rejected by `WelcomeScreen.jsx:107` before the
  directory is consulted. **That is true today and these rules do not change it.**
  Deploying and then noticing they "still can't get in" would be a false
  attribution.
- **`benny.loo.k.g.@singhealth.com.sg` may not be a valid address** (trailing dot
  in the local part). Copied verbatim from `TEAM_DIRECTORY` rather than corrected
  by guesswork. **I need the real address.**
- **A brand-new team member's first pulse log creates `users/<directoryId>`, not
  their profile.** Permitted, because denying it breaks `confirmLog`. That
  document is written and never read (`aura_memory` has one writer, zero readers).
- **Sandbox behaviour changes for anonymous visitors** in four places (§1 B3–B5,
  B8), three of them silently.
- **Generation is admin-only** (§1 B1). If a CEP has ever generated the live
  roster, this takes that away.
- **A same-millisecond `smart_database` id collision is denied**, not silently
  overwritten. Correct for an audit sink; it will look like a bug if it happens.
- **A no-op roster write is denied** (`changedKeys().size() == 0`). Today
  `planSwapApplication` refuses before reaching that point, so this should be
  unreachable — but if it ever is reached, the message the user gets is *"Database
  error while processing this swap"*, which is misleading.
- **These rules have never run against real data.** 139 emulator checks against
  *seeded* documents shaped like the code writes them. If production documents are
  shaped differently — a legacy pre-6-May roster, a `feed_posts` document with no
  `author`, a `notifications` document with no `recipient` — a rule referencing
  that field evaluates to an error, which Firestore treats as **deny**. §3's
  checks are a partial defence; they are not proof.
- **`resources` and `demo_*` are locked on the strength of a grep.** If anything
  outside this repository reads them with a client SDK, it breaks. §4's diff is
  the check for that.

### What is deliberately not in this file

- No rules for collections that do not exist yet (`anonymous_pulse`, any
  per-year roster partition from **Q4**). Speculative rules are how a rules file
  starts lying.
- **No Cloud Storage rules.** `ProfileView.jsx:57` writes `avatars/*` and
  `FeedsView.jsx:143` writes `feed_images/*`. There is no `storage.rules` in this
  repo either, and its contents in the console are equally unknown. **That is a
  second, separate unversioned security boundary and it is out of scope here.
  It should be the next piece of work.**
- No `firebase.json` change, no workflow change, no application change.

### Judgment calls, flagged for your review rather than buried

| Call I made | The alternative | Why I chose this way |
|---|---|---|
| Admin = **email allowlist** | trust `users.role` | that field is user-writable (§2) |
| Identity from **`token.email`** + embedded directory | uid allowlist | uids are not knowable from the repo, and the documents are name-keyed anyway |
| `email_verified` **not** required | require it | one-hour token cache = lockout risk (§10.2) |
| `reports_{year}` **readable by all** | admin-only | admin-only blanks the public report for six people |
| `_anonymous_logs` scan **left visible to admins** | truly write-only | truly write-only breaks the burnout monitor silently |
| Both `users` keyings **permitted** | pick one | picking one breaks `confirmLog` — an app decision, not a rules one |
| `staff_loads` **self-write allowed** | admin-only | preserves AURA's "log 35 patients" for the person themselves |
| `community_assessments` **auth required** | open create with shape validation | the brief said auth everywhere; an open public create is a billing risk. Commented-out alternative is in the rules file |
| `archive_*` matched by **regex wildcard** | enumerate the years | enumeration silently expires on 1 January |
| Deleting **denied almost everywhere** | allow owners to delete | nothing in the app deletes these, so nothing should |

---

## 12. Housekeeping notes from producing this

- **Test suite:** `npm test` → **933 passed, 4 failed (937 total)**. The 4
  failures are **not from this work** and cannot be: this task added no JavaScript,
  and vitest collects only `src/**/*.{test,spec}.{js,jsx}`. They come from
  *concurrent, uncommitted* edits in the working tree to
  `src/components/RosterDemoWizardTables.jsx`, which removed the
  `aria-label="… band lowest grade"` inputs that the **unmodified, pinned**
  `src/components/RosterView.demo.test.jsx:145` queries. Verified:
  `git show HEAD:src/components/RosterDemoWizardTables.jsx` contains that
  aria-label; the working copy does not. **That is the repo's rule-5 tripwire
  firing on someone else's in-flight change — whoever owns those edits needs to
  see it.**
- **Local verification only.** The emulator work ran in a scratch directory with
  its own `firebase.json`, project id `demo-nexus-rules`. The repo's
  `firebase.json`, `vitest.config.js` and `.github/workflows/deploy.yml` were not
  modified. No Google authentication, no contact with `idc-app-e0c59`.
- **Proposal checksum** at time of writing: `sha256 be26d89e…` (full value from
  `shasum -a 256 firestore.rules`). Re-run the §5 verification if you edit the
  file — especially `directory()`.
