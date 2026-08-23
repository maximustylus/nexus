/**
 * ==============================================================================
 * TEAM MEMBERS PANEL — the screen that replaced editing source and redeploying
 * ==============================================================================
 *
 * Onboarding one clinician used to mean editing `TEAM_DIRECTORY` in
 * `src/utils/index.js`, editing `directory()` and `directoryNames()` in
 * `firestore.rules`, and redeploying the rules. This screen is what replaced all of
 * that, and it is the second half of an onboarding story that had no second half
 * until `inviteMember` and `removeMember` were written.
 *
 * WHAT THIS SUITE IS FOR, AND WHAT IT IS NOT FOR. The authority on who may add whom
 * is `functions/teamMembership.test.js` — 69 tests against the server's own decision
 * module, which re-reads the caller's membership from the database and cannot be
 * lied to. This file tests the SCREEN: that a refusal is shown as a sentence rather
 * than swallowed, that the sandbox writes nothing, and that the two removals which
 * would leave a team with nobody able to administer it are explained before the
 * button rather than after the failure.
 *
 * ⚠️ SO THE REFUSALS ASSERTED HERE ARE NOT SECURITY. Hiding the form from a
 *    non-lead is presentation. Every assertion below about what is on screen is
 *    about whether a clinician can understand what happened.
 * ==============================================================================
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

vi.mock('../firebase', () => ({ db: {}, auth: {}, storage: {} }));

/**
 * One spy per callable, resolving whatever the test sets. `httpsCallable` is mocked
 * at the module boundary rather than the component being handed an injected client,
 * because the region-pinning in `call()` is part of what this file should not let
 * regress — every other call site in the app pins `us-central1`.
 */
const invited = vi.fn();
const removed = vi.fn();
let lastRegion;

vi.mock('firebase/functions', () => ({
    getFunctions: vi.fn((_app, region) => { lastRegion = region; return {}; }),
    httpsCallable: vi.fn((_functions, name) => (payload) => (
        name === 'inviteMember' ? invited(payload) : removed(payload)
    )),
}));

let demoMode = false;
vi.mock('../context/NexusContext', () => ({ useNexus: () => ({ isDemo: demoMode }) }));

const TEAM_ID = 'kkh-respiratory-therapy';
const OWNER = { uid: 'leadUid0000000000000000000aa', displayName: 'Nur', role: 'lead' };
const STAFF = { uid: 'staffUid000000000000000000cc', displayName: 'Brandon', role: 'staff' };

let team;
vi.mock('../context/TeamContext', () => ({
    useTeam: () => team,
}));

import TeamMembersPanel from './TeamMembersPanel';

const asTeam = (over = {}) => ({
    teamId: TEAM_ID,
    team: { name: 'Respiratory Therapy', institution: 'KKH', leadUid: OWNER.uid },
    members: [OWNER, STAFF],
    isLead: true,
    ...over,
});

const ok = (data = {}) => Promise.resolve({ data: { success: true, ...data } });
const refused = (message, reason = 'no-account') =>
    Promise.resolve({ data: { success: false, reason, message } });

const fill = ({ email, name } = {}) => {
    if (email !== undefined) fireEvent.change(screen.getByPlaceholderText(/colleague@/i), { target: { value: email } });
    if (name !== undefined) fireEvent.change(screen.getByPlaceholderText(/how the roster/i), { target: { value: name } });
};

const submit = async () => {
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /add to team/i }));
    });
};

beforeEach(() => {
    demoMode = false;
    team = asTeam();
    invited.mockReset().mockReturnValue(ok({ alreadyMember: false, uid: 'newUid' }));
    removed.mockReset().mockReturnValue(ok({ alreadyGone: false }));
    lastRegion = undefined;
});

afterEach(() => cleanup());

// ── 1. ADDING ────────────────────────────────────────────────────────────────

