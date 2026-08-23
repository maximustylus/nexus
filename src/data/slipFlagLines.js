/**
 * ==============================================================================
 * SLIP FLAG LINES — what the printed page says the person reported
 * ==============================================================================
 *
 * The ten lines under "Reported" on the handover slip, in four languages.
 *
 * ⚠️ UNLIKE `screeningChips.js`, THESE ARE OUTPUT AND NOT PARSER INPUT, and that
 *    difference is why translating them is safe in a way translating the chips was
 *    not. Nothing reads these back. `parseFallsAnswer` and `parseHealthierSg` work
 *    on the ANSWER a person gave; these render the flag that resulted. Rewording
 *    one changes what a reader sees and nothing else — so there is no parity test
 *    here, and none is needed.
 *
 * ------------------------------------------------------------------------------
 * ⚠️ THE SLIP IS BILINGUAL, NOT TRANSLATED, AND THAT IS A DELIBERATE REVERSAL
 * ------------------------------------------------------------------------------
 *
 * Every other surface in the portal shows ONE language: the person picked it, and
 * they are the only reader. This page is the exception, because it is the only
 * output that leaves with the person and is handed to somebody else.
 *
 * `TRANSLATION-BRIEF.md` names the reason: *"the reader may be a staff member
 * rather than the resident"*. A slip rendered only in Tamil is handed across a
 * counter at an Active Ageing Centre where the working language is English — so
 * translating it outright would make the document LESS usable at the exact moment
 * it has to work, and the person carrying it would have no way to know that.
 *
 * Rendering only English is not the answer either. The lines are assertions about
 * the person — "Psychological distress", "Food insecurity reported" — printed for
 * a stranger to read. Somebody who cannot read them cannot check them, object to
 * them, or decline to hand the page over. That is a dignity problem before it is a
 * translation problem.
 *
 * So each line prints English first, for the receiving service, with the person's
 * own language beneath it, for the person. English leads because the sheet must
 * stay fully readable to the counter staff even when the second line is a script
 * they do not read. When the language IS English the second line is omitted rather
 * than duplicated.
 *
 * ------------------------------------------------------------------------------
 * PROVENANCE
 * ------------------------------------------------------------------------------
 *
 * ⚠️ THE ms/zh/ta STRINGS WERE SUPPLIED BY THE OWNER, AND WHETHER A NATIVE SPEAKER
 *    REVIEWED THEM IS NOT RECORDED HERE BECAUSE IT IS NOT KNOWN. That question is
 *    open in `TRANSLATION-BRIEF.md` along with one specific query on `fallsAvoiding`
 *    in Tamil. Do not upgrade this note to "reviewed" without an answer — an
 *    unverified provenance recorded as verified is worse than one recorded as
 *    unknown, because the next person cannot tell it was ever a question.
 *
 * ⚠️ `CommunityInsightsPanel.jsx` HAS A SIMILAR-LOOKING LABEL MAP AND IS NOT THIS.
 *    It labels POPULATION RATES for staff — "Below 150 min/week", "1–2 room HDB" —
 *    a different set, different wording, always English, never printed. They read
 *    alike and say different things; merging them would force one wording onto two
 *    jobs.
 */

/**
 * Keyed by a stable id rather than by the English text.
 *
 * ⚠️ THE ENGLISH USED TO BE THE KEY — `flags` was an array of strings and the list
 *    rendered `key={f}`. Rewording a line would then have silently changed its
 *    identity, and there is nowhere for a translation to attach to a sentence.
 */
