// src/utils/rosterPdf.js
//
// THE ROSTER, PAINTED ONTO A4 LANDSCAPE. GEOMETRY ONLY — NO ROSTER LOGIC.
//
// `rosterGrid.js` decided which duty belongs in which square. This file decides
// where that square is in millimetres and how small the type has to get. It reads
// the roster only through those layout descriptors, so a bug here can misplace a
// rectangle but cannot mis-roster anybody.
//
// WHY NOT `html2canvas`, WHICH THIS REPO ALREADY OWNS. `ResultPage.jsx` builds its
// PDF by rendering HTML and photographing it. That is right for a one-page
// clinical report with a chart in it, and wrong for a twelve-month calendar:
// a photographed page is a bitmap, so the text cannot be searched or selected,
// it goes soft the moment anybody zooms, and twelve A4 pages of it run to
// megabytes. Drawing rectangles and text with jsPDF's own API keeps the type as
// real vector glyphs — searchable, sharp at any zoom, and a whole year comes out
// a few hundred kilobytes.
//
// WHY `doc` IS AN ARGUMENT AND NOT A CONSTRUCTED jsPDF. The painter takes the
// drawing surface rather than making one. A test can therefore hand it a recorder
// that remembers every rectangle and every string, and assert that December is on
// page twelve and that a six-duty day shrank its type instead of overflowing —
// with no jsPDF, no canvas and no bitmap comparison. `downloadRosterPdf` at the
// foot of the file is the only part that knows jsPDF exists, and it is four lines.

import { buildYearGrids, buildStaffWeekMatrix, WEEKDAY_HEADINGS, GRID_ROWS, countLabel } from './rosterGrid.js';

/** A4 landscape, in millimetres, which is what the doc is created in. */
const PAGE = Object.freeze({ w: 297, h: 210, margin: 10 });

const INK = Object.freeze({
    title: [15, 23, 42],        // slate-900
    muted: [100, 116, 139],     // slate-500
    rule: [203, 213, 225],      // slate-300
    outside: [248, 250, 252],   // slate-50, for squares belonging to another month
    header: [241, 245, 249],    // slate-100, the weekday strip
    white: [255, 255, 255],
});

const TYPE = Object.freeze({
    title: 15,
    subtitle: 8,
    weekday: 8,
    dayNumber: 7,
    chip: 5.4,          // the size a normal day prints at
    chipFloor: 3.4,     // below this, type stops being readable at arm's length
});

/** No chip grows past this, however empty the day. Millimetres. */
const MAX_CHIP_H = 7;

/** `'#6b4423'` -> `[107, 68, 35]`. jsPDF wants channels, and channels are testable. */
export const hexToRgb = (hex) => {
    const clean = typeof hex === 'string' ? hex.replace('#', '') : '';
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) return [0, 0, 0];
    return [
        parseInt(clean.slice(0, 2), 16),
        parseInt(clean.slice(2, 4), 16),
        parseInt(clean.slice(4, 6), 16),
    ];
};

/**
 * `text`, shortened with an ellipsis until it fits `maxWidth` at the current size.
 *
 * The last resort, not the first: the caller shrinks the FONT first and only
 * clips when even the floor size will not fit. A clipped duty still shows which
 * duty it is, because the task name is drawn before the names.
 */
const fitText = (doc, text, maxWidth) => {
    const value = String(text ?? '');
    if (value === '' || doc.getTextWidth(value) <= maxWidth) return value;
    let cut = value.length;
    while (cut > 1 && doc.getTextWidth(`${value.slice(0, cut)}…`) > maxWidth) cut -= 1;
    return `${value.slice(0, cut)}…`;
};

/**
 * The type size at which `count` duties fit the height of one day square.
 *
 * THE OWNER'S CHOICE, 2026-09-01: a crowded day shrinks its text rather than
 * hiding duties behind "+2 more" or letting the row grow and push the month onto
 * a second page. So this returns the largest size that fits and never a size that
 * does not — the grid keeps its shape and a busy Tuesday simply prints smaller.
 *
 * Each duty is drawn on TWO lines, task above names, exactly as the calendar chip
 * on screen is two lines. One long line would force a far smaller size, because
 * `Lead: MA, Co: LT` beside `EFT` is over twice the width of either.
 */
export const chipTypeSize = (availableHeight, count) => {
    if (count <= 0) return TYPE.chip;
    // 2 text lines plus the padding and gap that keep chips from touching.
    const perChip = availableHeight / count;
    const size = (perChip - 1.2) / 2 / 0.42;    // 0.42mm of height per point, per line
    return Math.max(TYPE.chipFloor, Math.min(TYPE.chip, size));
};

const setFill = (doc, rgb) => doc.setFillColor(rgb[0], rgb[1], rgb[2]);
const setDraw = (doc, rgb) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
const setText = (doc, rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);

