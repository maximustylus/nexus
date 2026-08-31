/**
 * ==============================================================================
 * ROSTER VIEW — THE STRANDED CAPABILITIES, DRIVEN THROUGH THE REAL CONTROLS
 * ==============================================================================
 * Runner: Vitest + @testing-library/react (jsdom)
 * Run:    npx vitest run src/components/RosterView.reach.test.jsx
 *
 * `ROSTER_QC_AUDIT_SURFACES.md` §3 enumerated nine engine capabilities with no UI
 * path — continuity, monthly recurrence, `forbidPairs`, `maxConsecutiveDays`,
 * `maxConcurrentPerDay`, `staff.maxPerDay`, `task.category`, plus the quotas and
 * cohort windows that landed after it was written. Every one of them was validated,
 * gated, audited and unreachable. §4.7 records what that felt like from the outside:
 *
 *   "Look for continuity of care, a monthly clinic, 'never roster these two
 *    together', or a per-person daily cap, and find no control — even though
 *    061ae93's subject line reads 'grade bands, monthly clinics, continuity of
 *    care'. The engine has continuity and recurrence; the UI has neither."
 *
 * THIS FILE IS THE ASSERTION THAT IT IS NO LONGER TRUE, and it is deliberately the
 * expensive kind. `rosterWizard.test.js` already proves the MAPPER emits each field
 * and that the ENGINE changes its roster when it does. The audit was explicit that
 * this is not enough:
 *
 *   "A test asserting the mapper emits a field is not proof the feature works
 *    end to end."
 *
 * So nothing here calls `buildDemoRosterV2ConfigFromTables`. Every test presses the
 * chevron a visitor presses, types into the box a visitor types into, presses
 * **Draft roster**, and then reads the CALENDAR and the REPORT — comparing them
 * against `generateRosterV2`'s own output for the same configuration, so the claim is
 * "the screen shows what the engine did" rather than "the screen shows what we
 * expected".
 *
 * A SEPARATE FILE FROM `RosterView.demo.test.jsx` on purpose: that file is the deploy
 * gate for the demo path as it stood, and this task's rule is that new tests go in
 * new sibling files. The mock harness is copied rather than shared because the two
 * files must be able to fail independently — a shared helper edited for this feature
 * could weaken the gate next door without either file's assertions changing.
 *
 * THE FIRESTORE LATCH IS RE-ASSERTED IN EVERY TEST HERE. Nine new controls are nine
 * new ways a demo path could grow a write, and `expectNoFirestoreTraffic` is the one
 * assertion that answers "did anything reach live data" rather than assuming it.
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

/**
 * MUTABLE, unlike the demo file's flat `{ isDemo: true }`. Section 9 has to leave the
 * sandbox and come back to prove that a fictional department's limits do not survive
 * the toggle, and that is a question about the effect keyed on `isDemo` rather than
 * about a mount. Every other test here leaves it at `true`, which `beforeEach` restores.
 */
const ctx = { isDemo: true };

vi.mock('../context/NexusContext', () => ({
    useNexus: () => ctx,
    NexusProvider: ({ children }) => children,
}));

import { doc, collection, onSnapshot, setDoc, addDoc, query, where, getDoc, updateDoc } from 'firebase/firestore';
import RosterView from './RosterView';
import { generateRosterV2 } from '../utils/rosterEngineV2';

// --- HELPERS -----------------------------------------------------------------

const VISITOR = { name: 'Visiting Therapist', role: 'staff', email: 'visitor@example.org' };

const openConfigure = () => fireEvent.click(screen.getByRole('button', { name: /configure/i }));
const generateButton = () => screen.getByRole('button', { name: /^draft roster$/i });
const clickGenerate = () => fireEvent.click(generateButton());

/** The DOM property rather than a jest-dom matcher — this repo registers none. */
const generateIsDisabled = () => generateButton().disabled === true;

/**
 * A blocking reason appears TWICE by design — under the row it belongs to and above
 * the Generate button — so "at least one" keeps these tests about the message being
 * reachable rather than about which copy was found.
 */
const expectOnScreen = (matcher) => {
    const found = screen.getAllByText(matcher);
    expect(found.length).toBeGreaterThan(0);
    return found;
};

const setRun = ({ weeks, startDate } = {}) => {
    if (startDate !== undefined) {
        fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: startDate } });
    }
    if (weeks !== undefined) {
        fireEvent.change(screen.getByLabelText(/^weeks$/i), { target: { value: weeks } });
    }
};

// --- the staff table, through its own labels ---------------------------------

const setStaffRow = (row, { name, grade, fte, away } = {}) => {
    const cell = (label) => screen.getByLabelText(`Staff row ${row} ${label}`);
    if (name !== undefined) fireEvent.change(cell('name'), { target: { value: name } });
    if (grade !== undefined) fireEvent.change(cell('job grade'), { target: { value: grade } });
    if (fte !== undefined) fireEvent.change(cell('FTE'), { target: { value: fte } });
    if (away !== undefined) fireEvent.change(cell('away dates'), { target: { value: away } });
};

/** The staff row's disclosure — the chevron, not a state poke. */
const toggleStaffMore = (row) =>
    fireEvent.click(screen.getByLabelText(`Staff row ${row}: limits and availability`));

const setStaffMaxPerDay = (row, value) =>
    fireEvent.change(
        screen.getByLabelText(`Staff row ${row} most duties per day`),
        { target: { value } },
    );

const addWindow = (row) =>
    fireEvent.click(screen.getByRole('button', { name: `Add availability window to person ${row}` }));

const setWindow = (row, index, { from, to, tasks } = {}) => {
    const cell = (which) => screen.getByLabelText(`Staff row ${row} window ${index} ${which}`);
    if (from !== undefined) fireEvent.change(cell('from'), { target: { value: from } });
    if (to !== undefined) fireEvent.change(cell('to'), { target: { value: to } });
    if (tasks !== undefined) fireEvent.change(cell('tasks'), { target: { value: tasks } });
};

// --- the task table, through its own labels ----------------------------------

const setTaskName = (row, name) =>
    fireEvent.change(screen.getByLabelText(`Task row ${row} name`), { target: { value: name } });

const clickDay = (row, label) =>
    fireEvent.click(screen.getByLabelText(`Task row ${row}: ${label}`));

const clickCoLead = (row) => fireEvent.click(screen.getByLabelText(`Task row ${row}: co-lead`));

/** The label is still "hours and staffing" — the handle four sandbox tests use. */
const toggleTaskMore = (row) =>
    fireEvent.click(screen.getByLabelText(`Task row ${row}: hours and staffing`));

const clickMonthly = (row) =>
    fireEvent.click(screen.getByLabelText(`Task row ${row}: repeats once a month`));

const clickWeekly = (row) =>
    fireEvent.click(screen.getByLabelText(`Task row ${row}: repeats every week`));

const setMonthlyPattern = (row, { which, weekday } = {}) => {
    if (which !== undefined) {
        fireEvent.change(screen.getByLabelText(`Task row ${row} week of the month`), { target: { value: which } });
    }
    if (weekday !== undefined) {
        fireEvent.change(screen.getByLabelText(`Task row ${row} monthly weekday`), { target: { value: weekday } });
    }
};

