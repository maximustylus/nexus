/**
 * ==============================================================================
 * COVERAGE REQUESTS — the pure half of the roster's inbox
 * ==============================================================================
 * Runner: Vitest
 * Run:    npx vitest run src/utils/rosterCoverage.test.js
 *
 * `rosterCoverage.js` is what turns a `shift_swaps` query snapshot into the card
 * the recipient answers. It holds NO mutation logic — that stays in `auraEngine`'s
 * `planSwapApplication` / `findAppliedSwapShift`, which are locked and separately
 * tested — so what is pinned here is the reading, the matching and the wording.
 *
 * The claims that matter, in the order the file makes them:
 *
 *   1. NOTHING IS DROPPED. A malformed request, a request with no ledger id, a
 *      request from before `swapRole` existed — all of them still appear, because
 *      a coverage request that silently disappears is a shift nobody covers and
 *      nobody is told about (audit M5).
 *   2. Identity fields are read VERBATIM. `planSwapApplication` compares them with
 *      `===` against the roster, so a helpful trim here would be a normalisation
 *      the mutator does not perform.
 *   3. A duplicate delivery of one document produces ONE request, never two
 *      Accept buttons for one shift.
 *   4. A request answered in this session is removed; a request whose acceptance
 *      FAILED is not.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
    readCoverageRequests,
    pendingCoverageRequests,
    coverageRequestsForShift,
    canAnswerCoverageRequest,
    describeCoverageRequest,
    describeCoverageArranger,
} from './rosterCoverage.js';

/** A Firestore query-snapshot document, as the SDK shapes it. */
const snapDoc = (id, data) => ({ id, data: () => data });

/** A query snapshot with the given documents. */
const snap = (...docs) => ({ docs });

const REQUEST = {
    requestedBy: 'Brandon',
    targetStaff: 'Derlinder',
    originalShiftDate: '2026-09-07',
    originalTask: 'EFT',
    swapRole: 'lead',
    reason: 'Attending a conference',
    status: 'PENDING',
};

// ─── 1. readCoverageRequests ──────────────────────────────────────────────────

describe('readCoverageRequests', () => {
    it('reads the ledger fields a coverage card needs, with the document id', () => {
        const [request] = readCoverageRequests(snap(snapDoc('swap-1', REQUEST)));

        expect(request).toMatchObject({
            docId: 'swap-1',
            requestedBy: 'Brandon',
            targetStaff: 'Derlinder',
            originalShiftDate: '2026-09-07',
            originalTask: 'EFT',
            swapRole: 'lead',
            reason: 'Attending a conference',
        });
        expect(request.initiatedBy).toBeNull();
        // The raw document travels along, so nothing downstream has to re-read the
        // snapshot and no unknown field is lost on the way.
        expect(request.raw.status).toBe('PENDING');
    });

    it('keeps an admin-brokered request\'s initiatedBy', () => {
        const [request] = readCoverageRequests(
            snap(snapDoc('swap-1', { ...REQUEST, initiatedBy: 'Alif' })),
        );
        expect(request.initiatedBy).toBe('Alif');
    });

    it('reads identity fields VERBATIM — no trimming, because the mutator does not trim', () => {
        const [request] = readCoverageRequests(
            snap(snapDoc('swap-1', { ...REQUEST, originalTask: ' EFT ', requestedBy: 'Brandon ' })),
        );
        expect(request.originalTask).toBe(' EFT ');
        expect(request.requestedBy).toBe('Brandon ');
    });

    it('nulls a swapRole that is not one of the two real roles', () => {
        for (const swapRole of ['LEAD', 'principal', '', null, undefined, 3]) {
            const [request] = readCoverageRequests(snap(snapDoc('swap-1', { ...REQUEST, swapRole })));
            expect(request.swapRole).toBeNull();
        }
    });

    it('keeps a request whose fields are missing, rather than dropping it', () => {
        const requests = readCoverageRequests(snap(snapDoc('swap-1', {})));
        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({ docId: 'swap-1', requestedBy: null, originalTask: null });
    });

    it('keeps a document with no id, as unanswerable rather than invisible', () => {
        const requests = readCoverageRequests(snap(snapDoc(undefined, REQUEST)));
        expect(requests).toHaveLength(1);
        expect(requests[0].docId).toBeNull();
        expect(canAnswerCoverageRequest(requests[0]).ok).toBe(false);
    });

    it('collapses a duplicate delivery of one document', () => {
        const requests = readCoverageRequests(
            snap(snapDoc('swap-1', REQUEST), snapDoc('swap-1', REQUEST), snapDoc('swap-2', REQUEST)),
        );
        expect(requests.map((entry) => entry.docId)).toEqual(['swap-1', 'swap-2']);
    });

    it('tolerates a snapshot that is empty, malformed, or not a query snapshot at all', () => {
        // The last case is real: a document-shaped snapshot reaches this function in
        // any test (or future call site) that shares one listener mock.
        expect(readCoverageRequests(snap())).toEqual([]);
        expect(readCoverageRequests(undefined)).toEqual([]);
        expect(readCoverageRequests(null)).toEqual([]);
        expect(readCoverageRequests({})).toEqual([]);
        expect(readCoverageRequests({ exists: () => true, data: () => ({}) })).toEqual([]);
        expect(readCoverageRequests({ docs: [null, 7, 'x'] })).toEqual([]);
    });

    it('tolerates a document whose data() is missing or returns nothing', () => {
        const requests = readCoverageRequests(snap({ id: 'swap-1' }, snapDoc('swap-2', null)));
        expect(requests).toHaveLength(2);
        expect(requests[0].requestedBy).toBeNull();
        expect(requests[1].requestedBy).toBeNull();
    });
});

