import React, { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

const ScrollToTop = () => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // 🌟 THE FIX: Grab the exact inner div that handles scrolling in ResponsiveLayout
        const scrollContainer = document.querySelector('.flex-1.overflow-y-auto');
        
        if (!scrollContainer) return;

        const handleScroll = () => {
            if (scrollContainer.scrollTop > 300) {
                setIsVisible(true);
            } else {
                setIsVisible(false);
            }
        };

        // Attach listener to the div, not the window
        scrollContainer.addEventListener('scroll', handleScroll);
        
        // Trigger once on mount in case the user is already scrolled down
        handleScroll();

        return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }, []); // Empty dependency array ensures this runs when the layout mounts

    const scrollToTop = () => {
        const scrollContainer = document.querySelector('.flex-1.overflow-y-auto');
        if (scrollContainer) {
            scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
        }
        setIsVisible(false);
    };

    return (
        <button
            onClick={scrollToTop}
            className={`fixed bottom-24 xl:bottom-10 left-1/2 -translate-x-1/2 z-[120] flex items-center gap-2 px-4 py-2.5 backdrop-blur-md border text-[10px] font-black uppercase tracking-widest rounded-full transition-all duration-300 ease-in-out
            bg-white/90 dark:bg-slate-900/90 
            hover:bg-slate-50 dark:hover:bg-slate-800 
            border-slate-200 dark:border-slate-700 
            text-slate-700 dark:text-white 
            shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)]
            ${isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-10 scale-90 pointer-events-none'}`}
        >
            <ArrowUp size={16} className="text-emerald-500 dark:text-emerald-400" />
            Top
        </button>
    );
};

export default ScrollToTop;
