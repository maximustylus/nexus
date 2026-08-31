/**
 * ==============================================================================
 * ROSTER SETTINGS — a department's configuration, made to survive a reload
 * ==============================================================================
 *
 * The Configure wizard holds a department's whole shape: its tasks and how each
 * one repeats, its grade-band boundaries, its working-hours policy and its
 * scheduling rules. All of it lived in React state and nowhere else, so it existed
 * only for as long as the tab did.
 *
 * That was survivable while the wizard was sandbox-only — a visitor exploring a
 * fictional department loses nothing by closing the page. It stops being
 * survivable the moment a real roster master configures a real department, which
 * is what `R3` makes possible: Nisa would have retyped Sport & Exercise Medicine's
 * entire structure every time she opened the roster, and so would twenty-seven
 * other departments.
 *
 * ------------------------------------------------------------------------------
 * WHAT IS STORED, AND THE TWO THINGS THAT ARE DELIBERATELY NOT
 * ------------------------------------------------------------------------------
 *
 * STORED — `teams/{teamId}/settings/roster`:
 *   taskRows       what the department does, and when
 *   bandInputs     where this department puts its junior/senior/principal lines
 *   hoursInputs    weekly hours and a daily ceiling, as stated policy
 *   rulesInputs    concurrency, consecutive days, pairs that must not work together
 *   extraRules     anything a fixture carries that has no control of its own
 *
 * NOT STORED — STAFF. The people are `teams/{teamId}/members`, and they are the
 * team's actual membership rather than a list typed into a form. Copying them here
 * would create a second roster of who works in the department, drifting from the
 * first every time somebody joins or leaves. In the sandbox they stay typed and
 * ephemeral, because there is no team to read.
 *
 * ⚠️ ONE PERSON-IDENTIFYING THING IS STORED, AND IT HAS TO BE: `rules.forbidPairs`
 *    names two colleagues who must not be rostered together. It cannot live
 *    anywhere else — it is a scheduling rule and the engine reads it with the rest
 *    of the configuration — and this document is readable by the whole team, so
 *    those two names are visible to the department.
 *
 *    That is a deliberate accept rather than an oversight. The rule's EFFECT is
 *    observable in any case: two people who never appear on a shift together are
 *    two people anybody can see never appear together. What is written here is the
 *    same fact, said once, by the roster master who decided it. It is worth
 *    knowing when a department uses this control for a reason it would rather not
 *    publish — and worth noticing that the alternative, a private rules document,
 *    would still leak through the roster it produces.
 *
 * NOT STORED — GRADES. A staff row carries `grade`, and grade is
 * `teams/{teamId}/grades/{uid}`, readable only by the person and a lead. This
 * document is readable by every member of the team. Writing grades into it would
 * undo that split completely and silently — which is exactly why the staff rows
 * are excluded as a whole rather than filtered field by field.
 *
 * ------------------------------------------------------------------------------
 * ⚠️ ROW IDS ARE NEVER PERSISTED
 * ------------------------------------------------------------------------------
 *
 * Every row and every slot carries an `id` from `nextRowId`, a module-level
 * counter. It is a REACT KEY — a fresh-identity source so a removal does not make
 * the rows below it re-mount — and it means nothing outside the tab that made it.
 * Storing one and reading it back in a new tab would collide with an id the
 * counter is about to mint, and two rows sharing a key is how an edit lands in the
 * wrong row.
 *
 * So ids are stripped on the way out and minted fresh on the way in.
 */

import {
    createTaskRow,
    createTaskSlot,
    bandsToInputs,
    EMPTY_HOURS_INPUTS,
    EMPTY_RULES_INPUTS,
} from './rosterWizard';

/** The document, beneath the team. */
export const ROSTER_SETTINGS_DOC = 'roster';

/**
 * ⚠️ AN ALLOWLIST, BOTH WAYS, AND IT IS LOAD-BEARING IN BOTH DIRECTIONS.
 *
 * OUTBOUND it stops a row field that is not configuration — an id, a transient
 * error flag, whatever a future refactor hangs on a row — reaching the database.
 *
 * INBOUND it stops a stored document injecting arbitrary keys into a row. This
 * document is written by a lead and read by every member, so its contents are not
 * more trusted than any other client-supplied value; a row is rebuilt from a
 * blank one and only these keys are copied over it.
 */
const TASK_ROW_KEYS = Object.freeze([
    'name', 'leadBands', 'minGrade', 'days', 'coLead', 'hours',
    'slotMode', 'calendarMode', 'recurrenceOrdinal', 'recurrenceWeekday',
    'continuity', 'quotaPer', 'quotaMin', 'quotaMax', 'category', 'requiresSkill',
]);

const SLOT_KEYS = Object.freeze(['band', 'requiresSkill']);

const BAND_NAMES = Object.freeze(['nonExempt', 'junior', 'senior', 'principal']);

