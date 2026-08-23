/**
 * ==============================================================================
 * SCREENING CHIPS — the answer text that is ALSO parser input
 * ==============================================================================
 *
 * Every other quick-reply row in `AuraChat.jsx` lives inline in its language's
 * dictionary, and should. These two do not, and the reason is not tidiness.
 *
 * The falls and Healthier SG chips are read back by `parseFallsAnswer` and
 * `parseHealthierSg` in `src/utils/clinicalFlags.js`, which match TOKENS. Chip text
 * and token list are therefore one artefact in two files, and until these rows were
 * translated that coupling was invisible — the matchers were English-only, and
 * `chatSteps.js` skipped the questions for ms/zh/ta, so nothing ever exercised it.
 *
 * ⚠️ WHAT WOULD HAVE HAPPENED IF THE CHIPS HAD BEEN TRANSLATED ALONE, which is the
 *    obvious way to do this and the reason this module exists:
 *
 *    `matchesNoFalls` was `['no falls', 'none', 'no']`. "Tiada jatuh" matches none
 *    of them, so `parseFallsAnswer` would have fallen through to `falls = 1,
 *    fallsRisk = true`. EVERY Malay, Chinese and Tamil speaker who had never fallen
 *    would have been recorded as having fallen — added to their risk score, shown
 *    on their result, and printed on a handover slip to a community centre as fact.
 *
 *    A question in a language somebody cannot read produces a wrong answer rather
 *    than a missing one; that is why `chatSteps.js` skips it. A chip whose parser
 *    does not speak the same language produces a wrong answer from a question they
 *    CAN read, which is worse, because nothing about it looks incomplete.
 *
 * So the text lives here, beside nothing else, and `clinicalFlags.i18n.test.js`
 * imports both this and the parsers and asserts chip-for-chip parity: chip `n` in
 * every language must parse to exactly what chip `n` in English parses to. Adding a
 * language, or rewording a chip, fails that test rather than the public.
 *
 * ── PROVENANCE ───────────────────────────────────────────────────────────────
 *
 * ⚠️ THE ms/zh/ta STRINGS ARE MACHINE TRANSLATIONS AND HAVE NOT BEEN REVIEWED BY A
 *    NATIVE SPEAKER. That is recorded in `TRANSLATION-BRIEF.md` with a
 *    back-translation of each one, and it is the owner's decision to ship them: the
 *    alternative on the table was continuing to ask nobody, which is what the
 *    portal did for its whole life. These are QUESTIONS rather than clinical
 *    instructions, and a question read slightly oddly is recoverable in a way that
 *    a mistranslated "call 995" is not.
 */

/**
 * Index 13 · falls. FOUR chips, in this order, and the order is load-bearing:
 * `parseFallsAnswer` tests the negative FIRST because "No falls" contains "fall",
 * and the same trap exists in every language.
 *
 *   0 → falls 0, no avoidance      2 → falls 2
 *   1 → falls 1                    3 → falls 1 + avoidsActivity
 */
export const FALLS_CHIPS = Object.freeze({
    en: Object.freeze([
        'No falls',
        'One fall',
        'Two or more falls',
        'A fall, and I now avoid some activities',
    ]),
    ms: Object.freeze([
        'Tiada jatuh',
        'Jatuh satu kali',
        'Jatuh dua kali atau lebih',
        'Pernah jatuh, dan kini saya mengelak sesetengah aktiviti',
    ]),
    zh: Object.freeze([
        '没有跌倒',
        '跌倒一次',
        '跌倒两次或以上',
        '曾经跌倒，现在会避免某些活动',
    ]),
    /**
     * ⚠️ CHIP 2 IS NOT THE MOST NATURAL TAMIL, AND THE PARSER IS WHY.
     *    "two or more" reads best as "இரண்டு அல்லது அதற்கு மேற்பட்ட" — but அல்லது
     *    ("or") begins with அல்ல, a Tamil negator, and Tamil negation is POSTFIX,
     *    so `isNegated` saw a negator immediately after "இரண்டு" and suppressed the
     *    match. The chip parsed as one fall rather than two. Putting முறை between
     *    them keeps the meaning and breaks the adjacency. Found by the parity test,
     *    not by reading it.
     */
    ta: Object.freeze([
        'விழுந்ததில்லை',
        'ஒரு முறை விழுந்தேன்',
        'இரண்டு முறை அல்லது அதிகமாக',
        'விழுந்தேன், இப்போது சில செயல்களைத் தவிர்க்கிறேன்',
    ]),
});

/**
 * Index 14 · Healthier SG enrolment. THREE chips: yes, no, not sure.
 *
 * ⚠️ CHIP 2 MUST PARSE TO `null`, NOT `false`. "I am not sure" means the portal
 *    does not know; "not enrolled" means it does. `CP26` separated them precisely
 *    so a person who did not know was never told they were unenrolled, and the
 *    value decides which programmes they are told they can be referred to.
 *
 *    That is why the non-English "no" tokens in `clinicalFlags.js` are PHRASES.
 *    "Saya tidak pasti" contains `tidak`; a bare `tidak` token would have returned
 *    `false` for it, and `matchesEnrolledNo` is tested first, so nothing downstream
 *    would ever have seen the ambiguity.
 */
export const HSG_CHIPS = Object.freeze({
    en: Object.freeze(['Yes, I am enrolled', 'No, not enrolled', 'I am not sure']),
    ms: Object.freeze(['Ya, saya berdaftar', 'Tidak, saya tidak berdaftar', 'Saya tidak pasti']),
    zh: Object.freeze(['是的，我已登记', '没有登记', '我不确定']),
    ta: Object.freeze([
        'ஆம், நான் பதிவு செய்துள்ளேன்',
        'இல்லை, பதிவு செய்யவில்லை',
        'எனக்குத் தெரியவில்லை',
    ]),
});

/** The languages the portal serves, in the order the switcher shows them. */
export const CHIP_LANGUAGES = Object.freeze(['en', 'ms', 'zh', 'ta']);
