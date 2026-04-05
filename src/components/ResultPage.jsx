import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Download, Share2, ArrowLeft, ExternalLink, ShieldAlert, Activity, CheckCircle2, Loader2 } from 'lucide-react';
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
    resources: 'Recommended Community Resources',
    download: 'Download PDF',
    share: 'Share Result',
    back: 'Back to Gateway',
    cta: 'Take Action Today'
  },
  ms: { /* Translations omitted for brevity, maintain your existing Malay translations here */ },
  zh: { /* Translations omitted for brevity, maintain your existing Chinese translations here */ },
  ta: { /* Translations omitted for brevity, maintain your existing Tamil translations here */ }
};

// FULLY EXPANDED DATABASE WITH LOGO PATHS
const ALL_RESOURCES = {
  // --- CLINICAL & NATIONAL ---
  healthier_sg: {
    id: 'healthier_sg', url: 'https://www.healthiersg.gov.sg/', logo: '/logos/healthiersg.png',
    en: { title: 'Healthier SG GP Review', desc: 'Schedule a fully subsidised annual check-in with your enrolled GP.' }
  },
  start2move: {
    id: 'start2move', url: 'https://www.healthhub.sg/programmes/letsmoveit/start2move', logo: '/logos/hpb.png',
    en: { title: 'HPB Start2Move', desc: 'A free 6-session beginner programme to help you start exercising safely.' }
  },
  
  // --- SPORTS & FITNESS (ActiveSG, SportSG, Active Health) ---
  active_health: {
    id: 'active_health', url: 'https://www.myactivesg.com/active-health', logo: '/logos/activehealth.png',
    en: { title: 'Active Health Labs', desc: 'Supervised clinical exercise and metabolic health programmes by SportSG.' }
  },
  activesg_gym: {
    id: 'activesg_gym', url: 'https://www.myactivesg.com/', logo: '/logos/activesg.png',
    en: { title: 'ActiveSG Gyms & Pools', desc: 'Access affordable fitness facilities and group workout classes near you.' }
  },
  pa_courses: {
    id: 'pa_courses', url: 'https://www.onepa.gov.sg/', logo: '/logos/pa.png',
    en: { title: 'PA Community Courses', desc: 'Join local Tai Chi, Yoga, or Zumba classes at your nearest Community Club.' }
  },

  // --- REGIONAL HEALTH SYSTEMS ---
  singhealth_healthup: {
    id: 'singhealth_healthup', url: 'https://www.singhealth.com.sg/community-care/level-up-with-healthup', logo: '/logos/singhealth.png',
    en: { title: 'SingHealth Health UP!', desc: 'Join community wellness programmes with guidance from Wellbeing Coordinators.' }
  },
  nuhs_chp: {
    id: 'nuhs_chp', url: 'https://www.nuhs.edu.sg/care-in-the-community', logo: '/logos/nuhs.png',
    en: { title: 'NUHS Community Health Post', desc: 'Access health screenings and lifestyle coaching in your neighbourhood.' }
  },
  nhg_coaches: {
    id: 'nhg_coaches', url: 'https://form.gov.sg/663c452b463eff5b7438b117', logo: '/logos/nhg.png',
    en: { title: 'NHG Health Coaches', desc: 'Connect with a Health Coach to set personalised goals for a healthier lifestyle.' }
  },

  // --- SDOH & COMMUNITY SUPPORT (AAC, TOUCH, WINGS, CareLine) ---
  aic_aac: {
    id: 'aic_aac', url: 'https://www.aic.sg/care-services/active-ageing-centres', logo: '/logos/aic.png',
    en: { title: 'Active Ageing Centres (AAC)', desc: 'Neighbourhood hubs offering active programmes and social networks.' }
  },
  touch_community: {
    id: 'touch_community', url: 'https://www.touch.org.sg/', logo: '/logos/touch.png',
    en: { title: 'TOUCH Community Services', desc: 'Holistic social support, befriending, and caregiving resources.' }
  },
  society_wings: {
    id: 'society_wings', url: 'https://www.wings.sg/', logo: '/logos/wings.png',
    en: { title: 'Society for WINGS', desc: 'Empowering women aged 40+ with health, wealth, and happiness programmes.' }
  },
  singhealth_careline: {
    id: 'singhealth_careline', url: 'https://www.singhealth.com.sg/community-care/careline', logo: '/logos/careline.png',
    en: { title: 'SingHealth CareLine', desc: 'A 24/7 personal tele-befriending service providing social support for seniors.' }
  },
  financial_chas: {
    id: 'financial_chas', url: 'https://www.chas.sg/', logo: '/logos/chas.png',
    en: { title: 'CHAS & Medical Subsidies', desc: 'Discover financial support schemes for your community healthcare needs.' }
  },
  mental_wellness: {
    id: 'mental_wellness', url: 'https://www.mindline.sg/', logo: '/logos/mindline.png',
    en: { title: 'Mindline.sg Support', desc: 'Free, confidential emotional support and mental wellness tools.' }
  }
};

