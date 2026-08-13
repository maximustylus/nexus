/**
 * ==============================================================================
 * ROSTER VIEW — THE CONFIGURE WIZARD, IN BOTH UNIVERSES
 * ==============================================================================
 * Runner: Vitest + @testing-library/react (jsdom)
 * Run:    npx vitest run src/components/RosterView.wizard.test.jsx
 *
 * The grade-aware tables are a SANDBOX-ONLY change. This file is the gate on that
 * word "only".
 *
 * The live wizard writes into `config.staff` / `config.tasks`, which is exactly
 * what `prepareRosterWrite` hands to `setDoc` against `system_data/roster_2026` —
 * the document four real clinicians read their week out of. So the two
 * comma-separated textareas are asserted here down to their `id`, their class
 * list and their value, and every one of the new sandbox controls is asserted
 * ABSENT. A future refactor that "tidies up" the wizard by giving live mode the
 * tables has to turn this file red first.
 *
 * The demo half of the file is the mirror image: the textareas must be gone
 * there, because two ways to enter a staff pool in one wizard is two answers to
 * "who is being rostered".
 *
 * SECTION 3 is the band-boundary RULER — the control that replaced the six number
 * boxes. Its whole claim is that a gap, an overlap or a partition that misses an
 * end of the AH scale is not EXPRESSIBLE, so the tests drive both dividers to
 * their extremes by keyboard and by pointer and assert, off the rendered DOM,
 * that the three bands are still contiguous and still cover AH7–AH17. Nobody has
 * seen this control rendered: jsdom paints nothing, so what is asserted here is
 * STRUCTURE, ARIA and arithmetic. Spacing, drag feel and colour contrast are
 * explicitly NOT covered and need a human with a browser.
 * ==============================================================================
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, act } from '@testing-library/react';

// --- MOCKS (hoisted above the imports below by Vitest) ------------------------

const ctx = vi.hoisted(() => ({ isDemo: false }));

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
    // 🤝 Added with the coverage-request listener RosterView now owns: this file
    // drives LIVE mode, so `query`/`where` really are called on mount. The
    // listener's snapshot is never delivered here (`onSnapshot` returns an
    // unsubscribe and calls nothing), so the wizard assertions below are
    // unaffected — they are about the two live textareas, not about coverage.
    query: vi.fn(() => ({ __mock: 'query' })),
    where: vi.fn(() => ({ __mock: 'where' })),
    updateDoc: vi.fn(() => Promise.resolve()),
}));

vi.mock('../context/NexusContext', () => ({
    useNexus: () => ({ isDemo: ctx.isDemo }),
    NexusProvider: ({ children }) => children,
}));

import { setDoc, addDoc, onSnapshot } from 'firebase/firestore';
import RosterView from './RosterView';
import { BandBoundaryEditor } from './RosterDemoWizardTables';
import { LIVE_ROSTER_DEFAULTS } from '../utils/auraEngine';
import { DEFAULT_GRADE_BANDS } from '../utils/rosterEngineV2';
import { bandsToInputs } from '../utils/rosterWizard';

const BRANDON = { name: 'Brandon', role: 'staff', email: 'brandon@example.org' };

/**
 * The two live textareas, verbatim as of the commit before the sandbox tables
 * existed. Class list included on purpose: "renders exactly as before" is a claim
 * about the rendered markup, and a value-only assertion would pass for a
 * completely restyled control.
 */
const LIVE_TEXTAREA_CLASS =
    'input-field w-full mt-1 h-20 font-mono text-xs bg-white dark:bg-slate-900 border dark:border-slate-700 rounded p-2 text-slate-800 dark:text-white';

const openConfigure = () => fireEvent.click(screen.getByRole('button', { name: /configure/i }));

/**
 * The subscriptions to `system_data/roster_2026`, as opposed to the coverage-request
 * QUERY listener RosterView also opens in live mode.
 *
 * 🤝 ADDED with one-tap cover: this file's claim is that the person view costs no
 * extra read of the roster document, and that claim is unchanged. It was previously
 * expressed as `onSnapshot` having been called exactly once, which stopped being the
 * same statement the moment the view acquired a second, unrelated listener — so the
 * roster listener is now identified rather than counted globally. The coverage
 * listener is asserted separately, so "two listeners" cannot quietly become three.
 */
const rosterListenerCalls = () =>
    onSnapshot.mock.calls.filter(([target]) => target?.__mock !== 'query');

/**
 * The lower divider's `aria-label`, spelled out. Used for both the presence
 * checks in demo mode and the absence checks in live mode, so the two cannot drift
 * apart the way a `/boundary/i` regex on one side and a literal on the other would.
 */
const LOWER_DIVIDER = 'Boundary between the Junior and Senior bands';
const UPPER_DIVIDER = 'Boundary between the Senior and Principal bands';

