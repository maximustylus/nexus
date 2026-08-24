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
// 🧪 THE PICKER'S DATA. `DEMO_EXAMPLE_DEPARTMENT` above is the config of the picker's
// 'marvel-worked-example' shape — asserted to be the SAME object, not a copy — so the
// ~40 assertions in sections 1–11 keep describing the fixture the app actually loads.
// It used to be the 'respiratory' arrangement; that name claimed a service nobody had
// described and was retired, while the fixture itself did not move.
import {
    DEMO_SHAPES,
    DEMO_PROVENANCE_FICTIONAL,
    DEMO_PROVENANCE_INTERVIEWED,
    MOH_PROFESSION_OPTIONS,
    DEMO_SHAPE_SUGGESTIONS,
    suggestedShapeFor,
} from '../data/mockData';
// The published taxonomy the profession dropdown is a view of. Imported so the test
// checks the dropdown against MOH's own list rather than against a list this file keeps.
import {
    MOH_ALLIED_HEALTH_PROFESSIONS,
    MOH_PROFESSION_LEAVES,
    MOH_PROFESSION_LEAF_COUNT,
} from '../data/mohAlliedHealth';
// `auditHardConstraints` is a SECOND, independent read-back of a finished roster. The
// shapes are checked with it as well as with `score.hardViolations`, because the
// latter is the engine measuring its own output and this repo's rule is that a
// zero-violation claim is measured rather than asserted.
import { generateRosterV2, bandOfGrade, auditHardConstraints } from '../utils/rosterEngineV2';
// 🔒 PDPA. The LIVE roster's staff pool names four real colleagues. Imported here for
// exactly one purpose: to assert that not one of those names appears in ANY shape,
// including the one deliberately modelled on their own department's duty list.
import { LIVE_ROSTER_DEFAULTS } from '../utils/auraEngine';

// --- HELPERS -----------------------------------------------------------------

const VISITOR = { name: 'Visiting Therapist', role: 'staff', email: 'visitor@example.org' };

const openConfigure = () => {
    fireEvent.click(screen.getByRole('button', { name: /configure/i }));
};

/**
 * THE FIXTURE SECTIONS 1–11 ARE WRITTEN AGAINST, reached the way a visitor reaches it.
 *
 * It has been a "Load example department" BUTTON, then the RESPIRATORY option of a
 * twelve-arrangement dropdown, and it is now the openly fictional
 * 'marvel-worked-example' shape in the shape dropdown. THE OBJECT NEVER MOVED — it is
 * `DEMO_EXAMPLE_DEPARTMENT` throughout, held by reference and not by copy, asserted with
 * `toBe` in section 12 — which is why every assertion in this file written against "the
 * example department" still means what it meant.
 *
 * WHAT DID CHANGE IS WHAT IT CLAIMS. It used to be offered as an Allied Health
 * Respiratory service, inferred rather than reported, with a "please correct this"
 * checklist attached. Six such per-profession fixtures were deleted in the
 * profession-plus-shape correction; this one survived because it is the only fixture
 * here that exercises band gates, a skill gate, a part-time contract, a day of leave and
 * ONE honestly unstaffed slot at the same time — and it now claims nobody's service. Its
 * twelve people, six duties, two band gates, CPET gate, 0.6 FTE contract, one leave day
 * and one unfillable slot are byte-identical to before the rename.
 *
 * Chosen by the stable `id`, never by name or by position.
 */
const loadExample = () => {
    loadShapeById('marvel-worked-example');
};

/**
 * The SHAPE dropdown — the second of the picker's two controls.
 *
 * It was five cards with Load buttons, then one dropdown of twelve professions, and it
 * is now one dropdown of five STRUCTURES plus two fictional demos, beside a separate
 * dropdown of MOH's 28 professions. Two labels, two queries: this helper must never
 * match the profession control, which is why both labels are asserted distinct in
 * section 12. A shape is chosen by its option value (the stable `id`, not the display
 * name, so renaming a shape does not break 60 tests).
 */
const shapeSelect = () => screen.getByLabelText(/shape to start from/i);

const loadShapeById = (id) => {
    fireEvent.change(shapeSelect(), { target: { value: id } });
};

/** Load one shape by the name a visitor reads in the dropdown. */
const loadShapeNamed = (name) => {
    const entry = DEMO_SHAPES.find(
        (candidate) => candidate.name.toLowerCase() === String(name).toLowerCase(),
    );
    if (!entry) throw new Error(`No shape named "${name}"`);
    loadShapeById(entry.id);
};

/**
 * THE PROFESSION dropdown — the picker's FIRST control, and a different kind of thing.
 *
 * It selects no duty, grade or rule: it labels the configuration, so an art therapist
 * riding the physiotherapists' structure sees their own designation on the result. Every
 * test that drives only the shape control is therefore still a complete test of
 * generation, which is why sections 1–11 needed no profession at all.
 */
const professionSelect = () => screen.getByLabelText(/your profession/i);

