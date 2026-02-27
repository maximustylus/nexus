import React, { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

const ScrollToTop = () => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // This function checks how far the user has scrolled
        const toggleVisibility = () => {
            // We check both the window and common scrollable containers
            const scrolled = document.documentElement.scrollTop || document.body.scrollTop || window.scrollY;
            if (scrolled > 300) {
                setIsVisible(true);
            } else {
                setIsVisible(false);
            }
        };

        // Listen for scrolling
        window.addEventListener('scroll', toggleVisibility, true);
        return () => window.removeEventListener('scroll', toggleVisibility, true);
    }, []);

    const scrollToTop = () => {
        // Scroll the window
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Also scroll the main app container just in case it's handling the overflow
        const appContainer = document.getElementById('main-scroll-container');
        if (appContainer) {
            appContainer.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    return (
        <button
            onClick={scrollToTop}
            className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2 bg-slate-800/90 hover:bg-slate-700 backdrop-blur text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-2xl transition-all duration-300 ease-in-out md:hidden ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'
            }`}
        >
            <ArrowUp size={14} className="text-emerald-400" />
            Top
        </button>
    );
};

export default ScrollToTop;
