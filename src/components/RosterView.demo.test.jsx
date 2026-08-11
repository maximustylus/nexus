/**
 * ==============================================================================
 * ROSTER VIEW — SANDBOX / DEMO MODE (component tests)
 * ==============================================================================
 * Runner: Vitest + @testing-library/react (jsdom)
 * Run:    npx vitest run src/components/RosterView.demo.test.jsx
 *
 * This file is the deploy gate for the demo rostering path. Nobody can log into
 * the app to click through it before it ships, so these assertions are the
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
 *   4. THE GRADE GATES BIND IN THE RENDERED OUTPUT. A task restricted to
 *      Senior/Principal is never shown with a junior as its lead, and the
 *      converse gate holds too — checked by reading the lead's name out of the
 *      calendar and looking its grade up in the fixture, not by trusting the
 *      engine's own report.
 *   5. A configuration the engine would refuse cannot be SUBMITTED: Generate is
 *      disabled and the engine's own reason is on screen beside it.
 *   6. THE HOURS MODEL IS REACHABLE, and reaching it changes the roster: a task's
 *      length typed into its drawer, a department week typed beside the ruler, and
 *      the resulting per-person hours, weekly cap and hours-bound unfilled slots
 *      all on screen. Sections 6 and 7 below are the answer to the audit's D1 —
 *      "1,722 engine lines and 178 tests that no user can reach" — so they drive
 *      the real controls rather than calling the mapper.
 *   7. A MULTI-SLOT SHIFT SHOWS ALL OF ITS PEOPLE. A three-slot task renders three
 *      distinct assignees in the calendar cell, not the two that fit
 *      `buildShiftStaffLabel`, and a slot nobody can fill is named as that slot.
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
    // 🤝 Added with the coverage-request listener RosterView now owns. In demo mode
    // NONE of these may be called — `query` and `where` join the no-traffic
    // assertion below for exactly that reason.
    query: vi.fn(() => ({ __mock: 'query' })),
    where: vi.fn(() => ({ __mock: 'where' })),
    updateDoc: vi.fn(() => Promise.resolve()),
}));

// Demo mode is the whole subject of this file, so the context is mocked rather
// than driven: the real provider gates its children on a Firebase Auth callback,
// which would make every test here wait on auth to answer for no benefit.
vi.mock('../context/NexusContext', () => ({
    useNexus: () => ({ isDemo: true }),
    NexusProvider: ({ children }) => children,
}));

import { doc, collection, onSnapshot, setDoc, addDoc, query, where, getDoc, updateDoc } from 'firebase/firestore';
import RosterView from './RosterView';
import { DEMO_EXAMPLE_DEPARTMENT } from '../data/mockData';
import { generateRosterV2, bandOfGrade } from '../utils/rosterEngineV2';

// --- HELPERS -----------------------------------------------------------------

const VISITOR = { name: 'Visiting Therapist', role: 'staff', email: 'visitor@example.org' };

const openConfigure = () => {
    fireEvent.click(screen.getByRole('button', { name: /configure/i }));
};

const loadExample = () => {
    fireEvent.click(screen.getByRole('button', { name: /load example department/i }));
};

/**
 * RENAMED (language pass): the sandbox button said "Generate Sandbox Roster" and now
 * says "Draft roster" — a roster master drafts a roster; only a machine generates
 * one. Live mode's "Generate Roster" is untouched and still pinned byte-exact in
 * `RosterView.wizard.test.jsx`.
 */
const generateButton = () => screen.getByRole('button', { name: /^draft roster$/i });

/**
 * `expect(...).toBeDisabled()` is a jest-dom matcher and this repo has no vitest
 * setup file that registers them (`RosterView.alerts.test.jsx` uses plain
 * matchers throughout). The DOM property is the same claim, without adding a
 * global setup to the project as a side effect of this feature.
 */
const generateIsDisabled = () => generateButton().disabled === true;

/**
 * A validation message appears TWICE by design: once under the row it belongs to
 * and once as the blocking reason above the Generate button. Asserting "at least
 * one" keeps the test about the message being reachable rather than about which
 * of the two places it is in.
 */
const expectOnScreen = (matcher) => {
    const found = screen.getAllByText(matcher);
    expect(found.length).toBeGreaterThan(0);
    return found;
};

const clickGenerate = () => {
    fireEvent.click(generateButton());
};

/**
 * The staff and task tables are driven through their per-cell `aria-label`s.
 * Deliberately not through `getAllByRole('textbox')[n]`: an index into every
 * input on screen would keep passing while pointing at a different column.
 */
const setStaffRow = (row, { name, grade, fte, away } = {}) => {
    const cell = (label) => screen.getByLabelText(`Staff row ${row} ${label}`);
    if (name !== undefined) fireEvent.change(cell('name'), { target: { value: name } });
    if (grade !== undefined) fireEvent.change(cell('job grade'), { target: { value: grade } });
    if (fte !== undefined) fireEvent.change(cell('FTE'), { target: { value: fte } });
    if (away !== undefined) fireEvent.change(cell('away dates'), { target: { value: away } });
};

const setTaskName = (row, name) => {
    fireEvent.change(screen.getByLabelText(`Task row ${row} name`), { target: { value: name } });
};

const clickBandChip = (row, band) => {
    fireEvent.click(screen.getByLabelText(`Task row ${row}: ${band} may lead`));
};

const clickDay = (row, label) => {
    fireEvent.click(screen.getByLabelText(`Task row ${row}: ${label}`));
};

const clickCoLead = (row) => {
    fireEvent.click(screen.getByLabelText(`Task row ${row}: co-lead`));
};

/**
 * HOURS AND SLOTS LIVE BEHIND A PER-ROW DISCLOSURE, closed by default, because the
 * task row already carries a name, three band chips, seven day chips, a co-lead
 * toggle and a remove button. These helpers press the same chevron a visitor would;
 * nothing here reaches into component state.
 */
const toggleTaskMore = (row) => {
    fireEvent.click(screen.getByLabelText(`Task row ${row}: hours and staffing`));
};

const hoursCell = (row) => screen.queryByLabelText(`Task row ${row} hours`);

const setTaskHours = (row, value) => {
    fireEvent.change(screen.getByLabelText(`Task row ${row} hours`), { target: { value } });
};

const setDepartmentHours = ({ week, day } = {}) => {
    if (week !== undefined) {
        fireEvent.change(screen.getByLabelText(/standard working week/i), { target: { value: week } });
    }
    if (day !== undefined) {
        fireEvent.change(screen.getByLabelText(/longest working day/i), { target: { value: day } });
    }
};

const switchToSlotMode = (row) => {
    fireEvent.click(screen.getByLabelText(`Task row ${row}: staffed as a team of slots`));
};

const addSlot = (row) => {
    fireEvent.click(screen.getByRole('button', { name: `Add slot to task ${row}` }));
};

const setSlot = (row, slot, { band, skill } = {}) => {
    if (band !== undefined) {
        fireEvent.change(screen.getByLabelText(`Task row ${row} slot ${slot} band`), { target: { value: band } });
    }
    if (skill !== undefined) {
        fireEvent.change(
            screen.getByLabelText(`Task row ${row} slot ${slot} required skill`),
            { target: { value: skill } },
        );
    }
};

/**
 * Every rendered CALENDAR button for `task`, as its full text content.
 *
 * Filtered to elements that live inside a button, because the task's name also
 * appears in the unfilled-slot list under the calendar — and that entry is the
 * point of the panel, not a stray match to be matched loosely.
 */
const renderedShiftText = (task) =>
    screen.getAllByText(task)
        .map((label) => label.closest('button'))
        .filter(Boolean)
        .map((button) => button.textContent);

/**
 * ONE SQUARE of the month grid, by its date key (`data-date`).
 *
 * "The slot AURA could not staff is rendered in the day it is missing from" is a
 * claim about WHICH square, so the tests below name the square rather than
 * checking that the words appear somewhere on the page.
 */
const dayCell = (dateKey) => document.querySelector(`[data-date="${dateKey}"]`);

/** The "not staffed" markers inside one day's square. */
const gapsInCell = (dateKey) => within(dayCell(dateKey)).queryAllByRole('note');

/** The person view's root, when the person view is the one on screen. */
const personPanel = () => document.querySelector('[data-roster-view="person"]');

const viewButton = (which) =>
    screen.getByRole('button', { name: which === 'grid' ? /^department$/i : /^my week$/i });

const showMyWeek = () => fireEvent.click(viewButton('person'));
const showDepartment = () => fireEvent.click(viewButton('grid'));

/** Every duty the ENGINE gave `person` in September, as `{ date, task }`. */
const engineDutiesFor = (roster, person) =>
    Object.keys(roster).sort()
        .filter((dateKey) => dateKey.startsWith('2026-09-'))
        .flatMap((dateKey) => roster[dateKey]
            .filter((shift) => (shift.assignees || []).includes(person))
            .map((shift) => ({ date: dateKey, task: shift.task, assignees: shift.assignees })));

