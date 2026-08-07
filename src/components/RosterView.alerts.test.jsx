/**
 * ==============================================================================
 * ROSTER VIEW — P8.3 (no native dialogs) and M12 (duplicate swap requests)
 * ==============================================================================
 * Runner: Vitest + @testing-library/react (jsdom)
 * Run:    npx vitest run src/components/RosterView.alerts.test.jsx
 *
 * Two claims are pinned here, both of which the repository has previously made
 * and not kept:
 *
 *   P8.3 — the v1.5 release notes say "native browser alerts replaced with
 *   custom-branded confirmation modals". `RosterView.jsx` falsified that with
 *   eight `window.alert` calls. `window.alert`, `window.confirm` and
 *   `window.prompt` are all stubbed with spies here and asserted NEVER called,
 *   across every path in this view that used to raise one — so the claim can
 *   only become false again by turning this file red.
 *
 *   M12 — `addDoc` was unconditional, so pressing Submit twice on one shift
 *   wrote two independently-acceptable PENDING documents. The guard is asserted
 *   twice: as a pure signature function, and end-to-end against the mocked
 *   `addDoc` in LIVE mode.
 *
 * Unlike `RosterView.demo.test.jsx`, this file drives BOTH universes: the demo
 * flag is a `vi.hoisted` box the context mock reads, so live-mode behaviour
 * (which is where `addDoc` actually happens) is reachable.
 * ==============================================================================
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';

// --- MOCKS (hoisted above the imports below by Vitest) ------------------------

const ctx = vi.hoisted(() => ({ isDemo: false }));
const store = vi.hoisted(() => ({ snapshotData: null, addDocImpl: null }));

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
    // Delivers `store.snapshotData` synchronously, the way a warm Firestore
    // cache does, so live mode has a roster on the calendar to click.
    onSnapshot: vi.fn((ref, onNext) => {
        if (store.snapshotData) {
            onNext({ exists: () => true, data: () => store.snapshotData });
        }
        return () => {};
    }),
    setDoc: vi.fn(() => Promise.resolve()),
    addDoc: vi.fn((...args) =>
        store.addDocImpl ? store.addDocImpl(...args) : Promise.resolve({ id: 'mock' }),
    ),
    getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
    serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

vi.mock('../context/NexusContext', () => ({
    useNexus: () => ({ isDemo: ctx.isDemo }),
    NexusProvider: ({ children }) => children,
}));

import { addDoc, setDoc } from 'firebase/firestore';
import RosterView, { buildSwapRequestSignature } from './RosterView';

// --- FIXTURES -----------------------------------------------------------------

// The calendar opens on the CURRENT month (post-mortem B3), so the live fixture
// has to live there or its shift buttons are never rendered.
const today = new Date();
const LIVE_DATE_KEY = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-15`;

// Live pool is LIVE_ROSTER_DEFAULTS: Brandon, Ying Xian, Derlinder, Fadzlynn.
const LIVE_ROSTER = {
    [LIVE_DATE_KEY]: [
        {
            task: 'EFT',
            week: 1,
            lead: 'Brandon',
            coLead: 'Ying Xian',
            staff: 'Lead: Brandon, Co: Ying Xian',
            category: 'EFT',
        },
    ],
};

const BRANDON = { name: 'Brandon', role: 'staff', email: 'brandon@example.org' };
const VISITOR = { name: 'Visiting Therapist', role: 'staff', email: 'visitor@example.org' };

let alertSpy;
let confirmSpy;
let promptSpy;

/** Every native dialog this component could raise, in one assertion. */
const expectNoNativeDialogs = () => {
    expect(alertSpy).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(promptSpy).not.toHaveBeenCalled();
};

