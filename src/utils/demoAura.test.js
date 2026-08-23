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
