'use strict';

/**
 * ==============================================================================
 * EMAIL NEAR-MATCHING — "they must register" is often wrong
 * ==============================================================================
 *
 * The migration resolves each clinician by an EXACT email lookup. When that
 * misses, the only thing it could say was *"NO AUTH ACCOUNT — they must register
 * once"*. On the owner's first real dry run that fired for three of seven people,
 * including two who plainly use the system: `staff_loads/brandon`,
 * `cep_team/brandon` and `archive_2025/brandon` all exist.
 *
 * A person with a year of clinical records is not a person who never signed in.
 * The far likelier explanation is that **the manifest's address is not the address
 * they registered with** — and telling a lead to go and ask four colleagues to
 * re-register, when the real fix is a typo in a constant, is the same failure as
 * reporting a missing key file as seven missing clinicians.
 *
 * So when an exact lookup misses, this offers candidates from the accounts that
 * actually exist, and the operator decides. It never picks one:
 *
 * ⚠️ A SUGGESTION IS NOT A MATCH, AND THIS MODULE MUST NEVER RESOLVE ONE
 *    AUTOMATICALLY. Choosing an account on a clinician's behalf files their
 *    wellbeing history — the most sensitive collection in the project — under
 *    whoever the heuristic liked. Two colleagues can easily share a surname and a
 *    first initial. The output is a question for a human, printed and then
 *    dropped.
 *
 * ── WHY THESE COMPARISONS ────────────────────────────────────────────────────
 *
 * `canonical` strips dots and everything else that is not a letter or a digit
 * from the local part. That is deliberately aggressive and it is aimed at one
 * observed case: the manifest holds `benny.loo.k.g.@singhealth.com.sg`, whose
 * trailing dot makes it invalid under RFC 5321, so the account almost certainly
 * exists as `benny.loo.k.g@…`. Both canonicalise to `bennylookg`, which is an
 * EXACT canonical match and by far the strongest signal available.
 *
 * Prefix matching catches the other observed shape: a manifest address carrying
 * an extra initial the person did not register with — `brandon.feng.gg@…`
 * against an account at `brandon.feng@…`.
 */

/** Local part, letters and digits only. `Benny.Loo.K.G.@x` → `bennylookg`. */
const canonical = (email) => String(email || '').toLowerCase().split('@')[0].replace(/[^a-z0-9]/g, '');

/** Domain, lower-cased, or '' when there is not one. */
const domainOf = (email) => {
    const parts = String(email || '').toLowerCase().split('@');
    return parts.length > 1 ? parts[parts.length - 1] : '';
};

/**
 * Candidates for one address that had no exact account, strongest first.
 *
 * @param {string} wanted           the address in the manifest
 * @param {string[]} existingEmails every address that has a Firebase Auth account
 * @returns {Array<{email: string, why: string, strength: 'exact-canonical'|'prefix'|'contains'}>}
 */
const suggestMatches = (wanted, existingEmails) => {
    const wantKey = canonical(wanted);
    if (wantKey === '') return [];
    const wantDomain = domainOf(wanted);

    const seen = new Set();
    const out = [];
    const add = (email, strength, why) => {
        const lower = String(email).toLowerCase();
        if (lower === String(wanted).toLowerCase() || seen.has(lower)) return;
        seen.add(lower);
        out.push({ email, strength, why });
    };

    for (const candidate of existingEmails || []) {
        const key = canonical(candidate);
        if (key === '') continue;

        if (key === wantKey) {
            // The trailing-dot case, and the strongest signal there is: the two
            // addresses differ only in punctuation.
            const sameDomain = domainOf(candidate) === wantDomain;
            add(candidate, 'exact-canonical',
                sameDomain
                    ? 'identical once punctuation is ignored — almost certainly the same person'
                    : 'identical local part once punctuation is ignored, but a DIFFERENT domain — check this one');
        } else if (key.startsWith(wantKey) || wantKey.startsWith(key)) {
            add(candidate, 'prefix', 'one address is the other plus extra characters — often a missing or extra initial');
        } else if (key.length >= 6 && (key.includes(wantKey) || wantKey.includes(key))) {
            add(candidate, 'contains', 'one local part contains the other — weaker, confirm before using');
        }
    }

    const rank = { 'exact-canonical': 0, prefix: 1, contains: 2 };
    return out.sort((a, b) => rank[a.strength] - rank[b.strength] || a.email.localeCompare(b.email));
};

/** The lines to print under an unresolved member. Empty when there is nothing to offer. */
const suggestionReport = (member, suggestions) => {
    if (suggestions.length === 0) return [];
    const lines = [`   Accounts that look like ${member.displayName}, strongest first — NONE was used:`];
    suggestions.slice(0, 4).forEach((s) => lines.push(`     · ${s.email}  (${s.why})`));
    lines.push('     If one of these is them, fix the address in scripts/team-one-manifest.cjs');
    lines.push('     and re-run. Do not guess — filing a wellbeing history under the wrong');
    lines.push('     colleague is exactly what this refuses to do for you.');
    return lines;
};

module.exports = { canonical, domainOf, suggestMatches, suggestionReport };
