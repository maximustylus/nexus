// scripts/roster-stress.mjs
//
// The AURA roster engine under stress. Run:
//
//   npm run stress                    # random seed, printed
//   node scripts/roster-stress.mjs --seed=12345 --cases=2000
//
// WHY THIS EXISTS. Every one of the repo's ~1655 tests is a HAND-AUTHORED fixture
// with recorded figures. That is a good property and deliberately so — but it
// means the engine had never been run on a configuration nobody wrote by hand,
// and never above 20 staff (`SCALING TABLE`, rosterEngineV2.test.js). For a tool
// aimed at 28 allied health professions across several institutions, the untested
// region started at 21 people. This harness attacks that region.
//
// FOUR SECTIONS, and they do not all gate:
//
//   A. FUZZ         random VALID configs -> the engine's own promises must hold.
//                   GATES: a broken invariant exits 1.
//   B. SCALE        20..200 staff, up to 52 weeks. Wall-clock and RSS.
//                   REPORTS ONLY: no threshold is invented here, because none has
//                   been agreed. The first run establishes the numbers.
//   C. GAP PROBES   executable demonstrations of gaps already on the ledger.
//                   REPORTS ONLY, and deliberately: they are EXPECTED to
//                   reproduce. If one stops, that means the capability shipped and
//                   the harness says "GAP CLOSED" instead of failing. A probe that
//                   breaks the build on the day the fix lands teaches people to
//                   delete probes.
//   D. v1.16 SURFACE  the eight shapes and their provenance contract.
//                   GATES: a regression exits 1.
//
// DETERMINISM IS THE WHOLE POINT. Everything random comes from ONE seeded xorshift
// and the seed is printed on every run and attached to every finding, so any
// failure is reproducible with --seed=<n>. A fuzz failure nobody can reproduce is
// a rumour, and this repository's standing rule is that a figure must be
// obtainable by running something.
//
// ⚠️ THIS TESTS THE CODE IN THIS WORKING TREE. It is NOT a test of the deployed
// site. Report findings as findings about the code at HEAD.
//
// ⚠️ WHY THIS HARNESS RE-DERIVES THE HARD CONSTRAINTS ITSELF rather than trusting
// `auditHardConstraints`. `scoreRoster` returns `hardViolations: audit.count`
// (rosterEngineV2.js:5221) — it CALLS the audit — so comparing `score` with the
// audit is tautological and proves nothing. The independent reader has to be this
// file. Section A therefore computes its own violation list from the roster and
// compares it with the engine's; a disagreement EITHER WAY is a finding:
//   * harness finds a violation the audit missed  -> a blind spot in the audit
//   * audit finds one and `ok` was still true     -> the engine shipped a roster
//                                                    it already knew was bad

import {
    generateRosterV2,
    validateRosterV2Config,
    auditHardConstraints,
    measureRosterLoad,
    bandOfGrade,
    DEFAULT_GRADE_BANDS,
    DEFAULT_TASK_HOURS,
    defaultMaxHoursPerDay,
    toLocalDateKey,
    parseLocalDateKey,
} from '../src/utils/rosterEngineV2.js';
import { DEMO_SHAPES, DEMO_SHAPE_SUGGESTIONS, suggestedShapeFor } from '../src/data/mockData.js';
import { MOH_PROFESSION_LEAVES } from '../src/data/mohAlliedHealth.js';

// ── the one source of randomness ─────────────────────────────────────────────
const arg = (name, fallback) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit === undefined ? fallback : Number(hit.split('=')[1]);
};

const SEED = arg('seed', (Date.now() ^ (process.pid * 2654435761)) >>> 0) >>> 0;
const CASES = arg('cases', 1500);
const SKIP_SCALE = process.argv.includes('--no-scale');

let _s = SEED === 0 ? 0x9e3779b9 : SEED;
/** xorshift32 — small, fast, and reproducible, which is the only requirement. */
const rnd = () => {
    _s ^= _s << 13; _s >>>= 0;
    _s ^= _s >>> 17;
    _s ^= _s << 5; _s >>>= 0;
    return _s / 0x100000000;
};
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (xs) => xs[int(0, xs.length - 1)];
const chance = (p) => rnd() < p;
const subset = (xs, minSize = 1) => {
    const out = xs.filter(() => chance(0.5));
    return out.length >= minSize ? out : [pick(xs)];
};

