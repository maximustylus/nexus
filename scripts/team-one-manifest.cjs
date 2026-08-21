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
 * Benny is NOT in that list and stays — he is the department's **oHOD**, and was
 * kept deliberately when the other three stakeholders were dropped. Stated
 * explicitly because "remove the viewers" would have been the tidier-sounding rule,
 * is not what was asked for, and would have removed the head of the department.
 *
 * ── TWO INDEPENDENT FACTS, NOT ONE ROLE ──────────────────────────────────────
 *
 *   role      WHAT YOU MAY DO
 *     lead      configure the roster, generate it, invite and remove members
 *     staff     answer coverage requests, log wellbeing, hold duties
 *     viewer    read the roster and nothing else
 *
 *   rostered  WHETHER YOU HOLD CLINICAL DUTIES
 *     true      appears in the staff pool the generator draws from, and in the
 *               clinical-load table
 *     false     does not, however senior or however much they configure
 *
 * ⚠️ THESE WERE ONE FIELD AND THAT WAS A MODELLING ERROR, corrected here rather
 *    than worked around. In a ten-person department they coincided closely enough
 *    to look like one thing, so `role` was used for both and the clinical-load table
 *    excluded people with `role !== 'viewer'`.
 *
 *    NISA IS THE COUNTEREXAMPLE. She is the department's administrator AND its
 *    ROSTER MASTER — she builds the roster every week — so she must be able to
 *    configure and generate, which makes her a `lead`. She carries no clinical load,
 *    so she must not appear in the staff pool the generator draws from, or the
 *    engine will hand her duties. As a `viewer` she could not roster; as a `lead`
 *    under the old single-field model she would have been rostered. Neither is true,
 *    and no amount of choosing between them makes it true.
 *
 *    One field cannot express that. `role !== 'viewer'` puts the roster master in
 *    the staff pool; `role === 'staff'` takes the roster away from her. Both are
 *    wrong, and choosing between them harder does not make either right.
 *
 *    (Team #1 happens to have no lead who also practises — see Alif's note below —
 *    but that is a fact about this department, not about the model. A small service
 *    whose lead carries a caseload is the ordinary case elsewhere, and `rostered`
 *    is what lets this say so without another hardcoded exception.)
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
    /**
     * ⚠️ `rostered: false` FROM EVIDENCE, NOT FROM THE TITLE — and worth confirming.
     *    His title reads "Lead and Sr. CEP (JG14)", which sounds like somebody who
     *    holds duties. But `LIVE_ROSTER_DEFAULTS.staff` in `auraEngine.js` — the
     *    pool the live roster has actually been generated from — is exactly
     *    ['Brandon', 'Ying Xian', 'Derlinder', 'Fadzlynn']. The roster he builds
     *    does not include him.
     *
     *    Setting this `true` on the strength of the title would silently add a fifth
     *    person to every generated week and change rosters that four clinicians rely
     *    on. Matching what the system already does is the reversible choice; if he
     *    does take duties, flipping this is one edit in the app and no deploy.
     */
    { legacyId: 'alif',       displayName: 'Alif',       email: 'muhammad.alif@kkh.com.sg',              role: 'lead',   rostered: false, title: 'Lead and Sr. CEP (JG14)' },
    // ROSTER MASTER. Builds the roster every week, so `lead`; carries no clinical
    // load, so `rostered: false`. The pair of facts this model exists to separate.
    { legacyId: 'nisa',       displayName: 'Nisa',       email: 'siti.nur.anisah.nh@kkh.com.sg',         role: 'lead',   rostered: false, title: 'Administrator & Roster Master' },
    // oHOD — reads the roster, holds no duties, configures nothing.
    { legacyId: 'benny',      displayName: 'Benny',      email: 'benny.loo.k.g.@singhealth.com.sg',      role: 'viewer', rostered: false, title: 'oHOD' },
    { legacyId: 'brandon',    displayName: 'Brandon',    email: 'brandon.feng.gg@kkh.com.sg',            role: 'staff',  rostered: true,  title: 'CEP (JG11)' },
    { legacyId: 'ying_xian',  displayName: 'Ying Xian',  email: 'lim.ying.xian@kkh.com.sg',              role: 'staff',  rostered: true,  title: 'CEP (JG12)' },
    { legacyId: 'derlinder',  displayName: 'Derlinder',  email: 'derlinder.kaur@kkh.com.sg',             role: 'staff',  rostered: true,  title: 'CEP (JG12)' },
    { legacyId: 'fadzlynn',   displayName: 'Fadzlynn',   email: 'fadzlynn.mohamad.fadzully@kkh.com.sg',  role: 'staff',  rostered: true,  title: 'CEP (JG13)' },
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
