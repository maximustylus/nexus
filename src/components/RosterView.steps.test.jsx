/**
 * ==============================================================================
 * THE CONFIGURATION WIZARD IS A NUMBERED SEQUENCE (component tests)
 * ==============================================================================
 * Runner: Vitest + @testing-library/react (jsdom)
 * Run:    npx vitest run src/components/RosterView.steps.test.jsx
 *
 * The wizard's panels were a stack of similarly-styled cards. Nothing told a
 * first-time reader that they were ordered, that Staff comes before Tasks for a
 * reason, or how much was still below the fold. The roster owner asked for "a
 * number and a line ... so that it's logical and sequential".
 *
 * WHAT THESE TESTS ARE FOR, specifically: the numbers are DERIVED from
 * `WIZARD_STEPS`, not written at each call site, and the panels they number live
 * in TWO different files (`RosterView.jsx` has steps 1–2, and
 * `RosterDemoWizardTables.jsx` has 3–7). That split is exactly how a numbering
 * scheme rots: someone inserts a panel in one file and the other file's numbers
 * silently become wrong, or two panels end up both claiming to be step 4. So the
 * assertions here are about the sequence as a WHOLE — that the badges read
 * 1..N with no gaps and no repeats, across both files, in DOM order — rather than
 * about any single badge saying what it should.
 *
 * They also pin the two things a reader would notice if they broke: live mode is
 * NOT numbered (its wizard is a different, shorter thing), and the wizard does not
 * gain a horizontal scrollbar on a phone from the badge gutter.
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const ctx = vi.hoisted(() => ({ isDemo: true }));

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
    query: vi.fn(() => ({ __mock: 'query' })),
    where: vi.fn(() => ({ __mock: 'where' })),
    updateDoc: vi.fn(() => Promise.resolve()),
}));

vi.mock('../context/NexusContext', () => ({
    useNexus: () => ({ isDemo: ctx.isDemo }),
    NexusProvider: ({ children }) => children,
}));

import RosterView from './RosterView';
import WizardStep from './WizardStep';
import { WIZARD_STEPS, WIZARD_STEP_COUNT, wizardStepNumber, wizardStepLabel } from '../utils/rosterWizard';

const VISITOR = { name: 'Peter Parker', role: 'staff', email: 'peter@example.org' };
const openConfigure = () => fireEvent.click(screen.getByRole('button', { name: /configure/i }));

/**
 * Every step badge, in DOM order, as the numbers a reader sees.
 *
 * Found by the badge's own shape rather than by a test id: a badge is a leaf
 * element whose entire text is a small integer. Using the class list would pin the
 * styling, and using a `data-testid` would let the real markup drift away from
 * what the test measures while the test kept passing.
 */
const badgeNumbers = () =>
    Array.from(document.querySelectorAll('div'))
        .filter((el) => el.children.length === 0 && /^\d{1,2}$/.test((el.textContent || '').trim()))
        .map((el) => Number(el.textContent.trim()));

