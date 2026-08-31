/**
 * ==============================================================================
 * A PERSON'S OWN DUTIES, AND THE NAME A CALENDAR SHOWS FOR THEM
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * WHAT THIS COVERS, and why it is one file rather than two. Two member fields were
 * added together — `onlyTasks` (this person carries SOME of the department's duties)
 * and `shortName` (an acronym for a phone's calendar) — and they share one path:
 * member document → `rosteredMembers` → `staffRowsFromMembers` → wizard row →
 * `buildDemoRosterV2ConfigFromTables` → the engine and the exporters. A break
 * anywhere along it is silent, so the path is tested end to end.
 *
 * ── THE DEFECT THAT PROMPTED ALL OF IT ───────────────────────────────────────
 *
 * A lead who is on the roster for two clinics and not the other seven opened the
 * staff table's More drawer, pressed "Add availability window", and nothing
 * happened. The capability was real and reachable only in the SANDBOX: live rows
 * are a `useMemo` over the membership, while the drawer's `onChange` is the sandbox
 * row setter, which looked the row's id up in a different array. The press was a
 * guaranteed no-op, twice over — the id never matched, and the table rendered the
 * other array anyway.
 *
 * So the fix is not "make the drawer writable". A second editable copy of a person
 * inside the roster wizard is how display-name keying got in last time. The duties
 * live on the MEMBERSHIP, set by a lead in Admin → Team, and the drawer became
 * read-only and says so. `StaffTable.readonly.test.jsx` pins the drawer; this file
 * pins the model, the wiring and the outputs.
 *
 * ⚠️ THE PROPERTY MOST WORTH ITS TEST is that an EMPTY `onlyTasks` produces NO
 *    window at all. The engine switches time-bounded eligibility on for the WHOLE
 *    configuration the moment any staff entry carries a `windows` key, so an
 *    unasked-for empty list would start judging a department that has never heard
 *    of rotations — and the symptom would be `unfilled` reasons about cohort
 *    windows shown to a roster master who set none.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    SHORT_NAME_MAX,
    ONLY_TASKS_MAX,
    normalizeShortName,
    isValidShortName,
    normalizeOnlyTasks,
    validateMemberRoster,
    buildMemberRosterUpdate,
} from './memberProfile.js';
import {
    staffRowsFromMembers,
    createStaffRow,
    createTaskRow,
    bandsToInputs,
    buildDemoRosterV2ConfigFromTables,
} from './rosterWizard.js';
import { DEFAULT_GRADE_BANDS, generateRosterV2 } from './rosterEngineV2.js';
import { buildICS, buildCSV, displayNameFor, shiftStaffDisplay } from './auraEngine.js';

const DEFAULT_INPUTS = bandsToInputs(DEFAULT_GRADE_BANDS);

/** A membership document as `TeamContext` hands it over: uid from the doc id. */
const member = (seed = {}) => ({
    uid: seed.uid || 'uid-1',
    displayName: seed.displayName || 'Person One',
    fte: 1,
    ...seed,
});

// ==============================================================================
// 1. THE TWO FIELDS AS VALUES
// ==============================================================================

