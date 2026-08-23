/**
 * ==============================================================================
 * DATA ENTRY GUARD — the boundary between a model's output and the database
 * ==============================================================================
 *
 * `AU24`: `executeDataEntry` — the function deciding what Gemini may write to a
 * database four practising clinicians use — had **zero tests**, against a suite of
 * 2,744. Not because anybody chose that, but because the decision lived inside a
 * component needing a React tree, a Firestore mock and a team context to reach.
 *
 * The decision is now pure, and this is it. Every case below is a value a model can
 * legitimately emit under `AURA_SYSTEM_PROMPT` MODE 3's own JSON schema.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
    refuseWorkloadWrite,
    canWriteWorkload,
    ALLOWED_WORKLOAD_FIELDS,
    ALLOWED_COLLECTIONS,
    MAX_MONTHLY_VALUE,
    TARGET_LOADS,
    TARGET_WORKLOAD,
} from './dataEntryGuard';

const loads = (over = {}) => ({
    target_collection: TARGET_LOADS,
    target_doc: 'Brandon',
    target_field: 'data',
    target_value: 35,
    target_month: 0,
    ...over,
});

const workload = (over = {}) => ({
    target_collection: TARGET_WORKLOAD,
    target_doc: 'jan_2026',
    target_field: 'patient_attendance',
    target_value: 4200,
    ...over,
});

describe('the happy paths still pass', () => {
    it('accepts a well-formed personal load write', () => {
        expect(refuseWorkloadWrite(loads())).toBeNull();
        expect(canWriteWorkload(loads())).toBe(true);
    });

    it('accepts a well-formed team workload write', () => {
        expect(refuseWorkloadWrite(workload())).toBeNull();
    });

    it.each([0, 11])('accepts month index %i', (m) => {
        expect(refuseWorkloadWrite(loads({ target_month: m }))).toBeNull();
    });

    it.each(ALLOWED_WORKLOAD_FIELDS)('accepts the prompt\'s own field %s', (f) => {
        expect(refuseWorkloadWrite(workload({ target_field: f }))).toBeNull();
    });

    it('accepts zero as a real, deliberate figure', () => {
        // ⚠️ A TYPED zero is legitimate — a clinic that ran no sessions in a month.
        //    What `AU2` was about is a zero the model never meant: `null` COERCED
        //    into one. The difference is the type, which is why the guard tests it.
        expect(refuseWorkloadWrite(loads({ target_value: 0 }))).toBeNull();
    });
});

// ── AU2 ─────────────────────────────────────────────────────────────────────
//
// The prompt declares the field nullable: `"target_value": <number | null>`. The
// component consumed it with a bare `Number()`, so `null` became a written ZERO
// and the clinician was told "✅ Database updated successfully. Logged 0 patients
// for January." The month beside it was guarded correctly in adjacent lines.

describe('AU2 — a value the model did not mean is refused, not coerced', () => {
    /**
     * ⚠️ THE FOUR THAT `Number()` TURNS INTO A PLAUSIBLE FIGURE. These are the
     *    dangerous ones: they do not throw, they do not look wrong downstream, and
     *    three of the four become a number a clinician could believe.
     */
    it.each([
        [null,        0,   'the value the prompt schema explicitly permits'],
        ['',          0,   'an empty string'],
        [[],          0,   'an empty array'],
        [true,        1,   'a boolean'],
    ])('refuses %p, which Number() would have written as %i (%s)', (value, coerced) => {
        expect(Number(value)).toBe(coerced);          // the old behaviour, proven
        expect(refuseWorkloadWrite(loads({ target_value: value }))).toMatch(/usable number/i);
    });

    it.each([undefined, 'thirty five', {}, NaN])('refuses %p, which would have written NaN', (value) => {
        expect(refuseWorkloadWrite(loads({ target_value: value }))).toMatch(/usable number/i);
    });

    it('refuses Infinity, which Number.isFinite is here to catch', () => {
        expect(Number('1e999')).toBe(Infinity);
        expect(refuseWorkloadWrite(loads({ target_value: Infinity }))).toMatch(/usable number/i);
        expect(refuseWorkloadWrite(loads({ target_value: Number('1e999') }))).toMatch(/usable number/i);
    });

    it('refuses a negative count', () => {
        expect(refuseWorkloadWrite(loads({ target_value: -5 }))).toMatch(/negative/i);
    });

    it('refuses a figure too large to be a month', () => {
        expect(refuseWorkloadWrite(loads({ target_value: MAX_MONTHLY_VALUE + 1 }))).toMatch(/too large/i);
        // A year misread as a count is the realistic case.
        expect(refuseWorkloadWrite(loads({ target_value: 2026000 }))).toMatch(/too large/i);
    });

    /**
     * ⚠️ A NUMERIC STRING IS REFUSED, DELIBERATELY. `"35"` is almost certainly fine,
     *    and accepting it would mean accepting `Number()` coercion again — the exact
     *    mechanism this guard exists to remove. The prompt asks for a number; a
     *    model returning a string has not followed it, and one clarifying question
     *    costs less than a wrong figure in a clinical record.
     */
    it('refuses a numeric string rather than re-introducing coercion', () => {
        expect(refuseWorkloadWrite(loads({ target_value: '35' }))).toMatch(/usable number/i);
    });
});

