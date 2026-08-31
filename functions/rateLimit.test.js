/**
 * ==============================================================================
 * RATE LIMIT — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * `communityAck` is the one Cloud Function anybody on the internet can reach
 * without an account, deliberately: the community portal is FOR members of the
 * public. `CP6` shrank what an abusive caller reaches — no hospital framing, no
 * schema, 200 output tokens, a 30-second timeout. `CP7` is what bounds how OFTEN.
 *
 * Everything here is either a way somebody could call the endpoint more than the
 * ceiling allows, or a way a REAL person could be refused. The second list is as
 * important as the first: the overwhelming majority of anybody who ever meets this
 * limiter is the thirtieth person on a roadshow wifi, not an attacker.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
    LIMITS,
    STAFF_LIMITS,
    staffPlanFor,
    staffRefusalMessage,
    WINDOW_MS,
    CALLS_PER_ASSESSMENT,
    UNKNOWN_CALLER,
    DEFAULT_SALT,
    callerKey,
    hashKey,
    windowIndex,
    counterPath,
    decide,
    planFor,
    refusalMessage,
} from './rateLimit.js';

// A fixed moment, so window arithmetic is asserted rather than observed.
const NOW = Date.UTC(2026, 7, 23, 10, 30, 0);          // 10:30:00 UTC
const HOUR_START = Date.UTC(2026, 7, 23, 10, 0, 0);

// ── 1. WHO IS BEING COUNTED ──────────────────────────────────────────────────

describe('callerKey', () => {
    /**
     * ⚠️ THE LAST ENTRY OF `x-forwarded-for`, NOT THE FIRST, AND THIS IS THE ONE
     *    THAT DECIDES WHETHER THE LIMITER WORKS AT ALL. Google's front end APPENDS
     *    the address it saw; everything before it was supplied by the caller. Taking
     *    the first entry — the more common reading of this header — would let anybody
     *    reset their own bucket on every request by sending a new fake address.
     */
    it('takes the address the infrastructure appended, not the one the caller sent', () => {
        expect(callerKey('9.9.9.9, 8.8.8.8, 203.0.113.9')).toBe('203.0.113.9');
    });

    it('is not fooled by a single forged entry', () => {
        // A caller sending only their own fake value: Google still appends, so the
        // real address is last. A header with ONE entry and no appended address
        // cannot occur behind the front end — and if it did, it would simply count
        // that value, which is no worse than not counting at all.
        expect(callerKey('evil, 203.0.113.9')).toBe('203.0.113.9');
    });

    it('falls back to the direct address when there is no header', () => {
        expect(callerKey(undefined, '203.0.113.9')).toBe('203.0.113.9');
        expect(callerKey('', '203.0.113.9')).toBe('203.0.113.9');
    });

    /**
     * ⚠️ THE WORST BUG THIS SUITE CAUGHT. `::ffff:203.0.113.9` is what an IPv4
     *    client looks like arriving on a dual-stack socket, which is routine. The
     *    IPv6 branch rejected it as malformed (it contains dots), so every IPv4
     *    caller in the country fell into the SINGLE shared `_unattributable` bucket
     *    together — and the per-caller ceiling would then have refused the whole
     *    public, from one busy hour, with a message about wifi.
     */
    it('treats an IPv4-mapped IPv6 address as the IPv4 address it is', () => {
        expect(callerKey('', '::ffff:203.0.113.9')).toBe('203.0.113.9');
        expect(callerKey('', '::FFFF:203.0.113.9')).toBe('203.0.113.9');
        expect(callerKey('', '::ffff:203.0.113.9')).toBe(callerKey('', '203.0.113.9'));
    });

    it('does not merge two IPv4 callers just because they arrived mapped', () => {
        expect(callerKey('', '::ffff:1.1.1.1')).not.toBe(callerKey('', '::ffff:2.2.2.2'));
    });

    it('sends a junk value to the shared bucket rather than giving it one of its own', () => {
        // Not a way past the ceiling — it is still one bucket per distinct value —
        // but it IS a way to create unbounded documents in `rate_limits` by sending
        // a new junk value each time.
        expect(callerKey('', 'not-an-ip')).toBeNull();
        expect(callerKey('', 'kkh.com.sg')).toBeNull();
    });

    it('strips a port', () => {
        expect(callerKey('', '203.0.113.9:44321')).toBe('203.0.113.9');
        expect(callerKey('', '[2001:db8::1]:44321')).toBe('2001:db8:0:0::/64');
    });

    describe('IPv6 is counted as a /64', () => {
        /**
         * A residential IPv6 allocation is routinely a /64 or larger. Counting full
         * addresses would give one subscriber 18 quintillion buckets and a ceiling
         * that never triggers.
         */
        it('collapses a subscriber prefix to one bucket', () => {
            expect(callerKey('', '2001:db8:abcd:1234:5678::1'))
                .toBe(callerKey('', '2001:db8:abcd:1234:ffff::9999'));
        });

        /**
         * ⚠️ `::` HAS TO BE EXPANDED, AND THE FIRST DRAFT DID NOT DO IT. It used
         *    `split(':').slice(0,4).filter(Boolean)`, and `filter(Boolean)` is
         *    exactly what discards the zero groups `::` stands for — so
         *    `2001:db8::1` produced `2001:db8:1::/64`, a DIFFERENT subnet from the
         *    one it is in. An attacker could then multiply their quota simply by
         *    writing addresses in different compressed forms.
         */
        it('agrees across every way of writing the same address', () => {
            const forms = [
                '2001:db8::1',
                '2001:0db8:0000:0000:0000:0000:0000:0001',
                '2001:db8:0:0::1',
                '2001:0db8::0001',
            ];
            const keys = new Set(forms.map((form) => callerKey('', form)));
            expect([...keys]).toEqual(['2001:db8:0:0::/64']);
        });

        it('does not merge two genuinely different /64s', () => {
            expect(callerKey('', '2001:db8:0:1::1')).not.toBe(callerKey('', '2001:db8:0:2::1'));
            // The case the buggy version got wrong: `2001:db8::1` is in :0:0, not :0:1.
            expect(callerKey('', '2001:db8::1')).not.toBe(callerKey('', '2001:db8:0:1::'));
        });
    });

    /**
     * ⚠️ AN UNKNOWN CALLER IS NOT AN EXEMPT ONE. The first draft treated "no usable
     *    address" as "cannot count, therefore allow", which is a bypass anybody
     *    could reach by removing a header. Everything unattributable now shares one
     *    bucket instead.
     */
    it.each([undefined, null, '', '   ', ',,', 0, [], {}])('returns null for %j', (value) => {
        expect(callerKey(value, value)).toBeNull();
    });

    it('sends an unattributable caller to a shared bucket rather than past the gate', () => {
        const plan = planFor({ callerKey: null, appCheckVerified: false, nowMs: NOW });
        expect(plan.caller.attributable).toBe(false);
        expect(plan.caller.path[1]).toContain(hashKey(UNKNOWN_CALLER));
        expect(plan.caller.limit).toBe(LIMITS.unverified);
    });
});

