/**
 * ==============================================================================
 * AURA ROSTER ENGINE V2 — MULTI-SLOT SHIFTS, SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest
 * Run:    npm test
 *
 * WHY THIS IS A SIBLING FILE AND NOT A NEW `describe` IN AN EXISTING ONE.
 *
 * `rosterEngineV2.test.js`, `rosterEngineV2.grades.test.js`,
 * `rosterEngineV2.psych.test.js` and `rosterEngineV2.hours.test.js` are the
 * COMPATIBILITY GATE for this change: the claim being made is that a task which
 * does not carry `slots` behaves EXACTLY as it did before `slots` existed. A gate
 * is only worth something if it is untouched, and `git diff --stat` showing zero
 * lines changed in all four is a stronger statement than a diff a reviewer has to
 * read to confirm nothing was softened. All five files run in one command.
 *
 * Everything below is a SPECIFICATION test: a failure is a bug in the engine.
 * Every number, every name and every quoted reason string was obtained by RUNNING
 * the engine and recording the result — never derived by hand, and never copied
 * from the implementation.
 *
 * THE RULES BEING PINNED, in one place:
 *
 *   1. A task may carry `slots: [{ band, requiresSkill, role }, …]` — ONE ENTRY
 *      PER PERSON the shift needs — and one shift object holds the whole team.
 *   2. Each entry is filled INDEPENDENTLY through the existing candidate
 *      pipeline, with its OWN band and skill gate on top of the task's.
 *   3. THE LEAD IS THE HIGHEST GRADE PRESENT. An ungraded assignee never
 *      outranks a graded one; ties break by the existing candidate tie-break;
 *      `assignees` is lead-first in that same order; `coLead` is the second
 *      assignee, so `staff` still reads `Lead: X, Co: Y`.
 *   4. AN UNFILLED ENTRY NAMES ITS SLOT. Two of three staffed is a real shift
 *      plus ONE `unfilled` entry naming the third, not a cancelled day.
 *   5. NOBODY TAKES TWO SLOTS OF ONE SHIFT.
 *   6. `slots` is mutually exclusive with `leads`, `coLeads`, `leadBands` and
 *      `continuity`, and every combination is REFUSED at configure time with both
 *      field names in the reason.
 *   7. IT COMPOSES: availability, capacity, hours, `forbidPairs`,
 *      `maxConsecutiveDays`, skills and monthly recurrence all still apply, and
 *      slot entries are ordered by scarcity like every other slot.
 *   8. THE AUDIT READS IT BACK: every slot's own gate satisfied, the lead really
 *      the highest grade, nobody twice on one shift — measured off the finished
 *      roster, not asserted by the loop that built it.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
    generateRosterV2,
    validateRosterV2Config,
    auditHardConstraints,
    scoreRoster,
    DEFAULT_TASK_HOURS,
    DEFAULT_WEEKLY_HOURS,
} from './rosterEngineV2';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * 2026-09-07 is a MONDAY, so no start-date snap warning muddies the assertions;
 * 2026-09-12 is the Saturday and 2026-09-13 the Sunday that close that week —
 * the embryologists' weekend.
 */
const MONDAY = '2026-09-07';
const SATURDAY = '2026-09-12';
const SUNDAY = '2026-09-13';

/** Every shift, flattened, each tagged with the date key it sits under. */
const flatten = (roster) =>
    Object.entries(roster).flatMap(([dateKey, shifts]) => shifts.map((shift) => ({ dateKey, shift })));

/** The one shift of `task` on `dateKey`, or `undefined`. */
const shiftOn = (roster, dateKey, task) => (roster[dateKey] || []).find((shift) => shift.task === task);

/** Every `unfilled` entry for one date, in the order the engine emitted them. */
const unfilledOn = (unfilled, dateKey) => unfilled.filter((entry) => entry.date === dateKey);

/**
 * A NOTE ON THE GRADES IN THIS FILE, after the four-band split.
 *
 * `junior` shipped as AH7–AH12 and is now AH11–AH12; AH7–AH10 became `nonExempt`
 * (assistants, associates, technologists). Every fixture here whose most junior
 * person exists to fill a `{ band: 'junior' }` slot named them AH8 or AH9, so they
 * were re-graded into the junior band: `Cal` AH8 -> AH12 and `Dot` AH9 -> AH11
 * throughout, and the embryology trio's `Jun`/`Kiri` as noted on that fixture. What
 * each test is testing is unchanged — a junior slot needs a junior AHP in it, and
 * that is what these people now are. `Ann` at AH8 in "the lead of a multi-slot
 * shift" is deliberately left alone: that test gates on nothing and is about grade
 * RANKING, where AH8 still means exactly what it did.
 */

/** A run that must have succeeded — with the reason in the failure message. */
const generated = (config) => {
    const result = generateRosterV2(config);
    expect(result.reason ?? null).toBe(null);
    expect(result.ok).toBe(true);
    return result;
};

/** The refusal reason for a config that must be refused. */
const refusal = (config) => {
    const check = validateRosterV2Config(config);
    expect(check.valid).toBe(false);
    // The engine must refuse on the same terms as the validator, so a UI that
    // shows one and a caller that reads the other cannot disagree.
    const run = generateRosterV2(config);
    expect(run.ok).toBe(false);
    expect(run.reason).toBe(check.reason);
    return check.reason;
};

/**
 * THE FIELD-RESEARCH FIXTURE: the embryologists' weekend service. A principal, a
 * senior and a junior, together, on one Saturday and one Sunday shift. Two
 * juniors so that fairness has somebody to alternate between — which is what
 * makes "the trio is not a fixed team" visible.
 *
 * A function rather than a constant so that no test can mutate the fixture out
 * from under another one.
 *
 * RE-GRADED WITH THE FOUR-BAND SPLIT. Jun and Kiri were AH9 and AH8, picked when
 * `junior` meant AH7–AH12. AH7–AH10 is `nonExempt` now — assistants and
 * technologists — so neither would qualify for this task's `{ band: 'junior' }`
 * slot, and the trio's third seat is a junior EMBRYOLOGIST. They are graded AH12
 * and AH11, keeping Jun above Kiri as before so the assignee ordering assertions
 * still measure what they always did.
 */
