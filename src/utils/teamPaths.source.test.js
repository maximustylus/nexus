/**
 * ==============================================================================
 * TEAMPATHS — THE SEAM, ENFORCED BY READING THE SOURCE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * `teamPaths.js` opens with a rule: **nothing else may compose a Firestore path by
 * hand.** That is the property the whole multi-team rebuild rests on — one module
 * derives every path from a `teamId`, so partitioning is a thing you change in one
 * place rather than a convention twenty files agree to follow.
 *
 * It was a sentence in a comment. Six call sites already did not follow it.
 *
 * ── ⚠️ WHY A SOURCE-READING TEST RATHER THAN A RUNTIME GUARD ────────────────
 *
 * The runtime guard is `assertUid`, and it CANNOT close this. Its job is to catch
 * the old habit of keying a document by display name, and it does that by refusing
 * whitespace — so it catches `"Ying Xian"` and waves `"Sarah"` straight through.
 *
 * The obvious tightening is a length floor, since Firebase uids are 28 characters.
 * It was measured and rejected: a uid is drawn from 62 alphanumerics, so the chance
 * one contains no digit at all is (52/62)^28 — about **0.7%, one user in 140**. A
 * guard that locks roughly one clinician in every 140 out of their own wellbeing
 * record, to catch a mistake no current call site makes, is a worse defect than the
 * one it prevents. Firebase's uid length is not a contract either.
 *
 * So the runtime keeps the guard it can honestly make, and the property nobody can
 * check at runtime — "no call site passes a name" — is checked here instead, where
 * being wrong costs a red test rather than a locked-out clinician.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..');

const walk = (dir) => readdirSync(dir).flatMap((entry) => {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(js|jsx)$/.test(entry) && !/\.test\.(js|jsx)$/.test(entry) ? [full] : [];
});

/** Every source file except `teamPaths.js` itself, with comments stripped. */
const sources = walk(SRC)
    .filter((file) => !file.endsWith(`utils${'/'}teamPaths.js`))
    .map((file) => ({
        name: relative(SRC, file),
        code: readFileSync(file, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/[^\n]*/g, ''),
    }));

describe('⚠️ nothing composes a team path by hand', () => {
    /**
     * The collections the rebuild partitions. A string literal naming one of these
     * inside a `doc()` or `collection()` call means somebody rebuilt a path that
     * `teamPaths` already derives — and a path built by hand is a path that does not
     * move when the partitioning does.
     */
    const TEAM_SCOPED = ['teams', 'users', 'lead_requests', 'config',
        'system_data', 'shift_swaps', 'wellbeing_history', 'staff_loads', 'cep_team',
        'feed_posts', 'notifications', 'monthly_workload'];

    /**
     * ⚠️ THE EXCEPTIONS ARE NAMED, NOT PATTERN-MATCHED, so adding one is a visible
     *    decision. Each is global on purpose and `teamPaths.js` says why:
     *      · `smart_database`      AURA's append-only audit sink, never read back
     *      · `beta_feedback`       a product feedback sink, not clinical data
     *      · `community_assessments` the public portal's write; it has no team
     */
    const ALLOWED_GLOBALS = ['smart_database', 'beta_feedback', 'community_assessments'];

    it.each(TEAM_SCOPED)('no file builds a %s path from a string literal', (collection) => {
        const pattern = new RegExp(`\\b(?:doc|collection)\\s*\\(\\s*db\\s*,\\s*['"\`]${collection}['"\`]`);
        const offenders = sources.filter((file) => pattern.test(file.code)).map((f) => f.name);
        expect(offenders,
            `${offenders.join(', ')} composes a "${collection}" path by hand. Use the builder in `
            + 'src/utils/teamPaths.js — that module exists so partitioning changes in one place.')
            .toEqual([]);
    });

    it('the global sinks are the three that are documented, and no others', () => {
        const literals = new Set();
        for (const file of sources) {
            for (const m of file.code.matchAll(/\b(?:doc|collection)\s*\(\s*db\s*,\s*['"`]([a-z_]+)['"`]/g)) {
                literals.add(m[1]);
            }
        }
        expect([...literals].sort()).toEqual([...ALLOWED_GLOBALS].sort());
    });
});

describe('⚠️ per-person documents are keyed by uid, and no call site says otherwise', () => {
    /** The builders whose second (or third) argument must be a Firebase auth uid. */
    const UID_KEYED = ['memberPath', 'wellbeingDocPath', 'loadPath', 'userPath',
        'leadRequestPath', 'projectStaffPath'];

    /**
     * What a display name looks like in an argument list. `assertUid` cannot see any
     * of these — `person.displayName` is a string with no whitespace as often as not.
     */
    const NAME_SHAPED = /\b(?:displayName|display_name|fullName|staffName|personName|\w*\.name)\b/;

    it.each(UID_KEYED)('%s is never handed something name-shaped', (builder) => {
        const call = new RegExp(`\\b${builder}\\s*\\(([^)]*)\\)`, 'g');
        const offenders = [];
        for (const file of sources) {
            for (const m of file.code.matchAll(call)) {
                if (NAME_SHAPED.test(m[1])) offenders.push(`${file.name}: ${builder}(${m[1].trim()})`);
            }
        }
        expect(offenders,
            `${offenders.join(' | ')} — a display name is not unique across teams, and routing by `
            + 'one silently mis-files a colleague\'s record. Resolve it to a uid first '
            + '(`memberUidByName` in TeamContext), then pass that.')
            .toEqual([]);
    });

    /**
     * The positive half: the resolution step exists and is used. Without this, the
     * negative assertions above would pass in a codebase that had simply stopped
     * writing per-person documents at all.
     */
    it('the name-to-uid resolver is still wired up', () => {
        const usesResolver = sources.some((file) => /memberUidByName/.test(file.code));
        expect(usesResolver, 'nothing resolves a display name to a uid any more').toBe(true);
    });
});
