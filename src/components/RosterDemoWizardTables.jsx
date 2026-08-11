/**
 * ==============================================================================
 * ROSTER WIZARD — THE SANDBOX'S GRADE-AWARE TABLES (presentation only)
 * ==============================================================================
 *
 * The three controls that replaced the sandbox wizard's two comma-separated
 * textareas:
 *
 *   1. `BandBoundaryEditor` — ONE RULER of the AH7–AH17 scale with two draggable
 *      dividers, cutting it into the junior / senior / principal regions. It sits
 *      ABOVE both tables because everything below it resolves against it: move a
 *      divider and the grade range beside every task's chips changes in the same
 *      keystroke.
 *   2. `DepartmentHoursEditor` — the contracted week and the longest working day.
 *      Beside the ruler because it is the same KIND of thing: one departmental
 *      policy that every row below is judged against.
 *   3. `StaffTable` — Name / Grade / FTE / Away.
 *   4. `TaskTable` — Task / Who may lead / Days / Co-lead?, plus a per-row
 *      "More…" disclosure holding hours and the multi-slot editor.
 *
 * WHY THE TASK TABLE HAS A DISCLOSURE AND THE STAFF TABLE DOES NOT. The task row
 * already carries a name, three band chips, seven day chips, a co-lead toggle and
 * a remove button — eleven controls. Hours and a slot list would make it fifteen
 * to twenty, on a row that has to fit a modal, and the two new ones are needed by
 * a minority of tasks (the lab's long benches, the embryologists' trios) while the
 * first four are needed by all of them. So the common case stays visible and the
 * rest is one click away, CLOSED by default. Two rules keep that from hiding
 * something that matters: a row whose hidden cells are set says so in a summary
 * line under its name, and a row whose hidden cells are WRONG opens itself.
 *
 * ⚠️ SANDBOX ONLY. `RosterView` renders this in place of the two textareas when
 * `isDemo` is true, and renders the textareas exactly as before when it is not.
 * Nothing in this file imports Firestore, and nothing in it can write anything.
 *
 * NO STATE LIVES HERE. Every row, every band bound and every error comes in as a
 * prop and every edit goes out as a callback, so the one source of truth is
 * `RosterView`'s state and the one validator is
 * `buildDemoRosterV2ConfigFromTables`. A local copy of a cell's value here would
 * be a second, divergent answer to "what will be generated".
 * ==============================================================================
 */

import React, { useRef, useState } from 'react';
import { Plus, Trash2, ShieldAlert, Users, ClipboardList, Layers, ChevronRight, ChevronDown, Clock } from 'lucide-react';
import {
    DEFAULT_TASK_HOURS,
    DEFAULT_WEEKLY_HOURS,
    GRADE_SCALE,
} from '../utils/rosterEngineV2';
import {
    ANY_BAND,
    BAND_DIVIDERS,
    BAND_NAMES,
    RULER_GRADES,
    SLOTS_MAX,
    SLOTS_MIN,
    WEEKDAY_STRIP,
    bandDividerAtFraction,
    bandLabel,
    bandRulerModel,
    countWorkingDays,
    createTaskSlot,
    derivedDailyHours,
    describeBandRange,
    describeFteAsDays,
    moveBandDivider,
    parseFteCell,
} from '../utils/rosterWizard';

/** Shared cell chrome, so the three controls cannot drift apart visually. */
const CELL_INPUT =
    'w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none';
const TH = 'text-left font-bold uppercase text-[10px] text-slate-400 py-1 pr-2';
const ADD_ROW =
    'mt-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200 font-bold text-[10px] uppercase tracking-wider transition-colors';