const clickContinuity = (row) =>
    fireEvent.click(screen.getByLabelText(`Task row ${row}: same lead every time`));

const setQuota = (row, { per, min, max } = {}) => {
    if (per !== undefined) {
        fireEvent.change(screen.getByLabelText(`Task row ${row} per-person limit period`), { target: { value: per } });
    }
    if (min !== undefined) {
        fireEvent.change(screen.getByLabelText(`Task row ${row} per-person minimum`), { target: { value: min } });
    }
    if (max !== undefined) {
        fireEvent.change(screen.getByLabelText(`Task row ${row} per-person maximum`), { target: { value: max } });
    }
};

const setCategory = (row, value) =>
    fireEvent.change(screen.getByLabelText(`Task row ${row} category`), { target: { value } });

// --- the department limits panel ---------------------------------------------

const setDepartmentLimits = ({ perDay, inARow } = {}) => {
    if (perDay !== undefined) {
        fireEvent.change(screen.getByLabelText(/most duties in one day/i), { target: { value: perDay } });
    }
    if (inARow !== undefined) {
        fireEvent.change(screen.getByLabelText(/most days in a row/i), { target: { value: inARow } });
    }
};

const addForbiddenPair = (a, b) => {
    fireEvent.change(screen.getByLabelText(/never on the same shift: first person/i), { target: { value: a } });
    fireEvent.change(screen.getByLabelText(/never on the same shift: second person/i), { target: { value: b } });
    fireEvent.click(screen.getByRole('button', { name: /add pair/i }));
};

// --- reading the calendar and the report -------------------------------------

/**
 * Every rendered CALENDAR shift for `task`, as `{ lead, coLead }`, read out of the
 * display string `buildShiftStaffLabel` writes — so these tests check what a roster
 * master SEES, not what the engine reports it did.
 */
const renderedLeadsFor = (task) =>
    screen.getAllByText(task)
        .map((label) => label.closest('button'))
        .filter(Boolean)
        .map((button) => {
            const match = /Lead:\s*([^,]+)(?:,\s*Co:\s*(.+))?$/.exec(button.textContent);
            if (!match) throw new Error(`No "Lead: …" label on the rendered ${task} shift: ${button.textContent}`);
            return { lead: match[1].trim(), coLead: (match[2] || '').trim() };
        });

/** One square of the month grid, by its date key. */
const dayCell = (dateKey) => document.querySelector(`[data-date="${dateKey}"]`);

/** The "not staffed" markers inside one day's square. */
const gapsInCell = (dateKey) => within(dayCell(dateKey)).queryAllByRole('note');

/** Every date square that currently holds at least one shift button. */
const datesWithShifts = () =>
    Array.from(document.querySelectorAll('[data-date]'))
        .filter((cell) => within(cell).queryAllByRole('button').length > 0)
        .map((cell) => cell.getAttribute('data-date'))
        .sort();

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
    ctx.isDemo = true;
    alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

/** The Mon–Fri strip a blank task row opens with, unticked down to `days`. */
const onlyDays = (row, wanted) => {
    for (const { day, label } of [
        { day: 1, label: 'Mon' }, { day: 2, label: 'Tue' }, { day: 3, label: 'Wed' },
        { day: 4, label: 'Thu' }, { day: 5, label: 'Fri' }, { day: 6, label: 'Sat' },
        { day: 0, label: 'Sun' },
    ]) {
        const pressed = screen.getByLabelText(`Task row ${row}: ${label}`).getAttribute('aria-pressed') === 'true';
        if (pressed !== wanted.includes(day)) clickDay(row, label);
    }
};

// ─── 0. THE CONTROLS EXIST, AND LIVE MODE IS NOT WHERE THEY ARE ───────────────

describe('the nine controls are on screen in the sandbox wizard', () => {
    it('puts all three department limits beside the working-week control', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        // The panel, its two boxes, and their placeholders — which state the engine's
        // own defaults rather than prefilling them. The audit's §3 rows for
        // `maxConcurrentPerDay` and `maxConsecutiveDays` both read "example fixture
        // only"; this is the assertion that fails if that is ever true again.
        expect(screen.getByText(/department limits/i)).toBeTruthy();
        const perDay = screen.getByLabelText(/most duties in one day/i);
        const inARow = screen.getByLabelText(/most days in a row/i);
        expect(perDay.value).toBe('');
        expect(inARow.value).toBe('');
        expect(perDay.getAttribute('placeholder')).toBe('2');
        expect(inARow.getAttribute('placeholder')).toBe('6');

        // …and the pair picker, which says so rather than offering two empty boxes
        // while the staff table has nobody in it.
        expect(screen.getByText(/never on the same shift/i)).toBeTruthy();
        expect(screen.queryByLabelText(/never on the same shift: first person/i)).toBeNull();
        expect(screen.getByText(/at least two named people/i)).toBeTruthy();

        expectNoFirestoreTraffic();
    });

    it('offers the pair picker as soon as two people are named, and lists what is added', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setStaffRow(1, { name: 'Ada' });
        setStaffRow(2, { name: 'Ben' });

        addForbiddenPair('Ada', 'Ben');
        expect(screen.getByText('Ada and Ben')).toBeTruthy();

        // …and removing it takes it away again.
        fireEvent.click(screen.getByLabelText(/remove pair 1, Ada and Ben/i));
        expect(screen.queryByText('Ada and Ben')).toBeNull();
        expectNoFirestoreTraffic();
    });

    it('drops a pending pick when that person is renamed out of the table', () => {
        // A `<select>` holding a name with no matching option displays its first option
        // while its value says otherwise — the "control showing a value it does not
        // have" failure this wizard refuses everywhere else. The pick goes back to
        // "Choose someone" rather than being silently substituted.
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setStaffRow(1, { name: 'Ada' });
        setStaffRow(2, { name: 'Ben' });

        const first = screen.getByLabelText(/never on the same shift: first person/i);
        fireEvent.change(first, { target: { value: 'Ben' } });
        expect(screen.getByLabelText(/never on the same shift: first person/i).value).toBe('Ben');

        setStaffRow(2, { name: 'Benedict' });
        expect(screen.getByLabelText(/never on the same shift: first person/i).value).toBe('');
        expect(screen.getByRole('button', { name: /add pair/i }).disabled).toBe(true);
        expectNoFirestoreTraffic();
    });

    it('will not add a self-pair, and offers only the names in the table', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setStaffRow(1, { name: 'Ada' });
        setStaffRow(2, { name: 'Ben' });

        const first = screen.getByLabelText(/never on the same shift: first person/i);
        // "Choose someone" plus the two typed names — never a half-typed blank row.
        expect(within(first).getAllByRole('option').map((option) => option.textContent))
            .toEqual(['Choose someone', 'Ada', 'Ben']);

        fireEvent.change(first, { target: { value: 'Ada' } });
        fireEvent.change(screen.getByLabelText(/never on the same shift: second person/i), { target: { value: 'Ada' } });
        expect(screen.getByRole('button', { name: /add pair/i }).disabled).toBe(true);
        expectNoFirestoreTraffic();
    });

    it('keeps every new task control BEHIND the row disclosure, closed by default', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        // UI ECONOMY, asserted. The visible row must not have grown ten controls.
        for (const label of [
            'Task row 1: repeats once a month',
            'Task row 1: same lead every time',
            'Task row 1 per-person minimum',
            'Task row 1 category',
        ]) {
            expect(screen.queryByLabelText(label)).toBeNull();
        }
        toggleTaskMore(1);
        for (const label of [
            'Task row 1: repeats once a month',
            'Task row 1: same lead every time',
            'Task row 1 per-person minimum',
            'Task row 1 category',
        ]) {
            expect(screen.getByLabelText(label)).toBeTruthy();
        }
        expectNoFirestoreTraffic();
    });

    it('keeps both new staff controls behind the staff row disclosure, closed by default', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        expect(screen.queryByLabelText('Staff row 1 most duties per day')).toBeNull();
        toggleStaffMore(1);
        const cap = screen.getByLabelText('Staff row 1 most duties per day');
        expect(cap.value).toBe('');
        // THE PLACEHOLDER IS THE DEPARTMENT'S FIGURE, not the engine's shipped one —
        // and it follows the box above as it is typed, or it would be a lie.
        expect(cap.getAttribute('placeholder')).toBe('2');
        expect(screen.getByText(/available on every date of the run/i)).toBeTruthy();

        setDepartmentLimits({ perDay: '3' });
        expect(screen.getByLabelText('Staff row 1 most duties per day').getAttribute('placeholder')).toBe('3');
        expectNoFirestoreTraffic();
    });

    it('states the continuity trade-off on screen, where the surprise would happen', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        toggleTaskMore(1);

        // The one line the brief requires: what it TRADES AWAY, not what it does.
        expect(screen.getByText(/stops being shared out fairly/i)).toBeTruthy();
        expect(screen.getByText(/beats FTE-weighted fairness/i)).toBeTruthy();
        expectNoFirestoreTraffic();
    });

    it('states the availability-window union rule, which is the reading nobody expects', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        toggleStaffMore(1);

        // "Available as usual, plus these" is what the words suggest and is NOT what
        // the engine does. Section 0e(ii) calls this the load-bearing sentence.
        expect(screen.getByText(/not .available as usual, plus these/i)).toBeTruthy();
        expect(screen.getByText(/only those tasks/i)).toBeTruthy();
        expectNoFirestoreTraffic();
    });

    it('says both quota bounds are different KINDS of promise', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        toggleTaskMore(1);

        expect(screen.getByText(/preference, not a guarantee/i)).toBeTruthy();
        expect(screen.getByText(/is hard: a duty that would take/i)).toBeTruthy();
        expectNoFirestoreTraffic();
    });
});

