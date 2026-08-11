/**
 * ==============================================================================
 * ROSTER WIZARD — THE SANDBOX'S STRUCTURED TABLES, AS PURE FUNCTIONS
 * ==============================================================================
 *
 * The sandbox Configure wizard used to be two comma-separated textareas. It is
 * now two TABLES — staff (name / grade / FTE / away) and tasks (task / who may
 * lead / days / co-lead) — plus an editor for the three grade-band boundaries.
 *
 * Everything in this file is PURE and exported, so the whole tables → engine
 * config mapping can be reasoned about and tested without a DOM. `RosterView`
 * owns the rows as React state and calls exactly one function here per render:
 * `buildDemoRosterV2ConfigFromTables`, which is both the validator (per-row
 * errors, one blocking reason) and the mapper (the `generateRosterV2` config).
 *
 * ⚠️ SANDBOX ONLY. Nothing here is reachable from live mode: live generation
 * still goes through `auraEngine`'s `prepareRosterWrite`, and the live wizard
 * still renders the two textareas, byte for byte as before.
 *
 * WHY THE ROWS CARRY MORE THAN THE COLUMNS SHOW. A staff row also holds
 * `skills`, and a task row also holds `requiresSkill`, `category` and
 * `maxPerDay`. Those are NOT editable in the table — there are no columns for
 * them — but "Load example department" fills them, and the example's one
 * deliberately unfillable slot exists BECAUSE only two people hold the CPET
 * skill. Dropping them on load would quietly turn the sandbox's headline
 * demonstration into a roster with nothing to report. They travel on the row
 * rather than in a parallel name-keyed map (which is what the textarea era did),
 * so renaming or deleting a row can no longer leave a skill behind attached to
 * somebody who is not in the pool.
 *
 * WHAT IS DELIBERATELY *NOT* HERE: `leads` is fixed at 1 per task, and co-lead
 * is a yes/no toggle. The engine refuses `leads: 0`, and a lead-plus-co-lead
 * shift is the only shape `buildShiftStaffLabel` can write, so a spinner up to 3
 * would produce a display string that silently drops people. A shift that really
 * needs three or four people is expressed the other way instead — as a SLOT LIST
 * (see the slots section below), which the engine staffs entry by entry and
 * reports in `assignees`.
 *
 * HOURS AND SLOTS ARE BOTH OPT-IN, AND BLANK MEANS BLANK. A task with no hours
 * typed emits no `hours` key at all, and the two department hours boxes emit no
 * `rules.weeklyHours` / `rules.maxHoursPerDay` while they are empty. That is not
 * laziness: `hoursModelRequested` in the engine switches the WHOLE hours model on
 * as soon as a configuration MENTIONS one of those fields, so emitting the
 * default 42 unasked would start refusing slots — on an hours ceiling nobody
 * typed — for every department that has never heard of hours. The wizard says so
 * on screen where the boxes are.
 * ==============================================================================
 */

import {
    DEFAULT_GRADE_BANDS,
    DEFAULT_TASK_HOURS,
    DEFAULT_WEEKLY_HOURS,
    GRADE_SCALE,
    ROSTER_V2_DEFAULTS,
    defaultMaxHoursPerDay,
    isDateKey,
    validateGradeBands,
// The `.js` extension is explicit, matching `rosterEngineV2.js`'s own import of
// `auraEngine.js`, so this module resolves under plain Node ESM as well as Vite.
} from './rosterEngineV2.js';

/**
 * The three band names, lowest first.
 *
 * Taken from the engine's own export rather than retyped: the engine REFUSES
 * `leadBands: ['Senior']` (capital S is not a band), so the one list the UI
 * builds its chips from has to be the one list the engine accepts.
 */
export const BAND_NAMES = Object.freeze(Object.keys(DEFAULT_GRADE_BANDS));

/** Title case for a band name, for chips and captions. `junior` -> `Junior`. */
export const bandLabel = (band) =>
    typeof band === 'string' && band.length > 0
        ? band.charAt(0).toUpperCase() + band.slice(1)
        : '';

/**
 * The 7-day toggle strip, Monday first, carrying the engine's day numbers
 * (0 = Sunday … 6 = Saturday, matching `Date.prototype.getDay`).
 *
 * Monday-first because the engine snaps every run back to a Monday, so a
 * Sunday-first strip would put the first day of the roster last.
 */
export const WEEKDAY_STRIP = Object.freeze([
    Object.freeze({ day: 1, label: 'Mon' }),
    Object.freeze({ day: 2, label: 'Tue' }),
    Object.freeze({ day: 3, label: 'Wed' }),
    Object.freeze({ day: 4, label: 'Thu' }),
    Object.freeze({ day: 5, label: 'Fri' }),
    Object.freeze({ day: 6, label: 'Sat' }),
    Object.freeze({ day: 0, label: 'Sun' }),
]);

/** How many blank staff / task rows the sandbox wizard opens with. */
export const DEFAULT_STAFF_ROWS = 5;
export const DEFAULT_TASK_ROWS = 3;

/**
 * Hours ceilings, as ARITHMETIC rather than as a copy of the engine's policy.
 *
 * `rosterEngineV2` refuses a task longer than 24h and a week longer than 168h,
 * but both of its ceilings are module-private and the engine is not editable this
 * phase — so re-stating them here would be a second definition that could drift.
 * These two are derived from the calendar instead (`24` hours in a day, seven of
 * those in a week), which is the same number for a reason that cannot change, and
 * `validateRosterV2Config` still runs on the finished config in `RosterView`, so
 * the engine remains the backstop rather than this file being the authority.
 */
export const HOURS_IN_A_DAY = 24;
export const HOURS_IN_A_WEEK = HOURS_IN_A_DAY * 7;

