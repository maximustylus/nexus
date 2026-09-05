// src/utils/rosterXlsx.js
//
// THE ROSTER AS A WORKBOOK: TWELVE MONTH TABS SHAPED LIKE CALENDARS, PLUS THE MATRIX.
//
// The roster master's words, 2026-09-01: *".xlsx with 12 tabs jan to dec and
// roster are in boxes just like a calendar"*. So the sheets are not tables of
// shifts — a `.csv` is already that, and it is the format nobody can read on a
// wall. Each month tab is a seven-column grid with a row of day numbers and the
// duties stacked underneath them, in the colours the app uses.
//
// WHAT AN .XLSX ACTUALLY IS: a ZIP of XML parts. `zipWriter.js` makes the ZIP and
// explains why it is ours rather than a dependency; this file writes the XML.
//
// ALL TEXT IS INLINE RICH TEXT (`<is><r>`), not shared strings and not styled
// fonts. That is a deliberate simplification with a real payoff: run formatting
// travels with the text, so `styles.xml` only has to describe fills, borders and
// alignment, and there is no shared-string table whose indices can drift out of
// step with the cells that point into it. It costs some file size, which the
// measured note at the foot of the file records.

import { buildZip, xmlEscape } from './zipWriter.js';
import { buildYearGrids, buildStaffWeekMatrix, WEEKDAY_HEADINGS, countLabel } from './rosterGrid.js';

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Slate-700, the colour the calendar prints names in. */
const NAME_INK = '334155';
/** Slate-500, for a second rather than a lead. */
const MUTED_INK = '64748B';