// ─── 1. MONTHLY RECURRENCE, PRESSED AND GENERATED ─────────────────────────────

describe('a monthly clinic, configured from the wizard', () => {
    it('generates on ONE Wednesday instead of four, and the calendar shows it', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setRun({ startDate: '2026-09-07', weeks: 4 });
        setStaffRow(1, { name: 'Ada' });
        setStaffRow(2, { name: 'Ben' });
        setTaskName(1, 'ADHD Clinic');
        onlyDays(1, [3]);
        clickCoLead(1);

        toggleTaskMore(1);
        clickMonthly(1);
        setMonthlyPattern(1, { which: '3', weekday: '3' });

        // The pattern is echoed back in the roster master's own words, and the Days
        // chips are gone — they would be dropped by the mapper, so they are not shown.
        expect(screen.getAllByText('the 3rd Wed of each month').length).toBeGreaterThan(0);
        expect(screen.queryByLabelText('Task row 1: Mon')).toBeNull();

        expect(generateIsDisabled()).toBe(false);
        clickGenerate();

        // 3rd Wednesday of September 2026 is the 16th. Four Wednesdays fall inside
        // the run; exactly one of them is rostered.
        expect(datesWithShifts()).toEqual(['2026-09-16']);
        expect(renderedLeadsFor('ADHD Clinic')).toHaveLength(1);
        expect(screen.getByText(/^days scheduled$/i)).toBeTruthy();
        expectNoFirestoreTraffic();
    });

    it('refuses a half-chosen pattern, names the task, and will not fold the row away', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setStaffRow(1, { name: 'Ada' });
        setTaskName(1, 'ADHD Clinic');

        toggleTaskMore(1);
        clickMonthly(1);
        setMonthlyPattern(1, { which: '3' });

        expect(generateIsDisabled()).toBe(true);
        expectOnScreen(/ADHD Clinic is set to repeat monthly in the 3rd week but no weekday/i);

        // FORCED OPEN: the control the refusal is about is behind this chevron, so the
        // chevron refuses to close it. Pressing it must not hide the box.
        toggleTaskMore(1);
        expect(screen.getByLabelText('Task row 1 monthly weekday')).toBeTruthy();

        // …and choosing the weekday clears it.
        setMonthlyPattern(1, { weekday: '3' });
        expect(generateIsDisabled()).toBe(false);
        expectNoFirestoreTraffic();
    });

    it('stops counting a monthly task towards the department\'s week', () => {
        // A monthly row keeps its weekday chips but the mapper does not emit them, so
        // counting them would gloss a part-timer's FTE over a week no task runs on —
        // and `RosterView` measures the same figure off the GENERATED config, where a
        // monthly task has no `days` at all. The two captions have to agree.
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setStaffRow(1, { name: 'Ada', fte: '0.6' });
        setTaskName(1, 'Clinic');
        onlyDays(1, [1, 2, 3, 4, 5]);
        // The wizard opens with three task rows, and `countWorkingDays` reads ROWS
        // rather than named tasks — pre-existing behaviour, unchanged here — so the
        // other two are emptied to leave row 1 as the only thing defining the week.
        onlyDays(2, []);
        onlyDays(3, []);
        expect(screen.getByText(/works 3 days a week/i)).toBeTruthy();

        toggleTaskMore(1);
        clickMonthly(1);
        setMonthlyPattern(1, { which: '3', weekday: '3' });
        // No weekly task left, so there is no honest "days a week" to state at all.
        expect(screen.queryByText(/days a week/i)).toBeNull();

        clickWeekly(1);
        expect(screen.getByText(/works 3 days a week/i)).toBeTruthy();
        expectNoFirestoreTraffic();
    });

    it('keeps the ticked weekdays when the mode is switched back', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setStaffRow(1, { name: 'Ada' });
        setTaskName(1, 'Clinic');
        onlyDays(1, [2, 4]);

        toggleTaskMore(1);
        clickMonthly(1);
        expect(screen.queryByLabelText('Task row 1: Tue')).toBeNull();
        clickWeekly(1);

        expect(screen.getByLabelText('Task row 1: Tue').getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByLabelText('Task row 1: Thu').getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByLabelText('Task row 1: Mon').getAttribute('aria-pressed')).toBe('false');
        expectNoFirestoreTraffic();
    });
});

// ─── 2. CONTINUITY, PRESSED AND GENERATED ─────────────────────────────────────

