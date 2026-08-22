/**
 * ==============================================================================
 * GLASS — the surface vocabulary for the community result screen
 * ==============================================================================
 *
 * Liquid glass, rounded containers, real depth. One place, so the screen, the
 * export and anything added later speak the same language instead of drifting
 * into three designs — which is how the PDF template came to carry its own
 * hardcoded styles that no change to the screen ever reached.
 *
 * ── ⚠️ THE OPACITIES HERE ARE MEASURED, NOT CHOSEN ──────────────────────────
 *
 * This page tells a member of the public about their own health, in four
 * languages, on whatever phone they have, frequently outdoors. Translucent
 * surfaces over a saturated colour are precisely where text contrast fails
 * quietly, so every value below was derived by compositing the layer over the
 * worst-case tier and measuring, and `contrast.test.js` re-measures on every run.
 *
 * ⚠️ WHAT THE MEASUREMENT FOUND IN THE OLD DESIGN. White text sat directly on the
 *    tier gradient, and on a `bg-white/20` chip over it:
 *
 *      white on amber-400  (#fbbf24)   1.67 : 1     catastrophic
 *      white on emerald-400(#34d399)   1.92 : 1     catastrophic
 *      white on rose-500   (#f43f5e)   3.67 : 1     large text only
 *      the tier chip, over amber       1.51 : 1     the WORST on the page
 *
 *    1.51:1 was carrying the tier label — the single most important sentence on
 *    the screen, the person's own result — and it was effectively unreadable in
 *    daylight. AA normal text is 4.5:1.
 *
 *    `ON_COLOR` is a dark frosted panel at 55%, which is the lowest opacity that
 *    clears 4.5:1 on ALL THREE tiers (amber, the worst, lands at 5.79:1) while
 *    still letting the tier colour read through the blur. Lowering it is a
 *    legibility decision, not a styling one, and the test will say so.
 */

/**
 * A frosted panel to place OVER the tier gradient. Carries white text at AA.
 * The border is a light hairline — the specular edge that makes glass read as a
 * pane rather than a wash.
 */
export const ON_COLOR = 'bg-slate-900/55 backdrop-blur-xl border border-white/25';

/** Same, lighter, for a non-text decorative panel where 3:1 UI contrast suffices. */
export const ON_COLOR_SUBTLE = 'bg-slate-900/35 backdrop-blur-lg border border-white/20';

/**
 * A neutral glass surface on the page background, light and dark. Text on this is
 * ordinary slate, which is why it can be far more transparent than `ON_COLOR`.
 */
export const SURFACE = 'bg-white/70 dark:bg-slate-900/55 backdrop-blur-xl '
                     + 'border border-white/70 dark:border-white/10';

/** A recessed surface — an inner panel inside a card. */
export const SURFACE_INSET = 'bg-slate-50/70 dark:bg-slate-950/40 backdrop-blur-md '
                           + 'border border-white/50 dark:border-white/5';

/**
 * Depth. Two layers — a wide soft ambient shadow and a tight contact shadow —
 * because a single large blur reads as fog rather than as elevation.
 */
export const LIFT = 'shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-8px_rgba(15,23,42,0.18)]';
export const LIFT_LG = 'shadow-[0_2px_4px_rgba(15,23,42,0.06),0_24px_56px_-12px_rgba(15,23,42,0.28)]';

/** One radius scale, so nothing is 14px next to 16px. */
export const R = {
    hero: 'rounded-[2rem]',
    card: 'rounded-3xl',
    panel: 'rounded-2xl',
    chip: 'rounded-full',
    control: 'rounded-2xl',
};

/** Composed presets — the shapes actually used, named for what they are. */
export const CARD = `${SURFACE} ${R.card} ${LIFT}`;
export const PANEL = `${SURFACE_INSET} ${R.panel}`;
export const HERO_CHIP = `${ON_COLOR} ${R.chip}`;
export const HERO_PANEL = `${ON_COLOR} ${R.panel}`;

/**
 * Motion, kept to a transform and an opacity so it stays cheap on a low-end
 * phone — and gated on `motion-safe` so a person who has asked their device for
 * less movement gets less movement.
 */
export const RISE = 'motion-safe:transition-all motion-safe:duration-500 ease-out';
