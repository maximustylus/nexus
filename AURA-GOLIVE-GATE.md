# AURA — go-live gate, run 2026-08-23

**Against:** `claude/nexus-aura-rostering-session-duo1q5` @ `6deb171` · **Audience:**
Vincent Chua and the AHP leaders · **Every `AURA-TODO.md` row is `OPEN`.**

Run by hand because `aura-steward` was added this session and the agent registry loads at
session start — it is callable from the next session onward. Same five gates, same
commands, output pasted.

```
G1 nothing live discloses a real person's data   ❌ FAIL
G2 nothing live is an open endpoint              ❌ FAIL
G3 the README demo walkthrough works             ❌ FAIL  (step 2 of 4)
G4 AURA is described accurately                  ❌ FAIL
G5 suite / lint / build green and unchanged      ✅ PASS
```

**VERDICT: NOT READY.** Four gates fail. **Three of the four are small** — a const
deletion, an auth check and a paragraph. G3 is two one-line fixes. None requires the
refactors in `W4`.

---

## Re-run 2026-08-24 · branch `aura` · ALL FIVE GATES PASS

```
G1 nothing live discloses a real person's data   ✅ PASS
G2 nothing live is an open endpoint              ✅ PASS
G3 the README demo walkthrough works             ✅ PASS
G4 AURA is described accurately                  ✅ PASS
G5 suite / lint / build green                    ✅ PASS
```

- **G1** — `AN1` and `AN14` closed: no real name, email or grade in `dist/`.
  Executable: `npx vitest run src/utils/an14.bundle.test.js` (18 assertions,
  including name-to-grade proximity). The old *"any JG output means live"* grep is
  retired below — it only ever matches the Marvel fixture now.
- **G2** — `AN4` (auth + membership + lead-only on the analysis) and `AU14`
  (per-uid rate limit across all three Gemini callables).
- **G3** — every step of the README walkthrough works: `AU22` (the data-entry
  card), `AU25`, and `AU27` (the export's Firestore write is demo-fenced, so the
  false *"check your connection"* banner on step 3 is gone signed-in AND signed-out).
- **G4** — `AU1`/`AU23`: the README describes a deterministic engine with a
  Gemini assistant beside it.
- **G5** — 3,232 tests / 86 files, lint 0, build clean; plus the rules emulator
  at **140 passed, 0 failed** (`firestore-rules-verify.mjs`, AU3 + AN13 sections).
  *Re-verified 2026-08-28 after folding in the info-card branch and `main`'s
  v2.1.1–v2.1.3 releases: **3,250 tests / 91 files**, lint 0, build clean.*

⚠️ **The gates pass on the `aura` BRANCH. The live site still runs `main`** until
the post-demo merge; the deploy order is rules → functions → hosting, and the
merge waits on the owner's 20-turn read (`AURA-VERIFICATION-TURNS.md`).

---

## G1 ❌ — six colleagues' names and grades ship in the bundle

```
$ npm run build && grep -oE '"(Alif|Fadzlynn|Derlinder|Ying Xian|Brandon|Nisa)"' dist/assets/*.js | sort | uniq -c
      2 index-p-7kKpFN.js:"Alif"          2 index-p-7kKpFN.js:"Brandon"
      2 index-p-7kKpFN.js:"Derlinder"     2 index-p-7kKpFN.js:"Fadzlynn"
      3 index-p-7kKpFN.js:"Nisa"          3 index-p-7kKpFN.js:"Ying Xian"

$ grep -o 'grade:"JG1[0-9]"' dist/assets/*.js | sort | uniq -c
      2 JG11   2 JG12   2 JG13   2 JG14   1 JG15   1 JG16
```

`AN1`. One bundle serves every route including `/individuals`. **Tomorrow increases the
exposure** — every new viewer is a new disclosure, and the audience is the people most
likely to look closely.

> **2026-08-24 — this gate is CLOSED, and its second command is retired.** The names
> grep now returns nothing (`AN14`, `TEAM_DIRECTORY` gone from the bundle). The
> `grade:"JG1[0-9]"` grep still returns hits and always will: they belong to the
> Marvel demo fixture (`mockData.js` — Steve, Peter, Charles, Jean, Tony) and the job
> framework, which are fiction and reference material, not disclosure. *"Any output
> at all means it is still live"* was therefore over-broad — a gate that cries wolf
> is a gate that gets ignored (steward, 2026-08-24). The load-bearing check is
> **proximity of a real name to a grade token**, and it is executable:
> `npx vitest run src/utils/an14.bundle.test.js` — 18 assertions against `dist/`.

## G2 ❌ — `generateSmartAnalysis` is unauthenticated

