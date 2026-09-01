/**
 * ==============================================================================
 * CONTRAST — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * The community result page tells a member of the public about their own health,
 * in four languages, on whatever phone they have, often outdoors. This file is
 * how a redesign stays honest: the pairs the design actually uses are composited
 * and measured on every run, so a glass treatment that drops a label below
 * threshold fails `npm test` rather than shipping.
 */

import { describe, it, expect } from 'vitest';
import { parseHex, luminance, contrastRatio, composite, check, AA_NORMAL, AA_LARGE } from './contrast';

/** The tier gradients, at their LIGHT end — the worst case for white text. */
const TIER_WORST = { Red: '#f43f5e', Amber: '#fbbf24', Green: '#34d399' };
/** The dark end, checked too so nothing passes only by picking a favourable stop. */
const TIER_DARK = { Red: '#dc2626', Amber: '#f97316', Green: '#14b8a6' };

/** `ON_COLOR` is `bg-slate-900/55`. slate-900 is #0f172a. */
const SLATE_900 = '#0f172a';
const ON_COLOR_ALPHA = 0.55;

describe('the maths', () => {
    it('computes known WCAG ratios', () => {
        expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
        expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
        // A widely published reference value.
        expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    });

    it('is symmetric', () => {
        expect(contrastRatio('#123456', '#abcdef')).toBeCloseTo(contrastRatio('#abcdef', '#123456'), 6);
    });

    it('parses both hex forms and rejects anything else', () => {
        expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
        expect(parseHex('0f172a')).toEqual({ r: 15, g: 23, b: 42 });
        expect(() => parseHex('rebeccapurple')).toThrow(/Not a hex colour/);
        expect(() => parseHex('#12345')).toThrow();
    });

    it('composites a translucent layer over a background', () => {
        expect(composite('#ffffff', 1, '#000000')).toBe('#ffffff');
        expect(composite('#ffffff', 0, '#000000')).toBe('#000000');
        expect(luminance(composite('#ffffff', 0.5, '#000000')))
            .toBeGreaterThan(luminance('#000000'));
    });
});

describe('⚠️ the defect this redesign had to fix', () => {
    /**
     * The old hero put white text directly on the tier gradient, and the tier
     * label — the single most important sentence on the page, the person's own
     * result — on a `bg-white/20` chip over it. These are the measurements. They
     * are recorded as a test so that nobody restores the old treatment believing
     * it was merely dated.
     */
    it('white directly on the light end of amber and green was catastrophic', () => {
        expect(check('#ffffff', TIER_WORST.Amber).ratio).toBeLessThan(2);
        expect(check('#ffffff', TIER_WORST.Green).ratio).toBeLessThan(2);
    });

    it('the old tier chip was the worst pair on the page', () => {
        const oldChip = composite('#ffffff', 0.20, TIER_WORST.Amber);
        expect(check('#ffffff', oldChip).ratio).toBeLessThan(2);
        expect(check('#ffffff', oldChip).passesLarge).toBe(false);
    });
});

