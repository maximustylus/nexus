'use strict';

/**
 * ==============================================================================
 * RATE LIMIT — the bill, and the one endpoint anybody on the internet can reach
 * ==============================================================================
 *
 * `communityAck` is deliberately unauthenticated: the community portal is FOR
 * members of the public, and requiring a sign-in would defeat it. `CP6` shrank the
 * blast radius of that decision — the prompt no longer names KKH/SingHealth or
 * prints the internal schema, output is capped at 200 tokens and the timeout is
 * 30s. What it did not do is bound how OFTEN somebody can call it.
 *
 * A loop against this endpoint costs money on a Gemini key and nothing on the
 * caller's side. There is no error, no alarm and nothing on any screen; the first
 * anybody would know is a bill. `CP7` is that gap, and this module is the half of
 * it that does not require the Firebase console.
 *
 * ------------------------------------------------------------------------------
 * APP CHECK IS THE REAL MITIGATION, AND THIS IS NOT A SUBSTITUTE FOR IT
 * ------------------------------------------------------------------------------
 *
 * App Check attests that a call came from the real web app rather than from curl.
 * It is strictly better than counting, because it removes the abusive caller
 * instead of slowing them down. It is not enabled here yet, and enabling it is not
 * a code change alone: it needs a reCAPTCHA Enterprise site key registered in the
 * Firebase console, the client initialised with it, and a rollout window in which
 * enforcement is OFF while real traffic is observed. Turning it on before that
 * would fail every real assessment in the country.
 *
 * So this module does two things, and the split matters:
 *
 *   1. It COUNTS, and refuses past a threshold. That works today, with no console
 *      access, and bounds the bill.
 *   2. It treats an ABSENT App Check token as a signal rather than as an error —
 *      an unattested caller gets the tighter of two limits. Real browser traffic
 *      is unaffected the day the client starts sending tokens, and the logs say
 *      what proportion of traffic is attested, which is exactly the measurement
 *      the rollout window needs.
 *
 * ------------------------------------------------------------------------------
 * WHY THE LIMITS ARE SHAPED THE WAY THEY ARE
 * ------------------------------------------------------------------------------
 *
 * ⚠️ THE OBVIOUS LIMIT IS WRONG HERE, AND THE REASON IS A NAT. One assessment is
 *    THIRTEEN calls to this endpoint — one per question domain. A "10 per hour per
 *    IP" rule would break a single person halfway through their first screening.
 *    Worse, a community roadshow, a polyclinic waiting room or a school hall puts
 *    thirty people behind ONE public address, so a per-IP limit tight enough to
 *    stop a script is tight enough to break the exact event the portal is for.
 *
 * So there are two ceilings and they answer different questions:
 *
 *   PER CALLER — generous. It does not try to stop a crowd; it stops a LOOP. At
 *                300/hour a shared address supports about twenty-three complete
 *                assessments an hour, and a script still hits the wall in minutes.
 *
 *   GLOBAL     — a circuit breaker on the whole endpoint, which is the only thing
 *                that actually bounds the bill when an attacker has many
 *                addresses. Set well above any plausible real day and logged
 *                loudly when approached, because the honest use of this ceiling is
 *                as an alarm rather than as a policy.
 */

const { createHash } = require('node:crypto');

/** One hour, as milliseconds. Both windows use it. */
const WINDOW_MS = 60 * 60 * 1000;

/**
 * The ceilings, as data so a test asserts the reasoning rather than the number.
 *
 * `unverified` is what an unattested caller gets. It is deliberately NOT punitive
 * today — every real caller is unattested until App Check ships — but it is a
 * separate number so that tightening it later is a one-line change with a test
 * already written for it.
 */
const LIMITS = Object.freeze({
    /** A caller that presented a valid App Check token. */
    verified: 600,
    /** A caller that did not. Today: everybody. */
    unverified: 300,
    /** Every caller together, in one window. The circuit breaker. */
    global: 6000,
    /** Log a warning once traffic passes this share of the global ceiling. */
    globalWarnAt: 0.5,
});

/** How many calls one complete assessment makes — used to phrase the limits. */
const CALLS_PER_ASSESSMENT = 13;

