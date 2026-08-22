// scripts/firestore-rules-verify.mjs
//
// Executable re-verification of `firestore.rules`. Run:
//
//   mkdir -p /tmp/nexus-rules && cd /tmp/nexus-rules
//   npm init -y && npm i firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10
//   node -e "const f='package.json';const p=require(f);p.type='module';require('fs').writeFileSync(f,JSON.stringify(p,null,2))"
//   cp <repo>/firestore.rules .
//   cp <repo>/scripts/firestore-rules-verify.mjs .
//   printf '{"firestore":{"rules":"firestore.rules"},"emulators":{"firestore":{"port":8080},"ui":{"enabled":false}}}' > firebase.json
//   ./node_modules/.bin/firebase emulators:exec --only firestore \
//       --project demo-nexus-rules "node firestore-rules-verify.mjs"
//
// WHY IT LIVES IN `scripts/` AND NOT `src/`. `vitest.config.js` collects
// `src/**`, `functions/**` and `scripts/**/*.test.*`; this is not a `.test.` file
// because CI has no Firestore emulator and it would fail every build. The deps
// above are deliberately NOT in `package.json` — firebase-tools is ~685 packages
// and CI never needs them.
//
// It never contacts `idc-app-e0c59`: the project id is `demo-nexus-rules`, which the
// CLI treats as a demo project and refuses to let reach real services.
//
// -----------------------------------------------------------------------------
// WHAT IT COVERS
// -----------------------------------------------------------------------------
//
// ⚠️ SECTION 1 IS CROSS-TEAM ISOLATION AND IT IS THE POINT OF THIS FILE. A member
//    of team A must get NOTHING from team B — roster, swaps, wellbeing, members,
//    loads, feed, the team's own name. Everything else in NEXUS protects a
//    department from its own mistakes; this protects one department from another,
//    and it is the property the whole multi-team rebuild exists to establish.
//
// Then: membership-as-data (the thing that replaced a hardcoded directory), the
// lead/member verb split, wellbeing ownership, the onboarding paths, the two public
// sinks, and a final section asserting the PRE-MIGRATION collections are sealed —
// the migration copies rather than moves, so those documents still exist and a
// stale path left in the app must not keep working.
//
// LAST RUN: 2026-08-21 against the Firestore emulator — 95 passed, 0 failed.
//
// -----------------------------------------------------------------------------
// TRAPS PAID FOR ONCE, RECORDED SO THEY ARE NOT PAID FOR TWICE
// -----------------------------------------------------------------------------
//
// 1. `changedKeys()` is `diff().affectedKeys()` — keys whose VALUE CHANGED, not
//    keys written. An early "cannot change two days in one write" case wrote `[]`
//    over an already-`[]` day, so only one key was affected and it passed in the
//    direction that would have hidden a real hole. Any new case must write
//    genuinely different values.
//
// 2. `c.firestore()` MUST BE CALLED ONCE PER CONTEXT. Calling it twice inside one
//    `withSecurityRulesDisabled` throws `failed-precondition: Firestore has already
//    been started` and crashes the run mid-way, which reads like a rules failure
//    rather than a harness one.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
    doc, setDoc, getDoc, updateDoc, deleteDoc,
    collection, addDoc, getDocs, query, where, serverTimestamp,
} from 'firebase/firestore';

const env = await initializeTestEnvironment({
    projectId: 'demo-nexus-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
});

// ── The cast ─────────────────────────────────────────────────────────────────
// Two teams, deliberately the same PROFESSION at two institutions — the collision
// the old global collections could not express at all.
const TEAM_A = 'kkh-sport-exercise-medicine';
const TEAM_B = 'sgh-physiotherapy';

const ALIF = 'uid-alif';            // team A, lead, rostered
const NISA = 'uid-nisa';            // team A, lead, NOT rostered (roster master)
const BRANDON = 'uid-brandon';      // team A, staff
const YING = 'uid-ying-xian';       // team A, staff
const SGH_LEAD = 'uid-sgh-lead';    // team B, lead — the outsider in every A case
const NOMAD = 'uid-nomad';          // signed in, verified, in NO team

