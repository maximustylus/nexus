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
 * WHAT IS DELIBERATELY *NOT* HERE: `leads` is fixed at 1 per task. The engine
 * refuses `leads: 0`, and `downloadCSV`/`downloadICS` only render one lead and
 * one co-lead, so a spinner up to 3 would produce exports that silently drop
 * people. Co-lead is a yes/no toggle for the same reason.
 * ==============================================================================
 */

import {
    DEFAULT_GRADE_BANDS,
    GRADE_SCALE,
    ROSTER_V2_DEFAULTS,
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
 * A task row. `leadBands` is an array of band names (empty = open to every
 * grade), `days` an array of engine day numbers, `coLead` a boolean.
 */
export const createTaskRow = (seed = {}) => ({
    id: nextRowId('task'),
    name: typeof seed.name === 'string' ? seed.name : '',
    leadBands: Array.isArray(seed.leadBands)
        ? BAND_NAMES.filter((band) => seed.leadBands.includes(band))
        : [],
    days: Array.isArray(seed.days) ? [...seed.days] : [...ROSTER_V2_DEFAULTS.days],
    coLead: seed.coLeads === undefined ? true : Number(seed.coLeads) > 0,
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

/** Is this string one of `GRADE_SCALE`? `''` (not recorded) is fine too. */
const gradeCellReason = (raw) => {
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (trimmed === '') return null;
    if (GRADE_SCALE.includes(trimmed)) return null;
    return `Grade "${trimmed}" is not on the allied-health scale (${GRADE_SCALE[0]}–${GRADE_SCALE[GRADE_SCALE.length - 1]}). Leave it blank if it is not recorded.`;
};

// --- THE MAPPING --------------------------------------------------------------

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');

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
 *     taskErrors,    // { [rowId]: { days? } }
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
 * Pure. No React, no dates-from-now, no I/O.
 */
export const buildDemoRosterV2ConfigFromTables = ({
    startDate,
    weeks,
    staffRows = [],
    taskRows = [],
    bandInputs,
    // Department policy the tables have no column for (maxConcurrentPerDay,
    // maxConsecutiveDays). "Load example department" supplies it; a typed-in
    // team leaves it empty and gets the engine's documented defaults.
    extraRules = null,
} = {}) => {
    const staffErrors = {};
    const taskErrors = {};

    // --- band boundaries ------------------------------------------------------
    // Checked FIRST and reported first: a task's chips are meaningless while the
    // boundaries do not partition the scale, so a gap has to be the message.
    const bands = inputsToBands(bandInputs);
    const bandCheck = validateGradeBands(bands);
    const bandsReason = bandCheck.valid ? null : bandCheck.reason;

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

        const days = Array.isArray(row?.days) ? [...row.days].sort((a, b) => a - b) : [];
        if (days.length === 0) {
            const reason = `Task ${name} has no days ticked, so it would generate nothing at all. Pick at least one day.`;
            taskErrors[row.id] = { days: reason };
            if (!firstTaskReason) firstTaskReason = reason;
            continue;
        }

        const leadBands = BAND_NAMES.filter((band) =>
            Array.isArray(row?.leadBands) ? row.leadBands.includes(band) : false,
        );

        tasks.push({
            name,
            days,
            leads: 1,
            coLeads: row?.coLead === false ? 0 : 1,
            // No chips ticked = open to every grade, which is how every task
            // behaved before grades existed. `leadBands: []` is refused by the
            // engine (nothing could satisfy it), so the key is omitted instead.
            ...(leadBands.length > 0 ? { leadBands } : {}),
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
    else if (firstStaffReason) reason = firstStaffReason;
    else if (firstTaskReason) reason = firstTaskReason;
    else if (staff.length === 0) reason = 'Add at least one person to the staff table before generating.';
    else if (tasks.length === 0) reason = 'Add at least one task to the task table before generating.';

    if (reason !== null) {
        return { ok: false, reason, config: null, bands, bandsReason, staffErrors, taskErrors };
    }

    const rules = {
        ...(extraRules && typeof extraRules === 'object' ? extraRules : {}),
        bands,
    };

    return {
        ok: true,
        reason: null,
        config: { startDate, weeks, staff, tasks, rules },
        bands,
        bandsReason,
        staffErrors,
        taskErrors,
    };
};
