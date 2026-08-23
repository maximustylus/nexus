/**
 * ==============================================================================
 * TEAM MEMBERSHIP — HOW A TEAM GROWS, AND HOW SOMEBODY LEAVES IT
 * ==============================================================================
 *
 * `approveLeadRequest` creates a team with exactly one person in it. Until this
 * module existed there was no second step: `firestore.rules` denies
 * `create` and `delete` on `teams/{teamId}/members/{uid}` outright and its comments
 * defer both to "a Cloud Function", which had not been written. A team approved
 * yesterday could never grow past its lead, and the rules file described a path
 * that did not exist. That is the single defect standing between v2.0 and a
 * cluster-wide launch.
 *
 * ------------------------------------------------------------------------------
 * WHY THE RULES CANNOT DO THIS, restated because it is the whole design
 * ------------------------------------------------------------------------------
 *
 * A lead adding a colleague needs three facts a security rule cannot see:
 *
 *   1. THAT THE uid IS A REAL ACCOUNT. Rules cannot read Firebase Auth. A lead
 *      allowed to `create` a membership for an arbitrary uid could invent one,
 *      then register that account and sign in as a member of a team they were
 *      never given. Every other rule in the file trusts the membership document,
 *      so this is the one document a client must never author.
 *   2. THAT THE ADDRESS IS ON AN ALLOWLISTED DOMAIN. Rules could technically read
 *      `config/domains`, but they cannot read the invitee's email — only the
 *      caller's — so the login gate would be enforced for people who sign
 *      themselves in and skipped for people who are added.
 *   3. TWO DOCUMENTS AT ONCE. A membership is only half a join: `users/{uid}.teamIds`
 *      has to gain the team in the same breath, or the person is a member of a team
 *      their own switcher does not list. Removal is the same in reverse, and worse —
 *      a `teamIds` entry left behind after a removal means every listener that
 *      person's app opens fails permission-denied, silently, forever.
 *
 * ------------------------------------------------------------------------------
 * WHY EVERY FUNCTION HERE TAKES ITS DEPENDENCIES AS ARGUMENTS
 * ------------------------------------------------------------------------------
 *
 * Same reason as `teamApproval.js`: this is the code that decides who may read a
 * department's wellbeing records, and it is the last place to accept "tested by
 * deploying it". Nothing here imports `firebase-admin`, touches a network or reads
 * a clock, so `vitest` collects it with no emulator and no credentials, and every
 * refusal below is asserted rather than hoped for.
 *
 * ------------------------------------------------------------------------------
 * WHAT THIS DELIBERATELY DOES NOT DO — v2.0 SCOPE, STATED SO IT IS A CHOICE
 * ------------------------------------------------------------------------------
 *
 * THERE IS NO PENDING INVITATION. A lead may only add somebody who has ALREADY
 * REGISTERED. Inviting an address with no NEXUS account is refused with a sentence
 * naming the fix, not stored for later.
 *
 * The alternative — a `team_invites` collection consumed at registration — is
 * better UX and is the obvious next step. It is not in v2.0 because it adds a
 * collection, a rules block, a consumption path inside registration and a race
 * (two leads inviting the same address) to the one change that is blocking a
 * cluster-wide launch. The ordering it forces on people is survivable precisely
 * because `AccessGate` is no longer a dead end: someone who registers before their
 * lead is ready sees a holding screen that explains the wait and offers the
 * sandbox, rather than a broken app.
 *
 * `assertInvitable` returns a `reason` code for the no-account case rather than
 * only a sentence, so adding pending invitations later is a change at the CALL
 * SITE and not a change to this contract.
 */

/**
 * Membership roles, which are NOT the declaration roles in `accessPolicy.js`.
 *
 * A declaration says what you claim to be at registration — `lead`, `supervisor`,
 * `administrator` — and all three collapse to a `lead` membership on approval. This
 * list is what a membership document may actually hold, and `firestore.rules` reads
 * exactly these values. Keeping them separate is what lets a supervisor and a
 * service lead have the same powers without the rules learning two words for it.
 */
const MEMBER_ROLES = ['lead', 'staff', 'viewer'];

/** How much of a lead-supplied free-text field is kept. Matches `teamApproval`. */
const MAX_FIELD_CHARS = 120;

const asText = (value, fallback = '', max = MAX_FIELD_CHARS) => {
    const text = typeof value === 'string' ? value.trim() : '';
    return (text === '' ? fallback : text).slice(0, max);
};