// ── config generator ─────────────────────────────────────────────────────────
const GRADES = Array.from({ length: 11 }, (_, i) => `AH${i + 7}`);
const BAND_NAMES = Object.keys(DEFAULT_GRADE_BANDS);
const SKILLS = ['CPET', 'SLEEP', 'REGISTERED', 'ULTRASOUND'];

const mondayOn = (offsetWeeks) => {
    const d = parseLocalDateKey('2026-09-07'); // a Monday
    d.setDate(d.getDate() + offsetWeeks * 7);
    return toLocalDateKey(d);
};

const randomConfig = () => {
    const staffCount = int(2, 25);
    const weeks = int(1, 6);
    const startDate = mondayOn(int(0, 40));
    const runDays = weeks * 7;

    const staff = Array.from({ length: staffCount }, (_, i) => {
        const person = {
            name: `P${String(i + 1).padStart(2, '0')}`,
            fte: chance(0.75) ? 1.0 : pick([0.4, 0.5, 0.6, 0.8]),
            grade: pick(GRADES),
            skills: chance(0.5) ? subset(SKILLS, 0) : [],
            unavailable: [],
        };
        // Leave: a few real dates inside the run, so the promise is testable.
        if (chance(0.4)) {
            const n = int(1, 3);
            for (let k = 0; k < n; k += 1) {
                const d = parseLocalDateKey(startDate);
                d.setDate(d.getDate() + int(0, runDays - 1));
                person.unavailable.push(toLocalDateKey(d));
            }
        }
        if (chance(0.25)) person.maxPerDay = int(1, 3);
        return person;
    });

    const heldSkills = new Set(staff.flatMap((p) => p.skills));
    const taskCount = int(1, 8);
    const tasks = Array.from({ length: taskCount }, (_, i) => {
        const task = {
            name: `T${String(i + 1).padStart(2, '0')}`,
            days: subset([0, 1, 2, 3, 4, 5, 6]),
            leads: 1,
            coLeads: chance(0.45) ? 1 : 0,
            category: pick(['Clinical', 'Education', 'Research', 'Management', 'WEEKEND']),
        };
        // Gate on a skill somebody actually holds — a skill nobody has is a
        // legitimate refusal, not a stress case, and it would only ever produce
        // unfilled slots.
        if (chance(0.3) && heldSkills.size > 0) task.requiresSkill = pick([...heldSkills]);
        if (chance(0.4)) task.leadBands = subset(BAND_NAMES);
        if (chance(0.35)) task.hours = pick([2, 3, 4, 6]);
        return task;
    });

    const rules = { bands: DEFAULT_GRADE_BANDS };
    if (chance(0.5)) rules.maxConcurrentPerDay = int(1, 3);
    if (chance(0.5)) rules.maxConsecutiveDays = int(3, 7);
    // Switching the hours model ON is itself a dimension — it is off until
    // mentioned (§9 limits ledger item 1), so both halves need exercising.
    if (chance(0.4)) rules.weeklyHours = pick([35, 42, 44]);

    return { label: 'stress', startDate, weeks, staff, tasks, rules };
};

// ── section A: the independent reader ────────────────────────────────────────
/**
 * Re-derive the hard constraints from a finished roster, WITHOUT the engine's
 * audit. Returns a list of violation strings.
 */
