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
//   7. A TASK'S CALENDAR IS ONE PATTERN, AND `days` / `recurrence` ARE TWO
//      SUGARS OVER IT. `days` repeats a task on given weekdays every week;
//      `recurrence: { ordinal, weekday }` repeats it on the nth (or last) given
//      weekday of every calendar month. THOSE TWO FIELDS remain mutually exclusive
//      per task and validation refuses a task carrying both, because there is no
//      reading of "every Wednesday AND the 3rd Wednesday" that is not one of the
//      two with extra words. What is new since v1.9.0 is that neither is a
//      MECHANISM: both compile to a TEMPORAL PATTERN (section 1b), the day loop
//      asks one question of every task — is today one of your dates? — and the
//      occurrence dates are derived ONCE, from `temporalOccurrences`, so the day
//      loop and a future preview UI cannot disagree about when anything runs.
//      A task may also carry the pattern DIRECTLY, as `temporal`, which is how
//      "the 1st AND the 3rd Wednesday", "alternate weeks", "these four dates" and
//      "only between these two dates" are expressible today. That field is
//      VALIDATED like every other (section 2) and has no wizard — see rule 11.
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
//  11. THE NAMED FEATURES ARE INSTANCES OF SIX PRIMITIVES, AND THE ENGINE READS
//      ONLY THE PRIMITIVES. Rules 1–10 were built one profession at a time, and by
//      the sixth the engine carried one named flag per profession: `days`,
//      `recurrence`, `continuity`, `leadBands`, `requiresSkill`, `slots`, `hours`,
//      `forbidPairs`, `maxConsecutiveDays`, `maxPerDay`. The seventh profession
//      would have wanted a seventh code change. It does not, because every one of
//      those fields is now SUGAR that `normaliseTasks` compiles down:
//
//        TEMPORAL     (1b) when does this occur. `days` and `recurrence` are two
//                     patterns; a pattern is a UNION OF CLAUSES over a bounded
//                     window, and the clause kinds are weekly (with an `every`/
//                     `offset` cadence), monthly (with a LIST of ordinals) and an
//                     explicit date list.
//        ELIGIBILITY  (0e) may this person fill this position. `requiresSkill` and
//                     `leadBands` are two REQUIREMENT KINDS combined by AND. The
//                     kinds are a table; a third is a row, and the candidate loop
//                     does not change. THE THIRD ROW IS NOW WRITTEN — a COHORT
//                     WINDOW (rule 12) — and the candidate loop did not change,
//                     which is the claim this table existed to make good on.
//        CAPACITY     (1c) how much of a METER may one person hold over a PERIOD.
//                     `maxPerDay`, `maxConcurrentPerDay`, "already on this task
//                     today", `maxConsecutiveDays` and the two hours caps are five
//                     rows of one table.
//        AFFINITY     (1d) pairwise and cross-occurrence preferences WITH POLARITY.
//                     `forbidPairs` is pair/forbid; `continuity` is
//                     occurrence/prefer. `require` (must-pair-with) and `avoid`
//                     (rotate-away) are DECLARED and unimplemented, so they are a
//                     polarity a later agent fills in rather than a seventh flag.
//        STRUCTURE    (0f) a shift is a LIST OF POSITIONS. `leads`/`coLeads` and
//                     `slots` both compile to positions, and how filled positions
//                     become shift objects is a COMPOSITION chosen from a table.
//        QUOTA        (1e) how many occurrences of a CLASS OF WORK one person takes
//                     over a PERIOD, as a FLOOR and/or a CEILING. `task.quota` and
//                     `rules.quotas` are the two sugars. IMPLEMENTED as of rule 12
//                     below — this bullet said "declared, not enforced" for one
//                     release and the sentence that said so has been deleted rather
//                     than adapted, because a warning claiming quotas were ignored
//                     would now be false.
//
//      ZERO BEHAVIOUR CHANGE WAS THE BAR, and it is measured rather than claimed:
//      1213 tests untouched, and `generateRosterV2`, `validateRosterV2Config`,
//      `scoreRoster`, `auditHardConstraints` and `measureRosterLoad` compared
//      JSON-for-JSON against the pre-refactor engine over 30 configurations
//      spanning every named feature and 90 invalid ones for refusal-string
//      identity. The one intentionally ADDITIVE surface is the `temporal` field of
//      rule 7 — no configuration in the repository carries it, so nothing moved.
//      The honest cost, and every judgment call, is in section 11's ledger.
//  12. THE FIRST FLOOR, AND THE FIRST GATE THAT KNOWS WHAT MONTH IT IS. Rules 1–11
//      are, without exception, CEILINGS and standing facts: nobody may exceed a cap,
//      hold a duty they are not qualified for, or work a day they are away. Two field
//      interviews asked for neither.
//
//      QUOTAS (1e). "Each staff member works at least two Saturdays per month" was
//      inexpressible. It is now `quota: { per, min, max, scope }` on a task, or
//      `rules.quotas: [{ category, … }]` over a class of them. A `max` is HARD and is
//      a CAPACITY LIMIT of exactly section 1c's shape, built per quota because a
//      configuration may declare several; a slot that would breach one is `unfilled`
//      naming the quota, the period and the count. A `min` CANNOT be hard, and that is
//      the whole difficulty rather than a shortcut: a ceiling is answerable when a slot
//      is offered, a floor is only knowable when the period is FULL, and refusing a
//      slot to protect somebody else's minimum would leave the slot EMPTY. So a floor
//      does the only two honest things available to it — it PREFERS whoever is furthest
//      behind, ahead of FTE-weighted fairness and ahead of continuity (section 5's
//      comparator chain, with the precedence decided and warned about), and then it
//      MEASURES the finished roster and NAMES every shortfall by person, class, period
//      and amount. An ARITHMETICALLY IMPOSSIBLE floor — five people needing two
//      Saturdays each in a month holding four — is a VALIDATION REFUSAL with the
//      arithmetic shown, in the same voice as the unknown-skill refusal.
//
//      COHORT WINDOWS (0e(ii)). The embryologists' teams A/B/C each take a four-month
//      block of weekend duty; the same shape is a rotation, a secondment, a student
//      placement, a six-week locum. `staff.windows: [{ from, to, tasks, label }]` bounds
//      a person's eligibility in time, as a UNION: with windows, they may fill (task,
//      date) if SOME window admits both. No windows means always eligible, so the
//      feature is ADDITIVE. It is NOT a branch in the day loop — it is the third
//      ELIGIBILITY KIND, which is why it reaches the candidate gate, the scarcity
//      ordering, the `unfilled` prose and the read-back audit without any of them
//      learning the word "cohort".
//
//      BOTH ARE MEASURED, NOT ASSERTED: the ceiling has a `HARD_RULE_QUOTA_MAX`
//      read-back rule and the window a `HARD_RULE_WINDOW` one, both computed off the
//      finished roster, and the floor report is written from the same
//      `measureQuotaCounts` the ceiling audit uses. Section 12's ledger has the costs
//      and every judgment call.
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
// Added by the psychology pack, and equally deliberate — WITH ONE ITEM NOW
// SUPERSEDED, left visible rather than quietly deleted because a header that
// rewrites its own history is worth less than one that dates itself. The
// psychology pack said: "ONE recurrence pattern per task — no 'every second
// Wednesday', no 'the 1st AND 3rd Wednesday' (configure two tasks, or wait for a
// `recurrence` that takes a list)". SUPERSEDED by the primitive layer: the engine
// expresses all three through `temporal` and there is a test driving each of them
// through `generateRosterV2`. What is still missing is a FIELD A ROSTER MASTER CAN
// TYPE — `recurrence` still takes exactly one ordinal, and the wizard writes only
// `days` — so the limitation is now a UI one and is recorded as such in section 11.
// Still true and still deliberate: no cross-run
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

// --- 0b. THE SCALE PRIMITIVE: AN ORDERED SCALE WITH NAMED REGIONS -------------
//
// A department's seniority ladder is TWO facts and no more: an ORDERED LIST OF
// RANKS, and a set of NAMED REGIONS that partition it. The allied-health scale
// AH7 (entry) → AH17 (head), cut into junior / senior / principal, is ONE
// INSTANCE of that. Nursing bands differently, doctors run MO → Registrar →
// Consultant, a two-tier team has two regions and a flat team has one; none of
// those is a different mechanism, only a different instance.
//
// So this section owns the MECHANISM — `defineGradeScale`, `rankOfGrade`,
// `regionOfRank`, `validateScaleRegions` — and then declares the allied-health
// instance beneath it. `GRADE_SCALE`, `DEFAULT_GRADE_BANDS`, `bandOfGrade` and
// `validateGradeBands` are that instance's four public faces, unchanged in name,
// signature, return value and refusal wording, because `rosterWizard.js`,
// `RosterDemoWizardTables.jsx` and 149 tests read them.
//
// WHAT A SCALE OWNS, and why each piece has to be the scale's rather than this
// file's:
//
//   firstRank / rankCount   The ordinals. Regions are declared as inclusive
//                           `[min, max]` ORDINAL pairs, so `{ junior: [7, 12] }`
//                           is the AH scale's ordinals and not a magic number.
//   labelOfRank             Ordinal -> the label a human reads (`13` -> `'AH13'`).
//   parseRank               THE SCALE'S OWN LEXICON, and the reason this is a
//                           function rather than a lookup over `labels`: the
//                           allied-health scale accepts `'ah13'`, `' AH13 '` AND
//                           `'AH07'` (a padded number — pinned by a test), which
//                           no label-set match would ever produce. A scale whose
//                           labels are words supplies a label matcher instead.
//   regions                 The DEFAULT cut, lowest region first. `Object.keys`
//                           of it is the region order, so there is one definition
//                           of "the regions, in order" for a caller to read.
//   prose                   The nouns the refusal sentences are built from
//                           (`band`, `grade`, `unbanded`, …). Refusals are read
//                           verbatim by a roster master, so the words are DATA
//                           and not string literals scattered through a
//                           validator that knows only one profession.
//
// WHY THE PARTITION IS ENFORCED RATHER THAN TOLERATED. The regions must cover
// the scale exactly, with no gap and no overlap. A gap is the dangerous case: a
// rank that falls into one would be in NO region, and therefore silently
// ineligible to lead every region-restricted task in the department — a roster
// with unfilled slots and no obvious cause. That is the class of failure this
// engine exists to refuse, so `validateScaleRegions` rejects it at configure time
// with a reason naming the unbanded ranks.
//
// ABSENT IS NOT ZERO. A staff member with no `grade` is not the bottom rank;
// their rank is UNKNOWN. They therefore fail every region gate (membership cannot
// be verified) and remain fully eligible for everything that is not region-gated,
// including co-leading a region-gated task. `generateRosterV2` warns, by name,
// when that situation is actually load-bearing.
//
// NOT YET REACHABLE FROM A CONFIGURATION, and that is deliberate: `rules` carries
// `bands` (a region cut for the allied-health scale) and no `scale` key, so every
// roster this engine generates today is judged against `ALLIED_HEALTH_SCALE`.
// Exposing a second scale through `rules` is additive, needs its own refusal
// wording and its own tests, and is the next agent's step —
// `resolveGradeScale` below is the one seam it has to open.

/** Zero to twelve as words, for the prose that has to count regions. */
const COUNT_WORDS = Object.freeze([
    'zero', 'one', 'two', 'three', 'four', 'five', 'six',
    'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
]);

/** `3` -> `'three'`; anything past the table -> the digits, which still reads. */
const countWord = (n) =>
    (Number.isInteger(n) && n >= 0 && n < COUNT_WORDS.length ? COUNT_WORDS[n] : String(n));

/**
 * `['a','b','c']` -> `'the three regions are a, b and c'`-shaped fragments, in the
 * two grammars the refusals need. Split out because "all two of" and "the one
 * bands are" are the sentences a two-region or one-region scale would otherwise
 * get, and a refusal a roster master cannot read is a refusal that gets ignored.
 */
const areAllOf = (names, noun, nounPlural) => (names.length === 1
    ? `the ${countWord(1)} ${noun} is ${names[0]}`
    : `the ${countWord(names.length)} ${nounPlural} are ${joinWithAnd(names)}`);

const mustAllBeGiven = (names) => {
    if (names.length === 1) return names[0];
    if (names.length === 2) return `both of ${joinWithAnd(names)}`;
    return `all ${countWord(names.length)} of ${joinWithAnd(names)}`;
};

/** `['a','b','c']` -> `'a, b and c'`; one item -> itself; none -> `''`. */
const joinWithAnd = (items) => {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
};

/**
 * Declare a seniority scale. Pure, frozen, and the ONLY way a scale is made — so
 * every scale in this engine carries the same fields and the validator never has
 * to ask which profession it is looking at.
 *
 * `regions` is an object in LOWEST-FIRST order; its `Object.keys` becomes
 * `regionOrder`, and it is deep-frozen so that a UI holding the default cut
 * cannot edit the department's policy by mutating an array it was handed.
 */
export const defineGradeScale = ({
    id,
    firstRank,
    rankCount,
    labelOfRank,
    parseRank,
    regions,
    prose,
}) => {
    const lastRank = firstRank + rankCount - 1;
    const regionOrder = Object.freeze(Object.keys(regions));
    const defaultRegions = Object.freeze(Object.fromEntries(
        regionOrder.map((name) => [name, Object.freeze([regions[name][0], regions[name][1]])]),
    ));

    return Object.freeze({
        id,
        firstRank,
        lastRank,
        rankCount,
        /** `'AH7' … 'AH17'`, in scale order. A UI's dropdown, and the valid set. */
        labels: Object.freeze(Array.from({ length: rankCount }, (_, i) => labelOfRank(firstRank + i))),
        labelOfRank,
        parseRank,
        regionOrder,
        defaultRegions,
        /**
         * The rank an unrecorded grade sorts at: STRICTLY BELOW the bottom of the
         * scale, so a graded colleague always outranks an ungraded one and a team
         * shift's lead is never somebody whose rank the department has not
         * recorded. `-Infinity` would have been the obvious sentinel and is a
         * trap: two ungraded people would compare `-Infinity - -Infinity` = `NaN`,
         * and a comparator returning `NaN` sorts arbitrarily — the one thing this
         * engine may not do.
         */
        unknownRank: firstRank - 1,
        /** `'AH7–AH17'`, for the sentence that has to name the whole scale. */
        span: `${labelOfRank(firstRank)}–${labelOfRank(lastRank)}`,
        prose: Object.freeze({ ...prose }),
    });
};

/**
 * Any accepted spelling of a rank -> its ordinal, or `null`. The scale's own
 * lexicon, so `'AH07'` and `'ah13'` are the allied-health scale's business and
 * not this function's.
 */
const rankOfGrade = (value, scale) => scale.parseRank(value);

/** Any accepted spelling -> the canonical label, or `null`. */
const canonicalGrade = (value, scale) => {
    const rank = rankOfGrade(value, scale);
    return rank === null ? null : scale.labelOfRank(rank);
};

/** Which region does ORDINAL `n` sit in? Assumes `regions` already validated. */
export const regionOfRank = (n, regions, scale) => {
    for (const name of scale.regionOrder) {
        const range = regions[name];
        if (!Array.isArray(range)) continue;
        if (n >= range[0] && n <= range[1]) return name;
    }
    return null;
};

/**
 * Are these region boundaries usable? `{ valid, reason }`, same contract as
 * `validateRosterV2Config`, so a UI can show `reason` verbatim.
 *
 * Requires every region the scale names, each an inclusive `[min, max]` of whole
 * ordinals on the scale, together partitioning it: the lowest region starts at
 * the bottom, the highest ends at the top, every min <= max, and each region
 * starts exactly one rank above where the one below it ended.
 *
 * Every sentence is built from the scale's `prose` nouns and its own labels, so
 * a two-tier nursing scale is refused in its own words rather than in
 * allied health's.
 */
export const validateScaleRegions = (regions, scale) => {
    const invalid = (reason) => ({ valid: false, reason });
    const { regionOrder, defaultRegions, firstRank, lastRank } = scale;
    const { subject, subjectPlural, regionNoun, regionNounPlural, rankNoun, rankNounPlural, unassigned } = scale.prose;
    const total = regionOrder.length;
    const lowest = regionOrder[0];
    const highest = regionOrder[total - 1];

    if (!isPlainObject(regions)) {
        const shape = regionOrder
            .map((name) => `${name}: [${defaultRegions[name][0]}, ${defaultRegions[name][1]}]`)
            .join(', ');
        return invalid(`${subjectPlural} must be an object of the form { ${shape} }.`);
    }

    for (const key of Object.keys(regions)) {
        if (!regionOrder.includes(key)) {
            return invalid(`${subjectPlural} include an unknown ${regionNoun} ${JSON.stringify(key)} — ${areAllOf([...regionOrder], regionNoun, regionNounPlural)}.`);
        }
    }
    for (const name of regionOrder) {
        if (regions[name] === undefined) {
            return invalid(`${subjectPlural} are missing the ${name} ${regionNoun} — ${mustAllBeGiven([...regionOrder])} must be given, so that every ${rankNoun} lands in exactly one.`);
        }
    }

    const range = {};
    for (const name of regionOrder) {
        const value = regions[name];
        if (!Array.isArray(value) || value.length !== 2) {
            return invalid(`${subject} ${name} must be a two-number range [min, max], e.g. [${defaultRegions[name][0]}, ${defaultRegions[name][1]}].`);
        }
        for (const bound of value) {
            if (typeof bound !== 'number' || !Number.isInteger(bound)) {
                return invalid(`${subject} ${name} has the bound ${JSON.stringify(bound)} — ${regionNoun} bounds are whole ${rankNoun} numbers between ${firstRank} and ${lastRank}.`);
            }
            if (bound < firstRank || bound > lastRank) {
                return invalid(`${subject} ${name} has the bound ${bound}, which is outside the ${scale.span} scale.`);
            }
        }
        if (value[0] > value[1]) {
            return invalid(`${subject} ${name} runs from ${value[0]} down to ${value[1]} — its minimum must not be above its maximum.`);
        }
        range[name] = [value[0], value[1]];
    }

    if (range[lowest][0] !== firstRank) {
        return invalid(`${subject} ${lowest} must start at ${firstRank} (${scale.labelOfRank(firstRank)}), the bottom of the scale — otherwise the ${rankNounPlural} below it would be in no ${regionNoun} at all.`);
    }
    if (range[highest][1] !== lastRank) {
        return invalid(`${subject} ${highest} must end at ${lastRank} (${scale.labelOfRank(lastRank)}), the top of the scale — otherwise the ${rankNounPlural} above it would be in no ${regionNoun} at all.`);
    }

    for (let i = 1; i < total; i += 1) {
        const lower = regionOrder[i - 1];
        const upper = regionOrder[i];
        const expected = range[lower][1] + 1;
        const actual = range[upper][0];
        if (actual === expected) continue;

        if (actual > expected) {
            // The gap named exactly: one rank, two ranks, or a span.
            const last = actual - 1;
            let gap;
            if (last === expected) gap = scale.labelOfRank(expected);
            else if (last === expected + 1) gap = `${scale.labelOfRank(expected)} and ${scale.labelOfRank(last)}`;
            else gap = `${scale.labelOfRank(expected)}–${scale.labelOfRank(last)}`;

            return invalid(`${subjectPlural} leave ${gap} in no ${regionNoun} at all — ${lower} ends at ${scale.labelOfRank(range[lower][1])} and ${upper} starts at ${scale.labelOfRank(actual)}. Anybody on an ${unassigned} ${rankNoun} would be silently unable to lead every ${regionNoun}-restricted task, so the ${regionNounPlural} must be contiguous.`);
        }
        return invalid(`${subjectPlural} ${lower} (${scale.labelOfRank(range[lower][0])}–${scale.labelOfRank(range[lower][1])}) and ${upper} (${scale.labelOfRank(range[upper][0])}–${scale.labelOfRank(range[upper][1])}) overlap — no ${rankNoun} may belong to two ${regionNounPlural}.`);
    }

    return { valid: true, reason: null };
};

/**
 * A region's key as a human would write it in a sentence.
 *
 * Capitalising the first letter is right for a one-word key (`senior` ->
 * `Senior`), and wrong the moment a key is camelCase: `nonExempt` became
 * `"NonExempt-band staff"` in a refusal a roster master reads. So a camel hump
 * becomes a hyphenated word — `nonExempt` -> `Non-exempt` — which is how the
 * department writes it. Derived rather than a lookup table, so a fifth region
 * added tomorrow reads correctly without anyone remembering this function
 * exists.
 */
