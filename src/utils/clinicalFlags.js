/**
 * ==============================================================================
 * CLINICAL FLAGS — matching a person's own words, without matching inside them
 * ==============================================================================
 *
 * The chat pathway derives every clinical and SDOH flag by running fixed
 * multilingual regexes over the raw text a respondent typed or tapped
 * (`AuraChat.jsx`, `parseClinicalData`). Those flags feed `calculateRiskScore` and
 * `selectCTA`, so a false match is not cosmetic: it changes which tier a member of
 * the public is routed to.
 *
 * ── WHAT WAS WRONG ───────────────────────────────────────────────────────────
 *
 * Every term was an UNANCHORED substring. `/low/` is the clearest case — it sits
 * inside "slowly", "follow", "allow" and "below" — so
 *
 *     "I walk slowly but I feel great"
 *
 * was flagged as psychological distress and routed to the WELLBEING tier, which
 * sends the person to their polyclinic's mental health service. "I follow a
 * routine" and "I allow myself rest days" did the same. `heart` matched inside
 * "heartfelt", `cost` inside "costume", `alone` inside a surname.
 *
 * Worse, and separately: `previous_id` was tested with the same style of pattern,
 * so a returning respondent whose assessment ID happened to contain the letters
 * "no" — `NX-XKNO4J2` — had it silently discarded and their record linkage lost.
 * Base-36 uppercase IDs contain "NO" often enough for that to be a real rate.
 *
 * ── WHY THE MATCHING IS SPLIT BY SCRIPT ──────────────────────────────────────
 *
 * ⚠️ `\b` IS AN ASCII WORD BOUNDARY AND DOES NOT WORK FOR THE OTHER THREE
 *    LANGUAGES. In JavaScript regex, `\b` is a position between `\w` and non-`\w`,
 *    and `\w` is `[A-Za-z0-9_]`. Chinese and Tamil characters are not `\w`, so
 *    `\b压抑\b` asserts boundaries that are never both true and the term silently
 *    stops matching — which would fail exactly one way: a Chinese or Tamil speaker
 *    reporting distress, and no flag raised.
 *
 *    So Latin terms are word-bounded and non-Latin terms are matched as plain
 *    substrings. That is correct rather than a compromise: the false-positive
 *    problem is a property of alphabetic scripts sharing letter sequences, and
 *    these ideographic and abugida terms do not have it.
 *
 * ── ⚠️ NEGATION: WHY THIS FILE CHANGED ITS MIND — `CP22` ─────────────────────
 *
 * This header used to say negation was deliberately NOT handled, and the argument
 * was a good one: "I do not get chest pain" setting `symptomFlag` is a false
 * positive in the SAFE direction, and teaching a regex to read negation risks
 * turning a safe over-triage into an under-triage on the one absolute
 * contraindication in the model.
 *
 * Two things changed it.
 *
 * FIRST, THE RATE. A pre-merge stress run measured 16 of 22 realistic typed answers
 * setting a flag the answer had just denied — across every matcher, in every
 * language. Not an edge case: the ordinary way people answer a question in prose.
 *
 * SECOND, AND DECISIVELY, WHERE THOSE FLAGS GO NOW. When the argument above was
 * written, an over-triage cost the person a nudge toward a GP. It no longer stops
 * there. The flags are printed on the HANDOVER SLIP — a sheet of paper the person
 * carries to an Active Ageing Centre or a Social Service Office, which states
 * "Chest pain or dizziness on exertion" as something they reported. A tool that
 * prints a denial as a positive finding, to a third party, is not erring on the
 * side of caution; it is putting words in somebody's mouth. The same counts also
 * reach the population rollup a health system plans from.
 *
 * ⚠️ SO THE OLD ARGUMENT IS HONOURED IN THE SHAPE OF THE FIX, NOT DISCARDED.
 *    Suppression is DELIBERATELY TIMID and every rule below exists to keep it that
 *    way: the cue must sit in the same clause, immediately before the term (or
 *    immediately after it in Tamil, where negation is postfix), within a short
 *    window. Any conjunction, comma or full stop between them and the flag STAYS.
 *    "no chest pain and dizziness" still flags — the second symptom is not clearly
 *    covered by the first denial, and when it is ambiguous the flag survives.
 *    Over-triage remains the direction this fails in.
 */

