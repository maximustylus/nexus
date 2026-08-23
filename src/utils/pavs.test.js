/**
 * ==============================================================================
 * PAVS — the number the whole community instrument reports
 * ==============================================================================
 *
 * `days × minutes`. It sets the risk point, the tier banner, the result copy and —
 * through `selectCTA` — which programme a member of the public is routed to.
 *
 * ⚠️ THIS SUITE EXISTS BECAUSE THE LADDER LIVED INSIDE A COMPONENT. `parseClinicalData`
 *    is a module-level `const` in `AuraChat.jsx`, not exported, unreachable without a
 *    React tree. `COMMUNITY_TODO.md` P4.3 had "`parseClinicalData` has no tests" OPEN
 *    for weeks. Four test files name `AuraChat` and none renders it — they read the
 *    file as TEXT and assert on regexes, for a documented reason (jsPDF, html2canvas).
 *
 *    **Source scanning proves a string is present. It cannot prove a number is right.**
 *    All three defects below were invisible to every one of those tests.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import { parsePavsDays, parsePavsMinutes, pavsWeeklyMinutes } from './clinicalFlags';

/**
 * ⚠️ COPIED FROM `ConventionalForm.jsx:184-185`, NOT FROM MEMORY.
 *
 *    `AC15` was found by writing this table out from the form and comparing, rather
 *    than by asserting what the chat "should" return. The post-mortem's `AC3` claimed
 *    the two pathways "agree exactly on all nine chip combinations — verified"; the
 *    probe behind that sentence tested FOUR pairs and never included `45–60 mins`.
 *    An assertion against remembered expectations would have agreed with the bug.
 */
const DAYS_MIDPOINT = { '0 days': 0, '1–2 days': 1.5, '3–4 days': 3.5, '5–7 days': 6 };
const MINS_MIDPOINT = {
    'Less than 20 mins': 15, '20–30 mins': 25, '30–45 mins': 37,
    '45–60 mins': 52, '60+ mins': 65,
};

describe('AC15 — every chip matches the form, including the one that did not', () => {
    it.each(Object.entries(MINS_MIDPOINT))('minutes chip %s = %i in both pathways', (chip, expected) => {
        expect(parsePavsMinutes(chip)).toBe(expected);
    });

    it.each(Object.entries(DAYS_MIDPOINT))('days chip %s = %f in both pathways', (chip, expected) => {
        expect(parsePavsDays(chip)).toBe(expected);
    });

    /**
     * The specific regression, stated on its own so it cannot be lost in a loop.
     * `"45–60 mins"` CONTAINS the substring `"60 min"`, and the old ladder tested
     * `includes('60 min')` first — so a tapped chip overstated session length by 25%.
     */
    it('does not let "45–60 mins" fall into the open-ended 60+ band', () => {
        expect('45–60 mins'.toLowerCase().includes('60 min')).toBe(true);   // the trap
        expect(parsePavsMinutes('45–60 mins')).toBe(52);                    // not 65
    });

    it('all nine day × minute combinations agree with the form', () => {
        for (const [d, dv] of Object.entries(DAYS_MIDPOINT)) {
            for (const [m, mv] of Object.entries(MINS_MIDPOINT)) {
                expect(pavsWeeklyMinutes(d, m), `${d} × ${m}`).toBe(Math.round(dv * mv));
            }
        }
    });
});

describe('AC1 — a typed answer containing "20" is not collapsed to 15', () => {
    it.each([
        ['120 minutes', 120], ['200 minutes', 200], ['220 minutes', 220],
        ['1200 minutes', 1200], ['20 to 40 minutes', 20],
    ])('%s -> %i', (text, expected) => {
        expect(parsePavsMinutes(text)).toBe(expected);
    });

    /**
     * The measured consequence, from the post-mortem. Five days at two hours was
     * recorded as 75 min/week — below the 150 guideline, charged the deficit point,
     * and routed by `selectCTA` to a free six-session BEGINNER programme.
     */
    it('records a ten-hour week as a ten-hour week', () => {
        expect(pavsWeeklyMinutes('5 days', '120 minutes')).toBe(600);
        expect(pavsWeeklyMinutes('5 days', '120 minutes')).toBeGreaterThan(150);
    });

    it('still reads the honest short answers', () => {
        expect(parsePavsMinutes('45 minutes')).toBe(45);
        expect(parsePavsMinutes('90 minutes')).toBe(90);
        // 60 typed is 60. 65 is the midpoint of the OPEN-ENDED band and belongs
        // only to the "60+ mins" chip.
        expect(parsePavsMinutes('60 minutes')).toBe(60);
    });
});

describe('AC2 — an answer written in words is not a zero', () => {
    it.each([
        ['about an hour', 60], ['an hour', 60], ['one hour', 60],
        ['half an hour', 30], ['thirty minutes', 30], ['forty five minutes', 45],
        ['a couple of hours', 120],
    ])('minutes: %s -> %i', (text, expected) => {
        expect(parsePavsMinutes(text)).toBe(expected);
    });

    it.each([
        ['daily', 7], ['every day', 7], ['most days', 5],
        ['weekends only', 2], ['five times a week', 5], ['never', 0],
    ])('days: %s -> %f', (text, expected) => {
        expect(parsePavsDays(text)).toBe(expected);
    });

    /**
     * ⚠️ THE CASE THAT MADE THIS CRITICAL. Somebody who walks an hour every day and
     *    writes it the way people write it scored `pavsScore = 0` — the MAXIMUM
     *    inactivity reading the instrument can produce. `"every day"` survived only
     *    by being one of three literal alternatives in the old regex; `"daily"` was
     *    not on that list. This is `CP1` one layer upstream: an active person
     *    scored as sedentary.
     */
    it('an hour every day is 420 minutes a week, not zero', () => {
        expect(pavsWeeklyMinutes('daily', 'about an hour')).toBe(420);
        expect(pavsWeeklyMinutes('every day', 'an hour')).toBe(420);
    });
});

describe('neither parser can return NaN, in any language, on any input', () => {
    const hostile = [
        '', '   ', null, undefined, 0, NaN, {}, [], true,
        'no idea', '???', 'lots', '一小时', 'setiap hari', 'தினமும்',
        '-5 minutes', '1e999 minutes', '0.5 hours',
    ];

    it.each(hostile)('parsePavsMinutes(%p) is a finite number >= 0', (input) => {
        const n = parsePavsMinutes(input);
        expect(Number.isFinite(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
    });

    it.each(hostile)('parsePavsDays(%p) is a finite number in 0..7', (input) => {
        const n = parsePavsDays(input);
        expect(Number.isFinite(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(7);
    });

    /**
     * ⚠️ THE DAYS CAP IS NOT COSMETIC. A mis-key in the days box — "35 days" —
     *    multiplied by a session length produced an impossible weekly figure that
     *    cleared every tier threshold and reported the person as exceptionally
     *    active. There are seven days in a week.
     */
    it('clamps an impossible number of days rather than believing it', () => {
        expect(parsePavsDays('35 days')).toBe(7);
        expect(parsePavsDays('100')).toBe(7);
    });

    /**
     * An unanswered question is zero activity, which `scoring.js` treats as a
     * deficit rather than as fitness — `CP2`. Asserted so a future "helpful"
     * default cannot quietly turn unknown into healthy.
     */
    it('treats an empty answer as zero, not as unknown-therefore-fine', () => {
        expect(pavsWeeklyMinutes('', '')).toBe(0);
        expect(pavsWeeklyMinutes(null, undefined)).toBe(0);
    });
});
