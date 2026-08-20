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
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import AccessGate from './AccessGate';
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
        expect(screen.getByText(/roster master to invite you/i)).toBeTruthy();
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
