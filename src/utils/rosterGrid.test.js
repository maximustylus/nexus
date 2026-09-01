/**
 * THE PRINTED CALENDAR PUTS EVERY DUTY IN THE SQUARE THE APP PUTS IT IN.
 *
 * These pin the layout, not the ink. What can actually go wrong when a roster is
 * reshaped into a grid is silent and total: a day landing one column left because
 * the week was assumed to start on Monday, a month quietly dropped because it had
 * no shifts, a person missing from a week they worked. None of that raises an
 * error and all of it is a roster somebody would have pinned to a wall and worked
 * from. So it is tested here, on plain objects, with no renderer involved.
 */

import { describe, it, expect } from 'vitest';
import {
    buildMonthGrid,
    buildYearGrids,
    buildStaffWeekMatrix,
    rosterYears,
    WEEKDAY_HEADINGS,
    GRID_ROWS,
} from './rosterGrid.js';

/** Two weeks of a small department, in the shape `generateRosterV2` writes. */
const ROSTER = {
    '2026-09-07': [
        { task: 'EFT', category: 'Clinical', lead: 'Adaeze Nwosu', coLead: 'Benedict Tan', staff: 'Adaeze Nwosu / Benedict Tan', week: 1, assignees: ['Adaeze Nwosu', 'Benedict Tan'] },
        { task: 'VC', category: 'VC', lead: 'Chidi Okafor', coLead: 'Dalia Haddad', staff: 'Chidi Okafor / Dalia Haddad', week: 1, assignees: ['Chidi Okafor', 'Dalia Haddad'] },
    ],
    '2026-09-08': [
        { task: 'NC', category: 'Clinical', lead: 'Benedict Tan', coLead: 'Adaeze Nwosu', staff: 'Benedict Tan / Adaeze Nwosu', week: 1, assignees: ['Benedict Tan', 'Adaeze Nwosu'] },
    ],
    '2026-09-14': [
        { task: 'EFT', category: 'Clinical', lead: 'Benedict Tan', coLead: 'Adaeze Nwosu', staff: 'Benedict Tan / Adaeze Nwosu', week: 2, assignees: ['Benedict Tan', 'Adaeze Nwosu'] },
    ],
};

const SHORT = { 'Adaeze Nwosu': 'AN', 'Benedict Tan': 'BT', 'Chidi Okafor': 'CO', 'Dalia Haddad': 'DH' };

