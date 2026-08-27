# Chatbot Info Card — AURA (the NEXUS assistant)

**Understanding the AI assistant inside NEXUS: what it can do, how it is kept safe, how your
data is handled, and how to raise a concern.**

| | |
|---|---|
| **Card status** | ⚠️ **DRAFT — not yet in effect.** Per `AURA-GUARDRAILS.md` Rule 12, no controlled document enters effect without its named sign-off, and this card has none yet. Approver: Muhammad Alif (owner). |
| **Card version** | 0.2 (draft) |
| **Last updated** | 2026-08-27 |
| **Describes** | NEXUS **v2.1.0** (app) · AURA engine tier **v2.3** · guardrails **v1.0** |
| **Framework** | Structured after the **IMDA Transparency Guidelines for Generative AI Chatbots** (Infocomm Media Development Authority, Singapore, published 20 July 2026), Annex B sample format. The guidelines are voluntary; NEXUS adopts them as its transparency baseline. |

> **This is a consolidated card for a family of AURA surfaces** (the guidelines allow one
> card for a family of closely related chatbot experiences). §1 tells you which variant you
> are using. **The NEXUS roster engine is deliberately outside this card**: it is a
> deterministic constraint solver with no model, no inference and no network call — same
> inputs, same roster, every time. A roster is never AI-generated, and describing it here
> would repeat the exact misdescription this project already corrected (`AU1`).

---

## 1 · What AURA does

### The AURA family, and how to tell which one you are using

| Variant | Where you meet it | Who can use it | Model involved |
|---|---|---|---|
| **Staff assistant** | The chat panel inside NEXUS (`AuraPulseBot`) | Signed-in staff of onboarded teams only | Google Gemini |
| **Public health screening** | The conversational pathway at `/individuals` | Anyone with the link | Google Gemini (acknowledgement text only, capped at 200 tokens) |
| **Year-end analysis** | The Smart Analysis view | Team leads only, signed in | Google Gemini |
| **Demo sandbox** | Demo Mode | Anyone | **None** — local, deterministic scripted replies; nothing is sent to any model |

### Capabilities

The **staff assistant** can:

- Hold a wellbeing check-in conversation using Motivational Interviewing (OARS) techniques —
  peer-level support, not therapy (see §2 and §3).
- Draft memos, SOPs and incident reports, and export them as native Microsoft Word `.docx`
  downloads.
