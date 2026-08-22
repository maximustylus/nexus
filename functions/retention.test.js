/**
 * ==============================================================================
 * RETENTION — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * The portal tells every visitor, before they answer anything, that records are
 * deleted after 24 months. These tests are the difference between that being true
 * and it being a sentence.
 */

import { describe, it, expect } from 'vitest';
import retention from './retention.cjs';

const {
    RETENTION_MONTHS, DELETE_BATCH_SIZE,
    expiryCutoff, classifyRecord, intoBatches, planSweep,
} = retention;

const NOW = new Date('2026-08-22T12:00:00Z');
const at = (iso) => ({ createdAt: new Date(iso) });
/** A Firestore Timestamp, which is what a real document actually carries. */
const stamp = (iso) => ({ createdAt: { toDate: () => new Date(iso) } });

describe('the period is the one the notice states', () => {
    it('is 24 months', () => {
        expect(RETENTION_MONTHS).toBe(24);
    });

    it('puts the cutoff exactly 24 months back', () => {
        expect(expiryCutoff(NOW).toISOString()).toBe('2024-08-22T12:00:00.000Z');
    });

    /**
     * Month arithmetic is where this kind of code goes wrong. Going back 24 months
     * from the 31st lands in a month that has no 31st, and JavaScript rolls over.
     * Asserted so the behaviour is known rather than discovered.
     */
    it('handles a month-end date without silently skipping a month', () => {
        const cutoff = expiryCutoff(new Date('2026-03-31T00:00:00Z'));
        expect(cutoff.getUTCFullYear()).toBe(2024);
        // 2024-03-31 exists, so no rollover here.
        expect(cutoff.toISOString()).toBe('2024-03-31T00:00:00.000Z');
    });

    it('handles a leap day', () => {
        expect(expiryCutoff(new Date('2028-02-29T00:00:00Z')).getUTCFullYear()).toBe(2026);
    });
});

describe('classifyRecord', () => {
    const cutoff = expiryCutoff(NOW);

    it('expires a record older than the cutoff', () => {
        expect(classifyRecord(at('2023-01-01T00:00:00Z'), cutoff))
            .toEqual({ expired: true, reason: 'older-than-cutoff' });
    });

    it('keeps a record inside the window', () => {
        expect(classifyRecord(at('2026-01-01T00:00:00Z'), cutoff))
            .toEqual({ expired: false, reason: 'within-retention' });
    });

    /**
     * The boundary is kept, not deleted. A record created exactly 24 months ago has
     * not yet been held for MORE than 24 months, and the next night's run takes it.
     */
    it('keeps a record sitting exactly on the cutoff', () => {
        expect(classifyRecord(at('2024-08-22T12:00:00Z'), cutoff).expired).toBe(false);
    });

    it('reads a real Firestore Timestamp, not just a Date', () => {
        expect(classifyRecord(stamp('2023-01-01T00:00:00Z'), cutoff).expired).toBe(true);
        expect(classifyRecord(stamp('2026-01-01T00:00:00Z'), cutoff).expired).toBe(false);
    });

    it('reads a numeric epoch', () => {
        expect(classifyRecord({ createdAt: Date.parse('2023-01-01T00:00:00Z') }, cutoff).expired).toBe(true);
    });

    /**
     * ⚠️ THE MOST IMPORTANT CASE IN THIS FILE. Treating a missing timestamp as
     *    "old" would delete exactly the records whose age is unknown — the set most
     *    likely to be a write bug rather than genuinely old data. Erring toward
     *    keeping is recoverable. Erring toward deleting is not.
     */
    it.each([
        ['no createdAt at all', {}],
        ['null', { createdAt: null }],
        ['undefined', { createdAt: undefined }],
        ['a string', { createdAt: 'yesterday' }],
        ['an unparseable date', { createdAt: new Date('not a date') }],
        ['a serverTimestamp sentinel that never resolved', { createdAt: { _methodName: 'serverTimestamp' } }],
    ])('NEVER deletes a record with %s — it reports it', (_label, record) => {
        expect(classifyRecord(record, cutoff)).toEqual({ expired: false, reason: 'no-timestamp' });
    });

    it('does not throw on junk', () => {
        [null, undefined, 'string', 42].forEach((junk) => {
            expect(() => classifyRecord(junk, cutoff)).not.toThrow();
            expect(classifyRecord(junk, cutoff).expired).toBe(false);
        });
    });
});

