/**
 * ==============================================================================
 * TEAM MEMBERSHIP — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * `teamApproval` decides who gets a team. This decides who gets INTO one, which is
 * the same question asked about clinical data twenty-seven more times per
 * department. Everything asserted here is either a way somebody could reach a
 * team's wellbeing records without being given them, or a way a team could end up
 * with nobody able to administer it.
 *
 * The real module is imported — no mocks of the thing under test — which works
 * because it takes its dependencies as arguments and touches no clock, network or
 * `firebase-admin`.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
    MEMBER_ROLES,
    INVITE_REASONS,
    REMOVE_REASONS,
    emailDomain,
    isAllowedEmail,
    parseDomainAllowlist,
    assertInvitable,
    buildInviteWrites,
    assertRemovable,
    buildRemoveWrites,
} from './teamMembership.js';
import {
    emailDomain as clientEmailDomain,
    normaliseDomain as clientNormaliseDomain,
} from '../src/utils/accessPolicy.js';

const NOW = '2026-08-23T09:00:00.000Z';
const TEAM = 'kkh-respiratory-therapy';
const LEAD = { uid: 'leadUid0000000000000000000aa', role: 'lead', displayName: 'Nur' };
const DOMAINS = ['kkh.com.sg', 'singhealth.com.sg'];

const invitee = (over = {}) => ({
    uid: 'newUid00000000000000000000bb',
    email: 'brandon@kkh.com.sg',
    emailVerified: true,
    ...over,
});

const invite = (over = {}) => assertInvitable({
    teamId: TEAM,
    callerMembership: LEAD,
    invitee: invitee(),
    role: 'staff',
    existingMembership: null,
    allowedDomains: DOMAINS,
    ...over,
});

// ── 1. WHO MAY ADD SOMEBODY ──────────────────────────────────────────────────

describe('only a lead of THIS team may add to it', () => {
    it('admits a lead', () => {
        expect(invite().ok).toBe(true);
    });

    it('refuses a staff member', () => {
        const verdict = invite({ callerMembership: { uid: 'x', role: 'staff' } });
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toBe(INVITE_REASONS.NOT_A_LEAD);
    });

    it('refuses a viewer', () => {
        expect(invite({ callerMembership: { uid: 'x', role: 'viewer' } }).reason)
            .toBe(INVITE_REASONS.NOT_A_LEAD);
    });

    /**
     * THE ONE THAT MATTERS. A caller with no membership document in this team is
     * somebody who passed a `teamId` they are not in. If that were admitted, any
     * signed-in user in the cluster could place themselves — or anybody — inside
     * any department, and every rule downstream trusts the membership document.
     */
    it('refuses a caller with no membership in the team at all', () => {
        expect(invite({ callerMembership: null }).reason).toBe(INVITE_REASONS.NOT_A_LEAD);
    });

    it('refuses a membership whose role is missing entirely', () => {
        expect(invite({ callerMembership: { uid: 'x' } }).reason).toBe(INVITE_REASONS.NOT_A_LEAD);
    });

    it('refuses when no team was named', () => {
        expect(invite({ teamId: '' }).reason).toBe(INVITE_REASONS.NO_TEAM);
    });
});

// ── 2. WHO MAY BE ADDED ──────────────────────────────────────────────────────

