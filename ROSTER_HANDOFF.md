# AURA Roster — Handoff

**Written:** 2026-08-05 · **Branch:** `main` · **Base commit:** `79e3b99` (unchanged — nothing committed)
**Why you are reading this:** seven decisions are yours to make, and three of them are clinical
or security calls I should not invent. Everything not blocked on them has been done.

---

## 1. Current state

### Documents produced

| File | What it is |
|---|---|
| [ROSTER_POSTMORTEM.md](ROSTER_POSTMORTEM.md) | Phase 1. Five blocks (A–E), root causes, near-misses. **Rev 2** — corrected after independent audit; corrections marked `[rev2]`. |
| [ROSTER_QC_AUDIT.md](ROSTER_QC_AUDIT.md) | Independent `qc-steward` audit of the post-mortem. Verdict table + **12 defects the post-mortem missed** (M1–M12). Read this second. |
| [ROSTER_TODO.md](ROSTER_TODO.md) | Phase 2. Nine plans (P0–P8), execution order, delegation tier, evidence ledger. **Rev 2** — re-ordered after the audit. |
| `.claude/agents/version-steward.md` | Ported from your immersifit repo, adapted for a React/Firebase PWA. |
| `.claude/agents/qc-steward.md` | **Newly written.** No `qc-steward` existed anywhere; the nearest analogue was immersifit's `qa-inspector`, which I adapted. Its "why you exist" section is seeded with the real failures found here. |
| `CHANGELOG.md` | Created by `version-steward` — see §5. |

### The working tree is dirty and nothing is committed

```
 M .github/workflows/deploy.yml      # npm test step added before build
 M package.json                      # vitest/@testing-library/jsdom + test scripts
 M package-lock.json
 M src/components/Aura.hooks.test.js # import case fixed: './aura.hooks' -> './Aura.hooks'
 D  src/components/Aura.utils.test.js # deleted: byte-identical duplicate of the hooks test
?? src/utils/auraEngine.test.js      # new characterization tests
?? vitest.config.js
?? .claude/  ROSTER_*.md  CHANGELOG.md
```

**No application source has been modified.** `src/utils/auraEngine.js`,
`src/components/RosterView.jsx` and `src/components/AuraPulseBot.jsx` are byte-identical to
`HEAD` — independently confirmed by the audit against blobs `9b854d3d…` and `5c96aba5…`. Every
behavioural fix is still ahead of you.

### The three headline findings

1. **A swap that a colleague accepts does not change the roster** — for any shift generated
   after 6 May 2026. `AuraPulseBot.jsx:355` compares `shift.staff` (now the display string
   `"Lead: Brandon, Co: Ying Xian"`) against a bare name. AURA reports success regardless.
2. **Two one-click paths destroy the live duty roster today**, with a success message and no
   swap involved: demo-mode staff names surviving into live mode (**M1**), and a cleared "Weeks"
   field producing `NaN` → empty roster → unmerged `setDoc` (**M3**).
3. **The coverage alert never appears.** `App.jsx:626` never passes `onOpen`, so
   `AuraPulseBot.jsx:112`'s force-open is a no-op (**M5**). `README.md:18`'s claim that AURA
   "forces open its UI" is false as shipped.

---

## 2. Completed vs. outstanding

### Completed

- **Phase 1 post-mortem**, then independently audited and corrected. The audit found one central
  claim overstated, four claims wrong, and 12 missed defects — all folded in.
- **Phase 2 plans**, re-ordered on the audit's evidence.
- **P0 — test harness.** `vitest` + `@testing-library/react` + `jsdom` installed; `npm test` and
  `npm test:watch` scripts; `vitest.config.js`; the duplicate decoy test deleted; the
  case-wrong import fixed; characterization tests for `generateRoster` (including two tests that
  deliberately pin the current B1 weekday bug so P4 shows up as a reviewable delta); `npm test`
  wired into `.github/workflows/deploy.yml` before the build.
