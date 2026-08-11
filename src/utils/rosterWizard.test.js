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
 * Sections 10 to 14 add the NINE capabilities `ROSTER_QC_AUDIT_SURFACES.md` §3
 * enumerated as engine-only — continuity, monthly recurrence, quotas, forbidden
 * pairs, cohort windows, the two department caps, a person's own cap, and category —
 * and they are held to a harder standard than the eight above, because the audit
 * said so in as many words: "A test asserting the mapper emits a field is not proof
 * the feature works end to end."
 *
 * So every one of them is proved TWICE:
 *
 *   9.  THE CELL. Each parser accepts what the engine accepts, refuses what it
 *       refuses, and returns `null` — never a default — for a blank box. This is the
 *       part that keeps a typo from becoming somebody's ceiling.
 *  10.  THE ROSTER. A config built THROUGH `buildDemoRosterV2ConfigFromTables` (never
 *       hand-written) is fed to `generateRosterV2` twice, with the control off and
 *       on, and the two rosters are compared. If the field arrives and changes
 *       nothing, the test fails.
 *
 * And the blank-means-blank property gets its own section, because two of these
 * fields switch a whole engine model on by being MENTIONED: a `windows` key bounds
 * everybody's eligibility in time, and a `quota` compiles a floor or a ceiling. A
 * helpfully-emitted empty list would change the roster of every department that has
 * never heard of rotations.
 *
 * No DOM, no mocks, no Firestore: the module under test is pure and imports only
 * the engine's read-only exports.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
    ANY_BAND,
    BAND_NAMES,
    EMPTY_RULES_INPUTS,
    HOURS_IN_A_DAY,
    HOURS_IN_A_WEEK,
    QUOTA_CEILING_UNFILLED_MARKER,
    QUOTA_FLOOR_WARNING_PREFIX,
    QUOTA_PERIOD_OPTIONS,
    RECURRENCE_LAST,
    RECURRENCE_ORDINAL_OPTIONS,
    SLOTS_MIN,
    SLOTS_MAX,
    TASK_CALENDAR_MODES,
    TASK_CALENDAR_MONTHLY,
    TASK_CALENDAR_WEEKLY,
    WEEKDAY_STRIP,
    WINDOW_UNFILLED_MARKER,
    createStaffWindow,
    describeTaskRecurrence,
    parseConcurrentPerDayCell,
    parseConsecutiveDaysCell,
    parseForbidPairs,
    parseMaxPerDayCell,
    parseStaffWindows,
    parseTaskQuota,
    parseTaskRecurrence,
    partitionDemoWarnings,
    summariseUnfilledCauses,
    toRecurrenceOrdinal,
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
    QUOTA_PERIODS,
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

// ─── 10. THE ORDINAL LIST, PINNED BY MEASUREMENT RATHER THAN BY IMPORT ────────
//
// `RECURRENCE_ORDINALS` is module-private in `rosterEngineV2.js` and the engine is
// not editable this phase, so `RECURRENCE_ORDINAL_OPTIONS` is a SECOND DEFINITION of
// which ordinals exist. A second definition that nothing checks is how a wizard
// starts offering a value the engine refuses (or hiding one it would accept), so this
// section asks the ENGINE'S OWN VALIDATOR about every option and about four values
// that must not be options.
//
// This is the only honest substitute for an import, and it fails loudly if the
// engine's list ever moves.

describe('the monthly ordinals the wizard offers', () => {
    const probe = (ordinal) => validateRosterV2Config({
        startDate: '2026-09-07',
        weeks: 4,
        staff: [{ name: 'Ada' }],
        tasks: [{ name: 'Clinic', recurrence: { ordinal, weekday: 3 } }],
    });

    it('offers exactly the ordinals the ENGINE accepts', () => {
        for (const option of RECURRENCE_ORDINAL_OPTIONS) {
            const ordinal = toRecurrenceOrdinal(option.value);
            expect(ordinal).not.toBeNull();
            const check = probe(ordinal);
            expect(check.valid, `${option.label} (${JSON.stringify(ordinal)}) should be accepted`).toBe(true);
        }
    });

    it('offers none of the ordinals the engine REFUSES', () => {
        // 5 is the important one: most months hold four of a weekday, so a
        // "5th Wednesday" clinic would silently vanish in most months. `'last'` is
        // the question departments actually ask, and it IS offered.
        for (const bad of [5, 0, -1, 'first']) {
            expect(probe(bad).valid, `${JSON.stringify(bad)} should be refused`).toBe(false);
            expect(RECURRENCE_ORDINAL_OPTIONS.some((option) => option.value === String(bad))).toBe(false);
        }
    });

    it('reads a select value back as the engine\'s own ordinal type', () => {
        // `'3'` from the DOM becomes the number 3; `'last'` stays a string. Getting
        // this wrong would send `'3'` to a validator that compares with `includes`.
        expect(toRecurrenceOrdinal('3')).toBe(3);
        expect(toRecurrenceOrdinal(' 4 ')).toBe(4);
        expect(toRecurrenceOrdinal(RECURRENCE_LAST)).toBe(RECURRENCE_LAST);
        expect(toRecurrenceOrdinal('')).toBeNull();
        expect(toRecurrenceOrdinal('5')).toBeNull();
        expect(toRecurrenceOrdinal(undefined)).toBeNull();
    });

    it('names the two calendar modes, and a fresh row is in one of them', () => {
        // The two modes are mutually exclusive in the engine (`days` beside
        // `recurrence` is a refusal), so "which mode is this row in" must always have
        // exactly one answer — including for a row seeded from a fixture.
        expect(TASK_CALENDAR_MODES).toEqual([TASK_CALENDAR_WEEKLY, TASK_CALENDAR_MONTHLY]);
        expect(TASK_CALENDAR_MODES).toContain(createTaskRow().calendarMode);
        expect(createTaskRow().calendarMode).toBe(TASK_CALENDAR_WEEKLY);
        expect(createTaskRow({ recurrence: { ordinal: 3, weekday: 3 } }).calendarMode).toBe(TASK_CALENDAR_MONTHLY);
        expect(createTaskRow({ recurrence: { ordinal: 3, weekday: 3 } }).recurrenceOrdinal).toBe('3');
        expect(createTaskRow({ recurrence: { ordinal: 3, weekday: 3 } }).recurrenceWeekday).toBe('3');
    });

    it('offers only quota periods the engine names, spelled its way', () => {
        for (const option of QUOTA_PERIOD_OPTIONS) {
            expect(Object.values(QUOTA_PERIODS)).toContain(option.value);
        }
        // `run` is a real engine period the wizard deliberately does not offer — a
        // UI range, like SLOTS_MIN/SLOTS_MAX, recorded rather than assumed.
        expect(QUOTA_PERIOD_OPTIONS.map((option) => option.value)).toEqual(['week', 'month']);
    });
});

