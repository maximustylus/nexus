'use strict';

/**
 * ==============================================================================
 * CREDENTIAL — which project is this key actually for?
 * ==============================================================================
 *
 * ⚠️ A KEY FOR THE WRONG PROJECT IS INDISTINGUISHABLE FROM AN EMPTY ONE. Every
 *    lookup succeeds at the transport level and finds nobody. The migration then
 *    reports, correctly for that project and uselessly for this one, that none of
 *    the clinicians have registered. There is no later point in the run where the
 *    mistake surfaces — the counts are self-consistent, the dry run is clean, and
 *    a `--write` against the wrong project would create a real team in it.
 *
 *    So the project is named on the first screen, before anything is read, where
 *    it can be compared against the Firebase console.
 *
 * ── WHY THE FILE IS PARSED RATHER THAN ASKED OF THE SDK ──────────────────────
 *
 * The obvious approach is `getApp().options.projectId`. It does not work:
 * `initializeApp()` with `GOOGLE_APPLICATION_CREDENTIALS` set leaves `options`
 * holding only a credential object whose `_cachedProjectId` is `null` until
 * google-auth-library resolves it lazily, on a later call. Verified on
 * firebase-admin 14.3.0 — `app.options.projectId` is `undefined` at that point,
 * and a preflight built on it would abort a perfectly good run.
 *
 * The key file is the truth about which project the key belongs to, it is exactly
 * what `GOOGLE_APPLICATION_CREDENTIALS` points at, and reading it needs no
 * network and no SDK state.
 */

const fs = require('fs');

/**
 * Pure: takes the raw contents of a service-account JSON and says what it is.
 * Separated from the read so it can be tested without a fixture on disk.
 *
 * @param {string} raw
 * @returns {{ok: boolean, projectId: string|null, clientEmail: string|null, problem: string|null}}
 */
const describeCredential = (raw) => {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return {
            ok: false, projectId: null, clientEmail: null,
            problem: 'The credential file is not valid JSON. Re-download it from Console → '
                   + 'Project settings → Service accounts → Generate new private key.',
        };
    }
    if (!parsed || typeof parsed !== 'object') {
        return { ok: false, projectId: null, clientEmail: null, problem: 'The credential file is not a JSON object.' };
    }
    const projectId = typeof parsed.project_id === 'string' ? parsed.project_id : null;
    const clientEmail = typeof parsed.client_email === 'string' ? parsed.client_email : null;

    if (!projectId) {
        return {
            ok: false, projectId: null, clientEmail,
            problem: 'The credential names no `project_id`. That usually means it is an OAuth '
                   + 'client secret or a user credential rather than a service-account key.',
        };
    }
    // A service-account key is what this needs; a user credential authenticates as a
    // person and will fail differently and later, so it is caught here instead.
    if (parsed.type && parsed.type !== 'service_account') {
        return {
            ok: false, projectId, clientEmail,
            problem: `The credential is of type "${parsed.type}", not "service_account". Generate `
                   + 'a new private key from Console → Project settings → Service accounts.',
        };
    }
    return { ok: true, projectId, clientEmail, problem: null };
};

/**
 * Reads whatever `GOOGLE_APPLICATION_CREDENTIALS` points at and describes it.
 * Never throws — a missing or unreadable path is a described problem, because the
 * whole purpose of this step is to turn an environment mistake into a sentence.
 *
 * @param {string|undefined} pathFromEnv
 */
const describeCredentialFile = (pathFromEnv) => {
    if (!pathFromEnv) {
        return {
            ok: false, path: null, projectId: null, clientEmail: null,
            problem: 'GOOGLE_APPLICATION_CREDENTIALS is not set. Prefix the command with '
                   + 'GOOGLE_APPLICATION_CREDENTIALS=/path/to/your-key.json',
        };
    }
    let raw;
    try {
        raw = fs.readFileSync(pathFromEnv, 'utf8');
    } catch (error) {
        return {
            ok: false, path: pathFromEnv, projectId: null, clientEmail: null,
            problem: `Could not read the credential file at ${pathFromEnv} — ${error.code || error.message}. `
                   + 'A path typo and a missing file fail the same way here; check the path first. '
                   + 'Note that `~` is expanded by your shell, not by Node, so a quoted path '
                   + 'like "~/key.json" will not resolve.',
        };
    }
    return { ...describeCredential(raw), path: pathFromEnv };
};

module.exports = { describeCredential, describeCredentialFile };