const violationsOf = (config, roster) => {
    const bad = [];
    const byName = new Map(config.staff.map((p) => [p.name, p]));
    const taskByName = new Map(config.tasks.map((t) => [t.name, t]));
    const bands = config.rules?.bands ?? DEFAULT_GRADE_BANDS;

    const hoursActive = config.tasks.some((t) => t.hours !== undefined)
        || config.staff.some((p) => p.weeklyHours !== undefined || p.maxHoursPerDay !== undefined)
        || config.rules?.weeklyHours !== undefined
        || config.rules?.maxHoursPerDay !== undefined;
    const ruleWeekly = config.rules?.weeklyHours ?? 42;
    const ruleDaily = config.rules?.maxHoursPerDay ?? defaultMaxHoursPerDay(ruleWeekly);
    const defaultMaxPerDay = config.rules?.maxConcurrentPerDay ?? 2;
    const EPS = 1e-9;

    const hoursByWeek = new Map();  // `${name}|${week}` -> hours

    for (const [dateKey, shifts] of Object.entries(roster)) {
        const dutiesToday = new Map();
        const hoursToday = new Map();
        const taskSeenToday = new Set();

        for (const shift of shifts) {
            const task = taskByName.get(shift.task);
            const assignees = shift.assignees ?? [];

            if (new Set(assignees).size !== assignees.length) {
                bad.push(`${dateKey} ${shift.task}: same person twice in one shift (${assignees.join(', ')})`);
            }

            for (const who of assignees) {
                const person = byName.get(who);
                if (person === undefined) {
                    bad.push(`${dateKey} ${shift.task}: assignee "${who}" is not in the staff pool`);
                    continue;
                }
                if ((person.unavailable ?? []).includes(dateKey)) {
                    bad.push(`${dateKey} ${shift.task}: ${who} is rostered on a date in their unavailable list`);
                }
                const taskKey = `${who}|${shift.task}`;
                if (taskSeenToday.has(taskKey)) {
                    bad.push(`${dateKey} ${shift.task}: ${who} holds this task twice on one day`);
                }
                taskSeenToday.add(taskKey);
                dutiesToday.set(who, (dutiesToday.get(who) ?? 0) + 1);

                if (hoursActive && task !== undefined) {
                    const h = task.hours ?? DEFAULT_TASK_HOURS;
                    hoursToday.set(who, (hoursToday.get(who) ?? 0) + h);
                    const wk = `${who}|${shift.week}`;
                    hoursByWeek.set(wk, (hoursByWeek.get(wk) ?? 0) + h);
                }
            }

            // Bands gate the LEAD ONLY; a co-lead of any grade is legal
            // (rosterEngineV2.js compilePairedPositions). Assert exactly that and
            // nothing stronger.
            if (task?.leadBands !== undefined && shift.lead !== undefined && shift.lead !== null) {
                const person = byName.get(shift.lead);
                const band = person ? bandOfGrade(person.grade, bands) : null;
                if (band !== null && !task.leadBands.includes(band)) {
                    bad.push(`${dateKey} ${shift.task}: lead ${shift.lead} is ${person.grade} (${band}), outside leadBands [${task.leadBands.join(', ')}]`);
                }
            }
            // A task skill is carried by the lead AND the co-lead.
            if (task?.requiresSkill !== undefined) {
                for (const who of assignees) {
                    const person = byName.get(who);
                    if (person && !(person.skills ?? []).includes(task.requiresSkill)) {
                        bad.push(`${dateKey} ${shift.task}: ${who} lacks required skill ${task.requiresSkill}`);
                    }
                }
            }
        }

        for (const [who, n] of dutiesToday) {
            const cap = byName.get(who)?.maxPerDay ?? defaultMaxPerDay;
            if (n > cap) bad.push(`${dateKey}: ${who} holds ${n} duties, cap ${cap}`);
        }
        if (hoursActive) {
            for (const [who, h] of hoursToday) {
                const person = byName.get(who);
                const cap = (person.maxHoursPerDay ?? ruleDaily) * (person.fte ?? 1);
                if (h > cap + EPS) bad.push(`${dateKey}: ${who} holds ${h}h, daily cap ${cap.toFixed(2)}h`);
            }
        }
    }

    if (hoursActive) {
        for (const [key, h] of hoursByWeek) {
            const [who] = key.split('|');
            const person = byName.get(who);
            const cap = (person.weeklyHours ?? ruleWeekly) * (person.fte ?? 1);
            if (h > cap + EPS) bad.push(`${key}: ${h}h in the week, cap ${cap.toFixed(2)}h`);
        }
    }
    return bad;
};

const findings = [];
const note = (section, severity, text) => findings.push({ section, severity, text });

/**
 * SELF-TEST — can this harness fail at all?
 *
 * A fuzz harness that cannot fail is worse than no harness: it prints a tick
 * forever and everybody stops looking. This repo has the scar — `qc-steward.md`
 * records 608 lines of test code that had never once executed, in two
 * byte-identical files importing a path that did not exist.
 *
 * So: take a roster the engine produced legitimately, corrupt it in five ways
 * that each violate one of section A's invariants, and require `violationsOf` to
 * catch every one. A corruption that slips through is a BLIND SPOT in this file,
 * reported as such — the harness auditing itself before it audits the engine.
 */
