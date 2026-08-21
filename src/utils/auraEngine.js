// src/utils/auraEngine.js

// THE MODULE'S ONLY IMPORT, and why it is safe where others were refused: this
// file is deliberately standalone (plain-Node-resolvable, no cycle with the V2
// engine). `rosterCategories` is a dependency-free leaf holding the owner's
// category palette — Management yellow, Clinical brown, Research limegreen,
// Education orange — and the ICS export below must emit the SAME palette the
// calendar draws, so a second copy here is the drift this import prevents.
import { categoryCssColor } from './rosterCategories.js';

// --- 0. THE SHIFT DISPLAY STRING — ONE DEFINITION ----------------------------
//
// `staff` is a DERIVED DISPLAY STRING, not an identity. It stopped being an
// identity on 6 May 2026 (commit 2de3dde) and only three of its four consumers
// were reconciled (ROSTER_POSTMORTEM.md A-RC1). Every producer of that string —
// `generateRoster` below and the swap mutator in AuraPulseBot.jsx — now goes
// through this one function so the two cannot drift apart again.
//
// The exact format is load-bearing: `buildICS` puts it in a VEVENT SUMMARY (now
// RFC 5545-escaped on the way — audit M6) and RosterView renders it in the
// calendar cell.
//
// A shift with no co-lead (the pre-6-May legacy shape had only one person)
// yields `Lead: X` rather than `Lead: X, Co: undefined`.
export const buildShiftStaffLabel = (lead, coLead) => {
    const hasCoLead = typeof coLead === 'string' && coLead.trim() !== '';
    return hasCoLead ? `Lead: ${lead}, Co: ${coLead}` : `Lead: ${lead}`;
};

// --- 1. CORE LOGIC ---

// Helper: Rotate array by k steps (Cyclic Shift)
const rotate = (arr, k) => {
    const n = arr.length;
    const offset = k % n;
    return [...arr.slice(offset), ...arr.slice(0, offset)];
};

// --- 1a. DATE PRIMITIVES (ROSTER_TODO.md P4 — post-mortem B1/B2, audit M2) ---
//
// BOTH HALVES ARE LOCAL, AND THAT IS THE WHOLE POINT.
//
// Before P4 this engine parsed `startDate` with `new Date("YYYY-MM-DD")` — which
// V8 reads as UTC midnight — and then emitted keys with
// `toISOString().split('T')[0]`. Those two inconsistencies cancelled: local
// `setDate` arithmetic preserves the wall-clock time, so a constant UTC offset
// went in and came back out and every fixed-offset zone produced identical keys.
//
// Fixing only the OUTPUT half (the rev-1 remediation plan) breaks that
// cancellation and puts every key a day early west of Greenwich — measured,
// `TZ=America/New_York` -> `2026-01-31, 2026-02-01, …`. So the parse and the key
// derivation move together, or neither moves. See ROSTER_POSTMORTEM.md B2 rev2.
//
// The residual defect the cancellation could NOT hide is DST (ROSTER_QC_AUDIT.md
// M2): `setDate` on a live instant carries the wall-clock TIME across a
// spring-forward boundary, dragging the underlying instant over a UTC date line,
// so every week after the transition slid one day early (measured: start
// `2026-03-02` under `TZ=America/New_York` -> weeks 2-4 ran Sun-Thu). `addDays`
// below rebuilds the date from calendar PARTS instead, which asks the runtime
// for local midnight on a calendar day — the question a roster actually needs
// answered — and is therefore immune to the transition.
//
// `rosterEngineV2.js` has equivalents (`parseLocalDateKey`, `toLocalDateKey`,
// `snapToMonday`) and they are deliberately NOT imported here: V2 already
// imports `buildShiftStaffLabel` and `MAX_ROSTER_WEEKS` from this file, so
// importing back would make the two modules circular. Four lines each is cheaper
// than the cycle, and `auraEngine.test.js` pins that the two `snapToMonday`
// implementations agree so they cannot drift.

/** `'2026-02-02'` -> local midnight on 2 Feb 2026. Never a UTC instant. */
export const parseLocalStartDate = (key) => {
    const [y, m, d] = String(key).split('-').map(Number);
    return new Date(y, m - 1, d);
};

