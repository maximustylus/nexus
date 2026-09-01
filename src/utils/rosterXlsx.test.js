/**
 * THE WORKBOOK IS TESTED BY OPENING IT AGAIN.
 *
 * `buildRosterXlsx` returns bytes, so these unzip those bytes and read the XML
 * back. That is the only honest way to test a file format written by hand: an
 * assertion on the string a helper returned proves the helper, not the file, and
 * the failure mode that matters here — Excel refusing to open the workbook at all
 * — comes from the parts and their wiring, not from any one cell.
 *
 * The reader below is deliberately tiny and STORE-only, which is all `zipWriter`
 * produces. Its job is to fail loudly if the archive is malformed.
 */

import { describe, it, expect } from 'vitest';
import { buildRosterXlsx, columnName, sheetName } from './rosterXlsx.js';
import { crc32, buildZip, xmlEscape } from './zipWriter.js';

/** Bytes of a STORE-only ZIP -> `{ [name]: text }`, verifying each CRC on the way. */
const unzip = (bytes) => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const decoder = new TextDecoder();
    const out = {};
    let at = 0;

    while (at + 4 <= bytes.length && view.getUint32(at, true) === 0x04034b50) {
        const crc = view.getUint32(at + 14, true);
        const size = view.getUint32(at + 18, true);
        const nameLen = view.getUint16(at + 26, true);
        const extraLen = view.getUint16(at + 28, true);
        const nameAt = at + 30;
        const bodyAt = nameAt + nameLen + extraLen;
        const name = decoder.decode(bytes.subarray(nameAt, nameAt + nameLen));
        const body = bytes.subarray(bodyAt, bodyAt + size);
        expect(crc32(body)).toBe(crc);      // the archive is not merely parseable
        out[name] = decoder.decode(body);
        at = bodyAt + size;
    }
    return out;
};

const ROSTER = {
    '2026-09-07': [
        { task: 'EFT', category: 'Clinical', lead: 'Adaeze Nwosu', coLead: 'Benedict Tan', staff: 'Lead: Adaeze Nwosu, Co: Benedict Tan', week: 1 },
        { task: 'VC', category: 'VC', lead: 'Chidi Okafor', coLead: 'Dalia Haddad', staff: 'Lead: Chidi Okafor, Co: Dalia Haddad', week: 1 },
    ],
    '2026-09-14': [
        { task: 'EFT', category: 'Clinical', lead: 'Benedict Tan', coLead: 'Adaeze Nwosu', staff: 'Lead: Benedict Tan, Co: Adaeze Nwosu', week: 2 },
    ],
};

const open = (roster = ROSTER, options = {}) => unzip(buildRosterXlsx(roster, options));

describe('the archive is a workbook Excel can open', () => {
    it('carries every part the format requires, and no dangling relationship', () => {
        const parts = open();
        for (const required of [
            '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml',
            'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml',
        ]) {
            expect(parts[required]).toBeTruthy();
        }
        // Every worksheet the relationships promise must actually be in the zip.
        const targets = [...parts['xl/_rels/workbook.xml.rels'].matchAll(/Target="(worksheets\/[^"]+)"/g)];
        expect(targets.length).toBeGreaterThan(0);
        targets.forEach(([, target]) => expect(parts[`xl/${target}`]).toBeTruthy());
    });

    it('declares a content type for every sheet it ships', () => {
        const parts = open();
        const sheets = Object.keys(parts).filter((n) => n.startsWith('xl/worksheets/'));
        const types = parts['[Content_Types].xml'];
        sheets.forEach((name) => expect(types).toContain(`PartName="/${name}"`));
    });

    it('names one tab per month, plus the matrix', () => {
        const book = open()['xl/workbook.xml'];
        const names = [...book.matchAll(/name="([^"]+)"/g)].map(([, n]) => n);
        expect(names).toHaveLength(13);            // 12 months + the matrix
        expect(names[0]).toBe('Jan 2026');
        expect(names[11]).toBe('Dec 2026');
        expect(names[12]).toBe('Who leads what');
    });

    it('builds byte-identical files from the same roster', () => {
        // The DOS timestamps are fixed for exactly this: a roster master can tell
        // whether a re-export actually changed anything.
        const a = buildRosterXlsx(ROSTER);
        const b = buildRosterXlsx(ROSTER);
        expect(Array.from(a)).toEqual(Array.from(b));
    });

    it('returns null for an empty roster rather than a workbook of blank months', () => {
        expect(buildRosterXlsx({})).toBeNull();
        expect(buildRosterXlsx(null)).toBeNull();
    });
});

