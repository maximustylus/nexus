/**
 * ==============================================================================
 * AURA ROSTER — SHIFT-SWAP APPLICATION SUITE (ROSTER_TODO.md P2 + P3 + P6)
 * ==============================================================================
 * Runner: Vitest
 * Run:    npm test
 *
 * PURPOSE — these are SPECIFICATION tests. They pin the behaviour the swap flow
 * is supposed to have, in contrast to the characterization suite in
 * `auraEngine.test.js`, which pins what `generateRoster` does today, bugs and
 * all. Nothing in this file touches `generateRoster`'s scheduling.
 *
 * What is being fixed here, by id:
 *
 *   A1  (POSTMORTEM)  accepting a swap did not change the roster: the mutator
 *                     compared the display string `"Lead: Brandon, Co: Ying Xian"`
 *                     to the bare name `"Brandon"`, matched nothing, wrote
 *                     byte-identical data, and reported success.
 *   A2  (POSTMORTEM)  a corrected match would still have written the wrong thing:
 *                     `lead`/`coLead` untouched, display string destroyed.
 *   A3  (POSTMORTEM)  the request never recorded WHICH role was being swapped —
 *                     the true root cause. `shiftRoleOf` is what RosterView now
 *                     uses to derive `swapRole` at request time.
 *   A4  (POSTMORTEM)  the candidate dropdown filtered by substring.
 *   M5  (QC AUDIT)    a queued coverage alert was destroyed by a session reset.
 *   M9 / A-RC4        `APPROVED` was written before the roster mutation, and the
 *                     success message was an unconditional literal.
 *
 * SEMANTICS UNDER TEST — MECHANICAL SUBSTITUTION. The covering colleague takes
 * over exactly the role the requester held. No promotion; no third person's duty
 * changes. This is a decision, not a derivation: see ROSTER_TODO.md P6.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
    generateRoster,
    buildShiftStaffLabel,
    readShiftIdentities,
    shiftRoleOf,
    applyShiftSubstitution,
    filterSwapCandidates,
    assignableShiftRoles,
    resolveSwapSubject,
    planSwapApplication,
    findAppliedSwapShift,
    verifySwapApplied,
    describeShiftRole,
    pendingRosterAlerts,
    resetMessagesPreservingAlerts,
    appendRosterAlert,
    ROSTER_ALERT_MODE,
    SHIFT_ROLE_LEAD,
    SHIFT_ROLE_CO_LEAD,
} from './auraEngine';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** A shift in the MODERN shape — what `generateRoster` has written since 6 May. */
const modernShift = (overrides = {}) => {
    const lead = overrides.lead ?? 'Brandon';
    const coLead = overrides.coLead ?? 'Ying Xian';
    return {
        task: 'EFT',
        lead,
        coLead,
        staff: `Lead: ${lead}, Co: ${coLead}`,
        category: 'CORE',
        week: 1,
        ...overrides,
    };
};

/**
 * A shift in the LEGACY shape — what the generator wrote BEFORE 6 May 2026
 * (`git show 48ac13c:src/utils/auraEngine.js`): `staff` was the identity and
 * there were no `lead` / `coLead` fields at all. The live document may still
 * hold these; nobody knows, and it will not be established before the
 * presentation.
 */
const legacyShift = (overrides = {}) => ({
    task: 'EFT',
    staff: 'Brandon',
    category: 'CORE',
    ...overrides,
});

const DATE = '2026-02-02';

const swapRequest = (overrides = {}) => ({
    docId: 'swap_1',
    requestedBy: 'Brandon',
    targetStaff: 'Derlinder',
    originalShiftDate: DATE,
    originalTask: 'EFT',
    swapRole: SHIFT_ROLE_LEAD,
    reason: 'Conference',
    status: 'PENDING',
    ...overrides,
});

/** Apply a plan the way AuraPulseBot does, producing the post-write roster. */
const applyPlan = (roster, plan) => ({ ...roster, [plan.dateKey]: plan.shifts });

// ─── The display string ──────────────────────────────────────────────────────
describe('buildShiftStaffLabel — the one definition of the display string', () => {
    it('formats a two-person shift as `Lead: X, Co: Y`', () => {
        // The ICS export interpolates this straight into a VEVENT SUMMARY, so
        // the format is a contract, not a cosmetic choice.
        expect(buildShiftStaffLabel('Brandon', 'Ying Xian')).toBe('Lead: Brandon, Co: Ying Xian');
    });

    it('omits the co-lead clause entirely when there is no co-lead', () => {
        // A legacy shift has exactly one person. `Lead: X, Co: undefined` would
        // be exported to every clinician's calendar.
        expect(buildShiftStaffLabel('Brandon', null)).toBe('Lead: Brandon');
        expect(buildShiftStaffLabel('Brandon', undefined)).toBe('Lead: Brandon');
        expect(buildShiftStaffLabel('Brandon', '   ')).toBe('Lead: Brandon');
    });

    it('is the same string `generateRoster` writes for every shift it produces', () => {
        // Guards the refactor that pointed the generator at this builder: if the
        // two ever diverge, this fails rather than the ICS export drifting.
        const roster = generateRoster({
            staff: ['Brandon', 'Ying Xian', 'Derlinder', 'Fadzlynn'],
            tasks: ['EFT', 'IPT+SKG', 'NC', 'FSG+WI'],
            startDate: '2026-02-01',
            weeks: 2,
        });

        const all = Object.values(roster).flat();
        expect(all.length).toBeGreaterThan(0);
        all.forEach((shift) => {
            expect(shift.staff).toBe(buildShiftStaffLabel(shift.lead, shift.coLead));
        });
    });
});