beforeEach(() => {
    vi.clearAllMocks();
    ctx.isDemo = false;
    store.snapshotData = null;
    store.addDocImpl = null;

    alertSpy = vi.fn();
    confirmSpy = vi.fn(() => true);
    promptSpy = vi.fn(() => null);
    vi.stubGlobal('alert', alertSpy);
    vi.stubGlobal('confirm', confirmSpy);
    vi.stubGlobal('prompt', promptSpy);
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

// --- FLOW HELPERS -------------------------------------------------------------

const openConfigure = () => fireEvent.click(screen.getByRole('button', { name: /configure/i }));

/** Click the shift button that renders `task`, opening the swap modal. */
const openSwapModalFor = (task) => {
    const label = screen.getAllByText(task)[0];
    fireEvent.click(label.closest('button'));
};

/**
 * The two swap `<select>`s have no `id`/`htmlFor` pairing in the component, and
 * P8.3 is not the change that should be quietly rewriting the swap modal's
 * markup, so they are located by the option they contain instead.
 */
const selectOffering = (optionValue) => {
    const option = Array.from(document.querySelectorAll('option')).find(
        (candidate) => candidate.value === optionValue && !candidate.disabled,
    );
    if (!option) throw new Error(`No enabled <option> with value "${optionValue}" is on screen`);
    return option.closest('select');
};

const chooseColleague = (name) => {
    fireEvent.change(selectOffering(name), { target: { value: name } });
};

const submitSwap = () => fireEvent.click(screen.getByRole('button', { name: /submit request|arrange cover/i }));

// ─── 1. buildSwapRequestSignature — THE M12 GUARD, AS A PURE FUNCTION ─────────

describe('buildSwapRequestSignature (M12)', () => {
    const base = { originalShiftDate: '2026-09-07', originalTask: 'EFT', targetStaff: 'Derlinder' };

    it('is stable: the same triple always produces the same signature', () => {
        expect(buildSwapRequestSignature(base)).toBe(buildSwapRequestSignature({ ...base }));
    });

    it('ignores properties outside the triple', () => {
        // `swapRole`, `reason` and who initiated it are deliberately NOT part of
        // the identity — see the comment on the helper. A second press with a
        // different reason typed in is still the same request.
        expect(
            buildSwapRequestSignature({ ...base, swapRole: 'lead', reason: 'conference' }),
        ).toBe(buildSwapRequestSignature({ ...base, swapRole: 'coLead', reason: 'leave' }));
    });

    it('separates on every one of the three fields', () => {
        const signatures = new Set([
            buildSwapRequestSignature(base),
            buildSwapRequestSignature({ ...base, originalShiftDate: '2026-09-08' }),
            buildSwapRequestSignature({ ...base, originalTask: 'NC' }),
            buildSwapRequestSignature({ ...base, targetStaff: 'Fadzlynn' }),
        ]);
        expect(signatures.size).toBe(4);
    });

    it('cannot be confused by a field that contains the delimiter', () => {
        // A naive `a + '|' + b + '|' + c` collides here. JSON array encoding does
        // not, and a false "you already sent this" would silently block a real
        // request — the failure mode that matters more than a duplicate.
        expect(
            buildSwapRequestSignature({ originalShiftDate: 'a|b', originalTask: 'c', targetStaff: 'd' }),
        ).not.toBe(
            buildSwapRequestSignature({ originalShiftDate: 'a', originalTask: 'b|c', targetStaff: 'd' }),
        );
    });

    it('normalises surrounding whitespace, and tolerates missing fields', () => {
        expect(buildSwapRequestSignature({ ...base, targetStaff: '  Derlinder ' })).toBe(
            buildSwapRequestSignature(base),
        );
        expect(buildSwapRequestSignature({})).toBe(buildSwapRequestSignature(undefined));
        // An absent field must not collapse into a neighbouring one.
        expect(buildSwapRequestSignature({ originalShiftDate: 'X' })).not.toBe(
            buildSwapRequestSignature({ originalTask: 'X' }),
        );
    });
});

// ─── 2. P8.3 — NO NATIVE DIALOG, ANYWHERE, IN DEMO MODE ───────────────────────

describe('demo mode raises no native dialog (P8.3)', () => {
    beforeEach(() => {
        ctx.isDemo = true;
    });

    it('generates a sandbox roster without alert(), confirm() or prompt()', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        fireEvent.click(screen.getByRole('button', { name: /load example department/i }));
        fireEvent.click(screen.getByRole('button', { name: /generate sandbox roster/i }));

        // The flow really ran — the sandbox report is on screen.
        expect(screen.getByText(/could not be staffed/i)).toBeTruthy();
        expectNoNativeDialogs();
    });

    it('reports an engine refusal in the branded banner, not a native dialog', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        fireEvent.change(screen.getByLabelText(/staff pool/i), {
            target: { value: 'Sam Wilson, Sam Wilson' },
        });
        fireEvent.change(screen.getByLabelText(/core tasks/i), { target: { value: 'Ward Round' } });
        fireEvent.click(screen.getByRole('button', { name: /generate sandbox roster/i }));

        expect(screen.getByText(/AURA did not generate a roster/i)).toBeTruthy();
        expectNoNativeDialogs();
    });

    it('submits a sandbox swap into an on-screen notice, and says nothing was sent', async () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        fireEvent.click(screen.getByRole('button', { name: /load example department/i }));
        fireEvent.click(screen.getByRole('button', { name: /generate sandbox roster/i }));

        openSwapModalFor('Inpatient Rounds');
        // Demo grants the admin path, so the visitor holds no duty and must pick
        // one (M11).
        const dutyPicker = selectOffering('lead');
        fireEvent.change(dutyPicker, { target: { value: 'lead' } });

        // Whoever the candidate filter left in the colleague list.
        const colleagueSelect = Array.from(document.querySelectorAll('select')).find(
            (select) => select !== dutyPicker,
        );
        const colleague = colleagueSelect.querySelector('option:not([disabled])').value;
        chooseColleague(colleague);
        submitSwap();

        // The old copy claimed "AURA notified <name>". Nothing is notified in the
        // sandbox, and the replacement says so.
        await waitFor(
            () => expect(screen.getByText(/nothing was sent and nothing was saved/i)).toBeTruthy(),
            { timeout: 2500 },
        );
        expect(addDoc).not.toHaveBeenCalled();
        expectNoNativeDialogs();
    });
});

