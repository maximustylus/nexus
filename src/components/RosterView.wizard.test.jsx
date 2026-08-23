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
 * end of the AH scale is not EXPRESSIBLE, so the tests drive every divider to
 * its extremes by keyboard and by pointer and assert, off the rendered DOM,
 * that the four bands are still contiguous and still cover AH7–AH17. Nobody has
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
    // ⚠️ THE PATH IS CARRIED, and it was not. These returned a bare `{ __mock }`,
    //    so a listener could only be identified by what it was NOT — which is how
    //    `rosterListenerCalls` came to mean "every subscription except the coverage
    //    query" and started counting the settings listener too. Joining the segments
    //    is what lets each subscription be named by the document it actually reads.
    doc: vi.fn((_db, ...segments) => ({ __mock: 'docRef', path: segments.join('/') })),
    collection: vi.fn((_db, ...segments) => ({ __mock: 'collectionRef', path: segments.join('/') })),
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

// ── TEAM SCOPE ────────────────────────────────────────────────────────────────
// Every live Firestore path in RosterView is composed from `teamId` now, and the
// swap listener routes by `targetUid` rather than by display name. Mocked here
// rather than wrapped in a real provider: these tests are about what the roster
// DOES, and `TeamContext.test.jsx` owns how a team is resolved.
const TEAM_ID = 'kkh-sport-exercise-medicine';
const TEAM_MEMBERS = [
    { uid: 'uid-brandon', displayName: 'Brandon' },
    { uid: 'uid-derlinder', displayName: 'Derlinder' },
    { uid: 'uid-fadzlynn', displayName: 'Fadzlynn' },
    { uid: 'uid-ying-xian', displayName: 'Ying Xian' },
];
// WHO HOLDS DUTIES, which is not the same question as `role` — a roster master
// configures the roster and is not in it. All four here are clinicians, matching the
// live staff pool.
//
// ⚠️ HOISTED, NOT COMPUTED INSIDE `useTeam`. RosterView's live effect depends on
//    `rosteredMembers`, so returning a fresh array from every call gives it a new
//    reference on every render — effect runs, setConfig, re-render, forever. The
//    real provider is safe because it builds this inside `useMemo`; a mock that
//    forgets to be stable HANGS the suite rather than failing it, which is a much
//    worse way to find out.
const TEAM_ROSTERED = TEAM_MEMBERS.filter((m) => m.rostered !== false);
const TEAM_UID_BY_NAME = Object.fromEntries(TEAM_MEMBERS.map((m) => [m.displayName, m.uid]));
vi.mock('../context/TeamContext', () => ({
    useTeam: () => ({
        teamId: TEAM_ID,
        members: TEAM_MEMBERS,
        rosteredMembers: TEAM_ROSTERED,
        memberUidByName: TEAM_UID_BY_NAME,
    }),
}));


import { setDoc, addDoc, onSnapshot } from 'firebase/firestore';
import RosterView from './RosterView';
import { BandBoundaryEditor } from './RosterDemoWizardTables';
import { LIVE_ROSTER_DEFAULTS } from '../utils/auraEngine';
import { DEFAULT_GRADE_BANDS } from '../utils/rosterEngineV2';
import { bandsToInputs } from '../utils/rosterWizard';

const BRANDON = { uid: 'uid-brandon', name: 'Brandon', role: 'staff', email: 'brandon@example.org' };

/**
 * The two live textareas, verbatim as of the commit before the sandbox tables
 * existed. Class list included on purpose: "renders exactly as before" is a claim
 * about the rendered markup, and a value-only assertion would pass for a
 * completely restyled control.
 */

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
    onSnapshot.mock.calls.filter(([target]) => typeof target?.path === 'string'
        && target.path.includes('/rosters/'));

/**
 * The department's saved configuration (`R1`) — a second DOCUMENT listener, and
 * the reason the helper above had to be tightened a second time.
 *
 * ⚠️ IT WAS `target?.__mock !== 'query'`, WHICH MEANT "EVERY LISTENER THAT IS NOT
 *    THE COVERAGE QUERY". That was exact while the roster document was the only
 *    other subscription, and this file's note above records it having already been
 *    narrowed once for precisely this reason. A second `doc()` listener made it
 *    wrong again: the claim "one listener on the roster document" started counting
 *    two and failed, which is the RIGHT failure — a count that silently absorbed
 *    the new listener would have quietly stopped being the statement it says it is.
 *
 *    Matching on the path is what makes it stop needing to be re-narrowed.
 */
