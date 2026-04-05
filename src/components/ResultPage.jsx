import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { Download, Share2, ArrowLeft, ExternalLink, ShieldAlert, Activity, CheckCircle2, Loader2, TrendingUp, Sun, Moon } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { recordTelemetry } from '../utils/telemetry';

const DICTIONARY = {
  en: {
    loading: 'AURA is scanning live community resources in your area...',
    title: 'Your Assessment Result',
    red: 'High Needs (Red)',
    amber: 'Moderate Needs (Amber)',
    green: 'Low Needs (Green)',
    redDesc: 'AURA Analysis: Your risk profile indicates a need for supervised care. We highly recommend consulting a healthcare professional before starting a new exercise programme.',
    amberDesc: 'AURA Analysis: You have moderate needs. Consider gradually increasing your activity levels and exploring structured community resources.',
    greenDesc: 'AURA Analysis: Excellent! You meet the physical activity guidelines. Keep up the great work and maintain your routine.',
    sdohFinText: 'We noted that cost is a concern for you. We have prioritised free and fully subsidised community options below.',
    sdohSocText: 'Staying connected is vital for your health. We have included community network programmes to help you meet new people.',
    sdohPsychoText: 'Your mental wellbeing is just as important as your physical health. We have added supportive emotional wellness resources for you.',
    trendActive: 'Longitudinal Tracking Active',
    trendDesc: 'Your results have been linked to your previous assessment to monitor your clinical progress over time.',
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
    scanQR: 'Scan to access digital portal',
    webLink: 'Website: '
  },
  ms: {
    loading: 'AURA sedang mengimbas sumber komuniti langsung di kawasan anda...',
    title: 'Keputusan Penilaian Anda',
    red: 'Keperluan Tinggi (Merah)',
    amber: 'Keperluan Sederhana (Kuning)',
    green: 'Keperluan Rendah (Hijau)',
    redDesc: 'Analisis AURA: Profil risiko anda menunjukkan keperluan untuk penjagaan yang diawasi. Sila berunding dengan profesional penjagaan kesihatan terlebih dahulu.',
    amberDesc: 'Analisis AURA: Anda mempunyai keperluan sederhana. Pertimbangkan untuk meningkatkan tahap aktiviti anda secara beransur-ansur.',
    greenDesc: 'Analisis AURA: Cemerlang! Anda memenuhi garis panduan aktiviti fizikal. Teruskan usaha yang baik.',
    sdohFinText: 'Kami mengambil maklum bahawa kos adalah kebimbangan anda. Kami telah mengutamakan pilihan komuniti percuma dan bersubsidi penuh di bawah.',
    sdohSocText: 'Kekal berhubung adalah penting untuk kesihatan anda. Kami telah menyertakan program rangkaian komuniti untuk membantu anda berjumpa orang baharu.',
    sdohPsychoText: 'Kesejahteraan mental anda sama pentingnya dengan kesihatan fizikal anda. Kami telah menambah sumber sokongan emosi untuk anda.',
    trendActive: 'Penjejakan Membujur Aktif',
    trendDesc: 'Keputusan anda telah dipautkan ke penilaian lepas anda untuk memantau kemajuan klinikal anda.',
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
    scanQR: 'Imbas untuk akses portal digital',
    webLink: 'Laman Web: '
  },
  zh: {
    loading: 'AURA 正在扫描您所在地区的实时社区资源...',
    title: '您的评估结果',
    red: '高需求 (红色)',
    amber: '中等需求 (琥珀色)',
    green: '低需求 (绿色)',
    redDesc: 'AURA分析：您的风险状况表明需要有监督的护理。我们强烈建议您在开始新的锻炼计划之前咨询医生。',
    amberDesc: 'AURA分析：您有中等需求。建议逐步增加您的活动量，并探索社区资源。',
    greenDesc: 'AURA分析：太棒了！您符合身体活动指南。请继续保持良好的锻炼习惯。',
    sdohFinText: '我们注意到费用是您的一个顾虑。我们在下方优先列出了免费和全额补贴的社区选项。',
    sdohSocText: '保持社交联系对健康至关重要。我们包含了社区网络计划，帮助您结识新朋友。',
    sdohPsychoText: '您的心理健康与身体健康同等重要。我们为您添加了情感支持资源。',
    trendActive: '纵向跟踪已激活',
    trendDesc: '您的结果已链接到您之前的评估，以监测您的临床进展。',
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
    scanQR: '扫描以访问数字门户',
    webLink: '网址: '
  },
  ta: {
    loading: 'உங்கள் பகுதியில் உள்ள நேரடி சமூக வளங்களை AURA ஸ்கேன் செய்கிறது...',
    title: 'உங்கள் மதிப்பீட்டு முடிவு',
    red: 'அதிக தேவை (சிவப்பு)',
    amber: 'மிதமான தேவை (ஆம்பர்)',
    green: 'குறைந்த தேவை (பச்சை)',
    redDesc: 'AURA பகுப்பாய்வு: உங்கள் ஆபத்து விவரக்குறிப்பு மேற்பார்வையிடப்பட்ட கவனிப்பின் அவசியத்தைக் குறிக்கிறது. மருத்துவரை அணுகுமாறு பரிந்துரைக்கிறோம்.',
    amberDesc: 'AURA பகுப்பாய்வு: உங்களுக்கு மிதமான தேவைகள் உள்ளன. உங்கள் செயல்பாட்டு நிலைகளை படிப்படியாக அதிகரிப்பதைக் கருத்தில் கொள்ளுங்கள்.',
    greenDesc: 'AURA பகுப்பாய்வு: அருமை! நீங்கள் உடல் செயல்பாட்டு வழிகாட்டுதல்களைச் சந்திக்கிறீர்கள். தொடர்ந்து நல்ல முறையில் செயல்படுங்கள்.',
    sdohFinText: 'செலவு உங்களுக்கு ஒரு கவலை என்பதை நாங்கள் கவனித்தோம். இலவச மற்றும் மானிய விருப்பங்களுக்கு முன்னுரிமை அளித்துள்ளோம்.',
    sdohSocText: 'தொடர்பில் இருப்பது உங்கள் ஆரோக்கியத்திற்கு முக்கியமானது. புதியவர்களைச் சந்திக்க உதவும் சமூக திட்டங்களைச் சேர்த்துள்ளோம்.',
    sdohPsychoText: 'உங்கள் மனநலமும் உங்கள் உடல் நலனைப் போலவே முக்கியமானது. உங்களுக்கான உணர்ச்சிபூர்வமான ஆதரவு வளங்களைச் சேர்த்துள்ளோம்.',
    trendActive: 'நீண்டகால கண்காணிப்பு செயலில் உள்ளது',
    trendDesc: 'உங்கள் மருத்துவ முன்னேற்றத்தைக் கண்காணிக்க உங்கள் முடிவுகள் முந்தைய மதிப்பீட்டுடன் இணைக்கப்பட்டுள்ளன.',
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
    scanQR: 'டிஜிட்டல் போர்ட்டலை அணுக ஸ்கேன் செய்யவும்',
    webLink: 'இணையதளம்: '
  }
};