describe('planSweep', () => {
    it('separates what goes, what stays and what could not be dated', () => {
        const plan = planSweep([
            { id: 'old-1',   data: at('2020-01-01T00:00:00Z') },
            { id: 'old-2',   data: stamp('2024-01-01T00:00:00Z') },
            { id: 'edge',    data: at('2024-08-22T12:00:00Z') },
            { id: 'recent',  data: at('2026-08-01T00:00:00Z') },
            { id: 'undated', data: {} },
        ], NOW);

        expect(plan.toDelete).toEqual(['old-1', 'old-2']);
        expect(plan.kept).toBe(2);
        expect(plan.undated).toEqual(['undated']);
        expect(plan.cutoff.toISOString()).toBe('2024-08-22T12:00:00.000Z');
    });

    it('handles an empty or missing collection without throwing', () => {
        expect(planSweep([], NOW).toDelete).toEqual([]);
        expect(planSweep(undefined, NOW).toDelete).toEqual([]);
    });

    it('deletes nothing when everything is inside the window', () => {
        const plan = planSweep([{ id: 'a', data: at('2026-08-01T00:00:00Z') }], NOW);
        expect(plan.toDelete).toEqual([]);
        expect(plan.kept).toBe(1);
    });

    /**
     * The period is a parameter so it can be tested, but the DEFAULT is what runs
     * in production. A test that always passes an override would never catch the
     * constant drifting away from the notice.
     */
    it('uses RETENTION_MONTHS when no period is given', () => {
        const justOver = new Date(NOW.getTime());
        justOver.setUTCMonth(justOver.getUTCMonth() - RETENTION_MONTHS - 1);
        expect(planSweep([{ id: 'x', data: at(justOver.toISOString()) }], NOW).toDelete).toEqual(['x']);
    });
});

describe('intoBatches — Firestore will not commit an unbounded batch', () => {
    it('splits at the batch size', () => {
        const ids = Array.from({ length: 1000 }, (_, i) => `id-${i}`);
        const batches = intoBatches(ids);
        expect(batches.every((b) => b.length <= DELETE_BATCH_SIZE)).toBe(true);
        expect(batches.flat()).toEqual(ids);
    });

    it('stays under Firestore\'s 500-write commit limit', () => {
        expect(DELETE_BATCH_SIZE).toBeLessThanOrEqual(500);
    });

    it('returns nothing for an empty list rather than one empty batch', () => {
        expect(intoBatches([])).toEqual([]);
    });

    it('does not lose the tail when the count is not a multiple of the size', () => {
        const ids = Array.from({ length: DELETE_BATCH_SIZE + 1 }, (_, i) => String(i));
        expect(intoBatches(ids).flat()).toHaveLength(ids.length);
    });
});

describe('the notice and the code agree', () => {
    /**
     * ⚠️ THE PROMISE AND THE MECHANISM MUST NOT DRIFT. Both public notices state
     *    "24 months". If somebody changes the constant without changing the text,
     *    the portal starts telling people something untrue — which is the exact
     *    shape of the de-identification defect this project already shipped once.
     */
    it('states the same period the public notices state', async () => {
        const { readFileSync } = await import('node:fs');
        const { fileURLToPath } = await import('node:url');
        const { dirname, resolve } = await import('node:path');
        const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

        ['src/components/ResultPage.jsx', 'src/components/PathwaySelection.jsx'].forEach((file) => {
            const text = readFileSync(resolve(root, file), 'utf8');
            expect(text, `${file} must state the retention period`)
                .toContain(`${RETENTION_MONTHS} months`);
        });
    });
});
