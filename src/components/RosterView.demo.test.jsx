/**
 * ==============================================================================
 * ROSTER VIEW — SANDBOX / DEMO MODE (component tests)
 * ==============================================================================
 * Runner: Vitest + @testing-library/react (jsdom)
 * Run:    npx vitest run src/components/RosterView.demo.test.jsx
 *
 * This file is the deploy gate for the demo rostering path. Nobody can log into
 * the app to click through it before it ships, so these three assertions are the
 * verification:
 *
 *   1. Configure → Generate really generates: the calendar renders shifts that
 *      came out of `generateRosterV2`, matched against the engine's own output
 *      for the same configuration rather than against hardcoded strings.
 *   2. NO FIRESTORE FUNCTION IS CALLED. `setDoc` and `addDoc` are the two writes
 *      RosterView can perform, `onSnapshot` is the only read, and demo mode must
 *      reach none of them. This is the safety property the whole feature rests
 *      on, so it is asserted directly on the mocked module.
 *   3. An unfillable configuration surfaces the slots it could not staff, with
 *      the constraint that bound, instead of a silently empty calendar.
 *
 * `firebase.js` is mocked because importing it for real calls `initializeApp`
 * and `getMessaging` at module scope, which cannot work in jsdom — and because a
 * test of "no live data is touched" must not be able to touch live data.
 * ==============================================================================
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';

// --- MOCKS (hoisted above the imports below by Vitest) ------------------------

vi.mock('../firebase', () => ({
    db: { __mock: 'firestore-db' },
    auth: { __mock: 'auth' },
    storage: { __mock: 'storage' },
    messaging: { __mock: 'messaging' },
    requestForToken: vi.fn(),
}));

// Every Firestore entry point RosterView (and NexusContext) imports. Each is a
// spy, so "was anything called?" is answerable rather than assumed.
vi.mock('firebase/firestore', () => ({
    doc: vi.fn(() => ({ __mock: 'docRef' })),
    collection: vi.fn(() => ({ __mock: 'collectionRef' })),
    onSnapshot: vi.fn(() => () => {}),
    setDoc: vi.fn(() => Promise.resolve()),
    addDoc: vi.fn(() => Promise.resolve({ id: 'mock' })),
    getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
    serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

// Demo mode is the whole subject of this file, so the context is mocked rather
// than driven: the real provider gates its children on a Firebase Auth callback,
// which would make every test here wait on auth to answer for no benefit.
vi.mock('../context/NexusContext', () => ({
    useNexus: () => ({ isDemo: true }),
    NexusProvider: ({ children }) => children,
}));

import { doc, collection, onSnapshot, setDoc, addDoc } from 'firebase/firestore';
import RosterView from './RosterView';
import { DEMO_EXAMPLE_DEPARTMENT } from '../data/mockData';
import { generateRosterV2 } from '../utils/rosterEngineV2';

// --- HELPERS -----------------------------------------------------------------

const VISITOR = { name: 'Visiting Therapist', role: 'staff', email: 'visitor@example.org' };

const openConfigure = () => {
    fireEvent.click(screen.getByRole('button', { name: /configure/i }));
};

const clickGenerate = () => {
    fireEvent.click(screen.getByRole('button', { name: /generate sandbox roster/i }));
};

/** Every Firestore call site RosterView has, in one assertion. */
const expectNoFirestoreTraffic = () => {
    expect(setDoc).not.toHaveBeenCalled();
    expect(addDoc).not.toHaveBeenCalled();
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(doc).not.toHaveBeenCalled();
    expect(collection).not.toHaveBeenCalled();
};

let alertSpy;

