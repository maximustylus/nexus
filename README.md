# NEXUS: Smart Operations Dashboard v1.5 [BETA]

![Status](https://img.shields.io/badge/Status-Beta%20Phase-emerald) ![Org](https://img.shields.io/badge/Unit-Sport%20%26%20Exercise%20Medicine-indigo) ![Tech](https://img.shields.io/badge/AI-Gemini%20Powered-purple) ![AURA](https://img.shields.io/badge/AURA-v2.3%20Engine-blue) ![PWA](https://img.shields.io/badge/PWA-Native%20Push%20Enabled-blue) ![CI/CD](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-2ea44f)

**NEXUS** (formerly IDC App) is a clinician-led innovation platform designed to revolutionise workload management, optimise skill-mix routing, and actively protect staff wellbeing at the Sport and Exercise Medicine Centre. 

At its core lies **AURA** (Adaptive Understanding and Real-time Analytics), a proprietary, autonomous AI agent that bridges the gap between raw operational data and staff psychological safety. AURA does not just read data; it actively interprets cognitive load, negotiates scheduling conflicts, executes database mutations, and mitigates burnout risk.

> **Master the Grind * Protect the Pulse * Build the Future**
> *Note: This application is currently in active Beta and is being evaluated by the Senior Clinical team for internal efficiency, burnout prevention, and resource allocation.*

***

## The Four Pillars of NEXUS

### Pillar A: AURA Intelligence Engine (v2.3)
AURA is an autonomous operational middleware integrated directly into the NEXUS platform. It dynamically shape-shifts its UI and persona based on immediate operational or emotional needs:
* **The Auto-Healer (Roster Mediation):** AURA actively listens to the database for peer-to-peer shift swap requests using Firebase `onSnapshot` listeners. If a colleague requests coverage, AURA forces open its UI, delivers a high-priority `ROSTER_ALERT`, and upon approval, autonomously rewrites the master calendar matrix.
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
│  Modes: COACH | ASSISTANT | DATA_ENTRY | ALERT      │
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
| 1.5.x   | **Active Beta** (Evaluated by Senior CEPs) |
| 1.4.x   | Legacy Stable |
| < 1.4   | Deprecated / Offline |

### The "Data Firewall" and Security Policies
1. **Strict Whitelisting (Backend Firewall):** Access is exclusively limited to pre-approved `@kkh.com.sg` email addresses via a master scalable allowlist array.
2. **PDPA Compliance:** Do not upload sensitive patient data or PHI. NEXUS tracks operational load, not patient records. AURA does not have EMR access. Use placeholders exclusively (e.g. `[Patient]`, `[Clinician]`).
3. **Data Sharding (Frontend Firewall):** Live production data and Demo simulation data operate on strictly isolated Firebase collections. Demo Mode injects `MOCK_TEAM_DATA` and prevents actual Firebase writes.

### Known Limitations
* **Workload Commit Verification:** AURA can format database writes, but requires a human-in-the-loop physical click to execute the final `setDoc` function.
* **Shift Swap Domino Effect:** When AURA rewrites the master calendar, it does not currently validate if the new staff member exceeds consecutive working day limits. 

***

## Interactive Demo Mode and Smoke Testing

To facilitate safe stakeholder demonstrations without exposing sensitive hospital data, NEXUS features a fully functional Demo Sandbox populated by a "Marvel Superhero" Healthcare Team.

Beta testers should utilise Demo Mode to verify system integrity:
1. **The Roster Test (Auto-Healer):** Go to the Roster view, click a shift, and send a Swap Request. AURA should slide open automatically with an amber `ROSTER_ALERT` offering an Accept/Decline protocol.
2. **The Data Entry Test:** Tell AURA, "I saw 145 patients in June." She should parse the numbers and display a green `DATA_ENTRY` block with a button to push to Firestore.
3. **The Export Test:** Ask AURA to "Draft a 1-page SOP for rooming workflow" and click the Export button to verify the native `.docx` download.
4. **The Sandbox Test:** While in Demo Mode, trigger an AURA Deep Audit. The system must safely bypass the live cloud server and return the simulated Marvel Universe brief flawlessly.

***

## Release History

### NEXUS v1.5 [Current Beta]
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

## Future Roadmap (Pending v1.6)

* **Admin Security Audit Logs:** Implementation of a transparent access tracking system within the Admin Panel to monitor user logins, profile alterations, and data export events.
* **Enterprise Scaling and Multi-Tenancy:** Transitioning the app from a hardcoded single-team environment to a dynamic, database-driven configuration. This will allow multiple departments to utilise NEXUS with completely isolated data sub-collections and custom organisation logos.

***

## Project Lead and License

* **Muhammad Alif** : *Lead and Senior Clinical Exercise Physiologist*
* *Concept, Architecture and Development Phase (2026)*

**Copyright 2026 Muhammad Alif. All Rights Reserved.** This repository is provided for portfolio and demonstration purposes only. You may not copy, reproduce, distribute, publish, display, perform, modify, create derivative works, transmit, or in any way exploit any such content, nor may you distribute any part of this content over any network, sell or offer it for sale, or use such content to construct any kind of database.
