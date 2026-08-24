/**
 * ==============================================================================
 * TEAM PATHS — the ONE place a Firestore path is composed
 * ==============================================================================
 *
 * NEXUS was built for one ten-person team, with every collection at the root of
 * the database and the team itself hardcoded in three separate files. Serving 28
 * allied health professions across several SingHealth institutions means a team
 * becomes a THING with an id, and every document it owns lives beneath it.
 *
 * ⚠️ THE RULE THIS MODULE EXISTS TO ENFORCE: NOTHING ELSE IN THE APP MAY COMPOSE
 * A FIRESTORE PATH BY HAND. Not `doc(db, 'system_data', 'roster_2026')`, not a
 * template string, not "just this once". A path composed somewhere else is a path
 * that keeps pointing at the OLD global collection after the migration — which
 * means one department's roster silently written into another department's
 * document. That is the worst outcome this project has available to it, it would
 * not throw, and nothing on screen would say so.
 *
 * WHY THIS FILE IMPORTS NOTHING. It is pure string work: every function returns
 * an ARRAY OF PATH SEGMENTS for the caller to spread into `doc(db, ...)` or
 * `collection(db, ...)`. That keeps it unit-testable without a Firestore mock,
 * and means a path bug surfaces as a failing assertion here rather than as a
 * permission-denied in a clinician's browser.
 *
 * ------------------------------------------------------------------------------
 * WHAT IS TEAM-SCOPED, AND WHAT DELIBERATELY IS NOT
 * ------------------------------------------------------------------------------
 *
 * TEAM-SCOPED — everything a department owns and no other department may see:
 *
 *   teams/{teamId}                       the team record
 *   teams/{teamId}/members/{uid}         who is in it, and their grade/FTE/skills
 *   teams/{teamId}/rosters/{year}        was `system_data/roster_2026`
 *   teams/{teamId}/swaps/{swapId}        was `shift_swaps`
 *   teams/{teamId}/wellbeing/{uid}       was `wellbeing_history/{directoryId}`
 *   teams/{teamId}/pulse/{period}        was `system_data/daily_pulse`
 *   teams/{teamId}/loads/{uid}           was `staff_loads/{directoryId}`
 *   teams/{teamId}/workload/{period}     was `monthly_workload`
 *   teams/{teamId}/reports/{year}        was `system_data/reports_{year}`
 *   teams/{teamId}/attendance/{period}   was `system_data/monthly_attendance`
 *   teams/{teamId}/projects/{year}/staff/{uid}
 *                                        was `cep_team` for the current year and
 *                                        `archive_{year}` for every other one —
 *                                        two collections holding one shape
 *   teams/{teamId}/feed/{postId}         was `feed_posts`
 *   teams/{teamId}/notifications/{id}    was `notifications`
 *
 * NOT TEAM-SCOPED, each for a stated reason — this list is as load-bearing as the
 * one above, because scoping one of these would BREAK it:
 *
 *   users/{uid}              A PERSON, not a membership. One human has one profile
 *                            and may belong to more than one team; `teamIds` on the
 *                            profile is what links them. Scoping it per team would
 *                            mean a clinician editing their name in two places.
 *   lead_requests/{uid}      A declaration made BEFORE any team exists. It cannot
 *                            live under a team by definition — that is the point of
 *                            the approval step.
 *   config/{docId}           Cluster-wide settings: the login domain allowlist and
 *                            the super-admin list. Team-scoping the thing that
 *                            decides who may create a team is circular.
 *   beta_feedback/{id}       A deliberately PUBLIC write-only sink — the sandbox
 *                            widget has no login and therefore no team. Reconciled
 *                            2026-08-18; see `firestore.rules`.
 *   community_assessments/   Public screening telemetry, written by members of the
 *                            public with no account at all. Same reasoning.
 *   resources/{id}           Read only by a Cloud Function via the Admin SDK, which
 *                            bypasses rules entirely. No client touches it.
 *   smart_database/{id}      AURA's audit sink. Left global on purpose: it is
 *                            append-only, never read back, and its documents carry
 *                            their own author. Flagged rather than moved, so the
 *                            decision is visible.
 *
 * ------------------------------------------------------------------------------
 * IDENTITY: `uid`, NEVER A DISPLAY NAME
 * ------------------------------------------------------------------------------
 *
 * The old model keyed documents by human name — `shift_swaps.targetStaff` was
 * `"Ying Xian"`, `wellbeing_history/fadzlynn` was a directory id. `firestore.rules`
 * has carried the diagnosis for months: *"The only durable fix is to stop keying
 * documents by display name."* At ten people you get away with it. Across 28
 * professions and several institutions, two people called Sarah is a certainty,
 * and the failure is silent mis-routing of one clinician's wellbeing record into
 * another's.
 *
 * So every per-person path below takes a `uid`. A display name is a field to
 * RENDER, never a key to route by. `assertUid` refuses anything that looks like a
 * name, which is a cheap guard against the old habit surviving a copy-paste.
 */