- **P8.2 — versioning.** `version-steward` ran over the version drift and `CHANGELOG.md`. See §5
  for exactly what it did and did not do — including what it refused to do.
- **Both requested agents activated** — with the correction that `qc-steward` did not exist and
  had to be authored.

### Outstanding, unblocked — ready to run in a fresh session

These need no decision from you. They are specified to step level in `ROSTER_TODO.md`.

| Plan | What | Tier |
|---|---|---|
| **P1** | Safety guards: merge-write, `weeks` validation, empty-roster assertion, demo→live config reset, truthful confirm modal | Opus-alone |
| **P2** | Honest reporting: success conditional on an observed change; stop writing `APPROVED` before the roster write; `onSnapshot` error callbacks; delete the false "will be notified" promise | Opus-alone |
| **P3** | Pass `onOpen`; stop `startSession` discarding a queued alert | Opus-alone |
| **P4** | Date correctness — **re-specified, see the warning in §4** | Opus-alone |
| **P5** | Exports: RFC 5545 escaping, `UID`/`DTSTAMP`, demo-mode `undefined`, CSV injection | Opus-alone |
| **P8.3/8.5** | Replace the 7 `alert()` calls; update the README claims P3/P6 falsify | Opus-alone, after P2 |

### Outstanding, blocked on you

**P6** (schema split-brain) and **P7** (persistence, config source, security rules) — the two
plans that touch the shared data contract and the live document.

---

## 3. Decisions awaiting you

### D1 — What does a shift swap *mean*? · blocks P6 · **clinical**

Each shift has a `lead` and a `coLead`. When a lead requests cover and a colleague accepts, which
is correct?

- **(a)** The covering colleague becomes the new `lead`; `coLead` unchanged.
- **(b)** The existing `coLead` is promoted to `lead`, and the covering colleague becomes `coLead`.
- **(c)** Swap only the exact role the requester held, no promotion — mechanical substitution.

This determines accountability on the day, so it is yours. Note the swap document does not
currently record *which role* the requester held (`RosterView.jsx:132-140`), so P6 adds
`swapRole` regardless of your answer. **My recommendation: (c)** — it is the least surprising,
matches what the request UI implies ("Request Coverage From"), and does not silently change a
second person's duty without their consent. (b) mutates the co-lead's role without asking them.

### D2 — Does a swap need lead or admin sign-off? · blocks P6 · **policy**

Today two staff can rearrange the duty roster with no third party involved and no notification
to anyone. Options: peer-only (current), notify-lead-on-completion, or require approval.
**Recommendation: notify-lead-on-completion** — preserves the self-service benefit that is the
whole point of the feature, while keeping the JG13/JG14 roster owner informed.

### D3 — Should the requester be told the outcome? · blocks P6/P2.4 · **feature scope**

Currently no. `shift_swaps` has one reader, matching only `targetStaff`
(`AuraPulseBot.jsx:104-105`), so a request can be declined and the requester never learns.
`:378` claims *"{requester} will be notified"* with no mechanism behind it (**M4**). P2.4 deletes
the false claim. Actually building notification is a small feature — a second listener keyed on
`requestedBy`, or a Cloud Function + the push infrastructure you already have. Do you want it in
scope?

### D4 — Roster document partitioning + migration · blocks P7 · **data migration**

Everything reads and writes the single hardcoded `system_data/roster_2026`, so a roster generated
for 2027 lands in the 2026 document. Move to `system_data/roster_{year}` (or a period-keyed
collection)? If yes: migrate the existing document, or dual-read for a transition period? I will
not touch live data without your instruction.

### D5 — Which roles are rosterable? · blocks P7 · **policy**

`RosterView.jsx:36` hardcodes the four CEPs; `src/utils/index.js:22`'s `TEAM_DIRECTORY` is the
real source of truth and mixes `admin` (you, Nisa), `viewer` (consultants, nurse clinician) and
`staff` (the four CEPs). Sourcing the pool from `TEAM_DIRECTORY` needs a filter rule.
**Recommendation: `role === 'staff'`** — matches today's behaviour exactly, so it is a
refactor rather than a change. Confirm, or name the rule you want.