describe('a month grid is shaped like a wall calendar', () => {
    it('starts the week on Sunday, exactly as the app calendar does', () => {
        // Not decoration: `RosterView` has rendered Sun-first since it was written.
        // A Monday-first export would put every duty one column left of where the
        // roster master saw it.
        expect(WEEKDAY_HEADINGS[0]).toBe('Sun');
        expect(WEEKDAY_HEADINGS).toHaveLength(7);
    });

    it('puts the 1st under the weekday it really falls on', () => {
        // 1 September 2026 is a TUESDAY, so two blanks precede it.
        const grid = buildMonthGrid(ROSTER, { year: 2026, month: 8 });
        expect(grid.weeks[0].map((c) => c.day)).toEqual([null, null, 1, 2, 3, 4, 5]);
        expect(grid.weeks[0][0].inMonth).toBe(false);
        expect(grid.weeks[0][2].inMonth).toBe(true);
    });

    it('is always six rows, even for a month that fits in four', () => {
        // February 2026 opens on a Sunday and has 28 days — a perfect 4x7. A grid
        // that shrank to fit would print at a different square height from every
        // other month in the same document.
        const feb = buildMonthGrid(ROSTER, { year: 2026, month: 1 });
        expect(feb.weeks).toHaveLength(GRID_ROWS);
        expect(feb.weeks[0].map((c) => c.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(feb.weeks[3].map((c) => c.day)).toEqual([22, 23, 24, 25, 26, 27, 28]);
        expect(feb.weeks[4].every((c) => c.day === null)).toBe(true);
        expect(feb.weeks[5].every((c) => c.day === null)).toBe(true);
    });

    it('lands each duty in its own day square, with the app acronyms', () => {
        const grid = buildMonthGrid(ROSTER, { year: 2026, month: 8, shortNames: SHORT });
        const flat = grid.weeks.flat();
        const sep7 = flat.find((c) => c.key === '2026-09-07');
        const sep8 = flat.find((c) => c.key === '2026-09-08');

        expect(sep7.shifts.map((s) => s.task)).toEqual(['EFT', 'VC']);
        // The app chip's own wording, verbatim — NOT a shorter form invented for
        // paper. It is 16 characters wide, which is why the painters give a square
        // two lines (task above, people below) exactly as the chip does, rather
        // than one long line that forces the whole month to shrink.
        expect(sep7.shifts[0].people).toBe('Lead: AN, Co: BT');
        expect(sep8.shifts).toHaveLength(1);
        expect(grid.shiftCount).toBe(4);   // 2 on the 7th, 1 on the 8th, 1 on the 14th
    });

    it('colours a square from the one palette — including a category with no entry', () => {
        const grid = buildMonthGrid(ROSTER, { year: 2026, month: 8 });
        const sep7 = grid.weeks.flat().find((c) => c.key === '2026-09-07');
        // Clinical is the owner's brown.
        expect(sep7.shifts[0].swatch.fg).toBe('#6b4423');
        // VC is not one of the four standard categories, and must still not print
        // grey: it inherits the calendar's long-standing video-clinic orange.
        expect(sep7.shifts[1].swatch.bg).toBe('#fff7ed');
    });

    it('returns a real, writable-on grid for a month holding no roster at all', () => {
        // The owner chose "always Jan-Dec, empty months blank" so untouched months
        // print as blank calendars to fill in by hand. An empty month must
        // therefore still carry its day numbers.
        const march = buildMonthGrid(ROSTER, { year: 2026, month: 2 });
        expect(march.shiftCount).toBe(0);
        expect(march.weeks.flat().filter((c) => c.inMonth)).toHaveLength(31);
        expect(march.label).toBe('March 2026');
    });
});

describe('the year export is a full first year, plus only the months a block spills into', () => {
    it('gives twelve grids for a roster that lives in one year', () => {
        const grids = buildYearGrids(ROSTER);
        expect(grids).toHaveLength(12);
        expect(grids.map((g) => g.label)[0]).toBe('January 2026');
        expect(grids.map((g) => g.label)[11]).toBe('December 2026');
        // Only September holds anything, and the other eleven are still there.
        expect(grids.filter((g) => g.shiftCount > 0).map((g) => g.month)).toEqual([8]);
    });

    it('adds only the spilled months when a block runs over New Year', () => {
        // MEASURED ON THE OWNER'S OWN ROSTER, 2026-09-01: seventeen weeks from
        // 7 September end on 1 January, so "twelve per touched year" produced 24
        // tabs with 19 blank. The owner chose the calendar year plus the spill.
        const crossing = {
            '2026-12-28': [{ task: 'EFT', lead: 'A', week: 1 }],
            '2027-01-04': [{ task: 'EFT', lead: 'B', week: 2 }],
        };
        expect(rosterYears(crossing)).toEqual([2026, 2027]);
        const grids = buildYearGrids(crossing);
        expect(grids).toHaveLength(13);
        expect(grids[11].label).toBe('December 2026');
        expect(grids[12].label).toBe('January 2027');
        // Nothing that holds a duty is dropped, which is the whole constraint.
        expect(grids[12].shiftCount).toBe(1);
    });

    it('adds every spilled month, not merely the first', () => {
        const long = {
            '2026-12-28': [{ task: 'EFT', lead: 'A', week: 1 }],
            '2027-02-01': [{ task: 'EFT', lead: 'B', week: 6 }],
            '2027-03-01': [{ task: 'EFT', lead: 'C', week: 10 }],
        };
        const labels = buildYearGrids(long).map((g) => g.label);
        expect(labels).toHaveLength(15);
        expect(labels.slice(12)).toEqual(['January 2027', 'February 2027', 'March 2027']);
        // January is present although this fixture rosters nothing in it: the spill
        // runs from January to the last month reached, so the calendar has no hole
        // in the middle. April is absent — that is the 19 blank pages this removed.
        expect(labels).not.toContain('April 2027');
    });

    it('exports nothing at all for an empty roster, rather than guessing a year', () => {
        for (const empty of [{}, null, undefined, { '2026-09-07': [] }]) {
            expect(buildYearGrids(empty)).toEqual([]);
        }
    });

    it('ignores keys that are not dates instead of inventing a month for them', () => {
        expect(rosterYears({ notADate: [{ task: 'X', lead: 'A' }] })).toEqual([]);
    });
});

describe('the staff-by-week matrix answers the fairness question a month grid cannot', () => {
    it('gives every roster a row per person and a column per engine week', () => {
        const matrix = buildStaffWeekMatrix(ROSTER, { shortNames: SHORT });
        expect(matrix.weeks).toEqual([1, 2]);
        expect(matrix.rows.map((r) => r.name).sort()).toEqual(
            ['Adaeze Nwosu', 'Benedict Tan', 'Chidi Okafor', 'Dalia Haddad'],
        );
    });

    it('shows the weekly rotation as a lead moving across the row', () => {
        // The whole point of the sheet: EFT is led by Adaeze Nwosu in week 1 and
        // by Benedict Tan in week 2. If rotation ever silently stopped, this is where
        // a roster master would see it.
        const matrix = buildStaffWeekMatrix(ROSTER);
        const alif = matrix.rows.find((r) => r.name === 'Adaeze Nwosu');
        const lynn = matrix.rows.find((r) => r.name === 'Benedict Tan');

        expect(alif.cells[0].filter((d) => d.task === 'EFT' && d.lead)).toHaveLength(1);
        expect(alif.cells[1].filter((d) => d.task === 'EFT' && d.lead)).toHaveLength(0);
        expect(lynn.cells[1].filter((d) => d.task === 'EFT' && d.lead)).toHaveLength(1);
    });

    it('counts leading and seconding separately, and sorts the busiest lead first', () => {
        const matrix = buildStaffWeekMatrix(ROSTER);
        const lynn = matrix.rows.find((r) => r.name === 'Benedict Tan');
        expect(lynn.leadCount).toBe(2);     // NC week 1, EFT week 2
        expect(lynn.totalCount).toBe(3);    // plus seconding EFT in week 1
        expect(matrix.rows[0].name).toBe('Benedict Tan');
    });

    it('carries the configured acronym, so the sheet reads like the app', () => {
        const matrix = buildStaffWeekMatrix(ROSTER, { shortNames: SHORT });
        expect(matrix.rows.find((r) => r.name === 'Adaeze Nwosu').display).toBe('AN');
        // ...and without a map, the full name, unchanged.
        expect(buildStaffWeekMatrix(ROSTER).rows.find((r) => r.name === 'Benedict Tan').display)
            .toBe('Benedict Tan');
    });

    it('does not count one person twice when assignees repeats the named pair', () => {
        // V2 writes `assignees[0] === lead` and `assignees[1] === coLead` on every
        // paired shift. Counting the array naively would double every total in the
        // department and make the fairness column meaningless.
        const matrix = buildStaffWeekMatrix(ROSTER);
        expect(matrix.rows.find((r) => r.name === 'Chidi Okafor').totalCount).toBe(1);
    });

    it('lays out a legacy document with no week numbers, in 7-day blocks', () => {
        const legacy = {
            '2026-09-07': [{ task: 'EFT', lead: 'A' }],
            '2026-09-15': [{ task: 'EFT', lead: 'A' }],
        };
        // Without the fallback both shifts would collapse into one column and the
        // sheet would claim the roster ran for a single week.
        expect(buildStaffWeekMatrix(legacy).weeks).toEqual([1, 2]);
    });

    it('gives no row to somebody who is rostered nowhere', () => {
        // An empty line under a colleague's name is a claim the export cannot make.
        const matrix = buildStaffWeekMatrix(ROSTER, { shortNames: { Nobody: 'NB', ...SHORT } });
        expect(matrix.rows.some((r) => r.name === 'Nobody')).toBe(false);
    });

    it('survives a malformed document without inventing a person', () => {
        const junk = {
            '2026-09-07': [null, { task: 'X' }, { task: 'Y', lead: '   ' }, 'nonsense'],
            notADate: [{ lead: 'Ghost' }],
        };
        expect(buildStaffWeekMatrix(junk).rows).toEqual([]);
    });
});