// ── AU3 ─────────────────────────────────────────────────────────────────────
//
// The write was `{ [workload.target_field]: Number(...) }`. The prompt names two
// fields; nothing enforced it, and the Firestore rule for that collection has no
// `changedKeys().hasOnly(...)` backstop — so a lead could write ANY key, and the
// key came from the model.

describe('AU3 — the field is an allowlist, not whatever the model said', () => {
    it.each(['leadUid', 'role', 'grade', 'patient_attendence', '__proto__', ''])(
        'refuses the field %p on a workload document', (field) => {
            expect(refuseWorkloadWrite(workload({ target_field: field }))).toMatch(/field I do not recognise/i);
        });

    it('refuses a missing field entirely', () => {
        const w = workload();
        delete w.target_field;
        expect(refuseWorkloadWrite(w)).toMatch(/field I do not recognise/i);
    });

    /**
     * The personal-load branch writes a fixed `data` array rather than a named
     * field, so the allowlist does not apply to it — asserted so a future change
     * that extends the allowlist does not silently start gating this branch too.
     */
    it('does not apply the field allowlist to the personal-load branch', () => {
        expect(refuseWorkloadWrite(loads({ target_field: 'anything at all' }))).toBeNull();
    });
});

describe('the collection allowlist', () => {
    it.each(['users', 'teams', 'grades', 'wellbeing', '', null, undefined])(
        'refuses the collection %p', (c) => {
            expect(refuseWorkloadWrite(loads({ target_collection: c }))).toMatch(/do not recognise/i);
        });

    it('allows exactly two collections and no more', () => {
        expect(ALLOWED_COLLECTIONS).toHaveLength(2);
    });
});

describe('the target document', () => {
    it.each(['', '   ', 'null', 'NULL', null, undefined])('refuses target_doc %p', (d) => {
        expect(refuseWorkloadWrite(loads({ target_doc: d }))).toMatch(/Missing target document/i);
    });
});

describe('the month guard', () => {
    it.each([12, -1, 1.5, undefined, 'January', NaN])('refuses month %p', (m) => {
        expect(refuseWorkloadWrite(loads({ target_month: m }))).toMatch(/valid month/i);
    });

    /**
     * ⚠️ THIS ONE CAUGHT A REGRESSION I WROTE, ON THE FIRST RUN, AND IT IS THE
     *    REASON THE CASE IS CALLED OUT SEPARATELY RATHER THAN LEFT IN THE LIST
     *    ABOVE.
     *
     *    The first draft of the guard read `Number.isInteger(Number(target_month))`.
     *    `Number(null)` is `0` — a valid month — so a `null` month was ACCEPTED and
     *    would have been written to January. That is `AU2` itself, on the one field
     *    the post-mortem called already correct, re-introduced while fixing it.
     */
    it('refuses a null month, which Number() would have made January', () => {
        expect(Number(null)).toBe(0);
        expect(refuseWorkloadWrite(loads({ target_month: null }))).toMatch(/valid month/i);
    });

    /**
     * ⚠️ THE COMPONENT USED `parseInt`, WHICH ACCEPTS `"3 o'clock"` AS 3, and a
     *    numeric string as a number. The guard requires an actual integer, matching
     *    the prompt's `<integer 0-11>` and the reasoning applied to `target_value`.
     */
    it.each(['3 o\'clock', '3', '11'])('refuses the string %p rather than parsing it', (m) => {
        expect(refuseWorkloadWrite(loads({ target_month: m }))).toMatch(/valid month/i);
    });
});

describe('a malformed object does not throw', () => {
    it.each([null, undefined, 'a string', 42, []])('refuses %p with a sentence', (bad) => {
        expect(() => refuseWorkloadWrite(bad)).not.toThrow();
        expect(typeof refuseWorkloadWrite(bad)).toBe('string');
    });
});

describe('every refusal is a sentence a clinician can act on', () => {
    /**
     * ⚠️ CHECKED BEFORE THE WRITE, NOT AFTER. The Firestore error for a refused
     *    write is `permission-denied` — true, useless, and read by a clinician as
     *    though their account is broken.
     */
    const refusals = [
        refuseWorkloadWrite(null),
        refuseWorkloadWrite(loads({ target_collection: 'users' })),
        refuseWorkloadWrite(loads({ target_doc: '' })),
        refuseWorkloadWrite(loads({ target_value: null })),
        refuseWorkloadWrite(loads({ target_value: -1 })),
        refuseWorkloadWrite(loads({ target_value: 9e9 })),
        refuseWorkloadWrite(loads({ target_month: 12 })),
        refuseWorkloadWrite(workload({ target_field: 'leadUid' })),
    ];

    it('never returns a bare code or an empty string', () => {
        refusals.forEach((r) => {
            expect(typeof r).toBe('string');
            expect(r.trim().length).toBeGreaterThan(20);
            expect(r).not.toMatch(/permission-denied|undefined|\[object/i);
        });
    });

    it('says what happened to the data in every refusal that follows a real attempt', () => {
        // "Nothing was saved" / "was not saved" — the person needs to know the
        // record is unchanged, not merely that something went wrong.
        const afterAttempt = refusals.filter((r) => !/valid month|Missing target/i.test(r));
        afterAttempt.forEach((r) => expect(r).toMatch(/not saved|nothing was saved/i));
    });
});
