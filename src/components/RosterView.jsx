import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { db } from '../firebase';
// 🛡️ NEW: Imported collection, addDoc, and serverTimestamp for the Swap Engine
import { doc, onSnapshot, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Calendar, Download, Settings, ChevronLeft, ChevronRight, Play, FileSpreadsheet, ShieldAlert, ArrowRightLeft, X, Users, FlaskConical, CheckCircle2, Info } from 'lucide-react';
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
} from '../utils/auraEngine';

// --- SANDBOX IMPORTS ---
import { useNexus } from '../context/NexusContext';
import { DEMO_EXAMPLE_DEPARTMENT } from '../data/mockData';
// 🧪 SANDBOX ENGINE — the constraint-aware engine, used ONLY on the demo path.
// Live generation still goes through prepareRosterWrite → generateRoster, which
// has characterization tests pinning its byte-exact output and a live document
// reading it. Nothing below migrates live mode.
import {
    generateRosterV2,
    parseLocalDateKey,
    ROSTER_V2_DEFAULTS,
} from '../utils/rosterEngineV2';

// 🌟 IMPORT THE CUSTOM MODAL
import ConfirmationModal from './ConfirmationModal';

/**
 * 🧪 SANDBOX: turn what the Configure wizard holds into a `generateRosterV2`
 * config.
 *
 * The wizard's two textareas are, and stay, plain comma-separated NAMES —
 * requirement 3 of this feature is that a visiting respiratory therapist can
 * type twelve names and eight task names and get a real roster. Everything the
 * engine also understands (FTE, skills, leave, per-task days/skills) arrives
 * through `details`, which "Load example department" fills, and is matched back
 * to the textarea contents BY NAME.
 *
 * That matching is deliberate: edit or delete a name and its extra detail simply
 * stops applying, so the form can never claim a skill for somebody who is no
 * longer in the pool. Anyone without detail gets the engine's own documented
 * defaults (`ROSTER_V2_DEFAULTS.fte`, no skills, no leave) — imported, not
 * re-guessed here.
 *
 * Pure, and exported so it can be reasoned about (and tested) without a DOM.
 */
