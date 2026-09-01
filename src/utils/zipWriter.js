// src/utils/zipWriter.js
//
// A ZIP FILE, WRITTEN BY HAND, BECAUSE AN .XLSX IS A ZIP OF XML AND NOTHING ELSE.
//
// WHY THIS IS HERE RATHER THAN A DEPENDENCY. The roster master asked for the
// calendar as a spreadsheet with the duties in coloured boxes. The obvious
// library, SheetJS, cannot colour a cell — fills, fonts and borders are its paid
// tier, and its free build has also left npm — so it cannot do the one thing the
// request is about. The alternative that can, ExcelJS, is several hundred
// kilobytes of a general-purpose workbook object model to emit twelve sheets of a
// shape we already know exactly. This file plus `rosterXlsx.js` is the whole of
// what we actually need, it is ours to test, and it adds nothing to the bundle
// that is not read.
//
// STORE, NOT DEFLATE. Every entry is written uncompressed. `.xlsx` readers accept
// it — the method is part of the format, not a fallback — and it costs a larger
// file in exchange for no compressor: no `CompressionStream` (absent in older
// Safari), no async, no zlib shim in a browser bundle. `rosterXlsx.js` records
// the measured size that buys.
//
// DELIBERATELY DETERMINISTIC. Every entry is stamped with the same fixed DOS
// timestamp, so building the same roster twice produces byte-identical files.
// That is what lets a test assert on bytes at all, and it means a roster master
// can tell whether a re-export actually changed anything.

/** 1 January 1980, 00:00 — the earliest a DOS timestamp can express. */
const DOS_TIME = 0;
const DOS_DATE = 33;    // (1980-1980)<<9 | 1<<5 | 1

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c >>> 0;
    }
    return table;
})();

/** The CRC-32 every ZIP entry carries twice. Exported so a test can check it. */
export const crc32 = (bytes) => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i += 1) {
        c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
};

/** Grows on demand; ZIP wants little-endian throughout. */
const writer = () => {
    let bytes = new Uint8Array(1 << 16);
    let at = 0;

    const room = (n) => {
        if (at + n <= bytes.length) return;
        let size = bytes.length;
        while (size < at + n) size *= 2;
        const grown = new Uint8Array(size);
        grown.set(bytes.subarray(0, at));
        bytes = grown;
    };

    return {
        get offset() { return at; },
        u16(v) { room(2); bytes[at] = v & 0xFF; bytes[at + 1] = (v >>> 8) & 0xFF; at += 2; },
        u32(v) {
            room(4);
            bytes[at] = v & 0xFF;
            bytes[at + 1] = (v >>> 8) & 0xFF;
            bytes[at + 2] = (v >>> 16) & 0xFF;
            bytes[at + 3] = (v >>> 24) & 0xFF;
            at += 4;
        },
        raw(chunk) { room(chunk.length); bytes.set(chunk, at); at += chunk.length; },
        done() { return bytes.slice(0, at); },
    };
};

const utf8 = (text) => new TextEncoder().encode(text);

/**
 * `[{ name, text }]` -> the bytes of a ZIP holding them, in the order given.
 *
 * Order matters for an `.xlsx`: `[Content_Types].xml` is required to be present
 * and readers are happier finding it first. The caller controls it.
 */
export const buildZip = (entries) => {
    const out = writer();
    const records = [];

    entries.forEach(({ name, text }) => {
        const nameBytes = utf8(name);
        const body = utf8(text);
        const crc = crc32(body);
        const offset = out.offset;

        out.u32(0x04034b50);            // local file header
        out.u16(20);                    // version needed
        out.u16(0x0800);                // flags: the name is UTF-8
        out.u16(0);                     // method: stored
        out.u16(DOS_TIME);
        out.u16(DOS_DATE);
        out.u32(crc);
        out.u32(body.length);           // compressed == uncompressed, stored
        out.u32(body.length);
        out.u16(nameBytes.length);
        out.u16(0);                     // no extra field
        out.raw(nameBytes);
        out.raw(body);

        records.push({ nameBytes, crc, size: body.length, offset });
    });

    const dirStart = out.offset;
    records.forEach(({ nameBytes, crc, size, offset }) => {
        out.u32(0x02014b50);            // central directory header
        out.u16(20);                    // version made by
        out.u16(20);                    // version needed
        out.u16(0x0800);
        out.u16(0);
        out.u16(DOS_TIME);
        out.u16(DOS_DATE);
        out.u32(crc);
        out.u32(size);
        out.u32(size);
        out.u16(nameBytes.length);
        out.u16(0);                     // extra
        out.u16(0);                     // comment
        out.u16(0);                     // disk number
        out.u16(0);                     // internal attributes
        out.u32(0);                     // external attributes
        out.u32(offset);
        out.raw(nameBytes);
    });
    const dirSize = out.offset - dirStart;

    out.u32(0x06054b50);                // end of central directory
    out.u16(0);                         // this disk
    out.u16(0);                         // disk with the directory
    out.u16(records.length);
    out.u16(records.length);
    out.u32(dirSize);
    out.u32(dirStart);
    out.u16(0);                         // no comment

    return out.done();
};

/**
 * `& < > " '` -> entities. Everything written into the XML goes through this.
 *
 * Control characters are STRIPPED rather than escaped, because they are not legal
 * in XML 1.0 in any form: one arriving in a staff name would make the entire
 * workbook refuse to open, which is a far worse failure than one wrong cell. Tab,
 * newline and carriage return are legal and are kept — the calendar cells depend
 * on a newline to put the names under the duty.
 */
export const xmlEscape = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // eslint-disable-next-line no-control-regex -- stripping them is the point
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