describe('a short name has to survive a calendar', () => {
    /**
     * ⚠️ NOT A STYLE RULE. `,` `;` and `\` are RFC 5545 delimiters and a short name
     *    reaches Outlook inside a VEVENT `SUMMARY`. A comma there does not look
     *    untidy — it splits the title into properties the calendar then misreads.
     */
    it.each([',', ';', '\\', 'A,B', 'X;Y'])('refuses %j, which a calendar would read as a separator', (bad) => {
        expect(isValidShortName(bad)).toBe(false);
        expect(validateMemberRoster({ shortName: bad })).toMatch(/commas or semicolons/i);
    });

    /**
     * A newline is handled by COLLAPSING rather than refusing, and the distinction is
     * worth pinning: `A\nB` becomes `A B`, so no newline can reach the file and end a
     * property early, while a paste that happens to carry one is still accepted.
     */
    it('collapses newlines instead of refusing them', () => {
        expect(normalizeShortName('A\nB')).toBe('A B');
        expect(isValidShortName('A\nB')).toBe(true);
        expect(normalizeShortName('\n')).toBe('');
        expect(normalizeShortName('A\r\nB')).toBe('A B');
    });

    it.each(['MA', 'BF', 'A B', 'S.K', 'AH-1', 'X/Y', 'a1'])('accepts %j', (good) => {
        expect(isValidShortName(good)).toBe(true);
        expect(validateMemberRoster({ shortName: good })).toBe('');
    });

    it('treats blank as valid, because an acronym is optional and never forced', () => {
        for (const blank of ['', '   ', null, undefined]) {
            expect(isValidShortName(blank)).toBe(true);
            expect(validateMemberRoster({ shortName: blank })).toBe('');
        }
    });

    it('caps the length rather than refusing, so a long paste is trimmed not lost', () => {
        expect(normalizeShortName('ABCDEFGHIJKL')).toHaveLength(SHORT_NAME_MAX);
        expect(normalizeShortName('  MA  ')).toBe('MA');
        // Inner runs of whitespace collapse; a name is one line.
        expect(normalizeShortName('M   A')).toBe('M A');
    });
});

describe('a duty list is cleaned without losing its meaning', () => {
    it('trims, collapses whitespace and drops empties', () => {
        expect(normalizeOnlyTasks(' Exercise Test ,, New  Case ,')).toEqual(['Exercise Test', 'New Case']);
    });

    it('de-duplicates case-insensitively, keeping the first spelling', () => {
        expect(normalizeOnlyTasks(['Exercise Test', 'EXERCISE TEST'])).toEqual(['Exercise Test']);
    });

    it('reads an array as well as a typed string, because it round-trips through both', () => {
        expect(normalizeOnlyTasks(['A', 'B'])).toEqual(['A', 'B']);
        expect(normalizeOnlyTasks('A, B')).toEqual(['A', 'B']);
    });

    /**
     * ⚠️ `[]` IS "NO RESTRICTION", NOT "RESTRICTED TO NOTHING". Somebody limited to
     *    zero duties would simply never be rostered, and that is a way to lose a
     *    colleague silently. Every caller treats empty as absent — see section 3.
     */
    it('returns [] for everything that means "not set"', () => {
        for (const blank of ['', '   ', ',,,', null, undefined, 42, {}]) {
            expect(normalizeOnlyTasks(blank)).toEqual([]);
        }
    });

    it('bounds the stored array', () => {
        const many = Array.from({ length: ONLY_TASKS_MAX + 10 }, (_, i) => `Task ${i}`);
        expect(normalizeOnlyTasks(many)).toHaveLength(ONLY_TASKS_MAX);
    });
});

// ==============================================================================
// 2. THE WRITE A LEAD MAKES
// ==============================================================================

describe('buildMemberRosterUpdate writes only what moved, and only allowlisted keys', () => {
    /**
     * ⚠️ AN EXTRA KEY DOES NOT WRITE AN EXTRA FIELD — IT FAILS THE WHOLE WRITE.
     *    `firestore.rules` uses `changedKeys().hasOnly([...])`, so a payload built
     *    from the form rather than from an allowlist breaks the save the first time
     *    somebody adds an input. Pinned as a set, not eyeballed.
     */
    it('never emits a key outside shortName / onlyTasks', () => {
        const update = buildMemberRosterUpdate(
            { shortName: 'MA', onlyTasks: 'A, B' },
            { shortName: '', onlyTasks: [] },
        );
        expect(Object.keys(update).sort()).toEqual(['onlyTasks', 'shortName']);
    });

    it('returns null when nothing changed, so the caller can skip the round trip', () => {
        expect(buildMemberRosterUpdate(
            { shortName: 'MA', onlyTasks: 'A, B' },
            { shortName: 'MA', onlyTasks: ['A', 'B'] },
        )).toBeNull();
    });

    it('compares through the normalizer, so reopening the editor is not a change', () => {
        // The panel seeds the field with `normalizeOnlyTasks(...).join(', ')`. Saving
        // without touching anything must not register as an edit.
        expect(buildMemberRosterUpdate(
            { shortName: '  MA  ', onlyTasks: 'A,  B' },
            { shortName: 'MA', onlyTasks: ['A', 'B'] },
        )).toBeNull();
    });

    it('writes each half independently', () => {
        expect(buildMemberRosterUpdate({ shortName: 'MA', onlyTasks: '' }, { shortName: '', onlyTasks: [] }))
            .toEqual({ shortName: 'MA' });
        expect(buildMemberRosterUpdate({ shortName: '', onlyTasks: 'A' }, { shortName: '', onlyTasks: [] }))
            .toEqual({ onlyTasks: ['A'] });
    });

    it('can CLEAR a restriction back to "every duty"', () => {
        // The field that grants duties back has to work as reliably as the one that
        // takes them away, or a lead cannot undo a mistake.
        expect(buildMemberRosterUpdate({ shortName: '', onlyTasks: '' }, { shortName: '', onlyTasks: ['A'] }))
            .toEqual({ onlyTasks: [] });
    });

    it('refuses an invalid short name rather than writing it', () => {
        expect(buildMemberRosterUpdate({ shortName: 'A,B', onlyTasks: '' }, {})).toBeNull();
    });
});

