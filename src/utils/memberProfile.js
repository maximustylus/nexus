/**
 * ==============================================================================
 * MEMBER PROFILE — the two fields a person sets about themselves, in two places
 * ==============================================================================
 *
 * Grade and profession. Everything else on the Edit Profile screen — display name,
 * department/ward, bio, password, notification preference — lives on
 * `users/{uid}`, the person's own private record. These two do not, and they do
 * not live in the SAME place as each other either. Three documents, and each
 * boundary is forced by a rule rather than chosen:
 *
 *   users/{uid}                      allow get: if isSelf(userId)
 *       Only you can read it. So anything a colleague or the roster engine must
 *       see cannot be here — Nisa opening Configure would get permission-denied
 *       on every member.
 *
 *   teams/{teamId}/members/{uid}     allow get, list: if isMember(teamId)
 *       PROFESSION lives here. The whole team can read it, which is the point: a
 *       rehab team needs to see it has three physiotherapists and one
 *       occupational therapist. A profession is on somebody's badge and grants
 *       nothing.
 *
 *   teams/{teamId}/grades/{uid}      allow get: if isSelf(uid) || isLead(teamId)
 *       GRADE lives here, alone.
 *
 * ------------------------------------------------------------------------------
 * ⚠️ WHY GRADE NEEDED ITS OWN DOCUMENT: RULES CANNOT HIDE A FIELD
 * ------------------------------------------------------------------------------
 *
 * The first version of this module put grade on the membership beside profession,
 * and that was wrong in a way that is easy to miss: Firestore grants access per
 * DOCUMENT. There is no field-level read. A member who may `get` the membership
 * reads every field on it — so a grade stored there is a grade every colleague in
 * the department can read, and no amount of hiding it in the UI changes that.
 *
 * Pay grade is the most sensitive thing somebody volunteers about themselves short
 * of the wellbeing log. "The roster needs it" justifies the roster reading it; it
 * does not extend to the team browsing it. So it is a document a colleague cannot
 * open, read by the person and by a lead — a lead because `generateRosterV2` runs
 * in their browser and `bandOfGrade` decides who may lead a shift, so a lead who
 * cannot read grades cannot roster at all.
 *
 * ⚠️ AND THE PROTECTION IS PARTIAL, WHICH IS WORTH STATING RATHER THAN IMPLYING.
 *    The engine gives lead shifts to the senior and principal bands, so a published
 *    roster still tells an attentive reader roughly which band somebody is in. What
 *    this withholds is the NUMBER — and the distance between "rosters as a senior"
 *    and "is an AH14" is most of what makes the number uncomfortable to have on
 *    display beside your name.
 *
 * ------------------------------------------------------------------------------
 * ⚠️ GRADE IS SELF-SET, AND THAT IS A DECISION WITH A COST
 * ------------------------------------------------------------------------------
 *
 * `bandOfGrade` turns a grade into a band, and the band decides who may LEAD a
 * shift. So somebody who selects `AH15` starts receiving lead duties, and nothing
 * flags it — not a log, not a banner, not a review step. The owner chose this over
 * lead-set-only because the alternative makes a roster master chase twenty people
 * for a fact each of them knows about themselves.
 *
 * The mitigation is HONESTY AT THE POINT OF CHOOSING rather than a permission:
 * `describeGrade` returns the band and, in plain words, what it means for duties,
 * so somebody selecting a principal grade reads "leads shifts" beside it. The
 * second half is that a lead sees every grade in the Configure staff table — at
 * the moment a wrong one would actually matter — and can correct it there.
 */

import { GRADE_SCALE, DEFAULT_GRADE_BANDS, bandOfGrade } from './rosterEngineV2';
import { MOH_PROFESSION_LEAVES } from '../data/mohAlliedHealth';

/** `'AH7' … 'AH17'`. The engine's own scale, not a second list that can drift. */
export const GRADE_OPTIONS = GRADE_SCALE;

/**
 * The empty string is a legitimate value and NOT a validation failure.
 *
 * Every member document created by `approveLeadRequest` or `inviteMember` starts
 * with `grade: ''`, because neither of them knows it. A screen that refused to save
 * until a grade was chosen would block somebody from fixing their bio.
 */
export const isValidGrade = (value) => value === '' || GRADE_SCALE.includes(value);

const PROFESSION_IDS = new Set(MOH_PROFESSION_LEAVES.map((leaf) => leaf.id));

export const isValidProfession = (value) => value === '' || PROFESSION_IDS.has(value);

/** The reader-visible name for a stored profession id, or '' if there is none. */
export const professionLabel = (value) => {
    const leaf = MOH_PROFESSION_LEAVES.find((entry) => entry.id === value);
    return leaf ? leaf.name : '';
};

