/**
 * ==============================================================================
 * MULTI-TEAM STRESS HARNESS
 * ==============================================================================
 * Run:  npm run stress:teams
 *
 * The third harness, beside `roster-stress.mjs` (the engine) and
 * `community-stress.mjs` (the public screening). This one is about the TENANT
 * BOUNDARY: the id every Firestore path is derived from, and the decision that
 * turns a declaration into a team.
 *
 * It reports; it applies no pass/fail threshold, because none has been agreed.
 *
 * WHAT IT IS FOR. `firestore.rules` proves that team B cannot READ team A's data
 * — 95 emulator checks say so. It cannot prove that team A and team B are two
 * different teams in the first place. That is what `teamIdFrom` decides, from two
 * strings a lead typed at registration, and a collision there is not an
 * access-control failure any rule could catch: it is two departments legitimately
 * sharing one id.
 */

import * as TP from '../src/utils/teamPaths.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isSuperAdmin, assertApprovable, buildApprovalWrites, slugTeamId } = require('../functions/teamApproval.js');

const findings = [];
const flag = (id, what, detail) => findings.push({ id, what, detail });
const H = (t) => console.log(`\n== ${t} ${'='.repeat(Math.max(0, 62 - t.length))}`);

H('A. TEAM IDS - nothing may escape the subtree');

const HOSTILE = [
    '', ' ', null, undefined, 0, true, [], {}, NaN,
    'a', 'ab', 'a'.repeat(65),
    '../other-team', 'a/../b', 'kkh/rt', 'kkh//rt', '/kkh', 'kkh/', '..', '.',
    'KKH-RT', 'kkh_rt', 'kkh rt', 'kkh.rt', 'kkh--rt', '-kkh', 'kkh-',
    'kkh-rt ', 'CHINESE-team', '__proto__',
];
const acceptedIds = HOSTILE.filter((id) => TP.isTeamId(id));
console.log(`  ${HOSTILE.length} hostile ids - ${acceptedIds.length} accepted`);
if (acceptedIds.length) flag('T1', 'a-hostile-team-id-was-accepted', acceptedIds.map((i) => JSON.stringify(i)).join(', '));

const ROOT_BUILDERS = ['userPath', 'leadRequestPath', 'configPath', 'leadRequestsPath', 'teamsPath'];
const teamBuilders = Object.entries(TP)
    .filter(([k, v]) => typeof v === 'function' && /Path$/.test(k) && !ROOT_BUILDERS.includes(k));
let escapes = 0;
for (const [name, fn] of teamBuilders) {
    for (const id of HOSTILE) {
        let out;
        try { out = fn(id, '2026'); } catch { continue; }
        if (Array.isArray(out) && out.some((s) => typeof s === 'string' && (s.includes('/') || s === '' || s === '..'))) {
            escapes += 1;
            flag('T2', `${name}-composed-an-escaping-segment`, `${JSON.stringify(id)} -> ${JSON.stringify(out)}`);
        }
    }
}
console.log(`  ${teamBuilders.length} team-scoped path builders x ${HOSTILE.length} ids - ${escapes} escaped`);

// The root builders take a uid or a document id, not a team id, and have
// different guards - one of them has none at all.
for (const [name, fn] of [['userPath', TP.userPath], ['leadRequestPath', TP.leadRequestPath], ['configPath', TP.configPath]]) {
    const through = ['a/b', '..', '', '../x'].filter((v) => {
        try { return fn(v).some((s) => s === '' || s.includes('/') || s === '..'); } catch { return false; }
    });
    console.log(`  ${name.padEnd(18)} lets through: ${through.length ? through.map((t) => JSON.stringify(t)).join(', ') : '(nothing)'}`);
    if (through.length) flag('T3', `${name}-accepts-a-path-not-an-id`,
        `${through.map((t) => JSON.stringify(t)).join(', ')} - Firestore forbids these as document ids`);
}

H('B. UIDS - per-person documents are keyed by uid, never by name');

const TAB = String.fromCharCode(9);
const HOSTILE_UIDS = ['', ' ', TAB, null, undefined, 0, [], {},
    'Ying Xian', 'Sarah Tan', 'Sarah', 'YINGXIAN', 'a/b', '..', '.', 'uid ',
    TP.ANONYMOUS_WELLBEING_ID];
