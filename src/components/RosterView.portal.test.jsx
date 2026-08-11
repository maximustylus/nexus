/**
 * ==============================================================================
 * OVERLAY PORTALS — regression tests for the header-slicing bug (v1.8.1)
 * ==============================================================================
 * The user's screenshot (2026-08-08) showed the app header rendering ON TOP of
 * the open Configuration Wizard. Mechanism: RosterView's root carries
 * `relative z-10`, which caps every descendant — including a `fixed z-[100]`
 * overlay — at level 10 against the header's sibling `relative z-50` context.
 * A child can never out-stack its parent's stacking context, so the fix is a
 * React portal to document.body, not a bigger z-index.
 *
 * These tests pin the fix STRUCTURALLY: the overlay element must be a direct
 * child of document.body, and must NOT be a descendant of the component's own
 * card. If someone "simplifies" the portal away, both assertions fail even
 * though every visual test would still pass in jsdom (which has no painting).
 * ==============================================================================
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
    doc: vi.fn(),
    onSnapshot: vi.fn(() => () => {}),
    setDoc: vi.fn(),
    collection: vi.fn(),
    addDoc: vi.fn(),
    serverTimestamp: vi.fn(),
    // 🤝 Added with the coverage-request listener RosterView now owns. Vitest
    // throws on any import the mock factory does not define, so every Firestore
    // entry point the component imports has to appear here even in a demo-mode
    // test where none of them is called.
    query: vi.fn(),
    where: vi.fn(),
    getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
    updateDoc: vi.fn(() => Promise.resolve()),
}));
vi.mock('../context/NexusContext', () => ({
    useNexus: () => ({ isDemo: true }),
}));

import RosterView from './RosterView';
import ConfirmationModal from './ConfirmationModal';

afterEach(cleanup);

describe('overlay portals — escape the RosterView stacking context', () => {
    it('renders the Configure wizard as a direct child of document.body, outside the card', () => {
        const { container } = render(<RosterView user={{ name: 'Alif', role: 'admin' }} />);

        fireEvent.click(screen.getByRole('button', { name: /configure/i }));

        const overlay = document.querySelector('[data-overlay="roster-config-wizard"]');
        expect(overlay).not.toBeNull();
        // Direct child of body: the portal really escaped.
        expect(overlay.parentElement).toBe(document.body);
        // And nothing overlay-shaped is left inside the component's own tree,
        // where the z-10 root would cap it under the app header.
        expect(container.querySelector('[data-overlay]')).toBeNull();
    });

    it('renders ConfirmationModal as a direct child of document.body', () => {
        const { container } = render(
            <ConfirmationModal
                isOpen
                title="NEXUS says"
                message="Portal check"
                onCancel={() => {}}
                onConfirm={() => {}}
            />,
        );

        const overlay = document.querySelector('[data-overlay="confirmation-modal"]');
        expect(overlay).not.toBeNull();
        expect(overlay.parentElement).toBe(document.body);
        expect(container.querySelector('[data-overlay]')).toBeNull();
    });

    it('unmounting removes the portaled overlay from document.body (no orphans)', () => {
        const { unmount } = render(<RosterView user={{ name: 'Alif', role: 'admin' }} />);
        fireEvent.click(screen.getByRole('button', { name: /configure/i }));
        expect(document.querySelector('[data-overlay="roster-config-wizard"]')).not.toBeNull();

        unmount();
        expect(document.querySelector('[data-overlay="roster-config-wizard"]')).toBeNull();
    });
});