/** Every control the sandbox wizard added, as one absence check. */
const expectNoSandboxTables = () => {
    expect(screen.queryByText(/grade bands/i)).toBeNull();
    // CHANGED at the ruler: this used to look for `'Junior band lowest grade'`,
    // the label of a number box that no longer exists anywhere in the app — an
    // assertion that could no longer fail. The band editor's controls are now two
    // sliders, and live mode has no slider of any kind, so the role is the check.
    expect(screen.queryAllByRole('slider')).toHaveLength(0);
    expect(screen.queryByLabelText(LOWER_DIVIDER)).toBeNull();
    expect(screen.queryByLabelText(UPPER_DIVIDER)).toBeNull();
    expect(screen.queryByText('Junior AH7–AH12')).toBeNull();
    expect(screen.queryByLabelText('Staff row 1 name')).toBeNull();
    expect(screen.queryByLabelText('Staff row 1 job grade')).toBeNull();
    expect(screen.queryByLabelText('Task row 1 name')).toBeNull();
    expect(screen.queryByLabelText('Task row 1: Senior may lead')).toBeNull();
    expect(screen.queryAllByRole('button', { name: /add row/i })).toHaveLength(0);
    expect(screen.queryByText(/it is not a preference order/i)).toBeNull();
    // The grade dropdown is the only `<select>` the tables add, and the live
    // wizard has none at all.
    expect(document.querySelectorAll('select')).toHaveLength(0);
};

beforeEach(() => {
    vi.clearAllMocks();
    ctx.isDemo = false;
});

afterEach(() => {
    cleanup();
});

// ─── LIVE MODE: THE WIZARD IS UNTOUCHED ───────────────────────────────────────

describe('live mode: the Configure wizard is exactly what it was', () => {
    it('renders the two comma-separated textareas, with their ids, classes and values', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        const staffBox = document.getElementById('roster-staff-pool');
        expect(staffBox).toBeTruthy();
        expect(staffBox.tagName).toBe('TEXTAREA');
        expect(staffBox.className).toBe(LIVE_TEXTAREA_CLASS);
        expect(staffBox.value).toBe(LIVE_ROSTER_DEFAULTS.staff.join(', '));
        // No placeholder in live mode, as before.
        expect(staffBox.hasAttribute('placeholder')).toBe(false);

        const tasksBox = document.getElementById('roster-tasks');
        expect(tasksBox).toBeTruthy();
        expect(tasksBox.tagName).toBe('TEXTAREA');
        expect(tasksBox.className).toBe(LIVE_TEXTAREA_CLASS);
        expect(tasksBox.value).toBe(LIVE_ROSTER_DEFAULTS.tasks.join(', '));
        expect(tasksBox.hasAttribute('placeholder')).toBe(false);

        // Their labels, which is how every existing test reaches them.
        expect(screen.getByLabelText(/staff pool/i)).toBe(staffBox);
        expect(screen.getByLabelText(/core tasks/i)).toBe(tasksBox);
    });

    it('has none of the sandbox controls, and none of the sandbox copy', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        expectNoSandboxTables();
        // Sandbox-only chrome, absent as before.
        expect(screen.queryByText(/sandbox mode/i)).toBeNull();
        // CHANGED TWICE, and both times for the same reason: a "this control is absent"
        // test must name a string that EXISTS somewhere, or it passes vacuously. It was
        // `/load example department/i` (a button that became a dropdown), then
        // `/load an example arrangement/i` (a dropdown of twelve per-department
        // arrangements). The sandbox picker is now TWO dropdowns — a profession and a
        // shape — and both labels below DO exist in demo mode, asserted in the demo-mode
        // test at the foot of this file, so their absence here is a claim about live mode
        // rather than about a dead string.
        expect(screen.queryByLabelText(/shape to start from/i)).toBeNull();
        expect(screen.queryByLabelText(/your profession/i)).toBeNull();
        expect(screen.queryByText(/shape to start from/i)).toBeNull();
        expect(screen.queryByText(/your profession/i)).toBeNull();
        // …and no trace of the twelve-arrangement picker that came before it.
        expect(screen.queryByLabelText(/load an example arrangement/i)).toBeNull();
        expect(screen.getByRole('button', { name: /^generate roster$/i })).toBeTruthy();
    });

    it('keeps the narrow, non-scrolling modal the live wizard has always had', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        const panel = document.getElementById('roster-staff-pool').closest('.rounded-2xl');
        expect(panel.className).toContain('max-w-lg');
        expect(panel.className).not.toContain('max-w-3xl');
        expect(panel.className).not.toContain('overflow-y-auto');
    });

    it('still edits config.staff straight from the textarea, and still writes it', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        fireEvent.change(screen.getByLabelText(/staff pool/i), {
            target: { value: 'Brandon, Ying Xian' },
        });
        fireEvent.change(screen.getByLabelText(/core tasks/i), { target: { value: 'EFT' } });

        // The live path is confirmation-gated, and the confirmation names the pool
        // the textarea holds — the M1 guard. Then it writes.
        fireEvent.click(screen.getByRole('button', { name: /^generate roster$/i }));
        expect(screen.getAllByText('Brandon, Ying Xian').length).toBeGreaterThan(0);
        fireEvent.click(screen.getByRole('button', { name: /^ok$/i }));
        expect(setDoc).toHaveBeenCalledTimes(1);
    });

    it('is still gated by validateRosterConfig, not by the sandbox tables', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        // Emptying the textarea must still disable Generate. If live mode had been
        // switched onto the table-driven gate this would pass for the wrong
        // reason — so the reason is asserted too.
        fireEvent.change(screen.getByLabelText(/staff pool/i), { target: { value: '' } });
        expect(screen.getByRole('button', { name: /^generate roster$/i }).disabled).toBe(true);
        expect(screen.getByText(/staff pool is empty/i)).toBeTruthy();
        expect(screen.queryByText(/staff table/i)).toBeNull();
    });
});

