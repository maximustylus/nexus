import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { recordTelemetry } from '../utils/telemetry';
import { calculateRiskScore } from '../utils/scoring';
import { ChevronLeft, Send, Sun, Moon, ExternalLink, CheckCircle, BrainCircuit } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';

// ── Cloud Function — same pattern as AuraPulseBot.jsx ────────────────────────
// Gemini API key is secured in Firebase Cloud Functions (never client-side)
const functions = getFunctions(undefined, 'us-central1');
const secureChatWithAura = httpsCallable(functions, 'chatWithAura');

// ── Well Well persona system prompt for community health triage ───────────────
// Used as the `prompt` param passed to the Cloud Function, same as personas
// in AuraPulseBot. Well Well uses Motivational Interviewing (OARS) and is
// calibrated for Singapore community members, not clinical staff.
const WELL_WELL_PROMPT =
  'You are Well Well, a warm and professionally trained community health navigator ' +
  "within Singapore's NEXUS health programme. You use Motivational Interviewing (MI) " +
  'techniques — specifically OARS: Open questions, Affirmations, Reflective listening, and Summaries.\n\n' +
  'You are currently guiding a community member through the NEXUS structured health assessment. ' +
  'After each answer, you will receive the question domain, the user\'s answer, and all prior ' +
  'answers collected so far. Your job is to write a brief, natural acknowledgement ' +
  '(1\u20132 sentences, under 40 words) that:\n' +
  '- Reflects what the person actually said — specific, never generic\n' +
  '- Uses an affirming, non-judgmental MI tone\n' +
  '- Matches emotional register: warm and encouraging for positive behaviours, compassionate ' +
  'and non-alarming for health concerns, calm and matter-of-fact for neutral answers\n' +
  '- Naturally bridges to the next question (which will follow automatically — do NOT write the next question yourself)\n\n' +
  'Hard rules:\n' +
  '- NEVER say "Great!", "Wonderful!", "Awesome!" — these feel hollow\n' +
  '- NEVER say "on those active days" or similar if the person answered 0 days of exercise\n' +
  '- NEVER minimise a health concern (e.g. chest pain, isolation, food insecurity) with cheerful filler\n' +
  '- NEVER use clinical jargon — speak plainly, as a trusted health coach would\n' +
  '- Do NOT repeat the question back to the person\n' +
  '- Do NOT mention AURA, Well Well, NEXUS, or any system names\n' +
  '- Respond in English unless the person\'s answer is clearly in Malay, Chinese, or Tamil — then mirror their language';

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
];

