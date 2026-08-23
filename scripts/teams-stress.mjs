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
const { assertInvitable, buildInviteWrites, assertRemovable, INVITE_REASONS, REMOVE_REASONS } = require('../functions/teamMembership.js');

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

H('E. MEMBERSHIP - how a team grows, and the team nobody can administer');

/*
 * Approval decides who gets a team. This decides who gets INTO one, which is the
 * same question asked about clinical data 27 more times per department. It could
 * not be asked at all until `inviteMember` existed: `firestore.rules` denies
 * membership `create` and `delete` to every client and deferred both to a Cloud
 * Function that had not been written, so an approved team could never grow.
 */

const TEAM = 'kkh-respiratory-therapy';
const LEAD_MEMBERSHIP = { uid: 'leadUid0000000000000000000aa', role: 'lead' };
const DOMAINS = ['kkh.com.sg', 'singhealth.com.sg'];
const REAL = { uid: 'newUid00000000000000000000bb', email: 'brandon@kkh.com.sg', emailVerified: true };

const invitable = (over = {}) => assertInvitable({
    teamId: TEAM, callerMembership: LEAD_MEMBERSHIP, invitee: REAL,
    role: 'staff', existingMembership: null, allowedDomains: DOMAINS, ...over,
});

// ── E1. Nobody but a lead of THIS team ───────────────────────────────────────
//
// A caller with no membership document is somebody who passed a teamId they are
// not in. Admitting them would let any signed-in user in the cluster place
// anybody inside any department — and every rule downstream trusts that document.
const CALLERS = [
    null, undefined, {}, { role: '' }, { role: 'staff' }, { role: 'viewer' },
    { role: 'LEAD' }, { role: 'admin' }, { role: 'superadmin' }, { role: ['lead'] },
    { role: { toString: () => 'lead' } }, { rostered: true },
];
const admittedCallers = CALLERS.filter((c) => invitable({ callerMembership: c }).ok);
console.log(`  ${CALLERS.length} non-lead callers - ${admittedCallers.length} admitted`);
if (admittedCallers.length) flag('M1', 'a-non-lead-was-allowed-to-add-a-member',
    admittedCallers.map((c) => JSON.stringify(c)).join(', '));

// ── E2. The domain gate, which is the login gate applied to people who are ADDED
//
// Rules can read config/domains but cannot read the INVITEE's email — only the
// caller's — so without this check the gate would apply to people who sign
// themselves up and be skipped entirely for people a lead adds.
const HOSTILE_EMAILS = [
    '', ' ', null, undefined, 0, [], {},
    'brandon', 'brandon@', '@kkh.com.sg', 'a@b@kkh.com.sg', 'a@kkh.com.sg@evil.example',
    'a@gmail.com', 'a@mail.kkh.com.sg', 'a@kkh.com.sg.attacker.example', 'a@KKH.COM.SG.evil',
    'a@localhost', 'a@-kkh.com.sg', 'a@kkh-.com.sg', 'a@kkh..com.sg',
    'a@xn--kkh-tla.com.sg', 'a@\u212akkh.com.sg', 'a@kkh.com.sg\u0000',
];
const admittedEmails = HOSTILE_EMAILS.filter((email) => invitable({ invitee: { ...REAL, email } }).ok);
console.log(`  ${HOSTILE_EMAILS.length} hostile addresses - ${admittedEmails.length} admitted`);
if (admittedEmails.length) flag('M2', 'a-hostile-address-passed-the-domain-gate',
    admittedEmails.map((e) => JSON.stringify(e)).join(', '));

/*
 * ⚠️ SEPARATED FROM THE LIST ABOVE AFTER THE HARNESS FLAGGED THEM AND THE FLAG WAS
 *    WRONG. `a@kkh.com.sg.` and an address with a trailing newline are ADMITTED,
 *    and that is correct rather than a hole: a trailing dot is the fully-qualified
 *    form of the same domain, and a trailing newline is what a paste from Outlook
 *    leaves behind. `normaliseDomain` strips both deliberately, the client copy
 *    strips them identically (section C's drift guard covers it), and refusing
 *    them would reject a real colleague's real address for a typographical reason
 *    they cannot see.
 *
 *    They stay in the harness as an EXPECTED-ADMIT group rather than being deleted,
 *    so a future change that stops canonicalising them shows up here as a number
 *    that moved.
 */