const as = (uid) => env.authenticatedContext(uid, { email: `${uid}@kkh.com.sg`, email_verified: true }).firestore();
const anon = env.unauthenticatedContext().firestore();

let pass = 0, fail = 0;
const check = async (name, promise) => {
    try { await promise; console.log(`  ✅ ${name}`); pass += 1; }
    catch (e) { console.log(`  ❌ ${name}\n       ${String(e).split('\n')[0].slice(0, 160)}`); fail += 1; }
};

/** Both teams, fully populated, written with rules disabled. */
const seed = async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (c) => {
        const raw = c.firestore();
        const member = (uid, role, rostered) => ({ displayName: uid, role, rostered, grade: '', fte: 1, skills: [], unavailable: [] });

        await setDoc(doc(raw, `teams/${TEAM_A}`), { name: 'Sport & Exercise Medicine', institution: 'KKH', leadUid: ALIF });
        await setDoc(doc(raw, `teams/${TEAM_A}/members/${ALIF}`), member(ALIF, 'lead', true));
        await setDoc(doc(raw, `teams/${TEAM_A}/members/${NISA}`), member(NISA, 'lead', false));
        await setDoc(doc(raw, `teams/${TEAM_A}/members/${BRANDON}`), member(BRANDON, 'staff', true));
        await setDoc(doc(raw, `teams/${TEAM_A}/members/${YING}`), member(YING, 'staff', true));
        await setDoc(doc(raw, `teams/${TEAM_A}/rosters/2026`), { '2026-02-02': [{ task: 'EFT', lead: 'Brandon' }], '2026-02-03': [] });
        await setDoc(doc(raw, `teams/${TEAM_A}/wellbeing/${BRANDON}`), { logs: [{ energy: 3 }] });
        await setDoc(doc(raw, `teams/${TEAM_A}/loads/${BRANDON}`), { data: Array(12).fill(0) });
        await setDoc(doc(raw, `teams/${TEAM_A}/pulse/daily`), { Brandon: { energy: 4 } });
        await setDoc(doc(raw, `teams/${TEAM_A}/feed/post-1`), { author: 'Brandon', likes: 0, comments: 0 });
        await setDoc(doc(raw, `teams/${TEAM_A}/reports/2026`), { publicText: 'x' });
        await setDoc(doc(raw, `teams/${TEAM_A}/projects/2026/staff/${BRANDON}`), { projects: [] });
        await setDoc(doc(raw, `teams/${TEAM_A}/attendance/2026`), { 2026: Array(12).fill(0) });
        await setDoc(doc(raw, `teams/${TEAM_A}/swaps/swap-1`), {
            requestedBy: 'Brandon', requestedUid: BRANDON, targetStaff: 'Ying Xian', targetUid: YING,
            originalShiftDate: '2026-02-02', originalTask: 'EFT', swapRole: 'lead', status: 'PENDING',
        });
        await setDoc(doc(raw, `teams/${TEAM_A}/notifications/n-1`), { recipientUid: YING, read: false });

        await setDoc(doc(raw, `teams/${TEAM_B}`), { name: 'Physiotherapy', institution: 'SGH', leadUid: SGH_LEAD });
        await setDoc(doc(raw, `teams/${TEAM_B}/members/${SGH_LEAD}`), member(SGH_LEAD, 'lead', true));

        await setDoc(doc(raw, `users/${BRANDON}`), { displayName: 'Brandon', teamIds: [TEAM_A] });
        await setDoc(doc(raw, `users/${NOMAD}`), { displayName: 'Nomad', teamIds: [] });
        await setDoc(doc(raw, 'config/domains'), { allowed: ['kkh.com.sg', 'singhealth.com.sg'] });
        await setDoc(doc(raw, 'config/superAdmins'), { uids: [ALIF] });
    });
};

