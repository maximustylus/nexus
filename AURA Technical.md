# AURA — v2.1 → v2.2 Migration Guide

## The "Dual-Mode & Backend" Update

v2.2 represents a complete paradigm shift in AURA's architecture. The AI has been physically extracted from the client-side browser and securely nested within Firebase Cloud Functions. It has also been upgraded from a single-track conversational bot to a multi-agent Intent Router.

---

## Breaking Changes (v2.1 → v2.2)

### 1. API Security: The Client-Side Purge
```javascript
// v2.1
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY); 
// ⚠️ DANGER: API Key was bundled into the React frontend and exposed to the browser.

// v2.2
const secureChatWithAura = httpsCallable(functions, 'chatWithAura');
// ✅ SECURE: The React frontend no longer holds the API key. It sends a secure payload to Firebase, which handles the Gemini connection server-side.
```

### 2. Payload Schema Evolution (Dual-Mode)
AURA now returns a heavily structured JSON payload to dictate UI rendering.
```javascript
// v2.1 JSON Output:
{ "reply": "...", "diagnosis_ready": true, "phase": "HEALTHY" }

// v2.2 JSON Output (New UI triggers):
{ 
  "reply": "...", 
  "mode": "ASSISTANT", // 🛡️ NEW: Triggers the Admin UI shape-shifter
  "action": "...",     // 🛡️ NEW: Populates the confirmation action button
  "diagnosis_ready": false, 
  "phase": null
}
```

---

## Resolved Technical Debt (Fixed in v2.2)

### 1. 🟢 RESOLVED: Client-Visible API Key
**Old Issue:** `VITE_GEMINI_API_KEY` was exposed to anyone opening Chrome DevTools.
**Resolution:** The Express proxy workaround is no longer required. Firebase Cloud Functions (`functions/index.js`) now securely stores the `GEMINI_API_KEY` environment variable. The browser never sees it.

### 2. 🟢 RESOLVED: The "Not Okay" Regex Bug
**Old Issue:** The hardcoded simulation brain used regex `\b(okay)\b` which incorrectly categorized "not okay" as "Healthy".
**Resolution:** The local simulation regex brain has been completely deprecated. All requests (Demo and Live) are now routed through the Gemini LLM, which possesses full semantic understanding of negation context.

---

## Updated Architecture Diagram

```text
┌─────────────────────────────────────────────────────┐
│  AuraPulseBot.jsx (React Presentation & State)      │
│                                                     │
│  State: messages[], pendingLog, selectedPersona     │
│  UI Logic: Dynamic Tailwind (Coach vs. Assistant)   │
│                                                     │
│  [User Input] ────► sanitize ────► httpsCallable()  │
│  [UI Render]  ◄──── JSON parse ◄── Firebase Return  │
└─────────────────────────┬───────────────────────────┘
                          │ (Secure HTTPS RPC)
                          ▼
┌─────────────────────────────────────────────────────┐
│  Firebase Cloud Functions (Backend Orchestration)   │
│                                                     │
│  1. Auth Verification (Is user allowed?)            │
│  2. Prompt Assembly (Dual-Mode System Prompt)       │
│  3. LLM Communication (Gemini 1.5/2.0 API)          │
│  4. Safety Fallbacks & JSON Validation              │
└─────────────────────────┬───────────────────────────┘
                          │ (Server-to-Server RPC)
                          ▼
┌─────────────────────────────────────────────────────┐
│  Google Gemini API (The Engine)                     │
│  - Mode 1: Empathy & OARS Protocol                  │
│  - Mode 2: PDPA-Compliant Admin Generation          │
└─────────────────────────────────────────────────────┘
```

---

## Known Limitations (v2.2)

### 1. Cloud Function "Cold Starts"
If AURA has not been used for several hours, Google Cloud spins down the server instance. The *first* message sent by a user may take 3-5 seconds to resolve while the container boots up. Subsequent messages will be nearly instant. 
**Workaround:** The frontend `loading` state accurately reflects this delay to prevent user frustration.

### 2. Gemini Chat History Growth
Long sessions pass increasingly large history arrays to the API.
**Current State:** The Cloud Function implements a hard truncation `history.slice(-MAX_HISTORY_LEN)` to prevent token overflow. Very old context in the immediate session will be forgotten.

### 3. Anonymous Log Growth
Firebase anonymous logs use `arrayUnion`, meaning the `_anonymous_logs` document will grow unboundedly.
**Recommendation for v2.3:** Add a scheduled Cloud Function to rotate or archive logs older than 90 days.

---

## Quick Smoke Test (v2.2 Dual-Mode)

1. Open the panel → Identity Matrix renders 6 personas ✓
2. Select **Peter** → greeting appears with sandbox prefix ✓
3. Type: *"I am exhausted from this shift."*
   * **Expected:** AURA bubble is Indigo (Coach Mode). OARS validation is used. Reacting/Injured card appears. ✓
4. Type: *"Draft a 1-page SOP for rooming workflow."*
   * **Expected:** AURA bubble turns Dark Grey (Assistant Mode). "Operations Assist" badge appears. A clear SOP is generated. ✓
5. Disconnect network → offline banner appears instantly ✓
6. Type 480 chars → character counter appears in amber ✓
7. Type 500 chars → counter turns red; input is hard-capped ✓
