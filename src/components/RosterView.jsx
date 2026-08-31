import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
// 🛡️ Overlays render through a portal because this component's root carries
// `relative z-10`, which caps EVERYTHING inside it — a child's z-[100] cannot
// out-stack the app header's sibling z-50 context. The header visibly sliced
// through the v1.8.0 wizard (user screenshot, 2026-08-08); portaling to
// document.body is the fix, not bigger z-index numbers.
import { createPortal } from 'react-dom';
import { db } from '../firebase';
// 🛡️ NEW: Imported collection, addDoc, and serverTimestamp for the Swap Engine
// 🤝 ONE-TAP COVER: `query`/`where` subscribe to the coverage requests aimed at
// the signed-in user, and `getDoc`/`updateDoc` perform the SAME verified mutation
// sequence the chat panel used to perform (read → plan → write → READ BACK →
// approve). Nothing about that sequence is reimplemented here; see
// `respondToCoverageRequest`.
import { doc, onSnapshot, setDoc, collection, addDoc, serverTimestamp, query, where, getDoc, updateDoc } from 'firebase/firestore';
import { Calendar, Download, Settings, ChevronLeft, ChevronRight, Play, FileSpreadsheet, ShieldAlert, ArrowRightLeft, X, Users, FlaskConical, CheckCircle2, Info, LayoutGrid, User, CalendarCheck, UserCheck } from 'lucide-react';
import {
    downloadICS,
    downloadCSV,
    shiftStaffDisplay,
    displayNameFor,
    // 🛡️ P1 SAFETY GUARDS — pure, unit-tested in auraEngine.guards.test.js
    restoreLiveRosterConfig,
    validateRosterConfig,
    describeGenerationRange,
    formatRosterDateKey,
    prepareRosterWrite,
    MAX_ROSTER_WEEKS,
    // 🛡️ P6 SHIFT SHAPE — pure, unit-tested in auraEngine.swap.test.js
    filterSwapCandidates,
    describeShiftRole,
    resolveSwapSubject,
    // 🛡️ v1.6.1's VERIFIED MUTATION, imported READ-ONLY and unchanged. These two
    // are the whole judgment of an accepted swap: `planSwapApplication` decides
    // what the roster becomes (mechanical substitution, both shift shapes,
    // refusal rather than a guess) and `findAppliedSwapShift` is the evidence the
    // success message is built from, read back out of the database.
    planSwapApplication,
    findAppliedSwapShift,
} from '../utils/auraEngine';
// 🤝 COVERAGE REQUESTS — pure, unit-tested in rosterCoverage.test.js. Reads the
// `shift_swaps` snapshot into plain objects and writes the wording; it holds no
// mutation logic of its own.
import {
    readCoverageRequests,
    pendingCoverageRequests,
    coverageRequestsForShift,
    canAnswerCoverageRequest,
    describeCoverageRequest,
    describeCoverageArranger,
} from '../utils/rosterCoverage';

// --- TEAM SCOPE ---
// Every Firestore path below is composed from `teamId`, and NOTHING here builds one
// by hand. `system_data/roster_2026` — a single document shared by the whole
// installation — is what these replace.
import { useTeam } from '../context/TeamContext';
import { rosterPath, swapsPath, swapPath, rosterSettingsPath } from '../utils/teamPaths';
import { toStoredSettings, fromStoredSettings, settingsChanged } from '../utils/rosterSettings';
import { useTeamGrades } from '../hooks/useTeamGrades';

/**
 * The roster year. Was baked into a document NAME — `system_data/roster_2026` — so
 * 2027 would have meant a new hardcoded string in three call sites. It is now the
 * document ID under `teams/{id}/rosters/`, which is what makes next year a value
 * rather than an edit.
 *
 * ⚠️ STILL A CONSTANT, and that is a known limitation rather than a design: the
 *    view has no year picker in live mode, so a team cannot yet roster 2027 while
 *    2026 is still running. `rosterPath` already takes the year, so closing this is
 *    a control, not a schema change.
 */
const ROSTER_YEAR = '2026';

// --- SANDBOX IMPORTS ---
import { useNexus } from '../context/NexusContext';
// 🧪 THE PICKER IS A PROFESSION AND A SHAPE, and the two lists have different jobs.
//
// `DEMO_SHAPES` is FIVE STRUCTURES plus two openly fictional demos. It was twelve
// arrangements, one per department, and seven of those twelve were invented services
// offered under a real profession's name. A shape says "this is how the physiotherapists
// do it — adapt it", which is true; a per-department fixture said "this is how art
// therapists do it", which was not. `mockData.js` owns the list and its order; this file
// does not sort, filter or re-order it, and nothing here may assume a position in it.
//
// `MOH_PROFESSION_OPTIONS` is MOH's own list of 28 professions (37 selectable leaves,
// two of them nesting), sorted in `mockData.js` and rendered here with `<optgroup>`
// wherever MOH nests. It is VOCABULARY: choosing a profession picks the LABEL on the
// configuration and nothing else — no duties, no grades, no rules. That is what lets an
// art therapist ride the physiotherapy shape and see their own designation on the
// result.
//
// `suggestedShapeFor` is the roster owner's own non-binding pairing of profession to
// likely starting point. It is rendered as a SUGGESTION and is never applied
// automatically: a suggestion that loads itself is a claim about that profession's
// service.
//
// `provenance` is deliberately NOT imported here. The attribution panel keys off
// `attribution` and `sourceProfession` being present, which is ONE source for "what does
// this say about where it came from"; reading `provenance` here as well would be two,
// and the two would eventually disagree in front of a roster master. That they agree is
// pinned in `RosterView.demo.test.jsx` instead, where a mismatch is a failing test
// rather than a wrong caption.
import { DEMO_SHAPES, MOH_PROFESSION_OPTIONS, suggestedShapeFor } from '../data/mockData';
// The taxonomy itself, for ONE read: turning the chosen profession's id back into the
// leaf whose `name`/`qualifiedName` labels the configuration. Read-only; this file never
// edits the published list.
import { professionById } from '../data/mohAlliedHealth';
// 🧪 SANDBOX ENGINE — the constraint-aware engine, used ONLY on the demo path.
// Live generation still goes through prepareRosterWrite → generateRoster, which
// has characterization tests pinning its byte-exact output and a live document
// reading it. Nothing below migrates live mode.
import {
    generateRosterV2,
    parseLocalDateKey,
    validateRosterV2Config,
    bandOfGrade,
    measureRosterLoad,
    DEFAULT_GRADE_BANDS,
} from '../utils/rosterEngineV2';
// 🧪 SANDBOX WIZARD — the structured tables that replaced the two textareas in
// demo mode, and the ONE pure function that turns them into an engine config.
import RosterDemoWizardTables from './RosterDemoWizardTables';
import WizardStep from './WizardStep';
import {
    buildDemoRosterV2ConfigFromTables,
    createEmptyStaffRows,
    createEmptyTaskRows,
    createStaffRow,
    createTaskRow,
    bandsToInputs,
    bandLabel,
    countWorkingDays,
    describeFteAsDays,
    EMPTY_HOURS_INPUTS,
    EMPTY_RULES_INPUTS,
    partitionDemoWarnings,
    summariseUnfilledCauses,
    wizardStepNumber,
    wizardStepLabel,
    staffRowsFromMembers,
} from '../utils/rosterWizard';
// One definition of the trimming and the eight-character cap, shared with the member
// editor that writes the field — two normalizers would drift the moment one changed.
import { normalizeShortName } from '../utils/memberProfile';
import { categoryChipClass } from '../utils/rosterCategories';
// 👤 ONE PERSON'S DUTIES — pure, unit-tested in rosterPersonView.test.js, and used
// by BOTH universes: "my week" is a re-reading of the roster already on screen, so
// it needs no engine call, no extra read and no write. Live mode's data path is
// untouched by it.
import {
    personDutiesInMonth,
    taskHoursFromConfig,
} from '../utils/rosterPersonView';

// 🌟 IMPORT THE CUSTOM MODAL
import ConfirmationModal from './ConfirmationModal';

/** How many unfilled slots the sandbox panel lists before it summarises. */
const DEMO_UNFILLED_PREVIEW = 20;

/**
 * 📱 THE TWO PICKER DROPDOWNS' CLASSES, in ONE place because there are now two of them.
 *
 * `min-h-11` is a deliberate ~44px touch target — the size both Apple's and Google's
 * guidance put as the floor, and the reason this is not the 32px the desktop rows use.
 * `text-base` stops iOS Safari zooming the whole page on focus, which it does to any
 * input under 16px and which strands the visitor at 1.4× with the modal off-screen;
 * `sm:text-sm` gives the density back where there is a mouse. Shared rather than typed
 * twice, so the profession select and the shape select cannot drift into two different
 * touch targets.
 */
const DEMO_PICKER_SELECT_CLASS = 'mt-2 w-full min-h-11 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 px-3 py-2 text-base sm:text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none';

/** Both picker labels, so the two controls cannot drift apart typographically either. */
const DEMO_PICKER_LABEL_CLASS = 'text-[10px] font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-widest';

/**
 * 🛡️ M12 — the identity of a swap request, as a comparable value.
 *
 * Two requests are "the same request" when they hand the same duty on the same
 * date to the same colleague. That is exactly the triple `planSwapApplication`
 * matches on, so two documents sharing a signature are two documents that would
 * both be accepted against the same shift — the M12 failure.
 *
 * `swapRole` is deliberately NOT part of the signature: the audit's finding is
 * about re-pressing Submit on one shift, and a shift's duty is already pinned by
 * (date, task) plus who is being swapped out. Including it would let a
 * double-click that lands on a different role slip through as "not a duplicate".
 *
 * Pure, and exported so the guard can be reasoned about without a DOM.
 */
export const buildSwapRequestSignature = ({ originalShiftDate, originalTask, targetStaff } = {}) =>
    JSON.stringify(
        [originalShiftDate, originalTask, targetStaff].map((part) =>
            typeof part === 'string' ? part.trim() : (part == null ? '' : String(part)),
        ),
    );

/** How long a success banner stays up before it clears itself. */
const STATUS_AUTO_DISMISS_MS = 6000;

/**
 * 📱 THE RESPONSIVE FLOOR, in three shared strings.
 *
 * `TOUCH` is 44px, the minimum target size both Apple's HIG and Material put a
 * finger at, relaxed from `sm:` up where a mouse is doing the pointing and density
 * is worth having. `FIELD_TEXT_*` is 16px on a phone for one specific reason: iOS
 * Safari zooms the entire page when a focused `<input>`, `<select>` or `<textarea>`
 * renders text under 16px, and it does not zoom back out — the visitor is stranded
 * at 1.4× with the modal they were filling in off the side of the screen. Labels and
 * captions are exempt because they cannot be focused.
 */
const TOUCH = 'min-h-11 sm:min-h-0';
const FIELD_TEXT_SM = 'text-base sm:text-sm';

/**
 * The weekday column headings, and the weekday each day of a month falls on.
 *
 * ONE definition, because below `sm:` the seven-column grid becomes a one-column
 * LIST and the column headings stop being on screen — so each row has to name its own
 * weekday or the information the header row was carrying is simply lost. Two arrays
 * would be two answers to "is index 0 Sunday".
 */
const WEEKDAY_HEADINGS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

/**
 * 📱 THE LOAD TABLE'S COLUMN HEADINGS, in one object.
 *
 * Ten columns of numbers do not fit a phone, so below `sm:` each person's row becomes
 * a card and every figure is printed under the name of its column. Those names are
 * read from here by BOTH the `<th>` row and the in-card labels, so there is one
 * spelling of "Busiest week" in the file — `RosterView.demo.test.jsx` reads the
 * headings off `<th>` to check the hours columns appear and disappear with the hours
 * model, and a second hard-coded copy in the cells is how that check would start
 * passing while the cards said something else.
 */
const LOAD_HEADINGS = Object.freeze({
    name: 'Name',
    grade: 'Grade',
    band: 'Band',
    fte: 'FTE',
    duties: 'Duties',
    hours: 'Hours',
    peak: 'Busiest week',
    cap: 'Weekly cap',
    perFte: 'Per FTE',
    share: 'Share',
});

/**
 * One cell of the load table: a labelled line in a card on a phone, a plain table
 * cell from `sm:` up. Same construction as the wizard tables' `Cell`, and for the
 * same reason — one markup tree, two layouts, no second renderer to drift.
 */
const LoadCell = ({ label, className = '', title, children }) => (
    <td className={`flex justify-between gap-3 sm:table-cell ${className}`} title={title}>
        <span
            aria-hidden="true"
            className="text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:hidden"
        >
            {label}
        </span>
        <span className="text-right sm:text-left">{children}</span>
    </td>
);

/**
 * 🧪 SANDBOX: what an `unfilled` entry's `role` should be CALLED on screen.
 *
 * `describeShiftRole` knows two roles, `'lead'` and `'coLead'`, and answers
 * "unknown duty" for anything else. A MULTI-SLOT task's unfilled entry carries the
 * slot's own label instead — `'principal slot'`, `'senior slot 2'` — measured from
 * the engine, which is a name a roster master can act on and precisely the thing
 * "unknown duty" would have thrown away. So the two known roles keep their existing
 * wording and everything else is shown verbatim as the engine wrote it.
 *
 * Pure, and here rather than in `rosterWizard` because it describes an engine
 * OUTPUT for this panel, not a wizard input, and `describeShiftRole` is already
 * imported in this file.
 */
const describeUnfilledRole = (role) =>
    (role === 'lead' || role === 'coLead' ? describeShiftRole(role) : role);

/**
 * Does this run's `load` carry hours? The engine adds `hours`, `hoursPerWeek` and
 * `weeklyCap` to every entry only when the configuration asked for the hours model,
 * so this is read off the RESULT rather than off the wizard's boxes — a report about
 * the run that is on screen, not about what is currently typed above it.
 */
const loadHasHours = (load) =>
    Object.values(load || {}).some((entry) => typeof entry?.hours === 'number');

/** The busiest single week of a run, which is the figure a weekly cap binds. */
const peakWeekHours = (entry) =>
    (Array.isArray(entry?.hoursPerWeek) && entry.hoursPerWeek.length > 0
        ? Math.max(...entry.hoursPerWeek)
        : 0);

/**
 * 🌟 P8.3 — the one place this view says anything to the user.
 *
 * Replaces eight native `alert` calls. Same Tailwind idiom as the M8 banner and
 * the sandbox panel below the calendar (rounded-xl, tinted background, tinted
 * border, icon + bold small text), plus a dismiss control, because unlike those
 * two this banner reports a finished ACTION rather than the state of the data.
 */
const STATUS_TONES = {
    success: {
        icon: CheckCircle2,
        box: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
        icon_: 'text-emerald-600 dark:text-emerald-400',
        text: 'text-emerald-800 dark:text-emerald-300',
        hover: 'hover:bg-emerald-100 dark:hover:bg-emerald-800/40',
    },
    error: {
        icon: ShieldAlert,
        box: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
        icon_: 'text-red-600 dark:text-red-400',
        text: 'text-red-700 dark:text-red-300',
        hover: 'hover:bg-red-100 dark:hover:bg-red-800/40',
    },
    info: {
        icon: Info,
        box: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800',
        icon_: 'text-indigo-600 dark:text-indigo-400',
        text: 'text-indigo-800 dark:text-indigo-300',
        hover: 'hover:bg-indigo-100 dark:hover:bg-indigo-800/40',
    },
};

const StatusBanner = ({ status, onDismiss }) => {
    if (!status) return null;
    const tone = STATUS_TONES[status.tone] || STATUS_TONES.info;
    const ToneIcon = tone.icon;

    return (
        <div
            role="status"
            aria-live="polite"
            className={`mb-4 flex items-start gap-2 p-3 rounded-xl border ${tone.box}`}
        >
            <ToneIcon size={16} className={`${tone.icon_} shrink-0 mt-0.5`} />
            <p className={`flex-1 text-xs font-bold leading-relaxed ${tone.text}`}>{status.text}</p>
            <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss message"
                className={`shrink-0 p-0.5 rounded transition-colors ${tone.icon_} ${tone.hover}`}
            >
                <X size={14} />
            </button>
        </div>
    );
};

/**
 * 👤 ONE PERSON'S DUTIES — "my week".
 *
 * A department grid answers "who is on today?". Nobody's mental model of their own
 * job is a 31-square matrix of everybody else's duties, so this is the same data,
 * one person at a time, large enough to read at arm's length: the date in words,
 * the duty, what they hold it as, how long it takes if the department said, and who
 * is on it with them.
 *
 * PURE RENDERING. Every figure here comes from `personDutiesInMonth` reading the
 * SAME `rosterData` object the grid renders. No engine call, no Firestore, nothing
 * written, and no arithmetic of its own — so this view cannot disagree with the
 * grid beside it, and it works identically over a live document and a sandbox run.
 *
 * WHAT IT WILL NOT CLAIM:
 *   • a monthly hours total, unless EVERY duty listed has a length set. A total
 *     over the subset that happens to carry hours reads as the month and is short
 *     by the rest — wrong in the direction that makes a heavy month look light.
 *   • which SLOT of a team shift somebody filled. The engine records who was on the
 *     shift, ordered by grade, not which listed slot each person satisfied. So a
 *     third assignee is shown by position and the footnote says why.
 */