- Read a workload figure out of natural language ("I saw 145 patients in June") and prepare
  a database entry — which is **only saved when a human presses the confirmation button**,
  and only after the proposed write is validated field by field in code
  (`src/utils/dataEntryGuard.js`; 82 passing tests as of this card's date).

The **public screening** pathway asks structured health and activity questions and produces
a navigation result with recommended next steps, tiered by risk. The model's role is limited
to short acknowledgement text between questions; scoring and routing are code, and your
answers are treated as data for the model, never as instructions to it.

The **year-end analysis** turns a team's workload and wellbeing data into a written brief
for its lead.

### About the AI models

AURA's generative surfaces are built on **Google Gemini** models, reached over the Gemini
API from Firebase Cloud Functions. The specific model is resolved at runtime from a
configured list (currently `gemini-2.5-pro`, `gemini-2.0-flash`, `gemini-1.5-pro`,
`gemini-1.5-flash`, with `gemini-1.5-flash` as the safe fallback), and **which model
answered is recorded** — every assistant and analysis response carries a provenance record
(model id, guardrail version, timestamp) that is stamped into `.docx` exports, audit rows
and archived reports. The models are Google's; what is NEXUS's own is the prompting,
validation and scaffolding around them.

### Accuracy and limitations

- AURA can **hallucinate**: generate information that sounds convincing but is incorrect,
  presented confidently as fact. Treat drafts as drafts and verify anything load-bearing.
- AURA has **no retrieval**. It cannot look documents up, so **every citation it produces
  comes from the model's memory and is unverified by construction**. Its own instructions
  require it to label references `model-recalled (unverified)` and forbid it from ever
  claiming a citation is verified.
- AURA has **no access to electronic medical records**, the internet, or anything beyond
  what you type, attach, or what the specific function sends it.
- Sixteen working rules govern AURA's output (`AURA-GUARDRAILS.md`). Read that document's
  conformance table before relying on any of them: some are enforced in code, most are
  instructions to a language model, and instructions to a language model are requests, not
  controls.

---

## 2 · What AURA shouldn't be used for

To keep everyone safe, AURA is not for:

- **Medical advice, diagnosis or treatment.** The public screening result says this on the
  screen it appears on: it is *"an initial community health navigation tool and does not
  constitute medical advice, diagnosis, or a treatment plan"*. Always consult a qualified
  healthcare professional before acting on it. **If you are experiencing chest pain,
  dizziness or any acute symptoms, seek immediate medical attention** — AURA is not an
  emergency service.
- **Generating or changing the roster.** The assistant cannot touch the roster. Rostering
  is a separate, deterministic, non-AI system.
- **Writing to the database on its own.** Every database write AURA proposes sits behind a
  human confirmation click, and the proposal is validated in code before that click.
- **Patient-identifiable data.** Do not type or attach patient data or PHI; use
  placeholders (e.g. `[Patient]`, `[Clinician]`). ⚠️ Said plainly rather than implied: the
  attachment path bounds **count, size and declared type** in code (five files, ~4 MB each,
  ~8 MB per request, five accepted formats) and logs the pass-through — but **nothing
  inspects what is inside a file**. Size and type say nothing about content, so this is a
  cost bound and an audit trail, **not** a data-classification control; the actual control
  on what you paste or attach is you, and what the control should be is an open owner
  decision (`AU17`). What you send is forwarded to Google's API, so treat it with the same
  care as an email to an external party.
- **Companionship or crisis support.** The wellbeing coach offers peer-level,
  conversation-shaped support. It is not a companion product, not therapy and not a crisis
  line; the staff assistant has **no coded crisis-detection or escalation path**. If you or
  someone you know is in distress, contact professional support directly.

**Access restrictions:** the staff assistant and year-end analysis require a signed-in
account with team membership, which only a team lead's invitation or approval can create.
The public screening is open to anyone with the link; it has **no age assurance** (declared
in §6 — the gaps block, not the small print).

---

## 3 · Safety and reliability

*Structured per the IMDA guidelines: for each risk, the safeguards, what is honestly known
about their effectiveness, and what you can do. NEXUS publishes **no quantitative
effectiveness figures because none have been measured**; the guidelines permit qualitative
statements, and a percentage this project cannot evidence would violate its own first
guardrail (fail loud, never silent).*

### Incorrect information (all generative surfaces)

- **Safeguards:** a guardrail preamble on every model call forbids invented citations,
  requires references to be labelled `model-recalled (unverified)`, requires declared
  assumptions, and forbids silent trimming. Output length is bounded in code
  (`maxOutputTokens`). Analysis responses must return a declared assumptions block, and a
  missing one is surfaced as `NO_ASSUMPTIONS_DECLARED` rather than papered over.
- **Effectiveness, honestly:** the code-enforced parts fail closed and are tested. The
  prompt-carried parts are verified to **reach** the model on every call
  (`functions/guardrails.test.js`); **nothing can verify in advance that the model follows
  them**, and a 20-turn human read of real transcripts (`AURA-VERIFICATION-TURNS.md`) is
  the gate before compliance is claimed. That read is the owner's open item `P8.8`.
- **What you can do:** verify anything important against an authoritative source before
  acting on it; treat every citation AURA offers as unverified, because it is.

### High-risk topics on the public screening (health)

- **Safeguards:** the result page carries a prominent medical disclaimer; results are
  tiered (Red / Amber / Green) with next-step guidance routed by tier, including urgent
  care wording on the highest tier; the model cannot steer the assessment — questions,
  scoring and routing are code, the model writes only short acknowledgements capped at 200
  tokens against a fixed prompt no caller can modify, and answers are framed as data.
- **Effectiveness, honestly:** parser defects found in audit (`AC1`, `AC2`) are closed with
  evidence. The disclaimer and urgent-action wording are live in English only; the formal
  clinical review of that wording is an open item (`CD10`), and machine-translated strings
  are with native-speaker reviewers (`CD13`).
- **What you can do:** treat the result as a starting point for a conversation with your GP,
  not a conclusion; seek immediate care for acute symptoms regardless of what any screening
  tool says.

### Harmful content and misuse

- **Safeguards:** Gemini's own safety behaviour applies to all generative output. The
  team feed's AI guard screens posts server-side before creation (clients cannot create
  posts directly). The public endpoint accepts no caller-supplied system prompt and
  validates inputs against closed sets. Per-user and global rate ceilings bound both the
  staff assistant and the public endpoint, so a runaway or hostile caller hits a loud
  ceiling rather than an unbounded bill.