describe('the wizard reads as one numbered sequence', () => {
    beforeEach(() => {
        cleanup();
        ctx.isDemo = true;
    });

    it('numbers every panel 1..N, in order, with no gaps and no repeats', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        const seen = badgeNumbers();

        // The whole point: the sequence is complete and ordered. Written as a
        // comparison against a DERIVED range so that adding an eighth step to
        // `WIZARD_STEPS` makes this test demand an eighth badge, rather than
        // silently continuing to accept seven.
        expect(seen).toEqual(Array.from({ length: WIZARD_STEP_COUNT }, (_, i) => i + 1));
    });

    it('spans BOTH files — the panels in RosterView and the panels in the tables component', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        // Steps 1–2 are rendered by RosterView.jsx, 3–7 by RosterDemoWizardTables.jsx.
        // If either file stopped wrapping its panels, the count would drop — which is
        // the failure a per-file test could not see.
        expect(badgeNumbers().length).toBe(WIZARD_STEP_COUNT);
        expect(WIZARD_STEP_COUNT).toBeGreaterThan(2);

        // …and each step's accessible name carries its position, so the order is
        // available to a screen reader and not only to the eye.
        for (const step of WIZARD_STEPS) {
            const n = wizardStepNumber(step.id);
            expect(
                screen.getByLabelText(`Step ${n} of ${WIZARD_STEP_COUNT}: ${step.label}`),
                `step ${n} (${step.id}) has no accessible name`,
            ).toBeTruthy();
        }
    });

    /**
     * ⚠️ THIS ASSERTED THE OPPOSITE, AND WAS RIGHT UNTIL `R3`. Live mode had two
     *    textareas, not seven panels, so numbering it would have counted a sequence
     *    that did not exist there.
     *
     *    Live mode now renders the same wizard, so it gets the same numbering — and
     *    the interesting part is that it must be the SAME numbering, 1 through 7.
     *    Step 1 in the sandbox is "who are you and what shape is your department",
     *    which a real department does not need; omitting it left the live wizard
     *    running 2 to 7, which reads as a step that failed to load. Live mode has
     *    its own step 1 instead — the department it is configuring.
     */
    it('numbers live mode the same way, starting at 1', () => {
        ctx.isDemo = false;
        render(<RosterView user={VISITOR} />);
        openConfigure();

        const numbers = badgeNumbers();
        expect(numbers[0], 'the live wizard starts at a step other than 1').toBe(1);
        expect(numbers).toEqual(WIZARD_STEPS.map((step) => wizardStepNumber(step.id)));
    });

    it('costs the phone no horizontal scroll, which is what the gutter risked', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        // Below `sm:` the staff and task rows STACK rather than scroll, so the badge
        // gutter eats stacked-row width. `min-w-0` on the content column is what stops
        // one wide row forcing the whole wizard sideways; without it a flex child
        // refuses to shrink below its intrinsic width. Pinned because it is invisible
        // and one class deletion away.
        const contentColumns = Array.from(document.querySelectorAll('.flex-1.min-w-0'));
        expect(contentColumns.length).toBeGreaterThanOrEqual(WIZARD_STEP_COUNT);
    });
});

describe('the step registry is derived, not written down', () => {
    it('gives each id its position, and refuses an id that is not a step', () => {
        WIZARD_STEPS.forEach((step, i) => {
            expect(wizardStepNumber(step.id)).toBe(i + 1);
            expect(wizardStepLabel(step.id)).toBe(step.label);
        });
        // An unknown id must not yield 0 (which would render "step 0 of 7") and must
        // not throw (which would take the wizard down mid-configuration).
        expect(wizardStepNumber('not-a-step')).toBeNull();
        expect(wizardStepNumber(undefined)).toBeNull();
        expect(wizardStepLabel('not-a-step')).toBeNull();
    });

    it('has unique ids and a count that matches the list', () => {
        const ids = WIZARD_STEPS.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(WIZARD_STEP_COUNT).toBe(WIZARD_STEPS.length);
    });
});

describe('WizardStep on its own', () => {
    beforeEach(cleanup);

    it('draws the connecting spine, and stops it at the last step', () => {
        const { container: mid } = render(<WizardStep number={2} label="Middle"><p>body</p></WizardStep>);
        // The spine is the thin full-height rule in the badge column.
        expect(mid.querySelectorAll('[aria-hidden="true"]').length).toBe(1);

        cleanup();
        const { container: last } = render(<WizardStep number={7} label="Last" isLast><p>body</p></WizardStep>);
        // Nothing below the final panel for the line to connect to, so it ends.
        expect(last.querySelectorAll('[aria-hidden="true"]').length).toBe(0);
    });

    it('renders the panel bare rather than badging it "0" when handed no number', () => {
        // This is how live mode opts out without a second branch of markup, and it is
        // also the safe behaviour for a mistyped step id.
        for (const bad of [null, undefined, 0, -1, 1.5, 'two']) {
            cleanup();
            render(<WizardStep number={bad} label="x"><p>still here</p></WizardStep>);
            expect(screen.getByText('still here')).toBeTruthy();
            expect(badgeNumbers()).toEqual([]);
        }
    });

    it('always renders its children — numbering cannot swallow a panel', () => {
        render(<WizardStep number={3} label="Third"><p>the panel</p></WizardStep>);
        expect(screen.getByText('the panel')).toBeTruthy();
    });
});