// ─── LIVE MODE: THE PERSON VIEW IS A SECOND WAY TO *READ* ─────────────────────
//
// "My week" is available in live mode too, because a clinician asking when THEY are
// on is the same question in both universes. The constraint on it is that it changes
// nothing else: it must default to the grid (so an existing user who never presses
// it sees exactly what they saw yesterday), it must add no control to the live
// wizard, and it must not read or write anything of its own — it re-reads the
// document the listener already delivered.

describe('live mode: my week reads the live document and adds nothing to it', () => {
    /** A day in the month the calendar opens on, which is the current one. */
    const liveDayKey = (dayOfMonth) => {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;
    };

    it('defaults to the department grid, and adds no control to the wizard', () => {
        render(<RosterView user={BRANDON} />);

        expect(screen.getByRole('button', { name: /^department$/i }).getAttribute('aria-pressed'))
            .toBe('true');
        expect(screen.getByRole('button', { name: /^my week$/i }).getAttribute('aria-pressed'))
            .toBe('false');
        // The grid is what is on screen: one square per day of the current month.
        expect(document.querySelector('[data-roster-view="person"]')).toBeNull();
        expect(document.querySelectorAll('[data-date]').length).toBeGreaterThan(0);

        // …and the wizard is still exactly the two textareas, with no slider, no
        // table and — the check that matters for the person view — no `<select>`.
        openConfigure();
        expectNoSandboxTables();
    });

    it('lists the signed-in user\'s own duties out of the live document, and nobody else\'s', () => {
        render(<RosterView user={BRANDON} />);

        // The live listener, answered with a document in the shape
        // `system_data/roster_2026` really holds.
        const dateKey = liveDayKey(15);
        const liveDoc = {
            [dateKey]: [
                { task: 'EFT', lead: 'Brandon', coLead: 'Derlinder', staff: 'Lead: Brandon, Co: Derlinder', week: 1, category: 'CORE' },
                { task: 'NC', lead: 'Ying Xian', coLead: 'Fadzlynn', staff: 'Lead: Ying Xian, Co: Fadzlynn', week: 1, category: 'CORE' },
            ],
        };
        // CHANGED (one-tap cover): one listener on the ROSTER DOCUMENT. The view also
        // opens a `shift_swaps` query listener in live mode; that is asserted below.
        expect(rosterListenerCalls()).toHaveLength(1);
        act(() => {
            rosterListenerCalls()[0][1]({ exists: () => true, data: () => liveDoc });
        });

        // Both shifts are in the grid…
        expect(within(document.querySelector(`[data-date="${dateKey}"]`)).getAllByRole('button'))
            .toHaveLength(2);

        fireEvent.click(screen.getByRole('button', { name: /^my week$/i }));
        const panel = document.querySelector('[data-roster-view="person"]');
        expect(panel).toBeTruthy();

        // …and exactly one of them is Brandon's.
        expect(within(panel).getByRole('heading', { name: 'Brandon' })).toBeTruthy();
        const list = within(panel).getByRole('list');
        expect(within(list).getAllByRole('listitem')).toHaveLength(1);
        expect(within(list).getByText('EFT')).toBeTruthy();
        expect(within(list).getByText('Lead')).toBeTruthy();
        expect(within(list).getByText(/with Derlinder/)).toBeTruthy();
        expect(within(list).queryByText('NC')).toBeNull();
        expect(within(list).queryByText(/Ying Xian/)).toBeNull();

        // Live mode's person IS the signed-in user: there is nothing to choose, and
        // therefore no `<select>` anywhere in this universe.
        expect(screen.queryByLabelText(/show whose duties/i)).toBeNull();
        expect(document.querySelectorAll('select')).toHaveLength(0);

        // A live roster carries no session lengths, so no hours and no total are
        // shown rather than a default being printed as though somebody set it.
        expect(within(panel).queryByText(/in total/i)).toBeNull();
        expect(within(list).queryByText(/h$/)).toBeNull();

        // ONE listener on the roster document, no second read of it, and nothing
        // written. CHANGED (one-tap cover): the coverage-request listener is counted
        // explicitly rather than folded into a global count, so switching view still
        // cannot add a subscription and neither can this feature add a third.
        expect(rosterListenerCalls()).toHaveLength(1);
        expect(onSnapshot).toHaveBeenCalledTimes(2);
        expect(setDoc).not.toHaveBeenCalled();
        expect(addDoc).not.toHaveBeenCalled();
    });

    it('says so plainly when there is no live roster to read', () => {
        render(<RosterView user={BRANDON} />);
        fireEvent.click(screen.getByRole('button', { name: /^my week$/i }));

        // The listener has not answered, so the calendar is empty — and the person
        // view says that is what it is, rather than showing an empty list that reads
        // as "you are off all month".
        const panel = document.querySelector('[data-roster-view="person"]');
        expect(within(panel).getByText(/no roster on screen/i)).toBeTruthy();
        expect(within(panel).queryAllByRole('listitem')).toHaveLength(0);
        expect(setDoc).not.toHaveBeenCalled();
    });
});

