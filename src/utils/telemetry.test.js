/**
 * ==============================================================================
 * COMMUNITY TELEMETRY — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * ⚠️ THE LOAD-BEARING TEST IN THIS FILE IS "a write that never settles". Everything
 *    else here is hygiene.
 *
 * ── THE BUG (`CP24`) ─────────────────────────────────────────────────────────
 *
 * `recordTelemetry` had a `try`/`catch`, and its header promised that a member of
 * the public "must still reach their result if the write fails". Both pathways
 * AWAITED it before navigating.
 *
 * A `catch` protects against a REJECTION. Firestore's `addDoc` does not reject when
 * the backend is unreachable — it queues the write locally and retries, and the
 * promise never settles. So the promised protection did not exist, and the failure
 * mode was not an error message: it was a person who answered fifteen questions
 * about their health and then watched "Generating your personalised plan now…"
 * for as long as they were willing to wait. Measured at 45 seconds and counting.
 *
 * No test could have caught it, because every existing test resolved its mock.
 * A hang is not an error, and it has to be tested for on purpose.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const addDoc = vi.fn();
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
    collection: (...args) => ({ __collection: args[1] }),
    addDoc: (...args) => addDoc(...args),
    serverTimestamp: () => ({ __serverTimestamp: true }),
}));

const { recordTelemetry, WRITE_DEADLINE_MS } = await import('./telemetry');

beforeEach(() => {
    addDoc.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('⚠️ the visitor always reaches their result', () => {
    /**
     * THE REGRESSION TEST. A promise that never settles, which is exactly what an
     * unreachable Firestore produces. Before the fix this test would hang until
     * Vitest's own timeout killed it.
     */
    it('resolves at the deadline when the write never settles', async () => {
        vi.useFakeTimers();
        addDoc.mockReturnValue(new Promise(() => {}));   // never resolves, never rejects

        const pending = recordTelemetry('730000', { score: 3 });
        let settled = false;
        pending.then(() => { settled = true; });

        await vi.advanceTimersByTimeAsync(WRITE_DEADLINE_MS - 1);
        expect(settled, 'it must not give up before the deadline').toBe(false);

        await vi.advanceTimersByTimeAsync(2);
        await expect(pending).resolves.toBe(false);
    });

    it('does not wait the full deadline when the write is fast', async () => {
        addDoc.mockResolvedValue({ id: 'doc-1' });
        await expect(recordTelemetry('730000', { score: 3 })).resolves.toBe(true);
    });

    it('resolves false when the write is refused, rather than throwing', async () => {
        addDoc.mockRejectedValue(new Error('PERMISSION_DENIED'));
        await expect(recordTelemetry('730000', { score: 3 })).resolves.toBe(false);
    });

    /**
     * After the deadline nobody is awaiting the original promise. If its rejection
     * were left unhandled it would surface in the console of a member of the public
     * as though something had broken on their device.
     */
    it('leaves no unhandled rejection when a timed-out write later fails', async () => {
        vi.useFakeTimers();
        let reject;
        addDoc.mockReturnValue(new Promise((_, r) => { reject = r; }));

        const pending = recordTelemetry('730000', { score: 3 });
        await vi.advanceTimersByTimeAsync(WRITE_DEADLINE_MS + 1);
        await expect(pending).resolves.toBe(false);

        const unhandled = vi.fn();
        process.on('unhandledRejection', unhandled);
        reject(new Error('too late'));
        await vi.advanceTimersByTimeAsync(10);
        await Promise.resolve();
        process.off('unhandledRejection', unhandled);
        expect(unhandled).not.toHaveBeenCalled();
    });

    it('never throws, whatever the caller passes', async () => {
        addDoc.mockResolvedValue({ id: 'doc-1' });
        for (const args of [[null, null], [undefined, undefined], ['', {}], [{}, []], [[], 'x']]) {
            await expect(recordTelemetry(...args)).resolves.toBeTypeOf('boolean');
        }
    });
});

describe('what is written', () => {
    it('records an unusable sector as the unknown sentinel, never as a place', async () => {
        addDoc.mockResolvedValue({ id: 'doc-1' });
        await recordTelemetry('North (e.g. 73, 75)', { score: 3 });
        expect(addDoc.mock.calls[0][1].postalSector).toBe('--');
    });

    it('normalises a real postal code to its sector', async () => {
        addDoc.mockResolvedValue({ id: 'doc-1' });
        await recordTelemetry('S730123', { score: 3 });
        expect(addDoc.mock.calls[0][1].postalSector).toBe('73');
    });

    it('stamps the server timestamp rather than the device clock', async () => {
        addDoc.mockResolvedValue({ id: 'doc-1' });
        await recordTelemetry('730000', { score: 3 });
        expect(addDoc.mock.calls[0][1].createdAt).toEqual({ __serverTimestamp: true });
    });

    /** A fingerprinting vector removed by `CP3`; it must not come back. */
    it('attaches no user agent', async () => {
        addDoc.mockResolvedValue({ id: 'doc-1' });
        await recordTelemetry('730000', { score: 3 });
        expect(JSON.stringify(addDoc.mock.calls[0][1])).not.toMatch(/clientReference|userAgent/i);
    });
});
