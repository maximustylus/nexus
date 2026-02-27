import React, { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

const ScrollToTop = () => {
    const [isVisible, setIsVisible] = useState(false);
    const [scrollContainer, setScrollContainer] = useState(null);

    useEffect(() => {
        const handleScroll = (e) => {
            const target = e.target;
            const scrollTop = target.scrollTop || window.scrollY || document.documentElement.scrollTop;
            
            if (scrollTop > 300) {
                setIsVisible(true);
                if (target.scrollTop) {
                    setScrollContainer(target);
                }
            } else {
                setIsVisible(false);
            }
        };

        window.addEventListener('scroll', handleScroll, true);
        return () => window.removeEventListener('scroll', handleScroll, true);
    }, []);

    const scrollToTop = () => {
        if (scrollContainer && typeof scrollContainer.scrollTo === 'function') {
            scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        setIsVisible(false);
    };

    return (
        <button
            onClick={scrollToTop}
            className={`fixed bottom-24 xl:bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2.5 backdrop-blur-md border text-[10px] font-black uppercase tracking-widest rounded-full transition-all duration-300 ease-in-out md:hidden
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