const regionWordLabel = (name) => {
    const spaced = String(name).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/**
 * A set of region names as prose, always in scale order:
 * `Set{'principal','senior'}` -> `'Senior/Principal'`.
 */
const regionSetLabel = (names, scale) =>
    scale.regionOrder
        .filter((name) => names.has(name))
        .map(regionWordLabel)
        .join('/');

/**
 * The same set as rank labels: `'AH13–AH17'`. Adjacent regions are merged into
 * one span, and a deliberately non-contiguous selection reads honestly as
 * `'AH7–AH12, AH15–AH17'` rather than pretending to be a single range.
 */
const regionSetRankLabel = (names, regions, scale) => {
    const spans = [];
    for (const name of scale.regionOrder) {
        if (!names.has(name)) continue;
        const [min, max] = regions[name];
        const last = spans[spans.length - 1];
        if (last && last[1] + 1 === min) last[1] = max;
        else spans.push([min, max]);
    }
    return spans
        .map(([min, max]) => (min === max
            ? scale.labelOfRank(min)
            : `${scale.labelOfRank(min)}–${scale.labelOfRank(max)}`))
        .join(', ');
};

// --- 0b(ii). THE ALLIED-HEALTH INSTANCE ---------------------------------------
//
// Everything above is profession-agnostic. THIS is the department's scale, and
// the four exports beneath it are the faces the rest of the repository already
// reads. Nothing here adds a behaviour: it names the instance that was hardcoded.

const AH_GRADE_MIN = 7;
const AH_GRADE_MAX = 17;

/** `'ah13'`, `'AH13'`, `' AH13 '`, `'AH07'` -> `13`; anything else -> `null`. */
/**
 * `AH13`, `ah13`, ` AH13 `, `AH07` — and `NN8`.
 *
 * ⚠️ `NN` IS THE SAME LADDER UNDER ANOTHER NAME. The roster owner, 2026-08-31:
 *    the support grades "AH7 through AH10 [are] sometimes known as NN7-NN10 ie
 *    Non-Nursing". Different institutions, and different documents inside one
 *    institution, write the same person's grade both ways. A parser that knows only
 *    `AH` rejects a correctly-typed grade and the roster master is told their entry
 *    is invalid, which is the tool being wrong about their own vocabulary.
 *
 *    ACCEPTED ACROSS THE WHOLE RANGE, not only 7–10, deliberately. `NN` is used for
 *    the support grades in practice, but refusing `NN12` would mean explaining a
 *    boundary the person typing it does not have — and `NN12` is unambiguous: it is
 *    grade 12. Being strict here buys nothing and costs a confusing refusal.
 *
 *    DISPLAY IS STILL `AH`. `labelOfRank` is unchanged, so the app names one grade
 *    one way — two spellings on screen for the same rank would be worse than one
 *    spelling that everybody can type. The scale accepts both and speaks one.
 */
const parseAlliedHealthRank = (value) => {
    if (typeof value !== 'string') return null;
    const match = /^(?:ah|nn)(\d{1,2})$/i.exec(value.trim());
    if (!match) return null;
    const number = Number(match[1]);
    return number >= AH_GRADE_MIN && number <= AH_GRADE_MAX ? number : null;
};

/**
 * The department's allied-health scale, as an instance of the general thing.
 *
 * Exported so that a UI, a test or a second profession's scale can read the shape
 * it has to match — and so that "the department's scale" is a value with a name
 * rather than eleven string literals and two integers spread over a validator.
 */
export const ALLIED_HEALTH_SCALE = defineGradeScale({
    id: 'allied-health',
    firstRank: AH_GRADE_MIN,
    rankCount: AH_GRADE_MAX - AH_GRADE_MIN + 1,
    labelOfRank: (rank) => `AH${rank}`,
    parseRank: parseAlliedHealthRank,
    /**
     * The shipped boundaries, as `[min, max]` grade numbers inclusive.
     *
     * These are the department's current cut and nothing more — `rules.bands`
     * overrides them per configuration, subject to `validateGradeBands`.
     */
    regions: {
        /**
         * 🛡️ FOUR REGIONS, NOT THREE — a correctness fix, not a relabelling.
         *
         * `junior` shipped as [7, 12], which conflated two different categories of
         * staff. The department's own roster owner corrected it:
         *
         *   "AH7 to AH10 are non-exempt staff like associates, assistants,
         *    technologists. AH11, AH12 are junior AHP."
         *
         * Under the old cut, a task gated to "junior may lead" let an AH8 assistant
         * lead it. Measured against the fixtures at the time: the physiotherapy
         * shape had four assistants and technologists eligible to LEAD ward rounds
         * and both weekend days, and the embryology trio's "junior" slot was being
         * filled by support-grade staff. The band boundary was quietly widening who
         * could take clinical responsibility, and no test could have caught it —
         * it took someone who knows what AH8 means.
         *
         * Note the engine gates the LEAD only; a co-lead may be any grade. So a
         * non-exempt colleague can still assist on a duty they may not lead, which
         * is the distinction the old boundary erased.
         *
         * `senior` and `principal` are unchanged and were confirmed separately.
         * `rules.bands` still overrides all of this per configuration, subject to
         * `validateGradeBands` — these are the department's current cut, not a law.
         */
        nonExempt: [7, 10],
        junior: [11, 12],
        senior: [13, 14],
        principal: [15, 17],
    },
    prose: {
        subject: 'Grade band',
        subjectPlural: 'Grade bands',
        regionNoun: 'band',
        regionNounPlural: 'bands',
        rankNoun: 'grade',
        rankNounPlural: 'grades',
        /** The adjective for a rank in no region: `'unbanded'`. */
        unassigned: 'unbanded',
        /** How a refusal names the scale to somebody who typed a bad grade. */
        scaleTitle: 'the allied-health scale',
    },
});

/** `'AH7' … 'AH17'`, in scale order. The UI's dropdown, and the only valid set. */
export const GRADE_SCALE = ALLIED_HEALTH_SCALE.labels;

/**
 * The shipped boundaries, as `[min, max]` grade numbers inclusive.
 *
 * These are the department's current cut and nothing more — `rules.bands`
 * overrides them per configuration, subject to `validateGradeBands`.
 */
export const DEFAULT_GRADE_BANDS = ALLIED_HEALTH_SCALE.defaultRegions;

/**
 * The band names, lowest first — four today, and however many the scale
 * declares. Not exported: `Object.keys` of
 * `DEFAULT_GRADE_BANDS` is the same list in the same order, so there is one
 * definition of "the bands, in order" for a caller to read.
 */
const BAND_ORDER = ALLIED_HEALTH_SCALE.regionOrder;

/**
 * `rules` -> the SCALE in force. Always the allied-health one today; this is the
 * single seam a second profession's scale is threaded through, and every reader
 * below already takes its scale as an argument rather than reaching for a
 * module constant.
 */
const resolveGradeScale = () => ALLIED_HEALTH_SCALE;

/**
 * `'ah13'`, `'AH13'`, `' AH13 '` -> `13`; anything else, or a number off the
 * scale, -> `null`. Case-insensitive on input, per the input contract.
 */
const parseGradeNumber = (value) => rankOfGrade(value, ALLIED_HEALTH_SCALE);

/** Any accepted spelling of a grade -> the canonical `'AH' + int`, or `null`. */
const normaliseGrade = (value) => canonicalGrade(value, ALLIED_HEALTH_SCALE);

/** Which band does grade NUMBER `n` sit in? Assumes `bands` already validated. */
const bandOfGradeNumber = (n, bands) => regionOfRank(n, bands, ALLIED_HEALTH_SCALE);

/**
 * Are these band boundaries usable? `{ valid, reason }`, same contract as
 * `validateRosterV2Config`, so a UI can show `reason` verbatim.
 *
 * Requires every band the scale declares, each an inclusive `[min, max]` of whole grades on
 * the scale, together partitioning AH7–AH17: junior starts at 7, principal ends
 * at 17, every min <= max, and each band starts exactly one grade above where
 * the one below it ended.
 *
 * The allied-health instance of `validateScaleRegions` — identical wording,
 * identical refusals, one profession's nouns filled in.
 */
export const validateGradeBands = (bands) => validateScaleRegions(bands, ALLIED_HEALTH_SCALE);

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
const bandSetLabel = (bandNames) => regionSetLabel(bandNames, ALLIED_HEALTH_SCALE);

/**
 * The same set as grade numbers: `'AH13–AH17'`. Adjacent bands are merged into
 * one span, and a deliberately non-contiguous selection reads honestly as
 * `'AH7–AH12, AH15–AH17'` rather than pretending to be a single range.
 */
const bandSetGradeLabel = (bandNames, bands) =>
    regionSetRankLabel(bandNames, bands, ALLIED_HEALTH_SCALE);

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

// --- 0d. REJECTION CODES ------------------------------------------------------
//
// Requirement 5 of this engine's brief: never silently double-book, never
// silently drop a slot. That means an empty candidate pool has to be
// EXPLAINABLE, not merely detectable — so every excluded person is classified
// by the FIRST constraint they fail, in a fixed order, and the tally is what
// the `unfilled` reason is written from.
//
// The CODES live up here, above the primitives, because each primitive names the
// code it produces (an eligibility requirement carries `REJECT_SKILL`, a capacity
// limit carries `REJECT_CAPACITY`, and so on) and those tables are built at module
// load. Section 4 still owns the TAXONOMY — the fixed order, the tally and the
// prose written from it.

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
 * Today is outside every COHORT WINDOW this person has, or their windows do not
 * cover this task at all. An ELIGIBILITY rejection like `REJECT_SKILL` and
 * `REJECT_BAND` — a standing fact about the person, asked of one date — and it is
 * reported BEFORE leave for the same reason a lacked skill is: somebody whose
 * four-month block has not opened yet was never a candidate for that Saturday,
 * and "3 on leave" would be the wrong sentence.
 */
const REJECT_WINDOW = 'window';
/**
 * Taking this would pass a QUOTA CEILING — the `max` of a quota over its period.
 * Last of the codes because it is the last gate asked (section 4's `SLOT_GATES`):
 * every day-level fact is more immediate, and "Ada already holds her 4 Saturdays
 * this month" is the answer only once none of them applies.
 */
const REJECT_QUOTA = 'quota';
/**
 * Their grade is BELOW the task's stated floor. An eligibility rejection like
 * `REJECT_SKILL` and `REJECT_BAND`, and reported alongside them.
 *
 * WHY THIS IS NOT `REJECT_BAND` WEARING A DIFFERENT NAME, which is the first
 * thing a reader will suspect. A band gate asks "is your band in this SET"; a
 * floor asks "is your grade AT OR ABOVE this RANK". They differ exactly when the
 * floor falls INSIDE a band — and that is not a corner case, it is the case that
 * created this code: respiratory therapy stated a minimum of AH12, `junior` is
 * AH11–AH12, so every expressible band gate admitted AH11 too. Counting an AH11
 * refusal under `REJECT_BAND` would have made the reason sentence say their band
 * was wrong when their band was right.
 */
const REJECT_MIN_GRADE = 'minGrade';

// --- 0e. THE ELIGIBILITY PRIMITIVE --------------------------------------------
//
// A standing FACT about a person, asked about one position: may they fill it at
// all, on any date, before today's capacity is considered? `requiresSkill` and
// `leadBands` were two named flags checked by two hand-written `if`s inside the
// candidate loop. They are the SAME primitive: a PREDICATE OVER A PERSON,
// combined by AND.
//
// A REQUIREMENT is `{ kind, … }`. A position carries an ordered LIST of them, and
// a person is eligible when they satisfy every one. The list is ordered because
// the FIRST unmet requirement is what the roster master is told about, and the
// documented order (skill before band) is the order the reason sentence reads in.
//
// THE KINDS, and the whole point of the table: adding a third kind is adding a
// row here plus a rejection code. The candidate loop, the audit's read-back
// matching, the scarcity count and the reason strings all walk the list through
// `firstUnmetRequirement` / `meetsEligibility` and know nothing about what a kind
// means. Nothing in section 7 changes.
//
//   skill   `{ kind: 'skill', skill }`    — holds a named competency.
//   region  `{ kind: 'region', regions }` — their RANK sits in one of a set of
//                                           named regions of the scale (the
//                                           `leadBands` gate, and a slot's own
//                                           `band`). An unrecorded rank never
//                                           satisfies it: membership that cannot
//                                           be verified is not membership.
//   window  `{ kind: 'window', task }`    — one of their COHORT WINDOWS admits
//                                           this task on this date (section 0e(ii)).
//                                           THE THIRD KIND, and it is the proof the
//                                           table was worth building: a four-month
//                                           team block, a six-week locum and a
//                                           student placement all reach the
//                                           candidate loop, the scarcity count, the
//                                           reason strings and the read-back audit
//                                           through this one row.
//
// A REQUIREMENT MAY DEPEND ON THE DATE, and `met` therefore takes a third
// argument: the day's context, or `null`. The first two kinds ignore it — a skill
// and a grade are the same on every date — and the window kind reads `ctx.dateKey`.
// Three callers ask three different questions, and each says which by what it
// passes:
//
//   full ctx          the day loop. "May they fill it TODAY?"
//   { dateKey: null } the pre-loop shortfall warnings. "Could they EVER fill it?"
//                     — a window that never names this task fails; a date does not
//                     enter into it.
//   nothing           the audit's slot matching. Windows are not part of the
//                     question there: `HARD_RULE_WINDOW` reads them off the
//                     finished roster with the date in hand, and answering here
//                     too would report one breach twice.
//
// Kinds a later agent can add without touching the candidate loop: a `not`
// wrapper (nobody has asked), `{ kind: 'rankAtLeast' }` (a floor rather than a
// region), `{ kind: 'attribute' }` for a boolean flag on a person, or
// `{ kind: 'anyOf', requirements }` for the disjunction the multi-slot ledger's
// item 4 says is not expressible today. Each is a row plus, if it needs its own
// sentence, a rejection code.

const ELIGIBILITY_SKILL = 'skill';
const ELIGIBILITY_REGION = 'region';
const ELIGIBILITY_WINDOW = 'window';
const ELIGIBILITY_MIN_GRADE = 'minGrade';

/** The requirement kinds, as a value. Adding a kind adds a name here. */
export const ELIGIBILITY_KIND_NAMES = Object.freeze({
    skill: ELIGIBILITY_SKILL,
    region: ELIGIBILITY_REGION,
    window: ELIGIBILITY_WINDOW,
    minGrade: ELIGIBILITY_MIN_GRADE,
});

/**
 * The kinds, as data: how to test one, which rejection code a person who fails it
 * is counted under, and when two requirements of the kind are THE SAME
 * requirement.
 *
 * `same` exists because `eligibilityOf` deduplicates, and what "duplicate" means
 * is the kind's business rather than the builder's: two skill requirements agree
 * on a name, two region requirements on a set, two window requirements on a task.
 * It was an implicit `existing.regions === part.regions` until the third kind
 * arrived and made the implication wrong-by-accident rather than wrong.
 */
export const ELIGIBILITY_KINDS = Object.freeze({
    [ELIGIBILITY_SKILL]: Object.freeze({
        rejection: REJECT_SKILL,
        met: (person, requirement) => person.skills.has(requirement.skill),
        same: (a, b) => a.skill === b.skill,
        key: (requirement) => `s:${requirement.skill}`,
    }),
    [ELIGIBILITY_REGION]: Object.freeze({
        rejection: REJECT_BAND,
        // `person.band === null` (no grade recorded) fails: see section 0b's
        // "absent is not zero".
        met: (person, requirement) => person.band !== null && requirement.regions.has(person.band),
        same: (a, b) => a.regions === b.regions,
        key: (requirement) => `r:${[...requirement.regions].sort().join('+')}`,
    }),
    [ELIGIBILITY_WINDOW]: Object.freeze({
        rejection: REJECT_WINDOW,
        met: (person, requirement, ctx = null) => {
            // NO CONTEXT: the caller is asking a question windows cannot answer —
            // see the section header's table of the three callers.
            if (ctx === null || ctx === undefined) return true;
            if (!isNonEmptyString(ctx.dateKey)) {
                return windowsCouldAdmit(person.windows, requirement.task);
            }
            return windowsAdmit(person.windows, requirement.task, ctx.dateKey);
        },
        same: (a, b) => a.task === b.task,
        key: (requirement) => `w:${requirement.task}`,
    }),
    /**
     * A GRADE FLOOR: at or above a rank, rather than inside a set of bands.
     *
     * `person.gradeRank` is already the number this needs — computed once in
     * `normaliseStaff` so nothing re-parses a grade string — and an unrecorded
     * grade sits at the scale's `unknownRank`, STRICTLY BELOW its bottom rank.
     * So `>=` refuses a person with no grade without a special case, which is the
     * same answer the region kind gives via its `band !== null` guard and the
     * same rule as section 0b's "absent is not zero". Getting that for free is
     * the reason this kind stores a rank and not a label.
     */
    [ELIGIBILITY_MIN_GRADE]: Object.freeze({
        rejection: REJECT_MIN_GRADE,
        met: (person, requirement) => person.gradeRank >= requirement.minRank,
        same: (a, b) => a.minRank === b.minRank,
        key: (requirement) => `g:${requirement.minRank}`,
    }),
});

/** A skill requirement, or `null` for "this adds no skill". */
export const skillRequirement = (skill) =>
    (isNonEmptyString(skill) ? Object.freeze({ kind: ELIGIBILITY_SKILL, skill }) : null);

/**
 * A region requirement over a SET of region names, or `null` for "any rank,
 * including an unrecorded one".
 */
export const regionRequirement = (regions) =>
    (regions instanceof Set && regions.size > 0
        ? Object.freeze({ kind: ELIGIBILITY_REGION, regions })
        : null);

/**
 * A COHORT WINDOW requirement for one named task, or `null` for "this
 * configuration declares no windows, so nothing is bounded in time".
 *
 * It carries the TASK NAME rather than reading it from context because a position
 * belongs to exactly one task and the date-less question ("could they ever fill
 * this?") has to be answerable from the requirement alone.
 */
export const windowRequirement = (taskName) =>
    (isNonEmptyString(taskName) ? Object.freeze({ kind: ELIGIBILITY_WINDOW, task: taskName }) : null);

/**
 * A GRADE FLOOR requirement from a grade label, or `null` for "no floor".
 *
 * ⚠️ THIS GATES EVERY ASSIGNEE, NOT JUST THE LEAD, AND THAT IS THE WHOLE POINT.
 * `leadBands` gates the lead alone — any grade may co-lead — which is what makes
 * a senior-supervising-junior pairing expressible and is right for that shape. A
 * FLOOR is the opposite kind of statement: "nobody below AH12 covers NICU"
 * includes the second person in the room. So this requirement is composed onto
 * lead, co-lead and slot positions alike, exactly as `requiresSkill` is.
 *
 * The consequence is worth stating because it removes a workaround rather than
 * adding a feature: before this existed, the only honest way to express a floor
 * was `coLeads: 0` — one gated person and nobody beside them — because a second
 * body was a body the gate could not reach. A task can now say the floor and
 * still have two people on it.
 *
 * Stored as a RANK, not a label, so nothing downstream re-parses a grade string;
 * `label` rides along only for the refusal sentence.
 */
export const minGradeRequirement = (grade, scale = ALLIED_HEALTH_SCALE) => {
    const rank = rankOfGrade(grade, scale);
    return rank === null
        ? null
        : Object.freeze({ kind: ELIGIBILITY_MIN_GRADE, minRank: rank, label: scale.labelOfRank(rank) });
};

/**
 * Build a requirement list from parts, dropping the absent ones and any exact
 * duplicate of a requirement already in it.
 *
 * DEDUPLICATED, and it is load-bearing rather than tidy: a slot entry that
 * repeats the task's own `requiresSkill` says nothing new, and the reason
 * sentence must not name the same skill twice ("skills CPET and CPET"). Testing
 * it twice would give the same answer, so the dedupe is invisible to the gate and
 * visible only in the prose.
 */
export const eligibilityOf = (...parts) => {
    const out = [];
    for (const part of parts) {
        if (part === null || part === undefined) continue;
        const already = out.some((existing) => (
            existing.kind === part.kind && ELIGIBILITY_KINDS[part.kind].same(existing, part)
        ));
        if (!already) out.push(part);
    }
    return Object.freeze(out);
};

/**
 * The FIRST requirement `person` does not satisfy, or `null` if they satisfy all.
 *
 * `ctx` is the day's context for the kinds that need one (the window kind, today).
 * Absent means "no date is in play" — see the kind table's three callers.
 */
export const firstUnmetRequirement = (person, eligibility, ctx = null) => {
    for (const requirement of eligibility) {
        if (!ELIGIBILITY_KINDS[requirement.kind].met(person, requirement, ctx)) return requirement;
    }
    return null;
};

/** Could this person fill a position with this eligibility, ignoring capacity? */
export const meetsEligibility = (person, eligibility, ctx = null) =>
    firstUnmetRequirement(person, eligibility, ctx) === null;

/** Every skill this eligibility demands, in list order. The reason string's input. */
export const skillsRequiredBy = (eligibility) =>
    eligibility.filter((r) => r.kind === ELIGIBILITY_SKILL).map((r) => r.skill);

/**
 * A comparable string for one eligibility list, so two positions asking for the
 * SAME thing can be grouped and reported once. Kind-tagged, and region sets are
 * sorted, so the key cannot depend on set insertion order.
 */
const eligibilityKey = (eligibility) => eligibility
    .map((requirement) => ELIGIBILITY_KINDS[requirement.kind].key(requirement))
    .join('|');

/**
 * The region set this eligibility gates on, or `null` for "any rank". A position
 * carries at most one region requirement today (a task's `leadBands`, or a slot
 * entry's single `band`); if a later kind adds a second, the FIRST is the one the
 * sentence names and that is the order the list was built in.
 */
export const regionsRequiredBy = (eligibility) => {
    const found = eligibility.find((r) => r.kind === ELIGIBILITY_REGION);
    return found === undefined ? null : found.regions;
};

// --- 0e(ii). THE COHORT WINDOW: ELIGIBILITY BOUNDED IN TIME -------------------
//
// The embryologists run three teams and each takes a FOUR-MONTH BLOCK of weekend
// duty. The same shape covers every rotation the field interviews turned up: a
// six-week locum, a student on placement, a secondment, a registrar's rotation
// through a service. None of them is expressible by `unavailable`, which is a LIST
// OF DATES OFF — team A's block is eight months of "not you", and typing 240 dates
// per person per year is not a configuration, it is a data-entry accident waiting
// to happen.
//
// SO A PERSON MAY DECLARE WINDOWS:
//
//   windows: [
//     { from: '2026-09-01', to: '2026-12-31', label: 'team B block' },
//     { from: '2027-01-01', to: '2027-01-31', tasks: ['Supervised Clinic'] },
//   ]
//
//   from / to  inclusive date keys, either may be absent — `{ to: '2026-03-31' }`
//              is "until the end of March", `{ from: '2026-03-01' }` is "from
//              March onwards".
//   tasks      the tasks this window admits, or absent for "all of them".
//   label      what the department CALLS this block, carried only so that an
//              `unfilled` reason can say "outside their team B block" instead of
//              "outside their cohort window". A label, never matched on.
//
// THE SEMANTICS ARE A UNION, AND THIS IS THE LOAD-BEARING SENTENCE: a person with
// windows is eligible for (task, date) if SOME window of theirs admits BOTH. So
// `windows: [{ from, to, tasks: ['X'] }]` says "X, in that range, and nothing else
// at all, ever" — not "X is restricted and everything else is untouched". A student
// whose only window names the supervised clinic is on the supervised clinic or on
// nothing, which is what a placement is. The alternative reading (each window
// restricts only the tasks it names, and unnamed tasks are unbounded) is a real
// reading that somebody will expect; it is not this one, and the ledger says so.
//
// NO WINDOWS AT ALL means always eligible, so the feature is ADDITIVE: a
// department that has never heard of cohorts is judged by exactly the gates that
// existed before this section did. `windows: []` is REFUSED rather than read as
// "always" — an empty list would make somebody eligible for nothing, which is a
// half-finished edit and not a policy (the same call `slots: []` gets).
//
// AND IT IS NOT A SPECIAL CASE IN THE DAY LOOP. A window compiles to an
// ELIGIBILITY REQUIREMENT (section 0e's third kind), so the candidate gate, the
// scarcity ordering MRV reads, the `unfilled` tally and the read-back audit all see
// it through machinery that knows nothing about cohorts.

/**
 * Did this configuration ASK for cohort windows? The one predicate, read by the
 * validator, the generator and the audit, so the three cannot disagree about
 * whether eligibility is time-bounded.
 *
 * A MENTION TEST, exactly as `hoursModelRequested` is: a staff entry carrying a
 * `windows` key switches the model on for the whole configuration, because that is
 * how a roster master says "our teams rotate". What it switches on is only whether
 * `normaliseTasks` compiles the window requirement onto positions — a person who
 * declares no windows is admitted by every one of them.
 */
const cohortWindowsRequested = (config) => {
    if (!isPlainObject(config)) return false;
    if (!Array.isArray(config.staff)) return false;
    for (const person of config.staff) {
        if (!isPlainObject(person)) continue;
        if (isStated(person.windows)) return true;
    }
    return false;
};

/** The noun an unlabelled window is known by, in every sentence that names one. */
const COHORT_WINDOW_NOUN = 'cohort window';

/**
 * `staff.windows` -> the normalised list, or `null` for "no windows, always
 * eligible".
 *
 * `tasks` becomes a `Set` (the gate is a membership test) or `null` for "every
 * task". Validation has already refused every shape this cannot read.
 */
const normaliseWindows = (value) => {
    if (!Array.isArray(value) || value.length === 0) return null;
    return Object.freeze(value.map((window) => Object.freeze({
        from: isDateKey(window?.from) ? window.from : null,
        to: isDateKey(window?.to) ? window.to : null,
        tasks: Array.isArray(window?.tasks) && window.tasks.length > 0
            ? new Set(window.tasks)
            : null,
        label: isNonEmptyString(window?.label) ? window.label.trim() : COHORT_WINDOW_NOUN,
    })));
};

/** Does this window admit this task at all, whatever the date? */
const windowAdmitsTask = (window, taskName) => window.tasks === null || window.tasks.has(taskName);

/**
 * Is `dateKey` inside this window's range?
 *
 * STRING COMPARISON, deliberately: `'2026-09-14' <= '2026-12-31'` is true for
 * every well-formed `YYYY-MM-DD` pair because the format is fixed-width and
 * big-endian, and validation has already refused anything else. No `Date` is
 * constructed, so there is no timezone, no DST and no parse to get wrong —
 * post-mortem Block B's whole lesson, applied by not needing it.
 */
const windowCoversDate = (window, dateKey) =>
    (window.from === null || dateKey >= window.from) &&
    (window.to === null || dateKey <= window.to);

/** May somebody with these windows fill this task on this date? */
const windowsAdmit = (windows, taskName, dateKey) => {
    if (!Array.isArray(windows) || windows.length === 0) return true;
    return windows.some((window) => windowAdmitsTask(window, taskName) && windowCoversDate(window, dateKey));
};

/** Could somebody with these windows EVER fill this task, on any date? */
const windowsCouldAdmit = (windows, taskName) => {
    if (!Array.isArray(windows) || windows.length === 0) return true;
    return windows.some((window) => windowAdmitsTask(window, taskName));
};

/** `2026-09-01`/`2026-12-31` -> `2026-09-01 to 2026-12-31`, either end optional. */
const windowRangeLabel = (window) => {
    if (window.from !== null && window.to !== null) return `${window.from} to ${window.to}`;
    if (window.from !== null) return `from ${window.from} onwards`;
    if (window.to !== null) return `until ${window.to}`;
    return 'any date';
};

/**
 * Why exactly is this ONE person outside their windows for this ONE task today?
 * The sentence the aggregate tally cannot say, and the reason a window carries a
 * label at all.
 *
 * Reads, for example:
 *   Cara is outside their team B block, which runs 2026-09-01 to 2026-12-31
 *   Dan has no cohort window covering Weekend Witnessing
 */
const windowExclusionClause = (person, taskName) => {
    const forTask = person.windows.filter((window) => windowAdmitsTask(window, taskName));

    if (forTask.length === 0) {
        return `${person.name} has no ${COHORT_WINDOW_NOUN} covering ${taskName}`;
    }
    if (forTask.length === 1) {
        return `${person.name} is outside their ${forTask[0].label}, which runs ${windowRangeLabel(forTask[0])}`;
    }
    return `${person.name} is outside all ${forTask.length} of their ${COHORT_WINDOW_NOUN}s for ${taskName} (${forTask.map(windowRangeLabel).join(', ')})`;
};

// --- 0f. THE STRUCTURE PRIMITIVE: A SHIFT IS A LIST OF POSITIONS --------------
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
// AND THAT LIST IS THE ONLY INTERNAL SHIFT SHAPE. `leads: 1, coLeads: 1` is not a
// second mechanism — it is SUGAR that compiles to two POSITIONS, and everything
// past `normaliseTasks` reads `task.positions` and nothing else. A POSITION is:
//
//   { index, role, phase, label, eligibility, entry }
//
//   index        configuration order within the task. The tie-break for equally
//                scarce positions, so it has to be stable and it has to be data.
//   role         'lead' | 'coLead' | 'slot'. What the position IS in the shift,
//                and what an `unfilled` entry reports for the two sugar roles.
//   phase        PHASE_PRIMARY or PHASE_ATTACHED. A primary position stands on its
//                own; an attached one is only worth filling if its shift has an
//                anchor, which is what stops a co-lead being staffed with no lead.
//   label        the name this position is refused under. `'lead'`, `'coLead'`, or
//                a slot entry's `role`/band label made unique.
//   eligibility  the requirement list of section 0e. THE ONLY GATE. The task's own
//                `requiresSkill`, a `leadBands` set and a slot entry's `band` and
//                `requiresSkill` are all compiled into it, in the documented order
//                (skill before region), so `rejectionFor` has no per-feature `if`
//                left and a new eligibility kind reaches every position for free.
//   entry        the `slots` entry this came from, or `null`. Kept only so the
//                sugar-specific WARNINGS can group identical slot gates; no gate,
//                no reason string and no audit rule reads it.
//
// AND ONE COMPOSITION STEP, chosen per task rather than branched on per feature:
//
//   COMPOSE_PAIRING   one shift per filled anchor ('lead') position, with the
//                     attached positions dealt round-robin across them. The shape
//                     `leads`/`coLeads` has always produced.
//   COMPOSE_TEAM      one shift holding everybody, ordered by RANK and then by the
//                     fairness tie-break, so the lead is the highest grade present.
//
// A third strategy is a third row in `COMPOSITIONS`. Nothing in the day loop
// branches on which one a task uses.
//
// WHAT THIS SECTION OWNS: the position shape, the labels, the compositions, and
// the compilation of both sugars into positions — so the construction gate
// (section 4), the reason strings (section 4) and the read-back audit (section 6)
// all read one structure and can never disagree about whether somebody may fill
// a position. The rank-ranking rule lives in section 5, beside the tie-break it
// defers to; the assignment loop's use of all of it is in section 7; the honest
// limits are at the foot of the file.
//
// LABELS ARE MADE UNIQUE, because "which slot?" is the whole point of the reason
// string. Two entries that would both read `junior slot` become `junior slot 1`
// and `junior slot 2`, in configuration order. A `role` is used verbatim (trimmed
// — it goes into a sentence rather than being matched against anything), and an
// entry with neither `role` nor `band` reads `slot 1`.

/** The two roles the paired sugar produces, and the shift fields they publish. */
const ROLE_LEAD = 'lead';
const ROLE_CO_LEAD = 'coLead';

/**
 * The `role` a slot position carries INSIDE the assignment loop while it is being
 * filled.
 *
 * Not `'lead'` and not `'coLead'`, because it is neither until the day's positions
 * are resolved and section 5 ranks them — the two existing roles are branched on
 * in four places, and quietly reusing one of them is how a field comes to mean two
 * things (post-mortem A-RC1). What reaches `unfilled` is the position's LABEL, not
 * this token; nothing outside the loop reads it.
 */
const MULTI_SLOT_ROLE = 'slot';

/**
 * WHEN a position is filled relative to the others on its shift.
 *
 * PRIMARY positions of every running task compete with each other, scarcest
 * first, across the whole day. ATTACHED positions wait for their shift to have an
 * anchor and are then filled in a second pass — which is what makes it impossible
 * for a pairing group to hold a co-lead with no lead to attach them to.
 */
const PHASE_PRIMARY = 1;
const PHASE_ATTACHED = 2;

/** How filled positions become shift objects. See the section header. */
const COMPOSE_PAIRING = 'pairing';
const COMPOSE_TEAM = 'team';

/** The compositions and the two phases, as values a caller can name. */
export const SHIFT_COMPOSITIONS = Object.freeze({ pairing: COMPOSE_PAIRING, team: COMPOSE_TEAM });
export const POSITION_PHASES = Object.freeze({ primary: PHASE_PRIMARY, attached: PHASE_ATTACHED });

/**
 * The compositions, as data: which role anchors a shift, and how the day's fills
 * are turned into shift objects.
 *
 * `anchorRole: null` means every position stands alone — there is nothing an
 * attached position could hang off, and a TEAM task therefore has none.
 */
const COMPOSITIONS = Object.freeze({
    [COMPOSE_PAIRING]: Object.freeze({ anchorRole: ROLE_LEAD }),
    [COMPOSE_TEAM]: Object.freeze({ anchorRole: null }),
});

/** `task` -> the role that anchors its shifts, or `null`. */
const anchorRoleOf = (task) => COMPOSITIONS[task.composition].anchorRole;

/**
 * A canonical grade as a sortable number. Called ONCE per person, in
 * `normaliseStaff`, so that ranking a trio's assignees never re-parses a grade
 * string and the audit and the generator cannot disagree about who outranks whom.
 *
 * An unrecorded grade sorts at the scale's `unknownRank`, which is strictly below
 * its bottom rank — see `defineGradeScale`.
 */
const gradeRankOf = (grade, scale = ALLIED_HEALTH_SCALE) => {
    const number = rankOfGrade(grade, scale);
    return number === null ? scale.unknownRank : number;
};

/**
 * The label a slot entry is known by in prose, BEFORE deduplication: its `role`
 * if it has one, else its band, else the bare word. One definition, read by
 * `compileSlotPositions` and by the validator's refusal strings, so the name a
 * roster master is refused over is the name they would have seen in `unfilled`.
 */
const slotBaseLabel = (entry, scale = ALLIED_HEALTH_SCALE) => {
    if (isNonEmptyString(entry?.role)) return entry.role.trim();
    if (typeof entry?.band === 'string' && scale.regionOrder.includes(entry.band)) return `${entry.band} slot`;
    return 'slot';
};

/**
 * `slots` -> POSITIONS, or `null` for "this task is staffed the other way".
 * Validation has already refused every shape this cannot read.
 *
 * Every entry becomes ONE primary position whose eligibility is the task's skill,
 * then the entry's own skill, then the entry's band — the order the reason
 * sentence reads in, and the order `firstUnmetRequirement` reports.
 */
const compileSlotPositions = (value, task, scale = ALLIED_HEALTH_SCALE, windowsActive = false) => {
    if (!Array.isArray(value) || value.length === 0) return null;

    const cohortWindow = windowsActive ? windowRequirement(task.name) : null;
    const bases = value.map((entry) => slotBaseLabel(entry, scale));
    const total = new Map();
    for (const base of bases) total.set(base, (total.get(base) || 0) + 1);
    const seen = new Map();
    const taskSkill = skillRequirement(task.requiresSkill);
    const taskFloor = minGradeRequirement(task.minGrade, scale);

    return value.map((raw, index) => {
        const band = typeof raw?.band === 'string' && scale.regionOrder.includes(raw.band) ? raw.band : null;
        const base = bases[index];
        // Numbered ONLY when it would otherwise be ambiguous: a lone junior slot
        // reads `junior slot`, and three of them read `junior slot 1..3`.
        let label = base;
        if (total.get(base) > 1) {
            const nth = (seen.get(base) || 0) + 1;
            seen.set(base, nth);
            label = `${base} ${nth}`;
        }

        const entry = Object.freeze({
            index,
            band,
            requiresSkill: isNonEmptyString(raw?.requiresSkill) ? raw.requiresSkill : null,
            role: isNonEmptyString(raw?.role) ? raw.role.trim() : null,
            label,
        });

        return Object.freeze({
            index,
            role: MULTI_SLOT_ROLE,
            phase: PHASE_PRIMARY,
            label,
            eligibility: eligibilityOf(
                taskSkill,
                skillRequirement(entry.requiresSkill),
                // The task's floor applies to every slot too — a trio's junior
                // slot is still somebody covering the duty.
                taskFloor,
                // A single band, as a set, because a region requirement is a set —
                // which is what makes "senior or principal" a one-line change here
                // rather than a new mechanism (multi-slot ledger item 4).
                band === null ? null : regionRequirement(new Set([band])),
                // LAST, because it is the most specific fact and therefore the
                // last sentence a roster master wants: somebody who lacks the
                // skill is not also told their block has not opened.
                cohortWindow,
            ),
            entry,
        });
    });
};

/**
 * `leads` + `coLeads` -> POSITIONS. The other sugar, compiled to the same shape.
 *
 * A lead position carries the task's skill and then its `leadBands`; a co-lead
 * position carries the task's skill and nothing else, because bands gate leads
 * only and that is what makes a senior-lead / junior-shadow pairing expressible
 * (section 0b's rule 6).
 */
const compilePairedPositions = (task, leadRegions, windowsActive = false) => {
    const taskSkill = skillRequirement(task.requiresSkill);
    const cohortWindow = windowsActive ? windowRequirement(task.name) : null;
    // The floor rides with the SKILL, not with the bands: it applies to everybody
    // on the duty. See `minGradeRequirement` for why that asymmetry is the point.
    const taskFloor = minGradeRequirement(task.minGrade);
    const leadEligibility = eligibilityOf(taskSkill, taskFloor, regionRequirement(leadRegions), cohortWindow);
    const coLeadEligibility = eligibilityOf(taskSkill, taskFloor, cohortWindow);
    const positions = [];

    for (let i = 0; i < task.leads; i += 1) {
        positions.push(Object.freeze({
            index: positions.length,
            role: ROLE_LEAD,
            phase: PHASE_PRIMARY,
            label: ROLE_LEAD,
            eligibility: leadEligibility,
            entry: null,
        }));
    }
    for (let i = 0; i < task.coLeads; i += 1) {
        positions.push(Object.freeze({
            index: positions.length,
            role: ROLE_CO_LEAD,
            phase: PHASE_ATTACHED,
            label: ROLE_CO_LEAD,
            eligibility: coLeadEligibility,
            entry: null,
        }));
    }
    return positions;
};

/**
 * How many people does one occurrence of this task need? The position count, for
 * every task of every shape. Read by the demand counters and by the skill
 * shortfall warning, so a slotted task is counted in the same currency as the
 * tasks beside it.
 */
const perDayDemand = (task) => task.positions.length;

/** `['CPET']` -> `'skill CPET'`; `['CPET','ICSI']` -> `'skills CPET and ICSI'`. */
const skillsPhrase = (skills) =>
    skills.length === 1 ? `skill ${skills[0]}` : `skills ${skills.join(' and ')}`;

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

// --- 1b. THE TEMPORAL PRIMITIVE: ONE GRAMMAR FOR "WHEN DOES THIS OCCUR" -------
//
// A task used to answer that question in one of TWO mutually exclusive
// mechanisms: `days: [1,3]` (every Monday and Wednesday) or
// `recurrence: { ordinal: 3, weekday: 3 }` (the 3rd Wednesday of every calendar
// month). Two fields, two code paths, two warnings, and a validation refusal
// holding them apart. The seventh profession would have wanted a third.
//
// They are ONE THING: a PATTERN, resolved against the run's horizon into a SET OF
// DATES. Both named fields are now SUGAR that compiles to a pattern, and the day
// loop asks exactly one question of every task, whatever it was written as:
// is today one of your dates?
//
//   PATTERN   { clauses: [clause, …], window: { from, to } | null }
//
// A date occurs when ANY clause matches it and the window (if any) contains it —
// a UNION of clauses, so "the 1st AND the 3rd Wednesday" is two ordinals in one
// clause and "every Tuesday plus these four dates" is two clauses.
//
//   CLAUSES
//     { kind: 'weekly',  weekdays: [0..6], every: n, offset: k }
//         Those weekdays, in every nth week of the run counting from its start
//         (`every: 1, offset: 0` is every week; `every: 2, offset: 0` is alternate
//         weeks; `offset: 1` is the other alternate weeks).
//     { kind: 'monthly', weekday: 0..6, ordinals: [1|2|3|4|'last', …] }
//         The nth (or last) such weekday of each calendar month, one date per
//         ordinal, so a list expresses "1st and 3rd Wednesday".
//     { kind: 'dates',   dates: [dateKey, …] }
//         Exactly these dates, and nothing derived.
//
// WHAT IS EXPRESSIBLE TODAY BUT HAS NO SUGAR — and this is the point of the
// refactor rather than a promise about later work: `1st AND 3rd Wednesday`
// (`ordinals: [1, 3]`), `alternate weeks` (`every: 2`), `an explicit date list`
// (a `dates` clause), and `a bounded date range` (`window`) all already work
// through the general path, because there is only one path. What is missing is a
// FIELD a roster master can type, which is validation plus a wizard column and
// deliberately not taken here — `src/utils/rosterEngineV2.primitives.test.js`
// drives each of them through `generateRosterV2` to prove the engine half is real.
//
// WHY THE OCCURRENCES ARE RESOLVED ONCE, BEFORE THE DAY LOOP. `temporalOccurrences`
// is THE definition of when a task runs. The day loop reads the resolved set and a
// preview UI calls the same function rather than reimplementing month arithmetic —
// post-mortem A-RC1's rule (one definition per displayed fact) applied to a set of
// dates instead of a string.
//
// HORIZON, NOT CALENDAR. The occurrences of a task are the matching dates that
// fall INSIDE the generated run — `effectiveStart` through the last day of the
// last week. A month whose nth weekday lies outside the run contributes nothing,
// and a run too short to contain any occurrence generates nothing at all for that
// task. Neither is an `unfilled` entry: no slot was ever demanded, so there is
// nothing that could not be staffed. `generateRosterV2` does WARN about the second
// case, because a task that never appears in the calendar is indistinguishable
// from a bug when you are looking at the calendar.
//
// WHY `'last'` IS AN ORDINAL AND NOT `5`. Most months hold four of any given
// weekday and some hold five, so a task configured as "the 5th Wednesday" would
// silently vanish in most months — the class of quiet failure this engine exists
// to refuse. `'last'` is the question departments actually ask, and it differs
// from `4` exactly in the five-weekday months, which is where the tests bite.

const TEMPORAL_WEEKLY = 'weekly';
const TEMPORAL_MONTHLY = 'monthly';
const TEMPORAL_DATES = 'dates';

/** The clause kinds, as a value, so a caller names them rather than spelling them. */
export const TEMPORAL_KINDS = Object.freeze({
    weekly: TEMPORAL_WEEKLY,
    monthly: TEMPORAL_MONTHLY,
    dates: TEMPORAL_DATES,
});

const RECURRENCE_LAST = 'last';

/** The ordinals a monthly clause may name. Anything else is refused, loudly. */
const RECURRENCE_ORDINALS = Object.freeze([1, 2, 3, 4, RECURRENCE_LAST]);

/** `3` -> `'3rd'`, `'last'` -> `'last'`. For reasons and warnings only. */
const ORDINAL_PROSE = Object.freeze({
    1: '1st', 2: '2nd', 3: '3rd', 4: '4th', [RECURRENCE_LAST]: 'last',
});

/** How many days does the month containing local `(year, month)` hold? */
const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

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

/** A weekly clause. `every`/`offset` default to "every week". */
export const weeklyClause = (weekdays, every = 1, offset = 0) =>
    Object.freeze({ kind: TEMPORAL_WEEKLY, weekdays: Object.freeze([...weekdays]), every, offset });

/** A monthly clause over one or more ordinals of one weekday. */
export const monthlyClause = (weekday, ordinals) =>
    Object.freeze({ kind: TEMPORAL_MONTHLY, weekday, ordinals: Object.freeze([...ordinals]) });

/** An explicit-dates clause. */
export const datesClause = (dates) =>
    Object.freeze({ kind: TEMPORAL_DATES, dates: Object.freeze([...dates]) });

/** A pattern from clauses, with an optional bounded window. */
export const temporalPattern = (clauses, window = null) =>
    Object.freeze({ clauses: Object.freeze([...clauses]), window });

/**
 * Can this pattern ever produce a date, for any horizon? A clause with no
 * weekdays, no ordinals or no dates is VACUOUS.
 *
 * The distinction the two "this task will never appear" warnings turn on: a
 * vacuous pattern is a half-finished configuration, while a non-vacuous pattern
 * with no occurrence is a horizon that simply misses it. Two different sentences.
 */
export const temporalIsVacuous = (pattern) => !pattern.clauses.some((clause) => {
    if (clause.kind === TEMPORAL_WEEKLY) return clause.weekdays.length > 0;
    if (clause.kind === TEMPORAL_MONTHLY) return clause.ordinals.length > 0;
    return clause.dates.length > 0;
});

/**
 * Every date this pattern lands on between `startKey` and `endKey` inclusive, as
 * sorted, deduplicated `'YYYY-MM-DD'` keys.
 *
 * Pure, and total: an empty pattern or a backwards range returns `[]` rather than
 * throwing. Bounded in both arms by the longest run this engine can generate
 * (`MAX_ROSTER_WEEKS`), so a caller passing a decade-wide range gets the first
 * year of it rather than a hang — the same bound the monthly walk has always had.
 */
export const temporalOccurrences = (pattern, startKey, endKey) => {
    if (!isDateKey(startKey) || !isDateKey(endKey)) return [];

    const start = parseLocalDateKey(startKey);
    const end = parseLocalDateKey(endKey);
    if (end < start) return [];

    const from = pattern.window === null || !isDateKey(pattern.window.from)
        ? start
        : (parseLocalDateKey(pattern.window.from) > start ? parseLocalDateKey(pattern.window.from) : start);
    const to = pattern.window === null || !isDateKey(pattern.window.to)
        ? end
        : (parseLocalDateKey(pattern.window.to) < end ? parseLocalDateKey(pattern.window.to) : end);
    if (to < from) return [];

    const keys = new Set();

    for (const clause of pattern.clauses) {
        if (clause.kind === TEMPORAL_WEEKLY) {
            if (clause.weekdays.length === 0) continue;
            // One iteration per day of the run. `week` counts whole 7-day blocks
            // from `start` — the run's own week index, which is what makes
            // `every: 2` mean "alternate weeks OF THIS ROSTER" rather than
            // "alternate ISO weeks", a distinction a roster master would have to
            // look up a calendar to resolve.
            for (let i = 0; i < MAX_ROSTER_WEEKS * DAYS_PER_WEEK; i += 1) {
                const date = addDays(start, i);
                if (date > to) break;
                if (date < from) continue;
                if (!clause.weekdays.includes(date.getDay())) continue;
                if (Math.floor(i / DAYS_PER_WEEK) % clause.every !== clause.offset) continue;
                keys.add(toLocalDateKey(date));
            }
            continue;
        }

        if (clause.kind === TEMPORAL_MONTHLY) {
            let year = from.getFullYear();
            let month = from.getMonth();

            // One iteration per calendar month touched. Bounded by the longest run
            // this engine can generate (52 weeks is at most 14 months), with
            // headroom.
            for (let guard = 0; guard <= MAX_ROSTER_WEEKS; guard += 1) {
                if (new Date(year, month, 1) > to) break;

                for (const ordinal of clause.ordinals) {
                    const date = nthWeekdayOfMonth(year, month, ordinal, clause.weekday);
                    if (date !== null && date >= from && date <= to) keys.add(toLocalDateKey(date));
                }

                month += 1;
                if (month > 11) {
                    month = 0;
                    year += 1;
                }
            }
            continue;
        }

        for (const key of clause.dates) {
            if (!isDateKey(key)) continue;
            const date = parseLocalDateKey(key);
            if (date >= from && date <= to) keys.add(key);
        }
    }

    return [...keys].sort();
};

/**
 * Is this a usable TEMPORAL PATTERN? `{ valid, reason }`, same contract as
 * `validateRosterV2Config`, so a refusal can be shown to a roster master verbatim.
 *
 * This is the validator for the PRIMITIVE FORM — the shape a task may carry as
 * `temporal` instead of `days` or `recurrence`. It exists because the primitive is
 * accepted from a configuration (see `compileTemporal`) and this engine does not
 * accept input it has not checked: a malformed pattern must be REFUSED by name and
 * never silently ignored, which is the failure mode the whole file is built against.
 *
 * An EMPTY weekday list is legal, exactly as `days: []` is: it is a half-finished
 * configuration rather than a malformed one, and it is reported as the "no days
 * selected" warning instead of a refusal.
 */
export const validateTemporalPattern = (pattern, where = 'temporal') => {
    const invalid = (reason) => ({ valid: false, reason });

    if (!isPlainObject(pattern) || !Array.isArray(pattern.clauses)) {
        return invalid(`${where} must be an object of the form { clauses: [ … ] } — one clause per rule about when the task occurs.`);
    }
    if (pattern.clauses.length === 0) {
        return invalid(`${where} has no clauses, so the task would never occur. Give at least one clause, or leave temporal out and use days or recurrence.`);
    }

    for (let i = 0; i < pattern.clauses.length; i += 1) {
        const clause = pattern.clauses[i];
        const at = `${where} clause ${i + 1}`;

        if (!isPlainObject(clause)) {
            return invalid(`${at} is not a clause object — expected { kind: '${TEMPORAL_WEEKLY}' | '${TEMPORAL_MONTHLY}' | '${TEMPORAL_DATES}', … }.`);
        }

        if (clause.kind === TEMPORAL_WEEKLY) {
            if (!Array.isArray(clause.weekdays)) {
                return invalid(`${at} is weekly, so it needs weekdays: an array of whole numbers 0 (Sunday) to 6 (Saturday).`);
            }
            for (const day of clause.weekdays) {
                if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6) {
                    return invalid(`${at} has an invalid weekday ${JSON.stringify(day)} — use whole numbers 0 (Sunday) to 6 (Saturday).`);
                }
            }
            if (clause.every !== undefined && !isPositiveInt(clause.every)) {
                return invalid(`${at} has every: ${JSON.stringify(clause.every)} — it must be a whole number of at least 1 (1 is every week, 2 is alternate weeks).`);
            }
            const every = clause.every === undefined ? 1 : clause.every;
            if (clause.offset !== undefined) {
                if (!isNonNegativeInt(clause.offset)) {
                    return invalid(`${at} has offset: ${JSON.stringify(clause.offset)} — it must be a whole number of 0 or more.`);
                }
                if (clause.offset >= every) {
                    return invalid(`${at} has offset ${clause.offset} with every ${every}, so it can never match — the offset must be below every (with every: 2, use offset 0 or 1).`);
                }
            }
            continue;
        }

        if (clause.kind === TEMPORAL_MONTHLY) {
            if (typeof clause.weekday !== 'number' || !Number.isInteger(clause.weekday) || clause.weekday < 0 || clause.weekday > 6) {
                return invalid(`${at} has the weekday ${JSON.stringify(clause.weekday)} — use whole numbers 0 (Sunday) to 6 (Saturday).`);
            }
            if (!Array.isArray(clause.ordinals) || clause.ordinals.length === 0) {
                return invalid(`${at} is monthly, so it needs ordinals: a non-empty array of 1, 2, 3, 4, or 'last'.`);
            }
            for (const ordinal of clause.ordinals) {
                if (!RECURRENCE_ORDINALS.includes(ordinal)) {
                    return invalid(`${at} has the ordinal ${JSON.stringify(ordinal)} — use 1, 2, 3, 4, or 'last' for the final one of the month (most months have no 5th weekday).`);
                }
            }
            continue;
        }

        if (clause.kind === TEMPORAL_DATES) {
            if (!Array.isArray(clause.dates)) {
                return invalid(`${at} lists explicit dates, so it needs dates: an array of YYYY-MM-DD dates.`);
            }
            for (const key of clause.dates) {
                if (!isDateKey(key)) {
                    return invalid(`${at} has a date that is not a real YYYY-MM-DD date: ${JSON.stringify(key)}.`);
                }
            }
            continue;
        }

        return invalid(`${at} has the kind ${JSON.stringify(clause.kind)}, which is not a temporal kind — use '${TEMPORAL_WEEKLY}', '${TEMPORAL_MONTHLY}' or '${TEMPORAL_DATES}'.`);
    }

    if (isStated(pattern.window)) {
        const { window } = pattern;
        if (!isPlainObject(window) || !isDateKey(window.from) || !isDateKey(window.to)) {
            return invalid(`${where}.window must be an object of the form { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }, or left out so the pattern runs for the whole roster.`);
        }
        if (parseLocalDateKey(window.to) < parseLocalDateKey(window.from)) {
            return invalid(`${where}.window runs from ${window.from} back to ${window.to}, so it contains no dates at all.`);
        }
    }

    return { valid: true, reason: null };
};

