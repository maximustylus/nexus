import React from 'react';
import { X, ThumbsUp, Sparkles, ExternalLink } from 'lucide-react';
import { createPortal } from 'react-dom';

const PostLightbox = ({ post, user, onClose, onLike, likedPosts, CATEGORIES, getColorTheme, CommentComponent, isMock }) => {
    if (!post) return null;

    const theme = getColorTheme(post.category);
    const categoryConfig = CATEGORIES[post.category] || { icon: '📝', label: 'Post' };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-white dark:bg-slate-800 w-full max-w-6xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row animate-in zoom-in-95 duration-300">
                
                <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 bg-slate-100 dark:bg-slate-700 rounded-full text-slate-500 hover:text-slate-800 transition-colors">
                    <X size={20} />
                </button>

                {/* LEFT: CONTENT */}
                <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900/50 p-6 md:p-10 scrollbar-hide">
                    <div className="max-w-2xl mx-auto space-y-6">
                        
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center font-black text-lg overflow-hidden bg-indigo-100 text-indigo-700 border border-slate-200 dark:border-slate-700">
                                 {post.authorPhotoUrl || post.author_photo_url ? (
                                    <img src={post.authorPhotoUrl || post.author_photo_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <span>{post.author?.charAt(0)}</span>
                                )}
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-slate-800 dark:text-white">{post.author}</h2>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{post.role?.replace(/\s*\(.*?\)/g, '')} • {post.timestamp}</p>
                            </div>
                            <div className={`ml-auto w-10 h-10 rounded-full flex items-center justify-center text-xl ${theme.bg} border ${theme.border}`} title={categoryConfig.label}>
                                {categoryConfig.icon}
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
                            <div className="rounded-3xl overflow-hidden border border-slate-200 shadow-lg">
                                <img src={post.image_url} alt="Post" className="w-full h-auto object-contain max-h-[500px]" />
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT: LIVE DISCUSSION */}
                <div className="w-full md:w-[400px] border-l border-slate-100 dark:border-slate-700 flex flex-col bg-white dark:bg-slate-800">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="font-black text-slate-800 uppercase tracking-wider text-xs">Discussion</h3>
                        <button onClick={() => onLike(post.id)} className={`flex items-center gap-1.5 text-sm font-bold ${likedPosts.has(post.id) ? 'text-indigo-600' : 'text-slate-400 hover:text-indigo-600'}`}>
                            <ThumbsUp size={16} className={likedPosts.has(post.id) ? 'fill-indigo-600' : ''} /> {post.likes || 0}
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 bg-slate-50 dark:bg-slate-900/30">
                        {/* 🌟 REAL COMMENTS INJECTED HERE */}
                        {CommentComponent && (
                            <CommentComponent postId={post.id} user={user} isMock={isMock} postAuthor={post.author} />
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default PostLightbox;
