# Translation brief — NEXUS Community (`CD10`)

Everything below exists in **English only**. The portal serves four languages, so
each item needs **three** translations: **Bahasa Melayu (`ms`)**, **中文 (`zh`)**,
**தமிழ் (`ta`)**.

## Why this is a brief and not a pull request

I have not machine-translated any of it, and I am not going to. Three of the four
groups below are **clinical instructions to a member of the public** — when to see
a GP, when to call 995, what a risk band does and does not mean. A paraphrase that
reads fluently and shifts the clinical meaning is worse than an English string,
because nobody will notice it.

Group 1 is different in kind: it is a **question**. An untranslated question does
not produce a missing answer — the person answers it anyway and it feeds
`calculateRiskScore`. `src/utils/chatSteps.js` therefore **skips** any question the
active language cannot render, so nobody is currently asked something they cannot
read. The cost is that a Malay, Chinese or Tamil speaker gets a *shorter*
assessment than an English speaker.

## How to return it

Anything readable — a table, a spreadsheet, three columns in a message. Keep the
**IDs**; they are how each string finds its slot. Wiring each one in is a one-line
change and I will do it.

**Order of value, if you only get some of it done:** Group 1, then Group 2, then
Group 4, then Group 3.

---

## Group 1 — the two new questions · 9 strings · **highest value**

`src/components/AuraChat.jsx`. Until these land, Malay, Chinese and Tamil speakers
are never asked either question, so falls risk and Healthier SG enrolment are
simply unknown for them — including for the 60+ cohort the falls question exists
to protect.

| ID | English |
|---|---|
| `falls.prompt` | Two quick questions about steadiness. In the past 12 months, have you had a fall — including a slip or trip where you ended up on the ground? |
| `falls.chip1` | No falls |
| `falls.chip2` | One fall |
| `falls.chip3` | Two or more falls |
| `falls.chip4` | A fall, and I now avoid some activities |
| `hsg.prompt` | Last one — are you enrolled with a Healthier SG GP? It changes which programmes you can be referred to. |
| `hsg.chip1` | Yes, I am enrolled |
| `hsg.chip2` | No, not enrolled |
| `hsg.chip3` | I am not sure |

**Note on `falls.chip1`.** It must not be translatable as anything containing the
word for "fall" on its own — the parser tests the negative first precisely because
*"No falls"* contains *"fall"*, and the same trap exists in every language.

---

## Group 2 — the in-chat action cards · 36 strings · **clinically the most important**

`src/components/AuraChat.jsx`, the `CTA` object. Ten tiers, each with a
`primaryStep`, a `healthierSG` line and one to three `resources` lines. The
surrounding labels are already translated; only the bodies are English.

⚠️ **This is the group where a mistranslation does real harm.** It includes the
URGENT tier — the text a person sees immediately after reporting chest pain or
dizziness on exertion, which currently tells them in English to seek medical
clearance and to call 995 if symptoms are severe.

### `symptoms_present` — tier `URGENT`

| ID | English |
|---|---|
| `symptoms_present.primaryStep` | Please see your GP or visit a polyclinic before starting any new exercise. Chest pain or dizziness during activity requires medical clearance first. |
| `symptoms_present.healthierSG` | Your Healthier SG GP can assess your symptoms and update your Health Plan. Book via HealthHub → My Appointments. |
| `symptoms_present.resource1` | 📞 Polyclinic appointment booking: healthhub.sg/appointments |
| `symptoms_present.resource2` | 🏥 If symptoms are severe or sudden: call 995 |

### `chronic_metabolic` — tier `CLINICAL`

| ID | English |
|---|---|
| `chronic_metabolic.primaryStep` | Enrol in the "Manage Metabolic Health" programme at Woodlands Active Health Lab — 7 structured sessions, from SGD 48, with healthcare professional supervision. |
| `chronic_metabolic.healthierSG` | Book your next Healthier SG annual check-in (FREE) and share your PAVS result. Your GP can issue a direct referral to the Active Health Lab. |
| `chronic_metabolic.resource1` | 📱 Book Active Health Lab: activesg.gov.sg → Woodlands Sport Centre |
| `chronic_metabolic.resource2` | 💳 CHAS subsidies may apply: chas.sg to check eligibility |
| `chronic_metabolic.resource3` | 🩺 Healthier SG check-in: FREE via HealthHub app |

### `senior_low_activity` — tier `COMMUNITY`

| ID | English |
|---|---|
| `senior_low_activity.primaryStep` | Visit your nearest Active Ageing Centre (AAC) — walk in, no appointment needed. Activities are largely free for residents aged 60 and above. |
| `senior_low_activity.healthierSG` | Your Healthier SG Health Plan includes a formal AAC referral pathway. Ask your GP at your next FREE check-in to document this. |
| `senior_low_activity.resource1` | 🔍 Find nearest AAC: aic.sg/care-services/active-ageing-centres |
| `senior_low_activity.resource2` | 📞 AIC Hotline: 1800-650-6060 |
| `senior_low_activity.resource3` | 📺 Seniors workout library on HealthHub: free, chair and low-mobility options available |