/**
 * How many slots one shift may list in the wizard.
 *
 * The engine accepts one or more; the WIZARD offers two to four, which is the
 * range the embryology and lab interviews actually described (a witnessing trio,
 * occasionally a fourth pair of hands). One slot is not offered because it is
 * lead-with-no-co-lead written the long way round, and the plain shape already
 * says that. This is a UI range, not a validation rule — the mapper below accepts
 * any non-empty list, so a longer list arriving from a fixture is mapped rather
 * than truncated.
 */
export const SLOTS_MIN = 2;
export const SLOTS_MAX = 4;

/** The slot editor's "no band named" option value: any grade may fill the slot. */
export const ANY_BAND = '';

/**
 * The two department hours boxes, both EMPTY — what the wizard opens with, and what
 * it is reset to when the sandbox is entered or left.
 *
 * A function rather than a frozen constant so that each caller owns its object and
 * no `setState` can be handed the same reference twice; empty rather than
 * `{ weeklyHours: '42' }` for the reason spelled out in this file's header.
 */
export const EMPTY_HOURS_INPUTS = () => ({ weeklyHours: '', maxHoursPerDay: '' });

// --- ROW FACTORIES ------------------------------------------------------------
//
// Rows need a key that survives a removal, so they carry an `id`. The counter is
// the only mutable thing in this module; it is a fresh-identity source, not
// state anything reads back, and it never reaches the engine config.

let rowIdCounter = 0;
const nextRowId = (prefix) => {
    rowIdCounter += 1;
    return `${prefix}-${rowIdCounter}`;
};

/**
 * A staff row. `fte` and `away` are RAW STRINGS, deliberately: a half-typed
 * `0.` or a cleared field must survive a keystroke without becoming `NaN`, and
 * the parse into numbers/dates happens once, below, where it can be refused
 * with a reason.
 */
export const createStaffRow = (seed = {}) => ({
    id: nextRowId('staff'),
    name: typeof seed.name === 'string' ? seed.name : '',
    // '' means NOT RECORDED, and stays that way — never defaulted to AH7. The
    // engine bars an ungraded person from leading a band-gated task and warns
    // by name, which is the honest answer; inventing a grade here would put
    // somebody in charge of a duty their pay scale does not carry.
    grade: typeof seed.grade === 'string' ? seed.grade : '',
    fte: seed.fte === undefined || seed.fte === null ? String(ROSTER_V2_DEFAULTS.fte) : String(seed.fte),
    away: Array.isArray(seed.unavailable) ? seed.unavailable.join(', ') : (typeof seed.away === 'string' ? seed.away : ''),
    // Carried, not edited — see the header note.
    skills: Array.isArray(seed.skills) ? [...seed.skills] : [],
    ...(typeof seed.maxPerDay === 'number' ? { maxPerDay: seed.maxPerDay } : {}),
});

/**
 * ONE SLOT of a multi-slot shift: which band must fill it, and what skill it
 * needs. Both optional — `band: ''` is "any grade may take this one", and a blank
 * skill adds no skill of its own.
 *
 * `band` and `requiresSkill` are RAW STRINGS for the same reason `fte` is: a
 * half-typed skill name has to survive a keystroke. The id exists so removing the
 * middle slot of three cannot renumber React's keys underneath the other two.
 */
export const createTaskSlot = (seed = {}) => ({
    id: nextRowId('slot'),
    band: typeof seed.band === 'string' && BAND_NAMES.includes(seed.band) ? seed.band : ANY_BAND,
    requiresSkill: typeof seed.requiresSkill === 'string' ? seed.requiresSkill : '',
});

/**
 * The slot list a task starts with the moment somebody switches it to slot mode:
 * `SLOTS_MIN` entries, both open to ANY GRADE.
 *
 * Deliberately not `[principal, junior]` or any other pairing. A default that
 * named bands would be this file inventing a departmental hierarchy the visitor
 * never typed, and the engine's own note says a slot list is a set of
 * requirements rather than a description of a hierarchy.
 */
export const createDefaultTaskSlots = () =>
    Array.from({ length: SLOTS_MIN }, () => createTaskSlot());

/**
 * A task row. `leadBands` is an array of band names (empty = open to every
 * grade), `days` an array of engine day numbers, `coLead` a boolean.
 *
 * `hours` is a RAW STRING and `''` means "use the engine's default" — never 0.
 * `slotMode` is the opt-in switch for a multi-slot shift: `false` keeps the row
 * exactly the lead + optional co-lead shape it has always had, and the `slots`
 * list sits beside it unread until the switch is on, so turning slot mode off and
 * on again does not lose what was typed.
 */
export const createTaskRow = (seed = {}) => ({
    id: nextRowId('task'),
    name: typeof seed.name === 'string' ? seed.name : '',
    leadBands: Array.isArray(seed.leadBands)
        ? BAND_NAMES.filter((band) => seed.leadBands.includes(band))
        : [],
    days: Array.isArray(seed.days) ? [...seed.days] : [...ROSTER_V2_DEFAULTS.days],
    coLead: seed.coLeads === undefined ? true : Number(seed.coLeads) > 0,
    // Blank = the engine's DEFAULT_TASK_HOURS, which the wizard shows as the
    // input's placeholder rather than filling in. A number seeded from a fixture
    // becomes its own string so the cell is editable from the first keystroke.
    hours: typeof seed.hours === 'number' && Number.isFinite(seed.hours)
        ? String(seed.hours)
        : (typeof seed.hours === 'string' ? seed.hours : ''),
    // A fixture that already carries `slots` opens in slot mode; everything else
    // opens in the shape it always had.
    slotMode: Array.isArray(seed.slots) && seed.slots.length > 0,
    slots: Array.isArray(seed.slots) && seed.slots.length > 0
        ? seed.slots.map((entry) => createTaskSlot(entry))
        : createDefaultTaskSlots(),
    // Carried, not edited — see the header note.
    ...(typeof seed.requiresSkill === 'string' && seed.requiresSkill.trim() !== ''
        ? { requiresSkill: seed.requiresSkill }
        : {}),
    ...(typeof seed.category === 'string' && seed.category.trim() !== ''
        ? { category: seed.category }
        : {}),
});

