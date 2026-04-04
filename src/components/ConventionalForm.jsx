import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { calculateRiskScore } from '../../utils/scoring';
import { recordTelemetry } from '../../utils/telemetry';
import { ChevronLeft, FileText, Activity, HeartPulse, Users, MapPin } from 'lucide-react';

const DICTIONARY = {
  en: {
    back: 'Back to Pathways',
    title: 'Self-Guided Clinical Assessment',
    subtitle: 'Standard Questionnaire Protocol',
    sectionPavs: 'Physical Activity Vital Sign (PAVS)',
    sectionRisk: 'Medical & Exercise Risk',
    sectionSdoh: 'Social Determinants of Health (SDOH)',
    sectionDemo: 'Demographics',
    pavsQ1: 'On average, how many days per week do you engage in moderate to strenuous exercise (like a brisk walk)?',
    pavsQ2: 'On average, how many minutes do you engage in exercise at this level?',
    riskQ1: 'How many days a week do you engage in muscle-strengthening activities?',
    riskQ2: 'How many chronic medical conditions have you been diagnosed with?',
    riskQ3: 'Has a doctor ever advised you to restrict your physical activity due to a medical condition?',
    riskQ4: 'How many physical symptoms (e.g. chest pain, severe dizziness) do you experience during or after exercise?',
    riskQ5: 'Do you ever lose your balance because of dizziness or lose consciousness?',
    sdohQ1: 'Do you face any financial barriers to exercising or seeking healthcare?',
    sdohQ2: 'Do you face any logistical barriers (e.g. transport, time, location) to exercising?',
    sdohQ3: 'Do you face any social barriers (e.g. lack of support, caregiving duties) to exercising?',
    postalCode: 'Please enter your 6-digit postal code (optional, for regional health insights):',
    submit: 'Submit Assessment',
    yes: 'Yes',
    no: 'No',
    none: 'None'
  },
  ms: {
    back: 'Kembali ke Laluan',
    title: 'Penilaian Klinikal Bimbingan Sendiri',
    subtitle: 'Protokol Soal Selidik Standard',
    sectionPavs: 'Tanda Vital Aktiviti Fizikal (PAVS)',
    sectionRisk: 'Risiko Perubatan & Senaman',
    sectionSdoh: 'Penentu Sosial Kesihatan (SDOH)',
    sectionDemo: 'Demografi',
    pavsQ1: 'Secara purata, berapa hari seminggu anda melakukan senaman sederhana hingga berat (seperti berjalan pantas)?',
    pavsQ2: 'Secara purata, berapa minit anda melakukan senaman pada tahap ini?',
    riskQ1: 'Berapa hari seminggu anda melakukan aktiviti menguatkan otot?',
    riskQ2: 'Berapakah bilangan keadaan perubatan kronik yang telah didiagnosis pada anda?',
    riskQ3: 'Pernahkah doktor menasihatkan anda untuk mengehadkan aktiviti fizikal anda kerana keadaan perubatan?',
    riskQ4: 'Berapakah bilangan simptom fizikal (cth. sakit dada, pening yang teruk) yang anda alami semasa atau selepas bersenam?',
    riskQ5: 'Adakah anda pernah hilang keseimbangan kerana pening atau hilang sedar?',
    sdohQ1: 'Adakah anda menghadapi sebarang halangan kewangan untuk bersenam atau mendapatkan penjagaan kesihatan?',
    sdohQ2: 'Adakah anda menghadapi sebarang halangan logistik (cth. pengangkutan, masa, lokasi) untuk bersenam?',
    sdohQ3: 'Adakah anda menghadapi sebarang halangan sosial (cth. kurang sokongan, tugas menjaga) untuk bersenam?',
    postalCode: 'Sila masukkan poskod 6 digit anda (pilihan, untuk pandangan kesihatan serantau):',
    submit: 'Hantar Penilaian',
    yes: 'Ya',
    no: 'Tidak',
    none: 'Tiada'
  },
  zh: {
    back: '返回路径',
    title: '自主指导临床评估',
    subtitle: '标准问卷协议',
    sectionPavs: '身体活动生命体征 (PAVS)',
    sectionRisk: '医疗与运动风险',
    sectionSdoh: '健康的社会决定因素 (SDOH)',
    sectionDemo: '人口统计',
    pavsQ1: '平均而言，您每周有多少天进行中度至剧烈运动（如快步走）？',
    pavsQ2: '平均而言，您在这个水平上进行多少分钟的运动？',
    riskQ1: '您每周有多少天进行肌肉强化活动？',
    riskQ2: '您被诊断出患有多少种慢性医疗状况？',
    riskQ3: '是否有医生曾建议您因医疗状况限制身体活动？',
    riskQ4: '您在运动期间或运动后会经历多少种身体症状（例如胸痛、严重头晕）？',
    riskQ5: '您是否曾因头晕而失去平衡或失去知觉？',
    sdohQ1: '您在锻炼或寻求医疗保健方面是否面临任何财务障碍？',
    sdohQ2: '您在锻炼方面是否面临任何后勤障碍（例如交通、时间、地点）？',
    sdohQ3: '您在锻炼方面是否面临任何社会障碍（例如缺乏支持、照顾责任）？',
    postalCode: '请输入您的6位邮政编码（可选，用于区域健康洞察）：',
    submit: '提交评估',
    yes: '是',
    no: '否',
    none: '无'
  },
  ta: {
    back: 'பாதைகளுக்குத் திரும்பு',
    title: 'சுய வழிகாட்டப்பட்ட மருத்துவ மதிப்பீடு',
    subtitle: 'நிலையான கேள்வித்தாள் நெறிமுறை',
    sectionPavs: 'உடல் செயல்பாடு முக்கிய அறிகுறி (PAVS)',
    sectionRisk: 'மருத்துவ மற்றும் உடற்பயிற்சி ஆபத்து',
    sectionSdoh: 'ஆரோக்கியத்தின் சமூக தீர்மானிப்பவர்கள் (SDOH)',
    sectionDemo: 'புள்ளிவிவரங்கள்',
    pavsQ1: 'சராசரியாக, வாரத்திற்கு எத்தனை நாட்கள் மிதமான முதல் கடுமையான உடற்பயிற்சியில் (சுறுசுறுப்பான நடைப்பயிற்சி போல) ஈடுபடுகிறீர்கள்?',
    pavsQ2: 'சராசரியாக, இந்த நிலையில் எத்தனை நிமிடங்கள் உடற்பயிற்சி செய்கிறீர்கள்?',
    riskQ1: 'வாரத்தில் எத்தனை நாட்கள் தசை வலுப்படுத்தும் நடவடிக்கைகளில் ஈடுபடுகிறீர்கள்?',
    riskQ2: 'உங்களுக்கு எத்தனை நாள்பட்ட மருத்துவ நிலைமைகள் இருப்பது கண்டறியப்பட்டுள்ளது?',
    riskQ3: 'மருத்துவ நிலை காரணமாக உங்கள் உடல் செயல்பாடுகளைக் கட்டுப்படுத்த மருத்துவர் எப்போதாவது அறிவுறுத்தியுள்ளாரா?',
    riskQ4: 'உடற்பயிற்சியின் போது அல்லது அதற்குப் பிறகு எத்தனை உடல் அறிகுறிகளை (எ.கா. நெஞ்சு வலி, கடுமையான தலைச்சுற்றல்) அனுபவிக்கிறீர்கள்?',
    riskQ5: 'தலைச்சுற்றல் காரணமாக நீங்கள் எப்போதாவது சமநிலையை இழக்கிறீர்களா அல்லது சுயநினைவை இழக்கிறீர்களா?',
    sdohQ1: 'உடற்பயிற்சி செய்வதற்கோ அல்லது சுகாதார சேவையை நாடுவதற்கோ ஏதேனும் நிதி தடைகளை எதிர்கொள்கிறீர்களா?',
    sdohQ2: 'உடற்பயிற்சி செய்வதற்கு ஏதேனும் தளவாட தடைகளை (எ.கா. போக்குவரத்து, நேரம், இடம்) எதிர்கொள்கிறீர்களா?',
    sdohQ3: 'உடற்பயிற்சி செய்வதற்கு ஏதேனும் சமூக தடைகளை (எ.கா. ஆதரவு இல்லாமை, கவனிப்பு கடமைகள்) எதிர்கொள்கிறீர்களா?',
    postalCode: 'உங்கள் 6 இலக்க அஞ்சல் குறியீட்டை உள்ளிடவும் (விரும்பினால், பிராந்திய சுகாதார நுண்ணறிவுகளுக்கு):',
    submit: 'மதிப்பீட்டைச் சமர்ப்பிக்கவும்',
    yes: 'ஆம்',
    no: 'இல்லை',
    none: 'எதுவுமில்லை'
  }
};