// ─── 2. pendingCoverageRequests ───────────────────────────────────────────────

describe('pendingCoverageRequests', () => {
    const requests = readCoverageRequests(
        snap(snapDoc('swap-1', REQUEST), snapDoc('swap-2', REQUEST)),
    );

    it('removes the requests answered in this session', () => {
        const left = pendingCoverageRequests(requests, new Set(['swap-1']));
        expect(left.map((entry) => entry.docId)).toEqual(['swap-2']);
    });

    it('removes nothing when nothing has been answered', () => {
        expect(pendingCoverageRequests(requests, new Set())).toHaveLength(2);
        expect(pendingCoverageRequests(requests, undefined)).toHaveLength(2);
        expect(pendingCoverageRequests(requests, {})).toHaveLength(2);
    });

    it('keeps a request that could not be answered — a failure is still pending', () => {
        // The distinction the whole surface rests on: only a COMPLETED answer goes
        // into the answered set, so a refusal leaves the request actionable.
        expect(pendingCoverageRequests(requests, new Set()).map((e) => e.docId)).toContain('swap-1');
    });

    it('tolerates a missing list', () => {
        expect(pendingCoverageRequests(undefined, new Set(['swap-1']))).toEqual([]);
    });
});

// ─── 3. coverageRequestsForShift — the calendar badge ─────────────────────────

describe('coverageRequestsForShift', () => {
    const requests = readCoverageRequests(
        snap(
            snapDoc('swap-1', REQUEST),
            snapDoc('swap-2', { ...REQUEST, originalTask: 'NC' }),
            snapDoc('swap-3', { ...REQUEST, originalShiftDate: '2026-09-08' }),
        ),
    );

    it('matches on the date and the task together', () => {
        const matched = coverageRequestsForShift(requests, '2026-09-07', { task: 'EFT' });
        expect(matched.map((entry) => entry.docId)).toEqual(['swap-1']);
    });

    it('matches nothing for a day or a task nobody asked about', () => {
        expect(coverageRequestsForShift(requests, '2026-09-09', { task: 'EFT' })).toEqual([]);
        expect(coverageRequestsForShift(requests, '2026-09-07', { task: 'VC (AM)' })).toEqual([]);
    });

    it('does not check whether the requester still holds the duty', () => {
        // The badge's claim is "somebody asked you to cover this shift". Whether the
        // roster still supports it is reported BY THE ACCEPT PATH, with the binding
        // constraint named — hiding the badge would hide the request instead.
        const matched = coverageRequestsForShift(requests, '2026-09-07', {
            task: 'EFT',
            lead: 'Somebody Else',
            coLead: 'Another Person',
        });
        expect(matched).toHaveLength(1);
    });

    it('needs both a date and a task to match anything', () => {
        expect(coverageRequestsForShift(requests, '2026-09-07', {})).toEqual([]);
        expect(coverageRequestsForShift(requests, '', { task: 'EFT' })).toEqual([]);
        expect(coverageRequestsForShift(requests, '2026-09-07', undefined)).toEqual([]);
        expect(coverageRequestsForShift(undefined, '2026-09-07', { task: 'EFT' })).toEqual([]);
    });
});

