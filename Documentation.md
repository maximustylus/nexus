# NEXUS: SSMC Smart Dashboard
**Version:** 1.4-OFFICIAL  
**Core Function:** Clinical Capacity Management, Staff Wellbeing (Pulse), and AI-Augmented Operations.

---

## 🏗️ Architecture Overview

NEXUS is built on a dual-environment architecture, designed to switch seamlessly between a **Live Firebase Environment** and a **Local Sandbox (Demo Mode)**.

### Tech Stack
* **Frontend:** React (Vite build system)
* **Styling:** Tailwind CSS (with specific `animate-in` plugin utilities)
* **Icons:** `lucide-react`
* **Charts:** `recharts` (utilizing `<ResponsiveContainer>`)
* **Backend / Auth:** Firebase (Firestore, Authentication, Cloud Functions)
* **Document Generation:** `docx`

### The "Data Firewall"
To ensure safe demonstrations and testing, the application utilizes a Context Provider (`NexusContext.jsx`) to manage an `isDemo` state.
* **Demo Mode:** Injects `MOCK_TEAM_DATA` and `MOCK_STAFF_LOADS`. Prevents actual Firebase writes. Uses `DEMO_PERSONAS` for AURA.
* **Live Mode:** Subscribes to live Firestore collections (`cep_team`, `staff_loads`, `system_data`).

---

## 🧩 Core Components

### 1. Layout & Navigation (`App.jsx` & `ResponsiveLayout.jsx`)
The main entry point controls the global state for the active view (`currentView`). It renders the `<ResponsiveLayout>` which handles the responsive shell (bottom navigation on mobile, side navigation on desktop).
* **Views Managed:** Dashboard (Charts & AI Report), Archive (Read-only historical data), Roster, Pulse (Wellbeing Matrix), Guide.

### 2. AURA Intelligence Engine (`AuraPulseBot.jsx`)
AURA is a controlled component (managed by `App.jsx` via `isOpen` and `onClose` props) that communicates with a secure Firebase Cloud Function (`chatWithAura`).
* **Phase Configuration:** Uses a 5A Protocol with strict energy bounds (Healthy, Reacting, Injured, Ill).
* **Capabilities:** * Parses JSON from the LLM to extract operational commands.
  * Can execute database writes (e.g., updating `staff_loads`).
  * Can generate and trigger downloads of `.docx` files natively.
  * Listens to Firestore for pending `shift_swaps` and intercepts the user with an alert.

### 3. Contextual Greeting (`AuraGreeting.jsx`)
A floating widget that serves as the entry point to AURA. 
* **Smart Quotes:** Uses `getDailySmartQuote()` to read the current time, day of the week, and `dailyPatientLoad` to serve a contextually relevant psychological brief (e.g., "Heavy list today...").
* **macOS Genie Animation:** Uses complex Tailwind transforms (`origin-bottom-right scale-0 translate-y-12`) alongside an `isExiting` state to smoothly "suck" the greeting bubble into the AURA trigger button.

### 4. Ghost Feedback System (`FeedbackWidget.jsx`)
Instead of cluttering the UI with floating buttons, the Bug Reporter is built as an invisible "Ghost Component".
* **Event-Driven:** It sits invisibly on the DOM and listens for a native JavaScript `CustomEvent` (`window.addEventListener('open-bug-report')`).
* **Trigger:** When a user clicks "Report" inside the AURA Chat header, AURA fires the event and closes itself, allowing the Feedback modal to instantly appear.
* **Data Flow:** Writes directly to the `beta_feedback` Firestore collection.

---

## 📈 Charting Rules (Recharts)
When adding or modifying charts (Pie, Bar, Line) within NEXUS, **always** wrap the chart component in a `<ResponsiveContainer width="100%" height="100%">`. 
* *Note: Using a standard `<Container>` will cause a fatal Vite build error.*

---

## 🎨 Tailwind & CSS Safety
Vite compiles Tailwind classes statically. **Do not string-interpolate Tailwind class names.**
* ❌ **Bad:** `className="border-${color}-500"` (Will drop classes in production)
* ✅ **Good:** `className={isRed ? 'border-red-500' : 'border-blue-500'}`

---

## 🚀 Future Roadmap (Pending)
1. **Workload Traffic Light System:** Automated Red/Yellow/Green capacity indicators based on daily patient load vs. rostered staff.
2. **Interactive Onboarding:** A swipeable carousel inside `<AppGuide>` to train clinical staff on using AURA.
3. **Advanced AURA Actions:** Expanding the JSON-parser to handle more complex Firestore batch updates.