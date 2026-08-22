/**
 * ==============================================================================
 * COMMUNITY SERVICES — national coverage, without inventing branch addresses
 * ==============================================================================
 *
 * NEXUS was prototyped for the north. This module makes the follow-up work
 * anywhere in Singapore, keyed on the postal sector a person actually gives.
 *
 * ── ⚠️ THE DESIGN DECISION, STATED UP FRONT ─────────────────────────────────
 *
 * The obvious build is a national directory of every Active Ageing Centre,
 * polyclinic and community club with its address and opening hours. This module
 * deliberately does NOT do that, for a reason the project has already learned
 * once:
 *
 *   `CP8` — the portal labelled its inventory a "VERIFIED RESOURCE INVENTORY" and
 *           presented prices and hours to the public as fact, while the only
 *           freshness field was written by a seed script and read by nothing.
 *   `CP16` — that inventory turned out to reach nobody at all, while a second,
 *           hardcoded registry with no freshness field was what people saw.
 *
 * Hand-entering several hundred branch records nobody has confirmed would repeat
 * that failure at national scale, and stale beats absent only until somebody
 * travels to a centre that closed. So:
 *
 *   ✅ THIS MODULE OWNS  which KINDS of service fit this person, in their
 *                        district, and the OFFICIAL finder for each — the
 *                        authoritative, always-current source.
 *   ❌ IT DOES NOT OWN   the address, hours or phone number of any branch.
 *
 * A person is told "Active Ageing Centres near Woodlands (District 25)" with the
 * AIC finder alongside, rather than an address that was right in August. When a
 * confirmed national dataset exists — an AIC feed, a data.gov.sg release — it
 * slots in behind `servicesForSector` without changing a caller.
 *
 * ── HEALTH CLUSTER ──────────────────────────────────────────────────────────
 *
 * ⚠️ The cluster mapping below is an OPERATIONAL ASSUMPTION, not an official
 *    boundary. Singapore's three clusters are aligned to regions rather than to
 *    postal sectors, and the alignment has been revised. It is declared as data,
 *    in one place, so it can be corrected without hunting through components —
 *    and it must be confirmed with each cluster before anything here is used to
 *    make an actual referral. It is currently used only to pick which cluster's
 *    public health-promotion page to show.
 */

import { sectorInfo, REGION_LABEL } from './postalSectors';

/** Region → health cluster. See the warning above: assumption, not fact. */
const CLUSTER_BY_REGION = Object.freeze({
    'central':    'NHG',
    'north':      'NHG',
    'north-east': 'NHG',
    'east':       'SingHealth',
    'west':       'NUHS',
});

export const CLUSTERS = Object.freeze({
    NHG:        { name: 'NHG Health',  url: 'https://www.nhg.com.sg/' },
    SingHealth: { name: 'SingHealth',  url: 'https://www.singhealth.com.sg/' },
    NUHS:       { name: 'NUHS',        url: 'https://www.nuhs.edu.sg/' },
});

/**
 * The cluster for a sector, or `null` when the sector is unknown.
 *
 * ⚠️ RETURNS `null` RATHER THAN A DEFAULT. The previous implementation took
 *    `parseInt('00')`, failed every range test and fell through to one particular
 *    cluster — so "I would rather not say" was recorded as a place, and the person
 *    was shown one cluster's services on the strength of it.
 */
export const clusterForSector = (input) => {
    const info = sectorInfo(input);
    return info ? CLUSTER_BY_REGION[info.region] ?? null : null;
};

/**
 * Service kinds available island-wide. Each carries the OFFICIAL finder, which is
 * the part that stays true. `national: true` means the service exists in every
 * district — which is why this works outside the north.
 */