describe('continuity of care, configured from the wizard', () => {
    /** The same three-person, two-task department, with continuity on or off. */
    const draft = ({ continuity }) => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setRun({ startDate: '2026-09-07', weeks: 4 });
        setStaffRow(1, { name: 'Ada' });
        setStaffRow(2, { name: 'Ben' });
        setStaffRow(3, { name: 'Cara' });
        setTaskName(1, 'Group Therapy');
        onlyDays(1, [3]);
        clickCoLead(1);
        setTaskName(2, 'Ward Round');
        onlyDays(2, [1, 2, 3, 4, 5]);
        clickCoLead(2);

        if (continuity) {
            toggleTaskMore(1);
            clickContinuity(1);
            // The row says so with the drawer shut, which is the disclosure rule.
            toggleTaskMore(1);
            expect(screen.getByText(/same lead every time/i)).toBeTruthy();
        }
        clickGenerate();
        return renderedLeadsFor('Group Therapy').map((shift) => shift.lead);
    };

    it('gives every occurrence to ONE person, where rotation gives it to three', () => {
        const rotated = draft({ continuity: false });
        expect(rotated).toHaveLength(4);
        expect(new Set(rotated).size).toBeGreaterThan(1);
        expectNoFirestoreTraffic();

        cleanup();
        vi.clearAllMocks();

        const kept = draft({ continuity: true });
        expect(kept).toHaveLength(4);
        expect(new Set(kept).size).toBe(1);
        expectNoFirestoreTraffic();
    });

    it('is not offered while the task is a team of slots, and says why', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setTaskName(1, 'Trio');
        toggleTaskMore(1);
        expect(screen.getByLabelText('Task row 1: same lead every time')).toBeTruthy();

        fireEvent.click(screen.getByLabelText('Task row 1: staffed as a team of slots'));
        // The control is GONE rather than greyed: its value would be dropped by the
        // mapper, and the cell says where the decision went instead.
        expect(screen.queryByLabelText('Task row 1: same lead every time')).toBeNull();
        expect(screen.getByText(/no lead slot to keep with one person/i)).toBeTruthy();
        expectNoFirestoreTraffic();
    });
});

// ─── 3. A QUOTA, PRESSED AND GENERATED ────────────────────────────────────────

describe('a per-person quota, configured from the wizard', () => {
    it('enforces a ceiling, leaves the slot unstaffed, and explains it in plain words', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setRun({ startDate: '2026-09-07', weeks: 4 });
        setStaffRow(1, { name: 'Ada' });
        setStaffRow(2, { name: 'Ben' });
        setTaskName(1, 'Saturday Bench');
        onlyDays(1, [6]);
        clickCoLead(1);

        toggleTaskMore(1);
        setQuota(1, { per: 'month', max: '1' });
        toggleTaskMore(1);
        // The closed row records it, which is the disclosure rule.
        expect(screen.getByText(/at most 1 per calendar month/i)).toBeTruthy();

        clickGenerate();

        // Four Saturdays, two people, one each per month: the fourth cannot be staffed
        // and the engine's own reason names the quota.
        const roster = generateRosterV2({
            startDate: '2026-09-07',
            weeks: 4,
            staff: [
                { name: 'Ada', fte: 1, skills: [], unavailable: [] },
                { name: 'Ben', fte: 1, skills: [], unavailable: [] },
            ],
            tasks: [{ name: 'Saturday Bench', days: [6], leads: 1, coLeads: 0, quota: { per: 'month', max: 1 } }],
            rules: { bands: { nonExempt: [7, 10], junior: [11, 12], senior: [13, 14], principal: [15, 17] } },
        });
        expect(roster.unfilled).toHaveLength(1);
        expect(screen.getByText(/could not be staffed \(1\)/i)).toBeTruthy();
        expect(screen.getByText(roster.unfilled[0].reason)).toBeTruthy();
        expect(gapsInCell(roster.unfilled[0].date).length).toBe(1);

        // THE PLAIN-LANGUAGE FRAMING the brief asks for, above the engine's sentence.
        expect(screen.getByText(/a per-person maximum being enforced/i)).toBeTruthy();
        expectNoFirestoreTraffic();
    });

    it('reports an unmet FLOOR in its own block, as a preference and not a violation', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setRun({ startDate: '2026-09-07', weeks: 2 });
        setStaffRow(1, { name: 'Ada' });
        setStaffRow(2, { name: 'Ben' });
        setStaffRow(3, { name: 'Cara', away: '2026-09-07, 2026-09-08, 2026-09-09, 2026-09-10, 2026-09-11' });
        setTaskName(1, 'Saturday Bench');
        onlyDays(1, [1, 2, 3, 4, 5]);

        toggleTaskMore(1);
        setQuota(1, { per: 'week', min: '2' });

        clickGenerate();

        const expected = generateRosterV2({
            startDate: '2026-09-07',
            weeks: 2,
            staff: [
                { name: 'Ada', fte: 1, skills: [], unavailable: [] },
                { name: 'Ben', fte: 1, skills: [], unavailable: [] },
                { name: 'Cara', fte: 1, skills: [], unavailable: ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'] },
            ],
            tasks: [{ name: 'Saturday Bench', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1, quota: { per: 'week', min: 2 } }],
            rules: { bands: { nonExempt: [7, 10], junior: [11, 12], senior: [13, 14], principal: [15, 17] } },
        });
        const floor = expected.warnings.find((line) => line.startsWith('Quota floor not met:'));
        expect(floor).toBeTruthy();

        // ITS OWN BLOCK, with the framing — a floor is a preference the engine could
        // not fully honour, not a rule it broke, and the panel must not read as the
        // latter.
        expect(screen.getByText(/per-person minimums not met \(1\)/i)).toBeTruthy();
        expect(screen.getByText(/preference, not a promise/i)).toBeTruthy();
        expect(screen.getByText(/nothing below is a rule this roster breaks/i)).toBeTruthy();
        expect(screen.getByText(floor)).toBeTruthy();
        // …and the engine agrees it is not a violation.
        expect(expected.score.hardViolations).toBe(0);
        expectNoFirestoreTraffic();
    });

    it('refuses a number with no period, and a floor above a ceiling, per row', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setStaffRow(1, { name: 'Ada' });
        setTaskName(1, 'Bench');

        toggleTaskMore(1);
        setQuota(1, { min: '2' });
        expect(generateIsDisabled()).toBe(true);
        expectOnScreen(/Bench has a per-person limit of at least 2 but no period/i);

        setQuota(1, { per: 'month', min: '4', max: '2' });
        expect(generateIsDisabled()).toBe(true);
        expectOnScreen(/floor above a ceiling/i);

        setQuota(1, { max: '6' });
        expect(generateIsDisabled()).toBe(false);
        expectNoFirestoreTraffic();
    });

    it('shows the engine\'s impossible-floor arithmetic rather than generating', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setRun({ startDate: '2026-09-07', weeks: 4 });
        setStaffRow(1, { name: 'Ada' });
        setStaffRow(2, { name: 'Ben' });
        setTaskName(1, 'Saturday Bench');
        onlyDays(1, [6]);
        clickCoLead(1);

        toggleTaskMore(1);
        setQuota(1, { per: 'week', min: '3' });

        // The MAPPER is happy — every cell is readable — and the ENGINE's own
        // validator is what blocks, with its arithmetic shown verbatim.
        expect(generateIsDisabled()).toBe(true);
        expectOnScreen(/2 × 3 = 6 duties/);
        expectNoFirestoreTraffic();
    });
});

// ─── 4. A FORBIDDEN PAIR, PRESSED AND GENERATED ───────────────────────────────

