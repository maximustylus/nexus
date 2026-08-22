'use strict';

/**
 * ==============================================================================
 * MIGRATE TO TEAMS — the one-way door, made as two-way as it can be
 * ==============================================================================
 *
 * Creates team #1 from `scripts/team-one-manifest.cjs` and COPIES the live data
 * beneath it. Run:
 *
 *   # 1. DRY RUN — this is the default and writes nothing.
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json \
 *     node scripts/migrate-to-teams.cjs
 *
 *   # 2. FOR REAL — only after reading the dry run.
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json \
 *     node scripts/migrate-to-teams.cjs --write
 *
 * ── THE FOUR PROPERTIES THAT MAKE THIS SURVIVABLE ────────────────────────────
 *
 * 1. IT COPIES AND NEVER MOVES. Not one legacy document is modified or deleted.
 *    `system_data/roster_2026` is left byte-identical. That is the rollback: put
 *    the previous rules back from console history, redeploy the previous bundle,
 *    and the old app reads its own data as if nothing happened.
 *
 * 2. DRY RUN IS THE DEFAULT. Writing requires `--write`, typed deliberately.
 *
 * 3. IT IS IDEMPOTENT. Every write is a `set(..., {merge: true})` or an
 *    `arrayUnion`, so running it twice produces the same state as running it once.
 *    A half-finished run is recovered by running it again, not by hand-repair.
 *
 * 4. IT REPORTS WHAT IT COULD NOT DO. Anything unmatched — a legacy document whose
 *    id belongs to nobody in the manifest, an address with no auth account — is
 *    PRINTED, never guessed at and never silently dropped. A migration that
 *    quietly skips a clinician is indistinguishable from one that worked.
 *
 * ⚠️ THE ORDER MATTERS AND IS NOT NEGOTIABLE: run this BEFORE merging to `main`.
 *    Pushing to `main` auto-deploys, and the rewired app reads `teams/…`. Deploy
 *    first and the team sees empty everything until this catches up.
 *
 * ── CREDENTIALS ──────────────────────────────────────────────────────────────
 *
 * Firebase Console → Project settings → Service accounts → Generate new private
 * key. ⚠️ That file is a master key to the whole project. Keep it outside the repo,
 * delete it when you are done, and never commit it — `.gitignore` cannot protect
 * you from a path you type by hand.
 */

/**
 * ⚠️ SUBPATH IMPORTS, NOT THE `admin.firestore()` NAMESPACE, AND THAT IS LOAD-BEARING.
 *
 * This script died in the owner's hands with `TypeError: admin.firestore is not a
 * function` at the line that opened the database — before it had read anything,
 * which is the one good thing about it.
 *
 * The cause: `npm install firebase-admin` with no version now resolves to **v14**,
 * and v14 removed the service namespaces from the root export. `require('firebase-admin')`
 * in v14 returns app lifecycle only — `initializeApp`, `getApp`, `getApps`,
 * `deleteApp`, `cert`, `applicationDefault`, `refreshToken` and the error types.
 * `admin.firestore` and `admin.auth` are both `undefined`. `admin.initializeApp()`
 * on the line above still succeeds, so the failure lands one line later and looks
 * like a broken script rather than a wrong dependency.
 *
 * `firebase-admin/firestore` and `firebase-admin/auth` have existed since v10 and
 * work identically on v13 and v14, so importing this way means the person running
 * a one-shot migration against live clinical data does not also have to get a
 * version pin right. `functions/package.json` pins ^13.6.0; this file is run by
 * hand from the repo root, where nothing pins anything.
 */
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { TEAM_ONE, MEMBERS, EXCLUDED, LEGACY_DIRECTORY_SIZE } = require('./team-one-manifest.cjs');
// The decision "whose record is this?" lives in its own module so it can be tested
// without a service-account key — see `scripts/legacyMatch.test.mjs`. Logic that can
// only be exercised by pointing it at production is logic nobody checks.
const { buildLegacyIndex, classifyLegacyDoc } = require('./legacyMatch.cjs');
const { reconcile } = require('./reconcile.cjs');
const { classifyAuthFailure, environmentReport } = require('./authFailure.cjs');
const { describeCredentialFile } = require('./credential.cjs');