### `mental_health_first` — tier `WELLBEING`

| ID | English |
|---|---|
| `mental_health_first.primaryStep` | Your wellbeing matters most. Connect with your polyclinic\'s counselling or mental health support service — this is your most important first step before any exercise programme. |
| `mental_health_first.healthierSG` | The Healthier SG mental health pathway includes polyclinic counselling and AAC social connector support. Raise this at your next Health Plan check-in. |
| `mental_health_first.resource1` | 🤝 AAC Social Connector service: visit or call your nearest AAC |
| `mental_health_first.resource2` | 📞 Samaritans of Singapore: 1767 (24 hours, 7 days) |
| `mental_health_first.resource3` | 💬 Mental health resources: mindline.sg |

### `financial_low_activity` — tier `FREE_FIRST`

| ID | English |
|---|---|
| `financial_low_activity.primaryStep` | Register for "Start2Move" — a completely FREE 6-session beginner exercise programme. Download the Healthy 365 app and search "Start2Move" under Explore → Events. |
| `financial_low_activity.healthierSG` | Your first Healthier SG Health Plan consultation is FULLY SUBSIDISED. If not yet enrolled, book at any PHPC clinic — free for all Singapore residents. |
| `financial_low_activity.resource1` | 🆓 Start2Move: free via Healthy 365 app (App Store / Google Play) |
| `financial_low_activity.resource2` | 🧘 Free PA interest groups: onepa.gov.sg → search "healthiersg" |
| `financial_low_activity.resource3` | 💳 CHAS Blue/Orange subsidies available: chas.sg to check eligibility |

### `social_low_activity` — tier `COMMUNITY`

| ID | English |
|---|---|
| `social_low_activity.primaryStep` | Join Start2Move in a cohort group format — you will exercise alongside the same group of peers across 6 sessions, building both fitness and new friendships. |
| `social_low_activity.healthierSG` | Enrol in a HealthierSG-tagged People\'s Association interest group (Tai Chi, Brisk Walking, Qigong — many are free) and mention participation to your GP. |
| `social_low_activity.resource1` | 🤝 PA interest groups: onepa.gov.sg → search "healthiersg" → filter by your area |
| `social_low_activity.resource2` | 🏠 If aged 60+: visit nearest AAC for befriending and active ageing programmes |
| `social_low_activity.resource3` | 📱 Healthy 365 Step Challenges: stay motivated with community leaderboards |

### `start2move` — tier `START`

| ID | English |
|---|---|
| `start2move.primaryStep` | Download the Healthy 365 app and search "Start2Move" under Explore → Events. Register for the free 6-session beginner programme — the most appropriate first step for your current activity level. |
| `start2move.healthierSG` | Tell your Healthier SG doctor about your Start2Move enrolment at your next check-in. It counts directly toward your exercise health goals on your Health Plan. |
| `start2move.resource1` | 📱 Healthy 365: free on App Store and Google Play |
| `start2move.resource2` | 🏋️ Active Health Lab, Woodlands: Balance & Muscular Fitness from SGD 6 per session |
| `start2move.resource3` | 📋 Print or screenshot your PAVS result and bring it to your next GP visit as your activity baseline |

### `active_health_lab` — tier `LEVEL_UP`

| ID | English |
|---|---|
| `active_health_lab.primaryStep` | You meet Singapore\'s minimum activity guidelines — now build on this. Book a "Strength 2.0 Foundation" or "Balance & Muscular Fitness" session at Woodlands Active Health Lab, from SGD 6. |
| `active_health_lab.healthierSG` | Active Health Lab programmes are formally recognised within the Healthier SG Health Plan community pathway. Mention your programme at your next annual check-in. |
| `active_health_lab.resource1` | 🏋️ Book at activesg.gov.sg → Active Health Lab → Woodlands Sport Centre |
| `active_health_lab.resource2` | 📊 Body Composition Assessment available: from SGD 7 (Tue/Thu/Sat/Fri) |
| `active_health_lab.resource3` | 📱 Track sessions with the ActiveSG+ app |

### `perform` — tier `ADVANCED`