- **Effectiveness, honestly:** the audit's reachable-and-dangerous list is empty as of
  2026-08-24, with the ledger (`AURA-TODO.md`) holding pasted evidence per closed finding.
  Feed **comments** are not screened (`AN13` — accepted, documented). No red-team exercise
  has been run against the deployed prompts.
- **What you can do:** report anything harmful or wrong through the channels in §5 — the
  reporting path exists precisely because no filter is complete.

### Emotional safety (staff wellbeing coach)

- **Safeguards:** the coach is deliberately framed as a productivity-adjacent wellbeing
  check-in, not a companion; chat history lives only in memory and is gone when the panel
  closes, which also limits the depth of para-social attachment the surface can sustain.
- **Effectiveness, honestly:** there is **no coded detection of distress or self-harm
  expressions and no automatic crisis routing** in the staff assistant. This is a known
  property of the current build, not an oversight this card is smoothing over.
- **What you can do:** treat AURA as a tool. For real distress, use your department's
  staff-support channels or professional help; a check-in slider is not a clinical signal.

---

## 4 · Data practices

### What data is collected, per variant

**Staff assistant:**

- **Chat history is held in memory only.** It is not stored in any database and does not
  survive closing the panel — deliberate, for shared clinic terminals.
- What you type (and attach) is sent to Google's Gemini API to generate the reply.
  Attachments are forwarded within the coded bounds described in §2; their contents are
  not inspected first.
- A workload figure is written to the team's database **only** after your confirmation
  click, and the write is validated in code first. Exports and audit rows carry an AI
  provenance record (model id, guardrail version, timestamp).

**Public health screening:**

- The assessment record is **de-identified by design**: no name, no NRIC, no contact
  details, and no browser fingerprint (the one telemetry field that undermined this,
  `clientReference: navigator.userAgent`, was found in audit and removed — `CP3`).
- **Records are deleted automatically after 24 months**, and that sentence is enforced by a
  scheduled sweep in code (`functions/retention.cjs`), not just stated. A notice appears
  before the assessment starts and in full with the result.
- Your answers are sent to Google's Gemini API only to generate the short acknowledgement
  lines.

**Year-end analysis (leads only):** what reaches Gemini is stated plainly rather than
implied: **real clinician names, their titles, their workload figures, and their seniority
band** — never their job grade, and a test fails the build if a grade appears in the
payload. "Band, not grade" is a line that holds; "no identifying data" is not one, and this
card will not offer it.

### Who has access

- Team data is partitioned by membership: `firestore.rules` requires a membership document,
  and a member of one team reads nothing of another's (91 emulator checks assert this).
  Year-end analysis is lead-only.
- Message content is processed by **Google** (Gemini API) as the model provider, and the
  application runs on **Firebase** (Google Cloud). No other third party receives chat
  content. Data is not sold.

### Whether data is used for model training

NEXUS itself trains no models and fine-tunes nothing on your data. Handling by Google's
Gemini API, including any use for model improvement, is governed by **Google's API terms**.
Per the IMDA guidelines, a deployer on a third-party model discloses what is reasonably
available to it: NEXUS has **not independently verified** Google's internal handling and
does not claim to have.

### Your controls

- **Staff chat:** nothing is stored, so there is nothing to request deletion of. A workload
  entry is only ever created by your explicit click.
- **Public screening:** the record holds nothing that links to you — which also means it
  **cannot be looked up or selectively deleted on request**; there is nothing to search by.
  It expires automatically at 24 months. If that trade-off matters to you, the form pathway
  shows the same notice before you answer anything.