describe('the invitee has to be real, allowed and verified', () => {
    it('refuses an address on a domain that is not registered', () => {
        const verdict = invite({ invitee: invitee({ email: 'someone@gmail.com' }) });
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toBe(INVITE_REASONS.DOMAIN_NOT_ALLOWED);
        expect(verdict.message).toContain('gmail.com');
    });

    /**
     * ⚠️ AN EMPTY OR UNREADABLE ALLOWLIST ADMITS NOBODY, which is the OPPOSITE of
     *    what the client hook does — and both are right. The login screen falls back
     *    to a built-in list because it still has to let existing users in. This
     *    function is what stands between a lead and placing an arbitrary address
     *    inside a team; a gate that opens when its configuration is missing is not
     *    a gate.
     */
    it('refuses everybody when the allowlist is empty', () => {
        expect(invite({ allowedDomains: [] }).reason).toBe(INVITE_REASONS.DOMAIN_NOT_ALLOWED);
    });

    it('refuses everybody when the allowlist is not even an array', () => {
        expect(invite({ allowedDomains: null }).reason).toBe(INVITE_REASONS.DOMAIN_NOT_ALLOWED);
    });

    it('refuses a lookalike domain rather than matching on a suffix', () => {
        expect(invite({ invitee: invitee({ email: 'a@kkh.com.sg.attacker.example' }) }).reason)
            .toBe(INVITE_REASONS.DOMAIN_NOT_ALLOWED);
    });

    it('refuses a subdomain, which is one config entry away if a cluster needs it', () => {
        expect(invite({ invitee: invitee({ email: 'a@mail.kkh.com.sg' }) }).reason)
            .toBe(INVITE_REASONS.DOMAIN_NOT_ALLOWED);
    });

    it('refuses a two-@ address that a naive split would have admitted', () => {
        expect(invite({ invitee: invitee({ email: 'a@evil.example@kkh.com.sg' }) }).reason)
            .toBe(INVITE_REASONS.BAD_EMAIL);
    });

    it('refuses a non-address', () => {
        expect(invite({ invitee: invitee({ email: 'brandon' }) }).reason).toBe(INVITE_REASONS.BAD_EMAIL);
    });

    /**
     * The v2.0 scope decision, pinned so that changing it is deliberate. There is no
     * pending invitation: an address with no account is refused with a sentence
     * naming the fix. The REASON CODE is asserted as well as the sentence, because
     * that code is what a future pending-invitation path would branch on.
     */
    it('refuses an address that has not registered yet, and says what to do', () => {
        const verdict = invite({ invitee: invitee({ uid: null }) });
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toBe(INVITE_REASONS.NO_ACCOUNT);
        expect(verdict.message).toMatch(/register first/i);
    });

    it('refuses somebody who registered but never confirmed their email', () => {
        const verdict = invite({ invitee: invitee({ emailVerified: false }) });
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toBe(INVITE_REASONS.UNVERIFIED);
    });

    it('can be told not to require verification, for a cluster that does not use it', () => {
        expect(invite({ invitee: invitee({ emailVerified: false }), requireVerifiedEmail: false }).ok)
            .toBe(true);
    });
});

// ── 3. THE ROLE BEING GRANTED ────────────────────────────────────────────────

describe('the role a member is given', () => {
    it.each(MEMBER_ROLES)('accepts %s', (role) => {
        expect(invite({ role }).ok).toBe(true);
    });

    it('refuses anything else', () => {
        expect(invite({ role: 'admin' }).reason).toBe(INVITE_REASONS.BAD_ROLE);
        expect(invite({ role: 'superadmin' }).reason).toBe(INVITE_REASONS.BAD_ROLE);
        expect(invite({ role: '' }).reason).toBe(INVITE_REASONS.BAD_ROLE);
    });

    /**
     * A LEAD MAY CREATE ANOTHER LEAD, deliberately. A department with one lead and
     * no deputy is a department that loses its roster the week that person is on
     * leave, and `assertRemovable` below depends on a second lead existing for
     * anybody to be able to step down.
     */
    it('lets a lead promote a colleague to lead', () => {
        expect(invite({ role: 'lead' }).ok).toBe(true);
    });
});

// ── 4. ADDING SOMEBODY TWICE ─────────────────────────────────────────────────

