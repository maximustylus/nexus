# AURA Intelligence Engine: Feature Guide (v2.3)

![Component](https://img.shields.io/badge/Component-AI%20Engine-purple) ![Status](https://img.shields.io/badge/Status-v2.3%20Beta-emerald) ![Architecture](https://img.shields.io/badge/Architecture-Autonomous%20Agent-blue)

## 🧠 What is AURA?
**AURA** (Adaptive Understanding and Real-time Analytics) is the proprietary, autonomous AI agent integrated directly into the NEXUS platform. Designed specifically for the Sport & Exercise Medicine Centre, AURA bridges the gap between raw operational data and staff wellbeing.

It does not just read data; it actively interprets **cognitive load**, negotiates **scheduling conflicts**, executes **database mutations**, and mitigates **burnout risk** acting as a proactive middleware for the entire clinical team.

---

## ⚡ Core Capabilities (Upgraded in v2.3)

### 1. The Auto-Healer (Roster Mediation)
AURA serves as a real-time calendar mediator. It actively listens to the database for peer-to-peer shift swap requests. 
* **Proactive Alerts:** If a colleague requests coverage, AURA forcefully opens its UI and delivers a high-priority `ROSTER_ALERT` with the swap details and rationale.
* **Autonomous Execution:** If the user clicks "Accept Swap", AURA independently reaches into the master calendar matrix, rewrites the assigned staff names, and resolves the scheduling conflict instantly.

### 2. Multi-Modal Intent Routing
AURA is self-aware and dynamically shape-shifts its UI and persona based on the user's immediate operational or emotional needs:
* **The Wellbeing Coach:** Triggered by stress keywords. AURA utilizes Motivational Interviewing (OARS) and the Mental Health Continuum to provide empathetic, peer-level psychological first aid and workflow adjustments.
* **The Clinical Assistant:** Generates structured deliverables including Coordination Memos, SOPs, Scheduling Packs, Event Run-sheets, and Incident Reports.
* **The Database Agent:** Extracts operational parameters from natural language (e.g., *"I saw 145 patients in June"*) and generates a secure UI block to commit that workload directly to the Firestore database.

### 3. Native File System Integration
Bypassing mobile browser constraints, AURA can compile its generated text (like policies or SOPs) into true Microsoft Word `.docx` Blob objects. With a single click of the `[Export .DOC]` button, it triggers a native file download directly to iOS, Android, or macOS devices.

### 4. Deep Performance Audits
AURA ingests raw workload data (Clinical hours, Research, Education, and Management projects) and cross-references it against staff Job Grades (JG11 - JG16). 
* **Private Executive Brief:** An unfiltered, analytical report for Admins that identifies scope creep, operational bottlenecks, and imminent burnout risks.
* **Public Team Pulse:** A morale-boosting summary designed for the wider team to celebrate wins and align strategic focus.

### 5. Proactive Pulse & Automated Nudges
AURA doesn't wait for staff to burn out; it actively reaches out.
* **Automated Push Notifications:** Every weekday at 09:00 AM, AURA fires native iOS/macOS push notifications to staff devices, prompting a 30-second check-in.
* **Smart Triage:** Based on 0-10 sliders for **Energy** and **Focus**, AURA automatically routes staff into specific recovery protocols or recommends immediate operational adjustments.

---

## 🧪 Contextual Identity (Sandbox vs. Live)
AURA is fully aware of its environment. 
* **Live Mode:** Operates with enterprise-grade security for the actual KKH CEP Team, featuring persistent memory of past check-ins and live database read/write access.
* **Demo Sandbox:** Seamlessly shifts its identity to manage a simulated "Marvel Superhero CEP Team," allowing future leaders to practice resolving rostering conflicts and generating simulated AI audits without exposing real hospital data.

---

## ⚠️ Interaction Guidelines for Beta Testers

When interacting with the AURA global chat widget, adhere to the following strict constraints:

1. **Test the Auto-Healer:** Go to the Roster view, click a shift, and send a Swap Request to yourself (or a demo persona). Watch AURA instantly pop up to mediate the exchange.
2. **Test the Database Agent:** Type, *"Log 120 patients for March"* and use the resulting `[Commit Workload]` button to automatically update the database.
3. **Strictly NO PHI (PDPA Compliance):** AURA tracks *operational* data, not clinical charts. It does not have EMR access. **Do not type patient names or NRICs.** Use placeholders exclusively (e.g., `[Patient]`, `[Clinician]`).
4. **Test the Export Engine:** Ask AURA to *"Draft a 1-page SOP for rooming workflow,"* and click the `[Export .DOC]` button to download the formatted file to your device.

---
© 2026 Muhammad Alif. All Rights Reserved.