/**
 * `{ ordinal: 3, weekday: 3 }` -> a monthly pattern, or `null`.
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
 * Every date this recurrence lands on between `startKey` and `endKey` inclusive,
 * as sorted `'YYYY-MM-DD'` keys.
 *
 * The `recurrence` sugar's face on `temporalOccurrences`, kept exported and
 * unchanged because a preview UI and 128 tests read it.
 */
export const recurrenceDatesBetween = (recurrence, startKey, endKey) => {
    const spec = normaliseRecurrence(recurrence);
    if (spec === null) return [];
    return temporalOccurrences(
        temporalPattern([monthlyClause(spec.weekday, [spec.ordinal])]),
        startKey,
        endKey,
    );
};

/**
 * The pattern a task's TEMPORAL SUGAR compiles to.
 *
 * `recurrence` wins over `days` — validation refuses a task that sets both, so
 * this ordering is belt and braces rather than a preference — and an absent
 * `days` means the shipped Mon–Fri default.
 */
const compileTemporal = (task) => {
    // THE PRIMITIVE FORM, accepted directly. This is what makes "the 1st AND the
    // 3rd Wednesday", "alternate weeks", "these four dates" and "only until the end
    // of March" reachable TODAY rather than after a wizard lands: there is no sugar
    // for any of them, and none is needed, because the general form is a field.
    //
    // JUDGMENT CALL, FLAGGED: `days` and `recurrence` remain the fields a roster
    // master types and the only ones the wizard writes, so `temporal` is an
    // engine-level input with no UI. It is VALIDATED rather than tolerated (see
    // `validateTemporalPattern`) because silently ignoring a malformed one is the
    // exact failure this engine exists to refuse. Combining it with `days` or
    // `recurrence` is a refusal, for the same reason those two refuse each other.
    if (isStated(task.temporal) && validateTemporalPattern(task.temporal).valid) {
        return temporalPattern(
            task.temporal.clauses.map((clause) => {
                if (clause.kind === TEMPORAL_MONTHLY) return monthlyClause(clause.weekday, clause.ordinals);
                if (clause.kind === TEMPORAL_DATES) return datesClause(clause.dates);
                return weeklyClause(
                    clause.weekdays,
                    clause.every === undefined ? 1 : clause.every,
                    clause.offset === undefined ? 0 : clause.offset,
                );
            }),
            isStated(task.temporal.window)
                ? { from: task.temporal.window.from, to: task.temporal.window.to }
                : null,
        );
    }

    const recurrence = normaliseRecurrence(task.recurrence);
    if (recurrence !== null) {
        return temporalPattern([monthlyClause(recurrence.weekday, [recurrence.ordinal])]);
    }
    return temporalPattern([
        weeklyClause(Array.isArray(task.days) ? task.days : ROSTER_V2_DEFAULTS.days),
    ]);
};

/**
 * A pattern as prose: `'the 3rd Wednesday of each month'`, `'every Monday and
 * Wednesday'`, `'Wednesday of every two weeks'`, `'the dates 2026-02-03,
 * 2026-02-17'`.
 *
 * EACH CLAUSE CARRIES ITS OWN ARTICLE, because "every" and "the" are not
 * interchangeable and the sentence this drops into cannot know which it needs. The
 * caller writes `runs on ${temporalLabel(pattern)}` — so a monthly pattern reads
 * "runs on the 3rd Wednesday of each month" exactly as it always has, and a weekly
 * one reads "runs on every Monday and Wednesday" rather than "the every Monday".
 * MEASURED: that double article is what the first weekly-pattern warning printed.
 *
 * Used by the "this task will never appear in this roster" warning. Before the
 * primitive layer only the monthly branch was reachable (a weekly pattern with
 * weekdays always occurs inside a run of whole weeks, and a vacuous pattern gets
 * the other sentence); a `temporal` pattern with a `window` reaches the others.
 */
