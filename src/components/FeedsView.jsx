import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, MessageSquare, ThumbsUp, Share2, ShieldAlert, Calendar, Link as LinkIcon, ExternalLink, Image as ImageIcon, Loader2, AlertTriangle, X, Send, MoreHorizontal, Edit2, Trash2 } from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import { db, storage } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, increment, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

const CATEGORIES = {
    ALL: { id: 'ALL', label: 'All Feeds', icon: '🌍', color: 'slate' },
    BOOKWORM: { id: 'BOOKWORM', label: 'Bookworm', icon: '🐛', color: 'emerald', desc: 'Clinical & Science' },
    SOCIAL_BUTTERFLY: { id: 'SOCIAL_BUTTERFLY', label: 'Social Butterfly', icon: '🦋', color: 'purple', desc: 'Team & Culture' },
    BLUE_BEETLE: { id: 'BLUE_BEETLE', label: 'Blue Beetle', icon: '🪲', color: 'blue', desc: 'Tech & Ops' },
    BUSY_BEE: { id: 'BUSY_BEE', label: 'Busy Bee', icon: '🐝', color: 'amber', desc: 'Growth & Upskilling' }
};

// --- MOCK DATA ---
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
    }
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
];

const CommentSection = ({ postId, user, isMock, postAuthor }) => {
    const [comments, setComments] = useState([]);
    const [draft, setDraft] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

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
        
        if (isMock) {
            setComments(prev => [...prev, { id: Date.now().toString(), author: user?.name || 'You', text: draft }]);
            setDraft('');
            return;
        }

        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'feed_posts', postId, 'comments'), {
                author: user?.name || 'Staff Member',
                text: draft,
                timestamp: serverTimestamp()
            });
            await updateDoc(doc(db, 'feed_posts', postId), { comments: increment(1) });
            
            const commenterName = user?.name || 'Staff Member';
            if (postAuthor !== commenterName) {
                await addDoc(collection(db, 'notifications'), {
                    recipient: postAuthor,
                    sender: commenterName,
                    type: 'COMMENT',
                    postId: postId,
                    preview: draft.substring(0, 40) + '...',
                    read: false,
                    timestamp: serverTimestamp()
                });
            }
            setDraft(''); 
        } catch (error) { console.error("Error posting comment:", error); } 
        finally { setIsSubmitting(false); }
    };

    return (
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 animate-in slide-in-from-top-2 fade-in duration-200">
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
            <form onSubmit={handleSubmit} className="flex gap-2 items-center">
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-black shrink-0">
                    {user?.name ? user.name.charAt(0) : 'U'}
                </div>
                <input type="text" placeholder="Write a comment..." value={draft} onChange={(e) => setDraft(e.target.value)} disabled={isSubmitting} className="flex-1 bg-slate-100 dark:bg-slate-900 border-none text-sm rounded-full px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 dark:text-slate-200 disabled:opacity-60 transition-all" />
                <button type="submit" disabled={!draft.trim() || isSubmitting} className="text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 p-2 rounded-full transition-colors">
                    {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
            </form>
        </div>
    );
};

