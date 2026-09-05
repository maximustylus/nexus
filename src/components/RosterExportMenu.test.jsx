/**
 * THE EXPORT MENU: ONE TRIGGER, FOUR FORMATS, AND NO WAY TO GET STUCK IN IT.
 *
 * The four coloured export buttons became this menu because on a 375px phone they
 * wrapped the roster toolbar onto three rows of two different heights. A menu is
 * strictly more machinery than four buttons, and the machinery is where the new
 * failures live: a popover that cannot be dismissed, an item that fires the wrong
 * export, a trigger that stays "Building…" forever. Those are what this pins.
 *
 * The FILES are not tested here — each format is built by a pure function with its
 * own suite, and `RosterView.reach.test.jsx` proves the menu reaches them with the
 * roster and the acronym map. This file is only the control.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FileText, Table2 } from 'lucide-react';
import RosterExportMenu from './RosterExportMenu';

afterEach(cleanup);

const formatsWith = (overrides = {}) => ([
    {
        id: 'pdf',
        label: 'Printable calendar',
        ext: 'PDF',
        hint: 'One page per month.',
        icon: FileText,
        onSelect: vi.fn(),
        ...overrides,
    },
    {
        id: 'xlsx',
        label: 'Calendar workbook',
        ext: 'Excel',
        hint: 'A tab per month.',
        icon: Table2,
        onSelect: vi.fn(),
    },
]);

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /^Export$/i }));

describe('the toolbar carries one control, not one per file extension', () => {
    it('shows a single trigger and no menu until it is pressed', () => {
        render(<RosterExportMenu formats={formatsWith()} />);

        const trigger = screen.getByRole('button', { name: /^Export$/i });
        expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        // The whole point of the change: the formats are not four toolbar buttons.
        expect(screen.queryByRole('menu')).toBeNull();
        expect(screen.queryByText('Printable calendar')).toBeNull();
    });

    it('opens on the trigger, and says so to a screen reader', () => {
        render(<RosterExportMenu formats={formatsWith()} />);
        openMenu();

        expect(screen.getByRole('button', { name: /^Export$/i }).getAttribute('aria-expanded')).toBe('true');
        expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    });

    it('leads with what the file is FOR, and keeps the extension as a tag', () => {
        // "CSV" does not answer "how do I put this on the noticeboard". The label,
        // the extension and the one-line hint are all on screen, in that order.
        render(<RosterExportMenu formats={formatsWith()} />);
        openMenu();

        const item = screen.getAllByRole('menuitem')[0];
        expect(item.textContent).toContain('Printable calendar');
        expect(item.textContent).toContain('PDF');
        expect(item.textContent).toContain('One page per month.');
        expect(item.textContent.indexOf('Printable calendar'))
            .toBeLessThan(item.textContent.indexOf('One page per month.'));
    });
});

describe('choosing a format', () => {
    it('calls that format and no other, then closes', () => {
        const formats = formatsWith();
        render(<RosterExportMenu formats={formats} />);
        openMenu();

        fireEvent.click(screen.getByRole('menuitem', { name: /Calendar workbook/i }));

        expect(formats[1].onSelect).toHaveBeenCalledTimes(1);
        expect(formats[0].onSelect).not.toHaveBeenCalled();
        // A menu that stayed open over the calendar after choosing would hide the
        // thing the roster master just exported.
        expect(screen.queryByRole('menu')).toBeNull();
    });
});

describe('there is always a way out', () => {
    it('closes on Escape and puts focus back on the trigger', () => {
        render(<RosterExportMenu formats={formatsWith()} />);
        openMenu();

        fireEvent.keyDown(document, { key: 'Escape' });

        expect(screen.queryByRole('menu')).toBeNull();
        // Focus must not be left on a button that no longer exists.
        expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Export$/i }));
    });

    it('closes when the pointer goes down anywhere outside it', () => {
        // On a phone there is no Escape key, so this is the only dismissal a thumb
        // has. Without it the menu is a trap over the calendar.
        render(<RosterExportMenu formats={formatsWith()} />);
        openMenu();

        fireEvent.pointerDown(document.body);
        expect(screen.queryByRole('menu')).toBeNull();
    });

    it('stays open when the pointer goes down inside it', () => {
        render(<RosterExportMenu formats={formatsWith()} />);
        openMenu();

        fireEvent.pointerDown(screen.getAllByRole('menuitem')[0]);
        expect(screen.getByRole('menu')).toBeTruthy();
    });

    it('closes on a second press of the trigger', () => {
        render(<RosterExportMenu formats={formatsWith()} />);
        openMenu();
        openMenu();
        expect(screen.queryByRole('menu')).toBeNull();
    });
});

describe('a format that takes a moment says so', () => {
    it('relabels the trigger and disables that one item while it builds', () => {
        // The PDF fetches jsPDF on first use. A control that looks unchanged while
        // that happens is a control a roster master presses again — the exact
        // defect this surface has already shipped once.
        render(<RosterExportMenu formats={formatsWith({ busy: true })} />);

        expect(screen.getByRole('button', { name: /Building…/i })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /^Export$/i })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /Building…/i }));
        const items = screen.getAllByRole('menuitem');
        expect(items[0].disabled).toBe(true);
        // ...and only that one: the other formats are instant and stay usable.
        expect(items[1].disabled).toBe(false);
    });

    it('reads "Export" again once nothing is building', () => {
        const { rerender } = render(<RosterExportMenu formats={formatsWith({ busy: true })} />);
        rerender(<RosterExportMenu formats={formatsWith({ busy: false })} />);
        expect(screen.getByRole('button', { name: /^Export$/i })).toBeTruthy();
    });
});

describe('it survives being handed nothing', () => {
    it('renders a trigger with an empty menu rather than throwing', () => {
        render(<RosterExportMenu />);
        openMenu();
        expect(screen.getByRole('menu')).toBeTruthy();
        expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
    });
});
