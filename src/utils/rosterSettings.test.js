/**
 * ==============================================================================
 * ROSTER SETTINGS — the round trip is the whole feature
 * ==============================================================================
 *
 * A department's configuration that does not survive a reload is worse than no
 * persistence at all: it looks saved, and the loss shows up as a roster generated
 * against a policy nobody chose. So most of this file is one property asked in
 * different ways — what a roster master typed is what they get back.
 *
 * The rest guards the two things that must NOT make the trip: React row ids, and
 * anything about a PERSON. Staff and their grades live elsewhere, and grade lives
 * elsewhere specifically because it must not be readable by the team — while this
 * document is.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import { toStoredSettings, fromStoredSettings, settingsChanged, LIMITS } from './rosterSettings';
import {
    createTaskRow,
    createStaffRow,
    bandsToInputs,
    EMPTY_HOURS_INPUTS,
    EMPTY_RULES_INPUTS,
} from './rosterWizard';

/** A department that uses most of what the wizard can express. */
const configured = () => ({
    taskRows: [
        createTaskRow({ name: 'EFT', days: [1, 3, 5], hours: 4, leadBands: ['senior'], minGrade: 'AH12' }),
        createTaskRow({ name: 'Monthly CPET', recurrence: { ordinal: 2, weekday: 3 }, category: 'CLINIC' }),
        createTaskRow({ name: 'Ward round', slots: [{ band: 'principal' }, { band: 'junior' }] }),
    ],
    bandInputs: { ...bandsToInputs(), senior: { min: '12', max: '14' } },
    hoursInputs: { weeklyHours: '42', maxHoursPerDay: '9' },
    rulesInputs: { maxConcurrentPerDay: '2', maxConsecutiveDays: '5', forbidPairs: [['Alif', 'Nisa']] },
    extraRules: null,
});

const roundTrip = (state) => fromStoredSettings(toStoredSettings(state));

// ── 1. WHAT A ROSTER MASTER TYPED IS WHAT THEY GET BACK ──────────────────────

describe('the round trip', () => {
    it('keeps every task, in order', () => {
        const back = roundTrip(configured());
        expect(back.taskRows.map((row) => row.name)).toEqual(['EFT', 'Monthly CPET', 'Ward round']);
    });

    it('keeps a weekly task\'s days, hours, band gate and grade floor', () => {
        const [eft] = roundTrip(configured()).taskRows;
        expect(eft.days).toEqual([1, 3, 5]);
        expect(eft.hours).toBe('4');
        expect(eft.leadBands).toEqual(['senior']);
        expect(eft.minGrade).toBe('AH12');
    });

    /**
     * ⚠️ THE CASE A NAIVE ROUND TRIP GETS WRONG. A task's calendar is EITHER a
     *    weekly day strip OR a monthly nth-weekday, and the row carries a MODE
     *    that decides which. Rehydrating through `createTaskRow(stored)` would
     *    look for `stored.recurrence` — an engine-shaped key this row does not
     *    have — and quietly reopen a monthly task as a weekly one, which is a
     *    different roster generated without a word.
     */
    it('keeps a MONTHLY task monthly, with its ordinal and weekday', () => {
        const monthly = roundTrip(configured()).taskRows[1];
        expect(monthly.calendarMode).toBe('monthly');
        expect(monthly.recurrenceOrdinal).toBe('2');
        expect(monthly.recurrenceWeekday).toBe('3');
        expect(monthly.category).toBe('CLINIC');
    });

    it('keeps a slotted task in slot mode, with its bands', () => {
        const slotted = roundTrip(configured()).taskRows[2];
        expect(slotted.slotMode).toBe(true);
        expect(slotted.slots.map((slot) => slot.band)).toEqual(['principal', 'junior']);
    });

    it('keeps a department\'s own band boundaries', () => {
        expect(roundTrip(configured()).bandInputs.senior).toEqual({ min: '12', max: '14' });
    });

    it('keeps the hours policy and the scheduling rules', () => {
        const back = roundTrip(configured());
        expect(back.hoursInputs).toEqual({ weeklyHours: '42', maxHoursPerDay: '9' });
        expect(back.rulesInputs.maxConcurrentPerDay).toBe('2');
        expect(back.rulesInputs.maxConsecutiveDays).toBe('5');
        expect(back.rulesInputs.forbidPairs).toEqual([['Alif', 'Nisa']]);
    });

    /** Twice through must be identical to once — otherwise it drifts every reload. */
    it('is stable: a second trip changes nothing', () => {
        const once = toStoredSettings(configured());
        const twice = toStoredSettings(fromStoredSettings(once));
        expect(twice).toEqual(once);
    });
});

// ── 2. WHAT MUST NOT MAKE THE TRIP ───────────────────────────────────────────