/**
 * The load table's column headings. Read off `<th>` rather than by text, because
 * the footnote under the table names two of the columns in prose as well, and
 * "is there a Weekly cap COLUMN" is a question about the header row.
 */
const loadTableHeadings = () =>
    Array.from(document.querySelectorAll('th')).map((th) => th.textContent);

const setRun = ({ weeks, startDate }) => {
    if (weeks !== undefined) {
        fireEvent.change(screen.getByLabelText(/^weeks$/i), { target: { value: weeks } });
    }
    if (startDate !== undefined) {
        fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: startDate } });
    }
};

/** [0] is the staff table's, [1] is the task table's — DOM order. */
const addRow = (which) => {
    const buttons = screen.getAllByRole('button', { name: /add row/i });
    fireEvent.click(which === 'staff' ? buttons[0] : buttons[1]);
};

/**
 * The band boundaries are a RULER now, not six number boxes (v2.0 work).
 *
 * That is a deliberate change of kind, not of styling: the bands are DERIVED from
 * where two dividers sit, so a gap, an overlap, an inverted band and an empty box
 * are no longer things a user can express. The old `setBandBound(band, bound, n)`
 * helper — and the two tests that fed it an invalid value to watch the validator
 * catch it — described a control that no longer exists.
 *
 * `dividers()[0]` is the junior|senior boundary, `[1]` is senior|principal, in DOM
 * order. `aria-valuenow` is the grade the divider sits on, which is the junior max
 * and the senior max respectively; the other four numbers follow from those two.
 */
const dividers = () => screen.getAllByRole('slider');

const dividerValue = (index) => Number(dividers()[index].getAttribute('aria-valuenow'));

/** Nudge a divider with the keyboard, the way a keyboard user would. */
const nudgeDivider = (index, key, times = 1) => {
    for (let i = 0; i < times; i += 1) {
        fireEvent.keyDown(dividers()[index], { key });
    }
};

/** Drive a divider to an exact grade, whichever direction that is. */
const setDivider = (index, target) => {
    let guard = 0;
    while (dividerValue(index) !== target && guard < 40) {
        nudgeDivider(index, dividerValue(index) < target ? 'ArrowRight' : 'ArrowLeft');
        guard += 1;
    }
    expect(dividerValue(index)).toBe(target);
};

/**
 * Every rendered shift for `task`, as `{ lead, coLead }`, read out of the
 * calendar's own display string (`buildShiftStaffLabel`'s "Lead: X, Co: Y").
 *
 * This is the point of the band assertions: it checks what a roster master would
 * SEE, not what the engine says it did.
 */
const renderedLeadsFor = (task) =>
    screen.getAllByText(task).map((label) => {
        const text = label.closest('button').textContent;
        const match = /Lead:\s*([^,]+)(?:,\s*Co:\s*(.+))?$/.exec(text);
        if (!match) throw new Error(`No "Lead: …" label on the rendered ${task} shift: ${text}`);
        return { lead: match[1].trim(), coLead: (match[2] || '').trim() };
    });

/** The fixture's own answer for "what band is this person in?" */
const bandOf = (name) => {
    const person = DEMO_EXAMPLE_DEPARTMENT.staff.find((entry) => entry.name === name);
    if (!person) throw new Error(`${name} is not in the example department`);
    return bandOfGrade(person.grade, DEMO_EXAMPLE_DEPARTMENT.rules.bands);
};

/**
 * Every Firestore call site RosterView has, in one assertion.
 *
 * The original five are untouched. `query`/`where`/`getDoc`/`updateDoc` were ADDED
 * when the coverage-request surface moved into this view: the listener and the
 * accept/decline mutation are four more ways demo mode could reach live data, so
 * they belong in the same single assertion rather than in a separate one that a
 * future test could forget to call.
 */
const expectNoFirestoreTraffic = () => {
    expect(setDoc).not.toHaveBeenCalled();
    expect(addDoc).not.toHaveBeenCalled();
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(doc).not.toHaveBeenCalled();
    expect(collection).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(where).not.toHaveBeenCalled();
    expect(getDoc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
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
     * input shape, so this is not a re-implementation of the component's tables →
     * config mapping: if that mapping drops a grade, a skill, an FTE, a lead band
     * or the band boundaries, the two rosters diverge and these assertions fail.
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

    it('the fixture is band-aware, and the band gates cost it nothing', () => {
        // Every one of the twelve has a grade, so the sandbox's headline run does
        // not open on an "N staff members have no job grade recorded" warning.
        for (const person of DEMO_EXAMPLE_DEPARTMENT.staff) {
            expect(bandOfGrade(person.grade, DEMO_EXAMPLE_DEPARTMENT.rules.bands)).toBeTruthy();
        }
        // At least one of each band, mostly juniors.
        const bands = DEMO_EXAMPLE_DEPARTMENT.staff.map((person) => bandOf(person.name));
        expect(bands.filter((band) => band === 'principal').length).toBeGreaterThanOrEqual(1);
        expect(bands.filter((band) => band === 'senior').length).toBeGreaterThanOrEqual(2);
        expect(bands.filter((band) => band === 'junior').length).toBeGreaterThan(bands.length / 2);

        // Two tasks are band-gated, in both directions.
        const gated = DEMO_EXAMPLE_DEPARTMENT.tasks.filter((task) => task.leadBands);
        expect(gated.length).toBeGreaterThanOrEqual(2);
        expect(gated.map((task) => task.leadBands)).toContainEqual(['senior', 'principal']);
        expect(gated.map((task) => task.leadBands)).toContainEqual(['junior']);

        // …and the gates did not create a single extra unfilled slot: still the
        // ONE CPET-on-leave one, and no warnings.
        expect(expected.unfilled).toHaveLength(1);
        expect(expected.unfilled[0].task).toBe('Paediatric CPET');
        expect(expected.warnings).toEqual([]);
    });

    it('renders shifts derived from the engine, and never calls Firestore', () => {
        render(<RosterView user={VISITOR} />);

        // Before generating: an empty calendar that says so, rather than 13
        // hardcoded MOCK_ROSTER events on 17–18 Feb 2026.
        expect(screen.getByText(/no sandbox roster yet/i)).toBeTruthy();

        openConfigure();
        loadExample();
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

    it('never shows a junior leading the Senior/Principal-gated clinic', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        loadExample();
        clickGenerate();

        // Read out of the CALENDAR, then looked up in the fixture. A grade that
        // failed to travel from the table to the engine would show up here as a
        // junior leading the clinic — the exact failure the gate exists to stop.
        const clinics = renderedLeadsFor('Outpatient Clinic');
        expect(clinics.length).toBeGreaterThan(0);
        for (const { lead } of clinics) {
            expect(['senior', 'principal']).toContain(bandOf(lead));
        }

        // The converse gate, so this is not passing because nothing is gated:
        // Inpatient Rounds may only be led by a junior.
        const rounds = renderedLeadsFor('Inpatient Rounds');
        expect(rounds.length).toBeGreaterThan(0);
        for (const { lead } of rounds) {
            expect(bandOf(lead)).toBe('junior');
        }

        // Bands gate the LEAD only — a senior co-leading a junior-led round is
        // the supervision shape, not a violation. Asserted so that a future
        // change which starts gating co-leads has to come past this line.
        expect(rounds.some(({ coLead }) => coLead !== '')).toBe(true);

        expectNoFirestoreTraffic();
    });

    it('reports the effective start date, the load table and the one unfilled slot', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        loadExample();
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
        // …and now his grade and the band it resolves to, on the same row.
        expect(within(row).getByText(partTimer.grade)).toBeTruthy();
        expect(within(row).getByText(/junior/i)).toBeTruthy();

        // The principal is reported as one, so the table is not just echoing the
        // grade string back with a fixed label beside it.
        const principal = DEMO_EXAMPLE_DEPARTMENT.staff.find(
            (person) => bandOf(person.name) === 'principal',
        );
        const principalRow = screen.getByText(principal.name).closest('tr');
        expect(within(principalRow).getByText(principal.grade)).toBeTruthy();
        expect(within(principalRow).getByText(/principal/i)).toBeTruthy();

        // Requirement: `softPenalty` is never a headline — it is unnormalised and
        // not comparable between configurations, so it must not be on screen.
        expect(screen.queryByText(String(expected.score.softPenalty))).toBeNull();

        // Requirement 6: the no-persistence property, stated on screen.
        expect(screen.getByText(/nothing is saved/i)).toBeTruthy();

        expectNoFirestoreTraffic();
    });

    it('fills the tables from the fixture, including grades and the band editor', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        // Before: five blank staff rows, three blank task rows.
        expect(screen.getByLabelText('Staff row 5 name').value).toBe('');
        expect(screen.queryByLabelText('Staff row 6 name')).toBeNull();

        loadExample();

        DEMO_EXAMPLE_DEPARTMENT.staff.forEach((person, index) => {
            expect(screen.getByLabelText(`Staff row ${index + 1} name`).value).toBe(person.name);
            expect(screen.getByLabelText(`Staff row ${index + 1} job grade`).value).toBe(person.grade);
            expect(screen.getByLabelText(`Staff row ${index + 1} FTE`).value).toBe(String(person.fte));
        });

        // Shuri's leave date arrives as text in the Away column, not hidden in a
        // parallel details object the visitor cannot see.
        const shuriIndex = DEMO_EXAMPLE_DEPARTMENT.staff.findIndex((person) => person.name === 'Shuri');
        expect(screen.getByLabelText(`Staff row ${shuriIndex + 1} away dates`).value).toBe('2026-09-16');

        // The band editor holds the boundaries the fixture's grades were tuned
        // against — this is what makes "exactly one unfilled slot" reproducible.
        // Read off the ruler's two dividers: junior ends at AH12, senior ends at
        // AH14, so the fixture's boundaries are junior 7–12 / senior 13–14 /
        // principal 15–17. (Was four number-box assertions before the ruler.)
        expect(dividerValue(0)).toBe(12);
        expect(dividerValue(1)).toBe(14);
        expectOnScreen(/Junior\s*AH7[–-]AH12/i);
        expectOnScreen(/Principal\s*AH15[–-]AH17/i);

        // The gated task's chips are ticked, and the grade range beside them is
        // rendered from those boundaries.
        const clinicIndex = DEMO_EXAMPLE_DEPARTMENT.tasks.findIndex(
            (task) => task.name === 'Outpatient Clinic',
        );
        expect(screen.getByLabelText(`Task row ${clinicIndex + 1} name`).value).toBe('Outpatient Clinic');
        expect(
            screen.getByLabelText(`Task row ${clinicIndex + 1}: Senior may lead`).getAttribute('aria-pressed'),
        ).toBe('true');
        expect(
            screen.getByLabelText(`Task row ${clinicIndex + 1}: Junior may lead`).getAttribute('aria-pressed'),
        ).toBe('false');
        expect(screen.getAllByText('AH13–AH17').length).toBeGreaterThan(0);

        expectNoFirestoreTraffic();
    });
});