await seed();

// ═════════════════════════════════════════════════════════════════════════════
// 1. CROSS-TEAM ISOLATION — the most important block in this file
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══ CROSS-TEAM ISOLATION: team B must get NOTHING from team A ══');
{
    const b = as(SGH_LEAD);   // a LEAD, in a real team, with a verified address
    await check('cannot read team A\'s roster',
        assertFails(getDoc(doc(b, `teams/${TEAM_A}/rosters/2026`))));
    await check('cannot read team A\'s wellbeing record        ← the most sensitive',
        assertFails(getDoc(doc(b, `teams/${TEAM_A}/wellbeing/${BRANDON}`))));
    await check('cannot LIST team A\'s wellbeing collection',
        assertFails(getDocs(collection(b, `teams/${TEAM_A}/wellbeing`))));
    await check('cannot read team A\'s member list',
        assertFails(getDocs(collection(b, `teams/${TEAM_A}/members`))));
    await check('cannot read even team A\'s NAME',
        assertFails(getDoc(doc(b, `teams/${TEAM_A}`))));
    await check('cannot read team A\'s swaps',
        assertFails(getDocs(query(collection(b, `teams/${TEAM_A}/swaps`), where('targetUid', '==', YING)))));
    await check('cannot read team A\'s pulse board',
        assertFails(getDoc(doc(b, `teams/${TEAM_A}/pulse/daily`))));
    await check('cannot read team A\'s clinical loads',
        assertFails(getDocs(collection(b, `teams/${TEAM_A}/loads`))));
    await check('cannot read team A\'s feed',
        assertFails(getDocs(collection(b, `teams/${TEAM_A}/feed`))));
    await check('cannot read team A\'s year-end report',
        assertFails(getDoc(doc(b, `teams/${TEAM_A}/reports/2026`))));
    await check('cannot read team A\'s project rows',
        assertFails(getDocs(collection(b, `teams/${TEAM_A}/projects/2026/staff`))));

    // Being a LEAD of B grants nothing in A. This is the case that would break if a
    // rule ever asked "are you a lead" without asking "of WHICH team".
    await check('cannot OVERWRITE team A\'s roster, despite leading team B',
        assertFails(setDoc(doc(b, `teams/${TEAM_A}/rosters/2026`), { '2026-02-02': [] })));
    await check('cannot add themselves to team A\'s member list',
        assertFails(setDoc(doc(b, `teams/${TEAM_A}/members/${SGH_LEAD}`), { displayName: 'x', role: 'lead' })));
    await check('cannot edit a team A membership',
        assertFails(updateDoc(doc(b, `teams/${TEAM_A}/members/${BRANDON}`), { role: 'viewer' })));
    await check('cannot answer a team A swap',
        assertFails(updateDoc(doc(b, `teams/${TEAM_A}/swaps/swap-1`), { status: 'APPROVED' })));
    await check('cannot write a wellbeing log into team A',
        assertFails(setDoc(doc(b, `teams/${TEAM_A}/wellbeing/${SGH_LEAD}`), { logs: [] })));
}