| ID | English |
|---|---|
| `perform.primaryStep` | You are well above minimum guidelines — outstanding. Try the "Perform 2.0 AMRAP" or "ENGINE Workout" at Woodlands Active Health Lab, from SGD 6, for structured high-intensity programming. |
| `perform.healthierSG` | Share your high activity level with your Healthier SG GP. You may be eligible for performance programme referrals and advanced tracking within your Health Plan. |
| `perform.resource1` | ⚡ Free HIIT Workout Library (Adults 19–49, Workouts #1–12): HealthHub → Move It |
| `perform.resource2` | 🏆 Perform 2.0 sessions: multiple weekly slots available April 2026 |
| `perform.resource3` | 📊 Consider a Body Composition Assessment to establish a performance baseline |

### `senior_isolated` — tier `SOCIAL_CARE`

| ID | English |
|---|---|
| `senior_isolated.primaryStep` | We strongly recommend connecting with SingHealth CareLine, a 24/7 tele-befriending and social support service. It is completely free for eligible seniors and ensures you always have someone to talk to or call for health advice. |
| `senior_isolated.healthierSG` | Your Healthier SG doctor can work alongside CareLine and community partners to ensure your Health Plan includes dedicated social support. |
| `senior_isolated.resource1` | 📞 SingHealth CareLine: Call 6340 7054 (24/7 Support) |
| `senior_isolated.resource2` | 🏠 Active Ageing Centres: Drop by your nearest centre for daily activities |
| `senior_isolated.resource3` | 💬 Silver Generation Office: Request a home care visit |

---

## Group 3 — the notices · 4 blocks

Prose, not chips. Meaning matters more than length.

| ID | Where | English |
|---|---|---|
| `notice.beforeYouBegin` | `PathwaySelection.jsx` — shown **before** either pathway starts | *"This assessment records your answers — including age band, gender, ethnic group, housing type and the first two digits of your postal code — so that community health programmes can be planned for the areas that need them. It is de-identified at the point of capture: it does not collect or store your name, NRIC, contact details or financial information, and your postal sector is used only to map you to nearby services. Records are deleted automatically after 24 months. You will get your result either way."* |
| `notice.disclaimerTitle` | `ResultPage.jsx` | *"Important Medical Disclaimer"* |
| `notice.disclaimerBody` | `ResultPage.jsx` — directly under the Primary Action | *"This NEXUS AURA report is an initial community health navigation tool and does not constitute medical advice, diagnosis, or a treatment plan. The physical activity recommendations are generated for educational and community navigation purposes only. Always consult a qualified healthcare professional or your Healthier SG GP before making significant changes to your lifestyle, diet, or exercise routine. If you are experiencing chest pain, dizziness, or any acute symptoms, please seek immediate medical attention."* |
| `notice.governanceTitle` | `ResultPage.jsx` | *"Data Governance and Privacy"* |
| `notice.governanceBody` | `ResultPage.jsx` | *"All data collected through the NEXUS AURA system is de-identified at the point of capture. Postal sector data is used solely for geographic resource mapping and is not linked to any identifiable personal information. This assessment does not collect, store, or transmit NRIC, name, contact, or financial account information. Aggregated, anonymised data may be used to improve community health programming across Singapore."* |
| `notice.retention` | `ResultPage.jsx` | *"How long it is kept: assessment records are deleted automatically 24 months after they are created. Nothing is kept beyond that, and there is no account to close — the record cannot be traced back to you, which is also why it cannot be retrieved or amended on request."* |

---

## Group 4 — the printed handover slip · 1 page

`src/components/HandoverSlip.jsx`. Printed and handed to a person at an Active
Ageing Centre or Social Service Office — so the reader may be a **staff member**
rather than the resident, and the register can be more formal than the app's.

⚠️ **The load-bearing sentence is `slip.notice`.** It is the reason the slip is
safe to hand over at all: NEXUS holds no name and no retrievable record, so a page
carrying a reference number and a risk band will be read as a referral unless this
says otherwise. It must stay unambiguous in translation — not softened, not
shortened.

| ID | English |
|---|---|
| `slip.title` | Community health summary |
| `slip.sub` | NEXUS · self-completed screening |
| `slip.notice` | **This is not a referral.** The person completed this screening themselves, on a public website. Nobody clinical has reviewed it, no appointment has been made, and NEXUS holds no record that can be looked up — the assessment is anonymous and stores no name, NRIC or contact details. Please treat it as what the person is telling you about themselves. |
| `slip.label.where` | Where |
| `slip.label.activity` | Activity |
| `slip.label.band` | Screening band |
| `slip.label.reported` | Reported |
| `slip.notProvided` | Not provided |
| `slip.nothingFlagged` | Nothing flagged |
| `slip.bandCaveat` | an internal banding, not a diagnosis |
| `slip.servicesHeading` | Services this points to |
| `slip.footDisclaimer` | **Not medical advice.** This summary does not constitute a diagnosis or a treatment plan. Anyone reporting chest pain, dizziness or any acute symptom should be directed to a GP or polyclinic, and to emergency care if symptoms are severe or sudden. |
| `slip.footRetention` | Not a referral · no record is held that can be retrieved · the anonymous assessment behind this page is deleted after 24 months. |
| `ui.printButton` | Print summary |

Plus the nine reported-flag lines (`Chest pain or dizziness on exertion`,
`Ongoing health condition reported`, `Fall in the past 12 months`, `Fall in the
past 12 months, and now avoiding some activities`, `Unpaid caregiving strain`,
`Psychological distress`, `Limited social support`, `Cost or distance is a
barrier`, `Food insecurity reported`, `Not enrolled with a Healthier SG GP`).

---

## Totals

| Group | Strings | × 3 languages |
|---|---|---|
| 1 — new questions | 9 | 27 |
| 2 — action cards | 49 | 147 |
| 3 — notices | 6 blocks | 18 |
| 4 — handover slip | 24 | 72 |
| | **88** | **264** |

Group 2 is the bulk and the highest clinical stakes; Group 1 is the one where every
day it is missing costs data you cannot recover later.
