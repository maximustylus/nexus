// src/utils/rosterEngineV2.js
//
// ==============================================================================
// AURA ROSTER ENGINE V2 — CONSTRAINT-AWARE ASSIGNMENT
// ==============================================================================
//
// This is a SECOND engine, added alongside `generateRoster` in `auraEngine.js`.
// Nothing here modifies, wraps or replaces that function: it has 23
// characterization tests pinning its byte-exact output and a live site reading
// its documents, so it stays where it is until a UI task migrates deliberately.
//
// WHY V2 EXISTS — measured, not assumed.
//
// `generateRoster` is a cyclic rotation (`rotate(staff, w)`) that assigns the
// lead of task *i* by `staffOrder[i % staff.length]`. That is conflict-free only
// when the staff count happens to equal the task count, which is true for the
// one 4-person team it was written for. Measured at other sizes, with
// `startDate: 2026-02-02`, `weeks: 4`:
//
//   staff/tasks   max duties one person holds in one day   staff never rostered
//   ------------  ---------------------------------------  --------------------
//     4 /  4                    3                                 0 / 4
//    12 /  8                    3                                 0 / 12
//     9 /  6                    3                                 0 / 9
//     6 / 10                    5  <-- task index wraps            0 / 6
//    20 /  4                    3                                12 / 20  <--
//
// With more tasks than staff the modulo wraps the task index back around the
// staff list and one clinician silently leads or co-leads five duties at once.
// With many staff and few tasks the rotation never reaches past index
// `tasks.length + 1`, so 12 of 20 people are never rostered at all. Neither
// failure is reported anywhere — the roster looks complete.
//
// V2's contract is the opposite: it refuses. Every slot it cannot fill within
// the constraints appears in `unfilled` with a reason naming the binding
// constraint, and no clinician is ever assigned past their daily limit,
// outside their skill set, or on a day they are on leave.
//
// DESIGN RULES, all of which are load-bearing:
//
//   1. DETERMINISTIC. No `Math.random()`, no `Date.now()`, no locale-dependent
//      comparison. The same config always produces the same roster, byte for
//      byte, or it cannot be tested, reviewed or trusted.
//   2. SHAPE-COMPATIBLE. Shift objects are `{ task, lead, coLead, staff,
//      category, week, assignees }` and `staff` comes from
//      `buildShiftStaffLabel` — imported, never reimplemented — so the existing
//      calendar, CSV export and ICS export read V2 output unchanged
//      (ROSTER_POSTMORTEM.md A-RC1: the display string has ONE definition).
//   3. LOCAL DATES, BOTH HALVES. Post-mortem B2 as revised: the live engine is
//      correct only by accident, because a UTC parse (`new Date("YYYY-MM-DD")`)
//      cancels against local `setDate` arithmetic — and fixing only the output
//      half makes it worse. V2 parses `startDate` from its parts into a LOCAL
//      date and derives keys with LOCAL getters. `toISOString()` appears
//      nowhere in this file, and date arithmetic never carries a wall-clock
//      time across a DST transition.
//   4. MOST CONSTRAINED SLOT FIRST. Within each day, slots are filled in order
//      of how few people can take them, not in the order the tasks happen to be
//      configured. Filling naively lets the engine spend its only
//      skill-qualified clinician on a duty anybody could have covered and then
//      report the skill-gated duty as unfillable — an `unfilled` entry it
//      inflicted on itself. See `generateRosterV2` for the mechanism.
//   5. HARD AND SOFT ARE DIFFERENT THINGS. A hard constraint is never violated;
//      an unfillable slot goes to `unfilled` instead. A soft constraint is
//      allowed and COUNTED, in `score`. Section 6 owns that distinction, and
//      `score.hardViolations` is measured by re-reading the finished roster
//      rather than asserted.
//   6. JOB-GRADE BANDS ARE ELIGIBILITY, NOT PREFERENCE. A task carrying
//      `leadBands` can only ever be LED by somebody whose grade sits in one of
//      those bands. There is no fallback: if no in-band clinician is free, the
//      slot is reported `unfilled` and the roster master's policy stands. Bands
//      gate the LEAD only — any grade may co-lead, which is what makes a
//      senior-lead / junior-shadow pairing expressible. Section 0b owns the
//      scale, the band boundaries and their validation.
//
// WHAT THIS ENGINE DELIBERATELY DOES NOT DO (left as clean seams, not oversights):
// no local-search / hill-climbing improvement pass over the constructed roster;
// no hours-based limits (max hours per week, per cycle, or continuous duty); no
// cross-block "border data" carried between successive generation runs; no
// band-aware LOAD TARGETS — `knowledgeBase.js`'s TIME_MATRIX says an AH15 should
// spend 15% of their time on clinical work against an AH7's 80%, and this engine
// still shares duties by FTE alone, so bands decide WHO MAY lead and not HOW MUCH
// anybody leads (deferred deliberately: it changes `score.breakdown`, which is a
// separate, measurable piece of work); no band-local fairness — fairness remains
// one global FTE-weighted pool over whatever the gates leave. The scoring
// functions are pure and take any candidate roster, so an optimisation pass can
// be added without touching construction.
//
// ==============================================================================

// The `.js` extension is explicit (the rest of the repo omits it) so this
// module resolves under plain Node ESM as well as under Vite — `scripts/
// roster-scaling.mjs` measures both engines with `node`, without a bundler.
import { buildShiftStaffLabel, MAX_ROSTER_WEEKS } from './auraEngine.js';

// --- 0. DEFAULTS --------------------------------------------------------------

/**
 * Every default the input contract specifies, in one frozen place so the
 * validator, the engine and the tests cannot disagree about what "absent" means.
 */
export const ROSTER_V2_DEFAULTS = Object.freeze({
    fte: 1.0,
    /** Mon–Fri. 0 = Sunday … 6 = Saturday, matching `Date.prototype.getDay`. */
    days: Object.freeze([1, 2, 3, 4, 5]),
    leads: 1,
    coLeads: 1,
    category: 'CORE',
    maxConcurrentPerDay: 2,
    maxConsecutiveDays: 6,
});

/** Days in a generated week, always Monday-first. */
const DAYS_PER_WEEK = 7;

/**
 * Ratios are compared with a tolerance because FTE is a float: `3 / 0.6` is
 * `4.999999999999999`, not `5`, so an exact `===` would make a genuine tie look
 * like a difference and silently bypass the documented tie-breakers. The
 * tolerance is a constant, so the comparison stays deterministic.
 */
const RATIO_EPSILON = 1e-9;

/**
 * Shape predicates, shared by the validator, the normalisers and the band
 * helpers below. Defined here rather than in section 2 so that section 0b can
 * use them without a forward reference.
 */
const isPlainObject = (value) =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

const isPositiveInt = (value) =>
    typeof value === 'number' && Number.isInteger(value) && value > 0;

const isNonNegativeInt = (value) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0;

// --- 0b. JOB GRADES AND BANDS -------------------------------------------------
//
// The department's allied-health scale runs AH7 (entry) to AH17 (head), and the
// tasks a clinician may LEAD are set by which of three bands their grade falls
// in. Everything in this section is PURE and exported for the UI that will edit
// these boundaries, because the boundaries are a departmental policy decision —
// `knowledgeBase.js` describes the JD framework the scale comes from, and no two
// institutions cut it in the same place.
//
// WHY THE PARTITION IS ENFORCED RATHER THAN TOLERATED. The three bands must
// cover AH7–AH17 exactly, with no gap and no overlap. A gap is the dangerous
// case: a grade that falls into one would be in NO band, and therefore silently
// ineligible to lead every band-restricted task in the department — a roster
// with unfilled slots and no obvious cause. That is the class of failure this
// engine exists to refuse, so `validateGradeBands` rejects it at configure time
// with a reason naming the unbanded grades.
//
// ABSENT IS NOT ZERO. A staff member with no `grade` is not "AH7"; their grade
// is UNKNOWN. They therefore fail every band gate (membership cannot be
// verified) and remain fully eligible for everything that is not band-gated,
// including co-leading a band-gated task. `generateRosterV2` warns, by name,
// when that situation is actually load-bearing.

const GRADE_MIN = 7;
const GRADE_MAX = 17;

/** `'AH7' … 'AH17'`, in scale order. The UI's dropdown, and the only valid set. */
export const GRADE_SCALE = Object.freeze(
    Array.from({ length: GRADE_MAX - GRADE_MIN + 1 }, (_, i) => `AH${GRADE_MIN + i}`),
);

/**
 * The three band names, lowest first. Not exported: `Object.keys` of
 * `DEFAULT_GRADE_BANDS` is the same list in the same order, so there is one
 * definition of "the bands, in order" for a caller to read.
 */
const BAND_ORDER = Object.freeze(['junior', 'senior', 'principal']);

/**
 * The shipped boundaries, as `[min, max]` grade numbers inclusive.
 *
 * These are the department's current cut and nothing more — `rules.bands`
 * overrides them per configuration, subject to `validateGradeBands`.
 */
export const DEFAULT_GRADE_BANDS = Object.freeze({
    junior: Object.freeze([7, 12]),
    senior: Object.freeze([13, 14]),
    principal: Object.freeze([15, 17]),
});

/**
 * `'ah13'`, `'AH13'`, `' AH13 '` -> `13`; anything else, or a number off the
 * scale, -> `null`. Case-insensitive on input, per the input contract.
 */
