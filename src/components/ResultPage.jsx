import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Download, Share2, ArrowLeft, ExternalLink,
  ShieldAlert, Activity, CheckCircle2, Loader2,
  TrendingUp, Sun, Moon, Zap, Users, Brain,
  DollarSign, Target, Globe,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { recordTelemetry } from '../utils/telemetry';

// ─── DICTIONARY ───────────────────────────────────────────────────────────────
const DICTIONARY = {
  en: {
    loading: 'AURA is mapping community resources to your profile\u2026',
    title: 'Your Assessment Result',
    red: 'High Needs (Red)',
    amber: 'Moderate Needs (Amber)',
    green: 'Low Needs (Green)',
    redDesc: 'Your risk profile indicates a need for supervised care. We strongly recommend consulting a healthcare professional before starting any new exercise programme.',
    amberDesc: 'You have moderate needs. Consider gradually increasing your activity levels and exploring the structured community resources below.',
    greenDesc: "You meet the physical activity guidelines. Maintain your routine and consider levelling up with structured programmes.",
    sdohFinText: 'Cost flagged as a barrier — we have prioritised free and fully subsidised options below.',
    sdohSocText: 'Social connection flagged — community group and befriending resources have been included.',
    sdohPsychoText: 'Mental wellbeing flagged — emotional wellness and counselling resources have been added.',
    trendActive: 'Longitudinal Tracking Active',
    trendDesc: 'Your results have been linked to your previous assessment to monitor clinical progress over time.',
    pavsTitle: 'ACSM Physical Activity Vital Sign',
    pavsWeekly: 'mins / week',
    pavsDays: 'days / week',
    pavsMins: 'mins / session',
    pavsBelow: 'Insufficiently Active',
    pavsMeets: 'Meets Guidelines',
    pavsActive: 'Active',
    pavsBelowDesc: 'Below 150 mins/week — the Singapore Physical Activity Guidelines recommend at least 150 mins of moderate activity per week.',
    pavsMeetsDesc: 'You meet the SPAG minimum of 150 mins/week. Consider building toward 300 mins for greater health benefit.',
    pavsActiveDesc: 'Excellent — you exceed the SPAG recommendation of 300 mins/week. Focus on maintaining quality and adding variety.',
    pavsThreshold: 'SPAG: 150–300 mins / week',
    primaryAction: 'Your Primary Action',
    resources: 'Recommended Community Resources',
    download: 'Download PDF',
    share: 'Share Result',
    back: 'Back to Gateway',
    cta: 'Take Action Today',
    reportTitle: 'SMART DASHBOARD',
    date: 'Date',
    assessmentId: 'Assessment ID',
    prevId: 'Previous ID',
    postalSector: 'Postal Sector',
    pavsLabel: 'PAVS Score',
    scanQR: 'Scan to access digital portal',
    webLink: 'Website: ',
    sharePrefix: 'My NEXUS AURA result:',
    shareTopRec: 'Primary Action:',
    sharePathway: 'Discover your community health pathway at NEXUS:',
  },
  ms: {
    loading: 'AURA sedang memetakan sumber komuniti ke profil anda\u2026',
    title: 'Keputusan Penilaian Anda',
    red: 'Keperluan Tinggi (Merah)',
    amber: 'Keperluan Sederhana (Kuning)',
    green: 'Keperluan Rendah (Hijau)',
    redDesc: 'Profil risiko anda memerlukan penjagaan yang diawasi. Sila berunding dengan profesional kesihatan sebelum memulakan program senaman baharu.',
    amberDesc: 'Anda mempunyai keperluan sederhana. Pertimbangkan untuk meningkatkan aktiviti anda secara beransur-ansur dan erkoka sumber komuniti di bawah.',
    greenDesc: 'Anda memenuhi garis panduan aktiviti fizikal. Teruskan dan pertimbangkan untuk meningkatkan tahap dengan program berstruktur.',
    sdohFinText: 'Kos dikenal pasti sebagai halangan — pilihan percuma dan bersubsidi diutamakan di bawah.',
    sdohSocText: 'Hubungan sosial dikenal pasti — sumber kumpulan komuniti dan rakan disertakan.',
    sdohPsychoText: 'Kesejahteraan mental dikenal pasti — sumber sokongan emosi dan kaunseling ditambah.',
    trendActive: 'Penjejakan Membujur Aktif',
    trendDesc: 'Keputusan anda dipautkan ke penilaian lepas untuk memantau kemajuan klinikal.',
    pavsTitle: 'Tanda Vital Aktiviti Fizikal ACSM',
    pavsWeekly: 'minit / minggu',
    pavsDays: 'hari / minggu',
    pavsMins: 'minit / sesi',
    pavsBelow: 'Kurang Aktif',
    pavsMeets: 'Memenuhi Garis Panduan',
    pavsActive: 'Aktif',
    pavsBelowDesc: 'Di bawah 150 minit/minggu — Garis Panduan Aktiviti Fizikal Singapura mengesyorkan sekurang-kurangnya 150 minit seminggu.',
    pavsMeetsDesc: 'Anda memenuhi minimum SPAG 150 minit/minggu. Pertimbangkan untuk mencapai 300 minit untuk manfaat kesihatan yang lebih besar.',
    pavsActiveDesc: 'Cemerlang — anda melebihi cadangan SPAG 300 minit/minggu.',
    pavsThreshold: 'SPAG: 150–300 minit / minggu',
    primaryAction: 'Tindakan Utama Anda',
    resources: 'Sumber Komuniti yang Disyorkan',
    download: 'Muat Turun PDF',
    share: 'Kongsi Keputusan',
    back: 'Kembali ke Pintu Utama',
    cta: 'Ambil Tindakan Hari Ini',
    reportTitle: 'SMART DASHBOARD',
    date: 'Tarikh',
    assessmentId: 'ID Penilaian',
    prevId: 'ID Lepas',
    postalSector: 'Sektor Pos',
    pavsLabel: 'Skor PAVS',
    scanQR: 'Imbas untuk akses portal digital',
    webLink: 'Laman Web: ',
    sharePrefix: 'Keputusan NEXUS AURA saya:',
    shareTopRec: 'Tindakan Utama:',
    sharePathway: 'Terokai laluan kesihatan komuniti anda di NEXUS:',
  },
  zh: {
    loading: 'AURA 正在将社区资源匹配到您的个人资料\u2026',
    title: '您的评估结果',
    red: '高需求 (红色)',
    amber: '中等需求 (琥珀色)',
    green: '低需求 (绿色)',
    redDesc: '您的风险状况表明需要有监督的护理。我们强烈建议您在开始新的锻炼计划之前咨询医生。',
    amberDesc: '您有中等需求。建议逐步增加您的活动量，并探索下面的社区资源。',
    greenDesc: '您符合体力活动指南。请继续保持并考虑通过结构化课程进一步提升。',
    sdohFinText: '费用被标记为障碍 — 免费和全额补贴选项已优先列出。',
    sdohSocText: '社会联系被标记 — 已包含社区团体和交友资源。',
    sdohPsychoText: '心理健康被标记 — 已添加情感支持和心理辅导资源。',
    trendActive: '纵向跟踪已激活',
    trendDesc: '您的结果已链接到之前的评估，以监测临床进展。',
    pavsTitle: 'ACSM 体力活动关键指标',
    pavsWeekly: '分钟 / 周',
    pavsDays: '天 / 周',
    pavsMins: '分钟 / 次',
    pavsBelow: '运动不足',
    pavsMeets: '达到指南要求',
    pavsActive: '活跃',
    pavsBelowDesc: '低于 150 分钟/周 — 新加坡体力活动指南建议每周至少进行 150 分钟的中等强度活动。',
    pavsMeetsDesc: '您达到了 SPAG 最低要求 150 分钟/周。考虑向 300 分钟迈进以获得更大的健康益处。',
    pavsActiveDesc: '优秀 — 您超过了 SPAG 建议的 300 分钟/周。',
    pavsThreshold: 'SPAG: 150–300 分钟 / 周',
    primaryAction: '您的首要行动',
    resources: '推荐的社区资源',
    download: '下载 PDF',
    share: '分享结果',
    back: '返回主页',
    cta: '今天就采取行动',
    reportTitle: 'SMART DASHBOARD',
    date: '日期',
    assessmentId: '评估 ID',
    prevId: '之前的 ID',
    postalSector: '邮政区域',
    pavsLabel: 'PAVS 评分',
    scanQR: '扫描以访问数字门户',
    webLink: '网址: ',
    sharePrefix: '我的 NEXUS AURA 结果：',
    shareTopRec: '首要行动：',
    sharePathway: '在 NEXUS 探索您的社区健康路径：',
  },
  ta: {
    loading: 'AURA உங்கள் சுயவிவரத்திற்கு சமூக வளங்களை வரைபடமாக்குகிறது\u2026',
    title: 'உங்கள் மதிப்பீட்டு முடிவு',
    red: 'அதிக தேவை (சிவப்பு)',
    amber: 'மிதமான தேவை (ஆம்பர்)',
    green: 'குறைந்த தேவை (பச்சை)',
    redDesc: 'உங்கள் ஆபத்து விவரக்குறிப்பு மேற்பார்வையிடப்பட்ட கவனிப்பின் அவசியத்தைக் குறிக்கிறது. மருத்துவரை முதலில் அணுகவும்.',
    amberDesc: 'உங்களுக்கு மிதமான தேவைகள் உள்ளன. படிப்படியாக செயல்பாட்டை அதிகரித்து கீழ்கண்ட வளங்களை ஆராயவும்.',
    greenDesc: 'நீங்கள் உடல் செயல்பாட்டு வழிகாட்டுதல்களை பூர்த்தி செய்கிறீர்கள். தொடரவும், கூடுதல் திட்டங்களை முயற்சிக்கவும்.',
    sdohFinText: 'செலவு தடையாக கண்டறியப்பட்டது — இலவச மற்றும் மானிய விருப்பங்கள் முன்னுரிமை அளிக்கப்பட்டுள்ளன.',
    sdohSocText: 'சமூக தொடர்பு கண்டறியப்பட்டது — சமூக குழு மற்றும் நட்பு வளங்கள் சேர்க்கப்பட்டுள்ளன.',
    sdohPsychoText: 'மன நலன் கண்டறியப்பட்டது — உணர்ச்சி ஆதரவு வளங்கள் சேர்க்கப்பட்டுள்ளன.',
    trendActive: 'நீண்டகால கண்காணிப்பு செயலில் உள்ளது',
    trendDesc: 'மருத்துவ முன்னேற்றத்தைக் கண்காணிக்க முந்தைய மதிப்பீட்டுடன் இணைக்கப்பட்டுள்ளது.',
    pavsTitle: 'ACSM உடல் செயல்பாட்டு உயிர் அறிகுறி',
    pavsWeekly: 'நிமிடங்கள் / வாரம்',
    pavsDays: 'நாட்கள் / வாரம்',
    pavsMins: 'நிமிடங்கள் / சேஷன்',
    pavsBelow: 'போதுமான செயல்பாட்டிற்கு குறைவு',
    pavsMeets: 'வழிகாட்டுதல்களை பூர்த்தி செய்கிறது',
    pavsActive: 'செயலில் உள்ளது',
    pavsBelowDesc: '150 நிமிடங்களுக்கும் குறைவு/வாரம் — SPAG குறைந்தது 150 நிமிடங்கள் பரிந்துரைக்கிறது.',
    pavsMeetsDesc: 'SPAG குறைந்தபட்சம் 150 நிமிடங்கள்/வாரத்தை பூர்த்தி செய்கிறீர்கள். 300 நிமிடங்களை இலக்காக கொள்ளுங்கள்.',
    pavsActiveDesc: 'சிறப்பு — SPAG 300 நிமிடங்கள்/வாரத்தை தாண்டுகிறீர்கள்.',
    pavsThreshold: 'SPAG: 150–300 நிமிடங்கள் / வாரம்',
    primaryAction: 'உங்கள் முதல் நடவடிக்கை',
    resources: 'பரிந்துரைக்கப்பட்ட சமூக வளங்கள்',
    download: 'PDF பதிவிறக்குக',
    share: 'முடிவைப் பகிர்க',
    back: 'முகப்பிற்குத் திரும்பு',
    cta: 'இன்றே நடவடிக்கை எடுங்கள்',
    reportTitle: 'SMART DASHBOARD',
    date: 'தேதி',
    assessmentId: 'மதிப்பீட்டு ID',
    prevId: 'முந்தைய ID',
    postalSector: 'அஞ்சல் பிரிவு',
    pavsLabel: 'PAVS மதிப்பெண்',
    scanQR: 'டிஜிட்டல் போர்ட்டலை அணுக ஸ்கேன் செய்யவும்',
    webLink: 'இணையதளம்: ',
    sharePrefix: 'எனது NEXUS AURA முடிவு:',
    shareTopRec: 'முதல் நடவடிக்கை:',
    sharePathway: 'NEXUS இல் உங்கள் சமூக சுகாதார வழியைக் கண்டறியவும்:',
  },
};