export const SLIP_FLAG_LINES = Object.freeze({
    symptoms: Object.freeze({
        en: 'Chest pain or dizziness on exertion',
        ms: 'Sakit dada atau pening semasa melakukan aktiviti',
        zh: '活动时出现胸痛或头晕',
        ta: 'செயல்பாட்டின் போது நெஞ்சு வலி அல்லது தலைச்சுற்றல்',
    }),
    condition: Object.freeze({
        en: 'Ongoing health condition reported',
        ms: 'Keadaan kesihatan berterusan dilaporkan',
        zh: '报告有持续性健康状况',
        ta: 'தொடர்ச்சியான உடல்நலப் பிரச்சனை தெரிவிக்கப்பட்டுள்ளது',
    }),
    falls: Object.freeze({
        en: 'Fall in the past 12 months',
        ms: 'Pernah jatuh dalam masa 12 bulan yang lalu',
        zh: '过去 12 个月内曾跌倒',
        ta: 'கடந்த 12 மாதங்களில் கீழே விழுந்தது',
    }),
    /**
     * ⚠️ A SEPARATE LINE, NOT A SUFFIX ON `falls`. Fear of falling is its own
     *    clinical signal and a different intervention: somebody who fell once and
     *    now avoids the stairs is at higher risk than somebody who fell once and
     *    carried on. The two are mutually exclusive on the slip — `fearOfFalling`
     *    chooses between them — so a reader never sees both.
     */
    fallsAvoiding: Object.freeze({
        en: 'Fall in the past 12 months, and now avoiding some activities',
        ms: 'Pernah jatuh dalam masa 12 bulan yang lalu, dan kini mengelak beberapa aktiviti',
        zh: '过去 12 个月内曾跌倒，现在会避免一些活动',
        ta: 'கடந்த 12 மாதங்களில் கீழே விழுந்தது, இப்போது சில செயல்பாடுகளைத் தவிர்க்கிறது',
    }),
    caregiver: Object.freeze({
        en: 'Unpaid caregiving strain',
        ms: 'Tekanan tugas penjagaan tanpa bayaran',
        zh: '无酬家庭照护压力',
        ta: 'ஊதியமில்லாப் பராமரிப்புச் சுமை',
    }),
    psychological: Object.freeze({
        en: 'Psychological distress',
        ms: 'Tekanan psikologi',
        zh: '心理困扰',
        ta: 'உளவியல் ரீதியான மன உளைச்சல்',
    }),
    social: Object.freeze({
        en: 'Limited social support',
        ms: 'Sokongan sosial terhad',
        zh: '社会支持有限',
        ta: 'குறைந்த அளவிலான சமூக ஆதரவு',
    }),
    financial: Object.freeze({
        en: 'Cost or distance is a barrier',
        ms: 'Kos atau jarak merupakan penghalang',
        zh: '费用或距离是一个门槛',
        ta: 'செலவு அல்லது தூரம் ஒரு தடையாக உள்ளது',
    }),
    food: Object.freeze({
        en: 'Food insecurity reported',
        ms: 'Ketidakjaminan makanan dilaporkan',
        zh: '报告有饮食保障不稳的问题',
        ta: 'உணவுப் பாதுகாப்பின்மை தெரிவிக்கப்பட்டுள்ளது',
    }),
    notEnrolledHsg: Object.freeze({
        en: 'Not enrolled with a Healthier SG GP',
        ms: 'Belum mendaftar dengan GP Healthier SG',
        zh: '未登记加入 Healthier SG 家庭医生计划',
        ta: 'Healthier SG குடும்ப மருத்துவரிடம் பதிவு செய்யவில்லை',
    }),
});

export const SLIP_FLAG_IDS = Object.freeze(Object.keys(SLIP_FLAG_LINES));

/**
 * One flag id → `{ id, en, translated }` for printing.
 *
 * `translated` is `''` when the language is English or when the id has no string
 * in that language — the caller renders one line instead of two.
 *
 * ⚠️ A MISSING TRANSLATION FALLS BACK TO ENGLISH-ONLY, NEVER TO A BLANK LINE OR TO
 *    ANOTHER LANGUAGE. The slip is the one output somebody carries to a service;
 *    a gap where a sentence should be reads as a system fault, and the English
 *    above it already carries the whole meaning.
 */
export const slipFlagLine = (id, language = 'en') => {
    const entry = SLIP_FLAG_LINES[id];
    if (!entry) return null;
    const translated = language && language !== 'en' ? (entry[language] || '') : '';
    return { id, en: entry.en, translated };
};