console.log('\n══ AND NOBODY AT ALL GETS ANYTHING ══');
{
    const nomad = as(NOMAD);  // signed in, verified, member of no team
    await check('a signed-in user with NO team reads no roster',
        assertFails(getDoc(doc(nomad, `teams/${TEAM_A}/rosters/2026`))));
    await check('a signed-in user with NO team reads no member list',
        assertFails(getDocs(collection(nomad, `teams/${TEAM_A}/members`))));
    await check('an anonymous visitor reads no roster',
        assertFails(getDoc(doc(anon, `teams/${TEAM_A}/rosters/2026`))));
    await check('an anonymous visitor cannot enumerate teams',
        assertFails(getDocs(collection(anon, 'teams'))));
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. MEMBERSHIP IS THE GATE — what replaced the hardcoded directory
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══ membership-as-data: a member document IS the permission ══');
{
    const brandon = as(BRANDON);
    await check('a member reads their own team\'s roster',
        assertSucceeds(getDoc(doc(brandon, `teams/${TEAM_A}/rosters/2026`))));
    await check('a member reads their own team\'s member list',
        assertSucceeds(getDocs(collection(brandon, `teams/${TEAM_A}/members`))));
    await check('a member reads their own team\'s name',
        assertSucceeds(getDoc(doc(brandon, `teams/${TEAM_A}`))));

    /**
     * ⚠️ THE ONE DOCUMENT A CLIENT MUST NEVER AUTHOR. Every rule in the file trusts
     *    the membership document; a client that could write one could grant itself
     *    everything. Creating a team and its first member is `approveLeadRequest` on
     *    the Admin SDK, and inviting is a Cloud Function that can check the uid
     *    belongs to a real verified account — something rules cannot see.
     */
    await check('a member CANNOT mint a new membership, even in their own team',
        assertFails(setDoc(doc(brandon, `teams/${TEAM_A}/members/uid-stranger`), { displayName: 'Stranger', role: 'staff' })));
    await check('a LEAD cannot mint one either',
        assertFails(setDoc(doc(as(ALIF), `teams/${TEAM_A}/members/uid-stranger`), { displayName: 'Stranger', role: 'lead' })));
    await check('a member cannot promote themselves to lead',
        assertFails(updateDoc(doc(brandon, `teams/${TEAM_A}/members/${BRANDON}`), { role: 'lead' })));
    await check('a member cannot make themselves rostered',
        assertFails(updateDoc(doc(brandon, `teams/${TEAM_A}/members/${BRANDON}`), { rostered: false })));
    await check('a member CAN maintain their own availability',
        assertSucceeds(updateDoc(doc(brandon, `teams/${TEAM_A}/members/${BRANDON}`), { unavailable: ['2026-02-02'] })));
    await check('a member cannot edit a COLLEAGUE\'s availability',
        assertFails(updateDoc(doc(brandon, `teams/${TEAM_A}/members/${YING}`), { unavailable: ['2026-02-02'] })));
    await check('a lead CAN edit a colleague\'s grade and role',
        assertSucceeds(updateDoc(doc(as(ALIF), `teams/${TEAM_A}/members/${BRANDON}`), { grade: 'AH12', role: 'staff' })));
    await check('nobody may delete a membership (removal is a Cloud Function)',
        assertFails(deleteDoc(doc(as(ALIF), `teams/${TEAM_A}/members/${YING}`))));
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. THE ROSTER — generation is lead-only, one-day edits are any member
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══ roster: the verb split ══');
await seed();
await check('a lead CAN rewrite the whole roster (Generate)',
    assertSucceeds(setDoc(doc(as(ALIF), `teams/${TEAM_A}/rosters/2026`), { '2026-02-02': [{ task: 'NC' }], '2026-02-03': [{ task: 'EFT' }] })));
await seed();
await check('a staff member CANNOT rewrite the whole roster',
    assertFails(setDoc(doc(as(BRANDON), `teams/${TEAM_A}/rosters/2026`), { '2026-02-02': [{ task: 'NC' }], '2026-02-03': [{ task: 'EFT' }] })));
await check('a staff member CAN replace exactly one existing day (swap accept)',
    assertSucceeds(updateDoc(doc(as(BRANDON), `teams/${TEAM_A}/rosters/2026`), { '2026-02-02': [{ task: 'EFT', lead: 'Ying Xian' }] })));
await seed();
// ⚠️ Genuinely different values on BOTH days — see trap 1 in the header.
await check('a staff member CANNOT change two days in one write',
    assertFails(updateDoc(doc(as(BRANDON), `teams/${TEAM_A}/rosters/2026`), {
        '2026-02-02': [{ task: 'X' }], '2026-02-03': [{ task: 'Y' }],
    })));
await check('a staff member CANNOT add a day that did not exist',
    assertFails(updateDoc(doc(as(BRANDON), `teams/${TEAM_A}/rosters/2026`), { '2026-03-01': [{ task: 'X' }] })));
await check('nobody can delete the roster',
    assertFails(deleteDoc(doc(as(ALIF), `teams/${TEAM_A}/rosters/2026`))));

/**
 * THE ROSTER MASTER IS A LEAD WHO IS NOT ROSTERED, and she must still be able to
 * generate. `rostered` is an APP field; if it ever leaked into an authorization
 * check, the person who builds the roster every week would lose the ability to.
 */
await seed();
await check('the roster master (lead, not rostered) CAN still generate',
    assertSucceeds(setDoc(doc(as(NISA), `teams/${TEAM_A}/rosters/2026`), { '2026-02-02': [{ task: 'NC' }], '2026-02-03': [] })));

// ═════════════════════════════════════════════════════════════════════════════
// 4. SWAPS — only the person asked may answer
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══ swaps: routed by uid, answerable only by the target ══');
await seed();
await check('the TARGET can read the request aimed at them',
    assertSucceeds(getDocs(query(collection(as(YING), `teams/${TEAM_A}/swaps`), where('targetUid', '==', YING)))));
await check('the TARGET can approve it',
    assertSucceeds(updateDoc(doc(as(YING), `teams/${TEAM_A}/swaps/swap-1`), { status: 'APPROVED', approvedAt: 'now' })));
await seed();
/**
 * ⚠️ A COLLEAGUE CANNOT APPROVE A HAND-OVER NOBODY AGREED TO. Same team, same
 *    collection, real membership — and still denied, because the rule pins the
 *    answer to the person asked.
 */
await check('a COLLEAGUE in the same team cannot approve somebody else\'s swap',
    assertFails(updateDoc(doc(as(BRANDON), `teams/${TEAM_A}/swaps/swap-1`), { status: 'APPROVED' })));
await check('even a LEAD cannot approve on the target\'s behalf',
    assertFails(updateDoc(doc(as(ALIF), `teams/${TEAM_A}/swaps/swap-1`), { status: 'APPROVED' })));
await check('the target cannot redirect the swap to another day while answering',
    assertFails(updateDoc(doc(as(YING), `teams/${TEAM_A}/swaps/swap-1`), { status: 'APPROVED', originalShiftDate: '2026-02-09' })));
await check('a member CAN ask a colleague to cover',
    assertSucceeds(addDoc(collection(as(BRANDON), `teams/${TEAM_A}/swaps`), {
        requestedBy: 'Brandon', requestedUid: BRANDON, targetStaff: 'Ying Xian', targetUid: YING,
        originalShiftDate: '2026-02-02', swapRole: 'lead', status: 'PENDING', timestamp: serverTimestamp(),
    })));
await check('a request cannot arrive pre-APPROVED',
    assertFails(addDoc(collection(as(BRANDON), `teams/${TEAM_A}/swaps`), {
        requestedBy: 'Brandon', targetUid: YING, originalShiftDate: '2026-02-02',
        swapRole: 'lead', status: 'APPROVED', timestamp: serverTimestamp(),
    })));
await check('you cannot ask YOURSELF to cover (which would self-approve)',
    assertFails(addDoc(collection(as(BRANDON), `teams/${TEAM_A}/swaps`), {
        requestedBy: 'Brandon', targetUid: BRANDON, originalShiftDate: '2026-02-02',
        swapRole: 'lead', status: 'PENDING', timestamp: serverTimestamp(),
    })));

// ═════════════════════════════════════════════════════════════════════════════
// 5. WELLBEING — owner or lead, never a colleague
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══ wellbeing: the most sensitive collection ══');
await seed();
await check('a clinician CAN read their own record',
    assertSucceeds(getDoc(doc(as(BRANDON), `teams/${TEAM_A}/wellbeing/${BRANDON}`))));
await check('a COLLEAGUE cannot read it',
    assertFails(getDoc(doc(as(YING), `teams/${TEAM_A}/wellbeing/${BRANDON}`))));
await check('not even a LEAD can read one person\'s record directly',
    assertFails(getDoc(doc(as(ALIF), `teams/${TEAM_A}/wellbeing/${BRANDON}`))));
await check('a lead CAN list the collection (the burnout monitor)',
    assertSucceeds(getDocs(collection(as(ALIF), `teams/${TEAM_A}/wellbeing`))));
await check('a staff member CANNOT list it',
    assertFails(getDocs(collection(as(BRANDON), `teams/${TEAM_A}/wellbeing`))));
await check('a clinician CAN append to their own record',
    assertSucceeds(setDoc(doc(as(BRANDON), `teams/${TEAM_A}/wellbeing/${BRANDON}`), { logs: [{ energy: 4 }] }, { merge: true })));
await check('a clinician CANNOT write into a colleague\'s record',
    assertFails(setDoc(doc(as(YING), `teams/${TEAM_A}/wellbeing/${BRANDON}`), { logs: [] }, { merge: true })));
await check('nobody can delete a wellbeing record',
    assertFails(deleteDoc(doc(as(BRANDON), `teams/${TEAM_A}/wellbeing/${BRANDON}`))));
await check('the anonymous bucket is unreadable, even by a lead',
    assertFails(getDoc(doc(as(ALIF), `teams/${TEAM_A}/wellbeing/_anonymous_logs`))));
await check('a member CAN append to the anonymous bucket',
    assertSucceeds(setDoc(doc(as(BRANDON), `teams/${TEAM_A}/wellbeing/_anonymous_logs`), { last_updated: 'x' }, { merge: true })));

// ═════════════════════════════════════════════════════════════════════════════
// 6. THE PERSON — `users/{uid}` and the field they may not touch
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══ users: teamIds is the membership graph ══');
await seed();
await check('a user reads their own profile',
    assertSucceeds(getDoc(doc(as(BRANDON), `users/${BRANDON}`))));
await check('a user cannot read a colleague\'s profile',
    assertFails(getDoc(doc(as(YING), `users/${BRANDON}`))));
await check('a user CAN edit their own display name',
    assertSucceeds(updateDoc(doc(as(BRANDON), `users/${BRANDON}`), { displayName: 'Brandon F' })));
/**
 * ⚠️ THE SELF-GRANT. `teamIds` is the membership graph as far as the client is
 *    concerned. A user who could append to it would hand themselves a team in the
 *    switcher — the per-team rules would still deny every read, but a design that
 *    relies on downstream denials is not a design.
 */
await check('a user CANNOT add a team to their own teamIds',
    assertFails(updateDoc(doc(as(BRANDON), `users/${BRANDON}`), { teamIds: [TEAM_A, TEAM_B] })));
await check('a user with no team cannot grant themselves one',
    assertFails(updateDoc(doc(as(NOMAD), `users/${NOMAD}`), { teamIds: [TEAM_A] })));

// ═════════════════════════════════════════════════════════════════════════════
// 7. ONBOARDING — config and lead requests
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══ config: the allowlist is public, the super-admin list is not ══');
await seed();
await check('an anonymous visitor CAN read config/domains (the pre-sign-in gate)',
    assertSucceeds(getDoc(doc(anon, 'config/domains'))));
await check('an anonymous visitor CANNOT read config/superAdmins',
    assertFails(getDoc(doc(anon, 'config/superAdmins'))));
await check('a signed-in LEAD also cannot read config/superAdmins',
    assertFails(getDoc(doc(as(ALIF), 'config/superAdmins'))));
await check('nobody can list config (which would leak superAdmins by another route)',
    assertFails(getDocs(collection(anon, 'config'))));
await check('nobody can widen the allowlist from a client',
    assertFails(setDoc(doc(as(ALIF), 'config/domains'), { allowed: ['gmail.com'] })));

console.log('\n══ lead_requests: a claim, not a grant ══');
await env.clearFirestore();
const NEWLEAD = 'uid-newlead';
const newLead = env.authenticatedContext(NEWLEAD, { email: `${NEWLEAD}@kkh.com.sg`, email_verified: false }).firestore();
const request = (over = {}) => ({
    uid: NEWLEAD, email: `${NEWLEAD}@kkh.com.sg`, displayName: 'Nur', role: 'lead',
    institution: 'KKH', department: 'Respiratory Therapy', profession: 'respiratory-therapist',
    proposedTeamId: 'kkh-respiratory-therapy', status: 'pending',
    requestedAt: '2026-08-21T00:00:00.000Z', ...over,
});

// Written seconds after registration, BEFORE the verification email arrives — so an
// unverified account must be able to write it. Verification is enforced in the
// approval function, where it can be.
await check('a brand-new UNVERIFIED account CAN lodge its own request',
    assertSucceeds(setDoc(doc(newLead, `lead_requests/${NEWLEAD}`), request())));
await check('and CAN read it back (which drives the holding screen)',
    assertSucceeds(getDoc(doc(newLead, `lead_requests/${NEWLEAD}`))));

await env.clearFirestore();
await check('CANNOT lodge a request under somebody ELSE\'S uid',
    assertFails(setDoc(doc(newLead, 'lead_requests/somebodyelse'), request({ uid: 'somebodyelse' }))));
await check('CANNOT approve itself by writing status: approved',
    assertFails(setDoc(doc(newLead, `lead_requests/${NEWLEAD}`), request({ status: 'approved' }))));
await check('CANNOT claim an email other than the one on its token',
    assertFails(setDoc(doc(newLead, `lead_requests/${NEWLEAD}`), request({ email: 'someone.else@kkh.com.sg' }))));
await check('CANNOT declare a role outside lead/supervisor/administrator',
    assertFails(setDoc(doc(newLead, `lead_requests/${NEWLEAD}`), request({ role: 'superuser' }))));
await check('a path-escaping proposedTeamId is refused by the slug pattern',
    assertFails(setDoc(doc(newLead, `lead_requests/${NEWLEAD}`), request({ proposedTeamId: 'a/../b' }))));
await check('an extra key is refused (shape pinned)',
    assertFails(setDoc(doc(newLead, `lead_requests/${NEWLEAD}`), request({ isSuperAdmin: true }))));
await check('an anonymous visitor cannot lodge anything',
    assertFails(setDoc(doc(anon, 'lead_requests/anon'), request())));

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), `lead_requests/${NEWLEAD}`), request());
});
await check('CANNOT edit its own request after lodging it (no self-approval by update)',
    assertFails(updateDoc(doc(newLead, `lead_requests/${NEWLEAD}`), { status: 'approved' })));