// ─── Reading identity out of either shape ────────────────────────────────────
describe('readShiftIdentities — shape tolerance', () => {
    it('reads lead and coLead from a modern shift', () => {
        expect(readShiftIdentities(modernShift())).toEqual({
            lead: 'Brandon',
            coLead: 'Ying Xian',
            legacy: false,
        });
    });

    it('reads a legacy bare `staff` as the lead, and flags the shape', () => {
        expect(readShiftIdentities(legacyShift())).toEqual({
            lead: 'Brandon',
            coLead: null,
            legacy: true,
        });
    });

    it('refuses to parse identity back out of a display string', () => {
        // A `staff` of "Lead: A, Co: B" with no lead/coLead fields should not
        // exist. If it does, re-deriving names from the label is exactly the
        // move that produced this whole defect class — so it reads as unknown.
        const malformed = { task: 'EFT', staff: 'Lead: Brandon, Co: Ying Xian' };
        expect(readShiftIdentities(malformed)).toEqual({ lead: null, coLead: null, legacy: false });
    });

    it('treats blank and non-string fields as absent', () => {
        expect(readShiftIdentities({ lead: '  ', coLead: null, staff: '' })).toEqual({
            lead: null,
            coLead: null,
            legacy: false,
        });
        expect(readShiftIdentities(null)).toEqual({ lead: null, coLead: null, legacy: false });
        expect(readShiftIdentities('EFT')).toEqual({ lead: null, coLead: null, legacy: false });
    });
});

// ─── Which role does a person hold? (root cause A3) ──────────────────────────
describe('shiftRoleOf — the role lookup RosterView uses to record `swapRole`', () => {
    it('identifies the lead', () => {
        expect(shiftRoleOf(modernShift(), 'Brandon')).toBe(SHIFT_ROLE_LEAD);
    });

    it('identifies the co-lead', () => {
        expect(shiftRoleOf(modernShift(), 'Ying Xian')).toBe(SHIFT_ROLE_CO_LEAD);
    });

    it('returns null for somebody not on the shift', () => {
        expect(shiftRoleOf(modernShift(), 'Derlinder')).toBeNull();
    });

    it('returns lead for the single person on a legacy shift', () => {
        expect(shiftRoleOf(legacyShift(), 'Brandon')).toBe(SHIFT_ROLE_LEAD);
    });

    it('does not match a name that is merely a substring of a person on the shift', () => {
        // A4: "Lynn" is not "Fadzlynn".
        const shift = modernShift({ lead: 'Fadzlynn', coLead: 'Derlinder' });
        expect(shiftRoleOf(shift, 'Lynn')).toBeNull();
        expect(shiftRoleOf(shift, 'Fadzlynn')).toBe(SHIFT_ROLE_LEAD);
    });

    it('returns null for a blank or missing name rather than matching an empty field', () => {
        expect(shiftRoleOf(modernShift(), '')).toBeNull();
        expect(shiftRoleOf(modernShift(), undefined)).toBeNull();
        expect(shiftRoleOf({ task: 'EFT' }, undefined)).toBeNull();
    });
});

// ─── Mechanical substitution ─────────────────────────────────────────────────
describe('applyShiftSubstitution — mechanical substitution, one role only', () => {
    it('substitutes the LEAD and leaves the co-lead untouched', () => {
        const next = applyShiftSubstitution(modernShift(), SHIFT_ROLE_LEAD, 'Derlinder');

        expect(next.lead).toBe('Derlinder');
        expect(next.coLead).toBe('Ying Xian'); // no promotion, no third party moved
        expect(next.staff).toBe('Lead: Derlinder, Co: Ying Xian');
    });

    it('substitutes the CO-LEAD and leaves the lead untouched', () => {
        const next = applyShiftSubstitution(modernShift(), SHIFT_ROLE_CO_LEAD, 'Derlinder');

        expect(next.lead).toBe('Brandon');
        expect(next.coLead).toBe('Derlinder');
        expect(next.staff).toBe('Lead: Brandon, Co: Derlinder');
    });

    it('rebuilds the display string in the `Lead: X, Co: Y` format the ICS export needs', () => {
        const next = applyShiftSubstitution(modernShift(), SHIFT_ROLE_LEAD, 'Fadzlynn');
        expect(next.staff).toBe(buildShiftStaffLabel(next.lead, next.coLead));
        expect(next.staff).toMatch(/^Lead: .+, Co: .+$/);
    });

    it('preserves every field it does not own', () => {
        const next = applyShiftSubstitution(modernShift(), SHIFT_ROLE_LEAD, 'Derlinder');
        expect(next.task).toBe('EFT');
        expect(next.category).toBe('CORE');
        expect(next.week).toBe(1);
    });

    it('does not mutate the shift it was given', () => {
        const original = modernShift();
        applyShiftSubstitution(original, SHIFT_ROLE_LEAD, 'Derlinder');
        expect(original.lead).toBe('Brandon');
        expect(original.staff).toBe('Lead: Brandon, Co: Ying Xian');
    });

    it('upgrades a LEGACY shift to the modern shape on write', () => {
        const next = applyShiftSubstitution(legacyShift(), SHIFT_ROLE_LEAD, 'Derlinder');

        expect(next.lead).toBe('Derlinder');
        expect(next.staff).toBe('Lead: Derlinder');
        // No co-lead is invented: nobody assigned a second person to this shift.
        expect('coLead' in next).toBe(false);
        // And it now reads as modern, so the same document is never treated as
        // legacy twice.
        expect(readShiftIdentities(next).legacy).toBe(false);
    });

    it('returns the shift unchanged for a nonsense role or empty incoming name', () => {
        const shift = modernShift();
        expect(applyShiftSubstitution(shift, 'admin', 'Derlinder')).toBe(shift);
        expect(applyShiftSubstitution(shift, SHIFT_ROLE_LEAD, '  ')).toBe(shift);
        expect(applyShiftSubstitution(shift, SHIFT_ROLE_LEAD, undefined)).toBe(shift);
    });
});