// ==============================================================================
// 3. THE WIRING — MEMBERSHIP INTO A WIZARD ROW
// ==============================================================================

describe('staffRowsFromMembers carries both fields onto the row', () => {
    /**
     * ⚠️ THE ONE THAT MATTERS MOST. An empty list must produce NO `windows` entry,
     *    because the engine turns time-bounded eligibility on for the whole
     *    configuration as soon as anybody has one.
     */
    it('gives a person with no restriction no window at all', () => {
        for (const absent of [undefined, [], '', null]) {
            const [row] = staffRowsFromMembers([member({ onlyTasks: absent })], {});
            expect(row.windows).toEqual([]);
        }
    });

    it('turns a duty list into exactly one window with BLANK dates', () => {
        const [row] = staffRowsFromMembers(
            [member({ onlyTasks: ['Exercise Test', 'New Case'] })],
            {},
        );
        expect(row.windows).toHaveLength(1);
        // Blank bounds are what the parser reads as unbounded: the limit is on WHICH
        // duties, not on WHEN. A default date would quietly make somebody ineligible.
        expect(row.windows[0].from).toBe('');
        expect(row.windows[0].to).toBe('');
        // The wizard's cells are comma-separated raw strings; `createStaffWindow` joins.
        expect(row.windows[0].tasks).toBe('Exercise Test, New Case');
    });

    it('carries the short name, and leaves it blank when there is none', () => {
        const [withOne] = staffRowsFromMembers([member({ shortName: 'MA' })], {});
        expect(withOne.shortName).toBe('MA');
        const [without] = staffRowsFromMembers([member()], {});
        expect(without.shortName).toBe('');
    });

    it('works for a PLACEHOLDER member, who has no Firebase uid', () => {
        // `add-pending-member.cjs` keys a placeholder `pending-<email>`, and
        // `TeamContext` sets `uid` from the document id — so a colleague who has not
        // registered can still be limited to some duties and given an acronym.
        // ⚠️ A SYNTHETIC ADDRESS ON PURPOSE. This repository is public, and the id
        //    shape is derived from a work email — so using a colleague's real one
        //    would put their address in a second tracked file to test a slug format
        //    that does not care whose it is.
        const [row] = staffRowsFromMembers([
            member({ uid: 'pending-a-person-example-org', displayName: 'A Person', onlyTasks: ['New Case'], shortName: 'AP' }),
        ], {});
        expect(row.uid).toBe('pending-a-person-example-org');
        expect(row.windows).toHaveLength(1);
        expect(row.shortName).toBe('AP');
    });
});

