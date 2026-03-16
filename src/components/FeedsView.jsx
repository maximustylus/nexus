import React, { useState } from 'react';
import { Sparkles, MessageSquare, ThumbsUp, Share2, ShieldAlert, Calendar, Link as LinkIcon } from 'lucide-react';

// --- CATEGORY CONFIGURATION ---
const CATEGORIES = {
    ALL: { id: 'ALL', label: 'All Feeds', icon: '🌍', color: 'slate' },
    BOOKWORM: { id: 'BOOKWORM', label: 'Bookworm', icon: '🐛', color: 'emerald', desc: 'Clinical & Science' },
    SOCIAL_BUTTERFLY: { id: 'SOCIAL_BUTTERFLY', label: 'Social Butterfly', icon: '🦋', color: 'purple', desc: 'Team & Culture' },
    BLUE_BEETLE: { id: 'BLUE_BEETLE', label: 'Blue Beetle', icon: '🪲', color: 'blue', desc: 'Tech & Ops' },
    BUSY_BEE: { id: 'BUSY_BEE', label: 'Busy Bee', icon: '🐝', color: 'amber', desc: 'Growth & Upskilling' }
};

// --- MOCK DATA (Simulating AI-Enhanced Database Posts) ---
const MOCK_POSTS = [
    {
        id: 1,
        author: 'Dr. Sarah Lee',
        role: 'Senior Consultant',
        avatar: 'bg-emerald-100 text-emerald-700',
        timestamp: '2 hours ago',
        category: 'BOOKWORM',
        raw_text: "Attached is the new NEJM paper regarding the updated pediatric asthma management protocols. We should discuss implementing the reduced corticosteroid scaling during tomorrow's grand round.",
        ai_enhancements: {
            tldr: "Study shows 15% reduction in side-effects with revised corticosteroid scaling. Discussion slated for tomorrow's Grand Round.",
            tags: ['PEDIATRICS', 'CLINICAL GUIDELINES']
        },
        likes: 12,
        comments: 3
    },
    {
        id: 2,
        author: 'Alif',
        role: 'Nurse Manager',
        avatar: 'bg-purple-100 text-purple-700',
        timestamp: '4 hours ago',
        category: 'SOCIAL_BUTTERFLY',
        raw_text: "Massive shoutout to the night shift team in Ward 4. It was absolute chaos from 2am to 5am but everyone covered for each other seamlessly. Couldn't ask for a better crew.",
        ai_enhancements: {
            tldr: "Kudos to Ward 4 night shift for exceptional teamwork under pressure.",
            tags: ['KUDOS', 'NIGHT SHIFT', 'TEAMWORK']
        },
        likes: 34,
        comments: 8
    },
    {
        id: 3,
        author: 'IT Operations',
        role: 'System Admin',
        avatar: 'bg-blue-100 text-blue-700',
        timestamp: '5 hours ago',
        category: 'BLUE_BEETLE',
        raw_text: "Please be advised that the main Electronic Health Record (EHR) system will undergo scheduled maintenance this Sunday between 0200 hrs and 0400 hrs. All clinical staff must switch to the offline charting protocol during this window.",
        ai_enhancements: {
            urgency: 'HIGH',
            tldr: "EHR Downtime: Sunday 0200-0400 hrs. Switch to offline charting.",
            tags: ['DOWNTIME', 'SYSTEM UPDATE']
        },
        likes: 5,
        comments: 1
    },
    {
        id: 4,
        author: 'HR Dept',
        role: 'Upskilling Office',
        avatar: 'bg-amber-100 text-amber-700',
        timestamp: '1 day ago',
        category: 'BUSY_BEE',
        raw_text: "Registration is now open for the Q3 'Resilient Leadership in Healthcare' seminar. We highly encourage charge nurses and junior consultants to apply. Event is on Oct 15th, 0900 hrs at the main auditorium.",
        ai_enhancements: {
            event_date: 'Oct 15, 2026 - 0900 hrs',
            location: 'Main Auditorium',
            tags: ['LEADERSHIP', 'SEMINAR', 'CME']
        },
        likes: 19,
        comments: 2
    }
];