// ─── 2. A TYPED-IN TEAM, NAMES ONLY ───────────────────────────────────────────

describe('demo mode: a visitor types their own team', () => {
    it('generates from names alone — no grade, FTE or leave required', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        setStaffRow(1, { name: 'Aisha Rahman' });
        setStaffRow(2, { name: 'Ben Carter' });
        setStaffRow(3, { name: 'Chloe Ng' });
        setStaffRow(4, { name: 'Daniel Osei' });
        setTaskName(1, 'Ward Round');
        setTaskName(2, 'Outpatient Clinic');
        fireEvent.change(screen.getByLabelText(/^weeks$/i), { target: { value: '1' } });
        fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-09-07' } });

        clickGenerate();

        // Hand-written rather than built with the mapping function, so a mapping
        // bug cannot cancel itself out: this is the config the tables above are
        // claimed to mean, including the defaults the columns were left at
        // (1.0 FTE, Mon–Fri, one co-lead, no lead-band restriction) and the
        // band boundaries the editor is prefilled with.
        const expected = generateRosterV2({
            startDate: '2026-09-07',
            weeks: 1,
            staff: [
                { name: 'Aisha Rahman', fte: 1.0, skills: [], unavailable: [] },
                { name: 'Ben Carter', fte: 1.0, skills: [], unavailable: [] },
                { name: 'Chloe Ng', fte: 1.0, skills: [], unavailable: [] },
                { name: 'Daniel Osei', fte: 1.0, skills: [], unavailable: [] },
            ],
            tasks: [
                { name: 'Ward Round', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1 },
                { name: 'Outpatient Clinic', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1 },
            ],
            rules: { bands: { junior: [7, 12], senior: [13, 14], principal: [15, 17] } },
        });

        expect(expected.ok).toBe(true);
        expect(expected.unfilled).toHaveLength(0);
        expect(screen.getByText(/could not be staffed \(0\)/i)).toBeTruthy();

        // Four names typed, four names in the load table, every one of them
        // rostered — the columns left blank fell through to the defaults.
        for (const name of Object.keys(expected.load)) {
            expect(screen.getByText(name)).toBeTruthy();
            expect(expected.load[name].duties).toBeGreaterThan(0);
        }

        const firstDate = Object.keys(expected.roster).sort()[0];
        for (const shift of expected.roster[firstDate]) {
            expect(screen.getAllByText(shift.staff).length).toBeGreaterThan(0);
        }

        // Nobody's grade was invented for them: the load table says so in words.
        expect(screen.getAllByText(/not recorded/i).length).toBeGreaterThan(0);

        expectNoFirestoreTraffic();
    });

    it('takes a grade, a part-time FTE, leave dates and a weekend day from the table', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        setStaffRow(1, { name: 'Aisha Rahman', grade: 'AH14' });
        setStaffRow(2, { name: 'Ben Carter', grade: 'AH8', fte: '0.6', away: '2026-09-08' });
        setStaffRow(3, { name: 'Chloe Ng', grade: 'AH13' });
        setTaskName(1, 'Weekend Cover');
        // Mon–Fri off, Saturday on — the 7-day strip, driven one chip at a time.
        for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) clickDay(1, day);
        clickDay(1, 'Sat');
        setTaskName(2, 'Outpatient Clinic');
        clickBandChip(2, 'Senior');
        clickBandChip(2, 'Principal');

        fireEvent.change(screen.getByLabelText(/^weeks$/i), { target: { value: '1' } });
        fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-09-07' } });

        // The chips report the grade span they imply, live, from the boundaries
        // in the editor above.
        expect(screen.getAllByText('AH13–AH17').length).toBeGreaterThan(0);

        clickGenerate();

        const expected = generateRosterV2({
            startDate: '2026-09-07',
            weeks: 1,
            staff: [
                { name: 'Aisha Rahman', fte: 1.0, skills: [], unavailable: [], grade: 'AH14' },
                { name: 'Ben Carter', fte: 0.6, skills: [], unavailable: ['2026-09-08'], grade: 'AH8' },
                { name: 'Chloe Ng', fte: 1.0, skills: [], unavailable: [], grade: 'AH13' },
            ],
            tasks: [
                { name: 'Weekend Cover', days: [6], leads: 1, coLeads: 1 },
                { name: 'Outpatient Clinic', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1, leadBands: ['senior', 'principal'] },
            ],
            rules: { bands: { junior: [7, 12], senior: [13, 14], principal: [15, 17] } },
        });
        expect(expected.ok).toBe(true);

        // The Saturday task exists, which is only true if the day strip's chip
        // carried engine day 6.
        const saturdays = Object.keys(expected.roster).filter(
            (key) => expected.roster[key].some((shift) => shift.task === 'Weekend Cover'),
        );
        expect(saturdays).toHaveLength(1);
        expect(screen.getAllByText('Weekend Cover').length).toBe(1);

        // Ben is a junior and was on leave on the 8th: he leads no clinic, and he
        // holds no duty at all on 2026-09-08.
        for (const { lead } of renderedLeadsFor('Outpatient Clinic')) {
            expect(lead).not.toBe('Ben Carter');
        }
        for (const shift of expected.roster['2026-09-08'] || []) {
            expect(shift.lead).not.toBe('Ben Carter');
            expect(shift.coLead).not.toBe('Ben Carter');
        }

        // The part-time FTE reached the load table.
        const benRow = screen.getByText('Ben Carter').closest('tr');
        expect(within(benRow).getByText('0.6')).toBeTruthy();
        expect(within(benRow).getByText('AH8')).toBeTruthy();

        expectNoFirestoreTraffic();
    });

    it('warns by name when somebody has no grade and a task is band-gated', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        setStaffRow(1, { name: 'Priya Nair', grade: 'AH15' });
        setStaffRow(2, { name: 'Ungraded Locum' });
        setStaffRow(3, { name: 'Chloe Ng', grade: 'AH9' });
        setTaskName(1, 'Complex Airway Clinic');
        clickBandChip(1, 'Principal');
        setTaskName(2, 'Ward Round');
        fireEvent.change(screen.getByLabelText(/^weeks$/i), { target: { value: '1' } });
        fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-09-07' } });

        clickGenerate();

        // The blank grade was NOT defaulted to AH7 — it was left absent, and the
        // engine's own warning about it is in the warnings panel.
        expect(screen.getByText(/warnings \(/i)).toBeTruthy();
        expect(screen.getByText(/no job grade recorded \(Ungraded Locum\)/i)).toBeTruthy();

        // …and the consequence is real: the locum leads nothing that is gated.
        for (const { lead } of renderedLeadsFor('Complex Airway Clinic')) {
            expect(lead).toBe('Priya Nair');
        }
        // They are still eligible for everything else, which is the other half of
        // the engine's contract.
        expect(screen.getByText('Ungraded Locum')).toBeTruthy();

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
        setStaffRow(1, { name: 'Solo Practitioner' });
        setTaskName(1, 'Ward Round');
        setTaskName(2, 'Outpatient Clinic');
        setTaskName(3, 'Home Visits');
        addRow('task');
        setTaskName(4, 'Group Therapy');
        fireEvent.change(screen.getByLabelText(/^weeks$/i), { target: { value: '1' } });
        fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-09-07' } });

        clickGenerate();

        const expected = generateRosterV2({
            startDate: '2026-09-07',
            weeks: 1,
            staff: [{ name: 'Solo Practitioner', fte: 1.0, skills: [], unavailable: [] }],
            tasks: [
                { name: 'Ward Round', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1 },
                { name: 'Outpatient Clinic', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1 },
                { name: 'Home Visits', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1 },
                { name: 'Group Therapy', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1 },
            ],
            rules: { bands: { junior: [7, 12], senior: [13, 14], principal: [15, 17] } },
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

    it('will not let a configuration the engine rejects be submitted at all', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        // Two rows, one name: every load figure and capacity check would be
        // ambiguous, so the engine refuses rather than generating.
        setStaffRow(1, { name: 'Sam Wilson' });
        setStaffRow(2, { name: 'Sam Wilson' });
        setTaskName(1, 'Ward Round');

        // The engine's OWN reason, verbatim, beside a disabled button — the
        // refusal now happens BEFORE the click rather than into a banner behind
        // the still-open wizard.
        expectOnScreen(/appears twice in the staff pool/i);
        expect(generateIsDisabled()).toBe(true);

        clickGenerate();

        // A refusal must not leave a half-built roster on screen.
        expect(screen.getByText(/no sandbox roster yet/i)).toBeTruthy();
        expectNoFirestoreTraffic();
    });
});

// ─── 4. THE BAND BOUNDARY EDITOR ──────────────────────────────────────────────

describe('demo mode: the band boundary editor', () => {
    /*
     * REPLACED WHEN THE RULER LANDED (v2.0). Two tests used to live here: one fed
     * the old number boxes a gap (junior ends AH11, senior starts AH13, so AH12 is
     * in no band) and one fed them an overlap and an empty string, then asserted
     * that `validateGradeBands`' reason appeared and Generate went disabled.
     *
     * Neither state is expressible any more, and that is the point of the control:
     * the bands are derived from two dividers that constrain each other, so there
     * is no gap to leave, nothing to overlap, and no box to empty. Keeping tests
     * that manufacture an impossible state would have meant keeping the boxes.
     *
     * The stronger claim replaces them below: the invalid states are UNREACHABLE.
     * `RosterView.wizard.test.jsx` drives both dividers to every extreme by
     * keyboard and by pointer and asserts the partition survives; this test states
     * the same property from the visitor's side, where the consequence lives —
     * Generate stays available because there is nothing to refuse.
     */
    it('cannot express a gap or an overlap, so Generate is never blocked by the bands', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        loadExample();

        expect(generateIsDisabled()).toBe(false);

        // Drive the lower divider hard down and the upper hard up, past each other
        // and past both ends of the scale. After every attempt the bands must still
        // partition AH7–AH17 and the configuration must still be generatable.
        nudgeDivider(0, 'ArrowLeft', 25);
        nudgeDivider(1, 'ArrowRight', 25);
        expect(dividerValue(0)).toBeLessThan(dividerValue(1));
        expect(generateIsDisabled()).toBe(false);

        // And the other way: lower divider up past the upper one.
        nudgeDivider(0, 'ArrowRight', 25);
        expect(dividerValue(0)).toBeLessThan(dividerValue(1));
        expect(generateIsDisabled()).toBe(false);

        // No band-partition reason can be on screen, because none is reachable.
        expect(screen.queryByText(/in no band at all/i)).toBeNull();
        expect(screen.queryByText(/overlap/i)).toBeNull();
        expectNoFirestoreTraffic();
    });

    it('moves the grade range shown beside a task\'s chips as a divider moves', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        loadExample();

        expect(screen.getAllByText('AH13–AH17').length).toBeGreaterThan(0);

        // Widen senior downwards by moving the junior|senior divider to AH10:
        // junior AH7–10, senior AH11–14, principal AH15–17. Still a valid
        // partition by construction, so the Senior/Principal chip range follows.
        setDivider(0, 10);

        expect(screen.queryByText('AH13–AH17')).toBeNull();
        expect(screen.getAllByText('AH11–AH17').length).toBeGreaterThan(0);
        expect(screen.getAllByText('AH7–AH10').length).toBeGreaterThan(0);
        expect(generateIsDisabled()).toBe(false);
        expectNoFirestoreTraffic();
    });
});