export const buildDemoRosterV2Config = ({ config, details }) => {
    const cleanNames = (list) =>
        (Array.isArray(list) ? list : [])
            .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
            .filter((entry) => entry !== '');

    const staffDetail = new Map(
        (details?.staff || []).map((person) => [person.name, person]),
    );
    const taskDetail = new Map(
        (details?.tasks || []).map((task) => [task.name, task]),
    );

    return {
        startDate: config.startDate,
        weeks: config.weeks,
        staff: cleanNames(config.staff).map((name) => {
            const extra = staffDetail.get(name);
            return {
                name,
                fte: typeof extra?.fte === 'number' ? extra.fte : ROSTER_V2_DEFAULTS.fte,
                skills: Array.isArray(extra?.skills) ? [...extra.skills] : [],
                unavailable: Array.isArray(extra?.unavailable) ? [...extra.unavailable] : [],
                ...(typeof extra?.maxPerDay === 'number' ? { maxPerDay: extra.maxPerDay } : {}),
            };
        }),
        tasks: cleanNames(config.tasks).map((name) => {
            const extra = taskDetail.get(name);
            return {
                name,
                ...(extra?.requiresSkill ? { requiresSkill: extra.requiresSkill } : {}),
                ...(Array.isArray(extra?.days) ? { days: [...extra.days] } : {}),
                ...(typeof extra?.leads === 'number' ? { leads: extra.leads } : {}),
                ...(typeof extra?.coLeads === 'number' ? { coLeads: extra.coLeads } : {}),
                ...(extra?.category ? { category: extra.category } : {}),
            };
        }),
        ...(details?.rules ? { rules: { ...details.rules } } : {}),
    };
};

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

    // 🧪 SANDBOX STATE — both fields exist only in demo mode and only in memory.
    // `demoResult` is the whole `generateRosterV2` return value (effectiveStart,
    // unfilled, load, warnings, score) so the panel below the calendar can report
    // what the engine actually knew, rather than a summary of it.
    const [demoResult, setDemoResult] = useState(null);
    // The per-person / per-task detail the two name textareas cannot express.
    // `null` until "Load example department" is pressed — a typed-in team runs on
    // the engine's defaults, which is the point of requirement 3.
    const [demoDetails, setDemoDetails] = useState(null);

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
            setDemoDetails(null);
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
            setDemoDetails(null);

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

    // --- ACTIONS ---
    
    /**
     * 🧪 SANDBOX: fill the example department into the wizard.
     *
     * Sets BOTH halves at once — the two name textareas (what the visitor can
     * see and edit) and `demoDetails` (the FTE / skills / leave / per-task days
     * the textareas cannot express). Fresh copies, so a later edit cannot mutate
     * the frozen export through a shared reference.
     */
    const loadExampleDepartment = () => {
        setDemoDetails({
            staff: DEMO_EXAMPLE_DEPARTMENT.staff.map(person => ({ ...person })),
            tasks: DEMO_EXAMPLE_DEPARTMENT.tasks.map(task => ({ ...task })),
            rules: { ...DEMO_EXAMPLE_DEPARTMENT.rules },
        });
        setConfig(prev => ({
            ...prev,
            startDate: DEMO_EXAMPLE_DEPARTMENT.startDate,
            weeks: DEMO_EXAMPLE_DEPARTMENT.weeks,
            staff: DEMO_EXAMPLE_DEPARTMENT.staff.map(person => person.name),
            tasks: DEMO_EXAMPLE_DEPARTMENT.tasks.map(task => task.name),
        }));
    };

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
            const demoConfig = buildDemoRosterV2Config({ config, details: demoDetails });
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

    // --- RENDER HELPERS ---
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth(); 
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay();

    const getShifts = (day) => {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return { shifts: rosterData[dateKey] || [], dateKey };
    };

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
                            <button onClick={() => handleMonthChange(-1)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors text-slate-500">
                                <ChevronLeft size={18} />
                            </button>
                            
                            <span className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase min-w-[140px] text-center whitespace-nowrap">
                                {currentDate.toLocaleString('default', { month: 'long' })} {year}
                            </span>
                            
                            <button onClick={() => handleMonthChange(1)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors text-slate-500">
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex gap-2">
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

            {/* CALENDAR GRID */}
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
                        <div key={day} className="bg-white dark:bg-slate-900 h-32 p-1 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors relative group border-t border-l border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                            <span className="text-xs font-bold text-slate-400 absolute top-1 right-2">{day}</span>
                            
                            <div className="mt-5 flex flex-col gap-1 overflow-y-auto max-h-[90px] custom-scrollbar">
                                {shifts.map((s, idx) => {
                                    // 🌟 UPDATED: Checks both Lead and Co-Lead safely
                                    const isMyShift = isDemo ? true : (s.lead === user?.name || s.coLead === user?.name || s.staff === user?.name);

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
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

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

                    {!demoResult && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            No sandbox roster yet. Open <span className="font-bold">Configure</span>, type your
                            own team (or load the example department) and press{' '}
                            <span className="font-bold">Generate Sandbox Roster</span>. The calendar above is
                            empty because nothing has been generated — not because a roster failed.
                        </p>
                    )}

                    {demoResult && (
                        <>
                            {/* --- run summary --- */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Effective start</p>
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
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hard violations</p>
                                    <p className="text-sm font-black text-slate-800 dark:text-white">{demoResult.score.hardViolations}</p>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400">re-audited, not asserted</p>
                                </div>
                            </div>

                            {/* --- warnings --- */}
                            {demoResult.warnings.length > 0 && (
                                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                                    <p className="text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest mb-2">
                                        Warnings ({demoResult.warnings.length})
                                    </p>
                                    <ul className="space-y-1">
                                        {demoResult.warnings.map((warning, idx) => (
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
                                        <ul className="space-y-1.5">
                                            {demoResult.unfilled.slice(0, DEMO_UNFILLED_PREVIEW).map((slot, idx) => (
                                                <li key={`${slot.date}-${slot.task}-${slot.role}-${idx}`} className="text-xs text-red-800 dark:text-red-300 leading-relaxed">
                                                    <span className="font-black">{slot.date}</span>
                                                    {' · '}
                                                    <span className="font-bold">{slot.task}</span>
                                                    {' · '}
                                                    <span className="uppercase">{describeShiftRole(slot.role)}</span>
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
                                            A day on which every slot failed has no square filled in the calendar above,
                                            so this list is the only record that it was attempted. AURA leaves the slot
                                            empty and names the binding constraint rather than assigning somebody who is
                                            unqualified, on leave, or already at their limit.
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
                                                <th className="font-bold uppercase text-[10px] py-1 pr-3">FTE</th>
                                                <th className="font-bold uppercase text-[10px] py-1 pr-3">Duties</th>
                                                <th className="font-bold uppercase text-[10px] py-1 pr-3">Per FTE</th>
                                                <th className="font-bold uppercase text-[10px] py-1">Share</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(demoResult.load).map(([name, entry]) => (
                                                <tr key={name} className="border-t border-slate-200 dark:border-slate-700">
                                                    <td className="py-1 pr-3 font-bold text-slate-700 dark:text-slate-200">{name}</td>
                                                    <td className="py-1 pr-3 text-slate-500 dark:text-slate-400">{entry.fte}</td>
                                                    <td className="py-1 pr-3 font-black text-slate-800 dark:text-white">{entry.duties}</td>
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
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* --- MODAL: SWAP REQUEST --- */}
            {isSwapModalOpen && selectedShift && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsSwapModalOpen(false)}></div>
                    <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-700">
                        
                        <div className="bg-gradient-to-r from-indigo-500 to-purple-500 p-4 flex justify-between items-center text-white">
                            <div className="flex items-center gap-2">
                                <ArrowRightLeft size={18} />
                                <h3 className="text-sm font-black uppercase tracking-wider">Shift Swap Request</h3>
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
                                {isSubmitting
                                    ? 'Transmitting...'
                                    : (swapSubject?.onBehalf ? 'Arrange Cover' : 'Submit Request')}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {isConfigOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
                    <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-700 animate-in zoom-in-95">
                        
                        <div className="flex items-center gap-2 mb-4">
                            {isDemo && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded">SANDBOX MODE</span>}
                            <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase flex items-center gap-2">
                                <Settings size={20} /> AURA Configuration Wizard
                            </h3>
                        </div>
                        
                        {/* 🧪 SANDBOX: one press fills a whole fictional department —
                            twelve staff, eight tasks, three skills, a 0.6 FTE
                            part-timer and a day of leave. It is the only way to get
                            skills/FTE/leave in from this wizard, and it is the
                            configuration the unfilled-slot behaviour is demonstrated
                            with. Typed-in names alone still work; they just run on the
                            engine's defaults. */}
                        {isDemo && (
                            <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                                <button
                                    type="button"
                                    onClick={loadExampleDepartment}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider transition-colors"
                                >
                                    <Users size={14} /> Load example department
                                </button>
                                <p className="text-[10px] text-emerald-700 dark:text-emerald-300 mt-2 leading-relaxed">
                                    {DEMO_EXAMPLE_DEPARTMENT.label} — {DEMO_EXAMPLE_DEPARTMENT.staff.length} staff,
                                    {' '}{DEMO_EXAMPLE_DEPARTMENT.tasks.length} tasks, skill-gated duties, one
                                    part-timer and one person on leave. Or just type your own team below —
                                    names alone are enough. Anyone you give no details for is assumed
                                    full-time ({ROSTER_V2_DEFAULTS.fte} FTE), with no skill requirements
                                    and no leave.
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
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase" htmlFor="roster-staff-pool">Staff Pool (Order Matters)</label>
                                {/* 🧪 `readOnly={isDemo}` and the "Simulation Locked:
                                    Using Marvel Dataset" caption are GONE. A visiting
                                    respiratory therapist or psychologist types their own
                                    team here and gets a roster for it — that is the
                                    whole point of the sandbox, and a locked box that
                                    always answers with the same five Marvel names
                                    demonstrates nothing. */}
                                <textarea
                                    id="roster-staff-pool"
                                    className="input-field w-full mt-1 h-20 font-mono text-xs bg-white dark:bg-slate-900 border dark:border-slate-700 rounded p-2 text-slate-800 dark:text-white"
                                    value={config.staff.join(', ')}
                                    placeholder={isDemo ? 'e.g. Aisha, Ben, Chloe, Daniel' : undefined}
                                    onChange={(e) => setConfig({...config, staff: e.target.value.split(',').map(s => s.trim())})}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase" htmlFor="roster-tasks">Core Tasks</label>
                                <textarea
                                    id="roster-tasks"
                                    className="input-field w-full mt-1 h-20 font-mono text-xs bg-white dark:bg-slate-900 border dark:border-slate-700 rounded p-2 text-slate-800 dark:text-white"
                                    value={config.tasks.join(', ')}
                                    placeholder={isDemo ? 'e.g. Ward Round, Outpatient Clinic, Group Therapy' : undefined}
                                    onChange={(e) => setConfig({...config, tasks: e.target.value.split(',').map(t => t.trim())})}
                                />
                            </div>
                        </div>

                        {/* 🧪 Requirement 6, stated where the visitor is about to act. */}
                        {isDemo && (
                            <p className="-mt-4 mb-4 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 leading-relaxed">
                                Sandbox: this runs the real rostering engine in your browser and saves nothing.
                                Nothing is written to the live roster, and closing or reloading this page clears everything.
                            </p>
                        )}

                        {statusSlot === 'config' && statusBanner}

                        {/* 🛡️ M3 FIX: tell the user why generation is unavailable. */}
                        {!configValidation.valid && (
                            <p className="-mt-4 mb-4 text-xs font-bold text-red-600 dark:text-red-400 flex items-start gap-1.5">
                                <ShieldAlert size={14} className="shrink-0 mt-px" />
                                <span>{configValidation.reason}</span>
                            </p>
                        )}

                        <div className="flex gap-2">
                            <button onClick={() => setIsConfigOpen(false)} className="flex-1 py-3 text-slate-500 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
                            <button
                                onClick={handleGenerateClick}
                                disabled={!configValidation.valid}
                                title={configValidation.valid ? undefined : configValidation.reason}
                                className={`flex-1 py-3 text-white font-bold rounded-lg shadow-lg transition-colors flex justify-center items-center gap-2 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 disabled:shadow-none disabled:cursor-not-allowed ${isDemo ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                            >
                                {/* 🧪 It said "Simulate Check" while doing nothing at
                                    all. It generates a roster now, so it says so. */}
                                <Play size={16} /> {isDemo ? 'Generate Sandbox Roster' : 'Generate Roster'}
                            </button>
                        </div>
                    </div>
                </div>
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
