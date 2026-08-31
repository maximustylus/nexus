/**
 * ==============================================================================
 * MEMBER PROFILE — grade and profession, and where they are allowed to live
 * ==============================================================================
 *
 * Two fields on the Edit Profile screen that do NOT save to the profile. The rule
 * that forces it is one line:
 *
 *     match /users/{userId} { allow get: if isSelf(userId); }
 *
 * Only you can read your own user document, so anything a colleague or the roster
 * engine must see has to live on the membership instead. This suite pins the
 * consequences of that, and the consequences of grade being SELF-SET.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
    GRADE_OPTIONS,
    isValidGrade,
    isValidProfession,
    professionLabel,
    describeGrade,
    buildMemberProfileUpdate,
    buildGradeUpdate,
    validateMemberProfile,
} from './memberProfile';
import { GRADE_SCALE, DEFAULT_GRADE_BANDS, bandOfGrade, NON_NURSING_GRADE_ALIASES } from './rosterEngineV2';
import { MOH_PROFESSION_LEAVES } from '../data/mohAlliedHealth';
import { SUPPORT_AND_ADMIN_ROLES } from '../data/mockData';

describe('the grade vocabulary is the engine\'s, not a second copy', () => {
    /**
     * ⚠️ A SEPARATE LIST WOULD DRIFT, AND THE DRIFT WOULD BE SILENT. A dropdown
     *    offering a grade `bandOfGrade` cannot parse yields `band: null`, which
     *    renders as no sentence and rosters as no band — the person is simply
     *    invisible to the grade floor.
     */
    it('is exactly GRADE_SCALE, by identity', () => {
        expect(GRADE_OPTIONS).toBe(GRADE_SCALE);
    });

    it('every option the dropdown offers resolves to a band', () => {
        const unparseable = GRADE_OPTIONS.filter((grade) => bandOfGrade(grade) === null);
        expect(unparseable, 'these would be selectable and then invisible to the engine').toEqual([]);
    });
});

describe('describeGrade', () => {
    /**
     * ⚠️ THE ASSERTION THAT CAUGHT THE REAL BUG. The first version of the
     *    consequence map used `junior / senior / principal` and had no `nonExempt`
     *    key — so AH7 to AH10, four of the eleven grades and the whole assistant
     *    and associate range, showed NO sentence at all. The person least sure what
     *    a grade means would have been told nothing.
     *
     *    Asserting EVERY grade rather than the three keys somebody thought of is
     *    what makes this catch the next missing band too.
     */
    it('gives every grade in the scale a sentence', () => {
        const silent = GRADE_OPTIONS.filter((grade) => !describeGrade(grade).consequence);
        expect(silent, 'these grades render with no explanation beside them').toEqual([]);
    });

    it('names the band the engine would actually put them in', () => {
        GRADE_OPTIONS.forEach((grade) => {
            expect(describeGrade(grade).band).toBe(bandOfGrade(grade));
        });
    });

    /**
     * The distinction the sentence exists to make: whether the roster can hand you
     * a lead shift. AH7–AH12 cannot lead; AH13 and up can.
     */
    it('says lead shifts are possible for senior and principal, and not below', () => {
        expect(describeGrade('AH12').consequence).toMatch(/will not give you lead/i);
        expect(describeGrade('AH13').consequence).toMatch(/can give you lead/i);
        expect(describeGrade('AH17').consequence).toMatch(/most senior/i);
    });

    /**
     * ⚠️ BANDS ARE A PARAMETER. A department can move its junior/senior boundary,
     *    and a screen describing AH12 as junior while that team's engine calls it
     *    senior would be confidently wrong at the moment somebody relies on it.
     */
    it('respects a team that moved its own boundaries', () => {
        const shifted = { ...DEFAULT_GRADE_BANDS, junior: [11, 11], senior: [12, 14] };
        expect(describeGrade('AH12').band).toBe('junior');
        expect(describeGrade('AH12', shifted).band).toBe('senior');
        expect(describeGrade('AH12', shifted).consequence).toMatch(/can give you lead/i);
    });

    it('is quiet rather than wrong when there is no grade', () => {
        expect(describeGrade('')).toEqual({ grade: '', band: null, consequence: '' });
    });
});

