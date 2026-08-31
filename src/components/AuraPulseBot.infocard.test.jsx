/**
 * ==============================================================================
 * AURA PULSE BOT — THE IMDA FIRST-USE NOTICE AND THE PERSISTENT CARD LINK
 * ==============================================================================
 * Runner: Vitest + @testing-library/react (jsdom)
 * Run:    npx vitest run src/components/AuraPulseBot.infocard.test.jsx
 *
 * `AURA-TODO.md` P9.2 and P9.3. The claims pinned here:
 *
 *   1. FIRST OPEN SHOWS A SUBSTANTIVE SAFETY STATEMENT with a link to
 *      `/aura-info` — not "we take safety seriously", the two real caveats.
 *   2. DISMISSAL PERSISTS. The notice writes `aura_infocard_notice_v1` and a
 *      remounted panel (next session) shows no notice.
 *   3. THE HEADER LINK OUTLIVES THE NOTICE. After dismissal the info icon still
 *      points at `/aura-info` — the notice is first-use, the access point is
 *      permanent. Both IMDA minimum items, and they are different items.
 *
 * The mock scaffolding is `AuraPulseBot.coverage.test.jsx`'s, unchanged: this
 * file tests a banner and a link, and must not accidentally test Firestore.
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

const USER = { uid: 'uid-derlinder', id: 'derlinder', name: 'Derlinder', title: 'Physiotherapist' };

const NOTICE_KEY = 'aura_infocard_notice_v1';
// The two substantive caveats — the assertion is on the words, so a future edit
// down to a generic reassurance fails here.
const NOTICE_TEXT = /can state wrong information confidently/i;

const renderBot = () => render(
    <AuraPulseBot isOpen onClose={() => {}} onOpen={() => {}} user={USER} />,
);

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

describe('the first-use safety notice (P9.2)', () => {
    it('shows the safety statement with a link to the info card on first open', () => {
        renderBot();

        expect(screen.getByText(NOTICE_TEXT)).toBeTruthy();

        // Exact accessible name: the header icon's label also contains the
        // phrase, and finding BOTH here would be the header test's job.
        const link = screen.getByRole('link', { name: 'Chatbot Info Card' });
        expect(link.getAttribute('href')).toBe('/aura-info');
        expect(link.getAttribute('target')).toBe('_blank');
    });

    it('dismissal hides the notice and persists across a remount', () => {
        const first = renderBot();

        fireEvent.click(screen.getByRole('button', { name: /dismiss ai safety notice/i }));
        expect(screen.queryByText(NOTICE_TEXT)).toBeNull();
        expect(localStorage.getItem(NOTICE_KEY)).toBe('seen');

        // "Next session": a fresh mount against the persisted flag.
        first.unmount();
        renderBot();
        expect(screen.queryByText(NOTICE_TEXT)).toBeNull();
    });

    it('does not break the persona grid it sits above', () => {
        renderBot();
        expect(screen.getByText(/identity matrix/i)).toBeTruthy();
        expect(screen.getByRole('listbox')).toBeTruthy();
    });
});

describe('the persistent header link (P9.3)', () => {
    it('keeps an info-card access point in the header after the notice is dismissed', () => {
        renderBot();
        fireEvent.click(screen.getByRole('button', { name: /dismiss ai safety notice/i }));

        const headerLink = screen.getByRole('link', { name: /about aura: chatbot info card/i });
        expect(headerLink.getAttribute('href')).toBe('/aura-info');
        expect(headerLink.getAttribute('target')).toBe('_blank');
    });
});