/** True when a term is pure ASCII, and therefore safe to word-bound. */
const isLatin = (term) => /^[\x20-\x7E]+$/.test(term);

/**
 * Escapes regex metacharacters. None of the current terms contain any, but a term
 * list is exactly the kind of constant somebody later adds a `(` to.
 */
const escapeRegex = (term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Builds the matcher for one flag: Latin terms word-bounded, everything else a
 * plain substring. Returns a predicate rather than a RegExp so the split is not
 * something a caller can accidentally undo.
 */
/**
 * Words that turn the term after them into a denial.
 *
 * ⚠️ PREFIX LANGUAGES ONLY. English, Bahasa Melayu and Chinese all negate BEFORE
 *    the thing negated. Tamil does not — it negates after — which is why
 *    `TAMIL_NEGATORS` is separate and searched in the other direction. Guessing
 *    that one rule fits all four is how a Tamil speaker's denial goes unread.
 */
const NEGATORS_BEFORE = [
    // English
    'no', 'not', 'never', 'none', 'nil', 'without', 'lack of',
    "don't", 'dont', "doesn't", 'doesnt', "didn't", 'didnt', "haven't", 'havent',
    "hasn't", 'hasnt', "isn't", 'isnt', "aren't", 'arent', 'cannot',
    'deny', 'denies', 'denied', 'free of', 'ruled out', 'negative for', 'clear of',
    // Bahasa Melayu
    'tiada', 'tidak', 'bukan', 'belum', 'tak',
    // 中文
    '没有', '没', '無', '无', '不', '未', '别',
];

/** Tamil negates after the term: "நெஞ்சு வலி இல்லை" is "chest pain — no". */
const TAMIL_NEGATORS = ['இல்லை', 'இல்ல', 'அல்ல', 'கிடையாது'];

/**
 * English phrases that dismiss the term BEFORE them: "cost is not a problem",
 * "my heart is fine".
 *
 * ⚠️ COMPLETE PHRASES, NOT A GENERAL "is not" RULE, AND THE DIFFERENCE MATTERS ON
 *    THE ONE ABSOLUTE CONTRAINDICATION. A rule that suppressed on any following
 *    "is not" would also suppress "chest pain is not always there" — a person
 *    describing intermittent exertional chest pain — turning a safe over-triage
 *    into exactly the under-triage this file's original header warned about. These
 *    phrases dismiss; "is not …" on its own does not.
 */
const DISMISSALS_AFTER = [
    'not a problem', 'not an issue', 'not a concern', 'not a worry',
    'is fine', 'are fine', 'is okay', 'is ok', 'was fine',
];

/**
 * Where a denial stops carrying. A cue only negates within its own clause: in
 * "no cost issues, but I feel isolated" the "no" must not reach "isolated".
 *
 * ⚠️ `and` BREAKS A DENIAL AND `or` DOES NOT, WHICH IS NOT AN OVERSIGHT.
 *    "no chest pain and dizziness" is genuinely ambiguous in English — plenty of
 *    people mean "no chest pain, and I do have dizziness" — so `and` breaks and the
 *    dizziness flag SURVIVES. "no chest pain or dizziness" is not ambiguous: `or`
 *    after a negative coordinates the denial across both, and it is the phrasing
 *    the clinical safety question itself uses, so it is the most likely thing a
 *    person types. `or` therefore does not break.
 *
 *    "no chest pain and no dizziness" is suppressed on both regardless, because the
 *    second clause carries its own cue.
 */
const CLAUSE_BREAK = /[,;.!?·\n\u2013\u2014]|\b(?:but|however|although|though|except|and|tapi|walaupun)\b|但|不过|然而/gi;

/** How far back a cue may sit and still be reaching this term. */
const WINDOW = 40;

/** The last clause of `text`, capped at `WINDOW` characters. */
const trailingClause = (text) => {
    let cut = 0;
    CLAUSE_BREAK.lastIndex = 0;
    for (let m = CLAUSE_BREAK.exec(text); m !== null; m = CLAUSE_BREAK.exec(text)) {
        cut = m.index + m[0].length;
    }
    return text.slice(Math.max(cut, text.length - WINDOW));
};

/** The first clause of `text`, capped at `WINDOW` characters. */
const leadingClause = (text) => {
    CLAUSE_BREAK.lastIndex = 0;
    const m = CLAUSE_BREAK.exec(text);
    const end = m ? m.index : text.length;
    return text.slice(0, Math.min(end, WINDOW));
};

/**
 * Whether `fragment` carries one of `cues`, at the `edge` nearest the term.
 *
 * ⚠️ LATIN CUES GET A WINDOW; NON-LATIN CUES MUST BE ADJACENT. A Latin denial puts
 *    words between the cue and the thing denied — "never had chest pain" — so the
 *    whole clause is searched. A bare `包`-style substring search cannot be used the
 *    same way: `不` is a negator AND a character inside ordinary words, and
 *    searching the clause for it flipped the Chinese caregiving chip
 *    「感到不知所措 — 照顾」 ("overwhelmed — caregiving") into a denial, because
 *    「不知所措」 contains 不. Chinese and Tamil negation is adjacent to what it
 *    negates — 没有胸痛, நெஞ்சு வலி இல்லை — so adjacency is both correct and safe.
 */
const hasCue = (fragment, cues, edge) => cues.some((cue) => {
    if (isLatin(cue)) {
        // Word-bounded — "no" must not match inside "know" or "another".
        return new RegExp(`(^|[^\\w])${escapeRegex(cue)}([^\\w]|$)`, 'i').test(` ${fragment} `);
    }
    return edge === 'end' ? fragment.trimEnd().endsWith(cue) : fragment.trimStart().startsWith(cue);
});

/** Whether the match at [start, end) in `value` is inside a denial. */
const isNegated = (value, start, end) => {
    const before = trailingClause(value.slice(0, start));
    const after = leadingClause(value.slice(end));
    return hasCue(before, NEGATORS_BEFORE, 'end')
        || hasCue(after, TAMIL_NEGATORS, 'start')
        || hasCue(after, DISMISSALS_AFTER, 'start');
};

export const buildMatcher = (terms) => {
    const latin = terms.filter(isLatin).map(escapeRegex);
    const other = terms.filter((t) => !isLatin(t)).map(escapeRegex);

    const patterns = [];
    if (latin.length > 0) patterns.push(new RegExp(`\\b(${latin.join('|')})\\b`, 'gi'));
    if (other.length > 0) patterns.push(new RegExp(`(${other.join('|')})`, 'gi'));

    return (text) => {
        const value = String(text || '');
        // ⚠️ EVERY occurrence, not the first. "no chest pain, dizziness on stairs"
        //    must still flag: one denied mention does not answer for the others,
        //    and `.test()` returning at the first hit could not see the second.
        return patterns.some((pattern) => {
            pattern.lastIndex = 0;
            for (let m = pattern.exec(value); m !== null; m = pattern.exec(value)) {
                if (!isNegated(value, m.index, m.index + m[0].length)) return true;
            }
            return false;
        });
    };
};

// ── The term lists, unchanged from `parseClinicalData` except where noted ─────

/** Exertional chest pain or dizziness — the one absolute contraindication. */
export const matchesSymptom = buildMatcher([
    'dizziness', 'chest pain', 'pening', 'dada',
    '头晕', '胸痛', 'தலைச்சுற்றல்', 'நெஞ்சு வலி',
]);

/** A chronic condition that modifies programming rather than preventing it. */
export const matchesCondition = buildMatcher([
    'blood pressure', 'prediabetes', 'diabetes', 'heart',
    'darah tinggi', '高血压', '糖尿病', '心脏',
    'உயர் இரத்த', 'நீரிழிவு', 'இதய',
]);

export const matchesFinancialBarrier = buildMatcher([
    'expensive', 'cost', 'afford', 'mahal', 'kos', 'too far', 'jauh',
    '贵', 'செலவு', '太远',
]);

export const matchesSocialIsolation = buildMatcher([
    'isolated', 'alone', 'on my own', 'keseorangan', '孤立', 'தனிமை',
]);

export const matchesPsychologicalDistress = buildMatcher([
    /*
     * ⚠️ `'feel low'`, NOT A BARE `'low'`. Negation handling cannot rescue this one,
     *    because these are not denials — they are the word meaning something else:
     *    "low back pain", "low income household", "my activity level is low" all
     *    flagged psychological distress and routed the person to a mental health
     *    service. Every phrasing that actually means low mood is kept below, so
     *    nothing that should flag stops flagging.
     */
    'stressed', 'stress', 'overwhelmed',
    'feel low', 'feeling low', 'feels low', 'felt low', 'quite low',
    'low mood', 'mood is low', 'mood has been low', 'been low', 'very low',
    'depressed', 'depression', 'hopeless',
    'tertekan', 'murung', 'terbeban',
    '压抑', '不知所措', 'மன அழுத்தம்', 'மனச்சோர்வு', 'அதிக சுமை',
]);

/**
 * Unpaid caregiving strain — its own domain since the wellbeing chip was split.
 *
 * ⚠️ WHY THIS IS SEPARATE FROM PSYCHOLOGICAL DISTRESS. A carer and a person under
 *    financial pressure both answer "overwhelmed", and they need different things:
 *    one needs respite, caregiver support and often a needs assessment for the
 *    person they care for; the other needs subsidies. Merging them into one chip
 *    made the unpaid family carer — who frequently has not yet identified as one —
 *    invisible to the tool. Caregiver strain still counts as distress; it now also
 *    routes on its own.
 *
 * Every term is lifted from the four existing chips, not newly translated.
 */
export const matchesCaregiverStrain = buildMatcher([
    'caregiving', 'caregiver', 'carer',
    'penjagaan',            // ms — "tanggungjawab penjagaan"
    '照顾',                  // zh — "照顾"
    'பராமரிப்பு',            // ta — "பராமரிப்பு"
]);

export const matchesFoodInsecurity = buildMatcher(['yes', 'ya', '是', 'ஆம்']);

export const matchesFemale = buildMatcher(['female', 'perempuan', '女', 'பெண்']);
export const matchesMale = buildMatcher(['male', 'lelaki', '男', 'ஆண்']);

/**
 * ==============================================================================
 * FALLS AND FUNCTION — 60+ only
 * ==============================================================================
 *
 * A Regional Health System reviewer's point: for an older adult being considered
 * for an Active Ageing Centre, falls history and fear of falling matter more than
 * a weekly minutes figure. PAVS alone can route a 75-year-old to "150 minutes a
 * week" without ever asking whether they have fallen.
 *
 * ⚠️ ORDER MATTERS AND IS NOT INTERCHANGEABLE. "No falls" CONTAINS the word
 *    "fall", so a naive matcher reads the safest answer as the riskiest one. The
 *    negative is therefore tested FIRST and returns immediately.
 *
 * `avoidsActivity` is kept separate from the count because fear of falling is its
 * own clinical signal: somebody who has fallen once and now avoids the stairs is
 * at higher risk than somebody who fell once and carried on, and the intervention
 * is different.
 */
const matchesNoFalls = buildMatcher(['no falls', 'none', 'no']);
const matchesTwoOrMore = buildMatcher(['two or more', 'two', 'three', 'more than one', '2+']);
const matchesAvoidance = buildMatcher(['avoid', 'afraid', 'scared', 'stopped']);

/**
 * @returns {{falls: 0|1|2, avoidsActivity: boolean, fallsRisk: boolean, asked: boolean}}
 *   `falls: 2` means "two or more". `asked: false` means the question was not put
 *   to this person — they are under 60, or their language has no translation for
 *   it yet — and MUST NOT be read as "no falls".
 */
const parseFallsAnswer = (answer) => {
    const text = String(answer ?? '').trim();
    if (text === '') return { falls: 0, avoidsActivity: false, fallsRisk: false, asked: false };

    const avoidsActivity = matchesAvoidance(text);
    // ⚠️ The negative first — see the note above.
    if (matchesNoFalls(text) && !avoidsActivity) {
        return { falls: 0, avoidsActivity: false, fallsRisk: false, asked: true };
    }
    const falls = matchesTwoOrMore(text) ? 2 : 1;
    return { falls, avoidsActivity, fallsRisk: true, asked: true };
};

/**
 * Healthier SG enrolment. `null` for "not sure" AND for not asked — both mean the
 * portal does not know, and neither may be read as "not enrolled".
 */
const matchesEnrolledYes = buildMatcher(['yes', 'enrolled', 'i am enrolled']);
const matchesEnrolledNo = buildMatcher(['no', 'not enrolled']);

const parseHealthierSg = (answer) => {
    const text = String(answer ?? '').trim();
    if (text === '') return null;
    if (matchesEnrolledNo(text)) return false;     // "No, not enrolled" — tested first,
    if (matchesEnrolledYes(text)) return true;     // because it contains "enrolled" too
    return null;                                    // "I am not sure"
};

/**
 * Whether the "have you done this before?" answer means NO.
 *
 * ⚠️ NOT A SUBSTRING TEST, AND THAT IS THE WHOLE POINT. The previous version ran
 *    `/(no|none|…)/i` over the raw answer, so an assessment ID containing the
 *    letters "no" — `NX-XKNO4J2` — was read as the word "no" and the linkage was
 *    dropped without a word to the person who had just typed it in.
 *
 *    An empty answer means no. Otherwise the answer must BE a negative word, not
 *    merely contain one.
 */
const NEGATIVE_WORDS = ['no', 'none', 'nope', 'nil', 'tidak', 'tiada', '没', '无', '不', 'இல்லை'];
const matchesNegative = buildMatcher(NEGATIVE_WORDS);

/**
 * The age band an answer describes: `'60+'`, `'41-60'`, `'21-40'` or `'Unknown'`.
 *
 * ⚠️ THIS IS THE `CP26` FIX, AND IT DECIDES WHO GETS SCREENED FOR FALLS.
 *
 * There were two substring tests for age, in two places, and both only recognised
 * the CHIP text:
 *
 *   · the falls step's gate, `/60\s*\+/.test(data.demographics)`
 *   · `parseClinicalData`, `demoStr.includes('60+')` … `includes('41')`
 *
 * The chat renders a free-text input beside the chips and prompts "SELECT AN OPTION
 * OR TYPE FREELY". Measured: `"72"`, `"I am 72"`, `"I am 65 years old"`,
 * `"60 plus"` and `"sixty five"` ALL failed both tests. So a resident who typed
 * their age instead of tapping was never asked whether they had fallen — in the one
 * cohort the falls screen exists for — and also lost the two 60+ call-to-action
 * tiers, because `selectCTA` branches on the same `age` value.
 *
 * The chips in all four languages use Western digits and the same band tokens
 * (`21–40`, `41–60`, `60+`), so one parser serves every language. The en-dash they
 * are written with is normalised first; it is not a hyphen.
 *
 * ⚠️ A RANGE IS READ AS A RANGE. `"41–60"` contains "60" and must NOT become `60+`,
 *    which is why the range is matched before any bare number is considered.
 */
export const parseAgeBand = (answer) => {
    const text = String(answer ?? '')
        .toLowerCase()
        .replace(/[\u2010-\u2015\u2212]/g, '-');   // en/em dash, minus → hyphen

    // 1. An explicit open-ended band, however it is written.
    if (/\b60\s*\+|\b(60|6[1-9]|[7-9]\d|1\d\d)\s*(\+|plus\b|and (over|above)\b)|\b(over|above)\s*(59|60)\b/.test(text)) {
        return '60+';
    }

    // 2. A closed range, classified by its LOWER bound — somebody in "41-60" is not
    //    60+, and reading the upper bound would put them there.
    const range = text.match(/\b(\d{1,3})\s*-\s*(\d{1,3})\b/);
    if (range) {
        const lo = Number(range[1]);
        const hi = Number(range[2]);
        if (lo >= 60) return '60+';
        if (hi <= 40) return '21-40';
        return '41-60';
    }

    // 3. A bare age. Bounded to three digits so a postal code or a year cannot be
    //    read as somebody's age, and to a plausible human range at the top.
    const numbers = (text.match(/\b\d{1,3}\b/g) || []).map(Number).filter((n) => n >= 1 && n <= 120);
    const oldest = numbers.length ? Math.max(...numbers) : null;
    if (oldest === null) return 'Unknown';
    if (oldest >= 60) return '60+';
    if (oldest >= 41) return '41-60';
    if (oldest >= 21) return '21-40';

    // Under 21 has no band in this portal. `Unknown` is honest; inventing the
    // nearest band would put a teenager in an adult cohort in the population data.
    return 'Unknown';
};

/** Whether the falls and function screen applies to this person. */
export const isSixtyPlus = (answer) => parseAgeBand(answer) === '60+';

export { parseFallsAnswer, parseHealthierSg };

export const isNoPreviousId = (answer) => {
    const value = String(answer || '').trim();
    if (value === '') return true;
    // An ID is alphanumeric with dashes and is not a sentence. If the answer looks
    // like one, it is one — regardless of which letters it happens to contain.
    if (/^[A-Za-z0-9-]{6,}$/.test(value) && /\d/.test(value)) return false;
    return matchesNegative(value);
};
