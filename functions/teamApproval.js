'use strict';

/**
 * ==============================================================================
 * LEAD APPROVAL — THE ONLY THING THAT MAY CREATE A TEAM
 * ==============================================================================
 *
 * A lead declares at registration; that declaration is a CLAIM. This module turns a
 * claim into a team, a membership and access to clinical data — which is why it runs
 * on the Admin SDK inside a Cloud Function and not in the browser. A client that can
 * mint its own team and its own membership is a client that can grant itself access
 * to other people's clinical records, and no amount of `firestore.rules` can undo
 * that once the write path exists.
 *
 * ── WHY THIS FILE HAS NO `require('firebase-admin')` ─────────────────────────
 *
 * Every function here takes its dependencies as arguments. That is not ceremony: it
 * means the decision logic — who may approve, what makes a request approvable, what
 * documents get written — is unit-testable with no emulator, no credentials and no
 * network, and `functions/teamApproval.test.js` runs it in the same `npm test` as
 * everything else. This is the one function in NEXUS whose bugs hand somebody access
 * they should not have; it is the last place to accept "tested by deploying it".
 *
 * `index.js` does the wiring to the real Admin SDK.
 */

// ==============================================================================
// 1. THE TEAM ID — AND THE DUPLICATION THAT HAS TO BE WATCHED
// ==============================================================================

/**
 * ⚠️ THIS IS THE SECOND IMPLEMENTATION OF A SLUG THAT ALSO EXISTS IN
 *    `src/utils/teamPaths.js` as `teamIdFrom`. The client cannot import from
 *    `functions/` (separate package, separate deploy) and this file cannot import
 *    ESM from `src/`, so a copy is unavoidable. What is avoidable is the copies
 *    DRIFTING, which would mean the id a lead is shown at registration and the id
 *    the server actually creates are different — a bug that only appears for names
 *    with unusual punctuation and is very hard to trace from either end.
 *
 *    The mitigations, both load-bearing:
 *      1. THE SERVER IS AUTHORITATIVE. `proposedTeamId` on the request document is
 *         display-only; this function re-derives and never trusts it.
 *      2. `functions/teamApproval.test.js` imports BOTH implementations and asserts
 *         they agree on a shared table. If somebody edits one, that test fails.
 */
const slugTeamId = (institution, department) => {
    const slug = (value) => (typeof value === 'string' ? value : '')
        .toLowerCase()
        // MUST MATCH `teamIdFrom` EXACTLY, INCLUDING THE MARK STRIP ON THE NEXT
        // LINE. NFKD splits 'é' into 'e' + U+0301; without removing that mark the
        // `[^a-z0-9]` pass turns it into a HYPHEN, so 'Thérapie' becomes
        // 'the-rapie' — a hyphen in the middle of a word. Both steps together are
        // what yield 'therapie'.
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    // BOTH PARTS REQUIRED. An id built from the department alone carries no
    // institution, so Physiotherapy at KKH and at SGH would collide — the exact
    // thing the team id exists to prevent.
    const parts = [slug(institution), slug(department)];
    if (parts.some((part) => part === '')) return null;

    const id = parts.join('-');
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && id.length >= 3 && id.length <= 64 ? id : null;
};

// ==============================================================================
// 2. WHO MAY APPROVE
// ==============================================================================

/**
 * Reads `config/superAdmins`. Absent or malformed means NOBODY may approve — the
 * failure direction matters here more than anywhere else in the codebase. An
 * unreadable config that defaulted to "allow" would make every signed-in user an
 * approver of every team.
 *
 * `uids` is the real list. `emails` is accepted for BOOTSTRAP only — the first
 * owner has to be named before anyone knows their uid — and is matched
 * case-insensitively against the verified token email. Prefer uids: an email can be
 * reassigned to a new employee, a uid cannot.
 */
const isSuperAdmin = (config, caller) => {
    if (!config || typeof config !== 'object') return false;
    if (!caller || typeof caller.uid !== 'string' || caller.uid === '') return false;

    const uids = Array.isArray(config.uids) ? config.uids : [];
    if (uids.includes(caller.uid)) return true;

    // Bootstrap path. Requires a VERIFIED address, because an unverified one is a
    // string the account holder chose rather than one they proved.
    if (caller.emailVerified !== true) return false;
    const email = typeof caller.email === 'string' ? caller.email.trim().toLowerCase() : '';
    if (email === '') return false;
    const emails = Array.isArray(config.emails) ? config.emails : [];
    return emails.some((entry) => typeof entry === 'string' && entry.trim().toLowerCase() === email);
};

// ==============================================================================
// 3. IS THIS REQUEST APPROVABLE?
// ==============================================================================

const LEAD_ROLES = ['lead', 'supervisor', 'administrator'];

