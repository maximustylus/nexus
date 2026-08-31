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
 * WHY THE ROWS CARRY MORE THAN THE COLUMNS SHOW. A staff row also holds `skills`,
 * and a task row also holds `requiresSkill`. Those two are still NOT editable —
 * there is no column and no drawer control for either — but "Load example
 * department" fills them, and the example's one deliberately unfillable slot exists
 * BECAUSE only two people hold the CPET skill. Dropping them on load would quietly
 * turn the sandbox's headline demonstration into a roster with nothing to report.
 * They travel on the row rather than in a parallel name-keyed map (which is what the
 * textarea era did), so renaming or deleting a row can no longer leave a skill
 * behind attached to somebody who is not in the pool.
 *
 * `category` and `maxPerDay` USED to be on that list and are not any more: both are
 * cells now (see the table below), because a constraint a fixture can set and a
 * roster master cannot is the defect this phase exists to close.
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
 *
 * ------------------------------------------------------------------------------
 * WHAT THE SANDBOX COULD NOT REACH UNTIL NOW, AND WHY THAT WAS A DEFECT
 * ------------------------------------------------------------------------------
 *
 * `ROSTER_QC_AUDIT_SURFACES.md` §3 enumerated nine engine capabilities with no UI
 * path at all. Seven of them were pure engine features with a validator, a gate,
 * an `unfilled` reason and a warning apiece, and NOTHING anywhere in `src/` that
 * could set them; two more (`task.quota`, `staff.windows`) landed after that audit
 * was written. Shipping a constraint nobody can invoke is the same defect as
 * shipping one that lies about what it did, and this repository had already been
 * caught committing it twice. This module now maps every one of them:
 *
 *   ENGINE FIELD               WIZARD SURFACE
 *   task.recurrence            per-task calendar mode: monthly nth-weekday
 *   task.continuity            per-task toggle, with the trade stated on screen
 *   task.quota                 per-task floor/ceiling per week or calendar month
 *   task.category              per-task label (was fixture-only)
 *   staff.maxPerDay            per-person duty cap (was fixture-only, unsettable)
 *   staff.windows              per-person availability windows (from/to/tasks)
 *   rules.maxConcurrentPerDay  department box (was "Load example" only)
 *   rules.maxConsecutiveDays   department box (was "Load example" only)
 *   rules.forbidPairs          department pair list (was unreachable, full stop)
 *
 * THE SAME BLANK-MEANS-BLANK RULE GOVERNS ALL OF THEM, and for two of them it is
 * load-bearing in exactly the way the hours model's is. `cohortWindowsRequested`
 * switches time-bounded eligibility on for the WHOLE configuration the moment any
 * staff entry carries a `windows` key, and `resolveQuotas` compiles a quota the
 * moment a task carries one — so an empty window row or a half-filled quota must
 * reach the config as ABSENCE, never as a shape the engine then judges everybody
 * against. Every parser below returns `null` for "not stated" and the emitters
 * spread that away.
 *
 * WHAT IS STILL NOT HERE, named rather than implied (see the ledger at the foot):
 * `rules.quotas` (the pooled category quota), `quota.scope`, `per: 'run'`, a window
 * `label`, `task.temporal` and `slot.role`.
 * ==============================================================================
 */

import {
    DEFAULT_GRADE_BANDS,
    DEFAULT_TASK_HOURS,
    DEFAULT_WEEKLY_HOURS,
    GRADE_SCALE,
    QUOTA_PERIODS,
    ROSTER_V2_DEFAULTS,
    defaultMaxHoursPerDay,
    isDateKey,
    validateGradeBands,
// The `.js` extension is explicit, matching `rosterEngineV2.js`'s own import of
// `auraEngine.js`, so this module resolves under plain Node ESM as well as Vite.
} from './rosterEngineV2.js';

/**
 * The band names, lowest first — four of them today (nonExempt, junior, senior,
 * principal), and however many the engine declares tomorrow. Derived from
 * `DEFAULT_GRADE_BANDS`, never a literal list.
 *
 * Taken from the engine's own export rather than retyped: the engine REFUSES
 * `leadBands: ['Senior']` (capital S is not a band), so the one list the UI
 * builds its chips from has to be the one list the engine accepts.
 */
export const BAND_NAMES = Object.freeze(Object.keys(DEFAULT_GRADE_BANDS));

/**
 * THE WIZARD'S STEPS, IN THE ORDER A ROSTER MASTER FILLS THEM IN.
 *
 * The configuration wizard is one sequence — who you are, when the roster runs,
 * how the department is shaped, who is in it, what they do — but it RENDERED as a
 * stack of similar-looking cards with no order to them, so nothing told a
 * first-time reader that "Staff" comes before "Tasks" for a reason, or how many
 * more panels were below the fold.
 *
 * The numbers and the connecting spine come from THIS LIST, and the step numbers
 * are its INDICES — not a `step={4}` written at each call site. Two of these
 * panels live in `RosterView.jsx` and five in `RosterDemoWizardTables.jsx`, so
 * hand-numbering would mean two files that must be kept in agreement, and
 * inserting a step in the middle would silently renumber nothing. Reorder or
 * insert here and both files follow, which is the same reason `BAND_DIVIDERS`
 * derives from `BAND_NAMES` rather than being written down as two.
 *
 * `label` is the accessible name of the step, not the heading — each panel keeps
 * its own visible heading. It is what a screen reader announces for the badge, so
 * "Step 4 of 7: Working hours" is speakable without the icon.
 */
/**
 * `NN7`–`NN10` — the Non-Nursing spelling of the support grades.
 *
 * DERIVED FROM THE SCALE'S OWN nonExempt BAND, never written down as four strings:
 * these are exactly the grades the engine calls `nonExempt`, and if that boundary
 * moves again — it moved on 2026-08-13, from a three-band cut that conflated
 * assistants with junior clinicians — this list moves with it. A hardcoded
 * `['NN7','NN8','NN9','NN10']` would quietly keep offering NN10 after AH10 stopped
 * being a support grade.
 *
 * The engine parses either spelling to the same rank, so choosing `NN8` and
 * choosing `AH8` produce byte-identical rosters. This is vocabulary, not policy.
 */
export const NON_NURSING_GRADE_ALIASES = Object.freeze(
    (() => {
        const band = DEFAULT_GRADE_BANDS.nonExempt;
        if (!Array.isArray(band)) return [];
        const [min, max] = band;
        const out = [];
        for (let rank = min; rank <= max; rank += 1) out.push(`NN${rank}`);
        return out;
    })(),
);

export const WIZARD_STEPS = Object.freeze([
    Object.freeze({ id: 'team', label: 'Your team' }),
    Object.freeze({ id: 'period', label: 'Dates and length' }),
    Object.freeze({ id: 'bands', label: 'Grade bands' }),
    Object.freeze({ id: 'hours', label: 'Working hours' }),
    Object.freeze({ id: 'limits', label: 'Department limits' }),
    Object.freeze({ id: 'staff', label: 'Staff' }),
    Object.freeze({ id: 'tasks', label: 'Tasks' }),
]);

/** How many steps there are. Derived, so a new step counts itself. */
export const WIZARD_STEP_COUNT = WIZARD_STEPS.length;

/**
 * A step id -> its 1-based number, or `null` for an id that is not a step.
 *
 * `null` rather than a throw or a silent `0`: a mistyped id must not render a
 * badge reading "step 0 of 7", and it must not take the wizard down either. The
 * component treats `null` as "draw the panel with no badge", which is visibly
 * wrong in review and harmless to a roster master mid-configuration.
 */
