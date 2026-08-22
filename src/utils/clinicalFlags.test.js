/**
 * ==============================================================================
 * CLINICAL FLAGS — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * These flags decide which tier a member of the public is routed to. Every case
 * below is a way the previous unanchored regexes matched inside an ordinary word
 * and changed somebody's result.
 */

import { describe, it, expect } from 'vitest';
import {
    buildMatcher, matchesSymptom, matchesCondition, matchesFinancialBarrier,
    matchesSocialIsolation, matchesPsychologicalDistress, matchesFoodInsecurity,
    matchesFemale, matchesMale, isNoPreviousId,
} from './clinicalFlags';

describe('⚠️ the false positives that routed people to the wrong tier', () => {
    /**
     * `/low/` was unanchored. Each of these sentences was flagged as
     * psychological distress and routed to the WELLBEING tier — the polyclinic's
     * mental health service — for somebody who said they were fine.
     */
    it.each([
        'I walk slowly but I feel great',
        'I follow a routine and it works',
        'I allow myself rest days',
        'below average waiting times',
        'the classes flow nicely',
    ])('no longer flags distress in %j', (text) => {
        expect(matchesPsychologicalDistress(text)).toBe(false);
    });

    it('no longer finds a heart condition in "heartfelt"', () => {
        expect(matchesCondition('heartfelt thanks to the staff')).toBe(false);
        expect(matchesCondition('I wholeheartedly agree')).toBe(false);
    });

    it('no longer finds a cost barrier in "costume"', () => {
        expect(matchesFinancialBarrier('I need a costume for the event')).toBe(false);
    });

    it('no longer finds isolation in a surname', () => {
        expect(matchesSocialIsolation('I go with my friend Malone')).toBe(false);
    });
});

describe('the real signals still match — in every language', () => {
    it.each([
        ['en', 'Dizziness or chest pain when active'],
        ['ms', 'Saya rasa pening bila bersenam'],
        ['zh', '运动时会头晕'],
        ['ta', 'நெஞ்சு வலி இருக்கிறது'],
    ])('%s symptom', (_lang, text) => {
        expect(matchesSymptom(text)).toBe(true);
    });

    it.each([
        ['en', 'I have high blood pressure'],
        ['ms', 'Saya ada darah tinggi'],
        ['zh', '我有糖尿病'],
        ['ta', 'எனக்கு நீரிழிவு உள்ளது'],
    ])('%s condition', (_lang, text) => {
        expect(matchesCondition(text)).toBe(true);
    });

    it.each([
        ['en', 'Feeling quite stressed or low'],
        ['en', 'Overwhelmed — caregiving or financial pressure'],
        ['ms', 'Saya rasa tertekan'],
        ['zh', '感到压抑'],
        ['ta', 'மன அழுத்தம் உள்ளது'],
    ])('%s distress', (_lang, text) => {
        expect(matchesPsychologicalDistress(text)).toBe(true);
    });

    it('matches the exact chip strings the form and chat offer', () => {
        expect(matchesSocialIsolation('I feel quite isolated')).toBe(true);
        expect(matchesSocialIsolation('I mostly manage on my own')).toBe(true);
        expect(matchesFinancialBarrier('Too expensive')).toBe(true);
        expect(matchesFinancialBarrier('Too far away')).toBe(true);
        expect(matchesFoodInsecurity('Yes, this has happened')).toBe(true);
        expect(matchesFoodInsecurity('No, I have always had enough')).toBe(false);
    });
});

describe('⚠️ `\\b` is ASCII-only, which is why the matcher splits by script', () => {
    /**
     * `\b` sits between `\w` and non-`\w`, and `\w` is `[A-Za-z0-9_]`. Chinese and
     * Tamil characters are not `\w`, so word-bounding them makes them stop
     * matching — failing in exactly one direction: a Chinese or Tamil speaker
     * reporting distress, and no flag raised. This asserts the split holds.
     */
    it('matches a non-Latin term with no surrounding whitespace at all', () => {
        expect(matchesPsychologicalDistress('压抑')).toBe(true);
        expect(matchesPsychologicalDistress('我最近很压抑，睡不好')).toBe(true);
        expect(matchesSymptom('胸痛')).toBe(true);
    });

    it('still word-bounds the Latin terms in the same list', () => {
        const m = buildMatcher(['low', '压抑']);
        expect(m('slowly')).toBe(false);
        expect(m('feeling low')).toBe(true);
        expect(m('压抑')).toBe(true);
    });
});

describe('buildMatcher', () => {
    it('is case-insensitive', () => {
        expect(matchesSymptom('CHEST PAIN')).toBe(true);
        expect(matchesPsychologicalDistress('Stressed')).toBe(true);
    });

    it('handles junk without throwing', () => {
        [null, undefined, '', 42, {}].forEach((junk) => {
            expect(() => matchesSymptom(junk)).not.toThrow();
            expect(matchesSymptom(junk)).toBe(false);
        });
    });

    it('escapes regex metacharacters in a term', () => {
        const m = buildMatcher(['c++']);
        expect(() => m('anything')).not.toThrow();
    });

    it('copes with a list that is all Latin, all non-Latin, or empty', () => {
        expect(buildMatcher(['abc'])('abc')).toBe(true);
        expect(buildMatcher(['压抑'])('压抑')).toBe(true);
        expect(buildMatcher([])('anything')).toBe(false);
    });
});

describe('⚠️ isNoPreviousId — an assessment ID is not the word "no"', () => {
    /**
     * The old test was `/(no|none|…)/i` over the raw answer, so a returning
     * respondent whose ID contained the letters "no" had it silently discarded and
     * their record linkage lost. Base-36 uppercase IDs contain "NO" often enough
     * for that to be a real rate, and nothing told them.
     */
    it.each(['NX-XKNO4J2', 'NX-A3NONE1', 'NX-KZ1NOV8', 'nx-b7q2lp4'])('keeps the ID %s', (id) => {
        expect(isNoPreviousId(id)).toBe(false);
    });

    it.each(['no', 'No', 'NONE', 'nope', 'nil', 'tidak', 'tiada', 'இல்லை', '没有'])('reads %j as no', (answer) => {
        expect(isNoPreviousId(answer)).toBe(true);
    });

    it('treats an empty or whitespace answer as no', () => {
        expect(isNoPreviousId('')).toBe(true);
        expect(isNoPreviousId('   ')).toBe(true);
        expect(isNoPreviousId(null)).toBe(true);
        expect(isNoPreviousId(undefined)).toBe(true);
    });

    it('does not mistake a sentence containing "no" for an ID', () => {
        expect(isNoPreviousId('no I have not done this before')).toBe(true);
    });

    /**
     * The ID shape test requires a digit, so a long word is still read as prose
     * rather than mistaken for an identifier.
     */
    it('does not treat a long alphabetic word as an ID', () => {
        expect(isNoPreviousId('nonetheless')).toBe(false);
        expect(isNoPreviousId('NONETHELESS1')).toBe(false);
    });
});

describe('gender — order is load-bearing because male is inside female', () => {
    it('matches each independently', () => {
        expect(matchesFemale('Female, 41–60')).toBe(true);
        expect(matchesMale('Male, 21–40')).toBe(true);
    });

    /**
     * Word-bounding fixes the Latin case — 'female' no longer contains a bounded
     * 'male' — but the caller still tests female first, because the non-Latin
     * terms are plain substrings and 女/男 are distinct anyway.
     */
    it('no longer sees "male" inside "female" for the Latin terms', () => {
        expect(matchesMale('Female, 41–60')).toBe(false);
    });
});