export const temporalLabel = (pattern) => pattern.clauses.map((clause) => {
    if (clause.kind === TEMPORAL_MONTHLY) {
        const ordinals = joinWithAnd(clause.ordinals.map((o) => ORDINAL_PROSE[o]));
        return `the ${ordinals} ${WEEKDAY_NAMES[clause.weekday]} of each month`;
    }
    if (clause.kind === TEMPORAL_WEEKLY) {
        const days = joinWithAnd(clause.weekdays.map((d) => WEEKDAY_NAMES[d]));
        return clause.every === 1
            ? `every ${days}`
            : `${days} of every ${countWord(clause.every)} weeks`;
    }
    return `the dates ${clause.dates.join(', ')}`;
}).join(', and ');

/**
 * `taskName -> Set<dateKey>` for every task over one horizon — the day loop's
 * calendar, resolved once.
 *
 * Extracted from the generator when the quota arithmetic needed the same map at
 * VALIDATE time: "how many Saturdays does this run hold" has to be the same number
 * for the refusal and for the roster, or the engine refuses a configuration it would
 * have staffed (or, worse, the other way round).
 */
const resolveOccurrences = (tasks, startKey, endKey) => new Map(
    tasks.map((task) => [task.name, new Set(temporalOccurrences(task.temporal, startKey, endKey))]),
);

// --- 1c. THE CAPACITY PRIMITIVE: A CEILING ON A METER OVER A PERIOD -----------
//
// Five named limits had grown up separately: `maxPerDay` (duties in a day),
// `maxConcurrentPerDay` (the department default for it), "already on this task
// today", `maxConsecutiveDays` (working days in a row) and the two hours caps.
// Each had its own `if` in the candidate loop and its own reason clause.
//
// They are ONE THING: HOW MUCH OF A METER ONE PERSON MAY HOLD OVER ONE PERIOD.
//
//   LIMIT   { id, meter, period, rejection, mode, limitOf, usedBy, exempt }
//
//   meter    what is being counted — `'duties'`, `'hours'`, `'days'`.
//   period   over what — `'day'`, `'taskDay'` (this task, today), `'week'`,
//            `'run'` (the unbroken run of days ending yesterday).
//   mode     MODE_DISCRETE compares `used >= limit`: whole things, so holding the
//            limit already means one more would exceed it. MODE_CONTINUOUS
//            compares `used + cost > limit + HOURS_EPSILON`: a measured quantity,
//            so a duty that exactly fills a day is allowed (see the constant for
//            why an exact `>` would refuse `5.04 > 5.04`).
//   limitOf  the person's ceiling, already FTE-scaled where scaling applies —
//            `normaliseStaff` does that once, so this only reads it.
//   usedBy   what they already hold over the period, read from the running state
//            the day loop keeps.
//   exempt   a period-specific "this does not apply today" (the consecutive-day
//            limit's only such rule: somebody already working today is not
//            lengthening their run by taking another duty — the day is spoken for
//            either way, and how much they may do on one day is the DAY limit's
//            question).
//
// THE ORDER IS DATA, and it is the order the `unfilled` reason reads in:
// duty-count before hours, because "two duties is your limit" and "twelve hours is
// over your limit" are different sentences and the coarser one comes first; and
// the consecutive-day limit LAST, after the affinity gate, because it is the only
// one about days rather than about today. `SLOT_GATES` in section 4 is where that
// order is written down.
//
// A SIXTH LIMIT IS A SIXTH ROW. `maxPerWeek` (duties in a week), a monthly hours
// ceiling, or an ENFORCED rolling window (the four-week total this engine measures
// and warns about, section 7) are each a row plus a rejection code plus a running
// counter — no new branch in the candidate loop.

const METER_DUTIES = 'duties';
const METER_HOURS = 'hours';
const METER_DAYS = 'days';

const PERIOD_DAY = 'day';
const PERIOD_TASK_DAY = 'taskDay';
const PERIOD_WEEK = 'week';
const PERIOD_RUN = 'run';

/** Whole things: holding the limit already means one more would exceed it. */
const MODE_DISCRETE = 'discrete';
/** A measured quantity: the sum is compared, with a tolerance on the cap side. */
const MODE_CONTINUOUS = 'continuous';

/**
 * How many days in an unbroken run ending the day BEFORE `date` does `name`
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
 * The capacity limits this engine enforces, in the order they are asked.
 *
 * Every one is HARD: a position that would breach one goes to `unfilled` naming
 * the constraint, never to somebody the roster would have worked past it.
 *
 * `active` gates the two hours limits on the opt-in predicate — see section 0c.
 * When it is false the maps are never even read, so a configuration that has
 * never mentioned an hour is judged by exactly the limits that existed before
 * hours did.
 */
export const CAPACITY_LIMITS = Object.freeze([
    Object.freeze({
        id: 'taskPerDay',
        meter: METER_DUTIES,
        period: PERIOD_TASK_DAY,
        rejection: REJECT_ON_TASK,
        mode: MODE_DISCRETE,
        /**
         * ONE occurrence of one task per person per day, and this is also what stops
         * one person taking two positions of the same team shift: the state it reads
         * is per task per day, so the trio rule needs no separate machinery.
         */
        limitOf: () => 1,
        usedBy: (person, ctx) => (ctx.onTaskToday.has(person.name) ? 1 : 0),
        cost: () => 1,
    }),
    Object.freeze({
        id: 'dutiesPerDay',
        meter: METER_DUTIES,
        period: PERIOD_DAY,
        rejection: REJECT_CAPACITY,
        mode: MODE_DISCRETE,
        limitOf: (person) => person.maxPerDay,
        usedBy: (person, ctx) => ctx.dutiesOnDate.get(person.name) || 0,
        cost: () => 1,
    }),
    Object.freeze({
        id: 'hoursPerDay',
        meter: METER_HOURS,
        period: PERIOD_DAY,
        rejection: REJECT_DAILY_HOURS,
        mode: MODE_CONTINUOUS,
        active: (ctx) => ctx.hoursActive,
        limitOf: (person) => person.dailyHoursCap,
        usedBy: (person, ctx) => ctx.hoursOnDate.get(person.name) || 0,
        cost: (ctx) => ctx.task.hours,
    }),
    Object.freeze({
        id: 'hoursPerWeek',
        meter: METER_HOURS,
        period: PERIOD_WEEK,
        rejection: REJECT_WEEKLY_HOURS,
        mode: MODE_CONTINUOUS,
        active: (ctx) => ctx.hoursActive,
        limitOf: (person) => person.weeklyHoursCap,
        usedBy: (person, ctx) => ctx.hoursThisWeek.get(person.name) || 0,
        cost: (ctx) => ctx.task.hours,
    }),
    Object.freeze({
        id: 'consecutiveDays',
        meter: METER_DAYS,
        period: PERIOD_RUN,
        rejection: REJECT_CONSECUTIVE,
        mode: MODE_DISCRETE,
        limitOf: (person, ctx) => ctx.maxConsecutiveDays,
        usedBy: (person, ctx) => consecutiveRunBefore(ctx.dutiesByDate, person.name, ctx.date),
        cost: () => 1,
        // Already working today? Then this duty does not lengthen their run.
        exempt: (person, ctx) => (ctx.dutiesOnDate.get(person.name) || 0) > 0,
    }),
]);

/** The limits keyed by id, so `SLOT_GATES` names them rather than indexing them. */
const CAPACITY_BY_ID = Object.freeze(Object.fromEntries(
    CAPACITY_LIMITS.map((limit) => [limit.id, limit]),
));

/** Would taking this position breach `limit`? The one comparison, both modes. */
export const capacityBreached = (limit, person, ctx) => {
    if (limit.active !== undefined && !limit.active(ctx)) return false;
    if (limit.exempt !== undefined && limit.exempt(person, ctx)) return false;

    const ceiling = limit.limitOf(person, ctx);
    const used = limit.usedBy(person, ctx);
    if (limit.mode === MODE_DISCRETE) return used >= ceiling;
    return used + limit.cost(ctx) > ceiling + HOURS_EPSILON;
};

// --- 1d. THE AFFINITY PRIMITIVE: PREFERENCES WITH POLARITY --------------------
//
// `forbidPairs` says "never these two together". `continuity` says "the same
// person on every occurrence". They were a hard gate and a comparator inversion,
// with nothing in common but a name in `rules`.
//
// They are ONE THING with TWO AXES: a SHAPE and a POLARITY.
//
//   SHAPES
//     pair        two named people, considered against each other on one shift.
//     occurrence  one ROLE of one task, considered across its occurrences.
//
//   POLARITIES
//     forbid   HARD, negative. Never. (`forbidPairs`.)
//     require  HARD, positive. Only together. — NOT IMPLEMENTED.
//     prefer   SOFT, positive. Same again if the gates allow. (`continuity`.)
//     avoid    SOFT, negative. Somebody else this time. — NOT IMPLEMENTED.
//
// SO THE FOUR CELLS OF THE GRID ARE:
//
//              pair                         occurrence
//   forbid     forbidPairs        (built)   never the same person twice running
//   require    must-pair-with   (declared)  —
//   prefer     preferred partner            continuity          (built)
//   avoid      rotate-away      (declared)  deliberate variety
//
// TWO ARE BUILT AND TWO ARE DECLARED, and the declared two are declared HONESTLY:
// the constants exist, `resolveAffinities` will carry them, and NOTHING READS
// THEM. No configuration can produce one (validation accepts `forbidPairs` and a
// boolean `continuity`, and nothing else), so declaring them changes no roster.
// What they buy is that "must-pair-with" and "rotate-away" are a polarity and a
// reader rather than a seventh named flag: `require` joins `forbid` in
// `affinityForbids`, and `avoid` joins `prefer` in the comparator chooser.
//
// WHY POLARITY RATHER THAN TWO LISTS. A department that says "Ann and Bob always
// together" and one that says "Ann and Bob never together" are stating the same
// KIND of fact about the same pair, and the engine that keeps them in two
// differently-shaped fields will eventually apply one and forget the other. One
// shape, one reader, one place to be wrong.

const AFFINITY_PAIR = 'pair';
const AFFINITY_OCCURRENCE = 'occurrence';

/** HARD, negative: never. */
const POLARITY_FORBID = 'forbid';
/** HARD, positive: only together. DECLARED, NOT IMPLEMENTED. */
const POLARITY_REQUIRE = 'require';
/** SOFT, positive: the same again where the gates allow. */
const POLARITY_PREFER = 'prefer';
/** SOFT, negative: somebody else this time. DECLARED, NOT IMPLEMENTED. */
const POLARITY_AVOID = 'avoid';

/**
 * The four polarities, as a value — the grid in the section header, as data.
 *
 * `require` and `avoid` are DECLARED AND UNIMPLEMENTED: nothing produces one and
 * nothing reads one. They are here so that "must pair with" and "rotate away" are a
 * polarity a later agent fills in, rather than a seventh named flag.
 */
export const AFFINITY_POLARITIES = Object.freeze({
    forbid: POLARITY_FORBID,
    require: POLARITY_REQUIRE,
    prefer: POLARITY_PREFER,
    avoid: POLARITY_AVOID,
});

/** The two shapes an affinity can take. */
export const AFFINITY_SHAPES = Object.freeze({
    pair: AFFINITY_PAIR,
    occurrence: AFFINITY_OCCURRENCE,
});

/** Which polarities are a HARD gate rather than a preference. */
const HARD_POLARITIES = Object.freeze([POLARITY_FORBID, POLARITY_REQUIRE]);
/** Which polarities a candidate COMPARATOR reads. */
const SOFT_POLARITIES = Object.freeze([POLARITY_PREFER, POLARITY_AVOID]);

/**
 * `rules.forbidPairs` -> pairwise affinities of negative polarity.
 *
 * The sugar's only shape today. `[['Ann','Bob']]` is
 * `{ shape: 'pair', polarity: 'forbid', people: ['Ann','Bob'] }`.
 */
const compilePairAffinities = (forbidPairs) =>
    forbidPairs.map(([a, b]) => Object.freeze({
        shape: AFFINITY_PAIR,
        polarity: POLARITY_FORBID,
        people: Object.freeze([a, b]),
    }));

/**
 * `task.continuity` -> a positive cross-occurrence affinity on the task's ANCHOR
 * role, or nothing.
 *
 * `target` is the role the preference follows. It is the anchor rather than
 * literally `'lead'` because that is what continuity means — "the person the
 * cohort meets" — and a composition whose anchor is some other role would want
 * the same preference to follow it.
 */
const compileOccurrenceAffinities = (tasks) => tasks
    .filter((task) => task.continuity)
    .map((task) => Object.freeze({
        shape: AFFINITY_OCCURRENCE,
        polarity: POLARITY_PREFER,
        task: task.name,
        target: anchorRoleOf(task),
    }));

/**
 * Every affinity in force, from both sugars, in one list.
 *
 * `pairsByPerson` is the adjacency map the gate reads — built here rather than in
 * the loop so that the pool filter is a set lookup instead of a scan of the pair
 * list per candidate — and it holds only the HARD polarities, because a
 * preference is not a gate.
 */
export const resolveAffinities = (forbidPairs, tasks, staffNames) => {
    const list = [...compilePairAffinities(forbidPairs), ...compileOccurrenceAffinities(tasks)];

    const pairsByPerson = new Map();
    for (const name of staffNames) pairsByPerson.set(name, new Set());
    for (const affinity of list) {
        if (affinity.shape !== AFFINITY_PAIR) continue;
        if (!HARD_POLARITIES.includes(affinity.polarity)) continue;
        if (affinity.polarity !== POLARITY_FORBID) continue;
        const [a, b] = affinity.people;
        pairsByPerson.get(a).add(b);
        pairsByPerson.get(b).add(a);
    }

    /** taskName -> the positive cross-occurrence affinity on it, if any. */
    const preferSameByTask = new Map();
    for (const affinity of list) {
        if (affinity.shape !== AFFINITY_OCCURRENCE) continue;
        // Two steps, deliberately, and the same shape as the hard filter above:
        // "this is a preference rather than a gate", and then "and it is the one
        // preference polarity that is BUILT". `avoid` (rotate-away) falls out at the
        // second step, so implementing it is a reader here rather than a new branch.
        if (!SOFT_POLARITIES.includes(affinity.polarity)) continue;
        if (affinity.polarity !== POLARITY_PREFER) continue;
        preferSameByTask.set(affinity.task, affinity);
    }

    return { list, pairsByPerson, preferSameByTask };
};

/**
 * Does an affinity forbid `person` from joining the people already on this shift?
 *
 * Reads the adjacency map, so it is one set lookup per colleague already there.
 */
const affinityForbids = (person, ctx) => {
    const forbidden = ctx.affinities.pairsByPerson.get(person.name);
    for (const other of ctx.onTaskToday) {
        if (forbidden.has(other)) return true;
    }
    return false;
};

/**
 * Does a POSITIVE cross-occurrence affinity apply to this position? `true` makes
 * the candidate comparator prefer whoever has held it most in this run.
 *
 * Scoped to the position's ROLE, so asking for continuity on a clinic's lead does
 * not concentrate its co-lead slots on one person too.
 */
const affinityPrefersIncumbent = (task, position, affinities) => {
    const affinity = affinities.preferSameByTask.get(task.name);
    return affinity !== undefined && affinity.target === position.role;
};

// --- 1e. THE QUOTA PRIMITIVE: A FLOOR AS WELL AS A CEILING -------------------
//
// The sixth primitive, and until v1.10.1 the only one that was declared and not
// enforced. Everything else in this engine is a CAP. The medical lab scientists'
// rule is not a cap:
//
//   "each staff member works at least two Saturdays a month"
//
// and there was no field in which to say it. A `maxPerDay` of 2 does not say it, a
// `weeklyHours` of 42 does not say it, and `unavailable` says the opposite.
//
// A QUOTA is a floor and/or a ceiling on HOW MANY OCCURRENCES of a CLASS OF WORK
// one person takes over a PERIOD:
//
//   QUOTA  { subject, taskClass, period, min, max }
//
//   subject    whose count — `'person'` today. `'region'` (a whole band, which is
//              what "every junior does two Saturdays a month" actually says) is
//              DECLARED AND REFUSED: `scope: 'region'` is a validation refusal
//              naming the omission, never a value that is quietly dropped. That is
//              primitive-layer ledger item 11's lesson — an unimplemented value
//              that validates is worse than one that does not exist.
//   taskClass  which work counts. `{ kind: 'task', name }` or
//              `{ kind: 'category', category }` — the embryologists' "witnessing"
//              is a name and the lab's "Saturdays" may be either, depending on
//              whether the weekend is one task or three.
//   period     `'run'`, `'week'`, `'month'`. The same vocabulary CAPACITY uses,
//              deliberately, because a ceiling quota IS a capacity limit read from
//              the other end.
//   min / max  inclusive, either may be absent — but not both, because a quota
//              with neither bound says nothing.
//
// THE TWO SUGARS, and they are the only surfaces:
//
//   task.quota    = { per, min, max, scope }        — this task's own quota.
//   rules.quotas  = [{ category, per, min, max, scope }] — one quota over every
//                   task carrying that category, POOLED: three weekend tasks and a
//                   floor of two means two weekend duties, not two of each.
//
// FLOORS AND CEILINGS ARE NOT SYMMETRIC, AND THAT IS THE WHOLE DIFFICULTY.
//
//   A MAX IS HARD, and it is a capacity limit: `quotaCeilingLimit` builds a row of
//   exactly the shape section 1c's table holds — a meter (duties of a class) over a
//   period — and `capacityBreached` is the same comparison. It is built PER QUOTA
//   rather than listed in `CAPACITY_LIMITS` because a configuration may declare
//   several and the static table has five fixed rows; the gate walks them. A slot
//   that would breach one goes to `unfilled` with a reason naming the quota, the
//   period and the count, exactly as an hours breach does.
//
//   A MIN IS SOFT, PREFERRED, AND THEN WARNED ABOUT — never hard, and this is a
//   decision rather than a shortcut. A ceiling is answerable when a slot is
//   offered: yes or no. A floor is only knowable when the PERIOD IS FULL, and by
//   then there is nothing left to refuse. Refusing a slot because giving it to Ada
//   would leave Ben short would leave the slot EMPTY, which serves nobody: a floor
//   cannot be met by inventing capacity. So the engine does the only two honest
//   things:
//
//     1. PREFERS people who are behind, ahead of ordinary FTE-weighted fairness,
//        the way a positive occurrence affinity prefers the incumbent (section 5's
//        comparator chain). Every hard gate still comes first.
//     2. MEASURES the finished roster and NAMES every unmet floor in `warnings` —
//        the person, the task class, the period and the shortfall. Measured off the
//        roster rather than tracked during construction, for the same reason
//        `score.hardViolations` is (post-mortem A-RC4).
//
//   AND AN IMPOSSIBLE FLOOR IS REFUSED AT CONFIGURE TIME, WITH THE ARITHMETIC
//   SHOWN. Five people needing two Saturdays each in a month with four Saturdays
//   and one slot per Saturday is 10 duties demanded against 4 that exist. That is
//   not a roster that comes out slightly short — it is a typo or a policy nobody
//   costed, and it is refused in the same voice as the unknown-skill and
//   skill-times-band refusals (section 2).
//
// WHAT IS DELIBERATELY NOT HERE: no floor on a REGION (see `subject`); no floor
// that reaches across generation runs, so a month split over two runs is two
// partial months and the engine says so rather than pretending; and no
// hours-denominated quota — `min: 2` counts DUTIES, because "two Saturdays" is a
// count of Saturdays and an hours floor is a different sentence nobody has said.

const QUOTA_SUBJECT_PERSON = 'person';
const QUOTA_SUBJECT_REGION = 'region';
const QUOTA_PERIOD_RUN = 'run';
const QUOTA_PERIOD_WEEK = 'week';
const QUOTA_PERIOD_MONTH = 'month';

/** The quota vocabulary, as a value. `region` is declared and refused — see above. */
export const QUOTA_SUBJECTS = Object.freeze({ person: QUOTA_SUBJECT_PERSON, region: QUOTA_SUBJECT_REGION });
export const QUOTA_PERIODS = Object.freeze({
    run: QUOTA_PERIOD_RUN,
    week: QUOTA_PERIOD_WEEK,
    month: QUOTA_PERIOD_MONTH,
});

const QUOTA_CLASS_TASK = 'task';
const QUOTA_CLASS_CATEGORY = 'category';

/** The class kinds, as a value. A third kind (a predicate) is a row below. */
export const QUOTA_CLASS_KINDS = Object.freeze({ task: QUOTA_CLASS_TASK, category: QUOTA_CLASS_CATEGORY });

/**
 * The class kinds, as data: does a task belong to this class, and what is the
 * class called in a sentence?
 *
 * `label` is what every quota warning and every quota refusal names, so a task
 * quota reads `Saturday Bench` and a category quota reads `category WEEKEND` —
 * one definition, because a roster master matching a warning against their own
 * configuration is matching on this string.
 */
const QUOTA_CLASSES = Object.freeze({
    [QUOTA_CLASS_TASK]: Object.freeze({
        matches: (task, taskClass) => task.name === taskClass.name,
        label: (taskClass) => taskClass.name,
    }),
    [QUOTA_CLASS_CATEGORY]: Object.freeze({
        matches: (task, taskClass) => task.category === taskClass.category,
        label: (taskClass) => `category ${taskClass.category}`,
    }),
});

/** `'Saturday Bench'` -> the class of that one task. */
const quotaClassOfTask = (name) => Object.freeze({ kind: QUOTA_CLASS_TASK, name });
/** `'WEEKEND'` -> the class of every task carrying that category. */
const quotaClassOfCategory = (category) => Object.freeze({ kind: QUOTA_CLASS_CATEGORY, category });

/** Does this quota count this task? One table lookup, no per-kind branch. */
export const quotaCountsTask = (quota, task) =>
    QUOTA_CLASSES[quota.taskClass.kind].matches(task, quota.taskClass);

/** What this quota's class is CALLED, in every sentence about it. */
export const quotaClassLabel = (quota) => QUOTA_CLASSES[quota.taskClass.kind].label(quota.taskClass);

/**
 * How a date is bucketed into a period, as data.
 *
 * `week` reads `weekStartKeyOf` — the Monday that OPENED the calendar week — and
 * NOT the generation loop's own week index, even though the two always agree
 * (`generateRosterV2` snaps to a Monday and walks whole 7-day blocks). One
 * definition, because the audit re-reads a finished roster and has no loop index to
 * consult, and two definitions of "which week is this" would eventually disagree in
 * front of a roster master.
 *
 * `month` slices the date KEY rather than constructing a `Date`: `'2027-02-13'` is
 * in `'2027-02'` by inspection, with no timezone to get wrong (post-mortem B2's
 * lesson applied by not needing it).
 */
const QUOTA_PERIOD_KEYS = Object.freeze({
    [QUOTA_PERIOD_RUN]: () => QUOTA_PERIOD_RUN,
    [QUOTA_PERIOD_WEEK]: (dateKey) => weekStartKeyOf(dateKey),
    [QUOTA_PERIOD_MONTH]: (dateKey) => dateKey.slice(0, 7),
});

/** Which bucket of this quota's period does `dateKey` fall in? */
export const quotaPeriodKey = (quota, dateKey) => QUOTA_PERIOD_KEYS[quota.period](dateKey);

/** `'2027-02'` -> `2027-02`; a week -> `the week of 2027-02-01`; the run -> `the run`. */
const quotaPeriodLabel = (quota, periodKey) => {
    if (quota.period === QUOTA_PERIOD_RUN) return 'the run';
    if (quota.period === QUOTA_PERIOD_WEEK) return `the week of ${periodKey}`;
    return periodKey;
};

/**
 * `config` -> the quotas in force, in a fixed order: every `task.quota` in task
 * order, then every `rules.quotas` entry in declaration order.
 *
 * ORDER IS OUTPUT, not housekeeping: it decides the order the ceiling gate asks
 * the questions in and therefore which quota a reason string names when two would
 * both refuse, and it decides the order the unmet-floor warnings appear in.
 *
 * Returns a FROZEN EMPTY LIST for a configuration that declares none — which is
 * every configuration written before this section existed, and is why the whole
 * feature is inert rather than opt-in.
 */
export const resolveQuotas = (config) => {
    if (!isPlainObject(config)) return Object.freeze([]);
    const out = [];

    if (Array.isArray(config.tasks)) {
        for (const task of config.tasks) {
            if (!isPlainObject(task) || !isPlainObject(task.quota)) continue;
            if (!isNonEmptyString(task.name)) continue;
            out.push(compileQuota(task.quota, quotaClassOfTask(task.name)));
        }
    }
    if (isPlainObject(config.rules) && Array.isArray(config.rules.quotas)) {
        for (const entry of config.rules.quotas) {
            if (!isPlainObject(entry) || !isNonEmptyString(entry.category)) continue;
            out.push(compileQuota(entry, quotaClassOfCategory(entry.category)));
        }
    }

    return Object.freeze(out);
};

/**
 * One sugar entry -> the primitive. `per` becomes `period` and `scope` becomes
 * `subject`, because the sugar is written in a roster master's words and the
 * primitive in the engine's; absent bounds become `null` rather than 0, since 0 is
 * a real ceiling ("nobody may take this") and absence is not.
 */
const compileQuota = (raw, taskClass) => Object.freeze({
    subject: isNonEmptyString(raw.scope) ? raw.scope : QUOTA_SUBJECT_PERSON,
    taskClass,
    period: isNonEmptyString(raw.per) ? raw.per : QUOTA_PERIOD_RUN,
    min: isNonNegativeInt(raw.min) ? raw.min : null,
    max: isNonNegativeInt(raw.max) ? raw.max : null,
});

/** The shape `resolveQuotas` returns. Pure documentation with a type. */
export const quotaOf = ({ subject = QUOTA_SUBJECT_PERSON, taskClass, period = QUOTA_PERIOD_RUN, min = null, max = null }) =>
    Object.freeze({ subject, taskClass, period, min, max });

/**
 * A quota's CEILING as a CAPACITY LIMIT — the same eight-field row section 1c's
 * table holds, compared by the same `capacityBreached`.
 *
 * Built per quota instead of listed in `CAPACITY_LIMITS` because a configuration
 * may declare any number of quotas and that table is five fixed department-wide
 * rows. `usedBy` is injected rather than reached for, so the same row shape serves
 * the generator (reading the running counters) and the audit (reading the finished
 * roster).
 */
