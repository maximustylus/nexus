'use strict';

/**
 * ==============================================================================
 * AUTH FAILURE CLASSIFICATION — "no account" is a diagnosis, not a default
 * ==============================================================================
 *
 * ── THE BUG THIS EXISTS FOR ──────────────────────────────────────────────────
 *
 * The migration used to resolve each clinician's email like this:
 *
 *     try {
 *         const user = await getAuth().getUserByEmail(member.email);
 *         …
 *     } catch (error) {
 *         fail(`NO AUTH ACCOUNT for ${member.displayName} … They must register once`);
 *     }
 *
 * `error` was never read. EVERY failure — a wrong service-account key, a key for
 * the wrong project, a revoked key, no network, a permissions problem — was
 * reported as the one specific, confident, actionable thing it usually is not:
 * *this person has not registered*.
 *
 * The owner ran it against the live project and got seven identical
 * `NO AUTH ACCOUNT` lines, including for his own account, which certainly exists
 * because he uses the app daily. The output named seven clinicians and told him
 * they each needed to register. The actual fault was environmental and the script
 * had the error object in its hand the whole time.
 *
 * That is worse than crashing. A crash sends you to the cause; this sent him to
 * seven colleagues.
 *
 * ── THE TWO KINDS, AND WHY THEY MUST BE TREATED DIFFERENTLY ──────────────────
 *
 * `no-account`   ONE person's address has no Firebase Auth user. Per-member,
 *                expected, recoverable — they register and the script re-runs.
 *                The remaining members are unaffected, so the loop continues.
 *
 * `environment`  Anything else. It is a property of the RUN, not of the person,
 *                so it will repeat identically for every remaining member. The
 *                loop must STOP: seven copies of a wrong diagnosis bury the one
 *                real error, and the reader's eye reads a list of names.
 *
 * Firebase Auth signals the first as `auth/user-not-found`. Everything else —
 * `auth/invalid-credential`, `auth/insufficient-permission`, `auth/internal-error`,
 * `app/invalid-credential`, or an error with no `code` at all (network, DNS) — is
 * environmental. Defaulting the UNRECOGNISED case to `environment` rather than to
 * `no-account` is the whole point: an unknown failure must not be reported as a
 * missing clinician.
 */

/** The one code that genuinely means "this address has no account". */
const NO_ACCOUNT_CODE = 'auth/user-not-found';

/**
 * Hints for the codes a person running this once, at night, before a cutover, is
 * most likely to hit. Absence of a hint is fine — the raw code and message are
 * always printed, and a guess dressed as a diagnosis is what caused this bug.
 */
const HINTS = {
    'auth/invalid-credential':
        'The service-account key was rejected. Re-download it: Console → Project '
        + 'settings → Service accounts → Generate new private key.',
    'app/invalid-credential':
        'The key file could not be read or parsed. Check GOOGLE_APPLICATION_CREDENTIALS '
        + 'points at the .json you downloaded, and that the path has no typo — a '
        + 'missing file and a wrong file fail the same way here.',
    'auth/insufficient-permission':
        'The key is valid but lacks Firebase Authentication access. Use a key '
        + 'generated from Project settings → Service accounts, not a restricted one.',
    'auth/project-not-found':
        'The key is for a project that does not exist, or not this one. Check the '
        + '`project_id` inside the key file matches the NEXUS project.',
    'auth/internal-error':
        'Firebase returned an internal error. If it repeats, it is usually the key '
        + 'rather than the service — try re-downloading it.',
};

/**
 * @param {unknown} error whatever `getUserByEmail` threw
 * @returns {{kind: 'no-account'|'environment', code: string, message: string, hint: string|null}}
 */
const classifyAuthFailure = (error) => {
    const code = (error && typeof error.code === 'string') ? error.code : '';
    const message = (error && typeof error.message === 'string') ? error.message : String(error);

    if (code === NO_ACCOUNT_CODE) {
        return { kind: 'no-account', code, message, hint: null };
    }
    // ⚠️ EVERYTHING UNRECOGNISED LANDS HERE, DELIBERATELY. See the header: an
    //    unknown failure reported as a missing clinician is the bug this fixes.
    return { kind: 'environment', code, message, hint: HINTS[code] || null };
};

/** The lines to print for an environmental failure, in reading order. */
const environmentReport = (member, classified) => {
    const lines = [
        `COULD NOT REACH FIREBASE AUTH while looking up ${member.displayName} <${member.email}>.`,
        `   ${classified.code ? classified.code + ' — ' : ''}${classified.message}`,
    ];
    if (classified.hint) lines.push(`   ${classified.hint}`);
    lines.push('   This is a problem with the RUN, not with this person, so it would repeat');
    lines.push('   identically for everyone left. Stopping here rather than printing it again');
    lines.push('   under each name. Nothing was written.');
    return lines;
};

module.exports = { classifyAuthFailure, environmentReport, NO_ACCOUNT_CODE };
