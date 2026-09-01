// src/utils/rosterGrid.js
//
// THE ROSTER, RESHAPED INTO THINGS THAT LOOK LIKE CALENDARS. NO INK.
//
// `buildICS` and `buildCSV` produce one row per shift, which is what a machine
// wants and what nobody can read on a wall. A roster master asked for the other
// two shapes: a month grid with the duties in the day squares, and a staff-by-week
// matrix. Both are wanted as a PDF *and* as an .xlsx, which is four exports built
// from two layouts.
//
// SO THE LAYOUT LIVES HERE AND IT IS PURE. Every function below takes the roster
// document and returns plain arrays and objects — no jsPDF, no zip, no DOM, no
// measurement in millimetres. That split is the same one section 2 of
// `auraEngine.js` makes for `buildICS`/`downloadICS`, and for the same stated
// reason: the previous exporters were untestable in practice and shipped three
// RFC violations because of it. What can go wrong here — a day landing in the
// wrong square, a person missing from a week, a month silently dropped — is
// exactly what a unit test can pin, and none of it needs a renderer.
//
// The painters (`rosterPdf.js`, `rosterXlsx.js`) turn these descriptors into
// rectangles and cells. They own geometry; they own no roster logic.

import { parseLocalStartDate, toDateKey, displayNameFor, shiftStaffDisplay } from './auraEngine.js';
import { printSwatchFor } from './rosterCategories.js';

/** Full month names, index 0 = January. The tab and page titles are built from these. */
export const MONTH_NAMES = Object.freeze([
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]);

/** Three-letter forms, for .xlsx sheet tabs where 31 characters is the hard limit. */
export const MONTH_ABBR = Object.freeze(
    MONTH_NAMES.map((name) => name.slice(0, 3)),
);

/**
 * Sunday-first, BYTE-IDENTICAL to `WEEKDAY_HEADINGS` in `RosterView.jsx`.
 *
 * The on-screen calendar has started its week on Sunday since it was written. A
 * printed calendar that started on Monday would put every duty in a different
 * column from the app it was exported out of — the same class of mismatch the
 * palette module exists to prevent. Note this is NOT the engine's week, which
 * runs Monday–Sunday (`snapToMonday`); the engine's week is a fairness period and
 * this is a page layout. They are allowed to differ, and the staff-by-week matrix
 * below uses the engine's, because that is the one a roster master counts in.
 */
export const WEEKDAY_HEADINGS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

/**
 * `1, 'duty', 'duties'` -> `'1 duty'`. Used by both exporters.
 *
 * Trivial, and here rather than in each painter because "0 lead · 1 duties" went
 * out in a printed roster once already: two copies of a count are two chances to
 * forget the plural, and the sheet a supervisor reads should not look careless.
 */
export const countLabel = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Every month grid is 6 rows, always. See `buildMonthGrid`. */
export const GRID_ROWS = 6;

/** A roster document -> its date keys, sorted, ignoring anything malformed. */
const shiftDates = (rosterData) => {
    const source = rosterData && typeof rosterData === 'object' ? rosterData : {};
    return Object.keys(source)
        .filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key))
        .sort();
};

/** The shifts on one day, always an array, never holding a non-object. */
const shiftsOn = (rosterData, dateKey) => {
    const list = rosterData?.[dateKey];
    if (!Array.isArray(list)) return [];
    return list.filter((shift) => shift && typeof shift === 'object');
};

/**
 * Every calendar year the roster puts a shift in, ascending.
 *
 * Usually one. A 17-week roster started in November spans two, and both get their
 * full twelve months — see `buildYearGrids`.
 */
export const rosterYears = (rosterData) => {
    const years = new Set();
    shiftDates(rosterData).forEach((key) => {
        if (shiftsOn(rosterData, key).length > 0) years.add(Number(key.slice(0, 4)));
    });
    return [...years].sort((a, b) => a - b);
};

/**
 * One shift, reduced to what a square needs: what it is, who is on it, what colour.
 *
 * `people` comes from `shiftStaffDisplay`, the SAME function the calendar chip
 * calls, so the acronyms a roster master configured appear on paper exactly as
 * they appear on screen — including the "MA/LT" pairing form. Falling back to the
 * stored `staff` string when nothing is shortened is that function's behaviour,
 * inherited deliberately rather than reimplemented.
 */
const describeShift = (shift, shortNames) => ({
    task: typeof shift.task === 'string' ? shift.task : '',
    category: typeof shift.category === 'string' ? shift.category : '',
    people: shiftStaffDisplay(shift, shortNames) || '',
    swatch: printSwatchFor(shift.category),
    week: Number.isInteger(shift.week) && shift.week > 0 ? shift.week : null,
});

/**
 * One month as a Sunday-first grid of six rows by seven days.
 *
 * ALWAYS SIX ROWS, even when five would hold the month. A February that needs
 * four and a March that needs six would otherwise print at two different square
 * heights, and a twelve-page calendar whose geometry changes page to page reads
 * as a mistake. Six is the maximum any month can need, so six is every month.
 * Squares before the 1st and after the last are `inMonth: false` and carry no day
 * number — the painters grey them.
 *
 * A MONTH WITH NO ROSTER STILL COMES BACK FULLY FORMED, with real day numbers and
 * empty shift lists (`shiftCount === 0`). That is the whole point of the owner's
 * choice to always export January to December: the untouched months are blank
 * printable calendars to write on, not an error and not an omission.
 */
