/**
 * ==============================================================================
 * WEEKLY ROTATION — one lead per duty per week, then it passes on
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * A department told us, plainly: "we rotate tasks weekly, it's that simple — even
 * if a task only lasts two days out of six, the next week another staff leads."
 * Their previous roster did exactly that; the current engine could not, because it
 * decides every (duty, DAY) on its own and so moved people between duties most
 * mornings. Measured on their own four-month roster: a duty changed lead mid-week
 * in 68 weeks out of 68.
 *
 * ⚠️ THE TWO EXISTING COMPARATORS BOTH FAIL THIS, IN OPPOSITE DIRECTIONS, which is
 *    why a third exists rather than a tweak to either:
 *
 *      compareCandidates            spreads a duty across the team by FTE-weighted
 *                                   fairness, re-decided daily.
 *      compareContinuityCandidates  concentrates a duty on ONE person for the whole
 *                                   run — a rotation of period one.
 *
 *    A weekly rotation is continuity WITHIN a week and the inverse of it BETWEEN
 *    weeks. Hence two keys, in that order.
 *
 * ⚠️ AND IT IS OFF BY DEFAULT. Every roster generated before this existed must come
 *    out byte-identical, so the last suite here pins that.
 */

import { describe, it, expect } from 'vitest';
import { generateRosterV2, validateRosterV2Config } from './rosterEngineV2.js';

/** The reporting department: five people, four daily duties, one twice-weekly. */
const TEAM = ['Alif', 'Brandon', 'Derlinder', 'Fadzlynn', 'Ying Xian'];
const DAILY = ['EFT', 'IPT+SKG', 'WI+FSG', 'NC'];

const config = ({ rotate = true, weeks = 17, staff = null, tasks = null } = {}) => ({
    startDate: '2026-09-07',
    weeks,
    rules: { rotateWeekly: rotate },
    staff: staff || TEAM.map((name) => ({ name, grade: 'AH13', fte: 1 })),
    tasks: tasks || [
        ...DAILY.map((name) => ({ name, days: [1, 2, 3, 4, 5], coLeads: 1 })),
        { name: 'VC', days: [4, 6], coLeads: 0 },
    ],
});

/** week -> task -> the set of people who LED it that week. */
const leadsByWeek = (roster) => {
    const out = {};
    for (const shifts of Object.values(roster)) {
        for (const shift of shifts) {
            out[shift.week] ??= {};
            (out[shift.week][shift.task] ??= new Set()).add(shift.lead);
        }
    }
    return out;
};

/** How many (week, duty) pairs had more than one lead — i.e. changed hands mid-week. */
const midWeekChanges = (roster) => {
    let changed = 0;
    for (const perTask of Object.values(leadsByWeek(roster))) {
        for (const leads of Object.values(perTask)) if (leads.size > 1) changed += 1;
    }
    return changed;
};

describe('a duty is held by one person for the whole week', () => {
    it('never changes lead mid-week, across a four-month run', () => {
        const run = generateRosterV2(config());
        expect(run.ok).toBe(true);
        expect(midWeekChanges(run.roster)).toBe(0);
    });

    it('and the same run WITHOUT rotation changes lead in essentially every week', () => {
        // The control. Without this the test above could pass on a roster that
        // happened to be stable, and would still pass if the flag did nothing.
        const run = generateRosterV2(config({ rotate: false }));
        expect(run.ok).toBe(true);
        expect(midWeekChanges(run.roster)).toBeGreaterThan(50);
    });

    it('fills every slot — a rotation must not cost coverage', () => {
        const run = generateRosterV2(config());
        expect(run.unfilled ?? []).toHaveLength(0);
    });

    /**
     * ⚠️ THE OWNER'S WORDING: "even if some task only lasts two days out of the six
     *    in a week, the next week another staff leads." A duty that runs twice a
     *    week is still ONE person's duty for that week.
     */
    it('holds a twice-weekly duty for its week too', () => {
        const run = generateRosterV2(config());
        for (const perTask of Object.values(leadsByWeek(run.roster))) {
            if (perTask.VC) expect(perTask.VC.size).toBe(1);
        }
    });
});

