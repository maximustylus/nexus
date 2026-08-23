/**
 * ==============================================================================
 * THE SANDBOX, SIGNED IN, WITH NO TEAM — every view, nothing thrown
 * ==============================================================================
 *
 * Demo mode has only ever been entered from two places: signed OUT, from the
 * welcome screen's DEMO tab, and by a member of the legacy ten-person directory
 * flipping the Live/Demo toggle. Both of those carry a `teamId`. The holding
 * screen now offers the sandbox to a THIRD kind of visitor — signed in, approved
 * by nobody, waiting to be added to a team — and that person has `teamId === null`
 * while `isDemo` is true, a combination no view had ever been rendered with.
 *
 * It is not a hypothetical: `teamPaths.assertTeamId` THROWS on null, deliberately,
 * because a path composed from a bad id writes into another department's data. So
 * any view that reaches a path builder before checking `isDemo` or `teamId` would
 * white-screen for exactly the audience the new door was built for — a colleague's
 * first minute with NEXUS.
 *
 * WHY THE REAL `teamPaths` IS USED HERE AND NOT A MOCK. The assertion this file
 * makes is "no path is composed", and a mocked builder that quietly returns a
 * string would make every test pass while proving nothing. The real module is the
 * detector: reaching it with a null id is a thrown error, and a thrown error in a
 * render is a failed test.
 *
 * WHAT THIS FILE DOES AND DOES NOT CATCH, measured rather than assumed. Deleting
 * `FeedsView`'s `if (!teamId)` guard makes two of these tests fail, so the detector
 * works. Deleting `StaffLoadEditor`'s does NOT — its fetch loops over
 * `rosteredMembers`, and no team means no members, so the loop body never reaches
 * `loadPath` whether the guard is there or not. That guard is therefore pinned by
 * reading, not by this suite, and saying so is better than letting a green tick
 * imply otherwise. Guards written as `if (isDemo || !teamId)` are likewise only
 * half-exercised here: `isDemo` short-circuits first in this state.
 *
 * `RosterView` is absent on purpose — `RosterView.demo.test.jsx` already renders
 * it in exactly this state (it mocks `NexusContext` to `isDemo: true` and never
 * provides a team, so `useTeam` falls back to `teamId: null`) and additionally
 * asserts that no Firestore call is made at all. This file covers the rest.
 * ==============================================================================
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

vi.mock('../firebase', () => ({
    db: { __mock: 'firestore-db' },
    auth: { __mock: 'auth' },
    storage: { __mock: 'storage' },
    messaging: { __mock: 'messaging' },
    requestForToken: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
    doc: vi.fn(() => ({ __mock: 'docRef' })),
    collection: vi.fn(() => ({ __mock: 'collectionRef' })),
    onSnapshot: vi.fn(() => () => {}),
    setDoc: vi.fn(() => Promise.resolve()),
    addDoc: vi.fn(() => Promise.resolve({ id: 'mock' })),
    getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
    getDocs: vi.fn(() => Promise.resolve({ docs: [], forEach: () => {} })),
    deleteDoc: vi.fn(() => Promise.resolve()),
    updateDoc: vi.fn(() => Promise.resolve()),
    serverTimestamp: vi.fn(() => 'mock-timestamp'),
    query: vi.fn(() => ({ __mock: 'query' })),
    where: vi.fn(() => ({ __mock: 'where' })),
    orderBy: vi.fn(() => ({ __mock: 'orderBy' })),
    increment: vi.fn((n) => n),
    arrayUnion: vi.fn((...v) => v),
    writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), commit: vi.fn(() => Promise.resolve()) })),
}));

vi.mock('firebase/storage', () => ({
    ref: vi.fn(() => ({})),
    uploadBytesResumable: vi.fn(() => Promise.resolve({ ref: {} })),
    getDownloadURL: vi.fn(() => Promise.resolve('https://example.invalid/i.png')),
}));

vi.mock('firebase/functions', () => ({
    getFunctions: vi.fn(() => ({})),
    httpsCallable: vi.fn(() => vi.fn(() => Promise.resolve({ data: {} }))),
}));

// THE STATE UNDER TEST, in one place: the sandbox is on and there is no team.
vi.mock('../context/NexusContext', () => ({
    useNexus: () => ({
        isDemo: true,
        toggleDemo: vi.fn(),
        auraHistory: [],
        setAuraHistory: vi.fn(),
    }),
    NexusProvider: ({ children }) => children,
}));

/**
 * ⚠️ ONE FROZEN OBJECT, RETURNED BY IDENTITY — not an object literal built per call.
 *
 * The first draft of this mock returned a fresh `{ ... }` from `useTeam()` on every
 * render, and `StaffLoadEditor` spun forever: its fetch effect depends on
 * `rosteredMembers`, a new `[]` each render is a new dependency, the effect refires,
 * `setLoads` re-renders, and round it goes. That was the MOCK's fault, not the
 * component's — the real `TeamContext` returns a module-level frozen `INERT` outside
 * a provider and a `useMemo`'d value inside one, so both are referentially stable
 * and neither loops. Mirroring that here keeps this file testing the app rather than
 * testing a defect in its own scaffolding.
 */