/** `DEFAULT_STAFF_ROWS` blank staff rows — what the sandbox wizard opens with. */
export const createEmptyStaffRows = (count = DEFAULT_STAFF_ROWS) =>
    Array.from({ length: count }, () => createStaffRow());

/** `DEFAULT_TASK_ROWS` blank task rows, each defaulting to Mon–Fri. */
export const createEmptyTaskRows = (count = DEFAULT_TASK_ROWS) =>
    Array.from({ length: count }, () => createTaskRow());

// --- BAND BOUNDARY EDITOR -----------------------------------------------------

/**
 * Band boundaries -> the editor's six text inputs.
 * `{ junior: [7, 12], … }` -> `{ junior: { min: '7', max: '12' }, … }`.
 */
export const bandsToInputs = (bands = DEFAULT_GRADE_BANDS) => {
    const source = bands && typeof bands === 'object' ? bands : DEFAULT_GRADE_BANDS;
    const inputs = {};
    for (const band of BAND_NAMES) {
        const range = Array.isArray(source[band]) ? source[band] : DEFAULT_GRADE_BANDS[band];
        inputs[band] = { min: String(range[0]), max: String(range[1]) };
    }
    return inputs;
};

/**
 * The editor's six inputs -> a `rules.bands` object for `validateGradeBands`.
 *
 * A blank or unreadable box becomes `null`, NOT 0 and NOT a silent default:
 * `validateGradeBands` then says "band bounds are whole grade numbers between 7
 * and 17", which is a reason about the box the user just emptied. Coercing to a
 * default would hide a half-finished edit and generate against boundaries the
 * user cannot see.
 */
export const inputsToBands = (inputs) => {
    const readBound = (raw) => {
        if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
        if (typeof raw !== 'string') return null;
        const trimmed = raw.trim();
        if (trimmed === '') return null;
        const value = Number(trimmed);
        return Number.isFinite(value) ? value : null;
    };

    const bands = {};
    for (const band of BAND_NAMES) {
        const entry = inputs && typeof inputs === 'object' ? inputs[band] : undefined;
        bands[band] = [readBound(entry?.min), readBound(entry?.max)];
    }
    return bands;
};

/**
 * A set of band names as the grade span it implies: `['senior','principal']`
 * with the shipped boundaries -> `'AH13–AH17'`.
 *
 * Adjacent bands merge into one span; a deliberately non-contiguous pick reads
 * honestly as `'AH7–AH12, AH15–AH17'` rather than pretending to be one range.
 * Deliberately the same wording and the same en dash the engine's own warnings
 * use, so the chip caption and the warning below it cannot disagree.
 *
 * `''` for no selection (the caller says "any grade") and for boundaries that do
 * not partition the scale — with a broken partition there is no honest span to
 * name, and the validator's reason is what the user needs instead.
 */
export const describeBandRange = (selected, bands = DEFAULT_GRADE_BANDS) => {
    const wanted = Array.isArray(selected) ? selected : [];
    if (wanted.length === 0) return '';
    if (!validateGradeBands(bands).valid) return '';

    const spans = [];
    for (const band of BAND_NAMES) {
        if (!wanted.includes(band)) continue;
        const [min, max] = bands[band];
        const last = spans[spans.length - 1];
        if (last && last[1] + 1 === min) last[1] = max;
        else spans.push([min, max]);
    }
    return spans.map(([min, max]) => (min === max ? `AH${min}` : `AH${min}–AH${max}`)).join(', ');
};

// --- THE BAND RULER -----------------------------------------------------------
//
// The band editor is ONE ruler with TWO draggable dividers, not six number boxes.
// That is a correctness change wearing a UI change's clothes.
//
// With six independent numbers a user can express a GAP (AH12 in no band at all),
// an OVERLAP (two bands claiming AH12) or a partition that does not reach the ends
// of the scale, and the only defence is `validateGradeBands` complaining after the
// fact. With dividers those states are not reachable: the three bands are DERIVED
// from where the dividers sit —
//
//     junior = [7, a]        senior = [a + 1, b]        principal = [b + 1, 17]
//
// — so contiguity and full coverage of AH7–AH17 are properties of the arithmetic
// rather than things to check afterwards. The ONLY illegal state left to defend
// against is an EMPTY band, which is exactly `7 <= a < b <= 16`, and that is what
// `bandDividerLimits` enforces by letting each divider's travel be bounded by its
// neighbours. A divider cannot cross another divider, so it cannot invert a band.
//
// The scale, the band names and the band ORDER all come from the engine's own
// exports rather than being retyped here, so the ruler cannot draw a scale, or a
// number of bands, that `validateGradeBands` would refuse.
//
// Everything here is PURE and DOM-free: the constraint arithmetic is testable
// without a renderer, and `RosterDemoWizardTables` stays presentation-only.

/**
 * The AH scale as plain numbers, `[7 … 17]`, derived from the engine's
 * `GRADE_SCALE` so there is one definition of "which grades exist".
 */
export const RULER_GRADES = Object.freeze(
    GRADE_SCALE.map((grade) => Number(String(grade).replace(/^AH/i, ''))),
);

const RULER_MIN = RULER_GRADES[0];
const RULER_MAX = RULER_GRADES[RULER_GRADES.length - 1];

