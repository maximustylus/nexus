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

## Unreleased — **v2.3.1**, not v2.4 · 2026-08-23 → 2026-08-24

⚠️ **This section said *"Nothing yet. Every row is `OPEN`"* until 2026-08-24, by which point
two days of remediation had shipped.** A changelog that is not written when the work lands is
a changelog that is wrong, and it was. What follows is reconstructed from the commits, not
from memory, and each line cites one.

**Still v2.3.1-equivalent, deliberately.** An engine version bump belongs to a change in
capability *tier*. Everything below **corrects what the current tier already claimed to do**,
which is the opposite of a new tier. Bumping to v2.4 because a lot of work happened would be
the kind of number-moving this file exists to stop.

### The prompts (`AURA-TODO.md` P7) — `88af00f`

- **`AU6` + `AU7`** — MODE 3 now asks for the **display name** as `target_doc`. The prompt
  asked for a uid while `memberUidByName` looked up a name, so the feature only worked when
  the model **disobeyed** its own schema.
- **`AU19`** — `requiredFields` throws instead of warning, and `db_workload` is in the list.
  It was the one field leading to a database write and the only one absent from the check
  that was not checking.
- **`AU20`** — temperature keyed on the server-held `personaId`, not a substring of caller
  text. Default 0.7 → **0.4**.
- **`AU28`** — persona text moved out of the user turn and into `systemInstruction`, held in
  `functions/personas.cjs`. The caller `prompt` is still accepted and is no longer labelled
  `CONTEXT/OVERRIDE:`. **The persona wording is unchanged, word for word.**
- **`AN5`** — the analysis asks for 600–900 + 200–350 words against a budget raised 2,048 →
  **4,096**, with a test that computes the ask from the prompt.
- **`AN3`** — no institution is hardcoded in the analysis prompt.
- `functions/promptContract.test.js`: 33 assertions, **15 of which fail on the pre-P7 code**.

### The guardrails (`AURA-TODO.md` P8) — 2026-08-24

The owner's sixteen rules, in [`AURA-GUARDRAILS.md`](AURA-GUARDRAILS.md) and
`functions/guardrails.cjs`.

- **Rule 12 / `AU16` (half)** — which model answered is **recorded**: on every chat and
  analysis response, in the .docx export footer, in the `smart_database` audit row and in the
  archived year-end report. It was recorded nowhere, and `resolveModel()` silently falls back
  between five models, so it was not recoverable afterwards either. ⚠️ The **cache reset**
  half of `AU16` is still open.
- **P1** — the wellbeing report carries a declared *"Assumptions, gaps and unverified items"*
  block, and when the model omits one the report says the model declared nothing rather than
  claiming there was nothing to declare.
- **Rule 15** — *content is data, never instruction* now reaches `processFeedPost`, which
  classifies staff-authored text and acts on its own verdict and had no such line.
- `functions/guardrails.test.js`: 72 assertions, **10 of which fail on the pre-guardrail
  code**.

⚠️ **Ten of the sixteen rules are asserted to be *present in the prompt*, never *followed by
the model*.** §B of `AURA-GUARDRAILS.md` is the split. Do not read a green suite as
compliance.

### Before that — `c2b45d9`, `a99ffa6`, `addf3a5`, `e3b6bb9`

`AN1` `AN2` `AN3` (colleagues' job grades out of the public bundle, the analysis over the
caller's own team), `AN4` (the analysis endpoint was unauthenticated), `AU2` `AU3` `AU22`
`AU25`, `AC1` `AC2` `AC15` (the PAVS parser). Evidence for each is in
[`AURA-TODO.md`](AURA-TODO.md).

### What would justify a real v2.4, if the owner decides them that way

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