/** Collection names, as data, so a typo is a test failure rather than a silent miss. */
export const TEAM_COLLECTIONS = Object.freeze({
    members: 'members',
    rosters: 'rosters',
    swaps: 'swaps',
    wellbeing: 'wellbeing',
    pulse: 'pulse',
    loads: 'loads',
    workload: 'workload',
    reports: 'reports',
    attendance: 'attendance',
    // WAS TWO COLLECTIONS FOR ONE THING. `cep_team` held the CURRENT year's
    // per-person project and domain data; `archive_2025`, `archive_2024` … held
    // exactly the same shape for previous years, and `App.jsx` chose between them
    // with `dataYear === '2026' ? 'cep_team' : `archive_${dataYear}``. The current
    // year being a differently-named collection is the kind of special case that
    // has to be remembered at every call site and eventually is not.
    projects: 'projects',
    feed: 'feed',
    notifications: 'notifications',
    /**
     * ⚠️ A SEPARATE COLLECTION BECAUSE FIRESTORE RULES CANNOT HIDE A FIELD.
     *
     * Pay grade is what `bandOfGrade` reads to decide who may lead a shift, so the
     * roster needs it — and it is the most sensitive thing anybody would volunteer
     * about themselves short of the wellbeing log. `teams/{id}/members/{uid}` is
     * readable by every member of the team, deliberately: the roster, the swap
     * picker and the load table are all built from that list. A rule cannot grant
     * `get` on a document while withholding one of its fields, so a grade stored
     * there is a grade every colleague can read.
     *
     * It therefore lives in its own document under its own rule — readable by the
     * person and by a lead, and by nobody else. See `firestore.rules`.
     */
    grades: 'grades',
    /**
     * A department's roster CONFIGURATION — its tasks, band boundaries, hours
     * policy and scheduling rules. Not the roster itself, and not the people: the
     * staff pool is `members`, and their grades are `grades`. See
     * `src/utils/rosterSettings.js` for why those two are excluded rather than
     * copied in.
     */
    settings: 'settings',
});

/** Root collections that are NOT beneath a team. See the header for each reason. */
export const ROOT_COLLECTIONS = Object.freeze({
    teams: 'teams',
    users: 'users',
    leadRequests: 'lead_requests',
    config: 'config',
    betaFeedback: 'beta_feedback',
    communityAssessments: 'community_assessments',
    resources: 'resources',
    smartDatabase: 'smart_database',
});

/**
 * A team id is a slug: lower-case letters, digits and single hyphens, 3–64 chars.
 *
 * ⚠️ VALIDATED, AND IT THROWS RATHER THAN RETURNING null. Every other refusal in
 * this codebase is a value you can ignore; this one must not be, because the
 * failure it prevents is a write to the wrong department's document. A `teamId`
 * containing `/` would escape the subtree entirely and land somewhere arbitrary —
 * `teams/a/members/../../other-team/rosters/2026` is a real Firestore path. An
 * empty or undefined id would compose `teams//rosters/2026`, which Firestore
 * rejects with an error nobody reads. Throwing turns both into a stack trace at
 * the call site, in development, instead of corrupt data in production.
 */