export const SERVICE_KINDS = Object.freeze({
    activeAgeing: {
        id: 'activeAgeing',
        label: 'Active Ageing Centres',
        blurb: 'Drop-in centres for residents aged 60+ — activities, befriending and help navigating care. Walk in; no appointment.',
        finder: 'https://www.aic.sg/care-services/active-ageing-centres',
        finderLabel: 'Find centres near you (AIC)',
        national: true,
    },
    polyclinic: {
        id: 'polyclinic',
        label: 'Polyclinics',
        blurb: 'Subsidised primary care, chronic disease management and referrals.',
        finder: 'https://www.healthhub.sg/directory',
        finderLabel: 'Find your nearest polyclinic (HealthHub)',
        national: true,
    },
    healthierSg: {
        id: 'healthierSg',
        label: 'Healthier SG',
        blurb: 'Enrol with a GP for a subsidised annual Health Plan, screening schedule and community programme referrals.',
        finder: 'https://www.healthiersg.gov.sg/',
        finderLabel: 'Enrol or find your Healthier SG GP',
        national: true,
    },
    activesg: {
        id: 'activesg',
        label: 'ActiveSG & Active Health Labs',
        blurb: 'Public gyms, pools and coached programmes, including beginner and strength sessions.',
        finder: 'https://www.myactivesg.com/',
        finderLabel: 'Find a centre or programme (ActiveSG)',
        national: true,
    },
    communityClub: {
        id: 'communityClub',
        label: 'Community Clubs',
        blurb: 'Low-cost courses and interest groups in every constituency — a route in that does not look like healthcare.',
        finder: 'https://www.pa.gov.sg/our-network/community-clubs',
        finderLabel: 'Find your Community Club (PA)',
        national: true,
    },
    mentalWellness: {
        id: 'mentalWellness',
        label: 'mindline.sg',
        blurb: 'Free, confidential emotional support tools and a route to human help.',
        finder: 'https://www.mindline.sg/',
        finderLabel: 'Open mindline.sg',
        national: true,
    },
    silverGeneration: {
        id: 'silverGeneration',
        label: 'Silver Generation Office',
        blurb: 'Home visits and help connecting seniors to schemes and care they are eligible for.',
        finder: 'https://www.aic.sg/about-us/silver-generation-office',
        finderLabel: 'About the Silver Generation Office',
        national: true,
    },
    careline: {
        id: 'careline',
        label: 'SingHealth CareLine',
        blurb: '24/7 tele-befriending and social support for eligible seniors.',
        finder: 'https://www.singhealth.com.sg/community-care/careline',
        finderLabel: 'About CareLine',
        national: true,
    },
    financialSupport: {
        id: 'financialSupport',
        label: 'CHAS & healthcare subsidies',
        blurb: 'Subsidy schemes for community healthcare — Blue, Orange and Merdeka/Pioneer Generation.',
        finder: 'https://www.chas.sg/',
        finderLabel: 'Check what you qualify for (CHAS)',
        national: true,
    },
    fallsPrevention: {
        id: 'fallsPrevention',
        label: 'Falls prevention & functional strength',
        blurb: 'Balance and strength programmes for older adults, and a home safety assessment where one is needed. Falls are preventable and a first fall is the strongest predictor of a second.',
        finder: 'https://www.healthhub.sg/live-healthy/falls-prevention',
        finderLabel: 'Falls prevention (HealthHub)',
        national: true,
    },
    caregiverSupport: {
        id: 'caregiverSupport',
        label: 'Caregiver support',
        blurb: 'Training, respite and support for people caring for a family member — including help arranging a needs assessment for the person you care for.',
        finder: 'https://www.aic.sg/caregiving',
        finderLabel: 'Caregiver services and support (AIC)',
        national: true,
    },
    socialSupport: {
        id: 'socialSupport',
        label: 'Social Service Offices',
        blurb: 'Help with financial assistance and social support, one office per town.',
        finder: 'https://www.msf.gov.sg/what-we-do/social-service-office',
        finderLabel: 'Find your Social Service Office (MSF)',
        national: true,
    },
});