/**
 * A domain is `label.label…`, lower-case, at least one dot, no wildcards.
 *
 * ⚠️ DUPLICATED FROM `src/utils/accessPolicy.js` ON PURPOSE, AND PINNED BY A DRIFT
 *    TEST. `functions/` deploys on its own and cannot import from `src/`; the
 *    alternative is a build step whose only job is to copy one regex, which is a
 *    worse thing to maintain than a test that fails when the two disagree. The same
 *    arrangement already exists for `slugTeamId`, and the drift test in
 *    `teamApproval.test.js` is what caught a real divergence in it.
 */
const DOMAIN_SHAPE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

const normaliseDomain = (value) => {
    if (typeof value !== 'string') return null;
    const cleaned = value.trim().toLowerCase().replace(/^@/, '').replace(/\.$/, '');
    return DOMAIN_SHAPE.test(cleaned) ? cleaned : null;
};

/**
 * The domain half of an address. Refuses any `@` count other than exactly one —
 * `a@b@kkh.com.sg` is not a KKH address, and `split('@').pop()` would say it was.
 */
const emailDomain = (email) => {
    if (typeof email !== 'string') return null;
    const parts = email.trim().toLowerCase().split('@');
    if (parts.length !== 2 || parts[0] === '') return null;
    return normaliseDomain(parts[1]);
};

/**
 * The login allowlist, as the server sees it.
 *
 * ⚠️ AN UNREADABLE OR EMPTY `config/domains` MEANS REFUSE, NOT ALLOW. The client
 *    hook falls back to a built-in list because a login screen that cannot read its
 *    configuration still has to let the existing users in. The SERVER has the
 *    opposite obligation: this function is what stands between a lead and the
 *    ability to place an arbitrary address inside a team, and a gate that opens
 *    when its configuration is missing is not a gate. An empty list admits nobody.
 */
const isAllowedEmail = (email, domains) => {
    const domain = emailDomain(email);
    if (!domain) return false;
    if (!Array.isArray(domains) || domains.length === 0) return false;
    return domains.some((entry) => normaliseDomain(entry) === domain);
};

/**
 * Parse `config/domains` server-side. Returns `[]` when there is nothing usable,
 * which `isAllowedEmail` treats as "admit nobody" — see the note above.
 */
const parseDomainAllowlist = (data) => {
    if (!data || typeof data !== 'object') return [];
    const raw = Array.isArray(data.allowed) ? data.allowed : [];
    return [...new Set(raw.map(normaliseDomain).filter(Boolean))].sort();
};

/**
 * Reasons, as codes as well as sentences.
 *
 * The sentence is for the lead reading it on screen; the code is for the caller,
 * which needs to distinguish "there is no account for this address" (a normal,
 * expected outcome that a future pending-invitation path would handle rather than
 * report) from "this address is not allowed here" (a refusal that stays a refusal).
 */
const INVITE_REASONS = {
    NOT_A_LEAD: 'not-a-lead',
    NO_TEAM: 'no-team',
    BAD_EMAIL: 'bad-email',
    DOMAIN_NOT_ALLOWED: 'domain-not-allowed',
    NO_ACCOUNT: 'no-account',
    UNVERIFIED: 'unverified',
    BAD_ROLE: 'bad-role',
    ALREADY_MEMBER: 'already-member',
};

/**
 * Every reason an invitation must not become a membership, in one place.
 *
 * Returns `{ ok, reason, message, alreadyMember }` rather than throwing, because one
 * of the outcomes — ALREADY_MEMBER — is a SUCCESS from the caller's point of view.
 * A lead who clicks "Add" twice, or adds somebody a colleague already added, has got
 * what they wanted; making that an error would train people to ignore errors.
 */