// ─── The candidate dropdown (A4) ─────────────────────────────────────────────
describe('filterSwapCandidates — identity comparison, not substring', () => {
    it('removes exactly the two people already on the shift', () => {
        const pool = ['Brandon', 'Ying Xian', 'Derlinder', 'Fadzlynn'];
        expect(filterSwapCandidates(pool, modernShift())).toEqual(['Derlinder', 'Fadzlynn']);
    });

    it('does NOT drop a colleague whose name is a substring of a name on the shift', () => {
        // The regression this function exists for: `!staff.includes('Lynn')` was
        // false for "Lead: Fadzlynn, Co: Derlinder", so Lynn vanished from the
        // dropdown and could never be asked to cover.
        const pool = ['Lynn', 'Fadzlynn', 'Derlinder', 'Brandon'];
        const shift = modernShift({ lead: 'Fadzlynn', coLead: 'Derlinder' });

        const candidates = filterSwapCandidates(pool, shift);

        expect(candidates).toContain('Lynn');
        expect(candidates).not.toContain('Fadzlynn');
        expect(candidates).not.toContain('Derlinder');
        expect(candidates).toEqual(['Lynn', 'Brandon']);
    });

    it('is not fooled by the words "Lead" or "Co" appearing in the label', () => {
        const pool = ['Lead', 'Co', 'Derlinder'];
        expect(filterSwapCandidates(pool, modernShift())).toEqual(['Lead', 'Co', 'Derlinder']);
    });

    it('removes the single person on a legacy shift', () => {
        const pool = ['Brandon', 'Derlinder'];
        expect(filterSwapCandidates(pool, legacyShift())).toEqual(['Derlinder']);
    });

    it('drops blank pool entries and tolerates a missing pool or shift', () => {
        expect(filterSwapCandidates(['Brandon', '', '  ', 'Derlinder'], modernShift())).toEqual(['Derlinder']);
        expect(filterSwapCandidates(null, modernShift())).toEqual([]);
        expect(filterSwapCandidates(['Brandon'], null)).toEqual(['Brandon']);
    });
});

// ─── Whose shift is it? (M11) ────────────────────────────────────────────────
//
// ROSTER_QC_AUDIT.md M11: `RosterView` wrote `requestedBy: <the clicking user>`
// unconditionally and derived `swapRole` from that same user. An admin is
// allowed to open the swap modal on any shift, and the app's admins are not in
// the roster staff pool at all — so an admin-brokered request was always written
// as `(<admin>, null)` and `planSwapApplication` was always going to refuse it.
//
// SEMANTICS: an admin who does not hold the shift is not asking for cover for
// themselves, they are arranging it ON BEHALF OF the clinician who does hold it.
// `requestedBy` therefore means "the person being swapped out" — which is what
// the mutator matches on — and `initiatedBy` records who arranged it.

describe('assignableShiftRoles — the duties a shift actually has somebody in', () => {
    it('lists both duties of a modern two-person shift, lead first', () => {
        expect(assignableShiftRoles(modernShift())).toEqual([
            { role: SHIFT_ROLE_LEAD, holder: 'Brandon' },
            { role: SHIFT_ROLE_CO_LEAD, holder: 'Ying Xian' },
        ]);
    });

    it('lists only the lead of a legacy single-holder shift', () => {
        expect(assignableShiftRoles(legacyShift())).toEqual([
            { role: SHIFT_ROLE_LEAD, holder: 'Brandon' },
        ]);
    });

    it('lists only the lead when a modern shift was written with no co-lead', () => {
        expect(assignableShiftRoles(modernShift({ coLead: null }))).toEqual([
            { role: SHIFT_ROLE_LEAD, holder: 'Brandon' },
        ]);
    });

    it('returns nothing for a shift whose identities cannot be read', () => {
        // Including the malformed display-string-only shape: an empty list is the
        // signal that there is nobody to arrange cover FOR, not a licence to
        // parse names back out of the label.
        expect(assignableShiftRoles({ task: 'EFT', staff: 'Lead: Brandon, Co: Ying Xian' })).toEqual([]);
        expect(assignableShiftRoles(null)).toEqual([]);
    });
});

describe('resolveSwapSubject — the acting user HOLDS the shift (unchanged behaviour)', () => {
    it('records a LEAD swapping their own duty', () => {
        const subject = resolveSwapSubject({ shift: modernShift(), actingUser: 'Brandon' });

        expect(subject.ok).toBe(true);
        expect(subject.requestedBy).toBe('Brandon');
        expect(subject.swapRole).toBe(SHIFT_ROLE_LEAD);
        expect(subject.initiatedBy).toBeNull();
        expect(subject.holdsShift).toBe(true);
        expect(subject.onBehalf).toBe(false);
    });

    it('records a CO-LEAD swapping their own duty', () => {
        const subject = resolveSwapSubject({ shift: modernShift(), actingUser: 'Ying Xian' });

        expect(subject.ok).toBe(true);
        expect(subject.requestedBy).toBe('Ying Xian');
        expect(subject.swapRole).toBe(SHIFT_ROLE_CO_LEAD);
        expect(subject.initiatedBy).toBeNull();
        expect(subject.holdsShift).toBe(true);
    });

    it('records the single holder of a LEGACY shift as the lead', () => {
        const subject = resolveSwapSubject({ shift: legacyShift(), actingUser: 'Brandon' });

        expect(subject.ok).toBe(true);
        expect(subject.requestedBy).toBe('Brandon');
        expect(subject.swapRole).toBe(SHIFT_ROLE_LEAD);
    });

    it('is unaffected by being an admin, and IGNORES a chosen role', () => {
        // An admin who is on the shift is still swapping their OWN duty. Letting
        // `chosenRole` override here would let one click reassign a colleague's
        // duty while the modal said "your shift".
        const subject = resolveSwapSubject({
            shift: modernShift(),
            actingUser: 'Brandon',
            isAdmin: true,
            chosenRole: SHIFT_ROLE_CO_LEAD,
        });

        expect(subject.ok).toBe(true);
        expect(subject.requestedBy).toBe('Brandon');
        expect(subject.swapRole).toBe(SHIFT_ROLE_LEAD);
        expect(subject.initiatedBy).toBeNull();
    });

    it('does not match a name that is merely a substring of a holder (A4)', () => {
        const shift = modernShift({ lead: 'Fadzlynn', coLead: 'Derlinder' });
        expect(resolveSwapSubject({ shift, actingUser: 'Lynn' }).ok).toBe(false);
    });
});