/** Local `Date` -> `'YYYY-MM-DD'`. Local getters only; no `toISOString`. */
export const toDateKey = (date) => {
    const y = String(date.getFullYear()).padStart(4, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

/** `date` + `n` days, rebuilt from calendar parts. The DST-safe form. */
const addDays = (date, n) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

/**
 * The Monday of `date`'s week.
 *
 * WEEK CONVENTION — identical to `rosterEngineV2.snapToMonday`, on purpose: two
 * engines writing into the same document must not disagree about which Monday a
 * date belongs to. `Date.prototype.getDay` treats Sunday as day 0, i.e. the
 * first day of the week, so the Monday of a Sunday's week is the FOLLOWING day.
 * Monday through Saturday step back to the Monday that opened their week.
 *
 * The ISO-8601 reading (Sunday closes the previous week) would snap the shipped
 * default `2026-02-01` back to Monday 26 January — a roster starting six days
 * before the date the roster master typed. Post-mortem B1 describes that default
 * as a Sunday that was MEANT to open a Mon-Fri block, so forward matches intent.
 *
 * The snap is not silent: `describeGenerationRange` reads the real keys, so the
 * confirmation modal shows the snapped first day before anything is written.
 */
export const snapToMonday = (date) => {
    const day = date.getDay();
    return addDays(date, day === 0 ? 1 : 1 - day);
};

export const generateRoster = (config) => {
    const { staff, tasks, startDate, weeks } = config;
    // 🛡️ P4 / B1: the "Mon-Fri" below is now enforced, not merely asserted in a
    // comment. The shipped default `2026-02-01` is a SUNDAY, and the old loop
    // filled whatever five days followed it — Sun-Thu, with `VC (PM)` ("Tuesday")
    // on a Monday and `VC (AM)` ("Saturday") on a Friday. Snapping to the Monday
    // of the requested week makes every fixed offset below mean what it says.
    //
    // RETURN SHAPE IS UNCHANGED — still the bare `{ dateKey: [shift, …] }` map.
    // `prepareRosterWrite` hands this straight to `setDoc`, so it must stay a
    // roster and nothing else; the effective start is surfaced through
    // `describeGenerationRange`, which derives it from these keys.
    const start = snapToMonday(parseLocalStartDate(startDate));
    let roster = {};

    // --- A. MAIN CORE TASKS (Mon-Fri) ---
    for (let w = 0; w < weeks; w++) {
        const weekStart = addDays(start, w * 7);

        const currentStaffOrder = rotate(staff, w);

        tasks.forEach((taskName, taskIdx) => {
            const leadStaff = currentStaffOrder[taskIdx % staff.length];
            const coLeadStaff = currentStaffOrder[(taskIdx + 1) % staff.length];

            for (let d = 0; d < 5; d++) {
                const dateKey = toDateKey(addDays(weekStart, d));

                if (!roster[dateKey]) roster[dateKey] = [];
                
                // Unified shift object per task
                roster[dateKey].push({
                    task: taskName,
                    lead: leadStaff,
                    coLead: coLeadStaff,
                    staff: buildShiftStaffLabel(leadStaff, coLeadStaff), // Formats the UI and ICS perfectly
                    category: 'CORE', 
                    week: w + 1
                });
            }
        });

        // --- B. VC TASKS (Tue & Sat) ---
        const vcLead = staff[w % staff.length];
        const vcCoLead = staff[(w + 1) % staff.length];

        // Tuesday (Index 1) — genuinely a Tuesday now that `weekStart` is a Monday.
        const tueKey = toDateKey(addDays(weekStart, 1));

        if (!roster[tueKey]) roster[tueKey] = [];
        roster[tueKey].push({ 
            task: "VC (PM)",
            lead: vcLead,
            coLead: vcCoLead,
            staff: buildShiftStaffLabel(vcLead, vcCoLead),
            category: "VC", 
            week: w + 1 
        });

        // Saturday (Index 5) — genuinely a Saturday, for the same reason.
        const satKey = toDateKey(addDays(weekStart, 5));

        if (!roster[satKey]) roster[satKey] = [];
        roster[satKey].push({ 
            task: "VC (AM)",
            lead: vcLead,
            coLead: vcCoLead,
            staff: buildShiftStaffLabel(vcLead, vcCoLead),
            category: "VC", 
            week: w + 1 
        });
    }

    return roster;
};


// --- 1b. GENERATION GUARDS (ROSTER_TODO.md P1) -------------------------------
//
// Nothing below changes how a roster is scheduled. These are the guards that
// stand between the Configure wizard and `setDoc`, plus the helpers the
// confirmation modal needs in order to describe the write truthfully.
//
// They live here, next to `generateRoster`, so they can be unit-tested without
// mounting RosterView (which would drag in Firebase). RosterView keeps only the
// wiring; every decision it makes is one of these pure functions.

/**
 * Upper bound on a single generation run.
 *
 * 52 weeks is one calendar year, and the roster is persisted in a single
 * per-year document (`system_data/roster_2026`). A run longer than a year
 * cannot be addressed by the document it is written to, so anything above 52 is
 * a typo rather than an intent. (Per-year partitioning is ROSTER_TODO.md P7;
 * when that lands this ceiling is still the right one per document.)
 */
export const MAX_ROSTER_WEEKS = 52;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * The LIVE (non-demo) generation defaults.
 *
 * These are byte-for-byte the values RosterView used to hardcode in its
 * `useState` initialiser. They are lifted to module scope for one reason: the
 * demo effect overwrites `config.staff` / `config.tasks` with the Marvel
 * dataset, and leaving demo mode has to be able to put the real pool back
 * (ROSTER_QC_AUDIT.md M1). A single source for "initial value" and "value after
 * leaving demo mode" means the two cannot drift apart.
 *
 * NOT sourced from TEAM_DIRECTORY on purpose — that is ROSTER_TODO.md P7 and it
 * is blocked on which roles are rosterable. Changing the pool here would change
 * live behaviour, which this plan must not do.
 */
/**
 * ⚠️ KNOWN STALE, AND KEPT THAT WAY DELIBERATELY. `staff` lists four clinicians;
 *    the department has five, because the service lead practises too and nobody
 *    edited this array when that became true. That is exactly the failure a
 *    hardcoded team produces — the list quietly stops describing the department and
 *    nothing says so.
 *
 *    It is NOT corrected here, for two reasons: it is deleted by the migration
 *    anyway, and `auraEngine.guards.test.js` pins these values as the fixture for
 *    the demo-poisoning guard — editing them would obscure what that suite is for.
 *    The authority is now the team's own member list, and
 *    `scripts/team-one-manifest.cjs` records the real five.
 */
export const LIVE_ROSTER_DEFAULTS = Object.freeze({
    staff: Object.freeze(['Brandon', 'Ying Xian', 'Derlinder', 'Fadzlynn']),
    tasks: Object.freeze(['EFT', 'IPT+SKG', 'NC', 'FSG+WI']),
    startDate: '2026-02-01',
    weeks: 4,
});

/**
 * Restore the live staff pool and task list onto an existing config.
 *
 * Called with no argument it returns a complete fresh live config (RosterView's
 * initial state). Called with the current config it restores only the two
 * fields demo mode overwrites, so an in-progress `startDate` / `weeks` edit is
 * preserved across a mode toggle.
 *
 * Always returns fresh arrays, so a later `setConfig` cannot mutate
 * LIVE_ROSTER_DEFAULTS through a shared reference.
 *
 * ── `live` — THE MULTI-TEAM ARGUMENT ─────────────────────────────────────────
 *
 * `LIVE_ROSTER_DEFAULTS` above is a FOURTH hardcoded copy of one department: four
 * names and four task codes belonging to Sport & Exercise Medicine at KKH. It sits
 * alongside `TEAM_DIRECTORY`, `ADMIN_EMAILS` and the directory in
 * `firestore.rules`, and it is the copy that decides who a roster can be generated
 * FOR — so a respiratory therapy lead pressing Generate would have staffed their
 * week with four clinical exercise physiologists from another service.
 *
 * The second parameter lets the caller pass the ACTIVE TEAM's own people and tasks.
 * It is optional, and omitting it falls back to the hardcoded four, which is what
 * keeps the pre-migration bridge working and every existing test in
 * `auraEngine.guards.test.js` passing unchanged.
 *
 * ⚠️ AN EMPTY ARRAY IS AN ANSWER, NOT A MISSING ONE. If the caller passes
 *    `staff: []` it means "this team has nobody in the pool yet" and is used
 *    verbatim; only an ABSENT `staff` falls back to the hardcoded four. That
 *    distinction is load-bearing: `LIVE_ROSTER_DEFAULTS.staff` turned out to be
 *    STALE — it lists four clinicians and the service lead, who also practises, was
 *    never added to it. Falling back to it while a team's members were still loading
 *    would have let a lead press Generate and produce a four-person roster for a
 *    five-person department, which looks entirely plausible.
 *
 *    With an empty pool `validateRosterConfig` disables Generate and says "staff
 *    pool is empty", which is true and harmless. Waiting beats guessing.
 *
 * ⚠️ DELETE THE FALLBACK — and `LIVE_ROSTER_DEFAULTS` with it — once the migration
 *    has run. It exists only for the pre-migration bridge, where there is no team to
 *    ask.
 */
export const restoreLiveRosterConfig = (prev, live) => {
    const pick = (value, fallback) => (Array.isArray(value) ? [...value] : [...fallback]);
    return {
        ...(prev || LIVE_ROSTER_DEFAULTS),
        staff: pick(live?.staff, LIVE_ROSTER_DEFAULTS.staff),
        tasks: pick(live?.tasks, LIVE_ROSTER_DEFAULTS.tasks),
    };
};

/** True only for a real calendar date written exactly as `YYYY-MM-DD`. */
const isRealDateKey = (value) => {
    if (typeof value !== 'string' || !DATE_KEY_PATTERN.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number);
    // Round-trip check: V8 silently rolls "2026-02-30" over to 2 March, so
    // pattern-matching alone is not enough.
    const utc = new Date(Date.UTC(y, m - 1, d));
    return (
        utc.getUTCFullYear() === y &&
        utc.getUTCMonth() === m - 1 &&
        utc.getUTCDate() === d
    );
};

/**
 * Is this config safe to hand to `generateRoster`?
 *
 * Returns `{ valid, reason }`, where `reason` is a sentence that can be shown
 * to the user verbatim. The `weeks` rules close ROSTER_QC_AUDIT.md M3:
 * `parseInt("")` is `NaN`, `for (w = 0; w < NaN; w++)` never runs, and the
 * resulting `{}` used to be written over the live roster with a success alert.
 */
export const validateRosterConfig = (config) => {
    const invalid = (reason) => ({ valid: false, reason });

    if (!config || typeof config !== 'object') {
        return invalid('No roster configuration was supplied.');
    }

    const { staff, tasks, startDate, weeks } = config;

    if (!isRealDateKey(startDate)) {
        return invalid('Choose a valid start date before generating.');
    }

    // `weeks` must already be a number: RosterView stores '' for an empty input
    // rather than NaN, and '' must be rejected here, not coerced to 0.
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

    const named = (list) =>
        Array.isArray(list) && list.some((entry) => typeof entry === 'string' && entry.trim() !== '');

    if (!named(staff)) {
        return invalid('The staff pool is empty — add at least one name.');
    }
    if (!named(tasks)) {
        return invalid('The core task list is empty — add at least one task.');
    }

    return { valid: true, reason: null };
};

/**
 * Human label for a roster key, e.g. `2026-02-01` -> `Sun 1 Feb 2026`.
 *
 * Parsed as UTC on purpose: "what weekday is the string 2026-02-01?" is a
 * calendar fact, so the label must not shift with the viewer's timezone.
 */
export const formatRosterDateKey = (key) => {
    if (!isRealDateKey(key)) return String(key ?? '');
    const [y, m, d] = key.split('-').map(Number);
    const utc = new Date(Date.UTC(y, m - 1, d));
    return `${WEEKDAY_LABELS[utc.getUTCDay()]} ${d} ${MONTH_LABELS[m - 1]} ${y}`;
};

/**
 * The exact span of dates a generation run would write.
 *
 * Derived from `generateRoster`'s real output rather than recomputed, so the
 * confirmation modal cannot drift from what is actually written.
 *
 * That is also how the P4 Monday snap reaches the user without changing
 * `generateRoster`'s return shape: `firstDate` is read back off the generated
 * keys, so a Sunday `startDate` reports the Monday the roster will actually
 * open on (ROSTER_TODO.md P4.2 / post-mortem B1) and the modal states the snap
 * before anything is written.
 *
 * Returns `null` when the config could not be generated at all.
 */
export const describeGenerationRange = (config) => {
    if (!validateRosterConfig(config).valid) return null;

    const keys = Object.keys(generateRoster(config)).sort();
    if (keys.length === 0) return null;

    return {
        firstDate: keys[0],
        lastDate: keys[keys.length - 1],
        dayCount: keys.length,
    };
};

/**
 * The single decision point in front of `setDoc`.
 *
 * Returns `{ ok: true, data }` only when the config is valid AND the generated
 * roster actually contains dates. Belt and braces on purpose: the validator
 * stops M3's known cause, the non-empty assertion stops every other cause of
 * the same catastrophe (ROSTER_TODO.md 1.2 + 1.3).
 *
 * `generate` is injectable so the empty-roster branch is reachable from tests
 * without having to find a config that produces `{}`.
 */
export const prepareRosterWrite = (config, generate = generateRoster) => {
    const validation = validateRosterConfig(config);
    if (!validation.valid) {
        return { ok: false, reason: validation.reason, data: null };
    }

    const data = generate(config);
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
        return {
            ok: false,
            reason:
                'AURA produced an empty schedule for this configuration, so nothing was written. The existing roster is unchanged.',
            data: null,
        };
    }

    return { ok: true, reason: null, data };
};


// --- 1c. SHIFT IDENTITY + SWAP APPLICATION (ROSTER_TODO.md P6 / Block A) ------
//
// This section is the single owner of the shift object's *identity*. Before it
// existed, `RosterView` read `lead`/`coLead`/`staff`, `generateRoster` wrote all
// three, and `AuraPulseBot` compared `staff` to a bare name — three files with
// three different ideas of what a shift is (ROSTER_POSTMORTEM.md A1/A2).
//
// SWAP SEMANTICS — MECHANICAL SUBSTITUTION (user decision, not inferred):
// the covering colleague takes over EXACTLY the role the requester held. Lead
// for lead, co-lead for co-lead. No promotion, and no third person's duty
// changes. `applyShiftSubstitution` is the only place that rule lives.
//
// SHAPE TOLERANCE: the live document may still hold pre-6-May shifts where
// `staff` was a bare identity and `lead`/`coLead` are absent. Whether it does is
// unknown and will not be established before the presentation
// (ROSTER_TODO.md "A1 live status: LIVE-VERIFY PENDING"), so every reader here
// handles both shapes, and a write upgrades a legacy shift to the modern one.
//
// Everything below is pure: no Firestore, no React. The components keep only
// the wiring.

export const SHIFT_ROLE_LEAD = 'lead';
export const SHIFT_ROLE_CO_LEAD = 'coLead';

/** The two roles a person can hold on a shift, in `swapRole`'s vocabulary. */
export const SHIFT_ROLES = Object.freeze([SHIFT_ROLE_LEAD, SHIFT_ROLE_CO_LEAD]);

/** Human wording for a role, for messages shown to a clinician. */
export const describeShiftRole = (role) => {
    if (role === SHIFT_ROLE_LEAD) return 'lead';
    if (role === SHIFT_ROLE_CO_LEAD) return 'co-lead';
    return 'unknown duty';
};

/** A display string always starts `Lead: `; a bare identity never does. */
const DISPLAY_LABEL_PATTERN = /^\s*Lead:\s/i;

const asName = (value) => (typeof value === 'string' && value.trim() !== '' ? value : null);

/**
 * Who actually holds this shift, whichever schema version wrote it.
 *
 * Returns `{ lead, coLead, legacy }` where the names are `null` when absent and
 * `legacy` is true only for a genuine pre-refactor shift — `lead`/`coLead` both
 * missing and `staff` holding a bare name. A `staff` that looks like a display
 * string with no `lead`/`coLead` is treated as having NO readable identity
 * rather than being parsed back out of the label: re-deriving identity from a
 * formatted string is what created this class of bug in the first place.
 */
export const readShiftIdentities = (shift) => {
    if (!shift || typeof shift !== 'object') {
        return { lead: null, coLead: null, legacy: false };
    }

    const lead = asName(shift.lead);
    const coLead = asName(shift.coLead);
    if (lead || coLead) return { lead, coLead, legacy: false };

    const bare = asName(shift.staff);
    if (bare && !DISPLAY_LABEL_PATTERN.test(bare)) {
        // Pre-6-May: `staff` WAS the identity, and there was only ever one
        // person on a shift. That person is the lead.
        return { lead: bare, coLead: null, legacy: true };
    }

    return { lead: null, coLead: null, legacy: false };
};

/**
 * Which role does `name` hold on this shift? `'lead'`, `'coLead'` or `null`.
 *
 * Identity comparison, never `includes()`. The substring test it replaces
 * (ROSTER_POSTMORTEM.md A4) matched "Lynn" inside "Fadzlynn".
 */
export const shiftRoleOf = (shift, name) => {
    const who = asName(name);
    if (!who) return null;

    const { lead, coLead } = readShiftIdentities(shift);
    if (lead === who) return SHIFT_ROLE_LEAD;
    if (coLead === who) return SHIFT_ROLE_CO_LEAD;
    return null;
};

/**
 * Mechanical substitution: `incomingStaff` takes over `role`, nothing else moves.
 *
 * Also normalises the shift to the modern shape — a legacy shift comes back with
 * a real `lead` field and a `Lead: …` display string, so the same document is
 * never read as legacy twice. Returns the shift unchanged if the arguments make
 * no sense; callers decide via `planSwapApplication`, which refuses first.
 */
export const applyShiftSubstitution = (shift, role, incomingStaff) => {
    const incoming = asName(incomingStaff);
    if (!shift || typeof shift !== 'object') return shift;
    if (!incoming) return shift;
    if (role !== SHIFT_ROLE_LEAD && role !== SHIFT_ROLE_CO_LEAD) return shift;

    const { lead, coLead } = readShiftIdentities(shift);
    const nextLead = role === SHIFT_ROLE_LEAD ? incoming : lead;
    const nextCoLead = role === SHIFT_ROLE_CO_LEAD ? incoming : coLead;

    const next = {
        ...shift,
        lead: nextLead,
        staff: buildShiftStaffLabel(nextLead, nextCoLead),
    };

    // A legacy shift had no co-lead. Inventing one would put a clinician on a
    // duty nobody assigned them, so the field stays absent.
    if (nextCoLead === null) delete next.coLead;
    else next.coLead = nextCoLead;

    return next;
};

/**
 * The colleagues who could cover this shift: the configured pool minus the
 * people already on it.
 *
 * Replaces `config.staff.filter(n => !selectedShift.staff?.includes(n))`
 * (RosterView.jsx), a substring test against the composite display string that
 * silently dropped any colleague whose name is a substring of another's.
 */
export const filterSwapCandidates = (staffPool, shift) => {
    if (!Array.isArray(staffPool)) return [];

    const { lead, coLead } = readShiftIdentities(shift);
    const onShift = new Set([lead, coLead].filter(Boolean));

    return staffPool.filter((name) => {
        const candidate = asName(name);
        return candidate !== null && !onShift.has(candidate);
    });
};

/**
 * The duties this shift actually has somebody in, in a stable order.
 *
 * A modern shift normally yields both roles; a pre-6-May legacy shift, or a
 * modern shift written with no co-lead, yields only `lead`. A shift whose
 * identities cannot be read at all yields `[]` — and an empty list is the signal
 * that there is nobody to arrange cover FOR, not an invitation to guess.
 *
 * Each entry is `{ role, holder }` so a caller can label a control with the
 * person's name without re-reading the shift.
 */
export const assignableShiftRoles = (shift) => {
    const { lead, coLead } = readShiftIdentities(shift);

    const roles = [];
    if (lead) roles.push({ role: SHIFT_ROLE_LEAD, holder: lead });
    if (coLead) roles.push({ role: SHIFT_ROLE_CO_LEAD, holder: coLead });
    return roles;
};

/**
 * WHOSE shift is being handed over, and which duty — decided at REQUEST time.
 *
 * This closes ROSTER_QC_AUDIT.md M11. `RosterView` used to write
 * `requestedBy: <the clicking user>` unconditionally, while `swapRole` came from
 * `shiftRoleOf(shift, <the clicking user>)`. For an admin acting on a shift they
 * do not hold — and the app's only admins are not in the roster staff pool at
 * all — that pair is `(<admin>, null)`: a request `planSwapApplication` is
 * guaranteed to refuse, because it searches that day for the admin's own name.
 *
 * The semantics, which are a decision and not a derivation:
 *
 *   • The acting user HOLDS the shift (lead or coLead) — they are asking for
 *     cover for themselves. `requestedBy` is them, `swapRole` is their own duty,
 *     and no `initiatedBy` is recorded. This is the pre-existing behaviour and
 *     is deliberately untouched. A `chosenRole` is IGNORED on this path: an
 *     admin who is on the shift is still swapping their own duty, not
 *     reassigning their colleague's.
 *
 *   • The acting user does NOT hold the shift but IS an admin — they are
 *     arranging cover ON BEHALF OF the clinician who does hold it. So
 *     `requestedBy` is that clinician (the person being swapped out, which is
 *     what the mutator matches on), `swapRole` is that clinician's duty, and
 *     `initiatedBy` records the admin so the ledger still says who arranged it.
 *
 *   • Anyone else — refused here, with a reason. `handleShiftClick` already
 *     prevents them from opening the modal; this is the second latch.
 *
 * `chosenRole` is only consulted when the shift has more than one assignable
 * duty. With exactly one there is no choice to make, so it is selected
 * automatically (`autoSelected: true`) and `chosenRole` is not consulted at all
 * — a legacy single-holder shift must not require the admin to pick `lead` out
 * of a list of one.
 *
 * Returns the full triple plus everything the modal needs to describe itself:
 * `{ ok, reason, requestedBy, swapRole, initiatedBy, onBehalf, holdsShift,
 * assignableRoles, autoSelected }`. `assignableRoles` is populated even on the
 * refusal paths, because the "pick a duty" refusal is exactly when the UI needs
 * the list in order to offer the choice.
 *
 * Pure: no React, no Firestore. The triple it returns is the triple that later
 * reaches `planSwapApplication` as `{ requestedBy, swapRole }`.
 */
export const resolveSwapSubject = ({ shift, actingUser, isAdmin = false, chosenRole = null } = {}) => {
    const assignableRoles = assignableShiftRoles(shift);
    const acting = asName(actingUser);

    const base = {
        ok: false,
        reason: null,
        requestedBy: null,
        swapRole: null,
        initiatedBy: null,
        onBehalf: false,
        holdsShift: false,
        assignableRoles,
        autoSelected: false,
    };

    // 1. The acting user is on this shift: unchanged behaviour, whatever their role.
    const heldRole = shiftRoleOf(shift, acting);
    if (heldRole) {
        return {
            ...base,
            ok: true,
            requestedBy: acting,
            swapRole: heldRole,
            holdsShift: true,
        };
    }

    // 2. Not on the shift and not an admin: nobody's cover to arrange.
    if (!isAdmin) {
        return {
            ...base,
            reason: acting
                ? `${acting} is not on this shift, so there is no duty to hand over. Only an administrator can arrange cover on someone else's behalf.`
                : 'AURA could not tell who is making this request, so it has not been sent.',
        };
    }

    // 3. An admin arranging cover for somebody else.
    if (!acting) {
        // `initiatedBy` is the whole point of this path — an unattributable
        // reassignment of a clinician's duty is worse than no reassignment.
        return {
            ...base,
            reason: 'AURA could not tell who is arranging this cover, so it has not been sent.',
        };
    }

    if (assignableRoles.length === 0) {
        return {
            ...base,
            reason: 'This shift does not record who is on it, so there is nobody to arrange cover for. Regenerate the roster for this date first.',
        };
    }

    const chosen =
        assignableRoles.length === 1
            ? assignableRoles[0]
            : assignableRoles.find((entry) => entry.role === chosenRole);

    if (!chosen) {
        const options = assignableRoles
            .map((entry) => `${describeShiftRole(entry.role)} (${entry.holder})`)
            .join(' or ');
        return {
            ...base,
            reason: `Choose whose duty you are arranging cover for: ${options}.`,
        };
    }

    return {
        ...base,
        ok: true,
        requestedBy: chosen.holder,
        swapRole: chosen.role,
        initiatedBy: acting,
        onBehalf: true,
        autoSelected: assignableRoles.length === 1,
    };
};

/**
 * Decide — without writing anything — how a swap acceptance should change the
 * roster. This is the whole of the mutator's judgment; AuraPulseBot only
 * performs the I/O around it.
 *
 * `swap` is the `shift_swaps` document: `{ originalShiftDate, originalTask,
 * requestedBy, swapRole }`. `swapRole` is written by RosterView at request time
 * (ROSTER_POSTMORTEM.md A3 — its absence was the true root cause); requests
 * created before that field existed simply lack it, and are matched on identity
 * alone.
 *
 * Returns `{ ok: true, dateKey, role, index, shifts }` — `shifts` being the new
 * array for that one day — or `{ ok: false, reason }` with a sentence that can
 * be shown to a clinician verbatim. There is no third outcome: a no-match is a
 * refusal, never a silent pass-through that reports success.
 */
export const planSwapApplication = ({ roster, swap, coveringStaff } = {}) => {
    const fail = (reason) => ({ ok: false, reason, dateKey: null, role: null, index: -1, shifts: null });

    if (!swap || typeof swap !== 'object') {
        return fail('The coverage request is missing its details, so I could not look up the shift.');
    }

    const dateKey = asName(swap.originalShiftDate);
    const task = asName(swap.originalTask);
    const requestedBy = asName(swap.requestedBy);
    const covering = asName(coveringStaff);

    if (!dateKey || !task || !requestedBy) {
        return fail('The coverage request does not say which shift it refers to (missing date, task or requester).');
    }
    if (!covering) {
        return fail('I could not tell who is taking the shift over, so I have not touched the roster.');
    }
    if (covering === requestedBy) {
        return fail(`${requestedBy} already holds that shift — a swap with themselves would change nothing.`);
    }
    if (!roster || typeof roster !== 'object') {
        return fail('The master roster document could not be read, so there was nothing to update.');
    }

    const day = roster[dateKey];
    if (!Array.isArray(day) || day.length === 0) {
        return fail(`The master roster has no shifts stored on ${dateKey}. It may have been regenerated since this request was made.`);
    }

    const wantedRole = SHIFT_ROLES.includes(swap.swapRole) ? swap.swapRole : null;

    let index = -1;
    let role = null;
    let taskSeen = false;
    let otherRoleIndex = -1;

    for (let i = 0; i < day.length; i += 1) {
        const shift = day[i];
        if (!shift || typeof shift !== 'object' || shift.task !== task) continue;
        taskSeen = true;

        const held = shiftRoleOf(shift, requestedBy);
        if (!held) continue;

        // A legacy shift has exactly one person, so lead is the only role it can
        // possibly be. Honour that even if the request recorded `coLead` —
        // otherwise a pre-6-May document would be permanently unfixable.
        const isLegacy = readShiftIdentities(shift).legacy;

        if (!isLegacy && wantedRole && held !== wantedRole) {
            otherRoleIndex = i;
            continue;
        }

        index = i;
        role = isLegacy ? SHIFT_ROLE_LEAD : held;
        break;
    }

    if (index === -1) {
        if (otherRoleIndex !== -1) {
            const actual = shiftRoleOf(day[otherRoleIndex], requestedBy);
            return fail(
                `The roster has changed since this request was made: ${requestedBy} is now the ${describeShiftRole(actual)} of the ${task} shift on ${dateKey}, not the ${describeShiftRole(wantedRole)}. I have not guessed which duty you should take.`,
            );
        }
        if (taskSeen) {
            return fail(`${requestedBy} is no longer on the ${task} shift on ${dateKey}, so there is nothing to hand over.`);
        }
        return fail(`The master roster has no ${task} shift on ${dateKey}.`);
    }

    const { lead, coLead } = readShiftIdentities(day[index]);
    const partner = role === SHIFT_ROLE_LEAD ? coLead : lead;
    if (partner === covering) {
        return fail(
            `${covering} is already the ${describeShiftRole(role === SHIFT_ROLE_LEAD ? SHIFT_ROLE_CO_LEAD : SHIFT_ROLE_LEAD)} of the ${task} shift on ${dateKey}. One person cannot hold both duties.`,
        );
    }

    const shifts = day.map((shift, i) =>
        (i === index ? applyShiftSubstitution(shift, role, covering) : shift),
    );

    return { ok: true, reason: null, dateKey, role, index, shifts };
};

/**
 * Find the shift that proves a swap landed, in a roster READ BACK FROM THE
 * DATABASE after the write.
 *
 * This is the evidence the success message is built from. Returns the observed
 * shift or `null`; a `null` must never be reported as success
 * (ROSTER_POSTMORTEM.md A-RC4 — "success asserted, never observed").
 */
export const findAppliedSwapShift = ({ roster, swap, coveringStaff, role } = {}) => {
    const covering = asName(coveringStaff);
    if (!roster || typeof roster !== 'object' || !swap || !covering) return null;
    if (role !== SHIFT_ROLE_LEAD && role !== SHIFT_ROLE_CO_LEAD) return null;

    const day = roster[swap.originalShiftDate];
    if (!Array.isArray(day)) return null;

    const requestedBy = asName(swap.requestedBy);

    return (
        day.find((shift) => {
            if (!shift || typeof shift !== 'object' || shift.task !== swap.originalTask) return false;

            const ids = readShiftIdentities(shift);
            if (ids[role] !== covering) return false;
            // The requester must be out of the role they handed over.
            if (requestedBy && ids[role] === requestedBy) return false;
            // And the derived label must agree with the identities, or the
            // calendar cell and the ICS export would still name the old person.
            return shift.staff === buildShiftStaffLabel(ids.lead, ids.coLead);
        }) ?? null
    );
};

/** Boolean form of `findAppliedSwapShift`. */
export const verifySwapApplied = (args) => findAppliedSwapShift(args) !== null;


// --- 1d. COVERAGE-ALERT SURVIVAL (ROSTER_TODO.md P3 / M5) ---------------------
//
// The swap listener delivers each PENDING request once, as a `docChanges()`
// `added` event. Three chat paths used to replace the whole history array with
// `[greeting]`, destroying an un-answered request and its `swapData` — after
// which nothing re-delivered it for the life of the subscription and the shift
// went uncovered (ROSTER_QC_AUDIT.md M5).

export const ROSTER_ALERT_MODE = 'ROSTER_ALERT';

/** The coverage requests still awaiting an answer in a chat history. */
export const pendingRosterAlerts = (messages) =>
    (Array.isArray(messages) ? messages : []).filter(
        (message) => message && message.mode === ROSTER_ALERT_MODE && message.swapData && message.swapData.docId,
    );

/**
 * Replace a chat history without destroying un-answered coverage requests.
 *
 * The replacement (a greeting, or nothing) comes first so the conversation still
 * reads correctly; the outstanding alerts are re-appended at the end, which is
 * also where they are most visible.
 */
export const resetMessagesPreservingAlerts = (previous, replacement) => {
    const kept = pendingRosterAlerts(previous);
    const base = Array.isArray(replacement) ? replacement : [];
    return kept.length === 0 ? base : [...base, ...kept];
};

/**
 * Append a coverage alert, unless that request is already on screen.
 *
 * Needed because alerts now SURVIVE a session reset: without this, a
 * re-subscribe (which re-delivers every PENDING doc as `added`) would stack
 * duplicate Accept buttons for one request.
 */
export const appendRosterAlert = (messages, alert) => {
    const list = Array.isArray(messages) ? messages : [];
    if (!alert) return list;

    const docId = alert.swapData?.docId;
    if (docId && list.some((message) => message?.swapData?.docId === docId)) return list;

    return [...list, alert];
};


// --- 2. EXPORT LOGIC (ROSTER_TODO.md P5 — audit M6, M7 residue, M10) ---------
//
// The file CONTENT is built by two pure functions, `buildICS` and `buildCSV`;
// `downloadICS`/`downloadCSV` are thin wrappers that hand the string to the same
// Blob/anchor download as before. The split exists so the escaping rules below
// can be tested on strings, without stubbing the DOM — the previous exporters
// were untestable in practice and shipped three RFC violations because of it.

/** Neither `undefined` nor `null` may ever reach a file. Both become empty. */
const exportText = (value) => (value === undefined || value === null ? '' : String(value));


// --- 2a-pre. WHO IS ON THE SHIFT (multi-assignee support) ---------------------
//
// Closes the limit `mockData.js` was written around: *"with `coLeads > 1` the
// engine puts the extra people in `assignees`, which `downloadCSV`/`downloadICS`
// do not read, so the exports would be silently incomplete."* Both exporters now
// read `assignees`.
//
// FOUR SHIFT SHAPES REACH HERE, and one reader has to serve all of them:
//
//   1. `generateRoster` (V1, the live engine)  — `lead` + `coLead` + `staff`.
//   2. `generateRosterV2`                      — the same three PLUS `assignees`,
//      which is authoritative for the third person onward (a `coLeads: 2`
//      pairing group, or a `slots:` trio).
//   3. the demo transform / a pre-6-May document — `lead` (or a bare `staff`)
//      and nothing else.
//   4. anything hand-edited or swap-mutated, which may DISAGREE with itself.
//
// SHAPE 4 IS WHY `lead`/`coLead` ARE READ FIRST AND `assignees` ONLY AFTER THEM.
// `applyShiftSubstitution` (section 1c) rewrites `lead`, `coLead` and `staff` on
// an accepted swap and does NOT touch `assignees`, so on a V2 shift that has been
// swapped, `assignees` still names the clinician who handed the duty over. Order
// of preference decides what that costs:
//
//   • trusting `assignees` first would put the DEPARTED person in the Assignees
//     column and in the calendar event, flatly contradicting the Lead column
//     beside it;
//   • reading the authoritative pair first, as here, keeps the current holders
//     first and leaves the stale name trailing as an extra assignee — so a trio
//     that has been swapped exports FOUR names.
//
// Four names on a three-person shift is visibly odd; a departed clinician
// exported as its lead is not. Neither is correct, and the exporters cannot make
// stale data fresh: the real repair is for `applyShiftSubstitution` to maintain
// `assignees`, which is a change to the swap contract and is deliberately NOT
// made here. It is logged in the ledger in section 2d.

/**
 * Everybody on a shift, in publication order, deduplicated, never `undefined`.
 *
 * Order: `lead`, then `coLead`, then whatever `assignees` adds. For every shift
 * this repo's two engines actually produce, that is exactly `assignees` — V2
 * writes `assignees[0] === lead` and `assignees[1] === coLead` — so the
 * reordering is invisible except on the self-contradicting shape 4 above.
 *
 * A bare-`staff` legacy shift yields `[]`, the same as it already yields an empty
 * Lead cell: identity is never parsed back out of a formatted display string
 * (`readShiftIdentities` in section 1c documents why that rule exists).
 *
 * Values are String-coerced rather than type-filtered, matching `csvField` and
 * `escapeICSText`: a non-string in `assignees` shows up as visible nonsense in
 * one cell instead of a person silently vanishing from the roster.
 */
const shiftAssigneeNames = (shift) => {
    const names = [];
    const seen = new Set();

    const add = (value) => {
        const name = exportText(value).trim();
        if (name === '' || seen.has(name)) return;
        seen.add(name);
        names.push(name);
    };

    add(shift.lead);
    add(shift.coLead);
    if (Array.isArray(shift.assignees)) shift.assignees.forEach(add);

    return names;
};

/**
 * The human display text for a shift's people, tolerant of every shape above.
 *
 * ONE AND TWO PEOPLE ARE UNCHANGED, byte for byte: `shift.staff` is used
 * verbatim when it is a non-empty string, which is what the calendar renders and
 * what every existing ICS pin expects. The empty-lead case yields '' rather than
 * the literal `Lead: undefined` (audit M7).
 *
 * THREE OR MORE gets a new convention, and it is a JUDGMENT CALL:
 * `Lead: A, Co: B, Also: C, D`. It cannot come from `buildShiftStaffLabel` —
 * that function's output is pinned byte-exact by `generateRoster`'s 23
 * characterization tests and is written into live Firestore documents, so the
 * two-name display string keeps exactly one definition and this longer form is
 * assembled here, in the exporter, where nothing else can read it. The multi-slot
 * ledger (`rosterEngineV2.js` section 10, item 1) suggested `Lead: X, Co: Y, +1`;
 * a count would not satisfy "list every assignee", so the names are spelled out.
 * The commas are escaped by `escapeICSText` on the way into SUMMARY.
 */
const shiftPeopleText = (shift) => {
    const names = shiftAssigneeNames(shift);

    if (names.length > 2) {
        return `Lead: ${names[0]}, Co: ${names[1]}, Also: ${names.slice(2).join(', ')}`;
    }
    if (typeof shift.staff === 'string' && shift.staff.trim() !== '') return shift.staff;
    if (names.length === 0) return '';
    return buildShiftStaffLabel(names[0], names[1]);
};


// --- 2a. ICS (RFC 5545) ------------------------------------------------------

/** Domain part of every generated UID. Fixed, so re-exports keep matching. */
const ICS_UID_DOMAIN = '@nexus-aura-roster';

/**
 * RFC 5545 §3.3.11 TEXT escaping.
 *
 * This is audit M6.1. The 6 May display-string refactor turned `[EFT] Brandon`
 * into `[EFT] Lead: Brandon, Co: Ying Xian`, and an unescaped `,` makes SUMMARY
 * a MULTI-VALUED property — Outlook truncates at the comma and the co-lead
 * silently disappears from the imported event.
 *
 * Backslash goes first, or it would double-escape the escapes added after it.
 */
const escapeICSText = (value) =>
    exportText(value)
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r\n|\r|\n/g, '\\n');

