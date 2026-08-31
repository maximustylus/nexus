/**
 * ==============================================================================
 * THE STAFF TABLE'S DRAWER — A CONTROL THAT LIED FOR A WHOLE RELEASE
 * ==============================================================================
 * Runner: Vitest + @testing-library/react (jsdom).  Run: npm test
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 *
 * A roster master who takes two of their department's nine duties opened the staff
 * table's "More" drawer in LIVE mode, pressed "Add availability window", and nothing
 * happened. They reasonably concluded the feature was broken.
 *
 * It was not broken — it was unreachable, and the press was a no-op TWICE OVER:
 *
 *   1. live rows are `liveStaffRows`, a `useMemo` over the team's membership, while
 *      `onStaffChange` is `patchStaffRow`, which calls `setDemoStaffRows`. The table
 *      renders one array and the handler updates a different one; and
 *   2. `patchStaffRow` matches on `row.id`, and a live row's id comes from a member
 *      uid, so the lookup found nothing in the sandbox array anyway.
 *
 * `StaffTable` already TOOK a `readOnly` prop and honoured it for "Add row" and
 * "Remove" — it simply never passed it to `StaffRowDetail`, so everything inside the
 * drawer stayed interactive while being inert.
 *
 * ── WHY THE FIX IS NOT "MAKE THE DRAWER WRITABLE" ────────────────────────────
 *
 * The table's own header comment says it: in live mode the staff ARE the team, and a
 * second editable copy of a person here would let a roster master type a name
 * belonging to nobody and roster them — the display-name keying the multi-team
 * rebuild removed. So these attributes are set on the MEMBERSHIP, in Admin → Team,
 * and the drawer shows them and says where they come from.
 *
 * ⚠️ WHAT THIS FILE IS FOR: a dead control is worse than an absent one, because it
 *    spends somebody's afternoon. These tests fail if the button ever comes back
 *    without the state behind it.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StaffTable } from './RosterDemoWizardTables';
import { createStaffRow } from '../utils/rosterWizard';

// `globals: false` in the vitest config, deliberately, so auto-cleanup is not
// registered and each file unmounts its own renders. Without this every query after
// the first test matches two copies of the table.
//
// And no `toBeInTheDocument`: this repository has no `@testing-library/jest-dom` and
// no `setupFiles`, so `toBeTruthy` / `toBeNull` is the house convention. Adding a
// matcher library to make one file read nicer would put a new dependency in CI.
afterEach(cleanup);

/** One person, plus whatever a test needs to differ. */
const rows = (seed = {}) => [createStaffRow({ name: 'Person One', grade: 'AH13', ...seed })];

const setup = (props = {}) => {
    const onChange = vi.fn();
    const utils = render(
        <StaffTable
            rows={props.rows || rows()}
            errors={props.errors || {}}
            onChange={onChange}
            onAdd={vi.fn()}
            onRemove={vi.fn()}
            readOnly={props.readOnly ?? false}
            workingDays={5}
        />,
    );
    return { ...utils, onChange };
};

/** Open row 1's disclosure, which is where every control under test lives. */
const openDrawer = () => {
    fireEvent.click(screen.getByLabelText('Staff row 1: limits and availability'));
};

const ADD_WINDOW = 'Add availability window to person 1';

// ==============================================================================
// THE SANDBOX — where the controls do work
// ==============================================================================

describe('the sandbox drawer is fully editable', () => {
    it('offers the add-window button, and it reaches onChange', () => {
        const { onChange } = setup({ readOnly: false });
        openDrawer();

        const add = screen.getByRole('button', { name: ADD_WINDOW });
        fireEvent.click(add);

        // The press has to ARRIVE somewhere. This is the assertion whose live-mode
        // counterpart was silently false for a release.
        expect(onChange).toHaveBeenCalledTimes(1);
        const [, patch] = onChange.mock.calls[0];
        expect(patch.windows).toHaveLength(1);
    });

    it('lets the daily cap and the short name be typed', () => {
        const { onChange } = setup({ readOnly: false });
        openDrawer();

        fireEvent.change(screen.getByLabelText('Staff row 1 most duties per day'), { target: { value: '3' } });
        fireEvent.change(screen.getByLabelText('Staff row 1 short name'), { target: { value: 'P1' } });

        expect(onChange).toHaveBeenCalledWith(expect.any(String), { maxPerDay: '3' });
        expect(onChange).toHaveBeenCalledWith(expect.any(String), { shortName: 'P1' });
    });

    it('offers a remove button per window', () => {
        setup({ readOnly: false, rows: rows({ windows: [{ from: '', to: '', tasks: 'Clinic' }] }) });
        openDrawer();
        expect(screen.getByRole('button', { name: 'Remove staff row 1 window 1' })).toBeTruthy();
    });
});

