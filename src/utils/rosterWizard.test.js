/**
 * ==============================================================================
 * ROSTER WIZARD — TABLES → ENGINE CONFIG (pure unit tests)
 * ==============================================================================
 * Runner: Vitest
 * Run:    npx vitest run src/utils/rosterWizard.test.js
 *
 * `buildDemoRosterV2ConfigFromTables` is the only thing standing between what a
 * roster master types into the sandbox wizard and what `generateRosterV2` is
 * asked to build. Six of its behaviours are load-bearing, and each of them is a
 * way a roster could quietly become wrong rather than loudly refuse:
 *
 *   1. Grades ATTACH to the right person.
 *   2. Band keys reach the engine LOWER CASE — it refuses `'Senior'` outright.
 *   3. Away dates PARSE into `unavailable`, and garbage is refused per row
 *      rather than dropped. A dropped leave date is somebody rostered on the day
 *      they are away.
 *   4. A blank grade is OMITTED, never defaulted. `grade: 'AH7'` invented here
 *      would put an unbanded person in charge of a band-gated duty.
 *   5. An out-of-range FTE is refused, not clamped.
 *   6. Band boundaries that do not partition AH7–AH17 block everything, with
 *      `validateGradeBands`' own reason.
 *
 * No DOM, no mocks, no Firestore: the module under test is pure and imports only
 * the engine's read-only exports.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
    BAND_NAMES,
    WEEKDAY_STRIP,
    bandsToInputs,
    inputsToBands,
    describeBandRange,
    parseFteCell,
    parseAwayCell,
    createStaffRow,
    createTaskRow,
    createEmptyStaffRows,
    createEmptyTaskRows,
    buildDemoRosterV2ConfigFromTables,
} from './rosterWizard.js';
import {
    DEFAULT_GRADE_BANDS,
    GRADE_SCALE,
    ROSTER_V2_DEFAULTS,
    generateRosterV2,
    validateRosterV2Config,
} from './rosterEngineV2.js';

// --- HELPERS ------------------------------------------------------------------

const DEFAULT_INPUTS = bandsToInputs(DEFAULT_GRADE_BANDS);

/** The wizard's arguments, with only what a test cares about overridden. */
const build = (overrides = {}) =>
    buildDemoRosterV2ConfigFromTables({
        startDate: '2026-09-07',
        weeks: 1,
        bandInputs: DEFAULT_INPUTS,
        staffRows: [],
        taskRows: [],
        ...overrides,
    });

const staff = (seed) => createStaffRow(seed);
const task = (seed) => createTaskRow(seed);

// ─── 1. THE SHAPE OF THE THINGS THE UI BINDS TO ───────────────────────────────