const settingsListenerCalls = () =>
    onSnapshot.mock.calls.filter(([target]) => typeof target?.path === 'string'
        && target.path.endsWith('/settings/roster'));

/**
 * The lower divider's `aria-label`, spelled out. Used for both the presence
 * checks in demo mode and the absence checks in live mode, so the two cannot drift
 * apart the way a `/boundary/i` regex on one side and a literal on the other would.
 */
// CHANGED BY THE FOUR-BAND SPLIT. These were JUNIOR_SENIOR_DIVIDER and SENIOR_PRINCIPAL_DIVIDER,
// which named two dividers on a three-band scale. There are THREE dividers now,
// so "lower" would name the middle one — hence names that say which bands each
// sits between and cannot go stale the same way.
const NONEXEMPT_JUNIOR_DIVIDER = 'Boundary between the Non-exempt and Junior bands';
const JUNIOR_SENIOR_DIVIDER = 'Boundary between the Junior and Senior bands';
const SENIOR_PRINCIPAL_DIVIDER = 'Boundary between the Senior and Principal bands';

/** Every control the sandbox wizard added, as one absence check. */

beforeEach(() => {
    vi.clearAllMocks();
    ctx.isDemo = false;
});

afterEach(() => {
    cleanup();
});

// ─── LIVE MODE: THE WIZARD IS UNTOUCHED ───────────────────────────────────────

/**
 * ==============================================================================
 * LIVE MODE: THE SAME WIZARD, WITH THE TEAM AS ITS STAFF
 * ==============================================================================
 *
 * ⚠️ THIS BLOCK USED TO BE CALLED "the Configure wizard is exactly what it was",
 *    AND IT WAS RIGHT UNTIL `R3`/`R4`. It pinned two comma-separated textareas —
 *    `roster-staff-pool` and `roster-tasks` — their exact class strings, and a
 *    Generate button gated by `validateRosterConfig`.
 *
 *    That was the honest UI for the engine behind it. Live mode ran
 *    `generateRoster`: a round-robin that rotated a list of NAMES and assigned
 *    `staff[taskIdx % staff.length]` as lead, Monday to Friday. It could not see a
 *    grade, an FTE, a skill, a leave date or a rule, so there was nothing else to
 *    configure. Everything the sandbox demonstrated for months — grade bands, skill
 *    matching, part-time fairness, hours ceilings, the grade floor shipped in
 *    v1.18.0 — was reachable only there.
 *
 *    Both modes now run `generateRosterV2`, so both get the screen that configures
 *    it. These tests assert the new arrangement, and the old ones are deleted
 *    rather than skipped: a test asserting the textareas still exist would now be
 *    asserting a regression.
 *
 * The one difference that remains is real, and is pinned below: in the sandbox the
 * staff are TYPED, because there is no team; in a department they ARE the team, and
 * the table shows them read-only.
 */