const TEAM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isTeamId = (value) =>
    typeof value === 'string' && value.length >= 3 && value.length <= 64 && TEAM_ID.test(value);

export const assertTeamId = (value) => {
    if (!isTeamId(value)) {
        throw new Error(
            `Invalid teamId: ${JSON.stringify(value)}. A team id is 3–64 characters of `
            + 'lower-case letters, digits and single hyphens. Refusing to compose a Firestore '
            + "path from it — a malformed id writes into another team's data rather than failing.",
        );
    }
    return value;
};

/**
 * A uid is Firebase's, and the guard is deliberately shaped to catch the OLD
 * habit rather than to validate Firebase's format precisely. Firebase uids are
 * opaque (28 chars today, but that is not a contract), so this refuses the two
 * things that actually appear when somebody reaches for the previous model: a
 * string containing a SPACE (`"Ying Xian"`), and the empty string.
 */
/**
 * Document ids Firestore itself forbids, and which `assertUid` used to wave
 * through because none of them contains whitespace.
 *
 * ⚠️ THE POINT OF THIS GUARD IS TO FAIL AT THE CALL SITE WITH A SENTENCE. Firestore
 *    would reject `a/b` too — `doc(db, 'users', 'a/b')` composes `users/a/b`, an
 *    odd number of segments, and throws "Invalid document reference". So the old
 *    behaviour was loud rather than silent. But the error it produced named neither
 *    the value nor the habit that produced it, which is the entire reason this
 *    function exists rather than letting Firestore do the complaining.
 */
const FORBIDDEN_ID = (value) => value === '.' || value === '..'
    || value.includes('/')
    || /^__.*__$/.test(value);

export const assertUid = (value) => {
    if (typeof value !== 'string' || value.trim() === '' || /\s/.test(value) || FORBIDDEN_ID(value)) {
        throw new Error(
            `Invalid uid: ${JSON.stringify(value)}. Per-person documents are keyed by Firebase `
            + 'auth uid, never by display name — a name is not unique across teams and routing by '
            + 'one silently mis-files a colleague\'s record. Pass `user.uid`.',
        );
    }
    return value;
};

/** A year key, as the roster documents use it. */
const assertYear = (value) => {
    const year = typeof value === 'number' ? String(value) : value;
    if (typeof year !== 'string' || !/^\d{4}$/.test(year)) {
        throw new Error(`Invalid year: ${JSON.stringify(value)}. Expected a four-digit year.`);
    }
    return year;
};

/**
 * Derive a stable team id from what a lead types at registration.
 *
 * INSTITUTION FIRST, because that is the coarser fact and it makes the ids sort
 * usefully in the console: `kkh-respiratory-therapy` beside `kkh-physiotherapy`,
 * not scattered by department name. It also makes the collision case obvious to a
 * human reading the list — two institutions with a Physiotherapy department
 * produce two clearly different ids rather than one shared one.
 *
 * Returns `null` rather than throwing, because this one IS a user-input path: a
 * lead typing an empty department should see a form error, not a crash.
 *
 * ⚠️ BOTH PARTS ARE REQUIRED, and the first draft of this function did not enforce
 *    it — it used `.filter(Boolean).join('-')`, so `teamIdFrom('KKH', '')` returned
 *    `'kkh'` and, far worse, `teamIdFrom('', 'Physiotherapy')` returned
 *    `'physiotherapy'`: a team id with NO INSTITUTION IN IT, which defeats the one
 *    property this module exists to guarantee — that the same department at two
 *    hospitals never collides. Found by the drift test in
 *    `functions/teamApproval.test.js`, which compares this against the server's copy.
 *
 * ⚠️ NFKD MUST BE FOLLOWED BY A COMBINING-MARK STRIP, AND MUST MATCH THE SERVER
 *    COPY EXACTLY. NFKD alone decomposes 'é' into 'e' + U+0301 — and then the
 *    `[^a-z0-9]` pass turns that leftover mark into a HYPHEN, so 'Thérapie' becomes
 *    `the-rapie`: a hyphen inserted into the middle of a word. Removing the marks
 *    between the two steps is what actually yields `therapie`. The original comment
 *    on this function claimed NFKD alone did that; it does not, and the assertion
 *    written to prove it is what showed otherwise.
 */