describe('the duty passes on, and comes back on a cycle', () => {
    it('gives a different person the duty the following week', () => {
        const run = generateRosterV2(config({ weeks: 6 }));
        const byWeek = leadsByWeek(run.roster);
        for (const task of DAILY) {
            for (let week = 1; week < 6; week += 1) {
                const now = [...byWeek[week][task]][0];
                const next = [...byWeek[week + 1][task]][0];
                expect(next, `${task} kept ${now} in week ${week + 1}`).not.toBe(now);
            }
        }
    });

    /**
     * ⚠️ WHAT IS **NOT** CLAIMED, AND WHY. An earlier draft of this suite asserted a
     *    strict Latin square — every duty returning to the same person after exactly
     *    one pass through the team — and it failed, correctly. The engine assigns
     *    greedily, slot by slot, and a duty that runs only twice a week absorbs one
     *    person for the week; on the owner's department that parked one colleague on
     *    VC for the first four weeks, so he entered the daily rotation late and that
     *    duty's cycle ran short.
     *
     *    A true Latin square needs the whole week solved as one matching problem
     *    rather than slot by slot, which is a different engine. What IS guaranteed is
     *    below, and it is what the department asked for: the duty is held for the
     *    week, it moves on, and over a run everybody does everything.
     */
    /**
     * ⚠️ EVERY DUTY, INCLUDING THE TWICE-WEEKLY ONE — and the earlier version of this
     *    test looped over `DAILY` alone, which is exactly why the defect shipped. The
     *    engine held the video-consultation duty with the same colleague for four
     *    weeks running while this suite stayed green, because the only duty that broke
     *    was the one duty not being checked. A test that excludes the awkward case is
     *    not evidence about the awkward case.
     */
    it('never keeps the same lead on a duty two weeks running — every duty', () => {
        const run = generateRosterV2(config());
        const byWeek = leadsByWeek(run.roster);
        const weeks = Object.keys(byWeek).map(Number).sort((a, b) => a - b);
        for (const task of [...DAILY, 'VC']) {
            for (let i = 1; i < weeks.length; i += 1) {
                const previous = [...(byWeek[weeks[i - 1]][task] ?? [])][0];
                const current = [...(byWeek[weeks[i]][task] ?? [])][0];
                if (!previous || !current) continue;
                expect(current, `${task} kept ${previous} into week ${weeks[i]}`).not.toBe(previous);
            }
        }
    });

    it('gives every person every duty over the run', () => {
        // The property that makes it a rotation rather than a shuffle: nobody is
        // quietly excluded from a duty for four months.
        const run = generateRosterV2(config());
        const held = {};
        for (const shifts of Object.values(run.roster)) {
            for (const shift of shifts) {
                (held[shift.lead] ??= {})[shift.task] = (held[shift.lead][shift.task] || 0) + 1;
            }
        }
        for (const person of TEAM) {
            for (const task of DAILY) {
                expect(held[person]?.[task] ?? 0, `${person} never led ${task}`).toBeGreaterThan(0);
            }
        }
    });

    /**
     * ⚠️ ONE LEAD DUTY PER PERSON PER WEEK. Without the spreading key this failed on
     *    weeks 3 and 5 of the owner's own department: one colleague led two duties
     *    while another led none.
     */
    it('does not give one person two duties while another leads none', () => {
        const run = generateRosterV2(config());
        for (const [week, perTask] of Object.entries(leadsByWeek(run.roster))) {
            const held = [...DAILY, 'VC'].map((task) => [...(perTask[task] ?? [])][0]).filter(Boolean);
            expect(new Set(held).size, `week ${week} doubled somebody up`).toBe(held.length);
        }
    });

    /**
     * With as many people as duties, a week should be a clean assignment: everybody
     * leads exactly one thing. This is the property the twice-weekly duty broke — one
     * colleague led nothing for four weeks while another doubled up.
     */
    it('gives every person exactly one duty to lead each week', () => {
        const run = generateRosterV2(config());
        for (const [week, perTask] of Object.entries(leadsByWeek(run.roster))) {
            const held = [...DAILY, 'VC'].map((task) => [...(perTask[task] ?? [])][0]).filter(Boolean);
            expect(held.length, `week ${week} did not staff every duty`).toBe(5);
            expect(new Set(held).size, `week ${week} was not one duty each`).toBe(5);
        }
    });

    it('gives every person every duty over the run, none more than twice the least', () => {
        const run = generateRosterV2(config());
        const weeksHeld = {};
        for (const [, perTask] of Object.entries(leadsByWeek(run.roster))) {
            for (const [task, leads] of Object.entries(perTask)) {
                for (const person of leads) (weeksHeld[person] ??= {})[task] = (weeksHeld[person][task] || 0) + 1;
            }
        }
        for (const person of TEAM) {
            const counts = [...DAILY, 'VC'].map((task) => weeksHeld[person]?.[task] ?? 0);
            expect(Math.min(...counts), `${person} was shut out of a duty`).toBeGreaterThan(0);
            expect(Math.max(...counts) / Math.min(...counts), `${person}'s duties are lopsided`).toBeLessThanOrEqual(2);
        }
    });

    it('shares the lead load across the run', () => {
        const run = generateRosterV2(config());
        const leads = {};
        for (const shifts of Object.values(run.roster)) {
            for (const shift of shifts) leads[shift.lead] = (leads[shift.lead] || 0) + 1;
        }
        const counts = TEAM.map((name) => leads[name] || 0);
        // Nobody carries less than two thirds of the busiest person's lead days.
        expect(Math.min(...counts) / Math.max(...counts)).toBeGreaterThan(0.66);
    });
});