// ─── RESOURCE LIBRARY ─────────────────────────────────────────────────────────
const ALL_RESOURCES = {
  ssmc_kkh:          { id: 'ssmc_kkh',          url: 'https://for.sg/exercise',                                          logo: '/logos/ssmckkh.png',      en: { title: 'SSMC@KKH Exercise Resources',          desc: 'Expert clinical exercise prescriptions and safety resources for the community.' },                          ms: { title: 'Sumber Senaman SSMC@KKH',              desc: 'Preskripsi senaman klinikal pakar untuk komuniti.' },                                               zh: { title: 'SSMC@KKH 运动资源',                    desc: '为社区提供的专家临床运动处方和安全资源。' },                                                        ta: { title: 'SSMC@KKH உடற்பயிற்சி வளங்கள்',        desc: 'சமூகத்திற்கான நிபுணர் மருத்துவ உடற்பயிற்சி வளங்கள்.' } },
  spag:              { id: 'spag',               url: 'https://for.sg/spag',                                              logo: '/logos/sportsg.png',      en: { title: 'Singapore Physical Activity Guidelines', desc: 'National guidelines for physical activity and sedentary behaviour.' },                                     ms: { title: 'Garis Panduan Aktiviti Fizikal SG',    desc: 'Garis panduan kebangsaan untuk aktiviti fizikal.' },                                                zh: { title: '新加坡体力活动指南',                    desc: '国家体力活动指南。' },                                                                                ta: { title: 'சிங்கப்பூர் உடல் செயல்பாட்டு வழிகாட்டுதல்கள்', desc: 'தேசிய உடல் செயல்பாட்டு வழிகாட்டுதல்கள்.' } },
  healthier_sg:      { id: 'healthier_sg',       url: 'https://www.healthiersg.gov.sg/',                                  logo: '/logos/healthiersg.png',  en: { title: 'Healthier SG GP Check-In',             desc: 'Schedule a fully subsidised annual check-in with your enrolled GP.' },                                     ms: { title: 'Semakan GP Healthier SG',              desc: 'Jadualkan pemeriksaan tahunan bersubsidi penuh dengan doktor anda.' },                                      zh: { title: 'Healthier SG 全科医生复查',              desc: '安排全额补贴的年度检查。' },                                                                        ta: { title: 'Healthier SG GP சோதனை',                desc: 'மருத்துவரிடம் முழு மானியத்துடன் கூடிய பரிசோதனையை திட்டமிடுங்கள்.' } },
  start2move:        { id: 'start2move',         url: 'https://www.healthhub.sg/programmes/letsmoveit/start2move',        logo: '/logos/hpb.png',          en: { title: 'HPB Start2Move (Free)',                desc: 'A free 6-session beginner programme to help you start exercising safely.' },                               ms: { title: 'Program Start2Move HPB (Percuma)',     desc: 'Program percuma 6 sesi untuk pemula.' },                                                              zh: { title: 'HPB Start2Move（免费）',               desc: '免费的6节初学者计划，帮助您安全锻炼。' },                                                             ta: { title: 'HPB Start2Move (இலவசம்)',               desc: 'இலவச 6 அமர்வு தொடக்க திட்டம்.' } },
  active_health:     { id: 'active_health',      url: 'https://www.myactivesg.com/active-health',                         logo: '/logos/activehealth.png', en: { title: 'Active Health Labs',                  desc: 'Supervised clinical exercise and metabolic health programmes by SportSG.' },                              ms: { title: 'Makmal Active Health',                desc: 'Program senaman klinikal yang diawasi oleh SportSG.' },                                               zh: { title: 'Active Health 实验室',                 desc: 'SportSG 提供的有监督临床锻炼计划。' },                                                               ta: { title: 'Active Health ஆய்வகங்கள்',              desc: 'SportSG-ன் மருத்துவ உடற்பயிற்சி திட்டங்கள்.' } },
  activesg_gym:      { id: 'activesg_gym',       url: 'https://www.myactivesg.com/',                                      logo: '/logos/activesg.png',     en: { title: 'ActiveSG Facilities',                 desc: 'Affordable fitness gyms, pools, and group workout classes near you.' },                                   ms: { title: 'Fasiliti ActiveSG',                   desc: 'Gim, kolam renang dan kelas senaman berpatutan berhampiran anda.' },                                        zh: { title: 'ActiveSG 设施',                        desc: '附近价格实惠的健身房和团体锻炼课程。' },                                                             ta: { title: 'ActiveSG வசதிகள்',                      desc: 'மலிவு விலையில் உடற்பயிற்சி நிலையங்கள்.' } },
  pa_courses:        { id: 'pa_courses',         url: 'https://www.onepa.gov.sg/',                                        logo: '/logos/pa.png',           en: { title: 'PA Community Interest Groups',        desc: 'Free or low-cost Tai Chi, Yoga, Brisk Walking groups at your nearest Community Club.' },                  ms: { title: 'Kumpulan Minat Komuniti PA',           desc: 'Kumpulan Tai Chi, Yoga, Berjalan Pantas percuma atau murah di CC terdekat.' },                               zh: { title: 'PA 社区兴趣小组',                       desc: '在最近的社区俱乐部参加太极拳、瑜伽等免费或低价活动。' },                                             ta: { title: 'PA சமூக ஆர்வக் குழுக்கள்',              desc: 'தாய்ச்சி, யோகா, விரைவு நடை குழுக்கள்.' } },
  singhealth_healthup: { id: 'singhealth_healthup', url: 'https://www.singhealth.com.sg/community-care/level-up-with-healthup', logo: '/logos/singhealth.png', en: { title: 'SingHealth Health UP!',           desc: 'Community wellness programmes with guidance from SingHealth Wellbeing Coordinators.' },                    ms: { title: 'SingHealth Health UP!',               desc: 'Program kesejahteraan komuniti dengan bimbingan SingHealth.' },                                             zh: { title: 'SingHealth Health UP!',               desc: '在 SingHealth 健康协调员指导下的社区健康计划。' },                                                   ta: { title: 'SingHealth Health UP!',                desc: 'SingHealth நலன்புரி ஒருங்கிணைப்பாளர்களுடன் சமூக திட்டங்கள்.' } },
  nuhs_chp:          { id: 'nuhs_chp',           url: 'https://www.nuhs.edu.sg/care-in-the-community',                    logo: '/logos/nuhs.png',         en: { title: 'NUHS Community Health Post',          desc: 'Health screenings and lifestyle coaching in your neighbourhood.' },                                        ms: { title: 'Pos Kesihatan Komuniti NUHS',          desc: 'Saringan kesihatan dan bimbingan gaya hidup di kejiranan anda.' },                                          zh: { title: 'NUHS 社区卫生站',                       desc: '社区健康筛查和生活方式辅导。' },                                                                     ta: { title: 'NUHS சமூக சுகாதார நிலையம்',             desc: 'உங்கள் பகுதியில் சுகாதார பரிசோதனைகள்.' } },
  nhg_coaches:       { id: 'nhg_coaches',        url: 'https://form.gov.sg/663c452b463eff5b7438b117',                     logo: '/logos/nhg.png',          en: { title: 'NHG Health Coaches',                  desc: 'Connect with a Health Coach to set personalised goals for a healthier lifestyle.' },                      ms: { title: 'Jurulatih Kesihatan NHG',              desc: 'Berhubung dengan Jurulatih Kesihatan untuk menetapkan matlamat peribadi.' },                                zh: { title: 'NHG 健康教练',                          desc: '与健康教练联系，设定个性化健康目标。' },                                                             ta: { title: 'NHG சுகாதார பயிற்சியாளர்கள்',           desc: 'தனிப்பட்ட இலக்குகளை அமைக்க பயிற்சியாளருடன் இணையுங்கள்.' } },
  aic_aac:           { id: 'aic_aac',            url: 'https://www.aic.sg/care-services/active-ageing-centres',          logo: '/logos/aic.png',          en: { title: 'Active Ageing Centres (AAC)',          desc: 'Neighbourhood hubs for residents 60+ offering active programmes and social networks. Walk in — no appointment needed.' }, ms: { title: 'Pusat Penuaan Aktif (AAC)', desc: 'Hab kejiranan untuk warga 60+ menawarkan program aktif. Jalan masuk — tiada temujanji diperlukan.' }, zh: { title: '活跃乐龄中心 (AAC)', desc: '为 60 岁以上居民提供活跃计划的社区中心。直接上门，无需预约。' }, ta: { title: 'சுறுசுறுப்பான முதுமை மையங்கள் (AAC)', desc: '60+ வயதினருக்கான நேரடி முன்-பதிவு தேவையில்லாத சமூக மையங்கள்.' } },
  touch_community:   { id: 'touch_community',    url: 'https://www.touch.org.sg/',                                        logo: '/logos/touch.png',        en: { title: 'TOUCH Community Services',            desc: 'Holistic social support, befriending, and caregiving resources.' },                                       ms: { title: 'Perkhidmatan Komuniti TOUCH',          desc: 'Sokongan sosial holistik dan sumber penjagaan.' },                                                          zh: { title: 'TOUCH 社区服务',                       desc: '全方位的社会支持和护理资源。' },                                                                     ta: { title: 'TOUCH சமூக சேவைகள்',                   desc: 'முழுமையான சமூக ஆதரவு வளங்கள்.' } },
  society_wings:     { id: 'society_wings',      url: 'https://www.wings.sg/',                                            logo: '/logos/wings.png',        en: { title: 'Society for WINGS',                   desc: 'Empowering women aged 40+ with health, wealth, and happiness programmes.' },                              ms: { title: 'Persatuan untuk WINGS',                desc: 'Memperkasakan wanita 40+ dengan program kesihatan dan kebahagiaan.' },                                      zh: { title: 'WINGS 协会',                           desc: '为 40 岁以上女性提供健康计划。' },                                                                   ta: { title: 'WINGS சங்கம்',                          desc: '40+ வயது பெண்களுக்கான திட்டங்கள்.' } },
  singhealth_careline: { id: 'singhealth_careline', url: 'https://www.singhealth.com.sg/community-care/careline',        logo: '/logos/careline.png',     en: { title: 'SingHealth CareLine (24/7)',           desc: 'Personal tele-befriending service providing round-the-clock social support for seniors.' },               ms: { title: 'SingHealth CareLine (24/7)',            desc: 'Perkhidmatan tele-rakan 24/7 untuk warga emas.' },                                                          zh: { title: 'SingHealth CareLine（24/7）',           desc: '为老年人提供全天候电话交友服务。' },                                                                 ta: { title: 'SingHealth CareLine (24/7)',            desc: 'முதியோர்களுக்கான 24/7 தொலைபேசி நட்பு சேவை.' } },
  financial_chas:    { id: 'financial_chas',     url: 'https://www.chas.sg/',                                             logo: '/logos/chas.png',         en: { title: 'CHAS & Medical Subsidies',            desc: 'Financial support schemes for community healthcare — Blue, Orange, and Merdeka Generation.' },             ms: { title: 'CHAS & Subsidi Perubatan',             desc: 'Skim sokongan kewangan untuk penjagaan kesihatan komuniti.' },                                              zh: { title: 'CHAS 与医疗补贴',                       desc: '社区医疗财务支持计划。' },                                                                           ta: { title: 'CHAS & மருத்துவ மானியங்கள்',             desc: 'சமூக சுகாதாரத்திற்கான நிதி ஆதரவு திட்டங்கள்.' } },
  mental_wellness:   { id: 'mental_wellness',    url: 'https://www.mindline.sg/',                                         logo: '/logos/mindline.png',     en: { title: 'Mindline.sg Support',                 desc: 'Free, confidential emotional support tools and mental wellness resources.' },                               ms: { title: 'Sokongan Mindline.sg',                 desc: 'Sokongan emosi percuma dan sulit.' },                                                                       zh: { title: 'Mindline.sg 支持',                     desc: '免费保密的情感支持工具。' },                                                                         ta: { title: 'Mindline.sg ஆதரவு',                     desc: 'இலவச, ரகசிய உணர்ச்சி ஆதரவு கருவிகள்.' } },
};