// ─── 3. P8.3 — NO NATIVE DIALOG ON THE LIVE WRITE PATHS ───────────────────────

describe('live mode raises no native dialog (P8.3)', () => {
    it('confirms a successful generation in a banner that clears itself', async () => {
        vi.useFakeTimers();
        render(<RosterView user={BRANDON} />);

        openConfigure();
        fireEvent.click(screen.getByRole('button', { name: /generate roster/i }));
        // The branded ConfirmationModal — the ONE dialog on this path, and it is
        // the app's own component, not window.confirm.
        fireEvent.click(screen.getByRole('button', { name: /^ok$/i }));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(setDoc).toHaveBeenCalledTimes(1);
        expect(screen.getByText(/roster saved/i)).toBeTruthy();

        // Success is transient; the banner clears itself rather than needing a
        // click. The timer is cleared on unmount, so nothing lands after this.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(6000);
        });
        expect(screen.queryByText(/roster saved/i)).toBeNull();
        expectNoNativeDialogs();
    });

    it('reports a write failure in a banner and keeps the wizard open', async () => {
        setDoc.mockRejectedValueOnce(Object.assign(new Error('nope'), { code: 'permission-denied' }));
        render(<RosterView user={BRANDON} />);

        openConfigure();
        fireEvent.click(screen.getByRole('button', { name: /generate roster/i }));
        fireEvent.click(screen.getByRole('button', { name: /^ok$/i }));

        await waitFor(() => expect(screen.getByText(/the roster was NOT saved/i)).toBeTruthy());
        // The banner is INSIDE the still-open wizard — a banner behind a
        // full-screen overlay would be an invisible replacement for a blocking
        // alert, which is worse than the alert it replaced.
        expect(screen.getByText(/permission-denied/i)).toBeTruthy();
        expect(screen.getByRole('button', { name: /generate roster/i })).toBeTruthy();
        expectNoNativeDialogs();
    });

    it('reports a failed swap submission in a banner, dismissible by the user', async () => {
        store.snapshotData = LIVE_ROSTER;
        store.addDocImpl = () =>
            Promise.reject(Object.assign(new Error('offline'), { code: 'unavailable' }));

        render(<RosterView user={BRANDON} />);
        openSwapModalFor('EFT');
        chooseColleague('Derlinder');
        submitSwap();

        await waitFor(() => expect(screen.getByText(/could not send the request/i)).toBeTruthy());
        expect(screen.getByText(/unavailable/i)).toBeTruthy();
        expectNoNativeDialogs();

        // An error stays until acknowledged — it is not auto-dismissed.
        fireEvent.click(screen.getByRole('button', { name: /dismiss message/i }));
        expect(screen.queryByText(/could not send the request/i)).toBeNull();
    });
});