const chooseProfession = (id) => {
    fireEvent.change(professionSelect(), { target: { value: id } });
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
 * 🛡️ A DIVIDER IS NAMED BY THE TWO BANDS IT SITS BETWEEN, never by its index.
 * These helpers took `0` and `1` for junior|senior and senior|principal until the
 * four-band split added a third handle BELOW both of them — at which point every
 * `0` silently meant the new non-exempt|junior boundary and the tests went on
 * asserting junior|senior numbers against it. `aria-valuenow` is the grade the
 * divider sits on, which is the max of the band below it; the rest follow.
 */
const NONEXEMPT_JUNIOR_DIVIDER = 'Boundary between the Non-exempt and Junior bands';
const JUNIOR_SENIOR_DIVIDER = 'Boundary between the Junior and Senior bands';
const SENIOR_PRINCIPAL_DIVIDER = 'Boundary between the Senior and Principal bands';

/** Every divider, in DOM order — for counting and for sweeps, not for picking one. */
const dividers = () => screen.getAllByRole('slider');

const divider = (label) => screen.getByLabelText(label);

const dividerValue = (label) => Number(divider(label).getAttribute('aria-valuenow'));

/** Nudge a divider with the keyboard, the way a keyboard user would. */
const nudgeDivider = (label, key, times = 1) => {
    for (let i = 0; i < times; i += 1) {
        fireEvent.keyDown(divider(label), { key });
    }
};

/** Drive a divider to an exact grade, whichever direction that is. */
const setDivider = (label, target) => {
    let guard = 0;
    while (dividerValue(label) !== target && guard < 40) {
        nudgeDivider(label, dividerValue(label) < target ? 'ArrowRight' : 'ArrowLeft');
        guard += 1;
    }
    expect(dividerValue(label)).toBe(target);
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

describe('demo mode: Configure → load the worked example → Generate', () => {
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
        // At least one of each band, and a pool weighted below the senior line.
        const bands = DEMO_EXAMPLE_DEPARTMENT.staff.map((person) => bandOf(person.name));
        expect(bands.filter((band) => band === 'principal').length).toBeGreaterThanOrEqual(1);
        expect(bands.filter((band) => band === 'senior').length).toBeGreaterThanOrEqual(2);
        // CHANGED BY THE FOUR-BAND SPLIT. This read "juniors are more than half the
        // pool", which was true when junior meant AH7–AH12: seven of the twelve sat
        // in it. AH7–AH10 is the non-exempt band now, so the same twelve grades are
        // five non-exempt, two junior, four senior and one principal. The claim the
        // assertion was making — every band is represented, and the bulk of the pool
        // is below the senior line — is unchanged; only which band holds the bulk is.
        expect(bands.filter((band) => band === 'junior').length).toBeGreaterThanOrEqual(1);
        expect(bands.filter((band) => band === 'nonExempt').length).toBeGreaterThanOrEqual(1);
        expect(
            bands.filter((band) => band === 'nonExempt' || band === 'junior').length,
        ).toBeGreaterThan(bands.length / 2);

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
        // CHANGED BY THE FOUR-BAND SPLIT: the 0.6 FTE contract is Scott Lang at AH9,
        // which was junior and is non-exempt now. The claim is the same one — the
        // table resolves the grade to a BAND rather than echoing the grade string.
        expect(within(row).getByText(/non-exempt/i)).toBeTruthy();

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
        // Read off the ruler's dividers: non-exempt ends at AH10, junior at AH12 and
        // senior at AH14, so the fixture's boundaries are non-exempt 7–10 / junior
        // 11–12 / senior 13–14 / principal 15–17. (Was four number-box assertions
        // before the ruler.)
        // CHANGED BY THE FOUR-BAND SPLIT: three dividers, asked for by name — the
        // `dividerValue(0)` this used to read is the non-exempt|junior one now.
        expect(dividers()).toHaveLength(3);
        expect(dividerValue(NONEXEMPT_JUNIOR_DIVIDER)).toBe(10);
        expect(dividerValue(JUNIOR_SENIOR_DIVIDER)).toBe(12);
        expect(dividerValue(SENIOR_PRINCIPAL_DIVIDER)).toBe(14);
        expectOnScreen(/Non-exempt\s*AH7[–-]AH10/i);
        expectOnScreen(/Junior\s*AH11[–-]AH12/i);
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
            rules: { bands: { nonExempt: [7, 10], junior: [11, 12], senior: [13, 14], principal: [15, 17] } },
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
            rules: { bands: { nonExempt: [7, 10], junior: [11, 12], senior: [13, 14], principal: [15, 17] } },
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
            rules: { bands: { nonExempt: [7, 10], junior: [11, 12], senior: [13, 14], principal: [15, 17] } },
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

        // Drive every divider hard down and hard up, past its neighbours and past
        // both ends of the scale. After every attempt the bands must still partition
        // AH7–AH17 and the configuration must still be generatable.
        // CHANGED BY THE FOUR-BAND SPLIT: the ordering assertion was a single
        // `dividerValue(0) < dividerValue(1)` pair, which said nothing about the
        // third handle. It reads the whole list as strictly ascending now, which is
        // the no-overlap property for however many dividers there are.
        const strictlyAscending = () => {
            const values = dividers().map((handle) => Number(handle.getAttribute('aria-valuenow')));
            expect(values).toEqual([...values].sort((a, b) => a - b));
            expect(new Set(values).size).toBe(values.length);
        };

        nudgeDivider(NONEXEMPT_JUNIOR_DIVIDER, 'ArrowLeft', 25);
        nudgeDivider(JUNIOR_SENIOR_DIVIDER, 'ArrowLeft', 25);
        nudgeDivider(SENIOR_PRINCIPAL_DIVIDER, 'ArrowRight', 25);
        strictlyAscending();
        expect(generateIsDisabled()).toBe(false);

        // And the other way: every divider up past the one above it.
        nudgeDivider(NONEXEMPT_JUNIOR_DIVIDER, 'ArrowRight', 25);
        nudgeDivider(JUNIOR_SENIOR_DIVIDER, 'ArrowRight', 25);
        strictlyAscending();
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

        // Narrow senior upwards by moving the junior|senior divider to AH13:
        // non-exempt AH7–10, junior AH11–13, senior AH14, principal AH15–17. Still a
        // valid partition by construction, so BOTH gated tasks' ranges follow it — in
        // opposite directions, in the same keystroke.
        //
        // CHANGED BY THE FOUR-BAND SPLIT, twice over. It drove `setDivider(0, 10)`,
        // and index 0 is the non-exempt|junior divider now — which already SITS on
        // AH10, so the move became a no-op and nothing on screen changed at all. And
        // the direction turned round: junior starts at AH11 now, so this divider has
        // one grade of travel downwards and a one-grade junior band renders as the
        // bare 'AH11' the ruler's own scale strip also prints. Moving UP keeps both
        // captions unambiguous ranges, which is what makes them a measurement of the
        // chips rather than of the ruler behind them.
        setDivider(JUNIOR_SENIOR_DIVIDER, 13);

        expect(screen.queryByText('AH13–AH17')).toBeNull();
        // The Senior/Principal-gated clinic…
        expect(screen.getAllByText('AH14–AH17').length).toBeGreaterThan(0);
        // …and the junior-gated ward round, which widened as the clinic narrowed.
        expect(screen.getAllByText('AH11–AH13').length).toBeGreaterThan(0);
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
            rules: { bands: { nonExempt: [7, 10], junior: [11, 12], senior: [13, 14], principal: [15, 17] }, weeklyHours: 42 },
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
            rules: { bands: { nonExempt: [7, 10], junior: [11, 12], senior: [13, 14], principal: [15, 17] }, weeklyHours: 42 },
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
    /**
     * Prin/Sen/Jun, one in each of the three bands the trio task's slots name.
     *
     * 🛡️ RE-GRADED BY THE FOUR-BAND SPLIT: 'Jun' was AH8, which is a non-exempt
     * assistant on the corrected scale, not a junior AHP — so the junior slot below
     * had nobody eligible to fill it and every test in this section failed. The
     * FIXTURE was wrong about what AH8 means; the assertions were right, and are
     * untouched. AH11 is the bottom of the junior band.
     */
    const fillTrioStaff = () => {
        setStaffRow(1, { name: 'Prin', grade: 'AH16' });
        setStaffRow(2, { name: 'Sen', grade: 'AH13' });
        setStaffRow(3, { name: 'Jun', grade: 'AH11' });
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
            // RE-GRADED with `fillTrioStaff` above: AH8 is non-exempt, not junior.
            { name: 'Jun', fte: 1.0, skills: [], unavailable: [], grade: 'AH11' },
        ],
        tasks: [{
            name: 'Weekend Witnessing',
            days: [1, 2, 3, 4, 5],
            slots: [{ band: 'principal' }, { band: 'senior' }, { band: 'junior' }],
        }],
        rules: { bands: { nonExempt: [7, 10], junior: [11, 12], senior: [13, 14], principal: [15, 17] } },
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
            rules: { bands: { nonExempt: [7, 10], junior: [11, 12], senior: [13, 14], principal: [15, 17] } },
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
            rules: { bands: { nonExempt: [7, 10], junior: [11, 12], senior: [13, 14], principal: [15, 17] } },
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

// ─── 12. TWELVE SELECTABLE ARRANGEMENTS, ONE PER PROFESSION ───────────────────
//
// The single example department became a PICKER — of four, then five, and now TWELVE —
// because one fixture could only ever demonstrate one team's problem. Every test in this
// section is a claim about a DIFFERENT capability, and each one is checked twice over:
//
//   1. AGAINST THE ENGINE, by running `generateRosterV2` on the fixture here and
//      re-auditing the finished roster with `auditHardConstraints` — a second,
//      independent read-back, not the engine's own self-report.
//   2. IN THE RENDERED OUTPUT, by reading names out of the calendar's own day cells.
//      That is the half that catches a field which the fixture states and the wizard
//      drops: a `recurrence`, a `continuity`, a cohort `window` or a `quota` that did
//      not survive the tables would produce a DIFFERENT roster on screen from the one
//      the engine gives the fixture, and the last test in this section compares the
//      two shift by shift for all four.
//
// WHY THE MONTH NAVIGATION EXISTS HERE AND NOWHERE ELSE IN THIS FILE: three of the
// four claims are only visible ACROSS months. A clinic on the third Wednesday occurs
// once per month, so "the same principal every time" cannot be seen in one month's
// square; a four-month cohort block cannot be seen in one month at all.

/** One shape by id, so a test names the structure rather than an array index. */
const shapeOf = (id) => {
    const found = DEMO_SHAPES.find((entry) => entry.id === id);
    if (!found) throw new Error(`No shape with id "${id}"`);
    return found;
};

/**
 * Walk the calendar to a named month, by pressing the same chevron a visitor would.
 *
 * The two buttons carry `aria-label`s now; before this section they were icon-only and
 * unreachable by any query, which is why every other calendar assertion in this file
 * is confined to the month the view opens on.
 */
const goToMonth = (label) => {
    for (let guard = 0; guard < 30; guard += 1) {
        if (screen.queryByText(new RegExp(`^${label}$`, 'i'))) return;
        fireEvent.click(screen.getByRole('button', { name: /next month/i }));
    }
    throw new Error(`Could not reach ${label} in 30 presses of Next month`);
};

/**
 * Every rendered shift in one day's square, as `{ task, staff, also }`.
 *
 * `staff` is `buildShiftStaffLabel`'s "Lead: X, Co: Y" and `also` is the extra line a
 * three-or-more-person shift gets, so this reads the calendar exactly as a roster
 * master does — including the people who do not fit the two-name display string.
 */
const shiftsInDay = (dateKey) => {
    const cell = dayCell(dateKey);
    if (!cell) throw new Error(`No calendar square for ${dateKey} — is the wrong month showing?`);
    return Array.from(cell.querySelectorAll('button')).map((button) => {
        const lines = Array.from(button.querySelectorAll('span')).map((span) => span.textContent.trim());
        const staff = lines.find((line) => line.startsWith('Lead:')) || '';
        const also = lines.find((line) => line.startsWith('Also:')) || '';
        return {
            task: lines[0] || '',
            staff,
            also,
            names: [
                ...(/Lead:\s*([^,]+)/.exec(staff)?.[1] ? [/Lead:\s*([^,]+)/.exec(staff)[1].trim()] : []),
                ...(/Co:\s*(.+)$/.exec(staff)?.[1] ? [/Co:\s*(.+)$/.exec(staff)[1].trim()] : []),
                ...(also === '' ? [] : also.replace(/^Also:\s*/, '').split(',').map((n) => n.trim())),
            ].filter((n) => n !== ''),
        };
    });
};

/** Every date key the engine produced for `task`, in order. */
const engineDatesFor = (result, task) => Object.keys(result.roster)
    .sort()
    .filter((dateKey) => result.roster[dateKey].some((shift) => shift.task === task));

describe('demo mode: the picker is a profession and a shape', () => {
    it('offers six shapes and two demos, and describes the chosen one', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        // WAS TWELVE — one arrangement per department, with 23 more about to be written.
        // Seven of the twelve were invented services offered under a real profession's
        // name. Five structures plus two openly fictional demos is what replaced them,
        // and respiratory made it SIX on 2026-08-17 — the first shape added since, and
        // added the only way the rule allows: the team described their own week.
        expect(DEMO_SHAPES).toHaveLength(8);
        expect(DEMO_SHAPES.filter((entry) => entry.group === 'shape')).toHaveLength(6);
        expect(DEMO_SHAPES.filter((entry) => entry.group === 'demo')).toHaveLength(2);

        // TWO controls, and only two: a phone-first surface that v1.12.0 collapsed five
        // cards into one dropdown for does not get five cards back.
        const picker = shapeSelect();
        expect(picker.tagName).toBe('SELECT');
        expect(professionSelect().tagName).toBe('SELECT');
        expect(professionSelect()).not.toBe(picker);
        expect(screen.queryByRole('button', { name: /^load /i })).toBeNull();

        // Every shape is reachable, by the name a visitor reads.
        for (const entry of DEMO_SHAPES) {
            expect(
                within(picker).getByRole('option', { name: entry.name }),
            ).toBeTruthy();
        }

        // START BLANK IS A REAL FIRST OPTION, not a dead placeholder: before this it read
        // "Choose a team to load…" and could only be read, never chosen.
        expect(within(picker).getByRole('option', { name: /start blank/i }).value).toBe('');

        // The one-line description follows the CHOICE. Nothing is claimed beforehand…
        for (const entry of DEMO_SHAPES) {
            expect(screen.queryByText(entry.demonstrates)).toBeNull();
        }

        // …and exactly the chosen one's sentence appears after.
        loadShapeById('shape-periodic-clinic');
        const clinic = shapeOf('shape-periodic-clinic');
        expect(screen.getByText(clinic.demonstrates)).toBeTruthy();
        for (const entry of DEMO_SHAPES) {
            if (entry.id === 'shape-periodic-clinic') continue;
            expect(screen.queryByText(entry.demonstrates)).toBeNull();
        }

        // THE ORDER IS DELIBERATE AND IS NO LONGER ALPHABETICAL, and that is a decision
        // rather than a regression. The owner's "make the dropdown read alphabetically"
        // applied to a list of PROFESSIONS, where a reader arrives knowing the word they
        // are looking for; that list still exists, is still sorted in code, and is
        // asserted to be so two tests below. Nobody arrives looking for the letter G in a
        // list of six structures, so the shapes are ordered by kind — the six with an
        // interview behind them first, the two fictional demos last — and both groups are
        // labelled on screen with an <optgroup> so the ordering reads as structure.
        expect(DEMO_SHAPES.map((entry) => entry.id)).toEqual([
            'shape-graded-duty',
            'shape-periodic-clinic',
            'shape-team-rotation',
            'shape-weekend-quota',
            'shape-weekday-sessions',
            'shape-graded-floor-rotation',
            'marvel',
            'marvel-worked-example',
        ]);

        // The two <optgroup>s exist, so "a team described this" and "this is fiction" is a
        // structural distinction in the control rather than a word in a caption.
        const groups = Array.from(picker.querySelectorAll('optgroup')).map((g) => g.label);
        expect(groups).toHaveLength(2);
        expect(groups[0]).toMatch(/described their week/i);
        expect(groups[1]).toMatch(/nobody's service/i);

        expectNoFirestoreTraffic();
    });

    it('offers all 28 MOH professions, 37 leaves, nesting where MOH nests', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        const picker = professionSelect();

        // 28 TOP-LEVEL ENTRIES and 37 SELECTABLE LEAVES, checked against the published
        // taxonomy rather than against a count typed into this file.
        expect(MOH_ALLIED_HEALTH_PROFESSIONS).toHaveLength(28);
        expect(MOH_PROFESSION_LEAF_COUNT).toBe(37);
        expect(MOH_PROFESSION_OPTIONS).toHaveLength(28);

        // The two professions MOH nests — 12 (Medical Technologist / Physiologist, five
        // sub-disciplines) and 24 (Psychologist, six) — render as <optgroup>s, because
        // their parents are GROUP LABELS and not choices: a roster belongs to a cardiac
        // lab or a sleep lab, never to "medical technology" in general. A browser refuses
        // to select a group heading, which is the behaviour we want rather than one this
        // component would have to police.
        const groups = Array.from(picker.querySelectorAll('optgroup'));
        expect(groups.map((group) => group.label).sort()).toEqual([
            'Medical Technologist / Physiologist',
            'Psychologist (excluding associate psychologist)',
        ]);
        expect(groups.map((group) => group.querySelectorAll('option').length).sort())
            .toEqual([5, 6]);

        // Every leaf in the taxonomy is reachable as an option, and no group label is.
        const values = Array.from(picker.querySelectorAll('option')).map((option) => option.value);
        for (const leaf of MOH_PROFESSION_LEAVES) {
            expect(values).toContain(leaf.id);
        }
        // 37 leaves + the "prefer not to say" empty option, and nothing else.
        expect(values).toHaveLength(MOH_PROFESSION_LEAF_COUNT + 1);
        expect(values.filter((value) => value === '')).toHaveLength(1);
        expect(values).not.toContain('medical-technologist-physiologist');
        expect(values).not.toContain('psychologist');

        // CHOOSING A PROFESSION IS OPTIONAL and stays optional. A tool that demands a
        // designation before it will help is a tool that has to be argued with first —
        // and every test in sections 1–11 relies on it, generating without ever touching
        // this control.
        expect(picker.value).toBe('');
        expect(within(picker).getByRole('option', { name: /prefer not to say/i }).value).toBe('');

        expectNoFirestoreTraffic();
    });

    it('sorts the profession list in code, alphabetically by the name a visitor reads', () => {
        // THE PROPERTY, not the list: the assertion is that the rendered order equals its
        // own sort, so it cannot be satisfied by hand-ordering the array. That is exactly
        // the failure mode the comparator exists to prevent, and the 29th profession will
        // be added by somebody who has not read `mockData.js`.
        const names = MOH_PROFESSION_OPTIONS.map((entry) => entry.sortName);
        expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
        expect(names[0]).toBe('Art Therapist');
        expect(names[names.length - 1]).toBe('Speech Therapist');

        // …and within each nesting profession, the same discipline.
        for (const group of MOH_PROFESSION_OPTIONS.filter((entry) => entry.kind === 'group')) {
            const children = group.options.map((leaf) => leaf.name);
            expect(children).toEqual([...children].sort((a, b) => a.localeCompare(b, 'en')));
        }

        // MOH's own names, verbatim, including the qualifier on profession 24. Dropping
        // "excluding associate psychologist" would widen a professional boundary this
        // repository has no standing to widen.
        expect(names).toContain('Psychologist (excluding associate psychologist)');
        expect(names).toContain('Medical Laboratory Technologist / Scientist');
    });

    it('is the same fixture the old single button loaded, by reference and not by copy', () => {
        // THE REASON EVERY ASSERTION ABOVE IN THIS FILE STILL MEANS SOMETHING. If the
        // worked-example shape held a COPY, this file's ~40 other tests would be checking
        // a fixture nothing in the app loads. It was the 'respiratory' arrangement's
        // config; the arrangement was deleted for claiming a service nobody had
        // described, and the object did not move.
        expect(shapeOf('marvel-worked-example').config).toBe(DEMO_EXAMPLE_DEPARTMENT);
    });

    it('claims no profession for the two fictional demos, and attributes all six shapes', () => {
        // THE WHOLE CORRECTION, AS ONE ASSERTION. A shape may carry a profession only if
        // that profession described it; a demo must carry none. Getting this wrong in the
        // "attributed" direction is inventing a service, which is the error this change
        // exists to undo.
        for (const entry of DEMO_SHAPES) {
            if (entry.provenance === DEMO_PROVENANCE_INTERVIEWED) {
                expect(entry.group).toBe('shape');
                expect(typeof entry.sourceProfession).toBe('string');
                expect(entry.sourceProfession.length).toBeGreaterThan(0);

                // ⚠️ `sourceProfessionId` USED TO BE REQUIRED HERE AND IS NOW OPTIONAL,
                // and the change is deliberate rather than a relaxation. The two fields
                // were doing two unrelated jobs: ATTRIBUTION ("whose structure is this")
                // and SUGGESTION ("should everyone with this job title be pointed here").
                // Attribution is still mandatory — it moved to `sourceProfession` plus
                // `sourceScope`, both asserted here. Suggestion is now a choice, and
                // respiratory declines it because one KKH team is not every respiratory
                // therapist in SingHealth.
                expect(entry.sourceProfessionId === null || typeof entry.sourceProfessionId === 'string').toBe(true);

                // SCOPE IS MANDATORY, AND IT IS WHAT REPLACED THE PROFESSION-WIDE CLAIM.
                // Every shape here came from ONE team at ONE institution; the picker used
                // to say "your own profession described this". A shape that cannot say how
                // broadly it was described cannot be rendered honestly, so the field is
                // required rather than optional.
                expect(entry.sourceScope).toBeTruthy();
                expect(entry.sourceScope.teams).toBeGreaterThanOrEqual(1);
                expect(entry.sourceScope.institutions).toBeGreaterThanOrEqual(1);
                expect(entry.sourceScope).toHaveProperty('describedOn');

                // The attribution must carry the scope in words too, because the sentence
                // is what a visitor actually reads — "one … team, at one institution".
                expect(entry.attribution).toMatch(/at one institution/i);
                // The attribution says whose structure it is AND that it is a starting
                // point. Both halves, because either alone misleads.
                expect(entry.attribution).toMatch(/starting point/i);
            } else {
                expect(entry.provenance).toBe(DEMO_PROVENANCE_FICTIONAL);
                expect(entry.group).toBe('demo');
                expect(entry.sourceProfession).toBeNull();
                expect(entry.sourceProfessionId).toBeNull();
                expect(entry.sourceScope).toBeNull();
                expect(entry.attribution).toMatch(/fictional/i);
            }
            // NO `correction` FIELD ANYWHERE, and no `inferred`. They existed to
            // disclaim a claim; nothing here makes that claim any more, so a disclaimer
            // would be theatre. If a future entry seems to need one, that is the signal
            // that somebody is about to describe a service nobody has described.
            expect(entry.correction).toBeUndefined();
            expect(entry.provenance).not.toBe('inferred');
        }

        // Named individually, because "how many are attributed" is not the question —
        // "is THIS structure really that profession's" is.
        expect(DEMO_SHAPES.filter((entry) => entry.provenance === DEMO_PROVENANCE_INTERVIEWED)
            .map((entry) => [entry.id, entry.sourceProfessionId])).toEqual([
            ['shape-graded-duty', 'physiotherapist'],
            ['shape-periodic-clinic', 'psychologist'],
            ['shape-team-rotation', 'embryologist'],
            ['shape-weekend-quota', 'medical-laboratory-technologist'],
            ['shape-weekday-sessions', 'clinical-exercise-physiologist'],
            // ATTRIBUTED TO RESPIRATORY, PAIRED WITH NOBODY. The `null` is the whole
            // correction: the team is named, and no RT in the cluster is auto-pointed at
            // one institution's rotation as though it were their profession's.
            ['shape-graded-floor-rotation', null],
        ]);
        expect(DEMO_SHAPES.filter((entry) => entry.provenance === DEMO_PROVENANCE_FICTIONAL)
            .map((entry) => entry.id)).toEqual(['marvel', 'marvel-worked-example']);

        // EVERY ATTRIBUTED PROFESSION EXISTS IN THE PUBLISHED TAXONOMY, by id and by the
        // name MOH gives it. A shape attributed to a profession this repository invented
        // would be the same error in a new place.
        const taxonomyName = (id) => MOH_ALLIED_HEALTH_PROFESSIONS.find((p) => p.id === id)?.name
            || MOH_PROFESSION_LEAVES.find((leaf) => leaf.id === id)?.name;
        for (const entry of DEMO_SHAPES.filter((shapeEntry) => shapeEntry.sourceProfessionId)) {
            expect(taxonomyName(entry.sourceProfessionId)).toBe(entry.sourceProfession);
        }

        // The names describe STRUCTURES, not departments. A shape called "Physiotherapy"
        // is the old design in new clothes.
        for (const entry of DEMO_SHAPES.filter((shapeEntry) => shapeEntry.group === 'shape')) {
            expect(entry.name).not.toMatch(
                /physiotherap|psycholog|embryolog|laborator|exercise physiolog/i,
            );
        }

        // KEPT FROM THE TEST THAT CHECKED THE REHAB SPLIT, which went with the
        // arrangements it described: `REHAB` was a skill invented for a fixture, moved
        // out of the respiratory example at the owner's request and deliberately never
        // re-homed. It must not reappear as a gate on any surviving shape.
        const skillsAnywhere = DEMO_SHAPES.flatMap((entry) => [
            ...entry.config.staff.flatMap((person) => person.skills || []),
            ...entry.config.tasks.map((task) => task.requiresSkill).filter(Boolean),
        ]);
        expect(skillsAnywhere).not.toContain('REHAB');
        // The only skill left anywhere in the picker is the worked example's CPET gate.
        expect([...new Set(skillsAnywhere)].sort()).toEqual(['CPET', 'SLEEP']);
    });

    it('names not one real colleague, in any shape', () => {
        // 🔒 PDPA, and the reason it is a test rather than a convention: the fixed
        // weekday sessions shape is deliberately modelled on the roster owner's OWN
        // department, by its real duty names, so it is the one place where somebody
        // editing in good faith might reach for the real staff list two files away.
        // `AN14`: this iterated `LIVE_ROSTER_DEFAULTS.staff`, which is now empty —
        // an empty loop asserts nothing, which is `CP19`'s shape. The names move
        // into the test itself: test files do not ship, and the check must keep
        // guarding against exactly the people someone editing this fixture in good
        // faith might reach for.
        const REAL_COLLEAGUE_NAMES = ['Brandon', 'Ying Xian', 'Derlinder', 'Fadzlynn'];
        const everyName = DEMO_SHAPES.flatMap((entry) => entry.config.staff.map((person) => person.name));
        expect(everyName.length).toBeGreaterThan(0);
        for (const colleague of REAL_COLLEAGUE_NAMES) {
            for (const invented of everyName) {
                expect(invented.toLowerCase()).not.toContain(colleague.toLowerCase());
            }
        }

        // …while the real DUTY names are exactly what that shape is built from, which is
        // the half of it that may be accurate.
        const cepTasks = shapeOf('shape-weekday-sessions').config.tasks.map((task) => task.name);
        for (const task of LIVE_ROSTER_DEFAULTS.tasks) {
            expect(cepTasks).toContain(task);
        }
        expect(cepTasks).toContain('VC (PM)');
        expect(cepTasks).toContain('VC (AM)');
    });

    it('accepts every shape, and re-audits every finished roster to zero', () => {
        for (const entry of DEMO_SHAPES) {
            const result = generateRosterV2(entry.config);
            expect(result.ok).toBe(true);
            expect(result.score.hardViolations).toBe(0);

            // A SECOND, INDEPENDENT READ-BACK. `score.hardViolations` is the engine's
            // own measurement of its own output; this re-reads the finished roster
            // through the audit entry point, so "no hard constraint was broken" is
            // checked twice by two callers rather than asserted once.
            const audit = auditHardConstraints(result.roster, entry.config);
            expect(audit.ok).toBe(true);
            expect(audit.count).toBe(0);
            expect(audit.violations).toEqual([]);
        }
    });

    it('leaves the six feature signatures distinct, so six is the right number', () => {
        // WHY SIX SHAPES REPLACED TWELVE ARRANGEMENTS AND NOT TWENTY-EIGHT: choosing
        // between them is choosing between six STRUCTURES. Two shapes with the same
        // signature would be two casts of fictional names wearing one structure — which
        // is what a per-department fixture was.
        //
        // ⚠️ `bandFloor` JOINED THIS TUPLE ON 2026-08-17 AND THE REASON IS A REAL
        // FINDING, not a test being bent to fit. Respiratory is the first shape to reach
        // an engine field another shape already reached: it and physiotherapy both use
        // `leadBands`. On the seven fields below their signatures were IDENTICAL and this
        // assertion failed — correctly. They are nonetheless different structures, and
        // the difference is the one thing `leadBands` alone cannot show: physiotherapy
        // gates the LEAD and lets any grade co-lead, which is what makes it a supervision
        // shape; respiratory uses the same field as a FLOOR ON EVERYBODY, which it can
        // only do by having no co-lead at all, because the band gate does not reach one.
        // So the tuple gained the dimension that tells a gate from a floor. It is
        // STRICTER than what it replaced, not looser — but if a seventh shape ever needs
        // an eighth dimension invented for it, that is the signal that it is not a new
        // structure and should not be added.
        const signature = (entry) => ({
            leadBands: entry.config.tasks.some((task) => task.leadBands),
            // A REAL grade floor, since 2026-08-19. `bandFloor` below was the
            // WORKAROUND for not having this — see its comment.
            minGrade: entry.config.tasks.some((task) => task.minGrade),
            // A gate becomes a FLOOR only when no band-gated duty carries a co-lead: an
            // ungated second body in the slot is a body the floor does not apply to.
            //
            // ⚠️ THIS DIMENSION IS NOW HISTORY, and is kept rather than deleted. It
            // was added when respiratory's floor could only be approximated with a
            // band gate plus `coLeads: 0`; `minGrade` replaced that approximation, so
            // respiratory no longer sets `leadBands` at all and this reads false for
            // it. It still separates any FUTURE shape that reaches for the old trick,
            // and removing it would quietly widen what "distinct signature" means.
            bandFloor: entry.config.tasks.some((task) => task.leadBands)
                && entry.config.tasks.every((task) => !task.leadBands || task.coLeads === 0),
            recurrence: entry.config.tasks.some((task) => task.recurrence),
            continuity: entry.config.tasks.some((task) => task.continuity),
            slots: entry.config.tasks.some((task) => task.slots),
            quota: entry.config.tasks.some((task) => task.quota),
            windows: entry.config.staff.some((person) => person.windows),
            weeklyHours: entry.config.rules?.weeklyHours !== undefined,
        });
        const shapes = DEMO_SHAPES.filter((entry) => entry.group === 'shape');
        const signatures = shapes.map((entry) => JSON.stringify(signature(entry)));
        expect(new Set(signatures).size).toBe(shapes.length);

        // …and each is the signature the shape's own name and description promise.
        expect(signature(shapeOf('shape-graded-duty')).leadBands).toBe(true);
        expect(signature(shapeOf('shape-periodic-clinic'))).toMatchObject({
            recurrence: true, continuity: true, leadBands: true, weeklyHours: true,
        });
        expect(signature(shapeOf('shape-team-rotation'))).toMatchObject({
            slots: true, windows: true,
        });
        expect(signature(shapeOf('shape-weekend-quota'))).toMatchObject({
            quota: true, slots: true, weeklyHours: true,
        });
        expect(signature(shapeOf('shape-weekday-sessions'))).toMatchObject({
            leadBands: false, recurrence: false, slots: false, quota: false, windows: false,
        });
        // The floor, and the gate it must not be confused with. Respiratory says its
        // floor with `minGrade` and sets no bands at all; physiotherapy gates the
        // LEAD by band and lets any grade co-lead. That is the whole difference
        // between "AH12 and above covers this area" and "a junior leads it, anybody
        // may help" — and until 2026-08-19 the first could only be approximated.
        expect(signature(shapeOf('shape-graded-floor-rotation'))).toMatchObject({
            minGrade: true, leadBands: false, recurrence: false, slots: false, quota: false,
        });
        expect(signature(shapeOf('shape-graded-duty'))).toMatchObject({
            minGrade: false, leadBands: true, bandFloor: false,
        });
    });

    it('suggests a starting point without describing anybody\'s service', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        // THE OWNER'S OWN PAIRINGS, and they are suggestions. An art therapist is pointed
        // at the fixed weekday sessions shape — which came from clinical exercise
        // physiology — and the sentence says so, says nobody from their profession has
        // described their week, and says every other shape is one tap away.
        chooseProfession('art-therapist');
        expect(suggestedShapeFor('art-therapist').id).toBe('shape-weekday-sessions');
        expectOnScreen(/suggested starting point/i);
        expectOnScreen(/no team in your profession has described their week/i);
        expectOnScreen(/says nothing about your service/i);

        // NOTHING LOADED ITSELF. A suggestion that applies itself is a claim about that
        // profession's service, which is the error being corrected.
        expect(shapeSelect().value).toBe('');
        expect(screen.getByLabelText('Staff row 1 name').value).toBe('');

        // A PROFESSION ONE OF WHOSE TEAMS DESCRIBED A SHAPE IS TOLD EXACTLY THAT — one
        // team, at one institution. NOT "your profession described this", which is the
        // sentence this assertion used to pin and which was false for every colleague of
        // that team working anywhere else.
        chooseProfession('physiotherapist');
        expectOnScreen(/came from ONE team in your profession, at one institution/i);
        expectOnScreen(/one team is not a profession/i);
        expect(screen.queryByText(/your own profession described to us/i)).toBeNull();

        // A SUB-DISCIPLINE OF A NESTING PROFESSION inherits its parent's shape: the
        // psychology interview did not distinguish which of the six, so all six get it
        // rather than one of them being invented as "the" source.
        chooseProfession('psychologist-forensic');
        expect(suggestedShapeFor('psychologist-forensic').id).toBe('shape-periodic-clinic');

        // ⚠️ RESPIRATORY HAS A SHAPE AND STILL GETS NO SUGGESTION, and that pair of facts
        // is the correction. Their lead described their week on 2026-08-17, so the sixth
        // shape is real and attributed — but respiratory therapists work across every
        // institution in the cluster and rotate differently, so pointing all of them at
        // one KKH team's structure would be the twelve arrangements' over-claim wearing an
        // interview as cover. Attributed, reachable, NOT suggested.
        expect(shapeOf('shape-graded-floor-rotation').sourceProfession).toBe('Respiratory Therapist');
        expect(suggestedShapeFor('respiratory-therapist')).toBeNull();

        // AND A PROFESSION WITH NO PAIRING GETS NO SUGGESTION, and is told why. Three of
        // these five had a hand-built fixture before this change, which is the clearest
        // measure of what was wrong with it: a guess reads as more helpful than a blank,
        // and it is not. AUDIOLOGY IS HERE FOR A THIRD REASON AGAIN — their roster master
        // has been spoken to, but he asked for a feature, not described his week. A
        // conversation is not a structure.
        for (const orphan of ['audiologist', 'medical-social-worker', 'auditory-verbal-therapist', 'prosthetist-orthotist', 'respiratory-therapist']) {
            expect(DEMO_SHAPE_SUGGESTIONS[orphan]).toBeUndefined();
            expect(suggestedShapeFor(orphan)).toBeNull();
        }
        chooseProfession('audiologist');
        expectOnScreen(/no suggested starting point/i);
        expectOnScreen(/rather than hand you a guess/i);

        expectNoFirestoreTraffic();
    });

    it('says whose structure a shape is — on choosing it, and again beside the report', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        const graded = shapeOf('shape-graded-duty');

        // Nothing is claimed while no shape is chosen.
        expect(screen.queryByText(graded.attribution)).toBeNull();

        loadShapeById('shape-graded-duty');

        // ON CHOOSING: the attribution is there immediately, not after a draft. It names
        // the physiotherapists AND says it is a starting point — the amber "please
        // correct this" panel it replaced apologised for a guess, and there are no
        // guesses left to apologise for.
        expectOnScreen(graded.attribution);
        // SCOPED, NOT PROFESSION-WIDE: "one physiotherapy team, at one institution".
        expectOnScreen(/One physiotherapy team, at one institution/i);

        clickGenerate();

        // AFTER DRAFTING — and this is the assertion that matters, because the wizard is
        // a modal and it has now closed. What the room looks at is a finished roster, and
        // a borrowed structure with no attribution near it quietly becomes "our roster".
        expectOnScreen(graded.attribution);
        expectOnScreen(new RegExp(graded.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));

        expectNoFirestoreTraffic();
    });

    it('labels the roster with the visitor\'s own profession, not the shape\'s', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        // THE CLAIM THE WHOLE CHANGE RESTS ON, on screen: an art therapist who rides the
        // physiotherapists' structure sees ART THERAPIST on their roster, and the
        // structure keeps its own attribution beside it. Two facts, neither pretending to
        // be the other.
        chooseProfession('art-therapist');
        loadShapeById('shape-graded-duty');
        clickGenerate();

        expectOnScreen(/Art Therapist — Graded duty split/i);
        // SCOPED, NOT PROFESSION-WIDE: "one physiotherapy team, at one institution".
        expectOnScreen(/One physiotherapy team, at one institution/i);
        // The shape's source profession is NOT offered as the visitor's own.
        expect(screen.queryByText(/^Physiotherapist — /)).toBeNull();

        expectNoFirestoreTraffic();
    });

    it('generates the same roster whichever profession loaded the shape', () => {
        // THE OTHER HALF OF THE SAME CLAIM, measured rather than asserted: the profession
        // is a LABEL and reaches no engine field, so the roster an art therapist gets
        // from a shape is the roster a physiotherapist gets from it. If the profession
        // ever started editing rows, this is the test that would fail.
        const expected = generateRosterV2(shapeOf('shape-graded-duty').config);

        const rosterUnder = (professionId) => {
            render(<RosterView user={VISITOR} />);
            openConfigure();
            if (professionId) chooseProfession(professionId);
            loadShapeById('shape-graded-duty');
            clickGenerate();
            const month = expected.effectiveStart.slice(0, 7);
            const dates = Object.keys(expected.roster).filter((key) => key.startsWith(month)).sort();
            const read = dates.map((dateKey) => [dateKey, shiftsInDay(dateKey)]);
            cleanup();
            return read;
        };

        const asArtTherapist = rosterUnder('art-therapist');
        const asPhysiotherapist = rosterUnder('physiotherapist');
        const asNobody = rosterUnder(null);

        expect(asArtTherapist.length).toBeGreaterThan(0);
        expect(asArtTherapist).toEqual(asPhysiotherapist);
        expect(asArtTherapist).toEqual(asNobody);

        // …and it is the engine's own answer for the fixture, not merely a stable one.
        for (const [dateKey, rendered] of asArtTherapist) {
            expect(rendered.map((entry) => entry.task))
                .toEqual(expected.roster[dateKey].map((entry) => entry.task));
            expect(rendered.map((entry) => entry.staff))
                .toEqual(expected.roster[dateKey].map((entry) => entry.staff));
        }
    });

    it('says nothing about anybody\'s structure over a team typed in by hand', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        setStaffRow(1, { name: 'Aisha Rahman' });
        setStaffRow(2, { name: 'Ben Carter' });
        setTaskName(1, 'Ward Round');
        clickGenerate();

        // The one direction this label must never be wrong in: a team who typed their own
        // roster in borrowed nothing from anybody, and naming somebody else's profession
        // beside their roster would be a false statement about their own data.
        for (const entry of DEMO_SHAPES) {
            expect(screen.queryByText(entry.attribution)).toBeNull();
        }
        expectNoFirestoreTraffic();
    });

    it('empties the tables when Start blank is chosen, and keeps the profession', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        chooseProfession('art-therapist');
        loadShapeById('marvel-worked-example');
        expect(screen.getByLabelText('Staff row 1 name').value).toBe('Carol Danvers');

        // BACK TO BLANK, which was unreachable before: the placeholder could be read but
        // never chosen, so a visitor who loaded a shape had no way back to empty rows
        // except reloading the page.
        loadShapeById('');
        expect(screen.getByLabelText('Staff row 1 name').value).toBe('');
        expect(screen.queryByLabelText('Staff row 6 name')).toBeNull();
        expect(shapeSelect().value).toBe('');
        for (const entry of DEMO_SHAPES) {
            expect(screen.queryByText(entry.attribution)).toBeNull();
        }

        // The profession is the visitor's own designation and is NOT part of any shape,
        // so emptying the form is no reason to make them say who they are again.
        expect(professionSelect().value).toBe('art-therapist');

        expectNoFirestoreTraffic();
    });

    it('carries each shape\'s own start date and run length', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        for (const entry of DEMO_SHAPES) {
            loadShapeNamed(entry.name);
            expect(screen.getByLabelText(/start date/i).value).toBe(entry.config.startDate);
            expect(screen.getByLabelText(/^weeks$/i).value).toBe(String(entry.config.weeks));
        }

        // Not decoration for three of the five: a periodic-clinic run shorter than two
        // months holds one occurrence of a monthly clinic and cannot show continuity; a
        // team-rotation run shorter than a block shows a rota rather than a handover; the
        // weekend-quota run starts on the 1st so its first quota period is a WHOLE month
        // the engine will judge. Pinned so a "tidier" 4-week default cannot silently take
        // the demonstration away.
        expect(shapeOf('shape-periodic-clinic').config.weeks).toBeGreaterThanOrEqual(9);
        expect(shapeOf('shape-team-rotation').config.weeks).toBeGreaterThan(17);
        expect(shapeOf('shape-weekend-quota').config.startDate.endsWith('-01')).toBe(true);
    });
});

