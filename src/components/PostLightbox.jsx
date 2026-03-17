import React, { useState } from 'react';
import { ThumbsUp, Sparkles, MoreHorizontal, Edit2, Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';

const PostLightbox = ({ post, user, onClose, onLike, likedPosts, CATEGORIES, getColorTheme, CommentComponent, isMock, onEdit, onDelete }) => {
    const [showMenu, setShowMenu] = useState(false);

    if (!post) return null;

    const theme = getColorTheme(post.category);
    const categoryConfig = CATEGORIES[post.category] || { icon: '📝', label: 'Post' };
    const isAuthor = user?.name ? user.name === post.author : post.author === 'Staff Member';

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-8 animate-in fade-in duration-200">
            {/* BACKDROP */}
            <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-sm" onClick={onClose} />

            {/* MODAL CONTAINER */}
            <div className="relative bg-white dark:bg-slate-800 w-full h-full md:h-auto max-w-6xl md:max-h-[90vh] md:rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row animate-in zoom-in-95 duration-300 border border-slate-200 dark:border-slate-700">
                
                {/* 🌟 MOBILE ONLY TOP BAR (Native Mac Style) */}
                <div className="md:hidden flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200/50 dark:border-slate-700/50 shrink-0 z-20">
                    <div className="flex items-center gap-2">
                        {/* Traffic Lights */}
                        <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-[#FF5F56] shadow-sm active:scale-95"></button>
                        <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-[#FFBD2E] shadow-sm active:scale-95"></button>
                        <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-[#27C93F] shadow-sm active:scale-95"></button>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <span className="font-black text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-widest">NEXUS Feed</span>
                    </div>
                </div>

                {/* LEFT: CONTENT */}
                <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900/50 p-5 md:p-10 scrollbar-hide relative">
                    
                    {/* 🌟 DESKTOP ONLY MAC CONTROLS (Floating Top Left) */}
                    <div className="hidden md:flex absolute top-6 left-6 items-center gap-2 z-20">
                        <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-[#FF5F56] shadow-sm hover:scale-105 transition-transform"></button>
                        <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-[#FFBD2E] shadow-sm hover:scale-105 transition-transform"></button>
                        <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-[#27C93F] shadow-sm hover:scale-105 transition-transform"></button>
                    </div>

                    {/* Adjusted Desktop Padding to account for Mac dots */}
                    <div className="max-w-2xl mx-auto space-y-6 pb-6 pt-2 md:pt-6">
                        
                        {/* Author Header */}
                        <div className="flex items-center gap-3 md:gap-4 relative">
                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center font-black text-lg overflow-hidden bg-indigo-100 text-indigo-700 border border-slate-200 dark:border-slate-700 shrink-0">
                                 {post.authorPhotoUrl || post.author_photo_url ? (
                                    <img src={post.authorPhotoUrl || post.author_photo_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <span>{post.author?.charAt(0)}</span>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h2 className="text-base md:text-xl font-black text-slate-800 dark:text-white truncate">{post.author}</h2>
                                <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest truncate">{post.role?.replace(/\s*\(.*?\)/g, '')} • {post.timestamp}</p>
                            </div>
                            
                            <div className="flex items-center gap-2 shrink-0">
                                {/* Category Badge */}
                                <div className={`hidden md:flex w-10 h-10 rounded-full items-center justify-center text-xl ${theme.bg} border ${theme.border}`} title={categoryConfig.label}>
                                    {categoryConfig.icon}
                                </div>

                                {/* EDIT/DELETE MENU */}
                                {isAuthor && !isMock && (
                                    <div className="relative">
                                        <button onClick={() => setShowMenu(!showMenu)} className="p-1.5 md:p-2 text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                                            <MoreHorizontal size={20} />
                                        </button>
                                        {showMenu && (
                                            <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden z-20 animate-in zoom-in-95 duration-100">
                                                <button onClick={() => { setShowMenu(false); onClose(); onEdit(post); }} className="w-full px-4 py-2.5 text-xs font-bold text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2">
                                                    <Edit2 size={14}/> Edit Post
                                                </button>
                                                <div className="h-px w-full bg-slate-100 dark:bg-slate-700"></div>
                                                <button onClick={() => { setShowMenu(false); onClose(); onDelete(post.id); }} className="w-full px-4 py-2.5 text-xs font-bold text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
                                                    <Trash2 size={14}/> Delete
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* AURA Summary */}
                        {post.ai_enhancements && (
                            <div className={`p-4 rounded-2xl ${theme.bg} border ${theme.border} space-y-2`}>
                                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest opacity-70"><Sparkles size={12} /> AURA Summary</div>
                                <p className={`text-sm md:text-base font-bold ${theme.text}`}>{post.ai_enhancements.tldr}</p>
                            </div>
                        )}

                        <p className="text-sm md:text-lg text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">{post.raw_text}</p>

                        {/* Image */}
                        {post.image_url && (
                            <div className="rounded-2xl md:rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-lg bg-black/5">
                                <img src={post.image_url} alt="Post" className="w-full h-auto object-contain max-h-[40vh] md:max-h-[500px]" />
                            </div>
                        )}

                        {/* Link Preview */}
                         {post.external_link && (
                            <a href={post.external_link.url} target="_blank" rel="noreferrer" className="flex items-stretch overflow-hidden mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:shadow-md transition-colors group">
                                {post.external_link.image_url && <img src={post.external_link.image_url} alt="preview" className="w-24 h-full object-cover border-r border-slate-200 dark:border-slate-700" />}
                                <div className="flex-1 min-w-0 p-3 flex flex-col justify-center">
                                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{post.external_link.title}</p>
                                    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest truncate mt-0.5">{post.external_link.domain}</p>
                                </div>
                            </a>
                        )}
                    </div>
                </div>

                {/* RIGHT: LIVE DISCUSSION */}
                <div className="w-full h-[45vh] md:h-auto md:w-[400px] border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-700 flex flex-col bg-white dark:bg-slate-800 shrink-0 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.1)] md:shadow-none">
                    <div className="p-4 md:p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between z-10 bg-white dark:bg-slate-800 shrink-0">
                        <h3 className="font-black text-slate-800 dark:text-white uppercase tracking-wider text-xs">Discussion</h3>
                        <button onClick={() => onLike(post.id)} className={`flex items-center gap-1.5 text-sm font-bold transition-colors ${likedPosts.has(post.id) ? 'text-indigo-600' : 'text-slate-400 hover:text-indigo-600'}`}>
                            <ThumbsUp size={16} className={likedPosts.has(post.id) ? 'fill-indigo-600' : ''} /> {post.likes || 0}
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 bg-slate-50 dark:bg-slate-900/30 pb-24 md:pb-4 scrollbar-hide">
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