const selfTest = () => {
    console.log('\n══ SELF-TEST — can the harness detect a violation? ' + '═'.repeat(21));
    const config = {
        label: 'self-test',
        startDate: '2026-09-07',
        weeks: 1,
        staff: [
            { name: 'A', fte: 1.0, grade: 'AH13', skills: [], unavailable: ['2026-09-09'] },
            { name: 'B', fte: 1.0, grade: 'AH8', skills: [], unavailable: [] },
        ],
        tasks: [{
            name: 'Ward', days: [1, 2, 3], leads: 1, coLeads: 0,
            category: 'Clinical', leadBands: ['senior'],
        }],
        rules: { maxConcurrentPerDay: 1, bands: DEFAULT_GRADE_BANDS },
    };
    const clean = generateRosterV2(config);
    if (!clean.ok) { console.log(`  ❌ self-test fixture would not generate: ${clean.reason}`); return false; }
    if (violationsOf(config, clean.roster).length !== 0) {
        console.log('  ❌ the UNCORRUPTED roster already reports violations — the checker is wrong');
        return false;
    }

    const corruptions = [
        ['unknown assignee', (r) => { const d = Object.keys(r)[0]; r[d][0].assignees = ['GHOST']; r[d][0].lead = 'GHOST'; }],
        ['same person twice in one shift', (r) => { const d = Object.keys(r)[0]; r[d][0].assignees = ['A', 'A']; }],
        ['rostered on a leave date', (r) => { r['2026-09-09'] = [{ task: 'Ward', lead: 'A', staff: 'Lead: A', category: 'Clinical', week: 1, assignees: ['A'] }]; }],
        ['over maxPerDay', (r) => {
            const d = Object.keys(r)[0];
            r[d] = [
                { task: 'Ward', lead: 'A', staff: 'Lead: A', category: 'Clinical', week: 1, assignees: ['A'] },
                { task: 'Ward2', lead: 'A', staff: 'Lead: A', category: 'Clinical', week: 1, assignees: ['A'] },
            ];
        }],
        ['lead outside leadBands', (r) => { const d = Object.keys(r)[0]; r[d][0].assignees = ['B']; r[d][0].lead = 'B'; }],
    ];

    let blind = 0;
    for (const [name, corrupt] of corruptions) {
        const copy = JSON.parse(JSON.stringify(clean.roster));
        corrupt(copy);
        const caught = violationsOf(config, copy);
        if (caught.length > 0) {
            console.log(`  ✅ caught: ${name.padEnd(32)} → "${caught[0].slice(0, 60)}"`);
        } else {
            console.log(`  ❌ MISSED: ${name} — this harness is blind to it`);
            blind += 1;
        }
    }
    if (blind > 0) note('SELF', 'BLIND SPOT', `${blind} corruption(s) went undetected by violationsOf`);
    return blind === 0;
};

