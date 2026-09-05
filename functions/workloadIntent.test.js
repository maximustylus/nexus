import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const { mentionsQuantity, currentTurnRule, AU31_ASK, EMPTY_CARD } = require_('./workloadIntent.cjs');

// Verbatim from the three live runs. The card the model produced for a message
// with no figure in it, three times out of three.
const TURN_11_PARSED = {
    reply: 'I am proposing to log 35 patients for January against your personal workload. Please review the confirmation card and click to approve.',
    mode: 'DATA_ENTRY', diagnosis_ready: false, phase: null, energy: null, action: null,
    db_workload: { target_collection: 'staff_loads', target_doc: 'Alif', target_field: 'data', target_value: 35, target_month: 0 },
};

describe('mentionsQuantity — does the message carry a figure', () => {
    it.each([
        ['Log 35 patients for January against my workload.'],
        ['Actually make it 40, for February.'],
        ['make it 40'],
        ['thirty five for March please'],
        ['a dozen'],
        ['log twenty-two'],
        ['set it to zero'],
    ])('yes: %s', (t) => expect(mentionsQuantity(t)).toBe(true));

    it.each([
        ['Log my workload.'],
        ['Log my workload for January.'],
        ['same as last month'],
        ['update my cases'],
        [''],
        [null],
        [undefined],
    ])('no: %s', (t) => expect(mentionsQuantity(t)).toBe(false));
});

describe('currentTurnRule — the AU31 control', () => {
    it('turn 11: a filled card for "Log my workload." is discarded and the reply becomes a question', () => {
        const { parsed, suppressed } = currentTurnRule(TURN_11_PARSED, 'Log my workload.');
        expect(suppressed).toBe(true);
        expect(parsed.db_workload).toEqual(EMPTY_CARD);
        expect(parsed.reply).toBe(AU31_ASK);
        expect(parsed.action).toBeNull();
        // The rest of the contract is untouched.
        expect(parsed.mode).toBe('DATA_ENTRY');
        expect(parsed.diagnosis_ready).toBe(false);
    });

    it('turn 10: the same card for "Log 35 patients for January" passes untouched', () => {
        const r = currentTurnRule(TURN_11_PARSED, 'Log 35 patients for January against my workload.');
        expect(r.suppressed).toBe(false);
        expect(r.parsed).toBe(TURN_11_PARSED);
    });

    it('turn 12: "Actually make it 40, for February" carries a figure, so the month may carry too', () => {
        const card = { ...TURN_11_PARSED, db_workload: { ...TURN_11_PARSED.db_workload, target_value: 40, target_month: 1 } };
        expect(currentTurnRule(card, 'Actually make it 40, for February.').suppressed).toBe(false);
        expect(currentTurnRule(card, 'make it 40').suppressed).toBe(false);
    });

    it('an empty card is never touched, whatever the message', () => {
        const empty = { ...TURN_11_PARSED, db_workload: { ...EMPTY_CARD } };
        const r = currentTurnRule(empty, 'Log my workload.');
        expect(r.suppressed).toBe(false);
        expect(r.parsed).toBe(empty);
    });

    it('a numeric STRING counts as filled — this layer does not trust the prompt', () => {
        const str = { ...TURN_11_PARSED, db_workload: { ...TURN_11_PARSED.db_workload, target_value: '35' } };
        expect(currentTurnRule(str, 'Log my workload.').suppressed).toBe(true);
    });

    it.each([
        ['no db_workload', { reply: 'x' }],
        ['db_workload null', { reply: 'x', db_workload: null }],
        ['db_workload a string', { reply: 'x', db_workload: 'nope' }],
        ['parsed null', null],
        ['parsed undefined', undefined],
    ])('%s: passes through', (_l, parsed) => {
        const r = currentTurnRule(parsed, 'Log my workload.');
        expect(r.suppressed).toBe(false);
        expect(r.parsed).toBe(parsed);
    });

    it('does not mutate its input', () => {
        const before = JSON.stringify(TURN_11_PARSED);
        currentTurnRule(TURN_11_PARSED, 'Log my workload.');
        expect(JSON.stringify(TURN_11_PARSED)).toBe(before);
    });
});

describe('the wiring in chatWithAura, asserted at source', () => {
    const src = readFileSync(resolve(HERE, 'index.js'), 'utf8');
    const fn = src.slice(src.indexOf('exports.chatWithAura'), src.indexOf('exports.processFeedPost'));

    it('the rule runs after the parse and before the return', () => {
        const parse = fn.indexOf('parseJsonResponse(rawText');
        const rule = fn.indexOf('workloadIntent.currentTurnRule(result.parsed, userText)');
        const ret = fn.indexOf('text: result.text');
        expect(parse).toBeGreaterThan(-1);
        expect(rule).toBeGreaterThan(parse);
        expect(ret).toBeGreaterThan(rule);
    });

    it('a suppressed card replaces BOTH the text and the parsed object, so the client sees one story', () => {
        expect(fn).toContain('result = { text: JSON.stringify(turnRule.parsed), parsed: turnRule.parsed }');
    });

    it('the prompt says the number must be in the current message', () => {
        expect(src).toMatch(/The number MUST appear in the user\\'s CURRENT message/);
    });
});