// ─── 5. PER-ROW REFUSALS ──────────────────────────────────────────────────────

describe('demo mode: the tables refuse bad cells rather than dropping them', () => {
    it('shows a per-row error for an unreadable leave date', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        setStaffRow(1, { name: 'Shuri', away: '16 Sept' });
        setTaskName(1, 'Ward Round');

        // Quoted, so the visitor can see which token AURA could not read. A
        // silently dropped leave date is somebody rostered on the day they are
        // away, which is the one failure this app exists to prevent.
        expectOnScreen(/"16 Sept"/);
        expect(generateIsDisabled()).toBe(true);

        setStaffRow(1, { away: '2026-09-16' });
        expect(generateIsDisabled()).toBe(false);
        expectNoFirestoreTraffic();
    });

    it('shows a per-row error for an out-of-range FTE, and does not clamp it', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        setStaffRow(1, { name: 'Ben Carter', fte: '1.4' });
        setTaskName(1, 'Ward Round');

        expectOnScreen(/FTE 1.4 is outside 0.1–1/i);
        expect(generateIsDisabled()).toBe(true);
        expectNoFirestoreTraffic();
    });

    it('refuses a task with every day unticked', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        setStaffRow(1, { name: 'Aisha Rahman' });
        setTaskName(1, 'Ghost Clinic');
        for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) clickDay(1, day);

        expectOnScreen(/Ghost Clinic has no days ticked/i);
        expect(generateIsDisabled()).toBe(true);
        expectNoFirestoreTraffic();
    });

    it('says out loud that two ticked bands are not a preference order', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        // The top surprise in the engine's limits ledger, on screen where the
        // surprise would happen.
        expect(
            screen.getByText(/Ticking two bands makes both equally eligible — it is not a preference order/i),
        ).toBeTruthy();
    });

    it('adds and removes rows', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        expect(screen.queryByLabelText('Staff row 6 name')).toBeNull();
        addRow('staff');
        expect(screen.getByLabelText('Staff row 6 name')).toBeTruthy();

        setStaffRow(1, { name: 'First' });
        setStaffRow(2, { name: 'Second' });
        fireEvent.click(screen.getByLabelText('Remove staff row 1'));

        // Row 1 is now what row 2 was — the rows are keyed by identity, so the
        // remaining values did not shuffle into the wrong columns.
        expect(screen.getByLabelText('Staff row 1 name').value).toBe('Second');
        expect(screen.queryByLabelText('Staff row 6 name')).toBeNull();
    });
});

// ─── 6. THE HOURS MODEL, DRIVEN FROM THE WIZARD ───────────────────────────────
//
// The audit's D1: the hours model and multi-slot shifts had no surface at all.
// These tests exist to fail if that is ever true again — every one of them presses
// the controls a visitor presses and then reads what the calendar and the report
// actually say.