/**
 * The dividers, low to high — one between each adjacent pair of bands.
 *
 * Derived from `BAND_NAMES` rather than hard-coded as two, because "how many
 * dividers" is not an independent fact: it is `bands - 1`, and writing `2` here
 * would be a second place to update if the engine's band list ever changed.
 *
 * Divider `i` is identified by the grade at which the band BELOW it ends, which
 * is the value the slider reports as `aria-valuenow`.
 */
export const BAND_DIVIDERS = Object.freeze(
    BAND_NAMES.slice(0, -1).map((below, index) =>
        Object.freeze({ below, above: BAND_NAMES[index + 1] }),
    ),
);

/**
 * How far may divider `index` travel, given where its neighbours sit?
 * `{ min, max }`, inclusive, in grade numbers.
 *
 * The floor is one grade above the divider below it (or the bottom of the scale);
 * the ceiling is one grade below the divider above it (or one below the top of the
 * scale, so the topmost band always keeps at least AH17). These are the numbers the
 * slider publishes as `aria-valuemin` / `aria-valuemax`, so the value a screen
 * reader announces as the limit is the same value Home and End actually reach.
 */
export const bandDividerLimits = (dividers, index) => {
    const list = Array.isArray(dividers) ? dividers : [];
    const below = index > 0 ? list[index - 1] : null;
    const above = index < list.length - 1 ? list[index + 1] : null;
    return {
        min: Number.isInteger(below) ? below + 1 : RULER_MIN,
        max: Number.isInteger(above) ? above - 1 : RULER_MAX - 1,
    };
};

/** Divider positions -> the band spans they imply. Total: always a partition. */
const segmentsFromDividers = (dividers) =>
    BAND_NAMES.map((band, index) => ({
        band,
        min: index === 0 ? RULER_MIN : dividers[index - 1] + 1,
        max: index === dividers.length ? RULER_MAX : dividers[index],
    }));

/**
 * `inputs` (the wizard's band state, unchanged in shape) -> everything the ruler
 * needs to draw itself and everything a slider needs to describe itself:
 *
 *   {
 *     dividers,          // [a, b] — grade at which each band below a divider ends
 *     limits,            // [{ min, max }, …] — legal travel, one per divider
 *     segments,          // [{ band, min, max }, …] — the regions, low to high
 *     bands,             // the same thing as a `rules.bands` object
 *     representsInputs,  // does the ruler show the state it was handed?
 *   }
 *
 * `representsInputs` is the honesty flag. The ruler can only draw a partition, so
 * when it is handed something that is not one (a half-typed state left behind by
 * the old six-box editor, or a caller passing bands from elsewhere) it draws the
 * NEAREST partition and reports `false`, and the component says so on screen. It
 * does NOT fire a change to correct the state — a control that rewrites its own
 * value on render generates against boundaries the user never chose, which is the
 * failure the six-box editor's comment argued against and still applies. The first
 * deliberate move adopts what the ruler is showing; until then the discrepancy is
 * visible and `validateGradeBands` is still the thing blocking Generate.
 */
export const bandRulerModel = (inputs) => {
    const parsed = inputsToBands(inputs);

    const dividers = [];
    for (let index = 0; index < BAND_DIVIDERS.length; index += 1) {
        const { below } = BAND_DIVIDERS[index];
        const wanted = Array.isArray(parsed[below]) ? parsed[below][1] : null;
        // A blank or unreadable box has no position on a ruler at all, so it falls
        // back to the shipped cut — never to 0, which is off the scale entirely.
        const fallback = DEFAULT_GRADE_BANDS[below][1];
        const requested = Number.isInteger(wanted) ? wanted : fallback;
        // Floor from the divider already placed; the ceiling leaves one grade for
        // every band still above this divider, including the topmost.
        const floor = index === 0 ? RULER_MIN : dividers[index - 1] + 1;
        const ceiling = RULER_MAX - (BAND_DIVIDERS.length - index);
        dividers.push(Math.min(Math.max(requested, floor), ceiling));
    }

    const segments = segmentsFromDividers(dividers);
    const bands = {};
    for (const segment of segments) bands[segment.band] = [segment.min, segment.max];

    const representsInputs = BAND_NAMES.every(
        (band) =>
            Array.isArray(parsed[band])
            && parsed[band][0] === bands[band][0]
            && parsed[band][1] === bands[band][1],
    );

    return {
        dividers,
        limits: dividers.map((_, index) => bandDividerLimits(dividers, index)),
        segments,
        bands,
        representsInputs,
    };
};

/**
 * Ask for divider `index` to sit at grade `requested`. Returns the clamped result
 * and the `onBandChange(band, bound, value)` patches that express it:
 *
 *   { ok, value, dividers, segments, patches: [[band, bound, string], …] }
 *
 * CLAMPED, NOT REFUSED. A ruler that ignores a drag past its neighbour feels
 * broken; one that lets it through expresses an overlap. So an out-of-range
 * request stops at the limit. This is the one place in this wizard where silently
 * correcting the input is right, and the reason is narrow: the input is a POINTER
 * POSITION or an arrow key, not a number somebody typed and can re-read.
 *
 * PATCHES ARE MINIMAL AND COMPLETE. They carry every bound whose current string
 * differs from the partition being committed — normally exactly two (the band
 * below ends here, the band above starts one grade later), and more only when the
 * incoming state was not a partition, in which case the first deliberate move
 * adopts the whole of what the ruler has been showing. Emitting only one side of a
 * divider is precisely how a gap or an overlap would get into the state, so the
 * two sides always travel together.
 *
 * The caller must apply all of them before the next render. `RosterView`'s
 * `patchBandInput` uses the functional `setState(prev => …)` form, and React
 * batches the calls made from one event handler into a single re-render, so no
 * intermediate non-partition is ever rendered, validated or generated from.
 */
