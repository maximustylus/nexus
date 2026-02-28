# NEXUS: Unified Operations & Intelligence Dashboard

![Status](https://img.shields.io/badge/Status-v1.4%20Beta-emerald) ![Org](https://img.shields.io/badge/Unit-Sport%20%26%20Exercise%20Medicine-indigo) ![Tech](https://img.shields.io/badge/AI-Gemini%20Powered-purple) ![PWA](https://img.shields.io/badge/PWA-Native%20Push%20Enabled-blue) ![CI/CD](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-2ea44f)

**NEXUS** (formerly IDC App) is a clinician-led innovation platform designed to revolutionize workload management, optimize skill-mix routing, and actively protect staff wellbeing at the Sport & Exercise Medicine Centre.

> **Master the Grind • Protect the Pulse • Build the Future**
> *Note: This application is currently in active Beta and is being evaluated by the Senior Clinical team for internal efficiency, burnout prevention, and resource allocation.*

---

## 🚀 The Three Pillars of NEXUS

### Pillar A: AURA Intelligence (The AI Agent Layer)
AURA is an autonomous operational agent integrated into the system's core, capable of dynamic intent-routing and real-time mediation:
* **The Auto-Healer (Roster Mediation):** AURA intercepts peer-to-peer shift swap requests, automates staff notifications, and upon approval, autonomously rewrites the master calendar matrix.
* **The Wellbeing Coach:** Utilizes Motivational Interviewing (OARS) and the Mental Health Continuum to provide psychological first aid based on real-time "Social Battery" indexing.
* **The Clinical Assistant:** Instantly transitions to an analytical mode to execute secure database entries, document formatting, and enterprise-standard reports.

### Pillar B: Smart Workload & AI Audits (The Predictive Layer)
* **Deep AI Audits:** Powered by Google's Gemini models, NEXUS transforms raw data into high-level strategic insights. It generates **Private Executive Briefs** (flagging Job Grade imbalances and scope creep) and **Public Team Pulses** to align department morale.
* **Time Travel Archive:** Instantly access and analyze historical workload data to track team progression across fiscal years.

### Pillar C: Auto Rostering (The Structural Layer)
* **Zero-Conflict Architecture:** Eliminates manual scheduling friction by generating mathematically safe rosters based on predicted case volumes and specific skill-mix requirements.
* **Unified Interface:** A high-fidelity calendar view that allows staff to view coverage, sync with external calendars, and trigger integrated shift-swaps instantly.

---

## 🧪 Interactive Demo Sandbox
To facilitate safe stakeholder demonstrations and leadership training without exposing sensitive hospital data, NEXUS features a fully functional **Demo Sandbox**:
* **Simulated Environment:** Populated by a "Marvel Superhero" Healthcare Team to demonstrate complex team dynamics.
* **Risk-Free Training:** Allows future leaders to practice resolving rostering conflicts and generating AI audits without writing to the live database.
* **Feedback Loop:** Includes a native **In-App Feedback Widget** for real-time bug reporting and feature requests.

---

## ⚠️ Access & Security Policy

**RESTRICTED: INTERNAL SSMC@KKH STAFF ONLY (LIVE MODE)**

This tool is for the exclusive use of the KKH Sport & Exercise Medicine Centre team. Live Mode is locked behind enterprise-grade authentication.
1. **Strict Whitelisting:** Access is exclusively limited to pre-approved `@kkh.com.sg` email addresses.
2. **PDPA Compliance:** **Do NOT** upload sensitive patient data or PHI. NEXUS tracks *operational load*, not patient records.
3. **Data Sharding:** Live production data and Demo simulation data operate on strictly isolated Firebase collections.

---
---

# 🤖 AURA Technical Architecture (v3.0)

## The "Autonomous Agent & Roster Middleware" Update
AURA has evolved from a reactive conversational bot (Intent Router) into a proactive, autonomous database agent. AURA now possesses the ability to actively listen to Firebase collections, intercept peer-to-peer network requests, and execute sanitized writes directly to the Firestore database.

### 1. Proactive Event Listening (The Swap Engine)
AURA is no longer strictly bound to the user's `[Enter]` key. She now utilizes Firebase `onSnapshot` listeners to act as a background middleware agent.
```javascript
// AURA actively listens to the 'shift_swaps' collection
const q = query(
    collection(db, 'shift_swaps'), 
    where('targetStaff', '==', user.name),
    where('status', '==', 'PENDING')
);

// Upon detection, AURA forces her UI open and injects a high-priority 'ROSTER_ALERT' message.