const parseGradeNumber = (value) => {
    if (typeof value !== 'string') return null;
    const match = /^ah(\d{1,2})$/i.exec(value.trim());
    if (!match) return null;
    const number = Number(match[1]);
    return number >= GRADE_MIN && number <= GRADE_MAX ? number : null;
};

/** Any accepted spelling of a grade -> the canonical `'AH' + int`, or `null`. */
const normaliseGrade = (value) => {
    const number = parseGradeNumber(value);
    return number === null ? null : `AH${number}`;
};

/** Which band does grade NUMBER `n` sit in? Assumes `bands` already validated. */
const bandOfGradeNumber = (n, bands) => {
    for (const name of BAND_ORDER) {
        const range = bands[name];
        if (!Array.isArray(range)) continue;
        if (n >= range[0] && n <= range[1]) return name;
    }
    return null;
};

/**
 * Are these band boundaries usable? `{ valid, reason }`, same contract as
 * `validateRosterV2Config`, so a UI can show `reason` verbatim.
 *
 * Requires all three bands, each an inclusive `[min, max]` of whole grades on
 * the scale, together partitioning AH7–AH17: junior starts at 7, principal ends
 * at 17, every min <= max, and each band starts exactly one grade above where
 * the one below it ended.
 */
export const validateGradeBands = (bands) => {
    const invalid = (reason) => ({ valid: false, reason });

    if (!isPlainObject(bands)) {
        return invalid('Grade bands must be an object of the form { junior: [7, 12], senior: [13, 14], principal: [15, 17] }.');
    }

    for (const key of Object.keys(bands)) {
        if (!BAND_ORDER.includes(key)) {
            return invalid(`Grade bands include an unknown band ${JSON.stringify(key)} — the three bands are junior, senior and principal.`);
        }
    }
    for (const name of BAND_ORDER) {
        if (bands[name] === undefined) {
            return invalid(`Grade bands are missing the ${name} band — all three of junior, senior and principal must be given, so that every grade lands in exactly one.`);
        }
    }

    const range = {};
    for (const name of BAND_ORDER) {
        const value = bands[name];
        if (!Array.isArray(value) || value.length !== 2) {
            return invalid(`Grade band ${name} must be a two-number range [min, max], e.g. [${DEFAULT_GRADE_BANDS[name][0]}, ${DEFAULT_GRADE_BANDS[name][1]}].`);
        }
        for (const bound of value) {
            if (typeof bound !== 'number' || !Number.isInteger(bound)) {
                return invalid(`Grade band ${name} has the bound ${JSON.stringify(bound)} — band bounds are whole grade numbers between ${GRADE_MIN} and ${GRADE_MAX}.`);
            }
            if (bound < GRADE_MIN || bound > GRADE_MAX) {
                return invalid(`Grade band ${name} has the bound ${bound}, which is outside the AH${GRADE_MIN}–AH${GRADE_MAX} scale.`);
            }
        }
        if (value[0] > value[1]) {
            return invalid(`Grade band ${name} runs from ${value[0]} down to ${value[1]} — its minimum must not be above its maximum.`);
        }
        range[name] = [value[0], value[1]];
    }

    if (range.junior[0] !== GRADE_MIN) {
        return invalid(`Grade band junior must start at ${GRADE_MIN} (AH${GRADE_MIN}), the bottom of the scale — otherwise the grades below it would be in no band at all.`);
    }
    if (range.principal[1] !== GRADE_MAX) {
        return invalid(`Grade band principal must end at ${GRADE_MAX} (AH${GRADE_MAX}), the top of the scale — otherwise the grades above it would be in no band at all.`);
    }

    for (const [lower, upper] of [['junior', 'senior'], ['senior', 'principal']]) {
        const expected = range[lower][1] + 1;
        const actual = range[upper][0];
        if (actual === expected) continue;

        if (actual > expected) {
            // The gap named exactly: one grade, two grades, or a span.
            const last = actual - 1;
            let gap;
            if (last === expected) gap = `AH${expected}`;
            else if (last === expected + 1) gap = `AH${expected} and AH${last}`;
            else gap = `AH${expected}–AH${last}`;

            return invalid(`Grade bands leave ${gap} in no band at all — ${lower} ends at AH${range[lower][1]} and ${upper} starts at AH${actual}. Anybody on an unbanded grade would be silently unable to lead every band-restricted task, so the bands must be contiguous.`);
        }
        return invalid(`Grade bands ${lower} (AH${range[lower][0]}–AH${range[lower][1]}) and ${upper} (AH${range[upper][0]}–AH${range[upper][1]}) overlap — no grade may belong to two bands.`);
    }

    return { valid: true, reason: null };
};

/**
 * Which band is this grade in? `'junior' | 'senior' | 'principal' | null`.
 *
 * `null` for an absent, unparseable or off-scale grade, and also for a `bands`
 * argument that does not partition the scale — a caller that wants to know WHY
 * asks `validateGradeBands`, which is the loud half of this pair. Pure.
 */
export const bandOfGrade = (grade, bands = DEFAULT_GRADE_BANDS) => {
    if (!validateGradeBands(bands).valid) return null;
    const number = parseGradeNumber(grade);
    if (number === null) return null;
    return bandOfGradeNumber(number, bands);
};

/** `rules` -> the band boundaries in force. Absent rules mean the defaults. */
const resolveGradeBands = (rules) =>
    isPlainObject(rules) && isPlainObject(rules.bands) ? rules.bands : DEFAULT_GRADE_BANDS;

/**
 * A set of band names as prose, always in scale order:
 * `Set{'principal','senior'}` -> `'Senior/Principal'`.
 */
const bandSetLabel = (bandNames) =>
    BAND_ORDER
        .filter((name) => bandNames.has(name))
        .map((name) => name.charAt(0).toUpperCase() + name.slice(1))
        .join('/');

/**
 * The same set as grade numbers: `'AH13–AH17'`. Adjacent bands are merged into
 * one span, and a deliberately non-contiguous selection reads honestly as
 * `'AH7–AH12, AH15–AH17'` rather than pretending to be a single range.
 */
const bandSetGradeLabel = (bandNames, bands) => {
    const spans = [];
    for (const name of BAND_ORDER) {
        if (!bandNames.has(name)) continue;
        const [min, max] = bands[name];
        const last = spans[spans.length - 1];
        if (last && last[1] + 1 === min) last[1] = max;
        else spans.push([min, max]);
    }
    return spans
        .map(([min, max]) => (min === max ? `AH${min}` : `AH${min}–AH${max}`))
        .join(', ');
};

// --- 1. DATE PRIMITIVES (post-mortem Block B) --------------------------------
//
// `auraEngine.js` keeps its own private `isRealDateKey` and a UTC-based
// `formatRosterDateKey`. Those are deliberately NOT reused here: the UTC parse
// is exactly the half of B2 that V2 must not inherit, and neither helper is
// exported. `buildShiftStaffLabel` and `MAX_ROSTER_WEEKS` are the two things
// that must be shared, and they are imported above.

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAY_NAMES = Object.freeze([
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]);

/**
 * True only for a real calendar date written exactly as `YYYY-MM-DD`.
 *
 * Round-tripped through a LOCAL `Date` rather than a UTC one: V8 rolls
 * `2026-02-30` over to 2 March, so the pattern alone is not enough, and using
 * `Date.UTC` here would mean the validator and the generator disagreed about
 * what a date key is.
 */
export const isDateKey = (value) => {
    if (typeof value !== 'string' || !DATE_KEY_PATTERN.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number);
    const probe = new Date(y, m - 1, d);
    return (
        probe.getFullYear() === y &&
        probe.getMonth() === m - 1 &&
        probe.getDate() === d
    );
};

/** `'2026-02-02'` -> local midnight on 2 Feb 2026. Never a UTC instant. */
export const parseLocalDateKey = (key) => {
    const [y, m, d] = String(key).split('-').map(Number);
    return new Date(y, m - 1, d);
};

