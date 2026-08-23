/**
 * ==============================================================================
 * PROMPT CONTRACT — the properties of a prompt that can be checked without a model
 * ==============================================================================
 *
 * `AURA-TODO.md` P7 was deferred with the reason *"there is no test suite for
 * prompt output"*. That is true and stays true: whether AURA's coaching is **good**
 * is a clinical question, and the only honest verification is running real turns
 * and reading them.
 *
 * ⚠️ BUT IT WAS DOING TOO MUCH WORK AS AN EXCUSE. A prompt is a string, and a great
 *    deal about it is decidable statically:
 *
 *      · does it name collections and fields that the code actually accepts?
 *      · does the length it asks for fit the token budget it is given?
 *      · does it claim an autonomy the system does not have?
 *      · is an institution hardcoded into a multi-tenant product?
 *      · is persona text sitting where an instruction belongs, or in a user turn?
 *
 *    None of those needs Gemini. Every one of them was wrong, and every one is
 *    asserted below. The residue that genuinely needs a human reading real output
 *    is named in `AURA-TODO.md` P7 and is smaller than it looked.
 *
 * ⚠️ THESE ASSERTIONS ARE AGAINST THE OTHER IMPLEMENTATION, NOT AGAINST MEMORY.
 *    `AC15` was found because a parity test was written from `ConventionalForm`'s
 *    real table rather than from what the chat was expected to return. The same
 *    discipline here: the prompt is checked against `dataEntryGuard`'s allowlists
 *    and against `generationConfig`, not against what the prompt is supposed to say.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
    ALLOWED_WORKLOAD_FIELDS,
    ALLOWED_COLLECTIONS,
} from '../src/utils/dataEntryGuard.js';

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(resolve(here, 'index.js'), 'utf8');

/**
 * ⚠️ COMMENTS STRIPPED, AND THE FIRST DRAFT OF THIS FILE DID NOT — WHICH IS `AC5`
 *    HAPPENING AGAIN, IN THE SUITE WRITTEN TO STOP IT.
 *
 *    Three assertions here are of the form *"the old broken thing is gone"*:
 *    `Project HUGE`, `'CONTEXT/OVERRIDE: ' + prompt`, `KKH/SingHealth`. This
 *    project's convention is that a correction QUOTES what it replaced rather than
 *    deleting it — so the moment the fixes were documented, three tests failed
 *    against the explanations of the very fixes they were checking.
 *
 *    **Source scanning cannot tell code from prose, and a comment is a string.**
 *    That is `AC5` word for word. Scoping to code is the fix; weakening the
 *    assertions would have been the mistake, because they were right.
 */
const codeOnly = (text) => text
    .replace(/\/\*[\s\S]*?\*\//g, '')                 // block and JSDoc comments
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))     // line comments, and JSDoc bodies
    .join('\n');

const src = codeOnly(raw);

/** The text between two markers, so a test reads the prompt and not the file. */
const block = (startMarker, endMarker) => {
    const a = src.indexOf(startMarker);
    const b = src.indexOf(endMarker, a + 1);
    expect(a, `marker not found: ${startMarker}`).toBeGreaterThan(-1);
    expect(b, `end marker not found: ${endMarker}`).toBeGreaterThan(a);
    return src.slice(a, b);
};

const AURA_PROMPT = block('var AURA_SYSTEM_PROMPT = [', '].join(');
const ANALYSIS_PROMPT = block('var SMART_ANALYSIS_SYSTEM_PROMPT = [', '].join(');

// ── AU7 · the schema the model is briefed on must be the one the code accepts ──