describe('adding somebody who is already in the team', () => {
    /**
     * `ok: true`, not an error. A double-clicked button and a colleague adding
     * somebody a co-lead already added are the same event, and both got the state
     * they wanted. Making this an error would train leads to ignore errors.
     */
    it('succeeds, changes nothing, and says so', () => {
        const verdict = invite({ existingMembership: { displayName: 'Brandon', role: 'staff' } });
        expect(verdict.ok).toBe(true);
        expect(verdict.alreadyMember).toBe(true);
        expect(verdict.message).toContain('Brandon');
        expect(verdict.message).toMatch(/nothing was changed/i);
    });

    it('still refuses a disallowed domain before noticing they are a member', () => {
        // Order matters: a membership that should never have existed is not a
        // reason to stop checking. Ordering the other way would make an existing
        // bad membership self-justifying.
        const verdict = invite({
            invitee: invitee({ email: 'someone@gmail.com' }),
            existingMembership: { displayName: 'Someone', role: 'staff' },
        });
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toBe(INVITE_REASONS.DOMAIN_NOT_ALLOWED);
    });
});

// ── 5. WHAT AN INVITATION ACTUALLY WRITES ────────────────────────────────────

describe('buildInviteWrites', () => {
    const writes = (over = {}) => buildInviteWrites({
        teamId: TEAM,
        invitee: invitee(),
        displayName: 'Brandon',
        role: 'staff',
        invitedBy: LEAD.uid,
        now: NOW,
        ...over,
    });

    it('keys the membership by uid, beneath the team', () => {
        expect(writes().member.path).toEqual(['teams', TEAM, 'members', 'newUid00000000000000000000bb']);
    });

    it('adds the team to the person, and never replaces their team list', () => {
        const { user } = writes();
        expect(user.path).toEqual(['users', 'newUid00000000000000000000bb']);
        expect(user.merge).toBe(true);
        expect(user.data.addTeamIds).toEqual([TEAM]);
        // A `teamIds` key here would OVERWRITE the list and drop every other team
        // the person belongs to — the exact failure multi-team membership exists
        // to support.
        expect(user.data.teamIds).toBeUndefined();
    });

    it('lower-cases the stored address so two spellings are not two people', () => {
        expect(writes({ invitee: invitee({ email: 'Brandon@KKH.com.sg' }) }).member.data.email)
            .toBe('brandon@kkh.com.sg');
    });

    it('falls back to the address when no display name was given', () => {
        expect(writes({ displayName: '' }).member.data.displayName).toBe('brandon@kkh.com.sg');
    });

    /**
     * THE SHAPE HAS TO MATCH THE FIRST MEMBER'S. A team's second person is written
     * here and its first by `buildApprovalWrites`; if the two disagree, the roster's
     * staff pool, the swap picker and the load table behave differently for them.
     */
    it('writes every field the approval path writes for the first member', () => {
        const member = writes().member.data;
        for (const key of ['displayName', 'email', 'role', 'rostered', 'grade', 'fte', 'skills', 'unavailable', 'joinedAt']) {
            expect(member).toHaveProperty(key);
        }
        expect(member.fte).toBe(1);
        expect(member.skills).toEqual([]);
        expect(member.unavailable).toEqual([]);
    });

    it('records who did the adding', () => {
        expect(writes().member.data.invitedBy).toBe(LEAD.uid);
    });

    describe('rostered', () => {
        it('defaults to true for staff — a clinician silently missing from every week is worse', () => {
            expect(writes().member.data.rostered).toBe(true);
        });

        it('honours an explicit false, for a roster master who holds no duties', () => {
            expect(writes({ rostered: false }).member.data.rostered).toBe(false);
        });

        it('a lead can still be rostered — most small-service leads practise', () => {
            expect(writes({ role: 'lead' }).member.data.rostered).toBe(true);
        });

        /**
         * The one combination that cannot mean anything: a viewer exists for a
         * manager who READS the roster and does not appear in it. A rostered viewer
         * would be given duties they cannot open the swap screen to hand back.
         */
        it('forces a viewer out of the staff pool whatever the form said', () => {
            expect(writes({ role: 'viewer', rostered: true }).member.data.rostered).toBe(false);
        });
    });
});

// ── 6. REMOVAL, AND THE TEAM THAT NOBODY CAN ADMINISTER ──────────────────────