export default function ConventionalForm() {
  const navigate = useNavigate();
  const [lang, setLang] = useState('en');
  const [step, setStep] = useState(1);
  const [animate, setAnimate] = useState(false);

  const [formData, setFormData] = useState({
    pavsDays: '',
    pavsMinutes: '',
    strengthDays: '',
    medConditions: '',
    medFlag: false,
    symptomsCount: '',
    symptomFlag: false,
    sdohFinancial: false,
    sdohLogistical: false,
    sdohSocial: false,
    postalCode: ''
  });

  useEffect(() => {
    const storedLang = localStorage.getItem('nexus_language');
    if (storedLang && DICTIONARY[storedLang]) {
      setLang(storedLang);
    }

    setTimeout(() => setAnimate(true), 100);

    const handleBeforeUnload = () => {
      recordTelemetry('00', { dropoff: `dropoff_step_${step}` });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [step]);

  const t = DICTIONARY[lang] || DICTIONARY.en;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const data = {
      pavsDays: Number(formData.pavsDays) || 0,
      pavsMinutes: Number(formData.pavsMinutes) || 0,
      strengthDays: Number(formData.strengthDays) || 0,
      medConditions: Number(formData.medConditions) || 0,
      medFlag: formData.medFlag,
      symptomsCount: Number(formData.symptomsCount) || 0,
      symptomFlag: formData.symptomFlag,
      sdohFinancial: formData.sdohFinancial,
      sdohLogistical: formData.sdohLogistical,
      sdohSocial: formData.sdohSocial
    };

    const score = calculateRiskScore(data);
    
    const prevScore = localStorage.getItem('nexus_last_score');
    localStorage.setItem('nexus_last_score', score);
    localStorage.setItem('nexus_last_timestamp', new Date().toISOString());
    
    const barriers = [];
    if (data.sdohFinancial) barriers.push('barrier_financial');
    if (data.sdohLogistical) barriers.push('barrier_logistical');
    if (data.sdohSocial) barriers.push('barrier_social');
    
    let transition = undefined;
    if (prevScore && prevScore !== score) {
      transition = `shift_${prevScore.toLowerCase()}_to_${score.toLowerCase()}`;
    }

    const postalSector = formData.postalCode.substring(0, 2) || '00';

    await recordTelemetry(postalSector, {
      score,
      language: lang,
      barriers: barriers.length > 0 ? barriers : undefined,
      transition
    });

    navigate('/individuals/result', { state: { score, data, postalSector } });
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 transition-colors duration-700 flex flex-col items-center py-12 px-4 md:px-6 relative overflow-x-hidden font-sans">
      
      {/* VISUAL BACKGROUND ELEMENTS */}
      <div className="absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '40px 40px' }}>
      </div>
      <div className={`fixed top-0 left-0 w-[800px] h-[800px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none animate-float-slow ${animate ? 'opacity-100' : 'opacity-0'}`}></div>
      <div className={`fixed bottom-0 right-0 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none animate-float-delayed ${animate ? 'opacity-100' : 'opacity-0'}`}></div>

      <div className={`relative z-10 w-full max-w-3xl transition-all duration-1000 transform ${animate ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 scale-95'}`}>
        
        {/* TOP BAR: Back Button */}
        <div className="flex justify-between items-center mb-8 px-2">
          <button 
            onClick={() => navigate('/individuals/pathway')} 
            className="flex items-center gap-2 px-4 py-2 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 font-black text-xs uppercase tracking-widest rounded-full border border-slate-200 dark:border-slate-700 shadow-sm transition-all group"
          >
              <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform"/> {t.back}
          </button>
        </div>

        {/* MAIN FORM CARD */}
        <div className="bg-white dark:bg-[#111827] rounded-[2rem] shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          
          <div className="px-8 py-10 bg-emerald-50 dark:bg-emerald-500/10 border-b border-emerald-100 dark:border-emerald-500/20 text-center md:text-left flex flex-col md:flex-row items-center gap-6">
             <div className="w-16 h-16 bg-white dark:bg-emerald-500/20 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
                <FileText className="w-8 h-8 text-emerald-500" />
             </div>
             <div>
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-1">{t.title}</h1>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">{t.subtitle}</p>
             </div>
          </div>
          
          <form onSubmit={handleSubmit} className="p-8 md:p-12 space-y-12">
            
            {/* PAVS SECTION */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <Activity className="text-indigo-500" size={20} />
                  <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">{t.sectionPavs}</h2>
              </div>
              
              <div className="grid gap-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">{t.pavsQ1}</label>
                    <input
                      type="number"
                      min="0"
                      max="7"
                      required
                      value={formData.pavsDays}
                      onChange={(e) => setFormData({...formData, pavsDays: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all"
                      onFocus={() => setStep(1)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">{t.pavsQ2}</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={formData.pavsMinutes}
                      onChange={(e) => setFormData({...formData, pavsMinutes: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all"
                      onFocus={() => setStep(1)}
                    />
                  </div>
              </div>
            </div>

            {/* MEDICAL RISK SECTION */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <HeartPulse className="text-rose-500" size={20} />
                  <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">{t.sectionRisk}</h2>
              </div>
              
              <div className="grid gap-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">{t.riskQ1}</label>
                    <input
                      type="number"
                      min="0"
                      max="7"
                      required
                      value={formData.strengthDays}
                      onChange={(e) => setFormData({...formData, strengthDays: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all"
                      onFocus={() => setStep(2)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">{t.riskQ2}</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={formData.medConditions}
                      onChange={(e) => setFormData({...formData, medConditions: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all"
                      onFocus={() => setStep(2)}
                    />
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t.riskQ3}</label>
                    <div className="flex space-x-6 shrink-0">
                      <label className="flex items-center cursor-pointer group">
                        <input type="radio" name="medFlag" checked={formData.medFlag} onChange={() => setFormData({...formData, medFlag: true})} className="w-4 h-4 text-emerald-500 border-slate-300 focus:ring-emerald-500 dark:bg-slate-800 dark:border-slate-600" onFocus={() => setStep(2)} />
                        <span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{t.yes}</span>
                      </label>
                      <label className="flex items-center cursor-pointer group">
                        <input type="radio" name="medFlag" checked={!formData.medFlag} onChange={() => setFormData({...formData, medFlag: false})} className="w-4 h-4 text-emerald-500 border-slate-300 focus:ring-emerald-500 dark:bg-slate-800 dark:border-slate-600" onFocus={() => setStep(2)} />
                        <span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{t.no}</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">{t.riskQ4}</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={formData.symptomsCount}
                      onChange={(e) => setFormData({...formData, symptomsCount: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all"
                      onFocus={() => setStep(2)}
                    />
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t.riskQ5}</label>
                    <div className="flex space-x-6 shrink-0">
                      <label className="flex items-center cursor-pointer group">
                        <input type="radio" name="symptomFlag" checked={formData.symptomFlag} onChange={() => setFormData({...formData, symptomFlag: true})} className="w-4 h-4 text-emerald-500 border-slate-300 focus:ring-emerald-500 dark:bg-slate-800 dark:border-slate-600" onFocus={() => setStep(2)} />
                        <span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{t.yes}</span>
                      </label>
                      <label className="flex items-center cursor-pointer group">
                        <input type="radio" name="symptomFlag" checked={!formData.symptomFlag} onChange={() => setFormData({...formData, symptomFlag: false})} className="w-4 h-4 text-emerald-500 border-slate-300 focus:ring-emerald-500 dark:bg-slate-800 dark:border-slate-600" onFocus={() => setStep(2)} />
                        <span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{t.no}</span>
                      </label>
                    </div>
                  </div>
              </div>
            </div>

            {/* SDOH SECTION */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <Users className="text-amber-500" size={20} />
                  <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">{t.sectionSdoh}</h2>
              </div>
              
              <div className="grid gap-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t.sdohQ1}</label>
                    <div className="flex space-x-6 shrink-0">
                      <label className="flex items-center cursor-pointer group">
                        <input type="radio" name="sdohFinancial" checked={formData.sdohFinancial} onChange={() => setFormData({...formData, sdohFinancial: true})} className="w-4 h-4 text-emerald-500 border-slate-300 focus:ring-emerald-500 dark:bg-slate-800 dark:border-slate-600" onFocus={() => setStep(3)} />
                        <span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{t.yes}</span>
                      </label>
                      <label className="flex items-center cursor-pointer group">
                        <input type="radio" name="sdohFinancial" checked={!formData.sdohFinancial} onChange={() => setFormData({...formData, sdohFinancial: false})} className="w-4 h-4 text-emerald-500 border-slate-300 focus:ring-emerald-500 dark:bg-slate-800 dark:border-slate-600" onFocus={() => setStep(3)} />
                        <span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{t.no}</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t.sdohQ2}</label>
                    <div className="flex space-x-6 shrink-0">
                      <label className="flex items-center cursor-pointer group">
                        <input type="radio" name="sdohLogistical" checked={formData.sdohLogistical} onChange={() => setFormData({...formData, sdohLogistical: true})} className="w-4 h-4 text-emerald-500 border-slate-300 focus:ring-emerald-500 dark:bg-slate-800 dark:border-slate-600" onFocus={() => setStep(3)} />
                        <span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{t.yes}</span>
                      </label>
                      <label className="flex items-center cursor-pointer group">
                        <input type="radio" name="sdohLogistical" checked={!formData.sdohLogistical} onChange={() => setFormData({...formData, sdohLogistical: false})} className="w-4 h-4 text-emerald-500 border-slate-300 focus:ring-emerald-500 dark:bg-slate-800 dark:border-slate-600" onFocus={() => setStep(3)} />
                        <span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{t.no}</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t.sdohQ3}</label>
                    <div className="flex space-x-6 shrink-0">
                      <label className="flex items-center cursor-pointer group">
                        <input type="radio" name="sdohSocial" checked={formData.sdohSocial} onChange={() => setFormData({...formData, sdohSocial: true})} className="w-4 h-4 text-emerald-500 border-slate-300 focus:ring-emerald-500 dark:bg-slate-800 dark:border-slate-600" onFocus={() => setStep(3)} />
                        <span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{t.yes}</span>
                      </label>
                      <label className="flex items-center cursor-pointer group">
                        <input type="radio" name="sdohSocial" checked={!formData.sdohSocial} onChange={() => setFormData({...formData, sdohSocial: false})} className="w-4 h-4 text-emerald-500 border-slate-300 focus:ring-emerald-500 dark:bg-slate-800 dark:border-slate-600" onFocus={() => setStep(3)} />
                        <span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{t.no}</span>
                      </label>
                    </div>
                  </div>
              </div>
            </div>

            {/* DEMOGRAPHICS SECTION */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <MapPin className="text-purple-500" size={20} />
                  <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">{t.sectionDemo}</h2>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">{t.postalCode}</label>
                <input
                  type="text"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={formData.postalCode}
                  onChange={(e) => setFormData({...formData, postalCode: e.target.value.replace(/\D/g, '')})}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all"
                  onFocus={() => setStep(4)}
                />
              </div>
            </div>

            {/* SUBMIT BUTTON */}
            <div className="pt-6">
              <button
                type="submit"
                className="w-full bg-emerald-500 text-white font-black text-sm uppercase tracking-widest py-5 rounded-xl hover:bg-emerald-600 transition-all shadow-[0_10px_20px_rgba(16,185,129,0.2)] active:scale-95"
              >
                {t.submit}
              </button>
            </div>
          </form>
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
