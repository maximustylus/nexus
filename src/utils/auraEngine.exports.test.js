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
 * EXTENDED for MULTI-ASSIGNEE SHIFTS (v1.8.2). `rosterEngineV2` can put three or
 * more people on one shift — a `coLeads: 2` pairing group, or a `slots:` trio for
 * the embryologists' weekend service — and both exporters used to render exactly
 * two of them, which is the limit `mockData.js` was written around: *"the extra
 * people go in `assignees`, which `downloadCSV`/`downloadICS` do not read, so the
 * exports would be silently incomplete."* Both now read `assignees`.
 *
 * The compatibility contract those new tests defend, stated once:
 *
 *   • CSV — the first SIX columns are byte-identical to what they were. The whole
 *     change is a SEVENTH appended column, `Assignees`.
 *   • ICS — a one- or two-person SUMMARY is byte-identical. Only three-or-more
 *     gets the new `Lead: A, Co: B, Also: C` form.
 *   • Both — UIDs, DTSTAMP, folding, the BOM, CRLF and the formula guard are
 *     untouched, and neither format may ever contain the string `undefined`.
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

/**
 * One day, one THREE-PERSON shift, in the exact shape `generateRosterV2` emits
 * for a `slots:` trio: `lead` is the highest grade, `coLead` the second
 * assignee, `staff` still the two-name display string, and `assignees` carrying
 * everybody lead-first.
 *
 * Transcribed rather than generated, on purpose — this file tests the EXPORTERS,
 * so importing `rosterEngineV2` would couple these pins to a second engine's
 * scheduling decisions (which clinician leads on which date) and make an
 * exporter regression indistinguishable from an engine change.
 */
const trioRoster = (overrides = {}) => ({
    '2026-09-12': [
        {
            task: 'Weekend witnessing',
            lead: 'Priya',
            coLead: 'Sanjay',
            staff: 'Lead: Priya, Co: Sanjay',
            category: 'CORE',
            week: 1,
            assignees: ['Priya', 'Sanjay', 'Ravi'],
            ...overrides,
        },
    ],
});

