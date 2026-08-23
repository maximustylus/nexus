/**
 * ==============================================================================
 * DEMO AURA — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * Demo Mode is how somebody decides whether their department adopts NEXUS. It is
 * shown in a room, on hospital wifi, to people who did not ask for it. So the
 * properties below are not cosmetic: determinism is what makes a rehearsed
 * walkthrough stay rehearsed, and the response shape is what keeps the demo
 * showing the real product rather than a stub of it.
 */

import { describe, it, expect } from 'vitest';
import { respondAsDemoAura, selectDemoMode, phaseForEnergy, DEMO_MODES } from './demoAura';
import { DEMO_PERSONAS } from '../config/personas';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ask = (userText, persona = DEMO_PERSONAS[0], turnIndex = 0) =>
    respondAsDemoAura({ userText, persona, turnIndex });

describe('phaseForEnergy — matches PHASE_CONFIG in AuraPulseBot exactly', () => {
    /**
     * These four bands are duplicated from the component on purpose (a util must
     * not import from a component). If the component's bands ever move, this is
     * where the drift shows up — and a wrong band means the demo logs a wellbeing
     * phase that contradicts the badge rendered beside it.
     */
    it.each([
        [100, 'HEALTHY'], [80, 'HEALTHY'],
        [79, 'REACTING'], [50, 'REACTING'],
        [49, 'INJURED'],  [20, 'INJURED'],
        [19, 'ILL'],      [0, 'ILL'],
    ])('%i → %s', (energy, phase) => {
        expect(phaseForEnergy(energy)).toBe(phase);
    });
});

describe('selectDemoMode — mirrors the routing AURA_SYSTEM_PROMPT describes', () => {
    /**
     * The live prompt's CRITICAL OVERRIDE puts logging a number ahead of
     * everything else, including the coaching voice. A demo that answered "log 35
     * patients for January" with a reflective question would misrepresent the
     * feature to the person being shown it.
     */
    it('routes a logging request to DATA_ENTRY, ahead of coaching', () => {
        expect(selectDemoMode('Log 35 patients for January')).toBe('DATA_ENTRY');
        expect(selectDemoMode('update my workload for March')).toBe('DATA_ENTRY');
    });

    it('routes a document request to ASSISTANT', () => {
        expect(selectDemoMode('draft a memo about coverage')).toBe('ASSISTANT');
        expect(selectDemoMode('write me an agenda')).toBe('ASSISTANT');
    });

    it('routes an evidence request to RESEARCH', () => {
        expect(selectDemoMode('what does the literature say about burnout')).toBe('RESEARCH');
    });

    it('defaults to COACH — the mode the product leads with', () => {
        expect(selectDemoMode('I am exhausted')).toBe('COACH');
        expect(selectDemoMode('')).toBe('COACH');
        expect(selectDemoMode(null)).toBe('COACH');
    });

    it('only ever returns a mode AuraPulseBot can render', () => {
        ['log 5', 'draft a letter', 'evidence please', 'hello', ''].forEach((t) => {
            expect(DEMO_MODES).toContain(selectDemoMode(t));
        });
    });
});

describe('⚠️ DETERMINISM — the property a live demo depends on', () => {
    /**
     * No Math.random, no Date.now. The same demo, driven the same way, must
     * produce the same words every time. This is also why the module can be
     * asserted at all.
     */
    it('gives byte-identical answers for identical input', () => {
        DEMO_PERSONAS.forEach((persona) => {
            [0, 1, 2, 3, 7].forEach((turnIndex) => {
                const a = respondAsDemoAura({ userText: 'I am shattered', persona, turnIndex });
                const b = respondAsDemoAura({ userText: 'I am shattered', persona, turnIndex });
                expect(a).toEqual(b);
            });
        });
    });

    it('contains no source of nondeterminism', () => {
        const code = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'demoAura.js'), 'utf8')
            .split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
        expect(code).not.toMatch(/Math\.random/);
        expect(code).not.toMatch(/Date\.now/);
        expect(code).not.toMatch(/new Date\(/);
    });
});