describe('never on the same shift, configured from the wizard', () => {
    const draft = ({ pair }) => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setRun({ startDate: '2026-09-07', weeks: 2 });
        setStaffRow(1, { name: 'Ada' });
        setStaffRow(2, { name: 'Ben' });
        setStaffRow(3, { name: 'Cara' });
        setTaskName(1, 'Clinic');
        onlyDays(1, [1, 2, 3, 4, 5]);
        if (pair) addForbiddenPair('Ada', 'Ben');
        clickGenerate();
        return renderedLeadsFor('Clinic');
    };

    it('stops the two of them being paired, and costs no slot', () => {
        const together = (shifts) => shifts.filter(
            ({ lead, coLead }) => [lead, coLead].every((name) => name === 'Ada' || name === 'Ben'),
        );

        const open = draft({ pair: false });
        expect(together(open).length).toBeGreaterThan(0);
        expectNoFirestoreTraffic();

        cleanup();
        vi.clearAllMocks();

        const kept = draft({ pair: true });
        expect(kept.length).toBeGreaterThan(0);
        expect(together(kept)).toEqual([]);
        expect(screen.getByText(/could not be staffed \(0\)/i)).toBeTruthy();
        expectNoFirestoreTraffic();
    });

    it('names somebody who was paired and then removed from the staff table', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setStaffRow(1, { name: 'Ada' });
        setStaffRow(2, { name: 'Ben' });
        setTaskName(1, 'Clinic');
        addForbiddenPair('Ada', 'Ben');
        expect(generateIsDisabled()).toBe(false);

        // Rename the person out from under the pair. The pair is NOT quietly dropped
        // — that would be a rule the roster master set and the app forgot.
        setStaffRow(2, { name: 'Benedict' });
        expect(generateIsDisabled()).toBe(true);
        expectOnScreen(/names Ben, who is not in the staff table/i);
        expectNoFirestoreTraffic();
    });
});

// ─── 5. AN AVAILABILITY WINDOW, PRESSED AND GENERATED ─────────────────────────

describe('availability windows, configured from the wizard', () => {
    it('splits a block rotation between two people, and the calendar shows the split', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        // THREE weeks, not four: the calendar renders ONE month at a time, and a
        // fourth week would put the last Saturday (2026-10-03) in a month this grid
        // is not showing. Reading the split off the screen means keeping the run
        // inside the screen — the alternative would be a test that pages the calendar
        // to assert something the window feature has nothing to do with.
        setRun({ startDate: '2026-09-07', weeks: 3 });
        setStaffRow(1, { name: 'Ada' });
        setStaffRow(2, { name: 'Ben' });
        setTaskName(1, 'Weekend Witnessing');
        onlyDays(1, [6]);
        clickCoLead(1);

        toggleStaffMore(1);
        addWindow(1);
        setWindow(1, 1, { from: '2026-09-07', to: '2026-09-20' });
        toggleStaffMore(1);
        // The closed row records it.
        expect(screen.getByText(/1 availability window/i)).toBeTruthy();

        toggleStaffMore(2);
        addWindow(2);
        setWindow(2, 1, { from: '2026-09-21', to: '2026-10-31' });

        expect(generateIsDisabled()).toBe(false);
        clickGenerate();

        // Ada takes the first two Saturdays (12th, 19th), Ben the third (26th) — a
        // block rotation, which is not what the fairness rotation would have produced
        // (it alternates: Ada, Ben, Ada).
        expect(renderedLeadsFor('Weekend Witnessing').map((shift) => shift.lead))
            .toEqual(['Ada', 'Ada', 'Ben']);
        expect(screen.getByText(/could not be staffed \(0\)/i)).toBeTruthy();
        expectNoFirestoreTraffic();
    });

    it('reports the dates no window covers, in plain language above the reasons', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        // Three weeks, for the same reason as the test above: every gap has to be in
        // the month the grid is showing for "marked in the day it is missing from" to
        // be a claim about this screen.
        setRun({ startDate: '2026-09-07', weeks: 3 });
        setStaffRow(1, { name: 'Ada' });
        setStaffRow(2, { name: 'Ben' });
        setTaskName(1, 'Weekend Witnessing');
        onlyDays(1, [6]);
        clickCoLead(1);

        for (const row of [1, 2]) {
            toggleStaffMore(row);
            addWindow(row);
            setWindow(row, 1, { from: '2026-09-07', to: '2026-09-13' });
            toggleStaffMore(row);
        }

        clickGenerate();

        // Two of the three Saturdays fall outside both windows (the 12th is covered).
        expect(screen.getByText(/could not be staffed \(2\)/i)).toBeTruthy();
        expect(screen.getByText(/2 of these are dates nobody's availability window covers/i)).toBeTruthy();
        expect(screen.getAllByText(/outside their cohort window/i).length).toBeGreaterThan(0);
        // …and the calendar marks each of them in the day it is missing from.
        for (const dateKey of ['2026-09-19', '2026-09-26']) {
            expect(gapsInCell(dateKey).length).toBe(1);
        }
        expect(gapsInCell('2026-09-12')).toEqual([]);
        expectNoFirestoreTraffic();
    });

    it('narrows a window to named tasks, and refuses a task name that does not exist', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setRun({ startDate: '2026-09-07', weeks: 4 });
        setStaffRow(1, { name: 'Ada' });
        setStaffRow(2, { name: 'Ben' });
        setTaskName(1, 'Weekend Witnessing');
        onlyDays(1, [6]);
        clickCoLead(1);
        setTaskName(2, 'Ward Round');
        onlyDays(2, [1]);
        clickCoLead(2);

        toggleStaffMore(2);
        addWindow(2);
        setWindow(2, 1, { from: '2026-09-07', to: '2026-12-31', tasks: 'Wardd Round' });

        expect(generateIsDisabled()).toBe(true);
        /**
         * ⚠️ WORDING CHANGED DELIBERATELY AT v2.6.0, and this assertion changed with
         *    it rather than being loosened. It used to read "an availability window
         *    names …, which is not a task in the table below. …or leave the task list
         *    blank", which became unactionable: a duty limit can now arrive from a
         *    MEMBERSHIP (`onlyTasks`, set in Admin → Team), and in live mode the staff
         *    table is READ-ONLY, so the sentence told the reader to edit a field they
         *    cannot reach. The message now names the duty, lists the duties that do
         *    exist — the exact spelling being the one thing the reader needs, since
         *    the check is case-sensitive — and names both places it could have been set.
         */
        expectOnScreen(/"Wardd Round" is not one of/i);
        expectOnScreen(/The duties are:/i);
        expectOnScreen(/Only these duties/i);

        setWindow(2, 1, { tasks: 'Ward Round' });
        expect(generateIsDisabled()).toBe(false);
        clickGenerate();

        // THE UNION READING, on screen: Ben's only window names the Ward Round, so he
        // is on the Ward Round or on nothing — never on the witnessing.
        expect(renderedLeadsFor('Weekend Witnessing').every((shift) => shift.lead === 'Ada')).toBe(true);
        expect(renderedLeadsFor('Ward Round').some((shift) => shift.lead === 'Ben')).toBe(true);
        expectNoFirestoreTraffic();
    });

    it('refuses an empty window row and a backwards range, and will not fold the row', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setRun({ startDate: '2026-09-07', weeks: 1 });
        setStaffRow(1, { name: 'Ada' });
        setTaskName(1, 'Clinic');

        toggleStaffMore(1);
        addWindow(1);
        expect(generateIsDisabled()).toBe(true);
        expectOnScreen(/window 1 is empty/i);

        // FORCED OPEN: pressing the chevron must not hide the row the refusal is about.
        toggleStaffMore(1);
        expect(screen.getByLabelText('Staff row 1 window 1 from')).toBeTruthy();

        setWindow(1, 1, { from: '2026-12-31', to: '2026-09-01' });
        expectOnScreen(/ends before it starts/i);

        // A WINDOW THAT MISSES THE RUN ENTIRELY IS REFUSED BY THE ENGINE, not
        // silently generated as an empty roster — the wizard's cells are all
        // readable here, so this refusal is `validateRosterV2Config`'s and it names
        // the arithmetic. Measured while writing this test: the run is 2026-09-07 to
        // 2026-09-13 and this window opens in October.
        setWindow(1, 1, { from: '2026-10-01', to: '2026-12-31' });
        expect(generateIsDisabled()).toBe(true);
        expectOnScreen(/cohort window/i);

        setWindow(1, 1, { from: '2026-09-01', to: '2026-12-31' });
        expect(generateIsDisabled()).toBe(false);

        // …and removing it takes the whole thing away.
        fireEvent.click(screen.getByLabelText('Remove staff row 1 window 1'));
        expect(screen.queryByLabelText('Staff row 1 window 1 from')).toBeNull();
        expectNoFirestoreTraffic();
    });
});

