/**
 * ==============================================================================
 * AURA ROSTER ENGINE V2 — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest
 * Run:    npm test
 *         TZ=Asia/Singapore npm test
 *         TZ=America/New_York npm test
 *
 * PURPOSE — read this before changing any assertion below.
 *
 * These are SPECIFICATION tests, unlike `auraEngine.test.js`, which pins the old
 * engine's behaviour *including its defects*. Every assertion here describes
 * something the constraint-aware engine must do. A failure is a bug in the
 * engine, not an expected diff.
 *
 * Two suites at the bottom are the exception. `SCALING TABLE` measures BOTH
 * engines on the same configurations, so the old engine's two documented failure
 * modes — one person holding five duties at once, and twelve of twenty people
 * never rostered — are recorded in executable form rather than in prose. Those
 * assertions are characterization of `generateRoster` and would fail if somebody
 * fixed it, which is the correct signal: the table would need re-measuring.
 *
 * WHY THE NUMBERS ARE WHAT THEY ARE: every figure in this file was obtained by
 * running the engine and recording the result, never derived by hand. Where a
 * figure is a *band* rather than an exact value (FTE fairness) that is
 * deliberate — an exact number would pin an implementation detail of the
 * tie-breaker instead of the property being tested.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import { generateRoster, buildShiftStaffLabel } from './auraEngine';
import {
    generateRosterV2,
    validateRosterV2Config,
    measureRosterLoad,
    auditHardConstraints,
    scoreRoster,
    SOFT_PENALTY_WEIGHTS,
    snapToMonday,
    parseLocalDateKey,
    toLocalDateKey,
    isDateKey,
    ROSTER_V2_DEFAULTS,
} from './rosterEngineV2';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Day-of-week of a `YYYY-MM-DD` key, 0 = Sunday.
 *
 * Parsed as UTC on purpose, and computed WITHOUT the engine's own date helpers.
 * "What weekday is the string 2026-03-09?" is a pure calendar fact; if this
 * helper used local parsing it could reproduce the very timezone bug the suite
 * is here to rule out, and the tests would pass or fail by geography.
 */
const weekdayOfKey = (key) => new Date(`${key}T00:00:00Z`).getUTCDay();

/** The calendar day after `key`, by UTC arithmetic — independent of the engine. */
const nextKey = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    return [
        String(next.getUTCFullYear()).padStart(4, '0'),
        String(next.getUTCMonth() + 1).padStart(2, '0'),
        String(next.getUTCDate()).padStart(2, '0'),
    ].join('-');
};

const SUNDAY = 0;
const MONDAY = 1;
const SATURDAY = 6;

/** Every shift, flattened, each tagged with the key it sits under. */
const flatten = (roster) =>
    Object.entries(roster).flatMap(([dateKey, shifts]) =>
        shifts.map((shift) => ({ dateKey, shift })),
    );

/** Everyone named on a shift, whichever fields carry them. */
const peopleOn = (shift) =>
    Array.isArray(shift.assignees)
        ? shift.assignees
        : [shift.lead, shift.coLead].filter(Boolean);

/** `{ dateKey: { name: dutyCount } }` — the double-booking measurement. */
const dutiesPerDay = (roster) => {
    const out = {};
    for (const [dateKey, shifts] of Object.entries(roster)) {
        out[dateKey] = {};
        for (const shift of shifts) {
            for (const name of peopleOn(shift)) {
                out[dateKey][name] = (out[dateKey][name] || 0) + 1;
            }
        }
    }
    return out;
};

/** The longest run of consecutive CALENDAR days on which `name` holds a duty. */
const longestConsecutiveRun = (roster, name) => {
    const worked = Object.keys(roster)
        .filter((key) => roster[key].some((shift) => peopleOn(shift).includes(name)))
        .sort();

    let longest = 0;
    let run = 0;
    let previous = null;

    for (const key of worked) {
        run = previous !== null && nextKey(previous) === key ? run + 1 : 1;
        if (run > longest) longest = run;
        previous = key;
    }

    return longest;
};

const namePool = (n) =>
    Array.from({ length: n }, (_, i) => `S${String(i + 1).padStart(2, '0')}`);

const taskPool = (n) =>
    Array.from({ length: n }, (_, i) => `T${String(i + 1).padStart(2, '0')}`);

/** A config of `staffCount` plain full-timers and `taskCount` plain Mon–Fri tasks. */
const scalingConfig = (staffCount, taskCount) => ({
    startDate: '2026-02-02',
    weeks: 4,
    staff: namePool(staffCount).map((name) => ({ name })),
    tasks: taskPool(taskCount).map((name) => ({ name })),
});

/**
 * Run `fn` with the process timezone temporarily changed.
 *
 * Node honours a mutated `process.env.TZ` for `Date` operations that follow it.
 * The offset assertion in the timezone suite proves the mutation actually took
 * effect: a platform that ignored it would FAIL loudly rather than pass the
 * cross-zone comparison vacuously (post-mortem D1 — a test that cannot fail is
 * a decoy).
 */
const withTZ = (tz, fn) => {
    const previous = process.env.TZ;
    process.env.TZ = tz;
    try {
        return fn();
    } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
    }
};