// --- THE PERIODIC SPECIALIST CLINIC SHAPE (from the psychologists' own week):
// --- the 3rd Wednesday, principals only, the same principal every time ---------

describe('demo mode: the periodic specialist clinic shape', () => {
    const fixture = shapeOf('shape-periodic-clinic').config;
    const expected = generateRosterV2(fixture);
    const CLINIC = 'Complex Trauma Clinic';

    it('runs the specialised clinic on the third Wednesday of each month, not weekly', () => {
        const dates = engineDatesFor(expected, CLINIC);
        // Three occurrences in twelve weeks — one per calendar month, which is the
        // whole difference between `recurrence` and `days: [3]`.
        expect(dates).toEqual(['2026-09-16', '2026-10-21', '2026-11-18']);

        for (const dateKey of dates) {
            const [year, month, day] = dateKey.split('-').map(Number);
            // LOCAL date construction, never `new Date('YYYY-MM-DD')` — post-mortem B2.
            expect(new Date(year, month - 1, day).getDay()).toBe(3); // a Wednesday
            expect(Math.floor((day - 1) / 7) + 1).toBe(3); // the THIRD one
        }

        // And it is not simply every Wednesday: twelve weeks hold twelve of those.
        expect(dates.length).toBe(3);
    });

    it('shows the same principal leading every occurrence, read out of the calendar', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        loadShapeById('shape-periodic-clinic');
        clickGenerate();

        const leads = [];
        for (const [dateKey, monthLabel] of [
            ['2026-09-16', 'September 2026'],
            ['2026-10-21', 'October 2026'],
            ['2026-11-18', 'November 2026'],
        ]) {
            goToMonth(monthLabel);
            const clinic = shiftsInDay(dateKey).find((shift) => shift.task === CLINIC);
            expect(clinic).toBeTruthy();

            // AND NOT ON THE OTHER WEDNESDAYS OF THE SAME MONTH. Without this the whole
            // rendered test passes just as happily against `days: [3]` — every Wednesday
            // — because the third one is still a Wednesday. Measured: this line is what
            // makes the calendar itself, rather than only the fixture, say "monthly".
            const [yy, mm, dd] = dateKey.split('-').map(Number);
            for (const other of [dd - 14, dd - 7, dd + 7]) {
                if (other < 1 || other > new Date(yy, mm, 0).getDate()) continue;
                const otherKey = `${yy}-${String(mm).padStart(2, '0')}-${String(other).padStart(2, '0')}`;
                expect(shiftsInDay(otherKey).map((shift) => shift.task)).not.toContain(CLINIC);
            }

            const lead = /Lead:\s*([^,]+)/.exec(clinic.staff)[1].trim();

            // PRINCIPALS ONLY — checked by looking the name up in the fixture's own
            // grades, not by trusting the engine's report.
            const person = fixture.staff.find((entry) => entry.name === lead);
            expect(bandOfGrade(person.grade, fixture.rules.bands)).toBe('principal');
            leads.push(lead);
        }

        // CONTINUITY OF CARE: one clinician, three months, seen in the calendar.
        expect(new Set(leads).size).toBe(1);
        // …and the engine agrees it never had to break it.
        expect(expected.score.breakdown.continuityBreaks).toBe(0);

        // The co-lead slot is NOT band-gated, which is the supervision shape: bands
        // gate the lead only, so a junior can sit in on a clinic they cannot hold.
        expectNoFirestoreTraffic();
    });

    it('reports a 42-hour week as hours, and staffs everything else on weekdays', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        loadShapeById('shape-periodic-clinic');

        // The week is a TYPED value in the box that owns it, not a hidden fixture
        // field — so the room can change it mid-demonstration.
        expect(screen.getByLabelText(/standard working week/i).value).toBe('42');

        clickGenerate();

        // The hours model is live, so the load table gained its hours columns.
        expect(expected.load[fixture.staff[0].name].weeklyCap).toBeGreaterThan(0);
        expectOnScreen(/hours/i);

        // Nothing at the weekend except the clinic's own weekday: every date the
        // engine produced is Mon–Fri.
        for (const dateKey of Object.keys(expected.roster)) {
            const [year, month, day] = dateKey.split('-').map(Number);
            const weekday = new Date(year, month - 1, day).getDay();
            expect(weekday).toBeGreaterThanOrEqual(1);
            expect(weekday).toBeLessThanOrEqual(5);
        }

        expect(expected.unfilled).toHaveLength(0);
        expect(expected.warnings).toEqual([]);
        expectNoFirestoreTraffic();
    });
});