const CANONICAL_ADMITS = ['a@kkh.com.sg.', 'a@kkh.com.sg\n', '  a@KKH.com.sg  '];
const wronglyRefused = CANONICAL_ADMITS.filter((email) => !invitable({ invitee: { ...REAL, email } }).ok);
console.log(`  ${CANONICAL_ADMITS.length} addresses that should canonicalise to an allowed domain - ${wronglyRefused.length} refused`);
if (wronglyRefused.length) flag('M12', 'a-real-address-was-refused-over-canonicalisation',
    wronglyRefused.map((e) => JSON.stringify(e)).join(', '));

// ⚠️ AN UNREADABLE ALLOWLIST ADMITS NOBODY - the OPPOSITE of the client hook,
//    and both are right. The login screen falls back to a built-in list because it
//    still has to let existing users in. This function is what stands between a
//    lead and placing an arbitrary address in a team.
const BAD_LISTS = [[], null, undefined, '', 'kkh.com.sg', {}, ['*'], ['*.com.sg'], [''], [null]];
const openedLists = BAD_LISTS.filter((allowedDomains) => invitable({ allowedDomains }).ok);
console.log(`  ${BAD_LISTS.length} unusable allowlists - ${openedLists.length} admitted anybody`);
if (openedLists.length) flag('M3', 'an-unusable-allowlist-opened-the-gate',
    openedLists.map((l) => JSON.stringify(l)).join(', '));

// ── E3. Role escalation through the request body ─────────────────────────────
/*
 * `undefined` is NOT in this list, and leaving it out is the finding rather than an
 * omission: the harness flagged it as "a role outside the three was accepted" and
 * the flag was wrong. `assertInvitable`'s default parameter turns `undefined` into
 * `'staff'`, which is what the handler does with a missing field too. An absent
 * role meaning the least-privileged one is the correct reading; the escalation
 * risk is a role that is PRESENT and wrong, which is everything below.
 */
const HOSTILE_ROLES = ['admin', 'superadmin', 'owner', 'LEAD', 'Lead', '', null, 0,
    ['lead'], { role: 'lead' }, 'lead ', ' lead', 'staff\u0000'];
const acceptedRoles = HOSTILE_ROLES.filter((role) => invitable({ role }).ok);
console.log(`  ${HOSTILE_ROLES.length} hostile roles - ${acceptedRoles.length} accepted`);
if (acceptedRoles.length) flag('M4', 'a-role-outside-the-three-was-accepted',
    acceptedRoles.map((r) => JSON.stringify(r)).join(', '));

const omittedRole = invitable({ role: undefined });
console.log(`  an omitted role defaults to the least privileged: ok=${omittedRole.ok}`);
if (!omittedRole.ok) flag('M13', 'an-omitted-role-is-refused-rather-than-defaulting-to-staff',
    JSON.stringify(omittedRole));

// ── E4. Nothing from the request body reaches a written document ─────────────
const smuggledMember = buildInviteWrites({
    teamId: TEAM,
    invitee: { ...REAL, admin: true, teamIds: ['other-team'], role: 'lead' },
    displayName: 'x'.repeat(5000),
    role: 'staff', rostered: true, invitedBy: 'LEADuid', now: 'NOW',
});
const memberKeys = Object.keys(smuggledMember.member.data);
const leakedMemberKeys = memberKeys.filter((k) => ['admin', 'teamIds', 'status', 'extra'].includes(k));
console.log(`  request-body smuggling: ${leakedMemberKeys.length ? leakedMemberKeys.join(', ') : 'nothing reached a written document'}`);
if (leakedMemberKeys.length) flag('M5', 'a-field-from-the-request-body-was-written', leakedMemberKeys.join(', '));
console.log(`  a 5000-character name is stored at: ${smuggledMember.member.data.displayName.length}`);
if (smuggledMember.member.data.displayName.length > 200) flag('M6',
    'a-name-from-the-request-is-written-with-no-length-cap',
    `${smuggledMember.member.data.displayName.length} - it is rendered in the roster header and the swap picker`);

// ⚠️ THE USER DOCUMENT MUST GAIN A TEAM, NEVER BE HANDED A LIST. A `teamIds` key
//    here would OVERWRITE the array and drop every other team the person belongs
//    to - the exact failure multi-team membership exists to support.
if ('teamIds' in smuggledMember.user.data) flag('M7',
    'the-invite-writes-teamIds-directly-instead-of-a-union', JSON.stringify(smuggledMember.user.data));