export const moveBandDivider = (inputs, index, requested) => {
    const model = bandRulerModel(inputs);
    if (!Number.isInteger(index) || index < 0 || index >= model.dividers.length) {
        return { ok: false, value: null, dividers: model.dividers, segments: model.segments, patches: [] };
    }

    const { min, max } = model.limits[index];
    const wanted = Number.isInteger(requested) ? requested : model.dividers[index];
    const value = Math.min(Math.max(wanted, min), max);

    const dividers = model.dividers.map((entry, position) => (position === index ? value : entry));
    const segments = segmentsFromDividers(dividers);

    const patches = [];
    for (const segment of segments) {
        const current = inputs && typeof inputs === 'object' ? inputs[segment.band] : undefined;
        if (String(current?.min) !== String(segment.min)) patches.push([segment.band, 'min', String(segment.min)]);
        if (String(current?.max) !== String(segment.max)) patches.push([segment.band, 'max', String(segment.max)]);
    }

    return { ok: true, value, dividers, segments, patches };
};

/**
 * A fraction along the ruler (0 = the left edge of AH7, 1 = the right edge of
 * AH17) -> the divider value whose LINE is nearest that point.
 *
 * The scale has 11 grades and therefore 12 boundary lines. Line `k` sits after
 * grade `RULER_MIN + k - 1`, which is the divider value; rounding rather than
 * flooring is what makes a drag snap to the nearest line rather than to whichever
 * cell the pointer happens to be inside. Deliberately UNCLAMPED — `moveBandDivider`
 * owns the clamp, so there is exactly one clamp and one place to test it.
 */
export const bandDividerAtFraction = (fraction) => {
    const clamped = Number.isFinite(fraction) ? Math.min(Math.max(fraction, 0), 1) : 0;
    return RULER_MIN - 1 + Math.round(clamped * RULER_GRADES.length);
};

// --- PER-CELL PARSERS ---------------------------------------------------------

/** One definition of "the value of this cell, with the whitespace taken off". */
const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');

/** The FTE range the wizard accepts. The engine allows anything in (0, 1]. */
export const FTE_MIN = 0.1;
export const FTE_MAX = 1.0;

/**
 * An FTE cell -> `{ ok, value, reason }`.
 *
 * A BLANK cell is the engine's default (1.0), not an error: the column is
 * prefilled with 1.0 and "I cleared it" should mean "full time", which is what
 * the wizard's caption says and what a row with no detail has always meant.
 */
export const parseFteCell = (raw) => {
    const trimmed = typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
    if (trimmed === '') return { ok: true, value: ROSTER_V2_DEFAULTS.fte, reason: null };

    const value = Number(trimmed);
    if (!Number.isFinite(value)) {
        return { ok: false, value: null, reason: `FTE "${trimmed}" is not a number — use a decimal between ${FTE_MIN} and ${FTE_MAX}, e.g. 0.6.` };
    }
    if (value < FTE_MIN || value > FTE_MAX) {
        return { ok: false, value: null, reason: `FTE ${value} is outside ${FTE_MIN}–${FTE_MAX}. A 3-day week is 0.6; 1.0 is full time.` };
    }
    return { ok: true, value, reason: null };
};

/**
 * How many days a week this department actually runs: the number of DISTINCT
 * weekdays ticked across every task.
 *
 * Accepts either the wizard's task ROWS or a generated config's task list —
 * both carry `days` as engine day numbers — so the figure the wizard shows while
 * somebody is typing and the figure the report shows after a run come from one
 * function. A task with no `days` (a monthly `recurrence`, which this wizard
 * cannot express but a fixture could) contributes nothing rather than throwing.
 */
export const countWorkingDays = (items) => {
    const seen = new Set();
    for (const item of Array.isArray(items) ? items : []) {
        for (const day of Array.isArray(item?.days) ? item.days : []) {
            if (Number.isInteger(day) && day >= 0 && day <= 6) seen.add(day);
        }
    }
    return seen.size;
};

/**
 * An FTE, in the words a clinician uses about their own contract: `0.6` on a
 * five-day department is `'works 3 days a week'`.
 *
 * COMPUTED FROM THE DEPARTMENT'S OWN WEEK, never from a hard-coded 5. A lab that
 * runs Saturdays has a six-day week, and telling its 0.6 part-timer they work
 * three days would be wrong by half a day — so `workingDays` comes from
 * `countWorkingDays` above and the answer follows it.
 *
 * `''` when there is nothing honest to say: no days ticked anywhere (the
 * department has no week yet), or an FTE that is not a positive number. The
 * caller keeps showing the number itself either way — this is a gloss on the
 * figure, never a replacement for it.
 *
 * A non-integer result says `about`, and is rounded to one decimal: `0.6` of a
 * six-day week really is 3.6 days, and rounding that to "4 days" would overstate
 * somebody's contract in the direction that gets them rostered.
 */
export const describeFteAsDays = (fte, workingDays) => {
    const value = typeof fte === 'number' ? fte : Number(fte);
    if (!Number.isFinite(value) || value <= 0) return '';
    if (!Number.isInteger(workingDays) || workingDays <= 0) return '';

    const days = Math.round(value * workingDays * 10) / 10;
    if (days <= 0) return '';
    const unit = days === 1 ? 'day' : 'days';
    return Number.isInteger(days)
        ? `works ${days} ${unit} a week`
        : `works about ${days} ${unit} a week`;
};

/**
 * An "Away" cell -> `{ ok, dates, reason }`.
 *
 * Comma-separated `YYYY-MM-DD`, trimmed, empty segments ignored (so a trailing
 * comma is not an error). Anything else is REFUSED with the offending token
 * quoted — never dropped. A silently discarded leave date is somebody rostered
 * on the day they are away, which is the failure this whole engine exists to
 * make impossible.
 *
 * `isDateKey` is the engine's own check, so "2026-02-30" is refused here for
 * exactly the reason it would be refused there.
 */