// --- THE TEAM-BASED ROTATION SHAPE (from the embryologists' own week):
// --- a trio on one shift, and three teams in four-month blocks -----------------

describe('demo mode: the team-based rotation shape', () => {
    const fixture = shapeOf('shape-team-rotation').config;
    const expected = generateRosterV2(fixture);
    const WEEKEND = 'Weekend Laboratory Cover';
    const TEAMS = {
        A: fixture.staff.slice(0, 3).map((person) => person.name),
        B: fixture.staff.slice(3, 6).map((person) => person.name),
        C: fixture.staff.slice(6, 9).map((person) => person.name),
    };

    const weekendShifts = () => Object.entries(expected.roster)
        .flatMap(([dateKey, shifts]) => shifts
            .filter((shift) => shift.task === WEEKEND)
            .map((shift) => ({ dateKey, assignees: shift.assignees })));

    it('staffs every weekend shift with three people, one of each band', () => {
        const weekends = weekendShifts();
        expect(weekends.length).toBeGreaterThan(0);

        for (const { assignees } of weekends) {
            // THREE, not two. A `slots` list is one entry per person the shift needs,
            // and the third of them has no place in the two-name display string —
            // which is exactly the audit finding this shape exists to show.
            expect(assignees).toHaveLength(3);
            expect(new Set(assignees).size).toBe(3);

            const bands = assignees.map((name) => {
                const person = fixture.staff.find((entry) => entry.name === name);
                return bandOfGrade(person.grade, fixture.rules.bands);
            });
            expect(bands.sort()).toEqual(['junior', 'principal', 'senior']);
        }

        // No slot went unstaffed anywhere in a nine-month run.
        expect(expected.unfilled).toHaveLength(0);
        expect(expected.score.hardViolations).toBe(0);
    });

    it('never puts two teams on one weekend shift, in any of the nine months', () => {
        for (const { dateKey, assignees } of weekendShifts()) {
            const owning = Object.entries(TEAMS).filter(([, names]) =>
                assignees.some((name) => names.includes(name)));
            // Exactly ONE team is present on the shift, and all three of its members.
            expect(owning).toHaveLength(1);
            const [, names] = owning[0];
            expect(assignees.every((name) => names.includes(name))).toBe(true);
            expect(dateKey).toBeTruthy();
        }
    });

    it('keeps each team inside its own four-month block', () => {
        const range = (team) => {
            const dates = weekendShifts()
                .filter(({ assignees }) => assignees.some((name) => TEAMS[team].includes(name)))
                .map(({ dateKey }) => dateKey)
                .sort();
            return { first: dates[0], last: dates[dates.length - 1], count: dates.length };
        };

        // Team A's block ends 2026-12-31 and team B's opens the next day, so the two
        // ranges cannot overlap — and neither reaches into the other's months. This is
        // the cohort window binding, checked as dates rather than as a feeling.
        const a = range('A');
        const b = range('B');
        expect(a.last < '2027-01-01').toBe(true);
        expect(b.first >= '2027-01-01').toBe(true);
        expect(b.last < '2027-05-01').toBe(true);
        // TWO WHOLE BLOCKS, which is why the run is 36 weeks: one block is a rota,
        // two is a handover.
        expect(a.count).toBeGreaterThan(20);
        expect(b.count).toBeGreaterThan(20);
    });

    it('renders the trio in the calendar, and team A nowhere near a team B weekend', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        loadShapeById('shape-team-rotation');
        clickGenerate();

        // A weekend inside BLOCK A. The third assignee is on the "Also:" line — the
        // display string only carries two names, so without that line one of the three
        // would be invisible in the calendar.
        goToMonth('September 2026');
        const inBlockA = shiftsInDay('2026-09-12').find((shift) => shift.task === WEEKEND);
        expect(inBlockA).toBeTruthy();
        expect(inBlockA.names).toHaveLength(3);
        expect(inBlockA.also).toMatch(/^Also:/);
        expect(inBlockA.names.every((name) => TEAMS.A.includes(name))).toBe(true);

        // A weekend inside BLOCK B, four months later. Team B's three, and not one
        // member of team A — the property the whole windows feature exists for.
        goToMonth('February 2027');
        const inBlockB = shiftsInDay('2027-02-06').find((shift) => shift.task === WEEKEND);
        expect(inBlockB).toBeTruthy();
        expect(inBlockB.names).toHaveLength(3);
        expect(inBlockB.names.every((name) => TEAMS.B.includes(name))).toBe(true);
        for (const name of TEAMS.A) {
            expect(inBlockB.names).not.toContain(name);
        }

        expectNoFirestoreTraffic();
    });
});