describe('a month tab looks like a calendar, not a list of shifts', () => {
    it('lays the week out across seven columns under a Sun–Sat strip', () => {
        const sheet = open()['xl/worksheets/sheet9.xml'];       // September
        expect(sheet).toContain('September 2026');
        for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
            expect(sheet).toContain(`>${day}</t>`);
        }
        expect(sheet).toContain('<col min="1" max="7"');
    });

    it('puts the duty and the people in one box, on two lines', () => {
        const sheet = open(ROSTER, { shortNames: { 'Adaeze Nwosu': 'AN', 'Benedict Tan': 'BT' } })['xl/worksheets/sheet9.xml'];
        expect(sheet).toContain('EFT\n');
        expect(sheet).toContain('Lead: AN, Co: BT');
        // `xml:space="preserve"` is what stops the reader collapsing that newline
        // and putting the names back on the duty's line.
        expect(sheet).toContain('xml:space="preserve"');
    });

    it('fills the box with the category colour, VC included', () => {
        const parts = open();
        const styles = parts['xl/styles.xml'];
        expect(styles).toContain('FFF2E6D8');       // Clinical brown
        expect(styles).toContain('FFFFF7ED');       // VC orange, which has no standard entry
        // ...and the sheet must actually POINT at those fills, not merely ship them.
        expect(parts['xl/worksheets/sheet9.xml']).toMatch(/ s="[6-9]"/);
    });

    it('keeps the empty months, with writable boxes in them', () => {
        // The owner chose "always Jan–Dec, empty months blank". A blank month must
        // still be a printable grid and must say why it is empty.
        const sheet = open()['xl/worksheets/sheet3.xml'];       // March, untouched
        expect(sheet).toContain('March 2026');
        expect(sheet).toContain('No roster generated for this month');
        expect(sheet).toContain('>31</t>');                     // the day numbers are there
    });

    it('freezes the weekday strip and prints landscape on one page wide', () => {
        const sheet = open()['xl/worksheets/sheet9.xml'];
        expect(sheet).toContain('state="frozen"');
        expect(sheet).toContain('orientation="landscape"');
        expect(sheet).toContain('fitToWidth="1"');
    });

    it('orders the worksheet elements the way the schema demands', () => {
        // Excel does not report a mis-ordered worksheet — it refuses the file. The
        // order is sheetViews, cols, sheetData, mergeCells, pageMargins, pageSetup.
        const sheet = open()['xl/worksheets/sheet9.xml'];
        const order = ['<sheetViews>', '<cols>', '<sheetData>', '<pageMargins', '<pageSetup'];
        const positions = order.map((tag) => sheet.indexOf(tag));
        expect(positions.every((p) => p >= 0)).toBe(true);
        expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    });
});

describe('the matrix tab carries the rotation', () => {
    it('gives a column per week and a row per person', () => {
        const sheet = open()['xl/worksheets/sheet13.xml'];
        expect(sheet).toContain('Who leads what, by week');
        expect(sheet).toContain('>W1</t>');
        expect(sheet).toContain('>W2</t>');
        // Grammatical, both ways: "0 lead · 1 duties" went out in a printed
        // roster once and read as carelessness.
        expect(sheet).toContain('1 lead · 2 duties');
        expect(sheet).toContain('0 leads · 1 duty');
    });
});

describe('nothing a roster master can type breaks the file', () => {
    it('escapes the five XML characters wherever they appear', () => {
        const nasty = {
            '2026-09-07': [{
                task: 'R&D <trial>', category: '"Clinical"',
                lead: "O'Brien & Sons", staff: "Lead: O'Brien & Sons", week: 1,
            }],
        };
        const sheet = open(nasty)['xl/worksheets/sheet9.xml'];
        expect(sheet).toContain('R&amp;D &lt;TRIAL&gt;');
        expect(sheet).toContain('&apos;');
        expect(sheet).not.toMatch(/<t[^>]*>[^<]*&(?!amp;|lt;|gt;|quot;|apos;)/);
    });

    it('strips a control character instead of shipping an unopenable workbook', () => {
        // A stray control byte is illegal in XML 1.0 in ANY form, escaped included.
        // One in a staff name must cost that character, not the whole file.
        const bell = String.fromCharCode(7);
        expect(xmlEscape(`Bene${bell}dict Tan`)).toBe('Benedict Tan');
        expect(xmlEscape(`a${String.fromCharCode(10)}b`)).toBe('a\nb');   // newline survives
    });

    it('makes a sheet name Excel will accept out of one it will not', () => {
        expect(sheetName('Jan 2026')).toBe('Jan 2026');
        expect(sheetName('A/B:C*D?E[F]G')).toBe('A-B-C-D-E-F-G');
        expect(sheetName('x'.repeat(40))).toHaveLength(31);
        expect(sheetName('')).toBe('Sheet');
    });

    it('names columns past Z, so a year-long matrix still lays out', () => {
        expect(columnName(0)).toBe('A');
        expect(columnName(25)).toBe('Z');
        expect(columnName(26)).toBe('AA');
        expect(columnName(52)).toBe('BA');
    });
});

describe('the zip itself', () => {
    it('is readable, and its CRCs are right', () => {
        // `unzip` above verifies every CRC as it reads, so this is a round trip.
        const parts = unzip(buildZip([{ name: 'a.txt', text: 'hello' }, { name: 'b/c.xml', text: '<x/>' }]));
        expect(parts['a.txt']).toBe('hello');
        expect(parts['b/c.xml']).toBe('<x/>');
    });

    it('computes the CRC-32 the format specifies', () => {
        // The published check value for "hello".
        expect(crc32(new TextEncoder().encode('hello')).toString(16)).toBe('3610a686');
        expect(crc32(new Uint8Array(0))).toBe(0);
    });

    it('handles a name that needs more than one byte in UTF-8', () => {
        const parts = unzip(buildZip([{ name: 'staff/李医生.xml', text: 'ok' }]));
        expect(parts['staff/李医生.xml']).toBe('ok');
    });
});
