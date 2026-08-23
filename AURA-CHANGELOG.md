# AURA — changelog

The **AURA engine version** is a separate internal version tracking the agent's capability
tier. It moves independently of the app version in `package.json` and is **not** changed by
an app release. `CHANGELOG.md:12` is the source of that rule; this file is the history it
refers to.

**Currently `v2.3`.** The app is `v2.1.0`.

> ### ⚠️ How to read this file
>
> This changelog was created on **2026-08-23**, alongside
> [`AURA-POSTMORTEM.md`](AURA-POSTMORTEM.md). The repository had no AURA-specific changelog
> before, so **everything below `v2.3` is reconstructed** — from `CHANGELOG.md`'s own
> reconstructed entries (`[1.0.0]`–`[1.4.0]`, themselves rebuilt from the README) and from
> the surviving code. Reconstructed entries are marked as such and should be read as *"the
> best account available"*, not as a record written at the time.
>
> Where a historical claim is now known to be false, it is **struck through and annotated
> with the finding id**, not deleted. *"This used to be claimed"* is what stops the same
> claim being made again.

---

## Unreleased — v2.4 (planned)

**Nothing yet.** [`AURA-TODO.md`](AURA-TODO.md) is the plan; every row in it is `OPEN`.

An engine version bump is warranted when the capability tier genuinely changes. **None of
the P0–P6 work changes the tier** — it corrects what the current tier already claims to do.
On the current evidence the next entry here is a **v2.3.1-equivalent correction**, not a
v2.4, and the honest thing is to say so rather than to bump a number because work happened.

The three that would justify a real tier change, if the owner decides them that way:

- `AU8` — content-gated assessment instead of turn-count-gated
- `AU11` — a validated memory model instead of raw output re-injection
- `AN7` — a reviewed confidentiality split instead of an unreviewed one

---

## v2.3 — *"proactive database middleware"* · reconstructed

Recorded in `CHANGELOG.md` under app `[1.4.0]`, reconstructed from the README.

**Claimed at the time:**

- **Engine upgrade to v2.3:** from reactive conversational bot to proactive
  database-middleware agent.
- ~~**Autonomous Roster Mediation:** AURA listens to Firebase collections via live
  snapshots and executes peer-to-peer shift-swap matrix rewrites.~~
  > **False as written.** `ROSTER_POSTMORTEM.md` Block **A1** found the rewrite never
  > actually happened. The surface was removed in app v1.10.0; `README.md:18` carries a
  > 2026-08-15 correction. ⚠️ `README.md:265` still makes the original claim — the
  > correction was applied to one line and not the other. **`AU23`.**
- **Native File Export:** Markdown compiled to `.docx` Blob objects, downloaded from the
  chat UI. *(Still true.)*
- **Data Entry Payload Expansion:** the LLM schema extended to extract operational
  parameters from natural language and generate database commit interfaces.
  > This is MODE 3. What shipped with it: a language model choosing a Firestore collection
  > *and* a document id (`CHANGELOG.md:249`). The collection was later allowlisted and the
  > person resolved through the member list — but the **value** was never validated
  > (**`AU2`**), the **field** is still model-chosen (**`AU3`**), and the personal branch
  > cannot work as instructed (**`AU6`**).
- **Technical Debt Resolution:** iOS Safari phantom-click z-index fix; sandbox Cloud
  Function schema-mismatch crashes patched.

**Known now, not then:** `AU2` `AU3` `AU5` `AU6` `AU7` `AU19` `AU22`.

---

## v2.2 and earlier — *"legacy IDC App"* · reconstructed

Recorded in `CHANGELOG.md` under app `[1.0.0]`–`[1.3.0]`, reconstructed from the README.

- **Early AURA Integration:** a baseline conversational agent using Motivational
  Interviewing (OARS) with basic administrative query routing.
- **Wellbeing Analytics:** Pulse tracking and the daily Social Battery heatmap.
  > The heatmap is `teams/{id}/pulse/{period}`, and AURA still writes it **keyed by display
  > name** — the one place the v2.0 uid migration did not reach. **`AU12`.**
- ~~**Auto-Rostering Framework:** initial "zero-conflict" scheduling logic.~~
  > `ROSTER_POSTMORTEM.md` **E1**: *"zero-conflict"* truthfully means *"cannot double-book
  > by construction"* — a property of the cyclic rotation, not a safety guarantee. **And
  > this is the roster engine, which contains no AI** — it is in this file only because it
  > carries the AURA name. See **`AU1`**.

---

## Timeline of what changed AURA without changing its version

The engine version has read `v2.3` throughout. These are the changes that actually altered
what AURA can do, drawn from `CHANGELOG.md` and `COMMUNITY_TODO.md`:

| When | What | Effect on AURA |
|---|---|---|
| app v1.10.0 | The `ROSTER_ALERT` chat surface removed | AURA stopped force-opening for coverage requests; the roster became the surface. Two README lines still describe the old behaviour (**`AU23`**). |
| 2026-08-19 | `firestore.rules` deployed and enforcing | The first real boundary under MODE 3's writes. `CHANGELOG.md:249` calls the path enumeration *"the single largest security win"* the rules file has. |
| `CP6` | `publicTriageChat` closed — 145 lines, unauthenticated, no callers | One of three open AI endpoints shut. |
| `CP6`/`CP7` | `communityAck` created; `chatWithAura` gained `request.auth` | The public screening stopped calling the staff-facing prompt. ⚠️ `generateSmartAnalysis` was **not** given the same check — **`AN4`**. |
| `CP7` | `rateLimit.js` + App Check shipped (inert) on `communityAck` | Ceilings on the 200-token endpoint. ⚠️ Not on the 8192-token one — **`AU14`**. |
| `CP6`/0.2 | `demoAura.js` written | The sandbox stopped calling Gemini and became genuinely local. ⚠️ Its `db_workload` shape does not match the live one, so the demo card never renders — **`AU22`**. |
| v2.0.0 | Multi-team migration; everything keyed by uid | AURA's paths became team-scoped. ⚠️ The pulse board (**`AU12`**) and the MODE 3 prompt schema (**`AU7`**) were not converted. |
| v2.1.0 | Grade moved to `teams/{id}/grades/{uid}`, list denied | Pay grade left the membership document. ⚠️ A hardcoded copy of six people's grades remained in a client component and ships in the bundle — **`AN1`**. |
| 2026-08-23 | This post-mortem set | 51 findings. **0 fixed.** |

---

## Versioning rules for this file

1. **The AURA version is not the app version**, and an app release must not bump it.
   (`CHANGELOG.md:752`.)
2. **A bump means the capability tier changed** — what AURA can do, not how well it does
   it. Correcting a defect in v2.3 behaviour stays v2.3.
3. **A claim that turns out to be false is struck through and annotated with its finding
   id, never deleted.** Two entries above are already in that state, and both were found
   because somebody read the README rather than the code.
4. **Entries are evidence-bearing**, matching [`AURA-TODO.md`](AURA-TODO.md)'s ledger rule:
   a line saying a thing was fixed carries the test count, the grep, or the sha.