/** A pressed/unpressed pill. `aria-pressed` is the state, not the styling. */
const Toggle = ({ pressed, onClick, label, title, ariaLabel }) => (
    <button
        type="button"
        onClick={onClick}
        aria-pressed={pressed}
        aria-label={ariaLabel}
        title={title}
        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border transition-colors ${
            pressed
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-emerald-400'
        }`}
    >
        {label}
    </button>
);

/** Per-row problems, on their own full-width line under the row they belong to. */
const RowErrors = ({ errors, colSpan }) => {
    const messages = Object.values(errors || {}).filter(Boolean);
    if (messages.length === 0) return null;
    return (
        <tr>
            <td colSpan={colSpan} className="pb-2">
                {messages.map((message) => (
                    <p
                        key={message}
                        className="text-[10px] font-bold text-red-600 dark:text-red-400 flex items-start gap-1"
                    >
                        <ShieldAlert size={11} className="shrink-0 mt-px" />
                        <span>{message}</span>
                    </p>
                ))}
            </td>
        </tr>
    );
};

// --- 1. BAND BOUNDARIES: THE RULER --------------------------------------------
//
// This control used to be six number boxes — a min and a max for each of the three
// bands. Six independent numbers can express a GAP (AH12 in no band, so an AH12
// clinician is silently barred from every band-gated task), an OVERLAP, or a
// partition that stops short of either end of the scale; the only defence was
// `validateGradeBands` complaining afterwards.
//
// It is now ONE ruler with TWO dividers, because two dividers cannot express any
// of those states. The bands are DERIVED from where the dividers sit, so
// contiguity and full coverage of AH7–AH17 are arithmetic rather than assertions,
// and each divider's travel is bounded by its neighbour so that no band can be
// emptied or inverted. The constraint arithmetic lives in `rosterWizard.js`
// (`bandRulerModel`, `moveBandDivider`, `bandDividerLimits`) where it is pure and
// testable without a DOM; everything here is geometry and chrome.
//
// THE VALIDATION CALL STAYS. `buildDemoRosterV2ConfigFromTables` still runs
// `validateGradeBands`, and `reason` is still rendered below. That is belt and
// braces on purpose, and the braces are load-bearing:
//   • the state shape is unchanged and still holds raw strings, so a future caller
//     (or a restored session, or a fixture with a different `rules.bands`) can
//     still hand this component something that is not a partition — the ruler says
//     so rather than pretending, and the validator is what blocks Generate;
//   • the engine is the authority on what it will accept. A UI that stops
//     validating because its widget "cannot" produce a bad value is asserting
//     success instead of measuring it, which is the specific habit this repo's
//     post-mortem exists to break;
//   • the two agree today. If they ever stop agreeing, the message path is the
//     only thing that will say so out loud.
//
// WHAT IS NOT KEYBOARD-EXPRESSIBLE ANY MORE: typing an exact number. Arrow keys
// step by one grade and Home/End jump to the legal limits, which covers the eleven
// reachable positions in at most ten presses, but somebody who wants "senior
// starts at AH13" types nothing — they count. That is a real loss against the six
// boxes and it is recorded in the limits ledger rather than glossed over.

/** Colour per region. Keyed by band name, with a fallback so an added band draws. */
const BAND_TINT = Object.freeze({
    junior: 'bg-sky-200 text-sky-900 dark:bg-sky-900/70 dark:text-sky-100',
    senior: 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900/70 dark:text-emerald-100',
    principal: 'bg-violet-200 text-violet-900 dark:bg-violet-900/70 dark:text-violet-100',
});
const BAND_TINT_FALLBACK = 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100';

/** The same three colours as solid dots, for the text readout beside the ruler. */
const BAND_DOT = Object.freeze({
    junior: 'bg-sky-500',
    senior: 'bg-emerald-500',
    principal: 'bg-violet-500',
});

// Geometry. The ruler is one row of `RULER_GRADES.length` equal cells, so a grade's
// left edge and a divider's line are both exact fractions of the track's width —
// and `bandDividerAtFraction` inverts exactly this mapping, which is what makes a
// drag land on the line the user is pointing at. Percentages are computed inline
// (not as Tailwind classes) because the number of cells is derived from the
// engine's `GRADE_SCALE`; a hard-coded `grid-cols-11` would be a second, silent
// definition of how long the scale is.
const RULER_CELL = 100 / RULER_GRADES.length;
const rulerEdge = (grade) => (grade - RULER_GRADES[0]) * RULER_CELL;
const rulerSpan = (min, max) => (max - min + 1) * RULER_CELL;
/** The boundary LINE just after `grade` — where a divider whose value is `grade` sits. */
const rulerLine = (grade) => rulerEdge(grade) + RULER_CELL;
/** Fixed to 4 dp so the rendered style string is deterministic, not float noise. */
const pct = (value) => `${Number(value.toFixed(4))}%`;

/**
 * The department's cut of the AH scale, as a ruler.
 *
 * Props are unchanged from the six-box editor: `inputs` is the same
 * `{ junior: { min, max }, … }` state, `onChange(band, bound, value)` is the same
 * per-bound callback, and `reason` is still `validateGradeBands`' own string. So
 * `RosterView` needs no change at all.
 *
 * ONE MOVE IS TWO CALLBACKS. `onChange` patches a single bound, and moving a
 * divider changes two (the band below ends here, the band above starts one grade
 * later). `moveBandDivider` returns them together and they are applied in one
 * event handler, where React batches them into a single re-render — so no
 * intermediate gap or overlap is ever rendered, validated or generated from.
 *
 * NO VALUE IS COPIED INTO LOCAL STATE, not even mid-drag: every pointer move
 * commits straight through `onChange` and the handle re-renders from `inputs`.
 * The only local bookkeeping is WHICH divider a pointer has grabbed, which is not
 * an answer to "what will be generated" and so cannot diverge from one.
 */
export const BandBoundaryEditor = ({ inputs, onChange, reason }) => {
    const trackRef = useRef(null);
    const draggingRef = useRef(null);

    const model = bandRulerModel(inputs);

    /** The one write path: clamp in the pure layer, then emit every patch it gives. */
    const commit = (index, requested) => {
        const move = moveBandDivider(inputs, index, requested);
        if (!move.ok) return;
        for (const [band, bound, value] of move.patches) onChange(band, bound, value);
    };

    /** A pointer x -> the divider value it points at, or `null` if unmeasurable. */
    const gradeAtClientX = (clientX) => {
        const track = trackRef.current;
        if (!track || typeof track.getBoundingClientRect !== 'function') return null;
        const rect = track.getBoundingClientRect();
        // A zero-width track has no fraction to compute: jsdom measures everything
        // as 0, and a collapsed or hidden panel legitimately does too. `null` makes
        // the drag a no-op rather than slamming the divider to the bottom of the
        // scale, which is what dividing by zero would do here.
        if (!rect || !(rect.width > 0) || !Number.isFinite(clientX)) return null;
        return bandDividerAtFraction((clientX - rect.left) / rect.width);
    };

    const handleKeyDown = (index) => (event) => {
        const { min, max } = model.limits[index];
        const current = model.dividers[index];
        let requested = null;

        switch (event.key) {
            case 'ArrowLeft':
            case 'ArrowDown':
                requested = current - 1;
                break;
            case 'ArrowRight':
            case 'ArrowUp':
                requested = current + 1;
                break;
            // Home and End go to the LEGAL limits, which are the same numbers the
            // slider publishes as aria-valuemin / aria-valuemax — never to the ends
            // of the scale, which would empty a band.
            case 'Home':
                requested = min;
                break;
            case 'End':
                requested = max;
                break;
            default:
                return;
        }

        // Stops the arrow keys scrolling the wizard behind the focused handle.
        event.preventDefault();
        commit(index, requested);
    };

    const handlePointerDown = (index) => (event) => {
        const handle = event.currentTarget;
        if (event.pointerId !== undefined && typeof handle.setPointerCapture === 'function') {
            // Keeps the gesture attached to this handle once the pointer leaves it,
            // and on touch is what stops the drag becoming a page scroll.
            try {
                handle.setPointerCapture(event.pointerId);
            } catch (unsupported) {
                // jsdom and older Safari: the drag still works, it just stops at the
                // handle's own bounds.
            }
        }
        if (typeof handle.focus === 'function') handle.focus();
        draggingRef.current = index;
        // Deliberately no commit here: pointerdown GRABS the handle. Committing on
        // the press would nudge the divider whenever a click landed a pixel off
        // centre, which reads as the control moving on its own.
    };

    const handlePointerMove = (index) => (event) => {
        if (draggingRef.current !== index) return;
        const grade = gradeAtClientX(event.clientX);
        if (grade !== null) commit(index, grade);
    };

    const endDrag = () => {
        draggingRef.current = null;
    };

    return (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <Layers size={13} /> Grade bands
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                Where this department cuts the allied-health scale. Drag a divider, or focus one and use
                the arrow keys — Home and End jump to how far it can go. Every task&apos;s
                {' '}<span className="font-bold">who may lead</span> below is resolved against these
                boundaries, so a change here changes the grade ranges shown there immediately.
            </p>

            {/* THE RULER. `trackRef` is this outer box, and the regions inside it fill
                it exactly, so one `getBoundingClientRect` measures both the drag
                geometry and the render geometry. The handles overflow it deliberately
                (they are taller and stick out), which is why the clipping lives on the
                inner strip and not here. */}
            <div ref={trackRef} className="relative select-none touch-none">
                <div className="relative h-8 overflow-hidden rounded-lg border border-slate-300 dark:border-slate-600">
                    {model.segments.map((segment) => (
                        <div
                            key={segment.band}
                            aria-hidden="true"
                            style={{
                                left: pct(rulerEdge(segment.min)),
                                width: pct(rulerSpan(segment.min, segment.max)),
                            }}
                            className={`absolute inset-y-0 flex items-center justify-center px-1 ${
                                BAND_TINT[segment.band] || BAND_TINT_FALLBACK
                            }`}
                        >
                            <span className="truncate text-[9px] font-black uppercase tracking-wider">
                                {bandLabel(segment.band)}
                            </span>
                        </div>
                    ))}
                </div>

                {model.dividers.map((value, index) => {
                    const { below, above } = BAND_DIVIDERS[index];
                    const { min, max } = model.limits[index];
                    const label = `Boundary between the ${bandLabel(below)} and ${bandLabel(above)} bands`;
                    return (
                        <div
                            key={`${below}-${above}`}
                            role="slider"
                            tabIndex={0}
                            aria-label={label}
                            aria-orientation="horizontal"
                            aria-valuemin={min}
                            aria-valuemax={max}
                            aria-valuenow={value}
                            // The number alone ("13") tells a screen-reader user
                            // nothing about what moved, so the announced value is the
                            // two spans either side of this divider.
                            aria-valuetext={`${bandLabel(below)} ${describeBandRange([below], model.bands)}, ${bandLabel(above)} ${describeBandRange([above], model.bands)}`}
                            title={`${label} — drag it, or use the arrow keys`}
                            onKeyDown={handleKeyDown(index)}
                            onPointerDown={handlePointerDown(index)}
                            onPointerMove={handlePointerMove(index)}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                            onLostPointerCapture={endDrag}
                            style={{ left: pct(rulerLine(value)) }}
                            className="absolute -top-1 -ml-3 h-10 w-6 cursor-ew-resize touch-none rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 focus:ring-offset-slate-50 dark:focus:ring-offset-slate-900"
                        >
                            <span
                                aria-hidden="true"
                                className="absolute inset-y-1 left-1/2 -ml-px w-0.5 rounded-full bg-slate-600 dark:bg-slate-200"
                            />
                            <span
                                aria-hidden="true"
                                className="absolute left-1/2 top-1/2 h-5 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-slate-500 bg-white shadow dark:border-slate-300 dark:bg-slate-800"
                            />
                        </div>
                    );
                })}
            </div>

            {/* The scale itself. Decorative for a screen reader — the sliders'
                `aria-valuetext` and the readout below carry the same numbers in a
                form that is worth reading aloud. */}
            {/* `text-slate-500` rather than the `text-slate-400` this file uses for
                headings: these numbers are the scale a roster master reads a boundary
                off, not decoration, and slate-400 on slate-50 is about 2.4:1. */}
            <div aria-hidden="true" className="mt-1 flex text-[9px] font-bold tabular-nums text-slate-500 dark:text-slate-400">
                {RULER_GRADES.map((grade) => (
                    <span key={grade} className="flex-1 truncate text-center">{`AH${grade}`}</span>
                ))}
            </div>

            {/* …and the same three bands as plain text, because a ruler is not
                readable to everyone and "AH7–AH12" is the thing a roster master
                checks against a payslip. Same wording and same en dash as the band
                chips below, via `describeBandRange`, so the two cannot disagree. */}
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {model.segments.map((segment) => (
                    <li key={segment.band} className="flex items-center gap-1.5">
                        <span
                            aria-hidden="true"
                            className={`h-2 w-2 shrink-0 rounded-full ${BAND_DOT[segment.band] || 'bg-slate-400'}`}
                        />
                        {/* ONE text node, deliberately: "Junior AH7–AH12" is a single
                            phrase, and splitting the name and the span across two
                            elements would leave a screen reader (and a test) reading
                            two fragments that have to be reassembled. */}
                        <span className="text-[10px] font-bold tabular-nums text-slate-700 dark:text-slate-200">
                            {`${bandLabel(segment.band)} ${describeBandRange([segment.band], model.bands)}`}
                        </span>
                    </li>
                ))}
            </ul>

            {/* Unreachable from `RosterView` today — its state starts as a partition
                and this control cannot leave it as anything else. Kept because the
                prop is still a bag of raw strings: if anything ever hands this
                component a non-partition, the honest answer is to say the ruler is
                not showing it, not to draw a divider at NaN. Never auto-corrected:
                a control that rewrites its own value on render generates against
                boundaries nobody chose. */}
            {!model.representsInputs && (
                <p className="mt-2 text-[10px] font-bold text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                    <ShieldAlert size={12} className="shrink-0 mt-px" />
                    <span>
                        The boundaries currently in force are not one unbroken cut of the scale, so the
                        ruler cannot show them. It is showing the nearest cut it can express — move a
                        divider to adopt it.
                    </span>
                </p>
            )}

            {/* The backstop. `validateGradeBands`' own string, still rendered here
                and still gating Generate upstream — see the section note above for
                why this stays even though the dividers cannot trip it. */}
            {reason && (
                <p className="mt-2 text-[10px] font-bold text-red-600 dark:text-red-400 flex items-start gap-1.5">
                    <ShieldAlert size={12} className="shrink-0 mt-px" />
                    <span>{reason}</span>
                </p>
            )}
        </div>
    );
};

// --- 1b. DEPARTMENT HOURS -----------------------------------------------------
//
// The 42-hour week, which is what both interviewed teams actually described. It
// lives up here with the band ruler rather than in a column, because it is the
// same kind of fact: one departmental policy that every row below is judged
// against.
//
// BOTH BOXES START EMPTY, AND THAT IS THE FEATURE. The engine's hours model is
// OPT-IN on mention (`hoursModelRequested`): stating `rules.weeklyHours` switches
// it on even when the value typed is the default 42. So a prefilled 42 would turn
// hours on for every visitor who never thought about hours, and start reporting
// slots as unfilled against an 8.4-hour day nobody set. The boxes therefore show
// the number they WOULD apply as a placeholder and emit nothing until somebody
// types — and the caption says out loud that blank means "duties only".
//
// THE DERIVED DAY IS SHOWN, NOT RE-IMPLEMENTED. `derivedDailyHours` wraps the
// engine's own `defaultMaxHoursPerDay` over whatever the week box currently
// holds, so the placeholder in the second box is the figure the engine will
// actually use, and it follows the first box as it is typed.

const HOURS_FIELD =
    'w-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs font-bold tabular-nums text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none';

/**
 * The contracted week and the longest working day, in plain words.
 *
 * `inputs` is `{ weeklyHours, maxHoursPerDay }` — raw strings, like every other
 * cell in this wizard — `onChange(field, value)` is per field, and `errors` is the
 * mapper's `hoursErrors` for the two of them.
 */
export const DepartmentHoursEditor = ({ inputs, onChange, errors }) => {
    const weekly = inputs?.weeklyHours ?? '';
    const daily = inputs?.maxHoursPerDay ?? '';
    const tracking = weekly.trim() !== '' || daily.trim() !== '';
    const problems = [errors?.weeklyHours, errors?.maxHoursPerDay].filter(Boolean);

    return (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <Clock size={13} /> Working hours
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                Leave both boxes empty and AURA counts <span className="font-bold">duties</span> only —
                the way it always has. Fill either one in (or give any task its own length under
                {' '}<span className="font-bold">More…</span>) and it starts counting{' '}
                <span className="font-bold">hours</span> as well: same-day durations add up against the
                daily limit, one week&apos;s against the weekly one, and a duty that would breach either
                is reported as not staffed, with the hours named, rather than quietly assigned.
            </p>

            <div className="flex flex-wrap gap-4">
                <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block mb-1" htmlFor="demo-weekly-hours">
                        Standard working week
                    </label>
                    <div className="flex items-baseline gap-1.5">
                        <input
                            id="demo-weekly-hours"
                            type="text"
                            inputMode="decimal"
                            value={weekly}
                            placeholder={String(DEFAULT_WEEKLY_HOURS)}
                            onChange={(e) => onChange('weeklyHours', e.target.value)}
                            className={HOURS_FIELD}
                        />
                        <span className="text-[10px] font-bold text-slate-400">hours</span>
                    </div>
                </div>

                <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block mb-1" htmlFor="demo-daily-hours">
                        Longest working day
                    </label>
                    <div className="flex items-baseline gap-1.5">
                        <input
                            id="demo-daily-hours"
                            type="text"
                            inputMode="decimal"
                            value={daily}
                            // The number the engine would derive from the week box as
                            // it currently reads — not the shipped 8.4, which would be
                            // a lie the moment somebody types a 35-hour week.
                            placeholder={String(derivedDailyHours(weekly))}
                            onChange={(e) => onChange('maxHoursPerDay', e.target.value)}
                            className={HOURS_FIELD}
                        />
                        <span className="text-[10px] font-bold text-slate-400">hours</span>
                    </div>
                </div>
            </div>

            <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {/* 🛡️ CORRECTED (audit ROSTER_QC_AUDIT_SURFACES.md, HIGH #2). This line
                    used to claim "Hours are not being counted … AURA will not apply the
                    42h week unless you type it" whenever both boxes were blank. That is
                    FALSE: the engine applies its defaults regardless. Measured — one
                    person, ten 8h tasks on one day, no rules at all: nine unfilled slots,
                    reason "over their 8.4h daily limit". Both boxes blank means DEFAULTS,
                    not "off", and there is no way to switch hours off. Saying otherwise on
                    the screen that configures it is the exact failure this project keeps a
                    post-mortem about. */}
                {tracking
                    ? `Hours are counted against the limits above: a ${derivedDailyHours(weekly)}h day, scaled by each person's FTE. A task with no length of its own counts as a ${DEFAULT_TASK_HOURS}h session.`
                    : `Hours are always counted. Leave these blank and AURA uses the standard ${DEFAULT_WEEKLY_HOURS}h week and a ${derivedDailyHours(String(DEFAULT_WEEKLY_HOURS))}h day, scaled by each person's FTE; a task with no length of its own counts as a ${DEFAULT_TASK_HOURS}h session. Type a number here only to override that.`}
            </p>

            {problems.map((message) => (
                <p key={message} className="mt-2 text-[10px] font-bold text-red-600 dark:text-red-400 flex items-start gap-1.5">
                    <ShieldAlert size={12} className="shrink-0 mt-px" />
                    <span>{message}</span>
                </p>
            ))}
        </div>
    );
};

