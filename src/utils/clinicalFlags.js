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
 * ⚠️ WHAT THIS DELIBERATELY DOES NOT DO: negation. "I do not get chest pain"
 *    still sets `symptomFlag`. That is a false positive in the SAFE direction — it
 *    over-triages to URGENT, which routes the person to a GP rather than to an
 *    exercise programme. Teaching these patterns to read negation risks turning a
 *    safe over-triage into an under-triage on the one absolute contraindication in
 *    the model, and that is a clinical judgement rather than a bug fix. Recorded
 *    as `CD11` in COMMUNITY_TODO.md alongside the double-barrelled question that
 *    causes most of it.
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
export const buildMatcher = (terms) => {
    const latin = terms.filter(isLatin).map(escapeRegex);
    const other = terms.filter((t) => !isLatin(t)).map(escapeRegex);

    const patterns = [];
    if (latin.length > 0) patterns.push(new RegExp(`\\b(${latin.join('|')})\\b`, 'i'));
    if (other.length > 0) patterns.push(new RegExp(`(${other.join('|')})`, 'i'));

    return (text) => {
        const value = String(text || '');
        return patterns.some((pattern) => pattern.test(value));
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
    'stressed', 'stress', 'low', 'overwhelmed',
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

export const isNoPreviousId = (answer) => {
    const value = String(answer || '').trim();
    if (value === '') return true;
    // An ID is alphanumeric with dashes and is not a sentence. If the answer looks
    // like one, it is one — regardless of which letters it happens to contain.
    if (/^[A-Za-z0-9-]{6,}$/.test(value) && /\d/.test(value)) return false;
    return matchesNegative(value);
};
