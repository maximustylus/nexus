/**
 * ==============================================================================
 * ROSTER VIEW — SWITCHING TEAMS MUST NOT LEAVE THE LAST TEAM'S ROSTER ON SCREEN
 * ==============================================================================
 * Runner: Vitest + @testing-library/react (jsdom)
 * Run:    npx vitest run src/components/RosterView.teamswitch.test.jsx
 *
 * ⚠️ THIS IS THE SHAPE OF A BUG THIS FILE ALREADY FIXED ONCE, IN A DIFFERENT
 *    TRANSITION. The demo-mode toggle carries the comment:
 *
 *        "Leaving the sandbox: drop the generated roster and its report together.
 *         Without this the fictional shifts stayed on the calendar until a
 *         snapshot arrived — and if the live document does not exist, no snapshot
 *         ever replaces them."
 *
 *    Switching TEAM is the same transition: one context for another where the
 *    destination document may not exist. The roster listener's handler is
 *
 *        (snap) => { setRosterError(null); if (snap.exists()) setRosterData(snap.data()); }
 *
 *    so a team with no roster yet — which is EVERY newly approved team — leaves
 *    the previous team's roster rendered under the new team's name. The switcher's
 *    own header calls itself "the most consequential control on the screen: every
 *    roster, swap and wellbeing record below it changes meaning when it changes".
 *
 *    `firestore.rules` cannot catch this. The read was legitimate — the user IS a
 *    member of both teams — and the failure is that the result is still on screen
 *    after the question changed. Cross-team isolation in the rules is about who may
 *    read what; this is about what the client keeps.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

const ctx = vi.hoisted(() => ({ isDemo: false }));
/** Which team is active, and what its roster document contains. */
const team = vi.hoisted(() => ({ id: 'kkh-physiotherapy', rosters: {} }));

vi.mock('../firebase', () => ({
    db: { __mock: 'db' }, auth: { __mock: 'auth' }, storage: {}, messaging: {},
    requestForToken: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
    // The doc ref carries the path so `onSnapshot` can answer for the right team.
    doc: vi.fn((_db, ...segments) => ({ __path: segments.join('/') })),
    collection: vi.fn((_db, ...segments) => ({ __path: segments.join('/') })),
    onSnapshot: vi.fn((ref, onNext) => {
        const path = ref && ref.__path ? ref.__path : '';
        const match = /^teams\/([^/]+)\/rosters\//.exec(path);
        if (match) {
            const data = team.rosters[match[1]];
            // ⚠️ A REAL FIRESTORE FIRES FOR A MISSING DOCUMENT TOO, with
            //    `exists() === false`. That callback is what the component has to
            //    handle; suppressing it here would hide the defect being tested.
            onNext({ exists: () => data !== undefined, data: () => data });
        }
        return () => {};
    }),
    setDoc: vi.fn(() => Promise.resolve()),
    addDoc: vi.fn(() => Promise.resolve({ id: 'x' })),
    getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
    serverTimestamp: vi.fn(() => 'ts'),
    query: vi.fn(() => ({})),
    where: vi.fn(() => ({})),
    updateDoc: vi.fn(() => Promise.resolve()),
}));

vi.mock('../context/NexusContext', () => ({
    useNexus: () => ({ isDemo: ctx.isDemo }),
    NexusProvider: ({ children }) => children,
}));

const MEMBERS_BY_TEAM = {
    'kkh-physiotherapy': [{ uid: 'uid-brandon', displayName: 'Brandon' }, { uid: 'uid-ying', displayName: 'Ying Xian' }],
    'kkh-occupational-therapy': [{ uid: 'uid-nadia', displayName: 'Nadia' }],
};
// Stable references per team — a fresh array each call re-runs the effect forever.
const ROSTERED = Object.fromEntries(Object.entries(MEMBERS_BY_TEAM).map(([k, v]) => [k, v]));
const BY_NAME = Object.fromEntries(Object.entries(MEMBERS_BY_TEAM)
    .map(([k, v]) => [k, Object.fromEntries(v.map((m) => [m.displayName, m.uid]))]));

vi.mock('../context/TeamContext', () => ({
    useTeam: () => ({
        teamId: team.id,
        members: MEMBERS_BY_TEAM[team.id] || [],
        rosteredMembers: ROSTERED[team.id] || [],
        memberUidByName: BY_NAME[team.id] || {},
    }),
}));

import RosterView from './RosterView';

const today = new Date();
const DATE_KEY = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-15`;
const PHYSIO_ROSTER = {
    [DATE_KEY]: [{ task: 'EFT', week: 1, lead: 'Brandon', coLead: 'Ying Xian',
        staff: 'Lead: Brandon, Co: Ying Xian', category: 'EFT' }],
};

const USER = { uid: 'uid-brandon', name: 'Brandon', role: 'lead', email: 'b@kkh.com.sg' };

beforeEach(() => {
    ctx.isDemo = false;
    team.id = 'kkh-physiotherapy';
    team.rosters = { 'kkh-physiotherapy': PHYSIO_ROSTER };
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('⚠️ switching to a team with no roster yet', () => {
    it('does not leave the previous team\'s shifts on the calendar', async () => {
        const view = render(<RosterView user={USER} />);
        await waitFor(() => expect(screen.getAllByText(/Brandon/).length).toBeGreaterThan(0));

        // The switch: same component, different team, and that team has no roster
        // document — which is the state of EVERY newly approved team.
        team.id = 'kkh-occupational-therapy';
        view.rerender(<RosterView user={USER} />);

        await waitFor(() => {
            expect(
                screen.queryAllByText(/Brandon/).length,
                "Physiotherapy's roster is still rendered under Occupational Therapy",
            ).toBe(0);
        });
    });

    it('shows the new team\'s roster when it does have one', async () => {
        team.rosters['kkh-occupational-therapy'] = {
            [DATE_KEY]: [{ task: 'OT Clinic', week: 1, lead: 'Nadia', coLead: '', staff: 'Lead: Nadia', category: 'EFT' }],
        };
        const view = render(<RosterView user={USER} />);
        await waitFor(() => expect(screen.getAllByText(/Brandon/).length).toBeGreaterThan(0));

        team.id = 'kkh-occupational-therapy';
        view.rerender(<RosterView user={USER} />);

        await waitFor(() => expect(screen.getAllByText(/Nadia/).length).toBeGreaterThan(0));
        expect(screen.queryAllByText(/Brandon/).length).toBe(0);
    });
});