const ALL_RESOURCES = {
  ssmc_kkh: { id: 'ssmc_kkh', url: 'https://for.sg/exercise', logo: '/logos/ssmckkh.png', en: { title: 'SSMC@KKH Exercise Resources', desc: 'Expert clinical exercise prescriptions and safety resources for the community.' }, ms: { title: 'Sumber Senaman SSMC@KKH', desc: 'Preskripsi senaman klinikal pakar dan sumber keselamatan untuk komuniti.' }, zh: { title: 'SSMC@KKH 运动资源', desc: '为社区提供的专家临床运动处方和安全资源。' }, ta: { title: 'SSMC@KKH உடற்பயிற்சி வளங்கள்', desc: 'சமூகத்திற்கான நிபுணர் மருத்துவ உடற்பயிற்சி மற்றும் பாதுகாப்பு வளங்கள்.' } },
  spag: { id: 'spag', url: 'https://for.sg/spag', logo: '/logos/sportsg.png', en: { title: 'Singapore Physical Activity Guidelines', desc: 'National guidelines and recommendations for physical activity and sedentary behaviour.' }, ms: { title: 'Garis Panduan Aktiviti Fizikal', desc: 'Garis panduan kebangsaan untuk aktiviti fizikal dan tingkah laku sedentari.' }, zh: { title: '新加坡体力活动指南', desc: '国家关于体力活动和久坐行为的指南。' }, ta: { title: 'சிங்கப்பூர் உடல் செயல்பாட்டு வழிகாட்டுதல்கள்', desc: 'உடல் செயல்பாடு மற்றும் உட்கார்ந்த நடத்தைக்கான தேசிய வழிகாட்டுதல்கள்.' } },
  healthier_sg: { id: 'healthier_sg', url: 'https://www.healthiersg.gov.sg/', logo: '/logos/healthiersg.png', en: { title: 'Healthier SG GP Review', desc: 'Schedule a fully subsidised annual check-in with your enrolled GP.' }, ms: { title: 'Semakan Klinik GP Healthier SG', desc: 'Jadualkan pemeriksaan tahunan bersubsidi penuh dengan doktor anda.' }, zh: { title: 'Healthier SG 全科医生复查', desc: '与您的签约医生安排全额补贴的年度检查。' }, ta: { title: 'Healthier SG GP மதிப்பாய்வு', desc: 'உங்கள் மருத்துவரிடம் முழு மானியத்துடன் கூடிய பரிசோதனையை திட்டமிடுங்கள்.' } },
  start2move: { id: 'start2move', url: 'https://www.healthhub.sg/programmes/letsmoveit/start2move', logo: '/logos/hpb.png', en: { title: 'HPB Start2Move', desc: 'A free 6-session beginner programme to help you start exercising safely.' }, ms: { title: 'Program Start2Move HPB', desc: 'Program percuma 6 sesi untuk pemula untuk mula bersenam dengan selamat.' }, zh: { title: 'HPB Start2Move 计划', desc: '免费的6节初学者计划，帮助您安全地开始锻炼。' }, ta: { title: 'HPB Start2Move திட்டம்', desc: 'பாதுகாப்பாக உடற்பயிற்சியைத் தொடங்க இலவச 6 அமர்வு தொடக்கத் திட்டம்.' } },
  active_health: { id: 'active_health', url: 'https://www.myactivesg.com/active-health', logo: '/logos/activehealth.png', en: { title: 'Active Health Labs', desc: 'Supervised clinical exercise and metabolic health programmes by SportSG.' }, ms: { title: 'Makmal Active Health', desc: 'Program senaman klinikal dan kesihatan metabolik yang diawasi oleh SportSG.' }, zh: { title: 'Active Health 实验室', desc: 'SportSG 提供的有监督临床锻炼和代谢健康计划。' }, ta: { title: 'Active Health ஆய்வகங்கள்', desc: 'SportSG-ன் மருத்துவ உடற்பயிற்சி மற்றும் சுகாதார திட்டங்கள்.' } },
  activesg_gym: { id: 'activesg_gym', url: 'https://www.myactivesg.com/', logo: '/logos/activesg.png', en: { title: 'ActiveSG Facilities', desc: 'Access affordable fitness gyms, pools, and group workout classes near you.' }, ms: { title: 'Fasiliti ActiveSG', desc: 'Akses gim, kolam renang dan kelas senaman berkumpulan berpatutan berhampiran anda.' }, zh: { title: 'ActiveSG 设施', desc: '使用您附近价格实惠的健身房、游泳池和团体锻炼课程。' }, ta: { title: 'ActiveSG வசதிகள்', desc: 'மலிவு விலையில் உடற்பயிற்சி நிலையங்கள் மற்றும் வகுப்புகளை அணுகவும்.' } },
  pa_courses: { id: 'pa_courses', url: 'https://www.onepa.gov.sg/', logo: '/logos/pa.png', en: { title: 'PA Community Courses', desc: 'Join local Tai Chi, Yoga, or Zumba classes at your nearest Community Club.' }, ms: { title: 'Kursus Komuniti PA', desc: 'Sertai kelas Tai Chi, Yoga, atau Zumba di Kelab Komuniti terdekat anda.' }, zh: { title: 'PA 社区课程', desc: '在离您最近的社区俱乐部参加太极拳、瑜伽或尊巴舞课程。' }, ta: { title: 'PA சமூக படிப்புகள்', desc: 'உங்கள் அருகிலுள்ள சமூக மன்றத்தில் உடற்பயிற்சி வகுப்புகளில் சேரவும்.' } },
  singhealth_healthup: { id: 'singhealth_healthup', url: 'https://www.singhealth.com.sg/community-care/level-up-with-healthup', logo: '/logos/singhealth.png', en: { title: 'SingHealth Health UP!', desc: 'Join community wellness programmes with guidance from Wellbeing Coordinators.' }, ms: { title: 'SingHealth Health UP!', desc: 'Sertai program kesejahteraan dengan bimbingan Penyelaras Kesejahteraan.' }, zh: { title: 'SingHealth Health UP!', desc: '参加社区健康计划并获得健康协调员的指导。' }, ta: { title: 'SingHealth Health UP!', desc: 'சமூக நலத் திட்டங்களில் வழிகாட்டுதலுடன் சேரவும்.' } },
  nuhs_chp: { id: 'nuhs_chp', url: 'https://www.nuhs.edu.sg/care-in-the-community', logo: '/logos/nuhs.png', en: { title: 'NUHS Community Health Post', desc: 'Access health screenings and lifestyle coaching in your neighbourhood.' }, ms: { title: 'Pos Kesihatan Komuniti NUHS', desc: 'Akses saringan kesihatan dan bimbingan gaya hidup di kejiranan anda.' }, zh: { title: 'NUHS 社区卫生站', desc: '在您的社区获得健康筛查和生活方式辅导。' }, ta: { title: 'NUHS சமூக சுகாதார நிலையம்', desc: 'சுகாதார பரிசோதனைகள் மற்றும் வழிகாட்டுதலை அணுகவும்.' } },
  nhg_coaches: { id: 'nhg_coaches', url: 'https://form.gov.sg/663c452b463eff5b7438b117', logo: '/logos/nhg.png', en: { title: 'NHG Health Coaches', desc: 'Connect with a Health Coach to set personalised goals for a healthier lifestyle.' }, ms: { title: 'Jurulatih Kesihatan NHG', desc: 'Berhubung dengan Jurulatih Kesihatan untuk menetapkan matlamat peribadi anda.' }, zh: { title: 'NHG 健康教练', desc: '与健康教练联系，设定个性化目标。' }, ta: { title: 'NHG சுகாதார பயிற்சியாளர்கள்', desc: 'தனிப்பயனாக்கப்பட்ட இலக்குகளை அமைக்க பயிற்சியாளருடன் இணையுங்கள்.' } },
  aic_aac: { id: 'aic_aac', url: 'https://www.aic.sg/care-services/active-ageing-centres', logo: '/logos/aic.png', en: { title: 'Active Ageing Centres (AAC)', desc: 'Neighbourhood hubs offering active programmes and social networks.' }, ms: { title: 'Pusat Penuaan Aktif (AAC)', desc: 'Hab kejiranan yang menawarkan program aktif dan rangkaian sosial.' }, zh: { title: '活跃乐龄中心 (AAC)', desc: '提供活跃计划和社交网络的社区中心。' }, ta: { title: 'சுறுசுறுப்பான முதுமை மையங்கள்', desc: 'சுறுசுறுப்பான திட்டங்கள் மற்றும் சமூக வலைப்பின்னல்களை வழங்கும் மையங்கள்.' } },
  touch_community: { id: 'touch_community', url: 'https://www.touch.org.sg/', logo: '/logos/touch.png', en: { title: 'TOUCH Community Services', desc: 'Holistic social support, befriending, and caregiving resources.' }, ms: { title: 'Perkhidmatan Komuniti TOUCH', desc: 'Sokongan sosial holistik, bantuan rakan, dan sumber penjagaan.' }, zh: { title: 'TOUCH 社区服务', desc: '全方位的社会支持、交友和护理资源。' }, ta: { title: 'TOUCH சமூக சேவைகள்', desc: 'முழுமையான சமூக ஆதரவு மற்றும் பராமரிப்பு வளங்கள்.' } },
  society_wings: { id: 'society_wings', url: 'https://www.wings.sg/', logo: '/logos/wings.png', en: { title: 'Society for WINGS', desc: 'Empowering women aged 40+ with health, wealth, and happiness programmes.' }, ms: { title: 'Persatuan untuk WINGS', desc: 'Memperkasakan wanita 40+ dengan program kesihatan dan kebahagiaan.' }, zh: { title: 'WINGS 协会', desc: '为 40 岁以上的女性提供健康、财富和幸福计划。' }, ta: { title: 'WINGS சங்கம்', desc: '40+ வயதுடைய பெண்களுக்கான சுகாதாரம் மற்றும் மகிழ்ச்சி திட்டங்கள்.' } },
  singhealth_careline: { id: 'singhealth_careline', url: 'https://www.singhealth.com.sg/community-care/careline', logo: '/logos/careline.png', en: { title: 'SingHealth CareLine', desc: 'A 24/7 personal tele-befriending service providing social support for seniors.' }, ms: { title: 'SingHealth CareLine', desc: 'Perkhidmatan tele-rakan 24/7 yang menyediakan sokongan sosial untuk warga emas.' }, zh: { title: 'SingHealth CareLine', desc: '为老年人提供社会支持的 24/7 个人电话交友服务。' }, ta: { title: 'SingHealth CareLine', desc: 'முதியோர்களுக்கான 24/7 தொலைபேசி நட்பு சேவை.' } },
  financial_chas: { id: 'financial_chas', url: 'https://www.chas.sg/', logo: '/logos/chas.png', en: { title: 'CHAS & Medical Subsidies', desc: 'Discover financial support schemes for your community healthcare needs.' }, ms: { title: 'CHAS & Subsidi Perubatan', desc: 'Ketahui skim sokongan kewangan untuk keperluan penjagaan kesihatan komuniti anda.' }, zh: { title: 'CHAS 与医疗补贴', desc: '了解满足您社区医疗保健需求的财务支持计划。' }, ta: { title: 'CHAS & மருத்துவ மானியங்கள்', desc: 'உங்கள் சமூக சுகாதார தேவைகளுக்கான நிதி ஆதரவு திட்டங்களை கண்டறியவும்.' } },
  mental_wellness: { id: 'mental_wellness', url: 'https://www.mindline.sg/', logo: '/logos/mindline.png', en: { title: 'Mindline.sg Support', desc: 'Free, confidential emotional support and mental wellness tools.' }, ms: { title: 'Sokongan Mindline.sg', desc: 'Sokongan emosi percuma dan sulit serta alat kesejahteraan mental.' }, zh: { title: 'Mindline.sg 支持', desc: '免费、保密的情感支持和心理健康工具。' }, ta: { title: 'Mindline.sg ஆதரவு', desc: 'இலவச, ரகசிய உணர்ச்சி ஆதரவு மற்றும் மனநல கருவிகள்.' } }
};

