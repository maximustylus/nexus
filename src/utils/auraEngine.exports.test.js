/**
 * ==============================================================================
 * AURA ROSTER ENGINE — P5 EXPORT SUITE (ICS / CSV)
 * ==============================================================================
 * Runner: Vitest
 * Run:    npm test
 *
 * PURPOSE — SPECIFICATION tests for the two file formats the roster leaves the
 * app in. They pin the fixes in ROSTER_TODO.md P5:
 *
 *   M6   the ICS export was malformed — unescaped `,` in SUMMARY (which RFC 5545
 *        reads as a multi-valued property, so Outlook drops the co-lead), and no
 *        `UID` / no `DTSTAMP`, both REQUIRED by §3.6.1. Without a STABLE UID a
 *        re-import duplicates all 88 events instead of updating them, so the
 *        "identical across two builds" test below is the load-bearing one.
 *   M7   `undefined` in the file for any shift lacking `week`/`coLead` — the
 *        demo transform and every pre-6-May live document.
 *   M10  CSV written raw into a file whose whole point is being opened in Excel:
 *        no quoting, and no guard against a task name that is a formula.
 *
 * They drive the PURE builders (`buildICS`, `buildCSV`), which is why there is
 * no DOM stubbing here; `downloadICS`/`downloadCSV` add only the Blob + anchor.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import { buildICS, buildCSV, generateRoster } from './auraEngine';

// A fixed DTSTAMP instant, so ICS output is byte-for-byte deterministic.
const NOW = new Date(Date.UTC(2026, 5, 7, 9, 15, 30)); // 2026-06-07T09:15:30Z
const NOW_ICS = '20260607T091530Z';

/** One day, one shift, in the shape `generateRoster` produces. */
const oneShiftRoster = (overrides = {}) => ({
    '2026-02-02': [
        {
            task: 'EFT',
            lead: 'Brandon',
            coLead: 'Ying Xian',
            staff: 'Lead: Brandon, Co: Ying Xian',
            category: 'CORE',
            week: 1,
            ...overrides,
        },
    ],
});

const lines = (ics) => ics.split('\r\n');
// CSV rows are CRLF-joined per RFC 4180, and the file opens with a UTF-8 BOM
// so Excel on Windows decodes non-ASCII staff names. Strip the BOM here so
// row-level assertions stay readable; its presence is pinned by its own test.
const csvRows = (csv) => csv.replace(/^\ufeff/, '').split('\r\n');

