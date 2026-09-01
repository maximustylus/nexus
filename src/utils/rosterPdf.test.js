/**
 * THE PDF IS TESTED WITHOUT A PDF.
 *
 * `paintRosterPdf` takes its drawing surface as an argument, so these hand it a
 * recorder that remembers every string, size and rectangle. That buys the two
 * things a rendered-and-compared bitmap cannot: it fails with a readable reason
 * ("December was never drawn"), and it runs in milliseconds without jsPDF, a
 * canvas, or a reference image that has to be regenerated whenever a colour moves.
 *
 * What is NOT covered here is whether jsPDF honours these calls — that is the
 * library's job, and `downloadRosterPdf` is the four lines that trust it.
 */

import { describe, it, expect } from 'vitest';
import { paintRosterPdf, chipTypeSize, hexToRgb } from './rosterPdf.js';

/** Records the jsPDF surface the painter actually uses. */
const recorder = () => {
    const state = { size: 10, font: 'normal' };
    const calls = { text: [], rect: [], pages: 1 };
    return {
        calls,
        setFontSize(n) { state.size = n; },
        setFont(_family, style) { state.font = style; },
        setFillColor() {},
        setDrawColor() {},
        setTextColor() {},
        setLineWidth() {},
        line() {},
        rect(x, y, w, h, mode) { calls.rect.push({ x, y, w, h, mode }); },
        text(str, x, y, opts) { calls.text.push({ str, x, y, size: state.size, font: state.font, opts }); },
        // Helvetica averages near half its point size per character; the painter
        // only needs a monotonic estimate to decide when to clip.
        getTextWidth(str) { return String(str).length * state.size * 0.5 * 0.3527; },
        addPage() { calls.pages += 1; },
    };
};

const strings = (doc) => doc.calls.text.map((t) => t.str);

const ROSTER = {
    '2026-09-07': [
        { task: 'EFT', category: 'Clinical', lead: 'Adaeze Nwosu', coLead: 'Benedict Tan', staff: 'Lead: Adaeze Nwosu, Co: Benedict Tan', week: 1 },
        { task: 'VC', category: 'VC', lead: 'Chidi Okafor', coLead: 'Dalia Haddad', staff: 'Lead: Chidi Okafor, Co: Dalia Haddad', week: 1 },
    ],
    '2026-09-14': [
        { task: 'EFT', category: 'Clinical', lead: 'Benedict Tan', coLead: 'Adaeze Nwosu', staff: 'Lead: Benedict Tan, Co: Adaeze Nwosu', week: 2 },
    ],
};

describe('a year prints as twelve months and then the matrix', () => {
    it('paints January to December even though the roster is one week long', () => {
        const doc = recorder();
        const summary = paintRosterPdf(doc, ROSTER);

        expect(summary.months).toBe(12);
        expect(doc.calls.pages).toBe(summary.pages);
        for (const month of ['January 2026', 'June 2026', 'December 2026']) {
            expect(strings(doc)).toContain(month);
        }
    });

    it('tells the reader an empty month is empty, not broken', () => {
        // Eleven of the twelve pages have no duties on them by design. A page with
        // only a heading reads as a rendering failure.
        const doc = recorder();
        paintRosterPdf(doc, ROSTER);
        const empties = strings(doc).filter((s) => s === 'No roster generated for this month');
        expect(empties).toHaveLength(11);
        expect(strings(doc)).toContain('3 duties');
    });

    it('draws the duties, with the app acronyms, in the month that holds them', () => {
        const doc = recorder();
        paintRosterPdf(doc, ROSTER, { shortNames: { 'Adaeze Nwosu': 'AN', 'Benedict Tan': 'BT' } });
        expect(strings(doc)).toContain('EFT');
        expect(strings(doc)).toContain('VC');
        expect(strings(doc)).toContain('Lead: AN, Co: BT');
    });

    it('adds the staff-by-week matrix at the back', () => {
        const doc = recorder();
        const summary = paintRosterPdf(doc, ROSTER);
        expect(summary.matrixPages).toBe(1);
        expect(strings(doc)).toContain('Who leads what, by week');
        expect(strings(doc)).toContain('Weeks 1–2  ·  bold = leads, plain = second');
    });

    it('splits a long block over several matrix pages instead of off the page', () => {
        const long = {};
        for (let week = 1; week <= 17; week += 1) {
            long[`2026-09-${String(6 + week).padStart(2, '0')}`] = [
                { task: 'EFT', category: 'Clinical', lead: 'A', coLead: 'B', week },
            ];
        }
        expect(paintRosterPdf(recorder(), long).matrixPages).toBe(2);
    });

    it('paints nothing at all for an empty roster', () => {
        const doc = recorder();
        expect(paintRosterPdf(doc, {})).toEqual({ pages: 0, months: 0, matrixPages: 0 });
        expect(doc.calls.text).toHaveLength(0);
        expect(doc.calls.rect).toHaveLength(0);
    });
});

describe('a crowded day shrinks its type — the owner’s choice over hiding duties', () => {
    it('prints a normal day at full size and a busy one smaller', () => {
        // 2026-09-07 has two duties, 2026-09-08 has six. Both squares are the same
        // height, so the busy one must come out in smaller type — and every duty
        // must still be drawn.
        const busy = {
            ...ROSTER,
            '2026-09-08': ['EFT', 'VC', 'NC', 'SK', 'FS', 'MDT'].map((task) => ({
                task, category: 'Clinical', lead: 'A', coLead: 'B', staff: 'Lead: A, Co: B', week: 1,
            })),
        };
        const doc = recorder();
        paintRosterPdf(doc, busy);

        const sizeOf = (task) => doc.calls.text.find((t) => t.str === task)?.size;
        expect(sizeOf('MDT')).toBeLessThan(sizeOf('VC'));
        // Nothing was dropped: all six are on the page.
        for (const task of ['EFT', 'VC', 'NC', 'SK', 'FS', 'MDT']) {
            expect(strings(doc)).toContain(task);
        }
    });

    it('never shrinks below the floor, and never grows past the base size', () => {
        expect(chipTypeSize(20, 1)).toBe(5.4);          // a quiet day, base size
        expect(chipTypeSize(20, 40)).toBe(3.4);         // an absurd day, the floor
        expect(chipTypeSize(20, 4)).toBeLessThan(5.4);
        expect(chipTypeSize(20, 4)).toBeGreaterThan(3.4);
        expect(chipTypeSize(20, 0)).toBe(5.4);          // no duties, no shrinking
    });

    it('shrinks monotonically — one more duty is never bigger type', () => {
        let last = Infinity;
        for (let n = 1; n <= 12; n += 1) {
            const size = chipTypeSize(24, n);
            expect(size).toBeLessThanOrEqual(last);
            last = size;
        }
    });
});

describe('the colour on the page is the colour on the screen', () => {
    it('converts the palette hexes to channels', () => {
        expect(hexToRgb('#6b4423')).toEqual([107, 68, 35]);     // Clinical brown
        expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]);
        expect(hexToRgb('fff7ed')).toEqual([255, 247, 237]);    // with or without the hash
    });

    it('is black rather than a crash for anything that is not a hex', () => {
        for (const bad of ['', 'red', '#abc', null, undefined, 42, '#gggggg']) {
            expect(hexToRgb(bad)).toEqual([0, 0, 0]);
        }
    });
});
