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
    matchesSocialIsolation, matchesPsychologicalDistress, matchesCaregiverStrain,
    matchesFoodInsecurity,
    matchesFemale, matchesMale, isNoPreviousId,
    parseFallsAnswer, parseHealthierSg,
    parseAgeBand, isSixtyPlus,
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

describe('caregiver strain — its own domain since the chip was split', () => {
    /**
     * ⚠️ THE POINT OF THE SPLIT. "Overwhelmed — caregiving or financial pressure"
     *    was one chip, so a carer and a person under financial pressure gave the
     *    same answer and were routed identically. A Regional Health System reviewer
     *    named the unpaid family carer — who often has not yet identified as one —
     *    as the highest-value entry point in social prescribing, and the tool could
     *    not see them at all.
     */
    it('recognises the caregiving half in every language', () => {
        [
            'Overwhelmed — caregiving',
            'Terbeban — tanggungjawab penjagaan',
            '感到不知所措 — 照顾',
            'அதிக சுமை — பராமரிப்பு',
        ].forEach((chip) => {
            expect(matchesCaregiverStrain(chip), chip).toBe(true);
        });
    });

    it('does NOT fire on the financial half', () => {
        [
            'Overwhelmed — financial pressure',
            'Terbeban — tekanan kewangan',
            '感到不知所措 — 经济压力',
            'அதிக சுமை — நிதி அழுத்தம்',
        ].forEach((chip) => {
            expect(matchesCaregiverStrain(chip), chip).toBe(false);
        });
    });

    /**
     * Both halves are still distress — splitting the referral must not lose the
     * psychological flag that drives the WELLBEING tier.
     */
    it('leaves both halves counting as psychological distress', () => {
        expect(matchesPsychologicalDistress('Overwhelmed — caregiving')).toBe(true);
        expect(matchesPsychologicalDistress('Overwhelmed — financial pressure')).toBe(true);
    });

    it('does not fire on unrelated free text', () => {
        ['I feel good', 'work is busy', 'I care about my health'].forEach((t) => {
            expect(matchesCaregiverStrain(t), t).toBe(false);
        });
    });

    it('catches the words a person types rather than taps', () => {
        expect(matchesCaregiverStrain('I am a caregiver for my mother')).toBe(true);
        expect(matchesCaregiverStrain('caring duties')).toBe(false);   // no bare stem match
    });
});

describe('falls & function — 60+ only', () => {
    /**
     * ⚠️ "No falls" CONTAINS the word "fall". A naive matcher reads the safest
     *    answer as the riskiest one, and routes somebody with no falls into a falls
     *    prevention programme — while eroding trust in every other answer the tool
     *    gives them.
     */
    it('reads "No falls" as no falls', () => {
        expect(parseFallsAnswer('No falls')).toEqual(
            { falls: 0, avoidsActivity: false, fallsRisk: false, asked: true });
    });

    it.each([
        ['One fall', 1, false],
        ['Two or more falls', 2, false],
        ['A fall, and I now avoid some activities', 1, true],
    ])('reads %j as %i fall(s), avoidance=%s', (answer, falls, avoids) => {
        const r = parseFallsAnswer(answer);
        expect(r.falls).toBe(falls);
        expect(r.avoidsActivity).toBe(avoids);
        expect(r.fallsRisk).toBe(true);
    });

    /**
     * ⚠️ NOT ASKED IS NOT "NO FALLS". Under-60s and speakers of a language without
     *    the translation never see this question. Recording them as having no falls
     *    would be inventing a clinical finding, and would make the population data
     *    read as though the whole cohort had been screened.
     */
    it('marks an unasked question as unasked, not as no falls', () => {
        [undefined, null, '', '   '].forEach((answer) => {
            const r = parseFallsAnswer(answer);
            expect(r.asked).toBe(false);
            expect(r.fallsRisk).toBe(false);
        });
    });

    it('treats fear of falling as risk even in free text', () => {
        expect(parseFallsAnswer('I slipped once and now I avoid the stairs').fallsRisk).toBe(true);
        expect(parseFallsAnswer('I slipped once and now I avoid the stairs').avoidsActivity).toBe(true);
    });

    it('does not throw on junk', () => {
        [42, {}, []].forEach((j) => expect(() => parseFallsAnswer(j)).not.toThrow());
    });
});

