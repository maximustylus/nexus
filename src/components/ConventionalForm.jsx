import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { calculateRiskScore } from '../utils/scoring';
import { recordTelemetry } from '../utils/telemetry';
import { ChevronLeft, ChevronRight, Activity, MessageSquare, AlertCircle, User, Send } from 'lucide-react';

const DICTIONARY = {
  en: {
    back: 'Back',
    title: 'Health & Community Assessment',
    steps: ['Your Health', 'Your Experience', 'Challenges & Support', 'About You'],
    
    // Step 1: Health (Hook)
    pavsQ1: 'How many days a week do you usually get some moderate or strenuous exercise?',
    pavsQ2: 'On those days, roughly how many minutes do you exercise?',
    riskQ1: 'How many days a week do you do activities that strengthen your muscles?',
    riskQ2: 'Have you been diagnosed with any chronic medical conditions? (If so, how many?)',
    riskQ3: 'Has a doctor ever advised you to limit your physical activity?',
    riskQ4: 'Do you experience physical symptoms like chest pain during exercise? (If so, how many?)',
    riskQ5: 'Do you ever feel dizzy enough to lose your balance?',
    
    // Step 2: Experience (Opinion)
    survAware: 'Have you heard about the health and wellness services available right in your neighbourhood?',
    survReferred: 'Has a doctor ever recommended you visit a community health post for a condition?',
    survRate: 'If you have used community services, how did the care feel compared to a hospital?',
    survTrust: 'How comfortable and safe do you feel receiving care in the community? (1 = Not at all, 5 = Very safe)',
    
    // Step 3: Challenges (Empathy)
    barriersIntro: 'What makes it difficult for you to stay active or use community health services? (Select all that apply)',
    barrFin: 'Cost / Financial worries',
    barrLog: 'Too far or transportation is tough',
    barrTime: 'Lack of time / Long wait times',
    barrSoc: 'Caregiving duties / Lack of support',
    barrLang: 'Language barriers',
    barrHosp: 'I just prefer going to the hospital',
    barrNone: 'Nothing is stopping me',
    survImprove: 'If you could change one thing about healthcare in your neighbourhood, what would it be?',
    
    // Step 4: Demographics (Low-friction close)
    demoIntro: 'Finally, to help us ensure we are serving everyone in our community fairly, tell us a bit about yourself.',
    demoAge: 'Age Group',
    demoGender: 'Gender',
    demoRace: 'Race',
    postalCode: 'First 2 digits of your Postal Code',
    
    btnNext: 'Next', btnPrev: 'Previous', btnSubmit: 'Get My Results', yes: 'Yes', no: 'No'
  },
  ms: {
    back: 'Kembali',
    title: 'Penilaian Kesihatan & Komuniti',
    steps: ['Kesihatan Anda', 'Pengalaman Anda', 'Cabaran & Sokongan', 'Mengenai Anda'],
    
    pavsQ1: 'Berapa hari seminggu anda biasanya melakukan senaman sederhana atau berat?',
    pavsQ2: 'Pada hari tersebut, secara kasar berapa minit anda bersenam?',
    riskQ1: 'Berapa hari seminggu anda melakukan aktiviti yang menguatkan otot anda?',
    riskQ2: 'Pernahkah anda didiagnosis dengan sebarang keadaan perubatan kronik? (Jika ya, berapa banyak?)',
    riskQ3: 'Pernahkah doktor menasihati anda untuk mengehadkan aktiviti fizikal anda?',
    riskQ4: 'Adakah anda mengalami simptom fizikal seperti sakit dada semasa bersenam? (Jika ya, berapa banyak?)',
    riskQ5: 'Adakah anda pernah berasa pening sehingga hilang keseimbangan?',
    
    survAware: 'Pernahkah anda mendengar tentang perkhidmatan kesihatan dan kesejahteraan yang terdapat di kawasan kejiranan anda?',
    survReferred: 'Pernahkah doktor mengesyorkan anda melawat pos kesihatan komuniti untuk sesuatu keadaan?',
    survRate: 'Jika anda pernah menggunakan perkhidmatan komuniti, bagaimanakah rasanya berbanding di hospital?',
    survTrust: 'Sejauh manakah anda berasa selesa dan selamat menerima penjagaan dalam komuniti? (1 = Tidak sama sekali, 5 = Sangat selamat)',
    
    barriersIntro: 'Apakah yang menyukarkan anda untuk kekal aktif atau menggunakan perkhidmatan kesihatan komuniti? (Pilih semua yang berkenaan)',
    barrFin: 'Kos / Kebimbangan kewangan',
    barrLog: 'Terlalu jauh atau pengangkutan sukar',
    barrTime: 'Kekurangan masa / Masa menunggu yang lama',
    barrSoc: 'Tugas menjaga / Kurang sokongan',
    barrLang: 'Halangan bahasa',
    barrHosp: 'Saya lebih suka pergi ke hospital',
    barrNone: 'Tiada apa yang menghalang saya',
    survImprove: 'Jika anda boleh mengubah satu perkara tentang penjagaan kesihatan di kejiranan anda, apakah itu?',
    
    demoIntro: 'Akhir sekali, untuk membantu kami memastikan kami berkhidmat kepada semua orang dalam komuniti kami secara adil, beritahu kami sedikit tentang diri anda.',
    demoAge: 'Kumpulan Umur',
    demoGender: 'Jantina',
    demoRace: 'Bangsa',
    postalCode: '2 digit pertama Poskod anda',
    
    btnNext: 'Seterusnya', btnPrev: 'Sebelumnya', btnSubmit: 'Dapatkan Keputusan', yes: 'Ya', no: 'Tidak'
  },
  zh: {
    back: '返回',
    title: '健康与社区评估',
    steps: ['您的健康', '您的体验', '挑战与支持', '关于您'],
    
    pavsQ1: '您通常每周有几天进行中度或剧烈运动？',
    pavsQ2: '在这些天里，您大约运动多少分钟？',
    riskQ1: '您每周有几天进行肌肉强化活动？',
    riskQ2: '您是否被诊断出患有任何慢性医疗状况？（如果有，有多少种？）',
    riskQ3: '医生是否曾建议您限制身体活动？',
    riskQ4: '您在运动时是否经历过胸痛等身体症状？（如果有，有多少种？）',
    riskQ5: '您是否曾因头晕而失去平衡？',
    
    survAware: '您听说过您社区提供的健康和保健服务吗？',
    survReferred: '医生是否曾建议您去社区卫生站看病？',
    survRate: '如果您使用过社区服务，与医院相比，您感觉护理如何？',
    survTrust: '您在社区接受护理感到多舒适和安全？（1 = 完全不，5 = 非常安全）',
    
    barriersIntro: '是什么让您难以保持活跃或使用社区健康服务？（选择所有适用项）',
    barrFin: '费用/财务担忧',
    barrLog: '太远或交通不便',
    barrTime: '缺乏时间/等待时间长',
    barrSoc: '照顾责任/缺乏支持',
    barrLang: '语言障碍',
    barrHosp: '我更喜欢去医院',
    barrNone: '没有任何阻碍',
    survImprove: '如果您能改变社区医疗保健的一件事，那会是什么？',
    
    demoIntro: '最后，为了帮助我们确保公平地为社区中的每个人提供服务，请告诉我们一些关于您自己的信息。',
    demoAge: '年龄组',
    demoGender: '性别',
    demoRace: '种族',
    postalCode: '邮政编码前2位',
    
    btnNext: '下一步', btnPrev: '上一步', btnSubmit: '获取结果', yes: '是', no: '否'
  },
  ta: {
    back: 'பின்செல்',
    title: 'உடல்நலம் மற்றும் சமூக மதிப்பீடு',
    steps: ['உங்கள் உடல்நலம்', 'உங்கள் அனுபவம்', 'சவால்கள் & ஆதரவு', 'உங்களை பற்றி'],
    
    pavsQ1: 'வழக்கமாக வாரத்தில் எத்தனை நாட்கள் மிதமான அல்லது கடுமையான உடற்பயிற்சி செய்கிறீர்கள்?',
    pavsQ2: 'அந்த நாட்களில், தோராயமாக எத்தனை நிமிடங்கள் உடற்பயிற்சி செய்கிறீர்கள்?',
    riskQ1: 'உங்கள் தசைகளை வலுப்படுத்தும் செயல்களை வாரத்தில் எத்தனை நாட்கள் செய்கிறீர்கள்?',
    riskQ2: 'உங்களுக்கு ஏதேனும் நாள்பட்ட மருத்துவ நிலைமைகள் இருப்பது கண்டறியப்பட்டுள்ளதா? (அப்படியானால், எத்தனை?)',
    riskQ3: 'உங்கள் உடல் செயல்பாட்டைக் கட்டுப்படுத்த மருத்துவர் எப்போதாவது அறிவுறுத்தியுள்ளாரா?',
    riskQ4: 'உடற்பயிற்சியின் போது நெஞ்சு வலி போன்ற உடல் அறிகுறிகளை நீங்கள் அனுபவிக்கிறீர்களா? (அப்படியானால், எத்தனை?)',
    riskQ5: 'உங்கள் சமநிலையை இழக்கும் அளவுக்கு உங்களுக்கு எப்போதாவது தலைசுற்றல் ஏற்படுகிறதா?',
    
    survAware: 'உங்கள் அருகில் கிடைக்கும் சுகாதார மற்றும் ஆரோக்கிய சேவைகளைப் பற்றி கேள்விப்பட்டிருக்கிறீர்களா?',
    survReferred: 'ஒரு நிலைமைக்காக சமூக சுகாதார நிலையத்திற்கு செல்ல மருத்துவர் எப்போதாவது பரிந்துரைத்திருக்கிறாரா?',
    survRate: 'நீங்கள் சமூக சேவைகளைப் பயன்படுத்தியிருந்தால், மருத்துவமனையுடன் ஒப்பிடும்போது கவனிப்பு எப்படி இருந்தது?',
    survTrust: 'சமூகத்தில் கவனிப்பைப் பெறுவது எவ்வளவு வசதியாகவும் பாதுகாப்பாகவும் உணர்கிறீர்கள்? (1 = இல்லவே இல்லை, 5 = மிகவும் பாதுகாப்பானது)',
    
    barriersIntro: 'சுறுசுறுப்பாக இருப்பதற்கோ அல்லது சமூக சுகாதார சேவைகளைப் பயன்படுத்துவதற்கோ உங்களுக்கு எது சிரமமாக உள்ளது? (பொருந்தும் அனைத்தையும் தேர்ந்தெடுக்கவும்)',
    barrFin: 'செலவு / நிதி கவலைகள்',
    barrLog: 'வெகு தொலைவு அல்லது போக்குவரத்து கடினம்',
    barrTime: 'நேரமின்மை / நீண்ட காத்திருப்பு நேரம்',
    barrSoc: 'கவனிப்பு கடமைகள் / ஆதரவு இல்லாமை',
    barrLang: 'மொழி தடைகள்',
    barrHosp: 'நான் மருத்துவமனைக்கு செல்வதையே விரும்புகிறேன்',
    barrNone: 'எதுவும் என்னைத் தடுக்கவில்லை',
    survImprove: 'உங்கள் அருகில் உள்ள சுகாதார சேவையில் ஒன்றை மாற்ற முடிந்தால், அது என்னவாக இருக்கும்?',
    
    demoIntro: 'இறுதியாக, எங்கள் சமூகத்தில் உள்ள அனைவருக்கும் நியாயமான முறையில் சேவை செய்வதை உறுதிசெய்ய, உங்களைப் பற்றி கொஞ்சம் சொல்லுங்கள்.',
    demoAge: 'வயது குழு',
    demoGender: 'பாலினம்',
    demoRace: 'இனம்',
    postalCode: 'அஞ்சல் குறியீட்டின் முதல் 2 இலக்கங்கள்',
    
    btnNext: 'அடுத்தது', btnPrev: 'முந்தையது', btnSubmit: 'முடிவுகளைப் பெறுக', yes: 'ஆம்', no: 'இல்லை'
  }
};