/** A small, realistic department: skills, a part-timer, leave, a weekend duty. */
const departmentConfig = (overrides = {}) => ({
    startDate: '2026-02-02',
    weeks: 4,
    staff: [
        { name: 'Brandon', fte: 1.0, skills: ['CPET', 'SPIRO'] },
        { name: 'Derlinder', fte: 1.0, skills: ['SPIRO'] },
        { name: 'Fadzlynn', fte: 0.6, skills: ['CPET'], unavailable: ['2026-02-10'] },
        { name: 'Ying Xian', fte: 1.0, skills: [] },
    ],
    tasks: [
        { name: 'EFT', requiresSkill: 'CPET', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1 },
        { name: 'IPT+SKG', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1 },
        { name: 'NC', days: [1, 3, 5], leads: 1, coLeads: 0 },
        { name: 'VC (AM)', days: [6], leads: 1, coLeads: 1, category: 'VC' },
    ],
    rules: { maxConcurrentPerDay: 2, maxConsecutiveDays: 6, forbidPairs: [] },
    ...overrides,
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. INPUT CONTRACT — validation refuses loudly
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — input validation', () => {
    const valid = () => ({
        startDate: '2026-02-02',
        weeks: 4,
        staff: [{ name: 'Ann' }, { name: 'Bob' }],
        tasks: [{ name: 'EFT' }],
    });

    it('accepts the minimal valid config', () => {
        const result = generateRosterV2(valid());
        expect(result.ok).toBe(true);
        expect(validateRosterV2Config(valid())).toEqual({ valid: true, reason: null });
    });

    it('returns { ok: false, reason } and nothing else on refusal', () => {
        const result = generateRosterV2(null);
        expect(result.ok).toBe(false);
        expect(typeof result.reason).toBe('string');
        // No empty roster to be mistaken for a successful run.
        expect(Object.keys(result).sort()).toEqual(['ok', 'reason']);
    });

    it.each([
        ['a missing config', undefined],
        ['a non-object config', 'roster please'],
        ['an array config', []],
    ])('refuses %s', (_label, config) => {
        expect(generateRosterV2(config).ok).toBe(false);
    });

    it.each([
        ['no start date', { startDate: undefined }],
        ['a non-date start date', { startDate: 'next Monday' }],
        ['a malformed start date', { startDate: '2026-2-2' }],
        ['an impossible calendar date', { startDate: '2026-02-30' }],
    ])('refuses %s', (_label, patch) => {
        const result = generateRosterV2({ ...valid(), ...patch });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/valid start date/i);
    });

    it.each([
        ['an empty-string weeks', ''],
        ['a NaN weeks', NaN],
        ['a fractional weeks', 2.5],
        ['zero weeks', 0],
        ['negative weeks', -4],
        ['weeks above the 52-week ceiling', 53],
    ])('refuses %s', (_label, weeks) => {
        const result = generateRosterV2({ ...valid(), weeks });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/week/i);
    });

    it('accepts exactly 52 weeks (the documented ceiling)', () => {
        expect(generateRosterV2({ ...valid(), weeks: 52 }).ok).toBe(true);
    });

    it.each([
        ['an empty staff pool', []],
        ['a missing staff pool', undefined],
        ['a staff entry that is a bare string', ['Ann']],
        ['a staff entry with no name', [{ fte: 1 }]],
        ['a staff entry with a blank name', [{ name: '   ' }]],
    ])('refuses %s', (_label, staff) => {
        expect(generateRosterV2({ ...valid(), staff }).ok).toBe(false);
    });

    it('refuses a duplicate staff name — load and capacity would be ambiguous', () => {
        const result = generateRosterV2({
            ...valid(),
            staff: [{ name: 'Ann' }, { name: 'Ann' }],
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/Ann appears twice/);
    });

    it.each([
        ['fte of 0', 0],
        ['fte above 1', 1.2],
        ['a negative fte', -0.5],
        ['a non-numeric fte', '0.6'],
    ])('refuses %s', (_label, fte) => {
        const result = generateRosterV2({ ...valid(), staff: [{ name: 'Ann', fte }] });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/FTE/i);
    });

    it('accepts the boundary fte of 1.0 and a small positive fte', () => {
        expect(generateRosterV2({ ...valid(), staff: [{ name: 'Ann', fte: 1 }, { name: 'Bob', fte: 0.2 }] }).ok).toBe(true);
    });

    it.each([
        ['non-array skills', { skills: 'CPET' }],
        ['a blank skill', { skills: [''] }],
        ['non-array unavailable', { unavailable: '2026-02-10' }],
        ['an unavailable date that is not a real date', { unavailable: ['2026-02-31'] }],
        ['a zero maxPerDay', { maxPerDay: 0 }],
        ['a fractional maxPerDay', { maxPerDay: 1.5 }],
    ])('refuses a staff member with %s', (_label, patch) => {
        const result = generateRosterV2({
            ...valid(),
            staff: [{ name: 'Ann', ...patch }],
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/Ann/);
    });

    it.each([
        ['an empty task list', []],
        ['a missing task list', undefined],
        ['a task that is a bare string', ['EFT']],
        ['a task with no name', [{ leads: 1 }]],
    ])('refuses %s', (_label, tasks) => {
        expect(generateRosterV2({ ...valid(), tasks }).ok).toBe(false);
    });

    it('refuses a duplicate task name', () => {
        const result = generateRosterV2({ ...valid(), tasks: [{ name: 'EFT' }, { name: 'EFT' }] });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/EFT is listed twice/);
    });

    it('refuses a task requiring a skill nobody holds — the 3am-on-a-Tuesday config error', () => {
        const result = generateRosterV2({
            ...valid(),
            staff: [{ name: 'Ann', skills: ['SPIRO'] }],
            tasks: [{ name: 'EFT', requiresSkill: 'CPET' }],
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/requires skill CPET, which nobody in the staff pool holds/);
    });

    it('accepts a task whose required skill somebody holds', () => {
        expect(
            generateRosterV2({
                ...valid(),
                staff: [{ name: 'Ann', skills: ['CPET'] }, { name: 'Bob', skills: ['CPET'] }],
                tasks: [{ name: 'EFT', requiresSkill: 'CPET' }],
            }).ok,
        ).toBe(true);
    });

    it('treats requiresSkill: null as "anyone may lead"', () => {
        expect(generateRosterV2({ ...valid(), tasks: [{ name: 'EFT', requiresSkill: null }] }).ok).toBe(true);
    });

    it.each([
        ['a weekday of 7', [7]],
        ['a negative weekday', [-1]],
        ['a fractional weekday', [1.5]],
        ['a string weekday', ['Mon']],
        ['non-array days', 12345],
    ])('refuses a task with %s', (_label, days) => {
        const result = generateRosterV2({ ...valid(), tasks: [{ name: 'EFT', days }] });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/EFT/);
    });

    it('accepts the boundary weekdays 0 (Sunday) and 6 (Saturday)', () => {
        expect(generateRosterV2({ ...valid(), tasks: [{ name: 'W', days: [0, 6] }] }).ok).toBe(true);
    });

    it.each([
        ['negative leads', { leads: -1 }],
        ['fractional leads', { leads: 1.5 }],
        ['negative coLeads', { coLeads: -2 }],
        ['fractional coLeads', { coLeads: 0.5 }],
        ['a non-string category', { category: 7 }],
    ])('refuses a task with %s', (_label, patch) => {
        expect(generateRosterV2({ ...valid(), tasks: [{ name: 'EFT', ...patch }] }).ok).toBe(false);
    });

    it('refuses leads: 0 — every shift object the exports read needs a lead', () => {
        const result = generateRosterV2({ ...valid(), tasks: [{ name: 'EFT', leads: 0, coLeads: 2 }] });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/every shift needs a lead/);
    });

    it('accepts coLeads: 0 — that is how a solo task is expressed', () => {
        expect(generateRosterV2({ ...valid(), tasks: [{ name: 'EFT', coLeads: 0 }] }).ok).toBe(true);
    });

    it.each([
        ['non-object rules', 'strict'],
        ['a zero maxConcurrentPerDay', { maxConcurrentPerDay: 0 }],
        ['a fractional maxConcurrentPerDay', { maxConcurrentPerDay: 2.5 }],
        ['a zero maxConsecutiveDays', { maxConsecutiveDays: 0 }],
        ['non-array forbidPairs', { forbidPairs: 'Ann,Bob' }],
        ['a forbidPairs entry of one name', { forbidPairs: [['Ann']] }],
        ['a forbidPairs entry of three names', { forbidPairs: [['Ann', 'Bob', 'Cid']] }],
    ])('refuses %s', (_label, rules) => {
        expect(generateRosterV2({ ...valid(), rules }).ok).toBe(false);
    });

    it('refuses forbidPairs naming somebody outside the staff pool', () => {
        const result = generateRosterV2({ ...valid(), rules: { forbidPairs: [['Ann', 'Nobody']] } });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/Nobody, who is not in the staff pool/);
    });

    it('refuses forbidPairs pairing somebody with themselves', () => {
        const result = generateRosterV2({ ...valid(), rules: { forbidPairs: [['Ann', 'Ann']] } });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/with themselves/);
    });

    it('accepts omitted rules and applies the documented defaults', () => {
        const result = generateRosterV2(valid());
        expect(result.ok).toBe(true);
        expect(ROSTER_V2_DEFAULTS.maxConcurrentPerDay).toBe(2);
        expect(ROSTER_V2_DEFAULTS.maxConsecutiveDays).toBe(6);
        expect(ROSTER_V2_DEFAULTS.days).toEqual([1, 2, 3, 4, 5]);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. OUTPUT CONTRACT + COMPATIBILITY WITH THE EXISTING EXPORTS
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — output contract', () => {
    it('returns exactly the documented top-level shape', () => {
        const result = generateRosterV2(departmentConfig());
        expect(Object.keys(result).sort()).toEqual(
            ['effectiveStart', 'load', 'ok', 'roster', 'score', 'unfilled', 'warnings'].sort(),
        );
        expect(result.ok).toBe(true);
        expect(typeof result.effectiveStart).toBe('string');
        expect(Array.isArray(result.unfilled)).toBe(true);
        expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('every shift carries task, lead, staff, category and week', () => {
        const { roster } = generateRosterV2(departmentConfig());
        const shifts = flatten(roster);
        expect(shifts.length).toBeGreaterThan(0);

        for (const { shift } of shifts) {
            expect(typeof shift.task).toBe('string');
            expect(typeof shift.lead).toBe('string');
            expect(shift.lead.length).toBeGreaterThan(0);
            expect(typeof shift.staff).toBe('string');
            expect(typeof shift.category).toBe('string');
            expect(Number.isInteger(shift.week)).toBe(true);
            expect(shift.week).toBeGreaterThanOrEqual(1);
        }
    });

    it('staff is exactly the `Lead: X, Co: Y` string the ICS export interpolates', () => {
        const { roster } = generateRosterV2(departmentConfig());

        for (const { shift } of flatten(roster)) {
            // Same function the old engine and the swap mutator use — the
            // display string has one definition (post-mortem A-RC1).
            expect(shift.staff).toBe(buildShiftStaffLabel(shift.lead, shift.coLead));

            if (shift.coLead) {
                expect(shift.staff).toBe(`Lead: ${shift.lead}, Co: ${shift.coLead}`);
            } else {
                expect(shift.staff).toBe(`Lead: ${shift.lead}`);
            }
        }
    });

    it('reproduces the ICS SUMMARY line without emitting "undefined"', () => {
        const { roster } = generateRosterV2(departmentConfig());

        // Exactly `downloadICS`'s interpolation, asserted on real V2 output.
        const summaries = flatten(roster).map(({ shift }) => `SUMMARY:[${shift.task}] ${shift.staff}`);
        expect(summaries.length).toBeGreaterThan(0);
        for (const line of summaries) {
            expect(line).not.toMatch(/undefined/);
            expect(line).toMatch(/^SUMMARY:\[[^\]]+\] Lead: .+$/);
        }
    });

    it('reproduces the CSV row without emitting "undefined" for a solo task', () => {
        const { roster } = generateRosterV2({
            ...departmentConfig(),
            tasks: [{ name: 'NC', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 0 }],
        });

        // `downloadCSV` interpolates `s.coLead` directly; a solo task must
        // therefore leave the field ABSENT, not `undefined` (audit M7).
        for (const { dateKey, shift } of flatten(roster)) {
            expect('coLead' in shift).toBe(false);
            const row = `${dateKey},${shift.week},${shift.task},${shift.category},${shift.lead},${shift.coLead ?? ''}`;
            expect(row).not.toMatch(/undefined/);
        }
    });

    it('a solo task (coLeads: 0) omits the co-lead cleanly', () => {
        const { roster } = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 1,
            staff: [{ name: 'Ann' }, { name: 'Bob' }],
            tasks: [{ name: 'NC', coLeads: 0 }],
        });

        const shift = roster['2026-02-02'][0];
        expect(shift.lead).toBe('Ann');
        expect('coLead' in shift).toBe(false);
        expect(shift.coLead).toBeUndefined();
        expect(shift.staff).toBe('Lead: Ann');
        expect(shift.assignees).toEqual(['Ann']);
    });

    it('honours the task category, defaulting to CORE', () => {
        const { roster } = generateRosterV2(departmentConfig());
        const byTask = new Map();
        for (const { shift } of flatten(roster)) byTask.set(shift.task, shift.category);

        expect(byTask.get('EFT')).toBe('CORE');
        expect(byTask.get('VC (AM)')).toBe('VC');
    });

    it('numbers weeks from 1 and never past the requested count', () => {
        const { roster } = generateRosterV2(departmentConfig({ weeks: 3 }));
        const weeks = new Set(flatten(roster).map(({ shift }) => shift.week));
        expect([...weeks].sort()).toEqual([1, 2, 3]);
    });

    it('reports load for every staff member, including anyone who drew nothing', () => {
        const { load } = generateRosterV2(departmentConfig());
        expect(Object.keys(load).sort()).toEqual(['Brandon', 'Derlinder', 'Fadzlynn', 'Ying Xian']);

        for (const entry of Object.values(load)) {
            expect(Number.isInteger(entry.duties)).toBe(true);
            expect(entry.duties).toBeGreaterThanOrEqual(0);
            expect(typeof entry.fte).toBe('number');
            expect(typeof entry.weighted).toBe('number');
            expect(typeof entry.share).toBe('number');
        }
    });

    it('load.duties agrees exactly with the roster it describes', () => {
        const { roster, load } = generateRosterV2(departmentConfig());

        const counted = {};
        for (const { shift } of flatten(roster)) {
            for (const name of peopleOn(shift)) counted[name] = (counted[name] || 0) + 1;
        }

        for (const [name, entry] of Object.entries(load)) {
            expect(entry.duties).toBe(counted[name] || 0);
        }
    });

    it('carries the full assignee list when a pairing group has more than two people', () => {
        const { roster } = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 1,
            staff: ['A', 'B', 'C', 'D', 'E', 'F'].map((name) => ({ name, maxPerDay: 3 })),
            tasks: [{ name: 'BIG', days: [MONDAY], leads: 2, coLeads: 3 }],
        });

        const shifts = roster['2026-02-02'];
        // One shift object per pairing group — never a three-name `staff` string.
        expect(shifts).toHaveLength(2);

        const everyone = shifts.flatMap((shift) => shift.assignees);
        expect(everyone).toHaveLength(5);
        expect(new Set(everyone).size).toBe(5);

        for (const shift of shifts) {
            expect(shift.staff).toBe(buildShiftStaffLabel(shift.lead, shift.coLead));
            expect(shift.assignees[0]).toBe(shift.lead);
            if (shift.assignees.length > 1) expect(shift.assignees[1]).toBe(shift.coLead);
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. DATES — Monday snapping and weekday correctness (post-mortem B1)
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — dates and weekdays', () => {
    it('snaps a Sunday start to Monday and reports it in effectiveStart', () => {
        // 2026-02-01 is the start date RosterView actually ships, and it is a
        // Sunday — the whole of post-mortem B1.
        expect(weekdayOfKey('2026-02-01')).toBe(SUNDAY);

        const result = generateRosterV2({
            startDate: '2026-02-01',
            weeks: 2,
            staff: [{ name: 'Ann' }, { name: 'Bob' }],
            tasks: [{ name: 'EFT' }],
        });

        expect(result.effectiveStart).toBe('2026-02-02');
        expect(weekdayOfKey(result.effectiveStart)).toBe(MONDAY);
        expect(Object.keys(result.roster).sort()[0]).toBe('2026-02-02');
    });

    it('warns when the snap moved the date, so it is never silent', () => {
        const result = generateRosterV2({
            startDate: '2026-02-01',
            weeks: 1,
            staff: [{ name: 'Ann' }, { name: 'Bob' }],
            tasks: [{ name: 'EFT' }],
        });

        expect(result.warnings.some((w) => w.includes('2026-02-01') && w.includes('2026-02-02'))).toBe(true);
        expect(result.warnings.some((w) => /Sunday/.test(w))).toBe(true);
    });

    it('leaves a Monday start untouched and warns about nothing', () => {
        const result = generateRosterV2(departmentConfig());
        expect(result.effectiveStart).toBe('2026-02-02');
        expect(result.warnings.filter((w) => w.includes('snapped'))).toEqual([]);
    });

    it('snaps a mid-week start back to that week’s Monday', () => {
        // Thursday 5 Feb 2026 belongs to the week that opened Monday 2 Feb.
        expect(weekdayOfKey('2026-02-05')).toBe(4);
        const result = generateRosterV2({
            startDate: '2026-02-05',
            weeks: 1,
            staff: [{ name: 'Ann' }, { name: 'Bob' }],
            tasks: [{ name: 'EFT' }],
        });
        expect(result.effectiveStart).toBe('2026-02-02');
    });

    it('snapToMonday maps every weekday to a Monday', () => {
        const keys = [
            '2026-02-01', // Sun
            '2026-02-02', // Mon
            '2026-02-03', '2026-02-04', '2026-02-05', '2026-02-06', '2026-02-07',
        ];
        for (const key of keys) {
            const snapped = toLocalDateKey(snapToMonday(parseLocalDateKey(key)));
            expect(weekdayOfKey(snapped)).toBe(MONDAY);
        }
        // Sunday goes FORWARD one day; Mon–Sat step back to their own Monday.
        expect(toLocalDateKey(snapToMonday(parseLocalDateKey('2026-02-01')))).toBe('2026-02-02');
        expect(toLocalDateKey(snapToMonday(parseLocalDateKey('2026-02-07')))).toBe('2026-02-02');
    });

    it('every generated key falls on a weekday the task actually runs', () => {
        const config = departmentConfig();
        const { roster } = generateRosterV2(config);
        const daysByTask = new Map(config.tasks.map((task) => [task.name, task.days]));

        const shifts = flatten(roster);
        expect(shifts.length).toBeGreaterThan(0);

        for (const { dateKey, shift } of shifts) {
            expect(daysByTask.get(shift.task)).toContain(weekdayOfKey(dateKey));
        }
    });

    it('places a Saturday-only task on Saturdays and nowhere else', () => {
        const { roster } = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 4,
            staff: [{ name: 'Ann' }, { name: 'Bob' }],
            tasks: [{ name: 'VC (AM)', days: [SATURDAY], category: 'VC' }],
        });

        const keys = Object.keys(roster).sort();
        expect(keys).toEqual(['2026-02-07', '2026-02-14', '2026-02-21', '2026-02-28']);
        for (const key of keys) expect(weekdayOfKey(key)).toBe(SATURDAY);
    });

    it('places a Sunday-only task on the Sunday that closes each week', () => {
        const { roster } = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 2,
            staff: [{ name: 'Ann' }, { name: 'Bob' }],
            tasks: [{ name: 'ONCALL', days: [SUNDAY] }],
        });

        expect(Object.keys(roster).sort()).toEqual(['2026-02-08', '2026-02-15']);
        for (const key of Object.keys(roster)) expect(weekdayOfKey(key)).toBe(SUNDAY);
    });

    it('generates the exact span requested and no day outside it', () => {
        const { roster } = generateRosterV2(departmentConfig({ weeks: 2 }));
        const keys = Object.keys(roster).sort();

        expect(keys[0]).toBe('2026-02-02');
        expect(keys[keys.length - 1]).toBe('2026-02-14'); // Sat of week 2
        // Mon–Fri core + Saturday VC = 6 keys per week.
        expect(keys).toHaveLength(12);
    });

    it('produces roster keys in chronological order', () => {
        const { roster } = generateRosterV2(departmentConfig());
        const keys = Object.keys(roster);
        expect(keys).toEqual([...keys].sort());
    });

    it('never uses toISOString — no UTC date key can leak in', () => {
        // A behavioural proxy for the source rule: an engine that formatted keys
        // with toISOString in a UTC-negative zone would emit the day before.
        const result = withTZ('America/Los_Angeles', () =>
            generateRosterV2({
                startDate: '2026-02-02',
                weeks: 1,
                staff: [{ name: 'Ann' }, { name: 'Bob' }],
                tasks: [{ name: 'EFT' }],
            }),
        );
        expect(result.effectiveStart).toBe('2026-02-02');
        expect(Object.keys(result.roster).sort()[0]).toBe('2026-02-02');
    });

    it('isDateKey accepts real dates and rejects rollovers', () => {
        expect(isDateKey('2026-02-02')).toBe(true);
        expect(isDateKey('2024-02-29')).toBe(true); // leap year
        expect(isDateKey('2026-02-29')).toBe(false); // not a leap year
        expect(isDateKey('2026-13-01')).toBe(false);
        expect(isDateKey('2026-2-2')).toBe(false);
        expect(isDateKey('')).toBe(false);
        expect(isDateKey(null)).toBe(false);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. TIMEZONE AND DST (post-mortem B2 / audit M2)
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — timezone and DST safety', () => {
    const dstConfig = () => ({
        // 2 March 2026 is a Monday; the US spring-forward is Sunday 8 March 2026,
        // inside week 2. This is the exact configuration in which the old
        // engine's keys slide a day early on a DST host (audit M2).
        startDate: '2026-03-02',
        weeks: 4,
        staff: namePool(4).map((name) => ({ name })),
        tasks: [
            { name: 'CORE', days: [1, 2, 3, 4, 5] },
            { name: 'VC (AM)', days: [SATURDAY], category: 'VC' },
        ],
    });

    it('the process TZ mutation used by this suite actually takes effect', () => {
        // If this fails, the cross-zone assertions below would be vacuous, so it
        // is asserted rather than assumed.
        const ny = withTZ('America/New_York', () => new Date(2026, 6, 1).getTimezoneOffset());
        const sg = withTZ('Asia/Singapore', () => new Date(2026, 6, 1).getTimezoneOffset());
        expect(ny).not.toBe(sg);
    });

    it('produces byte-identical output in Singapore, New York and Auckland', () => {
        const zones = ['Asia/Singapore', 'America/New_York', 'Pacific/Auckland'];
        const results = zones.map((tz) => withTZ(tz, () => generateRosterV2(dstConfig())));

        for (const result of results.slice(1)) {
            expect(result).toEqual(results[0]);
            // Key ORDER too, not merely key membership.
            expect(JSON.stringify(result)).toBe(JSON.stringify(results[0]));
        }
    });

    it('keeps every key on its intended weekday across the US spring-forward', () => {
        for (const tz of ['Asia/Singapore', 'America/New_York', 'America/Los_Angeles']) {
            const { roster, effectiveStart } = withTZ(tz, () => generateRosterV2(dstConfig()));

            expect(effectiveStart).toBe('2026-03-02');

            const keys = Object.keys(roster).sort();
            // Mon–Fri + Sat = 6 keys per week over 4 weeks.
            expect(keys).toHaveLength(24);
            expect(keys[0]).toBe('2026-03-02');
            expect(keys[keys.length - 1]).toBe('2026-03-28');

            for (const key of keys) {
                // No Sunday may ever appear: neither task runs on one.
                expect(weekdayOfKey(key)).not.toBe(SUNDAY);
            }

            // The signature of the slide: 8 March is the Sunday the old engine
            // would have written after the transition.
            expect(keys).not.toContain('2026-03-08');
            expect(keys.filter((key) => key >= '2026-03-09' && key <= '2026-03-15')).toEqual([
                '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13', '2026-03-14',
            ]);
        }
    });

    it('keeps every key on its intended weekday across the US fall-back', () => {
        // 1 November 2026 is the US fall-back; 26 Oct 2026 is a Monday.
        const config = { ...dstConfig(), startDate: '2026-10-26' };
        for (const tz of ['America/New_York', 'Asia/Singapore']) {
            const { roster } = withTZ(tz, () => generateRosterV2(config));
            const keys = Object.keys(roster).sort();
            expect(keys).toHaveLength(24);
            expect(keys[0]).toBe('2026-10-26');
            for (const key of keys) expect(weekdayOfKey(key)).not.toBe(SUNDAY);
        }
    });

    it('keeps a southern-hemisphere DST transition off the keys as well', () => {
        // Auckland springs forward on 27 September 2026.
        const config = { ...dstConfig(), startDate: '2026-09-21' };
        const { roster } = withTZ('Pacific/Auckland', () => generateRosterV2(config));
        const keys = Object.keys(roster).sort();
        expect(keys).toHaveLength(24);
        expect(keys[0]).toBe('2026-09-21');
        for (const key of keys) expect(weekdayOfKey(key)).not.toBe(SUNDAY);
    });

    it('crosses a year boundary and a month end without drifting', () => {
        const { roster } = generateRosterV2({
            startDate: '2026-12-28', // Monday
            weeks: 2,
            staff: [{ name: 'Ann' }, { name: 'Bob' }],
            tasks: [{ name: 'EFT' }],
        });
        expect(Object.keys(roster).sort()).toEqual([
            '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01',
            '2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08',
        ]);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. THE TWO MEASURED FAILURES OF THE OLD ENGINE
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — fixes the old engine’s measured failures', () => {
    it('6 staff / 10 tasks: nobody exceeds maxConcurrentPerDay (the old engine reached 5)', () => {
        const config = scalingConfig(6, 10);
        const { ok, roster, unfilled, warnings } = generateRosterV2(config);
        expect(ok).toBe(true);

        const limit = ROSTER_V2_DEFAULTS.maxConcurrentPerDay;
        const perDay = dutiesPerDay(roster);
        const worst = Math.max(...Object.values(perDay).flatMap((day) => Object.values(day)));
        expect(worst).toBeLessThanOrEqual(limit);

        // Measured baseline: the old engine wraps the task index and puts one
        // person on five duties in a single day.
        const oldRoster = generateRoster({
            staff: namePool(6),
            tasks: taskPool(10),
            startDate: config.startDate,
            weeks: config.weeks,
        });
        expect(measureRosterLoad(oldRoster, namePool(6)).maxDutiesPerPersonPerDay).toBe(5);

        // The demand it could not meet is REPORTED, not hidden. 10 tasks x 2
        // slots x 20 weekdays = 400 slots; 6 people x 2 duties x 20 = 240.
        expect(unfilled.length).toBe(160);
        expect(warnings.some((w) => /duty slots but the team can hold at most/.test(w))).toBe(true);
    });

    it('20 staff / 4 tasks: nobody is left unrostered (the old engine idled 12 of 20)', () => {
        const config = scalingConfig(20, 4);
        const { ok, roster, unfilled, load } = generateRosterV2(config);
        expect(ok).toBe(true);

        const measured = measureRosterLoad(roster, namePool(20));
        expect(measured.neverRostered).toEqual([]);
        expect(measured.rostered).toBe(20);
        expect(unfilled).toEqual([]);

        // Measured baseline: the rotation never reaches past the task list, so
        // S09..S20 are never rostered at all.
        const oldRoster = generateRoster({
            staff: namePool(20),
            tasks: taskPool(4),
            startDate: config.startDate,
            weeks: config.weeks,
        });
        expect(measureRosterLoad(oldRoster, namePool(20)).neverRostered).toHaveLength(12);

        // And the load is spread, not merely non-zero: 4 tasks x 2 slots x 20
        // weekdays = 160 duties over 20 people.
        const counts = Object.values(load).map((entry) => entry.duties);
        expect(counts.reduce((a, b) => a + b, 0)).toBe(160);
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    });

    it('never exceeds a per-person daily limit at any team size', () => {
        for (const [staffCount, taskCount] of [[4, 4], [12, 8], [9, 6], [6, 10], [20, 4], [3, 12], [30, 2]]) {
            const { roster } = generateRosterV2(scalingConfig(staffCount, taskCount));
            const perDay = dutiesPerDay(roster);

            for (const [dateKey, day] of Object.entries(perDay)) {
                for (const [name, count] of Object.entries(day)) {
                    expect(
                        count,
                        `${name} holds ${count} duties on ${dateKey} at ${staffCount} staff / ${taskCount} tasks`,
                    ).toBeLessThanOrEqual(ROSTER_V2_DEFAULTS.maxConcurrentPerDay);
                }
            }
        }
    });

    it('honours a per-person maxPerDay that differs from the team rule', () => {
        const { roster } = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 2,
            staff: [
                { name: 'Ann', maxPerDay: 1 },
                { name: 'Bob', maxPerDay: 3 },
                { name: 'Cid' },
            ],
            tasks: taskPool(3).map((name) => ({ name })),
            rules: { maxConcurrentPerDay: 2 },
        });

        const perDay = dutiesPerDay(roster);
        for (const day of Object.values(perDay)) {
            expect(day.Ann ?? 0).toBeLessThanOrEqual(1);
            expect(day.Bob ?? 0).toBeLessThanOrEqual(3);
            expect(day.Cid ?? 0).toBeLessThanOrEqual(2);
        }
    });

    it('never puts one person in both roles of the same task on the same day', () => {
        for (const [staffCount, taskCount] of [[2, 3], [4, 4], [6, 10]]) {
            const { roster } = generateRosterV2(scalingConfig(staffCount, taskCount));
            for (const { shift } of flatten(roster)) {
                const people = peopleOn(shift);
                expect(new Set(people).size).toBe(people.length);
            }
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. SKILLS
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — competency', () => {
    it('only ever staffs a skill-gated task with people who hold the skill', () => {
        const { roster } = generateRosterV2(departmentConfig());
        const holders = new Set(['Brandon', 'Fadzlynn']); // the CPET holders

        const eftShifts = flatten(roster).filter(({ shift }) => shift.task === 'EFT');
        expect(eftShifts.length).toBeGreaterThan(0);

        for (const { shift } of eftShifts) {
            expect(holders.has(shift.lead)).toBe(true);
            for (const name of peopleOn(shift)) expect(holders.has(name)).toBe(true);
        }
    });

    it('leaves the slot unfilled rather than assigning an unqualified lead', () => {
        const result = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 2,
            staff: [
                { name: 'Ann', skills: ['CPET'], unavailable: ['2026-02-10'] },
                { name: 'Bob', skills: [] },
            ],
            tasks: [{ name: 'EFT', requiresSkill: 'CPET', leads: 1, coLeads: 1 }],
        });

        // Ann is the only qualified person and she is on leave on the 10th.
        expect(result.roster['2026-02-10']).toBeUndefined();

        const onTheTenth = result.unfilled.filter((entry) => entry.date === '2026-02-10');
        expect(onTheTenth).toHaveLength(2); // the lead slot and the co-lead slot

        const leadSlot = onTheTenth.find((entry) => entry.role === 'lead');
        expect(leadSlot.task).toBe('EFT');
        expect(leadSlot.reason).toMatch(/no available staff hold skill CPET/);
        expect(leadSlot.reason).toMatch(/1 qualified/);
        expect(leadSlot.reason).toMatch(/1 on leave/);

        // Bob never appears anywhere in the roster: he cannot do this task.
        const everyone = flatten(result.roster).flatMap(({ shift }) => peopleOn(shift));
        expect(everyone).not.toContain('Bob');
    });

    it('reports the co-lead slot honestly when only one person is qualified', () => {
        const result = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 1,
            staff: [{ name: 'Ann', skills: ['CPET'] }, { name: 'Bob' }],
            tasks: [{ name: 'EFT', requiresSkill: 'CPET', leads: 1, coLeads: 1 }],
        });

        const shift = result.roster['2026-02-02'][0];
        expect(shift.lead).toBe('Ann');
        expect('coLead' in shift).toBe(false);
        expect(shift.staff).toBe('Lead: Ann');

        const coLeadSlots = result.unfilled.filter((entry) => entry.role === 'coLead');
        expect(coLeadSlots).toHaveLength(5); // Mon–Fri
        expect(coLeadSlots[0].reason).toMatch(/1 qualified/);
        expect(coLeadSlots[0].reason).toMatch(/1 already on this task/);

        expect(
            result.warnings.some((w) => /only 1 holds skill CPET/.test(w)),
        ).toBe(true);
    });

    it('applies no skill filter when the task requires none', () => {
        const { roster } = generateRosterV2(departmentConfig());
        const ipt = flatten(roster).filter(({ shift }) => shift.task === 'IPT+SKG');
        const names = new Set(ipt.flatMap(({ shift }) => peopleOn(shift)));
        // Ying Xian holds no skills at all, so her presence proves the filter
        // is not being applied where it should not be.
        expect(names.has('Ying Xian')).toBe(true);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. LEAVE / UNAVAILABILITY
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — leave and unavailability', () => {
    it('never assigns anybody on a date in their unavailable list', () => {
        const config = departmentConfig({
            staff: [
                { name: 'Brandon', skills: ['CPET'], unavailable: ['2026-02-02', '2026-02-03', '2026-02-04'] },
                { name: 'Derlinder', unavailable: ['2026-02-09', '2026-02-10'] },
                { name: 'Fadzlynn', fte: 0.6, skills: ['CPET'], unavailable: ['2026-02-10'] },
                { name: 'Ying Xian', unavailable: [] },
            ],
        });

        const { roster } = generateRosterV2(config);
        const unavailableBy = new Map(config.staff.map((person) => [person.name, new Set(person.unavailable)]));

        for (const { dateKey, shift } of flatten(roster)) {
            for (const name of peopleOn(shift)) {
                expect(
                    unavailableBy.get(name).has(dateKey),
                    `${name} was rostered on ${dateKey} while on leave`,
                ).toBe(false);
            }
        }
    });

    it('names leave as the binding constraint when it empties the pool', () => {
        const result = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 1,
            staff: [
                { name: 'Ann', unavailable: ['2026-02-03'] },
                { name: 'Bob', unavailable: ['2026-02-03'] },
            ],
            tasks: [{ name: 'EFT', leads: 1, coLeads: 1 }],
        });

        expect(result.roster['2026-02-03']).toBeUndefined();
        const slots = result.unfilled.filter((entry) => entry.date === '2026-02-03');
        expect(slots.length).toBeGreaterThan(0);
        expect(slots[0].reason).toMatch(/2 in pool/);
        expect(slots[0].reason).toMatch(/2 on leave/);
    });

    it('still rosters the rest of the week around a whole-team leave day', () => {
        const result = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 1,
            staff: [
                { name: 'Ann', unavailable: ['2026-02-03'] },
                { name: 'Bob', unavailable: ['2026-02-03'] },
            ],
            tasks: [{ name: 'EFT' }],
        });
        expect(Object.keys(result.roster).sort()).toEqual([
            '2026-02-02', '2026-02-04', '2026-02-05', '2026-02-06',
        ]);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. FTE-WEIGHTED FAIRNESS
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — FTE-weighted fairness', () => {
    it('gives a 0.6 FTE colleague meaningfully less work than a full-timer', () => {
        const { load } = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 12,
            staff: [{ name: 'Full', fte: 1.0 }, { name: 'Part', fte: 0.6 }],
            tasks: [{ name: 'CORE', leads: 1, coLeads: 0 }],
        });

        expect(load.Part.duties).toBeLessThan(load.Full.duties);

        // A band, not an exact figure: the target is 0.6, and integer duties
        // cannot land on it exactly. Anything in here is "roughly 60%".
        const ratio = load.Part.duties / load.Full.duties;
        expect(ratio).toBeGreaterThan(0.5);
        expect(ratio).toBeLessThan(0.75);

        // Every duty is still handed out — fairness must not cost coverage.
        expect(load.Full.duties + load.Part.duties).toBe(60);
    });

    it('equalises the weighted load rather than the raw count', () => {
        const { load } = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 12,
            staff: [
                { name: 'Full', fte: 1.0 },
                { name: 'Half', fte: 0.5 },
                { name: 'Most', fte: 0.8 },
            ],
            tasks: [{ name: 'A' }, { name: 'B' }],
        });

        const weighted = Object.values(load).map((entry) => entry.weighted);
        const spread = Math.max(...weighted) - Math.min(...weighted);
        // The weighted figures sit close together while the raw counts do not.
        expect(spread).toBeLessThan(4);
        expect(load.Full.duties).toBeGreaterThan(load.Half.duties);
        expect(load.Most.duties).toBeGreaterThan(load.Half.duties);
    });

    it('shares work evenly when everybody is full time', () => {
        const { load } = generateRosterV2(scalingConfig(9, 6));
        const counts = Object.values(load).map((entry) => entry.duties);
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    });

    it('reports weighted and share consistently with duties', () => {
        const { load } = generateRosterV2(departmentConfig());
        const total = Object.values(load).reduce((sum, entry) => sum + entry.duties, 0);

        for (const entry of Object.values(load)) {
            expect(entry.weighted).toBeCloseTo(Math.round((entry.duties / entry.fte) * 100) / 100, 5);
            expect(entry.share).toBeCloseTo(Math.round((entry.duties / total) * 100) / 100, 5);
        }
    });

    it('spreads a single task across the team instead of giving it an owner', () => {
        // The second tie-breaker: fewest previous assignments to THIS task.
        const { roster } = generateRosterV2(scalingConfig(4, 2));
        const leadsOfT01 = flatten(roster)
            .filter(({ shift }) => shift.task === 'T01')
            .map(({ shift }) => shift.lead);
        expect(new Set(leadsOfT01).size).toBeGreaterThan(1);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. FORBIDDEN PAIRINGS
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — forbidPairs', () => {
    /**
     * Three staff, two tasks. Measured: without the rule the fairness ordering
     * puts Ann and Bob on the same task 14 times over the run, so a config with
     * the rule applied is a real test of it and not a coincidence.
     */
    const pairConfig = (rules) => ({
        startDate: '2026-02-02',
        weeks: 4,
        staff: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }],
        tasks: [{ name: 'T1' }, { name: 'T2' }],
        ...(rules ? { rules } : {}),
    });

    const multiPairConfig = (rules) => ({
        startDate: '2026-02-02',
        weeks: 4,
        staff: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }, { name: 'Dee' }],
        tasks: [{ name: 'T1' }, { name: 'T2' }, { name: 'T3' }],
        ...(rules ? { rules } : {}),
    });

    const pairingsOf = (roster, a, b) =>
        flatten(roster).filter(({ shift }) => {
            const people = new Set(peopleOn(shift));
            return people.has(a) && people.has(b);
        }).length;

    it('never puts a forbidden pair on the same task on the same day', () => {
        const { roster } = generateRosterV2(pairConfig({ forbidPairs: [['Ann', 'Bob']] }));
        expect(pairingsOf(roster, 'Ann', 'Bob')).toBe(0);
    });

    it('the previous assertion is not vacuous — unconstrained, they pair 14 times', () => {
        const { roster } = generateRosterV2(pairConfig(null));
        expect(pairingsOf(roster, 'Ann', 'Bob')).toBe(14);
    });

    it('still fills every slot when the pair can be separated', () => {
        const result = generateRosterV2(pairConfig({ forbidPairs: [['Ann', 'Bob']] }));
        expect(result.unfilled).toEqual([]);
        for (const entry of Object.values(result.load)) {
            expect(entry.duties).toBeGreaterThan(0);
        }
    });

    it('concentrates load on the person who can pair with everybody, and scores it', () => {
        // An honest consequence of the rule, not a defect: Cid is the only
        // colleague either of them may work with, so he draws every pairing.
        // The soft score is what makes that visible to a roster master.
        const result = generateRosterV2(pairConfig({ forbidPairs: [['Ann', 'Bob']] }));
        expect(result.load.Cid.duties).toBeGreaterThan(result.load.Ann.duties);
        expect(result.score.breakdown.loadImbalance).toBeGreaterThan(20);
        expect(result.score.hardViolations).toBe(0);
    });

    it('honours several pairs at once', () => {
        const unconstrained = generateRosterV2(multiPairConfig(null));
        expect(pairingsOf(unconstrained.roster, 'Ann', 'Bob')).toBe(10);
        expect(pairingsOf(unconstrained.roster, 'Cid', 'Dee')).toBe(10);

        const { roster, unfilled } = generateRosterV2(
            multiPairConfig({ forbidPairs: [['Ann', 'Bob'], ['Cid', 'Dee']] }),
        );
        expect(pairingsOf(roster, 'Ann', 'Bob')).toBe(0);
        expect(pairingsOf(roster, 'Cid', 'Dee')).toBe(0);
        expect(unfilled).toEqual([]);
    });

    it('reports the pairing rule as the binding constraint when it empties the pool', () => {
        const result = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 1,
            staff: [{ name: 'Ann' }, { name: 'Bob' }],
            tasks: [{ name: 'EFT', leads: 1, coLeads: 1 }],
            rules: { forbidPairs: [['Ann', 'Bob']] },
        });

        const coLeadSlots = result.unfilled.filter((entry) => entry.role === 'coLead');
        expect(coLeadSlots).toHaveLength(5);
        expect(coLeadSlots[0].reason).toMatch(/blocked by a forbidden pairing/);

        // The lead was still assigned; only the pairing was refused.
        expect(result.roster['2026-02-02'][0].staff).toBe('Lead: Ann');
    });

    it('does not stop a forbidden pair working different tasks on the same day', () => {
        // Documented scope: the rule is "not the same task on the same day".
        const { roster } = generateRosterV2(pairConfig({ forbidPairs: [['Ann', 'Bob']] }));
        const bothOnSameDay = Object.values(roster).filter((shifts) => {
            const names = new Set(shifts.flatMap(peopleOn));
            return names.has('Ann') && names.has('Bob');
        });
        expect(bothOnSameDay.length).toBeGreaterThan(0);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. CONSECUTIVE-DAY LIMIT
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — maxConsecutiveDays', () => {
    it('stops a run at the configured limit and reports the gap', () => {
        const result = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 3,
            staff: [{ name: 'Solo' }],
            tasks: [{ name: 'DAILY', days: [0, 1, 2, 3, 4, 5, 6], leads: 1, coLeads: 0 }],
            rules: { maxConsecutiveDays: 3 },
        });

        expect(longestConsecutiveRun(result.roster, 'Solo')).toBe(3);

        // Three on, one off: 2–4 Feb worked, 5 Feb unfilled, 6–8 worked, …
        expect(Object.keys(result.roster).sort().slice(0, 6)).toEqual([
            '2026-02-02', '2026-02-03', '2026-02-04',
            '2026-02-06', '2026-02-07', '2026-02-08',
        ]);

        const gap = result.unfilled.find((entry) => entry.date === '2026-02-05');
        expect(gap.reason).toMatch(/at the consecutive-day limit/);
    });

    it('applies the documented default of 6 consecutive days', () => {
        const result = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 3,
            staff: [{ name: 'Ann' }, { name: 'Bob' }],
            tasks: [{ name: 'DAILY', days: [0, 1, 2, 3, 4, 5, 6], leads: 1, coLeads: 1 }],
        });

        expect(longestConsecutiveRun(result.roster, 'Ann')).toBe(6);
        expect(longestConsecutiveRun(result.roster, 'Bob')).toBe(6);
        expect(result.unfilled.some((entry) => /consecutive-day limit/.test(entry.reason))).toBe(true);
    });

    it('respects the limit for everyone in a realistic seven-day department', () => {
        const { roster } = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 6,
            staff: namePool(5).map((name) => ({ name })),
            tasks: [
                { name: 'WARD', days: [0, 1, 2, 3, 4, 5, 6] },
                { name: 'CLINIC', days: [1, 2, 3, 4, 5] },
            ],
            rules: { maxConsecutiveDays: 4 },
        });

        for (const name of namePool(5)) {
            expect(longestConsecutiveRun(roster, name), `${name}'s longest run`).toBeLessThanOrEqual(4);
        }
    });

    it('does not count a weekend gap as part of a run', () => {
        // Mon–Fri only, so a run can never exceed 5 and the limit never binds.
        const result = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 4,
            staff: [{ name: 'Ann' }, { name: 'Bob' }],
            tasks: [{ name: 'EFT' }],
            rules: { maxConsecutiveDays: 5 },
        });
        expect(result.unfilled).toEqual([]);
        expect(longestConsecutiveRun(result.roster, 'Ann')).toBeLessThanOrEqual(5);
    });

    it('lets a second duty on a day already worked through — that is maxPerDay’s question', () => {
        const result = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 2,
            staff: [{ name: 'Ann' }, { name: 'Bob' }],
            tasks: [{ name: 'A', days: [1, 2, 3, 4, 5] }, { name: 'B', days: [1, 2, 3, 4, 5] }],
            rules: { maxConsecutiveDays: 5, maxConcurrentPerDay: 2 },
        });
        // Both people work both tasks every weekday: 2 duties a day, 5-day runs.
        expect(result.unfilled).toEqual([]);
        const perDay = dutiesPerDay(result.roster);
        expect(Object.values(perDay).every((day) => day.Ann === 2 && day.Bob === 2)).toBe(true);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. DETERMINISM
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — determinism', () => {
    it('produces a deep-equal result when called twice with the same config', () => {
        const first = generateRosterV2(departmentConfig());
        const second = generateRosterV2(departmentConfig());
        expect(second).toEqual(first);
    });

    it('produces a byte-identical serialisation, key order included', () => {
        const first = generateRosterV2(departmentConfig());
        const second = generateRosterV2(departmentConfig());
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    });

    it('is deterministic on the strained configurations too', () => {
        for (const [staffCount, taskCount] of [[6, 10], [20, 4], [3, 12]]) {
            const a = generateRosterV2(scalingConfig(staffCount, taskCount));
            const b = generateRosterV2(scalingConfig(staffCount, taskCount));
            expect(JSON.stringify(b)).toBe(JSON.stringify(a));
        }
    });

    it('does not mutate the config it was given', () => {
        const config = departmentConfig();
        const snapshot = JSON.stringify(config);
        generateRosterV2(config);
        expect(JSON.stringify(config)).toBe(snapshot);
    });

    it('is deterministic over a full 52-week year', () => {
        const config = departmentConfig({ weeks: 52 });
        expect(JSON.stringify(generateRosterV2(config))).toBe(JSON.stringify(generateRosterV2(config)));
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 12. NEVER SILENTLY DROP A SLOT
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — every unfilled slot is accounted for', () => {
    it('emits one unfilled entry per slot it could not staff, and no more', () => {
        // 1 person, 1 task needing 2, Mon–Fri, 2 weeks: the lead is always
        // filled and the co-lead never is.
        const result = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 2,
            staff: [{ name: 'Ann' }],
            tasks: [{ name: 'EFT', leads: 1, coLeads: 1 }],
        });

        expect(result.unfilled).toHaveLength(10);
        for (const entry of result.unfilled) {
            expect(entry.role).toBe('coLead');
            expect(entry.task).toBe('EFT');
            expect(isDateKey(entry.date)).toBe(true);
            expect(typeof entry.reason).toBe('string');
            expect(entry.reason.length).toBeGreaterThan(10);
        }
    });

    it('accounts for filled + unfilled = every slot demanded', () => {
        const config = scalingConfig(6, 10);
        const { roster, unfilled } = generateRosterV2(config);

        const filled = flatten(roster).reduce((sum, { shift }) => sum + peopleOn(shift).length, 0);
        // 10 tasks x (1 lead + 1 co-lead) x 20 weekdays.
        expect(filled + unfilled.length).toBe(400);
    });

    it('every unfilled entry has the documented shape and a usable reason', () => {
        const { unfilled } = generateRosterV2(scalingConfig(6, 10));
        expect(unfilled.length).toBeGreaterThan(0);

        for (const entry of unfilled) {
            expect(Object.keys(entry).sort()).toEqual(['date', 'reason', 'role', 'task']);
            expect(['lead', 'coLead']).toContain(entry.role);
            expect(entry.reason).toMatch(/\(.+\)|so its co-lead slots/);
        }
    });

    it('says so plainly when the co-lead slots were skipped for want of a lead', () => {
        const result = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 1,
            staff: [{ name: 'Ann', skills: ['CPET'], unavailable: ['2026-02-03'] }, { name: 'Bob' }],
            tasks: [{ name: 'EFT', requiresSkill: 'CPET', leads: 1, coLeads: 1 }],
        });

        const skipped = result.unfilled.find(
            (entry) => entry.date === '2026-02-03' && entry.role === 'coLead',
        );
        expect(skipped.reason).toMatch(/no lead could be assigned/);
        expect(skipped.reason).toMatch(/rather than staffed without a lead/);
    });

    it('never invents a day key for a day it staffed nothing on', () => {
        const result = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 1,
            staff: [{ name: 'Ann', unavailable: ['2026-02-04'] }],
            tasks: [{ name: 'EFT', coLeads: 0 }],
        });
        expect('2026-02-04' in result.roster).toBe(false);
        expect(result.unfilled.map((entry) => entry.date)).toEqual(['2026-02-04']);
    });

    it('reports an empty roster honestly rather than pretending to succeed', () => {
        const result = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 1,
            staff: [{ name: 'Ann', unavailable: ['2026-02-08'] }],
            // A Sunday-only task, and the only person is away that Sunday.
            tasks: [{ name: 'ONCALL', days: [SUNDAY], coLeads: 0 }],
        });

        expect(result.ok).toBe(true);
        expect(result.roster).toEqual({});
        expect(result.unfilled).toHaveLength(1);
        expect(result.unfilled[0].reason).toMatch(/1 on leave/);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 13. WARNINGS FOR STRUCTURALLY STRAINED CONFIGURATIONS
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — warnings', () => {
    it('warns when total demand exceeds total capacity', () => {
        const { warnings } = generateRosterV2(scalingConfig(6, 10));
        expect(warnings.some((w) => /asks for 400 duty slots but the team can hold at most 240/.test(w))).toBe(true);
    });

    it('does not warn about capacity when the configuration fits', () => {
        const { warnings, unfilled } = generateRosterV2(scalingConfig(12, 8));
        expect(unfilled).toEqual([]);
        expect(warnings.filter((w) => /duty slots/.test(w))).toEqual([]);
    });

    it('warns when a required skill is held by fewer people than the task needs', () => {
        const { warnings } = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 1,
            staff: [{ name: 'Ann', skills: ['CPET'] }, { name: 'Bob' }, { name: 'Cid' }],
            tasks: [{ name: 'EFT', requiresSkill: 'CPET', leads: 1, coLeads: 1 }],
        });
        expect(warnings.some((w) => /Task EFT needs 2 people per day but only 1 holds skill CPET/.test(w))).toBe(true);
    });

    it('warns about a task with no days rather than silently skipping it', () => {
        const { warnings, roster } = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 1,
            staff: [{ name: 'Ann' }, { name: 'Bob' }],
            tasks: [{ name: 'EFT' }, { name: 'GHOST', days: [] }],
        });
        expect(warnings.some((w) => /Task GHOST has no days selected/.test(w))).toBe(true);
        expect(flatten(roster).some(({ shift }) => shift.task === 'GHOST')).toBe(false);
    });

    it('warns about nothing when a healthy configuration is generated', () => {
        const { warnings, unfilled } = generateRosterV2(scalingConfig(20, 4));
        expect(warnings).toEqual([]);
        expect(unfilled).toEqual([]);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14. MOST-CONSTRAINED-FIRST SLOT ORDERING
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRosterV2 — most constrained slot first', () => {
    /**
     * The stranding scenario, built to fail under naive iteration order.
     *
     * Ann is the ONLY person who holds skill S, and everybody has a daily limit
     * of one duty. `ANY` can be led by anybody; `SCARCE` can only be led by Ann.
     *
     * A naive `task → role` pass fills `ANY` first (it is listed first) and picks
     * Ann for it — she ties on load with Bob and Cid and wins alphabetically —
     * and then finds `SCARCE` unfillable, reporting an `unfilled` entry it
     * created itself. Minimum-remaining-values ordering fills `SCARCE` first,
     * because it has one eligible candidate against `ANY`'s three.
     */
    const ANY = { name: 'ANY', leads: 1, coLeads: 0 };
    const SCARCE = { name: 'SCARCE', requiresSkill: 'S', leads: 1, coLeads: 0 };

    const strandingConfig = (tasks) => ({
        startDate: '2026-02-02',
        weeks: 2,
        staff: [{ name: 'Ann', skills: ['S'] }, { name: 'Bob' }, { name: 'Cid' }],
        tasks,
        rules: { maxConcurrentPerDay: 1 },
    });

    const leadsOf = (roster, taskName) =>
        flatten(roster)
            .filter(({ shift }) => shift.task === taskName)
            .map(({ shift }) => shift.lead);

    it('fills the scarce-skill slot even when its task is configured last', () => {
        const result = generateRosterV2(strandingConfig([ANY, SCARCE]));

        // Nothing is stranded: both slots are filled on every weekday.
        expect(result.unfilled).toEqual([]);
        expect(leadsOf(result.roster, 'SCARCE')).toHaveLength(10);
        expect(leadsOf(result.roster, 'ANY')).toHaveLength(10);

        // Ann is spent on the duty only she can do, never on the one anybody
        // could have covered.
        expect(new Set(leadsOf(result.roster, 'SCARCE'))).toEqual(new Set(['Ann']));
        expect(leadsOf(result.roster, 'ANY')).not.toContain('Ann');
    });

    it('produces the same assignments whichever order the tasks are configured in', () => {
        // Order-independence is the observable signature of scarcity ordering: a
        // naive pass gives a different (and worse) answer when the scarce task
        // is listed second.
        const anyFirst = generateRosterV2(strandingConfig([ANY, SCARCE]));
        const scarceFirst = generateRosterV2(strandingConfig([SCARCE, ANY]));

        expect(anyFirst.unfilled).toEqual([]);
        expect(scarceFirst.unfilled).toEqual([]);

        for (const taskName of ['ANY', 'SCARCE']) {
            expect(leadsOf(anyFirst.roster, taskName)).toEqual(leadsOf(scarceFirst.roster, taskName));
        }
    });

    it('does not strand a scarce slot behind a whole day of open slots', () => {
        // Five tasks anybody can do, one that only Ann can, everybody capped at
        // one duty a day, and exactly enough people. Under naive ordering the
        // five open tasks consume the pool in alphabetical order — which starts
        // with Ann — and the scarce task is left unfilled every single day.
        const result = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 2,
            staff: [
                { name: 'Ann', skills: ['S'] },
                { name: 'Bob' }, { name: 'Cid' }, { name: 'Dee' }, { name: 'Eve' }, { name: 'Fay' },
            ],
            tasks: [
                { name: 'OPEN1', coLeads: 0 }, { name: 'OPEN2', coLeads: 0 },
                { name: 'OPEN3', coLeads: 0 }, { name: 'OPEN4', coLeads: 0 },
                { name: 'OPEN5', coLeads: 0 },
                { name: 'SCARCE', requiresSkill: 'S', coLeads: 0 },
            ],
            rules: { maxConcurrentPerDay: 1 },
        });

        expect(result.unfilled).toEqual([]);
        expect(new Set(leadsOf(result.roster, 'SCARCE'))).toEqual(new Set(['Ann']));
    });

    it('still reports a genuine shortage as unfilled', () => {
        // Scarcity ordering must not paper over a real capacity limit: two slots
        // need the skill, only one person holds it.
        const result = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 1,
            staff: [{ name: 'Ann', skills: ['S'] }, { name: 'Bob' }],
            tasks: [{ name: 'SCARCE', requiresSkill: 'S', leads: 1, coLeads: 1 }],
        });
        expect(result.unfilled).toHaveLength(5);
        expect(result.unfilled.every((entry) => entry.role === 'coLead')).toBe(true);
    });

    it('remains deterministic under scarcity ordering', () => {
        const config = strandingConfig([ANY, SCARCE]);
        expect(JSON.stringify(generateRosterV2(config))).toBe(JSON.stringify(generateRosterV2(config)));
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 15. HARD VS SOFT CONSTRAINTS — auditing and scoring
// ═════════════════════════════════════════════════════════════════════════════

describe('auditHardConstraints — the roster is read back, not trusted', () => {
    const auditConfig = () => ({
        startDate: '2026-02-02',
        weeks: 1,
        staff: [
            { name: 'Ann', skills: ['S'], unavailable: ['2026-02-05'] },
            { name: 'Bob' },
            { name: 'Cid' },
        ],
        tasks: [{ name: 'SCARCE', requiresSkill: 'S' }, { name: 'OPEN' }],
        rules: { maxConcurrentPerDay: 2, maxConsecutiveDays: 3, forbidPairs: [['Bob', 'Cid']] },
    });

    const shift = (task, lead, coLead) => ({
        task,
        lead,
        ...(coLead ? { coLead } : {}),
        staff: buildShiftStaffLabel(lead, coLead),
        category: 'CORE',
        week: 1,
        assignees: [lead, coLead].filter(Boolean),
    });

    it('finds nothing wrong with a roster this engine generated', () => {
        const config = auditConfig();
        const { roster } = generateRosterV2(config);
        const audit = auditHardConstraints(roster, config);
        expect(audit.ok).toBe(true);
        expect(audit.violations).toEqual([]);
        expect(audit.count).toBe(0);
    });

    it('catches an unqualified person on a skill-gated task', () => {
        const audit = auditHardConstraints(
            { '2026-02-02': [shift('SCARCE', 'Bob', 'Cid')] },
            auditConfig(),
        );
        expect(audit.count).toBeGreaterThan(0);
        expect(audit.violations.some((v) => v.rule === 'skill')).toBe(true);
    });

    it('catches somebody rostered while unavailable', () => {
        const audit = auditHardConstraints(
            { '2026-02-05': [shift('SCARCE', 'Ann')] },
            auditConfig(),
        );
        expect(audit.violations.some((v) => v.rule === 'availability')).toBe(true);
    });

    it('catches a person over their daily limit', () => {
        const audit = auditHardConstraints(
            {
                '2026-02-02': [
                    shift('OPEN', 'Bob'),
                    shift('SCARCE', 'Ann', 'Bob'),
                    { ...shift('OPEN', 'Bob'), task: 'OPEN' },
                ],
            },
            auditConfig(),
        );
        expect(audit.violations.some((v) => v.rule === 'dailyCapacity')).toBe(true);
    });

    it('catches a forbidden pairing', () => {
        const audit = auditHardConstraints(
            { '2026-02-02': [shift('OPEN', 'Bob', 'Cid')] },
            auditConfig(),
        );
        expect(audit.violations.some((v) => v.rule === 'forbidPair')).toBe(true);
    });

    it('catches one person holding both duties of a shift', () => {
        const audit = auditHardConstraints(
            { '2026-02-02': [shift('OPEN', 'Bob', 'Bob')] },
            auditConfig(),
        );
        expect(audit.violations.some((v) => v.rule === 'onePerSlot')).toBe(true);
    });

    it('catches one person leading two pairing groups of the same task', () => {
        // Only the per-task scan sees this one: each shift object is internally
        // fine, but Bob is on OPEN twice on the same day.
        const audit = auditHardConstraints(
            { '2026-02-02': [shift('OPEN', 'Bob', 'Ann'), shift('OPEN', 'Bob', 'Cid')] },
            auditConfig(),
        );
        expect(audit.violations.some((v) => v.rule === 'onePerSlot')).toBe(true);
    });

    it('catches a run past the consecutive-day limit', () => {
        const roster = {};
        for (const day of ['02', '03', '04', '05', '06']) {
            roster[`2026-02-${day}`] = [shift('OPEN', 'Bob')];
        }
        const audit = auditHardConstraints(roster, auditConfig());
        // 5 consecutive days against a limit of 3.
        expect(audit.violations.some((v) => v.rule === 'maxConsecutiveDays')).toBe(true);
    });

    it('catches a name that is not in the staff pool at all', () => {
        const audit = auditHardConstraints(
            { '2026-02-02': [shift('OPEN', 'Ghost')] },
            auditConfig(),
        );
        expect(audit.count).toBeGreaterThan(0);
    });

    it('refuses to audit against an invalid config', () => {
        const audit = auditHardConstraints({}, { weeks: 0 });
        expect(audit.ok).toBe(false);
        expect(typeof audit.reason).toBe('string');
    });
});

describe('scoreRoster — hard violations are measured, soft ones are counted', () => {
    const balanced = () => ({
        startDate: '2026-02-02',
        weeks: 4,
        staff: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }, { name: 'Dee' }],
        tasks: [{ name: 'T1' }, { name: 'T2' }],
    });

    it('reports zero hard violations on every roster it generates', () => {
        const configs = [
            departmentConfig(),
            scalingConfig(6, 10),
            scalingConfig(20, 4),
            scalingConfig(3, 12),
            balanced(),
        ];
        for (const config of configs) {
            const result = generateRosterV2(config);
            expect(result.score.hardViolations).toBe(0);
        }
    });

    it('INDEPENDENT CHECK: the suite audits each roster itself rather than trusting the number', () => {
        // `score.hardViolations` is produced by the engine, so a test that only
        // reads it proves nothing about the roster (post-mortem A-RC4). This
        // audits every roster from the outside and asserts BOTH that the roster
        // is clean and that the engine reported it honestly.
        const configs = [
            departmentConfig(),
            departmentConfig({ weeks: 12 }),
            scalingConfig(4, 4),
            scalingConfig(6, 10),
            scalingConfig(20, 4),
            scalingConfig(3, 12),
            {
                startDate: '2026-03-02', // spans the US spring-forward
                weeks: 4,
                staff: [
                    { name: 'Ann', fte: 0.6, skills: ['S'], unavailable: ['2026-03-10'] },
                    { name: 'Bob', skills: ['S'] },
                    { name: 'Cid', maxPerDay: 1 },
                    { name: 'Dee' },
                ],
                tasks: [
                    { name: 'SCARCE', requiresSkill: 'S' },
                    { name: 'OPEN', days: [1, 2, 3, 4, 5, 6] },
                    { name: 'SOLO', days: [3], coLeads: 0 },
                ],
                rules: { maxConcurrentPerDay: 2, maxConsecutiveDays: 4, forbidPairs: [['Cid', 'Dee']] },
            },
        ];

        for (const config of configs) {
            const result = generateRosterV2(config);
            const audit = auditHardConstraints(result.roster, config);

            expect(audit.ok).toBe(true);
            expect(audit.violations).toEqual([]);
            expect(result.score.hardViolations).toBe(audit.count);
        }
    });

    it('scores a perfectly balanced configuration at zero', () => {
        const { score } = generateRosterV2(balanced());
        expect(score).toEqual({
            hardViolations: 0,
            softPenalty: 0,
            breakdown: { loadImbalance: 0, taskRepetition: 0, weekendImbalance: 0, isolatedDays: 0 },
        });
    });

    it('scores an unbalanced configuration worse than a balanced one', () => {
        const good = generateRosterV2(balanced()).score;

        // One person on three weeks of leave: the others must carry her share.
        const heavyLeave = generateRosterV2({
            ...balanced(),
            staff: [
                {
                    name: 'Ann',
                    unavailable: Array.from({ length: 15 }, (_, i) => `2026-02-${String(i + 2).padStart(2, '0')}`),
                },
                { name: 'Bob' }, { name: 'Cid' }, { name: 'Dee' },
            ],
        }).score;

        expect(heavyLeave.softPenalty).toBeGreaterThan(good.softPenalty);
        expect(heavyLeave.breakdown.loadImbalance).toBeGreaterThan(good.breakdown.loadImbalance);
        expect(heavyLeave.hardViolations).toBe(0);
    });

    it('charges task repetition when one person owns a skill-gated duty', () => {
        const spread = generateRosterV2(balanced()).score;
        const locked = generateRosterV2({
            ...balanced(),
            staff: [{ name: 'Ann', skills: ['S'] }, { name: 'Bob' }, { name: 'Cid' }, { name: 'Dee' }],
            tasks: [{ name: 'T1', requiresSkill: 'S' }, { name: 'T2' }],
        }).score;

        expect(locked.breakdown.taskRepetition).toBeGreaterThan(spread.breakdown.taskRepetition);
        expect(locked.softPenalty).toBeGreaterThan(spread.softPenalty);
    });

    it('charges isolated single working days', () => {
        // A Wednesday-only duty for a pool of four: everybody who draws it works
        // one day surrounded by days off.
        const { score } = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 4,
            staff: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }, { name: 'Dee' }],
            tasks: [{ name: 'WED', days: [3] }],
        });
        expect(score.breakdown.isolatedDays).toBeGreaterThan(0);
    });

    it('charges weekend imbalance separately from overall load', () => {
        const { score } = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 4,
            staff: [
                { name: 'Ann', unavailable: ['2026-02-07', '2026-02-14', '2026-02-21', '2026-02-28'] },
                { name: 'Bob' }, { name: 'Cid' },
            ],
            tasks: [
                { name: 'CORE', days: [1, 2, 3, 4, 5] },
                { name: 'VC (AM)', days: [SATURDAY], category: 'VC' },
            ],
        });
        // Ann is never available on a Saturday, so the weekend load cannot be
        // even however well the weekdays are shared.
        expect(score.breakdown.weekendImbalance).toBeGreaterThan(0);
    });

    it('is callable standalone on any candidate roster, with the same answer', () => {
        const config = departmentConfig();
        const result = generateRosterV2(config);
        const standalone = scoreRoster(result.roster, config);

        expect(standalone.ok).toBe(true);
        expect(standalone.hardViolations).toBe(result.score.hardViolations);
        expect(standalone.softPenalty).toBe(result.score.softPenalty);
        expect(standalone.breakdown).toEqual(result.score.breakdown);
    });

    it('scores a roster it did not build — the seam a later optimiser needs', () => {
        const config = departmentConfig();
        const { roster } = generateRosterV2(config);

        // Drop a day: a different candidate roster, still scoreable.
        const candidate = { ...roster };
        delete candidate['2026-02-02'];

        const scored = scoreRoster(candidate, config);
        expect(scored.ok).toBe(true);
        expect(typeof scored.softPenalty).toBe('number');
        expect(scored.hardViolations).toBe(0);
    });

    it('reports hard violations in a corrupted roster rather than hiding them', () => {
        const config = {
            startDate: '2026-02-02',
            weeks: 1,
            staff: [{ name: 'Ann', skills: ['S'] }, { name: 'Bob' }],
            tasks: [{ name: 'SCARCE', requiresSkill: 'S', coLeads: 0 }],
        };
        const { roster } = generateRosterV2(config);

        const corrupted = JSON.parse(JSON.stringify(roster));
        const firstKey = Object.keys(corrupted).sort()[0];
        corrupted[firstKey][0].lead = 'Bob';
        corrupted[firstKey][0].assignees = ['Bob'];

        expect(scoreRoster(corrupted, config).hardViolations).toBeGreaterThan(0);
        // And the engine's own roster is clean, so the check discriminates.
        expect(scoreRoster(roster, config).hardViolations).toBe(0);
    });

    it('exposes its soft weights so they can be changed in one visible place', () => {
        // Deliberately updated when `continuityBreaks` was merged in (the psych
        // pack briefly kept it in a separate ALL_ table because this very pin
        // was a gate its change could not edit; the orchestrator moved the pin).
        expect(Object.keys(SOFT_PENALTY_WEIGHTS).sort()).toEqual([
            'continuityBreaks', 'isolatedDays', 'loadImbalance', 'taskRepetition', 'weekendImbalance',
        ]);
        for (const weight of Object.values(SOFT_PENALTY_WEIGHTS)) {
            expect(typeof weight).toBe('number');
        }
    });

    it('softPenalty is the weighted sum of its own breakdown', () => {
        const { score } = generateRosterV2(departmentConfig({ weeks: 6 }));
        const expected = Object.entries(score.breakdown).reduce(
            (sum, [key, value]) => sum + SOFT_PENALTY_WEIGHTS[key] * value,
            0,
        );
        expect(score.softPenalty).toBeCloseTo(Math.round(expected * 100) / 100, 5);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 16. THE SCALING TABLE — old engine vs new, in executable form
// ═════════════════════════════════════════════════════════════════════════════

describe('SCALING TABLE — generateRoster (V1) vs generateRosterV2', () => {
    const CASES = [
        // staff, tasks, V1 max/day, V1 idle, V2 max/day, V2 idle
        [4, 4, 3, 0, 2, 0],
        [12, 8, 3, 0, 2, 0],
        [9, 6, 3, 0, 2, 0],
        [6, 10, 5, 0, 2, 0],
        [20, 4, 3, 12, 1, 0],
    ];

    it.each(CASES)(
        '%i staff / %i tasks — V1 peaks at %i duties/day with %i idle; V2 at %i with %i',
        (staffCount, taskCount, v1Max, v1Idle, v2Max, v2Idle) => {
            const staff = namePool(staffCount);

            const v1 = measureRosterLoad(
                generateRoster({ staff, tasks: taskPool(taskCount), startDate: '2026-02-02', weeks: 4 }),
                staff,
            );
            const v2 = measureRosterLoad(
                generateRosterV2(scalingConfig(staffCount, taskCount)).roster,
                staff,
            );

            expect(v1.maxDutiesPerPersonPerDay).toBe(v1Max);
            expect(v1.neverRostered).toHaveLength(v1Idle);
            expect(v2.maxDutiesPerPersonPerDay).toBe(v2Max);
            expect(v2.neverRostered).toHaveLength(v2Idle);

            // The two headline properties, stated as inequalities so they keep
            // their meaning if the exact figures are ever re-measured.
            expect(v2.maxDutiesPerPersonPerDay).toBeLessThanOrEqual(ROSTER_V2_DEFAULTS.maxConcurrentPerDay);
            expect(v2.neverRostered).toEqual([]);
        },
    );

    it('V1’s worst case is a person on five duties at once; V2’s is two', () => {
        const staff = namePool(6);
        const v1 = measureRosterLoad(
            generateRoster({ staff, tasks: taskPool(10), startDate: '2026-02-02', weeks: 4 }),
            staff,
        );
        expect(v1.maxDutiesPerPersonPerDay).toBe(5);
        // MOVED 2026-08-15: the busiest day is wherever V1's extra video consultation
        // lands, and the service moved that consult from Tuesday to Thursday. Nothing
        // about the LOAD changed — five duties at once is still V1's worst case; only
        // the date carrying it did. This pin doing its job is the evidence.
        expect(v1.busiestDay).toBe('S02 on 2026-02-05');

        const v2 = measureRosterLoad(generateRosterV2(scalingConfig(6, 10)).roster, staff);
        expect(v2.maxDutiesPerPersonPerDay).toBe(2);
    });

    it('V1 leaves 12 of 20 people entirely unrostered over 4 weeks; V2 leaves none', () => {
        const staff = namePool(20);
        const v1 = measureRosterLoad(
            generateRoster({ staff, tasks: taskPool(4), startDate: '2026-02-02', weeks: 4 }),
            staff,
        );
        expect(v1.neverRostered).toEqual([
            'S09', 'S10', 'S11', 'S12', 'S13', 'S14', 'S15', 'S16', 'S17', 'S18', 'S19', 'S20',
        ]);

        const v2 = measureRosterLoad(generateRosterV2(scalingConfig(20, 4)).roster, staff);
        expect(v2.neverRostered).toEqual([]);
        expect(v2.rostered).toBe(20);
    });

    it('measureRosterLoad reads both engines’ shift shapes', () => {
        // V1 shifts have no `assignees`; the measurement must still see both
        // people, or the comparison above would be measuring different things.
        const v1 = generateRoster({ staff: ['Ann', 'Bob'], tasks: ['EFT'], startDate: '2026-02-02', weeks: 1 });
        expect(measureRosterLoad(v1, ['Ann', 'Bob']).rostered).toBe(2);

        const v2 = generateRosterV2({
            startDate: '2026-02-02',
            weeks: 1,
            staff: [{ name: 'Ann' }, { name: 'Bob' }],
            tasks: [{ name: 'EFT' }],
        });
        expect(measureRosterLoad(v2.roster, ['Ann', 'Bob']).rostered).toBe(2);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 17. THE EXISTING ENGINE IS UNTOUCHED
// ═════════════════════════════════════════════════════════════════════════════

describe('generateRoster (V1) is unaffected by V2', () => {
    it('still produces its documented output after V2 has run', () => {
        const config = {
            staff: ['Brandon', 'Ying Xian', 'Derlinder', 'Fadzlynn'],
            tasks: [
            'Physical Activity Counseling',
            'Exercise Test',
            'New Case',
            'Walk-in',
            'Individual Session',
            'Inpatient Exercise',
            'Paediatrics Group Session',
            'Adolescent Group Session',
            'Video Consultation Group',
        ],
            startDate: '2026-02-01',
            weeks: 4,
        };
        const before = JSON.stringify(generateRoster(config));

        generateRosterV2(departmentConfig());

        expect(JSON.stringify(generateRoster(config))).toBe(before);
        // Updated for P4 (post-mortem B1): the old engine now snaps a Sunday
        // start to the Monday of that week, same as V2. Before P4 this pinned
        // '2026-02-01' — the un-snapped Sunday — as a deliberate bug marker.
        expect(Object.keys(generateRoster(config)).sort()[0]).toBe('2026-02-02');
    });
});