const remove = (over = {}) => assertRemovable({
    teamId: TEAM,
    team: { leadUid: LEAD.uid },
    callerUid: LEAD.uid,
    callerMembership: LEAD,
    targetUid: 'staffUid000000000000000000cc',
    targetMembership: { role: 'staff', displayName: 'Brandon' },
    leadCount: 1,
    ...over,
});

describe('removing somebody', () => {
    it('a lead may remove a staff member', () => {
        expect(remove().ok).toBe(true);
    });

    it('a staff member may not remove anybody', () => {
        expect(remove({ callerMembership: { role: 'staff' } }).reason).toBe(REMOVE_REASONS.NOT_A_LEAD);
    });

    it('removing somebody already gone succeeds and changes nothing', () => {
        const verdict = remove({ targetMembership: null });
        expect(verdict.ok).toBe(true);
        expect(verdict.alreadyGone).toBe(true);
    });

    /**
     * ⚠️ BOTH OF THESE PRODUCE A TEAM WITH NO ADMINISTRATOR, and there is no repair
     *    path inside the app — every screen that could fix it needs a lead. The
     *    owner would have to edit Firestore by hand.
     */
    it('refuses to remove the lead the team was created for', () => {
        const verdict = remove({ targetUid: LEAD.uid, targetMembership: LEAD, leadCount: 5 });
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toBe(REMOVE_REASONS.TEAM_OWNER);
    });

    it('refuses to remove the only lead', () => {
        const verdict = remove({
            team: { leadUid: 'someone-else' },
            targetUid: 'coLeadUid00000000000000000dd',
            targetMembership: { role: 'lead', displayName: 'Deputy' },
            leadCount: 1,
        });
        expect(verdict.reason).toBe(REMOVE_REASONS.LAST_LEAD);
    });

    /**
     * COUNTED, NOT INFERRED FROM `caller !== target`. Both directions are asserted
     * because an implementation that just compared the two uids would pass one of
     * them and fail the other.
     */
    it('allows a lead to remove another lead when a third remains', () => {
        expect(remove({
            team: { leadUid: 'someone-else' },
            targetUid: 'coLeadUid00000000000000000dd',
            targetMembership: { role: 'lead' },
            leadCount: 3,
        }).ok).toBe(true);
    });

    it('allows a lead to step down once somebody else is a lead', () => {
        const me = 'coLeadUid00000000000000000dd';
        expect(remove({
            team: { leadUid: 'someone-else' },
            callerUid: me,
            callerMembership: { uid: me, role: 'lead' },
            targetUid: me,
            targetMembership: { role: 'lead' },
            leadCount: 2,
        }).ok).toBe(true);
    });

    it('names the fix when the only lead tries to step down', () => {
        const me = 'coLeadUid00000000000000000dd';
        const verdict = remove({
            team: { leadUid: 'someone-else' },
            callerUid: me,
            callerMembership: { uid: me, role: 'lead' },
            targetUid: me,
            targetMembership: { role: 'lead' },
            leadCount: 1,
        });
        expect(verdict.message).toMatch(/promote somebody else/i);
    });

    /**
     * `Number(undefined)` is `NaN` and every comparison with `NaN` is false, so the
     * first version of the guard let an unknown count through — a handler that
     * forgot the count, or whose count query failed, could remove a team's last
     * lead. This case is why that is now explicit.
     */
    it('treats a missing lead count as one, rather than as permission', () => {
        expect(remove({
            team: { leadUid: 'someone-else' },
            targetMembership: { role: 'lead' },
            leadCount: undefined,
        }).reason).toBe(REMOVE_REASONS.LAST_LEAD);
    });
});

