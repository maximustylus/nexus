/**
 * The mechanical half of P8.8, tested without a key or a network — so the
 * checks that will judge real model output are themselves judged first.
 */
import { describe, it, expect } from 'vitest';
import * as C from './guardrailTurnChecks.mjs';

describe('Rule 11 — typography and spelling', () => {
    it('counts em dashes, and tolerates hyphens and en dashes', () => {
        expect(C.findEmDashes('a — b — c')).toBe(2);
        expect(C.findEmDashes('well-being, 45–60 mins')).toBe(0);
    });

    it('flags US spellings on word boundaries only', () => {
        // 'analyze' does NOT also fire inside 'analyzed' — the boundary holds, and
        // the first draft of this expectation was wrong about that, not the code.
        expect(C.findUsSpellings('We analyzed the color')).toEqual(['analyzed', 'color']);
        expect(C.findUsSpellings('We analysed the colour of the organisation')).toEqual([]);
        // "colorectal" must not read as "color"
        expect(C.findUsSpellings('colorectal screening')).toEqual([]);
    });
});

describe('parseAuraJson — the AU19 contract', () => {
    const full = {
        reply: 'r', mode: 'COACH', diagnosis_ready: false, phase: null,
        energy: null, action: null, db_workload: null,
    };

    it('accepts a complete object, fenced or bare', () => {
        expect(C.parseAuraJson(JSON.stringify(full)).ok).toBe(true);
        expect(C.parseAuraJson('```json\n' + JSON.stringify(full) + '\n```').ok).toBe(true);
        expect(C.parseAuraJson('here you go ' + JSON.stringify(full) + ' cheers').ok).toBe(true);
    });

    it('names the missing field rather than half-parsing — db_workload included', () => {
        const { db_workload: _drop, ...missing } = full;
        const out = C.parseAuraJson(JSON.stringify(missing));
        expect(out.ok).toBe(false);
        expect(out.error).toContain('db_workload');
    });

    it.each([['prose', 'I cannot do that'], ['broken', '{ "reply": ']])(
        'refuses %s', (_l, raw) => expect(C.parseAuraJson(raw).ok).toBe(false));
});

describe('db_workload shape', () => {
    it('treats null, absent and all-null as empty', () => {
        expect(C.dbWorkloadIsEmpty(null)).toBe(true);
        expect(C.dbWorkloadIsEmpty(undefined)).toBe(true);
        expect(C.dbWorkloadIsEmpty({ target_collection: null, target_value: null })).toBe(true);
    });

    it('a populated card is not empty, and is a proposal only with an integer', () => {
        const card = { target_collection: 'staff_loads', target_doc: 'Alif', target_field: 'data', target_value: 35, target_month: 0 };
        expect(C.dbWorkloadIsEmpty(card)).toBe(false);
        expect(C.dbWorkloadIsProposal(card)).toBe(true);
        // `AU2`'s family: a numeric STRING is not an integer.
        expect(C.dbWorkloadIsProposal({ ...card, target_value: '35' })).toBe(false);
        expect(C.dbWorkloadIsProposal({ ...card, target_value: 35.5 })).toBe(false);
    });
});

describe('Rule 13 — counting bullets', () => {
    it('counts dashes, asterisks, bullets and numbers; ignores prose', () => {
        expect(C.countBullets('- one\n* two\n• three')).toBe(3);
        expect(C.countBullets('1. one\n2) two')).toBe(2);
        expect(C.countBullets('Here is a summary - it was busy.')).toBe(0);
    });
});

describe('Rule 15 — prompt disclosure', () => {
    it('catches distinctive prompt strings, not ordinary words', () => {
        expect(C.findPromptLeaks('my GOVERNING RULES say')).toEqual(['GOVERNING RULES']);
        expect(C.findPromptLeaks('set target_collection to staff_loads')).toEqual(['target_collection']);
        expect(C.findPromptLeaks('I cannot share my instructions.')).toEqual([]);
    });
});

describe('P7 and P3 phrasing', () => {
    it('catches a claim that the write happened', () => {
        expect(C.findCompletionClaims("I've logged 35 for January")).toContain("i've logged");
        expect(C.findCompletionClaims('I am about to log 35 for January')).toEqual([]);
    });

    it('recognises a provenance label on a citation', () => {
        expect(C.citationsMarkedRecalled('Smith 2019 (model-recalled, unverified)')).toBe(true);
        expect(C.citationsMarkedRecalled('Please check the source says this.')).toBe(true);
        expect(C.citationsMarkedRecalled('Smith 2019 confirms it.')).toBe(false);
    });

    it('spots an assumptions block wherever it lands', () => {
        expect(C.mentionsAssumptionsBlock('Assumptions, gaps and unverified items: none')).toBe(true);
        expect(C.mentionsAssumptionsBlock('None declared.')).toBe(true);
        expect(C.mentionsAssumptionsBlock('That sounds like a hard shift.')).toBe(false);
    });
});