const getRegionalHealthSystem = (sector) => {
  const s = parseInt(sector, 10);
  if (isNaN(s)) return 'NHG';
  if (s >= 58 && s <= 71) return 'NUHS';
  if ((s >= 1 && s <= 27) || (s >= 31 && s <= 52) || s === 81) return 'SingHealth';
  return 'NHG'; 
};

const getRiskTier = (numericScore) => {
    if (numericScore >= 5) return 'Red';
    if (numericScore >= 2) return 'Amber';
    return 'Green';
};

export default function ResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  
  // ==========================================
  // RULE OF HOOKS FIX: All Hooks Declared Top-Level
  // ==========================================
  const [lang, setLang] = useState('en');
  const [animate, setAnimate] = useState(false);
  const [isGenerating, setIsGenerating] = useState(true);
  const [suggestedResources, setSuggestedResources] = useState([]);
  const [isDark, setIsDark] = useState(false);
  const printRef = useRef(null);

  // Safe Check for location state to prevent crashes during redirect
  const hasState = location.state && location.state.score !== undefined;
  
  useEffect(() => {
      if (!hasState) {
          navigate('/individuals/pathway', { replace: true });
      }
  }, [hasState, navigate]);

  // Safe Destructuring with Fallbacks
  const safeState = location.state || { score: 0, data: {}, postalSector: '00' };
  const { score, data, postalSector, sessionId, previousSessionId } = safeState;
  
  const riskTier = getRiskTier(score);
  const activeSessionId = sessionId || 'NX-' + Math.random().toString(36).substr(2, 9).toUpperCase();
  const formattedDate = new Date().toLocaleDateString('en-GB');
  
  const nexusOfficialUrl = 'https://for.sg/nexus';
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(nexusOfficialUrl)}`;
  const baseUrl = window.location.origin;

  // Theme Initialisation
  useEffect(() => {
    const storedTheme = localStorage.getItem('nexus-theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (storedTheme === 'dark' || (!storedTheme && systemPrefersDark)) {
        setIsDark(true);
        document.documentElement.classList.add('dark');
    } else {
        setIsDark(false);
        document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    if (newTheme) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('nexus-theme', 'dark');
    } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('nexus-theme', 'light');
    }
  };

  useEffect(() => {
    if (!hasState) return;

    const storedLang = localStorage.getItem('nexus_language');
    if (storedLang && DICTIONARY[storedLang]) setLang(storedLang);

    const generateActionPlan = () => {
      let plan = [];
      const rhs = getRegionalHealthSystem(postalSector);
      
      plan.push(ALL_RESOURCES.ssmc_kkh);
      plan.push(ALL_RESOURCES.spag);

      if (riskTier === 'Red') {
        plan.push(ALL_RESOURCES.healthier_sg);
        plan.push(ALL_RESOURCES.active_health);
      } else if (riskTier === 'Amber') {
        plan.push(ALL_RESOURCES.start2move);
        plan.push(ALL_RESOURCES.pa_courses);
      } else {
        plan.push(ALL_RESOURCES.activesg_gym);
        plan.push(ALL_RESOURCES.pa_courses);
      }
  
      if (rhs === 'SingHealth') {
        plan.push(ALL_RESOURCES.singhealth_healthup);
      } else if (rhs === 'NUHS') {
        plan.push(ALL_RESOURCES.nuhs_chp);
      } else {
        plan.push(ALL_RESOURCES.nhg_coaches);
      }
  
      if (data.psychoFlag) plan.push(ALL_RESOURCES.mental_wellness);
      
      if (data.sdohFinancial) {
          plan.push(ALL_RESOURCES.financial_chas);
          plan.push(ALL_RESOURCES.touch_community);
      }
      
      if (data.sdohSocial) {
          if (rhs === 'SingHealth') plan.push(ALL_RESOURCES.singhealth_careline);
          plan.push(ALL_RESOURCES.aic_aac);
          plan.push(ALL_RESOURCES.touch_community);
      }
      
      if (data.gender === 'Female' && (data.age === '36-64' || data.age === '65+')) {
          plan.push(ALL_RESOURCES.society_wings);
      }
  
      const uniquePlan = Array.from(new Set(plan.map(r => r.id))).map(id => plan.find(r => r.id === id));
      return uniquePlan.slice(0, 6);
    };

    setTimeout(() => {
      setSuggestedResources(generateActionPlan());
      setIsGenerating(false);
      setTimeout(() => setAnimate(true), 100);
    }, 1800);

  }, [riskTier, data, postalSector, hasState]);

  const t = DICTIONARY[lang] || DICTIONARY.en;

  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    recordTelemetry(postalSector, { action: 'download_pdf', score, language: lang });

    try {
      const element = printRef.current;
      
      const canvas = await html2canvas(element, { 
        scale: 2, 
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
            clonedDoc.documentElement.classList.remove('dark');
            const svgs = clonedDoc.querySelectorAll('svg');
            svgs.forEach(svg => {
                svg.setAttribute('width', svg.getBoundingClientRect().width);
                svg.setAttribute('height', svg.getBoundingClientRect().height);
            });
        }
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfPageHeight = pdf.internal.pageSize.getHeight();
      
      let renderWidth = pdfWidth;
      let renderHeight = (canvas.height * renderWidth) / canvas.width;
      
      let marginX = 0;

      if (renderHeight > pdfPageHeight) {
        renderHeight = pdfPageHeight; 
        renderWidth = (canvas.width * renderHeight) / canvas.height;
        marginX = (pdfWidth - renderWidth) / 2;
      }

      pdf.addImage(imgData, 'PNG', marginX, 0, renderWidth, renderHeight);
      pdf.save(`NEXUS_AURA_Result_${riskTier}_${activeSessionId}.pdf`);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  const handleShare = async () => {
    recordTelemetry(postalSector, { action: 'share_result', score, language: lang });
    const colorLabel = riskTier === 'Red' ? t.red : riskTier === 'Amber' ? t.amber : t.green;
    const ctaNames = suggestedResources.map(r => r[lang]?.title || r.en.title).join(', ');
    
    const shareText = `My NEXUS AURA Assessment result is: ${colorLabel}.\n\nRecommended for me: ${ctaNames}.\n\nDiscover your community pathway at NEXUS: ${nexusOfficialUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'NEXUS AURA Analysis', text: shareText, url: nexusOfficialUrl });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    } else {
      alert('Web Share API not supported in this browser. Please download the PDF instead.');
    }
  };

  const handleResourceClick = (resourceId, url) => {
    recordTelemetry(postalSector, { action: `click_resource_${resourceId}`, score, language: lang });
    window.open(url, '_blank');
  };

  const themeMap = {
    Red: {
      gradient: 'from-rose-500 to-red-600',
      icon: <ShieldAlert className="w-12 h-12 text-white mb-4 drop-shadow-md" />,
      titleColor: 'text-rose-600 dark:text-rose-400',
      bgCard: 'bg-rose-50 dark:bg-rose-500/10 border-rose-100 dark:border-rose-500/20',
      printBg: 'bg-rose-600',
      printText: 'text-white',
      printBorder: 'border-rose-500'
    },
    Amber: {
      gradient: 'from-amber-400 to-orange-500',
      icon: <Activity className="w-12 h-12 text-white mb-4 drop-shadow-md" />,
      titleColor: 'text-amber-600 dark:text-amber-500',
      bgCard: 'bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20',
      printBg: 'bg-amber-500',
      printText: 'text-white',
      printBorder: 'border-amber-500'
    },
    Green: {
      gradient: 'from-emerald-400 to-teal-500',
      icon: <CheckCircle2 className="w-12 h-12 text-white mb-4 drop-shadow-md" />,
      titleColor: 'text-emerald-600 dark:text-emerald-400',
      bgCard: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20',
      printBg: 'bg-emerald-600',
      printText: 'text-white',
      printBorder: 'border-emerald-500'
    }
  };

  const activeTheme = themeMap[riskTier] || themeMap.Green;

  if (!hasState) return null;

  if (isGenerating) {
    return (
      <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-indigo-500/20 rounded-full blur-[100px] pointer-events-none animate-pulse"></div>
        
        <div className="relative z-10 flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl shadow-xl flex items-center justify-center border border-slate-200 dark:border-slate-700">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{t.loading}</h2>
          <div className="w-48 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full animate-[progress_1.8s_ease-in-out_infinite] origin-left"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 transition-colors duration-700 flex flex-col items-center py-12 px-4 md:px-6 relative overflow-x-hidden font-sans">
      
      {/* HIDDEN PRINT TEMPLATE */}
      <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>
        <div 
            ref={printRef} 
            className="w-[794px] bg-white text-black flex flex-col border border-slate-200 shadow-sm"
            style={{ fontFamily: 'Arial, sans-serif' }}
        >
            <div className="bg-slate-900 px-10 py-8 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <img src={`${baseUrl}/nexus.png`} alt="NEXUS Logo" crossOrigin="anonymous" className="w-10 h-10 object-contain" />
                    <div>
                        <span className="text-3xl font-black text-white tracking-widest uppercase block leading-none">NEXUS</span>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1 block">{t.reportTitle}</span>
                    </div>
                </div>
                <div className="text-right space-y-1 text-sm font-medium text-slate-300">
                    <p><span className="font-bold text-white">{t.date}:</span> {formattedDate}</p>
                    <p><span className="font-bold text-white">{t.assessmentId}:</span> {activeSessionId}</p>
                    {previousSessionId && <p><span className="font-bold text-white">{t.prevId}:</span> {previousSessionId}</p>}
                    <p><span className="font-bold text-white">{t.postalSector}:</span> Sector {postalSector}</p>
                </div>
            </div>

            <div className="p-10 flex flex-col gap-8">
                <div className={`p-8 rounded-xl ${activeTheme.printBg} shadow-md`}>
                    <h2 className={`text-3xl font-black mb-3 ${activeTheme.printText}`}>
                        {riskTier === 'Red' ? t.red : riskTier === 'Amber' ? t.amber : t.green}
                    </h2>
                    <p className={`text-lg leading-relaxed mb-4 font-bold ${activeTheme.printText}`}>
                        {riskTier === 'Red' ? t.redDesc : riskTier === 'Amber' ? t.amberDesc : t.greenDesc}
                    </p>
                    <div className="space-y-2 mt-4 pt-4 border-t border-white/20">
                        {data.sdohFinancial && <p className={`text-sm font-bold ${activeTheme.printText}`}>• {t.sdohFinText}</p>}
                        {data.sdohSocial && <p className={`text-sm font-bold ${activeTheme.printText}`}>• {t.sdohSocText}</p>}
                        {data.psychoFlag && <p className={`text-sm font-bold ${activeTheme.printText}`}>• {t.sdohPsychoText}</p>}
                    </div>
                </div>

                <div>
                    <h3 className="text-xl font-black text-slate-900 border-b-2 border-slate-200 pb-3 mb-6 uppercase tracking-wider">{t.resources}</h3>
                    <div className="grid grid-cols-2 gap-6">
                        {suggestedResources.map((resource) => (
                            <div key={resource.id} className="p-6 border border-slate-200 rounded-xl bg-slate-50 flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center gap-4 mb-3">
                                        <div className="w-12 h-12 aspect-square shrink-0 bg-white rounded-md border border-slate-200 flex items-center justify-center overflow-hidden">
                                            <img 
                                                src={`${baseUrl}${resource.logo}`} 
                                                alt="Logo" 
                                                crossOrigin="anonymous"
                                                className="w-full h-full object-cover" 
                                            />
                                        </div>
                                        <h4 className="font-black text-slate-900 text-lg leading-tight">{resource[lang]?.title || resource.en.title}</h4>
                                    </div>
                                    <p className="text-sm text-slate-600 mb-5">{resource[lang]?.desc || resource.en.desc}</p>
                                </div>
                                <p className="text-xs font-mono text-indigo-700 break-all bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                                    <span className="font-bold text-slate-500 mr-1">{t.webLink}</span>
                                    {resource.url}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-auto pt-8 border-t border-slate-200 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <img src={qrCodeUrl} alt="QR Code" crossOrigin="anonymous" className="w-20 h-20 border border-slate-200 rounded p-1" />
                        <div className="text-sm text-slate-500 font-medium">
                            <p className="font-black text-slate-900 uppercase tracking-widest mb-1">{t.scanQR}</p>
                            <p className="text-indigo-600">{nexusOfficialUrl}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>

      <div className="absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
      <div className={`fixed top-0 left-0 w-[800px] h-[800px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none animate-float-slow ${animate ? 'opacity-100' : 'opacity-0'}`}></div>
      <div className={`fixed bottom-0 right-0 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none animate-float-delayed ${animate ? 'opacity-100' : 'opacity-0'}`}></div>

      <div className={`relative z-10 w-full max-w-3xl transition-all duration-1000 transform ${animate ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 scale-95'}`}>
        
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 px-2">
          <button onClick={() => navigate('/')} className="flex items-center self-start gap-2 px-4 py-2 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-black text-xs uppercase tracking-widest rounded-full border border-slate-200 dark:border-slate-700 shadow-sm transition-all group">
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform"/> {t.back}
          </button>
          
          <div className="flex space-x-3 items-center self-end md:self-auto">
            
            <button 
                onClick={toggleTheme} 
                className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-widest rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
                {isDark ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} />}
                <span className="hidden md:inline">{isDark ? 'Light' : 'Dark'}</span>
            </button>

            <button onClick={handleShare} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-widest rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
              <Share2 size={14} /> {t.share}
            </button>
            <button onClick={handleDownloadPDF} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold text-xs uppercase tracking-widest rounded-lg shadow-sm hover:bg-indigo-700 hover:shadow-md hover:-translate-y-0.5 transition-all">
              <Download size={14} /> {t.download}
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] rounded-[2rem] shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden relative">
          
          <div className={`px-8 py-12 bg-gradient-to-br ${activeTheme.gradient} text-center relative overflow-hidden flex flex-col items-center`}>
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/10 rounded-full blur-xl -ml-8 -mb-8 pointer-events-none"></div>
            
            <div className="relative z-10 flex flex-col items-center">
              {activeTheme.icon}
              <h1 className="text-sm font-bold text-white/90 uppercase tracking-[0.2em] mb-2">{t.title}</h1>
              <div className="inline-block px-8 py-3 bg-white/20 rounded-2xl backdrop-blur-md border border-white/30 text-3xl md:text-4xl font-black text-white shadow-lg">
                {riskTier === 'Red' ? t.red : riskTier === 'Amber' ? t.amber : t.green}
              </div>
            </div>
          </div>

          <div className="p-8 md:p-12 space-y-10 bg-white dark:bg-[#111827]">
            
            <div className={`p-6 rounded-2xl ${activeTheme.bgCard}`}>
              <h2 className={`text-sm font-black uppercase tracking-widest mb-3 ${activeTheme.titleColor}`}>Smart Analysis</h2>
              <div className="space-y-3">
                  <p className="text-base md:text-lg text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                    {riskTier === 'Red' ? t.redDesc : riskTier === 'Amber' ? t.amberDesc : t.greenDesc}
                  </p>
                  
                  {previousSessionId && (
                      <div className="flex items-start gap-2 mt-4 pt-4 border-t border-black/5 dark:border-white/10">
                          <TrendingUp className="w-5 h-5 mt-0.5 text-indigo-500 shrink-0" />
                          <div>
                              <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{t.trendActive}</p>
                              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{t.trendDesc}</p>
                          </div>
                      </div>
                  )}

                  {data.sdohFinancial && (
                      <div className="flex items-start gap-2 mt-4 pt-4 border-t border-black/5 dark:border-white/10">
                          <CheckCircle2 className="w-5 h-5 mt-0.5 text-amber-500 shrink-0" />
                          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{t.sdohFinText}</p>
                      </div>
                  )}
                  {data.sdohSocial && (
                      <div className="flex items-start gap-2 mt-2">
                          <CheckCircle2 className="w-5 h-5 mt-0.5 text-blue-500 shrink-0" />
                          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{t.sdohSocText}</p>
                      </div>
                  )}
                  {data.psychoFlag && (
                      <div className="flex items-start gap-2 mt-2">
                          <CheckCircle2 className="w-5 h-5 mt-0.5 text-purple-500 shrink-0" />
                          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{t.sdohPsychoText}</p>
                      </div>
                  )}
              </div>
            </div>

            <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
              <h2 className="text-xl font-black text-slate-900 dark:text-white mb-6 uppercase tracking-tight">{t.cta}</h2>
              
              <div className="grid gap-4">
                {suggestedResources.map((resource) => (
                  <button 
                    key={resource.id}
                    onClick={() => handleResourceClick(resource.id, resource.url)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-indigo-500/50 hover:shadow-lg transition-all text-left group w-full gap-4"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      
                      <div className="w-16 h-16 md:w-20 md:h-20 aspect-square shrink-0 bg-white rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden shadow-sm">
                        <img 
                          src={`${baseUrl}${resource.logo}`} 
                          alt={`${resource[lang]?.title || resource.en.title} logo`}
                          crossOrigin="anonymous"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.parentElement.innerHTML = '<span class="text-[10px] font-black text-slate-400">LOGO</span>';
                          }}
                        />
                      </div>
                      
                      <div>
                        <h3 className="text-lg font-black text-indigo-600 dark:text-indigo-400 mb-1">
                          {resource[lang]?.title || resource.en.title}
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                          {resource[lang]?.desc || resource.en.desc}
                        </p>
                      </div>
                    </div>

                    <div className="hidden sm:flex w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-500/20 items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <ExternalLink className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="px-8 md:px-12 py-6 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center mt-4">
              <div className="flex items-center gap-2">
                <img src={`${baseUrl}/nexus.png`} alt="NEXUS Logo" crossOrigin="anonymous" className="w-16 h-16 object-contain" />
                <div>
                  <span className="font-black text-slate-800 dark:text-slate-200 tracking-widest text-sm uppercase block leading-none">NEXUS</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t.reportTitle}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Assessment ID</p>
                <p className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300">{activeSessionId}</p>
                {previousSessionId && (
                  <p className="text-[10px] font-mono text-slate-400 mt-0.5">Prev: {previousSessionId}</p>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
