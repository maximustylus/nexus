'use strict';

/**
 * ==============================================================================
 * COMMUNITY INSIGHTS — aggregation, and the suppression that makes it publishable
 * ==============================================================================
 *
 * The portal has been writing an assessment for every member of the public who
 * completes it, and NOTHING has ever read one. A Regional Health System reviewer
 * put the cost plainly: "you are already collecting the data and reading none of
 * it… that is what justifies my budget line". `CD5` settled it — the data stays,
 * with a 24-month life, and this is what makes keeping it defensible.
 *
 * ── ⚠️ WHY THIS AGGREGATES SERVER-SIDE INSTEAD OF OPENING THE COLLECTION ─────
 *
 * The obvious build is to let staff query `community_assessments`. It is also the
 * defect this project already fixed: `CP5` found `allow read: if isSignedIn()` on
 * that collection — every signed-in staff member could read the public's health
 * records — and closed it to `if false`. A dashboard that reopens it undoes that
 * for the sake of a chart.
 *
 * So the row-level records stay unreadable by every client, for ever. This runs on
 * the Admin SDK, counts, and writes COUNTS ONLY to `community_insights`. Nothing
 * downstream can reconstruct a respondent, because nothing downstream ever sees
 * one.
 *
 * ── ⚠️ SMALL-CELL SUPPRESSION IS NOT OPTIONAL ───────────────────────────────
 *
 * "De-identified" and "not identifying" are different claims, and small areas are
 * where they come apart. A postal sector with three respondents, one of whom
 * reported food insecurity and is 60+ and Malay, is identifiable to anybody who
 * knows the neighbourhood — no name required. This is the standard failure of
 * small-area health statistics and it is why every serious publication suppresses.
 *
 * Two levels, both applied here:
 *
 *   PRIMARY   a sector with fewer than `MIN_CELL` respondents is not published at
 *             all. Its records still count toward its region and the national
 *             total, so nothing is lost for planning — only the ability to point
 *             at a small group of neighbours.
 *   SECONDARY inside a published sector, a domain count below `MIN_COUNT` is
 *             reported as a band (`'<5'`) rather than an exact figure, because
 *             "1 person in this sector reported food insecurity" is the same
 *             disclosure in a longer sentence.
 *
 * Suppression is REPORTED, not silent: `suppressedSectors` and `suppressedTotal`
 * say how much was withheld, so a reader can tell a quiet sector from a missing
 * one — and so nobody mistakes a suppressed map for a map of zero need.
 */

/**
 * A sector needs this many respondents before it is published on its own.
 *
 * ⚠️ Ten is a deliberate choice, not a placeholder. It is the common threshold for
 *    small-area health statistics, and Singapore's postal sectors are small: a
 *    sector can be a handful of blocks. Lowering it is a disclosure decision, not
 *    a tuning knob, and it belongs to whoever signs off the privacy notice.
 */
const MIN_CELL = 10;

/** Inside a published sector, counts below this are banded rather than exact. */
const MIN_COUNT = 5;

/** How a banded count is written. Never a number, so it cannot be read as one. */
const BAND = `<${MIN_COUNT}`;

/**
 * The domains counted. Each is a predicate over one stored record, so adding a
 * domain is one entry here rather than a change in three places.
 *
 * ⚠️ EVERY PREDICATE IS EXPLICITLY `=== true` OR AN EXPLICIT COMPARISON. A missing
 *    flag is NOT a false one — `healthierSgEnrolled` is `null` for "not sure" AND
 *    for "not asked", and counting either as "not enrolled" would inflate exactly
 *    the figure a health system would act on.
 */
const DOMAINS = Object.freeze({
    exertionalSymptoms: (f) => f.symptomFlag === true,
    chronicCondition:   (f) => f.medFlag === true,
    /**
     * ⚠️ `Number(null)` IS `0`, AND `0 < 150`. An earlier version of this predicate
     *    used `Number.isFinite(Number(f.pavsScore))`, which passes for `null`,
     *    `undefined` and `''` — so every respondent with no activity figure was
     *    counted as below target, doubling the number in a test that caught it.
     *
     *    Note this is DELIBERATELY the opposite of `calculateRiskScore`, where an
     *    unknown activity figure counts AS a deficit (`CP2`). That is right for one
     *    person: erring toward caution costs them a nudge they may not need. It is
     *    wrong for a population statistic, where it invents need that nobody
     *    reported and inflates exactly the figure a health system would act on.
     */
    belowActivityTarget: (f) => {
        const raw = f && f.pavsScore;
        if (raw === null || raw === undefined || raw === '') return false;
        const value = Number(raw);
        return Number.isFinite(value) && value < 150;
    },
    psychologicalDistress: (f) => f.sdohPsychological === true || f.psychoFlag === true,
    caregiverStrain:    (f) => f.caregiverStrain === true,
    socialIsolation:    (f) => f.sdohSocial === true,
    financialBarrier:   (f) => f.sdohFinancial === true,
    foodInsecurity:     (f) => f.sdohFoodInsecure === true,
    housingRisk:        (f) => f.sdohHousing === true,
    fallsRisk:          (f) => f.fallsRisk === true,
    // Only a stated "no" counts. `null` means the portal does not know.
    notEnrolledHealthierSg: (f) => f.healthierSgEnrolled === false,
});