describe('demo mode: the 42-hour week', () => {
    it('starts with both hours boxes EMPTY, and a duties-only run has no hours columns', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        // Blank, not prefilled with 42 — the engine's hours model switches on the
        // moment a configuration MENTIONS one of these fields, so a helpful default
        // here would judge every visitor's roster against an 8.4-hour day they never
        // set. The number is shown as a placeholder instead.
        const week = screen.getByLabelText(/standard working week/i);
        expect(week.value).toBe('');
        expect(week.getAttribute('placeholder')).toBe('42');
        expect(screen.getByLabelText(/longest working day/i).value).toBe('');
        // The derived day, from the engine's own division, not a retyped 8.4.
        expect(screen.getByLabelText(/longest working day/i).getAttribute('placeholder')).toBe('8.4');
        // 🛡️ CORRECTED (audit HIGH #2). This used to assert the copy
        // "Hours are not being counted … AURA will not apply the 42h week unless
        // you type it", and both the copy and this assertion were false: the
        // engine applies its hours defaults whether or not these boxes are filled.
        // Measured against the v1.8.1 engine — a config naming no hours at all
        // produces byte-identical output, but only because the DUTY cap (2/day)
        // binds before the hours cap (2 default 4h sessions = 8h <= 8.4h). Set a
        // task longer than ~4.2h, or raise the duty cap, and hours bind. So
        // "blank" means DEFAULTS, never "off" — there is no way to switch hours
        // off, and the screen that configures them must not imply there is.
        expect(screen.getByText(/hours are always counted/i)).toBeTruthy();
        expect(screen.queryByText(/hours are not being counted/i)).toBeNull();

        loadExample();
        clickGenerate();

        // The example department states no hours anywhere, so the load table is the
        // one it has always been: no Hours, no Busiest week, no Weekly cap.
        expect(screen.getByText(/load per person/i)).toBeTruthy();
        expect(loadTableHeadings()).toContain('Duties');
        expect(loadTableHeadings()).not.toContain('Hours');
        expect(loadTableHeadings()).not.toContain('Busiest week');
        expect(loadTableHeadings()).not.toContain('Weekly cap');
        expectNoFirestoreTraffic();
    });

    it('follows the typed week when it derives the daily limit', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        setDepartmentHours({ week: '35' });
        // 35 / 5 = 7, and the placeholder has to say so: a department told "8.4"
        // while being generated against 7 would read the shortfall as a bug.
        expect(screen.getByLabelText(/longest working day/i).getAttribute('placeholder')).toBe('7');
        // Reworded with the HIGH #2 fix: "being counted" implied its opposite was
        // reachable. Both branches now say hours ARE counted and differ only in
        // whose limits are used — the typed ones here, the defaults when blank.
        expect(screen.getByText(/hours are counted against the limits above/i)).toBeTruthy();
        expectNoFirestoreTraffic();
    });

    it('takes an hours-per-session from a task drawer and reports hours against the cap', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        setStaffRow(1, { name: 'Solo Scientist' });
        setDepartmentHours({ week: '42' });

        // The drawer is CLOSED by default: no hours cell is on screen until asked.
        expect(hoursCell(1)).toBeNull();
        toggleTaskMore(1);
        expect(hoursCell(1)).toBeTruthy();
        // The engine's own exported default, shown rather than applied silently.
        expect(hoursCell(1).getAttribute('placeholder')).toBe('4');

        setTaskName(1, 'Long Bench');
        setTaskHours(1, '8');
        clickCoLead(1);

        toggleTaskMore(2);
        setTaskName(2, 'Late Review');
        setTaskHours(2, '4');
        clickCoLead(2);

        setRun({ weeks: '1', startDate: '2026-09-07' });
        clickGenerate();

        // Hand-written, as everywhere else in this file, so a mapping bug cannot
        // cancel itself out: this is what the two drawers and the department box are
        // claimed to mean.
        const expected = generateRosterV2({
            startDate: '2026-09-07',
            weeks: 1,
            staff: [{ name: 'Solo Scientist', fte: 1.0, skills: [], unavailable: [] }],
            tasks: [
                { name: 'Long Bench', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 0, hours: 8 },
                { name: 'Late Review', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 0, hours: 4 },
            ],
            rules: { bands: { junior: [7, 12], senior: [13, 14], principal: [15, 17] }, weeklyHours: 42 },
        });
        expect(expected.ok).toBe(true);
        expect(expected.load['Solo Scientist'].hours).toBe(40);

        // (a) The load table now carries hours, the busiest week and the cap.
        const row = screen.getByText('Solo Scientist').closest('tr');
        expect(within(row).getByText('42h')).toBeTruthy();
        // 40h twice: the run's total, and the busiest (only) week of the run.
        expect(within(row).getAllByText('40h')).toHaveLength(2);
        expect(loadTableHeadings()).toEqual(
            ['Name', 'Grade', 'Band', 'FTE', 'Duties', 'Hours', 'Busiest week', 'Weekly cap', 'Per FTE', 'Share'],
        );

        // (b) THE HOURS BOUND SOMETHING. Every Late Review is unstaffed, with the
        // hours, the date and what she already holds named — not silently assigned
        // as a 12-hour day, and not dropped without a word.
        expect(
            screen.getByText(new RegExp(`could not be staffed \\(${expected.unfilled.length}\\)`, 'i')),
        ).toBeTruthy();
        expect(expected.unfilled).toHaveLength(5);
        expect(screen.getByText(expected.unfilled[0].reason)).toBeTruthy();
        expect(expected.unfilled[0].reason).toContain('would reach 12h');
        expect(expected.unfilled[0].reason).toContain('8.4h daily limit');

        // (c) …and the roster on screen holds only the sessions that fit. Late
        // Review is named five times in the unfilled list and NOT ONCE in the
        // calendar, which is the difference between reporting a gap and hiding one.
        expect(renderedShiftText('Long Bench')).toHaveLength(5);
        expect(renderedShiftText('Late Review')).toEqual([]);
        expect(screen.getAllByText('Late Review')).toHaveLength(5);

        // (d) The engine's own hours warning is in the warnings area.
        expect(expected.warnings.length).toBeGreaterThan(0);
        for (const warning of expected.warnings) {
            expect(screen.getByText(warning)).toBeTruthy();
        }
        expect(expected.warnings.some((line) => line.includes('h of work'))).toBe(true);

        expectNoFirestoreTraffic();
    });

    it('keeps what the drawer holds when the drawer is closed again', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        setStaffRow(1, { name: 'Ada Byron' });
        setTaskName(1, 'Long Bench');
        toggleTaskMore(1);
        setTaskHours(1, '8');
        toggleTaskMore(1);

        // The cell is gone from the DOM…
        expect(hoursCell(1)).toBeNull();
        // …but the row says what it is hiding, so a closed drawer is never the only
        // record that this task takes 8 hours.
        expect(screen.getByText(/8h per session/i)).toBeTruthy();

        setRun({ weeks: '1', startDate: '2026-09-07' });
        clickGenerate();

        // And it reached the engine: the hours columns exist, so the model was on —
        // switched on by the task's own length, with both department boxes blank.
        expect(loadTableHeadings()).toContain('Weekly cap');
        const row = screen.getByText('Ada Byron').closest('tr');
        // 5 sessions of 8h in one week, against the 42h the engine defaults to once
        // hours are in force at all.
        expect(within(row).getAllByText('40h')).toHaveLength(2);
        expect(within(row).getByText('42h')).toBeTruthy();
        expectNoFirestoreTraffic();
    });

    it('refuses an unreadable hours cell, and will not let the drawer hide it', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        setStaffRow(1, { name: 'Ada Byron' });
        setTaskName(1, 'Typo Clinic');
        toggleTaskMore(1);
        setTaskHours(1, 'four');

        expectOnScreen(/"four"/);
        expect(generateIsDisabled()).toBe(true);

        // Pressing the chevron cannot collapse a row whose hidden cell is the reason
        // Generate is disabled — a refusal pointing at a control that is not on
        // screen is a refusal the visitor cannot act on.
        toggleTaskMore(1);
        expect(hoursCell(1)).toBeTruthy();
        expectOnScreen(/"four"/);

        // Fixed, the row folds away again and generation is available. It did NOT
        // fold the moment the value became readable: a box vanishing from under the
        // cursor mid-correction is worse than a chevron that refuses.
        setTaskHours(1, '8');
        expect(generateIsDisabled()).toBe(false);
        expect(hoursCell(1)).toBeTruthy();
        toggleTaskMore(1);
        expect(hoursCell(1)).toBeNull();
        expectNoFirestoreTraffic();
    });

    it('puts the engine\'s rolling four-week warning in the warnings area', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        // Leave at the front of week 1 and the back of week 5, so every individual
        // week stays inside 42h while one straddling 28-day window holds 176. Driven
        // entirely through the wizard's own controls — the Away column, the day
        // chips, the task drawer and the department box.
        setStaffRow(1, {
            name: 'Ada Byron',
            away: '2026-09-07, 2026-09-08, 2026-09-09, 2026-10-08, 2026-10-09, 2026-10-10, 2026-10-11',
        });
        setDepartmentHours({ week: '42' });
        setTaskName(1, 'Bench A');
        for (const day of ['Sat', 'Sun']) clickDay(1, day);
        clickCoLead(1);
        toggleTaskMore(1);
        setTaskHours(1, '8');
        setRun({ weeks: '5', startDate: '2026-09-07' });

        clickGenerate();

        const expected = generateRosterV2({
            startDate: '2026-09-07',
            weeks: 5,
            staff: [{
                name: 'Ada Byron',
                fte: 1.0,
                skills: [],
                unavailable: [
                    '2026-09-07', '2026-09-08', '2026-09-09',
                    '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
                ],
            }],
            tasks: [{ name: 'Bench A', days: [0, 1, 2, 3, 4, 5, 6], leads: 1, coLeads: 0, hours: 8 }],
            rules: { bands: { junior: [7, 12], senior: [13, 14], principal: [15, 17] }, weeklyHours: 42 },
        });
        expect(expected.ok).toBe(true);

        const rolling = expected.warnings.find((line) => line.includes('28 days'));
        expect(rolling).toContain('Ada Byron is rostered 176h');
        // ON SCREEN, verbatim, in the warnings panel — this warning is the whole
        // reason the four-week total is measured at all, and it is the one the engine
        // deliberately does not enforce, so a report that swallowed it would leave a
        // 176-hour month looking like a clean run.
        expect(screen.getByText(rolling)).toBeTruthy();
        expect(screen.getByText(new RegExp(`warnings \\(${expected.warnings.length}\\)`, 'i'))).toBeTruthy();

        // Not enforced: the hours it warns about really are rostered, and every
        // individual week is inside the cap, so nothing else would have caught it.
        const row = screen.getByText('Ada Byron').closest('tr');
        expect(within(row).getByText('176h')).toBeTruthy();
        expect(within(row).getByText('40h')).toBeTruthy();
        expect(expected.load['Ada Byron'].hoursPerWeek).toEqual([32, 40, 40, 40, 24]);

        expectNoFirestoreTraffic();
    });

    it('refuses an out-of-range department week as a department problem', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        setStaffRow(1, { name: 'Ada Byron' });
        setTaskName(1, 'Long Bench');
        setDepartmentHours({ week: '400' });

        expectOnScreen(/must be more than 0 and at most 168/i);
        expect(generateIsDisabled()).toBe(true);

        setDepartmentHours({ week: '42' });
        expect(generateIsDisabled()).toBe(false);
        expectNoFirestoreTraffic();
    });
});

