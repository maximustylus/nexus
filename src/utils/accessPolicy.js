/**
 * ==============================================================================
 * ACCESS POLICY — WHO MAY REGISTER, WHO MAY LEAD, AND WHAT THEY SEE MEANWHILE
 * ==============================================================================
 *
 * Everything here is a PURE FUNCTION over data. No Firebase import, no React, no
 * network. That is deliberate: the decision "may this email register" is the one
 * the whole tenancy hangs off, and a decision you cannot unit-test is a decision
 * you are taking on faith.
 *
 * ── WHAT THIS REPLACES ───────────────────────────────────────────────────────
 *
 * `WelcomeScreen.jsx:109` refused any address not ending `@kkh.com.sg`, and then
 * `checkAccess()` refused anyone not among ten hardcoded people. Two consequences,
 * both real rather than theoretical:
 *
 *   1. TWO PEOPLE IN THE DIRECTORY COULD NEVER LOG IN. Benny and Ashik hold
 *      `@singhealth.com.sg` addresses. They passed `checkAccess` and failed the
 *      domain test one line above it. Nobody noticed because both are viewers.
 *   2. ONBOARDING ANYONE MEANT A CODE DEPLOY. Twenty-eight departments cannot be
 *      served by a list a developer edits.
 *
 * ── WHAT THIS IS *NOT* ───────────────────────────────────────────────────────
 *
 * ⚠️ THE DOMAIN ALLOWLIST IS A REGISTRATION GATE, NOT A SECURITY BOUNDARY. It runs
 * in the browser, so it is advisory: anyone can call the Firebase Auth SDK directly
 * and mint an account with any address. What actually protects clinical data is,
 * in order:
 *
 *   • `firestore.rules` — membership-as-data. No membership document, no reads.
 *   • the approval Cloud Function — the ONLY thing that may create a team or a
 *     membership, and it runs on the Admin SDK where a client cannot reach it.
 *
 * So the allowlist's job is to give the wrong person a clear "your organisation
 * is not on NEXUS" instead of an account that silently does nothing. Treating it
 * as more than that is how you end up with a client-side authorisation model.
 *
 * ── FAIL CLOSED ──────────────────────────────────────────────────────────────
 *
 * `config/domains` is read before sign-in, so it is read anonymously and can fail:
 * offline, rules change, typo in the document. Every failure path here narrows to
 * `DEFAULT_ALLOWED_DOMAINS` rather than widening to "allow anything". A gate that
 * opens when its configuration cannot be read is not a gate.
 */

import { teamIdFrom } from './teamPaths';

// ==============================================================================
// 1. DOMAINS
// ==============================================================================

/**
 * The fallback, used when `config/domains` is missing or unreadable. These are the
 * two domains ALREADY present in the live directory — so this fallback restores
 * exactly today's intended population and no more. Adding to it is not the way to
 * onboard an institution; editing `config/domains` is.
 */
export const DEFAULT_ALLOWED_DOMAINS = Object.freeze([
    'kkh.com.sg',
    'singhealth.com.sg',
]);

/**
 * A domain is `label.label…` with at least one dot. No wildcards, no slashes, no
 * `@`. The wildcard refusal is the load-bearing one: a single `*` entry, typed by
 * someone trying to "allow everyone for the pilot", would open registration to the
 * public internet and look like a normal configuration value while doing it.
 */
const DOMAIN_SHAPE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * Accepts what people actually type — `@KKH.com.sg`, `  kkh.com.sg. ` — and returns
 * the canonical form, or `null` if it is not a domain at all.
 */
export const normaliseDomain = (value) => {
    if (typeof value !== 'string') return null;
    const cleaned = value.trim().toLowerCase().replace(/^@/, '').replace(/\.$/, '');
    return DOMAIN_SHAPE.test(cleaned) ? cleaned : null;
};

/**
 * The domain half of an address, or `null`. Refuses anything with a count of `@`
 * other than exactly one — `a@b@kkh.com.sg` is not a KKH address, and a naive
 * `split('@').pop()` would say it was.
 */
