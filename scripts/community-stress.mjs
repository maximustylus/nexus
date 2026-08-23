/**
 * ==============================================================================
 * COMMUNITY PORTAL STRESS HARNESS
 * ==============================================================================
 * Run:  npm run stress:community
 *
 * The counterpart to `scripts/roster-stress.mjs`, for the public screening rather
 * than the rostering engine. Like that one it REPORTS; it applies no pass/fail
 * threshold, because none has been agreed, and a harness that fails the build on a
 * number nobody signed off is a harness people delete.
 *
 * ⚠️ WHY THIS EXISTS SEPARATELY FROM `npm test`. The unit suites check that each
 *    function does what its author meant. This checks what the SYSTEM does with
 *    inputs nobody wrote a case for — a typed sentence instead of a tapped chip, a
 *    collection that holds two kinds of document, a region with one respondent in
 *    it. Every finding below was invisible to 2253 passing tests.
 *
 * Deterministic: seeded LCG, no `Math.random`, no clock. Re-runs are identical.
 */

import { calculateRiskScore } from '../src/utils/scoring.js';
import { toSector, POSTAL_SECTORS } from '../src/utils/singapore/postalSectors.js';
import { servicesForSector, clusterForSector } from '../src/utils/singapore/communityServices.js';
import * as CF from '../src/utils/clinicalFlags.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildInsights, MIN_CELL, MIN_COUNT, BAND } = require('../functions/insights.cjs');

const SEED = Number(process.argv.find((a) => a.startsWith('--seed='))?.split('=')[1] ?? 20260822);
let seedState = SEED >>> 0;
const rnd = () => (seedState = (seedState * 1664525 + 1013904223) >>> 0) / 4294967296;

const findings = [];
const flag = (id, what, detail) => findings.push({ id, what, detail });
const H = (t) => console.log(`\n══ ${t} ${'═'.repeat(Math.max(0, 62 - t.length))}`);
const pad = (s, n) => String(s).padEnd(n);

// ─────────────────────────────────────────────────────────────────────────────
H('A. POSTAL COVERAGE — all of Singapore, and the CP19 traps');

const sectors = Object.keys(POSTAL_SECTORS);
let malformed = 0;
for (const sec of sectors) {
    for (const form of [`${sec}0000`, `S${sec}0000`, ` ${sec}0000 `, `${sec}00-00`, `${sec} 00 00`]) {
        if (toSector(form) !== sec) { malformed += 1; flag('P1', 'a live sector failed to parse', `${JSON.stringify(form)} → ${toSector(form)}`); }
    }
}
// `CP19` was a LABEL parsing as a postal code: 'North (e.g. 73, 75)' → '7375' → '73'.
const TRAPS = ['North (e.g. 73, 75)', 'Woodlands 73', 'District 25', 'Sector 73', '7', '740000', '830000'];
const trapped = TRAPS.filter((t) => toSector(t) !== null);
let strayed = 0;
for (let i = 0; i < 20000; i += 1) {
    const len = 1 + Math.floor(rnd() * 9);
    const str = Array.from({ length: len }, () => String(Math.floor(rnd() * 10))).join('');
    const got = toSector(str);
    if (got !== null && !(got in POSTAL_SECTORS)) { strayed += 1; flag('P2', 'toSector returned a sector outside the table', `${str} → ${got}`); }
}
console.log(`  ${sectors.length} sectors × 5 written forms · ${malformed} failed`);
console.log(`  ${TRAPS.length} CP19-shaped labels · ${trapped.length} parsed as a postal code ${trapped.length ? '← ' + trapped.join(', ') : ''}`);
console.log(`  20000 random digit strings · ${strayed} produced an unknown sector`);

// ─────────────────────────────────────────────────────────────────────────────
H('B. RESOURCE MAPPING — nobody may be offered nothing');

let empty = 0, dupes = 0, threw = 0, minN = Infinity, maxN = 0;
const FLAGKEYS = ['symptomFlag', 'medFlag', 'sdohSocial', 'sdohFinancial', 'sdohPsychological',
    'caregiverStrain', 'fallsRisk', 'fearOfFalling', 'sdohFoodInsecure', 'sdohHousing', 'healthierSgEnrolled'];