describe('adding a colleague', () => {
    it('sends the team, the address and the role the lead chose', async () => {
        render(<TeamMembersPanel />);
        fill({ email: ' Brandon@KKH.com.sg ', name: 'Brandon' });
        await submit();

        expect(invited).toHaveBeenCalledTimes(1);
        expect(invited.mock.calls[0][0]).toMatchObject({
            teamId: TEAM_ID,
            email: 'Brandon@KKH.com.sg',   // trimmed here, lower-cased on the server
            displayName: 'Brandon',
            role: 'staff',
            rostered: true,
        });
    });

    it('pins the functions region, like every other call site', async () => {
        render(<TeamMembersPanel />);
        fill({ email: 'a@kkh.com.sg' });
        await submit();
        expect(lastRegion).toBe('us-central1');
    });

    it('does not call at all when no address was typed', async () => {
        render(<TeamMembersPanel />);
        await submit();
        expect(invited).not.toHaveBeenCalled();
        expect(screen.getByRole('alert').textContent).toMatch(/which email/i);
    });

    it('clears the form after a success, so the next colleague starts clean', async () => {
        render(<TeamMembersPanel />);
        fill({ email: 'a@kkh.com.sg', name: 'Ada' });
        await submit();
        expect(screen.getByPlaceholderText(/colleague@/i).value).toBe('');
        expect(screen.getByPlaceholderText(/how the roster/i).value).toBe('');
    });

    /**
     * ⚠️ THE REFUSAL PATH IS THE ONE THAT MATTERS. "They have not registered yet"
     *    comes back as `{ success: false }` on a 200, not as a thrown error — so a
     *    screen that only caught exceptions would report SUCCESS for every one of
     *    them and the lead would sit waiting for a colleague who was never added.
     */
    it('shows a server refusal as a sentence instead of reporting success', async () => {
        invited.mockReturnValue(refused('There is no NEXUS account for a@kkh.com.sg yet. Ask them to register first.'));
        render(<TeamMembersPanel />);
        fill({ email: 'a@kkh.com.sg' });
        await submit();

        expect(screen.getByRole('alert').textContent).toMatch(/register first/i);
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('leaves the form filled in after a refusal, so it can be corrected', async () => {
        invited.mockReturnValue(refused('Not a registered domain.', 'domain-not-allowed'));
        render(<TeamMembersPanel />);
        fill({ email: 'a@gmail.com', name: 'Ada' });
        await submit();
        expect(screen.getByPlaceholderText(/colleague@/i).value).toBe('a@gmail.com');
    });

    it('reports a thrown error too, rather than hanging on the spinner', async () => {
        invited.mockReturnValue(Promise.reject(new Error('internal')));
        render(<TeamMembersPanel />);
        fill({ email: 'a@kkh.com.sg' });
        await submit();
        expect(screen.getByRole('alert').textContent).toContain('internal');
        expect(screen.getByRole('button', { name: /add to team/i }).disabled).toBe(false);
    });

    it('treats "already a member" as the success it is', async () => {
        invited.mockReturnValue(ok({ alreadyMember: true, message: 'Brandon is already in this team. Nothing was changed.' }));
        render(<TeamMembersPanel />);
        fill({ email: 'brandon@kkh.com.sg' });
        await submit();
        expect(screen.getByRole('status').textContent).toMatch(/already in this team/i);
        expect(screen.queryByRole('alert')).toBeNull();
    });
});

// ── 2. ROLE AND ROSTERED ARE TWO QUESTIONS ───────────────────────────────────

describe('role and rostered', () => {
    it('sends the chosen role', async () => {
        render(<TeamMembersPanel />);
        fill({ email: 'a@kkh.com.sg' });
        fireEvent.click(screen.getByRole('radio', { name: /lead/i }));
        await submit();
        expect(invited.mock.calls[0][0].role).toBe('lead');
    });

    /**
     * A ROSTER MASTER IS A LEAD WHO HOLDS NO DUTIES. If `role` decided `rostered`,
     * she would be handed clinical shifts she does not work — the modelling error
     * `TeamContext` documents at length. The form has to be able to say both.
     */
    it('lets a lead be added without clinical duties', async () => {
        render(<TeamMembersPanel />);
        fill({ email: 'nisa@kkh.com.sg' });
        fireEvent.click(screen.getByRole('radio', { name: /lead/i }));
        fireEvent.click(screen.getByRole('checkbox'));
        await submit();
        expect(invited.mock.calls[0][0]).toMatchObject({ role: 'lead', rostered: false });
    });

    /**
     * The server forces a viewer out of the staff pool whatever this form sends, so
     * offering the choice would be offering something that gets overruled.
     */
    it('takes the rostered control away for a viewer rather than lying about it', async () => {
        render(<TeamMembersPanel />);
        expect(screen.getByRole('checkbox')).toBeTruthy();
        fireEvent.click(screen.getByRole('radio', { name: /viewer/i }));
        expect(screen.queryByRole('checkbox')).toBeNull();
    });
});

// ── 3. REMOVING, AND THE TEAM NOBODY CAN ADMINISTER ──────────────────────────

describe('removing somebody', () => {
    it('sends the uid, never the display name', async () => {
        render(<TeamMembersPanel />);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /remove brandon/i }));
        });
        expect(removed).toHaveBeenCalledWith({ teamId: TEAM_ID, uid: STAFF.uid });
    });

    /**
     * ⚠️ BOTH OF THESE WOULD PRODUCE A TEAM WITH NO ADMINISTRATOR, and there is no
     *    repair path inside the app — every screen that could fix it needs a lead.
     *    The server refuses both; this asserts the lead is told BEFORE clicking,
     *    because a button that always fails is worse than no button.
     */
    it('offers no remove button for the lead the team was created for', () => {
        render(<TeamMembersPanel />);
        expect(screen.queryByRole('button', { name: /remove nur/i })).toBeNull();
        expect(screen.getByText(/team was created for/i)).toBeTruthy();
    });

    it('offers no remove button for the only lead', () => {
        const deputy = { uid: 'deputy000000000000000000000d', displayName: 'Deputy', role: 'lead' };
        team = asTeam({
            team: { name: 'RT', institution: 'KKH', leadUid: 'somebody-else' },
            members: [deputy, STAFF],
        });
        render(<TeamMembersPanel />);
        expect(screen.queryByRole('button', { name: /remove deputy/i })).toBeNull();
        expect(screen.getByText(/only lead/i)).toBeTruthy();
    });

    it('does offer it once a second lead exists', () => {
        const deputy = { uid: 'deputy000000000000000000000d', displayName: 'Deputy', role: 'lead' };
        team = asTeam({
            team: { name: 'RT', institution: 'KKH', leadUid: 'somebody-else' },
            members: [OWNER, deputy, STAFF],
        });
        render(<TeamMembersPanel />);
        expect(screen.getByRole('button', { name: /remove deputy/i })).toBeTruthy();
    });

    it('shows a server refusal rather than claiming the removal happened', async () => {
        removed.mockReturnValue(refused('That is the team\'s only lead.', 'last-lead'));
        render(<TeamMembersPanel />);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /remove brandon/i }));
        });
        expect(screen.getByRole('alert').textContent).toMatch(/only lead/i);
        expect(screen.queryByRole('status')).toBeNull();
    });
});

