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
    // The path is carried so a write can be identified by the document it targets
    // rather than by a call count — see the two-write assertion below.
    doc: vi.fn((_db, ...segments) => ({ __mock: 'docRef', path: segments.join('/') })),
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
    // 🤝 Added with the coverage-request listener RosterView now owns. This file
    // drives live mode, so the listener is created on mount; `onSnapshot` above
    // hands it the same document-shaped snapshot it hands the roster listener,
    // which `readCoverageRequests` reads as "no requests" (it tolerates a snapshot
    // with no `docs`). The inline coverage flow itself is tested end to end in
    // `RosterView.coverage.test.jsx`.
    query: vi.fn(() => ({ __mock: 'query' })),
    where: vi.fn(() => ({ __mock: 'where' })),
    updateDoc: vi.fn(() => Promise.resolve()),
}));

vi.mock('../context/NexusContext', () => ({
    useNexus: () => ({ isDemo: ctx.isDemo }),
    NexusProvider: ({ children }) => children,
}));

// ── TEAM SCOPE ────────────────────────────────────────────────────────────────
// Every live Firestore path in RosterView is composed from `teamId` now, and the
// swap listener routes by `targetUid` rather than by display name. Mocked here
// rather than wrapped in a real provider: these tests are about what the roster
// DOES, and `TeamContext.test.jsx` owns how a team is resolved.
const TEAM_ID = 'kkh-sport-exercise-medicine';
const TEAM_MEMBERS = [
    { uid: 'uid-brandon', displayName: 'Brandon' },
    { uid: 'uid-derlinder', displayName: 'Derlinder' },
    { uid: 'uid-fadzlynn', displayName: 'Fadzlynn' },
    { uid: 'uid-ying-xian', displayName: 'Ying Xian' },
];
// WHO HOLDS DUTIES, which is not the same question as `role` — a roster master
// configures the roster and is not in it. All four here are clinicians, matching the
// live staff pool.
//
// ⚠️ HOISTED, NOT COMPUTED INSIDE `useTeam`. RosterView's live effect depends on
//    `rosteredMembers`, so returning a fresh array from every call gives it a new
//    reference on every render — effect runs, setConfig, re-render, forever. The
//    real provider is safe because it builds this inside `useMemo`; a mock that
//    forgets to be stable HANGS the suite rather than failing it, which is a much
//    worse way to find out.
const TEAM_ROSTERED = TEAM_MEMBERS.filter((m) => m.rostered !== false);
const TEAM_UID_BY_NAME = Object.fromEntries(TEAM_MEMBERS.map((m) => [m.displayName, m.uid]));
vi.mock('../context/TeamContext', () => ({
    useTeam: () => ({
        teamId: TEAM_ID,
        members: TEAM_MEMBERS,
        rosteredMembers: TEAM_ROSTERED,
        memberUidByName: TEAM_UID_BY_NAME,
    }),
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

const BRANDON = { uid: 'uid-brandon', name: 'Brandon', role: 'staff', email: 'brandon@example.org' };
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

/**
 * RELABELLED (one-tap cover): the submit button said "Submit Request" / "Arrange
 * Cover" and now names the colleague — "Ask Derlinder to cover", or "Arrange cover
 * with Derlinder" on the admin on-behalf path. Same button, same handler, same
 * `addDoc`; only the words changed, so this helper matches the new wording. Every
 * assertion below is unmodified.
 */
const submitSwap = () => fireEvent.click(screen.getByRole('button', { name: /ask .+ to cover|arrange cover/i }));

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
        // CHANGED THREE TIMES, and the fixture never moved. It was a "Load example
        // department" button; then a picker of twelve per-department arrangements, whose
        // RESPIRATORY option held this same fixture by alias; and now a picker of a
        // PROFESSION and a SHAPE, where the same fixture is the openly fictional
        // 'marvel-worked-example' — the six invented per-profession arrangements were
        // deleted, and the one that was invented under the Respiratory name went back to
        // claiming nobody's service. Same twelve people, same six duties, same one
        // unstaffable slot, so the P8.3 claim this test exists for (branded UI, never a
        // native dialog) is untouched. Chosen by stable id, never by position or name.
        fireEvent.change(screen.getByLabelText(/shape to start from/i), { target: { value: 'marvel-worked-example' } });
        // RENAMED (language pass): the sandbox Generate button said "Generate Sandbox
        // Roster" and now says "Draft roster". Live mode's label is unchanged.
        fireEvent.click(screen.getByRole('button', { name: /^draft roster$/i }));

        // The flow really ran — the sandbox report is on screen.
        expect(screen.getByText(/could not be staffed/i)).toBeTruthy();
        expectNoNativeDialogs();
    });

    // 🧪 UPDATED for the grade-aware sandbox wizard: demo mode's two
    // comma-separated textareas are now a staff table and a task table, so the
    // duplicate name is typed into two ROWS rather than into one box. Live mode
    // still has the textareas — asserted in `RosterView.wizard.test.jsx`.
    //
    // The refusal also arrives EARLIER than it used to: the sandbox Generate
    // button is now gated by the engine's own `validateRosterV2Config`, so the
    // reason is on screen beside a disabled button instead of landing in a banner
    // once the click has happened. Either way the P8.3 claim this test exists for
    // is unchanged and still checked: it is branded UI, never a native dialog.
    it('reports an engine refusal in the branded wizard, not a native dialog', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        fireEvent.change(screen.getByLabelText('Staff row 1 name'), {
            target: { value: 'Sam Wilson' },
        });
        fireEvent.change(screen.getByLabelText('Staff row 2 name'), {
            target: { value: 'Sam Wilson' },
        });
        fireEvent.change(screen.getByLabelText('Task row 1 name'), {
            target: { value: 'Ward Round' },
        });

        // The engine's own wording, in the app's own markup.
        expect(screen.getAllByText(/appears twice in the staff pool/i).length).toBeGreaterThan(0);
        const generate = screen.getByRole('button', { name: /^draft roster$/i });
        expect(generate.disabled).toBe(true);

        fireEvent.click(generate);
        // Nothing was generated, and nothing was said in a native dialog.
        expect(screen.getByText(/no sandbox roster yet/i)).toBeTruthy();
        expectNoNativeDialogs();
    });

    it('submits a sandbox swap into an on-screen notice, and says nothing was sent', async () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        // CHANGED THREE TIMES, and the fixture never moved. It was a "Load example
        // department" button; then a picker of twelve per-department arrangements, whose
        // RESPIRATORY option held this same fixture by alias; and now a picker of a
        // PROFESSION and a SHAPE, where the same fixture is the openly fictional
        // 'marvel-worked-example' — the six invented per-profession arrangements were
        // deleted, and the one that was invented under the Respiratory name went back to
        // claiming nobody's service. Same twelve people, same six duties, same one
        // unstaffable slot, so the P8.3 claim this test exists for (branded UI, never a
        // native dialog) is untouched. Chosen by stable id, never by position or name.
        fireEvent.change(screen.getByLabelText(/shape to start from/i), { target: { value: 'marvel-worked-example' } });
        fireEvent.click(screen.getByRole('button', { name: /^draft roster$/i }));

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
    it('claims the setup was saved ONLY when something was actually written', async () => {
        // The integrity half of the banner. `settingsChanged` means a second Generate
        // that altered nothing writes nothing — and a banner that announced a save
        // anyway would be claiming an action that did not happen, which is the exact
        // failure mode this subsystem's post-mortem is named for. One boolean could
        // not express this: `settingsSaved` was `true` both when a write succeeded
        // and when there was nothing to write.
        vi.useFakeTimers();
        render(<RosterView user={BRANDON} />);

        const generateOnce = async () => {
            openConfigure();
            fireEvent.click(screen.getByRole('button', { name: /generate roster/i }));
            fireEvent.click(screen.getByRole('button', { name: /^ok$/i }));
            await act(async () => { await vi.advanceTimersByTimeAsync(0); });
        };

        // FIRST generation: the configuration is new, so it is written and announced.
        await generateOnce();
        expect(screen.getByText(/your department's setup is saved/i)).toBeTruthy();
        const settingsWrites = () => setDoc.mock.calls
            .map(([ref]) => ref.path)
            .filter((path) => path.endsWith('/settings/roster')).length;
        expect(settingsWrites()).toBe(1);

        // Let the banner clear, then generate again having changed NOTHING.
        await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
        await generateOnce();

        // The roster is still written — it is regenerated over itself — but the
        // configuration is not, and the banner must not say it was.
        expect(settingsWrites(), 'the unchanged configuration was written again').toBe(1);
        expect(screen.getByText(/roster saved/i)).toBeTruthy();
        expect(
            screen.queryByText(/your department's setup is saved/i),
            'the banner claimed a save on a generation that wrote nothing',
        ).toBeNull();

        vi.useRealTimers();
    });

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
        /**
         * ⚠️ TWO WRITES NOW, AND NAMED RATHER THAN COUNTED. Generating writes the
         *    roster AND the department's configuration (`R1`) — Generate is the
         *    moment a roster master commits to a configuration, so it is when the
         *    configuration is stored.
         *
         *    Asserted by PATH rather than as `toHaveBeenCalledTimes(2)`: a count
         *    says two writes happened and not which, so a third write introduced
         *    later could be absorbed by relaxing the number. These name the two
         *    documents that are allowed.
         */
        const written = setDoc.mock.calls.map(([ref]) => ref.path);
        expect(written, 'the roster was not written').toContain(`teams/${TEAM_ID}/rosters/2026`);
        expect(written, 'the configuration was not stored').toContain(`teams/${TEAM_ID}/settings/roster`);
        expect(written, 'an unexpected third document was written').toHaveLength(2);
        expect(screen.getByText(/roster saved/i)).toBeTruthy();

        /**
         * ⚠️ AND IT SAYS THE SETUP WAS KEPT. The configuration has been written on
         *    every Generate since `R1`, but the banner said nothing about it, so a
         *    roster master had no way to know and would reasonably assume they were
         *    retyping their department next time. The failure case had a sentence
         *    and the success case did not — the wrong way round, because the quiet
         *    outcome is the one nobody can verify for themselves.
         *
         *    Asserted on the same node as the roster sentence: two banners would be
         *    two things to dismiss, and the setup line is a clause of the outcome,
         *    not a second event.
         */
        expect(screen.getByText(/your department's setup is saved/i)).toBeTruthy();

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

    it('does not change the swap document, beyond the routing uid', async () => {
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
            // THE ONE ADDITION. `targetStaff` stays because the roster mutator
            // matches the day arrays on the NAME; `targetUid` is what the
            // recipient's listener queries, so a rename can no longer stop a
            // request from arriving. Written from the same pick, so they cannot
            // disagree with each other.
            targetUid: 'uid-derlinder',
            originalShiftDate: LIVE_DATE_KEY,
            originalTask: 'EFT',
            swapRole: 'lead',
            reason: '',
            status: 'PENDING',
            timestamp: 'mock-timestamp',
        });
    });
});