describe('validation', () => {
    /**
     * ⚠️ THE EMPTY STRING IS VALID, DELIBERATELY. Every member document created by
     *    `approveLeadRequest` or `inviteMember` starts with `grade: ''` because
     *    neither knows it. A screen that refused to save until a grade was chosen
     *    would stop somebody fixing their bio.
     */
    it('accepts "not set" for both fields', () => {
        expect(isValidGrade('')).toBe(true);
        expect(isValidProfession('')).toBe(true);
        expect(validateMemberProfile({ grade: '', profession: '' })).toBe('');
    });

    /**
     * The team's own legacy vocabulary. `STAFF_PROFILES` in `SmartAnalysis.jsx`
     * still says JG11–JG16, and somebody typing what they see there must be told
     * why it is refused rather than getting `permission-denied` from Firestore.
     */
    it('refuses the old JG grades by name', () => {
        expect(isValidGrade('JG11')).toBe(false);
        expect(validateMemberProfile({ grade: 'JG11', profession: '' })).toMatch(/AH7–AH17/);
    });

    it.each(['ah13', 'AH 13', 'AH18', 'AH6', '13', 'Senior', null, undefined, 13])(
        'refuses %j',
        (value) => { expect(isValidGrade(value)).toBe(false); },
    );

    /**
     * ⚠️ "AND NOTHING ELSE" NOW MEANS THE PICKER'S WHOLE LIST, not MOH's alone.
     *    Administrators, assistants and associates were added to the picker on
     *    2026-08-31 — "they are the ones who are the roster masters" — and this
     *    validator still built its set from `MOH_PROFESSION_LEAVES`, so the option
     *    appeared, was chosen, and was refused on save. The owner hit it on the first
     *    member they edited. What the assertion pins is unchanged in spirit: exactly
     *    what the picker can emit is accepted, and nothing beyond it.
     */
    it('accepts every profession the picker can emit, and nothing else', () => {
        MOH_PROFESSION_LEAVES.forEach((leaf) => expect(isValidProfession(leaf.id)).toBe(true));
        SUPPORT_AND_ADMIN_ROLES.forEach((role) => expect(isValidProfession(role.id)).toBe(true));
        // The support roles are IN the selectable list and NOT in MOH's — the split
        // that keeps "MOH's own 28" true everywhere else in the app.
        const mohIds = new Set(MOH_PROFESSION_LEAVES.map((leaf) => leaf.id));
        SUPPORT_AND_ADMIN_ROLES.forEach((role) => expect(mohIds.has(role.id)).toBe(false));

        expect(isValidProfession('wizard')).toBe(false);
        expect(validateMemberProfile({ grade: '', profession: 'wizard' })).toMatch(/not one of the professions or roles/i);
    });

    it('accepts the NN spelling of a support grade, and still refuses a sloppy one', () => {
        // NN7–NN10 is the same ladder under the name half the department uses.
        NON_NURSING_GRADE_ALIASES.forEach((grade) => expect(isValidGrade(grade)).toBe(true));
        // …but storage stays canonical: a lexer would take these, a validator must not.
        ['nn8', 'NN 8', 'NN6', 'NN11', 'NN18'].forEach((bad) => expect(isValidGrade(bad)).toBe(false));
    });

    it('renders a stored id as the name a person recognises', () => {
        const leaf = MOH_PROFESSION_LEAVES[0];
        expect(professionLabel(leaf.id)).toBe(leaf.name);
        expect(professionLabel('wizard')).toBe('');
        // …including the roles MOH does not list, which would otherwise render as a
        // raw id like `administrator` on the member row.
        expect(professionLabel('administrator')).toBe('Administrator');
    });
});

