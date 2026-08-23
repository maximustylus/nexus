# Translation brief — NEXUS Community (`CD10`)

The portal serves four languages, so each item needs **three** translations:
**Bahasa Melayu (`ms`)**, **中文 (`zh`)**, **தமிழ் (`ta`)**.

## Status

| Group | What it is | State |
|---|---|---|
| **1** — the two new questions | 9 strings | ✅ **shipped**, machine-translated, **unreviewed** |
| **2** — in-chat action cards | 49 strings | ⬜ English only |
| **3** — the notices | 6 blocks | ⬜ English only |
| **4** — the printed handover slip | 24 strings | ⬜ English only |

## What changed about the position, and why

⚠️ **This file used to say "I have not machine-translated any of it, and I am not
going to." That is no longer true of Group 1, by the owner's decision, and the
reasoning is worth keeping rather than quietly overwriting.**

The original argument was that a paraphrase which reads fluently and shifts the
clinical meaning is worse than an English string, because nobody will notice it.
That argument still holds — and it is why Groups 2, 3 and 4 are still English only.
Group 2 in particular contains the URGENT tier: the text somebody reads immediately
after reporting chest pain.

Group 1 is different in kind, and the difference is not "it is less important":

- These are **questions**, not instructions. A question read slightly oddly is
  recoverable by the person answering it; *"call 995 if symptoms are severe"* read
  slightly oddly is not.
- The **status quo was already a failure**, not a safe default. `chatSteps.js` skips
  an untranslated question, so a Malay, Chinese or Tamil speaker was never asked
  about falls or Healthier SG at all — in the 60+ cohort the falls screen exists to
  protect, and among the less English-dominant residents an Active Ageing Centre
  referral targets. Every day it stayed English-only cost data that cannot be
  recovered later.
- The risk is **carried by a test, not by confidence**. See the Group 1 section: the
  danger turned out not to be the prose at all.

**What is still owed, and it is a real debt rather than a formality:** a native
speaker of each language should read the back-translations in Group 1 and confirm
that `falls.chip1` cannot be read as *"I fell"* and that `hsg.chip3` cannot be read
as *"no"*. Those two are the ones where a misreading changes a clinical value
rather than a sentence.

## How to return the rest

Anything readable — a table, a spreadsheet, three columns in a message. Keep the
**IDs**; they are how each string finds its slot. Wiring each one in is a one-line
change and I will do it.

**Order of value, if you only get some of it done:** Group 2, then Group 4, then
Group 3.

---

## Group 1 — the two new questions · 9 strings · ✅ **SHIPPED, UNREVIEWED**

`src/data/screeningChips.js` (chips) and `src/components/AuraChat.jsx` (prompts).
All four languages now ask both questions. **Please review the back-translations
below** — they are machine translations and nobody who reads Tamil, Chinese or
Malay has checked them.

### ⚠️ What this group turned out to actually be

Translating these chips is **not** a text change, and the brief was wrong to imply
it was. `parseFallsAnswer` and `parseHealthierSg` match TOKEN LISTS in
`src/utils/clinicalFlags.js`, and those lists were English-only:

```
matchesNoFalls    = ['no falls', 'none', 'no']
matchesEnrolledNo = ['no', 'not enrolled']
```

`"Tiada jatuh"` matches nothing in the first, so the parser falls through to
`falls = 1, fallsRisk = true`. **Shipping the translations alone would have
recorded every Malay, Chinese and Tamil speaker who had never fallen as having
fallen** — scored for it, shown it on their result, and printed it on a handover
slip to a community centre as fact. Missing data would have become wrong data,
which is the exact trade the step-skip rule exists to refuse.

The matcher lists are extended, and `src/utils/clinicalFlags.i18n.test.js` (33
tests) asserts chip-for-chip parity: chip *n* in any language must parse to what
chip *n* in English parses to. Reverting the matchers to their English-only state
fails **12** of those tests, so it is load-bearing rather than decorative.

**Two phrasings are constrained by the parser, not by the language:**

- `falls.chip3` in Tamil reads *"இரண்டு முறை அல்லது அதிகமாக"* rather than the more
  natural *"இரண்டு அல்லது அதற்கு மேற்பட்ட"*. அல்லது ("or") begins with அல்ல, a
  Tamil negator; Tamil negation is postfix, so the parser read it as denying the
  "இரண்டு" beside it and the chip counted as **one** fall. Only the parity test saw
  this — the sentence is correct Tamil.
- `hsg.chip2` matches the enrolment verb in its negative form in each language
  (`tidak berdaftar`, `没有登记`, `செய்யவில்லை`) rather than the bare word for "no".
  Malay is why: *"Saya tidak pasti"* ("I am not sure") contains `tidak`, and
  `matchesEnrolledNo` is tested first — so a bare token would have turned *"the
  portal does not know"* into *"this person is not enrolled"*, silently, for every
  Malay speaker who was unsure. `CP26` separated those two values on purpose.

### The strings, with back-translations to check

**`falls.prompt`** — EN: *Two quick questions about steadiness. In the past 12
months, have you had a fall — including a slip or trip where you ended up on the
ground?*

