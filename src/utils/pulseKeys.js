/**
 * ==============================================================================
 * PULSE-BOARD KEY RESOLUTION — the reader and the writers must agree (`AU12`)
 * ==============================================================================
 *
 * The daily pulse document is keyed by uid; entries written before 2026-08-24
 * are keyed by display name, and each save migrates its own person. The subtle
 * part is CASE: the first cut let the reader and the writer disagree about it —
 * the reader found a legacy key case-insensitively, the writer deleted only the
 * exact-case key, so the one scenario the tolerant read existed for (a display
 * name whose casing changed since the entry was written) was the one the
 * migration failed to clean up. The person was then counted twice: once under
 * their uid, once under the stale name key `calculateStats` still sees.
 *
 * One module, used by both sides, so the set the reader falls back to IS the
 * set the writer deletes.
 */

/**
 * Every key in the pulse map that is a legacy name entry for this person:
 * case-insensitive match on the display name, excluding the uid key itself.
 * Ordered as Firestore returned them; the READER uses the first, the WRITERS
 * delete them all.
 */
export const legacyPulseKeys = (pulseData, name, uid) => {
    if (!pulseData || typeof name !== 'string' || name === '') return [];
    const wanted = name.toLowerCase();
    return Object.keys(pulseData).filter(
        (k) => k !== uid && k.toLowerCase() === wanted,
    );
};

/** The entry to display: the uid key, else the first legacy name entry. */
export const resolvePulseEntry = (pulseData, person) => {
    if (!pulseData) return undefined;
    if (pulseData[person.uid] !== undefined) return pulseData[person.uid];
    const legacy = legacyPulseKeys(pulseData, person.name, person.uid);
    return legacy.length > 0 ? pulseData[legacy[0]] : undefined;
};
