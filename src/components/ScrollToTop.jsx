import React, { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

const ScrollToTop = () => {
    const [isVisible, setIsVisible] = useState(false);
    const [scrollContainer, setScrollContainer] = useState(null);

    useEffect(() => {
        const handleScroll = (e) => {
            // 1. Identify EXACTLY what is scrolling (window or a specific div)
            const target = e.target;
            const scrollTop = target.scrollTop || window.scrollY || document.documentElement.scrollTop;
            
            // 2. If it scrolls past 300px, show the button
            if (scrollTop > 300) {
                setIsVisible(true);
                // 3. Save that exact container so we know what to scroll back up!
                if (target.scrollTop) {
                    setScrollContainer(target);
                }
            } else {
                setIsVisible(false);
            }
        };

        // Use capture phase (true) to catch scroll events from ANY scrolling div inside your app layout
        window.addEventListener('scroll', handleScroll, true);
        return () => window.removeEventListener('scroll', handleScroll, true);
    }, []);

    const scrollToTop = () => {
        // Scroll the specific container back to the top smoothly
        if (scrollContainer && typeof scrollContainer.scrollTo === 'function') {
            scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        // Instantly hide the button as soon as they click it for a snappy feel
        setIsVisible(false);
    };

    return (
        <button
            onClick={scrollToTop}
            // Change the className inside your <button> to this:
            className={`fixed bottom-24 xl:bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2.5 bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md border border-slate-700 text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-all duration-300 ease-in-out md:hidden ${
                isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-10 scale-90 pointer-events-none'
            }`}
        >
            <ArrowUp size={16} className="text-emerald-400" />
            Top
        </button>
    );
};

export default ScrollToTop;