const WRITE = process.argv.includes('--write');
const TEAM = TEAM_ONE.teamId;

initializeApp();
const db = getFirestore();

// ── Reporting ────────────────────────────────────────────────────────────────
// Everything this script would do goes through one of these, so the dry run and
// the real run print exactly the same lines. A dry run that describes a different
// plan from the one that executes is worse than no dry run at all.
const planned = [];
const warnings = [];
const errors = [];

const plan = (what, path) => { planned.push({ what, path }); console.log(`  · ${what.padEnd(28)} ${path}`); };
const warn = (message) => { warnings.push(message); console.log(`  ⚠️  ${message}`); };
const fail = (message) => { errors.push(message); console.log(`  ❌ ${message}`); };
const head = (title) => console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 72 - title.length))}`);

/** Every write in this file funnels through here, so `--write` is checked once. */
const write = async (ref, data, what) => {
    plan(what, ref.path);
    if (WRITE) await ref.set(data, { merge: true });
};

// =============================================================================

async function main() {
    console.log('='.repeat(78));
    console.log(`  NEXUS — migrate to teams        ${WRITE ? '*** WRITING ***' : 'DRY RUN (writes nothing)'}`);
    console.log(`  Team: ${TEAM_ONE.name} (${TEAM_ONE.institution})   →   teams/${TEAM}`);
    console.log('='.repeat(78));

    // ── 0. Say which project this is pointed at, before touching anything ─────
    //
    // ⚠️ A KEY FOR THE WRONG PROJECT LOOKS EXACTLY LIKE AN EMPTY ONE. Every lookup
    //    succeeds at the transport level and finds nobody, so the run reports that
    //    none of the clinicians have registered — which is true of that project and
    //    entirely misleading about this one. There is no later point where the
    //    mistake becomes visible, so it is named here, on the first line, where it
    //    can be compared against the Firebase console before anything is written.
    const cred = describeCredentialFile(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    console.log(`  Project: ${cred.projectId || '(none named)'}`);
    console.log(`  Key:     ${cred.path || '(GOOGLE_APPLICATION_CREDENTIALS is not set)'}`);
    if (cred.clientEmail) console.log(`  As:      ${cred.clientEmail}`);
    if (!cred.ok) {
        fail(cred.problem);
        return summary();
    }
    console.log('');
    console.log(`  ⚠️  Is "${cred.projectId}" the NEXUS project? Compare it against the Firebase`);
    console.log('      console before continuing. A key for another project finds none of your');
    console.log('      colleagues and reports that none of them have registered.');
    console.log('='.repeat(78));

    // ── 1. Resolve every email to a Firebase Auth uid ─────────────────────────
    //
    // ⚠️ AN ADDRESS WITH NO ACCOUNT IS SKIPPED, NEVER INVENTED. A membership under
    //    a uid nobody holds is a document that can never be read, never used and
    //    never cleaned up — and it would make the member count look right while a
    //    clinician had no access.
    head('1. Resolving accounts');
    const resolved = [];
    for (const member of MEMBERS) {
        try {
            const user = await getAuth().getUserByEmail(member.email);
            resolved.push({ ...member, uid: user.uid, emailVerified: user.emailVerified });
            const flag = user.emailVerified ? '' : '   (email NOT verified)';
            console.log(`  ✓ ${member.displayName.padEnd(12)} ${member.email.padEnd(46)} ${user.uid}${flag}`);
            if (!user.emailVerified) {
                warn(`${member.displayName} has not verified their email. They will be a member, but cannot sign in until they do.`);
            }
        } catch (error) {
            // ⚠️ THE ERROR IS READ, NOT ASSUMED. This used to report every failure as
            //    "NO AUTH ACCOUNT", so a wrong key or a key for the wrong project
            //    printed seven clinicians' names and told the reader they each needed
            //    to register. See `scripts/authFailure.cjs`.
            const classified = classifyAuthFailure(error);
            if (classified.kind === 'no-account') {
                fail(`NO AUTH ACCOUNT for ${member.displayName} <${member.email}> — skipped. `
                   + 'They must register once, then re-run this script; it is idempotent.');
                continue;
            }
            // Environmental: identical for everyone left. Stop, so the one real
            // error is the last thing on screen rather than the first of eight.
            environmentReport(member, classified).forEach((line, i) => (i === 0 ? fail(line) : console.log(`  ${line}`)));
            return summary();
        }
    }

    // THE RECONCILIATION — the line the owner reads to decide whether to type
    // `--write`. Its wording is deliberate and tested; see `scripts/reconcile.cjs`.
    console.log('');
    reconcile({
        resolvedCount: resolved.length,
        memberCount:   MEMBERS.length,
        excludedCount: EXCLUDED.length,
        legacySize:    LEGACY_DIRECTORY_SIZE,
    }).lines.forEach((line) => console.log(`  ${line}`));
    console.log(`  ${EXCLUDED.length} excluded by decision:`);
    EXCLUDED.forEach((person) => console.log(`  — excluded: ${person.displayName.padEnd(12)} (${person.was})`));

    if (resolved.length === 0) {
        fail('Nothing resolved. Refusing to create an empty team.');
        return summary();
    }
    if (!resolved.some((member) => member.role === 'lead')) {
        fail('No lead resolved. A team with no lead cannot be configured or invited into. Refusing.');
        return summary();
    }

    const byLegacy = buildLegacyIndex(resolved);
    const uidByName = new Map(resolved.map((member) => [member.displayName, member.uid]));

    // ── 2. The team and its memberships ───────────────────────────────────────
    head('2. Team and memberships');
    const lead = resolved.find((member) => member.email.toLowerCase() === TEAM_ONE.leadEmail.toLowerCase());
    await write(db.doc(`teams/${TEAM}`), {
        name: TEAM_ONE.name,
        institution: TEAM_ONE.institution,
        department: TEAM_ONE.department,
        profession: TEAM_ONE.profession,
        leadUid: lead ? lead.uid : resolved.find((m) => m.role === 'lead').uid,
        createdAt: new Date().toISOString(),
        createdBy: 'migrate-to-teams',
    }, 'team');

    for (const member of resolved) {
        await write(db.doc(`teams/${TEAM}/members/${member.uid}`), {
            displayName: member.displayName,
            email: member.email.toLowerCase(),
            role: member.role,
            rostered: member.rostered,
            title: member.title,
            // Empty rather than absent, so the member editor has something to render
            // and a missing field never means "unknown" versus "not set yet".
            grade: '',
            fte: 1,
            skills: [],
            unavailable: [],
            joinedAt: new Date().toISOString(),
        }, `member ${member.role}/${member.rostered ? 'rostered' : 'not rostered'}`);

        // ⚠️ arrayUnion, NEVER a plain set. Somebody may already belong to another
        //    team; overwriting `teamIds` would silently drop that membership.
        await write(db.doc(`users/${member.uid}`), {
            displayName: member.displayName,
            email: member.email.toLowerCase(),
            teamIds: FieldValue.arrayUnion(TEAM),
        }, 'user teamIds');
    }

    // ── 3. The roster ─────────────────────────────────────────────────────────
    head('3. Roster');
    const rosterSnap = await db.doc('system_data/roster_2026').get();
    if (rosterSnap.exists) {
        const days = Object.keys(rosterSnap.data()).length;
        await write(db.doc(`teams/${TEAM}/rosters/2026`), rosterSnap.data(), `roster (${days} days)`);
    } else {
        warn('system_data/roster_2026 does not exist. Nothing to copy.');
    }

    // ── 4. Per-person collections ─────────────────────────────────────────────
    //
    // Each of these was keyed by a slug of a display name. `copyPerPerson` matches
    // each legacy document to a member, reports the ones it cannot place, and says
    // explicitly when a document belongs to somebody deliberately excluded — so the
    // count reconciles instead of leaving a reader wondering.
    const copyPerPerson = async (sourcePath, targetFor, label) => {
        const snap = await db.collection(sourcePath).get();
        if (snap.empty) { warn(`${sourcePath} is empty or absent.`); return; }

        let copied = 0;
        for (const docSnap of snap.docs) {
            const verdict = classifyLegacyDoc(docSnap.id, byLegacy, EXCLUDED);
            if (verdict.kind === 'member') {
                await write(db.doc(targetFor(verdict.member)), docSnap.data(), label);
                copied += 1;
            } else if (verdict.kind === 'excluded') {
                warn(`${sourcePath}/${docSnap.id} belongs to ${verdict.person.displayName}, `
                   + 'excluded from team #1 — NOT copied. The original is untouched and can be '
                   + 'attached if they are invited later.');
            } else {
                warn(`${sourcePath}/${docSnap.id} matches nobody in the manifest — NOT copied. `
                   + 'Check whether this is a former colleague or a mis-slugged id.');
            }
        }
        console.log(`  ${copied} of ${snap.size} documents in ${sourcePath} placed`);
    };

    head('4. Wellbeing  (the most sensitive collection)');
    await copyPerPerson('wellbeing_history', (m) => `teams/${TEAM}/wellbeing/${m.uid}`, 'wellbeing');
    const anonSnap = await db.doc('wellbeing_history/_anonymous_logs').get();
    if (anonSnap.exists) {
        await write(db.doc(`teams/${TEAM}/wellbeing/_anonymous_logs`), anonSnap.data(), 'anonymous logs');
    }

    head('5. Clinical loads');
    await copyPerPerson('staff_loads', (m) => `teams/${TEAM}/loads/${m.uid}`, 'load');

    head('6. Projects — current year (was cep_team)');
    await copyPerPerson('cep_team', (m) => `teams/${TEAM}/projects/2026/staff/${m.uid}`, 'projects 2026');

    // ── 7. Archives, one collection per year ──────────────────────────────────
    head('7. Projects — archived years (was archive_YYYY)');
    const collections = await db.listCollections();
    const archiveYears = collections
        .map((c) => c.id)
        .filter((id) => /^archive_[0-9]{4}$/.test(id))
        .sort();
    if (archiveYears.length === 0) warn('No archive_YYYY collections found.');
    for (const name of archiveYears) {
        const year = name.slice('archive_'.length);
        await copyPerPerson(name, (m) => `teams/${TEAM}/projects/${year}/staff/${m.uid}`, `projects ${year}`);
    }

    // ── 8. Team-wide documents ────────────────────────────────────────────────
    head('8. Pulse, attendance, reports');
    const pulseSnap = await db.doc('system_data/daily_pulse').get();
    if (pulseSnap.exists) {
        await write(db.doc(`teams/${TEAM}/pulse/daily`), pulseSnap.data(), 'pulse board');
    } else warn('system_data/daily_pulse does not exist.');

    /**
     * ⚠️ ONE DOCUMENT BECOMES SEVERAL. `system_data/monthly_attendance` held every
     *    year in a single map with no year in the document id, so a second year
     *    would eventually have overwritten the first month by month. Each year
     *    becomes its own document — and the inner key is PRESERVED, because
     *    `AdminPanel` reads `snap.data()[year]`, so changing the shape here would
     *    make the screen render zeros against data that is actually present.
     */
    const attSnap = await db.doc('system_data/monthly_attendance').get();
    if (attSnap.exists) {
        const data = attSnap.data();
        const years = Object.keys(data).filter((key) => /^[0-9]{4}$/.test(key));
        if (years.length === 0) warn('monthly_attendance has no four-digit year keys; nothing placed.');
        for (const year of years) {
            await write(db.doc(`teams/${TEAM}/attendance/${year}`), { [year]: data[year] }, `attendance ${year}`);
        }
        Object.keys(data).filter((k) => !/^[0-9]{4}$/.test(k))
            .forEach((k) => warn(`monthly_attendance key "${k}" is not a year — NOT copied.`));
    } else warn('system_data/monthly_attendance does not exist.');

    const systemDocs = await db.collection('system_data').listDocuments();
    for (const ref of systemDocs) {
        const match = /^reports_([0-9]{4})$/.exec(ref.id);
        if (!match) continue;
        const snap = await ref.get();
        if (snap.exists) await write(db.doc(`teams/${TEAM}/reports/${match[1]}`), snap.data(), `report ${match[1]}`);
    }

    // ── 9. Swaps, feed, notifications — the name-keyed ones ───────────────────
    //
    // These carry DISPLAY NAMES in their fields, and the new app routes by uid. The
    // migration backfills the uid alongside the name it already has; the name stays
    // because the roster mutator still matches the roster's own day arrays on it.
    head('9. Swaps, feed and notifications  (uid backfill)');

    const swapSnap = await db.collection('shift_swaps').get();
    for (const docSnap of swapSnap.docs) {
        const data = docSnap.data();
        const targetUid = uidByName.get(data.targetStaff);
        const requestedUid = uidByName.get(data.requestedBy);
        if (!targetUid) {
            warn(`shift_swaps/${docSnap.id} targets "${data.targetStaff}", who is not a member — NOT copied. `
               + 'A swap nobody can answer is worse than no swap.');
            continue;
        }
        await write(db.doc(`teams/${TEAM}/swaps/${docSnap.id}`), {
            ...data,
            targetUid,
            ...(requestedUid ? { requestedUid } : {}),
        }, `swap (${data.status || 'unknown'})`);
    }
    if (swapSnap.empty) warn('shift_swaps is empty or absent.');

    const feedSnap = await db.collection('feed_posts').get();
    for (const docSnap of feedSnap.docs) {
        await write(db.doc(`teams/${TEAM}/feed/${docSnap.id}`), docSnap.data(), 'feed post');
        const comments = await db.collection(`feed_posts/${docSnap.id}/comments`).get();
        for (const comment of comments.docs) {
            await write(db.doc(`teams/${TEAM}/feed/${docSnap.id}/comments/${comment.id}`), comment.data(), 'feed comment');
        }
    }
    if (feedSnap.empty) warn('feed_posts is empty or absent.');

    const noteSnap = await db.collection('notifications').get();
    for (const docSnap of noteSnap.docs) {
        const data = docSnap.data();
        const recipientUid = uidByName.get(data.recipient);
        if (!recipientUid) {
            warn(`notifications/${docSnap.id} is for "${data.recipient}", who is not a member — NOT copied.`);
            continue;
        }
        await write(db.doc(`teams/${TEAM}/notifications/${docSnap.id}`), { ...data, recipientUid }, 'notification');
    }
    if (noteSnap.empty) warn('notifications is empty or absent.');

    return summary();
}

function summary() {
    console.log(`\n${'='.repeat(78)}`);
    console.log(`  ${planned.length} documents ${WRITE ? 'WRITTEN' : 'would be written'}`);
    console.log(`  ${warnings.length} warnings · ${errors.length} errors`);
    if (errors.length > 0) {
        console.log('\n  ERRORS — read these before doing anything else:');
        errors.forEach((e) => console.log(`    ❌ ${e}`));
    }
    if (!WRITE) {
        console.log('\n  DRY RUN. Nothing was written.');
        console.log('  Read the plan above. If it is right, re-run with --write.');
    } else {
        console.log('\n  ⚠️  NOT ONE LEGACY DOCUMENT WAS MODIFIED OR DELETED. The old app still works,');
        console.log('      which is the rollback: previous rules from console history + previous bundle.');
        console.log('\n  NEXT: merge the branch to `main`. Not before now — the deploy reads teams/…');
    }
    console.log('='.repeat(78));
    return errors.length === 0 ? 0 : 1;
}

main()
    .then((code) => process.exit(code))
    .catch((error) => {
        console.error('\n❌ The migration threw and stopped. Nothing after this point ran.');
        console.error('   Because every write is a merge and every array is a union, re-running is safe.');
        console.error(error);
        process.exit(1);
    });