/**
 * The services to offer somebody, given where they are and what they reported.
 *
 * Ordered by need rather than by geography: a person's flags decide WHICH kinds
 * appear, and the sector decides how they are LABELLED and which cluster page is
 * added. Both work in every district — which is the point of this module.
 *
 * @param {string|null} sectorInput   whatever the person gave; may be unknown
 * @param {object} flags              the derived clinical and SDOH flags
 * @returns {{location: object|null, cluster: object|null, services: object[], coverage: string}}
 */
export const servicesForSector = (sectorInput, flags = {}) => {
    const info = sectorInfo(sectorInput);
    const clusterId = clusterForSector(sectorInput);
    const chosen = [];
    const add = (kind) => { if (!chosen.some((s) => s.id === kind.id)) chosen.push(kind); };

    // Highest need first — the same precedence the CTA ladder uses.
    if (flags.symptomFlag)                 add(SERVICE_KINDS.polyclinic);
    if (flags.symptomFlag || flags.medFlag) add(SERVICE_KINDS.healthierSg);
    if (flags.sdohPsychological || flags.psychoFlag) add(SERVICE_KINDS.mentalWellness);

    /**
     * ⚠️ FALLS OUTRANK ACTIVITY FOR THIS COHORT, which is the reviewer's whole
     *    point. Somebody 60+ who has fallen needs balance and strength work and a
     *    look at their home before they need a weekly minutes target — and PAVS
     *    alone would have routed them to "150 minutes a week" without ever asking.
     *    Fear of falling counts even without a second fall: avoiding the stairs is
     *    itself the deconditioning that causes the next one.
     */
    if (flags.fallsRisk) add(SERVICE_KINDS.fallsPrevention);

    if (flags.age === '60+') {
        add(SERVICE_KINDS.activeAgeing);
        if (flags.sdohSocial) { add(SERVICE_KINDS.careline); add(SERVICE_KINDS.silverGeneration); }
    } else if (flags.sdohSocial) {
        add(SERVICE_KINDS.communityClub);
    }

    /**
     * ⚠️ CAREGIVER STRAIN ROUTES BEFORE GENERAL FINANCIAL HELP, because a carer
     *    who says they are overwhelmed is describing a load, not a budget. This
     *    branch exists at all only because the wellbeing chip was split — the two
     *    used to be one answer, and a carer was routed as though they had said
     *    "money is tight".
     */
    if (flags.caregiverStrain) add(SERVICE_KINDS.caregiverSupport);

    if (flags.sdohFinancial)    add(SERVICE_KINDS.financialSupport);
    if (flags.sdohFoodInsecure) add(SERVICE_KINDS.socialSupport);
    /**
     * ⚠️ THIS MAKES AN EXISTING CLAIM TRUE. The evidence page tells the public that
     *    housing type is used as a social-risk proxy — 1–2 room HDB — and until now
     *    nothing consumed the flag: the form computed it and discarded it, and the
     *    chat did not compute it at all. A Social Service Office is the right route
     *    for the same reason food insecurity goes there.
     */
    if (flags.sdohHousing) add(SERVICE_KINDS.socialSupport);

    // Everybody gets a way to be more active and a way into primary care.
    add(SERVICE_KINDS.activesg);
    // ⚠️ `healthierSgEnrolled === false` is NOT the same as `null`. Someone who
    //    said "not sure", or was never asked, must not be told to enrol as though
    //    they had said no — but everybody still gets the route, because it is the
    //    anchor the rest of the plan hangs off.
    add(SERVICE_KINDS.healthierSg);

    return {
        location: info
            ? { sector: info.sector, district: info.district, locality: info.locality,
                region: info.region, regionLabel: REGION_LABEL[info.region] }
            : null,
        cluster: clusterId ? { id: clusterId, ...CLUSTERS[clusterId] } : null,
        services: chosen,
        /**
         * ⚠️ SAID OUT LOUD RATHER THAN INFERRED FROM A MISSING FIELD. When the
         *    sector is unknown the services are still correct — every one is
         *    national — but they cannot be described as "near you", and no cluster
         *    is guessed. The caller renders this distinction; it does not paper
         *    over it.
         */
        coverage: info ? 'located' : 'national-only',
    };
};
