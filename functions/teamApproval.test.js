/**
 * ==============================================================================
 * LEAD APPROVAL — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * The first tests `functions/` has ever had, on the one piece of NEXUS that grants
 * a person access to other people's clinical records. Everything asserted here is
 * a way somebody could get a team they should not have, or fail to get one they
 * should.
 *
 * This suite imports the real `functions/teamApproval.js` — no mocks of the module
 * under test — which is possible only because that module takes its dependencies as
 * arguments instead of requiring firebase-admin at the top.
 */

import { describe, it, expect } from 'vitest';
import {
    slugTeamId,
    isSuperAdmin,
    assertApprovable,
    buildApprovalWrites,
    buildDeclineWrite,
} from './teamApproval.js';
import { teamIdFrom } from '../src/utils/teamPaths.js';

const NOW = '2026-08-20T09:00:00.000Z';
const LEAD_UID = 'aB3xYz9QwErTyUiOpAsDfGhJkLzX';
const APPROVER = 'ownerUid00000000000000000000';

const pending = (over = {}) => ({
    uid: LEAD_UID,
    email: 'lead.rt@kkh.com.sg',
    displayName: 'Nur',
    role: 'lead',
    institution: 'KKH',
    department: 'Respiratory Therapy',
    profession: 'respiratory-therapist',
    proposedTeamId: 'kkh-respiratory-therapy',
    status: 'pending',
    ...over,
});

const verified = { uid: LEAD_UID, email: 'lead.rt@kkh.com.sg', emailVerified: true };

// ==============================================================================

describe('slugTeamId — and the copy of it that lives in src/', () => {
    /**
     * ⚠️ THE DRIFT GUARD. `slugTeamId` here and `teamIdFrom` in
     * `src/utils/teamPaths.js` are two implementations of one rule, because the
     * client and the functions package cannot import from each other. If they
     * disagree, a lead is shown one team name at registration and the server
     * creates another — a bug that only shows up for names with unusual
     * punctuation and is nearly untraceable from either end.
     *
     * This is the test that makes editing one of them fail loudly.
     */
    it.each([
        ['KKH', 'Respiratory Therapy'],
        ['SGH', 'Physiotherapy'],
        ['  KKH  ', 'Sport & Exercise Medicine'],
        ['NUH', 'Speech & Language Therapy (Paeds)'],
        ['KKH', 'Medical Social Work'],
        // The accented case, which is where the two copies most easily diverge:
        // without NFKD on both sides, 'é' is stripped rather than decomposed and the
        // department becomes a different team.
        ['KKH', 'Thérapie Réadaptation'],
        ['', ''],
        ['!!', '???'],
        ['KKH', ''],
        ['', 'Physiotherapy'],
        [null, undefined],
        ['KKH', 'a'],
        ['KKH', '   '],
        [42, 'Physiotherapy'],
    ])('agrees with teamIdFrom for %s + %s', (institution, department) => {
        expect(slugTeamId(institution, department)).toBe(teamIdFrom(institution, department));
    });

    /**
     * The two failures the drift guard found on its first run, kept as explicit
     * cases so they cannot come back quietly. The second is the serious one: an id
     * with no institution in it means Physiotherapy at KKH and Physiotherapy at SGH
     * are the same team.
     */
    it('refuses a missing department, and a missing institution', () => {
        expect(slugTeamId('KKH', '')).toBeNull();
        expect(slugTeamId('', 'Physiotherapy')).toBeNull();
        expect(teamIdFrom('KKH', '')).toBeNull();
        expect(teamIdFrom('', 'Physiotherapy')).toBeNull();
    });

    it('separates the same department at two institutions', () => {
        expect(slugTeamId('KKH', 'Respiratory Therapy'))
            .not.toBe(slugTeamId('SGH', 'Respiratory Therapy'));
    });
});