export const parseAwayCell = (raw) => {
    const text = typeof raw === 'string' ? raw : '';
    const tokens = text
        .split(',')
        .map((token) => token.trim())
        .filter((token) => token !== '');

    const bad = tokens.filter((token) => !isDateKey(token));
    if (bad.length > 0) {
        return {
            ok: false,
            dates: [],
            reason: `${bad.length === 1 ? 'Leave date' : 'Leave dates'} ${bad.map((token) => `"${token}"`).join(', ')} ${bad.length === 1 ? 'is' : 'are'} not a real YYYY-MM-DD date. Separate several with commas, e.g. 2026-09-16, 2026-09-17.`,
        };
    }

    // Duplicates are harmless to the engine (it holds them in a Set) but a
    // repeated date usually means a paste went wrong, so they are collapsed
    // rather than passed through twice.
    return { ok: true, dates: [...new Set(tokens)], reason: null };
};

/**
 * An hours cell -> `{ ok, value, reason }`, where `value` is `null` for BLANK.
 *
 * `null` is the load-bearing part: it means "this key is not emitted at all", and
 * the caller spreads it away rather than writing a 0 or a 42. Zero would be a task
 * that takes no time (the engine refuses it, correctly); 42 typed on the user's
 * behalf would switch the whole hours model on for a department that never
 * mentioned hours. Blank has to survive all the way to the config as ABSENCE.
 *
 * Shaped exactly like `parseFteCell` — same return keys, same "refuse, never
 * clamp" rule, same habit of quoting what could not be read — because the two are
 * read by the same loop and rendered by the same per-cell error line.
 */
const parseHoursCell = (raw, { label, ceiling, example, blankMeans }) => {
    const trimmed = typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
    if (trimmed === '') return { ok: true, value: null, reason: null };

    const value = Number(trimmed);
    if (!Number.isFinite(value)) {
        return {
            ok: false,
            value: null,
            reason: `${label} "${trimmed}" is not a number of hours — use a number like ${example}. ${blankMeans}`,
        };
    }
    if (value <= 0 || value > ceiling) {
        return {
            ok: false,
            value: null,
            reason: `${label} ${value} must be more than 0 and at most ${ceiling}. ${blankMeans}`,
        };
    }
    return { ok: true, value, reason: null };
};

/** How long ONE occurrence of a task takes. Blank = `DEFAULT_TASK_HOURS`. */
export const parseTaskHoursCell = (raw) =>
    parseHoursCell(raw, {
        label: 'Hours',
        ceiling: HOURS_IN_A_DAY,
        example: DEFAULT_TASK_HOURS,
        blankMeans: `Leave it blank and AURA assumes ${DEFAULT_TASK_HOURS}h per session.`,
    });

/** The department's contracted week. Blank = hours are not tracked at all. */
export const parseWeeklyHoursCell = (raw) =>
    parseHoursCell(raw, {
        label: 'Standard working week',
        ceiling: HOURS_IN_A_WEEK,
        example: DEFAULT_WEEKLY_HOURS,
        blankMeans: 'Leave it blank and AURA counts duties only, not hours.',
    });

/** The department's daily ceiling. Blank = derived from the week, or untracked. */
export const parseDailyHoursCell = (raw) =>
    parseHoursCell(raw, {
        label: 'Longest working day',
        ceiling: HOURS_IN_A_DAY,
        example: defaultMaxHoursPerDay(DEFAULT_WEEKLY_HOURS),
        blankMeans: 'Leave it blank and AURA divides the working week over 5 days.',
    });

/**
 * The daily cap the engine will actually apply, given what is typed in the two
 * department boxes — so the wizard can SHOW the derived number instead of
 * re-implementing the division. Mirrors `resolveHoursRules`: the derivation
 * follows the week that was typed, not the shipped one.
 */
export const derivedDailyHours = (weeklyRaw) => {
    const weekly = parseWeeklyHoursCell(weeklyRaw);
    return defaultMaxHoursPerDay(weekly.ok && weekly.value !== null ? weekly.value : DEFAULT_WEEKLY_HOURS);
};

/**
 * A task row's slot list -> `{ ok, slots, reason }`, ready for `task.slots`.
 *
 * Each entry keeps `band` only when a band was named (an entry with no band is
 * open to any grade, and the engine reads an absent `band` as exactly that), and
 * `requiresSkill` only when a skill was typed. An empty list is REFUSED rather
 * than silently falling back to lead + co-lead: a shift the user has told the
 * wizard needs a team, and which then quietly generates as one person plus a
 * helper, is the class of silence this whole module exists to avoid.
 */
export const parseTaskSlots = (rawSlots) => {
    const list = Array.isArray(rawSlots) ? rawSlots : [];

    if (list.length === 0) {
        return {
            ok: false,
            slots: [],
            reason: 'This shift is set to a list of slots but the list is empty, so the shift would need nobody at all. Add a slot for each person it needs, or switch it back to one lead plus a co-lead.',
        };
    }

    const slots = [];
    for (let index = 0; index < list.length; index += 1) {
        const entry = list[index];
        const band = trimmed(entry?.band);
        const skill = trimmed(entry?.requiresSkill);

        if (band !== '' && !BAND_NAMES.includes(band)) {
            return {
                ok: false,
                slots: [],
                reason: `Slot ${index + 1} names the band "${band}", which is not one of ${BAND_NAMES.join(', ')}. Choose a band, or leave it as any grade.`,
            };
        }

        slots.push({
            ...(band === '' ? {} : { band }),
            ...(skill === '' ? {} : { requiresSkill: skill }),
        });
    }

    return { ok: true, slots, reason: null };
};

