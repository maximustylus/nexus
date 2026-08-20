/**
 * ==============================================================================
 * ACCESS POLICY — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * Like `teamPaths.test.js`, this file is weighted towards the REFUSALS. A gate that
 * admits the wrong person looks identical, on screen, to a gate working correctly —
 * the only place the difference is visible is here.
 */

import { describe, it, expect } from 'vitest';
import {
    DEFAULT_ALLOWED_DOMAINS,
    normaliseDomain,
    emailDomain,
    parseDomainAllowlist,
    isAllowedEmail,
    domainRefusalMessage,
    LEAD_ROLES,
    ROLE_OPTIONS,
    ROLE_STAFF,
    ROLE_LEAD,
    ROLE_SUPERVISOR,
    ROLE_ADMINISTRATOR,
    isLeadRole,
    validateLeadDeclaration,
    buildLeadRequest,
    accessStateFor,
    canEnterApp,
    ACCESS_UNVERIFIED,
    ACCESS_ACTIVE,
    ACCESS_PENDING_LEAD,
    ACCESS_DECLINED,
    ACCESS_AWAITING_INVITE,
} from './accessPolicy';

describe('accessPolicy — domain normalisation', () => {
    it('accepts what people actually type', () => {
        expect(normaliseDomain('kkh.com.sg')).toBe('kkh.com.sg');
        expect(normaliseDomain('  @KKH.com.sg  ')).toBe('kkh.com.sg');
        expect(normaliseDomain('kkh.com.sg.')).toBe('kkh.com.sg');
        expect(normaliseDomain('nuh-cluster.edu.sg')).toBe('nuh-cluster.edu.sg');
    });

    /**
     * THE WILDCARD REFUSAL. Someone widening access "just for the pilot" would type
     * `*` or `*.com` into `config/domains`, it would look like an ordinary
     * configuration value, and registration would be open to the public internet.
     */
    it('refuses wildcards, paths and anything without a dot', () => {
        expect(normaliseDomain('*')).toBeNull();
        expect(normaliseDomain('*.com.sg')).toBeNull();
        expect(normaliseDomain('kkh.com.sg/evil')).toBeNull();
        expect(normaliseDomain('localhost')).toBeNull();
        expect(normaliseDomain('')).toBeNull();
        expect(normaliseDomain('-kkh.com.sg')).toBeNull();
        expect(normaliseDomain('a@b.com')).toBeNull();
        expect(normaliseDomain(null)).toBeNull();
        expect(normaliseDomain(42)).toBeNull();
    });
});

describe('accessPolicy — reading the domain out of an address', () => {
    it('lowercases and takes the half after the one @', () => {
        expect(emailDomain('Evelyn.Ong.MH@kkh.com.sg')).toBe('kkh.com.sg');
        expect(emailDomain('  benny.loo.k.g.@singhealth.com.sg ')).toBe('singhealth.com.sg');
    });

    it('refuses addresses with no @, two @, or an empty local part', () => {
        expect(emailDomain('kkh.com.sg')).toBeNull();
        expect(emailDomain('a@b@kkh.com.sg')).toBeNull();
        expect(emailDomain('@kkh.com.sg')).toBeNull();
        expect(emailDomain(undefined)).toBeNull();
    });
});

describe('accessPolicy — the allowlist document', () => {
    it('reads a well-formed document, deduplicated and sorted', () => {
        expect(parseDomainAllowlist({ allowed: ['SGH.com.sg', '@kkh.com.sg', 'kkh.com.sg'] }))
            .toEqual(['kkh.com.sg', 'sgh.com.sg']);
    });

    it('drops individual bad entries rather than rejecting the whole list', () => {
        expect(parseDomainAllowlist({ allowed: ['kkh.com.sg', '*', 'nonsense', 42] }))
            .toEqual(['kkh.com.sg']);
    });

    /**
     * FAIL CLOSED. Every unusable shape returns null, and null means the CALLER
     * falls back to `DEFAULT_ALLOWED_DOMAINS` — never to "allow everything". A
     * missing config document must not be a way in.
     */
    it('returns null — meaning use the fallback — for every unusable document', () => {
        expect(parseDomainAllowlist(null)).toBeNull();
        expect(parseDomainAllowlist(undefined)).toBeNull();
        expect(parseDomainAllowlist({})).toBeNull();
        expect(parseDomainAllowlist({ allowed: [] })).toBeNull();
        expect(parseDomainAllowlist({ allowed: 'kkh.com.sg' })).toBeNull();
        expect(parseDomainAllowlist({ allowed: ['*', 'nope'] })).toBeNull();
    });
});