describe('row ids are never persisted', () => {
    /**
     * ⚠️ An `id` is a REACT KEY from a module-level counter — a fresh-identity
     *    source so removing a row does not re-mount the ones below it. Stored and
     *    read back in a new tab it would collide with an id the counter is about to
     *    mint, and two rows sharing a key is how an edit lands in the wrong row.
     */
    it('strips them on the way out', () => {
        const stored = toStoredSettings(configured());
        expect(JSON.stringify(stored)).not.toMatch(/"id":/);
    });

    it('mints fresh ones on the way in, all distinct', () => {
        const back = roundTrip(configured());
        const ids = back.taskRows.map((row) => row.id);
        expect(ids.every(Boolean)).toBe(true);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('gives slots fresh ids too', () => {
        const slots = roundTrip(configured()).taskRows[2].slots;
        expect(new Set(slots.map((slot) => slot.id)).size).toBe(slots.length);
    });

    it('does not reuse an id across two loads of the same document', () => {
        const stored = toStoredSettings(configured());
        const first = fromStoredSettings(stored).taskRows.map((row) => row.id);
        const second = fromStoredSettings(stored).taskRows.map((row) => row.id);
        expect(first.some((id) => second.includes(id))).toBe(false);
    });
});

describe('nothing about a PERSON is stored', () => {
    /**
     * ⚠️ THE ONE THAT WOULD UNDO THE PRIVACY SPLIT. A staff row carries `grade`,
     *    and grade is `teams/{id}/grades/{uid}` — readable only by the person and a
     *    lead. THIS document is readable by every member of the team. Writing staff
     *    rows here would publish every grade in the department, silently, through a
     *    door nobody was looking at.
     *
     *    Which is why staff are excluded WHOLESALE rather than filtered field by
     *    field: a filter has to be updated when a field is added, and this does not.
     */
    it('ignores staff rows entirely, even when handed them', () => {
        const stored = toStoredSettings({
            ...configured(),
            staffRows: [createStaffRow({ name: 'Zubaidah', grade: 'AH17', fte: 1 })],
        });
        const json = JSON.stringify(stored);
        expect(json, 'a grade reached a document the whole team can read').not.toMatch(/AH17/);
        expect(json, 'a staff name reached the document').not.toMatch(/Zubaidah/);
        expect(stored.staffRows).toBeUndefined();
        expect(stored.staff).toBeUndefined();
    });

    /**
     * ⚠️ THE ONE EXCEPTION, ASSERTED SO IT IS A DECISION RATHER THAN A LEAK.
     *    `forbidPairs` names two colleagues who must not be rostered together. It
     *    cannot live anywhere else — it is a scheduling rule the engine reads with
     *    the rest of the configuration — and this document is team-readable, so
     *    those names are visible to the department.
     *
     *    Accepted because the rule's EFFECT is observable anyway: two people who
     *    never share a shift are two people anybody can see never share a shift.
     *    This test exists so that removing the names later is a deliberate change
     *    to a stated position, not a silent one.
     */
    it('DOES store forbidPairs names, which is the one accepted exception', () => {
        const stored = toStoredSettings(configured());
        expect(stored.rules.forbidPairs).toEqual([{ a: 'Alif', b: 'Nisa' }]);
    });

    /**
     * ⚠️ THE SHAPE IS `{ a, b }` BECAUSE FIRESTORE FORBIDS AN ARRAY INSIDE AN ARRAY,
     *    AND GETTING THIS WRONG LOST A DEPARTMENT'S WHOLE CONFIGURATION.
     *
     *    It was `[['Alif','Nisa']]`, which is a nested array, so `setDoc` threw
     *    "Nested arrays are not supported" and the ENTIRE settings document failed to
     *    write — tasks, bands, hours, everything, not just the pairs. The department
     *    was told "you may have to set it up again next time" with no indication that
     *    one control had caused it. The owner had to read the reason out of a browser
     *    console.
     *
     *    So this asserts the property rather than the spelling: nothing the writer
     *    produces may be an array whose entries are arrays.
     */
    it('writes nothing Firestore would reject as a nested array', () => {
        const stored = toStoredSettings(configured());
        const offenders = [];
        const walk = (value, path) => {
            if (Array.isArray(value)) {
                value.forEach((entry, i) => {
                    if (Array.isArray(entry)) offenders.push(`${path}[${i}]`);
                    walk(entry, `${path}[${i}]`);
                });
                return;
            }
            if (value && typeof value === 'object') {
                for (const [key, inner] of Object.entries(value)) walk(inner, `${path}.${key}`);
            }
        };
        walk(stored, 'settings');
        expect(offenders, `nested arrays at: ${offenders.join(', ')}`).toEqual([]);
    });

    it('reads the pair back as the two names the wizard works in', () => {
        const stored = toStoredSettings(configured());
        const back = fromStoredSettings({ version: 1, tasks: [{ name: 'EFT' }], rules: stored.rules });
        expect(back.rulesInputs.forbidPairs).toEqual([['Alif', 'Nisa']]);
    });

    it('still reads a legacy two-element array, so nothing is lost on the way in', () => {
        const back = fromStoredSettings({
            version: 1,
            tasks: [{ name: 'EFT' }],
            rules: { forbidPairs: [['Alif', 'Nisa']] },
        });
        expect(back.rulesInputs.forbidPairs).toEqual([['Alif', 'Nisa']]);
    });

    it('reads back no staff either, so a stored one could not resurface', () => {
        const back = fromStoredSettings({
            version: 1,
            tasks: [{ name: 'EFT' }],
            staffRows: [{ name: 'Smuggled', grade: 'AH17' }],
        });
        expect(back.staffRows).toBeUndefined();
        expect(JSON.stringify(back)).not.toMatch(/Smuggled|AH17/);
    });
});

// ── 3. REFUSING TO DESTROY A REAL CONFIGURATION ──────────────────────────────

describe('an empty wizard is not a configuration', () => {
    /**
     * ⚠️ THE DESTRUCTIVE CASE. The wizard opens with blank rows. Saving those over
     *    a department's real setup would replace it with nothing, and the roster
     *    master would not find out until the next Generate produced an empty week.
     */
    it('returns null rather than a document that would blank a department', () => {
        expect(toStoredSettings({ taskRows: [createTaskRow(), createTaskRow()] })).toBeNull();
        expect(toStoredSettings({})).toBeNull();
        expect(toStoredSettings()).toBeNull();
    });

    it('drops unnamed rows but keeps the named ones beside them', () => {
        const stored = toStoredSettings({
            taskRows: [createTaskRow(), createTaskRow({ name: 'EFT' }), createTaskRow()],
        });
        expect(stored.tasks.map((task) => task.name)).toEqual(['EFT']);
    });
});

// ── 4. A DOCUMENT WRITTEN BY SOMEBODY ELSE ───────────────────────────────────

describe('reading a document this version did not write', () => {
    it('returns null for anything that is not a configuration', () => {
        [null, undefined, 42, 'roster', {}, { tasks: 'EFT' }, []].forEach((value) => {
            expect(fromStoredSettings(value)).toBeNull();
        });
    });

    /**
     * A document written by an OLDER version lacks fields added since. Every row is
     * built from a blank one and overlaid, so a missing field is present with its
     * default rather than `undefined` — which would render as an empty control the
     * user cannot tell from a deliberate blank.
     */
    it('fills in fields an older version never wrote', () => {
        const back = fromStoredSettings({ version: 1, tasks: [{ name: 'EFT' }] });
        const [row] = back.taskRows;
        expect(row.days).toEqual(createTaskRow().days);
        expect(row.calendarMode).toBe(createTaskRow().calendarMode);
        expect(row.slots.length).toBeGreaterThan(0);
        expect(back.bandInputs).toEqual(bandsToInputs());
        expect(back.hoursInputs).toEqual(EMPTY_HOURS_INPUTS());
        expect(back.rulesInputs).toEqual(EMPTY_RULES_INPUTS());
    });

    /**
     * ⚠️ THE OVERLAY IS AN ALLOWLIST, NOT A SPREAD. This document is written by a
     *    lead and read by every member, so it is not more trusted than any other
     *    client-supplied value.
     */
    it('refuses to copy a key the row does not own', () => {
        const back = fromStoredSettings({
            version: 1,
            tasks: [{ name: 'EFT', __proto__: {}, isAdmin: true, id: 'task-1' }],
        });
        expect(back.taskRows[0].isAdmin).toBeUndefined();
        expect(back.taskRows[0].id).not.toBe('task-1');
    });

    it('bounds a document somebody made enormous', () => {
        const many = Array.from({ length: 500 }, (_, i) => ({ name: `T${i}` }));
        expect(fromStoredSettings({ version: 1, tasks: many }).taskRows.length).toBe(LIMITS.tasks);
        expect(toStoredSettings({
            taskRows: many.map((task) => createTaskRow(task)),
        }).tasks.length).toBe(LIMITS.tasks);
    });

    it('caps a single field somebody made enormous', () => {
        const stored = toStoredSettings({ taskRows: [createTaskRow({ name: 'x'.repeat(5000) })] });
        expect(stored.tasks[0].name.length).toBe(LIMITS.textChars);
    });
});

// ── 5. THE SAVE BUTTON ───────────────────────────────────────────────────────

describe('settingsChanged', () => {
    /**
     * Compared on the STORED shape, so a re-minted row id — which changes on every
     * load and means nothing — never reads as an edit. A save button that lights up
     * because a document was opened is a save button people stop believing.
     */
    it('is false across a load, despite every id being new', () => {
        const stored = toStoredSettings(configured());
        expect(settingsChanged(stored, toStoredSettings(fromStoredSettings(stored)))).toBe(false);
    });

    it('ignores the stamp, which moves on every save', () => {
        const a = toStoredSettings(configured(), { now: '2026-01-01', by: 'uid-a' });
        const b = toStoredSettings(configured(), { now: '2026-08-23', by: 'uid-b' });
        expect(settingsChanged(a, b)).toBe(false);
    });

    it('is true when a real edit happened', () => {
        const before = toStoredSettings(configured());
        const edited = configured();
        edited.taskRows[0].hours = '6';
        expect(settingsChanged(before, toStoredSettings(edited))).toBe(true);
    });
});
