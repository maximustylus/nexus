/**
 * ==============================================================================
 * DATA ENTRY GUARD — what a language model is allowed to write, decided in one
 * place, as a pure function
 * ==============================================================================
 *
 * `AURA_SYSTEM_PROMPT` MODE 3 tells Gemini it is *"a safe database gateway"* and
 * asks it for a `db_workload` object naming a collection, a document, a field and
 * a value. `AuraPulseBot.executeDataEntry` then writes it to Firestore on a button
 * press. So the contents of this file are the boundary between a model's output
 * and a clinical-adjacent database.
 *
 * ------------------------------------------------------------------------------
 * ⚠️ WHY THIS IS A SEPARATE MODULE RATHER THAN MORE `if`s IN THE COMPONENT
 * ------------------------------------------------------------------------------
 *
 * `AU24`: `executeDataEntry` had **no tests**, against a suite of 2,744. It is the
 * function deciding what a language model may write to a database used by four
 * practising clinicians, and nothing exercised it. That is not an oversight anybody
 * chose — it is what happens when a decision lives inside a component that needs a
 * React tree, a Firestore mock and a team context to reach.
 *
 * The decision is pure: an object in, a refusal or a plan out. Extracted, it is
 * testable in isolation, and `dataEntryGuard.test.js` is the result. The component
 * keeps the effects — the reads, the writes, the messages — and the judgement lives
 * here.
 *
 * ------------------------------------------------------------------------------
 * ⚠️ THE TWO DEFECTS THIS CLOSES, AND WHY BOTH ARE IN ONE MODULE
 * ------------------------------------------------------------------------------
 *
 * `AU2` — **`target_value: null` wrote a zero and reported success.** The prompt's
 * own schema declares the field nullable (`"target_value": <number | null>`), and
 * the component consumed it with a bare `Number()`. Measured, verbatim:
 *
 *     null       -> 0          ""      -> 0        []   -> 0
 *     undefined  -> NaN        "forty" -> NaN      true -> 1
 *     "1e999"    -> Infinity
 *
 * So a model emitting the `null` its own schema permits overwrote that month's
 * patient load with **0**, and the clinician was told *"✅ Database updated
 * successfully. Logged 0 patients for January."* The month beside it was guarded
 * correctly in adjacent lines; the value was not. That asymmetry is the tell — it
 * was not a decision, it was a gap.
 *
 * `AU3` — **`target_field` was model-chosen and unconstrained.** The write was
 * `{ [workload.target_field]: Number(...) }`. The prompt says the field is
 * `patient_attendance` or `patient_load`; nothing enforced it, and the Firestore
 * rule for that collection has no `changedKeys().hasOnly(...)` backstop, so a lead
 * may write **any key** and the key came from the model.
 *
 * They are one module because they are one guard on one object, and splitting them
 * would mean touching the same eight lines twice.
 *
 * ------------------------------------------------------------------------------
 * ⚠️ WHAT THIS DELIBERATELY DOES NOT DO
 * ------------------------------------------------------------------------------
 *
 * It does not resolve a person to a uid, and it does not know whether a team
 * exists. Those need `memberUidByName` and a live context, they are effects rather
 * than judgements, and they stay in the component. This module answers exactly one
 * question: **is this object safe to turn into a write?**
 *
 * ⚠️ IT RETURNS `string | null`, NOT A PLAN. An earlier version of this paragraph
 *    said "an object in, a refusal or a plan out" — there is no plan, and the
 *    component still calls `Number(workload.target_value)` at the write itself.
 *    That is harmless only because the guard has already proven the value IS a
 *    finite integer, so the coercion is a no-op. Handing back a normalised value
 *    would be better and is not tonight's change; the docstring is corrected rather
 *    than left describing something that was never built, which is trap 4 in this
 *    project's own list.
 */

/** The only two collections MODE 3 may target. Names are pre-migration; the
 *  component maps them to `teams/{id}/loads/{uid}` and `teams/{id}/workload/{p}`.
 *  See `AU7` — the prompt still briefs the model on the old paths. */
export const TARGET_LOADS = 'staff_loads';
export const TARGET_WORKLOAD = 'monthly_workload';
export const ALLOWED_COLLECTIONS = Object.freeze([TARGET_LOADS, TARGET_WORKLOAD]);

/**
 * The only fields MODE 3 may set on a workload document — `AU3`.
 *
 * Taken from the prompt's own schema rather than invented here, so the model is
 * refused for writing something it was never told to write. A third field added to
 * the prompt without being added here fails closed, which is the correct direction.
 */
export const ALLOWED_WORKLOAD_FIELDS = Object.freeze(['patient_attendance', 'patient_load']);

/**
 * A plausible patient count. Not a clinical limit — a sanity bound.
 *
 * ⚠️ THE UPPER BOUND EXISTS FOR `Infinity` AND FOR A MODEL THAT MISREADS A YEAR AS
 *    A COUNT. `Number('1e999')` is `Infinity`, and `Number.isFinite` alone would
 *    let 2,026,000 through. A department seeing more than this in a month is
 *    reporting a typo, and refusing it costs one clarifying question.
 */
export const MAX_MONTHLY_VALUE = 100000;

/**
 * `null` when the object is safe to write; otherwise a SENTENCE explaining why not.
 *
 * ⚠️ A SENTENCE, NOT A CODE, and checked BEFORE the write rather than after. The
 *    Firestore error for a refused write is `permission-denied` — true, useless,
 *    and read by a clinician as though their account is broken. Every string below
 *    names what AURA got wrong and what the person can do about it.
 *
 * @param {object} workload  the model's `db_workload` object, unvalidated
 * @returns {string|null}
 */
