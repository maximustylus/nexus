/**
 * ==============================================================================
 * RECONCILIATION — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * This is the line a clinician reads to decide whether to run an irreversible
 * migration against a working hospital's live data. Every case below is a way it
 * could read as "fine" when it is not.
 */

import { describe, it, expect } from 'vitest';
import reconcileModule from './reconcile.cjs';
import manifest from './team-one-manifest.cjs';

const { reconcile } = reconcileModule;
const { MEMBERS, EXCLUDED, LEGACY_DIRECTORY_SIZE } = manifest;

const real = (resolvedCount) => reconcile({
    resolvedCount,
    memberCount:   MEMBERS.length,
    excludedCount: EXCLUDED.length,
    legacySize:    LEGACY_DIRECTORY_SIZE,
});

const text = (result) => result.lines.join('\n');

describe('the happy case', () => {
    it('is ok, and says so in one line without qualification', () => {
        const r = real(MEMBERS.length);
        expect(r.ok).toBe(true);
        expect(r.shortfall).toBe(0);
        expect(r.lines).toHaveLength(1);
        expect(text(r)).toContain(`${MEMBERS.length} of ${MEMBERS.length} members resolved`);
    });

    /**
     * The manifest check PASSES SILENTLY. A check that prints when it succeeds is
     * a check that gets skimmed, and this line is read exactly once, under time
     * pressure, before an irreversible step.
     */
    it('says nothing about the manifest when the manifest is consistent', () => {
        expect(text(real(MEMBERS.length))).not.toMatch(/MANIFEST/i);
    });
});

describe('⚠️ THE BUG THIS MODULE EXISTS FOR', () => {
    /**
     * The old line printed, as one sentence, on a run where NOTHING resolved:
     *
     *     0 of 7 members resolved · 3 excluded by decision · 10 of 10 accounted for
     *
     * "10 of 10 accounted for" is three manifest constants. It cannot fail because
     * a clinician has no account — but it is the most reassuring clause in the
     * line, and it sat beside the one that had.
     */
    it('never claims anything is "accounted for" when nothing resolved', () => {
        const r = real(0);
        expect(r.ok).toBe(false);
        expect(text(r)).not.toMatch(/accounted for/i);
        expect(text(r)).toMatch(/NOTHING RESOLVED/);
    });

    it('does not report a manifest total that could be mistaken for a live count', () => {
        // The only "N of N" in the output must be the live one. A second N-of-N
        // built from constants is what made the old line misread.
        const pairs = [...text(real(0)).matchAll(/(\d+) of (\d+)/g)];
        expect(pairs).toHaveLength(1);
        expect(pairs[0][1]).toBe('0');
        expect(pairs[0][2]).toBe(String(MEMBERS.length));
    });
});

describe('a partial resolve — the case most likely to happen on the day', () => {
    /**
     * ⚠️ RELEASE-v2.0.0.md warns that Benny's address carries a trailing dot in its
     *    local part, which is not a valid RFC 5321 address, so Firebase Auth may
     *    never have created it. One missing person out of seven is the realistic
     *    failure, and it must not read as success.
     */
    it('is NOT ok, and names the consequence rather than only the number', () => {
        const r = real(MEMBERS.length - 1);
        expect(r.ok).toBe(false);
        expect(r.shortfall).toBe(1);
        expect(text(r)).toMatch(/ONLY 6 of 7/);
        expect(text(r)).toMatch(/wellbeing history will NOT be copied/);
    });

    it('gets the grammar right for one person and for several', () => {
        expect(text(real(MEMBERS.length - 1))).toContain('1 person has');
        expect(text(real(MEMBERS.length - 3))).toContain('3 people have');
    });

    it('leads with the failure, so it survives being skimmed', () => {
        expect(real(3).lines[0]).toMatch(/^❌/);
    });
});

describe('the manifest self-consistency check', () => {
    /**
     * This is the thing the old third clause was actually for, and it is worth
     * keeping: if somebody adds a colleague to MEMBERS without removing them from
     * EXCLUDED — or drops one from both — a person silently belongs to neither
     * list, and no other check in the migration would notice.
     */
    it('fires when the two lists no longer cover the old directory', () => {
        const r = reconcile({ resolvedCount: 7, memberCount: 7, excludedCount: 3, legacySize: 11 });
        expect(r.manifestOk).toBe(false);
        expect(r.ok).toBe(false);
        expect(text(r)).toMatch(/MANIFEST INCONSISTENT/);
    });

    it('is reported separately from the live count, never as one sentence', () => {
        const r = reconcile({ resolvedCount: 7, memberCount: 7, excludedCount: 3, legacySize: 11 });
        const live = r.lines.filter((l) => /members resolved/.test(l));
        const mani = r.lines.filter((l) => /MANIFEST/.test(l));
        expect(live).toHaveLength(1);
        expect(mani).toHaveLength(1);
        expect(live[0]).not.toBe(mani[0]);
    });

    /**
     * THE REAL MANIFEST. If this fails, the file has drifted and the migration
     * would migrate a set of people nobody has re-checked.
     */
    it('holds for the manifest as it stands today', () => {
        expect(MEMBERS.length + EXCLUDED.length).toBe(LEGACY_DIRECTORY_SIZE);
        expect(real(MEMBERS.length).manifestOk).toBe(true);
    });
});

describe('`ok` is the flag a caller would gate on', () => {
    it('is false if either the live count or the manifest is wrong', () => {
        expect(reconcile({ resolvedCount: 7, memberCount: 7, excludedCount: 3, legacySize: 10 }).ok).toBe(true);
        expect(reconcile({ resolvedCount: 6, memberCount: 7, excludedCount: 3, legacySize: 10 }).ok).toBe(false);
        expect(reconcile({ resolvedCount: 7, memberCount: 7, excludedCount: 3, legacySize: 11 }).ok).toBe(false);
    });
});