// ─── CTA BANNER CONFIG ────────────────────────────────────────────────────────
const CTA_BANNER = {
  URGENT:    { emoji: '⚠️', bg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800',       label: 'bg-rose-600',    text: 'text-rose-800 dark:text-rose-200',     action: { en: 'Consult your GP before starting any exercise. Mention your PAVS result at your visit.', ms: 'Sila berjumpa doktor sebelum memulakan sebarang senaman.', zh: '在开始任何运动前，请先咨询您的全科医生。', ta: 'எந்தவொரு உடற்பயிற்சியையும் தொடங்கும் முன் உங்கள் மருத்துவரை அணுகவும்.' }, url: 'https://www.healthiersg.gov.sg/', urlLabel: { en: 'Book via HealthHub', ms: 'Tempah via HealthHub', zh: '通过 HealthHub 预约', ta: 'HealthHub மூலம் பதிவு செய்க' } },
  CLINICAL:  { emoji: '🩺', bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',   label: 'bg-amber-500',   text: 'text-amber-800 dark:text-amber-200',   action: { en: 'Enrol in Manage Metabolic Health at Woodlands Active Health Lab — 7 sessions, from SGD 48.', ms: 'Daftar dalam program Urus Kesihatan Metabolik di Makmal Active Health Woodlands — 7 sesi, dari SGD 48.', zh: '报名参加 Woodlands Active Health 实验室的"管理代谢健康"课程 — 7 节课，SGD 48 起。', ta: 'Woodlands Active Health ஆய்வகத்தில் வளர்சிதை மாற்ற சுகாதார திட்டத்தில் பதிவு செய்யவும் — 7 அமர்வுகள், SGD 48 முதல்.' }, url: 'https://www.myactivesg.com/active-health', urlLabel: { en: 'Book at activesg.gov.sg', ms: 'Tempah di activesg.gov.sg', zh: '在 activesg.gov.sg 预约', ta: 'activesg.gov.sg இல் பதிவு செய்க' } },
  COMMUNITY: { emoji: '🏠', bg: 'bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800',       label: 'bg-teal-600',    text: 'text-teal-800 dark:text-teal-200',     action: { en: 'Visit your nearest Active Ageing Centre — walk in, no appointment, activities largely free for residents 60+.', ms: 'Kunjungi Pusat Penuaan Aktif (AAC) terdekat — hadir terus, aktiviti percuma untuk warga 60+.', zh: '访问离您最近的活跃乐龄中心 (AAC) — 无需预约，60岁以上居民活动大多免费。', ta: 'உங்களுக்கு அருகிலுள்ள Active Ageing மையத்தைப் பார்வையிடவும் — முன்பதிவு தேவையில்லை, 60+ வயதினருக்கு இலவசம்.' }, url: 'https://www.aic.sg/care-services/active-ageing-centres', urlLabel: { en: 'Find nearest AAC', ms: 'Cari AAC terdekat', zh: '查找最近的 AAC', ta: 'அருகிலுள்ள AAC ஐக் கண்டறிக' } },
  WELLBEING: { emoji: '🌿', bg: 'bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800', label: 'bg-violet-600', text: 'text-violet-800 dark:text-violet-200', action: { en: "Connect with your polyclinic's mental health support service — this is your most important first step.", ms: 'Dapatkan perkhidmatan sokongan kesihatan mental poliklinik anda — ini adalah langkah pertama yang paling penting.', zh: '联系您综合诊所的心理健康支持服务 — 这是您最重要的一步。', ta: 'உங்கள் பாலிகிளினிக்கின் மனநல ஆதரவு சேவையுடன் இணையுங்கள் — இது உங்கள் மிக முக்கியமான முதல் படியாகும்.' }, url: 'https://www.mindline.sg/', urlLabel: { en: 'mindline.sg', ms: 'mindline.sg', zh: 'mindline.sg', ta: 'mindline.sg' } },
  FREE_FIRST: { emoji: '🆓', bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800', label: 'bg-emerald-600', text: 'text-emerald-800 dark:text-emerald-200', action: { en: 'Register for Start2Move — a completely free 6-session beginner programme via the Healthy 365 app.', ms: 'Daftar untuk Start2Move — program pemula 6 sesi percuma melalui aplikasi Healthy 365.', zh: '注册 Start2Move — 通过 Healthy 365 应用程序免费参加的 6 节初学者课程。', ta: 'Start2Move-க்கு பதிவு செய்யவும் — Healthy 365 ஆப் மூலம் முற்றிலும் இலவச 6-அமர்வு தொடக்க திட்டம்.' }, url: 'https://www.healthhub.sg/programmes/letsmoveit/start2move', urlLabel: { en: 'Register via Healthy 365', ms: 'Daftar via Healthy 365', zh: '通过 Healthy 365 注册', ta: 'Healthy 365 மூலம் பதிவு செய்க' } },
  START:     { emoji: '🚀', bg: 'bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800',        label: 'bg-teal-600',    text: 'text-teal-800 dark:text-teal-200',     action: { en: 'Download the Healthy 365 app and search "Start2Move" to register for the free 6-session beginner programme.', ms: 'Muat turun aplikasi Healthy 365 dan cari "Start2Move" untuk mendaftar program pemula 6 sesi percuma.', zh: '下载 Healthy 365 应用程序并搜索"Start2Move"以注册免费的 6 节初学者课程。', ta: 'Healthy 365 ஆப்பை பதிவிறக்கம் செய்து இலவச 6-அமர்வு தொடக்க திட்டத்திற்கு பதிவு செய்ய "Start2Move" ஐ தேடவும்.' }, url: 'https://www.healthhub.sg/programmes/letsmoveit/start2move', urlLabel: { en: 'Register via Healthy 365', ms: 'Daftar via Healthy 365', zh: '通过 Healthy 365 注册', ta: 'Healthy 365 மூலம் பதிவு செய்க' } },
  LEVEL_UP:  { emoji: '💪', bg: 'bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800',        label: 'bg-teal-600',    text: 'text-teal-800 dark:text-teal-200',     action: { en: 'Book a Strength 2.0 or Balance & Muscular Fitness session at Woodlands Active Health Lab, from SGD 6.', ms: 'Tempah sesi Kekuatan 2.0 atau Keseimbangan di Makmal Active Health Woodlands, dari SGD 6.', zh: '在 Woodlands Active Health 实验室预约力量 2.0 或平衡与肌肉健身课程，SGD 6 起。', ta: 'Woodlands Active Health ஆய்வகத்தில் வலிமை 2.0 அல்லது தசை உடற்பயிற்சி அமர்வை பதிவு செய்யவும், SGD 6 முதல்.' }, url: 'https://www.myactivesg.com/active-health', urlLabel: { en: 'Book at activesg.gov.sg', ms: 'Tempah di activesg.gov.sg', zh: '在 activesg.gov.sg 预约', ta: 'activesg.gov.sg இல் பதிவு செய்க' } },
  ADVANCED:  { emoji: '⚡', bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800', label: 'bg-emerald-600', text: 'text-emerald-800 dark:text-emerald-200', action: { en: 'Try the free HIIT Workout Library on HealthHub, or book a Perform 2.0 session at Woodlands Active Health Lab.', ms: 'Cuba senaman HIIT percuma di HealthHub, atau tempah sesi Perform 2.0 di Makmal Active Health Woodlands.', zh: '尝试 HealthHub 上免费的 HIIT 锻炼库，或在 Woodlands Active Health 实验室预约 Perform 2.0 课程。', ta: 'HealthHub-இல் இலவச HIIT உடற்பயிற்சிகளை முயற்சிக்கவும் அல்லது Perform 2.0 அமர்வை பதிவு செய்யவும்.' }, url: 'https://www.healthhub.sg/programmes/letsmoveit', urlLabel: { en: 'HealthHub Move It', ms: 'HealthHub Move It', zh: 'HealthHub Move It', ta: 'HealthHub Move It' } },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const getRegionalHealthSystem = (sector) => {
  const s = parseInt(sector, 10);
  if (isNaN(s)) return 'NHG';
  if (s >= 58 && s <= 71) return 'NUHS';
  if ((s >= 1 && s <= 27) || (s >= 31 && s <= 52) || s === 81) return 'SingHealth';
  return 'NHG';
};

const getRiskTier  = (n) => n >= 5 ? 'Red' : n >= 2 ? 'Amber' : 'Green';
const getPavsTier  = (s) => s >= 300 ? 'active' : s >= 150 ? 'meets' : 'below';

const generateActionPlan = (riskTier, ctaTier, data, postalSector) => {
  const rhs  = getRegionalHealthSystem(postalSector);
  const plan = [ALL_RESOURCES.ssmc_kkh, ALL_RESOURCES.spag];

  const tierPrimaries = {
    URGENT:     [ALL_RESOURCES.healthier_sg, ALL_RESOURCES.active_health],
    CLINICAL:   [ALL_RESOURCES.active_health, ALL_RESOURCES.healthier_sg],
    COMMUNITY:  [ALL_RESOURCES.aic_aac, ALL_RESOURCES.pa_courses],
    WELLBEING:  [ALL_RESOURCES.mental_wellness, ALL_RESOURCES.touch_community],
    FREE_FIRST: [ALL_RESOURCES.start2move, ALL_RESOURCES.financial_chas, ALL_RESOURCES.pa_courses],
    START:      [ALL_RESOURCES.start2move, ALL_RESOURCES.pa_courses],
    LEVEL_UP:   [ALL_RESOURCES.active_health, ALL_RESOURCES.activesg_gym],
    ADVANCED:   [ALL_RESOURCES.activesg_gym, ALL_RESOURCES.active_health],
  };

  if (ctaTier && tierPrimaries[ctaTier]) plan.push(...tierPrimaries[ctaTier]);
  else if (riskTier === 'Red')           plan.push(ALL_RESOURCES.healthier_sg, ALL_RESOURCES.active_health);
  else if (riskTier === 'Amber')         plan.push(ALL_RESOURCES.start2move, ALL_RESOURCES.pa_courses);
  else                                   plan.push(ALL_RESOURCES.activesg_gym, ALL_RESOURCES.pa_courses);

  if (rhs === 'SingHealth') plan.push(ALL_RESOURCES.singhealth_healthup);
  else if (rhs === 'NUHS')  plan.push(ALL_RESOURCES.nuhs_chp);
  else                      plan.push(ALL_RESOURCES.nhg_coaches);

  const hasPsycho = data.psychoFlag || data.sdohPsychological;
  if (hasPsycho)          plan.push(ALL_RESOURCES.mental_wellness);
  if (data.sdohFinancial) plan.push(ALL_RESOURCES.financial_chas, ALL_RESOURCES.touch_community);
  if (data.sdohSocial) {
    if (rhs === 'SingHealth') plan.push(ALL_RESOURCES.singhealth_careline);
    plan.push(ALL_RESOURCES.aic_aac, ALL_RESOURCES.touch_community);
  }
  if (data.gender === 'Female' && (data.age === '41-60' || data.age === '60+')) {
    plan.push(ALL_RESOURCES.society_wings);
  }

  const seen = new Set();
  return plan.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; }).slice(0, 6);
};

// ─── PAVS PANEL ───────────────────────────────────────────────────────────────
const PavsPanel = ({ data, t }) => {
  const score = data?.pavsScore;
  if (score == null) return null;

  const tier = getPavsTier(score);
  const tierConfig = {
    below:  { label: t.pavsBelow,  desc: t.pavsBelowDesc,  cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
    meets:  { label: t.pavsMeets,  desc: t.pavsMeetsDesc,  cls: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300' },
    active: { label: t.pavsActive, desc: t.pavsActiveDesc, cls: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' },
  };
  const tc = tierConfig[tier];
  const pct       = (Math.min(score, 400) / 400) * 100;
  const marker150 = (150 / 400) * 100;
  const marker300 = (300 / 400) * 100;
  const barColour = tier === 'active' ? 'bg-emerald-500' : tier === 'meets' ? 'bg-teal-500' : 'bg-amber-400';

  return (
    <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
      <div className="flex items-center gap-2 mb-5">
        <Activity size={15} className="text-teal-600 dark:text-teal-400" />
        <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{t.pavsTitle}</h2>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { value: score,                    label: t.pavsWeekly },
          { value: data.pavsDays    ?? '–',  label: t.pavsDays   },
          { value: data.pavsMinutes ?? '–',  label: t.pavsMins   },
        ].map(({ value, label }, i) => (
          <div key={i} className="text-center py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <p className="text-2xl font-black text-slate-900 dark:text-white leading-none">{value}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-medium">{label}</p>
          </div>
        ))}
      </div>
      <div className="mb-4">
        <div className="relative h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-visible">
          <div className={`h-full rounded-full transition-all duration-700 ${barColour}`} style={{ width: `${pct}%` }} />
          <div className="absolute top-0 bottom-0 w-0.5 bg-slate-400 dark:bg-slate-500" style={{ left: `${marker150}%` }} />
          <div className="absolute top-0 bottom-0 w-0.5 bg-slate-400 dark:bg-slate-500" style={{ left: `${marker300}%` }} />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-slate-400">0</span>
          <span className="text-[10px] text-slate-400" style={{ marginLeft: `${marker150 - 5}%` }}>150</span>
          <span className="text-[10px] text-slate-400" style={{ marginLeft: `${marker300 - marker150 - 5}%` }}>300</span>
          <span className="text-[10px] text-slate-400">400+</span>
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-0.5">{t.pavsThreshold}</p>
      </div>
      <div className="flex items-start gap-3">
        <span className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${tc.cls}`}>{tc.label}</span>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{tc.desc}</p>
      </div>
    </div>
  );
};

// ─── PRIMARY ACTION BANNER ────────────────────────────────────────────────────
const PrimaryActionBanner = ({ ctaTier, t, lang }) => {
  const config = CTA_BANNER[ctaTier] || CTA_BANNER.START;
  return (
    <div className={`p-5 rounded-2xl border ${config.bg}`}>
      <div className="flex items-center gap-2 mb-3">
        <Target size={14} className="text-current opacity-70" />
        <p className={`text-xs font-bold uppercase tracking-widest ${config.text}`}>{t.primaryAction}</p>
      </div>
      <p className={`text-sm font-semibold leading-relaxed mb-3 ${config.text}`}>
        <span className="text-lg mr-2">{config.emoji}</span>
        {config.action[lang] || config.action.en}
      </p>
      <a href={config.url} target="_blank" rel="noopener noreferrer"
        className={`inline-flex items-center gap-1.5 px-4 py-2 ${config.label} text-white rounded-full text-xs font-bold shadow-sm hover:opacity-90 transition-opacity`}>
        {config.urlLabel[lang] || config.urlLabel.en}
        <ExternalLink size={11} />
      </a>
    </div>
  );
};

// ─── SDOH FLAGS ───────────────────────────────────────────────────────────────
const SdohFlags = ({ data, t, previousSessionId }) => {
  const hasPsycho = data.psychoFlag || data.sdohPsychological;
  const flags = [
    previousSessionId  && { icon: <TrendingUp size={16} className="text-teal-500 shrink-0 mt-0.5" />,  text: t.trendDesc,       header: t.trendActive, headerCls: 'text-teal-600 dark:text-teal-400' },
    data.sdohFinancial && { icon: <DollarSign size={16} className="text-amber-500 shrink-0 mt-0.5" />, text: t.sdohFinText },
    data.sdohSocial    && { icon: <Users      size={16} className="text-sky-500 shrink-0 mt-0.5" />,   text: t.sdohSocText },
    hasPsycho          && { icon: <Brain      size={16} className="text-violet-500 shrink-0 mt-0.5" />, text: t.sdohPsychoText },
  ].filter(Boolean);

  if (!flags.length) return null;
  return (
    <div className="space-y-2.5">
      {flags.map((f, i) => (
        <div key={i} className="flex items-start gap-3 py-3 px-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
          {f.icon}
          <div>
            {f.header && <p className={`text-xs font-bold mb-0.5 ${f.headerCls}`}>{f.header}</p>}
            <p className="text-sm text-slate-600 dark:text-slate-400 font-medium leading-relaxed">{f.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── RESOURCE CARD ────────────────────────────────────────────────────────────
const ResourceCard = ({ resource, lang, baseUrl, onClick }) => {
  const content = resource[lang] || resource.en;
  return (
    <button onClick={onClick}
      className="flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-teal-400/60 dark:hover:border-teal-500/40 hover:shadow-lg transition-all text-left group w-full gap-4">
      <div className="flex items-center gap-4 flex-1">
        <div className="w-14 h-14 shrink-0 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden shadow-sm">
          <img src={`${baseUrl}${resource.logo}`} alt="" crossOrigin="anonymous"
            className="w-full h-full object-cover"
            onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '<span class="text-[9px] font-black text-slate-400 text-center px-1 leading-tight">LOGO</span>'; }} />
        </div>
        <div>
          <h3 className="text-sm font-black text-teal-600 dark:text-teal-400 mb-0.5 group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">{content.title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">{content.desc}</p>
        </div>
      </div>
      <div className="hidden sm:flex w-9 h-9 rounded-full bg-teal-100 dark:bg-teal-500/20 items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
        <ExternalLink size={15} className="text-teal-600 dark:text-teal-400" />
      </div>
    </button>
  );
};

// ─── LANGUAGE OPTIONS ─────────────────────────────────────────────────────────
const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'ms', label: 'BM' },
  { code: 'zh', label: '中文' },
  { code: 'ta', label: 'தமிழ்' },
];

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function ResultPage() {
  const location = useLocation();
  const navigate  = useNavigate();

  const [lang,               setLang]               = useState('en');
  const [animate,            setAnimate]            = useState(false);
  const [isGenerating,       setIsGenerating]       = useState(true);
  const [suggestedResources, setSuggestedResources] = useState([]);
  const [isDark,             setIsDark]             = useState(false);

  // FIX 1: Two refs — one per PDF page
  const printRef  = useRef(null); // Page 1: clinical report
  const printRef2 = useRef(null); // Page 2: governance, disclaimer, references, M3

  // FIX 3: clean hasState — handles score === 0 correctly
  const hasState = location.state?.score != null;

  useEffect(() => {
    if (!hasState) navigate('/individuals/pathway', { replace: true });
  }, [hasState, navigate]);

  const safe = location.state || { score: 0, data: {}, postalSector: '00' };
  const { score, data, postalSector, sessionId, previousSessionId, ctaTier } = safe;

  const riskTier        = getRiskTier(score);
  const activeSessionId = sessionId || ('NX-' + Math.random().toString(36).substr(2, 9).toUpperCase());
  const formattedDate   = new Date().toLocaleDateString('en-GB');
  const nexusUrl        = 'https://for.sg/nexus';
  const qrCodeUrl       = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(nexusUrl)}`;
  const baseUrl         = window.location.origin;

  useEffect(() => {
    const stored  = localStorage.getItem('nexus-theme');
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark    = stored === 'dark' || (!stored && sysDark);
    setIsDark(dark);
    document.documentElement.classList.toggle('dark', dark);
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('nexus-theme', next ? 'dark' : 'light');
  };

  // FIX 2: language switcher with persistence
  const switchLang = (code) => {
    setLang(code);
    localStorage.setItem('nexus_language', code);
  };

  useEffect(() => {
    if (!hasState) return;
    const stored = localStorage.getItem('nexus_language');
    if (stored && DICTIONARY[stored]) setLang(stored);
    setTimeout(() => {
      setSuggestedResources(generateActionPlan(riskTier, ctaTier, data, postalSector));
      setIsGenerating(false);
      setTimeout(() => setAnimate(true), 100);
    }, 1800);
  }, [riskTier, ctaTier, data, postalSector, hasState]);

  const t         = DICTIONARY[lang] || DICTIONARY.en;
  const hasPsycho = data?.psychoFlag || data?.sdohPsychological;
  const ctaBanner = CTA_BANNER[ctaTier] || CTA_BANNER.START;

  const themeMap = {
    Red:   { gradient: 'from-rose-500 to-red-600',     icon: <ShieldAlert  className="w-11 h-11 text-white mb-3 drop-shadow-md" />, titleColor: 'text-rose-600 dark:text-rose-400',       bgCard: 'bg-rose-50 dark:bg-rose-500/10 border-rose-100 dark:border-rose-500/20',         printBg: '#dc2626' },
    Amber: { gradient: 'from-amber-400 to-orange-500', icon: <Activity     className="w-11 h-11 text-white mb-3 drop-shadow-md" />, titleColor: 'text-amber-600 dark:text-amber-400',     bgCard: 'bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20',     printBg: '#f59e0b' },
    Green: { gradient: 'from-emerald-400 to-teal-500', icon: <CheckCircle2 className="w-11 h-11 text-white mb-3 drop-shadow-md" />, titleColor: 'text-emerald-600 dark:text-emerald-400', bgCard: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20', printBg: '#059669' },
  };
  const th        = themeMap[riskTier] || themeMap.Green;
  const tierLabel = riskTier === 'Red' ? t.red : riskTier === 'Amber' ? t.amber : t.green;
  const tierDesc  = riskTier === 'Red' ? t.redDesc : riskTier === 'Amber' ? t.amberDesc : t.greenDesc;

  // FIX 1: Two-page PDF generation
  const handleDownloadPDF = async () => {
    if (!printRef.current || !printRef2.current) return;
    recordTelemetry(postalSector, { action: 'download_pdf', score, language: lang, ctaTier });

    const captureOpts = {
      scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff',
      onclone: (doc) => {
        doc.documentElement.classList.remove('dark');
        doc.querySelectorAll('svg').forEach(svg => {
          svg.setAttribute('width',  svg.getBoundingClientRect().width);
          svg.setAttribute('height', svg.getBoundingClientRect().height);
        });
      },
    };

    try {
      const [canvas1, canvas2] = await Promise.all([
        html2canvas(printRef.current,  captureOpts),
        html2canvas(printRef2.current, { ...captureOpts, onclone: (doc) => doc.documentElement.classList.remove('dark') }),
      ]);

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pw  = pdf.internal.pageSize.getWidth();   // 210 mm
      const ph  = pdf.internal.pageSize.getHeight();  // 297 mm

      const addCanvasPage = (canvas) => {
        const img = canvas.toDataURL('image/png');
        let rw = pw, rh = (canvas.height * rw) / canvas.width, mx = 0;
        if (rh > ph) { rh = ph; rw = (canvas.width * rh) / canvas.height; mx = (pw - rw) / 2; }
        pdf.addImage(img, 'PNG', mx, 0, rw, rh);
      };

      addCanvasPage(canvas1);
      pdf.addPage();
      addCanvasPage(canvas2);

      pdf.save(`NEXUS_AURA_Result_${riskTier}_${activeSessionId}.pdf`);
    } catch (err) { console.error('[NEXUS] PDF generation error:', err); }
  };

  const handleShare = async () => {
    recordTelemetry(postalSector, { action: 'share_result', score, language: lang });
    const actionText = ctaBanner.action[lang] || ctaBanner.action.en;
    const shareText  = `${t.sharePrefix} ${tierLabel}.\n\n${t.shareTopRec} ${actionText}\n\n${t.sharePathway}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'NEXUS AURA Analysis', text: shareText, url: nexusUrl }); } catch {}
    }
  };

  const handleResourceClick = (id, url) => {
    recordTelemetry(postalSector, { action: `click_${id}`, score, language: lang });
    window.open(url, '_blank');
  };

  if (!hasState) return null;

  // ── LOADING ────────────────────────────────────────────────────────────────
  if (isGenerating) {
    return (
      <div className="min-h-screen w-full bg-stone-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6">
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-teal-500/15 rounded-full blur-[100px] pointer-events-none animate-pulse" />
        <div className="relative z-10 flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl shadow-xl flex items-center justify-center border border-slate-200 dark:border-slate-700">
            <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white max-w-xs">{t.loading}</h2>
          {/* FIX 4: animate-pulse replaces custom keyframe that required tailwind.config */}
          <div className="w-48 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full w-1/2 bg-teal-500 rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-stone-50 dark:bg-slate-950 transition-colors duration-700 flex flex-col items-center py-12 px-4 md:px-6 relative overflow-x-hidden font-sans">

      {/* ── HIDDEN PDF TEMPLATES (off-screen) ──────────────────────────────── */}
      <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>

        {/* ── PAGE 1: Clinical Report ────────────────────────────────────── */}
        <div ref={printRef} className="w-[794px] bg-white text-black flex flex-col" style={{ fontFamily: 'Arial, sans-serif' }}>

          {/* PDF Header */}
          <div style={{ background: '#0f172a', padding: '28px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <img src={`${baseUrl}/nexus.png`} alt="NEXUS" crossOrigin="anonymous" style={{ width: 40, height: 40, objectFit: 'contain' }} />
              <div>
                <div style={{ color: 'white', fontWeight: 900, fontSize: 22, letterSpacing: 6 }}>NEXUS</div>
                <div style={{ color: '#94a3b8', fontWeight: 700, fontSize: 10, letterSpacing: 4, marginTop: 2 }}>{t.reportTitle}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 12, color: '#94a3b8', lineHeight: 1.8 }}>
              <div><strong style={{ color: 'white' }}>{t.date}:</strong> {formattedDate}</div>
              <div><strong style={{ color: 'white' }}>{t.assessmentId}:</strong> {activeSessionId}</div>
              {previousSessionId && <div><strong style={{ color: 'white' }}>{t.prevId}:</strong> {previousSessionId}</div>}
              <div><strong style={{ color: 'white' }}>{t.postalSector}:</strong> Sector {postalSector}</div>
            </div>
          </div>

          <div style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Risk Tier */}
            <div style={{ background: th.printBg, borderRadius: 12, padding: '28px 32px' }}>
              <div style={{ color: 'white', fontWeight: 900, fontSize: 26, marginBottom: 10 }}>{tierLabel}</div>
              <div style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 700, fontSize: 14, lineHeight: 1.6, marginBottom: 14 }}>{tierDesc}</div>
              {(data.sdohFinancial || data.sdohSocial || hasPsycho) && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.25)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.sdohFinancial && <div style={{ color: 'white', fontSize: 12, fontWeight: 700 }}>• {t.sdohFinText}</div>}
                  {data.sdohSocial    && <div style={{ color: 'white', fontSize: 12, fontWeight: 700 }}>• {t.sdohSocText}</div>}
                  {hasPsycho          && <div style={{ color: 'white', fontSize: 12, fontWeight: 700 }}>• {t.sdohPsychoText}</div>}
                </div>
              )}
            </div>

            {/* PAVS Metrics */}
            {data?.pavsScore != null && (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 28px' }}>
                <div style={{ fontWeight: 900, fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 3, marginBottom: 14 }}>{t.pavsTitle}</div>
                <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
                  {[
                    { value: data.pavsScore,           label: t.pavsWeekly },
                    { value: data.pavsDays    ?? '–',  label: t.pavsDays   },
                    { value: data.pavsMinutes ?? '–',  label: t.pavsMins   },
                  ].map(({ value, label }, i) => (
                    <div key={i} style={{ flex: 1, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 10px', textAlign: 'center' }}>
                      <div style={{ fontWeight: 900, fontSize: 24, color: '#0f172a' }}>{value}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, fontWeight: 600 }}>{label}</div>
                    </div>
                  ))}
                  <div style={{ flex: 2, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 11, color: getPavsTier(data.pavsScore) === 'active' ? '#059669' : getPavsTier(data.pavsScore) === 'meets' ? '#0d9488' : '#d97706', marginBottom: 4 }}>
                      {getPavsTier(data.pavsScore) === 'active' ? t.pavsActive : getPavsTier(data.pavsScore) === 'meets' ? t.pavsMeets : t.pavsBelow}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.5 }}>{t.pavsThreshold}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Primary Action Banner */}
            <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 12, padding: '20px 28px' }}>
              <div style={{ fontWeight: 900, fontSize: 11, color: '#0f766e', textTransform: 'uppercase', letterSpacing: 3, marginBottom: 10 }}>{t.primaryAction}</div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#134e4a', lineHeight: 1.6 }}>
                {ctaBanner.emoji} {ctaBanner.action[lang] || ctaBanner.action.en}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: '#0d9488', fontWeight: 600 }}>{ctaBanner.url}</div>
            </div>

            {/* Resources Grid */}
            <div>
              <div style={{ fontWeight: 900, fontSize: 13, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 3, borderBottom: '2px solid #e2e8f0', paddingBottom: 10, marginBottom: 20 }}>{t.resources}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {suggestedResources.map((resource) => {
                  const c = resource[lang] || resource.en;
                  return (
                    <div key={resource.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 44, height: 44, flexShrink: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <img src={`${baseUrl}${resource.logo}`} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div style={{ fontWeight: 900, fontSize: 13, color: '#0f172a', lineHeight: 1.3 }}>{c.title}</div>
                      </div>
                      <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.55 }}>{c.desc}</div>
                      <div style={{ fontSize: 10, color: '#0d9488', fontWeight: 700, background: '#f0fdfa', padding: '6px 10px', borderRadius: 6, border: '1px solid #99f6e4', wordBreak: 'break-all' }}>
                        <span style={{ color: '#64748b', fontWeight: 600, marginRight: 4 }}>{t.webLink}</span>{resource.url}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* PDF Footer */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img src={qrCodeUrl} alt="QR" crossOrigin="anonymous" style={{ width: 70, height: 70, border: '1px solid #e2e8f0', borderRadius: 6, padding: 4 }} />
                <div>
                  <div style={{ fontWeight: 900, fontSize: 10, textTransform: 'uppercase', letterSpacing: 3, color: '#0f172a' }}>{t.scanQR}</div>
                  <div style={{ color: '#0d9488', fontSize: 11, fontWeight: 700, marginTop: 3 }}>{nexusUrl}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 900, fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 2 }}>{t.assessmentId}</div>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: '#0f172a', marginTop: 2 }}>{activeSessionId}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── PAGE 2: Clinical Governance, Disclaimers, References, M3 ─────── */}
        <div ref={printRef2}
          style={{
            width: '794px',
            minHeight: '1123px',
            background: '#ffffff',
            padding: '40px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            boxSizing: 'border-box',
            fontFamily: 'Arial, sans-serif',
          }}>

          {/* Page 2 Header */}
          <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ color: '#0f172a', fontWeight: 900, fontSize: 18, letterSpacing: 2 }}>NEXUS AURA</div>
                <div style={{ color: '#64748b', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, marginTop: 2 }}>Clinical Governance and Disclaimers</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
                <div>{t.assessmentId}: {activeSessionId}</div>
                <div>{t.date}: {formattedDate}</div>
              </div>
            </div>
          </div>

          {/* Medical Disclaimer */}
          <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '8px', padding: '20px' }}>
            <div style={{ fontWeight: 900, fontSize: 12, color: '#be123c', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: 1 }}>
              Important Medical Disclaimer
            </div>
            <div style={{ fontSize: 11, color: '#4c0519', lineHeight: 1.7 }}>
              This NEXUS AURA report is an initial community health navigation tool and <strong>does not constitute medical advice, diagnosis, or a clinical treatment plan</strong>. The risk stratification and physical activity recommendations are algorithmically generated for educational and community triage purposes only. Always consult a qualified healthcare professional or your Healthier SG GP before making significant changes to your lifestyle, diet, or exercise routine. If you are experiencing chest pain, dizziness, or any acute symptoms, please seek immediate medical attention.
            </div>
          </div>

          {/* Academic & Clinical Grounding */}
          <div>
            <div style={{ fontWeight: 900, fontSize: 12, color: '#0f172a', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
              Academic and Clinical Grounding
            </div>
            <ul style={{ fontSize: 11, color: '#475569', lineHeight: 1.9, paddingLeft: '20px', margin: 0 }}>
              <li><strong>Physical Activity Screening:</strong> American College of Sports Medicine (ACSM) Physical Activity Vital Sign (PAVS) — validated 2-question screening tool for point-of-care PA assessment.</li>
              <li><strong>National Activity Targets:</strong> Sport Singapore Physical Activity Guidelines (SPAG) — 150–300 mins/week moderate-intensity aerobic activity for adults.</li>
              <li><strong>Psychological Wellbeing:</strong> BioPsychoSocial Risk Screener Version II (BPS-RS II), Psychological Domain Item P22 — PHQ-2 aligned, 2-week timeframe.</li>
              <li><strong>Social Isolation:</strong> Adapted from the Lubben Social Network Scale (LSNS-6) — validated for community-dwelling adults in Singapore (alpha 0.80–0.89).</li>
              <li><strong>Food Insecurity:</strong> Lien Centre for Social Innovation Food Insufficiency Screen — validated 2-question instrument for Singapore context.</li>
              <li><strong>Financial Adequacy:</strong> Duke-NUS Medical School Perceived Income Adequacy Scale — 3-level validated screen for subjective financial stability.</li>
              <li><strong>Housing Risk:</strong> BPS-RS II Housing Schema — 1–2 Room HDB rental as geographic social risk indicator aligned with SingHealth population health mapping.</li>
              <li><strong>Community Navigation:</strong> Northern Singapore Health Ecosystem Report (March 2026) — §5.7 8-Tier Community Call-to-Action Matrix.</li>
            </ul>
          </div>

          {/* Data Governance */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '18px 20px' }}>
            <div style={{ fontWeight: 900, fontSize: 11, color: '#0f172a', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: 1 }}>
              Data Governance and Privacy
            </div>
            <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.7 }}>
              All data collected through the NEXUS AURA system is de-identified at the point of capture. Postal sector data is used solely for geographic resource mapping and is not linked to any identifiable personal information. This assessment does not collect, store, or transmit NRIC, name, contact, or financial account information. Aggregated, anonymised data may be used to improve community health programming in Northern Singapore.
            </div>
          </div>

          {/* M3 Network — pushed to bottom */}
          <div style={{ marginTop: 'auto', background: 'linear-gradient(135deg, #f0fdfa 0%, #ecfdf5 100%)', borderRadius: '12px', padding: '28px 32px', textAlign: 'center', border: '1px solid #99f6e4' }}>
            <div style={{ fontWeight: 900, fontSize: 16, color: '#0f766e', marginBottom: '10px', letterSpacing: 1 }}>
              Join the Northern Community Nodes
            </div>
            <div style={{ fontSize: 12, color: '#475569', marginBottom: '20px', lineHeight: 1.6, maxWidth: '580px', margin: '0 auto 20px' }}>
              This initiative is proudly piloted in conjunction with the <strong style={{ color: '#0f766e' }}>M3 Network</strong> on <strong>11 April 2026</strong>. Stay connected with your local community nodes in the North for programmes, events, and peer support.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', maxWidth: '560px', margin: '0 auto', textAlign: 'left' }}>
              {[
                { label: 'Web',  value: 'm3.gov.sg/m3-towns/north' },
                { label: 'FB',   value: 'facebook.com/M3atWoodlands' },
                { label: 'FB',   value: 'facebook.com/M3atMarsilingYewTee' },
                { label: 'FB',   value: 'facebook.com/p/M3-at-Nee-Soon-100068636709214' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ fontWeight: 900, fontSize: 10, color: '#0d9488', textTransform: 'uppercase', letterSpacing: 1, minWidth: 24, paddingTop: 2 }}>{item.label}</span>
                  <span style={{ fontWeight: 600, fontSize: 11, color: '#0f766e', wordBreak: 'break-all', lineHeight: 1.5 }}>{item.value}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '20px', fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
              Scan the QR code on Page 1 to access the NEXUS digital portal
            </div>
          </div>

        </div>
      </div>

      {/* ── BACKGROUND ORBS ─────────────────────────────────────────────────── */}
      <div className={`fixed top-0 left-0 w-[700px] h-[700px] bg-teal-500/8 rounded-full blur-[120px] pointer-events-none transition-opacity duration-1000 ${animate ? 'opacity-100' : 'opacity-0'}`} />
      <div className={`fixed bottom-0 right-0 w-[500px] h-[500px] bg-emerald-500/8 rounded-full blur-[100px] pointer-events-none transition-opacity duration-1000 delay-300 ${animate ? 'opacity-100' : 'opacity-0'}`} />

      {/* ── MAIN CONTENT ────────────────────────────────────────────────────── */}
      <div className={`relative z-10 w-full max-w-2xl transition-all duration-700 ${animate ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>

        {/* Top nav */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-3 px-1 flex-wrap">
          <button onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 py-2 bg-white/70 dark:bg-slate-800/70 backdrop-blur-md text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 font-bold text-xs uppercase tracking-widest rounded-full border border-slate-200 dark:border-slate-700 shadow-sm transition-all group">
            <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> {t.back}
          </button>

          <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">

            {/* FIX 2: Language selector — matches ConventionalForm style */}
            <div className="flex items-center gap-1 bg-white/70 dark:bg-slate-800/70 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-full px-1.5 py-1 shadow-sm">
              <Globe size={11} className="text-slate-400 ml-1" />
              {LANGS.map(l => (
                <button key={l.code} onClick={() => switchLang(l.code)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-black transition-all ${lang === l.code ? 'bg-teal-500 text-white' : 'text-slate-500 hover:text-teal-600'}`}>
                  {l.label}
                </button>
              ))}
            </div>

            <button onClick={toggleTheme}
              className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full shadow-sm hover:-translate-y-0.5 transition-all">
              {isDark ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} className="text-slate-500" />}
            </button>
            <button onClick={handleShare}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs uppercase tracking-widest rounded-full border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
              <Share2 size={13} /> {t.share}
            </button>
            <button onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white font-bold text-xs uppercase tracking-widest rounded-full shadow-sm hover:bg-teal-700 hover:-translate-y-0.5 transition-all">
              <Download size={13} /> {t.download}
            </button>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-[#111827] rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">

          {/* Risk hero header */}
          <div className={`px-8 py-10 bg-gradient-to-br ${th.gradient} text-center relative overflow-hidden flex flex-col items-center`}>
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-36 h-36 bg-black/10 rounded-full blur-xl -ml-8 -mb-8 pointer-events-none" />
            <div className="relative z-10 flex flex-col items-center">
              {th.icon}
              <p className="text-xs font-bold text-white/80 uppercase tracking-[0.2em] mb-2">{t.title}</p>
              <div className="px-8 py-3 bg-white/20 rounded-2xl backdrop-blur-md border border-white/30 text-2xl md:text-3xl font-black text-white shadow-lg">
                {tierLabel}
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 md:p-8 space-y-6">

            {/* AURA analysis */}
            <div className={`p-5 rounded-2xl border ${th.bgCard}`}>
              <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${th.titleColor}`}>AURA Smart Analysis</p>
              <p className="text-sm md:text-base text-slate-700 dark:text-slate-300 leading-relaxed font-medium">{tierDesc}</p>
            </div>

            <PavsPanel data={data} t={t} />
            <PrimaryActionBanner ctaTier={ctaTier} t={t} lang={lang} />
            <SdohFlags data={data} t={t} previousSessionId={previousSessionId} />

            {/* Resource grid */}
            <div className="pt-2">
              <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                <Zap size={14} className="text-teal-500" /> {t.cta}
              </h2>
              <div className="space-y-3">
                {suggestedResources.map(r => (
                  <ResourceCard key={r.id} resource={r} lang={lang} baseUrl={baseUrl} onClick={() => handleResourceClick(r.id, r.url)} />
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <img src={`${baseUrl}/nexus.png`} alt="NEXUS" crossOrigin="anonymous" className="w-10 h-10 object-contain" />
                <div>
                  <p className="font-black text-slate-800 dark:text-slate-200 tracking-widest text-xs uppercase leading-none">NEXUS</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t.reportTitle}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t.assessmentId}</p>
                <p className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300">{activeSessionId}</p>
                {previousSessionId && <p className="text-[9px] font-mono text-slate-400 mt-0.5">Prev: {previousSessionId}</p>}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
