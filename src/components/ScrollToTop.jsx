import React, { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

const ScrollToTop = () => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const scrollContainer = document.getElementById('nexus-scroll-view');
        
        if (!scrollContainer) {
            console.warn("ScrollToTop: Could not find #nexus-scroll-view");
            return;
        }

        const handleScroll = () => {
            if (scrollContainer.scrollTop > 300) {
                setIsVisible(true);
            } else {
                setIsVisible(false);
            }
        };

        scrollContainer.addEventListener('scroll', handleScroll);
        
        // Initial check
        handleScroll();

        return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }, []); 

    const scrollToTop = () => {
        const scrollContainer = document.getElementById('nexus-scroll-view');
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