// ─── 6. THE CAPS, PRESSED AND GENERATED ───────────────────────────────────────

describe('the daily and consecutive-day caps, configured from the wizard', () => {
    const threeClinicsOneDay = () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setRun({ startDate: '2026-09-07', weeks: 1 });
        setStaffRow(1, { name: 'Ada' });
        setStaffRow(2, { name: 'Ben' });
        for (const row of [1, 2, 3]) {
            setTaskName(row, `Clinic ${row}`);
            onlyDays(row, [1]);
            clickCoLead(row);
        }
    };

    it('a department cap of one duty a day leaves the third clinic unstaffed, and says so', () => {
        threeClinicsOneDay();
        clickGenerate();
        expect(screen.getByText(/could not be staffed \(0\)/i)).toBeTruthy();
        expectNoFirestoreTraffic();

        cleanup();
        vi.clearAllMocks();

        threeClinicsOneDay();
        setDepartmentLimits({ perDay: '1' });
        clickGenerate();
        expect(screen.getByText(/could not be staffed \(1\)/i)).toBeTruthy();
        expect(screen.getAllByText(/at daily limit/i).length).toBeGreaterThan(0);
        expect(gapsInCell('2026-09-07').length).toBe(1);
        expectNoFirestoreTraffic();
    });

    it('one person\'s own cap overrides the department\'s, for them alone', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setRun({ startDate: '2026-09-07', weeks: 1 });
        setStaffRow(1, { name: 'Ada' });
        setStaffRow(2, { name: 'Ben' });
        for (const row of [1, 2, 3]) {
            setTaskName(row, `Clinic ${row}`);
            onlyDays(row, [1]);
            clickCoLead(row);
        }
        toggleStaffMore(1);
        setStaffMaxPerDay(1, '1');
        toggleStaffMore(1);
        expect(screen.getByText(/max 1 a day/i)).toBeTruthy();

        clickGenerate();

        // Ada holds one duty, Ben holds two — the department default is 2 and only
        // Ada's own figure changed.
        const leads = [1, 2, 3].flatMap((n) => renderedLeadsFor(`Clinic ${n}`).map((shift) => shift.lead));
        expect(leads.filter((name) => name === 'Ada')).toHaveLength(1);
        expect(leads.filter((name) => name === 'Ben')).toHaveLength(2);
        expect(screen.getByText(/could not be staffed \(0\)/i)).toBeTruthy();
        expectNoFirestoreTraffic();
    });

    it('a consecutive-day cap moves the rest day, and names the limit that bound', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setRun({ startDate: '2026-09-07', weeks: 1 });
        setStaffRow(1, { name: 'Ada' });
        setTaskName(1, 'Cover');
        onlyDays(1, [0, 1, 2, 3, 4, 5, 6]);
        clickCoLead(1);
        setDepartmentLimits({ inARow: '3' });

        clickGenerate();

        // MEASURED, and a genuine surprise: one day off RESETS the run, so a cap of 3
        // moves the gap from the 7th day to the 4th rather than capping the week at
        // three duties. Six days are still worked.
        expect(datesWithShifts()).toEqual([
            '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-11', '2026-09-12', '2026-09-13',
        ]);
        expect(gapsInCell('2026-09-10').length).toBe(1);
        expect(screen.getAllByText(/at the consecutive-day limit/i).length).toBeGreaterThan(0);
        expectNoFirestoreTraffic();
    });

    it('refuses 0 and a word in either department box, against the right box', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setStaffRow(1, { name: 'Ada' });
        setTaskName(1, 'Clinic');

        setDepartmentLimits({ perDay: '0' });
        expect(generateIsDisabled()).toBe(true);
        expectOnScreen(/Most duties in one day 0 must be a whole number of at least 1/i);

        setDepartmentLimits({ perDay: '', inARow: 'six' });
        expect(generateIsDisabled()).toBe(true);
        expectOnScreen(/Most days in a row "six" is not a number/i);

        setDepartmentLimits({ inARow: '' });
        expect(generateIsDisabled()).toBe(false);
        expectNoFirestoreTraffic();
    });
});

// ─── 7. A CATEGORY, PRESSED AND GENERATED ─────────────────────────────────────

describe('a task category, configured from the wizard', () => {
    it('reaches the generated shift, where it was fixture-only before', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setRun({ startDate: '2026-09-07', weeks: 1 });
        setStaffRow(1, { name: 'Ada' });
        setTaskName(1, 'EFT Clinic');
        onlyDays(1, [1]);
        clickCoLead(1);

        toggleTaskMore(1);
        const box = screen.getByLabelText('Task row 1 category');
        // The engine's own default as a PLACEHOLDER, not prefilled: a stated category
        // changes how the shift is drawn.
        expect(box.value).toBe('');
        expect(box.getAttribute('placeholder')).toBe('CORE');
        setCategory(1, 'VC');
        toggleTaskMore(1);
        expect(screen.getByText(/^VC$/)).toBeTruthy();

        clickGenerate();

        // The engine's own answer for the same configuration, so this asserts the
        // category ARRIVED rather than that a string was echoed.
        const expected = generateRosterV2({
            startDate: '2026-09-07',
            weeks: 1,
            staff: [{ name: 'Ada', fte: 1, skills: [], unavailable: [] }],
            tasks: [{ name: 'EFT Clinic', days: [1], leads: 1, coLeads: 0, category: 'VC' }],
            rules: { bands: { nonExempt: [7, 10], junior: [11, 12], senior: [13, 14], principal: [15, 17] } },
        });
        expect(expected.roster['2026-09-07'][0].category).toBe('VC');
        expect(renderedLeadsFor('EFT Clinic')).toHaveLength(1);
        expectNoFirestoreTraffic();
    });
});