describe('isSuperAdmin — who may turn a claim into access', () => {
    it('admits a listed uid', () => {
        expect(isSuperAdmin({ uids: [APPROVER] }, { uid: APPROVER })).toBe(true);
    });

    /**
     * FAIL CLOSED, AND THIS IS THE MOST IMPORTANT ONE IN THE FILE. If the config
     * document is missing or malformed and this returned true, every signed-in user
     * would become an approver of every team.
     */
    it('admits NOBODY when the config is missing or malformed', () => {
        [null, undefined, {}, { uids: 'nope' }, { uids: null }, 'string', 42].forEach((config) => {
            expect(isSuperAdmin(config, { uid: APPROVER, email: 'a@kkh.com.sg', emailVerified: true })).toBe(false);
        });
    });

    it('refuses an unlisted caller and a caller with no uid', () => {
        expect(isSuperAdmin({ uids: [APPROVER] }, { uid: 'someone-else' })).toBe(false);
        expect(isSuperAdmin({ uids: [APPROVER] }, { uid: '' })).toBe(false);
        expect(isSuperAdmin({ uids: [APPROVER] }, null)).toBe(false);
    });

    it('allows the bootstrap-by-email path, case-insensitively', () => {
        const config = { emails: ['Muhammad.Alif@kkh.com.sg'] };
        expect(isSuperAdmin(config, { uid: 'x', email: 'muhammad.alif@kkh.com.sg', emailVerified: true })).toBe(true);
    });

    /**
     * An unverified address is a string the account holder typed, not one they
     * proved. Accepting it would mean anyone who can guess a super-admin's work
     * address can register it and approve their own team.
     */
    it('refuses the bootstrap path for an UNVERIFIED address', () => {
        const config = { emails: ['muhammad.alif@kkh.com.sg'] };
        expect(isSuperAdmin(config, { uid: 'x', email: 'muhammad.alif@kkh.com.sg', emailVerified: false })).toBe(false);
        expect(isSuperAdmin(config, { uid: 'x', email: 'muhammad.alif@kkh.com.sg' })).toBe(false);
    });
});

describe('assertApprovable — every reason a claim must not become a team', () => {
    it('approves a verified, pending, well-formed request', () => {
        expect(assertApprovable({ request: pending(), authUser: verified, teamExists: false }))
            .toEqual({ ok: true, teamId: 'kkh-respiratory-therapy' });
    });

    /**
     * THE CHECK firestore.rules COULD NOT MAKE. The declaration is written seconds
     * after registration, before the verification email arrives, so the rules must
     * allow an unverified account to write it. This is where that is paid for.
     */
    it('refuses an account that has not verified its email', () => {
        const result = assertApprovable({
            request: pending(),
            authUser: { ...verified, emailVerified: false },
            teamExists: false,
        });
        expect(result.ok).toBe(false);
        expect(result.code).toBe('unverified');
    });

    it('refuses a request that is not pending, and names the state', () => {
        expect(assertApprovable({ request: pending({ status: 'declined' }), authUser: verified }).code)
            .toBe('not-pending');
        expect(assertApprovable({ request: null, authUser: verified }).code).toBe('not-found');
    });

    /**
     * Approving twice must land on the same team, not on a half-made second one.
     * A double-clicked button, a retried call and a rerun after a timeout are all
     * this case, and all three are likely.
     */
    it('reports an already-approved request as its own code, not as a generic failure', () => {
        expect(assertApprovable({ request: pending({ status: 'approved' }), authUser: verified }).code)
            .toBe('already-approved');
    });

    it('refuses a request whose account has been deleted', () => {
        expect(assertApprovable({ request: pending(), authUser: null }).code).toBe('no-account');
    });

    it('refuses a role outside the three that may run a team', () => {
        expect(assertApprovable({ request: pending({ role: 'staff' }), authUser: verified }).code).toBe('bad-role');
        expect(assertApprovable({ request: pending({ role: 'superuser' }), authUser: verified }).code).toBe('bad-role');
    });

    it('refuses names that cannot compose a team id', () => {
        expect(assertApprovable({ request: pending({ institution: '!!', department: '??' }), authUser: verified }).code)
            .toBe('bad-team-id');
    });

    /**
     * Not really a failure — it is "this department is already here, invite them" —
     * so it carries the teamId and a sentence a human can act on. Creating a second
     * copy of a department is how two rosters for one team come to exist.
     */
    it('refuses a duplicate team with a sentence that says what to do instead', () => {
        const result = assertApprovable({ request: pending(), authUser: verified, teamExists: true });
        expect(result.code).toBe('team-exists');
        expect(result.teamId).toBe('kkh-respiratory-therapy');
        expect(result.message).toMatch(/invite this person/i);
    });

    /**
     * `proposedTeamId` is written by the CLIENT. If this function trusted it, a
     * crafted request could place a team at an id of the caller's choosing —
     * including one that collides with an existing department.
     */
    it('re-derives the team id and ignores the client-supplied one', () => {
        const result = assertApprovable({
            request: pending({ proposedTeamId: 'kkh-cardiology' }),
            authUser: verified,
            teamExists: false,
        });
        expect(result.teamId).toBe('kkh-respiratory-therapy');
    });
});

