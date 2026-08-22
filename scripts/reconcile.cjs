'use strict';

/**
 * ==============================================================================
 * RECONCILIATION — the line the owner reads before typing `--write`
 * ==============================================================================
 *
 * `RELEASE-v2.0.0.md` step 1 says: "Read the output before going further", and the
 * line it points at is this one. It is the go/no-go signal for a one-shot
 * migration against a working hospital's live data, so it has to be impossible to
 * misread when things are wrong.
 *
 * ── WHAT WAS WRONG WITH IT ───────────────────────────────────────────────────
 *
 * It used to print, as one sentence:
 *
 *     0 of 7 members resolved · 3 excluded by decision · 10 of 10 accounted for
 *
 * That was emitted on a run where NOTHING resolved. "10 of 10 accounted for" is
 * the most reassuring clause in the line and it is `MEMBERS.length +
 * EXCLUDED.length` against `LEGACY_DIRECTORY_SIZE` — three constants out of the
 * manifest. It cannot fail because a clinician is missing an account. It can only
 * fail if somebody edits one list in the manifest and not the other.
 *
 * That is a worthwhile check, but printing it beside the live count invites
 * exactly the wrong reading: the eye lands on "10 of 10" and concludes everybody
 * is handled.
 *
 * So the two are separated here. `roll` is what actually happened this run.
 * `manifest` is a static self-consistency assertion about the file. They are
 * never printed as one sentence again, and the failing case leads.
 *
 * It lives in its own module, with no `firebase-admin` import, for the same
 * reason `legacyMatch.cjs` does: logic that can only be exercised by pointing it
 * at production is logic nobody checks.
 */

/**
 * @param {object} input
 * @param {number} input.resolvedCount   members with a real auth uid THIS RUN
 * @param {number} input.memberCount     members the manifest intends to migrate
 * @param {number} input.excludedCount   people deliberately left out
 * @param {number} input.legacySize      how many were in the pre-migration directory
 * @returns {{ok: boolean, lines: string[], shortfall: number, manifestOk: boolean}}
 */
const reconcile = ({ resolvedCount, memberCount, excludedCount, legacySize }) => {
    const shortfall = memberCount - resolvedCount;
    const manifestOk = memberCount + excludedCount === legacySize;
    const lines = [];

    // The live result leads, and says outright whether it is the expected one.
    if (shortfall === 0) {
        lines.push(`✓ ${resolvedCount} of ${memberCount} members resolved to a Firebase Auth account.`);
    } else if (resolvedCount === 0) {
        lines.push(`❌ NOTHING RESOLVED — 0 of ${memberCount} members have a Firebase Auth account.`);
        lines.push('   Nothing will be written. Every name is listed above; each must register once.');
    } else {
        lines.push(`❌ ONLY ${resolvedCount} of ${memberCount} members resolved — ${shortfall} `
                 + `${shortfall === 1 ? 'person has' : 'people have'} no Firebase Auth account.`);
        lines.push('   Those people are named above. They will NOT be in the team, and their');
        lines.push('   wellbeing history will NOT be copied, until they register and this is re-run.');
    }

    // Second, and clearly a different kind of statement: a claim about the file,
    // not about this run. Silent when it holds — a passing check that prints is a
    // passing check that gets skimmed.
    if (!manifestOk) {
        lines.push(`⚠️  MANIFEST INCONSISTENT: ${memberCount} members + ${excludedCount} excluded `
                 + `= ${memberCount + excludedCount}, but the old directory held ${legacySize}. `
                 + 'Somebody edited one list and not the other; a person may be in neither.');
    }

    return { ok: shortfall === 0 && manifestOk, lines, shortfall, manifestOk };
};

module.exports = { reconcile };
