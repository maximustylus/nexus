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
//   7. A TASK'S CALENDAR IS EITHER WEEKLY OR MONTHLY, NEVER BOTH. `days` repeats
//      a task on given weekdays every week; `recurrence: { ordinal, weekday }`
//      repeats it on the nth (or last) given weekday of every calendar month.
//      They are mutually exclusive per task and validation refuses a task
//      carrying both, because there is no reading of "every Wednesday AND the 3rd
//      Wednesday" that is not one of the two with extra words. Section 1b owns the
//      month arithmetic, and the occurrence dates are derived ONCE — from
//      `recurrenceDatesBetween` — so the day loop and a future preview UI cannot
//      disagree about when a monthly task runs.
//   8. CONTINUITY IS THE ONLY PREFERENCE IN THIS ENGINE, AND IT STILL LOSES TO
//      EVERY HARD CONSTRAINT. `continuity: true` asks for the same LEAD on every
//      occurrence of one task — the clinical reason being that a cohort seen
//      monthly should meet the same clinician. It overrides FTE-weighted fairness
//      for THAT TASK'S LEAD SLOT ONLY. It never overrides a gate: an incumbent on
//      leave, at capacity or out of band loses the slot to the next candidate by
//      the same rule, and continuity is never a reason to leave a slot empty that
//      somebody eligible could have filled. Every resulting change of lead is
//      COUNTED (`score.breakdown.continuityBreaks`) and NAMED (a `warnings` entry
//      giving both dates and, where the engine knows it, the reason), because
//      knowing WHEN continuity broke is the whole point of having asked for it.
//   9. HOURS ARE A SECOND CURRENCY, AND THE WHOLE MODEL IS OPT-IN. Until v1.8.1
//      this engine counted DUTIES only, which cannot express a 42-hour week. A
//      task may now carry `hours` (default `DEFAULT_TASK_HOURS` = 4, because
//      these teams' tasks are sessions — clinic, rounds, group, review — not
//      whole days), and a person a `weeklyHours` (default 42) and a
//      `maxHoursPerDay` (default `weeklyHours / 5`). Same-day durations SUM
//      against the daily cap and one Monday–Sunday week's durations sum against
//      the weekly cap; both are scaled by FTE and both are HARD, so a slot that
//      would breach either is `unfilled` with a reason naming the hours, the
//      date and what the person already holds. The FOUR-WEEK total is WARNED on
//      and never enforced — see section 0c for why that window is genuinely
//      rolling and why a week-bucketed version of it would have been a decoy.
//      OPT-IN, and this is the load-bearing part: the model is inert unless the
//      configuration MENTIONS one of those four fields (`hoursModelRequested`).
//      A department that has never heard of hours gets the roster, the `load`
//      shape and the `score.breakdown` it got before hours existed, byte for
//      byte — including a department whose `maxPerDay` is 3, which under an
//      always-on model would suddenly break a 12h day against an 8.4h cap and
//      change a roster nobody asked to change. Section 0c owns the predicate,
//      the defaults and the caps; the honest cost of the choice is at the foot
//      of this header.
//  10. A SHIFT MAY BE A TEAM, AND THE LEAD IS THEN THE HIGHEST GRADE ON IT.
//      Until v1.8.2 a shift held one lead plus at most one co-lead per pairing
//      group, so the embryologists' weekend rule — a principal, a senior AND a
//      junior, together, on one shift — was inexpressible. A task may now carry
//      `slots: [{ band, requiresSkill, role }, …]`, ONE ENTRY PER PERSON THE
//      SHIFT NEEDS, and each entry is filled INDEPENDENTLY through the same
//      candidate pipeline with its OWN band and skill gate. `slots` REPLACES
//      `leads`/`coLeads` rather than refining them, and validation refuses a task
//      carrying both, for the same reason `days` + `recurrence` is refused: there
//      is no reading of "one lead plus a co-lead AND a list of three slots" that
//      is not one of the two with extra words.
//      WHO IS THE LEAD, decided with the roster owner: the assignee holding the
//      HIGHEST GRADE present. Not the first slot, not the first filled — the
//      highest grade, because that is who the department holds accountable for
//      the shift, and it stays right when a slot goes unfilled and the trio
//      becomes a pair. An UNGRADED assignee never outranks a graded one (the
//      engine does not invent data — section 0b's rule, applied to ranking
//      instead of eligibility), ties break by the existing candidate tie-break,
//      and `coLead` is the SECOND assignee, so the `Lead: X, Co: Y` display
//      string, the calendar, the swap flow and both exporters keep working
//      unchanged. `assignees` carries everybody, lead first. The cost of that
//      compatibility — a third assignee is invisible in `staff`, in the calendar
//      and in both exports — is at the foot of this file, in the roster master's
//      words, because it is the biggest judgment call in the feature.
//      PER-TASK AND THEREFORE INERT: a task with no `slots` key reads and writes
//      exactly what it did before this section existed. There is no global
//      switch to get wrong.
//
// WHAT THIS ENGINE DELIBERATELY DOES NOT DO (left as clean seams, not oversights):
// no local-search / hill-climbing improvement pass over the constructed roster;
// no continuous-duty / rest-between-duties limit, and no ENFORCED rolling window
// of any length (the four-week total is measured and warned about, never gated);
// no HOURS-WEIGHTED FAIRNESS — the candidate comparator still ranks by DUTY
// COUNT over FTE, so with mixed durations the engine shares out sessions rather
// than hours and `score.breakdown.hoursImbalance` can be large while
// `loadImbalance` is 0 (the number is reported precisely so that this is
// visible rather than assumed away); no
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
// Added by the psychology pack, and equally deliberate: ONE recurrence pattern per
// task — no "every second Wednesday", no "the 1st AND 3rd Wednesday" (configure
// two tasks, or wait for a `recurrence` that takes a list); no cross-run
// continuity — `continuity` counts leads inside THIS generation run only, so a
// department generating a month at a time restarts every incumbency from scratch,
// which is the same border-data limit `consecutiveRunBefore` documents; and
// continuity is expressed as "whoever has led this task most so far", which is a
// proxy for incumbency and not a memory of it, so a genuine tie between two people
// with equal counts is settled by the ordinary fairness tie-breakers rather than by
// who held it most recently.
//
// A task whose `requiresSkill` and `leadBands` pools do not INTERSECT (enough
// principals, enough skill holders, nobody who is both) is a VALIDATION REFUSAL,
// the composed twin of the unknown-skill and empty-band rules. It was a warning
// for one commit, pinned so by a compatibility gate; the orchestrator moved the
// pin deliberately and landed the refusal — see `rosterEngineV2.grades.test.js`
// ("refuses a task whose band and skill pools do not intersect").
//
// Added by the hours model, and the same kind of deliberate: a per-person
// `weeklyHours` does NOT imply a per-person `maxHoursPerDay` (a 21-hour week
// still inherits the department's 8.4-hour day, because the two fields answer
// different questions and guessing one from the other would silently halve
// somebody's availability); `weeklyHours` and `fte` MULTIPLY rather than override
// (`weeklyHours: 21` on a 0.5-FTE person is 10.5 hours, which is almost certainly
// not what was meant — the ledger at the foot of this file says so out loud); the
// weekly window is the GENERATED week, so hours worked in a previous run are
// invisible to it exactly as `consecutiveRunBefore`'s are; and the four-week
// warning needs 28 days of run to have a window at all, so a three-week
// generation can never fire it.
//
// Added by multi-slot shifts, and deliberate in the same way: NO PREFERENCE ORDER
// between slot entries — every entry is filled by the same scarcity ordering as
// every other slot in the day, so listing the principal first does not make it
// more likely to be staffed than the junior (what decides that is scarcity, and
// the trio is exactly the case where the scarce entry SHOULD win); NO
// CROSS-ENTRY EXCLUSION beyond "not the same person twice" — two entries that
// both accept seniors may both be filled by seniors, and a `slots` list is a set
// of requirements rather than a description of a hierarchy; and NO `leadBands`
// AND NO `continuity` alongside `slots` — both of those gate or follow a
// CONFIGURED lead slot, and with `slots` the lead is DERIVED from the grades
// present, so both are validation refusals rather than fields that quietly do
// nothing. A slot's band is a SINGLE band, not a list: `{ band: 'senior' }` is
// "a senior fills this", and "a senior or a principal" is expressed by leaving
// the band off the entry and letting the grade ranking decide the lead, or by
// two tasks. Widening that to a list is additive and was not asked for.
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
    /** See `DEFAULT_TASK_HOURS` — one definition, two names. */
    taskHours: 4,
    /** See `DEFAULT_WEEKLY_HOURS`. */
    weeklyHours: 42,
});

/**
 * How long is a task nobody gave a duration to? FOUR HOURS.
 *
 * Field research, not a guess: the medical-lab-scientist and psychology teams
 * whose 42-hour weeks this model exists to express configure SESSIONS — a
 * clinic, a ward round, a therapy group, a reporting block — and two of them
 * make a working day. The alternative default (8, "a task is a whole day") would
 * have made every pre-hours configuration illegal against its own 8.4-hour cap
 * the moment somebody switched the model on, which is the opposite of a default.
 *
 * Exported because a UI must be able to SHOW the number it is silently applying,
 * and because a test that hard-codes 4 is pinning a coincidence rather than the
 * contract.
 */
export const DEFAULT_TASK_HOURS = ROSTER_V2_DEFAULTS.taskHours;

/** The contracted week both teams work, in hours. `rules.weeklyHours` overrides. */
export const DEFAULT_WEEKLY_HOURS = ROSTER_V2_DEFAULTS.weeklyHours;

/** The divisor in `defaultMaxHoursPerDay`, named so that it is arguable. */
const DAYS_WORKED_PER_WEEK = 5;

/**
 * A weekly figure -> the daily cap it implies: FIVE working days.
 *
 * 42 / 5 = 8.4, which is the number the lab's own roster sheet carries. It is a
 * DERIVATION and not a truth — a team working a four-day compressed week wants
 * 10.5, and says so with an explicit `rules.maxHoursPerDay`. Exported so the
 * wizard can display the derived cap next to the field it derives from instead of
 * re-implementing the division and drifting from it.
 */
export const defaultMaxHoursPerDay = (weeklyHours) => weeklyHours / DAYS_WORKED_PER_WEEK;

/** Nobody may be rostered more than a calendar day, or a task be longer than one. */
const MAX_HOURS_PER_DAY_CEILING = 24;

/** A week holds 168 hours; a `weeklyHours` above that is a typo, not a policy. */
const MAX_HOURS_PER_WEEK_CEILING = 168;

/** Weeks in the rolling total the engine reports and warns about. */
const ROLLING_WINDOW_WEEKS = 4;

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
 * Hours are compared with the same kind of tolerance, for the same reason: an
 * effective cap is a PRODUCT of two floats (`8.4 * 0.6` is `5.04` only to a
 * human; the double is `5.040000000000001`), so an exact `>` would refuse a slot
 * that exactly fills somebody's day and report it as an hours breach. A roster
 * master reading "would take Ada to 5.04h, over her 5.04h limit" would be
 * entitled to conclude the engine was broken.
 */
const HOURS_EPSILON = 1e-9;

/**
 * Two decimal places, the rounding this file's numeric OUTPUT uses everywhere.
 *
 * Defined here rather than beside the scorer (where it lived until the hours
 * model needed it) because section 4's rejection prose has to render an hours
 * figure and there is one definition of "how this engine writes a number down".
 */
const round2 = (value) => Math.round(value * 100) / 100;

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

// --- 0c. THE HOURS MODEL ------------------------------------------------------
//
// Until this section existed the engine counted DUTIES. A duty count cannot
// express the two facts the field research actually turned up — that medical lab
// scientists and psychologists both work a 42-HOUR WEEK, and that lab scientists
// additionally work two or more SATURDAYS a month — because two duties may be two
// hours or two days and nothing in the configuration could say which.
//
// FOUR FIELDS, in the two places they belong:
//
//   task.hours            how long one occurrence of this task takes. Absent
//                         means `DEFAULT_TASK_HOURS` (4 — a session, not a day).
//   staff.weeklyHours     that person's contracted week. Absent means
//                         `rules.weeklyHours`, which itself defaults to 42.
//   staff.maxHoursPerDay  that person's daily ceiling. Absent means
//                         `rules.maxHoursPerDay`, which defaults to
//                         `defaultMaxHoursPerDay(weeklyHours)` = 8.4.
//   rules.*               the departmental defaults for the two above.
//
// BOTH CAPS ARE SCALED BY FTE AND BOTH ARE HARD. A 0.6-FTE clinician on a 42-hour
// contract may hold 25.2 hours a week and 5.04 hours a day. A slot that would
// breach either goes to `unfilled` naming the hours, the date and what the person
// already holds that day — never a silent double-book, which is this engine's one
// non-negotiable rule.
//
// THE WEEK IS MONDAY–SUNDAY, and it is the GENERATED week: `generateRosterV2`
// always starts on a Monday (`snapToMonday`) and walks whole 7-day blocks, so the
// week the cap applies over is exactly the week `shift.week` names. `weekStartOf`
// below is the calendar half of that and is deliberately NOT `snapToMonday` — see
// its comment, because the two disagree about Sunday ON PURPOSE and picking the
// wrong one moves a Saturday-and-Sunday lab weekend into two different weeks.
//
// WHY THE FOUR-WEEK TOTAL IS A ROLLING 28 DAYS AND NOT FOUR BUCKETS. The field
// research carries the Singapore Medical Council's pattern of a ceiling per
// four-week cycle, and enforcing a rolling window is deferred — so this engine
// MEASURES the window and warns. The measurement is over every 28-day window that
// fits inside the run, one window per start date, NOT over groups of four whole
// weeks. That is not fussiness: with the weekly cap already hard at
// `weeklyHours * fte`, four whole weeks can never sum above four times it, so a
// bucketed "four-week check" is arithmetically incapable of firing. It would be a
// test that cannot fail — a decoy, which is the specific thing this repository has
// found in its own suites before. A window that straddles bucket boundaries CAN
// exceed the total (measured: 176h against a 168h ceiling, from a fortnight
// front-loaded on one side of the seam and back-loaded on the other), which is
// precisely the fatigue pattern a four-week rule exists to catch.
//
// OPT-IN. Everything in this section is inert unless `hoursModelRequested` says
// the configuration mentioned one of the four fields. Design rule 9 in the file
// header argues that choice and states its cost; the ledger at the foot of the
// file states it again in the roster master's words.

/** A duration this engine will accept: a real number of hours inside the day. */
const isUsableHours = (value, ceiling) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= ceiling;

/** `undefined`/`null` mean "not stated"; every other value is checked, never coerced. */
const isStated = (value) => value !== undefined && value !== null;

/**
 * Did this configuration ASK for the hours model? The one predicate, read by the
 * validator, the generator, the scorer and the audit, so the four cannot disagree
 * about whether hours are in force.
 *
 * Deliberately a mention test and not a value test: `rules: { weeklyHours: 42 }`
 * turns the model on even though 42 is also the default, because typing the
 * department's contracted week is exactly how a roster master says "hours
 * matter here". There is no way to ask for hours and get them ignored.
 */
const hoursModelRequested = (config) => {
    if (!isPlainObject(config)) return false;

    const { rules, staff, tasks } = config;
    if (isPlainObject(rules) && (isStated(rules.weeklyHours) || isStated(rules.maxHoursPerDay))) {
        return true;
    }
    if (Array.isArray(staff)) {
        for (const person of staff) {
            if (!isPlainObject(person)) continue;
            if (isStated(person.weeklyHours) || isStated(person.maxHoursPerDay)) return true;
        }
    }
    if (Array.isArray(tasks)) {
        for (const task of tasks) {
            if (!isPlainObject(task)) continue;
            if (isStated(task.hours)) return true;
        }
    }
    return false;
};

/**
 * `rules` -> the departmental hours defaults in force, fully resolved.
 *
 * `maxHoursPerDay` is derived from whatever `weeklyHours` ended up being, so a
 * department that sets only `weeklyHours: 35` gets a 7-hour day rather than the
 * shipped 8.4 — the derivation follows the field that was actually typed.
 */