export const wizardStepNumber = (id) => {
    const index = WIZARD_STEPS.findIndex((step) => step.id === id);
    return index === -1 ? null : index + 1;
};

/** A step id -> its accessible label, or `null` for an unknown id. */
export const wizardStepLabel = (id) => WIZARD_STEPS.find((step) => step.id === id)?.label ?? null;

/**
 * One definition of "the value of this cell, with the whitespace taken off".
 *
 * Declared up here rather than beside the parsers because the calendar and quota
 * vocabularies below read cells too, and two definitions of "trimmed" is how a
 * cell starts being judged differently depending on which parser reached it first.
 */
const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');

/** Is this a `{ … }`? Used only to recognise a seed object from a config. */
const isPlainObject = (value) =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A band name as it appears on a chip or in a caption. `junior` -> `Junior`.
 *
 * A camel hump becomes a hyphenated word, so `nonExempt` -> `Non-exempt` rather
 * than the `NonExempt` a bare capitalisation gives. That mattered the moment the
 * fourth band arrived: the chips a roster master picks from are read, and
 * `NonExempt` is a variable name, not a word. Mirrors `regionWordLabel` in the
 * engine deliberately — the same key has to read the same way in a chip and in a
 * refusal — and is derived rather than a lookup, so a fifth band needs no edit
 * here.
 */