const TOTAL_STEPS = DOMAIN_CONFIG.length; // 13

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
      /* 12 previous_id     */ 'Last question — do you have a previous NEXUS Assessment ID? If yes, paste it below so I can link your records. If not, just select No.',
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
      /* 7 wellbeing       */ ['Feeling good overall', 'Some stress but managing', 'Feeling quite stressed or low', 'Overwhelmed — caregiving or financial pressure'],
      /* 8 demographics    */ ['Male, 21–40', 'Female, 21–40', 'Male, 41–60', 'Female, 41–60', 'Male, 60+', 'Female, 60+'],
      /* 9 ethnicity       */ ['Chinese', 'Malay', 'Indian', 'Eurasian', 'Others', 'Prefer not to say'],
      /* 10 housing_type   */ ['HDB 1-2 Room', 'HDB 3 Room', 'HDB 4 Room', 'HDB 5 Room / Exec', 'Condo / Private', 'Landed'],
      /* 11 postal_code    */ ['North (e.g. 73, 75)', 'East (e.g. 46, 52)', 'West (e.g. 60, 64)', 'North-East (e.g. 53, 82)', 'Central/South (e.g. 01–33)', 'Other / Type my own'],
      /* 12 previous_id    */ ['No previous ID'],
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
      ['Perasaan baik secara keseluruhannya', 'Ada sedikit tekanan tapi boleh kawal', 'Rasa sangat tertekan atau sedih', 'Terbeban — tanggungjawab penjagaan atau tekanan kewangan'],
      ['Lelaki, 21–40', 'Perempuan, 21–40', 'Lelaki, 41–60', 'Perempuan, 41–60', 'Lelaki, 60+', 'Perempuan, 60+'],
      ['Cina', 'Melayu', 'India', 'Eurasian', 'Lain-lain', 'Tidak mahu beritahu'],
      ['HDB 1-2 Bilik', 'HDB 3 Bilik', 'HDB 4 Bilik', 'HDB 5 Bilik / Eksekutif', 'Kondo / Pangsapuri', 'Landed'],
      ['Utara (cth. 73, 75)', 'Timur (cth. 46, 52)', 'Barat (cth. 60, 64)', 'Timur Laut (cth. 53, 82)', 'Tengah/Selatan (cth. 01–33)', 'Lain-lain / Taip sendiri'],
      ['Tiada ID'],
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
      ['整体感觉不错', '有些压力但能应对', '感到很压抑或情绪低落', '感到不知所措 — 照顾或经济压力'],
      ['男, 21–40', '女, 21–40', '男, 41–60', '女, 41–60', '男, 60+', '女, 60+'],
      ['华人', '马来人', '印度人', '欧亚裔', '其他', '不愿透露'],
      ['HDB 1-2 房式', 'HDB 3 房式', 'HDB 4 房式', 'HDB 5 房式 / 执行组屋', '私人公寓', '有地住宅'],
      ['北部 (如 73, 75)', '东部 (如 46, 52)', '西部 (如 60, 64)', '东北部 (如 53, 82)', '中南部 (如 01–33)', '其他 / 手动输入'],
      ['没有之前的 ID'],
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
      ['ஒட்டுமொத்தமாக நல்லாக உணர்கிறேன்', 'சில மன அழுத்தம் ஆனால் சமாளிக்கிறேன்', 'மிகவும் மன அழுத்தம் அல்லது மனச்சோர்வு', 'அதிக சுமை — பராமரிப்பு அல்லது நிதி அழுத்தம்'],
      ['ஆண், 21–40', 'பெண், 21–40', 'ஆண், 41–60', 'பெண், 41–60', 'ஆண், 60+', 'பெண், 60+'],
      ['சீனர்', 'மலாய்', 'இந்தியர்', 'யுரேஷியன்', 'மற்றவை', 'கூற விரும்பவில்லை'],
      ['HDB 1-2 அறை', 'HDB 3 அறை', 'HDB 4 அறை', 'HDB 5 அறை / எக்ஸிகியூட்டிவ்', 'காண்டோ / தனியார் அபார்ட்மெண்ட்', 'நிலம் உள்ள வீடு'],
      ['வடக்கு (எ.கா. 73, 75)', 'கிழக்கு (எ.கா. 46, 52)', 'மேற்கு (எ.கா. 60, 64)', 'வடகிழக்கு (எ.கா. 53, 82)', 'மத்திய/தெற்கு (எ.கா. 01–33)', 'மற்றவை / தட்டச்சு செய்கிறேன்'],
      ['முந்தைய ID இல்லை'],
    ],
  },
};

