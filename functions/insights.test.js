/**
 * ==============================================================================
 * COMMUNITY INSIGHTS — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * This turns health records about members of the public into a page a health
 * system plans from. The tests that matter are not about arithmetic — they are
 * about what the rollup refuses to say.
 */

import { describe, it, expect } from 'vitest';
import insights from './insights.cjs';
import sectorRegions from './sectorRegions.cjs';

const { MIN_CELL, MIN_COUNT, BAND, buildInsights, periodOf } = insights;
const { SECTOR_REGIONS, regionForSector } = sectorRegions;

const rec = (sector, flags = {}, iso = '2026-08-01T00:00:00Z') =>
    ({ postalSector: sector, createdAt: new Date(iso), flags });
/** n records in one sector, the first `hits` of them carrying `flag`. */
const many = (sector, n, flag, hits = 0) =>
    Array.from({ length: n }, (_, i) => rec(sector, flag ? { [flag]: i < hits } : {}));

const build = (records) => buildInsights(records, regionForSector);

describe('⚠️ small-cell suppression — the property that makes this publishable', () => {
    /**
     * THE LOAD-BEARING TEST. Singapore's postal sectors can be a handful of blocks.
     * A sector with three respondents, one of whom reported food insecurity, is
     * identifiable to anybody who knows the neighbourhood — no name required.
     * "De-identified" and "not identifying" are different claims and this is where
     * they come apart.
     */
    it(`withholds a sector with fewer than ${MIN_CELL} respondents`, () => {
        const out = build([...many('73', MIN_CELL - 1)]);
        expect(out.sectors['73']).toBeUndefined();
        expect(out.suppression.suppressedSectors).toContain('73');
    });

    it(`publishes a sector at exactly ${MIN_CELL}`, () => {
        const out = build(many('73', MIN_CELL));
        expect(out.sectors['73'].respondents).toBe(MIN_CELL);
    });

    /**
     * ⚠️ SUPPRESSED PEOPLE ARE STILL COUNTED. Dropping them would make a suppressed
     *    map read as a map of zero need, and the national total disagree with the
     *    sum of its parts. Planning would then follow the gaps in the data rather
     *    than the gaps in provision.
     */
    it('still counts a suppressed sector in its region and nationally', () => {
        const out = build([...many('73', MIN_CELL), ...many('75', 2)]);
        expect(out.sectors['75']).toBeUndefined();
        expect(out.national.respondents).toBe(MIN_CELL + 2);
        expect(out.regions.north.respondents).toBe(MIN_CELL + 2);
    });

    it('reports how much was withheld, so a quiet sector is not read as a missing one', () => {
        const out = build([...many('73', MIN_CELL), ...many('75', 3), ...many('76', 2)]);
        expect(out.suppression.suppressedSectorCount).toBe(2);
        expect(out.suppression.suppressedRespondents).toBe(5);
        expect(out.suppression.minCell).toBe(MIN_CELL);
    });

    /**
     * Secondary suppression. "1 person in this sector reported food insecurity" is
     * the same disclosure as naming them, in a longer sentence.
     */
    it(`bands a domain count below ${MIN_COUNT} rather than printing it`, () => {
        const out = build(many('73', 20, 'sdohFoodInsecure', 2));
        expect(out.sectors['73'].domains.foodInsecurity).toBe(BAND);
        expect(out.sectors['73'].domains.foodInsecurity).not.toBe(2);
    });

    it('prints an exact count at or above the band threshold', () => {
        const out = build(many('73', 20, 'sdohFoodInsecure', MIN_COUNT));
        expect(out.sectors['73'].domains.foodInsecurity).toBe(MIN_COUNT);
    });

    it('reports a true zero as zero, not as a band', () => {
        const out = build(many('73', 20, 'sdohFoodInsecure', 0));
        expect(out.sectors['73'].domains.foodInsecurity).toBe(0);
    });

    /**
     * The band must never be parseable as a number — a consumer doing
     * `Number(value)` on it should get NaN rather than a plausible figure.
     */
    it('bands as a string that cannot be mistaken for a count', () => {
        expect(typeof BAND).toBe('string');
        expect(Number.isNaN(Number(BAND))).toBe(true);
    });
});

