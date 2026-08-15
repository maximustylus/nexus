// src/utils/rosterCategories.js
//
// THE ONE PLACE THE FOUR STANDARD CATEGORIES AND THEIR COLOURS LIVE.
//
// The roster owner's palette, stated as a requirement on 2026-08-15:
// Management = yellow · Clinical = brown · Research = lime green ·
// Education = orange. Three surfaces need it — the calendar chips, the wizard's
// per-row category label, and the ICS export — and three copies of a colour map
// is how one surface ends up telling a different story from the file a colleague
// imported into Outlook. So: one map, everything derives.
//
// WHY THE `css` NAMES ARE LOAD-BEARING, NOT DECORATIVE. RFC 7986 §5.9 defines the
// ICS `COLOR:` property, and its value MUST be a CSS3 named colour. The owner's
// palette happens to be four literal CSS colour names — `yellow`, `brown`,
// `limegreen`, `orange` — so the file can carry the palette verbatim, and a
// calendar client that honours COLOR shows the same colour the app does.
//
// CATEGORY REMAINS AN OPAQUE STRING TO THE ENGINE, deliberately. Quotas pool over
// whatever category a team types (`WEEKEND`, `witnessing`, `ON CALL`), and the
// day the engine knows what "Clinical" means is the day the lab's WEEKEND quota
// stops being expressible. This module styles and suggests; it never restricts.
// The four below are offered — a datalist and a suggestion chip — never enforced.

/**
 * The four standard categories, in the order the picker offers them.
 *
 * `css`  — the RFC 7986 `COLOR:` value, a CSS3 colour name, exactly as the owner
 *          specified the palette.
 * `chip` — the calendar/wizard chip classes, in the same tinted visual language
 *          the calendar already speaks (`bg-X-50 text-X-800 …`), so a Clinical
 *          chip sits beside the existing VC and default chips without shouting.
 *          Brown has no Tailwind scale, so it is spelled in hex — same tint
 *          logic, hand-mixed.
 */
export const STANDARD_CATEGORIES = Object.freeze([
    Object.freeze({
        name: 'Clinical',
        css: 'brown',
        chip: 'bg-[#f2e6d8] text-[#6b4423] border border-[#dcc4a4] dark:bg-[#3f2d1d] dark:text-[#d4a97c] dark:border-[#6b4423]/60',
    }),
    Object.freeze({
        name: 'Education',
        css: 'orange',
        chip: 'bg-orange-50 text-orange-800 border border-orange-100 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800/50',
    }),
    Object.freeze({
        name: 'Research',
        css: 'limegreen',
        chip: 'bg-lime-50 text-lime-800 border border-lime-200 dark:bg-lime-900/30 dark:text-lime-400 dark:border-lime-800/50',
    }),
    Object.freeze({
        name: 'Management',
        css: 'yellow',
        chip: 'bg-yellow-50 text-yellow-800 border border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800/50',
    }),
]);

/**
 * Free text -> the standard category it names, or `null`.
 *
 * Case-insensitive and trimmed, because the box IS free text: "clinical",
 * "CLINICAL" and " Clinical " are all the same intent, and a colour that only
 * fires on one capitalisation would read as random.
 */
export const normalizeCategory = (value) => {
    if (typeof value !== 'string') return null;
    const wanted = value.trim().toLowerCase();
    if (wanted === '') return null;
    return STANDARD_CATEGORIES.find((entry) => entry.name.toLowerCase() === wanted) ?? null;
};

/** Free text -> the RFC 7986 `COLOR:` value, or `null` for a non-standard category. */
export const categoryCssColor = (value) => normalizeCategory(value)?.css ?? null;

/** Free text -> the chip classes, or `null` so the caller keeps its own fallback. */
export const categoryChipClass = (value) => normalizeCategory(value)?.chip ?? null;

/**
 * A task NAME -> a suggested category, with the word that earned it — or `null`.
 *
 * DETERMINISTIC AND EXPLAINABLE, deliberately not a model. Category is
 * load-bearing (quotas pool per category), so a suggestion that cannot say *why*
 * is a claim the roster master cannot check — the exact failure class the
 * post-mortem calls "claims decoupled from evidence". This returns the matched
 * word so the chip can read "looks like Education — 'supervision'", and the
 * caller renders it as a suggestion that is TAPPED, never applied. A suggestion
 * that loads without being chosen is a claim (see `suggestedShapeFor`, which set
 * this rule).
 *
 * The specific lists run before the broad one: "Research Clinic Audit" should
 * suggest Research (or Management), not Clinical, so Clinical — the widest net —
 * is checked last.
 */
const SUGGESTION_RULES = Object.freeze([
    Object.freeze({ category: 'Education', pattern: /\b(student|supervis\w*|teach\w*|train\w*|educat\w*|orientation|induction|preceptor\w*)\b/i }),
    Object.freeze({ category: 'Research', pattern: /\b(research|trial|ethics|grant|manuscript|journal|abstract|publicat\w*)\b/i }),
    Object.freeze({ category: 'Management', pattern: /\b(admin\w*|meeting|roster\w*|committee|audit\w*|governance|huddle|manag\w*|operations?)\b/i }),
    Object.freeze({ category: 'Clinical', pattern: /\b(clinic\w*|ward|rounds?|patients?|therapy|treatment|assessment|procedure|theatre|review)\b/i }),
]);

export const suggestCategoryFor = (taskName) => {
    if (typeof taskName !== 'string' || taskName.trim() === '') return null;
    for (const rule of SUGGESTION_RULES) {
        const match = taskName.match(rule.pattern);
        if (match) return { category: rule.category, because: match[0] };
    }
    return null;
};