// --- 2. STAFF -----------------------------------------------------------------

/**
 * Name / Grade / FTE / Away.
 *
 * The grade dropdown's first option is BLANK and means "not recorded" — it is not
 * a default of AH7. Somebody with no grade recorded cannot lead a band-gated
 * task, and the engine says so by name in the warnings under the calendar. That
 * is the honest answer, and it is why there is no "assume junior" here.
 *
 * "0.6" IS NOT A CONTRACT ANYBODY RECOGNISES. An FTE is the number the engine
 * weighs fairness with, but nobody describes their own week that way: they work
 * three days. So each row also says what the figure MEANS, computed from the days
 * this department has actually ticked (`workingDays`) rather than from an assumed
 * five-day week — a lab that runs Saturdays would be told the wrong number by a
 * hard-coded 5. The number itself stays in the box, because it is what a payroll
 * record holds and it is what the load table reports against.
 */
export const StaffTable = ({ rows, errors, onChange, onAdd, onRemove, workingDays = 0 }) => (
    <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
            <Users size={13} /> Staff
        </p>

        <div className="overflow-x-auto">
            <table className="w-full text-xs">
                <thead>
                    <tr>
                        <th className={TH}>Name</th>
                        <th className={TH}>Grade</th>
                        <th className={TH}>FTE</th>
                        <th className={TH}>Away (YYYY-MM-DD)</th>
                        <th className="w-8" />
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <React.Fragment key={row.id}>
                            <tr>
                                <td className="py-1 pr-2 align-top">
                                    <input
                                        type="text"
                                        aria-label={`Staff row ${index + 1} name`}
                                        value={row.name}
                                        placeholder={index === 0 ? 'e.g. Aisha Rahman' : ''}
                                        onChange={(e) => onChange(row.id, { name: e.target.value })}
                                        className={CELL_INPUT}
                                    />
                                    {/* Skills have no column — they arrive with the
                                        example department and are carried on the row.
                                        Shown read-only rather than hidden: the example's
                                        one unfillable slot exists BECAUSE only two people
                                        hold CPET, and an invisible constraint that causes
                                        a visible failure is exactly what this app is
                                        against. */}
                                    {row.skills?.length > 0 && (
                                        <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                            skills: {row.skills.join(' · ')}
                                        </p>
                                    )}
                                </td>
                                <td className="py-1 pr-2 align-top">
                                    <select
                                        aria-label={`Staff row ${index + 1} job grade`}
                                        value={row.grade}
                                        onChange={(e) => onChange(row.id, { grade: e.target.value })}
                                        className={CELL_INPUT}
                                    >
                                        <option value="">Not recorded</option>
                                        {GRADE_SCALE.map((grade) => (
                                            <option key={grade} value={grade}>{grade}</option>
                                        ))}
                                    </select>
                                </td>
                                <td className="py-1 pr-2 align-top">
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        aria-label={`Staff row ${index + 1} FTE`}
                                        value={row.fte}
                                        onChange={(e) => onChange(row.id, { fte: e.target.value })}
                                        className={`${CELL_INPUT} w-16`}
                                    />
                                    {/* What the figure means, in the words the person
                                        whose contract it is would use. Read off the
                                        PARSED cell, so a blank box says "full time"
                                        (which is what blank means here) and an
                                        unreadable one says nothing at all — the row's
                                        error line is what speaks then. */}
                                    {describeFteAsDays(parseFteCell(row.fte).value, workingDays) !== '' && (
                                        <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                            {describeFteAsDays(parseFteCell(row.fte).value, workingDays)}
                                        </p>
                                    )}
                                </td>
                                <td className="py-1 pr-2 align-top">
                                    <input
                                        type="text"
                                        aria-label={`Staff row ${index + 1} away dates`}
                                        value={row.away}
                                        placeholder="2026-09-16, 2026-09-17"
                                        onChange={(e) => onChange(row.id, { away: e.target.value })}
                                        className={CELL_INPUT}
                                    />
                                </td>
                                <td className="py-1 align-top">
                                    <button
                                        type="button"
                                        aria-label={`Remove staff row ${index + 1}`}
                                        title="Remove this person"
                                        onClick={() => onRemove(row.id)}
                                        disabled={rows.length <= 1}
                                        className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </td>
                            </tr>
                            <RowErrors errors={errors[row.id]} colSpan={5} />
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>

        <button type="button" onClick={onAdd} className={ADD_ROW}>
            <Plus size={12} /> Add row
        </button>

        <p className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Leave a grade as <span className="font-bold">Not recorded</span> and AURA will keep that
            person out of every band-restricted lead slot and say so by name in the warnings — it will
            not guess a grade for them. FTE defaults to 1.0; a blank FTE is full time. Away is a
            comma-separated list of dates.
        </p>
        {workingDays > 0 && (
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                The days-a-week line under each FTE is that figure spread over the{' '}
                <span className="font-bold">{workingDays}</span>{' '}
                {workingDays === 1 ? 'day' : 'days'} a week your tasks below are ticked for. Tick
                another day and it changes.
            </p>
        )}
    </div>
);