// ── 2. THE ADDRESS MUST NOT REACH A DOCUMENT ID ──────────────────────────────

describe('what is actually stored', () => {
    /**
     * ⚠️ `rate_limits/caller__203.0.113.9__489012` is a record that somebody at that
     *    address used a PUBLIC HEALTH SCREENING in that hour. No client can read the
     *    collection, which is necessary and is not the same as not storing it. This
     *    project has already shipped one claim of that shape and had to fix it
     *    (`CP3`: "de-identified at the point of capture", written beside
     *    `clientReference: navigator.userAgent`).
     */
    it('never puts an address in the path', () => {
        const plan = planFor({ callerKey: '203.0.113.9', appCheckVerified: false, nowMs: NOW });
        expect(JSON.stringify(plan)).not.toContain('203.0.113.9');
    });

    it('never returns the address alongside the plan either', () => {
        const plan = planFor({ callerKey: '203.0.113.9', appCheckVerified: false, nowMs: NOW });
        expect(plan.caller.key).toBeUndefined();
    });

    it('is stable within a window, so the counter accumulates', () => {
        const a = planFor({ callerKey: '203.0.113.9', nowMs: HOUR_START + 1 });
        const b = planFor({ callerKey: '203.0.113.9', nowMs: HOUR_START + WINDOW_MS - 1 });
        expect(a.caller.path).toEqual(b.caller.path);
    });

    it('changes at the window boundary, so the counter resets without a job running', () => {
        const a = planFor({ callerKey: '203.0.113.9', nowMs: HOUR_START + WINDOW_MS - 1 });
        const b = planFor({ callerKey: '203.0.113.9', nowMs: HOUR_START + WINDOW_MS });
        expect(a.caller.path).not.toEqual(b.caller.path);
    });

    it('distinguishes two callers', () => {
        expect(planFor({ callerKey: '1.1.1.1', nowMs: NOW }).caller.path)
            .not.toEqual(planFor({ callerKey: '2.2.2.2', nowMs: NOW }).caller.path);
    });

    /**
     * The honest limit, asserted rather than left in a comment: with the built-in
     * salt this is obfuscation. The IPv4 space is 2^32 — anybody with the salt and
     * the database enumerates it in seconds. `RATE_LIMIT_SALT` is what makes the
     * tokens irreversible, and this proves the parameter actually changes them.
     */
    it('a deployment salt changes every token', () => {
        expect(hashKey('203.0.113.9', 'a-real-secret')).not.toBe(hashKey('203.0.113.9', DEFAULT_SALT));
    });

    it('the sweep can recover the window from the id alone', () => {
        // `expireCommunityAssessments` parses the trailing segment rather than
        // reading a field, so a document whose write was interrupted before the
        // field landed is still collectable.
        const [, id] = counterPath('caller', '203.0.113.9', 489012);
        expect(Number(id.split('__').pop())).toBe(489012);
    });
});