const PersonRosterPanel = ({
    person,
    people,
    onPersonChange,
    monthLabel,
    duties,
    totalHours,
    hasRoster,
}) => {
    const someHours = duties.some((duty) => duty.hours !== null);
    const anyTeamDuty = duties.some((duty) => duty.role === 'assignee');

    return (
        <div
            data-roster-view="person"
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
        >
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <User size={13} /> One person&apos;s duties
            </p>

            <div className="mt-1 flex flex-col md:flex-row md:items-end md:justify-between gap-2">
                <div>
                    <h3 className="text-xl font-black text-slate-800 dark:text-white">
                        {person === '' ? 'No one chosen yet' : person}
                    </h3>
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                        {monthLabel} — use the arrows beside the month to look at another one.
                    </p>
                </div>

                {/* SANDBOX ONLY. In live mode the person is the signed-in user, so
                    there is nothing to pick and no `<select>` is rendered at all. */}
                {Array.isArray(people) && people.length > 0 && (
                    <div>
                        <label
                            className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block mb-1"
                            htmlFor="roster-my-week-person"
                        >
                            Show whose duties
                        </label>
                        <select
                            id="roster-my-week-person"
                            value={person}
                            onChange={(e) => onPersonChange(e.target.value)}
                            className={`w-full sm:w-auto bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 ${FIELD_TEXT_SM} ${TOUCH} font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none`}
                        >
                            {people.map((name) => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {duties.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    {person === ''
                        ? (hasRoster
                            ? 'AURA does not know which name in this roster is yours, so it cannot show your duties. The department view shows everybody.'
                            : 'There is no roster on screen yet, so there is nobody whose duties to show.')
                        : (hasRoster
                            ? `${person} holds no duties in ${monthLabel}. That is what this roster says, not a loading state — switch to the department view to see what the rest of the team is doing.`
                            : `There is no roster on screen to read ${person}'s duties from yet.`)}
                </p>
            ) : (
                <>
                    <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-700">
                        {duties.map((duty) => (
                            <li key={duty.key} className="py-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                <span className="text-sm font-black text-slate-500 dark:text-slate-400 tabular-nums min-w-[9rem]">
                                    {formatRosterDateKey(duty.date)}
                                </span>
                                <span className="text-base font-black text-slate-800 dark:text-white">
                                    {duty.task}
                                </span>
                                <span className="text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                                    {duty.roleLabel}
                                </span>
                                {duty.hours !== null && (
                                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                                        {`${duty.hours}h`}
                                    </span>
                                )}
                                {duty.alongside.length > 0 && (
                                    <span className="text-xs text-slate-500 dark:text-slate-400">
                                        {`with ${duty.alongside.join(', ')}`}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>

                    <p className="mt-3 text-xs font-bold text-slate-600 dark:text-slate-300">
                        {`${duties.length} ${duties.length === 1 ? 'duty' : 'duties'} in ${monthLabel}`}
                        {totalHours !== null ? `, ${totalHours}h in total` : ''}
                    </p>

                    {/* Said only when it applies, and only because it is TRUE: a
                        total over the duties that happen to carry hours would be
                        short by the others. */}
                    {totalHours === null && someHours && (
                        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                            No total is shown: at least one of these duties has no length set, so any
                            sum would be less than the month really holds.
                        </p>
                    )}

                    {anyTeamDuty && (
                        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                            On a shift staffed as a team, AURA records who was on it — highest grade
                            first — not which of the listed slots each person filled. So a place on the
                            team is shown by position rather than by slot name.
                        </p>
                    )}
                </>
            )}
        </div>
    );
};

/**
 * 🤝 COVERAGE ASKED OF YOU — the inline card that replaced the chat alert.
 *
 * WHY IT IS HERE AND NOT IN THE AI PANEL. A colleague asking you to cover a
 * clinical shift used to arrive as a `ROSTER_ALERT` chat bubble: the wellbeing
 * assistant force-opened itself, and the Accept button lived inside a
 * conversation. Two consequences the audit recorded (M5) and one a product review
 * recorded: the message could be destroyed by picking a persona, it was invisible
 * on the persona grid, and answering a roster question meant leaving the roster.
 * The request now renders where the shift is, and one tap answers it.
 *
 * WHAT EACH BUTTON DOES, STATED ON SCREEN. "Cover this shift" runs the verified
 * sequence in `respondToCoverageRequest` — write the roster, read the document
 * back, FIND the substitution in it, and only then mark the request approved. The
 * card says so, because a person is being asked to take on clinical work and
 * "what happens when I press this" is not a detail.
 *
 * PURE RENDERING. Every sentence comes from `rosterCoverage`; every outcome
 * message comes from the observed read-back or from the engine's refusal reason.
 * This component decides nothing and asserts nothing.
 */
const CoverageRequestsPanel = ({
    requests,
    onRespond,
    respondingId,
    failures,
    listenerError,
}) => {
    if (requests.length === 0 && !listenerError) return null;

    return (
        <div
            data-roster-view="coverage-requests"
            role="region"
            aria-label="Cover asked of you"
            // A request that ARRIVES while the roster is on screen is announced
            // rather than appearing silently — the closest honest replacement for
            // the chat panel's force-open, and unlike that one it does not take the
            // screen away from what the person was doing. Initial content is not
            // announced, which is correct: it is already there to be read.
            aria-live="polite"
            className="mb-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4"
        >
            <p className="text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                <UserCheck size={13} />
                {`Cover asked of you (${requests.length})`}
            </p>

            {/* 🛡️ M8, moved with the listener: a rules denial on `shift_swaps`
                used to be invisible in the chat panel; it must not become
                invisible here either. Not dismissible, for the same reason the
                roster read failure is not: dismissing it leaves you looking at a
                card that silently shows nothing. */}
            {listenerError && (
                <p className="mt-2 flex items-start gap-2 text-xs font-bold text-red-700 dark:text-red-300 leading-relaxed">
                    <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                    <span>{listenerError}</span>
                </p>
            )}

            {requests.length > 0 && (
                <ul className="mt-3 space-y-3">
                    {requests.map((request) => {
                        const answerable = canAnswerCoverageRequest(request);
                        const arranger = describeCoverageArranger(request);
                        const failure = request.docId ? failures[request.docId] : null;
                        const busy = request.docId !== null && respondingId === request.docId;
                        // One at a time: a second request's buttons are disabled
                        // while another answer is in flight, because both paths
                        // write the same roster document.
                        const blocked = respondingId !== null && !busy;
                        const label = `${request.originalTask || 'this shift'} on ${formatRosterDateKey(request.originalShiftDate)} for ${request.requestedBy || 'a colleague'}`;

                        return (
                            <li
                                key={request.docId || `unanswerable-${request.originalShiftDate}-${request.originalTask}`}
                                data-coverage-request={request.docId || 'no-id'}
                                className="rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 p-3"
                            >
                                {/* `describeCoverageRequest` answers "why not" for a
                                    request that cannot be answered, and that
                                    sentence belongs in the amber block below
                                    rather than twice on one card. */}
                                <p className="text-sm font-bold text-slate-800 dark:text-white leading-relaxed">
                                    {answerable.ok
                                        ? describeCoverageRequest(request)
                                        : 'A coverage request is waiting here that AURA cannot answer.'}
                                </p>

                                {arranger && (
                                    <p className="mt-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                        {arranger}
                                    </p>
                                )}

                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                    {request.reason
                                        ? `Reason given: “${request.reason}”`
                                        : 'No reason was given.'}
                                </p>

                                {/* The failure of a previous attempt, kept next to
                                    the request it belongs to — because the request
                                    is still PENDING and still on screen, which is
                                    the whole point.

                                    RENDERED VERBATIM, with no prefix of this
                                    component's own: what is true after a failed
                                    attempt differs by which step failed (the roster
                                    may be unchanged, may be unknown, or may be
                                    changed and confirmed with only the ledger write
                                    outstanding), and a one-size prefix would state
                                    the wrong one. `respondToCoverageRequest` writes
                                    the whole sentence. */}
                                {failure && (
                                    <p className="mt-2 flex items-start gap-1.5 text-xs font-bold text-red-700 dark:text-red-300 leading-relaxed">
                                        <ShieldAlert size={13} className="shrink-0 mt-0.5" />
                                        <span>{failure}</span>
                                    </p>
                                )}

                                {answerable.ok ? (
                                    <>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => onRespond(request, true)}
                                                disabled={busy || blocked}
                                                aria-label={`Cover ${label}`}
                                                className={`flex items-center justify-center gap-1.5 px-4 py-2.5 ${TOUCH} rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white font-black text-[11px] uppercase tracking-wider transition-colors`}
                                            >
                                                <CalendarCheck size={14} />
                                                {busy ? 'Checking the roster…' : 'Cover this shift'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onRespond(request, false)}
                                                disabled={busy || blocked}
                                                aria-label={`Decline to cover ${label}`}
                                                className={`px-4 py-2.5 ${TOUCH} rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed font-black text-[11px] uppercase tracking-wider transition-colors`}
                                            >
                                                Decline
                                            </button>
                                        </div>

                                        <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                            Covering writes the change to the master roster, reads the document
                                            back and confirms your name is on the shift before recording the
                                            request as approved. If it cannot be confirmed, nothing is approved
                                            and this request stays here.
                                        </p>
                                    </>
                                ) : (
                                    <p className="mt-2 flex items-start gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400 leading-relaxed">
                                        <ShieldAlert size={13} className="shrink-0 mt-0.5" />
                                        <span>{answerable.reason}</span>
                                    </p>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

const RosterView = ({ user }) => {
    // --- CONTEXT ---
    const { isDemo } = useNexus();
    // WHOSE roster. Null in demo mode and on a signed-in account with no team, and
    // every live effect below is gated on it — a path composed from a null teamId
    // throws by design (`assertTeamId`), so the gate is what keeps that design from
    // becoming a crash on a legitimate screen.
    const { teamId, team, rosteredMembers, memberUidByName } = useTeam();

    // --- STATE ---
    // 🗓️ P4.3 / post-mortem B3: the calendar used to open on a hardcoded
    // `new Date(2026, 1, 1)` — February 2026, the month this view was written
    // in. Six months later every user landed on an empty grid in the past and
    // had to click forward to reach today. It now opens on the CURRENT month.
    //
    // Normalised to the 1st, and computed in a lazy initialiser so it is read
    // once per mount rather than on every render. Day-1 matters: `currentDate`
    // is only ever used for its year and month, and a day-31 value would make
    // month arithmetic overflow (31 Mar - 1 month -> "31 Feb" -> 3 Mar).
    const [currentDate, setCurrentDate] = useState(() => {
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), 1);
    });
    const [rosterData, setRosterData] = useState({});
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    // 🛡️ M8: an empty calendar caused by a rules denial was indistinguishable
    // from "no roster has been generated yet". This is the difference.
    //
    // 🌟 P8.3: deliberately NOT merged into `status` below. This one describes
    // the state of the DATA SOURCE — it is owned by the snapshot listener, which
    // sets and clears it — and it must not be dismissible: a user who dismissed
    // "you do not have permission to read the master roster" would be back to an
    // unexplained empty calendar, which is the whole of M8 undone.
    const [rosterError, setRosterError] = useState(null);

    // 🌟 P8.3 — THE REPLACEMENT FOR EIGHT NATIVE `alert` CALLS.
    // `{ tone: 'success' | 'error' | 'info', text }`, or null. Reports the result
    // of the last action the USER took, as opposed to `rosterError` above.
    const [status, setStatus] = useState(null);
    const statusTimerRef = useRef(null);

    // 👤 WHICH VIEW OF THE SAME DATA IS ON SCREEN: `'department'` (the month grid,
    // everybody) or `'person'` ("my week", one clinician).
    //
    // DEFAULTS TO THE GRID, IN BOTH UNIVERSES, DELIBERATELY. Nothing changes for
    // anybody who does not press the toggle — the roster an existing user opens is
    // the roster they opened yesterday. The toggle is pure rendering either way:
    // it reads `rosterData`, makes no engine call, no Firestore read and no write.
    const [rosterScope, setRosterScope] = useState('department');
    // 🧪 SANDBOX ONLY: whose week is being shown. In live mode the person is the
    // signed-in user and there is nothing to pick — a sandbox visitor is not in
    // their own fictional department, so they choose from the pool that was
    // actually generated. Empty until a roster exists.
    const [demoPersonChoice, setDemoPersonChoice] = useState('');

    // 🧪 SANDBOX STATE — every field below exists only in demo mode and only in
    // memory. `demoResult` is the whole `generateRosterV2` return value
    // (effectiveStart, unfilled, load, warnings, score) so the panel below the
    // calendar can report what the engine actually knew, rather than a summary.
    const [demoResult, setDemoResult] = useState(null);

    // 🧪 WHICH SHAPE WAS LOADED, or `null` for a team typed in by hand. The whole
    // descriptor rather than its id, because what this is read for is its `attribution`.
    //
    // IT EXISTS FOR ONE REASON AND IT IS AN HONESTY REASON. The picker says, beside the
    // dropdown, whose week a shape came from and that it is a starting point — but the
    // picker is inside a modal that closes the moment the roster is drafted, and what the
    // room then looks at is a finished roster with no attribution anywhere near it. A
    // structure borrowed from the physiotherapists would silently become "our roster".
    // So the attribution travels with the loaded shape and is restated beside the report.
    // `null` for a typed-in team is correct and not a gap: a team who typed their own
    // roster in borrowed nothing from anybody.
    //
    // NOT A SOURCE OF TRUTH FOR ANYTHING GENERATED. The rows are, exactly as before —
    // this is a label, and a visitor who loads a shape and then edits every row still
    // sees where the structure came from, which is the safe direction to be wrong in.
    const [demoShape, setDemoShape] = useState(null);

    // 🧪 WHOSE ROSTER THIS IS, as one of MOH's 37 profession leaves, or `null`.
    //
    // A LABEL AND NOTHING MORE, and that is the entire point of the two-control picker.
    // It reaches no engine field, no row and no rule: an art therapist who loads the
    // graded duty split gets byte-identically the roster a physiotherapist would get from
    // it, and sees "Art Therapist" on the result instead of somebody else's profession.
    // Optional on purpose — a visitor who never touches this control still gets a working
    // roster, because a tool that demands a designation before it will help is a tool that
    // has to be argued with first.
    const [demoProfession, setDemoProfession] = useState(null);

    // 🧪 THE GRADE-AWARE WIZARD'S TABLES. These replaced the two comma-separated
    // textareas in demo mode; live mode still renders the textareas, unchanged.
    //
    // The rows hold RAW STRINGS for FTE and away-dates on purpose — a half-typed
    // "0." or a cleared box must survive a keystroke rather than becoming NaN —
    // and every parse, refusal and per-row error message is decided in ONE pure
    // place, `buildDemoRosterV2ConfigFromTables`. Nothing here re-guesses it.
    const [demoStaffRows, setDemoStaffRows] = useState(() => createEmptyStaffRows());
    const [demoTaskRows, setDemoTaskRows] = useState(() => createEmptyTaskRows());
    // The three band boundaries, as the editor's six text inputs. Prefilled with
    // the engine's shipped cut (junior AH7–12, senior AH13–14, principal AH15–17)
    // because that is this department's current policy, not a law of nature.
    const [demoBandInputs, setDemoBandInputs] = useState(() => bandsToInputs(DEFAULT_GRADE_BANDS));
    // The department's working hours, as the two raw-string boxes beside the band
    // ruler. BOTH EMPTY on purpose: the engine's hours model switches on the moment
    // a configuration mentions one of these fields, so prefilling the contracted 42
    // would start judging every sandbox run against an 8.4-hour day nobody typed.
    // Blank means "count duties only", which is what the sandbox has always done.
    const [demoHoursInputs, setDemoHoursInputs] = useState(EMPTY_HOURS_INPUTS);
    // 🧪 THE THREE DEPARTMENT LIMITS, as the panel beside the hours boxes holds them:
    // `{ maxConcurrentPerDay, maxConsecutiveDays, forbidPairs }` — two raw strings and
    // a list of `[a, b]` name pairs. ALL EMPTY on purpose, for the same reason the
    // hours boxes are: `maxConcurrentPerDay: 2` is also the engine's default, and
    // STATING it is a department declaring a policy, which is a different fact from
    // never having thought about it. `forbidPairs` had NO control at all before this
    // — `grep -rn forbidPairs src/` outside the engine returned nothing.
    const [demoRulesInputs, setDemoRulesInputs] = useState(EMPTY_RULES_INPUTS);
    // Anything a fixture carries that has no control of its own. `null` for a typed-in
    // team. `rules.bands`, the two hours fields and the three limits above are all
    // STRIPPED out of this by "Load example department" and into the controls that own
    // them — two sources for one value is how a roster gets generated against a policy
    // nobody can see.
    const [demoExtraRules, setDemoExtraRules] = useState(null);

    /**
     * ==========================================================================
     * THE DEPARTMENT'S CONFIGURATION, PERSISTED — `R1`
     * ==========================================================================
     *
     * Everything above lived in React state and nowhere else, so it existed only
     * for as long as the tab did. Survivable while the wizard was sandbox-only —
     * a visitor exploring a fictional department loses nothing by closing the
     * page. Not survivable for a roster master configuring a real one, who would
     * otherwise retype their department's entire structure on every visit.
     *
     * ⚠️ THE SANDBOX NEVER READS OR WRITES IT. A demo visitor may have a team —
     *    a lead can flip the toggle — and loading their real tasks into a
     *    sandbox they are about to edit freely would be one Save away from
     *    overwriting the department's configuration with an experiment. `isDemo`
     *    gates both directions, and this is the same latch every other write in
     *    this component uses.
     */
    /**
     * ==========================================================================
     * ONE WIZARD, ONE ENGINE — `R3`/`R4`
     * ==========================================================================
     *
     * Live mode and the sandbox used to configure two DIFFERENT ENGINES, which is
     * why they had two different screens. Live called `generateRoster` — a
     * round-robin over a comma-separated list of names, no grades, no FTE, no
     * skills, no rules — and the sandbox called `generateRosterV2`. Everything the
     * sandbox demonstrated was therefore something a real department could not
     * have, and the plainer live panel was the honest UI for the plainer engine
     * behind it.
     *
     * Both now run `generateRosterV2`. The difference that remains is the one that
     * is real: in the sandbox the staff are TYPED, because there is no team; in
     * live mode they ARE the team, with their own grades, FTE and leave.
     */
    const { grades: memberGrades, denied: gradesDenied } = useTeamGrades(
        teamId,
        rosteredMembers,
        // ⚠️ NOT IN THE SANDBOX, EVER. A demo visitor may be a lead of a real team,
        //    and reading their colleagues' pay grades to populate a sandbox they are
        //    about to edit freely is both unnecessary and the wrong direction of
        //    travel for the most sensitive value in the app.
        !isDemo && !!teamId,
    );

    /**
     * The staff table, from the two sources that can supply one.
     *
     * ⚠️ LIVE ROWS ARE DERIVED, NOT EDITED, AND THAT IS DELIBERATE. Who is in the
     *    department is the member list — maintained in the TEAM tab, where adding
     *    somebody checks that their account exists and their address is on an
     *    allowlisted domain. A second, editable copy here would let a roster master
     *    type a name that belongs to nobody and roster them, which is exactly the
     *    defect the migration removed.
     *
     *    Their ATTRIBUTES are editable where they belong: grade and profession on
     *    the person's own profile, FTE and duties on the membership.
     */
    const liveStaffRows = useMemo(
        () => staffRowsFromMembers(rosteredMembers, memberGrades),
        [rosteredMembers, memberGrades],
    );

    /**
     * FULL NAME → ACRONYM, for the calendar chips and the `.ics` export.
     *
     * ⚠️ `null` WHEN NOBODY HAS ONE, AND THAT IS LOAD-BEARING RATHER THAN TIDY. Both
     *    `shiftStaffDisplay` and `buildICS` treat an absent map as "print what is
     *    stored", which is how a department that has set no acronyms keeps byte-identical
     *    exports and chips. An empty object would take the same branch, but saying
     *    `null` makes the intent checkable — and an entry equal to the full name is
     *    dropped here so it can never mean "shortened" downstream.
     *
     * ⚠️ BUILT FROM THE MEMBERSHIP, NOT FROM THE WIZARD CONFIG, so it is the same map
     *    whichever engine produced the roster: the v1 live path persists only a flat
     *    array of display names, and a roster read back from Firestore carries no
     *    acronyms at all. Keyed by `displayName` because that is what the engine puts
     *    in `shift.lead` — the `D-names` limitation, borrowed here rather than fought.
     */
    const shortNames = useMemo(() => {
        const map = {};
        const add = (rawFull, rawShort) => {
            /**
             * ⚠️ KEYED BY THE **TRIMMED** NAME. The mapper trims a row's name before it
             *    reaches the config, so that is what the engine writes into
             *    `shift.lead` — a key carrying the untrimmed spelling would simply
             *    never match and the acronym would silently not appear.
             */
            const full = typeof rawFull === 'string' ? rawFull.trim() : '';
            const short = normalizeShortName(rawShort);
            if (full !== '' && short !== '' && short !== full) map[full] = short;
        };

        /**
         * ⚠️ TWO SOURCES, BECAUSE THE SANDBOX HAS NO MEMBERSHIP TO READ. Built from
         *    `rosteredMembers` alone, the wizard's own short-name cell wrote to a row
         *    nothing ever read: the cell was editable, its help text promised the
         *    calendar and the `.ics` would use it, and neither did — a dead control,
         *    which is the precise defect this change set exists to remove. An audit
         *    caught it one commit after the drawer fix that prompted it.
         *
         *    Read from `demoStaffRows` rather than from `demoWizard.config`, which is
         *    declared further down this component: referencing it here would be a
         *    temporal dead zone, and the rows carry the same value.
         */
        if (isDemo) {
            for (const row of Array.isArray(demoStaffRows) ? demoStaffRows : []) {
                add(row?.name, row?.shortName);
            }
        } else {
            for (const person of Array.isArray(rosteredMembers) ? rosteredMembers : []) {
                add(person?.displayName, person?.shortName);
            }
        }
        return Object.keys(map).length > 0 ? map : null;
    }, [isDemo, demoStaffRows, rosteredMembers]);

    const [storedSettings, setStoredSettings] = useState(null);
    const [settingsError, setSettingsError] = useState(null);
    // Whether the wizard's rows came from a stored document. `false` means either
    // "not read yet" or "this department has never configured one", and the bridge
    // below is what makes the second case survivable.
    const [settingsSeeded, setSettingsSeeded] = useState(false);
    // Who held which grade in the run that is ON SCREEN, so the load table can
    // report it. Captured at generate time rather than read from the live rows:
    // editing a grade after generating must not silently relabel a finished
    // roster's report.
    const [demoRunGrades, setDemoRunGrades] = useState({});
    // How long each task of the run that is ON SCREEN takes, and how many days a
    // week that run's department runs. Captured at generate time for exactly the
    // reason `demoRunGrades` is: "my week" prints session lengths beside somebody's
    // duties, and the load table glosses an FTE as days a week — neither may
    // silently re-label a finished roster because a table row was edited
    // afterwards. Only tasks that STATED a length are in the map (see
    // `taskHoursFromConfig`), so nothing invents the engine's 4h default.
    const [demoRunTaskHours, setDemoRunTaskHours] = useState({});
    const [demoRunWorkingDays, setDemoRunWorkingDays] = useState(0);

    // 🌟 CUSTOM MODAL STATE
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    
    // --- SWAP MODAL STATE ---
    const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
    const [selectedShift, setSelectedShift] = useState(null);
    const [swapTargetStaff, setSwapTargetStaff] = useState('');
    const [swapReason, setSwapReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    // 🛡️ M11: which duty an ADMIN is reassigning on a shift they do not hold.
    // '' until they pick; ignored entirely when the acting user is on the shift,
    // or when the shift has only one assignable duty to begin with.
    const [swapRoleChoice, setSwapRoleChoice] = useState('');

    // 🤝 --- COVERAGE ASKED OF *YOU* (the recipient side, moved out of the chat) ---
    //
    // The requests currently PENDING against the signed-in user, straight off the
    // `shift_swaps` listener. LIVE MODE ONLY — the effect below never opens a
    // channel in demo mode, so a simulation can neither see nor answer a real
    // clinician's coverage request.
    const [coverageRequests, setCoverageRequests] = useState([]);
    // 🛡️ M8, moved with the listener: a `permission-denied` on this query used to
    // surface inside the AI panel. It surfaces on the card instead — the guarantee
    // is that it surfaces SOMEWHERE, never that the feature quietly stops working.
    const [coverageError, setCoverageError] = useState(null);
    // Which request is mid-answer (`docId`), so its buttons cannot be pressed
    // twice and no second request can start a competing roster write. The REF is
    // the actual latch — state lags a render behind, and two taps inside one React
    // batch would both pass a state check; the state exists to disable the buttons.
    const [respondingSwapId, setRespondingSwapId] = useState(null);
    const respondingRef = useRef(null);
    // Requests answered in THIS session. Firestore drops them from the PENDING
    // query on its own, but not instantly, and the gap is long enough to double-tap.
    const [answeredSwapIds, setAnsweredSwapIds] = useState(() => new Set());
    // Why a previous attempt did not apply, per request — kept beside the request,
    // which is still PENDING and still answerable. Cleared only by an answer that
    // really completed.
    const [swapFailures, setSwapFailures] = useState({});

    // 🛡️ M12: signatures of the swap requests this component has already sent.
    // NOTE: client-side and in-memory only — it does not survive a reload, a
    // second tab, or a second device. A real guard is a uniqueness constraint in
    // `firestore.rules` — which is a change nobody has written, not a change nobody
    // can deploy. (Q6 was written `D6` before 2026-08-14; `D6` now names only the
    // ESLint defect, which is a different thing entirely.)
    //
    // ⚠️ CORRECTED 2026-08-31: this said the rules file "is inert, because
    //    `firebase.json` declares only `hosting` and `functions`, so nothing deploys
    //    it". That stopped being true at v2.0.0 — Q6 is closed, the rules DO deploy,
    //    and `README.md` says so. Left standing, it hands a reviewer a false model of
    //    exactly the boundary they are checking, which is how a rules change gets
    //    waved through.  
    const [sentSwapSignatures, setSentSwapSignatures] = useState(() => new Set());

    // Default Config — the live staff pool and task list now live in
    // LIVE_ROSTER_DEFAULTS (auraEngine.js) so that leaving demo mode can restore
    // exactly these values. Same values as before, one source of truth.
    const [config, setConfig] = useState(() => restoreLiveRosterConfig());

    // 🛡️ Every write decision is made by pure functions, re-run on config change.
    const configValidation = useMemo(() => validateRosterConfig(config), [config]);
    const generationPlan = useMemo(() => describeGenerationRange(config), [config]);

    // 🧪 SANDBOX: the tables, mapped and judged in one pure call per render.
    // `demoWizard.config` is what Generate hands the engine; `staffErrors` /
    // `taskErrors` / `bandsReason` are what the tables show. There is no second
    // opinion anywhere in this component.
    const demoWizard = useMemo(
        () => buildDemoRosterV2ConfigFromTables({
            startDate: config.startDate,
            weeks: config.weeks,
            staffRows: isDemo ? demoStaffRows : liveStaffRows,
            taskRows: demoTaskRows,
            bandInputs: demoBandInputs,
            hoursInputs: demoHoursInputs,
            rulesInputs: demoRulesInputs,
            extraRules: demoExtraRules,
        }),
        [config.startDate, config.weeks, isDemo, demoStaffRows, liveStaffRows,
            demoTaskRows, demoBandInputs, demoHoursInputs, demoRulesInputs, demoExtraRules],
    );

    // …and then the engine's OWN validator on the finished config, so the
    // sandbox Generate button is disabled for exactly the reasons
    // `generateRosterV2` would refuse for — start date, weeks, duplicate names,
    // an unheld skill, a band nobody is in — with its wording, not a paraphrase.
    const demoValidation = useMemo(
        () => (demoWizard.ok
            ? validateRosterV2Config(demoWizard.config)
            : { valid: false, reason: demoWizard.reason }),
        [demoWizard],
    );

    /**
     * Which gate the Generate button obeys — now the SAME ONE in both modes.
     *
     * ⚠️ IT WAS `isDemo ? demoValidation : configValidation`, and that ternary was
     *    the visible end of the two-engine split: `configValidation` judged two
     *    textareas for the round-robin generator, `demoValidation` judged a whole
     *    configuration for the real one. A department can now be refused for the
     *    reasons that actually matter — a task requiring a skill nobody holds, a
     *    band nobody is in, boundaries that do not partition the scale — with
     *    `generateRosterV2`'s own wording rather than a paraphrase.
     *
     * ⚠️ AND A REFUSED GRADE READ IS A REFUSAL TO GENERATE. If `useTeamGrades` was
     *    denied, `memberGrades` is empty — which is indistinguishable from a
     *    department where nobody has set a grade, and would produce a plausible
     *    roster in which no one could lead anything. Better to stop and say so.
     */
    const generateGate = useMemo(() => {
        if (!isDemo && gradesDenied) {
            return {
                valid: false,
                reason: 'Your colleagues\' grades could not be read, so a roster generated now '
                    + 'would treat the whole department as ungraded. Only a team lead can '
                    + 'generate a roster.',
            };
        }
        return demoValidation;
    }, [isDemo, gradesDenied, demoValidation]);

    // --- STATUS BANNER PLUMBING ---
    // A success message is transient and clears itself; an error or an info
    // notice stays until the user dismisses it, because both of them are things
    // the user may still need to act on. Only ever ONE timer, and it is cleared
    // on unmount, so no setState can land on an unmounted component.
    const clearStatusTimer = () => {
        if (statusTimerRef.current) {
            clearTimeout(statusTimerRef.current);
            statusTimerRef.current = null;
        }
    };

    const showStatus = useCallback((tone, text) => {
        clearStatusTimer();
        setStatus({ tone, text });
        if (tone === 'success') {
            statusTimerRef.current = setTimeout(() => {
                statusTimerRef.current = null;
                setStatus(null);
            }, STATUS_AUTO_DISMISS_MS);
        }
    }, []);

    const dismissStatus = useCallback(() => {
        clearStatusTimer();
        setStatus(null);
    }, []);

    useEffect(() => clearStatusTimer, []);

    // --- EFFECT: SWITCH DATA SOURCE ---
    useEffect(() => {
        // 🌟 P8.3: a message about the OTHER universe must not survive the
        // toggle — "roster generated" from live mode reading as a sandbox result
        // is the same class of lie the alerts were. Same for M12's memory of what
        // has been sent: live and sandbox requests are not the same requests.
        setStatus(null);
        setSentSwapSignatures(new Set());
        // 👤 …and neither may a PERSON survive the toggle. A sandbox visitor picks a
        // fictional colleague; the live view is about the signed-in user. Showing
        // "Kamala Khan's week" over live data — or a real colleague's name over a
        // sandbox roster — is the M1 class of confusion in a new place, so both the
        // scope and the choice go back to the default here.
        setRosterScope('department');
        setDemoPersonChoice('');

        if (isDemo) {
            // 🧪 SANDBOX: no listener, no document, no write — demo mode never
            // opens a Firestore channel at all.
            //
            // This branch used to transform 13 hardcoded MOCK_ROSTER events onto
            // 17–18 Feb 2026 and pin the staff pool to the Marvel names. Those
            // events carried no `week` and no `coLead`, which is exactly why the
            // CSV export wrote "undefined" in those two columns, and the calendar
            // showed the same two days whatever anyone configured.
            // The calendar now starts EMPTY and is filled only by a real
            // `generateRosterV2` run (Configure → Generate).
            //
            // The pool is cleared rather than pre-filled with the live names: in
            // demo mode the box is for the visitor's own team, and showing four
            // real colleagues' names to a stranger is not a sandbox.
            setRosterData({});
            setRosterError(null);
            setDemoResult(null);
            setDemoRunGrades({});
            setDemoRunTaskHours({});
            setDemoRunWorkingDays(0);
            // The tables start blank for the same reason the textareas did: in
            // demo mode they are for the visitor's own team, and showing four
            // real colleagues' names — now with their real pay grades — to a
            // stranger would be worse than it was before grades existed.
            setDemoStaffRows(createEmptyStaffRows());
            setDemoTaskRows(createEmptyTaskRows());
            setDemoBandInputs(bandsToInputs(DEFAULT_GRADE_BANDS));
            setDemoHoursInputs(EMPTY_HOURS_INPUTS());
            // Cleared with the rows it labels. A stale "this is an inferred example"
            // notice sitting over a roster somebody typed in themselves would be a
            // false statement about their own data — the one direction this label
            // must never be wrong in.
            //
            // 🧬 MUTATION-CHECK NOTE, and an HONEST ONE: removing this line kills 0 of
            // 1522 tests (measured, mutation M18). It is UNMEASURED, not dead. The
            // universe toggle cannot be driven from `RosterView.demo.test.jsx`, whose
            // context mock returns a constant `isDemo: true`, so the only file that
            // could cover it is one with a mutable context — and adding a whole mock
            // harness for a single assertion was judged the wrong trade in this phase.
            // It is kept, and flagged for review rather than left looking tested,
            // because every other sandbox value is cleared on both paths and a reset
            // that holds on only one is a guarantee waiting to be edited away. The
            // twin below has the same status.
            setDemoShape(null);
            // 🛡️ Renamed with the profession+shape rework: this was
            // `setDemoArrangement(null)`. It survived the rename in BOTH reset
            // branches and threw `ReferenceError: setDemoArrangement is not
            // defined` on every demo render — caught by CI, not locally, because
            // it lives in an effect and the comment above explains why no test
            // drives this path. The profession clears too: a shape and the
            // profession it was labelled for are one choice, and half a choice
            // surviving a universe toggle is worse than neither.
            setDemoProfession(null);
            // 🧬 MUTATION-CHECK NOTE, so a later reader does not delete one of these as
            // dead code: this reset and its twin in the `else` branch below are
            // REDUNDANT WITH EACH OTHER for `demoRulesInputs`. Removing either alone
            // breaks nothing in the suite (measured: M26 and M27 both killed 0 of 1498
            // tests); removing BOTH breaks the "leaving and re-entering the sandbox"
            // test in `RosterView.reach.test.jsx` (M28, 1 test). Both are kept because
            // every other sandbox value is cleared in both branches and a reset that
            // holds only on one path is a guarantee waiting to be edited away.
            setDemoRulesInputs(EMPTY_RULES_INPUTS());
            setDemoExtraRules(null);
            setConfig(prev => ({ ...prev, staff: [], tasks: [] }));
            // 🛡️ A live "Generate?" confirmation must not survive into demo mode.
            // It is the ONE control whose OK button reaches setDoc, and both
            // modals are fixed overlays that can be open at the same time, so
            // switching universes underneath it is closed off here rather than
            // reasoned about.
            setIsConfirmModalOpen(false);

        } else {
            // 🧪 Leaving the sandbox: drop the generated roster and its report
            // together. Without this the fictional shifts stayed on the calendar
            // until a snapshot arrived — and if the live document does not exist,
            // no snapshot ever replaces them.
            setRosterData({});
            setDemoResult(null);
            setDemoRunGrades({});
            setDemoRunTaskHours({});
            setDemoRunWorkingDays(0);
            // The sandbox tables are dropped as well, so a fictional department
            // (and its grades) cannot be sitting in the wizard the next time
            // somebody opens it in LIVE mode. The wizard renders the textareas
            // there, but the rows would still be the source Generate reads if the
            // universe were toggled back.
            setDemoStaffRows(createEmptyStaffRows());
            setDemoTaskRows(createEmptyTaskRows());
            setDemoBandInputs(bandsToInputs(DEFAULT_GRADE_BANDS));
            setDemoHoursInputs(EMPTY_HOURS_INPUTS());
            setDemoRulesInputs(EMPTY_RULES_INPUTS());
            setDemoExtraRules(null);
            // 🧬 The twin of the reset above, and unmeasured for the same reason — see
            // the note there. Kept for the same reason too.
            setDemoShape(null);
            // 🛡️ Renamed with the profession+shape rework: this was
            // `setDemoArrangement(null)`. It survived the rename in BOTH reset
            // branches and threw `ReferenceError: setDemoArrangement is not
            // defined` on every demo render — caught by CI, not locally, because
            // it lives in an effect and the comment above explains why no test
            // drives this path. The profession clears too: a shape and the
            // profession it was labelled for are one choice, and half a choice
            // surviving a universe toggle is worse than neither.
            setDemoProfession(null);

            // 🛡️ M1 FIX: the demo branch above rewrites config.staff/config.tasks
            // (it used to overwrite them with the Marvel dataset; it now clears
            // them for the visitor's own team, and "Load example department" can
            // fill them with twelve fictional names). Either way the demo pool
            // must not survive the toggle back to LIVE, where one Generate click
            // would write it over four real clinicians. An in-progress
            // startDate/weeks edit is preserved.
            // THE STAFF POOL IS WHO HOLDS DUTIES, not everyone in the team — the
            // roster master configures the roster and is not in it, the Head of
            // Service reads it and is not in it. Filtering by `role` cannot express
            // that: this team has both a lead who practises and a lead who does not.
            //
            // ⚠️ WITH A TEAM, THE POOL IS THE TEAM'S — EVEN WHILE IT IS EMPTY. The
            //    fallback in `auraEngine.js` is EMPTY since `AN14` (the four names
            //    it held shipped in the public bundle, and were stale anyway), so
            //    every path without real members lands on the same outcome: an
            //    empty pool disables Generate and says why. Waiting beats guessing.
            //
            //    Without a team — the pre-migration bridge — there is nobody to ask,
            //    so the fallback is still the right answer and `undefined` requests it.
            setConfig(prev => restoreLiveRosterConfig(
                prev,
                teamId ? { staff: rosteredMembers.map(person => person.displayName).filter(Boolean) } : undefined,
            ));

            // NO TEAM, NO LISTENER. `rosterPath` throws on a null teamId by design —
            // composing `teams//rosters/2026` would be silent corruption — so the
            // moment before a team is known has to be an early return rather than a
            // caught exception. The calendar renders empty, which is the truth.
            if (!teamId) return undefined;

            const unsub = onSnapshot(
                doc(db, ...rosterPath(teamId, ROSTER_YEAR)),
                (snap) => {
                    setRosterError(null);
                    if (snap.exists()) setRosterData(snap.data());
                },
                // 🛡️ M8 FIX: this listener had no error callback, so a Firestore
                // rules denial produced an empty calendar and no message
                // anywhere — the one signal that would have explained it.
                (error) => {
                    console.error('🔥 Roster listener failed:', error.code, error.message);
                    setRosterError(
                        error.code === 'permission-denied'
                            ? 'You do not have permission to read the master roster. The calendar below is empty because it could not be loaded — not because no roster exists.'
                            : `The roster could not be loaded (${error.code || 'unknown error'}). The calendar below may be empty or out of date.`
                    );
                }
            );
            return () => unsub();
        }
        return undefined;
    }, [isDemo, teamId, rosteredMembers]);

    /**
     * Load the department's configuration into the wizard.
     *
     * ⚠️ IT OVERWRITES WHATEVER IS IN THE FORM, AND THAT IS ONLY SAFE BECAUSE IT
     *    RUNS ONCE PER TEAM. Keyed on `teamId` alone, deliberately: re-running it
     *    while somebody is mid-edit would discard their typing every time an
     *    unrelated dependency moved. A team SWITCH must reload — the previous
     *    department's tasks in the new department's form is exactly the kind of
     *    silent cross-team bleed the rebuild exists to remove.
     */
    useEffect(() => {
        if (isDemo || !teamId) return undefined;

        const unsub = onSnapshot(
            doc(db, ...rosterSettingsPath(teamId)),
            (snap) => {
                setSettingsError(null);
                if (!snap.exists()) { setStoredSettings(null); setSettingsSeeded(false); return; }

                const restored = fromStoredSettings(snap.data());
                if (!restored) { setStoredSettings(null); return; }
                setSettingsSeeded(true);

                setStoredSettings(toStoredSettings(restored));
                setDemoTaskRows(restored.taskRows);
                setDemoBandInputs(restored.bandInputs);
                setDemoHoursInputs(restored.hoursInputs);
                setDemoRulesInputs(restored.rulesInputs);
                setDemoExtraRules(restored.extraRules);
            },
            // ⚠️ A DENIAL HERE IS SILENT OTHERWISE, and the failure it produces is
            //    a roster master typing their department in again believing it was
            //    never saved. Two of the three listeners in this app had no error
            //    callback and that is the post-mortem this repository already has.
            (error) => {
                console.error('[NEXUS] roster settings unreadable', error);
                setSettingsError('Your department\'s saved configuration could not be read. '
                    + 'Anything you change here will not be saved until that is fixed.');
            },
        );
        return () => unsub();
    }, [isDemo, teamId]);

    /**
     * ==========================================================================
     * ⚠️ THE BRIDGE FOR A DEPARTMENT THAT ALREADY HAS A ROSTER — `R4`
     * ==========================================================================
     *
     * Team #1 has been rostering for months. Its tasks live in `config.tasks` —
     * historically `['EFT', 'IPT+SKG', 'NC', 'FSG+WI']`, and since 2026-08-31 the
     * spelled-out nine — because that is what the round-robin
     * engine consumed, and it has no `settings/roster` document because that
     * document did not exist until today.
     *
     * Without this, the first thing its roster master sees after the upgrade is a
     * Configure panel with FOUR BLANK ROWS and a Generate button refusing on "the
     * core task list is empty" — for a department whose roster is on screen behind
     * the modal. Found by `RosterView.alerts.test.jsx` failing to open the
     * confirmation modal, which is the same thing happening in miniature.
     *
     * So: no stored document and nothing typed yet ⇒ open the wizard on the tasks
     * the department is demonstrably already running. They arrive as ordinary
     * editable rows with the engine's defaults for everything the old model could
     * not express, and the first Generate stores them properly.
     *
     * ⚠️ IT MUST NOT RUN ONCE A DOCUMENT EXISTS, or a saved configuration would be
     *    overwritten by the legacy list on every mount. `settingsSeeded` is that
     *    latch, and it is set by the listener rather than inferred here.
     */
    useEffect(() => {
        if (isDemo || !teamId || settingsSeeded) return;

        const legacyTasks = (config.tasks || [])
            .map((name) => String(name || '').trim())
            .filter(Boolean);
        if (legacyTasks.length === 0) return;

        setDemoTaskRows((previous) => {
            // Only into a wizard nobody has typed into. A half-filled form is
            // somebody's work in progress, not an empty slate to overwrite.
            const untouched = previous.every((row) => String(row.name || '').trim() === '');
            if (!untouched) return previous;
            return legacyTasks.map((name) => createTaskRow({ name }));
        });
    }, [isDemo, teamId, settingsSeeded, config.tasks]);

    // --- EFFECT: COVERAGE REQUESTS AIMED AT THE SIGNED-IN USER -----------------
    //
    // The listener that used to live in `AuraPulseBot`, with the same query
    // (`targetStaff == me AND status == 'PENDING'`) against the same collection,
    // now feeding the roster instead of a chat message. It is the ONLY reader of
    // `shift_swaps` in the app: the chat surface was removed in the same change,
    // deliberately, because two live listeners would mean two Accept buttons for
    // one shift and the possibility of answering the same request twice.
    //
    // 🧪 DEMO MODE OPENS NO CHANNEL AT ALL. Not a filtered listener, not an empty
    // query — no `collection`, no `query`, no `onSnapshot`. The sandbox's promise
    // is that it neither reads nor writes live data, and a subscription to real
    // colleagues' coverage requests would break the reading half of it.
    //
    // Reads whole snapshots rather than `docChanges()`: `added` events fire once,
    // which is exactly how M5 lost a request to a re-render. A full snapshot is
    // idempotent — the card shows what is PENDING right now.
    /**
     * ⚠️ THE LISTENER ROUTES BY UID; THE MUTATOR STILL MATCHES BY NAME. Both halves
     * of that sentence are deliberate.
     *
     * ROUTING BY NAME WAS A REAL DEFECT: `where('targetStaff','==',user.name)` meant
     * that the moment somebody edited their display name in their profile, every
     * coverage request aimed at them stopped arriving — silently, because a query
     * that matches nothing is indistinguishable from nobody having asked. `uid` does
     * not change when a person marries, corrects a spelling, or gains a title.
     *
     * THE MUTATOR CANNOT FOLLOW YET, and pretending otherwise would be worse than
     * saying so: the roster document stores day arrays of DISPLAY NAMES
     * (`shift.lead === user.name`), and `planSwapApplication` matches against them.
     * Converting those to uids means changing the engine, the wizard, the demo
     * fixtures and most of 1,798 tests — a change with its own risk budget, not a
     * rider on this one. So `targetStaff` stays on the document beside `targetUid`,
     * and the two are written together from one source.
     */
    const coverageTargetUid = user?.uid || null;

    useEffect(() => {
        // Both universes start from a clean slate: a sandbox visitor must not see a
        // real request, and a real user must not see one left over from a sandbox
        // session (there are none — the sandbox writes nothing — which is the point).
        setCoverageRequests([]);
        setCoverageError(null);
        setRespondingSwapId(null);
        setAnsweredSwapIds(new Set());
        setSwapFailures({});

        if (isDemo || !teamId || !coverageTargetUid) return undefined;

        const pendingForMe = query(
            collection(db, ...swapsPath(teamId)),
            where('targetUid', '==', coverageTargetUid),
            where('status', '==', 'PENDING'),
        );

        const unsub = onSnapshot(
            pendingForMe,
            (snapshot) => {
                setCoverageError(null);
                setCoverageRequests(readCoverageRequests(snapshot));
            },
            // 🛡️ M8: without this callback a rules denial is silent, and "nobody
            // has asked me to cover anything" looks identical to "I am not allowed
            // to know whether anybody has".
            (error) => {
                console.error('🔥 Coverage request listener failed:', error?.code, error?.message);
                setCoverageError(
                    error?.code === 'permission-denied'
                        ? 'You do not have permission to read coverage requests, so AURA cannot show you shifts colleagues have asked you to cover. This card is empty because it could not be loaded — not because nobody has asked. Please tell an administrator.'
                        : `Coverage requests could not be loaded (${error?.code || 'unknown error'}). Reload the page to start listening again — this card may be missing requests until you do.`,
                );
            },
        );

        return () => unsub();
    }, [isDemo, teamId, coverageTargetUid]);

    // --- ACTIONS ---
    
    /**
     * 🧪 SANDBOX: fill ONE OF THE SEVEN SHAPES into the wizard's tables.
     *
     * WAS `loadExampleDepartment`, which took no argument and closed over the single
     * example fixture; then `loadArrangement`, which took one of twelve per-department
     * fixtures. It now takes a SHAPE, and the body below is unchanged from that
     * parameterisation — deliberately, because the full worked example passes exactly the
     * object this function has always read and its existing tests therefore still
     * describe the same behaviour.
     *
     * THE CHOSEN PROFESSION IS NOT AN ARGUMENT TO THIS FUNCTION, and that is the claim
     * the whole change rests on. A shape's rows, rules, start date and run length come
     * from the shape; the profession is a label held in its own piece of state. So the
     * same shape loaded by an art therapist and by a physiotherapist produces the same
     * rows and therefore the same roster, which is asserted rather than asserted-by-
     * comment in `RosterView.demo.test.jsx`.
     *
     * EVERYTHING the fixture holds lands somewhere the visitor can see and change:
     * names, grades, FTE, leave dates, per-person daily caps and cohort windows into
     * the staff rows; days or a monthly recurrence, lead bands, the co-lead toggle,
     * continuity, a quota, a session length, a slot list and a category into the task
     * rows; the three band boundaries, the two hours boxes and the three department
     * limits into the panels that own them. THAT IS WHAT MAKES THE PICKER HONEST: an
     * arrangement whose interesting field had no control would load, generate, and be
     * uneditable — a demo of a capability nobody in the room could then adjust.
     *
     * Two things travel on the rows without a column of their own — staff `skills` and
     * a task's `requiresSkill` — because the full worked example's single unfillable slot
     * exists precisely because only two people hold CPET. They are rendered read-only in
     * the tables rather than hidden.
     *
     * Fresh copies throughout, so a later edit cannot mutate the frozen export
     * through a shared array reference.
     */
    const loadShape = (shape) => {
        const fixture = shape.config;
        // The shape, and specifically its `attribution`, travels with the rows. See the
        // note on `demoShape`: the picker closes, the attribution must not.
        setDemoShape(shape);
        setDemoStaffRows(fixture.staff.map(person => createStaffRow(person)));
        setDemoTaskRows(fixture.tasks.map(task => createTaskRow(task)));
        setDemoBandInputs(bandsToInputs(fixture.rules?.bands || DEFAULT_GRADE_BANDS));
        // The fixture's hours policy goes into the two boxes — not into `extraRules` —
        // for exactly the reason `bands` does: one value, one source, and the source is
        // the control the visitor can see. The graded duty split and the two Marvel demos
        // state neither field, so both boxes stay blank and their runs are the duties-only
        // runs they have always been; the periodic clinic and the weekend quota state
        // `weeklyHours: 42`, and 42 therefore appears in the box as a TYPED value, which is
        // what makes the hours columns in their load tables something a visitor can change
        // rather than a property of the fixture.
        const exampleHours = {
            weeklyHours: fixture.rules?.weeklyHours === undefined
                ? '' : String(fixture.rules.weeklyHours),
            maxHoursPerDay: fixture.rules?.maxHoursPerDay === undefined
                ? '' : String(fixture.rules.maxHoursPerDay),
        };
        setDemoHoursInputs(exampleHours);
        // …and the same discipline for the three department limits, which used to be
        // the ONLY way `maxConcurrentPerDay` and `maxConsecutiveDays` reached a config
        // at all (`ROSTER_QC_AUDIT_SURFACES.md` §3: "example fixture only"). They now
        // land in the panel that owns them, so the shape's policy is visible and editable
        // rather than carried invisibly in `extraRules`. Most shapes state 2 and 6, which
        // happen to be the engine's defaults — the boxes therefore show "2" and "6" as
        // TYPED values, because the team that described the shape really does declare them,
        // and that is a different fact from leaving them blank. NOT every shape states
        // them: the Marvel quick demo states neither and its boxes are therefore blank, and
        // the fixed-weekday-sessions shape states a concurrency of THREE because its
        // mid-week consult genuinely needs a third duty from somebody. Which is the point
        // of reading them off `fixture.rules` per shape rather than assuming a shared
        // policy — an assumption this comment used to make, and which was already wrong for
        // the Marvel team.
        setDemoRulesInputs({
            maxConcurrentPerDay: fixture.rules?.maxConcurrentPerDay === undefined
                ? '' : String(fixture.rules.maxConcurrentPerDay),
            maxConsecutiveDays: fixture.rules?.maxConsecutiveDays === undefined
                ? '' : String(fixture.rules.maxConsecutiveDays),
            // Fresh arrays, so an edit in the wizard cannot reach into the frozen
            // export through a shared reference.
            forbidPairs: (fixture.rules?.forbidPairs || []).map(pair => [...pair]),
        });
        // Only the policy no control owns. `bands` is stripped: the editor owns it from
        // here, and two sources for one value is how a roster gets generated against
        // boundaries nobody can see. The two hours fields and the three limits are
        // stripped for the same reason, into the controls above.
        const exampleRules = { ...(fixture.rules || {}) };
        delete exampleRules.bands;
        delete exampleRules.weeklyHours;
        delete exampleRules.maxHoursPerDay;
        delete exampleRules.maxConcurrentPerDay;
        delete exampleRules.maxConsecutiveDays;
        delete exampleRules.forbidPairs;
        setDemoExtraRules(exampleRules);
        // The start date and the length of the run are PART OF THE SHAPE, and for several
        // of them they are load-bearing rather than cosmetic: a periodic-clinic run shorter
        // than two months holds one occurrence of a monthly clinic and cannot show
        // continuity at all; a team-rotation run shorter than a four-month block shows a
        // rota instead of a handover; and the weekend-quota run starts on the 1st of a
        // month so its first quota period is a WHOLE month the engine will judge. Each
        // fixture's own comment states why its two numbers are what they are.
        setConfig(prev => ({
            ...prev,
            startDate: fixture.startDate,
            weeks: fixture.weeks,
        }));
    };

    /**
     * 🧪 SANDBOX: START BLANK — the first option in the shape dropdown, and a real one.
     *
     * It was a dead placeholder ("Choose a team to load…") that could only be read, never
     * chosen: once a shape had been loaded there was no way back to empty rows except
     * reloading the page and losing the start date and the run length too. "Type your own
     * team" is the case the tables exist for, so it gets a control.
     *
     * The PROFESSION is deliberately left alone. It is the visitor's own designation, not
     * part of any shape, and clearing the rows is no reason to make them say who they are
     * again. `demoResult` is left alone too: a roster already on screen was really
     * generated, and silently deleting it because somebody emptied the form would be the
     * calendar lying about what happened.
     */
    const startBlank = () => {
        setDemoShape(null);
        setDemoStaffRows(createEmptyStaffRows());
        setDemoTaskRows(createEmptyTaskRows());
        setDemoBandInputs(bandsToInputs(DEFAULT_GRADE_BANDS));
        setDemoHoursInputs(EMPTY_HOURS_INPUTS);
        setDemoRulesInputs(EMPTY_RULES_INPUTS);
        setDemoExtraRules(null);
    };

    // --- SANDBOX TABLE EDITS ---
    // Row-level plumbing, kept together so the tables themselves stay stateless.
    // Every edit is a fresh array: mutating a row in place would leave React with
    // the same reference and the `demoWizard` memo with a stale answer.
    const patchStaffRow = (id, patch) =>
        setDemoStaffRows(rows => rows.map(row => (row.id === id ? { ...row, ...patch } : row)));
    const addStaffRow = () => setDemoStaffRows(rows => [...rows, createStaffRow()]);
    const removeStaffRow = (id) => setDemoStaffRows(rows => rows.filter(row => row.id !== id));

    const patchTaskRow = (id, patch) =>
        setDemoTaskRows(rows => rows.map(row => (row.id === id ? { ...row, ...patch } : row)));
    const addTaskRow = () => setDemoTaskRows(rows => [...rows, createTaskRow()]);
    const removeTaskRow = (id) => setDemoTaskRows(rows => rows.filter(row => row.id !== id));

    const patchBandInput = (band, bound, value) =>
        setDemoBandInputs(prev => ({ ...prev, [band]: { ...prev[band], [bound]: value } }));

    const patchHoursInput = (field, value) =>
        setDemoHoursInputs(prev => ({ ...prev, [field]: value }));

    // The three department limits, including the whole `forbidPairs` LIST: the panel
    // computes the next list (add a pair, remove a pair) and hands it over in one
    // call, exactly as the task drawer does for its slot list and the staff drawer for
    // its windows. One callback per control family, no per-item plumbing here.
    const patchRulesInput = (field, value) =>
        setDemoRulesInputs(prev => ({ ...prev, [field]: value }));

    const handleGenerateClick = () => {
        if (isDemo) {
            // 🧪 SANDBOX — A REAL ENGINE RUN, IN COMPONENT STATE ONLY.
            //
            // This branch used to fire two fake alerts ("simulating roster
            // conflict resolution", then "Zero conflicts found in multiverse
            // timeline") and generate nothing whatsoever. It now calls
            // `generateRosterV2` on whatever the visitor typed and renders the
            // result in the same calendar the live roster uses.
            //
            // 🛡️ NO FIRESTORE, EVER. There is no `doc`, no `setDoc`, no
            // `addDoc` and no `collection` on this path, and the `return` below
            // is what keeps it that way: the live write path
            // (prepareRosterWrite → setDoc, inside executeRosterGeneration) is
            // only reachable through the confirmation modal, which this early
            // return never opens. Demo mode therefore cannot touch live data
            // even if the configuration is valid, invalid, or malicious.
            //
            // The config comes from `buildDemoRosterV2ConfigFromTables` — the
            // same pure call the disabled state of this button is computed from,
            // so a press that gets here has already been mapped and judged once.
            if (!demoWizard.ok) {
                // Unreachable through the UI (the button is disabled and the
                // reason is on screen beside it), and kept anyway: the table
                // state and the button's disabled attribute are two separate
                // pieces of DOM, and the sandbox's honesty is worth more than
                // that ordering.
                setDemoResult(null);
                setRosterData({});
                setRosterError(`AURA did not generate a roster: ${demoWizard.reason}`);
                return;
            }

            const demoConfig = demoWizard.config;
            const result = generateRosterV2(demoConfig);

            if (!result.ok) {
                // The engine refuses configurations that cannot be what the
                // author meant (a task requiring a skill nobody holds, a
                // duplicated name). Its `reason` is written to be shown verbatim,
                // so it is — in the same banner a live read failure uses.
                setDemoResult(null);
                setRosterData({});
                setRosterError(`AURA did not generate a roster: ${result.reason}`);
                return;
            }

            setRosterError(null);
            setDemoResult(result);
            setRosterData(result.roster);

            // What the load table reports as each person's grade and band. Taken
            // from the config that was just GENERATED FROM, resolved against the
            // boundaries that run used — not from the live table rows, which the
            // visitor may edit next without regenerating.
            setDemoRunGrades(Object.fromEntries(
                demoConfig.staff.map(person => [
                    person.name,
                    {
                        grade: person.grade || null,
                        band: person.grade ? bandOfGrade(person.grade, demoConfig.rules.bands) : null,
                    },
                ]),
            ));

            // …and the same snapshot discipline for the two figures the person view
            // and the load table put into words: how long each task takes (only
            // where the configuration SAID, so nothing prints the engine's default
            // as though somebody had chosen it) and how many days a week this
            // department runs.
            setDemoRunTaskHours(taskHoursFromConfig(demoConfig.tasks));
            setDemoRunWorkingDays(countWorkingDays(demoConfig.tasks));

            // 👤 Whose week "my week" opens on, if the visitor switches to it. The
            // signed-in name when it is genuinely in the generated pool, and
            // otherwise the first person rostered — a sandbox visitor is not a
            // member of the fictional department they just invented, and an empty
            // person view would look like a broken one. Never a name that is not in
            // this run's pool.
            const pool = demoConfig.staff.map(person => person.name);
            setDemoPersonChoice(
                pool.includes(user?.name) ? user.name : (pool[0] || ''),
            );

            // The swap modal's colleague list is `config.staff` (via
            // `filterSwapCandidates`), so the pool that was actually rostered has
            // to land there. Written HERE rather than on every keystroke in the
            // table: a half-typed name is not a colleague anybody can be asked to
            // cover for. `config.tasks` follows for the same reason.
            setConfig(prev => ({
                ...prev,
                staff: demoConfig.staff.map(person => person.name),
                tasks: demoConfig.tasks.map(task => task.name),
            }));

            // Jump the calendar to the month the roster really starts in. The
            // engine snaps `startDate` back to its Monday and reports the result
            // in `effectiveStart`, so this follows the engine rather than the
            // typed date — otherwise a snapped run could open on the wrong month
            // and look empty. Parsed with the engine's own LOCAL parser: a UTC
            // parse here is post-mortem B2 all over again.
            const started = parseLocalDateKey(result.effectiveStart);
            setCurrentDate(new Date(started.getFullYear(), started.getMonth(), 1));

            setIsConfigOpen(false);
            return;
        }

        // 🛡️ M3 FIX: never even open the confirmation for a config that cannot
        // be generated. The button is disabled too; this is the second latch.
        //
        // ⚠️ `generateGate` NOW, NOT `configValidation`. The live gate used to judge
        //    two textareas for the round-robin generator; it judges the whole
        //    configuration for `generateRosterV2` — which is what live mode runs.
        //    Leaving the old validator here would have let a configuration the
        //    engine refuses reach the confirmation modal and fail after the user
        //    said yes.
        if (!generateGate.valid) {
            showStatus('error', `Cannot generate: ${generateGate.reason}`);
            return;
        }

        setIsConfirmModalOpen(true);
    };

    const executeRosterGeneration = async () => {
        setIsConfirmModalOpen(false); // Close the confirm modal

        // 🛡️ THIRD LATCH, and the only line of the live write path this task
        // added: demo mode must never reach `setDoc`. It cannot get here today —
        // `handleGenerateClick` returns early in demo mode and this function runs
        // only from the confirmation modal it never opens — but "cannot" was
        // resting on the ORDER of two independent pieces of state, and the demo
        // safety property is worth more than that. In live mode `isDemo` is false
        // and this line is a no-op, so live behaviour is byte-for-byte unchanged.
        if (isDemo) {
            console.warn('Roster write refused: demo mode never writes to Firestore.');
            return;
        }

        /**
         * ======================================================================
         * ⚠️ THE LIVE ROSTER NOW COMES FROM `generateRosterV2` — `R4`
         * ======================================================================
         *
         * It used to come from `prepareRosterWrite(config)`, which defaults to
         * `generateRoster`: a round-robin that rotates a list of NAMES and assigns
         * `staff[taskIdx % staff.length]` as lead and the next one as co-lead,
         * Monday to Friday. It could not see a grade, an FTE, a skill, a leave
         * date or a rule, because its input was two comma-separated strings.
         *
         * Every capability the sandbox has demonstrated for months — grade bands,
         * skill matching, part-time fairness, working-hours ceilings, consecutive-day
         * limits, the grade floor shipped in v1.18.0 — existed only there. This is
         * the line that ends that split.
         *
         * ⚠️ IT WILL PRODUCE A DIFFERENT ROSTER FROM THE ONE PEOPLE HAVE BEEN
         *    WORKING TO, AND THAT IS THE POINT RATHER THAN A REGRESSION. v2
         *    respects constraints v1 ignored, so the allocation legitimately
         *    changes. The confirmation modal is what makes that a decision.
         *
         * ⚠️ `prepareRosterWrite` IS STILL THE GATE. It is what refuses to write an
         *    empty schedule — a defect this repository has already had, where an
         *    empty write blanked the whole document and reported success — so the
         *    engine is passed to it rather than called around it.
         */
        if (!demoWizard.ok) {
            showStatus('error', `Roster NOT generated. ${demoWizard.reason}`);
            return;
        }

        const v2Config = demoWizard.config;
        const prepared = prepareRosterWrite(
            v2Config,
            (cfg) => {
                const run = generateRosterV2(cfg);
                // `prepareRosterWrite` expects the roster map itself. A refusal
                // returns no roster, and an empty object is exactly what its own
                // guard catches and reports — so a refusal cannot become a silent
                // empty write.
                return run && run.ok ? run.roster : {};
            },
            // ⚠️ THE V2 VALIDATOR, NOT THE DEFAULT. v1's requires `staff` to be an
            //    array of STRINGS; a v2 config's staff are objects, so the default
            //    would refuse every real department with "The staff pool is empty".
            validateRosterV2Config,
        );
        if (!prepared.ok) {
            console.error("Roster generation blocked before write:", prepared.reason, v2Config);
            showStatus('error', `Roster NOT generated. ${prepared.reason}`);
            return;
        }

        try {
            // 🛡️ C2 FIX: { merge: true } — generating one period must not erase
            // the periods already stored in this document.
            await setDoc(doc(db, ...rosterPath(teamId, ROSTER_YEAR)), prepared.data, { merge: true });

            /**
             * ⚠️ THE CONFIGURATION IS SAVED HERE, AFTER THE ROSTER, AND NOT BEFORE.
             *
             *    Generate is the moment a roster master COMMITS to a configuration —
             *    they have just produced a roster from it — so it is the honest
             *    moment to persist it, and it needs no second button nobody would
             *    press.
             *
             *    Ordering it after the roster write is deliberate. If the roster
             *    write fails, the configuration that produced nothing must not
             *    become the department's stored setup; the `catch` below already
             *    reports that failure and this line is simply never reached.
             *
             * ⚠️ AND ITS FAILURE MUST NOT REPORT THE ROSTER AS FAILED. The roster
             *    IS saved by this point. Losing the configuration means retyping a
             *    form; being told the roster did not save means regenerating one
             *    that already exists, over the top of itself. So this has its own
             *    `catch` and its own sentence.
             */
            const nextSettings = toStoredSettings(
                {
                    taskRows: demoTaskRows,
                    bandInputs: demoBandInputs,
                    hoursInputs: demoHoursInputs,
                    rulesInputs: demoRulesInputs,
                    extraRules: demoExtraRules,
                },
                { now: new Date().toISOString(), by: user?.uid || null },
            );

            // THREE OUTCOMES, NOT TWO, and the third is why this is not one boolean.
            // `settingsSaved` alone conflated "written" with "there was nothing to
            // write" — both left it `true`. The banner below now tells the roster
            // master their setup was kept, and it may only say so when a write
            // actually happened: announcing a save on a generation that changed
            // nothing would be claiming an action that did not occur, which is the
            // failure this whole subsystem's post-mortem is about.
            let settingsSaved = true;
            let settingsWritten = false;
            if (nextSettings && settingsChanged(storedSettings, nextSettings)) {
                try {
                    await setDoc(doc(db, ...rosterSettingsPath(teamId)), nextSettings);
                    setStoredSettings(nextSettings);
                    settingsWritten = true;
                } catch (settingsWriteError) {
                    console.error('[NEXUS] roster settings not saved', settingsWriteError);
                    settingsSaved = false;
                }
            }

            setIsConfigOpen(false); // Close the config wizard
            // 🌟 P8.3: "conflict-free" was the old copy. Post-mortem E1: the
            // generator cannot know that — it means "cannot double-book by
            // construction". It says what it actually did instead.
            const rosterSentence = generationPlan
                ? `Roster saved: ${generationPlan.dayCount} days, ${formatRosterDateKey(generationPlan.firstDate)} → ${formatRosterDateKey(generationPlan.lastDate)}.`
                : 'Roster saved.';

            if (settingsSaved && settingsWritten) {
                // ⚠️ THE SAVE WAS SILENT UNTIL NOW, and that was the actual gap: the
                // configuration has been persisted on every Generate since `R4`, but
                // nothing said so, so a roster master had no way to learn it had
                // happened and reasonably assumed they would be retyping their
                // department next time. The failure case had a sentence and the
                // success case did not, which is the wrong way round — the quiet
                // outcome is the one nobody can verify for themselves.
                showStatus('success', `${rosterSentence} Your department's setup is saved, `
                    + 'so you will not have to enter it again.');
            } else if (settingsSaved) {
                // Nothing changed, so nothing was written. Say only what happened.
                showStatus('success', rosterSentence);
            } else {
                // Not an error tone: the roster — the thing they pressed the button
                // for — is saved. What failed is the convenience of not retyping.
                showStatus('info', `${rosterSentence} Your department's configuration could `
                    + 'not be saved, so you may have to set it up again next time.');
            }
        } catch (error) {
            console.error("Error generating roster:", error);
            // The code is included for the same reason the M8 listener banner
            // includes it: "permission-denied" and "unavailable" call for
            // completely different actions from the person reading this.
            showStatus(
                'error',
                `The roster was NOT saved (${error?.code || 'unknown error'}). Your configuration is still here — check your connection and press Generate again.`,
            );
        }
    };

    // 🗓️ P4.4 / post-mortem B4: this used to be
    // `new Date(currentDate.setMonth(currentDate.getMonth() + offset))`, which
    // MUTATES the Date object held in state before constructing the new one. It
    // re-rendered only because a fresh Date was then handed to the setter.
    // Rebuilt from parts instead, through the functional setter so two rapid
    // clicks cannot both read the same stale `currentDate` from the closure.
    const handleMonthChange = (offset) => {
        setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };

    // --- SWAP LOGIC ---
    const handleShiftClick = (shift, dateKey) => {
        // 🌟 UPDATED: Checks if user is Lead OR Co-Lead. Also maintains backwards compatibility.
        const isMyShift = isDemo ? true : (shift.lead === user?.name || shift.coLead === user?.name || shift.staff === user?.name);
        
        if (isMyShift || user?.role === 'admin') {
            setSelectedShift({ ...shift, date: dateKey });
            // A fresh shift means a fresh duty choice — never carry the previous
            // shift's selection into this one.
            setSwapRoleChoice('');
            setIsSwapModalOpen(true);
        }
    };

    // 🛡️ A3 + M11 — THE TRUE ROOT CAUSE OF THE BROKEN SWAP, AND ITS ADMIN HOLE.
    //
    // A3: the swap message contract never recorded WHICH duty was being handed
    // over, so the mutator could not know which field to rewrite even in
    // principle. `selectedShift` has the answer in hand at exactly this moment;
    // the old code discarded it.
    //
    // M11: the old code then derived that duty from the CLICKING user, and wrote
    // `requestedBy: <clicking user>`. An admin is allowed to open this modal on
    // any shift, and the app's admins are not in the roster staff pool at all —
    // so every admin-brokered request was written as `(<admin>, null)` and was
    // guaranteed to be refused on acceptance.
    //
    // Both decisions now live in `resolveSwapSubject`, which is pure and unit
    // tested against the real `planSwapApplication` so the request side and the
    // acceptance side cannot drift apart. Identity comparison, never
    // `includes()` (A4).
    const actingUserName = user?.name || user?.email || 'Unknown User';

    // Demo mode's standing fiction is that every shift is actionable
    // (`isMyShift` is forced true above). Granting it the admin path keeps the
    // sandbox behaving exactly as it did, without a live-mode special case.
    const canArrangeForOthers = user?.role === 'admin' || isDemo;

    const swapSubject = useMemo(
        () => (selectedShift
            ? resolveSwapSubject({
                shift: selectedShift,
                actingUser: actingUserName,
                isAdmin: canArrangeForOthers,
                chosenRole: swapRoleChoice,
            })
            : null),
        [selectedShift, actingUserName, canArrangeForOthers, swapRoleChoice],
    );

    const submitSwapRequest = async (e) => {
        e.preventDefault();
        if (!swapTargetStaff) return;

        // 🛡️ M11: refuse to CREATE a request that cannot be applied. The button
        // is disabled too; this is the second latch. Previously this path
        // happily wrote `swapRole: null`, alerted "securely transmitted", and
        // the failure surfaced only when a colleague tried to accept it.
        if (!swapSubject || !swapSubject.ok) {
            showStatus(
                'error',
                `Request not sent. ${swapSubject?.reason || 'AURA could not work out which duty this swap refers to.'}`,
            );
            return;
        }

        // 🛡️ M12 FIX: `addDoc` was unconditional, so pressing Submit twice wrote
        // two PENDING documents for one shift — two "URGENT COVERAGE REQUEST"
        // messages on the target's next load, each independently acceptable, and
        // accepting both ran the swap mutator twice.
        //
        // Client-side only: this does NOT survive a reload, a second tab or a
        // second device. The real guard is a uniqueness constraint in
        // `firestore.rules`, which is blocked on decision Q6 — not on the file
        // existing. It exists and is tracked; `firebase.json` declares only
        // `hosting` and `functions`, so it is never deployed.
        const swapSignature = buildSwapRequestSignature({
            originalShiftDate: selectedShift.date,
            originalTask: selectedShift.task,
            targetStaff: swapTargetStaff,
        });

        if (sentSwapSignatures.has(swapSignature)) {
            showStatus('info', `You already sent this request — ${swapTargetStaff} has not responded yet.`);
            return;
        }

        setIsSubmitting(true);

        try {
            if (isDemo) {
                // Fake delay for demo mode
                await new Promise(resolve => setTimeout(resolve, 800));
                // 🌟 P8.3: the old alert said AURA "notified" the colleague. It
                // did not — the sandbox writes nothing and sends nothing. This
                // says what actually happened.
                showStatus(
                    'info',
                    `Sandbox: nothing was sent and nothing was saved. In live mode this would have asked ${swapTargetStaff} to cover.`,
                );
            } else {
                // 📡 LIVE MODE: Pushing the request to Firebase Firestore
                await addDoc(collection(db, ...swapsPath(teamId)), {
                    // 🛡️ M11: the person being SWAPPED OUT, which is what
                    // `planSwapApplication` matches on — not necessarily the
                    // person who clicked. For an admin arranging cover this is
                    // the clinician who actually holds the duty.
                    requestedBy: swapSubject.requestedBy,
                    targetStaff: swapTargetStaff,
                    // ROUTING. `targetStaff` above is what the roster mutator matches
                    // against the day arrays; this is what the recipient's listener
                    // queries. Written from the same pick so they cannot disagree, and
                    // null only if the chosen name is not in the member list — in which
                    // case the request would not have been offerable in the first place.
                    targetUid: memberUidByName[swapTargetStaff] || null,
                    originalShiftDate: selectedShift.date,
                    originalTask: selectedShift.task,
                    // 🛡️ A3: 'lead' | 'coLead' — the duty the covering colleague
                    // will take over, mechanically, when they accept. Never null
                    // now: a request that could not name its duty is refused
                    // above rather than written.
                    swapRole: swapSubject.swapRole,
                    // 🛡️ M11: present only when somebody arranged this on
                    // another clinician's behalf, so the ledger records who did.
                    // Absent on a self-request, which keeps that document's shape
                    // byte-for-byte what it was before this fix.
                    ...(swapSubject.initiatedBy ? { initiatedBy: swapSubject.initiatedBy } : {}),
                    reason: swapReason,
                    status: 'PENDING',
                    timestamp: serverTimestamp()
                });
                showStatus(
                    'success',
                    swapSubject.onBehalf
                        ? `Coverage request sent to ${swapTargetStaff}, on behalf of ${swapSubject.requestedBy}.`
                        : `Swap request sent to ${swapTargetStaff}.`,
                );
            }

            // 🛡️ M12: recorded only on a path that really completed — a failed
            // `addDoc` falls through to the catch below and must stay retryable.
            setSentSwapSignatures((prev) => new Set(prev).add(swapSignature));

            // Clean up and close modal
            setIsSwapModalOpen(false);
            setSwapTargetStaff('');
            setSwapReason('');
            setSwapRoleChoice('');
        } catch (error) {
            console.error("🔥 Swap Request Failed:", error);
            showStatus(
                'error',
                `Could not send the request (${error?.code || 'unknown error'}). Check your connection and try again.`,
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    // 🤝 ONE-TAP ANSWER — THE SAME VERIFIED SEQUENCE, IN THE ROSTER.
    //
    // This is a MOVE, not a rewrite. Line for line it performs what
    // `AuraPulseBot.handleSwapResponse` performed, in the same order, with the same
    // pure helpers making every decision:
    //
    //   read the roster → planSwapApplication → write ONE day → READ BACK →
    //   findAppliedSwapShift → only then updateDoc(status: 'APPROVED')
    //
    // Every guarantee that order encodes is load-bearing and none of it is relaxed
    // here:
    //
    //   • A1/A3 — the substitution is decided by `planSwapApplication` from the
    //     `swapRole` recorded at request time. Mechanical: the covering colleague
    //     takes exactly the role the requester held, nobody is promoted, and no
    //     third person's duty moves. Both shift shapes are tolerated and a legacy
    //     shift is upgraded on write — all of that inside the helper, untouched.
    //   • A-RC4 — the write is not evidence. The document is read back and the
    //     substitution FOUND in it before anything is called done, and the message
    //     quotes the shift as it actually reads. There is no success literal on any
    //     path in this function.
    //   • M9 — the ledger is flipped to APPROVED only after that verified read.
    //     A refusal, a failed verification or a throw leaves the request PENDING,
    //     visibly, with the binding constraint named on the card.
    //   • M4 — nothing here claims the requester was notified. There is still no
    //     mechanism for that (decision Q3), so the copy says to tell them.
    //
    // 🛡️ DEMO MODE CANNOT REACH THIS. There is no listener in demo mode, so there
    // are no requests and no buttons; the `isDemo` guard below is the second latch,
    // in the same spirit as the one in `executeRosterGeneration`.
    const respondToCoverageRequest = async (request, isAccepted) => {
        if (isDemo) {
            console.warn('Coverage response refused: demo mode never writes to Firestore.');
            return;
        }

        const answerable = canAnswerCoverageRequest(request);
        if (!answerable.ok) {
            showStatus('error', answerable.reason);
            return;
        }
        // ONE ANSWER AT A TIME, LATCHED ON A REF, NOT ON STATE. Both paths write
        // `system_data/roster_2026`, and the disabled attribute on the buttons only
        // appears after a re-render — two taps inside one React batch would both see
        // `respondingSwapId === null` and both start a write. The ref is set
        // synchronously, so the second one returns here instead.
        const docId = request.docId;
        const coveringStaff = user?.name;

        if (respondingRef.current !== null) return;
        respondingRef.current = docId;

        /**
         * The request was NOT answered: record what happened, on the card beside the
         * request (which is still there, still answerable) and in the banner.
         *
         * The caller passes a COMPLETE sentence rather than a fragment this function
         * wraps in "the roster is unchanged". After a verified roster write whose
         * ledger flip failed, the roster IS changed, and a generic prefix would be
         * exactly the class of untrue printed claim (A-RC4) this whole flow was
         * repaired to stop. So each path below states its own facts.
         */
        const noteFailure = (text) => {
            setSwapFailures((prev) => ({ ...prev, [docId]: text }));
            showStatus('error', text);
        };

        /** Answered for real: hide it locally before Firestore's snapshot catches up. */
        const markAnswered = () => {
            setAnsweredSwapIds((prev) => new Set(prev).add(docId));
            setSwapFailures((prev) => {
                if (!(docId in prev)) return prev;
                const next = { ...prev };
                delete next[docId];
                return next;
            });
        };

        // Did the roster change and get CONFIRMED by a read-back? Read only by the
        // catch below, so a later failure cannot describe a verified change as
        // "nothing happened".
        let rosterChangeVerified = false;

        setRespondingSwapId(docId);

        try {
            const swapRef = doc(db, ...swapPath(teamId, docId));

            if (!isAccepted) {
                // 🛡️ THE ROSTER DOCUMENT IS NOT TOUCHED ON THIS PATH. Declining
                // changes who knows about the request, not who works the shift.
                await updateDoc(swapRef, { status: 'DENIED' });
                markAnswered();
                showStatus(
                    'info',
                    `Declined. The ${request.originalTask} shift on ${formatRosterDateKey(request.originalShiftDate)} stays with ${request.requestedBy}, and the roster is unchanged. AURA cannot notify ${request.requestedBy} yet, so please tell them directly that they still need cover.`,
                );
                return;
            }

            // ── ACCEPT ────────────────────────────────────────────────────────
            const rosterRef = doc(db, ...rosterPath(teamId, ROSTER_YEAR));
            const rosterSnap = await getDoc(rosterRef);

            const plan = planSwapApplication({
                roster: rosterSnap.exists() ? rosterSnap.data() : null,
                swap: request,
                coveringStaff,
            });

            if (!plan.ok) {
                // No roster write. No APPROVED. The request stays PENDING.
                console.warn('Coverage request not applied:', plan.reason, { request, coveringStaff });
                noteFailure(
                    `Cover not applied — the roster is unchanged and this request is still waiting for your answer. ${plan.reason}`,
                );
                return;
            }

            await updateDoc(rosterRef, { [plan.dateKey]: plan.shifts });

            // 🛡️ A-RC4: read it back and find the substitution before claiming it.
            const verifySnap = await getDoc(rosterRef);
            const observedShift = verifySnap.exists()
                ? findAppliedSwapShift({
                      roster: verifySnap.data(),
                      swap: request,
                      coveringStaff,
                      role: plan.role,
                  })
                : null;

            if (!observedShift) {
                console.error('Coverage request could not be verified on read-back:', { request, coveringStaff, plan });
                noteFailure(
                    `Cover not applied — AURA sent the roster change but could not find it when it read the document back, so it has NOT recorded this as approved and this request is still waiting. Check the roster for ${formatRosterDateKey(request.originalShiftDate)} yourself before relying on it, and tell ${request.requestedBy} the cover is not confirmed.`,
                );
                return;
            }

            // 🛡️ M9: only now, after a verified roster write.
            // `approvedAt` is a client ISO timestamp — byte-identical to what the
            // chat surface wrote, because the `shift_swaps` document shape (and the
            // `firestore.rules` proposal that pins it to `['status','approvedAt']`)
            // is not changing in this task. It is a ledger clock, never a date key.
            // From here on the roster really does read differently, and any later
            // failure must not be reported as "nothing changed".
            rosterChangeVerified = true;

            await updateDoc(swapRef, {
                status: 'APPROVED',
                approvedAt: new Date().toISOString(),
            });

            markAnswered();

            // Every fact in this sentence came out of the document that was just
            // read back — `observedShift.staff` is the roster's own text.
            showStatus(
                'success',
                `Covered, and verified against the master roster: the ${request.originalTask} shift on ${formatRosterDateKey(request.originalShiftDate)} now reads “${observedShift.staff}”. You have it as ${describeShiftRole(plan.role)} in place of ${request.requestedBy}. AURA cannot notify ${request.requestedBy} yet, so tell them it is covered.`,
            );
        } catch (error) {
            console.error('🔥 Coverage response failed:', error);
            const code = error?.code || error?.message || 'unknown error';

            // THREE DIFFERENT TRUTHS, and they must not be printed as one. The
            // ledger is only ever flipped after a verified roster write, so no path
            // here can have left an APPROVED entry behind — but "nothing changed" is
            // only true for two of them.
            if (rosterChangeVerified) {
                // The roster was written AND read back: this person really is on the
                // shift. What failed is recording the answer in the ledger.
                noteFailure(
                    `Your name IS on the ${request.originalTask} shift on ${formatRosterDateKey(request.originalShiftDate)} — AURA wrote that change and read the document back to confirm it. What failed (database error ${code}) is recording your answer against the request, so this request may still show as waiting. Do not answer it twice: tell ${request.requestedBy} the cover is confirmed, and ask an administrator to close the request.`,
                );
            } else if (isAccepted) {
                // Somewhere between reading the roster and confirming the write.
                // AURA does not know whether the change landed, and says so.
                noteFailure(
                    `Cover not applied — AURA hit a database error (${code}) before it could confirm anything, so it does not know whether the roster changed and has NOT recorded an answer. This request is still waiting. Check the roster for ${formatRosterDateKey(request.originalShiftDate)} before relying on it.`,
                );
            } else {
                noteFailure(
                    `Your decline was not recorded (database error ${code}). The roster is unchanged and this request is still waiting for an answer.`,
                );
            }
        } finally {
            respondingRef.current = null;
            setRespondingSwapId(null);
        }
    };

    // --- RENDER HELPERS ---
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth(); 
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay();

    const getShifts = (day) => {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return { shifts: rosterData[dateKey] || [], dateKey };
    };

    // 🧪 SANDBOX: every slot the engine could NOT staff, grouped by the DAY it is
    // missing from — so the calendar can show the absence in the square where it
    // happened instead of only in a list underneath.
    //
    // THIS IS WHY IT READS `unfilled` AND NOT `roster`: a day on which every single
    // slot failed produces NO roster key at all (documented in `generateRosterV2`),
    // so its square would render exactly like a day nothing was ever configured
    // for. Grouping the engine's own report by date is the only thing that can tell
    // those two apart, and telling them apart is the product.
    //
    // Demo-only, because `unfilled` is a V2 result and live mode still generates
    // with V1, which reports nothing of the kind. In live mode this map is empty and
    // the grid renders byte-for-byte what it rendered before.
    const unfilledByDate = useMemo(() => {
        const grouped = {};
        for (const slot of demoResult?.unfilled || []) {
            if (!slot || typeof slot.date !== 'string') continue;
            if (!grouped[slot.date]) grouped[slot.date] = [];
            grouped[slot.date].push(slot);
        }
        return grouped;
    }, [demoResult]);

    // 🧪 THE TWO NEW ENGINE OUTPUTS, READ THROUGH THE PURE CLASSIFIERS.
    //
    // Both exist because the engine's own sentence is CORRECT and still reads as a
    // failure to somebody who did not write the engine:
    //
    //   an UNMET QUOTA FLOOR is not a bug and not a broken roster — a floor cannot be
    //   met by inventing capacity, so the engine prefers whoever is behind for every
    //   occurrence it can and then says who was still short. Mixed into the general
    //   warnings list it reads as "something went wrong"; given its own block with one
    //   sentence of framing it reads as "this is what your policy cost".
    //
    //   a WINDOW-BLOCKED SLOT is the one `unfilled` reason whose cause is invisible in
    //   the tables: the people are in the pool, none of them is on leave, and they are
    //   still not eligible. Saying how many of the gaps are that, in words, is the
    //   difference between a report and a puzzle.
    //
    // Classified in `rosterWizard.js` rather than here, and pinned by end-to-end tests
    // that ask the classifier about a sentence the ENGINE actually produced — so this
    // component holds no opinion about the engine's prose and there is one definition
    // of "is this a quota floor" for the panel and the tests to share.
    const demoWarnings = useMemo(
        () => partitionDemoWarnings(demoResult?.warnings || []),
        [demoResult],
    );
    const demoUnfilledCauses = useMemo(
        () => summariseUnfilledCauses(demoResult?.unfilled || []),
        [demoResult],
    );

    // 🤝 The coverage requests actually on screen: PENDING per Firestore, minus the
    // ones answered in this session (the snapshot lags a successful write by a
    // round trip). A request whose acceptance FAILED is deliberately still here.
    const visibleCoverageRequests = useMemo(
        () => pendingCoverageRequests(coverageRequests, answeredSwapIds),
        [coverageRequests, answeredSwapIds],
    );

    // 👤 WHOSE WEEK. Live mode: the signed-in user, and nothing to choose. Sandbox:
    // whoever was picked out of the pool that was actually generated.
    const myWeekPerson = isDemo ? demoPersonChoice : (user?.name || '');

    // …and their duties for the month the calendar is showing. A pure re-reading of
    // `rosterData` — the same object the grid renders — so switching view cannot
    // produce a duty the grid does not have, and cannot cost a read.
    const myWeek = useMemo(
        () => personDutiesInMonth({
            roster: rosterData,
            person: myWeekPerson,
            year,
            month,
            // Live rosters carry no durations, so the hours column is simply absent
            // there rather than filled with a default nobody set.
            taskHours: isDemo ? demoRunTaskHours : null,
        }),
        [rosterData, myWeekPerson, year, month, isDemo, demoRunTaskHours],
    );

    /** The month the grid and the person view are both showing, in words. */
    const visibleMonthLabel = `${currentDate.toLocaleString('default', { month: 'long' })} ${year}`;

    // 🌟 P8.3: ONE banner, mounted wherever the user is actually looking.
    // The config wizard and the swap modal are full-screen fixed overlays, so a
    // banner rendered in the roster card BEHIND them would be an invisible
    // replacement for a blocking alert — strictly worse than the alert it
    // replaced. Four of the eight messages fire with an overlay open (the
    // pre-write refusal and the save failure keep the wizard open; the duty
    // refusal and the send failure keep the swap modal open), so the highest
    // open overlay claims the banner and the card takes it otherwise.
    const statusSlot = isSwapModalOpen ? 'swap' : isConfigOpen ? 'config' : 'card';
    const statusBanner = <StatusBanner status={status} onDismiss={dismissStatus} />;

    // 🧪 Did the run ON SCREEN count hours? Read off its own `load`, not off the
    // wizard's boxes, so editing the boxes after generating cannot relabel a
    // finished report — the same rule `demoRunGrades` follows for grades.
    const demoLoadHasHours = demoResult ? loadHasHours(demoResult.load) : false;

    // 🧪 WHO WAS NEVER ROSTERED, and how heavy the heaviest day got. Defect
    // D2/D3/D9's fix, and the first UI caller `measureRosterLoad` has ever had.
    //
    // ⚠️ THE DEFECT WAS DESCRIBED SLIGHTLY WRONG AND THE CORRECTION MATTERS.
    // The ledger said the engine "computes this and DISCARDS it — there is no UI
    // caller at all". True of the FUNCTION; misleading about what a roster master
    // sees. `result.load` is built `for (const person of staff)`, so a never-
    // rostered colleague was already in the load table all along — as a row
    // reading `0`. Nothing was hidden. What was missing is that a `0` among nine
    // rows does not ANNOUNCE itself, and D2/D3/D9's actual scenario — a mistyped
    // availability window quietly removing somebody — is exactly the case where
    // nobody thinks to go looking. So the fix is a callout, not a data pipe.
    //
    // The staff pool is `Object.keys(load)` rather than the wizard's rows, for the
    // same reason `demoLoadHasHours` reads the result: editing the boxes after
    // generating must not relabel a finished report.
    const demoRunMeasure = useMemo(
        () => (demoResult ? measureRosterLoad(demoResult.roster, Object.keys(demoResult.load)) : null),
        [demoResult],
    );

    return (
        <div className="md:col-span-2 bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 animate-in fade-in relative z-10">
            
            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${isDemo ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400'}`}>
                        {isDemo ? <ShieldAlert size={24} /> : <Calendar size={24} />}
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">
                            {isDemo ? 'Simulation Roster' : 'AURA Roster'}
                        </h2>
                        
                        <div className="flex items-center gap-3 mt-1">
                            {/* ♿ NAMED. Both were icon-only buttons with no accessible
                                name at all, so a screen reader announced two unlabelled
                                buttons either side of a month — and no test could reach
                                them, which is why every calendar assertion in the suite
                                was confined to the one month the view opens on. The
                                arrangements changed that: an embryology run spans nine
                                months and its handover is only visible by moving between
                                them. Additive — nothing queried these by name before,
                                because they had none. */}
                            <button
                                type="button"
                                aria-label="Previous month"
                                onClick={() => handleMonthChange(-1)}
                                className="inline-flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-2.5 sm:p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors text-slate-500"
                            >
                                <ChevronLeft size={18} />
                            </button>

                            <span className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase min-w-[140px] text-center whitespace-nowrap">
                                {currentDate.toLocaleString('default', { month: 'long' })} {year}
                            </span>

                            <button
                                type="button"
                                aria-label="Next month"
                                onClick={() => handleMonthChange(1)}
                                className="inline-flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-2.5 sm:p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors text-slate-500"
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* 📱 `flex-wrap` and `w-full`: four buttons plus a two-button group
                    is about 470px of controls, which at 375px used to push the ICS
                    button off the right-hand edge of the card. They wrap onto as many
                    lines as they need on a phone and sit on one line from `sm:` up. */}
                <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-center sm:justify-end">
                    {/* 👤 THE SAME ROSTER, TWO WAYS OF READING IT.
                        Two buttons rather than a switch, because "which one am I
                        looking at" has to be readable at a glance — `aria-pressed`
                        carries the state for a screen reader and the tint carries it
                        for everyone else. DEFAULTS TO DEPARTMENT: an existing user
                        who never presses either one sees exactly what they saw
                        before. Both are pure view changes; neither reads or writes
                        anything. */}
                    <div
                        role="group"
                        aria-label="How to show the roster"
                        className="flex rounded overflow-hidden border border-slate-200 dark:border-slate-600"
                    >
                        <button
                            type="button"
                            onClick={() => setRosterScope('department')}
                            aria-pressed={rosterScope === 'department'}
                            title="Everybody's duties, as a month grid"
                            className={`flex gap-1.5 items-center justify-center px-3 py-2 min-h-11 sm:min-h-0 font-bold text-xs transition-colors ${
                                rosterScope === 'department'
                                    ? 'bg-slate-700 text-white'
                                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }`}
                        >
                            <LayoutGrid size={14} /> Department
                        </button>
                        <button
                            type="button"
                            onClick={() => setRosterScope('person')}
                            aria-pressed={rosterScope === 'person'}
                            title="One person's duties, listed"
                            className={`flex gap-1.5 items-center justify-center px-3 py-2 min-h-11 sm:min-h-0 font-bold text-xs transition-colors ${
                                rosterScope === 'person'
                                    ? 'bg-slate-700 text-white'
                                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }`}
                        >
                            <User size={14} /> My week
                        </button>
                    </div>
                    <button onClick={() => setIsConfigOpen(true)} className={`flex gap-2 items-center justify-center px-4 py-2 ${TOUCH} rounded bg-slate-100 font-bold text-xs hover:bg-slate-200 text-slate-600 transition-colors`}>
                        <Settings size={14} /> Configure
                    </button>
                    <button onClick={() => downloadCSV(rosterData, { shortNames })} className={`flex gap-2 items-center justify-center px-4 py-2 ${TOUCH} rounded bg-green-100 text-green-700 font-bold text-xs hover:bg-green-200 transition-colors`}>
                        <FileSpreadsheet size={14} /> CSV
                    </button>
                    <button onClick={() => downloadICS(rosterData, { shortNames })} className={`flex gap-2 items-center justify-center px-4 py-2 ${TOUCH} rounded bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 shadow-lg transition-colors`}>
                        <Download size={14} /> ICS
                    </button>
                </div>
            </div>

            {statusSlot === 'card' && statusBanner}

            {/* 🛡️ M8 FIX: surface a listener failure. Without this an empty
                calendar looked exactly like "no roster generated yet". */}
            {rosterError && (
                <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <ShieldAlert size={16} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs font-bold text-red-700 dark:text-red-300 leading-relaxed">{rosterError}</p>
                </div>
            )}

            {/* 🤝 COVERAGE ASKED OF YOU — above both views, because it is about a
                shift you are being asked to take on and it is answerable from
                either one. Renders nothing at all when there is nothing pending
                and no listener error. Guarded on live mode as well: a sandbox has
                no requests (it opens no channel), and this is the second latch on
                a real colleague's request never appearing inside a simulation. */}
            {!isDemo && (
                <CoverageRequestsPanel
                    requests={visibleCoverageRequests}
                    onRespond={respondToCoverageRequest}
                    respondingId={respondingSwapId}
                    failures={swapFailures}
                    listenerError={coverageError}
                />
            )}

            {/* 👤 ONE PERSON'S DUTIES, instead of the grid. Same data, same month,
                same object in memory — see `PersonRosterPanel`. The pool is passed
                only in the sandbox: live mode's person is the signed-in user, so
                there is no picker and no `<select>` anywhere in it. */}
            {rosterScope === 'person' && (
                <PersonRosterPanel
                    person={myWeekPerson}
                    people={isDemo ? config.staff : null}
                    onPersonChange={setDemoPersonChoice}
                    monthLabel={visibleMonthLabel}
                    duties={myWeek.duties}
                    totalHours={myWeek.totalHours}
                    hasRoster={Object.keys(rosterData).length > 0}
                />
            )}

            {/* CALENDAR GRID
                📱 SEVEN COLUMNS BECOME ONE BELOW `sm:`, AND THE REASONING MATTERS.
                At 375px a seven-column month grid gives each day about 48px of width.
                The cells already render at 9px with a 90px inner scroller, and 48px is
                not enough for "EFT" and "Lead: Fadzlynn, Co: Derlinder" at any size a
                person can read — shrinking further is not a fix, it is the same
                unreadable grid with smaller type. So below `sm:` the month lays out as
                a LIST: one full-width row per day, in date order, each naming its own
                weekday because the column headings it used to get that from are no
                longer on screen.

                NOTHING IS HIDDEN AND NOTHING IS ADDED. The same shifts, the same
                "not staffed" markers, the same days — including the empty ones, which
                are the days somebody is checking when they ask "am I off on the 12th".
                The leading blanks before the 1st are the one exception: they exist only
                to align a date under a weekday column, and with one column there is no
                column to align to.

                IS A ONE-PERSON LIST THE BETTER MOBILE DEFAULT? Honestly, yes — "My
                week" is the view a clinician on a phone actually wants, and the grid is
                a desktop affordance for whoever is building the roster. But changing
                which view opens by default is a BEHAVIOUR change, not a layout one, and
                an existing user who never pressed either button would find a different
                screen than the one they left. So the grid stays the default and stays
                readable; the recommendation is in the report, not in this commit. */}
            {rosterScope === 'department' && (
            <div className="grid grid-cols-1 sm:grid-cols-7 gap-px bg-slate-200 dark:bg-slate-700 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                {WEEKDAY_HEADINGS.map(d => (
                    <div key={d} className="hidden sm:block bg-slate-50 dark:bg-slate-800 p-2 text-center text-xs font-bold text-slate-400 uppercase">
                        {d}
                    </div>
                ))}

                {Array.from({ length: firstDayIndex }).map((_, i) => (
                    <div key={`empty-${i}`} className="hidden sm:block bg-white dark:bg-slate-900 h-32" />
                ))}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const { shifts, dateKey } = getShifts(day);
                    
                    return (
                        // `data-date` is a TEST HOOK, and a deliberate one: "the
                        // slot that could not be staffed is rendered in the day it is
                        // missing from" is a claim about WHICH square, and a test that
                        // cannot name the square can only check that the words exist
                        // somewhere on the page.
                        <div key={day} data-date={dateKey} className="bg-white dark:bg-slate-900 min-h-14 sm:min-h-0 sm:h-32 p-2 sm:p-1 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors relative group border-t border-l border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                            {/* The date. In the grid it is the small number tucked into
                                the top-right corner of the square; in the one-column list
                                it is the row's heading and carries the weekday the column
                                header used to supply. The number itself is one text node
                                either way — the weekday is a sibling that disappears from
                                `sm:` up, not a second copy of the date. */}
                            <span className="flex items-baseline gap-1.5 text-xs font-bold text-slate-400 sm:absolute sm:top-1 sm:right-2 sm:gap-0">
                                <span className="sm:hidden uppercase tracking-wider">
                                    {WEEKDAY_HEADINGS[(firstDayIndex + i) % 7]}
                                </span>
                                <span>{day}</span>
                            </span>

                            {/* No inner scroller on a phone: a 90px window inside a
                                48px-wide column was two scrollbars deep. The row grows to
                                whatever the day holds instead, and the page scrolls. */}
                            <div className="mt-1 sm:mt-5 flex flex-col gap-1 sm:overflow-y-auto sm:max-h-[90px] custom-scrollbar">
                                {shifts.map((s, idx) => {
                                    // 🌟 UPDATED: Checks both Lead and Co-Lead safely
                                    const isMyShift = isDemo ? true : (s.lead === user?.name || s.coLead === user?.name || s.staff === user?.name);

                                    // 🧪 MULTI-SLOT: everybody on the shift who is not
                                    // already in the display string. `shift.staff` is
                                    // `buildShiftStaffLabel(lead, coLead)` — a TWO-name
                                    // string by contract, pinned byte-exact by 23
                                    // characterization tests and written into live
                                    // documents — so a trio's third member had nowhere
                                    // to appear and vanished from the calendar (audit
                                    // D2). This adds a second line for the rest rather
                                    // than rebuilding the first: `staff` keeps exactly
                                    // one definition, and a one- or two-person shift
                                    // renders byte-for-byte what it always did, because
                                    // this list is then empty.
                                    //
                                    // Filtered by IDENTITY against lead/coLead rather
                                    // than by `slice(2)`: the engine documents
                                    // `assignees` as lead-first, and an ordering
                                    // assumption is exactly what A4 was.
                                    const alsoOnShift = Array.isArray(s.assignees)
                                        ? s.assignees.filter(
                                            (name) => typeof name === 'string'
                                                && name !== ''
                                                && name !== s.lead
                                                && name !== s.coLead,
                                        )
                                        : [];

                                    // 🤝 SOMEBODY HAS ASKED YOU TO COVER THIS ONE.
                                    // The badge is a marker, not a control: the
                                    // answer is one tap in the card above, which is
                                    // reachable by keyboard and by screen reader.
                                    // This cell's button is disabled for a shift you
                                    // are not on (which a request to cover is, by
                                    // definition), so putting the Accept here would
                                    // put it on a control the browser will not focus.
                                    const coverAsks = coverageRequestsForShift(visibleCoverageRequests, dateKey, s);

                                    return (
                                        <button 
                                            key={idx} 
                                            onClick={() => handleShiftClick(s, dateKey)}
                                            disabled={!isMyShift && user?.role !== 'admin'}
                                            className={`text-left text-xs sm:text-[9px] font-bold px-2 py-2 sm:px-1.5 sm:py-1 ${TOUCH} rounded flex flex-col leading-tight shadow-sm transition-transform ${
                                                isMyShift || user?.role === 'admin' ? 'cursor-pointer hover:scale-[1.02] ring-1 ring-inset ring-transparent hover:ring-indigo-400' : 'cursor-default opacity-80'
                                            } ${
                                                // The owner's palette first — Management yellow, Clinical
                                                // brown, Research limegreen, Education orange — from the ONE
                                                // map the ICS export also reads, so the calendar and the file
                                                // a colleague imports cannot disagree. Then the live team's
                                                // long-standing VC orange, byte-identical; then the default.
                                                categoryChipClass(s.category) ?? (
                                                    s.category === 'VC' ? 'bg-orange-50 text-orange-800 border border-orange-100 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800/50' :
                                                    'bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50'
                                                )
                                            }`}
                                        >
                                            <span className="uppercase tracking-tighter opacity-80">{s.task}</span>
                                            <span className={`text-slate-800 dark:text-slate-200 ${isMyShift ? 'text-indigo-600 dark:text-indigo-400 font-black' : ''}`}>
                                                {shiftStaffDisplay(s, shortNames)}
                                            </span>
                                            {/* The same `Also:` wording the ICS export
                                                uses for three or more people, so the
                                                calendar and the downloaded file describe
                                                one shift the same way. Echoed rather than
                                                shared: the exporter's version is private
                                                to `auraEngine` and this one is two lines
                                                in a 9px cell, not one string. */}
                                            {alsoOnShift.length > 0 && (
                                                <span className="text-slate-800 dark:text-slate-200">
                                                    Also: {alsoOnShift.map((name) => displayNameFor(name, shortNames)).join(', ')}
                                                </span>
                                            )}
                                            {coverAsks.length > 0 && (
                                                <span
                                                    data-coverage-badge={dateKey}
                                                    title={`${coverAsks.map((ask) => ask.requestedBy).filter(Boolean).join(', ') || 'A colleague'} asked you to cover this shift. Answer it in "Cover asked of you", above the calendar.`}
                                                    className="mt-0.5 self-start px-1.5 py-0.5 sm:px-1 sm:py-px rounded border border-amber-400 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700 text-[10px] sm:text-[8px] font-black uppercase tracking-wide"
                                                >
                                                    Cover asked of you
                                                </span>
                                            )}
                                        </button>
                                    )
                                })}

                                {/* 🧪 WHAT THIS DAY COULD NOT STAFF, IN THE DAY IT IS
                                    MISSING FROM.
                                    The engine's honesty used to live only in a list
                                    under the grid, which meant the calendar — the
                                    thing people actually read — showed a fully failed
                                    day as an empty square, indistinguishable from a
                                    day nothing was configured for. These come from
                                    `unfilled`, not from `roster`, precisely because a
                                    fully failed day has no roster key at all.

                                    NOT A BUTTON, and that is deliberate twice over:
                                    there is nothing to swap on a duty nobody holds,
                                    and a button here would make this absence look
                                    like an assignment. Dashed, muted, and it says
                                    "not staffed" in words rather than relying on the
                                    border. Focusable so a keyboard user reaches the
                                    reason, which is carried on `title` (hover) and in
                                    `aria-label` (screen readers) — the engine's own
                                    sentence, verbatim, naming the constraint that
                                    bound. The printable list below keeps every
                                    reason as text. */}
                                {(unfilledByDate[dateKey] || []).map((slot, gapIdx) => {
                                    const duty = describeUnfilledRole(slot.role);
                                    return (
                                        <div
                                            key={`gap-${slot.task}-${slot.role}-${gapIdx}`}
                                            role="note"
                                            tabIndex={0}
                                            aria-label={`Not staffed: ${slot.task}, ${duty}, ${formatRosterDateKey(slot.date)}. ${slot.reason}`}
                                            title={`Not staffed — ${duty}: ${slot.reason}`}
                                            className={`text-left text-xs sm:text-[9px] font-bold px-2 py-2 sm:px-1.5 sm:py-1 ${TOUCH} rounded flex flex-col leading-tight border border-dashed border-slate-400 dark:border-slate-500 bg-transparent text-slate-500 dark:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-500`}
                                        >
                                            <span className="uppercase tracking-tighter">
                                                {`${slot.task} · not staffed`}
                                            </span>
                                            <span className="italic normal-case">
                                                {`${duty}, no one assigned`}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
            )}

            {/* --- 🧪 SANDBOX REPORT: WHAT THE ENGINE KNEW ----------------------
                Requirement 4. `generateRosterV2` returns far more than a roster —
                the Monday it actually started from, the per-person load, the
                warnings it raised before filling a single slot, and every slot it
                could NOT fill with the constraint that bound. A calendar alone
                throws all of that away, and the last one matters most: a day on
                which every slot failed produces no roster key at all, so an empty
                square is indistinguishable from a day nothing was configured for.
                This panel is the difference.

                DELIBERATELY ABSENT: `score.softPenalty`. It is unnormalised and
                not comparable across differently-shaped configurations — a
                20-staff/4-task run scores 160 while a genuinely overloaded
                6-staff/10-task run scores 19.83 — so shown as a headline it would
                say the opposite of the truth. `score.hardViolations` IS shown:
                that one is measured by re-auditing the finished roster, and 0 is a
                claim the engine checked rather than asserted. */}
            {isDemo && (
                <div className="mt-6 space-y-4">

                    {/* Requirement 6 — the no-persistence property, on screen. */}
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                        <FlaskConical size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 leading-relaxed">
                            Sandbox mode. Nothing is saved — closing or reloading this page clears everything.
                            This roster is generated in your browser by the same engine the live department uses;
                            it is never written to the live roster, and the live roster is never read here.
                        </p>
                    </div>

                    {/* 🧪 WHOSE ROSTER THIS IS, AND WHOSE STRUCTURE IT BORROWED — and it
                        is here rather than only in the wizard for one reason: the wizard is
                        a modal and it closes the moment the roster is drafted. What the room
                        then looks at is a finished roster, and if the only place that said
                        "this structure came from the physiotherapists, adapt it" was the
                        panel that just disappeared, a borrowed shape would quietly become
                        "our roster".

                        WAS AN AMBER WARNING PANEL, rendered from a `correction` block, and
                        it went with the six invented arrangements it existed to apologise
                        for. Nothing in the picker now claims to be a service it is not, so
                        there is nothing to disclaim — this states two facts instead: the
                        profession the visitor chose (or nothing, if they did not) and the
                        team whose structure the shape came from. Rendered from the loaded
                        shape's own `attribution`, so it appears for whichever shape declares
                        one and for no other, and never for a team who typed their own roster
                        in, where naming somebody else's profession would be a false
                        statement about their own data.

                        It sits ABOVE the run summary on purpose. Reading order is the
                        claim: what this roster IS comes before how many shifts it holds. */}
                    {demoShape?.attribution && (
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700">
                            <ShieldAlert size={16} className="text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                                    {demoProfession
                                        ? `${demoProfession.qualifiedName} — ${demoShape.name}`
                                        : `${demoShape.name} — a starting point, not a finished service`}
                                </p>
                                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mt-1">
                                    {demoShape.attribution}
                                </p>
                            </div>
                        </div>
                    )}

                    {!demoResult && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            No sandbox roster yet. Open <span className="font-bold">Configure</span>, fill in the
                            staff and task tables (or load one of the example arrangements) and press{' '}
                            <span className="font-bold">Draft roster</span>. The calendar above is
                            empty because nothing has been generated — not because a roster failed.
                        </p>
                    )}

                    {demoResult && (
                        <>
                            {/* --- run summary --- */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Roster starts</p>
                                    <p className="text-sm font-black text-slate-800 dark:text-white">{demoResult.effectiveStart}</p>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{formatRosterDateKey(demoResult.effectiveStart)}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Days scheduled</p>
                                    <p className="text-sm font-black text-slate-800 dark:text-white">{Object.keys(demoResult.roster).length}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Shifts</p>
                                    <p className="text-sm font-black text-slate-800 dark:text-white">
                                        {Object.values(demoResult.roster).reduce((sum, shifts) => sum + shifts.length, 0)}
                                    </p>
                                </div>
                                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                                    {/* `hardViolations` is the engine's field name and it
                                        is not English. What it counts is rules this
                                        roster breaks — somebody double-booked, on leave,
                                        out of band, over their hours — so that is what
                                        the tile says. The number is unchanged, and so is
                                        the reason it can be trusted: it is measured by
                                        re-reading the finished roster, not asserted. */}
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Rules broken</p>
                                    <p className="text-sm font-black text-slate-800 dark:text-white">{demoResult.score.hardViolations}</p>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400">checked by re-reading the roster</p>
                                </div>
                            </div>

                            {/* --- warnings ---
                                THE COUNT IN THE HEADING IS WHAT THIS BLOCK LISTS, not the
                                engine's total, because the unmet quota floors are pulled
                                out into their own block below. Any difference is stated
                                on the next line rather than left as an unexplained
                                number — a partition that loses a warning, or a count
                                that does not match the list under it, is exactly the
                                class of quiet dishonesty this panel exists to prevent.
                                `partitionDemoWarnings` is a partition and its own tests
                                assert that nothing falls out of it. */}
                            {demoWarnings.others.length > 0 && (
                                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                                    <p className="text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest mb-2">
                                        Warnings ({demoWarnings.others.length})
                                    </p>
                                    <ul className="space-y-1">
                                        {demoWarnings.others.map((warning, idx) => (
                                            <li key={idx} className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed flex items-start gap-1.5">
                                                <ShieldAlert size={13} className="shrink-0 mt-0.5" />
                                                <span>{warning}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    {demoWarnings.quotaFloors.length > 0 && (
                                        <p className="mt-2 text-[10px] text-amber-700/90 dark:text-amber-400/90 leading-relaxed">
                                            {demoWarnings.quotaFloors.length === 1
                                                ? 'One more warning is listed under Per-person minimums below.'
                                                : `${demoWarnings.quotaFloors.length} more warnings are listed under Per-person minimums below.`}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* --- unmet per-person minimums (quota FLOORS) ------------
                                Its own block, in its own words, because the engine's
                                sentence is right and reads wrong: a floor is a
                                PREFERENCE the engine could not fully honour, not a
                                constraint it broke. Nothing here is a rule violation —
                                `score.hardViolations` is still 0 — and a roster master
                                who reads it as one will go looking for a bug instead of
                                revisiting the policy or the pool. */}
                            {demoWarnings.quotaFloors.length > 0 && (
                                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                                    <p className="text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest mb-2">
                                        Per-person minimums not met ({demoWarnings.quotaFloors.length})
                                    </p>
                                    <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed mb-2">
                                        A minimum is a <span className="font-bold">preference, not a promise</span>.
                                        AURA gave these duties to whoever was behind whenever it could, and this is
                                        what was left over — a floor cannot be met by inventing capacity. Nothing
                                        below is a rule this roster breaks. To close the gap, add dates, add people
                                        to each date, or lower the minimum under{' '}
                                        <span className="font-bold">More…</span> on the task.
                                    </p>
                                    <ul className="space-y-1">
                                        {demoWarnings.quotaFloors.map((warning, idx) => (
                                            <li key={idx} className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed flex items-start gap-1.5">
                                                <ShieldAlert size={13} className="shrink-0 mt-0.5" />
                                                <span>{warning}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* --- unfilled slots: the selling point ------------------
                                Software that says what it could not staff, instead of
                                quietly double-booking somebody, is the whole pitch. It
                                goes ABOVE the load table for that reason. */}
                            <div className={`p-3 rounded-xl border ${
                                demoResult.unfilled.length > 0
                                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                            }`}>
                                <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${
                                    demoResult.unfilled.length > 0 ? 'text-red-700 dark:text-red-400' : 'text-slate-400'
                                }`}>
                                    Could not be staffed ({demoResult.unfilled.length})
                                </p>

                                {demoResult.unfilled.length === 0 ? (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                        Every slot in this run was filled within the constraints — no clinician was
                                        assigned past their daily limit, outside their skill set, or on a day they
                                        were on leave.
                                    </p>
                                ) : (
                                    <>
                                        {/* WHY, IN PLAIN LANGUAGE, FOR THE TWO CAUSES A
                                            READER CANNOT SEE IN THE TABLES.
                                            Every reason below is already the engine's own
                                            complete sentence, and two of them describe a
                                            state that is invisible in the staff table: the
                                            people are there, nobody is on leave, and they
                                            are still not eligible. This is the one line
                                            that says so before the list rather than
                                            leaving it to be inferred from "3 outside their
                                            cohort window".
                                            THE TWO FIGURES ARE NOT A PARTITION OF THE
                                            TOTAL and are deliberately not presented as
                                            one: a single slot can be short of candidates
                                            for both reasons at once, so they are stated as
                                            "N of these" rather than summed. */}
                                        {(demoUnfilledCauses.windowBlocked > 0 || demoUnfilledCauses.quotaBlocked > 0) && (
                                            <div className="mb-2 space-y-1">
                                                {demoUnfilledCauses.windowBlocked > 0 && (
                                                    <p className="text-xs font-bold text-red-800 dark:text-red-300 leading-relaxed">
                                                        {demoUnfilledCauses.windowBlocked === 1
                                                            ? 'One of these is a date nobody\'s availability window covers'
                                                            : `${demoUnfilledCauses.windowBlocked} of these are dates nobody's availability window covers`}
                                                        {' — '}
                                                        the people are in the pool and not on leave, they are simply outside
                                                        the block of dates they were given. Widen a window under{' '}
                                                        <span className="font-bold">More…</span> in the staff table, move the
                                                        run, or change when the task happens.
                                                    </p>
                                                )}
                                                {demoUnfilledCauses.quotaBlocked > 0 && (
                                                    <p className="text-xs font-bold text-red-800 dark:text-red-300 leading-relaxed">
                                                        {demoUnfilledCauses.quotaBlocked === 1
                                                            ? 'One of these is a per-person maximum being enforced'
                                                            : `${demoUnfilledCauses.quotaBlocked} of these are a per-person maximum being enforced`}
                                                        {' — '}
                                                        everybody who could take the duty has already had as many as you
                                                        allowed them. Raise the maximum under{' '}
                                                        <span className="font-bold">More…</span> on the task, or add somebody
                                                        who can share it.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                        <ul className="space-y-1.5">
                                            {demoResult.unfilled.slice(0, DEMO_UNFILLED_PREVIEW).map((slot, idx) => (
                                                <li key={`${slot.date}-${slot.task}-${slot.role}-${idx}`} className="text-xs text-red-800 dark:text-red-300 leading-relaxed">
                                                    <span className="font-black">{slot.date}</span>
                                                    {' · '}
                                                    <span className="font-bold">{slot.task}</span>
                                                    {' · '}
                                                    <span className="uppercase">{describeUnfilledRole(slot.role)}</span>
                                                    <span className="block text-red-700/80 dark:text-red-400/80">{slot.reason}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        {demoResult.unfilled.length > DEMO_UNFILLED_PREVIEW && (
                                            <p className="text-xs font-bold text-red-700 dark:text-red-400 mt-2">
                                                …and {demoResult.unfilled.length - DEMO_UNFILLED_PREVIEW} more.
                                            </p>
                                        )}
                                        <p className="text-[10px] text-red-700/80 dark:text-red-400/80 mt-2 leading-relaxed">
                                            Every one of these is also marked in the calendar above, in the day it is
                                            missing from — including a day where nothing at all could be staffed, which
                                            has no shifts of its own to show. This list is the printable summary. AURA
                                            leaves the duty unstaffed and names the constraint that bound rather than
                                            assigning somebody who is unqualified, on leave, or already at their limit.
                                        </p>
                                    </>
                                )}
                            </div>

                            {/* --- who was never rostered (defect D2/D3/D9) ---
                                AMBER, NOT RED, AND THE COLOUR IS THE ARGUMENT. An
                                unstaffed slot is a failure: work nobody can do.
                                Nobody rostered is a QUESTION — it is correct when
                                somebody is genuinely not part of this rota (the
                                respiratory shape's three below-floor staff are
                                exactly that, and the roster is right), and a silent
                                disaster when it is a mistyped leave date. The panel
                                cannot tell which, so it must not pretend to: it
                                names the people and names the four things that
                                cause it, and lets the roster master decide.

                                It sits BELOW "could not be staffed" and ABOVE the
                                load table on purpose — that is the order the two
                                failures matter in, and it puts the callout next to
                                the `0` in the table it is drawing attention to. */}
                            {demoRunMeasure && (
                                <div className={`p-3 rounded-xl border ${
                                    demoRunMeasure.neverRostered.length > 0
                                        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                                        : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                                }`}>
                                    <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${
                                        demoRunMeasure.neverRostered.length > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-400'
                                    }`}>
                                        Never rostered ({demoRunMeasure.neverRostered.length})
                                    </p>

                                    {demoRunMeasure.neverRostered.length === 0 ? (
                                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                            Everybody in the staff pool holds at least one duty in this run.
                                        </p>
                                    ) : (
                                        <>
                                            <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                                                <span className="font-bold">{demoRunMeasure.neverRostered.join(', ')}</span>
                                                {demoRunMeasure.neverRostered.length === 1 ? ' holds' : ' hold'} no duty at all —
                                                the other colleagues absorbed the work, so nothing looks wrong on the calendar.
                                            </p>
                                            <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80 mt-2 leading-relaxed">
                                                That is <span className="font-bold">correct</span> if they are not part of this
                                                rota. If it is a surprise, the cause is almost always one of four things: a
                                                <span className="font-bold"> grade</span> outside every task&apos;s band gate, a
                                                missing <span className="font-bold">skill</span> a task requires,
                                                <span className="font-bold"> unavailable dates</span> covering the run, or an
                                                availability <span className="font-bold">window</span> that falls outside it.
                                                Their row in the table below reads 0.
                                            </p>
                                        </>
                                    )}

                                    {/* The other two figures `measureRosterLoad` returns, which
                                        had no reader either. The busiest day is the sentence a
                                        roster master actually checks a draft against. */}
                                    {demoRunMeasure.busiestDay && (
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
                                            Heaviest single day: <span className="font-bold">{demoRunMeasure.busiestDay}</span>
                                            {' '}({demoRunMeasure.maxDutiesPerPersonPerDay}{' '}
                                            {demoRunMeasure.maxDutiesPerPersonPerDay === 1 ? 'duty' : 'duties'}).
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* --- per-person load --- */}
                            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                    <Users size={13} /> Load per person
                                </p>
                                {/* No horizontal scroller below `sm:`: the rows are cards
                                    there, so there is nothing to scroll sideways. */}
                                <div className="sm:overflow-x-auto">
                                    <table className="w-full text-xs block sm:table">
                                        <thead className="hidden sm:table-header-group">
                                            <tr className="text-left text-slate-400">
                                                <th className="font-bold uppercase text-[10px] py-1 pr-3">{LOAD_HEADINGS.name}</th>
                                                <th className="font-bold uppercase text-[10px] py-1 pr-3">{LOAD_HEADINGS.grade}</th>
                                                <th className="font-bold uppercase text-[10px] py-1 pr-3">{LOAD_HEADINGS.band}</th>
                                                <th className="font-bold uppercase text-[10px] py-1 pr-3">{LOAD_HEADINGS.fte}</th>
                                                <th className="font-bold uppercase text-[10px] py-1 pr-3">{LOAD_HEADINGS.duties}</th>
                                                {/* Only when this run counted hours. A
                                                    duties-only run reads exactly the
                                                    table it has always read — the engine
                                                    omits the three fields, so inventing
                                                    columns of dashes for them would be
                                                    reporting a policy nobody set. */}
                                                {demoLoadHasHours && (
                                                    <>
                                                        <th className="font-bold uppercase text-[10px] py-1 pr-3">{LOAD_HEADINGS.hours}</th>
                                                        <th className="font-bold uppercase text-[10px] py-1 pr-3">{LOAD_HEADINGS.peak}</th>
                                                        <th className="font-bold uppercase text-[10px] py-1 pr-3">{LOAD_HEADINGS.cap}</th>
                                                    </>
                                                )}
                                                <th className="font-bold uppercase text-[10px] py-1 pr-3">{LOAD_HEADINGS.perFte}</th>
                                                <th className="font-bold uppercase text-[10px] py-1">{LOAD_HEADINGS.share}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="block sm:table-row-group">
                                            {Object.entries(demoResult.load).map(([name, entry]) => (
                                                <tr
                                                    key={name}
                                                    className="block sm:table-row border-t border-slate-200 dark:border-slate-700 py-2 sm:py-0"
                                                >
                                                    {/* The name is the card's HEADING on a phone, so it
                                                        is the one cell with no label above it — printing
                                                        "NAME" over somebody's name reads as a form field
                                                        rather than as the row it belongs to. */}
                                                    <td className="block sm:table-cell py-1 pr-3 font-bold text-slate-700 dark:text-slate-200">{name}</td>
                                                    {/* Requirement 6: the grade this run used, and the
                                                        band it resolved to under that run's boundaries.
                                                        "Not recorded" is said in words rather than left
                                                        blank — a blank cell reads as a rendering bug,
                                                        and "no grade" is a fact with consequences (it
                                                        bars this person from every band-gated lead). */}
                                                    <LoadCell label={LOAD_HEADINGS.grade} className="py-1 pr-3 text-slate-500 dark:text-slate-400">
                                                        {demoRunGrades[name]?.grade || <span className="italic">not recorded</span>}
                                                    </LoadCell>
                                                    <LoadCell label={LOAD_HEADINGS.band} className="py-1 pr-3 text-slate-500 dark:text-slate-400">
                                                        {demoRunGrades[name]?.band
                                                            ? bandLabel(demoRunGrades[name].band)
                                                            : <span className="italic">—</span>}
                                                    </LoadCell>
                                                    {/* The FTE, and what it MEANS. "0.6" is the
                                                        number the engine weighs fairness with;
                                                        "works 3 days a week" is the same fact in
                                                        the words the person whose contract it is
                                                        would use. Computed from the days a week
                                                        THIS RUN's tasks were ticked for, so a
                                                        department that runs Saturdays is not told
                                                        a five-day answer. Both are shown: the
                                                        number is what a payroll record holds and
                                                        what Per FTE is computed from. */}
                                                    <LoadCell label={LOAD_HEADINGS.fte} className="py-1 pr-3 text-slate-500 dark:text-slate-400">
                                                        <span className="block">{entry.fte}</span>
                                                        {describeFteAsDays(entry.fte, demoRunWorkingDays) !== '' && (
                                                            <span className="block text-[10px] text-slate-400">
                                                                {describeFteAsDays(entry.fte, demoRunWorkingDays)}
                                                            </span>
                                                        )}
                                                    </LoadCell>
                                                    <LoadCell label={LOAD_HEADINGS.duties} className="py-1 pr-3 font-black text-slate-800 dark:text-white">{entry.duties}</LoadCell>
                                                    {demoLoadHasHours && (
                                                        <>
                                                            <LoadCell label={LOAD_HEADINGS.hours} className="py-1 pr-3 font-black text-slate-800 dark:text-white tabular-nums">
                                                                {typeof entry.hours === 'number' ? `${entry.hours}h` : '—'}
                                                            </LoadCell>
                                                            {/* THE CAP BINDS A WEEK, NOT A RUN,
                                                                so the number to compare against it
                                                                is the busiest single week — a
                                                                4-week total of 100h says nothing
                                                                about whether anybody hit 42. At
                                                                the cap it is coloured and titled;
                                                                nothing here invents a "nearly"
                                                                threshold, because the engine has
                                                                no such notion and a made-up one
                                                                would be this panel's opinion
                                                                dressed as the engine's. */}
                                                            {(() => {
                                                                const peak = peakWeekHours(entry);
                                                                const cap = typeof entry.weeklyCap === 'number' ? entry.weeklyCap : null;
                                                                const atCap = cap !== null && peak >= cap;
                                                                return (
                                                                    <LoadCell
                                                                        label={LOAD_HEADINGS.peak}
                                                                        className={`py-1 pr-3 tabular-nums ${atCap
                                                                            ? 'font-black text-amber-700 dark:text-amber-400'
                                                                            : 'text-slate-500 dark:text-slate-400'}`}
                                                                        title={atCap
                                                                            ? `${name} is at their weekly hours limit in the busiest week of this run — AURA will not add another duty to that week.`
                                                                            : undefined}
                                                                    >
                                                                        {`${peak}h`}
                                                                    </LoadCell>
                                                                );
                                                            })()}
                                                            <LoadCell label={LOAD_HEADINGS.cap} className="py-1 pr-3 text-slate-500 dark:text-slate-400 tabular-nums">
                                                                {typeof entry.weeklyCap === 'number' ? `${entry.weeklyCap}h` : '—'}
                                                            </LoadCell>
                                                        </>
                                                    )}
                                                    <LoadCell label={LOAD_HEADINGS.perFte} className="py-1 pr-3 text-slate-500 dark:text-slate-400">{entry.weighted}</LoadCell>
                                                    <LoadCell label={LOAD_HEADINGS.share} className="py-1 text-slate-500 dark:text-slate-400">{Math.round(entry.share * 100)}%</LoadCell>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                                    <span className="font-bold">Per FTE</span> is duties ÷ FTE: it is the column that
                                    shows a 0.6 FTE colleague carrying a fair share rather than an equal one.
                                </p>
                                {demoRunWorkingDays > 0 && (
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                        The days-a-week line under each FTE is that figure spread over the{' '}
                                        <span className="font-bold">{demoRunWorkingDays}</span>{' '}
                                        {demoRunWorkingDays === 1 ? 'day' : 'days'} a week this run&apos;s tasks were
                                        rostered on — not an assumed five-day week.
                                    </p>
                                )}
                                {demoLoadHasHours && (
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                        <span className="font-bold">Busiest week</span> is the heaviest single week of
                                        this run, which is what the <span className="font-bold">weekly cap</span>
                                        {' '}(the contracted week, scaled by FTE) actually limits — an amber figure is
                                        somebody AURA will not add another duty to that week. Fairness itself is still
                                        shared out in <span className="font-bold">duties</span>, not hours, so one
                                        person can hold the long sessions and another the short ones and the duty
                                        columns will call that even.
                                    </p>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* --- MODAL: SWAP REQUEST --- */}
            {isSwapModalOpen && selectedShift && createPortal(
                <div data-overlay="swap-modal" className="fixed inset-0 z-[120] flex items-stretch sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsSwapModalOpen(false)}></div>
                    <div className="relative bg-white dark:bg-slate-900 w-full max-w-full sm:max-w-md h-full sm:h-auto overflow-y-auto sm:overflow-hidden rounded-none sm:rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 border-0 sm:border sm:border-slate-200 sm:dark:border-slate-700">
                        
                        <div className="bg-gradient-to-r from-indigo-500 to-purple-500 p-4 pt-[max(1rem,env(safe-area-inset-top))] sm:pt-4 flex justify-between items-center text-white">
                            <div className="flex items-center gap-2">
                                <ArrowRightLeft size={18} />
                                {/* Plain language, and the same words the button
                                    below and the recipient's card use: you are
                                    asking a colleague to cover, not filing a
                                    "shift swap request" with a system. */}
                                <h3 className="text-sm font-black uppercase tracking-wider">Ask someone to cover</h3>
                            </div>
                            <button onClick={() => setIsSwapModalOpen(false)} aria-label="Close" className="inline-flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 hover:bg-white/20 p-2.5 sm:p-1 rounded-full transition-colors">
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={submitSwapRequest} className="p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-6">
                            {statusSlot === 'swap' && statusBanner}

                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 mb-6">
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">
                                    {/* 🛡️ M11: an admin is almost never looking at their
                                        own shift here, and calling it "Your Shift" is
                                        exactly the misreading that has to be impossible. */}
                                    {swapSubject?.holdsShift ? 'Your Shift to Swap' : 'Shift to Reassign'}
                                </p>
                                <p className="text-sm font-black text-slate-800 dark:text-white mb-1">{selectedShift.date}</p>
                                <div className="flex gap-2 items-center">
                                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400">{selectedShift.task}</span>
                                    <span className="text-xs text-slate-500 font-medium">currently assigned to {selectedShift.staff}</span>
                                </div>

                                {/* 🛡️ A3 + M11: name the duty being handed over AND the
                                    person it is being taken from. The colleague who
                                    accepts takes over exactly this role — no promotion,
                                    and nobody else's duty changes. */}
                                {swapSubject?.holdsShift && (
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                                        You hold this shift as{' '}
                                        <span className="font-black text-indigo-600 dark:text-indigo-400 uppercase">{describeShiftRole(swapSubject.swapRole)}</span>
                                        {' '}— that is the duty your colleague would take over.
                                    </p>
                                )}

                                {swapSubject?.onBehalf && (
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                                        Arranging cover on behalf of{' '}
                                        <span className="font-black text-indigo-600 dark:text-indigo-400">{swapSubject.requestedBy}</span>
                                        {' '}(<span className="font-black text-indigo-600 dark:text-indigo-400 uppercase">{describeShiftRole(swapSubject.swapRole)}</span>).
                                        {' '}This is not your shift — {swapSubject.requestedBy} is the person being swapped out, and the request will be
                                        recorded as arranged by you.
                                    </p>
                                )}

                                {swapSubject && !swapSubject.ok && (
                                    <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-2 flex items-start gap-1.5">
                                        <ShieldAlert size={13} className="shrink-0 mt-px" />
                                        <span>{swapSubject.reason}</span>
                                    </p>
                                )}
                            </div>

                            <div className="space-y-4 mb-6">
                                {/* 🛡️ M11: the duty picker. Rendered only when the acting
                                    user is NOT on the shift and it has more than one
                                    person on it — a single-holder (or legacy) shift has
                                    nothing to choose, so `resolveSwapSubject` selects it
                                    and the banner above simply states it. */}
                                {swapSubject && !swapSubject.holdsShift && swapSubject.assignableRoles.length > 1 && (
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1 block">Whose Duty Are You Reassigning?</label>
                                        <select
                                            required
                                            value={swapRoleChoice}
                                            onChange={(e) => setSwapRoleChoice(e.target.value)}
                                            className={`w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-3 ${FIELD_TEXT_SM} ${TOUCH} font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none`}
                                        >
                                            <option value="" disabled>Select a duty...</option>
                                            {swapSubject.assignableRoles.map(({ role, holder }) => (
                                                <option key={role} value={role}>
                                                    {describeShiftRole(role)} — {holder}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div>
                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1 block">Request Coverage From:</label>
                                    <select 
                                        required
                                        value={swapTargetStaff}
                                        onChange={(e) => setSwapTargetStaff(e.target.value)}
                                        className={`w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-3 ${FIELD_TEXT_SM} ${TOUCH} font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none`}
                                    >
                                        <option value="" disabled>Select a Colleague...</option>
                                        {/* 🛡️ A4 FIX: this was
                                            `.filter(name => !selectedShift.staff?.includes(name))`
                                            — a SUBSTRING test against the composite
                                            display string "Lead: X, Co: Y". It happened
                                            to work only because no current name is a
                                            substring of another: a "Lynn" silently
                                            disappeared from this dropdown whenever
                                            "Fadzlynn" was on the shift, and could never
                                            be asked to cover. Now an identity comparison
                                            against the shift's lead/coLead. */}
                                        {filterSwapCandidates(config.staff, selectedShift).map(colleague => (
                                            <option key={colleague} value={colleague}>{colleague}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1 block">Reason (Optional):</label>
                                    <textarea 
                                        value={swapReason}
                                        onChange={(e) => setSwapReason(e.target.value)}
                                        placeholder="e.g. Attending a medical conference..."
                                        className={`w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-3 ${FIELD_TEXT_SM} text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none h-20 resize-none`}
                                    />
                                </div>
                            </div>

                            {/* 🛡️ M11: a request AURA already knows it cannot apply is
                                not submittable. `title` carries the reason for the
                                disabled state, as the Generate button does. */}
                            <button
                                type="submit"
                                disabled={isSubmitting || !swapSubject?.ok}
                                title={swapSubject?.ok ? undefined : swapSubject?.reason}
                                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-widest rounded-xl transition-colors shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2"
                            >
                                <ArrowRightLeft size={16} />
                                {/* The button says who is being asked, so the last
                                    thing read before the tap is the actual outcome.
                                    The on-behalf wording stays "arrange cover"
                                    because an admin is not asking for themselves —
                                    M11's distinction, kept in the copy. */}
                                {isSubmitting
                                    ? 'Sending…'
                                    : (swapSubject?.onBehalf
                                        ? (swapTargetStaff ? `Arrange cover with ${swapTargetStaff}` : 'Arrange cover')
                                        : (swapTargetStaff ? `Ask ${swapTargetStaff} to cover` : 'Ask someone to cover'))}
                            </button>
                        </form>
                    </div>
                </div>,
                document.body,
            )}

            {isConfigOpen && createPortal(
                <div
                    data-overlay="roster-config-wizard"
                    /* 📱 FULL-BLEED ON A PHONE, CENTRED DIALOG FROM `sm:` UP.
                       The sandbox wizard is a band ruler, three policy panels and two
                       tables. Inside a `p-4` box that is centred in a dimmed page, on a
                       375px screen, it was a 343px-wide column with a scrollbar — the
                       form the visitor came to use, viewed through a letterbox. Below
                       `sm:` the panel now IS the screen: no overlay padding, no radius,
                       no border, its own scroll, and the notch/home-bar insets padded
                       for. LIVE MODE'S STRING IS THE LITERAL IT ALWAYS WAS — written out
                       in full rather than composed, because `RosterView.wizard.test.jsx`
                       pins the live wizard and a shared base string is exactly how a
                       "sandbox only" change stops being sandbox only. */
                    /**
                     * ⚠️ ONE PANEL NOW, AND THE OLD BRANCH WOULD HAVE MADE THE LIVE
                     *    WIZARD UNUSABLE. Live mode's dialog was `max-w-lg` with no
                     *    scroll, which was right for two textareas and is not right
                     *    for two tables and a band editor: the tables would have been
                     *    crammed into a narrow box with the Generate button pushed
                     *    off the bottom of a panel that cannot scroll to reach it.
                     *
                     *    Found by `RosterView.mobile.test.jsx`, whose whole section 7
                     *    exists to pin "the responsive work stopped at the branch" —
                     *    a claim that stopped being true the moment there was no
                     *    branch. The mobile treatment was never sandbox-specific; it
                     *    was applied where the tables were, and the tables are now in
                     *    both.
                     */
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-stretch sm:items-center justify-center z-[100] p-0 sm:p-4"
                >
                    <div className="bg-white dark:bg-slate-800 w-full max-w-3xl h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto overscroll-contain rounded-none sm:rounded-2xl shadow-2xl p-4 sm:p-6 pt-[max(1rem,env(safe-area-inset-top))] sm:pt-6 border-0 sm:border sm:border-slate-200 sm:dark:border-slate-700 animate-in zoom-in-95">
                        
                        <div className="flex items-center gap-2 mb-4">
                            {isDemo && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded">SANDBOX MODE</span>}
                            <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase flex items-center gap-2">
                                <Settings size={20} /> AURA Configuration Wizard
                            </h3>
                        </div>
                        
                        {/* 🧪 SANDBOX: THE PICKER — ONE PROFESSION, ONE SHAPE.
                            ITS HISTORY, BECAUSE THE LAST STEP WAS A CORRECTION AND NOT AN
                            IMPROVEMENT. It was one button ("Load example department"), then
                            five cards, then one dropdown of TWELVE ARRANGEMENTS — one per
                            department — and 23 more were about to be written so that every
                            MOH profession had one. Seven of the twelve were invented
                            services offered under a real profession's name with an amber
                            "please correct this" panel attached. The panel was the tell.
                            The roster owner stopped it: "other professions can also ride on
                            the configurations of the 5. That's the purpose of this roster's
                            new version — so roster masters can configure for their team
                            regardless of their profession."
                            SO THE TWO CONTROLS ARE A PROFESSION AND A SHAPE, and they are
                            different kinds of thing. The profession is the visitor's own
                            designation, from MOH's published list, and it LABELS the result
                            — it selects no duty, grade or rule, which is what lets an art
                            therapist ride the physiotherapists' structure and still see
                            "Art Therapist" on their roster. The shape is a STRUCTURE, and
                            every one of the five is attributed on screen to the profession
                            that described it, because "this is how the physiotherapists do
                            it — adapt it" is true and "this is how art therapists do it"
                            would have been invented.
                            THE ATTRIBUTION IS RENDERED FROM DATA, not written into this
                            markup: a shape carries `attribution`, and every shape that
                            carries one shows it. A shape added later therefore cannot be
                            presented as anonymous structure just because whoever added it
                            forgot the caption — the field is the thing that has to be
                            filled in.
                            STILL TWO CONTROLS ON A PHONE, which is the constraint v1.12.0
                            collapsed five cards into one dropdown for. Native <select>s:
                            iOS and Android render them as full-height wheels, so 37
                            professions cost one tap and no vertical space, and both are
                            keyboard- and screen-reader-operable without any work from us.
                            Only the CHOSEN shape's description renders, so the panel's
                            height does not grow with the list.
                            A typed-in team still works and is still the point of the tables
                            below: "Start blank" is the first option in the shape list, a
                            name alone is enough, and every column beside it is optional. */}
                        {/* STEP 1. The numbers and the spine come from `WIZARD_STEPS`, and
                            only Sandbox is numbered: live mode's wizard is a different, shorter
                            thing (two textareas), so numbering it would count a sequence that
                            does not exist there. `WizardStep` renders its children bare when it
                            is handed no number, which is how live mode opts out without a second
                            branch of markup. */}
                        {!isDemo && (
                            /**
                             * ⚠️ LIVE MODE GETS ITS OWN STEP 1, RATHER THAN STARTING AT 2.
                             *
                             *    The sandbox's first step is "who are you and what shape is
                             *    your department" — a profession dropdown and a worked-example
                             *    picker, which exist because a visitor is INVENTING a
                             *    department. A real one already exists, so those controls have
                             *    nothing to do.
                             *
                             *    But omitting the step entirely left the live wizard numbered
                             *    2 to 7, which reads as a step that failed to load. Found by
                             *    `RosterView.steps.test.jsx`, whose claim was "live mode is not
                             *    numbered" — true while live mode was two textareas, and false
                             *    the moment it became the same wizard.
                             *
                             *    So the step stays and answers the same question from the other
                             *    direction: this is the department you are configuring, and
                             *    here is where its facts are edited.
                             */
                            <WizardStep number={wizardStepNumber('team')} label={wizardStepLabel('team')}>
                                <div className="pb-4">
                                    <div className="p-4 rounded-xl bg-indigo-50/60 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/50">
                                        <p className="text-sm font-black text-slate-800 dark:text-white">
                                            {team?.name || 'Your department'}
                                        </p>
                                        <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                                            {[team?.institution, team?.profession].filter(Boolean).join(' · ')
                                                || 'Institution not set'}
                                        </p>
                                        <p className="mt-3 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                            {rosteredMembers.length} {rosteredMembers.length === 1 ? 'person' : 'people'} in
                                            the roster pool. Add or remove them in{' '}
                                            <span className="font-bold">Admin → Team</span>; a colleague who runs
                                            the roster without working in it is marked <span className="font-bold">not
                                            rostered</span> there and does not appear below.
                                        </p>
                                    </div>
                                </div>
                            </WizardStep>
                        )}

                        {isDemo && (
                            <WizardStep number={wizardStepNumber('team')} label={wizardStepLabel('team')}>
                            <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                                {/* ── CONTROL 1: WHO YOU ARE ─────────────────────────────
                                    MOH's own 28, with `<optgroup>` for the two that nest
                                    (12, Medical Technologist / Physiologist, and 24,
                                    Psychologist). The parent of a nesting profession is a
                                    GROUP HEADING and not a choice — a roster belongs to a
                                    cardiac lab or a sleep lab, never to "medical technology"
                                    in general — and a browser will not let a heading be
                                    selected, which is the behaviour we want rather than one
                                    we would have to police. Alphabetical by the name a
                                    visitor READS, sorted in `mockData.js`; this file does
                                    not re-order it. */}
                                <label htmlFor="roster-profession" className={DEMO_PICKER_LABEL_CLASS}>
                                    Your profession
                                </label>
                                <select
                                    id="roster-profession"
                                    value={demoProfession?.id || ''}
                                    onChange={(event) => setDemoProfession(professionById(event.target.value))}
                                    className={DEMO_PICKER_SELECT_CLASS}
                                >
                                    {/* OPTIONAL, and it stays optional. A tool that demands
                                        a designation before it will help is a tool that has
                                        to be argued with first. */}
                                    <option value="">Prefer not to say</option>
                                    {MOH_PROFESSION_OPTIONS.map((entry) => (entry.kind === 'group' ? (
                                        <optgroup key={entry.groupId} label={entry.label}>
                                            {entry.options.map((leaf) => (
                                                <option key={leaf.id} value={leaf.id}>{leaf.name}</option>
                                            ))}
                                        </optgroup>
                                    ) : (
                                        <option key={entry.id} value={entry.id}>{entry.name}</option>
                                    )))}
                                </select>

                                {/* THE SUGGESTION, AND IT IS A SUGGESTION. The roster owner's
                                    own pairing of profession to likely starting point. It is
                                    never applied automatically — a suggestion that loads
                                    itself is a claim about that profession's service — and
                                    the sentence says out loud that it describes nothing. For
                                    the five professions who told us their shape it says so
                                    instead, because that is a different and stronger fact.
                                    A profession with no pairing gets no suggestion and is
                                    told why, rather than being handed the nearest guess. */}
                                {demoProfession && (
                                    <p
                                        data-profession={demoProfession.id}
                                        className="text-[10px] text-emerald-700 dark:text-emerald-300 mt-2 leading-relaxed"
                                    >
                                        {/* NO PROFESSION NAME IS INTERPOLATED INTO THESE
                                            SENTENCES, deliberately. "No cardiac has
                                            described their week" is what naming a
                                            sub-discipline produces, and a sentence that
                                            reads as a mistake gets read as a mistake about
                                            the reader. "Your profession" is the same fact
                                            and survives all 37 leaves.

                                            ⚠️ AND IT SAYS ONE TEAM, NOT A PROFESSION.
                                            It used to read "the shape your own profession
                                            described to us" — which told a respiratory
                                            therapist at any other SingHealth institution
                                            that their PROFESSION had described a structure
                                            ONE team at one hospital described. Every shape
                                            here is one team at one site (`sourceScope` says
                                            so), and there are 27 other allied health
                                            professions carrying the same exposure. A
                                            profession is not a team, and the copy must
                                            never again imply it is. */}
                                        {suggestedShapeFor(demoProfession.id)
                                            ? (suggestedShapeFor(demoProfession.id).sourceProfessionId === demoProfession.id
                                                || suggestedShapeFor(demoProfession.id).sourceProfessionId === demoProfession.groupId
                                                ? `“${suggestedShapeFor(demoProfession.id).name}” below came from ONE team in your profession, at one institution. Start there if you like — one team is not a profession, colleagues elsewhere roster differently, and every row of it is editable.`
                                                : `A suggested starting point: “${suggestedShapeFor(demoProfession.id).name}”. It is a suggestion and nothing more: no team in your profession has described their week to us, so this says nothing about your service. Any shape below will do, and all of them are editable.`)
                                            : 'There is no suggested starting point for your profession — no team in it has described their week to us, and this is left blank rather than hand you a guess. The shapes below came from teams in other professions; pick whichever looks closest to how your team works and change it.'}
                                    </p>
                                )}

                                {/* ── CONTROL 2: WHAT SHAPE TO START FROM ────────────────
                                    Two `<optgroup>`s, so the difference between a structure
                                    a team described and an openly fictional demo is
                                    structural in the control rather than a word in a
                                    caption. Order comes from `DEMO_SHAPES` and this file
                                    does not re-order it; the grouping is a filter over that
                                    order, not a re-sort of it. */}
                                <label htmlFor="roster-shape" className={`${DEMO_PICKER_LABEL_CLASS} block mt-3`}>
                                    Shape to start from
                                </label>
                                <select
                                    id="roster-shape"
                                    value={demoShape?.id || ''}
                                    onChange={(event) => {
                                        const chosen = DEMO_SHAPES.find((entry) => entry.id === event.target.value);
                                        if (chosen) loadShape(chosen);
                                        else startBlank();
                                    }}
                                    className={DEMO_PICKER_SELECT_CLASS}
                                >
                                    {/* A REAL OPTION, not a dead placeholder: choosing it
                                        empties the tables so a team can type their own. */}
                                    <option value="">Start blank — type your own team</option>
                                    <optgroup label="Shapes — from teams who described their week">
                                        {DEMO_SHAPES.filter((entry) => entry.group === 'shape').map((entry) => (
                                            <option key={entry.id} value={entry.id}>{entry.name}</option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="Demonstrations — nobody's service">
                                        {DEMO_SHAPES.filter((entry) => entry.group === 'demo').map((entry) => (
                                            <option key={entry.id} value={entry.id}>{entry.name}</option>
                                        ))}
                                    </optgroup>
                                </select>

                                {/* The chosen shape's one line, and then WHOSE STRUCTURE IT
                                    IS. Both follow the choice rather than being on screen
                                    for every option at once, which is when they are actually
                                    read. The placeholder below names no COUNT, deliberately:
                                    a sentence saying "five shapes" goes out of date the next
                                    time somebody adds one, and it has now done so TWICE —
                                    twelve to five, then five to six when respiratory
                                    described their week. This placeholder needed no edit
                                    either time, which is the whole point of it. */}
                                {demoShape ? (
                                    <>
                                        <p
                                            data-shape={demoShape.id}
                                            className="text-[10px] text-emerald-700 dark:text-emerald-300 mt-2 leading-relaxed"
                                        >
                                            {demoShape.demonstrates}
                                        </p>
                                        {/* THE ATTRIBUTION. Not amber, and not a warning:
                                            nothing here is being disclaimed, because nothing
                                            here claims to be the visitor's service. It
                                            states whose structure this is and that it is a
                                            starting point — the two facts a roster master
                                            needs in order to know what they are looking at.
                                            The old amber `correction` panel apologised for a
                                            guess; there are no guesses left to apologise
                                            for. */}
                                        <p
                                            data-shape-attribution={demoShape.id}
                                            className="text-[10px] text-slate-600 dark:text-slate-300 mt-2 leading-relaxed border-t border-emerald-200 dark:border-emerald-800 pt-2"
                                        >
                                            {demoShape.attribution}
                                        </p>
                                        {/* AND WHOSE ROSTER IT WILL BE. The one place the two
                                            controls meet: the profession labels the result,
                                            the shape keeps its attribution, and neither
                                            pretends to be the other. */}
                                        {demoProfession && (
                                            <p className="text-[10px] font-bold text-emerald-800 dark:text-emerald-200 mt-2 leading-relaxed">
                                                {`This will be your ${demoProfession.qualifiedName} roster, built on a structure ${demoShape.sourceProfession ? `${demoShape.sourceProfession.toLowerCase()} colleagues described` : 'that is openly fictional'}.`}
                                            </p>
                                        )}
                                    </>
                                ) : (
                                    <p className="text-[10px] text-emerald-700 dark:text-emerald-300 mt-2 leading-relaxed">
                                        Every shape here is a STRUCTURE a team described — how their duties, grades
                                        and weekends fit together — not a description of anybody else&apos;s service.
                                        Pick the one closest to how your team works and it fills the tables below;
                                        everything it loads stays editable, including the parts that make it
                                        interesting. Or start blank and type your own team: a name alone is enough.
                                    </p>
                                )}
                            </div>
                            </WizardStep>
                        )}

                        {/* `space-y-0` in Sandbox: the vertical rhythm between numbered panels
                            belongs to the spine, and a margin between rows would chop the line
                            into dashes.

                            ⚠️ `isDemo ? number : null` HERE WAS THE LAST UNNUMBERED STEP, and it
                            left the live wizard running 1, 3, 4, 5, 6, 7 — a gap that reads as a
                            step which failed to load rather than as a step that was never there.
                            Caught by `RosterView.steps.test.jsx` asserting the sequence rather
                            than just its first entry, which is why it asserts the whole list. */}
                        <div className="mb-6">
                            <WizardStep number={wizardStepNumber('period')} label={wizardStepLabel('period')}>
                            {/* In Sandbox this gets the same card as every other numbered step.
                                Left bare it was the one step on the spine with no panel around
                                it, which read as a gap in the sequence rather than as a step.
                                Live mode keeps it bare and unnumbered — the classes are
                                conditional, not a second copy of the markup. */}
                            {/* ⚠️ `mb-4` ON BOTH BRANCHES. It used to be on the Sandbox one
                                only, so in LIVE mode this step butted straight against
                                step 3 with no gap at all — the one seam in the wizard
                                where two steps come from different files, and so the one
                                nobody owned. Every other panel gets its breathing room
                                from a `pb-4` inside `RosterDemoWizardTables`; this is the
                                same rhythm, applied to the step that sits outside it. */}
                            <div className={isDemo
                                ? 'mb-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 grid grid-cols-3 gap-3'
                                : 'mb-4 grid grid-cols-2 gap-4'}
                            >
                                {/* TWO THIRDS TO THE DATE, one to Weeks — in Sandbox only.
                                    Equal halves left the date field 151px, and the native
                                    `<input type="date">` at the 16px Sandbox uses to stop iOS
                                    zooming needs about 150px for `01/02/2026` PLUS its picker
                                    icon, so the year rendered as `202`. Weeks holds a
                                    one- or two-digit number and never needed half the row. */}
                                <div className={isDemo ? 'col-span-2' : undefined}>
                                    <label className="text-xs font-bold text-slate-400 uppercase" htmlFor="roster-start-date">Start Date</label>
                                    <input
                                        id="roster-start-date"
                                        type="date"
                                        className={`input-field w-full mt-1 font-bold bg-white dark:bg-slate-900 border dark:border-slate-700 rounded p-2 text-slate-800 dark:text-white${isDemo ? ' min-h-11 !text-base sm:min-h-0 sm:!text-sm' : ''}`}
                                        value={config.startDate}
                                        onChange={(e) => setConfig({...config, startDate: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase" htmlFor="roster-weeks">Weeks</label>
                                    <input
                                        id="roster-weeks"
                                        type="number"
                                        min="1"
                                        max={MAX_ROSTER_WEEKS}
                                        step="1"
                                        className={`input-field w-full mt-1 font-bold bg-white dark:bg-slate-900 border dark:border-slate-700 rounded p-2 text-slate-800 dark:text-white${isDemo ? ' min-h-11 !text-base sm:min-h-0 sm:!text-sm' : ''}`}
                                        value={config.weeks}
                                        // 🛡️ M3 FIX: an empty field is kept as '' rather than becoming
                                        // parseInt('') === NaN. '' is rejected by validateRosterConfig,
                                        // so the field can still be cleared and retyped, but an
                                        // unparseable value can no longer reach generateRoster.
                                        onChange={(e) => {
                                            const raw = e.target.value;
                                            setConfig({ ...config, weeks: raw === '' ? '' : Number(raw) });
                                        }}
                                    />
                                </div>
                            </div>
                            </WizardStep>
                            {/* 🧪 THE ONE PLACE THE TWO UNIVERSES' WIZARDS DIFFER.
                                Sandbox gets the grade-aware tables — a name alone still
                                generates, but a grade, an FTE, leave dates, per-task
                                days, a lead band and a co-lead toggle are all reachable
                                without hand-editing a config object.
                                LIVE gets the two comma-separated textareas, byte for
                                byte as they were: they write straight into
                                `config.staff` / `config.tasks`, which is what
                                `prepareRosterWrite` reads, and this feature is not
                                allowed anywhere near that path. */}
                            {/*
                              * ⚠️ ONE WIZARD NOW, IN BOTH MODES — `R3`.
                              *
                              * This was `{isDemo ? <RosterDemoWizardTables/> : <two
                              * textareas/>}`, and the split was honest at the time: the
                              * two branches configured two DIFFERENT ENGINES. Live ran
                              * `generateRoster`, a round-robin over a comma-separated list
                              * of names that could not see a grade, an FTE, a skill or a
                              * rule — so two textareas were the right UI for it. The
                              * sandbox ran `generateRosterV2`, which needed all of it.
                              *
                              * Both now run `generateRosterV2`, so both get the screen that
                              * configures it. The remaining difference is the real one: in
                              * the sandbox the staff are typed, and in a department they
                              * are the team.
                              */}
                            <RosterDemoWizardTables
                                bandInputs={demoBandInputs}
                                bandsReason={demoWizard.bandsReason}
                                bands={demoWizard.bands}
                                onBandChange={patchBandInput}
                                hoursInputs={demoHoursInputs}
                                hoursErrors={demoWizard.hoursErrors}
                                onHoursChange={patchHoursInput}
                                rulesInputs={demoRulesInputs}
                                rulesErrors={demoWizard.rulesErrors}
                                onRulesChange={patchRulesInput}
                                staffRows={isDemo ? demoStaffRows : liveStaffRows}
                                staffErrors={demoWizard.staffErrors}
                                staffReadOnly={!isDemo}
                                onStaffChange={patchStaffRow}
                                onStaffAdd={addStaffRow}
                                onStaffRemove={removeStaffRow}
                                taskRows={demoTaskRows}
                                taskErrors={demoWizard.taskErrors}
                                onTaskChange={patchTaskRow}
                                onTaskAdd={addTaskRow}
                                onTaskRemove={removeTaskRow}
                            />
                        </div>

                        {/* 🧪 Requirement 6, stated where the visitor is about to act. */}
                        {isDemo && (
                            <p className="-mt-4 mb-4 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 leading-relaxed">
                                Sandbox: this runs the real rostering engine in your browser and saves nothing.
                                Nothing is written to the live roster, and closing or reloading this page clears everything.
                            </p>
                        )}

                        {/* ⚠️ A DENIED READ IS OTHERWISE SILENT, and the failure it
                            produces is a roster master typing their department in
                            again believing it was never saved. Shown inside Configure
                            because that is the form the warning is about. */}
                        {settingsError && (
                            <p className="-mt-2 mb-4 text-xs font-bold text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                                <ShieldAlert size={14} className="shrink-0 mt-px" />
                                <span>{settingsError}</span>
                            </p>
                        )}

                        {statusSlot === 'config' && statusBanner}

                        {/* 🛡️ M3 FIX: tell the user why generation is unavailable.
                            In the sandbox the reason comes from the tables and then
                            from `validateRosterV2Config` — including
                            `validateGradeBands`' own wording when the three bands do
                            not partition AH7–AH17, which is the state the band editor
                            above can be left in mid-edit. */}
                        {!generateGate.valid && (
                            <p className="-mt-4 mb-4 text-xs font-bold text-red-600 dark:text-red-400 flex items-start gap-1.5">
                                <ShieldAlert size={14} className="shrink-0 mt-px" />
                                <span>{generateGate.reason}</span>
                            </p>
                        )}

                        {/* 📱 A STICKY FOOTER ON A PHONE. Full-screen and scrolling, the
                            two decisions — draft it, or give up — were at the bottom of a
                            page of tables, so the answer to "how do I make it do the thing"
                            was "keep scrolling". They now sit on the bottom edge of the
                            scrollport with a rule above them and the home-bar inset padded,
                            and revert to an ordinary row in the flow from `sm:` up. */}
                        {/* Sticky on a phone in BOTH modes now, for the reason it was
                            sticky in one: full-screen and scrolling, "draft it or give
                            up" was at the bottom of a page of tables, so the answer to
                            "how do I make it do the thing" was "keep scrolling". */}
                        <div className="sticky sm:static bottom-0 z-10 -mx-4 -mb-4 sm:mx-0 sm:mb-0 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 sm:border-0 flex gap-2">
                            <button onClick={() => setIsConfigOpen(false)} className={`flex-1 py-3 ${isDemo ? `${TOUCH} ` : ''}text-slate-500 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors`}>Cancel</button>
                            <button
                                onClick={handleGenerateClick}
                                disabled={!generateGate.valid}
                                title={generateGate.valid ? undefined : generateGate.reason}
                                className={`flex-1 py-3 text-white font-bold rounded-lg shadow-lg transition-colors flex justify-center items-center gap-2 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 disabled:shadow-none disabled:cursor-not-allowed ${isDemo ? `${TOUCH} bg-emerald-600 hover:bg-emerald-700` : 'bg-indigo-600 hover:bg-indigo-700'}`}
                            >
                                {/* 🧪 It said "Simulate Check" while doing nothing at
                                    all. It generates a roster now, so it says so. */}
                                {/* 🧪 It said "Simulate Check" while doing nothing at
                                    all, then "Generate Sandbox Roster" — the machine's
                                    word for the thing and the mode's name for itself.
                                    A roster master drafts a roster. The sandbox's
                                    "nothing is saved" promise is made by the two
                                    notices either side of this button, not by its
                                    label. LIVE MODE'S LABEL IS UNTOUCHED: it is pinned
                                    byte-exact by the live-wizard test. */}
                                <Play size={16} /> {isDemo ? 'Draft roster' : 'Generate Roster'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}

            {/* 🌟 CUSTOM GENERATE CONFIRMATION MODAL
                🛡️ The old copy ("will overwrite the currently displayed schedule") was
                false in both directions: the write was not scoped to the displayed
                month, and it erased every other period in the document. It now names
                the exact range about to be written and the staff pool that will be
                used, so an M1-style demo pool is visible BEFORE the click.
                Range comes from describeGenerationRange, which reads the keys
                generateRoster really produces — start dates are not Monday-snapped
                today, so a Sunday start honestly shows a Sunday. */}
            <ConfirmationModal
                isOpen={isConfirmModalOpen}
                title="NEXUS says"
                message={generationPlan ? (
                    <>
                        <span className="block">
                            Generate a {config.weeks}-week roster?
                        </span>
                        <span className="block mt-3 text-sm text-slate-400">
                            Writes <span className="font-bold text-slate-200">{generationPlan.dayCount}</span> days:
                            <span className="block font-bold text-slate-200">
                                {formatRosterDateKey(generationPlan.firstDate)} → {formatRosterDateKey(generationPlan.lastDate)}
                            </span>
                        </span>
                        <span className="block mt-2 text-sm text-slate-400">
                            Every shift already stored on those dates is replaced. Dates outside this range are left untouched.
                        </span>
                        <span className="block mt-3 text-sm text-slate-400">
                            Staff pool:
                            <span className="block font-bold text-slate-200">{config.staff.join(', ')}</span>
                        </span>
                    </>
                ) : `Cannot generate: ${configValidation.reason || 'this configuration produces no dates.'}`}
                onCancel={() => setIsConfirmModalOpen(false)}
                onConfirm={executeRosterGeneration}
            />

        </div>
    );
};

export default RosterView;