// ── 4. WHO SEES THE FORM ─────────────────────────────────────────────────────

describe('a member who is not a lead', () => {
    beforeEach(() => { team = asTeam({ isLead: false }); });

    it('sees the list', () => {
        render(<TeamMembersPanel />);
        expect(screen.getByText('Brandon')).toBeTruthy();
    });

    it('sees no add form and no remove buttons', () => {
        render(<TeamMembersPanel />);
        expect(screen.queryByRole('button', { name: /add to team/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /remove/i })).toBeNull();
        expect(screen.getByText(/only a lead of this team/i)).toBeTruthy();
    });
});

// ── 5. THE SANDBOX WRITES NOTHING ────────────────────────────────────────────

describe('the sandbox', () => {
    /**
     * The demo team is not a real team. Every other write in the app is fenced by
     * `isDemo`, and this one is fenced BEFORE the `teamId` check for the same reason
     * as the rest: in demo mode the sandbox is the reason for the refusal, and "no
     * team selected" would be the wrong sentence for somebody who has one.
     */
    it('refuses to add anybody, and says the sandbox is why', async () => {
        demoMode = true;
        render(<TeamMembersPanel />);
        fill({ email: 'a@kkh.com.sg' });
        await submit();
        expect(invited).not.toHaveBeenCalled();
        expect(screen.getByRole('alert').textContent).toMatch(/sandbox/i);
    });

    it('refuses to remove anybody', async () => {
        demoMode = true;
        render(<TeamMembersPanel />);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /remove brandon/i }));
        });
        expect(removed).not.toHaveBeenCalled();
        expect(screen.getByRole('alert').textContent).toMatch(/sandbox/i);
    });

    /**
     * The signed-in-with-no-team case the holding screen's sandbox door creates.
     * `teamId` is null and demo mode is OFF only if they toggled back — either way
     * nothing may be composed from a null id.
     */
    it('refuses when there is no team, naming that rather than the sandbox', async () => {
        team = asTeam({ teamId: null, team: null, members: [], isLead: false });
        render(<TeamMembersPanel />);
        expect(screen.queryByRole('button', { name: /add to team/i })).toBeNull();
        expect(screen.getByText(/only a lead of this team/i)).toBeTruthy();
    });
});
