// scripts/roster-scaling.mjs
//
// The scaling comparison between the two roster engines, for the record.
//
//   node scripts/roster-scaling.mjs
//
// Measures BOTH engines on the same configurations and prints the two numbers
// that describe the old engine's failure modes:
//
//   * the most duties any one person holds on any one day, and
//   * how many of the staff pool are never rostered at all.
//
// This is the executable form of the table in `rosterEngineV2.js`'s header
// comment and in the `SCALING TABLE` suite of `rosterEngineV2.test.js`. It reads
// the real engines — nothing here is hand-derived — so if either engine changes,
// re-running this is how the table gets corrected.
//
// V1 (`generateRoster`) note: it appends its own hardcoded `VC (PM)` and
// `VC (AM)` duties on Tuesdays and Saturdays regardless of the task list, so its
// per-day peak includes those. The "core only" column strips them, which is the
// like-for-like comparison against V2. Both are shown because the number a
// clinician would actually live with is the first one.

import { generateRoster } from '../src/utils/auraEngine.js';
import { generateRosterV2, measureRosterLoad } from '../src/utils/rosterEngineV2.js';

const START_DATE = '2026-02-02'; // a Monday
const WEEKS = 4;

const CASES = [[4, 4], [12, 8], [9, 6], [6, 10], [20, 4]];

const namePool = (n) =>
    Array.from({ length: n }, (_, i) => `S${String(i + 1).padStart(2, '0')}`);

const taskPool = (n) =>
    Array.from({ length: n }, (_, i) => `T${String(i + 1).padStart(2, '0')}`);

/** V1's roster with its hardcoded VC duties removed. */
const coreOnly = (roster) => {
    const out = {};
    for (const [dateKey, shifts] of Object.entries(roster)) {
        const core = shifts.filter((shift) => shift.category === 'CORE');
        if (core.length > 0) out[dateKey] = core;
    }
    return out;
};

const rows = [];

for (const [staffCount, taskCount] of CASES) {
    const staff = namePool(staffCount);
    const tasks = taskPool(taskCount);

    const v1Roster = generateRoster({ staff, tasks, startDate: START_DATE, weeks: WEEKS });
    const v1 = measureRosterLoad(v1Roster, staff);
    const v1Core = measureRosterLoad(coreOnly(v1Roster), staff);

    const v2Result = generateRosterV2({
        startDate: START_DATE,
        weeks: WEEKS,
        staff: staff.map((name) => ({ name })),
        tasks: tasks.map((name) => ({ name })),
    });
    const v2 = measureRosterLoad(v2Result.roster, staff);

    rows.push({
        size: `${staffCount} / ${taskCount}`,
        v1Max: v1.maxDutiesPerPersonPerDay,
        v1CoreMax: v1Core.maxDutiesPerPersonPerDay,
        v1Idle: `${v1.neverRostered.length} / ${staffCount}`,
        v2Max: v2.maxDutiesPerPersonPerDay,
        v2Idle: `${v2.neverRostered.length} / ${staffCount}`,
        v2Unfilled: v2Result.unfilled.length,
        v2Penalty: v2Result.score.softPenalty,
        v2Hard: v2Result.score.hardViolations,
    });
}

const COLUMNS = [
    ['staff / tasks', 'size'],
    ['V1 max/day', 'v1Max'],
    ['V1 max/day (core only)', 'v1CoreMax'],
    ['V1 never rostered', 'v1Idle'],
    ['V2 max/day', 'v2Max'],
    ['V2 never rostered', 'v2Idle'],
    ['V2 unfilled (reported)', 'v2Unfilled'],
    ['V2 soft penalty', 'v2Penalty'],
    ['V2 hard violations', 'v2Hard'],
];

const widths = COLUMNS.map(([heading, key]) =>
    Math.max(heading.length, ...rows.map((row) => String(row[key]).length)),
);

const line = (cells) =>
    `| ${cells.map((cell, i) => String(cell).padEnd(widths[i])).join(' | ')} |`;

console.log(`\nAURA roster engines — scaling comparison`);
console.log(`startDate ${START_DATE} (Monday), ${WEEKS} weeks, plain Mon–Fri tasks, default rules\n`);
console.log(line(COLUMNS.map(([heading]) => heading)));
console.log(`|${widths.map((w) => '-'.repeat(w + 2)).join('|')}|`);
for (const row of rows) console.log(line(COLUMNS.map(([, key]) => row[key])));

console.log(`
Reading the table:

  V1 at 6 staff / 10 tasks puts one person on ${rows[3].v1Max} duties in a single day
  (${rows[3].v1CoreMax} of them core): the task index wraps around the staff list. Nothing
  in the output says so.

  V1 at 20 staff / 4 tasks never rosters ${rows[4].v1Idle.split(' / ')[0]} of 20 people at all — the
  rotation never reaches past the end of the task list.

  V2 never exceeds the daily limit and never idles anybody. Where it cannot
  meet demand (6 / 10 asks for 400 slots from a team that can hold 240) it
  reports ${rows[3].v2Unfilled} unfilled slots, each with a reason, instead of
  overloading somebody quietly.
`);
