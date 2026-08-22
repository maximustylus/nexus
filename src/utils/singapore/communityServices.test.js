/**
 * ==============================================================================
 * COMMUNITY SERVICES — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * NEXUS was prototyped for the north. The tests below are what "the follow-up
 * works anywhere in Singapore" means as a property rather than a claim.
 */

import { describe, it, expect } from 'vitest';
import { servicesForSector, clusterForSector, SERVICE_KINDS, CLUSTERS } from './communityServices';
import { POSTAL_SECTORS } from './postalSectors';

const ALL_SECTORS = Object.keys(POSTAL_SECTORS);

describe('⚠️ every sector in Singapore is served', () => {
    /**
     * THE LOAD-BEARING TEST. If any sector returns no services, somebody living
     * there finishes the assessment and is offered nothing — the north-only
     * prototype behaviour, for whichever district was missed.
     */
    it('returns at least one service for every one of the 81 sectors', () => {
        const barren = ALL_SECTORS.filter((s) => servicesForSector(s, {}).services.length === 0);
        expect(barren, `sectors with no services: ${barren.join(', ')}`).toEqual([]);
    });

    it('locates every sector — none falls back to national-only', () => {
        const unlocated = ALL_SECTORS.filter((s) => servicesForSector(s, {}).coverage !== 'located');
        expect(unlocated, `sectors that did not resolve: ${unlocated.join(', ')}`).toEqual([]);
    });

    it('names a district and a locality for every sector', () => {
        ALL_SECTORS.forEach((sector) => {
            const { location } = servicesForSector(sector, {});
            expect(location.district, sector).toBeGreaterThanOrEqual(1);
            expect(location.locality.length, sector).toBeGreaterThan(0);
            expect(location.regionLabel, sector).toBeTruthy();
        });
    });

    it('assigns a known health cluster to every sector', () => {
        ALL_SECTORS.forEach((sector) => {
            expect(Object.keys(CLUSTERS), sector).toContain(clusterForSector(sector));
        });
    });

    /**
     * The prototype's own case must still work, and must now work the same way as
     * everywhere else rather than as a special case.
     */
    it('still serves the north it was prototyped for', () => {
        const woodlands = servicesForSector('73', { age: '60+', sdohSocial: true });
        expect(woodlands.location.locality).toContain('Woodlands');
        expect(woodlands.services.map((s) => s.id)).toContain('activeAgeing');
    });

    it('serves the west, east and north-east the same way', () => {
        [['64', 'Jurong'], ['46', 'Bedok'], ['82', 'Punggol']].forEach(([sector, place]) => {
            const r = servicesForSector(sector, { age: '60+', sdohSocial: true });
            expect(r.location.locality, sector).toContain(place);
            expect(r.services.map((s) => s.id), sector).toContain('activeAgeing');
        });
    });
});

describe('⚠️ an unknown location is not a place', () => {
    /**
     * The previous code turned anything unreadable into the string '00', which
     * then resolved through a numeric range check to one particular health
     * cluster. "I would rather not say" was recorded as a location and used to
     * pick services.
     */
    it.each([null, undefined, '', '00', '74', 'North (e.g. 73, 75)'])(
        'refuses to invent a location or a cluster for %j', (input) => {
            const r = servicesForSector(input, { age: '60+' });
            expect(r.location).toBeNull();
            expect(r.cluster).toBeNull();
            expect(r.coverage).toBe('national-only');
        });

    /**
     * But the person is not abandoned: every service kind here is national, so the
     * offer is still correct — it simply cannot be described as "near you".
     */
    it('still offers services when the location is unknown', () => {
        const r = servicesForSector(null, { age: '60+', sdohSocial: true });
        expect(r.services.length).toBeGreaterThan(0);
        expect(r.services.map((s) => s.id)).toContain('activeAgeing');
    });
});

