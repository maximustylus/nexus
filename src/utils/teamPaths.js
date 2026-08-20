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
 *   teams/{teamId}/archive/{year}        was `archive_{year}`
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
    archive: 'archive',
    feed: 'feed',
    notifications: 'notifications',
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
export const assertUid = (value) => {
    if (typeof value !== 'string' || value.trim() === '' || /\s/.test(value)) {
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

const under = (teamId, collection, docId) => {
    const base = [...teamPath(teamId), collection];
    return docId === undefined ? base : [...base, docId];
};

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
export const wellbeingDocPath = (teamId, uid) => under(teamId, TEAM_COLLECTIONS.wellbeing, assertUid(uid));

export const pulsePath = (teamId, period) => under(teamId, TEAM_COLLECTIONS.pulse, period);
export const loadsPath = (teamId) => under(teamId, TEAM_COLLECTIONS.loads);
export const loadPath = (teamId, uid) => under(teamId, TEAM_COLLECTIONS.loads, assertUid(uid));
export const workloadPath = (teamId, period) => under(teamId, TEAM_COLLECTIONS.workload, period);
export const reportPath = (teamId, year) => under(teamId, TEAM_COLLECTIONS.reports, assertYear(year));
export const attendancePath = (teamId, period) => under(teamId, TEAM_COLLECTIONS.attendance, period);
export const archivePath = (teamId, year) => under(teamId, TEAM_COLLECTIONS.archive, assertYear(year));
export const feedPath = (teamId) => under(teamId, TEAM_COLLECTIONS.feed);
export const feedPostPath = (teamId, postId) => under(teamId, TEAM_COLLECTIONS.feed, postId);
export const notificationsPath = (teamId) => under(teamId, TEAM_COLLECTIONS.notifications);

// ── Root paths — see the header for why each is NOT team-scoped ──────────────

export const userPath = (uid) => [ROOT_COLLECTIONS.users, assertUid(uid)];
export const leadRequestPath = (uid) => [ROOT_COLLECTIONS.leadRequests, assertUid(uid)];
export const leadRequestsPath = () => [ROOT_COLLECTIONS.leadRequests];
export const teamsPath = () => [ROOT_COLLECTIONS.teams];

/** Cluster-wide configuration: the login domain allowlist, the super-admin list. */
export const CONFIG_DOCS = Object.freeze({ domains: 'domains', superAdmins: 'superAdmins' });
export const configPath = (docId) => [ROOT_COLLECTIONS.config, docId];

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