/**
 * ==============================================================================
 * THE STAFF SIDE — `AU14`, closed with the same machinery
 * ==============================================================================
 *
 * `chatWithAura`, `generateSmartAnalysis` and `processFeedPost` are authenticated,
 * which made them LOOK safer than `communityAck` while being the opposite: any
 * single signed-in account could loop the billed Gemini key as fast as promises
 * resolve, and `AU14` recorded that nothing bounded it. Authentication is
 * attribution, not restraint.
 *
 * The shape differs from the public side in one load-bearing way: the bucket is
 * the UID, not the address. A uid cannot be spoofed by a header, does not put a
 * roadshow crowd behind one key, and is already the identity every other limit in
 * this app hangs off. The NAT reasoning above simply does not apply.
 *
 * ⚠️ ONE BUDGET ACROSS ALL THREE ENDPOINTS, deliberately. Splitting per endpoint
 *    would triple the effective allowance of a caller who rotates, and no honest
 *    use rotates: a human in the chat makes a few calls a minute at most, and the
 *    analysis is a couple of clicks a year. 120/hour supports a two-hour
 *    conversation with AURA answering every thirty seconds, which nobody has ever
 *    had, while a loop hits the wall inside two minutes.
 *
 * ⚠️ THE GLOBAL CEILING IS AN ALARM HERE TOO. Twenty-eight departments of real
 *    staff produce nowhere near 3,000 AI calls an hour; a bill does.
 */
const STAFF_LIMITS = Object.freeze({
    perUser: 120,
    global: 3000,
    globalWarnAt: 0.5,
});

const staffPlanFor = ({ uid, nowMs, salt }) => ({
    caller: {
        // A uid is not a secret the way an address is, but the doc id is hashed
        // anyway: one convention for every key in `rate_limits`, and no reader of
        // that collection learns who chats with AURA and when.
        attributable: typeof uid === 'string' && uid !== '',
        limit: STAFF_LIMITS.perUser,
        path: counterPath('staff', (typeof uid === 'string' && uid) || UNKNOWN_CALLER, windowIndex(nowMs), salt),
    },
    global: {
        limit: STAFF_LIMITS.global,
        path: counterPath('staff_global', 'all', windowIndex(nowMs), salt),
    },
    windowIndex: windowIndex(nowMs),
});

/**
 * Staff wording, not the roadshow wording: no shared-wifi story, because the
 * bucket is personal, and it says plainly that the ceiling exists to bound cost.
 */
