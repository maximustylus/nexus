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
 * 3. IT IS IDEMPOTENT, BY REFUSING TO OVERWRITE. A destination that already
 *    exists is left alone and reported, so a second run writes only what the first
 *    did not. A half-finished run is recovered by running it again.
 *
 *    ⚠️ This used to say "every write is a merge, so running it twice produces the
 *       same state as running it once". That was false. `merge: true` replaces any
 *       field it is given — maps survive because their keys are separate field
 *       paths, arrays do NOT — so a re-run after go-live would have replaced a
 *       live `logs` array with the stale legacy one, losing every wellbeing
 *       check-in written in between. See the note on `write()`.
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
const { buildLegacyIndex, classifyLegacyDoc, normalise } = require('./legacyMatch.cjs');
const { reconcile } = require('./reconcile.cjs');
const { classifyAuthFailure, environmentReport } = require('./authFailure.cjs');
const { describeCredentialFile } = require('./credential.cjs');
const { suggestMatches, suggestionReport } = require('./emailMatch.cjs');

const WRITE = process.argv.includes('--write');
/** Prints every address with an account. Read-only; safe to combine with a dry run. */
const LIST_ACCOUNTS = process.argv.includes('--list-accounts');
/**
 * Overwrites destinations that already exist. ⚠️ NOT a repair tool — see the note
 * on `write()`. Use it only to replace a document you have confirmed is a
 * half-written artefact of a failed run, never to "refresh" one the live app has
 * touched, because a legacy array will replace a live one wholesale.
 */
const FORCE_OVERWRITE = process.argv.includes('--force-overwrite');
const TEAM = TEAM_ONE.teamId;

initializeApp();
const db = getFirestore();

// ── Reporting ────────────────────────────────────────────────────────────────
// Everything this script would do goes through one of these, so the dry run and
// the real run print exactly the same lines. A dry run that describes a different
// plan from the one that executes is worse than no dry run at all.
const planned = [];
const skipped = [];
const warnings = [];
const errors = [];

const plan = (what, path) => { planned.push({ what, path }); console.log(`  · ${what.padEnd(28)} ${path}`); };
/**
 * A destination that already exists. NOT an error and NOT a warning — on a second
 * run it is the expected outcome for every document, and reporting it as a problem
 * would train a reader to ignore the lines where a real problem appears.
 */
