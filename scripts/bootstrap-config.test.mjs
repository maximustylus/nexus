/**
 * ==============================================================================
 * BOOTSTRAP-CONFIG — the two facts it must not get wrong
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * SOURCE-READ, NOT IMPORTED, and for a specific reason: `bootstrap-config.cjs`
 * calls `main()` on load and `main()` initialises firebase-admin. Importing it in a
 * test would try to authenticate against a real project. The same reason
 * `nric.test.js` reads `firestore.rules` as text rather than evaluating it.
 *
 * WHY THIS FILE IS WORTH ITS LENGTH. The script exists because NEXUS could not be
 * initialised from NEXUS: `config/domains` and `config/superAdmins` are read by
 * Cloud Functions and written by nothing, so a fresh deployment refused every
 * invitation and left every lead request unapprovable. Both refusals are correct in
 * isolation. Together they were a product that could not be started, and the owner
 * hit it on their own department's domain.
 *
 * A bootstrap that writes the WRONG allowlist is worse than none: it would look
 * like setup had been done while still locking people out, and the message they get
 * blames their institution.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_ALLOWED_DOMAINS } from '../src/utils/accessPolicy.js';

const source = readFileSync(resolve(process.cwd(), 'scripts/bootstrap-config.cjs'), 'utf8');

describe('the built-in default cannot drift from the client fallback', () => {
    /**
     * ⚠️ TWO COPIES OF ONE FACT, AND THIS IS THE JOIN. `accessPolicy.js` falls back
     *    to these domains so the LOGIN screen keeps working when `config/domains` is
     *    unreadable — which is why every user could sign in while nobody could be
     *    added to a team. A bootstrap with no `--domain` should therefore produce
     *    exactly the allowlist the app has been behaving as though existed. If the
     *    two lists diverge, the script "succeeds" and changes nothing anyone can use.
     */
    it('seeds precisely the domains accessPolicy falls back to', () => {
        const block = source.match(/const DEFAULT_DOMAINS = \[([^\]]+)\]/);
        expect(block, 'DEFAULT_DOMAINS not found in the script').not.toBeNull();

        const scripted = block[1]
            .split(',')
            .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean);

        expect(scripted).toEqual([...DEFAULT_ALLOWED_DOMAINS]);
    });
});

describe('the script cannot write by accident', () => {
    it('requires --write, so a bare run is a dry run', () => {
        expect(source).toMatch(/const WRITE = argv\.includes\('--write'\)/);
        // Every write is guarded. Counted rather than eyeballed: a new `.set(` added
        // later without a guard is the regression this catches.
        const writes = source.match(/await \w+Ref\.set\(/g) || [];
        const guards = source.match(/if \(WRITE(?: && [^)]+)?\)/g) || [];
        expect(writes.length).toBeGreaterThan(0);
        expect(guards.length, 'a .set() was added without a WRITE guard').toBeGreaterThanOrEqual(writes.length);
    });

    it('names the project before reading anything, so a wrong key is caught by a human', () => {
        const projectLine = source.indexOf('PROJECT :');
        const firstRead = source.indexOf('.get()');
        expect(projectLine).toBeGreaterThan(-1);
        expect(projectLine, 'the project is printed after the first read').toBeLessThan(firstRead);
    });
});

describe('an existing allowlist is never silently replaced', () => {
    /**
     * Overwriting `config/domains` can remove an institution that is already
     * onboarded, and the failure it produces is every user there being told "NEXUS
     * is not open to your domain" — the exact wrong message this change set exists
     * to stop. So the default is to leave it alone and say so.
     */
    it('leaves an existing document alone unless --merge-domains is passed', () => {
        expect(source).toMatch(/--merge-domains/);
        expect(source).toMatch(/left alone/i);
        // And the merge is ADDITIVE — a union, never a replacement.
        expect(source).toMatch(/new Set\(\[\.\.\.existing, \.\.\.domains\]\)/);
    });

    it('refuses to invent a super-admin', () => {
        // A script that grants approval rights to whoever ran it is a privilege
        // escalation with a helpful tone of voice.
        expect(source).toMatch(/privilege escalation/i);
        expect(source).toMatch(/--super-admin/);
        // There is no default list for super-admins, unlike domains.
        expect(source).not.toMatch(/const DEFAULT_SUPER/);
    });
});

describe('it validates a domain rather than trusting the operator', () => {
    it('carries a domain shape check with no @, scheme or wildcard', () => {
        const match = source.match(/const isDomain = \(value\) => (\/.+\/)\.test\(value\)/);
        expect(match, 'isDomain not found').not.toBeNull();

        // Mirror the deployed pattern and exercise it, rather than trusting that a
        // regexp exists — the trap `nric.test.js` documents.
        const pattern = new RegExp(match[1].slice(1, -1));
        for (const good of ['kkh.com.sg', 'singhealth.com.sg', 'a.co', 'my-hospital.health.sg']) {
            expect(pattern.test(good), `${good} should be a domain`).toBe(true);
        }
        for (const bad of ['me@kkh.com.sg', 'https://kkh.com.sg', '*', '*.kkh.com.sg', 'kkh', '', 'kkh..sg', '-kkh.sg']) {
            expect(pattern.test(bad), `${bad} should NOT be a domain`).toBe(false);
        }
    });
});
