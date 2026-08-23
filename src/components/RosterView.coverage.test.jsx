/**
 * ==============================================================================
 * ROSTER VIEW — ONE-TAP COVER, END TO END (component tests)
 * ==============================================================================
 * Runner: Vitest + @testing-library/react (jsdom)
 * Run:    npx vitest run src/components/RosterView.coverage.test.jsx
 *
 * A colleague asking you to cover a clinical shift used to arrive as a chat
 * message: `AuraPulseBot` force-opened the wellbeing assistant with a
 * `ROSTER_ALERT` bubble and the Accept button lived inside the conversation. That
 * surface has moved into the roster — a badge on the shift, an inline card, one
 * tap — and this file is the gate on the move having kept every guarantee v1.6.1
 * paid for. Nobody can log in and click through it before it ships; these
 * assertions are the verification.
 *
 * WHAT IS PINNED HERE:
 *
 *   1. A PENDING request aimed at the signed-in user renders IN THE ROSTER, with
 *      the asker, the duty, the day and the reason — and a badge in the calendar
 *      square the shift is in.
 *   2. ACCEPTING RUNS THE VERIFIED SEQUENCE, IN ORDER: read the roster →
 *      write ONE day → READ THE DOCUMENT BACK → find the substitution in it →
 *      and only THEN `status: 'APPROVED'`. The order is asserted off a call log,
 *      not inferred, and the success sentence quotes the read-back document.
 *   3. MECHANICAL SUBSTITUTION. The covering colleague takes exactly the role the
 *      requester held; the co-lead is untouched, the other shift that day is
 *      untouched, and a pre-6-May legacy shift is upgraded on write.
 *   4. A MUTATION THAT MATCHES NOTHING LEAVES THE REQUEST PENDING. Two separate
 *      failures are driven: the roster no longer supports the swap (no roster
 *      write at all), and the write does not land (no `APPROVED`). Both name the
 *      binding constraint on screen and leave the request answerable.
 *   5. DECLINING DOES NOT TOUCH THE ROSTER DOCUMENT.
 *   6. DEMO MODE WRITES NOTHING AND READS NOTHING — no listener, no `query`, no
 *      `collection`, no card.
 *   7. M8 SURVIVED THE MOVE: a `permission-denied` on the coverage listener is
 *      visible, and says the card is empty because it could not be loaded.
 *
 * `planSwapApplication` / `findAppliedSwapShift` are NOT re-tested here — they are
 * locked, and `auraEngine.swap.test.js` owns them. What is tested is that this
 * view calls them in the right order and reports only what came back.
 * ==============================================================================
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act, within } from '@testing-library/react';

// --- MOCKS (hoisted above the imports below by Vitest) ------------------------

const ctx = vi.hoisted(() => ({ isDemo: false }));

vi.mock('../firebase', () => ({
    db: { __mock: 'firestore-db' },
    auth: { __mock: 'auth' },
    storage: { __mock: 'storage' },
    messaging: { __mock: 'messaging' },
    requestForToken: vi.fn(),
}));

// Every Firestore entry point RosterView imports, each a spy with no behaviour of
// its own. The behaviour is installed in `beforeEach` below, so a test can change
// one leg of it (a write that does not land, a listener that fails) without a
// second mock factory.
vi.mock('firebase/firestore', () => ({
    doc: vi.fn(),
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    onSnapshot: vi.fn(),
    setDoc: vi.fn(),
    addDoc: vi.fn(),
    getDoc: vi.fn(),
    updateDoc: vi.fn(),
    serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

vi.mock('../context/NexusContext', () => ({
    useNexus: () => ({ isDemo: ctx.isDemo }),
    NexusProvider: ({ children }) => children,
}));

// ── TEAM SCOPE ────────────────────────────────────────────────────────────────
// Every live Firestore path in RosterView is composed from `teamId` now, and the
// swap listener routes by `targetUid` rather than by display name. Mocked here
// rather than wrapped in a real provider: these tests are about what the roster
// DOES, and `TeamContext.test.jsx` owns how a team is resolved.
const TEAM_ID = 'kkh-sport-exercise-medicine';
const TEAM_MEMBERS = [
    { uid: 'uid-brandon', displayName: 'Brandon' },
    { uid: 'uid-derlinder', displayName: 'Derlinder' },
    { uid: 'uid-fadzlynn', displayName: 'Fadzlynn' },
    { uid: 'uid-ying-xian', displayName: 'Ying Xian' },
];
// WHO HOLDS DUTIES, which is not the same question as `role` — a roster master
// configures the roster and is not in it. All four here are clinicians, matching the
// live staff pool.
//
// ⚠️ HOISTED, NOT COMPUTED INSIDE `useTeam`. RosterView's live effect depends on
//    `rosteredMembers`, so returning a fresh array from every call gives it a new
//    reference on every render — effect runs, setConfig, re-render, forever. The
//    real provider is safe because it builds this inside `useMemo`; a mock that
//    forgets to be stable HANGS the suite rather than failing it, which is a much
//    worse way to find out.
const TEAM_ROSTERED = TEAM_MEMBERS.filter((m) => m.rostered !== false);
const TEAM_UID_BY_NAME = Object.fromEntries(TEAM_MEMBERS.map((m) => [m.displayName, m.uid]));
vi.mock('../context/TeamContext', () => ({
    useTeam: () => ({
        teamId: TEAM_ID,
        members: TEAM_MEMBERS,
        rosteredMembers: TEAM_ROSTERED,
        memberUidByName: TEAM_UID_BY_NAME,
    }),
}));


import {
    doc,
    collection,
    query,
    where,
    onSnapshot,
    setDoc,
    addDoc,
    getDoc,
    updateDoc,
} from 'firebase/firestore';
import RosterView from './RosterView';

// --- FIXTURES ----------------------------------------------------------------

// The calendar opens on the CURRENT month (post-mortem B3), so the fixture has to
// live there or its shift buttons are never rendered.
const today = new Date();
const DATE_KEY = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-15`;
const OTHER_DATE_KEY = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-16`;

// Was `system_data/roster_2026` — one document for the whole installation. The
// year is now the document ID beneath the team rather than part of a global name.
const ROSTER_PATH = `teams/${TEAM_ID}/rosters/2026`;
const SWAPS_PATH = `teams/${TEAM_ID}/swaps`;

/** Brandon leads EFT with Ying Xian; a second shift that day belongs to nobody in this story. */
const MODERN_ROSTER = () => ({
    [DATE_KEY]: [
        {
            task: 'EFT',
            week: 1,
            lead: 'Brandon',
            coLead: 'Ying Xian',
            staff: 'Lead: Brandon, Co: Ying Xian',
            category: 'EFT',
        },
        {
            task: 'NC',
            week: 1,
            lead: 'Fadzlynn',
            coLead: 'Ying Xian',
            staff: 'Lead: Fadzlynn, Co: Ying Xian',
            category: 'CORE',
        },
    ],
});

