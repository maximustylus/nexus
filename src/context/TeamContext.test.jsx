/**
 * ==============================================================================
 * TEAM CONTEXT — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest + Testing Library.  Run: npm test
 *
 * `teamSelection.test.js` covers the DECISION. This file covers the WIRING around
 * it, where a different class of bug lives: subscribing to the wrong path, failing
 * to move somebody off a team they have lost, or letting a switch through that the
 * pure layer would have refused.
 *
 * Firestore is mocked at the module boundary, in the same style as
 * `CoverageWatcher.test.jsx`, so the paths this provider composes are ASSERTED
 * rather than trusted — reading `teams/{id}/members/{uid}` versus
 * `teams/{id}/members/{displayName}` is the difference the whole rebuild is about,
 * and both look identical on screen.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

vi.mock('../firebase', () => ({ db: {} }));

/**
 * The mock records the SEGMENTS each listener was opened on, keyed by path, so a
 * test can emit to one specific document. `doc()` returns its own segments, which
 * is what makes that possible.
 */
const listeners = new Map();
vi.mock('firebase/firestore', () => ({
    doc: vi.fn((_db, ...segments) => ({ __path: segments.join('/') })),
    collection: vi.fn((_db, ...segments) => ({ __path: segments.join('/') })),
    onSnapshot: vi.fn((ref, onNext, onError) => {
        const entry = { onNext, onError };
        listeners.set(ref.__path, entry);
        return () => listeners.delete(ref.__path);
    }),
}));

import { TeamProvider, useTeam } from './TeamContext';

const UID = 'aB3xYz9QwErTyUiOpAsDfGhJkLzX';
const A = 'kkh-sport-exercise-medicine';
const B = 'kkh-respiratory-therapy';   // sorts FIRST — 'respiratory' < 'sport'

const exists = (data) => ({ exists: () => true, id: data.id || 'doc', data: () => data });
/** A collection snapshot, in the shape `members` reads. */
const docsOf = (entries) => ({
    docs: entries.map(([id, data]) => ({ id, data: () => data })),
});
const missing = { exists: () => false, id: 'doc', data: () => ({}) };

const emit = (path, snapshot) => {
    const entry = listeners.get(path);
    if (!entry) throw new Error(`Nothing subscribed to ${path}. Open: ${[...listeners.keys()].join(', ')}`);
    act(() => entry.onNext(snapshot));
};

const emitError = (path, error) => {
    const entry = listeners.get(path);
    act(() => entry.onError(error));
};

/** Renders the context as text so assertions read as the values, not as internals. */
const Probe = () => {
    const team = useTeam();
    return (
        <div>
            <span data-testid="teamId">{team.teamId || 'none'}</span>
            <span data-testid="isLead">{String(team.isLead)}</span>
            <span data-testid="switcher">{String(team.showSwitcher)}</span>
            <span data-testid="loading">{String(team.loading)}</span>
            <span data-testid="canOther">{String(team.canActOn('sgh-physiotherapy'))}</span>
            <span data-testid="members">{team.members.map((m) => m.displayName).join(',')}</span>
            <span data-testid="lookup">{team.memberUidByName['Ying Xian'] || 'none'}</span>
            <button type="button" onClick={() => team.switchTeam(A)}>go A</button>
            <button type="button" onClick={() => team.switchTeam('sgh-physiotherapy')}>go elsewhere</button>
        </div>
    );
};

const value = (id) => screen.getByTestId(id).textContent;

const mount = (uid = UID) => render(<TeamProvider uid={uid}><Probe /></TeamProvider>);

beforeEach(() => {
    listeners.clear();
    try { window.localStorage.clear(); } catch { /* jsdom always has it */ }
});
afterEach(cleanup);

// ==============================================================================

