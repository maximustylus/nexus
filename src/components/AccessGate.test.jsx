/**
 * ==============================================================================
 * ACCESS GATE — RENDER TESTS
 * ==============================================================================
 * Runner: Vitest + Testing Library.  Run: npm test
 *
 * The value of this screen is entirely in WHAT IT SAYS, so that is what is asserted.
 * A holding screen that renders beautifully and does not name who moves next is the
 * failure being prevented here — it is the difference between "I'll hear back" and
 * "this is broken, I'll email the developer".
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import AccessGate from './AccessGate';
import { MOH_PROFESSION_OPTIONS } from '../data/mockData';
import {
    ACCESS_UNVERIFIED,
    ACCESS_PENDING_LEAD,
    ACCESS_DECLINED,
    ACCESS_AWAITING_INVITE,
} from '../utils/accessPolicy';

// This repo does not enable Testing Library's global auto-cleanup — the other
// component suites unmount by hand, so this one does too. Without it every render
// stacks in the same document and `getByText` reports "multiple elements found",
// which reads like a component bug rather than a harness one.
afterEach(cleanup);

const WAITING_STATES = [
    ACCESS_UNVERIFIED,
    ACCESS_PENDING_LEAD,
    ACCESS_DECLINED,
    ACCESS_AWAITING_INVITE,
];

describe('AccessGate — every waiting state says who moves next', () => {
    it.each(WAITING_STATES)('%s names a next actor rather than leaving the person to guess', (state) => {
        render(<AccessGate state={state} />);
        const next = screen.getByText(/moves next|check your inbox|Ask your/i);
        expect(next).toBeTruthy();
    });

    it('tells an unverified account why it is being held, not just that it is', () => {
        render(<AccessGate state={ACCESS_UNVERIFIED} />);
        expect(screen.getByText(/Confirm your email/i)).toBeTruthy();
        expect(screen.getByText(/clinical rosters/i)).toBeTruthy();
    });

    /**
     * THE COMMON CASE ON DAY ONE, and the one the old app answered with an empty
     * roster. The promise that matters is that there is nothing for them to do.
     */
    it('tells a registered-but-uninvited person their account is fine and who to ask', () => {
        render(<AccessGate state={ACCESS_AWAITING_INVITE} />);
        expect(screen.getByText(/nothing to set up/i)).toBeTruthy();
        // ⚠️ THIS LINE USED TO END "…to invite you. They can do it themselves." and
        //    that was not true: `allow create: if false` on member documents, and the
        //    Cloud Function the rules point at does not exist yet, so a lead CANNOT
        //    add anybody. The screen was promising a capability the product does not
        //    have, to the person least able to work around it.
        expect(screen.getByText(/roster master to add you/i)).toBeTruthy();
    });

    it('tells a waiting lead what they get once approved, so the wait has a point', () => {
        render(<AccessGate state={ACCESS_PENDING_LEAD} />);
        expect(screen.getByText(/invite and remove\s+your own staff/i)).toBeTruthy();
        expect(screen.getByText(/An administrator moves next/i)).toBeTruthy();
    });

    it('gives a declined lead a route forward instead of a dead end', () => {
        render(<AccessGate state={ACCESS_DECLINED} />);
        expect(screen.getByText(/already exists on NEXUS/i)).toBeTruthy();
    });
});