// ─── DEMO MODE: THE TEXTAREAS ARE GONE ────────────────────────────────────────

describe('demo mode: the wizard is the tables, and only the tables', () => {
    beforeEach(() => {
        ctx.isDemo = true;
    });

    it('has no free-text staff or task box at all', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        expect(document.getElementById('roster-staff-pool')).toBeNull();
        expect(document.getElementById('roster-tasks')).toBeNull();
        expect(screen.queryByLabelText(/staff pool/i)).toBeNull();
        expect(screen.queryByLabelText(/core tasks/i)).toBeNull();
    });

    it('has the band editor, both tables and the sandbox chrome', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        expect(screen.getByText(/grade bands/i)).toBeTruthy();
        // CHANGED at the ruler: was `getByLabelText('Junior band lowest grade')`,
        // one of the six number boxes. The band editor is now one ruler with two
        // dividers, plus the same numbers as text beside it.
        expect(screen.getAllByRole('slider')).toHaveLength(2);
        expect(screen.getByLabelText(LOWER_DIVIDER)).toBeTruthy();
        expect(screen.getByLabelText(UPPER_DIVIDER)).toBeTruthy();
        expect(screen.getByText('Junior AH7–AH12')).toBeTruthy();
        expect(screen.getByLabelText('Staff row 1 name')).toBeTruthy();
        expect(screen.getByLabelText('Staff row 1 job grade')).toBeTruthy();
        expect(screen.getByLabelText('Task row 1 name')).toBeTruthy();
        expect(screen.getByLabelText('Task row 1: Senior may lead')).toBeTruthy();
        expect(screen.getAllByRole('button', { name: /add row/i })).toHaveLength(2);
        expect(screen.getAllByText(/sandbox mode/i).length).toBeGreaterThan(0);
        // CHANGED: was one `/load example department/i` button, then one dropdown of
        // twelve per-department arrangements. The sandbox picker is now TWO dropdowns —
        // WHO YOU ARE and WHAT SHAPE TO START FROM — and this asserts both are the
        // sandbox-only controls the single button used to be, which is what the live-mode
        // absence test above is the mirror of.
        expect(screen.getByText(/shape to start from/i)).toBeTruthy();
        expect(screen.getByLabelText(/shape to start from/i)).toBeTruthy();
        expect(screen.getByText(/your profession/i)).toBeTruthy();
        expect(screen.getByLabelText(/your profession/i)).toBeTruthy();
        // The shapes are options in the shape dropdown, named by their STRUCTURE rather
        // than by a department — which is the whole point of the profession+shape picker.
        expect(
            within(screen.getByLabelText(/shape to start from/i))
                .getByRole('option', { name: 'Team-based rotation' }),
        ).toBeTruthy();
        expect(
            within(screen.getByLabelText(/shape to start from/i))
                .getByRole('option', { name: 'Weekend quota inside an hours ceiling' }),
        ).toBeTruthy();
        // …and the professions are options in the other one, by MOH's own names.
        expect(
            within(screen.getByLabelText(/your profession/i))
                .getByRole('option', { name: 'Art Therapist' }),
        ).toBeTruthy();

        // Start date and Weeks are SHARED between the two universes and stay put.
        expect(screen.getByLabelText(/start date/i)).toBeTruthy();
        expect(screen.getByLabelText(/^weeks$/i)).toBeTruthy();
    });

    it('opens with an empty pool and a disabled Generate, saying what is missing', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        // RENAMED (language pass): "Generate Sandbox Roster" -> "Draft roster".
        expect(screen.getByRole('button', { name: /^draft roster$/i }).disabled).toBe(true);
        expect(screen.getByText(/add at least one person to the staff table/i)).toBeTruthy();
        expect(setDoc).not.toHaveBeenCalled();
    });
});

// ─── 3. THE BAND BOUNDARY RULER ───────────────────────────────────────────────
//
// The six number boxes are gone. What replaced them is one ruler of AH7–AH17 with
// two dividers, and the reason is not cosmetic: six independent numbers can be
// left describing a GAP (a grade in no band, and therefore a clinician silently
// barred from every band-gated task), an OVERLAP, or a partition that stops short
// of an end of the scale. Two dividers cannot describe any of those, because the
// bands are derived from where the dividers sit.
//
// "Cannot" is a strong claim, so it is not asserted — it is attacked. The tests
// below drive each divider as far as the keyboard and the pointer will take it,
// past the other divider and past both ends of the scale, and after every attempt
// read the three bands back OFF THE DOM and check they are contiguous and cover
// AH7–AH17.

/** `[7, 12] -> 'AH7–AH12'`, and `[7, 7] -> 'AH7'`. The engine's own en dash. */
const span = (min, max) => (min === max ? `AH${min}` : `AH${min}–AH${max}`);

/** The two dividers, in DOM order: lower (junior|senior), upper (senior|principal). */
const dividers = () => screen.getAllByRole('slider');

const valueOf = (slider) => Number(slider.getAttribute('aria-valuenow'));

/**
 * Read the partition back out of the rendered control, and assert it is one.
 *
 * Deliberately reads the DOM rather than any internal state: the claim under test
 * is about what a user can end up looking at. Junior starting at AH7 and principal
 * ending at AH17 is COVERAGE; each band starting exactly one grade above the one
 * below it is CONTIGUITY — no gap, no overlap, in one assertion each.
 */
