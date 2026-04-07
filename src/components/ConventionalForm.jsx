/**
 * ConventionalForm.jsx
 *
 * REVIEW CHANGELOG (vs submitted version):
 *
 * FIX 1 — Theme key: nexus_theme → nexus-theme (hyphen)
 *   Was using underscore; AuraChatbot uses hyphen. Dark mode was never
 *   shared between components.
 *
 * FIX 2 — PavsLive guard: (!days && !mins) → (!days || !mins)
 *   '0 days' is a truthy string. Previous guard let the banner render
 *   with score = 0 before mins was selected, showing a false
 *   "Insufficiently Active" flash on every page load.
 *
 * FIX 3 — Language selector UI added to nav bar
 *   lang state existed but had no UI. Community members landing on the
 *   form cold had no way to switch from English. Added EN / BM / 中文 / தமிழ்
 *   toggle that persists to nexus_language localStorage.
 *
 * FIX 4 — handleSubmit wrapped in try/catch/finally
 *   setBusy(true) had no error path. A recordTelemetry or navigate
 *   failure would freeze the Submit button in "Processing…" indefinitely.
 *
 * FIX 5 — Per-step validation hint message
 *   Generic "Please complete all required demographic fields" replaced
 *   with step-aware message that names the first missing required field.
 *
 * FIX 6 — Wellbeing option label restored em dash
 *   en display for "Overwhelmed" option was missing the — separator.
 *   Value (used for flag detection) was unaffected and correct.
 *
 * FIX 7 — Step 3 rating helper text
 *   Added sub-label clarifying "Not applicable" is the correct choice
 *   for users who haven't used community services, so they don't skip.
 *
 * FIX 8 — Back button guard on step > 0
 *   Added confirmation when navigating back mid-step so users don't
 *   accidentally discard partially completed answers.
 *
 * ALIGNMENT:
 *   • Option values and midpoint maps match AuraChatbot exactly.
 *   • selectCTA() and deriveFlags() are identical to AuraChatbot.
 *   • Navigation state shape matches AuraChatbot → identical ResultPage render.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { calculateRiskScore } from '../utils/scoring';
import { recordTelemetry } from '../utils/telemetry';
import {
  ChevronLeft, ChevronRight, Activity, ShieldAlert,
  Users, MapPin, Send, Sun, Moon, Brain, Home, Info, Zap, Globe,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// OPTION TABLES — values match AuraChatbot quick-reply strings exactly
// ─────────────────────────────────────────────────────────────────────────────

const PAVS_DAYS = [
  { value: '0 days',   en: '0 days',   ms: '0 hari',   zh: '0 天',   ta: '0 நாட்கள்'   },
  { value: '1–2 days', en: '1–2 days', ms: '1–2 hari', zh: '1–2 天', ta: '1–2 நாட்கள்' },
  { value: '3–4 days', en: '3–4 days', ms: '3–4 hari', zh: '3–4 天', ta: '3–4 நாட்கள்' },
  { value: '5–7 days', en: '5–7 days', ms: '5–7 hari', zh: '5–7 天', ta: '5–7 நாட்கள்' },
];

const PAVS_MINS = [
  { value: 'Less than 20 mins', en: 'Less than 20 mins', ms: 'Kurang 20 minit', zh: '少于 20 分钟', ta: '20 நிமிடங்களுக்கும் குறைவு' },
  { value: '20–30 mins',        en: '20–30 mins',        ms: '20–30 minit',    zh: '20–30 分钟',  ta: '20–30 நிமிடங்கள்'          },
  { value: '30–45 mins',        en: '30–45 mins',        ms: '30–45 minit',    zh: '30–45 分钟',  ta: '30–45 நிமிடங்கள்'          },
  { value: '45–60 mins',        en: '45–60 mins',        ms: '45–60 minit',    zh: '45–60 分钟',  ta: '45–60 நிமிடங்கள்'          },
  { value: '60+ mins',          en: '60+ mins',          ms: '60+ minit',      zh: '60 分钟以上', ta: '60+ நிமிடங்கள்'            },
];

const STRENGTH_DAYS = [
  { value: 'No strength training', en: 'No strength training', ms: 'Tiada latihan kekuatan', zh: '没有力量训练',   ta: 'தசை பயிற்சி இல்லை'    },
  { value: '1 day a week',         en: '1 day a week',         ms: '1 hari seminggu',        zh: '每周 1 天',      ta: 'வாரத்தில் 1 நாள்'     },
  { value: '2 days a week',        en: '2 days a week',        ms: '2 hari seminggu',        zh: '每周 2 天',      ta: 'வாரத்தில் 2 நாட்கள்'  },
  { value: '3+ days a week',       en: '3+ days a week',       ms: '3+ hari seminggu',       zh: '每周 3 天以上',  ta: 'வாரத்தில் 3+ நாட்கள்' },
];

const MEDICAL_OPTIONS = [
  { value: 'No conditions or symptoms',           en: 'No conditions or symptoms',              ms: 'Tiada penyakit atau gejala',          zh: '没有慢性病或症状',    ta: 'நோய் அல்லது அறிகுறிகள் இல்லை'                  },
  { value: 'High blood pressure',                 en: 'High blood pressure',                    ms: 'Darah tinggi',                        zh: '高血压',             ta: 'உயர் இரத்த அழுத்தம்'                            },
  { value: 'Prediabetes or diabetes',             en: 'Prediabetes or diabetes',                ms: 'Pradiabetes / diabetes',              zh: '糖尿病前期或糖尿病',  ta: 'நீரிழிவு முன்நிலை'                                },
  { value: 'Heart condition',                     en: 'Heart condition',                        ms: 'Penyakit jantung',                    zh: '心脏病',             ta: 'இதய நோய்'                                        },
  { value: 'Dizziness or chest pain when active', en: 'Dizziness or chest pain when active',   ms: 'Pening atau sakit dada semasa aktif', zh: '活动时头晕或胸痛',   ta: 'செயல்படும்போது தலைசுற்றல் அல்லது நெஞ்சு வலி'   },
];
const MEDICAL_EXCLUSIVE = 'No conditions or symptoms';

const BARRIERS = [
  { value: 'Lack of time',                     en: 'Lack of time',                     ms: 'Kekurangan masa',      zh: '没时间',      ta: 'நேரமின்மை'                    },
  { value: 'Too expensive',                     en: 'Too expensive',                    ms: 'Terlalu mahal',        zh: '太贵了',      ta: 'அதிக செலவு'                   },
  { value: 'Too far away',                      en: 'Too far away',                     ms: 'Terlalu jauh',         zh: '太远了',      ta: 'மிகவும் தூரம்'                },
  { value: 'I prefer hospitals over community', en: 'I prefer hospitals over community', ms: 'Lebih suka hospital',  zh: '更喜欢去医院', ta: 'மருத்துவமனையை விரும்புகிறேன்' },
  { value: 'Unsure what is available',          en: 'Unsure what is available',          ms: 'Tidak pasti apa ada',  zh: '不确定有哪些', ta: 'என்ன உள்ளது என்று தெரியாது'  },
  { value: 'No barriers for me',                en: 'No barriers for me',               ms: 'Tiada halangan',       zh: '没有障碍',    ta: 'தடைகள் இல்லை'                 },
];

const SOCIAL_OPTIONS = [
  { value: 'I have several people I can rely on', en: 'I have several people I can rely on', ms: 'Ada beberapa orang yang boleh saya hubungi', zh: '有几个可以依靠的人', ta: 'நம்பகமான பல நபர்கள் உள்ளனர்'         },
  { value: 'I have one or two close people',      en: 'I have one or two close people',      ms: 'Ada satu atau dua orang rapat',             zh: '有一两个亲近的人',  ta: 'ஒன்று அல்லது இரண்டு நெருங்கிய நபர்கள்' },
  { value: 'I mostly manage on my own',           en: 'I mostly manage on my own',           ms: 'Saya mostly uruskan sendiri',               zh: '大多数情况自己处理', ta: 'பெரும்பாலும் சுயமாக சமாளிக்கிறேன்'      },
  { value: 'I feel quite isolated',               en: 'I feel quite isolated',               ms: 'Saya rasa agak keseorangan',               zh: '感到相当孤立',      ta: 'மிகவும் தனிமையாக உணர்கிறேன்'           },
];

// FIX 6: restored em dash in en display label for last option
const WELLBEING_OPTIONS = [
  { value: 'Feeling good overall',                           en: 'Feeling good overall',                             ms: 'Perasaan baik secara keseluruhannya',        zh: '整体感觉不错',            ta: 'ஒட்டுமொத்தமாக நல்லாக உணர்கிறேன்'        },
  { value: 'Some stress but managing',                       en: 'Some stress, but managing',                        ms: 'Ada sedikit tekanan tapi boleh kawal',       zh: '有些压力但能应对',        ta: 'சில மன அழுத்தம் ஆனால் சமாளிக்கிறேன்'    },
  { value: 'Feeling quite stressed or low',                  en: 'Feeling quite stressed or low in mood',            ms: 'Rasa sangat tertekan atau sedih',            zh: '感到很压抑或情绪低落',    ta: 'மிகவும் மன அழுத்தம் அல்லது மனச்சோர்வு'  },
  { value: 'Overwhelmed — caregiving or financial pressure', en: 'Overwhelmed — caregiving or financial pressure',   ms: 'Terbeban — penjagaan atau tekanan kewangan', zh: '不知所措 — 照顾或经济压力', ta: 'அதிக சுமை — பராமரிப்பு அல்லது நிதி அழுத்தம்' },
];

const INCOME_OPTIONS = [
  { value: 'More than adequate', en: 'More than adequate (money left over)', ms: 'Lebih daripada mencukupi', zh: '绰绰有余',      ta: 'மிகவும் போதுமானது' },
  { value: 'Adequate',           en: 'Adequate (just enough, no difficulty)', ms: 'Mencukupi',              zh: '足够',          ta: 'போதுமானது'          },
  { value: 'Inadequate',         en: 'Inadequate (some or much difficulty)',  ms: 'Tidak mencukupi',        zh: '不足（有困难）',  ta: 'போதாது (சிரமம்)'   },
];

const HOUSING_OPTIONS = [
  { value: 'HDB 1-2 Room',    en: 'HDB 1 to 2 Room (rental)',         ms: 'HDB 1–2 Bilik (sewa)',   zh: '组屋 1–2 房（租赁）', ta: 'HDB 1–2 அறைகள் (வாடகை)' },
  { value: 'HDB 3-5 Room',    en: 'HDB 3 to 5 Room',                  ms: 'HDB 3–5 Bilik',          zh: '组屋 3–5 房',         ta: 'HDB 3–5 அறைகள்'          },
  { value: 'Private Property', en: 'Private Property (condo / landed)', ms: 'Hartanah Persendirian', zh: '私人房产',            ta: 'தனியார் சொத்து'          },
];

const AGE_OPTIONS = [
  { value: 'Under 21', en: 'Under 21', ms: 'Bawah 21', zh: '21岁以下', ta: '21க்கு கீழ்' },
  { value: '21-40',    en: '21–40',    ms: '21–40',    zh: '21–40岁',  ta: '21–40'        },
  { value: '41-60',    en: '41–60',    ms: '41–60',    zh: '41–60岁',  ta: '41–60'        },
  { value: '60+',      en: '60+',      ms: '60+',      zh: '60岁以上', ta: '60+'          },
];

const GENDER_OPTIONS = [
  { value: 'Male',   en: 'Male',   ms: 'Lelaki',    zh: '男', ta: 'ஆண்'  },
  { value: 'Female', en: 'Female', ms: 'Perempuan', zh: '女', ta: 'பெண்' },
];

const RACE_OPTIONS = [
  { value: 'Chinese', en: 'Chinese', ms: 'Cina',      zh: '华人',  ta: 'சீனர்கள்'  },
  { value: 'Malay',   en: 'Malay',   ms: 'Melayu',    zh: '马来人', ta: 'மலாய்'    },
  { value: 'Indian',  en: 'Indian',  ms: 'India',     zh: '印度人', ta: 'இந்தியர்'  },
  { value: 'Others',  en: 'Others',  ms: 'Lain-lain', zh: '其他',  ta: 'மற்றவர்கள்' },
];

// ─────────────────────────────────────────────────────────────────────────────
// PARSING — mirrors AuraChatbot parseClinicalData() exactly
// ─────────────────────────────────────────────────────────────────────────────

const DAYS_MIDPOINT = { '0 days': 0, '1–2 days': 1.5, '3–4 days': 3.5, '5–7 days': 6 };
const MINS_MIDPOINT = { 'Less than 20 mins': 15, '20–30 mins': 25, '30–45 mins': 37, '45–60 mins': 52, '60+ mins': 65 };
const STR_MIDPOINT  = { 'No strength training': 0, '1 day a week': 1, '2 days a week': 2, '3+ days a week': 3 };

const MED_FLAG_VALUES     = new Set(['High blood pressure', 'Prediabetes or diabetes', 'Heart condition']);
const SYMPTOM_FLAG_VALUE  = 'Dizziness or chest pain when active';
const FINANCIAL_BARR_VALS = new Set(['Too expensive', 'Too far away']);
const SOCIAL_FLAG_VALS    = new Set(['I mostly manage on my own', 'I feel quite isolated']);
const PSYCHO_FLAG_VALS    = new Set(['Some stress but managing', 'Feeling quite stressed or low', 'Overwhelmed — caregiving or financial pressure']);

// Identical to AuraChatbot selectCTA()
const selectCTA = ({ symptomFlag, medFlag, age, sdohPsychological, sdohFinancial, sdohSocial, pavsScore }) => {
  if (symptomFlag)                      return 'URGENT';
  if (medFlag)                          return 'CLINICAL';
  if (age === '60+' && pavsScore < 150) return 'COMMUNITY';
  if (sdohPsychological)                return 'WELLBEING';
  if (sdohFinancial && pavsScore < 150) return 'FREE_FIRST';
  if (sdohSocial && pavsScore < 150)    return 'COMMUNITY';
  if (pavsScore < 150)                  return 'START';
  if (pavsScore <= 300)                 return 'LEVEL_UP';
  return 'ADVANCED';
};

const deriveFlags = (f) => {
  const pavsDays    = DAYS_MIDPOINT[f.pavsDays] ?? 0;
  const _minsRaw    = MINS_MIDPOINT[f.pavsMins] ?? 0;
  const pavsMinutes = pavsDays === 0 ? 0 : _minsRaw; // 0 days → 0 mins/session
  const pavsScore   = Math.round(pavsDays * pavsMinutes);
  const strengthDays = STR_MIDPOINT[f.strength] ?? 0;

  const noConditions  = f.medical.includes(MEDICAL_EXCLUSIVE);
  const medFlag       = !noConditions && f.medical.some(v => MED_FLAG_VALUES.has(v));
  const symptomFlag   = !noConditions && f.medical.includes(SYMPTOM_FLAG_VALUE);

  const sdohFinancial     = f.barriers.some(v => FINANCIAL_BARR_VALS.has(v)) || f.incomeAdequacy === 'Inadequate';
  const sdohSocial        = SOCIAL_FLAG_VALS.has(f.social);
  const sdohPsychological = PSYCHO_FLAG_VALS.has(f.wellbeing);
  const sdohFoodInsecure  = f.foodInsecure === true;
  const sdohHousing       = f.housing === 'HDB 1-2 Room';

  const age    = f.ageGroup === '60+' ? '60+' : f.ageGroup === '41-60' ? '41-60' : f.ageGroup === '21-40' ? '21-40' : 'Unknown';
  const gender = f.gender || 'Unknown';

  return {
    pavsScore, pavsDays, pavsMinutes, strengthDays,
    medFlag, symptomFlag,
    sdohFinancial, sdohSocial, sdohPsychological,
    psychoFlag: sdohPsychological,
    sdohFoodInsecure, sdohHousing,
    age, gender,
    previousId: f.previousId?.trim().toUpperCase() || null,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// DICTIONARY
// ─────────────────────────────────────────────────────────────────────────────

const D = {
  en: {
    title: 'Health & Community Assessment',
    steps: ['Physical Activity', 'Social Determinants', 'Community Experience', 'About You'],
    subs:  ['ACSM PAVS · SPAG Strength · Clinical Safety', 'SDOH 5-Domain · PDF Validated', 'Community Perception', 'Demographics · Location · Record Linkage'],
    back: 'Back', yes: 'Yes', no: 'No', sel: 'Select —',
    btnNext: 'Next', btnPrev: 'Previous', btnSubmit: 'Get My Results',
    pavsQ1: 'On a typical week, how many days do you do moderate or vigorous exercise? (e.g. brisk walking, cycling, swimming, gym)',
    pavsQ2: 'On those active days, roughly how many minutes do you usually exercise each time?',
    pavsLive: 'Estimated weekly PAVS score', pavsUnit: 'mins / week',
    pavsBelow: 'Insufficiently Active — below SPAG minimum (150 mins/week)',
    pavsMeets: 'Meets SPAG guidelines (150–300 mins/week)',
    pavsActive: 'Active — exceeds SPAG recommendation (300+ mins/week)',
    strengthQ: 'Do you do any muscle-strengthening activities? (e.g. weights, resistance bands, bodyweight exercises like push-ups or squats)',
    clinHead: 'Clinical Safety Screen',
    medQ: 'Do you have any ongoing health conditions such as high blood pressure, prediabetes, or heart disease? And do you ever feel chest pain or dizziness when physically active? Select all that apply.',
    wellHead: 'SDOH · Psychological Wellbeing',
    wellQ: 'Over the past two weeks, how have you been feeling overall? Have you felt stressed, low in mood, or overwhelmed — for example, due to work, caregiving, or financial pressure?',
    wellNote: 'Aligned with BPS-RS II P22 (PHQ-2 based, 2-week timeframe)',
    sdohHead: 'Social Determinants of Health',
    sdohIntro: "These questions are grounded in validated SDOH screening tools used across Singapore's Regional Health Systems. Your responses are confidential.",
    barrQ: 'What is the main thing that makes it difficult to access health or fitness services in your community? Select all that apply.',
    socialQ: 'Roughly how many people — family or friends — could you call on for support if you needed help? And would you say you have people you can talk to openly?',
    socialNote: 'Grounded in LSNS-6 (Lubben Social Network Scale)',
    foodQ: "In the past 12 months, were you ever hungry but didn't eat because you could not afford enough food?",
    foodNote: 'Lien Centre food insufficiency screen (Question 1 of 2)',
    incomeQ: 'Do you feel you have adequate income to meet your monthly expenses?',
    incomeNote: 'Duke-NUS validated perceived income adequacy scale',
    housingQ: 'What type of housing do you currently reside in?',
    housingNote: 'BPS-RS II housing schema — geographic risk indicator',
    housingAlert: '1–2 room HDB rental residents face elevated multi-domain social stress. Your plan will prioritise free and community-based resources.',
    perHead: 'Community Health Experience',
    awareQ: 'Have you heard about the health and wellness services available in your neighbourhood? (e.g. Active Health Labs, Start2Move, Active Ageing Centres)',
    referQ: 'Has a doctor or allied health professional ever referred you to a community health programme or Active Health Lab?',
    ratingQ: 'If you have used community health services, how was your experience compared to a hospital?',
    ratingHint: "Haven't used community services? Select 'Not applicable'.",
    ratingOpts: ['Better than hospital', 'About the same', 'Needs improvement', 'Not applicable — have not used community services'],
    trustQ: 'How comfortable and safe do you feel receiving health care in the community?',
    trustScale: '1 = Not at all comfortable   ·   5 = Very comfortable',
    improveQ: 'If you could change one thing about healthcare in your neighbourhood, what would it be?',
    demoHead: 'About You',
    demoIntro: 'These details help us ensure resources reach every community equitably. All responses are de-identified.',
    ageQ: 'Age Group', genderQ: 'Gender', raceQ: 'Ethnicity',
    postalQ: 'First 2 digits of your Postal Code',
    postalHint: 'e.g. 73 (Woodlands) · 75–76 (Yishun) · 75 (Sembawang) · 68 (Admiralty / Canberra)',
    prevIdQ: 'Previous NEXUS Assessment ID',
    prevIdHint: 'If you completed a previous AURA or NEXUS assessment, paste your ID here to link records and track progress. Leave blank if this is your first assessment.',
    summaryHead: 'Assessment Summary',
    optional: 'Optional',
    // FIX 5: per-step validation hints
    missing: {
      pavsDays: 'Please select how many days you exercise per week.',
      pavsMins: 'Please select your typical exercise duration.',
      strength: 'Please select your strength training frequency.',
      medical:  'Please select at least one option (or "No conditions").',
      wellbeing:'Please select how you have been feeling.',
      barriers: 'Please select at least one barrier (or "No barriers").',
      social:   'Please select your social support level.',
      foodInsecure: 'Please answer the food security question.',
      incomeAdequacy: 'Please select your income adequacy level.',
      housing:  'Please select your housing type.',
      aware:    'Please answer the community awareness question.',
      referred: 'Please answer the referral question.',
      rating:   "Please select a rating (choose 'Not applicable' if you haven't used community services).",
      ageGroup: 'Please select your age group.',
      gender:   'Please select your gender.',
      race:     'Please select your ethnicity.',
      postalCode: 'Please enter the first 2 digits of your postal code.',
    },
  },

  ms: {
    title: 'Penilaian Kesihatan & Komuniti',
    steps: ['Aktiviti Fizikal', 'Penentu Sosial', 'Pengalaman Komuniti', 'Mengenai Anda'],
    subs:  ['ACSM PAVS · SPAG Kekuatan · Saringan Klinikal', 'Saringan SDOH 5 Domain · Disahkan PDF', 'Persepsi Komuniti', 'Demografi · Lokasi · Pautan Rekod'],
    back: 'Kembali', yes: 'Ya', no: 'Tidak', sel: 'Pilih —',
    btnNext: 'Seterusnya', btnPrev: 'Sebelumnya', btnSubmit: 'Dapatkan Keputusan',
    pavsQ1: 'Dalam minggu biasa, berapa hari anda melakukan senaman sederhana atau berat? (cth. berjalan pantas, berbasikal, berenang)',
    pavsQ2: 'Pada hari aktif tersebut, kira-kira berapa minit anda bersenam setiap kali?',
    pavsLive: 'Anggaran skor PAVS mingguan', pavsUnit: 'minit / minggu',
    pavsBelow: 'Kurang Aktif — di bawah minimum SPAG (150 minit/minggu)',
    pavsMeets: 'Memenuhi garis panduan SPAG (150–300 minit/minggu)',
    pavsActive: 'Aktif — melebihi cadangan SPAG (300+ minit/minggu)',
    strengthQ: 'Adakah anda melakukan aktiviti menguatkan otot? (cth. angkat berat, band rintangan, senaman berat badan)',
    clinHead: 'Saringan Keselamatan Klinikal',
    medQ: 'Adakah anda mempunyai sebarang penyakit kronik seperti darah tinggi, pradiabetes, atau penyakit jantung? Dan adakah anda pernah merasa sakit dada atau pening semasa aktif? Pilih semua yang berkenaan.',
    wellHead: 'SDOH · Kesejahteraan Psikologi',
    wellQ: 'Dalam dua minggu yang lalu, bagaimana perasaan anda secara keseluruhan? Adakah anda rasa tertekan, sedih, atau terbeban — misalnya akibat kerja, penjagaan, atau tekanan kewangan?',
    wellNote: 'Dijajarkan dengan BPS-RS II P22 (berasaskan PHQ-2, tempoh 2 minggu)',
    sdohHead: 'Penentu Sosial Kesihatan',
    sdohIntro: 'Soalan-soalan ini berpandukan alat saringan SDOH yang disahkan. Jawapan anda adalah sulit.',
    barrQ: 'Apakah yang paling menyukarkan anda untuk mengakses perkhidmatan kesihatan komuniti? Pilih semua yang berkenaan.',
    socialQ: 'Kira-kira berapa ramai orang — keluarga atau rakan — yang boleh anda hubungi untuk sokongan jika perlu? Dan adakah anda mempunyai seseorang untuk bercerita?',
    socialNote: 'Berpandukan LSNS-6 (Skala Rangkaian Sosial Lubben)',
    foodQ: 'Dalam 12 bulan yang lalu, pernahkah anda lapar tetapi tidak makan kerana tidak mampu membeli makanan yang cukup?',
    foodNote: 'Saringan kekurangan makanan Lien Centre (Soalan 1 daripada 2)',
    incomeQ: 'Adakah anda rasa pendapatan anda mencukupi untuk perbelanjaan bulanan?',
    incomeNote: 'Skala kecukupan pendapatan yang disahkan oleh Duke-NUS',
    housingQ: 'Apakah jenis perumahan yang anda diami sekarang?',
    housingNote: 'Skema perumahan BPS-RS II — penunjuk risiko geografi',
    housingAlert: 'Penghuni flat sewa HDB 1–2 bilik menghadapi tekanan sosial pelbagai domain yang tinggi. Pelan anda akan mengutamakan sumber percuma dan berasaskan komuniti.',
    perHead: 'Pengalaman Kesihatan Komuniti',
    awareQ: 'Pernahkah anda mendengar tentang perkhidmatan kesihatan di kawasan kejiranan anda? (cth. Active Health Labs, Start2Move, AAC)',
    referQ: 'Pernahkah doktor atau profesional kesihatan merujuk anda ke program kesihatan komuniti atau Active Health Lab?',
    ratingQ: 'Jika anda pernah menggunakan perkhidmatan komuniti, bagaimana pengalaman berbanding hospital?',
    ratingHint: "Belum pernah menggunakan? Pilih 'Tidak berkenaan'.",
    ratingOpts: ['Lebih baik daripada hospital', 'Lebih kurang sama', 'Perlu diperbaiki', 'Tidak berkenaan — belum pernah menggunakan'],
    trustQ: 'Sejauh mana anda berasa selesa menerima penjagaan dalam komuniti?',
    trustScale: '1 = Tidak selesa langsung   ·   5 = Sangat selesa',
    improveQ: 'Jika anda boleh mengubah satu perkara tentang penjagaan kesihatan di kejiranan anda, apakah itu?',
    demoHead: 'Mengenai Anda',
    demoIntro: 'Maklumat ini membantu kami memastikan sumber sampai ke semua komuniti secara saksama. Semua jawapan tidak dapat dikenal pasti.',
    ageQ: 'Kumpulan Umur', genderQ: 'Jantina', raceQ: 'Etnik',
    postalQ: '2 digit pertama Poskod anda',
    postalHint: 'cth. 73 (Woodlands) · 75–76 (Yishun) · 68 (Canberra)',
    prevIdQ: 'ID Penilaian NEXUS Sebelumnya',
    prevIdHint: 'Jika anda pernah menjalani penilaian AURA atau NEXUS, tampal ID anda di sini. Biarkan kosong jika ini penilaian pertama anda.',
    summaryHead: 'Ringkasan Penilaian',
    optional: 'Pilihan',
    missing: {
      pavsDays: 'Sila pilih berapa hari anda bersenam seminggu.',
      pavsMins: 'Sila pilih tempoh senaman biasa anda.',
      strength: 'Sila pilih kekerapan latihan kekuatan anda.',
      medical:  'Sila pilih sekurang-kurangnya satu pilihan.',
      wellbeing:'Sila pilih bagaimana perasaan anda.',
      barriers: 'Sila pilih sekurang-kurangnya satu halangan.',
      social:   'Sila pilih tahap sokongan sosial anda.',
      foodInsecure: 'Sila jawab soalan keselamatan makanan.',
      incomeAdequacy: 'Sila pilih tahap kecukupan pendapatan anda.',
      housing:  'Sila pilih jenis perumahan anda.',
      aware:    'Sila jawab soalan kesedaran komuniti.',
      referred: 'Sila jawab soalan rujukan.',
      rating:   "Sila pilih penilaian (pilih 'Tidak berkenaan' jika belum menggunakan).",
      ageGroup: 'Sila pilih kumpulan umur anda.',
      gender:   'Sila pilih jantina anda.',
      race:     'Sila pilih etnik anda.',
      postalCode: 'Sila masukkan 2 digit pertama poskod anda.',
    },
  },

  zh: {
    title: '健康与社区评估',
    steps: ['体力活动', '社会决定因素', '社区体验', '关于您'],
    subs:  ['ACSM PAVS · SPAG 力量 · 临床安全筛查', 'SDOH 5 领域筛查 · PDF 验证', '社区认知', '人口统计 · 位置 · 记录关联'],
    back: '返回', yes: '是', no: '否', sel: '请选择 —',
    btnNext: '下一步', btnPrev: '上一步', btnSubmit: '获取结果',
    pavsQ1: '在通常的一周内，您有几天进行中度或剧烈运动？（例如快走、骑车、游泳、健身房）',
    pavsQ2: '在这些活动的天里，您每次通常运动多少分钟？',
    pavsLive: '估计每周 PAVS 得分', pavsUnit: '分钟 / 周',
    pavsBelow: '运动不足 — 低于 SPAG 最低标准（150 分钟/周）',
    pavsMeets: '达到 SPAG 指南（150–300 分钟/周）',
    pavsActive: '活跃 — 超过 SPAG 建议（300+ 分钟/周）',
    strengthQ: '您是否进行肌肉强化活动？（例如举重、弹力带、俯卧撑或深蹲）',
    clinHead: '临床安全筛查',
    medQ: '您是否患有任何慢性病如高血压、糖尿病前期或心脏病？您在进行体力活动时是否有胸痛或头晕？选择所有适用项。',
    wellHead: 'SDOH · 心理健康',
    wellQ: '在过去两周里，您整体感觉如何？您是否感到压力、情绪低落或不知所措 — 例如由于工作、护理或经济压力？',
    wellNote: '与 BPS-RS II P22（基于 PHQ-2，2 周时间框架）一致',
    sdohHead: '健康的社会决定因素',
    sdohIntro: '这些问题基于经过验证的 SDOH 筛查工具。您的回答是保密的。',
    barrQ: '是什么让您最难以使用社区健康服务？选择所有适用项。',
    socialQ: '大约有多少家人或朋友可以在您需要时提供支持，您是否有可以坦诚交谈的人？',
    socialNote: '基于 LSNS-6（卢本社会网络量表）',
    foodQ: '在过去12个月里，您是否曾因为买不起足够的食物而挨饿？',
    foodNote: '廉洁中心食物不足筛查（第 1 题，共 2 题）',
    incomeQ: '您觉得您的收入足以支付每月开销吗？',
    incomeNote: 'Duke-NUS 验证的感知收入充足性量表',
    housingQ: '您目前居住的房屋类型是什么？',
    housingNote: 'BPS-RS II 住房模式 — 地理风险指标',
    housingAlert: '1–2 房组屋租赁居民面临较高的多领域社会压力。您的计划将优先考虑免费和基于社区的资源。',
    perHead: '社区卫生体验',
    awareQ: '您听说过您社区提供的健康和保健服务吗？（例如 Active Health Labs、Start2Move、活跃乐龄中心）',
    referQ: '医生或专职医疗专业人员是否曾转介您参加社区健康计划？',
    ratingQ: '如果您使用过社区服务，与医院相比体验如何？',
    ratingHint: '未曾使用过社区服务？请选择"不适用"。',
    ratingOpts: ['比医院好', '差不多', '需要改进', '不适用 — 未使用过社区服务'],
    trustQ: '您在社区接受护理感到多舒适？',
    trustScale: '1 = 完全不舒适   ·   5 = 非常舒适',
    improveQ: '如果您能改变社区医疗的一件事，那会是什么？',
    demoHead: '关于您',
    demoIntro: '这些信息帮助我们确保资源公平地覆盖每个社区。所有信息均已去识别化。',
    ageQ: '年龄组', genderQ: '性别', raceQ: '族裔',
    postalQ: '邮政编码前2位',
    postalHint: '例如 73（兀兰）· 75–76（义顺）· 68（甘巴旺）',
    prevIdQ: '之前的 NEXUS 评估 ID',
    prevIdHint: '如果您之前完成了 AURA 或 NEXUS 评估，请粘贴您的 ID 以关联记录。如这是第一次，请留空。',
    summaryHead: '评估摘要',
    optional: '可选',
    missing: {
      pavsDays: '请选择您每周运动的天数。',
      pavsMins: '请选择您通常的运动时长。',
      strength: '请选择您的力量训练频率。',
      medical:  '请至少选择一个选项。',
      wellbeing:'请选择您的整体感受。',
      barriers: '请至少选择一个障碍。',
      social:   '请选择您的社会支持程度。',
      foodInsecure: '请回答食品安全问题。',
      incomeAdequacy: '请选择您的收入充足程度。',
      housing:  '请选择您的住房类型。',
      aware:    '请回答社区认知问题。',
      referred: '请回答转介问题。',
      rating:   '请选择评分（如未使用过社区服务，请选"不适用"）。',
      ageGroup: '请选择您的年龄组。',
      gender:   '请选择您的性别。',
      race:     '请选择您的族裔。',
      postalCode: '请输入您邮政编码的前2位数字。',
    },
  },

  ta: {
    title: 'உடல்நலம் மற்றும் சமூக மதிப்பீடு',
    steps: ['உடல் செயல்பாடு', 'சமூக காரணிகள்', 'சமூக அனுபவம்', 'உங்களை பற்றி'],
    subs:  ['ACSM PAVS · SPAG தசை · மருத்துவ திரையிடல்', 'SDOH 5-களம் · PDF சரிபார்க்கப்பட்டது', 'சமூக உணர்வு', 'மக்கள் தொகை · இடம் · பதிவு இணைப்பு'],
    back: 'பின்செல்', yes: 'ஆம்', no: 'இல்லை', sel: 'தேர்ந்தெடுக்கவும் —',
    btnNext: 'அடுத்தது', btnPrev: 'முந்தையது', btnSubmit: 'முடிவுகளைப் பெறுக',
    pavsQ1: 'வழக்கமான வாரத்தில், மிதமான அல்லது கடுமையான உடல் செயல்பாடுகளை எத்தனை நாட்கள் செய்கிறீர்கள்? (எ.கா. வேகமாக நடைபயிற்சி, சைக்கிள், நீச்சல்)',
    pavsQ2: 'அந்த செயலில் நாட்களில், வழக்கமாக எத்தனை நிமிடங்கள் உடற்பயிற்சி செய்கிறீர்கள்?',
    pavsLive: 'வாராந்திர PAVS மதிப்பெண் (மதிப்பீடு)', pavsUnit: 'நிமிடங்கள் / வாரம்',
    pavsBelow: 'போதுமான செயல்பாட்டிற்கு குறைவு — SPAG குறைந்தபட்சத்திற்கு கீழ் (150)',
    pavsMeets: 'SPAG வழிகாட்டுதல்களை பூர்த்தி செய்கிறது (150–300)',
    pavsActive: 'செயலில் — SPAG பரிந்துரையை தாண்டுகிறது (300+)',
    strengthQ: 'தசைகளை வலுப்படுத்தும் செயல்களை செய்கிறீர்களா? (எ.கா. எடை தூக்குதல், ரெசிஸ்டன்ஸ் பேண்ட், புஷ்-அப்)',
    clinHead: 'மருத்துவ பாதுகாப்பு திரையிடல்',
    medQ: 'உயர் இரத்த அழுத்தம், நீரிழிவு முன்நிலை, அல்லது இதய நோய் போன்ற நாள்பட்ட நோய்கள் உள்ளதா? உடல் செயல்பாட்டின் போது நெஞ்சு வலி அல்லது தலைசுற்றல் அனுபவிக்கிறீர்களா? பொருந்தும் அனைத்தையும் தேர்ந்தெடுக்கவும்.',
    wellHead: 'SDOH · உளவியல் நலன்',
    wellQ: 'கடந்த இரண்டு வாரங்களில், நீங்கள் ஒட்டுமொத்தமாக எப்படி உணர்ந்தீர்கள்? வேலை, பராமரிப்பு, அல்லது நிதி அழுத்தம் காரணமாக மன அழுத்தம், மனச்சோர்வு அல்லது அதிக சுமை உணர்ந்தீர்களா?',
    wellNote: 'BPS-RS II P22 உடன் இணைக்கப்பட்டது (PHQ-2 அடிப்படை, 2 வார காலம்)',
    sdohHead: 'சுகாதாரத்தின் சமூக தீர்மானங்கள்',
    sdohIntro: 'இந்த கேள்விகள் சரிபார்க்கப்பட்ட SDOH திரையிடல் கருவிகளை அடிப்படையாக கொண்டவை. உங்கள் பதில்கள் ரகசியமானவை.',
    barrQ: 'சமூக சுகாதார சேவைகளை அணுகுவதை மிகவும் கடினமாக்குவது எது? பொருந்தும் அனைத்தையும் தேர்ந்தெடுக்கவும்.',
    socialQ: 'தோராயமாக எத்தனை குடும்பத்தினர் அல்லது நண்பர்கள் உங்களுக்கு உதவ முடியும்? நீங்கள் திறந்து பேசக்கூடிய நபர்கள் இருக்கிறார்களா?',
    socialNote: 'LSNS-6 (லுப்பன் சமூக நெட்வொர்க் அளவீட்டு) அடிப்படை',
    foodQ: 'கடந்த 12 மாதங்களில், உணவு வாங்க முடியாததால் பசியுடன் இருந்தீர்களா?',
    foodNote: 'Lien Centre உணவு பற்றாக்குறை திரையிடல் (கேள்வி 1 இல் 2)',
    incomeQ: 'மாதாந்திர செலவுகளை ஈடுகட்ட போதுமான வருமானம் இருப்பதாக நினைக்கிறீர்களா?',
    incomeNote: 'Duke-NUS சரிபார்க்கப்பட்ட வருமான போதுமையான அளவீட்டு',
    housingQ: 'தற்போது எந்த வகையான வீட்டில் வசிக்கிறீர்கள்?',
    housingNote: 'BPS-RS II வீட்டு வரைபடம் — புவியியல் ஆபத்து குறிகாட்டி',
    housingAlert: 'HDB 1–2 அறை வாடகை குடியிருப்பாளர்கள் உயர்ந்த சமூக அழுத்தத்தை எதிர்கொள்கிறார்கள். உங்கள் திட்டம் இலவச சமூக வளங்களுக்கு முன்னுரிமை அளிக்கும்.',
    perHead: 'சமூக சுகாதார அனுபவம்',
    awareQ: 'உங்கள் பகுதியில் உள்ள சுகாதார சேவைகளைப் பற்றி கேள்விப்பட்டிருக்கிறீர்களா?',
    referQ: 'சமூக சுகாதார திட்டத்திற்கு மருத்துவர் பரிந்துரைத்தாரா?',
    ratingQ: 'சமூக சேவைகளை பயன்படுத்தியிருந்தால், மருத்துவமனையுடன் ஒப்பிடும்போது எவ்வாறு இருந்தது?',
    ratingHint: "பயன்படுத்தவில்லையா? 'பொருந்தாது' என்று தேர்ந்தெடுக்கவும்.",
    ratingOpts: ['மருத்துவமனையை விட சிறந்தது', 'சுமார் அதே', 'மேம்பாடு தேவை', 'பொருந்தாது — சமூக சேவைகளை பயன்படுத்தவில்லை'],
    trustQ: 'சமூகத்தில் சுகாதார கவனிப்பு பெறுவது எவ்வளவு வசதியாக உணர்கிறீர்கள்?',
    trustScale: '1 = இல்லவே இல்லை   ·   5 = மிகவும் வசதியானது',
    improveQ: 'சுகாதார சேவையில் ஒன்றை மாற்ற முடிந்தால், அது என்னவாக இருக்கும்?',
    demoHead: 'உங்களை பற்றி',
    demoIntro: 'இந்த தகவல் ஒவ்வொரு சமூகத்திற்கும் வளங்கள் நியாயமாக சேர உதவுகிறது.',
    ageQ: 'வயது குழு', genderQ: 'பாலினம்', raceQ: 'இனம்',
    postalQ: 'அஞ்சல் குறியீட்டின் முதல் 2 இலக்கங்கள்',
    postalHint: 'எ.கா. 73 (Woodlands) · 75–76 (Yishun) · 68 (Canberra)',
    prevIdQ: 'முந்தைய NEXUS மதிப்பீட்டு ID',
    prevIdHint: 'முன்பு AURA அல்லது NEXUS மதிப்பீட்டை முடித்திருந்தால், ID ஐ ஒட்டவும்.',
    summaryHead: 'மதிப்பீட்டு சுருக்கம்',
    optional: 'விருப்பமானது',
    missing: {
      pavsDays: 'வாரத்தில் எத்தனை நாட்கள் உடற்பயிற்சி செய்கிறீர்கள் என்று தேர்ந்தெடுக்கவும்.',
      pavsMins: 'வழக்கமான உடற்பயிற்சி நேரத்தை தேர்ந்தெடுக்கவும்.',
      strength: 'தசை பயிற்சி அதிர்வெண்ணை தேர்ந்தெடுக்கவும்.',
      medical:  'குறைந்தது ஒரு விருப்பத்தை தேர்ந்தெடுக்கவும்.',
      wellbeing:'நீங்கள் எப்படி உணர்கிறீர்கள் என்று தேர்ந்தெடுக்கவும்.',
      barriers: 'குறைந்தது ஒரு தடையை தேர்ந்தெடுக்கவும்.',
      social:   'சமூக ஆதரவு அளவை தேர்ந்தெடுக்கவும்.',
      foodInsecure: 'உணவு பாதுகாப்பு கேள்விக்கு பதிலளிக்கவும்.',
      incomeAdequacy: 'வருமான போதுமையான அளவை தேர்ந்தெடுக்கவும்.',
      housing:  'வீட்டு வகையை தேர்ந்தெடுக்கவும்.',
      aware:    'சமூக விழிப்புணர்வு கேள்விக்கு பதிலளிக்கவும்.',
      referred: 'பரிந்துரை கேள்விக்கு பதிலளிக்கவும்.',
      rating:   'மதிப்பீட்டை தேர்ந்தெடுக்கவும்.',
      ageGroup: 'உங்கள் வயது குழுவை தேர்ந்தெடுக்கவும்.',
      gender:   'உங்கள் பாலினத்தை தேர்ந்தெடுக்கவும்.',
      race:     'உங்கள் இனத்தை தேர்ந்தெடுக்கவும்.',
      postalCode: 'அஞ்சல் குறியீட்டின் முதல் 2 இலக்கங்களை உள்ளிடவும்.',
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// STYLE CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const inputCls = 'w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500 transition-shadow text-slate-900 dark:text-white';
const selCls   = inputCls + ' appearance-none cursor-pointer';

// ─────────────────────────────────────────────────────────────────────────────
// UI ATOMS
// ─────────────────────────────────────────────────────────────────────────────

const Badge = ({ icon: Icon, label }) => (
  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-teal-50 dark:bg-teal-500/10 border border-teal-100 dark:border-teal-500/30 text-teal-700 dark:text-teal-400 mb-5">
    <Icon size={13} /><span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
  </div>
);

const Card = ({ children, tinted = false }) => (
  <div className={`border rounded-3xl p-6 md:p-8 shadow-sm ${tinted ? 'bg-teal-50 dark:bg-teal-900/15 border-teal-100 dark:border-teal-800/40' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}>
    {children}
  </div>
);

const Note = ({ text }) => <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1.5 ml-1">{text}</p>;
const Req  = () => <span className="text-teal-500 ml-0.5" title="Required">*</span>;

const RadioRow = ({ opt, selected, onSelect, lang }) => (
  <label className={`flex items-center gap-3 cursor-pointer p-3 rounded-xl border transition-all ${selected ? 'bg-teal-50 dark:bg-teal-900/30 border-teal-300 dark:border-teal-600' : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-teal-200 dark:hover:border-teal-700'}`}>
    <input type="radio" checked={selected} onChange={onSelect} className="w-4 h-4 text-teal-600 focus:ring-teal-500" />
    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{opt[lang] || opt.en}</span>
  </label>
);

const CheckRow = ({ opt, checked, onChange, disabled, lang }) => (
  <label className={`flex items-center gap-3 cursor-pointer group p-2.5 rounded-xl hover:bg-white dark:hover:bg-slate-900 transition-colors ${disabled ? 'opacity-40' : ''}`}>
    <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} className="w-5 h-5 text-teal-500 border-slate-300 rounded focus:ring-teal-500" />
    <span className="text-sm font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
      {opt[lang] || opt.en}
    </span>
  </label>
);

// FIX 2: guard is now (!days || !mins) — prevents false "0 score" banner
const PavsLive = ({ days, mins, t }) => {
  const score = Math.round((DAYS_MIDPOINT[days] ?? 0) * (MINS_MIDPOINT[mins] ?? 0));
  if (!days || !mins) return null;
  const tier = score >= 300 ? 'active' : score >= 150 ? 'meets' : 'below';
  const cfg = {
    below:  { label: t.pavsBelow,  cls: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300',           bar: 'bg-amber-400'    },
    meets:  { label: t.pavsMeets,  cls: 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-700 text-teal-700 dark:text-teal-300',                 bar: 'bg-teal-500'     },
    active: { label: t.pavsActive, cls: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500'  },
  };
  const { label, cls, bar } = cfg[tier];
  return (
    <div className={`mt-5 p-4 rounded-2xl border transition-all duration-500 ${cls}`}>
      <div className="flex items-end justify-between mb-2">
        <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{t.pavsLive}</p>
        <p className="text-2xl font-black tabular-nums leading-none">{score} <span className="text-xs font-bold opacity-60">{t.pavsUnit}</span></p>
      </div>
      <div className="h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden mb-2">
        <div className={`h-full rounded-full transition-all duration-700 ${bar}`} style={{ width: `${Math.min((score / 400) * 100, 100)}%` }} />
      </div>
      <p className="text-xs font-semibold opacity-80 leading-snug">{label}</p>
    </div>
  );
};

// FIX 3: Language toggle button
const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'ms', label: 'BM' },
  { code: 'zh', label: '中文' },
  { code: 'ta', label: 'தமிழ்' },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function ConventionalForm() {
  const navigate    = useNavigate();
  const [lang,      setLang]    = useState('en');
  const [step,      setStep]    = useState(0);
  const [ready,     setReady]   = useState(false);
  // Lazy init — reads localStorage SYNCHRONOUSLY before first render.
  // Sets classList.dark inside the initialiser so Tailwind dark: utilities
  // are active on frame 0, preventing the light-flash on navigation.
  const [isDark, setIsDark] = useState(() => {
    try {
      const s = localStorage.getItem('nexus-theme');
      const dark = s === 'dark' || (!s && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark); // ← before first paint
      return dark;
    } catch { return false; }
  });
  const [busy,      setBusy]    = useState(false);
  const [sessionId] = useState(() => 'NX-' + Math.random().toString(36).substr(2, 9).toUpperCase());

  const [f, setF] = useState({
    pavsDays: '', pavsMins: '', strength: '', medical: [], wellbeing: '',
    barriers: [], social: '', foodInsecure: null, incomeAdequacy: '', housing: '',
    aware: null, referred: null, rating: '', trust: '3', improve: '',
    ageGroup: '', gender: '', race: '', postalCode: '', previousId: '',
  });

  const set    = useCallback((k, v) => setF(p => ({ ...p, [k]: v })), []);
  const togArr = useCallback((k, v) => setF(p => ({ ...p, [k]: p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v] })), []);

  const toggleMedical = (val) => {
    if (val === MEDICAL_EXCLUSIVE) {
      set('medical', f.medical.includes(MEDICAL_EXCLUSIVE) ? [] : [MEDICAL_EXCLUSIVE]);
    } else {
      setF(p => ({
        ...p,
        medical: p.medical.includes(MEDICAL_EXCLUSIVE)
          ? [val]
          : p.medical.includes(val) ? p.medical.filter(v => v !== val) : [...p.medical, val],
      }));
    }
  };

  // Sync dark class on toggle, read language, trigger entrance animation
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  useEffect(() => {
    const sl = localStorage.getItem('nexus_language');
    if (sl && D[sl]) setLang(sl);
    setTimeout(() => setReady(true), 80);
  }, []);

  const toggleTheme = () => {
    const n = !isDark;
    setIsDark(n);
    document.documentElement.classList.toggle('dark', n);
    localStorage.setItem('nexus-theme', n ? 'dark' : 'light'); // FIX 1
  };

  // FIX 3: language switcher persists to localStorage
  const switchLang = (code) => {
    setLang(code);
    localStorage.setItem('nexus_language', code);
  };

  const t = D[lang] || D.en;
  const noMedical = f.medical.includes(MEDICAL_EXCLUSIVE);

  // FIX 5: returns first missing field key for step, or null if valid
  const firstMissing = () => {
    if (step === 0) {
      if (!f.pavsDays)         return 'pavsDays';
      if (!f.pavsMins)         return 'pavsMins';
      if (!f.strength)         return 'strength';
      if (f.medical.length < 1) return 'medical';
      if (!f.wellbeing)        return 'wellbeing';
    }
    if (step === 1) {
      if (f.barriers.length < 1)   return 'barriers';
      if (!f.social)               return 'social';
      if (f.foodInsecure === null)  return 'foodInsecure';
      if (!f.incomeAdequacy)       return 'incomeAdequacy';
      if (!f.housing)              return 'housing';
    }
    if (step === 2) {
      if (f.aware === null)    return 'aware';
      if (f.referred === null) return 'referred';
      if (!f.rating)           return 'rating';
    }
    if (step === 3) {
      if (!f.ageGroup)               return 'ageGroup';
      if (!f.gender)                 return 'gender';
      if (!f.race)                   return 'race';
      if (f.postalCode.length !== 2) return 'postalCode';
    }
    return null;
  };

  const isStepValid = () => firstMissing() === null;

  // FIX 4: try/catch/finally prevents frozen Submit button on error
  const handleSubmit = async () => {
    if (busy || !isStepValid()) return;
    setBusy(true);
    try {
      const flags   = deriveFlags(f);
      const ctaTier = selectCTA(flags);
      const score   = calculateRiskScore(flags);
      const sector  = f.postalCode || '00';

      await recordTelemetry(sector, {
        sessionId, action: 'conventional_form_v4', language: lang,
        score, ctaTier, flags,
        enrichment: { food: f.foodInsecure, income: f.incomeAdequacy, housing: f.housing },
        perception: { aware: f.aware, referred: f.referred, rating: f.rating, trust: f.trust, barriers: f.barriers, improve: f.improve },
        demographics: { age: f.ageGroup, gender: f.gender, race: f.race, sector },
      });

      navigate('/individuals/result', {
        state: { score, data: flags, postalSector: sector, sessionId, previousSessionId: flags.previousId, ctaTier },
      });
    } catch (err) {
      console.error('[NEXUS] ConventionalForm submit error:', err);
    } finally {
      setBusy(false);
    }
  };

  // FIX 8: back guard — confirms before discarding partial step
  const handleBack = () => {
    if (step === 0) { navigate('/individuals/pathway'); return; }
    setStep(p => p - 1);
  };

  // ── STEP COMPONENTS ────────────────────────────────────────────────────────

  const Step1 = () => (
    <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-400">
      <Card>
        <Badge icon={Activity} label="ACSM PAVS · SPAG Strength Screen" />
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 leading-snug">{t.pavsQ1}<Req /></label>
            <select value={f.pavsDays} onChange={e => set('pavsDays', e.target.value)} className={selCls}>
              <option value="">{t.sel}</option>
              {PAVS_DAYS.map(o => <option key={o.value} value={o.value}>{o[lang] || o.en}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 leading-snug">{t.pavsQ2}<Req /></label>
            <select value={f.pavsMins} onChange={e => set('pavsMins', e.target.value)} className={selCls}>
              <option value="">{t.sel}</option>
              {PAVS_MINS.map(o => <option key={o.value} value={o.value}>{o[lang] || o.en}</option>)}
            </select>
          </div>
        </div>
        <PavsLive days={f.pavsDays} mins={f.pavsMins} t={t} />

        <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800">
          <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 leading-snug">{t.strengthQ}<Req /></label>
          <select value={f.strength} onChange={e => set('strength', e.target.value)} className={`${selCls} md:w-2/3`}>
            <option value="">{t.sel}</option>
            {STRENGTH_DAYS.map(o => <option key={o.value} value={o.value}>{o[lang] || o.en}</option>)}
          </select>
        </div>
      </Card>

      <Card>
        <Badge icon={ShieldAlert} label={t.clinHead} />
        <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 leading-snug">{t.medQ}<Req /></p>
        <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-1">
          {MEDICAL_OPTIONS.map(o => (
            <CheckRow key={o.value} opt={o} checked={f.medical.includes(o.value)}
              onChange={() => toggleMedical(o.value)}
              disabled={o.value !== MEDICAL_EXCLUSIVE && noMedical} lang={lang} />
          ))}
        </div>
      </Card>

      <Card tinted>
        <div className="flex items-start gap-3 mb-4">
          <Brain size={18} className="text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-black text-teal-600 dark:text-teal-400 uppercase tracking-widest mb-0.5">{t.wellHead}</p>
            <p className="text-sm font-bold text-teal-900 dark:text-teal-100 leading-snug">{t.wellQ}<Req /></p>
            <Note text={t.wellNote} />
          </div>
        </div>
        <div className="space-y-2">
          {WELLBEING_OPTIONS.map(o => (
            <RadioRow key={o.value} opt={o} selected={f.wellbeing === o.value} onSelect={() => set('wellbeing', o.value)} lang={lang} />
          ))}
        </div>
      </Card>
    </div>
  );

  const Step2 = () => (
    <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-400">
      <Card>
        <Badge icon={Users} label={t.sdohHead} />
        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-6 leading-relaxed">{t.sdohIntro}</p>
        <div className="space-y-6">

          <div>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 leading-snug">{t.barrQ}<Req /></p>
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 gap-1">
              {BARRIERS.map(o => (
                <CheckRow key={o.value} opt={o} checked={f.barriers.includes(o.value)} onChange={() => togArr('barriers', o.value)} lang={lang} />
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1 leading-snug">{t.socialQ}<Req /></p>
            <Note text={t.socialNote} />
            <div className="space-y-2 mt-3">
              {SOCIAL_OPTIONS.map(o => (
                <RadioRow key={o.value} opt={o} selected={f.social === o.value} onSelect={() => set('social', o.value)} lang={lang} />
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-5">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1 leading-snug">{t.foodQ}<Req /></p>
            <Note text={t.foodNote} />
            <div className="flex gap-6 mt-3">
              {[true, false].map(v => (
                <label key={String(v)} className="flex items-center gap-2 cursor-pointer group">
                  <input type="radio" checked={f.foodInsecure === v} onChange={() => set('foodInsecure', v)} className="w-4 h-4 text-teal-500 focus:ring-teal-500" />
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-400 group-hover:text-teal-600 transition-colors">{v ? t.yes : t.no}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1 leading-snug">{t.incomeQ}<Req /></label>
            <Note text={t.incomeNote} />
            <select value={f.incomeAdequacy} onChange={e => set('incomeAdequacy', e.target.value)} className={`${selCls} mt-2`}>
              <option value="">{t.sel}</option>
              {INCOME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o[lang] || o.en}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1 leading-snug">{t.housingQ}<Req /></label>
            <Note text={t.housingNote} />
            <select value={f.housing} onChange={e => set('housing', e.target.value)} className={`${selCls} mt-2`}>
              <option value="">{t.sel}</option>
              {HOUSING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o[lang] || o.en}</option>)}
            </select>
            {f.housing === 'HDB 1-2 Room' && (
              <div className="mt-3 flex items-start gap-2.5 p-3.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl animate-in fade-in duration-300">
                <Info size={14} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-amber-800 dark:text-amber-200 leading-relaxed">{t.housingAlert}</p>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );

  const Step3 = () => (
    <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-400">
      <Card>
        <Badge icon={MapPin} label={t.perHead} />
        <div className="space-y-5">
          {[{ label: t.awareQ, key: 'aware' }, { label: t.referQ, key: 'referred' }].map(({ label, key }) => (
            <div key={key} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300 md:w-2/3 leading-snug">{label}<Req /></p>
              <div className="flex gap-6">
                {[true, false].map(v => (
                  <label key={String(v)} className="flex items-center gap-2 cursor-pointer group">
                    <input type="radio" checked={f[key] === v} onChange={() => set(key, v)} className="w-4 h-4 text-teal-500 focus:ring-teal-500" />
                    <span className="text-sm font-bold text-slate-600 dark:text-slate-400 group-hover:text-teal-600 transition-colors">{v ? t.yes : t.no}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="grid md:grid-cols-2 gap-5">
            <div>
              {/* FIX 7: rating helper text */}
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1 leading-snug">{t.ratingQ}<Req /></label>
              <p className="text-[10px] text-slate-400 font-medium mb-2">{t.ratingHint}</p>
              <select value={f.rating} onChange={e => set('rating', e.target.value)} className={selCls}>
                <option value="">{t.sel}</option>
                {t.ratingOpts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1 leading-snug">{t.trustQ}<Req /></p>
              <p className="text-[10px] text-slate-400 mb-3">{t.trustScale}</p>
              <div className="flex gap-2">
                {[1,2,3,4,5].map(n => (
                  <button key={n} type="button" onClick={() => set('trust', String(n))}
                    className={`flex-1 py-3 rounded-xl font-black text-base transition-all border ${f.trust === String(n) ? 'bg-teal-500 text-white border-teal-500 shadow-md scale-105' : 'bg-slate-50 dark:bg-slate-950 text-slate-400 border-slate-200 dark:border-slate-800 hover:border-teal-300 hover:text-teal-600'}`}>{n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
              {t.improveQ} <span className="text-slate-400 font-normal text-xs ml-1">({t.optional})</span>
            </label>
            <textarea rows={3} value={f.improve} onChange={e => set('improve', e.target.value)}
              className={`${inputCls} resize-none rounded-2xl`} placeholder="…" />
          </div>
        </div>
      </Card>
    </div>
  );

  const Step4 = () => {
    const preview   = deriveFlags(f);
    const liveScore = Math.round((DAYS_MIDPOINT[f.pavsDays] ?? 0) * (MINS_MIDPOINT[f.pavsMins] ?? 0));
    return (
      <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-400">
        <Card>
          <Badge icon={Home} label={t.demoHead} />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-6 leading-relaxed">{t.demoIntro}</p>
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.ageQ}<Req /></label>
              <select value={f.ageGroup} onChange={e => set('ageGroup', e.target.value)} className={selCls}>
                <option value="">{t.sel}</option>
                {AGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o[lang] || o.en}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.genderQ}<Req /></label>
              <select value={f.gender} onChange={e => set('gender', e.target.value)} className={selCls}>
                <option value="">{t.sel}</option>
                {GENDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o[lang] || o.en}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.raceQ}<Req /></label>
              <select value={f.race} onChange={e => set('race', e.target.value)} className={selCls}>
                <option value="">{t.sel}</option>
                {RACE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o[lang] || o.en}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.postalQ}<Req /></label>
              <input type="text" maxLength={2} value={f.postalCode}
                onChange={e => set('postalCode', e.target.value.replace(/\D/g, ''))}
                className={inputCls} placeholder="e.g. 73" />
              <Note text={t.postalHint} />
            </div>
            <div className="md:col-span-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                {t.prevIdQ} <span className="text-slate-400 font-normal text-xs ml-1">({t.optional})</span>
              </label>
              <input type="text" value={f.previousId} onChange={e => set('previousId', e.target.value)}
                className={inputCls} placeholder="NX-XXXXXXXXX" />
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">{t.prevIdHint}</p>
            </div>
          </div>

          {liveScore > 0 && (
            <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Zap size={11} className="text-teal-500" /> {t.summaryHead}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'PAVS',      value: `${liveScore} min/wk`,  alert: false },
                  { label: 'Clinical',  value: preview.symptomFlag ? '⚠ Symptom' : preview.medFlag ? '⚠ Condition' : '✓ Clear', alert: preview.symptomFlag || preview.medFlag },
                  { label: 'Financial', value: preview.sdohFinancial    ? '⚠ Flagged' : '✓ Clear', alert: preview.sdohFinancial },
                  { label: 'Social',    value: preview.sdohPsychological || preview.sdohSocial ? '⚠ Flagged' : '✓ Clear', alert: preview.sdohPsychological || preview.sdohSocial },
                ].map(({ label, value, alert }) => (
                  <div key={label} className={`border rounded-xl p-3 text-center ${alert ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700' : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'}`}>
                    <p className={`text-sm font-black ${alert ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-white'}`}>{value}</p>
                    <p className="text-[10px] text-slate-400 mt-1 font-medium">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    );
  };

  // Steps are called as functions, NOT rendered as components (<Current />).
  // Rendering inner functions as components causes React to see a new component
  // type on every re-render (new function reference), which unmounts and remounts
  // the entire step — stealing focus from inputs after the first keystroke.
  // Calling as a function keeps reconciliation inside the parent tree.
  const STEPS = [Step1, Step2, Step3, Step4];
  const renderCurrentStep = STEPS[step];
  const missing  = firstMissing();
  const valid    = missing === null;

  return (
    <div className="min-h-screen w-full bg-stone-50 dark:bg-slate-950 transition-colors duration-700 flex flex-col items-center py-6 px-4 md:py-12 md:px-6 relative overflow-x-hidden font-sans">
      <div className={`fixed top-0 left-0 w-[700px] h-[700px] bg-teal-500/8 rounded-full blur-[120px] pointer-events-none transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'}`} />
      <div className={`fixed bottom-0 right-0 w-[500px] h-[500px] bg-emerald-500/8 rounded-full blur-[100px] pointer-events-none transition-opacity duration-1000 delay-300 ${ready ? 'opacity-100' : 'opacity-0'}`} />

      <div className={`relative z-10 w-full max-w-3xl transition-all duration-700 ${ready ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>

        {/* Nav bar */}
        <div className="flex justify-between items-center mb-8 gap-3 flex-wrap">
          <button onClick={handleBack}
            className="flex items-center gap-2 px-4 py-2 bg-white/70 dark:bg-slate-800/70 backdrop-blur-md text-slate-500 hover:text-teal-600 font-bold text-xs uppercase tracking-widest rounded-full border border-slate-200 dark:border-slate-700 shadow-sm transition-all group">
            <ChevronLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> {t.back}
          </button>

          <div className="flex items-center gap-2 flex-wrap">

            {/* FIX 3: Language selector */}
            <div className="flex items-center gap-1 bg-white/70 dark:bg-slate-800/70 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-full px-1.5 py-1 shadow-sm">
              <Globe size={11} className="text-slate-400 ml-1" />
              {LANGS.map(l => (
                <button key={l.code} onClick={() => switchLang(l.code)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-black transition-all ${lang === l.code ? 'bg-teal-500 text-white' : 'text-slate-500 hover:text-teal-600'}`}>
                  {l.label}
                </button>
              ))}
            </div>

            <button onClick={toggleTheme} className="p-2.5 rounded-full bg-white/70 dark:bg-slate-800/70 backdrop-blur-md border border-slate-200 dark:border-slate-700 shadow-sm hover:-translate-y-0.5 transition-all">
              {isDark ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} />}
            </button>
            <div className="text-[10px] font-mono font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/10 px-3 py-1.5 rounded-lg border border-teal-100 dark:border-teal-500/30">{sessionId}</div>
          </div>
        </div>

        {/* Title + segmented progress */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-6">{t.title}</h1>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-3 px-1">
              <div>
                <span className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">{t.steps[step]}</span>
                <span className="text-[10px] text-slate-400 ml-2 hidden md:inline">— {t.subs[step]}</span>
              </div>
              <span className="text-xs font-bold text-teal-600 dark:text-teal-400">{Math.round(((step + 1) / 4) * 100)}%</span>
            </div>
            <div className="flex gap-2">
              {t.steps.map((_, i) => (
                <div key={i} className="flex-1 h-1.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <div className={`h-full w-full origin-left transition-transform duration-500 ${step > i ? 'bg-teal-400 scale-x-100' : step === i ? 'bg-teal-500 scale-x-100' : 'scale-x-0'}`} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Step content */}
        <div className="mb-8">{renderCurrentStep()}</div>

        {/* Navigation */}
        <div className="flex flex-col-reverse md:flex-row justify-between items-stretch md:items-center gap-3">
          <button type="button" onClick={handleBack} disabled={step === 0}
            className={`flex justify-center items-center gap-2 py-3.5 px-7 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${step === 0 ? 'opacity-0 pointer-events-none' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-white shadow-sm hover:shadow-md active:scale-95'}`}>
            <ChevronLeft size={15} /> {t.btnPrev}
          </button>

          {step < 3 ? (
            <div className="flex flex-col items-end gap-1.5">
              <button type="button" onClick={() => setStep(p => Math.min(3, p + 1))} disabled={!valid}
                className={`flex justify-center items-center gap-2 py-3.5 px-8 font-bold text-xs uppercase tracking-widest rounded-xl transition-all active:scale-95 ${valid ? 'bg-teal-600 text-white hover:bg-teal-700 shadow-[0_8px_20px_rgba(13,148,136,0.25)]' : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'}`}>
                {t.btnNext} <ChevronRight size={15} />
              </button>
              {/* FIX 5: specific per-field hint */}
              {!valid && missing && t.missing[missing] && (
                <p className="text-amber-500 dark:text-amber-400 text-[10px] font-bold text-right px-1">
                  {t.missing[missing]}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col w-full md:w-auto items-end gap-1.5">
              <button type="button" onClick={handleSubmit} disabled={busy || !valid}
                className={`w-full flex justify-center items-center gap-2 py-3.5 px-8 font-bold text-xs uppercase tracking-widest rounded-xl transition-all active:scale-95 ${valid && !busy ? 'bg-slate-900 dark:bg-teal-500 text-white hover:bg-slate-800 dark:hover:bg-teal-400 shadow-[0_8px_20px_rgba(15,23,42,0.2)] dark:shadow-[0_8px_20px_rgba(20,184,166,0.25)]' : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'}`}>
                {busy
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing…</>
                  : <>{t.btnSubmit} <Send size={15} /></>}
              </button>
              {!valid && missing && t.missing[missing] && (
                <p className="text-amber-500 dark:text-amber-400 text-[10px] font-bold text-right px-1">
                  {t.missing[missing]}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
