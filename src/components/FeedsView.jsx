import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, MessageSquare, ThumbsUp, Share2, ShieldAlert, Image as ImageIcon, Loader2, X, Send, MoreHorizontal, Edit2, Trash2 } from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import { useTeam } from '../context/TeamContext';
import { feedPath, feedPostPath } from '../utils/teamPaths';
import { containsNric, NRIC_REFUSAL } from '../utils/nric';
import { db, storage } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, increment, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import PostLightbox from './PostLightbox';

// 🌟 IMPORT THE CUSTOM MODAL
import ConfirmationModal from './ConfirmationModal';

const CATEGORIES = {
    ALL: { id: 'ALL', label: 'All Feeds', icon: '🌍', color: 'slate' },
    BOOKWORM: { id: 'BOOKWORM', label: 'Bookworm', icon: '🐛', color: 'emerald', desc: 'Clinical & Science' },
    SOCIAL_BUTTERFLY: { id: 'SOCIAL_BUTTERFLY', label: 'Social Butterfly', icon: '🦋', color: 'purple', desc: 'Team & Culture' },
    BLUE_BEETLE: { id: 'BLUE_BEETLE', label: 'Blue Beetle', icon: '🪲', color: 'blue', desc: 'Tech & Ops' },
    BUSY_BEE: { id: 'BUSY_BEE', label: 'Busy Bee', icon: '🐝', color: 'amber', desc: 'Growth & Upskilling' }
};

/**
 * `LIVE_MOCK_POSTS` IS GONE — `AN14`, ninth copy, and the worst of the nine.
 *
 * Four fabricated posts, ATTRIBUTED BY NAME AND ROLE TO REAL PEOPLE — the lead,
 * the roster master, the education lead by nickname, and the former Head of
 * Department with his honorific — were merged into the LIVE feed under every real
 * team's posts, for every user, indefinitely. Fake words in real colleagues'
 * mouths, shipped in a public bundle, rendered as though they had posted them.
 *
 * The live feed now shows what people actually posted, including showing nothing,
 * which is the truth on a quiet day. The Marvel demo posts stay: fictional people
 * are what fiction is for.
 */

const DEMO_MOCK_POSTS = [
    { id: 'm1', author: 'Tony Stark', role: 'Head of Engineering', timestamp: '1 hour ago', category: 'SOCIAL_BUTTERFLY', raw_text: "Just docked the Disney Adventure! Avengers, assemble at the upper deck for the VIP meet-and-greet at 1800 hrs.", ai_enhancements: { tldr: "Avengers meet-and-greet on the Disney Adventure at 1800 hrs.", tags: ['TEAM EVENT'] }, image_url: "https://cdn1.parksmedia.wdprapps.disney.com/resize/mwImage/1/1000/1000/75/vision-dam/digital/parks-platform/parks-global-assets/disney-cruise-line/ships/adventure/concept-art/Marvel-landing-ca-16x9.jpg?2025-09-30T00:24:43+00:00", likes: 3000, comments: 412 },
    { id: 'm2', author: 'Peter Parker', role: 'Intern', timestamp: '3 hours ago', category: 'BLUE_BEETLE', raw_text: "Hey everyone! I've updated the web-shooter schematics on the shared drive. Check it out!", ai_enhancements: { tldr: "New web-shooter schematics uploaded.", tags: ['GEAR UPDATE'] }, likes: 890, comments: 55 },
    { id: 'm3', author: 'Nick Fury', role: 'Director', timestamp: '1 day ago', category: 'BUSY_BEE', raw_text: "S.H.I.E.L.D. is hosting a mandatory advanced tactical espionage seminar next month.", ai_enhancements: { tags: ['MANDATORY', 'TRAINING'] }, likes: 89, comments: 0 }
];

