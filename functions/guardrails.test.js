/**
 * ==============================================================================
 * GUARDRAILS — what can be asserted, and the line where assertion stops
 * ==============================================================================
 *
 * The owner issued sixteen rules on 2026-08-24. `AURA-GUARDRAILS.md` reproduces
 * them verbatim; `functions/guardrails.cjs` encodes the part a machine can carry.
 *
 * ⚠️ THIS SUITE PROVES PRESENCE, NEVER COMPLIANCE. Every prompt assertion below is
 *    of the form *"this instruction reached the model"*. Not one of them says the
 *    model obeyed it, and none can: that needs real turns read by a person, which
 *    is `AURA-TODO.md` P7 and stays open. Reading a green run here as "AURA follows
 *    the guardrails" is the exact overstatement P1 forbids.
 *
 *    Two things ARE enforced and are tested as such: the AI provenance record
 *    (Rule 12, `AU16`) and the refusal to fabricate an empty assumptions block
 *    (P1). Those fail closed.
 *
 * ⚠️ COMMENTS ARE STRIPPED BEFORE ANY SOURCE ASSERTION. `AC5`: source scanning
 *    cannot tell code from prose, and this repository's convention is that a fix
 *    QUOTES what it replaced. `promptContract.test.js` was written with the same
 *    `codeOnly()` for the same reason, and it was written that way only after the
 *    first draft matched its own explanatory comments.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const guardrails = require_('./guardrails.cjs');

const {
    GUARDRAIL_VERSION,
    GUARDRAIL_EFFECTIVE,
    GUARDRAIL_PREAMBLE,
    GUARDRAIL_BRIEF,
    PREAMBLE_RULE_IDS,
    BRIEF_RULE_IDS,
    NO_ASSUMPTIONS_DECLARED,
    MODEL_UNRECORDED,
    aiProvenance,
    provenanceFooter,
} = guardrails;

const codeOnly = (text) => text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');

const src = codeOnly(readFileSync(resolve(here, 'index.js'), 'utf8'));
const doc = readFileSync(resolve(here, '..', 'AURA-GUARDRAILS.md'), 'utf8');

// ── §A · the preamble carries the rules it claims to carry ────────────────────

describe('the preamble reproduces the rule ids it claims', () => {
    it.each(PREAMBLE_RULE_IDS)('carries rule %s as a heading, not a passing mention', (id) => {
        // Anchored at a line start. `AC1`, `CP15`, `CP18`, `CP19`, `CP22` and
        // `AC15` in this repository were all unanchored substring matches, and an
        // unanchored search for "8" or "11" in four kilobytes of prose matches
        // something on every run whatever the file says.
        const heading = new RegExp('^' + id + '\\s', 'm');
        expect(GUARDRAIL_PREAMBLE).toMatch(heading);
    });

    it.each(BRIEF_RULE_IDS)('the brief variant carries rule %s', (id) => {
        expect(GUARDRAIL_BRIEF).toMatch(new RegExp('^' + id + '\\s', 'm'));
    });

    it('the brief variant is a subset of the full one, never a divergent set', () => {
        for (const id of BRIEF_RULE_IDS) expect(PREAMBLE_RULE_IDS).toContain(id);
    });

    it('the brief variant is materially shorter, or it is not brief', () => {
        // P5 applies to the guardrails themselves. `communityAck` returns one
        // sentence under a 200-token ceiling; a preamble longer than the answer is
        // padding on a public, billed endpoint.
        expect(GUARDRAIL_BRIEF.length).toBeLessThan(GUARDRAIL_PREAMBLE.length / 3);
    });
});

describe('the preamble obeys the rules it states', () => {
    it.each([['full', GUARDRAIL_PREAMBLE], ['brief', GUARDRAIL_BRIEF]])(
        'the %s variant contains no em dash, which Rule 11 forbids in output',
        (_name, text) => {
            // A preamble that uses em dashes while banning them is a worked example
            // of ignoring itself, and models copy the register they are given.
            expect(text).not.toContain('—');
        },
    );

    it.each([['full', GUARDRAIL_PREAMBLE], ['brief', GUARDRAIL_BRIEF]])(
        'the %s variant uses British spelling, per Rule 11',
        (_name, text) => {
            for (const us of ['organize', 'analyze', 'behavior', 'summarize', 'recognize']) {
                expect(text.toLowerCase()).not.toContain(us);
            }
        },
    );

    it('states the version and effective date, per Rule 12', () => {
        expect(GUARDRAIL_PREAMBLE).toContain('v' + GUARDRAIL_VERSION);
        expect(GUARDRAIL_PREAMBLE).toContain(GUARDRAIL_EFFECTIVE);
        expect(GUARDRAIL_BRIEF).toContain('v' + GUARDRAIL_VERSION);
    });
});

describe('P3 — the preamble admits AURA cannot verify anything', () => {
    it('states that it has no retrieval', () => {
        expect(GUARDRAIL_PREAMBLE).toMatch(/NO RETRIEVAL/i);
    });

    it('requires every reference to be labelled model-recalled', () => {
        expect(GUARDRAIL_PREAMBLE).toContain('model-recalled (unverified)');
    });

    it('forbids labelling anything verified, which it could never truthfully do', () => {
        expect(GUARDRAIL_PREAMBLE).toMatch(/Never\s+label anything "verified"/);
    });
});

describe('P6 — the preamble refuses the claim rather than pretending to be a control', () => {
    it('says outright that AURA is not a data classification control', () => {
        expect(GUARDRAIL_PREAMBLE).toMatch(/not a data classification control/i);
    });

    it('does not let processing imply approval', () => {
        expect(GUARDRAIL_PREAMBLE).toMatch(/Never imply that content is safe because you processed it/);
    });
});

describe('Rule 15 — the injection rule reaches every variant', () => {
    // The two endpoints that get the BRIEF variant are the two that feed
    // caller-authored text to a model and then act on the verdict. If Rule 15 were
    // trimmed out of the brief variant to save tokens, the trim would land exactly
    // where the rule matters most.
    it.each([['full', GUARDRAIL_PREAMBLE], ['brief', GUARDRAIL_BRIEF]])(
        'the %s variant says content is data, never instruction',
        (_name, text) => {
            expect(text).toMatch(/DATA/);
            expect(text).toMatch(/never instruction|never instructions to you/i);
        },
    );

    it('the full variant names the channels an instruction can arrive through', () => {
        for (const channel of ['attachment', 'file', 'link', 'conversation']) {
            expect(GUARDRAIL_PREAMBLE.toLowerCase()).toContain(channel);
        }
    });

    it('the full variant refuses irreversible action outright', () => {
        expect(GUARDRAIL_PREAMBLE).toMatch(/never perform an irreversible action/i);
    });
});

// ── Rule 12 · AI provenance. THIS ONE IS CODE ─────────────────────────────────

describe('aiProvenance — Rule 12, and the close of AU16', () => {
    it('records tool, model, guardrail version and an ISO timestamp', () => {
        const p = aiProvenance('models/gemini-2.5-pro', 1756000000000);
        expect(p).toEqual({
            tool: 'NEXUS AURA',
            model: 'models/gemini-2.5-pro',
            guardrails: GUARDRAIL_VERSION,
            generatedAt: '2025-08-24T01:46:40.000Z',
        });
    });

    it('honours an injected clock, so the test does not have to freeze time', () => {
        expect(aiProvenance('m', 0).generatedAt).toBe('1970-01-01T00:00:00.000Z');
    });

    it('stamps a real timestamp when no clock is injected', () => {
        const before = Date.now();
        const at = Date.parse(aiProvenance('m').generatedAt);
        expect(at).toBeGreaterThanOrEqual(before - 1000);
        expect(at).toBeLessThanOrEqual(Date.now() + 1000);
    });

    // `resolveModel()` returns one of four discovered models, or a fallback, or
    // whatever a failed fetch left behind. Every one of these reaches this function.
    it.each([
        ['undefined', undefined],
        ['null', null],
        ['an empty string', ''],
        ['whitespace', '   '],
        ['a number', 42],
        ['an object', {}],
        ['an array', []],
        ['a boolean', true],
    ])('records %s as unrecorded rather than dropping the field', (_label, value) => {
        const p = aiProvenance(value, 0);
        expect(p.model).toBe(MODEL_UNRECORDED);
        expect('model' in p).toBe(true);
    });

    it('trims, so a stray newline does not become part of the model id', () => {
        expect(aiProvenance('  models/gemini-1.5-flash\n', 0).model).toBe('models/gemini-1.5-flash');
    });

    it('the unrecorded marker says so rather than looking like a model name', () => {
        expect(MODEL_UNRECORDED).toBe('unrecorded');
    });
});

describe('provenanceFooter — Rule 12 surviving the export', () => {
    const footer = provenanceFooter(aiProvenance('models/gemini-2.5-pro', 1756000000000));

    it('names the model, the date and the guardrail version', () => {
        expect(footer).toContain('models/gemini-2.5-pro');
        expect(footer).toContain('2025-08-24T01:46:40.000Z');
        expect(footer).toContain('v' + GUARDRAIL_VERSION);
    });

    it('says the artefact is a draft a person must check, per P7', () => {
        expect(footer).toMatch(/draft/i);
        expect(footer).toMatch(/verify it against source/i);
    });

    it.each([['nothing', undefined], ['null', null], ['an empty object', {}]])(
        'degrades to a stated gap rather than throwing when given %s',
        (_label, value) => {
            expect(() => provenanceFooter(value)).not.toThrow();
            expect(provenanceFooter(value)).toContain(MODEL_UNRECORDED);
        },
    );
});

// ── P1 · the assumptions block, and the sentence that is NOT "None declared" ───

describe('NO_ASSUMPTIONS_DECLARED — P1 applied to a missing field', () => {
    it('never claims there was nothing to declare', () => {
        // The whole point. "None declared" is a positive claim that an author
        // checked and found nothing. Silence is not that claim, and substituting
        // one for the other is precisely the concealment P1 forbids.
        expect(NO_ASSUMPTIONS_DECLARED.toLowerCase()).not.toContain('none declared');
    });

    it('says the model declared nothing, and that this is a gap in the report', () => {
        expect(NO_ASSUMPTIONS_DECLARED).toMatch(/no assumptions block/i);
        expect(NO_ASSUMPTIONS_DECLARED).toMatch(/gap in the report/i);
    });

    it('tells the reader to treat the contents as unverified', () => {
        expect(NO_ASSUMPTIONS_DECLARED).toMatch(/unverified/i);
    });
});

// ── The wiring · every model call carries the guardrails ──────────────────────

describe('every system prompt in the file carries a guardrail variant', () => {
    const sites = src.split('systemInstruction').slice(1);

    it('finds all four model calls', () => {
        // chatWithAura, generateSmartAnalysis, processFeedPost, communityAck.
        expect(sites.length).toBeGreaterThanOrEqual(4);
    });

    it.each(sites.map((s, i) => [i, s]))(
        'systemInstruction site %i names a guardrail variant',
        (_i, site) => {
            // Read the head of the site only, so the NEXT call's guardrail does not
            // satisfy this one's assertion.
            expect(site.slice(0, 900)).toMatch(/GUARDRAIL_(PREAMBLE|BRIEF)/);
        },
    );
});

describe('chatWithAura — precedence is expressed by position', () => {
    const parts = src.slice(src.indexOf('parts: activePersona'), src.indexOf('parts: activePersona') + 400);

    /**
     * ⚠️ PRESENCE IS ASSERTED BEFORE ORDER, AND THE FIRST DRAFT DID NOT DO THAT.
     *    `indexOf` returns -1 for absent, and -1 is less than every real index, so
     *    "the guardrail comes first" PASSED against the pre-guardrail file where no
     *    guardrail existed at all. Same family as `AC1`, `CP15` and `AC15`: an
     *    assertion that cannot fail for the reason it was written.
     */
    const ordered = (fragment) => {
        expect(fragment).toContain('GUARDRAIL_PREAMBLE');
        expect(fragment).toContain('AURA_SYSTEM_PROMPT');
        expect(fragment.indexOf('GUARDRAIL_PREAMBLE'))
            .toBeLessThan(fragment.indexOf('AURA_SYSTEM_PROMPT'));
    };

    it('puts the guardrails before the base prompt in both branches', () => {
        ordered(parts.match(/\?\s*\[([^\]]*)\]/)[1]);
        ordered(parts.match(/:\s*\[([^\]]*)\]/)[1]);
    });

    it('puts the persona last, because it is the least trusted of the three', () => {
        // Five of the six live personas open with the literal words "System
        // Override" and one says "Disregard standard persona rules". They were left
        // word for word by `AU28`, so ordering is what states the precedence.
        const withPersona = parts.match(/\?\s*\[([^\]]*)\]/)[1];
        expect(withPersona).toContain('AURA_SYSTEM_PROMPT');
        expect(withPersona.indexOf('activePersona'))
            .toBeGreaterThan(withPersona.indexOf('AURA_SYSTEM_PROMPT'));
    });
});

