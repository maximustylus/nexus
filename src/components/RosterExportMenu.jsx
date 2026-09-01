// src/components/RosterExportMenu.jsx
//
// ONE "EXPORT" BUTTON INSTEAD OF FOUR COLOURED ONES.
//
// WHY THIS REPLACED THE ROW. Four export buttons fitted on a desktop and did not
// fit anywhere else. Measured on a 375px phone, the roster toolbar wrapped onto
// THREE rows with `ICS` stranded alone on the last one, and the rows were 46px
// then 44px tall because a flex row stretches to its tallest item and the first
// row held a bordered group. That is the "boxes of different size, not uniform"
// the owner reported on 2026-09-01. Adding a fifth and sixth format would have
// made it worse — and the formats are not going to stop arriving.
//
// A MENU ALSO SAYS MORE THAN A ROW OF FILE EXTENSIONS CAN. `CSV` and `ICS` are
// not answers to "how do I put this on the ward noticeboard"; each item here
// leads with what the file is FOR and carries the extension as a secondary tag,
// because the person choosing is a roster master, not a developer.
//
// WHAT THIS COMPONENT DOES NOT DO: build anything. It renders labels and calls
// `onSelect`. Every format's file is built by a pure function tested elsewhere —
// keeping this dumb is what stops a menu change from breaking an exporter.

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Download, ChevronDown } from 'lucide-react';

/**
 * `formats` is `[{ id, label, ext, hint, icon, onSelect, busy }]`, in menu order.
 *
 * `busy` exists for one format only — the PDF, which fetches jsPDF on first use —
 * but it is a per-item property rather than a special case, so the next format
 * that needs a moment does not need a change here.
 */
const RosterExportMenu = ({ formats = [], buttonClassName = '' }) => {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);
    const buttonRef = useRef(null);
    const menuId = useId();

    const busy = formats.some((format) => format.busy);

    const close = useCallback((returnFocus = false) => {
        setOpen(false);
        if (returnFocus && buttonRef.current) buttonRef.current.focus();
    }, []);

    // ⚠️ BOTH DISMISSALS, because a menu that can only be closed by choosing
    //    something is a trap: on a phone there is no Escape key, and on a desktop
    //    clicking away is the reflex. `pointerdown` rather than `click` so the menu
    //    is gone before the thing underneath reacts.
    useEffect(() => {
        if (!open) return undefined;

        const onPointerDown = (event) => {
            if (wrapRef.current && !wrapRef.current.contains(event.target)) close(false);
        };
        const onKeyDown = (event) => {
            if (event.key === 'Escape') close(true);
        };

        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open, close]);

    const choose = (format) => {
        close(false);
        format.onSelect?.();
    };

    return (
        /* ONE GRID COLUMN ON A PHONE, ITS OWN WIDTH FROM `sm:` UP.
           The roster toolbar is a two-column grid below `sm:`, so this fills the
           column it is given and matches whatever sits beside it exactly. Nothing
           here declares a width: the parent decides, which is what lets the same
           menu sit in a grid cell on a phone and in a flex row on a desktop. */
        <div ref={wrapRef} className="relative">
            <button
                ref={buttonRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                onClick={() => setOpen((was) => !was)}
                className={`w-full sm:w-auto flex gap-2 items-center justify-center px-4 py-2 min-h-11 sm:min-h-0 rounded bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 shadow-lg transition-colors ${buttonClassName}`}
            >
                <Download size={14} />
                {busy ? 'Building…' : 'Export'}
                <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div
                    id={menuId}
                    role="menu"
                    aria-label="Export the roster"
                    /* `right-0` keeps it under the button on a desktop; the width is
                       capped to the viewport so it cannot run off the left edge of a
                       narrow phone, which `w-80` alone would do. */
                    className="absolute right-0 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl"
                >
                    {formats.map((format) => {
                        const Icon = format.icon;
                        return (
                            <button
                                key={format.id}
                                type="button"
                                role="menuitem"
                                disabled={format.busy === true}
                                onClick={() => choose(format)}
                                className="w-full flex items-start gap-3 px-3 py-3 text-left border-b last:border-b-0 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors"
                            >
                                {Icon && <Icon size={16} className="mt-0.5 shrink-0 text-slate-400" />}
                                <span className="min-w-0">
                                    <span className="flex items-center gap-2">
                                        <span className="text-xs font-black text-slate-800 dark:text-white">
                                            {format.busy ? 'Building…' : format.label}
                                        </span>
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                            {format.ext}
                                        </span>
                                    </span>
                                    <span className="block mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                                        {format.hint}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default RosterExportMenu;