await check('a colleague CANNOT read somebody else\'s request',
    assertFails(getDoc(doc(as(BRANDON), `lead_requests/${NEWLEAD}`))));
await check('not even a super-admin can LIST requests (the function serves them)',
    assertFails(getDocs(collection(as(ALIF), 'lead_requests'))));

// ═════════════════════════════════════════════════════════════════════════════
// 8. PUBLIC SINKS — the two pathways that must keep working without an account
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══ public sinks: shape is the gate, not identity ══');
await seed();
const feedback = () => ({ type: 'bug', message: 'x', reportedBy: 'Anon', environment: 'Sandbox', timestamp: serverTimestamp(), userAgent: 'ua' });
await check('an anonymous visitor CAN file feedback (the sandbox route)',
    assertSucceeds(addDoc(collection(anon, 'beta_feedback'), feedback())));
await check('an extra key is refused',
    assertFails(addDoc(collection(anon, 'beta_feedback'), { ...feedback(), sneaky: 1 })));
await check('a message over 10,000 chars is refused',
    assertFails(addDoc(collection(anon, 'beta_feedback'), { ...feedback(), message: 'x'.repeat(10001) })));
await check('a client-supplied timestamp is refused (server clock pinned)',
    assertFails(addDoc(collection(anon, 'beta_feedback'), { ...feedback(), timestamp: new Date('2020-01-01') })));
