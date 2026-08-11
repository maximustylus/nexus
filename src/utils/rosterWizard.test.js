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
 * Sections 6 and 7 add the two capabilities that were engine-only until now, and
 * both carry the same load-bearing shape:
 *
 *   7. HOURS. A typed duration ATTACHES to the right task; a BLANK cell is
 *      omitted, never zeroed and never defaulted to 42 — because the engine's
 *      hours model switches on by MENTION, so a helpfully-prefilled default would
 *      change the roster of every department that has never counted an hour.
 *   8. SLOTS. A slot-mode task emits `slots` and NOT `leads`/`coLeads`/`leadBands`
 *      — the engine refuses all three combinations, measured below — and each
 *      slot's band and skill survive the mapping.
 *
 * No DOM, no mocks, no Firestore: the module under test is pure and imports only
 * the engine's read-only exports.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
    ANY_BAND,
    BAND_NAMES,
    HOURS_IN_A_DAY,
    HOURS_IN_A_WEEK,
    SLOTS_MIN,
    SLOTS_MAX,
    WEEKDAY_STRIP,
    bandsToInputs,
    countWorkingDays,
    inputsToBands,
    describeBandRange,
    describeFteAsDays,
    derivedDailyHours,
    parseFteCell,
    parseAwayCell,
    parseTaskHoursCell,
    parseWeeklyHoursCell,
    parseDailyHoursCell,
    parseTaskSlots,
    createStaffRow,
    createTaskRow,
    createTaskSlot,
    createDefaultTaskSlots,
    createEmptyStaffRows,
    createEmptyTaskRows,
    buildDemoRosterV2ConfigFromTables,
} from './rosterWizard.js';
import {
    DEFAULT_GRADE_BANDS,
    DEFAULT_TASK_HOURS,
    DEFAULT_WEEKLY_HOURS,
    GRADE_SCALE,
    ROSTER_V2_DEFAULTS,
    defaultMaxHoursPerDay,
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

/**
 * A task row switched to slot mode, the way the drawer's toggle does it: the mode
 * flag and the list, with everything else left exactly as `createTaskRow` made it.
 * `leadBands` and `coLead` are deliberately settable through `seed` so a test can
 * prove they do NOT reach the config while the mode is on.
 */
const slotTask = (seed = {}, slots = []) => ({
    ...createTaskRow(seed),
    slotMode: true,
    slots: slots.map((entry) => createTaskSlot(entry)),
});

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

// ─── 6. THE HOURS CELLS ───────────────────────────────────────────────────────

describe('the hours cells', () => {
    it('treats a BLANK cell as "no key at all" — not 0, and not the default', () => {
        // This is the whole hours contract in one assertion. `null` means the
        // mapper omits the field; 0 would be a task that takes no time (the engine
        // refuses it) and 42 would switch the engine's opt-in hours model on for a
        // department that never mentioned hours.
        for (const parse of [parseTaskHoursCell, parseWeeklyHoursCell, parseDailyHoursCell]) {
            expect(parse('')).toEqual({ ok: true, value: null, reason: null });
            expect(parse('   ')).toEqual({ ok: true, value: null, reason: null });
            expect(parse(undefined)).toEqual({ ok: true, value: null, reason: null });
        }
    });

    it('accepts whole and fractional hours, and trims', () => {
        expect(parseTaskHoursCell('8')).toMatchObject({ ok: true, value: 8 });
        expect(parseTaskHoursCell(' 4.5 ')).toMatchObject({ ok: true, value: 4.5 });
        expect(parseWeeklyHoursCell('42')).toMatchObject({ ok: true, value: 42 });
        expect(parseDailyHoursCell('8.4')).toMatchObject({ ok: true, value: 8.4 });
    });

    it('refuses a non-number and quotes what it could not read', () => {
        const bad = parseTaskHoursCell('four');
        expect(bad.ok).toBe(false);
        expect(bad.value).toBeNull();
        expect(bad.reason).toContain('"four"');
        // …and it says what blank would have meant, so the way out is in the message.
        expect(bad.reason).toContain(`${DEFAULT_TASK_HOURS}h`);
    });

    it('refuses 0, a negative, and anything past the calendar ceilings', () => {
        // 0 is the interesting one: it is the value a "helpful" blank-to-number
        // coercion would produce, and a 0-hour task is not a task.
        expect(parseTaskHoursCell('0').ok).toBe(false);
        expect(parseTaskHoursCell('-4').ok).toBe(false);
        expect(parseTaskHoursCell(String(HOURS_IN_A_DAY)).ok).toBe(true);
        expect(parseTaskHoursCell(String(HOURS_IN_A_DAY + 1)).ok).toBe(false);
        expect(parseWeeklyHoursCell(String(HOURS_IN_A_WEEK)).ok).toBe(true);
        expect(parseWeeklyHoursCell(String(HOURS_IN_A_WEEK + 1)).ok).toBe(false);
        expect(parseDailyHoursCell('25').ok).toBe(false);
        expect(HOURS_IN_A_WEEK).toBe(HOURS_IN_A_DAY * 7);
    });

    it('derives the daily cap from the week that was TYPED, as the engine does', () => {
        // The wizard shows this as the second box's placeholder. It has to follow
        // the first box, or a department on a 35-hour week is shown an 8.4h day and
        // generated against a 7h one.
        expect(derivedDailyHours('')).toBe(defaultMaxHoursPerDay(DEFAULT_WEEKLY_HOURS));
        expect(derivedDailyHours('35')).toBe(defaultMaxHoursPerDay(35));
        expect(derivedDailyHours('42')).toBe(8.4);
        // An unreadable box falls back to the shipped week rather than to NaN.
        expect(derivedDailyHours('nonsense')).toBe(defaultMaxHoursPerDay(DEFAULT_WEEKLY_HOURS));
    });
});

describe('hours through the mapping', () => {
    it('attaches each task its own hours, and omits the key for a blank cell', () => {
        const result = build({
            staffRows: [staff({ name: 'Ada' })],
            taskRows: [
                task({ name: 'Long Bench', hours: 8 }),
                task({ name: 'Short Review', hours: 2 }),
                task({ name: 'Unspecified' }),
            ],
        });

        expect(result.ok).toBe(true);
        expect(result.config.tasks.map((entry) => [entry.name, entry.hours])).toEqual([
            ['Long Bench', 8],
            ['Short Review', 2],
            ['Unspecified', undefined],
        ]);
        // NOT `hours: 0` and NOT `hours: 4` — the key is absent, which is how the
        // engine is told "assume the default" rather than "this takes no time".
        expect('hours' in result.config.tasks[2]).toBe(false);
        expect(validateRosterV2Config(result.config).valid).toBe(true);
    });

    it('emits the department week and day, and NEITHER while the boxes are blank', () => {
        const typed = build({
            hoursInputs: { weeklyHours: '42', maxHoursPerDay: '8.4' },
            staffRows: [staff({ name: 'Ada' })],
            taskRows: [task({ name: 'Clinic' })],
        });
        expect(typed.config.rules).toMatchObject({ weeklyHours: 42, maxHoursPerDay: 8.4 });

        // Only the week: the engine derives the day from it, and the wizard must not
        // pre-empt that derivation by sending a number the visitor did not type.
        const weekOnly = build({
            hoursInputs: { weeklyHours: '35', maxHoursPerDay: '' },
            staffRows: [staff({ name: 'Ada' })],
            taskRows: [task({ name: 'Clinic' })],
        });
        expect(weekOnly.config.rules.weeklyHours).toBe(35);
        expect('maxHoursPerDay' in weekOnly.config.rules).toBe(false);

        const blank = build({
            hoursInputs: { weeklyHours: '', maxHoursPerDay: '' },
            staffRows: [staff({ name: 'Ada' })],
            taskRows: [task({ name: 'Clinic' })],
        });
        expect('weeklyHours' in blank.config.rules).toBe(false);
        expect('maxHoursPerDay' in blank.config.rules).toBe(false);
    });

    it('leaves the engine\'s hours model OFF when nothing mentions hours', () => {
        // The reason blank has to stay blank, stated as the consequence rather than
        // as a claim about the mapper: `load` carries hours only when the engine
        // considers the model requested, so this is the observable difference
        // between "the visitor typed nothing" and "the wizard typed 42 for them".
        const silent = build({
            staffRows: [staff({ name: 'Ada' }), staff({ name: 'Ben' })],
            taskRows: [task({ name: 'Clinic' })],
        });
        const silentRun = generateRosterV2(silent.config);
        expect(silentRun.ok).toBe(true);
        expect('hours' in silentRun.load.Ada).toBe(false);
        expect('weeklyCap' in silentRun.load.Ada).toBe(false);

        // …and one box is enough to turn it on.
        const asked = build({
            hoursInputs: { weeklyHours: '42', maxHoursPerDay: '' },
            staffRows: [staff({ name: 'Ada' }), staff({ name: 'Ben' })],
            taskRows: [task({ name: 'Clinic' })],
        });
        const askedRun = generateRosterV2(asked.config);
        expect(askedRun.load.Ada).toMatchObject({ weeklyCap: 42 });
        expect(typeof askedRun.load.Ada.hours).toBe('number');
        // Nothing about the DUTIES changed — hours are a second currency, not a
        // different roster.
        expect(askedRun.load.Ada.duties).toBe(silentRun.load.Ada.duties);
    });

    it('refuses a bad hours cell per row, with a reason naming the task', () => {
        const row = task({ name: 'Typo Clinic' });
        row.hours = 'four';
        const result = build({ staffRows: [staff({ name: 'Ada' })], taskRows: [row] });

        expect(result.ok).toBe(false);
        expect(result.config).toBeNull();
        expect(result.taskErrors[row.id].hours).toContain('Typo Clinic');
        expect(result.taskErrors[row.id].hours).toContain('"four"');
        expect(result.reason).toBe(result.taskErrors[row.id].hours);

        // Out of range is refused too, never clamped to the ceiling.
        const long = task({ name: 'Marathon' });
        long.hours = '30';
        const tooLong = build({ staffRows: [staff({ name: 'Ada' })], taskRows: [long] });
        expect(tooLong.ok).toBe(false);
        expect(tooLong.taskErrors[long.id].hours).toContain(String(HOURS_IN_A_DAY));
    });

    it('refuses a bad department box, and reports it as a department problem', () => {
        const result = build({
            hoursInputs: { weeklyHours: '400', maxHoursPerDay: '' },
            staffRows: [staff({ name: 'Ada' })],
            taskRows: [task({ name: 'Clinic' })],
        });
        expect(result.ok).toBe(false);
        expect(result.config).toBeNull();
        // Not attached to any row — it belongs to the department, like the bands.
        expect(result.taskErrors).toEqual({});
        expect(result.staffErrors).toEqual({});
        expect(result.hoursErrors.weeklyHours).toContain('168');
        expect(result.reason).toBe(result.hoursErrors.weeklyHours);
    });

    it('reports both hours boxes at once rather than one press at a time', () => {
        const result = build({
            hoursInputs: { weeklyHours: 'lots', maxHoursPerDay: 'plenty' },
            staffRows: [staff({ name: 'Ada' })],
            taskRows: [task({ name: 'Clinic' })],
        });
        expect(result.hoursErrors.weeklyHours).toContain('"lots"');
        expect(result.hoursErrors.maxHoursPerDay).toContain('"plenty"');
    });

    it('BINDS: an hours-capped person\'s duty is reported unfilled, naming the hours', () => {
        // The reachability claim, measured. Two sessions on one day that add to 12h
        // against the 8.4h the typed 42-hour week implies.
        const result = build({
            hoursInputs: { weeklyHours: '42', maxHoursPerDay: '' },
            staffRows: [staff({ name: 'Solo Scientist' })],
            taskRows: [
                task({ name: 'Long Bench', hours: 8, coLeads: 0 }),
                task({ name: 'Late Review', hours: 4, coLeads: 0 }),
            ],
        });
        expect(result.ok).toBe(true);

        const run = generateRosterV2(result.config);
        expect(run.ok).toBe(true);
        expect(run.score.hardViolations).toBe(0);

        // Every Late Review is unfilled, and the reason names the person, the total
        // and what they already hold — not "no available staff" and nothing else.
        const blocked = run.unfilled.filter((slot) => slot.task === 'Late Review');
        expect(blocked.length).toBe(5);
        expect(blocked[0].reason).toContain('Solo Scientist would reach 12h');
        expect(blocked[0].reason).toContain('8.4h daily limit');
        expect(blocked[0].reason).toContain('already on Long Bench 8h');

        // …and nobody was quietly given the 12-hour day instead.
        expect(run.load['Solo Scientist'].hours).toBe(40);
        for (const shifts of Object.values(run.roster)) {
            expect(shifts.map((shift) => shift.task)).not.toContain('Late Review');
        }
    });

    it('BINDS: the rolling four-week total is warned about, from wizard rows', () => {
        // Leave at the front of week 1 and the back of week 5, so every individual
        // week stays inside 42h while one straddling 28-day window holds 176.
        //
        // EVERY FIELD HERE IS A CONTROL THE WIZARD HAS: the leave dates are the Away
        // column, the seven days are the day chips, the length is the task drawer and
        // the 42 is the department box. Nothing is passed through `extraRules`, so
        // `maxConsecutiveDays` stays at the engine's default 6 — which is the point,
        // because a warning that needs a field the UI cannot set is not reachable.
        const result = build({
            weeks: 5,
            hoursInputs: { weeklyHours: '42', maxHoursPerDay: '' },
            staffRows: [staff({
                name: 'Ada',
                away: '2026-09-07, 2026-09-08, 2026-09-09, 2026-10-08, 2026-10-09, 2026-10-10, 2026-10-11',
            })],
            taskRows: [task({ name: 'Bench A', days: [0, 1, 2, 3, 4, 5, 6], coLeads: 0, hours: 8 })],
        });
        expect(result.ok).toBe(true);

        const run = generateRosterV2(result.config);
        const rolling = run.warnings.find((line) => line.includes('28 days'));
        expect(rolling).toContain('Ada is rostered 176h');
        expect(rolling).toContain('above the 168h');
        // It is a warning and not a gate: the hours it names are still rostered.
        expect(run.load.Ada.hours).toBe(176);
        expect(run.load.Ada.hoursPerWeek).toEqual([32, 40, 40, 40, 24]);
        for (const week of run.load.Ada.hoursPerWeek) expect(week).toBeLessThanOrEqual(42);
    });
});

// ─── 7. MULTI-SLOT SHIFTS ─────────────────────────────────────────────────────

describe('the slot list model', () => {
    it('opens a new slot list at SLOTS_MIN entries, all open to any grade', () => {
        const slots = createDefaultTaskSlots();
        expect(slots).toHaveLength(SLOTS_MIN);
        for (const slot of slots) {
            // A default that named bands would be this module inventing a hierarchy
            // the visitor never typed.
            expect(slot.band).toBe(ANY_BAND);
            expect(slot.requiresSkill).toBe('');
        }
        expect(new Set(slots.map((slot) => slot.id)).size).toBe(SLOTS_MIN);
        expect(SLOTS_MIN).toBeLessThan(SLOTS_MAX);
    });

    it('a task row starts in the old shape, with its slot list unread beside it', () => {
        const row = task({ name: 'Clinic' });
        expect(row.slotMode).toBe(false);
        expect(row.hours).toBe('');
        // Present, so switching the mode on never has to invent state mid-render —
        // and ignored, so it cannot leak into the config.
        expect(row.slots).toHaveLength(SLOTS_MIN);
    });

    it('opens in slot mode when a fixture already carries slots', () => {
        const row = task({ name: 'TRIO', slots: [{ band: 'principal' }, { band: 'senior', requiresSkill: 'Witnessing' }] });
        expect(row.slotMode).toBe(true);
        expect(row.slots.map((slot) => [slot.band, slot.requiresSkill])).toEqual([
            ['principal', ''],
            ['senior', 'Witnessing'],
        ]);
    });

    it('keeps a band only when one was named, and a skill only when one was typed', () => {
        const parsed = parseTaskSlots([
            { band: 'principal', requiresSkill: '' },
            { band: ANY_BAND, requiresSkill: ' Witnessing ' },
            { band: 'junior', requiresSkill: 'CPET' },
        ]);
        expect(parsed.ok).toBe(true);
        expect(parsed.slots).toEqual([
            { band: 'principal' },
            { requiresSkill: 'Witnessing' },
            { band: 'junior', requiresSkill: 'CPET' },
        ]);
        // An absent `band` is the engine's own spelling of "any grade may fill it",
        // so the key is omitted rather than sent as ''.
        expect('band' in parsed.slots[1]).toBe(false);
    });

    it('refuses an empty list rather than falling back to lead + co-lead', () => {
        const parsed = parseTaskSlots([]);
        expect(parsed.ok).toBe(false);
        expect(parsed.reason).toMatch(/needs? nobody at all|list is empty/i);
    });

    it('refuses a band that is not a band, naming the slot', () => {
        const parsed = parseTaskSlots([{ band: 'principal' }, { band: 'Senior' }]);
        expect(parsed.ok).toBe(false);
        expect(parsed.reason).toContain('Slot 2');
        expect(parsed.reason).toContain('"Senior"');
    });
});

describe('slots through the mapping', () => {
    const TRIO_STAFF = [
        staff({ name: 'Prin', grade: 'AH16', skills: ['Witnessing'] }),
        staff({ name: 'Sen', grade: 'AH13', skills: ['Witnessing'] }),
        staff({ name: 'Jun', grade: 'AH8' }),
    ];

    const trioRow = () => slotTask(
        // Chips ticked and the co-lead toggle left ON, so that "neither reaches the
        // config" is a claim about the mapper and not about an untouched row.
        { name: 'Weekend Witnessing', leadBands: ['senior', 'principal'], coLeads: 1 },
        [{ band: 'principal' }, { band: 'senior', requiresSkill: 'Witnessing' }, { band: 'junior' }],
    );

    it('emits slots and NOT leads, coLeads or leadBands', () => {
        const row = trioRow();
        const result = build({ staffRows: TRIO_STAFF, taskRows: [row] });
        expect(result.ok).toBe(true);

        const mapped = result.config.tasks[0];
        expect(mapped.slots).toEqual([
            { band: 'principal' },
            { band: 'senior', requiresSkill: 'Witnessing' },
            { band: 'junior' },
        ]);
        // All three are refused by the engine alongside `slots` — including
        // `coLeads: 0`, which is why the co-lead toggle cannot simply be sent as a
        // zero. Asserted as absence of the KEY, not as a falsy value.
        expect('leads' in mapped).toBe(false);
        expect('coLeads' in mapped).toBe(false);
        expect('leadBands' in mapped).toBe(false);
        expect(validateRosterV2Config(result.config).valid).toBe(true);
    });

    it('is exactly the combination the engine refuses, which is why they are omitted', () => {
        // The rule this mapper is matching, measured on the engine rather than read
        // out of its comments. If any of these four ever starts being accepted, this
        // test says so instead of the mapper silently over-restricting.
        const result = build({ staffRows: TRIO_STAFF, taskRows: [trioRow()] });
        const withSlots = result.config.tasks[0];
        for (const extra of [{ leads: 1 }, { coLeads: 1 }, { coLeads: 0 }, { leadBands: ['senior'] }, { continuity: true }]) {
            const check = validateRosterV2Config({
                ...result.config,
                tasks: [{ ...withSlots, ...extra }],
            });
            expect(check.valid).toBe(false);
            expect(check.reason).toContain('slots and');
        }
    });

    it('goes back to lead + co-lead when the mode is switched off, list and all', () => {
        const row = { ...trioRow(), slotMode: false };
        const result = build({ staffRows: TRIO_STAFF, taskRows: [row] });
        const mapped = result.config.tasks[0];
        expect('slots' in mapped).toBe(false);
        expect(mapped).toMatchObject({ leads: 1, coLeads: 1, leadBands: ['senior', 'principal'] });
    });

    it('refuses a slot-mode row whose list is empty, per row and by name', () => {
        const row = slotTask({ name: 'Empty Team' }, []);
        const result = build({ staffRows: TRIO_STAFF, taskRows: [row] });
        expect(result.ok).toBe(false);
        expect(result.config).toBeNull();
        expect(result.taskErrors[row.id].slots).toContain('Empty Team');
        expect(result.reason).toBe(result.taskErrors[row.id].slots);
    });

    it('BINDS: three named people are on one shift, lead-first, with hours counted', () => {
        const row = trioRow();
        row.hours = '8';
        const result = build({
            hoursInputs: { weeklyHours: '42', maxHoursPerDay: '' },
            staffRows: TRIO_STAFF,
            taskRows: [row],
        });
        expect(result.config.tasks[0].hours).toBe(8);

        const run = generateRosterV2(result.config);
        expect(run.ok).toBe(true);
        expect(run.score.hardViolations).toBe(0);
        expect(run.unfilled).toEqual([]);

        const monday = run.roster['2026-09-07'];
        expect(monday).toHaveLength(1);
        // THREE distinct people on one shift, which `leads`/`coLeads` could not say.
        expect(new Set(monday[0].assignees).size).toBe(3);
        expect(monday[0].assignees).toEqual(['Prin', 'Sen', 'Jun']);
        // The highest grade present is the accountable lead, and the second
        // assignee is the co-lead, so the display string still works.
        expect(monday[0].lead).toBe('Prin');
        expect(monday[0].coLead).toBe('Sen');
        expect(monday[0].staff).toBe('Lead: Prin, Co: Sen');
        // …and all three accrued the session's hours, not just the two named ones.
        for (const person of ['Prin', 'Sen', 'Jun']) {
            expect(run.load[person].hours).toBe(40);
        }
    });

    it('BINDS: a slot nobody can fill is reported by its own name, not as a role', () => {
        // The principal is on leave on the Monday, so the trio becomes a pair and
        // the third line is reported. `role` is the SLOT's label — which is what the
        // sandbox panel has to render, because "unknown duty" is what
        // `describeShiftRole` would say about it.
        const row = trioRow();
        const result = build({
            staffRows: [
                staff({ name: 'Prin', grade: 'AH16', skills: ['Witnessing'], away: '2026-09-07' }),
                staff({ name: 'Sen', grade: 'AH13', skills: ['Witnessing'] }),
                staff({ name: 'Jun', grade: 'AH8' }),
            ],
            taskRows: [row],
        });

        const run = generateRosterV2(result.config);
        expect(run.ok).toBe(true);
        const monday = run.unfilled.filter((slot) => slot.date === '2026-09-07');
        expect(monday).toHaveLength(1);
        expect(monday[0].role).toBe('principal slot');
        expect(monday[0].reason).toContain('on leave');
        // The rest of the trio was still staffed — a missing principal does not
        // cancel the shift.
        expect(run.roster['2026-09-07'][0].assignees).toEqual(['Sen', 'Jun']);
    });

    it('is pure: a slot-mode row and its slot list are not mutated or aliased', () => {
        const taskRows = [trioRow()];
        const before = JSON.stringify(taskRows);
        const result = build({ staffRows: TRIO_STAFF, taskRows });
        expect(JSON.stringify(taskRows)).toBe(before);

        result.config.tasks[0].slots.push({ band: 'junior' });
        expect(taskRows[0].slots).toHaveLength(3);
    });
});

// ─── 9. AN FTE, IN THE WORDS OF THE CONTRACT IT DESCRIBES ─────────────────────
//
// "0.6" is the number the engine weighs fairness with. It is not how anybody
// describes their own week — they work three days — and the roster is a promise
// between colleagues about their time, so the wizard and the load table say both.
//
// The load-bearing part is WHERE THE 3 COMES FROM. A hard-coded five-day week is
// wrong for every team that runs a Saturday, which is two of the teams this engine
// was built for; the figure is the department's own ticked days, and the answer
// follows it even when that makes the answer a decimal.

describe('countWorkingDays', () => {
    it('counts the DISTINCT weekdays across every task', () => {
        expect(countWorkingDays([
            { days: [1, 2, 3, 4, 5] },
            { days: [2, 4] },
        ])).toBe(5);
        expect(countWorkingDays([
            { days: [1, 2, 3, 4, 5] },
            { days: [6] },
        ])).toBe(6);
    });

    it('reads the wizard\'s own task rows, not a special shape', () => {
        // The same function serves the rows being typed and the config that was
        // generated, so the number under the FTE box and the number under the load
        // table cannot disagree.
        expect(countWorkingDays([createTaskRow(), createTaskRow({ days: [6] })])).toBe(6);
    });

    it('is 0 when the department has no week yet, and never throws', () => {
        expect(countWorkingDays([])).toBe(0);
        expect(countWorkingDays([{ days: [] }, {}])).toBe(0);
        expect(countWorkingDays(null)).toBe(0);
        // A monthly `recurrence` task carries no `days` — it contributes nothing
        // rather than breaking the caption.
        expect(countWorkingDays([{ recurrence: { ordinal: 1, weekday: 3 } }])).toBe(0);
    });

    it('ignores a day number that is not a weekday index', () => {
        expect(countWorkingDays([{ days: [1, 7, -1, 2.5, null, '3'] }])).toBe(1);
    });
});

describe('describeFteAsDays', () => {
    it('reads 0.6 of a five-day week as three days a week', () => {
        expect(describeFteAsDays(0.6, 5)).toBe('works 3 days a week');
        expect(describeFteAsDays(1.0, 5)).toBe('works 5 days a week');
        expect(describeFteAsDays(0.2, 5)).toBe('works 1 day a week');
    });

    it('follows the DEPARTMENT\'S week, not an assumed five days', () => {
        // A lab that runs Saturdays has a six-day week. Telling its 0.6 part-timer
        // they work three days would be half a day out, in the direction that gets
        // somebody rostered.
        expect(describeFteAsDays(0.6, 6)).toBe('works about 3.6 days a week');
        expect(describeFteAsDays(0.5, 6)).toBe('works 3 days a week');
        expect(describeFteAsDays(1.0, 7)).toBe('works 7 days a week');
    });

    it('says "about" for anything that is not a whole number of days', () => {
        expect(describeFteAsDays(0.7, 5)).toBe('works about 3.5 days a week');
        expect(describeFteAsDays(0.9, 5)).toBe('works about 4.5 days a week');
    });

    it('rounds to one decimal rather than to a whole day', () => {
        // 0.65 x 6 = 3.9. Rounding that to "4 days" would overstate the contract.
        expect(describeFteAsDays(0.65, 6)).toBe('works about 3.9 days a week');
    });

    it('says nothing at all when there is nothing honest to say', () => {
        expect(describeFteAsDays(0.6, 0)).toBe('');
        expect(describeFteAsDays(null, 5)).toBe('');
        expect(describeFteAsDays(0, 5)).toBe('');
        expect(describeFteAsDays(-1, 5)).toBe('');
        expect(describeFteAsDays(0.6, 2.5)).toBe('');
        expect(describeFteAsDays(0.6, null)).toBe('');
    });

    it('pairs with parseFteCell, so a BLANK box reads as full time', () => {
        // Blank means the engine's default FTE of 1.0 — the wizard's caption has
        // always said so — and the days line has to agree with that caption.
        expect(describeFteAsDays(parseFteCell('').value, 5)).toBe('works 5 days a week');
        // …and an unreadable box says nothing: the row's error line speaks instead.
        expect(parseFteCell('two days').value).toBeNull();
        expect(describeFteAsDays(parseFteCell('two days').value, 5)).toBe('');
    });
});