describe('resolveSwapSubject — an ADMIN on a TWO-ROLE shift picks the duty', () => {
    const asAdmin = (chosenRole) =>
        resolveSwapSubject({ shift: modernShift(), actingUser: 'Alif', isAdmin: true, chosenRole });

    it('arranges cover for the LEAD when lead is chosen', () => {
        const subject = asAdmin(SHIFT_ROLE_LEAD);

        expect(subject.ok).toBe(true);
        // The clinician holding the duty, NOT the admin. This is the whole fix.
        expect(subject.requestedBy).toBe('Brandon');
        expect(subject.swapRole).toBe(SHIFT_ROLE_LEAD);
        expect(subject.initiatedBy).toBe('Alif');
        expect(subject.onBehalf).toBe(true);
        expect(subject.holdsShift).toBe(false);
        expect(subject.autoSelected).toBe(false);
    });

    it('arranges cover for the CO-LEAD when co-lead is chosen', () => {
        const subject = asAdmin(SHIFT_ROLE_CO_LEAD);

        expect(subject.ok).toBe(true);
        expect(subject.requestedBy).toBe('Ying Xian');
        expect(subject.swapRole).toBe(SHIFT_ROLE_CO_LEAD);
        expect(subject.initiatedBy).toBe('Alif');
        expect(subject.onBehalf).toBe(true);
    });

    it('refuses until a duty is chosen, and offers both by name', () => {
        const subject = asAdmin('');

        expect(subject.ok).toBe(false);
        expect(subject.requestedBy).toBeNull();
        expect(subject.swapRole).toBeNull();
        expect(subject.reason).toMatch(/choose whose duty/i);
        expect(subject.reason).toContain('Brandon');
        expect(subject.reason).toContain('Ying Xian');
        // The UI needs the list precisely on this refusal, in order to offer it.
        expect(subject.assignableRoles).toHaveLength(2);
    });

    it('refuses a duty nobody on the shift holds', () => {
        expect(asAdmin('admin').ok).toBe(false);
        expect(resolveSwapSubject({
            shift: modernShift({ coLead: null }),
            actingUser: 'Alif',
            isAdmin: true,
            chosenRole: SHIFT_ROLE_CO_LEAD,
        }).swapRole).toBe(SHIFT_ROLE_LEAD); // single-holder: the only duty there is
    });
});

describe('resolveSwapSubject — an ADMIN on a LEGACY single-holder shift', () => {
    it('selects the only duty automatically, without being asked', () => {
        // A pre-6-May shift has exactly one person. Forcing an admin to pick
        // "lead" out of a list of one is a pointless choice, and a `chosenRole`
        // of `null` must not block the request.
        const subject = resolveSwapSubject({ shift: legacyShift(), actingUser: 'Alif', isAdmin: true });

        expect(subject.ok).toBe(true);
        expect(subject.requestedBy).toBe('Brandon');
        expect(subject.swapRole).toBe(SHIFT_ROLE_LEAD);
        expect(subject.initiatedBy).toBe('Alif');
        expect(subject.autoSelected).toBe(true);
        expect(subject.assignableRoles).toEqual([{ role: SHIFT_ROLE_LEAD, holder: 'Brandon' }]);
    });

    it('refuses a shift that does not record who is on it', () => {
        const unreadable = { task: 'EFT', staff: 'Lead: Brandon, Co: Ying Xian' };
        const subject = resolveSwapSubject({ shift: unreadable, actingUser: 'Alif', isAdmin: true });

        expect(subject.ok).toBe(false);
        expect(subject.reason).toMatch(/does not record who is on it/i);
    });
});

describe('resolveSwapSubject — refusals', () => {
    it('refuses a non-holder who is not an admin', () => {
        // `handleShiftClick` already gates this; the refusal is the second latch.
        const subject = resolveSwapSubject({ shift: modernShift(), actingUser: 'Derlinder' });

        expect(subject.ok).toBe(false);
        expect(subject.requestedBy).toBeNull();
        expect(subject.swapRole).toBeNull();
        expect(subject.initiatedBy).toBeNull();
        expect(subject.reason).toMatch(/not on this shift/i);
        expect(subject.reason).toMatch(/administrator/i);
    });

    it('refuses a non-holder non-admin even on a legacy shift', () => {
        expect(resolveSwapSubject({ shift: legacyShift(), actingUser: 'Derlinder' }).ok).toBe(false);
    });

    it('refuses when the acting user has no resolvable name', () => {
        expect(resolveSwapSubject({ shift: modernShift(), actingUser: undefined }).reason)
            .toMatch(/could not tell who is making this request/i);
        // An unattributable reassignment of somebody else's duty is worse than
        // no reassignment: `initiatedBy` is the entire point of that path.
        expect(resolveSwapSubject({ shift: modernShift(), actingUser: '  ', isAdmin: true }).reason)
            .toMatch(/could not tell who is arranging this cover/i);
    });

    it('never returns a partial triple on any refusal path', () => {
        const refusals = [
            resolveSwapSubject(),
            resolveSwapSubject({ shift: null, actingUser: 'Alif', isAdmin: true }),
            resolveSwapSubject({ shift: modernShift(), actingUser: 'Derlinder' }),
            resolveSwapSubject({ shift: modernShift(), actingUser: 'Alif', isAdmin: true }),
        ];

        refusals.forEach((subject) => {
            expect(subject.ok).toBe(false);
            expect(subject.requestedBy).toBeNull();
            expect(subject.swapRole).toBeNull();
            expect(subject.initiatedBy).toBeNull();
            expect(subject.onBehalf).toBe(false);
            expect(typeof subject.reason).toBe('string');
            expect(Array.isArray(subject.assignableRoles)).toBe(true);
        });
    });
});