const expectContiguousPartitionCovering7to17 = () => {
    const [lower, upper] = dividers();
    const a = valueOf(lower);
    const b = valueOf(upper);

    expect(Number.isInteger(a)).toBe(true);
    expect(Number.isInteger(b)).toBe(true);
    // No band may be empty or inverted, and no divider may cross the other.
    expect(a).toBeGreaterThanOrEqual(7);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThanOrEqual(16);

    // The text beside the ruler says the same thing, spelled out.
    expect(screen.getByText(`Junior ${span(7, a)}`)).toBeTruthy();
    expect(screen.getByText(`Senior ${span(a + 1, b)}`)).toBeTruthy();
    expect(screen.getByText(`Principal ${span(b + 1, 17)}`)).toBeTruthy();

    // And `validateGradeBands` — still running as the backstop — has nothing to say.
    // `queryAllBy…` rather than `queryBy…`: the singular form THROWS on multiple
    // matches, so a duplicated error message would read as a crash rather than as
    // the failure it is.
    expect(screen.queryAllByText(/in no band at all/i)).toHaveLength(0);
    expect(screen.queryAllByText(/overlap/i)).toHaveLength(0);
    expect(screen.queryAllByText(/band bounds are whole grade numbers/i)).toHaveLength(0);
    expect(screen.queryAllByText(/not one unbroken cut of the scale/i)).toHaveLength(0);
};

const press = (slider, key, times = 1) => {
    let lastDefaultAllowed = null;
    for (let n = 0; n < times; n += 1) {
        // `fireEvent` returns false when the handler called preventDefault, which is
        // how "the arrow keys do not scroll the wizard behind the handle" is checked.
        lastDefaultAllowed = fireEvent.keyDown(slider, { key });
    }
    return lastDefaultAllowed;
};

/**
 * jsdom measures every element as 0×0, so the ruler has no width to map a pointer
 * onto and a real drag would be a no-op. The track is therefore given the
 * measurements a browser would report; the geometry that turns an x into a grade
 * is the thing under test, and it is the component's own code either way.
 *
 * The track is the divider handles' offset parent — the same element the component
 * measures — reached from a handle rather than by class name so the test does not
 * pin styling.
 */
const RULER_LEFT = 100;
const RULER_WIDTH = 220; // 11 grades × 20px
const stubRulerWidth = () => {
    const track = dividers()[0].parentElement;
    track.getBoundingClientRect = () => ({
        left: RULER_LEFT,
        right: RULER_LEFT + RULER_WIDTH,
        width: RULER_WIDTH,
        top: 0,
        bottom: 32,
        height: 32,
        x: RULER_LEFT,
        y: 0,
    });
    return track;
};

/** The x of the boundary line just after `grade`, in the stubbed geometry. */
const xOfLineAfter = (grade) => RULER_LEFT + (RULER_WIDTH * (grade - 7 + 1)) / 11;