// --- 3. TASKS -----------------------------------------------------------------

/** How many columns a task row spans — used by the error line and the drawer. */
const TASK_COLUMNS = 6;

/**
 * ONE TASK'S HIDDEN HALF: how long it takes, and whether it is staffed as a lead
 * plus a co-lead or as a list of slots.
 *
 * Rendered as its own full-width row under the task's row, not as extra columns,
 * because a slot list is a LIST — three lines of two controls each — and there is
 * no width in a 6-column table for it.
 *
 * THE MODE SWITCH HIDES THE CONTROLS IT WOULD OVERRIDE. The engine refuses a task
 * carrying `slots` beside `leads`, `coLeads` or `leadBands`, so in slot mode the
 * band chips and the co-lead toggle are replaced by a sentence saying where those
 * decisions have moved to. Leaving them on screen, greyed or not, would be showing
 * a control whose value the mapper then drops — which is the shape of every defect
 * in this repo's post-mortem.
 */
const TaskRowDetail = ({ row, index, bands, onChange }) => {
    const label = (suffix) => `Task row ${index + 1} ${suffix}`;

    const patchSlot = (slotId, patch) =>
        onChange(row.id, {
            slots: row.slots.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)),
        });

    const addSlot = () => onChange(row.id, { slots: [...row.slots, createTaskSlot()] });

    const removeSlot = (slotId) =>
        onChange(row.id, { slots: row.slots.filter((slot) => slot.id !== slotId) });

    return (
        <tr>
            <td colSpan={TASK_COLUMNS} className="pb-3">
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-3 space-y-3">

                    {/* --- how long one occurrence takes --- */}
                    <div className="flex flex-wrap items-end gap-3">
                        <div>
                            <label
                                className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block mb-1"
                                htmlFor={`task-hours-${row.id}`}
                            >
                                Hours per session
                            </label>
                            <input
                                id={`task-hours-${row.id}`}
                                type="text"
                                inputMode="decimal"
                                aria-label={label('hours')}
                                value={row.hours}
                                // The engine's own exported default, so the number
                                // shown here cannot drift from the number applied.
                                placeholder={String(DEFAULT_TASK_HOURS)}
                                onChange={(e) => onChange(row.id, { hours: e.target.value })}
                                className={`${CELL_INPUT} w-20 tabular-nums`}
                            />
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed max-w-md">
                            Blank means <span className="font-bold">{DEFAULT_TASK_HOURS}h</span> — a
                            session, which is what these teams roster in. Typing any length here starts
                            AURA counting hours for the whole run, even if the department boxes above
                            are empty.
                        </p>
                    </div>

                    {/* --- lead + co-lead, or a team of slots --- */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                            Staffed as
                        </span>
                        <Toggle
                            pressed={!row.slotMode}
                            onClick={() => onChange(row.id, { slotMode: false })}
                            label="Lead + co-lead"
                            ariaLabel={`Task row ${index + 1}: staffed as a lead plus a co-lead`}
                            title="One person in charge, optionally with a second alongside"
                        />
                        <Toggle
                            pressed={row.slotMode}
                            // Whatever was typed before is kept — a row that has never
                            // been in slot mode already carries SLOTS_MIN blank entries
                            // from `createTaskRow`, so switching in never starts empty.
                            onClick={() => onChange(row.id, { slotMode: true })}
                            label="A team of slots"
                            ariaLabel={`Task row ${index + 1}: staffed as a team of slots`}
                            title="One entry per person the shift needs, each with its own band and skill"
                        />
                    </div>

                    {row.slotMode ? (
                        <div className="space-y-2">
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                One line per person this shift needs, filled independently. The{' '}
                                <span className="font-bold">lead</span> is whoever ends up on it holding
                                the highest grade — there is no lead slot to pick — and if one line
                                cannot be filled the others still are, with the empty one reported by
                                name. Listing a band first does not make it more likely to be staffed.
                            </p>
                            {/* The one trap in this editor, said where it is sprung:
                                a skill is only satisfiable by somebody who already
                                holds it, and the staff table has no skills column, so
                                for a typed-in team any skill here refuses the whole
                                run. Better said out loud than discovered by a
                                disabled Generate button. */}
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                A skill only narrows a slot — somebody in the staff pool has to hold it
                                already, or AURA refuses the whole run and says so. The example
                                department&apos;s people come with skills; a team typed in by hand has
                                none, so leave the skill blank for them.
                            </p>

                            {row.slots.map((slot, slotIndex) => (
                                <div key={slot.id} className="flex flex-wrap items-end gap-2">
                                    <div>
                                        <label
                                            className="text-[9px] font-bold text-slate-400 uppercase block"
                                            htmlFor={`slot-band-${slot.id}`}
                                        >
                                            {`Slot ${slotIndex + 1} band`}
                                        </label>
                                        <select
                                            id={`slot-band-${slot.id}`}
                                            aria-label={label(`slot ${slotIndex + 1} band`)}
                                            value={slot.band}
                                            onChange={(e) => patchSlot(slot.id, { band: e.target.value })}
                                            className={`${CELL_INPUT} w-32`}
                                        >
                                            <option value={ANY_BAND}>Any grade</option>
                                            {/* The band's span under the CURRENT ruler,
                                                same helper and same en dash as the chips,
                                                so a moved divider re-labels these too. */}
                                            {BAND_NAMES.map((band) => (
                                                <option key={band} value={band}>
                                                    {`${bandLabel(band)} ${describeBandRange([band], bands)}`.trim()}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label
                                            className="text-[9px] font-bold text-slate-400 uppercase block"
                                            htmlFor={`slot-skill-${slot.id}`}
                                        >
                                            Skill needed (optional)
                                        </label>
                                        <input
                                            id={`slot-skill-${slot.id}`}
                                            type="text"
                                            aria-label={label(`slot ${slotIndex + 1} required skill`)}
                                            value={slot.requiresSkill}
                                            placeholder="e.g. Witnessing"
                                            onChange={(e) => patchSlot(slot.id, { requiresSkill: e.target.value })}
                                            className={`${CELL_INPUT} w-40`}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        aria-label={`Remove task row ${index + 1} slot ${slotIndex + 1}`}
                                        title={row.slots.length <= SLOTS_MIN
                                            ? `A team needs at least ${SLOTS_MIN} slots — switch back to lead + co-lead instead`
                                            : 'Remove this slot'}
                                        onClick={() => removeSlot(slot.id)}
                                        disabled={row.slots.length <= SLOTS_MIN}
                                        className="mb-1 p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            ))}

                            <button
                                type="button"
                                onClick={addSlot}
                                disabled={row.slots.length >= SLOTS_MAX}
                                title={row.slots.length >= SLOTS_MAX
                                    ? `The wizard offers up to ${SLOTS_MAX} slots on one shift`
                                    : 'Add another person to this shift'}
                                // No second `mt-` here: `ADD_ROW` already sets one, and
                                // two margin utilities on one element resolve by CSS
                                // order rather than class order.
                                className={`${ADD_ROW} disabled:opacity-40 disabled:cursor-not-allowed`}
                            >
                                <Plus size={12} /> {`Add slot to task ${index + 1}`}
                            </button>

                            <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 leading-relaxed">
                                While this task is a team, its <span className="font-bold">who may lead</span>{' '}
                                chips and its <span className="font-bold">co-lead</span> toggle do not
                                apply — a band goes on the slot that must hold it, and the co-lead is
                                simply the second person on the shift. AURA will not send either of
                                them to the engine for this task.
                            </p>
                        </div>
                    ) : (
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                            One lead, plus a co-lead if the toggle above says so. Switch to{' '}
                            <span className="font-bold">a team of slots</span> for a shift that needs
                            three or four named people together — a principal, a senior and a junior on
                            the same session.
                        </p>
                    )}

                    {/* NO ERROR LINE HERE, deliberately. `RowErrors` renders every
                        per-cell problem on one full-width line under this row —
                        including these two — and that is the one place this wizard
                        puts them. A second copy inside the drawer would be the same
                        sentence twice in one visual block, and two renderers for one
                        message is how the two start disagreeing. What makes the
                        single copy safe is the forced-open rule in `TaskTable`: a
                        row with an hours or slots error cannot be collapsed. */}
                </div>
            </td>
        </tr>
    );
};

/**
 * Task / Who may lead / Days / Co-lead? / More…
 *
 * "Who may lead" is three chips, and the grade range beside them is recomputed
 * from the CURRENT band boundaries on every render — so the row says
 * `AH13–AH17`, not `Senior/Principal`, which is the thing a roster master
 * actually checks against a payslip.
 *
 * Co-lead is a yes/no toggle rather than a count on purpose: `downloadCSV` and
 * `downloadICS` render exactly one co-lead, so a second one would be assigned by
 * the engine and then silently dropped from the exports this sandbox is showing
 * off. A shift that genuinely needs three people is a SLOT LIST instead, under
 * "More…", and the engine reports all of its people in `assignees`.
 *
 * THE ONE PIECE OF STATE IN THIS FILE, and it is deliberate: which rows are
 * expanded. It is not an answer to "what will be generated" — every value still
 * lives in `RosterView` — so it cannot diverge from one, which is the property the
 * file header's no-state rule exists to protect (the ruler's `draggingRef` is the
 * same exception for the same reason). Collapsing a row changes nothing about the
 * roster: hours and slots typed inside stay in the row and stay in the config.
 */
export const TaskTable = ({ rows, errors, bands, onChange, onAdd, onRemove }) => {
    const [expandedRows, setExpandedRows] = useState(() => new Set());

    const toggleExpanded = (id) =>
        setExpandedRows((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const toggleBand = (row, band) =>
        onChange(row.id, {
            leadBands: row.leadBands.includes(band)
                ? row.leadBands.filter((entry) => entry !== band)
                : BAND_NAMES.filter((entry) => entry === band || row.leadBands.includes(entry)),
        });

    const toggleDay = (row, day) =>
        onChange(row.id, {
            days: row.days.includes(day)
                ? row.days.filter((entry) => entry !== day)
                : [...row.days, day].sort((a, b) => a - b),
        });

    return (
        <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <ClipboardList size={13} /> Tasks
            </p>

            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr>
                            <th className={TH}>Task</th>
                            <th className={TH}>Who may lead</th>
                            <th className={TH}>Days</th>
                            <th className={TH}>Co-lead?</th>
                            {/* The disclosure's own column, headed rather than blank:
                                a nameless chevron is not discoverable. */}
                            <th className={TH}>Hours &amp; team</th>
                            <th className="w-8" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => {
                            const range = describeBandRange(row.leadBands, bands);
                            const rowErrors = errors[row.id];
                            // A row whose HIDDEN cells are wrong opens itself. Without
                            // this, a per-cell error could point at a control the
                            // visitor cannot see — the wizard would be refusing to
                            // generate and showing the reason for a box that is not on
                            // screen. The disclosure is a convenience; a refusal the
                            // user cannot act on is not.
                            const forcedOpen = Boolean(rowErrors?.hours || rowErrors?.slots);
                            const open = expandedRows.has(row.id) || forcedOpen;
                            const hoursSet = typeof row.hours === 'string' && row.hours.trim() !== '';
                            const Chevron = open ? ChevronDown : ChevronRight;

                            return (
                                <React.Fragment key={row.id}>
                                    <tr>
                                        <td className="py-1 pr-2 align-top min-w-[8rem]">
                                            <input
                                                type="text"
                                                aria-label={`Task row ${index + 1} name`}
                                                value={row.name}
                                                placeholder={index === 0 ? 'e.g. Outpatient Clinic' : ''}
                                                onChange={(e) => onChange(row.id, { name: e.target.value })}
                                                className={CELL_INPUT}
                                            />
                                            {/* Carried from the example department, like
                                                staff skills above: no column, but never
                                                silently applied. */}
                                            {row.requiresSkill && (
                                                <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                                    needs skill: {row.requiresSkill}
                                                </p>
                                            )}
                                            {/* WHAT THE DISCLOSURE IS HIDING, when it is
                                                hiding anything. A closed drawer must never
                                                be the only record that this task takes 8
                                                hours or needs three people. */}
                                            {(hoursSet || row.slotMode) && (
                                                <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                                                    {[
                                                        hoursSet ? `${row.hours.trim()}h per session` : null,
                                                        row.slotMode ? `team of ${row.slots.length}` : null,
                                                    ].filter(Boolean).join(' · ')}
                                                </p>
                                            )}
                                        </td>
                                        <td className="py-1 pr-2 align-top">
                                            {/* In slot mode these chips would be dropped by
                                                the mapper (the engine refuses `slots` beside
                                                `leadBands`), so the cell says where the
                                                decision moved to instead of showing a
                                                control with no effect. */}
                                            {row.slotMode ? (
                                                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-relaxed">
                                                    set per slot below
                                                </p>
                                            ) : (
                                                <>
                                                    <div className="flex flex-wrap gap-1">
                                                        {BAND_NAMES.map((band) => (
                                                            <Toggle
                                                                key={band}
                                                                pressed={row.leadBands.includes(band)}
                                                                onClick={() => toggleBand(row, band)}
                                                                label={bandLabel(band)}
                                                                ariaLabel={`Task row ${index + 1}: ${bandLabel(band)} may lead`}
                                                            />
                                                        ))}
                                                    </div>
                                                    <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                                                        {row.leadBands.length === 0
                                                            ? 'any grade may lead'
                                                            : (range || 'band boundaries are invalid')}
                                                    </p>
                                                </>
                                            )}
                                        </td>
                                        <td className="py-1 pr-2 align-top">
                                            <div className="flex flex-wrap gap-1">
                                                {WEEKDAY_STRIP.map(({ day, label }) => (
                                                    <Toggle
                                                        key={day}
                                                        pressed={row.days.includes(day)}
                                                        onClick={() => toggleDay(row, day)}
                                                        label={label}
                                                        ariaLabel={`Task row ${index + 1}: ${label}`}
                                                    />
                                                ))}
                                            </div>
                                        </td>
                                        <td className="py-1 pr-2 align-top">
                                            {row.slotMode ? (
                                                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-relaxed">
                                                    second on the shift
                                                </p>
                                            ) : (
                                                <Toggle
                                                    pressed={row.coLead}
                                                    onClick={() => onChange(row.id, { coLead: !row.coLead })}
                                                    label={row.coLead ? 'Yes' : 'No'}
                                                    ariaLabel={`Task row ${index + 1}: co-lead`}
                                                    title="One co-lead alongside the lead"
                                                />
                                            )}
                                        </td>
                                        <td className="py-1 pr-2 align-top">
                                            <button
                                                type="button"
                                                // A forced-open row REFUSES to fold, rather
                                                // than folding and springing back open the
                                                // moment the value is fixed — a box that
                                                // disappears from under the cursor
                                                // mid-correction is worse than a button
                                                // that says why it will not close.
                                                onClick={() => { if (!forcedOpen) toggleExpanded(row.id); }}
                                                aria-expanded={open}
                                                aria-label={`Task row ${index + 1}: hours and staffing`}
                                                title={forcedOpen
                                                    ? 'This task\'s hours or slots need fixing before it can be folded away'
                                                    : 'Hours per session, and whether this shift needs a team'}
                                                className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                            >
                                                <Chevron size={12} /> More
                                            </button>
                                        </td>
                                        <td className="py-1 align-top">
                                            <button
                                                type="button"
                                                aria-label={`Remove task row ${index + 1}`}
                                                title="Remove this task"
                                                onClick={() => onRemove(row.id)}
                                                disabled={rows.length <= 1}
                                                className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </td>
                                    </tr>
                                    {open && (
                                        <TaskRowDetail
                                            row={row}
                                            index={index}
                                            bands={bands}
                                            onChange={onChange}
                                        />
                                    )}
                                    <RowErrors errors={rowErrors} colSpan={TASK_COLUMNS} />
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <button type="button" onClick={onAdd} className={ADD_ROW}>
                <Plus size={12} /> Add row
            </button>

            {/* The top surprise in the engine's limits ledger, said out loud where
                the surprise would happen. */}
            <p className="mt-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-relaxed">
                Ticking two bands makes both equally eligible — it is not a preference order.
            </p>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Bands gate the <span className="font-bold">lead</span> only: anyone may co-lead, which
                is what makes a band-gated task a supervision pairing rather than a closed shop.
            </p>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                <span className="font-bold">Hours &amp; team</span> opens the rest of a task: how long
                one session takes, and whether it needs a whole team on the shift at once —{' '}
                {SLOTS_MIN}–{SLOTS_MAX} people, each with their own band and skill — instead of a lead
                and a co-lead.
            </p>
        </div>
    );
};

/** The four controls in their decided order: policy, then staff, then tasks. */
const RosterDemoWizardTables = ({
    bandInputs,
    bandsReason,
    bands,
    onBandChange,
    hoursInputs,
    hoursErrors,
    onHoursChange,
    staffRows,
    staffErrors,
    onStaffChange,
    onStaffAdd,
    onStaffRemove,
    taskRows,
    taskErrors,
    onTaskChange,
    onTaskAdd,
    onTaskRemove,
}) => (
    <div className="space-y-4">
        <BandBoundaryEditor inputs={bandInputs} onChange={onBandChange} reason={bandsReason} />
        <DepartmentHoursEditor inputs={hoursInputs} onChange={onHoursChange} errors={hoursErrors} />
        <StaffTable
            rows={staffRows}
            errors={staffErrors}
            onChange={onStaffChange}
            onAdd={onStaffAdd}
            onRemove={onStaffRemove}
            // Derived here rather than passed in from `RosterView`: it is a fact
            // about the task rows two controls below, and computing it where both
            // tables are already in scope keeps one definition of "the
            // department's week" for the whole wizard.
            workingDays={countWorkingDays(taskRows)}
        />
        <TaskTable
            rows={taskRows}
            errors={taskErrors}
            bands={bands}
            onChange={onTaskChange}
            onAdd={onTaskAdd}
            onRemove={onTaskRemove}
        />
    </div>
);

export default RosterDemoWizardTables;