describe('buildApprovalWrites — what approving actually does', () => {
    const writes = buildApprovalWrites({
        request: pending(),
        teamId: 'kkh-respiratory-therapy',
        approverUid: APPROVER,
        now: NOW,
    });

    it('creates the team beneath teams/, with the lead recorded by uid', () => {
        expect(writes.team.path).toEqual(['teams', 'kkh-respiratory-therapy']);
        expect(writes.team.data.leadUid).toBe(LEAD_UID);
        expect(writes.team.data.institution).toBe('KKH');
        expect(writes.team.data.department).toBe('Respiratory Therapy');
        expect(writes.team.data.createdBy).toBe(APPROVER);
    });

    /**
     * THE FIRST MEMBERSHIP DOCUMENT IN THE NEW MODEL, and the whole point of the
     * rebuild: it is keyed by uid. The old model keyed by display name, which makes
     * two clinicians called Sarah in one cluster a data-loss event rather than a
     * coincidence.
     */
    it('keys the membership by uid, never by display name', () => {
        expect(writes.member.path).toEqual(['teams', 'kkh-respiratory-therapy', 'members', LEAD_UID]);
        expect(writes.member.path[3]).not.toContain(' ');
        expect(writes.member.data.displayName).toBe('Nur');
        expect(writes.member.data.role).toBe('lead');
    });

    it('gives the new member empty rostering fields rather than absent ones', () => {
        expect(writes.member.data).toMatchObject({ grade: '', fte: 1, skills: [], unavailable: [] });
    });

    it('records which of the three roles was declared, not just that it was a lead', () => {
        const supervisor = buildApprovalWrites({
            request: pending({ role: 'supervisor' }),
            teamId: 'kkh-respiratory-therapy',
            approverUid: APPROVER,
            now: NOW,
        });
        expect(supervisor.member.data.role).toBe('lead');
        expect(supervisor.member.data.declaredAs).toBe('supervisor');
    });

    it('adds the team to the user rather than replacing what they already have', () => {
        expect(writes.user.path).toEqual(['users', LEAD_UID]);
        expect(writes.user.merge).toBe(true);
        expect(writes.user.data.addTeamIds).toEqual(['kkh-respiratory-therapy']);
    });

    it('stamps the decision onto the request, with who and when', () => {
        expect(writes.decision.path).toEqual(['lead_requests', LEAD_UID]);
        expect(writes.decision.data).toEqual({
            status: 'approved',
            teamId: 'kkh-respiratory-therapy',
            decidedBy: APPROVER,
            decidedAt: NOW,
        });
    });

    it('falls back to the email rather than writing a blank name', () => {
        const nameless = buildApprovalWrites({
            request: pending({ displayName: '   ' }),
            teamId: 'kkh-respiratory-therapy',
            approverUid: APPROVER,
            now: NOW,
        });
        expect(nameless.member.data.displayName).toBe('lead.rt@kkh.com.sg');
    });
});

describe('buildDeclineWrite', () => {
    it('records the reason, the decider and the time', () => {
        const write = buildDeclineWrite({
            requestUid: LEAD_UID,
            approverUid: APPROVER,
            reason: 'Already on NEXUS as Respiratory Care.',
            now: NOW,
        });
        expect(write.path).toEqual(['lead_requests', LEAD_UID]);
        expect(write.merge).toBe(true);
        expect(write.data.status).toBe('declined');
        expect(write.data.declineReason).toBe('Already on NEXUS as Respiratory Care.');
    });

    it('never writes a blank reason, and caps a long one', () => {
        expect(buildDeclineWrite({ requestUid: LEAD_UID, approverUid: APPROVER, now: NOW }).data.declineReason)
            .toBe('No reason given.');
        expect(buildDeclineWrite({ requestUid: LEAD_UID, approverUid: APPROVER, reason: 'x'.repeat(900), now: NOW })
            .data.declineReason).toHaveLength(500);
    });
});