describe('the response shape AuraPulseBot parses', () => {
    /**
     * ⚠️ THE CONTRACT. The component reads `reply`, `mode`, `action`,
     *    `db_workload`, `diagnosis_ready`, `phase` and `energy` off the parsed
     *    JSON, and throws "Incomplete response from AURA" without `reply`. A demo
     *    that returned a bare string would render the error bubble instead.
     */
    it('always carries a non-empty reply and a valid mode', () => {
        const inputs = ['I am tired', 'log 40 patients', 'draft a memo', 'show me the evidence', '', 'ok'];
        DEMO_PERSONAS.forEach((persona) => {
            inputs.forEach((text) => {
                [0, 1, 2, 3, 4].forEach((turnIndex) => {
                    const r = respondAsDemoAura({ userText: text, persona, turnIndex });
                    expect(typeof r.reply).toBe('string');
                    expect(r.reply.length).toBeGreaterThan(0);
                    expect(DEMO_MODES).toContain(r.mode);
                });
            });
        });
    });

    it('never throws, whatever it is handed', () => {
        expect(() => respondAsDemoAura({})).not.toThrow();
        expect(() => respondAsDemoAura({ userText: null, persona: null })).not.toThrow();
        expect(() => respondAsDemoAura({ userText: 'x', persona: undefined, turnIndex: 99 })).not.toThrow();
    });
});

describe('COACH — reflections first, then a phase the wellbeing panel can log', () => {
    it('does not offer a diagnosis on the opening turns', () => {
        [0, 1, 2].forEach((turnIndex) => {
            expect(ask('I am struggling', DEMO_PERSONAS[0], turnIndex).diagnosis_ready).toBe(false);
        });
    });

    it('produces a loggable phase and energy once there is enough conversation', () => {
        const r = ask('I am struggling', DEMO_PERSONAS[0], 3);
        expect(r.diagnosis_ready).toBe(true);
        expect(r.phase).toBe(phaseForEnergy(DEMO_PERSONAS[0].baseEnergy));
        expect(r.energy).toBe(DEMO_PERSONAS[0].baseEnergy);
    });

    /**
     * The personas exist to show that a stretched team lead and a coping junior
     * get different readings. Anchoring on `baseEnergy` is what preserves that; a
     * single generic number would erase the reason the persona picker is there.
     */
    it('gives each persona the reading their baseEnergy implies', () => {
        DEMO_PERSONAS.forEach((persona) => {
            const r = respondAsDemoAura({ userText: 'hard week', persona, turnIndex: 5 });
            expect(r.energy).toBe(persona.baseEnergy);
            expect(r.phase).toBe(phaseForEnergy(persona.baseEnergy));
        });
    });

    it('reads as reflection rather than instruction, which is what OARS means', () => {
        const opening = ask('I am wrung out', DEMO_PERSONAS[1], 0).reply;
        expect(opening).toMatch(/\?$/);           // an open question
        expect(opening).not.toMatch(/you should|you must|try to/i);
    });

    it('escalates rather than reassures when the phase is ILL', () => {
        const ill = respondAsDemoAura({
            userText: 'nothing left', persona: { name: 'X', title: 'Staff', baseEnergy: 10, id: 'x' }, turnIndex: 4,
        });
        expect(ill.phase).toBe('ILL');
        expect(ill.reply).toMatch(/lead or occupational health/i);
    });
});

