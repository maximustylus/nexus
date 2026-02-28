# AURA Technical Architecture (v2.3)

## The "Autonomous Agent & Roster Middleware" Update

v2.3 represents AURA's evolution from a reactive conversational bot (Intent Router) into a proactive, autonomous database agent. AURA now possesses the ability to actively listen to Firebase collections, intercept peer-to-peer network requests, and execute sanitized writes directly to the Firestore database.

---

## Architecture Evolutions (v2.2 → v2.3)

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
```

### 2. Payload Schema Expansion (Data Entry & Automation)
The LLM payload schema has been heavily expanded to allow the AI to extract operational parameters and prepare them for direct database injection.

```json
// v2.2 JSON Output:
{ 
  "reply": "...", 
  "mode": "ASSISTANT", 
  "action": "Drafted SOP..." 
}

// v2.3 JSON Output (New Database Triggers):
{ 
  "reply": "...", 
  "mode": "DATA_ENTRY", // 🛡️ NEW: Triggers the Database Write UI
  "db_workload": {      // 🛡️ NEW: Secure extraction payload
      "target_collection": "staff_loads",
      "target_doc": "alif",
      "target_field": "data",
      "target_value": 145,
      "target_month": 5
  }
}
```

### 3. Native File System Integration
AURA now bypasses mobile-browser text restrictions by utilizing the `docx` library to compile parsed Markdown into true Microsoft Word `.docx` Blob objects, triggering native iOS/Android file downloads directly from the chat UI.

---

## Resolved Technical Debt (Fixed in v2.3)

### 1. 🟢 RESOLVED: The "Phantom Click" UI Bug
**Old Issue:** On mobile browsers, tapping AURA's "Send" button occasionally triggered the invisible `FeedbackWidget` sitting beneath it, due to iOS Safari ignoring `pointer-events-none` on fixed elements during keyboard expansion.
**Resolution:** Implemented dynamic z-index sinking. When AURA opens, the widget is forcefully dropped to `-z-50`, physically removing it from the DOM's interactive top layer.

### 2. 🟢 RESOLVED: Sandbox Cloud Function Crash
**Old Issue:** Clicking "AURA DEEP AUDIT" in Demo Mode sent mock "Marvel" data to the live Google Cloud Function, causing the AI to hallucinate or return empty strings due to schema mismatch.
**Resolution:** Implemented a Hard Bypass in `SmartAnalysis.jsx`. If `isDemo === true`, the component intercepts the network call, simulates a 2.5s loading state, and injects a perfectly formatted, hardcoded Marvel Executive Brief.

---

## Updated Architecture Diagram (v2.3)

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

---

## Known Limitations & Security Parameters (v2.3)

### 1. Workload Commit Verification
AURA can extract and format database writes (e.g., logging 145 patients), but she **cannot** write to the database autonomously. The UI requires a human-in-the-loop (HITL) physical click on the `[Commit Workload]` button to execute the final `setDoc` function.

### 2. Shift Swap Domino Effect
When AURA rewrites the master calendar (`roster_2026`) upon an accepted swap, she does not currently run a secondary validation check to ensure the new staff member doesn't exceed consecutive working day limits. 
**Recommendation for future builds:** Integrate the core Engine's fatigue-constraint rules into the `handleSwapResponse` function.

---

## Quick Smoke Test (v2.3 Database Agent)

1. **The Roster Test:** Click a shift in the Roster. Send a swap request to yourself. 
   * **Expected:** AURA slides open automatically with an amber `ROSTER_ALERT` offering an Accept/Decline protocol. ✓
2. **The Data Entry Test:** Type: *"I saw 145 patients in June."*
   * **Expected:** AURA parses the numbers and displays a green `DATA_ENTRY` block with a Shield button to push to Firestore. ✓
3. **The Export Test:** Ask AURA to write a policy. 
   * **Expected:** Click the `[Export .DOC]` button and a true `.docx` file downloads to your local device. ✓
4. **The Sandbox Test:** Toggle Demo Mode. Open AURA Deep Audit and click Generate.
   * **Expected:** Bypasses the server, simulates loading, and returns the Marvel Universe brief flawlessly. ✓