const uidThrough = HOSTILE_UIDS.filter((u) => { try { TP.assertUid(u); return true; } catch { return false; } });
console.log(`  ${HOSTILE_UIDS.length} hostile uids - ${uidThrough.length} accepted: ${uidThrough.map((u) => JSON.stringify(u)).join(', ')}`);
const asPath = uidThrough.filter((u) => typeof u === 'string' && (u.includes('/') || u === '..' || u === '.'));
if (asPath.length) flag('U1', 'assertUid-accepted-a-path', asPath.map((u) => JSON.stringify(u)).join(', '));
const asName = uidThrough.filter((u) => typeof u === 'string' && /^[A-Za-z]{3,}$/.test(u));
if (asName.length) flag('U2', 'assertUid-cannot-tell-a-single-word-name-from-a-uid',
    `${asName.map((u) => JSON.stringify(u)).join(', ')} - the guard catches "Ying Xian" but not "Sarah"`);
// The sentinel is a legal uid SHAPE — the refusal belongs to the builder that would
// otherwise file it as a person, not to `assertUid`, which cannot know the context.
let sentinelRefused = false;
try { TP.wellbeingDocPath('kkh-physiotherapy', TP.ANONYMOUS_WELLBEING_ID); } catch { sentinelRefused = true; }
console.log(`  the anonymous bucket as a person: ${sentinelRefused ? 'refused' : 'ACCEPTED'}`);
if (!sentinelRefused) flag('U3',
    'the-anonymous-wellbeing-sentinel-can-be-filed-as-a-person',
    `wellbeingDocPath(team, ${JSON.stringify(TP.ANONYMOUS_WELLBEING_ID)}) resolves to the shared anonymous document`);

H('C. TEAM ID DERIVATION - two departments must never share one id');

const INSTITUTIONS = ['KKH', 'SGH', 'NUH', 'CGH', 'TTSH', 'SKH', 'NTFGH', 'KTPH',
    'KK Women and Children Hospital', 'Singapore General Hospital',
    'National University Hospital', 'Changi General Hospital', 'Tan Tock Seng Hospital',
    'Sengkang General Hospital', 'Ng Teng Fong General Hospital', 'Khoo Teck Puat Hospital',
    'Institute of Mental Health', 'National Heart Centre Singapore',
    'Singapore National Eye Centre', 'National Cancer Centre Singapore',
    'KKH Respiratory', 'SGH Occupational', 'NUH Speech'];
const DEPARTMENTS = ['Physiotherapy', 'Occupational Therapy', 'Speech Therapy',
    'Speech-Language Therapy', 'Respiratory Therapy', 'Dietetics', 'Podiatry',
    'Medical Social Work', 'Psychology', 'Clinical Psychology', 'Pharmacy', 'Radiography',
    'Diagnostic Radiography', 'Radiation Therapy', 'Audiology', 'Orthoptics',
    'Prosthetics and Orthotics', 'Music Therapy', 'Art Therapy', 'Sport & Exercise Medicine',
    'Sports and Exercise Medicine', 'Physio Therapy', 'Therapy'];

// Case and punctuation SHOULD collapse - "KKH" and "kkh" are one institution.
const canon = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const byId = new Map();
for (const inst of INSTITUTIONS) {
    for (const dept of DEPARTMENTS) {
        const id = TP.teamIdFrom(inst, dept);
        if (!id) continue;
        if (!byId.has(id)) byId.set(id, new Map());
        byId.get(id).set(`${canon(inst)}|${canon(dept)}`, `${inst} / ${dept}`);
    }
}
const shared = [...byId.entries()].filter(([, m]) => m.size > 1);
console.log(`  ${INSTITUTIONS.length * DEPARTMENTS.length} pairs - ${byId.size} distinct ids - ${shared.length} shared by genuinely different pairs`);
for (const [id, m] of shared) {
    console.log(`     ${id}`);
    [...m.values()].forEach((v) => console.log(`        <- ${v}`));
}
if (shared.length) flag('C1', 'two-different-pairs-produce-one-team-id',
    `${shared.map(([id]) => id).join(', ')} - the hyphen joining the two halves is the same character used inside each, so the boundary is not recoverable`);

console.log('\n  the drift guard: the client copy and the server copy must agree');
let drift = 0;
for (const inst of INSTITUTIONS.slice(0, 8)) {
    for (const dept of DEPARTMENTS.slice(0, 8)) {
        if (TP.teamIdFrom(inst, dept) !== slugTeamId(inst, dept)) {
            drift += 1;
            flag('C2', 'teamIdFrom-and-slugTeamId-disagree', `${inst} / ${dept}`);
        }
    }
}
console.log(`     64 pairs through both copies - ${drift} disagreed`);