export const refuseWorkloadWrite = (workload) => {
    if (!workload || typeof workload !== 'object') {
        return 'AURA did not say what to write. Nothing was saved.';
    }

    if (!ALLOWED_COLLECTIONS.includes(workload.target_collection)) {
        return 'AURA asked to write somewhere I do not recognise. Nothing was saved.';
    }

    /**
     * ⚠️ `AU26` — `target_doc` CHOOSES THE DOCUMENT, and it was the one model-supplied
     *    field still left to `String()` coercion: the exact mechanism `AU2` is about,
     *    applied to the value with the largest consequence. Measured before this
     *    check existed:
     *
     *        target_doc: {}      -> ACCEPTED -> "[object Object]"
     *        target_doc: true    -> ACCEPTED -> "true"
     *        target_doc: 0       -> ACCEPTED -> "0"
     *        target_doc: [1]     -> ACCEPTED -> "1"
     *
     *    On `staff_loads` the damage was contained by the `memberUidByName` lookup,
     *    which resolves an invented name to nothing. On `monthly_workload` it was
     *    not: `workloadPath` asserts nothing (`teamPaths.js:345`, unlike `rosterPath`
     *    and `reportPath` beside it), so a model returning an object wrote
     *    `teams/{id}/workload/[object Object]` and the clinician read "Database
     *    updated successfully."
     *
     *    Bounded rather than catastrophic — `match /workload/{period}` is a single
     *    segment, so a path-like string matches no rule and is denied by the
     *    catch-all, and the collection's rule is `allow read: if false`. It is data
     *    quality, not disclosure. It is written down because `AU3` was closed while
     *    its sibling sat one `String()` away and unrecorded.
     */
    if (typeof workload.target_doc !== 'string') {
        return 'AURA did not say clearly who or what this is for. Nothing was saved.';
    }
    const rawTarget = workload.target_doc.trim();
    if (rawTarget === '' || rawTarget.toLowerCase() === 'null') {
        return 'Missing target document. Please ask AURA to clarify who this is for.';
    }
    // A document id is one path segment. A model that emits `a/b/c` is describing a
    // path, and the rules would refuse it anyway — refused here with a sentence.
    if (rawTarget.includes('/')) {
        return 'AURA gave a target I cannot use as a record name. Nothing was saved.';
    }

    /**
     * ⚠️ `AU2`. `Number.isFinite` REJECTS `NaN` AND `Infinity`; a `> 0` test alone
     *    would not, and `!= null` would let `""` and `[]` through as 0. The typeof
     *    check comes first so `true` (which `Number()` turns into 1) and `[]`
     *    (which it turns into 0) are refused as the non-numbers they are, rather
     *    than coerced into a plausible-looking count.
     */
    const value = workload.target_value;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 'AURA did not give a usable number. Tell it the figure again — nothing was saved.';
    }
    /**
     * ⚠️ AN INTEGER, LIKE THE MONTH BESIDE IT. `35.7` patients is not a count, and
     *    accepting it while refusing a non-integer month was an asymmetry with no
     *    reason behind it — noticed in review rather than designed.
     */
    if (!Number.isInteger(value)) {
        return 'That is not a whole number of patients, so it was not saved. Check the figure with AURA.';
    }
    if (value < 0) {
        return 'That figure is negative, so it was not saved. Tell AURA the number again.';
    }
    if (value > MAX_MONTHLY_VALUE) {
        return `${value} is too large to be a monthly figure, so it was not saved. `
             + 'Check the number with AURA.';
    }

    if (workload.target_collection === TARGET_LOADS) {
        /**
         * ⚠️ `typeof` FIRST, FOR THE MONTH TOO — AND THE FIRST DRAFT OF THIS MODULE
         *    GOT IT WRONG, WHICH IS WHY THE NOTE IS HERE RATHER THAN IMPLIED.
         *
         *    It read `Number.isInteger(Number(target_month))`. `Number(null)` is
         *    `0` — a perfectly valid month — so a `null` month was ACCEPTED and
         *    would have been written to January. That is `AU2` exactly, on the one
         *    field the post-mortem described as already correct, re-introduced
         *    while fixing it. `dataEntryGuard.test.js` caught it on the first run.
         *
         *    The old component used `parseInt`, which returned `NaN` for `null` and
         *    happened to refuse it — but also accepted `"3 o'clock"` as 3. Neither
         *    behaviour is what is wanted. The prompt asks for `<integer 0-11>`; this
         *    requires an integer, and a model that sends anything else is refused
         *    with a sentence rather than guessed at.
         */
        const monthIndex = workload.target_month;
        if (typeof monthIndex !== 'number'
            || !Number.isInteger(monthIndex)
            || monthIndex < 0 || monthIndex > 11) {
            return 'A valid month (e.g. January) is required to update personal workload.';
        }
    } else {
        /**
         * ⚠️ `AU3`. The workload document's Firestore rule is `allow create, update:
         *    if isLead(teamId)` with no `changedKeys()` constraint, so this
         *    allowlist is the only thing standing between a model-chosen string and
         *    a key on that document.
         */
        if (!ALLOWED_WORKLOAD_FIELDS.includes(workload.target_field)) {
            return 'AURA asked to update a field I do not recognise. Nothing was saved.';
        }
    }

    return null;
};

/**
 * `true` when `refuseWorkloadWrite` finds nothing wrong. A convenience for reading,
 * never a second implementation — it calls the one above.
 */
export const canWriteWorkload = (workload) => refuseWorkloadWrite(workload) === null;