await check('even a lead cannot read feedback back (write-only sink)',
    assertFails(getDocs(collection(as(ALIF), 'beta_feedback'))));

const telemetry = () => ({ createdAt: serverTimestamp(), postalSector: '54' });
await check('the public CAN submit screening telemetry (the live pathway)',
    assertSucceeds(addDoc(collection(anon, 'community_assessments'), telemetry())));
await check('a missing postalSector is refused',
    assertFails(addDoc(collection(anon, 'community_assessments'), { createdAt: serverTimestamp() })));
/**
 * ⚠️ A WRITE-ONLY SINK, AND THE READ IS DENIED TO EVERYBODY — including a lead, and
 *    including a super-admin. These records carry postal sector, age band, gender,
 *    race, housing type, income adequacy, food insecurity and a chest-pain flag, and
 *    NOTHING in the app reads them back. An earlier version of this suite asserted
 *    "a directory member CAN read submissions (analysis)", which certified a grant
 *    that served a screen that does not exist.
 */
await check('the public CANNOT read submissions back',
    assertFails(getDocs(collection(anon, 'community_assessments'))));
await check('a signed-in member cannot read them either',
    assertFails(getDocs(collection(as(BRANDON), 'community_assessments'))));
await check('not even a lead can read them',
    assertFails(getDocs(collection(as(ALIF), 'community_assessments'))));