describe('live mode: the same wizard, with the team as its staff', () => {
    it('renders the sandbox tables — the two textareas are gone', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        expect(document.getElementById('roster-staff-pool'),
            'the comma-separated staff pool is back').toBeNull();
        expect(document.getElementById('roster-tasks'),
            'the comma-separated task list is back').toBeNull();
        expect(screen.queryByLabelText(/staff pool/i)).toBeNull();
    });

    /**
     * ⚠️ THE PEOPLE COME FROM THE MEMBERSHIP, NOT FROM TYPING. A name typed into a
     *    form matches a person only by spelling; a member row carries their uid.
     *    This is the defect the multi-team migration removed, and the textarea was
     *    the last place it survived.
     */
    it('shows the team as the staff rows, in member order', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        TEAM_ROSTERED.forEach((person) => {
            expect(screen.getAllByDisplayValue(person.displayName).length,
                `${person.displayName} is not in the staff table`).toBeGreaterThan(0);
        });
    });

    /**
     * Somebody leaves the roster by leaving the TEAM — which is a Cloud Function
     * that removes their membership and their `teamIds` together. A delete here
     * would take them out of one week and leave them in the department.
     */
    it('does not offer add or remove on the live staff table', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        expect(screen.queryByRole('button', { name: /remove staff row 1/i })).toBeNull();
        expect(screen.getByText(/these are your team/i)).toBeTruthy();
        // Two places say it — step 1's department panel and the staff table's own
        // note — which is deliberate: whichever one a roster master is looking at
        // when they wonder how to add somebody should answer them.
        expect(screen.getAllByText(/admin → team/i).length).toBeGreaterThan(0);
    });

    /**
     * ⚠️ GATED BY THE ENGINE'S OWN VALIDATOR NOW. It was `validateRosterConfig`,
     *    which judged two textareas for the round-robin generator. A department can
     *    now be refused for the reasons that actually matter, in
     *    `generateRosterV2`'s own wording.
     */
    it('is gated by the configuration, not by a textarea', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        // Clearing every task name is the live equivalent of emptying the old task
        // textarea: there is nothing to roster, and Generate must say so.
        screen.getAllByLabelText(/task row \d+ name/i).forEach((input) => {
            fireEvent.change(input, { target: { value: '' } });
        });

        expect(screen.getByRole('button', { name: /^generate roster$/i }).disabled).toBe(true);
    });

    /**
     * The bridge for a department that already has a roster. Team #1 has been
     * rostering for months with `config.tasks` and has no stored configuration,
     * because that document did not exist until `R1`. Without this it would open
     * Configure to blank rows and a refused Generate, with its own roster on screen
     * behind the modal.
     */
    it('opens on the tasks the department is already running', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        LIVE_ROSTER_DEFAULTS.tasks.forEach((task) => {
            expect(screen.getAllByDisplayValue(task).length,
                `${task} did not carry over from the existing roster`).toBeGreaterThan(0);
        });
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

        /**
         * ⚠️ REWRITTEN BY `R3`. This used to assert the live wizard was "still
         *    exactly the two textareas, with no table and no `<select>`" — the
         *    person view's constraint being that it adds no control to a deliberately
         *    plain panel. The panel is no longer plain: live mode configures
         *    `generateRosterV2` and gets the same tables the sandbox does.
         *
         *    The CONSTRAINT is unchanged and is what is asserted instead: the person
         *    view adds nothing of its own. The sandbox's person picker is a
         *    `<select>` in the wizard footer, and it must not appear here, because a
         *    live user's "my week" is their own week and nobody else's.
         */
        openConfigure();
        expect(screen.queryByLabelText(/whose week/i),
            'the sandbox person picker leaked into live mode').toBeNull();
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
        // written. Each subscription is now counted BY PATH rather than by
        // subtraction, so a fourth one added later fails a specific assertion
        // instead of being absorbed into whichever count was defined as "the rest".
        expect(rosterListenerCalls(), 'the person view added a read of the roster').toHaveLength(1);
        expect(settingsListenerCalls(), 'the saved configuration is read once').toHaveLength(1);
        expect(onSnapshot, 'roster + coverage query + settings').toHaveBeenCalledTimes(3);
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
        // CHANGED BY THE FOUR-BAND SPLIT: three dividers, not two — the count is
        // bands minus one, and it is derived rather than written down.
        expect(screen.getAllByRole('slider')).toHaveLength(3);
        expect(screen.getByLabelText(NONEXEMPT_JUNIOR_DIVIDER)).toBeTruthy();
        expect(screen.getByLabelText(JUNIOR_SENIOR_DIVIDER)).toBeTruthy();
        expect(screen.getByLabelText(SENIOR_PRINCIPAL_DIVIDER)).toBeTruthy();
        expect(screen.getByText('Non-exempt AH7–AH10')).toBeTruthy();
        expect(screen.getByText('Junior AH11–AH12')).toBeTruthy();
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
// The number boxes are gone. What replaced them is one ruler of AH7–AH17 with a
// divider between each adjacent pair of bands — THREE of them since the four-band
// split — and the reason is not cosmetic: independent numbers can be left
// describing a GAP (a grade in no band, and therefore a clinician silently barred
// from every band-gated task), an OVERLAP, or a partition that stops short of an
// end of the scale. Dividers cannot describe any of those, because the bands are
// derived from where the dividers sit.
//
// "Cannot" is a strong claim, so it is not asserted — it is attacked. The tests
// below drive each divider as far as the keyboard and the pointer will take it,
// past its neighbours and past both ends of the scale, and after every attempt
// read the four bands back OFF THE DOM and check they are contiguous and cover
// AH7–AH17.
//
// 🛡️ AND THEY ASK FOR A DIVIDER BY ITS `aria-label`, never by its index. Adding one
// band renumbered every handle: `getAllByRole('slider')[0]` was the junior|senior
// boundary and became the non-exempt|junior one, so thirteen tests in this file
// carried on driving and measuring a DIFFERENT CONTROL from the one they name. They
// failed loudly this time only because the numbers happened to differ; an index
// that lands on a divider whose value matches is a test that has quietly stopped
// testing anything. Hence the three named accessors below.

/** `[7, 12] -> 'AH7–AH12'`, and `[7, 7] -> 'AH7'`. The engine's own en dash. */
const span = (min, max) => (min === max ? `AH${min}` : `AH${min}–AH${max}`);

/**
 * Every divider on the ruler, in DOM order — lowest boundary first.
 *
 * 🛡️ USE THIS FOR "HOW MANY" AND FOR SWEEPS, NEVER TO PICK ONE OUT. The four-band
 * split is exactly how an index goes wrong silently: `dividers()[0]` meant the
 * junior|senior boundary on a three-band scale and means the non-exempt|junior one
 * now, so every test that wanted a PARTICULAR divider asks for it by the bands it
 * sits between, through the three accessors below.
 */
const dividers = () => screen.getAllByRole('slider');

const nonExemptJunior = () => screen.getByLabelText(NONEXEMPT_JUNIOR_DIVIDER);
const juniorSenior = () => screen.getByLabelText(JUNIOR_SENIOR_DIVIDER);
const seniorPrincipal = () => screen.getByLabelText(SENIOR_PRINCIPAL_DIVIDER);

const valueOf = (slider) => Number(slider.getAttribute('aria-valuenow'));

/** The bands as they READ, lowest first — the labels the ruler prints beside itself. */
const BAND_LABELS = ['Non-exempt', 'Junior', 'Senior', 'Principal'];

/**
 * Read the partition back out of the rendered control, and assert it is one.
 *
 * Deliberately reads the DOM rather than any internal state: the claim under test
 * is about what a user can end up looking at. Non-exempt starting at AH7 and
 * principal ending at AH17 is COVERAGE; each band starting exactly one grade above
 * the one below it is CONTIGUITY — no gap, no overlap, in one assertion each.
 *
 * CHANGED BY THE FOUR-BAND SPLIT: this destructured the sliders into a PAIR, so
 * with three of them it was reading the bottom two boundaries and calling the
 * second one "senior|principal". It walks the list now, and derives the band spans
 * from it, so the count of bands is not written down anywhere here.
 */
const expectContiguousPartitionCovering7to17 = () => {
    const values = dividers().map(valueOf);
    expect(values).toHaveLength(BAND_LABELS.length - 1);
    for (const value of values) expect(Number.isInteger(value)).toBe(true);

    // No band may be empty or inverted, and no divider may cross its neighbour.
    expect(values[0]).toBeGreaterThanOrEqual(7);
    for (let index = 1; index < values.length; index += 1) {
        expect(values[index]).toBeGreaterThan(values[index - 1]);
    }
    expect(values[values.length - 1]).toBeLessThanOrEqual(16);

    // The text beside the ruler says the same thing, spelled out.
    const mins = [7, ...values.map((value) => value + 1)];
    const maxes = [...values, 17];
    BAND_LABELS.forEach((label, index) => {
        expect(screen.getByText(`${label} ${span(mins[index], maxes[index])}`)).toBeTruthy();
    });

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
 * pin styling. ANY handle will do: all of them share the one track, so the index
 * here is not picking a particular divider out of the three.
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

        // BY LABEL, NOT BY INDEX. `dividers()[0]` was the junior|senior boundary
        // when there were two of them and is the non-exempt|junior one now, so the
        // whole of this section names the boundary it means.
        const bottom = nonExemptJunior();
        const lower = juniorSenior();
        const upper = seniorPrincipal();

        // Three dividers for four bands, in DOM order, lowest boundary first.
        expect(dividers()).toEqual([bottom, lower, upper]);

        // Shipped cut: non-exempt AH7–10, junior AH11–12, senior AH13–14,
        // principal AH15–17.
        expect(bottom.getAttribute('aria-valuenow')).toBe('10');
        // The bottom band's floor IS the bottom of the scale — which is what makes
        // "the published limits" a different number from "the scale ends" for the
        // two dividers above it.
        expect(bottom.getAttribute('aria-valuemin')).toBe('7');
        // One grade below the junior|senior divider: junior may not be emptied.
        expect(bottom.getAttribute('aria-valuemax')).toBe('11');
        expect(bottom.getAttribute('aria-valuetext')).toBe('Non-exempt AH7–AH10, Junior AH11–AH12');
        expect(bottom.className).toContain('focus:ring-2');

        expect(lower.getAttribute('aria-label')).toBe(JUNIOR_SENIOR_DIVIDER);
        expect(lower.getAttribute('aria-valuenow')).toBe('12');
        // CHANGED BY THE FOUR-BAND SPLIT. This divider could reach AH7 when junior
        // was the bottom band. Non-exempt is the bottom band now, so the floor is
        // one grade above the divider below it — the same rule that gives the
        // ceiling, applied at the other end.
        expect(lower.getAttribute('aria-valuemin')).toBe('11');
        // NOT 17: one grade below the upper divider, because senior may not be
        // squeezed to nothing.
        expect(lower.getAttribute('aria-valuemax')).toBe('13');
        expect(lower.getAttribute('aria-orientation')).toBe('horizontal');
        expect(lower.getAttribute('tabindex')).toBe('0');
        // The announced value is the two spans either side, not a bare number.
        expect(lower.getAttribute('aria-valuetext')).toBe('Junior AH11–AH12, Senior AH13–AH14');
        // A focus ring exists and is visible rather than being outline: none alone.
        expect(lower.className).toContain('focus:ring-2');

        expect(upper.getAttribute('aria-label')).toBe(SENIOR_PRINCIPAL_DIVIDER);
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

        // CHANGED BY THE FOUR-BAND SPLIT. This drove the junior|senior divider from
        // AH12 down to AH8 and read the divider above it. AH8 is inside the
        // non-exempt band now and that divider's floor is AH11, so the divider with
        // several grades of travel in it is the bottom one. The claim is unchanged:
        // move one divider and its neighbour re-publishes its own limits.
        press(nonExemptJunior(), 'ArrowLeft', 3); // non-exempt|junior: 10 -> 7

        expect(nonExemptJunior().getAttribute('aria-valuenow')).toBe('7');
        // The divider above it followed it down: junior may now start at AH8.
        expect(juniorSenior().getAttribute('aria-valuemin')).toBe('8');
        expect(juniorSenior().getAttribute('aria-valuenow')).toBe('12');
        // …and the one above THAT did not move at all — a divider's limits depend on
        // its own neighbours, not on the whole ruler.
        expect(seniorPrincipal().getAttribute('aria-valuemin')).toBe('13');
        expect(seniorPrincipal().getAttribute('aria-valuenow')).toBe('14');
        expectContiguousPartitionCovering7to17();
    });

    it('steps one grade per arrow key, and swallows the key so the wizard stays put', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        expect(press(juniorSenior(), 'ArrowLeft')).toBe(false);
        expect(valueOf(juniorSenior())).toBe(11);
        // CHANGED BY THE FOUR-BAND SPLIT: junior now runs from AH11, so one grade
        // off its ceiling leaves it a single grade wide rather than 'Junior AH7–AH11'.
        expect(screen.getByText('Junior AH11')).toBeTruthy();
        expect(screen.getByText('Senior AH12–AH14')).toBeTruthy();

        expect(press(juniorSenior(), 'ArrowRight')).toBe(false);
        expect(valueOf(juniorSenior())).toBe(12);

        // ArrowUp/ArrowDown are the same step, per the ARIA slider pattern.
        expect(press(juniorSenior(), 'ArrowDown')).toBe(false);
        expect(valueOf(juniorSenior())).toBe(11);
        expect(press(juniorSenior(), 'ArrowUp')).toBe(false);
        expect(valueOf(juniorSenior())).toBe(12);

        // A key the control does not handle is left alone for the browser.
        expect(press(juniorSenior(), 'a')).toBe(true);
        expect(valueOf(juniorSenior())).toBe(12);
        expectContiguousPartitionCovering7to17();
    });

    it('Home and End jump to the published limits, not to AH7 and AH17', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        press(juniorSenior(), 'End');
        // 13, one below the senior|principal divider — NOT 17, which would empty
        // two bands.
        expect(valueOf(juniorSenior())).toBe(13);
        expect(screen.getByText('Senior AH14')).toBeTruthy();
        expectContiguousPartitionCovering7to17();

        press(juniorSenior(), 'Home');
        // CHANGED BY THE FOUR-BAND SPLIT: 11, not 7. This divider could reach the
        // bottom of the scale when junior was the bottom band; non-exempt is now,
        // so Home lands one grade above the divider below it — which is precisely
        // the `aria-valuemin` the slider publishes, and precisely the claim here.
        expect(valueOf(juniorSenior())).toBe(11);
        expect(screen.getByText('Junior AH11')).toBeTruthy();
        expectContiguousPartitionCovering7to17();

        press(seniorPrincipal(), 'End');
        // 16 — NOT 17, which would leave principal with no grades.
        expect(valueOf(seniorPrincipal())).toBe(16);
        expect(screen.getByText('Principal AH17')).toBeTruthy();
        expectContiguousPartitionCovering7to17();

        press(seniorPrincipal(), 'Home');
        // 12, because the junior|senior divider is parked at AH11.
        expect(valueOf(seniorPrincipal())).toBe(12);
        expect(screen.getByText('Senior AH12')).toBeTruthy();
        expectContiguousPartitionCovering7to17();

        // AND THE BOTTOM DIVIDER, whose floor is the end of the scale — kept so the
        // "not to AH7" in the title stays a real distinction rather than a rule that
        // happens to hold for every divider.
        press(nonExemptJunior(), 'Home');
        expect(valueOf(nonExemptJunior())).toBe(7);
        expect(screen.getByText('Non-exempt AH7')).toBeTruthy();
        expectContiguousPartitionCovering7to17();
    });

    it('cannot be driven into a gap or an overlap, however hard it is pushed', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        // CHANGED BY THE FOUR-BAND SPLIT: two hand-written pairs of pushes became a
        // SWEEP over however many dividers the ruler has. Each one is driven far past
        // the bottom of the scale and far past the divider on either side of it —
        // which is what would produce a gap or an overlap — and the partition is read
        // back off the DOM after every attempt. Written as a loop so a fifth band
        // widens the sweep instead of leaving a divider untested.
        for (let index = 0; index < dividers().length; index += 1) {
            press(dividers()[index], 'ArrowLeft', 30);
            expectContiguousPartitionCovering7to17();
            press(dividers()[index], 'ArrowRight', 30);
            expectContiguousPartitionCovering7to17();
        }

        // Everything crushed to the left: every band below principal keeps exactly
        // one grade, and principal takes the rest.
        for (let index = 0; index < dividers().length; index += 1) press(dividers()[index], 'Home');
        expect(dividers().map(valueOf)).toEqual([7, 8, 9]);
        expect(screen.getByText('Non-exempt AH7')).toBeTruthy();
        expect(screen.getByText('Junior AH8')).toBeTruthy();
        expect(screen.getByText('Senior AH9')).toBeTruthy();
        expect(screen.getByText('Principal AH10–AH17')).toBeTruthy();
        expectContiguousPartitionCovering7to17();

        // …and crushed to the right, highest divider first so each one has somewhere
        // to go — which is itself the no-overlap rule, seen from the other end.
        for (let index = dividers().length - 1; index >= 0; index -= 1) press(dividers()[index], 'End');
        expect(dividers().map(valueOf)).toEqual([14, 15, 16]);
        expect(screen.getByText('Non-exempt AH7–AH14')).toBeTruthy();
        expect(screen.getByText('Junior AH15')).toBeTruthy();
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
        // CHANGED BY THE FOUR-BAND SPLIT: driven on the non-exempt|junior divider
        // rather than the junior|senior one. The geometry under test is the same for
        // every handle, and after the split the junior|senior divider has a single
        // grade of travel — not enough room to distinguish "snaps to the nearest
        // line" from "snaps anywhere at all". The bottom divider has five.
        const handle = nonExemptJunior();

        // A press GRABS the handle and does not move it. The x used here is 11px past
        // the line — still inside the 24px-wide handle, but far enough that it would
        // snap to the NEXT line (AH11) if pointerdown committed. It must not.
        fireEvent.pointerDown(handle, { pointerId: 1, clientX: xOfLineAfter(10) + 11 });
        expect(valueOf(nonExemptJunior())).toBe(10);

        // Drag to the line just after AH8.
        fireEvent.pointerMove(handle, { pointerId: 1, clientX: xOfLineAfter(8) });
        expect(valueOf(nonExemptJunior())).toBe(8);
        expect(screen.getByText('Non-exempt AH7–AH8')).toBeTruthy();
        expect(screen.getByText('Junior AH9–AH12')).toBeTruthy();
        expectContiguousPartitionCovering7to17();

        // NEAREST line, not the cell the pointer is inside — which is a claim about
        // rounding, so it is tested on both sides of a cell's midpoint. Below the
        // midpoint of AH10's cell it stays on the AH9 line…
        fireEvent.pointerMove(handle, { pointerId: 1, clientX: xOfLineAfter(9) + 6 });
        expect(valueOf(nonExemptJunior())).toBe(9);
        // …and past the midpoint it moves on to the next line rather than lagging a
        // whole grade behind the pointer (a `floor` here would answer AH8).
        fireEvent.pointerMove(handle, { pointerId: 1, clientX: xOfLineAfter(8) + 11 });
        expect(valueOf(nonExemptJunior())).toBe(9);
        fireEvent.pointerMove(handle, { pointerId: 1, clientX: xOfLineAfter(9) + 11 });
        expect(valueOf(nonExemptJunior())).toBe(10);
        expectContiguousPartitionCovering7to17();

        // Dragged way past the right-hand end, it stops one grade below the divider
        // above it instead of overlapping it.
        fireEvent.pointerMove(handle, { pointerId: 1, clientX: RULER_LEFT + RULER_WIDTH * 3 });
        expect(valueOf(nonExemptJunior())).toBe(11);
        expectContiguousPartitionCovering7to17();

        // Released, the handle stops tracking the pointer.
        fireEvent.pointerUp(handle, { pointerId: 1 });
        fireEvent.pointerMove(handle, { pointerId: 1, clientX: RULER_LEFT });
        expect(valueOf(nonExemptJunior())).toBe(11);
    });

    it('moves the grade range on a task\'s band chips as the divider moves', () => {
        render(<RosterView user={BRANDON} />);
        openConfigure();

        fireEvent.change(screen.getByLabelText('Task row 1 name'), { target: { value: 'Governance' } });
        fireEvent.click(screen.getByLabelText('Task row 1: Senior may lead'));
        fireEvent.click(screen.getByLabelText('Task row 1: Principal may lead'));

        // The chips' caption is the merged span of the two ticked bands.
        expect(screen.getByText('AH13–AH17')).toBeTruthy();

        // CHANGED BY THE FOUR-BAND SPLIT: this drove the junior|senior divider two
        // grades down to AH10 and expected senior to start at AH11. AH10 is the
        // non-exempt|junior boundary now, so AH11 is as far down as this divider
        // goes — one grade of travel, which is all the claim needs.
        press(juniorSenior(), 'ArrowLeft'); // junior|senior: 12 -> 11
        expect(screen.queryByText('AH13–AH17')).toBeNull();
        expect(screen.getByText('AH12–AH17')).toBeTruthy();
        // …and the ruler's own readout agrees with the chip, from the same helper.
        expect(screen.getByText('Junior AH11')).toBeTruthy();
        expect(screen.getByText('Senior AH12–AH14')).toBeTruthy();
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
        // qualifies and the engine's objection disappears. (By label, not by index —
        // `dividers()[0]` is the non-exempt|junior boundary since the four-band
        // split, and moving that one would leave senior exactly where it was.)
        press(juniorSenior(), 'ArrowLeft');
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
    // CHANGED BY THE FOUR-BAND SPLIT: a three-band object is no longer a partition
    // of this scale at all, so it would have been REFUSED for the wrong reason —
    // "non-exempt is missing" rather than "AH12 is in no band". Non-exempt is
    // supplied and AH12 is still the orphan, which keeps the gap this fixture is
    // named for the only thing wrong with it.
    const GAPPED = {
        nonExempt: { min: '7', max: '10' },
        junior: { min: '11', max: '11' },
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

        press(juniorSenior(), 'ArrowLeft');
        // Both sides of the divider, together. Emitting only one of them is exactly
        // how a gap (or an overlap) would get into the state.
        expect(onChange.mock.calls).toEqual([
            ['junior', 'max', '11'],
            ['senior', 'min', '12'],
        ]);

        onChange.mockClear();
        press(seniorPrincipal(), 'ArrowRight');
        expect(onChange.mock.calls).toEqual([
            ['senior', 'max', '15'],
            ['principal', 'min', '16'],
        ]);

        // ADDED WITH THE FOUR-BAND SPLIT: the new divider is two patches like the
        // rest, and it patches the two bands it actually sits between — which is the
        // thing a positional implementation would get wrong.
        onChange.mockClear();
        press(nonExemptJunior(), 'ArrowLeft');
        expect(onChange.mock.calls).toEqual([
            ['nonExempt', 'max', '9'],
            ['junior', 'min', '10'],
        ]);
    });

    it('is a silent no-op at a limit rather than firing a clamped write', () => {
        const onChange = vi.fn();
        render(
            <BandBoundaryEditor
                // CHANGED BY THE FOUR-BAND SPLIT: `junior: [7, 7]` was the band
                // parked on the bottom of the scale. Non-exempt is that band now, so
                // it is the one squeezed to a single grade — otherwise the input is
                // not a partition and the test measures the honesty flag rather than
                // the no-op it is named for.
                inputs={bandsToInputs({
                    nonExempt: [7, 7], junior: [8, 8], senior: [9, 14], principal: [15, 17],
                })}
                onChange={onChange}
                reason={null}
            />,
        );

        expect(nonExemptJunior().getAttribute('aria-valuenow')).toBe('7');
        press(nonExemptJunior(), 'ArrowLeft');
        press(nonExemptJunior(), 'Home');
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
        expect(nonExemptJunior().getAttribute('aria-valuenow')).toBe('10');
        expect(juniorSenior().getAttribute('aria-valuenow')).toBe('11');
        expect(seniorPrincipal().getAttribute('aria-valuenow')).toBe('14');
        expect(screen.getByText('Senior AH12–AH14')).toBeTruthy();
        // Nothing was rewritten behind the user's back.
        expect(onChange).not.toHaveBeenCalled();

        // The first deliberate move ADOPTS the whole partition — senior's floor is
        // patched too, even though the divider that moved was two boundaries below it.
        // THREE patches now rather than two, which is the same property stated on a
        // four-band scale: every bound whose string disagrees with what the ruler has
        // been showing travels with the move.
        press(nonExemptJunior(), 'ArrowLeft');
        expect(onChange.mock.calls).toEqual([
            ['nonExempt', 'max', '9'],
            ['junior', 'min', '10'],
            ['senior', 'min', '12'],
        ]);
    });

    it('still draws a legal ruler from boundaries that are nowhere near legal', () => {
        // Every bound here is a number, and not one of them describes a band this
        // scale has room for: non-exempt claims the whole scale, and the three bands
        // above it start off the end of it. The dividers still have to land somewhere
        // legal — an `aria-valuenow` of 17 or 18 would be a slider outside its own
        // range, and the region either side of it would have no grades in it.
        render(
            <BandBoundaryEditor
                inputs={{
                    nonExempt: { min: '7', max: '17' },
                    junior: { min: '18', max: '18' },
                    senior: { min: '19', max: '19' },
                    principal: { min: '20', max: '21' },
                }}
                onChange={vi.fn()}
                reason={null}
            />,
        );

        expect(screen.getByText(/not one unbroken cut of the scale/i)).toBeTruthy();
        // Pushed as high as they can go while leaving one grade for each band above —
        // three bands above the bottom divider now, so it stops at AH14 rather than
        // the AH15 a three-band scale left it.
        expect(nonExemptJunior().getAttribute('aria-valuenow')).toBe('14');
        expect(juniorSenior().getAttribute('aria-valuenow')).toBe('15');
        expect(seniorPrincipal().getAttribute('aria-valuenow')).toBe('16');
        expect(nonExemptJunior().getAttribute('aria-valuemax')).toBe('14');
        expect(juniorSenior().getAttribute('aria-valuemax')).toBe('15');
        expect(seniorPrincipal().getAttribute('aria-valuemax')).toBe('16');
        expect(screen.getByText('Non-exempt AH7–AH14')).toBeTruthy();
        expect(screen.getByText('Junior AH15')).toBeTruthy();
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
        const handle = juniorSenior();
        fireEvent.pointerDown(handle, { pointerId: 1, clientX: 40 });
        fireEvent.pointerMove(handle, { pointerId: 1, clientX: 400 });
        expect(onChange).not.toHaveBeenCalled();
        expect(handle.getAttribute('aria-valuenow')).toBe('12');
    });
});
