# NEXUS: Smart Operations Dashboard v1.18.0 [BETA]

![Version](https://img.shields.io/badge/Version-v1.18.0-blue) ![Status](https://img.shields.io/badge/Status-Beta%20Phase-emerald) ![Org](https://img.shields.io/badge/Unit-Sport%20%26%20Exercise%20Medicine-indigo) ![Tech](https://img.shields.io/badge/AI-Gemini%20Powered-purple) ![AURA](https://img.shields.io/badge/AURA-v2.3%20Engine-blue) ![PWA](https://img.shields.io/badge/PWA-Native%20Push%20Enabled-blue) ![CI/CD](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-2ea44f)

**NEXUS** (formerly IDC App) is a clinician-led innovation platform designed to revolutionise workload management, optimise skill-mix routing, and actively protect staff wellbeing at the Sport and Exercise Medicine Centre. 

At its core lies **AURA** (Adaptive Understanding and Real-time Analytics), a proprietary, autonomous AI agent that bridges the gap between raw operational data and staff psychological safety. AURA does not just read data; it actively interprets cognitive load, negotiates scheduling conflicts, executes database mutations, and mitigates burnout risk.

> **Master the Grind * Protect the Pulse * Build the Future**
> *Note: This application is currently in active Beta and is being evaluated by the Senior Clinical team for internal efficiency, burnout prevention, and resource allocation.*

***

## The Four Pillars of NEXUS

### Pillar A: AURA Intelligence Engine (v2.3)
AURA is an autonomous operational middleware integrated directly into the NEXUS platform. It dynamically shape-shifts its UI and persona based on immediate operational or emotional needs:
* **Roster Mediation:** the app listens for peer-to-peer coverage requests over Firebase `onSnapshot`. A request surfaces **in the roster** — a badge on the affected shift and an inline card — and on approval the master roster document is rewritten in the accepting colleague's browser, then **read back** before the request is marked approved. *(Corrected 2026-08-15: this described AURA forcing open its chat panel with a `ROSTER_ALERT` bubble. That surface was removed in v1.10.0 — `AuraPulseBot.jsx:19-33` records the move — and nothing renders `ROSTER_ALERT` today. The requester is still **not** notified of the outcome; there is no mechanism, tracked as decision `Q3`.)*
* **The Wellbeing Coach:** Utilising Motivational Interviewing (OARS) and the Mental Health Continuum, AURA provides peer-level psychological first aid and workflow adjustments based on real-time "Social Battery" indexing.
* **The Clinical and Database Agent:** AURA transitions to an analytical mode to extract operational parameters from natural language (e.g. "I saw 145 patients in June") to generate secure UI blocks for direct Firestore commits. It also generates structured deliverables including Coordination Memos, SOPs, and Incident Reports.
* **Native File System Integration:** Bypassing mobile browser constraints, AURA compiles parsed Markdown into true Microsoft Word `.docx` Blob objects, triggering native file downloads directly from the chat UI.
* **Proactive Nudges:** Every weekday at 09:00 AM, AURA fires native push notifications prompting a 30-second check-in. Based on 0 to 10 sliders for Energy and Focus, it automatically routes staff into specific recovery protocols.

### Pillar B: NEXUS Feeds (The Digital Watercooler)
* **Secure Knowledge Sharing:** A PDPA-compliant, internal social feed dedicated to sharing clinical insights, team wins, and Community of Practice updates. 
* **Immersive Lightbox UI:** Features distraction-free reading, secure deep-linking for seamless cross-platform sharing, and real-time nested discussion threads.

### Pillar C: Smart Workload and AI Audits
* **Deep AI Audits:** Powered by Google's Gemini models, NEXUS transforms raw operational data into high-level strategic insights. It cross-references data against staff Job Grades.
* **Private Executive Briefs:** Unfiltered analytical reports for Admins identifying scope creep, operational bottlenecks, and imminent burnout risks.
* **Public Team Pulses:** Morale-boosting summaries designed for the wider team to align strategic focus and celebrate wins.
* **Time Travel Archive:** Instantly access historical workload data to track team progression across fiscal years.

### Pillar D: Auto Rostering
* **Zero-Conflict Architecture:** Eliminates manual scheduling friction by generating mathematically safe rosters based on predicted case volumes and specific skill-mix requirements.
* **Unified Interface:** A high-fidelity calendar view allowing staff to view coverage and trigger integrated shift-swaps instantly.

***

## Technical Architecture and File System

NEXUS is built on a dual-environment architecture, designed to switch seamlessly between a Live Firebase Environment and a Local Sandbox (Demo Mode).

### Tech Stack
* **Frontend:** React (Vite build system)
* **Styling:** Tailwind CSS (utilising `animate-in` plugins and dynamic `dvh` math for mobile responsiveness)
* **Icons:** `lucide-react`
* **Charts:** `recharts`
* **Backend / Auth:** Firebase (Firestore, Authentication, Cloud Functions)
* **Document Generation:** `docx`

### Repository Structure
```text
nexus/
|-- .github/workflows/
|   |-- deploy.yml                 # CI/CD pipelines (GitHub Actions)
|-- functions/                     # Firebase Cloud Functions (Node.js backend)
|   |-- index.js                   # Serverless logic (Gemini API, HTTPS calls)
|   |-- package.json               # Backend dependencies
|-- public/                        # Static assets and PWA manifest
|   |-- firebase-messaging-sw.js   # Service worker for push notifications
|   |-- manifest.json              # Progressive Web App configuration
|   |-- logo.png                   # Live department branding
|   |-- nexus.png                  # Sandbox branding
|-- src/                           # React Frontend Source
|   |-- components/                # Reusable React UI components
|   |   |-- AdminPanel.jsx         # Executive overview and audit logs
|   |   |-- AppGuide.jsx           # Application manual and onboarding
|   |   |-- AuraGreeting.jsx       # Contextual floating smart quote widget
|   |   |-- AuraPulseBot.jsx       # AURA AI Agent chat interface
|   |   |-- ConfirmationModal.jsx  # Secure action validation dialogs
|   |   |-- FeedbackWidget.jsx     # Ghost event-driven bug reporter
|   |   |-- FeedsView.jsx          # Digital watercooler and posts
|   |   |-- PostLightbox.jsx       # Immersive post expansion UI
|   |   |-- ProfileView.jsx        # User management and authentication
|   |   |-- ResponsiveLayout.jsx   # Core responsive shell (Mobile/Desktop)
|   |   |-- RosterView.jsx         # Auto-rostering and shift management
|   |   |-- SmartReportView.jsx    # Data visualization for AI audits
|   |   |-- WellbeingView.jsx      # Pulse and social battery tracking
|   |-- config/
|   |   |-- personas.js            # AURA behaviour models
|   |-- context/
|   |   |-- NexusContext.jsx       # Theme and Demo mode state providers
|   |-- data/
|   |   |-- mockData.js            # Marvel superhero simulation dataset
|   |-- hooks/
|   |   |-- useWindowSize.js       # Viewport boundary calculations
|   |-- utils/
|   |   |-- auraChat.js            # AURA conversational helpers
|   |   |-- auraEngine.js          # Core LLM prompt structures and routing
|   |   |-- index.js               # Shared utilities and staff directories
|   |-- App.jsx                    # Main application router and shell
|   |-- firebase.js                # Firebase client initialisation
|   |-- main.jsx                   # React DOM entry point
|   |-- index.css                  # Global styles
|   |-- style.css                  # Component-specific overrides
|-- firebase.json                  # Firebase hosting and functions configuration
|-- package.json                   # Frontend Node modules and build scripts
|-- tailwind.config.js             # Tailwind CSS styling configuration
|-- cors.json                      # Cross-Origin Resource Sharing rules
```

### AURA System Diagram (v2.3)
```text
┌─────────────────────────────────────────────────────┐
│  AuraPulseBot.jsx (React Presentation & State)      │
│                                                     │
│  UI Logic: Frosted Glass Focus Blur (z-[90])        │
│  Modes: COACH | ASSISTANT | RESEARCH | DATA_ENTRY   │
│                                                     │
│  [User Input] ────► sanitize ────► httpsCallable()  │
│  [UI Render]  ◄──── JSON parse ◄── Firebase Return  │
│                                                     │
│  [Swap Modal] ◄──── onSnapshot ◄── Firebase Live DB │
└─────────────────────────┬───────────────────────────┘
                          │ (Secure HTTPS RPC & WebSockets)
                          ▼
┌─────────────────────────────────────────────────────┐
│  Firebase Backend (Cloud Functions & Firestore)     │
│                                                     │
│  1. LLM Orchestration (Gemini API)                  │
│  2. Data Extraction & Schema Validation             │
│  3. shift_swaps Collection (Master Roster Mutator)  │
└─────────────────────────────────────────────────────┘
```

### Essential Components and Technical Standards
1. **Layout and Navigation (`App.jsx` and `ResponsiveLayout.jsx`):** Controls global state for the active view and timeline. Incorporates Smart Routing to capture shared deep links and handles a master anti-zombie logout flush.
2. **Contextual Greeting (`AuraGreeting.jsx`):** A floating widget using `getDailySmartQuote()` to serve contextually relevant psychological briefs based on the time and daily patient load. 
3. **Ghost Feedback System (`FeedbackWidget.jsx`):** An event-driven, invisible component that listens for native JavaScript `CustomEvent` triggers to deploy bug reporting tools without cluttering the DOM.
4. **Charting Rules (Recharts):** When modifying charts, always wrap the component in a `<ResponsiveContainer width="100%" height="100%">`. Using a standard `<Container>` will cause a fatal Vite build error.
5. **Tailwind CSS Safety:** Vite compiles Tailwind classes statically. Do not string-interpolate Tailwind class names (e.g. avoid `className="border-${color}-500"`).

### Resolved Technical Debt
* **The "Phantom Click" UI Bug:** Resolved an issue where tapping AURA's Send button triggered the invisible FeedbackWidget beneath it on iOS Safari. AURA now drops the widget to a negative z-index upon opening.
* **Sandbox Cloud Function Crash:** Implemented a Hard Bypass in `SmartAnalysis.jsx`. If Demo Mode is active, the component intercepts the network call and injects a simulated Marvel Executive Brief to prevent schema mismatch errors on the live server.

***

## Security, Access and Data Governance

**RESTRICTED: INTERNAL SSMC@KKH STAFF ONLY (LIVE MODE)**
This application is an operational and workload management tool. It is not a clinical system and is not yet a fully integrated hospital system managed by Synapxe. Live Mode is locked behind enterprise-grade authentication.

### Supported Versions
| Version | Status |
| ------- | ------ |
| 1.18.x  | **Active Beta** (Evaluated by Senior CEPs) |
| 1.17.x  | Legacy Stable |
| < 1.17  | Deprecated / Offline |

> This table is downstream of `package.json` `version`, as are the title line and the
> `Version-` badge above, and `SECURITY.md`'s table of the same name. `package.json` is the only authoritative copy — see
> [`CHANGELOG.md`](CHANGELOG.md) for the standing rule on bumping it.

### The "Data Firewall" and Security Policies
1. **Strict Whitelisting (client-side):** access is limited to pre-approved `@kkh.com.sg` addresses against an allowlist array. ⚠️ **This is enforced in the browser, not on a server** — the domain and directory checks run in `WelcomeScreen.jsx` against `TEAM_DIRECTORY` in `src/utils/index.js`, and **no Cloud Function checks the caller** (`grep -c 'request.auth' functions/index.js` → 0). *(Corrected 2026-08-15: previously called a "Backend Firewall".)*
2. **PDPA Compliance:** Do not upload sensitive patient data or PHI. NEXUS tracks operational load, not patient records. AURA does not have EMR access. Use placeholders exclusively (e.g. `[Patient]`, `[Clinician]`).
3. **Demo isolation (client-side):** Demo Mode injects `MOCK_TEAM_DATA` and the roster path writes nothing — three separate latches short-circuit before `setDoc`, and the sandbox roster is generated in the browser and lost on reload. ⚠️ **There are no separate demo collections**, so this is a guard in the code rather than a boundary in the database; and it is not total — `FeedsView.jsx:158` calls `processFeedPost` with `isDemo` and no short-circuit, so a demo feed post does reach the production `feed_posts` collection and is hidden from live users by a **client-side** filter (`FeedsView.jsx:136`). *(Corrected 2026-08-15: previously claimed "strictly isolated Firebase collections".)*

### Known Limitations
* **Workload Commit Verification:** AURA can format database writes, but requires a human-in-the-loop physical click to execute the final `setDoc` function.
* **Shift Swap Domino Effect:** When AURA rewrites the master calendar, it does not currently validate if the new staff member exceeds consecutive working day limits.
* **Authorization is unversioned.** `firestore.rules` exists in the repository but **nothing deploys it** — `firebase.json` declares only `hosting` and `functions` — so who may write `system_data/roster_2026` and `shift_swaps` is defined only in the Firebase console, by hand, with no history and no review. The roster rewrite runs in the accepting colleague's browser. This is workable for one trusted team and is the **first thing to settle before a second department's data is involved** (decision `Q6`). It is also why a *time-gated* roster release cannot honestly be built as a UI feature: the roster document is read client-side, so hiding it in the interface would not withhold it.
* **The requester is never told the outcome** of a coverage request. The copy says so on screen rather than implying otherwise, but there is no notification mechanism (decision `Q3`).
* **A task can require only one thing of a person.** `requiresSkill` is a single string, so a competency and a registration status compete for the same slot — "a registered clinician who is also CPET-competent" cannot be expressed. Registration gating is **not** available (decision `Q12`).
* **No on-call or standby.** The engine has no concept of a standby period, call-in, or post-call rest. A category *named* `ON CALL` groups tasks for quotas and colours the calendar; it carries no on-call semantics.

***

## Interactive Demo Mode and Smoke Testing

To facilitate safe stakeholder demonstrations without exposing sensitive hospital data, NEXUS features a fully functional Demo Sandbox populated by a "Marvel Superhero" Healthcare Team.

Beta testers should utilise Demo Mode to verify system integrity:
1. **The Roster Test:** in the Roster view, click one of *your own* shifts and request cover from a colleague. **On that colleague's screen** the shift carries a badge and an inline coverage card with Accept / Decline. *(Corrected 2026-08-15: this said AURA slides open with an amber `ROSTER_ALERT`. It cannot — the chat surface went in v1.10.0, and in Demo Mode `RosterView.jsx:1069` opens no `shift_swaps` channel at all, so this test needs two signed-in live users.)*
2. **The Data Entry Test:** Tell AURA, "I saw 145 patients in June." She should parse the numbers and display a green `DATA_ENTRY` block with a button to push to Firestore.
3. **The Export Test:** Ask AURA to "Draft a 1-page SOP for rooming workflow" and click the Export button to verify the native `.docx` download.
4. **The Sandbox Test:** While in Demo Mode, trigger an AURA Deep Audit. The system must safely bypass the live cloud server and return the simulated Marvel Universe brief flawlessly.

***

## Release History

> The authoritative, machine-readable record is **[`CHANGELOG.md`](CHANGELOG.md)**, which
> also lists the **known issues that are documented but not yet fixed**. The summaries
> below are narrative highlights; where the two disagree, `CHANGELOG.md` is correct.

### NEXUS v1.18.0 [Current Beta]
* **A task can state a minimum job grade.** *"Minimum AH12 covers NICU"* is now sayable — and it holds for **everyone** on the duty, not just the person leading it. That distinction is the whole feature: the band chips gate the *lead* and let any grade assist, which is right for a supervision shape and wrong for a floor. Since `junior` spans AH11–AH12, a department whose floor is AH12 could not express it with bands at all without also admitting AH11. Set it in the task table; the engine refuses at configure time if nobody in your pool meets it.

### NEXUS v1.17.1
* **The colleague nobody rostered is now named on screen.** If anybody in the staff pool holds no duty at all, an amber panel says who — and names the four things that cause it: a grade outside every task’s band gate, a missing required skill, unavailable dates covering the run, or an availability window falling outside it. Amber rather than red because it is a *question*, not a failure: it is correct when somebody genuinely is not on that rota, and a silent disaster when it is a typo. *(Their row in the load table always read `0` — what was missing is that a `0` among nine rows does not announce itself.)*

### NEXUS v1.17.0
* **🔒 The authorization boundary is now versioned, reviewed and enforced.** Until this release, who could read and write the live clinical data was defined only in the Firebase console — and what it said was `allow read, write: if isVerifiedStaff()`, where "verified staff" meant **any verified `@kkh.com.sg` address, not the ten-person team**. The app's Firebase key ships in the public bundle, so any KKH employee who registered an account could read `wellbeing_history` — the per-clinician burnout record — overwrite the duty roster, and approve any swap. `firestore.rules` now replaces that with a directory allowlist, is declared in `firebase.json`, and deploys from CI on every merge. Decision **Q6**, open since before v1.6.0, is closed.
* **Roster generation is now admin-only.** Generation overwrites the whole roster; a single-day edit (accepting a swap) stays open to every team member. A colleague who presses Generate gets a clean "The roster was NOT saved" and keeps their configuration.
* **A stress-tester agent and harness** (`npm run stress`) — the engine had never been run on a configuration nobody wrote by hand, nor above 20 staff. 2,525 random rosters: no invariant broken. It also produced the first performance measurement this project has ever had (**D11**).

### NEXUS v1.16.0
* **A sixth roster structure, and the first one respiratory described.** Respiratory therapy's lead walked through the Sandbox configuration and described their week — a minimum job grade, three named areas, rotation across them, weekdays. It is now a shape in the picker: *"A grade floor, and a rotation across fixed areas"*. Respiratory previously *lost* an invented fixture in v1.13.0 for claiming a service nobody had described; it got a reported one back by being asked, which is the rule working in the direction it was written for.
* **A shape is one team at one institution, and the app now says so.** Until this release the picker told a visitor *"this is the shape your own profession described to us"* — so a respiratory therapist at any other SingHealth institution was told their **profession** had described a structure that **one team at one hospital** described, and 27 other allied health professions carried the same exposure. Every shape now carries `sourceScope` — how many teams, how many institutions, and when — as a required field rather than a sentence somebody has to remember to rewrite. **The respiratory shape is attributed but deliberately suggested to nobody**, because RTs work across every institution in the cluster and rotate differently.
* **Known limit shipped knowingly:** the respiratory grade floor is *"minimum AH12"*, and a band gate cannot express a threshold that falls **inside** a band (`junior` is AH11–AH12). See the known-issues table in [`CHANGELOG.md`](CHANGELOG.md).

### NEXUS v1.15.0
* **Categories are colour-coded, everywhere the shift goes.** Four standard categories — **Clinical** (brown), **Education** (orange), **Research** (lime green), **Management** (yellow) — colour the calendar, the wizard's per-task label, and the downloaded `.ics`: every event carries `CATEGORIES:` (so Outlook can colour by category after a one-time mapping) and, for the four standard ones, RFC 7986 `COLOR:` — whose value must be a CSS colour name, which the palette's four names literally are. One map (`src/utils/rosterCategories.js`) feeds all three surfaces, so the app and the imported file cannot disagree.
* **The category box now offers the standard four** (free text still works — a weekend quota pools over whatever word its team typed), and a **deterministic suggestion** reads the task name and offers its category *with the word that earned it* — "looks like Research — 'Journal'" — applied only on a tap, never silently. Not AI, on purpose: category changes quota pooling, so a suggestion the roster master cannot check is a claim.

### NEXUS v1.14.0
* **The Configuration Wizard is a Numbered Sequence:** its seven panels carry badges 1–7 on a connecting spine, so a colleague being walked through the Sandbox can say which step they are on. The numbers are **derived, not typed** — a step's number is its index in `WIZARD_STEPS` (`src/utils/rosterWizard.js`), the same derive-don't-duplicate rule the band ruler follows. Steps 1–2 render from `RosterView.jsx` and 3–7 from `RosterDemoWizardTables.jsx`, through one new presentational component, `src/components/WizardStep.jsx`; hand-numbering would have been two files to keep in agreement. Live mode's wizard is deliberately **not** numbered — it is a different and shorter thing.
* **Two phone-layout fixes at 375px**, both introduced by the spine's 32px gutter and both found by looking rather than by testing: the grade ruler's tick labels were clipping from `AH10` up, and the date field had lost its year.
* **Documentation reconciled.** The `D`-prefix meant *defect* in some documents and *decision* in others, colliding at 5–8 with unrelated meanings; decisions are now `Q`n. The five historical audit documents gained dated status banners rather than edits, so a post-mortem's findings are never quietly revised once fixed.
* **Scope:** Sandbox-first. Live mode's generation path is unchanged and `system_data/roster_2026` keeps the same stored shape.

### NEXUS v1.13.0
* **Profession and Shape Arrangement Picker:** The Sandbox wizard now opens with two controls — MOH's own list of 28 allied health professions, and **five roster structures**, each attributed on screen to the profession that described it in interview. It replaces an earlier attempt at one fabricated department per profession; six invented arrangements were deleted rather than shipped.
* **Four Grade Bands (correctness fix):** `nonExempt AH7–AH10 · junior AH11–AH12 · senior AH13–AH14 · principal AH15–AH17`. Non-exempt staff (associates, assistants, technologists) shared a band with junior clinicians, so any task gated on the junior band would let a non-exempt assistant lead it. 121 tests were repaired, of which one was a genuine fixture defect rather than a stale assertion.
* **One Version, One Source:** the app now reads its version from `package.json` via `src/version.js`. Three hand-typed literals had drifted (`v1.41-OFFICIAL`, `System v1.52`, `System Database v1.4`) and all three were live on the deployed site at once. A test now fails the build if a version is typed by hand in rendering code.
* **Band Ruler Property Test:** the grade-band ruler is swept across its whole input space and proven to draw a legal partition, or to say honestly that it could not — seven mutations of the ruler's maths, every one caught.
* **Scope:** the roster work above is Sandbox-first. Live mode's generation path and its wizard are unchanged, and `system_data/roster_2026` keeps the same stored shape.

### NEXUS v1.7.0 to v1.12.0
> These eight releases were never narrated in this section. [`CHANGELOG.md`](CHANGELOG.md) is their only record and is the authoritative one; one line each here so the gap is visible rather than silent.
* **v1.12.0** — the Sandbox wizard rebuilt for the phone, because that is where visiting colleagues actually open it.
* **v1.11.0** — the engine's accumulated per-profession flags refactored into orthogonal primitives, plus the first working `npm run lint` in the repository's history (now a CI gate).
* **v1.10.0** — v1.9.0's engine capability made reachable from the UI; the roster tells the truth in the calendar itself, and coverage requests moved out of the AI chat panel into the roster.
* **v1.9.0** — engine capability for the remaining two interviewed teams, plus the band ruler.
* **v1.8.1** — fixes, including the app header rendering on top of the open Configuration Wizard.
* **v1.8.0** — the roster master release: job grades, band-gated tasks, monthly clinics and continuity of care, built from field interviews with four allied-health teams.
* **v1.7.1** — all fixes: live-mode generation lands on the weekdays it claims, standards-compliant exports, and no native browser dialogs left in the roster view.
* **v1.7.0** — a constraint-aware rostering engine in Sandbox mode, with live mode's original generator verified byte-identical across 720 configurations.

### NEXUS v1.6
* **Verification Infrastructure:** Introduced the project's first working test harness (Vitest, Testing Library, jsdom) with 23 characterization tests for the roster generator, and wired `npm test` into the GitHub Actions deploy workflow so a failing suite now blocks release.
* **Roster Lead / Co-Lead Pairing:** Restructured generated shifts into a single paired object per task carrying explicit `lead` and `coLead` fields, with dedicated Lead and Co-Lead columns in the CSV export. **Note:** this changed the stored shape of `system_data/roster_2026` — see the *Breaking* entry in `CHANGELOG.md`.
* **Safer Roster Generation:** Routed the destructive 4-week generation through the custom `ConfirmationModal` and added error handling to the write path.
* **Clinical Reach:** Seeded the national resource registry (22 resources across 5 regions) and added an AURA care tier routing socially isolated seniors to tele-befriending and Active Ageing Centre support.
* **Engineering Governance:** Published the roster post-mortem, independent QC audit and sequenced remediation plan; pinned the previously unpinned `@google/generative-ai` dependency; established `CHANGELOG.md` and reconciled `package.json` with the documented version.

### NEXUS v1.5
* **NEXUS Feeds Integration:** Deployed the Digital Watercooler for secure, PDPA-compliant clinical knowledge sharing and Community of Practice updates.
* **Immersive Lightbox UI:** Implemented distraction-free reading environments with nested real-time discussion threads.
* **Smart Routing Architecture:** Engineered URL parameter detection to support secure deep-linking and cross-platform post sharing.
* **Security Enhancements:** Executed a master anti-zombie logout flush to instantly kill lingering Firebase database connections and replaced all native browser alerts with secure, custom-branded confirmation modals.

### NEXUS v1.4 and AURA v2.3
* **AURA Engine Upgrade (v2.3):** Evolved the AI from a reactive conversational bot into a proactive database middleware agent.
* **Autonomous Roster Mediation:** Enabled AURA to actively listen to Firebase collections via live snapshots and independently execute peer-to-peer shift swap matrix rewrites.
* **Native File Export:** Bypassed mobile browser limitations to allow AURA to compile parsed text and trigger direct Microsoft Word document downloads.
* **Data Entry Payload Expansion:** Upgraded the LLM schema to extract operational parameters from natural language and generate secure database commit interfaces.
* **Technical Debt Resolution:** Eliminated the iOS Safari phantom click UI bug through dynamic z-index management and patched Sandbox Cloud Function schema mismatch crashes.

### NEXUS v1.0 to v1.3 (Legacy IDC App) and AURA v1.0 to v2.2
* **Foundational Architecture:** Established the core React and Firebase dual-environment infrastructure separating Live production data from the local Sandbox.
* **Wellbeing Analytics:** Deployed the primary Pulse tracking system and the daily Social Battery heatmap.
* **Auto-Rostering Framework:** Built the initial zero-conflict scheduling logic and unified calendar interfaces.
* **Early AURA Integration:** Introduced the baseline conversational agent focused heavily on Motivational Interviewing (OARS) and basic administrative query routing.

## Future Roadmap (Not Yet Built)

> Previously headed *"Pending v1.8"*. v1.8.0 shipped on 2026-08-08 and neither item below was part of it; nothing in `src/` references either today. The heading no longer names a version, so it cannot go stale again — these are unbuilt, not scheduled.

* **Admin Security Audit Logs:** Implementation of a transparent access tracking system within the Admin Panel to monitor user logins, profile alterations, and data export events.
* **Enterprise Scaling and Multi-Tenancy:** Transitioning the app from a hardcoded single-team environment to a dynamic, database-driven configuration. This will allow multiple departments to utilise NEXUS with completely isolated data sub-collections and custom organisation logos.

***

## Project Lead and License

* **Muhammad Alif** : *Lead and Senior Clinical Exercise Physiologist*
* *Concept, Architecture and Development Phase (2026)*

**Copyright 2026 Muhammad Alif. All Rights Reserved.** This repository is provided for portfolio and demonstration purposes only. You may not copy, reproduce, distribute, publish, display, perform, modify, create derivative works, transmit, or in any way exploit any such content, nor may you distribute any part of this content over any network, sell or offer it for sale, or use such content to construct any kind of database.