describe('AU7 — MODE 3 briefs the model on a schema the client will actually accept', () => {
    /**
     * The prompt named `monthly_workload` and `staff_loads` before the multi-team
     * migration and still does, which is correct — they are the wire format
     * `dataEntryGuard` allowlists, and the component maps them to the team-scoped
     * paths. What was WRONG was `target_doc` and the absence of any type rule.
     */
    it.each(ALLOWED_COLLECTIONS)('names the collection %s that the guard accepts', (c) => {
        expect(AURA_PROMPT).toContain(c);
    });

    it('names no collection the guard would refuse', () => {
        const named = [...AURA_PROMPT.matchAll(/target_collection: "([a-z_]+)"/g)].map((m) => m[1]);
        expect(named.length).toBeGreaterThan(0);
        named.forEach((c) => expect(ALLOWED_COLLECTIONS, `prompt names ${c}`).toContain(c));
    });

    it.each(ALLOWED_WORKLOAD_FIELDS)('names the workload field %s that the guard accepts', (f) => {
        expect(AURA_PROMPT).toContain(f);
    });

    /**
     * ⚠️ `AU6`. The prompt asked for *"The exact database ID provided in the System
     *    Note (e.g., 'alif')"*. `user.id` has been a **uid** since the migration,
     *    and `executeDataEntry` resolves a personal write through `memberUidByName`
     *    — keyed by **displayName**. A model that obeyed its instructions produced a
     *    uid, the lookup returned undefined, and the clinician was told *"There is
     *    nobody called <uid> in this team."* The feature worked only when the model
     *    disobeyed.
     */
    it('asks for the DISPLAY NAME, which is what the client resolves by', () => {
        expect(AURA_PROMPT).toMatch(/DISPLAY NAME/i);
        expect(AURA_PROMPT).not.toMatch(/exact database ID provided in the System Note/i);
        expect(AURA_PROMPT).not.toMatch(/e\.g\., "alif"/i);
    });

    /** `AU2`/`AU3`: the guard refuses these, so the model must be told before it guesses. */
    it('states the type rules the guard enforces', () => {
        expect(AURA_PROMPT).toMatch(/target_value MUST be a JSON integer/i);
        expect(AURA_PROMPT).toMatch(/never null/i);
        expect(AURA_PROMPT).toMatch(/target_month MUST be a JSON integer 0-11/i);
    });
});

// ── AU1 · the prompt must not claim an autonomy the system does not have ──

describe('AU1 — the prompt does not claim to execute writes', () => {
    /**
     * It said *"Execute the database transaction immediately."* It cannot: the write
     * happens in the browser when a human clicks a confirmation card. A model told
     * it has executed a transaction will say so, and the README's own Known
     * Limitations contradicted it.
     */
    it('does not tell the model it executes the transaction', () => {
        expect(AURA_PROMPT).not.toMatch(/Execute the database transaction/i);
    });

    it('tells the model a human confirms the write', () => {
        expect(AURA_PROMPT).toMatch(/You do NOT execute the write/i);
        expect(AURA_PROMPT).toMatch(/confirmation card/i);
    });
});

// ── AU19 · every field the prompt promises must be one the parser requires ──