// ─── 11. THE NINE NEW CELLS ───────────────────────────────────────────────────
//
// Same contract as `parseFteCell` throughout: blank is `null`, out-of-range is
// REFUSED and never clamped, and the reason quotes what could not be read.

describe('the count cells (a person\'s cap, and the two department caps)', () => {
    it('treats blank as "no figure stated", which is the engine\'s default', () => {
        for (const parse of [parseMaxPerDayCell, parseConcurrentPerDayCell, parseConsecutiveDaysCell]) {
            expect(parse('')).toMatchObject({ ok: true, value: null });
            expect(parse('   ')).toMatchObject({ ok: true, value: null });
            expect(parse(undefined)).toMatchObject({ ok: true, value: null });
        }
    });

    it('accepts a whole number of at least 1, which is exactly the engine\'s rule', () => {
        expect(parseMaxPerDayCell('1')).toMatchObject({ ok: true, value: 1 });
        expect(parseMaxPerDayCell(' 3 ')).toMatchObject({ ok: true, value: 3 });
        // No artificial upper bound: the engine has none, and inventing one here
        // would refuse a configuration `validateRosterV2Config` would accept.
        expect(parseConsecutiveDaysCell('365')).toMatchObject({ ok: true, value: 365 });
    });

    it('refuses 0, a fraction and a word rather than rounding any of them', () => {
        for (const parse of [parseMaxPerDayCell, parseConcurrentPerDayCell, parseConsecutiveDaysCell]) {
            expect(parse('0').ok).toBe(false);
            expect(parse('-2').ok).toBe(false);
            expect(parse('1.5').ok).toBe(false);
            expect(parse('two').ok).toBe(false);
            expect(parse('two').reason).toMatch(/not a number/i);
        }
        // …and each says what clearing the box would do instead, which differs.
        expect(parseMaxPerDayCell('0').reason).toMatch(/department's figure/i);
        expect(parseConcurrentPerDayCell('0').reason).toContain(String(ROSTER_V2_DEFAULTS.maxConcurrentPerDay));
        expect(parseConsecutiveDaysCell('0').reason).toContain(String(ROSTER_V2_DEFAULTS.maxConsecutiveDays));
    });
});

describe('the monthly recurrence cells', () => {
    const weekly = () => createTaskRow({ name: 'Clinic' });
    const monthly = (patch = {}) => ({ ...weekly(), calendarMode: TASK_CALENDAR_MONTHLY, ...patch });

    it('is null for a weekly task, so the mapper emits days exactly as before', () => {
        expect(parseTaskRecurrence(weekly())).toMatchObject({ ok: true, recurrence: null });
        expect(parseTaskRecurrence({})).toMatchObject({ ok: true, recurrence: null });
    });

    it('reads the 3rd Wednesday as the engine\'s own shape', () => {
        expect(parseTaskRecurrence(monthly({ recurrenceOrdinal: '3', recurrenceWeekday: '3' })))
            .toMatchObject({ ok: true, recurrence: { ordinal: 3, weekday: 3 } });
        expect(parseTaskRecurrence(monthly({ recurrenceOrdinal: RECURRENCE_LAST, recurrenceWeekday: '5' })))
            .toMatchObject({ ok: true, recurrence: { ordinal: RECURRENCE_LAST, weekday: 5 } });
        // Sunday is 0, and 0 must not be read as "nothing chosen".
        expect(parseTaskRecurrence(monthly({ recurrenceOrdinal: '1', recurrenceWeekday: '0' })))
            .toMatchObject({ ok: true, recurrence: { ordinal: 1, weekday: 0 } });
    });

    it('REFUSES a half-chosen monthly pattern rather than picking a date for you', () => {
        // The whole point: there is no engine default for "which Wednesday", so
        // defaulting to the 1st would put a clinic on a date nobody chose.
        const neither = parseTaskRecurrence(monthly());
        expect(neither.ok).toBe(false);
        expect(neither.reason).toMatch(/no week of the month and no weekday/i);

        const noOrdinal = parseTaskRecurrence(monthly({ recurrenceWeekday: '3' }));
        expect(noOrdinal.ok).toBe(false);
        expect(noOrdinal.reason).toMatch(/no week of the month/i);
        expect(noOrdinal.reason).toContain('Wed');

        const noWeekday = parseTaskRecurrence(monthly({ recurrenceOrdinal: '3' }));
        expect(noWeekday.ok).toBe(false);
        expect(noWeekday.reason).toMatch(/no weekday/i);
        expect(noWeekday.reason).toContain('3rd');
    });

    it('refuses a weekday that is not a weekday, and an ordinal off the list', () => {
        expect(parseTaskRecurrence(monthly({ recurrenceOrdinal: '3', recurrenceWeekday: '7' })).ok).toBe(false);
        expect(parseTaskRecurrence(monthly({ recurrenceOrdinal: '5', recurrenceWeekday: '3' })).ok).toBe(false);
    });

    it('describes a complete pattern in the words the row and the drawer share', () => {
        expect(describeTaskRecurrence(monthly({ recurrenceOrdinal: '3', recurrenceWeekday: '3' })))
            .toBe('the 3rd Wed of each month');
        expect(describeTaskRecurrence(monthly({ recurrenceOrdinal: RECURRENCE_LAST, recurrenceWeekday: '5' })))
            .toBe('the last Fri of each month');
        // …and says nothing at all while it is incomplete: the row's error line is
        // what speaks then, exactly as the FTE gloss does.
        expect(describeTaskRecurrence(monthly({ recurrenceOrdinal: '3' }))).toBe('');
        expect(describeTaskRecurrence(weekly())).toBe('');
    });
});

describe('the quota cells', () => {
    const row = (patch = {}) => ({ ...createTaskRow({ name: 'Saturday Bench' }), ...patch });

    it('is null while all three cells are blank — no key, no model switched on', () => {
        expect(parseTaskQuota(row())).toMatchObject({ ok: true, quota: null });
        expect(parseTaskQuota({})).toMatchObject({ ok: true, quota: null });
    });

    it('reads a floor, a ceiling, or both', () => {
        expect(parseTaskQuota(row({ quotaPer: 'month', quotaMin: '2' })))
            .toMatchObject({ ok: true, quota: { per: 'month', min: 2 } });
        expect(parseTaskQuota(row({ quotaPer: 'week', quotaMax: '1' })))
            .toMatchObject({ ok: true, quota: { per: 'week', max: 1 } });
        expect(parseTaskQuota(row({ quotaPer: 'month', quotaMin: '2', quotaMax: '4' })))
            .toMatchObject({ ok: true, quota: { per: 'month', min: 2, max: 4 } });
        // An absent bound is ABSENT, not 0 — 0 is a real ceiling the engine refuses.
        expect(Object.keys(parseTaskQuota(row({ quotaPer: 'month', quotaMin: '2' })).quota)).toEqual(['per', 'min']);
    });

    it('refuses a number with no period, naming what was typed', () => {
        const bare = parseTaskQuota(row({ quotaMin: '2' }));
        expect(bare.ok).toBe(false);
        expect(bare.reason).toContain('at least 2');
        expect(bare.reason).toMatch(/no period/i);
        // Silently adopting the engine's own default period (`run`) would put a
        // floor on a window whose length is however many weeks somebody generated.
        expect(bare.reason).toMatch(/per week or per calendar month/i);
    });

    it('refuses a period with no numbers, because it asks for nothing', () => {
        const empty = parseTaskQuota(row({ quotaPer: 'month' }));
        expect(empty.ok).toBe(false);
        expect(empty.reason).toMatch(/neither a minimum nor a maximum/i);
    });

    it('refuses 0, a fraction, a word, and a floor above a ceiling', () => {
        expect(parseTaskQuota(row({ quotaPer: 'month', quotaMin: '0' })).reason).toMatch(/met by doing nothing/i);
        expect(parseTaskQuota(row({ quotaPer: 'month', quotaMax: '0' })).reason).toMatch(/never be staffed/i);
        expect(parseTaskQuota(row({ quotaPer: 'month', quotaMin: '1.5' })).ok).toBe(false);
        expect(parseTaskQuota(row({ quotaPer: 'month', quotaMax: 'lots' })).reason).toMatch(/not a number/i);
        const inverted = parseTaskQuota(row({ quotaPer: 'month', quotaMin: '4', quotaMax: '2' }));
        expect(inverted.ok).toBe(false);
        expect(inverted.reason).toMatch(/floor above a ceiling/i);
    });

    it('refuses a period the wizard cannot display, rather than mapping it', () => {
        // Only reachable from a fixture. A control holding a value it cannot show is
        // a cell that silently lies, so it is refused with the offered list named.
        const fromFixture = parseTaskQuota(row({ quotaPer: 'run', quotaMin: '2' }));
        expect(fromFixture.ok).toBe(false);
        expect(fromFixture.reason).toContain('"run"');
    });
});

describe('the availability window rows', () => {
    it('is an empty list while nobody has added one', () => {
        expect(parseStaffWindows([])).toMatchObject({ ok: true, windows: [], taskNames: [] });
        expect(parseStaffWindows(undefined)).toMatchObject({ ok: true, windows: [] });
    });

    it('reads a date range, either end optional', () => {
        expect(parseStaffWindows([createStaffWindow({ from: '2026-09-01', to: '2026-12-31' })]).windows)
            .toEqual([{ from: '2026-09-01', to: '2026-12-31' }]);
        expect(parseStaffWindows([createStaffWindow({ from: '2026-09-01' })]).windows)
            .toEqual([{ from: '2026-09-01' }]);
        expect(parseStaffWindows([createStaffWindow({ to: '2026-03-31' })]).windows)
            .toEqual([{ to: '2026-03-31' }]);
    });

    it('reads a comma-separated task list, trimmed and de-duplicated', () => {
        const parsed = parseStaffWindows([
            createStaffWindow({ from: '2026-09-01', tasks: ' Ward Round , EFT Clinic ,, Ward Round ' }),
        ]);
        expect(parsed.windows).toEqual([{ from: '2026-09-01', tasks: ['Ward Round', 'EFT Clinic'] }]);
        expect(parsed.taskNames).toEqual(['Ward Round', 'EFT Clinic', 'Ward Round']);
    });

    it('REFUSES an empty window, because in a list it cancels every other one', () => {
        const empty = parseStaffWindows([
            createStaffWindow({ from: '2026-09-01', to: '2026-09-30' }),
            createStaffWindow(),
        ]);
        expect(empty.ok).toBe(false);
        expect(empty.reason).toMatch(/window 2 is empty/i);
        expect(empty.reason).toMatch(/cancels every other window/i);
        // Nothing partial survives a refusal: the first window is not kept.
        expect(empty.windows).toEqual([]);
    });

    it('refuses an unreadable date and a backwards range, quoting the offender', () => {
        const bad = parseStaffWindows([createStaffWindow({ from: '1 Sept' })]);
        expect(bad.ok).toBe(false);
        expect(bad.reason).toContain('"1 Sept"');
        // The engine's own calendar check, so 30 February is refused here too.
        expect(parseStaffWindows([createStaffWindow({ from: '2026-02-30' })]).ok).toBe(false);
        expect(parseStaffWindows([createStaffWindow({ from: '2026-9-7' })]).ok).toBe(false);

        const backwards = parseStaffWindows([createStaffWindow({ from: '2026-12-31', to: '2026-09-01' })]);
        expect(backwards.ok).toBe(false);
        expect(backwards.reason).toMatch(/ends before it starts/i);
    });
});

describe('the forbidden-pair list', () => {
    it('is empty by default and passes a well-formed pair through', () => {
        expect(parseForbidPairs([])).toMatchObject({ ok: true, pairs: [] });
        expect(parseForbidPairs(undefined)).toMatchObject({ ok: true, pairs: [] });
        expect(parseForbidPairs([['Ada', 'Ben']]).pairs).toEqual([['Ada', 'Ben']]);
    });

    it('refuses a half-picked pair, a self-pair and a duplicate', () => {
        expect(parseForbidPairs([['Ada', '']]).reason).toMatch(/needs two names/i);
        expect(parseForbidPairs([['Ada']]).reason).toMatch(/needs two names/i);
        expect(parseForbidPairs([['Ada', 'Ada']]).reason).toMatch(/with themselves/i);
        // A pair is unordered, so [b, a] is the same rule said twice.
        expect(parseForbidPairs([['Ada', 'Ben'], ['Ben', 'Ada']]).reason).toMatch(/listed twice/i);
    });
});

// ─── 12. THE MAPPING OF ALL NINE, AND BLANK MEANS BLANK ───────────────────────

describe('blank means blank, for every one of the nine new controls', () => {
    it('emits not one new key when nothing has been touched', () => {
        const result = build({
            staffRows: [staff({ name: 'Ada' })],
            taskRows: [task({ name: 'Clinic' })],
            rulesInputs: EMPTY_RULES_INPUTS(),
        });
        expect(result.ok).toBe(true);
        // The whole config, exactly — the assertion that would fail if any of the
        // nine leaked a default. `windows: []` and `quota: {}` would both switch a
        // model on for a department that never asked for one.
        expect(result.config).toEqual({
            startDate: '2026-09-07',
            weeks: 1,
            staff: [{ name: 'Ada', fte: 1, skills: [], unavailable: [] }],
            tasks: [{ name: 'Clinic', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1 }],
            rules: { bands: { junior: [7, 12], senior: [13, 14], principal: [15, 17] } },
        });
        expect(result.rulesErrors).toEqual({});
    });

    it('behaves identically when rulesInputs is not passed at all', () => {
        // `RosterView` always passes it; a caller (or a test) that does not must get
        // the same config rather than a crash or a defaulted policy.
        const withEmpty = build({ staffRows: [staff({ name: 'Ada' })], taskRows: [task({ name: 'Clinic' })], rulesInputs: EMPTY_RULES_INPUTS() });
        const without = build({ staffRows: [staff({ name: 'Ada' })], taskRows: [task({ name: 'Clinic' })] });
        expect(JSON.stringify(without.config)).toBe(JSON.stringify(withEmpty.config));
    });

    it('emits continuity only when it is TRUE, never as false', () => {
        const off = build({ staffRows: [staff({ name: 'Ada' })], taskRows: [{ ...task({ name: 'Clinic' }), continuity: false }] });
        expect('continuity' in off.config.tasks[0]).toBe(false);
        const on = build({ staffRows: [staff({ name: 'Ada' })], taskRows: [{ ...task({ name: 'Clinic' }), continuity: true }] });
        expect(on.config.tasks[0].continuity).toBe(true);
    });

    it('drops continuity in slot mode, because the engine refuses the pair', () => {
        const row = { ...slotTask({ name: 'Trio' }, [{}, {}, {}]), continuity: true };
        const result = build({
            staffRows: [staff({ name: 'Ada' }), staff({ name: 'Ben' }), staff({ name: 'Cara' })],
            taskRows: [row],
        });
        expect(result.ok).toBe(true);
        expect('continuity' in result.config.tasks[0]).toBe(false);
        expect(result.config.tasks[0].slots).toHaveLength(3);
        // MEASURED, not assumed: the combination really is a refusal.
        expect(validateRosterV2Config({
            ...result.config,
            tasks: [{ ...result.config.tasks[0], continuity: true }],
        }).valid).toBe(false);
        // …and what the mapper actually emitted is accepted.
        expect(validateRosterV2Config(result.config).valid).toBe(true);
    });

    it('emits recurrence INSTEAD of days, never both', () => {
        const row = { ...task({ name: 'ADHD Clinic', days: [1, 3] }), calendarMode: TASK_CALENDAR_MONTHLY, recurrenceOrdinal: '3', recurrenceWeekday: '3' };
        const result = build({ staffRows: [staff({ name: 'Ada' })], taskRows: [row] });
        expect(result.config.tasks[0].recurrence).toEqual({ ordinal: 3, weekday: 3 });
        expect('days' in result.config.tasks[0]).toBe(false);
        expect(validateRosterV2Config(result.config).valid).toBe(true);
        // MEASURED: the engine really does refuse the combination the mapper avoids.
        expect(validateRosterV2Config({
            ...result.config,
            tasks: [{ ...result.config.tasks[0], days: [1, 3] }],
        }).valid).toBe(false);
    });

    it('does not ask a monthly row about its ticked weekdays, and keeps them', () => {
        // A monthly task with NO days ticked is legal — `days` is not part of what
        // the row means any more — and the ticks survive so switching back restores
        // them. Both halves matter: the first is a refusal that must not fire, the
        // second is data that must not be lost.
        const row = { ...task({ name: 'Clinic', days: [] }), calendarMode: TASK_CALENDAR_MONTHLY, recurrenceOrdinal: '1', recurrenceWeekday: '2' };
        const monthly = build({ staffRows: [staff({ name: 'Ada' })], taskRows: [row] });
        expect(monthly.ok).toBe(true);
        expect(monthly.taskErrors[row.id]).toBeUndefined();

        const backToWeekly = build({
            staffRows: [staff({ name: 'Ada' })],
            taskRows: [{ ...row, calendarMode: TASK_CALENDAR_WEEKLY, days: [1, 3] }],
        });
        expect(backToWeekly.config.tasks[0].days).toEqual([1, 3]);
        expect('recurrence' in backToWeekly.config.tasks[0]).toBe(false);
    });

    it('reports a half-chosen monthly pattern per row, and blocks', () => {
        const row = { ...task({ name: 'Clinic' }), calendarMode: TASK_CALENDAR_MONTHLY, recurrenceOrdinal: '3' };
        const result = build({ staffRows: [staff({ name: 'Ada' })], taskRows: [row] });
        expect(result.ok).toBe(false);
        expect(result.config).toBeNull();
        expect(result.taskErrors[row.id].recurrence).toContain('Clinic');
        expect(result.reason).toBe(result.taskErrors[row.id].recurrence);
    });

    it('attaches a quota, a category and a cap to the RIGHT row', () => {
        const result = build({
            staffRows: [
                { ...staff({ name: 'Ada' }), maxPerDay: '1' },
                staff({ name: 'Ben' }),
            ],
            taskRows: [
                { ...task({ name: 'Saturday Bench', days: [6] }), quotaPer: 'month', quotaMax: '2', category: ' WEEKEND ' },
                task({ name: 'Ward Round', days: [1] }),
            ],
        });
        expect(result.ok).toBe(true);
        expect(result.config.staff[0].maxPerDay).toBe(1);
        expect('maxPerDay' in result.config.staff[1]).toBe(false);
        expect(result.config.tasks[0]).toMatchObject({ quota: { per: 'month', max: 2 }, category: 'WEEKEND' });
        expect('quota' in result.config.tasks[1]).toBe(false);
        expect('category' in result.config.tasks[1]).toBe(false);
        expect(validateRosterV2Config(result.config).valid).toBe(true);
    });

    it('attaches windows to the RIGHT person, in the engine\'s own shape', () => {
        const result = build({
            staffRows: [
                { ...staff({ name: 'Ada' }), windows: [createStaffWindow({ from: '2026-09-01', to: '2026-12-31' })] },
                staff({ name: 'Ben' }),
            ],
            taskRows: [task({ name: 'Clinic' })],
        });
        expect(result.config.staff[0].windows).toEqual([{ from: '2026-09-01', to: '2026-12-31' }]);
        expect('windows' in result.config.staff[1]).toBe(false);
        expect(validateRosterV2Config(result.config).valid).toBe(true);
    });

    it('maps the two department caps and the pair list into rules', () => {
        const result = build({
            staffRows: [staff({ name: 'Ada' }), staff({ name: 'Ben' })],
            taskRows: [task({ name: 'Clinic' })],
            rulesInputs: { maxConcurrentPerDay: '1', maxConsecutiveDays: '3', forbidPairs: [['Ada', 'Ben']] },
        });
        expect(result.ok).toBe(true);
        expect(result.config.rules).toMatchObject({
            maxConcurrentPerDay: 1,
            maxConsecutiveDays: 3,
            forbidPairs: [['Ada', 'Ben']],
        });
        expect(validateRosterV2Config(result.config).valid).toBe(true);
    });

    it('lets the limits panel win over anything extraRules carried', () => {
        // The same rule `bands` and the two hours boxes follow: one value, one
        // source, and the source is the control the visitor can see.
        const result = build({
            staffRows: [staff({ name: 'Ada' })],
            taskRows: [task({ name: 'Clinic' })],
            extraRules: { maxConcurrentPerDay: 9, maxConsecutiveDays: 9 },
            rulesInputs: { maxConcurrentPerDay: '2', maxConsecutiveDays: '4', forbidPairs: [] },
        });
        expect(result.config.rules.maxConcurrentPerDay).toBe(2);
        expect(result.config.rules.maxConsecutiveDays).toBe(4);
    });

    it('reports each department-limit box against itself, and blocks', () => {
        const result = build({
            staffRows: [staff({ name: 'Ada' })],
            taskRows: [task({ name: 'Clinic' })],
            rulesInputs: { maxConcurrentPerDay: '0', maxConsecutiveDays: 'six', forbidPairs: [] },
        });
        expect(result.ok).toBe(false);
        expect(result.rulesErrors.maxConcurrentPerDay).toMatch(/at least 1/i);
        expect(result.rulesErrors.maxConsecutiveDays).toMatch(/not a number/i);
        expect(result.reason).toBe(result.rulesErrors.maxConcurrentPerDay);
    });

    it('names a forbidden pair who is not in the staff table', () => {
        const result = build({
            staffRows: [staff({ name: 'Ada' }), staff({ name: 'Ben' })],
            taskRows: [task({ name: 'Clinic' })],
            rulesInputs: { ...EMPTY_RULES_INPUTS(), forbidPairs: [['Ada', 'Nobody']] },
        });
        expect(result.ok).toBe(false);
        expect(result.rulesErrors.forbidPairs).toContain('Nobody');
        expect(result.reason).toBe(result.rulesErrors.forbidPairs);
    });

    it('names a window whose task does not exist', () => {
        const row = { ...staff({ name: 'Ben' }), windows: [createStaffWindow({ from: '2026-09-07', tasks: 'Wardd Round' })] };
        const result = build({
            staffRows: [staff({ name: 'Ada' }), row],
            taskRows: [task({ name: 'Ward Round' })],
        });
        expect(result.ok).toBe(false);
        expect(result.staffErrors[row.id].windows).toContain('"Wardd Round"');
        expect(result.reason).toBe(result.staffErrors[row.id].windows);
    });

    it('does NOT blame a pair or a window for a mistake in another table', () => {
        // THE ORDERING PROPERTY. A staff row dropped for an unreadable FTE leaves a
        // name missing from the pool, and a task row dropped for having no days
        // leaves a name missing from the task list. Reporting "Ben is not in the
        // staff table" or "no task is called Clinic" in those states would point the
        // visitor at the wrong control entirely.
        const dirtyStaff = build({
            staffRows: [staff({ name: 'Ada' }), staff({ name: 'Ben', fte: '9' })],
            taskRows: [task({ name: 'Clinic' })],
            rulesInputs: { ...EMPTY_RULES_INPUTS(), forbidPairs: [['Ada', 'Ben']] },
        });
        expect(dirtyStaff.ok).toBe(false);
        expect(dirtyStaff.reason).toMatch(/^Ben: FTE 9/);
        expect(dirtyStaff.rulesErrors.forbidPairs).toBeUndefined();

        const windowRow = { ...staff({ name: 'Ben' }), windows: [createStaffWindow({ from: '2026-09-07', tasks: 'Clinic' })] };
        const dirtyTasks = build({
            staffRows: [staff({ name: 'Ada' }), windowRow],
            taskRows: [task({ name: 'Clinic', days: [] })],
        });
        expect(dirtyTasks.ok).toBe(false);
        expect(dirtyTasks.reason).toMatch(/no days ticked/i);
        expect(dirtyTasks.staffErrors[windowRow.id]).toBeUndefined();
    });

    it('reports a nameless row that carries a hidden cap or window', () => {
        // The drawer can hold content on a row with no name, and it would otherwise
        // vanish without a word — which is what the name check has always been for.
        const capOnly = { ...staff({ name: '' }), maxPerDay: '2' };
        const capResult = build({ staffRows: [capOnly], taskRows: [task({ name: 'Clinic' })] });
        expect(capResult.staffErrors[capOnly.id].name).toMatch(/add a name/i);

        const windowOnly = { ...staff({ name: '' }), windows: [createStaffWindow({ from: '2026-09-07' })] };
        const windowResult = build({ staffRows: [windowOnly], taskRows: [task({ name: 'Clinic' })] });
        expect(windowResult.staffErrors[windowOnly.id].name).toMatch(/add a name/i);
    });

    it('is pure: the new rows and lists are neither mutated nor aliased', () => {
        const staffRows = [{ ...staff({ name: 'Ada' }), maxPerDay: '2', windows: [createStaffWindow({ from: '2026-09-07' })] }];
        const taskRows = [{ ...task({ name: 'Clinic' }), quotaPer: 'week', quotaMin: '1', category: 'CLIN' }];
        const rulesInputs = { maxConcurrentPerDay: '2', maxConsecutiveDays: '4', forbidPairs: [['Ada', 'Ada2']] };
        const staffRows2 = [...staffRows, staff({ name: 'Ada2' })];
        const before = JSON.stringify({ staffRows2, taskRows, rulesInputs });

        const result = build({ staffRows: staffRows2, taskRows, rulesInputs });
        expect(result.ok).toBe(true);
        expect(JSON.stringify({ staffRows2, taskRows, rulesInputs })).toBe(before);

        result.config.rules.forbidPairs[0].push('Cara');
        result.config.staff[0].windows.push({ from: '2027-01-01' });
        expect(rulesInputs.forbidPairs[0]).toEqual(['Ada', 'Ada2']);
        expect(staffRows2[0].windows).toHaveLength(1);
    });
});

// ─── 13. REACHABILITY: EVERY ONE OF THEM CHANGES THE ROSTER ───────────────────
//
// THE STANDARD THE AUDIT SET, applied to all nine: a config built THROUGH the mapper
// (never hand-written), fed to `generateRosterV2` twice — control off, control on —
// and the two rosters compared. A field that arrives and changes nothing is a field
// that is not wired, and these tests fail in that case rather than passing on the
// strength of a `toMatchObject`.
//
// `score.hardViolations` is checked on every run that produces a roster, because it
// is measured by re-auditing the finished roster: 0 is the engine confirming that the
// constraint the wizard just set was actually honoured, not asserted.

describe('reachability: the mapper -> the engine -> a different roster', () => {
    const runFrom = (result) => {
        expect(result.ok, result.reason || 'mapper refused').toBe(true);
        const check = validateRosterV2Config(result.config);
        expect(check.valid, check.reason || 'engine refused').toBe(true);
        return generateRosterV2(result.config);
    };
    const leadsOf = (out, taskName) => Object.keys(out.roster).sort()
        .flatMap((date) => out.roster[date].filter((shift) => shift.task === taskName).map((shift) => shift.lead));

    it('CONTINUITY keeps one lead across every occurrence, and rotation does not', () => {
        const staffRows = [staff({ name: 'Ada' }), staff({ name: 'Ben' }), staff({ name: 'Cara' })];
        const rows = (continuity) => [
            { ...task({ name: 'Group Therapy', days: [3], coLeads: 0 }), continuity },
            task({ name: 'Ward Round', days: [1, 2, 3, 4, 5], coLeads: 0 }),
        ];
        const off = runFrom(build({ weeks: 4, staffRows, taskRows: rows(false) }));
        const on = runFrom(build({ weeks: 4, staffRows, taskRows: rows(true) }));

        expect(new Set(leadsOf(off, 'Group Therapy')).size).toBeGreaterThan(1);
        expect(new Set(leadsOf(on, 'Group Therapy')).size).toBe(1);
        expect(leadsOf(on, 'Group Therapy')).toHaveLength(4);
        expect(JSON.stringify(off.roster)).not.toBe(JSON.stringify(on.roster));
        // The engine counts what it did, and the run is clean.
        expect(on.score.breakdown.continuityBreaks).toBe(0);
        expect(on.score.hardViolations).toBe(0);
        // …and it is a PREFERENCE: `off` has no continuity component at all.
        expect('continuityBreaks' in off.score.breakdown).toBe(false);
    });

    it('MONTHLY RECURRENCE runs the clinic once a month, not once a week', () => {
        const staffRows = [staff({ name: 'Ada' }), staff({ name: 'Ben' })];
        const weeklyRow = task({ name: 'ADHD Clinic', days: [3], coLeads: 0 });
        const weekly = runFrom(build({ weeks: 4, staffRows, taskRows: [weeklyRow] }));
        const monthly = runFrom(build({
            weeks: 4,
            staffRows,
            taskRows: [{ ...weeklyRow, calendarMode: TASK_CALENDAR_MONTHLY, recurrenceOrdinal: '3', recurrenceWeekday: '3' }],
        }));

        // Four Wednesdays in the run; the 3rd Wednesday of September is the 16th.
        expect(Object.keys(weekly.roster).sort()).toEqual(['2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30']);
        expect(Object.keys(monthly.roster)).toEqual(['2026-09-16']);
        expect(JSON.stringify(weekly.roster)).not.toBe(JSON.stringify(monthly.roster));
        expect(monthly.score.hardViolations).toBe(0);
    });

    it('A QUOTA CEILING refuses a slot and names the count, per calendar month', () => {
        const staffRows = [staff({ name: 'Ada' }), staff({ name: 'Ben' })];
        const bare = task({ name: 'Saturday Bench', days: [6], coLeads: 0 });
        const open = runFrom(build({ weeks: 4, staffRows, taskRows: [bare] }));
        const capped = runFrom(build({
            weeks: 4,
            staffRows,
            taskRows: [{ ...bare, quotaPer: 'month', quotaMax: '1' }],
        }));

        expect(open.unfilled).toEqual([]);
        expect(capped.unfilled).toHaveLength(1);
        expect(capped.unfilled[0].reason).toContain('quota ceiling of 1 Saturday Bench duty');
        expect(JSON.stringify(open.roster)).not.toBe(JSON.stringify(capped.roster));
        // A ceiling is HARD and it was honoured: nobody holds two in one month.
        expect(capped.score.hardViolations).toBe(0);
    });

    it('A QUOTA FLOOR is preferred, then reported unmet — never enforced', () => {
        // Three people, a duty needing two of them Mon-Fri, a floor of two a week,
        // and one colleague away for the whole of week 1. The floor is reachable and
        // still unmet, which is exactly the state the warning exists for.
        const result = build({
            weeks: 2,
            staffRows: [
                staff({ name: 'Ada' }),
                staff({ name: 'Ben' }),
                staff({ name: 'Cara', away: '2026-09-07, 2026-09-08, 2026-09-09, 2026-09-10, 2026-09-11' }),
            ],
            taskRows: [{ ...task({ name: 'Saturday Bench', days: [1, 2, 3, 4, 5] }), quotaPer: 'week', quotaMin: '2' }],
        });
        const out = runFrom(result);

        const floors = partitionDemoWarnings(out.warnings).quotaFloors;
        expect(floors).toHaveLength(1);
        expect(floors[0]).toContain('Cara');
        expect(floors[0]).toContain('0 of 2, 2 short');
        // NOT a violation: a floor cannot be met by inventing capacity, so the roster
        // is still clean and the shortfall is a warning.
        expect(out.score.hardViolations).toBe(0);
        expect(out.unfilled).toEqual([]);
    });

    it('AN IMPOSSIBLE QUOTA FLOOR is refused before generating, with the arithmetic', () => {
        const result = build({
            weeks: 4,
            staffRows: [staff({ name: 'Ada' }), staff({ name: 'Ben' })],
            taskRows: [{ ...task({ name: 'Saturday Bench', days: [6], coLeads: 0 }), quotaPer: 'week', quotaMin: '3' }],
        });
        // The MAPPER is happy — the cells are all readable — and the ENGINE refuses,
        // which is the division of labour this wizard is built on.
        expect(result.ok).toBe(true);
        const check = validateRosterV2Config(result.config);
        expect(check.valid).toBe(false);
        expect(check.reason).toContain('2 × 3 = 6 duties');
        expect(generateRosterV2(result.config).ok).toBe(false);
    });

    it('A FORBIDDEN PAIR stops two people sharing a shift', () => {
        const staffRows = [staff({ name: 'Ada' }), staff({ name: 'Ben' }), staff({ name: 'Cara' })];
        const taskRows = [task({ name: 'Clinic', days: [1, 2, 3, 4, 5] })];
        const together = (out) => Object.values(out.roster).flat()
            .filter((shift) => [shift.lead, shift.coLead].every((name) => name === 'Ada' || name === 'Ben'));

        const open = runFrom(build({ weeks: 2, staffRows, taskRows }));
        const kept = runFrom(build({
            weeks: 2,
            staffRows,
            taskRows,
            rulesInputs: { ...EMPTY_RULES_INPUTS(), forbidPairs: [['Ada', 'Ben']] },
        }));

        expect(together(open).length).toBeGreaterThan(0);
        expect(together(kept)).toEqual([]);
        expect(JSON.stringify(open.roster)).not.toBe(JSON.stringify(kept.roster));
        // …and it did not cost a single slot: the third colleague absorbed it.
        expect(kept.unfilled).toEqual([]);
        expect(kept.score.hardViolations).toBe(0);
    });

    it('AN AVAILABILITY WINDOW moves who is rostered, and names the gap when it bites', () => {
        const taskRows = [task({ name: 'Weekend Witnessing', days: [6], coLeads: 0 })];
        const open = runFrom(build({
            weeks: 4,
            staffRows: [staff({ name: 'Ada' }), staff({ name: 'Ben' })],
            taskRows,
        }));
        const blocked = runFrom(build({
            weeks: 4,
            staffRows: [
                { ...staff({ name: 'Ada' }), windows: [createStaffWindow({ from: '2026-09-07', to: '2026-09-20' })] },
                { ...staff({ name: 'Ben' }), windows: [createStaffWindow({ from: '2026-09-21', to: '2026-10-31' })] },
            ],
            taskRows,
        }));

        // Two four-week blocks: Ada takes the first two Saturdays, Ben the last two.
        expect(leadsOf(open, 'Weekend Witnessing')).toEqual(['Ada', 'Ben', 'Ada', 'Ben']);
        expect(leadsOf(blocked, 'Weekend Witnessing')).toEqual(['Ada', 'Ada', 'Ben', 'Ben']);
        expect(JSON.stringify(open.roster)).not.toBe(JSON.stringify(blocked.roster));
        expect(blocked.unfilled).toEqual([]);
        expect(blocked.score.hardViolations).toBe(0);

        // …and a window that does not reach the work leaves the slot UNFILLED with the
        // window named, rather than assigning somebody outside their block.
        const short = runFrom(build({
            weeks: 4,
            staffRows: ['Ada', 'Ben'].map((name) => ({
                ...staff({ name }),
                windows: [createStaffWindow({ from: '2026-09-07', to: '2026-09-13' })],
            })),
            taskRows,
        }));
        expect(short.unfilled).toHaveLength(3);
        expect(short.unfilled[0].reason).toContain('outside their cohort window');
        expect(short.score.hardViolations).toBe(0);
    });

    it('A WINDOW NAMING TASKS admits only those tasks, on no date at all otherwise', () => {
        // The union reading, end to end. Ben's only window names the Ward Round, so
        // he is on the Ward Round or on nothing — not "restricted on one task and
        // free on the rest", which is the reading somebody will expect.
        const out = runFrom(build({
            weeks: 4,
            staffRows: [
                staff({ name: 'Ada' }),
                { ...staff({ name: 'Ben' }), windows: [createStaffWindow({ from: '2026-09-07', to: '2026-12-31', tasks: 'Ward Round' })] },
            ],
            taskRows: [
                task({ name: 'Weekend Witnessing', days: [6], coLeads: 0 }),
                task({ name: 'Ward Round', days: [1], coLeads: 0 }),
            ],
        }));
        expect(leadsOf(out, 'Weekend Witnessing').every((name) => name === 'Ada')).toBe(true);
        expect(leadsOf(out, 'Ward Round')).toContain('Ben');
        expect(out.score.hardViolations).toBe(0);
    });

    it('THE DEPARTMENT DAILY CAP changes how much one person may hold', () => {
        const staffRows = [staff({ name: 'Ada' }), staff({ name: 'Ben' })];
        const taskRows = [1, 2, 3].map((n) => task({ name: `Clinic ${n}`, days: [1], coLeads: 0 }));
        const open = runFrom(build({ weeks: 1, staffRows, taskRows }));
        const capped = runFrom(build({
            weeks: 1,
            staffRows,
            taskRows,
            rulesInputs: { ...EMPTY_RULES_INPUTS(), maxConcurrentPerDay: '1' },
        }));

        // Default cap is 2, so two people cover three duties with one to spare.
        expect(open.unfilled).toEqual([]);
        // At one duty each, the third has nobody — and it is REPORTED, not squeezed in.
        expect(capped.unfilled).toHaveLength(1);
        expect(capped.unfilled[0].reason).toContain('at daily limit');
        expect(JSON.stringify(open.roster)).not.toBe(JSON.stringify(capped.roster));
        expect(capped.score.hardViolations).toBe(0);
    });

    it('A PERSON\'S OWN DAILY CAP overrides the department\'s, for them alone', () => {
        const taskRows = [1, 2, 3, 4].map((n) => task({ name: `Clinic ${n}`, days: [1], coLeads: 0 }));
        const out = runFrom(build({
            weeks: 1,
            staffRows: [{ ...staff({ name: 'Ada' }), maxPerDay: '1' }, staff({ name: 'Ben' })],
            taskRows,
        }));
        const dutiesOn = (name) => out.roster['2026-09-07'].filter((shift) => shift.lead === name).length;
        expect(dutiesOn('Ada')).toBe(1);
        expect(dutiesOn('Ben')).toBe(2);
        expect(out.unfilled).toHaveLength(1);
        expect(out.score.hardViolations).toBe(0);
    });

    it('THE CONSECUTIVE-DAY LIMIT stops a run of days and says which limit bound', () => {
        const staffRows = [staff({ name: 'Ada' })];
        const taskRows = [task({ name: 'Cover', days: [0, 1, 2, 3, 4, 5, 6], coLeads: 0 })];
        const open = runFrom(build({ weeks: 1, staffRows, taskRows }));
        const capped = runFrom(build({
            weeks: 1,
            staffRows,
            taskRows,
            rulesInputs: { ...EMPTY_RULES_INPUTS(), maxConsecutiveDays: '3' },
        }));

        // MEASURED, and the measurement is a genuine surprise worth pinning: the
        // limit is a RUN of days, and one day off RESETS it. So a cap of 3 does not
        // give three duties a week — it moves the rest day from the 7th day to the
        // 4th, and the clinician still works six of the seven days.
        expect(Object.keys(open.roster).sort())
            .toEqual(['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12']);
        expect(open.unfilled.map((slot) => slot.date)).toEqual(['2026-09-13']);
        expect(Object.keys(capped.roster).sort())
            .toEqual(['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-11', '2026-09-12', '2026-09-13']);
        expect(capped.unfilled.map((slot) => slot.date)).toEqual(['2026-09-10']);
        expect(capped.unfilled[0].reason).toContain('at the consecutive-day limit');
        expect(JSON.stringify(open.roster)).not.toBe(JSON.stringify(capped.roster));
        expect(capped.score.hardViolations).toBe(0);
    });

    it('A CATEGORY reaches every shift the task produces', () => {
        const staffRows = [staff({ name: 'Ada' })];
        const plain = runFrom(build({ weeks: 1, staffRows, taskRows: [task({ name: 'EFT Clinic', days: [1], coLeads: 0 })] }));
        const labelled = runFrom(build({
            weeks: 1,
            staffRows,
            taskRows: [{ ...task({ name: 'EFT Clinic', days: [1], coLeads: 0 }), category: 'VC' }],
        }));

        expect(plain.roster['2026-09-07'][0].category).toBe(ROSTER_V2_DEFAULTS.category);
        expect(labelled.roster['2026-09-07'][0].category).toBe('VC');
        expect(JSON.stringify(plain.roster)).not.toBe(JSON.stringify(labelled.roster));
    });
});

// ─── 14. THE RESULT PANEL'S READERS, PINNED AGAINST REAL ENGINE OUTPUT ────────
//
// `partitionDemoWarnings` and `summariseUnfilledCauses` read the ENGINE'S PROSE,
// because an `unfilled` entry carries no machine-readable rejection code. That is a
// real coupling, and the only honest way to hold it is to ask the classifier about a
// sentence the engine ACTUALLY produced rather than one typed into a test. If the
// engine ever rewords either phrase, these fail — which is the point.

describe('the result panel\'s classifiers', () => {
    it('recognises a quota-floor warning the ENGINE wrote, not one we typed', () => {
        const result = build({
            weeks: 2,
            staffRows: [
                staff({ name: 'Ada' }),
                staff({ name: 'Ben' }),
                staff({ name: 'Cara', away: '2026-09-07, 2026-09-08, 2026-09-09, 2026-09-10, 2026-09-11' }),
            ],
            taskRows: [{ ...task({ name: 'Saturday Bench', days: [1, 2, 3, 4, 5] }), quotaPer: 'week', quotaMin: '2' }],
        });
        const out = generateRosterV2(result.config);
        expect(out.ok).toBe(true);
        expect(out.warnings.length).toBeGreaterThan(0);

        const part = partitionDemoWarnings(out.warnings);
        expect(part.quotaFloors.length).toBe(1);
        expect(part.quotaFloors[0].startsWith(QUOTA_FLOOR_WARNING_PREFIX)).toBe(true);
        // A PARTITION: nothing falls out of it, which is the property that keeps the
        // panel from dropping a warning by classifying it.
        expect(part.quotaFloors.length + part.others.length).toBe(out.warnings.length);
        expect([...part.quotaFloors, ...part.others].sort()).toEqual([...out.warnings].sort());
    });

    it('recognises a window-blocked and a quota-blocked unfilled slot the ENGINE wrote', () => {
        const windowed = build({
            weeks: 4,
            staffRows: ['Ada', 'Ben'].map((name) => ({
                ...staff({ name }),
                windows: [createStaffWindow({ from: '2026-09-07', to: '2026-09-13' })],
            })),
            taskRows: [task({ name: 'Weekend Witnessing', days: [6], coLeads: 0 })],
        });
        const windowOut = generateRosterV2(windowed.config);
        expect(windowOut.unfilled.length).toBe(3);
        expect(windowOut.unfilled[0].reason).toContain(WINDOW_UNFILLED_MARKER);
        expect(summariseUnfilledCauses(windowOut.unfilled))
            .toEqual({ total: 3, windowBlocked: 3, quotaBlocked: 0 });

        const capped = build({
            weeks: 4,
            staffRows: [staff({ name: 'Ada' }), staff({ name: 'Ben' })],
            taskRows: [{ ...task({ name: 'Saturday Bench', days: [6], coLeads: 0 }), quotaPer: 'month', quotaMax: '1' }],
        });
        const quotaOut = generateRosterV2(capped.config);
        expect(quotaOut.unfilled[0].reason).toContain(QUOTA_CEILING_UNFILLED_MARKER);
        expect(summariseUnfilledCauses(quotaOut.unfilled))
            .toEqual({ total: 1, windowBlocked: 0, quotaBlocked: 1 });
    });

    it('says nothing about causes it did not see, and never throws', () => {
        expect(partitionDemoWarnings([])).toEqual({ quotaFloors: [], others: [] });
        expect(partitionDemoWarnings(undefined)).toEqual({ quotaFloors: [], others: [] });
        expect(summariseUnfilledCauses([])).toEqual({ total: 0, windowBlocked: 0, quotaBlocked: 0 });
        expect(summariseUnfilledCauses(null)).toEqual({ total: 0, windowBlocked: 0, quotaBlocked: 0 });
        expect(summariseUnfilledCauses([{ date: '2026-09-07' }])).toEqual({ total: 1, windowBlocked: 0, quotaBlocked: 0 });
    });
});


// =============================================================================
// PAIR-KEY COLLISION — the test that was missing when a NUL byte was "cleaned up"
// =============================================================================
//
// `parseForbidPairs` de-duplicates by joining the sorted pair with a NUL
// separator. That separator is not decoration: without it, 'An' + 'nBob' and
// 'Ann' + 'Bob' both key to 'AnnBob', and the second, genuinely different rule
// is refused as a duplicate.
//
// This test exists because the separator was once written as a LITERAL NUL byte,
// which made the whole module register as BINARY so grep and file silently
// skipped it (audit D1) — and the obvious cleanup, deleting the byte, quietly
// collapsed the separator to '' while all 1522 tests still passed. Nothing
// exercised the collision, so nothing objected. Now something does.
describe('parseForbidPairs — the separator is load-bearing, not decoration', () => {
    it('keeps two pairs whose names concatenate identically', () => {
        const result = parseForbidPairs([['An', 'nBob'], ['Ann', 'Bob']]);

        expect(result.ok).toBe(true);
        expect(result.pairs).toEqual([['An', 'nBob'], ['Ann', 'Bob']]);
    });

    it('still refuses a genuine duplicate, in either order', () => {
        const result = parseForbidPairs([['Ann', 'Bob'], ['Bob', 'Ann']]);

        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/listed twice/i);
    });
});
