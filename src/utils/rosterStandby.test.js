/**
 * ==============================================================================
 * STANDBY — a second person who is NAMED, not present
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * A department told us, when asked what a co-lead means to them: *"all of my team's
 * clinics does not require two staff, but i need a lead and co-lead because if the
 * lead is down for whatever reason, the co-lead automatically knows what to do and
 * covers."*
 *
 * The engine had been counting that person as a second pair of hands: their daily
 * duty cap and their contracted hours were both charged for a session they do not
 * attend. On that department's own roster it produced 19 unfilled co-lead slots over
 * 17 weeks — a shortfall that did not exist, because five people were being asked to
 * supply ten bodies for five clinics that need five.
 *
 * `secondPerson: 'standby'` says the second seat is a NOMINATION. It costs the person
 * nothing; it still demands somebody who could genuinely run the clinic.
 *
 * ⚠️ THE TWO HALVES SHIP TOGETHER OR THE ENGINE ACCUSES ITSELF. The generator's gate
 *    and ledger stop charging a standby, and `auditHardConstraints` re-derives the
 *    same constraints from the FINISHED roster without trusting those counters. Exempt
 *    one and not the other and a correct roster comes back with `hardViolations`, and
 *    the app tells a roster master "AURA detected a hard-constraint violation … do not
 *    publish this roster". That pairing is what section 3 pins.
 */

import { describe, it, expect } from 'vitest';
import {
    generateRosterV2,
    validateRosterV2Config,
    CAPACITY_LIMITS,
} from './rosterEngineV2.js';

const DAILY = ['FT', 'IP+SK', 'WI+FS', 'NC'];
const TEAM = ['MA', 'BF', 'DK', 'FL', 'YX'];

/** The reporting department: five people, four daily duties, one twice-weekly. */
const config = ({ standby = false, cap = 2, weeks = 17, tasks = null } = {}) => ({
    startDate: '2026-09-07',
    weeks,
    rules: {
        rotateWeekly: true,
        maxConcurrentPerDay: cap,
        ...(standby ? { secondPerson: 'standby' } : {}),
    },
    /**
     * ⚠️ `MA` IS LIMITED TO ONE DUTY, AND THE FIXTURE WOULD BE DISHONEST WITHOUT IT.
     *    The department's roster master leads one clinic and nothing else. That is
     *    what makes five people unable to supply ten bodies for five duties, and it is
     *    the whole reason the 19 unfilled slots appeared. Drop the restriction and the
     *    working-co-lead roster fills perfectly — the first draft of this suite did,
     *    and asserted a shortfall that was not there.
     */
    staff: TEAM.map((name) => ({
        name, grade: 'AH13', fte: 1,
        ...(name === 'MA' ? { windows: [{ tasks: ['FT'] }] } : {}),
    })),
    tasks: tasks || [
        ...DAILY.map((name) => ({ name, days: [1, 2, 3, 4, 5], coLeads: 1 })),
        { name: 'VC', days: [4, 6], coLeads: 1 },
    ],
});

const unfilled = (run) => (run.unfilled || []).length;
const complains = (run) => (run.warnings || []).filter((w) => /hard-constraint|do not publish/i.test(w));

// ==============================================================================
// 1. THE POINT OF IT
// ==============================================================================

