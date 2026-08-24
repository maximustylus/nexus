import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { recordTelemetry } from '../utils/telemetry';
import { calculateRiskScore } from '../utils/scoring';
import { ChevronLeft, Send, Sun, Moon, ExternalLink, CheckCircle, BrainCircuit } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { readTheme, writeTheme } from '../utils/theme';

import { nextActiveStep, activeStepCount, activeStepPosition } from '../utils/chatSteps';
// The word-level matchers moved with the parser into `clinicalParse.js` (`AC5`);
// what stays is the one gate this component evaluates itself.
import { isSixtyPlus } from '../utils/clinicalFlags';
import { readLanguage, applyDocumentLanguage } from '../utils/language';
import { getSessionId, saveProgress, loadProgress, clearProgress } from '../utils/assessmentSession';
// `AC5` — the parser lives in its own tested module now; see its header.
import { parseClinicalData } from '../utils/clinicalParse';
import { FALLS_CHIPS, HSG_CHIPS } from '../data/screeningChips';

// ── Cloud Function — same pattern as AuraPulseBot.jsx ────────────────────────
// Gemini API key is secured in Firebase Cloud Functions (never client-side)
const functions = getFunctions(undefined, 'us-central1');
// The community pathway's OWN endpoint. It was `chatWithAura`, which is the staff
// assistant's callable — see the note at the call site.
const communityAck = httpsCallable(functions, 'communityAck');

// ── Well Well persona system prompt for community health triage ───────────────
// Used as the `prompt` param passed to the Cloud Function, same as personas
// in AuraPulseBot. Well Well uses Motivational Interviewing (OARS) and is
// calibrated for Singapore community members, not clinical staff.
// ⚠️ `WELL_WELL_PROMPT` USED TO LIVE HERE, AND THAT WAS THE PROBLEM.
//
// The community persona was a client constant, shipped to every browser and sent
// back to the server on every turn as `prompt`. A system prompt the caller supplies
// is a system prompt the caller can replace — and the endpoint it was sent to,
// `chatWithAura`, accepted up to 8,000 characters of it without authentication.
//
// It now lives in `functions/index.js` beside `communityAck`, which takes no
// caller-supplied prompt at all. Nothing here needs it: this component sends the
// domain, the answer and the prior answers, and receives one sentence back.

// ─── DOMAIN CONFIGURATION ─────────────────────────────────────────────────────
// Each step declares its clinical domain for badge display and progress colouring.
const DOMAIN_CONFIG = [
  { key: 'pavs_days',    badge: '🏃 ACSM PAVS · Q1 of 2',       group: 'pavs'     }, // 0
  { key: 'pavs_mins',    badge: '⏱️ ACSM PAVS · Q2 of 2',       group: 'pavs'     }, // 1
  { key: 'strength',     badge: '💪 SPAG Strength Screen',        group: 'pavs'     }, // 2
  { key: 'medical',      badge: '🩺 Clinical Safety Screen',      group: 'clinical' }, // 3
  { key: 'barriers',     badge: '🔑 SDOH · Financial & Access',  group: 'sdoh'     }, // 4
  { key: 'social',       badge: '🤝 SDOH · Social Support',      group: 'sdoh'     }, // 5
  { key: 'food_insecurity', badge: '🥗 SDOH · Food Security',      group: 'sdoh'     }, // 6
  { key: 'wellbeing',    badge: '🧠 SDOH · Psychological',       group: 'sdoh'     }, // 7
  { key: 'demographics', badge: '👤 Your Profile',               group: 'admin'    }, // 8
  { key: 'ethnicity',    badge: '🌍 Cultural Background',        group: 'admin'    }, // 9 
  { key: 'housing_type', badge: '🏢 Housing Environment',        group: 'admin'    }, // 10 
  { key: 'postal_code',  badge: '📍 Resource Mapping',           group: 'admin'    }, // 11
  { key: 'previous_id',  badge: '🔗 NEXUS Record Linkage',       group: 'admin'    }, // 12

  /*
    ⚠️ APPENDED, NOT INSERTED. `prompts`, `quickReplies` and `reflections` are
    parallel arrays in four language dictionaries. Inserting a step in the middle
    means renumbering twelve arrays by hand, which is exactly how a question goes
    missing in one language and nobody notices for months. New steps go on the end
    and `when` decides whether they are asked.

    Both are gated by `src/utils/chatSteps.js`: a step with no prompt in the active
    language is SKIPPED, so these appear in English only until the other three are
    translated (`CD10`). A question somebody cannot read produces a WRONG answer,
    not a missing one — it still feeds the risk score.
  */
  {
    key: 'falls', badge: '\u{1F9B5} Falls & Function (60+)', group: 'clinical', // 13
    /**
     * 60+ only. A Regional Health System reviewer's point: for somebody being
     * considered for an Active Ageing Centre, falls history matters more than a
     * weekly minutes figure — PAVS alone can route a 75-year-old to "150 minutes a
     * week" without ever asking whether they have fallen. Asking everybody would be
     * noise, and every unnecessary question costs completions in the population
     * least likely to finish.
     */
    // ⚠️ `isSixtyPlus`, NOT a substring test for "60+". The gate used to be
    //    `/60\s*\+/` over the raw answer, which only ever matched the CHIP text —
    //    somebody who typed "72" or "I am 65 years old" was silently never asked.
    //    See `parseAgeBand` in `clinicalFlags.js`; `CP26`.
    when: (data) => isSixtyPlus(data?.demographics),
  },
  {
    key: 'healthier_sg', badge: '\u{1FA7A} Healthier SG', group: 'admin', // 14
    // Asked of everyone. The portal references Healthier SG throughout and cannot
    // currently tell whether the person is enrolled — which changes almost every
    // recommendation it makes.
  },
];

// `AC14`: `TOTAL_STEPS` lived here with a comment saying "// 13" while the
// array held 15 — `CP26` appended `falls` and `healthier_sg` and the comment
// kept its old count. Its only two uses were `step: TOTAL_STEPS - 1` on the
// completion and error messages, which badged the final plan with whatever
// domain happens to be last (`healthier_sg`) — so those messages carry no
// `step` now, and the constant had no remaining reader. Deleted rather than
// corrected: a count nothing consumes is a comment waiting to go stale again.

// Progress segment colour by group
const GROUP_COLOURS = {
  pavs:     'bg-emerald-500',
  clinical: 'bg-amber-500',
  sdoh:     'bg-violet-500',
  admin:    'bg-slate-400',
};

