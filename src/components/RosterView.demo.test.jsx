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
import { generateRosterV2, bandOfGrade } from '../utils/rosterEngineV2';

// --- HELPERS -----------------------------------------------------------------

const VISITOR = { name: 'Visiting Therapist', role: 'staff', email: 'visitor@example.org' };

const openConfigure = () => {
    fireEvent.click(screen.getByRole('button', { name: /configure/i }));
};

const loadExample = () => {
    fireEvent.click(screen.getByRole('button', { name: /load example department/i }));
};

const generateButton = () => screen.getByRole('button', { name: /generate sandbox roster/i });

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
