# AURA Intelligence Engine: Feature Guide (v2.2)

![Component](https://img.shields.io/badge/Component-AI%20Engine-purple) ![Status](https://img.shields.io/badge/Status-Beta-emerald) ![Architecture](https://img.shields.io/badge/Architecture-Dual--Mode%20Router-blue)

## 🧠 What is AURA?
**AURA** (Adaptive Understanding and Real-time Analytics) is the proprietary, multi-agent AI engine integrated into the NEXUS platform. Designed specifically for the Sport & Exercise Medicine Centre, AURA bridges the gap between raw operational data and staff wellbeing.

It does not just read data; it actively interprets **cognitive load**, manages **administrative friction**, and mitigates **burnout risk** using an advanced Intent Routing architecture.

---

## ⚡ Core Capabilities

### 1. Dual-Mode Intent Routing (New in v2.2)
AURA is self-aware and dynamically shape-shifts its UI and persona based on the user's immediate needs:
* **Mode 1: Wellbeing Coach:** Triggered by stress or emotional keywords. AURA utilizes Motivational Interviewing (OARS) and the Mental Health Continuum (Healthy, Reacting, Injured, Ill) to provide empathetic, peer-level psychological first aid and workflow adjustments.
* **Mode 2: Administrator's Assistant:** Triggered by operational requests. AURA instantly shifts to a lean, precise administrative engine. It generates structured deliverables including *Coordination Memos, SOPs, Scheduling Packs, Event Run-sheets, and Incident Reports* with strict adherence to PDPA constraints.

### 2. Proactive Pulse & Automated Nudges
AURA doesn't wait for staff to burn out; it actively reaches out.
* **Automated Push Notifications:** Every weekday at 09:00 AM, AURA fires native iOS/macOS push notifications and icon badges directly to staff devices, prompting a 30-second check-in.
* **Smart Triage:** Based on 0-10 sliders for **Energy** and **Focus**, AURA automatically routes staff into specific recovery protocols or recommends immediate operational adjustments.

### 3. Deep Performance Audits
AURA ingests raw workload data (Clinical hours, Research, Education, and Management projects) and cross-references it against staff Job Grades (JG11 - JG16). 
* **Private Executive Brief:** An unfiltered, highly analytical report for Admins that calls out specific workload imbalances and burnout risks.
* **Public Team Pulse:** A morale-boosting summary designed for the wider team to celebrate wins and highlight completed projects.

### 4. Contextual Identity (Sandbox vs. Live)
AURA is fully aware of its environment. 
* **Live Mode:** Operates with enterprise-grade security for the actual KKH CEP Team, featuring persistent memory of past check-ins.
* **Demo Mode:** Seamlessly shifts its identity to analyze a simulated "Marvel Superhero CEP Team," allowing for safe stakeholder demonstrations without exposing real hospital data.

---

## ⚠️ Interaction Guidelines for Beta Testers

When interacting with the AURA global chat widget, adhere to the following strict constraints:

1. **Test the Router:** Try switching contexts in real-time. Say *"I am exhausted from this shift"* (Coach Mode), and then immediately follow up with *"Draft a 1-page SOP for rooming workflow"* (Assistant Mode).
2. **Strictly NO PHI (PDPA Compliance):** AURA does *not* have access to the EMR, email, or hospital intranet. **Do not type patient names or NRICs.** If drafting clinical comms, use placeholders exclusively (e.g., `[Patient]`, `[Clinician]`, `[Date]`).
3. **Pasted Context Only:** If you want AURA to analyze a schedule or draft an incident response, you must paste the de-identified text directly into the chat. AURA cannot "fetch" external files.
4. **Challenge It:** Ask it to justify its Deep Audit findings (e.g., *"Why did you flag Peter as a high burnout risk?"*).

---
© 2026 Muhammad Alif