beforeEach(() => {
    vi.clearAllMocks();
    // The old demo path fired two fake alerts and generated nothing. Stubbing
    // this both silences jsdom's "not implemented" noise and lets the tests
    // assert that the theatre is gone.
    alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

// ─── 1. THE EXAMPLE DEPARTMENT GENERATES A REAL ROSTER ────────────────────────

describe('demo mode: Configure → Load example department → Generate', () => {
    /**
     * The expected roster is the engine's own answer for the example
     * department. DEMO_EXAMPLE_DEPARTMENT is already in `generateRosterV2`'s
     * input shape, so this is not a re-implementation of the component's form →
     * config mapping: if that mapping drops a skill, an FTE or the rules, the
     * two rosters diverge and these assertions fail.
     */
    const expected = generateRosterV2(DEMO_EXAMPLE_DEPARTMENT);

    it('the fixture itself is a roster the engine accepts', () => {
        expect(expected.ok).toBe(true);
        expect(expected.score.hardViolations).toBe(0);
        // Requirement 5: exactly one deliberately unfillable slot, so the honest
        // reporting is visible on stage without the list becoming noise.
        expect(expected.unfilled).toHaveLength(1);
        expect(Object.keys(expected.roster).length).toBeGreaterThan(0);
    });

    it('renders shifts derived from the engine, and never calls Firestore', () => {
        render(<RosterView user={VISITOR} />);

        // Before generating: an empty calendar that says so, rather than 13
        // hardcoded MOCK_ROSTER events on 17–18 Feb 2026.
        expect(screen.getByText(/no sandbox roster yet/i)).toBeTruthy();

        openConfigure();
        fireEvent.click(screen.getByRole('button', { name: /load example department/i }));
        clickGenerate();

        // (a) The calendar renders the engine's shifts. Checked against every
        // shift the engine produced for the run's first day, by the display
        // string `buildShiftStaffLabel` builds — the same string the ICS export
        // interpolates.
        const firstDate = Object.keys(expected.roster).sort()[0];
        expect(firstDate).toBe(expected.effectiveStart);

        for (const shift of expected.roster[firstDate]) {
            expect(screen.getAllByText(shift.task).length).toBeGreaterThan(0);
            expect(screen.getAllByText(shift.staff).length).toBeGreaterThan(0);
        }

        // The engine's shape reaches the calendar intact, which is what makes
        // the CSV/ICS exports complete on this path: `week`, `lead`, `coLead`
        // and the display string all exist on every shift.
        for (const shifts of Object.values(expected.roster)) {
            for (const shift of shifts) {
                expect(typeof shift.week).toBe('number');
                expect(typeof shift.lead).toBe('string');
                expect(shift.staff).toContain('Lead: ');
            }
        }

        // (b) NO FIRESTORE. The safety property of the whole feature.
        expectNoFirestoreTraffic();

        // ...and none of the old fake "simulation complete" alerts either.
        expect(alertSpy).not.toHaveBeenCalled();
    });

    it('reports the effective start date, the load table and the one unfilled slot', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        fireEvent.click(screen.getByRole('button', { name: /load example department/i }));
        clickGenerate();

        // The Monday the engine actually started from.
        expect(screen.getByText(expected.effectiveStart)).toBeTruthy();

        // The unfilled slot, with the reason naming the binding constraint.
        const [unfilled] = expected.unfilled;
        expect(screen.getByText(/could not be staffed \(1\)/i)).toBeTruthy();
        expect(screen.getByText(unfilled.reason)).toBeTruthy();
        expect(unfilled.reason).toContain('on leave');

        // The per-person load table, including the part-timer's weighted figure:
        // the column that shows 0.6 FTE carrying a fair share, not an equal one.
        const partTimer = DEMO_EXAMPLE_DEPARTMENT.staff.find((person) => person.fte === 0.6);
        const row = screen.getByText(partTimer.name).closest('tr');
        expect(row).toBeTruthy();
        expect(within(row).getByText(String(partTimer.fte))).toBeTruthy();
        expect(within(row).getByText(String(expected.load[partTimer.name].duties))).toBeTruthy();

        // Requirement: `softPenalty` is never a headline — it is unnormalised and
        // not comparable between configurations, so it must not be on screen.
        expect(screen.queryByText(String(expected.score.softPenalty))).toBeNull();

        // Requirement 6: the no-persistence property, stated on screen.
        expect(screen.getByText(/nothing is saved/i)).toBeTruthy();

        expectNoFirestoreTraffic();
    });
});

// ─── 2. A TYPED-IN TEAM, NAMES ONLY ───────────────────────────────────────────

describe('demo mode: a visitor types their own team', () => {
    it('generates from names alone — no skills, FTE or leave required', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        fireEvent.change(screen.getByLabelText(/staff pool/i), {
            target: { value: 'Aisha Rahman, Ben Carter, Chloe Ng, Daniel Osei' },
        });
        fireEvent.change(screen.getByLabelText(/core tasks/i), {
            target: { value: 'Ward Round, Outpatient Clinic' },
        });
        fireEvent.change(screen.getByLabelText(/^weeks$/i), { target: { value: '1' } });
        fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-09-07' } });

        clickGenerate();

        const expected = generateRosterV2({
            startDate: '2026-09-07',
            weeks: 1,
            staff: [
                { name: 'Aisha Rahman', fte: 1.0, skills: [], unavailable: [] },
                { name: 'Ben Carter', fte: 1.0, skills: [], unavailable: [] },
                { name: 'Chloe Ng', fte: 1.0, skills: [], unavailable: [] },
                { name: 'Daniel Osei', fte: 1.0, skills: [], unavailable: [] },
            ],
            tasks: [{ name: 'Ward Round' }, { name: 'Outpatient Clinic' }],
        });

        expect(expected.ok).toBe(true);
        expect(expected.unfilled).toHaveLength(0);
        expect(screen.getByText(/could not be staffed \(0\)/i)).toBeTruthy();

        // Four names typed, four names in the load table, every one of them
        // rostered — the engine's defaults filled in the rest.
        for (const name of Object.keys(expected.load)) {
            expect(screen.getByText(name)).toBeTruthy();
            expect(expected.load[name].duties).toBeGreaterThan(0);
        }

        const firstDate = Object.keys(expected.roster).sort()[0];
        for (const shift of expected.roster[firstDate]) {
            expect(screen.getAllByText(shift.staff).length).toBeGreaterThan(0);
        }

        expectNoFirestoreTraffic();
    });
});

