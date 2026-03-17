import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, MessageSquare, ThumbsUp, Share2, ShieldAlert, Link as LinkIcon, ExternalLink, Image as ImageIcon, Loader2, AlertTriangle, X, Send, MoreHorizontal, Edit2, Trash2 } from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import { db, storage } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, increment, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import PostLightbox from './PostLightbox'; // 🌟 Importing the Lightbox

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
        raw_text: "The ACSM just released their updated position stand on resistance training. A must-read as we refine our exercise prescription protocols.",
        ai_enhancements: { tldr: "Updated ACSM resistance training guidelines published.", tags: ['ACSM', 'CLINICAL'] },
        image_url: "https://cdn.fs.pathlms.com/mjxJF5l5R9yASZy09BFC/convert?cache=true&fit=scale&format=jpeg&h=192&quality=100&w=1056",
        external_link: { title: "ACSM Position Stand", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/", domain: "ncbi.nlm.nih.gov" },
        likes: 14, comments: 3
    }
];

const DEMO_MOCK_POSTS = [
    {
        id: 'm1', author: 'Tony Stark', role: 'Head of Engineering', avatar: 'bg-red-100 text-red-700', timestamp: '1 hour ago', category: 'SOCIAL_BUTTERFLY',
        raw_text: "Just docked the Disney Adventure at Marina Bay Cruise Centre! 🇸🇬 Avengers, assemble at the upper deck for the meet-and-greet at 1800 hrs.",
        ai_enhancements: { tldr: "Avengers meet-and-greet on the Disney Adventure at 1800 hrs.", tags: ['SINGAPORE', 'DISNEY'] },
        image_url: "https://cdn1.parksmedia.wdprapps.disney.com/resize/mwImage/1/1000/1000/75/vision-dam/digital/parks-platform/parks-global-assets/disney-cruise-line/ships/adventure/concept-art/Marvel-landing-ca-16x9.jpg?2025-09-30T00:24:43+00:00", 
        external_link: { title: "Disney Adventure", url: "https://disneycruise.disney.go.com/", domain: "disneycruise.com" },
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
            setDraft(''); 
        } catch (error) { console.error(error); } 
        finally { setIsSubmitting(false); }
    };

    return (
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
            <div className="space-y-3 max-h-48 overflow-y-auto pr-2 mb-3">
                {comments.map(c => (
                    <div key={c.id} className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl w-fit min-w-[60%]">
                        <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">{c.author}</p>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{c.text}</p>
                    </div>
                ))}
            </div>
            <form onSubmit={handleSubmit} className="flex gap-2">
                <input type="text" placeholder="Write a comment..." value={draft} onChange={(e) => setDraft(e.target.value)} className="flex-1 bg-slate-100 dark:bg-slate-900 border-none text-sm rounded-full px-4 py-2 outline-none" />
                <button type="submit" disabled={!draft.trim() || isSubmitting} className="text-white bg-indigo-600 p-2 rounded-full"><Send size={16} /></button>
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
    const [selectedPost, setSelectedPost] = useState(null); // 🌟 For Lightbox

    const [editingPostId, setEditingPostId] = useState(null);
    const [activeMenuId, setActiveMenuId] = useState(null);

    const [linkPreview, setLinkPreview] = useState(null);
    const [selectedImage, setSelectedImage] = useState(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
    const fileInputRef = useRef(null);

    // Fetch Feed from Firestore
    useEffect(() => {
        const q = query(collection(db, 'feed_posts'), orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(), 
                timestamp: doc.data().timestamp?.toDate()?.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) || 'Just now'
            }));
            setLivePosts(fetched);
        });
        return () => unsubscribe();
    }, []);

    const baseDataset = isDemo ? DEMO_MOCK_POSTS : LIVE_MOCK_POSTS;
    const filteredDbPosts = livePosts.filter(p => p.isDemo === !!isDemo);
    const combinedPosts = [...filteredDbPosts, ...baseDataset];
    const displayPosts = activeFilter === 'ALL' ? combinedPosts : combinedPosts.filter(post => post.category === activeFilter);

    const handlePostSubmit = async () => {
        if (!draftPost.trim() && !selectedImage) return; 
        setIsPosting(true);
        try {
            let uploadedImageUrl = null;
            if (selectedImage) {
                const imageRef = ref(storage, `feed_images/${Date.now()}_${selectedImage.name}`);
                const uploadTask = await uploadBytesResumable(imageRef, selectedImage);
                uploadedImageUrl = await getDownloadURL(uploadTask.ref);
            }

            const rawRole = user?.title || user?.role || 'Clinical Staff';
            const cleanRole = rawRole.replace(/\s*\(.*?\)/g, '').trim();

            const functions = getFunctions(undefined, 'us-central1'); 
            const processFeedPost = httpsCallable(functions, 'processFeedPost');
            await processFeedPost({
                rawText: draftPost || "",
                authorName: user?.name || 'Staff Member',
                authorRole: cleanRole,
                authorPhotoUrl: user?.photoURL || null, // 🌟 Saving PFP to DB
                isDemo: !!isDemo,
                externalLink: linkPreview,
                imageUrl: uploadedImageUrl,
                postId: editingPostId
            });
            cancelEditSetup();
        } catch (error) { setPostError("AURA Link Unstable."); } finally { setIsPosting(false); }
    };

    const cancelEditSetup = () => {
        setEditingPostId(null); setDraftPost(''); setLinkPreview(null); setSelectedImage(null); setImagePreviewUrl(null);
    };

    const handleShare = async (post) => {
        const shareText = `Check out this NEXUS post from ${post.author}`;
        if (navigator.share) { navigator.share({ title: 'NEXUS', text: shareText }); }
        else { navigator.clipboard.writeText(shareText); alert("Copied!"); }
    };

    const getColorTheme = (categoryKey) => {
        const color = CATEGORIES[categoryKey]?.color || 'slate';
        return { bg: `bg-${color}-50 dark:bg-${color}-900/20`, border: `border-${color}-200 dark:border-${color}-800/50`, text: `text-${color}-700 dark:text-${color}-400`, lightBg: `bg-${color}-100 dark:bg-${color}-800/40` };
    };

    return (
        <div className="w-full max-w-[900px] mx-auto p-4 md:p-6 space-y-6">
            {/* COMPOSER */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-indigo-100 shrink-0">
                        {user?.photoURL ? <img src={user.photoURL} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-indigo-600">{user?.name?.charAt(0)}</div>}
                    </div>
                    <div className="flex-1 space-y-3">
                        <textarea value={draftPost} onChange={(e) => setDraftPost(e.target.value)} placeholder="Share an insight..." className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl p-4 text-sm outline-none border border-slate-100 dark:border-slate-700 h-24" />
                        <div className="flex justify-between items-center">
                            <button onClick={() => fileInputRef.current.click()} className="p-2 text-slate-400"><ImageIcon size={20} /></button>
                            <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => { const f = e.target.files[0]; if(f){ setSelectedImage(f); setImagePreviewUrl(URL.createObjectURL(f)); }}} />
                            <button onClick={handlePostSubmit} disabled={isPosting} className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-xs font-black uppercase">
                                {isPosting ? <Loader2 className="animate-spin" size={14} /> : <><Sparkles size={14} className="inline mr-2" /> Post & Enhance</>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* FEED STREAM */}
            <div className="space-y-5">
                {displayPosts.map((post) => {
                    const theme = getColorTheme(post.category);
                    const isMock = String(post.id).startsWith('m') || String(post.id).startsWith('live');
                    return (
                        <div key={post.id} className="bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100">
                                        {post.authorPhotoUrl || post.author_photo_url ? (
                                            <img src={post.authorPhotoUrl || post.author_photo_url} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center font-bold">{post.author.charAt(0)}</div>
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-bold dark:text-white">{post.author}</h3>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">
                                            {post.role?.replace(/\s*\(.*?\)/g, '')} • {post.timestamp}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div onClick={() => setSelectedPost(post)} className="cursor-pointer">
                                <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-4">{post.raw_text}</p>
                                {post.image_url && <img src={post.image_url} alt="" className="w-full rounded-2xl mb-4 max-h-96 object-cover" />}
                            </div>

                            <div className="flex items-center gap-6 pt-4 border-t border-slate-100 dark:border-slate-700">
                                <button onClick={() => handleLike(post.id)} className="flex items-center gap-2 text-xs font-bold text-slate-500"><ThumbsUp size={16} /> {post.likes || 0}</button>
                                <button onClick={() => toggleComments(post.id)} className="flex items-center gap-2 text-xs font-bold text-slate-500"><MessageSquare size={16} /> {post.comments || 0}</button>
                                <button onClick={() => handleShare(post)} className="ml-auto p-1"><Share2 size={16} /></button>
                            </div>
                            {openComments.has(post.id) && <CommentSection postId={post.id} user={user} isMock={isMock} postAuthor={post.author} />}
                        </div>
                    );
                })}
            </div>

            {selectedPost && (
                <PostLightbox 
                    post={selectedPost} 
                    user={user} 
                    onClose={() => setSelectedPost(null)} 
                    onLike={handleLike}
                    likedPosts={likedPosts}
                    CATEGORIES={CATEGORIES}
                    getColorTheme={getColorTheme}
                />
            )}
        </div>
    );
};

export default FeedsView;
