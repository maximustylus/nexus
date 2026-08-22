/**
 * ==============================================================================
 * LEGACY MATCHING — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * This decides whose wellbeing history goes where. Every case below is a way the
 * migration could file one clinician's clinical record under another's name, or
 * drop one entirely — none of which produces an error at the time, and all of which
 * are discovered weeks later by a person looking for their own data.
 */

import { describe, it, expect } from 'vitest';
import legacyMatch from './legacyMatch.cjs';
import manifest from './team-one-manifest.cjs';

const { normalise, buildLegacyIndex, classifyLegacyDoc } = legacyMatch;
const { MEMBERS, EXCLUDED } = manifest;

const withUids = MEMBERS.map((m) => ({ ...m, uid: `uid-${m.legacyId}` }));

describe('normalise — collapsing three slug conventions onto one key', () => {
    /**
     * The app built the same person's document id three different ways, so one
     * clinician can own documents under all of these. If they do not collapse, her
     * loads are found and her wellbeing history is not.
     */
    it('maps every slug the app ever produced for one person to the same key', () => {
        const keys = ['ying_xian', 'yingxian', 'ying-xian', 'Ying Xian', 'YING XIAN', 'ying xian']
            .map(normalise);
        expect(new Set(keys).size).toBe(1);
        expect(keys[0]).toBe('yingxian');
    });

    it('is stable for junk rather than throwing', () => {
        expect(normalise(null)).toBe('');
        expect(normalise(undefined)).toBe('');
        expect(normalise('___')).toBe('');
        expect(normalise(42)).toBe('42');
    });
});

describe('buildLegacyIndex', () => {
    it('finds a member by their legacy id AND by their display name', () => {
        const index = buildLegacyIndex(withUids);
        expect(index.get('yingxian').displayName).toBe('Ying Xian');
        expect(index.get('brandon').displayName).toBe('Brandon');
    });

    /**
     * ⚠️ THE COLLISION MUST STOP THE MIGRATION, NOT BE RESOLVED BY IT. If two people
     *    normalise to the same key, every legacy document under it is genuinely
     *    ambiguous. Preferring the first would file one clinician's record under a
     *    colleague with no signal at all — the exact failure the uid rebuild exists
     *    to end, reintroduced by the script that is supposed to end it.
     */
    it('THROWS on two members who normalise to the same key', () => {
        const clash = [
            { legacyId: 'sarah_t', displayName: 'Sarah T', uid: 'uid-1' },
            { legacyId: 'sarah-t', displayName: 'Sarah-T', uid: 'uid-2' },
        ];
        expect(() => buildLegacyIndex(clash)).toThrow(/Ambiguous legacy key/);
        expect(() => buildLegacyIndex(clash)).toThrow(/Refusing to guess/);
    });

    it('does not throw when one member claims the same key twice', () => {
        // `legacyId: 'brandon'` and `displayName: 'Brandon'` normalise identically.
        // That is one person claiming their own key, not a collision.
        expect(() => buildLegacyIndex([{ legacyId: 'brandon', displayName: 'Brandon', uid: 'u' }]))
            .not.toThrow();
    });

    it('ignores empty keys rather than indexing them', () => {
        const index = buildLegacyIndex([{ legacyId: '', displayName: '', uid: 'u' }]);
        expect(index.get('')).toBeUndefined();
    });
});

