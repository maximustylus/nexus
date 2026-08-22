/**
 * ==============================================================================
 * firebase-admin — THE PIN AND THE CALL SITES MUST AGREE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * ── WHY THIS TEST EXISTS ─────────────────────────────────────────────────────
 *
 * `npm install firebase-admin` with no version resolves to **v14**, and v14
 * removed the service namespaces from the root export. Measured, not assumed, by
 * installing both:
 *
 *   v13.10.0   typeof admin.firestore === 'function'   typeof admin.auth === 'function'
 *   v14.3.0    admin.firestore === undefined           admin.auth === undefined
 *
 *   v14 root export is exactly: AppErrorCode, FirebaseAppError, FirebaseError,
 *   SDK_VERSION, applicationDefault, cert, deleteApp, getApp, getApps,
 *   initializeApp, refreshToken.
 *
 * `scripts/migrate-to-teams.cjs` hit this in production hands and was converted to
 * subpath imports. `functions/index.js` still uses the v13 namespace form at three
 * call sites and is safe ONLY because `functions/package.json` pins `^13.6.0`,
 * which npm will never satisfy with a 14.x.
 *
 * ⚠️ WHY A TEST RATHER THAN A FIX. On v14 `functions/index.js` does not fail
 *    loudly — it fails QUIETLY, and the quiet failure is worse than a crash:
 *
 *      functions/index.js:1047   var record = await admin.auth().getUser(requestUid);
 *
 *    `admin.auth` is undefined, so this throws `TypeError`. It sits inside a `try`
 *    whose `catch` only warns and leaves the record null, so execution CONTINUES,
 *    the approval path concludes the account does not exist, and a real colleague
 *    applying to lead a team is told their account does not exist. Nothing crashes.
 *    Nothing is red in CI. The deploy succeeds and all functions register.
 *
 *    Converting those call sites is a two-line-per-site change, but it is
 *    deploy-path code and the multi-team cutover is imminent, so it is deliberately
 *    NOT being made under time pressure. This test holds the invariant that keeps
 *    the current code correct, and fails the moment somebody bumps the pin without
 *    doing the conversion — which is the only way this can actually bite.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ESM, like `functions/teamApproval.test.js`, even though the directory is CommonJS:
// the runner is Vitest and `require('vitest')` does not resolve.
const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(HERE, name), 'utf8');

/** Root-namespace service accessors — the forms v14 removed. */
const NAMESPACE_USES = (source) => {
    const lines = source.split('\n');
    const hits = [];
    lines.forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;          // comments describe it; they do not call it
        if (/\badmin\.(auth|firestore|messaging|credential|storage|database)\b/.test(line)) {
            hits.push({ line: i + 1, text: line.trim() });
        }
    });
    return hits;
};

const majorOf = (range) => {
    const m = String(range).match(/(\d+)\./);
    return m ? Number(m[1]) : null;
};

describe('firebase-admin version pin', () => {
    const pkg = JSON.parse(read('package.json'));
    const pin = pkg.dependencies['firebase-admin'];

    it('is declared at all', () => {
        expect(pin, 'functions/package.json must pin firebase-admin explicitly').toBeTruthy();
    });

    /**
     * ⚠️ THE LOAD-BEARING ASSERTION. If `functions/index.js` still reaches for the
     *    v13 namespace, the pin MUST keep npm on v13. Bumping to ^14 without first
     *    converting the call sites below does not break the build, the deploy, or
     *    CI — it breaks lead approval, silently, in production.
     */
    it('stays on a major that still has the namespace API, while the code still uses it', () => {
        const uses = NAMESPACE_USES(read('index.js'));
        if (uses.length === 0) return;   // converted — the pin is then free to move

        const major = majorOf(pin);
        expect(
            major,
            `functions/index.js still calls the v13 namespace API at `
            + `${uses.map((u) => `index.js:${u.line}`).join(', ')}, so firebase-admin must stay `
            + `on major 13. The pin reads "${pin}". Convert those call sites to `
            + `require('firebase-admin/auth') and require('firebase-admin/firestore') before `
            + 'raising it — on v14 admin.auth is undefined and approveLeadRequest reports a real '
            + 'applicant as having no account, with nothing failing anywhere.',
        ).toBe(13);
    });

    it('is a caret range, so patch and minor fixes still arrive', () => {
        expect(pin).toMatch(/^\^/);
    });
});

describe('the call sites this pin is protecting', () => {
    /**
     * Recorded as a measurement rather than asserted as a fixed number: this is
     * documentation of the debt, and its job is to change when somebody pays it
     * down. `toBeLessThanOrEqual` fails only if the debt GROWS.
     */
    it('has not grown since it was measured at three', () => {
        const uses = NAMESPACE_USES(read('index.js'));
        expect(
            uses.length,
            `New v13-only firebase-admin calls were added: ${uses.map((u) => `:${u.line}`).join(', ')}. `
            + 'Use the subpath imports for new code — the file already does at index.js:12-13.',
        ).toBeLessThanOrEqual(3);
    });

    it('does not exist in teamApproval.js, which takes its dependencies as arguments', () => {
        expect(NAMESPACE_USES(read('teamApproval.js'))).toEqual([]);
    });
});