/** Local `Date` -> `'YYYY-MM-DD'`. Local getters only; no `toISOString`. */
export const toLocalDateKey = (date) => {
    const y = String(date.getFullYear()).padStart(4, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

/**
 * `date` + `n` days, rebuilt from calendar parts.
 *
 * This is the DST-safe form. `setDate` on an existing instant preserves the
 * wall-clock TIME, so a run that crosses a spring-forward transition drags the
 * underlying instant across a UTC date boundary and every subsequent key slides
 * a day early (audit M2). Constructing from `(year, month, day + n)` asks the
 * runtime for local midnight on a calendar day instead, which is the question
 * a roster actually needs answered. Day overflow (`day + n` past month end) is
 * normalised by the `Date` constructor.
 */
const addDays = (date, n) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

/**
 * The Monday of `date`'s week.
 *
 * WEEK CONVENTION — a decision, not a derivation. `Date.prototype.getDay`
 * treats Sunday as day 0, i.e. the first day of the week, so the Monday of a
 * Sunday's week is the FOLLOWING day. Monday through Saturday step back to the
 * Monday that opened their week.
 *
 * The alternative (ISO 8601, where Sunday closes the previous week) would snap
 * the shipped default `2026-02-01` back to Monday 26 January — a roster
 * beginning six days before the date the roster master typed. Post-mortem B1
 * describes that default as a Sunday that was *meant* to be the start of a
 * Mon–Fri block, so forward is the reading that matches the intent. Either way
 * the snap is never silent: it is reported in `effectiveStart` and, when it
 * moved the date, in `warnings`.
 */
export const snapToMonday = (date) => {
    const day = date.getDay();
    return addDays(date, day === 0 ? 1 : 1 - day);
};

// --- 2. VALIDATION -----------------------------------------------------------
//
// Same style as `validateRosterConfig` in `auraEngine.js`: `{ valid, reason }`
// where `reason` is a sentence that can be shown to a roster master verbatim.
// `generateRosterV2` converts a refusal into the documented `{ ok: false,
// reason }`.
//
// The bar for rejecting rather than warning: a configuration that CANNOT be
// what the author meant. A task requiring a skill nobody holds is the clearest
// case — it would generate a roster whose every shift of that task is unfilled,
// which is a typo discovered at 3am on a Tuesday rather than at configure time.

// The shape predicates this section reads (`isPlainObject`, `isNonEmptyString`,
// `isPositiveInt`, `isNonNegativeInt`) live in section 0, where the band helpers
// can reach them too. One definition each, as always.

export const validateRosterV2Config = (config) => {
    const invalid = (reason) => ({ valid: false, reason });

    if (!isPlainObject(config)) {
        return invalid('No roster configuration was supplied.');
    }

    const { startDate, weeks, staff, tasks, rules } = config;

    // --- start date -----------------------------------------------------------
    if (!isDateKey(startDate)) {
        return invalid('Choose a valid start date (YYYY-MM-DD) before generating.');
    }

    // --- weeks ----------------------------------------------------------------
    // Mirrors auraEngine's rules exactly, including the reason wording: an
    // empty input arrives as '' rather than NaN and must be rejected, never
    // coerced to 0 (ROSTER_QC_AUDIT.md M3).
    if (typeof weeks !== 'number' || !Number.isFinite(weeks)) {
        return invalid(`Enter the number of weeks to generate (1–${MAX_ROSTER_WEEKS}).`);
    }
    if (!Number.isInteger(weeks)) {
        return invalid('Weeks must be a whole number.');
    }
    if (weeks < 1) {
        return invalid('Weeks must be at least 1 — a 0-week run would generate nothing.');
    }
    if (weeks > MAX_ROSTER_WEEKS) {
        return invalid(`Weeks must be ${MAX_ROSTER_WEEKS} or fewer (one year per roster document).`);
    }

    // --- staff ----------------------------------------------------------------
    if (!Array.isArray(staff) || staff.length === 0) {
        return invalid('The staff pool is empty — add at least one person.');
    }

    const seenNames = new Set();
    const skillsHeld = new Set();
    /** Every recorded grade, as numbers, for the band-coverage check below. */
    const gradeNumbers = [];

    for (let i = 0; i < staff.length; i += 1) {
        const person = staff[i];
        const where = `Staff entry ${i + 1}`;

        if (!isPlainObject(person)) {
            return invalid(`${where} is not a staff object — expected { name, fte, skills, unavailable, maxPerDay, grade }.`);
        }
        if (!isNonEmptyString(person.name)) {
            return invalid(`${where} has no name.`);
        }
        const name = person.name;
        if (seenNames.has(name)) {
            // Two rows with one name make every load figure and every
            // capacity check ambiguous, so this cannot be tolerated.
            return invalid(`${name} appears twice in the staff pool — every name must be unique.`);
        }
        seenNames.add(name);

        if (person.fte !== undefined && person.fte !== null) {
            if (typeof person.fte !== 'number' || !Number.isFinite(person.fte)) {
                return invalid(`${name}'s FTE must be a number between 0 (exclusive) and 1.`);
            }
            if (person.fte <= 0 || person.fte > 1) {
                return invalid(`${name}'s FTE is ${person.fte} — it must be greater than 0 and at most 1.`);
            }
        }

        if (person.skills !== undefined && person.skills !== null) {
            if (!Array.isArray(person.skills)) {
                return invalid(`${name}'s skills must be an array of skill names.`);
            }
            for (const skill of person.skills) {
                if (!isNonEmptyString(skill)) {
                    return invalid(`${name} has an empty skill entry — every skill must be a non-empty name.`);
                }
                skillsHeld.add(skill);
            }
        }

        if (person.unavailable !== undefined && person.unavailable !== null) {
            if (!Array.isArray(person.unavailable)) {
                return invalid(`${name}'s unavailable dates must be an array of YYYY-MM-DD dates.`);
            }
            for (const date of person.unavailable) {
                if (!isDateKey(date)) {
                    return invalid(`${name} has an unavailable date that is not a real YYYY-MM-DD date: ${JSON.stringify(date)}.`);
                }
            }
        }

        if (person.maxPerDay !== undefined && person.maxPerDay !== null) {
            if (!isPositiveInt(person.maxPerDay)) {
                return invalid(`${name}'s maxPerDay must be a whole number of at least 1.`);
            }
        }

        // A grade is OPTIONAL — but a grade that is present and unreadable is
        // rejected rather than treated as absent, because "absent" silently
        // removes somebody from every band-restricted lead slot and a typo
        // should not be able to do that quietly.
        //
        // A blank or whitespace-only string IS absent: that is what an untouched
        // text field in the coming UI will send, and "your grade '  ' is not on
        // the scale" would be a refusal aimed at nobody's mistake.
        const gradeIsBlank =
            typeof person.grade === 'string' && person.grade.trim() === '';
        if (person.grade !== undefined && person.grade !== null && !gradeIsBlank) {
            const number = parseGradeNumber(person.grade);
            if (number === null) {
                return invalid(`${name}'s grade is ${JSON.stringify(person.grade)}, which is not on the allied-health scale — use one of AH${GRADE_MIN}–AH${GRADE_MAX} (case does not matter), or leave it out if it is not recorded.`);
            }
            gradeNumbers.push(number);
        }
    }

    // --- grade bands ----------------------------------------------------------
    // Validated BEFORE the tasks, because a task's `leadBands` is checked
    // against these boundaries: band boundaries that do not partition the scale
    // cannot judge whether anybody is eligible for anything.
    const rawBands = isPlainObject(rules) ? rules.bands : undefined;
    if (rawBands !== undefined && rawBands !== null) {
        const bandCheck = validateGradeBands(rawBands);
        if (!bandCheck.valid) return invalid(bandCheck.reason);
    }
    const bands = rawBands === undefined || rawBands === null ? DEFAULT_GRADE_BANDS : rawBands;

    /** How many people hold a grade in each band — the eligibility floor. */
    const inBandCount = { junior: 0, senior: 0, principal: 0 };
    for (const number of gradeNumbers) {
        const band = bandOfGradeNumber(number, bands);
        if (band !== null) inBandCount[band] += 1;
    }

    // --- tasks ----------------------------------------------------------------
    if (!Array.isArray(tasks) || tasks.length === 0) {
        return invalid('The task list is empty — add at least one task.');
    }

    const seenTasks = new Set();

    for (let i = 0; i < tasks.length; i += 1) {
        const task = tasks[i];
        const where = `Task entry ${i + 1}`;

        if (!isPlainObject(task)) {
            return invalid(`${where} is not a task object — expected { name, requiresSkill, days, leads, coLeads, category, leadBands }.`);
        }
        if (!isNonEmptyString(task.name)) {
            return invalid(`${where} has no name.`);
        }
        const name = task.name;
        if (seenTasks.has(name)) {
            // "Already on this task today" and the per-task tie-breaker both
            // key on the task name, so duplicates would silently merge.
            return invalid(`Task ${name} is listed twice — every task name must be unique.`);
        }
        seenTasks.add(name);

        if (task.requiresSkill !== undefined && task.requiresSkill !== null) {
            if (!isNonEmptyString(task.requiresSkill)) {
                return invalid(`Task ${name}'s requiresSkill must be a skill name, or null for "anyone may lead".`);
            }
            if (!skillsHeld.has(task.requiresSkill)) {
                // Loud, at configure time. Silently generating a roster in
                // which every shift of this task is unfilled is how a typo
                // reaches a clinician.
                return invalid(`Task ${name} requires skill ${task.requiresSkill}, which nobody in the staff pool holds. Check the spelling, or add the skill to whoever is competent.`);
            }
        }

        if (task.days !== undefined && task.days !== null) {
            if (!Array.isArray(task.days)) {
                return invalid(`Task ${name}'s days must be an array of weekday numbers (0 = Sunday … 6 = Saturday).`);
            }
            for (const day of task.days) {
                if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6) {
                    return invalid(`Task ${name} has an invalid day ${JSON.stringify(day)} — use whole numbers 0 (Sunday) to 6 (Saturday).`);
                }
            }
        }

        if (task.leads !== undefined && task.leads !== null) {
            if (!isNonNegativeInt(task.leads)) {
                return invalid(`Task ${name}'s leads must be a whole number of 0 or more.`);
            }
            if (task.leads < 1) {
                // Every shift object the exports consume is built around a
                // lead. A task with no lead cannot produce one, so this is a
                // configuration error and not a solo-task shorthand.
                return invalid(`Task ${name} has leads: 0 — every shift needs a lead. Use coLeads: 0 for a task one person covers alone.`);
            }
        }

        if (task.coLeads !== undefined && task.coLeads !== null) {
            if (!isNonNegativeInt(task.coLeads)) {
                return invalid(`Task ${name}'s coLeads must be a whole number of 0 or more.`);
            }
        }

        if (task.category !== undefined && task.category !== null && !isNonEmptyString(task.category)) {
            return invalid(`Task ${name}'s category must be a non-empty label.`);
        }

        // `leadBands` restricts who may LEAD. Absent means "any grade may lead",
        // which is every task that existed before grades did.
        if (task.leadBands !== undefined && task.leadBands !== null) {
            if (!Array.isArray(task.leadBands)) {
                return invalid(`Task ${name}'s leadBands must be an array of band names — any of ${BAND_ORDER.join(', ')} — or left out so that any grade may lead it.`);
            }
            if (task.leadBands.length === 0) {
                return invalid(`Task ${name} has leadBands: [], which no grade can satisfy, so every one of its lead slots would be unfilled. Leave leadBands out to let any grade lead it.`);
            }

            const wanted = new Set();
            for (const band of task.leadBands) {
                if (typeof band !== 'string' || !BAND_ORDER.includes(band)) {
                    return invalid(`Task ${name} names the lead band ${JSON.stringify(band)}, which is not a band — use ${BAND_ORDER.join(', ')} (lower case).`);
                }
                wanted.add(band);
            }

            // The band twin of the unknown-skill rule: loud, at configure time.
            // Generating a roster in which every lead slot of this task is
            // unfilled is how a mis-set band boundary reaches a clinician.
            const holders = BAND_ORDER.reduce(
                (sum, band) => sum + (wanted.has(band) ? inBandCount[band] : 0),
                0,
            );
            if (holders === 0) {
                return invalid(`Task ${name} may only be led by ${bandSetLabel(wanted)}-band staff (${bandSetGradeLabel(wanted, bands)}), but nobody in the staff pool holds a grade in that band. Check the grades, widen the task's leadBands, or move the band boundaries.`);
            }
        }
    }

    // --- rules ----------------------------------------------------------------
    if (rules !== undefined && rules !== null) {
        if (!isPlainObject(rules)) {
            return invalid('Rules must be an object — expected { maxConcurrentPerDay, maxConsecutiveDays, forbidPairs, bands }.');
        }

        if (rules.maxConcurrentPerDay !== undefined && rules.maxConcurrentPerDay !== null) {
            if (!isPositiveInt(rules.maxConcurrentPerDay)) {
                return invalid('rules.maxConcurrentPerDay must be a whole number of at least 1.');
            }
        }
        if (rules.maxConsecutiveDays !== undefined && rules.maxConsecutiveDays !== null) {
            if (!isPositiveInt(rules.maxConsecutiveDays)) {
                return invalid('rules.maxConsecutiveDays must be a whole number of at least 1.');
            }
        }

        if (rules.forbidPairs !== undefined && rules.forbidPairs !== null) {
            if (!Array.isArray(rules.forbidPairs)) {
                return invalid('rules.forbidPairs must be an array of two-name pairs, e.g. [["Ann","Bob"]].');
            }
            for (const pair of rules.forbidPairs) {
                if (!Array.isArray(pair) || pair.length !== 2) {
                    return invalid(`rules.forbidPairs entry ${JSON.stringify(pair)} must be exactly two names.`);
                }
                const [a, b] = pair;
                if (!isNonEmptyString(a) || !isNonEmptyString(b)) {
                    return invalid(`rules.forbidPairs entry ${JSON.stringify(pair)} must be exactly two names.`);
                }
                if (!seenNames.has(a)) {
                    return invalid(`rules.forbidPairs names ${a}, who is not in the staff pool.`);
                }
                if (!seenNames.has(b)) {
                    return invalid(`rules.forbidPairs names ${b}, who is not in the staff pool.`);
                }
                if (a === b) {
                    return invalid(`rules.forbidPairs pairs ${a} with themselves, which cannot be honoured or violated.`);
                }
            }
        }
    }

    return { valid: true, reason: null };
};

// --- 3. NORMALISATION --------------------------------------------------------
//
// One pass, after validation, so the assignment loop reads only fully-defaulted
// values and never re-derives a default. Everything below this line can assume
// its inputs are well-formed.

/**
 * `grade` is normalised to the canonical `'AH' + int` and resolved to a band
 * ONCE, here, so the assignment loop never re-parses a grade string and the
 * audit and the generator cannot disagree about who is in which band.
 * `grade: null` / `band: null` both mean "not recorded".
 */
const normaliseStaff = (staff, defaultMaxPerDay, bands = DEFAULT_GRADE_BANDS) =>
    staff.map((person) => {
        const grade = normaliseGrade(person.grade);
        return {
            name: person.name,
            fte: typeof person.fte === 'number' ? person.fte : ROSTER_V2_DEFAULTS.fte,
            skills: new Set(Array.isArray(person.skills) ? person.skills : []),
            unavailable: new Set(Array.isArray(person.unavailable) ? person.unavailable : []),
            maxPerDay: isPositiveInt(person.maxPerDay) ? person.maxPerDay : defaultMaxPerDay,
            grade,
            band: grade === null ? null : bandOfGradeNumber(parseGradeNumber(grade), bands),
        };
    });

/**
 * `leadBands` becomes a `Set` of band names, or `null` for "any grade may lead".
 * An empty or all-unknown list normalises to `null` only because validation has
 * already refused it; this is belt and braces, not a fallback.
 */
const normaliseLeadBands = (value) => {
    if (!Array.isArray(value) || value.length === 0) return null;
    const wanted = new Set();
    for (const band of value) {
        if (typeof band === 'string' && BAND_ORDER.includes(band)) wanted.add(band);
    }
    return wanted.size === 0 ? null : wanted;
};

const normaliseTasks = (tasks) =>
    tasks.map((task) => ({
        name: task.name,
        requiresSkill: isNonEmptyString(task.requiresSkill) ? task.requiresSkill : null,
        days: Array.isArray(task.days) ? [...task.days] : [...ROSTER_V2_DEFAULTS.days],
        leads: isPositiveInt(task.leads) ? task.leads : ROSTER_V2_DEFAULTS.leads,
        coLeads: isNonNegativeInt(task.coLeads) ? task.coLeads : ROSTER_V2_DEFAULTS.coLeads,
        category: isNonEmptyString(task.category) ? task.category : ROSTER_V2_DEFAULTS.category,
        leadBands: normaliseLeadBands(task.leadBands),
    }));

/**
 * `forbidPairs` as an adjacency map, so the pool filter is a set lookup rather
 * than a scan of the pair list per candidate.
 */
const buildForbidMap = (forbidPairs, staffNames) => {
    const map = new Map();
    for (const name of staffNames) map.set(name, new Set());
    for (const [a, b] of forbidPairs) {
        map.get(a).add(b);
        map.get(b).add(a);
    }
    return map;
};

// --- 4. THE REJECTION TAXONOMY -----------------------------------------------
//
// Requirement 5 of this engine's brief: never silently double-book, never
// silently drop a slot. That means an empty candidate pool has to be
// EXPLAINABLE, not merely detectable — so every excluded person is classified
// by the FIRST constraint they fail, in a fixed order, and the tally is what
// the `unfilled` reason is written from.

const REJECT_SKILL = 'skill';
/**
 * Out of band for this task's LEAD slot. Sits immediately after `REJECT_SKILL`
 * because it is the same KIND of fact — a standing property of the person, not
 * something today happens to have used up — and the reason string reads in this
 * order. Co-lead slots never produce this rejection: bands gate leads only.
 */
const REJECT_BAND = 'band';
const REJECT_LEAVE = 'leave';
const REJECT_ON_TASK = 'onTask';
const REJECT_CAPACITY = 'capacity';
const REJECT_PAIR = 'pair';
const REJECT_CONSECUTIVE = 'consecutive';

/**
 * How many days in an unbroken run ending the day BEFORE `dateKey` does `name`
 * already hold at least one duty?
 *
 * Walks backwards through the dates this run has already written. Days on which
 * no task runs (a weekend, for a Mon–Fri task list) break the run, which is
 * what makes `maxConsecutiveDays` meaningful rather than decorative.
 *
 * KNOWN LIMIT: the walk starts inside this generation run, so duties from a
 * PREVIOUS run — a roster generated a month at a time — are invisible to it. A
 * clinician can therefore finish one run on a Saturday and open the next on a
 * Sunday without the limit noticing.
 */
const consecutiveRunBefore = (dutiesByDate, name, date) => {
    let run = 0;
    let cursor = addDays(date, -1);

    // Bounded by the longest run this engine can generate (52 weeks).
    for (let guard = 0; guard < MAX_ROSTER_WEEKS * DAYS_PER_WEEK; guard += 1) {
        const day = dutiesByDate.get(toLocalDateKey(cursor));
        if (!day || !day.get(name)) break;
        run += 1;
        cursor = addDays(cursor, -1);
    }

    return run;
};

/**
 * Why can `person` NOT take this slot? `null` means they can.
 *
 * Order matters: it is the order the reason string reads in, and it is chosen so
 * the most fundamental fact wins. Somebody who lacks the skill is not also
 * reported as "on leave" — they were never a candidate for this task at all.
 */
const rejectionFor = ({
    person,
    task,
    role,
    dateKey,
    date,
    dutiesOnDate,
    onTaskToday,
    forbidMap,
    dutiesByDate,
    maxConsecutiveDays,
}) => {
    if (task.requiresSkill && !person.skills.has(task.requiresSkill)) {
        return REJECT_SKILL;
    }
    // The band gate, and ONLY on the lead slot. `person.band === null` (no grade
    // recorded) fails it: band membership cannot be verified, and guessing is
    // how somebody ends up leading a duty their grade does not carry. The two
    // gates COMPOSE — a lead of a skill-gated, band-gated task must pass both.
    if (role === 'lead' && task.leadBands !== null) {
        if (person.band === null || !task.leadBands.has(person.band)) {
            return REJECT_BAND;
        }
    }
    if (person.unavailable.has(dateKey)) {
        return REJECT_LEAVE;
    }
    if (onTaskToday.has(person.name)) {
        return REJECT_ON_TASK;
    }
    if ((dutiesOnDate.get(person.name) || 0) >= person.maxPerDay) {
        return REJECT_CAPACITY;
    }

    const forbidden = forbidMap.get(person.name);
    for (const other of onTaskToday) {
        if (forbidden.has(other)) return REJECT_PAIR;
    }

    // Already working today? Then this duty does not lengthen their run — the
    // day is spoken for either way, and how much they may do on one day is
    // `maxPerDay`'s question, not this one.
    const alreadyWorkingToday = (dutiesOnDate.get(person.name) || 0) > 0;
    if (!alreadyWorkingToday) {
        if (consecutiveRunBefore(dutiesByDate, person.name, date) >= maxConsecutiveDays) {
            return REJECT_CONSECUTIVE;
        }
    }

    return null;
};

/**
 * The `unfilled` reason: which constraint bound, and by how much.
 *
 * Reads, for example:
 *   no available staff hold skill CPET for EFT lead on 2026-02-10
 *   (2 qualified, 1 on leave, 1 at daily limit)
 *
 *   no available Senior/Principal-band staff for Outpatient Clinic lead on
 *   2026-09-14 (3 in band, 1 on leave, 1 at daily limit, 1 already on this task)
 *
 * The tally is scoped to people who could ever do this task: a lacked skill is
 * reported once, as the shortfall between the pool and the qualified count,
 * rather than as one entry per unqualified colleague. A band gate is reported
 * the same way — `3 in band` is how many of the pool could lead this task on
 * SOME day, and the counts after it say what stopped each of them today. Where
 * both gates apply, `in band` counts those who cleared the skill gate too, so
 * the numbers still narrow left to right and never double-count anybody.
 */
const describeEmptyPool = ({ task, role, dateKey, tally, poolSize }) => {
    const qualified = poolSize - tally[REJECT_SKILL];
    // Only the lead slot is band-gated, so only the lead slot may say "band".
    const bandGated = role === 'lead' && task.leadBands !== null;
    const inBand = qualified - tally[REJECT_BAND];

    const parts = [];
    if (task.requiresSkill) parts.push(`${qualified} qualified`);
    else if (!bandGated) parts.push(`${poolSize} in pool`);
    if (bandGated) parts.push(`${inBand} in band`);

    if (tally[REJECT_LEAVE]) parts.push(`${tally[REJECT_LEAVE]} on leave`);
    if (tally[REJECT_CAPACITY]) parts.push(`${tally[REJECT_CAPACITY]} at daily limit`);
    if (tally[REJECT_ON_TASK]) parts.push(`${tally[REJECT_ON_TASK]} already on this task`);
    if (tally[REJECT_PAIR]) parts.push(`${tally[REJECT_PAIR]} blocked by a forbidden pairing`);
    if (tally[REJECT_CONSECUTIVE]) parts.push(`${tally[REJECT_CONSECUTIVE]} at the consecutive-day limit`);

    const bandLabel = bandGated ? bandSetLabel(task.leadBands) : '';

    let head;
    if (task.requiresSkill && bandGated) {
        head = `no available staff hold skill ${task.requiresSkill} and sit in the ${bandLabel} band for ${task.name} ${role} on ${dateKey}`;
    } else if (task.requiresSkill) {
        head = `no available staff hold skill ${task.requiresSkill} for ${task.name} ${role} on ${dateKey}`;
    } else if (bandGated) {
        head = `no available ${bandLabel}-band staff for ${task.name} ${role} on ${dateKey}`;
    } else {
        head = `no available staff for ${task.name} ${role} on ${dateKey}`;
    }

    return `${head} (${parts.join(', ')})`;
};

// --- 5. CANDIDATE SELECTION --------------------------------------------------

/**
 * FTE-weighted fairness, with fully deterministic tie-breaking.
 *
 *   1. lowest `dutiesSoFar / fte` — so a 0.6 FTE colleague accrues duties at
 *      roughly 60% of a full-timer's rate;
 *   2. then fewest previous assignments to THIS task — so one person does not
 *      become the de facto owner of one duty;
 *   3. then name order, by code unit.
 *
 * `localeCompare` is deliberately avoided: its result depends on the host's ICU
 * data and collation, which would make the roster environment-dependent and
 * therefore untestable.
 */
const compareCandidates = (a, b) => {
    const ratioA = a.duties / a.fte;
    const ratioB = b.duties / b.fte;
    if (Math.abs(ratioA - ratioB) > RATIO_EPSILON) return ratioA < ratioB ? -1 : 1;

    if (a.taskDuties !== b.taskDuties) return a.taskDuties - b.taskDuties;

    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
};

// --- 6. HARD VS SOFT CONSTRAINTS ---------------------------------------------
//
// The published Nurse Rostering Problem literature (INRC-II and its lineage)
// separates these two categories, and so does this engine, because they have
// different consequences:
//
//   HARD — violating one makes the roster INFEASIBLE. This engine never
//   violates a hard constraint; a slot it cannot fill within them goes to
//   `unfilled` instead. Skill match, LEAD BAND, availability,
//   one-assignment-per-slot, daily capacity, `forbidPairs`,
//   `maxConsecutiveDays`.
//
//   SOFT — violating one is legal but undesirable. These are ALLOWED and
//   COUNTED, never enforced: load imbalance against the FTE-weighted target,
//   one person repeatedly drawing the same task, uneven weekend distribution,
//   and isolated single working days.
//
// `score.hardViolations` is not asserted to be zero — it is MEASURED by
// re-auditing the finished roster (`auditHardConstraints`). That is the
// post-mortem A-RC4 lesson applied to this engine: a claim that the roster is
// conflict-free is worth nothing unless something reads the roster back and
// checks. If it is ever non-zero, that is a bug in the construction loop and it
// is visible in the output rather than hidden behind a comment.
//
// SEAM FOR LATER WORK: `scoreRoster` and `auditHardConstraints` take a roster
// and a config and are pure. Neither is entangled with construction, so a
// local-search / hill-climbing pass (deliberately NOT built here) can score any
// candidate roster it invents by calling the same functions.

/**
 * Relative weights of the soft constraints in the single `softPenalty` figure.
 *
 * HONEST LIMIT: these are a defensible starting point, NOT a calibrated
 * preference model. No clinician has been asked how much one isolated working
 * day is worth against one duty of load imbalance. They are exported and frozen
 * so that a later optimisation pass, or a department with different priorities,
 * changes one visible constant rather than editing the scorer.
 */
export const SOFT_PENALTY_WEIGHTS = Object.freeze({
    loadImbalance: 1,
    taskRepetition: 1,
    weekendImbalance: 2,
    isolatedDays: 1,
});

const HARD_RULE_SKILL = 'skill';
/**
 * The lead of a band-restricted task holds a grade outside its bands (or holds
 * no grade at all). Audited on the LEAD only, because that is the only slot the
 * gate applies to — a swap tool that moves an out-of-band clinician into a lead
 * is exactly what this rule is here to catch after the fact.
 */
const HARD_RULE_LEAD_BAND = 'leadBand';
const HARD_RULE_AVAILABILITY = 'availability';
const HARD_RULE_ONE_PER_SLOT = 'onePerSlot';
const HARD_RULE_CAPACITY = 'dailyCapacity';
const HARD_RULE_FORBID_PAIR = 'forbidPair';
const HARD_RULE_CONSECUTIVE = 'maxConsecutiveDays';

const round2 = (value) => Math.round(value * 100) / 100;

/** Everyone named on a shift, whichever field carries them. */
const shiftAssignees = (shift) =>
    (Array.isArray(shift.assignees)
        ? shift.assignees
        : [shift.lead, shift.coLead]
    ).filter((name) => typeof name === 'string' && name !== '');

/** `{ name: Set<dateKey> }` — the days each person holds at least one duty. */
const workedDatesByPerson = (roster) => {
    const worked = new Map();
    for (const [dateKey, shifts] of Object.entries(roster)) {
        for (const shift of shifts) {
            for (const name of shiftAssignees(shift)) {
                if (!worked.has(name)) worked.set(name, new Set());
                worked.get(name).add(dateKey);
            }
        }
    }
    return worked;
};

/**
 * The longest unbroken run of CALENDAR days on which `dates` has an entry, and
 * every run that exceeds `limit`.
 */
const runsExceeding = (dates, limit) => {
    const sorted = [...dates].sort();
    const offending = [];

    let run = 0;
    let runStart = null;
    let previous = null;

    const close = () => {
        if (run > limit) offending.push({ from: runStart, days: run });
    };

    for (const key of sorted) {
        const contiguous =
            previous !== null && toLocalDateKey(addDays(parseLocalDateKey(previous), 1)) === key;
        if (contiguous) {
            run += 1;
        } else {
            close();
            run = 1;
            runStart = key;
        }
        previous = key;
    }
    close();

    return offending;
};

/**
 * Re-read a finished roster and list every HARD constraint it breaks.
 *
 * Pure, and callable on any candidate roster — including one this engine did not
 * build. Returns `{ ok: true, count, violations }`, or `{ ok: false, reason }`
 * if the config it is being judged against is itself invalid.
 */
export const auditHardConstraints = (roster, config) => {
    const validation = validateRosterV2Config(config);
    if (!validation.valid) return { ok: false, reason: validation.reason };
    if (!isPlainObject(roster)) {
        return { ok: false, reason: 'No roster was supplied to audit.' };
    }

    const rules = isPlainObject(config.rules) ? config.rules : {};
    const maxConcurrentPerDay = isPositiveInt(rules.maxConcurrentPerDay)
        ? rules.maxConcurrentPerDay
        : ROSTER_V2_DEFAULTS.maxConcurrentPerDay;
    const maxConsecutiveDays = isPositiveInt(rules.maxConsecutiveDays)
        ? rules.maxConsecutiveDays
        : ROSTER_V2_DEFAULTS.maxConsecutiveDays;
    const forbidPairs = Array.isArray(rules.forbidPairs) ? rules.forbidPairs : [];

    const staff = normaliseStaff(config.staff, maxConcurrentPerDay, resolveGradeBands(rules));
    const tasks = normaliseTasks(config.tasks);
    const byName = new Map(staff.map((person) => [person.name, person]));
    const byTask = new Map(tasks.map((task) => [task.name, task]));
    const forbidMap = buildForbidMap(forbidPairs, staff.map((person) => person.name));

    const violations = [];
    const add = (rule, detail, date, task) => violations.push({ rule, date, task, detail });

    for (const dateKey of Object.keys(roster).sort()) {
        const shifts = roster[dateKey];
        const dutiesToday = new Map();
        /** taskName -> [names], for the repeat and pairing checks. */
        const onTask = new Map();

        for (const shift of shifts) {
            const people = shiftAssignees(shift);
            const task = byTask.get(shift.task);

            // One person cannot hold two duties of one shift group.
            if (new Set(people).size !== people.length) {
                add(HARD_RULE_ONE_PER_SLOT, `${shift.task} lists somebody twice in one shift`, dateKey, shift.task);
            }

            // The band gate, read back off the finished roster. `shift.lead` is
            // the only field that identifies WHICH assignee is the lead, so a
            // roster shape without it cannot be band-audited — and says so by
            // simply not asserting anything, rather than by guessing.
            if (task && task.leadBands !== null && isNonEmptyString(shift.lead)) {
                const leadPerson = byName.get(shift.lead);
                if (leadPerson && (leadPerson.band === null || !task.leadBands.has(leadPerson.band))) {
                    add(
                        HARD_RULE_LEAD_BAND,
                        `${shift.lead} (${leadPerson.grade === null ? 'no grade recorded' : leadPerson.grade}) leads ${shift.task}, which only ${bandSetLabel(task.leadBands)}-band staff may lead`,
                        dateKey,
                        shift.task,
                    );
                }
            }

            if (!onTask.has(shift.task)) onTask.set(shift.task, []);

            for (const name of people) {
                const person = byName.get(name);
                if (!person) {
                    add(HARD_RULE_AVAILABILITY, `${name} is not in the staff pool`, dateKey, shift.task);
                    continue;
                }
                if (task && task.requiresSkill && !person.skills.has(task.requiresSkill)) {
                    add(HARD_RULE_SKILL, `${name} does not hold ${task.requiresSkill}`, dateKey, shift.task);
                }
                if (person.unavailable.has(dateKey)) {
                    add(HARD_RULE_AVAILABILITY, `${name} is unavailable on ${dateKey}`, dateKey, shift.task);
                }
                dutiesToday.set(name, (dutiesToday.get(name) || 0) + 1);
                onTask.get(shift.task).push(name);
            }
        }

        for (const [taskName, names] of onTask) {
            const seen = new Set();
            for (const name of names) {
                if (seen.has(name)) {
                    add(HARD_RULE_ONE_PER_SLOT, `${name} is on ${taskName} more than once`, dateKey, taskName);
                }
                seen.add(name);
            }
            for (const name of seen) {
                for (const other of seen) {
                    if (name < other && forbidMap.get(name)?.has(other)) {
                        add(HARD_RULE_FORBID_PAIR, `${name} and ${other} are a forbidden pairing`, dateKey, taskName);
                    }
                }
            }
        }

        for (const [name, count] of dutiesToday) {
            const person = byName.get(name);
            if (person && count > person.maxPerDay) {
                add(HARD_RULE_CAPACITY, `${name} holds ${count} duties, limit ${person.maxPerDay}`, dateKey, null);
            }
        }
    }

    const worked = workedDatesByPerson(roster);
    for (const [name, dates] of worked) {
        for (const run of runsExceeding(dates, maxConsecutiveDays)) {
            add(
                HARD_RULE_CONSECUTIVE,
                `${name} works ${run.days} consecutive days from ${run.from}, limit ${maxConsecutiveDays}`,
                run.from,
                null,
            );
        }
    }

    return { ok: true, count: violations.length, violations };
};

/**
 * Score a roster: hard violations (must be 0) and a single soft penalty.
 *
 * The soft penalty is a comparable number, not a physical quantity: "this
 * configuration scores worse than that one" is the only claim it supports.
 * `breakdown` is what makes it actionable.
 *
 *   loadImbalance     total absolute deviation from each person's FTE-weighted
 *                     share of the duties actually generated.
 *   taskRepetition    how far above an even split any one person's count of any
 *                     one task goes, summed. The split is over the people
 *                     ELIGIBLE for that task (its skill holders), so a task only
 *                     two people are competent to do is not penalised for being
 *                     done by those two.
 *                     KNOWN ASYMMETRY, flagged rather than fixed: `leadBands` is
 *                     NOT folded into that eligible set. A task only one
 *                     principal may lead therefore DOES accrue repetition
 *                     penalty for that principal leading it daily, where the
 *                     skill equivalent is forgiven. The eligible set is honest
 *                     as written — any grade may CO-lead a band-gated task, so
 *                     the whole pool really is eligible for the task — but the
 *                     lead component of the count is judged against a pool that
 *                     could never have taken it. `softPenalty` stays comparable
 *                     between two configurations that differ only in staffing;
 *                     it is not comparable between a banded and an unbanded
 *                     version of the same department.
 *   weekendImbalance  the same deviation measure, restricted to Saturday and
 *                     Sunday duties.
 *   isolatedDays      working days with no duty on either the day before or the
 *                     day after — a single day in, surrounded by days off.
 *
 * Returns `{ ok: true, hardViolations, softPenalty, breakdown }`, or
 * `{ ok: false, reason }` for an invalid config.
 */
export const scoreRoster = (roster, config) => {
    const audit = auditHardConstraints(roster, config);
    if (!audit.ok) return { ok: false, reason: audit.reason };

    const rules = isPlainObject(config.rules) ? config.rules : {};
    const staff = normaliseStaff(
        config.staff,
        isPositiveInt(rules.maxConcurrentPerDay)
            ? rules.maxConcurrentPerDay
            : ROSTER_V2_DEFAULTS.maxConcurrentPerDay,
        resolveGradeBands(rules),
    );
    const tasks = normaliseTasks(config.tasks);

    const duties = new Map(staff.map((person) => [person.name, 0]));
    const weekendDuties = new Map(staff.map((person) => [person.name, 0]));
    /** taskName -> (name -> count) */
    const perTask = new Map(tasks.map((task) => [task.name, new Map()]));

    for (const [dateKey, shifts] of Object.entries(roster)) {
        const weekday = parseLocalDateKey(dateKey).getDay();
        const isWeekend = weekday === 0 || weekday === 6;

        for (const shift of shifts) {
            for (const name of shiftAssignees(shift)) {
                if (!duties.has(name)) continue;
                duties.set(name, duties.get(name) + 1);
                if (isWeekend) weekendDuties.set(name, weekendDuties.get(name) + 1);

                const task = perTask.get(shift.task);
                if (task) task.set(name, (task.get(name) || 0) + 1);
            }
        }
    }

    const totalFte = staff.reduce((sum, person) => sum + person.fte, 0);

    /** Total absolute deviation from each person's FTE-weighted target. */
    const deviation = (counts) => {
        const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
        if (total === 0) return 0;
        let out = 0;
        for (const person of staff) {
            const target = total * (person.fte / totalFte);
            out += Math.abs((counts.get(person.name) || 0) - target);
        }
        return out;
    };

    let taskRepetition = 0;
    for (const task of tasks) {
        const counts = perTask.get(task.name);
        const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
        if (total === 0) continue;

        const eligible = task.requiresSkill
            ? staff.filter((person) => person.skills.has(task.requiresSkill))
            : staff;
        if (eligible.length === 0) continue;

        const evenShare = total / eligible.length;
        for (const person of eligible) {
            taskRepetition += Math.max(0, (counts.get(person.name) || 0) - evenShare);
        }
    }

    let isolatedDays = 0;
    for (const [, dates] of workedDatesByPerson(roster)) {
        for (const dateKey of dates) {
            const date = parseLocalDateKey(dateKey);
            const before = toLocalDateKey(addDays(date, -1));
            const after = toLocalDateKey(addDays(date, 1));
            if (!dates.has(before) && !dates.has(after)) isolatedDays += 1;
        }
    }

    const breakdown = {
        loadImbalance: round2(deviation(duties)),
        taskRepetition: round2(taskRepetition),
        weekendImbalance: round2(deviation(weekendDuties)),
        isolatedDays,
    };

    const softPenalty = round2(
        Object.entries(breakdown).reduce(
            (sum, [key, value]) => sum + SOFT_PENALTY_WEIGHTS[key] * value,
            0,
        ),
    );

    return { ok: true, hardViolations: audit.count, softPenalty, breakdown };
};

// --- 7. THE ENGINE -----------------------------------------------------------

/**
 * Generate a constraint-aware roster.
 *
 * Returns, on success:
 *
 *   {
 *     ok: true,
 *     effectiveStart,   // the Monday actually used, 'YYYY-MM-DD'
 *     roster,           // { dateKey: [ shift, … ] }, chronological
 *     unfilled,         // [ { date, task, role, reason } ]
 *     load,             // { name: { duties, fte, weighted, share } }
 *     score,            // { hardViolations, softPenalty, breakdown }
 *     warnings,         // [ sentence, … ]
 *   }
 *
 * and on a configuration error `{ ok: false, reason }` — nothing else, so a
 * caller cannot mistake a refusal for an empty roster.
 *
 * SLOT ORDERING — MOST CONSTRAINED FIRST (minimum remaining values).
 *
 * Slots are NOT filled in `task → role` iteration order. Within each day, the
 * engine repeatedly picks the slot with the FEWEST eligible candidates and fills
 * that one next. Without this, a naive pass can spend the only CPET-qualified
 * clinician on a duty anybody could have covered and then report the
 * CPET-requiring duty as unfillable on the same day — an `unfilled` entry the
 * engine inflicted on itself, indistinguishable in the output from a real
 * shortage. Ties are broken by the original iteration order, so the result stays
 * reproducible.
 *
 * The eligibility count that ordering reads includes the LEAD BAND gate, so a
 * task restricted to `leadBands: ['principal']` is recognised as scarce for the
 * same reason a CPET task is, and the department's one principal is not spent on
 * a duty anybody could have led.
 *
 * Leads are still filled before co-leads (two phases, each internally ordered by
 * scarcity). That ordering is what makes it impossible for a pairing group to
 * end up holding a co-lead with no lead to attach them to.
 *
 * A day on which every slot was unfilled gets NO key in `roster`; the record of
 * what could not be staffed lives in `unfilled`. That is the same convention
 * `generateRoster` follows (keys exist only where a shift was pushed) and it
 * keeps the emptiness guard in `prepareRosterWrite` meaningful.
 */
export const generateRosterV2 = (config) => {
    const validation = validateRosterV2Config(config);
    if (!validation.valid) {
        return { ok: false, reason: validation.reason };
    }

    const rules = isPlainObject(config.rules) ? config.rules : {};
    const maxConcurrentPerDay = isPositiveInt(rules.maxConcurrentPerDay)
        ? rules.maxConcurrentPerDay
        : ROSTER_V2_DEFAULTS.maxConcurrentPerDay;
    const maxConsecutiveDays = isPositiveInt(rules.maxConsecutiveDays)
        ? rules.maxConsecutiveDays
        : ROSTER_V2_DEFAULTS.maxConsecutiveDays;
    const forbidPairs = Array.isArray(rules.forbidPairs) ? rules.forbidPairs : [];
    const bands = resolveGradeBands(rules);

    const staff = normaliseStaff(config.staff, maxConcurrentPerDay, bands);
    const tasks = normaliseTasks(config.tasks);
    const forbidMap = buildForbidMap(forbidPairs, staff.map((person) => person.name));

    // --- dates ----------------------------------------------------------------
    const requestedStart = parseLocalDateKey(config.startDate);
    const start = snapToMonday(requestedStart);
    const effectiveStart = toLocalDateKey(start);

    const warnings = [];
    if (effectiveStart !== config.startDate) {
        warnings.push(
            `${config.startDate} is a ${WEEKDAY_NAMES[requestedStart.getDay()]}; the roster was snapped to the Monday of that week, ${effectiveStart}.`,
        );
    }

    // --- running state --------------------------------------------------------
    const duties = new Map(staff.map((person) => [person.name, 0]));
    /** dateKey -> (name -> duty count that day) */
    const dutiesByDate = new Map();
    /** name -> (taskName -> duty count), the second tie-breaker */
    const dutiesByTask = new Map(staff.map((person) => [person.name, new Map()]));

    const roster = {};
    const unfilled = [];

    // --- structural strain, reported before a single slot is filled ------------

    // Ungraded staff matter only when something is actually band-gated. Said
    // once, by name, because "why is Kamala never leading the clinic?" has
    // exactly one answer and it should not require reading the engine to find.
    const bandGatedTasks = tasks.filter((task) => task.leadBands !== null);
    if (bandGatedTasks.length > 0) {
        const ungraded = staff.filter((person) => person.grade === null).map((person) => person.name);
        if (ungraded.length > 0) {
            warnings.push(
                `${ungraded.length === 1 ? '1 staff member has' : `${ungraded.length} staff members have`} no job grade recorded (${ungraded.join(', ')}), so they cannot lead ${bandGatedTasks.length === 1 ? 'the band-restricted task' : `any of the ${bandGatedTasks.length} band-restricted tasks`}. They remain eligible for every other duty, and may still co-lead those tasks.`,
            );
        }
    }

    for (const task of tasks) {
        if (task.days.length === 0) {
            warnings.push(
                `Task ${task.name} has no days selected, so it will never appear in the roster.`,
            );
        }
        if (task.requiresSkill) {
            const holders = staff.filter((person) => person.skills.has(task.requiresSkill));
            const needed = task.leads + task.coLeads;
            if (holders.length < needed) {
                warnings.push(
                    `Task ${task.name} needs ${needed} ${needed === 1 ? 'person' : 'people'} per day but only ${holders.length} ${holders.length === 1 ? 'holds' : 'hold'} skill ${task.requiresSkill}, so some slots cannot be filled on any day.`,
                );
            }
        }
        if (task.leadBands !== null) {
            // Counted over the INTERSECTION of both gates, because that is the
            // pool a lead is actually drawn from. Validation already refuses a
            // band with nobody in it at all; this catches the narrower and more
            // common case — enough people in the band, but not enough of them
            // holding the skill, or simply fewer than the task wants per day.
            const eligibleLeads = staff.filter((person) =>
                person.band !== null &&
                task.leadBands.has(person.band) &&
                (!task.requiresSkill || person.skills.has(task.requiresSkill)));

            if (eligibleLeads.length < task.leads) {
                warnings.push(
                    `Task ${task.name} needs ${task.leads} ${task.leads === 1 ? 'lead' : 'leads'} per day from the ${bandSetLabel(task.leadBands)} band (${bandSetGradeLabel(task.leadBands, bands)})${task.requiresSkill ? ` who also hold skill ${task.requiresSkill}` : ''}, but only ${eligibleLeads.length} ${eligibleLeads.length === 1 ? 'person qualifies' : 'people qualify'}, so some lead slots cannot be filled on any day.`,
                );
            }
        }
    }

    // --- the assignment loop --------------------------------------------------
    let totalDemand = 0;
    let totalCapacity = 0;

    for (let week = 0; week < config.weeks; week += 1) {
        for (let offset = 0; offset < DAYS_PER_WEEK; offset += 1) {
            const date = addDays(start, week * DAYS_PER_WEEK + offset);
            const dateKey = toLocalDateKey(date);
            // Derived from the date itself, never from `offset`: post-mortem
            // B1 is exactly the bug of trusting a fixed offset to be a weekday.
            const weekday = date.getDay();

            const running = tasks.filter((task) => task.days.includes(weekday));
            if (running.length === 0) continue;

            dutiesByDate.set(dateKey, new Map());
            const dutiesOnDate = dutiesByDate.get(dateKey);

            for (const task of running) totalDemand += task.leads + task.coLeads;
            for (const person of staff) {
                if (!person.unavailable.has(dateKey)) totalCapacity += person.maxPerDay;
            }

            /** taskName -> { onTaskToday, leads, coLeads } for this date. */
            const dayState = new Map(
                running.map((task) => [task.name, { onTaskToday: new Set(), leads: [], coLeads: [] }]),
            );

            // `unfilled` is collected per day and emitted in READING order (lead
            // slots by task, then co-lead slots by task) rather than in the
            // scarcity order the slots were resolved in.
            const dayUnfilled = [];

            /**
             * Who could take this slot, the best of them, and — if nobody — the
             * tally the reason is written from.
             */
            const evaluateSlot = (slot) => {
                const { task, role } = slot;
                const { onTaskToday } = dayState.get(task.name);

                const tally = {
                    [REJECT_SKILL]: 0,
                    [REJECT_BAND]: 0,
                    [REJECT_LEAVE]: 0,
                    [REJECT_ON_TASK]: 0,
                    [REJECT_CAPACITY]: 0,
                    [REJECT_PAIR]: 0,
                    [REJECT_CONSECUTIVE]: 0,
                };

                let eligible = 0;
                let best = null;

                for (const person of staff) {
                    const rejection = rejectionFor({
                        person,
                        task,
                        // The band gate is counted HERE, inside the eligibility
                        // count MRV orders by. A band-gated lead slot is scarce
                        // precisely because of the gate, and a scarcity measure
                        // that ignored it would let an ungated slot spend the
                        // department's only in-band clinician — the stranding
                        // failure MRV exists to prevent, in a new costume.
                        role,
                        dateKey,
                        date,
                        dutiesOnDate,
                        onTaskToday,
                        forbidMap,
                        dutiesByDate,
                        maxConsecutiveDays,
                    });

                    if (rejection) {
                        tally[rejection] += 1;
                        continue;
                    }

                    eligible += 1;
                    const candidate = {
                        name: person.name,
                        fte: person.fte,
                        duties: duties.get(person.name),
                        taskDuties: dutiesByTask.get(person.name).get(task.name) || 0,
                    };
                    if (best === null || compareCandidates(candidate, best) < 0) {
                        best = candidate;
                    }
                }

                return { eligible, best, tally };
            };

            const assign = (slot, name) => {
                const { task } = slot;
                const state = dayState.get(task.name);

                duties.set(name, duties.get(name) + 1);
                dutiesOnDate.set(name, (dutiesOnDate.get(name) || 0) + 1);

                const byTask = dutiesByTask.get(name);
                byTask.set(task.name, (byTask.get(task.name) || 0) + 1);

                state.onTaskToday.add(name);
                if (slot.role === 'lead') state.leads.push(name);
                else state.coLeads.push(name);
            };

            /**
             * Fill a set of slots MOST CONSTRAINED FIRST.
             *
             * The eligible-candidate count is recomputed on every iteration
             * because each assignment consumes capacity and therefore changes
             * the counts of every slot still pending.
             */
            const fillMostConstrainedFirst = (slots) => {
                const pending = [...slots];

                while (pending.length > 0) {
                    let chosenIndex = -1;
                    let chosenSlot = null;
                    let chosenEvaluation = null;

                    for (let i = 0; i < pending.length; i += 1) {
                        const slot = pending[i];
                        const evaluation = evaluateSlot(slot);

                        // Scarcest first; ties go to the slot that came earlier
                        // in configuration order, so equal scarcity means equal
                        // treatment and the roster is reproducible.
                        //
                        // `pending` already preserves configuration order, so
                        // the first minimum encountered is also the lowest
                        // `order` — the explicit comparison is belt and braces
                        // that keeps the tie-break correct if this list is ever
                        // built or sorted differently.
                        const better =
                            chosenEvaluation === null ||
                            evaluation.eligible < chosenEvaluation.eligible ||
                            (evaluation.eligible === chosenEvaluation.eligible &&
                                slot.order < chosenSlot.order);

                        if (better) {
                            chosenIndex = i;
                            chosenSlot = slot;
                            chosenEvaluation = evaluation;
                        }
                    }

                    pending.splice(chosenIndex, 1);

                    if (chosenEvaluation.eligible === 0) {
                        dayUnfilled.push({
                            order: chosenSlot.order,
                            entry: {
                                date: dateKey,
                                task: chosenSlot.task.name,
                                role: chosenSlot.role,
                                reason: describeEmptyPool({
                                    task: chosenSlot.task,
                                    role: chosenSlot.role,
                                    dateKey,
                                    tally: chosenEvaluation.tally,
                                    poolSize: staff.length,
                                }),
                            },
                        });
                        continue;
                    }

                    assign(chosenSlot, chosenEvaluation.best.name);
                }
            };

            // --- phase 1: every lead slot on this day, scarcest first ---------
            let order = 0;
            const leadSlots = [];
            for (const task of running) {
                for (let i = 0; i < task.leads; i += 1) {
                    leadSlots.push({ task, role: 'lead', order: order += 1 });
                }
            }
            fillMostConstrainedFirst(leadSlots);

            // --- phase 2: co-lead slots, scarcest first -----------------------
            const coLeadSlots = [];
            for (const task of running) {
                const state = dayState.get(task.name);

                if (state.leads.length === 0) {
                    // Assigning co-leads now would orphan them: there is no lead
                    // to pair them with, and promoting one would be the very
                    // fallback this engine refuses to make. Record the co-lead
                    // slots as unfilled and say why.
                    for (let i = 0; i < task.coLeads; i += 1) {
                        dayUnfilled.push({
                            order: order += 1,
                            entry: {
                                date: dateKey,
                                task: task.name,
                                role: 'coLead',
                                reason: `no lead could be assigned to ${task.name} on ${dateKey}, so its co-lead slots were left unfilled rather than staffed without a lead`,
                            },
                        });
                    }
                    continue;
                }

                for (let i = 0; i < task.coLeads; i += 1) {
                    coLeadSlots.push({ task, role: 'coLead', order: order += 1 });
                }
            }
            fillMostConstrainedFirst(coLeadSlots);

            // --- emit the day's shift objects, in task order ------------------
            for (const task of running) {
                const state = dayState.get(task.name);
                if (state.leads.length === 0) continue;

                // One shift object per pairing group, so the two-name shape the
                // ICS and CSV exports interpolate is never broken. Co-leads are
                // dealt round-robin across the groups that actually HAVE a lead;
                // where a group holds more than one co-lead, `coLead` is the
                // first of them and `assignees` carries everybody.
                const groups = state.leads.map((lead) => ({ lead, coLeads: [] }));
                state.coLeads.forEach((name, i) => {
                    groups[i % groups.length].coLeads.push(name);
                });

                for (const group of groups) {
                    const coLead = group.coLeads.length > 0 ? group.coLeads[0] : undefined;

                    const shift = {
                        task: task.name,
                        lead: group.lead,
                        // A solo task must not carry `coLead: undefined` — an
                        // absent co-lead is an ABSENT FIELD. `undefined` here is
                        // what put the string "undefined" in the CSV export
                        // (audit M7), and `buildShiftStaffLabel` already treats
                        // it as "no co-lead" when building the display string.
                        ...(coLead === undefined ? {} : { coLead }),
                        staff: buildShiftStaffLabel(group.lead, coLead),
                        category: task.category,
                        week: week + 1,
                        assignees: [group.lead, ...group.coLeads],
                    };

                    if (!roster[dateKey]) roster[dateKey] = [];
                    roster[dateKey].push(shift);
                }
            }

            dayUnfilled.sort((a, b) => a.order - b.order);
            for (const item of dayUnfilled) unfilled.push(item.entry);
        }
    }

    if (totalDemand > totalCapacity) {
        warnings.push(
            `This configuration asks for ${totalDemand} duty slots but the team can hold at most ${totalCapacity} across the run, so some slots cannot be filled.`,
        );
    }

    // --- load -----------------------------------------------------------------
    const totalDuties = [...duties.values()].reduce((sum, n) => sum + n, 0);
    const load = {};
    for (const person of staff) {
        const count = duties.get(person.name);
        load[person.name] = {
            duties: count,
            fte: person.fte,
            weighted: round2(count / person.fte),
            // Rounded to two places to match the documented contract. For a
            // very large pool the figure is coarse and the shares will not sum
            // to exactly 1; `duties` is the exact number.
            share: totalDuties === 0 ? 0 : round2(count / totalDuties),
        };
    }

    // --- score ----------------------------------------------------------------
    // MEASURED from the roster just built, not asserted. `hardViolations` is
    // expected to be 0 on every run; if it is not, the construction loop has a
    // bug and this is where it becomes visible.
    const scored = scoreRoster(roster, config);
    const score = {
        hardViolations: scored.hardViolations,
        softPenalty: scored.softPenalty,
        breakdown: scored.breakdown,
    };

    if (score.hardViolations > 0) {
        warnings.push(
            `AURA detected ${score.hardViolations} hard-constraint violation${score.hardViolations === 1 ? '' : 's'} in the roster it just generated. This is an engine defect, not a configuration problem — do not publish this roster.`,
        );
    }

    return { ok: true, effectiveStart, roster, unfilled, load, score, warnings };
};

// --- 8. SCALING MEASUREMENT --------------------------------------------------

/**
 * The two numbers that describe the failures V2 exists to fix, measured from a
 * roster rather than argued from the source.
 *
 * Accepts either engine's `roster` map — `{ dateKey: [shift, …] }` — because the
 * comparison table is only meaningful if both engines are measured by one ruler.
 * Reads `assignees` when present and falls back to `lead`/`coLead`, which is all
 * a V1 shift has.
 *
 * Returns `{ maxDutiesPerPersonPerDay, busiestDay, neverRostered, rostered }`.
 */
export const measureRosterLoad = (roster, staffNames) => {
    const everRostered = new Set();
    let maxDutiesPerPersonPerDay = 0;
    let busiestDay = null;

    for (const dateKey of Object.keys(roster).sort()) {
        const perPerson = new Map();

        for (const shift of roster[dateKey]) {
            const people = Array.isArray(shift.assignees)
                ? shift.assignees
                : [shift.lead, shift.coLead];

            for (const name of people) {
                if (typeof name !== 'string' || name === '') continue;
                everRostered.add(name);
                perPerson.set(name, (perPerson.get(name) || 0) + 1);
            }
        }

        for (const [name, count] of perPerson) {
            if (count > maxDutiesPerPersonPerDay) {
                maxDutiesPerPersonPerDay = count;
                busiestDay = `${name} on ${dateKey}`;
            }
        }
    }

    const names = Array.isArray(staffNames) ? staffNames : [];
    return {
        maxDutiesPerPersonPerDay,
        busiestDay,
        neverRostered: names.filter((name) => !everRostered.has(name)),
        rostered: names.filter((name) => everRostered.has(name)).length,
    };
};