/**
 * Every reason a pending request must not become a team, in one place, returning a
 * machine-readable `code` alongside a sentence. The codes exist so the super-admin
 * screen can act on the outcome — `team-exists` in particular is not really a
 * failure, it is "this department is already on NEXUS, invite them instead", which
 * is exactly what the declined screen tells the person.
 *
 * `alreadyApproved` is deliberately NOT an error. Approving twice — a double-click,
 * a retried call, a rerun after a timeout — must land on the same team rather than
 * on a half-made second one. The caller turns this into a successful no-op.
 */
/**
 * How much of a free-text field from a request is kept.
 *
 * ⚠️ THE DECLINE REASON WAS CAPPED AND NOTHING ELSE WAS, WHICH IS THE WRONG WAY
 *    ROUND. `buildDeclineWrite` has always sliced its reason to 500 characters —
 *    that field is written by the OWNER. The institution, department and display
 *    name come from whoever registered, are written verbatim into the team
 *    document, and are then rendered in the team switcher, the roster header and
 *    every screen that names the department. Measured: a 5,000-character department
 *    name was stored at 5,000 characters.
 *
 *    Firestore's 1MB document limit means this is not a denial of service. It is a
 *    real name that no interface can lay out, in a document nobody edits afterwards,
 *    and 120 characters is longer than any department in the cluster.
 */
const MAX_FIELD_CHARS = 120;

/**
 * The decline reason is the OWNER's prose explaining a decision to a colleague, not
 * an identity field, so it keeps the longer allowance it has always had. Truncating
 * an explanation at 120 characters would be a worse defect than the one being fixed.
 */
const MAX_REASON_CHARS = 500;

const asText = (value, fallback = '', max = MAX_FIELD_CHARS) => {
    const text = typeof value === 'string' ? value.trim().slice(0, max) : '';
    return text === '' ? fallback : text;
};

/**
 * The sentence an owner reads when the id a request slugs to is already taken.
 *
 * ⚠️ IT NAMES THE EXISTING TEAM, NOT THE REQUEST, AND THAT IS THE POINT. It used to
 *    read "{request.department} at {request.institution} is already on NEXUS" — built
 *    entirely from the NEW request, so it described a team that does not exist under
 *    that name and left the owner nothing to check against.
 *
 *    That matters because of how ids are derived. The hyphen joining institution to
 *    department is the same character used inside each half, so the boundary is not
 *    recoverable: `KKH` + `Respiratory Therapy` and `KKH Respiratory` + `Therapy`
 *    both slug to `kkh-respiratory-therapy`. Measured over 529 realistic pairs, that
 *    shape is the only collision — but it means "this id is taken" has two very
 *    different causes:
 *
 *      · a genuine duplicate — the same department asking twice. Invite them.
 *      · a lead who put a word on the wrong side of the boundary. Their department
 *        is real and new, and refusing it is wrong.
 *
 *    Only the owner can tell those apart, and only if they are shown what the
 *    existing team actually is. So the message names it, names its id, and says
 *    outright when the two descriptions differ — which is the collision case.
 */
const describeTaken = (request, existingTeam) => {
    const asked = `${asText(request.department, '(no department)')} at ${asText(request.institution, '(no institution)')}`;
    if (!existingTeam) {
        return `${asked} already has a team on NEXUS. Ask its lead to invite this person `
            + 'rather than creating a second copy.';
    }
    const held = `${asText(existingTeam.department, '(no department)')} at ${asText(existingTeam.institution, '(no institution)')}`;
    const sameThing = held.toLowerCase() === asked.toLowerCase();
    if (sameThing) {
        return `${held} is already on NEXUS. Ask its lead to invite this person rather than `
            + 'creating a second copy.';
    }
    return `That id is already held by a DIFFERENT department: the request is for ${asked}, `
        + `and the existing team is ${held}. Both produce the same id, so one of them has a `
        + 'word on the wrong side of the institution/department split. Check with the '
        + 'requester before declining — if their department is genuinely new, the id has to '
        + 'be resolved rather than the request refused.';
};