describe('demo mode: the band boundary ruler', () => {
    beforeEach(() => {
        ctx.isDemo = true;
    });

    it('publishes each divider\'s value and its LEGAL travel, not the scale ends', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        const [lower, upper] = dividers();

        // Shipped cut: junior AH7–12, senior AH13–14, principal AH15–17.
        expect(lower.getAttribute('aria-label')).toBe(LOWER_DIVIDER);
        expect(lower.getAttribute('aria-valuenow')).toBe('12');
        expect(lower.getAttribute('aria-valuemin')).toBe('7');
        // NOT 17: one grade below the upper divider, because senior may not be
        // squeezed to nothing.
        expect(lower.getAttribute('aria-valuemax')).toBe('13');
        expect(lower.getAttribute('aria-orientation')).toBe('horizontal');
        expect(lower.getAttribute('tabindex')).toBe('0');
        // The announced value is the two spans either side, not a bare number.
        expect(lower.getAttribute('aria-valuetext')).toBe('Junior AH7–AH12, Senior AH13–AH14');
        // A focus ring exists and is visible rather than being outline: none alone.
        expect(lower.className).toContain('focus:ring-2');

        expect(upper.getAttribute('aria-label')).toBe(UPPER_DIVIDER);
        expect(upper.getAttribute('aria-valuenow')).toBe('14');
        // NOT 7: one grade above the lower divider.
        expect(upper.getAttribute('aria-valuemin')).toBe('13');
        // NOT 17: principal must keep at least AH17.
        expect(upper.getAttribute('aria-valuemax')).toBe('16');
        expect(upper.getAttribute('aria-valuetext')).toBe('Senior AH13–AH14, Principal AH15–AH17');
        expect(upper.className).toContain('focus:ring-2');

        expectContiguousPartitionCovering7to17();
    });

    it('re-publishes the other divider\'s travel as soon as one of them moves', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        press(dividers()[0], 'ArrowLeft', 4); // junior|senior: 12 -> 8

        expect(dividers()[0].getAttribute('aria-valuenow')).toBe('8');
        // The upper divider's floor followed it down: senior may now start at AH9.
        expect(dividers()[1].getAttribute('aria-valuemin')).toBe('9');
        expect(dividers()[1].getAttribute('aria-valuenow')).toBe('14');
        expectContiguousPartitionCovering7to17();
    });

    it('steps one grade per arrow key, and swallows the key so the wizard stays put', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        expect(press(dividers()[0], 'ArrowLeft')).toBe(false);
        expect(valueOf(dividers()[0])).toBe(11);
        expect(screen.getByText('Junior AH7–AH11')).toBeTruthy();
        expect(screen.getByText('Senior AH12–AH14')).toBeTruthy();

        expect(press(dividers()[0], 'ArrowRight')).toBe(false);
        expect(valueOf(dividers()[0])).toBe(12);

        // ArrowUp/ArrowDown are the same step, per the ARIA slider pattern.
        expect(press(dividers()[0], 'ArrowDown')).toBe(false);
        expect(valueOf(dividers()[0])).toBe(11);
        expect(press(dividers()[0], 'ArrowUp')).toBe(false);
        expect(valueOf(dividers()[0])).toBe(12);

        // A key the control does not handle is left alone for the browser.
        expect(press(dividers()[0], 'a')).toBe(true);
        expect(valueOf(dividers()[0])).toBe(12);
        expectContiguousPartitionCovering7to17();
    });

    it('Home and End jump to the published limits, not to AH7 and AH17', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        press(dividers()[0], 'End');
        // 13, one below the upper divider — NOT 17, which would empty two bands.
        expect(valueOf(dividers()[0])).toBe(13);
        expect(screen.getByText('Senior AH14')).toBeTruthy();
        expectContiguousPartitionCovering7to17();

        press(dividers()[0], 'Home');
        expect(valueOf(dividers()[0])).toBe(7);
        expect(screen.getByText('Junior AH7')).toBeTruthy();
        expectContiguousPartitionCovering7to17();

        press(dividers()[1], 'End');
        // 16 — NOT 17, which would leave principal with no grades.
        expect(valueOf(dividers()[1])).toBe(16);
        expect(screen.getByText('Principal AH17')).toBeTruthy();
        expectContiguousPartitionCovering7to17();

        press(dividers()[1], 'Home');
        // 8, because the lower divider is parked at AH7.
        expect(valueOf(dividers()[1])).toBe(8);
        expect(screen.getByText('Senior AH8')).toBeTruthy();
        expectContiguousPartitionCovering7to17();
    });

    it('cannot be driven into a gap or an overlap, however hard it is pushed', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        // Far past the bottom of the scale.
        press(dividers()[0], 'ArrowLeft', 30);
        expect(valueOf(dividers()[0])).toBe(7);
        expectContiguousPartitionCovering7to17();

        // Far past the OTHER divider, which is what would produce an overlap.
        press(dividers()[0], 'ArrowRight', 30);
        expect(valueOf(dividers()[0])).toBe(13);
        expect(valueOf(dividers()[1])).toBe(14);
        expectContiguousPartitionCovering7to17();

        // Now squeeze from the other side: the upper divider down onto the lower.
        press(dividers()[1], 'ArrowLeft', 30);
        expect(valueOf(dividers()[1])).toBe(14);
        expectContiguousPartitionCovering7to17();

        // And the upper divider past the top of the scale.
        press(dividers()[1], 'ArrowRight', 30);
        expect(valueOf(dividers()[1])).toBe(16);
        expectContiguousPartitionCovering7to17();

        // Both at once, alternating, ending with everything crushed to the left.
        press(dividers()[0], 'Home');
        press(dividers()[1], 'Home');
        expect(valueOf(dividers()[0])).toBe(7);
        expect(valueOf(dividers()[1])).toBe(8);
        expect(screen.getByText('Junior AH7')).toBeTruthy();
        expect(screen.getByText('Senior AH8')).toBeTruthy();
        expect(screen.getByText('Principal AH9–AH17')).toBeTruthy();
        expectContiguousPartitionCovering7to17();

        // …and crushed to the right.
        press(dividers()[1], 'End');
        press(dividers()[0], 'End');
        expect(valueOf(dividers()[0])).toBe(15);
        expect(valueOf(dividers()[1])).toBe(16);
        expect(screen.getByText('Junior AH7–AH15')).toBeTruthy();
        expect(screen.getByText('Senior AH16')).toBeTruthy();
        expect(screen.getByText('Principal AH17')).toBeTruthy();
        expectContiguousPartitionCovering7to17();

        // Generate is not blocked by the bands at any point above — the only thing
        // it is waiting for is a staff pool.
        expect(screen.getByText(/add at least one person to the staff table/i)).toBeTruthy();
    });

    it('drags with a pointer, snapping to the nearest grade line, and clamps', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        stubRulerWidth();
        const lower = dividers()[0];

        // A press GRABS the handle and does not move it. The x used here is 11px past
        // the line — still inside the 24px-wide handle, but far enough that it would
        // snap to the NEXT line (AH13) if pointerdown committed. It must not.
        fireEvent.pointerDown(lower, { pointerId: 1, clientX: xOfLineAfter(12) + 11 });
        expect(valueOf(dividers()[0])).toBe(12);

        // Drag to the line just after AH9.
        fireEvent.pointerMove(lower, { pointerId: 1, clientX: xOfLineAfter(9) });
        expect(valueOf(dividers()[0])).toBe(9);
        expect(screen.getByText('Junior AH7–AH9')).toBeTruthy();
        expect(screen.getByText('Senior AH10–AH14')).toBeTruthy();
        expectContiguousPartitionCovering7to17();

        // NEAREST line, not the cell the pointer is inside — which is a claim about
        // rounding, so it is tested on both sides of a cell's midpoint. Below the
        // midpoint of AH11's cell it stays on the AH10 line…
        fireEvent.pointerMove(lower, { pointerId: 1, clientX: xOfLineAfter(10) + 6 });
        expect(valueOf(dividers()[0])).toBe(10);
        // …and past the midpoint it moves on to the next line rather than lagging a
        // whole grade behind the pointer (a `floor` here would answer AH9).
        fireEvent.pointerMove(lower, { pointerId: 1, clientX: xOfLineAfter(9) + 11 });
        expect(valueOf(dividers()[0])).toBe(10);
        fireEvent.pointerMove(lower, { pointerId: 1, clientX: xOfLineAfter(11) + 11 });
        expect(valueOf(dividers()[0])).toBe(12);
        expectContiguousPartitionCovering7to17();

        // Dragged way past the right-hand end, it stops one grade below the upper
        // divider instead of overlapping it.
        fireEvent.pointerMove(lower, { pointerId: 1, clientX: RULER_LEFT + RULER_WIDTH * 3 });
        expect(valueOf(dividers()[0])).toBe(13);
        expectContiguousPartitionCovering7to17();

        // Released, the handle stops tracking the pointer.
        fireEvent.pointerUp(lower, { pointerId: 1 });
        fireEvent.pointerMove(lower, { pointerId: 1, clientX: RULER_LEFT });
        expect(valueOf(dividers()[0])).toBe(13);
    });

    it('moves the grade range on a task\'s band chips as the divider moves', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        fireEvent.change(screen.getByLabelText('Task row 1 name'), { target: { value: 'Governance' } });
        fireEvent.click(screen.getByLabelText('Task row 1: Senior may lead'));
        fireEvent.click(screen.getByLabelText('Task row 1: Principal may lead'));

        // The chips' caption is the merged span of the two ticked bands.
        expect(screen.getByText('AH13–AH17')).toBeTruthy();

        press(dividers()[0], 'ArrowLeft', 2); // junior|senior: 12 -> 10
        expect(screen.queryByText('AH13–AH17')).toBeNull();
        expect(screen.getByText('AH11–AH17')).toBeTruthy();
        // …and the ruler's own readout agrees with the chip, from the same helper.
        expect(screen.getByText('Junior AH7–AH10')).toBeTruthy();
        expect(screen.getByText('Senior AH11–AH14')).toBeTruthy();
        expectContiguousPartitionCovering7to17();
    });

    it('hands the moved boundaries to the ENGINE, in its own validator and its output', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        // Two people, neither of them in the senior band as it is shipped, and one
        // task only a senior may lead.
        fireEvent.change(screen.getByLabelText('Staff row 1 name'), { target: { value: 'Sam Wilson' } });
        fireEvent.change(screen.getByLabelText('Staff row 1 job grade'), { target: { value: 'AH12' } });
        fireEvent.change(screen.getByLabelText('Staff row 2 name'), { target: { value: 'Riri Williams' } });
        fireEvent.change(screen.getByLabelText('Staff row 2 job grade'), { target: { value: 'AH7' } });
        fireEvent.change(screen.getByLabelText('Task row 1 name'), { target: { value: 'Governance' } });
        fireEvent.click(screen.getByLabelText('Task row 1: Senior may lead'));
        fireEvent.change(screen.getByLabelText(/^weeks$/i), { target: { value: '1' } });
        fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-09-07' } });

        // `validateRosterV2Config` refuses, and its reason quotes the boundary
        // numbers the ruler is showing — which is the proof they reached the engine.
        // RENAMED (language pass): "Generate Sandbox Roster" -> "Draft roster".
        const generate = screen.getByRole('button', { name: /^draft roster$/i });
        expect(generate.disabled).toBe(true);
        expect(screen.getByText(/Senior-band staff \(AH13–AH14\)/)).toBeTruthy();

        // Move the boundary down one grade: senior becomes AH12–AH14, so Sam Wilson
        // qualifies and the engine's objection disappears.
        press(dividers()[0], 'ArrowLeft');
        expect(screen.queryByText(/Senior-band staff \(AH13–AH14\)/)).toBeNull();
        expect(screen.getByText('Senior AH12–AH14')).toBeTruthy();
        expect(generate.disabled).toBe(false);

        // …and the generated roster is led by the person the moved boundary admitted.
        fireEvent.click(generate);
        expect(screen.getAllByText(/Lead: Sam Wilson/).length).toBeGreaterThan(0);
        // Sandbox: still nothing written anywhere.
        expect(setDoc).not.toHaveBeenCalled();
    });
});

