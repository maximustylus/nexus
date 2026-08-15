/**
 * THE OWNER'S PALETTE, PINNED AS A CONTRACT.
 *
 * Management = yellow · Clinical = brown · Research = limegreen ·
 * Education = orange — stated as a requirement on 2026-08-15. Three surfaces
 * derive from this one map (calendar chips, wizard labels, the ICS `COLOR:`
 * property), so if somebody "adjusts" a colour here, the file a colleague
 * imported into Outlook stops matching the app. These tests make that a failing
 * build instead of a quiet drift.
 */

import { describe, it, expect } from 'vitest';
import {
    STANDARD_CATEGORIES,
    normalizeCategory,
    categoryCssColor,
    categoryChipClass,
    suggestCategoryFor,
} from './rosterCategories.js';

describe('the palette is exactly what the owner specified', () => {
    it('maps the four categories to the four colours, verbatim', () => {
        // RFC 7986 requires COLOR to be a CSS3 colour NAME. The owner's palette
        // happens to be four literal CSS names — that coincidence is the contract.
        expect(categoryCssColor('Management')).toBe('yellow');
        expect(categoryCssColor('Clinical')).toBe('brown');
        expect(categoryCssColor('Research')).toBe('limegreen');
        expect(categoryCssColor('Education')).toBe('orange');
    });

    it('offers exactly four standard categories, each fully specified', () => {
        expect(STANDARD_CATEGORIES.map((c) => c.name).sort()).toEqual(
            ['Clinical', 'Education', 'Management', 'Research'],
        );
        for (const entry of STANDARD_CATEGORIES) {
            expect(entry.css).toMatch(/^[a-z]+$/);          // a CSS3 name, not a hex
            expect(entry.chip).toContain('dark:');           // both themes, always
        }
    });

    it('is case-insensitive and trims, because the box is free text', () => {
        expect(categoryCssColor('clinical')).toBe('brown');
        expect(categoryCssColor('  CLINICAL  ')).toBe('brown');
        expect(categoryCssColor('MANAGEMENT')).toBe('yellow');
        expect(normalizeCategory('education')?.name).toBe('Education');
    });

    it('says null — never a guess — for everything non-standard', () => {
        // These are REAL categories teams typed (quota handles, the live team's
        // video clinic, the engine default). They must keep their own styling
        // paths, not be shoehorned into the nearest standard colour.
        for (const raw of ['WEEKEND', 'ON CALL', 'VC', 'CORE', 'Diagnostics', '', '   ', null, undefined, 42]) {
            expect(categoryCssColor(raw)).toBeNull();
            expect(categoryChipClass(raw)).toBeNull();
        }
    });
});

describe('the suggestion is deterministic, explainable, and never a guess', () => {
    it('suggests from the task name and names the word that earned it', () => {
        // `because` is the LEFTMOST matching word in the name — "Student", not
        // "Supervision" — because that is what String.match returns and either is
        // an honest reason.
        expect(suggestCategoryFor('Student Supervision')).toEqual({ category: 'Education', because: 'Student' });
        expect(suggestCategoryFor('Journal Club')).toEqual({ category: 'Research', because: 'Journal' });
        expect(suggestCategoryFor('Roster Planning Meeting')).toMatchObject({ category: 'Management' });
        expect(suggestCategoryFor('Outpatient Clinic')).toMatchObject({ category: 'Clinical' });
        expect(suggestCategoryFor('Inpatient Rounds')).toMatchObject({ category: 'Clinical' });
    });

    it('checks the specific lists before the broad one, so Clinical cannot swallow everything', () => {
        // "clinic" appears in the name, but "audit" is the more specific claim.
        expect(suggestCategoryFor('Clinic Audit')).toMatchObject({ category: 'Management' });
        expect(suggestCategoryFor('Ward Teaching')).toMatchObject({ category: 'Education' });
        expect(suggestCategoryFor('Patient Trial Visit')).toMatchObject({ category: 'Research' });
    });

    it('returns null when it has no opinion — silence, not a default', () => {
        for (const name of ['Holter', 'CPET', 'Weekend Acute Cover', 'Bench A', '', '   ', null, undefined]) {
            expect(suggestCategoryFor(name)).toBeNull();
        }
    });
});