describe('TeamContext — the paths it subscribes to', () => {
    /**
     * THE PATH ASSERTION. `users/{uid}` — not `users/{displayName}`, not
     * `teams/{id}/users/{uid}`. A person is not a membership; scoping their profile
     * per team would mean a clinician in two teams editing their own name twice.
     */
    it('reads membership from the ROOT users document, keyed by uid', () => {
        mount();
        expect([...listeners.keys()]).toEqual([`users/${UID}`]);
    });

    it('subscribes to nothing at all without a uid', () => {
        mount(null);
        expect(listeners.size).toBe(0);
        expect(value('loading')).toBe('false');
        expect(value('teamId')).toBe('none');
    });

    /**
     * ⚠️ THE MEMBERSHIP DOCUMENT IS KEYED BY UID. This assertion is the whole point
     * of the rebuild expressed in one line: `teams/{id}/members/{uid}`, never
     * `members/{displayName}`. Both render identically and only one of them survives
     * two clinicians called Sarah.
     */
    it('opens the team and the caller membership under the active team, by uid', () => {
        mount();
        emit(`users/${UID}`, exists({ teamIds: [A] }));

        expect(listeners.has(`teams/${A}`)).toBe(true);
        expect(listeners.has(`teams/${A}/members/${UID}`)).toBe(true);
    });

    it('opens no per-team listeners for the switcher when there is only one team', () => {
        mount();
        emit(`users/${UID}`, exists({ teamIds: [A] }));
        // `teams/{A}` is open for the heading; what must NOT exist is a second,
        // switcher-only subscription paid for by somebody who will never see it.
        expect(value('switcher')).toBe('false');
    });
});

describe('TeamContext — choosing and changing the active team', () => {
    it('lands on the single team and stops loading', () => {
        mount();
        emit(`users/${UID}`, exists({ teamIds: [A] }));
        expect(value('teamId')).toBe(A);
        expect(value('loading')).toBe('false');
    });

    it('lands on the first team deterministically when there are several', () => {
        mount();
        emit(`users/${UID}`, exists({ teamIds: [A, B] }));
        expect(value('teamId')).toBe(B);          // 'respiratory' sorts before 'sport'
        expect(value('switcher')).toBe('true');
    });

    it('switches to a team the user belongs to', () => {
        mount();
        emit(`users/${UID}`, exists({ teamIds: [A, B] }));
        fireEvent.click(screen.getByText('go A'));
        expect(value('teamId')).toBe(A);
    });

    /**
     * THE REFUSAL. An id can arrive from a URL, a stale bookmark or a hand-edited
     * `localStorage`; none of those are evidence of membership. If this passed, a
     * write would be composed under another department's team.
     */
    it('REFUSES a switch to a team the user is not in, and stays put', () => {
        mount();
        emit(`users/${UID}`, exists({ teamIds: [A, B] }));
        fireEvent.click(screen.getByText('go elsewhere'));
        expect(value('teamId')).toBe(B);
        expect(value('canOther')).toBe('false');
    });

    /**
     * Happens for real: a lead removes somebody from team B while they are looking
     * at it. Leaving them pointed at a team they have lost means every listener
     * below starts failing permission-denied — and two of the three have no error
     * callback, so it would look like an empty roster rather than a lost membership.
     */
    it('moves a user off a team they have just been removed from', () => {
        mount();
        emit(`users/${UID}`, exists({ teamIds: [A, B] }));
        fireEvent.click(screen.getByText('go A'));
        expect(value('teamId')).toBe(A);

        emit(`users/${UID}`, exists({ teamIds: [B] }));
        expect(value('teamId')).toBe(B);
    });

    it('falls to no team when the last membership goes, rather than a stale id', () => {
        mount();
        emit(`users/${UID}`, exists({ teamIds: [A] }));
        emit(`users/${UID}`, exists({ teamIds: [] }));
        expect(value('teamId')).toBe('none');
    });

    it('treats a missing user document as no teams, not as an error state', () => {
        mount();
        emit(`users/${UID}`, missing);
        expect(value('teamId')).toBe('none');
        expect(value('loading')).toBe('false');
    });

    /**
     * FAIL TO NO TEAM, NOT TO A STALE ONE. An unreadable profile must not leave the
     * app aimed at a team whose membership it can no longer verify.
     */
    it('drops to no team when the profile cannot be read', () => {
        mount();
        emit(`users/${UID}`, exists({ teamIds: [A] }));
        expect(value('teamId')).toBe(A);

        emitError(`users/${UID}`, new Error('permission-denied'));
        expect(value('teamId')).toBe('none');
        expect(value('loading')).toBe('false');
    });
});