describe('⚠️ a missing flag is never a false one', () => {
    /**
     * `healthierSgEnrolled` is null for "not sure" AND for "not asked". Counting
     * either as "not enrolled" would inflate exactly the figure a health system
     * would act on — and the falls flag has the same shape for under-60s.
     */
    it('counts only a stated "not enrolled"', () => {
        const out = build([
            ...Array.from({ length: 5 }, () => rec('73', { healthierSgEnrolled: false })),
            ...Array.from({ length: 5 }, () => rec('73', { healthierSgEnrolled: null })),
            ...Array.from({ length: 5 }, () => rec('73', {})),
        ]);
        expect(out.sectors['73'].domains.notEnrolledHealthierSg).toBe(5);
    });

    it('does not count an unasked falls question as a fall', () => {
        const out = build(Array.from({ length: 12 }, () => rec('73', { fallsAsked: false })));
        expect(out.sectors['73'].domains.fallsRisk).toBe(0);
    });

    it('counts below-target activity only when there is a figure', () => {
        const out = build([
            ...Array.from({ length: 6 }, () => rec('73', { pavsScore: 100 })),
            ...Array.from({ length: 6 }, () => rec('73', { pavsScore: null })),
        ]);
        expect(out.sectors['73'].domains.belowActivityTarget).toBe(6);
    });

    it('does not throw when a predicate meets junk', () => {
        expect(() => build([rec('73', null), rec('73', 'nonsense'), rec('73', 42)])).not.toThrow();
    });
});

describe('⚠️ the floor applies to EVERY breakdown, not only sectors — CP25', () => {
    /**
     * THE BAND IS NOT A BAND AT A LOW DENOMINATOR, AND THAT IS THE WHOLE POINT.
     * `bandCounts` maps 0 to `0` and 1–4 to `'<5'`. In a cell with one respondent,
     * `'<5'` can only mean 1 and `0` can only mean no — so the "banded" row is that
     * person's complete flag profile, published beside the region and month they
     * were in. Regions were left unsuppressed because five areas felt coarse; in the
     * weeks after launch, which is when this page gets shown, a region holds a
     * handful of people.
     */
    it('withholds a region below the floor, and says so', () => {
        const out = build([rec('73', { sdohFoodInsecure: true })]);
        expect(out.regions.north).toBeUndefined();
        expect(out.suppression.suppressedRegions).toContain('north');
    });

    it('withholds a month below the floor, and says so', () => {
        const out = build([rec('73', {}, '2026-07-15T00:00:00Z')]);
        expect(out.periods['2026-07']).toBeUndefined();
        expect(out.suppression.suppressedPeriods).toContain('2026-07');
    });

    it('publishes a region at exactly the floor', () => {
        const out = build(many('73', MIN_CELL));
        expect(out.regions.north.respondents).toBe(MIN_CELL);
        expect(out.suppression.suppressedRegions).not.toContain('north');
    });

    /**
     * "How many people have used this" locates nobody — the area is the country.
     * "…and this is what they reported", from a national total of one, is the same
     * disclosure as any other single-person cell.
     */
    it('keeps the national headcount but withholds its breakdown below the floor', () => {
        const out = build([rec('73', { sdohFoodInsecure: true, symptomFlag: true })]);
        expect(out.national.respondents).toBe(1);
        expect(out.national.domains).toBeNull();
        expect(out.suppression.nationalDomainsWithheld).toBe(true);
    });

    it('publishes the national breakdown once the floor is cleared', () => {
        const out = build(many('73', MIN_CELL, 'sdohFoodInsecure', MIN_CELL));
        expect(out.national.domains.foodInsecurity).toBe(MIN_CELL);
        expect(out.suppression.nationalDomainsWithheld).toBe(false);
    });

    /** No cell anywhere in the document may carry a count below MIN_COUNT. */
    it('leaves no readable count under the band anywhere in the output', () => {
        const out = build([
            ...many('73', MIN_CELL + 2, 'sdohFoodInsecure', 2),
            ...many('18', 3, 'symptomFlag', 1),
            rec('46', { fallsRisk: true }, '2026-01-02T00:00:00Z'),
        ]);
        const small = [];
        const walk = (node, path) => {
            if (node === null || node === undefined) return;
            if (typeof node === 'number') {
                if (Number.isInteger(node) && node > 0 && node < MIN_COUNT) small.push(`${path}=${node}`);
                return;
            }
            if (Array.isArray(node)) return;                       // lists of withheld keys
            if (typeof node === 'object') {
                Object.entries(node).forEach(([k, v]) => {
                    // `suppression` and `quality` describe the withholding itself.
                    if (path === '' && (k === 'suppression' || k === 'quality')) return;
                    walk(v, path ? `${path}.${k}` : k);
                });
            }
        };
        walk(out, '');
        expect(small, 'a count below the band leaked into a published cell').toEqual([]);
    });
});