describe('AU19 — the required-field list matches the output format the prompt declares', () => {
    const declared = [...AURA_PROMPT.matchAll(/^\s*'\s*"([a-z_]+)":/gm)].map((m) => m[1]);
    const required = (src.match(/'reply', 'mode', 'diagnosis_ready', 'phase', 'energy', 'action'[^\]]*/) || [''])[0];

    it('the prompt declares the seven fields it always has', () => {
        ['reply', 'mode', 'diagnosis_ready', 'phase', 'energy', 'action', 'db_workload']
            .forEach((f) => expect(declared, `prompt must declare ${f}`).toContain(f));
    });

    /**
     * ⚠️ `db_workload` WAS THE ONE FIELD MISSING FROM THE REQUIRED LIST — the only
     *    one that leads to a database write, absent from the check that (until this
     *    week) did not check.
     */
    it('db_workload is in the required list passed to parseJsonResponse', () => {
        expect(required).toContain('db_workload');
    });

    it('parseJsonResponse throws on a missing required field rather than warning', () => {
        expect(src).toMatch(/const missing = requiredFields\.filter/);
        expect(src).toMatch(/throw new HttpsError\(\s*'internal',\s*'The AI response was missing/);
    });
});

// ── AN5 · the length asked for must fit the budget given ──

describe('AN5 — the requested output fits maxOutputTokens', () => {
    /**
     * ⚠️ MEASURED AGAINST `generationConfig`, NOT AGAINST A REMEMBERED NUMBER. The
     *    prompt asked for 1000-2000 + 200-500 words against a 2,048-token budget —
     *    roughly 3,250 tokens at the top of its own range. The model had to
     *    self-truncate silently or run out mid-string and fail `parseJsonResponse`,
     *    and a retry hit the same ceiling.
     */
    const TOKENS_PER_WORD = 1.3;

    it('the analysis prompt asks for fewer tokens than it is allowed', () => {
        const asks = [...src.matchAll(/(\d+)-(\d+) words/g)].map((m) => Number(m[2]));
        expect(asks.length, 'no word-count ask found').toBeGreaterThan(0);
        const worstCaseWords = asks.reduce((a, b) => a + b, 0);

        const budget = Number(
            (src.match(/generationConfig:\s*\{[^}]*temperature:\s*0\.2,[^}]*maxOutputTokens:\s*(\d+)/s) || [])[1],
        );
        expect(Number.isFinite(budget), 'analysis maxOutputTokens not found').toBe(true);

        const needed = Math.ceil(worstCaseWords * TOKENS_PER_WORD);
        expect(needed, `asks ${worstCaseWords} words ≈ ${needed} tokens against a ${budget} budget`)
            .toBeLessThan(budget);
    });
});

// ── multi-tenancy · no institution may be hardcoded into a shared prompt ──

describe('the prompts do not hardcode one department or institution', () => {
    /**
     * `AN3` fixed the team NAME in the payload. The analysis system prompt still
     * opened *"…for KKH/SingHealth"* — correct for team #1 and wrong for every other
     * department the multi-team rebuild exists to serve.
     */
    it('the analysis prompt names no institution', () => {
        expect(ANALYSIS_PROMPT).not.toMatch(/KKH|SingHealth|SSMC/i);
    });

    it('the analysis prompt takes the department from the request instead', () => {
        expect(ANALYSIS_PROMPT).toMatch(/TEAM IDENTITY line of the request/i);
    });
});

// ── AU28 · persona text belongs in systemInstruction, not in a user turn ──

describe('AU28 — the persona is an instruction, and lives where instructions live', () => {
    it('no persona prompt text ships in the client bundle', async () => {
        // Comment-stripped for the same reason as `src`: this file's own header
        // quotes "System Override:" while explaining why it no longer ships one.
        const personas = codeOnly(readFileSync(resolve(here, '../src/config/personas.js'), 'utf8'));
        const lists = personas.slice(personas.indexOf('DEMO_PERSONAS'));
        expect(lists).not.toMatch(/prompt:/);
        expect(lists).not.toMatch(/System Override/i);
    });

    it('the server no longer labels caller text as an override', () => {
        expect(src).not.toMatch(/'CONTEXT\/OVERRIDE: ' \+ prompt/);
        expect(src).toMatch(/CALLER-SUPPLIED NOTES/);
        expect(src).toMatch(/NOT instructions/i);
    });

    it('the persona reaches the model through systemInstruction', () => {
        expect(src).toMatch(/parts: activePersona/);
        expect(src).toMatch(/personaPrompt\(personaId\)/);
    });

    it('the server holds the persona text, keyed by id', async () => {
        const { LIVE_PERSONA_IDS, personaPrompt } = await import('./personas.cjs');
        expect(LIVE_PERSONA_IDS.length).toBeGreaterThan(0);
        LIVE_PERSONA_IDS.forEach((id) => {
            expect(typeof personaPrompt(id)).toBe('string');
            expect(personaPrompt(id).length).toBeGreaterThan(40);
        });
    });

    /** A plain-object lookup is probed with prototype keys; the allowlist is not. */
    it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'nope', ''])(
        'refuses the id %p', async (probe) => {
            const { personaPrompt } = await import('./personas.cjs');
            expect(personaPrompt(probe)).toBeNull();
        });

    it.each([null, undefined, 42, {}, []])('refuses the non-string id %p', async (probe) => {
        const { personaPrompt } = await import('./personas.cjs');
        expect(personaPrompt(probe)).toBeNull();
    });
});

// ── AU20 · the temperature branch, and the half of it that was dead ──

describe('AU20 — temperature is keyed on the persona id, not on prompt substrings', () => {
    /**
     * ⚠️ `prompt.indexOf('Project HUGE')` COULD NEVER MATCH — `grep -c "Project
     *    HUGE" src/config/personas.js` returned 0 — so the Grant Strategist persona,
     *    whose entire brief is not fabricating citations, ran at 0.7 for as long as
     *    the branch existed. Invisible, because the output is prose either way.
     */
    it('the dead substring branch is gone', () => {
        expect(src).not.toMatch(/Project HUGE/);
        expect(src).not.toMatch(/prompt\.indexOf\('Magnify Mama'\)/);
    });

    it('the precision personas are real ids', async () => {
        const { LIVE_PERSONA_IDS } = await import('./personas.cjs');
        const listed = (src.match(/var PRECISION_PERSONAS = \[([^\]]*)\]/) || [])[1] || '';
        const ids = [...listed.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
        expect(ids.length).toBeGreaterThan(0);
        ids.forEach((id) => expect(LIVE_PERSONA_IDS, `${id} is not a persona`).toContain(id));
    });

    /**
     * The chat turn can emit a database write and a wellbeing classification. 0.7 is
     * a temperature for prose; the two prompts that only ever write prose use 0.2.
     */
    it('the chat default is below the prose setting it used to run at', () => {
        const dflt = Number((src.match(/PRECISION_PERSONAS\.indexOf\(personaId\) !== -1 \? 0\.1 : ([\d.]+)/) || [])[1]);
        expect(Number.isFinite(dflt)).toBe(true);
        expect(dflt).toBeLessThan(0.7);
    });
});