// --- THE WEEKEND QUOTA SHAPE (from the medical laboratory scientists' own week):
// --- a FLOOR, not a ceiling ----------------------------------------------------

describe('demo mode: the weekend quota shape', () => {
    const fixture = shapeOf('shape-weekend-quota').config;
    const expected = generateRosterV2(fixture);
    const SATURDAY = 'Saturday Bench';
    /** The months the run holds in their ENTIRETY — the only ones a floor is judged in. */
    const WHOLE_MONTHS = ['2027-02', '2027-03'];

    /** name -> month -> Set of DISTINCT Saturday dates. */
    const saturdaysByPerson = () => {
        const out = new Map();
        for (const [dateKey, shifts] of Object.entries(expected.roster)) {
            for (const shift of shifts) {
                if (shift.task !== SATURDAY) continue;
                for (const name of shift.assignees) {
                    if (!out.has(name)) out.set(name, new Map());
                    const months = out.get(name);
                    const monthKey = dateKey.slice(0, 7);
                    if (!months.has(monthKey)) months.set(monthKey, new Set());
                    months.get(monthKey).add(dateKey);
                }
            }
        }
        return out;
    };

    it('declares the floor, and declares it exactly at the arithmetic the engine allows', () => {
        const saturday = fixture.tasks.find((task) => task.name === SATURDAY);
        // THE FIELD, named. Deleting `quota` from the fixture has to fail a test that
        // says the word rather than only the ones that measure its effect.
        expect(saturday.quota).toEqual({ per: 'month', min: 2 });

        // AND THE ARITHMETIC, which is the reason this fixture has the shape it has.
        // Demand equals supply: 8 people × 2 duties = 16, against a 4-Saturday month ×
        // 4 slots = 16. One slot fewer is arithmetically impossible and the engine
        // refuses it outright; more slack and the floor stops doing any work at all —
        // measured, and the fixture's own comment records how that was found.
        const demand = fixture.staff.length * saturday.quota.min;
        const supply = 4 * saturday.slots.length;
        expect(demand).toBe(16);
        expect(supply).toBe(16);
        expect(demand).toBeLessThanOrEqual(supply);
    });

    it('gives every scientist at least two DISTINCT Saturdays in every whole month', () => {
        const counts = saturdaysByPerson();

        // Everybody, not just most people — a floor that skips one person is the
        // failure the report is supposed to name.
        expect(counts.size).toBe(fixture.staff.length);

        for (const person of fixture.staff) {
            for (const monthKey of WHOLE_MONTHS) {
                const dates = counts.get(person.name).get(monthKey);
                // DISTINCT DATES, deliberately, and this is the load-bearing detail: a
                // quota counts DUTIES, so "two Saturdays" and "two Saturday duties" are
                // only the same sentence while one Saturday cannot hold two duties for
                // one person. That is why this shape has ONE Saturday task rather
                // than two, and counting dates rather than duties is what proves it.
                expect(dates.size).toBeGreaterThanOrEqual(2);
            }
        }
    });

    it('reaches that floor with no hard violation and nothing left unstaffed', () => {
        expect(expected.ok).toBe(true);
        expect(expected.score.hardViolations).toBe(0);
        expect(expected.unfilled).toHaveLength(0);

        // ONE warning, and it is the engine being honest about its own horizon rather
        // than a shortfall: the run ends four days into April, so the floor is not
        // judged for a month it holds only part of. Asserted by shape — a genuine
        // shortfall says "Quota floor not met", and this must not be that.
        expect(expected.warnings).toHaveLength(1);
        expect(expected.warnings[0]).toContain('2027-04');
        expect(expected.warnings[0]).toContain('not judged');
        expect(expected.warnings[0]).not.toContain('not met');
    });

    it('renders four names on every Saturday bench, and the weekdays as sessions', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        loadShapeById('shape-weekend-quota');
        clickGenerate();

        goToMonth('February 2027');

        // Every Saturday in February 2027, read out of its own square.
        const appearances = new Map(fixture.staff.map((person) => [person.name, 0]));
        for (const dateKey of ['2027-02-06', '2027-02-13', '2027-02-20', '2027-02-27']) {
            const bench = shiftsInDay(dateKey).find((shift) => shift.task === SATURDAY);
            expect(bench).toBeTruthy();
            // Four slots, so four people — two of whom exist only on the "Also:" line.
            expect(bench.names).toHaveLength(4);
            for (const name of bench.names) {
                expect(appearances.has(name)).toBe(true);
                appearances.set(name, appearances.get(name) + 1);
            }
        }

        // THE SIGNATURE PROPERTY, IN THE RENDERED OUTPUT: every one of the six is on
        // at least two of the four Saturday squares.
        for (const [name, seen] of appearances) {
            expect(seen).toBeGreaterThanOrEqual(2);
            expect(name).toBeTruthy();
        }

        // A Sunday is not a working day here, so its square holds nothing.
        expect(shiftsInDay('2027-02-07')).toEqual([]);

        expectNoFirestoreTraffic();
    });

    it('states the 42-hour week in the box that owns it', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        loadShapeById('shape-weekend-quota');
        expect(screen.getByLabelText(/standard working week/i).value).toBe('42');
        expectNoFirestoreTraffic();
    });
});

