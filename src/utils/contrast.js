/**
 * ==============================================================================
 * CONTRAST — the check that keeps a redesign honest
 * ==============================================================================
 *
 * The result page tells a member of the public about their own health, in four
 * languages, on whatever phone they have, often outdoors. Translucent surfaces
 * over a saturated tier colour are exactly where text contrast quietly fails, and
 * "it looked fine on my monitor" is not a measurement.
 *
 * So the pairs the design actually uses are asserted in `contrast.test.js` against
 * the WCAG 2.1 relative-luminance formula. A glass treatment that drops a label
 * below threshold fails `npm test` rather than shipping.
 *
 * ── THRESHOLDS ───────────────────────────────────────────────────────────────
 *
 *   4.5 : 1   normal text  (WCAG AA)
 *   3.0 : 1   large text — 24px, or 18.66px bold (WCAG AA)
 *   3.0 : 1   UI component boundaries and graphical objects
 *
 * ⚠️ LARGE-TEXT 3:1 IS NOT A LOOPHOLE. It applies to the risk-tier label because
 *    that is genuinely 24px+ and bold. It does not apply to the caption beneath
 *    it, and using the large threshold for small text because it passes is how a
 *    page ends up unreadable in sunlight while satisfying a spreadsheet.
 */

/** `#rgb` or `#rrggbb` → `{r,g,b}` 0–255. Throws on anything else, loudly. */
export const parseHex = (hex) => {
    const value = String(hex).trim().replace(/^#/, '');
    const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Not a hex colour: ${hex}`);
    return {
        r: parseInt(full.slice(0, 2), 16),
        g: parseInt(full.slice(2, 4), 16),
        b: parseInt(full.slice(4, 6), 16),
    };
};

/** WCAG 2.1 relative luminance. */
export const luminance = (hex) => {
    const { r, g, b } = parseHex(hex);
    const channel = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** Contrast ratio, 1–21. Order of arguments does not matter. */
export const contrastRatio = (a, b) => {
    const la = luminance(a);
    const lb = luminance(b);
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
};

/**
 * Flattens a translucent colour over a background — which is the whole point of
 * checking a GLASS design rather than a flat one.
 *
 * ⚠️ A TRANSLUCENT SURFACE HAS NO CONTRAST OF ITS OWN. `bg-white/20` over amber is
 *    not white; it is whatever amber becomes with 20% white on top. Measuring the
 *    declared colour instead of the composited one is how a glass redesign passes
 *    a contrast audit and still fails on a phone.
 *
 * @param {string} fg      the translucent layer, as hex
 * @param {number} alpha   0–1
 * @param {string} bg      what is behind it, as hex
 */
export const composite = (fg, alpha, bg) => {
    const f = parseHex(fg);
    const b = parseHex(bg);
    const mix = (x, y) => Math.round(x * alpha + y * (1 - alpha));
    const hex = (n) => n.toString(16).padStart(2, '0');
    return `#${hex(mix(f.r, b.r))}${hex(mix(f.g, b.g))}${hex(mix(f.b, b.b))}`;
};

export const AA_NORMAL = 4.5;
export const AA_LARGE = 3.0;
export const AA_UI = 3.0;

/** `{ ratio, passesNormal, passesLarge }` — for a readable assertion message. */
export const check = (fg, bg) => {
    const ratio = contrastRatio(fg, bg);
    return {
        ratio: Math.round(ratio * 100) / 100,
        passesNormal: ratio >= AA_NORMAL,
        passesLarge: ratio >= AA_LARGE,
    };
};
