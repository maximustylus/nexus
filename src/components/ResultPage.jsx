import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Download, Share2, ArrowLeft, ExternalLink, ShieldAlert, Activity, CheckCircle2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { recordTelemetry } from '../utils/telemetry';

const DICTIONARY = {
  en: {
    title: 'Your Assessment Result',
    red: 'High Needs (Red)',
    amber: 'Moderate Needs (Amber)',
    green: 'Low Needs (Green)',
    redDesc: 'AURA Analysis: Your risk profile indicates a need for supervised care. We highly recommend consulting a healthcare professional before starting a new exercise programme.',
    amberDesc: 'AURA Analysis: You have moderate needs or face some barriers. Consider gradually increasing your activity levels and exploring structured community resources.',
    greenDesc: 'AURA Analysis: Excellent! You meet the physical activity guidelines with minimal barriers. Keep up the great work and maintain your routine.',
    resources: 'Recommended Community Resources',
    download: 'Download PDF',
    share: 'Share Result',
    back: 'Back to Gateway',
    cta: 'Take Action Today'
  },
  ms: {
    title: 'Keputusan Penilaian Anda',
    red: 'Keperluan Tinggi (Merah)',
    amber: 'Keperluan Sederhana (Kuning)',
    green: 'Keperluan Rendah (Hijau)',
    redDesc: 'Analisis AURA: Profil risiko anda menunjukkan keperluan untuk penjagaan yang diawasi. Kami sangat mengesyorkan anda berunding dengan profesional penjagaan kesihatan sebelum memulakan program senaman baharu.',
    amberDesc: 'Analisis AURA: Anda mempunyai keperluan sederhana atau menghadapi beberapa halangan. Pertimbangkan untuk meningkatkan tahap aktiviti anda secara beransur-ansur dan meneroka sumber komuniti berstruktur.',
    greenDesc: 'Analisis AURA: Cemerlang! Anda memenuhi garis panduan aktiviti fizikal dengan halangan yang minimum. Teruskan usaha yang baik dan kekalkan rutin anda.',
    resources: 'Sumber Komuniti yang Disyorkan',
    download: 'Muat Turun PDF',
    share: 'Kongsi Keputusan',
    back: 'Kembali ke Pintu Utama',
    cta: 'Ambil Tindakan Hari Ini'
  },
  zh: {
    title: '您的评估结果',
    red: '高需求 (红色)',
    amber: '中等需求 (琥珀色)',
    green: '低需求 (绿色)',
    redDesc: 'AURA分析：您的风险状况表明需要有监督的护理。我们强烈建议您在开始新的锻炼计划之前咨询医疗保健专业人员。',
    amberDesc: 'AURA分析：您有中等需求或面临一些障碍。建议逐步增加您的活动量，并探索结构化的社区资源。',
    greenDesc: 'AURA分析：太棒了！您符合身体活动指南，且障碍极少。请继续保持良好的锻炼习惯。',
    resources: '推荐的社区资源',
    download: '下载 PDF',
    share: '分享结果',
    back: '返回主页',
    cta: '今天就采取行动'
  },
  ta: {
    title: 'உங்கள் மதிப்பீட்டு முடிவு',
    red: 'அதிக தேவை (சிவப்பு)',
    amber: 'மிதமான தேவை (ஆம்பர்)',
    green: 'குறைந்த தேவை (பச்சை)',
    redDesc: 'AURA பகுப்பாய்வு: உங்கள் ஆபத்து விவரக்குறிப்பு மேற்பார்வையிடப்பட்ட கவனிப்பின் அவசியத்தைக் குறிக்கிறது. புதிய உடற்பயிற்சி திட்டத்தைத் தொடங்குவதற்கு முன் மருத்துவரை அணுகுமாறு நாங்கள் கடுமையாக பரிந்துரைக்கிறோம்.',
    amberDesc: 'AURA பகுப்பாய்வு: உங்களுக்கு மிதமான தேவைகள் உள்ளன அல்லது சில தடைகளை எதிர்கொள்கிறீர்கள். உங்கள் செயல்பாட்டு நிலைகளை படிப்படியாக அதிகரிப்பதையும், கட்டமைக்கப்பட்ட சமூக வளங்களை ஆராய்வதையும் கருத்தில் கொள்ளுங்கள்.',
    greenDesc: 'AURA பகுப்பாய்வு: அருமை! குறைந்த தடைகளுடன் உடல் செயல்பாட்டு வழிகாட்டுதல்களை நீங்கள் சந்திக்கிறீர்கள். தொடர்ந்து நல்ல முறையில் செயல்படுங்கள்.',
    resources: 'பரிந்துரைக்கப்பட்ட சமூக வளங்கள்',
    download: 'PDF பதிவிறக்குக',
    share: 'முடிவைப் பகிர்க',
    back: 'முகப்பிற்குத் திரும்பு',
    cta: 'இன்றே நடவடிக்கை எடுங்கள்'
  }
};