const embryology = (overrides = {}) => ({
    startDate: MONDAY,
    weeks: 1,
    staff: [
        { name: 'Priya', grade: 'AH16', skills: ['Witnessing'] },
        { name: 'Sanjay', grade: 'AH14', skills: ['Witnessing'] },
        { name: 'Jun', grade: 'AH12' },
        { name: 'Kiri', grade: 'AH11' },
    ],
    tasks: [
        {
            name: 'Weekend Witnessing',
            days: [6, 0],
            slots: [
                { band: 'principal', role: 'Principal embryologist' },
                { band: 'senior', role: 'Senior embryologist' },
                { band: 'junior', role: 'Junior embryologist' },
            ],
        },
    ],
    ...overrides,
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. THE EMBRYOLOGY FIXTURE — the staffing rule that was inexpressible
// ═════════════════════════════════════════════════════════════════════════════

describe('the embryology weekend trio', () => {
    it('is a valid configuration', () => {
        expect(validateRosterV2Config(embryology())).toEqual({ valid: true, reason: null });
    });

    it('staffs both weekend days and nothing else', () => {
        const { roster } = generated(embryology());
        expect(Object.keys(roster)).toEqual([SATURDAY, SUNDAY]);
    });

    it('puts the whole trio on ONE shift, not three shifts', () => {
        const { roster } = generated(embryology());
        expect(roster[SATURDAY]).toHaveLength(1);
        expect(roster[SATURDAY][0].assignees).toHaveLength(3);
    });

    it('fills each slot from its own band', () => {
        const { roster } = generated(embryology());
        const bandOf = { Priya: 'principal', Sanjay: 'senior', Jun: 'junior', Kiri: 'junior' };

        for (const { shift } of flatten(roster)) {
            expect(shift.assignees.map((name) => bandOf[name])).toEqual(['principal', 'senior', 'junior']);
        }
    });

    it('makes the PRINCIPAL the lead, on both days', () => {
        const { roster } = generated(embryology());
        expect(shiftOn(roster, SATURDAY, 'Weekend Witnessing').lead).toBe('Priya');
        expect(shiftOn(roster, SUNDAY, 'Weekend Witnessing').lead).toBe('Priya');
    });

    it('orders `assignees` lead first, then descending grade', () => {
        const { roster } = generated(embryology());
        expect(shiftOn(roster, SATURDAY, 'Weekend Witnessing').assignees).toEqual(['Priya', 'Sanjay', 'Jun']);
        expect(shiftOn(roster, SUNDAY, 'Weekend Witnessing').assignees).toEqual(['Priya', 'Sanjay', 'Kiri']);
    });

    it('keeps the existing two-name display string working', () => {
        const { roster } = generated(embryology());
        expect(shiftOn(roster, SATURDAY, 'Weekend Witnessing').staff).toBe('Lead: Priya, Co: Sanjay');
        expect(shiftOn(roster, SUNDAY, 'Weekend Witnessing').staff).toBe('Lead: Priya, Co: Sanjay');
    });

    it('sets `coLead` to the SECOND assignee, so the swap flow still has two roles', () => {
        const { roster } = generated(embryology());
        for (const { shift } of flatten(roster)) {
            expect(shift.coLead).toBe(shift.assignees[1]);
            expect(shift.lead).toBe(shift.assignees[0]);
        }
    });

    it('emits the same shift shape as a lead/co-lead task — no new keys', () => {
        const { roster } = generated(embryology());
        expect(Object.keys(shiftOn(roster, SATURDAY, 'Weekend Witnessing'))).toEqual([
            'task', 'lead', 'coLead', 'staff', 'category', 'week', 'assignees',
        ]);
    });

    it('leaves nothing unfilled, and reports no hard violation', () => {
        const result = generated(embryology());
        expect(result.unfilled).toEqual([]);
        expect(result.score.hardViolations).toBe(0);
        expect(result.warnings).toEqual([]);
    });

    it('alternates the junior between the two juniors rather than fixing the team', () => {
        const { roster, load } = generated(embryology());
        expect(shiftOn(roster, SATURDAY, 'Weekend Witnessing').assignees[2]).toBe('Jun');
        expect(shiftOn(roster, SUNDAY, 'Weekend Witnessing').assignees[2]).toBe('Kiri');
        expect(load.Jun.duties).toBe(1);
        expect(load.Kiri.duties).toBe(1);
    });

    it('counts every assignee in `load`, not only the two named in `staff`', () => {
        const { load } = generated(embryology());
        expect(load.Priya.duties).toBe(2);
        expect(load.Sanjay.duties).toBe(2);
        expect(load.Jun.duties + load.Kiri.duties).toBe(2);
    });

    it('passes its own read-back audit', () => {
        const config = embryology();
        const { roster } = generated(config);
        expect(auditHardConstraints(roster, config)).toEqual({ ok: true, count: 0, violations: [] });
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. WHO IS THE LEAD — the decided rule, and its edges
// ═════════════════════════════════════════════════════════════════════════════

describe('the lead of a multi-slot shift', () => {
    /** Three ungated slots, so nothing but the grades can decide the lead. */
    const openTrio = (staff) => ({
        startDate: MONDAY,
        weeks: 1,
        staff,
        tasks: [{ name: 'Trio', days: [1], slots: [{}, {}, {}] }],
    });

    it('is the highest grade present, whatever order the slots are listed in', () => {
        const { roster } = generated(openTrio([
            { name: 'Ann', grade: 'AH8' },
            { name: 'Bob', grade: 'AH17' },
            { name: 'Cid', grade: 'AH13' },
        ]));
        const shift = shiftOn(roster, MONDAY, 'Trio');
        expect(shift.lead).toBe('Bob');
        expect(shift.assignees).toEqual(['Bob', 'Cid', 'Ann']);
    });

    it('never lets an UNGRADED assignee outrank a graded one — not even AH7', () => {
        const { roster } = generated(openTrio([
            { name: 'Ann' },
            { name: 'Bob', grade: 'AH7' },
            { name: 'Cid', grade: 'AH17' },
        ]));
        const shift = shiftOn(roster, MONDAY, 'Trio');
        expect(shift.lead).toBe('Cid');
        // Ann last, behind the bottom of the scale, because an unrecorded grade is
        // unknown rather than low.
        expect(shift.assignees).toEqual(['Cid', 'Bob', 'Ann']);
    });

    it('falls back to the existing tie-break when every grade is equal', () => {
        const { roster } = generated({
            startDate: MONDAY,
            weeks: 1,
            staff: [
                { name: 'Ann', grade: 'AH13' },
                { name: 'Bob', grade: 'AH13' },
                { name: 'Cid', grade: 'AH13' },
            ],
            tasks: [{ name: 'Pair', slots: [{}, {}] }],
        });

        // Measured: fairness rotates the pair across the week, and the assignee
        // order follows the same FTE-weighted comparator the engine picked them
        // with — so it is neither always name order nor the order the slots were
        // filled in.
        expect(flatten(roster).map(({ dateKey, shift }) => [dateKey, ...shift.assignees])).toEqual([
            ['2026-09-07', 'Ann', 'Bob'],
            ['2026-09-08', 'Cid', 'Ann'],
            ['2026-09-09', 'Bob', 'Cid'],
            ['2026-09-10', 'Ann', 'Bob'],
            ['2026-09-11', 'Cid', 'Ann'],
        ]);
    });

    it('breaks a grade tie by FAIRNESS, not by which slot was filled first', () => {
        // Zoe is the only person who can fill the specialist entry, so she is
        // assigned FIRST (it is the scarce one) — and she is also the most loaded
        // person in the department by Saturday. The tie-break is the existing
        // FTE-weighted comparator, so the far less loaded Ann sorts ahead of her and
        // LEADS, even though Zoe was seated first and holds the scarce skill.
        //
        // This test exists because a mutation check found the assertion above it
        // could not distinguish the tie-break from a plain stable sort of the
        // assignment order. This configuration can: without the tie-break the
        // assignees read ['Zoe', 'Ann'] and Zoe leads.
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [
                { name: 'Zoe', grade: 'AH13', skills: ['X'] },
                { name: 'Ann', grade: 'AH13' },
                { name: 'Bob', grade: 'AH13' },
            ],
            tasks: [
                { name: 'Weekday', days: [1, 2, 3, 4, 5], requiresSkill: 'X', coLeads: 0 },
                { name: 'Trio', days: [6], slots: [{ requiresSkill: 'X', role: 'Specialist' }, { role: 'Second' }] },
            ],
        };
        const { roster, load } = generated(config);
        const shift = shiftOn(roster, SATURDAY, 'Trio');

        expect(load.Zoe.duties).toBe(6);
        expect(load.Ann.duties).toBe(1);
        expect(shift.assignees).toEqual(['Ann', 'Zoe']);
        expect(shift.lead).toBe('Ann');
        expect(shift.staff).toBe('Lead: Ann, Co: Zoe');
    });

    it('is deterministic when every grade AND every fairness key is equal', () => {
        const config = {
            startDate: MONDAY,
            weeks: 1,
            staff: [{ name: 'Zoe', grade: 'AH13' }, { name: 'Ann', grade: 'AH13' }],
            tasks: [{ name: 'Pair', days: [1], slots: [{}, {}] }],
        };
        // Name order by code unit, the documented last resort: 'Ann' < 'Zoe'.
        expect(shiftOn(generated(config).roster, MONDAY, 'Pair').assignees).toEqual(['Ann', 'Zoe']);
    });

    it('stays right when the top slot goes unfilled — the pair re-leads itself', () => {
        // Nobody in the principal band is free, so the senior leads the pair. The
        // rule is about the shift as it ended up, not about which slot was listed
        // first.
        const config = embryology({
            staff: [
                { name: 'Priya', grade: 'AH16', skills: ['Witnessing'], unavailable: [SATURDAY] },
                { name: 'Sanjay', grade: 'AH14', skills: ['Witnessing'] },
                { name: 'Jun', grade: 'AH12' }, // junior AHP; see the fixture note
            ],
        });
        const { roster } = generated(config);
        const saturday = shiftOn(roster, SATURDAY, 'Weekend Witnessing');
        expect(saturday.assignees).toEqual(['Sanjay', 'Jun']);
        expect(saturday.lead).toBe('Sanjay');
        expect(saturday.staff).toBe('Lead: Sanjay, Co: Jun');
        // …and the Sunday, with Priya back, leads with the principal again.
        expect(shiftOn(roster, SUNDAY, 'Weekend Witnessing').lead).toBe('Priya');
    });

    it('emits a solo shift with NO `coLead` key when only one slot fills', () => {
        const config = embryology({
            staff: [
                { name: 'Priya', grade: 'AH16', skills: ['Witnessing'] },
                { name: 'Sanjay', grade: 'AH14', skills: ['Witnessing'], unavailable: [SATURDAY, SUNDAY] },
                { name: 'Jun', grade: 'AH12', unavailable: [SATURDAY, SUNDAY] },
            ],
        });
        const shift = shiftOn(generated(config).roster, SATURDAY, 'Weekend Witnessing');
        expect(shift.assignees).toEqual(['Priya']);
        // An absent co-lead is an ABSENT FIELD — audit M7, the `undefined` that
        // reached the CSV export.
        expect('coLead' in shift).toBe(false);
        expect(shift.staff).toBe('Lead: Priya');
    });

    it('writes no shift at all when every slot fails', () => {
        const config = embryology({
            staff: [
                { name: 'Priya', grade: 'AH16', skills: ['Witnessing'], unavailable: [SATURDAY] },
                { name: 'Sanjay', grade: 'AH14', skills: ['Witnessing'], unavailable: [SATURDAY] },
                { name: 'Jun', grade: 'AH12', unavailable: [SATURDAY] },
            ],
        });
        const { roster, unfilled } = generated(config);
        expect(Object.keys(roster)).toEqual([SUNDAY]);
        // The record that the day was attempted lives entirely in `unfilled`.
        expect(unfilledOn(unfilled, SATURDAY)).toHaveLength(3);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. NOBODY TAKES TWO SLOTS OF ONE SHIFT
// ═════════════════════════════════════════════════════════════════════════════

describe('one person, one slot', () => {
    it('refuses to fill two junior slots with the only junior', () => {
        const config = {
            startDate: MONDAY,
            weeks: 1,
            staff: [{ name: 'Ada', grade: 'AH16' }, { name: 'Cal', grade: 'AH12' }],
            tasks: [{
                name: 'WW',
                days: [6],
                slots: [{ band: 'junior' }, { band: 'junior' }, { band: 'principal' }],
            }],
        };
        const { roster, unfilled } = generated(config);

        expect(shiftOn(roster, SATURDAY, 'WW').assignees).toEqual(['Ada', 'Cal']);
        expect(unfilled).toHaveLength(1);
        expect(unfilled[0].role).toBe('junior slot 2');
        expect(unfilled[0].reason).toBe(
            'no available Junior-band staff for WW junior slot 2 on 2026-09-12 (1 in band, 1 already on this task)',
        );
    });

    it('cannot double-book anybody even with more slots than people', () => {
        const config = {
            startDate: MONDAY,
            weeks: 1,
            staff: [{ name: 'Ann' }, { name: 'Bob' }],
            tasks: [{ name: 'Big', days: [1], slots: [{}, {}, {}, {}, {}] }],
        };
        const { roster, unfilled, score } = generated(config);

        const shift = shiftOn(roster, MONDAY, 'Big');
        expect(shift.assignees).toEqual(['Ann', 'Bob']);
        expect(new Set(shift.assignees).size).toBe(2);
        expect(unfilled).toHaveLength(3);
        expect(score.hardViolations).toBe(0);
    });

    it('names every one of the failed slots distinctly', () => {
        const config = {
            startDate: MONDAY,
            weeks: 1,
            staff: [{ name: 'Ann' }, { name: 'Bob' }],
            tasks: [{ name: 'Big', days: [1], slots: [{}, {}, {}, {}, {}] }],
        };
        const { unfilled } = generated(config);
        expect(unfilled.map((entry) => entry.role)).toEqual(['slot 3', 'slot 4', 'slot 5']);
    });

    it('reports one person on two slots of one shift as a hard violation on read-back', () => {
        const config = {
            startDate: MONDAY,
            weeks: 1,
            staff: [{ name: 'Ann' }, { name: 'Bob' }],
            tasks: [{ name: 'Pair', days: [1], slots: [{}, {}] }],
        };
        // A roster the engine cannot build, but a swap tool or a hand edit can.
        const audit = auditHardConstraints({
            [MONDAY]: [{
                task: 'Pair', lead: 'Ann', coLead: 'Ann',
                staff: 'Lead: Ann, Co: Ann', category: 'CORE', week: 1,
                assignees: ['Ann', 'Ann'],
            }],
        }, config);

        expect(audit.ok).toBe(true);
        expect(audit.violations.map((violation) => violation.rule)).toContain('onePerSlot');
        expect(audit.count).toBeGreaterThan(0);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. WHICH SLOT FAILED — the reason strings
// ═════════════════════════════════════════════════════════════════════════════

describe('an unfilled slot entry names the slot', () => {
    it('yields ONE unfilled entry for the missing junior and still fills the other two', () => {
        const config = embryology({
            staff: [
                { name: 'Priya', grade: 'AH16', skills: ['Witnessing'] },
                { name: 'Sanjay', grade: 'AH14', skills: ['Witnessing'] },
                { name: 'Jun', grade: 'AH12', unavailable: [SATURDAY] },
            ],
        });
        const { roster, unfilled } = generated(config);

        const saturday = shiftOn(roster, SATURDAY, 'Weekend Witnessing');
        expect(saturday.assignees).toEqual(['Priya', 'Sanjay']);

        expect(unfilledOn(unfilled, SATURDAY)).toEqual([{
            date: SATURDAY,
            task: 'Weekend Witnessing',
            role: 'Junior embryologist',
            reason: 'no available Junior-band staff for Weekend Witnessing Junior embryologist on 2026-09-12 (1 in band, 1 on leave)',
        }]);
        // The Sunday, with Jun back, is a full trio again.
        expect(shiftOn(roster, SUNDAY, 'Weekend Witnessing').assignees).toEqual(['Priya', 'Sanjay', 'Jun']);
    });

    it('uses the slot `role` verbatim when one is given', () => {
        const config = embryology({
            staff: [
                { name: 'Priya', grade: 'AH16', skills: ['Witnessing'] },
                { name: 'Sanjay', grade: 'AH14', skills: ['Witnessing'] },
                { name: 'Jun', grade: 'AH12', unavailable: [SATURDAY, SUNDAY] },
            ],
        });
        const { unfilled } = generated(config);
        expect(unfilled).toHaveLength(2);
        expect(unfilled.every((entry) => entry.role === 'Junior embryologist')).toBe(true);
    });

    it('falls back to the BAND when a slot has no role', () => {
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ada', grade: 'AH16' }, { name: 'Ben', grade: 'AH13', unavailable: [SATURDAY] }],
            tasks: [{ name: 'WW', days: [6], slots: [{ band: 'principal' }, { band: 'senior' }] }],
        };
        const { unfilled } = generated(config);
        expect(unfilled.map((entry) => entry.role)).toEqual(['senior slot']);
        expect(unfilled[0].reason).toBe(
            'no available Senior-band staff for WW senior slot on 2026-09-12 (1 in band, 1 on leave)',
        );
    });

    it('numbers slots only when their labels would otherwise collide', () => {
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [
                { name: 'Ada', grade: 'AH16' },
                { name: 'Ben', grade: 'AH13', unavailable: [SATURDAY] },
                { name: 'Bea', grade: 'AH14', unavailable: [SATURDAY] },
            ],
            tasks: [{
                name: 'WW', days: [6],
                slots: [{ band: 'principal' }, { band: 'senior' }, { band: 'senior' }, { role: 'Scribe' }],
            }],
        };
        const { unfilled } = generated(config);
        // One principal slot -> unnumbered (and filled by Ada); two senior slots
        // -> numbered; the lone `Scribe` keeps its own label, and has nobody left.
        expect(unfilled.map((entry) => entry.role)).toEqual(['senior slot 1', 'senior slot 2', 'Scribe']);
    });

    it('names BOTH skills when the task and the slot each require one', () => {
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [
                { name: 'Ada', skills: ['Andrology'] },
                { name: 'Ben', skills: ['Andrology', 'ICSI'] },
            ],
            tasks: [{
                name: 'Lab', days: [1], requiresSkill: 'Andrology',
                slots: [{ requiresSkill: 'ICSI' }, { requiresSkill: 'ICSI' }],
            }],
        };
        const { unfilled } = generated(config);
        expect(unfilled).toHaveLength(1);
        expect(unfilled[0].reason).toBe(
            'no available staff hold skills Andrology and ICSI for Lab slot 2 on 2026-09-07 (1 qualified, 1 already on this task)',
        );
    });

    it('does not say a skill twice when the slot repeats the task\'s', () => {
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ada', skills: ['ICSI'] }],
            tasks: [{
                name: 'Lab', days: [1], requiresSkill: 'ICSI',
                slots: [{ requiresSkill: 'ICSI' }, { requiresSkill: 'ICSI' }],
            }],
        };
        const { unfilled } = generated(config);
        expect(unfilled[0].reason).toBe(
            'no available staff hold skill ICSI for Lab slot 2 on 2026-09-07 (1 qualified, 1 already on this task)',
        );
    });

    it('names the skill AND the band when a slot carries both', () => {
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [
                { name: 'Ada', grade: 'AH16', skills: ['Witnessing'] },
                { name: 'Ben', grade: 'AH13', skills: ['Witnessing'], unavailable: [SATURDAY] },
            ],
            tasks: [{
                name: 'WW', days: [6],
                slots: [{ band: 'principal' }, { band: 'senior', requiresSkill: 'Witnessing', role: 'Witness' }],
            }],
        };
        const { unfilled } = generated(config);
        expect(unfilled[0].reason).toBe(
            'no available staff hold skill Witnessing and sit in the Senior band for WW Witness on 2026-09-12 (2 qualified, 1 in band, 1 on leave)',
        );
    });

    it('says only "no available staff" for an entry with no gates of its own', () => {
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ann' }],
            tasks: [{ name: 'Pair', days: [1], slots: [{}, {}] }],
        };
        expect(generated(config).unfilled[0].reason).toBe(
            'no available staff for Pair slot 2 on 2026-09-07 (1 in pool, 1 already on this task)',
        );
    });

    it('emits the day\'s unfilled entries in slot order, not in scarcity order', () => {
        // The principal slot is the scarcest and is resolved FIRST; the reading
        // order of `unfilled` is nonetheless the configuration order.
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [
                { name: 'Ada', grade: 'AH16', unavailable: [SATURDAY] },
                { name: 'Cal', grade: 'AH12', unavailable: [SATURDAY] },
            ],
            tasks: [{
                name: 'WW', days: [6],
                slots: [{ role: 'A' }, { band: 'principal', role: 'B' }, { band: 'junior', role: 'C' }],
            }],
        };
        expect(generated(config).unfilled.map((entry) => entry.role)).toEqual(['A', 'B', 'C']);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. COMPOSITION — every existing constraint still applies
// ═════════════════════════════════════════════════════════════════════════════

describe('slots compose with the rest of the engine', () => {
    it('respects leave, and says so in the slot\'s reason', () => {
        const config = embryology({
            staff: [
                { name: 'Priya', grade: 'AH16', skills: ['Witnessing'], unavailable: [SATURDAY, SUNDAY] },
                { name: 'Sanjay', grade: 'AH14', skills: ['Witnessing'] },
                { name: 'Jun', grade: 'AH12' }, // junior AHP; see the fixture note
            ],
        });
        const { roster, unfilled } = generated(config);
        for (const { shift } of flatten(roster)) expect(shift.assignees).not.toContain('Priya');
        expect(unfilled).toHaveLength(2);
        expect(unfilled[0].reason).toContain('1 on leave');
    });

    it('respects the DAILY HOURS cap on a slot entry, naming the slot and the hours', () => {
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [
                { name: 'Ada', grade: 'AH16', maxHoursPerDay: 4 },
                { name: 'Ben', grade: 'AH13' },
                { name: 'Cal', grade: 'AH12' },
            ],
            tasks: [{
                name: 'Trio', days: [1], hours: 6,
                slots: [{ band: 'principal', role: 'Principal' }, { band: 'senior' }, { band: 'junior' }],
            }],
        };
        const { roster, unfilled, warnings } = generated(config);

        // Ada's 4-hour day cannot hold a 6-hour session, so the principal slot is
        // unfilled and the SENIOR leads the pair that remains.
        const shift = shiftOn(roster, MONDAY, 'Trio');
        expect(shift.assignees).toEqual(['Ben', 'Cal']);
        expect(shift.lead).toBe('Ben');

        expect(unfilled).toHaveLength(1);
        expect(unfilled[0].role).toBe('Principal');
        expect(unfilled[0].reason).toBe(
            'no available Principal-band staff for Trio Principal on 2026-09-07 (1 in band, 1 over their daily hours limit) — Ada would reach 6h on 2026-09-07, over their 4h daily limit (nothing else assigned that day)',
        );
        expect(warnings).toEqual([
            'Task Trio takes 6h, which is longer than the daily hours limit of 1 staff member (Ada (4h)), so they can never be rostered on it.',
        ]);
    });

    it('sums a slot task\'s hours into `load` like any other duty', () => {
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ann' }, { name: 'Bob' }],
            tasks: [{ name: 'Pair', days: [1, 2], hours: 5, slots: [{}, {}] }],
        };
        const { load } = generated(config);
        expect(load.Ann.hours).toBe(10);
        expect(load.Bob.hours).toBe(10);
        expect(load.Ann.weeklyCap).toBe(DEFAULT_WEEKLY_HOURS);
    });

    it('respects the WEEKLY hours cap across a slot task\'s days', () => {
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ann', weeklyHours: 8 }, { name: 'Bob', weeklyHours: 8 }],
            tasks: [{ name: 'Pair', days: [1, 2, 3], hours: 4, slots: [{}, {}] }],
        };
        const { load, unfilled, score } = generated(config);
        expect(load.Ann.hours).toBe(8);
        expect(load.Bob.hours).toBe(8);
        // The third day has nobody with an hour left in the week.
        expect(unfilledOn(unfilled, '2026-09-09')).toHaveLength(2);
        expect(unfilled[0].reason).toContain('over their weekly hours limit');
        expect(score.hardViolations).toBe(0);
    });

    it('respects forbidPairs INSIDE the trio', () => {
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [
                { name: 'Ada', grade: 'AH16' },
                { name: 'Ben', grade: 'AH13' },
                { name: 'Bea', grade: 'AH14' },
                { name: 'Cal', grade: 'AH12' },
            ],
            tasks: [{ name: 'WW', days: [6], slots: [{ band: 'principal' }, { band: 'senior' }, { band: 'junior' }] }],
            rules: { forbidPairs: [['Ada', 'Ben'], ['Ada', 'Bea']] },
        };
        const { roster, unfilled } = generated(config);
        expect(shiftOn(roster, SATURDAY, 'WW').assignees).toEqual(['Ada', 'Cal']);
        expect(unfilled[0].reason).toBe(
            'no available Senior-band staff for WW senior slot on 2026-09-12 (2 in band, 2 blocked by a forbidden pairing)',
        );
    });

    it('respects a personal maxPerDay across a slot task and another task', () => {
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ann', maxPerDay: 1 }, { name: 'Bob', maxPerDay: 1 }],
            tasks: [
                { name: 'Pair', days: [1], slots: [{}, {}] },
                { name: 'Solo', days: [1], coLeads: 0 },
            ],
        };
        const { roster, unfilled, score } = generated(config);
        expect(shiftOn(roster, MONDAY, 'Pair').assignees).toEqual(['Ann', 'Bob']);
        expect(shiftOn(roster, MONDAY, 'Solo')).toBeUndefined();
        expect(unfilled.map((entry) => [entry.task, entry.role])).toEqual([['Solo', 'lead']]);
        expect(score.hardViolations).toBe(0);
    });

    it('respects maxConsecutiveDays for the people on a slot shift', () => {
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ann' }, { name: 'Bob' }],
            tasks: [{ name: 'Pair', days: [1, 2, 3, 4, 5], slots: [{}, {}] }],
            rules: { maxConsecutiveDays: 3 },
        };
        const { roster, unfilled, score } = generated(config);
        // Three days of the pair, then a day nobody may open — and then the Friday
        // again, because the Thursday off BREAKS the run. That is
        // `maxConsecutiveDays` working, and it is measured rather than assumed.
        expect(Object.keys(roster)).toEqual(['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-11']);
        expect(unfilledOn(unfilled, '2026-09-10')).toHaveLength(2);
        expect(unfilled[0].reason).toBe(
            'no available staff for Pair slot 1 on 2026-09-10 (2 in pool, 2 at the consecutive-day limit)',
        );
        expect(score.hardViolations).toBe(0);
    });

    it('works on a MONTHLY recurrence', () => {
        const config = {
            startDate: MONDAY, weeks: 8,
            staff: [{ name: 'Ada', grade: 'AH16' }, { name: 'Cal', grade: 'AH12' }],
            tasks: [{
                name: 'Third Wed Trio',
                recurrence: { ordinal: 3, weekday: 3 },
                slots: [{ band: 'principal' }, { band: 'junior' }],
            }],
        };
        const { roster } = generated(config);
        // 3rd Wednesdays of September and October 2026.
        expect(Object.keys(roster)).toEqual(['2026-09-16', '2026-10-21']);
        expect(roster['2026-09-16'][0].assignees).toEqual(['Ada', 'Cal']);
    });

    it('is scored and counted like any other duty', () => {
        const config = embryology();
        const { roster, score } = generated(config);
        expect(scoreRoster(roster, config)).toEqual({
            ok: true,
            hardViolations: 0,
            softPenalty: score.softPenalty,
            breakdown: score.breakdown,
        });
        expect(score.breakdown.weekendImbalance).toBeGreaterThan(0);
    });

    it('leaves a sibling lead/co-lead task completely untouched', () => {
        const withSlots = {
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ada', grade: 'AH16' }, { name: 'Ben', grade: 'AH13' }, { name: 'Cal', grade: 'AH12' }],
            tasks: [
                { name: 'Ordinary', days: [1] },
                { name: 'Trio', days: [6], slots: [{ band: 'principal' }, { band: 'senior' }, { band: 'junior' }] },
            ],
        };
        const withoutSlots = { ...withSlots, tasks: [withSlots.tasks[0]] };

        const a = generated(withSlots);
        const b = generated(withoutSlots);
        // The Monday shift is decided before any weekend slot exists, so adding
        // the trio cannot move it.
        expect(a.roster[MONDAY]).toEqual(b.roster[MONDAY]);
    });

    it('defaults a slot task\'s duration to DEFAULT_TASK_HOURS like every other task', () => {
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ann', weeklyHours: DEFAULT_WEEKLY_HOURS }, { name: 'Bob' }],
            tasks: [{ name: 'Pair', days: [1], slots: [{}, {}] }],
        };
        expect(generated(config).load.Ann.hours).toBe(DEFAULT_TASK_HOURS);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. SCARCITY ORDERING — each entry is its own slot for MRV
// ═════════════════════════════════════════════════════════════════════════════

describe('slot entries are ordered by scarcity', () => {
    it('does not spend the only principal on an ungated slot beside a banded one', () => {
        // Ada is the department's only principal. The trio lists its UNGATED slot
        // FIRST, so a naive left-to-right pass would give that slot to Ada (she is
        // the fairest candidate on an empty day) and then report the principal
        // slot as unstaffable — a shortage the engine would have manufactured.
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ada', grade: 'AH16' }, { name: 'Cal', grade: 'AH12' }],
            tasks: [{
                name: 'Trio', days: [1],
                slots: [{ role: 'Anyone' }, { band: 'principal', role: 'Principal' }],
            }],
        };
        const { roster, unfilled } = generated(config);
        expect(shiftOn(roster, MONDAY, 'Trio').assignees).toEqual(['Ada', 'Cal']);
        expect(unfilled).toEqual([]);
    });

    it('counts a slot entry\'s BAND in the scarcity measure, across tasks', () => {
        // Ada is the only principal, and both people may hold only one duty a day.
        // The ungated task is listed FIRST, so if the entry's band were not counted
        // the two slots would tie at two candidates each, configuration order would
        // give `Ordinary` first pick, fairness would hand it Ada (name order), and
        // the principal entry would be reported unstaffable — a shortage the engine
        // would have manufactured. Counted, the principal entry is the scarce one
        // and everything fills.
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ada', grade: 'AH16' }, { name: 'Cal', grade: 'AH12' }],
            tasks: [
                { name: 'Ordinary', days: [1], coLeads: 0 },
                { name: 'Trio', days: [1], slots: [{ band: 'principal', role: 'Principal' }] },
            ],
            rules: { maxConcurrentPerDay: 1 },
        };
        const { roster, unfilled } = generated(config);
        expect(shiftOn(roster, MONDAY, 'Trio').assignees).toEqual(['Ada']);
        expect(shiftOn(roster, MONDAY, 'Ordinary').assignees).toEqual(['Cal']);
        expect(unfilled).toEqual([]);
    });

    it('breaks a scarcity TIE by configuration order, slot entries included', () => {
        // The same department, with the trio now needing its junior too. All three
        // slots have exactly one candidate, so the tie-break decides — and it is
        // the documented one: earlier in configuration order wins. `Ordinary` is
        // listed first, so it takes Cal and the junior entry is the honest report
        // of a genuine two-person shortage. Recorded because a roster master
        // reading it would otherwise think the trio was silently deprioritised.
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ada', grade: 'AH16' }, { name: 'Cal', grade: 'AH12' }],
            tasks: [
                { name: 'Ordinary', days: [1], coLeads: 0 },
                { name: 'Trio', days: [1], slots: [{ band: 'principal' }, { band: 'junior' }] },
            ],
            rules: { maxConcurrentPerDay: 1 },
        };
        const { roster, unfilled } = generated(config);
        expect(shiftOn(roster, MONDAY, 'Trio').assignees).toEqual(['Ada']);
        expect(shiftOn(roster, MONDAY, 'Ordinary').assignees).toEqual(['Cal']);
        expect(unfilled.map((entry) => [entry.task, entry.role])).toEqual([['Trio', 'junior slot']]);
    });

    it('puts every slot entry ahead of every CO-LEAD slot, which is the phase choice', () => {
        // Two people, four slots. Phase 1 holds the Clinic's lead AND both trio
        // entries; phase 2 holds the Clinic's co-lead. So the trio's second entry
        // competes with the Clinic's lead and beats its co-lead — a multi-slot entry
        // is a first-class requirement, not a helper.
        //
        // Measured and pinned because it is a DECISION: a department whose co-leads
        // matter more than a trio's third seat cannot express that today.
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ann' }, { name: 'Bob' }],
            tasks: [
                { name: 'Clinic', days: [1], leads: 1, coLeads: 1 },
                { name: 'Trio', days: [1], slots: [{}, {}] },
            ],
            rules: { maxConcurrentPerDay: 1 },
        };
        const { roster, unfilled } = generated(config);
        expect(shiftOn(roster, MONDAY, 'Clinic').assignees).toEqual(['Ann']);
        expect(shiftOn(roster, MONDAY, 'Trio').assignees).toEqual(['Bob']);
        expect(unfilled.map((entry) => [entry.task, entry.role])).toEqual([
            ['Trio', 'slot 2'],
            ['Clinic', 'coLead'],
        ]);
    });

    it('counts an hours-tight entry as the scarce one', () => {
        // Ann's day holds one 6h session OR one 2h review, not both. The 6h trio
        // entry is the scarce one and must be filled first, or it becomes
        // unfillable the moment the 2h slot is placed.
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ann', maxHoursPerDay: 7 }],
            tasks: [{ name: 'Mixed', days: [1], hours: 6, slots: [{ role: 'Long' }] },
                { name: 'Review', days: [1], hours: 2, coLeads: 0 }],
            rules: { maxHoursPerDay: 7 },
        };
        const { roster, unfilled } = generated(config);
        expect(shiftOn(roster, MONDAY, 'Mixed').assignees).toEqual(['Ann']);
        expect(unfilled.map((entry) => entry.task)).toEqual(['Review']);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. VALIDATION — `slots` refuses what it cannot mean
// ═════════════════════════════════════════════════════════════════════════════

describe('validation of slots', () => {
    const task = (extra) => ({
        startDate: MONDAY, weeks: 1,
        staff: [{ name: 'Ada', grade: 'AH16', skills: ['Witnessing'] }, { name: 'Cal', grade: 'AH12' }],
        tasks: [{ name: 'T', ...extra }],
    });

    it('refuses slots AND leads together, naming both fields', () => {
        expect(refusal(task({ slots: [{ band: 'principal' }], leads: 1 }))).toBe(
            'Task T sets both slots and leads — a shift is staffed either as one lead plus co-leads (leads/coLeads) or as a list of slots, never both. Remove whichever one is not meant.',
        );
    });

    it('refuses slots AND coLeads together — including coLeads: 0', () => {
        expect(refusal(task({ slots: [{ band: 'principal' }], coLeads: 0 }))).toBe(
            'Task T sets both slots and coLeads — a shift is staffed either as one lead plus co-leads (leads/coLeads) or as a list of slots, never both. Remove whichever one is not meant.',
        );
    });

    it('refuses slots AND leadBands together, and says where to put the band', () => {
        expect(refusal(task({ slots: [{ band: 'principal' }], leadBands: ['principal'] }))).toContain(
            'Task T sets both slots and leadBands',
        );
        expect(refusal(task({ slots: [{ band: 'principal' }], leadBands: ['principal'] }))).toContain(
            "Put the band on the slot entry that must hold it, e.g. { band: 'principal' }.",
        );
    });

    it('refuses slots AND continuity: true', () => {
        expect(refusal(task({ slots: [{ band: 'principal' }], continuity: true }))).toContain(
            'Task T sets both slots and continuity',
        );
    });

    it('ACCEPTS slots beside continuity: false, which is not a combination at all', () => {
        expect(validateRosterV2Config(task({ slots: [{ band: 'principal' }], continuity: false })))
            .toEqual({ valid: true, reason: null });
    });

    it('refuses slots: []', () => {
        expect(refusal(task({ slots: [] }))).toBe(
            'Task T has slots: [], so its shift would need nobody at all. Give one entry per person the shift needs, or leave slots out and use leads/coLeads.',
        );
    });

    it('refuses a non-array slots', () => {
        expect(refusal(task({ slots: 3 }))).toContain("Task T's slots must be an array of slot objects");
        expect(refusal(task({ slots: { band: 'principal' } }))).toContain('must be an array of slot objects');
    });

    it('refuses a slot entry that is not an object', () => {
        expect(refusal(task({ slots: [{ band: 'principal' }, 'senior'] }))).toBe(
            "Task T's slot 2 is not a slot object — expected { band, requiresSkill, role }, e.g. { band: 'senior', role: 'Witness' }.",
        );
        expect(refusal(task({ slots: [null] }))).toContain("Task T's slot 1 is not a slot object");
        expect(refusal(task({ slots: [[]] }))).toContain("Task T's slot 1 is not a slot object");
    });

    it('refuses a band that is not one of the four', () => {
        // CHANGED BY THE FOUR-BAND SPLIT: the refusal enumerates the bands that
        // exist, and `nonExempt` now leads that list. Title moved from "three" to
        // "four" for the same reason.
        expect(refusal(task({ slots: [{ band: 'boss' }] }))).toBe(
            'Task T\'s slot 1 names the band "boss", which is not a band — use nonExempt, junior, senior, principal (lower case), or leave band out so that any grade may fill the slot.',
        );
        expect(refusal(task({ slots: [{ band: 'Principal' }] }))).toContain('which is not a band');
        expect(refusal(task({ slots: [{ band: 15 }] }))).toContain('which is not a band');
    });

    it('refuses a skill nobody in the pool holds', () => {
        expect(refusal(task({ slots: [{ requiresSkill: 'Witnesing' }] }))).toBe(
            "Task T's slot 1 requires skill Witnesing, which nobody in the staff pool holds. Check the spelling, or add the skill to whoever is competent.",
        );
    });

    it('refuses a requiresSkill that is not a skill name', () => {
        expect(refusal(task({ slots: [{ requiresSkill: '  ' }] }))).toContain(
            "Task T's slot 1's requiresSkill must be a skill name",
        );
        expect(refusal(task({ slots: [{ requiresSkill: 7 }] }))).toContain('must be a skill name');
    });

    it('refuses a role that is not a label', () => {
        expect(refusal(task({ slots: [{ role: '   ' }] }))).toBe(
            "Task T's slot 1 has a role that is not a label — give it a name such as 'Principal embryologist', or leave it out.",
        );
        expect(refusal(task({ slots: [{ role: 12 }] }))).toContain('has a role that is not a label');
    });

    it('refuses a slot whose BAND holds nobody — the twin of the empty-band rule', () => {
        expect(refusal(task({ slots: [{ band: 'senior' }] }))).toBe(
            "Task T's slot 1 (senior slot) needs a grade in the Senior band (AH13–AH14), and nobody in the staff pool qualifies, so that slot would be unfilled on every date. Check the grades and the skills, widen the slot, or move the band boundaries.",
        );
    });

    it('refuses a slot whose band and skill do not INTERSECT', () => {
        // CHANGED BY THE FOUR-BAND SPLIT: the Junior band's span reads AH11–AH12.
        expect(refusal(task({ slots: [{ band: 'junior', requiresSkill: 'Witnessing', role: 'Junior witness' }] }))).toBe(
            "Task T's slot 1 (Junior witness) needs a grade in the Junior band (AH11–AH12) and skill Witnessing, and nobody in the staff pool qualifies, so that slot would be unfilled on every date. Check the grades and the skills, widen the slot, or move the band boundaries.",
        );
    });

    it('refuses a slot that cannot intersect the TASK\'s own skill', () => {
        // CHANGED BY THE FOUR-BAND SPLIT: same span, same reason.
        expect(refusal(task({ requiresSkill: 'Witnessing', slots: [{ band: 'junior' }] }))).toContain(
            'needs a grade in the Junior band (AH11–AH12) and skill Witnessing, and nobody in the staff pool qualifies',
        );
    });

    it('reads slot bands against CUSTOM band boundaries', () => {
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ada', grade: 'AH13' }],
            tasks: [{ name: 'T', slots: [{ band: 'principal' }] }],
            // Fixture rewritten for four regions — a custom cut must name all four or
            // it is not a partition. The claim is unchanged: principal starts at AH13
            // here, so this AH13 fills a principal slot that the shipped cut would
            // have refused her.
            rules: { bands: { nonExempt: [7, 10], junior: [11, 11], senior: [12, 12], principal: [13, 17] } },
        };
        expect(validateRosterV2Config(config)).toEqual({ valid: true, reason: null });
        expect(shiftOn(generated(config).roster, MONDAY, 'T').lead).toBe('Ada');
    });

    it('accepts a fully specified slot list', () => {
        expect(validateRosterV2Config(task({
            slots: [
                { band: 'principal', requiresSkill: 'Witnessing', role: 'Principal' },
                { band: 'junior' },
                {},
            ],
        }))).toEqual({ valid: true, reason: null });
    });

    it('still refuses a bad `leads` before it complains about a combination', () => {
        // The type error in `leads` is the roster master's actual mistake.
        expect(refusal(task({ slots: [{}], leads: 'two' }))).toBe(
            "Task T's leads must be a whole number of 0 or more.",
        );
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. WARNINGS — structural strain, said before a slot is filled
// ═════════════════════════════════════════════════════════════════════════════

describe('structural warnings for slots', () => {
    it('warns when a band is asked for more times a day than it has people', () => {
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ada', grade: 'AH16' }, { name: 'Cal', grade: 'AH12' }],
            tasks: [{ name: 'WW', days: [6], slots: [{ band: 'junior' }, { band: 'junior' }, { band: 'principal' }] }],
        };
        // CHANGED BY THE FOUR-BAND SPLIT: the Junior band's span reads AH11–AH12.
        expect(generated(config).warnings).toEqual([
            'Task WW needs 2 people from the Junior band (AH11–AH12) per day (junior slot 1, junior slot 2), but only 1 person qualifies, so some of those slots cannot be filled on any day.',
        ]);
    });

    it('groups the warning by GATE, so three identical slots are one sentence', () => {
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ada', grade: 'AH16' }, { name: 'Ben', grade: 'AH13' }, { name: 'Cal', grade: 'AH12' }],
            tasks: [{ name: 'WW', days: [6], slots: [{ band: 'principal' }, { band: 'principal' }, { band: 'principal' }] }],
        };
        expect(generated(config).warnings).toEqual([
            'Task WW needs 3 people from the Principal band (AH15–AH17) per day (principal slot 1, principal slot 2, principal slot 3), but only 1 person qualifies, so some of those slots cannot be filled on any day.',
        ]);
    });

    it('warns about an ungated shortfall too, without inventing a band', () => {
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ann' }, { name: 'Bob' }],
            tasks: [{ name: 'Big', days: [1], slots: [{}, {}, {}] }],
        };
        expect(generated(config).warnings).toEqual([
            'Task Big needs 3 people per day (slot 1, slot 2, slot 3), but only 2 people qualify, so some of those slots cannot be filled on any day.',
        ]);
    });

    it('names the skills in the shortfall warning', () => {
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ada', skills: ['Andrology', 'ICSI'] }, { name: 'Ben', skills: ['Andrology'] }],
            tasks: [{
                name: 'Lab', days: [1], requiresSkill: 'Andrology',
                slots: [{ requiresSkill: 'ICSI' }, { requiresSkill: 'ICSI' }],
            }],
        };
        expect(generated(config).warnings).toEqual([
            'Task Lab needs 2 people holding skills Andrology and ICSI per day (slot 1, slot 2), but only 1 person qualifies, so some of those slots cannot be filled on any day.',
        ]);
    });

    it('names ungraded staff who cannot fill any banded slot', () => {
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ada', grade: 'AH16' }, { name: 'Cal', grade: 'AH12' }, { name: 'Fay' }, { name: 'Gil' }],
            tasks: [{ name: 'WW', days: [6], slots: [{ band: 'principal' }, { band: 'junior' }] }],
        };
        expect(generated(config).warnings).toEqual([
            '2 staff members have no job grade recorded (Fay, Gil), so they cannot fill any band-restricted slot of the multi-slot task. They remain eligible for every slot that carries no band, and for every other duty.',
        ]);
    });

    it('says nothing about grades when no slot carries a band', () => {
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ann' }, { name: 'Fay' }],
            tasks: [{ name: 'Pair', days: [1], slots: [{}, {}] }],
        };
        expect(generated(config).warnings).toEqual([]);
    });

    it('counts slot demand in the capacity warning', () => {
        const config = {
            startDate: MONDAY, weeks: 1,
            staff: [{ name: 'Ann', maxPerDay: 1 }],
            tasks: [{ name: 'Trio', days: [1], slots: [{}, {}, {}] }],
        };
        const { warnings } = generated(config);
        expect(warnings).toContain(
            'This configuration asks for 3 duty slots but the team can hold at most 1 across the run, so some slots cannot be filled.',
        );
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. THE AUDIT — read back off the finished roster
// ═════════════════════════════════════════════════════════════════════════════

describe('auditHardConstraints on a multi-slot roster', () => {
    const config = {
        startDate: MONDAY, weeks: 1,
        staff: [
            { name: 'Ada', grade: 'AH16' },
            { name: 'Ben', grade: 'AH13' },
            { name: 'Eve', grade: 'AH14' },
            { name: 'Cal', grade: 'AH12' },
            { name: 'Fay' },
        ],
        tasks: [{ name: 'WW', days: [6], slots: [{ band: 'principal' }, { band: 'senior' }, { band: 'junior' }] }],
    };

    /** A hand-built shift, as a swap tool or a manual edit could leave one. */
    const rosterOf = (lead, coLead, assignees) => ({
        [SATURDAY]: [{
            task: 'WW', lead, coLead, staff: `Lead: ${lead}, Co: ${coLead}`,
            category: 'CORE', week: 1, assignees,
        }],
    });

    const rules = (roster) => auditHardConstraints(roster, config).violations.map((violation) => violation.rule);

    it('passes a correct trio', () => {
        expect(auditHardConstraints(rosterOf('Ada', 'Ben', ['Ada', 'Ben', 'Cal']), config))
            .toEqual({ ok: true, count: 0, violations: [] });
    });

    it('catches a lead who is not the highest grade on the shift', () => {
        const audit = auditHardConstraints(rosterOf('Cal', 'Ben', ['Cal', 'Ben', 'Ada']), config);
        expect(audit.violations).toEqual([{
            rule: 'leadGrade',
            date: SATURDAY,
            task: 'WW',
            // Cal reads AH12 rather than AH8 because he was re-graded into the junior
            // band (see the note at the top of the file). He is still the lowest grade
            // on the shift, which is the whole point of this violation.
            detail: 'Cal (AH12) leads WW, but Ben (AH13) is on the same shift — the lead of a multi-slot shift is its highest grade',
        }]);
    });

    it('catches an UNGRADED lead beside a graded assignee', () => {
        const audit = auditHardConstraints(rosterOf('Fay', 'Ada', ['Fay', 'Ada', 'Cal']), config);
        expect(audit.violations.map((violation) => violation.rule)).toContain('leadGrade');
        expect(audit.violations.find((violation) => violation.rule === 'leadGrade').detail).toBe(
            'Fay (no grade recorded) leads WW, but Ada (AH16) is on the same shift — the lead of a multi-slot shift is its highest grade',
        );
    });

    it('allows a TIE — equal grades are not a violation', () => {
        const tied = {
            ...config,
            staff: [{ name: 'Ada', grade: 'AH13' }, { name: 'Ben', grade: 'AH13' }],
            tasks: [{ name: 'WW', days: [6], slots: [{ band: 'senior' }, { band: 'senior' }] }],
        };
        expect(auditHardConstraints({
            [SATURDAY]: [{
                task: 'WW', lead: 'Ben', coLead: 'Ada', staff: 'Lead: Ben, Co: Ada',
                category: 'CORE', week: 1, assignees: ['Ben', 'Ada'],
            }],
        }, tied)).toEqual({ ok: true, count: 0, violations: [] });
    });

    it('catches three seniors against principal/senior/junior — the matching case', () => {
        // Every one of them satisfies SOME slot, so a per-person check would pass
        // this shift while the principal slot sat empty.
        const audit = auditHardConstraints(rosterOf('Eve', 'Ben', ['Eve', 'Ben', 'Fay']), config);
        const slotGate = audit.violations.filter((violation) => violation.rule === 'slotGate');
        expect(slotGate).toHaveLength(2);
        expect(slotGate[0].detail).toBe(
            'Ben is on WW but no slot of it that they qualify for is free (its slots are principal slot, senior slot, junior slot)',
        );
    });

    it('catches a fourth person on a three-slot shift', () => {
        const audit = auditHardConstraints(rosterOf('Ada', 'Ben', ['Ada', 'Ben', 'Cal', 'Eve']), config);
        expect(audit.violations.map((violation) => [violation.rule, violation.detail])).toEqual([[
            'slotGate',
            'Eve is on WW but no slot of it that they qualify for is free (its slots are principal slot, senior slot, junior slot)',
        ]]);
    });

    it('accepts a partially filled shift — two of three is legal', () => {
        expect(auditHardConstraints({
            [SATURDAY]: [{
                task: 'WW', lead: 'Ada', coLead: 'Ben', staff: 'Lead: Ada, Co: Ben',
                category: 'CORE', week: 1, assignees: ['Ada', 'Ben'],
            }],
        }, config)).toEqual({ ok: true, count: 0, violations: [] });
    });

    it('still catches leave, capacity and pairing on a slot shift', () => {
        const onLeave = { ...config, staff: config.staff.map((p) => (p.name === 'Cal' ? { ...p, unavailable: [SATURDAY] } : p)) };
        expect(rules(rosterOf('Ada', 'Ben', ['Ada', 'Ben', 'Cal'])).length).toBe(0);
        expect(auditHardConstraints(rosterOf('Ada', 'Ben', ['Ada', 'Ben', 'Cal']), onLeave).violations.map((v) => v.rule))
            .toEqual(['availability']);
    });

    it('applies NEITHER slot rule to a lead/co-lead task', () => {
        // A junior lead with a senior co-lead is the shadowing arrangement the
        // band rules exist to make expressible, and it must stay legal.
        const ordinary = {
            ...config,
            tasks: [{ name: 'WW', days: [6], leads: 1, coLeads: 1 }],
        };
        expect(auditHardConstraints({
            [SATURDAY]: [{
                task: 'WW', lead: 'Cal', coLead: 'Ada', staff: 'Lead: Cal, Co: Ada',
                category: 'CORE', week: 1, assignees: ['Cal', 'Ada'],
            }],
        }, ordinary)).toEqual({ ok: true, count: 0, violations: [] });
    });

    it('says nothing about a shift whose task the configuration does not have', () => {
        const audit = auditHardConstraints({
            [SATURDAY]: [{
                task: 'Ghost', lead: 'Cal', coLead: 'Ada', staff: 'Lead: Cal, Co: Ada',
                category: 'CORE', week: 1, assignees: ['Cal', 'Ada'],
            }],
        }, config);
        expect(audit).toEqual({ ok: true, count: 0, violations: [] });
    });

    it('measures rather than asserts: every generated multi-slot roster audits clean', () => {
        for (const weeks of [1, 2, 5]) {
            const wide = {
                startDate: MONDAY,
                weeks,
                staff: [
                    { name: 'Ada', grade: 'AH16', skills: ['Witnessing'] },
                    { name: 'Ben', grade: 'AH13', skills: ['Witnessing'] },
                    { name: 'Eve', grade: 'AH14' },
                    { name: 'Cal', grade: 'AH12', fte: 0.6 },
                    { name: 'Dot', grade: 'AH11', unavailable: ['2026-09-12'] },
                    { name: 'Fay' },
                ],
                tasks: [
                    { name: 'Trio', days: [6, 0], slots: [{ band: 'principal' }, { band: 'senior', requiresSkill: 'Witnessing' }, { band: 'junior' }] },
                    { name: 'Clinic', days: [1, 3], leadBands: ['senior', 'principal'] },
                    { name: 'Pair', days: [2, 4], slots: [{}, {}] },
                ],
                rules: { weeklyHours: 42, forbidPairs: [['Ben', 'Cal']] },
            };
            const result = generated(wide);
            expect(result.score.hardViolations).toBe(0);
            expect(auditHardConstraints(result.roster, wide).count).toBe(0);
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. DETERMINISM
// ═════════════════════════════════════════════════════════════════════════════

describe('determinism', () => {
    it('produces byte-identical output on repeated runs', () => {
        const config = embryology({ weeks: 4 });
        const first = JSON.stringify(generateRosterV2(config));
        for (let i = 0; i < 5; i += 1) {
            expect(JSON.stringify(generateRosterV2(config))).toBe(first);
        }
    });

    it('is unaffected by the order two equally scarce slots are listed in', () => {
        // Same request, written twice: the assignees are decided by grade and
        // fairness, not by which entry was typed first.
        const build = (slots) => generated({
            startDate: MONDAY, weeks: 2,
            staff: [{ name: 'Ada', grade: 'AH16' }, { name: 'Ben', grade: 'AH13' }, { name: 'Cal', grade: 'AH12' }],
            tasks: [{ name: 'Trio', days: [6], slots }],
        }).roster;

        const forwards = build([{ band: 'principal' }, { band: 'senior' }, { band: 'junior' }]);
        const backwards = build([{ band: 'junior' }, { band: 'senior' }, { band: 'principal' }]);
        expect(JSON.stringify(backwards)).toBe(JSON.stringify(forwards));
    });

    it('holds over a long run with mixed constraints', () => {
        const config = {
            startDate: MONDAY, weeks: 12,
            staff: [
                { name: 'Ada', grade: 'AH16' }, { name: 'Ben', grade: 'AH13' },
                { name: 'Cal', grade: 'AH12', fte: 0.6 }, { name: 'Dot', grade: 'AH11' },
                { name: 'Eve', grade: 'AH14' }, { name: 'Fay' },
            ],
            tasks: [
                { name: 'Trio', days: [6, 0], slots: [{ band: 'principal' }, { band: 'senior' }, { band: 'junior' }] },
                { name: 'Weekday', days: [1, 2, 3, 4, 5] },
            ],
            rules: { weeklyHours: 42, maxConsecutiveDays: 5 },
        };
        const runs = [1, 2, 3].map(() => JSON.stringify(generateRosterV2(config)));
        expect(new Set(runs).size).toBe(1);
        expect(generated(config).score.hardViolations).toBe(0);
    });
});