/**
 * RFC 5545 §3.1 content-line folding: no line over 75 octets, continuations
 * introduced by CRLF + a single space.
 *
 * BYTE-APPROXIMATE: this counts CODE POINTS, not octets, so a line of non-ASCII
 * text folds later than 75 bytes. That is the safe direction of error for the
 * clients we import into (they unfold before parsing) and it guarantees the fold
 * never lands inside a surrogate pair, which a naive `slice(0, 75)` would do.
 */
const foldICSLine = (line) => {
    const chars = Array.from(line);
    if (chars.length <= 75) return line;

    const out = [chars.slice(0, 75).join('')];
    for (let i = 75; i < chars.length; i += 74) {
        out.push(' ' + chars.slice(i, i + 74).join(''));
    }
    return out.join('\r\n');
};

/** A `Date` -> the UTC form RFC 5545 wants for DTSTAMP: `20260607T091500Z`. */
const formatICSTimestampUTC = (date) => {
    const pad = (n, width = 2) => String(n).padStart(width, '0');
    return (
        `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
        `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
    );
};

/** Task name -> UID-safe slug. Anything unusable collapses to `shift`. */
const uidSlug = (value) => {
    const slug = exportText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug === '' ? 'shift' : slug;
};

/**
 * The roster as an RFC 5545 calendar, as a string.
 *
 * `options.now` (a `Date`, default `new Date()`) is the DTSTAMP instant; tests
 * inject a fixed one so the output is deterministic.
 *
 * UIDs are DETERMINISTIC — `<date>-<task-slug>@nexus-aura-roster` — because a
 * random UID would make every re-import a duplicate set of events instead of an
 * update (audit M6.2). `generateRoster` emits one shift object per task per day,
 * so date + task is unique; should a config ever repeat a task name within a
 * day, the second and later copies take a `-2`, `-3`… suffix, which is stable
 * for as long as the roster is.
 */