// ── 3. THE DECISION ──────────────────────────────────────────────────────────

describe('decide', () => {
    it('allows below the ceiling and refuses at it', () => {
        expect(decide({ count: 299, limit: 300, nowMs: NOW }).allowed).toBe(true);
        expect(decide({ count: 300, limit: 300, nowMs: NOW }).allowed).toBe(false);
        expect(decide({ count: 5000, limit: 300, nowMs: NOW }).allowed).toBe(false);
    });

    it('treats a missing count as zero — an absent document is a fresh window', () => {
        expect(decide({ count: undefined, limit: 300, nowMs: NOW }).allowed).toBe(true);
        expect(decide({ count: null, limit: 300, nowMs: NOW }).used).toBe(0);
    });

    /**
     * ⚠️ A LIMIT THAT IS NOT A NUMBER REFUSES, RATHER THAN ALLOWING. `NaN` compares
     *    false against everything, so `used < NaN` is false and the call is refused
     *    — which is the correct direction, and this pins it so a later rewrite that
     *    flips the comparison cannot quietly open the endpoint.
     */
    it.each([undefined, null, NaN, 'lots', {}])('refuses when the limit is %j', (limit) => {
        expect(decide({ count: 0, limit, nowMs: NOW }).allowed).toBe(false);
    });

    it('reports when the window ends, not a fixed backoff', () => {
        expect(decide({ count: 999, limit: 1, nowMs: HOUR_START }).retryAfterSeconds).toBe(3600);
        expect(decide({ count: 999, limit: 1, nowMs: HOUR_START + 3599 * 1000 }).retryAfterSeconds).toBe(1);
    });

    it('never reports zero seconds, which would read as "retry immediately"', () => {
        expect(decide({ count: 9, limit: 1, nowMs: HOUR_START + WINDOW_MS - 1 }).retryAfterSeconds)
            .toBeGreaterThanOrEqual(1);
    });
});

