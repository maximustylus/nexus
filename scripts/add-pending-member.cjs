'use strict';
/**
 * ==============================================================================
 * ADD-PENDING-MEMBER — roster a colleague who has not registered yet
 * ==============================================================================
 *
 * Run, from the repo root:
 *
 *   # 0. ONCE — firebase-admin is not a dependency of this repo.
 *   npm i --no-save firebase-admin
 *
 *   # 1. DRY RUN — the default. Writes nothing, and names the project first.
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json \
 *     node scripts/add-pending-member.cjs --team kkh-sport-exercise-medicine \
 *       --person brandon.feng.gq@kkh.com.sg:Brandon:AH11 \
 *       --person fadzlynn.mohamad.fadzully@kkh.com.sg:Fadzlynn:AH13
 *
 *   # 2. FOR REAL — only after reading the dry run.
 *   …same command… --write
 *
 * ⚠️ WHY THIS EXISTS, AND WHAT IT IS NOT.
 *
 *    NEXUS adds people who already have an account: `inviteMember` resolves an
 *    address to a Firebase uid and refuses when there is none, because a membership
 *    document is KEYED by uid. That is right — a lead who could mint a membership
 *    for an arbitrary uid could sign in as it, which is why `firestore.rules` has
 *    `allow create: if false` on the members subcollection.
 *
 *    But the roster does not need a uid. `rosteredMembers` is
 *    `members.filter(p => p.rostered !== false)`, and the engine rosters
 *    `displayName`. A uid is needed for exactly two things: signing in, and being
 *    the target of a coverage swap. So a member record with no real uid is
 *    ROSTERABLE and CANNOT BE SIGNED IN AS — which is the property that makes this
 *    safe rather than a hole.
 *
 *    So this writes a PLACEHOLDER: a member the roster can staff, keyed by an id
 *    derived from their email and prefixed `pending-`, which is not a Firebase uid
 *    and never will be. The department can roster four months tonight instead of
 *    waiting on a registration relay.
 *
 * ⚠️ THE DUPLICATE THIS WOULD OTHERWISE CAUSE, and how it is closed. When Brandon
 *    does register and the lead adds him properly, `inviteMember` creates a
 *    membership under his REAL uid — and the placeholder would still be there, so
 *    he would appear twice in the staff pool and could be double-booked. That is
 *    handled in `functions/teamMembership.js`: a successful invite deletes any
 *    placeholder carrying the same email. This script and that deletion are one
 *    feature; neither is correct alone.
 *
 * ⚠️ WHAT A PLACEHOLDER CANNOT DO, stated so nobody expects otherwise: sign in, see
 *    their own roster, request cover, be the target of a swap, or log wellbeing. It
 *    is a name and a grade in the staff pool. Everything else waits for the real
 *    account, which is the point at which they become a person rather than a row.
 *
 * ── CONVENTIONS FROM `migrate-to-teams.cjs` ──────────────────────────────────
 * Dry run by default; the project named before anything is read; an existing
 * document left alone and reported rather than overwritten.
 */

/**
 * Subpath imports, not the root namespace — firebase-admin v14 removed the service
 * namespaces from the root export, so `admin.firestore` is `undefined` and fails
 * with a message that reads like a credential problem. See `migrate-to-teams.cjs`.
 */
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { describeCredentialFile } = require('./credential.cjs');

const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');

const valueFor = (flag) => {
    const i = argv.indexOf(flag);
    return i === -1 ? null : (argv[i + 1] || null);
};
const valuesFor = (flag) => argv
    .map((arg, i) => (arg === flag ? argv[i + 1] : null))
    .filter((v) => typeof v === 'string' && v.trim() !== '' && !v.startsWith('--'));

/**
 * `email:Name:AH11` -> the three fields, or an explanation.
 *
 * A colon-delimited triple rather than three parallel flags: parallel lists silently
 * mis-pair when one is shorter, and mis-pairing here writes somebody else's grade
 * against a colleague's name.
 */
const parsePerson = (raw) => {
    const parts = String(raw).split(':');
    if (parts.length !== 3) {
        return { error: `Expected email:Name:Grade — got ${JSON.stringify(raw)}.` };
    }
    const [email, displayName, grade] = parts.map((p) => p.trim());
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: `Not an email: ${email}` };
    if (displayName === '') return { error: `No name given for ${email}` };
    if (!/^(AH|NN)\d{1,2}$/.test(grade)) {
        return { error: `Grade "${grade}" for ${email} is not AH7–AH17 or NN7–NN10.` };
    }
    return { email: email.toLowerCase(), displayName, grade };
};