describe('need decides which services, location decides how they are labelled', () => {
    it('routes exertional symptoms to primary care first', () => {
        const ids = servicesForSector('73', { symptomFlag: true }).services.map((s) => s.id);
        expect(ids[0]).toBe('polyclinic');
    });

    it('offers CareLine and the Silver Generation Office to an isolated senior', () => {
        const ids = servicesForSector('46', { age: '60+', sdohSocial: true }).services.map((s) => s.id);
        expect(ids).toEqual(expect.arrayContaining(['activeAgeing', 'careline', 'silverGeneration']));
    });

    it('offers a Community Club, not an Active Ageing Centre, to an isolated younger adult', () => {
        const ids = servicesForSector('46', { age: '21-40', sdohSocial: true }).services.map((s) => s.id);
        expect(ids).toContain('communityClub');
        expect(ids).not.toContain('activeAgeing');
    });

    it('adds subsidy help when cost was the barrier', () => {
        expect(servicesForSector('64', { sdohFinancial: true }).services.map((s) => s.id))
            .toContain('financialSupport');
    });

    it('adds a Social Service Office when food insecurity was reported', () => {
        expect(servicesForSector('64', { sdohFoodInsecure: true }).services.map((s) => s.id))
            .toContain('socialSupport');
    });

    it('never repeats a service', () => {
        const ids = servicesForSector('73', {
            symptomFlag: true, medFlag: true, age: '60+', sdohSocial: true,
            sdohFinancial: true, sdohFoodInsecure: true, sdohPsychological: true,
        }).services.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('gives everybody a route into activity and into primary care', () => {
        const ids = servicesForSector('56', {}).services.map((s) => s.id);
        expect(ids).toEqual(expect.arrayContaining(['activesg', 'healthierSg']));
    });
});

describe('⚠️ the module does not claim to know branch details', () => {
    /**
     * CP8 and CP16: the portal once labelled an inventory "VERIFIED" while nothing
     * checked its freshness, and the inventory people actually saw had no
     * freshness field at all. Hand-entering national branch data would repeat that
     * at scale, so every service carries an OFFICIAL FINDER instead — the source
     * that stays current — and no address, hours or phone number.
     */
    it('carries a finder URL for every service kind', () => {
        Object.values(SERVICE_KINDS).forEach((kind) => {
            expect(kind.finder, kind.id).toMatch(/^https:\/\//);
            expect(kind.finderLabel, kind.id).toBeTruthy();
        });
    });

    it('states no address, opening hours or price anywhere', () => {
        const text = JSON.stringify(SERVICE_KINDS);
        expect(text).not.toMatch(/Singapore \d{6}/);       // an address
        expect(text).not.toMatch(/\b\d{1,2}(am|pm)\b/i);   // opening hours
        expect(text).not.toMatch(/\bSGD?\s?\$?\d/);        // a price
    });

    it('marks every service kind as nationally available', () => {
        Object.values(SERVICE_KINDS).forEach((kind) => {
            expect(kind.national, kind.id).toBe(true);
        });
    });
});

describe('caregiver strain routes to carer services', () => {
    it('offers caregiver support when the carer half was chosen', () => {
        const ids = servicesForSector('73', { caregiverStrain: true }).services.map((s) => s.id);
        expect(ids).toContain('caregiverSupport');
    });

    /**
     * The two halves of the old chip must now lead somewhere different — that is
     * the entire reason for splitting it.
     */
    it('does not offer caregiver support to somebody under financial pressure', () => {
        const ids = servicesForSector('73', { sdohFinancial: true }).services.map((s) => s.id);
        expect(ids).not.toContain('caregiverSupport');
        expect(ids).toContain('financialSupport');
    });

    it('offers both when both were reported', () => {
        const ids = servicesForSector('73', { caregiverStrain: true, sdohFinancial: true })
            .services.map((s) => s.id);
        expect(ids).toEqual(expect.arrayContaining(['caregiverSupport', 'financialSupport']));
    });

    it('works in every region, not just the north', () => {
        ['64', '46', '82', '56'].forEach((sector) => {
            expect(servicesForSector(sector, { caregiverStrain: true }).services.map((s) => s.id))
                .toContain('caregiverSupport');
        });
    });
});