describe('the modes that show a feature rather than a conversation', () => {
    it('DATA_ENTRY echoes the number and says plainly that nothing was written', () => {
        const r = ask('log 35 patients for January');
        expect(r.mode).toBe('DATA_ENTRY');
        expect(r.reply).toContain('35');
        expect(r.db_workload).toMatchObject({ value: 35, written: false });
    });

    it('DATA_ENTRY asks for the number instead of inventing one', () => {
        const r = ask('log my workload');
        expect(r.db_workload).toBeUndefined();
        expect(r.reply).toMatch(/tell me the number/i);
    });

    /**
     * `action` is what AuraPulseBot turns into an exportable document card, so a
     * demo of the Word export needs real text in it.
     */
    it('ASSISTANT fills `action` with a document, not a promise of one', () => {
        const r = ask('draft a memo about coverage');
        expect(r.mode).toBe('ASSISTANT');
        expect(r.action).toContain('MEMORANDUM');
        expect(r.action.split('\n').length).toBeGreaterThan(5);
    });

    /**
     * RESEARCH has no index behind it in the sandbox, and says so. Fabricating a
     * citation in a demo shown to clinicians would be the worst possible failure
     * of this module.
     */
    it('RESEARCH says what it would do rather than inventing evidence', () => {
        const r = ask('what does the evidence say about burnout');
        expect(r.mode).toBe('RESEARCH');
        expect(r.reply).toMatch(/sandbox carries no literature index/i);
        expect(r.reply).not.toMatch(/\b(19|20)\d{2}\b\s*\)/);   // no fabricated citation year
    });
});

const PERSONA = DEMO_PERSONAS[0];

// ── THE REGRESSION TESTS THAT WERE MISSING ──────────────────────────────────
//
// Review of the first fix batch found three rows closed on "an edit plus a manual
// observation, with no test that would fail if the fix were undone". These are
// those tests. Every one of them fails on the code as it was before.

describe('AU22 — the sandbox emits the shape the card actually renders from', () => {
    /**
     * ⚠️ ASSERTED ON `target_collection` EXPLICITLY, NOT WITH `toMatchObject`.
     *    The existing assertion at the top of this file is
     *    `toMatchObject({ value: 35, written: false })` — a PARTIAL match, which
     *    passes with or without the fix. It would not have caught the original
     *    defect and would not catch its return.
     *
     *    The gate it has to satisfy is `AuraPulseBot.jsx:1104`:
     *    `m.db_workload && m.db_workload.target_collection && … !== 'null'`.
     */
    const rendersCard = (m) => !!(
        m.mode === 'DATA_ENTRY'
        && m.db_workload
        && m.db_workload.target_collection
        && m.db_workload.target_collection !== 'null'
    );

    it('renders the card for the README\'s own scripted demo sentence', () => {
        // `README.md:186` — "The Data Entry Test". The presenter says this on stage.
        const r = respondAsDemoAura({ userText: 'I saw 145 patients in June', persona: PERSONA });
        expect(r.mode).toBe('DATA_ENTRY');
        expect(rendersCard(r)).toBe(true);
        expect(r.db_workload.target_value).toBe(145);
        expect(r.db_workload.target_month).toBe(5);   // June
    });

    it('carries every field the card reads', () => {
        const r = respondAsDemoAura({ userText: 'log 35 patients for January', persona: PERSONA });
        expect(r.db_workload).toHaveProperty('target_collection', 'staff_loads');
        expect(r.db_workload).toHaveProperty('target_doc');
        expect(r.db_workload).toHaveProperty('target_value', 35);
        expect(r.db_workload).toHaveProperty('target_month', 0);
    });

    it('still says plainly that nothing was written', () => {
        const r = respondAsDemoAura({ userText: 'log 35 patients for January', persona: PERSONA });
        expect(r.db_workload.written).toBe(false);
    });
});

