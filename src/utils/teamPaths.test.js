/**
 * ==============================================================================
 * TEAM PATHS — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * This module is the seam the entire multi-team rewrite hangs off: if a path is
 * composed wrongly, one department's roster is written into another department's
 * document, nothing throws, and nothing on screen says so. So the tests here are
 * weighted towards the REFUSALS rather than the happy path — a helper that
 * returns a plausible-looking wrong path is far more dangerous than one that
 * crashes.
 */

import { describe, it, expect } from 'vitest';
import {
    isTeamId,
    assertTeamId,
    assertUid,
    teamIdFrom,
    teamPath,
    memberPath,
    membersPath,
    rosterPath,
    swapsPath,
    wellbeingDocPath,
    loadPath,
    reportPath,
    archivePath,
    userPath,
    leadRequestPath,
    configPath,
    CONFIG_DOCS,
    TEAM_COLLECTIONS,
    ROOT_COLLECTIONS,
    LEGACY,
} from './teamPaths';

const TEAM = 'kkh-respiratory-therapy';
const UID = 'aB3xYz9QwErTyUiOpAsDfGhJkLzX';

describe('teamPaths — team id validation', () => {
    it('accepts a slug and rejects everything that is not one', () => {
        expect(isTeamId(TEAM)).toBe(true);
        expect(isTeamId('kkh-sport-exercise-medicine')).toBe(true);
        expect(isTeamId('abc')).toBe(true);

        expect(isTeamId('')).toBe(false);
        expect(isTeamId('ab')).toBe(false);                    // too short
        expect(isTeamId('a'.repeat(65))).toBe(false);          // too long
        expect(isTeamId('KKH-Respiratory')).toBe(false);       // upper case
        expect(isTeamId('kkh_respiratory')).toBe(false);       // underscore
        expect(isTeamId('kkh--respiratory')).toBe(false);      // doubled hyphen
        expect(isTeamId('-kkh')).toBe(false);
        expect(isTeamId('kkh-')).toBe(false);
        expect(isTeamId(null)).toBe(false);
        expect(isTeamId(undefined)).toBe(false);
        expect(isTeamId(42)).toBe(false);
    });

    /**
     * THE ASSERTION THIS MODULE EXISTS FOR. A team id carrying a slash escapes the
     * subtree — `teams/a/../../b/rosters/2026` is a real Firestore path — and an
     * empty one composes `teams//rosters/2026`. Both are silent data corruption
     * rather than errors, so both must throw at the call site.
     */
    it('THROWS on a path-escaping or empty id rather than composing something plausible', () => {
        expect(() => teamPath('a/../b')).toThrow(/Invalid teamId/);
        expect(() => teamPath('kkh/respiratory')).toThrow(/Invalid teamId/);
        expect(() => teamPath('')).toThrow(/Invalid teamId/);
        expect(() => teamPath(undefined)).toThrow(/Invalid teamId/);
        expect(() => teamPath(null)).toThrow(/Invalid teamId/);
        // The message has to say WHY, because whoever hits it is mid-refactor.
        expect(() => teamPath('..')).toThrow(/writes into another team/);
    });

    it('assertTeamId returns the id so it can be used inline', () => {
        expect(assertTeamId(TEAM)).toBe(TEAM);
    });
});

describe('teamPaths — uid guard, which exists to catch the OLD habit', () => {
    it('accepts a Firebase uid', () => {
        expect(assertUid(UID)).toBe(UID);
    });

    /**
     * The previous model keyed documents by human name — `shift_swaps.targetStaff`
     * was `"Ying Xian"`. The guard is shaped to catch precisely that: a string with
     * a space in it. Two people called Sarah across two teams is a certainty, and
     * the failure mode is one clinician's wellbeing record filed under another's.
     */
    it('THROWS on a display name, which is the exact thing being migrated away from', () => {
        expect(() => memberPath(TEAM, 'Ying Xian')).toThrow(/Invalid uid/);
        expect(() => wellbeingDocPath(TEAM, 'Ying Xian')).toThrow(/never by display name/);
        expect(() => loadPath(TEAM, 'Scott Lang')).toThrow(/Invalid uid/);
        expect(() => userPath('')).toThrow(/Invalid uid/);
        expect(() => userPath(undefined)).toThrow(/Invalid uid/);
    });

    it('names the fix in the error, not just the problem', () => {
        expect(() => memberPath(TEAM, 'Ying Xian')).toThrow(/Pass `user.uid`/);
    });
});