describe('⚠️ interaction rows are not respondents — CP23', () => {
    /**
     * `community_assessments` holds two kinds of document because `recordTelemetry`
     * is the portal's only write: one completed screening, and a row per interaction
     * (`download_pdf`, `share_result`, `print_handover_slip`, one `click_<id>` per
     * resource tapped). The interaction rows carry no `flags`, so they contributed
     * nothing to any domain — and were still counted as respondents.
     */
    const interaction = (sector, action) =>
        ({ postalSector: sector, createdAt: new Date('2026-08-01T00:00:00Z'), action, score: 7 });

    it('does not count a download, a share, a print or a resource tap', () => {
        const real = many('73', MIN_CELL, 'sdohFoodInsecure', MIN_CELL);
        const noise = ['download_pdf', 'share_result', 'print_handover_slip', 'click_aac']
            .map((a) => interaction('73', a));
        const clean = build(real);
        const dirty = build([...real, ...noise]);
        expect(dirty.sectors['73']).toEqual(clean.sectors['73']);
        expect(dirty.national.respondents).toBe(MIN_CELL);
    });

    it('every domain RATE is unchanged by interaction rows', () => {
        const real = many('73', MIN_CELL, 'sdohFoodInsecure', MIN_CELL);
        const noise = Array.from({ length: 200 }, (_, i) => interaction('73', `click_${i}`));
        const dirty = build([...real, ...noise]);
        expect(dirty.sectors['73'].domains.foodInsecurity).toBe(MIN_CELL);
        expect(dirty.sectors['73'].respondents).toBe(MIN_CELL);
    });

    /**
     * THE DISCLOSURE HALF. `MIN_CELL` is supposed to guarantee ten respondents before
     * a sector is published. One person's own clicks used to clear it.
     */
    it(`one person's interaction trail cannot carry a sector past MIN_CELL`, () => {
        const trail = [
            rec('18', { sdohFoodInsecure: true, symptomFlag: true }),
            ...Array.from({ length: MIN_CELL + 5 }, (_, i) => interaction('18', `click_${i}`)),
        ];
        const out = build(trail);
        expect(out.sectors['18']).toBeUndefined();
        expect(out.suppression.suppressedSectors).toContain('18');
    });

    it('reports how many rows were not assessments, so the figures reconcile', () => {
        const out = build([...many('73', MIN_CELL), interaction('73', 'download_pdf'), interaction('73', 'click_a')]);
        expect(out.quality.assessmentRecords).toBe(MIN_CELL);
        expect(out.quality.nonAssessmentRecords).toBe(2);
    });

    it('a respondent who reported nothing is still a respondent', () => {
        // Presence of `flags`, not its content: their zero belongs in the denominator.
        const out = build(many('73', MIN_CELL));
        expect(out.sectors['73'].respondents).toBe(MIN_CELL);
    });
});