export const buildMonthGrid = (rosterData, options = {}) => {
    const year = Number(options.year);
    const month = Number(options.month);              // 0-11
    const shortNames = options.shortNames && typeof options.shortNames === 'object'
        ? options.shortNames
        : null;

    const first = new Date(year, month, 1);
    const leadingBlanks = first.getDay();             // Sunday = 0, so this is the offset
    const weeks = [];
    let shiftCount = 0;

    for (let row = 0; row < GRID_ROWS; row += 1) {
        const week = [];
        for (let col = 0; col < 7; col += 1) {
            const dayNumber = row * 7 + col - leadingBlanks + 1;
            const cursor = new Date(year, month, dayNumber);
            const inMonth = cursor.getMonth() === month && cursor.getFullYear() === year;

            if (!inMonth) {
                week.push({ key: null, day: null, inMonth: false, shifts: [] });
                continue;
            }

            const key = toDateKey(cursor);
            const shifts = shiftsOn(rosterData, key).map((shift) => describeShift(shift, shortNames));
            shiftCount += shifts.length;
            week.push({ key, day: cursor.getDate(), inMonth: true, shifts });
        }
        weeks.push(week);
    }

    return {
        year,
        month,
        label: `${MONTH_NAMES[month]} ${year}`,
        tab: `${MONTH_ABBR[month]} ${year}`,
        weeks,
        shiftCount,
    };
};

/**
 * A FULL CALENDAR YEAR, PLUS WHATEVER THE BLOCK SPILLS INTO. In order.
 *
 * The owner's stated requirement, 2026-09-01: *"a full january to december
 * calendar … 12 tabs jan to dec"*, with the months outside the roster left blank
 * so they can be printed and filled in by hand. So the roster's own length does
 * NOT decide the export's length — the first year is always twelve months,
 * whether or not the roster reaches them.
 *
 * THE SECOND YEAR IS NOT. A seventeen-week block starting in September ends on
 * 1 January, so it touches 2027 — and twelve months per touched year would have
 * produced twenty-four tabs, NINETEEN of them blank, for a roster with duties in
 * five months. Measured on the owner's own configuration and put to them on
 * 2026-09-01; they chose the calendar year plus the spill-over. So a later year
 * contributes only the months that actually hold a duty: thirteen tabs, and
 * nothing that holds a duty is dropped.
 *
 * An EMPTY roster gives nothing at all, because there is no year to be the year:
 * twelve blank grids of an arbitrarily guessed year is a document that looks like
 * a roster and is not one.
 */
export const buildYearGrids = (rosterData, options = {}) => {
    const years = rosterYears(rosterData);
    if (years.length === 0) return [];

    const grids = [];
    const [firstYear] = years;
    for (let month = 0; month < 12; month += 1) {
        grids.push(buildMonthGrid(rosterData, { ...options, year: firstYear, month }));
    }

    // How far into each later year the block reaches. JANUARY THROUGH THAT MONTH,
    // not merely the months holding a duty: a roster with a quiet January between
    // a busy December and a busy February would otherwise export December, then
    // February, and a calendar with a month missing from the middle reads as a
    // broken file rather than a quiet month.
    const lastMonthByYear = new Map();
    shiftDates(rosterData).forEach((key) => {
        if (shiftsOn(rosterData, key).length === 0) return;
        const year = Number(key.slice(0, 4));
        if (year <= firstYear) return;
        const month = Number(key.slice(5, 7)) - 1;
        lastMonthByYear.set(year, Math.max(lastMonthByYear.get(year) ?? 0, month));
    });

    [...lastMonthByYear.keys()].sort((a, b) => a - b).forEach((year) => {
        for (let month = 0; month <= lastMonthByYear.get(year); month += 1) {
            grids.push(buildMonthGrid(rosterData, { ...options, year, month }));
        }
    });

    return grids;
};

/**
 * ROWS ARE PEOPLE, COLUMNS ARE THE ENGINE'S WEEKS, CELLS ARE THE DUTIES THEY HELD.
 *
 * The sheet a supervisor actually reads. A month grid answers "what is happening
 * on the 14th"; this answers "is the rotation fair, and is anyone leading the same
 * clinic every week" — which is the question the weekly-rotation work of v2.7 was
 * done to settle, and which no month grid can show because the evidence is spread
 * across twelve pages.
 *
 * WEEK NUMBERS ARE THE ENGINE'S (`shift.week`, 1-based from the roster's first
 * Monday), not ISO week numbers. A roster master says "week 3 of the block"; ISO
 * week 38 means nothing to them. Shifts from a legacy document with no `week` are
 * counted from the roster's first date instead, in whole 7-day blocks, so an old
 * roster still lays out rather than collapsing into one column.
 *
 * A PERSON IS A ROW IF THEY LEAD OR SECOND ANYTHING. Somebody rostered nowhere has
 * no row — an empty line under a name reads as "this person did nothing", which is
 * a claim about a colleague the export has no basis for making. Rows are ordered
 * by who leads most, then alphabetically, so the top of the page is the people
 * carrying the department.
 *
 * `lead: false` MEANS SECOND, NOT STANDBY. Whether a second is present alongside
 * the lead or named as a standby is a property of the TASK (`standbySecond`), and
 * `rosterData` shifts do not carry it — see the limits note at the foot of this
 * file. Both print as a second.
 */