describe('resolveSwapSubject → planSwapApplication — the two sides cannot drift apart', () => {
    // The contract that matters: whatever triple the REQUEST side records is
    // exactly what the ACCEPTANCE side later matches on. Asserted against the
    // real `planSwapApplication`, not a restatement of its rules, so a change to
    // either function breaks this rather than breaking a live swap.
    const requestThenAccept = ({ shift, actingUser, isAdmin, chosenRole, coveringStaff }) => {
        const subject = resolveSwapSubject({ shift, actingUser, isAdmin, chosenRole });
        expect(subject.ok).toBe(true);

        // Exactly the document RosterView writes from that subject.
        const swap = {
            requestedBy: subject.requestedBy,
            targetStaff: coveringStaff,
            originalShiftDate: DATE,
            originalTask: shift.task,
            swapRole: subject.swapRole,
            ...(subject.initiatedBy ? { initiatedBy: subject.initiatedBy } : {}),
            status: 'PENDING',
        };

        const roster = { [DATE]: [shift] };
        const plan = planSwapApplication({ roster, swap, coveringStaff });
        return { subject, swap, plan, roster };
    };

    it('applies an admin-brokered LEAD handover end to end', () => {
        const { subject, swap, plan, roster } = requestThenAccept({
            shift: modernShift(),
            actingUser: 'Alif',
            isAdmin: true,
            chosenRole: SHIFT_ROLE_LEAD,
            coveringStaff: 'Derlinder',
        });

        expect(plan.ok).toBe(true);
        expect(plan.role).toBe(subject.swapRole);
        expect(plan.shifts[0].lead).toBe('Derlinder');
        expect(plan.shifts[0].coLead).toBe('Ying Xian'); // nobody else moved
        expect(plan.shifts[0].staff).toBe('Lead: Derlinder, Co: Ying Xian');

        // And the read-back that success is conditional on agrees.
        const after = applyPlan(roster, plan);
        expect(verifySwapApplied({ roster: after, swap, coveringStaff: 'Derlinder', role: plan.role })).toBe(true);
    });

    it('applies an admin-brokered CO-LEAD handover end to end', () => {
        const { plan, swap, roster } = requestThenAccept({
            shift: modernShift(),
            actingUser: 'Alif',
            isAdmin: true,
            chosenRole: SHIFT_ROLE_CO_LEAD,
            coveringStaff: 'Fadzlynn',
        });

        expect(plan.ok).toBe(true);
        expect(plan.role).toBe(SHIFT_ROLE_CO_LEAD);
        expect(plan.shifts[0].lead).toBe('Brandon');
        expect(plan.shifts[0].coLead).toBe('Fadzlynn');

        const after = applyPlan(roster, plan);
        expect(verifySwapApplied({ roster: after, swap, coveringStaff: 'Fadzlynn', role: plan.role })).toBe(true);
    });

    it('applies an admin-brokered handover on a LEGACY shift end to end', () => {
        const { plan } = requestThenAccept({
            shift: legacyShift(),
            actingUser: 'Alif',
            isAdmin: true,
            coveringStaff: 'Derlinder',
        });

        expect(plan.ok).toBe(true);
        expect(plan.role).toBe(SHIFT_ROLE_LEAD);
        expect(plan.shifts[0]).toEqual({
            task: 'EFT',
            category: 'CORE',
            lead: 'Derlinder',
            staff: 'Lead: Derlinder',
        });
    });

    it('still applies a self-request, from a lead and from a co-lead', () => {
        const asLead = requestThenAccept({
            shift: modernShift(),
            actingUser: 'Brandon',
            coveringStaff: 'Derlinder',
        });
        expect(asLead.plan.ok).toBe(true);
        expect(asLead.plan.role).toBe(SHIFT_ROLE_LEAD);
        // The self-request document is byte-for-byte the pre-fix shape.
        expect('initiatedBy' in asLead.swap).toBe(false);

        const asCoLead = requestThenAccept({
            shift: modernShift(),
            actingUser: 'Ying Xian',
            coveringStaff: 'Derlinder',
        });
        expect(asCoLead.plan.ok).toBe(true);
        expect(asCoLead.plan.role).toBe(SHIFT_ROLE_CO_LEAD);
    });

    it('is what the OLD code got wrong: the admin as requestedBy is refused', () => {
        // The pre-fix document, written verbatim. Kept as executable evidence of
        // what M11 actually produced, so nobody reintroduces it.
        const plan = planSwapApplication({
            roster: { [DATE]: [modernShift()] },
            swap: swapRequest({ requestedBy: 'Alif', swapRole: null }),
            coveringStaff: 'Derlinder',
        });

        expect(plan.ok).toBe(false);
        expect(plan.reason).toMatch(/Alif is no longer on the EFT shift/i);
    });

    it('carries `initiatedBy` through without the mutator caring about it', () => {
        // `initiatedBy` is ledger metadata. It must never influence the match —
        // that is `requestedBy`'s job — so a plan is identical with and without it.
        const shift = modernShift();
        const base = {
            requestedBy: 'Brandon',
            originalShiftDate: DATE,
            originalTask: 'EFT',
            swapRole: SHIFT_ROLE_LEAD,
        };

        const withOut = planSwapApplication({ roster: { [DATE]: [shift] }, swap: base, coveringStaff: 'Derlinder' });
        const withIn = planSwapApplication({
            roster: { [DATE]: [shift] },
            swap: { ...base, initiatedBy: 'Alif' },
            coveringStaff: 'Derlinder',
        });

        expect(withIn.ok).toBe(true);
        expect(withIn.shifts).toEqual(withOut.shifts);
        expect(withIn.role).toBe(withOut.role);
    });

    it('agrees with filterSwapCandidates: the person being swapped out is never offered as cover', () => {
        // The dropdown and the subject must not contradict each other, or an
        // admin could pick the very clinician they are arranging cover for and be
        // refused at acceptance time ("already holds that shift").
        const shift = modernShift();
        const pool = ['Brandon', 'Ying Xian', 'Derlinder', 'Fadzlynn'];
        const candidates = filterSwapCandidates(pool, shift);

        [SHIFT_ROLE_LEAD, SHIFT_ROLE_CO_LEAD].forEach((role) => {
            const subject = resolveSwapSubject({ shift, actingUser: 'Alif', isAdmin: true, chosenRole: role });
            expect(candidates).not.toContain(subject.requestedBy);
        });
    });
});

