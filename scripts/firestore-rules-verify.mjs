// scripts/firestore-rules-verify.mjs
//
// Executable re-verification of `firestore.rules`. Run:
//
//   mkdir -p /tmp/nexus-rules && cd /tmp/nexus-rules
//   npm init -y && npm i firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10
//   cp <repo>/firestore.rules .
//   cp <repo>/scripts/firestore-rules-verify.mjs .
//   printf '{"firestore":{"rules":"firestore.rules"},"emulators":{"firestore":{"port":8080},"ui":{"enabled":false}}}' > firebase.json
//   ./node_modules/.bin/firebase emulators:exec --only firestore \
//       --project demo-nexus-rules "node firestore-rules-verify.mjs"
//
// WHY IT LIVES IN `scripts/` AND NOT `src/`. `vitest.config.js` collects
// `src/**/*.{test,spec}.{js,jsx}`; a rules test placed there would fail every
// build and block deploys, because CI has no Firestore emulator. `scripts/` is
// outside that glob, so this is committed and runnable without touching `npm test`.
// The deps above are deliberately NOT in `package.json` — firebase-tools is ~685
// packages and CI never needs them.
//
// It never contacts `idc-app-e0c59`: the project id is `demo-nexus-rules`, which
// the CLI treats as a demo project and refuses to let reach real services.
//
// WHAT IT COVERS. The two blocks changed by the 2026-08-18 console reconciliation
// (`beta_feedback`, `community_assessments`), the Q6 fix itself (a verified
// @kkh.com.sg address outside the directory is no longer omnipotent), the roster
// verb split, and `wellbeing_history`. It does NOT replace the 139-check record in
// `firestore.rules.README.md` §5.2 — it is the delta plus the headline regressions.
//
// ⚠️ ONE TRAP, PAID FOR ONCE. `changedKeys()` is `diff().affectedKeys()` — keys
// whose VALUE CHANGED, not keys written. The first draft of the "two days in one
// write" case wrote `[]` over an already-`[]` day, which is not an affected key, so
// only one key changed and the case passed spuriously in the direction that would
// have hidden a real hole. Any new case here must write genuinely different values.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore';

const env = await initializeTestEnvironment({
    projectId: 'demo-nexus-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
});

const member = (email) => env.authenticatedContext(email.replace(/[^a-z0-9]/gi, ''), { email, email_verified: true });
const ADMIN = 'muhammad.alif@kkh.com.sg';        // in directory + adminEmails
const CEP = 'brandon.feng.gg@kkh.com.sg';        // in directory, not admin
const CEP2 = 'lim.ying.xian@kkh.com.sg';         // in directory, not admin
const OUTSIDER = 'random.person@kkh.com.sg';     // verified KKH, NOT in directory ← the Q6 case

let pass = 0, fail = 0;
const check = async (name, promise) => {
    try { await promise; console.log(`  ✅ ${name}`); pass += 1; }
    catch (e) { console.log(`  ❌ ${name}\n       ${String(e).split('\n')[0].slice(0, 140)}`); fail += 1; }
};

const clean = async () => { await env.clearFirestore(); };

// ── 1. beta_feedback — CHANGED BLOCK ─────────────────────────────────────────
console.log('\n── beta_feedback (changed: anonymous create, shape-pinned) ──');
await clean();
const good = () => ({ type: 'bug', message: 'x', reportedBy: 'Anon', environment: 'Sandbox', timestamp: serverTimestamp(), userAgent: 'ua' });
{
    const anon = env.unauthenticatedContext().firestore();
    await check('anonymous visitor CAN file feedback (the sandbox route)',
        assertSucceeds(addDoc(collection(anon, 'beta_feedback'), good())));
    await check('extra key is refused',
        assertFails(addDoc(collection(anon, 'beta_feedback'), { ...good(), sneaky: 1 })));
    await check('message over 10,000 chars is refused',
        assertFails(addDoc(collection(anon, 'beta_feedback'), { ...good(), message: 'x'.repeat(10001) })));
    await check('empty message is refused',
        assertFails(addDoc(collection(anon, 'beta_feedback'), { ...good(), message: '' })));
    await check('client-supplied timestamp is refused (server clock pinned)',
        assertFails(addDoc(collection(anon, 'beta_feedback'), { ...good(), timestamp: new Date('2020-01-01') })));
    await check('anonymous CANNOT read feedback back',
        assertFails(getDocs(collection(anon, 'beta_feedback'))));
}
await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'beta_feedback/seed'), { type: 'bug', message: 'seeded' });
});
await check('even an ADMIN cannot read feedback (write-only sink)',
    assertFails(getDoc(doc(member(ADMIN).firestore(), 'beta_feedback/seed'))));
await check('nobody can update feedback',
    assertFails(updateDoc(doc(member(ADMIN).firestore(), 'beta_feedback/seed'), { message: 'edited' })));