describe('buildICS — RFC 5545 correctness (audit M6)', () => {
    it('escapes the comma the 6 May display-string refactor introduced', () => {
        const ics = buildICS(oneShiftRoster(), { now: NOW });

        // The regression itself: this exact line used to ship unescaped.
        expect(ics).not.toContain('SUMMARY:[EFT] Lead: Brandon, Co: Ying Xian');
        expect(ics).toContain('SUMMARY:[EFT] Lead: Brandon\\, Co: Ying Xian');
    });

    it('escapes semicolons, backslashes and newlines in TEXT properties', () => {
        const ics = buildICS(
            oneShiftRoster({
                task: 'A;B',
                staff: 'Lead: C\\D',
                category: 'Two\nLines',
            }),
            { now: NOW },
        );

        expect(ics).toContain('SUMMARY:[A\\;B] Lead: C\\\\D');
        expect(ics).toContain('DESCRIPTION:Week 1 - Two\\nLines');
        // A literal newline inside a property value would break the file.
        expect(lines(ics).every((line) => !line.includes('\n'))).toBe(true);
    });

    it('emits a UID and a DTSTAMP on every VEVENT', () => {
        const ics = buildICS(generateRoster({
            staff: ['Ann', 'Bob', 'Cal'],
            tasks: ['EFT', 'Clinic'],
            startDate: '2026-02-02',
            weeks: 2,
        }), { now: NOW });

        const eventCount = lines(ics).filter((line) => line === 'BEGIN:VEVENT').length;
        const uids = lines(ics).filter((line) => line.startsWith('UID:'));
        const stamps = lines(ics).filter((line) => line.startsWith('DTSTAMP:'));

        expect(eventCount).toBeGreaterThan(0);
        expect(uids).toHaveLength(eventCount);
        expect(stamps).toHaveLength(eventCount);
        expect(new Set(uids).size).toBe(eventCount); // unique per event
        expect(uids.every((line) => line.endsWith('@nexus-aura-roster'))).toBe(true);
    });

    it('uses the injected `now` for DTSTAMP, formatted as UTC', () => {
        const ics = buildICS(oneShiftRoster(), { now: NOW });
        expect(ics).toContain(`DTSTAMP:${NOW_ICS}`);
        expect(lines(ics)).toContain(`DTSTAMP:${NOW_ICS}`);
    });

    it('defaults DTSTAMP to now when no `now` is supplied', () => {
        const ics = buildICS(oneShiftRoster());
        const stamp = lines(ics).find((line) => line.startsWith('DTSTAMP:'));
        expect(stamp).toMatch(/^DTSTAMP:\d{8}T\d{6}Z$/);
    });

    it('keeps UIDs IDENTICAL across two builds of the same roster', () => {
        // The whole point of M6.2: a re-export must UPDATE the calendar, not
        // duplicate it. Two builds hours apart differ only in DTSTAMP.
        const roster = generateRoster({
            staff: ['Ann', 'Bob'],
            tasks: ['EFT'],
            startDate: '2026-02-02',
            weeks: 1,
        });

        const first = buildICS(roster, { now: NOW });
        const second = buildICS(roster, { now: new Date(Date.UTC(2026, 7, 1, 3, 0, 0)) });

        const uidsOf = (ics) => lines(ics).filter((line) => line.startsWith('UID:'));
        expect(uidsOf(second)).toEqual(uidsOf(first));
        expect(uidsOf(first).length).toBeGreaterThan(0);

        // …and the UID is derived from the roster, not from build order.
        expect(uidsOf(first)).toContain('UID:2026-02-02-eft@nexus-aura-roster');
    });

    it('a re-generated roster with the same shape re-uses the same UIDs', () => {
        const config = { staff: ['Ann', 'Bob'], tasks: ['EFT'], startDate: '2026-02-02', weeks: 1 };
        const uidsOf = (roster) =>
            lines(buildICS(roster, { now: NOW })).filter((line) => line.startsWith('UID:'));

        expect(uidsOf(generateRoster(config))).toEqual(uidsOf(generateRoster(config)));
    });

    it('folds content lines longer than 75 characters (§3.1)', () => {
        const ics = buildICS(
            oneShiftRoster({
                task: 'Extended Multidisciplinary Follow-up Telehealth Clinic Review Session',
                staff: 'Lead: Bartholomew Fitzgerald-Montgomery, Co: Ying Xian Wong-Abdullah',
            }),
            { now: NOW },
        );

        expect(lines(ics).every((line) => Array.from(line).length <= 75)).toBe(true);

        // Continuations are CRLF + exactly one space, and unfolding restores the
        // original value.
        const summaryIndex = lines(ics).findIndex((line) => line.startsWith('SUMMARY:'));
        const tail = lines(ics).slice(summaryIndex + 1);
        expect(tail[0].startsWith(' ')).toBe(true); // at least one continuation line
        expect(tail[0].startsWith('  ')).toBe(false); // exactly one space of prefix

        const unfolded = ics.replace(/\r\n /g, '');
        expect(unfolded).toContain(
            'SUMMARY:[Extended Multidisciplinary Follow-up Telehealth Clinic Review Session] ' +
                'Lead: Bartholomew Fitzgerald-Montgomery\\, Co: Ying Xian Wong-Abdullah',
        );
    });

    it('short lines are left unfolded', () => {
        const ics = buildICS(oneShiftRoster(), { now: NOW });
        expect(lines(ics).some((line) => line.startsWith(' '))).toBe(false);
    });

    it('keeps CRLF line endings and terminates the final line', () => {
        const ics = buildICS(oneShiftRoster(), { now: NOW });
        expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
        expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
        expect(ics).not.toMatch(/[^\r]\n/); // no bare LF anywhere
    });

    it('never writes "undefined" for a shift with no coLead and no week (M7)', () => {
        // Exactly the demo transform's shape: { staff, lead, task, category }.
        const ics = buildICS(
            {
                '2026-02-17': [
                    { task: 'AM Clinic (Ortho)', lead: 'Steve', staff: 'Lead: Steve', category: 'Clinical' },
                ],
            },
            { now: NOW },
        );

        expect(ics).not.toMatch(/undefined/);
        expect(ics).toContain('SUMMARY:[AM Clinic (Ortho)] Lead: Steve');
        expect(ics).toContain('DESCRIPTION:Clinical'); // not `Week undefined - Clinical`
    });

    it('an entirely empty shift still produces a well-formed event', () => {
        const ics = buildICS({ '2026-02-02': [{}] }, { now: NOW });
        expect(ics).not.toMatch(/undefined/);
        expect(ics).toContain('UID:2026-02-02-shift@nexus-aura-roster');
        expect(ics).toContain('DESCRIPTION:');
    });

    it('disambiguates a repeated task name within one day', () => {
        const ics = buildICS(
            {
                '2026-02-02': [
                    { task: 'EFT', lead: 'Ann', staff: 'Lead: Ann', category: 'CORE', week: 1 },
                    { task: 'EFT', lead: 'Bob', staff: 'Lead: Bob', category: 'CORE', week: 1 },
                ],
            },
            { now: NOW },
        );

        const uids = lines(ics).filter((line) => line.startsWith('UID:'));
        expect(uids).toEqual([
            'UID:2026-02-02-eft@nexus-aura-roster',
            'UID:2026-02-02-eft-2@nexus-aura-roster',
        ]);
    });

    it('an empty roster is still a valid, event-free calendar', () => {
        const ics = buildICS({}, { now: NOW });
        expect(ics).toBe(
            'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//AURA//Roster//EN\r\nCALSCALE:GREGORIAN\r\nEND:VCALENDAR\r\n',
        );
    });
});