export const teamIdFrom = (institution, department) => {
    const slug = (value) => (typeof value === 'string' ? value : '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')   // ← drop the marks NFKD just split off
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const parts = [slug(institution), slug(department)];
    if (parts.some((part) => part === '')) return null;

    const id = parts.join('-');
    return isTeamId(id) ? id : null;
};

// ── Team-scoped paths ────────────────────────────────────────────────────────

export const teamPath = (teamId) => [ROOT_COLLECTIONS.teams, assertTeamId(teamId)];

/**
 * `teams/{id}/…` — the base every team-scoped path is built from.
 *
 * Variadic since `projects` arrived: that one nests a second level
 * (`projects/{year}/staff/{uid}`), and the fixed three-argument version silently
 * DROPPED the extra segments rather than failing — a path one level short of where
 * it should be, which reads as an empty collection rather than as a bug.
 */
const under = (teamId, collection, ...rest) => [
    ...teamPath(teamId),
    collection,
    ...rest.filter((segment) => segment !== undefined),
];

/** The team's member list, or one member. Keyed by UID. */
export const membersPath = (teamId) => under(teamId, TEAM_COLLECTIONS.members);
export const memberPath = (teamId, uid) => under(teamId, TEAM_COLLECTIONS.members, assertUid(uid));

/** The duty roster for one year — was the single global `system_data/roster_2026`. */
export const rostersPath = (teamId) => under(teamId, TEAM_COLLECTIONS.rosters);
export const rosterPath = (teamId, year) => under(teamId, TEAM_COLLECTIONS.rosters, assertYear(year));

/** Shift swaps — was the global `shift_swaps`, where `targetStaff` was a NAME. */
export const swapsPath = (teamId) => under(teamId, TEAM_COLLECTIONS.swaps);
export const swapPath = (teamId, swapId) => under(teamId, TEAM_COLLECTIONS.swaps, swapId);

/**
 * Wellbeing — the most sensitive collection in the project, a longitudinal
 * energy/burnout record per named clinician. Team-scoped AND uid-keyed, and the
 * cross-team isolation test for this path is the most important assertion in the
 * whole rules suite.
 */
export const wellbeingPath = (teamId) => under(teamId, TEAM_COLLECTIONS.wellbeing);

/**
 * The one wellbeing document that is NOT a person: the shared bucket an anonymous
 * check-in appends to, so somebody can log how they are without it being filed
 * under their name. Named here rather than passed as a string to
 * `wellbeingDocPath`, because `assertUid` would wave `_anonymous_logs` through
 * (it has no spaces) and the exemption would then be invisible.
 *
 * The leading underscore keeps it out of any list of real people sorted by uid.
 */
export const ANONYMOUS_WELLBEING_ID = '_anonymous_logs';
export const anonymousWellbeingPath = (teamId) =>
    under(teamId, TEAM_COLLECTIONS.wellbeing, ANONYMOUS_WELLBEING_ID);
/**
 * One person's wellbeing document.
 *
 * ⚠️ IT REFUSES `ANONYMOUS_WELLBEING_ID`, AND THAT IS THE ENFORCEMENT OF WHAT THE
 *    NOTE ABOVE ONLY ASSERTED. `assertUid` waves `_anonymous_logs` through — it has
 *    no whitespace — so this path composed the SHARED anonymous bucket whenever it
 *    was handed that string, silently, as though it were a person. No Firebase uid
 *    is that string today, which is why this has never happened; a sentinel that
 *    shares an id space with real keys is a property to enforce rather than an
 *    accident to keep being lucky about.
 */
export const wellbeingDocPath = (teamId, uid) => {
    if (uid === ANONYMOUS_WELLBEING_ID) {
        throw new Error(
            `Refusing to treat ${JSON.stringify(ANONYMOUS_WELLBEING_ID)} as a person. It is the `
            + 'shared anonymous check-in bucket; use `anonymousWellbeingPath(teamId)` for that '
            + 'document, and pass a real `user.uid` here.',
        );
    }
    return under(teamId, TEAM_COLLECTIONS.wellbeing, assertUid(uid));
};