describe('AccessGate — the controls', () => {
    it('renders no buttons when no handlers are given, rather than dead ones', () => {
        render(<AccessGate state={ACCESS_AWAITING_INVITE} />);
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('wires check-again and sign-out', () => {
        const onRetry = vi.fn();
        const onSignOut = vi.fn();
        render(<AccessGate state={ACCESS_PENDING_LEAD} onRetry={onRetry} onSignOut={onSignOut} />);

        fireEvent.click(screen.getByRole('button', { name: /check again/i }));
        fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(onSignOut).toHaveBeenCalledTimes(1);
    });

    it('shows which account is signed in, because the usual cause is the wrong one', () => {
        render(<AccessGate state={ACCESS_AWAITING_INVITE} email="lead.rt@kkh.com.sg" />);
        expect(screen.getByText(/lead\.rt@kkh\.com\.sg/)).toBeTruthy();
    });

    /**
     * An unrecognised state must still render something useful. Rendering nothing —
     * a blank white screen on a signed-in account — is the worst available outcome
     * and the easy one to write.
     */
    it('falls back to a real screen for an unknown state instead of rendering blank', () => {
        render(<AccessGate state="something-nobody-wrote-yet" />);
        expect(screen.getByText(/Nobody has added you to a team yet/i)).toBeTruthy();
    });
});

describe('⚠️ the gate is a door, not a wall', () => {
    /**
     * THE POINT OF THIS SUITE. Before these, every waiting state offered exactly two
     * actions — "Check again" and "Sign out" — so somebody told to try NEXUS signed
     * in, read a sentence, and signed out. For a department-wide announcement that
     * is what most recipients would have got.
     */
    it.each([
        ['unverified', ACCESS_UNVERIFIED],
        ['pending lead', ACCESS_PENDING_LEAD],
        ['declined', ACCESS_DECLINED],
        ['awaiting invite', ACCESS_AWAITING_INVITE],
    ])('offers the sandbox from the %s state', (_label, state) => {
        const onExploreSandbox = vi.fn();
        render(<AccessGate state={state} onExploreSandbox={onExploreSandbox} />);
        fireEvent.click(screen.getByRole('button', { name: /explore the sandbox/i }));
        expect(onExploreSandbox).toHaveBeenCalledTimes(1);
    });

    /**
     * The sandbox is a fictional department. Somebody arriving from a holding screen
     * has every reason to read "I'm in now" — so the offer says what it is before
     * they click, not after.
     */
    it('says the sandbox is not real before it is entered', () => {
        render(<AccessGate state={ACCESS_AWAITING_INVITE} onExploreSandbox={vi.fn()} />);
        expect(screen.getByText(/made-up department/i)).toBeTruthy();
        expect(screen.getByText(/nothing you do there is saved/i)).toBeTruthy();
    });

    it('renders no sandbox offer when the parent gives no handler, rather than a dead button', () => {
        render(<AccessGate state={ACCESS_AWAITING_INVITE} />);
        expect(screen.queryByRole('button', { name: /explore the sandbox/i })).toBeNull();
    });
});

describe('⚠️ declaring as a lead after registering', () => {
    /**
     * THE GAP THIS CLOSES. `lead_requests/{uid}` was written in exactly one place —
     * inside WelcomeScreen's sign-up handler, behind `if (declaring)`. Somebody who
     * registered without ticking that box and turned out to run a department had no
     * route to say so, ever: registering again fails with `auth/email-already-in-use`.
     * For an announcement aimed at department leads, that is the single most likely
     * person to land on this screen.
     */
    it('offers the declaration only from awaiting-invite', () => {
        const onDeclareLead = vi.fn();
        render(<AccessGate state={ACCESS_AWAITING_INVITE} onDeclareLead={onDeclareLead} />);
        expect(screen.getByRole('button', { name: /i run a department/i })).toBeTruthy();
    });

    /**
     * ⚠️ NOT FROM `declined`. The rules say `allow update: if false` on
     *    lead_requests, so a second attempt would be refused by the server while the
     *    screen said it worked. Whether a decline can be re-declared is a decision
     *    about what a decline means; it is not this component's to make.
     */
    it.each([
        ['declined', ACCESS_DECLINED],
        ['pending lead', ACCESS_PENDING_LEAD],
        ['unverified', ACCESS_UNVERIFIED],
    ])('does not offer it from the %s state', (_label, state) => {
        render(<AccessGate state={state} onDeclareLead={vi.fn()} />);
        expect(screen.queryByRole('button', { name: /i run a department/i })).toBeNull();
    });

    it('refuses to send an incomplete declaration, and says which field', () => {
        const onDeclareLead = vi.fn();
        render(<AccessGate state={ACCESS_AWAITING_INVITE} onDeclareLead={onDeclareLead} />);
        fireEvent.click(screen.getByRole('button', { name: /i run a department/i }));
        fireEvent.click(screen.getByRole('button', { name: /send request/i }));
        expect(onDeclareLead, 'an empty declaration was sent').not.toHaveBeenCalled();
        expect(screen.getByLabelText('Institution')).toBeTruthy();
    });

    it('sends what was typed, and confirms who moves next', async () => {
        const onDeclareLead = vi.fn().mockResolvedValue(undefined);
        render(<AccessGate state={ACCESS_AWAITING_INVITE} onDeclareLead={onDeclareLead} />);
        fireEvent.click(screen.getByRole('button', { name: /i run a department/i }));

        fireEvent.change(screen.getByLabelText('Institution'), { target: { value: 'KKH' } });
        fireEvent.change(screen.getByLabelText('Department or service'), { target: { value: 'Respiratory Therapy' } });
        fireEvent.change(screen.getByLabelText('Profession'), { target: { value: MOH_PROFESSION_OPTIONS.flatMap(e => (e.kind === 'group' ? e.options : [e]))[0].id } });
        fireEvent.click(screen.getByRole('button', { name: /send request/i }));

        await waitFor(() => expect(onDeclareLead).toHaveBeenCalledTimes(1));
        expect(onDeclareLead.mock.calls[0][0]).toMatchObject({
            institution: 'KKH', department: 'Respiratory Therapy',
        });
        await waitFor(() => expect(screen.getByText(/administrator reviews it/i)).toBeTruthy());
    });

    /**
     * The likeliest failure is a rules refusal — a department name carrying a
     * character the team id cannot hold. "Something went wrong" would send somebody
     * to IT over a full stop.
     */
    it('shows why the write failed rather than a generic apology', async () => {
        const onDeclareLead = vi.fn().mockRejectedValue(new Error('Missing or insufficient permissions.'));
        render(<AccessGate state={ACCESS_AWAITING_INVITE} onDeclareLead={onDeclareLead} />);
        fireEvent.click(screen.getByRole('button', { name: /i run a department/i }));
        fireEvent.change(screen.getByLabelText('Institution'), { target: { value: 'KKH' } });
        fireEvent.change(screen.getByLabelText('Department or service'), { target: { value: 'Physiotherapy' } });
        fireEvent.change(screen.getByLabelText('Profession'), { target: { value: MOH_PROFESSION_OPTIONS.flatMap(e => (e.kind === 'group' ? e.options : [e]))[0].id } });
        fireEvent.click(screen.getByRole('button', { name: /send request/i }));

        await waitFor(() => expect(screen.getByText(/insufficient permissions/i)).toBeTruthy());
    });
});