/**
 * Bounds, so one department cannot store a document that no other screen can
 * open. Firestore's own limit is 1 MiB per document; these sit far below it and
 * exist to keep a mistake local rather than to defend a quota.
 */
export const LIMITS = Object.freeze({
    tasks: 60,
    slotsPerTask: 12,
    forbidPairs: 100,
    textChars: 120,
});

const isPlainObject = (value) =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * ⚠️ `undefined` IS NOT A FIRESTORE VALUE AND THROWS ON WRITE. A row built with
 *    `{ ...blank, ...stored }` can easily carry one, and the error it produces
 *    ("Unsupported field value: undefined") names the field but not the row, on a
 *    save the roster master will read as "Configure is broken". Dropped here so
 *    the write cannot carry one at all.
 */
const defined = (object) => Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined),
);

const asText = (value, max = LIMITS.textChars) =>
    (typeof value === 'string' ? value : '').slice(0, max);

// ── Outbound: wizard state → the stored document ─────────────────────────────

const taskRowToStored = (row) => defined(Object.fromEntries(
    TASK_ROW_KEYS
        .filter((key) => row[key] !== undefined)
        .map((key) => {
            const value = row[key];
            if (typeof value === 'string') return [key, asText(value)];
            if (Array.isArray(value)) return [key, [...value]];
            return [key, value];
        }),
));

const slotToStored = (slot) => defined({
    band: slot.band,
    requiresSkill: asText(slot.requiresSkill),
});

/**
 * The document body. Returns a plain object ready for `setDoc`, or `null` when
 * there is nothing worth storing — a wizard that has never been touched holds
 * blank rows, and writing those over a real configuration would be destructive.
 */
export const toStoredSettings = ({
    taskRows = [],
    bandInputs = null,
    hoursInputs = null,
    rulesInputs = null,
    extraRules = null,
} = {}, { now = null, by = null } = {}) => {
    const tasks = taskRows
        .slice(0, LIMITS.tasks)
        .filter((row) => isPlainObject(row) && asText(row.name).trim() !== '')
        .map((row) => {
            const stored = taskRowToStored(row);
            if (row.slotMode && Array.isArray(row.slots)) {
                stored.slots = row.slots.slice(0, LIMITS.slotsPerTask).map(slotToStored);
            }
            return stored;
        });

    // ⚠️ A CONFIGURATION WITH NO NAMED TASK IS NOT A CONFIGURATION. Saving it would
    //    replace a department's real setup with the blank form somebody happened to
    //    have open, and the roster master would have no way to tell that had
    //    happened until the next Generate produced nothing.
    if (tasks.length === 0) return null;

    const bands = {};
    const source = isPlainObject(bandInputs) ? bandInputs : bandsToInputs();
    BAND_NAMES.forEach((band) => {
        const entry = isPlainObject(source[band]) ? source[band] : {};
        bands[band] = { min: asText(entry.min, 8), max: asText(entry.max, 8) };
    });

    const hours = isPlainObject(hoursInputs) ? hoursInputs : EMPTY_HOURS_INPUTS();
    const rules = isPlainObject(rulesInputs) ? rulesInputs : EMPTY_RULES_INPUTS();

    return defined({
        version: 1,
        tasks,
        bands,
        hours: {
            weeklyHours: asText(hours.weeklyHours, 8),
            maxHoursPerDay: asText(hours.maxHoursPerDay, 8),
        },
        rules: {
            maxConcurrentPerDay: asText(rules.maxConcurrentPerDay, 8),
            maxConsecutiveDays: asText(rules.maxConsecutiveDays, 8),
            /**
             * ⚠️ STORED AS `{ a, b }` MAPS, NOT AS TWO-ELEMENT ARRAYS, AND THIS IS A
             *    DATA-LOSS FIX RATHER THAN A STYLE PREFERENCE.
             *
             *    FIRESTORE FORBIDS AN ARRAY DIRECTLY INSIDE AN ARRAY. `[["Ann","Bob"]]`
             *    is exactly that, so `setDoc` threw
             *
             *        Function setDoc() called with invalid data.
             *        Nested arrays are not supported
             *
             *    and the WHOLE settings document failed to write — not just the pairs.
             *    A department that named one pair of colleagues who must not work
             *    together silently lost its entire saved configuration and was told
             *    "you may have to set it up again next time", with no clue which
             *    control had done it. The owner hit this and had to read it out of a
             *    browser console.
             *
             *    An array of MAPS is legal, and each map holds an array of nothing.
             *    `fromStoredSettings` reads both shapes, though no document can
             *    actually contain the old one — every write that tried, failed.
             */
            forbidPairs: (Array.isArray(rules.forbidPairs) ? rules.forbidPairs : [])
                .slice(0, LIMITS.forbidPairs)
                .filter((pair) => Array.isArray(pair) && pair.length === 2)
                .map((pair) => ({ a: asText(pair[0]), b: asText(pair[1]) })),
            /**
             * A BOOLEAN, always written, unlike the text controls beside it.
             *
             * The others are stored as text because `''` and `'2'` are different
             * ANSWERS — blank means "we never said", which the engine reads as its
             * own default. A switch has no third state: off IS an answer, and a
             * department that turns rotation off wants it to stay off when the
             * settings are read back, not to fall through to a default that might
             * change later.
             */
            rotateWeekly: rules.rotateWeekly === true,
        },
        extraRules: isPlainObject(extraRules) ? extraRules : null,
        updatedAt: now || undefined,
        updatedBy: by || undefined,
    });
};