const quotaCeilingLimit = (quota, index, usedBy) => Object.freeze({
    id: `quotaMax:${index}`,
    meter: METER_DUTIES,
    period: quota.period,
    rejection: REJECT_QUOTA,
    mode: MODE_DISCRETE,
    limitOf: () => quota.max,
    usedBy,
    cost: () => 1,
    quota,
});

/**
 * Every ceiling quota as a capacity limit, reading `counts` — the
 * `quotaIndex -> (periodKey -> (name -> duties))` ledger both the generator and
 * the audit build.
 */
const quotaCeilingLimits = (quotas, counts) => quotas
    .map((quota, index) => (quota.max === null ? null : quotaCeilingLimit(quota, index, (person, ctx) => (
        counts[index].get(quotaPeriodKey(quota, ctx.dateKey))?.get(person.name) || 0
    ))))
    .filter((limit) => limit !== null);

/** An empty `quotaIndex -> (periodKey -> (name -> duties))` ledger. */
const emptyQuotaCounts = (quotas) => quotas.map(() => new Map());

/** Add one duty of `dateKey` to every quota that counts `task`. */
const countQuotaDuty = (quotas, counts, task, name, dateKey) => {
    for (let i = 0; i < quotas.length; i += 1) {
        if (!quotaCountsTask(quotas[i], task)) continue;
        const periodKey = quotaPeriodKey(quotas[i], dateKey);
        if (!counts[i].has(periodKey)) counts[i].set(periodKey, new Map());
        const bucket = counts[i].get(periodKey);
        bucket.set(name, (bucket.get(name) || 0) + 1);
    }
};

/**
 * MEASURE a finished roster against the quotas: how many duties of each class did
 * each person hold in each period bucket?
 *
 * One definition, read by the unmet-floor warnings AND by the read-back audit, so
 * the sentence a roster master gets and the violation count cannot disagree. A
 * shift naming a task the configuration does not have is skipped — nothing knows
 * what class it belongs to, exactly as nothing knows its hours.
 */
const measureQuotaCounts = (roster, quotas, byTask) => {
    const counts = emptyQuotaCounts(quotas);
    if (quotas.length === 0) return counts;

    for (const dateKey of Object.keys(roster).sort()) {
        for (const shift of roster[dateKey]) {
            const task = byTask.get(shift.task);
            if (!task) continue;
            for (const name of shiftAssignees(shift)) {
                countQuotaDuty(quotas, counts, task, name, dateKey);
            }
        }
    }
    return counts;
};

/** How many duties of this quota's class does `name` hold in this bucket? */
const quotaHeld = (counts, index, periodKey, name) =>
    counts[index].get(periodKey)?.get(name) || 0;

/**
 * The PERIOD BUCKETS of one quota that a run from `startKey` to `endKey` touches,
 * in chronological order, each carrying whether the run holds the WHOLE of it.
 *
 * `whole` is the load-bearing field, and it is why the impossible-floor refusal is
 * not simply arithmetic over the run. A four-week run from a Monday almost never
 * lines up with a calendar month, so a monthly floor of two will meet a March that
 * the run holds three days of. That is a HORIZON artefact and not a broken policy:
 * a partial bucket is never refused and never reported as a shortfall — it gets one
 * warning saying the run holds only part of it, and the floor is judged where it
 * can be judged.
 */
const quotaPeriodBuckets = (quota, startKey, endKey) => {
    if (quota.period === QUOTA_PERIOD_RUN) {
        return [{ key: QUOTA_PERIOD_RUN, from: startKey, to: endKey, whole: true }];
    }

    if (quota.period === QUOTA_PERIOD_WEEK) {
        // The run is whole 7-day blocks from a Monday, so every week of it is whole.
        const buckets = [];
        const start = parseLocalDateKey(startKey);
        for (let offset = 0; ; offset += DAYS_PER_WEEK) {
            const from = toLocalDateKey(addDays(start, offset));
            if (from > endKey) break;
            buckets.push({
                key: from,
                from,
                to: toLocalDateKey(addDays(start, offset + DAYS_PER_WEEK - 1)),
                whole: true,
            });
        }
        return buckets;
    }

    const buckets = [];
    const start = parseLocalDateKey(startKey);
    let year = start.getFullYear();
    let month = start.getMonth();
    // Bounded by the longest run this engine accepts (52 weeks -> 14 months).
    for (let guard = 0; guard <= MAX_ROSTER_WEEKS; guard += 1) {
        const firstKey = toLocalDateKey(new Date(year, month, 1));
        if (firstKey > endKey) break;
        const lastKey = toLocalDateKey(new Date(year, month, daysInMonth(year, month)));
        buckets.push({
            key: firstKey.slice(0, 7),
            from: firstKey < startKey ? startKey : firstKey,
            to: lastKey > endKey ? endKey : lastKey,
            whole: firstKey >= startKey && lastKey <= endKey,
        });
        month += 1;
        if (month > 11) {
            month = 0;
            year += 1;
        }
    }
    return buckets;
};

/** The tasks this quota counts, in configuration order. */
const quotaTasks = (quota, tasks) => tasks.filter((task) => quotaCountsTask(quota, task));

/** How is this quota's period written in a sentence? `per month`, `over the run`. */
const quotaPeriodPhrase = (quota) =>
    (quota.period === QUOTA_PERIOD_RUN ? 'over the run' : `per ${quota.period}`);

/** Where a roster master DECLARED this quota, so a refusal names the field they typed. */
const quotaSource = (quota) => (quota.taskClass.kind === QUOTA_CLASS_TASK
    ? `Task ${quota.taskClass.name}'s quota`
    : `The rules.quotas entry for category ${quota.taskClass.category}`);

/**
 * Who is SUBJECT to this quota: everybody who could fill SOME position of SOME task
 * it counts, judged on STANDING eligibility only — the skill they hold, the band
 * they are in, and whether any cohort window of theirs names the task at all.
 *
 * PLUS ONE CAPACITY FACT, and only one: when the hours model is in force, somebody
 * whose FTE-scaled day cannot hold a single occurrence of any task in the class is
 * not subject to the floor either. That is not tidiness — it is the difference
 * between a true refusal and a false one. The impossible-floor arithmetic multiplies
 * this population by `min`, so counting a 0.6-FTE colleague whose 5.04-hour day
 * cannot hold an 8-hour Saturday would REFUSE a configuration that is in fact
 * perfectly staffable. Measured: three people, four Saturdays, one slot each and a
 * floor of two refuses at 6 > 4, and it should not when one of the three could never
 * take one.
 *
 * A JUDGMENT CALL, and the ledger flags it. The alternative reading is that a
 * `scope: 'person'` floor applies to every person in the pool full stop, which would
 * make a floor on a skill-gated task refuse in every mixed team — a floor on
 * somebody who can never do the work is a contradiction rather than a policy. The
 * cost is that shrinking the population is SILENT unless something says so, which is
 * why the generator names the excluded people in a warning rather than leaving them
 * to be noticed.
 *
 * The line drawn here is PERMANENT inability, never a day's worth of it: leave, a
 * full day, a consecutive-day run and a forbidden pairing are all things that happen
 * to somebody who could otherwise do the work, and the floor still applies to them —
 * which is exactly when it is reported unmet.
 */
const quotaSubjects = (quota, tasks, staff, hoursActive = false) => {
    const counted = quotaTasks(quota, tasks);
    return staff.filter((person) => counted.some((task) => {
        if (hoursActive && task.hours > person.dailyHoursCap + HOURS_EPSILON) return false;
        return task.positions.some(
            (position) => meetsEligibility(person, position.eligibility, { dateKey: null }),
        );
    }));
};

/** The dates of `task` inside one period bucket, in order. */
const bucketDatesOf = (task, bucket, occurrencesByTask) =>
    [...occurrencesByTask.get(task.name)]
        .filter((dateKey) => dateKey >= bucket.from && dateKey <= bucket.to)
        .sort();

/**
 * How many duties of this quota's class EXIST in one period bucket: occurrences
 * times people per occurrence, summed over every task the quota counts.
 *
 * This is the supply side of the impossible-floor arithmetic, and it counts
 * POSITIONS rather than shifts because that is what a person can be given: one
 * Saturday needing a lead and a co-lead is two Saturdays' worth of quota.
 */
const quotaSupplyIn = (quota, tasks, bucket, occurrencesByTask) => quotaTasks(quota, tasks)
    .reduce((sum, task) => sum + bucketDatesOf(task, bucket, occurrencesByTask).length * task.positions.length, 0);