export const buildICS = (rosterData, options = {}) => {
    const stampSource =
        options.now instanceof Date && !Number.isNaN(options.now.getTime()) ? options.now : new Date();
    const dtStamp = formatICSTimestampUTC(stampSource);

    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//AURA//Roster//EN',
        'CALSCALE:GREGORIAN',
    ];

    const days = rosterData && typeof rosterData === 'object' ? Object.entries(rosterData) : [];
    const uidCounts = new Map();

    days.forEach(([date, shifts]) => {
        (Array.isArray(shifts) ? shifts : []).forEach((rawShift) => {
            const shift = rawShift && typeof rawShift === 'object' ? rawShift : {};
            const dtStart = exportText(date).replace(/-/g, '');

            const base = `${exportText(date)}-${uidSlug(shift.task)}`;
            const seen = (uidCounts.get(base) || 0) + 1;
            uidCounts.set(base, seen);
            const uid = `${seen === 1 ? base : `${base}-${seen}`}${ICS_UID_DOMAIN}`;

            const summary = `[${exportText(shift.task)}] ${shiftPeopleText(shift)}`.trimEnd();

            // A shift with no `week` (demo transform, legacy documents) drops the
            // prefix entirely rather than printing `Week undefined -` (audit M7).
            const week = exportText(shift.week).trim();
            const category = exportText(shift.category).trim();
            const description = [week === '' ? '' : `Week ${week}`, category].filter(Boolean).join(' - ');

            lines.push(
                'BEGIN:VEVENT',
                `UID:${uid}`,
                `DTSTAMP:${dtStamp}`,
                `DTSTART;VALUE=DATE:${dtStart}`,
                `SUMMARY:${escapeICSText(summary)}`,
                `DESCRIPTION:${escapeICSText(description)}`,
            );
            // CATEGORIES (RFC 5545 §3.8.1.2) — the shift's category travels into
            // the file, so Outlook can colour by it: assign each category a colour
            // once and every future import follows. Escaping is LOAD-BEARING here,
            // more than anywhere else in this exporter: in CATEGORIES a bare comma
            // separates TWO categories, so an unescaped "Clinic, Ward" would import
            // as two labels. Emitted only when a category exists — a legacy shift
            // without one gets no empty property.
            if (category !== '') {
                lines.push(`CATEGORIES:${escapeICSText(category)}`);
                // COLOR (RFC 7986 §5.9) — value MUST be a CSS3 colour name, which
                // is exactly what the palette map holds. Only the four standard
                // categories carry a colour; a team's own category (WEEKEND, VC)
                // gets CATEGORIES alone rather than a colour nobody chose.
                const cssColor = categoryCssColor(category);
                if (cssColor !== null) lines.push(`COLOR:${cssColor}`);
            }
            lines.push('END:VEVENT');
        });
    });

    lines.push('END:VCALENDAR');

    // Every content line ends with CRLF, including the last one (§3.1).
    return lines.map(foldICSLine).join('\r\n') + '\r\n';
};