export const emailDomain = (email) => {
    if (typeof email !== 'string') return null;
    const parts = email.trim().toLowerCase().split('@');
    if (parts.length !== 2) return null;
    if (parts[0] === '') return null;
    return normaliseDomain(parts[1]);
};

/**
 * Reads `config/domains`. Returns `null` — meaning "use the fallback" — when the
 * document is absent or yields no usable entry; returns the usable entries when
 * some parse and silently drops the ones that do not.
 *
 * Dropping bad entries rather than rejecting the whole document is the right trade
 * here: one fat-fingered line should not lock out twenty-seven departments.
 */
export const parseDomainAllowlist = (data) => {
    if (!data || typeof data !== 'object') return null;
    const raw = Array.isArray(data.allowed) ? data.allowed : null;
    if (!raw) return null;
    const parsed = [...new Set(raw.map(normaliseDomain).filter(Boolean))].sort();
    return parsed.length > 0 ? Object.freeze(parsed) : null;
};

/**
 * THE GATE. Exact domain match only — `kkh.com.sg` does not admit
 * `mail.kkh.com.sg`, and much more importantly does not admit
 * `kkh.com.sg.attacker.example`, which an `endsWith` check would have let through.
 * Subdomains, if a cluster turns out to need them, are one extra entry in
 * `config/domains` and no code change.
 */
export const isAllowedEmail = (email, domains) => {
    const domain = emailDomain(email);
    if (!domain) return false;
    const list = Array.isArray(domains) && domains.length > 0 ? domains : DEFAULT_ALLOWED_DOMAINS;
    return list.some((entry) => normaliseDomain(entry) === domain);
};

/** The sentence shown to someone the gate refused. Names the fix, not just the no. */
export const domainRefusalMessage = (email, domains) => {
    const domain = emailDomain(email);
    const list = (Array.isArray(domains) && domains.length > 0 ? domains : DEFAULT_ALLOWED_DOMAINS)
        .map((entry) => normaliseDomain(entry)).filter(Boolean);
    if (!domain) return 'That does not look like an email address.';
    return `NEXUS is not open to ${domain} yet. Currently registered organisations: ${list.join(', ')}. `
        + 'If your department should be here, ask your service lead to request access.';
};

// ==============================================================================
// 2. ROLES — WHO MAY SET UP A TEAM
// ==============================================================================

/**
 * The owner's rule, verbatim: *"Only team/department/service leads, supervisors,
 * administrators should be able to create teams and configure, others must wait for
 * invitation to join. Those leads, supervisors/administrators needs to indicate
 * their role upon registration."*
 *
 * So the declaration is made at registration and it is a CLAIM, not a grant. Three
 * roles may claim; everyone else registers and waits to be invited.
 */
export const ROLE_LEAD = 'lead';
export const ROLE_SUPERVISOR = 'supervisor';
export const ROLE_ADMINISTRATOR = 'administrator';
export const ROLE_STAFF = 'staff';

export const LEAD_ROLES = Object.freeze([ROLE_LEAD, ROLE_SUPERVISOR, ROLE_ADMINISTRATOR]);

/** Reader-facing, in the order a registration form should offer them. */
export const ROLE_OPTIONS = Object.freeze([
    Object.freeze({ id: ROLE_STAFF, label: 'Staff — I am joining a team someone else runs', declares: false }),
    Object.freeze({ id: ROLE_LEAD, label: 'Team / department / service lead', declares: true }),
    Object.freeze({ id: ROLE_SUPERVISOR, label: 'Supervisor', declares: true }),
    Object.freeze({ id: ROLE_ADMINISTRATOR, label: 'Administrator', declares: true }),
]);

export const isLeadRole = (role) => LEAD_ROLES.includes(role);