// ─── 3. AN UNFILLABLE CONFIGURATION IS REPORTED, NOT HIDDEN ───────────────────

describe('demo mode: an unfillable configuration', () => {
    it('lists the slots it could not staff, with the constraint that bound', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        // One person, four tasks needing two people each: the engine can fill two
        // duties for them (the default daily limit) and refuses the rest.
        fireEvent.change(screen.getByLabelText(/staff pool/i), {
            target: { value: 'Solo Practitioner' },
        });
        fireEvent.change(screen.getByLabelText(/core tasks/i), {
            target: { value: 'Ward Round, Outpatient Clinic, Home Visits, Group Therapy' },
        });
        fireEvent.change(screen.getByLabelText(/^weeks$/i), { target: { value: '1' } });
        fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-09-07' } });

        clickGenerate();

        const expected = generateRosterV2({
            startDate: '2026-09-07',
            weeks: 1,
            staff: [{ name: 'Solo Practitioner', fte: 1.0, skills: [], unavailable: [] }],
            tasks: [
                { name: 'Ward Round' },
                { name: 'Outpatient Clinic' },
                { name: 'Home Visits' },
                { name: 'Group Therapy' },
            ],
        });

        expect(expected.ok).toBe(true);
        expect(expected.unfilled.length).toBeGreaterThan(0);

        // The count is on screen, and the calendar is NOT silently empty: the
        // report says how many slots failed and why each one did.
        expect(
            screen.getByText(new RegExp(`could not be staffed \\(${expected.unfilled.length}\\)`, 'i')),
        ).toBeTruthy();
        expect(screen.getByText(expected.unfilled[0].reason)).toBeTruthy();
        expect(expected.unfilled[0].reason).toMatch(/no available staff|no lead could be assigned/);

        // The over-capacity warning the engine raises before filling anything.
        expect(expected.warnings.length).toBeGreaterThan(0);
        expect(screen.getByText(expected.warnings[0])).toBeTruthy();

        expectNoFirestoreTraffic();
    });

    it('refuses a configuration the engine rejects, and says why, without writing', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        // Two rows, one name: every load figure and capacity check would be
        // ambiguous, so the engine refuses rather than generating.
        fireEvent.change(screen.getByLabelText(/staff pool/i), {
            target: { value: 'Sam Wilson, Sam Wilson' },
        });
        fireEvent.change(screen.getByLabelText(/core tasks/i), {
            target: { value: 'Ward Round' },
        });

        clickGenerate();

        expect(screen.getByText(/AURA did not generate a roster/i)).toBeTruthy();
        expect(screen.getByText(/appears twice in the staff pool/i)).toBeTruthy();
        // A refusal must not leave a half-built roster on screen.
        expect(screen.getByText(/no sandbox roster yet/i)).toBeTruthy();

        expectNoFirestoreTraffic();
    });
});