/** Is this string one of `GRADE_SCALE`? `''` (not recorded) is fine too. */
const gradeCellReason = (raw) => {
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (trimmed === '') return null;
    if (GRADE_SCALE.includes(trimmed)) return null;
    return `Grade "${trimmed}" is not on the allied-health scale (${GRADE_SCALE[0]}–${GRADE_SCALE[GRADE_SCALE.length - 1]}). Leave it blank if it is not recorded.`;
};

// --- THE MAPPING --------------------------------------------------------------

/**
 * 🧪 SANDBOX: the wizard's tables -> a `generateRosterV2` config.
 *
 * THE one function `RosterView` calls. It both refuses and maps, because the
 * two cannot be allowed to disagree: a cell the UI shows as fine but the mapper
 * drops is exactly how a leave date disappears.
 *
 * Returns, always:
 *
 *   {
 *     ok,            // may Generate run?
 *     reason,        // the FIRST blocking reason, written to be shown verbatim
 *     config,        // the engine config, or null when !ok
 *     bands,         // the parsed boundaries (even when they are invalid)
 *     bandsReason,   // validateGradeBands' reason, or null
 *     staffErrors,   // { [rowId]: { name?, grade?, fte?, away? } }
 *     taskErrors,    // { [rowId]: { days?, hours?, slots? } }
 *     hoursErrors,   // { weeklyHours?, maxHoursPerDay? } — department-level
 *   }
 *
 * ROWS WITH A BLANK NAME ARE IGNORED — the wizard opens with five of them and
 * three blank task rows, and an untouched row is not a mistake. A blank name
 * with a grade or a leave date typed beside it IS reported, because that is a
 * half-finished row whose content would otherwise vanish without a word.
 *
 * BAND KEYS ARE LOWER CASE. The engine refuses `'Senior'` outright, so the
 * chips carry `BAND_NAMES` (its own export) and this function never re-spells
 * them.
 *
 * A BLANK GRADE IS OMITTED, NOT DEFAULTED. `grade` is absent from the staff
 * object rather than present as `''` or `'AH7'`. The engine treats absent as
 * "unknown", bars that person from leading band-gated tasks, and warns by name —
 * and that warning is the point: it is surfaced in the sandbox report.
 *
 * A BLANK HOURS BOX IS OMITTED TOO, and for a bigger reason than the grade. The
 * engine's hours model is opt-in on MENTION: `rules: { weeklyHours: 42 }` turns it
 * on even though 42 is also the default. So emitting 42 for an empty box would
 * start refusing slots against an hours ceiling nobody typed, and would change the
 * roster of every department that has never heard of hours. Blank stays blank all
 * the way down; typing either box, or any task's hours, is what switches the model
 * on, and the wizard says so beside the boxes.
 *
 * A SLOT LIST REPLACES `leads`/`coLeads`, IT DOES NOT REFINE THEM. The engine
 * refuses a task carrying `slots` alongside `leads`, `coLeads`, `leadBands` or
 * `continuity: true` — measured, all five refusals, not inferred from the
 * comments — so a slot-mode row emits `slots` and NONE of those keys, and the
 * wizard hides the band chips and the co-lead toggle for that row rather than
 * showing controls whose value would be dropped here.
 *
 * Pure. No React, no dates-from-now, no I/O.
 */
