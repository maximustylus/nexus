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

// --- SANDBOX IMPORTS ---
import { useNexus } from '../context/NexusContext';
// 🧪 The picker's four arrangements. `DEMO_ARRANGEMENTS[0].config` IS
// `DEMO_EXAMPLE_DEPARTMENT` — an alias, not a copy — so the respiratory option loads
// exactly the fixture this view has always loaded.
// `provenance` is deliberately NOT imported here. The panel keys off `correction`
// being present, which is ONE source for "does this need a health warning"; reading
// both fields in this file would be two, and the two would eventually disagree in
// front of a roster master. That the two fields agree is pinned in
// `RosterView.demo.test.jsx` instead, where a mismatch is a failing test rather than a
// missing panel.
import { DEMO_ARRANGEMENTS } from '../data/mockData';
// 🧪 SANDBOX ENGINE — the constraint-aware engine, used ONLY on the demo path.
// Live generation still goes through prepareRosterWrite → generateRoster, which
// has characterization tests pinning its byte-exact output and a live document
// reading it. Nothing below migrates live mode.
import {
    generateRosterV2,
    parseLocalDateKey,
    validateRosterV2Config,
    bandOfGrade,
    DEFAULT_GRADE_BANDS,
} from '../utils/rosterEngineV2';
// 🧪 SANDBOX WIZARD — the structured tables that replaced the two textareas in
// demo mode, and the ONE pure function that turns them into an engine config.
import RosterDemoWizardTables from './RosterDemoWizardTables';
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
} from '../utils/rosterWizard';
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
                            className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
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
                                                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white font-black text-[11px] uppercase tracking-wider transition-colors"
                                            >
                                                <CalendarCheck size={14} />
                                                {busy ? 'Checking the roster…' : 'Cover this shift'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onRespond(request, false)}
                                                disabled={busy || blocked}
                                                aria-label={`Decline to cover ${label}`}
                                                className="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed font-black text-[11px] uppercase tracking-wider transition-colors"
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

    // 🧪 WHICH OF THE FOUR ARRANGEMENTS WAS LOADED, or `null` for a team typed in by
    // hand. The whole descriptor rather than its id, because what this is read for is
    // its `correction` field.
    //
    // IT EXISTS FOR ONE REASON AND IT IS AN HONESTY REASON. The picker says, on the
    // button, that the respiratory arrangement is inferred rather than reported — but
    // the picker is inside a modal that closes the moment the roster is drafted, and
    // what the therapists in the room then look at is a finished roster of their own
    // service with no caveat anywhere near it. So the caveat travels with the loaded
    // arrangement and is restated beside the report. `null` for a typed-in team is
    // correct and not a gap: a team that typed their own roster in needs no warning
    // about somebody else's inference.
    //
    // NOT A SOURCE OF TRUTH FOR ANYTHING GENERATED. The rows are, exactly as before —
    // this is a label, and a visitor who loads an arrangement and then edits every row
    // still sees the caveat, which is the safe direction to be wrong in.
    const [demoArrangement, setDemoArrangement] = useState(null);

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
    // `firestore.rules`, which cannot be written until blocked decision D6
    // (there is no `firestore.rules` in the repo) is settled.
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
            staffRows: demoStaffRows,
            taskRows: demoTaskRows,
            bandInputs: demoBandInputs,
            hoursInputs: demoHoursInputs,
            rulesInputs: demoRulesInputs,
            extraRules: demoExtraRules,
        }),
        [config.startDate, config.weeks, demoStaffRows, demoTaskRows, demoBandInputs, demoHoursInputs, demoRulesInputs, demoExtraRules],
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

    // Which gate the Generate button obeys. Live mode is untouched: it is still
    // `validateRosterConfig` over the two textareas, exactly as before.
    const generateGate = isDemo ? demoValidation : configValidation;

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
            setDemoArrangement(null);
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
            setDemoArrangement(null);

            // 🛡️ M1 FIX: the demo branch above rewrites config.staff/config.tasks
            // (it used to overwrite them with the Marvel dataset; it now clears
            // them for the visitor's own team, and "Load example department" can
            // fill them with twelve fictional names). Either way the demo pool
            // must not survive the toggle back to LIVE, where one Generate click
            // would write it over four real clinicians. An in-progress
            // startDate/weeks edit is preserved.
            setConfig(prev => restoreLiveRosterConfig(prev));

            const unsub = onSnapshot(
                doc(db, 'system_data', 'roster_2026'),
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
    }, [isDemo]);

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
    const coverageTargetName = user?.name || null;

    useEffect(() => {
        // Both universes start from a clean slate: a sandbox visitor must not see a
        // real request, and a real user must not see one left over from a sandbox
        // session (there are none — the sandbox writes nothing — which is the point).
        setCoverageRequests([]);
        setCoverageError(null);
        setRespondingSwapId(null);
        setAnsweredSwapIds(new Set());
        setSwapFailures({});

        if (isDemo || !coverageTargetName) return undefined;

        const pendingForMe = query(
            collection(db, 'shift_swaps'),
            where('targetStaff', '==', coverageTargetName),
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
    }, [isDemo, coverageTargetName]);

    // --- ACTIONS ---
    
    /**
     * 🧪 SANDBOX: fill ONE OF THE FOUR ARRANGEMENTS into the wizard's tables.
     *
     * WAS `loadExampleDepartment`, which took no argument and closed over the single
     * example fixture. It now takes the arrangement, and the body below is otherwise
     * the same code with `DEMO_EXAMPLE_DEPARTMENT` replaced by `fixture` — deliberately
     * a parameterisation and not a rewrite, because the respiratory option passes
     * exactly the object this function used to read and its four existing tests
     * therefore still describe the same behaviour.
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
     * a task's `requiresSkill` — because the respiratory arrangement's single
     * unfillable slot exists precisely because only two people hold CPET. They are
     * rendered read-only in the tables rather than hidden.
     *
     * Fresh copies throughout, so a later edit cannot mutate the frozen export
     * through a shared array reference.
     */
    const loadArrangement = (arrangement) => {
        const fixture = arrangement.config;
        // The label, and specifically its `correction`, travels with the rows. See the
        // note on `demoArrangement`: the picker closes, the caveat must not.
        setDemoArrangement(arrangement);
        setDemoStaffRows(fixture.staff.map(person => createStaffRow(person)));
        setDemoTaskRows(fixture.tasks.map(task => createTaskRow(task)));
        setDemoBandInputs(bandsToInputs(fixture.rules?.bands || DEFAULT_GRADE_BANDS));
        // The fixture's hours policy goes into the two boxes — not into `extraRules` —
        // for exactly the reason `bands` does: one value, one source, and the source is
        // the control the visitor can see. The respiratory arrangement states neither
        // field, so both boxes stay blank and its run is the duties-only run it has
        // always been; psychology and the laboratory state `weeklyHours: 42`, and 42
        // therefore appears in the box as a TYPED value, which is what makes the hours
        // columns in their load tables something a visitor can change rather than a
        // property of the fixture.
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
        // land in the panel that owns them, so the example's policy is visible and
        // editable rather than carried invisibly in `extraRules`. The fixture states 2
        // and 6, which happen to be the engine's defaults — the boxes therefore show
        // "2" and "6" as TYPED values, because the example department really does
        // declare them, and that is a different fact from leaving them blank. All four
        // arrangements state the same two, so all four show them.
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
        // The start date and the length of the run are PART OF THE ARRANGEMENT, and for
        // three of the four they are load-bearing rather than cosmetic: a psychology run
        // shorter than two months holds one occurrence of a monthly clinic and cannot
        // show continuity at all; an embryology run shorter than a four-month block
        // shows a rota instead of a handover; and the laboratory run starts on the 1st
        // of a month so its first quota period is a WHOLE month the engine will judge.
        // Each fixture's own comment states why its two numbers are what they are.
        setConfig(prev => ({
            ...prev,
            startDate: fixture.startDate,
            weeks: fixture.weeks,
        }));
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
        if (!configValidation.valid) {
            showStatus('error', `Cannot generate: ${configValidation.reason}`);
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

        // 🛡️ M3 FIX (defence in depth): validate, generate, and refuse to write
        // an empty roster — all decided by prepareRosterWrite, which is unit
        // tested. An empty write used to blank the whole document and report
        // success.
        const prepared = prepareRosterWrite(config);
        if (!prepared.ok) {
            console.error("Roster generation blocked before write:", prepared.reason, config);
            showStatus('error', `Roster NOT generated. ${prepared.reason}`);
            return;
        }

        try {
            // 🛡️ C2 FIX: { merge: true } — generating one period must not erase
            // the periods already stored in this document.
            await setDoc(doc(db, 'system_data', 'roster_2026'), prepared.data, { merge: true });
            setIsConfigOpen(false); // Close the config wizard
            // 🌟 P8.3: "conflict-free" was the old copy. Post-mortem E1: the
            // generator cannot know that — it means "cannot double-book by
            // construction". It says what it actually did instead.
            showStatus(
                'success',
                generationPlan
                    ? `Roster saved: ${generationPlan.dayCount} days, ${formatRosterDateKey(generationPlan.firstDate)} → ${formatRosterDateKey(generationPlan.lastDate)}.`
                    : 'Roster saved.',
            );
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
        // `firestore.rules`, which is blocked on decision D6 (no `firestore.rules`
        // exists in the repo).
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
                await addDoc(collection(db, 'shift_swaps'), {
                    // 🛡️ M11: the person being SWAPPED OUT, which is what
                    // `planSwapApplication` matches on — not necessarily the
                    // person who clicked. For an admin arranging cover this is
                    // the clinician who actually holds the duty.
                    requestedBy: swapSubject.requestedBy,
                    targetStaff: swapTargetStaff,
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
    //     mechanism for that (decision D3), so the copy says to tell them.
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
            const swapRef = doc(db, 'shift_swaps', docId);

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
            const rosterRef = doc(db, 'system_data', 'roster_2026');
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

    return (
        <div className="md:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 animate-in fade-in relative z-10">
            
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
                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors text-slate-500"
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
                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors text-slate-500"
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex gap-2">
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
                            className={`flex gap-1.5 items-center px-3 py-2 font-bold text-xs transition-colors ${
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
                            className={`flex gap-1.5 items-center px-3 py-2 font-bold text-xs transition-colors ${
                                rosterScope === 'person'
                                    ? 'bg-slate-700 text-white'
                                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }`}
                        >
                            <User size={14} /> My week
                        </button>
                    </div>
                    <button onClick={() => setIsConfigOpen(true)} className="flex gap-2 items-center px-4 py-2 rounded bg-slate-100 font-bold text-xs hover:bg-slate-200 text-slate-600 transition-colors">
                        <Settings size={14} /> Configure
                    </button>
                    <button onClick={() => downloadCSV(rosterData)} className="flex gap-2 items-center px-4 py-2 rounded bg-green-100 text-green-700 font-bold text-xs hover:bg-green-200 transition-colors">
                        <FileSpreadsheet size={14} /> CSV
                    </button>
                    <button onClick={() => downloadICS(rosterData)} className="flex gap-2 items-center px-4 py-2 rounded bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 shadow-lg transition-colors">
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

            {/* CALENDAR GRID */}
            {rosterScope === 'department' && (
            <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-700 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} className="bg-slate-50 dark:bg-slate-800 p-2 text-center text-xs font-bold text-slate-400 uppercase">
                        {d}
                    </div>
                ))}
                
                {Array.from({ length: firstDayIndex }).map((_, i) => (
                    <div key={`empty-${i}`} className="bg-white dark:bg-slate-900 h-32" />
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
                        <div key={day} data-date={dateKey} className="bg-white dark:bg-slate-900 h-32 p-1 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors relative group border-t border-l border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                            <span className="text-xs font-bold text-slate-400 absolute top-1 right-2">{day}</span>
                            
                            <div className="mt-5 flex flex-col gap-1 overflow-y-auto max-h-[90px] custom-scrollbar">
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
                                            className={`text-left text-[9px] font-bold px-1.5 py-1 rounded flex flex-col leading-tight shadow-sm transition-transform ${
                                                isMyShift || user?.role === 'admin' ? 'cursor-pointer hover:scale-[1.02] ring-1 ring-inset ring-transparent hover:ring-indigo-400' : 'cursor-default opacity-80'
                                            } ${
                                                s.category === 'VC' ? 'bg-orange-50 text-orange-800 border border-orange-100 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800/50' :
                                                'bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50'
                                            }`}
                                        >
                                            <span className="uppercase tracking-tighter opacity-80">{s.task}</span>
                                            <span className={`text-slate-800 dark:text-slate-200 ${isMyShift ? 'text-indigo-600 dark:text-indigo-400 font-black' : ''}`}>
                                                {s.staff}
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
                                                    Also: {alsoOnShift.join(', ')}
                                                </span>
                                            )}
                                            {coverAsks.length > 0 && (
                                                <span
                                                    data-coverage-badge={dateKey}
                                                    title={`${coverAsks.map((ask) => ask.requestedBy).filter(Boolean).join(', ') || 'A colleague'} asked you to cover this shift. Answer it in "Cover asked of you", above the calendar.`}
                                                    className="mt-0.5 self-start px-1 py-px rounded border border-amber-400 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700 text-[8px] font-black uppercase tracking-wide"
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
                                            className="text-left text-[9px] font-bold px-1.5 py-1 rounded flex flex-col leading-tight border border-dashed border-slate-400 dark:border-slate-500 bg-transparent text-slate-500 dark:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-500"
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

                    {/* 🧪 THE PROVENANCE NOTICE, and it is here rather than only in the
                        wizard for one reason: the wizard is a modal and it closes the
                        moment the roster is drafted. What the room then looks at is a
                        finished roster of their own service, and if the only place that
                        said "this was inferred, not reported" was the panel that just
                        disappeared, the tool would have quietly presented a guess as a
                        service. Rendered from the loaded arrangement's `correction` field,
                        so it appears for whichever arrangement declares one and for no
                        other — and never for a team who typed their own roster in, where
                        it would be a false statement about their own data.

                        It sits ABOVE the run summary on purpose. Reading order is the
                        claim: what this roster IS comes before how many shifts it holds. */}
                    {demoArrangement?.correction && (
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800">
                            <ShieldAlert size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-xs font-black text-amber-800 dark:text-amber-300 uppercase tracking-wide">
                                    {demoArrangement.name} — {demoArrangement.correction.headline}
                                </p>
                                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed mt-1">
                                    {demoArrangement.correction.body}
                                </p>
                            </div>
                        </div>
                    )}

                    {!demoResult && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            No sandbox roster yet. Open <span className="font-bold">Configure</span>, fill in the
                            staff and task tables (or load one of the four example arrangements) and press{' '}
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

                            {/* --- per-person load --- */}
                            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                    <Users size={13} /> Load per person
                                </p>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="text-left text-slate-400">
                                                <th className="font-bold uppercase text-[10px] py-1 pr-3">Name</th>
                                                <th className="font-bold uppercase text-[10px] py-1 pr-3">Grade</th>
                                                <th className="font-bold uppercase text-[10px] py-1 pr-3">Band</th>
                                                <th className="font-bold uppercase text-[10px] py-1 pr-3">FTE</th>
                                                <th className="font-bold uppercase text-[10px] py-1 pr-3">Duties</th>
                                                {/* Only when this run counted hours. A
                                                    duties-only run reads exactly the
                                                    table it has always read — the engine
                                                    omits the three fields, so inventing
                                                    columns of dashes for them would be
                                                    reporting a policy nobody set. */}
                                                {demoLoadHasHours && (
                                                    <>
                                                        <th className="font-bold uppercase text-[10px] py-1 pr-3">Hours</th>
                                                        <th className="font-bold uppercase text-[10px] py-1 pr-3">Busiest week</th>
                                                        <th className="font-bold uppercase text-[10px] py-1 pr-3">Weekly cap</th>
                                                    </>
                                                )}
                                                <th className="font-bold uppercase text-[10px] py-1 pr-3">Per FTE</th>
                                                <th className="font-bold uppercase text-[10px] py-1">Share</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(demoResult.load).map(([name, entry]) => (
                                                <tr key={name} className="border-t border-slate-200 dark:border-slate-700">
                                                    <td className="py-1 pr-3 font-bold text-slate-700 dark:text-slate-200">{name}</td>
                                                    {/* Requirement 6: the grade this run used, and the
                                                        band it resolved to under that run's boundaries.
                                                        "Not recorded" is said in words rather than left
                                                        blank — a blank cell reads as a rendering bug,
                                                        and "no grade" is a fact with consequences (it
                                                        bars this person from every band-gated lead). */}
                                                    <td className="py-1 pr-3 text-slate-500 dark:text-slate-400">
                                                        {demoRunGrades[name]?.grade || <span className="italic">not recorded</span>}
                                                    </td>
                                                    <td className="py-1 pr-3 text-slate-500 dark:text-slate-400">
                                                        {demoRunGrades[name]?.band
                                                            ? bandLabel(demoRunGrades[name].band)
                                                            : <span className="italic">—</span>}
                                                    </td>
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
                                                    <td className="py-1 pr-3 text-slate-500 dark:text-slate-400">
                                                        <span className="block">{entry.fte}</span>
                                                        {describeFteAsDays(entry.fte, demoRunWorkingDays) !== '' && (
                                                            <span className="block text-[10px] text-slate-400">
                                                                {describeFteAsDays(entry.fte, demoRunWorkingDays)}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-1 pr-3 font-black text-slate-800 dark:text-white">{entry.duties}</td>
                                                    {demoLoadHasHours && (
                                                        <>
                                                            <td className="py-1 pr-3 font-black text-slate-800 dark:text-white tabular-nums">
                                                                {typeof entry.hours === 'number' ? `${entry.hours}h` : '—'}
                                                            </td>
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
                                                                    <td
                                                                        className={`py-1 pr-3 tabular-nums ${atCap
                                                                            ? 'font-black text-amber-700 dark:text-amber-400'
                                                                            : 'text-slate-500 dark:text-slate-400'}`}
                                                                        title={atCap
                                                                            ? `${name} is at their weekly hours limit in the busiest week of this run — AURA will not add another duty to that week.`
                                                                            : undefined}
                                                                    >
                                                                        {`${peak}h`}
                                                                    </td>
                                                                );
                                                            })()}
                                                            <td className="py-1 pr-3 text-slate-500 dark:text-slate-400 tabular-nums">
                                                                {typeof entry.weeklyCap === 'number' ? `${entry.weeklyCap}h` : '—'}
                                                            </td>
                                                        </>
                                                    )}
                                                    <td className="py-1 pr-3 text-slate-500 dark:text-slate-400">{entry.weighted}</td>
                                                    <td className="py-1 text-slate-500 dark:text-slate-400">{Math.round(entry.share * 100)}%</td>
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
                <div data-overlay="swap-modal" className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsSwapModalOpen(false)}></div>
                    <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-700">
                        
                        <div className="bg-gradient-to-r from-indigo-500 to-purple-500 p-4 flex justify-between items-center text-white">
                            <div className="flex items-center gap-2">
                                <ArrowRightLeft size={18} />
                                {/* Plain language, and the same words the button
                                    below and the recipient's card use: you are
                                    asking a colleague to cover, not filing a
                                    "shift swap request" with a system. */}
                                <h3 className="text-sm font-black uppercase tracking-wider">Ask someone to cover</h3>
                            </div>
                            <button onClick={() => setIsSwapModalOpen(false)} className="hover:bg-white/20 p-1 rounded-full transition-colors">
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={submitSwapRequest} className="p-6">
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
                                            className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
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
                                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
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
                                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none h-20 resize-none"
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
                <div data-overlay="roster-config-wizard" className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
                    {/* 🧪 The sandbox wizard is WIDER, and scrolls: two tables and a
                        band editor do not fit the live wizard's max-w-lg. Live mode
                        keeps that width, and every class on it, exactly as before. */}
                    <div className={`bg-white dark:bg-slate-800 w-full rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 ${
                        isDemo ? 'max-w-3xl max-h-[90vh] overflow-y-auto' : 'max-w-lg'
                    }`}>
                        
                        <div className="flex items-center gap-2 mb-4">
                            {isDemo && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded">SANDBOX MODE</span>}
                            <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase flex items-center gap-2">
                                <Settings size={20} /> AURA Configuration Wizard
                            </h3>
                        </div>
                        
                        {/* 🧪 SANDBOX: THE ARRANGEMENT PICKER.
                            WAS ONE BUTTON, "Load example department", which filled the
                            tables with a single twelve-person fixture. One fixture
                            demonstrated one team's problem, so three of the four
                            professions who were interviewed sat through a roster that was
                            not about them: the psychologists' question is a monthly clinic
                            with the same clinician on it, the embryologists' is a shift
                            that needs three people at once and a team rotation, the
                            laboratory's is a Saturday FLOOR. None of the three is visible
                            in a run of the respiratory example, however good that example
                            is at what it does show.
                            FOUR OPTIONS, and each carries the ONE LINE that says what it
                            demonstrates — because the choice being made here is between
                            four capabilities, not four casts of fictional names.
                            THE HEALTH WARNING IS RENDERED FROM DATA, not written into this
                            markup: an arrangement carries `correction`, and any arrangement
                            that carries one gets the amber panel. That way an arrangement
                            added later cannot be labelled as a team's real service just
                            because whoever added it forgot the caption — the field is the
                            thing that has to be filled in, and a `null` is a claim.
                            A typed-in team still works and is still the point of the
                            tables: a name alone is enough, and every column beside it is
                            optional. */}
                        {isDemo && (
                            <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                                <p className="text-[10px] font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-widest">
                                    Load an example arrangement
                                </p>
                                <p className="text-[10px] text-emerald-700 dark:text-emerald-300 mt-1 leading-relaxed">
                                    Four teams, four different rostering problems. Each fills the tables below in one
                                    press, and every part of what it loads stays editable — including the fields that
                                    make it interesting.
                                </p>

                                <div className="mt-3 space-y-2">
                                    {DEMO_ARRANGEMENTS.map((arrangement) => {
                                        const loaded = demoArrangement?.id === arrangement.id;
                                        return (
                                            <div
                                                key={arrangement.id}
                                                data-arrangement={arrangement.id}
                                                className={`p-2 rounded-lg border transition-colors ${
                                                    loaded
                                                        ? 'border-emerald-500 bg-white dark:bg-slate-900'
                                                        : 'border-emerald-200/70 dark:border-emerald-800/70'
                                                }`}
                                            >
                                                <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => loadArrangement(arrangement)}
                                                        className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] uppercase tracking-wider transition-colors"
                                                    >
                                                        <Users size={14} /> Load {arrangement.name}
                                                    </button>
                                                    <p className="text-[10px] text-emerald-700 dark:text-emerald-300 leading-relaxed">
                                                        {arrangement.demonstrates}
                                                    </p>
                                                </div>

                                                {/* THE PROVENANCE WARNING. Present whenever the
                                                    arrangement carries one, loaded or not — a
                                                    visitor has to be able to read it BEFORE
                                                    pressing, not only after. The checklist below it
                                                    opens once the arrangement is loaded, because
                                                    five bullet points on every unpressed option is
                                                    a wall of text, and the moment they become
                                                    actionable is the moment the roster exists. */}
                                                {arrangement.correction && (
                                                    <div className="mt-2 flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800">
                                                        <ShieldAlert size={14} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                                        <div>
                                                            <p className="text-[10px] font-black text-amber-800 dark:text-amber-300 uppercase tracking-wide">
                                                                {arrangement.correction.headline}
                                                            </p>
                                                            {loaded && (
                                                                <>
                                                                    <p className="text-[10px] text-amber-800 dark:text-amber-300 leading-relaxed mt-1">
                                                                        {arrangement.correction.body}
                                                                    </p>
                                                                    <p className="text-[10px] font-bold text-amber-800 dark:text-amber-300 mt-1">
                                                                        Please check every one of these:
                                                                    </p>
                                                                    <ul className="mt-0.5 list-disc list-outside pl-4 space-y-0.5">
                                                                        {arrangement.correction.items.map((item) => (
                                                                            <li key={item} className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">
                                                                                {item}
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <p className="text-[10px] text-emerald-700 dark:text-emerald-300 mt-3 leading-relaxed">
                                    Or fill in the tables below with your own team — a name alone is enough, and
                                    anyone you leave blank is treated as full-time with no skills, no leave and no
                                    grade recorded.
                                </p>
                            </div>
                        )}

                        <div className="space-y-4 mb-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase" htmlFor="roster-start-date">Start Date</label>
                                    <input
                                        id="roster-start-date"
                                        type="date"
                                        className="input-field w-full mt-1 font-bold bg-white dark:bg-slate-900 border dark:border-slate-700 rounded p-2 text-slate-800 dark:text-white"
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
                                        className="input-field w-full mt-1 font-bold bg-white dark:bg-slate-900 border dark:border-slate-700 rounded p-2 text-slate-800 dark:text-white"
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
                            {isDemo ? (
                                <RosterDemoWizardTables
                                    bandInputs={demoBandInputs}
                                    bands={demoWizard.bands}
                                    bandsReason={demoWizard.bandsReason}
                                    onBandChange={patchBandInput}
                                    hoursInputs={demoHoursInputs}
                                    hoursErrors={demoWizard.hoursErrors}
                                    onHoursChange={patchHoursInput}
                                    rulesInputs={demoRulesInputs}
                                    rulesErrors={demoWizard.rulesErrors}
                                    onRulesChange={patchRulesInput}
                                    staffRows={demoStaffRows}
                                    staffErrors={demoWizard.staffErrors}
                                    onStaffChange={patchStaffRow}
                                    onStaffAdd={addStaffRow}
                                    onStaffRemove={removeStaffRow}
                                    taskRows={demoTaskRows}
                                    taskErrors={demoWizard.taskErrors}
                                    onTaskChange={patchTaskRow}
                                    onTaskAdd={addTaskRow}
                                    onTaskRemove={removeTaskRow}
                                />
                            ) : (
                                <>
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase" htmlFor="roster-staff-pool">Staff Pool (Order Matters)</label>
                                        <textarea
                                            id="roster-staff-pool"
                                            className="input-field w-full mt-1 h-20 font-mono text-xs bg-white dark:bg-slate-900 border dark:border-slate-700 rounded p-2 text-slate-800 dark:text-white"
                                            value={config.staff.join(', ')}
                                            onChange={(e) => setConfig({...config, staff: e.target.value.split(',').map(s => s.trim())})}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase" htmlFor="roster-tasks">Core Tasks</label>
                                        <textarea
                                            id="roster-tasks"
                                            className="input-field w-full mt-1 h-20 font-mono text-xs bg-white dark:bg-slate-900 border dark:border-slate-700 rounded p-2 text-slate-800 dark:text-white"
                                            value={config.tasks.join(', ')}
                                            onChange={(e) => setConfig({...config, tasks: e.target.value.split(',').map(t => t.trim())})}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        {/* 🧪 Requirement 6, stated where the visitor is about to act. */}
                        {isDemo && (
                            <p className="-mt-4 mb-4 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 leading-relaxed">
                                Sandbox: this runs the real rostering engine in your browser and saves nothing.
                                Nothing is written to the live roster, and closing or reloading this page clears everything.
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

                        <div className="flex gap-2">
                            <button onClick={() => setIsConfigOpen(false)} className="flex-1 py-3 text-slate-500 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
                            <button
                                onClick={handleGenerateClick}
                                disabled={!generateGate.valid}
                                title={generateGate.valid ? undefined : generateGate.reason}
                                className={`flex-1 py-3 text-white font-bold rounded-lg shadow-lg transition-colors flex justify-center items-center gap-2 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 disabled:shadow-none disabled:cursor-not-allowed ${isDemo ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
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