const staffRefusalMessage = ({ retryAfterSeconds }) => {
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    return 'AURA has hit the hourly usage ceiling for your account, which exists to '
        + 'bound the cost of the AI service. Nothing is wrong with your access. Please '
        + `try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
};

/**
 * The caller's address, reduced to something worth counting.
 *
 * ⚠️ `x-forwarded-for` IS A LIST, AND ONLY ONE ENTRY IS TRUSTWORTHY. Cloud
 *    Functions sits behind Google's front end, which APPENDS the address it saw;
 *    a caller can put anything they like in front of it. The LAST entry is the one
 *    the infrastructure wrote, so that is the one used — taking the first, which
 *    is the more common reading of this header, would let a caller reset their own
 *    bucket on every request by sending a new fake address.
 *
 * ⚠️ IPv6 IS COUNTED AS A /64, NOT AS AN ADDRESS. A residential IPv6 allocation is
 *    routinely a /64 or larger, so counting full addresses means an attacker has
 *    18 quintillion buckets and a limit that never triggers. A /64 is the smallest
 *    unit that is reliably one subscriber.
 */
/**
 * The /64 an IPv6 address belongs to.
 *
 * ⚠️ `::` HAS TO BE EXPANDED, AND THE FIRST DRAFT DID NOT DO IT. It took
 *    `address.split(':').slice(0, 4).filter(Boolean)`, and `filter(Boolean)` is
 *    precisely what drops the zero groups `::` stands for — so `2001:db8::1`
 *    yielded `2001:db8:1::/64`, which is a DIFFERENT subnet from the one it is in
 *    (`2001:db8:0:0::/64`). Two addresses in one /64 would land in two buckets and
 *    each get a full allowance, and an attacker choosing addresses could multiply
 *    their quota by writing them in different compressed forms.
 *
 *    Expanding first is the whole fix: `::` stands for however many zero groups
 *    are needed to reach eight.
 */
/** Shapes, not full validation — enough to tell an address from a junk string. */
const IPV4_SHAPE = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6_SHAPE = /^[0-9a-f:]+(%[0-9a-z]+)?$/;

const ipv6Prefix = (address) => {
    const halves = address.split('::');
    const head = (halves[0] || '').split(':').filter(Boolean);
    const tail = halves.length > 1 ? (halves[1] || '').split(':').filter(Boolean) : [];

    const groups = halves.length > 1
        ? [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill('0'), ...tail]
        : head;

    // Leading zeros are not significant: `0db8` and `db8` are one group.
    const prefix = groups.slice(0, 4).map((group) => (group.replace(/^0+/, '') || '0'));
    while (prefix.length < 4) prefix.push('0');

    return prefix.join(':') + '::/64';
};

const callerKey = (forwardedFor, directIp) => {
    const chain = typeof forwardedFor === 'string' ? forwardedFor : '';
    const entries = chain.split(',').map((part) => part.trim()).filter(Boolean);
    const raw = entries.length > 0 ? entries[entries.length - 1] : (typeof directIp === 'string' ? directIp.trim() : '');
    if (!raw) return null;

    // Strip a port from `1.2.3.4:5678` and from `[::1]:5678`.
    const bracketed = raw.match(/^\[([^\]]+)\](?::\d+)?$/);
    let address = bracketed ? bracketed[1] : raw;
    if (!bracketed && address.includes(':') && address.split(':').length === 2) {
        address = address.split(':')[0];
    }

    address = address.toLowerCase();
    if (address === '') return null;

    /**
     * ⚠️ AN IPv4-MAPPED IPv6 ADDRESS IS AN IPv4 ADDRESS, AND MISSING THAT WOULD HAVE
     *    BEEN THE WORST BUG IN THIS FILE. `::ffff:203.0.113.9` is what an IPv4
     *    client looks like arriving on a dual-stack socket, which is routine. The
     *    IPv6 branch below rejects it as malformed (it contains dots), so every
     *    IPv4 caller in the country would have fallen into the SINGLE shared
     *    `_unattributable` bucket together — and the per-caller ceiling would then
     *    refuse the whole public, from one busy hour, with a message about wifi.
     *    A limiter that fails that way is worse than no limiter.
     */
    const mapped = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mapped) address = mapped[1];
    else if (address.includes(':')) return IPV6_SHAPE.test(address) ? ipv6Prefix(address) : null;

    /**
     * ⚠️ AN UNPARSEABLE VALUE GOES TO THE SHARED BUCKET, NOT TO ITS OWN. Without
     *    this the string was returned verbatim, so `,,` — or anything else — became
     *    a bucket key of its own. That is not a way past the ceiling (it is still
     *    one bucket per distinct value) but it IS a way to create unbounded
     *    documents in `rate_limits` by sending a new junk value each time. Returning
     *    null sends all of it to `_unattributable`, which is one document.
     */
    return IPV4_SHAPE.test(address) ? address : null;
};

/**
 * The window a moment falls in, as an integer, so the document id is derivable by
 * both the writer and any later cleanup without either storing a timestamp.
 */
const windowIndex = (nowMs, windowMs = WINDOW_MS) => Math.floor(Number(nowMs) / windowMs);

/**
 * ⚠️ THE COUNTER'S DOCUMENT ID MUST NOT BE AN IP ADDRESS, AND THE FIRST DRAFT OF
 *    THIS FILE MADE IT ONE.
 *
 *    `rate_limits/caller__203.0.113.9__489012` is a record that somebody at that
 *    address used a PUBLIC HEALTH SCREENING in that hour. No client can read the
 *    collection, which is necessary and is not the same as not storing it — and
 *    this project has already shipped one claim of that shape and had to fix it
 *    (`CP3`: "de-identified at the point of capture", written directly beside
 *    `clientReference: navigator.userAgent`). Writing an identifier of a member of
 *    the public into the app's own database, for a health service, is the thing
 *    that file is about.
 *
 *    So the key is hashed. What is stored is an opaque token that is stable within
 *    one window, which is all a counter needs.
 *
 * ⚠️ AND THE HONEST LIMIT OF THAT, STATED RATHER THAN IMPLIED. With the built-in
 *    salt this is OBFUSCATION, NOT ANONYMISATION: the IPv4 space is 2^32, so
 *    anybody holding both the salt and the database can enumerate it in seconds.
 *    Setting `RATE_LIMIT_SALT` to a value that is not in this repository is what
 *    makes the tokens actually irreversible, and it is one environment variable at
 *    deploy time. The deploy notes carry it. It is not the default because a
 *    missing environment variable must not silently disable the rate limit, and a
 *    per-instance random salt would split the counters across instances and do
 *    exactly that.
 */
const DEFAULT_SALT = 'nexus-community-rate-limit-v1';

const hashKey = (value, salt) => createHash('sha256')
    .update(`${salt || process.env.RATE_LIMIT_SALT || DEFAULT_SALT}::${value}`)
    .digest('hex')
    .slice(0, 32);

/**
 * A counter document path. `rate_limits` is a private collection — no client may
 * read or write it, because a counter a client can write is not a counter and a
 * counter a client can read is a log of who used the screening.
 *
 * ⚠️ THE WINDOW IS IN THE DOCUMENT ID, which is what makes expiry a deletion of
 *    old ids rather than a field comparison, and what makes the counter
 *    self-resetting without a scheduled job having to run on time.
 */
const counterPath = (scope, key, index, salt) => [
    'rate_limits',
    `${scope}__${hashKey(key, salt)}__${index}`,
];

/**
 * The whole decision, given a count that has already been read.
 *
 * Returns the limit and the count as well as the verdict, because the CALLER logs
 * them: a refusal nobody can see the numbers behind is a support ticket.
 */
const decide = ({ count, limit, nowMs, windowMs = WINDOW_MS }) => {
    const used = Number.isFinite(Number(count)) ? Number(count) : 0;
    const ceiling = Number.isFinite(Number(limit)) ? Number(limit) : 0;
    const allowed = used < ceiling;

    // Seconds until this window ends — the honest answer to "when may I retry?",
    // and the value a `Retry-After` would carry.
    const elapsed = Number(nowMs) - windowIndex(nowMs, windowMs) * windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - elapsed) / 1000));

    return { allowed, used, ceiling, retryAfterSeconds };
};

/**
 * Which ceiling applies to this caller.
 *
 * ⚠️ AN UNKNOWN CALLER GETS THE TIGHTER LIMIT, NOT AN EXEMPTION. `callerKey`
 *    returns null when there is no usable address — a malformed header, a caller
 *    reaching the function by a route that does not set one. The first draft of
 *    this treated that as "cannot count, therefore allow", which is a bypass
 *    anybody could reach by removing a header. Everything unattributable shares
 *    ONE bucket instead.
 */
const UNKNOWN_CALLER = '_unattributable';

const planFor = ({ callerKey: key, appCheckVerified, nowMs, salt }) => ({
    caller: {
        // ⚠️ NOT THE ADDRESS. `key` stays in memory for the length of one call and
        //    is never returned or written; only its hash reaches a document id.
        attributable: !!key,
        limit: appCheckVerified ? LIMITS.verified : LIMITS.unverified,
        path: counterPath('caller', key || UNKNOWN_CALLER, windowIndex(nowMs), salt),
    },
    global: {
        limit: LIMITS.global,
        path: counterPath('global', 'all', windowIndex(nowMs), salt),
    },
    windowIndex: windowIndex(nowMs),
});

/**
 * The sentence a member of the public reads when they hit the ceiling.
 *
 * It has to be true and it has to not blame them: the overwhelming majority of
 * anybody who ever sees it will be the thirtieth person on one roadshow wifi, not
 * an attacker. So it names the shared connection, gives a real wait, and does not
 * use the word "limit".
 */
const refusalMessage = ({ retryAfterSeconds }) => {
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    return 'This screening is very busy right now — that can happen when several '
        + 'people are using the same wifi. Your answers are safe. Please try again in '
        + `about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
};

module.exports = {
    DEFAULT_SALT,
    hashKey,
    WINDOW_MS,
    LIMITS,
    STAFF_LIMITS,
    CALLS_PER_ASSESSMENT,
    UNKNOWN_CALLER,
    callerKey,
    windowIndex,
    counterPath,
    decide,
    planFor,
    staffPlanFor,
    refusalMessage,
    staffRefusalMessage,
};