describe('teamPaths — the paths themselves', () => {
    it('puts every team-owned collection beneath the team', () => {
        expect(teamPath(TEAM)).toEqual(['teams', TEAM]);
        expect(membersPath(TEAM)).toEqual(['teams', TEAM, 'members']);
        expect(memberPath(TEAM, UID)).toEqual(['teams', TEAM, 'members', UID]);
        expect(rosterPath(TEAM, 2026)).toEqual(['teams', TEAM, 'rosters', '2026']);
        expect(rosterPath(TEAM, '2026')).toEqual(['teams', TEAM, 'rosters', '2026']);
        expect(swapsPath(TEAM)).toEqual(['teams', TEAM, 'swaps']);
        expect(wellbeingDocPath(TEAM, UID)).toEqual(['teams', TEAM, 'wellbeing', UID]);
        expect(reportPath(TEAM, 2026)).toEqual(['teams', TEAM, 'reports', '2026']);
        expect(archivePath(TEAM, 2025)).toEqual(['teams', TEAM, 'archive', '2025']);
    });

    /**
     * TWO TEAMS MUST NEVER PRODUCE THE SAME PATH. This is the property that makes
     * the whole model safe, and it is one line to assert and impossible to notice
     * the absence of.
     */
    it('never produces the same path for two different teams', () => {
        const a = rosterPath('kkh-respiratory-therapy', 2026).join('/');
        const b = rosterPath('sgh-respiratory-therapy', 2026).join('/');
        expect(a).not.toBe(b);
        expect(a).toContain('kkh-');
        expect(b).toContain('sgh-');
    });

    it('keeps the not-team-scoped collections at the root, on purpose', () => {
        expect(userPath(UID)).toEqual(['users', UID]);
        expect(leadRequestPath(UID)).toEqual(['lead_requests', UID]);
        expect(configPath(CONFIG_DOCS.domains)).toEqual(['config', 'domains']);
        // A person is not a membership: `users` must NOT gain a team segment, or a
        // clinician in two teams edits their own name twice.
        expect(userPath(UID)).not.toContain('teams');
    });

    it('refuses a year that is not a year', () => {
        expect(() => rosterPath(TEAM, 'roster_2026')).toThrow(/Invalid year/);
        expect(() => rosterPath(TEAM, 26)).toThrow(/Invalid year/);
        expect(() => rosterPath(TEAM, '')).toThrow(/Invalid year/);
    });
});

describe('teamPaths — deriving an id from what a lead types', () => {
    it('slugs institution and department, institution first', () => {
        expect(teamIdFrom('KKH', 'Respiratory Therapy')).toBe('kkh-respiratory-therapy');
        expect(teamIdFrom('SGH', 'Physiotherapy')).toBe('sgh-physiotherapy');
        expect(teamIdFrom('  KKH  ', 'Sport & Exercise Medicine')).toBe('kkh-sport-exercise-medicine');
    });

    it('separates the same department at two institutions', () => {
        expect(teamIdFrom('KKH', 'Respiratory Therapy'))
            .not.toBe(teamIdFrom('SGH', 'Respiratory Therapy'));
    });

    /**
     * Returns null rather than throwing — unlike every other guard here — because
     * this one IS a user-input path. A lead typing nothing should see a form error,
     * not a crash.
     */
    it('returns null for input that cannot make a valid id', () => {
        expect(teamIdFrom('', '')).toBeNull();
        expect(teamIdFrom('!!', '???')).toBeNull();
        expect(teamIdFrom(null, undefined)).toBeNull();
    });
});

describe('teamPaths — the legacy paths, kept for the migration only', () => {
    /**
     * The migration COPIES from these and never moves, so the previous bundle can
     * still read its own data and rollback stays possible. They are named here so
     * that a stray import is visible in a grep rather than hidden in a string.
     */
    it('still composes the pre-migration paths exactly', () => {
        expect(LEGACY.roster(2026)).toEqual(['system_data', 'roster_2026']);
        expect(LEGACY.dailyPulse()).toEqual(['system_data', 'daily_pulse']);
        expect(LEGACY.swaps()).toEqual(['shift_swaps']);
        expect(LEGACY.wellbeing('fadzlynn')).toEqual(['wellbeing_history', 'fadzlynn']);
        expect(LEGACY.archive(2025)).toEqual(['archive_2025']);
        expect(LEGACY.feedPosts()).toEqual(['feed_posts']);
    });

    /**
     * The legacy wellbeing path takes a DIRECTORY ID, not a uid, and deliberately
     * does not assert — it has to reproduce the old shape faithfully or the
     * migration cannot read what is there.
     */
    it('does not apply the uid guard to legacy ids, which were never uids', () => {
        expect(() => LEGACY.wellbeing('fadzlynn')).not.toThrow();
        expect(() => LEGACY.staffLoads('ying_xian')).not.toThrow();
    });
});

describe('teamPaths — the collection name tables', () => {
    it('exposes names as data so a typo is a test failure, not a silent miss', () => {
        expect(TEAM_COLLECTIONS.rosters).toBe('rosters');
        expect(TEAM_COLLECTIONS.wellbeing).toBe('wellbeing');
        expect(ROOT_COLLECTIONS.teams).toBe('teams');
        expect(ROOT_COLLECTIONS.leadRequests).toBe('lead_requests');
        expect(Object.isFrozen(TEAM_COLLECTIONS)).toBe(true);
        expect(Object.isFrozen(ROOT_COLLECTIONS)).toBe(true);
    });

    it('has no collection name appearing in both tables', () => {
        const overlap = Object.values(TEAM_COLLECTIONS)
            .filter((name) => Object.values(ROOT_COLLECTIONS).includes(name));
        expect(overlap).toEqual([]);
    });
});
