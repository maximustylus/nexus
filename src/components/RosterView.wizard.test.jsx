/**
 * ==============================================================================
 * ROSTER VIEW — THE CONFIGURE WIZARD, IN BOTH UNIVERSES
 * ==============================================================================
 * Runner: Vitest + @testing-library/react (jsdom)
 * Run:    npx vitest run src/components/RosterView.wizard.test.jsx
 *
 * The grade-aware tables are a SANDBOX-ONLY change. This file is the gate on that
 * word "only".
 *
 * The live wizard writes into `config.staff` / `config.tasks`, which is exactly
 * what `prepareRosterWrite` hands to `setDoc` against `system_data/roster_2026` —
 * the document four real clinicians read their week out of. So the two
 * comma-separated textareas are asserted here down to their `id`, their class
 * list and their value, and every one of the new sandbox controls is asserted
 * ABSENT. A future refactor that "tidies up" the wizard by giving live mode the
 * tables has to turn this file red first.
 *
 * The demo half of the file is the mirror image: the textareas must be gone
 * there, because two ways to enter a staff pool in one wizard is two answers to
 * "who is being rostered".
 * ==============================================================================
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

// --- MOCKS (hoisted above the imports below by Vitest) ------------------------

const ctx = vi.hoisted(() => ({ isDemo: false }));

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
    serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

vi.mock('../context/NexusContext', () => ({
    useNexus: () => ({ isDemo: ctx.isDemo }),
    NexusProvider: ({ children }) => children,
}));

import { setDoc } from 'firebase/firestore';
import RosterView from './RosterView';
import { LIVE_ROSTER_DEFAULTS } from '../utils/auraEngine';

const BRANDON = { name: 'Brandon', role: 'staff', email: 'brandon@example.org' };

/**
 * The two live textareas, verbatim as of the commit before the sandbox tables
 * existed. Class list included on purpose: "renders exactly as before" is a claim
 * about the rendered markup, and a value-only assertion would pass for a
 * completely restyled control.
 */
const LIVE_TEXTAREA_CLASS =
    'input-field w-full mt-1 h-20 font-mono text-xs bg-white dark:bg-slate-900 border dark:border-slate-700 rounded p-2 text-slate-800 dark:text-white';

const openConfigure = () => fireEvent.click(screen.getByRole('button', { name: /configure/i }));

/** Every control the sandbox wizard added, as one absence check. */
const expectNoSandboxTables = () => {
    expect(screen.queryByText(/grade bands/i)).toBeNull();
    expect(screen.queryByLabelText('Junior band lowest grade')).toBeNull();
    expect(screen.queryByLabelText('Staff row 1 name')).toBeNull();
    expect(screen.queryByLabelText('Staff row 1 job grade')).toBeNull();
    expect(screen.queryByLabelText('Task row 1 name')).toBeNull();
    expect(screen.queryByLabelText('Task row 1: Senior may lead')).toBeNull();
    expect(screen.queryAllByRole('button', { name: /add row/i })).toHaveLength(0);
    expect(screen.queryByText(/it is not a preference order/i)).toBeNull();
    // The grade dropdown is the only `<select>` the tables add, and the live
    // wizard has none at all.
    expect(document.querySelectorAll('select')).toHaveLength(0);
};

beforeEach(() => {
    vi.clearAllMocks();
    ctx.isDemo = false;
});

afterEach(() => {
    cleanup();
});

// ─── LIVE MODE: THE WIZARD IS UNTOUCHED ───────────────────────────────────────