describe('TeamContext — the member list that replaces TEAM_DIRECTORY', () => {
    it('subscribes to the team members subcollection', () => {
        mount();
        emit(`users/${UID}`, exists({ teamIds: [A] }));
        expect(listeners.has(`teams/${A}/members`)).toBe(true);
    });

    /**
     * Sorted by display name so every list built from it — the roster staff pool,
     * the swap target picker, the load editor — presents people in the same order.
     * Lists that reorder between screens make a reader check twice.
     */
    it('sorts members by display name, not by uid or insertion order', () => {
        mount();
        emit(`users/${UID}`, exists({ teamIds: [A] }));
        emit(`teams/${A}/members`, docsOf([
            ['uid-y', { displayName: 'Ying Xian' }],
            ['uid-b', { displayName: 'Brandon' }],
            ['uid-d', { displayName: 'Derlinder' }],
        ]));
        expect(value('members')).toBe('Brandon,Derlinder,Ying Xian');
    });

    /**
     * The lookup a swap picker needs: somebody chooses a colleague BY NAME and the
     * document has to record WHO that is. `uid` is the key, `displayName` is a
     * field — so a rename changes what is rendered and breaks nothing that routes.
     */
    it('maps a display name to a uid', () => {
        mount();
        emit(`users/${UID}`, exists({ teamIds: [A] }));
        emit(`teams/${A}/members`, docsOf([['uid-y', { displayName: 'Ying Xian' }]]));
        expect(value('lookup')).toBe('uid-y');
    });

    /**
     * ⚠️ A DUPLICATED DISPLAY NAME RESOLVES DETERMINISTICALLY, to the member that
     *    sorts first. Team-scoping already removed the collision that mattered — a
     *    Sarah at KKH and a Sarah at SGH are in different subcollections now. What
     *    is left is two identical names inside ONE department, which the lead fixes
     *    by editing the member list. Pinned so the behaviour is a decision rather
     *    than whatever `Object.fromEntries` happened to do.
     */
    it('resolves a duplicated name to the first member, every time', () => {
        mount();
        emit(`users/${UID}`, exists({ teamIds: [A] }));
        emit(`teams/${A}/members`, docsOf([
            ['uid-second', { displayName: 'Ying Xian' }],
            ['uid-first', { displayName: 'Ying Xian' }],
        ]));
        // Both sort equal on name; the array order after sort decides, and the
        // reverse in `memberUidByName` makes the FIRST one win rather than the last.
        expect(value('lookup')).toBe('uid-second');
    });

    it('empties the member list rather than keeping a stale one when it cannot be read', () => {
        mount();
        emit(`users/${UID}`, exists({ teamIds: [A] }));
        emit(`teams/${A}/members`, docsOf([['uid-b', { displayName: 'Brandon' }]]));
        expect(value('members')).toBe('Brandon');

        emitError(`teams/${A}/members`, new Error('permission-denied'));
        expect(value('members')).toBe('');
    });
});

describe('TeamContext — isLead', () => {
    /**
     * Under multi-team the question is not "who is this" but "who is this HERE" —
     * the same person leads one department and is staff in another. It is answered
     * from the membership document and never from an email.
     */
    it('is true only for a lead membership in the ACTIVE team', () => {
        mount();
        emit(`users/${UID}`, exists({ teamIds: [A] }));
        emit(`teams/${A}/members/${UID}`, exists({ role: 'lead' }));
        expect(value('isLead')).toBe('true');
    });

    it('is false for staff, and false while the membership is still unknown', () => {
        mount();
        emit(`users/${UID}`, exists({ teamIds: [A] }));
        expect(value('isLead')).toBe('false');          // not yet loaded

        emit(`teams/${A}/members/${UID}`, exists({ role: 'staff' }));
        expect(value('isLead')).toBe('false');
    });

    it('is false when the membership document is absent entirely', () => {
        mount();
        emit(`users/${UID}`, exists({ teamIds: [A] }));
        emit(`teams/${A}/members/${UID}`, missing);
        expect(value('isLead')).toBe('false');
    });
});

describe('useTeam — outside a provider', () => {
    /**
     * Demo mode and the public portal have no team. Returning `undefined` there
     * would make `useTeam().teamId` throw — a worse bug than the strictness was
     * guarding against, and one that would take down the sandbox the demos run in.
     */
    it('returns an inert context instead of throwing', () => {
        render(<Probe />);
        expect(value('teamId')).toBe('none');
        expect(value('isLead')).toBe('false');
        expect(value('canOther')).toBe('false');
        expect(() => fireEvent.click(screen.getByText('go A'))).not.toThrow();
    });
});
