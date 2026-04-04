import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { recordTelemetry } from '../utils/telemetry';
import { calculateRiskScore } from '../utils/scoring';
import { ChevronLeft, Send, Sparkles, Activity } from 'lucide-react';

const DICTIONARY = {
  en: {
    back: 'Back',
    typing: 'AURA is typing...',
    inputPlaceholder: 'Type your message...',
    prompts: [
      "Hi! I'm AURA. To help find the right community resources for you, let's have a quick chat. Roughly how many days a week do you exercise, and for how long each time?",
      "Got it. Do you do any muscle-strengthening activities? Also, do you have any chronic conditions (like high blood pressure) or experience chest pain/dizziness when active?",
      "Thanks for sharing. Switching gears: have you heard of the health services in your neighbourhood? If you've used them, how would you rate them compared to a hospital, and how much do you trust them (1 to 5)?",
      "Make sense. What’s the main thing stopping you from using community services? (e.g., cost, distance, no time). What could we improve?",
      "Finally, just to make sure my recommendations fit you perfectly, could you share your age group, gender, race, and the first 2 digits of your postal code?"
    ],
    quickReplies: [
      ["0 days", "1-2 days, 30 mins", "3-4 days, 45 mins", "5+ days, 60 mins"],
      ["No strength training", "Yes, 2 days", "High blood pressure", "Occasional dizziness"],
      ["Not aware of them", "Rate: About the same", "Trust: 3/5", "Trust: 5/5"],
      ["Lack of time", "Too far away", "Too expensive", "Prefer hospitals"],
      ["Under 21", "21-40", "41-60", "60+", "Male", "Female", "Sector 73"]
    ]
  },
  ms: {
    back: 'Kembali',
    typing: 'AURA sedang menaip...',
    inputPlaceholder: 'Taip mesej anda...',
    prompts: [
      "Hai! Saya AURA. Jom borak sekejap supaya saya boleh cari sumber komuniti yang ngam untuk anda. Agak-agak berapa hari seminggu anda bersenam, dan berapa lama setiap sesi?",
      "Faham. Ada buat senaman kuatkan otot tak? Lepas tu, ada tak apa-apa penyakit kronik (macam darah tinggi) atau rasa sakit dada/pening bila aktif?",
      "Terima kasih sudi kongsi. Nak tanya sikit, pernah dengar tak pasal servis kesihatan kat kawasan perumahan anda? Kalau pernah guna, macam mana servis dia berbanding hospital, dan berapa tahap kepercayaan anda (1 hingga 5)?",
      "Faham sangat. Apa yang paling menghalang anda daripada guna servis komuniti ni? (cth: kos, jauh, takde masa). Apa yang boleh kami perbaiki?",
      "Akhir sekali, untuk pastikan cadangan saya betul-betul sesuai dengan profil anda, boleh kongsi kumpulan umur, jantina, bangsa, dan 2 digit pertama poskod anda?"
    ],
    quickReplies: [
      ["0 hari", "1-2 hari, 30 minit", "3-4 hari, 45 minit", "5+ hari, 60 minit"],
      ["Tiada senaman otot", "Ya, 2 hari", "Darah tinggi", "Kadang-kadang pening"],
      ["Tak tahu", "Kadar: Sama je", "Percaya: 3/5", "Percaya: 5/5"],
      ["Takde masa", "Terlalu jauh", "Terlalu mahal", "Lebih suka hospital"],
      ["Bawah 21", "21-40", "41-60", "60+", "Lelaki", "Perempuan", "Sektor 73"]
    ]
  },
  zh: {
    back: '返回',
    typing: 'AURA 正在输入...',
    inputPlaceholder: '输入您的消息...',
    prompts: [
      "你好！我是 AURA。为了帮你找到合适的社区资源，我们来简单聊聊吧。你通常每个星期做几天运动？每次大概多久？",
      "明白了。你有做一些强化肌肉的运动吗？另外，有没有慢性病（比如高血压），或者在活动时觉得胸痛/头晕？",
      "谢谢你的分享。换个话题：你有听说过你家附近的社区医疗服务吗？如果用过的话，跟医院比起来你觉得怎么样？你对他们的信任度是多少（1 到 5 分）？",
      "了解。最主要是什么原因阻止你使用社区服务呢？（比如：费用、距离、没时间）。我们有什么可以改进的地方？",
      "最后，为了确保我的建议完全适合你，可以告诉我你的年龄段、性别、种族，以及邮政编码的前两位数吗？"
    ],
    quickReplies: [
      ["0 天", "1-2天, 30分钟", "3-4天, 45分钟", "5天以上, 60分钟"],
      ["没有力量训练", "有, 每周2天", "高血压", "偶尔头晕"],
      ["不知道", "评价: 差不多", "信任度: 3/5", "信任度: 5/5"],
      ["没时间", "太远了", "太贵了", "更喜欢去医院"],
      ["21岁以下", "21-40岁", "41-60岁", "60岁以上", "男", "女", "邮区 73"]
    ]
  },
  ta: {
    back: 'பின்செல்',
    typing: 'AURA தட்டச்சு செய்கிறார்...',
    inputPlaceholder: 'உங்கள் செய்தியை உள்ளிடவும்...',
    prompts: [
      "வணக்கம்! நான் AURA. உங்களுக்கான சரியான சமூக வளங்களைக் கண்டறிய, சிறிது பேசலாம். வாரத்திற்கு எத்தனை நாட்கள் உடற்பயிற்சி செய்கிறீர்கள், ஒவ்வொரு முறையும் எவ்வளவு நேரம்?",
      "புரிந்தது. தசை வலுப்படுத்தும் பயிற்சிகளைச் செய்கிறீர்களா? மேலும், உங்களுக்கு நாள்பட்ட நோய்கள் (உயர் ரத்த அழுத்தம் போன்றவை) உள்ளதா, அல்லது சுறுசுறுப்பாக இருக்கும்போது நெஞ்சு வலி/தலைச்சுற்றல் வருமா?",
      "பகிர்ந்ததற்கு நன்றி. உங்கள் அருகில் உள்ள சுகாதார சேவைகளைப் பற்றி கேள்விப்பட்டிருக்கிறீர்களா? பயன்படுத்தியிருந்தால், மருத்துவமனையுடன் ஒப்பிடும்போது அதை எப்படி மதிப்பிடுவீர்கள், மற்றும் அவர்கள் மீது எவ்வளவு நம்பிக்கை உள்ளது (1 முதல் 5 வரை)?",
      "சரியான கருத்து. சமூக சேவைகளைப் பயன்படுத்துவதை எது தடுக்கிறது? (எ.கா. செலவு, தூரம், நேரமின்மை). நாங்கள் எதை மேம்படுத்தலாம்?",
      "இறுதியாக, எனது பரிந்துரைகள் உங்களுக்கு சரியாக பொருந்துவதை உறுதி செய்ய, உங்கள் வயது, பாலினம், இனம் மற்றும் அஞ்சல் குறியீட்டின் முதல் 2 இலக்கங்களை பகிர முடியுமா?"
    ],
    quickReplies: [
      ["0 நாட்கள்", "1-2 நாட்கள், 30 நிமிடம்", "3-4 நாட்கள், 45 நிமிடம்", "5+ நாட்கள், 60 நிமிடம்"],
      ["தசைப் பயிற்சி இல்லை", "ஆம், 2 நாட்கள்", "உயர் ரத்த அழுத்தம்", "அவ்வப்போது தலைச்சுற்றல்"],
      ["தெரியாது", "மதிப்பீடு: சுமார் அதே", "நம்பிக்கை: 3/5", "நம்பிக்கை: 5/5"],
      ["நேரமின்மை", "வெகு தொலைவு", "அதிக செலவு", "மருத்துவமனைகளை விரும்புகிறேன்"],
      ["21க்கு கீழ்", "21-40", "41-60", "60+", "ஆண்", "பெண்", "பிரிவு 73"]
    ]
  }
};