describe('a standby costs the person nothing', () => {
    it('fills a roster the same team could not fill as working co-leads', () => {
        // The exact shortfall the department reported: 19 slots over 17 weeks.
        expect(unfilled(generateRosterV2(config({ standby: false })))).toBeGreaterThan(0);
        expect(unfilled(generateRosterV2(config({ standby: true })))).toBe(0);
    });

    it('does not do it by working anybody harder', () => {
        // The fear with any "it fits now" change. Nobody LEADS more clinics than
        // before — the extra room is entirely in nominations.
        const mostLedInADay = (run) => {
            let most = 0;
            for (const shifts of Object.values(run.roster)) {
                const perPerson = {};
                for (const s of shifts) if (s.lead) perPerson[s.lead] = (perPerson[s.lead] || 0) + 1;
                most = Math.max(most, ...Object.values(perPerson));
            }
            return most;
        };
        expect(mostLedInADay(generateRosterV2(config({ standby: true }))))
            .toBeLessThanOrEqual(mostLedInADay(generateRosterV2(config({ standby: false }))));
    });

    /**
     * ⚠️ THE PAIRING. `auditHardConstraints` re-derives every hard rule from the
     *    finished roster and deliberately does not trust the generator's counters. If
     *    only the generator exempted a standby, this is the test that would fail —
     *    with the engine reporting a defect in itself on a roster it had just built
     *    correctly.
     */
    it('the audit agrees with the generator, so the engine does not accuse itself', () => {
        expect(complains(generateRosterV2(config({ standby: true })))).toEqual([]);
    });

    it('a standby may be named while already at their duty cap', () => {
        // The requirement, stated as arithmetic: with a cap of 1, five people can lead
        // four clinics and still be standby for them. As working co-leads they cannot.
        const tight = { cap: 1, weeks: 2, tasks: DAILY.map((n) => ({ name: n, days: [1, 2, 3, 4, 5], coLeads: 1 })) };
        expect(unfilled(generateRosterV2(config({ ...tight, standby: false })))).toBeGreaterThan(0);
        expect(unfilled(generateRosterV2(config({ ...tight, standby: true })))).toBe(0);
    });
});

describe('what a standby still costs, and still must be', () => {
    it('is never the same person as the lead of that shift', () => {
        // `onTaskToday` stays written for a standby precisely so this holds.
        const run = generateRosterV2(config({ standby: true }));
        for (const shifts of Object.values(run.roster)) {
            for (const s of shifts) {
                if (s.lead && s.coLead) expect(s.coLead, `${s.task}`).not.toBe(s.lead);
            }
        }
    });

    it('still has to be somebody who could run the clinic', () => {
        // Competence is not relaxed: the co-lead eligibility carries the task's skill
        // and grade floor whether the seat is worked or nominated. Nobody holds the
        // skill, so the seat cannot be filled even as a standby.
        const run = generateRosterV2(config({
            standby: true,
            weeks: 1,
            tasks: [{ name: 'CPET', days: [1, 2, 3, 4, 5], coLeads: 1, requiresSkill: 'CPET' }],
        }));
        expect(run.ok).toBe(false);
    });

    it('still counts as a duty for fairness, because knowing a clinic is work', () => {
        // `duties` keeps counting; only hours and the daily cap stop. Otherwise the
        // fairness score would call a standby-heavy colleague under-used.
        const run = generateRosterV2(config({ standby: true, weeks: 4 }));
        const named = new Set();
        for (const shifts of Object.values(run.roster)) for (const s of shifts) if (s.coLead) named.add(s.coLead);
        expect(named.size).toBeGreaterThan(1);
    });
});

// ==============================================================================
// 2. THE STRUCTURAL WARNINGS MUST NOT LIE EITHER
// ==============================================================================

describe('the capacity warnings measure occupied seats, not nominated ones', () => {
    const tight = {
        cap: 1, weeks: 2,
        tasks: DAILY.map((n) => ({ name: n, days: [1, 2, 3, 4, 5], coLeads: 1 })),
    };

    it('says nothing about a standby roster it just filled completely', () => {
        // Measured before the fix: 0 unfilled AND "asks for 80 duty slots but the team
        // can hold at most 50". A warning contradicted by the roster beneath it is
        // worse than no warning.
        const run = generateRosterV2(config({ ...tight, standby: true }));
        expect(unfilled(run)).toBe(0);
        expect((run.warnings || []).filter((w) => /can hold at most/i.test(w))).toEqual([]);
    });

    it('still warns when the team genuinely cannot hold the work', () => {
        const run = generateRosterV2(config({ ...tight, standby: false }));
        expect(unfilled(run)).toBeGreaterThan(0);
        expect((run.warnings || []).filter((w) => /can hold at most/i.test(w)).length).toBe(1);
    });
});

// ==============================================================================
// 3. NOTHING CHANGES FOR ANYBODY WHO HAS NOT ASKED
// ==============================================================================