describe('buildRemoveWrites', () => {
    it('deletes the membership and subtracts the team from the person', () => {
        const writes = buildRemoveWrites({ teamId: TEAM, targetUid: 'staffUid000000000000000000cc' });
        expect(writes.member.path).toEqual(['teams', TEAM, 'members', 'staffUid000000000000000000cc']);
        expect(writes.member.delete).toBe(true);
        expect(writes.user.merge).toBe(true);
        expect(writes.user.data.removeTeamIds).toEqual([TEAM]);
    });

    /**
     * THE HALF-REMOVAL IS THE BUG THIS SHAPE EXISTS TO PREVENT. A `teamIds` entry
     * left behind after the membership is deleted means every listener that person's
     * app opens fails permission-denied — silently, forever, with a team still in
     * their switcher. Both writes or neither, in one batch.
     */
    it('always returns both writes, so a caller cannot do only one', () => {
        const writes = buildRemoveWrites({ teamId: TEAM, targetUid: 'x' });
        expect(Object.keys(writes).sort()).toEqual(['member', 'user']);
    });
});

// ── 7. THE DRIFT GUARD ───────────────────────────────────────────────────────

describe('the domain gate matches the client copy', () => {
    /**
     * `functions/` deploys on its own and cannot import from `src/`, so the domain
     * regex exists twice. This is what makes that duplication safe: the two
     * implementations are run against the same inputs and compared. The equivalent
     * guard in `teamApproval.test.js` caught a real divergence in `slugTeamId`.
     */
    const CASES = [
        'brandon@kkh.com.sg', 'a@KKH.COM.SG', '  a@kkh.com.sg  ', 'a@kkh.com.sg.',
        'a@mail.kkh.com.sg', 'a@kkh.com.sg.attacker.example', 'a@b@kkh.com.sg',
        '@kkh.com.sg', 'a@', 'a@-kkh.com.sg', 'a@kkh-.com.sg', 'a@localhost', 'not-an-email', '',
    ];

    it.each(CASES)('agrees on %j', (value) => {
        expect(emailDomain(value)).toBe(clientEmailDomain(value));
    });

    it.each(['kkh.com.sg', '@KKH.com.sg', 'kkh.com.sg.', '*', '*.com.sg', 'localhost', ''])(
        'agrees on the domain %j',
        (value) => {
            const { normaliseDomain } = require('./teamMembership.js');
            expect(normaliseDomain(value)).toBe(clientNormaliseDomain(value));
        },
    );

    /**
     * ⚠️ THE WILDCARD CASE IS THE LOAD-BEARING ONE. A single `*` entry typed by
     *    somebody trying to "open it up for the pilot" would look like an ordinary
     *    configuration value while admitting the public internet.
     */
    it('never admits a wildcard entry', () => {
        expect(parseDomainAllowlist({ allowed: ['*'] })).toEqual([]);
        expect(isAllowedEmail('anyone@anywhere.example', ['*'])).toBe(false);
    });

    it('drops bad entries rather than rejecting the whole document', () => {
        expect(parseDomainAllowlist({ allowed: ['kkh.com.sg', '*', 'not a domain', '@sgh.com.sg'] }))
            .toEqual(['kkh.com.sg', 'sgh.com.sg']);
    });

    it('returns an empty list — meaning admit nobody — for a malformed document', () => {
        expect(parseDomainAllowlist(null)).toEqual([]);
        expect(parseDomainAllowlist({})).toEqual([]);
        expect(parseDomainAllowlist({ allowed: 'kkh.com.sg' })).toEqual([]);
    });
});

// ── 8. THE RULES FILE AGREES THAT THIS IS A FUNCTION'S JOB ───────────────────

describe('firestore.rules still defers to this module', () => {
    /**
     * The rules deny `create` and `delete` on a membership and their comments say a
     * Cloud Function does it instead. That comment was true and the function did not
     * exist. This asserts the DENIAL is still there — if somebody ever relaxes it to
     * `allow create: if isLead(teamId)`, every check in section 2 above becomes
     * optional, because the client could write the document directly.
     */
    it('still denies client-side membership creation and deletion', () => {
        const rules = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'firestore.rules'), 'utf8');
        const block = rules.slice(
            rules.indexOf('match /members/{memberUid}'),
            rules.indexOf('match /rosters/{year}'),
        );
        expect(block).not.toBe('');
        expect(block).toMatch(/allow create:\s*if false;/);
        expect(block).toMatch(/allow delete:\s*if false;/);
    });
});