/**
 * A stable id for a placeholder, derived from the email so the same person cannot be
 * added twice under two ids, and prefixed so that everything downstream — the
 * deletion in `inviteMember`, a human reading the console — can tell at a glance
 * that this is not a Firebase uid.
 */
const PENDING_PREFIX = 'pending-';
const pendingIdFor = (email) => PENDING_PREFIX + email.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

const main = async () => {
    const credential = describeCredentialFile(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    if (!credential.ok) {
        console.error(`\n✗ ${credential.reason}\n`);
        process.exit(1);
    }

    const teamId = valueFor('--team');
    if (!teamId) {
        console.error('\n✗ Which team? Pass --team <teamId>.\n');
        process.exit(1);
    }

    const parsed = valuesFor('--person').map(parsePerson);
    const bad = parsed.filter((p) => p.error);
    if (parsed.length === 0) {
        console.error('\n✗ Nobody to add. Pass --person email:Name:Grade (repeatable).\n');
        process.exit(1);
    }
    if (bad.length > 0) {
        bad.forEach((p) => console.error(`✗ ${p.error}`));
        process.exit(1);
    }

    console.log('\n──────────────────────────────────────────────────────────────');
    console.log(`  PROJECT : ${credential.projectId}`);
    console.log(`  KEY     : ${credential.path}`);
    console.log(`  TEAM    : ${teamId}`);
    console.log(`  MODE    : ${WRITE ? 'WRITE' : 'DRY RUN (pass --write to apply)'}`);
    console.log('──────────────────────────────────────────────────────────────');
    console.log('  Check the project against the Firebase console before --write.\n');

    initializeApp({ credential: applicationDefault() });
    const db = getFirestore();

    const teamSnap = await db.doc(`teams/${teamId}`).get();
    if (!teamSnap.exists) {
        console.error(`✗ No team ${teamId}. Nothing written.\n`);
        process.exit(1);
    }
    console.log(`Team found: ${teamSnap.data().name || teamId}\n`);

    // Everyone already in the team, so an address that HAS registered is reported
    // rather than shadowed by a placeholder.
    const existing = await db.collection(`teams/${teamId}/members`).get();
    const byEmail = new Map();
    existing.forEach((doc) => {
        const email = (doc.data().email || '').toLowerCase();
        if (email) byEmail.set(email, { id: doc.id, data: doc.data() });
    });

    const now = new Date().toISOString();
    for (const person of parsed) {
        const already = byEmail.get(person.email);
        if (already) {
            const kind = already.id.startsWith(PENDING_PREFIX) ? 'placeholder' : 'REAL ACCOUNT';
            console.log(`${person.email}`);
            console.log(`  already in the team as a ${kind} (${already.id}) — left alone.`);
            if (kind === 'REAL ACCOUNT') {
                console.log('  They have registered, so add them through the app instead.');
            }
            console.log('');
            continue;
        }

        const id = pendingIdFor(person.email);
        console.log(`${person.email}`);
        console.log(`  would create members/${id}`);
        console.log(`    displayName ${person.displayName} · role staff · rostered true`);
        console.log(`  would create grades/${id} → ${person.grade}`);

        if (WRITE) {
            await db.doc(`teams/${teamId}/members/${id}`).set({
                displayName: person.displayName,
                email: person.email,
                role: 'staff',
                rostered: true,
                // Empty rather than absent, so the member editor has something to
                // render and a missing field never means "unknown" versus "not set".
                title: '',
                profession: '',
                fte: 1,
                skills: [],
                unavailable: [],
                joinedAt: now,
                // ⚠️ THE FLAG EVERYTHING ELSE READS. `pendingEmail` is what
                //    `inviteMember` matches on to delete this row once the real
                //    account exists, and what a UI can use to label the person as
                //    not yet registered. The id prefix is for humans; this is for code.
                pendingEmail: person.email,
                createdBy: 'add-pending-member',
            });
            // Grade lives in its own collection — it left the member document because
            // a membership is readable by every colleague and a grade is not.
            await db.doc(`teams/${teamId}/grades/${id}`).set({
                grade: person.grade,
                updatedAt: now,
                setBy: 'lead',
            });
            console.log('  ✓ created');
        }
        console.log('');
    }

    console.log(WRITE
        ? 'Done. They are in the staff pool and can be rostered now. They still cannot sign\n'
          + 'in — that waits for their own registration, at which point adding them through\n'
          + 'the app replaces the placeholder automatically.\n'
        : 'Dry run only — nothing was written. Re-run with --write.\n');
};

main().catch((error) => {
    console.error('\n✗ failed:', error && error.message ? error.message : error, '\n');
    process.exit(1);
});