await check('nobody can read one back by id',
    assertFails(getDoc(doc(as(ALIF), 'community_assessments/anything'))));
await check('and nobody can edit a submission after the fact',
    assertFails(updateDoc(doc(as(ALIF), 'community_assessments/anything'), { score: 0 })));

// ═════════════════════════════════════════════════════════════════════════════
// 9. THE PRE-MIGRATION COLLECTIONS ARE UNREACHABLE
// ═════════════════════════════════════════════════════════════════════════════
//
// The migration COPIES rather than moves, so these documents still exist. The new
// bundle must not be able to reach them — otherwise a stale path left somewhere in
// the app would keep working, and the very defect the rewrite removes would survive
// invisibly.
console.log('\n══ the old global collections are sealed ══');
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (c) => {
    const raw = c.firestore();
    await setDoc(doc(raw, 'system_data/roster_2026'), { '2026-02-02': [] });
    await setDoc(doc(raw, 'wellbeing_history/brandon'), { logs: [] });
    await setDoc(doc(raw, 'staff_loads/brandon'), { data: [] });
    await setDoc(doc(raw, 'cep_team/brandon'), { projects: [] });
    await setDoc(doc(raw, `teams/${TEAM_A}/members/${BRANDON}`), { displayName: 'Brandon', role: 'staff' });
});
{
    const brandon = as(BRANDON);   // a real, current member of team A
    await check('the old global roster is unreadable',
        assertFails(getDoc(doc(brandon, 'system_data/roster_2026'))));
    await check('the old global wellbeing_history is unreadable',
        assertFails(getDoc(doc(brandon, 'wellbeing_history/brandon'))));
    await check('the old global staff_loads is unreadable',
        assertFails(getDoc(doc(brandon, 'staff_loads/brandon'))));
    await check('the old global cep_team is unreadable',
        assertFails(getDoc(doc(brandon, 'cep_team/brandon'))));
    await check('and none of them is writable',
        assertFails(setDoc(doc(brandon, 'system_data/roster_2026'), { x: 1 })));
}

await env.cleanup();
console.log(`\n${'═'.repeat(64)}\n  ${pass} passed, ${fail} failed\n${'═'.repeat(64)}`);
process.exit(fail === 0 ? 0 : 1);
