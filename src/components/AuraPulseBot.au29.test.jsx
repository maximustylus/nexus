/**
 * ==============================================================================
 * AURA PULSE BOT — `AU29`: A SESSION DIES WITH THE IDENTITY THAT STARTED IT
 * ==============================================================================
 * Runner: Vitest + @testing-library/react (jsdom)
 * Run:    npx vitest run src/components/AuraPulseBot.au29.test.jsx
 *
 * The finding: the transcript lives in the ROOT provider and the panel used to
 * keep persona and view across a sign-out, so on a shared clinic terminal the
 * next signed-in colleague could reopen the previous person's wellbeing
 * conversation. The fix has two halves and this file pins both:
 *
 *   1. IN-PLACE IDENTITY CHANGE (this component): a different `user.uid` on a
 *      mounted panel wipes transcript, persona, view, draft input. Asserted by
 *      rendering — a message typed as A must be gone for B, even after B starts
 *      a fresh session.
 *   2. THE UNMOUNT PATH (App.jsx `handleLogout`): asserted at source, the
 *      `AuraChat.latch.test.js` pattern, because no test in this repo mounts
 *      the full App. The claim proven is that the logout handler clears the
 *      root-provider history — WIRED, not rendered.
 *
 * And the guard that matters day to day: the SAME uid re-rendering must NOT
 * wipe anything, or every parent re-render would end the conversation.
 * ==============================================================================
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

vi.mock('../context/TeamContext', () => ({
    useTeam: () => ({ teamId: ctx.teamId }),
}));

import AuraPulseBot from './AuraPulseBot';

const USER_A = { uid: 'uid-clinician-a', id: 'a', name: 'Clinician A', title: 'Physiotherapist' };
const USER_B = { uid: 'uid-clinician-b', id: 'b', name: 'Clinician B', title: 'Podiatrist' };

const renderBot = (user) => render(
    <AuraPulseBot isOpen onClose={() => {}} onOpen={() => {}} user={user} />,
);

/** Enter a session and leave one distinctive line of transcript behind. */
const startSessionAndSay = (text) => {
    const persona = screen.getByRole('listbox').querySelector('button');
    fireEvent.click(persona);
    const input = screen.getByPlaceholderText(/ask aura/i);
    fireEvent.change(input, { target: { value: text } });
    fireEvent.submit(input.closest('form') || input);
};

let scrollIntoView;

beforeEach(() => {
    vi.clearAllMocks();
    ctx.isDemo = true;
    localStorage.clear();
    scrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
    cleanup();
    Element.prototype.scrollIntoView = scrollIntoView;
});

describe('AU29 — in-place identity change wipes the session', () => {
    it('a different uid clears the transcript and returns to the persona grid', () => {
        const { rerender } = renderBot(USER_A);
        startSessionAndSay('confidential thing A said');
        expect(screen.getByText(/confidential thing A said/i)).toBeTruthy();

        rerender(<AuraPulseBot isOpen onClose={() => {}} onOpen={() => {}} user={USER_B} />);

        // Back at the grid, with nothing of A's session on screen…
        expect(screen.getByText(/identity matrix/i)).toBeTruthy();
        expect(screen.queryByText(/confidential thing A said/i)).toBeNull();

        // …and not lurking in history either: B starting a fresh session must
        // not resurface A's line.
        startSessionAndSay('hello from B');
        expect(screen.queryByText(/confidential thing A said/i)).toBeNull();
        expect(screen.getByText(/hello from B/i)).toBeTruthy();
    });

    it('signing out (uid becomes null) wipes the same way', () => {
        const { rerender } = renderBot(USER_A);
        startSessionAndSay('another private line');
        expect(screen.getByText(/another private line/i)).toBeTruthy();

        rerender(<AuraPulseBot isOpen onClose={() => {}} onOpen={() => {}} user={undefined} />);

        expect(screen.getByText(/identity matrix/i)).toBeTruthy();
        expect(screen.queryByText(/another private line/i)).toBeNull();
    });

    it('the SAME uid re-rendering wipes nothing — a re-render is not a sign-out', () => {
        const { rerender } = renderBot(USER_A);
        startSessionAndSay('still my session');

        rerender(<AuraPulseBot isOpen onClose={() => {}} onOpen={() => {}} user={{ ...USER_A }} />);

        // A fresh object with the same uid must keep the conversation.
        expect(screen.getByText(/still my session/i)).toBeTruthy();
        expect(screen.queryByText(/identity matrix/i)).toBeNull();
    });
});

describe('AU29 — the unmount path, asserted at source', () => {
    const codeOnly = (text) => text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*)/.test(line))
        .join('\n');

    const appSrc = codeOnly(readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8'));

    it('handleLogout clears the root-provider history', () => {
        const start = appSrc.indexOf('const handleLogout');
        expect(start).toBeGreaterThan(-1);
        const body = appSrc.slice(start, appSrc.indexOf('};', start));
        expect(body).toContain('setAuraHistory([])');
    });
});