const assertInvitable = ({
    teamId,
    callerMembership,
    invitee,
    role = 'staff',
    existingMembership = null,
    allowedDomains = [],
    requireVerifiedEmail = true,
}) => {
    const no = (reason, message) => ({ ok: false, reason, message, alreadyMember: false });

    /**
     * ⚠️ NORMALISED BEFORE ANYTHING READS IT, because the REFUSAL PATH reads it too.
     *    The default parameter only fires for `undefined`, so an explicit `null`
     *    from a caller — or from a `config/domains` read that returned nothing —
     *    reached `allowedDomains.length` while composing the refusal message and
     *    threw a TypeError. The gate had already decided to refuse; it then crashed
     *    on its way to saying so, which surfaces as an internal error rather than as
     *    a clear no. Found by the "not even an array" case below.
     */
    const domains = Array.isArray(allowedDomains) ? allowedDomains : [];

    if (typeof teamId !== 'string' || teamId.trim() === '') {
        return no(INVITE_REASONS.NO_TEAM, 'No team was named, so there is nobody to add them to.');
    }

    /**
     * ⚠️ THE CALLER'S MEMBERSHIP IS READ FROM THE DATABASE BY THE HANDLER, NEVER
     *    TAKEN FROM THE REQUEST. A `role: 'lead'` field arriving in `request.data`
     *    is a claim by whoever called the function. This argument is the document.
     */
    if (!callerMembership || callerMembership.role !== 'lead') {
        return no(
            INVITE_REASONS.NOT_A_LEAD,
            'Only a lead of this team can add people to it.',
        );
    }

    if (MEMBER_ROLES.indexOf(role) === -1) {
        return no(
            INVITE_REASONS.BAD_ROLE,
            'A member is a lead, staff or a viewer. "' + String(role) + '" is none of those.',
        );
    }

    if (!invitee || typeof invitee.email !== 'string' || emailDomain(invitee.email) === null) {
        return no(INVITE_REASONS.BAD_EMAIL, 'That does not look like an email address.');
    }

    if (!isAllowedEmail(invitee.email, domains)) {
        const domain = emailDomain(invitee.email);
        return no(
            INVITE_REASONS.DOMAIN_NOT_ALLOWED,
            'NEXUS is not open to ' + domain + '. Registered organisations: '
            + (domains.length > 0 ? domains.join(', ') : 'none configured')
            + '. If this institution should be here, the owner adds it to config/domains.',
        );
    }

    if (!invitee.uid) {
        return no(
            INVITE_REASONS.NO_ACCOUNT,
            'There is no NEXUS account for ' + invitee.email.trim().toLowerCase()
            + ' yet. Ask them to register first — they will land on a waiting screen — '
            + 'and then add them here.',
        );
    }

    /**
     * ⚠️ VERIFICATION IS CHECKED FOR THE INVITEE, NOT ONLY FOR THE CALLER, and it is
     *    the same bar `approveLeadRequest` holds a lead to. Without it, adding
     *    somebody by address would be a way to hand team access to an account whose
     *    owner has never proved they can read that mailbox — which is exactly what
     *    the verification step exists to establish.
     */
    if (requireVerifiedEmail && invitee.emailVerified === false) {
        return no(
            INVITE_REASONS.UNVERIFIED,
            invitee.email.trim().toLowerCase() + ' has registered but has not confirmed '
            + 'their email address yet. Ask them to click the link in it, then add them.',
        );
    }

    if (existingMembership) {
        return {
            ok: true,
            reason: INVITE_REASONS.ALREADY_MEMBER,
            message: asText(existingMembership.displayName, invitee.email)
                + ' is already in this team. Nothing was changed.',
            alreadyMember: true,
        };
    }

    return { ok: true, reason: null, message: null, alreadyMember: false };
};

/**
 * The exact writes an invitation performs, returned as data so a test can assert
 * them without a database and so the handler can put both in one batch.
 *
 * KEYED BY UID, and the shape matches `buildApprovalWrites` field for field. A
 * member added here and a lead created at approval have to be indistinguishable to
 * every reader — the roster's staff pool, the swap picker, the load table — or the
 * team's second person behaves differently from its first.
 */
const buildInviteWrites = ({ teamId, invitee, displayName, role = 'staff', rostered = true, invitedBy, now }) => {
    const name = asText(displayName, asText(invitee.email, 'Team member'));

    return {
        member: {
            path: ['teams', teamId, 'members', invitee.uid],
            data: {
                displayName: name,
                email: asText(invitee.email).toLowerCase(),
                role,
                /**
                 * A VIEWER IS NEVER ROSTERED, whatever the form said. `role` and
                 * `rostered` are separate questions everywhere else in this system —
                 * a roster master is a lead who holds no duties — but the one
                 * combination that cannot mean anything is a viewer with clinical
                 * shifts: `viewer` exists for a manager who reads the roster and does
                 * not appear in it. Allowing it would put somebody in the staff pool
                 * who cannot open the swap screen when they are given a duty.
                 */
                rostered: role === 'viewer' ? false : rostered !== false,
                grade: '',
                fte: 1,
                skills: [],
                unavailable: [],
                joinedAt: now,
                invitedBy,
            },
        },
        user: {
            path: ['users', invitee.uid],
            merge: true,
            data: {
                displayName: name,
                email: asText(invitee.email).toLowerCase(),
                // A set-union performed by the caller; this is what to add.
                addTeamIds: [teamId],
            },
        },
    };
};

