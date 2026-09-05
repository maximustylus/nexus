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
 * THE ROSTER TOOLBAR — FOUR ICONS OVER 10px LABELS, ON NO BACKGROUND
 * ==============================================================================
 * The toolbar has no fills left. Every control is an icon and a label drawn
 * straight onto the card, so the ONLY thing standing between a roster master and
 * an unreadable control is the ink colour — which makes this file, rather than a
 * screenshot, the place the design is held.
 *
 * ⚠️ A 10px LABEL IS SMALL TEXT. Large starts at 18.66px bold. So these clear
 *    AA_NORMAL (4.5), not AA_LARGE (3.0) — the easy mistake is to grade a "tiny
 *    caption" against 3.0 and ship something nobody can read on a ward tablet.
 */
describe('the roster toolbar reads at AA in both themes', () => {
    // Tailwind v3, as compiled.
    const INDIGO_400 = '#818cf8';
    const INDIGO_600 = '#4f46e5';
    const SLATE_400 = '#94a3b8';
    const SLATE_500 = '#64748b';
    const WHITE = '#ffffff';        // the card, light mode
    const SLATE_800 = '#1e293b';    // the card, dark mode

    it('carries the SELECTED item in both themes', () => {
        expect(check(INDIGO_600, WHITE).passesNormal).toBe(true);          // 6.29
        expect(check(INDIGO_400, SLATE_800).passesNormal).toBe(true);      // 4.90
    });

    it('carries the UNSELECTED items in both themes', () => {
        expect(check(SLATE_500, WHITE).passesNormal).toBe(true);           // 4.76
        expect(check(SLATE_400, SLATE_800).passesNormal).toBe(true);       // 5.71
    });

    /**
     * ⚠️ WHY THE TOOLBAR DOES NOT SIMPLY COPY THE BOTTOM NAVIGATION. It was built
     *    to match `ResponsiveLayout`'s icon-over-label pattern, and that component
     *    uses `slate-400` for an inactive item — which on a white surface is
     *    2.56:1, below AA for text this small. The toolbar uses `slate-500`
     *    instead. This is pinned so the departure reads as a decision rather than
     *    an inconsistency, and so anyone tempted to "align them" sees the cost.
     *
     *    The bottom navigation itself is NOT changed here: different surface,
     *    separate decision, and not this change's to make.
     */
    it('does not copy the bottom navigation inactive grey, which fails AA on white', () => {
        expect(check(SLATE_400, WHITE).passesNormal).toBe(false);
        expect(check(SLATE_400, WHITE).ratio).toBeLessThan(AA_NORMAL);
    });

    /**
     * The underline under the selected item is a GRAPHIC, not text, so 1.4.11's
     * 3:1 applies rather than 4.5. It exists because colour cannot carry the state
     * on its own: indigo and slate sit close in lightness, so in greyscale the
     * items would be near identical. The stroke weight thickens for the same
     * reason — the two cues that survive without colour.
     */
    it('draws the selected underline well past the 3:1 a graphic needs', () => {
        expect(check(INDIGO_600, WHITE).ratio).toBeGreaterThanOrEqual(AA_LARGE);
        expect(check(INDIGO_400, SLATE_800).ratio).toBeGreaterThanOrEqual(AA_LARGE);
    });

    it('shows why the underline is needed: the two states are close in lightness', () => {
        // Selected indigo against unselected slate, light mode — near identical
        // once colour is removed. This is the measurement that put the underline
        // and the stroke weight there, and it is kept so nobody removes them.
        expect(check(INDIGO_600, SLATE_500).ratio).toBeLessThan(1.5);
    });
});