// ─── 4. canAnswerCoverageRequest ──────────────────────────────────────────────

describe('canAnswerCoverageRequest', () => {
    const read = (data, id = 'swap-1') => readCoverageRequests(snap(snapDoc(id, data)))[0];

    it('accepts a well-formed request', () => {
        expect(canAnswerCoverageRequest(read(REQUEST))).toEqual({ ok: true, reason: null });
    });

    it('accepts a pre-A3 request with no swapRole — the mutator matches it on identity', () => {
        const request = read({ ...REQUEST, swapRole: undefined });
        expect(request.swapRole).toBeNull();
        expect(canAnswerCoverageRequest(request).ok).toBe(true);
    });

    it('refuses a request with no ledger id, and names the collection to look in', () => {
        // `null` rather than `undefined`: a default parameter would swallow the
        // latter and this test would silently assert the well-formed case.
        const result = canAnswerCoverageRequest(read(REQUEST, null));
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/no ledger id/i);
        expect(result.reason).toMatch(/shift_swaps/);
    });

    it('refuses a request that does not identify a shift, and says which parts are missing', () => {
        for (const missing of ['requestedBy', 'originalShiftDate', 'originalTask']) {
            const result = canAnswerCoverageRequest(read({ ...REQUEST, [missing]: undefined }));
            expect(result.ok).toBe(false);
            expect(result.reason).toMatch(/missing the requester, the date or the duty/i);
        }
    });

    it('refuses nothing at all', () => {
        expect(canAnswerCoverageRequest(undefined).ok).toBe(false);
        expect(canAnswerCoverageRequest(null).ok).toBe(false);
    });
});

// ─── 5. The wording ───────────────────────────────────────────────────────────

describe('describeCoverageRequest', () => {
    const read = (data, id = 'swap-1') => readCoverageRequests(snap(snapDoc(id, data)))[0];

    it('names the asker, the duty, the task and the day in words', () => {
        expect(describeCoverageRequest(read(REQUEST))).toBe(
            'Brandon asks you to cover EFT on Mon 7 Sep 2026, as lead.',
        );
    });

    it('uses the same vocabulary as the request modal for a co-lead duty', () => {
        expect(describeCoverageRequest(read({ ...REQUEST, swapRole: 'coLead' }))).toMatch(/as co-lead\.$/);
    });

    it('never prints "unknown duty" as though it were a duty', () => {
        const text = describeCoverageRequest(read({ ...REQUEST, swapRole: undefined }));
        expect(text).not.toMatch(/unknown duty/i);
        expect(text).toMatch(/does not record which one/i);
        expect(text).toMatch(/read it off the roster/i);
    });

    it('explains itself rather than printing a half-sentence for a malformed request', () => {
        const text = describeCoverageRequest(read({ ...REQUEST, originalTask: undefined }));
        expect(text).toBe(canAnswerCoverageRequest(read({ ...REQUEST, originalTask: undefined })).reason);
        expect(text).not.toMatch(/undefined|null/);
    });

    it('formats the date locally-safely — the weekday of a date key is a calendar fact', () => {
        // `formatRosterDateKey` parses from parts, so this sentence does not shift
        // with the reader's timezone (post-mortem B2).
        expect(describeCoverageRequest(read({ ...REQUEST, originalShiftDate: '2026-01-01' }))).toMatch(
            /Thu 1 Jan 2026/,
        );
    });
});

describe('describeCoverageArranger', () => {
    it('names an admin who arranged cover on somebody else\'s behalf (M11)', () => {
        expect(describeCoverageArranger({ initiatedBy: 'Alif', requestedBy: 'Brandon' })).toBe(
            "Arranged by Alif on Brandon's behalf.",
        );
    });

    it('says nothing for a self-request — the absent field is the signal', () => {
        expect(describeCoverageArranger({ requestedBy: 'Brandon' })).toBeNull();
        expect(describeCoverageArranger({ initiatedBy: '', requestedBy: 'Brandon' })).toBeNull();
        expect(describeCoverageArranger({ initiatedBy: 'Brandon', requestedBy: 'Brandon' })).toBeNull();
        expect(describeCoverageArranger(undefined)).toBeNull();
    });
});