const runFuzz = () => {
    let generated = 0;
    let rejected = 0;
    const rejectReasons = new Map();
    let notOk = 0;
    let totalShifts = 0;
    let totalUnfilled = 0;
    let auditDisagreements = 0;
    let nonDeterministic = 0;
    const failures = [];

    for (let i = 0; i < CASES; i += 1) {
        const config = randomConfig();
        const validation = validateRosterV2Config(config);
        if (!validation.valid) {
            rejected += 1;
            const key = String(validation.reason).slice(0, 70);
            rejectReasons.set(key, (rejectReasons.get(key) ?? 0) + 1);
            continue;
        }
        generated += 1;

        const result = generateRosterV2(config);
        if (!result.ok) {
            notOk += 1;
            failures.push(`case ${i}: validator accepted but generate returned ok:false — ${result.reason}`);
            continue;
        }

        const shifts = Object.values(result.roster).flat();
        totalShifts += shifts.length;
        totalUnfilled += result.unfilled.length;

        // 1. The independent re-derivation.
        const mine = violationsOf(config, result.roster);
        const audit = auditHardConstraints(result.roster, config);
        if (mine.length > 0) {
            failures.push(`case ${i}: ${mine.length} hard violation(s), first: ${mine[0]}`);
        }
        if ((mine.length > 0) !== (audit.count > 0)) {
            auditDisagreements += 1;
            failures.push(`case ${i}: harness found ${mine.length}, engine audit found ${audit.count} — the two readers disagree`);
        }

        // 2. Every refusal must be legible. The engine's core promise is that it
        //    refuses OUT LOUD rather than silently dropping a slot.
        for (const u of result.unfilled) {
            const reason = typeof u === 'string' ? u : u?.reason;
            if (typeof reason !== 'string' || reason.trim() === '') {
                failures.push(`case ${i}: an unfilled slot carries no reason — ${JSON.stringify(u).slice(0, 120)}`);
                break;
            }
        }

        // 3. Determinism. If this ever fails, every recorded figure in the repo
        //    is luck rather than measurement.
        if (i % 25 === 0) {
            const again = generateRosterV2(config);
            if (JSON.stringify(again.roster) !== JSON.stringify(result.roster)) {
                nonDeterministic += 1;
                failures.push(`case ${i}: same config generated two different rosters`);
            }
        }
    }

    console.log('\n══ A. FUZZ — random valid configurations ' + '═'.repeat(30));
    console.log(`cases attempted      ${CASES}`);
    console.log(`validator accepted   ${generated}`);
    console.log(`validator rejected   ${rejected}  (legitimate refusals, not failures)`);
    console.log(`generate ok:false    ${notOk}`);
    console.log(`shifts produced      ${totalShifts}`);
    console.log(`unfilled slots       ${totalUnfilled}`);
    console.log(`audit disagreements  ${auditDisagreements}`);
    console.log(`non-deterministic    ${nonDeterministic}`);
    if (rejectReasons.size > 0) {
        console.log('\ntop validator rejections (these prove the generator is reaching real edges):');
        [...rejectReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
            .forEach(([reason, n]) => console.log(`  ${String(n).padStart(4)}x  ${reason}`));
    }
    if (failures.length > 0) {
        console.log(`\n❌ ${failures.length} FAILURE(S) — reproduce with --seed=${SEED}`);
        failures.slice(0, 15).forEach((f) => console.log('   ' + f));
        if (failures.length > 15) console.log(`   … and ${failures.length - 15} more`);
        note('A', 'DEFECT', `${failures.length} invariant failure(s) at seed ${SEED}`);
    } else {
        console.log(`\n✅ no invariant broken across ${generated} generated rosters`);
    }
    return failures.length === 0;
};

// ── section B: scale ─────────────────────────────────────────────────────────
const runScale = () => {
    console.log('\n══ B. SCALE — past the 20-staff ceiling ' + '═'.repeat(32));
    console.log('  staff  tasks  weeks     shifts   unfilled   idle     ms      rssMB');
    const CASES_B = [
        [20, 4, 4], [20, 10, 13], [50, 10, 13], [50, 20, 26],
        [100, 20, 26], [100, 40, 52], [200, 40, 52],
    ];
    for (const [staffCount, taskCount, weeks] of CASES_B) {
        const config = {
            label: `scale-${staffCount}x${taskCount}x${weeks}`,
            startDate: '2026-09-07',
            weeks,
            staff: Array.from({ length: staffCount }, (_, i) => ({
                name: `S${String(i + 1).padStart(3, '0')}`,
                fte: 1.0,
                grade: GRADES[i % GRADES.length],
                skills: [],
                unavailable: [],
            })),
            tasks: Array.from({ length: taskCount }, (_, i) => ({
                name: `T${String(i + 1).padStart(2, '0')}`,
                days: [1, 2, 3, 4, 5],
                leads: 1,
                coLeads: 0,
                category: 'Clinical',
            })),
            rules: { maxConcurrentPerDay: 2, bands: DEFAULT_GRADE_BANDS },
        };
        const t0 = process.hrtime.bigint();
        const result = generateRosterV2(config);
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        const rss = process.memoryUsage().rss / 1048576;
        if (!result.ok) {
            console.log(`  ${String(staffCount).padStart(5)}  ${String(taskCount).padStart(5)}  ${String(weeks).padStart(5)}   REFUSED: ${result.reason}`);
            continue;
        }
        const shifts = Object.values(result.roster).flat().length;
        const load = measureRosterLoad(result.roster, config.staff.map((p) => p.name));
        console.log(
            `  ${String(staffCount).padStart(5)}  ${String(taskCount).padStart(5)}  ${String(weeks).padStart(5)}`
            + `  ${String(shifts).padStart(9)}  ${String(result.unfilled.length).padStart(9)}`
            + `  ${String(load.neverRostered.length).padStart(5)}  ${ms.toFixed(0).padStart(6)}  ${rss.toFixed(0).padStart(7)}`,
        );
    }
    console.log('\n  No pass/fail threshold is applied. None has been agreed, so this run');
    console.log('  ESTABLISHES the numbers rather than judging them.');
};

// ── section C: known-gap probes ──────────────────────────────────────────────
const runProbes = () => {
    console.log('\n══ C. KNOWN-GAP PROBES — reporting only ' + '═'.repeat(32));

    // C1 — AM/PM. Two 4h duties that both really run in the morning.
    const amPm = {
        label: 'probe-am-pm',
        startDate: '2026-09-07',
        weeks: 1,
        staff: [{ name: 'Solo', fte: 1.0, grade: 'AH13', skills: [], unavailable: [] }],
        tasks: [
            { name: 'Morning Clinic A', days: [1], leads: 1, coLeads: 0, hours: 4, category: 'Clinical' },
            { name: 'Morning Clinic B', days: [1], leads: 1, coLeads: 0, hours: 4, category: 'Clinical' },
        ],
        rules: { weeklyHours: 42, maxConcurrentPerDay: 2, bands: DEFAULT_GRADE_BANDS },
    };
    const r1 = generateRosterV2(amPm);
    const monday = r1.ok ? (r1.roster['2026-09-07'] ?? []) : [];
    const bothOnSolo = monday.filter((s) => (s.assignees ?? []).includes('Solo')).length;
    if (bothOnSolo >= 2) {
        console.log('  C1  AM/PM clash            REPRODUCED — one person holds both morning');
        console.log('                             duties on 2026-09-07 (8h against an 8.4h cap).');
        console.log('                             The engine has the DURATION of a half day but');
        console.log('                             not its POSITION. Queue item 4 / decision Q13.');
        note('C', 'KNOWN GAP', 'AM/PM clash reproduced — queue item 4');
    } else {
        console.log('  C1  AM/PM clash            GAP CLOSED — the engine no longer stacks two');
        console.log('                             morning duties. Update ROSTER_TODO.md item 4');
        console.log('                             and the expressiveness ledger.');
        note('C', 'GAP CLOSED', 'AM/PM no longer reproduces — item 4 may have shipped');
    }

    // C2 — D10, the grade floor. AH11 present, gate is junior+.
    const floor = {
        label: 'probe-grade-floor',
        startDate: '2026-09-07',
        weeks: 2,
        staff: [
            { name: 'Eleven', fte: 1.0, grade: 'AH11', skills: [], unavailable: [] },
            { name: 'Twelve', fte: 1.0, grade: 'AH12', skills: [], unavailable: [] },
            { name: 'Thirteen', fte: 1.0, grade: 'AH13', skills: [], unavailable: [] },
        ],
        tasks: [{
            name: 'NICU', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 0,
            category: 'Clinical', leadBands: ['junior', 'senior', 'principal'],
        }],
        rules: { maxConcurrentPerDay: 1, bands: DEFAULT_GRADE_BANDS },
    };
    const r2 = generateRosterV2(floor);
    const leads = r2.ok ? [...new Set(Object.values(r2.roster).flat().map((s) => s.lead))] : [];
    if (leads.includes('Eleven')) {
        console.log('  C2  D10 grade floor        REPRODUCED — an AH11 leads a duty whose stated');
        console.log('                             floor is AH12. `junior` is AH11–AH12, so a band');
        console.log('                             cannot express a threshold INSIDE a band.');
        console.log(`                             Leads observed: ${leads.join(', ')}`);
        note('C', 'KNOWN GAP', 'D10 reproduced — an AH11 led an AH12-floor duty');
    } else {
        console.log('  C2  D10 grade floor        GAP CLOSED — no AH11 led. Update the D10 row in');
        console.log('                             CHANGELOG.md and ROSTER_TODO.md item 5(b).');
        note('C', 'GAP CLOSED', 'D10 no longer reproduces');
    }
};

// ── section D: the v1.16.0 surface ───────────────────────────────────────────
const runSurface = () => {
    console.log('\n══ D. v1.16.0 SURFACE — the shapes and their provenance ' + '═'.repeat(16));
    const problems = [];

    for (const shape of DEMO_SHAPES) {
        const result = generateRosterV2(shape.config);
        if (!result.ok) { problems.push(`${shape.id}: generate refused — ${result.reason}`); continue; }
        const audit = auditHardConstraints(result.roster, shape.config);
        const mine = violationsOf(shape.config, result.roster);
        if (result.score.hardViolations !== 0) problems.push(`${shape.id}: hardViolations ${result.score.hardViolations}`);
        if (audit.count !== 0) problems.push(`${shape.id}: audit read-back ${audit.count}`);
        if (mine.length > 0) problems.push(`${shape.id}: harness found ${mine.length} — first: ${mine[0]}`);

        if (shape.provenance === 'interviewed') {
            const s = shape.sourceScope;
            if (!s) problems.push(`${shape.id}: interviewed shape has no sourceScope`);
            else {
                if (!(s.teams >= 1)) problems.push(`${shape.id}: sourceScope.teams is ${s.teams}`);
                if (!(s.institutions >= 1)) problems.push(`${shape.id}: sourceScope.institutions is ${s.institutions}`);
                if (!('describedOn' in s)) problems.push(`${shape.id}: sourceScope has no describedOn key`);
            }
            if (typeof shape.sourceProfession !== 'string' || shape.sourceProfession === '') {
                problems.push(`${shape.id}: interviewed shape is unattributed`);
            }
        } else if (shape.sourceScope !== null) {
            problems.push(`${shape.id}: a fictional demo must carry sourceScope null`);
        }
    }

    const interviewed = DEMO_SHAPES.filter((s) => s.provenance === 'interviewed');
    const unpaired = interviewed.filter((s) => s.sourceProfessionId === null);
    if (unpaired.length !== 1 || unpaired[0].id !== 'shape-graded-floor-rotation') {
        problems.push(`expected exactly respiratory unpaired, got [${unpaired.map((s) => s.id).join(', ')}]`);
    }
    const covered = MOH_PROFESSION_LEAVES.filter((l) => DEMO_SHAPE_SUGGESTIONS[l.id]).length;
    if (covered !== 32) problems.push(`profession coverage is ${covered} of ${MOH_PROFESSION_LEAVES.length}, expected 32`);
    if (suggestedShapeFor('respiratory-therapist') !== null) {
        problems.push('respiratory-therapist has a suggestion — it must be attributed but unpaired');
    }

    console.log(`  shapes checked       ${DEMO_SHAPES.length} (${interviewed.length} interviewed)`);
    console.log(`  profession coverage  ${covered} of ${MOH_PROFESSION_LEAVES.length} leaves`);
    console.log(`  unpaired interviewed ${unpaired.map((s) => s.id).join(', ') || '(none)'}`);
    if (problems.length > 0) {
        console.log(`\n❌ ${problems.length} SURFACE REGRESSION(S)`);
        problems.forEach((p) => console.log('   ' + p));
        note('D', 'REGRESSION', `${problems.length} v1.16 surface regression(s)`);
    } else {
        console.log('\n✅ the v1.16.0 provenance contract holds');
    }
    return problems.length === 0;
};

// ── run ──────────────────────────────────────────────────────────────────────
console.log('═'.repeat(72));
console.log('  AURA ROSTER — STRESS HARNESS');
console.log(`  seed ${SEED}   cases ${CASES}   node ${process.version}`);
console.log('  Tests the code in this working tree. NOT the deployed site.');
console.log('═'.repeat(72));

const selfOk = selfTest();
const fuzzOk = runFuzz();
if (!SKIP_SCALE) runScale();
runProbes();
const surfaceOk = runSurface();

console.log('\n══ SUMMARY ' + '═'.repeat(61));
if (findings.length === 0) {
    console.log('  no findings');
} else {
    for (const f of findings) console.log(`  [${f.section}] ${f.severity.padEnd(11)} ${f.text}`);
}
console.log(`\n  reproduce this exact run:  node scripts/roster-stress.mjs --seed=${SEED} --cases=${CASES}`);
console.log('═'.repeat(72));

process.exit(selfOk && fuzzOk && surfaceOk ? 0 : 1);