// ── 4. THE CEILINGS, AND THE REAL PEOPLE BEHIND THEM ─────────────────────────

describe('the ceilings are shaped for a roadshow, not for one user', () => {
    /**
     * ⚠️ ONE ASSESSMENT IS THIRTEEN CALLS. A "10 per hour" rule — the obvious first
     *    guess — breaks a single person halfway through their first screening.
     */
    it('lets one person finish a screening many times over', () => {
        expect(LIMITS.unverified / CALLS_PER_ASSESSMENT).toBeGreaterThan(20);
    });

    /**
     * A community roadshow, a polyclinic waiting room or a school hall puts dozens
     * of people behind ONE public address. The per-caller ceiling is not trying to
     * stop a crowd; it is trying to stop a loop.
     */
    it('supports a room of twenty people all screening at once', () => {
        expect(LIMITS.unverified).toBeGreaterThanOrEqual(20 * CALLS_PER_ASSESSMENT);
    });

    it('gives an attested caller more room than an unattested one', () => {
        expect(LIMITS.verified).toBeGreaterThan(LIMITS.unverified);
        expect(planFor({ callerKey: 'x', appCheckVerified: true, nowMs: NOW }).caller.limit)
            .toBe(LIMITS.verified);
        expect(planFor({ callerKey: 'x', appCheckVerified: false, nowMs: NOW }).caller.limit)
            .toBe(LIMITS.unverified);
    });

    /**
     * The global ceiling is the only thing that bounds the bill when an attacker has
     * many addresses — but it must sit well above any plausible real day, because
     * hitting it refuses everybody in the country at once.
     */
    it('the global ceiling is far above one caller and far above a busy day', () => {
        expect(LIMITS.global).toBeGreaterThan(LIMITS.verified * 5);
        // 6000 calls ≈ 460 complete assessments in one hour.
        expect(LIMITS.global / CALLS_PER_ASSESSMENT).toBeGreaterThan(400);
    });

    it('warns before it refuses, because by then the money is spent', () => {
        expect(LIMITS.globalWarnAt).toBeGreaterThan(0);
        expect(LIMITS.globalWarnAt).toBeLessThan(1);
    });
});

// ── 5. WHAT THE PERSON READS ─────────────────────────────────────────────────

describe('the refusal a member of the public sees', () => {
    const message = refusalMessage({ retryAfterSeconds: 900 });

    it('gives a real wait', () => {
        expect(message).toContain('15 minutes');
    });

    it('pluralises', () => {
        expect(refusalMessage({ retryAfterSeconds: 30 })).toContain('1 minute.');
        expect(refusalMessage({ retryAfterSeconds: 30 })).not.toContain('1 minutes');
    });

    /**
     * It has to be true and it has to not blame them. Almost everybody who ever sees
     * this is the thirtieth person on one wifi.
     */
    it('names the shared connection rather than accusing the reader', () => {
        expect(message).toMatch(/same wifi/i);
        expect(message).not.toMatch(/limit|abuse|blocked|denied|too many/i);
    });

    it('says their answers are safe, because that is the thing they will worry about', () => {
        expect(message).toMatch(/answers are safe/i);
    });
});

// ── 6. WINDOW ARITHMETIC ─────────────────────────────────────────────────────

describe('windowIndex', () => {
    it('is constant across an hour and increments at the boundary', () => {
        expect(windowIndex(HOUR_START)).toBe(windowIndex(HOUR_START + WINDOW_MS - 1));
        expect(windowIndex(HOUR_START + WINDOW_MS)).toBe(windowIndex(HOUR_START) + 1);
    });

    it('is an integer, so it can be compared by the sweep', () => {
        expect(Number.isInteger(windowIndex(NOW))).toBe(true);
    });
});