/**
 * What a band means for duties, in the words somebody choosing a grade needs.
 *
 * Deliberately about DUTIES rather than seniority. "Senior" is a label somebody can
 * feel entitled to; "the engine will give you lead shifts" is a consequence they
 * can check against their actual job.
 */
/*
 * ⚠️ THE KEYS ARE THE ENGINE'S BAND NAMES, AND THE FIRST DRAFT INVENTED THEM.
 *    It used `junior / senior / principal` and was missing `nonExempt` entirely —
 *    so AH7 to AH10, which is four of the eleven grades and the whole assistant
 *    and associate range, showed NO sentence at all. The person most likely to be
 *    unsure what a grade means would have been told nothing.
 *
 *    `DEFAULT_GRADE_BANDS` is `{ nonExempt: [7,10], junior: [11,12],
 *    senior: [13,14], principal: [15,17] }`, measured rather than remembered.
 *    `describeGrade` falls back to '' for an unknown key, which is why the gap was
 *    silent — so the test below asserts EVERY grade in the scale produces a
 *    sentence, rather than asserting the three keys somebody thought of.
 */
const BAND_CONSEQUENCE = Object.freeze({
    nonExempt: 'The roster will not give you lead shifts.',
    junior: 'The roster will not give you lead shifts.',
    senior: 'The roster can give you lead shifts.',
    principal: 'The roster can give you lead shifts, including the ones that need the most senior person on.',
});

/**
 * `'AH13'` → `{ grade, band, consequence }`, using the team's own band boundaries
 * when it has them and the defaults when it does not.
 *
 * ⚠️ THE BANDS ARE A PARAMETER, NOT A CONSTANT. A department can move the
 *    junior/senior boundary in its roster configuration, and a screen that
 *    described AH12 as junior while that team's engine treated it as senior would
 *    be confidently wrong at exactly the moment somebody was relying on it.
 */
export const describeGrade = (grade, bands = DEFAULT_GRADE_BANDS) => {
    if (!grade) return { grade: '', band: null, consequence: '' };
    const band = bandOfGrade(grade, bands);
    return {
        grade,
        band,
        consequence: band ? (BAND_CONSEQUENCE[band] || '') : '',
    };
};

/**
 * What belongs on the MEMBERSHIP — profession, and nothing else now.
 *
 * ⚠️ THE SHAPE IS THE SECURITY BOUNDARY HERE, not a convenience. The member rule is
 *    `changedKeys().hasOnly(['skills','unavailable','title','profession'])` — so a
 *    write carrying one extra key is refused ENTIRELY, and the person's profile
 *    save fails with a permission error naming nothing they did. Building the
 *    payload from an allowlist is what stops a future form field silently breaking
 *    the save.
 *
 * ⚠️ AND `grade` MUST NOT APPEAR IN IT. It was here, and its removal is the whole
 *    privacy change: including it again would not merely leak the value, it would
 *    make every save fail, because `grade` is no longer in the rule's allowlist.
 *
 * Returns `null` when nothing changed, so a caller can skip the write rather than
 * spend a round trip confirming two strings are still equal.
 */
export const buildMemberProfileUpdate = ({ profession }, current = {}) => {
    if (!isValidProfession(profession)) return null;
    if (profession === (current.profession ?? '')) return null;
    return { profession };
};

/**
 * What belongs in the GRADE document — a whole document, not a field.
 *
 * `setDoc(..., { merge: true })` territory: the document does not exist until
 * somebody first chooses a grade, so there is nothing to seed and nothing to
 * migrate. `updatedAt` is written so a lead correcting a grade can see when it
 * last moved; the value itself carries no history, deliberately — a log of who
 * changed a colleague's pay grade and when is a second sensitive artefact.
 */
export const buildGradeUpdate = (grade, current = null, now = null) => {
    if (!isValidGrade(grade)) return null;
    if (grade === (current ?? '')) return null;
    return now ? { grade, updatedAt: now } : { grade };
};

/**
 * Why a save was refused, as a sentence, or '' when it is fine.
 *
 * Checked before the write rather than after, because the Firestore error for a
 * disallowed value is `permission-denied` — which is true, useless, and reads to a
 * clinician as though their account is broken.
 */
export const validateMemberProfile = ({ grade, profession }) => {
    if (!isValidGrade(grade)) {
        return `"${grade}" is not a grade on the AH7–AH17 scale. Choose one from the list.`;
    }
    if (!isValidProfession(profession)) {
        return 'That is not a profession on the MOH allied health list. Choose one from the list.';
    }
    return '';
};