describe('the callables return their provenance', () => {
    it('chatWithAura returns which model answered, and its footer', () => {
        const ret = src.slice(src.indexOf('var chatProvenance'));
        expect(ret.slice(0, 500)).toContain('guardrails.aiProvenance(modelName)');
        expect(ret.slice(0, 500)).toMatch(/provenance:\s*chatProvenance/);
        expect(ret.slice(0, 500)).toMatch(/provenanceFooter:\s*guardrails\.provenanceFooter\(chatProvenance\)/);
    });

    it('generateSmartAnalysis returns provenance, its footer and the assumptions block', () => {
        const ret = src.slice(src.indexOf('No private report generated'));
        expect(ret.slice(0, 600)).toMatch(/assumptions:/);
        expect(ret.slice(0, 600)).toMatch(/provenance:/);
        expect(ret.slice(0, 600)).toMatch(/provenanceFooter:/);
    });
});

describe('generateSmartAnalysis — the assumptions block degrades loudly, not closed', () => {
    it('asks for assumptions in the output schema', () => {
        const prompt = src.slice(
            src.indexOf('var SMART_ANALYSIS_SYSTEM_PROMPT'),
            src.indexOf('exports.chatWithAura'),
        );
        expect(prompt).toContain('"assumptions"');
    });

    it('asks for it again in the per-call requirements, with a word budget', () => {
        expect(src).toMatch(/'- "assumptions": Assumptions, gaps and unverified items, \d+-\d+ words/);
    });

    it('does NOT make it a required field of parseJsonResponse', () => {
        // Deliberate, and the reason is at the call site: `parseJsonResponse`
        // THROWS, which is right for `db_workload` because that field leads to a
        // database write. Discarding a nine-hundred-word report over one absent key
        // trades a degraded artefact for no artefact.
        expect(src).toContain("parseJsonResponse(rawText, ['private', 'public'])");
    });

    it('substitutes the declared-gap sentence when the model omits it', () => {
        expect(src).toContain('guardrails.NO_ASSUMPTIONS_DECLARED');
    });
});

// ── The document and the code must not drift apart ────────────────────────────

describe('AURA-GUARDRAILS.md agrees with the module', () => {
    it('states the same version and effective date', () => {
        expect(doc).toContain('Version ' + GUARDRAIL_VERSION);
        expect(doc).toContain('Effective ' + GUARDRAIL_EFFECTIVE);
    });

    it('has a §B conformance row for every one of the sixteen rules', () => {
        const ids = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7',
            '8', '9', '10', '11', '12', '13', '14', '15', '16'];
        for (const id of ids) {
            expect(doc, `no conformance row for rule ${id}`)
                .toMatch(new RegExp('^\\|\\s\\*\\*' + id + '\\*\\*', 'm'));
        }
    });

    it('carries its own assumptions block, per P1', () => {
        expect(doc).toContain('## Assumptions, gaps and unverified items');
    });

    it('points at the module that encodes it', () => {
        expect(doc).toContain('functions/guardrails.cjs');
    });
});
