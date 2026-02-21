# AURA Intelligence Engine (v2.1)

![Component](https://img.shields.io/badge/Component-AI%20Engine-purple) ![Model](https://img.shields.io/badge/Powered%20By-Google%20Gemini-blue)

## 🧠 What is AURA?
**AURA** (Application to Understand Realtime energy and focus) is the proprietary AI Performance Coach integrated into the NEXUS platform. Designed specifically for the Sport & Exercise Medicine Centre, AURA bridges the gap between raw operational data and staff wellbeing.

She does not just read data; she interprets **cognitive load**, **scope creep**, and **burnout risk** based on clinical Job Grades (JG).

---

## ⚡ Core Capabilities

### 1. Deep Performance Audits (`SmartAnalysis.jsx`)
AURA ingests raw JSON workload data (Clinical hours, Research, Education, and Management projects) and cross-references it against staff Job Grades (JG11 - JG16). 
* **Private Executive Brief:** An unfiltered, highly analytical report for admins that calls out specific workload imbalances and burnout risks.
* **Public Team Pulse:** A morale-boosting summary designed for the wider team to celebrate wins and highlight completed projects.

### 2. Social Battery & Wellbeing (`WellbeingView.jsx`)
AURA drives the intelligence behind the "Pulse" tab. By collecting simple 0-10 sliders on **Energy** and **Focus**, AURA applies Motivational Interviewing principles to recommend immediate operational adjustments (e.g., "Switch to low-cognitive tasks" or "Prime for deep work").

### 3. Contextual Dual-Identity (`AuraPulseBot.jsx`)
AURA is fully aware of its environment. 
* **Live Mode:** It acts as the elite coach for the KKH CEP Team.
* **Demo Mode:** It seamlessly shifts its identity to analyze the simulated "Marvel Superhero CEP Team" to allow for safe, PHI-free demonstrations.

---

## 🛠️ Technical Architecture

* **Backend:** Firebase Cloud Functions (`us-central1`).
* **LLM Engine:** Google Gemini.
* **Data Handling:** AURA does not store long-term memory of chats. Each analysis generation or chat interaction is processed as an isolated, stateless request. AURA is strictly programmed to return structured JSON payloads to the NEXUS frontend during audits to prevent UI breaks.

---

## ⚠️ Interaction Guidelines for Beta Testers

When interacting with the AURA global chat widget:
1. **Focus on Operations:** Ask AURA about workload distribution, rostering conflicts, or team morale.
2. **Strictly NO PHI:** Do not type patient names, NRICs, or appointment specifics into the AURA chat.
3. **Challenge It:** Ask It to justify its Deep Audit findings. (e.g., *"Why did you flag Peter as a high burnout risk?"*)

---
© 2026 Muhammad Alif