// --- THE OTHER TWO SHAPES: one signature capability each -----------------------
//
// WAS SEVEN TESTS, one per arrangement in the batch the roster owner asked for. FIVE OF
// THOSE SEVEN ARRANGEMENTS WERE DELETED — audiology, cardiology, clinical counselling,
// medical social work and pulmonary were inferred services nobody had described — and
// their tests went with them rather than being left describing fixtures nothing loads.
// The two that remain came from interviews and are shapes.
//
// WHAT WENT WITH THEM, stated rather than discovered later: those five tests were the
// only place in THIS file that exercised `requiresSkill` on a monthly recurrence,
// `forbidPairs`, task-scoped `windows` and a stated `maxHoursPerDay` through a fixture.
// Every one of those engine fields still has its own unit tests in
// `src/utils/rosterEngineV2.*.test.js` and its own control in the wizard tables; what is
// gone is five inventions, not five capabilities. The skill gate is still exercised HERE,
// through the worked example's CPET duty, in sections 1 and 8.
//
// ENGINE-LEVEL ONLY, deliberately, and this is where the line was drawn. The three
// sections above render their shape into the calendar because their capability is
// invisible in the fixture (a monthly recurrence, a cohort window and a quota floor all
// look like ordinary fields until the engine runs). These two are checked against the
// engine and then handed to the ONE render test below, which compares the calendar
// against `generateRosterV2` shift by shift for all seven — so a field that failed to
// survive the wizard still fails a test, without seven more jsdom mounts.
//
// BOTH ARE MUTATION-CHECKED: the assertion is not "the feature is configured" but
// "removing it changes the roster". A constraint that agrees with what fairness would
// have done anyway is a decoy test, and this file has been caught shipping one before
// (see the medical laboratory fixture's own header).