/** Pre-6-May shape: `staff` IS the identity and there is no co-lead. */
const LEGACY_ROSTER = () => ({
    [DATE_KEY]: [
        { task: 'EFT', week: 1, staff: 'Brandon', category: 'EFT' },
    ],
});

const PENDING_REQUEST = {
    requestedBy: 'Brandon',
    targetStaff: 'Derlinder',
    // Written beside `targetStaff`, not instead of it: the listener routes on this,
    // the roster mutator still matches the day arrays on the NAME.
    targetUid: 'uid-derlinder',
    originalShiftDate: DATE_KEY,
    originalTask: 'EFT',
    swapRole: 'lead',
    reason: 'Attending a medical conference',
    status: 'PENDING',
    timestamp: 'mock-timestamp',
};

const DERLINDER = { uid: 'uid-derlinder', name: 'Derlinder', role: 'staff', email: 'derlinder@example.org' };

// --- MOCK STATE --------------------------------------------------------------

/** The live roster document, mutated by `updateDoc` exactly as Firestore would. */
let rosterDoc;
/** Whether that document exists at all. */
let rosterExists;
/** The PENDING swap documents the listener query returns. */
let swapDocs;
/** Set false to simulate a roster write that resolves without landing. */
let rosterWritesLand;
/** The registered listeners, so a test can deliver a later snapshot or an error. */
let rosterListener;
let coverageListener;
// The department's saved configuration (`R1`). Held so the routing above has
// somewhere to put it; this file is about coverage requests, so it stays absent.
let _settingsListener;
/** Every Firestore operation, in order: the read-back discipline is an ORDER claim. */
let callLog;

const clone = (value) => JSON.parse(JSON.stringify(value));

const querySnapshot = () => ({
    docs: swapDocs.map((entry) => ({ id: entry.id, data: () => clone(entry.data) })),
});

/** Push a fresh roster snapshot, the way Firestore does after a write lands. */
const deliverRoster = async () => {
    await act(async () => {
        rosterListener.onNext({ exists: () => rosterExists, data: () => clone(rosterDoc) });
    });
};

/** Push a fresh coverage snapshot (e.g. after an answer removes a request). */
const deliverCoverage = async () => {
    await act(async () => {
        coverageListener.onNext(querySnapshot());
    });
};

