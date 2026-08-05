// src/utils/auraEngine.js

// --- 1. CORE LOGIC ---

// Helper: Rotate array by k steps (Cyclic Shift)
const rotate = (arr, k) => {
    const n = arr.length;
    const offset = k % n;
    return [...arr.slice(offset), ...arr.slice(0, offset)];
};

export const generateRoster = (config) => {
    const { staff, tasks, startDate, weeks } = config;
    const start = new Date(startDate);
    let roster = {}; 

    // --- A. MAIN CORE TASKS (Mon-Fri) ---
    for (let w = 0; w < weeks; w++) {
        const weekStart = new Date(start);
        weekStart.setDate(start.getDate() + (w * 7));

        const currentStaffOrder = rotate(staff, w);

        tasks.forEach((taskName, taskIdx) => {
            const leadStaff = currentStaffOrder[taskIdx % staff.length];
            const coLeadStaff = currentStaffOrder[(taskIdx + 1) % staff.length];

            for (let d = 0; d < 5; d++) {
                const dayDate = new Date(weekStart);
                dayDate.setDate(weekStart.getDate() + d);
                const dateKey = dayDate.toISOString().split('T')[0];

                if (!roster[dateKey]) roster[dateKey] = [];
                
                // Unified shift object per task
                roster[dateKey].push({
                    task: taskName,
                    lead: leadStaff,
                    coLead: coLeadStaff,
                    staff: `Lead: ${leadStaff}, Co: ${coLeadStaff}`, // Formats the UI and ICS perfectly
                    category: 'CORE', 
                    week: w + 1
                });
            }
        });

        // --- B. VC TASKS (Tue & Sat) ---
        const vcLead = staff[w % staff.length];
        const vcCoLead = staff[(w + 1) % staff.length];

        // Tuesday (Index 1)
        const tueDate = new Date(weekStart);
        tueDate.setDate(weekStart.getDate() + 1);
        const tueKey = tueDate.toISOString().split('T')[0];
        
        if (!roster[tueKey]) roster[tueKey] = [];
        roster[tueKey].push({ 
            task: "VC (PM)", 
            lead: vcLead,
            coLead: vcCoLead,
            staff: `Lead: ${vcLead}, Co: ${vcCoLead}`,
            category: "VC", 
            week: w + 1 
        });

        // Saturday (Index 5)
        const satDate = new Date(weekStart);
        satDate.setDate(weekStart.getDate() + 5);
        const satKey = satDate.toISOString().split('T')[0];
        
        if (!roster[satKey]) roster[satKey] = [];
        roster[satKey].push({ 
            task: "VC (AM)", 
            lead: vcLead,
            coLead: vcCoLead,
            staff: `Lead: ${vcLead}, Co: ${vcCoLead}`,
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
 */
export const restoreLiveRosterConfig = (prev) => ({
    ...(prev || LIVE_ROSTER_DEFAULTS),
    staff: [...LIVE_ROSTER_DEFAULTS.staff],
    tasks: [...LIVE_ROSTER_DEFAULTS.tasks],
});

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
 * confirmation modal cannot drift from what is actually written. That includes
 * today's defects: the start date is NOT snapped to a Monday (ROSTER_TODO.md P4
 * / postmortem B1), so a Sunday `startDate` honestly reports a Sunday first
 * day, and a run spanning a DST forward transition outside UTC+8 honestly
 * reports the slid keys (ROSTER_QC_AUDIT.md M2).
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


// --- 2. EXPORT LOGIC ---

export const downloadICS = (rosterData) => {
    let ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//AURA//Roster//EN",
        "CALSCALE:GREGORIAN"
    ];

    Object.entries(rosterData).forEach(([date, shifts]) => {
        shifts.forEach(shift => {
            const dtStart = date.replace(/-/g, '');
            
            ics.push(
                "BEGIN:VEVENT",
                `DTSTART;VALUE=DATE:${dtStart}`,
                `SUMMARY:[${shift.task}] ${shift.staff}`, // This will output exactly: [EFT] Lead: BF, Co: DK
                `DESCRIPTION:Week ${shift.week} - ${shift.category}`,
                "END:VEVENT"
            );
        });
    });

    ics.push("END:VCALENDAR");
    
    const blob = new Blob([ics.join("\r\n")], { type: 'text/calendar' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = "AURA_Roster_Merged.ics";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export const downloadCSV = (rosterData) => {
    // Dedicated Lead and Co-Lead columns for cleaner Excel filtering
    let csv = ["Date,Week,Task,Category,Lead,Co-Lead"];
    const sortedDates = Object.keys(rosterData).sort();
    
    sortedDates.forEach(date => {
        rosterData[date].forEach(s => {
            csv.push(`${date},${s.week},${s.task},${s.category},${s.lead},${s.coLead}`);
        });
    });

    const blob = new Blob([csv.join("\n")], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = "AURA_Roster_Merged.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