describe('demo mode: the graded duty split and the fixed weekday sessions', () => {
    /** The whole run as a flat list of `{ date, …shift }`. */
    const flatten = (result) => Object.keys(result.roster).sort()
        .flatMap((dateKey) => result.roster[dateKey].map((shift) => ({ date: dateKey, ...shift })));

    /** A fixture with `mutate` applied to a deep copy — the fixtures are frozen. */
    const without = (id, mutate) => {
        const copy = JSON.parse(JSON.stringify(shapeOf(id).config));
        mutate(copy);
        return generateRosterV2(copy);
    };

    const leadsOf = (result, task) =>
        [...new Set(flatten(result).filter((shift) => shift.task === task).map((shift) => shift.lead))].sort();

    it('graded duty split: juniors on the wards and at weekends, seniors in the clinics', () => {
        const fixture = shapeOf('shape-graded-duty').config;
        const result = generateRosterV2(fixture);
        const bandOfPerson = (name) => bandOfGrade(
            fixture.staff.find((person) => person.name === name).grade,
            fixture.rules.bands,
        );

        const juniorGated = flatten(result)
            .filter((shift) => ['Inpatient Ward Round', 'Weekend Inpatient Cover'].includes(shift.task));
        const seniorGated = flatten(result).filter((shift) => shift.task.startsWith('Outpatient'));
        expect(juniorGated.length).toBeGreaterThan(0);
        expect(seniorGated.length).toBeGreaterThan(0);

        for (const shift of juniorGated) expect(bandOfPerson(shift.lead)).toBe('junior');
        for (const shift of seniorGated) expect(['senior', 'principal']).toContain(bandOfPerson(shift.lead));

        // Bands gate the LEAD only, so a senior co-leading a junior's ward round is the
        // supervision shape rather than a violation — asserted so a future change that
        // starts gating co-leads has to come past this line.
        const rounds = flatten(result).filter((shift) => shift.task === 'Inpatient Ward Round');
        expect(rounds.some((shift) => ['senior', 'principal'].includes(bandOfPerson(shift.coLead)))).toBe(true);

        // Both weekend days are covered, by one person each.
        const weekend = flatten(result).filter((shift) => shift.task === 'Weekend Inpatient Cover');
        expect(weekend.length).toBe(8);
        for (const shift of weekend) expect(shift.assignees).toHaveLength(1);

        // MUTATION: drop the gates and seniors start leading ward rounds.
        const ungated = without('shape-graded-duty', (copy) => {
            copy.tasks = copy.tasks.map((task) => { delete task.leadBands; return task; });
        });
        expect(leadsOf(ungated, 'Inpatient Ward Round').length)
            .toBeGreaterThan(leadsOf(result, 'Inpatient Ward Round').length);
        expect(leadsOf(ungated, 'Outpatient Musculoskeletal Clinic').length)
            .toBeGreaterThan(leadsOf(result, 'Outpatient Musculoskeletal Clinic').length);
    });

    it('fixed weekday sessions: the real duty list, and the Tuesday that needs three', () => {
        const fixture = shapeOf('shape-weekday-sessions').config;
        const result = generateRosterV2(fixture);

        // The run starts on the Monday the LIVE roster's Sunday start snaps forward to.
        expect(result.effectiveStart).toBe('2026-02-02');
        // Tuesday carries the four core duties AND the afternoon video consult…
        expect(result.roster['2026-02-03'].map((shift) => shift.task))
            .toEqual(['EFT', 'IPT+SKG', 'NC', 'FSG+WI', 'VC (PM)']);
        // …Saturday carries the morning one and nothing else, and Sunday nothing at all.
        expect(result.roster['2026-02-07'].map((shift) => shift.task)).toEqual(['VC (AM)']);
        expect(result.roster['2026-02-08']).toBeUndefined();

        // Somebody holds three duties on that Tuesday, and nobody holds four anywhere.
        const dutiesOn = (dateKey) => {
            const perPerson = {};
            for (const shift of result.roster[dateKey]) {
                for (const person of shift.assignees) perPerson[person] = (perPerson[person] || 0) + 1;
            }
            return Object.values(perPerson);
        };
        expect(Math.max(...dutiesOn('2026-02-03'))).toBe(3);
        for (const dateKey of Object.keys(result.roster)) {
            expect(Math.max(...dutiesOn(dateKey))).toBeLessThanOrEqual(3);
        }

        // MUTATION: the 2-a-day cap every other shape uses cannot staff this week.
        const capped = without('shape-weekday-sessions', (copy) => { copy.rules.maxConcurrentPerDay = 2; });
        expect(result.unfilled).toHaveLength(0);
        expect(capped.unfilled.length).toBe(8);
    });
});