H('D. APPROVAL - the only thing between an account and its own team');

const CONFIG = { uids: ['SUPERuid'], emails: ['owner@kkh.com.sg'] };
const SUPER = [
    ['a listed uid', CONFIG, { uid: 'SUPERuid', emailVerified: false }, true],
    ['a listed email, verified', CONFIG, { uid: 'x', email: 'owner@kkh.com.sg', emailVerified: true }, true],
    ['a listed email, UNVERIFIED', CONFIG, { uid: 'x', email: 'owner@kkh.com.sg', emailVerified: false }, false],
    ['a lookalike domain', CONFIG, { uid: 'x', email: 'owner@kkh.com.sg.evil.com', emailVerified: true }, false],
    ['a subdomain lookalike', CONFIG, { uid: 'x', email: 'owner@evil.kkh.com.sg', emailVerified: true }, false],
    ['emailVerified as the STRING "true"', CONFIG, { uid: 'x', email: 'owner@kkh.com.sg', emailVerified: 'true' }, false],
    ['config.uids as a string that contains it', { uids: 'SUPERuid' }, { uid: 'SUPERuid', emailVerified: true }, false],
    ['prototype pollution', JSON.parse('{"uids":["a"],"__proto__":{"uids":["evil"]}}'), { uid: 'evil', emailVerified: true }, false],
    ['no config at all', null, { uid: 'SUPERuid', emailVerified: true }, false],
];
let superWrong = 0;
for (const [label, config, caller, want] of SUPER) {
    let got; try { got = isSuperAdmin(config, caller); } catch (e) { got = `THREW ${e.message}`; }
    if (got !== want) { superWrong += 1; flag('S1', `isSuperAdmin-wrong-for-${label.replace(/ /g, '-')}`, `got ${got}, want ${want}`); }
}
console.log(`  ${SUPER.length} authorization cases - ${superWrong} wrong`);

const REQ = { uid: 'leadUID', status: 'pending', role: 'lead', email: 'a@kkh.com.sg',
    displayName: 'A Lead', institution: 'KKH', department: 'Physiotherapy' };
const APPROVE = [
    ['the happy path', { request: { ...REQ }, authUser: { emailVerified: true }, teamExists: false }, true],
    ['an unverified account', { request: { ...REQ }, authUser: { emailVerified: false }, teamExists: false }, false],
    ['emailVerified as a string', { request: { ...REQ }, authUser: { emailVerified: 'true' }, teamExists: false }, false],
    ['a staff role', { request: { ...REQ, role: 'staff' }, authUser: { emailVerified: true }, teamExists: false }, false],
    ['a role in caps', { request: { ...REQ, role: 'LEAD' }, authUser: { emailVerified: true }, teamExists: false }, false],
    ['a role as an array', { request: { ...REQ, role: ['lead'] }, authUser: { emailVerified: true }, teamExists: false }, false],
    ['an already-approved request', { request: { ...REQ, status: 'approved' }, authUser: { emailVerified: true }, teamExists: false }, false],
    ['a deleted account', { request: { ...REQ }, authUser: null, teamExists: false }, false],
    ['an existing team', { request: { ...REQ }, authUser: { emailVerified: true }, teamExists: true }, false],
    ['an unusable name', { request: { ...REQ, institution: '!!!' }, authUser: { emailVerified: true }, teamExists: false }, false],
];
let approveWrong = 0;
for (const [label, args, want] of APPROVE) {
    let got; try { got = assertApprovable(args); } catch (e) { got = { ok: `THREW ${e.message}` }; }
    if (got.ok !== want) { approveWrong += 1; flag('S2', `assertApprovable-wrong-for-${label.replace(/ /g, '-')}`, `got ok=${got.ok}, want ${want}`); }
}
console.log(`  ${APPROVE.length} approvability cases - ${approveWrong} wrong`);

