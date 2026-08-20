/**
 * ==============================================================================
 * AURA PULSE BOT — THE COVERAGE SURFACE IS GONE, AND NOTHING ELSE IS
 * ==============================================================================
 * Runner: Vitest + @testing-library/react (jsdom)
 * Run:    npx vitest run src/components/AuraPulseBot.coverage.test.jsx
 *
 * The chat panel used to own coverage requests: it subscribed to `shift_swaps`,
 * force-opened itself for an incoming one, and carried the Accept / Decline
 * buttons. That surface now lives in the roster. This file exists because the
 * dangerous outcome of moving it is not "the new surface is broken" —
 * `RosterView.coverage.test.jsx` covers that — it is **two live surfaces**: two
 * Accept buttons for one shift, two clients racing the same roster write, and one
 * clinical hand-over answerable twice.
 *
 * So the claims pinned here are:
 *
 *   1. THIS COMPONENT OPENS NO FIRESTORE LISTENER AT ALL, in either universe.
 *      `onSnapshot`, `collection`, `query` and `where` are asserted never called.
 *      Exactly one surface reads `shift_swaps`, and it is not this one.
 *   2. It never force-opens itself. `onOpen` is still accepted as a prop (App.jsx
 *      passes it, and `AuraGreeting` shares the callback) and is never invoked.
 *   3. NO ROSTER MUTATION LIVES HERE ANY MORE. `getDoc`/`updateDoc` are not called
 *      by mounting or by starting a session, and no Accept / Decline control exists.
 *   4. ITS OTHER MODES STILL WORK: the persona grid renders, picking a persona
 *      starts a session with a greeting and an input, "back" returns to the grid.
 *      That is the "do not break its other modes" half of the instruction.
 * ==============================================================================
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

const ctx = vi.hoisted(() => ({ isDemo: true, teamId: null }));

vi.mock('../firebase', () => ({
    db: { __mock: 'firestore-db' },
    auth: { __mock: 'auth' },
    storage: { __mock: 'storage' },
    messaging: { __mock: 'messaging' },
    requestForToken: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
    doc: vi.fn(() => ({ __mock: 'docRef' })),
    setDoc: vi.fn(() => Promise.resolve()),
    getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
    updateDoc: vi.fn(() => Promise.resolve()),
    arrayUnion: vi.fn((value) => ({ __mock: 'arrayUnion', value })),
    // Present so that a re-introduced listener would be VISIBLE here as a called
    // spy rather than as an import error somewhere else.
    collection: vi.fn(() => ({ __mock: 'collectionRef' })),
    query: vi.fn(() => ({ __mock: 'query' })),
    where: vi.fn(() => ({ __mock: 'where' })),
    onSnapshot: vi.fn(() => () => {}),
    serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

vi.mock('firebase/functions', () => ({
    getFunctions: vi.fn(() => ({ __mock: 'functions' })),
    httpsCallable: vi.fn(() => vi.fn(() => Promise.resolve({ data: { text: '{}' } }))),
}));

// The DOCX exporter is not the subject and pulls in a large bundle; a stub keeps
// this file hermetic.
vi.mock('docx', () => ({
    Document: class {},
    Packer: { toBlob: vi.fn() },
    Paragraph: class {},
    TextRun: class {},
    HeadingLevel: {},
    Table: class {},
    TableRow: class {},
    TableCell: class {},
    WidthType: {},
}));

// A real `useState` behind the mocked context, so the component's own history
// updates re-render it the way the provider would.
vi.mock('../context/NexusContext', async () => {
    const ReactModule = await import('react');
    return {
        useNexus: () => {
            const [auraHistory, setAuraHistory] = ReactModule.useState([]);
            return { isDemo: ctx.isDemo, auraHistory, setAuraHistory };
        },
        NexusProvider: ({ children }) => children,
    };
});

// The bot writes wellbeing and pulse under the ACTIVE TEAM now. `teamId` is null
// in the sandbox, which is what stops a walkthrough writing into clinical data.
vi.mock('../context/TeamContext', () => ({
    useTeam: () => ({ teamId: ctx.teamId }),
}));

import { onSnapshot, collection, query, where, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import AuraPulseBot from './AuraPulseBot';

const USER = {
    // `uid` is what the wellbeing document is keyed by now. `id` is the old
    // DIRECTORY id, left on the fixture because the component still reads it for
    // AURA's prompt context — but nothing routes on it any more.
    uid: 'uid-derlinder',
    id: 'derlinder',
    name: 'Derlinder',
    title: 'Physiotherapist',
};

let onOpenSpy;

const renderBot = (props = {}) => {
    onOpenSpy = vi.fn();
    return render(
        <AuraPulseBot
            isOpen
            onClose={() => {}}
            onOpen={onOpenSpy}
            user={USER}
            {...props}
        />,
    );
};

/** No listener, no roster read, no roster write — in one assertion. */
const expectNoCoverageTraffic = () => {
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(collection).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(where).not.toHaveBeenCalled();
    expect(getDoc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
};

// jsdom implements no layout, so it has no `scrollIntoView` — a pre-existing gap
// this component has always had (it scrolls the transcript on every message) and
// nothing to do with the coverage move. Stubbed per test rather than in a global
// setup file, because this project deliberately has none.
let scrollIntoView;

beforeEach(() => {
    vi.clearAllMocks();
    ctx.isDemo = true;
    scrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
    cleanup();
    Element.prototype.scrollIntoView = scrollIntoView;
});

describe('the chat panel no longer owns coverage requests', () => {
    it('opens no Firestore listener in live mode, where the swap listener used to be', () => {
        ctx.isDemo = false;
        renderBot();

        // This is the anti-duplication gate: `RosterView` is the only reader of
        // `shift_swaps` now, so answering one request twice is not expressible.
        expectNoCoverageTraffic();
        expect(onOpenSpy).not.toHaveBeenCalled();
    });

    it('opens no Firestore listener in demo mode either', () => {
        renderBot();
        expectNoCoverageTraffic();
        expect(onOpenSpy).not.toHaveBeenCalled();
    });

    it('has no Accept / Decline control and says nothing about coverage', () => {
        ctx.isDemo = false;
        renderBot();

        expect(screen.queryByRole('button', { name: /accept swap/i })).toBeNull();
        expect(screen.queryByText(/urgent coverage request/i)).toBeNull();
        expect(screen.queryByText(/coverage request/i)).toBeNull();
        expect(screen.queryByText(/waiting for your answer/i)).toBeNull();
    });
});

describe('its other modes still work', () => {
    it('renders the persona grid', () => {
        renderBot();
        expect(screen.getByText(/identity matrix/i)).toBeTruthy();
        expect(screen.getByRole('listbox')).toBeTruthy();
        expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
    });

    it('starts a session on a persona, then goes back to the grid', () => {
        renderBot();

        const persona = screen.getByRole('listbox').querySelector('button');
        expect(persona).not.toBeNull();
        fireEvent.click(persona);

        // A greeting and an input: the session really started.
        expect(screen.getByPlaceholderText(/ask aura/i)).toBeTruthy();
        // The demo greeting. `getAllByText` because "SIMULATION" also appears in the
        // panel header's status line, and this assertion is about the greeting
        // existing rather than about which of the two is which.
        expect(screen.getAllByText(/simulation/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/what do you need/i)).toBeTruthy();
        expect(screen.queryByText(/identity matrix/i)).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /back to identity matrix/i }));
        expect(screen.getByText(/identity matrix/i)).toBeTruthy();

        // …and none of it touched Firestore.
        expectNoCoverageTraffic();
    });

    it('still reports being offline, and still offers the bug report', () => {
        renderBot();
        expect(screen.getByTitle(/report a bug/i)).toBeTruthy();
        expect(screen.getByRole('dialog', { name: /aura pulse/i })).toBeTruthy();
    });
});

