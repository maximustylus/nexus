/**
 * ==============================================================================
 * THE MOH NAHS LIST — 28 ALLIED HEALTH PROFESSIONS
 * ==============================================================================
 *
 * The authoritative Singapore Ministry of Health / National Allied Health
 * Services taxonomy, transcribed from the published list supplied by the roster
 * owner. This module is the VOCABULARY for the arrangement picker: who the
 * professions are, what each is officially called, and how they nest.
 *
 * WHY THIS REPLACED AN INVENTED LIST. The picker previously offered names I had
 * chosen — "Medical Laboratory", "Cardiology", "Physiotherapy". Those are
 * paraphrases of departments. MOH names PRACTITIONERS ("Medical Laboratory
 * Technologist / Scientist", "Physiotherapist"), which is what a colleague
 * opening this app will recognise as their own designation. Using the official
 * list also settled a question I had flagged as a guess: **Pulmonary and
 * Respiratory are not the same service.** "Respiratory Therapist" is profession
 * 26 in its own right, while "Pulmonary" is one of five sub-disciplines of
 * profession 12, Medical Technologist / Physiologist — alongside Cardiac, Neuro,
 * Sleep and Vascular. The taxonomy answered it; I had been inferring.
 *
 * TWO PROFESSIONS NEST. 12 carries five sub-disciplines and 24 carries six, so
 * the 28 professions are 37 selectable leaves. The parent of a nesting
 * profession is a GROUP LABEL, not a choice: a roster belongs to a cardiac lab
 * or a sleep lab, not to "medical technology" in general, so selecting the
 * parent would mean selecting nothing in particular.
 *
 * `id` values are stable slugs and are what the UI and every test key on. Never
 * renumber or re-slug an existing one: the ids outlive the display names.
 *
 * ── A NOTE ON TRUST, WHICH BELONGS HERE RATHER THAN IN A COMMIT MESSAGE ──
 *
 * Listing all 28 does NOT mean 28 known rostering patterns. At the time of
 * writing the owner has interviewed FOUR teams (medical laboratory scientists,
 * embryologists, psychologists, physiotherapists) and works in a fifth
 * (clinical exercise physiology, whose real duty names are in
 * `auraEngine.js`'s `LIVE_ROSTER_DEFAULTS`). Every other arrangement is
 * INFERRED — a plausible service, not a described one — and carries a
 * `correction` checklist saying so on screen. `provenance` is the field that
 * distinguishes them, and the picker shows it, so nobody has to remember which
 * is which in front of a room.
 * ==============================================================================
 */

/** A profession whose pattern came from the practitioners themselves. */
export const AHP_INTERVIEWED = 'interviewed';
/** A plausible pattern nobody in that profession has confirmed. Carries a caveat. */
export const AHP_INFERRED = 'inferred';

/**
 * The 28, in MOH's own order and with MOH's own names.
 *
 * `children` present = the parent is a group label, and its children are the
 * selectable leaves. `mohNumber` is kept so an entry can be checked against the
 * published list without re-reading this file's history.
 */