const resolveHoursRules = (rules) => {
    const raw = isPlainObject(rules) ? rules : {};
    const weeklyHours = isUsableHours(raw.weeklyHours, MAX_HOURS_PER_WEEK_CEILING)
        ? raw.weeklyHours
        : ROSTER_V2_DEFAULTS.weeklyHours;
    const maxHoursPerDay = isUsableHours(raw.maxHoursPerDay, MAX_HOURS_PER_DAY_CEILING)
        ? raw.maxHoursPerDay
        : defaultMaxHoursPerDay(weeklyHours);
    return { weeklyHours, maxHoursPerDay };
};

/**
 * An hours figure as a roster master would write it: `8.4h`, `12h`, `4.5h`.
 *
 * Rounded through `round2` — the same rounding `load` and `score` publish — so
 * the number in an `unfilled` reason and the number in the load table are the
 * same number, and a floating-point tail never reaches a sentence.
 */
const formatHours = (value) => `${round2(value)}h`;

// --- 0d. MULTI-SLOT SHIFTS ----------------------------------------------------
//
// `leads` + `coLeads` describes a shift as ONE person in charge plus a helper.
// The embryologists' weekend service is not that shape: a witnessing session
// needs a PRINCIPAL, a SENIOR and a JUNIOR, together, on the same day, and each
// of the three is a distinct staffing requirement with its own eligibility rule.
// Counting to three with `leads: 1, coLeads: 2` cannot say it, because the band
// gate applies to the lead only and both co-leads would be ungated.
//
// SO A TASK MAY LIST ITS SLOTS:
//
//   slots: [
//     { band: 'principal', role: 'Principal embryologist' },
//     { band: 'senior',    role: 'Senior embryologist', requiresSkill: 'Witnessing' },
//     { band: 'junior',    role: 'Junior embryologist' },
//   ]
//
// ONE ENTRY PER PERSON THE SHIFT NEEDS. Every field is optional: an entry with no
// `band` may be filled by any grade, an entry with no `requiresSkill` adds no
// skill of its own (the TASK's `requiresSkill`, if any, still applies to every
// entry — a task-wide requirement is a property of the work, exactly as it is for
// a co-lead today), and `role` is a LABEL, carried only so that an `unfilled`
// entry can say WHICH of three otherwise identical slots failed.
//
// WHAT THIS SECTION OWNS: the shape, the labels, and the two gate predicates that
// the construction gate (section 4), the reason strings (section 4) and the
// read-back audit (section 6) all read, so those three can never disagree about
// whether somebody may fill an entry. The lead-ranking rule lives in section 5,
// beside the tie-break it defers to; the assignment loop's use of all of it is in
// section 7; the honest limits are at the foot of the file.
//
// LABELS ARE MADE UNIQUE, because "which slot?" is the whole point of the reason
// string. Two entries that would both read `junior slot` become `junior slot 1`
// and `junior slot 2`, in configuration order. A `role` is used verbatim (trimmed
// — it goes into a sentence rather than being matched against anything), and an
// entry with neither `role` nor `band` reads `slot 1`.

/**
 * The rank an assignee with no recorded grade sorts at. BELOW AH7, so a graded
 * assignee always outranks an ungraded one and the trio's lead is never somebody
 * whose grade the department has not recorded. `-Infinity` would have been the
 * obvious sentinel and is a trap: two ungraded assignees would compare
 * `-Infinity - -Infinity` = `NaN`, and a comparator returning `NaN` sorts
 * arbitrarily — the one thing this engine may not do.
 */
const GRADE_UNKNOWN_RANK = 0;

/**
 * The `role` a slot carries INSIDE the assignment loop while it is being filled.
 *
 * Not `'lead'` and not `'coLead'`, because it is neither until the day's entries
 * are resolved and section 5 ranks them — the two existing roles are branched on
 * in four places, and quietly reusing one of them is how a field comes to mean two
 * things (post-mortem A-RC1). What reaches `unfilled` is the entry's LABEL, not
 * this token; nothing outside the loop reads it.
 */
const MULTI_SLOT_ROLE = 'slot';

/**
 * A canonical grade as a sortable number. Called ONCE per person, in
 * `normaliseStaff`, so that ranking a trio's assignees never re-parses a grade
 * string and the audit and the generator cannot disagree about who outranks whom.
 */
const gradeRankOf = (grade) => {
    const number = parseGradeNumber(grade);
    return number === null ? GRADE_UNKNOWN_RANK : number;
};

/**
 * Does this person meet the SKILL this one entry adds? An entry with no
 * `requiresSkill` adds nothing, which is not the same as adding "no skill".
 *
 * THE task's own `requiresSkill` is not checked here — it is checked once, for
 * every slot of every kind, where it always was.
 */
const slotSkillMet = (person, entry) =>
    entry.requiresSkill === null || person.skills.has(entry.requiresSkill);

/**
 * Does this person's BAND satisfy this entry? An entry with no `band` accepts any
 * grade INCLUDING an unrecorded one; an entry with a band never accepts an
 * unrecorded grade, exactly as `leadBands` never does (section 0b: absent is not
 * zero, and membership that cannot be verified is not membership).
 */
const slotBandMet = (person, entry) =>
    entry.bandSet === null || (person.band !== null && entry.bandSet.has(person.band));

/**
 * Could this person fill this entry AT ALL — both of the entry's own gates and
 * the task's skill? The composition, in one place, for the two callers that need
 * the boolean rather than the reason: the structural warnings and the audit's
 * read-back matching.
 */
const canFillSlot = (person, task, entry) =>
    (!task.requiresSkill || person.skills.has(task.requiresSkill)) &&
    slotSkillMet(person, entry) &&
    slotBandMet(person, entry);

/**
 * Every skill an entry's holder must have, task-wide first, deduplicated — the
 * list the `unfilled` reason reads from. Repeating the task's own skill on an
 * entry is legal and says nothing new, so it is not said twice in the sentence.
 */
const slotSkillsRequired = (task, entry) => {
    const skills = [];
    if (task.requiresSkill) skills.push(task.requiresSkill);
    if (entry !== null && entry.requiresSkill !== null && entry.requiresSkill !== task.requiresSkill) {
        skills.push(entry.requiresSkill);
    }
    return skills;
};

/** `['CPET']` -> `'skill CPET'`; `['CPET','ICSI']` -> `'skills CPET and ICSI'`. */
const skillsPhrase = (skills) =>
    skills.length === 1 ? `skill ${skills[0]}` : `skills ${skills.join(' and ')}`;

/**
 * The label an entry is known by in prose, BEFORE deduplication: its `role` if it
 * has one, else its band, else the bare word. One definition, read by
 * `normaliseSlots` and by the validator's refusal strings, so the name a roster
 * master is refused over is the name they would have seen in `unfilled`.
 */
const slotBaseLabel = (entry) => {
    if (isNonEmptyString(entry?.role)) return entry.role.trim();
    if (typeof entry?.band === 'string' && BAND_ORDER.includes(entry.band)) return `${entry.band} slot`;
    return 'slot';
};

/**
 * `slots` -> the engine's internal entries, or `null` for "this task is staffed
 * the old way". Validation has already refused every shape this cannot read.
 *
 * `bandSet` exists beside `band` because the band LABEL helpers of section 0b
 * take a set, and building one per candidate inside the assignment loop would be
 * a set allocation per person per slot per day.
 */
const normaliseSlots = (value) => {
    if (!Array.isArray(value) || value.length === 0) return null;

    const bases = value.map(slotBaseLabel);
    const total = new Map();
    for (const base of bases) total.set(base, (total.get(base) || 0) + 1);
    const seen = new Map();

    return value.map((raw, index) => {
        const band = typeof raw?.band === 'string' && BAND_ORDER.includes(raw.band) ? raw.band : null;
        const base = bases[index];
        // Numbered ONLY when it would otherwise be ambiguous: a lone junior slot
        // reads `junior slot`, and three of them read `junior slot 1..3`.
        let label = base;
        if (total.get(base) > 1) {
            const nth = (seen.get(base) || 0) + 1;
            seen.set(base, nth);
            label = `${base} ${nth}`;
        }

        return {
            index,
            band,
            bandSet: band === null ? null : new Set([band]),
            requiresSkill: isNonEmptyString(raw?.requiresSkill) ? raw.requiresSkill : null,
            role: isNonEmptyString(raw?.role) ? raw.role.trim() : null,
            label,
        };
    });
};

/**
 * How many people does one occurrence of this task need? The slot count for a
 * multi-slot task, and the lead+co-lead count for every other. Read by the
 * demand counters and by the skill-shortfall warning, so a `slots` task is
 * counted in the same currency as the tasks beside it.
 */
const perDayDemand = (task) =>
    (task.slots === null ? task.leads + task.coLeads : task.slots.length);

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

/**
 * The Monday that OPENED `date`'s Monday–Sunday week.
 *
 * READ THE NEXT SENTENCE BEFORE USING EITHER OF THESE. This is NOT
 * `snapToMonday`, and the difference is Sunday and only Sunday: `snapToMonday`
 * moves a Sunday FORWARD (it answers a policy question — "the roster master typed
 * a Sunday; which Monday did they mean?"), while this moves a Sunday BACK (it
 * answers a calendar question — "which week does this duty fall in?"). Using
 * `snapToMonday` here would put a lab scientist's Saturday and the Sunday beside
 * it in two different weeks, so a Sat+Sun weekend would be charged half to a week
 * that had already been capped and half to the next one, and the 42-hour cap would
 * quietly stop meaning anything on the one shape of week it exists to govern.
 *
 * It agrees with `shift.week`, which is what makes `load.hoursPerWeek[i]` and
 * `week: i + 1` the same week: the generator walks whole 7-day blocks from a
 * Monday, so offsets 0–6 are Mon–Sun and this function maps every one of them to
 * the block's own Monday.
 */
export const weekStartOf = (date) => {
    const day = date.getDay();
    return addDays(date, day === 0 ? -(DAYS_PER_WEEK - 1) : 1 - day);
};

/** The same answer as a key: `'2026-09-13'` (a Sunday) -> `'2026-09-07'`. */
const weekStartKeyOf = (dateKey) => toLocalDateKey(weekStartOf(parseLocalDateKey(dateKey)));

// --- 1b. MONTHLY RECURRENCE ---------------------------------------------------
//
// A task repeats either WEEKLY (`days: [1,3]`, every Monday and Wednesday) or
// MONTHLY (`recurrence: { ordinal: 3, weekday: 3 }`, the 3rd Wednesday of every
// calendar month). The psychology department's specialised clinic runs monthly,
// which no `days` list can express: `days: [3]` is EVERY Wednesday, four or five
// times the intended workload, and the roster would look plausible while asking
// four times the clinic time anybody agreed to.
//
// WHY `'last'` IS AN ORDINAL AND NOT `5`. Most months hold four of any given
// weekday and some hold five, so a task configured as "the 5th Wednesday" would
// silently vanish in most months — the class of quiet failure this engine exists
// to refuse. `'last'` is the question departments actually ask, and it differs
// from `4` exactly in the five-weekday months, which is where the tests bite.
//
// HORIZON, NOT CALENDAR. The occurrences of a monthly task are the matching dates
// that fall INSIDE the generated run — `effectiveStart` through the last day of
// the last week. A month whose nth weekday lies outside the run contributes
// nothing, and a run too short to contain any occurrence generates nothing at all
// for that task. Neither is an `unfilled` entry: no slot was ever demanded, so
// there is nothing that could not be staffed. `generateRosterV2` does WARN about
// the second case, because a monthly task that never appears in the calendar is
// indistinguishable from a bug when you are looking at the calendar.

const RECURRENCE_LAST = 'last';

/** The ordinals a `recurrence` may name. Anything else is refused, loudly. */
const RECURRENCE_ORDINALS = Object.freeze([1, 2, 3, 4, RECURRENCE_LAST]);

/** `3` -> `'3rd'`, `'last'` -> `'last'`. For reasons and warnings only. */
const ORDINAL_PROSE = Object.freeze({
    1: '1st', 2: '2nd', 3: '3rd', 4: '4th', [RECURRENCE_LAST]: 'last',
});

/** How many days does the month containing local `(year, month)` hold? */
const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

/**
 * `{ ordinal, weekday }` if this is a usable recurrence, `null` otherwise.
 *
 * Total, like `bandOfGrade`: the loud half of the pair is
 * `validateRosterV2Config`, which says WHY. Extra keys on the object are ignored
 * rather than refused, matching how the rest of the input contract treats them.
 */
const normaliseRecurrence = (value) => {
    if (!isPlainObject(value)) return null;
    const { ordinal, weekday } = value;
    if (!RECURRENCE_ORDINALS.includes(ordinal)) return null;
    if (typeof weekday !== 'number' || !Number.isInteger(weekday)) return null;
    if (weekday < 0 || weekday > 6) return null;
    return { ordinal, weekday };
};

/**
 * The nth (or last) `weekday` of one calendar month, as a LOCAL date — or `null`
 * when the month does not hold that many of that weekday.
 *
 * Built from `(year, month, day)` parts like every other date in this file, so a
 * month boundary or a DST transition inside the month cannot slide the answer.
 */
const nthWeekdayOfMonth = (year, month, ordinal, weekday) => {
    const total = daysInMonth(year, month);
    const firstWeekday = new Date(year, month, 1).getDay();
    // The first `weekday` of the month, 1-based: how far forward from the 1st.
    const first = 1 + ((weekday - firstWeekday + DAYS_PER_WEEK) % DAYS_PER_WEEK);

    if (ordinal === RECURRENCE_LAST) {
        let day = first;
        while (day + DAYS_PER_WEEK <= total) day += DAYS_PER_WEEK;
        return new Date(year, month, day);
    }

    const day = first + (ordinal - 1) * DAYS_PER_WEEK;
    return day <= total ? new Date(year, month, day) : null;
};

/**
 * Every date this recurrence lands on between `startKey` and `endKey` inclusive,
 * as sorted `'YYYY-MM-DD'` keys.
 *
 * THE ONE DEFINITION of "when does a monthly task run". `generateRosterV2` builds
 * its day filter from this, and a preview UI should call it rather than reimplement
 * the month arithmetic — post-mortem A-RC1's rule (one definition per displayed
 * fact) applied to a set of dates instead of a string. Pure, and total: an
 * unusable recurrence or a backwards range returns `[]` rather than throwing.
 */
export const recurrenceDatesBetween = (recurrence, startKey, endKey) => {
    const spec = normaliseRecurrence(recurrence);
    if (spec === null || !isDateKey(startKey) || !isDateKey(endKey)) return [];

    const start = parseLocalDateKey(startKey);
    const end = parseLocalDateKey(endKey);
    if (end < start) return [];

    const keys = [];
    let year = start.getFullYear();
    let month = start.getMonth();

    // One iteration per calendar month touched. Bounded by the longest run this
    // engine can generate (52 weeks is at most 14 months), with headroom.
    for (let guard = 0; guard <= MAX_ROSTER_WEEKS; guard += 1) {
        if (new Date(year, month, 1) > end) break;

        const date = nthWeekdayOfMonth(year, month, spec.ordinal, spec.weekday);
        if (date !== null && date >= start && date <= end) keys.push(toLocalDateKey(date));

        month += 1;
        if (month > 11) {
            month = 0;
            year += 1;
        }
    }

    return keys;
};