export const buildStaffWeekMatrix = (rosterData, options = {}) => {
    const shortNames = options.shortNames && typeof options.shortNames === 'object'
        ? options.shortNames
        : null;

    const dates = shiftDates(rosterData);
    const firstDate = dates.length > 0 ? parseLocalStartDate(dates[0]) : null;

    const weekOf = (shift, dateKey) => {
        if (Number.isInteger(shift.week) && shift.week > 0) return shift.week;
        if (!firstDate) return 1;
        const days = Math.round((parseLocalStartDate(dateKey) - firstDate) / 86400000);
        return Math.floor(days / 7) + 1;
    };

    const people = new Map();       // real name -> row under construction
    const weeks = new Set();

    dates.forEach((dateKey) => {
        shiftsOn(rosterData, dateKey).forEach((shift) => {
            const week = weekOf(shift, dateKey);
            weeks.add(week);

            const seats = [
                { name: shift.lead, lead: true },
                { name: shift.coLead, lead: false },
            ];
            // Anybody the pairing put on the shift beyond the named two. Read
            // AFTER `lead`/`coLead` for the reason `shiftAssigneeNames` documents:
            // on a swapped shift `assignees` can still name the departed clinician.
            if (Array.isArray(shift.assignees)) {
                shift.assignees.forEach((name) => seats.push({ name, lead: false }));
            }

            const seen = new Set();
            seats.forEach(({ name, lead }) => {
                if (typeof name !== 'string' || name.trim() === '') return;
                if (seen.has(name)) return;
                seen.add(name);

                if (!people.has(name)) {
                    people.set(name, {
                        name,
                        display: displayNameFor(name, shortNames),
                        byWeek: new Map(),
                        leadCount: 0,
                        totalCount: 0,
                    });
                }
                const row = people.get(name);
                if (!row.byWeek.has(week)) row.byWeek.set(week, []);
                row.byWeek.get(week).push({
                    task: typeof shift.task === 'string' ? shift.task : '',
                    category: typeof shift.category === 'string' ? shift.category : '',
                    lead,
                    date: dateKey,
                    swatch: printSwatchFor(shift.category),
                });
                row.totalCount += 1;
                if (lead) row.leadCount += 1;
            });
        });
    });

    const weekNumbers = [...weeks].sort((a, b) => a - b);
    const rows = [...people.values()]
        .sort((a, b) => (b.leadCount - a.leadCount) || a.name.localeCompare(b.name))
        .map((row) => ({
            name: row.name,
            display: row.display,
            leadCount: row.leadCount,
            totalCount: row.totalCount,
            cells: weekNumbers.map((week) => row.byWeek.get(week) ?? []),
        }));

    return { weeks: weekNumbers, rows };
};


// --- THE LAYOUTS' LIMITS LEDGER ----------------------------------------------
//
// Same convention as `auraEngine.js` section 2d: what a roster master can do
// today and get a surprising file. MEASURED where it says measured; FLAGGED where
// a judgment was made rather than a fact found.
//
//  1. A STANDBY PRINTS AS A SECOND (FLAGGED). v2.8.0 made the second person on a
//     shift either present alongside the lead or a named standby, per task. That
//     distinction lives on the TASK definition (`standbySecond`) and is re-derived
//     at audit time; the shift written into `rosterData` carries only `lead` and
//     `coLead`. So a printed calendar cannot say "A Nwosu is standby here" — it
//     says the same thing the `.ics` and `.csv` already say. Fixing it means
//     threading task definitions into the exports, which is a change to what an
//     export IS, and is deliberately not smuggled in here.
//
//  2. A SWAPPED SHIFT CAN LIST ONE NAME TOO MANY (MEASURED, INHERITED). Item 1 of
//     `auraEngine.js` section 2d applies unchanged: `applyShiftSubstitution` does
//     not maintain `assignees`, so the matrix can give a departed clinician a cell
//     in a week they handed over. The month grid does not, because it renders
//     `shiftStaffDisplay`, which reads the authoritative pair.
//
//  3. THE MATRIX HAS NO CLOCK TIMES, SO IT CANNOT SHOW A CLASH (MEASURED). Two
//     duties in one week cell may overlap in real life and the sheet will not say
//     so. This is the same gap the standby control's own copy states: the engine
//     holds durations, never start times.
//
//  4. AN EMPTY ROSTER EXPORTS NOTHING, not twelve blank months (FLAGGED, and see
//     `buildYearGrids` for why). A team wanting blank printable months before
//     generating anything is a real want and is not served here.