/** One month, one page. */
const paintMonth = (doc, grid) => {
    const { w, h, margin } = PAGE;
    const gridW = w - margin * 2;
    const colW = gridW / 7;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(TYPE.title);
    setText(doc, INK.title);
    doc.text(grid.label, margin, margin + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(TYPE.subtitle);
    setText(doc, INK.muted);
    // An empty month says so. A blank page with a heading is indistinguishable
    // from a page that failed to render, and this export deliberately includes
    // months the roster never reached.
    doc.text(
        grid.shiftCount > 0
            ? countLabel(grid.shiftCount, 'duty', 'duties')
            : 'No roster generated for this month',
        w - margin,
        margin + 5,
        { align: 'right' },
    );

    const headerY = margin + 9;
    const headerH = 6;
    setFill(doc, INK.header);
    doc.rect(margin, headerY, gridW, headerH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(TYPE.weekday);
    setText(doc, INK.muted);
    WEEKDAY_HEADINGS.forEach((name, i) => {
        doc.text(name, margin + colW * i + colW / 2, headerY + 4.2, { align: 'center' });
    });

    const bodyY = headerY + headerH;
    const rowH = (h - margin - bodyY) / GRID_ROWS;

    grid.weeks.forEach((week, row) => {
        week.forEach((cell, col) => {
            const x = margin + colW * col;
            const y = bodyY + rowH * row;

            setFill(doc, cell.inMonth ? INK.white : INK.outside);
            setDraw(doc, INK.rule);
            doc.setLineWidth(0.2);
            doc.rect(x, y, colW, rowH, 'FD');
            if (!cell.inMonth) return;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(TYPE.dayNumber);
            setText(doc, INK.muted);
            doc.text(String(cell.day), x + 1.4, y + 3.6);

            if (cell.shifts.length === 0) return;

            const top = y + 4.6;
            const available = rowH - 5.6;
            const size = chipTypeSize(available, cell.shifts.length);
            // A quiet day gets COMPACT chips and keeps its whitespace, instead of
            // two rectangles stretched to fill the square. Only a crowded day
            // divides the height evenly, which is where the shrinking begins.
            const chipH = Math.min(available / cell.shifts.length, MAX_CHIP_H);
            const innerW = colW - 3.2;
            const lineH = size * 0.3527 * 1.25;

            cell.shifts.forEach((shift, i) => {
                const cy = top + chipH * i;
                setFill(doc, hexToRgb(shift.swatch.bg));
                setDraw(doc, hexToRgb(shift.swatch.border));
                doc.rect(x + 1, cy, colW - 2, chipH - 0.6, 'FD');

                // Both lines centred in the chip rather than pinned to its top,
                // so a chip that has room to spare shares it above and below.
                const textTop = cy + Math.max(0.4, (chipH - 0.6 - lineH * 2) / 2);
                setText(doc, hexToRgb(shift.swatch.fg));
                doc.setFontSize(size);
                doc.setFont('helvetica', 'bold');
                doc.text(fitText(doc, shift.task.toUpperCase(), innerW), x + 1.6, textTop + lineH * 0.82);
                doc.setFont('helvetica', 'normal');
                doc.text(fitText(doc, shift.people, innerW), x + 1.6, textTop + lineH * 1.82);
            });
        });
    });
};

/** How many week columns fit one landscape page beside the name column. */
const WEEKS_PER_PAGE = 12;
const NAME_COL_W = 34;

/** The staff-by-week matrix, chunked over as many pages as the block needs. */
const paintMatrix = (doc, matrix) => {
    const { w, h, margin } = PAGE;
    if (matrix.rows.length === 0) return;

    for (let start = 0; start < matrix.weeks.length; start += WEEKS_PER_PAGE) {
        const weeks = matrix.weeks.slice(start, start + WEEKS_PER_PAGE);
        doc.addPage();

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(TYPE.title);
        setText(doc, INK.title);
        doc.text('Who leads what, by week', margin, margin + 5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(TYPE.subtitle);
        setText(doc, INK.muted);
        doc.text(
            `Weeks ${weeks[0]}–${weeks[weeks.length - 1]}  ·  bold = leads, plain = second`,
            w - margin,
            margin + 5,
            { align: 'right' },
        );

        const colW = (w - margin * 2 - NAME_COL_W) / weeks.length;
        const headerY = margin + 9;
        const headerH = 6;

        setFill(doc, INK.header);
        doc.rect(margin, headerY, w - margin * 2, headerH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(TYPE.weekday);
        setText(doc, INK.muted);
        doc.text('Staff', margin + 1.6, headerY + 4.2);
        weeks.forEach((week, i) => {
            doc.text(`W${week}`, margin + NAME_COL_W + colW * i + colW / 2, headerY + 4.2, { align: 'center' });
        });

        const bodyY = headerY + headerH;
        // Fill the page. A five-person department capped at 16mm left two thirds
        // of an A4 sheet white, which reads as a truncated table rather than a
        // small team. 30mm is the point past which a row stops looking like a row.
        const rowH = Math.min(30, (h - margin - bodyY) / matrix.rows.length);

        matrix.rows.forEach((row, r) => {
            const y = bodyY + rowH * r;
            setFill(doc, INK.white);
            setDraw(doc, INK.rule);
            doc.setLineWidth(0.2);
            doc.rect(margin, y, w - margin * 2, rowH, 'FD');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            setText(doc, INK.title);
            doc.text(fitText(doc, row.display, NAME_COL_W - 12), margin + 1.6, y + rowH / 2 + 1);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6);
            setText(doc, INK.muted);
            doc.text(countLabel(row.leadCount, 'lead', 'leads'), margin + NAME_COL_W - 12, y + rowH / 2 + 1);

            row.cells.slice(start, start + WEEKS_PER_PAGE).forEach((duties, i) => {
                const x = margin + NAME_COL_W + colW * i;
                setDraw(doc, INK.rule);
                doc.line(x, y, x, y + rowH);
                if (duties.length === 0) return;

                // One line per distinct duty, leads first, deduplicated: a clinic
                // led on three days of one week is one entry in that week's cell,
                // not three identical lines that push the type below the floor.
                const seen = new Map();
                duties.forEach((duty) => {
                    const prior = seen.get(duty.task);
                    if (!prior) seen.set(duty.task, { ...duty });
                    else if (duty.lead) prior.lead = true;
                });
                const lines = [...seen.values()].sort((a, b) => Number(b.lead) - Number(a.lead));
                const size = Math.max(TYPE.chipFloor, Math.min(6.4, (rowH - 1.6) / lines.length / 0.42));

                lines.forEach((duty, j) => {
                    doc.setFontSize(size);
                    doc.setFont('helvetica', duty.lead ? 'bold' : 'normal');
                    setText(doc, duty.lead ? hexToRgb(duty.swatch.fg) : INK.muted);
                    doc.text(
                        fitText(doc, duty.task, colW - 2),
                        x + colW / 2,
                        y + 1.4 + size * 0.42 * (j + 1),
                        { align: 'center' },
                    );
                });
            });
        });
    }
};

/**
 * Paint a whole roster onto `doc`. Returns what it drew, so a caller can report it.
 *
 * PAGE ORDER: January to December of every year the roster touches, then the
 * staff-by-week matrix. The calendar is what was asked for and comes first; the
 * matrix is the sheet a supervisor reads and lives at the back where they can pull
 * it out.
 *
 * An EMPTY roster paints nothing and returns `{ pages: 0 }` rather than a
 * plausible-looking document with no duties in it.
 */
export const paintRosterPdf = (doc, rosterData, options = {}) => {
    const grids = buildYearGrids(rosterData, options);
    if (grids.length === 0) return { pages: 0, months: 0, matrixPages: 0 };

    grids.forEach((grid, i) => {
        if (i > 0) doc.addPage();
        paintMonth(doc, grid);
    });

    const matrix = buildStaffWeekMatrix(rosterData, options);
    const matrixPages = matrix.rows.length === 0
        ? 0
        : Math.ceil(matrix.weeks.length / WEEKS_PER_PAGE);
    paintMatrix(doc, matrix);

    return { pages: grids.length + matrixPages, months: grids.length, matrixPages };
};

/**
 * Build and save the file. The ONLY part of this module that knows about jsPDF.
 *
 * The import is dynamic so jsPDF is fetched when somebody exports a roster and
 * not when a clinician opens the app to see whether they are on tomorrow.
 *
 * ⚠️ `doc.output('blob')` AND THE ANCHOR DANCE, NOT `doc.save()`. jsPDF's `save`
 *    chooses its own delivery from what it finds in the environment — a Blob URL,
 *    `msSaveBlob`, or navigating the window to a data URI — and which one it picks
 *    is not something the caller can see or rely on. It was observed taking the
 *    navigation path, which produces no Blob, no anchor and no download at all.
 *    Building the Blob here and handing it to the same append/click/remove dance
 *    `downloadICS` and `downloadCSV` use makes the delivery one known thing, and
 *    makes it observable: a test can capture the file the button produced instead
 *    of trusting that a library did something.
 */
export const downloadRosterPdf = async (rosterData, options = {}) => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const summary = paintRosterPdf(doc, rosterData, options);
    if (summary.pages === 0) return summary;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(doc.output('blob'));
    link.download = 'AURA_Roster_Calendar.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return summary;
};
