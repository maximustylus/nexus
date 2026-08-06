# AURA Roster — Handoff

**Last updated:** 2026-08-06, while you were at work.
**Read this first; it is current. `ROSTER_TODO.md` is the plan, `ROSTER_QC_AUDIT.md` is the audit.**

---

## 1. What is LIVE right now

Two releases shipped and verified today. `smartdashboard.web.app` is running **v1.6.1**.

| Tag | What it fixed |
|---|---|
| `v1.5.0-pre-remediation` | *(rollback point — the original code, before any of today's work)* |
| `v1.6.0` | Two one-click paths that destroyed the live roster (**M1** demo config leaking into live mode, **M3** cleared Weeks field wiping the document). Plus the first runnable test harness. |
| `v1.6.1` | The shift-swap flow now actually works (**A1**), can no longer claim success it did not achieve (**A-RC4**), the coverage alert surfaces (**M5**), the ledger no longer approves before writing (**M9**), admin-initiated swaps work (**M11**). |

**Rollback, fastest first:**
1. Firebase Console → Hosting → `smartdashboard` → **Rollback** on the previous release. Instant, no git.
2. `git revert --no-commit v1.6.1..HEAD && git commit -m "rollback" && git push`
3. Full reset to before today: target `v1.5.0-pre-remediation`.

**Rollback does not restore data.** There is still no Firestore backup. Your June `.ics` in Outlook plus a CSV export are the only copies.

---

## 2. What was built today but is NOT yet live

**`src/utils/rosterEngineV2.js`** — the constraint-aware engine you asked for. Built, tested (174 tests of its own, 428 total), **not yet wired into the app** at the time of writing. Wiring into Sandbox is in progress.

It accepts, per staff member: FTE, skills, unavailable dates, max duties per day. Per task: required skill, which weekdays it runs, how many leads and co-leads. Plus rules: daily capacity, max consecutive days, forbidden pairs.

### Measured: old engine vs new

| staff / tasks | Old: max duties one person holds in a day | Old: never rostered | New: max/day | New: never rostered | New: unfilled, reported with reasons |
|---|---|---|---|---|---|
| 4 / 4 (your team) | 3 | 0 of 4 | 2 | 0 of 4 | 0 |
| 12 / 8 | 3 | 0 of 12 | 2 | 0 of 12 | 0 |
| 9 / 6 | 3 | 0 of 9 | 2 | 0 of 9 | 0 |
| **6 / 10** | **5** | 0 of 6 | **2** | 0 of 6 | **160** |
| **20 / 4** | 3 | **12 of 20** | 1 | **0 of 20** | 0 |

Reproduce any time: `node scripts/roster-scaling.mjs`

`generateRoster` (the old engine, which live mode still uses) is **byte-identical** — verified across 720 configurations. So none of this can affect your real roster.

### The new engine's honest limits — know these before promising anything

The 15 are documented in full in the agent's report; these are the ones that would bite in a demo or a pilot:

1. **Greedy, not optimal.** It fills the hardest-to-staff slots first, which prevents same-day stranding, but it has no lookahead and no repair pass. It can occasionally report a slot as unfillable that a proper solver would have filled.
2. **`maxConsecutiveDays` cannot see across generation runs.** Generate month by month and someone can end one month on Saturday and start the next on Sunday, exceeding the limit invisibly.
3. **A skill requirement gates the co-lead too**, so "qualified senior supervising an unqualified trainee" cannot be expressed.
4. **FTE controls relative share, not an absolute cap.** Entering `fte: 0.2` expecting "one day a week" will not give that.
5. **Forbidden pairs are same-task-only.** Two people who must not be in the same room can still be rostered on different tasks the same day.
6. **`softPenalty` is not comparable between differently-shaped teams** — do not read it as a quality score.
7. **A Monday snap goes backwards** for a mid-week start date, so a roster can silently begin in the past.
8. **Leave is whole-day only** — no half-days.

---

## 3. Your machine needs attention

**`/System/Volumes/Data` is 98% full — 11 GiB free of 460 GiB.** This is causing heavy swap paging. Concrete effects measured today: a Vite build took **18m 27s** locally versus **2m 46s** on GitHub's servers, and importing jsdom once took **15.6 minutes**.

It does **not** affect the live site or the deploy pipeline. It will make local development and any local rehearsal painful. Clearing space is worth an hour of your time this week.

---

## 4. Still known-broken, documented, NOT fixed

Listed in `CHANGELOG.md` under "Known issues" so nobody mistakes the post-mortem for repairs:

| Id | Impact |
|---|---|
| **B1** | A roster generated from the shipped default starts on a **Sunday**; the "Tuesday" and "Saturday" video-clinic duties land on Monday and Friday. **Visible on stage if you generate live in LIVE mode — generate from a Monday, or say it is a known issue.** |
| **M6** | The ICS export has an unescaped comma and no `UID`/`DTSTAMP`. Check whether Outlook truncated your June import at the comma. Don't demo Outlook import. |
| **P0.7** | `npm run lint` has never worked — no ESLint config exists in the repo at all. |
| M10, M12, C1/C3/C4 | CSV formula injection; no duplicate-request guard; single hardcoded `roster_2026` document; staff pool hardcoded in the component; **no `firestore.rules` in the repo at all**. |

---

## 5. Decisions still yours

Answered today: swap semantics = **mechanical substitution**; **notify the roster owner** (not yet built); deploy live with rollback (**done**).

Still open:

- **D3** — should the requester be told when a swap is accepted or declined? Currently nobody tells them. Needs a second listener or a Cloud Function.
- **D4** — partition the roster per year/team instead of one `roster_2026` document. Needs a migration decision.
- **D5** — which `TEAM_DIRECTORY` roles are rosterable? (Recommend `role === 'staff'`, matching today.)
- **D6** — **`firestore.rules`.** There is none in the repo. Roster writes happen client-side and authorization exists only in your Firebase console, unversioned. Fine for one trusted team; **this is the first thing to settle before another department's data is involved.** I need your console's current rules to do this safely.
- **D7** — the case-volume / skill-mix claim at `README.md:35` and `AppGuide.jsx:28` is still untrue. The research you supplied gives a legitimate route to making it true (NHPPD × Average Daily Census → required hours → FTE → slot counts).
- **D8** — was the 6 May schema change a major version? `version-steward` chose 1.6.0 (minor) and flagged the argument for 2.0.0.

---

## 6. Before you present

1. **Rehearse once in Sandbox on the live site.** I cannot log in, so nothing I did verifies how it *looks*. This is the one gap only you can close.
2. The solo demo path: Configure → add your own name to the Staff Pool → close **without** Generate → click a colleague's shift → request cover from yourself → your AURA alert opens → Accept.
3. For the other departments: the platform transfers; **multi-team support does not exist yet** (one shared document, hardcoded login list, hardcoded team directory). Offer a pilot, not a handover.
4. Your strongest material is `ROSTER_POSTMORTEM.md` + `ROSTER_QC_AUDIT.md` — an audit that found its own author's diagnosis wrong in five places. For colleagues deciding whether to trust their duty roster to your software, that is more persuasive than a clean demo.
