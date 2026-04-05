import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { recordTelemetry } from '../utils/telemetry';
import { calculateRiskScore } from '../utils/scoring';
import { ChevronLeft, Send, Sparkles } from 'lucide-react';

const DICTIONARY = {
  en: {
    back: 'Back',
    typing: 'AURA is typing...',
    inputPlaceholder: 'Type your message...',
    hintText: 'Type freely or select an example:',
    conclusion: ' I have mapped your profile and will now generate your secure clinical report.',
    error: 'There was a secure connection error while saving your profile. Please try again.',
    prompts: [
      /* 0 */ "Hi! I'm AURA. Let's find the right community resources for you. Roughly how many days a week do you do aerobic exercise, and for how long each time?",
      /* 1 */ "Do you do any muscle-strengthening activities? (e.g., weights, resistance bands, or bodyweight exercises)",
      /* 2 */ "Do you have any chronic conditions (like high blood pressure) or experience chest pain or dizziness when active?",
      /* 3 */ "What is the main thing stopping you from using community health services? (e.g. cost, distance, lack of time)",
      /* 4 */ "Almost done! Could you share your age group and gender? (e.g. Male, 41-60)",
      /* 5 */ "What are the first 2 digits of your postal code so I can find services near you?",
      /* 6 */ "One final thing! Do you have a previous NEXUS Assessment ID? If yes, paste it below. If not, select 'No'."
    ],
    reflections: [
      (input) => {
        const match = input.match(/\d+/);
        const days = match ? parseInt(match[0], 10) : null;
        return days === 0 
          ? "It can be really tough to find the time or energy to start. Let's build something manageable." 
          : "That's a great baseline. Any movement is a step in the right direction.";
      },
      (input) => "Got it. Tracking strength is just as important as cardio.",
      (input) => "Thank you for sharing that. Safety is our top priority.",
      (input) => "That is a very real challenge. Identifying these hurdles helps us find better workarounds.",
      (input) => "Noted, thank you.",
      (input) => "Perfect, mapping your location now.",
      (input) => /(no|none|don't)/i.test(input) 
        ? "No problem, we will start a fresh record today." 
        : "Great, I will link your previous records to track your progress."
    ],
    quickReplies: [
      ["0 days", "1-2 days, 30 mins", "3-4 days, 45 mins", "5+ days, 60 mins"],
      ["No strength training", "1 day a week", "2+ days a week"],
      ["No medical conditions", "High blood pressure", "Occasional dizziness", "Chest pain"],
      ["Lack of time", "Too expensive", "Too far away", "Prefer hospitals", "No barriers"],
      ["Male, 21-40", "Female, 21-40", "Male, 41-60", "Female, 41-60", "60+"],
      ["Sector 73", "Sector 54", "Sector 18", "Not sure"],
      ["No previous ID"]
    ]
  },
  ms: {
    back: 'Kembali',
    typing: 'AURA sedang menaip...',
    inputPlaceholder: 'Taip mesej anda...',
    hintText: 'Taip secara bebas atau pilih contoh:',
    conclusion: ' Saya telah memetakan profil anda dan kini akan menjana laporan klinikal anda.',
    error: 'Terdapat ralat sambungan. Sila cuba lagi.',
    prompts: [
      "Hai! Saya AURA. Agak-agak berapa hari seminggu anda bersenam aerobik, dan berapa lama setiap sesi?",
      "Adakah anda melakukan aktiviti menguatkan otot? (cth: angkat berat atau senaman berat badan)",
      "Ada sebarang penyakit kronik (macam darah tinggi) atau rasa sakit dada/pening bila aktif?",
      "Apa yang paling menghalang anda daripada guna servis komuniti ni? (cth: kos, jauh, takde masa)",
      "Hampir siap! Boleh kongsi kumpulan umur dan jantina anda? (cth: Lelaki, 41-60)",
      "Apakah 2 digit pertama poskod anda supaya saya boleh cari servis berdekatan?",
      "Adakah anda mempunyai ID Penilaian NEXUS yang lepas? Jika ya, sila masukkan di bawah. Jika tiada, pilih 'Tiada'."
    ],
    reflections: [
      (input) => {
        const match = input.match(/\d+/);
        const days = match ? parseInt(match[0], 10) : null;
        return days === 0 ? "Memang susah nak mula. Kita cuba cari jalan yang paling sesuai." : "Permulaan yang bagus.";
      },
      (input) => "Faham. Kekuatan otot juga sangat penting.",
      (input) => "Terima kasih kerana sudi kongsi. Keselamatan anda adalah keutamaan kami.",
      (input) => "Itu memang cabaran yang nyata. Mengetahui hal ini bantu kami cari jalan penyelesaian.",
      (input) => "Faham. Terima kasih.",
      (input) => "Sempurna, memetakan lokasi anda sekarang.",
      (input) => /(tidak|tiada|no)/i.test(input) ? "Tak apa, kita mula rekod baharu hari ini." : "Bagus, saya akan hubungkan rekod lama anda."
    ],
    quickReplies: [
      ["0 hari", "1-2 hari, 30 minit", "3-4 hari, 45 minit", "5+ hari, 60 minit"],
      ["Tiada senaman otot", "1 hari seminggu", "2+ hari seminggu"],
      ["Tiada penyakit", "Darah tinggi", "Kadang-kadang pening", "Sakit dada"],
      ["Takde masa", "Terlalu mahal", "Terlalu jauh", "Lebih suka hospital", "Tiada halangan"],
      ["Lelaki, 21-40", "Perempuan, 21-40", "Lelaki, 41-60", "Perempuan, 41-60", "60+"],
      ["Sektor 73", "Sektor 54", "Sektor 18", "Tidak pasti"],
      ["Tiada ID lepas"]
    ]
  },
  zh: {
    back: '返回',
    typing: 'AURA 正在输入...',
    inputPlaceholder: '输入您的消息...',
    hintText: '自由输入，或选择一个示例：',
    conclusion: ' 我已经记录了您的个人资料，现在将为您生成临床报告。',
    error: '发生连接错误。请重试。',
    prompts: [
      "你好！我是 AURA。你通常每个星期做几天有氧运动？每次大概多久？",
      "你有做一些强化肌肉的运动吗？（例如：举重或自身体重训练）",
      "您有没有慢性病（比如高血压），或者在活动时觉得胸痛或头晕？",
      "最主要是什么原因阻止你使用社区服务呢？（比如：费用、距离、没时间）",
      "快完成了！能分享一下您的年龄段和性别吗？（例如：男，41-60）",
      "您的邮政编码前两位数是多少，以便我查找您附近的资源？",
      "最后一步！您有之前的 NEXUS 评估 ID 吗？如果有，请在下面输入。如果没有，请选择'没有'。"
    ],
    reflections: [
      (input) => {
        const match = input.match(/\d+/);
        const days = match ? parseInt(match[0], 10) : null;
        return days === 0 ? "万事开头难。让我们看看如何制定一个轻松的计划。" : "很好的开始。";
      },
      (input) => "明白了。记录力量训练也很重要。",
      (input) => "谢谢您的分享。安全是我们的首要任务。",
      (input) => "这是一个很现实的挑战。了解这些能帮我们找到更好的解决办法。",
      (input) => "明白，谢谢您。",
      (input) => "完美，现在正在定位您的位置。",
      (input) => /(没|无|不|no)/i.test(input) ? "没问题，我们今天建立一个新的记录。" : "太好了，我将链接您的历史记录。"
    ],
    quickReplies: [
      ["0 天", "1-2天, 30分钟", "3-4天, 45分钟", "5天以上, 60分钟"],
      ["没有力量训练", "每周 1 天", "每周 2 天以上"],
      ["没有疾病", "高血压", "偶尔头晕", "胸痛"],
      ["没时间", "太贵了", "太远了", "更喜欢去医院", "没有障碍"],
      ["男, 21-40", "女, 21-40", "男, 41-60", "女, 41-60", "60岁以上"],
      ["邮区 73", "邮区 54", "邮区 18", "不确定"],
      ["没有之前的 ID"]
    ]
  },
  ta: {
    back: 'பின்செல்',
    typing: 'AURA தட்டச்சு செய்கிறார்...',
    inputPlaceholder: 'உங்கள் செய்தியை உள்ளிடவும்...',
    hintText: 'சுயமாக தட்டச்சு செய்யவும் அல்லது உதாரணத்தைத் தேர்ந்தெடுக்கவும்:',
    conclusion: ' நான் உங்கள் சுயவிவரத்தை வரைபடமாக்கியுள்ளேன், இப்போது உங்கள் மருத்துவ அறிக்கையை உருவாக்குவேன்.',
    error: 'தொடர்பு பிழை ஏற்பட்டது. தயவுசெய்து மீண்டும் முயற்சிக்கவும்.',
    prompts: [
      "வணக்கம்! நான் AURA. வாரத்திற்கு எத்தனை நாட்கள் ஏரோபிக் உடற்பயிற்சி செய்கிறீர்கள், ஒவ்வொரு முறையும் எவ்வளவு நேரம்?",
      "நீங்கள் தசை வலுப்படுத்தும் பயிற்சிகளைச் செய்கிறீர்களா? (எ.கா. எடை தூக்குதல்)",
      "உங்களுக்கு நாள்பட்ட நோய்கள் (உயர் ரத்த அழுத்தம்) உள்ளதா, அல்லது சுறுசுறுப்பாக இருக்கும்போது நெஞ்சு வலி/தலைச்சுற்றல் வருமா?",
      "சமூக சேவைகளைப் பயன்படுத்துவதை எது தடுக்கிறது? (எ.கா. செலவு, தூரம், நேரமின்மை)",
      "கிட்டத்தட்ட முடிந்துவிட்டது! உங்கள் வயது மற்றும் பாலினத்தைப் பகிர முடியுமா? (எ.கா. ஆண், 41-60)",
      "உங்களுக்கு அருகிலுள்ள சேவைகளைக் கண்டறிய உங்கள் அஞ்சல் குறியீட்டின் முதல் 2 இலக்கங்கள் என்ன?",
      "இறுதியாக! உங்களிடம் முந்தைய NEXUS மதிப்பீட்டு ஐடி உள்ளதா? இருந்தால், அதை கீழே உள்ளிடவும். இல்லையெனில், 'இல்லை' என்பதைத் தேர்ந்தெடுக்கவும்."
    ],
    reflections: [
      (input) => {
        const match = input.match(/\d+/);
        const days = match ? parseInt(match[0], 10) : null;
        return days === 0 ? "தொடங்குவது கடினமாக இருக்கலாம். எளிதான வழியைக் கண்டுபிடிப்போம்." : "இது ஒரு சிறந்த தொடக்கம்.";
      },
      (input) => "புரிந்தது. வலிமைப் பயிற்சியைக் கண்காணிப்பது முக்கியம்.",
      (input) => "பகிர்ந்ததற்கு நன்றி. பாதுகாப்பு எங்கள் முதன்மை முன்னுரிமை.",
      (input) => "இது உண்மையான சவால். இதை அறிவது சிறந்த தீர்வுகளைக் கண்டறிய உதவுகிறது.",
      (input) => "புரிந்தது, நன்றி.",
      (input) => "சரியானது, உங்கள் இருப்பிடத்தை வரைபடமாக்குகிறது.",
      (input) => /(இல்லை|no)/i.test(input) ? "பரவாயில்லை, இன்று புதிய பதிவை தொடங்குவோம்." : "நன்று, உங்கள் முந்தைய பதிவுகளை இணைக்கிறேன்."
    ],
    quickReplies: [
      ["0 நாட்கள்", "1-2 நாட்கள், 30 நிமிடம்", "3-4 நாட்கள், 45 நிமிடம்", "5+ நாட்கள், 60 நிமிடம்"],
      ["தசை பயிற்சி இல்லை", "வாரத்தில் 1 நாள்", "வாரத்தில் 2+ நாட்கள்"],
      ["மருத்துவ நிலைமைகள் இல்லை", "உயர் இரத்த அழுத்தம்", "தலைச்சுற்றல்", "நெஞ்சு வலி"],
      ["நேரமின்மை", "அதிக செலவு", "மிகவும் தூரம்", "மருத்துவமனைகளை விரும்புகிறேன்", "தடைகள் இல்லை"],
      ["ஆண், 21-40", "பெண், 21-40", "ஆண், 41-60", "பெண், 41-60", "60+"],
      ["பிரிவு 73", "பிரிவு 54", "பிரிவு 18", "தெரியாது"],
      ["முந்தைய ஐடி இல்லை"]
    ]
  }
};
  
  const [isDark, setIsDark] = useState(false);

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

  const AuraChatbot = () => {
  const navigate = useNavigate();
  const chatEndRef = useRef(null);
  
  const [lang] = useState(() => localStorage.getItem('nexus_language') || 'en');
  const langData = DICTIONARY[lang] || DICTIONARY['en'];
  const [sessionId] = useState(() => 'NX-' + Math.random().toString(36).substr(2, 9).toUpperCase());
  
  const [currentStep, setCurrentStep] = useState(0);
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [collectedData, setCollectedData] = useState({});

  useEffect(() => {
    if (messages.length === 0) {
      appendBotMessage(langData.prompts[0]);
    }
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const appendBotMessage = (text) => {
    setIsTyping(true);
    setTimeout(() => {
      setMessages(prev => [...prev, { sender: 'bot', text }]);
      setIsTyping(false);
    }, 800);
  };

  // Upgraded Granular NLP Parser
  const parseClinicalData = (rawTextData) => {
    const aerobicStr = (rawTextData.aerobic || '').toLowerCase();
    const strengthStr = (rawTextData.strength || '').toLowerCase();
    const medicalStr = (rawTextData.medical || '').toLowerCase();
    const barrStr = (rawTextData.barriers || '').toLowerCase();
    const demoStr = (rawTextData.demographics || '').toLowerCase();
    const locStr = (rawTextData.postal_code || '');
    const prevIdStr = (rawTextData.previous_id || '');

    const minMatch = aerobicStr.match(/(\d+)\s*(min|分钟|நிமிடம்)/);
    const pavsMinutes = minMatch ? parseInt(minMatch[1], 10) : 0;
    const daysMatch = aerobicStr.match(/(\d+)\s*(day|hari|天|நாட்கள்)/);
    const pavsDays = daysMatch ? parseInt(daysMatch[1], 10) : 0;

    const strDaysMatch = strengthStr.match(/(\d+)/);
    const strengthDays = strDaysMatch ? parseInt(strDaysMatch[1], 10) : 0;

    const symptomFlag = /(dizziness|chest|pening|dada|头晕|胸痛|தலைச்சுற்றல்|நெஞ்சு வலி)/.test(medicalStr);
    const medFlag = /(blood pressure|darah tinggi|高血压|உயர் இரத்த அழுத்தம்)/.test(medicalStr);

    const sdohFinancial = /(cost|expensive|mahal|kos|贵|செலவு)/.test(barrStr);
    const sdohSocial = /(caregiving|menjaga|照顾|கவனிப்பு)/.test(barrStr);

    let gender = 'Unknown';
    if (/(female|perempuan|女|பெண்)/.test(demoStr)) gender = 'Female';
    else if (/(male|lelaki|男|ஆண்)/.test(demoStr)) gender = 'Male';

    let age = 'Unknown';
    if (demoStr.includes('41-60')) age = '41-60';
    else if (demoStr.includes('60+')) age = '60+';

    const sectorMatch = locStr.match(/\d{2}/);
    const postalSector = sectorMatch ? sectorMatch[0] : '00';

    const isNoId = /(no|none|tidak|tiada|没|无|不|இல்லை)/i.test(prevIdStr);
    const previousId = isNoId || prevIdStr.trim() === '' ? null : prevIdStr.trim().toUpperCase();

    return {
        pavsMinutes, pavsDays, strengthDays, symptomFlag, medFlag, psychoFlag: false,
        sdohFinancial, sdohSocial, gender, age, postalSector, previousId
    };
  };

    const handleUserSubmission = (text) => {
    if (!text.trim()) return;

    setMessages(prev => [...prev, { sender: 'user', text }]);
    setUserInput('');

    // Granular 7-step mapping
    const stepKeys = ['aerobic', 'strength', 'medical', 'barriers', 'demographics', 'postal_code', 'previous_id'];
    const currentKey = stepKeys[currentStep];
    const updatedData = { ...collectedData, [currentKey]: text };
    setCollectedData(updatedData);

    setIsTyping(true);
    
    setTimeout(() => {
      let combinedBotResponse = "";

      // Append Reflection (if it exists)
      if (currentStep < langData.reflections.length) {
        combinedBotResponse += langData.reflections[currentStep](text) + " ";
      }

      const nextStep = currentStep + 1;
      
      if (nextStep < langData.prompts.length) {
        // Concatenate Prompt to Reflection for a single chat bubble
        combinedBotResponse += langData.prompts[nextStep];
        setCurrentStep(nextStep);
        setMessages(prev => [...prev, { sender: 'bot', text: combinedBotResponse }]);
        setIsTyping(false);
      } else {
        // Conclude the Triage
        combinedBotResponse += langData.conclusion;
        setMessages(prev => [...prev, { sender: 'bot', text: combinedBotResponse }]);
        setIsTyping(false);
        concludeTriage(updatedData);
      }
    }, 1000); // 1s processing delay to feel natural
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    handleUserSubmission(userInput);
  };

  const concludeTriage = async (finalData) => {
    const parsedClinicalData = parseClinicalData(finalData);
    const riskScore = calculateRiskScore(parsedClinicalData);
    
    try {
      await recordTelemetry(parsedClinicalData.postalSector, {
        event: 'aura_triage_complete',
        sessionId: sessionId,
        previousSessionId: parsedClinicalData.previousId,
        payload: parsedClinicalData,
        computedRisk: riskScore
      });

      // Navigate after a delay to let the user read the final message
      setTimeout(() => {
          navigate('/individuals/result', { 
              state: { 
                  score: riskScore, 
                  data: parsedClinicalData, 
                  postalSector: parsedClinicalData.postalSector,
                  sessionId: sessionId,
                  previousSessionId: parsedClinicalData.previousId
              } 
          });
      }, 1500); 
      
    } catch (error) {
      setTimeout(() => {
        setMessages(prev => [...prev, { sender: 'bot', text: langData.error }]);
      }, 1000);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-slate-50 dark:bg-slate-950 font-sans transition-colors duration-500">
      
    <header className="flex items-center justify-between p-4 bg-white dark:bg-[#111827] shadow-sm border-b border-slate-200 dark:border-slate-800 transition-colors duration-500">
        <div className="flex items-center">
            <button onClick={() => navigate(-1)} className="p-2 mr-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
              <ChevronLeft size={24} />
            </button>
            <div className="flex items-center gap-2">
              <Sparkles className="text-indigo-500 dark:text-indigo-400" size={20} />
              <h1 className="font-semibold text-lg text-slate-900 dark:text-white">AURA</h1>
            </div>
        </div>
        
        {/* NEW TOP-RIGHT TOGGLE */}
        <button 
            onClick={toggleTheme} 
            className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 shadow-sm hover:scale-105 active:scale-95 transition-all"
        >
            {isDark ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} />}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3 rounded-2xl shadow-sm ${
              msg.sender === 'user' 
                ? 'bg-indigo-600 dark:bg-indigo-500 text-white rounded-br-none' 
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-none'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-sm px-4 py-2 rounded-2xl rounded-bl-none animate-pulse">
              {langData.typing}
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-4 bg-white dark:bg-[#111827] border-t border-slate-200 dark:border-slate-800 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] transition-colors duration-500">
        
        {!isTyping && currentStep < langData.quickReplies.length && (
          <div className="mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 px-1">
              {langData.hintText}
            </p>
            <div className="flex flex-wrap gap-2">
              {langData.quickReplies[currentStep].map((reply, idx) => (
                <button
                  key={idx}
                  onClick={() => handleUserSubmission(reply)}
                  className="px-3 py-1.5 text-sm bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors text-left"
                >
                  {reply}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder={langData.inputPlaceholder}
            className="flex-1 p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-full focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-shadow placeholder-slate-400 dark:placeholder-slate-500"
            disabled={isTyping}
          />
          <button 
            type="submit"
            disabled={!userInput.trim() || isTyping}
            className="p-3 bg-indigo-600 dark:bg-indigo-500 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors shadow-sm"
          >
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default AuraChatbot;