/** Could this person's cohort windows let them take ANY of the class's work here? */
const quotaReachableIn = (quota, tasks, bucket, occurrencesByTask, person) => quotaTasks(quota, tasks)
    .some((task) => bucketDatesOf(task, bucket, occurrencesByTask)
        .some((dateKey) => windowsAdmit(person.windows, task.name, dateKey)));

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
     * The seniority SCALE this configuration is judged against. One seam, read
     * once, so that every refusal below names ranks and regions in the scale's own
     * words instead of hardcoding one profession's.
     */
    const scale = resolveGradeScale(rules);

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

        // --- COHORT WINDOWS (section 0e(ii)) ----------------------------------
        //
        // Shape only, here. Whether the tasks a window names EXIST, and whether a
        // task is left with nobody whose window covers the run at all, are
        // cross-checks that need the task list and live below it.
        if (isStated(person.windows)) {
            if (!Array.isArray(person.windows)) {
                return invalid(`${name}'s windows must be an array of cohort windows, e.g. [{ from: '2026-09-01', to: '2026-12-31' }] — or left out so that they are eligible on every date.`);
            }
            if (person.windows.length === 0) {
                // The same call `slots: []` gets: an empty list would leave them
                // eligible for nothing at all, which is a half-finished edit rather
                // than a policy. "Always available" is said by omitting the field.
                return invalid(`${name} has windows: [], which would make them eligible for nothing at all. Leave windows out so that they are eligible on every date, or give at least one window.`);
            }
            for (let w = 0; w < person.windows.length; w += 1) {
                const window = person.windows[w];
                const at = `${name}'s window ${w + 1}`;

                if (!isPlainObject(window)) {
                    return invalid(`${at} is not a window object — expected { from, to, tasks, label }, e.g. { from: '2026-09-01', to: '2026-12-31', label: 'team B block' }.`);
                }
                for (const edge of ['from', 'to']) {
                    if (isStated(window[edge]) && !isDateKey(window[edge])) {
                        return invalid(`${at} has a ${edge} that is not a real YYYY-MM-DD date: ${JSON.stringify(window[edge])}.`);
                    }
                }
                if (isStated(window.from) && isStated(window.to) && window.from > window.to) {
                    return invalid(`${at} runs from ${window.from} to ${window.to}, which ends before it starts. Swap the two dates.`);
                }
                if (isStated(window.tasks)) {
                    if (!Array.isArray(window.tasks) || window.tasks.length === 0) {
                        return invalid(`${at}'s tasks must be a non-empty array of task names — or left out so the window admits every task.`);
                    }
                    for (const taskName of window.tasks) {
                        if (!isNonEmptyString(taskName)) {
                            return invalid(`${at} names a task that is not a name: ${JSON.stringify(taskName)}.`);
                        }
                    }
                }
                if (isStated(window.label) && !isNonEmptyString(window.label)) {
                    return invalid(`${at} has a label that is not a label — give it a name such as 'team B block', or leave it out.`);
                }
                // A window with no bound of any kind admits everything on every date,
                // which is what having no windows already means. Refused rather than
                // ignored, because in a LIST of windows it silently cancels every
                // other window the person has — the loudest possible surprise.
                if (!isStated(window.from) && !isStated(window.to) && !isStated(window.tasks)) {
                    return invalid(`${at} has no from, no to and no tasks, so it admits every task on every date and cancels every other window ${name} has. Give it a date range, a task list, or remove it.`);
                }
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
                return invalid(`${name}'s grade is ${JSON.stringify(person.grade)}, which is not on ${scale.prose.scaleTitle} — use one of ${scale.span} (case does not matter), or leave it out if it is not recorded.`);
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

    /**
     * How many people hold a grade in each band — the eligibility floor.
     *
     * Built from the scale's own region order rather than written out, so a scale
     * with two regions or five counts them all instead of three by name.
     */
    const inBandCount = Object.fromEntries(scale.regionOrder.map((name) => [name, 0]));
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

    /**
     * ONE quota shape check, read by both sugars — `task.quota` and each
     * `rules.quotas` entry — so a floor typed in either place is refused in the same
     * words. Returns a reason, or `null` for "this quota is well-formed".
     *
     * `where` is the field the roster master typed, so the sentence names their own
     * configuration rather than the primitive it compiles to.
     */
    const quotaShapeReason = (raw, where) => {
        if (!isPlainObject(raw)) {
            return `${where} must be an object of the form { per: 'month', min: 2 } — a floor, a ceiling, or both.`;
        }
        if (isStated(raw.per) && !Object.values(QUOTA_PERIODS).includes(raw.per)) {
            return `${where} has per: ${JSON.stringify(raw.per)}, which is not a period — use ${Object.values(QUOTA_PERIODS).join(', ')}.`;
        }
        if (isStated(raw.scope) && raw.scope !== QUOTA_SUBJECTS.person) {
            // DECLARED AND REFUSED, never quietly counted per person: a band-wide
            // quota ("every junior does two Saturdays a month") is a different
            // constraint with a different arithmetic, and primitive-layer ledger item
            // 11's lesson is that an unimplemented value which validates is worse
            // than one that does not exist.
            if (raw.scope === QUOTA_SUBJECTS.region) {
                return `${where} has scope: 'region'. A quota over a whole band — "every junior does two Saturdays a month" — is declared in this engine and NOT implemented, so it is refused rather than silently counted per person. Use scope: 'person', or say it per person and check the band yourself.`;
            }
            return `${where} has scope: ${JSON.stringify(raw.scope)}, which is not a quota subject — use 'person', or leave scope out.`;
        }
        for (const bound of ['min', 'max']) {
            if (!isStated(raw[bound])) continue;
            if (!isPositiveInt(raw[bound])) {
                // `min: 0` is met by doing nothing and `max: 0` says the task may
                // never be staffed; both are a field left half-edited rather than a
                // policy, so both are refused instead of being obeyed literally.
                return `${where} has ${bound}: ${JSON.stringify(raw[bound])} — it must be a whole number of at least 1. A ${bound} of 0 ${bound === 'min' ? 'is met by doing nothing' : 'would mean the work may never be staffed at all'}, so leave it out instead.`;
            }
        }
        if (!isStated(raw.min) && !isStated(raw.max)) {
            return `${where} has neither min nor max, so it asks for nothing. Give a floor (min), a ceiling (max), or both.`;
        }
        if (isStated(raw.min) && isStated(raw.max) && raw.min > raw.max) {
            return `${where} has min ${raw.min} and max ${raw.max} — a floor above a ceiling cannot be satisfied by any roster.`;
        }
        return null;
    };

    // --- tasks ----------------------------------------------------------------
    if (!Array.isArray(tasks) || tasks.length === 0) {
        return invalid('The task list is empty — add at least one task.');
    }

    const seenTasks = new Set();
    /** Every category a task carries, for `rules.quotas` to be checked against. */
    const seenCategories = new Set();

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

        // `temporal` is the PRIMITIVE both of the two named calendars compile to,
        // and it is accepted directly (see `compileTemporal`) — so it is validated
        // directly, and it is mutually exclusive with both of them for exactly the
        // reason they are mutually exclusive with each other: there is no reading of
        // "these clauses AND every Wednesday" that is not one of the two with extra
        // words, and silently preferring one would make the ignored field a trap.
        if (isStated(task.temporal)) {
            for (const field of ['days', 'recurrence']) {
                if (isStated(task[field])) {
                    return invalid(`Task ${name} sets both temporal and ${field} — temporal IS the general form that ${field} compiles to, so giving both says the same thing twice and disagrees with itself. Remove whichever one is not meant.`);
                }
            }
            const patternCheck = validateTemporalPattern(task.temporal, `Task ${name}'s temporal`);
            if (!patternCheck.valid) return invalid(patternCheck.reason);
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
                if (isStated(entry.band) && (typeof entry.band !== 'string' || !scale.regionOrder.includes(entry.band))) {
                    return invalid(`${at} names the band ${JSON.stringify(entry.band)}, which is not a band — use ${scale.regionOrder.join(', ')} (lower case), or leave band out so that any grade may fill the slot.`);
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
                    // The same requirement list the ENGINE will build for this
                    // entry, read through the same deduplicating helper, so the
                    // refusal cannot name a skill the gate would not check.
                    for (const skill of skillsRequiredBy(eligibilityOf(
                        skillRequirement(task.requiresSkill),
                        skillRequirement(entrySkill),
                    ))) {
                        needs.push(`skill ${skill}`);
                    }
                    return invalid(`${at} (${slotBaseLabel(entry, scale)}) needs ${needs.join(' and ')}, and nobody in the staff pool qualifies, so that slot would be unfilled on every date. Check the grades and the skills, widen the slot, or move the band boundaries.`);
                }
            }
        }

        if (task.category !== undefined && task.category !== null && !isNonEmptyString(task.category)) {
            return invalid(`Task ${name}'s category must be a non-empty label.`);
        }
        seenCategories.add(isNonEmptyString(task.category) ? task.category : ROSTER_V2_DEFAULTS.category);

        // --- QUOTA (section 1e) -----------------------------------------------
        // Shape only, here. Whether a FLOOR is arithmetically reachable needs the
        // horizon, the occurrences and the whole staff pool, and is checked below.
        if (isStated(task.quota)) {
            const reason = quotaShapeReason(task.quota, `Task ${name}'s quota`);
            if (reason !== null) return invalid(reason);
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

        // `minGrade` is a FLOOR ON EVERY ASSIGNEE, not a band gate on the lead.
        // Absent means no floor, which is every task written before this existed.
        if (task.minGrade !== undefined && task.minGrade !== null && task.minGrade !== '') {
            if (typeof task.minGrade !== 'string' || rankOfGrade(task.minGrade, scale) === null) {
                return invalid(`Task ${name}'s minGrade is ${JSON.stringify(task.minGrade)}, which is not a grade on the ${scale.span} scale. Give a grade such as ${scale.labelOfRank(scale.firstRank)} or ${scale.labelOfRank(scale.lastRank)}, or leave it out so that any grade may cover the task.`);
            }
            // NOBODY MEETS IT — refused loudly at configure time, the same way a
            // skill nobody holds and a band nobody is in already are. A floor
            // above the whole department is a decimal point in the wrong place,
            // not a policy, and every slot of the task would be unfilled on every
            // date.
            const floorRank = rankOfGrade(task.minGrade, scale);
            const tallest = staff.reduce(
                (best, person) => {
                    const rank = rankOfGrade(person.grade, scale);
                    return rank !== null && (best === null || rank > best.rank) ? { name: person.name, rank } : best;
                },
                null,
            );
            if (tallest === null || tallest.rank < floorRank) {
                const highest = tallest === null
                    ? 'nobody in the staff pool has a grade recorded at all'
                    : `the highest graded is ${tallest.name} at ${scale.labelOfRank(tallest.rank)}`;
                return invalid(`Task ${name} requires a grade of at least ${scale.labelOfRank(floorRank)}, but ${highest}, so every slot of this task would be unfilled on every date. Lower the floor, or record the grades of the people who can cover it.`);
            }
        }

        // `leadBands` restricts who may LEAD. Absent means "any grade may lead",
        // which is every task that existed before grades did.
        if (task.leadBands !== undefined && task.leadBands !== null) {
            if (!Array.isArray(task.leadBands)) {
                return invalid(`Task ${name}'s leadBands must be an array of band names — any of ${scale.regionOrder.join(', ')} — or left out so that any grade may lead it.`);
            }
            if (task.leadBands.length === 0) {
                return invalid(`Task ${name} has leadBands: [], which no grade can satisfy, so every one of its lead slots would be unfilled. Leave leadBands out to let any grade lead it.`);
            }

            const wanted = new Set();
            for (const band of task.leadBands) {
                if (typeof band !== 'string' || !scale.regionOrder.includes(band)) {
                    return invalid(`Task ${name} names the lead band ${JSON.stringify(band)}, which is not a band — use ${scale.regionOrder.join(', ')} (lower case).`);
                }
                wanted.add(band);
            }

            // The band twin of the unknown-skill rule: loud, at configure time.
            // Generating a roster in which every lead slot of this task is
            // unfilled is how a mis-set band boundary reaches a clinician.
            const holders = scale.regionOrder.reduce(
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

        // --- rules.quotas: a quota over a CATEGORY of tasks --------------------
        if (isStated(rules.quotas)) {
            if (!Array.isArray(rules.quotas)) {
                return invalid("rules.quotas must be an array of category quotas, e.g. [{ category: 'WEEKEND', per: 'month', min: 2 }].");
            }
            for (let q = 0; q < rules.quotas.length; q += 1) {
                const entry = rules.quotas[q];
                const at = `rules.quotas entry ${q + 1}`;

                if (!isPlainObject(entry)) {
                    return invalid(`${at} is not a quota object — expected { category, per, min, max }, e.g. { category: 'WEEKEND', per: 'month', min: 2 }.`);
                }
                if (!isNonEmptyString(entry.category)) {
                    return invalid(`${at} has no category. A rules-level quota counts every task carrying one category — name it, or put the quota on the task itself.`);
                }
                // The category twin of the unknown-skill refusal, and loud for the
                // same reason: a misspelled category counts NOTHING, so a floor of
                // two would be reported unmet on every period for every person and a
                // ceiling would never bind. Silently useless is the one thing a
                // constraint may not be.
                if (!seenCategories.has(entry.category)) {
                    return invalid(`${at} counts category ${entry.category}, which no task carries (the categories in use are ${[...seenCategories].sort().join(', ')}). Check the spelling, or set that category on the tasks it should count.`);
                }
                const reason = quotaShapeReason(entry, at);
                if (reason !== null) return invalid(reason);
            }
        }
    }

    // --- the cross-checks: quotas and cohort windows against the whole run -----
    //
    // These are LAST because each of them needs everything above it: the horizon, the
    // occurrence dates every task actually has inside it, the staff pool as the engine
    // normalises it, and the positions each task compiles to. They are the composed
    // twins of the unknown-skill and skill-times-band refusals — a constraint that
    // could not be satisfied on any date of any run is a typo or an uncosted policy,
    // and finding it at configure time is the whole point of having a validator.
    //
    // COMPILED ONLY WHEN SOMETHING NEEDS IT. A configuration with no windows and no
    // quotas walks straight past this block and pays nothing (primitive-layer ledger
    // item 20 counts the compilations, so this one is counted too: it is a FOURTH
    // `normaliseTasks` per generation, and only for a configuration that asked).
    const windowsActive = cohortWindowsRequested(config);
    const declaredQuotas = resolveQuotas(config);

    if (windowsActive || declaredQuotas.length > 0) {
        const normalisedStaff = normaliseStaff(
            staff,
            isPlainObject(rules) && isPositiveInt(rules.maxConcurrentPerDay)
                ? rules.maxConcurrentPerDay
                : ROSTER_V2_DEFAULTS.maxConcurrentPerDay,
            bands,
            hoursRules,
        );
        const normalisedTasks = normaliseTasks(tasks, scale, windowsActive);
        const start = snapToMonday(parseLocalDateKey(startDate));
        const effectiveStart = toLocalDateKey(start);
        const horizonEndKey = toLocalDateKey(addDays(start, weeks * DAYS_PER_WEEK - 1));
        const occurrencesByTask = resolveOccurrences(normalisedTasks, effectiveStart, horizonEndKey);
        const taskNames = new Set(normalisedTasks.map((task) => task.name));

        if (windowsActive) {
            for (const person of normalisedStaff) {
                if (person.windows === null) continue;
                for (let w = 0; w < person.windows.length; w += 1) {
                    const window = person.windows[w];
                    if (window.tasks === null) continue;
                    for (const named of window.tasks) {
                        if (taskNames.has(named)) continue;
                        return invalid(`${person.name}'s window ${w + 1} names the task ${named}, which is not in the task list (the tasks are ${[...taskNames].join(', ')}). Check the spelling, or remove it from the window.`);
                    }
                }
            }

            // A TASK NOBODY'S WINDOW COVERS IS A REFUSAL. Every one of its slots would
            // be unfilled on every date of the run — the same outcome as a skill
            // nobody holds, and the same call. Somebody with NO windows is eligible
            // always, so this can only fire when every staff member has windows and
            // none of them reaches this task inside the horizon.
            for (const task of normalisedTasks) {
                if (occurrencesByTask.get(task.name).size === 0) continue;
                const dates = [...occurrencesByTask.get(task.name)].sort();
                const reachable = normalisedStaff.filter(
                    (person) => dates.some((dateKey) => windowsAdmit(person.windows, task.name, dateKey)),
                );
                if (reachable.length > 0) continue;

                const byTaskName = normalisedStaff.filter(
                    (person) => windowsCouldAdmit(person.windows, task.name),
                );
                return invalid(byTaskName.length === 0
                    ? `Task ${task.name} runs on ${dates.length} ${dates.length === 1 ? 'date' : 'dates'} between ${effectiveStart} and ${horizonEndKey}, and no staff member has a cohort window that covers it at all, so every one of its slots would be unfilled on every date. Add ${task.name} to somebody's window, or remove the task.`
                    : `Task ${task.name} runs on ${dates.length} ${dates.length === 1 ? 'date' : 'dates'} between ${effectiveStart} and ${horizonEndKey} (${dates[0]} to ${dates[dates.length - 1]}), and the ${byTaskName.length === 1 ? 'one staff member whose cohort windows cover it is' : `${byTaskName.length} staff members whose cohort windows cover it are`} outside ${byTaskName.length === 1 ? 'their window' : 'their windows'} on every one of those dates (${byTaskName.map((person) => `${person.name}: ${person.windows.filter((window) => windowAdmitsTask(window, task.name)).map(windowRangeLabel).join(', ')}`).join('; ')}), so every one of its slots would be unfilled. Widen a window, move the run, or change the task's dates.`);
            }
        }

        // THE IMPOSSIBLE FLOOR, WITH THE ARITHMETIC SHOWN. Five people needing two
        // Saturdays each in a month holding four Saturdays and one slot per Saturday
        // is 10 demanded against 4 that exist. Judged per WHOLE period only: a run
        // that ends three days into a month is a horizon artefact and is warned about
        // at generation instead (section 7), because refusing it would make a monthly
        // floor unusable for every run that does not happen to align with a calendar.
        for (const quota of declaredQuotas) {
            if (quota.min === null) continue;
            const subjects = quotaSubjects(quota, normalisedTasks, normalisedStaff, hoursActive);
            if (subjects.length === 0) continue;

            for (const bucket of quotaPeriodBuckets(quota, effectiveStart, horizonEndKey)) {
                if (!bucket.whole) continue;
                const reachable = subjects.filter(
                    (person) => quotaReachableIn(quota, normalisedTasks, bucket, occurrencesByTask, person),
                );
                if (reachable.length === 0) continue;

                const demand = reachable.length * quota.min;
                const supply = quotaSupplyIn(quota, normalisedTasks, bucket, occurrencesByTask);
                if (demand <= supply) continue;

                const counted = quotaTasks(quota, normalisedTasks);
                const arithmetic = counted
                    .map((task) => {
                        const dates = bucketDatesOf(task, bucket, occurrencesByTask);
                        return `${task.name} runs on ${dates.length} ${dates.length === 1 ? 'date' : 'dates'} needing ${task.positions.length} ${task.positions.length === 1 ? 'person' : 'people'} each`;
                    })
                    .join(', ');

                return invalid(`${quotaSource(quota)} asks for at least ${quota.min} ${quotaClassLabel(quota)} ${quota.min === 1 ? 'duty' : 'duties'} ${quotaPeriodPhrase(quota)}, and ${reachable.length} ${reachable.length === 1 ? 'staff member is' : 'staff members are'} subject to it, so ${quotaPeriodLabel(quota, bucket.key)} needs ${reachable.length} × ${quota.min} = ${demand} duties — but only ${supply} exist there (${arithmetic}). A floor cannot be met by inventing capacity: lower the minimum, add dates, add people to each date, or narrow who the quota applies to.`);
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
            /**
             * The COHORT WINDOWS bounding their eligibility in time, or `null` for
             * "always eligible" — which is every staff entry written before section
             * 0e(ii) existed. Resolved ONCE, here, so the gate, the audit and the
             * reason strings read one list.
             */
            windows: normaliseWindows(person.windows),
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
 * `leadBands` becomes a `Set` of region names, or `null` for "any grade may lead".
 * An empty or all-unknown list normalises to `null` only because validation has
 * already refused it; this is belt and braces, not a fallback.
 */
const normaliseLeadBands = (value, scale = ALLIED_HEALTH_SCALE) => {
    if (!Array.isArray(value) || value.length === 0) return null;
    const wanted = new Set();
    for (const band of value) {
        if (typeof band === 'string' && scale.regionOrder.includes(band)) wanted.add(band);
    }
    return wanted.size === 0 ? null : wanted;
};

/**
 * One pass over the configured tasks, compiling every named field into the
 * PRIMITIVES the engine actually reads: a TEMPORAL pattern, a POSITION list and a
 * COMPOSITION. Everything past this function is feature-blind.
 *
 * The named fields are kept beside them — `days`, `recurrence`, `leads`,
 * `coLeads`, `leadBands`, `slots` — because the WARNINGS and the audit's
 * sugar-specific sentences name them, and because a normalised task that
 * describes itself honestly is worth the four extra keys. Nothing gates on them.
 */
const normaliseTasks = (tasks, scale = ALLIED_HEALTH_SCALE, windowsActive = false) =>
    tasks.map((rawTask) => {
        // A monthly task has NO weekly days, and says so rather than carrying the
        // default Mon–Fri list it will never use.
        //
        // BELT AND BRACES, honestly labelled: this emptying is not what stops a
        // monthly task also running every weekday. Nothing reads the normalised
        // `days` except the debugger and this file's own prose — the day loop reads
        // `temporal`, which `compileTemporal` built from `recurrence` when there was
        // one — so mutating this line changes no output. Validation has already
        // refused a task that set both, so nothing a roster master typed is being
        // discarded.
        const recurrence = normaliseRecurrence(rawTask.recurrence);
        const requiresSkill = isNonEmptyString(rawTask.requiresSkill) ? rawTask.requiresSkill : null;
        const leadBands = normaliseLeadBands(rawTask.leadBands, scale);
        const slotted = Array.isArray(rawTask.slots) && rawTask.slots.length > 0;

        // A MULTI-SLOT TASK HAS NEITHER, and says so rather than carrying the
        // defaults it will never use. Both zeros are now purely descriptive:
        // `compileSlotPositions` produces the positions for a slotted task and
        // `compilePairedPositions` is not called at all, so neither number reaches
        // a loop. They are here so that a normalised task never DESCRIBES itself as
        // needing a lead it does not have.
        const leads = slotted ? 0 : (isPositiveInt(rawTask.leads) ? rawTask.leads : ROSTER_V2_DEFAULTS.leads);
        const coLeads = slotted ? 0 : (isNonNegativeInt(rawTask.coLeads) ? rawTask.coLeads : ROSTER_V2_DEFAULTS.coLeads);

        const task = {
            name: rawTask.name,
            requiresSkill,
            days: recurrence !== null
                ? []
                : (Array.isArray(rawTask.days) ? [...rawTask.days] : [...ROSTER_V2_DEFAULTS.days]),
            recurrence,
            /** THE calendar. One question, one answer, whichever sugar was used. */
            temporal: compileTemporal(rawTask),
            continuity: rawTask.continuity === true,
            leads,
            coLeads,
            category: isNonEmptyString(rawTask.category) ? rawTask.category : ROSTER_V2_DEFAULTS.category,
            leadBands,
            /**
             * The GRADE FLOOR, as the canonical label or `null` for none.
             * Normalised through the scale so `'ah12'` and `'AH12'` are one thing
             * and an off-scale string is `null` rather than a floor nobody meets —
             * the validator refuses that case before it can get here.
             */
            minGrade: rankOfGrade(rawTask.minGrade, scale) === null
                ? null
                : scale.labelOfRank(rankOfGrade(rawTask.minGrade, scale)),
            // Always present, always a number, whether or not the hours model is
            // in force — one task shape, and the value a future always-on model
            // would use is already visible in a debugger today. What the OPT-IN
            // predicate decides is whether anything reads it.
            hours: isUsableHours(rawTask.hours, MAX_HOURS_PER_DAY_CEILING)
                ? rawTask.hours
                : ROSTER_V2_DEFAULTS.taskHours,
        };

        // THE ONE INTERNAL SHIFT SHAPE. Both sugars compile to positions here and
        // nowhere else; `composition` says how the filled ones become shifts.
        const slotPositions = compileSlotPositions(rawTask.slots, task, scale, windowsActive);
        // `positions` and `composition` ARE the description of how this task is
        // staffed. The raw `slots` array is deliberately NOT copied onto the
        // normalised task: a field nobody reads is a second source of truth waiting
        // to disagree with the first (post-mortem A-RC1).
        task.composition = slotPositions === null ? COMPOSE_PAIRING : COMPOSE_TEAM;
        task.positions = slotPositions === null
            ? compilePairedPositions(task, leadBands, windowsActive)
            : slotPositions;

        return task;
    });

// --- 4. THE REJECTION TAXONOMY -----------------------------------------------
//
// The CODES are declared in section 0d, beside the primitives that produce them.
// What lives here is the ORDER they are asked in, the tally that order produces,
// and the prose written from it.

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
    [REJECT_MIN_GRADE]: "no longer holds a grade at or above the task's floor",
    [REJECT_LEAVE]: 'was on leave that day',
    [REJECT_ON_TASK]: 'was already on that task that day',
    [REJECT_CAPACITY]: 'was already at their daily duty limit',
    [REJECT_DAILY_HOURS]: 'would have gone over their daily hours limit',
    [REJECT_WEEKLY_HOURS]: 'would have gone over their weekly hours limit',
    [REJECT_PAIR]: 'was blocked by a forbidden pairing',
    [REJECT_CONSECUTIVE]: 'was at the consecutive-day limit',
    [REJECT_WINDOW]: 'was outside their cohort window that day',
    [REJECT_QUOTA]: 'was already at their quota ceiling for that period',
});

/**
 * What does ONE configured task compile to? The normalised task — its TEMPORAL
 * pattern, its POSITIONS with their ELIGIBILITY, and its COMPOSITION.
 *
 * The same function the engine uses, on one task, exported for three readers: a
 * preview UI that wants to show a roster master what their task means, a debugger,
 * and `rosterEngineV2.primitives.test.js`, which asserts that each named feature
 * compiles to the expected primitive. Pure, and it never validates — pass it a task
 * `validateRosterV2Config` has already accepted.
 */
export const compileTaskPrimitives = (task, rules = null, windowsActive = false) =>
    normaliseTasks([task], resolveGradeScale(rules), windowsActive)[0];

/**
 * THE GATES, IN ORDER — one row per primitive that can refuse a position.
 *
 * This list IS the rejection taxonomy's order: the reason string reads in it, and
 * it is chosen so the most fundamental fact wins. Somebody who lacks the skill is
 * not also reported as "on leave" — they were never a candidate for this task at
 * all. Somebody at their duty limit is not also reported as over their hours.
 *
 * `evaluate` returns a rejection code or `null`. ELIGIBILITY returns whichever
 * code its first unmet requirement carries, which is how one row covers both the
 * skill and the region gates and how a third eligibility kind reaches the loop
 * without a sixth row.
 *
 * A NEW CONSTRAINT IS A NEW ROW, and the row is the only place its order is
 * decided. Nothing downstream — not `evaluateSlot`, not the scarcity count, not
 * `unfilled` — knows how many gates there are.
 */
const SLOT_GATES = Object.freeze([
    Object.freeze({
        id: 'eligibility',
        // `ctx` is handed straight to the requirement kinds, because one of them —
        // the COHORT WINDOW — is a fact about a person ON A DATE. The skill and
        // region kinds ignore it. This is the whole reason a fourth eligibility kind
        // needs no row here: the gate asks one question of one list.
        evaluate: (person, ctx) => {
            const unmet = firstUnmetRequirement(person, ctx.position.eligibility, ctx);
            return unmet === null ? null : ELIGIBILITY_KINDS[unmet.kind].rejection;
        },
    }),
    Object.freeze({
        id: 'availability',
        evaluate: (person, ctx) => (person.unavailable.has(ctx.dateKey) ? REJECT_LEAVE : null),
    }),
    // The capacity limits, named rather than spread, so that the affinity gate can
    // sit between the hours limits and the consecutive-day one — which is where it
    // has always sat, and which no amount of iterating `CAPACITY_LIMITS` in order
    // would have produced.
    ...['taskPerDay', 'dutiesPerDay', 'hoursPerDay', 'hoursPerWeek'].map((id) => Object.freeze({
        id,
        evaluate: (person, ctx) =>
            (capacityBreached(CAPACITY_BY_ID[id], person, ctx) ? CAPACITY_BY_ID[id].rejection : null),
    })),
    Object.freeze({
        id: 'affinity',
        evaluate: (person, ctx) => (affinityForbids(person, ctx) ? REJECT_PAIR : null),
    }),
    Object.freeze({
        id: 'consecutiveDays',
        evaluate: (person, ctx) =>
            (capacityBreached(CAPACITY_BY_ID.consecutiveDays, person, ctx)
                ? CAPACITY_BY_ID.consecutiveDays.rejection
                : null),
    }),
    // LAST, and it is a genuine choice rather than an afterthought. A quota CEILING
    // is a capacity limit like the five above (`quotaCeilingLimit` builds the same
    // row shape and `capacityBreached` is the same comparison), but it is the least
    // immediate fact in the list: "she is on leave", "he is at his second duty of
    // the day" and "that would be a seventh day running" are all answers about
    // today, and "she has already done her four Saturdays this month" is the answer
    // only once none of them applies. `ctx.quotaCeilings` is the day's list, already
    // filtered to the quotas that count THIS task, so a configuration declaring none
    // walks an empty array.
    Object.freeze({
        id: 'quotaCeiling',
        evaluate: (person, ctx) =>
            (ctx.quotaCeilings.some((limit) => capacityBreached(limit, person, ctx))
                ? REJECT_QUOTA
                : null),
    }),
]);

/**
 * Why can `person` NOT take this position? `null` means they can.
 *
 * One walk down `SLOT_GATES`, first refusal wins. There is no per-feature branch
 * left in here: a task's skill, a lead's bands, a slot entry's own gates, leave,
 * the four capacity ceilings and the forbidden pairings all arrive as data on
 * `ctx` and are asked in the order the table declares.
 *
 * `ctx` is the day's running state, passed in rather than reached for — so a
 * configuration that never mentioned hours leaves `hoursActive` false and the two
 * hours limits never read their maps at all, exactly as before the model existed.
 */
const rejectionFor = (ctx) => {
    const { person } = ctx;
    for (const gate of SLOT_GATES) {
        const rejection = gate.evaluate(person, ctx);
        if (rejection !== null) return rejection;
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

/**
 * The same, for a QUOTA CEILING: which quota, over which period, and how many they
 * already hold.
 *
 * Reads, for example:
 *   Ada already holds their quota ceiling of 4 Saturday Bench duties in 2027-02
 *   Ben already holds their quota ceiling of 2 category WEEKEND duties in the run
 */
const quotaBreachClause = (person, limit, dateKey) => {
    const { quota } = limit;
    const periodKey = quotaPeriodKey(quota, dateKey);
    return `${person.name} already holds their quota ceiling of ${quota.max} ${quotaClassLabel(quota)} ${quota.max === 1 ? 'duty' : 'duties'} in ${quotaPeriodLabel(quota, periodKey)}`;
};

/**
 * How many people a DETAIL segment names before it stops counting them instead.
 *
 * The hours limit's judgment call (see `HOURS_DETAIL_LIMIT`), applied to the two
 * later detail segments for the same reason and with the same honesty: the total is
 * always stated, so a truncated segment never reads as a complete list.
 */
const renderDetailSegment = (clauses, noun, limit) => {
    const shown = clauses.slice(0, limit);
    const hidden = clauses.length - shown.length;
    const tail = hidden === 0
        ? ''
        : `; and ${hidden} other${hidden === 1 ? '' : 's'} ${noun}`;
    return `${shown.join('; ')}${tail}`;
};

const describeEmptyPool = ({
    task, position, dateKey, tally, poolSize,
    hoursDetail = [], windowDetail = [], quotaDetail = [],
}) => {
    const qualified = poolSize - tally[REJECT_SKILL];
    // WHICH GATES THIS POSITION ACTUALLY CARRIES, read off its eligibility rather
    // than re-derived from the fields it was written with. A co-lead position has
    // no region requirement, so it cannot say "band"; a lead position of an
    // unbanded task has none either. One source, so the sentence and the gate can
    // never disagree about what was being asked for.
    const gatingBands = regionsRequiredBy(position.eligibility);
    const bandGated = gatingBands !== null;
    const inBand = qualified - tally[REJECT_BAND];
    // The task's skill plus, for a slot position, its own — so a trio's senior
    // slot reads "skills Witnessing and ICSI" rather than naming only one of them.
    const skills = skillsRequiredBy(position.eligibility);

    const parts = [];
    if (skills.length > 0) parts.push(`${qualified} qualified`);
    else if (!bandGated) parts.push(`${poolSize} in pool`);
    if (bandGated) parts.push(`${inBand} in band`);

    // BEFORE leave, because that is the order the gates ask: a cohort window is
    // eligibility (section 0e's third kind), and somebody whose block has not opened
    // was never a candidate for today rather than a candidate who happened to be
    // away. `outside their cohort window` is deliberately not `unavailable`.
    if (tally[REJECT_WINDOW]) parts.push(`${tally[REJECT_WINDOW]} outside their cohort window`);
    if (tally[REJECT_LEAVE]) parts.push(`${tally[REJECT_LEAVE]} on leave`);
    if (tally[REJECT_CAPACITY]) parts.push(`${tally[REJECT_CAPACITY]} at daily limit`);
    // Worded to be unmistakably the HOURS limit and not `at daily limit`, which is
    // the duty-count one directly above it. Two constraints, two sentences.
    if (tally[REJECT_DAILY_HOURS]) parts.push(`${tally[REJECT_DAILY_HOURS]} over their daily hours limit`);
    if (tally[REJECT_WEEKLY_HOURS]) parts.push(`${tally[REJECT_WEEKLY_HOURS]} over their weekly hours limit`);
    if (tally[REJECT_ON_TASK]) parts.push(`${tally[REJECT_ON_TASK]} already on this task`);
    if (tally[REJECT_PAIR]) parts.push(`${tally[REJECT_PAIR]} blocked by a forbidden pairing`);
    if (tally[REJECT_CONSECUTIVE]) parts.push(`${tally[REJECT_CONSECUTIVE]} at the consecutive-day limit`);
    if (tally[REJECT_QUOTA]) parts.push(`${tally[REJECT_QUOTA]} at a quota ceiling`);

    const bandLabel = bandGated ? bandSetLabel(gatingBands) : '';
    // WHICH SLOT FAILED, and this is the whole reason a slot entry carries a
    // label: `Weekend Witnessing junior slot` says which third of the trio could
    // not be staffed, where `Weekend Witnessing slot` would leave a roster master
    // reading three identical sentences.
    const which = `${task.name} ${position.label}`;

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

    // The DETAIL hangs off the end rather than inside the tally, because the tally is
    // a set of counts that narrow left to right and these are whole sentences about
    // named people. Each segment is absent entirely when its constraint bound
    // nobody, so a reason that has nothing to do with hours, cohorts or quotas never
    // mentions them — and a reason bound only by hours reads exactly as it did
    // before the other two segments existed.
    const segments = [];
    if (hoursDetail.length > 0) {
        segments.push(renderDetailSegment(hoursDetail, 'over an hours limit', HOURS_DETAIL_LIMIT));
    }
    if (windowDetail.length > 0) {
        segments.push(renderDetailSegment(windowDetail, 'outside their cohort window', HOURS_DETAIL_LIMIT));
    }
    if (quotaDetail.length > 0) {
        segments.push(renderDetailSegment(quotaDetail, 'at a quota ceiling', HOURS_DETAIL_LIMIT));
    }

    if (segments.length === 0) return `${head} (${parts.join(', ')})`;
    return `${head} (${parts.join(', ')}) — ${segments.join(' — ')}`;
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
 * THE FLOOR COMPARATOR: whoever is furthest BEHIND a quota `min` for this period
 * wins, and everything else is the comparator that would have decided it.
 *
 * This is the only way a floor can be honoured at all. A ceiling is a gate — offer
 * a slot, get yes or no — but a floor is not knowable until the period is full, and
 * refusing a slot to protect somebody else's minimum would leave the slot EMPTY,
 * which serves nobody (section 1e). So the floor buys its way in HERE, ahead of
 * FTE-weighted fairness, exactly as a positive occurrence affinity does.
 *
 * `quotaDeficit` is the MAXIMUM shortfall across every floor that counts this task
 * in the current period, not the sum: a person two Saturdays short of one quota and
 * one short of another is two behind, because the two quotas overlap on the same
 * duties and adding them would double-count the same work. Zero for everybody when
 * no floor applies, which is why this chain degenerates exactly to the two
 * comparators that existed before it.
 *
 * PRECEDENCE, decided and stated rather than emergent: FLOOR, then INCUMBENCY, then
 * fairness. A quota floor is a contractual obligation to a person ("you will get two
 * Saturdays") while continuity is a clinical preference for a cohort, and where a
 * task carries both, the engine says so in `warnings` rather than quietly picking.
 * Every HARD gate still runs first — a floor never buys somebody a slot they are not
 * eligible for, on leave for, or over a ceiling for.
 */
const candidateComparator = (prefersIncumbent, floorApplies) => {
    const tail = prefersIncumbent ? compareContinuityCandidates : compareCandidates;
    if (!floorApplies) return tail;
    return (a, b) => {
        if (a.quotaDeficit !== b.quotaDeficit) return b.quotaDeficit - a.quotaDeficit;
        return tail(a, b);
    };
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
 * TEAM COMPOSITION: the order a shift's assignees are published in — LEAD FIRST.
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
const orderTeamFills = (fills) =>
    [...fills].sort((a, b) => {
        if (a.candidate.gradeRank !== b.candidate.gradeRank) {
            return b.candidate.gradeRank - a.candidate.gradeRank;
        }
        return compareCandidates(a.candidate, b.candidate);
    });

/**
 * THE COMPOSITION STEP: a task's filled POSITIONS -> its shift objects for one
 * date. One entry per strategy, and the emission loop dispatches on the task's
 * `composition` rather than branching on which named field it was written with.
 *
 * Both strategies produce the SAME shift shape — `{ task, lead, coLead?, staff,
 * category, week, assignees }` with `staff` from `buildShiftStaffLabel` — because
 * the calendar, the CSV export, the ICS export and the swap flow all read it and
 * there is one definition of the display string (post-mortem A-RC1).
 *
 * A third strategy is a third row. Nothing else changes.
 */
const COMPOSERS = Object.freeze({
    /**
     * One shift per filled ANCHOR position, with the attached fills dealt
     * round-robin across them — the shape `leads`/`coLeads` has always produced.
     *
     * Where a group holds more than one attached person, `coLead` is the first of
     * them and `assignees` carries everybody. A group with no anchor cannot exist:
     * phase 2 never opens attached positions for an anchorless shift.
     */
    [COMPOSE_PAIRING]: (task, fills, week) => {
        const anchorRole = anchorRoleOf(task);
        const anchors = fills.filter((fill) => fill.position.role === anchorRole);
        if (anchors.length === 0) return [];

        const groups = anchors.map((fill) => ({ lead: fill.candidate.name, coLeads: [] }));
        fills
            .filter((fill) => fill.position.role !== anchorRole)
            .forEach((fill, i) => {
                groups[i % groups.length].coLeads.push(fill.candidate.name);
            });

        return groups.map((group) => {
            const coLead = group.coLeads.length > 0 ? group.coLeads[0] : undefined;
            return {
                task: task.name,
                lead: group.lead,
                // A solo task must not carry `coLead: undefined` — an absent
                // co-lead is an ABSENT FIELD. `undefined` here is what put the
                // string "undefined" in the CSV export (audit M7), and
                // `buildShiftStaffLabel` already treats it as "no co-lead" when
                // building the display string.
                ...(coLead === undefined ? {} : { coLead }),
                staff: buildShiftStaffLabel(group.lead, coLead),
                category: task.category,
                week: week + 1,
                assignees: [group.lead, ...group.coLeads],
            };
        });
    },
    /**
     * ONE shift holding everybody — which is the whole point, since the
     * department's rule is that the three of them are on the same shift. The lead
     * is the highest grade present and `coLead` the next (`orderTeamFills`).
     *
     * A shift is emitted for a PARTIALLY filled trio: two of three staffed is a
     * real shift plus one `unfilled` entry naming the third, not a cancelled day.
     * If NO position filled there is no shift at all, which is the same convention
     * the paired strategy above follows.
     */
    [COMPOSE_TEAM]: (task, fills, week) => {
        if (fills.length === 0) return [];

        const assignees = orderTeamFills(fills).map((fill) => fill.candidate.name);
        const [lead] = assignees;
        const coLead = assignees.length > 1 ? assignees[1] : undefined;

        return [{
            task: task.name,
            lead,
            ...(coLead === undefined ? {} : { coLead }),
            staff: buildShiftStaffLabel(lead, coLead),
            category: task.category,
            week: week + 1,
            assignees,
        }];
    },
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
 * COHORT WINDOW: somebody is on a shift on a date no window of theirs admits — a
 * locum before their start date, a team A embryologist in team B's block.
 *
 * A rule of its own rather than a case of `HARD_RULE_SLOT_GATE`, and deliberately:
 * the slot-gate rule is a MATCHING over standing eligibility and applies only to
 * `slots` tasks, while a window binds every assignee of every task shape. The
 * matching therefore asks its question with no date (section 0e's caller table) and
 * this rule asks the dated one, so one breach is reported once.
 */
const HARD_RULE_WINDOW = 'cohortWindow';
/**
 * QUOTA CEILING: somebody holds more duties of a quota's class in one period than
 * its `max` allows. The ceiling half of section 1e, read back off the finished
 * roster against the same counts the unmet-floor warnings are written from.
 *
 * There is deliberately NO read-back rule for a quota FLOOR. A floor is soft by
 * construction — it cannot be met by inventing capacity — so an unmet one is a
 * WARNING naming the person, the class, the period and the shortfall, and counting
 * it as a hard violation would make `score.hardViolations` non-zero for a roster
 * that broke no rule and would drown the one signal this engine treats as a defect.
 */
const HARD_RULE_QUOTA_MAX = 'quotaCeiling';

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
    const positions = task.positions;
    const eligible = names.map((name) => {
        const person = byName.get(name);
        if (!person) return null;
        const indices = [];
        for (let i = 0; i < positions.length; i += 1) {
            if (meetsEligibility(person, positions[i].eligibility)) indices.push(i);
        }
        return indices;
    });

    /** position index -> the assignee index currently holding it, or -1. */
    const owner = new Array(positions.length).fill(-1);

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
    // COMPILED WITH THE WINDOW REQUIREMENT OFF, and that is not the same as ignoring
    // windows: the only reader of a position's eligibility in here is
    // `unmatchableAssignees`, whose question is the date-less one, and the dated
    // question is `HARD_RULE_WINDOW`'s below. See section 0e's table of the three
    // callers — this is the third row, spelled out at the call site.
    const tasks = normaliseTasks(config.tasks, resolveGradeScale(rules));
    const byName = new Map(staff.map((person) => [person.name, person]));
    const byTask = new Map(tasks.map((task) => [task.name, task]));
    const affinities = resolveAffinities(forbidPairs, tasks, staff.map((person) => person.name));
    const quotas = resolveQuotas(config);

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
            if (task && task.composition === COMPOSE_TEAM) {
                const known = people.filter((name) => byName.has(name));

                for (const name of unmatchableAssignees(people, task, byName)) {
                    add(
                        HARD_RULE_SLOT_GATE,
                        `${name} is on ${shift.task} but no slot of it that they qualify for is free (its slots are ${task.positions.map((position) => position.label).join(', ')})`,
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
                // The COHORT WINDOW, read back with the date in hand. Only for a task
                // the configuration knows: a shift naming an unknown task has no
                // window question to answer, exactly as it has no hours and no skill.
                if (task && !windowsAdmit(person.windows, shift.task, dateKey)) {
                    add(
                        HARD_RULE_WINDOW,
                        `${windowExclusionClause(person, shift.task)}, but is on it on ${dateKey}`,
                        dateKey,
                        shift.task,
                    );
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
                    if (name < other && affinities.pairsByPerson.get(name)?.has(other)) {
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

    // THE QUOTA CEILING, read back off the finished roster — the half of section 1e
    // that is HARD. Measured through `measureQuotaCounts`, which is also what the
    // unmet-floor warnings read, so the violation and the sentence can never disagree
    // about how many Saturdays somebody actually worked.
    //
    // Iterated quota by quota, then period key in sorted order, then name in sorted
    // order, so the violation list is deterministic for a Map whose insertion order is
    // whatever the roster happened to be in.
    if (quotas.length > 0) {
        const counts = measureQuotaCounts(roster, quotas, byTask);
        for (let i = 0; i < quotas.length; i += 1) {
            const quota = quotas[i];
            if (quota.max === null) continue;
            for (const periodKey of [...counts[i].keys()].sort()) {
                const bucket = counts[i].get(periodKey);
                for (const name of [...bucket.keys()].sort()) {
                    if (bucket.get(name) <= quota.max) continue;
                    add(
                        HARD_RULE_QUOTA_MAX,
                        `${name} holds ${bucket.get(name)} ${quotaClassLabel(quota)} duties in ${quotaPeriodLabel(quota, periodKey)}, quota ceiling ${quota.max}`,
                        null,
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
    const tasks = normaliseTasks(config.tasks, resolveGradeScale(rules));
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
    const scale = resolveGradeScale(rules);
    const bands = resolveGradeBands(rules);
    const hoursActive = hoursModelRequested(config);
    const hoursRules = resolveHoursRules(rules);
    /**
     * Are COHORT WINDOWS in play? Read once and passed to `normaliseTasks`, which is
     * the only thing that changes: with windows the positions carry the window
     * requirement (section 0e's third kind), and without them they carry exactly the
     * requirement list they carried before section 0e(ii) existed.
     */
    const windowsActive = cohortWindowsRequested(config);

    const staff = normaliseStaff(config.staff, maxConcurrentPerDay, bands, hoursRules, scale);
    const tasks = normaliseTasks(config.tasks, scale, windowsActive);
    const affinities = resolveAffinities(forbidPairs, tasks, staff.map((person) => person.name));
    const quotas = resolveQuotas(config);
    /**
     * `quotaIndex -> (periodKey -> (name -> duties))`, the running ledger the CEILING
     * gate reads and `assign` writes. The FLOOR reads it too, through
     * `quotaDeficitOf`, because "how far behind is this person right now" is the same
     * question from the other end.
     *
     * Re-measured off the finished roster at the end of the run rather than published
     * from here — post-mortem A-RC4: the counter that decided the roster is not
     * evidence about the roster.
     */
    const quotaCounts = emptyQuotaCounts(quotas);
    const quotaCeilings = quotaCeilingLimits(quotas, quotaCounts);
    /** The floors, in resolution order. Empty for every configuration without one. */
    const quotaFloors = quotas.filter((quota) => quota.min !== null);

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
     * taskName -> Set<dateKey>. EVERY task, whichever sugar it was written with.
     *
     * Derived from `temporalOccurrences`, which is the one definition of when a
     * task runs, so the day loop asks a single question of a single structure and a
     * preview UI can resolve the same dates without re-deriving a calendar. An
     * empty set is legal and means either a vacuous pattern (no days selected) or a
     * run too short — or badly placed — to contain an occurrence. Both are warned
     * about below, in their own words; neither is an error.
     */
    const occurrencesByTask = resolveOccurrences(tasks, effectiveStart, horizonEndKey);

    const warnings = [];
    // (Until v1.10.1 a warning stood here saying that declared quotas had been
    // IGNORED, unreachable because `resolveQuotas` returned an empty list by
    // construction. It is gone rather than adapted: quotas are enforced now, and a
    // sentence claiming otherwise would be the exact inverse of post-mortem A-RC4 —
    // a false report about work that was in fact done.)
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
    const bandGatedSlotTasks = tasks.filter((task) => (
        task.composition === COMPOSE_TEAM &&
        task.positions.some((position) => regionsRequiredBy(position.eligibility) !== null)
    ));
    if (bandGatedSlotTasks.length > 0) {
        const ungraded = staff.filter((person) => person.grade === null).map((person) => person.name);
        if (ungraded.length > 0) {
            warnings.push(
                `${ungraded.length === 1 ? '1 staff member has' : `${ungraded.length} staff members have`} no job grade recorded (${ungraded.join(', ')}), so they cannot fill any band-restricted slot of ${bandGatedSlotTasks.length === 1 ? 'the multi-slot task' : `the ${bandGatedSlotTasks.length} multi-slot tasks`}. They remain eligible for every slot that carries no band, and for every other duty.`,
            );
        }
    }

    for (const task of tasks) {
        // TWO SENTENCES FOR TWO DIFFERENT MISTAKES, and the pattern tells them
        // apart rather than the field it was written with: a VACUOUS pattern can
        // never produce a date for any horizon (a weekday list with nothing in it),
        // while a pattern that simply misses this run is a horizon problem.
        if (temporalIsVacuous(task.temporal)) {
            warnings.push(
                `Task ${task.name} has no days selected, so it will never appear in the roster.`,
            );
        } else if (occurrencesByTask.get(task.name).size === 0) {
            // A perfectly valid 3rd-Wednesday clinic simply does not intersect a
            // fortnight that happens to fall the wrong side of it. Silence here
            // would look exactly like the engine having dropped the task.
            warnings.push(
                `Task ${task.name} runs on ${temporalLabel(task.temporal)}, and no such date falls between ${effectiveStart} and ${horizonEndKey}, so it will never appear in this roster. Generate a longer run, or one that covers an occurrence.`,
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
        if (task.composition === COMPOSE_TEAM) {
            /** eligibility signature -> the labels of the positions sharing it. */
            const byGate = new Map();
            for (const position of task.positions) {
                const key = eligibilityKey(position.eligibility);
                if (!byGate.has(key)) byGate.set(key, { position, labels: [] });
                byGate.get(key).labels.push(position.label);
            }

            for (const { position, labels } of byGate.values()) {
                // `{ dateKey: null }` asks the DATE-LESS question — "could they ever
                // fill this?" — which is the right one for a warning about the whole
                // run: a cohort window that never names this task disqualifies
                // somebody from it permanently, while one that simply has not opened
                // yet does not (section 0e's caller table).
                const qualified = staff.filter(
                    (person) => meetsEligibility(person, position.eligibility, { dateKey: null }),
                );
                if (qualified.length >= labels.length) continue;

                const gate = [];
                const gateRegions = regionsRequiredBy(position.eligibility);
                if (gateRegions !== null) {
                    gate.push(`from the ${bandSetLabel(gateRegions)} band (${bandSetGradeLabel(gateRegions, bands)})`);
                }
                const gateSkills = skillsRequiredBy(position.eligibility);
                if (gateSkills.length > 0) gate.push(`holding ${skillsPhrase(gateSkills)}`);

                warnings.push(
                    `Task ${task.name} needs ${labels.length} ${labels.length === 1 ? 'person' : 'people'} ${gate.length === 0 ? 'per day' : `${gate.join(' ')} per day`} (${labels.join(', ')}), but only ${qualified.length} ${qualified.length === 1 ? 'person qualifies' : 'people qualify'}, so some of those slots cannot be filled on any day.`,
                );
            }
        }
    }

    /**
     * QUOTA STRAIN, reported before a slot is filled — the three things a roster
     * master cannot see from the roster itself.
     *
     * `quotaBuckets` is computed once here and read again by the unmet-floor report at
     * the end of the run, so the periods the floor is JUDGED in and the periods it is
     * WARNED about are the same periods by construction.
     */
    const quotaBuckets = quotas.map((quota) => quotaPeriodBuckets(quota, effectiveStart, horizonEndKey));
    const quotaSubjectsOf = quotas.map((quota) => quotaSubjects(quota, tasks, staff, hoursActive));

    for (let i = 0; i < quotas.length; i += 1) {
        const quota = quotas[i];

        // 1. WHO THE QUOTA DOES NOT APPLY TO. `scope: 'person'` reads as "everybody",
        //    and for a skill-gated or band-gated class it cannot be: a floor on
        //    somebody who could never do the work is a contradiction rather than a
        //    policy, so they are outside the population (`quotaSubjects`). That
        //    narrowing decides both the arithmetic refusal and the shortfall report,
        //    so it is said out loud rather than left to be inferred from a warning
        //    that never arrives.
        const outside = staff
            .filter((person) => !quotaSubjectsOf[i].includes(person))
            .map((person) => person.name);
        if (outside.length > 0) {
            warnings.push(
                `${quotaSource(quota)} counts ${quotaClassLabel(quota)}, which ${outside.length === 1 ? '1 staff member' : `${outside.length} staff members`} can never be rostered on (${outside.join(', ')}) — the skill, the band, the length of a session against their day, or their cohort windows rule them out — so the quota does not apply to ${outside.length === 1 ? 'them' : 'any of them'}.`,
            );
        }

        // 2. A PARTIAL PERIOD IS NOT JUDGED. A four-week run from a Monday almost
        //    never holds a whole calendar month, and a floor of two Saturdays cannot
        //    be met in the three days of March a run happens to end on. That is a
        //    HORIZON artefact, not a broken policy: it is neither refused (see
        //    validation) nor counted as a shortfall, and this is the sentence that
        //    stops the silence being mistaken for compliance.
        if (quota.min !== null) {
            for (const bucket of quotaBuckets[i].filter((b) => !b.whole)) {
                warnings.push(
                    `${quotaSource(quota)} asks for at least ${quota.min} ${quotaPeriodPhrase(quota)}, and this run covers only ${bucket.from} to ${bucket.to} of ${quotaPeriodLabel(quota, bucket.key)}, so the floor is not judged there.`,
                );
            }
        }

        // 3. TWO PREFERENCES ON ONE TASK, PULLING OPPOSITE WAYS. Continuity
        //    concentrates a task on one person; a floor spreads it across everybody.
        //    Both outrank FTE-weighted fairness, so one of them has to outrank the
        //    other, and section 5 says which. Not a refusal — a department may
        //    legitimately want both and accept the outcome — but never silent.
        if (quota.min !== null) {
            for (const task of quotaTasks(quota, tasks)) {
                if (!task.continuity) continue;
                warnings.push(
                    `Task ${task.name} asks for continuity of care AND is counted by a quota floor (${quotaSource(quota)}, at least ${quota.min} ${quotaPeriodPhrase(quota)}). The two pull opposite ways — continuity keeps one lead, a floor spreads the work — and the FLOOR WINS: somebody short of their minimum takes the lead ahead of the incumbent, and every such change is counted as a continuity break.`,
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

            // ONE QUESTION, asked of every task in the same words: is today one of
            // your dates? `occurrencesByTask` was resolved from each task's TEMPORAL
            // pattern before the loop, so a weekly task, a monthly one and a
            // pattern with no sugar at all are indistinguishable here — which is
            // what makes a seventh calendar shape a change to section 1b and to
            // nothing else.
            const running = tasks.filter((task) => occurrencesByTask.get(task.name).has(dateKey));
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
             * taskName -> { onTaskToday, fills } for this date.
             *
             * ONE list of fills per task, in assignment order, each
             * `{ position, candidate }`. Not three lists keyed by role: a filled
             * position is a filled position, and WHICH of them ends up being the
             * shift's `lead` is the composition step's decision (section 5) taken
             * once the day is resolved. `onTaskToday` is the set the per-task-per-day
             * capacity limit reads.
             */
            const dayState = new Map(
                running.map((task) => [task.name, { onTaskToday: new Set(), fills: [] }]),
            );

            /** The fills of `task` that hold its ANCHOR role, in assignment order. */
            const anchorFillsOf = (task) => {
                const anchorRole = anchorRoleOf(task);
                if (anchorRole === null) return [];
                return dayState.get(task.name).fills.filter((fill) => fill.position.role === anchorRole);
            };

            // `unfilled` is collected per day and emitted in READING order (primary
            // positions by task, then attached ones by task) rather than in the
            // scarcity order the positions were resolved in.
            const dayUnfilled = [];

            /**
             * taskName -> (incumbent name -> the rejection that stopped them, or
             * `null` for "nothing did"), captured at the moment a continuity lead
             * slot was decided. The only moment the engine knows WHY an incumbency
             * moved; the warning below is written from it.
             */
            const incumbentRejections = new Map();

            /**
             * taskName -> the incumbents who lost a lead slot today to somebody further
             * behind their QUOTA FLOOR. The second half of "why did the clinic move?",
             * and the reason the sentence below can distinguish a floor from a
             * tie-break instead of guessing.
             */
            const incumbentFloorLosses = new Map();

            /**
             * Who could take this slot, the best of them, and — if nobody — the
             * tally the reason is written from.
             */
            const evaluateSlot = (slot) => {
                const { task, position } = slot;
                const { onTaskToday } = dayState.get(task.name);

                // A POSITIVE cross-occurrence affinity inverts the per-task
                // tie-break, for this position only — section 1d. `continuity: true`
                // is the only sugar that produces one today.
                const prefersIncumbent = affinityPrefersIncumbent(task, position, affinities);
                // THE FLOORS THAT COUNT THIS TASK, and the CEILINGS, resolved once per
                // slot. Both are empty lists for every configuration that declares no
                // quota, which is why the comparator below degenerates to exactly the
                // two comparators that existed before section 1e was implemented.
                const floorsHere = quotaFloors.filter((quota) => quotaCountsTask(quota, task));
                const ceilingsHere = quotaCeilings.filter((limit) => quotaCountsTask(limit.quota, task));
                const compare = candidateComparator(prefersIncumbent, floorsHere.length > 0);

                /**
                 * How far behind their FLOOR is this person, right now, in the period
                 * this date falls in? The MAXIMUM over the applicable floors — see
                 * `candidateComparator` for why a maximum and not a sum.
                 */
                const quotaDeficitOf = (person) => {
                    let worst = 0;
                    for (const quota of floorsHere) {
                        const index = quotas.indexOf(quota);
                        const held = quotaHeld(quotaCounts, index, quotaPeriodKey(quota, dateKey), person.name);
                        const short = quota.min - held;
                        if (short > worst) worst = short;
                    }
                    return worst;
                };

                // Whoever held the previous occurrence is watched through the loop
                // below, so that if the position changes hands the warning can say
                // whether a constraint took it or fairness did.
                const incumbents = prefersIncumbent && continuityHistory.has(task.name)
                    ? continuityHistory.get(task.name).holders
                    : null;
                const watched = incumbents === null ? null : new Map();
                /**
                 * The watched incumbents' FLOOR DEFICITS, measured at the same moment
                 * as their rejections.
                 *
                 * Kept because the continuity warning has to be able to tell two
                 * different stories apart: "nobody stopped her, she simply lost the
                 * tie-break" and "nobody stopped her, but the person who took it was
                 * further behind their quota floor". Before quotas existed only the
                 * first could happen, and printing it for the second would be a
                 * sentence that is measurably false — the file's own rule about this
                 * clause is that getting it wrong is worse than saying nothing.
                 */
                const watchedDeficits = incumbents === null ? null : new Map();

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
                    [REJECT_WINDOW]: 0,
                    [REJECT_MIN_GRADE]: 0,
                    [REJECT_QUOTA]: 0,
                };

                /**
                 * One readable sentence per person the HOURS gate turned away, in
                 * staff order. Built here, where the numbers that produced the
                 * rejection are still in hand, rather than reconstructed later
                 * from a tally that has thrown them away.
                 */
                const hoursDetail = [];
                /**
                 * The same, for the two constraints whose tally count is equally
                 * useless on its own: "3 outside their cohort window" does not say
                 * WHOSE block is closed, and "1 at a quota ceiling" does not say which
                 * quota or which period.
                 */
                const windowDetail = [];
                const quotaDetail = [];

                let eligible = 0;
                let best = null;

                for (const person of staff) {
                    // EVERY GATE IS COUNTED HERE, inside the eligibility count MRV
                    // orders by, and that is the whole reason the gates are a table:
                    // a band-gated lead position, a skill-gated one, the principal
                    // entry of a weekend trio and an hours-tight 6-hour clinic are
                    // all scarce for the SAME reason, and a scarcity measure blind to
                    // any one of them would spend the department's only qualified
                    // person on the loose position beside it and then report the
                    // tight one as unstaffable — a shortage the engine manufactured,
                    // indistinguishable in `unfilled` from a real one.
                    const rejection = rejectionFor({
                        person,
                        task,
                        position,
                        dateKey,
                        date,
                        dutiesOnDate,
                        onTaskToday,
                        affinities,
                        dutiesByDate,
                        maxConsecutiveDays,
                        hoursActive,
                        hoursOnDate,
                        hoursThisWeek,
                        // The day's CEILINGS, already filtered to the quotas that count
                        // this task, so the gate walks an empty array for every
                        // configuration that declares none.
                        quotaCeilings: ceilingsHere,
                    });

                    if (watched !== null && incumbents.includes(person.name)) {
                        watched.set(person.name, rejection);
                        watchedDeficits.set(person.name, quotaDeficitOf(person));
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

                    if (rejection === REJECT_WINDOW) {
                        windowDetail.push(windowExclusionClause(person, task.name));
                    }

                    if (rejection === REJECT_QUOTA) {
                        // WHICH quota bound, found the same way the gate found it, so
                        // the sentence cannot name a ceiling the gate did not apply.
                        const bound = ceilingsHere.find((limit) => capacityBreached(limit, person, {
                            person, task, position, dateKey, quotaCeilings: ceilingsHere,
                        }));
                        if (bound !== undefined) quotaDetail.push(quotaBreachClause(person, bound, dateKey));
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
                        /**
                         * How far behind a quota FLOOR they are, at this moment, in this
                         * period. Read by `candidateComparator` only, and present on
                         * every candidate — 0 when no floor applies — so there is one
                         * candidate shape and the comparator never reads `undefined`.
                         */
                        quotaDeficit: quotaDeficitOf(person),
                        // Read by `compareContinuityCandidates` only. Present on
                        // every candidate so there is one candidate shape.
                        taskLeads: leadsByTask.get(task.name).get(person.name) || 0,
                        // Read by `orderTeamFills` only, and present here for
                        // the same reason `taskLeads` is: one candidate shape, and
                        // the snapshot the lead ranking reads is the snapshot the
                        // fairness comparator ranked.
                        gradeRank: person.gradeRank,
                    };
                    if (best === null || compare(candidate, best) < 0) {
                        best = candidate;
                    }
                }

                /**
                 * Which watched incumbents lost this position TO A FLOOR: eligible,
                 * not stopped by anything, and beaten by somebody further behind their
                 * quota minimum. Empty unless a floor counts this task.
                 */
                const floorLosers = new Set();
                if (watched !== null && floorsHere.length > 0 && best !== null) {
                    for (const [name, rejection] of watched) {
                        if (rejection !== null) continue;
                        if (best.quotaDeficit > (watchedDeficits.get(name) || 0)) floorLosers.add(name);
                    }
                }

                return { eligible, best, tally, watched, floorLosers, hoursDetail, windowDetail, quotaDetail };
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

                // The QUOTA ledger, kept up to date on EVERY assignment for the same
                // reason the hours ledger is: the flag decides whether a gate consults
                // it, never whether it is true. One call, and it walks the quotas that
                // count this task — a configuration with none walks nothing.
                countQuotaDuty(quotas, quotaCounts, task, name, dateKey);

                state.onTaskToday.add(name);
                // `onTaskToday` above is also what stops one person taking two
                // positions of the same shift: it is the per-task-per-day capacity
                // limit's state, read as `REJECT_ON_TASK` for every position of any
                // kind. The trio rule needs no separate machinery.
                //
                // ONE list, in assignment order. The composition step decides who
                // leads; nothing here does.
                state.fills.push({ position: slot.position, candidate });

                // The incumbency ledger a POSITIVE cross-occurrence affinity reads,
                // counted on the ANCHOR role only: somebody who has co-led a clinic
                // six times has no incumbency in it.
                if (slot.position.role === anchorRoleOf(task)) {
                    const anchorCounts = leadsByTask.get(task.name);
                    anchorCounts.set(name, (anchorCounts.get(name) || 0) + 1);
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

                    if (chosenEvaluation.floorLosers.size > 0) {
                        const known = incumbentFloorLosses.get(chosenSlot.task.name) || new Set();
                        for (const name of chosenEvaluation.floorLosers) known.add(name);
                        incumbentFloorLosses.set(chosenSlot.task.name, known);
                    }

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
                                // THE POSITION'S LABEL, so that a roster master
                                // reading three unfilled lines for one trio can tell
                                // which of the three failed. For the paired sugar the
                                // label IS `'lead'` / `'coLead'`, unchanged.
                                role: chosenSlot.position.label,
                                reason: describeEmptyPool({
                                    task: chosenSlot.task,
                                    position: chosenSlot.position,
                                    dateKey,
                                    tally: chosenEvaluation.tally,
                                    poolSize: staff.length,
                                    hoursDetail: chosenEvaluation.hoursDetail,
                                    windowDetail: chosenEvaluation.windowDetail,
                                    quotaDetail: chosenEvaluation.quotaDetail,
                                }),
                            },
                        });
                        continue;
                    }

                    assign(chosenSlot, chosenEvaluation.best);
                }
            };

            // --- phase 1: every PRIMARY position on this day, scarcest first ---
            //
            // Every lead slot and every slot entry, in ONE pass and ONE scarcity
            // ordering, because that is what they are: staffing requirements that
            // stand on their own, none of them dependent on another being filled
            // first. So the department's one principal is not spent on an ungated
            // duty while a principal-gated position waits, and — the case the team
            // composition exists for — a trio whose junior entry cannot be staffed
            // still fills the other two and reports ONE `unfilled` entry naming the
            // junior slot.
            let order = 0;
            const primaryPositions = [];
            for (const task of running) {
                for (const position of task.positions) {
                    if (position.phase !== PHASE_PRIMARY) continue;
                    primaryPositions.push({ task, position, order: order += 1 });
                }
            }
            fillMostConstrainedFirst(primaryPositions);

            // --- continuity: did an incumbency change hands today? -------------
            //
            // Runs between the phases because the anchor positions are final after
            // phase 1 and the attached ones are irrelevant to continuity. An
            // occurrence whose anchor went unfilled updates nothing: the incumbent
            // stays the incumbent, the gap is already in `unfilled`, and resuming
            // afterwards is continuity holding rather than breaking twice.
            for (const task of running) {
                if (!affinities.preferSameByTask.has(task.name)) continue;

                const holders = anchorFillsOf(task).map((fill) => fill.candidate.name);
                if (holders.length === 0) continue;

                const previous = continuityHistory.get(task.name);
                continuityHistory.set(task.name, { dateKey, holders });

                if (previous === undefined) continue;
                // The SAME predicate `scoreRoster` counts with, so the warnings and
                // `breakdown.continuityBreaks` can never disagree about whether
                // continuity held. `holders` keeps its roster order for the message.
                if (continuitySignature(previous.holders) === continuitySignature(holders)) continue;

                const known = incumbentRejections.get(task.name);
                const lostToFloor = incumbentFloorLosses.get(task.name) || new Set();
                const clauses = previous.holders
                    .filter((name) => !holders.includes(name))
                    .map((name) => {
                        const rejection = known ? known.get(name) : undefined;
                        const prose = rejection ? CONTINUITY_REJECTION_PROSE[rejection] : null;
                        // A QUOTA FLOOR took it, which is a different sentence from a
                        // tie-break and is measured rather than assumed: the winner's
                        // deficit was strictly larger than theirs at the moment the
                        // slot was decided.
                        if (prose === null && lostToFloor.has(name)) {
                            return `no constraint stopped ${name} that day; the slot went to somebody further behind their quota floor, which outranks continuity`;
                        }
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
                    `Continuity break: ${task.name} was led by ${previous.holders.join(' and ')} on ${previous.dateKey} but by ${holders.join(' and ')} on ${dateKey}${clauses.length === 0 ? '' : ` — ${clauses.join('; ')}`}.`,
                );
            }

            // --- phase 2: ATTACHED positions, scarcest first -------------------
            //
            // A team-composed task has none — its composition declares no anchor, so
            // there is nothing an attached position could hang off — and it therefore
            // passes through this loop without effect rather than being special-cased
            // out of it. Every position it needed was filled in phase 1.
            const attachedPositions = [];
            for (const task of running) {
                const attached = task.positions.filter((position) => position.phase === PHASE_ATTACHED);
                if (attached.length === 0) continue;

                if (anchorFillsOf(task).length === 0) {
                    // Assigning them now would orphan them: there is no anchor to
                    // pair them with, and promoting one would be the very fallback
                    // this engine refuses to make. Record them as unfilled and say
                    // why.
                    for (const position of attached) {
                        dayUnfilled.push({
                            order: order += 1,
                            entry: {
                                date: dateKey,
                                task: task.name,
                                role: position.label,
                                reason: `no lead could be assigned to ${task.name} on ${dateKey}, so its co-lead slots were left unfilled rather than staffed without a lead`,
                            },
                        });
                    }
                    continue;
                }

                for (const position of attached) {
                    attachedPositions.push({ task, position, order: order += 1 });
                }
            }
            fillMostConstrainedFirst(attachedPositions);

            // --- emit the day's shift objects, in task order ------------------
            //
            // ONE line of dispatch, on the task's declared COMPOSITION. Which
            // assignee is the shift's `lead`, whether there is one shift or several,
            // and what `assignees` holds are all section 5's business — there is no
            // per-feature branch here, and a third composition needs no edit to this
            // loop.
            for (const task of running) {
                const shifts = COMPOSERS[task.composition](task, dayState.get(task.name).fills, week);
                if (shifts.length === 0) continue;

                if (!roster[dateKey]) roster[dateKey] = [];
                for (const shift of shifts) roster[dateKey].push(shift);
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

    // --- the quota FLOORS: MEASURED off the finished roster, and NAMED ---------
    //
    // A floor cannot be enforced, so the only honest thing left is to say, in words, who
    // did not get theirs. Post-mortem A-RC4 is the whole shape of this block: the
    // engine does NOT report the running counters it made its decisions from, it
    // re-reads the roster it actually produced (`measureQuotaCounts` — the same
    // function `auditHardConstraints` uses for the ceilings) and compares that.
    //
    // ONE WARNING PER PERSON PER QUOTA, listing every period they came up short in and
    // by how much. Per person rather than per period because "Ada was short in March
    // and again in May" is one conversation, and a 52-week run with a monthly floor
    // would otherwise produce a wall of near-identical sentences.
    //
    // JUDGED ONLY WHERE IT CAN BE: whole periods (a partial month is warned about
    // above), and only for people the quota applies to and whose cohort windows put
    // the work within reach in that period.
    if (quotaFloors.length > 0) {
        const measured = measureQuotaCounts(roster, quotas, new Map(tasks.map((task) => [task.name, task])));

        for (let i = 0; i < quotas.length; i += 1) {
            const quota = quotas[i];
            if (quota.min === null) continue;

            for (const person of quotaSubjectsOf[i]) {
                const shortfalls = [];
                for (const bucket of quotaBuckets[i]) {
                    if (!bucket.whole) continue;
                    if (!quotaReachableIn(quota, tasks, bucket, occurrencesByTask, person)) continue;
                    const held = quotaHeld(measured, i, bucket.key, person.name);
                    if (held >= quota.min) continue;
                    shortfalls.push(`${quotaPeriodLabel(quota, bucket.key)} (${held} of ${quota.min}, ${quota.min - held} short)`);
                }
                if (shortfalls.length === 0) continue;

                warnings.push(
                    `Quota floor not met: ${person.name} is short of ${quotaSource(quota)} — at least ${quota.min} ${quotaClassLabel(quota)} ${quota.min === 1 ? 'duty' : 'duties'} ${quotaPeriodPhrase(quota)} — in ${shortfalls.join(', ')}. A floor cannot be met by inventing capacity: the engine preferred them for every occurrence it could and this is what was left.`,
                );
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
//
//     A DEPARTMENT HAS NOW ASKED FOR THE MISSING PIECE (2026-08-17, audiology).
//     This entry has always been true; what is new is that it has cost somebody
//     something. The engine has the DURATION of a half day — `DEFAULT_TASK_HOURS`
//     is 4 and two make a working day — but not its POSITION, so two tasks that
//     BOTH really run in the morning are 8h against an 8.4h cap and are taken:
//     the engine has double-booked a morning, which is the one thing it promises
//     never to do. It is not a refusal it failed to make; it is a fact it was
//     never given, and no field on a task can give it. The same hole makes "in
//     for the morning only" unsayable, because `unavailable` is whole dates.
//     Specified as queue item 4 in `ROSTER_TODO.md` and decided as `Q13` in
//     `ROSTER_HANDOFF.md`: an optional `session` of `AM` / `PM` / `FULL`, absent
//     meaning either half so that no existing roster moves. NOT BUILT — and the
//     ordering above is the honest reading of it: a clash the engine cannot see
//     is a worse failure than most of items 1–11, and it is still queued behind
//     single-cell editing because the department that asked needs both.

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
//  4. A SLOT'S BAND IS ONE BAND — IN THE FIELD, not in the engine. `{ band:
//     'senior' }` cannot be widened to "senior or principal"; leaving the band off
//     means ANY grade, including an unrecorded one. So "a second senior, or a
//     principal if no senior is free" is not expressible from a configuration, and
//     expressing it as two tasks changes which shift the two people are on, which
//     is the thing this feature exists to control. WHAT CHANGED IN v1.9.0: the
//     ELIGIBILITY primitive's region requirement takes a SET of regions (it is the
//     same requirement `leadBands` produces, and `leadBands` has always taken a
//     list), so widening the field is `new Set(entry.bands)` in
//     `compileSlotPositions` plus a validation branch. It is one line and a refusal
//     string, not a mechanism. Still not taken, because nobody has asked and a
//     field with no wizard is a field nobody uses.
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

// --- 11. THE PRIMITIVE LAYER'S LIMITS LEDGER ---------------------------------
//
// The same ledger, for the refactor above: what a roster master can type today and
// get a surprising result from, and where a JUDGMENT CALL was made rather than a
// fact found. Every item is a real behaviour of the code above, measured where it
// says measured. A judgment call buried in a comment is a decision nobody made.
//
//  1. `temporal` IS AN ENGINE FIELD WITH NO WIZARD AND NO SUGAR, AND THAT IS THE
//     BIGGEST JUDGMENT CALL IN THIS CHANGE. The brief asked that the unified form
//     be ABLE to express 1st-and-3rd, alternate weeks, explicit dates and a bounded
//     range "even if no sugar exposes them yet". It is exposed anyway — as the
//     PRIMITIVE itself, validated by `validateTemporalPattern` — because a
//     capability that cannot be driven through `generateRosterV2` cannot be
//     PROVEN, and this repository's rule is that nothing is claimed that is not
//     measured. The cost: a field a roster master cannot reach from the UI, which
//     is a shape of dead surface this file otherwise avoids. → FLAGGED FOR THE
//     ROSTER OWNER: either give `recurrence` an `ordinals` list and the weekday
//     strip an "every other week" toggle, or hide `temporal` again and accept that
//     the four combinations are pinned only at the resolver.
//  2. A CONFIGURATION CARRYING `temporal` DOES NOT SURVIVE THE WIZARD. `rosterWizard.js`
//     maps its task table to `days`, and `buildDemoRosterV2ConfigFromTables` writes
//     no `temporal`, so loading such a config into the sandbox tables and
//     regenerating silently reverts it to Mon–Fri. Nothing warns. Consequence of
//     item 1 and closed by the same fix.
//  3. `every` COUNTS THE RUN'S WEEKS, NOT THE CALENDAR'S. `{ every: 2, offset: 0 }`
//     is "alternate weeks of THIS generation", anchored at `effectiveStart`. Two
//     six-week runs generated back to back therefore both start on their own
//     week 0, and a department generating a month at a time can get the same
//     fortnightly clinic twice in eight days across the seam. This is the same
//     border-data limit `consecutiveRunBefore` and the weekly hours window already
//     carry, and it is why the clause is documented as run-relative rather than
//     ISO-week-relative: an ISO anchor would have made the phase depend on a
//     calendar nobody typed.
//  4. A `window` THAT MISSES THE RUN IS WARNED ABOUT IN THE PATTERN'S WORDS AND
//     NOT THE WINDOW'S. `temporalLabel` renders the CLAUSES, so a task whose window
//     falls entirely outside the horizon is reported as "runs on every Monday and
//     Wednesday, and no such date falls between 2026-09-07 and 2026-09-13" — true,
//     but it does not say that the WINDOW is what excluded them. MEASURED, and the
//     same measurement caught a double article ("runs on the every Monday"), which
//     is fixed: each clause now carries its own article and the sentence does not.
//     → Flagged: the sentence still wants the window in it, which is a further prose
//     change in `temporalLabel` and no more.
//  5. A VACUOUS CLAUSE INSIDE A NON-VACUOUS PATTERN IS SILENT. `clauses:
//     [{ kind: 'weekly', weekdays: [] }, { kind: 'dates', dates: […] }]` is not
//     vacuous — the dates clause can occur — so the "no days selected" warning does
//     not fire, and nobody is told the weekly half of the pattern does nothing. The
//     warning is per PATTERN, not per clause.
//  6. BOTH RESOLVERS TRUNCATE SILENTLY PAST A YEAR. `temporalOccurrences` walks at
//     most `MAX_ROSTER_WEEKS * 7` days for a weekly clause and `MAX_ROSTER_WEEKS`
//     months for a monthly one. Inside this engine that is unreachable — `weeks` is
//     capped at 52 — but the function is exported, and a caller passing a decade
//     gets the first year with no error. The bound is the one the monthly walk has
//     always had; the weekly one is new and matches it.
//  7. ELIGIBILITY IS AN AND AND NOTHING ELSE. There is no OR, no NOT, and no
//     `anyOf`. "A senior, or a principal if no senior is free" is still not
//     expressible — see multi-slot ledger item 4 for why it is now a one-line
//     change rather than a mechanism, and why it was still not taken.
//  8. A POSITION'S SENTENCE NAMES ONLY ITS FIRST REGION REQUIREMENT.
//     `regionsRequiredBy` returns the first one it finds. Nothing builds two today
//     (a position gets at most one, from `leadBands` or from a slot's `band`), and
//     the GATE would handle two correctly; the REASON STRING would name one of
//     them. A second region kind must fix the prose as well as the table.
//  9. THE GATE ORDER IS WRITTEN OUT IN `SLOT_GATES`, NOT DERIVED FROM
//     `CAPACITY_LIMITS`. The affinity gate sits BETWEEN the hours limits and the
//     consecutive-day one — which is where it has always sat, and no amount of
//     iterating the capacity table in order would produce it — so a new capacity
//     limit has to be named in TWO places: a row in `CAPACITY_LIMITS` and an id in
//     `SLOT_GATES`. A limit added to the table alone is silently never asked.
//     → Flagged: the alternative is an explicit `order` number per row, which trades
//     a forgettable second edit for a magic-number column. Neither is obviously
//     right; the current one is at least visible in one screen.
// 10. THERE IS NO PER-WEEK DUTY CEILING. `maxPerWeek` is a row nobody has written.
//     The week PERIOD exists (the hours cap uses it) and the meter exists (duties),
//     so it is a five-line row — but adding it changes rosters, so it is not
//     smuggled in beside a refactor.
// 11. TWO AFFINITY POLARITIES ARE DECLARED AND DEAD, AND ONE OF THEM WOULD FAIL
//     SILENTLY. Nothing produces `require` or `avoid`, nothing reads them, and there
//     is no validation for them — `resolveAffinities` filters the adjacency map to
//     `forbid` explicitly, so a `require` pair introduced by a future compiler would
//     be DROPPED rather than refused. That is exactly the failure mode this engine
//     exists to prevent, and it is tolerated only because no code path can reach it
//     today. → FLAGGED: whoever implements `require` must add the reader FIRST; the
//     guard is currently a test in `rosterEngineV2.primitives.test.js` ("leaves
//     `require` and `avoid` DECLARED AND UNPRODUCED"), not a line in the engine.
// 12. QUOTAS ARE DECLARED AND NOT ENFORCED, AND THE FLOOR IS THE HARD HALF. A
//     `max` is a capacity limit read from the other end and is a row in
//     `CAPACITY_LIMITS`. A `min` cannot be enforced by refusing anything: it is only
//     knowable at the end of the run, and honouring one means biasing the CANDIDATE
//     COMPARATOR towards people short of their minimum while occurrences remain —
//     which changes who gets every duty and therefore every existing roster.
//     `resolveQuotas` returns an empty frozen list, and a non-empty one produces a
//     WARNING that the roster ignored it rather than looking obedient.
// 13. THE SCALE IS NOT A CONFIGURATION FIELD. `defineGradeScale`,
//     `validateScaleRegions` and `regionOfRank` are exported and a nursing or
//     medical scale is declarable IN CODE, but `rules` carries only `bands` — a
//     region cut for the allied-health scale — and `resolveGradeScale` always
//     returns `ALLIED_HEALTH_SCALE`. A configuration naming `rules.scale` is
//     ignored exactly as any unknown key is, and a nursing grade is still refused
//     in allied health's words. PINNED BY TEST so the absence is a decision.
//     → FLAGGED: exposing it needs its own refusal wording (which scale? named how?
//     validated against what?) and a wizard, and it is the obvious next step.
// 14. THE UNKNOWN RANK MOVED FROM 0 TO `firstRank - 1` (6 for AH7–AH17). Behaviour
//     is identical for this scale because every recorded rank is at least 7 and
//     every use is a difference or a `>` — MEASURED across 30 configurations,
//     including one whose staff are all ungraded and one that mixes graded with
//     ungraded on a team shift. A scale declared with `firstRank: 0` or below would
//     put the unknown sentinel level with or under a real rank and could tie; nothing
//     declares one, and `defineGradeScale` does not refuse it.
// 15. `defineGradeScale` TRUSTS ITS ARGUMENTS. There is no `validateGradeScale`: a
//     scale declared with a missing `prose` noun prints `undefined` into a refusal a
//     roster master reads, and one whose `regions` are not contiguous is only caught
//     when `validateScaleRegions` is called on them. The four exported faces are
//     safe because the allied-health instance is declared in this file and pinned by
//     149 tests; a scale declared elsewhere is on its author.
// 16. REGIONS ARE STILL CONTIGUOUS AND TOTAL. A profession whose grouping genuinely
//     is not a partition of a line — "levels 5 and 7 are one band, 6 is another" —
//     cannot say it. That is a deliberate restriction, not an oversight: the gap it
//     refuses is the failure mode section 0b exists to prevent.
// 17. `compileTaskPrimitives` DOES NOT VALIDATE. It is the inspection face on
//     `normaliseTasks`, so a task `validateRosterV2Config` would refuse compiles to
//     nonsense rather than throwing. Pass it a validated task.
// 18. THE TWO SHORTFALL WARNINGS ARE STILL SUGAR-SPECIFIC. "needs N leads per day
//     from the X band" fires for a `leadBands` task and "needs N people from the X
//     band per day" for a `slots` task. They are the same primitive fact — a
//     position whose eligibility more people must satisfy than do — in two
//     sentences, kept apart because merging them would change the warning text and
//     the bar for this change was byte-identical output. → Flagged for a later pass.
// 19. STRUCTURE HAS EXACTLY TWO COMPOSITIONS, AND `anchorRole` IS ALL THAT SEPARATES
//     THEM. A composition with TWO anchor roles — a lead and a named deputy, each
//     gated, each anchoring its own attached positions — is a third row nobody has
//     written. So is "the scarce qualification leads", which multi-slot ledger item 7
//     asks for: it is now a `compose` function rather than a rewrite of the day loop.
// 20. `normaliseTasks` RUNS THREE TIMES PER GENERATION, and now allocates a position
//     list and an eligibility array per task on each of them (the generator, then
//     `auditHardConstraints`, then `scoreRoster` through it). MEASURED on the
//     largest run this engine accepts — 52 weeks, 12 staff, 4 tasks — the whole
//     generation is within noise of the pre-refactor engine. Stated so that nobody
//     is surprised by three identical compilations in a profiler, and so that the
//     obvious fix (compile once and pass it down) is recognised as a change to the
//     PUBLIC signatures of `scoreRoster` and `auditHardConstraints`, which take a
//     raw config on purpose.

// --- 12. QUOTAS AND COHORT WINDOWS: THE LIMITS LEDGER ------------------------
//
// The same ledger, for the two primitives above: what a roster master can type today
// and get a surprising result from, and where a JUDGMENT CALL was made rather than a
// fact found. Every item is a real behaviour of the code above, measured where it says
// measured. A judgment call buried in a comment is a decision nobody made.
//
// QUOTAS
//
//  1. A FLOOR IS A PREFERENCE, NOT A GUARANTEE, AND THAT IS THE HEADLINE. The engine
//     prefers whoever is furthest behind and then TELLS YOU who still came up short.
//     It will not double-book, leave a slot empty to reserve it for somebody, or move a
//     duty it has already placed to make a later floor reachable — there is no
//     backtracking and no repair pass. So a floor that is arithmetically possible can
//     still be missed by a roster this engine builds: give the only two skill holders
//     a floor of two Saturdays each in a four-Saturday month and put one of them on
//     leave for three of them, and the arithmetic says 4 ≤ 4 while the roster ends
//     1 / 3. MEASURED — it is the test "never buys somebody a slot a HARD constraint
//     refuses them". → FLAGGED: closing it means a repair pass over the finished
//     roster (the seam is open: `scoreRoster` and `auditHardConstraints` are pure), and
//     that is a separate, measurable piece of work.
//  2. THE FLOOR DEFICIT IS A MAXIMUM ACROSS OVERLAPPING QUOTAS, NOT A SUM. Somebody two
//     behind on a task quota and one behind on a category quota that counts the same
//     task is treated as two behind, because the two quotas would be satisfied by the
//     same duties and adding them would count that work twice. A department that
//     genuinely wants "two Saturdays AND two Sundays" says it with two quotas over two
//     classes that do not overlap, and then the maximum is the right number anyway.
//     → Flagged as a judgment call, WITH THE REASON NO TEST PINS IT. For two floors over
//     the SAME class the two rules are provably order-equivalent: a person's held count
//     is the same for both quotas, so the deficits are `m1 - h` and `m2 - h`, and for two
//     people with `h_a < h_b` the maximum differs by `h_b - h_a` and the sum by
//     `2(h_b - h_a)` — always the same sign, so no comparison can change. They can only
//     diverge for OVERLAPPING BUT DIFFERENT classes (a task quota and a category quota
//     that counts that task plus another), and no configuration in the interviews has
//     that shape. The mutation table records max→sum as an UNCAUGHT mutation rather than
//     pretending otherwise.
//  3. THE QUOTA POPULATION IS NARROWED, AND THE NARROWING IS A DECISION.
//     `scope: 'person'` reads as "everybody", and it is not: `quotaSubjects` counts only
//     people who could fill some position of the class on standing eligibility (skill,
//     band, whether any window names the task) plus — when the hours model is on — whose
//     day can hold one occurrence. Without that, a floor on a skill-gated task would
//     refuse in every mixed team, and worse, the impossible-floor arithmetic would
//     produce FALSE REFUSALS by multiplying `min` by people who could never take a
//     duty. The narrowing is announced in a warning naming the excluded people, because
//     a silently smaller population is a silently weaker constraint.
//  4. AND THE LINE IT DRAWS IS "PERMANENT", WHICH IS ARGUABLE AT THE EDGE. Leave, a
//     full day, a consecutive-day run and a forbidden pairing are things that happen to
//     somebody who could otherwise do the work, so the floor still applies and is
//     reported unmet. Somebody on leave for every single occurrence of the class in a
//     period is therefore reported short every period, with no hint that leave is why.
//     → FLAGGED: the shortfall sentence could carry the binding reason (the engine knows
//     it per date, in the tally) and does not. It is the clearest next improvement here.
//  5. A PARTIAL PERIOD IS NEVER JUDGED AND NEVER REFUSED. A four-week run from a Monday
//     almost never holds a whole calendar month, so `quotaPeriodBuckets` marks partial
//     buckets and both the refusal and the shortfall report skip them; one warning per
//     partial bucket says so. The cost: a department generating a month at a time on
//     Monday boundaries gets NO monthly floor judged at all, only warnings — the
//     interview's rule is a calendar-month rule and the engine's runs are week-aligned,
//     and nothing can make those agree. February 2027 is the rare month that is exactly
//     four weeks from a Monday, which is why it is the test fixture.
//  6. QUOTAS DO NOT CROSS RUNS. The same border-data limit `consecutiveRunBefore`, the
//     weekly hours window and `every`-week cadence already carry: two Saturdays worked
//     in a previous generation are invisible, so a month split over two runs is two
//     partial months and neither is judged.
//  7. A CEILING IS COUNTED IN DUTIES, AND SO IS A FLOOR. `min: 2` is two OCCURRENCES,
//     never two hours and never two whole days. A trio shift counts as one duty for each
//     of its three assignees, which is right for "two Saturdays a month" and would be
//     wrong for "16 weekend hours a month" — nobody asked for the second.
//  8. THE ORDER OF THE CEILING GATE DECIDES WHICH QUOTA A REASON NAMES. Where two
//     ceilings would both refuse somebody, the reason names the FIRST in resolution
//     order (task quotas before category quotas, each in declaration order). The other
//     is equally true and unmentioned.
//  9. A TOP-LEVEL `config.quotas` KEY IS STILL SILENTLY IGNORED. The surfaces are
//     `task.quota` and `rules.quotas`; a `quotas` array at the top level is an unknown
//     key and is dropped exactly as `rules.scale` is (primitive-layer ledger item 13).
//     It is the most likely place a roster master will try first. → FLAGGED, and
//     deliberately not fixed here: `rosterEngineV2.primitives.test.js` pins that such a
//     configuration is neither refused nor warned about, and moving that pin is a
//     decision for the roster owner rather than a side effect of this change. The fix is
//     either to accept it as a third sugar or to refuse unknown top-level keys, and the
//     second is a much larger conversation about every key in the config.
// 10. NO REGION QUOTA. `scope: 'region'` — "every junior does two Saturdays a month" —
//     is REFUSED with a sentence saying it is unimplemented. That is the honest state,
//     but it is also the constraint one of the interviews arguably meant, and expressing
//     it per person is not the same thing.
// 11. `score.breakdown` GAINED NO QUOTA COMPONENT. An unmet floor is a warning and not a
//     soft-penalty term, so `softPenalty` cannot tell a configuration that met its floors
//     from one that missed them. Adding a term means a third weights overlay beside
//     `SOFT_PENALTY_WEIGHTS` and `HOURS_SOFT_PENALTY_WEIGHTS` (both pinned), and a weight
//     nobody has calibrated. → Flagged for a later pass.
//
// COHORT WINDOWS
//
// 12. THE UNION READING IS A CHOICE, AND THE OTHER READING IS REASONABLE. A window that
//     names tasks admits ONLY those tasks, so a student whose single window names the
//     supervised clinic is eligible for the supervised clinic and for nothing else, ever.
//     The alternative — each window restricts only the tasks it names, and unnamed tasks
//     stay unbounded — is what somebody adding a one-line "she can only do X in March"
//     window to an existing person will expect, and they will get a person who does
//     nothing else all year. The refusal for a window with no bound at all
//     ("cancels every other window") exists because of exactly this trap, and the
//     validator refuses a task no window reaches; a window that quietly narrows a person
//     is still possible and is only visible in `unfilled`.
// 13. THE SENTENCE READS A LABEL AS A NOUN PHRASE. `label: 'team B block'` gives
//     "Cara is outside their team B block, which runs …"; `label: 'starts mid-run'` gives
//     "outside their starts mid-run", which is nonsense the engine cannot detect. A label
//     is the department's own noun and is never matched on, so this is a documentation
//     problem rather than a correctness one — but it is in a sentence a clinician reads.
// 14. THE UNFILLED REASON NAMES THE WINDOWS, NOT THE TEAM. The field interview's
//     sentence was "team B's block runs 2026-09-01 to 2026-12-31 and no eligible member
//     is free". The engine has no concept of a team — windows are per person — so it
//     produces one clause per blocked PERSON, naming their label and their dates, and
//     truncates at three with a count. A department with an eight-person block gets three
//     names and "and 5 others outside their cohort window", where the interview wanted one
//     sentence about the block. → FLAGGED: expressing that needs a first-class cohort
//     object (a named group with a window and members), which is a bigger feature and
//     changes the config shape.
// 15. WINDOWS ARE COMPARED AS STRINGS, DELIBERATELY. `'2026-09-14' <= '2026-12-31'` is
//     correct for every well-formed `YYYY-MM-DD` pair, so `windowCoversDate` constructs no
//     `Date`, and there is no timezone, no DST and no parse to get wrong. The cost is that
//     the whole mechanism depends on validation having refused every other date shape,
//     which it does — including `2027-02-30`, which `isDateKey` catches.
// 16. THE AUDIT'S SLOT MATCHING DOES NOT ASK ABOUT WINDOWS. `unmatchableAssignees` answers
//     the DATE-LESS eligibility question, so a `slots` shift holding somebody outside their
//     block is reported once, by `HARD_RULE_WINDOW`, rather than twice. Somebody whose
//     windows never name the task is caught by BOTH — the matching (for team tasks) and the
//     window rule — and that double count is tolerated because it is a defect either way.
// 17. THE `leadBands` SHORTFALL WARNING IS WINDOW-BLIND. "Task X needs 1 lead per day from
//     the Principal band, but only 1 person qualifies" counts band and skill holders and
//     does NOT subtract people whose windows never name the task, so it can under-report a
//     shortfall. Its `slots` twin DOES ask the date-less window question. Two sentences that
//     should be one (primitive-layer ledger item 18, one release older and now one
//     inconsistency deeper).
// 18. THERE IS NO WINDOW WIZARD, AND NO WINDOW IN THE DEMO TABLES. `staff.windows` joins
//     `continuity`, `recurrence`, `forbidPairs`, `maxConsecutiveDays`, `temporal` and now
//     `quota` on the list of engine capability with no UI path
//     (ROSTER_QC_AUDIT_SURFACES.md §3). Loading a windowed configuration into the sandbox
//     tables and regenerating silently drops the windows, exactly as it drops `temporal`.
// 19. `normaliseTasks` NOW RUNS FOUR TIMES for a configuration that declares a quota or a
//     window — the generator, the validator's cross-check block, `auditHardConstraints`,
//     and `scoreRoster` through it. Primitive-layer ledger item 20 counted three; this is
//     the fourth, it is gated on the features being used, and the fix is the same one
//     (compile once and pass it down, which changes two public signatures).