describe('records that cannot be placed', () => {
    /**
     * The people least able to give a postal code are not a rounding error. An
     * unknown sector still counts nationally, and the shortfall is reported.
     */
    it('counts an unknown sector nationally but in no region', () => {
        const out = build([...many('73', MIN_CELL), rec('--', {}), rec('74', {}), rec(null, {})]);
        expect(out.national.respondents).toBe(MIN_CELL + 3);
        expect(out.regions.north.respondents).toBe(MIN_CELL);
        expect(out.quality.unlocatedRecords).toBe(3);
    });

    it('reports undated records rather than guessing a period', () => {
        const out = build([...many('73', MIN_CELL), { postalSector: '73', flags: {} }]);
        expect(out.quality.undatedRecords).toBe(1);
    });

    it('groups by month, above the floor', () => {
        const out = build([
            ...Array.from({ length: MIN_CELL }, () => rec('73', {}, '2026-07-15T00:00:00Z')),
            ...Array.from({ length: MIN_CELL + 1 }, () => rec('73', {}, '2026-08-15T00:00:00Z')),
        ]);
        expect(out.periods['2026-07'].respondents).toBe(MIN_CELL);
        expect(out.periods['2026-08'].respondents).toBe(MIN_CELL + 1);
    });

    it('reads a Firestore Timestamp as well as a Date', () => {
        expect(periodOf({ createdAt: { toDate: () => new Date('2026-03-02T00:00:00Z') } })).toBe('2026-03');
        expect(periodOf({})).toBeNull();
    });
});

describe('⚠️ the region map must not drift from the client table', () => {
    /**
     * THE DRIFT GUARD. `functions/` is a separate CommonJS package and cannot
     * import from the client bundle, so the sector→region mapping exists twice. A
     * hand-maintained second copy of a table is precisely how `CP19` happened — a
     * dashboard that files Jurong under the north is worse than no dashboard,
     * because it is planned from.
     */
    it('agrees with src/utils/singapore/postalSectors.js on all 81 sectors', async () => {
        const { readFileSync } = await import('node:fs');
        const { fileURLToPath } = await import('node:url');
        const { dirname, resolve } = await import('node:path');
        const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
        const src = readFileSync(resolve(root, 'src/utils/singapore/postalSectors.js'), 'utf8');

        const client = {};
        for (const m of src.matchAll(/'(\d\d)': \{ district: \s*\d+, region: '([a-z-]+)'/g)) {
            client[m[1]] = m[2];
        }
        expect(Object.keys(client)).toHaveLength(81);
        expect(SECTOR_REGIONS).toEqual(client);
    });

    it('returns null for a sector that does not exist', () => {
        expect(regionForSector('74')).toBeNull();
        expect(regionForSector('--')).toBeNull();
        expect(regionForSector('99')).toBeNull();
    });
});

describe('the shape a dashboard consumes', () => {
    it('exposes the domain keys so a view need not hardcode them', () => {
        expect(build([]).domainKeys).toEqual(expect.arrayContaining([
            'exertionalSymptoms', 'foodInsecurity', 'caregiverStrain', 'fallsRisk',
        ]));
    });

    it('handles an empty collection without throwing', () => {
        const out = build([]);
        expect(out.national.respondents).toBe(0);
        expect(out.sectors).toEqual({});
        expect(out.suppression.suppressedSectorCount).toBe(0);
    });

    it('contains no field that could identify a respondent', () => {
        const out = build([...many('73', 12), rec('73', { sessionId: 'NX-ABC123XYZ' })]);
        const text = JSON.stringify(out);
        expect(text).not.toMatch(/NX-[A-Z0-9]{9}/);
        expect(text).not.toMatch(/sessionId/);
    });
});
