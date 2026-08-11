/**
 * ==============================================================================
 * COVERAGE WATCHER — regression tests for "the request reached nobody"
 * ==============================================================================
 * Moving coverage requests out of the AI chat panel into the roster view was
 * right, but it deleted the only ALWAYS-MOUNTED notification. `RosterView` is
 * rendered behind `currentView === 'roster'` (App.jsx), so a colleague on any
 * other tab was never told a request existed — a return of ROSTER_QC_AUDIT.md M5
 * by a different route, found by audit rather than by the change that caused it.
 *
 * These tests pin the division of labour that fixes it: this component NOTICES
 * (always mounted, live mode only, no mutation logic) and the roster ANSWERS
 * (it owns the verified read-back sequence). Two notifiers would be worse than
 * the bug, so the suppression-when-the-roster-is-visible case is pinned too.
 * ==============================================================================
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

vi.mock('../firebase', () => ({ db: {} }));

const listeners = [];
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(() => ({})),
    query: vi.fn(() => ({})),
    where: vi.fn(() => ({})),
    onSnapshot: vi.fn((_q, onNext, onError) => {
        listeners.push({ onNext, onError });
        return () => {};
    }),
}));

let demoMode = false;
vi.mock('../context/NexusContext', () => ({
    useNexus: () => ({ isDemo: demoMode }),
}));

import CoverageWatcher from './CoverageWatcher';
import { onSnapshot } from 'firebase/firestore';

const USER = { name: 'Ying Xian', role: 'staff' };

/** One PENDING shift_swaps document, in the shape the collection really holds. */
const snapshotOf = (docs) => ({
    docs: docs.map((data, i) => ({ id: data.id || `req-${i}`, data: () => data })),
});

const REQUEST = {
    id: 'req-1',
    requestedBy: 'Brandon',
    targetStaff: 'Ying Xian',
    originalShiftDate: '2026-09-15',
    originalTask: 'Outpatient Clinic',
    swapRole: 'lead',
    status: 'PENDING',
    reason: 'Course',
};

const emit = (docs) => {
    // Every live listener gets the snapshot, as Firestore would. Wrapped in `act`
    // because the callback sets state from outside React's own event loop, and an
    // unflushed update renders nothing at all.
    act(() => {
        listeners.forEach(({ onNext }) => onNext(snapshotOf(docs)));
    });
};

const emitError = (error) => {
    act(() => {
        listeners.forEach(({ onError }) => onError(error));
    });
};

beforeEach(() => {
    listeners.length = 0;
    demoMode = false;
    vi.clearAllMocks();
});
afterEach(cleanup);

describe('CoverageWatcher — notices what the view-gated roster cannot', () => {
    it('subscribes in live mode and announces a pending request', () => {
        render(<CoverageWatcher user={USER} isRosterVisible={false} onOpenRoster={() => {}} />);
        expect(onSnapshot).toHaveBeenCalled();

        emit([REQUEST]);

        expect(screen.getByRole('status')).toBeTruthy();
        expect(screen.getByText(/someone needs cover/i)).toBeTruthy();
        expect(screen.getByText(/Brandon/)).toBeTruthy();
    });

    it('takes the recipient to the roster rather than answering in place', () => {
        const onOpenRoster = vi.fn();
        render(<CoverageWatcher user={USER} isRosterVisible={false} onOpenRoster={onOpenRoster} />);
        emit([REQUEST]);

        fireEvent.click(screen.getByRole('button', { name: /open the roster to answer/i }));
        expect(onOpenRoster).toHaveBeenCalledTimes(1);

        // It must NOT offer to accept or decline: the verified mutation sequence
        // lives in the roster, and a second Accept button would be a second
        // authority over the same document.
        expect(screen.queryByRole('button', { name: /^accept$/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /^decline$/i })).toBeNull();
    });

    it('stays silent while the roster is on screen, so there is only ever one surface', () => {
        render(<CoverageWatcher user={USER} isRosterVisible onOpenRoster={() => {}} />);
        emit([REQUEST]);
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('never subscribes in demo mode — a simulation cannot see a real request', () => {
        demoMode = true;
        render(<CoverageWatcher user={USER} isRosterVisible={false} onOpenRoster={() => {}} />);
        expect(onSnapshot).not.toHaveBeenCalled();
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('does not subscribe without a signed-in name to match on', () => {
        render(<CoverageWatcher user={{}} isRosterVisible={false} onOpenRoster={() => {}} />);
        expect(onSnapshot).not.toHaveBeenCalled();
    });

    it('surfaces a rules denial instead of failing silently (M8)', () => {
        render(<CoverageWatcher user={USER} isRosterVisible={false} onOpenRoster={() => {}} />);
        emitError({ code: 'permission-denied', message: 'denied' });

        expect(screen.getByText(/not permitted to read coverage requests/i)).toBeTruthy();
    });

    it('shows a listener error even while the roster is visible', () => {
        // The roster suppresses request banners, but a broken listener means the
        // roster is showing nothing either — so this must not be suppressed.
        render(<CoverageWatcher user={USER} isRosterVisible onOpenRoster={() => {}} />);
        emitError({ code: 'unavailable', message: 'offline' });

        expect(screen.getByText(/lost the connection to coverage requests/i)).toBeTruthy();
    });

    it('can be dismissed for the session without answering the request', () => {
        render(<CoverageWatcher user={USER} isRosterVisible={false} onOpenRoster={() => {}} />);
        emit([REQUEST]);
        expect(screen.getByRole('status')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /dismiss this coverage notice/i }));
        expect(screen.queryByRole('status')).toBeNull();

        // Dismissing is not answering: a re-delivery of the same still-PENDING
        // document must not resurrect the banner, or dismissing would be useless.
        emit([REQUEST]);
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('announces several requests separately', () => {
        render(<CoverageWatcher user={USER} isRosterVisible={false} onOpenRoster={() => {}} />);
        emit([REQUEST, { ...REQUEST, id: 'req-2', requestedBy: 'Derlinder', originalTask: 'Inpatient Rounds' }]);

        expect(screen.getAllByRole('status')).toHaveLength(2);
        expect(screen.getByText(/Derlinder/)).toBeTruthy();
    });
});