/** `{ ordinal: 3, weekday: 3 }` -> `'3rd Wednesday of each month'`. */
const recurrenceLabel = (recurrence) =>
    `${ORDINAL_PROSE[recurrence.ordinal]} ${WEEKDAY_NAMES[recurrence.weekday]} of each month`;

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

    /**
     * Whether the hours model is in force at all. Every hours FIELD is validated
     * whenever it is present — a typo is never silently ignored — but the one
     * hours REFUSAL is gated on this, because it reads defaults that a
     * configuration which never mentioned hours never asked to be judged by.
     */
    const hoursActive = hoursModelRequested(config);

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

        // Hours are OPTIONAL, and stating either of them switches the whole hours
        // model on for the configuration (`hoursModelRequested`). Both are checked
        // whenever they are present, so a typo cannot be silently ignored on its
        // way to becoming somebody's ceiling. Fractions are legal — 8.4 is the
        // shipped daily cap and 37.5 is a common contract.
        if (isStated(person.weeklyHours)) {
            if (typeof person.weeklyHours !== 'number' || !Number.isFinite(person.weeklyHours)) {
                return invalid(`${name}'s weeklyHours must be a number of hours, e.g. ${DEFAULT_WEEKLY_HOURS} — leave it out to use the department's figure.`);
            }
            if (person.weeklyHours <= 0 || person.weeklyHours > MAX_HOURS_PER_WEEK_CEILING) {
                return invalid(`${name}'s weeklyHours is ${person.weeklyHours} — it must be greater than 0 and at most ${MAX_HOURS_PER_WEEK_CEILING} (the number of hours in a week).`);
            }
        }
        if (isStated(person.maxHoursPerDay)) {
            if (typeof person.maxHoursPerDay !== 'number' || !Number.isFinite(person.maxHoursPerDay)) {
                return invalid(`${name}'s maxHoursPerDay must be a number of hours, e.g. ${defaultMaxHoursPerDay(DEFAULT_WEEKLY_HOURS)} — leave it out to use the department's figure.`);
            }
            if (person.maxHoursPerDay <= 0 || person.maxHoursPerDay > MAX_HOURS_PER_DAY_CEILING) {
                return invalid(`${name}'s maxHoursPerDay is ${person.maxHoursPerDay} — it must be greater than 0 and at most ${MAX_HOURS_PER_DAY_CEILING} (the number of hours in a day).`);
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

    /**
     * Which band does this RAW staff entry sit in? `null` for a grade that is
     * absent, blank or unreadable — the validator's own copy of the resolution
     * `normaliseStaff` performs once, needed here because the band-composed
     * refusals below run BEFORE normalisation exists. One definition inside this
     * function, read by every refusal that has to ask the question.
     */
    const rawBandOf = (person) => {
        const grade = person?.grade;
        const gradeIsBlank = typeof grade === 'string' && grade.trim() === '';
        if (grade === undefined || grade === null || gradeIsBlank) return null;
        const number = parseGradeNumber(grade);
        if (number === null) return null;
        return bandOfGradeNumber(number, bands);
    };

    // --- hours rules ----------------------------------------------------------
    // Validated BEFORE the tasks for the same reason the bands are: a task's
    // `hours` is judged against the daily caps these two fields set, and a cap
    // that is itself nonsense cannot judge whether a 6-hour clinic fits in
    // anybody's day. A non-object `rules` is left to the rules block further
    // down, which owns that reason string.
    const rawRules = isPlainObject(rules) ? rules : {};
    if (isStated(rawRules.weeklyHours)) {
        if (typeof rawRules.weeklyHours !== 'number' || !Number.isFinite(rawRules.weeklyHours)) {
            return invalid(`rules.weeklyHours must be a number of hours, e.g. ${DEFAULT_WEEKLY_HOURS} — the contracted working week.`);
        }
        if (rawRules.weeklyHours <= 0 || rawRules.weeklyHours > MAX_HOURS_PER_WEEK_CEILING) {
            return invalid(`rules.weeklyHours is ${rawRules.weeklyHours} — it must be greater than 0 and at most ${MAX_HOURS_PER_WEEK_CEILING} (the number of hours in a week).`);
        }
    }
    if (isStated(rawRules.maxHoursPerDay)) {
        if (typeof rawRules.maxHoursPerDay !== 'number' || !Number.isFinite(rawRules.maxHoursPerDay)) {
            return invalid(`rules.maxHoursPerDay must be a number of hours, e.g. ${defaultMaxHoursPerDay(DEFAULT_WEEKLY_HOURS)} — leave it out and it is derived from rules.weeklyHours over a ${DAYS_WORKED_PER_WEEK}-day week.`);
        }
        if (rawRules.maxHoursPerDay <= 0 || rawRules.maxHoursPerDay > MAX_HOURS_PER_DAY_CEILING) {
            return invalid(`rules.maxHoursPerDay is ${rawRules.maxHoursPerDay} — it must be greater than 0 and at most ${MAX_HOURS_PER_DAY_CEILING} (the number of hours in a day).`);
        }
    }

    /**
     * Everybody's EFFECTIVE daily hours ceiling — the departmental or personal
     * cap, scaled by FTE — so the task loop below can ask whether one occurrence
     * of a task fits in anybody's day at all.
     */
    const hoursRules = resolveHoursRules(rawRules);
    const dailyHoursCaps = staff.map((person) => {
        const fte = typeof person.fte === 'number' ? person.fte : ROSTER_V2_DEFAULTS.fte;
        const cap = isUsableHours(person.maxHoursPerDay, MAX_HOURS_PER_DAY_CEILING)
            ? person.maxHoursPerDay
            : hoursRules.maxHoursPerDay;
        return { name: person.name, fte, cap: cap * fte };
    });

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

        // `recurrence` is the MONTHLY calendar, and it replaces `days` rather
        // than refining it. A task carrying both is refused, not merged: there
        // is no reading of "every Wednesday AND the 3rd Wednesday" that is not
        // simply one of the two, and silently preferring one would make the
        // ignored field a trap. Note that `days: []` counts as set — an empty
        // weekly list next to a monthly pattern is a half-finished edit, and the
        // roster master should be told rather than guessed at.
        if (task.recurrence !== undefined && task.recurrence !== null) {
            if (task.days !== undefined && task.days !== null) {
                return invalid(`Task ${name} sets both days and recurrence — a task repeats either weekly (days) or monthly (recurrence), never both. Remove whichever one is not meant.`);
            }
            if (!isPlainObject(task.recurrence)) {
                return invalid(`Task ${name}'s recurrence must be an object of the form { ordinal: 3, weekday: 3 } — the 3rd Wednesday of each month — or left out so that the task repeats weekly on its days.`);
            }
            if (!RECURRENCE_ORDINALS.includes(task.recurrence.ordinal)) {
                // `5` is refused rather than treated as `'last'`: most months
                // hold only four of a weekday, so a 5th-Wednesday task would
                // silently skip most months.
                return invalid(`Task ${name}'s recurrence ordinal is ${JSON.stringify(task.recurrence.ordinal)} — use 1, 2, 3, 4, or 'last' for the final one of the month (most months have no 5th weekday).`);
            }
            const { weekday } = task.recurrence;
            if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
                return invalid(`Task ${name}'s recurrence weekday is ${JSON.stringify(weekday)} — use whole numbers 0 (Sunday) to 6 (Saturday).`);
            }
        }

        // `continuity` is a preference and the only one in this engine, so it is
        // spelled as a plain flag. A non-boolean is refused rather than coerced:
        // `continuity: 'yes'` is truthy, and a typo must not be able to change
        // who leads a clinic for a year.
        if (task.continuity !== undefined && task.continuity !== null) {
            if (typeof task.continuity !== 'boolean') {
                return invalid(`Task ${name}'s continuity must be true or false — true asks for the same lead on every occurrence of the task.`);
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

        // --- MULTI-SLOT SHIFTS ------------------------------------------------
        //
        // `slots` REPLACES `leads`/`coLeads`, and the three mutual-exclusion
        // refusals come FIRST — before this block inspects a single entry —
        // because "you cannot combine these two fields" is a more useful sentence
        // than a complaint about one of the fields being combined. It sits after
        // the `leads`/`coLeads` type checks for the same reason in reverse:
        // `leads: 'two'` is a typo in `leads`, whatever else the task carries.
        if (isStated(task.slots)) {
            if (!Array.isArray(task.slots)) {
                return invalid(`Task ${name}'s slots must be an array of slot objects — one entry per person the shift needs, e.g. [{ band: 'principal' }, { band: 'senior' }, { band: 'junior' }] — or left out so the task is staffed with leads and coLeads.`);
            }
            if (task.slots.length === 0) {
                return invalid(`Task ${name} has slots: [], so its shift would need nobody at all. Give one entry per person the shift needs, or leave slots out and use leads/coLeads.`);
            }
            for (const field of ['leads', 'coLeads']) {
                if (isStated(task[field])) {
                    return invalid(`Task ${name} sets both slots and ${field} — a shift is staffed either as one lead plus co-leads (leads/coLeads) or as a list of slots, never both. Remove whichever one is not meant.`);
                }
            }
            if (isStated(task.leadBands)) {
                return invalid(`Task ${name} sets both slots and leadBands — with slots the shift's lead is whichever assignee holds the highest grade, so there is no separate lead slot for leadBands to gate. Put the band on the slot entry that must hold it, e.g. { band: 'principal' }.`);
            }
            // `continuity: false` is the documented way to say "no", so it is not
            // a combination at all. `true` is.
            if (task.continuity === true) {
                return invalid(`Task ${name} sets both slots and continuity — continuity keeps the same LEAD across occurrences, and with slots the lead is derived from the grades on the shift rather than configured, so there would be no lead slot to keep. Remove continuity, or staff the task with leads/coLeads.`);
            }

            for (let s = 0; s < task.slots.length; s += 1) {
                const entry = task.slots[s];
                const at = `Task ${name}'s slot ${s + 1}`;

                if (!isPlainObject(entry)) {
                    return invalid(`${at} is not a slot object — expected { band, requiresSkill, role }, e.g. { band: 'senior', role: 'Witness' }.`);
                }
                if (isStated(entry.band) && (typeof entry.band !== 'string' || !BAND_ORDER.includes(entry.band))) {
                    return invalid(`${at} names the band ${JSON.stringify(entry.band)}, which is not a band — use ${BAND_ORDER.join(', ')} (lower case), or leave band out so that any grade may fill the slot.`);
                }
                if (isStated(entry.role) && !isNonEmptyString(entry.role)) {
                    return invalid(`${at} has a role that is not a label — give it a name such as 'Principal embryologist', or leave it out.`);
                }
                if (isStated(entry.requiresSkill)) {
                    if (!isNonEmptyString(entry.requiresSkill)) {
                        return invalid(`${at}'s requiresSkill must be a skill name, or left out for "anybody may fill it".`);
                    }
                    // The slot-level twin of the task-level unknown-skill refusal,
                    // loud for the same reason: a misspelled skill on one entry of
                    // a trio leaves that entry unfilled on every single date.
                    if (!skillsHeld.has(entry.requiresSkill)) {
                        return invalid(`${at} requires skill ${entry.requiresSkill}, which nobody in the staff pool holds. Check the spelling, or add the skill to whoever is competent.`);
                    }
                }

                // THE ELIGIBILITY FLOOR, and the composed twin of the empty-band
                // and skill-x-band refusals one level down: an entry whose own
                // gates nobody in the pool can pass would be unfilled on every
                // date of the run, which is a typo discovered by a clinician on a
                // Saturday rather than by the roster master at configure time.
                const entryBand = isStated(entry.band) ? entry.band : null;
                const entrySkill = isNonEmptyString(entry.requiresSkill) ? entry.requiresSkill : null;
                if (entryBand === null && entrySkill === null) continue;

                const qualified = staff.filter((person) => {
                    if (entryBand !== null && rawBandOf(person) !== entryBand) return false;
                    const skills = Array.isArray(person?.skills) ? person.skills : [];
                    if (entrySkill !== null && !skills.includes(entrySkill)) return false;
                    if (isNonEmptyString(task.requiresSkill) && !skills.includes(task.requiresSkill)) return false;
                    return true;
                });

                if (qualified.length === 0) {
                    const wantedBand = entryBand === null ? null : new Set([entryBand]);
                    const needs = [];
                    if (wantedBand !== null) {
                        needs.push(`a grade in the ${bandSetLabel(wantedBand)} band (${bandSetGradeLabel(wantedBand, bands)})`);
                    }
                    for (const skill of slotSkillsRequired(
                        { requiresSkill: isNonEmptyString(task.requiresSkill) ? task.requiresSkill : null },
                        { requiresSkill: entrySkill },
                    )) {
                        needs.push(`skill ${skill}`);
                    }
                    return invalid(`${at} (${slotBaseLabel(entry)}) needs ${needs.join(' and ')}, and nobody in the staff pool qualifies, so that slot would be unfilled on every date. Check the grades and the skills, widen the slot, or move the band boundaries.`);
                }
            }
        }

        if (task.category !== undefined && task.category !== null && !isNonEmptyString(task.category)) {
            return invalid(`Task ${name}'s category must be a non-empty label.`);
        }

        // `hours` is how long ONE occurrence takes. Absent means
        // `DEFAULT_TASK_HOURS`, and stating it switches the hours model on.
        if (isStated(task.hours)) {
            if (typeof task.hours !== 'number' || !Number.isFinite(task.hours)) {
                return invalid(`Task ${name}'s hours must be a number of hours, e.g. ${DEFAULT_TASK_HOURS} for a half-day session — leave it out and ${DEFAULT_TASK_HOURS} is assumed.`);
            }
            if (task.hours <= 0 || task.hours > MAX_HOURS_PER_DAY_CEILING) {
                return invalid(`Task ${name}'s hours is ${task.hours} — it must be greater than 0 and at most ${MAX_HOURS_PER_DAY_CEILING} (a task cannot be longer than a day).`);
            }
        }

        // THE HOURS TWIN OF THE UNKNOWN-SKILL AND EMPTY-BAND REFUSALS: a task that
        // is longer than anybody's day could never be staffed by anybody, on any
        // date, so every slot it demands would be unfilled. Loud, at configure
        // time, because a 12-hour task in a department of 8.4-hour days is a
        // decimal point in the wrong place and not a policy.
        //
        // Only when the configuration ASKED for hours. Without that gate a solo
        // 0.4-FTE staff pool — whose effective cap is 3.36h against the assumed
        // 4h session — would start being refused for a configuration that has
        // never mentioned an hour in its life.
        if (hoursActive) {
            const taskHours = isUsableHours(task.hours, MAX_HOURS_PER_DAY_CEILING)
                ? task.hours
                : ROSTER_V2_DEFAULTS.taskHours;
            let roomiest = null;
            for (const entry of dailyHoursCaps) {
                if (roomiest === null || entry.cap > roomiest.cap) roomiest = entry;
            }
            if (roomiest !== null && taskHours > roomiest.cap + HOURS_EPSILON) {
                const stated = isStated(task.hours) ? '' : ` (no hours given, so ${formatHours(ROSTER_V2_DEFAULTS.taskHours)} is assumed)`;
                const scaled = roomiest.fte === 1
                    ? ''
                    : ` (${formatHours(roomiest.cap / roomiest.fte)} scaled by their ${roomiest.fte} FTE)`;
                return invalid(`Task ${name} takes ${formatHours(taskHours)}${stated}, which is longer than every staff member's daily hours limit — the roomiest is ${roomiest.name}'s ${formatHours(roomiest.cap)}${scaled}, so every slot of this task would be unfilled on every date. Shorten the task, raise maxHoursPerDay, or give it to somebody whose day can hold it.`);
            }
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

            // The composed twin of the two checks above: enough people in the
            // band, enough people with the skill, but nobody who is BOTH —
            // every lead slot of this task would still be unfilled. Loud, at
            // configure time, like either gate alone.
            if (isNonEmptyString(task.requiresSkill)) {
                const bothCount = staff.reduce((sum, person) => {
                    const band = rawBandOf(person);
                    if (band === null || !wanted.has(band)) return sum;
                    const skills = Array.isArray(person?.skills) ? person.skills : [];
                    return skills.includes(task.requiresSkill) ? sum + 1 : sum;
                }, 0);
                if (bothCount === 0) {
                    return invalid(`Task ${name} may only be led by ${bandSetLabel(wanted)}-band staff (${bandSetGradeLabel(wanted, bands)}) who also hold skill ${task.requiresSkill}, and nobody in the staff pool is both. Check the grades and the skills, widen the task's leadBands, or move the band boundaries.`);
                }
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
const normaliseStaff = (
    staff,
    defaultMaxPerDay,
    bands = DEFAULT_GRADE_BANDS,
    hoursRules = resolveHoursRules(null),
) =>
    staff.map((person) => {
        const grade = normaliseGrade(person.grade);
        const fte = typeof person.fte === 'number' ? person.fte : ROSTER_V2_DEFAULTS.fte;

        // The two hours ceilings are resolved to EFFECTIVE, FTE-SCALED figures
        // here and nowhere else, so the gate, the audit, the reason strings and
        // `load.weeklyCap` are all reading one number. `contractedWeeklyHours` is
        // kept beside them because a reason string has to be able to say "42h
        // scaled by their 0.6 FTE" rather than only the product.
        //
        // A personal `weeklyHours` does NOT imply a personal `maxHoursPerDay`:
        // somebody on a 21-hour contract who works three full days is a real
        // arrangement, and deriving 4.2h/day from their week would silently
        // forbid it. Header, foot of file, and the ledger all say so.
        const contractedWeeklyHours = isUsableHours(person.weeklyHours, MAX_HOURS_PER_WEEK_CEILING)
            ? person.weeklyHours
            : hoursRules.weeklyHours;
        const contractedMaxHoursPerDay = isUsableHours(person.maxHoursPerDay, MAX_HOURS_PER_DAY_CEILING)
            ? person.maxHoursPerDay
            : hoursRules.maxHoursPerDay;

        return {
            name: person.name,
            fte,
            skills: new Set(Array.isArray(person.skills) ? person.skills : []),
            unavailable: new Set(Array.isArray(person.unavailable) ? person.unavailable : []),
            maxPerDay: isPositiveInt(person.maxPerDay) ? person.maxPerDay : defaultMaxPerDay,
            grade,
            band: grade === null ? null : bandOfGradeNumber(parseGradeNumber(grade), bands),
            /**
             * The grade as a number that sorts, for the one rule that ranks people
             * rather than gating them: which assignee of a multi-slot shift is its
             * lead. An unrecorded grade ranks below AH7 (`GRADE_UNKNOWN_RANK`) and
             * therefore never outranks a recorded one.
             */
            gradeRank: gradeRankOf(grade),
            contractedWeeklyHours,
            contractedMaxHoursPerDay,
            /** Both caps as the engine compares them: contract × FTE. */
            weeklyHoursCap: contractedWeeklyHours * fte,
            dailyHoursCap: contractedMaxHoursPerDay * fte,
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
    tasks.map((task) => {
        // A monthly task has NO weekly days, and says so rather than carrying the
        // default Mon–Fri list it will never use.
        //
        // BELT AND BRACES, honestly labelled: this emptying is not what stops a
        // monthly task also running every weekday. Both readers of the normalised
        // `days` — the "no days selected" warning and the day loop's filter —
        // already test `recurrence === null` first, so a monthly task's `days` is
        // never consulted and mutating this line changes no output. It is here so
        // that a normalised task never DESCRIBES itself as running Mon–Fri when it
        // runs monthly, which is a debugging and future-reader concern rather than
        // a behavioural one. Validation has already refused a task that set both,
        // so nothing a roster master typed is being discarded.
        const recurrence = normaliseRecurrence(task.recurrence);
        const slots = normaliseSlots(task.slots);

        return {
            name: task.name,
            requiresSkill: isNonEmptyString(task.requiresSkill) ? task.requiresSkill : null,
            days: recurrence !== null
                ? []
                : (Array.isArray(task.days) ? [...task.days] : [...ROSTER_V2_DEFAULTS.days]),
            recurrence,
            continuity: task.continuity === true,
            // A MULTI-SLOT TASK HAS NEITHER, and says so rather than carrying the
            // defaults it will never use.
            //
            // `coLeads: 0` is LOAD-BEARING and pinned by a test: phase 2 of the
            // assignment loop opens `task.coLeads` co-lead slots for every running
            // task, so a 1 here would hang a fourth, ungated person off the
            // embryologists' trio. `leads: 0` is belt and braces in the same spirit
            // as `days: []` above and honestly labelled as such — phase 1 branches
            // on `slots` before it ever looks at `leads`, and `perDayDemand` reads
            // the slot count, so mutating this zero changes no output. It is here so
            // that a normalised task never DESCRIBES itself as needing a lead it
            // does not have.
            leads: slots !== null ? 0 : (isPositiveInt(task.leads) ? task.leads : ROSTER_V2_DEFAULTS.leads),
            coLeads: slots !== null ? 0 : (isNonNegativeInt(task.coLeads) ? task.coLeads : ROSTER_V2_DEFAULTS.coLeads),
            slots,
            category: isNonEmptyString(task.category) ? task.category : ROSTER_V2_DEFAULTS.category,
            leadBands: normaliseLeadBands(task.leadBands),
            // Always present, always a number, whether or not the hours model is
            // in force — one task shape, and the value a future always-on model
            // would use is already visible in a debugger today. What the OPT-IN
            // predicate decides is whether anything reads it.
            hours: isUsableHours(task.hours, MAX_HOURS_PER_DAY_CEILING)
                ? task.hours
                : ROSTER_V2_DEFAULTS.taskHours,
        };
    });

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
/**
 * Adding this task's `hours` to what they already hold today would pass their
 * effective daily ceiling. Sits immediately after `REJECT_CAPACITY` because it is
 * the same KIND of fact — a resource today has consumed — and it is the finer of
 * the two: `REJECT_CAPACITY` counts duties, this one measures them. Both are
 * reported, and never merged, because "two duties is your limit" and "twelve hours
 * is over your limit" are different sentences to the person reading the roster.
 */
const REJECT_DAILY_HOURS = 'dailyHours';
/** The same, over the Monday–Sunday week `weekStartOf` defines. */
const REJECT_WEEKLY_HOURS = 'weeklyHours';
const REJECT_PAIR = 'pair';
const REJECT_CONSECUTIVE = 'consecutive';

/**
 * The same nine facts as a clause a roster master can read, for the one place
 * that has to explain a rejection in prose rather than count it: the warning that
 * says why a continuity task changed lead. Written in the past tense and without
 * the date, because the sentence they are dropped into already carries it.
 *
 * EVERY rejection code must appear here. The consumer distinguishes "no clause
 * known" (`null`) from "no constraint stopped them", so a missing key would not
 * fall back gracefully — it would put the word `undefined` into a sentence a
 * clinician reads, which is audit finding M7 in a new costume.
 */
const CONTINUITY_REJECTION_PROSE = Object.freeze({
    [REJECT_SKILL]: 'no longer holds the skill the task requires',
    [REJECT_BAND]: "no longer holds a grade in the task's lead bands",
    [REJECT_LEAVE]: 'was on leave that day',
    [REJECT_ON_TASK]: 'was already on that task that day',
    [REJECT_CAPACITY]: 'was already at their daily duty limit',
    [REJECT_DAILY_HOURS]: 'would have gone over their daily hours limit',
    [REJECT_WEEKLY_HOURS]: 'would have gone over their weekly hours limit',
    [REJECT_PAIR]: 'was blocked by a forbidden pairing',
    [REJECT_CONSECUTIVE]: 'was at the consecutive-day limit',
});

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
    // MULTI-SLOT: the ONE entry of `task.slots` being filled, or `null` for a
    // `leads`/`coLeads` slot. Every gate below is unchanged when it is `null`,
    // which is every slot of every task that does not use the field.
    entry = null,
    dateKey,
    date,
    dutiesOnDate,
    onTaskToday,
    forbidMap,
    dutiesByDate,
    maxConsecutiveDays,
    // The hours model, passed in rather than reached for: `hoursActive` false
    // makes this function byte-for-byte the function it was before hours existed,
    // and the two maps are then never even read.
    hoursActive = false,
    hoursOnDate = null,
    hoursThisWeek = null,
}) => {
    if (task.requiresSkill && !person.skills.has(task.requiresSkill)) {
        return REJECT_SKILL;
    }
    // MULTI-SLOT: this ENTRY's own skill, on top of the task-wide one directly
    // above. Reported as the same fact — a missing competency — because that is
    // what it is, and the reason string names both skills.
    if (entry !== null && !slotSkillMet(person, entry)) {
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
    // MULTI-SLOT: the band gate of THIS ENTRY, on exactly the terms `leadBands`
    // gates a lead. A `slots` task can never also carry `leadBands` (validation
    // refuses the pair), so the two branches are mutually exclusive rather than
    // composed.
    if (entry !== null && !slotBandMet(person, entry)) {
        return REJECT_BAND;
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

    // SAME-DAY DURATIONS SUM, then the week's do. Both against FTE-scaled
    // ceilings, both HARD: the slot is left unfilled rather than staffed by
    // somebody the roster would have worked past their contract. `+ HOURS_EPSILON`
    // is on the CAP side, so a duty that exactly fills a day is allowed — see the
    // constant for why an exact `>` would refuse `5.04 > 5.04`.
    if (hoursActive) {
        const already = hoursOnDate.get(person.name) || 0;
        if (already + task.hours > person.dailyHoursCap + HOURS_EPSILON) {
            return REJECT_DAILY_HOURS;
        }
        const thisWeek = hoursThisWeek.get(person.name) || 0;
        if (thisWeek + task.hours > person.weeklyHoursCap + HOURS_EPSILON) {
            return REJECT_WEEKLY_HOURS;
        }
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
/**
 * How many hours-blocked people an `unfilled` reason names before it stops.
 *
 * A JUDGMENT CALL, flagged as one. Naming everybody is the honest default this
 * engine reaches for everywhere else, but an hours-bound slot in a 30-person
 * department would produce a paragraph in a table cell, and the names it drops are
 * recoverable from `load.hoursPerWeek`. The count is always stated, so the reason
 * never pretends to be complete when it is not.
 */
const HOURS_DETAIL_LIMIT = 3;

/**
 * Why exactly can this ONE person not add this ONE task today? The sentence the
 * aggregate tally cannot say, because hours are a quantity rather than a flag.
 *
 * Reads, for example:
 *   Ada would reach 12h on 2026-09-16, over their 8.4h daily limit (already on
 *   Ward Round 4h, Clinic 4h)
 *
 *   Ben would reach 44h in the week of 2026-09-14, over their 42h weekly limit
 *   (40h already assigned)
 *
 * "their" is deliberate: the engine knows names and grades and holds no opinion
 * about anybody's pronouns, and inventing one to make a sentence flow would be a
 * fact the roster master never entered.
 */
const hoursBreachClause = ({ person, task, kind, dateKey, weekStartKey, assignedToday, hoursToday, hoursThisWeek }) => {
    if (kind === REJECT_WEEKLY_HOURS) {
        return `${person.name} would reach ${formatHours(hoursThisWeek + task.hours)} in the week of ${weekStartKey}, over their ${formatHours(person.weeklyHoursCap)} weekly limit (${formatHours(hoursThisWeek)} already assigned)`;
    }

    const held = assignedToday.length === 0
        ? 'nothing else assigned that day'
        : `already on ${assignedToday.map((entry) => `${entry.task} ${formatHours(entry.hours)}`).join(', ')}`;
    return `${person.name} would reach ${formatHours(hoursToday + task.hours)} on ${dateKey}, over their ${formatHours(person.dailyHoursCap)} daily limit (${held})`;
};

const describeEmptyPool = ({ task, role, dateKey, tally, poolSize, hoursDetail = [], entry = null }) => {
    const qualified = poolSize - tally[REJECT_SKILL];
    // Only the lead slot is band-gated, so only the lead slot may say "band" —
    // and, since multi-slot shifts, only a slot entry that carries a band.
    const bandGated = entry === null
        ? (role === 'lead' && task.leadBands !== null)
        : entry.bandSet !== null;
    const gatingBands = entry === null ? task.leadBands : entry.bandSet;
    const inBand = qualified - tally[REJECT_BAND];
    // The task's skill plus, for a multi-slot entry, its own — so a trio's senior
    // slot reads "skills Witnessing and ICSI" rather than naming only one of them.
    const skills = slotSkillsRequired(task, entry);

    const parts = [];
    if (skills.length > 0) parts.push(`${qualified} qualified`);
    else if (!bandGated) parts.push(`${poolSize} in pool`);
    if (bandGated) parts.push(`${inBand} in band`);

    if (tally[REJECT_LEAVE]) parts.push(`${tally[REJECT_LEAVE]} on leave`);
    if (tally[REJECT_CAPACITY]) parts.push(`${tally[REJECT_CAPACITY]} at daily limit`);
    // Worded to be unmistakably the HOURS limit and not `at daily limit`, which is
    // the duty-count one directly above it. Two constraints, two sentences.
    if (tally[REJECT_DAILY_HOURS]) parts.push(`${tally[REJECT_DAILY_HOURS]} over their daily hours limit`);
    if (tally[REJECT_WEEKLY_HOURS]) parts.push(`${tally[REJECT_WEEKLY_HOURS]} over their weekly hours limit`);
    if (tally[REJECT_ON_TASK]) parts.push(`${tally[REJECT_ON_TASK]} already on this task`);
    if (tally[REJECT_PAIR]) parts.push(`${tally[REJECT_PAIR]} blocked by a forbidden pairing`);
    if (tally[REJECT_CONSECUTIVE]) parts.push(`${tally[REJECT_CONSECUTIVE]} at the consecutive-day limit`);

    const bandLabel = bandGated ? bandSetLabel(gatingBands) : '';
    // WHICH SLOT FAILED, and this is the whole reason a slot entry carries a
    // label: `Weekend Witnessing junior slot` says which third of the trio could
    // not be staffed, where `Weekend Witnessing slot` would leave a roster master
    // reading three identical sentences.
    const which = entry === null ? `${task.name} ${role}` : `${task.name} ${entry.label}`;

    let head;
    if (skills.length > 0 && bandGated) {
        head = `no available staff hold ${skillsPhrase(skills)} and sit in the ${bandLabel} band for ${which} on ${dateKey}`;
    } else if (skills.length > 0) {
        head = `no available staff hold ${skillsPhrase(skills)} for ${which} on ${dateKey}`;
    } else if (bandGated) {
        head = `no available ${bandLabel}-band staff for ${which} on ${dateKey}`;
    } else {
        head = `no available staff for ${which} on ${dateKey}`;
    }

    // The hours detail hangs off the end rather than inside the tally, because the
    // tally is a set of counts that narrow left to right and these are whole
    // sentences about named people. Absent entirely when hours bound nobody, so a
    // reason that has nothing to do with hours never mentions them.
    if (hoursDetail.length === 0) return `${head} (${parts.join(', ')})`;

    const shown = hoursDetail.slice(0, HOURS_DETAIL_LIMIT);
    const hidden = hoursDetail.length - shown.length;
    const tail = hidden === 0
        ? ''
        : `; and ${hidden} other${hidden === 1 ? '' : 's'} over an hours limit`;
    return `${head} (${parts.join(', ')}) — ${shown.join('; ')}${tail}`;
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

/**
 * The LEAD comparator for a `continuity: true` task: whoever has led this task
 * most often in this run wins, and everything else is the ordinary tie-break.
 *
 * This is the exact inverse of `compareCandidates`'s second key, and deliberately
 * so: normal fairness spreads a task across the team, continuity concentrates it.
 * The inversion is scoped to ONE task's lead slot — the same person's co-lead
 * slots, and every other task they are eligible for, are still shared by
 * FTE-weighted fairness, so asking for continuity on one clinic does not exempt
 * anybody from the rest of the roster.
 *
 * On the FIRST occurrence every count is 0, so this degenerates to
 * `compareCandidates` and the incumbent is chosen by ordinary fairness. That is
 * the intended behaviour: the engine has no opinion about who SHOULD hold a
 * clinic, only that whoever holds it should keep holding it.
 *
 * NOT A MEMORY OF INCUMBENCY. Two people with equally many previous leads (which
 * happens as soon as one occurrence goes to a stand-in) are separated by
 * `compareCandidates`, not by who led most recently. Deterministic, but it does
 * mean an incumbency can move after a single interruption — see the header.
 */
const compareContinuityCandidates = (a, b) => {
    if (a.taskLeads !== b.taskLeads) return b.taskLeads - a.taskLeads;
    return compareCandidates(a, b);
};

/**
 * "Who is leading this?" as one comparable string — THE definition of whether
 * continuity held from one occurrence to the next.
 *
 * SORTED, so a task with two lead slots is compared as a SET: which shift object
 * names whom first is an artefact of the order the slots were filled in, and a
 * cohort meeting the same two clinicians has experienced no break.
 *
 * One definition, deliberately, because there are two callers — the generator's
 * warning and `scoreRoster`'s count — and two definitions of "did continuity
 * hold" would eventually disagree with each other in front of a roster master.
 * That is post-mortem A-RC1's rule (one definition per displayed fact) applied to
 * a predicate instead of a label.
 */
const continuitySignature = (leads) => [...leads].sort().join(' ');

/**
 * MULTI-SLOT: the order a shift's assignees are published in — LEAD FIRST.
 *
 *   1. highest grade first, because that is the decided rule for who leads a
 *      team shift (`GRADE_UNKNOWN_RANK` puts an assignee with no recorded grade
 *      last, so they never outrank somebody whose grade the department holds);
 *   2. then `compareCandidates` — the SAME fairness tie-break the engine used to
 *      pick these people — evaluated on the candidate snapshot taken at the
 *      moment each was chosen, which is the only state in which the comparator's
 *      inputs were ever true;
 *   3. and `compareCandidates` ends in a name comparison over unique names, so
 *      this is a TOTAL order: no two assignees can compare equal, and the
 *      published order cannot depend on the host's sort implementation.
 *
 * `slots` order does NOT appear anywhere in it. Two principals on one shift are
 * ranked by fairness, not by which entry named them, because the entries are
 * requirements and not a hierarchy.
 */
const orderMultiSlotFills = (fills) =>
    [...fills].sort((a, b) => {
        if (a.candidate.gradeRank !== b.candidate.gradeRank) {
            return b.candidate.gradeRank - a.candidate.gradeRank;
        }
        return compareCandidates(a.candidate, b.candidate);
    });

// --- 6. HARD VS SOFT CONSTRAINTS ---------------------------------------------
//
// The published Nurse Rostering Problem literature (INRC-II and its lineage)
// separates these two categories, and so does this engine, because they have
// different consequences:
//
//   HARD — violating one makes the roster INFEASIBLE. This engine never
//   violates a hard constraint; a slot it cannot fill within them goes to
//   `unfilled` instead. Skill match, LEAD BAND, availability,
//   one-assignment-per-slot, daily capacity, DAILY HOURS, WEEKLY HOURS,
//   `forbidPairs`, `maxConsecutiveDays`, and — for a multi-slot task — EVERY
//   SLOT'S OWN GATE and THE LEAD BEING THE HIGHEST GRADE ON THE SHIFT.
//
//   SOFT — violating one is legal but undesirable. These are ALLOWED and
//   COUNTED, never enforced: load imbalance against the FTE-weighted target,
//   one person repeatedly drawing the same task, uneven weekend distribution,
//   isolated single working days, HOURS imbalance against the FTE-weighted
//   target, and the FOUR-WEEK rolling total (warned about in `warnings`, and
//   deliberately not a `breakdown` component — it is a threshold that either
//   tripped or did not, not a quantity to weigh against four others).
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
/*
 * The weight of a continuity break is UNCALIBRATED, exactly as the other four
 * are: 2 says "a broken incumbency matters more than one duty of load drift, and
 * about as much as one duty of weekend drift". No clinician has been asked. The
 * number to read is `breakdown.continuityBreaks` — a plain count of how many
 * times a lead changed — and `softPenalty` is only ever a comparison between two
 * configurations, never a quantity.
 *
 * (This table briefly existed as two constants — the original four keys plus an
 * `ALL_SOFT_PENALTY_WEIGHTS` overlay — because a compatibility gate pinned the
 * original key list. The gate was moved deliberately and the two were merged.)
 */
export const SOFT_PENALTY_WEIGHTS = Object.freeze({
    loadImbalance: 1,
    taskRepetition: 1,
    weekendImbalance: 2,
    isolatedDays: 1,
    continuityBreaks: 2,
});

/**
 * The hours model's weight, in a SEPARATE overlay — and this is a transitional
 * state, not a design.
 *
 * `SOFT_PENALTY_WEIGHTS` above is pinned by two compatibility gates:
 * `rosterEngineV2.test.js` ("exposes its soft weights so they can be changed in
 * one visible place") asserts its exact key list, and
 * `rosterEngineV2.psych.test.js` ("carries the four original weights unchanged,
 * plus continuityBreaks, frozen") asserts its exact shape. Those gates are the
 * proof that this change is additive, so they are not editable by the change that
 * wants to extend them. This is the SAME transitional device, for the SAME reason,
 * that `ALL_SOFT_PENALTY_WEIGHTS` was when `continuityBreaks` landed: the
 * orchestrator moved the pins deliberately and merged the tables in one commit.
 * → MERGE THIS IN and delete the overlay once those two pins are moved; it is a
 * one-line change and the scorer already reads the merged view below.
 *
 * WEIGHT 0.25, and it is a JUDGMENT CALL flagged for review. `loadImbalance` is
 * measured in DUTIES and this is measured in HOURS, so weighting them equally
 * would silently make hours drift matter four times as much as duty drift for no
 * reason anybody argued. 0.25 says "four hours of drift is worth one duty of
 * drift", i.e. exactly one default session — defensible, arithmetically neutral,
 * and as uncalibrated as the other five. The number to read is the plain
 * `breakdown.hoursImbalance`; `softPenalty` was only ever a comparison.
 */
export const HOURS_SOFT_PENALTY_WEIGHTS = Object.freeze({
    hoursImbalance: 0.25,
});

/**
 * Every soft weight this engine actually applies. The scorer reads THIS, so a
 * breakdown key can never be weighted by `undefined` — which would make
 * `softPenalty` `NaN` and turn "worse than that configuration" into "unknown".
 */
const ALL_SOFT_PENALTY_WEIGHTS = Object.freeze({
    ...SOFT_PENALTY_WEIGHTS,
    ...HOURS_SOFT_PENALTY_WEIGHTS,
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
/**
 * Somebody's assigned durations on one date sum above their FTE-scaled daily
 * ceiling. Audited exactly as the band rule is — off the finished roster, so a
 * swap tool that moves a 4-hour clinic onto an already-full day is caught after
 * the fact and not merely prevented during construction.
 */
const HARD_RULE_DAILY_HOURS = 'dailyHours';
/** The same over one Monday–Sunday week, whichever weeks the roster spans. */
const HARD_RULE_WEEKLY_HOURS = 'weeklyHours';
/**
 * MULTI-SLOT: somebody on a `slots` shift fills no slot they qualify for. Audited
 * as a MATCHING rather than a per-person check — see `unmatchableAssignees` — so
 * that a trio of {principal, senior, junior} slots holding three seniors is
 * caught even though every one of them satisfies SOME slot.
 */
const HARD_RULE_SLOT_GATE = 'slotGate';
/**
 * MULTI-SLOT: the shift's `lead` is not the highest grade on it. The decided rule
 * is a rule about the finished shift, so it is audited off the finished shift —
 * which also catches a swap tool that moves a junior into the lead field and
 * leaves a principal beside them.
 */
const HARD_RULE_LEAD_GRADE = 'leadGrade';

/**
 * MULTI-SLOT, THE READ-BACK: which of these assignees can NO valid assignment of
 * people to slots account for?
 *
 * WHY A MATCHING AND NOT A LOOP. Checking each person against "some slot they
 * qualify for" passes a shift that holds three seniors against
 * {principal, senior, junior} — every senior satisfies the senior slot, and the
 * check would report nothing while the principal slot sits empty and the shift
 * is a lie. The question is whether the people on the shift can be given
 * DISTINCT slots, which is bipartite matching, so that is what this does
 * (Kuhn's augmenting path — the roster shapes here are three or four wide).
 *
 * DETERMINISTIC, and its bias is documented rather than hidden: assignees are
 * processed in `assignees` order, so when a shift holds more people than its
 * slots can absorb, the ones reported are the LATER ones in that order. Names
 * not in the staff pool are skipped — they carry no skills or band to match on,
 * and the availability rule has already reported them.
 */
const unmatchableAssignees = (names, task, byName) => {
    const slots = task.slots;
    const eligible = names.map((name) => {
        const person = byName.get(name);
        if (!person) return null;
        const indices = [];
        for (let i = 0; i < slots.length; i += 1) {
            if (canFillSlot(person, task, slots[i])) indices.push(i);
        }
        return indices;
    });

    /** slot index -> the assignee index currently holding it, or -1. */
    const owner = new Array(slots.length).fill(-1);

    const seat = (personIndex, visited) => {
        for (const slotIndex of eligible[personIndex]) {
            if (visited.has(slotIndex)) continue;
            visited.add(slotIndex);
            if (owner[slotIndex] === -1 || seat(owner[slotIndex], visited)) {
                owner[slotIndex] = personIndex;
                return true;
            }
        }
        return false;
    };

    const unmatchable = [];
    for (let i = 0; i < names.length; i += 1) {
        if (eligible[i] === null) continue;
        if (!seat(i, new Set())) unmatchable.push(names[i]);
    }
    return unmatchable;
};

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
 *
 * The two HOURS rules are audited on exactly the terms the band rule is: from the
 * finished roster, against the same FTE-scaled caps and the same epsilon the
 * construction gate used, and only when the configuration asks for the hours model
 * (`hoursModelRequested`). A configuration that never mentions hours gets the
 * violation list it got before hours existed — which matters most for the
 * department whose `maxPerDay` is 3, whose three 4-hour sessions would otherwise
 * start failing an 8.4-hour cap it never set.
 *
 * The two MULTI-SLOT rules are gated the same way, but per TASK rather than per
 * configuration: they run only for a task that carries `slots`, so a roster built
 * from `leads`/`coLeads` is audited by exactly the rules that existed before
 * `slots` did. A shift naming a task the configuration does not have is audited by
 * neither, for the same reason it contributes no hours: nothing knows what its
 * slots were meant to be.
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

    const hoursActive = hoursModelRequested(config);
    const staff = normaliseStaff(
        config.staff,
        maxConcurrentPerDay,
        resolveGradeBands(rules),
        resolveHoursRules(rules),
    );
    const tasks = normaliseTasks(config.tasks);
    const byName = new Map(staff.map((person) => [person.name, person]));
    const byTask = new Map(tasks.map((task) => [task.name, task]));
    const forbidMap = buildForbidMap(forbidPairs, staff.map((person) => person.name));

    const violations = [];
    const add = (rule, detail, date, task) => violations.push({ rule, date, task, detail });

    /**
     * weekStartKey -> (name -> hours), accumulated across the whole roster rather
     * than per day, because the weekly cap spans days. Keyed by the Monday that
     * OPENED each week (`weekStartKeyOf`) rather than by an index off
     * `config.startDate`, so a roster carrying dates outside the run — which any
     * roster handed to this pure function may — is still audited against the week
     * it actually falls in.
     */
    const hoursByWeekStart = new Map();

    for (const dateKey of Object.keys(roster).sort()) {
        const shifts = roster[dateKey];
        const dutiesToday = new Map();
        /** name -> hours held on this date, for the daily hours rule. */
        const hoursToday = new Map();
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

            // MULTI-SLOT, both decided rules, read back off the finished shift.
            // Scoped to `slots` tasks: a `leads`/`coLeads` task is ALLOWED a junior
            // lead beside a senior co-lead — that is the shadowing arrangement
            // section 0b's rule 6 exists to make expressible — so neither rule may
            // leak onto one.
            if (task && task.slots !== null) {
                const known = people.filter((name) => byName.has(name));

                for (const name of unmatchableAssignees(people, task, byName)) {
                    add(
                        HARD_RULE_SLOT_GATE,
                        `${name} is on ${shift.task} but no slot of it that they qualify for is free (its slots are ${task.slots.map((entry) => entry.label).join(', ')})`,
                        dateKey,
                        shift.task,
                    );
                }

                // "The lead is the highest grade present." Stated as "nobody on the
                // shift outranks the lead", because equal grades are a tie and a tie
                // is not a violation.
                if (isNonEmptyString(shift.lead) && byName.has(shift.lead)) {
                    const leadRank = byName.get(shift.lead).gradeRank;
                    const senior = known.find((name) => byName.get(name).gradeRank > leadRank);
                    if (senior !== undefined) {
                        const describeGrade = (name) => {
                            const grade = byName.get(name).grade;
                            return grade === null ? 'no grade recorded' : grade;
                        };
                        add(
                            HARD_RULE_LEAD_GRADE,
                            `${shift.lead} (${describeGrade(shift.lead)}) leads ${shift.task}, but ${senior} (${describeGrade(senior)}) is on the same shift — the lead of a multi-slot shift is its highest grade`,
                            dateKey,
                            shift.task,
                        );
                    }
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
                // A shift whose task is not in the configuration has no knowable
                // duration, so it contributes no hours rather than a guessed 4 —
                // the same reason the skill and band rules above say nothing about
                // a task they cannot look up. It is already reported by whichever
                // rule noticed the person or the shape.
                if (hoursActive && task) {
                    hoursToday.set(name, (hoursToday.get(name) || 0) + task.hours);
                }
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

        // The hours twin of the duty-capacity rule directly above, and the
        // read-back half of the gate in `rejectionFor`. Same epsilon on the cap
        // side, so a day filled exactly to the ceiling is legal here too — the
        // audit and the gate must agree about the boundary or a roster the engine
        // built would fail its own audit.
        if (hoursActive) {
            const weekStartKey = weekStartKeyOf(dateKey);
            if (!hoursByWeekStart.has(weekStartKey)) hoursByWeekStart.set(weekStartKey, new Map());
            const week = hoursByWeekStart.get(weekStartKey);

            for (const [name, hours] of hoursToday) {
                const person = byName.get(name);
                if (!person) continue;
                if (hours > person.dailyHoursCap + HOURS_EPSILON) {
                    add(
                        HARD_RULE_DAILY_HOURS,
                        `${name} holds ${formatHours(hours)}, limit ${formatHours(person.dailyHoursCap)}`,
                        dateKey,
                        null,
                    );
                }
                week.set(name, (week.get(name) || 0) + hours);
            }
        }
    }

    if (hoursActive) {
        for (const weekStartKey of [...hoursByWeekStart.keys()].sort()) {
            for (const [name, hours] of hoursByWeekStart.get(weekStartKey)) {
                const person = byName.get(name);
                if (!person) continue;
                if (hours > person.weeklyHoursCap + HOURS_EPSILON) {
                    add(
                        HARD_RULE_WEEKLY_HOURS,
                        `${name} holds ${formatHours(hours)} in the week of ${weekStartKey}, limit ${formatHours(person.weeklyHoursCap)}`,
                        weekStartKey,
                        null,
                    );
                }
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
 *                     A `continuity: true` task is EXEMPT from this component
 *                     entirely. Repetition of one task by one person is precisely
 *                     what continuity asks for, so charging for it would make the
 *                     scorer punish the configuration for doing as it was told —
 *                     and would leave `softPenalty` unable to tell a department
 *                     that got the continuity it wanted from one that did not.
 *   weekendImbalance  the same deviation measure, restricted to Saturday and
 *                     Sunday duties.
 *   isolatedDays      working days with no duty on either the day before or the
 *                     day after — a single day in, surrounded by days off.
 *   continuityBreaks  how many times the lead of a `continuity: true` task
 *                     CHANGED between one occurrence of it and the next. Present
 *                     in `breakdown` only when the configuration actually asks
 *                     for continuity somewhere, so a department that does not use
 *                     the feature sees exactly the breakdown it saw before it
 *                     existed. Occurrences whose lead slot went unfilled are
 *                     skipped rather than counted as two breaks: the gap is
 *                     already reported in `unfilled`, and the incumbent resuming
 *                     after it is continuity holding, not breaking twice.
 *   hoursImbalance    the SAME deviation measure as `loadImbalance`, in HOURS
 *                     rather than duties — total absolute deviation from each
 *                     person's FTE-weighted share of the hours actually
 *                     generated. Present in `breakdown` only when the
 *                     configuration asks for the hours model, exactly as
 *                     `continuityBreaks` is. It is a SEPARATE component and not a
 *                     replacement, because the two disagree in the one case that
 *                     matters: the engine's fairness comparator ranks candidates
 *                     by DUTY COUNT, so a department whose tasks differ in length
 *                     can be perfectly balanced on duties (`loadImbalance` 0) and
 *                     badly unbalanced on hours. That gap is REPORTED rather than
 *                     closed — closing it means an hours-weighted comparator,
 *                     which changes who gets every duty and is its own piece of
 *                     measurable work.
 *
 * Returns `{ ok: true, hardViolations, softPenalty, breakdown }`, or
 * `{ ok: false, reason }` for an invalid config.
 */
export const scoreRoster = (roster, config) => {
    const audit = auditHardConstraints(roster, config);
    if (!audit.ok) return { ok: false, reason: audit.reason };

    const rules = isPlainObject(config.rules) ? config.rules : {};
    const hoursActive = hoursModelRequested(config);
    const staff = normaliseStaff(
        config.staff,
        isPositiveInt(rules.maxConcurrentPerDay)
            ? rules.maxConcurrentPerDay
            : ROSTER_V2_DEFAULTS.maxConcurrentPerDay,
        resolveGradeBands(rules),
        resolveHoursRules(rules),
    );
    const tasks = normaliseTasks(config.tasks);
    const byTaskName = new Map(tasks.map((task) => [task.name, task]));

    const duties = new Map(staff.map((person) => [person.name, 0]));
    const weekendDuties = new Map(staff.map((person) => [person.name, 0]));
    const hours = new Map(staff.map((person) => [person.name, 0]));
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

                // A shift naming a task the configuration does not have carries no
                // knowable duration, and contributes no hours rather than a
                // guessed default — the same rule the audit follows.
                const definition = byTaskName.get(shift.task);
                if (hoursActive && definition) {
                    hours.set(name, hours.get(name) + definition.hours);
                }
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
        // The continuity exemption. Not a discount — a full exemption, because
        // there is no defensible amount to charge for obeying an instruction.
        if (task.continuity) continue;

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

    // Read back off the finished roster, exactly like `hardViolations`: the
    // construction loop's own count is not trusted, and this function must give
    // the same answer for a roster some future optimiser invented.
    const continuityTasks = tasks.filter((task) => task.continuity);
    let continuityBreaks = 0;
    if (continuityTasks.length > 0) {
        const dateKeys = Object.keys(roster).sort();
        for (const task of continuityTasks) {
            let previous = null;
            for (const dateKey of dateKeys) {
                const shifts = Array.isArray(roster[dateKey]) ? roster[dateKey] : [];
                const leads = shifts
                    .filter((shift) => shift.task === task.name)
                    .map((shift) => shift.lead)
                    .filter((name) => typeof name === 'string' && name !== '');
                // No lead on this occurrence: nothing changed hands, so there is
                // nothing to count. The unfilled slot is reported elsewhere.
                if (leads.length === 0) continue;

                const signature = continuitySignature(leads);
                if (previous !== null && signature !== previous) continuityBreaks += 1;
                previous = signature;
            }
        }
    }

    const breakdown = {
        loadImbalance: round2(deviation(duties)),
        taskRepetition: round2(taskRepetition),
        weekendImbalance: round2(deviation(weekendDuties)),
        isolatedDays,
        // Present only when something asked for continuity, so the breakdown of a
        // configuration that does not use the feature is byte-identical to the
        // one it produced before the feature existed.
        ...(continuityTasks.length > 0 ? { continuityBreaks } : {}),
        // The same rule, for the same reason, one feature later.
        ...(hoursActive ? { hoursImbalance: round2(deviation(hours)) } : {}),
    };

    const softPenalty = round2(
        Object.entries(breakdown).reduce(
            // `ALL_SOFT_PENALTY_WEIGHTS`, not `SOFT_PENALTY_WEIGHTS`: the exported
            // table is pinned by two compatibility gates and cannot yet carry
            // `hoursImbalance`, and a missing weight would multiply into `NaN`.
            // The two tables hold identical values for every key they share, so
            // this changes no non-hours score.
            (sum, [key, value]) => sum + ALL_SOFT_PENALTY_WEIGHTS[key] * value,
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
 * When the configuration asks for the hours model, and ONLY then, every `load`
 * entry additionally carries `hours` (the total assigned), `hoursPerWeek` (one
 * figure per generated week, index `i` being the week `shift.week === i + 1`
 * names) and `weeklyCap` (`weeklyHours * fte`, the figure the hard weekly gate
 * compares against). A configuration that never mentions hours gets the four-key
 * `load` entry it got before hours existed.
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
 * It includes the HOURS GATE for exactly the same reason, and the failure it
 * prevents is the sharpest instance of the general one: a 6-hour clinic and a
 * 2-hour review both fit an empty 8.4-hour day, but once the review is placed the
 * clinic fits nobody. Ordering by scarcity WITHOUT counting hours would fill the
 * loose 2-hour slot first, every time, and then report the 6-hour clinic as
 * unstaffable — a shortage the engine manufactured, indistinguishable in
 * `unfilled` from a real one.
 *
 * Leads are still filled before co-leads (two phases, each internally ordered by
 * scarcity). That ordering is what makes it impossible for a pairing group to
 * end up holding a co-lead with no lead to attach them to.
 *
 * A MULTI-SLOT TASK'S ENTRIES ARE EACH A SLOT IN THEIR OWN RIGHT, and they are
 * filled in PHASE 1 alongside the lead slots of every other task — because that
 * is what they are: staffing requirements that stand or fall on their own, none
 * of them dependent on another being filled first. So the department's one
 * principal is not spent on an ungated duty while a principal-gated slot entry
 * waits, and — the case this feature exists for — a trio whose junior entry
 * cannot be staffed still fills the other two and reports ONE `unfilled` entry
 * naming the junior slot. There is no co-lead phase for such a task; the shift's
 * `lead` and `coLead` are DERIVED from the grades of whoever filled its entries
 * (section 5's ranking), not from which slot they filled.
 *
 * WHICH DAYS A TASK RUNS ON. A task with `days` runs on those weekdays of every
 * week; a task with `recurrence` runs on the nth (or last) named weekday of each
 * calendar month, restricted to dates inside this run. The two are mutually
 * exclusive (validation refuses both), the occurrence dates come from
 * `recurrenceDatesBetween`, and a monthly task with no occurrence in the horizon
 * generates nothing and produces a WARNING rather than an `unfilled` entry — no
 * slot was demanded, so there is nothing that failed to be staffed.
 *
 * CONTINUITY. `continuity: true` makes the lead slots of ONE task prefer whoever
 * has led that task most in this run, ahead of FTE-weighted fairness. Every gate
 * still applies first, so an unavailable incumbent loses the slot; the change is
 * counted in `score.breakdown.continuityBreaks` and named in `warnings`.
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
    const hoursActive = hoursModelRequested(config);
    const hoursRules = resolveHoursRules(rules);

    const staff = normaliseStaff(config.staff, maxConcurrentPerDay, bands, hoursRules);
    const tasks = normaliseTasks(config.tasks);
    const forbidMap = buildForbidMap(forbidPairs, staff.map((person) => person.name));

    // --- dates ----------------------------------------------------------------
    const requestedStart = parseLocalDateKey(config.startDate);
    const start = snapToMonday(requestedStart);
    const effectiveStart = toLocalDateKey(start);

    /**
     * The last day of the run. The day loop walks `weeks * 7` days from `start`,
     * so this is that horizon written down once — a monthly task's occurrences are
     * resolved against it before the loop rather than re-derived per day.
     */
    const horizonEndKey = toLocalDateKey(addDays(start, config.weeks * DAYS_PER_WEEK - 1));

    /**
     * taskName -> Set<dateKey>, for monthly tasks only.
     *
     * Derived from `recurrenceDatesBetween`, which is the one definition of when a
     * monthly task runs. An empty set is legal and means the run is too short (or
     * badly placed) to contain an occurrence — warned about below, never an error.
     */
    const occurrencesByTask = new Map(
        tasks
            .filter((task) => task.recurrence !== null)
            .map((task) => [
                task.name,
                new Set(recurrenceDatesBetween(task.recurrence, effectiveStart, horizonEndKey)),
            ]),
    );

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
    /**
     * taskName -> (name -> LEAD count). Separate from `dutiesByTask`, which counts
     * both roles: continuity is about who LEADS, and a person who has co-led a
     * clinic six times has no incumbency in it.
     */
    const leadsByTask = new Map(tasks.map((task) => [task.name, new Map()]));
    /**
     * taskName -> { dateKey, leads } for the most recent occurrence of a
     * continuity task that actually got a lead. The comparison point for both the
     * break count and the warning.
     */
    const continuityHistory = new Map();
    /**
     * dateKey -> (name -> hours held that date), the daily gate's state. Kept
     * beside `dutiesByDate` rather than inside it because the two rules count
     * different things and merging them would make either one's mutation
     * untestable in isolation.
     */
    const hoursByDate = new Map();
    /**
     * dateKey -> (name -> [{ task, hours }]), in assignment order. Exists ONLY so
     * that an hours refusal can say what the person already holds that day —
     * "already on Ward Round 4h, Clinic 4h" is the difference between a reason and
     * a number.
     */
    const assignmentsByDate = new Map();
    /**
     * One map per generated week, index `week`. The weekly window is the generated
     * Monday–Sunday block, which is exactly the loop's own `week` — see
     * `weekStartOf` for why that is a calendar fact rather than a convenience.
     */
    const hoursByWeek = Array.from({ length: config.weeks }, () => new Map());

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

    // The MULTI-SLOT twin of the warning above, said separately because the
    // sentence it needs is a different sentence: an ungraded colleague cannot fill
    // a BANDED SLOT ENTRY either, and there is no "may still co-lead" consolation
    // to offer them — every entry of a multi-slot task is a slot in its own right,
    // so what is left to them is the entries that carry no band.
    const bandGatedSlotTasks = tasks.filter(
        (task) => task.slots !== null && task.slots.some((entry) => entry.band !== null),
    );
    if (bandGatedSlotTasks.length > 0) {
        const ungraded = staff.filter((person) => person.grade === null).map((person) => person.name);
        if (ungraded.length > 0) {
            warnings.push(
                `${ungraded.length === 1 ? '1 staff member has' : `${ungraded.length} staff members have`} no job grade recorded (${ungraded.join(', ')}), so they cannot fill any band-restricted slot of ${bandGatedSlotTasks.length === 1 ? 'the multi-slot task' : `the ${bandGatedSlotTasks.length} multi-slot tasks`}. They remain eligible for every slot that carries no band, and for every other duty.`,
            );
        }
    }

    for (const task of tasks) {
        if (task.recurrence === null && task.days.length === 0) {
            warnings.push(
                `Task ${task.name} has no days selected, so it will never appear in the roster.`,
            );
        }
        // The monthly twin of "no days selected", and a likelier mistake: a
        // perfectly valid 3rd-Wednesday clinic simply does not intersect a
        // fortnight that happens to fall the wrong side of it. Silence here would
        // look exactly like the engine having dropped the task.
        if (task.recurrence !== null && occurrencesByTask.get(task.name).size === 0) {
            warnings.push(
                `Task ${task.name} runs on the ${recurrenceLabel(task.recurrence)}, and no such date falls between ${effectiveStart} and ${horizonEndKey}, so it will never appear in this roster. Generate a longer run, or one that covers an occurrence.`,
            );
        }
        if (task.requiresSkill) {
            const holders = staff.filter((person) => person.skills.has(task.requiresSkill));
            const needed = perDayDemand(task);
            if (holders.length < needed) {
                warnings.push(
                    `Task ${task.name} needs ${needed} ${needed === 1 ? 'person' : 'people'} per day but only ${holders.length} ${holders.length === 1 ? 'holds' : 'hold'} skill ${task.requiresSkill}, so some slots cannot be filled on any day.`,
                );
            }
        }
        // The hours twin of the ungraded-staff warning, and the SUB-refusal case:
        // validation refuses a task longer than EVERYBODY's day, so what is left
        // here is a task longer than SOME people's day — which is invisible in the
        // roster (they are simply never on it) and is almost always a part-timer
        // whose FTE-scaled cap cannot hold one session. Named, once, per task,
        // because "why is Scott never on the long clinic?" has one answer.
        if (hoursActive) {
            const tooLongFor = staff
                .filter((person) => task.hours > person.dailyHoursCap + HOURS_EPSILON)
                .map((person) => `${person.name} (${formatHours(person.dailyHoursCap)})`);
            if (tooLongFor.length > 0) {
                warnings.push(
                    `Task ${task.name} takes ${formatHours(task.hours)}, which is longer than the daily hours limit of ${tooLongFor.length === 1 ? '1 staff member' : `${tooLongFor.length} staff members`} (${tooLongFor.join(', ')}), so they can never be rostered on it.`,
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
        // MULTI-SLOT: the same warning one field over, and grouped by GATE rather
        // than reported per entry, because two identical junior slots in a
        // department with one junior is ONE fact ("you asked for two, there is
        // one") and not two. Validation has already refused a gate nobody can pass
        // at all; this is the narrower and commoner case, and it is a warning
        // rather than a refusal for the same reason its `leadBands` twin is — the
        // roster is still worth generating, with the shortfall visible in
        // `unfilled` on every date.
        if (task.slots !== null) {
            /** gate signature -> the labels of the entries sharing it. */
            const byGate = new Map();
            for (const entry of task.slots) {
                const key = `${entry.band === null ? '' : entry.band}|${entry.requiresSkill === null ? '' : entry.requiresSkill}`;
                if (!byGate.has(key)) byGate.set(key, { entry, labels: [] });
                byGate.get(key).labels.push(entry.label);
            }

            for (const { entry, labels } of byGate.values()) {
                const qualified = staff.filter((person) => canFillSlot(person, task, entry));
                if (qualified.length >= labels.length) continue;

                const gate = [];
                if (entry.bandSet !== null) {
                    gate.push(`from the ${bandSetLabel(entry.bandSet)} band (${bandSetGradeLabel(entry.bandSet, bands)})`);
                }
                const gateSkills = slotSkillsRequired(task, entry);
                if (gateSkills.length > 0) gate.push(`holding ${skillsPhrase(gateSkills)}`);

                warnings.push(
                    `Task ${task.name} needs ${labels.length} ${labels.length === 1 ? 'person' : 'people'} ${gate.length === 0 ? 'per day' : `${gate.join(' ')} per day`} (${labels.join(', ')}), but only ${qualified.length} ${qualified.length === 1 ? 'person qualifies' : 'people qualify'}, so some of those slots cannot be filled on any day.`,
                );
            }
        }
    }

    // --- the assignment loop --------------------------------------------------
    let totalDemand = 0;
    let totalCapacity = 0;
    /** The hours twin of `totalDemand`, for the structural warning at the end. */
    let totalDemandHours = 0;

    for (let week = 0; week < config.weeks; week += 1) {
        for (let offset = 0; offset < DAYS_PER_WEEK; offset += 1) {
            const date = addDays(start, week * DAYS_PER_WEEK + offset);
            const dateKey = toLocalDateKey(date);
            // Derived from the date itself, never from `offset`: post-mortem
            // B1 is exactly the bug of trusting a fixed offset to be a weekday.
            const weekday = date.getDay();

            // Weekly tasks answer "is today one of my weekdays?"; monthly ones ask
            // whether today is one of the occurrence dates resolved before the
            // loop. `recurrence` is checked FIRST and `days` is empty for those
            // tasks, so the two calendars can never both apply.
            const running = tasks.filter((task) => (
                task.recurrence === null
                    ? task.days.includes(weekday)
                    : occurrencesByTask.get(task.name).has(dateKey)
            ));
            if (running.length === 0) continue;

            dutiesByDate.set(dateKey, new Map());
            const dutiesOnDate = dutiesByDate.get(dateKey);
            hoursByDate.set(dateKey, new Map());
            const hoursOnDate = hoursByDate.get(dateKey);
            assignmentsByDate.set(dateKey, new Map());
            const assignmentsOnDate = assignmentsByDate.get(dateKey);
            // The generated week IS the Monday–Sunday window, so the loop's own
            // index is the bucket. Asserted by construction rather than derived
            // from the date, and pinned by a test that a Sunday duty lands in the
            // week its Monday opened.
            const hoursThisWeek = hoursByWeek[week];

            for (const task of running) totalDemand += perDayDemand(task);
            for (const person of staff) {
                if (!person.unavailable.has(dateKey)) totalCapacity += person.maxPerDay;
            }
            for (const task of running) totalDemandHours += perDayDemand(task) * task.hours;

            /**
             * taskName -> { onTaskToday, leads, coLeads, slotFills } for this date.
             *
             * `slotFills` is the multi-slot half and stays SEPARATE from
             * `leads`/`coLeads` rather than reusing them: a slot entry is neither
             * until the day's entries are all resolved and section 5 ranks them, and
             * pushing one into `leads` would make the continuity machinery, the
             * co-lead round-robin and the orphan guard all read a lead that does not
             * exist yet.
             */
            const dayState = new Map(
                running.map((task) => [
                    task.name,
                    { onTaskToday: new Set(), leads: [], coLeads: [], slotFills: [] },
                ]),
            );

            // `unfilled` is collected per day and emitted in READING order (lead
            // slots by task, then co-lead slots by task) rather than in the
            // scarcity order the slots were resolved in.
            const dayUnfilled = [];

            /**
             * taskName -> (incumbent name -> the rejection that stopped them, or
             * `null` for "nothing did"), captured at the moment a continuity lead
             * slot was decided. The only moment the engine knows WHY an incumbency
             * moved; the warning below is written from it.
             */
            const incumbentRejections = new Map();

            /**
             * Who could take this slot, the best of them, and — if nobody — the
             * tally the reason is written from.
             */
            const evaluateSlot = (slot) => {
                const { task, role } = slot;
                // MULTI-SLOT: which entry of `task.slots` this slot is, or `null`
                // for a lead or co-lead slot. Every gate, tally and reason string
                // below behaves exactly as it did before `slots` existed when it is
                // `null`, which is every slot of every task that does not use it.
                const entry = slot.entry === undefined ? null : slot.entry;
                const { onTaskToday } = dayState.get(task.name);

                // Continuity inverts the per-task tie-break, for this slot only.
                const continuityLead = task.continuity && role === 'lead';
                const compare = continuityLead ? compareContinuityCandidates : compareCandidates;

                // Whoever led the previous occurrence is watched through the loop
                // below, so that if the slot changes hands the warning can say
                // whether a constraint took it or fairness did.
                const incumbents = continuityLead && continuityHistory.has(task.name)
                    ? continuityHistory.get(task.name).leads
                    : null;
                const watched = incumbents === null ? null : new Map();

                const tally = {
                    [REJECT_SKILL]: 0,
                    [REJECT_BAND]: 0,
                    [REJECT_LEAVE]: 0,
                    [REJECT_ON_TASK]: 0,
                    [REJECT_CAPACITY]: 0,
                    [REJECT_DAILY_HOURS]: 0,
                    [REJECT_WEEKLY_HOURS]: 0,
                    [REJECT_PAIR]: 0,
                    [REJECT_CONSECUTIVE]: 0,
                };

                /**
                 * One readable sentence per person the HOURS gate turned away, in
                 * staff order. Built here, where the numbers that produced the
                 * rejection are still in hand, rather than reconstructed later
                 * from a tally that has thrown them away.
                 */
                const hoursDetail = [];

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
                        // A slot entry's own band and skill are counted here for the
                        // third time in the same argument: the principal entry of a
                        // weekend trio is the scarce one, and a scarcity measure
                        // blind to it would spend the department's only free
                        // principal on the ungated entry beside it and then report
                        // the principal slot as unstaffable — a shortage the engine
                        // manufactured.
                        entry,
                        dateKey,
                        date,
                        dutiesOnDate,
                        onTaskToday,
                        forbidMap,
                        dutiesByDate,
                        maxConsecutiveDays,
                        // And the hours gate is counted here for the same reason,
                        // one constraint later: an hours-tight slot must be
                        // recognised as the scarce one, or it loses its candidates
                        // to a slot anybody's remaining day could have absorbed.
                        hoursActive,
                        hoursOnDate,
                        hoursThisWeek,
                    });

                    if (watched !== null && incumbents.includes(person.name)) {
                        watched.set(person.name, rejection);
                    }

                    if (rejection === REJECT_DAILY_HOURS || rejection === REJECT_WEEKLY_HOURS) {
                        hoursDetail.push(hoursBreachClause({
                            person,
                            task,
                            kind: rejection,
                            dateKey,
                            weekStartKey: toLocalDateKey(addDays(start, week * DAYS_PER_WEEK)),
                            assignedToday: assignmentsOnDate.get(person.name) || [],
                            hoursToday: hoursOnDate.get(person.name) || 0,
                            hoursThisWeek: hoursThisWeek.get(person.name) || 0,
                        }));
                    }

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
                        // Read by `compareContinuityCandidates` only. Present on
                        // every candidate so there is one candidate shape.
                        taskLeads: leadsByTask.get(task.name).get(person.name) || 0,
                        // Read by `orderMultiSlotFills` only, and present here for
                        // the same reason `taskLeads` is: one candidate shape, and
                        // the snapshot the lead ranking reads is the snapshot the
                        // fairness comparator ranked.
                        gradeRank: person.gradeRank,
                    };
                    if (best === null || compare(candidate, best) < 0) {
                        best = candidate;
                    }
                }

                return { eligible, best, tally, watched, hoursDetail };
            };

            const assign = (slot, candidate) => {
                const { task } = slot;
                const state = dayState.get(task.name);
                // The whole candidate rather than only the name, because a
                // multi-slot shift's lead is ranked from the snapshot the engine
                // chose them on. Every other use is `candidate.name`, unchanged.
                const { name } = candidate;

                duties.set(name, duties.get(name) + 1);
                dutiesOnDate.set(name, (dutiesOnDate.get(name) || 0) + 1);

                // The hours ledger the gate reads. Kept up to date on EVERY
                // assignment, hours model or not, so that the two states cannot
                // drift apart depending on a flag — the flag decides whether the
                // gate consults them, not whether they are true.
                hoursOnDate.set(name, (hoursOnDate.get(name) || 0) + task.hours);
                hoursThisWeek.set(name, (hoursThisWeek.get(name) || 0) + task.hours);
                if (!assignmentsOnDate.has(name)) assignmentsOnDate.set(name, []);
                assignmentsOnDate.get(name).push({ task: task.name, hours: task.hours });

                const byTask = dutiesByTask.get(name);
                byTask.set(task.name, (byTask.get(task.name) || 0) + 1);

                state.onTaskToday.add(name);
                // `onTaskToday` above is also what stops one person taking two
                // entries of the same multi-slot shift: it is per task per day, and
                // `rejectionFor` reads it as `REJECT_ON_TASK` for every slot of any
                // kind. The trio rule needs no separate machinery.
                if (slot.role === MULTI_SLOT_ROLE) {
                    // Neither a lead nor a co-lead yet — see `dayState`. Section 5
                    // decides which of them is which once the day is resolved.
                    state.slotFills.push({ entry: slot.entry, candidate });
                } else if (slot.role === 'lead') {
                    state.leads.push(name);
                    const leadCounts = leadsByTask.get(task.name);
                    leadCounts.set(name, (leadCounts.get(name) || 0) + 1);
                } else {
                    state.coLeads.push(name);
                }
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

                    if (chosenEvaluation.watched !== null) {
                        // Merged rather than overwritten, so a task with two lead
                        // slots keeps the FIRST reason learned for each incumbent —
                        // the one measured before today's own assignments had
                        // consumed anybody's capacity.
                        const known = incumbentRejections.get(chosenSlot.task.name) || new Map();
                        for (const [name, rejection] of chosenEvaluation.watched) {
                            if (!known.has(name)) known.set(name, rejection);
                        }
                        incumbentRejections.set(chosenSlot.task.name, known);
                    }

                    if (chosenEvaluation.eligible === 0) {
                        dayUnfilled.push({
                            order: chosenSlot.order,
                            entry: {
                                date: dateKey,
                                task: chosenSlot.task.name,
                                // MULTI-SLOT: the entry's LABEL, so that a roster
                                // master reading three unfilled lines for one trio
                                // can tell which of the three failed. `'lead'` and
                                // `'coLead'` are unchanged for every other task.
                                role: chosenSlot.role === MULTI_SLOT_ROLE
                                    ? chosenSlot.entry.label
                                    : chosenSlot.role,
                                reason: describeEmptyPool({
                                    task: chosenSlot.task,
                                    role: chosenSlot.role,
                                    dateKey,
                                    tally: chosenEvaluation.tally,
                                    poolSize: staff.length,
                                    hoursDetail: chosenEvaluation.hoursDetail,
                                    entry: chosenSlot.role === MULTI_SLOT_ROLE ? chosenSlot.entry : null,
                                }),
                            },
                        });
                        continue;
                    }

                    assign(chosenSlot, chosenEvaluation.best);
                }
            };

            // --- phase 1: every lead slot on this day, scarcest first ---------
            //
            // And every SLOT ENTRY of every multi-slot task, in the same phase and
            // the same scarcity ordering: an entry is a staffing requirement that
            // stands on its own, not a co-lead hanging off somebody else's slot, so
            // it competes with the day's lead slots rather than queueing behind
            // them. Filling all of them together is also what lets a trio lose its
            // junior and keep its principal and senior.
            let order = 0;
            const leadSlots = [];
            for (const task of running) {
                if (task.slots !== null) {
                    for (const entry of task.slots) {
                        leadSlots.push({ task, role: MULTI_SLOT_ROLE, entry, order: order += 1 });
                    }
                    continue;
                }
                for (let i = 0; i < task.leads; i += 1) {
                    leadSlots.push({ task, role: 'lead', order: order += 1 });
                }
            }
            fillMostConstrainedFirst(leadSlots);

            // --- continuity: did an incumbency change hands today? -------------
            //
            // Runs between the phases because leads are final after phase 1 and
            // co-leads are irrelevant to continuity. An occurrence whose lead slot
            // went unfilled updates nothing: the incumbent stays the incumbent, the
            // gap is already in `unfilled`, and resuming afterwards is continuity
            // holding rather than breaking twice.
            for (const task of running) {
                if (!task.continuity) continue;

                const leads = [...dayState.get(task.name).leads];
                if (leads.length === 0) continue;

                const previous = continuityHistory.get(task.name);
                continuityHistory.set(task.name, { dateKey, leads });

                if (previous === undefined) continue;
                // The SAME predicate `scoreRoster` counts with, so the warnings and
                // `breakdown.continuityBreaks` can never disagree about whether
                // continuity held. `leads` keeps its roster order for the message.
                if (continuitySignature(previous.leads) === continuitySignature(leads)) continue;

                const known = incumbentRejections.get(task.name);
                const clauses = previous.leads
                    .filter((name) => !leads.includes(name))
                    .map((name) => {
                        const rejection = known ? known.get(name) : undefined;
                        const prose = rejection ? CONTINUITY_REJECTION_PROSE[rejection] : null;
                        // `null` means the incumbent WAS eligible and simply lost.
                        // Under the continuity comparator that can only happen to
                        // somebody a candidate had matched or passed on previous
                        // leads of this task — which is what the clause says, and no
                        // more. It is the sentence that answers "why did the clinic
                        // move when she was free that day?", and getting it wrong
                        // (calling a returning incumbency a "tie-break") would be
                        // worse than saying nothing.
                        return prose === null
                            ? `no constraint stopped ${name} that day; the slot went to somebody who had already led this task at least as often`
                            : `${name} ${prose}`;
                    });

                warnings.push(
                    `Continuity break: ${task.name} was led by ${previous.leads.join(' and ')} on ${previous.dateKey} but by ${leads.join(' and ')} on ${dateKey}${clauses.length === 0 ? '' : ` — ${clauses.join('; ')}`}.`,
                );
            }

            // --- phase 2: co-lead slots, scarcest first -----------------------
            //
            // A multi-slot task passes through both arms of this loop without
            // effect, and that is `normaliseTasks` forcing its `coLeads` to 0
            // rather than a special case here: it has no lead, so it takes the
            // orphan arm, and it asks for no co-leads, so the arm's loop runs zero
            // times. Every entry it needed was filled in phase 1.
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

                // MULTI-SLOT: ONE shift object holding every entry that filled —
                // which is the whole point, since the department's rule is that the
                // three of them are on the same shift. The lead is the highest grade
                // present and `coLead` the next (section 5), so `staff`,
                // `buildShiftStaffLabel` and every consumer of the two-name shape
                // keep working; `assignees` carries the full team in the same order.
                //
                // A shift is emitted for a PARTIALLY filled trio: two of three
                // staffed is a real shift plus one `unfilled` entry naming the third,
                // not a cancelled day. If NO entry filled there is no shift at all,
                // which is the same convention the lead-less branch below follows.
                if (task.slots !== null) {
                    if (state.slotFills.length === 0) continue;

                    const assignees = orderMultiSlotFills(state.slotFills)
                        .map((fill) => fill.candidate.name);
                    const [lead] = assignees;
                    const coLead = assignees.length > 1 ? assignees[1] : undefined;

                    const shift = {
                        task: task.name,
                        lead,
                        ...(coLead === undefined ? {} : { coLead }),
                        staff: buildShiftStaffLabel(lead, coLead),
                        category: task.category,
                        week: week + 1,
                        assignees,
                    };

                    if (!roster[dateKey]) roster[dateKey] = [];
                    roster[dateKey].push(shift);
                    continue;
                }

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

    if (hoursActive) {
        // The hours twin of the duty-slot warning above, and a sharper instrument:
        // a department can have enough BODIES for every slot and still be asking
        // for more hours than its contracts hold, which is the whole reason this
        // model exists. Measured against contracted weeks × FTE × weeks generated,
        // which is the same ceiling the hard weekly gate enforces — leave alone
        // by how much any one week is over, which `unfilled` already says.
        const totalContractedHours = staff.reduce(
            (sum, person) => sum + person.weeklyHoursCap * config.weeks,
            0,
        );
        if (totalDemandHours > totalContractedHours + HOURS_EPSILON) {
            warnings.push(
                `This configuration asks for ${formatHours(totalDemandHours)} of work but the team's contracted hours across ${config.weeks} ${config.weeks === 1 ? 'week' : 'weeks'} total ${formatHours(totalContractedHours)}, so some slots cannot be filled.`,
            );
        }
    }

    // --- the rolling four-week total: MEASURED AND WARNED, NEVER ENFORCED ------
    //
    // The field research carries the Singapore Medical Council's four-week-cycle
    // ceiling, and enforcing a rolling window is deliberately deferred — a rolling
    // gate has to decide what to do about hours already committed earlier in the
    // window, which is a scheduling policy nobody has been asked about yet.
    //
    // Every 28-day window that fits inside the run, one per start date, NOT four
    // whole weeks: the weekly cap is already hard, so four whole weeks can never
    // sum above four times it and a bucketed check could not fire at all. A window
    // straddling the seam between two capped weeks can, and does.
    //
    // A run shorter than 28 days has no window and therefore no warning. That is
    // stated here and in the ledger, because a silent absence of warnings is the
    // one thing this engine must never be mistaken for.
    if (hoursActive) {
        const runDays = config.weeks * DAYS_PER_WEEK;
        const windowDays = ROLLING_WINDOW_WEEKS * DAYS_PER_WEEK;

        if (runDays >= windowDays) {
            const dayKeys = Array.from({ length: runDays }, (_, i) => toLocalDateKey(addDays(start, i)));

            for (const person of staff) {
                const ceiling = person.weeklyHoursCap * ROLLING_WINDOW_WEEKS;
                const daily = dayKeys.map((key) => (hoursByDate.get(key)?.get(person.name)) || 0);

                let worst = null;
                for (let from = 0; from + windowDays <= runDays; from += 1) {
                    let total = 0;
                    for (let i = from; i < from + windowDays; i += 1) total += daily[i];
                    // Strictly greater, so the first of several equal peaks is the
                    // one reported — deterministic, and the earliest window is the
                    // one a roster master would look at first.
                    if (worst === null || total > worst.total + HOURS_EPSILON) {
                        worst = { total, from };
                    }
                }

                if (worst !== null && worst.total > ceiling + HOURS_EPSILON) {
                    warnings.push(
                        `${person.name} is rostered ${formatHours(worst.total)} in the ${windowDays} days from ${dayKeys[worst.from]} to ${dayKeys[worst.from + windowDays - 1]}, above the ${formatHours(ceiling)} a ${formatHours(person.contractedWeeklyHours)} week at ${person.fte} FTE implies over ${ROLLING_WINDOW_WEEKS} weeks. Every individual week is inside its limit — this is the rolling total, which this engine reports and does not enforce.`,
                    );
                }
            }
        }
    }

    // --- load -----------------------------------------------------------------
    const totalDuties = [...duties.values()].reduce((sum, n) => sum + n, 0);
    const load = {};
    for (const person of staff) {
        const count = duties.get(person.name);
        // One figure per generated week, index i being the week `shift.week === i+1`
        // names, summed from the same per-week maps the hard gate used — so a
        // roster master comparing `hoursPerWeek[0]` against `weeklyCap` is reading
        // the very numbers the engine refused a slot over, not a recomputation of
        // them that could disagree.
        const weeklyRaw = hoursByWeek.map((week) => week.get(person.name) || 0);
        const hoursPerWeek = weeklyRaw.map(round2);
        // Summed from the RAW weekly figures and rounded once, not from the rounded
        // ones: `hours` has to equal the roster's total assigned hours, and adding
        // up 52 separately-rounded weeks would let a fraction of an hour appear out
        // of nowhere in the annual figure.
        const totalHours = round2(weeklyRaw.reduce((sum, n) => sum + n, 0));

        load[person.name] = {
            duties: count,
            fte: person.fte,
            weighted: round2(count / person.fte),
            // Rounded to two places to match the documented contract. For a
            // very large pool the figure is coarse and the shares will not sum
            // to exactly 1; `duties` is the exact number.
            share: totalDuties === 0 ? 0 : round2(count / totalDuties),
            // Present only when the configuration asked for hours, exactly as
            // `score.breakdown.hoursImbalance` is: a department that has never
            // heard of hours reads the `load` entry it has always read.
            ...(hoursActive ? {
                hours: totalHours,
                hoursPerWeek,
                weeklyCap: round2(person.weeklyHoursCap),
            } : {}),
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

// --- 9. THE HOURS MODEL'S LIMITS LEDGER --------------------------------------
//
// What a roster master can still type and get a surprising or wrong roster from,
// in the same spirit as the header's other ledgers: measured where it says
// measured, and flagged where a judgment call was made rather than a fact found.
// Every item here is a real behaviour of the code above, not a hypothetical.
//
//  1. THE MODEL IS OFF UNTIL YOU MENTION IT. A department that sets
//     `maxPerDay: 4` and no hours field gets four 4-hour sessions — a 16-hour day
//     — with no hours warning, because nothing asked for hours. The four fields
//     that switch it on are `task.hours`, `staff.weeklyHours`,
//     `staff.maxHoursPerDay` and `rules.weeklyHours` / `rules.maxHoursPerDay`;
//     `rules: { weeklyHours: 42 }` is the cheapest way to say "hours matter", and
//     it costs nothing because 42 is also the default. THIS IS THE BIGGEST
//     JUDGMENT CALL IN THE MODEL and it was made for the byte-identity rule: an
//     always-on model changes the roster of every existing configuration whose
//     `maxPerDay` is above 2. Flagged for the roster owner: if the answer is
//     "hours should always apply", the change is to make `hoursModelRequested`
//     return `true` and to accept that some existing rosters move.
//  2. FAIRNESS IS STILL COUNTED IN DUTIES, NOT HOURS. Give one clinician the 6-hour
//     clinics and another the 2-hour reviews and the engine will call that fair —
//     `loadImbalance` 0, `hoursImbalance` large. The number is reported; the
//     comparator is unchanged. An hours-weighted comparator is the obvious next
//     piece of work and it changes who gets every duty, so it is not smuggled in
//     here.
//  3. A PART-TIMER'S DAY DOES NOT DIVIDE. 0.6 FTE on the shipped defaults is a
//     5.04-hour day, which holds ONE 4-hour session and wastes 1.04 hours — so a
//     0.6-FTE colleague gets 50% of a full-timer's sessions, not 60%, even though
//     their weekly ceiling is exactly 60%. Measured: 5 duties against 10 over one
//     week. Sessions are indivisible and the engine will not split one.
//  4. `weeklyHours` AND `fte` MULTIPLY. `{ weeklyHours: 21, fte: 0.5 }` is a
//     10.5-hour week, not a 21-hour one. Two ways of saying "half time" applied at
//     once is almost certainly a mistake, and the engine does not detect it.
//  5. A PERSONAL WEEK DOES NOT IMPLY A PERSONAL DAY. `weeklyHours: 21` alone
//     leaves the 8.4-hour daily cap in place (deliberate — three full days is a
//     real arrangement). Somebody who wanted 4.2-hour days has to say
//     `maxHoursPerDay: 4.2` as well.
//  6. THE FOUR-WEEK TOTAL IS A WARNING AND NOTHING ELSE. It fires only when a
//     28-day window actually exceeds the ceiling, it needs a run of at least 28
//     days to have a window at all, and a 3-week generation therefore cannot fire
//     it however heavy the weeks are. It also cannot see across generation runs,
//     so four separate one-month runs each report nothing.
//  7. THE WEEKLY WINDOW IS THE GENERATED WEEK. Hours worked in a previously
//     generated block are invisible, exactly as `consecutiveRunBefore`'s days are.
//     Generate a month at a time and the 42-hour cap restarts at each run — a lab
//     scientist can finish one run having worked Saturday and open the next one on
//     Sunday with a full week's allowance.
//  8. `hoursImbalance`'s WEIGHT (0.25) IS UNCALIBRATED, like the other five, and
//     it lives in a SEPARATE frozen table (`HOURS_SOFT_PENALTY_WEIGHTS`) only
//     because two compatibility pins hold `SOFT_PENALTY_WEIGHTS`' exact shape. The
//     tables want merging; see the comment on the overlay.
//  9. AN UNFILLED REASON NAMES AT MOST THREE HOURS-BLOCKED PEOPLE
//     (`HOURS_DETAIL_LIMIT`) and then says how many more there were. The others
//     are recoverable from `load.hoursPerWeek`, but they are not in the sentence.
// 10. A SHIFT WHOSE TASK IS NOT IN THE CONFIGURATION CONTRIBUTES NO HOURS to the
//     audit or the score. Nothing the engine builds can do that; a roster edited
//     by hand or by a future swap tool can, and its hours would silently not
//     count. The shape itself is already reported by the availability rule.
// 11. `load.hours` AND THE SUM OF `load.hoursPerWeek` CAN DISAGREE, in the last
//     hundredth of an hour, for a duration with more than two decimal places.
//     `hours` is the roster's real total rounded ONCE; `hoursPerWeek` is each week
//     rounded for display. Measured: four duties of 1.125h give `hours: 4.5` and
//     weeks of `1.13` that add to 4.52. `hours` is the authoritative figure. No
//     duration anybody will type has this property, and the alternative — a total
//     that is the sum of rounded weeks — would report hours nobody worked.
// 12. HOURS ARE NOT TIMES. A 4-hour task has no start time, so two 4-hour duties
//     on one day are 8 hours of work and NOT a statement that they do not
//     overlap. Continuous-duty limits, rest between duties and any notion of a
//     shift clashing with another in the clock sense remain outside this engine.

// --- 10. MULTI-SLOT SHIFTS' LIMITS LEDGER ------------------------------------
//
// The same ledger, for the feature above: what a roster master can type today and
// get a surprising or wrong roster from. Measured where it says measured, and
// FLAGGED where a judgment call was made rather than a fact found, because a
// judgment call buried in a comment is a decision nobody made.
//
//  1. ONLY TWO OF THE TEAM ARE VISIBLE OUTSIDE `assignees`. THIS IS THE BIGGEST
//     JUDGMENT CALL IN THE FEATURE and it was the decided design: `staff` is
//     `buildShiftStaffLabel(lead, coLead)`, so the embryologists' trio reads
//     `Lead: Priya, Co: Sanjay` and the JUNIOR APPEARS NOWHERE — not in the
//     calendar cell, not in the CSV, not in the ICS `SUMMARY`. Everybody is in
//     `assignees`, and every consumer that reads it (this engine's audit and
//     `measureRosterLoad`) sees all three. The compatibility was the point — one
//     definition of the display string, post-mortem A-RC1 — but the cost lands on
//     the person least likely to be reading the JSON. → FLAGGED FOR THE ROSTER
//     OWNER: a third name needs either a new display convention
//     (`Lead: X, Co: Y, +1`) or a shift-detail view, and both are UI work outside
//     this file.
//  2. THE SWAP FLOW CAN ONLY MOVE THE FIRST TWO. `swapRole` is `'lead' | 'coLead'`
//     (`auraEngine.js`), so a trio's third assignee has no role to swap and no way
//     to arrange cover through the app. Nothing breaks — the shift shape is exactly
//     what the swap code expects — but the junior's duty is not swappable.
//     Consequence of item 1, and the same fix closes it.
//  3. THE SANDBOX PANEL'S ROLE CHIP READS "UNKNOWN DUTY" for a multi-slot unfilled
//     entry. `unfilled[].role` carries the SLOT LABEL (`'Junior embryologist'`),
//     which is the whole point of the label, but `RosterView` renders that field
//     through `describeShiftRole`, which knows only `lead` and `coLead`. The reason
//     string beneath it names the slot correctly. → One line of UI, deliberately
//     not taken here: this change touches the engine only.
//  4. A SLOT'S BAND IS ONE BAND. `{ band: 'senior' }` cannot be widened to
//     "senior or principal"; leaving the band off means ANY grade, including an
//     unrecorded one. So "a second senior, or a principal if no senior is free" is
//     not expressible — and expressing it as two tasks changes which shift the two
//     people are on, which is the thing this feature exists to control.
//  5. `slots` REFUSES `leadBands` AND `continuity`, and both refusals are JUDGMENT
//     CALLS rather than facts. `leadBands` gates a configured lead slot that no
//     longer exists, and `continuity` follows one; the alternatives were to gate
//     the DERIVED lead after the fact (which can only be satisfied by unfilling
//     slots the engine already staffed — a fallback this engine refuses to invent)
//     or to let both fields quietly do nothing. Refusing is the least surprising of
//     the three, and it is reversible. → Flagged for review: a department that
//     wants "the same principal on the weekend trio every week" is asking for
//     continuity over a multi-slot shift, and today the answer is no.
//  6. THE LEAD IS THE HIGHEST GRADE, NOT THE MOST SENIOR PERSON. Grade is what the
//     engine has. Two AH15s where the department knows perfectly well which one
//     runs the weekend are a TIE, settled by FTE-weighted fairness and then by
//     name — so the lead of an all-equal-grade shift ROTATES between people day to
//     day (measured: a three-person pool over five days produced three different
//     leads). Deterministic, and probably not what a department that wants a named
//     shift leader expects.
//  7. WHERE GRADES TIE, THE LEAST LOADED PERSON LEADS — which is not always the
//     one you would expect. The tie-break is `compareCandidates`, the engine's
//     FTE-weighted fairness comparator, read from the candidate snapshot taken at
//     the moment each person was chosen. MEASURED: a two-entry shift whose scarce
//     entry only Zoe can fill, on a Saturday where Zoe already holds 5 weekday
//     duties and Ann holds none, is led by ANN — the specialist is seated first and
//     still sorts second, because fairness outranks the order the slots happened to
//     be filled in. Deterministic, pinned by test, and defensible; also the single
//     most surprising consequence of "ties break by the existing tie-break order".
//     → Flagged: a department that means "the scarce qualification leads" is
//     asking for a different rule, and the entry it holds is the place to say so
//     once somebody decides what that rule is.
//  8. AN UNGRADED ASSIGNEE CAN STILL END UP LEADING — when they are the only
//     person on the shift, or when everybody on it is ungraded. The rule is that
//     they never OUTRANK a graded colleague, not that they never lead. A department
//     with no grades recorded at all gets multi-slot shifts led by fairness order.
//  9. NO CROSS-ENTRY EXCLUSION. Two entries that both accept seniors may both be
//     filled by seniors, and the roster is then a shift of two seniors with no
//     junior — legal, because that is what the configuration asked for. What is
//     forbidden is only the same PERSON twice.
// 10. MORE SLOTS THAN PEOPLE IS LEGAL. `slots` of any length is accepted; a
//     five-slot task in a two-person department produces three `unfilled` entries
//     every single date, plus the demand-versus-capacity warning. Nothing refuses
//     it, because "you have listed more slots than you have staff" is sometimes
//     exactly the fact a roster master wants to see priced.
// 11. FAIRNESS IS STILL ONE GLOBAL POOL. `score.breakdown.taskRepetition` judges a
//     multi-slot task's counts against everybody ELIGIBLE FOR THE TASK — the skill
//     holders, or the whole pool — and NOT against the people eligible for the
//     particular entry they filled. So a department with one principal is charged
//     repetition for that principal appearing on every trio, exactly as the
//     `leadBands` ledger already documents for lead slots. `softPenalty` stays
//     comparable between two staffings of the same configuration; it is not
//     comparable between a slotted and an unslotted version of the same
//     department.
// 12. THE AUDIT BLAMES THE LATER NAME. When a shift holds more people than its
//     slots can absorb, `unmatchableAssignees` walks `assignees` in order, so the
//     violation names whoever could not be seated LAST rather than whoever is
//     "wrong". Deterministic, and it is a report of a shape problem rather than an
//     accusation about a person.
// 13. A HAND-EDITED SHIFT CAN HOLD A LEAD WHO FILLS NO SLOT. The two audit rules
//     are independent: `slotGate` says everybody can be seated, `leadGrade` says
//     nobody outranks the lead. A roster that fails both reports both, and neither
//     rule repairs anything — this engine reports, and construction is where
//     correctness is enforced.
// 14. `role` IS A LABEL AND NOTHING ELSE. It is trimmed, it is never matched
//     against a staff member, a skill or a grade, and two entries may carry the
//     same one (they are then numbered in `unfilled`). Naming an entry
//     `'Principal embryologist'` does NOT make it principal-only; `band` does.
// 15. EVERY SLOT ENTRY OUTRANKS EVERY CO-LEAD SLOT IN THE DAY, because entries are
//     filled in phase 1 and co-leads in phase 2. MEASURED: two people, a
//     lead-plus-co-lead clinic and a two-entry trio, one duty each — the clinic's
//     LEAD and the trio's FIRST entry are staffed, and the trio's second entry and
//     the clinic's CO-LEAD both go unfilled. A department that would rather have a
//     staffed co-lead than a third person on the trio cannot say so today. Pinned
//     by test so the decision is visible rather than emergent.
// 16. THERE IS NO WIZARD FOR ANY OF THIS. `slots` is engine-only: the sandbox's
//     task table writes `days`, `leadBands` and a co-lead toggle, so a roster
//     master cannot configure a trio from the UI, and `DEMO_EXAMPLE_DEPARTMENT`
//     does not use one. Until that lands, the feature is reachable only from code.
