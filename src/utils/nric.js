/**
 * ==============================================================================
 * NRIC/FIN SHAPE SCREEN — `AN13`, and the deterministic half of `AN12`
 * ==============================================================================
 *
 * Feed POSTS pass through `processFeedPost`'s model-based PDPA guard; feed
 * COMMENTS were written straight to Firestore with no screen at all, and the
 * public screening's free-text answers had only the model. `AN12` asks the owner
 * whether a model classification is an acceptable PDPA *guard* — that question
 * stays open — but whatever the answer, a deterministic check for the single
 * highest-signal identifier in Singapore belongs IN FRONT of any model: it is
 * free, instant, and cannot have an off day.
 *
 * ⚠️ SHAPE, NOT CHECKSUM, AND THAT IS A CHOICE WITH A REASON. The NRIC checksum
 *    would cut false positives, but this screen is mirrored in `firestore.rules`
 *    (`.matches()` on the comment text), and rules cannot compute a checksum —
 *    so a checksum here would make the client stricter than the fence behind
 *    it, and the difference would be a bypass. Both layers test the same shape:
 *    S/T/F/G/M, seven digits, a letter. A nine-character token of that shape in
 *    a staff comment is an NRIC/FIN often enough that refusing it with a
 *    sentence costs a false positive almost never, and asking someone to rewrite
 *    "S1234567D" as "ending 567D" is exactly what the guard is FOR.
 *
 * ⚠️ THIS IS NOT PDPA COMPLIANCE and must not be described as such. It catches
 *    one identifier class, verbatim. Names, MRNs, ward-and-bed, dates of birth
 *    all sail past it. It shrinks the hole; it does not close it.
 */

/**
 * A word-ish boundary either side so `NS1234567X` (an ops code) does not match,
 * but punctuation-wrapped ids (`(S1234567D)`, `S1234567D.`) do. RE2-safe: the
 * same pattern, minus the lookarounds Firestore rules cannot express, lives in
 * `firestore.rules` — keep them aligned when editing either.
 */
export const NRIC_SHAPE = /(?<![A-Za-z0-9])[STFGMstfgm]\d{7}[A-Za-z](?![A-Za-z0-9])/;

/** True when the text contains something shaped like an NRIC/FIN. */
export const containsNric = (text) => typeof text === 'string' && NRIC_SHAPE.test(text);

/** The sentence shown instead of posting. Names the fix, not just the refusal. */
export const NRIC_REFUSAL =
    'This looks like it contains an NRIC/FIN, which must not go on the feed. '
    + 'Please remove or shorten it (e.g. "ending 567D") and post again.';
