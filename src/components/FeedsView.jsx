import React, { useState } from 'react';
import { Sparkles, MessageSquare, ThumbsUp, Share2, ShieldAlert, Calendar, Link as LinkIcon, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { useNexus } from '../context/NexusContext';

// --- CATEGORY CONFIGURATION ---
const CATEGORIES = {
    ALL: { id: 'ALL', label: 'All Feeds', icon: '🌍', color: 'slate' },
    BOOKWORM: { id: 'BOOKWORM', label: 'Bookworm', icon: '🐛', color: 'emerald', desc: 'Clinical & Science' },
    SOCIAL_BUTTERFLY: { id: 'SOCIAL_BUTTERFLY', label: 'Social Butterfly', icon: '🦋', color: 'purple', desc: 'Team & Culture' },
    BLUE_BEETLE: { id: 'BLUE_BEETLE', label: 'Blue Beetle', icon: '🪲', color: 'blue', desc: 'Tech & Ops' },
    BUSY_BEE: { id: 'BUSY_BEE', label: 'Busy Bee', icon: '🐝', color: 'amber', desc: 'Growth & Upskilling' }
};

// --- REAL HOSPITAL DATA ---
const LIVE_MOCK_POSTS = [
    {
        id: 1, 
        author: 'Alif', 
        role: 'Lead CEP', 
        avatar: 'bg-emerald-100 text-emerald-700', 
        timestamp: '1 hour ago', 
        category: 'BOOKWORM',
        raw_text: "The ACSM just released their updated position stand on resistance training. It is an excellent review on volume and intensity modulation. A must-read as we refine our exercise prescription protocols.",
        ai_enhancements: { 
            tldr: "Updated ACSM resistance training guidelines published. Key reading for exercise prescription protocols.", 
            tags: ['ACSM', 'RESISTANCE TRAINING', 'CLINICAL GUIDELINES'] 
        },
        image_url: "https://cdn.fs.pathlms.com/mjxJF5l5R9yASZy09BFC/convert?cache=true&fit=scale&format=jpeg&h=192&quality=100&w=1056",
        external_link: { 
            title: "ACSM Position Stand on Resistance Training", 
            url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/", 
            domain: "ncbi.nlm.nih.gov" 
        },
        likes: 14, 
        comments: 3
    },
    {
        id: 2, 
        author: 'Nisa', 
        role: 'Admin', 
        avatar: 'bg-purple-100 text-purple-700', 
        timestamp: '3 hours ago', 
        category: 'SOCIAL_BUTTERFLY',
        raw_text: "Where is your battery at today? Are you thriving or just surviving? We've updated our NEXUS dashboard to reflect both Physical and Emotional capacity based on this great visual framework. Remember to check in with yourselves and your colleagues!",
        ai_enhancements: { 
            tldr: "NEXUS dashboard updated to track both emotional and physical social batteries. Reminder to check in.", 
            tags: ['WELLBEING', 'MENTAL HEALTH', 'TEAM CULTURE'] 
        },
        image_url: "https://scontent.fsin16-1.fna.fbcdn.net/v/t39.30808-6/491984873_1432622474740958_7072550564777468896_n.jpg?_nc_cat=106&ccb=1-7&_nc_sid=7b2446&_nc_ohc=oSToMNVh2bMQ7kNvwHW3gB0&_nc_oc=Adn-wXZpqFpnoosYvx7nFZARJyn4tQZYnPAQyqo3LPxWV9eNbkFFEDX50eGXiYtpizY&_nc_zt=23&_nc_ht=scontent.fsin16-1.fna&_nc_gid=9-zsViGSoTRHOdmsv6U6sg&_nc_ss=8&oh=00_AfwGc05Ki4j8-cz6KOSHY2314sgveI-WxjZ9yqpE4kPeJA&oe=69BE2F2D",
        external_link: { 
            title: "Social Battery: Emotional & Physical Matrix", 
            url: "https://www.facebook.com/SocialButterflyCCS/posts/wheres-your-battery-at-today-are-you-thriving-or-just-surviving-this-visual-repr/1405645187438687/", 
            domain: "facebook.com" 
        },
        likes: 42, 
        comments: 8
    },
    {
        id: 3, 
        author: 'Linder', 
        role: 'CEP Edu Lead', 
        avatar: 'bg-amber-100 text-amber-700', 
        timestamp: '5 hours ago', 
        category: 'BUSY_BEE',
        raw_text: "Highly recommend looking into the Active Health Lab's CALM (Combat Age-Related Loss of Muscle) program. It has fantastic insights on protein intake interventions specifically for our menopausal patients. Great structured approach we can learn from.",
        ai_enhancements: { 
            tldr: "Recommendation to review the CALM program for interventions on muscle loss and protein intake in menopausal patients.", 
            tags: ['CALM', 'MENOPAUSE', 'NUTRITION'] 
        },
        external_link: { 
            title: "Combat Age-Related Loss of Muscle (CALM)", 
            url: "https://www.activesgcircle.gov.sg/activehealth/our-programmes?filter=just_getting_started&slide=combat-age-related-loss-of-muscle-calm-10-20", 
            domain: "activesgcircle.gov.sg" 
        },
        likes: 21, 
        comments: 4
    },
    {
        id: 4, 
        author: 'A/Prof. Ashik', 
        role: 'HOD / HOS', 
        avatar: 'bg-blue-100 text-blue-700', 
        timestamp: '1 day ago', 
        category: 'BLUE_BEETLE',
        raw_text: "Anthropic just launched a series of free AI courses on Skilljar. Given our strong push towards integrating smart tools like AURA into our workflow, I highly encourage everyone to take a look and upskill on prompt engineering.",
        ai_enhancements: { 
            urgency: 'NORMAL', 
            tldr: "HOD encourages staff to utilize free Anthropic AI courses to improve prompt engineering skills.", 
            tags: ['AI TRAINING', 'ANTHROPIC', 'UPSKILLING'] 
        },
        // 🌟 Ashik's LinkedIn Image
        image_url: "https://media.licdn.com/dms/image/v2/D4D22AQHJt-AY4ezgmQ/feedshare-shrink_1280/B4DZlH8964JUAs-/0/1757848791179?e=1775088000&v=beta&t=lGHqjFMc5FjmVFUtshZvDJfZ81HrQKZW7rCFb68xP2o",
        external_link: { 
            title: "Anthropic Educational Courses", 
            url: "https://anthropic.skilljar.com/", 
            domain: "anthropic.skilljar.com" 
        },
        likes: 38, 
        comments: 5
    }
];

// --- MARVEL DEMO DATA ---
const DEMO_MOCK_POSTS = [
    {
        id: 'm1', author: 'Tony Stark', role: 'Head of Engineering', avatar: 'bg-red-100 text-red-700', timestamp: '1 hour ago', category: 'SOCIAL_BUTTERFLY',
        raw_text: "Just docked the Disney Adventure at Marina Bay Cruise Centre, Singapore! 🇸🇬 The repulsor tech powering the Marvel landing zone is holding steady at 100%. Avengers, assemble at the upper deck for the VIP meet-and-greet at 1800 hrs.",
        ai_enhancements: { tldr: "Avengers meet-and-greet on the Disney Adventure cruise ship in Singapore at 1800 hrs.", tags: ['SINGAPORE', 'DISNEY ADVENTURE', 'TEAM EVENT'] },
        image_url: "https://cdn1.parksmedia.wdprapps.disney.com/resize/mwImage/1/1000/1000/75/vision-dam/digital/parks-platform/parks-global-assets/disney-cruise-line/ships/adventure/concept-art/Marvel-landing-ca-16x9.jpg?2025-09-30T00:24:43+00:00", 
        external_link: { title: "Join the Disney Adventure", url: "https://disneycruise.disney.go.com/why-cruise-disney/join-the-adventure/", domain: "disneycruise.disney.go.com" },
        likes: 3000, comments: 412
    },
    {
        id: 'm2', author: 'Peter Parker', role: 'Intern (Web Dev)', avatar: 'bg-blue-100 text-blue-700', timestamp: '3 hours ago', category: 'BLUE_BEETLE',
        raw_text: "Hey everyone! 'Spider-Man: Brand New Day' is officially out worldwide! Also, I've updated the web-shooter schematics on the shared drive to match the new high-tensile formula used in the film. Check it out!",
        ai_enhancements: { urgency: 'NORMAL', tldr: "'Brand New Day' released. New high-tensile web-shooter schematics uploaded to the shared drive.", tags: ['BRAND NEW DAY', 'SCHEMATICS', 'GEAR UPDATE'] },
        image_url: "https://media.gettyimages.com/id/2227870960/photo/celebrity-sightings-in-glasgow-august-3-2025.jpg?s=2048x2048&w=gi&k=20&c=k_reMlFPw5jnS4aNC6mQAA6OKgs_NJvINRGa8PB0WX8=", 
        external_link: { title: "Watch the Official Trailer", url: "https://youtu.be/Vsn7sVxCq1M?si=ylFiUeGVTI2Cmw6j", domain: "youtube.com" },
        likes: 890, comments: 55
    },
    {
        id: 'm3', author: 'Bruce Banner', role: 'Head of Research', avatar: 'bg-emerald-100 text-emerald-700', timestamp: '5 hours ago', category: 'BOOKWORM',
        raw_text: "Just reviewed the recent combat data on Chitauri armor plating. The tensile strength requires a minimum of 4000 Joules for penetration. I've uploaded the kinetic breakdown to the mainframe for anyone modifying their gear.",
        ai_enhancements: { tldr: "Chitauri armor analysis complete: Requires 4000+ Joules for penetration. Data uploaded to mainframe.", tags: ['COMBAT DATA', 'VULNERABILITY ANALYSIS'] },
        likes: 42, comments: 7
    },
    {
        id: 'm4', author: 'Nick Fury', role: 'Director', avatar: 'bg-slate-800 text-white', timestamp: '1 day ago', category: 'BUSY_BEE',
        raw_text: "S.H.I.E.L.D. is hosting a mandatory advanced tactical espionage seminar next month. All field agents must attend. Sessions start October 10th at 0800 hrs in the Triskelion Briefing Room Alpha.",
        ai_enhancements: { event_date: 'Oct 10, 2026 - 0800 hrs', location: 'Triskelion Briefing Room Alpha', tags: ['MANDATORY', 'TRAINING', 'ESPIONAGE'] },
        likes: 89, comments: 0
    }
];

const FeedsView = ({ user }) => {
    const { isDemo } = useNexus();
    const [activeFilter, setActiveFilter] = useState('ALL');
    const [draftPost, setDraftPost] = useState('');

    const currentDataset = isDemo ? DEMO_MOCK_POSTS : LIVE_MOCK_POSTS;

    const filteredPosts = activeFilter === 'ALL' 
        ? currentDataset 
        : currentDataset.filter(post => post.category === activeFilter);

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
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${isDemo ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}`}>
                        {user?.name ? user.name.charAt(0) : (isDemo ? 'S' : 'U')}
                    </div>
                    <div className="flex-1 space-y-3">
                        <textarea
                            value={draftPost}
                            onChange={(e) => setDraftPost(e.target.value)}
                            placeholder={isDemo ? "Share combat data, team shoutouts, or S.H.I.E.L.D updates..." : "Share a clinical insight, team shoutout, or update..."}
                            className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl p-4 text-sm text-slate-700 dark:text-slate-200 outline-none resize-none border border-slate-100 dark:border-slate-700 focus:border-indigo-300 dark:focus:border-indigo-600 transition-colors h-24"
                        />
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    <ShieldAlert size={14} className={isDemo ? "text-rose-500" : "text-emerald-500"} />
                                    <span className="hidden sm:inline">{isDemo ? "S.H.I.E.L.D. SECURE COMMS" : "PDPA Guard Active"}</span>
                                </div>
                                <button className="p-1.5 text-slate-400 hover:text-indigo-500 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                                    <ImageIcon size={18} />
                                </button>
                                <button className="p-1.5 text-slate-400 hover:text-indigo-500 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                                    <LinkIcon size={18} />
                                </button>
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
                        <div key={post.id} className="bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow">
                            
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
                                    <span>{categoryConfig.icon}</span> <span className="hidden sm:inline">{categoryConfig.label}</span>
                                </div>
                            </div>

                            {/* AI Enhancements */}
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

                                    {(post.ai_enhancements.event_date || post.ai_enhancements.location) && (
                                        <div className="flex flex-col gap-1 mt-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                            {post.ai_enhancements.event_date && <div className="flex items-center gap-1.5"><Calendar size={14} className={theme.text} /> {post.ai_enhancements.event_date}</div>}
                                            {post.ai_enhancements.location && <div className="flex items-center gap-1.5"><LinkIcon size={14} className={theme.text} /> {post.ai_enhancements.location}</div>}
                                        </div>
                                    )}

                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {post.ai_enhancements.tags?.map(tag => (
                                            <span key={tag} className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${theme.lightBg} ${theme.text}`}>
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Raw Text Body */}
                            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-4">
                                {post.raw_text}
                            </p>

                            {/* 🌟 NEW: RICH MEDIA ATTACHMENTS 🌟 */}
                            {post.image_url && (
                                <div className="mb-4 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700/80 bg-slate-100 dark:bg-slate-900 group">
                                    <img 
                                        src={post.image_url} 
                                        alt="Post attachment" 
                                        className="w-full h-auto max-h-[350px] object-cover group-hover:scale-[1.02] transition-transform duration-700"
                                        loading="lazy"
                                    />
                                </div>
                            )}

                            {post.external_link && (
                                <a href={post.external_link.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group">
                                    <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-lg group-hover:scale-110 transition-transform">
                                        <ExternalLink size={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{post.external_link.title}</p>
                                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest truncate">{post.external_link.domain}</p>
                                    </div>
                                </a>
                            )}

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
