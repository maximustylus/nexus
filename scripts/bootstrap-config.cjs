'use strict';
/**
 * ==============================================================================
 * BOOTSTRAP-CONFIG — the two documents NEXUS cannot create for itself
 * ==============================================================================
 *
 * Run, from the repo root:
 *
 *   # 0. ONCE — firebase-admin is not a dependency of this repo. `functions/`
 *   #    pins ^13.6.0; this file is run by hand from the root, where nothing
 *   #    pins anything, and the subpath imports below work on v10 through v14.
 *   npm i --no-save firebase-admin
 *
 *   # 1. DRY RUN — the default. Writes nothing, and names the project first.
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json \
 *     node scripts/bootstrap-config.cjs
 *
 *   # 2. FOR REAL — only after reading the dry run and checking the project.
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json \
 *     node scripts/bootstrap-config.cjs --write --super-admin you@kkh.com.sg
 *
 *   # Other institutions, later. ADDITIVE — never replaces the list.
 *   GOOGLE_APPLICATION_CREDENTIALS=… node scripts/bootstrap-config.cjs \
 *     --write --merge-domains --domain another-hospital.com.sg
 *
 * ⚠️ WHY THIS EXISTS: NEXUS COULD NOT BE INITIALISED FROM NEXUS.
 *
 *    Two documents govern who may do anything:
 *
 *      config/domains      which institutions may be added to a team
 *      config/superAdmins  who may approve a lead's request for a team
 *
 *    Both are READ by Cloud Functions and written by NOTHING. `firestore.rules`
 *    has `allow write: if false` on `config/{docId}`, correctly — a client that
 *    can edit the login allowlist can admit itself. But nothing else wrote them
 *    either, so a freshly deployed NEXUS sat in a state where:
 *
 *      • every `inviteMember` call refused every address, because an empty
 *        allowlist admits nobody (deliberately — see `teamMembership.js`);
 *      • every lead request was unapprovable, because an absent `superAdmins`
 *        means nobody may approve (deliberately — see `teamApproval.js`).
 *
 *    Each refusal is individually right. Together they are a product that cannot
 *    be started. The owner hit the first half on 2026-08-31: a valid colleague on
 *    the department's own domain could not be added to the department's own team.
 *
 *    So this script is the bootstrap, and it runs on the Admin SDK, which is the
 *    only thing that legitimately bypasses those rules.
 *
 * ── CONVENTIONS TAKEN FROM `migrate-to-teams.cjs`, ON PURPOSE ────────────────
 *
 * 1. DRY RUN IS THE DEFAULT. Writing requires `--write`, typed deliberately.
 * 2. THE PROJECT IS NAMED BEFORE ANYTHING IS READ, so a key for the wrong project
 *    is caught by a human against the Firebase console rather than by a silent
 *    self-consistent run against the wrong database. `credential.cjs` exists for
 *    exactly this and is reused rather than reimplemented.
 * 3. AN EXISTING DOCUMENT IS LEFT ALONE AND REPORTED. Overwriting `config/domains`
 *    could silently REMOVE an institution that is already onboarded, locking out
 *    everyone at it. Adding to it needs `--merge-domains`, which is additive.
 *
 * ⚠️ WHAT THIS SCRIPT WILL NOT DO: it will not invent a super-admin. An address
 *    has to be passed with `--super-admin`, because a script that quietly grants
 *    approval rights to whoever ran it is a privilege escalation with a helpful
 *    tone of voice.
 */

/**
 * ⚠️ SUBPATH IMPORTS, NOT THE ROOT NAMESPACE — the trap `migrate-to-teams.cjs`
 *    already paid for. firebase-admin v14 removed the service namespaces from the
 *    root export: `require('firebase-admin').firestore` is `undefined`, so
 *    `admin.firestore()` throws with a message that looks like a credential problem
 *    and is not. `firebase-admin/app` and `firebase-admin/firestore` have existed
 *    since v10 and work on every version anyone would install.
 */
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { describeCredentialFile } = require('./credential.cjs');

const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');
const MERGE_DOMAINS = argv.includes('--merge-domains');

/** Repeatable flags: `--domain a --domain b`. */
const valuesFor = (flag) => argv
    .map((arg, i) => (arg === flag ? argv[i + 1] : null))
    .filter((value) => typeof value === 'string' && value.trim() !== '' && !value.startsWith('--'))
    .map((value) => value.trim().toLowerCase());