// --- 2b. CSV (RFC 4180 + Excel formula guard) --------------------------------

/**
 * One CSV field, quoted and de-weaponised.
 *
 * Two separate problems, in order:
 *
 * 1. AUDIT M10 — this file exists to be opened in Excel, and task names are free
 *    text from the wizard. A value starting `=`, `+`, `-` or `@` is a FORMULA to
 *    Excel and LibreOffice (`=HYPERLINK(…)`, `+cmd|'/c calc'!A1`), so it gets a
 *    leading apostrophe, which those two read as "this cell is text".
 * 2. RFC 4180 quoting — a field containing `,`, `"` or a newline is wrapped in
 *    double quotes with internal quotes doubled. Previously nothing was quoted
 *    and a comma in a task name silently shifted every later column.
 *
 * The guard runs BEFORE quoting so the apostrophe stays inside the quotes.
 */
const csvField = (value) => {
    const raw = exportText(value);
    const guarded = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
};

/**
 * How the Assignees cell separates names. A SEMICOLON, not a comma: a comma
 * would be indistinguishable from the column separator to anybody reading the
 * file by eye, and a name that legitimately contains a comma (`Wong, Ying Xian`)
 * would then be unrecoverable even after RFC 4180 unquoting. The trailing space
 * is for the human reading the cell in Excel; a machine splitting on `;` should
 * trim. Judgment call, flagged in section 2d.
 */