// ─── CLINICAL DATA PARSER ─────────────────────────────────────────────────────
const parseClinicalData = (raw) => {
  // PAVS — Q0 days, Q1 minutes
  const daysStr  = (raw.pavs_days || '').toLowerCase();
  const minsStr  = (raw.pavs_mins  || '').toLowerCase();

  const daysN = daysStr.includes('0 day') || daysStr === '0' ? 0
              : daysStr.match(/5.?7|5\+|every day/i)         ? 6
              : daysStr.match(/3.?4/i)                        ? 3.5
              : daysStr.match(/1.?2/i)                        ? 1.5
              : parseInt((daysStr.match(/\d+/) || ['0'])[0], 10);

  const minsN = minsStr.includes('60+') || minsStr.includes('60 min') ? 65
              : minsStr.match(/45.?60|45–60/i)                         ? 52
              : minsStr.match(/30.?45|30–45/i)                         ? 37
              : minsStr.match(/20.?30|20–30/i)                         ? 25
              : minsStr.includes('less') || minsStr.includes('20')     ? 15
              : parseInt((minsStr.match(/\d+/) || ['0'])[0], 10);

  const pavsScore    = Math.round(daysN * minsN); 
  const pavsDays     = daysN;
  const pavsMinutes  = daysN === 0 ? 0 : minsN;

  // Strength
  const strStr      = (raw.strength || '').toLowerCase();
  const strengthDays = strStr.includes('3+') ? 3
                     : strStr.includes('2')   ? 2
                     : strStr.includes('1')   ? 1
                     : 0;

  // Medical safety
  const medStr      = (raw.medical || '').toLowerCase();
  const symptomFlag = /(dizziness|chest pain|pening|dada|头晕|胸痛|தலைச்சுற்றல்|நெஞ்சு வலி)/.test(medStr);
  const medFlag     = /(blood pressure|prediabetes|diabetes|heart|darah tinggi|高血压|糖尿病|心脏|உயர் இரத்த|நீரிழிவு|இதய)/.test(medStr);

  // SDOH — Financial
  const barrStr      = (raw.barriers || '').toLowerCase();
  const sdohFinancial = /(expensive|cost|afford|mahal|kos|贵|செலவு|too far|jauh|太远)/.test(barrStr);

  // SDOH — Social 
  const socialStr    = (raw.social || '').toLowerCase();
  const sdohSocial   = /(isolated|alone|on my own|keseorangan|孤立|தனிமை)/.test(socialStr);

  // SDOH — Psychological 
  const wellStr      = (raw.wellbeing || '').toLowerCase();
  const sdohPsychological = /(stressed|stress|low|overwhelmed|tertekan|murung|terbeban|压抑|不知所措|மன அழுத்தம்|மனச்சோர்வு|அதிக சுமை)/.test(wellStr);

  // Demographics
  const demoStr = (raw.demographics || '').toLowerCase();
  let gender = 'Unknown';
  if (/(female|perempuan|女|பெண்)/.test(demoStr))        gender = 'Female';
  else if (/(male|lelaki|男|ஆண்)/.test(demoStr))          gender = 'Male';

  let age = 'Unknown';
  if (demoStr.includes('60+'))                             age = '60+';
  else if (demoStr.includes('41'))                         age = '41-60';
  else if (demoStr.includes('21'))                         age = '21-40';

  // NEW: Ethnicity & Housing Type
  const ethnicity = raw.ethnicity || 'Unknown';
  const housingType = raw.housing_type || 'Unknown';

  // Location
  const locStr       = (raw.postal_code || '');
  const sectorMatch  = locStr.match(/\d{2}/);
  const postalSector = sectorMatch ? sectorMatch[0] : '00';

  // Continuity
  const foodStr        = (raw.food_insecurity || '').toLowerCase();
  const sdohFoodInsecure = /(yes|ya|是|ஆம்)/.test(foodStr);

  const prevStr    = (raw.previous_id || '');
  const isNoId     = /(no|none|tidak|tiada|没|无|不|இல்லை)/i.test(prevStr) || prevStr.trim() === '';
  const previousId = isNoId ? null : prevStr.trim().toUpperCase();

  return {
    pavsScore, pavsDays, pavsMinutes, strengthDays,
    symptomFlag, medFlag,
    sdohFinancial, sdohSocial, sdohPsychological, sdohFoodInsecure,
    gender, age, ethnicity, housingType, postalSector, previousId,
    psychoFlag: sdohPsychological,
  };
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
      const s = localStorage.getItem('nexus-theme');
      const dark = s === 'dark' || (!s && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark); 
      return dark;
    } catch { return false; }
  });
  const navigate                    = useNavigate();
  const chatEndRef                  = useRef(null);
  const inputRef                    = useRef(null);

  const [lang]      = useState(() => localStorage.getItem('nexus_language') || 'en');
  const langData    = DICTIONARY[lang] || DICTIONARY.en;
  const [sessionId] = useState(() => 'NX-' + Math.random().toString(36).substr(2, 9).toUpperCase());

  const [currentStep,   setCurrentStep]   = useState(0);
  const [messages,      setMessages]      = useState([]);
  const [userInput,     setUserInput]     = useState('');
  const [isTyping,      setIsTyping]      = useState(false);
  const [collectedData, setCollectedData] = useState({});
  const [isComplete,    setIsComplete]    = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('nexus-theme', next ? 'dark' : 'light');
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

  const AI_UPGRADE_WINDOW_MS = 1500;

  const handleUserSubmission = (text) => {
    if (!text.trim() || isTyping || isComplete) return;

    setMessages(prev => [...prev, { sender: 'user', text }]);
    setUserInput('');

    const stepKey     = DOMAIN_CONFIG[currentStep]?.key || ('step_' + currentStep);
    const updatedData = { ...collectedData, [stepKey]: text };
    setCollectedData(updatedData);
    setIsTyping(true);

    const staticAck = langData.reflections[currentStep]?.(text) ?? '';
    const nextStep  = currentStep + 1;

    if (nextStep < TOTAL_STEPS) {
      const nextPromptRaw = langData.prompts[nextStep];
      const nextPrompt    = typeof nextPromptRaw === 'function' ? nextPromptRaw(updatedData) : nextPromptRaw;
      const staticText    = (staticAck ? staticAck + ' ' : '') + nextPrompt;

      const msgId = Date.now();
      setCurrentStep(nextStep);
      setMessages(prev => [...prev, { sender: 'bot', text: staticText, step: nextStep, _id: msgId }]);
      setIsTyping(false);

      const historySnap = messages
        .filter(m => !m.isGreeting)
        .map(m => ({ role: m.sender === 'bot' ? 'model' : 'user', parts: [{ text: m.text }] }));

      const answersSoFar = Object.entries(updatedData)
        .map(function(e) { return '  ' + e[0] + ': ' + e[1]; }).join('\n');
      const contextPrompt = [
        WELL_WELL_PROMPT,
        'Assessment domain: ' + stepKey + ' (step ' + (currentStep + 1) + ' of ' + TOTAL_STEPS + ')',
        'User just answered: "' + text + '"',
        'Answers so far:\n' + answersSoFar,
      ].join('\n');

      var upgradeExpired = false;
      var upgradeTimer   = setTimeout(function() { upgradeExpired = true; }, AI_UPGRADE_WINDOW_MS);

      secureChatWithAura({
        userText: text, history: historySnap,
        role: 'Community Member — Well Well', prompt: contextPrompt, isDemo: false,
      }).then(function(result) {
        clearTimeout(upgradeTimer);
        if (upgradeExpired) return; 

        var raw      = (result.data && result.data.text) ? result.data.text : '';
        var stripped = raw.replace(/```json|```/g, '').trim();
        var isErr    = !stripped || /fallback|missing.api|api.key|error|unauthorized|unavailable/i.test(stripped);
        if (isErr) return;

        var aiAck = '';
        try {
          var s = stripped.indexOf('{'); var e = stripped.lastIndexOf('}') + 1;
          if (s !== -1 && e > s) { var p = JSON.parse(stripped.substring(s, e)); aiAck = (p.reply || '').trim(); }
        } catch(ex) {}
        if (!aiAck) aiAck = stripped;
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
      concludeTriage(updatedData);
    }
  };
  
  const handleFormSubmit = (e) => {
    e.preventDefault();
    handleUserSubmission(userInput);
  };

  const concludeTriage = async (finalData) => {
    const parsed    = parseClinicalData(finalData);
    const riskScore = calculateRiskScore(parsed);
    const ctaData   = selectCTA(parsed);

    try {
      await recordTelemetry(parsed.postalSector, {
        event: 'aura_triage_complete_v2',
        sessionId,
        previousSessionId: parsed.previousId,
        payload: parsed,
        computedRisk: riskScore,
        ctaTier: ctaData.tier,
      });

      setTimeout(() => {
        setIsComplete(true);
        setMessages(prev => [...prev, {
          sender: 'bot',
          text: 'Here is your personalised community health plan based on your PAVS score and health profile. Save or screenshot this screen, then tap anywhere to continue.',
          step: TOTAL_STEPS - 1,
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

    } catch {
      setTimeout(() => {
        setMessages(prev => [...prev, { sender: 'bot', text: langData.error, step: TOTAL_STEPS - 1 }]);
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
      <ProgressBar currentStep={currentStep} total={TOTAL_STEPS} langData={langData} />

      {/* ── CHAT AREA ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>

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
              {langData.quickReplies[currentStep].map((reply, idx) => (
                <button
                  key={idx}
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