// --- THE ROUND TRIP: the tables drop nothing ---------------------------------

describe('demo mode: every shape survives the wizard intact', () => {
    /**
     * THE TEST THAT MAKES THE OTHER SEVEN MEAN SOMETHING.
     *
     * Each shape's interesting field — a monthly `recurrence`, `continuity`, a
     * `slots` list, a cohort `window`, a `quota`, a stated `weeklyHours` — has to
     * travel from the frozen fixture, through the picker, into the wizard's rows, back
     * out through `buildDemoRosterV2ConfigFromTables` and into the engine. A field
     * dropped anywhere on that path produces a roster that is still valid, still
     * violation-free, and QUIETLY DIFFERENT: a weekly clinic instead of a monthly one,
     * a pair instead of a trio, everybody eligible every month.
     *
     * So the rendered calendar is compared against `generateRosterV2(fixture)` shift
     * by shift, for the whole month the view opens on. Nothing is hardcoded: the
     * expectation is the engine's own answer for the fixture.
     */
    it.each(DEMO_SHAPES.map((entry) => [entry.name, entry.id]))(
        'renders exactly the engine\'s own roster for %s',
        (name, id) => {
            const entry = shapeOf(id);
            const expected = generateRosterV2(entry.config);

            render(<RosterView user={VISITOR} />);
            openConfigure();
            loadShapeNamed(name);
            clickGenerate();

            // The view opens on the month the run starts in.
            expect(screen.getByText(expected.effectiveStart)).toBeTruthy();

            const openingMonth = expected.effectiveStart.slice(0, 7);
            const datesInMonth = Object.keys(expected.roster)
                .filter((dateKey) => dateKey.startsWith(openingMonth))
                .sort();
            expect(datesInMonth.length).toBeGreaterThan(0);

            for (const dateKey of datesInMonth) {
                const rendered = shiftsInDay(dateKey);
                const engineShifts = expected.roster[dateKey];

                expect(rendered.map((shift) => shift.task)).toEqual(engineShifts.map((shift) => shift.task));
                expect(rendered.map((shift) => shift.staff)).toEqual(engineShifts.map((shift) => shift.staff));
                // …and everybody on the shift, including the people the two-name
                // display string cannot carry.
                expect(rendered.map((shift) => shift.names.length))
                    .toEqual(engineShifts.map((shift) => shift.assignees.length));
            }

            expectNoFirestoreTraffic();
        },
    );
});

// ─── THE CATEGORY: COLOURED, SUGGESTED, NEVER GUESSED ─────────────────────────
//
// The owner's palette (Management yellow, Clinical brown, Research limegreen,
// Education orange) derives from ONE map that the calendar, the wizard labels
// and the ICS exporter all read. These tests pin the two component-level
// behaviours the unit tests cannot see: the chip renders the palette, and the
// suggestion is offered — never applied.

describe('demo mode: the category chip and its suggestion', () => {
    it('offers a suggestion from the task name, with its reason, and applies it only on a tap', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        setTaskName(1, 'Journal Club');
        toggleTaskMore(1);

        // The suggestion names its evidence — deterministic, not a guess…
        const chip = screen.getByLabelText('Task row 1: apply suggested category Research');
        expect(chip.textContent).toContain('Research');
        expect(chip.textContent).toContain('Journal');

        // …and NOTHING is applied until it is tapped.
        expect(screen.getByLabelText('Task row 1 category').value).toBe('');
        fireEvent.click(chip);
        expect(screen.getByLabelText('Task row 1 category').value).toBe('Research');

        // Once a category exists the suggestion withdraws — typed means decided.
        expect(screen.queryByLabelText('Task row 1: apply suggested category Research')).toBeNull();
    });

    it('stays silent for a name it has no opinion about', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        setTaskName(1, 'Holter');
        toggleTaskMore(1);
        expect(screen.queryByLabelText(/apply suggested category/)).toBeNull();
    });

    it('renders the worked example\'s categories in the palette, and leaves the rest neutral', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        loadExample();

        // Clinical wears brown (the hex chip — Tailwind has no brown scale)…
        const clinical = screen.getAllByText('Clinical').find((el) => el.className.includes('#f2e6d8') || el.className.includes('#3f2d1d'));
        expect(clinical).toBeTruthy();
        // …Education wears orange…
        const education = screen.getAllByText('Education').find((el) => el.className.includes('bg-orange'));
        expect(education).toBeTruthy();
        // …and a category nobody standardised gets NO colour nobody chose.
        const diagnostics = screen.getAllByText('Diagnostics').find((el) => el.className.includes('inline-block'));
        expect(diagnostics).toBeTruthy();
        expect(diagnostics.className).not.toMatch(/bg-orange|bg-lime|bg-yellow|#f2e6d8/);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// NEVER ROSTERED — defect D2/D3/D9, and the first UI caller `measureRosterLoad`
// has ever had.
//
// ⚠️ THE DEFECT'S OWN DESCRIPTION WAS WRONG IN A WAY WORTH PINNING. The ledger
// said the engine "computes this and DISCARDS it — there is no UI caller at
// all", which reads as "the information is unavailable to the user". It was
// not: `result.load` is built `for (const person of staff)`, so a never-rostered
// colleague has ALWAYS had a row in the load table, reading `0`. The real gap is
// that a `0` among nine rows does not announce itself — and the defect's actual
// scenario, a mistyped availability window quietly removing somebody, is exactly
// when nobody thinks to look. These tests therefore pin the CALLOUT, and the
// first one pins the pre-existing `0` too so a future refactor cannot "fix" the
// callout by removing the row it points at.
// ═════════════════════════════════════════════════════════════════════════════
describe('demo mode: who was never rostered', () => {
    it('names the people who hold no duty, and does not hide the row that already said so', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        // The respiratory shape gates three below-floor staff out of every task,
        // so it is the fixture that exercises this without inventing one.
        loadShapeById('shape-graded-floor-rotation');
        clickGenerate();

        expectOnScreen(/Never rostered \(3\)/i);
        expectOnScreen(/March Hare, Dormouse, Bill the Lizard/);
        expectOnScreen(/hold no duty at all/i);

        // The prose is deliberately read off the PANEL's textContent rather than
        // through `getAllByText`. Half of these phrases are broken across `<span>`
        // boundaries by the bolding, and a text matcher cannot span elements — the
        // first draft of this test failed for exactly that reason and would have
        // been "fixed" by deleting the bold, which is the wrong direction.
        const panel = screen.getByText(/Never rostered \(3\)/i).closest('div');
        const prose = panel.textContent.replace(/\s+/g, ' ');
        // Why it is not simply an error: here it is correct.
        expect(prose).toMatch(/correct if they are not part of this rota/i);
        // And the four causes are named, in order, because "why" is the question a
        // roster master actually has when this IS a surprise.
        expect(prose).toMatch(/grade.*skill.*unavailable dates.*window/i);

        // THE PRE-EXISTING ROW STILL EXISTS. This is the assertion that stops a
        // future change from deleting the table row and calling the callout the
        // fix — the callout points AT the row.
        const zeroes = screen.getAllByText('0');
        expect(zeroes.length).toBeGreaterThanOrEqual(3);
    });

    it('says so plainly when everybody holds a duty', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        loadShapeById('shape-graded-duty');
        clickGenerate();

        expectOnScreen(/Never rostered \(0\)/i);
        expectOnScreen(/Everybody in the staff pool holds at least one duty/i);
        // No amber alarm when there is nothing to be alarmed about.
        expect(screen.queryByText(/hold no duty at all/i)).toBeNull();
    });

    it('reports the heaviest single day, which also had no reader', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        loadShapeById('shape-graded-floor-rotation');
        clickGenerate();

        // `measureRosterLoad` returns `busiestDay` as "<name> on <date key>".
        // Asserting the SHAPE rather than a specific name: who is busiest is a
        // tie-break detail, and pinning it would fail the day fairness changes.
        expectOnScreen(/Heaviest single day:/i);
        expectOnScreen(/\w+ on \d{4}-\d{2}-\d{2}/);
        expectOnScreen(/\(1 duty\)/i);
    });
});