### D6 — Firestore security rules · blocks P7 · **security**

There is **no `firestore.rules` in this repository**. The master-roster rewrite runs client-side
in the accepting user's browser (`AuraPulseBot.jsx:361`), and swap creation is an unguarded
`addDoc` (`RosterView.jsx:132`). The `user?.role === 'admin'` checks are UI affordances, not
security boundaries. I need one of:

- the current rules from the Firebase console (Firestore → Rules → copy the text), or
- explicit authorisation to author rules from scratch and your acceptance that deploying them
  could lock the team out if the console's current rules differ from what I assume.

Authoring these blind is the one thing in this remediation that could take the team's roster
offline, so I stopped rather than guess.

### D7 — The case-volume / skill-mix claim · blocks P8.4 · **your words, your call**

`README.md:35` and `AppGuide.jsx:28` both tell readers the roster "predicts case volumes and
automatically routes the right skill-mix". `generateRoster` takes four inputs — `staff`, `tasks`,
`startDate`, `weeks` — and consumes no volume, grade, skill or leave data. `AppGuide` is
in-app onboarding read by clinicians about how their own duty is decided. Delete the claim,
relabel it as roadmap, or rewrite it to describe the rotation accurately? Tell me the framing
and I will write it.

### D8 — Was the 6 May schema change a *major* version? · **release semantics**

`version-steward` set **1.6.0 (minor)** but flagged, correctly, that a strict reading of its own
rules argues for **2.0.0**. Commit `2de3dde` changed the stored shape at
`system_data/roster_2026`: `staff` went from an identity to a display string. Fields were added,
not removed, so the document still *reads* — but this is a **PWA**, so a returning client on an
old service-worker cache compares `shift.staff` to the signed-in user's name, that comparison can
no longer match, and shift ownership (hence the entire swap flow) silently dies for that user.
`79e3b99`'s own comment, "maintains backwards compatibility", shows the break was known at the
time.

It did not take major unilaterally, on the grounds that the change already shipped to production
un-versioned, so a major today is retroactive labelling rather than a signal to any real upgrader.
**I agree with that call** — but it is a judgment about how you want your version history to read,
so it is yours. If you prefer major, the changelog entry becomes `[2.0.0]` with no other change;
the `### Breaking` subheading naming the Firestore path is already there either way.

### LIVE-VERIFY — one read that settles a real question

**Is A1 actually live right now?** Open `system_data/roster_2026` in the Firebase console and
look at any shift's `staff` field:

- `"Lead: Brandon, Co: Ying Xian"` → post-refactor. **Swaps are broken.** P6 is urgent.
- `"Brandon"` → pre-refactor legacy. **Swaps currently work**, and P6 must include a migration
  so fixing the code does not break them.

Source cannot answer this. It changes P6's design, so it is worth the 30 seconds.

---

## 4. Warnings for whoever resumes

1. **Do not implement rev 1's date fix.** An earlier draft of P4 said "replace `toISOString`
   with local getters". That is wrong and **introduces** the bug it claims to fix: the UTC parse
   of `new Date("YYYY-MM-DD")` stays, so keys land one day early outside UTC+8 — measured,
   `TZ=America/New_York` yields `2026-01-31, 2026-02-01, …`. The current code is timezone-stable
   across fixed offsets. Its real defect is DST only, and it cannot fire in `Asia/Singapore`.
   Fix **both** halves together (local parse **and** local derivation) or neither.
2. **P1 before P6.** The destructive-write paths (M1/M3) are armed today. Fixing swaps first
   means the first successful swap can be silently erased by the next "Generate Roster" click.
3. **Do not trust the section headers in an earlier revision of `ROSTER_TODO.md`.** Rev 1 marked
   four plans `DONE` before they had been executed. Rev 2 corrected this and logs the error
   deliberately, because it is the same failure mode the post-mortem is about. Trust only the
   Evidence ledger, and only rows with pasted output.
