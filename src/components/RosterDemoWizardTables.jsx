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
 *   3. `DepartmentLimitsEditor` — the daily duty cap, the run of days, and the
 *      pairs who must never share a shift. Beside the hours for the same reason.
 *   4. `StaffTable` — Name / Grade / FTE / Away, plus a per-row "More…" disclosure
 *      holding this person's own daily cap and their availability windows.
 *   5. `TaskTable` — Task / Who may lead / Days / Co-lead?, plus a per-row
 *      "More…" disclosure holding how often it repeats, how long a session takes,
 *      the multi-slot editor, continuity, a per-person quota and a category.
 *
 * WHY BOTH TABLES NOW HAVE A DISCLOSURE, AND WHAT KEEPS IT HONEST. The task row
 * already carries a name, three band chips, seven day chips, a co-lead toggle and
 * a remove button — eleven controls. The nine capabilities this phase reaches would
 * have made it twenty-five, on a row that has to fit a modal, and every one of them
 * is needed by a MINORITY of rows (the psychologists' monthly clinic, the
 * embryologists' block rotation, the lab's Saturday floor) while the first four are
 * needed by all of them. So the common case stays visible and the rest is one click
 * away, CLOSED by default. THREE rules keep that from hiding something that matters:
 *
 *   • a row whose hidden cells are SET says so in a summary line under its name, in
 *     the words of the setting rather than a bare dot;
 *   • a row whose hidden cells are WRONG opens itself and refuses to fold;
 *   • a control whose value the mapper would DROP is not rendered at all — the cell
 *     says where the decision moved to instead. That is why slot mode replaces the
 *     band chips, the co-lead toggle AND the continuity toggle, and why monthly mode
 *     replaces the day strip.
 *
 * EVERY NEW CONTROL STATES ITS DEFAULT AS A PLACEHOLDER AND EMITS NOTHING WHILE IT
 * IS BLANK. That is not politeness: the engine treats a STATED value as intent, and
 * two of these fields switch a whole model on by being mentioned at all
 * (`staff.windows` bounds everybody's eligibility in time; `task.quota` compiles a
 * floor or a ceiling). A helpfully prefilled `2` in the daily-cap box would be a
 * department declaring a policy it never discussed.
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
import { Plus, Trash2, ShieldAlert, Users, ClipboardList, Layers, ChevronRight, ChevronDown, Clock, SlidersHorizontal } from 'lucide-react';
import {
    DEFAULT_TASK_HOURS,
    DEFAULT_WEEKLY_HOURS,
    GRADE_SCALE,
    ROSTER_V2_DEFAULTS,
} from '../utils/rosterEngineV2';
import {
    ANY_BAND,
    BAND_DIVIDERS,
    BAND_NAMES,
    QUOTA_PERIOD_OPTIONS,
    RECURRENCE_ORDINAL_OPTIONS,
    RULER_GRADES,
    SLOTS_MAX,
    SLOTS_MIN,
    TASK_CALENDAR_MONTHLY,
    TASK_CALENDAR_WEEKLY,
    WEEKDAY_STRIP,
    bandDividerAtFraction,
    bandLabel,
    bandRulerModel,
    countWorkingDays,
    createStaffWindow,
    createTaskSlot,
    derivedDailyHours,
    describeBandRange,
    describeFteAsDays,
    describeTaskRecurrence,
    moveBandDivider,
    parseConcurrentPerDayCell,
    parseFteCell,
} from '../utils/rosterWizard';

// --- 0. THE RESPONSIVE CONTRACT ------------------------------------------------
//
// MOST PEOPLE WHO OPEN THIS WILL OPEN IT ON A PHONE. A task row carries a name,
// three band chips, seven day chips, a co-lead toggle, a disclosure and a remove
// button; a staff row carries five fields and a disclosure. Neither fits in 375px,
// and the two `overflow-x-auto` wrappers that used to hold them meant the answer on
// a phone was "scroll sideways until you find the column you wanted" — a table
// nobody can read one row of at a time.
//
// BELOW `sm:` EVERY ROW IS A CARD. The `<table>` becomes `display:block`, the header
// row is hidden, each `<tr>` is a bordered block and each `<td>` is a full-width
// block with its column's name printed above the control. From `sm:` up every one of
// those declarations is reverted and the elements are a real table again, so the
// desktop layout is what it always was.
//
// THERE IS ONE MARKUP TREE, and that is the whole design. The obvious alternative —
// a `<div>` card list beside the `<table>`, one hidden at each breakpoint — is TWO
// renderers for one row, and this file's discipline is that a second renderer
// eventually disagrees with the first about which controls a row has. So the switch
// is CSS only: the column headings live in one object that both the `<th>`s and the
// in-card labels read, and every control, `aria-label`, `id`/`htmlFor` pairing and
// error line exists exactly once in the tree.
//
// THE IN-CARD LABEL IS NOT A SECOND ACCESSIBLE NAME. It is `aria-hidden`, and every
// field keeps the `aria-label` it already had — otherwise a screen reader would read
// the column heading and then the field name for one control.
//
// ⚠️ iOS SAFARI ZOOMS THE WHOLE PAGE when a focused input's text is under 16px, and
// it does not zoom back out: the visitor is left at 1.4× with the modal off-screen.
// So every `<input>`, `<select>` and `<textarea>` is 16px on a phone and drops back
// to the dense size from `sm:` up. Labels, helper text and headings may stay small —
// they are not focusable, so they cannot trigger it.

/** ≥16px on a phone; the dense size again from `sm:` up. */
const FIELD_TEXT = 'text-base sm:text-xs';
/** 44px, the floor both Apple's and Google's guidance put a touch target at. */
const TOUCH = 'min-h-11 sm:min-h-0';
/** …and for an icon-only control, which needs the width as well as the height. */
const TOUCH_ICON = 'min-h-11 min-w-11 sm:min-h-0 sm:min-w-0';

const RESPONSIVE_TABLE = 'w-full text-xs block sm:table';
const RESPONSIVE_HEAD = 'hidden sm:table-header-group';
const RESPONSIVE_BODY = 'block sm:table-row-group';
/**
 * A data row: a bordered card on a phone, an ordinary table row from `sm:` up.
 *
 * NO BACKGROUND, deliberately. A border, a radius and some padding are enough to
 * read as a card against the panel behind it, and a background would need a `dark:`
 * variant that then has to be reverted at `sm:` — where the `dark:` selector wins on
 * specificity over the breakpoint's media query. One less thing to get wrong.
 */
const RESPONSIVE_ROW =
    'block sm:table-row mb-3 sm:mb-0 p-3 sm:p-0 rounded-xl sm:rounded-none border sm:border-0 border-slate-200 dark:border-slate-700';
/** A full-width row — a drawer or an error line — and its single cell. */
const RESPONSIVE_FULL_ROW = 'block sm:table-row';
const RESPONSIVE_FULL_CELL = 'block sm:table-cell';

/**
 * One cell of a responsive row.
 *
 * `label` is the column's heading. It is printed inside the card on a phone, where
 * the real header row is hidden, and hidden from `sm:` up where the `<th>` carries
 * it — so the two can never say different things about the same column.
 */
const Cell = ({ label, className = '', children }) => (
    <td className={`block sm:table-cell ${className}`}>
        {label ? (
            <span
                aria-hidden="true"
                className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:hidden"
            >
                {label}
            </span>
        ) : null}
        {children}
    </td>
);