console.log(`  the user document gains: ${JSON.stringify(smuggledMember.user.data.addTeamIds)} (union, not overwrite)`);

// ── E5. The invariant: a team must never end up with nobody who can administer it
//
// EXHAUSTIVE over the four things that decide it, because the first version of the
// guard compared `caller !== target` and would have passed half of this matrix.
// There is no repair path inside the app for a team with no lead - every screen
// that could fix it requires one - so the owner would edit Firestore by hand.
let orphanable = 0;
let matrix = 0;
for (const isOwner of [true, false]) {
    for (const targetRole of ['lead', 'staff', 'viewer']) {
        for (const leadCount of [0, 1, 2, 3, undefined, null, NaN, '2', -1]) {
            for (const selfRemoval of [true, false]) {
                matrix += 1;
                const targetUid = selfRemoval ? LEAD_MEMBERSHIP.uid : 'otherUid00000000000000000cc';
                const verdict = assertRemovable({
                    teamId: TEAM,
                    team: { leadUid: isOwner ? targetUid : 'someone-else-entirely' },
                    callerUid: LEAD_MEMBERSHIP.uid,
                    callerMembership: LEAD_MEMBERSHIP,
                    targetUid,
                    targetMembership: { role: targetRole },
                    leadCount,
                });
                // The removal would leave zero leads if the target is a lead and the
                // count of leads was one or fewer - including "we could not tell".
                const countKnown = Number.isFinite(Number(leadCount));
                const wouldOrphan = targetRole === 'lead' && (!countKnown || Number(leadCount) <= 1);
                if (verdict.ok && (wouldOrphan || isOwner)) {
                    orphanable += 1;
                    flag('M8', 'a-removal-that-leaves-a-team-with-no-lead-was-allowed',
                        `owner=${isOwner} targetRole=${targetRole} leadCount=${JSON.stringify(leadCount)} self=${selfRemoval}`);
                }
            }
        }
    }
}
console.log(`  ${matrix} removal combinations - ${orphanable} would have left a team with no lead`);

// ── E6. Idempotence: doing it twice is the state the lead asked for ──────────
const twice = invitable({ existingMembership: { displayName: 'Brandon', role: 'staff' } });
const gone = assertRemovable({
    teamId: TEAM, team: { leadUid: 'x' }, callerUid: LEAD_MEMBERSHIP.uid,
    callerMembership: LEAD_MEMBERSHIP, targetUid: 'ghost000000000000000000000dd',
    targetMembership: null, leadCount: 2,
});
console.log(`  adding an existing member -> ok=${twice.ok} alreadyMember=${twice.alreadyMember}`);
console.log(`  removing somebody already gone -> ok=${gone.ok} alreadyGone=${gone.alreadyGone}`);
if (!twice.ok || !twice.alreadyMember) flag('M9', 'adding-an-existing-member-is-an-error-rather-than-a-no-op',
    JSON.stringify(twice));
if (!gone.ok || !gone.alreadyGone) flag('M10', 'removing-an-absent-member-is-an-error-rather-than-a-no-op',
    JSON.stringify(gone));

// ── E7. Every refusal names a reason code, not only a sentence ───────────────
//
// The codes are what a future pending-invitation path branches on, and what the
// UI uses to tell "they have not registered" from "that domain is not allowed".
const REFUSALS = [
    invitable({ callerMembership: null }),
    invitable({ invitee: { ...REAL, email: 'a@gmail.com' } }),
    invitable({ invitee: { ...REAL, uid: null } }),
    invitable({ invitee: { ...REAL, emailVerified: false } }),
    invitable({ role: 'admin' }),
];
const KNOWN_REASONS = new Set(Object.values(INVITE_REASONS).concat(Object.values(REMOVE_REASONS)));
const unnamed = REFUSALS.filter((r) => !KNOWN_REASONS.has(r.reason) || !r.message);
console.log(`  ${REFUSALS.length} refusals - ${unnamed.length} without a reason code or a sentence`);
if (unnamed.length) flag('M11', 'a-refusal-has-no-reason-code-or-no-sentence',
    JSON.stringify(unnamed.map((r) => r.reason)));

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
