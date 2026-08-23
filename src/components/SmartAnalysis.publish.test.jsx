/**
 * ==============================================================================
 * SMART ANALYSIS — the sandbox must not overwrite the real year-end report
 * ==============================================================================
 *
 * `handleAnalyze` returns a HARDCODED report in demo mode: Peter's burnout risk,
 * Steve's Shield Integration, Charles's Mutant Genome grant. That is deliberate —
 * the sandbox must not call Google Cloud. What was NOT deliberate is that
 * `handlePublish` had no matching guard, so the PUBLISH button under that
 * fabricated report wrote it into `teams/{teamId}/reports/{year}` and overwrote
 * every `projects/{year}/staff/{uid}` document with the demo team's data. It then
 * alerted SUCCESS.
 *
 * Every other write in this app is fenced by `if (isDemo)`. This suite pins the
 * one that was missing, from both directions — refusing in demo is only half the
 * property; still archiving in live mode is the other half, and a guard that
 * broke the real feature would be a worse bug than the one it fixed.
 *
 * It matters more since the holding screen gained a sandbox door: demo mode used
 * to be reachable only signed-out or by a member of the legacy directory, and now
 * any signed-in user waiting to be added to a team can enter it.
 * ==============================================================================
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

vi.mock('../firebase', () => ({ db: {} }));

const setDoc = vi.fn(() => Promise.resolve());
vi.mock('firebase/firestore', () => ({
    doc: vi.fn((_db, ...segments) => ({ path: segments.join('/') })),
    setDoc: (...args) => setDoc(...args),
}));

vi.mock('firebase/functions', () => ({
    getFunctions: vi.fn(() => ({})),
    httpsCallable: vi.fn(() => vi.fn(() => Promise.resolve({
        data: { private: 'LIVE private brief', public: 'LIVE team pulse' },
    }))),
}));

let demoMode = true;
vi.mock('../context/NexusContext', () => ({ useNexus: () => ({ isDemo: demoMode }) }));

let activeTeamId = 'kkh-sport-exercise-medicine';
vi.mock('../context/TeamContext', () => ({ useTeam: () => ({ teamId: activeTeamId }) }));

import SmartAnalysis from './SmartAnalysis';

/** The dashboard's shape: `id` is the uid the archive is keyed by. */
const TEAM_DATA = [
    { id: 'uid-alif', staff_name: 'Alif', projects: [{ name: 'Roster rebuild', year: '2026' }] },
];

const alerts = [];

const renderPanel = () => render(
    <SmartAnalysis teamData={TEAM_DATA} staffLoads={{}} onClose={() => {}} />,
);

/**
 * Drive the generate step to completion so the PUBLISH button exists.
 *
 * Fake timers rather than a real 2.5s wait, and NO `waitFor`: that helper polls on
 * real timers, which never advance here, so it hangs until the suite times out.
 * `advanceTimersByTimeAsync` inside `act` both fires the sleep and flushes the
 * promise chain behind it, which is all this needs.
 */
const generate = async () => {
    fireEvent.click(screen.getByRole('button', { name: /generate 2026 report/i }));
    // The demo branch sleeps 2.5s to "feel real"; the live branch resolves at once.
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByRole('button', { name: /publish to 2026 archive/i })).toBeTruthy();
};

beforeEach(() => {
    vi.useFakeTimers();
    setDoc.mockClear();
    alerts.length = 0;
    vi.spyOn(window, 'alert').mockImplementation((message) => { alerts.push(String(message)); });
    demoMode = true;
    activeTeamId = 'kkh-sport-exercise-medicine';
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    cleanup();
});

describe('SmartAnalysis — publishing from the sandbox', () => {
    it('writes NOTHING when demo mode is on, even though the team is real', async () => {
        renderPanel();
        await generate();

        // Sanity: this really is the fabricated report, not a live one. Both the
        // private brief and the public pulse mention Shield Integration, so this
        // asks for all of them rather than assuming one.
        expect(screen.getAllByText(/Shield Integration/).length).toBeGreaterThan(0);
        expect(screen.getByText(/scope creep and burnout risk/).textContent).toContain('Peter');

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /publish to 2026 archive/i }));
        });

        // THE ASSERTION. Not "setDoc was called with something harmless" — not
        // called at all. A demo report reaching Firestore under any shape is the
        // failure.
        expect(setDoc).not.toHaveBeenCalled();
    });

    it('says the sandbox is why, rather than reporting SUCCESS', async () => {
        renderPanel();
        await generate();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /publish to 2026 archive/i }));
        });

        expect(alerts).toHaveLength(1);
        expect(alerts[0]).toMatch(/sandbox/i);
        // The old behaviour's alert. If this ever matches again the guard is gone.
        expect(alerts[0]).not.toMatch(/^SUCCESS/);
    });

    it('refuses for the sandbox reason when the user has no team either', async () => {
        // The case the holding screen's sandbox door creates: signed in, waiting to
        // be added, exploring. "No team selected" would be a true sentence and the
        // wrong one — nothing is broken about their account.
        activeTeamId = null;
        renderPanel();
        await generate();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /publish to 2026 archive/i }));
        });

        expect(setDoc).not.toHaveBeenCalled();
        expect(alerts[0]).toMatch(/sandbox/i);
        expect(alerts[0]).not.toMatch(/no team selected/i);
    });

    it('STILL ARCHIVES in live mode — the guard must not break the real feature', async () => {
        demoMode = false;
        renderPanel();
        await generate();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /publish to 2026 archive/i }));
        });

        await act(async () => { await vi.advanceTimersByTimeAsync(0); });
        expect(setDoc).toHaveBeenCalled();
        const paths = setDoc.mock.calls.map(([ref]) => ref.path);
        expect(paths).toContain('teams/kkh-sport-exercise-medicine/reports/2026');
        expect(paths).toContain('teams/kkh-sport-exercise-medicine/projects/2026/staff/uid-alif');
        expect(alerts.join(' ')).toMatch(/SUCCESS/);
    });
});