/** The SUMMARY lines of an ICS, unfolded, so a long value can be read whole. */
const summaries = (ics) =>
    ics
        .replace(/\r\n /g, '')
        .split('\r\n')
        .filter((line) => line.startsWith('SUMMARY:'));

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
    it('keeps the six original columns, in order, and appends Assignees', () => {
        // CHANGED at v1.8.2: `Assignees` appended. The first six are asserted
        // separately so a future reordering of them fails loudly here.
        const header = csvRows(buildCSV(oneShiftRoster()))[0];
        expect(header.startsWith('Date,Week,Task,Category,Lead,Co-Lead')).toBe(true);
        expect(header).toBe('Date,Week,Task,Category,Lead,Co-Lead,Assignees');
    });

    it('quotes a task name containing a comma instead of shifting every column', () => {
        const csv = buildCSV(oneShiftRoster({ task: 'Clinic, Ortho' }));
        const row = csvRows(csv)[1];

        expect(row).toBe('2026-02-02,1,"Clinic, Ortho",CORE,Brandon,Ying Xian,Brandon; Ying Xian');
        expect(row.split(',')).toHaveLength(8); // naive split still over-counts — hence the quotes
    });

    it('doubles internal double quotes', () => {
        const csv = buildCSV(oneShiftRoster({ task: 'The "Big" Clinic' }));
        expect(csvRows(csv)[1]).toBe(
            '2026-02-02,1,"The ""Big"" Clinic",CORE,Brandon,Ying Xian,Brandon; Ying Xian',
        );
    });

    it('quotes a field containing a newline', () => {
        const csv = buildCSV(oneShiftRoster({ task: 'Clinic\nOverflow' }));
        expect(csv).toContain('"Clinic\nOverflow"');
    });

    it('neutralises a task name that Excel would evaluate as a formula', () => {
        expect(csvRows(buildCSV(oneShiftRoster({ task: '=SUM(A1)' })))[1]).toBe(
            "2026-02-02,1,'=SUM(A1),CORE,Brandon,Ying Xian,Brandon; Ying Xian",
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
            '2026-02-02,1,"\'=HYPERLINK(""http://x"",""OK"")",CORE,Brandon,Ying Xian,Brandon; Ying Xian',
        );
    });

    it('leaves an ordinary field untouched', () => {
        expect(csvRows(buildCSV(oneShiftRoster()))[1]).toBe(
            '2026-02-02,1,EFT,CORE,Brandon,Ying Xian,Brandon; Ying Xian',
        );
    });

    it('never writes "undefined" for a shift with no coLead and no week (M7)', () => {
        const csv = buildCSV({
            '2026-02-17': [
                { task: 'AM Clinic (Ortho)', lead: 'Steve', staff: 'Lead: Steve', category: 'Clinical' },
            ],
        });

        expect(csv).not.toMatch(/undefined/);
        // Co-Lead stays empty and Assignees holds the one person there is.
        expect(csvRows(csv)[1]).toBe('2026-02-17,,AM Clinic (Ortho),Clinical,Steve,,Steve');
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

/**
 * Minimal RFC 4180 reader. Present so the claim "properly quoted" is MEASURED
 * rather than asserted: a naive `split(',')` cannot tell a quoted comma from a
 * column break, which is exactly the failure M10 fixed and exactly the failure a
 * semicolon-separated list of names containing commas could reintroduce.
 */
const parseCSVRow = (row) => {
    const fields = [];
    let field = '';
    let quoted = false;

    for (let i = 0; i < row.length; i += 1) {
        const ch = row[i];
        if (quoted) {
            if (ch !== '"') field += ch;
            else if (row[i + 1] === '"') {
                field += '"';
                i += 1;
            } else quoted = false;
        } else if (ch === '"') quoted = true;
        else if (ch === ',') {
            fields.push(field);
            field = '';
        } else field += ch;
    }

    fields.push(field);
    return fields;
};

describe('buildICS — three or more assignees (multi-slot shifts)', () => {
    it('a two-person SUMMARY is byte-identical to what it always was', () => {
        // The compatibility half of the feature. If this moves, every roster
        // already imported into somebody's Outlook is re-imported as new events.
        expect(summaries(buildICS(oneShiftRoster(), { now: NOW }))).toEqual([
            'SUMMARY:[EFT] Lead: Brandon\\, Co: Ying Xian',
        ]);
    });

    it('a one-person SUMMARY is byte-identical too', () => {
        const ics = buildICS(
            { '2026-02-17': [{ task: 'AM Clinic', lead: 'Steve', staff: 'Lead: Steve' }] },
            { now: NOW },
        );
        expect(summaries(ics)).toEqual(['SUMMARY:[AM Clinic] Lead: Steve']);
    });

    it('a two-person SUMMARY uses `staff` VERBATIM, even where it disagrees', () => {
        // The byte-compatibility rule, stated as its own pin: for one or two
        // people the SUMMARY is `shift.staff` and is not re-derived from
        // `lead`/`coLead`/`assignees`. A live document whose display string was
        // hand-corrected must keep exporting the hand-corrected string.
        const ics = buildICS(
            oneShiftRoster({ staff: 'Lead: Brandon (acting), Co: Ying Xian' }),
            { now: NOW },
        );
        expect(summaries(ics)).toEqual([
            'SUMMARY:[EFT] Lead: Brandon (acting)\\, Co: Ying Xian',
        ]);
    });

    it('names every assignee of a three-person shift', () => {
        // Was `SUMMARY:[Weekend witnessing] Lead: Priya\, Co: Sanjay` — Ravi did
        // not appear anywhere in the file.
        expect(summaries(buildICS(trioRoster(), { now: NOW }))).toEqual([
            'SUMMARY:[Weekend witnessing] Lead: Priya\\, Co: Sanjay\\, Also: Ravi',
        ]);
    });

    it('names all four of a four-person shift', () => {
        const ics = buildICS(
            trioRoster({ assignees: ['Priya', 'Sanjay', 'Ravi', 'Mei'] }),
            { now: NOW },
        );
        expect(summaries(ics)).toEqual([
            'SUMMARY:[Weekend witnessing] Lead: Priya\\, Co: Sanjay\\, Also: Ravi\\, Mei',
        ]);
    });

    it('escapes EVERY comma in a multi-assignee SUMMARY, including inside a name', () => {
        // Two sources of commas now: the separators this convention adds, and a
        // surname-first name. RFC 5545 §3.3.11 does not care which — an
        // unescaped one makes SUMMARY multi-valued and Outlook truncates there.
        const ics = buildICS(
            {
                '2026-02-02': [{
                    task: 'EFT',
                    lead: 'Wong, Ying Xian',
                    coLead: 'Bob',
                    staff: 'Lead: Wong, Ying Xian, Co: Bob',
                    category: 'CORE',
                    week: 1,
                    assignees: ['Wong, Ying Xian', 'Bob', 'Tan, Cal'],
                }],
            },
            { now: NOW },
        );

        expect(summaries(ics)).toEqual([
            'SUMMARY:[EFT] Lead: Wong\\, Ying Xian\\, Co: Bob\\, Also: Tan\\, Cal',
        ]);
        // Measured rather than eyeballed: strip the escaped commas and none may
        // remain anywhere in the line.
        for (const line of summaries(ics)) {
            expect(line.replace(/\\,/g, '')).not.toContain(',');
        }
    });

    it('keeps UIDs IDENTICAL across two builds of a multi-assignee roster', () => {
        const roster = trioRoster();
        const uidsOf = (ics) => lines(ics).filter((line) => line.startsWith('UID:'));

        const first = buildICS(roster, { now: NOW });
        const second = buildICS(roster, { now: new Date(Date.UTC(2026, 7, 1, 3, 0, 0)) });

        expect(uidsOf(second)).toEqual(uidsOf(first));
        expect(uidsOf(first)).toEqual(['UID:2026-09-12-weekend-witnessing@nexus-aura-roster']);
        // …and the ONLY difference between the two builds is the DTSTAMP.
        expect(second.replace(/^DTSTAMP:.*$/gm, '')).toBe(first.replace(/^DTSTAMP:.*$/gm, ''));
    });

    it('still honours the injected `now` for a multi-assignee roster', () => {
        expect(buildICS(trioRoster(), { now: NOW })).toContain(`DTSTAMP:${NOW_ICS}`);
    });

    it('never writes "undefined" when `assignees` has gaps in it', () => {
        // A hand-edited or partially-migrated document: holes, nulls and blanks
        // in the array. They are skipped, never stringified (M7's rule extended
        // to the new field).
        const ics = buildICS(
            trioRoster({ assignees: ['Priya', undefined, 'Ravi', null, '', '  ', 'Mei'] }),
            { now: NOW },
        );

        expect(ics).not.toMatch(/undefined/);
        expect(summaries(ics)).toEqual([
            'SUMMARY:[Weekend witnessing] Lead: Priya\\, Co: Sanjay\\, Also: Ravi\\, Mei',
        ]);
    });

    it('de-duplicates: nobody is listed twice, however the shift records them', () => {
        const ics = buildICS(
            trioRoster({ assignees: ['Priya', 'Priya', 'Sanjay', 'Ravi', 'Sanjay'] }),
            { now: NOW },
        );
        expect(summaries(ics)).toEqual([
            'SUMMARY:[Weekend witnessing] Lead: Priya\\, Co: Sanjay\\, Also: Ravi',
        ]);
    });

    it('a shift recorded ONLY in `assignees` still names its people', () => {
        // Deliberate change of behaviour on a shape neither engine emits: this
        // used to export `SUMMARY:[EFT]` with nobody on it at all.
        const ics = buildICS({ '2026-02-02': [{ task: 'EFT', assignees: ['Ann', 'Bob', 'Cal'] }] }, { now: NOW });
        expect(summaries(ics)).toEqual(['SUMMARY:[EFT] Lead: Ann\\, Co: Bob\\, Also: Cal']);
    });

    it('reads `lead`/`coLead` FIRST, so a swap-stale `assignees` cannot mislead', () => {
        // ledger 2d.1: an accepted swap rewrites `lead` and leaves `assignees`
        // naming the clinician who handed the duty over. The current holders lead
        // the list and the stale name trails — four names for three duties, which
        // is visibly odd rather than quietly wrong.
        const ics = buildICS(
            trioRoster({ lead: 'Xavier', staff: 'Lead: Xavier, Co: Sanjay' }),
            { now: NOW },
        );

        expect(summaries(ics)).toEqual([
            'SUMMARY:[Weekend witnessing] Lead: Xavier\\, Co: Sanjay\\, Also: Priya\\, Ravi',
        ]);
    });

    it('folds a long multi-assignee SUMMARY, and it unfolds back whole', () => {
        const ics = buildICS(
            trioRoster({
                lead: 'Bartholomew Fitzgerald-Montgomery',
                coLead: 'Ying Xian Wong-Abdullah',
                staff: 'Lead: Bartholomew Fitzgerald-Montgomery, Co: Ying Xian Wong-Abdullah',
                assignees: [
                    'Bartholomew Fitzgerald-Montgomery',
                    'Ying Xian Wong-Abdullah',
                    'Ravindranath Balasubramaniam',
                ],
            }),
            { now: NOW },
        );

        expect(lines(ics).every((line) => Array.from(line).length <= 75)).toBe(true);
        expect(summaries(ics)).toEqual([
            'SUMMARY:[Weekend witnessing] Lead: Bartholomew Fitzgerald-Montgomery\\, ' +
                'Co: Ying Xian Wong-Abdullah\\, Also: Ravindranath Balasubramaniam',
        ]);
    });
});

describe('buildCSV — the Assignees column (multi-slot shifts)', () => {
    it('a two-person row is unchanged apart from the appended cell', () => {
        const row = csvRows(buildCSV(oneShiftRoster()))[1];
        const wasBefore = '2026-02-02,1,EFT,CORE,Brandon,Ying Xian';

        expect(row.startsWith(`${wasBefore},`)).toBe(true);
        expect(row.slice(wasBefore.length + 1)).toBe('Brandon; Ying Xian');
    });

    it('every row of a real roster keeps its first six fields and gains one', () => {
        const roster = generateRoster({
            staff: ['Brandon', 'Ying Xian', 'Derlinder', 'Fadzlynn'],
            tasks: ['EFT', 'IPT+SKG'],
            startDate: '2026-02-02',
            weeks: 2,
        });

        const allRows = csvRows(buildCSV(roster));
        const rows = allRows.slice(1);
        expect(rows.length).toBeGreaterThan(0);

        // The header must be exactly as wide as the rows beneath it. A header
        // that is one column narrower than its data is a real CSV defect and
        // nothing else in this file would notice it.
        expect(parseCSVRow(allRows[0])).toHaveLength(7);

        const flat = Object.entries(roster).sort(([a], [b]) => (a < b ? -1 : 1))
            .flatMap(([date, shifts]) => shifts.map((shift) => ({ date, shift })));

        rows.forEach((row, i) => {
            const fields = parseCSVRow(row);
            const { date, shift } = flat[i];

            expect(fields).toHaveLength(7);
            // The six that must not have moved, read off the shift itself.
            expect(fields.slice(0, 6)).toEqual([
                date, String(shift.week), shift.task, shift.category, shift.lead, shift.coLead,
            ]);
            // The seventh, which is the whole change.
            expect(fields[6].split('; ')).toEqual([shift.lead, shift.coLead]);
        });
    });

    it('names every assignee of a three-person shift, semicolon-separated', () => {
        // Was `…,CORE,Priya,Sanjay` — Ravi appeared in no column.
        expect(csvRows(buildCSV(trioRoster()))[1]).toBe(
            '2026-09-12,1,Weekend witnessing,CORE,Priya,Sanjay,Priya; Sanjay; Ravi',
        );
    });

    it('Lead and Co-Lead still hold exactly the first two, never the third', () => {
        const fields = parseCSVRow(csvRows(buildCSV(trioRoster()))[1]);
        expect(fields[4]).toBe('Priya');
        expect(fields[5]).toBe('Sanjay');
        expect(fields[5]).not.toContain('Ravi');
        expect(fields[6]).toContain('Ravi');
    });

    it('a comma inside a name survives the round trip through the new cell', () => {
        // The reason the separator is `;` and the reason the cell is quoted. Read
        // back with a real RFC 4180 parser, the three names come out intact.
        const csv = buildCSV({
            '2026-02-02': [{
                task: 'EFT',
                lead: 'Wong, Ying Xian',
                coLead: 'Bob',
                category: 'CORE',
                week: 1,
                assignees: ['Wong, Ying Xian', 'Bob', 'Tan, Cal'],
            }],
        });

        const row = csvRows(csv)[1];
        expect(row).toBe(
            '2026-02-02,1,EFT,CORE,"Wong, Ying Xian",Bob,"Wong, Ying Xian; Bob; Tan, Cal"',
        );

        const fields = parseCSVRow(row);
        expect(fields).toHaveLength(7);
        expect(fields[6].split('; ')).toEqual(['Wong, Ying Xian', 'Bob', 'Tan, Cal']);
    });

    it('leaves the Assignees cell unquoted when it needs no quoting', () => {
        expect(csvRows(buildCSV(trioRoster()))[1]).not.toContain('"');
    });

    it('applies the formula guard to the Assignees cell too (M10)', () => {
        // A cell is a formula to Excel only when the CELL begins with =/+/-/@,
        // so guarding the assembled cell is both necessary and sufficient — a
        // `=Bob` sitting mid-list is inert and is deliberately left alone.
        const csv = buildCSV(trioRoster({ lead: '=Ann', staff: 'Lead: =Ann, Co: Sanjay' }));
        expect(parseCSVRow(csvRows(csv)[1])[6]).toBe("'=Ann; Sanjay; Priya; Ravi");
    });

    it('never writes "undefined" when `assignees` has gaps in it', () => {
        const csv = buildCSV(trioRoster({ assignees: ['Priya', undefined, null, '', 'Ravi'] }));
        expect(csv).not.toMatch(/undefined/);
        expect(parseCSVRow(csvRows(csv)[1])[6]).toBe('Priya; Sanjay; Ravi');
    });

    it('never writes "undefined" for a shift with no coLead and no assignees at all', () => {
        const csv = buildCSV({ '2026-02-02': [{ task: 'EFT', lead: 'Steve' }] });
        expect(csv).not.toMatch(/undefined/);
        expect(csvRows(csv)[1]).toBe('2026-02-02,,EFT,,Steve,,Steve');
    });

    it('an entirely empty shift leaves the new cell empty, not "undefined"', () => {
        const csv = buildCSV({ '2026-02-02': [{}] });
        expect(csv).not.toMatch(/undefined/);
        expect(csvRows(csv)[1]).toBe('2026-02-02,,,,,,');
        expect(parseCSVRow(csvRows(csv)[1])).toHaveLength(7);
    });

    it('a legacy bare-`staff` shift leaves all three people columns empty (ledger 2d.4)', () => {
        // Pre-6-May documents held identity in `staff`. Identity is never parsed
        // back out of a display string, so the new column inherits the empty Lead
        // cell rather than guessing — pinned so the decision is visible.
        const csv = buildCSV({ '2026-02-17': [{ task: 'EFT', staff: 'Brandon', category: 'CORE', week: 1 }] });
        expect(csvRows(csv)[1]).toBe('2026-02-17,1,EFT,CORE,,,');
    });

    it('reads `lead`/`coLead` FIRST, so a swap-stale `assignees` cannot mislead', () => {
        const csv = buildCSV(trioRoster({ lead: 'Xavier', staff: 'Lead: Xavier, Co: Sanjay' }));
        expect(parseCSVRow(csvRows(csv)[1])[6]).toBe('Xavier; Sanjay; Priya; Ravi');
    });

    it('a shift recorded ONLY in `assignees` fills the new cell', () => {
        const csv = buildCSV({ '2026-02-02': [{ task: 'EFT', assignees: ['Ann', 'Bob', 'Cal'] }] });
        expect(csvRows(csv)[1]).toBe('2026-02-02,,EFT,,,,Ann; Bob; Cal');
    });

    it('keeps the BOM and CRLF envelope with the new column in place', () => {
        const csv = buildCSV(trioRoster());
        expect(csv.charCodeAt(0)).toBe(0xfeff);
        expect(csv).toContain('\r\n');
        expect(csv.replace(/\r\n/g, '')).not.toContain('\n');
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
