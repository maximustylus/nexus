'use strict';

/**
 * ==============================================================================
 * LEGACY MATCHING — whose record is this?
 * ==============================================================================
 *
 * The migration has to decide which person each pre-migration document belongs to,
 * and it decides that from a SLUG OF A DISPLAY NAME, because that is what the old
 * collections were keyed by. Getting it wrong means one clinician's wellbeing
 * history filed under another's — silently, and on the most sensitive data in the
 * project.
 *
 * So the decision lives here, as pure functions with no `firebase-admin` import, and
 * `scripts/legacyMatch.test.mjs` runs it in the ordinary `npm test`. The migration
 * itself needs a service-account key to run at all; logic that can only be exercised
 * by pointing it at production is logic nobody checks.
 *
 * ── WHY NORMALISATION IS NEEDED AT ALL ───────────────────────────────────────
 *
 * The app built that slug THREE different ways:
 *
 *   `AdminPanel.jsx`          name.toLowerCase().replace(/\s+/g, '_')   → ying_xian
 *   `AdminWellbeingPanel.jsx` name.toLowerCase().replace(/[^a-z0-9]/g, '_')
 *   `App.jsx` / normalize()   name.toLowerCase().replace(/[\s_]/g, '')  → yingxian
 *
 * — and `AdminPanel` used `.replace(' ', '_')` in two places, which replaces only
 * the FIRST space, so a three-word name slugged differently again. One person can
 * therefore own documents under `ying_xian`, `yingxian` and `ying-xian`.
 *
 * Stripping everything that is not a letter or a digit collapses all of them onto
 * one key. It is deliberately aggressive: the cost of over-matching here is nil
 * (two ids that normalise the same in one ten-person department ARE the same
 * person), and the cost of under-matching is a lost history.
 */

/** Letters and digits only, lower-cased. See the header for the three slug forms. */
const normalise = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Builds the lookup the migration uses, indexing each member under BOTH their
 * legacy id and their display name — because different collections keyed on
 * different ones, and a document written by `AdminWellbeingPanel` slugged the NAME
 * while one written by `App.jsx` used the directory ID.
 *
 * ⚠️ THROWS ON A COLLISION rather than silently preferring one member. If two people
 *    normalise to the same key, every document under it is ambiguous — and picking
 *    the first would file somebody's clinical record under a colleague without any
 *    signal that it happened. The migration must stop and let a human disambiguate.
 */
const buildLegacyIndex = (members) => {
    const index = new Map();
    const claim = (key, member) => {
        if (key === '') return;
        const existing = index.get(key);
        if (existing && existing.uid !== member.uid) {
            throw new Error(
                `Ambiguous legacy key "${key}": claimed by both ${existing.displayName} `
                + `and ${member.displayName}. Refusing to guess which one owns the existing `
                + 'documents — rename one of them in the manifest and re-run.',
            );
        }
        index.set(key, member);
    };

    members.forEach((member) => {
        claim(normalise(member.legacyId), member);
        claim(normalise(member.displayName), member);
    });
    return index;
};

/**
 * Classify one legacy document id. Three outcomes, and the caller must handle all
 * three — which is the point of returning a KIND rather than a member-or-null:
 *
 *   { kind: 'member',   member }  copy it
 *   { kind: 'excluded', person }  a person deliberately left out of the team.
 *                                 NOT an error, and must not be reported as one.
 *   { kind: 'unresolved', member } IS in the team, has no Firebase Auth account
 *                                 yet, so has no uid to file the document under.
 *                                 Recoverable by that person registering and the
 *                                 script re-running. Must NOT be reported as an
 *                                 unrecognised id — see the note in the body.
 *   { kind: 'unknown' }           matches nobody. A former colleague, or a
 *                                 mis-slugged id. Must be PRINTED — a migration
 *                                 that quietly skips a document is
 *                                 indistinguishable from one that worked.
 */
const classifyLegacyDoc = (docId, index, excluded, unresolved) => {
    const key = normalise(docId);
    const member = index.get(key);
    if (member) return { kind: 'member', member };

    const person = (excluded || []).find(
        (p) => normalise(p.legacyId) === key || normalise(p.displayName) === key,
    );
    if (person) return { kind: 'excluded', person };

    // ⚠️ A MANIFEST MEMBER WITH NO AUTH ACCOUNT IS NOT AN UNKNOWN DOCUMENT, and
    //    conflating the two sent the owner to investigate the wrong thing. The
    //    index is built from RESOLVED members, so somebody who is in the team but
    //    has not registered is absent from it and used to fall through to
    //    `unknown` — printing "matches nobody in the manifest … check whether this
    //    is a former colleague or a mis-slugged id" about a current colleague who
    //    simply has not signed in yet. The document is not lost and nothing needs
    //    investigating: they register, the script re-runs, and it lands.
    const waiting = (unresolved || []).find(
        (p) => normalise(p.legacyId) === key || normalise(p.displayName) === key,
    );
    if (waiting) return { kind: 'unresolved', member: waiting };

    return { kind: 'unknown' };
};

module.exports = { normalise, buildLegacyIndex, classifyLegacyDoc };
