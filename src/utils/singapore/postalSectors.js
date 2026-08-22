/**
 * ==============================================================================
 * SINGAPORE POSTAL SECTORS — the whole island, not one corner of it
 * ==============================================================================
 *
 * NEXUS was prototyped against the north. This table is every live postal sector
 * in Singapore, so the portal can route somebody in Jurong or Bedok as precisely
 * as somebody in Woodlands.
 *
 * ── WHAT A SECTOR IS ─────────────────────────────────────────────────────────
 *
 * A Singapore postal code is six digits. The FIRST TWO are the postal sector, and
 * every sector belongs to exactly one of the 28 postal districts. Sectors run
 * `01`–`82` with **`74` not in use**, giving **81 live sectors**. Asking for two
 * digits rather than six is deliberate: it locates somebody to a district for
 * service matching without collecting an address.
 *
 * ── ⚠️ THE BUG THIS TABLE EXISTS TO END ──────────────────────────────────────
 *
 * The chat asked the right question — "what are the first two digits of your
 * postal code?" — and then offered quick-reply chips that contained EXAMPLE
 * digits:
 *
 *     'North (e.g. 73, 75)'   'East (e.g. 46, 52)'
 *     'West (e.g. 60, 64)'    'North-East (e.g. 53, 82)'
 *
 * `parseClinicalData` ran `match(/\d{2}/)` over the answer, which for a tapped
 * chip is the LABEL. So every respondent who tapped North was recorded as sector
 * 73, every East as 46, every West as 60. The geographic data collected "for
 * population-level resource planning" was four constants, and it also chose which
 * health cluster's resources the person was shown.
 *
 * Separately, an unrecognised or missing answer became the string `'00'`, which is
 * not a sector at all — and the old cluster lookup mapped it, silently, to one
 * particular cluster. Unknown is now unknown: `null`, handled as such.
 *
 * ── ⚠️ WHAT THIS FILE IS AND IS NOT ──────────────────────────────────────────
 *
 * IT IS: the sector → district → locality mapping, which is stable public
 * reference data, and a five-way regional grouping used for service routing.
 *
 * IT IS NOT: a list of specific service branches. NEXUS has been burned once by
 * asserting a "VERIFIED RESOURCE INVENTORY" whose freshness nothing checked
 * (`CP8`/`CP16`). Naming two hundred centre addresses nobody has confirmed would
 * repeat that at national scale, so `communityServices.js` routes to the official
 * finders instead, with the person's district already in hand.
 *
 * The five regions below are NEXUS's OWN operational grouping for routing, not the
 * URA planning regions, and they are not interchangeable with them. They exist to
 * answer "which set of services do I show this person", nothing more.
 */

/**
 * Every live sector. `district` is the official postal district; `locality` is the
 * district's conventional name, shown to a person so they can tell at a glance
 * whether the portal understood where they live.
 */