describe('accessPolicy — the gate itself', () => {
    /**
     * THE TWO PEOPLE THE OLD GATE LOCKED OUT. `WelcomeScreen.jsx:109` demanded
     * `@kkh.com.sg`; Benny and Ashik have been in `TEAM_DIRECTORY` the whole time
     * on `@singhealth.com.sg` and could never sign in. This assertion is the fix.
     */
    it('admits the singhealth.com.sg addresses the old gate refused', () => {
        expect(isAllowedEmail('benny.loo.k.g.@singhealth.com.sg', DEFAULT_ALLOWED_DOMAINS)).toBe(true);
        expect(isAllowedEmail('mohammad.ashik.zainuddin@singhealth.com.sg', DEFAULT_ALLOWED_DOMAINS)).toBe(true);
        expect(isAllowedEmail('muhammad.alif@kkh.com.sg', DEFAULT_ALLOWED_DOMAINS)).toBe(true);
    });

    /**
     * THE SUFFIX ATTACK. The obvious implementation is `email.endsWith('@' + domain)`
     * or worse `email.includes(domain)`. Both admit `…@kkh.com.sg.attacker.example`,
     * a domain anybody can register. Exact match after the @ is the only safe form.
     */
    it('is an exact domain match, not a suffix match', () => {
        expect(isAllowedEmail('person@kkh.com.sg.attacker.example', ['kkh.com.sg'])).toBe(false);
        expect(isAllowedEmail('person@notkkh.com.sg', ['kkh.com.sg'])).toBe(false);
        expect(isAllowedEmail('person@mail.kkh.com.sg', ['kkh.com.sg'])).toBe(false);
        expect(isAllowedEmail('person@gmail.com', ['kkh.com.sg'])).toBe(false);
    });

    it('falls back to the defaults when handed an empty or missing list', () => {
        expect(isAllowedEmail('a@kkh.com.sg', [])).toBe(true);
        expect(isAllowedEmail('a@kkh.com.sg', null)).toBe(true);
        expect(isAllowedEmail('a@gmail.com', null)).toBe(false);
    });

    it('names the domain and the fix in the refusal, and never leaks a password', () => {
        const message = domainRefusalMessage('roster.master@nuh.edu.sg', ['kkh.com.sg', 'sgh.com.sg']);
        expect(message).toContain('nuh.edu.sg');
        expect(message).toContain('kkh.com.sg, sgh.com.sg');
        expect(message).toContain('service lead');
    });
});

describe('accessPolicy — who may declare themselves a lead', () => {
    it('is exactly the three roles the owner named, and staff is not one of them', () => {
        expect(LEAD_ROLES).toEqual([ROLE_LEAD, ROLE_SUPERVISOR, ROLE_ADMINISTRATOR]);
        expect(isLeadRole(ROLE_LEAD)).toBe(true);
        expect(isLeadRole(ROLE_SUPERVISOR)).toBe(true);
        expect(isLeadRole(ROLE_ADMINISTRATOR)).toBe(true);
        expect(isLeadRole(ROLE_STAFF)).toBe(false);
        expect(isLeadRole('admin')).toBe(false);
        expect(isLeadRole('')).toBe(false);
        expect(isLeadRole(undefined)).toBe(false);
    });

    it('offers staff first, because most registrants are staff', () => {
        expect(ROLE_OPTIONS[0].id).toBe(ROLE_STAFF);
        expect(ROLE_OPTIONS[0].declares).toBe(false);
        expect(ROLE_OPTIONS.filter((option) => option.declares).map((option) => option.id))
            .toEqual([...LEAD_ROLES]);
    });
});

describe('accessPolicy — validating a declaration', () => {
    const VALID = {
        role: ROLE_LEAD,
        institution: 'KKH',
        department: 'Respiratory Therapy',
        profession: 'respiratory-therapist',
    };

    it('accepts a complete declaration', () => {
        expect(validateLeadDeclaration(VALID)).toEqual({ ok: true, errors: {} });
    });

    it('reports one message per missing field, keyed by field', () => {
        const { ok, errors } = validateLeadDeclaration({ role: ROLE_STAFF });
        expect(ok).toBe(false);
        expect(Object.keys(errors).sort()).toEqual(['department', 'institution', 'profession', 'role']);
    });

    it('refuses a staff registrant trying to declare', () => {
        expect(validateLeadDeclaration({ ...VALID, role: ROLE_STAFF }).errors.role).toBeTruthy();
    });

    /**
     * THE CHECK THAT IS EASY TO OMIT. Institution and department must compose a
     * valid team id. Without this, "!!!" + "???" passes validation, becomes a
     * pending request, and fails inside the approval function days later — far from
     * the text box that caused it.
     */
    it('refuses input that cannot compose a team id, at the form rather than at approval', () => {
        const { ok, errors } = validateLeadDeclaration({ ...VALID, institution: '!!', department: '???' });
        expect(ok).toBe(false);
        expect(errors.department).toContain('team name');
    });

    it('treats whitespace-only as missing', () => {
        expect(validateLeadDeclaration({ ...VALID, institution: '   ' }).ok).toBe(false);
    });
});