const skip = (what, path) => { skipped.push({ what, path }); console.log(`  = ${what.padEnd(28)} ${path}  (exists — left alone)`); };
const warn = (message) => { warnings.push(message); console.log(`  ⚠️  ${message}`); };
const fail = (message) => { errors.push(message); console.log(`  ❌ ${message}`); };
const head = (title) => console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 72 - title.length))}`);

/**
 * Every write in this file funnels through here, so `--write` is checked once.
 *
 * ⚠️ IT REFUSES TO OVERWRITE A DESTINATION THAT ALREADY EXISTS, AND THAT IS WHAT
 *    MAKES RE-RUNNING SAFE. The original used `set(data, { merge: true })` on the
 *    strength of the header's claim that "every write is a merge, so running it
 *    twice produces the same state as running it once". That claim was false, and
 *    the way it was false destroys clinical data.
 *
 *    `merge: true` does not deep-merge. The Firestore SDK's own definition of it
 *    is "only replace the values specified in its data argument; fields omitted
 *    from the call remain untouched" — so a field that IS sent is REPLACED. Maps
 *    survive because their nested keys are separate field paths; ARRAYS do not,
 *    because Firestore field paths cannot index into an array. An array is one
 *    leaf value, replaced whole.
 *
 *    The team's wellbeing document is exactly that shape. `AuraPulseBot.jsx:435`
 *    appends check-ins with `{ logs: arrayUnion(logData) }`. So:
 *
 *      1. migrate, merge, go live
 *      2. over the next week a clinician logs three check-ins — `logs` now holds
 *         the legacy entries plus three
 *      3. a colleague finally registers, and the operator re-runs the migration
 *         because it says it is idempotent and safe
 *      4. the LEGACY `logs` array — which never had those three — replaces the
 *         live one. Three wellbeing check-ins are gone, with no error and no
 *         warning, from the collection this file calls "the most sensitive".
 *
 *    The same applies to the roster's day arrays and to project rows.
 *
 *    So: a destination that already exists is LEFT ALONE and reported. Either a
 *    previous run wrote it — in which case the legacy copy adds nothing — or the
 *    live app has written it since, in which case the legacy copy is stale and
 *    overwriting it is the bug above. `--force-overwrite` exists for the one case
 *    where a genuinely half-written document must be replaced, and it says so.
 *
 *    `arrayUnion` writes are different and stay merges: a union genuinely is
 *    idempotent, and `users/{uid}` may exist for reasons that have nothing to do
 *    with this team. Those go through `union()` below.
 */
const write = async (ref, data, what) => {
    if (!FORCE_OVERWRITE) {
        // Costs one read per document. On a department-sized migration that is a
        // few hundred reads to remove a silent-data-loss path — the cheapest
        // insurance in this file.
        const existing = await ref.get();
        if (existing.exists) {
            skip(what, ref.path);
            return;
        }
    }
    plan(what, ref.path);
    if (WRITE) await ref.set(data, { merge: true });
};

/**
 * For writes that are genuinely idempotent because every field is a union or a
 * scalar the migration owns. `users/{uid}` is the only one: `teamIds` is an
 * `arrayUnion`, which adds without replacing, and the display name and email are
 * the migration's own facts about the person.
 */
const union = async (ref, data, what) => {
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
    // Members the manifest names who have no Firebase Auth account. Kept because
    // their legacy documents must be reported as WAITING ON A REGISTRATION, not as
    // unrecognised ids — see `classifyLegacyDoc`.
    const unresolved = [];
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
                unresolved.push(member);
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

    // ⚠️ "THEY MUST REGISTER" IS A GUESS, AND OFTEN THE WRONG ONE. A person with a
    //    year of clinical records did not fail to sign in; far more likely the
    //    manifest holds an address they never registered with. Offer what exists
    //    and let a human decide — nothing here is ever auto-selected, because
    //    picking for them files a wellbeing history under a colleague.
    if (unresolved.length > 0 || LIST_ACCOUNTS) {
        let existingEmails = null;   // null = the listing itself failed. NOT the same as [].
        try {
            const page = await getAuth().listUsers(1000);
            existingEmails = page.users.map((u) => u.email).filter(Boolean);
        } catch (error) {
            warn(`Could not list existing accounts to compare against — ${error.code || error.message}. `
               + 'The resolution above is unaffected, but no near-match check was possible.');
        }

        if (existingEmails !== null) {
            // ⚠️ ALWAYS PRINT THE DENOMINATOR. The first version of this printed
            //    suggestions when it had them and NOTHING when it did not, which
            //    left the reader unable to tell "no account resembles this address"
            //    from "the account listing came back empty and the comparison was
            //    vacuous". Those two lead to opposite actions — chase a colleague,
            //    or check the service-account's permissions — and silence is not
            //    evidence for either.
            console.log(`\n  Compared against ${existingEmails.length} Firebase Auth `
                      + `${existingEmails.length === 1 ? 'account' : 'accounts'} in ${cred.projectId}.`);
            if (existingEmails.length === 0) {
                warn('The project reports ZERO auth accounts, yet members resolved above. That is '
                   + 'contradictory — the key may lack permission to list users. Treat the near-match '
                   + 'check below as having produced no information.');
            }

            for (const member of unresolved) {
                const suggestions = suggestMatches(member.email, existingEmails);
                const lines = suggestionReport(member, suggestions);
                if (lines.length > 0) {
                    lines.forEach((line) => console.log(line));
                } else {
                    // Said out loud, because it IS the finding: the address is not a
                    // typo, so this person really has never signed in.
                    console.log(`   No existing account resembles ${member.displayName} `
                              + `<${member.email}> — so this is a genuine registration, not a `
                              + 'wrong address in the manifest.');
                }
            }

            if (LIST_ACCOUNTS) {
                console.log(`\n  Every account in ${cred.projectId}, because --list-accounts was passed:`);
                [...existingEmails].sort().forEach((email) => console.log(`     · ${email}`));
            } else if (unresolved.length > 0) {
                console.log('\n   Re-run with --list-accounts to see every address that has signed in.');
            }
        }
    }
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
    /**
     * ⚠️ NORMALISED, BECAUSE EVERY OTHER LOOKUP IN THIS FILE IS.
     *
     * This used to key on the raw `displayName` and be read with
     * `uidByName.get(data.targetStaff)` — exact string equality. Sections 4 to 7
     * go through `legacyMatch`, which strips everything that is not a letter or a
     * digit precisely because the app produced several spellings of one name; the
     * dry run proved it by finding `archive_2025/ying xian` alongside
     * `archive_2025/ying_xian`.
     *
     * Swaps and notifications were the one place that did not, so a pending
     * coverage request stored as `'ying xian'` or `'Ying  Xian'` would fail to
     * match, be dropped, and be reported as targeting somebody "who is not a
     * member" — about a member. On swaps that is the worse direction: an unanswered
     * cover request is a shift nobody is holding.
     */
    const uidByName = new Map(resolved.map((member) => [normalise(member.displayName), member.uid]));
    const uidFor = (name) => uidByName.get(normalise(name));

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
        await union(db.doc(`users/${member.uid}`), {
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
    /**
     * Document ids that are NOT people and must not be run through the person
     * matcher. `wellbeing_history/_anonymous_logs` is the Ghost Protocol store: it
     * is copied deliberately a few lines below section 4, but because it reached
     * `copyPerPerson` first it normalised to `anonymouslogs`, matched nobody, and
     * printed "matches nobody in the manifest — NOT copied" about the one document
     * on the page that WAS about to be copied. It also skewed the per-collection
     * count, which then under-reported by one on the most sensitive collection in
     * the project.
     */
    const NOT_A_PERSON = new Set(['_anonymous_logs']);

    const copyPerPerson = async (sourcePath, targetFor, label) => {
        const snap = await db.collection(sourcePath).get();
        if (snap.empty) { warn(`${sourcePath} is empty or absent.`); return; }

        let copied = 0;
        /** destination path → the first source id that claimed it, for collision reporting. */
        const destinations = new Map();
        let notPeople = 0;
        for (const docSnap of snap.docs) {
            if (NOT_A_PERSON.has(docSnap.id)) { notPeople += 1; continue; }
            const verdict = classifyLegacyDoc(docSnap.id, byLegacy, EXCLUDED, unresolved);
            if (verdict.kind === 'member') {
                const target = targetFor(verdict.member);
                // ⚠️ TWO SOURCE DOCUMENTS LANDING ON ONE DESTINATION IS SILENT DATA
                //    MERGING. The old app slugged one person's name three ways, so
                //    `ying_xian` and `yingxian` are separate documents that both
                //    resolve to the same uid — which is exactly what the matching is
                //    for, but the second `set(merge: true)` overwrites any field the
                //    first also had, last write wins, with nothing on screen. The
                //    merge is still the right outcome; being told it happened is the
                //    part that was missing.
                const earlier = destinations.get(target);
                if (earlier) {
                    warn(`${sourcePath}/${docSnap.id} and ${sourcePath}/${earlier} BOTH belong to `
                       + `${verdict.member.displayName} and merge into one document. Later fields win `
                       + 'where they overlap. Both originals are untouched — compare them if the '
                       + 'result looks wrong.');
                } else {
                    destinations.set(target, docSnap.id);
                }
                await write(db.doc(target), docSnap.data(), label);
                copied += 1;
            } else if (verdict.kind === 'unresolved') {
                warn(`${sourcePath}/${docSnap.id} belongs to ${verdict.member.displayName}, who is in `
                   + 'the team but has no Firebase Auth account yet — NOT copied. This is the same '
                   + 'registration listed under ERRORS above, not a separate problem. It lands on '
                   + 'the next run once they register.');
            } else if (verdict.kind === 'excluded') {
                warn(`${sourcePath}/${docSnap.id} belongs to ${verdict.person.displayName}, `
                   + 'excluded from team #1 — NOT copied. The original is untouched and can be '
                   + 'attached if they are invited later.');
            } else {
                warn(`${sourcePath}/${docSnap.id} matches nobody in the manifest — NOT copied. `
                   + 'Check whether this is a former colleague or a mis-slugged id.');
            }
        }
        // The denominator excludes documents that were never about a person, so the
        // ratio means what a reader takes it to mean.
        console.log(`  ${copied} of ${snap.size - notPeople} person documents in ${sourcePath} placed`
                  + (notPeople > 0 ? `  (+${notPeople} handled separately)` : ''));
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
    /**
     * ⚠️ THIS COLLECTION WAS MISSED ENTIRELY, AND NOTHING SAID SO.
     *
     * `monthly_workload` has a declared destination in the new tree
     * (`src/utils/teamPaths.js:38` — "teams/{teamId}/workload/{period} was
     * monthly_workload"), a legacy path helper (`:348`) and a live writer
     * (`AuraPulseBot.jsx`, the DATA_ENTRY mode that logs a period's figures). The
     * migration read none of it and mentioned none of it, so a clean dry run with
     * zero errors was consistent with leaving every workload record behind — and
     * the deployed app reads only `teams/…`, so it would simply show nothing.
     *
     * A migration that silently skips a whole collection is indistinguishable from
     * one that worked, which is the failure this file's fourth safety property
     * exists to prevent. It applies to the file itself, not only to documents.
     */
    head('9. Monthly workload (was monthly_workload)');
    const workloadSnap = await db.collection('monthly_workload').get();
    if (workloadSnap.empty) {
        warn('monthly_workload is empty or absent.');
    } else {
        for (const docSnap of workloadSnap.docs) {
            await write(
                db.doc(`teams/${TEAM}/workload/${docSnap.id}`),
                docSnap.data(),
                `workload ${docSnap.id}`,
            );
        }
        console.log(`  ${workloadSnap.size} period ${workloadSnap.size === 1 ? 'document' : 'documents'} in monthly_workload`);
    }

    head('10. Swaps, feed and notifications  (uid backfill)');

    const swapSnap = await db.collection('shift_swaps').get();
    for (const docSnap of swapSnap.docs) {
        const data = docSnap.data();
        const targetUid = uidFor(data.targetStaff);
        const requestedUid = uidFor(data.requestedBy);
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
        const recipientUid = uidFor(data.recipient);
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
    if (skipped.length > 0) {
        console.log(`  ${skipped.length} left alone because the destination already exists`
                  + (FORCE_OVERWRITE ? '' : '  (this is the expected result of a second run)'));
    }
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

    // ⚠️ THE EXIT CODE DISTINGUISHES "SOMETHING WENT WRONG" FROM "SOMEBODY HAS NOT
    //    REGISTERED YET". Those are not the same and must not share a status.
    //
    //    Every unresolved member goes through `fail()`, so a run in which all reads
    //    and all writes succeeded — the roster, wellbeing, loads, projects,
    //    archives, pulse, attendance, reports, swaps and the feed all copied — still
    //    exited 1 purely because a colleague has not signed in. The script's own
    //    closing line says "NEXT: merge the branch to main" on that same run, so the
    //    exit code contradicted the instruction directly above it.
    //
    //    A missing registration is expected, named, and fixed by re-running. It is
    //    reported, and it does not fail the run. Anything else does.
    const blocking = errors.filter((message) => !/^NO AUTH ACCOUNT/.test(message));
    if (blocking.length === 0 && errors.length > 0) {
        console.log(`  Exit 0: the only errors above are ${errors.length} unregistered `
                  + `${errors.length === 1 ? 'colleague' : 'colleagues'}, which re-running fixes once`);
        console.log('  they sign in. Nothing failed.');
    }
    return blocking.length === 0 ? 0 : 1;
}

main()
    .then((code) => process.exit(code))
    .catch((error) => {
        console.error('\n❌ The migration threw and stopped. Nothing after this point ran.');
        console.error('   Re-running is safe: a destination that already exists is left alone,');
        console.error('   so a second run writes only what this one did not.');
        console.error(error);
        process.exit(1);
    });