const ASSIGNEE_SEPARATOR = '; ';

/**
 * The roster as a CSV, as a string.
 *
 * THE FIRST SIX COLUMNS ARE UNCHANGED, byte for byte — `Date,Week,Task,Category,
 * Lead,Co-Lead`, with the same values from the same fields — because roster
 * masters have saved workbooks and filters against them. A SEVENTH column,
 * `Assignees`, is APPENDED: the full ordered team, semicolon-separated, so a
 * shift holding three or more people is no longer exported as two.
 *
 * Absent `week`/`coLead` (demo transform, pre-6-May documents) are empty cells,
 * never the string `undefined` (M7), and that now covers the new column too — a
 * shift with no readable assignee gets an empty cell, not `undefined`.
 */
export const buildCSV = (rosterData) => {
    const header = ['Date', 'Week', 'Task', 'Category', 'Lead', 'Co-Lead', 'Assignees'];
    const rows = [header.map(csvField).join(',')];

    const source = rosterData && typeof rosterData === 'object' ? rosterData : {};
    Object.keys(source)
        .sort()
        .forEach((date) => {
            const shifts = source[date];
            (Array.isArray(shifts) ? shifts : []).forEach((rawShift) => {
                const s = rawShift && typeof rawShift === 'object' ? rawShift : {};
                // `csvField` quotes the cell if a name contains a comma, a quote
                // or a newline, and de-weaponises a leading `=`/`+`/`-`/`@`
                // exactly as it does for every other field (M10).
                const assignees = shiftAssigneeNames(s).join(ASSIGNEE_SEPARATOR);
                rows.push(
                    [date, s.week, s.task, s.category, s.lead, s.coLead, assignees]
                        .map(csvField)
                        .join(','),
                );
            });
        });

    // RFC 4180 rows end with CRLF, and the UTF-8 BOM is what makes Excel on
    // Windows decode non-ASCII names correctly (the demo lets visiting teams
    // type their own staff names, which need not be ASCII). P5 follow-up to
    // audit M10/M7 — see the exporter tests for the pins.
    return '\ufeff' + rows.join('\r\n');
};