const getRegionalHealthSystem = (sector) => {
  const s = parseInt(sector, 10);
  if (isNaN(s)) return 'NHG';
  if (s >= 58 && s <= 71) return 'NUHS';
  if ((s >= 1 && s <= 27) || (s >= 31 && s <= 52) || s === 81) return 'SingHealth';
  return 'NHG'; 
};

export default function ResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { score, data, postalSector } = location.state || { score: 'Green', data: {}, postalSector: '00' };
  
  const [lang, setLang] = useState('en');
  const [animate, setAnimate] = useState(false);
  const [isGenerating, setIsGenerating] = useState(true);
  const [suggestedResources, setSuggestedResources] = useState([]);
  const resultRef = useRef(null);

  useEffect(() => {
    const storedLang = localStorage.getItem('nexus_language');
    if (storedLang && DICTIONARY[storedLang]) setLang(storedLang);

    const generateActionPlan = () => {
      let plan = [];
      const rhs = getRegionalHealthSystem(postalSector);
      
      // 1. Clinical Anchors
      if (score === 'Red') {
        plan.push(ALL_RESOURCES.healthier_sg);
        plan.push(ALL_RESOURCES.active_health);
      } else if (score === 'Amber') {
        plan.push(ALL_RESOURCES.start2move);
        plan.push(ALL_RESOURCES.pa_courses);
      } else {
        plan.push(ALL_RESOURCES.activesg_gym);
        plan.push(ALL_RESOURCES.pa_courses);
      }
  
      // 2. Regional Health Systems
      if (rhs === 'SingHealth') {
        plan.push(ALL_RESOURCES.singhealth_healthup);
      } else if (rhs === 'NUHS') {
        plan.push(ALL_RESOURCES.nuhs_chp);
      } else {
        plan.push(ALL_RESOURCES.nhg_coaches);
      }
  
      // 3. SDOH Overrides & Demographics
      if (data.psychoFlag) plan.push(ALL_RESOURCES.mental_wellness);
      if (data.sdohFinancial) {
          plan.push(ALL_RESOURCES.financial_chas);
          plan.push(ALL_RESOURCES.touch_community);
      }
      
      // Age & Gender Specific overrides (Assuming age/gender passed in data)
      if (data.sdohSocial) {
          if (rhs === 'SingHealth') plan.push(ALL_RESOURCES.singhealth_careline);
          plan.push(ALL_RESOURCES.aic_aac);
          plan.push(ALL_RESOURCES.touch_community);
      }
      
      // If we flagged older females (e.g. perimenopause/aging support)
      if (data.gender === 'Female' && (data.age === '41-60' || data.age === '60+')) {
          plan.push(ALL_RESOURCES.society_wings);
      }
  
      // Deduplicate and limit to top 4 recommendations
      const uniquePlan = Array.from(new Set(plan.map(r => r.id))).map(id => plan.find(r => r.id === id));
      return uniquePlan.slice(0, 4);
    };

    setTimeout(() => {
      setSuggestedResources(generateActionPlan());
      setIsGenerating(false);
      setTimeout(() => setAnimate(true), 100);
    }, 1800);

  }, [score, data, postalSector]);

  const t = DICTIONARY[lang] || DICTIONARY.en;

  // ... (handleDownloadPDF, handleShare, handleResourceClick remain exactly the same as before) ...
  const handleResourceClick = (resourceId, url) => {
    recordTelemetry(postalSector, { action: `click_resource_${resourceId}`, score, language: lang });
    window.open(url, '_blank');
  };

  const themeMap = {
    Red: {
      gradient: 'from-rose-500 to-red-600',
      icon: <ShieldAlert className="w-12 h-12 text-white mb-4 drop-shadow-md" />,
      titleColor: 'text-rose-600 dark:text-rose-400',
      bgCard: 'bg-rose-50 dark:bg-rose-500/10 border-rose-100 dark:border-rose-500/20'
    },
    Amber: {
      gradient: 'from-amber-400 to-orange-500',
      icon: <Activity className="w-12 h-12 text-white mb-4 drop-shadow-md" />,
      titleColor: 'text-amber-600 dark:text-amber-500',
      bgCard: 'bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20'
    },
    Green: {
      gradient: 'from-emerald-400 to-teal-500',
      icon: <CheckCircle2 className="w-12 h-12 text-white mb-4 drop-shadow-md" />,
      titleColor: 'text-emerald-600 dark:text-emerald-400',
      bgCard: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20'
    }
  };

  const activeTheme = themeMap[score] || themeMap.Green;

  if (isGenerating) {
    return (
      <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Loading UI exactly as before */}
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
      <div className="absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
      <div className={`fixed top-0 left-0 w-[800px] h-[800px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none animate-float-slow ${animate ? 'opacity-100' : 'opacity-0'}`}></div>
      <div className={`fixed bottom-0 right-0 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none animate-float-delayed ${animate ? 'opacity-100' : 'opacity-0'}`}></div>

      <div className={`relative z-10 w-full max-w-3xl transition-all duration-1000 transform ${animate ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 scale-95'}`}>
        
        {/* ... Top controls (Back, Share, Download) omitted for brevity, same as before ... */}

        <div ref={resultRef} className="bg-white dark:bg-[#111827] rounded-[2rem] shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden relative">
          
          <div className={`px-8 py-12 bg-gradient-to-br ${activeTheme.gradient} text-center relative overflow-hidden flex flex-col items-center`}>
            {/* Header Content */}
             <div className="relative z-10 flex flex-col items-center">
              {activeTheme.icon}
              <h1 className="text-sm font-bold text-white/90 uppercase tracking-[0.2em] mb-2">{t.title}</h1>
              <div className="inline-block px-8 py-3 bg-white/20 rounded-2xl backdrop-blur-md border border-white/30 text-3xl md:text-4xl font-black text-white shadow-lg">
                {score === 'Red' ? t.red : score === 'Amber' ? t.amber : t.green}
              </div>
            </div>
          </div>

          <div className="p-8 md:p-12 space-y-10 bg-white dark:bg-[#111827]">
            {/* Smart Analysis Block */}
            <div className={`p-6 rounded-2xl ${activeTheme.bgCard}`}>
               <h2 className={`text-sm font-black uppercase tracking-widest mb-3 ${activeTheme.titleColor}`}>Smart Analysis</h2>
               <div className="space-y-3">
                  <p className="text-base md:text-lg text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                    {score === 'Red' ? t.redDesc : score === 'Amber' ? t.amberDesc : t.greenDesc}
                  </p>
                  {/* Dynamic SDOH Acknowledgement logic */}
               </div>
            </div>

            {/* NEW: LOGO-ENHANCED CALL TO ACTION RESOURCES */}
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
                      {/* --- THE LOGO CONTAINER --- */}
                      <div className="w-16 h-16 shrink-0 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 flex items-center justify-center p-2 shadow-sm overflow-hidden">
                        <img 
                          src={resource.logo} 
                          alt={`${resource[lang]?.title || resource.en.title} logo`}
                          className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal"
                          onError={(e) => {
                            // Fallback if logo is missing locally
                            e.target.style.display = 'none';
                            e.target.parentElement.innerHTML = '<span class="text-xs font-bold text-slate-400">LOGO</span>';
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

          </div>
        </div>
      </div>
    </div>
  );
}    {
      id: 'active_health_metabolic',
      url: 'https://www.myactivesg.com/active-health',
      en: { title: 'Manage Metabolic Health (Active Health)', desc: 'Supervised 7-session clinical programme at Woodlands Sport Centre Active Health Lab.' },
      ms: { title: 'Urus Kesihatan Metabolik (Active Health)', desc: 'Program klinikal 7 sesi yang diawasi di Makmal Active Health, Pusat Sukan Woodlands.' },
      zh: { title: '管理代谢健康 (Active Health)', desc: '在兀兰体育中心 Active Health Lab 进行的有监督的 7 节临床计划。' },
      ta: { title: 'வளர்சிதை மாற்ற ஆரோக்கியத்தை நிர்வகிக்கவும்', desc: 'உட்லண்ட்ஸ் விளையாட்டு மையத்தில் கண்காணிக்கப்பட்ட 7 அமர்வு மருத்துவ திட்டம்.' }
    }
  ],
  Amber: [
    {
      id: 'hpb_start2move',
      url: 'https://www.healthhub.sg/programmes/letsmoveit/start2move',
      en: { title: 'HPB Start2Move Programme', desc: 'A free 6-session beginner programme by ActiveSG to help you start exercising safely.' },
      ms: { title: 'Program Start2Move HPB', desc: 'Program percuma 6 sesi untuk pemula oleh ActiveSG untuk membantu anda mula bersenam dengan selamat.' },
      zh: { title: 'HPB Start2Move 计划', desc: 'ActiveSG 提供的免费 6 节初学者计划，帮助您安全地开始锻炼。' },
      ta: { title: 'HPB Start2Move திட்டம்', desc: 'பாதுகாப்பாக உடற்பயிற்சியைத் தொடங்க உதவும் ActiveSG-ன் இலவச 6 அமர்வு தொடக்கத் திட்டம்.' }
    },
    {
      id: 'm3_nee_soon_saham',
      url: 'https://www.facebook.com/profile.php?id=100068636709214',
      en: { title: 'M3@Nee Soon: Saham Kesihatan', desc: 'Join beginner-friendly resistance band exercises with community partners like Darul Makmur Mosque.' },
      ms: { title: 'M3@Nee Soon: Saham Kesihatan', desc: 'Sertai senaman jalur rintangan mesra pemula bersama rakan kongsi komuniti seperti Masjid Darul Makmur.' },
      zh: { title: 'M3@Nee Soon: Saham Kesihatan 健康投资', desc: '与 Darul Makmur 清真寺等社区合作伙伴一起参加适合初学者的阻力带锻炼。' },
      ta: { title: 'M3@Nee Soon: சஹாம் கேசிஹாதன்', desc: 'தாருல் மக்மூர் மசூதி போன்ற சமூக கூட்டாளர்களுடன் தொடக்கக்காரர்களுக்கான உடற்பயிற்சிகளில் சேரவும்.' }
    },
    {
      id: 'm3_marsiling_gaya',
      url: 'https://www.facebook.com/M3atMarsilingYewTee',
      en: { title: 'M3@Marsiling-Yew Tee: Gaya Sihat & Kelab 60', desc: 'Personalised 6-8 week health programmes and active ageing support for seniors launched by An-Nur Mosque.' },
      ms: { title: 'M3@Marsiling-Yew Tee: Gaya Sihat & Kelab 60', desc: 'Program kesihatan peribadi 6-8 minggu dan sokongan penuaan aktif warga emas yang dilancarkan oleh Masjid An-Nur.' },
      zh: { title: 'M3@Marsiling-Yew Tee: Gaya Sihat & Kelab 60', desc: '由 An-Nur 清真寺推出的个性化 6-8 周健康计划和长者活跃乐龄支持。' },
      ta: { title: 'M3@Marsiling: காயா சிஹாட் & கெலாப் 60', desc: 'அன்-நூர் மசூதியின் தனிப்பயனாக்கப்பட்ட 6-8 வார சுகாதார திட்டங்கள் மற்றும் முதியோர் ஆதரவு.' }
    },
    {
      id: 'aic_aac',
      url: 'https://www.aic.sg/care-services/active-ageing-centres',
      en: { title: 'Active Ageing Centres (AAC)', desc: 'Neighbourhood hubs for seniors 60+ offering active ageing programmes and social connectors.' },
      ms: { title: 'Pusat Penuaan Aktif (AAC)', desc: 'Hab kejiranan untuk warga emas 60+ yang menawarkan program penuaan aktif dan penyambung sosial.' },
      zh: { title: '活跃乐龄中心 (AAC)', desc: '为 60 岁以上老年人提供的社区中心，提供活跃乐龄计划和社交活动。' },
      ta: { title: 'சுறுசுறுப்பான முதுமை மையங்கள் (AAC)', desc: '60 வயதுக்கு மேற்பட்டவர்களுக்கான சுறுசுறுப்பான முதுமை திட்டங்களை வழங்கும் மையங்கள்.' }
    }
  ],
  Green: [
    {
      id: 'active_health_perform',
      url: 'https://www.myactivesg.com/active-health',
      en: { title: 'Perform 2.0 & Strength 2.0', desc: 'Advanced, vigorous intensity multi-modal workouts at Woodlands Active Health Lab.' },
      ms: { title: 'Perform 2.0 & Kekuatan 2.0', desc: 'Senaman pelbagai mod intensiti tinggi di Makmal Active Health Woodlands.' },
      zh: { title: 'Perform 2.0 & 力量 2.0', desc: '兀兰 Active Health Lab 的高级、高强度多模式锻炼。' },
      ta: { title: 'Perform 2.0 & வலிமை 2.0', desc: 'உட்லண்ட்ஸ் Active Health Lab-ல் மேம்பட்ட, தீவிரமான உடற்பயிற்சிகள்.' }
    },
    {
      id: 'm3_woodlands_trekking',
      url: 'https://www.facebook.com/M3atWoodlands',
      en: { title: 'M3@Woodlands: Jom Trekking & Jalan Kakis', desc: 'Monthly trekking and brisk walking activities for residents on the 1st and 3rd Sundays of the month.' },
      ms: { title: 'M3@Woodlands: Jom Trekking & Jalan Kakis', desc: 'Aktiviti trekking dan berjalan pantas bulanan untuk penduduk pada hari Ahad pertama dan ketiga setiap bulan.' },
      zh: { title: 'M3@Woodlands: 徒步与快走活动', desc: '在每月的第一个和第三个星期日为居民举办的每月徒步和快走活动。' },
      ta: { title: 'M3@Woodlands: மலையேற்றம் & நடைப்பயிற்சி', desc: 'ஒவ்வொரு மாதமும் 1 மற்றும் 3 வது ஞாயிற்றுக்கிழமைகளில் மாதாந்திர மலையேற்றம் மற்றும் சுறுசுறுப்பான நடைப்பயிற்சி.' }
    },
    {
      id: 'm3_woodlands_gym_yoga',
      url: 'https://www.facebook.com/M3atWoodlands',
      en: { title: 'M3@Woodlands: Gym Kakis & Ladies Yoga', desc: 'Weekly yoga classes for ladies and initiatives for youth and residents to learn gym etiquette together.' },
      ms: { title: 'M3@Woodlands: Gym Kakis & Yoga Wanita', desc: 'Kelas yoga mingguan untuk wanita dan inisiatif belia untuk belajar etika gim dan bersenam bersama.' },
      zh: { title: 'M3@Woodlands: 健身伙伴与女士瑜伽', desc: '每周为女士提供的瑜伽课程，以及让青年和居民一起学习健身房礼仪和锻炼的计划。' },
      ta: { title: 'M3@Woodlands: ஜிம் காகிஸ் & பெண்கள் யோகா', desc: 'பெண்களுக்கான வாராந்திர யோகா மற்றும் இளைஞர்களுக்கான ஜிம் பழக்கவழக்கங்களை அறியும் திட்டங்கள்.' }
    },
    {
      id: 'pa_interest_groups',
      url: 'https://www.onepa.gov.sg/interest-groups/search',
      en: { title: 'HealthierSG PA Interest Groups', desc: 'Join local community sports like Tai Chi or Badminton across Woodlands, Yishun, and Sembawang.' },
      ms: { title: 'Kumpulan Minat PA HealthierSG', desc: 'Sertai sukan komuniti tempatan seperti Tai Chi atau Badminton di sekitar Woodlands, Yishun, dan Sembawang.' },
      zh: { title: 'HealthierSG 社区兴趣小组', desc: '参加遍布兀兰、义顺和三巴旺的当地社区体育活动，如太极拳或羽毛球。' },
      ta: { title: 'HealthierSG PA ஆர்வக் குழுக்கள்', desc: 'உட்லண்ட்ஸ், யிஷுன் மற்றும் செம்பவாங் முழுவதும் உள்ள உள்ளூர் சமூக விளையாட்டுகளில் சேரவும்.' }
    }
  ]
};

