import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, MessageSquare, ThumbsUp, Share2, ShieldAlert, Calendar, Link as LinkIcon, ExternalLink, Image as ImageIcon, Loader2, AlertTriangle, X, Send } from 'lucide-react';
import { useNexus } from '../context/NexusContext';

// 🌟 FIREBASE IMPORTS 
import { db, storage } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, increment, addDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

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
        id: 'live1', author: 'Alif', role: 'Lead CEP', avatar: 'bg-emerald-100 text-emerald-700', timestamp: '1 hour ago', category: 'BOOKWORM',
        raw_text: "The ACSM just released their updated position stand on resistance training. It is an excellent review on volume and intensity modulation. A must-read as we refine our exercise prescription protocols.",
        ai_enhancements: { tldr: "Updated ACSM resistance training guidelines published. Key reading for exercise prescription protocols.", tags: ['ACSM', 'RESISTANCE TRAINING', 'CLINICAL GUIDELINES'] },
        image_url: "https://cdn.fs.pathlms.com/mjxJF5l5R9yASZy09BFC/convert?cache=true&fit=scale&format=jpeg&h=192&quality=100&w=1056",
        external_link: { title: "ACSM Position Stand on Resistance Training", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/", domain: "ncbi.nlm.nih.gov" },
        likes: 14, comments: 3
    },
    {
        id: 'live2', author: 'Nisa', role: 'Admin', avatar: 'bg-purple-100 text-purple-700', timestamp: '3 hours ago', category: 'SOCIAL_BUTTERFLY',
        raw_text: "Where is your battery at today? Are you thriving or just surviving? We've updated our NEXUS dashboard to reflect both Physical and Emotional capacity based on this great visual framework. Remember to check in with yourselves and your colleagues!",
        ai_enhancements: { tldr: "NEXUS dashboard updated to track both emotional and physical social batteries. Reminder to check in.", tags: ['WELLBEING', 'MENTAL HEALTH', 'TEAM CULTURE'] },
        image_url: "https://scontent.fsin16-1.fna.fbcdn.net/v/t39.30808-6/491984873_1432622474740958_7072550564777468896_n.jpg?_nc_cat=106&ccb=1-7&_nc_sid=7b2446&_nc_ohc=oSToMNVh2bMQ7kNvwHW3gB0&_nc_oc=Adn-wXZpqFpnoosYvx7nFZARJyn4tQZYnPAQyqo3LPxWV9eNbkFFEDX50eGXiYtpizY&_nc_zt=23&_nc_ht=scontent.fsin16-1.fna&_nc_gid=9-zsViGSoTRHOdmsv6U6sg&_nc_ss=8&oh=00_AfwGc05Ki4j8-cz6KOSHY2314sgveI-WxjZ9yqpE4kPeJA&oe=69BE2F2D",
        external_link: { title: "Social Battery: Emotional & Physical Matrix", url: "https://www.facebook.com/SocialButterflyCCS/posts/wheres-your-battery-at-today-are-you-thriving-or-just-surviving-this-visual-repr/1405645187438687/", domain: "facebook.com" },
        likes: 42, comments: 8
    },
    {
        id: 'live3', author: 'Linder', role: 'CEP Edu Lead', avatar: 'bg-amber-100 text-amber-700', timestamp: '5 hours ago', category: 'BUSY_BEE',
        raw_text: "Highly recommend looking into the Active Health Lab's CALM (Combat Age-Related Loss of Muscle) program. It has fantastic insights on protein intake interventions specifically for our menopausal patients. Great structured approach we can learn from.",
        ai_enhancements: { tldr: "Recommendation to review the CALM program for interventions on muscle loss and protein intake in menopausal patients.", tags: ['CALM', 'MENOPAUSE', 'NUTRITION'] },
        external_link: { title: "Combat Age-Related Loss of Muscle (CALM)", url: "https://www.activesgcircle.gov.sg/activehealth/our-programmes?filter=just_getting_started&slide=combat-age-related-loss-of-muscle-calm-10-20", domain: "activesgcircle.gov.sg" },
        likes: 21, comments: 4
    },
    {
        id: 'live4', author: 'A/Prof. Ashik', role: 'HOD / HOS', avatar: 'bg-blue-100 text-blue-700', timestamp: '1 day ago', category: 'BLUE_BEETLE',
        raw_text: "Anthropic just launched a series of free AI courses on Skilljar. Given our strong push towards integrating smart tools like AURA into our workflow, I highly encourage everyone to take a look and upskill on prompt engineering.",
        ai_enhancements: { urgency: 'NORMAL', tldr: "HOD encourages staff to utilize free Anthropic AI courses to improve prompt engineering skills.", tags: ['AI TRAINING', 'ANTHROPIC', 'UPSKILLING'] },
        image_url: "https://media.licdn.com/dms/image/v2/D4D22AQHJt-AY4ezgmQ/feedshare-shrink_1280/B4DZlH8964JUAs-/0/1757848791179?e=1775088000&v=beta&t=lGHqjFMc5FjmVFUtshZvDJfZ81HrQKZW7rCFb68xP2o",
        external_link: { title: "Anthropic Educational Courses", url: "https://anthropic.skilljar.com/", domain: "anthropic.skilljar.com" },
        likes: 38, comments: 5
    }
];