export const POSTAL_SECTORS = Object.freeze({
    '01': { district:  1, region: 'central', locality: "Raffles Place · Cecil · Marina · People's Park" },
    '02': { district:  1, region: 'central', locality: "Raffles Place · Cecil · Marina · People's Park" },
    '03': { district:  1, region: 'central', locality: "Raffles Place · Cecil · Marina · People's Park" },
    '04': { district:  1, region: 'central', locality: "Raffles Place · Cecil · Marina · People's Park" },
    '05': { district:  1, region: 'central', locality: "Raffles Place · Cecil · Marina · People's Park" },
    '06': { district:  1, region: 'central', locality: "Raffles Place · Cecil · Marina · People's Park" },
    '07': { district:  2, region: 'central', locality: "Anson · Tanjong Pagar" },
    '08': { district:  2, region: 'central', locality: "Anson · Tanjong Pagar" },
    '09': { district:  4, region: 'central', locality: "Telok Blangah · HarbourFront · Sentosa" },
    '10': { district:  4, region: 'central', locality: "Telok Blangah · HarbourFront · Sentosa" },
    '11': { district:  5, region: 'central', locality: "Pasir Panjang · Clementi New Town · West Coast" },
    '12': { district:  5, region: 'central', locality: "Pasir Panjang · Clementi New Town · West Coast" },
    '13': { district:  5, region: 'central', locality: "Pasir Panjang · Clementi New Town · West Coast" },
    '14': { district:  3, region: 'central', locality: "Queenstown · Tiong Bahru · Bukit Merah" },
    '15': { district:  3, region: 'central', locality: "Queenstown · Tiong Bahru · Bukit Merah" },
    '16': { district:  3, region: 'central', locality: "Queenstown · Tiong Bahru · Bukit Merah" },
    '17': { district:  6, region: 'central', locality: "High Street · Beach Road · City Hall" },
    '18': { district:  7, region: 'central', locality: "Middle Road · Golden Mile · Bugis" },
    '19': { district:  7, region: 'central', locality: "Middle Road · Golden Mile · Bugis" },
    '20': { district:  8, region: 'central', locality: "Little India · Farrer Park" },
    '21': { district:  8, region: 'central', locality: "Little India · Farrer Park" },
    '22': { district:  9, region: 'central', locality: "Orchard · Cairnhill · River Valley" },
    '23': { district:  9, region: 'central', locality: "Orchard · Cairnhill · River Valley" },
    '24': { district: 10, region: 'central', locality: "Ardmore · Bukit Timah · Holland Road · Tanglin" },
    '25': { district: 10, region: 'central', locality: "Ardmore · Bukit Timah · Holland Road · Tanglin" },
    '26': { district: 10, region: 'central', locality: "Ardmore · Bukit Timah · Holland Road · Tanglin" },
    '27': { district: 10, region: 'central', locality: "Ardmore · Bukit Timah · Holland Road · Tanglin" },
    '28': { district: 11, region: 'central', locality: "Watten Estate · Novena · Thomson" },
    '29': { district: 11, region: 'central', locality: "Watten Estate · Novena · Thomson" },
    '30': { district: 11, region: 'central', locality: "Watten Estate · Novena · Thomson" },
    '31': { district: 12, region: 'central', locality: "Balestier · Toa Payoh · Serangoon" },
    '32': { district: 12, region: 'central', locality: "Balestier · Toa Payoh · Serangoon" },
    '33': { district: 12, region: 'central', locality: "Balestier · Toa Payoh · Serangoon" },
    '34': { district: 13, region: 'central', locality: "Macpherson · Braddell · Potong Pasir" },
    '35': { district: 13, region: 'central', locality: "Macpherson · Braddell · Potong Pasir" },
    '36': { district: 13, region: 'central', locality: "Macpherson · Braddell · Potong Pasir" },
    '37': { district: 13, region: 'central', locality: "Macpherson · Braddell · Potong Pasir" },
    '38': { district: 14, region: 'east', locality: "Geylang · Eunos · Paya Lebar" },
    '39': { district: 14, region: 'east', locality: "Geylang · Eunos · Paya Lebar" },
    '40': { district: 14, region: 'east', locality: "Geylang · Eunos · Paya Lebar" },
    '41': { district: 14, region: 'east', locality: "Geylang · Eunos · Paya Lebar" },
    '42': { district: 15, region: 'east', locality: "Katong · Joo Chiat · Amber Road · Marine Parade" },
    '43': { district: 15, region: 'east', locality: "Katong · Joo Chiat · Amber Road · Marine Parade" },
    '44': { district: 15, region: 'east', locality: "Katong · Joo Chiat · Amber Road · Marine Parade" },
    '45': { district: 15, region: 'east', locality: "Katong · Joo Chiat · Amber Road · Marine Parade" },
    '46': { district: 16, region: 'east', locality: "Bedok · Upper East Coast · Eastwood · Kew Drive" },
    '47': { district: 16, region: 'east', locality: "Bedok · Upper East Coast · Eastwood · Kew Drive" },
    '48': { district: 16, region: 'east', locality: "Bedok · Upper East Coast · Eastwood · Kew Drive" },
    '49': { district: 17, region: 'east', locality: "Loyang · Changi · Flora Drive" },
    '50': { district: 17, region: 'east', locality: "Loyang · Changi · Flora Drive" },
    '51': { district: 18, region: 'east', locality: "Tampines · Pasir Ris" },
    '52': { district: 18, region: 'east', locality: "Tampines · Pasir Ris" },
    '53': { district: 19, region: 'north-east', locality: "Serangoon Garden · Hougang · Sengkang · Punggol" },
    '54': { district: 19, region: 'north-east', locality: "Serangoon Garden · Hougang · Sengkang · Punggol" },
    '55': { district: 19, region: 'north-east', locality: "Serangoon Garden · Hougang · Sengkang · Punggol" },
    '56': { district: 20, region: 'central', locality: "Bishan · Ang Mo Kio · Upper Thomson" },
    '57': { district: 20, region: 'central', locality: "Bishan · Ang Mo Kio · Upper Thomson" },
    '58': { district: 21, region: 'west', locality: "Upper Bukit Timah · Clementi Park · Ulu Pandan" },
    '59': { district: 21, region: 'west', locality: "Upper Bukit Timah · Clementi Park · Ulu Pandan" },
    '60': { district: 22, region: 'west', locality: "Jurong · Boon Lay · Tuas" },
    '61': { district: 22, region: 'west', locality: "Jurong · Boon Lay · Tuas" },
    '62': { district: 22, region: 'west', locality: "Jurong · Boon Lay · Tuas" },
    '63': { district: 22, region: 'west', locality: "Jurong · Boon Lay · Tuas" },
    '64': { district: 22, region: 'west', locality: "Jurong · Boon Lay · Tuas" },
    '65': { district: 23, region: 'west', locality: "Hillview · Dairy Farm · Bukit Panjang · Choa Chu Kang" },
    '66': { district: 23, region: 'west', locality: "Hillview · Dairy Farm · Bukit Panjang · Choa Chu Kang" },
    '67': { district: 23, region: 'west', locality: "Hillview · Dairy Farm · Bukit Panjang · Choa Chu Kang" },
    '68': { district: 23, region: 'west', locality: "Hillview · Dairy Farm · Bukit Panjang · Choa Chu Kang" },
    '69': { district: 24, region: 'west', locality: "Lim Chu Kang · Tengah · Kranji" },
    '70': { district: 24, region: 'west', locality: "Lim Chu Kang · Tengah · Kranji" },
    '71': { district: 24, region: 'west', locality: "Lim Chu Kang · Tengah · Kranji" },
    '72': { district: 25, region: 'north', locality: "Woodlands · Admiralty" },
    '73': { district: 25, region: 'north', locality: "Woodlands · Admiralty" },
    '75': { district: 27, region: 'north', locality: "Yishun · Sembawang" },
    '76': { district: 27, region: 'north', locality: "Yishun · Sembawang" },
    '77': { district: 26, region: 'north', locality: "Upper Thomson · Springleaf · Mandai" },
    '78': { district: 26, region: 'north', locality: "Upper Thomson · Springleaf · Mandai" },
    '79': { district: 28, region: 'north-east', locality: "Seletar · Yio Chu Kang" },
    '80': { district: 28, region: 'north-east', locality: "Seletar · Yio Chu Kang" },
    '81': { district: 17, region: 'east', locality: "Loyang · Changi · Flora Drive" },
    '82': { district: 19, region: 'north-east', locality: "Serangoon Garden · Hougang · Sengkang · Punggol" },
});