// ─── 4. M12 — THE DUPLICATE GUARD, END TO END IN LIVE MODE ────────────────────

describe('duplicate swap requests are refused (M12)', () => {
    beforeEach(() => {
        store.snapshotData = LIVE_ROSTER;
    });

    it('writes the first request and refuses an identical second one', async () => {
        render(<RosterView user={BRANDON} />);

        openSwapModalFor('EFT');
        chooseColleague('Derlinder');
        submitSwap();

        await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.getByText(/swap request sent to Derlinder/i)).toBeTruthy());

        // Exactly the same shift, exactly the same colleague, a second time.
        openSwapModalFor('EFT');
        chooseColleague('Derlinder');
        submitSwap();

        await waitFor(() =>
            expect(
                screen.getByText(/you already sent this request — Derlinder has not responded yet/i),
            ).toBeTruthy(),
        );
        // The point of the whole finding: still ONE PENDING document.
        expect(addDoc).toHaveBeenCalledTimes(1);
        expectNoNativeDialogs();
    });

    it('still allows a different colleague for the same shift', async () => {
        render(<RosterView user={BRANDON} />);

        openSwapModalFor('EFT');
        chooseColleague('Derlinder');
        submitSwap();
        await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(1));

        openSwapModalFor('EFT');
        chooseColleague('Fadzlynn');
        submitSwap();

        await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(2));
        expect(addDoc.mock.calls[1][1].targetStaff).toBe('Fadzlynn');
        expectNoNativeDialogs();
    });

    it('does not remember a request that failed to send — it stays retryable', async () => {
        store.addDocImpl = vi
            .fn()
            .mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }))
            .mockResolvedValueOnce({ id: 'second-try' });

        render(<RosterView user={BRANDON} />);

        openSwapModalFor('EFT');
        chooseColleague('Derlinder');
        submitSwap();
        await waitFor(() => expect(screen.getByText(/could not send the request/i)).toBeTruthy());

        // The modal stayed open on failure, so the retry is one more click.
        submitSwap();
        await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(2));
        expect(screen.queryByText(/you already sent this request/i)).toBeNull();
        await waitFor(() => expect(screen.getByText(/swap request sent to Derlinder/i)).toBeTruthy());
        expectNoNativeDialogs();
    });

    it('does not change the document written to shift_swaps', async () => {
        render(<RosterView user={BRANDON} />);

        openSwapModalFor('EFT');
        chooseColleague('Derlinder');
        submitSwap();

        await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(1));
        const written = addDoc.mock.calls[0][1];
        // The A3/M11 contract, unchanged by P8.3: the person swapped out, the
        // duty being handed over, and no `initiatedBy` on a self-request.
        expect(written).toEqual({
            requestedBy: 'Brandon',
            targetStaff: 'Derlinder',
            originalShiftDate: LIVE_DATE_KEY,
            originalTask: 'EFT',
            swapRole: 'lead',
            reason: '',
            status: 'PENDING',
            timestamp: 'mock-timestamp',
        });
    });
});