// --- MARVEL DEMO DATA 🦸‍♂️ ---
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

// 🌟 PHASE 1: THE COMMENT COMPONENT 🌟
const CommentSection = ({ postId, user, isMock }) => {
    const [comments, setComments] = useState([]);
    const [draft, setDraft] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch live comments if it's a real database post
    useEffect(() => {
        if (isMock) return; 
        const q = query(collection(db, 'feed_posts', postId, 'comments'), orderBy('timestamp', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setComments(fetched);
        });
        return () => unsubscribe();
    }, [postId, isMock]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!draft.trim()) return;

        // If it's a Marvel/Hospital mock post, just fake the comment instantly
        if (isMock) {
            setComments(prev => [...prev, { id: Date.now().toString(), author: user?.name || 'You', text: draft }]);
            setDraft('');
            return;
        }

        setIsSubmitting(true);
        try {
            // 1. Save the comment to the subcollection
            await addDoc(collection(db, 'feed_posts', postId, 'comments'), {
                author: user?.name || 'Staff Member',
                text: draft,
                timestamp: serverTimestamp()
            });
            // 2. Tell the main post to +1 its comment counter
            await updateDoc(doc(db, 'feed_posts', postId), {
                comments: increment(1)
            });
            setDraft(''); // Clear input
        } catch (error) {
            console.error("Error posting comment:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 animate-in slide-in-from-top-2 fade-in duration-200">
            {/* The Comment Thread */}
            <div className="space-y-3 max-h-48 overflow-y-auto pr-2 scrollbar-thin mb-3">
                {comments.length === 0 ? (
                    <p className="text-xs text-slate-400 italic text-center py-2">No comments yet. Start the conversation!</p>
                ) : (
                    comments.map(c => (
                        <div key={c.id} className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl w-fit min-w-[60%]">
                            <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">{c.author}</p>
                            <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{c.text}</p>
                        </div>
                    ))
                )}
            </div>

            {/* The Input Box */}
            <form onSubmit={handleSubmit} className="flex gap-2 items-center">
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-black shrink-0">
                    {user?.name ? user.name.charAt(0) : 'U'}
                </div>
                <input
                    type="text"
                    placeholder="Write a comment..."
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={isSubmitting}
                    className="flex-1 bg-slate-100 dark:bg-slate-900 border-none text-sm rounded-full px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 dark:text-slate-200 disabled:opacity-60 transition-all"
                />
                <button 
                    type="submit" 
                    disabled={!draft.trim() || isSubmitting} 
                    className="text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 p-2 rounded-full transition-colors"
                >
                    {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
            </form>
        </div>
    );
};

// --- MAIN FEED COMPONENT ---
const FeedsView = ({ user }) => {
    const { isDemo } = useNexus();
    const [activeFilter, setActiveFilter] = useState('ALL');
    const [draftPost, setDraftPost] = useState('');
    
    // LIVE STATE
    const [livePosts, setLivePosts] = useState([]);
    const [isPosting, setIsPosting] = useState(false);
    const [postError, setPostError] = useState(null);
    const [likedPosts, setLikedPosts] = useState(new Set());
    
    // 🌟 STATE: WHICH COMMENTS ARE OPEN?
    const [openComments, setOpenComments] = useState(new Set());

    // MEDIA STATE
    const [linkPreview, setLinkPreview] = useState(null);
    const [isFetchingLink, setIsFetchingLink] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const matches = draftPost.match(urlRegex);
        if (matches && matches.length > 0) {
            const detectedUrl = matches[0];
            if (!linkPreview || linkPreview.url !== detectedUrl) {
                fetchLinkPreview(detectedUrl);
            }
        }
    }, [draftPost]);

    const fetchLinkPreview = async (url) => {
        setIsFetchingLink(true);
        try {
            const response = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`);
            const data = await response.json();
            if (data.status === 'success') {
                setLinkPreview({ title: data.data.title || 'Shared Link', domain: data.data.publisher || new URL(url).hostname, url: url, image_url: data.data.image?.url || null });
            }
        } catch (error) { console.error("Failed to fetch link preview"); } finally { setIsFetchingLink(false); }
    };

    const handleImageSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) { setPostError("Image too large. Limit 5MB."); return; }
            setSelectedImage(file); setImagePreviewUrl(URL.createObjectURL(file));
        }
    };

    useEffect(() => {
        const q = query(collection(db, 'feed_posts'), orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedPosts = snapshot.docs.map(doc => {
                const data = doc.data();
                let timeString = 'Just now';
                if (data.timestamp?.toDate) { timeString = data.timestamp.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
                return { id: doc.id, ...data, timestamp: timeString, avatar: 'bg-indigo-100 text-indigo-700' };
            });
            setLivePosts(fetchedPosts);
        });
        return () => unsubscribe();
    }, []);

    const baseDataset = isDemo ? DEMO_MOCK_POSTS : LIVE_MOCK_POSTS;
    const filteredDbPosts = livePosts.filter(p => p.isDemo === isDemo);
    const combinedPosts = [...filteredDbPosts, ...baseDataset];
    const displayPosts = activeFilter === 'ALL' ? combinedPosts : combinedPosts.filter(post => post.category === activeFilter);

    const handlePostSubmit = async () => {
        if (!draftPost.trim() && !selectedImage) return; 
        setIsPosting(true); setPostError(null);
        try {
            let uploadedImageUrl = null;
            if (selectedImage) {
                const imageRef = ref(storage, `feed_images/${Date.now()}_${selectedImage.name}`);
                const uploadTask = await uploadBytesResumable(imageRef, selectedImage);
                uploadedImageUrl = await getDownloadURL(uploadTask.ref);
            }
            const functions = getFunctions(undefined, 'us-central1'); 
            const processFeedPost = httpsCallable(functions, 'processFeedPost');
            const response = await processFeedPost({
                rawText: draftPost || "[Image Post]",
                authorName: user?.name || (isDemo ? 'S.H.I.E.L.D. Agent' : 'Staff Member'),
                authorRole: user?.title || user?.role || 'Clinical Staff',
                isDemo: isDemo,
                externalLink: linkPreview,
                imageUrl: uploadedImageUrl
            });
            if (response.data.success) {
                setDraftPost(''); setLinkPreview(null); setSelectedImage(null); setImagePreviewUrl(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
            } else { setPostError(response.data.feedback); }
        } catch (error) { setPostError("Failed to post. Check your connection."); } finally { setIsPosting(false); }
    };

    const handleLike = async (postId) => {
        if (likedPosts.has(postId)) return;
        setLikedPosts(prev => new Set(prev).add(postId));
        if (String(postId).startsWith('m') || String(postId).startsWith('live')) return;
        try { await updateDoc(doc(db, 'feed_posts', postId), { likes: increment(1) }); } 
        catch (error) { setLikedPosts(prev => { const newSet = new Set(prev); newSet.delete(postId); return newSet; }); }
    };

    // 🌟 TOGGLE COMMENTS VISIBILITY
    const toggleComments = (postId) => {
        setOpenComments(prev => {
            const newSet = new Set(prev);
            if (newSet.has(postId)) newSet.delete(postId);
            else newSet.add(postId);
            return newSet;
        });
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
                            className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl p-4 text-sm text-slate-700 dark:text-slate-200 outline-none resize-none border border-slate-100 dark:border-slate-700 focus:border-indigo-300 dark:focus:border-indigo-600 transition-colors h-24 disabled:opacity-60"
                        />
                        {imagePreviewUrl && (
                            <div className="relative mt-2 mb-2 w-fit rounded-xl overflow-hidden border border-slate-200 shadow-sm animate-in zoom-in-95">
                                <button onClick={() => { setSelectedImage(null); setImagePreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="absolute top-1.5 right-1.5 p-1 bg-slate-900/70 text-white rounded-full hover:bg-slate-900 transition-colors z-10"><X size={14} /></button>
                                <img src={imagePreviewUrl} alt="Upload preview" className="h-32 w-auto object-cover" />
                            </div>
                        )}
                        {isFetchingLink && <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 animate-pulse px-2"><LinkIcon size={12} /> Generating preview...</div>}
                        {linkPreview && !isFetchingLink && (
                            <div className="relative mt-2 mb-2 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 flex items-center gap-3 pr-3 group">
                                <button onClick={() => setLinkPreview(null)} className="absolute top-1.5 right-1.5 p-1 bg-slate-800/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"><X size={12} /></button>
                                {linkPreview.image_url ? <img src={linkPreview.image_url} alt="preview" className="w-16 h-16 object-cover border-r border-slate-200" /> : <div className="w-16 h-16 bg-slate-200 flex items-center justify-center border-r border-slate-200"><LinkIcon size={20} className="text-slate-400" /></div>}
                                <div className="flex-1 min-w-0 py-2">
                                    <p className="text-xs font-bold text-slate-800 truncate">{linkPreview.title}</p>
                                    <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest truncate mt-0.5">{linkPreview.domain}</p>
                                </div>
                            </div>
                        )}
                        {postError && <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl flex items-start gap-2 text-xs font-semibold animate-in slide-in-from-top-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" /><p>{postError}</p></div>}
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    <ShieldAlert size={14} className={isDemo ? "text-rose-500" : "text-emerald-500"} />
                                    <span className="hidden sm:inline">{isDemo ? "S.H.I.E.L.D. SECURE COMMS" : "PDPA Guard Active"}</span>
                                </div>
                                <input type="file" accept="image/png, image/jpeg, image/jpg, image/webp" className="hidden" ref={fileInputRef} onChange={handleImageSelect} />
                                <button onClick={() => fileInputRef.current.click()} disabled={isPosting} className="p-1.5 text-slate-400 hover:text-indigo-500 transition-colors rounded-lg hover:bg-slate-100 disabled:opacity-50"><ImageIcon size={18} /></button>
                                <button className="p-1.