const smuggled = buildApprovalWrites({
    request: { ...REQ, leadUid: 'ATTACKER', createdBy: 'ATTACKER', teamIds: ['other'], admin: true, extra: 'x' },
    teamId: 'kkh-physiotherapy', approverUid: 'SUPERuid', now: 'NOW',
});
const written = [...Object.keys(smuggled.team.data), ...Object.keys(smuggled.member.data)];
const leakedKeys = written.filter((k) => ['admin', 'extra', 'teamIds', 'status'].includes(k));
console.log(`  request-body smuggling: ${leakedKeys.length ? leakedKeys.join(', ') : 'nothing reached a written document'}`);
if (leakedKeys.length) flag('S3', 'a-field-from-the-request-body-was-written', leakedKeys.join(', '));
if (smuggled.team.data.leadUid !== REQ.uid) flag('S4', 'leadUid-did-not-come-from-request.uid', String(smuggled.team.data.leadUid));
if (smuggled.team.data.createdBy !== 'SUPERuid') flag('S5', 'createdBy-is-not-the-approver', String(smuggled.team.data.createdBy));

const long = buildApprovalWrites({
    request: { ...REQ, displayName: 'x'.repeat(5000), department: 'y'.repeat(5000), institution: 'z'.repeat(5000) },
    teamId: 'kkh-physiotherapy', approverUid: 'S', now: 'NOW',
});
const lengths = { name: long.team.data.name.length, department: long.team.data.department.length,
    institution: long.team.data.institution.length, displayName: long.member.data.displayName.length };
console.log(`  5000-character fields are stored at: ${JSON.stringify(lengths)}`);
if (Object.values(lengths).some((n) => n > 200)) flag('S6', 'text-from-a-request-is-written-with-no-length-cap',
    `${JSON.stringify(lengths)} - these are rendered in the switcher and the roster header`);

// The two causes of "that id is taken", and whether the owner can tell them apart.
const collision = assertApprovable({
    request: { ...REQ, institution: 'KKH Respiratory', department: 'Therapy' },
    authUser: { emailVerified: true }, teamExists: true,
    existingTeam: { institution: 'KKH', department: 'Respiratory Therapy' },
});
const duplicate = assertApprovable({
    request: { ...REQ }, authUser: { emailVerified: true }, teamExists: true,
    existingTeam: { institution: 'KKH', department: 'Physiotherapy' },
});
console.log(`\n  a DIFFERENT department holds the id -> collision=${collision.collision}`);
console.log(`     "${collision.message}"`);
console.log(`  the SAME department asking twice     -> collision=${duplicate.collision}`);
console.log(`     "${duplicate.message}"`);
if (collision.collision !== true || duplicate.collision !== false) {
    flag('S7', 'the-two-causes-of-a-taken-id-are-not-distinguished',
        `collision=${collision.collision}, duplicate=${duplicate.collision}`);
}
if (!collision.message.includes('Respiratory Therapy at KKH')) {
    flag('S8', 'the-team-exists-message-does-not-name-the-team-that-exists', collision.message);
}

H('SUMMARY');
/*
 * ⚠️ TWO OF THESE ARE DOCUMENTED LIMITS, NOT OPEN DEFECTS, AND THE DIFFERENCE IS
 *    WORTH PRINTING RATHER THAN LEAVING TO WHOEVER READS THE LIST.
 *
 *   U2  `assertUid` cannot tell "Sarah" from a uid, and a length floor was measured
 *       and rejected: a Firebase uid draws from 62 alphanumerics, so about 0.7% of
 *       them — one user in 140 — contain no digit at all. A guard that locks one
 *       clinician in every 140 out of their own wellbeing record is a worse defect
 *       than the one it prevents. The property that CAN be enforced — no call site
 *       passes a name — is enforced by `teamPaths.source.test.js` instead.
 *
 *   C1  Two pairs can slug to one id, and the only real fix is changing the id
 *       FORMAT, which would rename the live team. What is fixed is the consequence:
 *       `assertApprovable` now reports `collision` and names the existing team, so
 *       an owner can tell a genuine duplicate from a word on the wrong side of the
 *       split rather than refusing a real department.
 */
const KNOWN_LIMITS = ['U2', 'C1'];
const open = findings.filter((f) => !KNOWN_LIMITS.includes(f.id));
console.log(`  ${open.length} open · ${findings.length - open.length} documented limits (see the note in this file)`);
if (!findings.length) console.log('  no findings');
const grouped = findings.reduce((m, f) => ((m[`${f.id} ${f.what}`] ??= []).push(f), m), {});
for (const [key, list] of Object.entries(grouped)) {
    const [id, what] = key.split(' ');
    console.log(`\n  [${id}] ${what.replace(/-/g, ' ')}   x${list.length}`);
    [...new Set(list.map((f) => f.detail))].slice(0, 3).forEach((d) => console.log(`        ${d}`));
}
console.log('\n  No pass/fail threshold is applied - this establishes the numbers, it does not judge them.\n');