describe('accessPolicy — the request document', () => {
    it('pins status to pending in code, so a client cannot approve itself', () => {
        const request = buildLeadRequest({
            uid: 'aB3xYz9QwErTyUiOpAsDfGhJkLzX',
            email: '  Lead.RT@KKH.com.sg ',
            displayName: '  Nur  ',
            role: ROLE_LEAD,
            institution: ' KKH ',
            department: 'Respiratory Therapy',
            profession: 'respiratory-therapist',
            status: 'approved',           // ← ignored on purpose
        });
        expect(request.status).toBe('pending');
        expect(request.email).toBe('lead.rt@kkh.com.sg');
        expect(request.displayName).toBe('Nur');
        expect(request.proposedTeamId).toBe('kkh-respiratory-therapy');
    });

    it('carries no field the approver would not want to see', () => {
        const request = buildLeadRequest({ uid: 'u', email: 'a@kkh.com.sg', role: ROLE_LEAD });
        expect(Object.keys(request).sort()).toEqual([
            'department', 'displayName', 'email', 'institution',
            'profession', 'proposedTeamId', 'role', 'status', 'uid',
        ]);
    });
});

describe('accessPolicy — where a signed-in person lands', () => {
    it('sends an unverified account nowhere near team data, membership or not', () => {
        expect(accessStateFor({ emailVerified: false, teamIds: ['kkh-sport-exercise-medicine'] }))
            .toBe(ACCESS_UNVERIFIED);
    });

    it('lets a member into the app', () => {
        expect(accessStateFor({ emailVerified: true, teamIds: ['kkh-sport-exercise-medicine'] }))
            .toBe(ACCESS_ACTIVE);
        expect(canEnterApp(ACCESS_ACTIVE)).toBe(true);
    });

    /**
     * THE ORDERING BUG THIS FUNCTION EXISTS TO PREVENT. A clinician already working
     * in team A, who then asks to start team B, must keep working. `if (leadRequest)
     * return pending` — the obvious implementation — parks them on a holding screen
     * and takes a live roster away from a practising clinician.
     */
    it('keeps a working member working while their SECOND team is being approved', () => {
        expect(accessStateFor({
            emailVerified: true,
            teamIds: ['kkh-sport-exercise-medicine'],
            leadRequest: { status: 'pending' },
        })).toBe(ACCESS_ACTIVE);
    });

    it('parks a would-be lead while their declaration is queued', () => {
        expect(accessStateFor({ emailVerified: true, teamIds: [], leadRequest: { status: 'pending' } }))
            .toBe(ACCESS_PENDING_LEAD);
        expect(accessStateFor({ emailVerified: true, leadRequest: { status: 'declined' } }))
            .toBe(ACCESS_DECLINED);
    });

    /**
     * The state the old app had no answer for: it rendered the whole shell over
     * empty collections, so someone waiting for an invitation saw an empty roster
     * and concluded NEXUS was broken.
     */
    it('gives a registered-but-uninvited person their own state instead of an empty app', () => {
        expect(accessStateFor({ emailVerified: true, teamIds: [] })).toBe(ACCESS_AWAITING_INVITE);
        expect(accessStateFor({ emailVerified: true })).toBe(ACCESS_AWAITING_INVITE);
        expect(canEnterApp(ACCESS_AWAITING_INVITE)).toBe(false);
    });

    it('ignores junk in teamIds rather than treating it as membership', () => {
        expect(accessStateFor({ emailVerified: true, teamIds: ['', null, undefined] }))
            .toBe(ACCESS_AWAITING_INVITE);
        expect(accessStateFor({ emailVerified: true, teamIds: 'kkh-sport-exercise-medicine' }))
            .toBe(ACCESS_AWAITING_INVITE);
    });

    it('only ACTIVE opens the app', () => {
        [ACCESS_UNVERIFIED, ACCESS_PENDING_LEAD, ACCESS_DECLINED, ACCESS_AWAITING_INVITE]
            .forEach((state) => expect(canEnterApp(state)).toBe(false));
    });
});