4. **`npm test` now exists and must stay green.** It is wired into `deploy.yml` before the build.
   Two tests in `src/utils/auraEngine.test.js` are named `CURRENT BUG:` and **assert the bug** —
   P4 is expected to invert them, not delete them.
5. **PDPA:** no patient data in fixtures, logs or tests. The Marvel dataset exists for this reason.

---

## 5. What `version-steward` did — and deliberately did not do

**Ran, and its output is verified.** Bump: **`1.0.0` → `1.6.0` (minor)**. Files changed:
`CHANGELOG.md` (new, 248 lines), `package.json`, `README.md`, `package-lock.json`.

Its reasoning, which I checked and accept: `1.0.0` was stale bookkeeping that never tracked
anything, the README's Release History is the de facto record and documents v1.0–v1.5 as shipped,
so the effective baseline was 1.5.x. It chose **1.6.0 rather than 1.5.0** specifically so that
today's harness and remediation docs are not filed under a version the README already describes
as shipped — which would reproduce the Block E failure mode. The AURA engine badge stays at
`v2.3`; app version and engine tier move independently.

It found **two drift items outside its brief**, both real:

- `package-lock.json` was out of sync twice over (root spec `"latest"`, `version: "1.0.0"`), so
  **`npm ci` would have refused with "out of sync"**. CI uses `npm install`, which masked it.
  Fixed surgically — 3 strings, no dependency re-resolution.
- The README's *"Future Roadmap (Pending v1.6)"* would contradict itself the moment v1.6 shipped
  without those items. Retargeted to v1.7.

It also **declined to classify 11 commits** (large mixed feature/refactor diffs in
`functions/index.js` and `ResultPage.jsx`, 543/545 and 262/132 lines, no recorded intent, outside
roster scope) and flagged them as unclassified in the changelog rather than guessing. That is the
correct behaviour and worth knowing: the changelog's provenance header states that its
classification covers the last ~30 commits and is **incomplete before that window**.

**Verified by me, not taken on trust:** `package.json` → `1.6.0`, `@google/generative-ai` →
`^0.24.1` (the installed version, so behaviour is unchanged), 0 trailing-whitespace lines;
lockfile internally consistent (`1.6.0` / `^0.24.1` / resolved `0.24.1`); `git tag -l` → **0
tags**; `git log --oneline -1` → **`79e3b99`, unchanged**; `npm test` → exit 0, 50 tests. The
changelog's "Known issues — documented, NOT fixed" table carries **A1, M1, M3, M5, M6, B1, P0.7**
by traceable id, so the existence of the post-mortem cannot be mistaken for the defects being
repaired.

**No commit and no tag were created** — I overrode step 7 of its own procedure, because the tree
also contains the harness work it did not review. Cutting the first tag `v1.6.0` is still
outstanding and is a genuine deliverable: until it exists, `git checkout vX.Y.Z` and
revert-by-version do not work for *any* version of this project.

---

## 6. Resuming in a fresh session with cleared context

Paste this:

> Read `ROSTER_HANDOFF.md`, then `ROSTER_TODO.md` (rev 2) and `ROSTER_QC_AUDIT.md`, in the nexus
> repo. The working tree is dirty and uncommitted; nothing under `src/` except test files has
> been changed. Answers to the handoff's decisions: **D1=…, D2=…, D3=…, D4=…, D5=…, D6=…, D7=…,
> D8=…** and the LIVE-VERIFY result is **…**. Execute plans P1 through P5 in order, delegating
> each Opus-alone plan to an Opus subagent and reviewing its evidence before accepting. Heed
> warning #1 in §4 — do not use rev 1's date fix. Then run `qc-steward` over the result before I
> commit.

If you would rather not decide D1–D7 yet: **P1 through P5 and P8.3 are all unblocked** and fix
both critical destructive-write paths, the false success reporting, the invisible coverage alert,
and the malformed exports. Say "do the unblocked plans" and none of the seven decisions is
needed. Only the swap-semantics fix (P6) and the persistence/rules work (P7) actually wait on you.
