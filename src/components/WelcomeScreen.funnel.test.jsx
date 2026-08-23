/**
 * ==============================================================================
 * THE FRONT DOOR — where a department head actually lands
 * ==============================================================================
 *
 * This suite exists because of a routing defect nobody would have found by
 * testing a feature: every feature worked, and the person most likely to need
 * them was steered away from all of them.
 *
 * The sign-in screen offered two choices:
 *
 *     "New Practitioner? Request Access"     reads as: for individual staff
 *     "🌐 Enterprise / Scale Unit"           reads as: for setting up a department
 *
 * An allied health manager IS the second. They click the second. It opened a
 * panel whose only button was DISABLED and read "Registration Restricted —
 * Contact Admin for whitelisting", while the path they wanted sat behind the
 * FIRST button, one role dropdown down.
 *
 * ⚠️ AND THAT PANEL WAS ONCE HONEST, WHICH IS WHY IT SURVIVED. Multi-tenancy did
 *    not exist when it was written, so "registration restricted" was simply true.
 *    It became false at v2.0.0 and nothing failed, because a disabled button is
 *    not a bug — it is a button doing exactly what it says.
 *
 * The audience for this screen is the one Vincent's email reaches. These tests
 * pin the funnel rather than the feature.
 * ==============================================================================
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../firebase', () => ({ db: {}, auth: {}, storage: {} }));
vi.mock('firebase/firestore', () => ({
    doc: vi.fn(() => ({})),
    setDoc: vi.fn(() => Promise.resolve()),
    getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
}));
vi.mock('firebase/auth', () => ({
    signInWithEmailAndPassword: vi.fn(),
    createUserWithEmailAndPassword: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    sendEmailVerification: vi.fn(),
    updateProfile: vi.fn(),
    getAuth: vi.fn(() => ({})),
}));
vi.mock('../context/NexusContext', () => ({
    useNexus: () => ({ isDemo: false, toggleDemo: vi.fn() }),
}));
vi.mock('../hooks/useDomainAllowlist', () => ({
    useDomainAllowlist: () => ({ domains: ['kkh.com.sg'], loaded: true }),
    default: () => ({ domains: ['kkh.com.sg'], loaded: true }),
}));

// jsdom has no `matchMedia`, and the theme hook this screen mounts reads it.
// Stubbed to "no preference expressed", which is the default a browser reports
// when the OS has not chosen — the light theme, and the one the screenshots use.
if (!window.matchMedia) {
    window.matchMedia = (query) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
    });
}

import WelcomeScreen from './WelcomeScreen';

const openProfessionals = () => {
    const tab = screen.queryByRole('button', { name: /professional/i });
    if (tab) fireEvent.click(tab);
};

const departmentButton = () => screen.getByRole('button', { name: /i run a department/i });

// `WelcomeScreen` calls `useNavigate` — the public portal and the staff app share
// this screen — so it needs a router around it. `MemoryRouter` rather than a real
// one: this file is about which control leads where inside the screen, not about
// the URL it eventually pushes.
beforeEach(() => {
    render(<MemoryRouter><WelcomeScreen /></MemoryRouter>);
    openProfessionals();
});
afterEach(() => cleanup());

describe('the route a department head takes', () => {
    /**
     * The label is part of the fix, not decoration. "Enterprise / Scale Unit" is
     * vendor language; nobody running a physiotherapy department thinks of
     * themselves as a scale unit, and the words decide whether they click at all.
     */
    it('offers setting up a department in the words a department head uses', () => {
        expect(departmentButton()).toBeTruthy();
        expect(screen.queryByText(/scale unit/i), 'the vendor wording is back').toBeNull();
        expect(screen.queryByText(/enterprise/i)).toBeNull();
    });

    /**
     * ⚠️ THE DEAD END ITSELF. A permanently disabled button is not a bug — it is a
     *    button doing what it says — so nothing would ever fail because of it.
     *    This is the assertion that would.
     */
    it('has no "Registration Restricted" wall anywhere on the screen', () => {
        fireEvent.click(departmentButton());
        expect(screen.queryByText(/registration restricted/i)).toBeNull();
        expect(screen.queryByText(/contact admin for whitelisting/i)).toBeNull();
    });

    /**
     * The whole point: the button lands on the working path, with the lead role
     * already chosen, so the declaration fields are on screen rather than one
     * unmarked dropdown change away.
     */
    it('lands on registration with the lead declaration already open', () => {
        fireEvent.click(departmentButton());

        const roleSelect = screen.getByLabelText(/role/i);
        expect(roleSelect.value, 'the lead role was not preselected').toBe('lead');
        expect(screen.getByText(/tell us which team you run/i)).toBeTruthy();
    });

    /**
     * The three fields an approver needs. Absent, a request arrives that cannot be
     * adjudicated, and the owner has to email the applicant to ask who they are.
     */
    it('asks for institution, department and profession there and then', () => {
        fireEvent.click(departmentButton());
        expect(screen.getByLabelText(/institution/i)).toBeTruthy();
        expect(screen.getByLabelText(/department/i)).toBeTruthy();
        expect(screen.getByLabelText(/profession/i)).toBeTruthy();
    });

    /**
     * Staff must NOT be dragged down the lead path. The default is the least
     * privileged role, and a manager choosing the department button is an explicit
     * act rather than a state everyone lands in.
     */
    it('still opens on the staff role for somebody who takes the ordinary route', () => {
        const ordinary = screen.getByRole('button', { name: /request access/i });
        fireEvent.click(ordinary);
        expect(screen.getByLabelText(/role/i).value).toBe('staff');
        expect(screen.queryByText(/tell us which team you run/i)).toBeNull();
    });
});
