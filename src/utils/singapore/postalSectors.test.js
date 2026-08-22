/**
 * ==============================================================================
 * POSTAL SECTORS — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * NEXUS was prototyped against the north. These tests are what "covers all of
 * Singapore" means as a checkable property rather than an intention.
 */

import { describe, it, expect } from 'vitest';
import {
    POSTAL_SECTORS, UNUSED_SECTORS, REGIONS, REGION_LABEL,
    toSector, isValidSector, sectorInfo, regionForSector, districtForSector, sectorsInRegion,
} from './postalSectors';

describe('national coverage', () => {
    /**
     * ⚠️ THE PROPERTY THE WHOLE MODULE EXISTS FOR. Sectors run 01–82 with 74 not
     *    in use. If a sector is missing, somebody living there is routed as
     *    "unknown" and gets no locality and no cluster — the north-only prototype
     *    behaviour, for one district instead of twenty-seven.
     */
    it('covers every sector from 01 to 82 except 74', () => {
        const missing = [];
        for (let n = 1; n <= 82; n += 1) {
            const sector = String(n).padStart(2, '0');
            if (UNUSED_SECTORS.includes(sector)) continue;
            if (!POSTAL_SECTORS[sector]) missing.push(sector);
        }
        expect(missing, `sectors with no entry: ${missing.join(', ')}`).toEqual([]);
    });

    it('has 81 live sectors and does not include 74', () => {
        expect(Object.keys(POSTAL_SECTORS)).toHaveLength(81);
        expect(POSTAL_SECTORS['74']).toBeUndefined();
        expect(isValidSector('74')).toBe(false);
    });

    it('assigns all 28 postal districts', () => {
        const districts = new Set(Object.values(POSTAL_SECTORS).map((s) => s.district));
        expect([...districts].sort((a, b) => a - b)).toEqual(
            Array.from({ length: 28 }, (_, i) => i + 1));
    });

    it('gives every sector a region NEXUS knows how to route', () => {
        Object.entries(POSTAL_SECTORS).forEach(([sector, info]) => {
            expect(REGIONS, `sector ${sector}`).toContain(info.region);
            expect(REGION_LABEL[info.region]).toBeTruthy();
        });
    });

    it('gives every sector a non-empty locality name', () => {
        Object.entries(POSTAL_SECTORS).forEach(([sector, info]) => {
            expect(info.locality.length, `sector ${sector}`).toBeGreaterThan(0);
        });
    });

    /**
     * A district must not straddle two regions — the region is derived from the
     * district, so a split would mean two people in the same district being sent
     * to different services.
     */
    it('keeps each district wholly within one region', () => {
        const regionByDistrict = new Map();
        Object.entries(POSTAL_SECTORS).forEach(([sector, info]) => {
            const seen = regionByDistrict.get(info.district);
            if (seen) expect(seen, `district ${info.district} at sector ${sector}`).toBe(info.region);
            else regionByDistrict.set(info.district, info.region);
        });
    });

    it('has every region populated — none is an empty branch', () => {
        REGIONS.forEach((region) => {
            expect(sectorsInRegion(region).length, region).toBeGreaterThan(0);
        });
    });
});

describe('toSector — what a person actually types', () => {
    it('takes two digits', () => {
        expect(toSector('73')).toBe('73');
        expect(toSector('06')).toBe('06');
    });

    it('takes a full six-digit code and keeps only the sector', () => {
        expect(toSector('730123')).toBe('73');
        expect(toSector('S730123')).toBe('73');
        expect(toSector('730 123')).toBe('73');
    });

    /**
     * ⚠️ UNKNOWN MUST STAY UNKNOWN. The previous code produced the string '00' for
     *    anything it could not read, and '00' then resolved to a health cluster as
     *    though it were a place. Every input below is a person who did not give a
     *    usable location, and every one of them must be null.
     */
    it.each([
        ['nothing', ''],
        ['null', null],
        ['undefined', undefined],
        ['one digit', '7'],
        ['the old sentinel', '00'],
        ['a sector that does not exist', '74'],
        ['out of range', '99'],
        ['words', 'I would rather not say'],
        ['a region label', 'North'],
    ])('returns null for %s', (_label, input) => {
        expect(toSector(input)).toBeNull();
        expect(sectorInfo(input)).toBeNull();
        expect(regionForSector(input)).toBeNull();
        expect(districtForSector(input)).toBeNull();
    });

    /**
     * ⚠️ THE ORIGINAL BUG, AS A REGRESSION TEST. The chat's quick-reply chips
     *    contained example digits, and the parser took the first two digits it
     *    found in whatever the person "said" — which for a tapped chip was the
     *    LABEL. Everyone tapping North was recorded as sector 73.
     */
    it('does not read a sector out of a chip label containing examples', () => {
        expect(toSector('North (e.g. 73, 75)')).toBeNull();
        expect(toSector('East (e.g. 46, 52)')).toBeNull();
        expect(toSector('West (e.g. 60, 64)')).toBeNull();
        expect(toSector('North-East (e.g. 53, 82)')).toBeNull();
    });

    it('does not throw on junk', () => {
        [{}, [], 42, Symbol.iterator ? 0 : 0].forEach((junk) => {
            expect(() => toSector(junk)).not.toThrow();
        });
    });
});

describe('sectorInfo — spot checks across the island', () => {
    it.each([
        ['73', 25, 'north',      'Woodlands'],
        ['75', 27, 'north',      'Yishun'],
        ['64', 22, 'west',       'Jurong'],
        ['68', 23, 'west',       'Choa Chu Kang'],
        ['46', 16, 'east',       'Bedok'],
        ['52', 18, 'east',       'Tampines'],
        ['82', 19, 'north-east', 'Punggol'],
        ['56', 20, 'central',    'Bishan'],
        ['01',  1, 'central',    'Raffles Place'],
    ])('sector %s is district %i, %s, near %s', (sector, district, region, locality) => {
        const info = sectorInfo(sector);
        expect(info.district).toBe(district);
        expect(info.region).toBe(region);
        expect(info.locality).toContain(locality);
    });
});