describe('buildCSV — quoting and formula injection (audit M10, M7)', () => {
    it('keeps the header row and column order unchanged', () => {
        expect(csvRows(buildCSV(oneShiftRoster()))[0]).toBe('Date,Week,Task,Category,Lead,Co-Lead');
    });

    it('quotes a task name containing a comma instead of shifting every column', () => {
        const csv = buildCSV(oneShiftRoster({ task: 'Clinic, Ortho' }));
        const row = csvRows(csv)[1];

        expect(row).toBe('2026-02-02,1,"Clinic, Ortho",CORE,Brandon,Ying Xian');
        expect(row.split(',')).toHaveLength(7); // naive split still sees 7 — hence the quotes
    });

    it('doubles internal double quotes', () => {
        const csv = buildCSV(oneShiftRoster({ task: 'The "Big" Clinic' }));
        expect(csvRows(csv)[1]).toBe('2026-02-02,1,"The ""Big"" Clinic",CORE,Brandon,Ying Xian');
    });

    it('quotes a field containing a newline', () => {
        const csv = buildCSV(oneShiftRoster({ task: 'Clinic\nOverflow' }));
        expect(csv).toContain('"Clinic\nOverflow"');
    });

    it('neutralises a task name that Excel would evaluate as a formula', () => {
        expect(csvRows(buildCSV(oneShiftRoster({ task: '=SUM(A1)' })))[1]).toBe(
            "2026-02-02,1,'=SUM(A1),CORE,Brandon,Ying Xian",
        );
    });

    it('neutralises the +, - and @ formula prefixes too', () => {
        const taskCell = (task) => csvRows(buildCSV(oneShiftRoster({ task })))[1].split(',')[2];

        // Apostrophes are not CSV-special, so this needs the guard but no quoting.
        expect(taskCell("+cmd|'/c calc'!A1")).toBe("'+cmd|'/c calc'!A1");
        expect(taskCell('-2+3')).toBe("'-2+3");
        expect(taskCell('@SUM(A1)')).toBe("'@SUM(A1)");
    });

    it('guards a formula BEFORE quoting, so the apostrophe stays inside the quotes', () => {
        const csv = buildCSV(oneShiftRoster({ task: '=HYPERLINK("http://x","OK")' }));
        expect(csvRows(csv)[1]).toBe(
            '2026-02-02,1,"\'=HYPERLINK(""http://x"",""OK"")",CORE,Brandon,Ying Xian',
        );
    });

    it('leaves an ordinary field untouched', () => {
        expect(csvRows(buildCSV(oneShiftRoster()))[1]).toBe(
            '2026-02-02,1,EFT,CORE,Brandon,Ying Xian',
        );
    });

    it('never writes "undefined" for a shift with no coLead and no week (M7)', () => {
        const csv = buildCSV({
            '2026-02-17': [
                { task: 'AM Clinic (Ortho)', lead: 'Steve', staff: 'Lead: Steve', category: 'Clinical' },
            ],
        });

        expect(csv).not.toMatch(/undefined/);
        expect(csvRows(csv)[1]).toBe('2026-02-17,,AM Clinic (Ortho),Clinical,Steve,');
    });

    it('sorts rows by date, as before', () => {
        const csv = buildCSV({
            '2026-02-04': [{ task: 'B', lead: 'Bob', category: 'CORE', week: 1 }],
            '2026-02-02': [{ task: 'A', lead: 'Ann', category: 'CORE', week: 1 }],
        });

        expect(csvRows(csv).slice(1).map((row) => row.split(',')[0])).toEqual([
            '2026-02-02',
            '2026-02-04',
        ]);
    });
});