describe('live mode: the Configure wizard is exactly what it was', () => {
    it('renders the two comma-separated textareas, with their ids, classes and values', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        const staffBox = document.getElementById('roster-staff-pool');
        expect(staffBox).toBeTruthy();
        expect(staffBox.tagName).toBe('TEXTAREA');
        expect(staffBox.className).toBe(LIVE_TEXTAREA_CLASS);
        expect(staffBox.value).toBe(LIVE_ROSTER_DEFAULTS.staff.join(', '));
        // No placeholder in live mode, as before.
        expect(staffBox.hasAttribute('placeholder')).toBe(false);

        const tasksBox = document.getElementById('roster-tasks');
        expect(tasksBox).toBeTruthy();
        expect(tasksBox.tagName).toBe('TEXTAREA');
        expect(tasksBox.className).toBe(LIVE_TEXTAREA_CLASS);
        expect(tasksBox.value).toBe(LIVE_ROSTER_DEFAULTS.tasks.join(', '));
        expect(tasksBox.hasAttribute('placeholder')).toBe(false);

        // Their labels, which is how every existing test reaches them.
        expect(screen.getByLabelText(/staff pool/i)).toBe(staffBox);
        expect(screen.getByLabelText(/core tasks/i)).toBe(tasksBox);
    });

    it('has none of the sandbox controls, and none of the sandbox copy', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        expectNoSandboxTables();
        // Sandbox-only chrome, absent as before.
        expect(screen.queryByText(/sandbox mode/i)).toBeNull();
        expect(screen.queryByRole('button', { name: /load example department/i })).toBeNull();
        expect(screen.getByRole('button', { name: /^generate roster$/i })).toBeTruthy();
    });

    it('keeps the narrow, non-scrolling modal the live wizard has always had', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        const panel = document.getElementById('roster-staff-pool').closest('.rounded-2xl');
        expect(panel.className).toContain('max-w-lg');
        expect(panel.className).not.toContain('max-w-3xl');
        expect(panel.className).not.toContain('overflow-y-auto');
    });

    it('still edits config.staff straight from the textarea, and still writes it', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        fireEvent.change(screen.getByLabelText(/staff pool/i), {
            target: { value: 'Brandon, Ying Xian' },
        });
        fireEvent.change(screen.getByLabelText(/core tasks/i), { target: { value: 'EFT' } });

        // The live path is confirmation-gated, and the confirmation names the pool
        // the textarea holds — the M1 guard. Then it writes.
        fireEvent.click(screen.getByRole('button', { name: /^generate roster$/i }));
        expect(screen.getAllByText('Brandon, Ying Xian').length).toBeGreaterThan(0);
        fireEvent.click(screen.getByRole('button', { name: /^ok$/i }));
        expect(setDoc).toHaveBeenCalledTimes(1);
    });

    it('is still gated by validateRosterConfig, not by the sandbox tables', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        // Emptying the textarea must still disable Generate. If live mode had been
        // switched onto the table-driven gate this would pass for the wrong
        // reason — so the reason is asserted too.
        fireEvent.change(screen.getByLabelText(/staff pool/i), { target: { value: '' } });
        expect(screen.getByRole('button', { name: /^generate roster$/i }).disabled).toBe(true);
        expect(screen.getByText(/staff pool is empty/i)).toBeTruthy();
        expect(screen.queryByText(/staff table/i)).toBeNull();
    });
});

// ─── DEMO MODE: THE TEXTAREAS ARE GONE ────────────────────────────────────────

describe('demo mode: the wizard is the tables, and only the tables', () => {
    beforeEach(() => {
        ctx.isDemo = true;
    });

    it('has no free-text staff or task box at all', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        expect(document.getElementById('roster-staff-pool')).toBeNull();
        expect(document.getElementById('roster-tasks')).toBeNull();
        expect(screen.queryByLabelText(/staff pool/i)).toBeNull();
        expect(screen.queryByLabelText(/core tasks/i)).toBeNull();
    });

    it('has the band editor, both tables and the sandbox chrome', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        expect(screen.getByText(/grade bands/i)).toBeTruthy();
        expect(screen.getByLabelText('Junior band lowest grade')).toBeTruthy();
        expect(screen.getByLabelText('Staff row 1 name')).toBeTruthy();
        expect(screen.getByLabelText('Staff row 1 job grade')).toBeTruthy();
        expect(screen.getByLabelText('Task row 1 name')).toBeTruthy();
        expect(screen.getByLabelText('Task row 1: Senior may lead')).toBeTruthy();
        expect(screen.getAllByRole('button', { name: /add row/i })).toHaveLength(2);
        expect(screen.getAllByText(/sandbox mode/i).length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: /load example department/i })).toBeTruthy();

        // Start date and Weeks are SHARED between the two universes and stay put.
        expect(screen.getByLabelText(/start date/i)).toBeTruthy();
        expect(screen.getByLabelText(/^weeks$/i)).toBeTruthy();
    });

    it('opens with an empty pool and a disabled Generate, saying what is missing', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        expect(screen.getByRole('button', { name: /generate sandbox roster/i }).disabled).toBe(true);
        expect(screen.getByText(/add at least one person to the staff table/i)).toBeTruthy();
        expect(setDoc).not.toHaveBeenCalled();
    });
});
