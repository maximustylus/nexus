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

/**
 * The callable is captured rather than anonymous, so the PAYLOAD can be asserted —
 * `AN2`/`AN3` are about what is sent, not about what comes back.
 */
const analysisSpy = vi.fn(() => Promise.resolve({
    data: { private: 'LIVE private brief', public: 'LIVE team pulse' },
}));
vi.mock('firebase/functions', () => ({
    getFunctions: vi.fn(() => ({})),
    httpsCallable: vi.fn(() => (...args) => analysisSpy(...args)),
}));

let demoMode = true;
vi.mock('../context/NexusContext', () => ({ useNexus: () => ({ isDemo: demoMode }) }));

let activeTeamId = 'kkh-sport-exercise-medicine';
/**
 * ⚠️ `isLead` AND `members` ARE NOW LOAD-BEARING, AND THIS MOCK DID NOT CARRY THEM.
 *
 *    `AN4` made `generateSmartAnalysis` refuse a caller whose membership role is not
 *    `'lead'`, and `SmartAnalysis` now checks the same thing client-side so the
 *    refusal is a sentence rather than a `permission-denied` mid-demo. `AN2` made the
 *    profile payload come from the team's own `members` instead of a hardcoded array
 *    of six named colleagues.
 *
 *    With the old mock this suite's live-mode test could no longer reach GENERATE, so
 *    the Publish button never rendered. That is the mock being stale, not the guard
 *    being wrong — but it is worth stating, because a mock that quietly grants a
 *    permission the real context would refuse is how a test starts proving nothing.
 */
let activeIsLead = true;
vi.mock('../context/TeamContext', () => ({
    useTeam: () => ({
        teamId: activeTeamId,
        team: { name: 'Respiratory Therapy, KKH' },
        members: [
            { uid: 'u1', displayName: 'A. Clinician', title: 'Physiotherapist', rostered: true },
            { uid: 'u2', displayName: 'B. Clinician', title: 'Physiotherapist', rostered: true },
        ],
        isLead: activeIsLead,
    }),
}));
vi.mock('../hooks/useTeamGrades', () => ({
    useTeamGrades: () => ({ grades: {}, loading: false, denied: false }),
}));

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
    activeIsLead = true;
    analysisSpy.mockClear();
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

// ── AN2 / AN3 / AN4, added 2026-08-23 ─────────────────────────────────────

describe('AN2 — the analysis is generated over the TEAM\'s own people', () => {
    /**
     * ⚠️ IT WAS GENERATED OVER SIX HARDCODED NAMED COLLEAGUES, FOR EVERY TEAM.
     *    `const currentProfiles = STAFF_PROFILES` — Alif, Fadzlynn, Derlinder,
     *    Ying Xian, Brandon, Nisa, with their job grades — so a Respiratory Therapy
     *    lead's year-end report named another department's staff, and
     *    `handlePublish` archived it to THEIR `reports/{year}`, readable by every
     *    member of their team. A cross-tenant disclosure by construction.
     */
    it('sends the team\'s own members, and none of the old hardcoded names', async () => {
        demoMode = false;
        activeTeamId = 'kkh-respiratory-therapy';
        renderPanel();
        await generate();

        const payload = analysisSpy.mock.calls[0][0];
        expect(payload.staffProfiles.map((p) => p.name)).toEqual(['A. Clinician', 'B. Clinician']);

        const serialised = JSON.stringify(payload);
        ['Fadzlynn', 'Derlinder', 'Ying Xian', 'Nisa', 'Brandon'].forEach((n) => {
            expect(serialised, `${n} must not reach the model`).not.toContain(n);
        });
    });

    /**
     * ⚠️ THE BAND, NEVER THE GRADE. A like-for-like replacement would have put
     *    `AH14` into a payload that goes to Gemini — the same disclosure the grade
     *    privacy model exists to prevent, through a different door.
     */
    it('never puts a raw job grade in the payload', async () => {
        demoMode = false;
        renderPanel();
        await generate();
        expect(JSON.stringify(analysisSpy.mock.calls[0][0])).not.toMatch(/\b(AH|JG)\d{1,2}\b/);
    });

    /** `AN3` — the team name was the literal string "SSMC@KKH CEP Team", for everyone. */
    it('sends the real team name and the teamId the server authorises against', async () => {
        demoMode = false;
        activeTeamId = 'kkh-respiratory-therapy';
        renderPanel();
        await generate();

        const payload = analysisSpy.mock.calls[0][0];
        expect(payload.teamName).toBe('Respiratory Therapy, KKH');
        expect(payload.teamId).toBe('kkh-respiratory-therapy');
        expect(payload.teamName).not.toMatch(/SSMC/);
    });
});

describe('AN4 — a non-lead is refused before the callable, not by it', () => {
    /**
     * `hasAdminAccess` (`App.jsx:459`) is `isDemo || isLead || ADMIN_EMAILS.includes(email)
     * || user?.role === 'admin'` — four disjuncts, three of which are true for people
     * whose MEMBERSHIP role is not `'lead'`, including the two legacy admin addresses.
     * Without this check such a person reaches GENERATE and gets `permission-denied`
     * back from the server, in front of whoever is watching.
     */
    it('does not call the function at all', async () => {
        demoMode = false;
        activeIsLead = false;
        renderPanel();

        fireEvent.click(screen.getByRole('button', { name: /generate 2026 report/i }));
        await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

        expect(analysisSpy).not.toHaveBeenCalled();
        expect(screen.getByText(/not lead|team lead/i)).toBeTruthy();
    });
});