// ── 2. community_assessments — CHANGED BLOCK ─────────────────────────────────
console.log('\n── community_assessments (changed: public create kept, shape-pinned) ──');
await clean();
const tel = () => ({ createdAt: serverTimestamp(), postalSector: '54', score: 3 });
{
    const anon = env.unauthenticatedContext().firestore();
    await check('member of the public CAN submit telemetry (the live pathway)',
        assertSucceeds(addDoc(collection(anon, 'community_assessments'), tel())));
    await check('missing postalSector is refused',
        assertFails(addDoc(collection(anon, 'community_assessments'), { createdAt: serverTimestamp() })));
    await check('postalSector over 4 chars is refused',
        assertFails(addDoc(collection(anon, 'community_assessments'), { ...tel(), postalSector: '12345' })));
    await check('back-dated createdAt is refused',
        assertFails(addDoc(collection(anon, 'community_assessments'), { ...tel(), createdAt: new Date('2020-01-01') })));
    const fat = { createdAt: serverTimestamp(), postalSector: '54' };
    for (let i = 0; i < 25; i += 1) fat[`k${i}`] = i;
    await check('more than 20 keys is refused',
        assertFails(addDoc(collection(anon, 'community_assessments'), fat)));
    await check('the public CANNOT read submissions back',
        assertFails(getDocs(collection(anon, 'community_assessments'))));
}
await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'community_assessments/seed'), { createdAt: new Date(), postalSector: '54' });
});
await check('a directory member CAN read submissions (analysis)',
    assertSucceeds(getDoc(doc(member(ADMIN).firestore(), 'community_assessments/seed'))));
await check('a verified KKH OUTSIDER cannot read submissions',
    assertFails(getDoc(doc(member(OUTSIDER).firestore(), 'community_assessments/seed'))));

// ── 3. THE Q6 FIX ITSELF — the whole reason for this deploy ──────────────────
console.log('\n── Q6: a verified @kkh.com.sg outsider is no longer omnipotent ──');
await clean();
await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    await setDoc(doc(d, 'system_data/roster_2026'), { '2026-09-07': [{ task: 'T', lead: 'Brandon' }] });
    await setDoc(doc(d, 'wellbeing_history/brandon'), { logs: [{ energy: 2 }] });
    await setDoc(doc(d, 'shift_swaps/s1'), { requestedBy: 'Brandon', targetStaff: 'Ying Xian', status: 'PENDING' });
});
{
    const out = member(OUTSIDER).firestore();
    await check('outsider CANNOT read the burnout record  ← was readable before',
        assertFails(getDoc(doc(out, 'wellbeing_history/brandon'))));
    await check('outsider CANNOT read the duty roster      ← was readable before',
        assertFails(getDoc(doc(out, 'system_data/roster_2026'))));
    await check('outsider CANNOT overwrite the roster      ← was writable before',
        assertFails(setDoc(doc(out, 'system_data/roster_2026'), { '2026-09-07': [] })));
    await check('outsider CANNOT read swaps',
        assertFails(getDoc(doc(out, 'shift_swaps/s1'))));
}

// ── 4. Roster verb split — unchanged block, regression cover ─────────────────
console.log('\n── roster: generation is admin-only, one-day edit is any member ──');
await check('admin CAN rewrite the whole roster (Generate)',
    assertSucceeds(setDoc(doc(member(ADMIN).firestore(), 'system_data/roster_2026'), { '2026-09-07': [], '2026-09-08': [] }, { merge: true })));
await check('CEP CANNOT rewrite the whole roster',
    assertFails(setDoc(doc(member(CEP).firestore(), 'system_data/roster_2026'), { '2026-09-09': [] }, { merge: true })));
await check('CEP CAN replace exactly one existing day (swap accept)',
    assertSucceeds(updateDoc(doc(member(CEP).firestore(), 'system_data/roster_2026'), { '2026-09-07': [{ task: 'T', lead: 'Brandon' }] })));
// NOTE: `changedKeys()` is `diff().affectedKeys()` — keys whose VALUE CHANGED, not
// keys written. Writing a key its existing value back is not an affected key, so
// both days here must carry genuinely new values or this test proves nothing.
// (The first draft wrote `[]` over an already-`[]` day and passed spuriously.)
await check('CEP CANNOT change two days in one write',
    assertFails(updateDoc(doc(member(CEP).firestore(), 'system_data/roster_2026'), {
        '2026-09-07': [{ task: 'CHANGED-A', lead: 'Brandon' }],
        '2026-09-08': [{ task: 'CHANGED-B', lead: 'Brandon' }],
    })));
await check('CEP CANNOT add a new day that did not exist',
    assertFails(updateDoc(doc(member(CEP).firestore(), 'system_data/roster_2026'), {
        '2026-12-25': [{ task: 'INVENTED', lead: 'Brandon' }],
    })));
await check('nobody can delete the roster',
    assertFails(deleteDoc(doc(member(ADMIN).firestore(), 'system_data/roster_2026'))));

// ── 5. wellbeing — the most sensitive collection ─────────────────────────────
console.log('\n── wellbeing_history: owner + admins only ──');
await check('a clinician CAN read their own record',
    assertSucceeds(getDoc(doc(member(CEP).firestore(), 'wellbeing_history/brandon'))));
await check("a colleague CANNOT read another clinician's record",
    assertFails(getDoc(doc(member(CEP2).firestore(), 'wellbeing_history/brandon'))));
await check('an admin CAN list the collection (burnout panel)',
    assertSucceeds(getDocs(collection(member(ADMIN).firestore(), 'wellbeing_history'))));
await check('a non-admin member CANNOT list the collection',
    assertFails(getDocs(collection(member(CEP).firestore(), 'wellbeing_history'))));
await check('the anonymous bucket is not readable, even by an admin',
    assertFails(getDoc(doc(member(ADMIN).firestore(), 'wellbeing_history/_anonymous_logs'))));

await env.cleanup();
console.log(`\n${'═'.repeat(60)}\n  ${pass} passed, ${fail} failed\n${'═'.repeat(60)}`);
process.exit(fail === 0 ? 0 : 1);