// ─── 7. MULTI-SLOT SHIFTS, DRIVEN FROM THE WIZARD ─────────────────────────────

describe('demo mode: a shift that needs a whole team', () => {
    /** Prin/Sen/Jun, one in each band, both of the seniors holding the skill. */
    const fillTrioStaff = () => {
        setStaffRow(1, { name: 'Prin', grade: 'AH16' });
        setStaffRow(2, { name: 'Sen', grade: 'AH13' });
        setStaffRow(3, { name: 'Jun', grade: 'AH8' });
    };

    /** Task row 1 as a principal + senior + junior trio. */
    const buildTrioTask = () => {
        setTaskName(1, 'Weekend Witnessing');
        toggleTaskMore(1);
        switchToSlotMode(1);
        // The list opens at two entries, both open to any grade; the third is added.
        addSlot(1);
        setSlot(1, 1, { band: 'principal' });
        setSlot(1, 2, { band: 'senior' });
        setSlot(1, 3, { band: 'junior' });
    };

    const TRIO_CONFIG = {
        startDate: '2026-09-07',
        weeks: 1,
        staff: [
            { name: 'Prin', fte: 1.0, skills: [], unavailable: [], grade: 'AH16' },
            { name: 'Sen', fte: 1.0, skills: [], unavailable: [], grade: 'AH13' },
            { name: 'Jun', fte: 1.0, skills: [], unavailable: [], grade: 'AH8' },
        ],
        tasks: [{
            name: 'Weekend Witnessing',
            days: [1, 2, 3, 4, 5],
            slots: [{ band: 'principal' }, { band: 'senior' }, { band: 'junior' }],
        }],
        rules: { bands: { junior: [7, 12], senior: [13, 14], principal: [15, 17] } },
    };

    it('renders all THREE assignees in the calendar, not the two that fit the label', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        fillTrioStaff();
        buildTrioTask();

        // While the task is a team, the controls the engine would refuse alongside
        // `slots` are not on screen at all — they are not shown-and-ignored.
        expect(screen.queryByLabelText('Task row 1: Senior may lead')).toBeNull();
        expect(screen.queryByLabelText('Task row 1: co-lead')).toBeNull();
        expect(screen.getByText(/set per slot below/i)).toBeTruthy();

        setRun({ weeks: '1', startDate: '2026-09-07' });
        clickGenerate();

        const expected = generateRosterV2(TRIO_CONFIG);
        expect(expected.ok).toBe(true);
        expect(expected.unfilled).toEqual([]);
        expect(expected.roster['2026-09-07'][0].assignees).toEqual(['Prin', 'Sen', 'Jun']);

        // THE POINT. `shift.staff` is a two-name string by contract, so the calendar
        // used to lose the third person entirely (audit D2). All three are now on the
        // cell, and the first line is byte-for-byte the label it always was.
        const cells = renderedShiftText('Weekend Witnessing');
        expect(cells).toHaveLength(5);
        for (const text of cells) {
            expect(text).toContain('Lead: Prin, Co: Sen');
            expect(text).toContain('Also: Jun');
        }
        // Three DISTINCT people, which `leads`/`coLeads` could not express.
        expect(new Set(expected.roster['2026-09-07'][0].assignees).size).toBe(3);

        // The highest grade present is the accountable lead — not the first slot.
        expect(expected.roster['2026-09-07'][0].lead).toBe('Prin');

        // Everybody on the trio is in the load table, including the third.
        for (const name of ['Prin', 'Sen', 'Jun']) {
            expect(screen.getByText(name)).toBeTruthy();
            expect(expected.load[name].duties).toBe(5);
        }

        expectNoFirestoreTraffic();
    });

    it('gates a slot on a skill, and refuses one nobody in the pool holds', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        fillTrioStaff();
        buildTrioTask();
        setSlot(1, 2, { skill: 'Witnessing' });

        // A typed-in team holds no skills at all — the staff table has no skills
        // column, by the same decision that carries them invisibly on the row — so
        // the engine refuses, naming the slot and the skill, BEFORE any click. That
        // is the right answer and it is also a real asymmetry in this wizard: the
        // only pool with skills is the example department's. Recorded here rather
        // than left for somebody to discover, and it is why the mapper's own suite
        // proves the skill BINDS on a pool that does hold it.
        expectOnScreen(/slot 2 requires skill Witnessing, which nobody in the staff pool holds/i);
        expect(generateIsDisabled()).toBe(true);

        // Clearing the skill is the way out, and the field says so on screen.
        expectOnScreen(/somebody in the staff pool has to hold it/i);
        setSlot(1, 2, { skill: '' });
        expect(generateIsDisabled()).toBe(false);
        expectNoFirestoreTraffic();
    });

    it('names the slot it could not fill, rather than calling it an unknown duty', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        fillTrioStaff();
        // The principal is away on the Monday, so the trio becomes a pair that day.
        setStaffRow(1, { away: '2026-09-07' });
        buildTrioTask();
        setRun({ weeks: '1', startDate: '2026-09-07' });
        clickGenerate();

        const expected = generateRosterV2({
            ...TRIO_CONFIG,
            staff: [
                { ...TRIO_CONFIG.staff[0], unavailable: ['2026-09-07'] },
                TRIO_CONFIG.staff[1],
                TRIO_CONFIG.staff[2],
            ],
        });
        expect(expected.ok).toBe(true);

        const monday = expected.unfilled.filter((slot) => slot.date === '2026-09-07');
        expect(monday).toHaveLength(1);
        expect(monday[0].role).toBe('principal slot');

        // `describeShiftRole` knows only 'lead' and 'coLead' and answers "unknown
        // duty" for anything else; the panel shows the slot's own name instead.
        expect(screen.getByText('principal slot')).toBeTruthy();
        expect(screen.queryByText(/unknown duty/i)).toBeNull();
        expect(screen.getByText(monday[0].reason)).toBeTruthy();
        expect(monday[0].reason).toContain('on leave');

        // The rest of the trio was still staffed: a missing principal does not
        // cancel the shift, and the pair that ran is on the calendar.
        const cells = renderedShiftText('Weekend Witnessing');
        expect(cells.some((text) => text.includes('Lead: Sen, Co: Jun'))).toBe(true);
        expectNoFirestoreTraffic();
    });

    it('offers two to four slots, and switching back restores the old shape', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        fillTrioStaff();
        setTaskName(1, 'Weekend Witnessing');
        toggleTaskMore(1);
        switchToSlotMode(1);

        // Two to start with; a fourth can be added and a fifth cannot.
        expect(screen.getByLabelText('Task row 1 slot 2 band')).toBeTruthy();
        expect(screen.queryByLabelText('Task row 1 slot 3 band')).toBeNull();
        addSlot(1);
        addSlot(1);
        expect(screen.getByLabelText('Task row 1 slot 4 band')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Add slot to task 1' }).disabled).toBe(true);

        // …and the last two cannot be removed below the minimum.
        fireEvent.click(screen.getByLabelText('Remove task row 1 slot 4'));
        fireEvent.click(screen.getByLabelText('Remove task row 1 slot 3'));
        expect(screen.getByLabelText('Remove task row 1 slot 2').disabled).toBe(true);
        expect(screen.queryByLabelText('Task row 1 slot 3 band')).toBeNull();

        // Switching back brings the band chips and the co-lead toggle back.
        fireEvent.click(screen.getByLabelText('Task row 1: staffed as a lead plus a co-lead'));
        expect(screen.getByLabelText('Task row 1: Senior may lead')).toBeTruthy();
        expect(screen.getByLabelText('Task row 1: co-lead')).toBeTruthy();
        expect(generateIsDisabled()).toBe(false);
        expectNoFirestoreTraffic();
    });
});