const FeedsView = ({ user }) => {
    const { isDemo } = useNexus();
    const [activeFilter, setActiveFilter] = useState('ALL');
    const [draftPost, setDraftPost] = useState('');
    
    const [livePosts, setLivePosts] = useState([]);
    const [isPosting, setIsPosting] = useState(false);
    const [postError, setPostError] = useState(null);
    const [likedPosts, setLikedPosts] = useState(new Set());
    const [openComments, setOpenComments] = useState(new Set());

    const [editingPostId, setEditingPostId] = useState(null);
    const [activeMenuId, setActiveMenuId] = useState(null);

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
            if (!linkPreview || linkPreview.url !== detectedUrl) fetchLinkPreview(detectedUrl);
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
        if (!draftPost.trim() && !selectedImage && !imagePreviewUrl) return; 
        setIsPosting(true); setPostError(null);
        try {
            let uploadedImageUrl = null;
            if (selectedImage) {
                const imageRef = ref(storage, `feed_images/${Date.now()}_${selectedImage.name}`);
                const uploadTask = await uploadBytesResumable(imageRef, selectedImage);
                uploadedImageUrl = await getDownloadURL(uploadTask.ref);
            }

            // 🌟 PRIVACY FIX: Auto-scrub job grades inside parentheses from the user's role
            const rawRole = user?.title || user?.role || 'Clinical Staff';
            const cleanRole = rawRole.replace(/\s*\(.*?\)/g, '').trim();

            const functions = getFunctions(undefined, 'us-central1'); 
            const processFeedPost = httpsCallable(functions, 'processFeedPost');
            const response = await processFeedPost({
                rawText: draftPost || "[Image Post]",
                authorName: user?.name || (isDemo ? 'S.H.I.E.L.D. Agent' : 'Staff Member'),
                authorRole: cleanRole, // Cleaned title sent to DB
                isDemo: isDemo,
                externalLink: linkPreview,
                imageUrl: uploadedImageUrl || (editingPostId ? combinedPosts.find(p=>p.id===editingPostId)?.image_url : null),
                postId: editingPostId
            });

            if (response.data.success) {
                cancelEditSetup();
            } else { setPostError(response.data.feedback); }
        } catch (error) { setPostError("Failed to connect to AURA. Check your connection."); } finally { setIsPosting(false); }
    };

    const handleDeletePost = async (postId) => {
        if (window.confirm("Are you sure you want to delete this post? This cannot be undone.")) {
            setActiveMenuId(null);
            try { await deleteDoc(doc(db, 'feed_posts', postId)); } 
            catch (error) { console.error("Error deleting post:", error); }
        }
    };

    const startEditPost = (post) => {
        setActiveMenuId(null); setEditingPostId(post.id); setDraftPost(post.raw_text || '');
        setLinkPreview(post.external_link || null); setImagePreviewUrl(post.image_url || null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const cancelEditSetup = () => {
        setEditingPostId(null); setDraftPost(''); setLinkPreview(null); setSelectedImage(null); setImagePreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleLike = async (postId) => {
        if (likedPosts.has(postId)) return;
        setLikedPosts(prev => new Set(prev).add(postId));
        if (String(postId).startsWith('m') || String(postId).startsWith('live')) return;
        
        try { 
            await updateDoc(doc(db, 'feed_posts', postId), { likes: increment(1) }); 
            const post = combinedPosts.find(p => p.id === postId);
            const likerName = user?.name || 'Staff Member';

            if (post && post.author !== likerName) {
                await addDoc(collection(db, 'notifications'), {
                    recipient: post.author,
                    sender: likerName,
                    type: 'LIKE',
                    postId: postId,
                    read: false,
                    timestamp: serverTimestamp()
                });
            }
        } 
        catch (error) { setLikedPosts(prev => { const newSet = new Set(prev); newSet.delete(postId); return newSet; }); }
    };

    const toggleComments = (postId) => {
        setOpenComments(prev => { const newSet = new Set(prev); if (newSet.has(postId)) newSet.delete(postId); else newSet.add(postId); return newSet; });
    };

    // 🌟 SHARE FIX: Native Mobile Sharing or Clipboard Fallback
    const handleShare = async (post) => {
        const shareText = `Check out this update from ${post.author} on NEXUS:\n\n${post.raw_text || '[Image Attachment]'}`;
        if (navigator.share) {
            try { await navigator.share({ title: 'NEXUS Update', text: shareText }); } 
            catch (error) { console.log('Share canceled'); }
        } else {
            navigator.clipboard.writeText(shareText);
            alert("Post text copied to clipboard!");
        }
    };

    const getColorTheme = (categoryKey) => {
        const color = CATEGORIES[categoryKey]?.color || 'slate';
        return { bg: `bg-${color}-50 dark:bg-${color}-900/20`, border: `border-${color}-200 dark:border-${color}-800/50`, text: `text-${color}-700 dark:text-${color}-400`, lightBg: `bg-${color}-100 dark:bg-${color}-800/40` };
    };

    return (
        <div className="w-full max-w-[900px] mx-auto p-4 md:p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* COMPOSER */}
            <div className={`bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-sm border relative overflow-hidden transition-all duration-300 ${editingPostId ? 'border-amber-400 ring-4 ring-amber-400/10' : 'border-slate-200 dark:border-slate-700'}`}>
                {editingPostId && (
                    <div className="flex justify-between items-center mb-3 pb-3 border-b border-slate-100 dark:border-slate-700">
                        <span className="text-xs font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1.5"><Edit2 size={14}/> Editing Post</span>
                        <button onClick={cancelEditSetup} className="text-xs font-bold text-slate-400 hover:text-slate-600">Cancel</button>
                    </div>
                )}
                <div className="flex gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${isDemo ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}`}>
                        {user?.name ? user.name.charAt(0) : (isDemo ? 'S' : 'U')}
                    </div>
                    <div className="flex-1 space-y-3">
                        <textarea value={draftPost} onChange={(e) => setDraftPost(e.target.value)} disabled={isPosting} placeholder={isDemo ? "Share combat data, team shoutouts, or S.H.I.E.L.D updates..." : "Share a clinical insight, team shoutout, or update..."} className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl p-4 text-sm text-slate-700 dark:text-slate-200 outline-none resize-none border border-slate-100 dark:border-slate-700 focus:border-indigo-300 dark:focus:border-indigo-600 transition-colors h-24 disabled:opacity-60" />
                        
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
                            </div>
                            <button onClick={handlePostSubmit} disabled={(!draftPost.trim() && !selectedImage && !imagePreviewUrl) || isPosting} className={`flex items-center gap-2 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${editingPostId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                                {isPosting ? <><Loader2 size={14} className="animate-spin" /> Analyzing...</> : <><Sparkles size={14} /> {editingPostId ? 'Update Post' : 'Post & Enhance'}</>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* FILTERS */}
            <div className="flex gap-3 overflow-x-auto scrollbar-hide py-2">
                {Object.values(CATEGORIES).map(cat => (
                    <button key={cat.id} onClick={() => setActiveFilter(cat.id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-sm font-bold transition-all shrink-0 shadow-sm ${activeFilter === cat.id ? `bg-${cat.color}-100 dark:bg-${cat.color}-900/40 border-${cat.color}-300 text-${cat.color}-700 dark:text-${cat.color}-300` : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                        <span className="text-lg">{cat.icon}</span>
                        <div className="flex flex-col items-start text-left">
                            <span className="leading-none">{cat.label}</span>
                            {cat.desc && <span className="text-[9px] font-medium opacity-70 mt-0.5">{cat.desc}</span>}
                        </div>
                    </button>
                ))}
            </div>

            {/* FEED STREAM */}
            <div className="space-y-5">
                {displayPosts.map((post, index) => {
                    const theme = getColorTheme(post.category);
                    const categoryConfig = CATEGORIES[post.category] || CATEGORIES.ALL;
                    const isMock = String(post.id).startsWith('m') || String(post.id).startsWith('live');
                    const isAuthor = user?.name ? user.name === post.author : post.author === 'Staff Member';

                    return (
                        <div key={post.id || index} className="bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow animate-in fade-in zoom-in-95 duration-300">
                            
                            <div className="flex justify-between items-start mb-4 relative">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm ${post.avatar}`}>{post.author.charAt(0)}</div>
                                    <div><h3 className="font-bold text-slate-800 dark:text-slate-100">{post.author}</h3><p className="text-[10px] font-bold text-slate-400 uppercase">{post.role} • {post.timestamp}</p></div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black ${theme.bg} ${theme.text} border ${theme.border}`}>
                                        <span>{categoryConfig.icon}</span> <span className="hidden sm:inline">{categoryConfig.label}</span>
                                    </div>
                                    {isAuthor && !isMock && (
                                        <div className="relative">
                                            <button onClick={() => setActiveMenuId(activeMenuId === post.id ? null : post.id)} className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors">
                                                <MoreHorizontal size={18} />
                                            </button>
                                            {activeMenuId === post.id && (
                                                <div className="absolute right-0 mt-2 w-36 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-20 animate-in zoom-in-95 duration-100">
                                                    <button onClick={() => startEditPost(post)} className="w-full px-4 py-2.5 text-xs font-bold text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"><Edit2 size={14}/> Edit Post</button>
                                                    <div className="h-px w-full bg-slate-100"></div>
                                                    <button onClick={() => handleDeletePost(post.id)} className="w-full px-4 py-2.5 text-xs font-bold text-left text-red-600 hover:bg-red-50 flex items-center gap-2"><Trash2 size={14}/> Delete</button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {post.ai_enhancements && (
                                <div className={`mb-4 p-3 rounded-xl ${theme.bg} border ${theme.border} flex flex-col gap-2`}>
                                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest opacity-70"><Sparkles size={12} /> AURA Extraction</div>
                                    {post.ai_enhancements.urgency && post.ai_enhancements.urgency === 'HIGH' && (<div className="text-xs font-black text-red-600 dark:text-red-400 uppercase flex items-center gap-1"><ShieldAlert size={14} /> CRITICAL UPDATE</div>)}
                                    {post.ai_enhancements.tldr && (<p className={`text-sm font-bold ${theme.text}`}>{post.ai_enhancements.tldr}</p>)}
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {post.ai_enhancements.tags?.map(tag => (<span key={tag} className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${theme.lightBg} ${theme.text}`}>#{tag}</span>))}
                                    </div>
                                </div>
                            )}

                            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-4 whitespace-pre-wrap">{post.raw_text}</p>

                            {post.image_url && !post.external_link?.image_url && (
                                <div className="mb-4 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700/80 bg-slate-100 dark:bg-slate-900 group">
                                    <img src={post.image_url} alt="Post attachment" className="w-full h-auto max-h-[350px] object-cover group-hover:scale-[1.02] transition-transform duration-700" loading="lazy" />
                                </div>
                            )}
                            {post.external_link && (
                                <a href={post.external_link.url} target="_blank" rel="noreferrer" className="flex items-stretch overflow-hidden mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 transition-colors group">
                                    {post.external_link.image_url ? (<img src={post.external_link.image_url} alt="preview" className="w-24 h-full object-cover border-r border-slate-200 dark:border-slate-700" />) : (<div className="w-16 flex items-center justify-center bg-indigo-50 dark:bg-indigo-900/30 border-r border-slate-200 text-indigo-400"><ExternalLink size={20} /></div>)}
                                    <div className="flex-1 min-w-0 p-3 flex flex-col justify-center">
                                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{post.external_link.title}</p>
                                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest truncate mt-0.5">{post.external_link.domain}</p>
                                    </div>
                                </a>
                            )}

                            <div className="flex items-center gap-6 pt-4 border-t border-slate-100 dark:border-slate-700">
                                <button onClick={() => handleLike(post.id)} className={`flex items-center gap-2 text-xs font-bold transition-colors group ${likedPosts.has(post.id) ? 'text-indigo-600' : 'text-slate-500 hover:text-indigo-600'}`}>
                                    <div className={`p-1.5 rounded-full transition-colors ${likedPosts.has(post.id) ? 'bg-indigo-100 dark:bg-indigo-900/50' : 'group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30'}`}>
                                        <ThumbsUp size={16} className={likedPosts.has(post.id) ? 'fill-indigo-600' : ''} />
                                    </div>
                                    {(post.likes || 0) + ((likedPosts.has(post.id) && isMock) ? 1 : 0)}
                                </button>
                                
                                <button onClick={() => toggleComments(post.id)} className={`flex items-center gap-2 text-xs font-bold transition-colors group ${openComments.has(post.id) ? 'text-indigo-600' : 'text-slate-500 hover:text-indigo-600'}`}>
                                    <div className={`p-1.5 rounded-full transition-colors ${openComments.has(post.id) ? 'bg-indigo-100 dark:bg-indigo-900/50' : 'group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30'}`}>
                                        <MessageSquare size={16} />
                                    </div>
                                    {post.comments || 0}
                                </button>
                                
                                {/* 🌟 WIRED UP SHARE BUTTON */}
                                <button onClick={() => handleShare(post)} className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors group ml-auto">
                                    <Share2 size={16} />
                                </button>
                            </div>

                            {openComments.has(post.id) && (
                                <CommentSection postId={post.id} user={user} isMock={isMock} postAuthor={post.author} />
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="h-24" />
        </div>
    );
};

export default FeedsView;