```
$ awk '/exports.generateSmartAnalysis/,/^});/' functions/index.js | grep -c 'request.auth'
0
```

`AN4`. Free Gemini endpoint on the billed key. `processFeedPost:571` is the template.

## G3 ❌ — the README's own demo script fails on stage, at step 2

`README.md:186` tells the presenter to say **"I saw 145 patients in June"** and expect a
green `DATA_ENTRY` block. **Two independent failures, stacked.**

**Failure 1 — the mode does not trigger.** `selectDemoMode` matches `'patients for'`; the
README says *"patients **in** June"*:

```
  "I saw 145 patients in June"       -> COACH        <-- the README's exact words
  "Log 35 patients for January"      -> DATA_ENTRY
  "I saw 145 patients for June"      -> DATA_ENTRY
```

So on stage AURA answers a database request with motivational interviewing:

> *"Thank you for saying that plainly. Being junior staff carries a load that is easy to
> normalise. What has this week asked of you that last week did not?"*

**Failure 2 — even in the right mode, the card cannot render.** `AU22`:

```
  mode: DATA_ENTRY | db_workload: {"value":145,"period":"demo","written":false}
  green DATA_ENTRY block renders: NO
```

The gate at `AuraPulseBot.jsx:1093` needs `target_collection`; the sandbox emits
`value`/`period`/`written`.

**The rest of the walkthrough:**

| Step | Result |
|---|---|
| 1 · Roster / coverage | ⚠️ **Needs two signed-in live users.** Cannot be shown solo or in Demo Mode. `README:185` says so; brief the presenter. |
| 2 · Data Entry | ❌ **FAIL** — both failures above |
| 3 · Export (`.docx`) | ✅ PASS — `ASSISTANT` mode, 451-char document in the card |
| 4 · Sandbox Deep Audit | ✅ PASS — Marvel brief returned, publish refused in demo |
| 4b · Wellbeing coach | ✅ PASS — reaches a summary at turn 3, `REACTING`/65, offers to log |

**New, found by this gate — not in the post-mortem.** `demoAura.js:101` calls
`p.title.toLowerCase()` with no guard. All six `DEMO_PERSONAS` carry a `title`, so it is
unreachable through the UI — but `respondAsDemoAura`'s own fallback only applies when the
persona is entirely absent, so a persona object missing `title` crashes the sandbox. Filed
as **`AU25`**, low, latent.

## G4 ❌ — the description is unchanged

```
README:7   "…a proprietary, autonomous AI agent…executes database mutations…"
README:171 "AURA can format database writes, but requires a human-in-the-loop physical click"
```

`AU1`. The model is Google's, not proprietary; the roster engine has no AI in it; and the
two lines contradict each other. **Highest-value item for this specific audience** — see
`AURA-HANDOFF.md` §5.

## G5 ✅

```
lint: 0
Test Files  73 passed (73)
Tests       2744 passed (2744)
build: green
```

Count unchanged from baseline — no suite stopped running.

---

## Triage for tonight

**Fix — all small, all low blast radius:**

| Item | Cost | Why tonight |
|---|---|---|
| `AN1`+`AN2`+`AN3` | ~half day | Live disclosure, and tomorrow multiplies the viewers. Do all three together — deleting the const while leaving the feature pointed at the wrong team is a demo landmine. |
| `AN4` | ~1 hour | Only the app calls it and the app is authenticated, so adding the check breaks nothing. |
| `AU2` | ~20 min | `Number.isFinite` beside a month guard that is already correct. |
| **G3 step 2** | ~30 min | Two one-liners: add `'patients in'` to `selectDemoMode`, and give the sandbox `target_collection`. **This is the one the audience will actually see.** |
| `AU1` | a paragraph | Not code. Highest external value for these readers. |
| `AC1` | ~30 min | Delete the `\|\| minsStr.includes('20')` clause — chips still resolve via `includes('less')`. Add a chip-parity assertion. |

**Defer — say so out loud rather than starting them:**

| Item | Why not tonight |
|---|---|
| `AC2` `AC3` `AC5` | A shared parser module plus a new suite. `W4` is a day's work and the night before a demo is how 2744 green tests go red. |
| `AU24` | Do it *with* `AU2` and `AU9`, not as a separate push. |
| `AU14` `AU15` `AN10` | Real, not demo-blocking. First thing after go-live. |
| The owner's ten | Decisions. `AU1` is the only one with tomorrow's clock on it. |

**Do not attempt tonight:** anything touching `rosterEngineV2`, `firestore.rules`, or the
migration. Four clinicians are rostering real shifts on this.

## Rollback

Bundle: redeploy the previous build. Rules: Firebase console → Firestore → Rules → history
→ restore → Publish, ~60 seconds. **Nothing on tonight's list touches rules.**