describe('classifyLegacyDoc — three outcomes, all of which must be handled', () => {
    const index = buildLegacyIndex(withUids);

    it('places a document belonging to a member', () => {
        expect(classifyLegacyDoc('brandon', index, EXCLUDED))
            .toEqual({ kind: 'member', member: expect.objectContaining({ displayName: 'Brandon' }) });
        // The other two slug forms land on the same person.
        expect(classifyLegacyDoc('ying_xian', index, EXCLUDED).member.displayName).toBe('Ying Xian');
        expect(classifyLegacyDoc('yingxian', index, EXCLUDED).member.displayName).toBe('Ying Xian');
    });

    /**
     * ⚠️ EXCLUDED IS NOT AN ERROR, and separating it from `unknown` is the whole
     *    reason this returns a kind. Evelyn, Ashik and Mini were deliberately left
     *    out of team #1; their documents SHOULD not be copied. Reporting that as a
     *    failure would train a reader to ignore the warnings, and the warnings are
     *    where a genuinely lost record would appear.
     */
    it('separates a deliberately excluded person from an unrecognised one', () => {
        expect(classifyLegacyDoc('evelyn', index, EXCLUDED).kind).toBe('excluded');
        expect(classifyLegacyDoc('mini', index, EXCLUDED).kind).toBe('excluded');
        expect(classifyLegacyDoc('ashik', index, EXCLUDED).kind).toBe('excluded');
        expect(classifyLegacyDoc('evelyn', index, EXCLUDED).person.displayName).toBe('Evelyn');
    });

    /**
     * A former colleague, or an id slugged in a way nobody anticipated. It must be
     * PRINTED rather than dropped: a migration that silently skips a document is
     * indistinguishable from one that worked.
     */
    it('reports an id matching nobody rather than guessing', () => {
        expect(classifyLegacyDoc('someone_who_left', index, EXCLUDED)).toEqual({ kind: 'unknown' });
        expect(classifyLegacyDoc('', index, EXCLUDED)).toEqual({ kind: 'unknown' });
        expect(classifyLegacyDoc('_anonymous_logs', index, EXCLUDED)).toEqual({ kind: 'unknown' });
    });

    it('works with no exclusion list at all', () => {
        expect(classifyLegacyDoc('evelyn', index, undefined)).toEqual({ kind: 'unknown' });
    });
});

describe('the real manifest', () => {
    /**
     * THE PROPERTY THAT MAKES THE MIGRATION SAFE TO RUN AT ALL: nobody in team #1
     * collides with anybody else, so no legacy document is ambiguous. If a future
     * member is added whose name normalises onto an existing one, this fails here
     * rather than during a production write.
     */
    it('has no two members who normalise to the same key', () => {
        expect(() => buildLegacyIndex(withUids)).not.toThrow();
    });

    it('places every member in team #1 by their own legacy id', () => {
        const index = buildLegacyIndex(withUids);
        MEMBERS.forEach((member) => {
            expect(classifyLegacyDoc(member.legacyId, index, EXCLUDED).kind).toBe('member');
        });
    });

    it('recognises all three excluded people, so their records are skipped knowingly', () => {
        const index = buildLegacyIndex(withUids);
        EXCLUDED.forEach((person) => {
            expect(classifyLegacyDoc(person.legacyId, index, EXCLUDED).kind).toBe('excluded');
        });
    });
});

describe('the unresolved kind — in the team, but not registered yet', () => {
    /**
     * ⚠️ THE BUG THIS WAS ADDED FOR. `buildLegacyIndex` is built from RESOLVED
     *    members, so somebody in the manifest who has no Firebase Auth account is
     *    absent from it. Their documents used to fall through to `unknown` and
     *    print "matches nobody in the manifest — check whether this is a former
     *    colleague or a mis-slugged id" about a current colleague with a year of
     *    clinical records. The owner's first real dry run printed that six times,
     *    for two people who are in his team.
     */
    const resolvedOnly = withUids.filter((m) => m.legacyId !== 'brandon');
    const waiting = [MEMBERS.find((m) => m.legacyId === 'brandon')];
    const index = buildLegacyIndex(resolvedOnly);

    it('separates a member awaiting registration from an unrecognised id', () => {
        const verdict = classifyLegacyDoc('brandon', index, EXCLUDED, waiting);
        expect(verdict.kind).toBe('unresolved');
        expect(verdict.member.displayName).toBe('Brandon');
    });

    it('still reports a genuinely unknown id as unknown', () => {
        expect(classifyLegacyDoc('someone_who_left', index, EXCLUDED, waiting))
            .toEqual({ kind: 'unknown' });
    });

    it('matches on the display name as well as the legacy id', () => {
        expect(classifyLegacyDoc('Brandon', index, EXCLUDED, waiting).kind).toBe('unresolved');
    });

    /**
     * ORDER MATTERS: excluded is checked before unresolved. Somebody deliberately
     * left out of the team must never be reported as merely awaiting a
     * registration, which would read as an invitation to chase them.
     */
    it('prefers "excluded" over "unresolved" when a person is in both lists', () => {
        const evelyn = EXCLUDED.find((p) => p.legacyId === 'evelyn');
        expect(classifyLegacyDoc('evelyn', index, EXCLUDED, [evelyn]).kind).toBe('excluded');
    });

    it('is unchanged when no unresolved list is passed at all', () => {
        expect(classifyLegacyDoc('brandon', index, EXCLUDED)).toEqual({ kind: 'unknown' });
        expect(classifyLegacyDoc('brandon', index, EXCLUDED, [])).toEqual({ kind: 'unknown' });
    });
});