export default function ConventionalForm() {
  const navigate = useNavigate();
  const [lang, setLang] = useState('en');
  const [step, setStep] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [sessionId] = useState(() => 'nx-' + Math.random().toString(36).substr(2, 9)); 

  const [formData, setFormData] = useState({
    pavsDays: '', pavsMinutes: '', strengthDays: '', medConditions: '', medFlag: false, symptomsCount: '', symptomFlag: false,
    aware: '', referred: '', rating: '', trust: '3',
    barriers: [], improve: '',
    age: '', gender: '', race: '', postalCode: ''
  });

  useEffect(() => {
    const storedLang = localStorage.getItem('nexus_language');
    if (storedLang && DICTIONARY[storedLang]) setLang(storedLang);
    setTimeout(() => setAnimate(true), 100);
  }, []);

  const t = DICTIONARY[lang] || DICTIONARY.en;

  const handleArrayToggle = (value) => {
    setFormData(prev => {
      const current = prev.barriers;
      if (current.includes(value)) return { ...prev, barriers: current.filter(item => item !== value) };
      return { ...prev, barriers: [...current, value] };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const clinicalData = {
      pavsDays: Number(formData.pavsDays) || 0,
      pavsMinutes: Number(formData.pavsMinutes) || 0,
      strengthDays: Number(formData.strengthDays) || 0,
      medConditions: Number(formData.medConditions) || 0,
      medFlag: formData.medFlag,
      symptomsCount: Number(formData.symptomsCount) || 0,
      symptomFlag: formData.symptomFlag,
      sdohFinancial: formData.barriers.includes(t.barrFin),
      sdohLogistical: formData.barriers.includes(t.barrLog),
      sdohSocial: formData.barriers.includes(t.barrSoc)
    };

    const score = calculateRiskScore(clinicalData);
    const postalSector = formData.postalCode || '00';

    const masterPayload = {
        sessionId: sessionId,
        action: 'unified_assessment_complete',
        language: lang,
        score: score,
        clinical: clinicalData,
        perception: {
            aware: formData.aware, referred: formData.referred, rating: formData.rating,
            trust: formData.trust, barriers: formData.barriers, improve: formData.improve
        },
        demographics: {
            age: formData.age, gender: formData.gender, race: formData.race, sector: postalSector
        }
    };

    await recordTelemetry(postalSector, masterPayload);
    navigate('/individuals/result', { state: { score, data: clinicalData, postalSector } });
  };

  const renderStep1 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="grid gap-6">
            <div className="grid md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.pavsQ1}</label>
                    <input type="number" min="0" max="7" value={formData.pavsDays} onChange={e => setFormData({...formData, pavsDays: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.pavsQ2}</label>
                    <input type="number" min="0" value={formData.pavsMinutes} onChange={e => setFormData({...formData, pavsMinutes: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.riskQ1}</label>
                    <input type="number" min="0" max="7" value={formData.strengthDays} onChange={e => setFormData({...formData, strengthDays: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.riskQ2}</label>
                    <input type="number" min="0" value={formData.medConditions} onChange={e => setFormData({...formData, medConditions: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
            </div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t.riskQ3}</label>
                <div className="flex space-x-6 shrink-0">
                    <label className="flex items-center cursor-pointer group"><input type="radio" checked={formData.medFlag} onChange={() => setFormData({...formData, medFlag: true})} className="w-4 h-4 text-indigo-500 focus:ring-indigo-500" /><span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400">{t.yes}</span></label>
                    <label className="flex items-center cursor-pointer group"><input type="radio" checked={!formData.medFlag} onChange={() => setFormData({...formData, medFlag: false})} className="w-4 h-4 text-indigo-500 focus:ring-indigo-500" /><span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400">{t.no}</span></label>
                </div>
            </div>
            <div className="grid md:grid-cols-2 gap-6 items-end">
                <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.riskQ4}</label>
                    <input type="number" min="0" value={formData.symptomsCount} onChange={e => setFormData({...formData, symptomsCount: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t.riskQ5}</label>
                    <div className="flex space-x-6 shrink-0">
                        <label className="flex items-center cursor-pointer group"><input type="radio" checked={formData.symptomFlag} onChange={() => setFormData({...formData, symptomFlag: true})} className="w-4 h-4 text-indigo-500 focus:ring-indigo-500" /><span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400">{t.yes}</span></label>
                        <label className="flex items-center cursor-pointer group"><input type="radio" checked={!formData.symptomFlag} onChange={() => setFormData({...formData, symptomFlag: false})} className="w-4 h-4 text-indigo-500 focus:ring-indigo-500" /><span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400">{t.no}</span></label>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="grid gap-6">
            {['aware', 'referred'].map(field => (
                <div key={field} className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 w-full md:w-2/3">{field === 'aware' ? t.survAware : t.survReferred}</label>
                    <div className="flex space-x-6 shrink-0">
                        <label className="flex items-center cursor-pointer group"><input type="radio" checked={formData[field] === 'Yes'} onChange={() => setFormData({...formData, [field]: 'Yes'})} className="w-4 h-4 text-amber-500 focus:ring-amber-500" /><span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400">{t.yes}</span></label>
                        <label className="flex items-center cursor-pointer group"><input type="radio" checked={formData[field] === 'No'} onChange={() => setFormData({...formData, [field]: 'No'})} className="w-4 h-4 text-amber-500 focus:ring-amber-500" /><span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400">{t.no}</span></label>
                    </div>
                </div>
            ))}
            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.survRate}</label>
                <select value={formData.rating} onChange={e => setFormData({...formData, rating: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-500">
                    <option value="">--</option>
                    <option>Better than hospital</option>
                    <option>About the Same</option>
                    <option>Needs Improvement</option>
                    <option>N/A</option>
                </select>
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.survTrust}</label>
                <div className="flex gap-2">
                    {[1,2,3,4,5].map(num => (
                        <button key={num} type="button" onClick={() => setFormData({...formData, trust: String(num)})} className={`flex-1 py-3 rounded-xl font-black text-lg transition-colors border ${formData.trust === String(num) ? 'bg-amber-500 text-white border-amber-500' : 'bg-slate-50 dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-700 hover:border-amber-300'}`}>{num}</button>
                    ))}
                </div>
            </div>
        </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="grid gap-6">
            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">{t.barriersIntro}</label>
                <div className="space-y-3 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    {['barrFin', 'barrLog', 'barrTime', 'barrSoc', 'barrLang', 'barrHosp', 'barrNone'].map(optKey => (
                        <label key={optKey} className="flex items-center cursor-pointer group">
                            <input type="checkbox" checked={formData.barriers.includes(t[optKey])} onChange={() => handleArrayToggle(t[optKey])} className="w-5 h-5 text-emerald-500 border-slate-300 rounded focus:ring-emerald-500" />
                            <span className="ml-3 text-sm font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{t[optKey]}</span>
                        </label>
                    ))}
                </div>
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">{t.survImprove}</label>
                <textarea rows={3} value={formData.improve} onChange={e => setFormData({...formData, improve: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500" placeholder="..."></textarea>
            </div>
        </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="p-4 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-xl">
            <p className="text-sm font-bold text-indigo-700 dark:text-indigo-400">{t.demoIntro}</p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.demoAge}</label>
                <select value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-purple-500">
                    <option value="">--</option>
                    <option>Under 21</option>
                    <option>21-40</option>
                    <option>41-60</option>
                    <option>60+</option>
                </select>
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.demoGender}</label>
                <select value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-purple-500">
                    <option value="">--</option>
                    <option>Male</option>
                    <option>Female</option>
                </select>
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.demoRace}</label>
                <select value={formData.race} onChange={e => setFormData({...formData, race: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-purple-500">
                    <option value="">--</option>
                    <option>Chinese</option>
                    <option>Malay</option>
                    <option>Indian</option>
                    <option>Others</option>
                </select>
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.postalCode}</label>
                <input type="text" maxLength={2} placeholder="e.g. 73" value={formData.postalCode} onChange={e => setFormData({...formData, postalCode: e.target.value.replace(/\D/g, '')})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
        </div>
    </div>
  );

  const icons = [<Activity size={20}/>, <MessageSquare size={20}/>, <AlertCircle size={20}/>, <User size={20}/>];
  const renders = [renderStep1, renderStep2, renderStep3, renderStep4];
  const themeColors = ['indigo', 'amber', 'emerald', 'purple'];
  const activeColor = themeColors[step];

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 transition-colors duration-700 flex flex-col items-center py-12 px-4 md:px-6 relative overflow-x-hidden font-sans">
      <div className="absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
      <div className={`fixed top-0 left-0 w-[800px] h-[800px] bg-${activeColor}-500/10 rounded-full blur-[120px] pointer-events-none animate-float-slow transition-colors duration-1000 ${animate ? 'opacity-100' : 'opacity-0'}`}></div>

      <div className={`relative z-10 w-full max-w-3xl transition-all duration-1000 transform ${animate ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
        
        {/* TOP BAR */}
        <div className="flex justify-between items-center mb-6 px-2">
          <button onClick={() => navigate('/individuals/pathway')} className="flex items-center gap-2 px-4 py-2 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white font-black text-xs uppercase tracking-widest rounded-full border border-slate-200 dark:border-slate-700 shadow-sm transition-all group">
              <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform"/> {t.back}
          </button>
          <div className="text-[10px] font-mono text-slate-400 bg-slate-200/50 dark:bg-slate-800/50 px-2 py-1 rounded">ID: {sessionId}</div>
        </div>

        {/* PROGRESS TABS */}
        <div className="flex justify-between items-center mb-8 px-2">
            {t.steps.map((title, idx) => (
                <div key={idx} className={`flex-1 h-1.5 mx-1 rounded-full transition-colors duration-500 ${step >= idx ? `bg-${themeColors[idx]}-500` : 'bg-slate-200 dark:bg-slate-800'}`} />
            ))}
        </div>

        {/* MAIN CARD */}
        <div className="bg-white dark:bg-[#111827] rounded-[2rem] shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden mb-8">
          <div className={`px-8 py-8 bg-${activeColor}-50 dark:bg-${activeColor}-500/10 border-b border-${activeColor}-100 dark:border-${activeColor}-500/20 flex items-center gap-5 transition-colors duration-500`}>
             <div className={`w-14 h-14 bg-white dark:bg-${activeColor}-500/20 rounded-2xl flex items-center justify-center shadow-sm shrink-0 text-${activeColor}-500 transition-colors duration-500`}>
                {icons[step]}
             </div>
             <div>
                <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-1">{t.title}</h1>
                <p className={`text-xs font-bold text-${activeColor}-600 dark:text-${activeColor}-400 uppercase tracking-widest transition-colors duration-500`}>{t.steps[step]}</p>
             </div>
          </div>
          
          <form onSubmit={handleSubmit} className="p-8 md:p-12">
              {renders[step]()}
          </form>
        </div>

        {/* NAVIGATION CONTROLS */}
        <div className="flex justify-between items-center gap-4">
            <button 
                type="button" 
                onClick={() => setStep(prev => Math.max(0, prev - 1))} 
                disabled={step === 0} 
                className={`flex-1 md:flex-none flex justify-center items-center gap-2 py-4 px-8 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${step === 0 ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-50' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:shadow-md border border-slate-200 dark:border-slate-700 active:scale-95'}`}
            >
                <ChevronLeft size={16} /> {t.btnPrev}
            </button>

            {step < 3 ? (
                <button 
                    type="button" 
                    onClick={() => setStep(prev => Math.min(3, prev + 1))} 
                    className={`flex-1 md:flex-none flex justify-center items-center gap-2 py-4 px-8 bg-${activeColor}-500 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-${activeColor}-600 transition-all shadow-[0_10px_20px_rgba(0,0,0,0.1)] active:scale-95`}
                >
                    {t.btnNext} <ChevronRight size={16} />
                </button>
            ) : (
                <button 
                    onClick={handleSubmit} 
                    className="flex-1 md:flex-none flex justify-center items-center gap-2 py-4 px-8 bg-purple-500 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-purple-600 transition-all shadow-[0_10px_20px_rgba(168,85,247,0.2)] active:scale-95"
                >
                    <Send size={16} /> {t.btnSubmit}
                </button>
            )}
        </div>
      </div>
    </div>
  );
}
