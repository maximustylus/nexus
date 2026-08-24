/** `AN13` / `AN12` — the deterministic screen, exercised on both sides. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { containsNric, NRIC_REFUSAL } from './nric.js';

describe('containsNric — catches the shape wherever it sits', () => {
    it.each([
        ['bare', 'S1234567D'],
        ['lowercase', 'patient s1234567d came in today'],
        ['FIN F-series', 'F7654321X'],
        ['FIN G-series', 'G1234567K'],
        ['FIN M-series (2022+)', 'M1234567W'],
        ['T-series', 'T0212345A'],
        ['in a sentence', 'pls follow up S1234567D before discharge'],
        ['in brackets', 'the patient (S1234567D) asked about results'],
        ['before punctuation', 'ID S1234567D.'],
        ['after a colon', 'NRIC:S1234567D'],
    ])('%s', (_label, text) => {
        expect(containsNric(text)).toBe(true);
    });
});

describe('containsNric — does not cry wolf', () => {
    it.each([
        ['an ordinary comment', 'great session everyone, see you thursday'],
        ['a shortened id, which is the ASKED-FOR fix', 'patient ending 567D'],
        ['too few digits', 'S123456D'],
        ['too many digits', 'S12345678D'],
        ['wrong leading letter', 'Z1234567D'],
        ['letters running on — an ops code, not an id', 'NS1234567X'],
        ['digits running on', 'S1234567D9'],
        ['a phone number', 'call me at 91234567'],
        ['empty', ''],
        ['non-string', null],
    ])('%s', (_label, text) => {
        expect(containsNric(text)).toBe(false);
    });
});

describe('the refusal sentence', () => {
    it('names the fix, not merely the refusal', () => {
        expect(NRIC_REFUSAL).toContain('ending 567D');
        expect(NRIC_REFUSAL).toContain('NRIC');
    });
});

describe('the firestore.rules fence tests the SAME shape', () => {
    // `matches()` is a FULL match in rules; RE2 has no lookarounds, so the fence
    // spells the boundary as alternation. This block re-reads the pattern out of
    // firestore.rules and asserts it agrees with `containsNric` on every case
    // above — if either side is edited alone, this is what fails.
    const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const m = rules.match(/!request\.resource\.data\.text\.matches\('([^']+)'\)/);

    it('the fence exists in the comments rule', () => {
        expect(m).not.toBeNull();
    });

    const rulesRegex = new RegExp('^(?:' + m[1] + ')$', 's');

    it.each([
        'S1234567D',
        'patient s1234567d came in today',
        'F7654321X', 'G1234567K', 'M1234567W', 'T0212345A',
        'pls follow up S1234567D before discharge',
        'the patient (S1234567D) asked about results',
        'ID S1234567D.', 'NRIC:S1234567D',
        'great session everyone, see you thursday',
        'patient ending 567D',
        'S123456D', 'S12345678D', 'Z1234567D',
        'NS1234567X', 'S1234567D9',
        'call me at 91234567',
        'line one\nS1234567D\nline three',
    ])('agrees with containsNric on %j', (text) => {
        expect(rulesRegex.test(text)).toBe(containsNric(text));
    });
});
