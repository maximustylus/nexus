# AURA — v2.0 → v2.1 Migration Guide

## File Structure

```
src/
├── components/
│   └── AuraPulseBot.v2.1.jsx    ← Main component (~450 lines, orchestration only)
├── aura.hooks.js                 ← 7 reusable React hooks (extracted, testable)
├── aura.utils.js                 ← Pure utility functions + constants (no React)
├── aura.utils.test.js            ← 50+ unit tests for utils
└── aura.hooks.test.js            ← 30+ unit tests for hooks
```

---

## Breaking Changes (v2.0 → v2.1)

### 1. Import paths changed
```js
// v2.0
// Everything inline in one 400-line file

// v2.1
import AuraPulseBot from './components/AuraPulseBot.v2.1';
// Hooks and utils are internal — no consumer-facing API change
```

### 2. Message type now has an `isError` field
```js
// v2.0: { role: 'bot', text: '...' }
// v2.1: { role: 'bot', text: '...', isError?: boolean }
// Error messages render with a red bubble + AlertTriangle icon
// isError messages are filtered from Gemini history automatically
```

### 3. No more free anonymous toggle
```js
// v2.0: user could toggle isAnonymous mid-session via the header button
// v2.1: anonymous mode is tied exclusively to the 'anon' persona selection
// This closes a client-side security bypass
```

---

## Environment Variables

| Variable                  | Required | Notes |
|---------------------------|----------|-------|
| `VITE_GEMINI_API_KEY`     | Optional | If absent, Simulation engine is used. |

> ⚠️ **Production Warning**: `VITE_` prefix bundles this into your browser bundle.  
> Any user who opens DevTools can read it.  
> **Recommended**: Remove this key entirely and proxy requests:

```
Browser → POST /api/aura-chat → Your Server (holds key) → Gemini API
```

A minimal Express proxy looks like:
```js
// server/routes/aura.js
import { GoogleGenerativeAI } from '@google/generative-ai';
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); // server-side only

router.post('/api/aura-chat', authenticate, async (req, res) => {
    const { messages, systemInstruction } = req.body;
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash', systemInstruction });
    const chat  = model.startChat({ history: messages });
    const result = await chat.sendMessage(req.body.userText);
    res.json({ text: result.response.text() });
});
```

---

## Running Tests

```bash
# Install test dependencies (if not already present)
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom

# Add to vite.config.js / vitest.config.js:
# test: { environment: 'jsdom' }

# Run all AURA tests
npx vitest run aura.utils.test.js aura.hooks.test.js

# Run in watch mode during development
npx vitest aura.utils.test.js aura.hooks.test.js

# Run with coverage
npx vitest run --coverage aura.utils.test.js aura.hooks.test.js
```

Expected output:
```
✓ aura.utils.test.js (50 tests)
✓ aura.hooks.test.js (31 tests)

Test Files  2 passed
Tests      81 passed
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│  AuraPulseBot.v2.1.jsx   (Presentation + Orchestration)
│                                                     │
│  useOnlineStatus ──────────────► Online banner     │
│  useSafeTimeouts ──────────────► All setTimeout()  │
│  useAbortableRequest ──────────► Gemini cancel     │
│  useRotatingPool ──────────────► Anti-loop replies │
│  useInitGuard ─────────────────► Duplicate init    │
│  useScrollToBottom ────────────► Chat scroll       │
│                                                     │
│  sanitizeInput() ──────────────► Input field       │
│  buildSystemPrompt() ──────────► Gemini Core B     │
│  buildGeminiHistory() ─────────► Gemini Core B     │
│  extractJsonFromResponse() ────► Both brain cores  │
│  routeSimulationIntent() ──────► Sim Brain Core A  │
│  withRetry() ──────────────────► Firebase writes   │
│  exportConversation() ─────────► Download button   │
└─────────────────────────────────────────────────────┘
         │                           │
    aura.hooks.js               aura.utils.js
    (React hooks)               (Pure functions)
         │                           │
    aura.hooks.test.js          aura.utils.test.js
    (31 tests)                  (50 tests)
```

---

## Bug Log: The Async Double-Release (PATCH-01)

This is the trickiest bug fixed in v2.1. Here's the exact failure mode:

```
Timeline (v2.0 buggy):

T+0ms    user sends message
         → isSendingRef = true
         → runLiveBrain() starts

T+200ms  Gemini API throws (network error)
         → didFailoverToSim = false (not set yet)
         → runSimulationBrain() called (1.2–2.5s delay)
         → didFailoverToSim = true   ← set after call

T+200ms  finally block runs:
         → didFailoverToSim = true ✓ (correct, skip release)

         BUT: if the throw happens BEFORE runSimulationBrain is called
         (e.g., an error in the catch block itself), didFailoverToSim
         remains false → finally releases immediately → user can type again
         → sim brain resolves later → two AI messages for one user input.

Fix (v2.1):
  - `didFailoverToSim` is set BEFORE calling runSimulationBrain
  - If simBrain itself throws, didFailoverToSim is set back to false
    and the error bubble is shown — finally then correctly releases.
  - The simulation timeout callback always owns its own release via
    setIsSending(false) + setLoading(false) at the end of the delay.
```

---

## Known Limitations (Documented, Not Fixed)

### 1. "not okay" triggers HEALTHY phase
The stability regex `\b(okay)\b` matches the word "okay" in "not okay".
Fixing this requires negation-context parsing (NLP-level, not regex).
For now this is documented behavior — the Gemini brain handles it correctly.
Only the Simulation fallback brain is affected.

### 2. VITE_ API key is client-visible
Documented above. Requires a backend proxy to fully resolve.

### 3. Firebase anonymous logs use `arrayUnion`
This means the `_anonymous_logs` document will grow unboundedly.
**Recommendation**: add a Cloud Function to rotate logs older than 90 days.

### 4. Gemini chat history grows with session length
Long sessions pass increasingly large history arrays to the API.
**Recommendation**: implement a sliding window (last N messages) or
summarization step once history exceeds ~20 turns.

---

## Quick Smoke Test (Manual)

1. Open the panel → Identity Matrix renders 6 personas ✓
2. Select Peter → greeting appears with sandbox prefix ✓
3. Type "I'm exhausted" → bot responds with Reacting card ✓
4. Click "Dismiss" → card disappears without page error ✓
5. Click "SYNC TO HEATMAP" → confirmation bubble appears ✓
6. Disconnect network → offline banner appears; sim engine used ✓
7. Click Download icon → .txt file downloads with session ✓
8. Press Enter rapidly (hold key) → only one message sent ✓
9. Type 480 chars → character counter appears in amber ✓
10. Type 500 chars → counter turns red; input is hard-capped ✓
