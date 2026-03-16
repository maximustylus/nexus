import React, { useState, useEffect } from 'react';
import { Sparkles, MessageSquare, ThumbsUp, Share2, ShieldAlert, Calendar, Link as LinkIcon, ExternalLink, Image as ImageIcon, Loader2, AlertTriangle, X } from 'lucide-react';
import { useNexus } from '../context/NexusContext';

import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

// --- CATEGORY CONFIGURATION ---
const CATEGORIES = {
    ALL: { id: 'ALL', label: 'All Feeds', icon: '🌍', color: 'slate' },
    BOOKWORM: { id: 'BOOKWORM', label: 'Bookworm', icon: '🐛', color: 'emerald', desc: 'Clinical & Science' },
    SOCIAL_BUTTERFLY: { id: 'SOCIAL_BUTTERFLY', label: 'Social Butterfly', icon: '🦋', color: 'purple', desc: 'Team & Culture' },
    BLUE_BEETLE: { id: 'BLUE_BEETLE', label: 'Blue Beetle', icon: '🪲', color: 'blue', desc: 'Tech & Ops' },
    BUSY_BEE: { id: 'BUSY_BEE', label: 'Busy Bee', icon: '🐝', color: 'amber', desc: 'Growth & Upskilling' }
};

// --- MOCK DATA REMAINS UNCHANGED HERE (Keep your existing LIVE_MOCK_POSTS and DEMO_MOCK_POSTS arrays here) ---
const LIVE_MOCK_POSTS = [
    {
        id: 'live1', author: 'Alif', role: 'Lead CEP', avatar: 'bg-emerald-100 text-emerald-700', timestamp: '1 hour ago', category: 'BOOKWORM',
        raw_text: "The ACSM just released their updated position stand on resistance training. It is an excellent review on volume and intensity modulation. A must-read as we refine our exercise prescription protocols.",
        ai_enhancements: { tldr: "Updated ACSM resistance training guidelines published. Key reading for exercise prescription protocols.", tags: ['ACSM', 'RESISTANCE TRAINING', 'CLINICAL GUIDELINES'] },
        image_url: "https://cdn.fs.pathlms.com/mjxJF5l5R9yASZy09BFC/convert?cache=true&fit=scale&format=jpeg&h=192&quality=100&w=1056",
        external_link: { title: "ACSM Position Stand on Resistance Training", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/", domain: "ncbi.nlm.nih.gov" },
        likes: 14, comments: 3
    }
    // ... Add the rest of your Live/Demo mock posts back here!
];

const DEMO_MOCK_POSTS = [
    {
        id: 'm1', author: 'Tony Stark', role: 'Head of Engineering', avatar: 'bg-red-100 text-red-700', timestamp: '1 hour ago', category: 'SOCIAL_BUTTERFLY',
        raw_text: "Just docked the Disney Adventure at Marina Bay Cruise Centre, Singapore! 🇸🇬 The repulsor tech powering the Marvel landing zone is holding steady at 100%. Avengers, assemble at the upper deck for the VIP meet-and-greet at 1800 hrs.",
        ai_enhancements: { tldr: "Avengers meet-and-greet on the Disney Adventure cruise ship in Singapore at 1800 hrs.", tags: ['SINGAPORE', 'DISNEY ADVENTURE', 'TEAM EVENT'] },
        image_url: "https://cdn1.parksmedia.wdprapps.disney.com/resize/mwImage/1/1000/1000/75/vision-dam/digital/parks-platform/parks-global-assets/disney-cruise-line/ships/adventure/concept-art/Marvel-landing-ca-16x9.jpg?2025-09-30T00:24:43+00:00", 
        external_link: { title: "Join the Disney Adventure", url: "https://disneycruise.disney.go.com/why-cruise-disney/join-the-adventure/", domain: "disneycruise.disney.go.com" },
        likes: 3000, comments: 412
    }
    // ... Add the rest of your Live/Demo mock posts back here!
];

const FeedsView = ({ user }) => {
    const { isDemo } = useNexus();
    const [activeFilter, setActiveFilter] = useState('ALL');
    const [draftPost, setDraftPost] = useState('');
    
    // Live Backend State
    const [livePosts, setLivePosts] = useState([]);
    const [isPosting, setIsPosting] = useState(false);
    const [postError, setPostError] = useState(null);

    // 🌟 NEW: LINK PREVIEW STATE
    const [linkPreview, setLinkPreview] = useState(null);
    const [isFetchingLink, setIsFetchingLink] = useState(false);

    // 🌟 NEW: THE URL WATCHER (Listens as you type)
    useEffect(() => {
        // Regex to find http:// or https:// links in the text
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const matches = draftPost.match(urlRegex);

        if (matches && matches.length > 0) {
            const detectedUrl = matches[0];
            
            // Only fetch if we haven't already previewed this exact link
            if (!linkPreview || linkPreview.url !== detectedUrl) {
                fetchLinkPreview(detectedUrl);
            }
        }
    }, [draftPost]);

    // 🌟 NEW: THE API SCRAPER (Uses free Microlink API)
    const fetchLinkPreview = async (url) => {
        setIsFetchingLink(true);
        try {
            const response = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`);
            const data = await response.json();
            
            if (data.status === 'success') {
                setLinkPreview({
                    title: data.data.title || 'Shared Link',
                    domain: data.data.publisher || new URL(url).hostname,
                    url: url,
                    image_url: data.data.image?.url || null
                });
            }
        } catch (error) {
            console.error("Failed to fetch link preview:", error);
        } finally {
            setIsFetchingLink(false);
        }
    };

    // Firestore Listener
    useEffect(() => {
        const q = query(collection(db, 'feed_posts'), orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedPosts = snapshot.docs.map(doc => {
                const data = doc.data();
                let timeString = 'Just now';
                if (data.timestamp?.toDate) {
                    timeString = data.timestamp.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                }
                return { id: doc.id, ...data, timestamp: timeString, avatar: 'bg-indigo-100 text-indigo-700' };
            });
            setLivePosts(fetchedPosts);
        });
        return () => unsubscribe();
    }, []);

    const baseDataset = isDemo ? DEMO_MOCK_POSTS : LIVE_MOCK_POSTS;
    const filteredDbPosts = livePosts.filter(p => p.isDemo === isDemo);
    const combinedPosts = [...filteredDbPosts, ...baseDataset];
    const displayPosts = activeFilter === 'ALL' ? combinedPosts : combinedPosts.filter(p => p.category === activeFilter);

    // 🌟 UPDATED: SEND PREVIEW DATA TO BACKEND
    const handlePostSubmit = async () => {
        if (!draftPost.trim()) return;
        setIsPosting(true); setPostError(null);

        try {
            const functions = getFunctions(undefined, 'us-central1');
            const processFeedPost = httpsCallable(functions, 'processFeedPost');

            const response = await processFeedPost({
                rawText: draftPost,
                authorName: user?.name || (isDemo ? 'S.H.I.E.L.D. Agent' : 'Staff Member'),
                authorRole: user?.title || user?.role || 'Clinical Staff',
                isDemo: isDemo,
                externalLink: linkPreview // <-- Sending our beautifully scraped link preview!
            });

            if (response.data.success) {
                setDraftPost('');
                setLinkPreview(null); // Clear preview on success
            } else {
                setPostError(response.data.feedback);
            }
        } catch (error) {
            setPostError("Failed to connect to AURA. Please check your connection.");
        } finally {
            setIsPosting(false);
        }
    };

    const getColorTheme = (categoryKey) => {
        const color = CATEGORIES[categoryKey]?.color || 'slate';
        return { bg: `bg-${color}-50 dark:bg-${color}-900/20`, border: `border-${color}-200 dark:border-${color}-800/50`, text: `text-${color}-700 dark:text-${color}-400`, lightBg: `bg-${color}-100 dark:bg-${color}-800/40` };
    };

    return (
        <div className="w-full max-w-[900px] mx-auto p-4 md:p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* THE SMART COMPOSER */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-700 relative overflow-hidden transition-all duration-300">
                <div className="flex gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${isDemo ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}`}>
                        {user?.name ? user.name.charAt(0) : (isDemo ? 'S' : 'U')}
                    </div>
                    <div className="flex-1 space-y-3">
                        <textarea
                            value={draftPost}
                            onChange={(e) => setDraftPost(e.target.value)}
                            disabled={isPosting}
                            placeholder={isDemo ? "Share combat data, team shoutouts, or S.H.I.E.L.D updates..." : "Share a clinical insight, team shoutout, or update..."}
                            className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl p-4 text-sm text-slate-700 dark:text-slate-200 outline-none resize-none border border-slate-100 dark:border-slate-700 focus:border-indigo-300 transition-colors h-24"
                        />

                        {/* 🌟 NEW: THE LINK PREVIEW UI */}
                        {isFetchingLink && (
                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 animate-pulse px-2">
                                <LinkIcon size={12} /> Generating link preview...
                            </div>
                        )}
                        {linkPreview && !isFetchingLink && (
                            <div className="relative mt-2 mb-2 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900/50 flex items-center gap-3 pr-3 group animate-in zoom-in-95 duration-300">
                                <button 
                                    onClick={() => setLinkPreview(null)}
                                    className="absolute top-1.5 right-1.5 p-1 bg-slate-800/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-slate-800"
                                >
                                    <X size={12} />
                                </button>
                                {linkPreview.image_url ? (
                                    <img src={linkPreview.image_url} alt="preview" className="w-16 h-16 object-cover border-r border-slate-200 dark:border-slate-700" />
                                ) : (
                                    <div className="w-16 h-16 bg-slate-200 dark:bg-slate-800 flex items-center justify-center border-r border-slate-200">
                                        <LinkIcon size={20} className="text-slate-400" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0 py-2">
                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{linkPreview.title}</p>
                                    <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest truncate mt-0.5">{linkPreview.domain}</p>
                                </div>
                            </div>
                        )}

                        {postError && (
                            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl flex items-start gap-2 text-xs font-semibold animate-in slide-in-from-top-2">
                                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                                <p>{postError}</p>
                            </div>
                        )}

                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    <ShieldAlert size={14} className={isDemo ? "text-rose-500" : "text-emerald-500"} />
                                    <span className="hidden sm:inline">{isDemo ? "S.H.I.E.L.D. SECURE COMMS" : "PDPA Guard Active"}</span>
                                </div>
                            </div>
                            
                            <button 
                                onClick={handlePostSubmit}
                                disabled={!draftPost.trim() || isPosting}
                                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md"
                            >
                                {isPosting ? <><Loader2 size={14} className="animate-spin" /> Analyzing...</> : <><Sparkles size={14} /> Post & Enhance</>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* THE FEED STREAM */}
            <div className="space-y-5">
                {displayPosts.map((post, index) => {
                    const theme = getColorTheme(post.category);
                    const categoryConfig = CATEGORIES[post.category] || CATEGORIES.ALL;

                    return (
                        <div key={post.id || index} className="bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow">
                            
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
                                    {post.ai_enhancements.tldr && (
                                        <p className={`text-sm font-bold ${theme.text}`}>{post.ai_enhancements.tldr}</p>
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
                            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-4 whitespace-pre-wrap">
                                {post.raw_text}
                            </p>

                            {/* Database Saved Image (if any) */}
                            {post.image_url && !post.external_link?.image_url && (
                                <div className="mb-4 rounded-2xl overflow-hidden border border-slate-200">
                                    <img src={post.image_url} alt="attachment" className="w-full h-auto max-h-[350px] object-cover" />
                                </div>
                            )}

                            {/* 🌟 RENDER THE SCRAPED EXTERNAL LINK CARD */}
                            {post.external_link && (
                                <a href={post.external_link.url} target="_blank" rel="noreferrer" className="flex items-stretch overflow-hidden mb-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors group">
                                    {post.external_link.image_url ? (
                                        <img src={post.external_link.image_url} alt="preview" className="w-24 h-full object-cover border-r border-slate-200" />
                                    ) : (
                                        <div className="w-16 flex items-center justify-center bg-indigo-50 border-r border-slate-200 text-indigo-400">
                                            <ExternalLink size={20} />
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0 p-3 flex flex-col justify-center">
                                        <p className="text-sm font-bold text-slate-800 truncate">{post.external_link.title}</p>
                                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest truncate mt-0.5">{post.external_link.domain}</p>
                                    </div>
                                </a>
                            )}

                            {/* Interactions */}
                            <div className="flex items-center gap-6 pt-4 border-t border-slate-100">
                                <button className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors">
                                    <ThumbsUp size={16} /> {post.likes || 0}
                                </button>
                                <button className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors">
                                    <MessageSquare size={16} /> {post.comments || 0}
                                </button>
                            </div>

                        </div>
                    );
                })}
            </div>
            <div className="h-24" />
        </div>
    );
};

export default FeedsView;