---

## 5 · Feedback and reporting

### How to report

- **In the app:** the built-in feedback reporter, which writes to a `beta_feedback`
  collection. Use it for wrong or harmful AURA output, incorrect screening behaviour, and
  bugs.
- **Security and data concerns:** email the lead developer directly at the address
  published in the repository's security policy (`SECURITY.md`). Do not raise security
  issues in public issue trackers. ⚠️ The address is deliberately not reproduced here:
  this card ships in the public application bundle, and a standing control (`AN14`)
  keeps staff email addresses out of that bundle. Whether to publish a dedicated
  public contact address on this card is an open owner decision (§6).

### What you can report

Harmful, offensive or incorrect AI output; privacy or data-handling concerns; suspected
disclosure of anything identifying; screening results that seem clinically wrong; technical
faults.

### What to expect

Security reports are acknowledged within 24 hours with a remediation timeline
(`SECURITY.md`). ⚠️ **For general AURA feedback, no response-time commitment is published
yet** — defining that process is an open item on the transparency ledger rather than a
promise this card invents. What can be said with evidence: audit findings here are tracked
on a public-in-repo ledger where an item is only `DONE` with pasted evidence, and user
reports enter that same pipeline.

---

## 6 · Assumptions, gaps and unverified items

*Required by guardrail P1; deliberately in the body of the card, not a footnote.*

1. **This card is a draft with no named sign-off**, and per Rule 12 it is not in effect
   until the owner approves it.
2. **The card is surfaced in the product, but not yet in force.** The app serves this
   document at `/aura-info`, shows a safety statement with a link at first use of the
   staff assistant and before the public pathways, and keeps a persistent info icon in
   both chat headers (`AURA-TODO.md` 9.2/9.3, closed with test evidence). What that
   surfacing presents is still a draft until item 1 closes.
3. **Prompt-carried safeguards are unverified in production.** The 20-turn read that would
   verify them (`P8.8`) has not been run.
4. **No attachment content inspection exists** (`AU17`): count, size and type are bounded
   in code and logged, but nothing classifies what is inside a file before it reaches
   Google's API. User instruction is the current data-classification control, and whether
   that is sufficient is an open owner decision. (No current client UI sends attachments;
   the bound defines the contract before a UI exists.)
5. **No age assurance exists on the public screening**, and no child-specific safeguards
   are implemented. The tool is aimed at adults making their own health decisions; that
   aim is not enforced.
6. **Google's data handling is taken from Google's terms, not verified independently.**
7. **The medical disclaimer and urgent CTA wording await formal clinical review** (`CD10`),
   and 19 machine-translated strings await native-speaker review (`CD13`).
8. **No quantitative safety metrics exist.** Every effectiveness statement above is
   qualitative by necessity, not by preference.
9. **No public contact email appears on this card**, by design conflict rather than
   oversight: the IMDA guidelines suggest a support address, and the `AN14` control keeps
   staff addresses out of the public bundle this card ships in. The working public channel
   is the in-app reporter; publishing a dedicated (non-personal) support address would
   resolve the conflict and is the owner's call.

---

## Card versioning

Per the IMDA guidelines' timeliness principle, this card is updated when a development
meaningfully changes AURA's capabilities or safety profile — a model change in
`resolveModel()`'s list, a guardrail revision (the guardrail version is stamped into every
provenance record, so drift is detectable), a new AURA capability, or a newly identified
risk — and reviewed at least annually even without one. Routine UI and infrastructure
changes do not trigger an update. The card carries its own version and last-updated date in
the header, alongside the app and engine versions it describes; `package.json` remains the
single authoritative app version.

| Card version | Date | Change |
|---|---|---|
| 0.2 (draft) | 2026-08-27 | Surfaced in-app: served at `/aura-info` from this file verbatim, first-use safety statements on both chat surfaces, persistent header links. The security contact address was replaced with a reference to `SECURITY.md` — the `AN14` bundle control refused the literal address in the public bundle, and the conflict is declared as gap item 9. |
| 0.1 (draft) | 2026-08-27 | First draft, structured after IMDA Annex B. Not yet signed off, not yet surfaced in-app. |