// ==============================================================================
// 3. THE DECLARATION
// ==============================================================================

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Validates what a would-be lead typed, BEFORE a `lead_requests/{uid}` document
 * exists. Returns `{ ok, errors }` keyed by field so a form can put each message
 * beside its input.
 *
 * The last check is the one that matters and the one that is easy to leave out:
 * institution + department must compose a valid team id. Without it a request can
 * be approved into a team whose path cannot be written, and the failure surfaces
 * days later inside the Cloud Function rather than under the text box that caused
 * it.
 */
export const validateLeadDeclaration = (declaration) => {
    const errors = {};
    const role = trimmed(declaration?.role);
    const institution = trimmed(declaration?.institution);
    const department = trimmed(declaration?.department);
    const profession = trimmed(declaration?.profession);

    if (!isLeadRole(role)) {
        errors.role = 'Choose the role you hold: lead, supervisor or administrator.';
    }
    if (!institution) {
        errors.institution = 'Which hospital or institution? e.g. KKH.';
    }
    if (!department) {
        errors.department = 'Which department or service? e.g. Respiratory Therapy.';
    }
    if (!profession) {
        errors.profession = 'Choose your profession from the list.';
    }

    if (!errors.institution && !errors.department && !teamIdFrom(institution, department)) {
        errors.department = 'Those cannot make a team name. Use letters and numbers, e.g. KKH + Respiratory Therapy.';
    }

    return { ok: Object.keys(errors).length === 0, errors };
};

/**
 * The document a valid declaration becomes. Built here rather than in the component
 * so that the field names are asserted by a test instead of by whoever last edited
 * the form; `status` is pinned to `'pending'` in code because a client that could
 * choose its own status could approve itself.
 *
 * `teamId` is carried as the PROPOSED id. The approval function re-derives it and
 * is the authority; this copy exists so a reviewer can see what they are approving.
 */
export const buildLeadRequest = ({ uid, email, displayName, role, institution, department, profession }) => ({
    uid,
    email: trimmed(email).toLowerCase(),
    displayName: trimmed(displayName),
    role: trimmed(role),
    institution: trimmed(institution),
    department: trimmed(department),
    profession: trimmed(profession),
    proposedTeamId: teamIdFrom(trimmed(institution), trimmed(department)),
    status: 'pending',
});

// ==============================================================================
// 4. WHERE A SIGNED-IN PERSON LANDS
// ==============================================================================

/**
 * An authenticated user with no team is the state the old app had no answer for —
 * it rendered the full shell over empty collections, so a colleague waiting for an
 * invitation saw a roster with nobody in it and concluded NEXUS was broken. These
 * five states each get their own screen.
 */
export const ACCESS_UNVERIFIED = 'unverified';        // signed in, email not confirmed
export const ACCESS_ACTIVE = 'active';                // in at least one team — normal app
export const ACCESS_PENDING_LEAD = 'pending-lead';    // declared, waiting on approval
export const ACCESS_DECLINED = 'declined';            // declaration was refused
export const ACCESS_AWAITING_INVITE = 'awaiting-invite'; // registered, nobody has invited them

/**
 * The single decision that routes a signed-in person. Order matters and is the
 * whole content of this function:
 *
 *   • unverified first — an unverified account must not reach team data even if a
 *     membership somehow exists for it;
 *   • membership beats a pending request — someone already working in team A must
 *     not be parked on a holding screen because their request to start team B is
 *     still queued. This is the case a naive `if (request) return pending` gets
 *     wrong, and it would lock a working clinician out of a live roster.
 */
export const accessStateFor = ({ emailVerified, teamIds, leadRequest } = {}) => {
    if (emailVerified === false) return ACCESS_UNVERIFIED;

    const teams = Array.isArray(teamIds) ? teamIds.filter((id) => typeof id === 'string' && id !== '') : [];
    if (teams.length > 0) return ACCESS_ACTIVE;

    const status = trimmed(leadRequest?.status);
    if (status === 'pending') return ACCESS_PENDING_LEAD;
    if (status === 'declined') return ACCESS_DECLINED;

    return ACCESS_AWAITING_INVITE;
};

/** Whether the app shell should render at all. One place, so no screen can guess. */
export const canEnterApp = (state) => state === ACCESS_ACTIVE;