const assertApprovable = ({ request, authUser, teamExists, existingTeam = null }) => {
    if (!request) {
        return { ok: false, code: 'not-found', message: 'No such request.' };
    }
    if (request.status === 'approved') {
        return { ok: false, code: 'already-approved', message: 'This request was already approved.' };
    }
    if (request.status !== 'pending') {
        return { ok: false, code: 'not-pending', message: `This request is ${request.status || 'in an unknown state'}.` };
    }
    if (!authUser) {
        return { ok: false, code: 'no-account', message: 'The account that made this request no longer exists.' };
    }

    // ⚠️ THE CHECK `firestore.rules` DELIBERATELY COULD NOT MAKE. The request is
    // written seconds after registration, before the verification email has even
    // arrived, so the rules cannot require a verified address without making the
    // declaration impossible to write. It is required HERE instead — which is the
    // right place, because this is where the request stops being inert.
    if (authUser.emailVerified !== true) {
        return { ok: false, code: 'unverified', message: 'That account has not confirmed its email address yet.' };
    }
    if (!LEAD_ROLES.includes(request.role)) {
        return { ok: false, code: 'bad-role', message: 'That request does not name a lead, supervisor or administrator.' };
    }

    const teamId = slugTeamId(request.institution, request.department);
    if (!teamId) {
        return { ok: false, code: 'bad-team-id', message: 'The institution and department do not make a usable team name.' };
    }
    // `existingTeam` is authoritative when supplied; `teamExists` remains accepted so
    // a caller that only knows the boolean still gets the right verdict, with a
    // vaguer sentence.
    const taken = existingTeam ? true : teamExists === true;
    if (taken) {
        const held = existingTeam
            ? `${asText(existingTeam.department)} at ${asText(existingTeam.institution)}`
            : null;
        const asked = `${asText(request.department)} at ${asText(request.institution)}`;
        return {
            ok: false,
            code: 'team-exists',
            message: describeTaken(request, existingTeam),
            teamId,
            // Machine-readable, so the super-admin screen can present the collision
            // case differently from a plain duplicate rather than parsing prose.
            collision: !!(held && held.toLowerCase() !== asked.toLowerCase()),
            existingTeam: existingTeam
                ? { institution: asText(existingTeam.institution), department: asText(existingTeam.department) }
                : null,
        };
    }

    return { ok: true, teamId };
};

// ==============================================================================
// 4. THE DOCUMENTS
// ==============================================================================



/**
 * The exact writes an approval performs, returned as data so a test can assert them
 * without a database and so the caller can put them all in one batch. Built here
 * rather than inline in the handler because "what does approving actually do" is the
 * question a reviewer needs answered, and inline batch calls answer it badly.
 *
 * THE MEMBERSHIP IS KEYED BY UID. Not by display name, not by a directory id — this
 * is the defect the whole rebuild exists to remove, and this function is where the
 * very first membership document in the new model gets written.
 */
const buildApprovalWrites = ({ request, teamId, approverUid, now }) => {
    const displayName = asText(request.displayName, asText(request.email, 'Team lead'));

    return {
        teamId,
        team: {
            path: ['teams', teamId],
            data: {
                name: asText(request.department, teamId),
                institution: asText(request.institution),
                department: asText(request.department),
                profession: asText(request.profession) || null,
                leadUid: request.uid,
                createdAt: now,
                createdBy: approverUid,
            },
        },
        member: {
            path: ['teams', teamId, 'members', request.uid],
            data: {
                displayName,
                email: asText(request.email),
                // The declared role decides what they may do; all three declarable
                // roles run a team, so all three become 'lead' membership.
                role: 'lead',
                declaredAs: asText(request.role, 'lead'),
                /**
                 * ⚠️ `role` AND `rostered` ARE SEPARATE QUESTIONS, and defaulting
                 * this to `true` is a considered choice rather than an omission.
                 *
                 * `role` says what you may DO — configure, generate, invite.
                 * `rostered` says whether you hold clinical duties. A department's
                 * ROSTER MASTER is a lead who carries no load; a small service's
                 * lead usually practises alongside everyone else. Neither can be
                 * inferred from the other, and the approval function knows only
                 * that somebody asked to run a team.
                 *
                 * True is the safer default: a lead wrongly INCLUDED in the staff
                 * pool sees their own name in the roster and unticks it, which is
                 * obvious and harmless. A lead wrongly EXCLUDED silently loses a
                 * clinician from every generated week, and the roster looks
                 * plausible without them.
                 */
                rostered: true,
                // Rostering fields, empty until the lead fills them in. Present rather
                // than absent so the member editor has something to render and so a
                // missing field never means "unknown" versus "not set yet".
                grade: '',
                fte: 1,
                skills: [],
                unavailable: [],
                joinedAt: now,
            },
        },
        user: {
            path: ['users', request.uid],
            merge: true,
            data: {
                displayName,
                email: asText(request.email),
                // Written as a set-union by the caller; the array here is what to add.
                addTeamIds: [teamId],
            },
        },
        decision: {
            path: ['lead_requests', request.uid],
            merge: true,
            data: {
                status: 'approved',
                teamId,
                decidedBy: approverUid,
                decidedAt: now,
            },
        },
    };
};

const buildDeclineWrite = ({ requestUid, approverUid, reason, now }) => ({
    path: ['lead_requests', requestUid],
    merge: true,
    data: {
        status: 'declined',
        declineReason: asText(reason, 'No reason given.', MAX_REASON_CHARS),
        decidedBy: approverUid,
        decidedAt: now,
    },
});

module.exports = {
    MAX_FIELD_CHARS,
    MAX_REASON_CHARS,
    slugTeamId,
    isSuperAdmin,
    assertApprovable,
    buildApprovalWrites,
    buildDeclineWrite,
    LEAD_ROLES,
};