/** Shared cell chrome, so the three controls cannot drift apart visually. */
const CELL_INPUT =
    `w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 ${FIELD_TEXT} ${TOUCH} text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none`;
const TH = 'text-left font-bold uppercase text-[10px] text-slate-400 py-1 pr-2';
const ADD_ROW =
    `mt-2 flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2 sm:px-2.5 sm:py-1.5 ${TOUCH} rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200 font-bold text-[10px] uppercase tracking-wider transition-colors`;
/** An icon-only control — remove a row, a window, a slot, a pair. */
const ICON_BUTTON =
    `inline-flex items-center justify-center ${TOUCH_ICON} p-2 sm:p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors`;

/**
 * A pressed/unpressed pill. `aria-pressed` is the state, not the styling.
 *
 * The chips are the densest controls in the wizard — seven weekdays on one row —
 * and at `px-1.5 py-0.5` they were about 16px tall, a third of a thumb. On a phone
 * each one is a 44px target and the strip wraps onto as many lines as it needs;
 * from `sm:` up the original density returns.
 */
const Toggle = ({ pressed, onClick, label, title, ariaLabel }) => (
    <button
        type="button"
        onClick={onClick}
        aria-pressed={pressed}
        aria-label={ariaLabel}
        title={title}
        className={`inline-flex items-center justify-center px-3 py-2 sm:px-1.5 sm:py-0.5 ${TOUCH} rounded text-[11px] sm:text-[10px] font-bold uppercase tracking-wide border transition-colors ${
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
        <tr className={RESPONSIVE_FULL_ROW}>
            <td colSpan={colSpan} className={`${RESPONSIVE_FULL_CELL} pb-2`}>
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

/**
 * WHAT A CLOSED DRAWER IS HIDING, when it is hiding anything.
 *
 * ONE definition for both tables, because "a closed drawer must never be the only
 * record that this task is monthly or that this person has a block rotation" is one
 * rule, and two renderers for it would eventually disagree about which settings
 * count. `parts` is already-worded fragments; empty means nothing to say and nothing
 * is rendered.
 */
const HiddenSummary = ({ parts }) => {
    const shown = (parts || []).filter(Boolean);
    if (shown.length === 0) return null;
    return (
        <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            {shown.join(' · ')}
        </p>
    );
};

/**
 * The disclosure control itself, shared by both tables so the two behave the same
 * way — including the part that matters: a FORCED-OPEN row refuses to fold rather
 * than folding and springing back open the moment the value is fixed. A box that
 * disappears from under the cursor mid-correction is worse than a button that says
 * why it will not close.
 */
const DisclosureButton = ({ open, forcedOpen, onToggle, ariaLabel, title, forcedTitle }) => {
    const Chevron = open ? ChevronDown : ChevronRight;
    return (
        <button
            type="button"
            onClick={() => { if (!forcedOpen) onToggle(); }}
            aria-expanded={open}
            aria-label={ariaLabel}
            title={forcedOpen ? forcedTitle : title}
            className={`flex items-center gap-0.5 px-2 py-2 sm:px-1 sm:py-0.5 ${TOUCH} rounded text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors`}
        >
            <Chevron size={12} /> More
        </button>
    );
};

/** A labelled group inside a drawer. The whole reason a drawer with six controls reads. */
const DrawerGroup = ({ label, children }) => (
    <div className="space-y-1.5">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
        {children}
    </div>
);

/** The one hairline between drawer groups, so the groups read as groups. */
const DRAWER_DIVIDER = 'pt-3 border-t border-slate-200 dark:border-slate-700';

/** A small number box, the same chrome as the department hours fields. */
const NUMBER_FIELD =
    `w-24 sm:w-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 ${FIELD_TEXT} ${TOUCH} font-bold tabular-nums text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none`;

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
                            // 📱 44×44 ON A PHONE. The hit area was 24×40 and the
                            // visible grip 12×20 — keyboard-perfect and unusable with
                            // a thumb. The box is what a finger has to land on, so it
                            // is the box that grows; the grip stays a hairline-and-tab
                            // so the ruler still reads as a ruler. From `sm:` up the
                            // original 24×40 returns, because a mouse wants precision
                            // and two 44px boxes one grade apart would overlap.
                            className="absolute -top-1.5 -ml-[22px] h-11 w-11 sm:-top-1 sm:-ml-3 sm:h-10 sm:w-6 cursor-ew-resize touch-none rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 focus:ring-offset-slate-50 dark:focus:ring-offset-slate-900"
                        >
                            <span
                                aria-hidden="true"
                                className="absolute inset-y-2.5 sm:inset-y-1 left-1/2 -ml-px w-0.5 rounded-full bg-slate-600 dark:bg-slate-200"
                            />
                            <span
                                aria-hidden="true"
                                className="absolute left-1/2 top-1/2 h-6 w-4 sm:h-5 sm:w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-slate-500 bg-white shadow dark:border-slate-300 dark:bg-slate-800"
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
    `w-28 sm:w-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 ${FIELD_TEXT} ${TOUCH} font-bold tabular-nums text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none`;

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

            <div className="flex flex-wrap gap-x-4 gap-y-3">
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

// --- 1c. DEPARTMENT LIMITS ----------------------------------------------------
//
// Three engine constraints that had NO control at all before this phase, and the
// audit (`ROSTER_QC_AUDIT_SURFACES.md` §3) is blunt about what that meant:
// `maxConcurrentPerDay` and `maxConsecutiveDays` arrived only via "Load example
// department", so a typed-in team could not set them; `rules.forbidPairs` had zero
// hits anywhere outside the engine and its own tests — validated, gated and audited,
// and unreachable by anybody.
//
// THEY LIVE UP HERE, BESIDE THE WORKING WEEK, because they are the same kind of fact:
// one departmental policy every row below is measured against. Putting the daily cap
// in a staff column would have implied it was per person — it is the DEFAULT that a
// person's own cap overrides, and the two want to be visibly a general rule and an
// exception to it.
//
// WHY THE PAIR PICKER IS TWO DROPDOWNS AND NOT A TEXT BOX. The engine refuses a pair
// naming somebody outside the staff pool, so free text would turn every typo into a
// blocked run with a message about spelling. Two selects over the names actually in
// the table cannot produce that state at all — and when the table is empty the
// control says so instead of offering two empty boxes.

/**
 * The daily duty cap, the run of days, and "never on the same shift".
 *
 * `inputs` is `{ maxConcurrentPerDay, maxConsecutiveDays, forbidPairs }` — two raw
 * strings and a list of `[a, b]` name pairs — `onChange(field, value)` is per field,
 * and `errors` is the mapper's `rulesErrors`.
 *
 * `staffNames` comes from the staff table two controls below. It is derived rather
 * than passed in from `RosterView` for the same reason `workingDays` is: it is a fact
 * about rows that are already in scope, and computing it once keeps one definition of
 * "who is in this department".
 *
 * THE ONLY LOCAL STATE IS WHICH TWO NAMES ARE CURRENTLY SELECTED IN THE PICKER, and
 * it is not an answer to "what will be generated" — nothing reads it but the Add
 * button — so it cannot diverge from one. The committed pairs live in `RosterView`
 * like every other value in this wizard.
 */
export const DepartmentLimitsEditor = ({ inputs, onChange, errors, staffNames = [] }) => {
    const concurrent = inputs?.maxConcurrentPerDay ?? '';
    const consecutive = inputs?.maxConsecutiveDays ?? '';
    const pairs = Array.isArray(inputs?.forbidPairs) ? inputs.forbidPairs : [];
    const [pending, setPending] = useState({ a: '', b: '' });

    const problems = [errors?.maxConcurrentPerDay, errors?.maxConsecutiveDays, errors?.forbidPairs].filter(Boolean);

    /**
     * A PENDING CHOICE IS ONLY REAL WHILE THE PERSON IS. Rename or clear the staff row
     * a picker is pointing at and the stored name has no option to select — a `<select>`
     * then displays its first option while its value says otherwise, which is the
     * "control holding a value it cannot show" failure this file refuses everywhere
     * else. So the RENDERED value is filtered through the current names, and Add is
     * disabled with it. Nothing is silently substituted: the box simply goes back to
     * "Choose someone", which is the truth about what is selected.
     */
    const chosen = (which) => (staffNames.includes(pending[which]) ? pending[which] : '');
    const canAdd = chosen('a') !== '' && chosen('b') !== '' && chosen('a') !== chosen('b');

    const addPair = () => {
        if (!canAdd) return;
        onChange('forbidPairs', [...pairs, [chosen('a'), chosen('b')]]);
        setPending({ a: '', b: '' });
    };

    const removePair = (index) =>
        onChange('forbidPairs', pairs.filter((_, position) => position !== index));

    const namePicker = (which, label) => (
        <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase block" htmlFor={`demo-forbid-${which}`}>
                {label}
            </label>
            <select
                id={`demo-forbid-${which}`}
                aria-label={`Never on the same shift: ${label.toLowerCase()}`}
                value={chosen(which)}
                onChange={(e) => setPending((prev) => ({ ...prev, [which]: e.target.value }))}
                className={`${CELL_INPUT} sm:w-40`}
            >
                <option value="">Choose someone</option>
                {staffNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                ))}
            </select>
        </div>
    );

    return (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <SlidersHorizontal size={13} /> Department limits
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                How much any one person may be asked to do, and who must not be put together. All three
                are <span className="font-bold">hard</span>: a duty that would break one is reported as
                not staffed, with the limit named, rather than quietly assigned. Leave a box empty and
                AURA uses the figure shown in it.
            </p>

            <div className="flex flex-wrap gap-x-4 gap-y-3">
                <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block mb-1" htmlFor="demo-max-concurrent">
                        Most duties in one day
                    </label>
                    <input
                        id="demo-max-concurrent"
                        type="text"
                        inputMode="numeric"
                        value={concurrent}
                        // The engine's own default, so the number shown cannot drift
                        // from the number applied.
                        placeholder={String(ROSTER_V2_DEFAULTS.maxConcurrentPerDay)}
                        onChange={(e) => onChange('maxConcurrentPerDay', e.target.value)}
                        className={NUMBER_FIELD}
                    />
                    <p className="mt-0.5 text-[9px] text-slate-400 leading-relaxed max-w-[10rem]">
                        Anyone may be given their own figure under <span className="font-bold">More…</span>
                        {' '}in the staff table.
                    </p>
                </div>

                <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block mb-1" htmlFor="demo-max-consecutive">
                        Most days in a row
                    </label>
                    <input
                        id="demo-max-consecutive"
                        type="text"
                        inputMode="numeric"
                        value={consecutive}
                        placeholder={String(ROSTER_V2_DEFAULTS.maxConsecutiveDays)}
                        onChange={(e) => onChange('maxConsecutiveDays', e.target.value)}
                        className={NUMBER_FIELD}
                    />
                    <p className="mt-0.5 text-[9px] text-slate-400 leading-relaxed max-w-[10rem]">
                        Counted inside this run only — the day before it starts is not known.
                    </p>
                </div>
            </div>

            {/* --- never on the same shift --- */}
            <div className={`mt-3 ${DRAWER_DIVIDER}`}>
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                    Never on the same shift
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed mb-2">
                    Two people who must not be rostered onto one duty together — a supervision conflict,
                    a household, a grievance. AURA will leave the second half of a shift{' '}
                    <span className="font-bold">unstaffed and say so</span> rather than pair them.
                </p>

                {staffNames.length < 2 ? (
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-relaxed">
                        Add at least two named people to the staff table below and they can be paired here.
                    </p>
                ) : (
                    <div className="flex flex-col items-stretch sm:flex-row sm:flex-wrap sm:items-end gap-2">
                        {namePicker('a', 'First person')}
                        {namePicker('b', 'Second person')}
                        <button
                            type="button"
                            onClick={addPair}
                            disabled={!canAdd}
                            title={chosen('a') !== '' && chosen('a') === chosen('b')
                                ? 'Somebody cannot be kept apart from themselves — pick two different people'
                                : 'Add this pair'}
                            className={`${ADD_ROW} disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                            <Plus size={12} /> Add pair
                        </button>
                    </div>
                )}

                {pairs.length > 0 && (
                    // A LIST rather than a table on purpose: the load table's headings
                    // are read off every `<th>` in the document, and a second table in
                    // the wizard would answer that question with the wrong columns.
                    <ul className="mt-2 space-y-1">
                        {pairs.map(([a, b], index) => (
                            <li key={`${a}|${b}|${index}`} className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
                                    {`${a} and ${b}`}
                                </span>
                                <button
                                    type="button"
                                    aria-label={`Remove pair ${index + 1}, ${a} and ${b}`}
                                    title="Let these two work together again"
                                    onClick={() => removePair(index)}
                                    className={ICON_BUTTON}
                                >
                                    <Trash2 size={12} />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

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

/** How many columns a staff row spans — used by the error line and the drawer. */
const STAFF_COLUMNS = 6;

/**
 * The staff table's column headings, in one place.
 *
 * Read by the `<th>` row AND by each card's in-cell label, so the heading a phone
 * shows above a field and the heading a desktop shows above the column are the same
 * string by construction rather than by two people remembering to edit both.
 */
const STAFF_HEADINGS = Object.freeze({
    name: 'Name',
    grade: 'Grade',
    fte: 'FTE',
    away: 'Away (YYYY-MM-DD)',
    more: 'Limits & dates',
});

/**
 * ONE PERSON'S HIDDEN HALF: how many duties they may hold in a day, and the dates
 * they are available at all.
 *
 * Rendered as its own full-width row under the person's row, not as extra columns,
 * for the reason the task drawer is: a window list is a LIST — three controls per
 * line — and there is no width in a table for it.
 *
 * THE UNION SENTENCE IS THE MOST IMPORTANT COPY IN THIS FILE, and it is stated twice
 * because it is the one thing a roster master will get wrong. A person with ANY
 * window is eligible ONLY inside their windows. A window naming one task does not
 * "restrict that task and leave the rest alone" — it says "this task, in this range,
 * and nothing else at all". That is the engine's documented reading (section 0e(ii)),
 * it is the reading a placement or a block rotation actually needs, and it is not the
 * reading the words "availability window" suggest on their own.
 */
const StaffRowDetail = ({ row, index, departmentMaxPerDay, onChange }) => {
    const windows = Array.isArray(row.windows) ? row.windows : [];

    const patchWindow = (windowId, patch) =>
        onChange(row.id, {
            windows: windows.map((entry) => (entry.id === windowId ? { ...entry, ...patch } : entry)),
        });

    const addWindow = () => onChange(row.id, { windows: [...windows, createStaffWindow()] });

    const removeWindow = (windowId) =>
        onChange(row.id, { windows: windows.filter((entry) => entry.id !== windowId) });

    return (
        <tr className={RESPONSIVE_FULL_ROW}>
            <td colSpan={STAFF_COLUMNS} className={`${RESPONSIVE_FULL_CELL} pb-3`}>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-3 space-y-3">

                    {/* --- this person's own daily cap --- */}
                    <DrawerGroup label="Most duties in one day">
                        <div className="flex flex-wrap items-start gap-3">
                            <input
                                type="text"
                                inputMode="numeric"
                                aria-label={`Staff row ${index + 1} most duties per day`}
                                value={row.maxPerDay}
                                // The DEPARTMENT'S figure as it currently reads, not the
                                // engine's shipped 2 — otherwise the placeholder would be a
                                // lie the moment somebody types 3 in the box above.
                                placeholder={String(departmentMaxPerDay)}
                                onChange={(e) => onChange(row.id, { maxPerDay: e.target.value })}
                                className={NUMBER_FIELD}
                            />
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed max-w-md">
                                Blank means this person follows the department&apos;s figure of{' '}
                                <span className="font-bold">{departmentMaxPerDay}</span>, set under{' '}
                                <span className="font-bold">Department limits</span> above. A number here
                                REPLACES it for them — higher or lower — and it is hard: a third duty on a
                                day they are capped at two is reported as not staffed, not assigned.
                            </p>
                        </div>
                    </DrawerGroup>

                    {/* --- availability windows --- */}
                    <div className={DRAWER_DIVIDER}>
                        <DrawerGroup label="Available only between these dates">
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                For a rotation, a placement, a secondment or a locum — a block of months
                                that is theirs, rather than the {' '}
                                <span className="font-bold">Away</span> column&apos;s list of single days
                                off. Add nothing and they are available on every date, which is what
                                everybody in a department without rotations is.
                            </p>
                            <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 leading-relaxed">
                                ⚠ Adding even one window makes this person available{' '}
                                <span className="font-bold">only</span> inside their windows — not
                                &ldquo;available as usual, plus these&rdquo;. Two windows are read as
                                either one; a window that names tasks admits{' '}
                                <span className="font-bold">only those tasks</span>, so somebody whose one
                                window names a single clinic is on that clinic or on nothing.
                            </p>

                            {windows.length === 0 ? (
                                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-relaxed">
                                    No windows — available on every date of the run.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {windows.map((window, windowIndex) => (
                                        <div key={window.id} className="flex flex-col items-stretch sm:flex-row sm:flex-wrap sm:items-end gap-2">
                                            <div>
                                                <label
                                                    className="text-[9px] font-bold text-slate-400 uppercase block"
                                                    htmlFor={`window-from-${window.id}`}
                                                >
                                                    {`Window ${windowIndex + 1} from`}
                                                </label>
                                                <input
                                                    id={`window-from-${window.id}`}
                                                    type="text"
                                                    aria-label={`Staff row ${index + 1} window ${windowIndex + 1} from`}
                                                    value={window.from}
                                                    placeholder="any earlier date"
                                                    onChange={(e) => patchWindow(window.id, { from: e.target.value })}
                                                    className={`${CELL_INPUT} sm:w-36`}
                                                />
                                            </div>
                                            <div>
                                                <label
                                                    className="text-[9px] font-bold text-slate-400 uppercase block"
                                                    htmlFor={`window-to-${window.id}`}
                                                >
                                                    {`Window ${windowIndex + 1} to`}
                                                </label>
                                                <input
                                                    id={`window-to-${window.id}`}
                                                    type="text"
                                                    aria-label={`Staff row ${index + 1} window ${windowIndex + 1} to`}
                                                    value={window.to}
                                                    placeholder="any later date"
                                                    onChange={(e) => patchWindow(window.id, { to: e.target.value })}
                                                    className={`${CELL_INPUT} sm:w-36`}
                                                />
                                            </div>
                                            <div>
                                                <label
                                                    className="text-[9px] font-bold text-slate-400 uppercase block"
                                                    htmlFor={`window-tasks-${window.id}`}
                                                >
                                                    Only these tasks (optional)
                                                </label>
                                                <input
                                                    id={`window-tasks-${window.id}`}
                                                    type="text"
                                                    aria-label={`Staff row ${index + 1} window ${windowIndex + 1} tasks`}
                                                    value={window.tasks}
                                                    placeholder="every task"
                                                    onChange={(e) => patchWindow(window.id, { tasks: e.target.value })}
                                                    className={`${CELL_INPUT} sm:w-48`}
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                aria-label={`Remove staff row ${index + 1} window ${windowIndex + 1}`}
                                                title="Remove this window"
                                                onClick={() => removeWindow(window.id)}
                                                className={`mb-1 ${ICON_BUTTON}`}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={addWindow}
                                title="Add a block of dates this person is available for"
                                className={ADD_ROW}
                            >
                                <Plus size={12} /> {`Add availability window to person ${index + 1}`}
                            </button>

                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                Dates are <span className="font-bold">YYYY-MM-DD</span>. Leave{' '}
                                <span className="font-bold">from</span> blank for &ldquo;from the start of
                                the run&rdquo; and <span className="font-bold">to</span> blank for
                                &ldquo;until the end of it&rdquo;. Task names must match the task table
                                below exactly; separate several with commas.
                            </p>
                        </DrawerGroup>
                    </div>

                    {/* NO ERROR LINE HERE, deliberately — `RowErrors` renders every
                        per-cell problem once, on one full-width line under this row.
                        What makes the single copy safe is the forced-open rule in
                        `StaffTable`: a row with a cap or a window error cannot fold. */}
                </div>
            </td>
        </tr>
    );
};

/**
 * Name / Grade / FTE / Away / More…
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
 *
 * THE DISCLOSURE IS NEW, and it holds the two things a person can carry that the
 * engine gates on and the table had no column for: their own daily duty cap, and the
 * dates they are available at all. Same three rules as the task table's — a summary
 * line when it is hiding something, forced open when what it hides is wrong, and no
 * control rendered whose value the mapper would drop.
 *
 * THE ONE PIECE OF STATE HERE is which rows are expanded, and it is deliberate for
 * exactly the reason the task table's is: it is not an answer to "what will be
 * generated", so it cannot diverge from one.
 */
export const StaffTable = ({ rows, errors, onChange, onAdd, onRemove, workingDays = 0, departmentMaxPerDay = ROSTER_V2_DEFAULTS.maxConcurrentPerDay }) => {
    const [expandedRows, setExpandedRows] = useState(() => new Set());

    const toggleExpanded = (id) =>
        setExpandedRows((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    return (
        <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <Users size={13} /> Staff
            </p>

            {/* `sm:overflow-x-auto` rather than `overflow-x-auto`: below `sm:` the rows
                are cards and there is nothing to scroll sideways, so a phone gets no
                horizontal scroller at all. From `sm:` up it is a real table again and
                the scroller is still the safety net it always was on a narrow tablet. */}
            <div className="sm:overflow-x-auto">
                <table className={RESPONSIVE_TABLE}>
                    <thead className={RESPONSIVE_HEAD}>
                        <tr>
                            <th className={TH}>{STAFF_HEADINGS.name}</th>
                            <th className={TH}>{STAFF_HEADINGS.grade}</th>
                            <th className={TH}>{STAFF_HEADINGS.fte}</th>
                            <th className={TH}>{STAFF_HEADINGS.away}</th>
                            {/* The disclosure's own column, headed rather than blank:
                                a nameless chevron is not discoverable. */}
                            <th className={TH}>{STAFF_HEADINGS.more}</th>
                            <th className="w-8" />
                        </tr>
                    </thead>
                    <tbody className={RESPONSIVE_BODY}>
                        {rows.map((row, index) => {
                            const rowErrors = errors[row.id];
                            // A row whose HIDDEN cells are wrong opens itself, for the
                            // same reason the task table's does: a refusal the visitor
                            // cannot act on is not a refusal, it is a dead end.
                            const forcedOpen = Boolean(rowErrors?.maxPerDay || rowErrors?.windows);
                            const open = expandedRows.has(row.id) || forcedOpen;
                            const capSet = typeof row.maxPerDay === 'string' && row.maxPerDay.trim() !== '';
                            const windowCount = Array.isArray(row.windows) ? row.windows.length : 0;

                            return (
                                <React.Fragment key={row.id}>
                                    <tr className={RESPONSIVE_ROW}>
                                        <Cell label={STAFF_HEADINGS.name} className="py-1 pr-2 align-top">
                                            <input
                                                type="text"
                                                aria-label={`Staff row ${index + 1} name`}
                                                value={row.name}
                                                placeholder={index === 0 ? 'e.g. Peter Parker' : ''}
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
                                            {/* WHAT THE DISCLOSURE IS HIDING. A closed drawer
                                                must never be the only record that this person is
                                                capped at one duty or is on a four-month block. */}
                                            <HiddenSummary parts={[
                                                capSet ? `max ${row.maxPerDay.trim()} a day` : null,
                                                windowCount > 0
                                                    ? `${windowCount} availability ${windowCount === 1 ? 'window' : 'windows'}`
                                                    : null,
                                            ]} />
                                        </Cell>
                                        <Cell label={STAFF_HEADINGS.grade} className="py-1 pr-2 align-top">
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
                                        </Cell>
                                        <Cell label={STAFF_HEADINGS.fte} className="py-1 pr-2 align-top">
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                aria-label={`Staff row ${index + 1} FTE`}
                                                value={row.fte}
                                                onChange={(e) => onChange(row.id, { fte: e.target.value })}
                                                className={`${CELL_INPUT} sm:w-16`}
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
                                        </Cell>
                                        <Cell label={STAFF_HEADINGS.away} className="py-1 pr-2 align-top">
                                            <input
                                                type="text"
                                                aria-label={`Staff row ${index + 1} away dates`}
                                                value={row.away}
                                                placeholder="2026-09-16, 2026-09-17"
                                                onChange={(e) => onChange(row.id, { away: e.target.value })}
                                                className={CELL_INPUT}
                                            />
                                        </Cell>
                                        <Cell label={STAFF_HEADINGS.more} className="py-1 pr-2 align-top">
                                            <DisclosureButton
                                                open={open}
                                                forcedOpen={forcedOpen}
                                                onToggle={() => toggleExpanded(row.id)}
                                                ariaLabel={`Staff row ${index + 1}: limits and availability`}
                                                title="Their own daily duty cap, and the dates they are available"
                                                forcedTitle="This person's daily cap or availability window needs fixing before it can be folded away"
                                            />
                                        </Cell>
                                        {/* ONE remove button, not one per breakpoint. A second
                                            copy hidden at the other width would be a second
                                            element answering to `Remove staff row 1` — two
                                            controls for one action, which is how the two start
                                            disagreeing about whether the row can be removed. */}
                                        <Cell className="py-1 align-top">
                                            <button
                                                type="button"
                                                aria-label={`Remove staff row ${index + 1}`}
                                                title="Remove this person"
                                                onClick={() => onRemove(row.id)}
                                                disabled={rows.length <= 1}
                                                className={`${ICON_BUTTON} disabled:opacity-30 disabled:cursor-not-allowed`}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </Cell>
                                    </tr>
                                    {open && (
                                        <StaffRowDetail
                                            row={row}
                                            index={index}
                                            departmentMaxPerDay={departmentMaxPerDay}
                                            onChange={onChange}
                                        />
                                    )}
                                    <RowErrors errors={rowErrors} colSpan={STAFF_COLUMNS} />
                                </React.Fragment>
                            );
                        })}
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
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                <span className="font-bold">Limits &amp; dates</span> opens the rest of a person: how many
                duties they may hold in one day, and — for a rotation, a placement or a locum — the block
                of dates they are available at all. <span className="font-bold">Away</span> is for single
                days off; a window is for months at a time.
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
};

// --- 3. TASKS -----------------------------------------------------------------

/** How many columns a task row spans — used by the error line and the drawer. */
const TASK_COLUMNS = 6;

/** The task table's headings, in one place — see `STAFF_HEADINGS`. */
const TASK_HEADINGS = Object.freeze({
    name: 'Task',
    bands: 'Who may lead',
    days: 'Days',
    coLead: 'Co-lead?',
    more: 'Repeat, hours & limits',
});

/**
 * ONE TASK'S HIDDEN HALF: how often it repeats, how long it takes, how it is
 * staffed, whether the same person keeps it, how many of them one person may hold,
 * and what the department calls it.
 *
 * Rendered as its own full-width row under the task's row, not as extra columns,
 * because a slot list is a LIST — three lines of two controls each — and there is
 * no width in a 6-column table for it. SIX GROUPS, each with a heading and a rule
 * above it, because a drawer holding a dozen controls with no grouping is the same
 * wall of inputs the visible row was protected from.
 *
 * THE ORDER IS THE ORDER A ROSTER MASTER ASKS THE QUESTIONS IN: when does it happen,
 * how long is it, who staffs it, does the same person keep it, how much of it does
 * one person get, and what is it called. It is also the order the mapper reports
 * errors in, so a refusal and the screen read the same way down the page.
 *
 * A MODE SWITCH HIDES THE CONTROLS IT WOULD OVERRIDE, and there are now two of them.
 * The engine refuses a task carrying `slots` beside `leads`, `coLeads`, `leadBands`
 * or `continuity: true`, and refuses `days` beside `recurrence`. So in slot mode the
 * band chips, the co-lead toggle and the continuity toggle are replaced by a sentence
 * saying where those decisions have moved to, and in monthly mode the day strip is.
 * Leaving them on screen, greyed or not, would be showing a control whose value the
 * mapper then drops — which is the shape of every defect in this repo's post-mortem.
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

    const monthly = row.calendarMode === TASK_CALENDAR_MONTHLY;
    const pattern = describeTaskRecurrence(row);

    return (
        <tr className={RESPONSIVE_FULL_ROW}>
            <td colSpan={TASK_COLUMNS} className={`${RESPONSIVE_FULL_CELL} pb-3`}>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-3 space-y-3">

                    {/* --- 1. HOW OFTEN IT REPEATS ---------------------------------
                        The psychologists' 3rd-Wednesday clinic. `recurrence` has been
                        in the engine — validated, resolved, exported as
                        `recurrenceDatesBetween` — since v1.8.0 with no way to set it;
                        `061ae93`'s own subject line says "monthly clinics". */}
                    <DrawerGroup label="How often it repeats">
                        <div className="flex flex-wrap items-center gap-2">
                            <Toggle
                                pressed={!monthly}
                                onClick={() => onChange(row.id, { calendarMode: TASK_CALENDAR_WEEKLY })}
                                label="Every week"
                                ariaLabel={`Task row ${index + 1}: repeats every week`}
                                title="On the weekdays ticked in the Days column"
                            />
                            <Toggle
                                pressed={monthly}
                                // Whatever weekdays were ticked stay on the row, so
                                // switching to monthly and back does not lose them —
                                // the same rule the slot list follows.
                                onClick={() => onChange(row.id, { calendarMode: TASK_CALENDAR_MONTHLY })}
                                label="Once a month"
                                ariaLabel={`Task row ${index + 1}: repeats once a month`}
                                title="The nth (or last) weekday of each calendar month"
                            />
                        </div>

                        {monthly ? (
                            <>
                                <div className="flex flex-col items-stretch sm:flex-row sm:flex-wrap sm:items-end gap-2">
                                    <div>
                                        <label
                                            className="text-[9px] font-bold text-slate-400 uppercase block"
                                            htmlFor={`task-ordinal-${row.id}`}
                                        >
                                            Which one
                                        </label>
                                        <select
                                            id={`task-ordinal-${row.id}`}
                                            aria-label={label('week of the month')}
                                            value={row.recurrenceOrdinal}
                                            onChange={(e) => onChange(row.id, { recurrenceOrdinal: e.target.value })}
                                            className={`${CELL_INPUT} sm:w-28`}
                                        >
                                            {/* NOT PREFILLED. There is no engine default
                                                for "which Wednesday", so choosing the 1st
                                                on the visitor's behalf would put a clinic
                                                on a date nobody picked. Blank is refused
                                                with a reason instead. */}
                                            <option value="">Choose…</option>
                                            {RECURRENCE_ORDINAL_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label
                                            className="text-[9px] font-bold text-slate-400 uppercase block"
                                            htmlFor={`task-weekday-${row.id}`}
                                        >
                                            Day of the week
                                        </label>
                                        <select
                                            id={`task-weekday-${row.id}`}
                                            aria-label={label('monthly weekday')}
                                            value={row.recurrenceWeekday}
                                            onChange={(e) => onChange(row.id, { recurrenceWeekday: e.target.value })}
                                            className={`${CELL_INPUT} sm:w-28`}
                                        >
                                            <option value="">Choose…</option>
                                            {/* The same strip the day chips are built
                                                from, so the two cannot disagree about
                                                which number is which day. */}
                                            {WEEKDAY_STRIP.map(({ day, label: dayLabel }) => (
                                                <option key={day} value={String(day)}>{dayLabel}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                {pattern !== '' && (
                                    <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 leading-relaxed">
                                        {`Runs on ${pattern}.`}
                                    </p>
                                )}
                                <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 leading-relaxed">
                                    While this task is monthly its <span className="font-bold">Days</span>{' '}
                                    chips do not apply — a task repeats weekly or monthly, never both, and
                                    AURA will not send the ticked weekdays to the engine for it. They are
                                    kept, so switching back restores them.
                                </p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                    <span className="font-bold">Last</span> is not the same as{' '}
                                    <span className="font-bold">4th</span>: most months hold four of a
                                    weekday and some hold five. There is no &ldquo;5th&rdquo; option
                                    because a 5th-Wednesday clinic would silently vanish in most months.
                                </p>
                            </>
                        ) : (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                Every week, on the weekdays ticked in the <span className="font-bold">Days</span>{' '}
                                column. Switch to <span className="font-bold">once a month</span> for a
                                clinic that runs on the 3rd Wednesday, or the last Friday, of each month.
                            </p>
                        )}
                    </DrawerGroup>

                    {/* --- 2. how long one occurrence takes --- */}
                    <div className={`${DRAWER_DIVIDER} flex flex-wrap items-end gap-3`}>
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
                                className={`${CELL_INPUT} sm:w-20 tabular-nums`}
                            />
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed max-w-md">
                            Blank means <span className="font-bold">{DEFAULT_TASK_HOURS}h</span> — a
                            session, which is what these teams roster in. Typing any length here starts
                            AURA counting hours for the whole run, even if the department boxes above
                            are empty.
                        </p>
                    </div>

                    {/* --- 3. lead + co-lead, or a team of slots --- */}
                    <div className={`${DRAWER_DIVIDER} flex flex-wrap items-center gap-2`}>
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
                                <div key={slot.id} className="flex flex-col items-stretch sm:flex-row sm:flex-wrap sm:items-end gap-2">
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
                                            className={`${CELL_INPUT} sm:w-32`}
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
                                            className={`${CELL_INPUT} sm:w-40`}
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
                                        className={`mb-1 ${ICON_BUTTON} disabled:opacity-30 disabled:cursor-not-allowed`}
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

                    {/* --- 4. THE SAME PERSON EVERY TIME ---------------------------
                        The engine's only preference, and the one control in this
                        drawer whose SIDE EFFECT has to be on screen: it overrides
                        FTE-weighted fairness for this task's lead slot. A roster
                        master who reads "continuity of care" as a free improvement
                        will find one colleague holding every occurrence of a duty and
                        no explanation on the configure screen.
                        HIDDEN IN SLOT MODE, because the engine refuses `slots` beside
                        `continuity: true`: with a team the lead is derived from the
                        grades present, so there is no lead slot to keep. */}
                    <div className={DRAWER_DIVIDER}>
                        <DrawerGroup label="Continuity of care">
                            {row.slotMode ? (
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                    Not available while this task is a{' '}
                                    <span className="font-bold">team of slots</span>: the lead of a team
                                    shift is whichever assignee holds the highest grade, so there is no
                                    lead slot to keep with one person. Switch back to{' '}
                                    <span className="font-bold">lead + co-lead</span> to ask for it.
                                </p>
                            ) : (
                                <>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Toggle
                                            pressed={row.continuity === true}
                                            onClick={() => onChange(row.id, { continuity: row.continuity !== true })}
                                            label={row.continuity === true ? 'Same lead' : 'Anyone'}
                                            ariaLabel={`Task row ${index + 1}: same lead every time`}
                                            title="Ask for the same person to lead every occurrence of this task"
                                        />
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                            {row.continuity === true
                                                ? 'the same person leads every occurrence, where they can'
                                                : 'the lead rotates with everybody else'}
                                        </span>
                                    </div>
                                    {/* THE TRADE, IN ONE LINE, AS THE BRIEF REQUIRES. */}
                                    <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 leading-relaxed">
                                        What it costs: this task&apos;s lead stops being shared out fairly.
                                        Continuity beats FTE-weighted fairness for this one slot, so one
                                        colleague carries every occurrence and the others carry none.
                                    </p>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                        It never beats a hard limit: an incumbent who is on leave, at their
                                        daily limit or out of band loses the slot to the next person, and
                                        AURA counts every change of lead and names it in the warnings — so
                                        you find out when continuity broke, and why.
                                    </p>
                                </>
                            )}
                        </DrawerGroup>
                    </div>

                    {/* --- 5. HOW MANY EACH PERSON TAKES ---------------------------
                        The lab's "everyone works at least two Saturdays a month". The
                        floor/ceiling asymmetry is the engine's and it is stated here
                        rather than discovered from a warning. */}
                    <div className={DRAWER_DIVIDER}>
                        <DrawerGroup label="How many of these one person takes">
                            <div className="flex flex-col items-stretch sm:flex-row sm:flex-wrap sm:items-end gap-2">
                                <div>
                                    <label
                                        className="text-[9px] font-bold text-slate-400 uppercase block"
                                        htmlFor={`task-quota-per-${row.id}`}
                                    >
                                        Counted
                                    </label>
                                    <select
                                        id={`task-quota-per-${row.id}`}
                                        aria-label={label('per-person limit period')}
                                        value={row.quotaPer}
                                        onChange={(e) => onChange(row.id, { quotaPer: e.target.value })}
                                        className={`${CELL_INPUT} sm:w-40`}
                                    >
                                        <option value="">No limit</option>
                                        {QUOTA_PERIOD_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label
                                        className="text-[9px] font-bold text-slate-400 uppercase block"
                                        htmlFor={`task-quota-min-${row.id}`}
                                    >
                                        At least
                                    </label>
                                    <input
                                        id={`task-quota-min-${row.id}`}
                                        type="text"
                                        inputMode="numeric"
                                        aria-label={label('per-person minimum')}
                                        value={row.quotaMin}
                                        // "none" rather than a number: there IS no default
                                        // floor, and a placeholder showing `1` would read
                                        // as one already being in force.
                                        placeholder="none"
                                        onChange={(e) => onChange(row.id, { quotaMin: e.target.value })}
                                        className={NUMBER_FIELD}
                                    />
                                </div>
                                <div>
                                    <label
                                        className="text-[9px] font-bold text-slate-400 uppercase block"
                                        htmlFor={`task-quota-max-${row.id}`}
                                    >
                                        At most
                                    </label>
                                    <input
                                        id={`task-quota-max-${row.id}`}
                                        type="text"
                                        inputMode="numeric"
                                        aria-label={label('per-person maximum')}
                                        value={row.quotaMax}
                                        placeholder="none"
                                        onChange={(e) => onChange(row.id, { quotaMax: e.target.value })}
                                        className={NUMBER_FIELD}
                                    />
                                </div>
                            </div>
                            {/* THE ASYMMETRY. Both halves are true and they are not the
                                same promise, which is the whole reason this paragraph
                                exists on the configure screen instead of only in a
                                warning after the fact. */}
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                <span className="font-bold">At most</span> is hard: a duty that would take
                                somebody past it is reported as not staffed, with the count named.{' '}
                                <span className="font-bold">At least</span> is a{' '}
                                <span className="font-bold">preference, not a guarantee</span> — a floor
                                cannot be met by inventing capacity, so AURA prefers whoever is behind for
                                every occurrence it can and then names anybody still short in the
                                warnings. Leave both blank for no limit at all.
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                Counted in <span className="font-bold">duties</span>, not hours, and only
                                over WHOLE periods inside the run — a month the run only half covers is
                                reported as a partial period rather than judged. A floor nobody could
                                possibly meet is refused before generating, with the arithmetic shown.
                            </p>
                        </DrawerGroup>
                    </div>

                    {/* --- 6. category --------------------------------------------- */}
                    <div className={DRAWER_DIVIDER}>
                        <DrawerGroup label="Category">
                            <div className="flex flex-wrap items-start gap-3">
                                <input
                                    id={`task-category-${row.id}`}
                                    type="text"
                                    aria-label={label('category')}
                                    value={row.category}
                                    // The engine's own default, shown rather than
                                    // written: a stated category changes how the shift is
                                    // drawn in the calendar, so stating one nobody typed
                                    // would change the roster's appearance unasked.
                                    placeholder={ROSTER_V2_DEFAULTS.category}
                                    onChange={(e) => onChange(row.id, { category: e.target.value })}
                                    className={`${CELL_INPUT} sm:w-40`}
                                />
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed max-w-md">
                                    What kind of work this is — <span className="font-bold">Clinical</span>,{' '}
                                    <span className="font-bold">Rehab</span>,{' '}
                                    <span className="font-bold">On Call</span>. It travels onto every shift
                                    and the calendar colours it. Blank means{' '}
                                    <span className="font-bold">{ROSTER_V2_DEFAULTS.category}</span>.
                                </p>
                            </div>
                        </DrawerGroup>
                    </div>

                    {/* NO ERROR LINE HERE, deliberately. `RowErrors` renders every
                        per-cell problem on one full-width line under this row —
                        including all of these — and that is the one place this wizard
                        puts them. A second copy inside the drawer would be the same
                        sentence twice in one visual block, and two renderers for one
                        message is how the two start disagreeing. What makes the
                        single copy safe is the forced-open rule in `TaskTable`: a row
                        with an hours, slots, monthly-pattern or quota error cannot be
                        collapsed. */}
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
 * WHICH ROWS ARE EXPANDED IS LOCAL STATE, and it is deliberate — the same exception
 * `StaffTable`'s disclosure and the ruler's `draggingRef` are, for the same reason:
 * it is not an answer to "what will be generated", so it cannot diverge from one.
 * Collapsing a row changes nothing about the roster: everything typed inside stays
 * in the row and stays in the config.
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

            {/* See the staff table: no horizontal scroller below `sm:`, because below
                `sm:` there is nothing to scroll — the row is a card. */}
            <div className="sm:overflow-x-auto">
                <table className={RESPONSIVE_TABLE}>
                    <thead className={RESPONSIVE_HEAD}>
                        <tr>
                            <th className={TH}>{TASK_HEADINGS.name}</th>
                            <th className={TH}>{TASK_HEADINGS.bands}</th>
                            <th className={TH}>{TASK_HEADINGS.days}</th>
                            <th className={TH}>{TASK_HEADINGS.coLead}</th>
                            {/* The disclosure's own column, headed rather than blank:
                                a nameless chevron is not discoverable. */}
                            <th className={TH}>{TASK_HEADINGS.more}</th>
                            <th className="w-8" />
                        </tr>
                    </thead>
                    <tbody className={RESPONSIVE_BODY}>
                        {rows.map((row, index) => {
                            const range = describeBandRange(row.leadBands, bands);
                            const rowErrors = errors[row.id];
                            // A row whose HIDDEN cells are wrong opens itself. Without
                            // this, a per-cell error could point at a control the
                            // visitor cannot see — the wizard would be refusing to
                            // generate and showing the reason for a box that is not on
                            // screen. The disclosure is a convenience; a refusal the
                            // user cannot act on is not.
                            const forcedOpen = Boolean(
                                rowErrors?.hours || rowErrors?.slots || rowErrors?.recurrence || rowErrors?.quota,
                            );
                            const open = expandedRows.has(row.id) || forcedOpen;
                            const hoursSet = typeof row.hours === 'string' && row.hours.trim() !== '';
                            const monthly = row.calendarMode === TASK_CALENDAR_MONTHLY;
                            const pattern = describeTaskRecurrence(row);
                            const categorySet = typeof row.category === 'string' && row.category.trim() !== '';
                            // The quota's SUMMARY, in the words the drawer uses. Read off
                            // the raw cells rather than the parsed quota so that a
                            // half-filled one still says something is set — the row is
                            // forced open in that case anyway, and a summary that went
                            // silent while a cell was mid-edit would read as the value
                            // having been dropped.
                            const quotaParts = [
                                typeof row.quotaMin === 'string' && row.quotaMin.trim() !== '' ? `at least ${row.quotaMin.trim()}` : null,
                                typeof row.quotaMax === 'string' && row.quotaMax.trim() !== '' ? `at most ${row.quotaMax.trim()}` : null,
                            ].filter(Boolean);
                            const quotaPeriod = QUOTA_PERIOD_OPTIONS.find(
                                (option) => option.value === row.quotaPer,
                            );

                            return (
                                <React.Fragment key={row.id}>
                                    <tr className={RESPONSIVE_ROW}>
                                        <Cell label={TASK_HEADINGS.name} className="py-1 pr-2 align-top sm:min-w-[8rem]">
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
                                                be the only record that this task is monthly,
                                                takes 8 hours, needs three people, is kept by
                                                one clinician or carries a floor. Same
                                                renderer as the staff table's, so the two
                                                cannot drift apart. */}
                                            <HiddenSummary parts={[
                                                monthly ? (pattern === '' ? 'monthly — pattern incomplete' : pattern) : null,
                                                hoursSet ? `${row.hours.trim()}h per session` : null,
                                                row.slotMode ? `team of ${row.slots.length}` : null,
                                                row.continuity === true ? 'same lead every time' : null,
                                                quotaParts.length > 0
                                                    ? `${quotaParts.join(', ')}${quotaPeriod === undefined ? '' : ` ${quotaPeriod.label}`}`
                                                    : null,
                                                categorySet ? row.category.trim() : null,
                                            ]} />
                                        </Cell>
                                        <Cell label={TASK_HEADINGS.bands} className="py-1 pr-2 align-top">
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
                                        </Cell>
                                        <Cell label={TASK_HEADINGS.days} className="py-1 pr-2 align-top">
                                            {/* In monthly mode these chips would be dropped
                                                by the mapper (the engine refuses `days`
                                                beside `recurrence`), so the cell says what
                                                the task actually runs on instead of showing
                                                a strip with no effect — exactly what the
                                                band chips do in slot mode. The ticked days
                                                are KEPT on the row, so switching back
                                                restores them. */}
                                            {monthly ? (
                                                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-relaxed">
                                                    {pattern === ''
                                                        ? 'monthly — choose the pattern below'
                                                        : pattern}
                                                </p>
                                            ) : (
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
                                            )}
                                        </Cell>
                                        <Cell label={TASK_HEADINGS.coLead} className="py-1 pr-2 align-top">
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
                                        </Cell>
                                        <Cell label={TASK_HEADINGS.more} className="py-1 pr-2 align-top">
                                            {/* THE ARIA LABEL IS UNCHANGED ("hours and
                                                staffing") even though the drawer now holds
                                                six groups: it is the handle four sandbox
                                                tests reach this control by, and renaming it
                                                would be a churned assertion rather than a
                                                measured change. The visible column heading
                                                and the tooltip carry the wider meaning. */}
                                            <DisclosureButton
                                                open={open}
                                                forcedOpen={forcedOpen}
                                                onToggle={() => toggleExpanded(row.id)}
                                                ariaLabel={`Task row ${index + 1}: hours and staffing`}
                                                title="How often it repeats, how long a session is, how it is staffed, continuity, per-person limits and its category"
                                                forcedTitle="Something behind this drawer needs fixing before it can be folded away"
                                            />
                                        </Cell>
                                        <Cell className="py-1 align-top">
                                            <button
                                                type="button"
                                                aria-label={`Remove task row ${index + 1}`}
                                                title="Remove this task"
                                                onClick={() => onRemove(row.id)}
                                                disabled={rows.length <= 1}
                                                className={`${ICON_BUTTON} disabled:opacity-30 disabled:cursor-not-allowed`}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </Cell>
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
                <span className="font-bold">More…</span> opens the rest of a task: whether it repeats
                weekly or on the 3rd Wednesday of the month, how long one session takes, whether it needs
                a whole team on the shift at once ({SLOTS_MIN}–{SLOTS_MAX} people, each with their own
                band and skill) instead of a lead and a co-lead, whether the same person should keep it,
                how many of it any one person may take, and what to call it.
            </p>
        </div>
    );
};

/**
 * The five controls in their decided order: departmental policy first (bands, hours,
 * limits), then staff, then tasks — because everything in a row below is judged
 * against something in a panel above it.
 *
 * TWO FACTS ARE DERIVED HERE RATHER THAN PASSED IN, both for the same reason: they are
 * facts about rows that are already in scope, and computing them where both tables can
 * be seen keeps ONE definition of each for the whole wizard.
 *
 *   workingDays          the department's week, from the task rows — read by the FTE
 *                        gloss in the staff table above them.
 *   staffNames           who is in this department, from the staff rows — read by the
 *                        pair picker in the limits panel above them.
 *
 * `departmentMaxPerDay` is the third and it is a PARSE rather than a count: the staff
 * drawer's placeholder has to be the figure the engine will actually apply, which is
 * the department box when it holds a readable number and the engine's own default when
 * it does not. `parseConcurrentPerDayCell` is the same function the mapper judges that
 * box with, so the placeholder and the run cannot disagree.
 */
const RosterDemoWizardTables = ({
    bandInputs,
    bandsReason,
    bands,
    onBandChange,
    hoursInputs,
    hoursErrors,
    onHoursChange,
    rulesInputs,
    rulesErrors,
    onRulesChange,
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
        <DepartmentLimitsEditor
            inputs={rulesInputs}
            onChange={onRulesChange}
            errors={rulesErrors}
            // Trimmed, non-blank and de-duplicated, in table order. A half-typed name
            // is not a colleague anybody can be paired with, and a duplicate would
            // give the select two identical options for one person.
            staffNames={[...new Set(
                (Array.isArray(staffRows) ? staffRows : [])
                    .map((row) => (typeof row?.name === 'string' ? row.name.trim() : ''))
                    .filter((name) => name !== ''),
            )]}
        />
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
            //
            // MONTHLY ROWS ARE EXCLUDED, and that is a correction rather than a
            // refinement. A monthly row KEEPS its ticked weekdays (switch back and they
            // are still there) but the mapper does not emit them, so counting them here
            // would tell a 0.6-FTE colleague they "work 3 days a week" out of a
            // five-day week that no task actually runs on. `RosterView` measures the
            // same figure off the GENERATED config after a run, where a monthly task
            // carries no `days` at all — so without this filter the caption above the
            // Generate button and the caption under the load table would disagree about
            // the same department.
            workingDays={countWorkingDays(
                (Array.isArray(taskRows) ? taskRows : [])
                    .filter((row) => row?.calendarMode !== TASK_CALENDAR_MONTHLY),
            )}
            departmentMaxPerDay={
                parseConcurrentPerDayCell(rulesInputs?.maxConcurrentPerDay).value
                ?? ROSTER_V2_DEFAULTS.maxConcurrentPerDay
            }
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