/**
 * The built-in default, and the ONLY place this script guesses anything.
 *
 * These two are the institutions already in the live directory, and they are the
 * same list `src/utils/accessPolicy.js` falls back to on the client — so a
 * bootstrap with no `--domain` produces exactly the allowlist the login screen has
 * been behaving as though existed. That is the least surprising outcome; the
 * alternative is a run that succeeds and changes nothing anyone can use.
 */
const DEFAULT_DOMAINS = ['kkh.com.sg', 'singhealth.com.sg'];

/** A domain is `label.label…`. No `@`, no scheme, no wildcard — see accessPolicy. */
const isDomain = (value) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value);

const main = async () => {
    const credential = describeCredentialFile(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    if (!credential.ok) {
        console.error(`\n✗ ${credential.reason}\n`);
        process.exit(1);
    }

    console.log('\n──────────────────────────────────────────────────────────────');
    console.log(`  PROJECT : ${credential.projectId}`);
    console.log(`  KEY     : ${credential.path}`);
    console.log(`  MODE    : ${WRITE ? 'WRITE' : 'DRY RUN (pass --write to apply)'}`);
    console.log('──────────────────────────────────────────────────────────────');
    console.log('  Check the project against the Firebase console before --write.\n');

    initializeApp({ credential: applicationDefault() });
    const db = getFirestore();

    const requested = valuesFor('--domain');
    const bad = requested.filter((value) => !isDomain(value));
    if (bad.length > 0) {
        console.error(`✗ Not a domain: ${bad.join(', ')}. Pass a bare host, e.g. kkh.com.sg — no @, no https://, no *.\n`);
        process.exit(1);
    }
    const domains = requested.length > 0 ? requested : DEFAULT_DOMAINS;
    const superAdmins = valuesFor('--super-admin');

    // ── config/domains ────────────────────────────────────────────────────────
    const domainsRef = db.doc('config/domains');
    const domainsSnap = await domainsRef.get();
    const existing = domainsSnap.exists && Array.isArray(domainsSnap.data().allowed)
        ? domainsSnap.data().allowed.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean)
        : null;

    if (existing === null) {
        console.log(`config/domains   ABSENT  → would create with: ${domains.join(', ')}`);
        if (WRITE) {
            await domainsRef.set({ allowed: domains }, { merge: true });
            console.log('                 ✓ created');
        }
    } else if (MERGE_DOMAINS) {
        const merged = [...new Set([...existing, ...domains])].sort();
        const added = merged.filter((entry) => !existing.includes(entry));
        console.log(`config/domains   EXISTS  → ${existing.join(', ')}`);
        console.log(added.length > 0 ? `                 would add: ${added.join(', ')}` : '                 nothing to add');
        if (WRITE && added.length > 0) {
            await domainsRef.set({ allowed: merged }, { merge: true });
            console.log('                 ✓ merged');
        }
    } else {
        // ⚠️ NOT OVERWRITTEN. Replacing this list can lock out every user at an
        //    institution already onboarded, and the failure looks like "NEXUS is not
        //    open to your domain" — the message this whole change set exists to stop
        //    being wrong.
        console.log(`config/domains   EXISTS  → ${existing.join(', ')}`);
        console.log('                 left alone. Use --merge-domains to ADD to it.');
    }

    // ── config/superAdmins ────────────────────────────────────────────────────
    const superRef = db.doc('config/superAdmins');
    const superSnap = await superRef.get();
    const existingSupers = superSnap.exists && Array.isArray(superSnap.data().emails)
        ? superSnap.data().emails
        : null;

    if (existingSupers && existingSupers.length > 0) {
        console.log(`config/superAdmins EXISTS → ${existingSupers.length} address(es). Left alone.`);
    } else if (superAdmins.length === 0) {
        console.log('config/superAdmins ABSENT → nobody can approve a lead request.');
        console.log('                 Pass --super-admin <email> to set one. Not guessed on purpose:');
        console.log('                 a script that grants approval rights to whoever ran it is a');
        console.log('                 privilege escalation with a helpful tone of voice.');
    } else {
        console.log(`config/superAdmins ABSENT → would create with: ${superAdmins.join(', ')}`);
        if (WRITE) {
            await superRef.set({ emails: superAdmins }, { merge: true });
            console.log('                 ✓ created');
        }
    }

    console.log(`\n${WRITE ? 'Done.' : 'Dry run only — nothing was written. Re-run with --write.'}\n`);
};

main().catch((error) => {
    console.error('\n✗ bootstrap failed:', error && error.message ? error.message : error, '\n');
    process.exit(1);
});