/**
 * The pulse board. `period` exists so a team can keep more than one snapshot —
 * today there is exactly one, `daily`, which is what `system_data/daily_pulse`
 * was: a single live document overwritten in place, with no history.
 *
 * Named rather than inlined because it is written in one file and read in another,
 * and two string literals that must agree is how a board ends up reading a document
 * nothing writes.
 */
export const PULSE_PERIOD_DAILY = 'daily';
export const pulsePath = (teamId, period) => under(teamId, TEAM_COLLECTIONS.pulse, period);
export const loadsPath = (teamId) => under(teamId, TEAM_COLLECTIONS.loads);
export const loadPath = (teamId, uid) => under(teamId, TEAM_COLLECTIONS.loads, assertUid(uid));
/**
 * `AU4` — the period gets the same treatment as the year, for the same reason:
 * this id comes ultimately from a MODEL (MODE 3's `target_doc`), and an id
 * nothing validates is a stray document nothing cleans up. Strictly lowercase
 * here: `dataEntryGuard` accepts `Jan_2026` case-insensitively and the caller
 * lowercases before this runs, so by this point a mixed-case period is a coding
 * error upstream, not a model quirk to tolerate into two documents per month.
 */
const assertPeriod = (value) => {
    if (typeof value !== 'string'
        || !/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)_\d{4}$/.test(value)) {
        throw new Error(`Invalid workload period: ${JSON.stringify(value)}. Expected mmm_yyyy, e.g. "jan_2026".`);
    }
    return value;
};

export const workloadPath = (teamId, period) => under(teamId, TEAM_COLLECTIONS.workload, assertPeriod(period));
export const reportPath = (teamId, year) => under(teamId, TEAM_COLLECTIONS.reports, assertYear(year));
/**
 * Monthly attendance. Was ONE global document, `system_data/monthly_attendance`,
 * holding every month for every year in a single map with no year in the key — so
 * a second year's data would have overwritten the first's month by month, silently.
 * Keying it by year here is a fix carried along with the move, not a redesign: the
 * migration writes the existing document under the year it actually describes.
 */
export const attendancePath = (teamId, year) =>
    under(teamId, TEAM_COLLECTIONS.attendance, assertYear(year));
/**
 * Per-person project and domain data for ONE YEAR — was `cep_team` for the current
 * year and `archive_{year}` for every other, two collections holding one shape.
 *
 * The year is a document and the people hang beneath it, so 2026 stops being
 * special: `projectsYearPath(id, '2026')` and `projectsYearPath(id, '2024')` differ
 * only in the year, which is what lets the year selector be a value rather than a
 * branch.
 */
export const projectsYearPath = (teamId, year) =>
    under(teamId, TEAM_COLLECTIONS.projects, assertYear(year));
export const projectsStaffPath = (teamId, year) =>
    under(teamId, TEAM_COLLECTIONS.projects, assertYear(year), 'staff');
export const projectStaffPath = (teamId, year, uid) =>
    under(teamId, TEAM_COLLECTIONS.projects, assertYear(year), 'staff', assertUid(uid));
/**
 * One person's pay grade, and NOT part of their membership document.
 *
 * ⚠️ THE SPLIT IS THE PRIVACY MECHANISM, NOT AN ORGANISING PREFERENCE. Rules grant
 *    access per DOCUMENT; there is no field-level read. So the only way for the
 *    roster to know a grade while a colleague does not is for the grade to be a
 *    document a colleague cannot open.
 *
 * ⚠️ AND THE PROTECTION IS NOT TOTAL, WHICH IS WORTH SAYING RATHER THAN IMPLYING.
 *    The engine gives lead shifts to senior and principal bands, so a published
 *    roster still tells an attentive reader which BAND somebody is in. What this
 *    withholds is the number, and the difference between "rosters as senior" and
 *    "is an AH14" is most of what makes the number uncomfortable.
 */