const ALL = [...sectors, null, undefined, '--', 'zz', '74'];
for (const sec of ALL) {
    for (let i = 0; i < 40; i += 1) {
        const flags = {};
        for (const k of FLAGKEYS) if (rnd() < 0.4) flags[k] = rnd() < 0.85;
        try {
            const list = servicesForSector(sec, flags)?.services ?? [];
            if (!list.length) { empty += 1; flag('R1', 'a resident was offered NOTHING', `sector=${String(sec)}`); }
            const ids = list.map((x) => x.id);
            if (new Set(ids).size !== ids.length) { dupes += 1; flag('R2', 'duplicate service in one list', String(sec)); }
            minN = Math.min(minN, list.length); maxN = Math.max(maxN, list.length);
        } catch (e) { threw += 1; flag('R3', 'servicesForSector threw', `${String(sec)}: ${e.message}`); }
    }
}
for (const unknown of [null, '--', 'zz', '74', 'North (e.g. 73, 75)']) {
    if (clusterForSector(unknown) !== null) flag('R4', 'an unknown sector was given a health cluster', String(unknown));
}
console.log(`  ${ALL.length * 40} calls · ${threw} threw · ${empty} empty · ${dupes} with duplicates`);
console.log(`  services per result: ${minN}–${maxN}`);

// ─────────────────────────────────────────────────────────────────────────────
H('C. TYPED ANSWERS — the chat accepts free text (AuraChat.jsx)');

/*
 * ⚠️ THE CHIPS ARE SAFE; THE TEXT BOX IS NOT. Every quick reply maps to the flag
 *    its author intended. But the chat also renders an input labelled "Your
 *    message" and prompts "SELECT AN OPTION OR TYPE FREELY", and a typed sentence
 *    goes to the same substring matchers. `parseFallsAnswer` handles negation
 *    ("No falls" contains "fall"); no other matcher does.
 */
const TYPED = [
    ['matchesSymptom', 'no chest pain', false],
    ['matchesSymptom', 'No chest pain or dizziness', false],
    ['matchesSymptom', 'never had chest pain', false],
    ['matchesSymptom', 'I do not get dizziness', false],
    ['matchesSymptom', 'chest pain when I climb stairs', true],
    ['matchesCondition', 'no diabetes', false],
    ['matchesCondition', 'no high blood pressure', false],
    ['matchesCondition', 'my heart is fine', false],
    ['matchesCondition', 'I have diabetes', true],
    ['matchesPsychologicalDistress', 'my activity level is low', false],
    ['matchesPsychologicalDistress', 'low back pain', false],
    ['matchesPsychologicalDistress', 'not stressed at all', false],
    ['matchesPsychologicalDistress', 'I feel low most days', true],
    ['matchesSocialIsolation', 'I do not live alone', false],
    ['matchesSocialIsolation', 'I live alone', true],
    ['matchesFinancialBarrier', 'no cost issues', false],
    ['matchesFinancialBarrier', 'cost is not a problem', false],
    ['matchesFinancialBarrier', 'too expensive for me', true],
    ['matchesCaregiverStrain', 'no caregiving duties', false],
    ['matchesCaregiverStrain', 'not a caregiver', false],
    ['matchesCaregiverStrain', 'I am a caregiver for my mother', true],
    ['matchesFoodInsecurity', 'yes I always have enough food', false],
];
let falsePos = 0, falseNeg = 0;
for (const [matcher, text, want] of TYPED) {
    const got = CF[matcher](text.toLowerCase());
    if (got === want) continue;
    if (want === false) { falsePos += 1; flag('T1', `${matcher} fires on an answer that DENIES it`, JSON.stringify(text)); }
    else { falseNeg += 1; flag('T2', `${matcher} misses a real report`, JSON.stringify(text)); }
}
console.log(`  ${TYPED.length} realistic typed answers`);
console.log(`  false positives (flag set by a denial): ${falsePos}`);
console.log(`  false negatives (real report missed)  : ${falseNeg}`);
if (falsePos) {
    const worst = calculateRiskScore({ symptomFlag: CF.matchesSymptom('no chest pain'), pavsScore: 320, strengthDays: 3 });
    console.log(`  a fit person typing "no chest pain" scores ${worst} → ${worst >= 5 ? 'RED' : worst >= 2 ? 'AMBER' : 'GREEN'}`);
}

// ─────────────────────────────────────────────────────────────────────────────
H('D. THE FALLS GATE — who actually gets asked');

/* `when: (data) => /60\s*\+/.test(String(data.demographics))`, and `demographics`
 * is whatever the person said. The chips emit "Male, 60+"; typed ages do not. */
const AGES = ['Male, 60+', 'Female, 60+', '72', 'I am 72', 'I am 65 years old', '60 plus', 'sixty five'];
const asked = AGES.filter((a) => /60\s*\+/.test(a));
console.log(`  ${AGES.length} ways of saying an age · falls asked for ${asked.length}: ${asked.join(', ')}`);
const missed = AGES.filter((a) => !/60\s*\+/.test(a) && /\b(6[0-9]|7[0-9]|8[0-9]|sixty|seventy)\b/i.test(a));
if (missed.length) flag('D1', 'a person over 60 is not asked about falls when they TYPE their age',
    missed.map((m) => JSON.stringify(m)).join(', '));