// ─── 8. THE ENGINE'S HONESTY, IN THE CALENDAR ITSELF ──────────────────────────
//
// Until now every slot AURA could not staff was reported ONLY in a list under the
// grid. The grid is the thing people read, and it showed a duty nobody is covering
// as nothing at all — worst of all on a day where EVERY slot failed, which produces
// no roster key whatsoever (a documented limit of `generateRosterV2`) and therefore
// an empty square indistinguishable from a day off.
//
// These tests are about WHICH SQUARE and WHAT IS REACHABLE WITHOUT A MOUSE. Note
// what they deliberately do not assert: that the marker is styled. jsdom paints
// nothing, so "a quiet dashed outline" is unverifiable here and is called out as
// unverified in the handover instead of being faked with a class-name assertion.

describe('demo mode: an unstaffable duty is shown in the day it is missing from', () => {
    const expected = generateRosterV2(DEMO_EXAMPLE_DEPARTMENT);

    it('renders it inside its own day cell, with the engine\'s reason reachable', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        loadExample();
        clickGenerate();

        const [gap] = expected.unfilled;
        // The fixture's one deliberate gap: the CPET co-lead, the Wednesday Shuri is
        // on leave. Read off the engine, not typed in, so a fixture change moves the
        // assertion with it.
        expect(gap.date).toMatch(/^2026-09-/);

        const cell = dayCell(gap.date);
        expect(cell).toBeTruthy();

        const marker = within(cell).getByRole('note');
        expect(marker.textContent).toContain(gap.task);
        expect(marker.textContent).toMatch(/not staffed/i);

        // The reason — the engine's own sentence, naming the constraint that bound —
        // on hover AND to a screen reader. Not paraphrased.
        expect(marker.getAttribute('title')).toContain(gap.reason);
        expect(marker.getAttribute('aria-label')).toContain(gap.reason);
        expect(marker.getAttribute('aria-label')).toContain(gap.task);

        // Reachable without a mouse.
        expect(marker.getAttribute('tabindex')).toBe('0');
        marker.focus();
        expect(document.activeElement).toBe(marker);

        // It is an ABSENCE, not an assignment: there is nothing to swap on a duty
        // nobody holds, so it is not a button and the day's button count is exactly
        // the number of shifts the engine really produced there.
        expect(marker.tagName).not.toBe('BUTTON');
        expect(within(cell).queryAllByRole('button'))
            .toHaveLength(expected.roster[gap.date].length);

        // One marker per unstaffed slot in the visible month, and no others: a
        // fully-staffed day is still a clean square.
        expect(screen.getAllByRole('note')).toHaveLength(expected.unfilled.length);

        // …and the printable list below still carries every reason as text, once.
        expect(screen.getByText(gap.reason)).toBeTruthy();

        expectNoFirestoreTraffic();
    });

    it('marks a day where EVERY slot failed, so it cannot read as a day off', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        // One person, one task, and that person is away on the Tuesday. Tuesday
        // therefore has no lead, no co-lead and NO ROSTER KEY AT ALL.
        setStaffRow(1, { name: 'Solo Practitioner', away: '2026-09-08' });
        setTaskName(1, 'Ward Round');
        clickCoLead(1);
        setRun({ weeks: '1', startDate: '2026-09-07' });
        clickGenerate();

        const run = generateRosterV2({
            startDate: '2026-09-07',
            weeks: 1,
            staff: [{ name: 'Solo Practitioner', fte: 1.0, skills: [], unavailable: ['2026-09-08'] }],
            tasks: [{ name: 'Ward Round', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 0 }],
            rules: { bands: { junior: [7, 12], senior: [13, 14], principal: [15, 17] } },
        });
        expect(run.ok).toBe(true);

        // THE DOCUMENTED ENGINE LIMIT THIS TEST EXISTS FOR: no key for that day.
        expect(run.roster['2026-09-08']).toBeUndefined();
        expect(run.unfilled.filter((slot) => slot.date === '2026-09-08')).toHaveLength(1);

        // The square is not empty: it says what was missing and why.
        expect(gapsInCell('2026-09-08')).toHaveLength(1);
        expect(gapsInCell('2026-09-08')[0].getAttribute('aria-label')).toContain('on leave');
        expect(dayCell('2026-09-08').textContent).toMatch(/not staffed/i);

        // …and a Saturday nothing was ever configured for still reads as nothing,
        // which is the difference this whole test is about.
        expect(gapsInCell('2026-09-12')).toHaveLength(0);
        expect(dayCell('2026-09-12').textContent).not.toMatch(/not staffed/i);
        expect(within(dayCell('2026-09-12')).queryAllByRole('button')).toHaveLength(0);

        expectNoFirestoreTraffic();
    });
});

// ─── 9. MY WEEK — ONE PERSON, NOT A MATRIX ────────────────────────────────────