/** 0 -> 'A', 25 -> 'Z', 26 -> 'AA'. A 52-week matrix needs the second letter. */
export const columnName = (index) => {
    let n = index;
    let name = '';
    do {
        name = String.fromCharCode(65 + (n % 26)) + name;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return name;
};

/** `'#f2e6d8'` -> `'FFF2E6D8'`, which is the ARGB form every Excel colour uses. */
const argb = (hex) => `FF${String(hex ?? '').replace('#', '').toUpperCase()}`;

/**
 * A sheet name Excel will accept: 31 characters, and none of `[ ] : * ? / \`.
 *
 * Excel does not report a bad name — it refuses to open the workbook at all — so
 * this is a correctness rule, not tidiness.
 */
export const sheetName = (label) => String(label ?? '')
    .replace(/[[\]:*?/\\]/g, '-')
    .slice(0, 31) || 'Sheet';

/** One formatting run inside a cell. */
const run = (text, { bold = false, color = NAME_INK, size = 9 } = {}) =>
    `<r><rPr>${bold ? '<b/>' : ''}<sz val="${size}"/><color rgb="${argb(color)}"/>`
    + `<rFont val="Calibri"/></rPr><t xml:space="preserve">${xmlEscape(text)}</t></r>`;

/** A cell holding rich text. `s` is an index into `cellXfs`. */
const richCell = (ref, styleIndex, runs) =>
    `<c r="${ref}" s="${styleIndex}" t="inlineStr"><is>${runs.join('')}</is></c>`;

/** An empty but STYLED cell — this is what draws an empty box. */
const blankCell = (ref, styleIndex) => `<c r="${ref}" s="${styleIndex}"/>`;

// --- STYLES -------------------------------------------------------------------
//
// `cellXfs` indices are referenced by number from every sheet, so they are fixed
// here and named, rather than being counted by hand at each call site.

const XF = Object.freeze({
    default: 0,
    title: 1,        // no border, no fill — the heading sits above the grid
    weekday: 2,      // the Sun..Sat strip
    dayNumber: 3,    // the box holding the date
    outside: 4,      // a square belonging to the previous or next month
    empty: 5,        // an in-month square with no duty: a box to write in
    firstSwatch: 6,  // one per distinct category fill, in `swatchOrder`
});

const buildStyles = (swatchBgs) => {
    // Fills 0 and 1 are reserved by the format: Excel requires `none` and
    // `gray125` in exactly those slots or it treats the workbook as corrupt.
    const fills = [
        '<fill><patternFill patternType="none"/></fill>',
        '<fill><patternFill patternType="gray125"/></fill>',
        '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>',
        '<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>',
        '<fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>',
        ...swatchBgs.map((bg) =>
            `<fill><patternFill patternType="solid"><fgColor rgb="${argb(bg)}"/><bgColor indexed="64"/></patternFill></fill>`),
    ];

    const thin = '<color rgb="FFCBD5E1"/>';
    const borders = [
        '<border><left/><right/><top/><bottom/><diagonal/></border>',
        `<border><left style="thin">${thin}</left><right style="thin">${thin}</right>`
        + `<top style="thin">${thin}</top><bottom style="thin">${thin}</bottom><diagonal/></border>`,
    ];

    const boxed = (fillIndex, alignment) =>
        `<xf numFmtId="0" fontId="0" fillId="${fillIndex}" borderId="1" applyFill="1"`
        + ` applyBorder="1" applyAlignment="1">${alignment}</xf>`;

    const topLeft = '<alignment horizontal="left" vertical="top" wrapText="1"/>';
    const centre = '<alignment horizontal="center" vertical="center"/>';

    const cellXfs = [
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>',                              // 0 default
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1">'
        + '<alignment horizontal="left" vertical="center"/></xf>',                            // 1 title
        boxed(3, centre),                                                                     // 2 weekday
        boxed(2, '<alignment horizontal="left" vertical="top"/>'),                            // 3 day number
        boxed(4, topLeft),                                                                    // 4 outside
        boxed(2, topLeft),                                                                    // 5 empty
        ...swatchBgs.map((_bg, i) => boxed(5 + i, topLeft)),                                  // 6.. swatches
    ];

    return `${XML}<styleSheet xmlns="${NS}">`
        + '<fonts count="1"><font><sz val="11"/><color theme="1"/><name val="Calibri"/></font></fonts>'
        + `<fills count="${fills.length}">${fills.join('')}</fills>`
        + `<borders count="${borders.length}">${borders.join('')}</borders>`
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + `<cellXfs count="${cellXfs.length}">${cellXfs.join('')}</cellXfs>`
        // Excel and openpyxl both expect a named default style to exist; without
        // it a reader reports the workbook as having no default and substitutes
        // its own, which is a warning today and could be a refusal tomorrow.
        + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        + '</styleSheet>';
};

// --- SHEETS -------------------------------------------------------------------

const sheetOpen = (cols, freezeRow) =>
    `${XML}<worksheet xmlns="${NS}" xmlns:r="${REL_NS}">`
    + '<sheetViews><sheetView workbookViewId="0" showGridLines="0">'
    + `<pane ySplit="${freezeRow}" topLeftCell="A${freezeRow + 1}" activePane="bottomLeft" state="frozen"/>`
    + '</sheetView></sheetViews>'
    + `<cols>${cols}</cols><sheetData>`;

const sheetClose = (merges) =>
    '</sheetData>'
    + (merges.length > 0
        ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
        : '')
    // Landscape, scaled to one page wide, because a seven-column calendar that
    // prints its Saturday on a second sheet of paper is not a calendar.
    + '<pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.3" footer="0.3"/>'
    + '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/>'
    + '</worksheet>';

/** How many duty rows a calendar week needs. At least two, so an empty week is writable. */
const dutyRowsFor = (week) => Math.max(2, ...week.map((cell) => cell.shifts.length));

/**
 * One month tab: a title, the weekday strip, then six week-blocks of boxes.
 *
 * A WEEK-BLOCK IS A DAY-NUMBER ROW PLUS N DUTY ROWS, which is what makes the
 * result look like a calendar rather than a list. `n` is the busiest day in that
 * week, so the boxes line up across the seven columns and a quiet week does not
 * inherit a busy one's height.
 */
const monthSheet = (grid, swatchIndex) => {
    const cols = '<col min="1" max="7" width="24" customWidth="1"/>';
    const rows = [];
    let r = 1;

    rows.push(`<row r="${r}" ht="22" customHeight="1">`
        + richCell(`A${r}`, XF.title, [run(grid.label, { bold: true, size: 16, color: '0F172A' })])
        + richCell(`C${r}`, XF.title, [run(
            grid.shiftCount > 0
                ? countLabel(grid.shiftCount, 'duty', 'duties')
                : 'No roster generated for this month',
            { size: 10, color: MUTED_INK },
        )])
        + '</row>');
    r += 2;

    const headerRow = r;
    rows.push(`<row r="${r}" ht="18" customHeight="1">`
        + WEEKDAY_HEADINGS.map((name, i) =>
            richCell(`${columnName(i)}${r}`, XF.weekday, [run(name, { bold: true, size: 10, color: MUTED_INK })]),
        ).join('')
        + '</row>');
    r += 1;

    grid.weeks.forEach((week) => {
        rows.push(`<row r="${r}" ht="15" customHeight="1">`
            + week.map((cell, i) => {
                const ref = `${columnName(i)}${r}`;
                if (!cell.inMonth) return blankCell(ref, XF.outside);
                return richCell(ref, XF.dayNumber, [run(String(cell.day), { bold: true, size: 10, color: MUTED_INK })]);
            }).join('')
            + '</row>');
        r += 1;

        const dutyRows = dutyRowsFor(week);
        for (let line = 0; line < dutyRows; line += 1) {
            rows.push(`<row r="${r}" ht="28" customHeight="1">`
                + week.map((cell, i) => {
                    const ref = `${columnName(i)}${r}`;
                    if (!cell.inMonth) return blankCell(ref, XF.outside);
                    const shift = cell.shifts[line];
                    if (!shift) return blankCell(ref, XF.empty);
                    return richCell(ref, swatchIndex(shift.swatch.bg), [
                        run(`${shift.task.toUpperCase()}\n`, { bold: true, color: shift.swatch.fg }),
                        run(shift.people, { size: 8 }),
                    ]);
                }).join('')
                + '</row>');
            r += 1;
        }
    });

    return sheetOpen(cols, headerRow) + rows.join('') + sheetClose([`A1:B1`]);
};

/** The staff-by-week tab. Rows are people, columns are the engine's weeks. */
const matrixSheet = (matrix) => {
    const cols = '<col min="1" max="1" width="26" customWidth="1"/>'
        + `<col min="2" max="${matrix.weeks.length + 1}" width="14" customWidth="1"/>`;
    const rows = [];
    let r = 1;

    rows.push(`<row r="${r}" ht="22" customHeight="1">`
        + richCell(`A${r}`, XF.title, [run('Who leads what, by week', { bold: true, size: 16, color: '0F172A' })])
        + '</row>');
    r += 2;

    const headerRow = r;
    rows.push(`<row r="${r}" ht="18" customHeight="1">`
        + richCell(`A${r}`, XF.weekday, [run('Staff', { bold: true, size: 10, color: MUTED_INK })])
        + matrix.weeks.map((week, i) =>
            richCell(`${columnName(i + 1)}${r}`, XF.weekday, [run(`W${week}`, { bold: true, size: 10, color: MUTED_INK })]),
        ).join('')
        + '</row>');
    r += 1;

    matrix.rows.forEach((person) => {
        rows.push(`<row r="${r}" ht="46" customHeight="1">`
            + richCell(`A${r}`, XF.empty, [
                run(`${person.display}\n`, { bold: true, size: 11, color: '0F172A' }),
                run(`${countLabel(person.leadCount, 'lead', 'leads')} · ${countLabel(person.totalCount, 'duty', 'duties')}`,
                    { size: 8, color: MUTED_INK }),
            ])
            + person.cells.map((duties, i) => {
                const ref = `${columnName(i + 1)}${r}`;
                if (duties.length === 0) return blankCell(ref, XF.empty);
                // One entry per distinct duty, leads first: a clinic led on three
                // days of a week is one line, not three identical ones.
                const seen = new Map();
                duties.forEach((duty) => {
                    const prior = seen.get(duty.task);
                    if (!prior) seen.set(duty.task, { ...duty });
                    else if (duty.lead) prior.lead = true;
                });
                const lines = [...seen.values()].sort((a, b) => Number(b.lead) - Number(a.lead));
                return richCell(ref, XF.empty, lines.map((duty, j) => run(
                    j === 0 ? duty.task : `\n${duty.task}`,
                    { bold: duty.lead, size: 9, color: duty.lead ? duty.swatch.fg : MUTED_INK },
                )));
            }).join('')
            + '</row>');
        r += 1;
    });

    return sheetOpen(cols, headerRow) + rows.join('') + sheetClose([]);
};

// --- THE WORKBOOK -------------------------------------------------------------

/**
 * A roster -> the bytes of an `.xlsx`, or `null` if there is nothing to export.
 *
 * `null` rather than an empty workbook, for the same reason `paintRosterPdf`
 * returns zero pages: a file that opens and shows twelve blank months is
 * indistinguishable from a roster that generated nothing, and the caller can say
 * so plainly instead.
 */
export const buildRosterXlsx = (rosterData, options = {}) => {
    const grids = buildYearGrids(rosterData, options);
    if (grids.length === 0) return null;
    const matrix = buildStaffWeekMatrix(rosterData, options);

    // Every distinct fill the workbook will use, in a fixed order, so a sheet can
    // turn a swatch back into the `cellXfs` index that paints it.
    const swatchBgs = [];
    const swatchIndex = (bg) => {
        const at = swatchBgs.indexOf(bg);
        return XF.firstSwatch + (at === -1 ? swatchBgs.push(bg) - 1 : at);
    };
    grids.forEach((grid) => grid.weeks.forEach((week) => week.forEach((cell) =>
        cell.shifts.forEach((shift) => swatchIndex(shift.swatch.bg)))));

    const sheets = grids.map((grid) => ({ name: sheetName(grid.tab), xml: monthSheet(grid, swatchIndex) }));
    if (matrix.rows.length > 0) {
        sheets.push({ name: sheetName('Who leads what'), xml: matrixSheet(matrix) });
    }

    const parts = [
        {
            name: '[Content_Types].xml',
            text: `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
                + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                + '<Default Extension="xml" ContentType="application/xml"/>'
                + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
                + sheets.map((_s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
                + '</Types>',
        },
        {
            name: '_rels/.rels',
            text: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
                + `<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/>`
                + '</Relationships>',
        },
        {
            name: 'xl/workbook.xml',
            text: `${XML}<workbook xmlns="${NS}" xmlns:r="${REL_NS}"><sheets>`
                + sheets.map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
                + '</sheets></workbook>',
        },
        {
            name: 'xl/_rels/workbook.xml.rels',
            text: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
                + sheets.map((_s, i) => `<Relationship Id="rId${i + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
                + `<Relationship Id="rId${sheets.length + 1}" Type="${REL_NS}/styles" Target="styles.xml"/>`
                + '</Relationships>',
        },
        { name: 'xl/styles.xml', text: buildStyles(swatchBgs) },
        ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: s.xml })),
    ];

    return buildZip(parts);
};

/** Build and save the workbook. Returns what it wrote, or `null` for an empty roster. */
export const downloadRosterXlsx = (rosterData, options = {}) => {
    const bytes = buildRosterXlsx(rosterData, options);
    if (!bytes) return null;

    const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'AURA_Roster_Calendar.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return { bytes: bytes.length };
};


// --- THE WORKBOOK'S LIMITS LEDGER --------------------------------------------
//
//  1. THE FILE IS STORED, NOT DEFLATED, so it is several times the size a
//     compressed one would be. See `zipWriter.js` for why. MEASURED figures live
//     in the release notes rather than here, so they cannot go stale silently.
//
//  2. NO FORMULAS, NO CONDITIONAL FORMATTING, NO AUTOFILTER. The sheets are a
//     printed calendar that happens to be editable, not a model. A roster master
//     who edits a cell changes the spreadsheet and nothing else — nothing is
//     written back to AURA, and the next export overwrites their edits.
//
//  3. A STANDBY IS INDISTINGUISHABLE FROM A SECOND, inherited from `rosterGrid.js`
//     item 1, which explains why.
//
//  4. SHEET NAMES ARE MONTH-AND-YEAR, so two years of roster give twenty-four
//     tabs. `buildYearGrids` documents that choice and where it comes from.