export const gradesPath = (teamId) => under(teamId, TEAM_COLLECTIONS.grades);
export const gradePath = (teamId, uid) => under(teamId, TEAM_COLLECTIONS.grades, assertUid(uid));

/**
 * `teams/{id}/settings/roster` — the Configure wizard, persisted.
 *
 * A fixed document id rather than a free one: there is exactly one roster
 * configuration per team and always will be, so the id is a constant and a typo
 * cannot silently address a second, empty document that reads as "never
 * configured".
 */
export const ROSTER_SETTINGS_ID = 'roster';
export const rosterSettingsPath = (teamId) =>
    under(teamId, TEAM_COLLECTIONS.settings, ROSTER_SETTINGS_ID);

export const feedPath = (teamId) => under(teamId, TEAM_COLLECTIONS.feed);
export const feedPostPath = (teamId, postId) => under(teamId, TEAM_COLLECTIONS.feed, postId);
export const notificationsPath = (teamId) => under(teamId, TEAM_COLLECTIONS.notifications);
export const notificationPath = (teamId, notificationId) =>
    under(teamId, TEAM_COLLECTIONS.notifications, notificationId);

// ── Root paths — see the header for why each is NOT team-scoped ──────────────

export const userPath = (uid) => [ROOT_COLLECTIONS.users, assertUid(uid)];
export const leadRequestPath = (uid) => [ROOT_COLLECTIONS.leadRequests, assertUid(uid)];
export const leadRequestsPath = () => [ROOT_COLLECTIONS.leadRequests];
export const teamsPath = () => [ROOT_COLLECTIONS.teams];

/** Cluster-wide configuration: the login domain allowlist, the super-admin list. */
export const CONFIG_DOCS = Object.freeze({ domains: 'domains', superAdmins: 'superAdmins' });

/**
 * ⚠️ AN ALLOWLIST, NOT A SHAPE CHECK, AND THIS IS THE ONE PATH WHERE THAT IS RIGHT.
 *    `config` holds exactly two documents and always will: the login domain
 *    allowlist and the super-admin list. Both decide who may get in. Every other
 *    builder here takes an id somebody's data legitimately supplies, so it can only
 *    validate the SHAPE; this one knows the complete set of legal answers, and a
 *    typo'd `superadmins` resolving to an empty document reads as "nobody is a
 *    super admin" rather than as a mistake.
 *
 *    It had no guard at all and composed `["config", ""]` from an empty string.
 */
export const configPath = (docId) => {
    if (!Object.values(CONFIG_DOCS).includes(docId)) {
        throw new Error(
            `Invalid config document: ${JSON.stringify(docId)}. `
            + `Expected one of: ${Object.values(CONFIG_DOCS).join(', ')}. Use \`CONFIG_DOCS\`.`,
        );
    }
    return [ROOT_COLLECTIONS.config, docId];
};

/**
 * THE LEGACY PATHS, NAMED RATHER THAN SCATTERED.
 *
 * The migration COPIES from these and never moves, so they remain readable by the
 * previous bundle and rollback stays possible. They are exported for exactly two
 * callers — the migration script and its verification — and for nothing else. If
 * application code imports one of these after the cutover, that is a bug: it means
 * a call site was missed, and the whole point of this module is that such a site
 * cannot exist quietly.
 */
export const LEGACY = Object.freeze({
    roster: (year) => ['system_data', `roster_${assertYear(year)}`],
    dailyPulse: () => ['system_data', 'daily_pulse'],
    monthlyAttendance: () => ['system_data', 'monthly_attendance'],
    reports: (year) => ['system_data', `reports_${assertYear(year)}`],
    swaps: () => ['shift_swaps'],
    wellbeing: (directoryId) => ['wellbeing_history', directoryId],
    staffLoads: (directoryId) => ['staff_loads', directoryId],
    monthlyWorkload: (period) => ['monthly_workload', period],
    cepTeam: () => ['cep_team'],
    archive: (year) => [`archive_${assertYear(year)}`],
    feedPosts: () => ['feed_posts'],
    notifications: () => ['notifications'],
});