describe('the row and band models', () => {
    it('names the bands exactly as the engine spells them', () => {
        // The engine refuses `leadBands: ['Senior']`. The chips are built from
        // this list, so this is the assertion that keeps them speaking its
        // language rather than English.
        expect(BAND_NAMES).toEqual(['junior', 'senior', 'principal']);
        expect(BAND_NAMES).toEqual(Object.keys(DEFAULT_GRADE_BANDS));
    });

    it('offers a Monday-first weekday strip carrying the engine day numbers', () => {
        expect(WEEKDAY_STRIP.map((entry) => entry.label)).toEqual(
            ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        );
        // 0 = Sunday … 6 = Saturday, matching `Date.prototype.getDay`, which is
        // what `generateRosterV2` compares `task.days` against.
        expect(WEEKDAY_STRIP.map((entry) => entry.day)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    });

    it('opens with blank rows: five staff, three tasks, tasks Mon–Fri', () => {
        expect(createEmptyStaffRows()).toHaveLength(5);
        expect(createEmptyTaskRows()).toHaveLength(3);
        for (const row of createEmptyStaffRows()) {
            expect(row.name).toBe('');
            expect(row.grade).toBe('');
            expect(row.fte).toBe(String(ROSTER_V2_DEFAULTS.fte));
            expect(row.away).toBe('');
        }
        for (const row of createEmptyTaskRows()) {
            expect(row.days).toEqual([...ROSTER_V2_DEFAULTS.days]);
            expect(row.leadBands).toEqual([]);
            expect(row.coLead).toBe(true);
        }
    });

    it('gives every row a distinct id, so removing one cannot shuffle the rest', () => {
        const ids = [...createEmptyStaffRows(4), ...createEmptyTaskRows(4)].map((row) => row.id);
        expect(new Set(ids).size).toBe(8);
    });

    it('seeds a row from an engine staff/task object without aliasing it', () => {
        const source = { name: 'Shuri', grade: 'AH13', fte: 1, skills: ['CPET'], unavailable: ['2026-09-16'] };
        const row = staff(source);
        expect(row).toMatchObject({ name: 'Shuri', grade: 'AH13', fte: '1', away: '2026-09-16' });
        row.skills.push('SLEEP');
        expect(source.skills).toEqual(['CPET']);

        const taskRow = task({ name: 'Outpatient Clinic', days: [1, 3], coLeads: 0, leadBands: ['senior', 'principal'] });
        expect(taskRow).toMatchObject({ name: 'Outpatient Clinic', days: [1, 3], coLead: false });
        expect(taskRow.leadBands).toEqual(['senior', 'principal']);
    });
});

// ─── 2. THE BAND BOUNDARY EDITOR ──────────────────────────────────────────────

describe('band boundaries', () => {
    it('round-trips the shipped cut through the six inputs', () => {
        expect(DEFAULT_INPUTS).toEqual({
            junior: { min: '7', max: '12' },
            senior: { min: '13', max: '14' },
            principal: { min: '15', max: '17' },
        });
        expect(inputsToBands(DEFAULT_INPUTS)).toEqual({
            junior: [7, 12],
            senior: [13, 14],
            principal: [15, 17],
        });
    });

    it('turns a blank box into null, not 0 and not a silent default', () => {
        // 0 would be "outside the AH7–AH17 scale" — a reason about a number the
        // user never typed. `null` makes the validator talk about the empty box.
        const bands = inputsToBands({ ...DEFAULT_INPUTS, senior: { min: '', max: '14' } });
        expect(bands.senior).toEqual([null, 14]);
    });

    it('renders the grade range a set of chips implies, merging adjacent bands', () => {
        expect(describeBandRange(['senior', 'principal'], DEFAULT_GRADE_BANDS)).toBe('AH13–AH17');
        expect(describeBandRange(['junior'], DEFAULT_GRADE_BANDS)).toBe('AH7–AH12');
        // A gap in the SELECTION is honest rather than flattened into one span.
        expect(describeBandRange(['junior', 'principal'], DEFAULT_GRADE_BANDS)).toBe('AH7–AH12, AH15–AH17');
        expect(describeBandRange([], DEFAULT_GRADE_BANDS)).toBe('');
    });

    it('follows the boundaries it is given, not the shipped ones', () => {
        // Requirement 1: moving a boundary must move the range shown beside every
        // task's chips in the same keystroke.
        const moved = { junior: [7, 10], senior: [11, 14], principal: [15, 17] };
        expect(describeBandRange(['senior'], moved)).toBe('AH11–AH14');
        expect(describeBandRange(['junior'], moved)).toBe('AH7–AH10');
    });

    it('names no range at all while the boundaries do not partition the scale', () => {
        const gap = { junior: [7, 11], senior: [13, 14], principal: [15, 17] };
        expect(describeBandRange(['senior'], gap)).toBe('');
    });
});

// ─── 3. THE CELL PARSERS ──────────────────────────────────────────────────────

describe('the FTE cell', () => {
    it('accepts the documented range, and treats a blank cell as full time', () => {
        expect(parseFteCell('1.0')).toMatchObject({ ok: true, value: 1 });
        expect(parseFteCell(' 0.6 ')).toMatchObject({ ok: true, value: 0.6 });
        expect(parseFteCell('0.1')).toMatchObject({ ok: true, value: 0.1 });
        expect(parseFteCell('')).toMatchObject({ ok: true, value: ROSTER_V2_DEFAULTS.fte });
    });

    it('refuses out-of-range and unreadable values instead of clamping them', () => {
        // Clamping 1.4 to 1.0 would silently roster a 1.4 FTE typo as full time.
        expect(parseFteCell('1.4').ok).toBe(false);
        expect(parseFteCell('0').ok).toBe(false);
        expect(parseFteCell('-0.5').ok).toBe(false);
        expect(parseFteCell('half').ok).toBe(false);
        expect(parseFteCell('half').reason).toMatch(/not a number/i);
        expect(parseFteCell('1.4').reason).toMatch(/outside/i);
    });
});

describe('the Away cell', () => {
    it('parses a comma-separated list, tolerating whitespace and a trailing comma', () => {
        expect(parseAwayCell(' 2026-09-16 , 2026-09-17, ')).toMatchObject({
            ok: true,
            dates: ['2026-09-16', '2026-09-17'],
        });
        expect(parseAwayCell('')).toMatchObject({ ok: true, dates: [] });
    });

    it('collapses a repeated date rather than passing it through twice', () => {
        expect(parseAwayCell('2026-09-16, 2026-09-16').dates).toEqual(['2026-09-16']);
    });

    it('refuses anything that is not a real YYYY-MM-DD date, and quotes it', () => {
        const bad = parseAwayCell('16 Sept, 2026-09-17');
        expect(bad.ok).toBe(false);
        expect(bad.reason).toContain('"16 Sept"');
        // The valid neighbour is NOT quietly kept: a half-applied leave list is
        // worse than a refusal, because the missing day looks deliberate.
        expect(bad.dates).toEqual([]);

        // The engine's own calendar check, so 30 February is refused here for the
        // same reason it would be refused there.
        expect(parseAwayCell('2026-02-30').ok).toBe(false);
        expect(parseAwayCell('2026-9-7').ok).toBe(false);
    });
});

// ─── 4. THE MAPPING ───────────────────────────────────────────────────────────

describe('buildDemoRosterV2ConfigFromTables', () => {
    it('maps a filled-in pair of tables into a config the engine accepts', () => {
        const result = build({
            staffRows: [
                staff({ name: 'Aisha Rahman', grade: 'AH14', fte: 1 }),
                staff({ name: 'Ben Carter', grade: 'AH9', fte: 0.6, unavailable: ['2026-09-09'] }),
            ],
            taskRows: [
                task({ name: 'Outpatient Clinic', leadBands: ['senior', 'principal'], days: [1, 2, 3, 4, 5] }),
                task({ name: 'Ward Round', days: [1, 3], coLeads: 0 }),
            ],
        });

        expect(result.ok).toBe(true);
        expect(result.config).toEqual({
            startDate: '2026-09-07',
            weeks: 1,
            staff: [
                { name: 'Aisha Rahman', fte: 1, skills: [], unavailable: [], grade: 'AH14' },
                { name: 'Ben Carter', fte: 0.6, skills: [], unavailable: ['2026-09-09'], grade: 'AH9' },
            ],
            tasks: [
                { name: 'Outpatient Clinic', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1, leadBands: ['senior', 'principal'] },
                { name: 'Ward Round', days: [1, 3], leads: 1, coLeads: 0 },
            ],
            rules: { bands: { junior: [7, 12], senior: [13, 14], principal: [15, 17] } },
        });

        // …and the engine agrees it is well formed, which is the claim that
        // matters: this mapping is only correct if `generateRosterV2` accepts it.
        expect(validateRosterV2Config(result.config).valid).toBe(true);
    });

    it('attaches each grade to the right person, and trims the names', () => {
        const result = build({
            staffRows: [
                staff({ name: '  Carol Danvers ', grade: 'AH16' }),
                staff({ name: 'Riri Williams', grade: 'AH7' }),
            ],
            taskRows: [task({ name: 'Ward Round' })],
        });
        expect(result.config.staff.map((person) => [person.name, person.grade])).toEqual([
            ['Carol Danvers', 'AH16'],
            ['Riri Williams', 'AH7'],
        ]);
    });

    it('sends band keys LOWER CASE — the engine refuses "Senior"', () => {
        const result = build({
            staffRows: [staff({ name: 'Aisha', grade: 'AH16' })],
            taskRows: [task({ name: 'Clinic', leadBands: ['principal'] })],
        });
        expect(result.config.tasks[0].leadBands).toEqual(['principal']);
        // Belt and braces: the same config with the chip's label instead of its
        // key is refused by the engine, which is why this matters.
        expect(
            validateRosterV2Config({
                ...result.config,
                tasks: [{ ...result.config.tasks[0], leadBands: ['Principal'] }],
            }).valid,
        ).toBe(false);
    });

    it('emits leadBands in scale order however the chips were ticked', () => {
        const result = build({
            staffRows: [staff({ name: 'Aisha', grade: 'AH16' }), staff({ name: 'Ben', grade: 'AH13' })],
            // Ticked principal first, then senior.
            taskRows: [task({ name: 'Clinic', leadBands: ['principal', 'senior'] })],
        });
        expect(result.config.tasks[0].leadBands).toEqual(['senior', 'principal']);
    });

    it('omits leadBands entirely when no chip is ticked — open to every grade', () => {
        const result = build({
            staffRows: [staff({ name: 'Aisha', grade: 'AH16' })],
            taskRows: [task({ name: 'Clinic', leadBands: [] })],
        });
        // NOT `leadBands: []`, which the engine refuses (nothing could satisfy
        // it, so every lead slot would be unfilled).
        expect('leadBands' in result.config.tasks[0]).toBe(false);
        expect(validateRosterV2Config(result.config).valid).toBe(true);
    });

    it('OMITS a blank grade rather than defaulting it to AH7', () => {
        const result = build({
            staffRows: [staff({ name: 'Ungraded Locum', grade: '' }), staff({ name: 'Aisha', grade: 'AH16' })],
            taskRows: [task({ name: 'Clinic', leadBands: ['principal'] })],
        });
        expect('grade' in result.config.staff[0]).toBe(false);
        expect(result.config.staff[0]).not.toHaveProperty('grade', '');

        // And the consequence the engine draws from that absence is the honest
        // one: a warning naming the person, not a silent promotion.
        const run = generateRosterV2(result.config);
        expect(run.ok).toBe(true);
        expect(run.warnings.join(' ')).toContain('Ungraded Locum');
        expect(run.warnings.join(' ')).toMatch(/no job grade recorded/i);
        for (const shifts of Object.values(run.roster)) {
            for (const shift of shifts) {
                expect(shift.lead).not.toBe('Ungraded Locum');
            }
        }
    });

    it('carries skills and requiresSkill, which have no column of their own', () => {
        // The example department's single unfillable slot exists because only two
        // people hold CPET. Losing that on load would delete the demonstration.
        const result = build({
            staffRows: [staff({ name: 'Bruce', grade: 'AH14', skills: ['CPET'] })],
            taskRows: [task({ name: 'Paediatric CPET', requiresSkill: 'CPET', days: [3], category: 'Clinical' })],
        });
        expect(result.config.staff[0].skills).toEqual(['CPET']);
        expect(result.config.tasks[0]).toMatchObject({ requiresSkill: 'CPET', category: 'Clinical' });
    });

    it('parses away dates into unavailable', () => {
        const result = build({
            staffRows: [staff({ name: 'Shuri', grade: 'AH13', away: '2026-09-16, 2026-09-17' })],
            taskRows: [task({ name: 'Clinic' })],
        });
        expect(result.config.staff[0].unavailable).toEqual(['2026-09-16', '2026-09-17']);
    });

    it('IGNORES untouched blank rows — the wizard opens with eight of them', () => {
        const result = build({
            staffRows: [...createEmptyStaffRows(), staff({ name: 'Solo', grade: 'AH11' })],
            taskRows: [...createEmptyTaskRows(), task({ name: 'Ward Round' })],
        });
        expect(result.ok).toBe(true);
        expect(result.config.staff).toHaveLength(1);
        expect(result.config.tasks).toHaveLength(1);
    });

    it('refuses a row that has a grade or leave dates but no name', () => {
        const row = staff({ name: '', grade: 'AH13' });
        const result = build({ staffRows: [row], taskRows: [task({ name: 'Clinic' })] });
        expect(result.ok).toBe(false);
        expect(result.staffErrors[row.id].name).toMatch(/nobody to apply them to/i);
    });

    it('refuses an out-of-range FTE per row, and names the row', () => {
        const row = staff({ name: 'Ben Carter', fte: 1.4 });
        const result = build({ staffRows: [row], taskRows: [task({ name: 'Clinic' })] });
        expect(result.ok).toBe(false);
        expect(result.config).toBeNull();
        expect(result.staffErrors[row.id].fte).toMatch(/outside/i);
        expect(result.reason).toContain('Ben Carter');
    });

    it('refuses an unreadable leave date per row instead of dropping it', () => {
        const row = staff({ name: 'Shuri', away: '16 September' });
        const result = build({ staffRows: [row], taskRows: [task({ name: 'Clinic' })] });
        expect(result.ok).toBe(false);
        expect(result.staffErrors[row.id].away).toContain('"16 September"');
    });

    it('refuses a grade that is not on the scale', () => {
        const row = staff({ name: 'Typo', grade: 'AH99' });
        const result = build({ staffRows: [row], taskRows: [task({ name: 'Clinic' })] });
        expect(result.ok).toBe(false);
        expect(result.staffErrors[row.id].grade).toMatch(/not on the allied-health scale/i);
        // Every grade the dropdown offers is accepted, so the refusal can only
        // ever be about a value the UI did not produce.
        for (const grade of GRADE_SCALE) {
            expect(build({
                staffRows: [staff({ name: 'A', grade })],
                taskRows: [task({ name: 'Clinic' })],
            }).ok).toBe(true);
        }
    });

    it('refuses a task with no days ticked, which would generate nothing', () => {
        const row = task({ name: 'Ghost Clinic', days: [] });
        const result = build({ staffRows: [staff({ name: 'Aisha' })], taskRows: [row] });
        expect(result.ok).toBe(false);
        expect(result.taskErrors[row.id].days).toMatch(/no days ticked/i);
    });

    it('blocks everything, with validateGradeBands\' own reason, on a broken partition', () => {
        const result = build({
            bandInputs: { ...DEFAULT_INPUTS, junior: { min: '7', max: '11' } },
            staffRows: [staff({ name: 'Aisha', grade: 'AH16' })],
            taskRows: [task({ name: 'Clinic' })],
        });
        expect(result.ok).toBe(false);
        expect(result.config).toBeNull();
        // AH12 would be in no band at all — the dangerous case, because it makes
        // somebody silently ineligible to lead every band-gated task.
        expect(result.bandsReason).toContain('AH12');
        expect(result.reason).toBe(result.bandsReason);
    });

    it('passes the edited boundaries through as rules.bands', () => {
        const result = build({
            bandInputs: { junior: { min: '7', max: '10' }, senior: { min: '11', max: '14' }, principal: { min: '15', max: '17' } },
            staffRows: [staff({ name: 'Aisha', grade: 'AH11' })],
            taskRows: [task({ name: 'Clinic', leadBands: ['senior'] })],
        });
        expect(result.config.rules.bands).toEqual({ junior: [7, 10], senior: [11, 14], principal: [15, 17] });
        // AH11 is a senior under THESE boundaries, so the gated task is fillable —
        // under the shipped ones it would not be, and the engine would refuse.
        expect(validateRosterV2Config(result.config).valid).toBe(true);
    });

    it('lets the boundary editor win over any rules handed in beside it', () => {
        const result = build({
            extraRules: { maxConcurrentPerDay: 3, bands: DEFAULT_GRADE_BANDS },
            bandInputs: { junior: { min: '7', max: '10' }, senior: { min: '11', max: '14' }, principal: { min: '15', max: '17' } },
            staffRows: [staff({ name: 'Aisha', grade: 'AH11' })],
            taskRows: [task({ name: 'Clinic' })],
        });
        expect(result.config.rules.maxConcurrentPerDay).toBe(3);
        expect(result.config.rules.bands.senior).toEqual([11, 14]);
    });

    it('asks for a person and a task before it will generate anything', () => {
        expect(build({ taskRows: [task({ name: 'Clinic' })] }).reason).toMatch(/at least one person/i);
        expect(build({ staffRows: [staff({ name: 'Aisha' })] }).reason).toMatch(/at least one task/i);
    });

    it('is pure: it does not mutate the rows it is given', () => {
        const staffRows = [staff({ name: 'Shuri', grade: 'AH13', skills: ['CPET'], away: '2026-09-16' })];
        const taskRows = [task({ name: 'Clinic', leadBands: ['senior'], days: [1, 2] })];
        const before = JSON.stringify({ staffRows, taskRows });
        const result = build({ staffRows, taskRows });
        expect(JSON.stringify({ staffRows, taskRows })).toBe(before);
        // …and the config does not alias the rows either.
        result.config.staff[0].skills.push('SLEEP');
        result.config.tasks[0].leadBands.push('principal');
        expect(staffRows[0].skills).toEqual(['CPET']);
        expect(taskRows[0].leadBands).toEqual(['senior']);
    });
});

// ─── 5. THE BAND GATE ACTUALLY BINDS, END TO END THROUGH THE MAPPING ──────────

describe('a band-gated task, mapped and generated', () => {
    it('never lets a junior lead a senior-gated task', () => {
        const result = build({
            weeks: 1,
            staffRows: [
                staff({ name: 'Principal Pat', grade: 'AH16' }),
                staff({ name: 'Senior Sam', grade: 'AH13' }),
                staff({ name: 'Junior Jo', grade: 'AH8' }),
                staff({ name: 'Junior Kit', grade: 'AH7' }),
            ],
            taskRows: [
                task({ name: 'Outpatient Clinic', leadBands: ['senior', 'principal'] }),
                task({ name: 'Inpatient Rounds', leadBands: ['junior'] }),
            ],
        });
        expect(result.ok).toBe(true);

        const run = generateRosterV2(result.config);
        expect(run.ok).toBe(true);
        expect(run.score.hardViolations).toBe(0);

        const gradeOf = { 'Principal Pat': 16, 'Senior Sam': 13, 'Junior Jo': 8, 'Junior Kit': 7 };
        let clinics = 0;
        let rounds = 0;
        for (const shifts of Object.values(run.roster)) {
            for (const shift of shifts) {
                if (shift.task === 'Outpatient Clinic') {
                    clinics += 1;
                    expect(gradeOf[shift.lead]).toBeGreaterThanOrEqual(13);
                }
                if (shift.task === 'Inpatient Rounds') {
                    rounds += 1;
                    expect(gradeOf[shift.lead]).toBeLessThanOrEqual(12);
                }
            }
        }
        // The gates were exercised rather than vacuously satisfied.
        expect(clinics).toBeGreaterThan(0);
        expect(rounds).toBeGreaterThan(0);
    });
});