const NO_TEAM = Object.freeze({
    teamId: null,
    team: null,
    teamIds: [],
    teams: [],
    members: [],
    rosteredMembers: [],
    membership: null,
    memberUidByName: {},
    isLead: false,
    loading: false,
    switchTeam: () => {},
    canActOn: () => false,
    showSwitcher: false,
});

vi.mock('../context/TeamContext', () => ({
    useTeam: () => NO_TEAM,
    TeamProvider: ({ children }) => children,
}));

import FeedsView from './FeedsView';
import WellbeingView from './WellbeingView';
import ProfileView from './ProfileView';
import AdminPanel from './AdminPanel';
import AdminWellbeingPanel from './AdminWellbeingPanel';
import StaffLoadEditor from './StaffLoadEditor';
import SmartReportView from './SmartReportView';
import CoverageWatcher from './CoverageWatcher';
// The demo fixtures App.jsx feeds these panels when the sandbox is on. Passed here
// for the same reason: `AdminPanel` maps over `teamData`, so rendering it with
// nothing would fail on the PROBE's missing prop rather than on anything about
// having no team, which is the question this file is asking.
import { MOCK_TEAM_DATA, MOCK_STAFF_LOADS } from '../data/mockData';

/**
 * The visitor this door was built for: a real Firebase account, a real uid, and no
 * membership anywhere. `role` is deliberately 'staff' rather than 'admin' — the
 * sandbox grants admin-shaped access through `isDemo`, and the panels below are
 * reachable because of that, not because of anything on the user.
 */
const NEWCOMER = {
    uid: 'uid-newcomer-0001',
    name: 'Waiting Clinician',
    email: 'waiting@kkh.com.sg',
    role: 'staff',
    photoURL: null,
};

/**
 * The third element is whether the view is expected to paint anything in this
 * state. `CoverageWatcher` legitimately renders `null` — it is a notifier with
 * nothing to notify — and asserting "something appeared" for it would either fail
 * or have to be softened into an assertion that means nothing. Naming the
 * exception is the honest version of that.
 */
const VIEWS = [
    ['FeedsView', () => <FeedsView user={NEWCOMER} />, true],
    ['WellbeingView', () => <WellbeingView user={NEWCOMER} />, true],
    ['ProfileView', () => <ProfileView user={NEWCOMER} onLogout={() => {}} />, true],
    ['AdminPanel', () => (
        <AdminPanel user={NEWCOMER} teamData={MOCK_TEAM_DATA} staffLoads={MOCK_STAFF_LOADS} />
    ), true],
    ['AdminWellbeingPanel', () => <AdminWellbeingPanel user={NEWCOMER} onClose={() => {}} />, true],
    ['StaffLoadEditor', () => <StaffLoadEditor onClose={() => {}} />, true],
    ['SmartReportView', () => <SmartReportView user={NEWCOMER} />, true],
    ['CoverageWatcher', () => <CoverageWatcher user={NEWCOMER} />, false],
];

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

describe('the sandbox with no team — every view renders', () => {
    it.each(VIEWS)('%s mounts without composing a Firestore path', async (_name, element, paints) => {
        // `act` so the mount EFFECTS run too, not just the first render. The effects
        // are where the path builders live — a component can render fine and then
        // throw from a listener it sets up a tick later, which is precisely the
        // shape of failure a render-only assertion would miss.
        let view;
        await act(async () => { view = render(element()); });

        // A thrown `assertTeamId` fails the line above. This checks the quieter
        // failure underneath it: a view that swallows the missing team and paints
        // an empty box, which to the newcomer looks the same as a broken app.
        if (paints) expect(view.container.innerHTML.trim()).not.toBe('');
    });

    it('unmounts cleanly too — no teardown reaches a path builder', async () => {
        for (const [, element] of VIEWS) {
            let view;
            await act(async () => { view = render(element()); });
            await act(async () => { view.unmount(); });
        }
    });
});