// ─── AU14 · the staff side ────────────────────────────────────────────────────

describe('staffPlanFor — one budget per uid across the authenticated endpoints', () => {
    const NOW = 1756000000000;

    it('buckets by uid with the per-user ceiling', () => {
        const plan = staffPlanFor({ uid: 'uid-abc123', nowMs: NOW });
        expect(plan.caller.attributable).toBe(true);
        expect(plan.caller.limit).toBe(STAFF_LIMITS.perUser);
        expect(plan.global.limit).toBe(STAFF_LIMITS.global);
    });

    it('does not put the uid itself in the document id', () => {
        // Same convention as the community side: `rate_limits` must not become a
        // readable log of who used AURA and when.
        const plan = staffPlanFor({ uid: 'uid-abc123', nowMs: NOW });
        expect(plan.caller.path.join('/')).not.toContain('uid-abc123');
        expect(plan.caller.path[1]).toMatch(/^staff__[0-9a-f]{32}__\d+$/);
    });

    it('separates two uids and separates staff from community buckets', () => {
        const a = staffPlanFor({ uid: 'uid-a', nowMs: NOW });
        const b = staffPlanFor({ uid: 'uid-b', nowMs: NOW });
        expect(a.caller.path[1]).not.toBe(b.caller.path[1]);
        // Identical key text under the two scopes must still be distinct docs.
        const community = planFor({ callerKey: 'uid-a', appCheckVerified: false, nowMs: NOW });
        expect(a.caller.path[1]).not.toBe(community.caller.path[1]);
        expect(a.global.path[1]).not.toBe(community.global.path[1]);
    });

    it.each([[undefined], [null], [''], [42]])(
        'a missing or junk uid (%s) shares the unattributable bucket with the tight limit',
        (uid) => {
            const plan = staffPlanFor({ uid, nowMs: NOW });
            expect(plan.caller.attributable).toBe(false);
            // Cannot-count must never mean allow — the community limiter's rule.
            expect(plan.caller.limit).toBe(STAFF_LIMITS.perUser);
            expect(plan.caller.path[1]).toBe(
                staffPlanFor({ uid: undefined, nowMs: NOW }).caller.path[1],
            );
        },
    );

    it('rolls to a fresh document each window, so expiry is deletion not comparison', () => {
        const before = staffPlanFor({ uid: 'uid-a', nowMs: NOW });
        const after = staffPlanFor({ uid: 'uid-a', nowMs: NOW + WINDOW_MS });
        expect(before.caller.path[1]).not.toBe(after.caller.path[1]);
    });

    it('the ceilings encode the reasoning: chat-speed generous, loop-speed fatal', () => {
        // 120/hour = a reply every 30 seconds for two hours, which no human chat
        // has ever needed; a 1-call-per-second loop is refused within 2 minutes.
        expect(STAFF_LIMITS.perUser).toBe(120);
        expect(STAFF_LIMITS.perUser).toBeLessThan(LIMITS.unverified);
        expect(STAFF_LIMITS.global).toBeGreaterThan(STAFF_LIMITS.perUser * 10);
    });
});

describe('staffRefusalMessage — staff wording, not roadshow wording', () => {
    it('names the cost ceiling and a real wait, and does not blame the network', () => {
        const msg = staffRefusalMessage({ retryAfterSeconds: 1800 });
        expect(msg).toContain('30 minutes');
        expect(msg.toLowerCase()).toContain('cost');
        expect(msg.toLowerCase()).not.toContain('wifi');
        expect(msg.toLowerCase()).not.toContain('connection');
    });

    it('never says a fraction of a minute', () => {
        expect(staffRefusalMessage({ retryAfterSeconds: 10 })).toContain('1 minute');
    });
});