export const MOH_ALLIED_HEALTH_PROFESSIONS = Object.freeze([
    Object.freeze({ mohNumber: 1, id: 'art-therapist', name: 'Art Therapist' }),
    Object.freeze({ mohNumber: 2, id: 'auditory-verbal-therapist', name: 'Auditory-Verbal Therapist' }),
    Object.freeze({ mohNumber: 3, id: 'audiologist', name: 'Audiologist' }),
    Object.freeze({ mohNumber: 4, id: 'clinical-counsellor', name: 'Clinical Counsellor' }),
    Object.freeze({ mohNumber: 5, id: 'clinical-exercise-physiologist', name: 'Clinical Exercise Physiologist' }),
    Object.freeze({ mohNumber: 6, id: 'child-life-therapist', name: 'Child Life Therapist' }),
    Object.freeze({ mohNumber: 7, id: 'diagnostic-radiographer', name: 'Diagnostic Radiographer' }),
    Object.freeze({ mohNumber: 8, id: 'dietitian', name: 'Dietitian' }),
    Object.freeze({ mohNumber: 9, id: 'embryologist', name: 'Embryologist' }),
    Object.freeze({ mohNumber: 10, id: 'genetic-counsellor', name: 'Genetic Counsellor' }),
    Object.freeze({
        mohNumber: 11,
        id: 'medical-laboratory-technologist',
        name: 'Medical Laboratory Technologist / Scientist',
    }),
    Object.freeze({
        mohNumber: 12,
        id: 'medical-technologist-physiologist',
        name: 'Medical Technologist / Physiologist',
        // Five sub-disciplines, each its own service with its own roster shape.
        // A cardiac lab and a sleep lab share a profession and almost nothing else.
        children: Object.freeze([
            Object.freeze({ id: 'medtech-cardiac', name: 'Cardiac' }),
            Object.freeze({ id: 'medtech-neuro', name: 'Neuro' }),
            Object.freeze({ id: 'medtech-pulmonary', name: 'Pulmonary' }),
            Object.freeze({ id: 'medtech-sleep', name: 'Sleep' }),
            Object.freeze({ id: 'medtech-vascular', name: 'Vascular' }),
        ]),
    }),
    Object.freeze({ mohNumber: 13, id: 'medical-social-worker', name: 'Medical Social Worker' }),
    Object.freeze({ mohNumber: 14, id: 'music-therapist', name: 'Music Therapist' }),
    Object.freeze({ mohNumber: 15, id: 'nuclear-medicine-technologist', name: 'Nuclear Medicine Technologist' }),
    Object.freeze({ mohNumber: 16, id: 'occupational-therapist', name: 'Occupational Therapist' }),
    Object.freeze({ mohNumber: 17, id: 'optometrist', name: 'Optometrist' }),
    Object.freeze({ mohNumber: 18, id: 'orthoptist', name: 'Orthoptist' }),
    Object.freeze({ mohNumber: 19, id: 'perfusionist', name: 'Perfusionist' }),
    Object.freeze({ mohNumber: 20, id: 'physiotherapist', name: 'Physiotherapist' }),
    Object.freeze({ mohNumber: 21, id: 'play-therapist', name: 'Play Therapist' }),
    Object.freeze({ mohNumber: 22, id: 'podiatrist', name: 'Podiatrist' }),
    Object.freeze({ mohNumber: 23, id: 'prosthetist-orthotist', name: 'Prosthetist & Orthotist' }),
    Object.freeze({
        mohNumber: 24,
        id: 'psychologist',
        // MOH's own qualifier, kept verbatim: the list reads "Psychologist,
        // excluding associate psychologist". Dropping it would widen a
        // professional boundary this file has no standing to widen.
        name: 'Psychologist (excluding associate psychologist)',
        children: Object.freeze([
            Object.freeze({ id: 'psychologist-clinical', name: 'Clinical' }),
            Object.freeze({ id: 'psychologist-clinical-neuro', name: 'Clinical Neuro' }),
            Object.freeze({ id: 'psychologist-counselling', name: 'Counselling' }),
            Object.freeze({ id: 'psychologist-educational', name: 'Educational' }),
            Object.freeze({ id: 'psychologist-forensic', name: 'Forensic' }),
            Object.freeze({ id: 'psychologist-health', name: 'Health' }),
        ]),
    }),
    Object.freeze({ mohNumber: 25, id: 'radiation-therapist', name: 'Radiation Therapist' }),
    Object.freeze({ mohNumber: 26, id: 'respiratory-therapist', name: 'Respiratory Therapist' }),
    Object.freeze({ mohNumber: 27, id: 'speech-therapist', name: 'Speech Therapist' }),
    Object.freeze({ mohNumber: 28, id: 'sonographer', name: 'Sonographer' }),
]);

/**
 * Every selectable leaf, flattened, each carrying the group it belongs to.
 *
 * A nesting profession contributes its children and NOT itself; a plain one
 * contributes itself with `group: null`. This is what the picker iterates, and
 * what makes "how many arrangements are there?" a question with one answer.
 */
export const MOH_PROFESSION_LEAVES = Object.freeze(
    MOH_ALLIED_HEALTH_PROFESSIONS.flatMap((profession) =>
        profession.children
            ? profession.children.map((child) => Object.freeze({
                id: child.id,
                name: child.name,
                group: profession.name,
                groupId: profession.id,
                mohNumber: profession.mohNumber,
                /** How it reads with no group heading around it — for prose, tests, exports. */
                qualifiedName: `${profession.name} — ${child.name}`,
            }))
            : [Object.freeze({
                id: profession.id,
                name: profession.name,
                group: null,
                groupId: null,
                mohNumber: profession.mohNumber,
                qualifiedName: profession.name,
            })],
    ),
);

/** 37 at the time of writing: 26 plain professions + 5 sub-disciplines + 6. */
export const MOH_PROFESSION_LEAF_COUNT = MOH_PROFESSION_LEAVES.length;

/** One leaf by id, or `null`. Never throws — a stale id in a URL is not a crash. */
export const professionById = (id) =>
    MOH_PROFESSION_LEAVES.find((leaf) => leaf.id === id) || null;
