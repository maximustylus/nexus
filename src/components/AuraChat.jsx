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
    conclusion: 'Thank you for exploring this with me. I have mapped your profile and will now align you with the safest community programmes.',
    error: 'There was a secure connection error while saving your profile. Please try again.',
    prompts: [
      "Hi! I'm AURA. To help find the right community resources for you, let's have a quick chat. Roughly how many days a week do you exercise, and for how long each time?",
      "Do you do any muscle-strengthening activities? Also, do you have any chronic conditions (like high blood pressure) or experience chest pain or dizziness when active?",
      "Switching gears: have you heard of the health services in your neighbourhood? If you've used them, how would you rate them compared to a hospital, and how much do you trust them (1 to 5)?",
      "What is the main thing stopping you from using community services? (e.g. cost, distance, no time). What could we improve?",
      "Almost done! Could you share your age group and gender? (e.g. Male, 41-60)",
      "Lastly, what are the first 2 digits of your postal code so I can find services near you?"
    ],
    reflections: [
      (input) => {
        const match = input.match(/\d+/);
        const days = match ? parseInt(match[0], 10) : null;
        return days === 0 
          ? "It can be really tough to find the time or energy to start. Let's see how we can build something manageable." 
          : "That's a great baseline. Any movement is a step in the right direction.";
      },
      (input) => "Thank you for sharing that. Safety is our top priority, so keeping track of those factors is vital.",
      (input) => "I hear you. Your comfort and trust in healthcare providers are completely valid.",
      (input) => "That is a very real challenge. Many people face similar hurdles, and identifying them helps us find better workarounds.",
      (input) => "Got it. Thank you."
    ],
    quickReplies: [
      ["0 days", "1-2 days, 30 mins", "3-4 days, 45 mins", "5+ days, 60 mins"],
      ["No strength training", "Yes, 2 days", "High blood pressure", "Occasional dizziness"],
      ["Not aware of them", "Rate: About the same", "Trust: 3/5", "Trust: 5/5"],
      ["Lack of time", "Too far away", "Too expensive", "Prefer hospitals"],
      ["Male, 21-40", "Female, 21-40", "Male, 41-60", "Female, 41-60", "60+"],
      ["Sector 73", "Sector 54", "Sector 18", "Not sure"]
    ]
  },
  ms: {
    back: 'Kembali',
    typing: 'AURA sedang menaip...',
    inputPlaceholder: 'Taip mesej anda...',
    hintText: 'Taip secara bebas atau pilih contoh:',
    conclusion: 'Terima kasih kerana meneroka bersama saya. Saya telah memetakan profil anda dan kini akan menyelaraskan anda dengan program komuniti yang paling selamat.',
    error: 'Terdapat ralat sambungan selamat semasa menyimpan profil anda. Sila cuba lagi.',
    prompts: [
      "Hai! Saya AURA. Jom borak sekejap supaya saya boleh cari sumber komuniti yang ngam untuk anda. Agak-agak berapa hari seminggu anda bersenam, dan berapa lama setiap sesi?",
      "Faham. Ada buat senaman kuatkan otot tak? Lepas tu, ada tak apa-apa penyakit kronik (macam darah tinggi) atau rasa sakit dada atau pening bila aktif?",
      "Terima kasih sudi kongsi. Nak tanya sikit, pernah dengar tak pasal servis kesihatan kat kawasan perumahan anda? Kalau pernah guna, macam mana servis dia berbanding hospital, dan berapa tahap kepercayaan anda (1 hingga 5)?",
      "Faham sangat. Apa yang paling menghalang anda daripada guna servis komuniti ni? (cth kos, jauh, takde masa). Apa yang boleh kami perbaiki?",
      "Hampir siap! Boleh kongsi kumpulan umur dan jantina anda? (cth: Lelaki, 41-60)",
      "Akhir sekali, apakah 2 digit pertama poskod anda supaya saya boleh cari servis berdekatan?"
    ],
    reflections: [
      (input) => {
        const match = input.match(/\d+/);
        const days = match ? parseInt(match[0], 10) : null;
        return days === 0 
          ? "Memang susah nak cari masa atau tenaga untuk mula. Kita cuba cari jalan yang paling sesuai dan mudah untuk anda." 
          : "Permulaan yang bagus. Sebarang pergerakan adalah langkah yang baik.";
      },
      (input) => "Terima kasih kerana sudi kongsi. Keselamatan anda adalah keutamaan kami.",
      (input) => "Saya faham. Keselesaan dan kepercayaan anda memang sangat penting.",
      (input) => "Itu memang cabaran yang nyata. Mengetahui hal ini bantu kami cari jalan penyelesaian.",
      (input) => "Faham. Terima kasih."
    ],
    quickReplies: [
      ["0 hari", "1-2 hari, 30 minit", "3-4 hari, 45 minit", "5+ hari, 60 minit"],
      ["Tiada senaman otot", "Ya, 2 hari", "Darah tinggi", "Kadang-kadang pening"],
      ["Tak tahu", "Kadar: Sama je", "Percaya: 3/5", "Percaya: 5/5"],
      ["Takde masa", "Terlalu jauh", "Terlalu mahal", "Lebih suka hospital"],
      ["Lelaki, 21-40", "Perempuan, 21-40", "Lelaki, 41-60", "Perempuan, 41-60", "60+"],
      ["Sektor 73", "Sektor 54", "Sektor 18", "Tidak pasti"]
    ]
  },
  zh: {
    back: '返回',
    typing: 'AURA 正在输入...',
    inputPlaceholder: '输入您的消息...',
    hintText: '自由输入，或选择一个示例：',
    conclusion: '感谢您与我交流。我已经记录了您的个人资料，现在将为您匹配最安全的社区项目。',
    error: '保存您的个人资料时发生安全连接错误。请重试。',
    prompts: [
      "你好！我是 AURA。为了帮你找到合适的社区资源，我们来简单聊聊吧。你通常每个星期做几天运动？每次大概多久？",
      "明白了。你有做一些强化肌肉的运动吗？另外，有没有慢性病（比如高血压），或者在活动时觉得胸痛或头晕？",
      "谢谢你的分享。换个话题：你有听说过你家附近的社区医疗服务吗？如果用过的话，跟医院比起来你觉得怎么样？你对他们的信任度是多少（1 到 5 分）？",
      "了解。最主要是什么原因阻止你使用社区服务呢？（比如费用、距离、没时间）。我们有什么可以改进的地方？",
      "快完成了！能分享一下您的年龄段和性别吗？（例如：男，41-60）",
      "最后，您的邮政编码前两位数是多少，以便我查找您附近的资源？"
    ],
    reflections: [
      (input) => {
        const match = input.match(/\d+/);
        const days = match ? parseInt(match[0], 10) : null;
        return days === 0 
          ? "万事开头难，找时间或精力运动确实不易。让我们看看如何制定一个轻松的计划。" 
          : "很好的开始。只要动起来就是朝着正确的方向迈进。";
      },
      (input) => "谢谢你的分享。安全是我们的首要任务，了解这些情况非常重要。",
      (input) => "我完全理解。你对医疗服务提供者的信任和舒适感是非常合理的。",
      (input) => "这是一个很现实的挑战。了解这些能帮我们找到更好的解决办法。",
      (input) => "明白，谢谢您。"
    ],
    quickReplies: [
      ["0 天", "1-2天, 30分钟", "3-4天, 45分钟", "5天以上, 60分钟"],
      ["没有力量训练", "有, 每周2天", "高血压", "偶尔头晕"],
      ["不知道", "评价: 差不多", "信任度: 3/5", "信任度: 5/5"],
      ["没时间", "太远了", "太贵了", "更喜欢去医院"],
      ["男, 21-40", "女, 21-40", "男, 41-60", "女, 41-60", "60岁以上"],
      ["邮区 73", "邮区 54", "邮区 18", "不确定"]
    ]
  },
  ta: {
    back: 'பின்செல்',
    typing: 'AURA தட்டச்சு செய்கிறார்...',
    inputPlaceholder: 'உங்கள் செய்தியை உள்ளிடவும்...',
    hintText: 'சுயமாக தட்டச்சு செய்யவும் அல்லது உதாரணத்தைத் தேர்ந்தெடுக்கவும்:',
    conclusion: 'என்னுடன் இதை ஆராய்ந்ததற்கு நன்றி. நான் உங்கள் சுயவிவரத்தை வரைபடமாக்கியுள்ளேன், இப்போது உங்களை பாதுகாப்பான சமூக திட்டங்களுடன் இணைப்பேன்.',
    error: 'உங்கள் சுயவிவரத்தைச் சேமிக்கும் போது பாதுகாப்பான இணைப்பு பிழை ஏற்பட்டது. தயவுசெய்து மீண்டும் முயற்சிக்கவும்.',
    prompts: [
      "வணக்கம்! நான் AURA. உங்களுக்கான சரியான சமூக வளங்களைக் கண்டறிய, சிறிது பேசலாம். வாரத்திற்கு எத்தனை நாட்கள் உடற்பயிற்சி செய்கிறீர்கள், ஒவ்வொரு முறையும் எவ்வளவு நேரம்?",
      "புரிந்தது. தசை வலுப்படுத்தும் பயிற்சிகளைச் செய்கிறீர்களா? மேலும், உங்களுக்கு நாள்பட்ட நோய்கள் உள்ளதா, அல்லது சுறுசுறுப்பாக இருக்கும்போது நெஞ்சு வலி அல்லது தலைச்சுற்றல் வருமா?",
      "பகிர்ந்ததற்கு நன்றி. உங்கள் அருகில் உள்ள சுகாதார சேவைகளைப் பற்றி கேள்விப்பட்டிருக்கிறீர்களா? பயன்படுத்தியிருந்தால், மருத்துவமனையுடன் ஒப்பிடும்போது அதை எப்படி மதிப்பிடுவீர்கள் (1 முதல் 5 வரை)?",
      "சரியான கருத்து. சமூக சேவைகளைப் பயன்படுத்துவதை எது தடுக்கிறது? (எ.கா. செலவு, தூரம், நேரமின்மை). நாங்கள் எதை மேம்படுத்தலாம்?",
      "கிட்டத்தட்ட முடிந்துவிட்டது! உங்கள் வயது மற்றும் பாலினத்தைப் பகிர முடியுமா? (எ.கா. ஆண், 41-60)",
      "இறுதியாக, உங்களுக்கு அருகிலுள்ள சேவைகளைக் கண்டறிய உங்கள் அஞ்சல் குறியீட்டின் முதல் 2 இலக்கங்கள் என்ன?"
    ],
    reflections: [
      (input) => {
        const match = input.match(/\d+/);
        const days = match ? parseInt(match[0], 10) : null;
        return days === 0 
          ? "தொடங்குவதற்கு நேரமோ அல்லது ஆற்றலோ கிடைப்பது கடினமாக இருக்கலாம். உங்களுக்கு ஏற்ற ஒரு வழியை நாங்கள் கண்டுபிடிக்க முயல்வோம்." 
          : "இது ஒரு சிறந்த தொடக்கம். எந்தவொரு உடல் அசைவும் சரியான திசையை நோக்கிய ஒரு படியாகும்.";
      },
      (input) => "பகிர்ந்ததற்கு நன்றி. பாதுகாப்பு எங்கள் முதன்மை முன்னுரிமை.",
      (input) => "எனக்குப் புரிகிறது. சுகாதார வழங்குநர்கள் மீதான உங்கள் நம்பிக்கையும் முற்றிலும் சரியானவை.",
      (input) => "இது மிகவும் உண்மையான சவால். இதை அறிவது சிறந்த தீர்வுகளைக் கண்டறிய உதவுகிறது.",
      (input) => "புரிந்தது, நன்றி."
    ],
    quickReplies: [
      ["0 நாட்கள்", "1-2 நாட்கள், 30 நிமிடம்", "3-4 நாட்கள், 45 நிமிடம்", "5+ நாட்கள், 60 நிமிடம்"],
      ["தசை பயிற்சி இல்லை", "ஆம், 2 நாட்கள்", "உயர் இரத்த அழுத்தம்", "அவ்வப்போது தலைச்சுற்றல்"],
      ["தெரியாது", "மதிப்பீடு: சுமார் அதே", "நம்பிக்கை: 3/5", "நம்பிக்கை: 5/5"],
      ["நேரமின்மை", "மிகவும் தூரம்", "அதிக செலவு", "மருத்துவமனைகளை விரும்புகிறேன்"],
      ["ஆண், 21-40", "பெண், 21-40", "ஆண், 41-60", "பெண், 41-60", "60+"],
      ["பிரிவு 73", "பிரிவு 54", "பிரிவு 18", "தெரியாது"]
    ]
  }
};

