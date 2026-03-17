import React from 'react';
import { X, ThumbsUp, MessageSquare, Share2, Sparkles, ShieldAlert, ExternalLink } from 'lucide-react';
import { createPortal } from 'react-dom';

const PostLightbox = ({ post, user, onClose, onLike, likedPosts, CATEGORIES, getColorTheme }) => {
    if (!post) return null;

    const theme = getColorTheme(post.category);
    const categoryConfig = CATEGORIES[post.category] || { icon: '📝', label: 'Post' };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-white dark:bg-slate-800 w-full max-w-5xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row animate-in zoom-in-95 duration-300">
                
                <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 bg-slate-100 dark:bg-slate-700 rounded-full text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors">
                    <X size={20} />
                </button>

                {/* LEFT: CONTENT */}
                <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900/50 p-6 md:p-10">
                    <div className="max-w-2xl mx-auto space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center font-black text-lg bg-indigo-100 text-indigo-700">
                                {post.author?.charAt(0)}
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-slate-800 dark:text-white">{post.author}</h2>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{post.role} • {post.timestamp}</p>
                            </div>
                        </div>

                        {post.ai_enhancements && (
                            <div className={`p-4 rounded-2xl ${theme.bg} border ${theme.border} space-y-2`}>
                                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest opacity-70"><Sparkles size={12} /> AURA Summary</div>
                                <p className={`text-base font-bold ${theme.text}`}>{post.ai_enhancements.tldr}</p>
                            </div>
                        )}

                        <p className="text-lg text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">{post.raw_text}</p>

                        {post.image_url && (
                            <div className="rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-lg">
                                <img src={post.image_url} alt="Post" className="w-full h-auto object-contain max-h-[500px]" />
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT: DISCUSSION (Placeholder for now) */}
                <div className="w-full md:w-[350px] border-l border-slate-100 dark:border-slate-700 flex flex-col bg-white dark:bg-slate-800 p-6">
                    <h3 className="font-black text-slate-800 dark:text-white uppercase tracking-wider text-xs mb-4">Discussion</h3>
                    <div className="flex-1 text-center text-slate-400 text-xs italic py-10">
                        Comments coming soon to Lightbox view...
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default PostLightbox;