/** `YYYY-MM` for a record, or `null` when it has no usable timestamp. */
const periodOf = (record) => {
    const raw = record && record.createdAt;
    let created = null;
    if (raw && typeof raw.toDate === 'function') created = raw.toDate();
    else if (raw instanceof Date) created = raw;
    else if (typeof raw === 'number') created = new Date(raw);
    if (!created || Number.isNaN(created.getTime())) return null;
    return `${created.getUTCFullYear()}-${String(created.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** The flags object, whichever shape the pathway stored it under. */
const flagsOf = (record) => (record && (record.flags || record.payload)) || {};

/**
 * Whether a document in `community_assessments` is an ASSESSMENT at all.
 *
 * ⚠️ THIS IS THE `CP23` FIX, AND IT IS NOT A TIDY-UP. That collection holds two
 *    unrelated kinds of document, because `recordTelemetry` is the portal's only
 *    write and everything goes through it:
 *
 *      · ONE completed screening — `flags` from the form, `payload` from the chat.
 *      · A ROW PER INTERACTION — `print_handover_slip`, `download_pdf`,
 *        `share_result`, and one `click_<id>` for every resource tapped
 *        (`ResultPage.jsx`). These carry a sector and an action and NO flags.
 *
 *    The rollup counted both. `flagsOf` returned `{}` for an interaction row, so it
 *    contributed nothing to any domain, but `tallyInto` still counted a respondent.
 *
 *    Measured before the fix: twelve respondents who ALL reported need became 96
 *    "respondents", and every domain rate fell from 100% to 13%. A health system
 *    planning from that would conclude the need was not there.
 *
 *    And it broke the privacy control in the other direction. `MIN_CELL` exists to
 *    guarantee ten respondents before a sector is published; one person's own
 *    assessment plus eleven of their own clicks cleared it, publishing a sector
 *    that described a single individual.
 *
 *    Filtering here rather than in the query is deliberate: Firestore cannot cheaply
 *    ask "has a `flags` field", the rollup is the only reader, and a filter in the
 *    aggregator protects every future caller including a manual one.
 */
const isAssessment = (record) => {
    const flags = record && (record.flags || record.payload);
    // ⚠️ PRESENCE, NOT CONTENT. An earlier draft also required the object to be
    //    non-empty, which reads as extra safety and is not: a respondent who
    //    reported nothing is a respondent, and their zero belongs in the
    //    denominator. What separates the two kinds of document is that an
    //    interaction row has no `flags` and no `payload` AT ALL.
    return !!flags && typeof flags === 'object' && !Array.isArray(flags);
};

const emptyTally = () => {
    const domains = {};
    Object.keys(DOMAINS).forEach((key) => { domains[key] = 0; });
    return { respondents: 0, domains };
};

const tallyInto = (bucket, flags) => {
    bucket.respondents += 1;
    Object.entries(DOMAINS).forEach(([key, predicate]) => {
        let hit = false;
        try { hit = predicate(flags) === true; } catch { hit = false; }
        if (hit) bucket.domains[key] += 1;
    });
};

/** Applies secondary suppression to a tally's domain counts. */
const bandCounts = (domains) => {
    const out = {};
    Object.entries(domains).forEach(([key, n]) => {
        out[key] = (n > 0 && n < MIN_COUNT) ? BAND : n;
    });
    return out;
};

/**
 * Turns raw records into a publishable rollup.
 *
 * @param {Array<object>} records          raw `community_assessments` documents
 * @param {(sector: string) => string|null} regionFor  sector → region, injected so
 *   this module needs no import from `src/` — `functions/` is a separate package
 *   with its own dependency tree.
 * @returns {object} counts only; no field can identify a respondent
 */
const buildInsights = (records, regionFor) => {
    const bySector = new Map();
    const byRegion = new Map();
    const byPeriod = new Map();
    const national = emptyTally();
    let undated = 0;
    let unlocated = 0;

    // ⚠️ ASSESSMENTS ONLY — see `isAssessment`. The count of what was skipped is
    //    reported in `quality`, because a rollup that quietly drops most of what it
    //    read is indistinguishable from a quiet month.
    const all = records || [];
    const assessments = all.filter(isAssessment);
    const nonAssessments = all.length - assessments.length;

    assessments.forEach((record) => {
        const flags = flagsOf(record);
        const sector = typeof record?.postalSector === 'string' ? record.postalSector : null;
        const region = sector ? regionFor(sector) : null;
        const period = periodOf(record);

        tallyInto(national, flags);

        if (!period) undated += 1;
        else {
            if (!byPeriod.has(period)) byPeriod.set(period, emptyTally());
            tallyInto(byPeriod.get(period), flags);
        }

        // ⚠️ An unknown sector still counts nationally. Dropping it would make the
        //    national total disagree with the sum of the regions and quietly
        //    understate need — the people least able to give a postal code are not
        //    a rounding error.
        if (!region) { unlocated += 1; return; }

        if (!byRegion.has(region)) byRegion.set(region, emptyTally());
        tallyInto(byRegion.get(region), flags);

        if (!bySector.has(sector)) bySector.set(sector, emptyTally());
        tallyInto(bySector.get(sector), flags);
    });

    /**
     * PRIMARY SUPPRESSION, APPLIED TO EVERY BREAKDOWN — the `CP25` fix.
     *
     * ⚠️ THIS USED TO BE SECTORS ONLY, AND THE BAND IS NOT A BAND AT A LOW
     *    DENOMINATOR. `regions` and `periods` published `respondents` raw and banded
     *    their domains at `MIN_COUNT`. `bandCounts` maps 0 to `0` and 1–4 to `'<5'`,
     *    so in a cell with ONE respondent a domain reading `'<5'` can only mean 1 —
     *    and a domain reading `0` can only mean no. Measured: one respondent in the
     *    North in November 2026 published EIGHT domains reading `'<5'`, which is that
     *    person's complete flag profile, located to a region and a month.
     *
     *    Regions felt coarse enough to leave alone. They are not: there are five of
     *    them, and in the weeks after launch — exactly when this page gets shown —
     *    a region can hold a handful of people. A disclosure control that only holds
     *    once the tool is popular is not a disclosure control.
     *
     *    So the rule is now uniform and stated once: NO BREAKDOWN CELL IS PUBLISHED
     *    BELOW `MIN_CELL` RESPONDENTS. Their people are still counted in the national
     *    total, so nothing is lost for planning — only the ability to point at a
     *    small group of people.
     */
    const publish = (tally) => (tally.respondents < MIN_CELL
        ? null
        : { respondents: tally.respondents, domains: bandCounts(tally.domains) });

    const partition = (map) => {
        const published = {};
        const withheld = [];
        let withheldRespondents = 0;
        [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([key, tally]) => {
            const row = publish(tally);
            if (row) published[key] = row;
            else { withheld.push(key); withheldRespondents += tally.respondents; }
        });
        return { published, withheld, withheldRespondents };
    };

    const sectorSplit = partition(bySector);
    const regionSplit = partition(byRegion);
    const periodSplit = partition(byPeriod);

    const sectors = sectorSplit.published;
    const regions = regionSplit.published;
    const periods = periodSplit.published;
    const suppressedSectors = sectorSplit.withheld;
    const suppressedTotal = sectorSplit.withheldRespondents;

    return {
        /**
         * ⚠️ THE NATIONAL RESPONDENT COUNT IS ALWAYS PUBLISHED; ITS DOMAIN
         *    BREAKDOWN IS NOT. "How many people have used this" locates nobody —
         *    the area is the whole country. "…and this is what they reported",
         *    from a national total of one, is the same disclosure as any other
         *    single-person cell.
         */
        national: {
            respondents: national.respondents,
            domains: national.respondents < MIN_CELL ? null : bandCounts(national.domains),
        },
        regions,
        sectors,
        periods,
        /**
         * ⚠️ SUPPRESSION IS REPORTED. A reader must be able to tell a sector with
         *    little need from a sector held back for disclosure control — otherwise
         *    a suppressed map reads as a map of zero need, and planning follows the
         *    gaps in the data rather than the gaps in provision.
         */
        suppression: {
            minCell: MIN_CELL,
            minCount: MIN_COUNT,
            band: BAND,
            suppressedSectors,
            suppressedSectorCount: suppressedSectors.length,
            suppressedRespondents: suppressedTotal,
            // The same floor now applies to the coarser breakdowns; reported for the
            // same reason, so a short table reads as withheld rather than as absent.
            suppressedRegions: regionSplit.withheld,
            suppressedPeriods: periodSplit.withheld,
            nationalDomainsWithheld: national.respondents < MIN_CELL,
        },
        quality: {
            undatedRecords: undated,
            unlocatedRecords: unlocated,
            /**
             * ⚠️ Interaction rows — downloads, shares, prints, resource taps — live in
             *    the same collection and are NOT respondents. Reported so the figure
             *    can be reconciled against `recordsRead` rather than looking like
             *    records that went missing.
             */
            nonAssessmentRecords: nonAssessments,
            assessmentRecords: assessments.length,
        },
        domainKeys: Object.keys(DOMAINS),
    };
};

module.exports = { MIN_CELL, MIN_COUNT, BAND, DOMAINS, periodOf, flagsOf, isAssessment, buildInsights };