const AuraChatbot = () => {
  const navigate = useNavigate();
  const chatEndRef = useRef(null);
  
  const [lang] = useState(() => localStorage.getItem('nexus_language') || 'en');
  const langData = DICTIONARY[lang] || DICTIONARY['en'];
  
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

  // NLP Parser to convert chat strings into structured clinical data
  const parseClinicalData = (rawTextData) => {
    const riskStr = (rawTextData.risk_factors || '').toLowerCase();
    const actStr = (rawTextData.activity_level || '').toLowerCase();
    const barrStr = (rawTextData.barriers || '').toLowerCase();
    const demoStr = (rawTextData.demographics || '').toLowerCase();
    const locStr = (rawTextData.postal_code || '');

    // Extract minutes & days safely
    const minMatch = actStr.match(/(\d+)\s*(min|分钟|நிமிடம்)/);
    const pavsMinutes = minMatch ? parseInt(minMatch[1], 10) : 0;
    const daysMatch = actStr.match(/(\d+)\s*(day|hari|天|நாட்கள்)/);
    const pavsDays = daysMatch ? parseInt(daysMatch[1], 10) : 0;

    // Multilingual clinical flags
    const symptomFlag = /(dizziness|chest|pening|dada|头晕|胸痛|தலைச்சுற்றல்|நெஞ்சு வலி)/.test(riskStr);
    const medFlag = /(blood pressure|darah tinggi|高血压|உயர் இரத்த அழுத்தம்)/.test(riskStr);

    const sdohFinancial = /(cost|expensive|mahal|kos|贵|செலவு)/.test(barrStr);
    const sdohSocial = /(caregiving|menjaga|照顾|கவனிப்பு)/.test(barrStr);

    // Demographics mapping
    let gender = 'Unknown';
    if (/(female|perempuan|女|பெண்)/.test(demoStr)) gender = 'Female';
    else if (/(male|lelaki|男|ஆண்)/.test(demoStr)) gender = 'Male';

    let age = 'Unknown';
    if (demoStr.includes('41-60')) age = '41-60';
    else if (demoStr.includes('60+')) age = '60+';

    const sectorMatch = locStr.match(/\d{2}/);
    const postalSector = sectorMatch ? sectorMatch[0] : '00';

    return {
        pavsMinutes, pavsDays, strengthDays: 0, symptomFlag, medFlag, psychoFlag: false,
        sdohFinancial, sdohSocial, gender, age, postalSector
    };
  };

  const handleUserSubmission = (text) => {
    if (!text.trim()) return;

    setMessages(prev => [...prev, { sender: 'user', text }]);
    setUserInput('');

    // Notice the updated stepKeys array to match the 6 steps
    const stepKeys = ['activity_level', 'risk_factors', 'community_trust', 'barriers', 'demographics', 'postal_code'];
    const currentKey = stepKeys[currentStep];
    const updatedData = { ...collectedData, [currentKey]: text };
    setCollectedData(updatedData);

    setIsTyping(true);
    
    setTimeout(() => {
      // Step A: MI Reflection (if available for this step)
      if (currentStep < langData.reflections.length) {
        const reflectionText = langData.reflections[currentStep](text);
        setMessages(prev => [...prev, { sender: 'bot', text: reflectionText }]);
      }

      // Step B: Next Prompt OR Conclude
      const nextStep = currentStep + 1;
      if (nextStep < langData.prompts.length) {
        setIsTyping(true);
        setTimeout(() => {
          setCurrentStep(nextStep);
          setMessages(prev => [...prev, { sender: 'bot', text: langData.prompts[nextStep] }]);
          setIsTyping(false);
        }, 1200);
      } else {
        concludeTriage(updatedData);
      }
    }, 800);
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    handleUserSubmission(userInput);
  };

  const concludeTriage = async (finalData) => {
    setIsTyping(true);
    
    // Parse the unstructured chat text into a strict clinical JSON object
    const parsedClinicalData = parseClinicalData(finalData);
    const riskScore = calculateRiskScore(parsedClinicalData);
    
    try {
      await recordTelemetry(parsedClinicalData.postalSector, {
        event: 'aura_triage_complete',
        payload: parsedClinicalData,
        computedRisk: riskScore
      });

      setTimeout(() => {
        setMessages(prev => [...prev, { sender: 'bot', text: langData.conclusion }]);
        setIsTyping(false);
        
        // CRITICAL FIX: Navigate to the result page with the parsed state
        setTimeout(() => {
            navigate('/individuals/result', { 
                state: { 
                    score: riskScore, 
                    data: parsedClinicalData, 
                    postalSector: parsedClinicalData.postalSector 
                } 
            });
        }, 1500); // 1.5s delay allows user to read the conclusion message
        
      }, 1000);
      
    } catch (error) {
      setTimeout(() => {
        setMessages(prev => [...prev, { sender: 'bot', text: langData.error }]);
        setIsTyping(false);
      }, 1000);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-slate-50 dark:bg-slate-950 font-sans transition-colors duration-500">
      
      <header className="flex items-center p-4 bg-white dark:bg-[#111827] shadow-sm border-b border-slate-200 dark:border-slate-800 transition-colors duration-500">
        <button onClick={() => navigate(-1)} className="p-2 mr-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
          <ChevronLeft size={24} />
        </button>
        <div className="flex items-center gap-2">
          <Sparkles className="text-indigo-500 dark:text-indigo-400" size={20} />
          <h1 className="font-semibold text-lg text-slate-900 dark:text-white">AURA</h1>
        </div>
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