// ─── 8. NOTHING TOUCHED MEANS NOTHING SET ─────────────────────────────────────

describe('the nine controls are inert until they are used', () => {
    it('generates exactly the roster it generated before any of them existed', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setRun({ startDate: '2026-09-07', weeks: 1 });
        setStaffRow(1, { name: 'Ada' });
        setStaffRow(2, { name: 'Ben' });
        setTaskName(1, 'Ward Round');

        // Open BOTH drawers and close them again without typing anything. A drawer
        // that emitted a default merely by being opened would be the whole
        // blank-means-blank rule broken by a chevron.
        toggleTaskMore(1);
        toggleTaskMore(1);
        toggleStaffMore(1);
        toggleStaffMore(1);

        clickGenerate();

        const expected = generateRosterV2({
            startDate: '2026-09-07',
            weeks: 1,
            staff: [
                { name: 'Ada', fte: 1, skills: [], unavailable: [] },
                { name: 'Ben', fte: 1, skills: [], unavailable: [] },
            ],
            tasks: [{ name: 'Ward Round', days: [1, 2, 3, 4, 5], leads: 1, coLeads: 1 }],
            rules: { bands: { nonExempt: [7, 10], junior: [11, 12], senior: [13, 14], principal: [15, 17] } },
        });
        expect(expected.ok).toBe(true);
        expect(expected.warnings).toEqual([]);
        expect(expected.unfilled).toEqual([]);

        // Every shift the engine produced is on screen, byte for byte as its own
        // display string — and no quota block, no window note, no extra warning.
        for (const shifts of Object.values(expected.roster)) {
            for (const shift of shifts) {
                expect(screen.getAllByText(shift.staff).length).toBeGreaterThan(0);
            }
        }
        expect(screen.getByText(/could not be staffed \(0\)/i)).toBeTruthy();
        expect(screen.queryByText(/per-person minimums not met/i)).toBeNull();
        expect(screen.queryByText(/availability window covers/i)).toBeNull();
        expect(screen.queryByText(/warnings \(/i)).toBeNull();
        expectNoFirestoreTraffic();
    });
});

// ─── 9. THE LIMITS DO NOT SURVIVE THE TOGGLE ──────────────────────────────────
//
// Every sandbox value in this wizard is dropped when the universe is switched, and the
// reason is M1 from the original audit: a fictional department left in the wizard is a
// pool that ONE Generate press in live mode would write over four real clinicians. The
// band boundaries, the two hours boxes and both tables have always been cleared here;
// the three new department limits have to be cleared with them, and "have to be" is
// worth an assertion rather than a comment.
//
// FOUND BY MUTATION. Deleting `setDemoRulesInputs(EMPTY_RULES_INPUTS())` from the
// demo-entry branch broke NOTHING in a 1495-test suite. This is the test that was
// missing.

describe('leaving and re-entering the sandbox', () => {
    it('clears the department limits and the pair list, like every other sandbox value', () => {
        const { rerender } = render(<RosterView user={VISITOR} />);
        openConfigure();
        setStaffRow(1, { name: 'Ada' });
        setStaffRow(2, { name: 'Ben' });
        setDepartmentLimits({ perDay: '3', inARow: '4' });
        addForbiddenPair('Ada', 'Ben');
        expect(screen.getByText('Ada and Ben')).toBeTruthy();

        // Out to live mode and back. DELIBERATELY NOT asserting no-Firestore-traffic in
        // this test: live mode opens the roster listener by design, and an assertion
        // that it does not would be pinning the wrong universe.
        ctx.isDemo = false;
        rerender(<RosterView user={VISITOR} />);
        ctx.isDemo = true;
        rerender(<RosterView user={VISITOR} />);

        openConfigure();
        expect(screen.getByLabelText(/most duties in one day/i).value).toBe('');
        expect(screen.getByLabelText(/most days in a row/i).value).toBe('');
        expect(screen.queryByText('Ada and Ben')).toBeNull();
        // …and the pair picker is back to saying there is nobody to pair, because the
        // staff table was cleared with it.
        expect(screen.getByText(/at least two named people/i)).toBeTruthy();
    });
});

// =============================================================================
// SHORT NAMES — THE FOUR LINKS AN AUDIT FOUND UNPINNED
// =============================================================================
/**
 * ⚠️ WHY THIS SECTION EXISTS, IN THE AUDIT'S OWN TERMS. When `shortName` shipped,
 *    `buildICS` was tested with a hand-built map and `memberProfile` was tested as a
 *    value — and FOUR mutations still survived the whole suite:
 *
 *      • `RosterView`'s `shortNames` memo forced to `null`        → 3359 passed
 *      • the calendar chip reverted to rendering `{s.staff}`      → 3359 passed
 *      • the ICS button stopped passing `{ shortNames }`          → 3359 passed
 *      • `downloadICS` dropped its `options` before `buildICS`    → 3359 passed
 *
 *    So nothing in CI proved that a short name somebody TYPES ever reaches a
 *    calendar chip or a `.ics` file. That is the same producer-covered,
 *    consumer-unpinned split this file was created to close, one feature over.
 *
 *    A fifth mutation survived and is covered here too: the SANDBOX branch of the
 *    drawer's help text was the one string with no assertion on it, and turning its
 *    `—` into JSX text — which renders as those six literal characters — passed
 *    the whole suite. That defect had already been shipped once, one branch away.
 */
describe('the weekly-rotation checkbox is a checkbox', () => {
    /**
     * ⚠️ IT RENDERED AS A VERTICAL BAR. A checkbox is a fixed-size mark, but a flex
     *    item defaults to `flex-shrink: 1`, and this control sits in a flex row beside
     *    a paragraph of explanation — so the text squeezed it. Measured in a real
     *    browser: the co-lead checkbox in the task table was 16x16 and this one
     *    8.1x16, which reads as a thin line rather than a box. The owner reported it
     *    as "not shaped like a box".
     *
     *    jsdom does no layout, so the WIDTH cannot be asserted here. What can be
     *    asserted is the class that prevents it, on the control the defect appeared
     *    on — and `shrink-0` is now on the shared component, so no future placement
     *    inside a flex container can reintroduce it.
     */
    it('carries shrink-0, so a flex row cannot squash it', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        const rotate = screen.getByRole('checkbox', { name: /rotate duties weekly/i });
        expect(rotate.className).toMatch(/\bshrink-0\b/);
        // The mark drawn inside it is protected too.
        expect(rotate.querySelector('span').className).toMatch(/\bshrink-0\b/);
    });

    it('is the same control as the co-lead checkbox it is meant to match', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        const rotate = screen.getByRole('checkbox', { name: /rotate duties weekly/i });
        const coLead = screen.getByRole('checkbox', { name: /task row 1: co-lead/i });
        // Same component, so the box classes that decide its shape must agree.
        for (const cls of ['shrink-0', 'rounded', 'border-2']) {
            expect(rotate.querySelector('span').className, `rotate box lost ${cls}`).toMatch(cls);
            expect(coLead.querySelector('span').className, `co-lead box lost ${cls}`).toMatch(cls);
        }
    });
});