// ─── TIERED CTA LIBRARY ───────────────────────────────────────────────────────
// Source: Northern Singapore Health Ecosystem Report, Section 5.7
const CTA = {
  symptoms_present: {
    tier: 'URGENT',
    emoji: '⚠️',
    primaryStep:
      'Please see your GP or visit a polyclinic before starting any new exercise. Chest pain or dizziness during activity requires medical clearance first.',
    healthierSG:
      'Your Healthier SG GP can assess your symptoms and update your Health Plan. Book via HealthHub → My Appointments.',
    resources: [
      '📞 Polyclinic appointment booking: healthhub.sg/appointments',
      '🏥 If symptoms are severe or sudden: call 995',
    ],
  },
  chronic_metabolic: {
    tier: 'CLINICAL',
    emoji: '🩺',
    primaryStep:
      'Enrol in the "Manage Metabolic Health" programme at Woodlands Active Health Lab — 7 structured sessions, from SGD 48, with healthcare professional supervision.',
    healthierSG:
      'Book your next Healthier SG annual check-in (FREE) and share your PAVS result. Your GP can issue a direct referral to the Active Health Lab.',
    resources: [
      '📱 Book Active Health Lab: activesg.gov.sg → Woodlands Sport Centre',
      '💳 CHAS subsidies may apply: chas.sg to check eligibility',
      '🩺 Healthier SG check-in: FREE via HealthHub app',
    ],
  },
  senior_low_activity: {
    tier: 'COMMUNITY',
    emoji: '🏠',
    primaryStep:
      'Visit your nearest Active Ageing Centre (AAC) — walk in, no appointment needed. Activities are largely free for residents aged 60 and above.',
    healthierSG:
      'Your Healthier SG Health Plan includes a formal AAC referral pathway. Ask your GP at your next FREE check-in to document this.',
    resources: [
      '🔍 Find nearest AAC: aic.sg/care-services/active-ageing-centres',
      '📞 AIC Hotline: 1800-650-6060',
      '📺 Seniors workout library on HealthHub: free, chair and low-mobility options available',
    ],
  },
  mental_health_first: {
    tier: 'WELLBEING',
    emoji: '🌿',
    primaryStep:
      'Your wellbeing matters most. Connect with your polyclinic\'s counselling or mental health support service — this is your most important first step before any exercise programme.',
    healthierSG:
      'The Healthier SG mental health pathway includes polyclinic counselling and AAC social connector support. Raise this at your next Health Plan check-in.',
    resources: [
      '🤝 AAC Social Connector service: visit or call your nearest AAC',
      '📞 Samaritans of Singapore: 1767 (24 hours, 7 days)',
      '💬 Mental health resources: mindline.sg',
    ],
  },
  financial_low_activity: {
    tier: 'FREE_FIRST',
    emoji: '🆓',
    primaryStep:
      'Register for "Start2Move" — a completely FREE 6-session beginner exercise programme. Download the Healthy 365 app and search "Start2Move" under Explore → Events.',
    healthierSG:
      'Your first Healthier SG Health Plan consultation is FULLY SUBSIDISED. If not yet enrolled, book at any PHPC clinic — free for all Singapore residents.',
    resources: [
      '🆓 Start2Move: free via Healthy 365 app (App Store / Google Play)',
      '🧘 Free PA interest groups: onepa.gov.sg → search "healthiersg"',
      '💳 CHAS Blue/Orange subsidies available: chas.sg to check eligibility',
    ],
  },
  social_low_activity: {
    tier: 'COMMUNITY',
    emoji: '👥',
    primaryStep:
      'Join Start2Move in a cohort group format — you will exercise alongside the same group of peers across 6 sessions, building both fitness and new friendships.',
    healthierSG:
      'Enrol in a HealthierSG-tagged People\'s Association interest group (Tai Chi, Brisk Walking, Qigong — many are free) and mention participation to your GP.',
    resources: [
      '🤝 PA interest groups: onepa.gov.sg → search "healthiersg" → filter by your area',
      '🏠 If aged 60+: visit nearest AAC for befriending and active ageing programmes',
      '📱 Healthy 365 Step Challenges: stay motivated with community leaderboards',
    ],
  },
  start2move: {
    tier: 'START',
    emoji: '🚀',
    primaryStep:
      'Download the Healthy 365 app and search "Start2Move" under Explore → Events. Register for the free 6-session beginner programme — the most appropriate first step for your current activity level.',
    healthierSG:
      'Tell your Healthier SG doctor about your Start2Move enrolment at your next check-in. It counts directly toward your exercise health goals on your Health Plan.',
    resources: [
      '📱 Healthy 365: free on App Store and Google Play',
      '🏋️ Active Health Lab, Woodlands: Balance & Muscular Fitness from SGD 6 per session',
      '📋 Print or screenshot your PAVS result and bring it to your next GP visit as your activity baseline',
    ],
  },
  active_health_lab: {
    tier: 'LEVEL_UP',
    emoji: '💪',
    primaryStep:
      'You meet Singapore\'s minimum activity guidelines — now build on this. Book a "Strength 2.0 Foundation" or "Balance & Muscular Fitness" session at Woodlands Active Health Lab, from SGD 6.',
    healthierSG:
      'Active Health Lab programmes are formally recognised within the Healthier SG Health Plan community pathway. Mention your programme at your next annual check-in.',
    resources: [
      '🏋️ Book at activesg.gov.sg → Active Health Lab → Woodlands Sport Centre',
      '📊 Body Composition Assessment available: from SGD 7 (Tue/Thu/Sat/Fri)',
      '📱 Track sessions with the ActiveSG+ app',
    ],
  },
  perform: {
    tier: 'ADVANCED',
    emoji: '⚡',
    primaryStep:
      'You are well above minimum guidelines — outstanding. Try the "Perform 2.0 AMRAP" or "ENGINE Workout" at Woodlands Active Health Lab, from SGD 6, for structured high-intensity programming.',
    healthierSG:
      'Share your high activity level with your Healthier SG GP. You may be eligible for performance programme referrals and advanced tracking within your Health Plan.',
    resources: [
      '⚡ Free HIIT Workout Library (Adults 19–49, Workouts #1–12): HealthHub → Move It',
      '🏆 Perform 2.0 sessions: multiple weekly slots available April 2026',
      '📊 Consider a Body Composition Assessment to establish a performance baseline',
    ],
  },
  senior_isolated: {
    tier: 'SOCIAL_CARE',
    emoji: '📞',
    primaryStep:
      'We strongly recommend connecting with SingHealth CareLine, a 24/7 tele-befriending and social support service. It is completely free for eligible seniors and ensures you always have someone to talk to or call for health advice.',
    healthierSG:
      'Your Healthier SG doctor can work alongside CareLine and community partners to ensure your Health Plan includes dedicated social support.',
    resources: [
      '📞 SingHealth CareLine: Call 6340 7054 (24/7 Support)',
      '🏠 Active Ageing Centres: Drop by your nearest centre for daily activities',
      '💬 Silver Generation Office: Request a home care visit'
    ],
  },
};

const selectCTA = (parsed) => {
  const {
    pavsScore, symptomFlag, medFlag, age,
    sdohPsychological, sdohFinancial, sdohSocial,
  } = parsed;

  if (symptomFlag)                              return CTA.symptoms_present;
  if (age === '60+' && sdohSocial)              return CTA.senior_isolated;
  if (medFlag)                                  return CTA.chronic_metabolic;
  if (age === '60+' && pavsScore < 150)         return CTA.senior_low_activity;
  if (sdohPsychological)                        return CTA.mental_health_first;
  if (sdohFinancial && pavsScore < 150)         return CTA.financial_low_activity;
  if (sdohSocial && pavsScore < 150)            return CTA.social_low_activity;
  if (pavsScore < 150)                          return CTA.start2move;
  if (pavsScore <= 300)                         return CTA.active_health_lab;
  return CTA.perform;
};