// ─── Planning the roster mutation ────────────────────────────────────────────
describe('planSwapApplication — LEAD substitution (the modern shape)', () => {
    const roster = () => ({
        [DATE]: [
            modernShift(),
            modernShift({ task: 'NC', lead: 'Derlinder', coLead: 'Fadzlynn' }),
        ],
        '2026-02-03': [modernShift()],
    });

    it('locates the shift by date + task + the requester holding `swapRole`', () => {
        const plan = planSwapApplication({
            roster: roster(),
            swap: swapRequest(),
            coveringStaff: 'Derlinder',
        });

        expect(plan.ok).toBe(true);
        expect(plan.dateKey).toBe(DATE);
        expect(plan.role).toBe(SHIFT_ROLE_LEAD);
        expect(plan.index).toBe(0);
    });

    it('produces a day array in which only the target shift changed', () => {
        const before = roster();
        const plan = planSwapApplication({
            roster: before,
            swap: swapRequest(),
            coveringStaff: 'Derlinder',
        });

        expect(plan.shifts).toHaveLength(2);
        expect(plan.shifts[0]).toEqual({
            task: 'EFT',
            lead: 'Derlinder',
            coLead: 'Ying Xian',
            staff: 'Lead: Derlinder, Co: Ying Xian',
            category: 'CORE',
            week: 1,
        });
        // The other shift on the same day is passed through by reference.
        expect(plan.shifts[1]).toBe(before[DATE][1]);
    });

    it('does not mutate the roster it was handed', () => {
        const before = roster();
        planSwapApplication({ roster: before, swap: swapRequest(), coveringStaff: 'Derlinder' });

        expect(before[DATE][0].lead).toBe('Brandon');
        expect(before[DATE][0].staff).toBe('Lead: Brandon, Co: Ying Xian');
    });

    it('leaves other dates alone', () => {
        const before = roster();
        const plan = planSwapApplication({ roster: before, swap: swapRequest(), coveringStaff: 'Derlinder' });
        const after = applyPlan(before, plan);

        expect(after['2026-02-03']).toBe(before['2026-02-03']);
    });
});

describe('planSwapApplication — CO-LEAD substitution', () => {
    it('rewrites coLead only, leaving the lead in place', () => {
        const roster = { [DATE]: [modernShift()] };
        const plan = planSwapApplication({
            roster,
            swap: swapRequest({ requestedBy: 'Ying Xian', swapRole: SHIFT_ROLE_CO_LEAD }),
            coveringStaff: 'Derlinder',
        });

        expect(plan.ok).toBe(true);
        expect(plan.role).toBe(SHIFT_ROLE_CO_LEAD);
        expect(plan.shifts[0].lead).toBe('Brandon');
        expect(plan.shifts[0].coLead).toBe('Derlinder');
        expect(plan.shifts[0].staff).toBe('Lead: Brandon, Co: Derlinder');
    });

    it('refuses when the covering colleague is already the lead of that shift', () => {
        // One person cannot hold both duties; the old mutator would have
        // happily written Brandon into both slots.
        const roster = { [DATE]: [modernShift()] };
        const plan = planSwapApplication({
            roster,
            swap: swapRequest({ requestedBy: 'Ying Xian', swapRole: SHIFT_ROLE_CO_LEAD }),
            coveringStaff: 'Brandon',
        });

        expect(plan.ok).toBe(false);
        expect(plan.shifts).toBeNull();
        expect(plan.reason).toMatch(/cannot hold both/i);
    });
});

describe('planSwapApplication — LEGACY shape (pre-6-May documents)', () => {
    it('matches a bare `staff` name and substitutes it as the lead', () => {
        const roster = { [DATE]: [legacyShift()] };
        const plan = planSwapApplication({
            roster,
            swap: swapRequest(),
            coveringStaff: 'Derlinder',
        });

        expect(plan.ok).toBe(true);
        expect(plan.role).toBe(SHIFT_ROLE_LEAD);
    });

    it('upgrades the shift to the modern shape on write', () => {
        const roster = { [DATE]: [legacyShift()] };
        const plan = planSwapApplication({ roster, swap: swapRequest(), coveringStaff: 'Derlinder' });

        expect(plan.shifts[0]).toEqual({
            task: 'EFT',
            category: 'CORE',
            lead: 'Derlinder',
            staff: 'Lead: Derlinder',
        });
    });

    it('applies a legacy shift even when the request recorded `coLead`', () => {
        // A legacy shift has exactly one person, so lead is the only role it can
        // be. Refusing here would make legacy documents permanently unfixable.
        const roster = { [DATE]: [legacyShift()] };
        const plan = planSwapApplication({
            roster,
            swap: swapRequest({ swapRole: SHIFT_ROLE_CO_LEAD }),
            coveringStaff: 'Derlinder',
        });

        expect(plan.ok).toBe(true);
        expect(plan.role).toBe(SHIFT_ROLE_LEAD);
        expect(plan.shifts[0].lead).toBe('Derlinder');
    });

    it('applies a request that predates the `swapRole` field at all', () => {
        const roster = { [DATE]: [modernShift()] };
        const plan = planSwapApplication({
            roster,
            swap: swapRequest({ swapRole: undefined }),
            coveringStaff: 'Derlinder',
        });

        expect(plan.ok).toBe(true);
        expect(plan.role).toBe(SHIFT_ROLE_LEAD);
    });

    it('does not treat a modern shift as legacy', () => {
        expect(readShiftIdentities(modernShift()).legacy).toBe(false);
    });
});