export default function ResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { score, data, postalSector } = location.state || { score: 'Green', data: {}, postalSector: '00' };
  
  const [lang, setLang] = useState('en');
  const [animate, setAnimate] = useState(false);
  const resultRef = useRef(null);

  useEffect(() => {
    const storedLang = localStorage.getItem('nexus_language');
    if (storedLang && DICTIONARY[storedLang]) setLang(storedLang);
    setTimeout(() => setAnimate(true), 100);
  }, []);

  const t = DICTIONARY[lang] || DICTIONARY.en;
  const suggestedResources = RESOURCES_DB[score] || RESOURCES_DB.Green;

  const handleDownloadPDF = async () => {
    if (!resultRef.current) return;
    
    recordTelemetry(postalSector, { action: 'download_pdf', score, language: lang });

    try {
      // Force html2canvas to capture the FULL height of the card, ignoring scroll boundaries
      const canvas = await html2canvas(resultRef.current, { 
        scale: 2, 
        useCORS: true,
        scrollY: -window.scrollY,
        windowHeight: resultRef.current.scrollHeight
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`NEXUS_AURA_Result_${score}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  const handleShare = async () => {
    recordTelemetry(postalSector, { action: 'share_result', score, language: lang });

    // Generate explicit text capturing their traffic light score and recommended CTAs
    const colorLabel = score === 'Red' ? t.red : score === 'Amber' ? t.amber : t.green;
    const ctaNames = suggestedResources.map(r => r[lang]?.title || r.en.title).join(', ');
    
    const shareText = `My NEXUS AURA Assessment result is: ${colorLabel}.\n\nRecommended for me: ${ctaNames}.\n\nDiscover your community pathway at NEXUS.`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'NEXUS AURA Analysis',
          text: shareText,
          url: window.location.origin,
        });
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
      bgCard: 'bg-rose-50 dark:bg-rose-500/10 border-rose-100 dark:border-rose-500/20'
    },
    Amber: {
      gradient: 'from-amber-400 to-orange-500',
      icon: <Activity className="w-12 h-12 text-white mb-4 drop-shadow-md" />,
      titleColor: 'text-amber-600 dark:text-amber-500',
      bgCard: 'bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20'
    },
    Green: {
      gradient: 'from-emerald-400 to-teal-500',
      icon: <CheckCircle2 className="w-12 h-12 text-white mb-4 drop-shadow-md" />,
      titleColor: 'text-emerald-600 dark:text-emerald-400',
      bgCard: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20'
    }
  };

  const activeTheme = themeMap[score] || themeMap.Green;

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 transition-colors duration-700 flex flex-col items-center py-12 px-4 md:px-6 relative overflow-x-hidden font-sans">
      
      {/* VISUAL BACKGROUND ELEMENTS */}
      <div className="absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
      <div className={`fixed top-0 left-0 w-[800px] h-[800px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none animate-float-slow ${animate ? 'opacity-100' : 'opacity-0'}`}></div>
      <div className={`fixed bottom-0 right-0 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none animate-float-delayed ${animate ? 'opacity-100' : 'opacity-0'}`}></div>

      <div className={`relative z-10 w-full max-w-3xl transition-all duration-1000 transform ${animate ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 scale-95'}`}>
        
        {/* TOP CONTROLS */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 px-2">
          <button onClick={() => navigate('/')} className="flex items-center self-start gap-2 px-4 py-2 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-black text-xs uppercase tracking-widest rounded-full border border-slate-200 dark:border-slate-700 shadow-sm transition-all group">
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform"/> {t.back}
          </button>
          
          <div className="flex space-x-3 self-end md:self-auto">
            <button onClick={handleShare} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-widest rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
              <Share2 size={14} /> {t.share}
            </button>
            <button onClick={handleDownloadPDF} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold text-xs uppercase tracking-widest rounded-lg shadow-sm hover:bg-indigo-700 hover:shadow-md hover:-translate-y-0.5 transition-all">
              <Download size={14} /> {t.download}
            </button>
          </div>
        </div>

        {/* PRINTABLE CARD AREA (Ref captures everything inside this div) */}
        <div ref={resultRef} className="bg-white dark:bg-[#111827] rounded-[2rem] shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden relative">
          
          {/* DYNAMIC HEADER */}
          <div className={`px-8 py-12 bg-gradient-to-br ${activeTheme.gradient} text-center relative overflow-hidden flex flex-col items-center`}>
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/10 rounded-full blur-xl -ml-8 -mb-8 pointer-events-none"></div>
            
            <div className="relative z-10 flex flex-col items-center">
              {activeTheme.icon}
              <h1 className="text-sm font-bold text-white/90 uppercase tracking-[0.2em] mb-2">{t.title}</h1>
              <div className="inline-block px-8 py-3 bg-white/20 rounded-2xl backdrop-blur-md border border-white/30 text-3xl md:text-4xl font-black text-white shadow-lg">
                {score === 'Red' ? t.red : score === 'Amber' ? t.amber : t.green}
              </div>
            </div>
          </div>

          <div className="p-8 md:p-12 space-y-10 bg-white dark:bg-[#111827]">
            
            {/* AURA ANALYSIS TEXT */}
            <div className={`p-6 rounded-2xl ${activeTheme.bgCard}`}>
              <h2 className={`text-sm font-black uppercase tracking-widest mb-3 ${activeTheme.titleColor}`}>Smart Analysis</h2>
              <p className="text-base md:text-lg text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                {score === 'Red' ? t.redDesc : score === 'Amber' ? t.amberDesc : t.greenDesc}
              </p>
            </div>

            {/* DYNAMIC CALL TO ACTION & RESOURCES */}
            <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
              <h2 className="text-xl font-black text-slate-900 dark:text-white mb-6 uppercase tracking-tight">{t.cta}</h2>
              
              <div className="grid gap-4">
                {suggestedResources.map((resource) => (
                  <button 
                    key={resource.id}
                    onClick={() => handleResourceClick(resource.id, resource.url)}
                    className="flex items-center justify-between p-6 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-indigo-500/50 hover:shadow-lg transition-all text-left group w-full"
                  >
                    <div>
                      <h3 className="text-lg font-black text-indigo-600 dark:text-indigo-400 mb-1">
                        {resource[lang]?.title || resource.en.title}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                        {resource[lang]?.desc || resource.en.desc}
                      </p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0 ml-4 group-hover:scale-110 transition-transform">
                      <ExternalLink className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