describe('both builders against a real generateRoster roster', () => {
    const config = {
        staff: ['Brandon', 'Ying Xian', 'Steve', 'Ann'],
        tasks: ['EFT', 'Clinic', 'Admin'],
        startDate: '2026-02-02',
        weeks: 4,
    };

    const roster = generateRoster(config);
    const shiftCount = Object.values(roster).reduce((total, shifts) => total + shifts.length, 0);

    it('round-trips every shift into exactly one CSV row', () => {
        const rows = csvRows(buildCSV(roster));
        expect(rows).toHaveLength(shiftCount + 1); // + header
        expect(rows.slice(1).every((row) => row.startsWith('2026-'))).toBe(true);
    });

    it('round-trips every shift into exactly one VEVENT, each with UID + DTSTAMP', () => {
        const ics = buildICS(roster, { now: NOW });
        const icsLines = lines(ics);

        expect(icsLines.filter((line) => line === 'BEGIN:VEVENT')).toHaveLength(shiftCount);
        expect(icsLines.filter((line) => line === 'END:VEVENT')).toHaveLength(shiftCount);
        expect(icsLines.filter((line) => line.startsWith('UID:'))).toHaveLength(shiftCount);
        expect(new Set(icsLines.filter((line) => line.startsWith('UID:'))).size).toBe(shiftCount);
        expect(icsLines.filter((line) => line === `DTSTAMP:${NOW_ICS}`)).toHaveLength(shiftCount);
    });

    it('emits no "undefined" and no unescaped comma in either format', () => {
        const ics = buildICS(roster, { now: NOW });

        expect(ics).not.toMatch(/undefined/);
        expect(buildCSV(roster)).not.toMatch(/undefined/);

        for (const line of lines(ics).filter((line) => line.startsWith('SUMMARY:'))) {
            // Every remaining comma must be preceded by a backslash.
            expect(line.replace(/\\,/g, '')).not.toContain(',');
        }
    });
});

describe('buildCSV — encoding envelope (P5 follow-up: RFC 4180 + Excel)', () => {
    it('opens with a UTF-8 BOM so Excel on Windows decodes non-ASCII names', () => {
        expect(buildCSV(oneShiftRoster()).charCodeAt(0)).toBe(0xfeff);
    });

    it('joins rows with CRLF per RFC 4180, not bare LF', () => {
        const csv = buildCSV(generateRoster({
            staff: ['A', 'B'], tasks: ['T1'], startDate: '2026-02-02', weeks: 1,
        }));
        expect(csv).toContain('\r\n');
        // No orphan LF: every LF is preceded by CR.
        expect(csv.replace(/\r\n/g, '')).not.toContain('\n');
    });
});
