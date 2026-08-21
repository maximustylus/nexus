'use strict';

/**
 * ==============================================================================
 * TEAM #1 — THE MIGRATION MANIFEST
 * ==============================================================================
 *
 * Exactly who becomes a member of the first team, and with what role. This is the
 * INPUT to `scripts/migrate-to-teams.cjs`, held as its own file for one reason:
 * the migration writes real memberships to real clinical data, and "who is in the
 * team" is a decision the owner made, not something a script should infer from a
 * hardcoded array it happens to find in `src/utils/index.js`.
 *
 * A reviewer should be able to read this file alone and know exactly what the
 * migration will create.
 *
 * ── THE DECISION, AND WHEN IT CHANGED ────────────────────────────────────────
 *
 * The first answer was "all ten directory members, keeping their current roles" —
 * that preserved today's access exactly and changed nothing at cutover. The owner
 * then narrowed it: **Ashik, Mini and Evelyn are not in team #1.**
 *
 * ⚠️ THAT IS A REVOCATION, NOT A FILTER, AND IT SHOULD BE READ AS ONE. Those three
 *    can still sign in — the domain allowlist admits `@kkh.com.sg` and
 *    `@singhealth.com.sg` — but with no membership they reach the "nobody has added
 *    you to a team yet" holding screen and see no roster, no wellbeing data and no
 *    feed. Today they can read all three. If any of them asks why NEXUS stopped
 *    working, this is why, and a lead can invite them back in seconds without a
 *    deploy.
 *
 * Benny is NOT in that list and stays — he is a Sr. Consultant in Sports Medicine
 * and was kept deliberately when the other three stakeholders were dropped. Stated
 * explicitly because "remove the viewers" would have been the tidier-sounding rule
 * and is not what was asked for.
 *
 * ── ROLES ────────────────────────────────────────────────────────────────────
 *
 *   lead    may configure the roster, generate it, and invite or remove members
 *   staff   holds duties, logs wellbeing, requests and answers coverage
 *   viewer  reads the roster; holds no duties and carries no clinical load
 *
 * `viewer` is what now decides who is excluded from the clinical-load table — the
 * replacement for a hardcoded list of five names in `AdminPanel.jsx`. Nisa is an
 * ADMINISTRATOR who carries no load, so she is a `viewer` here even though she was
 * `admin` in the old directory: the old model had no way to say "runs the service,
 * holds no duties" and this one does.
 *
 * ── EMAIL IS THE JOIN KEY, AND ONLY FOR THE MIGRATION ────────────────────────
 *
 * The migration resolves each address to a Firebase Auth uid via the Admin SDK and
 * writes the membership under that uid. Email appears here because it is the only
 * identifier that exists in BOTH the old world and the new one; after the migration
 * nothing routes by it. An address with no auth account is REPORTED AND SKIPPED,
 * never guessed at — a membership under a uid nobody holds is a document that can
 * never be read or cleaned up.
 */

const TEAM_ONE = Object.freeze({
    teamId: 'kkh-sport-exercise-medicine',
    name: 'Sport & Exercise Medicine',
    institution: 'KKH',
    department: 'Sport & Exercise Medicine',
    // MOH's own vocabulary — the leaf id from `src/data/mohAlliedHealth.js`, so the
    // team's profession tag matches the list the demo picker offers every other team.
    profession: 'clinical-exercise-physiologist',
    leadEmail: 'muhammad.alif@kkh.com.sg',
});

/**
 * IN. Seven people.
 *
 * `legacyId` is the old directory id and the old Firestore document key
 * (`wellbeing_history/fadzlynn`, `staff_loads/brandon`). The migration needs it to
 * find each person's existing records; nothing reads it afterwards.
 */
const MEMBERS = Object.freeze([
    { legacyId: 'alif',       displayName: 'Alif',       email: 'muhammad.alif@kkh.com.sg',              role: 'lead',   title: 'Lead and Sr. CEP (JG14)' },
    { legacyId: 'nisa',       displayName: 'Nisa',       email: 'siti.nur.anisah.nh@kkh.com.sg',         role: 'viewer', title: 'Administrator' },
    { legacyId: 'benny',      displayName: 'Benny',      email: 'benny.loo.k.g.@singhealth.com.sg',      role: 'viewer', title: 'Sr. Consultant (Sports Med)' },
    { legacyId: 'brandon',    displayName: 'Brandon',    email: 'brandon.feng.gg@kkh.com.sg',            role: 'staff',  title: 'CEP (JG11)' },
    { legacyId: 'ying_xian',  displayName: 'Ying Xian',  email: 'lim.ying.xian@kkh.com.sg',              role: 'staff',  title: 'CEP (JG12)' },
    { legacyId: 'derlinder',  displayName: 'Derlinder',  email: 'derlinder.kaur@kkh.com.sg',             role: 'staff',  title: 'CEP (JG12)' },
    { legacyId: 'fadzlynn',   displayName: 'Fadzlynn',   email: 'fadzlynn.mohamad.fadzully@kkh.com.sg',  role: 'staff',  title: 'CEP (JG13)' },
]);

/**
 * OUT, and named rather than merely absent.
 *
 * A migration that silently omits three people is indistinguishable from a
 * migration with a bug. This list is what lets the dry-run PRINT "3 excluded by
 * decision" beside "7 members created", so the count reconciles against the ten
 * people in the old directory and nobody has to work out where the others went.
 *
 * Their existing records — wellbeing logs, staff loads, project rows — are NOT
 * deleted by the migration. Nothing is: the migration copies. If any of them is
 * invited back, their history is still there to attach.
 */
const EXCLUDED = Object.freeze([
    { legacyId: 'evelyn', displayName: 'Evelyn', email: 'Evelyn.Ong.MH@kkh.com.sg',              was: 'Asst. Director (Medicine)' },
    { legacyId: 'ashik',  displayName: 'Ashik',  email: 'mohammad.ashik.zainuddin@singhealth.com.sg', was: 'Sr. Consultant (Ortho)' },
    { legacyId: 'mini',   displayName: 'Mini',   email: 'Mini.Abraham@kkh.com.sg',               was: 'Nurse Clinician' },
]);

/**
 * The reconciliation the dry-run prints. Ten people were in the old directory;
 * seven become members and three are excluded by decision. If those numbers stop
 * adding up, somebody edited one list and not the other.
 */
const LEGACY_DIRECTORY_SIZE = 10;

module.exports = { TEAM_ONE, MEMBERS, EXCLUDED, LEGACY_DIRECTORY_SIZE };