export const buildDemoRosterV2ConfigFromTables = ({
    startDate,
    weeks,
    staffRows = [],
    taskRows = [],
    bandInputs,
    // The two department hours boxes, as raw strings: `{ weeklyHours,
    // maxHoursPerDay }`. Both blank by default, which means "do not track hours".
    hoursInputs = null,
    // Department policy the tables have no column for (maxConcurrentPerDay,
    // maxConsecutiveDays). "Load example department" supplies it; a typed-in
    // team leaves it empty and gets the engine's documented defaults.
    extraRules = null,
} = {}) => {
    const staffErrors = {};
    const taskErrors = {};
    const hoursErrors = {};

    // --- band boundaries ------------------------------------------------------
    // Checked FIRST and reported first: a task's chips are meaningless while the
    // boundaries do not partition the scale, so a gap has to be the message.
    const bands = inputsToBands(bandInputs);
    const bandCheck = validateGradeBands(bands);
    const bandsReason = bandCheck.valid ? null : bandCheck.reason;

    // --- department hours -----------------------------------------------------
    // Department-level, like the bands, so it is judged with them rather than
    // inside a row loop. Each box reports its own reason; both are blockers,
    // because a run generated against half of a typed hours policy is a roster
    // built to an ceiling the roster master did not set.
    const weeklyHours = parseWeeklyHoursCell(hoursInputs?.weeklyHours);
    const maxHoursPerDay = parseDailyHoursCell(hoursInputs?.maxHoursPerDay);
    if (!weeklyHours.ok) hoursErrors.weeklyHours = weeklyHours.reason;
    if (!maxHoursPerDay.ok) hoursErrors.maxHoursPerDay = maxHoursPerDay.reason;
    const hoursRulesReason = hoursErrors.weeklyHours || hoursErrors.maxHoursPerDay || null;

    // --- staff ---------------------------------------------------------------
    const staff = [];
    let firstStaffReason = null;

    for (const row of Array.isArray(staffRows) ? staffRows : []) {
        const name = trimmed(row?.name);
        const grade = trimmed(row?.grade);
        const away = typeof row?.away === 'string' ? row.away : '';
        const errors = {};

        const gradeReason = gradeCellReason(grade);
        if (gradeReason) errors.grade = gradeReason;

        const fte = parseFteCell(row?.fte);
        if (!fte.ok) errors.fte = fte.reason;

        const leave = parseAwayCell(away);
        if (!leave.ok) errors.away = leave.reason;

        if (name === '') {
            // An untouched row is silence. A row with content but no name is a
            // half-finished row, and saying nothing would drop that content.
            if (grade !== '' || away.trim() !== '') {
                errors.name = 'This row has a grade or leave dates but nobody to apply them to — add a name, or clear the row.';
            }
            if (Object.keys(errors).length > 0) staffErrors[row.id] = errors;
            if (!firstStaffReason && errors.name) firstStaffReason = errors.name;
            continue;
        }

        if (Object.keys(errors).length > 0) {
            staffErrors[row.id] = errors;
            if (!firstStaffReason) {
                firstStaffReason = `${name}: ${errors.grade || errors.fte || errors.away}`;
            }
            continue;
        }

        staff.push({
            name,
            fte: fte.value,
            skills: Array.isArray(row?.skills) ? [...row.skills] : [],
            unavailable: leave.dates,
            // Absent, not blank, not defaulted.
            ...(grade === '' ? {} : { grade }),
            ...(typeof row?.maxPerDay === 'number' ? { maxPerDay: row.maxPerDay } : {}),
        });
    }

    // --- tasks ---------------------------------------------------------------
    const tasks = [];
    let firstTaskReason = null;

    for (const row of Array.isArray(taskRows) ? taskRows : []) {
        const name = trimmed(row?.name);
        if (name === '') continue;

        // Collected per row rather than returned on the first failure, the way the
        // staff loop already does it: a row with an unreadable hours cell AND no
        // days ticked has two things wrong with it, and showing one at a time
        // costs the visitor a Generate press per mistake.
        const errors = {};

        const days = Array.isArray(row?.days) ? [...row.days].sort((a, b) => a - b) : [];
        if (days.length === 0) {
            errors.days = `Task ${name} has no days ticked, so it would generate nothing at all. Pick at least one day.`;
        }

        const hours = parseTaskHoursCell(row?.hours);
        if (!hours.ok) errors.hours = `Task ${name}: ${hours.reason}`;

        // Read only in slot mode. A slot list left behind by somebody who switched
        // the mode back off is not validated and not emitted — it is not part of
        // what this row means any more.
        const slotMode = row?.slotMode === true;
        const slotList = slotMode ? parseTaskSlots(row?.slots) : { ok: true, slots: [], reason: null };
        if (!slotList.ok) errors.slots = `Task ${name}: ${slotList.reason}`;

        if (Object.keys(errors).length > 0) {
            taskErrors[row.id] = errors;
            // `days` first, unchanged in wording and in precedence, because it is
            // the one this wizard has always reported and the sandbox tests read
            // it verbatim.
            if (!firstTaskReason) firstTaskReason = errors.days || errors.hours || errors.slots;
            continue;
        }

        const leadBands = BAND_NAMES.filter((band) =>
            Array.isArray(row?.leadBands) ? row.leadBands.includes(band) : false,
        );

        tasks.push({
            name,
            days,
            // EITHER a slot list OR lead + co-lead, never both keys — the engine
            // refuses `slots` beside `leads`, `coLeads` OR `leadBands`, and
            // `coLeads: 0` is refused just as loudly as `coLeads: 1`. So slot mode
            // omits all three, and the band chips and the co-lead toggle are
            // hidden for that row in the table rather than silently ignored here.
            ...(slotMode
                ? { slots: slotList.slots }
                : {
                    leads: 1,
                    coLeads: row?.coLead === false ? 0 : 1,
                    // No chips ticked = open to every grade, which is how every
                    // task behaved before grades existed. `leadBands: []` is
                    // refused by the engine (nothing could satisfy it), so the key
                    // is omitted instead.
                    ...(leadBands.length > 0 ? { leadBands } : {}),
                }),
            // Blank hours = no key at all, so a department that never typed an
            // hour gets the roster it got before hours existed, byte for byte.
            ...(hours.value === null ? {} : { hours: hours.value }),
            ...(typeof row?.requiresSkill === 'string' && row.requiresSkill.trim() !== ''
                ? { requiresSkill: row.requiresSkill.trim() }
                : {}),
            ...(typeof row?.category === 'string' && row.category.trim() !== ''
                ? { category: row.category.trim() }
                : {}),
        });
    }

    // --- the one blocking reason ---------------------------------------------
    // Ordered so that the message names the thing furthest upstream: broken
    // boundaries make every band chip a lie, and an empty pool makes both
    // tables moot.
    let reason = null;
    if (bandsReason) reason = bandsReason;
    else if (hoursRulesReason) reason = hoursRulesReason;
    else if (firstStaffReason) reason = firstStaffReason;
    else if (firstTaskReason) reason = firstTaskReason;
    else if (staff.length === 0) reason = 'Add at least one person to the staff table before generating.';
    else if (tasks.length === 0) reason = 'Add at least one task to the task table before generating.';

    if (reason !== null) {
        return { ok: false, reason, config: null, bands, bandsReason, staffErrors, taskErrors, hoursErrors };
    }

    const rules = {
        ...(extraRules && typeof extraRules === 'object' ? extraRules : {}),
        bands,
        // The two boxes win over anything `extraRules` carried, exactly as `bands`
        // does, and are ABSENT while the boxes are blank — see the note at the top
        // of this function for why an empty box must not become 42.
        ...(weeklyHours.value === null ? {} : { weeklyHours: weeklyHours.value }),
        ...(maxHoursPerDay.value === null ? {} : { maxHoursPerDay: maxHoursPerDay.value }),
    };

    return {
        ok: true,
        reason: null,
        config: { startDate, weeks, staff, tasks, rules },
        bands,
        bandsReason,
        staffErrors,
        taskErrors,
        hoursErrors,
    };
};