// DYNAMIC RESOURCE DATABASE (Northern Singapore Ecosystem + M3 Initiatives)
const RESOURCES_DB = {
  Red: [
    {
      id: 'healthier_sg_gp',
      url: 'https://www.healthiersg.gov.sg/',
      en: { title: 'Healthier SG GP Review', desc: 'Schedule a fully subsidised annual check-in with your enrolled GP to discuss your physical activity safely.' },
      ms: { title: 'Semakan Klinik GP Healthier SG', desc: 'Jadualkan pemeriksaan tahunan bersubsidi penuh dengan doktor anda untuk membincangkan aktiviti fizikal dengan selamat.' },
      zh: { title: 'Healthier SG 全科医生复查', desc: '与您的签约医生安排全额补贴的年度检查，以安全地讨论您的身体活动。' },
      ta: { title: 'Healthier SG GP மதிப்பாய்வு', desc: 'உங்கள் உடல் செயல்பாடு குறித்து பாதுகாப்பாக விவாதிக்க உங்கள் மருத்துவரிடம் முழு மானியத்துடன் கூடிய வருடாந்திர பரிசோதனையை திட்டமிடுங்கள்.' }
    },
    {
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
      url: 'https://www.healthhub.sg/programmes/start2move',
      en: { title: 'HPB Start2Move Programme', desc: 'A free 6-session beginner programme by ActiveSG to help you start exercising safely.' },
      ms: { title: 'Program Start2Move HPB', desc: 'Program percuma 6 sesi untuk pemula oleh ActiveSG untuk membantu anda mula bersenam dengan selamat.' },
      zh: { title: 'HPB Start2Move 计划', desc: 'ActiveSG 提供的免费 6 节初学者计划，帮助您安全地开始锻炼。' },
      ta: { title: 'HPB Start2Move திட்டம்', desc: 'பாதுகாப்பாக உடற்பயிற்சியைத் தொடங்க உதவும் ActiveSG-ன் இலவச 6 அமர்வு தொடக்கத் திட்டம்.' }
    },
    {
      id: 'm3_nee_soon_saham',
      url: 'https://www.facebook.com/M3NeeSoon/',
      en: { title: 'M3@Nee Soon: Saham Kesihatan', desc: 'Join beginner-friendly resistance band exercises with community partners like Darul Makmur Mosque.' },
      ms: { title: 'M3@Nee Soon: Saham Kesihatan', desc: 'Sertai senaman jalur rintangan mesra pemula bersama rakan kongsi komuniti seperti Masjid Darul Makmur.' },
      zh: { title: 'M3@Nee Soon: Saham Kesihatan 健康投资', desc: '与 Darul Makmur 清真寺等社区合作伙伴一起参加适合初学者的阻力带锻炼。' },
      ta: { title: 'M3@Nee Soon: சஹாம் கேசிஹாதன்', desc: 'தாருல் மக்மூர் மசூதி போன்ற சமூக கூட்டாளர்களுடன் தொடக்கக்காரர்களுக்கான உடற்பயிற்சிகளில் சேரவும்.' }
    },
    {
      id: 'm3_marsiling_gaya',
      url: 'https://www.facebook.com/M3MarsilingYewTee/',
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
      url: 'https://www.facebook.com/M3Woodlands/',
      en: { title: 'M3@Woodlands: Jom Trekking & Jalan Kakis', desc: 'Monthly trekking and brisk walking activities for residents on the 1st and 3rd Sundays of the month.' },
      ms: { title: 'M3@Woodlands: Jom Trekking & Jalan Kakis', desc: 'Aktiviti trekking dan berjalan pantas bulanan untuk penduduk pada hari Ahad pertama dan ketiga setiap bulan.' },
      zh: { title: 'M3@Woodlands: 徒步与快走活动', desc: '在每月的第一个和第三个星期日为居民举办的每月徒步和快走活动。' },
      ta: { title: 'M3@Woodlands: மலையேற்றம் & நடைப்பயிற்சி', desc: 'ஒவ்வொரு மாதமும் 1 மற்றும் 3 வது ஞாயிற்றுக்கிழமைகளில் மாதாந்திர மலையேற்றம் மற்றும் சுறுசுறுப்பான நடைப்பயிற்சி.' }
    },
    {
      id: 'm3_woodlands_gym_yoga',
      url: 'https://www.facebook.com/M3Woodlands/',
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
  // Safe fallback if users hit this page directly without going through the form
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
    
    // Telemetry: Track download intent with the 2-digit postal sector
    recordTelemetry(postalSector, { action: 'download_pdf', score, language: lang });

    try {
      const canvas = await html2canvas(resultRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save('NEXUS_AURA_Result.pdf');
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  const handleShare = async () => {
    // Telemetry: Track share intent
    recordTelemetry(postalSector, { action: 'share_result', score, language: lang });

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'NEXUS AURA Analysis',
          text: `My AURA risk assessment is: ${score}. Discover your pathway at NEXUS.`,
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
    // Telemetry: Track specific resource click-through
    recordTelemetry(postalSector, { action: `click_resource_${resourceId}`, score, language: lang });
    window.open(url, '_blank');
  };

  // Theming maps based on score
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
      <div className="absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '40px 40px' }}>
      </div>
      <div className={`fixed top-0 left-0 w-[800px] h-[800px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none animate-float-slow ${animate ? 'opacity-100' : 'opacity-0'}`}></div>
      <div className={`fixed bottom-0 right-0 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none animate-float-delayed ${animate ? 'opacity-100' : 'opacity-0'}`}></div>

      <div className={`relative z-10 w-full max-w-3xl transition-all duration-1000 transform ${animate ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 scale-95'}`}>
        
        {/* TOP CONTROLS */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 px-2">
          <button 
            onClick={() => navigate('/')} 
            className="flex items-center self-start gap-2 px-4 py-2 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-black text-xs uppercase tracking-widest rounded-full border border-slate-200 dark:border-slate-700 shadow-sm transition-all group"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform"/> {t.back}
          </button>
          
          <div className="flex space-x-3 self-end md:self-auto">
            <button 
              onClick={handleShare} 
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-widest rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <Share2 size={14} /> {t.share}
            </button>
            <button 
              onClick={handleDownloadPDF} 
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold text-xs uppercase tracking-widest rounded-lg shadow-sm hover:bg-indigo-700 hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <Download size={14} /> {t.download}
            </button>
          </div>
        </div>

        {/* PRINTABLE CARD AREA */}
        <div ref={resultRef} className="bg-white dark:bg-[#111827] rounded-[2rem] shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          
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

          <div className="p-8 md:p-12 space-y-10">
            
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
                    className="flex items-center justify-between p-6 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-indigo-500/50 hover:shadow-lg transition-all text-left group"
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

      {/* ANIMATIONS */}
      <style>{`
          @keyframes float-slow {
              0%, 100% { transform: translate(0, 0); }
              50% { transform: translate(20px, 40px); }
          }
          @keyframes float-delayed {
              0%, 100% { transform: translate(0, 0); }
              50% { transform: translate(-30px, -20px); }
          }
          .animate-float-slow { animation: float-slow 15s ease-in-out infinite; }
          .animate-float-delayed { animation: float-delayed 18s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