export const bandLabel = (band) => {
    if (typeof band !== 'string' || band.length === 0) return '';
    const spaced = band.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/**
 * The 7-day toggle strip, Monday first, carrying the engine's day numbers
 * (0 = Sunday … 6 = Saturday, matching `Date.prototype.getDay`).
 *
 * Monday-first because the engine snaps every run back to a Monday, so a
 * Sunday-first strip would put the first day of the roster last.
 */
/**
 * The week, Monday first, with THREE names for each day and a reason for each.
 *
 * `short` — one letter, for the day chips on a task row. Seven three-letter chips
 * wrapped onto two lines on a phone and read as a wall; seven single letters fit
 * one row, which is what the roster owner asked for.
 *
 * `label` — the three-letter name. Still the ONLY thing used anywhere a day is
 * named in prose or in a list the user reads as words: the monthly pattern's
 * `<option>`s, `describeTaskRecurrence`, error messages. A dropdown option reading
 * "T" would be unusable.
 *
 * `full` — the whole word, for the chips' `title` and accessible name. This is not
 * decoration: **`short` is AMBIGUOUS BY CONSTRUCTION.** Tue and Thu are both `T`,
 * Sat and Sun are both `S`. Sighted users disambiguate by position, which works
 * because the order is fixed — but a screen reader announcing "T, pressed" twice
 * is useless, and so is a hover tooltip saying "T". So the chips render `short` and
 * announce `full`, and the two must stay in step.
 */
export const WEEKDAY_STRIP = Object.freeze([
    Object.freeze({ day: 1, label: 'Mon', short: 'M', full: 'Monday' }),
    Object.freeze({ day: 2, label: 'Tue', short: 'T', full: 'Tuesday' }),
    Object.freeze({ day: 3, label: 'Wed', short: 'W', full: 'Wednesday' }),
    Object.freeze({ day: 4, label: 'Thu', short: 'T', full: 'Thursday' }),
    Object.freeze({ day: 5, label: 'Fri', short: 'F', full: 'Friday' }),
    Object.freeze({ day: 6, label: 'Sat', short: 'S', full: 'Saturday' }),
    Object.freeze({ day: 0, label: 'Sun', short: 'S', full: 'Sunday' }),
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

// --- THE STRANDED-CAPABILITY VOCABULARY ---------------------------------------

/**
 * A task's calendar is EITHER a weekly day strip OR a monthly nth-weekday, and the
 * two are mutually exclusive in the engine (`days` beside `recurrence` is a
 * validation refusal, not a merge). So the row carries a MODE, and the mode decides
 * which of the two keys is emitted — rather than both being emitted and one being
 * dropped, which is how a control the user pressed stops meaning anything.
 */
export const TASK_CALENDAR_WEEKLY = 'weekly';
export const TASK_CALENDAR_MONTHLY = 'monthly';
export const TASK_CALENDAR_MODES = Object.freeze([TASK_CALENDAR_WEEKLY, TASK_CALENDAR_MONTHLY]);

/**
 * The ordinals a monthly recurrence may name, as the select's options.
 *
 * ⚠️ SECOND DEFINITION, KNOWINGLY. `RECURRENCE_ORDINALS` is module-private in
 * `rosterEngineV2.js` and the engine is not editable this phase, so this list
 * cannot be imported the way `BAND_NAMES` and `QUOTA_PERIODS` are. It is therefore
 * PINNED BY MEASUREMENT instead of by import: `rosterWizard.test.js` walks every
 * option through `validateRosterV2Config` and asserts each is accepted, and walks
 * `5`, `0`, `-1` and `'first'` through and asserts each is refused. If the engine's
 * list ever changes, that probe fails rather than this wizard silently offering an
 * ordinal the engine will reject (or hiding one it would accept).
 *
 * WHY THERE IS NO `5`: most months hold four of any given weekday, so a "5th
 * Wednesday" task would silently vanish in most months. The engine refuses it and
 * offers `'last'`, which is the question departments actually ask.
 *
 * `value` is a STRING because that is what a `<select>` reports; `toRecurrenceOrdinal`
 * below is the one place it becomes the engine's `1 | 2 | 3 | 4 | 'last'`.
 */
export const RECURRENCE_LAST = 'last';
export const RECURRENCE_ORDINAL_OPTIONS = Object.freeze([
    Object.freeze({ value: '1', label: '1st' }),
    Object.freeze({ value: '2', label: '2nd' }),
    Object.freeze({ value: '3', label: '3rd' }),
    Object.freeze({ value: '4', label: '4th' }),
    Object.freeze({ value: RECURRENCE_LAST, label: 'Last' }),
]);

/** `'3'` -> `3`; `'last'` -> `'last'`; anything else -> `null` (not chosen). */
export const toRecurrenceOrdinal = (raw) => {
    const value = trimmed(raw);
    if (value === RECURRENCE_LAST) return RECURRENCE_LAST;
    const option = RECURRENCE_ORDINAL_OPTIONS.find((entry) => entry.value === value);
    return option === undefined ? null : Number(option.value);
};

/**
 * The quota periods the WIZARD offers, taken from the engine's own vocabulary so a
 * misspelling is impossible.
 *
 * A UI RANGE, not a validation rule — exactly as `SLOTS_MIN`/`SLOTS_MAX` is. The
 * engine also accepts `per: 'run'`; the wizard does not offer it because "at least
 * two of these across the whole run" was not a sentence either field interview said,
 * and a period whose length depends on how many weeks you happen to be generating is
 * the one period a roster master cannot check against a calendar. A fixture carrying
 * `per: 'run'` still maps (the mapper reads whatever the row holds).
 */
export const QUOTA_PERIOD_OPTIONS = Object.freeze([
    Object.freeze({ value: QUOTA_PERIODS.week, label: 'per week' }),
    Object.freeze({ value: QUOTA_PERIODS.month, label: 'per calendar month' }),
]);

/**
 * The three department-policy boxes the tables had no column for, all EMPTY — what
 * the wizard opens with and what it is reset to on entering or leaving the sandbox.
 *
 * `forbidPairs` is a LIST OF NAME PAIRS rather than text, because the two names have
 * to be people who exist: the engine refuses a pair naming somebody outside the
 * pool, and a free-text box would turn every typo into a blocked run instead of an
 * unavailable option. Empty rather than prefilled with `2` and `6` for the reason
 * the hours boxes are empty — `maxConcurrentPerDay: 2` is the engine's default, and
 * STATING it is how a roster master says "two is our policy", which is a different
 * fact from never having thought about it.
 */
export const EMPTY_RULES_INPUTS = () => ({
    maxConcurrentPerDay: '',
    maxConsecutiveDays: '',
    forbidPairs: [],
});

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
    // THIS PERSON'S OWN DAILY DUTY CAP, and it is now a CELL rather than a hidden
    // number a fixture could carry. A RAW STRING, like `fte`, and `''` means "use
    // the department's `maxConcurrentPerDay`" — which is exactly what the engine
    // does with an absent `maxPerDay`, and what the input's placeholder says.
    maxPerDay: typeof seed.maxPerDay === 'number' && Number.isFinite(seed.maxPerDay)
        ? String(seed.maxPerDay)
        : (typeof seed.maxPerDay === 'string' ? seed.maxPerDay : ''),
    // AVAILABILITY WINDOWS — the block rotation. EMPTY by default and empty means
    // "eligible on every date": the engine switches time-bounded eligibility on for
    // the whole configuration the moment ANY staff entry states a `windows` key, so
    // an unasked-for empty list here would start judging a department that has never
    // heard of rotations. Seeded from a config's own `windows` so a fixture round-trips.
    windows: Array.isArray(seed.windows) ? seed.windows.map((entry) => createStaffWindow(entry)) : [],
});

/**
 * ONE AVAILABILITY WINDOW: a date range, optionally narrowed to named tasks.
 *
 * All three fields are RAW STRINGS for the reason `fte` is — a half-typed date must
 * survive a keystroke — and `tasks` is a comma-separated list read by the same kind
 * of parser the Away cell uses, so "several, separated by commas" means one thing
 * everywhere in this wizard.
 *
 * NO `label` FIELD. The engine carries one, and it improves its own `unfilled`
 * sentence ("outside their team B block" rather than "outside their cohort window") —
 * but it is a fourth control on a row that is already three, and the brief's UI
 * economy rule is a hard requirement. Recorded as a named omission in the ledger at
 * the foot of this file rather than silently skipped.
 */
export const createStaffWindow = (seed = {}) => ({
    id: nextRowId('window'),
    from: typeof seed.from === 'string' ? seed.from : '',
    to: typeof seed.to === 'string' ? seed.to : '',
    tasks: Array.isArray(seed.tasks) ? seed.tasks.join(', ') : (typeof seed.tasks === 'string' ? seed.tasks : ''),
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
    /**
     * The GRADE FLOOR, as a raw string; `''` means no floor. A raw string for the
     * same reason `hours` is one — the cell must be editable from the first
     * keystroke — though the control is a closed list, so the only values that
     * reach here are real grades or `''`.
     *
     * ⚠️ IT IS NOT A NARROWER `leadBands` AND MUST NOT BE FOLDED INTO IT. A band
     * gate is a SET and gates the LEAD; a floor is a RANK and gates EVERY
     * assignee. They compose by AND, and a row may sensibly carry both.
     */
    minGrade: typeof seed.minGrade === 'string' ? seed.minGrade : '',
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

    // --- HOW OFTEN IT REPEATS -------------------------------------------------
    //
    // A fixture carrying `recurrence` opens in monthly mode; everything else opens
    // on the weekly day strip, which is what every task did before this existed.
    // `days` above is left untouched by the mode, so switching to monthly and back
    // does not lose the ticked weekdays — the same rule the slot list follows.
    calendarMode: isPlainObject(seed.recurrence) ? TASK_CALENDAR_MONTHLY : TASK_CALENDAR_WEEKLY,
    // RAW STRINGS, and `''` means NOT CHOSEN — never `1` and never Monday. There is
    // no engine default for either: a monthly task has to say which ordinal and
    // which weekday, so a blank one is refused with a reason rather than filled in
    // on the roster master's behalf.
    recurrenceOrdinal: isPlainObject(seed.recurrence) && seed.recurrence.ordinal !== undefined
        ? String(seed.recurrence.ordinal)
        : '',
    recurrenceWeekday: isPlainObject(seed.recurrence) && typeof seed.recurrence.weekday === 'number'
        ? String(seed.recurrence.weekday)
        : '',

    // --- THE SAME PERSON EVERY TIME -------------------------------------------
    //
    // The engine's only preference. `false` unless a fixture says otherwise, because
    // it OVERRIDES FTE-weighted fairness for this task's lead slot and that is not a
    // trade anybody should be opted into.
    continuity: seed.continuity === true,

    // --- HOW MANY OF THESE ONE PERSON TAKES -----------------------------------
    //
    // Three raw strings rather than an object, so the drawer's three controls each
    // own one cell and a half-filled quota is a refusal with a reason instead of a
    // shape the engine has to guess at. All blank = no quota key at all.
    quotaPer: isPlainObject(seed.quota) && typeof seed.quota.per === 'string' ? seed.quota.per : '',
    quotaMin: isPlainObject(seed.quota) && seed.quota.min !== undefined && seed.quota.min !== null
        ? String(seed.quota.min)
        : '',
    quotaMax: isPlainObject(seed.quota) && seed.quota.max !== undefined && seed.quota.max !== null
        ? String(seed.quota.max)
        : '',

    // WAS FIXTURE-ONLY AND IS NOW A CELL. `''` means the engine's own
    // `ROSTER_V2_DEFAULTS.category`, which the input shows as its placeholder.
    category: typeof seed.category === 'string' ? seed.category : '',

    // Carried, not edited — see the header note.
    ...(typeof seed.requiresSkill === 'string' && seed.requiresSkill.trim() !== ''
        ? { requiresSkill: seed.requiresSkill }
        : {}),
});

/** `DEFAULT_STAFF_ROWS` blank staff rows — what the sandbox wizard opens with. */
export const createEmptyStaffRows = (count = DEFAULT_STAFF_ROWS) =>
    Array.from({ length: count }, () => createStaffRow());

/**
 * THE TEAM'S OWN PEOPLE, AS WIZARD ROWS — what live mode uses instead of a typed
 * list of names.
 *
 * ⚠️ THIS IS THE FUNCTION THAT ENDS THE COMMA-SEPARATED STAFF POOL. Live mode's
 *    Configure panel held `config.staff.join(', ')` — a textarea of display names,
 *    split on commas — in the release whose entire purpose was to stop keying
 *    people by display name. A name typed there matched a person only by spelling.
 *    These rows carry the `uid`, so the roster is built from the actual membership.
 *
 * ⚠️ GRADES ARRIVE SEPARATELY AND MAY BE ABSENT, WHICH IS NOT AN ERROR. They live
 *    in `teams/{id}/grades/{uid}`, readable only by the person and a lead, and a
 *    member who has never set one simply has none. `''` is what `createStaffRow`
 *    means by "not recorded" — the engine bars an ungraded person from leading a
 *    band-gated task and names them, which is the honest outcome. Inventing AH7
 *    here would put somebody in charge of a duty their pay scale does not carry.
 *
 * `rostered: false` members are already filtered out upstream by
 * `TeamContext.rosteredMembers` — the roster master who holds no clinical duties
 * is a lead, not a gap in this function.
 */
export const staffRowsFromMembers = (members = [], grades = {}) =>
    (Array.isArray(members) ? members : [])
        .filter((person) => person && typeof person.uid === 'string' && person.uid !== '')
        .map((person) => ({
            ...createStaffRow({
                name: person.displayName || person.email || person.uid,
                grade: typeof grades[person.uid] === 'string' ? grades[person.uid] : '',
                fte: person.fte,
                unavailable: person.unavailable,
                skills: person.skills,
                maxPerDay: person.maxPerDay,
            }),
            /**
             * ⚠️ CARRIED THROUGH SO THE ROSTER CAN BE KEYED BY IT LATER. The engine
             *    still works in names — that is `D-names`, a documented limitation
             *    with its own risk budget — but a row that has FORGOTTEN which uid
             *    it came from cannot be fixed later without asking the roster master
             *    to identify people by spelling all over again.
             */
            uid: person.uid,
        }));

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
// The band editor is ONE ruler with a draggable divider between each adjacent pair
// of bands — THREE of them since the four-band split, and `bands - 1` in general —
// not a number box per bound.
// That is a correctness change wearing a UI change's clothes.
//
// With six independent numbers a user can express a GAP (AH12 in no band at all),
// an OVERLAP (two bands claiming AH12) or a partition that does not reach the ends
// of the scale, and the only defence is `validateGradeBands` complaining after the
// fact. With dividers those states are not reachable: the bands are DERIVED
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
 * Derived from `BAND_NAMES` rather than hard-coded, because "how many
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
//
// `trimmed` — the one definition of "this cell's value without the whitespace" —
// lives at the top of the file, beside `BAND_NAMES`, because the calendar and quota
// vocabularies read cells as well.

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

// --- THE STRANDED-CAPABILITY PARSERS ------------------------------------------
//
// Nine engine fields, one parser each, all shaped exactly like `parseFteCell`:
// `{ ok, value, reason }`, blank is `null` rather than a default, and an unreadable
// cell is REFUSED with the offending text quoted rather than clamped or dropped.
// That shape is not decoration — the mapper reads them all in one loop and the
// tables render them all through one per-row error line, so a parser that answered
// differently would need a second renderer and the two would eventually disagree.
//
// NO ARTIFICIAL CEILINGS ON THE THREE COUNT CELLS. The engine's rule for
// `maxPerDay`, `maxConcurrentPerDay`, `maxConsecutiveDays` and both quota bounds is
// the same one — "a whole number of at least 1" — and these parsers state exactly
// that. `parseFteCell` narrows the engine's range on purpose (0.1 is a meaningful
// floor for a contract); "at most 9 duties a day" is not a fact anybody has, so
// inventing one here would refuse a configuration the engine would accept and put
// this file's opinion in front of the engine's.

/**
 * A whole-count cell -> `{ ok, value, reason }`, `null` for BLANK.
 *
 * `blankMeans` is the sentence the reason ends with, so a refusal always says what
 * clearing the box would do instead — which for every one of these is "fall back to
 * the engine's documented default", and that default is on screen as the
 * placeholder.
 */
const parseCountCell = (raw, { label, blankMeans, example }) => {
    const text = trimmed(typeof raw === 'string' ? raw : String(raw ?? ''));
    if (text === '') return { ok: true, value: null, reason: null };

    const value = Number(text);
    if (!Number.isFinite(value)) {
        return { ok: false, value: null, reason: `${label} "${text}" is not a number — use a whole number like ${example}. ${blankMeans}` };
    }
    if (!Number.isInteger(value) || value < 1) {
        return { ok: false, value: null, reason: `${label} ${value} must be a whole number of at least 1. ${blankMeans}` };
    }
    return { ok: true, value, reason: null };
};

/** One person's own daily duty cap. Blank = the department's `maxConcurrentPerDay`. */
export const parseMaxPerDayCell = (raw) =>
    parseCountCell(raw, {
        label: 'Most duties in one day',
        example: ROSTER_V2_DEFAULTS.maxConcurrentPerDay,
        blankMeans: "Leave it blank and this person follows the department's figure.",
    });

/** The department's default daily duty cap. Blank = the engine's own default. */
export const parseConcurrentPerDayCell = (raw) =>
    parseCountCell(raw, {
        label: 'Most duties in one day',
        example: ROSTER_V2_DEFAULTS.maxConcurrentPerDay,
        blankMeans: `Leave it blank and AURA uses ${ROSTER_V2_DEFAULTS.maxConcurrentPerDay}.`,
    });

/** The department's run of days. Blank = the engine's own default. */
export const parseConsecutiveDaysCell = (raw) =>
    parseCountCell(raw, {
        label: 'Most days in a row',
        example: ROSTER_V2_DEFAULTS.maxConsecutiveDays,
        blankMeans: `Leave it blank and AURA uses ${ROSTER_V2_DEFAULTS.maxConsecutiveDays}.`,
    });

/**
 * A task row's calendar -> `{ ok, recurrence, reason }`.
 *
 * `recurrence` is `null` for a WEEKLY task, which is every task that existed before
 * this control did, and the mapper then emits `days` exactly as it always has. In
 * monthly mode BOTH halves are required and neither is defaulted: there is no
 * engine default for "which Wednesday", and picking the 1st on somebody's behalf
 * would put a clinic on a date they never chose. So a half-chosen monthly pattern is
 * a per-row refusal.
 */
export const parseTaskRecurrence = (row) => {
    if (row?.calendarMode !== TASK_CALENDAR_MONTHLY) {
        return { ok: true, recurrence: null, reason: null };
    }

    const ordinal = toRecurrenceOrdinal(row?.recurrenceOrdinal);
    const weekdayText = trimmed(row?.recurrenceWeekday);
    const weekday = weekdayText === '' ? null : Number(weekdayText);
    const weekdayOk = weekday !== null && WEEKDAY_STRIP.some((entry) => entry.day === weekday);

    if (ordinal === null && !weekdayOk) {
        return {
            ok: false,
            recurrence: null,
            reason: 'is set to repeat monthly but no week of the month and no weekday have been chosen. Pick both — "the 3rd Wednesday" — or switch it back to repeating weekly.',
        };
    }
    if (ordinal === null) {
        return {
            ok: false,
            recurrence: null,
            reason: `is set to repeat monthly on a ${weekdayLabel(weekday)} but no week of the month has been chosen. Pick one of ${RECURRENCE_ORDINAL_OPTIONS.map((entry) => entry.label).join(', ')}.`,
        };
    }
    if (!weekdayOk) {
        return {
            ok: false,
            recurrence: null,
            reason: `is set to repeat monthly in the ${ordinalLabel(ordinal)} week but no weekday has been chosen. Pick the day it runs on.`,
        };
    }

    return { ok: true, recurrence: { ordinal, weekday }, reason: null };
};

/** `3` -> `'3rd'`, `'last'` -> `'last'`. The option label, read back. */
const ordinalLabel = (ordinal) => {
    const option = RECURRENCE_ORDINAL_OPTIONS.find((entry) => entry.value === String(ordinal));
    return option === undefined ? String(ordinal) : option.label.toLowerCase();
};

/** `3` -> `'Wed'`, from the one strip the day chips are built from. */
const weekdayLabel = (day) => {
    const entry = WEEKDAY_STRIP.find((candidate) => candidate.day === day);
    return entry === undefined ? String(day) : entry.label;
};

/**
 * A monthly task's calendar in the words the drawer and the row summary both use:
 * `'the 3rd Wed of each month'`. `''` while it is not a complete monthly pattern —
 * the row's error line is what speaks then, exactly as the FTE gloss does.
 */
export const describeTaskRecurrence = (row) => {
    const parsed = parseTaskRecurrence(row);
    if (!parsed.ok || parsed.recurrence === null) return '';
    return `the ${ordinalLabel(parsed.recurrence.ordinal)} ${weekdayLabel(parsed.recurrence.weekday)} of each month`;
};

/**
 * A task row's three quota cells -> `{ ok, quota, reason }`, `null` for NO QUOTA.
 *
 * A quota is stated only when a period is chosen AND at least one bound is typed.
 * Every partial combination is REFUSED rather than completed:
 *
 *   a bound with no period   — "two of these" per what? The engine's own default
 *                              period is `run`, and silently adopting it would put
 *                              a floor on a window whose length is however many
 *                              weeks somebody happened to generate.
 *   a period with no bound    — the engine refuses this itself ("asks for nothing"),
 *                              and refusing it here names the row.
 *
 * A MIN IS A PREFERENCE AND A MAX IS HARD — the asymmetry is the engine's, and the
 * drawer says so on screen where the two boxes are, because a roster master who
 * reads "at least 2" as a guarantee will be surprised by the warning instead of
 * informed by it.
 */
export const parseTaskQuota = (row) => {
    const per = trimmed(row?.quotaPer);
    const minText = trimmed(row?.quotaMin);
    const maxText = trimmed(row?.quotaMax);

    if (per === '' && minText === '' && maxText === '') {
        return { ok: true, quota: null, reason: null };
    }

    const offered = QUOTA_PERIOD_OPTIONS.map((entry) => entry.label).join(' or ');

    if (per === '') {
        return {
            ok: false,
            quota: null,
            reason: `has a per-person limit of ${[minText === '' ? null : `at least ${minText}`, maxText === '' ? null : `at most ${maxText}`].filter(Boolean).join(' and ')} but no period to count it over. Choose ${offered}, or clear the numbers.`,
        };
    }
    if (!QUOTA_PERIOD_OPTIONS.some((entry) => entry.value === per)) {
        // Only reachable from a fixture: the control is a select over the two
        // offered periods. REFUSED rather than mapped, because a control that
        // cannot display the value it is holding is a cell that silently lies.
        return {
            ok: false,
            quota: null,
            reason: `counts its per-person limit "${per}", which this wizard does not offer. Use ${offered}.`,
        };
    }
    if (minText === '' && maxText === '') {
        return {
            ok: false,
            quota: null,
            reason: 'has a period chosen for its per-person limit but neither a minimum nor a maximum, so it asks for nothing. Type a floor, a ceiling, or both — or clear the period.',
        };
    }

    const bounds = {};
    for (const [field, text] of [['min', minText], ['max', maxText]]) {
        if (text === '') continue;
        const value = Number(text);
        if (!Number.isFinite(value)) {
            return { ok: false, quota: null, reason: `has a per-person ${field === 'min' ? 'minimum' : 'maximum'} of "${text}", which is not a number of duties. Use a whole number like 2.` };
        }
        if (!Number.isInteger(value) || value < 1) {
            return {
                ok: false,
                quota: null,
                reason: `has a per-person ${field === 'min' ? 'minimum' : 'maximum'} of ${value}, which must be a whole number of at least 1. ${field === 'min' ? 'A minimum of 0 is met by doing nothing' : 'A maximum of 0 would mean the task may never be staffed at all'}, so clear the box instead.`,
            };
        }
        bounds[field] = value;
    }

    if (bounds.min !== undefined && bounds.max !== undefined && bounds.min > bounds.max) {
        return {
            ok: false,
            quota: null,
            reason: `asks for at least ${bounds.min} and at most ${bounds.max} per person — a floor above a ceiling cannot be satisfied by any roster.`,
        };
    }

    return { ok: true, quota: { per, ...bounds }, reason: null };
};

/**
 * One person's window rows -> `{ ok, windows, taskNames, reason }`.
 *
 * SHAPE ONLY. Whether a named task EXISTS is a cross-check that needs the finished
 * task list, and it runs in the mapper once the task loop has closed — see the note
 * there for why it cannot run in here.
 *
 * `windows` is `[]` for "no windows stated", which the mapper then omits entirely.
 * `taskNames` is every task name any of these windows names, for the cross-check.
 *
 * A WINDOW WITH NOTHING IN IT IS REFUSED, not ignored. The engine refuses it too, in
 * stronger words than a UI would think to use: in a LIST of windows, one window with
 * no bound of any kind admits everything and therefore CANCELS every other window
 * the person has. An empty row left behind by somebody who clicked Add and changed
 * their mind is exactly how that would happen, so it is a per-row error with a
 * Remove button next to it.
 */
export const parseStaffWindows = (rows) => {
    const list = Array.isArray(rows) ? rows : [];
    const windows = [];
    const taskNames = [];

    for (let index = 0; index < list.length; index += 1) {
        const row = list[index];
        const at = `window ${index + 1}`;
        const from = trimmed(row?.from);
        const to = trimmed(row?.to);
        const names = trimmed(row?.tasks)
            .split(',')
            .map((token) => token.trim())
            .filter((token) => token !== '');

        if (from === '' && to === '' && names.length === 0) {
            return {
                ok: false,
                windows: [],
                taskNames: [],
                reason: `${at} is empty. A window with no dates and no tasks admits everything on every date, which cancels every other window this person has — give it a from date, a to date, or a task, or remove the row.`,
            };
        }

        for (const [edge, value] of [['from', from], ['to', to]]) {
            if (value === '' || isDateKey(value)) continue;
            return {
                ok: false,
                windows: [],
                taskNames: [],
                reason: `${at}'s ${edge} date "${value}" is not a real YYYY-MM-DD date. Leave it blank for "no ${edge === 'from' ? 'start' : 'end'}".`,
            };
        }
        // STRING COMPARISON, and deliberately the same one the engine makes: every
        // well-formed YYYY-MM-DD sorts correctly as text, so there is no `Date` to
        // construct, no timezone to get wrong and no DST to slide the answer across
        // (post-mortem Block B, avoided rather than handled).
        if (from !== '' && to !== '' && from > to) {
            return {
                ok: false,
                windows: [],
                taskNames: [],
                reason: `${at} runs from ${from} to ${to}, which ends before it starts. Swap the two dates.`,
            };
        }

        for (const name of names) taskNames.push(name);
        windows.push({
            ...(from === '' ? {} : { from }),
            ...(to === '' ? {} : { to }),
            ...(names.length === 0 ? {} : { tasks: [...new Set(names)] }),
        });
    }

    return { ok: true, windows, taskNames, reason: null };
};

/**
 * `[[a, b], …]` -> `{ ok, pairs, reason }`, SHAPE ONLY.
 *
 * Whether the two names are in the staff pool is checked by the mapper once the
 * staff loop has closed, for the same reason the window cross-check is deferred: a
 * row whose FTE is unreadable never reaches `staff`, and "Bob is not in the staff
 * pool" would then be a refusal about the wrong thing entirely.
 *
 * A pair is unordered, so `[a, b]` and `[b, a]` are the same rule and the second is
 * refused as a duplicate rather than sent to the engine twice.
 */
export const parseForbidPairs = (pairs) => {
    const list = Array.isArray(pairs) ? pairs : [];
    const out = [];
    const seen = new Set();

    for (let index = 0; index < list.length; index += 1) {
        const entry = list[index];
        const at = `Pair ${index + 1}`;
        const a = trimmed(Array.isArray(entry) ? entry[0] : undefined);
        const b = trimmed(Array.isArray(entry) ? entry[1] : undefined);

        if (!Array.isArray(entry) || entry.length !== 2 || a === '' || b === '') {
            return { ok: false, pairs: [], reason: `${at} in "never on the same shift" needs two names. Pick both, or remove the pair.` };
        }
        if (a === b) {
            return { ok: false, pairs: [], reason: `${at} pairs ${a} with themselves, which cannot be honoured or violated. Pick two different people.` };
        }
        // NUL as the separator so no pair of names can collide: 'An' + 'nBob' and
        // 'Ann' + 'Bob' must not produce the same key. Written as the ESCAPE
        // backslash-u-0000, never a literal NUL byte -- a raw NUL made this whole
        // file register as BINARY, so grep and file silently skipped the module
        // that parses and validates the entire wizard (audit D1). Same runtime
        // value, greppable source.
        const key = [a, b].sort().join('\u0000');
        if (seen.has(key)) {
            return { ok: false, pairs: [], reason: `${a} and ${b} are listed twice in "never on the same shift". One entry says it; remove the other.` };
        }
        seen.add(key);
        out.push([a, b]);
    }

    return { ok: true, pairs: out, reason: null };
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
 *     staffErrors,   // { [rowId]: { name?, grade?, fte?, away?, maxPerDay?, windows? } }
 *     taskErrors,    // { [rowId]: { days?, hours?, slots?, recurrence?, quota? } }
 *     hoursErrors,   // { weeklyHours?, maxHoursPerDay? } — department-level
 *     rulesErrors,   // { maxConcurrentPerDay?, maxConsecutiveDays?, forbidPairs? }
 *   }
 *
 * ROWS WITH A BLANK NAME ARE IGNORED — the wizard opens with five of them and
 * three blank task rows, and an untouched row is not a mistake. A blank name
 * with a grade or a leave date typed beside it IS reported, because that is a
 * half-finished row whose content would otherwise vanish without a word. That test
 * now includes the two things a staff drawer can hold: a daily cap and a window.
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
 * AND THE SAME RULE, LOAD-BEARING TWICE MORE. `staff.windows` switches time-bounded
 * eligibility on for the WHOLE configuration on mention (`cohortWindowsRequested`),
 * and `task.quota` compiles a floor or a ceiling on mention (`resolveQuotas`). A
 * person whose window list is empty therefore emits NO `windows` key, and a task
 * whose three quota cells are blank emits NO `quota` key — not an empty array and
 * not a `{}`. Nine new fields, one rule: stated means intent, blank means absent.
 *
 * A SLOT LIST REPLACES `leads`/`coLeads`, IT DOES NOT REFINE THEM. The engine
 * refuses a task carrying `slots` alongside `leads`, `coLeads`, `leadBands` or
 * `continuity: true` — measured, all five refusals, not inferred from the
 * comments — so a slot-mode row emits `slots` and NONE of those keys, and the
 * wizard hides the band chips, the co-lead toggle AND the continuity toggle for that
 * row rather than showing controls whose value would be dropped here.
 *
 * A MONTHLY CALENDAR REPLACES THE DAY STRIP THE SAME WAY. `days` beside
 * `recurrence` is a validation refusal, so a monthly row emits `recurrence` and no
 * `days`, the ticked weekdays stay on the row untouched (switch back and they are
 * still there), and the Days cell shows the monthly pattern instead of chips whose
 * value would be dropped.
 *
 * THE TWO CROSS-CHECKS RUN LAST, AND THAT ORDER IS A CORRECTNESS PROPERTY, not
 * tidiness. "Bob is not in the staff pool" and "no task is called Clinic" are both
 * refusals about a name that is missing — and a name is also missing when the row
 * that would have supplied it was dropped for an unreadable FTE or an unticked day.
 * Running them before their table is clean would blame the pair or the window for a
 * mistake three rows away. So the membership half of `forbidPairs` waits until no
 * staff row is in error, and the task-name half of `windows` waits until no task row
 * is. Their SHAPE is still checked immediately, so a duplicate pair or a backwards
 * date is reported on the first render.
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
    // maxHoursPerDay }`. Both blank by default, which means "use the engine's
    // documented figures rather than a stated policy".
    hoursInputs = null,
    // The three department-policy controls: `{ maxConcurrentPerDay,
    // maxConsecutiveDays, forbidPairs }` — two raw strings and a list of name pairs.
    // `EMPTY_RULES_INPUTS()` is what the wizard opens with.
    rulesInputs = null,
    // Anything else a fixture carries that has no control of its own. "Load example
    // department" strips `bands`, the two hours fields and the three rules fields out
    // of this and into the controls that own them, for the reason stated below: two
    // sources for one value is how a roster gets generated against a policy nobody
    // can see.
    extraRules = null,
} = {}) => {
    const staffErrors = {};
    const taskErrors = {};
    const hoursErrors = {};
    const rulesErrors = {};

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

    // --- department rules -----------------------------------------------------
    // The three the tables had no column for at all. Judged here with the bands and
    // the hours because they are the same KIND of fact: one departmental policy every
    // row below is measured against.
    const maxConcurrentPerDay = parseConcurrentPerDayCell(rulesInputs?.maxConcurrentPerDay);
    const maxConsecutiveDays = parseConsecutiveDaysCell(rulesInputs?.maxConsecutiveDays);
    const pairShape = parseForbidPairs(rulesInputs?.forbidPairs);
    if (!maxConcurrentPerDay.ok) rulesErrors.maxConcurrentPerDay = maxConcurrentPerDay.reason;
    if (!maxConsecutiveDays.ok) rulesErrors.maxConsecutiveDays = maxConsecutiveDays.reason;
    if (!pairShape.ok) rulesErrors.forbidPairs = pairShape.reason;
    const deptRulesReason =
        rulesErrors.maxConcurrentPerDay || rulesErrors.maxConsecutiveDays || rulesErrors.forbidPairs || null;

    // --- staff ---------------------------------------------------------------
    const staff = [];
    let firstStaffReason = null;
    /**
     * Which task names each row's windows refer to, kept for the cross-check below.
     * One entry per row that HAS windows and parsed cleanly — a row already in error
     * is not asked a second question about a name three tables away.
     */
    const windowRefs = [];

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

        // Both live behind the row's own disclosure, so both errors are named with
        // keys the table's forced-open rule reads: a refusal pointing at a control
        // the visitor cannot see is a refusal they cannot act on.
        const maxPerDay = parseMaxPerDayCell(row?.maxPerDay);
        if (!maxPerDay.ok) errors.maxPerDay = maxPerDay.reason;

        const windows = parseStaffWindows(row?.windows);
        if (!windows.ok) errors.windows = windows.reason;

        if (name === '') {
            // An untouched row is silence. A row with content but no name is a
            // half-finished row, and saying nothing would drop that content — which
            // now includes a daily cap and an availability window, both of which are
            // behind the drawer and both of which would otherwise vanish silently.
            const hasHiddenContent =
                trimmed(row?.maxPerDay) !== '' || (Array.isArray(row?.windows) && row.windows.length > 0);
            if (grade !== '' || away.trim() !== '' || hasHiddenContent) {
                errors.name = 'This row has a grade, leave dates or a limit but nobody to apply them to — add a name, or clear the row.';
            }
            if (Object.keys(errors).length > 0) staffErrors[row.id] = errors;
            if (!firstStaffReason && errors.name) firstStaffReason = errors.name;
            continue;
        }

        if (Object.keys(errors).length > 0) {
            staffErrors[row.id] = errors;
            if (!firstStaffReason) {
                firstStaffReason = `${name}: ${errors.grade || errors.fte || errors.away || errors.maxPerDay || errors.windows}`;
            }
            continue;
        }

        if (windows.taskNames.length > 0) {
            windowRefs.push({ rowId: row.id, name, taskNames: windows.taskNames });
        }

        staff.push({
            name,
            fte: fte.value,
            skills: Array.isArray(row?.skills) ? [...row.skills] : [],
            unavailable: leave.dates,
            // Absent, not blank, not defaulted.
            ...(grade === '' ? {} : { grade }),
            // Absent while the box is blank, so this person follows the department's
            // figure — which is what the engine does with an absent `maxPerDay` and
            // what the box's placeholder says it will do.
            ...(maxPerDay.value === null ? {} : { maxPerDay: maxPerDay.value }),
            // Absent while there are no windows: stating even an empty list would
            // switch time-bounded eligibility on for everybody in the department.
            ...(windows.windows.length === 0 ? {} : { windows: windows.windows }),
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

        // THE CALENDAR, and which of the two questions this row is even asked. A
        // monthly row is never asked about its ticked weekdays, because they are not
        // part of what it means any more — the same rule a slot list gets.
        const calendar = parseTaskRecurrence(row);
        if (!calendar.ok) errors.recurrence = `Task ${name} ${calendar.reason}`;

        const monthly = row?.calendarMode === TASK_CALENDAR_MONTHLY;
        const days = Array.isArray(row?.days) ? [...row.days].sort((a, b) => a - b) : [];
        if (!monthly && days.length === 0) {
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

        const quota = parseTaskQuota(row);
        if (!quota.ok) errors.quota = `Task ${name} ${quota.reason}`;

        if (Object.keys(errors).length > 0) {
            taskErrors[row.id] = errors;
            // `days` first, unchanged in wording and in precedence, because it is
            // the one this wizard has always reported and the sandbox tests read
            // it verbatim. The four behind the disclosure follow it in the order the
            // drawer lays them out, so the message and the screen read the same way.
            if (!firstTaskReason) {
                firstTaskReason = errors.days || errors.recurrence || errors.hours || errors.slots || errors.quota;
            }
            continue;
        }

        const leadBands = BAND_NAMES.filter((band) =>
            Array.isArray(row?.leadBands) ? row.leadBands.includes(band) : false,
        );
        const category = trimmed(row?.category);

        tasks.push({
            name,
            // EITHER a weekly day strip OR a monthly nth-weekday, never both keys.
            ...(calendar.recurrence === null ? { days } : { recurrence: calendar.recurrence }),
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
            // THE GRADE FLOOR, AND IT SITS OUTSIDE THE SLOT-MODE BRANCH ON PURPOSE.
            // `leadBands` had to go inside it because the engine refuses `slots`
            // beside it; `minGrade` carries no such conflict — `compileSlotPositions`
            // composes the task's floor onto every slot, because a trio's junior
            // slot is still somebody covering the duty. So a slotted task keeps its
            // floor, where it cannot keep its band chips.
            ...(trimmed(row?.minGrade) === '' ? {} : { minGrade: trimmed(row.minGrade) }),
            // Blank hours = no key at all, so a department that never typed an
            // hour gets the roster it got before hours existed, byte for byte.
            ...(hours.value === null ? {} : { hours: hours.value }),
            // CONTINUITY IS OMITTED IN SLOT MODE, and that is the engine's rule
            // rather than a simplification: `slots` beside `continuity: true` is a
            // refusal, because with slots the lead is derived from the grades on the
            // shift and there is no lead slot to keep. `false` is omitted too — the
            // engine reads absent and `false` identically, and emitting `false`
            // would put a key in the config for a toggle nobody moved.
            ...(row?.continuity === true && !slotMode ? { continuity: true } : {}),
            ...(quota.quota === null ? {} : { quota: quota.quota }),
            ...(typeof row?.requiresSkill === 'string' && row.requiresSkill.trim() !== ''
                ? { requiresSkill: row.requiresSkill.trim() }
                : {}),
            // Blank = the engine's own `ROSTER_V2_DEFAULTS.category`, which the box
            // shows as its placeholder. Never written out as `'CORE'`: the calendar
            // colours a stated category, so stating one nobody typed would change how
            // a shift is drawn.
            ...(category === '' ? {} : { category }),
        });
    }

    // --- the two deferred cross-checks ---------------------------------------
    //
    // Both need a table that has already closed cleanly. See the note at the top of
    // this function for why running them earlier would blame the wrong control.

    let crossReason = null;

    if (pairShape.ok && firstStaffReason === null && staff.length > 0) {
        const pool = new Set(staff.map((person) => person.name));
        for (const [a, b] of pairShape.pairs) {
            const missing = [a, b].filter((person) => !pool.has(person));
            if (missing.length === 0) continue;
            // The engine refuses this too, in almost these words. Refusing it HERE as
            // well means the message arrives beside the control that is wrong instead
            // of in the banner above Generate.
            rulesErrors.forbidPairs = `"Never on the same shift" names ${missing.join(' and ')}, who ${missing.length === 1 ? 'is' : 'are'} not in the staff table. Remove the pair, or add the ${missing.length === 1 ? 'person' : 'people'}.`;
            crossReason = rulesErrors.forbidPairs;
            break;
        }
    }

    if (crossReason === null && firstTaskReason === null && tasks.length > 0) {
        const taskNames = new Set(tasks.map((task) => task.name));
        for (const ref of windowRefs) {
            const missing = ref.taskNames.filter((named) => !taskNames.has(named));
            if (missing.length === 0) continue;
            const message = `${ref.name}: an availability window names ${missing.map((named) => `"${named}"`).join(', ')}, which ${missing.length === 1 ? 'is not a task' : 'are not tasks'} in the table below. Check the spelling, or leave the task list blank so the window covers every task.`;
            staffErrors[ref.rowId] = { ...(staffErrors[ref.rowId] || {}), windows: message };
            crossReason = message;
            break;
        }
    }

    // --- the one blocking reason ---------------------------------------------
    // Ordered so that the message names the thing furthest upstream: broken
    // boundaries make every band chip a lie, and an empty pool makes both
    // tables moot. The two cross-checks are LAST because each of them is only
    // meaningful once the table it reads is clean.
    let reason = null;
    if (bandsReason) reason = bandsReason;
    else if (hoursRulesReason) reason = hoursRulesReason;
    else if (deptRulesReason) reason = deptRulesReason;
    else if (firstStaffReason) reason = firstStaffReason;
    else if (firstTaskReason) reason = firstTaskReason;
    else if (staff.length === 0) reason = 'Add at least one person to the staff table before generating.';
    else if (tasks.length === 0) reason = 'Add at least one task to the task table before generating.';
    else if (crossReason) reason = crossReason;

    if (reason !== null) {
        return { ok: false, reason, config: null, bands, bandsReason, staffErrors, taskErrors, hoursErrors, rulesErrors };
    }

    const rules = {
        ...(extraRules && typeof extraRules === 'object' ? extraRules : {}),
        bands,
        // Every control wins over anything `extraRules` carried, exactly as `bands`
        // does, and every one of them is ABSENT while its box is blank — see the note
        // at the top of this function for why an empty box must not become a number.
        ...(weeklyHours.value === null ? {} : { weeklyHours: weeklyHours.value }),
        ...(maxHoursPerDay.value === null ? {} : { maxHoursPerDay: maxHoursPerDay.value }),
        ...(maxConcurrentPerDay.value === null ? {} : { maxConcurrentPerDay: maxConcurrentPerDay.value }),
        ...(maxConsecutiveDays.value === null ? {} : { maxConsecutiveDays: maxConsecutiveDays.value }),
        // A fresh pair of arrays per pair, so no edit to the wizard's state can reach
        // into the config that was generated from — the same aliasing rule `skills`
        // and `leadBands` follow.
        ...(pairShape.pairs.length === 0 ? {} : { forbidPairs: pairShape.pairs.map((pair) => [...pair]) }),
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
        rulesErrors,
    };
};

// --- THE RESULT PANEL'S READERS -----------------------------------------------
//
// `generateRosterV2` returns `warnings` as a flat list of sentences and `unfilled` as
// a list of `{ date, task, role, reason }`. Two of the new capabilities produce
// output a roster master will read WRONGLY unless it is framed:
//
//   AN UNMET QUOTA FLOOR looks like a failure and is not one. The engine cannot meet
//   a floor by inventing capacity, so it prefers the people who are behind and then
//   says who was still short. Left in the general warnings list it reads as "the
//   roster is broken"; pulled out with one sentence of framing it reads as "this is
//   what your policy cost", which is what it is.
//
//   A WINDOW-BLOCKED SLOT looks like a bug and is not one either. "no available staff
//   for Weekend Witnessing lead on 2026-09-12 (3 outside their cohort window)" is
//   correct and complete, and it is also the one `unfilled` reason whose cause is
//   invisible in the tables: the people are there, they are not on leave, and they
//   are still not eligible.
//
// ⚠️ THESE TWO READ THE ENGINE'S PROSE, AND THAT IS A REAL COUPLING — flagged rather
// than hidden. The `unfilled` entry carries no machine-readable rejection code (the
// taxonomy is module-private), so "was this a window?" can only be asked of the
// sentence. The markers below are the engine's own TALLY phrases, which are emitted
// from one place each and do not vary with a label or a name. They are pinned by
// END-TO-END tests: a config built through this mapper, run through the engine, and
// the classifier asked about the reason the engine actually produced. If the engine
// rewords either phrase those tests fail — which is the point of writing them that
// way instead of asserting a regex against a hand-typed string.

/** The engine's tally phrase for a slot no cohort window could reach. */
export const WINDOW_UNFILLED_MARKER = 'outside their cohort window';
/** The engine's tally phrase for a slot a quota ceiling closed. */
export const QUOTA_CEILING_UNFILLED_MARKER = 'at a quota ceiling';
/** The engine's opening words on an unmet floor. One `warnings` line per person. */
export const QUOTA_FLOOR_WARNING_PREFIX = 'Quota floor not met:';

/**
 * `warnings` -> `{ quotaFloors, others }`, preserving order within each.
 *
 * A PARTITION, never a filter: every warning the engine raised appears in exactly one
 * of the two lists, so the panel cannot drop one by classifying it. That property is
 * asserted directly, because "we show all of them" is the kind of claim that quietly
 * stops being true.
 */
export const partitionDemoWarnings = (warnings) => {
    const quotaFloors = [];
    const others = [];
    for (const warning of Array.isArray(warnings) ? warnings : []) {
        if (typeof warning === 'string' && warning.startsWith(QUOTA_FLOOR_WARNING_PREFIX)) quotaFloors.push(warning);
        else others.push(warning);
    }
    return { quotaFloors, others };
};

/**
 * `unfilled` -> `{ total, windowBlocked, quotaBlocked }`.
 *
 * Counts ENTRIES, not people: one entry is one slot on one date that nobody could
 * take, which is the unit the panel already lists and the unit a roster master has to
 * do something about. An entry can be counted in both — a slot can be short of
 * candidates for two reasons at once — so the two figures are not a partition of the
 * total and the panel never presents them as one.
 */
export const summariseUnfilledCauses = (unfilled) => {
    const list = Array.isArray(unfilled) ? unfilled : [];
    let windowBlocked = 0;
    let quotaBlocked = 0;
    for (const slot of list) {
        const reason = typeof slot?.reason === 'string' ? slot.reason : '';
        if (reason.includes(WINDOW_UNFILLED_MARKER)) windowBlocked += 1;
        if (reason.includes(QUOTA_CEILING_UNFILLED_MARKER)) quotaBlocked += 1;
    }
    return { total: list.length, windowBlocked, quotaBlocked };
};

// --- THE LIMITS LEDGER: WHAT THIS WIZARD STILL CANNOT SAY ---------------------
//
// Named here rather than left to be discovered, because an unreachable capability is
// what this phase exists to close and a half-closed one is worse than an open one.
//
//  1. `rules.quotas` — THE POOLED CATEGORY QUOTA — HAS NO CONTROL. `task.quota` makes
//     the QUOTA PRIMITIVE reachable ("at least two of THIS task a month"), but the
//     engine's second sugar pools one floor across every task carrying a category
//     ("at least two WEEKEND duties a month, and three weekend tasks count towards
//     it"). That is the sentence the medical-lab interview actually said. It needs a
//     category picker, a pooling explanation and a department-level list, and it was
//     left out rather than half-built. `category` IS now settable per task, so the
//     data it would read exists.
//  2. NO `scope`, AND NO `per: 'run'`. `scope: 'region'` is refused by the engine
//     itself; `per: 'run'` is accepted by the engine and not offered here (see
//     `QUOTA_PERIOD_OPTIONS`). A row seeded with either is REFUSED with a reason
//     rather than mapped into a control that cannot show it.
//  3. A WINDOW HAS NO LABEL, so the engine's own `unfilled` sentence reads "outside
//     their cohort window" rather than "outside their team B block". The engine
//     carries the field and uses it well; the wizard omits it under the UI-economy
//     rule. This is the cost, stated: a roster master who runs three named blocks
//     reads three identical sentences and matches them to people by name.
//  4. `task.temporal` IS STILL UNREACHABLE, and so is everything only it can say:
//     "the 1st AND the 3rd Wednesday", alternate weeks, an explicit list of dates,
//     and a task bounded to part of the run. The monthly control offers ONE ordinal
//     and ONE weekday, which is the psychologists' clinic and no more.
//  5. `slot.role` IS STILL UNREACHABLE. A slot's label defaults to its band, so a
//     trio's `unfilled` lines read "principal slot" rather than "Witness".
//  6. THE TWO CROSS-CHECK MESSAGES CAN BE HIDDEN BY A LOUDER ONE. A forbidden pair
//     naming a stranger is not reported while any staff row is in error, and a window
//     naming a missing task is not reported while any task row is. Both appear the
//     moment the louder problem is fixed, and neither is ever DROPPED — but a visitor
//     with two mistakes fixes them in a fixed order rather than seeing both at once.
//  7. THE RESULT PANEL'S TWO CLASSIFIERS READ ENGINE PROSE. See the note above
//     `WINDOW_UNFILLED_MARKER`. The panel degrades to showing the engine's own
//     sentence unframed if the phrasing ever changes, and the end-to-end tests fail
//     rather than the screen going quietly wrong.
