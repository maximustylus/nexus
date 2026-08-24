/**
 * ==============================================================================
 * THE LEGACY BRIDGE — recognition without disclosure · `AN14`
 * ==============================================================================
 *
 * `TEAM_DIRECTORY` shipped seven real people — full names, work email addresses,
 * roles and titles — as a module-level constant. One SPA bundle serves every
 * route, including `/individuals`, the community screening a member of the public
 * opens with no sign-in, so all of it was downloadable as part of the page. No
 * Firestore read is involved and no rule could ever have stopped it. The grades
 * were removed by `AN1`; the names and addresses stayed, because `checkAccess`
 * still matched on them and reworking an auth-adjacent bridge was not a thing to
 * do the night before a demo.
 *
 * This module is that rework. The observation that unlocks it: the bridge only
 * ever needs to RECOGNISE an email it is HANDED — at sign-in, or from the signed-in
 * user's own auth token. It never needs to enumerate people, so it never needed
 * the plaintext. What ships now is a salted SHA-256 digest per member, plus the
 * role and a badge-level title. Names are gone entirely: at every call site the
 * person's display name is available from their own auth profile or their own
 * `users/{uid}` document.
 *
 * ------------------------------------------------------------------------------
 * ⚠️ THE THREAT MODEL, STATED HONESTLY (P1)
 * ------------------------------------------------------------------------------
 *
 * This stops the bundle CONTAINING the data — the disclosure `AN14` records, where
 * a curious visitor reads seven identities out of view-source. It does NOT make
 * membership unqueryable: the salt ships in the same bundle, so somebody who
 * already knows an email (or guesses one from the institutional format) can hash
 * it and confirm this person is one of seven legacy members. That residual is a
 * MEMBERSHIP ORACLE over guessed inputs, not a disclosure of stored data, and it
 * dies with the bridge itself. It is accepted, and recorded here rather than in
 * a comment nobody finds.
 *
 * The bridge remains DELETABLE, and deletion is still the destination — the
 * moment the owner verifies in production that every legacy member's
 * `users/{uid}` document carries `teamIds`, this file and both its call sites go.
 * Nothing here loosens that trigger; it only stops the wait shipping PII.
 *
 * ⚠️ WHY THE TABLE KEEPS `role` AND `title` IN CLEAR TEXT. They are the two fields
 *    the app still reads off the bridge profile (`user?.role === 'admin'` gates in
 *    `RosterView`/`WellbeingView`, `title` renders in headers), they are identical
 *    for five of seven rows, and stripped of name and email they identify nobody:
 *    "an administrator at some institution" is not a person.
 */

import { sha256Hex } from './sha256.js';

/**
 * Public, and that is fine: the salt's job is to stop a digest being matched
 * against precomputed tables of common emails, not to be a secret. See the
 * threat model above for what that does and does not buy.
 */
const BRIDGE_SALT = 'nexus-legacy-bridge-v1|';

/**
 * digest(salt + lowercased email) → the two fields the app still needs.
 * Regenerate with `scripts/legacy-bridge-digest.cjs` if membership ever changes —
 * though membership changing is supposed to mean deleting this file instead.
 */
const LEGACY_MEMBERS = new Map([
    ['a662be160a7bcb62d57ce44a5754762d09566f92d679cc1d79b6e1841717cf32', { role: 'admin', title: 'Lead, Clinical Exercise Physiology' }],
    ['8eacb899f583a3b2386479bb470ea17648a3a84f55911853ef059f127c663086', { role: 'admin', title: 'Administrator & Roster Master' }],
    ['0be7c6090e15bd02bcffb5fa24cb186b409db8260b7804e178f28d4e0516c3c0', { role: 'viewer', title: 'Head of Service' }],
    ['e86fa68e88d1fe353a3c5ffd6e6d29a7c4d53efd5d3f3b39b0ce376918b007f0', { role: 'staff', title: 'Clinical Exercise Physiologist' }],
    ['d74d5435a7315bddcf84052eb6ae155c98ade788c08545c0b1882d9843a5be27', { role: 'staff', title: 'Clinical Exercise Physiologist' }],
    ['5da912b177d2c867c60edc20329f2b21dd835744f120901950ebb68ca2fbc11f', { role: 'staff', title: 'Clinical Exercise Physiologist' }],
    ['02ef7676e4e1d09df471bfb0723d4ba9cf21cf3bc0a67487a4914867930cd55a', { role: 'staff', title: 'Clinical Exercise Physiologist' }],
]);

/**
 * The bridge profile for an email, or `null`.
 *
 * Same contract as the old `checkAccess` at both call sites — truthy means
 * "legacy member, wave through" — minus the fields nothing should have shipped:
 * no `name`, no `email`, no legacy `id`. `App.jsx` spreads the caller's
 * `users/{uid}` document over this, so a real display name still wins wherever
 * one exists.
 */
export const checkAccess = (email) => {
    if (typeof email !== 'string' || email === '') return null;
    const found = LEGACY_MEMBERS.get(sha256Hex(BRIDGE_SALT + email.trim().toLowerCase()));
    return found ? { ...found, legacyBridge: true } : null;
};

/**
 * The two legacy administrators, by the same recognition. Replaces the
 * `ADMIN_EMAILS` array in `App.jsx`, which was the same two addresses in
 * plaintext — the SEVENTH hardcoded copy of team #1's identity, found while
 * removing the sixth.
 */
export const isLegacyAdminEmail = (email) => {
    const found = checkAccess(email);
    return !!found && found.role === 'admin';
};

/** Exposed for the regeneration script and the tests; not for callers. */
export const _internals = { BRIDGE_SALT, LEGACY_MEMBERS };