// ─── 4. THE RULER'S OWN PROP CONTRACT ─────────────────────────────────────────
//
// Rendered directly, because two of its properties are about what it does with a
// prop `RosterView` cannot currently hand it: exactly which callbacks one move
// emits, and what it does when the boundaries it is given are not a partition at
// all. Driving those through `RosterView` is impossible by construction — which is
// the feature — so the component is driven straight.

describe('the band ruler as a component: callbacks and impossible input', () => {
    const GAPPED = {
        junior: { min: '7', max: '11' },
        senior: { min: '13', max: '14' },
        principal: { min: '15', max: '17' },
    };

    it('emits exactly the two patches that keep the bands contiguous', () => {
        const onChange = vi.fn();
        render(
            <BandBoundaryEditor
                inputs={bandsToInputs(DEFAULT_GRADE_BANDS)}
                onChange={onChange}
                reason={null}
            />,
        );

        press(dividers()[0], 'ArrowLeft');
        // Both sides of the divider, together. Emitting only one of them is exactly
        // how a gap (or an overlap) would get into the state.
        expect(onChange.mock.calls).toEqual([
            ['junior', 'max', '11'],
            ['senior', 'min', '12'],
        ]);

        onChange.mockClear();
        press(dividers()[1], 'ArrowRight');
        expect(onChange.mock.calls).toEqual([
            ['senior', 'max', '15'],
            ['principal', 'min', '16'],
        ]);
    });

    it('is a silent no-op at a limit rather than firing a clamped write', () => {
        const onChange = vi.fn();
        render(
            <BandBoundaryEditor
                inputs={bandsToInputs({ junior: [7, 7], senior: [8, 14], principal: [15, 17] })}
                onChange={onChange}
                reason={null}
            />,
        );

        expect(dividers()[0].getAttribute('aria-valuenow')).toBe('7');
        press(dividers()[0], 'ArrowLeft');
        press(dividers()[0], 'Home');
        expect(onChange).not.toHaveBeenCalled();
    });

    it('still renders validateGradeBands\' reason — the backstop is wired, not decorative', () => {
        render(
            <BandBoundaryEditor
                inputs={bandsToInputs(DEFAULT_GRADE_BANDS)}
                onChange={vi.fn()}
                reason="Grade bands leave AH12 in no band at all — a message from the validator."
            />,
        );

        expect(screen.getByText(/a message from the validator/)).toBeTruthy();
    });

    it('says it cannot show boundaries that are not a partition, and corrects nothing on render', () => {
        const onChange = vi.fn();
        render(<BandBoundaryEditor inputs={GAPPED} onChange={onChange} reason={null} />);

        // AH12 is in no band in the input. The ruler cannot draw that, so it says so
        // rather than drawing something that is not what will be generated.
        expect(screen.getByText(/not one unbroken cut of the scale/i)).toBeTruthy();
        // Nearest cut it can express: senior absorbs the orphaned AH12.
        expect(dividers()[0].getAttribute('aria-valuenow')).toBe('11');
        expect(dividers()[1].getAttribute('aria-valuenow')).toBe('14');
        expect(screen.getByText('Senior AH12–AH14')).toBeTruthy();
        // Nothing was rewritten behind the user's back.
        expect(onChange).not.toHaveBeenCalled();

        // The first deliberate move ADOPTS the whole partition — senior's floor is
        // patched too, even though the divider that moved was junior's ceiling.
        press(dividers()[0], 'ArrowLeft');
        expect(onChange.mock.calls).toEqual([
            ['junior', 'max', '10'],
            ['senior', 'min', '11'],
        ]);
    });

    it('still draws a legal ruler from boundaries that are nowhere near legal', () => {
        // Every bound here is a number, and not one of them describes a band this
        // scale has room for: junior claims the whole scale, senior and principal
        // start off the end of it. The dividers still have to land somewhere legal —
        // an `aria-valuenow` of 17 or 18 would be a slider outside its own range, and
        // the region either side of it would have no grades in it.
        render(
            <BandBoundaryEditor
                inputs={{
                    junior: { min: '7', max: '17' },
                    senior: { min: '18', max: '18' },
                    principal: { min: '19', max: '20' },
                }}
                onChange={vi.fn()}
                reason={null}
            />,
        );

        expect(screen.getByText(/not one unbroken cut of the scale/i)).toBeTruthy();
        // Pushed as high as they can go while leaving one grade for each band above.
        expect(dividers()[0].getAttribute('aria-valuenow')).toBe('15');
        expect(dividers()[1].getAttribute('aria-valuenow')).toBe('16');
        expect(dividers()[0].getAttribute('aria-valuemax')).toBe('15');
        expect(dividers()[1].getAttribute('aria-valuemax')).toBe('16');
        expect(screen.getByText('Junior AH7–AH15')).toBeTruthy();
        expect(screen.getByText('Senior AH16')).toBeTruthy();
        expect(screen.getByText('Principal AH17')).toBeTruthy();
    });

    it('does not move at all when the ruler has no measurable width', () => {
        const onChange = vi.fn();
        render(
            <BandBoundaryEditor
                inputs={bandsToInputs(DEFAULT_GRADE_BANDS)}
                onChange={onChange}
                reason={null}
            />,
        );

        // jsdom's real answer for every element: 0×0. A drag has no fraction to
        // compute, so it must do nothing — snapping the divider to AH7 because the
        // width was zero would be a silent data change caused by a layout accident.
        const lower = dividers()[0];
        fireEvent.pointerDown(lower, { pointerId: 1, clientX: 40 });
        fireEvent.pointerMove(lower, { pointerId: 1, clientX: 400 });
        expect(onChange).not.toHaveBeenCalled();
        expect(lower.getAttribute('aria-valuenow')).toBe('12');
    });
});
