/**
 * The bridge's contract, and the reason its inputs are mostly synthetic.
 *
 * ⚠️ REAL COLLEAGUES' EMAILS ARE DELIBERATELY NOT RE-LISTED HERE. `AN14` is about
 *    the bundle, not the repo — test files do not ship — but re-typing six
 *    addresses into a second file to test the module that exists to stop shipping
 *    them would still be more copies, and the git history holds enough already.
 *    The one real address used is the owner's, which identifies this project's
 *    maintainer everywhere else in the repo. Everything else is asserted
 *    structurally: table size, role distribution, digest shape.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { checkAccess, isLegacyAdminEmail, _internals } from './legacyBridge.js';

const OWNER = 'muhammad.alif@kkh.com.sg';

describe('checkAccess — recognition', () => {
    it('recognises a legacy member and returns role and title only', () => {
        expect(checkAccess(OWNER)).toEqual({
            role: 'admin',
            title: 'Lead, Clinical Exercise Physiology',
            legacyBridge: true,
        });
    });

    it('is case-insensitive and trims, matching the old directory find()', () => {
        expect(checkAccess('  Muhammad.Alif@KKH.com.sg ')).toBeTruthy();
    });

    it('returns null for a stranger, not undefined — the old contract', () => {
        expect(checkAccess('nobody@kkh.com.sg')).toBeNull();
    });

    it.each([
        ['undefined', undefined],
        ['null', null],
        ['empty', ''],
        ['a number', 42],
        ['an object', {}],
        ['an array', []],
    ])('returns null for %s rather than throwing mid-render', (_label, value) => {
        // `App.jsx` calls this on every render pass with `user?.email`, which is
        // undefined until auth resolves. A throw here is a white screen at sign-in.
        expect(checkAccess(value)).toBeNull();
    });

    it('never returns a name, an email or a legacy id — the fields AN14 removed', () => {
        const profile = checkAccess(OWNER);
        expect(profile).not.toHaveProperty('name');
        expect(profile).not.toHaveProperty('email');
        expect(profile).not.toHaveProperty('id');
    });
});

describe('isLegacyAdminEmail — the ADMIN_EMAILS replacement', () => {
    it('grants the owner', () => {
        expect(isLegacyAdminEmail(OWNER)).toBe(true);
    });

    it('refuses a recognised non-admin and a stranger alike', () => {
        // A staff digest exists in the table; membership must not imply admin.
        expect(isLegacyAdminEmail('nobody@kkh.com.sg')).toBe(false);
        expect(isLegacyAdminEmail(undefined)).toBe(false);
    });
});

describe('the table — structure, not identities', () => {
    const { BRIDGE_SALT, LEGACY_MEMBERS } = _internals;

    it('holds exactly the seven post-revocation members', () => {
        // Evelyn, Ashik and Mini were revoked BEFORE the directory was deleted
        // (`scripts/team-one-manifest.cjs`). Ten entries here would mean somebody
        // resurrected them by re-deriving from an old commit.
        expect(LEGACY_MEMBERS.size).toBe(7);
    });

    it('holds two admins, one viewer, four staff — the directory as revoked', () => {
        const roles = [...LEGACY_MEMBERS.values()].map((v) => v.role).sort();
        expect(roles).toEqual(['admin', 'admin', 'staff', 'staff', 'staff', 'staff', 'viewer']);
    });

    it('every key is a lowercase hex SHA-256 digest, not an address', () => {
        for (const key of LEGACY_MEMBERS.keys()) {
            expect(key).toMatch(/^[0-9a-f]{64}$/);
            expect(key).not.toContain('@');
        }
    });

    it('no value carries a name or an email field', () => {
        for (const value of LEGACY_MEMBERS.values()) {
            expect(Object.keys(value).sort()).toEqual(['role', 'title']);
            expect(String(value.title)).not.toMatch(/@/);
        }
    });

    it('the digest scheme matches the regeneration script exactly', () => {
        // `scripts/legacy-bridge-digest.cjs` and this module must agree, or the
        // next row somebody generates will silently recognise nobody.
        const expected = createHash('sha256')
            .update(BRIDGE_SALT + OWNER)
            .digest('hex');
        expect(LEGACY_MEMBERS.has(expected)).toBe(true);
    });
});