describe('planSwapApplication — a no-match is a REFUSAL, never a silent no-op', () => {
    // This is the whole of A1/A-RC4: the old mutator mapped over the day, matched
    // nothing, wrote byte-identical data, and printed a hardcoded success line.
    const cases = [
        [
            'the display string is compared to a bare name (the original A1 bug)',
            { roster: { [DATE]: [modernShift()] }, swap: swapRequest({ requestedBy: 'Lead: Brandon, Co: Ying Xian' }) },
            /no longer on the EFT shift|has no EFT shift/i,
        ],
        [
            'the requester is not on that shift at all',
            { roster: { [DATE]: [modernShift()] }, swap: swapRequest({ requestedBy: 'Fadzlynn' }) },
            /no longer on the EFT shift/i,
        ],
        [
            'the task does not exist on that day',
            { roster: { [DATE]: [modernShift()] }, swap: swapRequest({ originalTask: 'VC (AM)' }) },
            /no VC \(AM\) shift on/i,
        ],
        [
            'the date key holds nothing (roster regenerated since the request)',
            { roster: { '2026-03-09': [modernShift()] }, swap: swapRequest() },
            /no shifts stored on 2026-02-02/i,
        ],
        [
            'the roster document does not exist',
            { roster: null, swap: swapRequest() },
            /could not be read/i,
        ],
        [
            'the day is stored as something other than an array',
            { roster: { [DATE]: 'EFT: Brandon' }, swap: swapRequest() },
            /no shifts stored on/i,
        ],
        [
            'the requester and the coverer are the same person',
            { roster: { [DATE]: [modernShift()] }, swap: swapRequest(), coveringStaff: 'Brandon' },
            /already holds that shift/i,
        ],
        [
            'the accepting user has no resolvable name',
            { roster: { [DATE]: [modernShift()] }, swap: swapRequest(), coveringStaff: undefined },
            /who is taking the shift over/i,
        ],
        [
            'the request is missing its shift details',
            { roster: { [DATE]: [modernShift()] }, swap: swapRequest({ originalShiftDate: undefined }) },
            /does not say which shift/i,
        ],
    ];

    cases.forEach(([label, args, expectedReason]) => {
        it(`refuses, with a reason, when ${label}`, () => {
            const plan = planSwapApplication({ coveringStaff: 'Derlinder', ...args });

            expect(plan.ok).toBe(false);
            expect(plan.shifts).toBeNull();
            expect(plan.dateKey).toBeNull();
            expect(plan.role).toBeNull();
            expect(typeof plan.reason).toBe('string');
            expect(plan.reason).toMatch(expectedReason);
        });
    });

    it('refuses rather than guessing when the requester now holds the OTHER role', () => {
        // The roster was regenerated between request and acceptance and Brandon
        // is now the co-lead. Substituting anyway would move a duty nobody
        // agreed to.
        const roster = { [DATE]: [modernShift({ lead: 'Fadzlynn', coLead: 'Brandon' })] };
        const plan = planSwapApplication({
            roster,
            swap: swapRequest({ swapRole: SHIFT_ROLE_LEAD }),
            coveringStaff: 'Derlinder',
        });

        expect(plan.ok).toBe(false);
        expect(plan.reason).toMatch(/roster has changed since this request was made/i);
        expect(plan.reason).toContain('co-lead');
    });

    it('never returns a day array that equals the input on the failure path', () => {
        // The precise shape of the old bug: `.map()` returned the day unchanged
        // and `updateDoc` wrote it back as a "successful" no-op.
        const day = [modernShift()];
        const plan = planSwapApplication({
            roster: { [DATE]: day },
            swap: swapRequest({ requestedBy: 'Nobody' }),
            coveringStaff: 'Derlinder',
        });

        expect(plan.ok).toBe(false);
        expect(plan.shifts).not.toEqual(day);
        expect(plan.shifts).toBeNull();
    });
});

// ─── Verifying the write actually landed (M9 / A-RC4) ────────────────────────
describe('findAppliedSwapShift — the read-back that success is conditional on', () => {
    const swap = swapRequest();

    it('finds the substituted shift in a roster that really was written', () => {
        const before = { [DATE]: [modernShift()] };
        const plan = planSwapApplication({ roster: before, swap, coveringStaff: 'Derlinder' });
        const after = applyPlan(before, plan);

        const observed = findAppliedSwapShift({
            roster: after,
            swap,
            coveringStaff: 'Derlinder',
            role: plan.role,
        });

        expect(observed).not.toBeNull();
        expect(observed.staff).toBe('Lead: Derlinder, Co: Ying Xian');
        expect(verifySwapApplied({ roster: after, swap, coveringStaff: 'Derlinder', role: plan.role })).toBe(true);
    });

    it('returns null when the write never landed (the roster is unchanged)', () => {
        const unchanged = { [DATE]: [modernShift()] };
        expect(
            verifySwapApplied({ roster: unchanged, swap, coveringStaff: 'Derlinder', role: SHIFT_ROLE_LEAD }),
        ).toBe(false);
    });

    it('returns null when the identities moved but the display string did not', () => {
        // The A2 half of the defect: a mutator that rewrites `lead` but leaves a
        // stale `staff` label still shows the old person in the calendar and in
        // every exported calendar invite.
        const stale = {
            [DATE]: [{ ...modernShift(), lead: 'Derlinder', staff: 'Lead: Brandon, Co: Ying Xian' }],
        };
        expect(
            verifySwapApplied({ roster: stale, swap, coveringStaff: 'Derlinder', role: SHIFT_ROLE_LEAD }),
        ).toBe(false);
    });

    it('returns null when the substitution landed on the wrong role', () => {
        const wrongRole = {
            [DATE]: [modernShift({ lead: 'Brandon', coLead: 'Derlinder' })],
        };
        expect(
            verifySwapApplied({ roster: wrongRole, swap, coveringStaff: 'Derlinder', role: SHIFT_ROLE_LEAD }),
        ).toBe(false);
    });

    it('confirms an upgraded legacy shift', () => {
        const before = { [DATE]: [legacyShift()] };
        const plan = planSwapApplication({ roster: before, swap, coveringStaff: 'Derlinder' });
        const after = applyPlan(before, plan);

        expect(verifySwapApplied({ roster: after, swap, coveringStaff: 'Derlinder', role: plan.role })).toBe(true);
    });

    it('returns null for a missing roster, day, or role', () => {
        expect(verifySwapApplied({ roster: null, swap, coveringStaff: 'Derlinder', role: SHIFT_ROLE_LEAD })).toBe(false);
        expect(verifySwapApplied({ roster: {}, swap, coveringStaff: 'Derlinder', role: SHIFT_ROLE_LEAD })).toBe(false);
        expect(verifySwapApplied({ roster: { [DATE]: [modernShift()] }, swap, coveringStaff: 'Derlinder', role: 'boss' })).toBe(false);
        expect(verifySwapApplied()).toBe(false);
    });
});