export default function AuraChat() {
  const navigate = useNavigate();
  const [lang, setLang] = useState('en');
  const [animate, setAnimate] = useState(false);
  const [sessionId] = useState(() => 'nx-aura-' + Math.random().toString(36).substr(2, 9));
  
  const messagesEndRef = useRef(null);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [chatStep, setChatStep] = useState(0);
  
  // Set language properly on mount
  useEffect(() => {
    const storedLang = localStorage.getItem('nexus_language');
    if (storedLang && DICTIONARY[storedLang]) {
        setLang(storedLang);
    }
    setTimeout(() => setAnimate(true), 100);
  }, []);

  const t = DICTIONARY[lang] || DICTIONARY.en;

  const [messages, setMessages] = useState([]);

  // Initialize first message after language is set
  useEffect(() => {
    setMessages([{ id: 1, sender: 'aura', text: (DICTIONARY[lang] || DICTIONARY.en).prompts[0] }]);
  }, [lang]);

  // Mock State to capture parsed variables from the LLM conversation
  const [parsedData, setParsedData] = useState({
    pavsDays: 0, pavsMinutes: 0, strengthDays: 0, medConditions: 0, medFlag: false, symptomsCount: 0, symptomFlag: false,
    aware: 'No', referred: 'No', rating: 'About the Same', trust: '3', barriers: [], improve: '',
    age: '41-60', gender: 'Female', race: 'Chinese', postalCode: '73'
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async (e, forcedText = null) => {
    if (e) e.preventDefault();
    const textToSend = forcedText || input;
    if (!textToSend.trim()) return;

    setMessages(prev => [...prev, { id: Date.now(), sender: 'user', text: textToSend }]);
    setInput('');
    setIsTyping(true);

    // Simulate LLM Processing and intent extraction
    setTimeout(() => {
      setIsTyping(false);
      
      // Heuristic extraction for demonstration (gracefully catches numbers regardless of language)
      if (chatStep === 0) {
        if (textToSend.includes('3') || textToSend.includes('45')) setParsedData(prev => ({...prev, pavsDays: 3, pavsMinutes: 45}));
      } else if (chatStep === 1) {
        if (textToSend.includes('2')) setParsedData(prev => ({...prev, strengthDays: 2}));
      } else if (chatStep === 3) {
        setParsedData(prev => ({...prev, barriers: [...prev.barriers, textToSend]}));
      }

      if (chatStep < t.prompts.length - 1) {
        setMessages(prev => [...prev, { id: Date.now(), sender: 'aura', text: t.prompts[chatStep + 1] }]);
        setChatStep(prev => prev + 1);
      } else {
        finalizeAssessment();
      }
    }, 1200);
  };

  const finalizeAssessment = async () => {
    const endMessage = lang === 'ms' ? 'Terima kasih! Saya sedang menganalisis maklum balas anda. Menjana laluan komuniti anda sekarang...'
                     : lang === 'zh' ? '谢谢！我已经分析了你的回答。正在为你生成专属的社区资源路径...'
                     : lang === 'ta' ? 'நன்றி! நான் உங்கள் பதில்களை பகுப்பாய்வு செய்துள்ளேன். உங்கள் சமூக வழியை இப்போது உருவாக்குகிறேன்...'
                     : 'Thank you! I have analysed your responses. Generating your personalised community pathway now...';

    setMessages(prev => [...prev, { id: Date.now(), sender: 'aura', text: endMessage }]);
    
    const clinicalData = {
      pavsDays: parsedData.pavsDays,
      pavsMinutes: parsedData.pavsMinutes,
      strengthDays: parsedData.strengthDays,
      medConditions: parsedData.medConditions,
      medFlag: parsedData.medFlag,
      symptomsCount: parsedData.symptomsCount,
      symptomFlag: parsedData.symptomFlag,
      // Generic mock flag for demo purposes
      sdohFinancial: parsedData.barriers.length > 0,
      sdohLogistical: parsedData.barriers.length > 0,
      sdohSocial: false
    };

    const score = calculateRiskScore(clinicalData);
    const postalSector = parsedData.postalCode || '00';

    const masterPayload = {
      sessionId: sessionId,
      action: 'unified_assessment_complete_aura',
      language: lang,
      score: score,
      clinical: clinicalData,
      perception: {
          aware: parsedData.aware, referred: parsedData.referred, rating: parsedData.rating,
          trust: parsedData.trust, barriers: parsedData.barriers, improve: parsedData.improve
      },
      demographics: {
          age: parsedData.age, gender: parsedData.gender, race: parsedData.race, sector: postalSector
      }
    };

    await recordTelemetry(postalSector, masterPayload);

    setTimeout(() => {
      navigate('/individuals/result', { state: { score, data: clinicalData, postalSector } });
    }, 1800);
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 transition-colors duration-700 flex flex-col items-center py-6 px-4 md:px-6 relative overflow-x-hidden font-sans">
      
      <div className="absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
      <div className={`fixed top-0 left-0 w-[600px] h-[600px] bg-pink-500/10 rounded-full blur-[100px] pointer-events-none animate-float-slow transition-opacity duration-1000 ${animate ? 'opacity-100' : 'opacity-0'}`}></div>
      <div className={`fixed bottom-0 right-0 w-[500px] h-[500px] bg-rose-500/10 rounded-full blur-[80px] pointer-events-none animate-float-delayed transition-opacity duration-1000 ${animate ? 'opacity-100' : 'opacity-0'}`}></div>

      <div className={`relative z-10 w-full max-w-2xl h-[calc(100vh-3rem)] flex flex-col transition-all duration-1000 transform ${animate ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
        
        {/* HEADER */}
        <div className="flex justify-between items-center mb-4 px-2 shrink-0">
          <button onClick={() => navigate('/individuals/pathway')} className="flex items-center gap-2 px-4 py-2 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white font-black text-xs uppercase tracking-widest rounded-full border border-slate-200 dark:border-slate-700 shadow-sm transition-all group">
              <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform"/> {t.back}
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-pink-50 dark:bg-pink-500/10 border border-pink-100 dark:border-pink-500/20 rounded-full">
             <Sparkles size={14} className="text-pink-500" />
             <span className="text-[10px] font-black text-pink-600 dark:text-pink-400 uppercase tracking-widest">AURA Active</span>
          </div>
        </div>

        {/* CHAT CONTAINER */}
        <div className="flex-1 bg-white dark:bg-[#111827] rounded-[2rem] shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
            <div className="text-center pb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-pink-400 to-rose-500 rounded-full mx-auto flex items-center justify-center shadow-lg shadow-pink-500/30 mb-3">
                <Activity className="text-white w-8 h-8" />
              </div>
              <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">Secure Session</h2>
              <p className="text-[10px] font-mono text-slate-300">{sessionId}</p>
            </div>

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                <div className={`max-w-[80%] p-4 rounded-2xl text-sm font-medium leading-relaxed shadow-sm ${
                  msg.sender === 'user' 
                  ? 'bg-indigo-600 text-white rounded-tr-sm' 
                  : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-tl-sm'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start animate-in fade-in">
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl rounded-tl-sm flex items-center gap-2">
                  <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* QUICK REPLIES */}
          {!isTyping && chatStep < t.quickReplies.length && (
            <div className="px-6 py-2 flex flex-wrap gap-2 animate-in fade-in">
              {t.quickReplies[chatStep].map((reply, idx) => (
                <button
                  key={idx}
                  onClick={(e) => handleSend(e, reply)}
                  className="px-4 py-2 bg-pink-50 dark:bg-pink-500/10 hover:bg-pink-100 dark:hover:bg-pink-500/20 text-pink-600 dark:text-pink-400 border border-pink-200 dark:border-pink-500/30 rounded-full text-xs font-bold transition-colors"
                >
                  {reply}
                </button>
              ))}
            </div>
          )}

          {/* INPUT BAR */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800">
            <form onSubmit={handleSend} className="flex items-center gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isTyping ? t.typing : t.inputPlaceholder}
                disabled={isTyping || chatStep >= t.prompts.length}
                className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-pink-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                className="p-3 bg-pink-500 text-white rounded-xl hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                <Send size={18} />
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}
