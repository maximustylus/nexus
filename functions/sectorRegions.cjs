'use strict';

/**
 * ==============================================================================
 * SECTOR → REGION, for the functions package
 * ==============================================================================
 *
 * ⚠️ THIS IS A COPY, AND A TEST ASSERTS IT STAYS ONE.
 *
 * The authoritative table is `src/utils/singapore/postalSectors.js`. `functions/`
 * is a separate CommonJS package with its own dependency tree, deployed
 * separately, and cannot import from the client bundle — so the mapping the
 * scheduled aggregation needs has to exist here too.
 *
 * A hand-maintained second copy of a table is how a region silently stops matching
 * (`CP19` was a whole class of that). This file is GENERATED from the client table,
 * and `functions/insights.test.js` fails if the two ever disagree on any of the 81
 * sectors — so drift is caught in `npm test` rather than in a dashboard that
 * quietly files Jurong under the north.
 */

const SECTOR_REGIONS = Object.freeze({
    '01': 'central',
    '02': 'central',
    '03': 'central',
    '04': 'central',
    '05': 'central',
    '06': 'central',
    '07': 'central',
    '08': 'central',
    '09': 'central',
    '10': 'central',
    '11': 'central',
    '12': 'central',
    '13': 'central',
    '14': 'central',
    '15': 'central',
    '16': 'central',
    '17': 'central',
    '18': 'central',
    '19': 'central',
    '20': 'central',
    '21': 'central',
    '22': 'central',
    '23': 'central',
    '24': 'central',
    '25': 'central',
    '26': 'central',
    '27': 'central',
    '28': 'central',
    '29': 'central',
    '30': 'central',
    '31': 'central',
    '32': 'central',
    '33': 'central',
    '34': 'central',
    '35': 'central',
    '36': 'central',
    '37': 'central',
    '38': 'east',
    '39': 'east',
    '40': 'east',
    '41': 'east',
    '42': 'east',
    '43': 'east',
    '44': 'east',
    '45': 'east',
    '46': 'east',
    '47': 'east',
    '48': 'east',
    '49': 'east',
    '50': 'east',
    '51': 'east',
    '52': 'east',
    '53': 'north-east',
    '54': 'north-east',
    '55': 'north-east',
    '56': 'central',
    '57': 'central',
    '58': 'west',
    '59': 'west',
    '60': 'west',
    '61': 'west',
    '62': 'west',
    '63': 'west',
    '64': 'west',
    '65': 'west',
    '66': 'west',
    '67': 'west',
    '68': 'west',
    '69': 'west',
    '70': 'west',
    '71': 'west',
    '72': 'north',
    '73': 'north',
    '75': 'north',
    '76': 'north',
    '77': 'north',
    '78': 'north',
    '79': 'north-east',
    '80': 'north-east',
    '81': 'east',
    '82': 'north-east'
});

/** The region for a sector, or `null` when it is not one of the 81 live sectors. */
const regionForSector = (sector) =>
    Object.prototype.hasOwnProperty.call(SECTOR_REGIONS, sector) ? SECTOR_REGIONS[sector] : null;

module.exports = { SECTOR_REGIONS, regionForSector };