describe('the DATA_ENTRY keywords must not swallow distress', () => {
    /**
     * ⚠️ THIS IS THE TEST THAT WOULD HAVE STOPPED A REAL REGRESSION.
     *
     *    The first fix for `README.md:186` added `'i saw '` to the keyword list.
     *    DATA_ENTRY is tested FIRST, so that two-word prefix beat COACH, ASSISTANT
     *    and RESEARCH — and a clinician typing *"I saw 3 arrests back to back and I
     *    am wrung out"* would have been answered by the wellbeing tool with
     *    *"Logged 3 against your workload record"* and a green commit card, in front
     *    of the Allied Health Director.
     *
     *    The commit claimed "all four other routings are unchanged". That was true
     *    of the four exact README sentences and of nothing else. This corpus is the
     *    difference between those two statements.
     */
    it.each([
        'I saw so many patients today that I did not eat',
        'I saw 3 arrests back to back and I am wrung out',
        'Honestly I saw my whole team struggling this week',
        'I saw the roster and I have 6 late shifts in a row',
        'This week I saw more patients than usual and I am done',
        'I felt fine until I saw the clinic list',
        'I have seen 20 patients this week and it is only Wednesday',
        'I am exhausted, 12 patients in a morning is too many',
    ])('%s stays with the coach', (text) => {
        expect(selectDemoMode(text)).toBe('COACH');
    });

    it.each([
        'I saw a guideline on falls prevention',
        'I saw an interesting study on exercise oncology',
    ])('%s stays with research', (text) => {
        expect(selectDemoMode(text)).toBe('RESEARCH');
    });

    it('still routes the sentences that are genuinely a logging request', () => {
        expect(selectDemoMode('I saw 145 patients in June')).toBe('DATA_ENTRY');
        expect(selectDemoMode('Log 35 patients for January')).toBe('DATA_ENTRY');
        expect(selectDemoMode('update my workload for March')).toBe('DATA_ENTRY');
    });
});

describe('the demo month is read, not guessed', () => {
    /**
     * ⚠️ THREE MONTH NAMES ARE ORDINARY ENGLISH WORDS. An `includes` scan read
     *    *"I may have miscounted"* as **May** and *"march the patients through"* as
     *    **March** — the unanchored-substring trap, written into the fix for
     *    `AC1`, which is the same trap. A word boundary does not help: those are
     *    real words with real boundaries. A preposition does.
     */
    const monthOf = (t) => respondAsDemoAura({ userText: t, persona: PERSONA }).db_workload?.target_month;

    it.each([
        ['log 30 patients for March', 2],
        ['I saw 145 patients in June', 5],
        ['log 55 patients during August', 7],
    ])('%s -> month %i', (text, expected) => {
        expect(monthOf(text)).toBe(expected);
    });

    it.each([
        'log 20 patients, I may have miscounted',
        'march the patients through, log 30',
        'it was august, log 40 patients',
    ])('%s names no month', (text) => {
        expect(monthOf(text)).toBeNull();
    });

    /**
     * `null`, not `0`. Defaulting to January invents a fact — `AU2`'s
     * `Number(null) === 0` in a different hat — and the live guard now refuses a
     * null month rather than guessing, so the sandbox must not model something the
     * live path would reject.
     */
    it('leaves the month unset rather than defaulting to January', () => {
        expect(monthOf('log 12 patients')).toBeNull();
    });
});

describe('AU25 — a persona missing a field does not take the sandbox down', () => {
    it('does not throw when the persona has no title', () => {
        expect(() => respondAsDemoAura({
            userText: 'I am shattered', persona: { name: 'X', baseEnergy: 40 }, turnIndex: 0,
        })).not.toThrow();
    });

    it('still produces a usable reply', () => {
        const r = respondAsDemoAura({
            userText: 'I am shattered', persona: { name: 'X', baseEnergy: 40 }, turnIndex: 0,
        });
        expect(typeof r.reply).toBe('string');
        expect(r.reply.length).toBeGreaterThan(20);
    });

    it.each([{}, { name: 'X' }, { title: undefined }])('survives the persona %p', (persona) => {
        expect(() => respondAsDemoAura({ userText: 'I am tired', persona, turnIndex: 0 })).not.toThrow();
    });
});