// --- 2c. THE DOWNLOAD WRAPPERS -----------------------------------------------
//
// Unchanged from before P5 apart from where the content comes from: same Blob
// MIME types, same filenames, same append/click/remove dance.

const downloadBlob = (contents, type, filename) => {
    const blob = new Blob([contents], { type });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export const downloadICS = (rosterData) => {
    downloadBlob(buildICS(rosterData), 'text/calendar', 'AURA_Roster_Merged.ics');
};

export const downloadCSV = (rosterData) => {
    downloadBlob(buildCSV(rosterData), 'text/csv', 'AURA_Roster_Merged.csv');
};


// --- 2d. THE EXPORTS' LIMITS LEDGER ------------------------------------------
//
// What a roster master can do today and get a surprising or incomplete file.
// Measured where it says measured, FLAGGED where a judgment call was made rather
// than a fact found — same convention as `rosterEngineV2.js` sections 9 and 10.
// Written after multi-assignee support landed, so items 1-4 are that feature's.
//
//  1. A SWAPPED SHIFT CAN EXPORT ONE NAME TOO MANY. `applyShiftSubstitution`
//     (section 1c) maintains `lead`, `coLead` and `staff` and does NOT maintain
//     `assignees`, so after a colleague covers the lead of a three-person shift
//     the export lists the new lead, the co-lead, the DEPARTED lead and the third
//     assignee — four names for three duties. `shiftAssigneeNames` reads the
//     authoritative pair first so the stale name trails rather than leads, which
//     makes the staleness visible instead of authoritative. → FLAGGED: the repair
//     belongs in the swap contract (maintain `assignees` there), not in the
//     exporters, and it is not made yet.
//  2. THE `Also:` CONVENTION IS NEW AND UNRATIFIED. Three or more people export
//     as `Lead: A, Co: B, Also: C, D` in the ICS SUMMARY. Nothing else in the app
//     writes that string: the calendar cell and the swap modal still render
//     `shift.staff`, which is `buildShiftStaffLabel(lead, coLead)` and still shows
//     two names. So the SAME SHIFT reads as a trio in the .ics and a pair on
//     screen. → FLAGGED for the roster owner: `rosterEngineV2.js` section 10 item
//     1 asks for one display convention across calendar, CSV and ICS; this is
//     three quarters of it.
//  3. `Assignees` SEPARATES ON `'; '`, WHICH IS A CHOICE, NOT A STANDARD. RFC 4180
//     has no list-inside-a-field convention. A consumer splitting on `';'` must
//     trim; one splitting on `', '` will be wrong. Also, the CSV keeps `Lead` and
//     `Co-Lead` AND repeats both inside `Assignees` — deliberate redundancy so the
//     old columns stay byte-compatible, but it does mean the same name appears
//     twice in a row.
//  4. A SHIFT WHOSE ONLY RECORD IS A BARE `staff` NAME EXPORTS NO ASSIGNEES. A
//     pre-6-May document has `staff: 'Brandon'` and no `lead`, and identity is
//     never parsed back out of a display string (the rule `readShiftIdentities`
//     exists to enforce). Its Lead, Co-Lead and Assignees cells are all empty
//     while the ICS SUMMARY still shows the name, because SUMMARY falls back to
//     `staff` verbatim. Pre-existing for Lead/Co-Lead; item 4 only records that
//     the new column inherits it rather than fixing it.
//  5. NO VTIMEZONE, AND EVERY EVENT IS ALL-DAY. `DTSTART;VALUE=DATE` carries no
//     time and no timezone, so a shift is a whole day in the importer's calendar
//     whatever hours it actually runs — and the hours model in
//     `rosterEngineV2.js` now knows those durations. The ICS does not read them.
//  6. FOLDING COUNTS CODE POINTS, NOT OCTETS (§3.1 wants octets). Documented at
//     `foldICSLine`: non-ASCII names fold late, which errs long rather than
//     splitting a surrogate pair. A team of four with long non-ASCII names on one
//     shift can therefore emit a SUMMARY line over 75 bytes.
//  7. THE FORMULA GUARD CHANGES THE DATA IT PROTECTS. A task or a person legitimately
//     named starting `-` or `@` is exported with a leading apostrophe (M10's fix),
//     so the CSV is not a faithful round-trip of the roster document.
//  8. NEITHER EXPORT CARRIES `unfilled`. A roster with slots nobody could staff
//     exports as though those slots did not exist — the CSV has no row and the
//     ICS no event for a gap, and nothing in either file says a gap was reported.
//     That is the single biggest hole in both formats and it predates every
//     feature above: the engine's core value is that it refuses out loud, and the
//     file a roster master actually opens is silent about the refusal.
//     → FLAGGED: needs a decision about whether gaps belong in the same file.
