/**
 * ==============================================================================
 * AUTH FAILURE CLASSIFICATION — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * The migration told its owner that seven practising clinicians — including
 * himself — had never registered, because a `catch (error)` block never read
 * `error`. Every case below is a way that could happen again.
 */

import { describe, it, expect } from 'vitest';
import authFailure from './authFailure.cjs';
import credential from './credential.cjs';

const { classifyAuthFailure, environmentReport, NO_ACCOUNT_CODE } = authFailure;
const { describeCredential, describeCredentialFile } = credential;

const err = (code, message = 'boom') => Object.assign(new Error(message), { code });

describe('classifyAuthFailure', () => {
    it('recognises the one code that genuinely means "no account"', () => {
        const c = classifyAuthFailure(err(NO_ACCOUNT_CODE, 'There is no user record…'));
        expect(c.kind).toBe('no-account');
        expect(NO_ACCOUNT_CODE).toBe('auth/user-not-found');
    });

    /**
     * ⚠️ THE BUG. Each of these used to print "NO AUTH ACCOUNT for <name> — they
     *    must register once". None of them is about that person at all.
     */
    it.each([
        ['auth/invalid-credential'],
        ['app/invalid-credential'],
        ['auth/insufficient-permission'],
        ['auth/project-not-found'],
        ['auth/internal-error'],
    ])('classifies %s as environmental, not as a missing clinician', (code) => {
        expect(classifyAuthFailure(err(code)).kind).toBe('environment');
    });

    /**
     * The default matters more than any listed code. An error nobody anticipated
     * must not be reported as the one specific thing that is usually actionable.
     */
    it('defaults an UNRECOGNISED code to environmental', () => {
        expect(classifyAuthFailure(err('auth/some-code-invented-in-2027')).kind).toBe('environment');
    });

    it('handles errors with no code at all — a network failure has none', () => {
        expect(classifyAuthFailure(new Error('ECONNREFUSED')).kind).toBe('environment');
        expect(classifyAuthFailure(new Error('ECONNREFUSED')).message).toBe('ECONNREFUSED');
    });

    it('does not throw on junk, because a thrower here loses the real error', () => {
        expect(() => classifyAuthFailure(null)).not.toThrow();
        expect(() => classifyAuthFailure(undefined)).not.toThrow();
        expect(() => classifyAuthFailure('a string')).not.toThrow();
        expect(classifyAuthFailure(null).kind).toBe('environment');
    });

    it('always carries the raw code and message through, hint or not', () => {
        const c = classifyAuthFailure(err('auth/nothing-known-about-this', 'the real detail'));
        expect(c.code).toBe('auth/nothing-known-about-this');
        expect(c.message).toBe('the real detail');
        expect(c.hint).toBeNull();
    });
});

describe('environmentReport', () => {
    const member = { displayName: 'Alif', email: 'muhammad.alif@kkh.com.sg' };

    it('names the person looked up WITHOUT blaming them', () => {
        const lines = environmentReport(member, classifyAuthFailure(err('app/invalid-credential'))).join('\n');
        expect(lines).toContain('Alif');
        expect(lines).not.toMatch(/must register/i);
        expect(lines).toMatch(/problem with the RUN, not with this person/);
    });

    it('prints the raw code and message, so the cause is on screen', () => {
        const lines = environmentReport(member, classifyAuthFailure(err('auth/internal-error', 'upstream said no'))).join('\n');
        expect(lines).toContain('auth/internal-error');
        expect(lines).toContain('upstream said no');
    });

    it('says nothing was written', () => {
        expect(environmentReport(member, classifyAuthFailure(err('x'))).join('\n')).toMatch(/Nothing was written/);
    });
});

describe('describeCredential — which project is this key for?', () => {
    const good = JSON.stringify({
        type: 'service_account', project_id: 'nexus-live', client_email: 'sa@nexus-live.iam.gserviceaccount.com',
    });

    it('reads the project and the identity out of a service-account key', () => {
        expect(describeCredential(good)).toEqual({
            ok: true, projectId: 'nexus-live',
            clientEmail: 'sa@nexus-live.iam.gserviceaccount.com', problem: null,
        });
    });

    it('rejects a non-service-account credential by name', () => {
        const r = describeCredential(JSON.stringify({ type: 'authorized_user', project_id: 'p' }));
        expect(r.ok).toBe(false);
        expect(r.problem).toMatch(/"authorized_user", not "service_account"/);
    });

    it('rejects a key that names no project', () => {
        const r = describeCredential(JSON.stringify({ client_email: 'a@b' }));
        expect(r.ok).toBe(false);
        expect(r.projectId).toBeNull();
        expect(r.problem).toMatch(/no `project_id`/);
    });

    it('does not throw on a file that is not JSON', () => {
        const r = describeCredential('<!DOCTYPE html>');
        expect(r.ok).toBe(false);
        expect(r.problem).toMatch(/not valid JSON/);
    });
});

describe('describeCredentialFile — the environment mistakes, as sentences', () => {
    it('says so when the variable is not set at all', () => {
        const r = describeCredentialFile(undefined);
        expect(r.ok).toBe(false);
        expect(r.problem).toMatch(/GOOGLE_APPLICATION_CREDENTIALS is not set/);
    });

    /**
     * A path typo is the likeliest mistake at 11pm before a cutover, and the
     * tilde note is there because `GOOGLE_APPLICATION_CREDENTIALS="~/key.json"`
     * quoted does not expand and fails identically to a missing file.
     */
    it('reports an unreadable path as a path problem, never as a missing account', () => {
        const r = describeCredentialFile('/definitely/not/here/key.json');
        expect(r.ok).toBe(false);
        expect(r.problem).toMatch(/Could not read the credential file/);
        expect(r.problem).toMatch(/ENOENT/);
        expect(r.problem).not.toMatch(/register/i);
    });

    it('never throws, whatever it is handed', () => {
        expect(() => describeCredentialFile('')).not.toThrow();
        expect(() => describeCredentialFile('/proc')).not.toThrow();
    });
});
