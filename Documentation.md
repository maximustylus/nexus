# NEXUS Smart Dashboard
**Version:** 1.4-OFFICIAL  
**Core Function:** Clinical Capacity Management, Staff Wellbeing (Pulse), and AI-Augmented Operations.

---

## 🏗️ Architecture Overview

NEXUS is built on a dual-environment architecture, designed to switch seamlessly between a **Live Firebase Environment** and a **Local Sandbox (Demo Mode)**.

### Tech Stack
* **Frontend:** React (Vite build system)
* **Styling:** Tailwind CSS (with specific `animate-in` plugin utilities and dynamic `dvh` math for mobile responsiveness)
* **Icons:** `lucide-react`
* **Charts:** `recharts` (utilizing `<ResponsiveContainer>`)
* **Backend / Auth:** Firebase (Firestore, Authentication, Cloud Functions)
* **Document Generation:** `docx`

### The "Data Firewall" & Security
To ensure safe demonstrations and strict PDPA/HR compliance, NEXUS utilizes multiple layers of security:
* **Demo Mode (Frontend Firewall):** Injects `MOCK_TEAM_DATA` and `MOCK_STAFF_LOADS` via `NexusContext.jsx`. Prevents actual Firebase writes and uses `DEMO_PERSONAS` for AURA.
* **Live Mode (Backend Firewall):** Firebase Security Rules strictly enforce that only verified `@kkh.com.sg` emails can read or write to the live Firestore database.
* **Dynamic Time-Routing:** The application automatically shifts its database subscription target (e.g., `cep_team` vs `archive_2025`) based on the user's selected Data Year.

---

## 🧩 Core Components

### 1. Layout & Navigation (`App.jsx` & `ResponsiveLayout.jsx`)
The main entry point controls the global state for the active view (`currentView`) and the active timeline (`dataYear`). It renders the `<ResponsiveLayout>` which handles the responsive shell (bottom navigation on mobile, side navigation on desktop).
* **Views Managed:** * **Dashboard:** A unified Live Command Center that seamlessly morphs into a Read-Only Historical Archive when a past year is selected from the dropdown.
  * **Feeds:** A placeholder and hype-builder for the upcoming v1.5 Digital Watercooler.
  * **Roster:** Calendar and shift management.
  * **Pulse:** The Wellbeing Matrix and Heatmap.
  * **Guide:** The application manual.

### 2. AURA Intelligence Engine (`AuraPulseBot.jsx`)
AURA is a controlled component (managed by `App.jsx` via `isOpen` and `onClose` props) that communicates with a secure Firebase Cloud Function (`chatWithAura`).
* **Phase Configuration:** Uses a 5A Protocol with strict energy bounds (Healthy, Reacting, Injured, Ill).
* **Fluid Responsive UI:** Utilizes dynamic viewport height constraints (`max-h-[calc(100dvh-100px)]`) and `shrink-0` classes to prevent layout collapse during mobile landscape viewing and virtual keyboard intrusion.
* **Capabilities:** * Parses JSON from the LLM to extract operational commands.
  * Executes database writes (e.g., updating `staff_loads`).
  * Generates and triggers downloads of `.docx` files natively.
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

## 🚀 Future Roadmap (Pending v1.5)

### 1. NEXUS Feeds
A secure, PDPA-compliant Digital Watercooler for sharing clinical insights, wins, and CoP updates. Features will include frontend image compression, granular edit tracking, and a 90-day auto-purge lifecycle rule.

### 2. Enterprise Scaling & Multi-Tenancy
Transitioning the app from a hardcoded single-team environment to a dynamic, database-driven configuration. This will allow multiple departments/hospitals to utilize NEXUS with completely isolated data sub-collections, custom domain swimlanes, and custom organization logos.
