/**
 * ==============================================================================
 * TEAM #1 MANIFEST — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * This manifest decides which real clinicians get access to real clinical data
 * after the migration. Everything asserted here is a way it could silently be
 * wrong — a duplicate address, a count that no longer reconciles, somebody in both
 * lists at once — none of which would look like anything at runtime.
 */

// ESM, importing a CommonJS manifest and an ESM module side by side. Vitest cannot
// be `require`d, and the manifest cannot be ESM — `migrate-to-teams.cjs` runs under
// plain node with the Admin SDK. Vite's interop handles the mix; the `.mjs`
// extension is what keeps this file out of the CommonJS override in `.eslintrc.cjs`.
import { describe, it, expect } from 'vitest';
import manifest from './team-one-manifest.cjs';
import { teamIdFrom } from '../src/utils/teamPaths.js';

const { TEAM_ONE, MEMBERS, EXCLUDED, LEGACY_DIRECTORY_SIZE } = manifest;

const emailsOf = (list) => list.map((person) => person.email.toLowerCase());

describe('team #1 — the team itself', () => {
    it('composes the id the app would derive from the same institution and department', () => {
        expect(TEAM_ONE.teamId).toBe(teamIdFrom(TEAM_ONE.institution, TEAM_ONE.department));
    });

    it('names a lead who is actually in the member list, with the lead role', () => {
        const lead = MEMBERS.find((m) => m.email.toLowerCase() === TEAM_ONE.leadEmail.toLowerCase());
        expect(lead).toBeTruthy();
        expect(lead.role).toBe('lead');
    });

    /**
     * A team with no lead is a team nobody can configure, invite into, or generate a
     * roster for — and the only route back is another approval.
     */
    it('has exactly one lead', () => {
        expect(MEMBERS.filter((m) => m.role === 'lead')).toHaveLength(1);
    });
});

describe('team #1 — the members', () => {
    it('is the seven the owner named, and not the original ten', () => {
        expect(MEMBERS).toHaveLength(7);
        expect(MEMBERS.map((m) => m.displayName).sort()).toEqual(
            ['Alif', 'Benny', 'Brandon', 'Derlinder', 'Fadzlynn', 'Nisa', 'Ying Xian'],
        );
    });

    /**
     * BENNY STAYS. "Remove the viewers" would have been the tidier-sounding rule and
     * is not what was asked for — he was kept deliberately when the other three
     * stakeholders were dropped. Asserted so a later tidy-up cannot quietly apply the
     * rule that was never given.
     */
    it('keeps Benny, who is a viewer but was not one of the three removed', () => {
        const benny = MEMBERS.find((m) => m.displayName === 'Benny');
        expect(benny).toBeTruthy();
        expect(benny.role).toBe('viewer');
    });

    it('gives everybody one of the three real roles', () => {
        MEMBERS.forEach((member) => {
            expect(['lead', 'staff', 'viewer']).toContain(member.role);
        });
    });

    /**
     * Email is the join key the migration resolves to a uid. Two members sharing one
     * address means two memberships written to the same uid — the second silently
     * overwriting the first, including its role.
     */
    it('has no duplicate email, and no duplicate legacy id', () => {
        expect(new Set(emailsOf(MEMBERS)).size).toBe(MEMBERS.length);
        expect(new Set(MEMBERS.map((m) => m.legacyId)).size).toBe(MEMBERS.length);
    });

    it('carries a legacy id for every member, which is how their old records are found', () => {
        MEMBERS.forEach((member) => {
            expect(typeof member.legacyId).toBe('string');
            expect(member.legacyId.length).toBeGreaterThan(0);
        });
    });
});

describe('team #1 — the exclusions', () => {
    it('names the three the owner removed', () => {
        expect(EXCLUDED.map((p) => p.displayName).sort()).toEqual(['Ashik', 'Evelyn', 'Mini']);
    });

    /**
     * NOBODY IN BOTH LISTS. In one direction a person is excluded and gets a
     * membership anyway; in the other the dry-run's count reconciles while somebody
     * loses access. Both are invisible until a clinician reports it.
     */
    it('has nobody in both lists', () => {
        const inBoth = emailsOf(EXCLUDED).filter((email) => emailsOf(MEMBERS).includes(email));
        expect(inBoth).toEqual([]);
    });

    /**
     * THE RECONCILIATION THE DRY-RUN PRINTS. Ten people were in the old directory;
     * seven become members and three are excluded by decision. If somebody edits one
     * list and not the other, this is what says so — rather than a migration that
     * quietly drops a clinician.
     */
    it('accounts for every person in the old directory', () => {
        expect(MEMBERS.length + EXCLUDED.length).toBe(LEGACY_DIRECTORY_SIZE);
    });
});