describe('demo mode: my week', () => {
    const expected = generateRosterV2(DEMO_EXAMPLE_DEPARTMENT);

    it('opens on the department grid — nothing changes without a press', () => {
        render(<RosterView user={VISITOR} />);

        expect(viewButton('grid').getAttribute('aria-pressed')).toBe('true');
        expect(viewButton('person').getAttribute('aria-pressed')).toBe('false');
        expect(personPanel()).toBeNull();
        // The grid is the thing on screen: one square per day of the visible month.
        expect(document.querySelectorAll('[data-date]').length).toBeGreaterThan(0);
        // And no person picker exists while the grid is showing, so no name is on
        // screen twice.
        expect(screen.queryByLabelText(/show whose duties/i)).toBeNull();

        showMyWeek();
        expect(viewButton('person').getAttribute('aria-pressed')).toBe('true');
        expect(personPanel()).toBeTruthy();
        expect(document.querySelectorAll('[data-date]')).toHaveLength(0);
        // Nothing has been drafted yet, and the panel says exactly that rather than
        // showing an empty list that would read as "you are off all month".
        expect(within(personPanel()).getByText(/no roster on screen yet/i)).toBeTruthy();
        expect(screen.queryByLabelText(/show whose duties/i)).toBeNull();

        showDepartment();
        expect(personPanel()).toBeNull();
        expect(document.querySelectorAll('[data-date]').length).toBeGreaterThan(0);

        expectNoFirestoreTraffic();
    });

    it('shows one person\'s duties and hides everybody else\'s', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        loadExample();
        clickGenerate();
        showMyWeek();

        // A sandbox visitor is not in the department they just invented, so the view
        // opens on the first person rostered and offers the whole generated pool.
        const picker = screen.getByLabelText(/show whose duties/i);
        expect(picker.value).toBe(DEMO_EXAMPLE_DEPARTMENT.staff[0].name);
        expect(within(picker).getAllByRole('option'))
            .toHaveLength(DEMO_EXAMPLE_DEPARTMENT.staff.length);

        // The 0.6 FTE part-timer: fewest duties, and the person the fairness columns
        // are about.
        const person = 'Scott Lang';
        fireEvent.change(picker, { target: { value: person } });

        const mine = engineDutiesFor(expected.roster, person);
        expect(mine.length).toBeGreaterThan(0);

        const panel = personPanel();
        expect(within(panel).getByRole('heading', { name: person })).toBeTruthy();

        // Scoped to the DUTY LIST, deliberately: the panel also holds the person
        // picker, and every colleague's name is one of its options. The claim under
        // test is about whose duties are listed, not about who can be chosen.
        const list = within(panel).getByRole('list');

        // EXACTLY their duties — one row each, no more. A count is what catches an
        // extra row; a "contains" assertion would not.
        expect(within(list).getAllByRole('listitem')).toHaveLength(mine.length);
        for (const duty of mine) {
            expect(within(list).getAllByText(duty.task).length).toBeGreaterThan(0);
        }

        // …and NOT anybody else's. Every task that ran this month which this person
        // never held is absent from their list.
        const everyTask = new Set(
            Object.values(expected.roster).flatMap((shifts) => shifts.map((shift) => shift.task)),
        );
        const notTheirs = [...everyTask].filter((task) => !mine.some((duty) => duty.task === task));
        expect(notTheirs.length).toBeGreaterThan(0);
        for (const task of notTheirs) {
            expect(within(list).queryAllByText(task)).toHaveLength(0);
        }

        // A colleague they never share a shift with does not appear at all. (The
        // people they DO work with are named on purpose — a roster is a promise
        // between colleagues, so each row says who else is on it.)
        const companions = new Set(mine.flatMap((duty) => duty.assignees).filter((name) => name !== person));
        const strangers = DEMO_EXAMPLE_DEPARTMENT.staff
            .map((entry) => entry.name)
            .filter((name) => name !== person && !companions.has(name));
        expect(strangers.length).toBeGreaterThan(0);
        for (const stranger of strangers) {
            expect(within(list).queryByText(stranger)).toBeNull();
        }
        expect(companions.size).toBeGreaterThan(0);
        for (const companion of companions) {
            expect(within(list).getAllByText(new RegExp(`with .*${companion}`)).length)
                .toBeGreaterThan(0);
        }

        // This run set no task lengths, so there are no hours and — crucially — no
        // total invented for them.
        expect(within(panel).queryByText(/in total/i)).toBeNull();

        expectNoFirestoreTraffic();
    });

    it('names the duty each one is held as, and switching person switches the list', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        loadExample();
        clickGenerate();
        showMyWeek();

        const picker = screen.getByLabelText(/show whose duties/i);
        const first = 'Scott Lang';
        const second = 'Carol Danvers';

        fireEvent.change(picker, { target: { value: first } });
        const firstCount = within(personPanel()).getAllByRole('listitem').length;
        expect(firstCount).toBe(engineDutiesFor(expected.roster, first).length);
        // Every row says what the duty IS — lead, co-lead or a place on a team.
        for (const row of within(personPanel()).getAllByRole('listitem')) {
            expect(row.textContent).toMatch(/Lead|Co-lead|On the team|On duty/);
        }

        fireEvent.change(picker, { target: { value: second } });
        expect(within(personPanel()).getAllByRole('listitem'))
            .toHaveLength(engineDutiesFor(expected.roster, second).length);
        expect(within(personPanel()).getByRole('heading', { name: second })).toBeTruthy();

        expectNoFirestoreTraffic();
    });

    it('prints the hours beside a duty when the run set them, and totals the month', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        setStaffRow(1, { name: 'Solo Scientist' });
        setDepartmentHours({ week: '42' });
        setTaskName(1, 'Long Bench');
        clickCoLead(1);
        toggleTaskMore(1);
        setTaskHours(1, '8');
        setRun({ weeks: '1', startDate: '2026-09-07' });
        clickGenerate();
        showMyWeek();

        const panel = personPanel();
        // Five 8-hour sessions, every one of them with a length the visitor typed.
        expect(within(panel).getAllByRole('listitem')).toHaveLength(5);
        expect(within(panel).getAllByText('8h')).toHaveLength(5);
        expect(within(panel).getByText(/5 duties/i).textContent).toMatch(/40h in total/i);

        expectNoFirestoreTraffic();
    });

    it('says so plainly when the chosen person holds nothing this month', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        // Two people, one task, one day: somebody is bound to be free.
        setStaffRow(1, { name: 'Aisha Rahman' });
        setStaffRow(2, { name: 'Ben Carter' });
        setStaffRow(3, { name: 'Chloe Ng' });
        setTaskName(1, 'Ward Round');
        for (const day of ['Tue', 'Wed', 'Thu', 'Fri']) clickDay(1, day);
        clickCoLead(1);
        setRun({ weeks: '1', startDate: '2026-09-07' });
        clickGenerate();
        showMyWeek();

        const run = generateRosterV2({
            startDate: '2026-09-07',
            weeks: 1,
            staff: [
                { name: 'Aisha Rahman', fte: 1.0, skills: [], unavailable: [] },
                { name: 'Ben Carter', fte: 1.0, skills: [], unavailable: [] },
                { name: 'Chloe Ng', fte: 1.0, skills: [], unavailable: [] },
            ],
            tasks: [{ name: 'Ward Round', days: [1], leads: 1, coLeads: 0 }],
            rules: { bands: { junior: [7, 12], senior: [13, 14], principal: [15, 17] } },
        });
        expect(run.ok).toBe(true);
        const idle = ['Aisha Rahman', 'Ben Carter', 'Chloe Ng']
            .find((name) => engineDutiesFor(run.roster, name).length === 0);
        expect(idle).toBeTruthy();

        fireEvent.change(screen.getByLabelText(/show whose duties/i), { target: { value: idle } });
        // "Holds no duties" — a statement about the roster, explicitly not a loading
        // state, which is the difference an empty panel could not express.
        expect(within(personPanel()).getByText(new RegExp(`${idle} holds no duties`, 'i'))).toBeTruthy();
        expect(within(personPanel()).queryAllByRole('listitem')).toHaveLength(0);

        expectNoFirestoreTraffic();
    });
});

// ─── 10. THE LANGUAGE PASS ────────────────────────────────────────────────────
//
// A duty roster is a promise between colleagues about their time. It was reading
// like a log file: "Generate Sandbox Roster", "Hard violations", "Effective start",
// "0.6". Every rename below is asserted in both directions — the new words are on
// screen and the machine's words are gone — because a rename that only adds the new
// string leaves the old one to be found by a user later.

describe('demo mode: the roster speaks clinical English', () => {
    it('drafts a roster instead of generating a sandbox one', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        expect(screen.getByRole('button', { name: /^draft roster$/i })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /generate sandbox roster/i })).toBeNull();
        // The prompt under the empty calendar names the button it is talking about,
        // so the two cannot drift apart.
        expect(screen.getByText(/no sandbox roster yet/i).textContent).toMatch(/draft roster/i);
    });

    it('reports rules broken and when the roster starts, not hardViolations and an effective start', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        loadExample();
        clickGenerate();

        expect(screen.getByText(/^rules broken$/i)).toBeTruthy();
        expect(screen.queryByText(/hard violation/i)).toBeNull();
        expect(screen.queryByText(/violations/i)).toBeNull();

        expect(screen.getByText(/^roster starts$/i)).toBeTruthy();
        expect(screen.queryByText(/effective start/i)).toBeNull();

        // The claim the tile makes is still the honest one: measured, not asserted.
        expect(screen.getByText(/checked by re-reading the roster/i)).toBeTruthy();
    });

    it('says what an FTE of 0.6 means, computed from the days this department runs', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        loadExample();
        clickGenerate();

        const partTimer = DEMO_EXAMPLE_DEPARTMENT.staff.find((person) => person.fte === 0.6);
        const row = screen.getByText(partTimer.name).closest('tr');

        // The number is still there — it is what payroll holds and what Per FTE is
        // computed from...
        expect(within(row).getByText('0.6')).toBeTruthy();
        // ...and beside it, the same fact in the words of the contract. The example
        // department runs Mon-Sat, SIX days, so 0.6 of its week is 3.6 days — not the
        // 3 that a hard-coded five-day week would have printed.
        expect(within(row).getByText(/works about 3\.6 days a week/i)).toBeTruthy();
        expect(screen.getByText(/spread over the/i).textContent).toMatch(/6\s+days a week/i);
    });

    it('offers the same words in the wizard, from the days ticked so far', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        // One task, Mon-Fri by default: a five-day department, so 0.6 is three days.
        setStaffRow(1, { name: 'Ben Carter', fte: '0.6' });
        setTaskName(1, 'Ward Round');
        expectOnScreen(/works 3 days a week/i);

        // Tick the Saturday and the same 0.6 becomes 3.6 days, in the same keystroke.
        clickDay(1, 'Sat');
        expectOnScreen(/works about 3\.6 days a week/i);

        // A blank FTE is full time, which is what the caption beside it has always
        // said — so it reads as the whole department week, not as nothing.
        setStaffRow(2, { name: 'Aisha Rahman' });
        expectOnScreen(/works 6 days a week/i);
    });

    it('calls an unstaffed duty not staffed, in the calendar and in the list', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        loadExample();
        clickGenerate();

        expect(screen.getByText(/could not be staffed \(1\)/i)).toBeTruthy();
        expect(screen.getAllByRole('note')[0].textContent).toMatch(/not staffed/i);
        // The panel's own prose no longer claims the calendar hides a failed day,
        // because it does not any more.
        expect(screen.queryByText(/only record that it was attempted/i)).toBeNull();
        expect(screen.getByText(/also marked in the calendar above/i)).toBeTruthy();
    });
});