describe('Healthier SG enrolment', () => {
    it('reads a clear yes and a clear no', () => {
        expect(parseHealthierSg('Yes, I am enrolled')).toBe(true);
        expect(parseHealthierSg('No, not enrolled')).toBe(false);
    });

    /**
     * ⚠️ "No, not enrolled" CONTAINS "enrolled". The negative must be tested first,
     *    or the tool records somebody as enrolled when they said the opposite —
     *    and then withholds the enrolment route they most need.
     */
    it('does not read "No, not enrolled" as enrolled', () => {
        expect(parseHealthierSg('No, not enrolled')).not.toBe(true);
    });

    /**
     * `null` for "not sure" AND for not asked. Neither may become `false`: telling
     * somebody to enrol when they already have is a small annoyance, but recording
     * an unknown as "not enrolled" corrupts the population figure the RHS would
     * plan from.
     */
    it.each(['I am not sure', '', null, undefined])('returns null for %j', (answer) => {
        expect(parseHealthierSg(answer)).toBeNull();
    });
});

describe('⚠️ parseAgeBand — who gets screened for falls · CP26', () => {
    /**
     * THE REGRESSION TEST. The chat renders a free-text input beside the chips and
     * invites its use. Both age tests recognised only the CHIP text, so a resident
     * who typed their age got `Unknown` — no falls screen, and no 60+ CTA tier,
     * because `selectCTA` branches on the same value. This is the population the
     * falls screen was added for.
     */
    it.each(['72', 'I am 72', 'I am 65 years old', '60 plus', 'over 60', '60 and above', '60'])(
        'reads %s as 60+', (typed) => {
            expect(parseAgeBand(typed)).toBe('60+');
            expect(isSixtyPlus(typed)).toBe(true);
        });

    /** The chips, in all four languages — they share Western digits and band tokens. */
    it.each([
        ['Male, 60+', '60+'], ['Female, 60+', '60+'],
        ['Lelaki, 60+', '60+'], ['男, 60+', '60+'], ['ஆண், 60+', '60+'],
        ['Male, 41–60', '41-60'], ['Perempuan, 41–60', '41-60'], ['女, 41–60', '41-60'],
        ['Male, 21–40', '21-40'], ['ஆண், 21–40', '21-40'],
    ])('reads the chip %s as %s', (chip, band) => {
        expect(parseAgeBand(chip)).toBe(band);
    });

    /**
     * ⚠️ A RANGE IS NOT ITS UPPER BOUND. "41–60" contains "60"; reading a bare number
     *    out of it would put every 41-year-old in the 60+ cohort, which is the
     *    mirror-image defect of the one being fixed.
     */
    it('never reads a closed range as 60+', () => {
        expect(parseAgeBand('Male, 41–60')).toBe('41-60');
        expect(parseAgeBand('41-60')).toBe('41-60');
        expect(isSixtyPlus('Female, 41–60')).toBe(false);
    });

    it('places a bare age in the right band', () => {
        expect(parseAgeBand('35')).toBe('21-40');
        expect(parseAgeBand('41')).toBe('41-60');
        expect(parseAgeBand('59')).toBe('41-60');
    });

    /** Under 21 has no band here. Inventing the nearest one would put a teenager in
     *  an adult cohort in the population data. */
    it('returns Unknown rather than guessing for an age below the lowest band', () => {
        expect(parseAgeBand('18')).toBe('Unknown');
    });

    it('is not fooled by a number that is not an age', () => {
        expect(parseAgeBand('560000')).toBe('Unknown');   // a postal code
        expect(parseAgeBand('2026')).toBe('Unknown');     // a year
    });

    it('returns Unknown for nothing, and never throws', () => {
        for (const value of ['', '   ', 'x', null, undefined, 0, [], {}, NaN, true]) {
            expect(() => parseAgeBand(value)).not.toThrow();
            expect(typeof parseAgeBand(value)).toBe('string');
        }
        expect(parseAgeBand('')).toBe('Unknown');
        expect(parseAgeBand(null)).toBe('Unknown');
    });
});

