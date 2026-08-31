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
 * so somebody selecting a principal grade reads "leads shifts" beside it.
 *
 * ⚠️ THE SECOND HALF OF THAT MITIGATION DID NOT EXIST, AND THIS COMMENT USED TO
 *    CLAIM IT DID. It said a lead "sees every grade in the Configure staff table
 *    and can correct it there". A lead does see them — `useTeamGrades` feeds
 *    `staffRowsFromMembers` — but those rows are DERIVED and read-only, so there
 *    was no correction path anywhere in the app. Nobody but the person themselves
 *    could set a grade, which also meant a department could not start rostering
 *    until every member had been chased for one: the exact cost the self-set
 *    decision was taken to avoid.
 *
 *    A lead now sets and corrects both fields from the TEAM tab
 *    (`TeamMembersPanel`), one member at a time. `firestore.rules` already allowed
 *    it — `allow create, update: if isSelf(memberUid) || isLead(teamId)` — so this
 *    was a missing screen rather than a missing permission.
 *
 * ⚠️ AND A GRADE SOMEBODY ELSE SET IS RECORDED AS SUCH, in `setBy`. Not WHO set it
 *    — a named log of who changed a colleague's pay grade is a second sensitive
 *    artefact, and the reason this document carries no history. Just `'self'` or
 *    `'lead'`, which is enough for the profile screen to tell somebody why a grade
 *    they never chose is deciding which shifts they lead.
 */

import { GRADE_SCALE, DEFAULT_GRADE_BANDS, bandOfGrade, NON_NURSING_GRADE_ALIASES } from './rosterEngineV2';
import { SELECTABLE_PROFESSION_LEAVES } from '../data/mockData';

/** `'AH7' … 'AH17'`. The engine's own scale, not a second list that can drift. */
export const GRADE_OPTIONS = GRADE_SCALE;

/**
 * The empty string is a legitimate value and NOT a validation failure.
 *
 * Every member document created by `approveLeadRequest` or `inviteMember` starts
 * with `grade: ''`, because neither of them knows it. A screen that refused to save
 * until a grade was chosen would block somebody from fixing their bio.
 */
/**
 * ⚠️ EXACT MATCH OVER BOTH SPELLINGS — not `parseRank`, and the difference matters.
 *
 *    This was `GRADE_SCALE.includes(value)`, which accepts exactly `AH7`…`AH17`, so
 *    `NN8` — added to the dropdown on 2026-08-31 as the Non-Nursing spelling of the
 *    same grade — rendered as an option and would have been refused on save.
 *
 *    The first fix used `parseRank`, and a test caught it: `parseRank` is a LEXER and
 *    accepts `ah13`, ` AH13 `, `AH07`. Those are fine to READ and wrong to STORE — a
 *    validator whose job is "may this be written to the member document" has to
 *    insist on the canonical spelling, or two members end up with the same grade
 *    written two ways and every comparison downstream has to know that. So: the
 *    scale's own labels, plus the NN aliases, matched exactly.
 */
const STORABLE_GRADES = new Set([...GRADE_SCALE, ...NON_NURSING_GRADE_ALIASES]);

export const isValidGrade = (value) => value === '' || STORABLE_GRADES.has(value);

/**
 * ⚠️ EVERY id THE PICKER CAN EMIT, not only MOH's. Built from
 *    `MOH_PROFESSION_LEAVES` alone, this refused `Administrator` — an option the
 *    picker offers — with "that is not a profession on the MOH allied health list".
 *    One list now decides what the picker offers AND what the validator accepts.
 */
const PROFESSION_IDS = new Set(SELECTABLE_PROFESSION_LEAVES.map((leaf) => leaf.id));

export const isValidProfession = (value) => value === '' || PROFESSION_IDS.has(value);

/** The reader-visible name for a stored profession id, or '' if there is none. */
export const professionLabel = (value) => {
    const leaf = SELECTABLE_PROFESSION_LEAVES.find((entry) => entry.id === value);
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
 * last moved, and `setBy` records WHETHER it was the person or a lead — never
 * which lead. The value itself carries no history, deliberately: a log of who
 * changed a colleague's pay grade and when is a second sensitive artefact.
 */
export const buildGradeUpdate = (grade, current = null, now = null, setBy = null) => {
    if (!isValidGrade(grade)) return null;
    if (grade === (current ?? '')) return null;
    const update = { grade };
    if (now) update.updatedAt = now;
    /**
     * ⚠️ `setBy` IS WRITTEN ONLY WHEN A CALLER STATES IT, and never inferred here.
     *    This module cannot see who is signed in, and a default of `'self'` would
     *    quietly mislabel every lead correction as the person's own choice — which
     *    is precisely the fact the field exists to carry.
     */
    if (setBy === 'self' || setBy === 'lead') update.setBy = setBy;
    return update;
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
        return `"${grade}" is not a grade on the AH7–AH17 scale (NN7–NN10 is accepted for the support grades). Choose one from the list.`;
    }
    if (!isValidProfession(profession)) {
        return 'That is not one of the professions or roles in the list. Choose one from the dropdown.';
    }
    return '';
};