// ─── THE SANDBOX WRITES NOTHING ──────────────────────────────────────────────

describe('the sandbox no longer writes into clinical data', () => {
    /**
     * A REAL BEHAVIOUR CHANGE, pinned so it cannot quietly come back. Demo mode used
     * to append its logs to the production `wellbeing_history/_anonymous_logs` and
     * paint a demo name onto the production pulse board — so every walkthrough with
     * a visiting department left a trace in real clinical data. `RosterView` has
     * carried the contract for months ("NO FIRESTORE, EVER"); team scoping makes it
     * unavoidable here, because a sandbox visitor has no team and therefore no path
     * to write to.
     */
    it('writes nothing at all in demo mode', () => {
        ctx.isDemo = true;
        ctx.teamId = null;
        renderBot();
        expect(setDoc).not.toHaveBeenCalled();
        expect(updateDoc).not.toHaveBeenCalled();
    });

    /**
     * The same protection for a state that only exists after the rebuild: signed in,
     * verified, and not yet invited to any team. There is no team to file a
     * wellbeing log under, so nothing is filed.
     */
    it('writes nothing for a signed-in user who has no team yet', () => {
        ctx.isDemo = false;
        ctx.teamId = null;
        renderBot();
        expect(setDoc).not.toHaveBeenCalled();
        expect(updateDoc).not.toHaveBeenCalled();
        ctx.isDemo = true;
        ctx.teamId = null;
    });
});
