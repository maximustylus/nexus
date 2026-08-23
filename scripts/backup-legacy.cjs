#!/usr/bin/env node
'use strict';

/**
 * ==============================================================================
 * BACKUP — every pre-migration document, to one local JSON file
 * ==============================================================================
 *
 *   NODE_PATH=~/nexus-migrate-deps/node_modules \
 *   GOOGLE_APPLICATION_CREDENTIALS=~/Downloads/nexus-key.json \
 *     node scripts/backup-legacy.cjs
 *
 * ⚠️ WHY THIS EXISTS WHEN THE MIGRATION ALREADY COPIES RATHER THAN MOVES.
 *
 * The cutover's rollback story is that not one legacy document is modified, so
 * redeploying the previous bundle restores the previous app. That is true, and it
 * covers the case it was designed for. It does not cover the window: somebody using
 * NEXUS between the migration and the deploy writes to the LEGACY documents, and if
 * the deploy then has to be rolled back, that work is in the old shape while the new
 * team-scoped copies were taken before it.
 *
 * The official answer is a Firestore export, and it is the right answer — but it
 * needs a Cloud Storage bucket, the Datastore Import/Export Admin role and either
 * `gcloud` or the Cloud Console. On the night, that is three things that can go
 * wrong before the thing you actually came to do.
 *
 * This needs none of them. It is READ ONLY — it opens no write path, and the Admin
 * SDK handle it holds is never asked for one — and it uses the same service-account
 * key the migration already needs. A few megabytes of JSON on your own disk is not a
 * substitute for a real export, and it is very much better than nothing.
 *
 * ⚠️ WHAT COMES OUT IS CLINICAL DATA AND WELLBEING HISTORY. Keep the file off
 *    shared drives, and delete it once the cutover has settled.
 */

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('node:fs');
const path = require('node:path');
const { describeCredentialFile } = require('./credential.cjs');

/**
 * The pre-migration shape, from `LEGACY` in `src/utils/teamPaths.js`. Kept as plain
 * strings rather than imported: this is a CommonJS script and that module is ESM,
 * and a backup that cannot run because of a module system is worse than a duplicated
 * list of twelve names.
 */
const DOCUMENTS = [
    'system_data/roster_2026',
    'system_data/daily_pulse',
    'system_data/monthly_attendance',
];
const COLLECTIONS = [
    'system_data',          // catches reports_YYYY and anything else added since
    'shift_swaps',
    'wellbeing_history',
    'staff_loads',
    'cep_team',
    'feed_posts',
    'notifications',
    'monthly_workload',
    'users',
];

const preflight = () => {
    const cred = describeCredentialFile(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    console.log(`  Key:     ${cred.path || '(GOOGLE_APPLICATION_CREDENTIALS is not set)'}`);
    console.log(`  Project: ${cred.projectId || '(none named)'}`);
    console.log(`  As:      ${cred.clientEmail || '(unknown)'}`);
    if (!cred.ok) {
        console.error(`\n  ❌ ${cred.problem}`);
        console.error('     Nothing was read. Fix the key and re-run.');
        process.exit(1);
    }
    console.log('');
    return cred;
};

/** Anything this run could NOT read, reported rather than silently absent. */
const incomplete = [];

/** Recursively reads a collection and any subcollections beneath its documents. */
const readCollection = async (db, ref, out, prefix, depth = 0) => {
    const snap = await ref.get();
    for (const doc of snap.docs) {
        out[`${prefix}/${doc.id}`] = doc.data();
        /*
         * `feed_posts/{id}/comments` is the only nesting today; the loop is general so
         * a collection added later is not silently missed.
         *
         * ⚠️ IT DEGRADES RATHER THAN ABORTING. `listCollections` is a real API call per
         *    document and needs `datastore.entities.list`; a key without it would
         *    otherwise take the whole backup down over a subcollection that may not
         *    exist. Getting most of a backup and being told what is missing beats
         *    getting none of it.
         */
        if (depth < 2) {
            let subs = [];
            try {
                subs = await doc.ref.listCollections();
            } catch (error) {
                incomplete.push(`${prefix}/${doc.id}: subcollections not listed (${error.code || error.message})`);
            }
            for (const sub of subs) {
                await readCollection(db, sub, out, `${prefix}/${doc.id}/${sub.id}`, depth + 1);
            }
        }
    }
    return snap.size;
};

(async () => {
    console.log('='.repeat(78));
    console.log('  NEXUS — backup of every pre-migration document      READ ONLY');
    console.log('='.repeat(78));
    const cred = preflight();

    initializeApp();
    const db = getFirestore();

    const data = {};
    const counts = {};

    for (const p of DOCUMENTS) {
        const snap = await db.doc(p).get();
        if (snap.exists) { data[p] = snap.data(); counts[p] = 1; }
        else { counts[p] = 0; console.log(`  ·  ${p.padEnd(34)} absent`); }
    }

    for (const name of COLLECTIONS) {
        const before = Object.keys(data).length;
        await readCollection(db, db.collection(name), data, name);
        counts[name] = Object.keys(data).length - before;
    }

    // Archived years, whatever they are called.
    for (const col of await db.listCollections()) {
        if (!/^archive_\d{4}$/.test(col.id)) continue;
        const before = Object.keys(data).length;
        await readCollection(db, col, data, col.id);
        counts[col.id] = Object.keys(data).length - before;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.resolve(process.cwd(), `nexus-backup-${cred.projectId}-${stamp}.json`);
    fs.writeFileSync(file, JSON.stringify({
        takenAt: new Date().toISOString(),
        project: cred.projectId,
        takenBy: cred.clientEmail,
        note: 'Pre-migration backup. Clinical and wellbeing data — keep off shared drives.',
        counts,
        incomplete,
        documents: data,
    }, null, 2));

    console.log('');
    Object.entries(counts).forEach(([k, n]) => console.log(`  ${String(n).padStart(5)}  ${k}`));
    const total = Object.keys(data).length;
    console.log(`\n  ${total} documents written to`);
    console.log(`  ${file}`);
    console.log(`  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);

    if (total === 0) {
        console.error('\n  ❌ NOTHING WAS READ. That is not a quiet project — it is the wrong one,');
        console.error('     or a key without read access. Check the project id above against the console.');
        process.exit(1);
    }
    if (incomplete.length > 0) {
        console.log(`\n  ⚠️  ${incomplete.length} thing(s) could not be read. The file above is NOT complete:`);
        incomplete.forEach((line) => console.log(`      · ${line}`));
    }
    console.log('\n  ⚠️  This is a convenience copy, not a Firestore export. Keep it local, and');
    console.log('      delete it once the cutover has settled.');
    console.log('='.repeat(78));
    process.exit(0);
})().catch((error) => {
    console.error('\n❌ The backup failed. NOTHING WAS WRITTEN TO FIRESTORE — this script has no');
    console.error('   write path at all, so a failure here cannot have changed anything.');
    console.error(error);
    process.exit(1);
});