const REMOVE_REASONS = {
    NOT_A_LEAD: 'not-a-lead',
    NO_TEAM: 'no-team',
    NOT_A_MEMBER: 'not-a-member',
    LAST_LEAD: 'last-lead',
    TEAM_OWNER: 'team-owner',
};

/**
 * Every reason a removal must not happen.
 *
 * NOT_A_MEMBER is `ok: true`, for the same reason ALREADY_MEMBER is: removing
 * somebody who is already gone is the state the lead asked for.
 *
 * ⚠️ THE TWO REFUSALS BELOW ARE THE ONES THAT MATTER, and both produce a team
 *    NOBODY CAN ADMINISTER — a state with no repair path inside the app, because
 *    every screen that could fix it requires a lead. The owner would have to edit
 *    Firestore by hand.
 */
const assertRemovable = ({ teamId, team, callerUid, callerMembership, targetUid, targetMembership, leadCount }) => {
    const no = (reason, message) => ({ ok: false, reason, message, alreadyGone: false });

    if (typeof teamId !== 'string' || teamId.trim() === '') {
        return no(REMOVE_REASONS.NO_TEAM, 'No team was named.');
    }

    if (!callerMembership || callerMembership.role !== 'lead') {
        return no(REMOVE_REASONS.NOT_A_LEAD, 'Only a lead of this team can remove people from it.');
    }

    if (typeof targetUid !== 'string' || targetUid.trim() === '') {
        return no(REMOVE_REASONS.NOT_A_MEMBER, 'No member was named.');
    }

    if (!targetMembership) {
        return {
            ok: true,
            reason: REMOVE_REASONS.NOT_A_MEMBER,
            message: 'That person is not in this team. Nothing was changed.',
            alreadyGone: true,
        };
    }

    /**
     * The lead the team was CREATED for. `teams/{id}.leadUid` is written once by
     * `approveLeadRequest` and never changed, so it is the durable answer to "whose
     * team is this" even after roles are shuffled. Removing them is refused
     * outright rather than guarded by the last-lead count below, because the
     * count can be satisfied by a colleague they promoted an hour ago.
     */
    if (team && team.leadUid === targetUid) {
        return no(
            REMOVE_REASONS.TEAM_OWNER,
            'That is the lead this team was created for. Ask the NEXUS owner to '
            + 'transfer the team before removing them.',
        );
    }

    /**
     * ⚠️ COUNTED, NOT INFERRED FROM `callerUid !== targetUid`. A lead removing a
     *    DIFFERENT lead is fine when there are three; a lead removing themselves is
     *    fine when there are two. The only thing that must not happen is the count
     *    reaching zero, and only a count can tell you that. `leadCount` is the
     *    number of memberships with `role === 'lead'` at the moment of the call,
     *    read by the handler.
     */
    /**
     * ⚠️ A COUNT THAT IS NOT A NUMBER MEANS ONE, NOT PERMISSION. The first version
     *    of this line was `Number(leadCount) <= 1`, and `Number(undefined)` is
     *    `NaN` — every comparison with `NaN` is false, so a handler that forgot to
     *    pass the count, or whose count query failed, sailed straight through the
     *    guard that exists to stop a team losing its last administrator. Unknown is
     *    the case this refusal is FOR.
     */
    const leads = Number.isFinite(Number(leadCount)) ? Number(leadCount) : 1;

    if (targetMembership.role === 'lead' && leads <= 1) {
        return no(
            REMOVE_REASONS.LAST_LEAD,
            callerUid === targetUid
                ? 'You are the only lead. Promote somebody else to lead first, then remove yourself.'
                : 'That is the team\'s only lead. Promote somebody else first.',
        );
    }

    return { ok: true, reason: null, message: null, alreadyGone: false };
};

/**
 * The exact writes a removal performs — a delete and a set-subtraction, which is
 * why this cannot be a rule. Returned as data for the same reason as the others.
 */
const buildRemoveWrites = ({ teamId, targetUid }) => ({
    member: {
        path: ['teams', teamId, 'members', targetUid],
        delete: true,
    },
    user: {
        path: ['users', targetUid],
        merge: true,
        // A set-subtraction performed by the caller; this is what to remove.
        data: { removeTeamIds: [teamId] },
    },
});

module.exports = {
    MEMBER_ROLES,
    MAX_FIELD_CHARS,
    INVITE_REASONS,
    REMOVE_REASONS,
    normaliseDomain,
    emailDomain,
    isAllowedEmail,
    parseDomainAllowlist,
    assertInvitable,
    buildInviteWrites,
    assertRemovable,
    buildRemoveWrites,
};