describe('⚠️ the glass surfaces carry text at AA — on every tier', () => {
    /**
     * THE LOAD-BEARING TEST. `ON_COLOR` at 55% is the lowest opacity that clears
     * 4.5:1 on all three tiers while still letting the tier colour read through.
     * If somebody lowers it for a lighter look, this fails and names the tier.
     */
    it.each(Object.entries(TIER_WORST))('white on ON_COLOR over %s passes AA for normal text', (tier, bg) => {
        const surface = composite(SLATE_900, ON_COLOR_ALPHA, bg);
        const result = check('#ffffff', surface);
        expect(result.ratio, `${tier}: white on ${surface} is ${result.ratio}:1`).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it.each(Object.entries(TIER_DARK))('and over the dark end of %s too', (tier, bg) => {
        const surface = composite(SLATE_900, ON_COLOR_ALPHA, bg);
        expect(check('#ffffff', surface).ratio, tier).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    /**
     * The margin is asserted so a future palette change that squeaks past by 0.01
     * is visible as a near miss rather than a pass.
     */
    it('keeps a real margin on the worst tier rather than scraping the line', () => {
        const surface = composite(SLATE_900, ON_COLOR_ALPHA, TIER_WORST.Amber);
        expect(check('#ffffff', surface).ratio).toBeGreaterThan(5.0);
    });

    /**
     * The subtle variant is for decoration, so it is held to the 3:1 UI threshold
     * and NOT used for body text. Recorded so the distinction is deliberate.
     */
    it('the subtle variant is only good enough for large text, and is documented as decorative', () => {
        const surface = composite(SLATE_900, 0.35, TIER_WORST.Amber);
        expect(check('#ffffff', surface).ratio).toBeGreaterThanOrEqual(AA_LARGE);
    });
});

describe('the neutral surfaces', () => {
    /** `SURFACE` light is `bg-white/70` over a slate-50 page. */
    it('carries slate-900 body text in light mode', () => {
        const surface = composite('#ffffff', 0.70, '#f8fafc');
        expect(check('#0f172a', surface).ratio).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    /** `SURFACE` dark is `bg-slate-900/55` over the app's near-black page. */
    it('carries white body text in dark mode', () => {
        const surface = composite(SLATE_900, 0.55, '#0b1120');
        expect(check('#ffffff', surface).ratio).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    /**
     * Muted text is where a design gets away with things. slate-500 on the light
     * glass surface is the lightest the page uses for anything a person must read.
     */
    it('carries muted slate-500 captions at AA', () => {
        const surface = composite('#ffffff', 0.70, '#f8fafc');
        expect(check('#64748b', surface).ratio).toBeGreaterThanOrEqual(AA_NORMAL);
    });
});

/**
 * ==============================================================================
 * THE ROSTER'S VIEW SWITCHER — Department | My week
 * ==============================================================================
 * The selected half used to be `bg-slate-700` behind white text: a heavy dark
 * block the owner read as a different control from the half beside it
 * (2026-09-01). It is now a soft indigo tint in the same family as the Export
 * button, which is a much lighter background — so the text colour is what has to
 * be checked, and it is checked here rather than assumed.
 *
 * ⚠️ `text-xs font-bold` IS NORMAL TEXT TO WCAG, NOT LARGE. Large starts at 18.66px
 *    bold; this is 12px. So the bar is AA_NORMAL (4.5), not AA_LARGE (3.0) — the
 *    easy mistake would be to grade a "small bold label" against 3.0 and ship a
 *    tint that fails for anybody reading a ward tablet at arm's length.
 */
describe('the roster view switcher reads at AA in both themes', () => {
    // Tailwind v3, as compiled: the classes on the two buttons.
    const INDIGO_100 = '#e0e7ff';
    const INDIGO_300 = '#a5b4fc';
    const INDIGO_700 = '#4338ca';
    const INDIGO_900 = '#312e81';
    const SLATE_300 = '#cbd5e1';
    const SLATE_600 = '#475569';
    const SLATE_100 = '#f1f5f9';
    const WHITE = '#ffffff';

    it('carries the SELECTED half in light mode', () => {
        // `bg-indigo-100 text-indigo-700`
        expect(check(INDIGO_700, INDIGO_100).passesNormal).toBe(true);
        expect(check(INDIGO_700, INDIGO_100).ratio).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it('carries the SELECTED half in dark mode, composited', () => {
        // `dark:bg-indigo-900/40 dark:text-indigo-300`, over the card's slate-900.
        const surface = composite(INDIGO_900, 0.40, '#0f172a');
        expect(check(INDIGO_300, surface).passesNormal).toBe(true);
    });

    it('carries the UNSELECTED half, resting and hovered, in both themes', () => {
        expect(check(SLATE_600, WHITE).passesNormal).toBe(true);
        expect(check(SLATE_600, SLATE_100).passesNormal).toBe(true);      // hover
        expect(check(SLATE_300, '#0f172a').passesNormal).toBe(true);      // dark resting
        expect(check(SLATE_300, '#334155').passesNormal).toBe(true);      // dark hover, slate-700
    });

    /**
     * ⚠️ THIS IS THE ASSERTION THAT CAUGHT THE REAL DEFECT, and it was written
     *    expecting the opposite. The claim being made was "the text colour changes
     *    too, and that difference is large". It is not: slate-600 and indigo-700
     *    are 1.04:1 apart. The soft tint separates the two halves by HUE and
     *    essentially not at all by lightness, which makes colour the sole carrier
     *    of which view is selected — WCAG 1.4.1. Hence the ring below.
     */
    it('cannot tell the halves apart by lightness — the tint is hue, not value', () => {
        expect(check(WHITE, INDIGO_100).ratio).toBeLessThan(1.3);
        expect(check(SLATE_600, INDIGO_700).ratio).toBeLessThan(1.3);
    });

    it('carries the state with a RING, so it survives greyscale', () => {
        const INDIGO_600 = '#4f46e5';
        const INDIGO_400 = '#818cf8';
        // WCAG 1.4.11 asks 3:1 of a UI component's visual boundary — against the
        // fill it sits on AND against the half beside it, since that is the
        // comparison a reader actually makes.
        expect(check(INDIGO_600, INDIGO_100).ratio).toBeGreaterThanOrEqual(AA_LARGE);
        expect(check(INDIGO_600, WHITE).ratio).toBeGreaterThanOrEqual(AA_LARGE);
        // Dark mode, over the composited selected fill.
        const surface = composite(INDIGO_900, 0.40, '#0f172a');
        expect(check(INDIGO_400, surface).ratio).toBeGreaterThanOrEqual(AA_LARGE);
    });
});