// ─────────────────────────────────────────────────────────────────────────────
H('E. POPULATION ROLLUP — suppression, and what dilutes it');

console.log(`  MIN_CELL=${MIN_CELL} (sectors only)  MIN_COUNT=${MIN_COUNT}  BAND=${BAND}`);
const at = (m) => ({ toDate: () => new Date(2026, m - 1, 15) });
const assessment = (sector, m, flags) => ({ createdAt: at(m), postalSector: sector, flags });
const interaction = (sector, m, action) => ({ createdAt: at(m), postalSector: sector, action, score: 7 });
const NEEDY = { symptomFlag: true, medFlag: true, sdohSocial: true, sdohFinancial: true,
    sdohFoodInsecure: true, fallsRisk: true, sdohPsychological: true, pavsScore: 40 };

// E1 — one respondent, and the band that hides nothing.
const solo = buildInsights([assessment('73', 11, NEEDY)], () => 'north');
const soloRegion = solo.regions.north;
if (soloRegion && soloRegion.respondents < MIN_COUNT) {
    const exact = Object.entries(soloRegion.domains).filter(([, v]) => v === BAND).map(([k]) => k);
    console.log(`  region with ${soloRegion.respondents} respondent → published; ${exact.length} domains read "${BAND}"`);
    if (exact.length) flag('S1', `a region cell below MIN_COUNT publishes an exact profile`,
        `respondents=${soloRegion.respondents}, so "${BAND}" can only mean ${soloRegion.respondents}: ${exact.join(', ')}`);
    else flag('S2', 'region and period cells publish a raw respondent count with no minimum',
        `primary suppression (MIN_CELL) is applied to sectors only; regions.north.respondents=${soloRegion.respondents} was published`);
}

// E2 — interaction rows counted as respondents.
const people = 12;
const real = Array.from({ length: people }, () => assessment('73', 11, NEEDY));
const noisy = [...real];
for (let i = 0; i < people; i += 1) {
    for (const a of ['print_handover_slip', 'download_pdf', 'share_result', 'click_polyclinic',
        'click_healthier_sg', 'click_aac', 'click_careline']) noisy.push(interaction('73', 11, a));
}
const clean = buildInsights(real, () => 'north').sectors['73'];
const dirty = buildInsights(noisy, () => 'north').sectors['73'];
const pct = (t, k) => (typeof t.domains[k] === 'number' ? `${Math.round((t.domains[k] / t.respondents) * 100)}%` : String(t.domains[k]));
console.log(`  12 respondents, all reporting need — assessments only : ${clean.respondents} respondents, foodInsecurity ${pct(clean, 'foodInsecurity')}`);
console.log(`  the same 12 people with their interaction rows        : ${dirty.respondents} respondents, foodInsecurity ${pct(dirty, 'foodInsecurity')}`);
if (dirty.respondents !== clean.respondents) {
    flag('S3', 'interaction telemetry is counted as respondents in the rollup',
        `${people} people became ${dirty.respondents} "respondents"; every domain rate fell from ${pct(clean, 'foodInsecurity')} to ${pct(dirty, 'foodInsecurity')}`);
}

// E3 — and the same rows can carry a sector past primary suppression.
const oneTrail = [assessment('18', 11, NEEDY)];
for (let i = 0; i < MIN_CELL + 1; i += 1) oneTrail.push(interaction('18', 11, `click_${i}`));
const published = buildInsights(oneTrail, () => 'central').sectors['18'];
console.log(`  1 person + ${MIN_CELL + 1} of their own interaction rows → sector 18 ${published ? 'PUBLISHED' : 'suppressed'}`);
if (published) flag('S4', `MIN_CELL=${MIN_CELL} can be cleared by ONE person's interaction trail`,
    `sector 18 published with respondents=${published.respondents}, all from a single individual`);

// ─────────────────────────────────────────────────────────────────────────────
H('SUMMARY');
if (!findings.length) console.log('  no findings');
/* Grouped by the SENTENCE, not the id: several matchers share id `T1`, and
   printing the first one's wording over all sixteen would name the wrong
   function in four of them. */
const grouped = findings.reduce((m, f) => ((m[`${f.id}\u0000${f.what}`] ??= []).push(f), m), {});
for (const [key, list] of Object.entries(grouped)) {
    const [id, what] = key.split('\u0000');
    console.log(`\n  [${id}] ${what}   ×${list.length}`);
    [...new Set(list.map((f) => f.detail))].slice(0, 4).forEach((d) => console.log(`        ${d}`));
}
console.log(`\n  reproduce this exact run:  npm run stress:community -- --seed=${SEED}`);
console.log('  No pass/fail threshold is applied — this establishes the numbers, it does not judge them.\n');
