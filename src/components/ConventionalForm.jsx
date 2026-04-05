import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { calculateRiskScore } from '../utils/scoring';
import { recordTelemetry } from '../utils/telemetry';
import { ChevronLeft, ChevronRight, Activity, MessageSquare, AlertCircle, User, Send } from 'lucide-react';

const DICTIONARY = {
  en: {
    back: 'Back',
    title: 'Health & Community Assessment',
    steps: ['Your Health', 'Challenges & Support', 'Your Experience', 'About You'],
    
    pavsQ1: 'On how many days in a typical week do you do moderate or vigorous physical activity?',
    pavsQ2: 'On those days, for how many minutes do you usually do this activity?',
    riskQ1: 'How many days a week do you do activities that strengthen your muscles?',
    riskQ2: 'Please list any chronic medical conditions you have been diagnosed with (e.g. High Blood Pressure, Diabetes):',
    riskQ3: 'Has a doctor ever advised you to limit your physical activity?',
    riskQ4: 'Do you experience physical symptoms like chest pain during exercise?',
    riskQ5: 'Do you ever feel dizzy enough to lose your balance?',
    psychoQ1: 'Over the past month, have you frequently felt down, depressed, or hopeless?',
    
    sdohIntro: 'We want to understand what might be making it harder for you to stay healthy.',
    sdohFood: 'In the past 12 months, were you ever hungry but did not eat because you could not afford enough food?',
    sdohFinance: 'Do you feel you have adequate income to meet your monthly expenses?',
    finOpt1: 'More than adequate', finOpt2: 'Adequate', finOpt3: 'Inadequate (Some or much difficulty)',
    sdohSocial: 'How many relatives or friends do you see or hear from at least once a month?',
    socOpt1: 'None', socOpt2: '1 to 4 people', socOpt3: '5 to 8 people', socOpt4: '9 or more people',
    
    survAware: 'Have you heard about the health and wellness services available right in your neighbourhood?',
    survReferred: 'Has a doctor ever recommended you visit a community health post for a condition?',
    survRate: 'If you have used community services, how did the care feel compared to a hospital?',
    rateOpt1: 'Better than hospital', rateOpt2: 'About the Same', rateOpt3: 'Needs Improvement', rateOpt4: 'N/A',
    survTrust: 'How comfortable and safe do you feel receiving care in the community? (1 = Not at all, 5 = Very safe)',
    barriersIntro: 'What makes it difficult for you to use community health services? (Select all that apply)',
    barrFin: 'Cost concerns', barrLog: 'Too far or Transportation', barrTime: 'Lack of time', barrSoc: 'Caregiving duties', barrLang: 'Language barriers', barrHosp: 'Prefer the hospital', barrNone: 'No barriers',
    survImprove: 'If you could change one thing about healthcare in your neighbourhood, what would it be?',
    
    demoIntro: 'Finally, to help us ensure we are serving everyone fairly, tell us a bit about yourself.',
    demoAge: 'Age Group',
    ageOpt1: 'Under 21', ageOpt2: '21-40', ageOpt3: '41-60', ageOpt4: '60+',
    demoGender: 'Gender',
    genOpt1: 'Male', genOpt2: 'Female',
    demoRace: 'Race',
    raceOpt1: 'Chinese', raceOpt2: 'Malay', raceOpt3: 'Indian', raceOpt4: 'Others',
    demoHousing: 'To help us understand your community better, what type of housing do you currently reside in?',
    houseOpt1: 'HDB 1 to 2 Room', houseOpt2: 'HDB 3 to 5 Room', houseOpt3: 'Private Property',
    postalCode: 'First 2 digits of your Postal Code',
    
    btnNext: 'Next', btnPrev: 'Previous', btnSubmit: 'Get My Results', yes: 'Yes', no: 'No'
  },
  ms: {
    back: 'Kembali',
    title: 'Penilaian Kesihatan & Komuniti',
    steps: ['Kesihatan Anda', 'Cabaran & Sokongan', 'Pengalaman Anda', 'Mengenai Anda'],
    
    pavsQ1: 'Berapa hari dalam minggu biasa anda melakukan aktiviti fizikal sederhana atau berat?',
    pavsQ2: 'Pada hari tersebut, untuk berapa minit anda biasanya melakukan aktiviti ini?',
    riskQ1: 'Berapa hari seminggu anda melakukan aktiviti yang menguatkan otot anda?',
    riskQ2: 'Sila nyatakan sebarang keadaan perubatan kronik yang telah disahkan (cth. Darah Tinggi, Kencing Manis):',
    riskQ3: 'Pernahkah doktor menasihati anda untuk mengehadkan aktiviti fizikal anda?',
    riskQ4: 'Adakah anda mengalami simptom fizikal seperti sakit dada semasa bersenam?',
    riskQ5: 'Adakah anda pernah berasa pening sehingga hilang keseimbangan?',
    psychoQ1: 'Sepanjang bulan lalu, adakah anda kerap berasa sedih, murung, atau putus asa?',
    
    sdohIntro: 'Kami ingin memahami apa yang mungkin menyukarkan anda untuk kekal sihat.',
    sdohFood: 'Dalam 12 bulan yang lalu, pernahkah anda berlapar tetapi tidak makan kerana tidak mampu membeli makanan yang cukup?',
    sdohFinance: 'Adakah anda rasa anda mempunyai pendapatan yang mencukupi untuk menampung perbelanjaan bulanan anda?',
    finOpt1: 'Lebih daripada mencukupi', finOpt2: 'Mencukupi', finOpt3: 'Tidak mencukupi (Agak atau sangat sukar)',
    sdohSocial: 'Kira-kira berapa ramai saudara atau rakan yang anda jumpa atau berhubung sekurang-kurangnya sebulan sekali?',
    socOpt1: 'Tiada', socOpt2: '1 hingga 4 orang', socOpt3: '5 hingga 8 orang', socOpt4: '9 orang atau lebih',
    
    survAware: 'Pernahkah anda mendengar tentang perkhidmatan kesihatan di kawasan kejiranan anda?',
    survReferred: 'Pernahkah doktor mengesyorkan anda melawat pos kesihatan komuniti?',
    survRate: 'Jika anda pernah menggunakan perkhidmatan komuniti, bagaimanakah rasanya berbanding di hospital?',
    rateOpt1: 'Lebih baik', rateOpt2: 'Sama sahaja', rateOpt3: 'Perlu diperbaiki', rateOpt4: 'Tidak Berkaitan',
    survTrust: 'Sejauh manakah anda berasa selesa dan selamat menerima penjagaan dalam komuniti? (1 = Tidak sama sekali, 5 = Sangat selamat)',
    barriersIntro: 'Apakah yang menyukarkan anda untuk menggunakan perkhidmatan kesihatan komuniti? (Pilih semua yang berkenaan)',
    barrFin: 'Kos', barrLog: 'Terlalu jauh atau Pengangkutan', barrTime: 'Tiada masa', barrSoc: 'Tugas menjaga', barrLang: 'Halangan bahasa', barrHosp: 'Lebih suka hospital', barrNone: 'Tiada halangan',
    survImprove: 'Jika anda boleh mengubah satu perkara tentang penjagaan kesihatan di kejiranan anda, apakah itu?',
    
    demoIntro: 'Akhir sekali, beritahu kami sedikit tentang diri anda.',
    demoAge: 'Kumpulan Umur',
    ageOpt1: 'Bawah 21', ageOpt2: '21-40', ageOpt3: '41-60', ageOpt4: '60+',
    demoGender: 'Jantina',
    genOpt1: 'Lelaki', genOpt2: 'Perempuan',
    demoRace: 'Bangsa',
    raceOpt1: 'Cina', raceOpt2: 'Melayu', raceOpt3: 'India', raceOpt4: 'Lain-lain',
    demoHousing: 'Untuk membantu kami lebih memahami komuniti anda, apakah jenis perumahan yang anda diami sekarang?',
    houseOpt1: 'HDB 1 hingga 2 Bilik', houseOpt2: 'HDB 3 hingga 5 Bilik', houseOpt3: 'Hartanah Persendirian',
    postalCode: '2 digit pertama Poskod anda',
    
    btnNext: 'Seterusnya', btnPrev: 'Sebelumnya', btnSubmit: 'Dapatkan Keputusan', yes: 'Ya', no: 'Tidak'
  },
  zh: {
    back: '返回',
    title: '健康与社区评估',
    steps: ['您的健康', '挑战与支持', '您的体验', '关于您'],
    
    pavsQ1: '在通常的一周内，您有几天进行中度或剧烈的身体活动？',
    pavsQ2: '在这些天里，您通常进行多少分钟的活动？',
    riskQ1: '您每周有几天进行肌肉强化活动？',
    riskQ2: '请列出您被诊断出的任何慢性疾病（例如高血压、糖尿病）：',
    riskQ3: '医生是否曾建议您限制身体活动？',
    riskQ4: '您在运动时是否经历过胸痛等身体症状？',
    riskQ5: '您是否曾因头晕而失去平衡？',
    psychoQ1: '在过去的一个月里，您是否经常感到情绪低落、抑郁或绝望？',
    
    sdohIntro: '我们希望了解是什么让您难以保持健康。',
    sdohFood: '在过去的12个月里，您是否曾因为买不起足够的食物而挨饿？',
    sdohFinance: '您觉得您的收入足以支付每月的开销吗？',
    finOpt1: '绰绰有余', finOpt2: '足够', finOpt3: '不足（有些或很大困难）',
    sdohSocial: '您每个月至少见一次面或通一次话的亲戚或朋友大约有多少人？',
    socOpt1: '没有', socOpt2: '1 到 4 人', socOpt3: '5 到 8 人', socOpt4: '9 人或以上',
    
    survAware: '您听说过您社区提供的健康和保健服务吗？',
    survReferred: '医生是否曾建议您去社区卫生站看病？',
    survRate: '如果您使用过社区服务，与医院相比，您感觉护理如何？',
    rateOpt1: '比医院好', rateOpt2: '差不多', rateOpt3: '需要改进', rateOpt4: '不适用',
    survTrust: '您在社区接受护理感到多舒适和安全？（1 = 完全不，5 = 非常安全）',
    barriersIntro: '是什么让您难以使用社区健康服务？（选择所有适用项）',
    barrFin: '费用问题', barrLog: '太远或交通不便', barrTime: '没时间', barrSoc: '照顾责任', barrLang: '语言障碍', barrHosp: '更喜欢医院', barrNone: '没有障碍',
    survImprove: '如果您能改变社区医疗保健的一件事，那会是什么？',
    
    demoIntro: '最后，请告诉我们一些关于您自己的信息。',
    demoAge: '年龄组',
    ageOpt1: '21岁以下', ageOpt2: '21-40岁', ageOpt3: '41-60岁', ageOpt4: '60岁以上',
    demoGender: '性别',
    genOpt1: '男', genOpt2: '女',
    demoRace: '种族',
    raceOpt1: '华人', raceOpt2: '马来人', raceOpt3: '印度人', raceOpt4: '其他',
    demoHousing: '为了帮助我们更好地了解您的社区，您目前居住的房屋类型是什么？',
    houseOpt1: '组屋 1 至 2 房', houseOpt2: '组屋 3 至 5 房', houseOpt3: '私人房产',
    postalCode: '邮政编码前2位',
    
    btnNext: '下一步', btnPrev: '上一步', btnSubmit: '获取结果', yes: '是', no: '否'
  },
  ta: {
    back: 'பின்செல்',
    title: 'உடல்நலம் மற்றும் சமூக மதிப்பீடு',
    steps: ['உங்கள் உடல்நலம்', 'சவால்கள் & ஆதரவு', 'உங்கள் அனுபவம்', 'உங்களை பற்றி'],
    
    pavsQ1: 'வழக்கமான வாரத்தில் எத்தனை நாட்கள் மிதமான அல்லது கடுமையான உடல் செயல்பாடுகளைச் செய்கிறீர்கள்?',
    pavsQ2: 'அந்த நாட்களில், வழக்கமாக எத்தனை நிமிடங்கள் இந்த செயல்பாட்டைச் செய்கிறீர்கள்?',
    riskQ1: 'உங்கள் தசைகளை வலுப்படுத்தும் செயல்களை வாரத்தில் எத்தனை நாட்கள் செய்கிறீர்கள்?',
    riskQ2: 'உங்களுக்கு கண்டறியப்பட்ட நாள்பட்ட மருத்துவ நிலைமைகளை பட்டியலிடுங்கள் (உதாரணமாக, உயர் இரத்த அழுத்தம், நீரிழிவு):',
    riskQ3: 'உங்கள் உடல் செயல்பாட்டைக் கட்டுப்படுத்த மருத்துவர் அறிவுறுத்தியுள்ளாரா?',
    riskQ4: 'உடற்பயிற்சியின் போது நெஞ்சு வலி போன்ற உடல் அறிகுறிகளை நீங்கள் அனுபவிக்கிறீர்களா?',
    riskQ5: 'உங்கள் சமநிலையை இழக்கும் அளவுக்கு உங்களுக்கு எப்போதாவது தலைசுற்றல் ஏற்படுகிறதா?',
    psychoQ1: 'கடந்த ஒரு மாதத்தில், நீங்கள் அடிக்கடி சோகமாகவோ, மனச்சோர்வாகவோ அல்லது நம்பிக்கையற்றவராகவோ உணர்ந்தீர்களா?',
    
    sdohIntro: 'ஆரோக்கியமாக இருப்பதை உங்களுக்கு கடினமாக்குவது எது என்பதை நாங்கள் புரிந்து கொள்ள விரும்புகிறோம்.',
    sdohFood: 'கடந்த 12 மாதங்களில், போதுமான உணவு வாங்க முடியாததால் நீங்கள் எப்போதாவது பசியுடன் இருந்தீர்களா?',
    sdohFinance: 'உங்கள் மாதாந்திர செலவுகளை ஈடுகட்ட போதுமான வருமானம் இருப்பதாக நீங்கள் நினைக்கிறீர்களா?',
    finOpt1: 'போதுமானதை விட அதிகம்', finOpt2: 'போதுமானது', finOpt3: 'போதாது (சில அல்லது அதிக சிரமம்)',
    sdohSocial: 'மாதத்திற்கு ஒரு முறையாவது நீங்கள் எத்தனை உறவினர்கள் அல்லது நண்பர்களை பார்க்கிறீர்கள் அல்லது பேசுகிறீர்கள்?',
    socOpt1: 'யாரும் இல்லை', socOpt2: '1 முதல் 4 பேர்', socOpt3: '5 முதல் 8 பேர்', socOpt4: '9 அல்லது அதற்கு மேற்பட்டவர்கள்',
    
    survAware: 'உங்கள் அருகில் கிடைக்கும் சுகாதார சேவைகளைப் பற்றி கேள்விப்பட்டிருக்கிறீர்களா?',
    survReferred: 'சமூக சுகாதார நிலையத்திற்கு செல்ல மருத்துவர் பரிந்துரைத்திருக்கிறாரா?',
    survRate: 'மருத்துவமனையுடன் ஒப்பிடும்போது சமூக சேவைகளின் கவனிப்பு எப்படி இருந்தது?',
    rateOpt1: 'மருத்துவமனையை விட சிறந்தது', rateOpt2: 'சுமார் அதே', rateOpt3: 'மேம்பாடு தேவை', rateOpt4: 'பொருந்தாது',
    survTrust: 'சமூகத்தில் கவனிப்பைப் பெறுவது எவ்வளவு வசதியாகவும் பாதுகாப்பாகவும் உணர்கிறீர்கள்? (1 = இல்லவே இல்லை, 5 = மிகவும் பாதுகாப்பானது)',
    barriersIntro: 'சமூக சுகாதார சேவைகளைப் பயன்படுத்துவதை உங்களுக்கு எது கடினமாக்குகிறது? (பொருந்தும் அனைத்தையும் தேர்ந்தெடுக்கவும்)',
    barrFin: 'செலவு', barrLog: 'வெகு தொலைவு அல்லது போக்குவரத்து', barrTime: 'நேரமின்மை', barrSoc: 'கவனிப்பு கடமைகள்', barrLang: 'மொழி தடைகள்', barrHosp: 'மருத்துவமனையை விரும்புகிறேன்', barrNone: 'தடைகள் இல்லை',
    survImprove: 'சுகாதார சேவையில் ஒன்றை மாற்ற முடிந்தால், அது என்னவாக இருக்கும்?',
    
    demoIntro: 'இறுதியாக, உங்களைப் பற்றி கொஞ்சம் சொல்லுங்கள்.',
    demoAge: 'வயது குழு',
    ageOpt1: '21க்கு கீழ்', ageOpt2: '21-40', ageOpt3: '41-60', ageOpt4: '60+',
    demoGender: 'பாலினம்',
    genOpt1: 'ஆண்', genOpt2: 'பெண்',
    demoRace: 'இனம்',
    raceOpt1: 'சீனர்கள்', raceOpt2: 'மலாய்', raceOpt3: 'இந்தியர்', raceOpt4: 'மற்றவர்கள்',
    demoHousing: 'உங்கள் சமூகத்தை நாங்கள் நன்கு புரிந்து கொள்ள, நீங்கள் தற்போது எந்த வகையான வீட்டில் வசிக்கிறீர்கள்?',
    houseOpt1: 'HDB 1 முதல் 2 அறைகள்', houseOpt2: 'HDB 3 முதல் 5 அறைகள்', houseOpt3: 'தனியார் சொத்து',
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
    pavsDays: '', pavsMinutes: '', strengthDays: '', medConditions: '', medFlag: false, symptomsCount: '', symptomFlag: false, psychoFlag: false,
    sdohFood: '', sdohFinance: '', sdohSocial: '',
    aware: '', referred: '', rating: '', trust: '3', barriers: [], improve: '',
    age: '', gender: '', race: '', housing: '', postalCode: ''
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
      medConditions: formData.medConditions,
      medFlag: formData.medFlag,
      symptomsCount: Number(formData.symptomsCount) || 0,
      symptomFlag: formData.symptomFlag,
      psychoFlag: formData.psychoFlag,
      sdohFinancial: formData.sdohFinance === t.finOpt3,
      sdohLogistical: formData.barriers.includes(t.barrLog),
      sdohSocial: formData.sdohSocial === t.socOpt1 || formData.barriers.includes(t.barrSoc)
    };

    const score = calculateRiskScore(clinicalData);
    const postalSector = formData.postalCode || '00';

    const masterPayload = {
        sessionId: sessionId,
        action: 'unified_assessment_complete',
        language: lang,
        score: score,
        clinical: clinicalData,
        sdoh: {
            foodInsecurity: formData.sdohFood,
            incomeAdequacy: formData.sdohFinance,
            socialNetwork: formData.sdohSocial
        },
        perception: {
            aware: formData.aware, referred: formData.referred, rating: formData.rating,
            trust: formData.trust, barriers: formData.barriers, improve: formData.improve
        },
        demographics: {
            age: formData.age, gender: formData.gender, race: formData.race, housing: formData.housing, sector: postalSector
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
                    <input type="number" min="0" max="7" value={formData.pavsDays} onChange={e => setFormData({...formData, pavsDays: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm md:text-base font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.pavsQ2}</label>
                    <input type="number" min="0" value={formData.pavsMinutes} onChange={e => setFormData({...formData, pavsMinutes: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm md:text-base font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.riskQ1}</label>
                    <input type="number" min="0" max="7" value={formData.strengthDays} onChange={e => setFormData({...formData, strengthDays: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm md:text-base font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.riskQ2}</label>
                    <input type="text" placeholder="..." value={formData.medConditions} onChange={e => setFormData({...formData, medConditions: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm md:text-base font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
            </div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t.riskQ3}</label>
                <div className="flex space-x-6 shrink-0">
                    <label className="flex items-center cursor-pointer group"><input type="radio" checked={formData.medFlag === true} onChange={() => setFormData({...formData, medFlag: true})} className="w-4 h-4 text-indigo-500 focus:ring-indigo-500" /><span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400">{t.yes}</span></label>
                    <label className="flex items-center cursor-pointer group"><input type="radio" checked={formData.medFlag === false} onChange={() => setFormData({...formData, medFlag: false})} className="w-4 h-4 text-indigo-500 focus:ring-indigo-500" /><span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400">{t.no}</span></label>
                </div>
            </div>
            <div className="grid md:grid-cols-2 gap-6 items-end">
                <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.riskQ4}</label>
                    <input type="number" min="0" value={formData.symptomsCount} onChange={e => setFormData({...formData, symptomsCount: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm md:text-base font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="flex flex-col justify-between gap-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t.riskQ5}</label>
                    <div className="flex space-x-6 shrink-0">
                        <label className="flex items-center cursor-pointer group"><input type="radio" checked={formData.symptomFlag === true} onChange={() => setFormData({...formData, symptomFlag: true})} className="w-4 h-4 text-indigo-500 focus:ring-indigo-500" /><span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400">{t.yes}</span></label>
                        <label className="flex items-center cursor-pointer group"><input type="radio" checked={formData.symptomFlag === false} onChange={() => setFormData({...formData, symptomFlag: false})} className="w-4 h-4 text-indigo-500 focus:ring-indigo-500" /><span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400">{t.no}</span></label>
                    </div>
                </div>
            </div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800">
                <label className="text-sm font-bold text-indigo-900 dark:text-indigo-200">{t.psychoQ1}</label>
                <div className="flex space-x-6 shrink-0">
                    <label className="flex items-center cursor-pointer group"><input type="radio" checked={formData.psychoFlag === true} onChange={() => setFormData({...formData, psychoFlag: true})} className="w-4 h-4 text-indigo-500 focus:ring-indigo-500" /><span className="ml-2 text-sm font-bold text-indigo-800 dark:text-indigo-300">{t.yes}</span></label>
                    <label className="flex items-center cursor-pointer group"><input type="radio" checked={formData.psychoFlag === false} onChange={() => setFormData({...formData, psychoFlag: false})} className="w-4 h-4 text-indigo-500 focus:ring-indigo-500" /><span className="ml-2 text-sm font-bold text-indigo-800 dark:text-indigo-300">{t.no}</span></label>
                </div>
            </div>
        </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-xl">
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400">{t.sdohIntro}</p>
        </div>
        <div className="grid gap-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300 w-full md:w-2/3">{t.sdohFood}</label>
                <div className="flex space-x-6 shrink-0">
                    <label className="flex items-center cursor-pointer group"><input type="radio" checked={formData.sdohFood === 'Yes'} onChange={() => setFormData({...formData, sdohFood: 'Yes'})} className="w-4 h-4 text-amber-500 focus:ring-amber-500" /><span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400">{t.yes}</span></label>
                    <label className="flex items-center cursor-pointer group"><input type="radio" checked={formData.sdohFood === 'No'} onChange={() => setFormData({...formData, sdohFood: 'No'})} className="w-4 h-4 text-amber-500 focus:ring-amber-500" /><span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400">{t.no}</span></label>
                </div>
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.sdohFinance}</label>
                <select value={formData.sdohFinance} onChange={e => setFormData({...formData, sdohFinance: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm md:text-base font-bold outline-none focus:ring-2 focus:ring-amber-500">
                    <option value="">--</option>
                    <option value={t.finOpt1}>{t.finOpt1}</option>
                    <option value={t.finOpt2}>{t.finOpt2}</option>
                    <option value={t.finOpt3}>{t.finOpt3}</option>
                </select>
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.sdohSocial}</label>
                <select value={formData.sdohSocial} onChange={e => setFormData({...formData, sdohSocial: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm md:text-base font-bold outline-none focus:ring-2 focus:ring-amber-500">
                    <option value="">--</option>
                    <option value={t.socOpt1}>{t.socOpt1}</option>
                    <option value={t.socOpt2}>{t.socOpt2}</option>
                    <option value={t.socOpt3}>{t.socOpt3}</option>
                    <option value={t.socOpt4}>{t.socOpt4}</option>
                </select>
            </div>
        </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="grid gap-6">
            {['aware', 'referred'].map(field => (
                <div key={field} className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 w-full md:w-2/3">{field === 'aware' ? t.survAware : t.survReferred}</label>
                    <div className="flex space-x-6 shrink-0">
                        <label className="flex items-center cursor-pointer group"><input type="radio" checked={formData[field] === 'Yes'} onChange={() => setFormData({...formData, [field]: 'Yes'})} className="w-4 h-4 text-emerald-500 focus:ring-emerald-500" /><span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400">{t.yes}</span></label>
                        <label className="flex items-center cursor-pointer group"><input type="radio" checked={formData[field] === 'No'} onChange={() => setFormData({...formData, [field]: 'No'})} className="w-4 h-4 text-emerald-500 focus:ring-emerald-500" /><span className="ml-2 text-sm font-bold text-slate-600 dark:text-slate-400">{t.no}</span></label>
                    </div>
                </div>
            ))}
            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.survRate}</label>
                <select value={formData.rating} onChange={e => setFormData({...formData, rating: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm md:text-base font-bold outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="">--</option>
                    <option value={t.rateOpt1}>{t.rateOpt1}</option>
                    <option value={t.rateOpt2}>{t.rateOpt2}</option>
                    <option value={t.rateOpt3}>{t.rateOpt3}</option>
                    <option value={t.rateOpt4}>{t.rateOpt4}</option>
                </select>
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.survTrust}</label>
                <div className="flex gap-2">
                    {[1,2,3,4,5].map(num => (
                        <button key={num} type="button" onClick={() => setFormData({...formData, trust: String(num)})} className={`flex-1 py-3 rounded-xl font-black text-lg transition-colors border ${formData.trust === String(num) ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-slate-50 dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-700 hover:border-emerald-300'}`}>{num}</button>
                    ))}
                </div>
            </div>
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
                <textarea rows={3} value={formData.improve} onChange={e => setFormData({...formData, improve: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm md:text-base font-medium outline-none focus:ring-2 focus:ring-emerald-500" placeholder="..."></textarea>
            </div>
        </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="p-4 bg-purple-50 dark:bg-purple-500/10 border border-purple-100 dark:border-purple-500/20 rounded-xl">
            <p className="text-sm font-bold text-purple-700 dark:text-purple-400">{t.demoIntro}</p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.demoHousing}</label>
                <select value={formData.housing} onChange={e => setFormData({...formData, housing: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm md:text-base font-bold outline-none focus:ring-2 focus:ring-purple-500">
                    <option value="">--</option>
                    <option value={t.houseOpt1}>{t.houseOpt1}</option>
                    <option value={t.houseOpt2}>{t.houseOpt2}</option>
                    <option value={t.houseOpt3}>{t.houseOpt3}</option>
                </select>
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.demoAge}</label>
                <select value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm md:text-base font-bold outline-none focus:ring-2 focus:ring-purple-500">
                    <option value="">--</option>
                    <option value={t.ageOpt1}>{t.ageOpt1}</option>
                    <option value={t.ageOpt2}>{t.ageOpt2}</option>
                    <option value={t.ageOpt3}>{t.ageOpt3}</option>
                    <option value={t.ageOpt4}>{t.ageOpt4}</option>
                </select>
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.demoGender}</label>
                <select value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm md:text-base font-bold outline-none focus:ring-2 focus:ring-purple-500">
                    <option value="">--</option>
                    <option value={t.genOpt1}>{t.genOpt1}</option>
                    <option value={t.genOpt2}>{t.genOpt2}</option>
                </select>
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.demoRace}</label>
                <select value={formData.race} onChange={e => setFormData({...formData, race: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm md:text-base font-bold outline-none focus:ring-2 focus:ring-purple-500">
                    <option value="">--</option>
                    <option value={t.raceOpt1}>{t.raceOpt1}</option>
                    <option value={t.raceOpt2}>{t.raceOpt2}</option>
                    <option value={t.raceOpt3}>{t.raceOpt3}</option>
                    <option value={t.raceOpt4}>{t.raceOpt4}</option>
                </select>
            </div>
            <div className="md:col-span-2">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.postalCode}</label>
                <input type="text" maxLength={2} placeholder="e.g. 73" value={formData.postalCode} onChange={e => setFormData({...formData, postalCode: e.target.value.replace(/\D/g, '')})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm md:text-base font-bold outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
        </div>
    </div>
  );

  const icons = [<Activity size={20}/>, <AlertCircle size={20}/>, <MessageSquare size={20}/>, <User size={20}/>];
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