| | Translation | Back-translation |
|---|---|---|
| `ms` | Dua soalan ringkas tentang keseimbangan. Dalam 12 bulan yang lalu, pernahkah anda jatuh — termasuk tergelincir atau tersandung sehingga anda terjatuh ke lantai? | Two brief questions about balance. In the past 12 months, have you ever fallen — including slipping or tripping so that you fell to the floor? |
| `zh` | 关于平衡的两个简短问题。在过去 12 个月里，您跌倒过吗？包括滑倒或绊倒而摔在地上的情况。 | Two brief questions about balance. In the past 12 months, have you fallen? Including cases of slipping or tripping and falling to the ground. |
| `ta` | சமநிலை குறித்த இரண்டு சிறிய கேள்விகள். கடந்த 12 மாதங்களில் நீங்கள் விழுந்ததுண்டா — வழுக்கியோ இடறியோ தரையில் விழுந்தது உட்பட? | Two small questions regarding balance. In the past 12 months have you fallen — including slipping or tripping and falling on the ground? |

**`falls.chip1`** — EN: *No falls* · ⚠️ must parse as zero falls in every language

| | Translation | Back-translation |
|---|---|---|
| `ms` | Tiada jatuh | No falls |
| `zh` | 没有跌倒 | Have not fallen |
| `ta` | விழுந்ததில்லை | Have not fallen |

**`falls.chip2`** — EN: *One fall*

| | Translation | Back-translation |
|---|---|---|
| `ms` | Jatuh satu kali | Fell one time |
| `zh` | 跌倒一次 | Fell once |
| `ta` | ஒரு முறை விழுந்தேன் | I fell one time |

**`falls.chip3`** — EN: *Two or more falls* · ⚠️ Tamil phrasing constrained, see above

| | Translation | Back-translation |
|---|---|---|
| `ms` | Jatuh dua kali atau lebih | Fell two times or more |
| `zh` | 跌倒两次或以上 | Fell twice or more |
| `ta` | இரண்டு முறை அல்லது அதிகமாக | Two times or more |

**`falls.chip4`** — EN: *A fall, and I now avoid some activities*

| | Translation | Back-translation |
|---|---|---|
| `ms` | Pernah jatuh, dan kini saya mengelak sesetengah aktiviti | Have fallen, and now I avoid some activities |
| `zh` | 曾经跌倒，现在会避免某些活动 | Have fallen before, now avoid certain activities |
| `ta` | விழுந்தேன், இப்போது சில செயல்களைத் தவிர்க்கிறேன் | I fell, now I avoid some activities |

**`hsg.prompt`** — EN: *Last one — are you enrolled with a Healthier SG GP? It
changes which programmes you can be referred to.*

| | Translation | Back-translation |
|---|---|---|
| `ms` | Yang terakhir — adakah anda berdaftar dengan doktor Healthier SG? Ia menentukan program mana yang boleh dirujuk kepada anda. | The last one — are you registered with a Healthier SG doctor? It determines which programmes you can be referred to. |
| `zh` | 最后一个问题 — 您是否已向 Healthier SG 家庭医生登记？这会影响您可以被转介到哪些计划。 | Last question — have you registered with a Healthier SG family doctor? This affects which programmes you can be referred to. |
| `ta` | கடைசியாக — நீங்கள் Healthier SG மருத்துவரிடம் பதிவு செய்துள்ளீர்களா? இது உங்களை எந்தத் திட்டங்களுக்குப் பரிந்துரைக்க முடியும் என்பதை மாற்றும். | Lastly — have you registered with a Healthier SG doctor? This will change which programmes you can be referred to. |

**`hsg.chip1`** — EN: *Yes, I am enrolled*

| | Translation | Back-translation |
|---|---|---|
| `ms` | Ya, saya berdaftar | Yes, I am registered |
| `zh` | 是的，我已登记 | Yes, I have registered |
| `ta` | ஆம், நான் பதிவு செய்துள்ளேன் | Yes, I have registered |

**`hsg.chip2`** — EN: *No, not enrolled* · ⚠️ must parse `false`, never `null`

| | Translation | Back-translation |
|---|---|---|
| `ms` | Tidak, saya tidak berdaftar | No, I am not registered |
| `zh` | 没有登记 | Not registered |
| `ta` | இல்லை, பதிவு செய்யவில்லை | No, have not registered |

**`hsg.chip3`** — EN: *I am not sure* · ⚠️ must parse `null`, **never** `false`

| | Translation | Back-translation |
|---|---|---|
| `ms` | Saya tidak pasti | I am not certain |
| `zh` | 我不确定 | I am not certain |
| `ta` | எனக்குத் தெரியவில்லை | I do not know |

**What a reviewer should check, in priority order:** that `falls.chip1` cannot be
read as *"I fell"*; that `hsg.chip3` cannot be read as *"no"*; that `falls.chip4`
conveys **avoiding activity out of fear** rather than merely doing less; and that
the two prompts read as questions a 70-year-old would answer rather than as forms.

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
