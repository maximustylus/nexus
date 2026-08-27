import React, { useEffect, useState } from 'react';
import { ShieldCheck, Sun, Moon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { readTheme, writeTheme } from '../utils/theme';

/*
 * ==============================================================================
 * THE CHATBOT INFO CARD, RENDERED FROM ITS ONE SOURCE — `AURA-TODO.md` P9.2/P9.3
 * ==============================================================================
 *
 * `docs/AURA-CHATBOT-INFO-CARD.md` is the controlled document (IMDA Transparency
 * Guidelines for Generative AI Chatbots, 20 July 2026 — the "chatbot info card").
 * This page imports that file VERBATIM via Vite's `?raw` and renders it, so the
 * page cannot drift from the document: there is exactly one copy, and an edit to
 * the markdown ships to this route on the next build with no second file to
 * forget. The same reasoning as the version badge reading `package.json` — a
 * derived surface, never a duplicated one.
 *
 * ⚠️ RELATIVE LINKS ARE REPOSITORY ADDRESSES, NOT WEB ADDRESSES. The card cites
 *    its evidence as repo-relative paths (`AURA-GUARDRAILS.md`, `functions/…`).
 *    Rendering those as <a href> here would produce dead links for the public —
 *    the SPA's catch-all would 404 them. They render as inline code instead:
 *    still a precise citation, no longer a broken promise. External http(s)
 *    links open in a new tab.
 *
 * PUBLIC ON PURPOSE. The guidelines expect the card to be reachable before and
 * without signing in (a parent researching the tool, a member of the public on
 * `/individuals`). Nothing on the card is secret: it is the transparency
 * artefact itself.
 */

// One class map, kept small: the card is a document, and reading it should feel
// like one. `prose` from @tailwindcss/typography is not a dependency here, so the
// elements carry their own classes.
const MD = {
    h1: (props) => <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight mt-2 mb-4" {...props} />,
    h2: (props) => <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight mt-10 mb-3 pb-2 border-b border-slate-200 dark:border-slate-800" {...props} />,
    h3: (props) => <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mt-6 mb-2" {...props} />,
    p: (props) => <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-3" {...props} />,
    ul: (props) => <ul className="list-disc pl-5 space-y-2 mb-4 text-sm text-slate-600 dark:text-slate-300" {...props} />,
    ol: (props) => <ol className="list-decimal pl-5 space-y-2 mb-4 text-sm text-slate-600 dark:text-slate-300" {...props} />,
    li: (props) => <li className="leading-relaxed" {...props} />,
    blockquote: (props) => (
        <blockquote className="border-l-4 border-indigo-300 dark:border-indigo-700 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-r-xl px-4 py-3 mb-4 [&_p]:mb-0 [&_p]:text-slate-700 dark:[&_p]:text-slate-200" {...props} />
    ),
    // Wide tables scroll inside their own container rather than widening the page.
    table: (props) => (
        <div className="overflow-x-auto mb-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs" {...props} />
        </div>
    ),
    thead: (props) => <thead className="bg-slate-100 dark:bg-slate-800/80" {...props} />,
    th: (props) => <th className="px-3 py-2 font-black text-slate-700 dark:text-slate-200 uppercase tracking-wide text-[10px] align-top" {...props} />,
    td: (props) => <td className="px-3 py-2 text-slate-600 dark:text-slate-300 align-top border-t border-slate-100 dark:border-slate-800 leading-relaxed" {...props} />,
    hr: () => <hr className="my-8 border-slate-200 dark:border-slate-800" />,
    code: (props) => <code className="text-[11px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-1 py-0.5 rounded" {...props} />,
    strong: (props) => <strong className="font-bold text-slate-800 dark:text-slate-100" {...props} />,
    a: ({ href, children, ...rest }) => {
        // See the header note: only a real web address earns an anchor.
        if (href && /^https?:\/\//.test(href)) {
            return (
                <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 dark:text-indigo-400 underline underline-offset-2 hover:text-indigo-800 dark:hover:text-indigo-300"
                    {...rest}
                >
                    {children}
                </a>
            );
        }
        return (
            <code className="text-[11px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-1 py-0.5 rounded">
                {children}
            </code>
        );
    },
};

export default function AuraInfoCard({ source }) {
    const [isDark, setIsDark] = useState(false);
    // `source` exists for tests; the route renders the real document.
    const [markdown, setMarkdown] = useState(source || '');

    useEffect(() => {
        const dark = readTheme();
        setIsDark(dark);
        document.documentElement.classList.toggle('dark', dark);
    }, []);

    useEffect(() => {
        if (source) return;
        // Dynamic rather than static import, so the ~20 KB document stays out of
        // the main bundle that every route pays for.
        let cancelled = false;
        import('../../docs/AURA-CHATBOT-INFO-CARD.md?raw').then((mod) => {
            if (!cancelled) setMarkdown(mod.default);
        });
        return () => { cancelled = true; };
    }, [source]);

    const toggleTheme = () => {
        const next = !isDark;
        setIsDark(next);
        writeTheme(next);
        document.documentElement.classList.toggle('dark', next);
    };

    return (
        <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 transition-colors duration-500 font-sans">
            <header className="sticky top-0 z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
                <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20">
                            <ShieldCheck size={16} className="text-indigo-500" />
                        </div>
                        <div>
                            <h1 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest leading-tight">Chatbot Info Card</h1>
                            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider leading-none">AURA · the NEXUS assistant</p>
                        </div>
                    </div>
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 shadow-sm hover:scale-105 active:scale-95 transition-all"
                        aria-label="Toggle theme"
                    >
                        {isDark ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} />}
                    </button>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-4 py-8">
                {markdown ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
                        {markdown}
                    </ReactMarkdown>
                ) : (
                    <p className="text-sm text-slate-400">Loading the info card…</p>
                )}
            </main>
        </div>
    );
}