describe('a short name a visitor types reaches the calendar and the file', () => {
    /** The acronym cell lives behind the row's own disclosure. */
    const setShortName = (row, value) => {
        fireEvent.change(
            screen.getByLabelText(`Staff row ${row} short name`),
            { target: { value } },
        );
    };

    /**
     * The bytes the ICS button actually hands the browser.
     *
     * `downloadBlob` builds a Blob and passes it to `URL.createObjectURL`, so
     * capturing that argument is the only way to read the file WITHOUT reaching past
     * the button into `buildICS` — which is precisely the reach that let four
     * mutations survive.
     */
    const captureICS = async () => {
        const original = URL.createObjectURL;
        let captured = null;
        URL.createObjectURL = (blob) => { captured = blob; return 'blob:captured'; };
        try {
            fireEvent.click(screen.getByRole('button', { name: /^ICS$/i }));
        } finally {
            URL.createObjectURL = original;
        }
        if (!captured) throw new Error('The ICS button produced no Blob.');
        return captured.text();
    };

    /** Two people, two acronyms, one duty they share, generated. */
    const generateWithAcronyms = () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setRun({ startDate: '2026-09-07', weeks: 1 });
        setStaffRow(1, { name: 'Adaeze Nwosu', grade: 'AH14' });
        setStaffRow(2, { name: 'Benedict Tan', grade: 'AH13' });

        toggleStaffMore(1);
        setShortName(1, 'AN');
        toggleStaffMore(1);
        toggleStaffMore(2);
        setShortName(2, 'BT');
        toggleStaffMore(2);

        setTaskName(1, 'Ward Round');
        onlyDays(1, [1]);
        // NB: `coLead` defaults to TRUE on a task row, so the checkbox is left alone —
        // clicking it would turn the co-lead OFF and the shift would carry one name.

        expect(generateIsDisabled()).toBe(false);
        clickGenerate();
    };

    it('shows the acronym in the calendar chip, not the full name', () => {
        generateWithAcronyms();

        const shifts = renderedLeadsFor('Ward Round');
        expect(shifts.length).toBeGreaterThan(0);
        // Read off the rendered chip, which is what a roster master actually sees.
        for (const shift of shifts) {
            expect([shift.lead, shift.coLead].sort()).toEqual(['AN', 'BT']);
        }
        // And the full name is NOT on the chip — the whole point is the width.
        // Scoped to the chips: the full name is legitimately still on screen in the
        // staff table above, because the wizard is open. A bare `queryByText` here
        // matched that and failed for a reason unrelated to the calendar.
        const chipText = screen.getAllByText('Ward Round')
            .map((label) => label.closest('button'))
            .filter(Boolean)
            .map((button) => button.textContent)
            .join(' | ');
        expect(chipText).not.toMatch(/Adaeze Nwosu/);
        expect(chipText).toMatch(/AN/);
    });

    it('writes the acronym into the .ics SUMMARY and the full name into DESCRIPTION', async () => {
        generateWithAcronyms();
        const ics = await captureICS();

        // ⚠️ Asserted on the FILE the button produced, not on `buildICS` called
        //    directly — the two mutations that survived both lived between them.
        expect(ics).toMatch(/SUMMARY:\[Ward Round\] Lead: (AN|BT)\\, Co: (AN|BT)/);
        expect(ics).not.toMatch(/SUMMARY:.*Adaeze Nwosu/);
        // Nothing is lost: opening the event still answers "who is that?".
        expect(ics).toMatch(/DESCRIPTION:.*Adaeze Nwosu/);
        expect(ics).toMatch(/DESCRIPTION:.*Benedict Tan/);
    });

    it('uses the acronym in the .csv too', async () => {
        generateWithAcronyms();
        const original = URL.createObjectURL;
        let captured = null;
        URL.createObjectURL = (blob) => { captured = blob; return 'blob:captured'; };
        try {
            fireEvent.click(screen.getByRole('button', { name: /^CSV$/i }));
        } finally {
            URL.createObjectURL = original;
        }
        const csv = await captured.text();
        // ⚠️ THIS ASSERTION USED TO BE THE OPPOSITE. The CSV kept full names by a
        //    decision taken on the department's behalf — sound reasoning about
        //    spreadsheets, wrong person deciding. Somebody who types an acronym has
        //    said how they want that colleague written down, everywhere.
        expect(csv).toMatch(/AN/);
        expect(csv).toMatch(/BT/);
        expect(csv).not.toMatch(/Adaeze Nwosu/);
    });

    it('falls back to full names when nobody has an acronym', () => {
        // The companion property: a department that sets none must be byte-for-byte
        // where it was, on screen as well as in the file.
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setRun({ startDate: '2026-09-07', weeks: 1 });
        setStaffRow(1, { name: 'Adaeze Nwosu', grade: 'AH14' });
        setStaffRow(2, { name: 'Benedict Tan', grade: 'AH13' });
        setTaskName(1, 'Ward Round');
        onlyDays(1, [1]);
        clickGenerate();

        for (const shift of renderedLeadsFor('Ward Round')) {
            expect([shift.lead, shift.coLead].sort()).toEqual(['Adaeze Nwosu', 'Benedict Tan']);
        }
    });

    it('an acronym equal to the full name changes nothing', () => {
        // Guards the map builder's own rule: an entry equal to the name is dropped, so
        // it can never be mistaken downstream for "this shift was shortened" — which
        // is what decides whether the stored `staff` string is trusted.
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setRun({ startDate: '2026-09-07', weeks: 1 });
        setStaffRow(1, { name: 'Ada', grade: 'AH14' });
        setStaffRow(2, { name: 'Ben', grade: 'AH13' });
        toggleStaffMore(1);
        setShortName(1, 'Ada');
        toggleStaffMore(1);
        setTaskName(1, 'Ward Round');
        onlyDays(1, [1]);
        clickGenerate();

        for (const shift of renderedLeadsFor('Ward Round')) {
            expect([shift.lead, shift.coLead].sort()).toEqual(['Ada', 'Ben']);
        }
    });

    it('refuses a comma in an acronym, and says why', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setRun({ startDate: '2026-09-07', weeks: 1 });
        setStaffRow(1, { name: 'Ada', grade: 'AH14' });
        setTaskName(1, 'Ward Round');

        toggleStaffMore(1);
        setShortName(1, 'A,B');
        // A calendar reads a comma in a SUMMARY as a field separator, so it is refused
        // at the input rather than escaped downstream.
        expect(generateIsDisabled()).toBe(true);
        expectOnScreen(/no commas or semicolons/i);
    });

    /**
     * ⚠️ THE SANDBOX BRANCH OF THE DRAWER'S HELP TEXT, which was the one string in
     *    this feature with no assertion on it. `—` written into JSX TEXT renders
     *    as those six characters; written inside a JS string literal it renders as an
     *    em dash. Both forms exist in this component, and only one is correct.
     */
    it('renders real punctuation in the drawer, not literal escape sequences', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        setStaffRow(1, { name: 'Ada' });
        toggleStaffMore(1);

        const drawer = screen.getByLabelText('Staff row 1 short name').closest('div.rounded-lg');
        expect(drawer).not.toBeNull();
        expect(drawer.textContent).not.toMatch(/u2014|u2192|u2019|\\u/);
        // The editable branch is the one on screen here, so its copy is what was read.
        expect(drawer.textContent).toMatch(/available on every date of the run/i);
    });
});