// ─── DICTIONARY ───────────────────────────────────────────────────────────────
const DICTIONARY = {
  en: {
    back: 'Back',
    typing: 'AURA is typing\u2026',
    inputPlaceholder: 'Type your answer or choose below\u2026',
    hintText: 'Select an option or type freely:',
    sessionLabel: 'Session',
    domainLabel: 'Screening Domain',
    ctaTitle: 'Your Personalised Health Plan',
    ctaPrimary: 'Your Next Step',
    ctaHealthierSG: 'Your Healthier SG Connection',
    ctaResources: 'Additional Resources',
    error: 'A connection error occurred while saving your profile. Please try again.',
    progressLabel: (step, total) => `Step ${step + 1} of ${total}`,
    // 13 prompts — indices match DOMAIN_CONFIG
    prompts: [
      /* 0  pavs_days       */ 'Hi, I\'m AURA 👋 I\'m here to connect you with the right community health resources. Let\'s start with physical activity. On a typical week, how many days do you do moderate or vigorous exercise? (e.g. brisk walking, cycling, swimming, gym)',
      /* 1  pavs_mins       */ (data) => data.pavs_days === '0 days'
        ? 'No problem at all — most people start exactly where you are, and that is why these programmes exist. If you were to start being active, roughly how long do you think you could manage each session?'
        : 'Great — and on those active days, roughly how many minutes do you usually exercise each time?',
      /* 2  strength        */ 'Do you do any muscle-strengthening activities? (e.g. weights, resistance bands, bodyweight exercises like push-ups or squats)',
      /* 3  medical         */ 'Do you have any ongoing health conditions — such as high blood pressure, prediabetes, or heart disease? And do you ever feel chest pain or dizziness when you are physically active?',
      /* 4  barriers        */ 'What is the main thing that makes it difficult to access health or fitness services in your community? Be honest — there are no wrong answers.',
      /* 5  social          */ 'Roughly how many people — family or friends — could you call on for support if you needed help? And would you say you have people you can talk to openly?',
      /* 6  food_insecurity */ 'One more quick question — in the past 12 months, were there times when you were hungry but did not eat because you could not afford enough food?',
      /* 7  wellbeing       */ 'Over the past two weeks, how have you been feeling overall? Have you felt stressed, low in mood, or overwhelmed — for example, due to work, caregiving, or financial pressure?',
      /* 8  demographics    */ 'Almost done! Could you share your age group and gender? This helps me find programmes designed for your profile. (e.g. Female, 41–60)',
      /* 9  ethnicity       */ 'What is your ethnic group? This helps us understand the diverse communities we serve.',
      /* 10 housing_type    */ 'What type of housing do you live in? (e.g. HDB 3-Room, Condo)',
      /* 11 postal_code     */ 'What are the first two digits of your postal code? This lets me map the nearest resources to you.',
      /* 12 previous_id     */ 'Do you have a previous NEXUS Assessment ID? If yes, paste it below so I can link your records. If not, just select No.',
      /* 13 falls           */ 'Two quick questions about steadiness. In the past 12 months, have you had a fall — including a slip or trip where you ended up on the ground?',
      /* 14 healthier_sg    */ 'Last one — are you enrolled with a Healthier SG GP? It changes which programmes you can be referred to.',
    ],

    reflections: [
      /* 0 */ (input) => {
        const n = parseInt((input.match(/\d+/) || ['0'])[0], 10);
        return n === 0
          ? 'Starting from zero is completely valid — many people are in the same position, and that is exactly why these programmes exist.'
          : n <= 2
          ? 'Two days or fewer is a common starting point. Small, consistent steps make a real difference.'
          : 'A solid base to build on. ';
      },
      /* 1 */ (input) => {
        const n = parseInt((input.match(/\d+/) || ['0'])[0], 10);
        return n < 20
          ? 'Short sessions still count — and they can grow over time. '
          : n >= 45
          ? 'Strong session duration. '
          : 'A healthy session length. ';
      },
      /* 2 */ () => 'Strength training is just as important as aerobic activity for long-term health. ',
      /* 3 */ () => 'Thank you for sharing that — I will use this to make sure your recommendations are safe and appropriate. ',
      /* 4 */ () => 'That is a very real barrier. Naming it helps us find the right workaround. ',
      /* 5 */ () => 'Social connection is one of the most powerful protective factors for long-term health. ',
      /* 6 */ (input) => input.toLowerCase().includes('yes') ? 'Thank you for trusting me with that \u2014 food security is something we will factor directly into your plan. ' : 'Good to know. ',
      /* 7 */ () => 'Your mental wellbeing matters as much as your physical health. ',
      /* 8 */ () => 'Noted. ',
      /* 9 */ () => 'Thank you for sharing. ',
      /* 10 */() => 'Got it. This helps us suggest nearby community spaces. ',
      /* 11 */() => 'Mapping your nearest resources now. ',
      /* 12 */(input) =>
        /(no|none|don'?t)/i.test(input)
          ? 'No problem — I will start a fresh record for you today. '
          : 'I will link your previous records to track your progress over time. ',
    ],

    quickReplies: [
      /* 0 pavs_days       */ ['0 days', '1–2 days', '3–4 days', '5–7 days'],
      /* 1 pavs_mins       */ ['Less than 20 mins', '20–30 mins', '30–45 mins', '45–60 mins', '60+ mins'],
      /* 2 strength        */ ['No strength training', '1 day a week', '2 days a week', '3+ days a week'],
      /* 3 medical         */ ['No conditions or symptoms', 'High blood pressure', 'Prediabetes or diabetes', 'Heart condition', 'Dizziness or chest pain when active'],
      /* 4 barriers        */ ['Lack of time', 'Too expensive', 'Too far away', 'I prefer hospitals over community', 'Unsure what is available', 'No barriers for me'],
      /* 5 social          */ ['I have several people I can rely on', 'I have one or two close people', 'I mostly manage on my own', 'I feel quite isolated'],
      /* 6 food_insecurity */ ['Yes, this has happened', 'No, I have always had enough'],
      /*
        ⚠️ CAREGIVER STRAIN AND FINANCIAL STRAIN ARE TWO DIFFERENT REFERRALS, and
        they used to share one chip: "Overwhelmed — caregiving or financial
        pressure". A Regional Health System reviewer put it plainly — the unpaid
        family carer who has not yet identified as one is the highest-value entry
        point in social prescribing, and merging the two made that person
        invisible to the tool.

        Both halves are split from each language's OWN existing wording, on the
        connector already in the sentence ("or" / "atau" / "或" / "அல்லது"). No new
        clinical copy was translated — see `CD10`.
      */
      /* 7 wellbeing       */ ['Feeling good overall', 'Some stress but managing', 'Feeling quite stressed or low', 'Overwhelmed — caregiving', 'Overwhelmed — financial pressure'],
      /* 8 demographics    */ ['Male, 21–40', 'Female, 21–40', 'Male, 41–60', 'Female, 41–60', 'Male, 60+', 'Female, 60+'],
      /* 9 ethnicity       */ ['Chinese', 'Malay', 'Indian', 'Eurasian', 'Others', 'Prefer not to say'],
      /* 10 housing_type   */ ['HDB 1-2 Room', 'HDB 3 Room', 'HDB 4 Room', 'HDB 5 Room / Exec', 'Condo / Private', 'Landed'],
      /* 11 postal_code    */ 
      /*
        ⚠️ NO EXAMPLE DIGITS IN THESE CHIPS, AND THAT IS THE WHOLE POINT.
        This row used to read 'North (e.g. 73, 75)', 'East (e.g. 46, 52)' and so on.
        `parseClinicalData` took the first two digits it found in the answer — which
        for a TAPPED CHIP is the label — so every respondent who tapped North was
        recorded as sector 73, East as 46, West as 60. The geographic data collected
        'for population-level resource planning' was four constants, and it also chose
        which health cluster's services the person was shown.
        The question already asks for the digits. Only the 'type my own' chip remains,
        in each language's existing wording; anything unreadable is now `null`, not a
        place. See `src/utils/singapore/postalSectors.js`.
      */
      ['Other / Type my own'],
      /* 12 previous_id    */ ['No previous ID'],
      /* 13 falls           */ FALLS_CHIPS.en,
      /* 14 healthier_sg    */ HSG_CHIPS.en,
    ],
  },

  ms: {
    back: 'Kembali',
    typing: 'AURA sedang menaip\u2026',
    inputPlaceholder: 'Taip jawapan anda atau pilih di bawah\u2026',
    hintText: 'Pilih pilihan atau taip sendiri:',
    sessionLabel: 'Sesi',
    domainLabel: 'Domain Saringan',
    ctaTitle: 'Pelan Kesihatan Peribadi Anda',
    ctaPrimary: 'Langkah Seterusnya',
    ctaHealthierSG: 'Sambungan Healthier SG Anda',
    ctaResources: 'Sumber Tambahan',
    error: 'Ralat sambungan berlaku. Sila cuba lagi.',
    progressLabel: (step, total) => `Langkah ${step + 1} daripada ${total}`,
    prompts: [
      'Hai, saya AURA 👋 Pada minggu biasa, berapa hari anda melakukan senaman sederhana atau kuat? (cth. berjalan pantas, berbasikal, berenang)',
      'Berapa minit biasanya anda bersenam pada setiap sesi aktif tersebut?',
      'Adakah anda melakukan aktiviti menguatkan otot? (cth. angkat berat, band rintangan, senaman berat badan)',
      'Adakah anda mempunyai sebarang penyakit kronik seperti darah tinggi, pradiabetes, atau penyakit jantung? Adakah anda pernah rasa sakit dada atau pening ketika aktif?',
      'Apakah cabaran utama anda untuk menggunakan perkhidmatan kesihatan komuniti?',
      'Lebih kurang berapa ramai orang — keluarga atau rakan — yang boleh anda hubungi jika memerlukan bantuan? Adakah anda mempunyai seseorang untuk bercerita?',
      'Satu soalan lagi — dalam 12 bulan yang lalu, pernahkah anda lapar tetapi tidak makan kerana tidak mampu membeli makanan yang cukup?',
      'Dalam dua minggu lalu, bagaimana perasaan anda secara keseluruhan? Adakah anda berasa tertekan, murung, atau terbeban?',
      'Hampir siap! Boleh kongsi kumpulan umur dan jantina anda? (cth. Perempuan, 41–60)',
      'Apakah kumpulan etnik anda? Ini membantu kami memahami komuniti pelbagai yang kami layani.',
      'Apakah jenis perumahan yang anda diami? (cth. HDB 3-Bilik, Kondo)',
      'Apakah dua digit pertama poskod anda supaya saya boleh mencari sumber berdekatan?',
      'Soalan terakhir — adakah anda mempunyai ID Penilaian NEXUS yang sebelumnya? Jika ya, tampal di bawah. Jika tidak, pilih Tiada.',
      /* 13 falls          */ 'Dua soalan ringkas tentang keseimbangan. Dalam 12 bulan yang lalu, pernahkah anda jatuh — termasuk tergelincir atau tersandung sehingga anda terjatuh ke lantai?',
      /* 14 healthier_sg   */ 'Yang terakhir — adakah anda berdaftar dengan doktor Healthier SG? Ia menentukan program mana yang boleh dirujuk kepada anda.',
    ],
    reflections: [
      (input) => { const n = parseInt((input.match(/\d+/) || ['0'])[0], 10); return n === 0 ? 'Memulakan dari sifar adalah normal. ' : 'Permulaan yang baik. '; },
      () => 'Tempoh sesi anda direkodkan. ',
      () => 'Latihan kekuatan sama pentingnya dengan senaman aerobik. ',
      () => 'Terima kasih kerana berkongsi. Saya akan pastikan cadangan anda selamat. ',
      () => 'Itu satu cabaran yang nyata. ',
      () => 'Sokongan sosial adalah faktor perlindungan yang penting. ',
      (input) => /(ya|yes)/i.test(input) ? 'Terima kasih kerana berkongsi — ini akan diambil kira dalam pelan anda. ' : 'Baik, direkodkan. ',
      () => 'Kesejahteraan mental anda sama pentingnya dengan kesihatan fizikal. ',
      () => 'Direkodkan. ',
      () => 'Terima kasih kerana berkongsi. ',
      () => 'Baik, ini membantu kami mencari ruang komuniti berdekatan. ',
      () => 'Memetakan sumber berdekatan sekarang. ',
      (input) => /(tidak|tiada|no)/i.test(input) ? 'Baik, rekod baharu akan dimulakan. ' : 'Saya akan menghubungkan rekod lama anda. ',
    ],
    quickReplies: [
      ['0 hari', '1–2 hari', '3–4 hari', '5–7 hari'],
      ['Kurang 20 minit', '20–30 minit', '30–45 minit', '45–60 minit', '60+ minit'],
      ['Tiada latihan kekuatan', '1 hari seminggu', '2 hari seminggu', '3+ hari seminggu'],
      ['Tiada penyakit atau simptom', 'Darah tinggi', 'Pradiabetes atau diabetes', 'Penyakit jantung', 'Pening atau sakit dada semasa aktif'],
      ['Kekurangan masa', 'Terlalu mahal', 'Terlalu jauh', 'Lebih suka hospital', 'Tidak pasti apa yang ada', 'Tiada halangan'],
      ['Ada beberapa orang yang boleh saya hubungi', 'Ada satu atau dua orang rapat', 'Saya mostly uruskan sendiri', 'Saya rasa agak keseorangan'],
      ['Ya, ini pernah berlaku', 'Tidak, saya sentiasa ada makanan yang cukup'],
      ['Perasaan baik secara keseluruhannya', 'Ada sedikit tekanan tapi boleh kawal', 'Rasa sangat tertekan atau sedih', 'Terbeban — tanggungjawab penjagaan', 'Terbeban — tekanan kewangan'],
      ['Lelaki, 21–40', 'Perempuan, 21–40', 'Lelaki, 41–60', 'Perempuan, 41–60', 'Lelaki, 60+', 'Perempuan, 60+'],
      ['Cina', 'Melayu', 'India', 'Eurasian', 'Lain-lain', 'Tidak mahu beritahu'],
      ['HDB 1-2 Bilik', 'HDB 3 Bilik', 'HDB 4 Bilik', 'HDB 5 Bilik / Eksekutif', 'Kondo / Pangsapuri', 'Landed'],
      
      /*
        ⚠️ NO EXAMPLE DIGITS IN THESE CHIPS, AND THAT IS THE WHOLE POINT.
        This row used to read 'North (e.g. 73, 75)', 'East (e.g. 46, 52)' and so on.
        `parseClinicalData` took the first two digits it found in the answer — which
        for a TAPPED CHIP is the label — so every respondent who tapped North was
        recorded as sector 73, East as 46, West as 60. The geographic data collected
        'for population-level resource planning' was four constants, and it also chose
        which health cluster's services the person was shown.
        The question already asks for the digits. Only the 'type my own' chip remains,
        in each language's existing wording; anything unreadable is now `null`, not a
        place. See `src/utils/singapore/postalSectors.js`.
      */
      ['Lain-lain / Taip sendiri'],
      ['Tiada ID'],
      /*
        ⚠️ APPENDED AT INDEX 13 AND 14 TO MATCH `DOMAIN_CONFIG`, never inserted.
           `prompts`, `quickReplies` and `reflections` are parallel arrays across
           four dictionaries; `chatSteps.js` reads a step by ABSOLUTE index, and a
           renumber to close a gap is how a question goes missing in one language.

        ⚠️ THE CHIP TEXT IS PARSER INPUT, NOT ONLY READER TEXT. `parseFallsAnswer`
           and `parseHealthierSg` match tokens in `clinicalFlags.js`, and every
           token below is registered there. `clinicalFlags.i18n.test.js` asserts
           chip-for-chip parity with English — a chip changed here without its
           token fails that test rather than silently mis-flagging somebody.
      */
      /* 13 falls          */ FALLS_CHIPS.ms,
      /* 14 healthier_sg   */ HSG_CHIPS.ms,
    ],
  },

  zh: {
    back: '返回',
    typing: 'AURA 正在输入\u2026',
    inputPlaceholder: '请输入您的回答或选择以下选项\u2026',
    hintText: '请选择或自由输入：',
    sessionLabel: '会话',
    domainLabel: '筛查领域',
    ctaTitle: '您的个性化健康计划',
    ctaPrimary: '您的下一步行动',
    ctaHealthierSG: '您与 Healthier SG 的联系',
    ctaResources: '其他资源',
    error: '保存时发生连接错误，请重试。',
    progressLabel: (step, total) => `第 ${step + 1} 步，共 ${total} 步`,
    prompts: [
      '你好，我是 AURA 👋 在典型的一周里，您通常有几天进行中等或剧烈强度的运动？（例如快走、骑车、游泳）',
      '在这些运动的日子里，您每次通常运动多少分钟？',
      '您有进行任何肌肉力量训练吗？（例如举重、弹力带、俯卧撑或深蹲）',
      '您是否有任何慢性病，例如高血压、糖尿病前期或心脏病？运动时是否曾感到胸痛或头晕？',
      '什么是您使用社区健康服务的主要障碍？',
      '大概有多少家人或朋友可以在您需要时提供帮助？您是否有可以倾心交谈的人？',
      '还有一个问题——在过去12个月里，您是否因为买不起足够的食物而挨过饿？',
      '在过去两周里，您的整体感觉如何？是否感到压力大、情绪低落或不知所措？',
      '快完成了！能告诉我您的年龄段和性别吗？（例如：女，41–60）',
      '您的种族是什么？这有助于我们更好地了解我们服务的多元社区。',
      '您居住的房屋类型是什么？（例如：HDB 3房式，公寓等）',
      '您的邮政编码前两位数是什么？这样我可以为您找到附近的资源。',
      '最后一个问题 — 您是否有之前的 NEXUS 评估 ID？如有，请粘贴在下方；如没有，请选择"没有"。',
      /* 13 falls          */ '关于平衡的两个简短问题。在过去 12 个月里，您跌倒过吗？包括滑倒或绊倒而摔在地上的情况。',
      /* 14 healthier_sg   */ '最后一个问题 — 您是否已向 Healthier SG 家庭医生登记？这会影响您可以被转介到哪些计划。',
    ],
    reflections: [
      (input) => { const n = parseInt((input.match(/\d+/) || ['0'])[0], 10); return n === 0 ? '从零开始完全正常。' : '这是一个很好的起点。'; },
      () => '运动时长已记录。',
      () => '力量训练和有氧运动同样重要。',
      () => '感谢您的分享，我会确保建议对您安全适合。',
      () => '这是一个很现实的障碍。',
      () => '社会连接是保护长期健康的重要因素。',
      (input) => /是|yes/i.test(input) ? '谢谢您告诉我这些，我们会将这点纳入您的健康计划中。' : '好的，已记录。',
      () => '您的心理健康与身体健康同样重要。',
      () => '已记录，谢谢。',
      () => '谢谢您的分享。',
      () => '明白了，这有助于我们为您推荐附近的社区空间。',
      () => '正在为您定位附近的资源。',
      (input) => /(没|无|不|no)/i.test(input) ? '没问题，今天将为您建立新记录。' : '很好，我将链接您的历史记录。',
    ],
    quickReplies: [
      ['0 天', '1–2 天', '3–4 天', '5–7 天'],
      ['少于 20 分钟', '20–30 分钟', '30–45 分钟', '45–60 分钟', '60 分钟以上'],
      ['没有力量训练', '每周 1 天', '每周 2 天', '每周 3 天以上'],
      ['没有疾病或症状', '高血压', '糖尿病前期或糖尿病', '心脏病', '运动时头晕或胸痛'],
      ['没时间', '太贵了', '太远了', '更喜欢去医院', '不确定有哪些资源', '没有障碍'],
      ['有几个可以依靠的人', '有一两个亲近的人', '大多数情况自己处理', '感到相当孤立'],
      ['是的', '没有，我一直都有足够的食物'],
      ['整体感觉不错', '有些压力但能应对', '感到很压抑或情绪低落', '感到不知所措 — 照顾', '感到不知所措 — 经济压力'],
      ['男, 21–40', '女, 21–40', '男, 41–60', '女, 41–60', '男, 60+', '女, 60+'],
      ['华人', '马来人', '印度人', '欧亚裔', '其他', '不愿透露'],
      ['HDB 1-2 房式', 'HDB 3 房式', 'HDB 4 房式', 'HDB 5 房式 / 执行组屋', '私人公寓', '有地住宅'],
      
      /*
        ⚠️ NO EXAMPLE DIGITS IN THESE CHIPS, AND THAT IS THE WHOLE POINT.
        This row used to read 'North (e.g. 73, 75)', 'East (e.g. 46, 52)' and so on.
        `parseClinicalData` took the first two digits it found in the answer — which
        for a TAPPED CHIP is the label — so every respondent who tapped North was
        recorded as sector 73, East as 46, West as 60. The geographic data collected
        'for population-level resource planning' was four constants, and it also chose
        which health cluster's services the person was shown.
        The question already asks for the digits. Only the 'type my own' chip remains,
        in each language's existing wording; anything unreadable is now `null`, not a
        place. See `src/utils/singapore/postalSectors.js`.
      */
      ['其他 / 手动输入'],
      ['没有之前的 ID'],
      /*
        ⚠️ APPENDED AT INDEX 13 AND 14 TO MATCH `DOMAIN_CONFIG`, never inserted.
           `prompts`, `quickReplies` and `reflections` are parallel arrays across
           four dictionaries; `chatSteps.js` reads a step by ABSOLUTE index, and a
           renumber to close a gap is how a question goes missing in one language.

        ⚠️ THE CHIP TEXT IS PARSER INPUT, NOT ONLY READER TEXT. `parseFallsAnswer`
           and `parseHealthierSg` match tokens in `clinicalFlags.js`, and every
           token below is registered there. `clinicalFlags.i18n.test.js` asserts
           chip-for-chip parity with English — a chip changed here without its
           token fails that test rather than silently mis-flagging somebody.
      */
      /* 13 falls          */ FALLS_CHIPS.zh,
      /* 14 healthier_sg   */ HSG_CHIPS.zh,
    ],
  },

  ta: {
    back: 'பின்செல்',
    typing: 'AURA தட்டச்சு செய்கிறார்\u2026',
    inputPlaceholder: 'உங்கள் பதிலை உள்ளிடவும் அல்லது கீழே தேர்வு செய்யவும்\u2026',
    hintText: 'ஒரு விருப்பத்தைத் தேர்ந்தெடுக்கவும் அல்லது சுயமாக தட்டச்சு செய்யவும்:',
    sessionLabel: 'அமர்வு',
    domainLabel: 'திரையிடல் களம்',
    ctaTitle: 'உங்கள் தனிப்பட்ட சுகாதார திட்டம்',
    ctaPrimary: 'உங்கள் அடுத்த படி',
    ctaHealthierSG: 'Healthier SG இணைப்பு',
    ctaResources: 'கூடுதல் வளங்கள்',
    error: 'சேமிக்கும் போது இணைப்பு பிழை ஏற்பட்டது. மீண்டும் முயற்சிக்கவும்.',
    progressLabel: (step, total) => `படி ${step + 1} / ${total}`,
    prompts: [
      'வணக்கம், நான் AURA 👋 வழக்கமான வாரத்தில், நீங்கள் எத்தனை நாட்கள் மிதமான அல்லது தீவிரமான உடற்பயிற்சி செய்கிறீர்கள்? (எ.கா. வேகமாக நடைபயிற்சி, சைக்கிள், நீச்சல்)',
      'அந்த தீவிர நாட்களில் நீங்கள் வழக்கமாக எவ்வளவு நேரம் உடற்பயிற்சி செய்கிறீர்கள்?',
      'நீங்கள் தசை வலிமைப் பயிற்சிகளை செய்கிறீர்களா? (எ.கா. எடை தூக்குதல், ரெசிஸ்டன்ஸ் பேண்ட், புஷ்-அப்ஸ்)',
      'உங்களுக்கு உயர் இரத்த அழுத்தம், நீரிழிவு முன்நிலை, அல்லது இதய நோய் போன்ற நாட்பட்ட நோய்கள் உள்ளதா? செயலில் இருக்கும்போது நெஞ்சு வலி அல்லது தலைச்சுற்றல் ஏற்படுகிறதா?',
      'சமூக சுகாதார சேவைகளை அணுகுவதில் உங்களின் முக்கிய தடை என்ன?',
      'தோராயமாக எத்தனை குடும்பத்தினர் அல்லது நண்பர்கள் உங்களுக்கு உதவ முடியும்? நெருங்கி பேச யாரேனும் இருக்கிறார்களா?',
      'கடந்த 12 மாதங்களில் உணவு வாங்க வசதியில்லாததால் பசியுடன் இருந்தும் சாப்பிடாத நேரங்கள் இருந்தனவா?',
      'கடந்த இரண்டு வாரங்களில் நீங்கள் எப்படி உணர்ந்தீர்கள்? மன அழுத்தம், மனச்சோர்வு, அல்லது அதிக சுமையாக உணர்ந்தீர்களா?',
      'கிட்டத்தட்ட முடிந்துவிட்டது! உங்கள் வயது மற்றும் பாலினம் என்ன? (எ.கா. பெண், 41–60)',
      'உங்கள் இனம் என்ன? இது நாங்கள் சேவை செய்யும் பல்வேறு சமூகங்களை புரிந்துகொள்ள உதவுகிறது.',
      'நீங்கள் எந்த வகையான வீட்டில் வசிக்கிறீர்கள்? (எ.கா. HDB 3-அறை, காண்டோ)',
      'உங்கள் தபால் குறியீட்டின் முதல் இரண்டு இலக்கங்கள் என்ன?',
      'கடைசி கேள்வி — உங்களிடம் ஏற்கனவே NEXUS மதிப்பீட்டு ID உள்ளதா? இருந்தால் கீழே ஒட்டவும்; இல்லையெனில் "இல்லை" என்பதைத் தேர்ந்தெடுக்கவும்.',
      /* 13 falls          */ 'சமநிலை குறித்த இரண்டு சிறிய கேள்விகள். கடந்த 12 மாதங்களில் நீங்கள் விழுந்ததுண்டா — வழுக்கியோ இடறியோ தரையில் விழுந்தது உட்பட?',
      /* 14 healthier_sg   */ 'கடைசியாக — நீங்கள் Healthier SG மருத்துவரிடம் பதிவு செய்துள்ளீர்களா? இது உங்களை எந்தத் திட்டங்களுக்குப் பரிந்துரைக்க முடியும் என்பதை மாற்றும்.',
    ],
    reflections: [
      (input) => { const n = parseInt((input.match(/\d+/) || ['0'])[0], 10); return n === 0 ? 'சூன்யத்திலிருந்து தொடங்குவது முற்றிலும் சாதாரணமானது. ' : 'இது ஒரு சிறந்த தொடக்கம். '; },
      () => 'சேஷன் நேரம் பதிவு செய்யப்பட்டது. ',
      () => 'வலிமைப் பயிற்சி ஏரோபிக் பயிற்சியைப் போலவே முக்கியமானது. ',
      () => 'பகிர்ந்ததற்கு நன்றி. பரிந்துரைகள் உங்களுக்கு பாதுகாப்பானவை என்பதை உறுதிப்படுத்துவேன். ',
      () => 'இது மிகவும் உண்மையான சவால். ',
      () => 'சமூக இணைப்பு ஆரோக்கியத்திற்கான முக்கியமான பாதுகாப்பு காரணி. ',
      (input) => /(ஆம்|yes)/i.test(input) ? 'பகிர்ந்ததற்கு நன்றி — இதை உங்கள் திட்டத்தில் கருத்தில் கொள்வோம். ' : 'புரிந்தது. ',
      () => 'உங்கள் மனநல நலன் உடல் ஆரோக்கியம் போலவே முக்கியமானது. ',
      () => 'பதிவு செய்யப்பட்டது. ',
      () => 'பகிர்ந்ததற்கு நன்றி. ',
      () => 'புரிந்தது, அருகிலுள்ள சமூக இடங்களை பரிந்துரைக்க இது உதவுகிறது. ',
      () => 'அருகிலுள்ள வளங்களை இப்போது வரைபடமாக்குகிறேன். ',
      (input) => /(இல்லை|no)/i.test(input) ? 'பரவாயில்லை, புதிய பதிவை தொடங்குவோம். ' : 'முந்தைய பதிவுகளை இணைக்கிறேன். ',
    ],
    quickReplies: [
      ['0 நாட்கள்', '1–2 நாட்கள்', '3–4 நாட்கள்', '5–7 நாட்கள்'],
      ['20 நிமிடங்களுக்கும் குறைவு', '20–30 நிமிடங்கள்', '30–45 நிமிடங்கள்', '45–60 நிமிடங்கள்', '60+ நிமிடங்கள்'],
      ['தசை பயிற்சி இல்லை', 'வாரத்தில் 1 நாள்', 'வாரத்தில் 2 நாட்கள்', 'வாரத்தில் 3+ நாட்கள்'],
      ['நோய் அல்லது அறிகுறிகள் இல்லை', 'உயர் இரத்த அழுத்தம்', 'நீரிழிவு முன்நிலை அல்லது நீரிழிவு', 'இதய நோய்', 'செயலில் இருக்கும்போது தலைச்சுற்றல் அல்லது நெஞ்சு வலி'],
      ['நேரமின்மை', 'மிகவும் விலை அதிகம்', 'மிகவும் தூரம்', 'மருத்துவமனைகளை விரும்புகிறேன்', 'என்ன கிடைக்கும் என்று தெரியாது', 'தடைகள் இல்லை'],
      ['பல நம்பகமான நபர்கள் உள்ளனர்', 'ஒன்று அல்லது இரண்டு நெருங்கிய நபர்கள்', 'பெரும்பாலும் சுயமாக சமாளிக்கிறேன்', 'மிகவும் தனிமையாக உணர்கிறேன்'],
      ['ஆம், இது நடந்துள்ளது', 'இல்லை, என்னிடம் எப்போதும் போதுமான உணவு இருந்தது'],
      ['ஒட்டுமொத்தமாக நல்லாக உணர்கிறேன்', 'சில மன அழுத்தம் ஆனால் சமாளிக்கிறேன்', 'மிகவும் மன அழுத்தம் அல்லது மனச்சோர்வு', 'அதிக சுமை — பராமரிப்பு', 'அதிக சுமை — நிதி அழுத்தம்'],
      ['ஆண், 21–40', 'பெண், 21–40', 'ஆண், 41–60', 'பெண், 41–60', 'ஆண், 60+', 'பெண், 60+'],
      ['சீனர்', 'மலாய்', 'இந்தியர்', 'யுரேஷியன்', 'மற்றவை', 'கூற விரும்பவில்லை'],
      ['HDB 1-2 அறை', 'HDB 3 அறை', 'HDB 4 அறை', 'HDB 5 அறை / எக்ஸிகியூட்டிவ்', 'காண்டோ / தனியார் அபார்ட்மெண்ட்', 'நிலம் உள்ள வீடு'],
      
      /*
        ⚠️ NO EXAMPLE DIGITS IN THESE CHIPS, AND THAT IS THE WHOLE POINT.
        This row used to read 'North (e.g. 73, 75)', 'East (e.g. 46, 52)' and so on.
        `parseClinicalData` took the first two digits it found in the answer — which
        for a TAPPED CHIP is the label — so every respondent who tapped North was
        recorded as sector 73, East as 46, West as 60. The geographic data collected
        'for population-level resource planning' was four constants, and it also chose
        which health cluster's services the person was shown.
        The question already asks for the digits. Only the 'type my own' chip remains,
        in each language's existing wording; anything unreadable is now `null`, not a
        place. See `src/utils/singapore/postalSectors.js`.
      */
      ['மற்றவை / தட்டச்சு செய்கிறேன்'],
      ['முந்தைய ID இல்லை'],
      /*
        ⚠️ APPENDED AT INDEX 13 AND 14 TO MATCH `DOMAIN_CONFIG`, never inserted.
           `prompts`, `quickReplies` and `reflections` are parallel arrays across
           four dictionaries; `chatSteps.js` reads a step by ABSOLUTE index, and a
           renumber to close a gap is how a question goes missing in one language.

        ⚠️ THE CHIP TEXT IS PARSER INPUT, NOT ONLY READER TEXT. `parseFallsAnswer`
           and `parseHealthierSg` match tokens in `clinicalFlags.js`, and every
           token below is registered there. `clinicalFlags.i18n.test.js` asserts
           chip-for-chip parity with English — a chip changed here without its
           token fails that test rather than silently mis-flagging somebody.
      */
      /* 13 falls          */ FALLS_CHIPS.ta,
      /* 14 healthier_sg   */ HSG_CHIPS.ta,
    ],
  },
};

// ─── AURA AVATAR ──────────────────────────────────────────────────────────────
const AuraAvatar = ({ size = 'sm' }) => (
  <div className={`
    ${size === 'sm' ? 'w-7 h-7' : 'w-9 h-9'}
    rounded-full flex items-center justify-center text-white flex-shrink-0
    bg-gradient-to-br from-teal-400 to-emerald-600 shadow-sm ring-2 ring-teal-100 dark:ring-teal-900
  `}>
    <BrainCircuit size={size === 'sm' ? 14 : 18} strokeWidth={2} />
  </div>
);

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────
const ProgressBar = ({ currentStep, total, langData }) => {
  const pct = Math.round(((currentStep) / total) * 100);
  const domain = DOMAIN_CONFIG[currentStep] || DOMAIN_CONFIG[total - 1];
  const colour = GROUP_COLOURS[domain?.group] || 'bg-slate-400';

  return (
    <div className="px-4 pt-2 pb-1 bg-white dark:bg-[#111827]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {langData.progressLabel(currentStep, total)}
        </span>
        <span className="text-xs text-slate-400 dark:text-slate-500">{pct}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${colour}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

// ─── CTA CARD ─────────────────────────────────────────────────────────────────
const CtaCard = ({ ctaData, langData }) => (
  <div className="mt-3 rounded-2xl border border-teal-100 dark:border-teal-900 bg-teal-50 dark:bg-teal-950/40 overflow-hidden shadow-sm">
    <div className="px-4 py-3 bg-teal-600 dark:bg-teal-700 flex items-center gap-2">
      <span className="text-lg">{ctaData.emoji}</span>
      <h3 className="text-sm font-semibold text-white">{langData.ctaTitle}</h3>
    </div>

    <div className="p-4 space-y-4">
      {/* Primary step */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <CheckCircle size={13} className="text-teal-600 dark:text-teal-400 flex-shrink-0" />
          <p className="text-xs font-bold text-teal-700 dark:text-teal-400 uppercase tracking-wide">
            {langData.ctaPrimary}
          </p>
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
          {ctaData.primaryStep}
        </p>
      </div>

      {/* HealthierSG connection */}
      <div className="border-t border-teal-100 dark:border-teal-900 pt-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <ExternalLink size={13} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
            {langData.ctaHealthierSG}
          </p>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {ctaData.healthierSG}
        </p>
      </div>

      {/* Additional resources */}
      <div className="border-t border-teal-100 dark:border-teal-900 pt-3">
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
          {langData.ctaResources}
        </p>
        <ul className="space-y-1.5">
          {ctaData.resources.map((r, i) => (
            <li key={i} className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{r}</li>
          ))}
        </ul>
      </div>
    </div>
  </div>
);

// ─── DOMAIN BADGE ─────────────────────────────────────────────────────────────
const DomainBadge = ({ step }) => {
  const domain = DOMAIN_CONFIG[step];
  if (!domain) return null;
  const colourMap = {
    pavs:     'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    clinical: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    sdoh:     'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800',
    admin:    'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border mb-1.5 ${colourMap[domain.group]}`}>
      {domain.badge}
    </span>
  );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
const AuraChatbot = () => {
  const [isDark, setIsDark] = useState(() => {
    try {
      const s = readTheme();
      const dark = s === 'dark' || (!s && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark); 
      return dark;
    } catch { return false; }
  });
  const navigate                    = useNavigate();
  const chatEndRef                  = useRef(null);
  const inputRef                    = useRef(null);
  /**
   * `AC16` — the completion latch. Between `setIsTyping(false)` on the final
   * step and the `setIsComplete(true)` that only fires inside a 1,200 ms
   * timeout, the submission guard used to be OPEN: a second tap re-entered the
   * completion branch and produced a second telemetry row under the same
   * sessionId and a second navigate. A REF, not state, because the second tap
   * can land in the same tick as the first and a `setState` latch is not yet
   * visible to it. Cleared only on a FAILED completion, so the person can
   * answer again; a successful one stays latched until the navigate.
   */
  const concludingRef               = useRef(false);

  const [lang]      = useState(() => applyDocumentLanguage(readLanguage()));
  const langData    = DICTIONARY[lang] || DICTIONARY.en;
  const [sessionId] = useState(getSessionId);

  /**
   * ⚠️ RESTORED, NOT RESET. A thirteen-question conversation lived only here, so a
   *    refresh, a rotation that triggered one, or iOS reclaiming a backgrounded
   *    tab started the person again at question one — after they had already
   *    answered questions about chest pain, food insecurity and their mental
   *    health. See `src/utils/assessmentSession.js`.
   *
   *    `messages` is restored too, not just the answers: resuming into an empty
   *    transcript at question nine would read as a different, broken product.
   */
  const saved = loadProgress('chat');
  const [currentStep,   setCurrentStep]   = useState(() => saved?.currentStep ?? 0);
  const [messages,      setMessages]      = useState(() => saved?.messages ?? []);
  const [userInput,     setUserInput]     = useState('');
  const [isTyping,      setIsTyping]      = useState(false);
  const [collectedData, setCollectedData] = useState(() => saved?.collectedData ?? {});
  const [isComplete,    setIsComplete]    = useState(false);

  // Mirrored on every turn, so the next load can resume mid-conversation.
  // `isComplete` is deliberately NOT saved: a finished assessment is restored from
  // the result store on `/individuals/result`, and resuming a completed chat into
  // a screen with no result would be a dead end.
  useEffect(() => {
    if (!isComplete) saveProgress('chat', { currentStep, messages, collectedData });
  }, [currentStep, messages, collectedData, isComplete]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    writeTheme(next);
  };

  useEffect(() => {
    if (messages.length === 0) appendBotMessage(langData.prompts[0], 0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (!isTyping) inputRef.current?.focus();
  }, [isTyping]);

  const appendBotMessage = (text, step, ctaData = null) => {
    setIsTyping(true);
    setTimeout(() => {
      setMessages(prev => [...prev, { sender: 'bot', text, step, ctaData }]);
      setIsTyping(false);
    }, 850);
  };

  /**
   * `AC8`, resolved by CORRECTING THE FINDING rather than shipping its fix. The
   * ledger asked for "one AbortSignal" on this window so a discarded reply stops
   * billing. It would not: `httpsCallable` carries no signal, and — the part
   * that matters — aborting the HTTP request does not stop a Cloud Function
   * mid-execution. The server runs `communityAck` to completion and the Gemini
   * call bills identically whether the client is still listening or not. The
   * real cost controls are server-side and already in place: `maxOutputTokens:
   * 200`, a 20s timeout, and the `CP7` rate limits. What the window governs is
   * only whether a paid-for reply is USED — widening it would use more of them
   * at the price of rewriting text under the reader, which is `AC11` and the
   * owner's call.
   */
  const AI_UPGRADE_WINDOW_MS = 1500;

  const handleUserSubmission = (text) => {
    if (!text.trim() || isTyping || isComplete || concludingRef.current) return;

    setMessages(prev => [...prev, { sender: 'user', text }]);
    setUserInput('');

    const stepKey     = DOMAIN_CONFIG[currentStep]?.key || ('step_' + currentStep);
    const updatedData = { ...collectedData, [stepKey]: text };
    setCollectedData(updatedData);
    setIsTyping(true);

    const staticAck = langData.reflections[currentStep]?.(text) ?? '';
    // ⚠️ NOT `currentStep + 1`. Steps are skipped when they do not apply to this
    //    person (the falls branch is 60+ only) or when the active language has no
    //    prompt for them — see `src/utils/chatSteps.js`.
    const nextStep  = nextActiveStep(DOMAIN_CONFIG, currentStep, langData.prompts, updatedData);

    if (nextStep !== -1) {
      const nextPromptRaw = langData.prompts[nextStep];
      const nextPrompt    = typeof nextPromptRaw === 'function' ? nextPromptRaw(updatedData) : nextPromptRaw;
      const staticText    = (staticAck ? staticAck + ' ' : '') + nextPrompt;

      const msgId = Date.now();
      setCurrentStep(nextStep);
      setMessages(prev => [...prev, { sender: 'bot', text: staticText, step: nextStep, _id: msgId }]);
      setIsTyping(false);

      // ⚠️ WHAT THIS SENDS, AND WHAT IT DELIBERATELY NO LONGER SENDS.
      //
      // This used to call `chatWithAura` — the same callable as the internal staff
      // assistant, unauthenticated, whose system prompt names KKH/SingHealth and
      // prints the internal Firestore schema. It shipped `WELL_WELL_PROMPT` to the
      // browser and passed all 1,718 characters back on every turn as a
      // caller-supplied `CONTEXT/OVERRIDE`, which meant anybody could replace it.
      //
      // The persona now lives on the server (`functions/index.js`, `communityAck`)
      // and there is no `prompt` field to override. Two more things are gone:
      //
      //   `history`  — the whole transcript was sent alongside the answers, which
      //                duplicated `priorAnswers` for a one-sentence acknowledgement
      //                and re-sent the person's full health profile to Google twice
      //                per turn. Only the answers go now, and only known domains.
      //   `role`     — went into the model context verbatim from an unauthenticated
      //                caller, defaulting to 'Staff'.
      //
      // What the reply does is unchanged and worth restating: it rewrites the text
      // of the acknowledgement already on screen. `parseClinicalData`,
      // `calculateRiskScore` and `selectCTA` never see it.
      var upgradeExpired = false;
      var upgradeTimer   = setTimeout(function() { upgradeExpired = true; }, AI_UPGRADE_WINDOW_MS);

      communityAck({
        domain: stepKey,
        answer: text,
        priorAnswers: updatedData,
        language: lang,
      }).then(function(result) {
        clearTimeout(upgradeTimer);
        if (upgradeExpired) return;

        /**
         * `AC9` + `AC10`. Two layers of dead tolerance are gone. The error-word
         * screen — an unanchored substring test discarding any acknowledgement
         * containing "error" or "unavailable" ("if your usual class is
         * unavailable, the centre can suggest another"), the pattern this file
         * has had removed from it four times, with an unescaped `.` in
         * `/missing.api/` for good measure. And the THIRD copy of the
         * fence-strip-and-brace-scan, parsing JSON out of an endpoint whose own
         * server prompt says "No JSON, no preamble, no quotes" and whose errors
         * arrive as THROWN HttpsErrors (the .catch below), never as prose. What
         * a successful reply needs is exactly one check: that it is not empty.
         */
        var aiAck = String((result.data && result.data.text) || '').trim();
        if (!aiAck) return;

        setMessages(function(prev) {
          return prev.map(function(m) {
            return (m._id === msgId) ? Object.assign({}, m, { text: aiAck + ' ' + nextPrompt }) : m;
          });
        });
      }).catch(function() { clearTimeout(upgradeTimer); });

    } else {
      var closing = (staticAck ? staticAck + ' ' : '') + 'I have mapped your full profile. Generating your personalised plan now…';
      setMessages(prev => [...prev, { sender: 'bot', text: closing, step: currentStep }]);
      setIsTyping(false);
      concludingRef.current = true; // `AC16` — see the ref's declaration
      // `AC6`: the body traps its own throws now, but a promise rejection from
      // the async machinery itself must not become an unhandled rejection.
      concludeTriage(updatedData).catch((err) => console.error('[AuraChat] concludeTriage rejected:', err));
    }
  };
  
  const handleFormSubmit = (e) => {
    e.preventDefault();
    handleUserSubmission(userInput);
  };

  const concludeTriage = async (finalData) => {
    /**
     * ⚠️ `AC6` / `AC7` — THE TRY USED TO GUARD THE ONE CALL THAT CANNOT THROW.
     *    `clearProgress()` ran on line one, then `parseClinicalData`,
     *    `calculateRiskScore` and `selectCTA` all ran OUTSIDE the try, and the
     *    only thing inside it was `recordTelemetry` — which catches everything
     *    and returns false by design (`telemetry.js`), so the catch was
     *    unreachable. A throw in any of the three real computations was an
     *    unhandled rejection: the visitor sat on "Generating your personalised
     *    plan now…" forever, and their answers were already gone, so even a
     *    refresh could not resume.
     *
     *    Now: everything that can throw is inside the try; the catch shows the
     *    error sentence (`AC7`: alive, and the only outcome for a failure); and
     *    `clearProgress()` runs only once there is a computed result to replace
     *    the in-progress copy — a failed COMPUTATION leaves the answers intact,
     *    so the person can answer the last question again instead of starting
     *    a 15-step screening from nothing.
     *
     * ⚠️ SCOPE OF THAT SENTENCE, precisely: it covers a THROW. A failed
     *    telemetry WRITE is a different case — `recordTelemetry` swallows its
     *    errors and returns `false` by design, so a Firestore outage still
     *    falls through to `clearProgress()` and the person still gets their
     *    plan (correct: their result must not be hostage to our analytics),
     *    but the answers are gone and no record was stored. That trade is
     *    telemetry.js's documented decision, not an accident of this try.
     */
    try {
      const parsed    = parseClinicalData(finalData);
      const riskScore = calculateRiskScore(parsed);
      const ctaData   = selectCTA(parsed);

      await recordTelemetry(parsed.postalSector, {
        event: 'aura_triage_complete_v2',
        sessionId,
        previousSessionId: parsed.previousId,
        payload: parsed,
        computedRisk: riskScore,
        ctaTier: ctaData.tier,
      });

      // The conversation has become a result; the in-progress copy is no longer
      // the live one and keeping it would resume a completed assessment.
      clearProgress();

      setTimeout(() => {
        setIsComplete(true);
        setMessages(prev => [...prev, {
          sender: 'bot',
          text: 'Here is your personalised community health plan based on your PAVS score and health profile. Save or screenshot this screen, then tap anywhere to continue.',
          ctaData,
        }]);

        setTimeout(() => {
          navigate('/individuals/result', {
            state: {
              score: riskScore,
              data: parsed,
              postalSector: parsed.postalSector,
              sessionId,
              previousSessionId: parsed.previousId,
              ctaTier: ctaData.tier,
            },
          });
        }, 5000);
      }, 1200);

    } catch (err) {
      console.error('[AuraChat] completion failed; progress kept for resume:', err);
      // `AC16`: a FAILED completion unlatches, so the person can answer the
      // last question again — the same reasoning as keeping their progress.
      concludingRef.current = false;
      setTimeout(() => {
        setMessages(prev => [...prev, { sender: 'bot', text: langData.error }]);
      }, 1000);
    }
  };

  const showQuickReplies = !isTyping && !isComplete && currentStep < langData.quickReplies.length;

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-stone-50 dark:bg-slate-950 font-sans transition-colors duration-500">

      {/* ── HEADER ── */}
      <header className="flex items-center justify-between px-4 pt-4 pb-2 bg-white dark:bg-[#111827] shadow-sm border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
            aria-label={langData.back}
          >
            <ChevronLeft size={22} />
          </button>
          <div className="flex items-center gap-2.5">
            <AuraAvatar size="md" />
            <div>
              <h1 className="font-semibold text-base text-slate-900 dark:text-white leading-tight">AURA</h1>
              <p className="text-[10px] text-teal-600 dark:text-teal-400 font-medium leading-none">
                {langData.sessionLabel}: {sessionId}
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 shadow-sm hover:scale-105 active:scale-95 transition-all"
          aria-label="Toggle theme"
        >
          {isDark
            ? <Sun size={17} className="text-amber-400" />
            : <Moon size={17} />}
        </button>
      </header>

      {/* ── PROGRESS BAR ── */}
      {/*
        Counted from the steps this person will actually be asked, so the bar does
        not promise questions that are skipped. It changes once — when age is given
        and the 60+ branch opens or does not.
      */}
      <ProgressBar
        currentStep={activeStepPosition(DOMAIN_CONFIG, currentStep, langData.prompts, collectedData) - 1}
        total={activeStepCount(DOMAIN_CONFIG, langData.prompts, collectedData)}
        langData={langData}
      />

      {/* ── CHAT AREA ── */}
      {/*
        `AC12`. The staff roster announces its state changes with two polite live
        regions; the public screening — the surface `CP17` fixed `<html lang>` and
        pinch-zoom for BECAUSE its users are elderly — announced nothing: every
        question, the typing indicator and the final plan arrived silently to a
        screen reader. `role="log"` implies polite announcements of additions,
        stated explicitly for the older screen-reader/browser pairs this audience
        actually uses.
      */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" role="log" aria-live="polite">
        {messages.map((msg, idx) => (
          // `AC13`: `_id` was added precisely so the upgrade handler could find a
          // message; the key never moved to it. Index stays as the fallback for
          // messages minted before `_id` existed (greetings, restored progress).
          <div key={msg._id ?? idx} className={`flex gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>

            {/* Bot avatar */}
            {msg.sender === 'bot' && <AuraAvatar size="sm" />}

            <div className={`max-w-[82%] ${msg.sender === 'user' ? '' : ''}`}>
              {/* Domain badge */}
              {msg.sender === 'bot' && msg.step !== undefined && (
                <DomainBadge step={msg.step} />
              )}

              {/* Message bubble */}
              <div className={`px-4 py-3 rounded-2xl shadow-sm text-sm leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-teal-600 dark:bg-teal-500 text-white rounded-br-none'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-none'
              }`}>
                {msg.text}
              </div>

              {/* CTA card */}
              {msg.ctaData && <CtaCard ctaData={msg.ctaData} langData={langData} />}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex gap-2 items-end justify-start">
            <AuraAvatar size="sm" />
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-2xl rounded-bl-none shadow-sm">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* ── INPUT AREA ── */}
      <div className="px-4 pt-3 pb-4 bg-white dark:bg-[#111827] border-t border-slate-100 dark:border-slate-800 shadow-[0_-4px_8px_-2px_rgba(0,0,0,0.04)]">

        {/* Quick replies */}
        {showQuickReplies && (
          <div className="mb-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 px-0.5">
              {langData.hintText}
            </p>
            <div className="flex flex-wrap gap-2">
              {langData.quickReplies[currentStep].map((reply) => (
                <button
                  key={reply}
                  onClick={() => handleUserSubmission(reply)}
                  className="px-3 py-1.5 text-xs font-medium bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-500/30 rounded-full hover:bg-teal-100 dark:hover:bg-teal-500/20 active:scale-95 transition-all text-left"
                >
                  {reply}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Text input */}
        {!isComplete && (
          <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder={langData.inputPlaceholder}
              disabled={isTyping}
              aria-label="Your message"
              className="flex-1 px-4 py-2.5 bg-stone-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-full text-sm focus:outline-none focus:border-teal-500 dark:focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:focus:ring-teal-400/20 transition-all placeholder-slate-400 dark:placeholder-slate-500 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!userInput.trim() || isTyping}
              aria-label="Send message"
              className="p-2.5 bg-teal-600 dark:bg-teal-500 text-white rounded-full disabled:opacity-40 disabled:cursor-not-allowed hover:bg-teal-700 dark:hover:bg-teal-600 active:scale-95 transition-all shadow-sm"
            >
              <Send size={18} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default AuraChatbot;