/** `74` is not a Singapore postal sector. Kept explicit so it reads as intent. */
export const UNUSED_SECTORS = Object.freeze(['74']);

/**
 * What is written to a record when the person did not give a usable sector.
 *
 * ⚠️ IT MUST NOT LOOK LIKE A SECTOR. The previous sentinel was `'00'`, which is two
 *    digits and reads as a place — it survived into the stored record and into a
 *    cluster lookup that mapped it to one particular cluster. `'--'` cannot be
 *    parsed as a sector by anything, and `toSector('--')` returns `null`.
 *
 *    It also has to be a string of at most four characters, because
 *    `firestore.rules` requires exactly that of `postalSector` on
 *    `community_assessments`.
 *
 *    Records written before this change carry `'00'`. Nothing reads that collection
 *    yet (`allow read: if false`), so there is no consumer to migrate — but a
 *    future reader must treat BOTH `'00'` and `'--'` as unknown, and `'00'` as
 *    additionally suspect, because it may be a fabricated chip-label sector.
 */
export const UNKNOWN_SECTOR = '--';

export const REGIONS = Object.freeze(['central', 'east', 'north-east', 'north', 'west']);

/** How each region is labelled to a person. */
export const REGION_LABEL = Object.freeze({
    'central':    'Central',
    'east':       'East',
    'north-east': 'North-East',
    'north':      'North',
    'west':       'West',
});

/**
 * Normalises whatever a person typed into a sector, or `null`.
 *
 * ⚠️ `null` IS A REAL ANSWER AND MUST NOT BECOME A SECTOR. "I would rather not
 *    say", a typo, and a sector that does not exist are all unknown, and unknown
 *    must stay unknown all the way to the result page — the previous code turned
 *    it into `'00'`, which then resolved to a health cluster as if it were a
 *    place.
 *
 * Accepts a full six-digit code as well as two digits, because people type what
 * they know. Only the first two are kept; the rest is discarded immediately and
 * never stored.
 */
export const toSector = (input) => {
    // ⚠️ THE INPUT MUST *BE* A POSTAL CODE, NOT MERELY CONTAIN DIGITS.
    //
    //    An earlier draft of this very function stripped non-digits from the whole
    //    string — and so reproduced the bug it was written to fix: the chip label
    //    'North (e.g. 73, 75)' became '7375', whose first two digits are 73, and
    //    every North respondent was recorded as Woodlands again. Its own
    //    regression test caught it.
    //
    //    So: strip spaces, dashes and an optional Singapore 'S' prefix, and then
    //    require everything that remains to be digits. Prose is not a location.
    const cleaned = String(input ?? '').trim().replace(/^[Ss]/, '').replace(/[\s-]/g, '');
    if (!/^\d+$/.test(cleaned) || cleaned.length < 2) return null;
    const sector = cleaned.slice(0, 2);
    return Object.prototype.hasOwnProperty.call(POSTAL_SECTORS, sector) ? sector : null;
};

/** `true` only for a sector that exists. */
export const isValidSector = (sector) => toSector(sector) !== null;

/** `{ sector, district, region, locality }`, or `null`. */
export const sectorInfo = (input) => {
    const sector = toSector(input);
    if (!sector) return null;
    return { sector, ...POSTAL_SECTORS[sector] };
};

/** The region for a sector, or `null` when it is not a sector. */
export const regionForSector = (input) => sectorInfo(input)?.region ?? null;

/** The district number for a sector, or `null`. */
export const districtForSector = (input) => sectorInfo(input)?.district ?? null;

/** Every sector in a region, ascending. Used by the coverage tests and reporting. */
export const sectorsInRegion = (region) =>
    Object.keys(POSTAL_SECTORS).filter((s) => POSTAL_SECTORS[s].region === region).sort();