describe('every existing tenant is untouched', () => {
    /**
     * ⚠️ THE COMPATIBILITY GUARANTEE, AS AN ASSERTION RATHER THAN AN INTENTION. No
     *    stored configuration in the estate carries `secondPerson`, so absent must
     *    behave exactly as `'alongside'` — the same principle that governs
     *    `rotateWeekly`. Compared as whole rosters, not as summary statistics.
     */
    it('an absent setting produces a byte-identical roster to an explicit alongside', () => {
        const absent = generateRosterV2(config({ standby: false }));
        const explicit = generateRosterV2({
            ...config({ standby: false }),
            rules: { ...config({ standby: false }).rules, secondPerson: 'alongside' },
        });
        expect(explicit.ok).toBe(true);
        expect(explicit.roster).toEqual(absent.roster);
        expect(explicit.unfilled).toEqual(absent.unfilled);
    });

    it('leaves the shift shape alone — no new key on a shift', () => {
        // `rosterEngineV2.slots.test.js` pins the exact key list, and stored documents
        // across every tenant have that shape. Standby is derived from the config, and
        // is never written into a roster document.
        const run = generateRosterV2(config({ standby: true, weeks: 1 }));
        const shift = Object.values(run.roster).flat()[0];
        expect(Object.keys(shift).sort())
            .toEqual(['assignees', 'category', 'coLead', 'lead', 'staff', 'task', 'week']);
    });

    it('keeps the exemption table honest about what it now contains', () => {
        // `exempt` used to mean one thing (a run that is not lengthened) and now means
        // two. The enumeration is the specification of the table, so it is asserted.
        expect(CAPACITY_LIMITS.filter((l) => l.exempt !== undefined).map((l) => l.id))
            .toEqual(['dutiesPerDay', 'hoursPerDay', 'hoursPerWeek', 'consecutiveDays']);
        // `taskPerDay` must NOT be exempt: it is what stops one person being both the
        // lead and the standby of the same shift.
        expect(CAPACITY_LIMITS.find((l) => l.id === 'taskPerDay').exempt).toBeUndefined();
    });
});

// ==============================================================================
// 4. REFUSED RATHER THAN COERCED
// ==============================================================================

describe('the setting is refused when it cannot mean anything', () => {
    it('refuses a value that is neither alongside nor standby', () => {
        for (const bad of ['stand-by', 'Standby', true, 1]) {
            const v = validateRosterV2Config(config({ tasks: [{ name: 'T', days: [1], secondPerson: bad }] }));
            expect(v.valid, `${JSON.stringify(bad)} was accepted`).toBe(false);
        }
    });

    /**
     * ⚠️ EXACTLY ONE CO-LEAD, AND THE REFUSAL IS LOAD-BEARING. Only the first attached
     *    fill reaches `shift.coLead`; any others are indistinguishable inside
     *    `assignees`. Both the audit and the score identify the standby seat as
     *    `name === shift.coLead`, so with two of them they would charge the wrong
     *    person for the session's hours. Refusing the shape turns an inference into
     *    a fact.
     */
    it('refuses standby on a task that has two second people, or none', () => {
        for (const coLeads of [0, 2, 3]) {
            const v = validateRosterV2Config(config({
                tasks: [{ name: 'T', days: [1, 2, 3, 4, 5], coLeads, secondPerson: 'standby' }],
            }));
            expect(v.valid, `coLeads: ${coLeads} was accepted`).toBe(false);
            expect(v.reason).toMatch(/exactly one|one named person/i);
        }
    });

    it('refuses standby beside slots, which have no second person to describe', () => {
        const v = validateRosterV2Config(config({
            tasks: [{ name: 'T', days: [1, 2, 3, 4, 5], slots: [{ band: 'senior' }], secondPerson: 'standby' }],
        }));
        expect(v.valid).toBe(false);
        expect(v.reason).toMatch(/slots and secondPerson/i);
    });

    it('refuses a departmental value that is not one of the two words', () => {
        const v = validateRosterV2Config({ ...config(), rules: { secondPerson: 'yes' } });
        expect(v.valid).toBe(false);
        expect(v.reason).toMatch(/must be "alongside" or "standby"/);
    });
});

describe('a task may override the department', () => {
    it('lets one clinic keep a working co-lead while the rest are standby', () => {
        const run = generateRosterV2(config({
            standby: true,
            weeks: 2,
            tasks: [
                ...DAILY.map((n) => ({ name: n, days: [1, 2, 3, 4, 5], coLeads: 1 })),
                { name: 'VC', days: [4], coLeads: 1, secondPerson: 'alongside' },
            ],
        }));
        expect(run.ok).toBe(true);
        expect(complains(run)).toEqual([]);
    });
});