describe('buildMemberProfileUpdate — the MEMBERSHIP half', () => {
    /**
     * ⚠️ THE ASSERTION THIS WHOLE REWORK EXISTS FOR. Grade used to be in this
     *    payload. It cannot be, and not only because it would leak: `grade` is no
     *    longer in the member rule's `changedKeys().hasOnly([...])` allowlist, so
     *    including it would fail the ENTIRE write and nobody could save a profile
     *    at all. The privacy fix and the save both depend on this staying empty.
     */
    it('never carries a grade, whatever the form is holding', () => {
        const update = buildMemberProfileUpdate(
            { grade: 'AH17', profession: 'physiotherapist' },
            { profession: '' },
        );
        expect(Object.keys(update)).toEqual(['profession']);
        expect(update.grade).toBeUndefined();
    });

    /**
     * One extra key fails the whole write with `permission-denied`, and the person
     * is told their save failed naming nothing they did. Building from an allowlist
     * is what stops a future form field breaking it silently.
     */
    it('writes only profession, whatever else is in the form object', () => {
        const update = buildMemberProfileUpdate(
            { profession: 'physiotherapist', name: 'X', bio: 'Y', role: 'admin', teamIds: ['a'] },
            {},
        );
        expect(Object.keys(update)).toEqual(['profession']);
    });

    it('returns null when profession did not move, so no round trip is spent', () => {
        expect(buildMemberProfileUpdate(
            { profession: 'physiotherapist' },
            { profession: 'physiotherapist' },
        )).toBeNull();
    });

    /** A member document written before this field existed has no profession. */
    it('treats an absent stored value as empty rather than as unchanged', () => {
        expect(buildMemberProfileUpdate({ profession: 'physiotherapist' }, {}))
            .toEqual({ profession: 'physiotherapist' });
    });

    it('drops a value the MOH list does not have rather than sending it', () => {
        expect(buildMemberProfileUpdate({ profession: 'wizard' }, { profession: '' })).toBeNull();
    });
});

describe('buildGradeUpdate — the PRIVATE half', () => {
    it('returns the grade as its own document body', () => {
        expect(buildGradeUpdate('AH14', 'AH13')).toEqual({ grade: 'AH14' });

        /**
         * ⚠️ `setBy` RECORDS WHETHER, NEVER WHO. A lead can set a colleague's grade
         *    from the TEAM tab, and the person deserves to know a grade they did not
         *    choose is deciding which shifts they lead. A NAMED log of who changed a
         *    colleague's pay grade would be a second sensitive artefact, and is the
         *    reason this document carries no history at all.
         */
    });

    it('stamps setBy only when the caller states it', () => {
        expect(buildGradeUpdate('AH14', 'AH13', null, 'lead'))
            .toEqual({ grade: 'AH14', setBy: 'lead' });
        expect(buildGradeUpdate('AH14', 'AH13', null, 'self'))
            .toEqual({ grade: 'AH14', setBy: 'self' });
    });

    /**
     * ⚠️ NEVER INFERRED, AND A DEFAULT OF 'self' WOULD BE THE WORST ONE. This module
     *    cannot see who is signed in, so a default would silently label every lead
     *    correction as the person's own choice — the exact fact the field exists to
     *    carry, reversed.
     */
    it('omits setBy entirely rather than guessing', () => {
        expect(buildGradeUpdate('AH14', 'AH13')).not.toHaveProperty('setBy');
        expect(buildGradeUpdate('AH14', 'AH13', null, 'nurse')).not.toHaveProperty('setBy');
        expect(buildGradeUpdate('AH14', 'AH13', null, true)).not.toHaveProperty('setBy');
    });

    it('returns null when the grade did not move', () => {
        expect(buildGradeUpdate('AH13', 'AH13')).toBeNull();
    });

    /**
     * The document does not exist until somebody first chooses a grade, so `null`
     * — not `''` — is the state a first-time save starts from.
     */
    it('treats a document that does not exist yet as no grade', () => {
        expect(buildGradeUpdate('AH13', null)).toEqual({ grade: 'AH13' });
    });

    it('lets somebody clear a grade they set by mistake', () => {
        expect(buildGradeUpdate('', 'AH17')).toEqual({ grade: '' });
    });

    it('refuses a value the scale does not have rather than storing it', () => {
        expect(buildGradeUpdate('AH99', 'AH13')).toBeNull();
        expect(buildGradeUpdate('JG11', 'AH13')).toBeNull();
    });

    /**
     * A timestamp so a lead correcting a grade can see when it last moved. No
     * history beyond that, deliberately: a log of who changed a colleague's pay
     * grade and when is a second sensitive artefact, and this split exists to
     * reduce those rather than add one.
     */
    it('stamps the change when given a clock, and stays quiet without one', () => {
        expect(buildGradeUpdate('AH14', 'AH13', '2026-08-23T00:00:00Z'))
            .toEqual({ grade: 'AH14', updatedAt: '2026-08-23T00:00:00Z' });
        expect(buildGradeUpdate('AH14', 'AH13')).toEqual({ grade: 'AH14' });
    });
});