// ==============================================================================
// LIVE MODE — where they did not, and must therefore not be offered
// ==============================================================================

describe('the live drawer offers nothing it cannot do', () => {
    /** ⚠️ THE REGRESSION TEST FOR THE REPORTED DEFECT. */
    it('does NOT render the add-window button', () => {
        setup({ readOnly: true });
        openDrawer();
        expect(screen.queryByRole('button', { name: ADD_WINDOW })).toBeNull();
    });

    it('does NOT render a per-window remove button', () => {
        setup({ readOnly: true, rows: rows({ windows: [{ from: '', to: '', tasks: 'Clinic' }] }) });
        openDrawer();
        expect(screen.queryByRole('button', { name: 'Remove staff row 1 window 1' })).toBeNull();
    });

    it('shows the values but refuses edits, rather than hiding them', () => {
        // Hiding them would be the other wrong answer: a lead looking at somebody
        // limited to two duties needs to SEE that from the roster screen, even though
        // it is changed elsewhere.
        setup({ readOnly: true, rows: rows({ maxPerDay: '2', shortName: 'P1', windows: [{ from: '', to: '', tasks: 'Clinic' }] }) });
        openDrawer();

        for (const [label, value] of [
            ['Staff row 1 most duties per day', '2'],
            ['Staff row 1 short name', 'P1'],
            ['Staff row 1 window 1 tasks', 'Clinic'],
        ]) {
            const field = screen.getByLabelText(label);
            expect(field.value).toBe(value);
            expect(field.readOnly).toBe(true);
        }
    });

    it('a keystroke into a read-only field changes nothing', () => {
        // `readOnly` is an attribute, and an attribute is presentation until
        // something proves the handler cannot fire. A browser enforces it; jsdom does
        // not, so this asserts the outcome rather than the attribute.
        const { onChange } = setup({ readOnly: true });
        openDrawer();
        const field = screen.getByLabelText('Staff row 1 short name');
        fireEvent.change(field, { target: { value: 'ZZ' } });
        // If this ever fails, the drawer has become writable in live mode and the
        // write is going to the sandbox array again.
        expect(onChange).not.toHaveBeenCalled();
    });

    /**
     * ⚠️ AND IT SAYS WHERE, which is the half that makes a disabled control fair.
     *    The table's footnote already does this for grade and profession; a drawer
     *    that simply went grey would read as the same broken feature.
     */
    it('names Admin → Team as the place these are set', () => {
        setup({ readOnly: true });
        openDrawer();
        const drawer = screen.getByLabelText('Staff row 1 short name').closest('div.rounded-lg');
        expect(drawer).not.toBeNull();
        // Asserted on the text rather than by node: BOTH the short-name cell and the
        // windows footnote point at Admin → Team, so a `getByText` here finds two.
        expect(drawer.textContent).toMatch(/Admin\s*→\s*Team/);
        expect(drawer.textContent).toMatch(/Only these duties/i);
        // ⚠️ AND THE ARROW IS A REAL ARROW. Written as `\\u2192` inside JSX text it
        //    renders as those six characters, which is a defect this test caught.
        expect(drawer.textContent).not.toMatch(/u2192|u2014|u2019/);
    });

    it('explains an empty window list as "every duty" rather than "no windows"', () => {
        // The sandbox wording is about DATES, which is not the question a live lead
        // is asking when nobody is limited.
        setup({ readOnly: true });
        openDrawer();
        expect(screen.getByText(/Every duty, every date/i)).toBeTruthy();
        expect(screen.queryByText(/available on every date of the run/i)).toBeNull();
    });

    it('still hides Add row and Remove, as it always did', () => {
        // Pinned so that threading `readOnly` deeper cannot accidentally undo the
        // part that was already right.
        setup({ readOnly: true });
        expect(screen.queryByRole('button', { name: /Add row/i })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Remove staff row 1' })).toBeNull();
    });
});

// ==============================================================================
// THE FORCED-OPEN RULE
// ==============================================================================

describe('a hidden cell that is wrong opens its own drawer', () => {
    /**
     * The short name is behind the disclosure, so an error on it has to force the
     * drawer open — otherwise the refusal names a control the reader cannot see,
     * which is not a refusal, it is a dead end.
     */
    it('opens for a shortName error without anybody clicking', () => {
        const row = rows()[0];
        render(
            <StaffTable
                rows={[row]}
                errors={{ [row.id]: { shortName: 'no commas' } }}
                onChange={vi.fn()}
                onAdd={vi.fn()}
                onRemove={vi.fn()}
                workingDays={5}
            />,
        );
        // No click. The field is reachable because the row could not fold.
        expect(screen.getByLabelText('Staff row 1 short name')).toBeTruthy();
        expect(screen.getByText('no commas')).toBeTruthy();
    });
});