describe('the mapper carries a short name into the config, and refuses a broken one', () => {
    const build = (overrides = {}) => buildDemoRosterV2ConfigFromTables({
        startDate: '2026-09-07',
        weeks: 1,
        bandInputs: DEFAULT_INPUTS,
        staffRows: [],
        taskRows: [],
        ...overrides,
    });

    it('emits shortName when set and omits the key when blank', () => {
        const withOne = build({
            staffRows: [createStaffRow({ name: 'Person One', grade: 'AH13', shortName: 'P1' })],
            taskRows: [createTaskRow({ name: 'Clinic' })],
        });
        expect(withOne.ok).toBe(true);
        expect(withOne.config.staff[0].shortName).toBe('P1');

        const without = build({
            staffRows: [createStaffRow({ name: 'Person One', grade: 'AH13' })],
            taskRows: [createTaskRow({ name: 'Clinic' })],
        });
        expect(without.config.staff[0]).not.toHaveProperty('shortName');
    });

    it('refuses a comma before it can reach the exporter', () => {
        const result = build({
            staffRows: [createStaffRow({ name: 'Person One', grade: 'AH13', shortName: 'A,B' })],
            taskRows: [createTaskRow({ name: 'Clinic' })],
        });
        expect(result.ok).toBe(false);
        expect(result.staffErrors[Object.keys(result.staffErrors)[0]].shortName).toMatch(/commas or semicolons/i);
    });

    it('does not silently drop a row that carries ONLY a short name', () => {
        // The cell is behind the drawer. A row with content but no name used to be
        // silence, which would throw the typed value away without saying so.
        const result = build({
            staffRows: [createStaffRow({ shortName: 'MA' })],
            taskRows: [createTaskRow({ name: 'Clinic' })],
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/nobody to apply them to/i);
    });
});

// ==============================================================================
// 4. THE ENGINE — THE ACTUAL REQUIREMENT
// ==============================================================================

describe('a lead who carries SOME of the department\'s duties', () => {
    /**
     * The reported case, as a roster: five people, four duties, four weeks, and one
     * of them — the lead — takes only two of the four. The department must still
     * fill, and the lead must never appear on the other two.
     *
     * ⚠️ DRIVEN THROUGH `buildDemoRosterV2ConfigFromTables`, NOT BY HAND, and the
     *    first draft of this suite proved why. A hand-written config carrying the
     *    ROW shape — `{ from: '', to: '', tasks: [...] }` — is refused outright:
     *    "Alif's window 1 has a from that is not a real YYYY-MM-DD date". Blank
     *    strings are the WIZARD's convention, because a half-typed date has to
     *    survive a keystroke, and `parseStaffWindows` is what drops them so the
     *    engine sees a window with no bounds at all. Testing the engine directly
     *    would have pinned a shape production never sends and skipped the one
     *    conversion that can break.
     */
    const members = [
        { uid: 'u1', displayName: 'Alif', fte: 1, onlyTasks: ['Exercise Test', 'New Case'] },
        { uid: 'u2', displayName: 'Brandon', fte: 1 },
        { uid: 'u3', displayName: 'Fadzlynn', fte: 1 },
        { uid: 'u4', displayName: 'Derlinder', fte: 1 },
        { uid: 'u5', displayName: 'Ying Xian', fte: 1 },
    ];
    const grades = { u1: 'AH14', u2: 'AH11', u3: 'AH13', u4: 'AH13', u5: 'AH12' };
    const DUTIES = ['Exercise Test', 'New Case', 'Inpatient Therapy', 'Group Session'];

    const built = buildDemoRosterV2ConfigFromTables({
        startDate: '2026-09-07',
        weeks: 4,
        bandInputs: DEFAULT_INPUTS,
        staffRows: staffRowsFromMembers(members, grades),
        taskRows: DUTIES.map((name) => createTaskRow({ name })),
    });

    /** Every duty a given person was rostered onto, across the whole run. */
    const dutiesFor = (roster, person) => {
        const found = new Set();
        for (const shifts of Object.values(roster)) {
            for (const s of shifts) {
                if ([s.lead, s.coLead, ...(s.assignees || [])].includes(person)) found.add(s.task);
            }
        }
        return found;
    };

    it('maps to a window with NO date bounds, which is what makes it a duty limit', () => {
        expect(built.ok).toBe(true);
        // Not `from: ''` — the keys are absent. This is the conversion the engine
        // depends on, and the reason this suite goes through the mapper.
        expect(built.config.staff[0].windows).toEqual([{ tasks: ['Exercise Test', 'New Case'] }]);
    });

    it('generates, and fills every slot', () => {
        const run = generateRosterV2(built.config);
        expect(run.ok).toBe(true);
        expect(run.unfilled ?? []).toHaveLength(0);
    });

    it('never rosters them onto a duty outside their list', () => {
        const run = generateRosterV2(built.config);
        expect([...dutiesFor(run.roster, 'Alif')].sort()).toEqual(['Exercise Test', 'New Case']);
    });

    it('still rosters them — a limit is not a removal', () => {
        // The failure mode worth naming: a restriction so tight the person vanishes
        // reads exactly like `rostered: false`, and nobody would notice for a month.
        const run = generateRosterV2(built.config);
        expect(dutiesFor(run.roster, 'Alif').size).toBeGreaterThan(0);
    });

    it('leaves everybody else on every duty', () => {
        const run = generateRosterV2(built.config);
        // Nobody else acquired a restriction from the one person who has one.
        expect(dutiesFor(run.roster, 'Brandon').size).toBe(DUTIES.length);
    });

    it('and with NOBODY restricted, no window is emitted at all', () => {
        // The companion property: the engine must not switch time-bounded
        // eligibility on for a department that set no limits.
        const plain = buildDemoRosterV2ConfigFromTables({
            startDate: '2026-09-07',
            weeks: 4,
            bandInputs: DEFAULT_INPUTS,
            staffRows: staffRowsFromMembers(members.map(({ onlyTasks, ...rest }) => rest), grades),
            taskRows: DUTIES.map((name) => createTaskRow({ name })),
        });
        expect(plain.ok).toBe(true);
        for (const person of plain.config.staff) {
            expect(person).not.toHaveProperty('windows');
        }
    });
});

// ==============================================================================
// 5. THE OUTPUTS — A SHORT NAME IS DISPLAY ONLY
// ==============================================================================

const SHORTS = { 'Muhammad Alif': 'MA', 'Brandon Feng': 'BF' };

const shift = (seed = {}) => ({
    task: 'Exercise Test',
    lead: 'Muhammad Alif',
    coLead: 'Brandon Feng',
    staff: 'Lead: Muhammad Alif, Co: Brandon Feng',
    category: 'Clinical',
    week: 1,
    ...seed,
});

describe('displayNameFor substitutes, and only where it is safe to', () => {
    it('returns the short name when there is one', () => {
        expect(displayNameFor('Muhammad Alif', SHORTS)).toBe('MA');
    });

    it('returns the full name when there is not', () => {
        expect(displayNameFor('Somebody Else', SHORTS)).toBe('Somebody Else');
        expect(displayNameFor('Muhammad Alif', null)).toBe('Muhammad Alif');
        expect(displayNameFor('Muhammad Alif', { 'Muhammad Alif': '   ' })).toBe('Muhammad Alif');
    });

    it('passes non-strings straight through, so an absent co-lead stays absent', () => {
        // `buildShiftStaffLabel(lead, undefined)` yields `Lead: X`. A stringified
        // `undefined` here would print `Co: undefined` into somebody's calendar.
        expect(displayNameFor(undefined, SHORTS)).toBeUndefined();
        expect(displayNameFor('', SHORTS)).toBe('');
    });
});

describe('the calendar chip', () => {
    it('shortens the stored label when somebody has an acronym', () => {
        expect(shiftStaffDisplay(shift(), SHORTS)).toBe('Lead: MA, Co: BF');
    });

    it('returns the STORED string untouched when nothing is shortened', () => {
        // Byte-for-byte, because the stored string is what a swap rewrote and what
        // every existing test and live document holds.
        expect(shiftStaffDisplay(shift(), null)).toBe('Lead: Muhammad Alif, Co: Brandon Feng');
        expect(shiftStaffDisplay(shift(), { 'Nobody Here': 'NH' })).toBe('Lead: Muhammad Alif, Co: Brandon Feng');
    });

    it('shortens one person without touching the other', () => {
        expect(shiftStaffDisplay(shift(), { 'Muhammad Alif': 'MA' })).toBe('Lead: MA, Co: Brandon Feng');
    });

    it('falls back to the stored string when there is no lead to build a label from', () => {
        expect(shiftStaffDisplay({ ...shift(), lead: '' }, SHORTS)).toBe('Lead: Muhammad Alif, Co: Brandon Feng');
    });

    /**
     * ⚠️ A DELIBERATE TRADE-OFF, WRITTEN DOWN SO IT IS NOT DISCOVERED LATER.
     *
     *    `auraEngine.exports.test.js` pins, on purpose, that a two-person SUMMARY uses
     *    `staff` VERBATIM even where it disagrees with `lead`/`coLead` — "a live
     *    document whose display string was hand-corrected must keep exporting the
     *    hand-corrected string". That pin still holds, because it exercises the
     *    no-short-names path.
     *
     *    But the moment ANYBODY on a shift has an acronym, the label is rebuilt from
     *    `lead` and `coLead`, and anything in `staff` that is not derivable from those
     *    two is lost — `(acting)` below. It has to be that way round: the stored
     *    string is a full-name sentence, so trusting it would mean ignoring the
     *    acronym for exactly the common two-person case. An audit found this stated
     *    in a code comment and asserted nowhere, which is how a choice becomes a bug
     *    report.
     */
    it('DISCARDS a hand-corrected staff string once somebody on the shift has an acronym', () => {
        const hand = shift({ staff: 'Lead: Muhammad Alif (acting), Co: Brandon Feng' });
        // Untouched while nothing is shortened.
        expect(shiftStaffDisplay(hand, null)).toBe('Lead: Muhammad Alif (acting), Co: Brandon Feng');
        // Rebuilt — and "(acting)" does not survive.
        expect(shiftStaffDisplay(hand, SHORTS)).toBe('Lead: MA, Co: BF');
        expect(shiftStaffDisplay(hand, SHORTS)).not.toMatch(/acting/);
    });
});

describe('the .ics export', () => {
    const ics = (options) => buildICS({ '2026-09-07': [shift()] }, { now: new Date('2026-09-01T00:00:00Z'), ...options });

    it('puts the short names in the SUMMARY, which is what a phone shows', () => {
        expect(ics({ shortNames: SHORTS })).toMatch(/SUMMARY:\[Exercise Test\] Lead: MA\\, Co: BF/);
    });

    /**
     * ⚠️ AN ACRONYM MOVES INFORMATION, IT DOES NOT LOSE IT. `MA` in a title is only
     *    an improvement if opening the event still answers "who is that?" — a
     *    colleague reading somebody else's roster has no reason to know the
     *    department's initials.
     */
    it('keeps the full names inside the event body', () => {
        const out = ics({ shortNames: SHORTS });
        expect(out).toMatch(/DESCRIPTION:.*Muhammad Alif/);
        expect(out).toMatch(/DESCRIPTION:.*Brandon Feng/);
    });

    it('is byte-identical to the old output when no short names are given', () => {
        const before = ics({});
        expect(before).toMatch(/SUMMARY:\[Exercise Test\] Lead: Muhammad Alif\\, Co: Brandon Feng/);
        // And the DESCRIPTION gains nothing: it is still Week - Category alone.
        expect(before).toMatch(/DESCRIPTION:Week 1 - Clinical\r?\n/);
        expect(before).not.toMatch(/DESCRIPTION:.*Muhammad Alif/);
        // Passing an empty map is the same as passing none.
        expect(ics({ shortNames: {} })).toBe(before);
    });
});

describe('the .csv export uses short names too', () => {
    /**
     * ⚠️ THIS TEST USED TO ASSERT THE OPPOSITE, AND THE OPPOSITE WAS A DECISION TAKEN
     *    ON A DEPARTMENT'S BEHALF. The CSV deliberately kept full names, reasoning
     *    that a spreadsheet has no width to run out of. Sound reasoning, wrong person
     *    making the call: the owner set acronyms, opened the CSV, saw full names and
     *    asked what was going on. An acronym is now used wherever one is set, and a
     *    department that wants full names gets them by not setting one.
     */
    it('shortens the identity columns when an acronym exists', () => {
        const csv = buildCSV({ '2026-09-07': [shift()] }, { shortNames: SHORTS });
        expect(csv).toMatch(/,MA,BF,/);
        expect(csv).not.toMatch(/Muhammad Alif/);
    });

    it('keeps full names when no acronym is set', () => {
        // Both the absent-map case and the nobody-matches case, because a department
        // that has set none must get exactly the file it always got.
        for (const options of [undefined, {}, { shortNames: { 'Nobody Here': 'NH' } }]) {
            const csv = buildCSV({ '2026-09-07': [shift()] }, options);
            expect(csv).toMatch(/Muhammad Alif/);
            expect(csv).toMatch(/Brandon Feng/);
        }
    });

    it('shortens the Assignees column as well as Lead and Co-Lead', () => {
        // Three names go through a different code path from the two identity columns.
        const three = shift({ assignees: ['Muhammad Alif', 'Brandon Feng', 'Somebody Else'] });
        const csv = buildCSV({ '2026-09-07': [three] }, { shortNames: SHORTS });
        expect(csv).toMatch(/MA; BF; Somebody Else/);
    });
});

// ==============================================================================
// 6. THE BOUNDARY
// ==============================================================================

describe('firestore.rules puts these two fields on the LEAD\'s list only', () => {
    const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');

    /**
     * The `hasOnly([...])` list belonging to one `allow update` inside the MEMBERS
     * block.
     *
     * ⚠️ SCOPED TO THAT BLOCK ON PURPOSE. The first draft searched the whole file for
     *    `allow update: if isLead(teamId)` and matched the TEAM document's rule —
     *    `['name', 'institution', 'department', 'profession']` — so it was asserting
     *    against a completely different allowlist and failed for a reason that had
     *    nothing to do with the fields under test. The same trap
     *    `add-pending-member.test.mjs` documents about anchoring on the first
     *    `db.batch()` in a file.
     */
    const membersBlock = (() => {
        const at = rules.indexOf('match /members/{memberUid}');
        expect(at, 'the members block moved or was renamed').toBeGreaterThan(-1);
        // Ends where the next sibling collection begins.
        const next = rules.indexOf('match /', rules.indexOf('allow update: if isSelf(memberUid)', at));
        return rules.slice(at, next === -1 ? rules.length : next);
    })();

    const allowlistAfter = (guard) => {
        const at = membersBlock.indexOf(guard);
        expect(at, `guard not found in the members block: ${guard}`).toBeGreaterThan(-1);
        const start = membersBlock.indexOf('hasOnly([', at);
        const end = membersBlock.indexOf('])', start);
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        return membersBlock.slice(start, end);
    };

    it('lets a lead write both', () => {
        const list = allowlistAfter('allow update: if isLead(teamId)');
        expect(list).toMatch(/'shortName'/);
        expect(list).toMatch(/'onlyTasks'/);
        // The guard really is the members one, not the team document's.
        expect(list).toMatch(/'rostered'/);
    });

    /**
     * ⚠️ AND A PERSON MAY NOT WRITE EITHER TO THEIR OWN MEMBERSHIP.
     *
     *    `shortName` is how colleagues identify somebody on a shared calendar — the
     *    same argument that keeps `displayName` off this list. `onlyTasks` is which
     *    duties they carry: somebody who could edit their own could opt out of a
     *    duty without telling anybody, the roster would still generate, and nobody
     *    would be short until the day itself.
     */
    it('does NOT let a person write either to their own membership', () => {
        const list = allowlistAfter('allow update: if isSelf(memberUid)');
        expect(list).not.toMatch(/shortName/);
        expect(list).not.toMatch(/onlyTasks/);
        // The guard is still the one this test thinks it is.
        expect(list).toMatch(/'profession'/);
        expect(list).not.toMatch(/'rostered'/);
    });
});