// `postAuthor` is still passed by the caller (the post's author is needed for
// any future author-side comment moderation) but nothing here reads it, so it is
// bound to `_postAuthor` rather than deleted from the component's shape.
const CommentSection = ({ postId, user, isMock, postAuthor: _postAuthor }) => {
    // Its own `useTeam` call: this is a separate component from `FeedsView`, and a
    // `teamId` referenced from an enclosing scope it does not have would have been a
    // runtime ReferenceError on every rendered comment thread.
    const { teamId } = useTeam();
    const [comments, setComments] = useState([]);
    const [draft, setDraft] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isMock) return; 
        if (!teamId) return undefined;
        const q = query(collection(db, ...feedPostPath(teamId, postId), 'comments'), orderBy('timestamp', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setComments(fetched);
        });
        return () => unsubscribe();
    }, [postId, isMock, teamId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!draft.trim()) return;
        /**
         * `AN13`. Posts pass through the PDPA guard in `processFeedPost`; comments
         * went straight to Firestore with no screen at all. The deterministic
         * NRIC/FIN check runs here for the SENTENCE (the rules refusal would read
         * as "permission denied") and again in `firestore.rules` for the FENCE —
         * this check is advisory the moment someone modifies their client; the
         * rules one is not. Shape, not checksum, so both layers test the same
         * thing; the reasoning lives in `src/utils/nric.js`.
         */
        if (containsNric(draft)) {
            alert(NRIC_REFUSAL);
            return;
        }
        if (isMock) {
            setComments(prev => [...prev, { id: Date.now().toString(), author: user?.name || 'You', text: draft }]);
            setDraft('');
            return;
        }
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, ...feedPostPath(teamId, postId), 'comments'), { author: user?.name || 'Staff Member', text: draft, timestamp: serverTimestamp() });
            await updateDoc(doc(db, ...feedPostPath(teamId, postId)), { comments: increment(1) });
            setDraft(''); 
        } catch (error) { console.error(error); } finally { setIsSubmitting(false); }
    };

    return (
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 animate-in slide-in-from-top-2 fade-in duration-200">
            <div className="space-y-3 max-h-48 overflow-y-auto pr-2 scrollbar-hide mb-3">
                {comments.map(c => {
                    const commentAvatar = (c.author === user?.name && user?.photoURL) ? user.photoURL : null;
                    return (
                        <div key={c.id} className="flex gap-2">
                            <div className="w-6 h-6 rounded-full overflow-hidden bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-black shrink-0">
                                {commentAvatar ? <img src={commentAvatar} alt="" className="w-full h-full object-cover" /> : c.author.charAt(0)}
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl w-fit min-w-[60%]">
                                <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">{c.author}</p>
                                <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{c.text}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
            <form onSubmit={handleSubmit} className="flex gap-2 items-center">
                <input type="text" placeholder="Write a comment..." value={draft} onChange={(e) => setDraft(e.target.value)} disabled={isSubmitting} className="flex-1 bg-slate-100 dark:bg-slate-900 border-none text-sm rounded-full px-4 py-2 outline-none text-slate-700 dark:text-slate-200" />
                <button type="submit" className="text-white bg-indigo-600 p-2 rounded-full transition-transform active:scale-90"><Send size={16} /></button>
            </form>
        </div>
    );
};

const FeedsView = ({ user }) => {
    // The feed belongs to a department, not to the whole installation: a KKH
    // respiratory therapist's post should not appear on an SGH physiotherapist's
    // wall, and `feed_posts` was one global collection everybody read.
    const { teamId } = useTeam();
    const { isDemo } = useNexus();
    const [activeFilter, setActiveFilter] = useState('ALL');
    const [draftPost, setDraftPost] = useState('');
    const [livePosts, setLivePosts] = useState([]);
    const [isPosting, setIsPosting] = useState(false);
    // DEFECT (left for follow-up, P0.7): `postError` is set to "AURA processing
    // failed." in handlePostSubmit but never rendered, so a failed post is
    // silent. Rendering it is a UI change, not a lint fix.
    // eslint-disable-next-line no-unused-vars -- see the defect note above
    const [postError, setPostError] = useState(null);
    const [likedPosts, setLikedPosts] = useState(new Set());
    const [openComments, setOpenComments] = useState(new Set());
    const [selectedPost, setSelectedPost] = useState(null);

    const [editingPostId, setEditingPostId] = useState(null);
    const [activeMenuId, setActiveMenuId] = useState(null);
    
    // 🌟 STATE: Controls which post is slated for deletion
    const [postToDelete, setPostToDelete] = useState(null);

    // DEFECT (left for follow-up, P0.7): `linkPreview` is populated from
    // `post.external_link` when an edit starts and cleared on cancel, but never
    // rendered — the link-preview card was never built.
    // eslint-disable-next-line no-unused-vars -- see the defect note above
    const [linkPreview, setLinkPreview] = useState(null);
    const [selectedImage, setSelectedImage] = useState(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (!teamId) { setLivePosts([]); return undefined; }
        const q = query(collection(db, ...feedPath(teamId)), orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedPosts = snapshot.docs.map(doc => ({ 
                id: doc.id, ...doc.data(), 
                timestamp: doc.data().timestamp?.toDate()?.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) || 'Just now'
            }));
            setLivePosts(fetchedPosts);
        });
        return () => unsubscribe();
    }, [teamId]);

    const combinedPosts = [...livePosts.filter(p => p.isDemo === !!isDemo), ...(isDemo ? DEMO_MOCK_POSTS : [])];
    const displayPosts = activeFilter === 'ALL' ? combinedPosts : combinedPosts.filter(post => post.category === activeFilter);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('postId') && displayPosts.length > 0) {
            const linkedPost = displayPosts.find(p => p.id === params.get('postId'));
            if (linkedPost) { setSelectedPost(linkedPost); window.history.replaceState({}, document.title, window.location.pathname + "?view=feeds"); }
        }
    }, [displayPosts]);

    const handlePostSubmit = async () => {
        if (!draftPost.trim() && !selectedImage) return;

        /**
         * NO TEAM, NO WALL TO POST TO — SAID HERE RATHER THAN BY A FAILED CALL.
         *
         * The feed a post lands in IS a team (`teams/{teamId}/feed`), including in
         * demo mode: sandbox posts are real documents tagged `isDemo: true` and
         * filtered back out of the live view. So a signed-in user with no team yet
         * — the case the holding screen's sandbox door now creates — has nowhere
         * for this to go. `processFeedPost` refuses a null `teamId` server-side and
         * that refusal is correct, but it arrived here as the generic "AURA
         * processing failed", which blames the AI for a missing team.
         */
        if (!teamId) {
            setPostError('You are not in a team yet, so there is no wall to post to. Everything else in the sandbox works — this one needs a team.');
            return;
        }

        setIsPosting(true); setPostError(null);
        try {
            let uploadedImageUrl = null;
            if (selectedImage) {
                const imageRef = ref(storage, `feed_images/${Date.now()}_${selectedImage.name}`);
                uploadedImageUrl = await getDownloadURL((await uploadBytesResumable(imageRef, selectedImage)).ref);
            }
            const cleanRole = (user?.title || user?.role || 'Clinical Staff').replace(/\s*\(.*?\)/g, '').trim();
            const processFeedPost = httpsCallable(getFunctions(undefined, 'us-central1'), 'processFeedPost');
            // `teamId` decides which feed this lands in. The function re-checks
            // membership rather than trusting it — it runs on the Admin SDK and
            // bypasses the rules, so the argument alone would be a way into another
            // department's wall.
            await processFeedPost({ teamId, rawText: draftPost || "", authorName: user?.name || 'Staff Member', authorRole: cleanRole, authorPhotoUrl: user?.photoURL || null, isDemo: !!isDemo, imageUrl: uploadedImageUrl, postId: editingPostId });
            cancelEditSetup();
        } catch (error) { setPostError("AURA processing failed."); } finally { setIsPosting(false); }
    };

    const cancelEditSetup = () => {
        setEditingPostId(null); setDraftPost(''); setLinkPreview(null); setSelectedImage(null); setImagePreviewUrl(null);
    };

    const startEditPost = (post) => {
        setActiveMenuId(null);
        setEditingPostId(post.id);
        setDraftPost(post.raw_text || '');
        setLinkPreview(post.external_link || null);
        setImagePreviewUrl(post.image_url || null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // 🌟 CUSTOM DELETION LOGIC
    const confirmDeletePost = (postId) => {
        setActiveMenuId(null);
        setPostToDelete(postId); // Opens the modal
    };

    const executeDelete = async () => {
        if (!postToDelete) return;
        try { 
            await deleteDoc(doc(db, ...feedPostPath(teamId, postToDelete))); 
        } catch (error) { 
            console.error("Error deleting post:", error); 
        } finally {
            setPostToDelete(null); // Closes the modal
        }
    };

    const handleShare = async (post) => {
        const postUrl = `${window.location.origin}${window.location.pathname}?view=feeds&postId=${post.id}`;
        
        if (navigator.share) { 
            try { 
                await navigator.share({ 
                    title: `NEXUS Post by ${post.author}`, 
                    text: `Check out this update from ${post.author} on NEXUS FEEDS!`,
                    url: postUrl
                }); 
            } catch (e) { 
                console.error("Share failed", e); 
            } 
        } else { 
            navigator.clipboard.writeText(postUrl); 
            alert("Post link copied to clipboard!"); 
        }
    };

    const handleLike = async (postId) => {
        if (likedPosts.has(postId)) return;
        setLikedPosts(prev => new Set(prev).add(postId));
        if (!String(postId).startsWith('m') && !String(postId).startsWith('live')) {
            try {
                await updateDoc(doc(db, ...feedPostPath(teamId, postId)), { likes: increment(1) });
            } catch (e) {
                // Deliberately ignored: the like is optimistic and local. A failed
                // increment leaves the server count behind by one rather than
                // bouncing the UI back. (Drift is a known, accepted trade-off.)
            }
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
                    <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 bg-indigo-100 flex items-center justify-center font-black text-indigo-600 uppercase">
                        {user?.photoURL ? <img src={user.photoURL} alt="" className="w-full h-full object-cover" /> : <span>{user?.name ? user.name.charAt(0) : 'U'}</span>}
                    </div>
                    <div className="flex-1 space-y-3">
                        <textarea value={draftPost} onChange={(e) => setDraftPost(e.target.value)} disabled={isPosting} placeholder={isDemo ? "Share simulation data..." : "Share a clinical insight..."} className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl p-4 text-sm outline-none border border-slate-100 dark:border-slate-700 h-24 text-slate-700 dark:text-slate-200" />
                        {imagePreviewUrl && (
                            <div className="relative mt-2 mb-2 w-fit rounded-xl overflow-hidden border border-slate-200">
                                <button onClick={() => { setSelectedImage(null); setImagePreviewUrl(null); }} className="absolute top-1 right-1 p-1 bg-slate-900/70 text-white rounded-full"><X size={14} /></button>
                                <img src={imagePreviewUrl} alt="Preview" className="h-32 w-auto object-cover" />
                            </div>
                        )}
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    <ShieldAlert size={14} className={isDemo ? "text-rose-500" : "text-emerald-500"} />
                                    <span>{isDemo ? "Secure Demo" : "PDPA Guard Active"}</span>
                                </div>
                                <button onClick={() => fileInputRef.current.click()} className="p-1.5 text-slate-400 hover:text-indigo-500 transition-colors"><ImageIcon size={20} /></button>
                                <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => { const f = e.target.files[0]; if(f){ setSelectedImage(f); setImagePreviewUrl(URL.createObjectURL(f)); }}} />
                            </div>
                            <button onClick={handlePostSubmit} disabled={isPosting} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all shadow-md flex items-center gap-2">
                                {isPosting ? <Loader2 className="animate-spin" size={14} /> : <><Sparkles size={14} /> {editingPostId ? 'Update Post' : 'Post & Enhance'}</>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* FILTERS */}
            <div className="flex gap-3 overflow-x-auto scrollbar-hide py-2">
                {Object.values(CATEGORIES).map(cat => (
                    <button key={cat.id} onClick={() => setActiveFilter(cat.id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-sm font-bold transition-all shrink-0 shadow-sm ${activeFilter === cat.id ? `bg-${cat.color}-100 dark:bg-${cat.color}-900/40 border-${cat.color}-300 text-${cat.color}-700 dark:text-${cat.color}-300` : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                        <span className="text-lg">{cat.icon}</span> {cat.label}
                    </button>
                ))}
            </div>

            {/* FEED STREAM */}
            <div className="space-y-5">
                {displayPosts.map((post) => {
                    const theme = getColorTheme(post.category);
                    const isMock = String(post.id).startsWith('m') || String(post.id).startsWith('live');
                    
                    const safeUserName = user?.name?.toLowerCase() || '';
                    const safePostAuthor = post?.author?.toLowerCase() || '';
                    const isAuthor = safeUserName && safePostAuthor && (
                        safeUserName.includes(safePostAuthor) || 
                        safePostAuthor.includes(safeUserName) || 
                        post.author === 'Staff Member'
                    );
                    
                    const avatarUrl = (isAuthor && user?.photoURL) ? user.photoURL : (post.authorPhotoUrl || post.author_photo_url);

                    return (
                        <div key={post.id} className="bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 ${avatarUrl ? '' : 'bg-indigo-100 flex items-center justify-center font-black text-indigo-700'}`}>
                                        {avatarUrl ? (
                                            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <span>{post.author?.charAt(0)}</span>
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 dark:text-white">{post.author}</h3>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">
                                            {post.role?.replace(/\s*\(.*?\)/g, '')} • {post.timestamp}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-base ${theme.bg} ${theme.text} border ${theme.border}`} title={CATEGORIES[post.category]?.label}>
                                        {CATEGORIES[post.category]?.icon}
                                    </div>
                                    
                                    {isAuthor && !isMock && (
                                        <div className="relative">
                                            <button onClick={() => setActiveMenuId(activeMenuId === post.id ? null : post.id)} className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
                                                <MoreHorizontal size={18} />
                                            </button>
                                            {activeMenuId === post.id && (
                                                <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden z-20 animate-in zoom-in-95 duration-100">
                                                    <button onClick={() => startEditPost(post)} className="w-full px-4 py-2.5 text-xs font-bold text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"><Edit2 size={14}/> Edit Post</button>
                                                    <div className="h-px w-full bg-slate-100 dark:bg-slate-700"></div>
                                                    {/* 🌟 REPLACED NATIVE FUNCTION WITH confirmDeletePost */}
                                                    <button onClick={() => confirmDeletePost(post.id)} className="w-full px-4 py-2.5 text-xs font-bold text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"><Trash2 size={14}/> Delete</button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div onClick={() => setSelectedPost(post)} className="cursor-pointer group">
                                <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-4 whitespace-pre-wrap">{post.raw_text}</p>
                                {post.image_url && (
                                    <div className="rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-700 mb-4 bg-slate-50 dark:bg-slate-900">
                                        <img src={post.image_url} alt="" className="w-full h-auto max-h-96 object-cover group-hover:scale-[1.01] transition-transform duration-500" />
                                    </div>
                                )}
                            </div>

                            {post.external_link && (
                                <a href={post.external_link.url} target="_blank" rel="noreferrer" className="flex items-stretch overflow-hidden mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 transition-colors group">
                                    {post.external_link.image_url && <img src={post.external_link.image_url} alt="preview" className="w-24 h-full object-cover border-r border-slate-200 dark:border-slate-700" />}
                                    <div className="flex-1 min-w-0 p-3 flex flex-col justify-center">
                                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{post.external_link.title}</p>
                                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest truncate mt-0.5">{post.external_link.domain}</p>
                                    </div>
                                </a>
                            )}

                            <div className="flex items-center gap-6 pt-4 border-t border-slate-100 dark:border-slate-700">
                                <button onClick={() => handleLike(post.id)} className={`flex items-center gap-2 text-xs font-bold ${likedPosts.has(post.id) ? 'text-indigo-600' : 'text-slate-500 hover:text-indigo-600'}`}>
                                    <ThumbsUp size={16} className={likedPosts.has(post.id) ? 'fill-indigo-600' : ''} /> {post.likes || 0}
                                </button>
                                <button onClick={() => setOpenComments(prev => { const newSet = new Set(prev); newSet.has(post.id) ? newSet.delete(post.id) : newSet.add(post.id); return newSet; })} className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-600">
                                    <MessageSquare size={16} /> {post.comments || 0}
                                </button>
                                <button onClick={() => handleShare(post)} className="ml-auto p-1.5 text-slate-400 hover:text-indigo-600">
                                    <Share2 size={16} />
                                </button>
                            </div>

                            {openComments.has(post.id) && <CommentSection postId={post.id} user={user} isMock={isMock} postAuthor={post.author} />}
                        </div>
                    );
                })}
            </div>

            {/* LIGHTBOX */}
            {selectedPost && (
                <PostLightbox 
                    post={selectedPost} 
                    user={user} 
                    onClose={() => setSelectedPost(null)} 
                    onLike={handleLike}
                    likedPosts={likedPosts}
                    CATEGORIES={CATEGORIES}
                    getColorTheme={getColorTheme}
                    CommentComponent={CommentSection}
                    isMock={String(selectedPost.id).startsWith('m') || String(selectedPost.id).startsWith('live')}
                    onEdit={startEditPost}
                    onDelete={confirmDeletePost} // 🌟 Passed the new modal handler here!
                    onShare={handleShare}
                />
            )}

            {/* 🌟 CUSTOM DELETE CONFIRMATION MODAL */}
            <ConfirmationModal 
                isOpen={!!postToDelete}
                title="NEXUS says"
                message="Are you sure you want to delete this post? This cannot be undone."
                onCancel={() => setPostToDelete(null)}
                onConfirm={executeDelete}
            />

            <div className="h-24" />
        </div>
    );
};

export default FeedsView;