// ─── End-to-end, on pure data ────────────────────────────────────────────────
describe('plan → write → verify, on a roster produced by the real generator', () => {
    const config = {
        staff: ['Brandon', 'Ying Xian', 'Derlinder', 'Fadzlynn'],
        tasks: ['EFT', 'IPT+SKG', 'NC', 'FSG+WI'],
        startDate: '2026-02-01',
        weeks: 1,
    };

    it('hands over a real generated shift, verifiably, and touches nothing else', () => {
        const roster = generateRoster(config);
        const dateKey = Object.keys(roster).sort()[0];
        const target = roster[dateKey].find((s) => s.category === 'CORE');

        const swap = swapRequest({
            originalShiftDate: dateKey,
            originalTask: target.task,
            requestedBy: target.lead,
            swapRole: SHIFT_ROLE_LEAD,
        });
        const covering = config.staff.find((n) => n !== target.lead && n !== target.coLead);

        const plan = planSwapApplication({ roster, swap, coveringStaff: covering });
        expect(plan.ok).toBe(true);

        const after = applyPlan(roster, plan);
        expect(verifySwapApplied({ roster: after, swap, coveringStaff: covering, role: plan.role })).toBe(true);

        // Exactly one shift changed across the whole roster.
        const changed = Object.entries(after).flatMap(([key, shifts]) =>
            shifts.filter((shift, i) => shift !== roster[key][i]).map((shift) => ({ key, shift })),
        );
        expect(changed).toHaveLength(1);
        expect(changed[0].key).toBe(dateKey);
        expect(changed[0].shift.lead).toBe(covering);
        expect(changed[0].shift.coLead).toBe(target.coLead);
    });
});

// ─── Role wording used in the messages ───────────────────────────────────────
describe('describeShiftRole', () => {
    it('renders each role in words a clinician would recognise', () => {
        expect(describeShiftRole(SHIFT_ROLE_LEAD)).toBe('lead');
        expect(describeShiftRole(SHIFT_ROLE_CO_LEAD)).toBe('co-lead');
        expect(describeShiftRole(null)).toBe('unknown duty');
    });
});

// ─── Alert survival (M5) ─────────────────────────────────────────────────────
describe('resetMessagesPreservingAlerts — a queued coverage request survives a session reset', () => {
    const alert = (docId = 'swap_1') => ({
        role: 'bot',
        text: '🔔 URGENT COVERAGE REQUEST',
        mode: ROSTER_ALERT_MODE,
        swapData: { docId, ...swapRequest({ docId }) },
    });
    const greeting = { role: 'bot', text: 'Hi Brandon. AURA here.', isGreeting: true, mode: 'NEUTRAL' };

    it('keeps an unanswered alert when the history is replaced by a greeting', () => {
        // The M5 failure: picking a persona called setMessages([greeting]) and
        // the request — the only copy of `swapData` in the app — was gone.
        const next = resetMessagesPreservingAlerts([alert(), { role: 'user', text: 'hello' }], [greeting]);

        expect(next).toHaveLength(2);
        expect(next[0]).toBe(greeting);
        expect(next[1].mode).toBe(ROSTER_ALERT_MODE);
        expect(next[1].swapData.docId).toBe('swap_1');
    });

    it('keeps alerts when the history is cleared to nothing', () => {
        const next = resetMessagesPreservingAlerts([alert('a'), alert('b')], []);
        expect(next.map((m) => m.swapData.docId)).toEqual(['a', 'b']);
    });

    it('drops an alert that has already been answered', () => {
        // `swapData` is nulled once accepted or declined; that alert is history,
        // not an outstanding request.
        const answered = { ...alert(), swapData: null };
        expect(resetMessagesPreservingAlerts([answered], [greeting])).toEqual([greeting]);
    });

    it('drops ordinary chat, errors and greetings', () => {
        const history = [
            greeting,
            { role: 'user', text: 'I am exhausted' },
            { role: 'bot', text: '⚠️ Neural link unstable.', isError: true },
        ];
        expect(resetMessagesPreservingAlerts(history, [greeting])).toEqual([greeting]);
    });

    it('returns the replacement untouched when there is nothing to preserve', () => {
        const replacement = [greeting];
        expect(resetMessagesPreservingAlerts([], replacement)).toBe(replacement);
        expect(resetMessagesPreservingAlerts(undefined, replacement)).toBe(replacement);
    });

    it('pendingRosterAlerts tolerates a missing or malformed history', () => {
        expect(pendingRosterAlerts(undefined)).toEqual([]);
        expect(pendingRosterAlerts([null, {}, { mode: ROSTER_ALERT_MODE }])).toEqual([]);
    });
});

describe('appendRosterAlert — alerts survive, so they must not also duplicate', () => {
    const alert = (docId) => ({ role: 'bot', mode: ROSTER_ALERT_MODE, text: '🔔', swapData: { docId } });

    it('appends a request that is not already on screen', () => {
        expect(appendRosterAlert([], alert('a'))).toHaveLength(1);
    });

    it('ignores a request that is already queued', () => {
        // A re-subscribe re-delivers every PENDING doc as `added`. Before
        // preservation the array had been wiped, so duplicates were impossible;
        // now they would be.
        const existing = [alert('a')];
        expect(appendRosterAlert(existing, alert('a'))).toBe(existing);
    });

    it('keeps distinct requests apart', () => {
        expect(appendRosterAlert([alert('a')], alert('b'))).toHaveLength(2);
    });

    it('tolerates a missing history or alert', () => {
        expect(appendRosterAlert(undefined, alert('a'))).toHaveLength(1);
        expect(appendRosterAlert([alert('a')], null)).toHaveLength(1);
    });
});
