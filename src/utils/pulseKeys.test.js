/** `AU12` — the reader's fallback set and the writer's delete set are one set. */
import { describe, it, expect } from 'vitest';
import { legacyPulseKeys, resolvePulseEntry } from './pulseKeys.js';

describe('legacyPulseKeys', () => {
    it('finds the exact-case legacy key', () => {
        expect(legacyPulseKeys({ 'Sarah Tan': {} }, 'Sarah Tan', 'uid-1')).toEqual(['Sarah Tan']);
    });

    it('finds a case-variant legacy key — the scenario the first cut missed', () => {
        // Written as "sarah tan" before a rename to "Sarah Tan": the reader
        // displayed it, the writer deleted nothing, and the person was counted
        // twice after their first save.
        expect(legacyPulseKeys({ 'sarah tan': {} }, 'Sarah Tan', 'uid-1')).toEqual(['sarah tan']);
    });

    it('finds EVERY case variant, because the writer deletes them all', () => {
        const data = { 'sarah tan': {}, 'SARAH TAN': {}, 'Sarah Tan': {}, 'uid-1': {} };
        expect(legacyPulseKeys(data, 'Sarah Tan', 'uid-1').sort())
            .toEqual(['SARAH TAN', 'Sarah Tan', 'sarah tan']);
    });

    it('never includes the uid key, even when the name IS the uid (demo mode)', () => {
        expect(legacyPulseKeys({ Steve: {} }, 'Steve', 'Steve')).toEqual([]);
    });

    it('does not match a different name — exact, not substring', () => {
        // The pre-AU12 reader used `.includes`, so 'Ann' matched 'Joanne'.
        expect(legacyPulseKeys({ Joanne: {} }, 'Ann', 'uid-1')).toEqual([]);
        expect(legacyPulseKeys({ 'Anne-Marie': {} }, 'Anne', 'uid-1')).toEqual([]);
    });

    it.each([[null], [undefined], [{}]])('is empty on %s data', (data) => {
        expect(legacyPulseKeys(data, 'Sarah', 'uid-1')).toEqual([]);
    });

    it.each([[''], [null], [undefined], [42]])('is empty on %j as a name', (name) => {
        expect(legacyPulseKeys({ a: {} }, name, 'uid-1')).toEqual([]);
    });
});

describe('resolvePulseEntry', () => {
    const entry = { energy: 70, focus: 6 };

    it('prefers the uid key over any legacy key', () => {
        expect(resolvePulseEntry({ 'uid-1': entry, 'Sarah Tan': { energy: 1 } },
            { uid: 'uid-1', name: 'Sarah Tan' })).toBe(entry);
    });

    it('falls back to a case-variant legacy entry', () => {
        expect(resolvePulseEntry({ 'sarah tan': entry }, { uid: 'uid-1', name: 'Sarah Tan' })).toBe(entry);
    });

    it('is undefined when the person has never checked in', () => {
        expect(resolvePulseEntry({ other: entry }, { uid: 'uid-1', name: 'Sarah Tan' })).toBeUndefined();
    });
});