const FeedsView = ({ user }) => {
    const [activeFilter, setActiveFilter] = useState('ALL');
    const [draftPost, setDraftPost] = useState('');

    const filteredPosts = activeFilter === 'ALL' 
        ? MOCK_POSTS 
        : MOCK_POSTS.filter(post => post.category === activeFilter);

    // Helper to get color classes based on category
    const getColorTheme = (categoryKey) => {
        const color = CATEGORIES[categoryKey].color;
        return {
            bg: `bg-${color}-50 dark:bg-${color}-900/20`,
            border: `border-${color}-200 dark:border-${color}-800/50`,
            text: `text-${color}-700 dark:text-${color}-400`,
            lightBg: `bg-${color}-100 dark:bg-${color}-800/40`
        };
    };

    return (
        <div className="w-full max-w-[900px] mx-auto p-4 md:p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* 1. THE SMART COMPOSER */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-700 relative overflow-hidden">
                <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-sm shrink-0">
                        {user?.name ? user.name.charAt(0) : 'U'}
                    </div>
                    <div className="flex-1 space-y-3">
                        <textarea
                            value={draftPost}
                            onChange={(e) => setDraftPost(e.target.value)}
                            placeholder="Share a clinical insight, team shoutout, or update..."
                            className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl p-4 text-sm text-slate-700 dark:text-slate-200 outline-none resize-none border border-slate-100 dark:border-slate-700 focus:border-indigo-300 dark:focus:border-indigo-600 transition-colors h-24"
                        />
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                <ShieldAlert size={14} className="text-emerald-500" />
                                PDPA Guard Active
                            </div>
                            <button 
                                disabled={!draftPost.trim()}
                                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 shadow-md"
                            >
                                <Sparkles size={14} /> Post & Enhance
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. THE BUG FILTERS */}
            <div className="flex gap-3 overflow-x-auto scrollbar-hide py-2">
                {Object.values(CATEGORIES).map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => setActiveFilter(cat.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-sm font-bold transition-all shrink-0 shadow-sm
                            ${activeFilter === cat.id 
                                ? `bg-${cat.color}-100 dark:bg-${cat.color}-900/40 border-${cat.color}-300 text-${cat.color}-700 dark:text-${cat.color}-300` 
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                    >
                        <span className="text-lg">{cat.icon}</span>
                        <div className="flex flex-col items-start text-left">
                            <span className="leading-none">{cat.label}</span>
                            {cat.desc && <span className="text-[9px] font-medium opacity-70 mt-0.5">{cat.desc}</span>}
                        </div>
                    </button>
                ))}
            </div>

            {/* 3. THE FEED STREAM */}
            <div className="space-y-5">
                {filteredPosts.map(post => {
                    const theme = getColorTheme(post.category);
                    const categoryConfig = CATEGORIES[post.category];

                    return (
                        <div key={post.id} className="bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                            
                            {/* Card Header */}
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm ${post.avatar}`}>
                                        {post.author.charAt(0)}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 dark:text-slate-100">{post.author}</h3>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">{post.role} • {post.timestamp}</p>
                                    </div>
                                </div>
                                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black ${theme.bg} ${theme.text} border ${theme.border}`}>
                                    <span>{categoryConfig.icon}</span> {categoryConfig.label}
                                </div>
                            </div>

                            {/* AI Enhancements (Dynamic based on pillar) */}
                            {post.ai_enhancements && (
                                <div className={`mb-4 p-3 rounded-xl ${theme.bg} border ${theme.border} flex flex-col gap-2`}>
                                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest opacity-70">
                                        <Sparkles size={12} /> AURA Extraction
                                    </div>
                                    
                                    {post.ai_enhancements.urgency && (
                                        <div className="text-xs font-black text-red-600 dark:text-red-400 uppercase flex items-center gap-1">
                                            <ShieldAlert size={14} /> CRITICAL UPDATE
                                        </div>
                                    )}

                                    {post.ai_enhancements.tldr && (
                                        <p className={`text-sm font-bold ${theme.text}`}>
                                            {post.ai_enhancements.tldr}
                                        </p>
                                    )}

                                    {/* Event Specific Extraction (Busy Bee) */}
                                    {(post.ai_enhancements.event_date || post.ai_enhancements.location) && (
                                        <div className="flex flex-col gap-1 mt-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                            {post.ai_enhancements.event_date && <div className="flex items-center gap-1.5"><Calendar size={14} className={theme.text} /> {post.ai_enhancements.event_date}</div>}
                                            {post.ai_enhancements.location && <div className="flex items-center gap-1.5"><LinkIcon size={14} className={theme.text} /> {post.ai_enhancements.location}</div>}
                                        </div>
                                    )}

                                    <div className="flex flex-wrap gap-2 mt-1">
                                        {post.ai_enhancements.tags?.map(tag => (
                                            <span key={tag} className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${theme.lightBg} ${theme.text}`}>
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Raw Text Body */}
                            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-5">
                                {post.raw_text}
                            </p>

                            {/* Interactions */}
                            <div className="flex items-center gap-6 pt-4 border-t border-slate-100 dark:border-slate-700">
                                <button className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors group">
                                    <div className="p-1.5 rounded-full group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 transition-colors">
                                        <ThumbsUp size={16} />
                                    </div>
                                    {post.likes}
                                </button>
                                <button className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors group">
                                    <div className="p-1.5 rounded-full group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 transition-colors">
                                        <MessageSquare size={16} />
                                    </div>
                                    {post.comments}
                                </button>
                                <button className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors group ml-auto">
                                    <Share2 size={16} />
                                </button>
                            </div>

                        </div>
                    );
                })}
            </div>
            
            <div className="h-24" /> {/* Bottom Spacer */}
        </div>
    );
};

export default FeedsView;