// ── Inbound: the stored document → wizard state ──────────────────────────────

/**
 * Rebuild the wizard's state from a stored document.
 *
 * ⚠️ EVERY ROW IS BUILT FROM A BLANK ONE AND THEN OVERLAID. `createTaskRow()`
 *    with no seed produces a complete row with today's defaults; the stored keys
 *    are copied over it. That is what makes a document written by an older
 *    version safe to open: a field added since is simply present with its default
 *    rather than `undefined`, which would render as an empty control the user
 *    cannot tell from a deliberate blank.
 *
 *    It is also why the overlay is an ALLOWLIST and not a spread. A stored
 *    document is client-written data.
 */
export const fromStoredSettings = (data) => {
    if (!isPlainObject(data) || !Array.isArray(data.tasks)) return null;

    const taskRows = data.tasks.slice(0, LIMITS.tasks).map((stored) => {
        const row = createTaskRow();
        if (!isPlainObject(stored)) return row;

        TASK_ROW_KEYS.forEach((key) => {
            if (stored[key] !== undefined) row[key] = stored[key];
        });

        // Slots carry ids of their own, minted the same way and stripped the same way.
        if (Array.isArray(stored.slots) && stored.slots.length > 0) {
            row.slots = stored.slots.slice(0, LIMITS.slotsPerTask).map((slot) => {
                const fresh = createTaskSlot();
                if (isPlainObject(slot)) {
                    SLOT_KEYS.forEach((key) => {
                        if (slot[key] !== undefined) fresh[key] = slot[key];
                    });
                }
                return fresh;
            });
        }
        return row;
    });

    const stored = isPlainObject(data.bands) ? data.bands : {};
    const bandInputs = bandsToInputs();
    BAND_NAMES.forEach((band) => {
        if (isPlainObject(stored[band])) {
            bandInputs[band] = {
                min: typeof stored[band].min === 'string' ? stored[band].min : bandInputs[band].min,
                max: typeof stored[band].max === 'string' ? stored[band].max : bandInputs[band].max,
            };
        }
    });

    const hours = EMPTY_HOURS_INPUTS();
    if (isPlainObject(data.hours)) {
        if (typeof data.hours.weeklyHours === 'string') hours.weeklyHours = data.hours.weeklyHours;
        if (typeof data.hours.maxHoursPerDay === 'string') hours.maxHoursPerDay = data.hours.maxHoursPerDay;
    }

    const rules = EMPTY_RULES_INPUTS();
    if (isPlainObject(data.rules)) {
        if (typeof data.rules.maxConcurrentPerDay === 'string') {
            rules.maxConcurrentPerDay = data.rules.maxConcurrentPerDay;
        }
        if (typeof data.rules.maxConsecutiveDays === 'string') {
            rules.maxConsecutiveDays = data.rules.maxConsecutiveDays;
        }
        if (Array.isArray(data.rules.forbidPairs)) {
            // `{ a, b }` is what is written now. The two-element array is read as well
            // because it costs one branch and this module must never be the reason a
            // department's configuration comes back short.
            rules.forbidPairs = data.rules.forbidPairs
                .map((pair) => {
                    if (isPlainObject(pair)) return [String(pair.a ?? ''), String(pair.b ?? '')];
                    if (Array.isArray(pair) && pair.length === 2) return [String(pair[0] ?? ''), String(pair[1] ?? '')];
                    return null;
                })
                .filter((pair) => pair !== null && pair[0] !== '' && pair[1] !== '');
        }
        // `=== true` rather than truthiness: a document written before this field
        // existed has no key at all, and a stored `'false'` string must not read as on.
        rules.rotateWeekly = data.rules.rotateWeekly === true;
    }

    return {
        taskRows,
        bandInputs,
        hoursInputs: hours,
        rulesInputs: rules,
        extraRules: isPlainObject(data.extraRules) ? data.extraRules : null,
    };
};

/**
 * Has anything a person typed actually changed?
 *
 * Compared on the STORED shape rather than on the wizard state, so a re-minted row
 * id — which changes on every load and means nothing — never reads as an edit. A
 * save button that lights up because a document was opened is a save button people
 * stop believing.
 */
export const settingsChanged = (a, b) => {
    const strip = (value) => {
        if (!isPlainObject(value)) return value;
        const { updatedAt, updatedBy, ...rest } = value;
        return rest;
    };
    return JSON.stringify(strip(a)) !== JSON.stringify(strip(b));
};