beforeEach(() => {
    vi.clearAllMocks();
    ctx.isDemo = false;
    rosterDoc = MODERN_ROSTER();
    rosterExists = true;
    swapDocs = [{ id: 'swap-1', data: { ...PENDING_REQUEST } }];
    rosterWritesLand = true;
    rosterListener = null;
    coverageListener = null;
    callLog = [];

    doc.mockImplementation((_db, ...segments) => ({ __mock: 'docRef', path: segments.join('/') }));
    // ALL the segments, joined. It used to take `(_db, name)` because every
    // collection in the app was at the root; a team-scoped path is four segments and
    // a one-segment mock silently records `teams` as the whole path.
    collection.mockImplementation((_db, ...segments) => ({ __mock: 'collectionRef', path: segments.join('/') }));
    query.mockImplementation((ref, ...constraints) => ({ __mock: 'query', ref, constraints }));
    where.mockImplementation((field, op, value) => ({ __mock: 'where', field, op, value }));

    /**
     * One listener mock, THREE subscriptions now: the roster document, the coverage
     * query, and the department's saved configuration (`R1`).
     *
     * ⚠️ ROUTED ON THE REF'S PATH, NOT ITS SHAPE, AND THE DIFFERENCE IS A REAL BUG
     *    THIS CAUGHT. It used to be `__mock === 'query' ? coverage : roster` — a
     *    shape test — which was written to survive the effects being reordered, and
     *    did. What it could not survive was a SECOND `doc()` listener: the settings
     *    subscription fell into the `else`, overwrote `rosterListener`, and every
     *    later `rosterListener.onNext(...)` in this file pushed a roster snapshot
     *    into the settings handler. The calendar simply never updated, and the
     *    failure read as "the covered shift is missing" rather than as "the test is
     *    talking to the wrong listener".
     *
     *    A path is what actually distinguishes these three, so a fourth listener
     *    added later lands in `other` and is ignored rather than impersonating one
     *    of them.
     */
    onSnapshot.mockImplementation((target, onNext, onError) => {
        const path = target && typeof target.path === 'string' ? target.path : '';
        if (target && target.__mock === 'query') {
            coverageListener = { onNext, onError };
            onNext(querySnapshot());
        } else if (path === ROSTER_PATH) {
            rosterListener = { onNext, onError };
            if (rosterExists) onNext({ exists: () => true, data: () => clone(rosterDoc) });
        } else if (path.endsWith('/settings/roster')) {
            _settingsListener = { onNext, onError };
            onNext({ exists: () => false, data: () => undefined });
        }
        return () => {};
    });

    getDoc.mockImplementation((ref) => {
        callLog.push(`getDoc:${ref.path}`);
        if (ref.path === ROSTER_PATH) {
            return Promise.resolve({
                exists: () => rosterExists,
                data: () => clone(rosterDoc),
            });
        }
        return Promise.resolve({ exists: () => false, data: () => undefined });
    });

    updateDoc.mockImplementation((ref, patch) => {
        callLog.push(`updateDoc:${ref.path}`);
        if (ref.path === ROSTER_PATH) {
            // A real `updateDoc` merges the given keys. `rosterWritesLand === false`
            // is the failure this whole read-back exists for: the call resolves and
            // the document does not change.
            if (rosterWritesLand) Object.assign(rosterDoc, clone(patch));
        }
        return Promise.resolve();
    });

    setDoc.mockImplementation(() => Promise.resolve());
    addDoc.mockImplementation(() => Promise.resolve({ id: 'mock' }));
});

afterEach(() => {
    cleanup();
});

// --- HELPERS -----------------------------------------------------------------

const coverageCard = () => document.querySelector('[data-roster-view="coverage-requests"]');

const requestCard = (docId = 'swap-1') =>
    document.querySelector(`[data-coverage-request="${docId}"]`);

const coverButton = (task = 'EFT', asker = 'Brandon') =>
    screen.getByRole('button', { name: new RegExp(`^Cover ${task} on .+ for ${asker}$`) });

const declineButton = (task = 'EFT', asker = 'Brandon') =>
    screen.getByRole('button', { name: new RegExp(`^Decline to cover ${task} on .+ for ${asker}$`) });

const daySquare = (dateKey) => document.querySelector(`[data-date="${dateKey}"]`);

/** The roster patch of the Nth `updateDoc` against the roster document. */
const rosterPatches = () =>
    updateDoc.mock.calls.filter(([ref]) => ref.path === ROSTER_PATH).map(([, patch]) => patch);

const swapPatches = () =>
    updateDoc.mock.calls
        .filter(([ref]) => ref.path.startsWith(`${SWAPS_PATH}/`))
        .map(([ref, patch]) => ({ path: ref.path, patch }));