describe('leave does not hand the week over', () => {
    /**
     * ⚠️ THE CONVENTION, STATED: leave is a HARD gate applied before any comparator,
     *    so the week's lead is simply not a candidate on the day they are away and
     *    somebody stands in. On the next day they are a candidate again, they still
     *    hold the highest `ledThisWeek` for that duty, and they get it back. A week
     *    does not change hands over one absent day.
     */
    it('a stand-in covers the day, and the lead resumes after it', () => {
        const staff = TEAM.map((name) => ({
            name, grade: 'AH13', fte: 1,
            ...(name === 'Alif' ? { unavailable: ['2026-09-09'] } : {}),
        }));
        const run = generateRosterV2(config({ weeks: 1, staff }));
        expect(run.ok).toBe(true);

        const leadOn = (dateKey, task) =>
            (run.roster[dateKey] || []).find((shift) => shift.task === task)?.lead;

        // Whichever duty Alif holds that week, he holds it either side of the gap…
        const held = DAILY.find((task) => leadOn('2026-09-07', task) === 'Alif');
        expect(held, 'Alif led no duty in week 1').toBeTruthy();
        expect(leadOn('2026-09-08', held)).toBe('Alif');
        // …somebody else covers the Wednesday…
        expect(leadOn('2026-09-09', held)).not.toBe('Alif');
        expect(leadOn('2026-09-09', held)).toBeTruthy();
        // …and it is his again on the Thursday.
        expect(leadOn('2026-09-10', held)).toBe('Alif');
    });
});

describe('the switch is off unless asked for', () => {
    it('an absent rules object rosters exactly as it did before rotation existed', () => {
        const withFlagOff = generateRosterV2(config({ rotate: false }));
        const noRulesAtAll = generateRosterV2({ ...config(), rules: undefined });
        expect(noRulesAtAll.ok).toBe(true);
        expect(noRulesAtAll.roster).toEqual(withFlagOff.roster);
    });

    it('refuses a non-boolean rather than reading it as off', () => {
        // `'yes'` is truthy to a human and false to `=== true`, so coercing would
        // hand somebody a per-day roster having asked for a weekly one.
        const bad = validateRosterV2Config({ ...config(), rules: { rotateWeekly: 'yes' } });
        expect(bad.valid).toBe(false);
        expect(bad.reason).toMatch(/must be true or false/i);
    });

    it('refuses rotation alongside a continuity task, naming the task', () => {
        const clash = validateRosterV2Config(config({
            tasks: [{ name: 'Ward Round', days: [1, 2, 3, 4, 5], continuity: true }],
        }));
        expect(clash.valid).toBe(false);
        expect(clash.reason).toMatch(/Ward Round/);
        expect(clash.reason).toMatch(/continuity/i);
    });

    it('still allows continuity on its own', () => {
        const fine = validateRosterV2Config({
            ...config({ tasks: [{ name: 'Ward Round', days: [1, 2, 3, 4, 5], continuity: true }] }),
            rules: {},
        });
        expect(fine.valid).toBe(true);
    });
});