describe('⚠️ a typed answer that DENIES a symptom must not set its flag · CP22', () => {
    /**
     * THE LOAD-BEARING SUITE. The chat renders a free-text input beside the chips
     * and prompts "SELECT AN OPTION OR TYPE FREELY". Before this, a pre-merge stress
     * run measured 16 of 22 realistic typed answers setting the flag they denied.
     *
     * The cost is not a wasted nudge. These flags are printed on the HANDOVER SLIP,
     * which a person carries to a centre, and it states them as things they
     * reported — so a denial became a positive finding handed to a third party.
     */
    it.each([
        [matchesSymptom, 'no chest pain'],
        [matchesSymptom, 'No chest pain or dizziness'],
        [matchesSymptom, 'never had chest pain'],
        [matchesSymptom, 'I do not get dizziness'],
        [matchesSymptom, 'my doctor ruled out chest pain'],
        [matchesCondition, 'no diabetes'],
        [matchesCondition, 'no high blood pressure'],
        [matchesPsychologicalDistress, 'not stressed at all'],
        [matchesPsychologicalDistress, 'no stress'],
        [matchesSocialIsolation, 'I do not live alone'],
        [matchesSocialIsolation, 'never alone, family visits daily'],
        [matchesFinancialBarrier, 'no cost issues'],
        [matchesCaregiverStrain, 'no caregiving duties'],
        [matchesCaregiverStrain, 'not a caregiver'],
    ])('does not fire on %#: "%s"', (matcher, text) => {
        expect(matcher(text.toLowerCase())).toBe(false);
    });

    /** Negation in the other three languages, which do not work like English. */
    it.each([
        [matchesSymptom, 'tiada sakit dada', 'ms — prefix'],
        [matchesSymptom, 'tidak ada sakit dada', 'ms — prefix'],
        [matchesSymptom, '没有胸痛', 'zh — adjacent prefix'],
        [matchesCondition, '没有糖尿病', 'zh — adjacent prefix'],
        [matchesSymptom, 'நெஞ்சு வலி இல்லை', 'ta — POSTFIX, the opposite direction'],
    ])('does not fire on %#: "%s" (%s)', (matcher, text, _why) => {
        expect(matcher(text.toLowerCase())).toBe(false);
    });

    /**
     * ⚠️ THE OTHER HALF, AND THE MORE IMPORTANT ONE. Suppression that swallowed a
     *    real report would turn a safe over-triage into an under-triage on the one
     *    absolute contraindication in the model.
     */
    it.each([
        [matchesSymptom, 'chest pain when I climb stairs'],
        [matchesSymptom, 'dizziness sometimes'],
        [matchesSymptom, 'chest pain is not always there'],
        [matchesSymptom, 'no dizziness but I do get chest pain'],
        [matchesSymptom, 'no chest pain and dizziness on the stairs'],
        [matchesCondition, 'I have diabetes'],
        [matchesPsychologicalDistress, 'I feel low most days'],
        [matchesSocialIsolation, 'I live alone'],
        [matchesFinancialBarrier, 'too expensive for me'],
        [matchesCaregiverStrain, 'I am a caregiver for my mother'],
    ])('STILL fires on %#: "%s"', (matcher, text) => {
        expect(matcher(text.toLowerCase())).toBe(true);
    });

    /**
     * A denial does not carry across a clause boundary. This is what keeps the fix
     * timid: when the sentence changes subject, the flag survives.
     */
    it('a denial does not reach past a comma or a "but"', () => {
        expect(matchesSocialIsolation('no cost issues, but i feel isolated')).toBe(true);
        expect(matchesPsychologicalDistress('no falls. i feel low most days')).toBe(true);
    });

    /**
     * ⚠️ EVERY OCCURRENCE IS CHECKED, NOT THE FIRST. One denied mention does not
     *    answer for the others, and a `.test()` that returned at the first hit could
     *    not see the second.
     */
    it('a denied mention does not excuse a reported one later in the answer', () => {
        expect(matchesSymptom('no chest pain. dizziness on the stairs though')).toBe(true);
    });

    /**
     * ⚠️ 不 IS A NEGATOR AND ALSO A CHARACTER INSIDE ORDINARY WORDS. Searching the
     *    clause for it flipped the Chinese caregiving chip into a denial, because
     *    「不知所措」 ("at a loss") contains it. Non-Latin cues must be ADJACENT.
     */
    it('does not read 不 inside a word as a denial', () => {
        expect(matchesCaregiverStrain('感到不知所措 — 照顾')).toBe(true);
        expect(matchesPsychologicalDistress('感到不知所措')).toBe(true);
    });

    /**
     * ⚠️ THE ACKNOWLEDGED LIMIT, RECORDED SO NOBODY READS THESE AS SOLVED. Both need
     *    semantics rather than pattern matching, and both fail toward over-triage —
     *    the direction this whole file fails in on purpose.
     */
    it('still over-triages the two cases patterns cannot reach', () => {
        // Somebody ELSE's condition.
        expect(matchesCondition('family history of heart disease but i am well')).toBe(true);
        // Answering a different question than the yes/no one that was asked.
        expect(matchesFoodInsecurity('yes i always have enough food')).toBe(true);
    });
});

describe("the term list means what it says — 'low'", () => {
    /**
     * Negation cannot rescue these: they are not denials, they are the word meaning
     * something else. A bare `'low'` routed all three to a mental health service.
     */
    it.each(['low back pain', 'low income household', 'my activity level is low'])(
        'does not read "%s" as psychological distress', (text) => {
            expect(matchesPsychologicalDistress(text)).toBe(false);
        });

    it.each(['i feel low most days', 'feeling quite stressed or low', 'my mood is low', 'i have felt low'])(
        'still reads "%s" as psychological distress', (text) => {
            expect(matchesPsychologicalDistress(text)).toBe(true);
        });
});