// ─── 1. THE REQUEST IS IN THE ROSTER ──────────────────────────────────────────

describe('a pending coverage request renders in the roster', () => {
    it('subscribes with the same query the chat panel used, and shows the request', () => {
        render(<RosterView user={DERLINDER} />);

        // The listener query: PENDING requests aimed at the signed-in user.
        expect(collection).toHaveBeenCalledWith(expect.anything(), 'teams', TEAM_ID, 'swaps');
        expect(where).toHaveBeenCalledWith('targetUid', '==', 'uid-derlinder');
        expect(where).toHaveBeenCalledWith('status', '==', 'PENDING');

        const card = coverageCard();
        expect(card).not.toBeNull();
        expect(within(card).getByText(/cover asked of you \(1\)/i)).toBeTruthy();
        // Who is asking, which duty, which day — and the reason they gave.
        expect(within(card).getByText(/Brandon asks you to cover EFT on .+, as lead\./)).toBeTruthy();
        expect(within(card).getByText(/Attending a medical conference/)).toBeTruthy();
        // And what pressing the button will actually do.
        expect(within(card).getByText(/reads the document back/i)).toBeTruthy();
    });

    it('badges the calendar square the shift is in', () => {
        render(<RosterView user={DERLINDER} />);

        const square = daySquare(DATE_KEY);
        expect(within(square).getByText(/cover asked of you/i)).toBeTruthy();
        // Only that square, and only that shift: the NC shift the same day is not
        // badged, and neither is another day.
        const badges = square.querySelectorAll('[data-coverage-badge]');
        expect(badges.length).toBe(1);
        expect(document.querySelectorAll('[data-coverage-badge]').length).toBe(1);
        expect(daySquare(OTHER_DATE_KEY).querySelector('[data-coverage-badge]')).toBeNull();
    });

    it('renders nothing at all when nobody has asked', () => {
        swapDocs = [];
        render(<RosterView user={DERLINDER} />);
        expect(coverageCard()).toBeNull();
        expect(document.querySelectorAll('[data-coverage-badge]').length).toBe(0);
    });

    it('names the admin who arranged cover on somebody else\'s behalf (M11)', () => {
        swapDocs = [{ id: 'swap-1', data: { ...PENDING_REQUEST, initiatedBy: 'Alif' } }];
        render(<RosterView user={DERLINDER} />);
        expect(screen.getByText(/Arranged by Alif on Brandon's behalf\./)).toBeTruthy();
    });

    it('shows a request it cannot answer, with the reason, and offers no buttons', () => {
        // Nothing is ever dropped: a malformed ledger entry that vanished would be a
        // shift nobody covers and nobody is told about (M5).
        swapDocs = [{ id: 'swap-1', data: { ...PENDING_REQUEST, originalTask: undefined } }];
        render(<RosterView user={DERLINDER} />);

        const card = requestCard();
        expect(card).not.toBeNull();
        expect(within(card).getByText(/missing the requester, the date or the duty/i)).toBeTruthy();
        expect(within(card).queryAllByRole('button')).toEqual([]);
    });
});

// ─── 2. ACCEPTING — THE VERIFIED SEQUENCE ─────────────────────────────────────

describe('accepting runs the verified sequence and only then reports success', () => {
    it('reads, writes, READS BACK, finds the substitution, and approves last', async () => {
        render(<RosterView user={DERLINDER} />);

        fireEvent.click(coverButton());

        await waitFor(() => expect(swapPatches()).toHaveLength(1));

        // THE ORDER IS THE GUARANTEE (M9 + A-RC4): the ledger is flipped only after
        // the roster has been written AND read back.
        expect(callLog).toEqual([
            `getDoc:${ROSTER_PATH}`,
            `updateDoc:${ROSTER_PATH}`,
            `getDoc:${ROSTER_PATH}`,
            `updateDoc:${SWAPS_PATH}/swap-1`,
        ]);
        expect(swapPatches()[0].patch.status).toBe('APPROVED');
        expect(typeof swapPatches()[0].patch.approvedAt).toBe('string');
        // The ledger document shape is unchanged: status and approvedAt, nothing else.
        expect(Object.keys(swapPatches()[0].patch).sort()).toEqual(['approvedAt', 'status']);

        // The success sentence quotes the document that was read back.
        await waitFor(() =>
            expect(screen.getByText(/verified against the master roster/i)).toBeTruthy(),
        );
        expect(screen.getByText(/Lead: Derlinder, Co: Ying Xian/)).toBeTruthy();
        expect(screen.getByText(/in place of Brandon/)).toBeTruthy();
        // M4 is still unbuilt, and the copy still says so rather than claiming it.
        expect(screen.getByText(/cannot notify Brandon yet/i)).toBeTruthy();

        // The request is off the card without waiting for Firestore's snapshot.
        expect(coverageCard()).toBeNull();
        // Nothing on this path goes near the generate write.
        expect(setDoc).not.toHaveBeenCalled();
        expect(addDoc).not.toHaveBeenCalled();
    });

    it('substitutes mechanically: the requester\'s role only, nobody promoted, nobody else moved', async () => {
        render(<RosterView user={DERLINDER} />);
        fireEvent.click(coverButton());
        await waitFor(() => expect(rosterPatches()).toHaveLength(1));

        const patch = rosterPatches()[0];
        // One day is written, and it is the request's day.
        expect(Object.keys(patch)).toEqual([DATE_KEY]);
        expect(patch[DATE_KEY][0]).toEqual({
            task: 'EFT',
            week: 1,
            lead: 'Derlinder',
            coLead: 'Ying Xian',
            staff: 'Lead: Derlinder, Co: Ying Xian',
            category: 'EFT',
        });
        // The other shift that day is byte-identical — no third person's duty moved.
        expect(patch[DATE_KEY][1]).toEqual(MODERN_ROSTER()[DATE_KEY][1]);
    });

    it('upgrades a pre-6-May legacy shift on write, without inventing a co-lead', async () => {
        rosterDoc = LEGACY_ROSTER();
        // A request from before `swapRole` existed, matched on identity alone.
        swapDocs = [{ id: 'swap-1', data: { ...PENDING_REQUEST, swapRole: undefined } }];
        render(<RosterView user={DERLINDER} />);

        fireEvent.click(coverButton());
        await waitFor(() => expect(swapPatches()).toHaveLength(1));

        const shift = rosterPatches()[0][DATE_KEY][0];
        expect(shift.lead).toBe('Derlinder');
        // `buildShiftStaffLabel(lead, null)` is `Lead: X` — the modern one-person
        // label, not `Lead: X, Co: undefined` and not the bare name it replaced. The
        // upgrade is the point: the same document is never read as legacy twice.
        expect(shift.staff).toBe('Lead: Derlinder');
        expect('coLead' in shift).toBe(false);
        await waitFor(() =>
            expect(screen.getByText(/verified against the master roster/i)).toBeTruthy(),
        );
    });

    it('shows the covered shift in the calendar once the roster snapshot arrives', async () => {
        render(<RosterView user={DERLINDER} />);
        fireEvent.click(coverButton());
        await waitFor(() => expect(swapPatches()).toHaveLength(1));

        // The listener is what updates the grid, exactly as it does for any other
        // change to the document; nothing about the calendar is written locally.
        await deliverRoster();
        expect(within(daySquare(DATE_KEY)).getByText('Lead: Derlinder, Co: Ying Xian')).toBeTruthy();
        // And the badge is gone with the request.
        expect(document.querySelectorAll('[data-coverage-badge]').length).toBe(0);
    });

    it('runs the sequence once for two taps inside one React batch', async () => {
        // The `disabled` attribute only appears after a re-render, so a real
        // double-tap can deliver two clicks that both see the pre-render state. The
        // latch is a ref, set synchronously, and this is what exercises it: two
        // clicks with no render between them.
        render(<RosterView user={DERLINDER} />);

        await act(async () => {
            const button = coverButton();
            button.click();
            button.click();
        });

        await waitFor(() => expect(swapPatches()).toHaveLength(1));
        expect(callLog).toEqual([
            `getDoc:${ROSTER_PATH}`,
            `updateDoc:${ROSTER_PATH}`,
            `getDoc:${ROSTER_PATH}`,
            `updateDoc:${SWAPS_PATH}/swap-1`,
        ]);
    });

    it('answers one at a time: while an answer is in flight, no other request is answerable', async () => {
        swapDocs = [
            { id: 'swap-1', data: { ...PENDING_REQUEST } },
            {
                id: 'swap-2',
                data: { ...PENDING_REQUEST, requestedBy: 'Fadzlynn', originalTask: 'NC' },
            },
        ];

        // Hold the first roster read open, so the accept really is mid-flight.
        let releaseRead;
        getDoc.mockImplementationOnce((ref) => {
            callLog.push(`getDoc:${ref.path}`);
            return new Promise((resolve) => {
                releaseRead = () =>
                    resolve({ exists: () => rosterExists, data: () => clone(rosterDoc) });
            });
        });

        render(<RosterView user={DERLINDER} />);
        fireEvent.click(coverButton('EFT', 'Brandon'));

        await waitFor(() => expect(releaseRead).toBeTypeOf('function'));
        // Both requests' controls are locked: both answers write the same document.
        expect(coverButton('EFT', 'Brandon').disabled).toBe(true);
        expect(declineButton('EFT', 'Brandon').disabled).toBe(true);
        expect(coverButton('NC', 'Fadzlynn').disabled).toBe(true);
        expect(declineButton('NC', 'Fadzlynn').disabled).toBe(true);
        expect(screen.getByText(/checking the roster/i)).toBeTruthy();
        // A press on the other one while locked does nothing at all.
        fireEvent.click(coverButton('NC', 'Fadzlynn'));
        expect(callLog).toEqual([`getDoc:${ROSTER_PATH}`]);

        await act(async () => {
            releaseRead();
        });
        await waitFor(() => expect(swapPatches()).toHaveLength(1));
        expect(swapPatches()[0].path).toBe(`${SWAPS_PATH}/swap-1`);
        // …and the other one is answerable again.
        expect(coverButton('NC', 'Fadzlynn').disabled).toBe(false);
    });

    it('answers one request without touching the other', async () => {
        swapDocs = [
            { id: 'swap-1', data: { ...PENDING_REQUEST } },
            {
                id: 'swap-2',
                data: {
                    ...PENDING_REQUEST,
                    requestedBy: 'Fadzlynn',
                    originalTask: 'NC',
                    swapRole: 'lead',
                },
            },
        ];
        render(<RosterView user={DERLINDER} />);
        expect(screen.getByText(/cover asked of you \(2\)/i)).toBeTruthy();

        fireEvent.click(coverButton('EFT', 'Brandon'));
        await waitFor(() => expect(swapPatches()).toHaveLength(1));

        expect(swapPatches()[0].path).toBe(`${SWAPS_PATH}/swap-1`);
        expect(requestCard('swap-1')).toBeNull();
        expect(requestCard('swap-2')).not.toBeNull();
        expect(screen.getByText(/cover asked of you \(1\)/i)).toBeTruthy();
    });
});

// ─── 3. A MUTATION THAT MATCHES NOTHING LEAVES IT PENDING ─────────────────────

describe('a swap that cannot be applied leaves the request PENDING and says so', () => {
    it('refuses without writing anything when the requester no longer holds the duty', async () => {
        // The roster was regenerated: Brandon is not on the EFT shift any more.
        rosterDoc = {
            [DATE_KEY]: [
                {
                    task: 'EFT',
                    week: 1,
                    lead: 'Fadzlynn',
                    coLead: 'Ying Xian',
                    staff: 'Lead: Fadzlynn, Co: Ying Xian',
                    category: 'EFT',
                },
            ],
        };
        render(<RosterView user={DERLINDER} />);

        fireEvent.click(coverButton());

        await waitFor(() =>
            expect(screen.getAllByText(/no longer on the EFT shift/i).length).toBeGreaterThan(0),
        );
        // NO write of any kind: not the roster, not the ledger.
        expect(updateDoc).not.toHaveBeenCalled();
        expect(callLog).toEqual([`getDoc:${ROSTER_PATH}`]);
        // The request is still here, still answerable, and says it was not applied.
        expect(requestCard()).not.toBeNull();
        expect(within(requestCard()).getByText(/still waiting/i)).toBeTruthy();
        expect(coverButton()).toBeTruthy();
        // The same sentence is in two places on purpose: beside the request (which is
        // still there) and in the banner at the top of the card. Hence `getAllByText`.
        expect(screen.getAllByText(/Cover not applied/i).length).toBe(2);
    });

    it('does NOT approve when the write cannot be found on read-back', async () => {
        rosterWritesLand = false;
        render(<RosterView user={DERLINDER} />);

        fireEvent.click(coverButton());

        await waitFor(() =>
            expect(screen.getAllByText(/could not find it when it read the document back/i).length)
                .toBeGreaterThan(0),
        );
        // The roster write was attempted and the read-back happened; the LEDGER was
        // never touched. This is A-RC4: the write is not the evidence.
        expect(callLog).toEqual([
            `getDoc:${ROSTER_PATH}`,
            `updateDoc:${ROSTER_PATH}`,
            `getDoc:${ROSTER_PATH}`,
        ]);
        expect(swapPatches()).toEqual([]);
        expect(requestCard()).not.toBeNull();
        expect(screen.queryByText(/verified against the master roster/i)).toBeNull();
    });

    it('refuses when the roster document does not exist, and names that as the reason', async () => {
        rosterExists = false;
        render(<RosterView user={DERLINDER} />);

        fireEvent.click(coverButton());

        await waitFor(() =>
            expect(screen.getAllByText(/could not be read/i).length).toBeGreaterThan(0),
        );
        expect(updateDoc).not.toHaveBeenCalled();
        expect(requestCard()).not.toBeNull();
    });

    it('keeps the request pending when a write throws, and never leaves an APPROVED behind', async () => {
        updateDoc.mockImplementation((ref) => {
            callLog.push(`updateDoc:${ref.path}`);
            return Promise.reject(Object.assign(new Error('offline'), { code: 'unavailable' }));
        });
        render(<RosterView user={DERLINDER} />);

        fireEvent.click(coverButton());

        await waitFor(() =>
            expect(screen.getAllByText(/database error \(unavailable\) before it could confirm anything/i).length)
                .toBeGreaterThan(0),
        );
        // It does not claim the roster is unchanged either: the write may or may not
        // have landed, and AURA says exactly that.
        expect(screen.getAllByText(/does not know whether the roster changed/i).length).toBe(2);
        expect(callLog).toEqual([`getDoc:${ROSTER_PATH}`, `updateDoc:${ROSTER_PATH}`]);
        expect(swapPatches()).toEqual([]);
        expect(requestCard()).not.toBeNull();
    });

    it('does not claim "nothing changed" when the roster WAS changed and only the ledger write failed', async () => {
        // The one path where "cover not applied" would be a lie: the roster write
        // landed and was verified, and the `APPROVED` write is what threw.
        updateDoc.mockImplementation((ref, patch) => {
            callLog.push(`updateDoc:${ref.path}`);
            if (ref.path === ROSTER_PATH) {
                Object.assign(rosterDoc, clone(patch));
                return Promise.resolve();
            }
            return Promise.reject(Object.assign(new Error('nope'), { code: 'unavailable' }));
        });
        render(<RosterView user={DERLINDER} />);

        fireEvent.click(coverButton());

        await waitFor(() =>
            expect(screen.getAllByText(/Your name IS on the EFT shift/).length).toBeGreaterThan(0),
        );
        // It says what is true: the change is in the document and confirmed, the
        // ledger entry is not, and the request may still look unanswered.
        expect(screen.getAllByText(/read the document back to confirm it/i).length).toBe(2);
        expect(screen.getAllByText(/may still show as waiting/i).length).toBe(2);
        expect(screen.getAllByText(/Do not answer it twice/i).length).toBe(2);
        // And it does NOT say the roster is unchanged.
        expect(screen.queryByText(/roster is unchanged/i)).toBeNull();
        expect(screen.queryByText(/Cover not applied/i)).toBeNull();
        // The roster really did change, and the ledger really was not flipped.
        expect(rosterDoc[DATE_KEY][0].lead).toBe('Derlinder');
        expect(callLog).toEqual([
            `getDoc:${ROSTER_PATH}`,
            `updateDoc:${ROSTER_PATH}`,
            `getDoc:${ROSTER_PATH}`,
            `updateDoc:${SWAPS_PATH}/swap-1`,
        ]);
    });

    it('stays retryable: a refusal is not remembered as an answer', async () => {
        rosterWritesLand = false;
        render(<RosterView user={DERLINDER} />);

        fireEvent.click(coverButton());
        await waitFor(() => expect(callLog).toHaveLength(3));

        // Second attempt, this time with a write that lands.
        rosterWritesLand = true;
        fireEvent.click(coverButton());
        await waitFor(() => expect(swapPatches()).toHaveLength(1));
        await waitFor(() =>
            expect(screen.getByText(/verified against the master roster/i)).toBeTruthy(),
        );
        // The stale failure note went with the request.
        expect(requestCard()).toBeNull();
    });
});

// ─── 4. DECLINING ─────────────────────────────────────────────────────────────

describe('declining does not touch the roster document', () => {
    it('writes DENIED to the ledger and nothing else', async () => {
        render(<RosterView user={DERLINDER} />);

        fireEvent.click(declineButton());

        await waitFor(() => expect(swapPatches()).toHaveLength(1));
        expect(swapPatches()[0]).toEqual({
            path: `${SWAPS_PATH}/swap-1`,
            patch: { status: 'DENIED' },
        });
        // The roster was neither read nor written on this path.
        expect(callLog).toEqual([`updateDoc:${SWAPS_PATH}/swap-1`]);
        expect(rosterPatches()).toEqual([]);
        expect(rosterDoc).toEqual(MODERN_ROSTER());

        await waitFor(() => expect(screen.getByText(/^Declined\./)).toBeTruthy());
        // M4: no claim that the requester was told.
        expect(screen.getByText(/cannot notify Brandon yet/i)).toBeTruthy();
        expect(screen.getByText(/stays with Brandon/i)).toBeTruthy();
        expect(requestCard()).toBeNull();
    });

    it('keeps the request when the decline write fails', async () => {
        updateDoc.mockImplementation((ref) => {
            callLog.push(`updateDoc:${ref.path}`);
            return Promise.reject(Object.assign(new Error('nope'), { code: 'permission-denied' }));
        });
        render(<RosterView user={DERLINDER} />);

        fireEvent.click(declineButton());

        await waitFor(() =>
            expect(screen.getAllByText(/decline was not recorded/i).length).toBeGreaterThan(0),
        );
        // Declining touches only the ledger, so "the roster is unchanged" is true
        // here — and it is said only here.
        expect(screen.getAllByText(/database error permission-denied/i).length).toBe(2);
        expect(screen.getAllByText(/roster is unchanged/i).length).toBe(2);
        expect(requestCard()).not.toBeNull();
    });
});

// ─── 5. THE SNAPSHOT IS THE SOURCE OF TRUTH ───────────────────────────────────

describe('the card follows the listener', () => {
    it('drops a request that a later snapshot no longer reports as PENDING', async () => {
        render(<RosterView user={DERLINDER} />);
        expect(requestCard()).not.toBeNull();

        // Somebody else answered it, or an admin cancelled it.
        swapDocs = [];
        await deliverCoverage();
        expect(coverageCard()).toBeNull();
    });

    it('does not stack duplicate buttons when one document is delivered twice', async () => {
        render(<RosterView user={DERLINDER} />);
        swapDocs = [
            { id: 'swap-1', data: { ...PENDING_REQUEST } },
            { id: 'swap-1', data: { ...PENDING_REQUEST } },
        ];
        await deliverCoverage();

        expect(document.querySelectorAll('[data-coverage-request]').length).toBe(1);
        expect(screen.getByText(/cover asked of you \(1\)/i)).toBeTruthy();
    });
});

// ─── 6. M8 — A DENIED LISTENER IS VISIBLE ─────────────────────────────────────

describe('a listener failure is surfaced, not swallowed (M8)', () => {
    it('says the card is empty because it could not be loaded', async () => {
        render(<RosterView user={DERLINDER} />);

        await act(async () => {
            coverageListener.onError(
                Object.assign(new Error('denied'), { code: 'permission-denied' }),
            );
        });

        expect(screen.getByText(/do not have permission to read coverage requests/i)).toBeTruthy();
        expect(screen.getByText(/not because nobody has asked/i)).toBeTruthy();
    });

    it('names an unexpected error code rather than going quiet', async () => {
        render(<RosterView user={DERLINDER} />);

        await act(async () => {
            coverageListener.onError(Object.assign(new Error('gone'), { code: 'unavailable' }));
        });

        expect(screen.getByText(/could not be loaded \(unavailable\)/i)).toBeTruthy();
    });
});

// ─── 7. DEMO MODE ─────────────────────────────────────────────────────────────

describe('demo mode has no coverage surface at all', () => {
    beforeEach(() => {
        ctx.isDemo = true;
    });

    it('opens no channel, shows no card, and calls no Firestore function', () => {
        render(<RosterView user={DERLINDER} />);

        expect(coverageCard()).toBeNull();
        expect(onSnapshot).not.toHaveBeenCalled();
        expect(collection).not.toHaveBeenCalled();
        expect(query).not.toHaveBeenCalled();
        expect(where).not.toHaveBeenCalled();
        expect(doc).not.toHaveBeenCalled();
        expect(getDoc).not.toHaveBeenCalled();
        expect(updateDoc).not.toHaveBeenCalled();
        expect(setDoc).not.toHaveBeenCalled();
        expect(addDoc).not.toHaveBeenCalled();
    });
});

// ─── 8. WHO THE REQUEST IS FOR ────────────────────────────────────────────────

describe('the listener is keyed on the signed-in user', () => {
    /**
     * KEYED ON `uid`, NOT ON `name`. The old query was
     * `where('targetStaff','==',user.name)`, so editing your display name in your
     * profile silently stopped every coverage request from reaching you — and a
     * query matching nothing is indistinguishable from nobody having asked.
     */
    it('asks for the requests aimed at whoever is signed in', () => {
        render(<RosterView user={{ uid: 'uid-ying-xian', name: 'Ying Xian', role: 'staff' }} />);
        expect(where).toHaveBeenCalledWith('targetUid', '==', 'uid-ying-xian');
    });

    it('opens no listener at all when there is no signed-in name', () => {
        render(<RosterView user={{ role: 'staff' }} />);
        // The roster document listener still runs; the coverage query does not.
        expect(query).not.toHaveBeenCalled();
        expect(collection).not.toHaveBeenCalled();
        expect(coverageCard()).toBeNull();
    });
});
